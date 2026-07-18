// src/components/Reportes/modales/ModalSubirComprobanteTrabajador.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPaperclip,
  faTrash,
  faXmark,
  faFloppyDisk,
  faUpload,
  faFilePdf,
  faImage,
} from "@fortawesome/free-solid-svg-icons";

import "../../Trabajadores/modales/ModalEditarTrabajador.css";
import "./ModalComprobantePago.css";
import "./ModalSubirComprobanteTrabajador.css";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

function isPdf(fileOrName = "") {
  const s = String(fileOrName?.name ?? fileOrName ?? "").toLowerCase();
  return s.endsWith(".pdf") || s.includes("application/pdf");
}

function formatBytes(bytes = 0) {
  const b = Number(bytes) || 0;
  if (!b) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let n = b;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

export default function ModalSubirComprobanteTrabajador({
  open,
  trabajador,
  periodo,
  onClose,
  onConfirm,
  showToast,
  loading = false,
}) {
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  const id = useMemo(() => trabajador?.id ?? null, [trabajador?.id]);
  const nombre = useMemo(() => {
    const full = `${trabajador?.nombre ?? ""} ${trabajador?.apellido ?? ""}`.trim();
    return full || "Trabajador";
  }, [trabajador]);

  const periodoTxt = useMemo(() => {
    const p = periodo || trabajador?.periodo_comprobante || null;
    if (!p) return "";
    return p.label || `${p.mes || "Mes"} / ${p.anio || "Año"}`;
  }, [periodo, trabajador]);

  const periodoValido = useMemo(() => {
    const p = periodo || trabajador?.periodo_comprobante || null;
    const anio = Number(p?.anio || 0);
    const mes = Number(p?.mes || p?.id_mes || 0);
    return Number.isInteger(anio) && anio >= 2000 && anio <= 2100 && Number.isInteger(mes) && mes >= 1 && mes <= 12;
  }, [periodo, trabajador]);

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setDragOver(false);
    if (fileRef.current) fileRef.current.value = "";
  }, [open, id, periodoTxt]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && closeSafe();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loading]);

  const closeSafe = () => {
    if (loading) return;
    onClose?.();
  };

  const validarYSetFile = (f) => {
    if (!f) return;

    const mimeOk = !f.type || ALLOWED.includes(f.type);
    const extOk = /\.(pdf|jpe?g|png|webp)$/i.test(f.name || "");

    if (!mimeOk && !extOk) {
      setFile(null);
      showToast?.("error", "Tipo de archivo no permitido. Usá PDF, JPG, PNG o WEBP.");
      return;
    }

    if (!f.size || f.size > MAX_BYTES) {
      setFile(null);
      showToast?.("error", "El comprobante debe pesar hasta 8MB.");
      return;
    }

    setFile(f);
  };

  const pickFile = () => {
    if (loading) return;
    fileRef.current?.click?.();
  };

  const onFileChange = (e) => {
    validarYSetFile(e.target.files?.[0] || null);
  };

  const removeSelectedFile = () => {
    if (loading) return;
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const submit = async (e) => {
    e?.preventDefault?.();
    if (loading) return;
    if (!id) return showToast?.("error", "Trabajador inválido.");
    if (!periodoValido) return showToast?.("advertencia", "Seleccioná un año y un mes puntual para este comprobante.");
    if (!file) return showToast?.("advertencia", "Seleccioná o arrastrá un comprobante.");

    const p = periodo || trabajador?.periodo_comprobante || {};
    const mes = Number(p.mes || p.id_mes || 0);
    const anio = Number(p.anio || 0);

    const fd = new FormData();
    fd.append("id_trabajador", String(id));
    fd.append("id_mes", String(mes));
    fd.append("mes", String(mes));
    fd.append("anio", String(anio));
    fd.append("comprobante", file);

    await onConfirm?.(fd);
  };

  if (!open) return null;

  const pdfSelected = file ? isPdf(file) : false;

  return (
    <div
      className="mi-modal__overlay"
      onClick={(e) => e.target.classList.contains("mi-modal__overlay") && closeSafe()}
    >
      <div
        className="mi-modal__container"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mi-modal__header">
          <div className="mi-modal__head-left">
            <h2 className="mi-modal__title">Comprobante del trabajador</h2>
            <p className="mi-modal__subtitle">
              ID: {id ?? "-"} &nbsp;|&nbsp; {nombre}
              {periodoTxt ? <> &nbsp;|&nbsp; Pago de {periodoTxt}</> : null}
            </p>
          </div>

          <button className="mi-modal__close" onClick={closeSafe} aria-label="Cerrar">
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        <form className="mit-modal__body" onSubmit={submit}>
          <div className="mi-tabpanel is-active">
            <div className="mi-grid">
              <article className="mi-card mi-card--full">
                <h3 className="mi-card__title">
                  <FontAwesomeIcon icon={faPaperclip} /> &nbsp;Subir comprobante
                </h3>

                {periodoTxt ? (
                  <div className="cmp-periodo">Este comprobante queda registrado solo para: <b>{periodoTxt}</b>.</div>
                ) : (
                  <div className="cmp-warning">Seleccioná un año y un mes puntual antes de cargar el comprobante.</div>
                )}

                <div className="cmp-box">
                  <div className="cmp-head">
                    <div className="cmp-title">
                      <FontAwesomeIcon icon={faUpload} /> Archivo
                    </div>
                    <div className="cmp-hint">PDF / JPG / PNG / WEBP (hasta 8MB)</div>
                  </div>

                  <div
                    className={`cmp-drop mtc-drop ${dragOver ? "is-over" : ""}`}
                    role="button"
                    tabIndex={0}
                    onClick={pickFile}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && pickFile()}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (!loading) setDragOver(true);
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOver(false);
                      validarYSetFile(e.dataTransfer?.files?.[0] || null);
                    }}
                    aria-disabled={loading}
                  >
                    <input
                      ref={fileRef}
                      className="cmp-inputfile"
                      type="file"
                      accept="application/pdf,image/jpeg,image/png,image/webp"
                      onChange={onFileChange}
                    />

                    <div className="cmp-drop__icon">
                      <FontAwesomeIcon icon={faPaperclip} />
                    </div>

                    <div className="cmp-drop__text">
                      <b>{file ? file.name : "Arrastrá el comprobante o hacé click"}</b>
                      <span>{file ? formatBytes(file.size) : "Queda registrado para el mes seleccionado."}</span>
                    </div>

                    <div className="cmp-drop__btn">Elegir</div>
                  </div>

                  {file ? (
                    <div className="cmp-file">
                      <div className="cmp-file__left">
                        <div className={`cmp-badge ${pdfSelected ? "is-pdf" : "is-img"}`}>
                          <FontAwesomeIcon icon={pdfSelected ? faFilePdf : faImage} />
                        </div>
                        <div className="cmp-file__meta">
                          <div className="cmp-file__name" title={file.name}>{file.name}</div>
                          <div className="cmp-file__size">{formatBytes(file.size)}</div>
                        </div>
                      </div>

                      <button
                        type="button"
                        className="cmp-remove"
                        onClick={removeSelectedFile}
                        disabled={loading}
                        title="Quitar archivo"
                      >
                        <FontAwesomeIcon icon={faTrash} />
                      </button>
                    </div>
                  ) : (
                    <div className="cmp-empty">Todavía no seleccionaste ningún archivo.</div>
                  )}

                </div>
              </article>
            </div>
          </div>

          <div className="mit-actions">
            <button type="button" className="mit-btn mit-btn--ghost" onClick={closeSafe} disabled={loading}>
              Cancelar
            </button>
            <button type="submit" className="mit-btn mit-btn--solid" disabled={loading || !file || !periodoValido}>
              <FontAwesomeIcon icon={faFloppyDisk} /> {loading ? "Guardando..." : "Guardar comprobante"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
