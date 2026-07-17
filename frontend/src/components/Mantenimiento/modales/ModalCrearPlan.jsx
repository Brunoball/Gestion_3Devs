import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

  return createPortal(
    <div className="mnt-plan-modal__overlay" onMouseDown={(event) => event.target === event.currentTarget && !loading && onClose?.()}>
      <div className="mnt-plan-modal" role="dialog" aria-modal="true" aria-labelledby="mnt-create-plan-title">
        <div className="mnt-plan-modal__header">
          <div>
            <h2 id="mnt-create-plan-title" className="mnt-plan-modal__title">Nuevo plan o servicio</h2>
            <p className="mnt-plan-modal__subtitle">Plantilla de precio para la entidad activa.</p>
          </div>
          <button type="button" className="mnt-plan-modal__close" aria-label="Cerrar" onClick={onClose} disabled={loading}>✕</button>
        </div>

        <form className="mnt-plan-modal__form" onSubmit={submit}>
          <div className="mnt-plan-modal__body">
            {error && <div className="mnt-plan-modal__error" role="alert">{error}</div>}
            <section className="mnt-plan-modal__section">
              <h3 className="mnt-plan-modal__section-title">Datos necesarios</h3>
              <div className="mnt-plan-modal__grid">
                <div className="mnt-plan-modal__field">
                  <input id="mnt-create-name" ref={firstRef} className="mnt-plan-modal__input" placeholder=" " value={form.nombre} onChange={(event) => setForm((current) => ({ ...current, nombre: event.target.value }))} disabled={loading} />
                  <label className="mnt-plan-modal__label" htmlFor="mnt-create-name">Nombre *</label>
                </div>
                <div className="mnt-plan-modal__field">
                  <input id="mnt-create-amount" className="mnt-plan-modal__input" inputMode="decimal" placeholder=" " value={form.monto} onChange={(event) => setForm((current) => ({ ...current, monto: event.target.value }))} disabled={loading} />
                  <label className="mnt-plan-modal__label" htmlFor="mnt-create-amount">Monto mensual de referencia (ARS) *</label>
                </div>
                <div className="mnt-plan-modal__field mnt-plan-modal__field--full">
                  <textarea id="mnt-create-description" className="mnt-plan-modal__input mnt-plan-modal__textarea" placeholder=" " rows={4} value={form.descripcion} onChange={(event) => setForm((current) => ({ ...current, descripcion: event.target.value }))} disabled={loading} />
                  <label className="mnt-plan-modal__label" htmlFor="mnt-create-description">Descripción</label>
                </div>
              </div>
            </section>
            <div className="mnt-plan-modal__help">El plan propone un valor. El monto finalmente acordado se guarda en el sistema del cliente.</div>
          </div>
          <div className="mnt-plan-modal__footer">
            <button type="button" className="mnt-plan-modal__button mnt-plan-modal__button--ghost" onClick={onClose} disabled={loading}>Cancelar</button>
            <button type="submit" className="mnt-plan-modal__button mnt-plan-modal__button--primary" disabled={loading}>{loading ? "Guardando…" : "Crear plan"}</button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
