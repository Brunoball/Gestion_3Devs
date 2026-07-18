// src/components/Clientes/modales/EliminarClienteModal.jsx
import React, { useEffect, useRef, useState } from "react";
import Toast from "../../Global/Toast";
import "./EliminarClienteModal.css";
import { FaTrashAlt } from "react-icons/fa";

export default function EliminarClienteModal({
  open,
  onClose,
  onConfirm,
  loading: loadingProp = false,
  cliente,
  mensaje = "¿Eliminar este cliente? También se eliminarán sus sistemas.",
}) {
  const [toast, setToast] = useState({ show: false, tipo: "info", mensaje: "" });
  const closeToast = () => setToast((s) => ({ ...s, show: false }));

  // ✅ Lock anti doble click / doble submit
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

  // ✅ cierre forzado (para cerrar después de confirmar, aunque loading esté true)
  const cerrarForzado = () => onClose?.();

  const confirmar = async () => {
    if (submitLockRef.current) return;
    submitLockRef.current = true;

    // si te pasan cliente y falta id, avisamos
    if (cliente && !cliente?.id_cliente) {
      setToast({
        show: true,
        tipo: "error",
        mensaje: "Falta el ID del cliente.",
      });
      submitLockRef.current = false;
      return;
    }

    try {
      const ok = await onConfirm?.(cliente);

      // si el padre devuelve false, consideramos que no se confirmó (y liberamos lock)
      if (ok === false) {
        submitLockRef.current = false;
      } else {
        // el padre normalmente hace toast y recarga
        cerrarForzado();
      }
    } catch (e) {
      setToast({
        show: true,
        tipo: "error",
        mensaje: e?.message || "Error al eliminar el cliente.",
      });
      submitLockRef.current = false;
    }
  };

  const nombre = (cliente?.nombre || "").trim() || "este cliente";
  const disabled = !!loadingProp;

  return (
    <div
      className="cli-del-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cli-del-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) cerrar();
      }}
    >
      {toast.show && (
        <Toast
          tipo={toast.tipo}
          mensaje={toast.mensaje}
          onClose={closeToast}
        />
      )}

      <div className="cli-del-modal cli-del-modal--danger">
        <div className="cli-del-modal__icon cli-del-modal__icon--danger" aria-hidden="true">
          <FaTrashAlt />
        </div>

        <h3 id="cli-del-title" className="cli-del-modal__title cli-del-modal__title--danger">
          Eliminar cliente
        </h3>

        <p className="cli-del-modal__body">
          ¿Eliminar a <strong>{nombre}</strong>?
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
