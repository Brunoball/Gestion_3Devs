// src/components/Trabajadores/modales/ModalBajaTrabajador.jsx
import React, { useState, useEffect, useRef } from "react";
import BASE_URL from "../../../config/config";
import Toast from "../../Global/Toast";
import "./ModalBajaTrabajador.css";
// Icons
import { FaTrashAlt } from "react-icons/fa";

const apiPost = async (url, payload) => {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload ?? {}),
  });
  return await res.json();
};

export default function ModalBajaTrabajador({
  open,
  onClose,
  onSaved,
  trabajador,
}) {
  const [loading, setLoading] = useState(false);

  const [toast, setToast] = useState({
    show: false,
    tipo: "info",
    mensaje: "",
  });

  const closeToast = () => setToast((s) => ({ ...s, show: false }));

  // ✅ Lock anti doble click / doble submit
  const submitLockRef = useRef(false);

  useEffect(() => {
    if (!open) return;

    // reset locks cuando abre
    submitLockRef.current = false;
    setLoading(false);
    setToast((s) => ({ ...s, show: false }));

    const handleEsc = (e) => {
      if (e.key === "Escape") onClose?.();
    };

    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [open, onClose]);

  if (!open) return null;

  const nombreCompleto = `${(trabajador?.nombre ?? "").trim()} ${(trabajador?.apellido ?? "")
    .trim()}`
    .trim();

  const cerrar = () => {
    if (loading) return;
    onClose?.();
  };

  // ✅ cierre forzado (para cerrar después de confirmar, aunque loading esté true)
  const cerrarForzado = () => {
    onClose?.();
  };

  const confirmarBaja = async () => {
    if (submitLockRef.current) return; // evita doble disparo
    submitLockRef.current = true;

    if (!trabajador?.id) {
      setToast({
        show: true,
        tipo: "error",
        mensaje: "Falta el ID del trabajador.",
      });
      submitLockRef.current = false;
      return;
    }

    setLoading(true);

    try {
      const url = `${BASE_URL}/api.php?action=trabajadores&op=eliminar`;
      const data = await apiPost(url, { id: trabajador.id });

      if (!data?.exito) {
        setToast({
          show: true,
          tipo: "error",
          mensaje: data?.mensaje || "No se pudo dar de baja.",
        });
        submitLockRef.current = false;
        return;
      }

      // ✅ IMPORTANTE: NO mostramos toast de éxito acá
      // Porque el padre ya muestra su toast en onSaved()
      onSaved?.();

      // cerramos el modal sin bloquear por loading
      cerrarForzado();
    } catch {
      setToast({
        show: true,
        tipo: "error",
        mensaje: "Error de red al dar de baja.",
      });
      submitLockRef.current = false;
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="emp-baja-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-baja-trabajador-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) cerrar();
      }}
    >
      {toast.show && (
        <Toast
          tipo={toast.tipo}
          mensaje={toast.mensaje}
          onClose={closeToast}
          duracion={3000}
        />
      )}

      <div className="emp-baja-modal emp-baja-modal--danger">
        <div
          className="emp-baja-modal__icon emp-baja-modal__icon--danger"
          aria-hidden="true"
        >
          <FaTrashAlt />
        </div>

        <h3
          id="modal-baja-trabajador-title"
          className="emp-baja-modal__title emp-baja-modal__title--danger"
        >
          Dar de baja
        </h3>

        <p className="emp-baja-modal__body">
          ¿Dar de baja a <strong>{nombreCompleto || "este trabajador"}</strong>?
          <br />
          Quedará marcado como <strong>inactivo</strong>.
        </p>

        <div className="emp-baja-modal__actions">
          <button
            type="button"
            className="emp-baja-btn emp-baja-btn--ghost"
            onClick={cerrar}
            disabled={loading}
          >
            Cancelar
          </button>

          <button
            type="button"
            className="emp-baja-btn emp-baja-btn--solid-danger"
            onClick={confirmarBaja}
            disabled={loading}
          >
            Sí, dar de baja
          </button>
        </div>
      </div>
    </div>
  );
}
