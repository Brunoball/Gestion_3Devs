// src/components/Clientes/modales/AgregarSistemaModal.jsx
import React, { useEffect, useMemo, useState } from "react";
import Toast from "../../Global/Toast";
import "../../Trabajadores/modales/ModalEditarTrabajador.css"; // ✅ reutiliza la misma estética (mi- / fl- / mit-)

const PLANES = [
  { value: "mensual", label: "Mensual" },
  { value: "anual", label: "Anual" },
  { value: "soporte", label: "Soporte" },
  { value: "proyecto", label: "Proyecto" },
];

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
}) {
  // Toast local (igual al de ModalAgregarTrabajador)
  const [toast, setToast] = useState({
    open: false,
    tipo: "info",
    mensaje: "",
    duracion: 2600,
  });

  const showToast = (tipo, mensaje, duracion = 2600) => {
    setToast({ open: false, tipo: "info", mensaje: "", duracion: 0 });
    setTimeout(() => setToast({ open: true, tipo, mensaje, duracion }), 0);
  };

  const closeToast = () => setToast((t) => ({ ...t, open: false }));

  // Reset toast al abrir
  useEffect(() => {
    if (!open) return;
    setToast({ open: false, tipo: "info", mensaje: "", duracion: 2600 });
  }, [open]);

  // ESC cierra
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && cerrar();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, submitting]);

  const titulo = useMemo(() => {
    const cn = (cliente?.nombre || "").trim();
    return cn ? `Nuevo sistema — ${cn}` : "Nuevo sistema";
  }, [cliente?.nombre]);

  const subtitulo = useMemo(() => {
    const nom = (form?.nombre || "").trim();
    if (nom) return nom;
    return "Completá los datos del sistema";
  }, [form?.nombre]);

  if (!open) return null;

  const cerrar = () => {
    if (submitting) return;
    onClose?.();
  };

  const submit = async (e) => {
    e.preventDefault();

    const nombre = (form?.nombre || "").trim();
    if (!nombre) {
      showToast("advertencia", "El nombre del sistema es obligatorio.", 3000);
      return;
    }

    // Validaciones suaves (opcionales)
    const md = String(form?.monto_desarrollo ?? "").trim();
    const mm = String(form?.monto_mensual ?? "").trim();

    const toNum = (v) => {
      const n = Number(String(v).replace(",", "."));
      return Number.isFinite(n) ? n : NaN;
    };

    if (md !== "" && Number.isNaN(toNum(md))) {
      showToast("advertencia", "Monto desarrollo inválido.", 3000);
      return;
    }
    if (mm !== "" && Number.isNaN(toNum(mm))) {
      showToast("advertencia", "Monto mensual inválido.", 3000);
      return;
    }

    showToast("cargando", "Guardando...", 1200);

    try {
      // En tu Clientes.jsx, onSubmit ya ejecuta crearSistema(modalClienteId)
      await onSubmit?.();
    } catch (err) {
      // si onSubmit tira error (por si lo manejás así)
      showToast("error", String(err?.message || err || "Error al guardar"), 3500);
    }
  };

  return (
    <div
      className="mi-modal__overlay"
      onClick={(e) =>
        e.target.classList.contains("mi-modal__overlay") && cerrar()
      }
    >
      {toast.open && (
        <Toast
          tipo={toast.tipo}
          mensaje={toast.mensaje}
          duracion={toast.duracion}
          onClose={closeToast}
        />
      )}

      <div
        className="mi-modal__container"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header azul */}
        <div className="mi-modal__header">
          <div className="mi-modal__head-left">
            <h2 className="mi-modal__title">{titulo}</h2>
            <p className="mi-modal__subtitle">{subtitulo}</p>
          </div>

          <button className="mi-modal__close" onClick={cerrar} aria-label="Cerrar">
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

        {/* Body */}
        <form className="mit-modal__body" onSubmit={submit}>
          <div className="mi-tabpanel is-active">
            <div className="mi-grid">
              {/* Datos del sistema */}
              <article className="mi-card">
                <h3 className="mi-card__title">Datos del sistema</h3>

                <div className="fl-grid">
                  <div className="fl-field fl-col-full">
                    <input
                      className="fl-input"
                      placeholder=" "
                      value={form?.nombre ?? ""}
                      onChange={(e) => onChange?.("nombre", e.target.value)}
                      disabled={submitting}
                    />
                    <label className="fl-label">Nombre *</label>
                  </div>

                  <div className="fl-field fl-col-full">
                    <input
                      className="fl-input"
                      placeholder=" "
                      value={form?.descripcion ?? ""}
                      onChange={(e) => onChange?.("descripcion", e.target.value)}
                      disabled={submitting}
                    />
                    <label className="fl-label">Descripción (opcional)</label>
                  </div>

                  <div className="fl-field">
                    <select
                      className="fl-input fl-select"
                      value={form?.plan ?? "mensual"}
                      onChange={(e) => onChange?.("plan", e.target.value)}
                      disabled={submitting}
                    >
                      {PLANES.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                    <label className="fl-label">Plan</label>
                  </div>

                  <div className="fl-field">
                    <select
                      className="fl-input fl-select"
                      value={form?.estado ?? "activo"}
                      onChange={(e) => onChange?.("estado", e.target.value)}
                      disabled={submitting}
                    >
                      {ESTADOS.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                    <label className="fl-label">Estado</label>
                  </div>
                </div>
              </article>

              {/* Montos */}
              <article className="mi-card">
                <h3 className="mi-card__title">Montos</h3>

                <div className="fl-grid">
                  <div className="fl-field">
                    <input
                      className="fl-input"
                      placeholder=" "
                      inputMode="numeric"
                      value={form?.monto_desarrollo ?? ""}
                      onChange={(e) => onChange?.("monto_desarrollo", e.target.value)}
                      disabled={submitting}
                    />
                    <label className="fl-label">Monto desarrollo</label>
                  </div>

                  <div className="fl-field">
                    <input
                      className="fl-input"
                      placeholder=" "
                      inputMode="numeric"
                      value={form?.monto_mensual ?? ""}
                      onChange={(e) => onChange?.("monto_mensual", e.target.value)}
                      disabled={submitting}
                    />
                    <label className="fl-label">Monto mensual base</label>
                  </div>

                  <div className="fl-field fl-col-full">
                    <input
                      className="fl-input"
                      placeholder=" "
                      type="date"
                      value={form?.fecha_inicio ?? ""}
                      onChange={(e) => onChange?.("fecha_inicio", e.target.value)}
                      disabled={submitting}
                    />
                    <label className="fl-label">Fecha inicio</label>
                  </div>
                </div>
              </article>

              {/* Nota / hint */}
              <article className="mi-card mi-card--full">
                <h3 className="mi-card__title">Detalle</h3>
                <div className="mit-hint">
                  Podés dejar montos en <strong>0</strong> si todavía no están definidos.
                </div>
              </article>
            </div>
          </div>

          {/* Footer acciones */}
          <div className="mit-actions">
            <button
              type="button"
              className="mit-btn mit-btn--ghost"
              onClick={cerrar}
              disabled={submitting}
            >
              Cancelar
            </button>

            <button
              type="submit"
              className="mit-btn mit-btn--solid"
              disabled={submitting}
            >
              {submitting ? "Guardando..." : "Crear sistema"}
            </button>
          </div>

          <div className="mit-help">* Campos obligatorios</div>
        </form>
      </div>
    </div>
  );
}
