import React, { useEffect, useMemo, useState } from "react";
import { FaChartPie, FaCheckCircle, FaExclamationTriangle } from "react-icons/fa";
import "../../Trabajadores/modales/ModalEditarTrabajador.css";
import "./ModalEquipoPago.css";
import { fetchJSONAuth } from "../../Global/api";

function formatARS(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "—";
  return number.toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  });
}

function formatPct(value) {
  const number = Number(value || 0);
  return Number.isFinite(number)
    ? number.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })
    : "0,00";
}

function comesFrom3Devs(item) {
  return (item?.rutas || []).some((route) =>
    String(route || "").toUpperCase().split("→").map((part) => part.trim()).includes("3DEVS")
  );
}

export default function ModalEquipoPago({ open, onClose, apiBase, action, data, idOrganizacion }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState(null);

  const periodLabel = useMemo(() => {
    const month = data?.mes || data?.mesLabel || "";
    const year = data?.anio || "";
    return `${month}${year ? ` / ${year}` : ""}` || "—";
  }, [data]);

  useEffect(() => {
    if (!open) return;
    setError("");
    setSummary(null);

    const run = async () => {
      if (!data?.id_cliente || !data?.anio || !data?.id_mes) {
        setError("Faltan datos del cliente o del período.");
        return;
      }
      setLoading(true);
      try {
        const url =
          `${apiBase}?action=${encodeURIComponent(action)}` +
          `&op=distribucion_cliente` +
          `&id_cliente=${encodeURIComponent(data.id_cliente)}` +
          `&anio=${encodeURIComponent(data.anio)}` +
          `&id_mes=${encodeURIComponent(data.id_mes)}`;
        const json = await fetchJSONAuth(url, { method: "GET" }, idOrganizacion);
        setSummary(json);
      } catch (requestError) {
        setError(requestError?.message || "No se pudo cargar la distribución del período.");
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [open, apiBase, action, data, idOrganizacion]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event) => event.key === "Escape" && !loading && onClose?.();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, loading, onClose]);

  if (!open) return null;

  const direct = summary?.regla_directa || [];
  const effective = summary?.items || [];
  const systems = summary?.sistemas || [];
  const isHistorical = summary?.estado_periodo === "pagado";
  const isEqualParts = summary?.modelo_reparto === "por_sistema";

  return (
    <div className="mi-modal__overlay" onClick={(event) => event.target === event.currentTarget && !loading && onClose?.()}>
      <div className="mi-modal__container mep-modal" role="dialog" aria-modal="true">
        <div className="mi-modal__header">
          <div className="mi-modal__head-left">
            <h2 className="mi-modal__title"><FaChartPie /> Distribución del ingreso</h2>
            <p className="mi-modal__subtitle">{data?.labelCliente || summary?.cliente?.nombre || "Cliente"} — {periodLabel}</p>
          </div>
          <button className="mi-modal__close" type="button" onClick={onClose} disabled={loading}>✕</button>
        </div>

        <div className="mit-modal__body mep-body">
          {error && <div className="mep-alert mep-alert--error">{error}</div>}
          {loading && <div className="mep-empty">Calculando distribución…</div>}

          {!loading && summary && (
            <>
              <div className={`mep-status ${summary.configurado ? "is-ok" : "is-warning"}`}>
                {summary.configurado ? <FaCheckCircle /> : <FaExclamationTriangle />}
                <div>
                  <strong>{isHistorical ? "Distribución histórica del pago" : "Estimación del período"}</strong>
                  <span>
                    {isHistorical
                      ? "Los pagos nuevos quedan congelados para que cambios futuros no alteren este período."
                      : isEqualParts
                        ? "Cada sistema se divide en partes iguales entre sus integrantes; se congela al registrar el pago."
                        : "Se calcula con los montos mensuales y la regla contractual vigente; se congela al registrar el pago."}
                  </span>
                </div>
              </div>

              <div className="mep-summary-grid">
                <div><small>Monto total</small><strong>{formatARS(summary.monto_total)}</strong></div>
                <div><small>Sistemas pagados</small><strong>{summary.sistemas_pagados || 0}</strong></div>
                <div><small>Sistemas estimados</small><strong>{summary.sistemas_estimados || 0}</strong></div>
                <div><small>Modelo</small><strong>{summary.modelo_reparto === "por_entidad" ? "Regla por entidad" : "Por sistema"}</strong></div>
              </div>

              {direct.length > 0 && (
                <section className="mep-section">
                  <h3>Regla institucional directa</h3>
                  <div className="mep-direct-list">
                    {direct.map((item, index) => (
                      <div key={`${item.id_trabajador || item.id_organizacion_beneficiaria}-${index}`}>
                        <span>{item.beneficiario_nombre}</span>
                        <b>{formatPct(item.porcentaje)}%</b>
                        <strong>{formatARS(item.monto_estimado)}</strong>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <section className="mep-section">
                <h3>Resultado efectivo por beneficiario</h3>
                {!effective.length ? (
                  <div className="mep-empty">No hay una distribución válida configurada.</div>
                ) : (
                  <div className="mep-tablewrap">
                    <table className="mep-table">
                      <thead><tr><th>Beneficiario</th><th>Origen</th><th>Criterio</th><th>Monto</th></tr></thead>
                      <tbody>
                        {effective.map((item, index) => (
                          <tr key={`${item.id_trabajador || item.id_organizacion_beneficiaria}-${index}`}>
                            <td><strong>{item.beneficiario_nombre}</strong><small>{item.alias_pago || item.rol || ""}</small></td>
                            <td>{item.rutas?.length ? item.rutas.join(" / ") : "Directo"}</td>
                            <td>
                              {isEqualParts
                                ? "Partes iguales por sistema"
                                : comesFrom3Devs(item)
                                  ? "Parte igual dentro de 3DEVS"
                                  : `${formatPct(item.porcentaje)}%`}
                            </td>
                            <td><b>{formatARS(item.monto_estimado)}</b></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="mep-section">
                <h3>Detalle por sistema</h3>
                <div className="mep-systems">
                  {systems.map((system) => (
                    <article key={system.id_sistema}>
                      <div>
                        <strong>{system.nombre}</strong>
                        <span>{system.pagado ? `Pagado ${system.fecha_pago || ""}` : "Pendiente / estimado"}</span>
                      </div>
                      <div><small>Monto base</small><b>{formatARS(system.monto_base)}</b></div>
                      <span className={system.configurado ? "is-ok" : "is-warning"}>{system.configurado ? "Configurado" : "Revisar reparto"}</span>
                    </article>
                  ))}
                  {!systems.length && <div className="mep-empty">El cliente no tiene sistemas exigibles en este período.</div>}
                </div>
              </section>
            </>
          )}

          <div className="mit-actions">
            <button type="button" className="mit-btn mit-btn--ghost" onClick={onClose} disabled={loading}>Cerrar</button>
          </div>
        </div>
      </div>
    </div>
  );
}
