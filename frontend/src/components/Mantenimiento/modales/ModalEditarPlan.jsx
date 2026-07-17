import React, { useEffect, useRef, useState } from "react";
import "./ModalPlan.css";

function parseAmount(value) {
  const normalized = String(value ?? "").trim().replace(/\./g, "").replace(",", ".");
  return Number(normalized);
}

export default function ModalEditarPlan({ open, plan, onClose, onConfirm, loading }) {
  const firstRef = useRef(null);
  const [form, setForm] = useState({ id: null, nombre: "", descripcion: "", monto: "" });
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setForm({
      id: plan?.id ?? null,
      nombre: plan?.nombre ?? "",
      descripcion: plan?.descripcion ?? "",
      monto: String(plan?.monto ?? ""),
    });
    setError("");
    setTimeout(() => firstRef.current?.focus(), 0);
    const onKey = (event) => event.key === "Escape" && !loading && onClose?.();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, plan, loading, onClose]);

  if (!open) return null;

  const submit = (event) => {
    event.preventDefault();
    setError("");
    const nombre = form.nombre.trim();
    const monto = parseAmount(form.monto);
    if (!form.id) return setError("Plan inválido.");
    if (!nombre) return setError("El nombre es obligatorio.");
    if (!Number.isFinite(monto) || monto < 0) return setError("Ingresá un monto de referencia válido.");
    onConfirm?.({ id: form.id, nombre, descripcion: form.descripcion.trim(), monto, activo: 1 });
  };

  return (
    <div className="mi-modal__overlay" onClick={(event) => event.target === event.currentTarget && !loading && onClose?.()}>
      <div className="mi-modal__container" role="dialog" aria-modal="true">
        <div className="mi-modal__header">
          <div>
            <h2 className="mi-modal__title">Editar plan o servicio</h2>
            <p className="mi-modal__subtitle">{plan?.nombre || "Plan"}</p>
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
          <div className="mit-help">Los sistemas ya creados mantienen su monto acordado aunque cambie el valor de referencia del plan.</div>
          <div className="mit-actions">
            <button type="button" className="mit-btn mit-btn--ghost" onClick={onClose} disabled={loading}>Cancelar</button>
            <button type="submit" className="mit-btn mit-btn--solid" disabled={loading}>{loading ? "Guardando…" : "Guardar cambios"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
