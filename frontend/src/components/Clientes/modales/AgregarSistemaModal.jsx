import React, { useEffect } from "react";
import "./AgregarSistemaModal.css";

export default function AgregarSistemaModal({
  open,
  onClose,
  cliente,
  form,
  onChange,
  onSubmit,
  submitting,
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const nombreCliente = cliente?.nombre || "Cliente";

  return (
    <div className="am-backdrop" onMouseDown={onClose}>
      <div className="am-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="am-header">
          <div>
            <div className="am-title">Agregar sistema</div>
            <div className="am-sub">
              Cliente: <b>{nombreCliente}</b>
            </div>
          </div>

          <button className="am-close" type="button" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div className="am-body">
          <div className="am-grid">
            <div className="am-field">
              <label>Nombre *</label>
              <input
                placeholder="Ej: Mesas de examen"
                value={form?.nombre || ""}
                onChange={(e) => onChange("nombre", e.target.value)}
                autoFocus
              />
            </div>

            <div className="am-field">
              <label>Descripción</label>
              <input
                placeholder="Opcional"
                value={form?.descripcion || ""}
                onChange={(e) => onChange("descripcion", e.target.value)}
              />
            </div>

            <div className="am-field">
              <label>Plan</label>
              <select value={form?.plan || "mensual"} onChange={(e) => onChange("plan", e.target.value)}>
                <option value="mensual">Mensual</option>
                <option value="anual">Anual</option>
                <option value="soporte">Soporte</option>
                <option value="proyecto">Proyecto</option>
              </select>
            </div>

            <div className="am-field">
              <label>Estado</label>
              <select value={form?.estado || "activo"} onChange={(e) => onChange("estado", e.target.value)}>
                <option value="activo">Activo</option>
                <option value="pausado">Pausado</option>
                <option value="finalizado">Finalizado</option>
              </select>
            </div>

            <div className="am-field">
              <label>Monto desarrollo</label>
              <input
                placeholder="Ej: 400000"
                inputMode="numeric"
                value={form?.monto_desarrollo ?? ""}
                onChange={(e) => onChange("monto_desarrollo", e.target.value)}
              />
            </div>

            <div className="am-field">
              <label>Monto mensual base</label>
              <input
                placeholder="Ej: 35000"
                inputMode="numeric"
                value={form?.monto_mensual ?? ""}
                onChange={(e) => onChange("monto_mensual", e.target.value)}
              />
            </div>

            <div className="am-field">
              <label>Fecha inicio</label>
              <input
                type="date"
                value={form?.fecha_inicio || ""}
                onChange={(e) => onChange("fecha_inicio", e.target.value)}
              />
            </div>

            <div className="am-hint">
              * Campos obligatorios: <b>Nombre</b>
            </div>
          </div>
        </div>

        <div className="am-footer">
          <button className="am-btn am-btn-secondary" type="button" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button className="am-btn am-btn-primary" type="button" onClick={onSubmit} disabled={submitting}>
            {submitting ? "Agregando..." : "Agregar sistema"}
          </button>
        </div>
      </div>
    </div>
  );
}
