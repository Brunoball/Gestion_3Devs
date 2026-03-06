// ✅ REEMPLAZAR COMPLETO
// src/components/Contable/modales/ModalNuevoEgreso.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faMoneyBillTransfer,
  faSave,
  faTimes,
  faPaperclip,
  faFilePdf,
  faImage,
  faUser,
} from "@fortawesome/free-solid-svg-icons";

import "../../Trabajadores/modales/ModalEditarTrabajador.css";
import Toast from "../../Global/Toast";

export default function ModalNuevoEgreso({
  open,
  onClose,
  onConfirm,
  loading,
  medios = [],
  trabajadores = [],
}) {
  const firstRef = useRef(null);

  const hoyISO = useMemo(() => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }, []);

  const [fecha, setFecha] = useState(hoyISO);
  const [concepto, setConcepto] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [monto, setMonto] = useState("");
  const [idMedio, setIdMedio] = useState("");
  const [idTrabajador, setIdTrabajador] = useState("");
  const [comprobanteFile, setComprobanteFile] = useState(null);

  const toUpperLive = (v) => String(v ?? "").toUpperCase();

  const [toast, setToast] = useState({
    open: false,
    type: "danger",
    message: "",
  });

  const closeToast = useCallback(() => {
    setToast({ open: false, type: "danger", message: "" });
  }, []);

  const showError = useCallback((msg) => {
    const m = String(msg || "").trim();
    if (!m) return;
    setToast({ open: true, type: "danger", message: m });
  }, []);

  const trabajadoresOrdenados = useMemo(() => {
    return [...(Array.isArray(trabajadores) ? trabajadores : [])].sort((a, b) => {
      const aa = `${a?.apellido || ""} ${a?.nombre || ""}`.trim().toLowerCase();
      const bb = `${b?.apellido || ""} ${b?.nombre || ""}`.trim().toLowerCase();
      return aa.localeCompare(bb, "es");
    });
  }, [trabajadores]);

  const subtitle = useMemo(() => {
    const c = (concepto || "").trim();
    const m = (monto || "").toString().trim();
    if (!c && !m) return "Completá los datos del egreso";
    return `${c || "Egreso"}${m ? ` • $${m}` : ""}`;
  }, [concepto, monto]);

  useEffect(() => {
    if (!open) return;

    closeToast();
    setFecha(hoyISO);
    setConcepto("");
    setDescripcion("");
    setMonto("");
    setIdMedio("");
    setIdTrabajador("");
    setComprobanteFile(null);

    setTimeout(() => firstRef.current?.focus(), 0);
  }, [open, hoyISO, closeToast]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && cerrar();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loading]);

  const cerrar = () => {
    if (loading) return;
    onClose?.();
  };

  const onPickFile = (e) => {
    const f = e.target.files?.[0] || null;

    if (!f) {
      setComprobanteFile(null);
      return;
    }

    const allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(f.type)) {
      setComprobanteFile(null);
      showError("Solo se permite PDF o imágenes (JPG/PNG/WEBP).");
      return;
    }

    if (f.size > 8 * 1024 * 1024) {
      setComprobanteFile(null);
      showError("El archivo no puede pesar más de 8MB.");
      return;
    }

    setComprobanteFile(f);
  };

  const submit = (e) => {
    e?.preventDefault?.();

    if (!fecha || !concepto.trim() || monto === "" || monto === null) {
      return showError("Completá todos los campos obligatorios (*).");
    }

    const montoNum = Number(String(monto).replace(",", "."));
    if (!Number.isFinite(montoNum) || montoNum <= 0) {
      return showError("El monto debe ser un número mayor a 0.");
    }

    const fd = new FormData();
    fd.append("fecha", fecha);
    fd.append("concepto", concepto.trim());
    fd.append("descripcion", (descripcion || "").trim());
    fd.append("monto", String(montoNum));
    fd.append("id_medio_pago", idMedio ? String(Number(idMedio)) : "");
    fd.append("id_trabajador", idTrabajador ? String(Number(idTrabajador)) : "");
    if (comprobanteFile) fd.append("comprobante", comprobanteFile);

    onConfirm?.(fd);
  };

  if (!open) return null;

  const isPdf = comprobanteFile?.type === "application/pdf";
  const isImg = comprobanteFile?.type?.startsWith("image/");

  return (
    <div
      className="mi-modal__overlay"
      onClick={(e) => e.target.classList.contains("mi-modal__overlay") && cerrar()}
    >
      {toast.open && toast.message ? (
        <Toast
          open
          show
          type={toast.type}
          variant={toast.type}
          duration={3200}
          duracion={3200}
          text={toast.message}
          texto={toast.message}
          message={toast.message}
          mensaje={toast.message}
          onClose={closeToast}
          onHide={closeToast}
        >
          {toast.message}
        </Toast>
      ) : null}

      <div
        className="mi-modal__container"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mi-modal__header">
          <div className="mi-modal__head-left">
            <h2 className="mi-modal__title">
              <FontAwesomeIcon icon={faMoneyBillTransfer} /> Nuevo egreso
            </h2>
            <p className="mi-modal__subtitle">{subtitle}</p>
          </div>

          <button
            className="mi-modal__close"
            onClick={cerrar}
            aria-label="Cerrar"
            disabled={loading}
            type="button"
            title="Cerrar"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form className="mit-modal__body" onSubmit={submit}>
          <div className="mi-tabpanel is-active">
            <div className="mi-grid">
              <article className="mi-card">
                <h3 className="mi-card__title">Datos del egreso</h3>

                <div className="fl-grid">
                  <div className="fl-field">
                    <input
                      ref={firstRef}
                      className="fl-input"
                      type="date"
                      placeholder=" "
                      value={fecha}
                      onChange={(e) => setFecha(e.target.value)}
                      disabled={loading}
                    />
                    <label className="fl-label">Fecha *</label>
                  </div>

                  <div className="fl-field">
                    <input
                      className="fl-input"
                      type="number"
                      inputMode="decimal"
                      placeholder=" "
                      value={monto}
                      onChange={(e) => setMonto(e.target.value)}
                      disabled={loading}
                    />
                    <label className="fl-label">Monto *</label>
                  </div>

                  <div className="fl-field fl-col-full">
                    <input
                      className="fl-input"
                      type="text"
                      placeholder=" "
                      value={concepto}
                      onChange={(e) => setConcepto(toUpperLive(e.target.value))}
                      disabled={loading}
                    />
                    <label className="fl-label">Concepto *</label>
                  </div>
                </div>
              </article>

              <article className="mi-card">
                <h3 className="mi-card__title">Detalles</h3>

                <div className="fl-grid">
                  <div className="fl-field fl-col-full">
                    <textarea
                      className="fl-input"
                      style={{ resize: "vertical" }}
                      placeholder=" "
                      value={descripcion}
                      onChange={(e) => setDescripcion(toUpperLive(e.target.value))}
                      disabled={loading}
                    />
                    <label className="fl-label">Descripción (opcional)</label>
                  </div>

                  <div className="fl-field fl-col-full">
                    <select
                      className="fl-input fl-select"
                      value={idMedio}
                      onChange={(e) => setIdMedio(e.target.value)}
                      disabled={loading || !medios?.length}
                    >
                      <option value="">(Sin medio)</option>
                      {medios.map((m) => (
                        <option key={m.id ?? m.id_medio_pago} value={m.id ?? m.id_medio_pago}>
                          {m.nombre ?? m.medio ?? ""}
                        </option>
                      ))}
                    </select>
                    <label className="fl-label">Medio de pago (opcional)</label>
                  </div>

                  <div className="fl-field fl-col-full">
                    <select
                      className="fl-input fl-select"
                      value={idTrabajador}
                      onChange={(e) => setIdTrabajador(e.target.value)}
                      disabled={loading || !trabajadoresOrdenados.length}
                    >
                      <option value="">(Sin trabajador asignado)</option>
                      {trabajadoresOrdenados.map((t) => (
                        <option key={t.id} value={t.id}>
                          {`${t.apellido || ""} ${t.nombre || ""}`.trim()}
                        </option>
                      ))}
                    </select>
                    <label className="fl-label">
                      <FontAwesomeIcon icon={faUser} /> Trabajador que pagó el gasto
                    </label>
                  </div>
                </div>
              </article>

              <article className="mi-card mi-card--fullsd">
                <h3 className="mi-card__title">Comprobante</h3>

                <div className="fl-grid">
                  <div className="fl-field fl-col-full">
                    <div className="cmp-box">
                      <div className="cmp-head">
                        <label className="cmp-title">
                          <FontAwesomeIcon icon={faPaperclip} /> Archivo (opcional)
                        </label>
                        <span className="cmp-hint">PDF o imagen • máx 8MB</span>
                      </div>

                      <label className="cmp-drop">
                        <input
                          className="cmp-inputfile"
                          type="file"
                          accept="application/pdf,image/*"
                          onChange={onPickFile}
                          disabled={loading}
                        />

                        <div className="cmp-drop__icon">
                          <FontAwesomeIcon icon={faPaperclip} />
                        </div>

                        <div className="cmp-drop__text">
                          <b>Seleccioná un archivo</b>
                          <span>o arrastralo acá</span>
                        </div>

                        <div className="cmp-drop__btn">Elegir archivo</div>
                      </label>

                      {comprobanteFile ? (
                        <div className="cmp-file">
                          <div className="cmp-file__left">
                            <div className={`cmp-badge ${isPdf ? "is-pdf" : isImg ? "is-img" : ""}`}>
                              <FontAwesomeIcon
                                icon={isPdf ? faFilePdf : isImg ? faImage : faPaperclip}
                              />
                            </div>

                            <div className="cmp-file__meta">
                              <div className="cmp-file__name" title={comprobanteFile.name}>
                                {comprobanteFile.name}
                              </div>
                              <div className="cmp-file__size">
                                {Math.round(comprobanteFile.size / 1024)} KB
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            className="cmp-remove"
                            onClick={() => setComprobanteFile(null)}
                            disabled={loading}
                            title="Quitar archivo"
                          >
                            <FontAwesomeIcon icon={faTimes} />
                          </button>
                        </div>
                      ) : (
                        <div className="cmp-empty">Sin archivo adjunto</div>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            </div>
          </div>

          <div className="mit-actions">
            <button
              type="button"
              className="mit-btn mit-btn--ghost"
              onClick={cerrar}
              disabled={loading}
            >
              <FontAwesomeIcon icon={faTimes} /> Cancelar
            </button>

            <button type="submit" className="mit-btn mit-btn--solid" disabled={loading}>
              <FontAwesomeIcon icon={faSave} /> {loading ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}