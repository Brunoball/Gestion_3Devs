import React, { useEffect, useMemo, useState } from "react";
import BASE_URL from "../../../config/config";
import Toast from "../../Global/Toast";
import { fetchJSONAuth } from "../../Global/api";
import "./ModalEditarTrabajador.css";

const ROLES = [
  { value: "admin", label: "Administrador" },
  { value: "contador", label: "Contador" },
  { value: "desarrollador", label: "Desarrollador" },
  { value: "soporte", label: "Soporte" },
  { value: "vista", label: "Vista" },
];

const EMPTY = {
  nombre: "",
  apellido: "",
  email: "",
  rol: "vista",
  alias_pago: "",
  id_trabajador_existente: "",
};

export default function ModalAgregarTrabajador({
  open,
  onClose,
  onSaved,
  idOrganizacion,
  organizacion,
  trabajadoresDisponibles = [],
}) {
  const [mode, setMode] = useState("nuevo");
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({ open: false, tipo: "info", mensaje: "" });

  useEffect(() => {
    if (!open) return;
    setMode(trabajadoresDisponibles.length ? "existente" : "nuevo");
    setForm(EMPTY);
  }, [open, trabajadoresDisponibles.length]);

  const title = useMemo(
    () => (mode === "existente" ? "Vincular persona existente" : "Nueva persona"),
    [mode]
  );

  if (!open) return null;

  const close = () => {
    if (!loading) onClose?.();
  };

  const save = async (event) => {
    event.preventDefault();
    if (mode === "existente" && !form.id_trabajador_existente) {
      return setToast({ open: true, tipo: "advertencia", mensaje: "Seleccioná una persona." });
    }
    if (mode === "nuevo" && (!form.nombre.trim() || !form.apellido.trim())) {
      return setToast({ open: true, tipo: "advertencia", mensaje: "Nombre y apellido son obligatorios." });
    }

    setLoading(true);
    try {
      await fetchJSONAuth(
        `${BASE_URL}/api.php?action=trabajadores&op=crear`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            mode === "existente"
              ? {
                  id_trabajador_existente: Number(form.id_trabajador_existente),
                  rol: form.rol,
                }
              : {
                  nombre: form.nombre.trim(),
                  apellido: form.apellido.trim(),
                  email: form.email.trim(),
                  alias_pago: form.alias_pago.trim(),
                  rol: form.rol,
                }
          ),
        },
        idOrganizacion
      );
      onSaved?.();
    } catch (error) {
      setToast({ open: true, tipo: "error", mensaje: error?.message || "No se pudo guardar." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mi-modal__overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      {toast.open && <Toast {...toast} onClose={() => setToast((t) => ({ ...t, open: false }))} />}
      <div className="mi-modal__container" role="dialog" aria-modal="true">
        <div className="mi-modal__header">
          <div>
            <h2 className="mi-modal__title">{title}</h2>
            <p className="mi-modal__subtitle">Entidad: {organizacion?.nombre || "—"}</p>
          </div>
          <button className="mi-modal__close" type="button" onClick={close}>✕</button>
        </div>

        <form className="mit-modal__body" onSubmit={save}>
          <div className="TP-LinkMode">
            <button type="button" className={mode === "existente" ? "is-active" : ""} onClick={() => setMode("existente")} disabled={!trabajadoresDisponibles.length}>
              Vincular existente
            </button>
            <button type="button" className={mode === "nuevo" ? "is-active" : ""} onClick={() => setMode("nuevo")}>
              Crear persona
            </button>
          </div>

          <div className="mi-grid">
            {mode === "existente" ? (
              <article className="mi-card mi-card--full">
                <h3 className="mi-card__title">Persona ya cargada</h3>
                <div className="fl-field fl-col-full">
                  <select className="fl-input fl-select" value={form.id_trabajador_existente} onChange={(e) => setForm((f) => ({ ...f, id_trabajador_existente: e.target.value }))}>
                    <option value="">Seleccionar persona</option>
                    {trabajadoresDisponibles.map((worker) => (
                      <option key={worker.id} value={worker.id}>
                        {worker.apellido}, {worker.nombre}{worker.email ? ` — ${worker.email}` : ""}
                      </option>
                    ))}
                  </select>
                  <label className="fl-label">Persona</label>
                </div>
                {!trabajadoresDisponibles.length && <p>No hay personas de otra entidad disponibles para vincular.</p>}
              </article>
            ) : (
              <>
                <article className="mi-card">
                  <h3 className="mi-card__title">Datos personales</h3>
                  <div className="fl-field fl-col-full">
                    <input className="fl-input" placeholder=" " value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value.toUpperCase() }))} />
                    <label className="fl-label">Nombre *</label>
                  </div>
                  <div className="fl-field fl-col-full" style={{ marginTop: 12 }}>
                    <input className="fl-input" placeholder=" " value={form.apellido} onChange={(e) => setForm((f) => ({ ...f, apellido: e.target.value.toUpperCase() }))} />
                    <label className="fl-label">Apellido *</label>
                  </div>
                </article>
                <article className="mi-card">
                  <h3 className="mi-card__title">Contacto y pago</h3>
                  <div className="fl-field fl-col-full">
                    <input className="fl-input" placeholder=" " value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
                    <label className="fl-label">Email</label>
                  </div>
                  <div className="fl-field fl-col-full" style={{ marginTop: 12 }}>
                    <input className="fl-input" placeholder=" " value={form.alias_pago} onChange={(e) => setForm((f) => ({ ...f, alias_pago: e.target.value }))} />
                    <label className="fl-label">Alias de pago</label>
                  </div>
                </article>
              </>
            )}

            <article className="mi-card mi-card--full">
              <h3 className="mi-card__title">Rol dentro de esta entidad</h3>
              <div className="fl-field fl-col-full">
                <select className="fl-input fl-select" value={form.rol} onChange={(e) => setForm((f) => ({ ...f, rol: e.target.value }))}>
                  {ROLES.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
                </select>
                <label className="fl-label">Rol</label>
              </div>
            </article>
          </div>

          <div className="mit-actions">
            <button type="button" className="mit-btn mit-btn--ghost" onClick={close} disabled={loading}>Cancelar</button>
            <button type="submit" className="mit-btn mit-btn--solid" disabled={loading}>{loading ? "Guardando…" : "Guardar"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
