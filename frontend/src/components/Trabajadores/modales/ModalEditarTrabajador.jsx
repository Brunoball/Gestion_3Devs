import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import BASE_URL from "../../../config/config";
import Toast from "../../Global/Toast";
import { fetchJSONAuth } from "../../Global/api";
import "./ModalEditarTrabajador.css";
import "./ModalTrabajadorV2.css";

const ROLES = ["admin", "contador", "desarrollador", "soporte", "vista"];

export default function ModalEditarTrabajador({ open, trabajador, onClose, onSaved, idOrganizacion }) {
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({ open: false, tipo: "info", mensaje: "" });

  useEffect(() => {
    if (open && trabajador) setForm({ ...trabajador });
  }, [open, trabajador]);

  if (!open || !trabajador) return null;

  const save = async (event) => {
    event.preventDefault();
    setLoading(true);
    try {
      await fetchJSONAuth(`${BASE_URL}/api.php?action=trabajadores&op=editar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, id: trabajador.id, activo: 1 }),
      }, idOrganizacion);
      onSaved?.();
    } catch (error) {
      setToast({ open: true, tipo: "error", mensaje: error?.message || "No se pudo actualizar." });
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div className="tp-worker-modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && !loading && onClose?.()}>
      {toast.open && <Toast {...toast} onClose={() => setToast((t) => ({ ...t, open: false }))} />}
      <div className="tp-worker-modal" role="dialog" aria-modal="true" aria-labelledby="tp-edit-worker-title">
        <div className="mi-modal__header">
          <div>
            <h2 id="tp-edit-worker-title" className="mi-modal__title">Editar trabajador</h2>
            <p className="mi-modal__subtitle">Nombre, email y alias son globales; el rol corresponde a esta entidad.</p>
          </div>
          <button type="button" className="mi-modal__close" aria-label="Cerrar" onClick={onClose} disabled={loading}>✕</button>
        </div>
        <form className="mit-modal__body" onSubmit={save}>
          <div className="tp-worker-modal__content">
          <div className="mi-grid">
            <article className="mi-card">
              <h3 className="mi-card__title">Datos personales</h3>
              <div className="fl-field fl-col-full">
                <input className="fl-input" placeholder=" " value={form.nombre || ""} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} />
                <label className="fl-label">Nombre</label>
              </div>
              <div className="fl-field fl-col-full" style={{ marginTop: 12 }}>
                <input className="fl-input" placeholder=" " value={form.apellido || ""} onChange={(e) => setForm((f) => ({ ...f, apellido: e.target.value }))} />
                <label className="fl-label">Apellido</label>
              </div>
            </article>
            <article className="mi-card">
              <h3 className="mi-card__title">Cuenta y pago</h3>
              <div className="fl-field fl-col-full">
                <input className="fl-input" placeholder=" " value={form.email || ""} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
                <label className="fl-label">Email</label>
              </div>
              <div className="fl-field fl-col-full" style={{ marginTop: 12 }}>
                <input className="fl-input" placeholder=" " value={form.alias_pago || ""} onChange={(e) => setForm((f) => ({ ...f, alias_pago: e.target.value }))} />
                <label className="fl-label">Alias de pago</label>
              </div>
            </article>
            <article className="mi-card mi-card--full">
              <h3 className="mi-card__title">Rol en esta entidad</h3>
              <div className="fl-field fl-col-full">
                <select className="fl-input fl-select" value={form.rol || "vista"} onChange={(e) => setForm((f) => ({ ...f, rol: e.target.value }))}>
                  {ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
                </select>
                <label className="fl-label">Rol</label>
              </div>
            </article>
          </div>
          </div>
          <div className="mit-actions">
            <button type="button" className="mit-btn mit-btn--ghost" onClick={onClose} disabled={loading}>Cancelar</button>
            <button type="submit" className="mit-btn mit-btn--solid" disabled={loading}>{loading ? "Guardando…" : "Guardar"}</button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
