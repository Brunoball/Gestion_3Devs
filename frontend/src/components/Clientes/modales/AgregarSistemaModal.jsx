import React, { useEffect, useMemo, useState } from "react";
import Toast from "../../Global/Toast";
import "../../Trabajadores/modales/ModalEditarTrabajador.css";

const ESTADOS = [
  { value: "activo", label: "Activo" },
  { value: "pausado", label: "Pausado" },
  { value: "finalizado", label: "Finalizado" },
];

export default function AgregarSistemaModal({
  open,
  onClose,
  cliente,
  form,
  onChange,
  onSubmit,
  submitting,
  planes = [],
}) {
  const [toast, setToast] = useState({ open: false, tipo: "info", mensaje: "" });

  useEffect(() => {
    if (!open) return;
    const onKey = (event) => event.key === "Escape" && !submitting && onClose?.();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, submitting, onClose]);

  const title = useMemo(
    () => `Nuevo sistema${cliente?.nombre ? ` — ${cliente.nombre}` : ""}`,
    [cliente]
  );

  if (!open) return null;

  const selectPlan = (value) => {
    onChange?.("id_plan", value);
    const selected = planes.find((plan) => String(plan.id) === String(value));
    if (selected && Number(selected.monto) > 0) onChange?.("monto_mensual", String(selected.monto));
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!String(form?.nombre || "").trim()) {
      setToast({ open: true, tipo: "advertencia", mensaje: "El nombre del sistema es obligatorio." });
      return;
    }
    const amount = Number(String(form?.monto_mensual || 0).replace(",", "."));
    if (!Number.isFinite(amount) || amount < 0) {
      setToast({ open: true, tipo: "advertencia", mensaje: "El monto mensual es inválido." });
      return;
    }
    await onSubmit?.();
  };

  return (
    <div className="mi-modal__overlay" onMouseDown={(event) => event.target === event.currentTarget && !submitting && onClose?.()}>
      {toast.open && <Toast {...toast} onClose={() => setToast((t) => ({ ...t, open: false }))} />}
      <div className="mi-modal__container" role="dialog" aria-modal="true">
        <div className="mi-modal__header">
          <div>
            <h2 className="mi-modal__title">{title}</h2>
            <p className="mi-modal__subtitle">El plan sirve como plantilla; el monto acordado puede ajustarse.</p>
          </div>
          <button className="mi-modal__close" type="button" onClick={onClose}>✕</button>
        </div>

        <form className="mit-modal__body" onSubmit={submit}>
          <div className="mi-grid">
            <article className="mi-card">
              <h3 className="mi-card__title">Sistema</h3>
              <div className="fl-field fl-col-full">
                <input className="fl-input" placeholder=" " value={form?.nombre || ""} onChange={(e) => onChange?.("nombre", e.target.value)} />
                <label className="fl-label">Nombre *</label>
              </div>
              <div className="fl-field fl-col-full" style={{ marginTop: 12 }}>
                <input className="fl-input" placeholder=" " value={form?.descripcion || ""} onChange={(e) => onChange?.("descripcion", e.target.value)} />
                <label className="fl-label">Descripción</label>
              </div>
            </article>

            <article className="mi-card">
              <h3 className="mi-card__title">Servicio contratado</h3>
              <div className="fl-field fl-col-full">
                <select className="fl-input fl-select" value={form?.id_plan || ""} onChange={(e) => selectPlan(e.target.value)}>
                  <option value="">Sin plan / monto personalizado</option>
                  {planes.map((plan) => <option key={plan.id} value={plan.id}>{plan.nombre}</option>)}
                </select>
                <label className="fl-label">Plan de referencia</label>
              </div>
              <div className="fl-field fl-col-full" style={{ marginTop: 12 }}>
                <input className="fl-input" inputMode="decimal" placeholder=" " value={form?.monto_mensual || ""} onChange={(e) => onChange?.("monto_mensual", e.target.value)} />
                <label className="fl-label">Monto mensual acordado</label>
              </div>
            </article>

            <article className="mi-card mi-card--full">
              <h3 className="mi-card__title">Vigencia</h3>
              <div className="fl-grid">
                <div className="fl-field">
                  <select className="fl-input fl-select" value={form?.estado || "activo"} onChange={(e) => onChange?.("estado", e.target.value)}>
                    {ESTADOS.map((state) => <option key={state.value} value={state.value}>{state.label}</option>)}
                  </select>
                  <label className="fl-label">Estado</label>
                </div>
                <div className="fl-field">
                  <input className="fl-input" type="date" placeholder=" " value={form?.fecha_inicio || ""} onChange={(e) => onChange?.("fecha_inicio", e.target.value)} />
                  <label className="fl-label">Fecha de inicio</label>
                </div>
              </div>
            </article>
          </div>

          <div className="mit-actions">
            <button type="button" className="mit-btn mit-btn--ghost" onClick={onClose} disabled={submitting}>Cancelar</button>
            <button type="submit" className="mit-btn mit-btn--solid" disabled={submitting}>{submitting ? "Guardando…" : "Crear sistema"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
