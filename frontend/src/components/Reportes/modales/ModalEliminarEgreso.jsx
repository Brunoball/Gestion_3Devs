import React, { useEffect, useRef } from "react";
import "./ModalEliminarEgreso.css";
import { FaTrashAlt } from "react-icons/fa";

export default function ModalEliminarEgreso({
  open,
  egreso,
  onClose,
  onConfirm,
  loading,
}) {
  const cancelRef = useRef(null);

  useEffect(() => {
    if (!open) return;

    setTimeout(() => cancelRef.current?.focus(), 0);

    const handleEsc = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [open, onClose]);

  if (!open) return null;

  const cerrar = () => {
    if (loading) return;
    onClose?.();
  };

  const titulo = "Eliminar egreso";
  const nombre =
    egreso?.concepto ||
    egreso?.descripcion ||
    "este egreso";

  return (
    <div
      className="emp-baja-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-eliminar-egreso-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) cerrar();
      }}
    >
      <div className="emp-baja-modal emp-baja-modal--danger">
        <div
          className="emp-baja-modal__icon emp-baja-modal__icon--danger"
          aria-hidden="true"
        >
          <FaTrashAlt />
        </div>

        <h3
          id="modal-eliminar-egreso-title"
          className="emp-baja-modal__title emp-baja-modal__title--danger"
        >
          {titulo}
        </h3>

        <p className="emp-baja-modal__body">
          ¿Seguro que querés eliminar{" "}
          <strong>{nombre}</strong> definitivamente?
          <br />
          Esta acción no se puede deshacer.
        </p>

        <div className="emp-baja-modal__actions">
          <button
            ref={cancelRef}
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
            onClick={() => onConfirm?.(egreso)}
            disabled={loading}
          >
            {loading ? "Eliminando..." : "Eliminar"}
          </button>
        </div>
      </div>
    </div>
  );
}
