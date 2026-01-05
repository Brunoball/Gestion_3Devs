// src/components/Contable/modales/ModalNuevoEgreso.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faMoneyBillTransfer,
  faSave,
  faTimes,
  faPaperclip,
  faFilePdf,
  faImage,
} from "@fortawesome/free-solid-svg-icons";

import "../../Trabajadores/modales/ModalEditarTrabajador.css";

export default function ModalNuevoEgreso({
  open,
  onClose,
  onConfirm,
  loading,
  medios = [],
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
  const [comprobanteFile, setComprobanteFile] = useState(null);
  const [error, setError] = useState("");

  // ✅ helper: convierte a MAYÚSCULAS “en vivo”
  const toUpperLive = (v) => String(v ?? "").toUpperCase();

  const subtitle = useMemo(() => {
    const c = (concepto || "").trim();
    const m = (monto || "").toString().trim();
    if (!c && !m) return "Completá los datos del egreso";
    return `${c || "Egreso"}${m ? ` • $${m}` : ""}`;
  }, [concepto, monto]);

  useEffect(() => {
    if (!open) return;
    setFecha(hoyISO);
    setConcepto("");
    setDescripcion("");
    setMonto("");
    setIdMedio("");
    setComprobanteFile(null);
    setError("");
    setTimeout(() => firstRef.current?.focus(), 0);
  }, [open, hoyISO]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") cerrar();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loading]);

  const cerrar = () => {
    if (loading) return;
    onClose?.();
  };

  const onPickFile = (e) => {
    setError("");
    const f = e.target.files?.[0] || null;
    if (!f) {
      setComprobanteFile(null);
      return;
    }

    const allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

    if (!allowed.includes(f.type)) {
      setComprobanteFile(null);
      setError("Solo se permite PDF o imágenes (JPG/PNG/WEBP).");
      return;
    }

    const maxBytes = 8 * 1024 * 1024; // 8MB
    if (f.size > maxBytes) {
      setComprobanteFile(null);
      setError("El archivo no puede pesar más de 8MB.");
      return;
    }

    setComprobanteFile(f);
  };

  const submit = (e) => {
    e?.preventDefault?.();
    setError("");

    if (!fecha) return setError("La fecha es obligatoria.");
    if (!concepto.trim()) return setError("El concepto es obligatorio.");
    if (monto === "" || monto === null) return setError("El monto es obligatorio.");

    const montoNum = Number(String(monto).replace(",", "."));
    if (!Number.isFinite(montoNum) || montoNum <= 0) {
      return setError("El monto debe ser un número mayor a 0.");
    }

    // ✅ Mandamos FormData (sirve con o sin archivo)
    const fd = new FormData();
    fd.append("fecha", fecha);
    fd.append("concepto", concepto.trim()); // ya viene en mayúsculas
    fd.append("descripcion", (descripcion || "").trim()); // ya viene en mayúsculas
    fd.append("monto", String(montoNum));
    fd.append("id_medio_pago", idMedio ? String(Number(idMedio)) : "");

    // ✅ el backend espera el nombre: "comprobante"
    if (comprobanteFile) {
      fd.append("comprobante", comprobanteFile);
    }

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
                      style={{ minHeight: 110, resize: "vertical" }}
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
                        <option
                          key={m.id ?? m.id_medio_pago}
                          value={m.id ?? m.id_medio_pago}
                        >
                          {m.nombre ?? m.medio ?? ""}
                        </option>
                      ))}
                    </select>
                    <label className="fl-label">Medio de pago (opcional)</label>
                  </div>

                  {/* ✅ Comprobante */}
                  <div className="fl-field fl-col-full">
                    <input
                      className="fl-input"
                      type="file"
                      accept="application/pdf,image/*"
                      onChange={onPickFile}
                      disabled={loading}
                      style={{ paddingTop: 14 }}
                    />
                    <label className="fl-label">
                      <FontAwesomeIcon icon={faPaperclip} /> Comprobante (opcional)
                    </label>

                    {comprobanteFile ? (
                      <div style={{ marginTop: 8, fontSize: 12, color: "#334155" }}>
                        <FontAwesomeIcon
                          icon={isPdf ? faFilePdf : isImg ? faImage : faPaperclip}
                        />
                        {"  "}
                        <b>{comprobanteFile.name}</b>
                        {"  "}
                        <span style={{ opacity: 0.8 }}>
                          ({Math.round(comprobanteFile.size / 1024)} KB)
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>
              </article>

              {error ? (
                <article className="mi-card mi-card--full">
                  <div className="mit-alert mit-alert--danger">
                    <b>Error:</b> {error}
                  </div>
                </article>
              ) : null}
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

          <div className="mit-help">* Campos obligatorios</div>
        </form>
      </div>
    </div>
  );
}
