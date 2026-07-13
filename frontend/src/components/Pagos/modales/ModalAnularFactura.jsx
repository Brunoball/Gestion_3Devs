// src/components/Pagos/modales/ModalAnularFactura.jsx
import React, { useEffect, useRef } from "react";
import { FaBan, FaFileInvoiceDollar, FaTimes } from "react-icons/fa";
import "./ModalEliminarPago.css";

function fmtComprobante(data) {
  const tipo = Number(data?.cbte_tipo || 0);
  const pv = data?.pto_vta ? String(data.pto_vta).padStart(4, "0") : "—";
  const nro = data?.cbte_nro ? String(data.cbte_nro).padStart(8, "0") : "—";
  if (!tipo && pv === "—" && nro === "—") return "—";
  const nombre = tipo === 11 ? "Factura C" : tipo ? `Tipo ${tipo}` : "Factura";
  return `${nombre} ${pv}-${nro}`;
}

export default function ModalAnularFactura({
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

  const cliente = data?.labelCliente || data?.cliente || "—";
  const sistema = data?.labelSistema || data?.sistema || "—";
  const idFactura = data?.id_factura || "—";
  const tieneCAE = Boolean(data?.cae && String(data.cae) !== "00000000000000");

  const cerrar = () => {
    if (loading) return;
    onClose?.();
  };

  return (
    <div
      className="mpdel-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-anular-factura-title"
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
          {tieneCAE ? <FaFileInvoiceDollar /> : <FaBan />}
        </div>

        <h3 id="modal-anular-factura-title" className="mpdel-title mpdel-title--danger">
          {tieneCAE ? "Anular factura con Nota de Crédito" : "Eliminar factura"}
        </h3>

        <p className="mpdel-body">
          {tieneCAE ? (
            <>
              Esta factura tiene CAE. Primero se emitirá una <b>Nota de Crédito C</b> asociada
              en ARCA, se descargará un PDF simple con el QR oficial y después se limpiará la factura del sistema.
            </>
          ) : (
            <>
              Esta factura no tiene CAE fiscal válido. Se eliminará el registro y el PDF guardado.
            </>
          )}
          <br />
          El pago no se elimina: solo se desvincula la factura para poder generar una nueva.
        </p>

        <div className="mpdel-card">
          <div className="mpdel-row">
            <span className="mpdel-label">ID Factura</span>
            <span className="mpdel-value">{idFactura}</span>
          </div>
          <div className="mpdel-row">
            <span className="mpdel-label">Cliente</span>
            <span className="mpdel-value">{cliente}</span>
          </div>
          <div className="mpdel-row">
            <span className="mpdel-label">Sistema</span>
            <span className="mpdel-value">{sistema}</span>
          </div>
          <div className="mpdel-row">
            <span className="mpdel-label">Comprobante</span>
            <span className="mpdel-value">{fmtComprobante(data)}</span>
          </div>
          <div className="mpdel-row">
            <span className="mpdel-label">CAE</span>
            <span className="mpdel-value">{data?.cae || "—"}</span>
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
            {loading
              ? tieneCAE
                ? "Emitiendo NC..."
                : "Eliminando..."
              : tieneCAE
              ? "Emitir NC, descargar PDF y eliminar factura"
              : "Eliminar factura"}
          </button>
        </div>
      </div>
    </div>
  );
}
