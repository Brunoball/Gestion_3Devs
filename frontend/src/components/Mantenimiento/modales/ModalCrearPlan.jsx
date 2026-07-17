import React, { useEffect, useRef, useState } from "react";
import "./ModalPlan.css";

function parseAmount(value) {
  const normalized = String(value ?? "").trim().replace(/\./g, "").replace(",", ".");
  return Number(normalized);
}

export default function ModalCrearPlan({ open, onClose, onConfirm, loading }) {
  const firstRef = useRef(null);
  const [form, setForm] = useState({ nombre: "", descripcion: "", monto: "" });
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setForm({ nombre: "", descripcion: "", monto: "" });
    setError("");
    setTimeout(() => firstRef.current?.focus(), 0);
    const onKey = (event) => event.key === "Escape" && !loading && onClose?.();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, loading, onClose]);

  if (!open) return null;

  const submit = (event) => {
    event.preventDefault();
    setError("");
    const nombre = form.nombre.trim();
    const monto = parseAmount(form.monto);
    if (!nombre) return setError("El nombre es obligatorio.");
    if (!Number.isFinite(monto) || monto < 0) return setError("Ingresá un monto de referencia válido.");
    onConfirm?.({ nombre, descripcion: form.descripcion.trim(), monto, activo: 1 });
  };

  return (
    <div className="mi-modal__overlay" onClick={(event) => event.target === event.currentTarget && !loading && onClose?.()}>
      <div className="mi-modal__container" role="dialog" aria-modal="true">
        <div className="mi-modal__header">
          <div>
            <h2 className="mi-modal__title">Nuevo plan o servicio</h2>
            <p className="mi-modal__subtitle">Plantilla de precio para la entidad activa.</p>
          </div>
          <button type="button" className="mi-modal__close" onClick={onClose} disabled={loading}>✕</button>
        </div>

        <form className="mit-modal__body" onSubmit={submit}>
          {error && <div className="mnt-modalError">{error}</div>}
          <div className="mi-grid">
            <article className="mi-card mi-card--full">
              <h3 className="mi-card__title">Datos necesarios</h3>
              <div className="fl-grid">
                <div className="fl-field">
                  <input ref={firstRef} className="fl-input" placeholder=" " value={form.nombre} onChange={(event) => setForm((current) => ({ ...current, nombre: event.target.value }))} disabled={loading} />
                  <label className="fl-label">Nombre *</label>
                </div>
                <div className="fl-field">
                  <input className="fl-input" inputMode="decimal" placeholder=" " value={form.monto} onChange={(event) => setForm((current) => ({ ...current, monto: event.target.value }))} disabled={loading} />
                  <label className="fl-label">Monto mensual de referencia (ARS) *</label>
                </div>
                <div className="fl-field fl-col-full">
                  <textarea className="fl-input fl-textarea" placeholder=" " rows={4} value={form.descripcion} onChange={(event) => setForm((current) => ({ ...current, descripcion: event.target.value }))} disabled={loading} />
                  <label className="fl-label">Descripción</label>
                </div>
              </div>
            </article>
          </div>
          <div className="mit-help">El plan propone un valor. El monto finalmente acordado se guarda en el sistema del cliente.</div>
          <div className="mit-actions">
            <button type="button" className="mit-btn mit-btn--ghost" onClick={onClose} disabled={loading}>Cancelar</button>
            <button type="submit" className="mit-btn mit-btn--solid" disabled={loading}>{loading ? "Guardando…" : "Crear plan"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
