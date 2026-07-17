import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

  return createPortal(
    <div className="mnt-plan-modal__overlay" onMouseDown={(event) => event.target === event.currentTarget && !loading && onClose?.()}>
      <div className="mnt-plan-modal" role="dialog" aria-modal="true" aria-labelledby="mnt-edit-plan-title">
        <div className="mnt-plan-modal__header">
          <div>
            <h2 id="mnt-edit-plan-title" className="mnt-plan-modal__title">Editar plan o servicio</h2>
            <p className="mnt-plan-modal__subtitle">{plan?.nombre || "Plan"}</p>
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
                  <input id="mnt-edit-name" ref={firstRef} className="mnt-plan-modal__input" placeholder=" " value={form.nombre} onChange={(event) => setForm((current) => ({ ...current, nombre: event.target.value }))} disabled={loading} />
                  <label className="mnt-plan-modal__label" htmlFor="mnt-edit-name">Nombre *</label>
                </div>
                <div className="mnt-plan-modal__field">
                  <input id="mnt-edit-amount" className="mnt-plan-modal__input" inputMode="decimal" placeholder=" " value={form.monto} onChange={(event) => setForm((current) => ({ ...current, monto: event.target.value }))} disabled={loading} />
                  <label className="mnt-plan-modal__label" htmlFor="mnt-edit-amount">Monto mensual de referencia (ARS) *</label>
                </div>
                <div className="mnt-plan-modal__field mnt-plan-modal__field--full">
                  <textarea id="mnt-edit-description" className="mnt-plan-modal__input mnt-plan-modal__textarea" placeholder=" " rows={4} value={form.descripcion} onChange={(event) => setForm((current) => ({ ...current, descripcion: event.target.value }))} disabled={loading} />
                  <label className="mnt-plan-modal__label" htmlFor="mnt-edit-description">Descripción</label>
                </div>
              </div>
            </section>
            <div className="mnt-plan-modal__help">Los sistemas ya creados mantienen su monto acordado aunque cambie el valor de referencia del plan.</div>
          </div>
          <div className="mnt-plan-modal__footer">
            <button type="button" className="mnt-plan-modal__button mnt-plan-modal__button--ghost" onClick={onClose} disabled={loading}>Cancelar</button>
            <button type="submit" className="mnt-plan-modal__button mnt-plan-modal__button--primary" disabled={loading}>{loading ? "Guardando…" : "Guardar cambios"}</button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
