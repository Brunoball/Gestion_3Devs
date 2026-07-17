import React, { useEffect, useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalculator,
  faCircleInfo,
  faRoute,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";

import "../../Trabajadores/modales/ModalEditarTrabajador.css";
import "./ModalDetalleLiquidacionTrabajador.css";

const money = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const percent = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

export default function ModalDetalleLiquidacionTrabajador({
  open,
  trabajador,
  organizacion,
  periodo,
  onClose,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const rows = useMemo(
    () => (Array.isArray(trabajador?.detalle) ? trabajador.detalle : []),
    [trabajador]
  );

  if (!open || !trabajador) return null;

  const nombre = `${trabajador.apellido || ""} ${trabajador.nombre || ""}`.trim() || "Trabajador";
  const rutas = Array.from(
    new Set(rows.flatMap((row) => (Array.isArray(row?.rutas) ? row.rutas : [])))
  );

  return (
    <div
      className="mi-modal__overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Detalle de liquidación"
      onClick={(event) => event.target.classList.contains("mi-modal__overlay") && onClose?.()}
    >
      <div
        className="mi-modal__container rdl-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mi-modal__header">
          <div className="mi-modal__head-left">
            <h2 className="mi-modal__title">Detalle de liquidación</h2>
            <p className="mi-modal__subtitle">
              {nombre} • {organizacion?.codigo || organizacion?.nombre || "Entidad"}
              {periodo ? ` • ${periodo}` : ""}
            </p>
          </div>
          <button className="mi-modal__close" type="button" onClick={onClose} aria-label="Cerrar">
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        <div className="mit-modal__body">
          <div className="rdl-summary">
            <div>
              <span>Participación efectiva</span>
              <strong>{percent.format(Number(trabajador.porcentaje_efectivo || 0))}%</strong>
            </div>
            <div>
              <span>Distribución bruta</span>
              <strong>{money.format(Number(trabajador.monto_bruto || 0))}</strong>
            </div>
            <div>
              <span>Base neta asignada</span>
              <strong>{money.format(Number(trabajador.monto_sistemas || 0))}</strong>
            </div>
            <div>
              <span>Total con reembolsos</span>
              <strong>{money.format(Number(trabajador.monto || 0))}</strong>
            </div>
          </div>

          {trabajador.liquidacion_indirecta ? (
            <div className="rdl-notice">
              <FontAwesomeIcon icon={faRoute} />
              Esta participación llega por una distribución entre entidades. El pago directo y su comprobante se gestionan en la entidad de origen del trabajador.
            </div>
          ) : null}

          {trabajador.usa_fallback_historico ? (
            <div className="rdl-warning">
              <FontAwesomeIcon icon={faCircleInfo} />
              Al menos un pago antiguo no tenía snapshot histórico y se calculó con la regla vigente.
            </div>
          ) : null}

          <div className="rdl-table-wrap">
            <table className="rdl-table">
              <thead>
                <tr>
                  <th>Período</th>
                  <th>Cliente / sistema</th>
                  <th>Pago</th>
                  <th>Porcentaje</th>
                  <th>Bruto</th>
                  <th>Neto</th>
                  <th>Origen</th>
                </tr>
              </thead>
              <tbody>
                {rows.length ? (
                  rows.map((row, index) => (
                    <tr key={`${row.id_pago || "p"}-${row.id_sistema || "s"}-${index}`}>
                      <td>{String(row.id_mes || "-").padStart(2, "0")}/{row.anio || "-"}</td>
                      <td>
                        <b>{row.cliente || "—"}</b>
                        <span>{row.sistema || "—"}</span>
                      </td>
                      <td>{money.format(Number(row.monto_pago || 0))}</td>
                      <td>{percent.format(Number(row.porcentaje_pago || 0))}%</td>
                      <td>{money.format(Number(row.monto_bruto || 0))}</td>
                      <td>{money.format(Number(row.monto_neto || 0))}</td>
                      <td>
                        {row.origen === "snapshot_pago" ? "Histórico" : "Regla vigente"}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="7" className="rdl-empty">Sin pagos distribuidos en este período.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="rdl-footer-info">
            <FontAwesomeIcon icon={faCalculator} />
            <span>
              Ajuste proporcional por egresos: <b>{money.format(Number(trabajador.descuento_egresos || 0))}</b>.
              Reembolsos: <b>{money.format(Number(trabajador.monto_reembolso || 0))}</b>.
            </span>
          </div>

          {rutas.length ? (
            <div className="rdl-routes">
              <b>Rutas de distribución:</b> {rutas.join(" • ")}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
