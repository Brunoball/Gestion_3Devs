// src/components/Pagos/modales/ModalEliminarPago.jsx
import React, { useEffect, useRef } from "react";
import { FaTrashAlt, FaTimes } from "react-icons/fa";
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

  const cerrar = () => {
    if (loading) return;
    onClose?.();
  };

  return (
    <div
      className="mpdel-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-eliminar-pago-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) cerrar();
      }}
    >
      <div className="mpdel-modal mpdel-modal--danger">
        <button
          className="mpdel-close"
          type="button"
          onClick={cerrar}
          aria-label="Cerrar"
          disabled={loading}
        >
          <FaTimes />
        </button>

        <div className="mpdel-icon mpdel-icon--danger" aria-hidden="true">
          <FaTrashAlt />
        </div>

        <h3
          id="modal-eliminar-pago-title"
          className="mpdel-title mpdel-title--danger"
        >
          Eliminar pago
        </h3>

        <p className="mpdel-body">
          ¿Seguro que querés eliminar este pago definitivamente?
          <br />
          Esta acción no se puede deshacer.
        </p>

        <div className="mpdel-card">
          <div className="mpdel-row">
            <span className="mpdel-label">ID Pago</span>
            <span className="mpdel-value">{idPago}</span>
          </div>
          <div className="mpdel-row">
            <span className="mpdel-label">Cliente</span>
            <span className="mpdel-value">{cliente}</span>
          </div>
          <div className="mpdel-row">
            <span className="mpdel-label">Sistema</span>
            <span className="mpdel-value">{sistema}</span>
          </div>
        </div>

        <div className="mpdel-actions">
          <button
            ref={cancelRef}
            type="button"
            className="mpdel-btn mpdel-btn--ghost"
            onClick={cerrar}
            disabled={loading}
          >
            Cancelar
          </button>

          <button
            type="button"
            className="mpdel-btn mpdel-btn--solid-danger"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "Eliminando..." : "Eliminar"}
          </button>
        </div>
      </div>
    </div>
  );
}
