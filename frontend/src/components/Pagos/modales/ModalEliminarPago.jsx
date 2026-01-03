// src/components/Pagos/modales/ModalEliminarPago.jsx
import React, { useEffect, useRef } from "react";
import { FaTimes, FaTrashAlt } from "react-icons/fa";
import "./ModalEliminarPago.css";

export default function ModalEliminarPago({
  open,
  onClose,
  onConfirm,
  loading = false,
  data = null,
}) {
  const cancelRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setTimeout(() => cancelRef.current?.focus(), 0);

    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
      if (e.key === "Enter") onConfirm?.();
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, onConfirm]);

  if (!open) return null;

  const cliente = data?.labelCliente || "—";
  const sistema = data?.labelSistema || "—";
  const idPago = data?.id_pago || "—";

  return (
    <div className="melim-overlay" onMouseDown={onClose}>
      <div
        className="melim-modal"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="melim-header">
          <div className="melim-title">
            <FaTrashAlt />
            <span>Eliminar pago</span>
          </div>

          <button
            className="melim-close"
            onClick={onClose}
            type="button"
            aria-label="Cerrar"
          >
            <FaTimes />
          </button>
        </div>

        <div className="melim-body">
          <p className="melim-warning">
            ¿Seguro que querés eliminar este pago? Esta acción no se puede deshacer.
          </p>

          <div className="melim-card">
            <div className="melim-row">
              <span className="melim-label">ID Pago:</span>
              <span className="melim-value">{idPago}</span>
            </div>
            <div className="melim-row">
              <span className="melim-label">Cliente:</span>
              <span className="melim-value">{cliente}</span>
            </div>
            <div className="melim-row">
              <span className="melim-label">Sistema:</span>
              <span className="melim-value">{sistema}</span>
            </div>
          </div>
        </div>

        <div className="melim-actions">
          <button
            ref={cancelRef}
            className="melim-btn melim-cancel"
            onClick={onClose}
            type="button"
            disabled={loading}
          >
            Cancelar
          </button>

          <button
            className="melim-btn melim-confirm"
            onClick={onConfirm}
            type="button"
            disabled={loading}
          >
            {loading ? "Eliminando..." : "Sí, eliminar"}
          </button>
        </div>
      </div>
    </div>
  );
}
