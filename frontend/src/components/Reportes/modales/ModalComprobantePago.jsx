// src/components/Reportes/modales/ModalComprobantePago.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPaperclip,
  faTrash,
  faXmark,
  faFloppyDisk,
  faEye,
  faUpload,
  faFilePdf,
  faImage,
} from "@fortawesome/free-solid-svg-icons";

// ✅ Reutiliza estética base (mi-modal__*, mit-actions, fl-*, etc.)
import "../../Trabajadores/modales/ModalEditarTrabajador.css";

// ✅ Solo estilos específicos del comprobante (cmp-*)
import "./ModalComprobantePago.css";

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

export default function ModalComprobantePago({
  open,
  onClose,
  onConfirm, // (FormData) => Promise
  loading = false,
  item = null, // pago seleccionado
  buildFileUrl, // helper
}) {
  const fileRef = useRef(null);

  const [file, setFile] = useState(null);
  const [deleteCurrent, setDeleteCurrent] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setDeleteCurrent(false);
    if (fileRef.current) fileRef.current.value = "";
  }, [open, item?.id, item?.id_pago]);

  // ESC cierra
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && closeSafe();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loading]);

  const id = useMemo(() => item?.id ?? item?.id_pago ?? null, [item?.id, item?.id_pago]);

  const currentUrl = useMemo(() => {
    const p = String(item?.comprobante || "").trim();
    if (!p) return "";
    return buildFileUrl ? buildFileUrl(p) : p;
  }, [item?.comprobante, buildFileUrl]);

  const tituloPago = useMemo(() => {
    const c = (item?.concepto || "").trim();
    return c || "Pago";
  }, [item?.concepto]);

  const closeSafe = () => {
    if (loading) return;
    onClose?.();
  };

  const pickFile = () => {
    if (loading) return;
    fileRef.current?.click?.();
  };

  const onFileChange = (e) => {
    const f = e.target.files?.[0] || null;
    setFile(f);

    // Si elige un archivo, normalmente NO querés borrar el actual
    // (pero te lo dejo libre: si el usuario marca borrar, se enviarán ambos flags)
  };

  const removeSelectedFile = () => {
    if (loading) return;
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const submit = async (e) => {
    e?.preventDefault?.();
    if (loading) return;
    if (!id) return;

    if (!file && !deleteCurrent) return;

    const fd = new FormData();
    fd.append("id", String(id));
    if (deleteCurrent) fd.append("delete_comprobante", "1");
    if (file) fd.append("comprobante", file);

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
        {/* Header (igual estilo que el otro modal) */}
        <div className="mi-modal__header">
          <div className="mi-modal__head-left">
            <h2 className="mi-modal__title">Comprobante de pago</h2>
            <p className="mi-modal__subtitle">
              ID: {id ?? "-"} &nbsp;|&nbsp; {tituloPago}
              {item?.fecha ? ` &nbsp;|&nbsp; ${item.fecha}` : ""}
            </p>
          </div>

          <button className="mi-modal__close" onClick={closeSafe} aria-label="Cerrar">
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        {/* Body */}
        <form className="mit-modal__body" onSubmit={submit}>
          <div className="mi-tabpanel is-active">
            <div className="mi-grid">
              {/* Card resumen */}
              <article className="mi-card">
                <h3 className="mi-card__title">
                  <FontAwesomeIcon icon={faPaperclip} /> &nbsp;Resumen
                </h3>

                <div className="fl-grid">
                  <div className="fl-field fl-col-full">
                    <input
                      className="fl-input"
                      placeholder=" "
                      value={tituloPago}
                      disabled
                      readOnly
                    />
                    <label className="fl-label">Concepto</label>
                  </div>

                  <div className="fl-field">
                    <input className="fl-input" placeholder=" " value={id ?? ""} disabled readOnly />
                    <label className="fl-label">ID Pago</label>
                  </div>

                  <div className="fl-field">
                    <input
                      className="fl-input"
                      placeholder=" "
                      value={item?.fecha ?? ""}
                      disabled
                      readOnly
                    />
                    <label className="fl-label">Fecha</label>
                  </div>

                  <div className="fl-field fl-col-full">
                    {currentUrl ? (
                      <a className="mcp-linklike" href={currentUrl} target="_blank" rel="noreferrer">
                        <FontAwesomeIcon icon={faEye} /> Ver comprobante actual
                      </a>
                    ) : (
                      <div className="mcp-muted">No hay comprobante cargado.</div>
                    )}
                  </div>
                </div>
              </article>

              {/* Card comprobante */}
              <article className="mi-card">
                <h3 className="mi-card__title">Comprobante</h3>

                <div className={`cmp-box ${deleteCurrent ? "is-error" : ""}`}>
                  <div className="cmp-head">
                    <div className="cmp-title">
                      <FontAwesomeIcon icon={faUpload} /> Subir archivo
                    </div>
                    <div className="cmp-hint">PDF / JPG / PNG / WEBP (hasta 8MB)</div>
                  </div>

                  {/* Dropzone */}
                  <div
                    className="cmp-drop"
                    role="button"
                    tabIndex={0}
                    onClick={pickFile}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && pickFile()}
                    aria-disabled={loading}
                  >
                    <div className="cmp-drop__icon">
                      <FontAwesomeIcon icon={faPaperclip} />
                    </div>

                    <div className="cmp-drop__text">
                      <b>{file ? "Archivo seleccionado" : "Seleccioná un archivo"}</b>
                      <span>{file ? "" : ""}</span>
                    </div>

                    <div className="cmp-drop__btn">
                      {file ? "Cambiar" : "Elegir archivo"}
                    </div>

                    <input
                      ref={fileRef}
                      className="cmp-inputfile"
                      type="file"
                      accept="application/pdf,image/*"
                      onChange={onFileChange}
                      disabled={loading}
                    />
                  </div>

                  {/* File chip */}
                  {file ? (
                    <div className="cmp-file">
                      <div className="cmp-file__left">
                        <div className={`cmp-badge ${pdfSelected ? "is-pdf" : "is-img"}`}>
                          <FontAwesomeIcon icon={pdfSelected ? faFilePdf : faImage} />
                        </div>

                        <div className="cmp-file__meta">
                          <div className="cmp-file__name" title={file.name}>
                            {file.name}
                          </div>
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
                        <FontAwesomeIcon icon={faXmark} />
                      </button>
                    </div>
                  ) : (
                    <div className="cmp-empty">No hay archivo nuevo seleccionado.</div>
                  )}

                  {/* Delete current (chip) */}
                  {currentUrl ? (
                    <>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
                        <div className="cmp-actions">
                          <button
                            type="button"
                            className={`cmp-chip ${deleteCurrent ? "is-on" : ""}`}
                            onClick={() => !loading && setDeleteCurrent((v) => !v)}
                            disabled={loading}
                            title="Marcar para eliminar el comprobante actual"
                          >
                            <span className="cmp-chip__icon">
                              <FontAwesomeIcon icon={faTrash} />
                            </span>
                            Eliminar comprobante actual
                          </button>
                        </div>
                      </div>

                      {deleteCurrent ? (
                        <div className="cmp-warning">
                          Atención: al guardar, se eliminará el comprobante actual.
                          {file ? " También se subirá el archivo nuevo seleccionado." : ""}
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </article>
            </div>
          </div>

          {/* Footer acciones (mismo estilo) */}
          <div className="mit-actions">
            <button
              type="button"
              className="mit-btn mit-btn--ghost"
              onClick={closeSafe}
              disabled={loading}
            >
              Cancelar
            </button>

            <button
              type="submit"
              className="mit-btn mit-btn--solid"
              disabled={loading || (!file && !deleteCurrent)}
              title={!file && !deleteCurrent ? "Seleccioná un archivo o marcá eliminar" : "Guardar"}
            >
              <FontAwesomeIcon icon={faFloppyDisk} /> {loading ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
