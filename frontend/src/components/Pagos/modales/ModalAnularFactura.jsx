// src/components/Pagos/modales/ModalAnularFactura.jsx
import React, { useEffect, useRef, useState } from "react";
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

function moneyARS(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "—";
  try {
    return n.toLocaleString("es-AR", { style: "currency", currency: "ARS" });
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

export default function ModalAnularFactura({
  open,
  onClose,
  onConfirm,
  loading = false,
  data = null,
}) {
  const [confirmado, setConfirmado] = useState(false);
  const confirmRef = useRef(null);
  const tieneCAE = Boolean(data?.cae && !/^0+$/.test(String(data.cae)));

  useEffect(() => {
    if (!open) return;
    setConfirmado(false);
    setTimeout(() => confirmRef.current?.focus(), 0);
  }, [open, data?.id_factura]);

  useEffect(() => {
    if (!open) return undefined;

    const onKey = (e) => {
      if (e.key === "Escape" && !loading) onClose?.();
      if (e.key === "Enter" && confirmado && !loading) onConfirm?.();
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, onConfirm, confirmado, loading]);

  if (!open) return null;

  const cliente = data?.labelCliente || data?.cliente || "—";
  const sistema = data?.labelSistema || data?.sistema || "—";
  const idFactura = data?.id_factura || "—";
  const importe = data?.total_ars ?? data?.monto_ars ?? data?.importe ?? null;

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
          {tieneCAE ? "Emitir Nota de Crédito" : "Eliminar factura local"}
        </h3>

        <p className="mpdel-body">
          {tieneCAE ? (
            <>
              Se emitirá una <b>Nota de Crédito C en ARCA</b> asociada a esta factura. Al finalizar,
              la factura quedará marcada como anulada en el sistema y se descargará el PDF con su QR fiscal.
            </>
          ) : (
            <>
              Esta factura no tiene un CAE fiscal válido. Se eliminarán el registro y su PDF local,
              sin borrar el pago del período.
            </>
          )}
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
            <span className="mpdel-label">Importe</span>
            <span className="mpdel-value">{moneyARS(importe)}</span>
          </div>
          {tieneCAE ? (
            <div className="mpdel-row">
              <span className="mpdel-label">CAE factura</span>
              <span className="mpdel-value">{data?.cae || "—"}</span>
            </div>
          ) : null}
        </div>

        <label className="mpdel-confirm">
          <input
            ref={confirmRef}
            type="checkbox"
            checked={confirmado}
            onChange={(e) => setConfirmado(e.target.checked)}
            disabled={loading}
          />
          <span className="mpdel-confirm__box" aria-hidden="true" />
          <span className="mpdel-confirm__text">
            {tieneCAE ? (
              <>
                Confirmo que deseo <b>emitir la Nota de Crédito fiscal</b> por el importe total de la factura.
              </>
            ) : (
              <>
                Confirmo que deseo <b>eliminar esta factura local</b>.
              </>
            )}
          </span>
        </label>

        <div className="mpdel-actions">
          <button
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
            disabled={loading || !confirmado}
            title={!confirmado ? "Marcá la confirmación para continuar." : ""}
          >
            {loading
              ? tieneCAE
                ? "Emitiendo Nota de Crédito..."
                : "Eliminando factura..."
              : tieneCAE
              ? "Emitir Nota de Crédito + PDF"
              : "Eliminar factura"}
          </button>
        </div>
      </div>
    </div>
  );
}
