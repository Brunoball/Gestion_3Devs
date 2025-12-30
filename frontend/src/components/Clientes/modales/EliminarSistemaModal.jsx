import React, { useEffect, useRef, useState } from "react";
import Toast from "../../Global/Toast";
import "./EliminarClienteModal.css";
import { FaTrashAlt } from "react-icons/fa";

export default function EliminarSistemaModal({
  open,
  onClose,
  onConfirm,
  loading: loadingProp = false,
  sistema,
  mensaje = "¿Eliminar este sistema?",
}) {
  const [toast, setToast] = useState({ show: false, tipo: "info", mensaje: "" });
  const closeToast = () => setToast((s) => ({ ...s, show: false }));

  const submitLockRef = useRef(false);

  useEffect(() => {
    if (!open) return;

    submitLockRef.current = false;
    setToast((s) => ({ ...s, show: false }));

    const handleEsc = (e) => {
      if (e.key === "Escape") onClose?.();
    };

    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [open, onClose]);

  if (!open) return null;

  const cerrar = () => {
    if (loadingProp) return;
    onClose?.();
  };

  const cerrarForzado = () => onClose?.();

  const confirmar = async () => {
    if (submitLockRef.current) return;
    submitLockRef.current = true;

    if (sistema && !sistema?.id_sistema) {
      setToast({ show: true, tipo: "error", mensaje: "Falta el ID del sistema." });
      submitLockRef.current = false;
      return;
    }

    try {
      const ok = await onConfirm?.(sistema);
      if (ok === false) {
        submitLockRef.current = false;
      } else {
        cerrarForzado();
      }
    } catch (e) {
      setToast({
        show: true,
        tipo: "error",
        mensaje: e?.message || "Error al eliminar el sistema.",
      });
      submitLockRef.current = false;
    }
  };

  const disabled = !!loadingProp;
  const nombre = (sistema?.nombre || "").trim() || "este sistema";

  return (
    <div
      className="cli-del-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cli-sysdel-title"
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

      <div className="cli-del-modal cli-del-modal--danger">
        <div className="cli-del-modal__icon cli-del-modal__icon--danger" aria-hidden="true">
          <FaTrashAlt />
        </div>

        <h3
          id="cli-sysdel-title"
          className="cli-del-modal__title cli-del-modal__title--danger"
        >
          Eliminar sistema
        </h3>

        <p className="cli-del-modal__body">
          ¿Eliminar <strong>{nombre}</strong>?
          <br />
          <span style={{ opacity: 0.95 }}>{mensaje}</span>
        </p>

        <div className="cli-del-modal__actions">
          <button
            type="button"
            className="cli-del-btn cli-del-btn--ghost"
            onClick={cerrar}
            disabled={disabled}
          >
            Cancelar
          </button>

          <button
            type="button"
            className="cli-del-btn cli-del-btn--solid-danger"
            onClick={confirmar}
            disabled={disabled}
          >
            Sí, eliminar
          </button>
        </div>
      </div>
    </div>
  );
}
