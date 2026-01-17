import React, { useEffect, useMemo, useState } from "react";
import BASE_URL from "../../../config/config";
import Toast from "../../Global/Toast";
import "./ModalEditarTrabajador.css";

const ROLES = [
  { value: "admin", label: "Admin" },
  { value: "desarrollador", label: "Desarrollador" },
  { value: "soporte", label: "Soporte" },
  { value: "vista", label: "Vista" },
];

const apiPost = async (url, payload) => {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload ?? {}),
  });
  return await res.json();
};

export default function ModalEditarTrabajador({
  open,
  onClose,
  onSaved,
  trabajador,
}) {
  const [form, setForm] = useState({
    id: null,
    nombre: "",
    apellido: "",
    email: "",
    rol: "vista",
    alias_pago: "",
    activo: 1,
  });

  const [loading, setLoading] = useState(false);

  // Toast local (como venías)
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

  // Cargar form cuando se abre
  useEffect(() => {
    if (!open) return;
    setForm({
      id: trabajador?.id ?? null,
      nombre: trabajador?.nombre ?? "",
      apellido: trabajador?.apellido ?? "",
      email: trabajador?.email ?? "",
      rol: trabajador?.rol ?? "vista",
      alias_pago: trabajador?.alias_pago ?? "",
      activo: trabajador?.activo ?? 1,
    });
  }, [open, trabajador]);

  // ESC cierra (como ModalInfoAlumno)
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const nombreCompleto = useMemo(() => {
    const ap = (form.apellido || "").trim();
    const no = (form.nombre || "").trim();
    const armado = `${ap} ${no}`.trim();
    return armado || "-";
  }, [form.apellido, form.nombre]);

  if (!open) return null;

  const cerrar = () => {
    if (loading) return;
    onClose?.();
  };

  const guardar = async (e) => {
    e.preventDefault();

    const nombre = (form.nombre ?? "").trim();
    const apellido = (form.apellido ?? "").trim();

    if (!form.id) {
      showToast("error", "Falta el ID del trabajador.", 3000);
      return;
    }
    if (!nombre || !apellido) {
      showToast("advertencia", "Nombre y apellido son obligatorios.", 3000);
      return;
    }

    setLoading(true);
    showToast("cargando", "Guardando...", 1200);

    try {
      const url = `${BASE_URL}/api.php?action=trabajadores&op=editar`;

      const payload = {
        ...form,
        nombre,
        apellido,
        email: (form.email ?? "").trim(),
        alias_pago: (form.alias_pago ?? "").trim(),
        activo: form.activo ? 1 : 0,
      };

      const data = await apiPost(url, payload);

      if (!data?.exito) {
        showToast("error", data?.mensaje || "No se pudo guardar", 3500);
        return;
      }

      showToast("exito", "Trabajador actualizado", 2200);
      onSaved?.();
      cerrar();
    } catch (err) {
      showToast(
        "error",
        String(err?.message || err || "Error al guardar"),
        3500
      );
    } finally {
      setLoading(false);
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
        {/* Header rojo como ModalInfoAlumno */}
        <div className="mi-modal__header">
          <div className="mi-modal__head-left">
            <h2 className="mi-modal__title">Editar trabajador</h2>
            <p className="mi-modal__subtitle">
              ID: {form.id ?? "-"} &nbsp;|&nbsp; {nombreCompleto}
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

        {/* Contenido (cards como InfoAlumno) */}
        <form className="mit-modal__body" onSubmit={guardar}>
          <div className="mi-tabpanel is-active">
            <div className="mi-grid">
              <article className="mi-card">
                <h3 className="mi-card__title">Datos personales</h3>
                <div className="fl-grid">
                  <div className="fl-col-full">
                    <div className="fl-field">
                      <input
                        className="fl-input"
                        placeholder=" "
                        value={form.nombre}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, nombre: e.target.value.toUpperCase() }))
                        }
                        disabled={loading}
                      />
                      <label className="fl-label">Nombre *</label>
                    </div>

                    <div className="fl-field" style={{ marginTop: "12px" }}>
                      <input
                        className="fl-input"
                        placeholder=" "
                        value={form.apellido}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, apellido: e.target.value.toUpperCase() }))
                        }
                        disabled={loading}
                      />
                      <label className="fl-label">Apellido *</label>
                    </div>
                  </div>
                </div>

              </article>

              <article className="mi-card">
                <h3 className="mi-card__title">Cuenta</h3>

                <div className="fl-grid">
                  <div className="fl-field fl-col-full">
                    <input
                      className="fl-input"
                      placeholder=" "
                      value={form.email}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, email: e.target.value }))
                      }
                      disabled={loading}
                    />
                    <label className="fl-label">Email (opcional)</label>
                  </div>

                  <div className="fl-field">
                    <select
                      className="fl-input fl-select"
                      value={form.rol}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, rol: e.target.value }))
                      }
                      disabled={loading}
                    >
                      {ROLES.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                    <label className="fl-label">Rol</label>
                  </div>

                  <div className="fl-field alias-pago">
                    <input
                      className="fl-input"
                      placeholder=" "
                      value={form.alias_pago}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, alias_pago: e.target.value }))
                      }
                      disabled={loading}
                    />
                    <label className="fl-label">Alias de pago (opcional)</label>
                  </div>
                </div>
              </article>

              <article className="mi-card mi-card--full">
                <h3 className="mi-card__title">Estado</h3>

                <label className="mit-switch">
                  <input
                    type="checkbox"
                    checked={!!form.activo}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, activo: e.target.checked ? 1 : 0 }))
                    }
                    disabled={loading}
                  />
                  <span className="mit-switch__track" />
                  <span className="mit-switch__text">
                    {form.activo ? "Activo" : "Inactivo"}
                  </span>
                </label>
              </article>
            </div>
          </div>

          {/* Footer acciones (minimalista) */}
          <div className="mit-actions">
            <button
              type="button"
              className="mit-btn mit-btn--ghost"
              onClick={cerrar}
              disabled={loading}
            >
              Cancelar
            </button>

            <button
              type="submit"
              className="mit-btn mit-btn--solid"
              disabled={loading}
            >
              Guardar cambios
            </button>
          </div>

          <div className="mit-help"></div>
        </form>
      </div>
    </div>
  );
}
