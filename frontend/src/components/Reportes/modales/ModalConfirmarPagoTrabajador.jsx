import React, { useEffect, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleCheck, faXmark } from "@fortawesome/free-solid-svg-icons";
import "./ModalConfirmarPagoTrabajador.css";

const nfPesos = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export default function ModalConfirmarPagoTrabajador({
  open,
  trabajador,
  periodo,
  loading = false,
  onClose,
  onConfirm,
}) {
  const cancelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => cancelRef.current?.focus(), 0);

    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !loading) onClose?.();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [loading, onClose, open]);

  if (!open || !trabajador || !periodo) return null;

  const nombre =
    `${trabajador.apellido || ""} ${trabajador.nombre || ""}`.trim() ||
    "el trabajador";
  const monto = nfPesos.format(Number(trabajador.monto || 0));
  const periodoLabel = String(periodo.label || "el período seleccionado").toUpperCase();

  const cerrar = () => {
    if (!loading) onClose?.();
  };

  return (
    <div
      className="rcp-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rcp-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) cerrar();
      }}
    >
      <div className="rcp-modal" onMouseDown={(event) => event.stopPropagation()}>
        <button
          type="button"
          className="rcp-close"
          aria-label="Cerrar"
          onClick={cerrar}
          disabled={loading}
        >
          <FontAwesomeIcon icon={faXmark} />
        </button>

        <div className="rcp-icon" aria-hidden="true">
          <FontAwesomeIcon icon={faCircleCheck} />
        </div>

        <h2 id="rcp-title" className="rcp-title">
          Confirmar pago de liquidación
        </h2>

        <p className="rcp-text">
          ¿Marcar como pagada la liquidación de <strong>{nombre}</strong> por{" "}
          <strong>{monto}</strong>?
        </p>

        <div className="rcp-warning">
          El monto quedará fijo para <strong>{periodoLabel}</strong> y luego se
          obtendrá desde el histórico de liquidaciones pagadas.
        </div>

        <div className="rcp-actions">
          <button
            ref={cancelRef}
            type="button"
            className="rcp-btn rcp-btn--secondary"
            onClick={cerrar}
            disabled={loading}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="rcp-btn rcp-btn--primary"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "Guardando..." : "Marcar como pagado"}
          </button>
        </div>
      </div>
    </div>
  );
}
