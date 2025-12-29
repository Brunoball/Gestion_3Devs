import React, { useEffect, useMemo, useRef, useState } from "react";
import "./ModalPlan.css";

export default function ModalCrearPlan({ open, onClose, onConfirm, loading }) {
  const firstRef = useRef(null);

  const [form, setForm] = useState({
    nombre: "",
    descripcion: "",
    monto: "",
    activo: 1,
  });

  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;

    setForm({
      nombre: "",
      descripcion: "",
      monto: "",
      activo: 1,
    });

    setError("");
    setTimeout(() => firstRef.current?.focus(), 0);
  }, [open]);

  // ESC cierra
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && cerrar();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loading, onClose]);

  const tituloPrevio = useMemo(() => {
    const n = (form.nombre || "").trim();
    return n || "-";
  }, [form.nombre]);

  if (!open) return null;

  const cerrar = () => {
    if (loading) return;
    onClose?.();
  };

  const submit = (e) => {
    e?.preventDefault?.();
    setError("");

    const nombre = (form.nombre ?? "").trim();
    const descripcion = (form.descripcion ?? "").trim();
    const montoRaw = String(form.monto ?? "").trim();

    if (!nombre) return setError("El nombre es obligatorio.");
    if (!montoRaw) return setError("El monto es obligatorio.");

    const montoNum = Number(montoRaw.replace(",", "."));
    if (!Number.isFinite(montoNum) || montoNum < 0) {
      return setError("El monto es inválido.");
    }

    onConfirm?.({
      nombre,
      descripcion,
      monto: montoNum,
      activo: 1, // en crear lo dejamos activo por defecto
    });
  };

  return (
    <div
      className="mi-modal__overlay"
      onClick={(e) =>
        e.target.classList.contains("mi-modal__overlay") && cerrar()
      }
    >
      <div
        className="mi-modal__container"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header igual */}
        <div className="mi-modal__header">
          <div className="mi-modal__head-left">
            <h2 className="mi-modal__title">Crear plan</h2>
            <p className="mi-modal__subtitle">
              Nuevo &nbsp;|&nbsp; {tituloPrevio}
            </p>
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

        <form className="mit-modal__body" onSubmit={submit}>
          <div className="mi-tabpanel is-active">
            {error ? <div className="mnt-modalError">{error}</div> : null}

            <div className="mi-grid">
              {/* Caja 1: datos del plan */}
              <article className="mi-card">
                <h3 className="mi-card__title">Datos del plan</h3>

                <div className="fl-grid">
                  <div className="fl-col-full">
                    <div className="fl-field">
                      <input
                        ref={firstRef}
                        className="fl-input"
                        placeholder=" "
                        value={form.nombre}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, nombre: e.target.value }))
                        }
                        disabled={loading}
                      />
                      <label className="fl-label">Nombre *</label>
                    </div>
                  </div>

                  <div className="fl-col-full">
                    <div className="fl-field">
                      <textarea
                        className="fl-input fl-textarea"
                        placeholder=" "
                        value={form.descripcion}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, descripcion: e.target.value }))
                        }
                        disabled={loading}
                        rows={4}
                      />
                      <label className="fl-label">Descripción (opcional)</label>
                    </div>
                  </div>
                </div>
              </article>

              {/* Caja 2: monto + estado */}
              <article className="mi-card">
                <h3 className="mi-card__title">Monto y estado</h3>

                <div className="fl-grid">
                  <div className="fl-col-full">
                    <div className="fl-field">
                      <input
                        className="fl-input"
                        placeholder=" "
                        value={form.monto}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, monto: e.target.value }))
                        }
                        inputMode="decimal"
                        disabled={loading}
                      />
                      <label className="fl-label">Monto *</label>
                    </div>
                  </div>

                  {/* En crear: estado fijo (activo) para mantenerlo simple */}
                  <div className="fl-col-full" style={{ marginTop: 4 }}>
                    <div className="mit-pill">
                      Estado: <b>Activo</b>
                    </div>
                  </div>
                </div>
              </article>
            </div>
          </div>

          {/* Footer igual */}
          <div className="mit-actions">
            <button
              type="button"
              className="mit-btn mit-btn--ghost"
              onClick={cerrar}
              disabled={loading}
            >
              Cancelar
            </button>

            <button type="submit" className="mit-btn mit-btn--solid" disabled={loading}>
              {loading ? "Guardando..." : "Crear"}
            </button>
          </div>

          <div className="mit-help">* Campos obligatorios</div>
        </form>
      </div>
    </div>
  );
}
