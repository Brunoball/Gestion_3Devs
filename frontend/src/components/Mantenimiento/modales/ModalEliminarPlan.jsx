import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import "./ModalPlan.css";
import { FaTrashAlt } from "react-icons/fa";

export default function ModalEliminarPlan({
  open,
  plan,
  onClose,
  onConfirm,
  loading,
}) {
  const cancelRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setTimeout(() => cancelRef.current?.focus(), 0);

    const handleEsc = (e) => {
      if (e.key === "Escape" && !loading) onClose?.();
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [open, onClose, loading]);

  if (!open) return null;

  const cerrar = () => {
    if (loading) return;
    onClose?.();
  };

  return createPortal(
    <div
      className="mnt-plan-modal__overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) cerrar();
      }}
    >
      <div className="mnt-plan-modal mnt-plan-modal--confirm" role="dialog" aria-modal="true" aria-labelledby="modal-eliminar-plan-title">
        <div className="mnt-plan-modal__confirm-body">
          <div className="mnt-plan-modal__danger-icon" aria-hidden="true"><FaTrashAlt /></div>
          <h3 id="modal-eliminar-plan-title" className="mnt-plan-modal__confirm-title">Dar de baja plan</h3>
          <p className="mnt-plan-modal__confirm-text">
            ¿Querés dar de baja <strong>{plan?.nombre || "este plan"}</strong>?
            <br />
            Dejará de estar disponible para nuevas asignaciones, pero los sistemas que ya lo usan conservarán su referencia histórica.
          </p>
        </div>

        <div className="mnt-plan-modal__footer">
          <button
            ref={cancelRef}
            type="button"
            className="mnt-plan-modal__button mnt-plan-modal__button--ghost"
            onClick={cerrar}
            disabled={loading}
          >
            Cancelar
          </button>

          <button
            type="button"
            className="mnt-plan-modal__button mnt-plan-modal__button--danger"
            onClick={() => onConfirm?.(plan)}
            disabled={loading}
          >
            {loading ? "Procesando..." : "Dar de baja"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
