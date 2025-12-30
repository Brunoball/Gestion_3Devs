import React, { useEffect, useRef, useState } from "react";
import Toast from "../../Global/Toast";
import "./EliminarClienteModal.css";
import { FaTrashAlt } from "react-icons/fa";

export default function QuitarTrabajadorModal({
  open,
  onClose,
  onConfirm,
  loading: loadingProp = false,
  sistema,
  trabajador,
  mensaje = "¿Quitar este trabajador del sistema?",
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

    // validaciones mínimas
    if (!sistema?.id_sistema) {
      setToast({ show: true, tipo: "error", mensaje: "Falta el ID del sistema." });
      submitLockRef.current = false;
      return;
    }
    if (!trabajador?.id) {
      setToast({ show: true, tipo: "error", mensaje: "Falta el ID del trabajador." });
      submitLockRef.current = false;
      return;
    }

    try {
      const ok = await onConfirm?.(sistema, trabajador);
      if (ok === false) {
        submitLockRef.current = false;
      } else {
        cerrarForzado();
      }
    } catch (e) {
      setToast({
        show: true,
        tipo: "error",
        mensaje: e?.message || "Error al quitar el trabajador.",
      });
      submitLockRef.current = false;
    }
  };

  const disabled = !!loadingProp;
  const nombreSis = (sistema?.nombre || "").trim() || "este sistema";
  const nombreTrab =
    ((trabajador?.apellido || "").trim() && (trabajador?.nombre || "").trim())
      ? `${trabajador.apellido}, ${trabajador.nombre}`
      : (trabajador?.nombre || "").trim() || "este trabajador";

  return (
    <div
      className="cli-del-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cli-qt-title"
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

        <h3 id="cli-qt-title" className="cli-del-modal__title cli-del-modal__title--danger">
          Quitar trabajador
        </h3>

        <p className="cli-del-modal__body">
          ¿Quitar a <strong>{nombreTrab}</strong> de <strong>{nombreSis}</strong>?
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
            Sí, quitar
          </button>
        </div>
      </div>
    </div>
  );
}
