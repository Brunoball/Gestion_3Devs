// src/components/Pagos/modales/ModalPago.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { FaCoins, FaTimes, FaCheck, FaEye } from "react-icons/fa";
import BASE_URL from "../../../config/config";

// ✅ Reutiliza la estética del modal "EditarTrabajador"
import "../../Trabajadores/modales/ModalEditarTrabajador.css";

// ✅ Estilos específicos SOLO para cosas de pago/factura
import "./ModalPago.css";

/* =========================
   Helpers
========================= */
function sanitizeMoneyTyping(raw) {
  return String(raw ?? "").replace(/[^\d.,]/g, "");
}

function parseMoneyInput(raw) {
  if (raw == null) return 0;
  const s = String(raw).trim();
  if (!s) return 0;

  const cleaned = s.replace(/\$/g, "").replace(/\s/g, "");
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;

  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function moneyARS(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "$0,00";
  try {
    return n.toLocaleString("es-AR", { style: "currency", currency: "ARS" });
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

function getMonthNameEs(idMes) {
  const idx = Number(idMes) - 1;
  if (!Number.isFinite(idx) || idx < 0 || idx > 11) return "";
  const name = new Date(2000, idx, 1).toLocaleString("es-ES", { month: "long" });
  return String(name || "").toUpperCase();
}

/* =========================
   ModalPago (estética mi-*)
========================= */
/**
 * Recibe:
 * - anioSeleccionado: number
 * - mesSeleccionado: "ENERO" | 1..12 | "1"
 */
export default function ModalPago({
  id_sistema,
  cerrarModal,
  onPagoRealizado,
  anioSeleccionado,
  mesSeleccionado,
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [detalle, setDetalle] = useState(null);
  const [mediosPago, setMediosPago] = useState([]);
  const [idMedioPago, setIdMedioPago] = useState("");

  const [factura, setFactura] = useState(null);
  const [pago, setPago] = useState(null);

  const [monto, setMonto] = useState("");

  const [fechaPago, setFechaPago] = useState(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  });

  const [pagoExitoso, setPagoExitoso] = useState(false);

  const API = useMemo(() => `${BASE_URL}/api.php`, []);
  const LISTAS_API = useMemo(() => `${API}?action=listas`, [API]);

  const fetchJSON = useCallback(async (url, opts) => {
    const res = await fetch(url, opts);
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    if (!res.ok) {
      const msg = data?.mensaje || data?.error || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    if (data && typeof data === "object" && data?.exito === false) {
      throw new Error(data?.mensaje || "Error en el servidor");
    }
    return data;
  }, []);

  const normalizarMedios = useCallback((data) => {
    const raw =
      data?.listas?.medios_pago || data?.medios_pago || data?.mediosPago || [];
    const arr = Array.isArray(raw) ? raw : [];
    return arr
      .map((x) => ({
        id_medio_pago: Number(x?.id_medio_pago ?? x?.id ?? null),
        nombre: String(x?.nombre ?? x?.Medio_Pago ?? x?.medio_pago ?? "").trim(),
      }))
      .filter((x) => Number.isFinite(x.id_medio_pago) && x.nombre)
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, []);

  // Resolver mes a id_mes 1..12
  const idMes = useMemo(() => {
    const m = mesSeleccionado;
    if (m == null || m === "") return 0;

    if (typeof m === "number" && Number.isFinite(m)) {
      const n = Math.trunc(m);
      return n >= 1 && n <= 12 ? n : 0;
    }

    const s = String(m).trim();
    if (!s) return 0;

    if (/^\d+$/.test(s)) {
      const n = Number(s);
      return n >= 1 && n <= 12 ? n : 0;
    }

    const map = {
      ENERO: 1,
      FEBRERO: 2,
      MARZO: 3,
      ABRIL: 4,
      MAYO: 5,
      JUNIO: 6,
      JULIO: 7,
      AGOSTO: 8,
      SEPTIEMBRE: 9,
      SETIEMBRE: 9,
      OCTUBRE: 10,
      NOVIEMBRE: 11,
      DICIEMBRE: 12,
    };

    return map[String(s).toUpperCase()] || 0;
  }, [mesSeleccionado]);

  const anio = useMemo(() => {
    const n = Number(anioSeleccionado);
    return Number.isFinite(n) && n >= 2000 && n <= 2100 ? n : 0;
  }, [anioSeleccionado]);

  const periodoLabel = useMemo(() => {
    const mn = getMonthNameEs(idMes);
    if (!mn || !anio) return "Período no definido";
    return `${mn} ${anio}`;
  }, [idMes, anio]);

  /* =========================================================
     ESC cierra + click overlay cierra (misma UX que mi-modal)
  ========================================================= */
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && cerrarModal?.();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [cerrarModal]);

  /* =========================================================
     Cargar listas (medios de pago)
  ========================================================= */
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const dataListas = await fetchJSON(LISTAS_API, { method: "GET" });
        if (!alive) return;

        const mp = normalizarMedios(dataListas);
        setMediosPago(mp);

        if (!idMedioPago && mp.length) {
          setIdMedioPago(String(mp[0].id_medio_pago));
        }
      } catch {
        if (!alive) return;
        setMediosPago([]);
      }
    })();

    return () => {
      alive = false;
    };
  }, [LISTAS_API, fetchJSON, normalizarMedios, idMedioPago]);

  /* =========================================================
     Detalle período
     GET /api.php?action=pagos&op=detalle_periodo&id_sistema=..&anio=..&id_mes=..
  ========================================================= */
  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      setError("");
      setPagoExitoso(false);
      setFactura(null);
      setPago(null);
      setDetalle(null);
      setMonto("");

      try {
        if (!id_sistema) throw new Error("Falta id_sistema");
        if (!anio) throw new Error("Falta año seleccionado");
        if (!idMes) throw new Error("Falta mes seleccionado");

        const url =
          `${API}?action=pagos&op=detalle_periodo` +
          `&id_sistema=${encodeURIComponent(id_sistema)}` +
          `&anio=${encodeURIComponent(anio)}` +
          `&id_mes=${encodeURIComponent(idMes)}`;

        const data = await fetchJSON(url, { method: "GET" });
        if (!alive) return;

        setDetalle(data?.detalle || data?.sistema || null);
        setPago(data?.pago || null);
        setFactura(data?.factura || null);

        const m1 = Number(data?.factura?.total_ars);
        const m2 = Number(data?.factura?.monto_ars);
        const m3 = Number(data?.pago?.monto);

        const finalMonto =
          Number.isFinite(m1) && m1 > 0
            ? m1
            : Number.isFinite(m2) && m2 > 0
            ? m2
            : Number.isFinite(m3) && m3 > 0
            ? m3
            : 0;

        setMonto(finalMonto ? String(finalMonto) : "");

        if (data?.pago?.id_medio_pago) setIdMedioPago(String(data.pago.id_medio_pago));
        if (data?.pago?.fecha_pago) setFechaPago(String(data.pago.fecha_pago).slice(0, 10));
      } catch (e) {
        if (!alive) return;
        setError(e?.message || "Error al obtener el detalle del período.");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [API, fetchJSON, id_sistema, anio, idMes]);

  const tituloCliente = useMemo(() => {
    const c =
      detalle?.cliente?.nombre ||
      detalle?.cliente_nombre ||
      detalle?.cliente ||
      detalle?.cliente_nombre;
    const s =
      detalle?.sistema?.nombre ||
      detalle?.sistema_nombre ||
      detalle?.sistema ||
      detalle?.nombre_sistema ||
      detalle?.nombre;
    if (c && s) return `${c} • ${s}`;
    return s || c || "Registro de Pago";
  }, [detalle]);

  const montoArsNum = useMemo(() => {
    const n = parseMoneyInput(monto);
    return Math.round(n * 100) / 100;
  }, [monto]);

  const montoEsFijo = useMemo(() => {
    const t = Number(factura?.total_ars);
    const m = Number(factura?.monto_ars);
    return (Number.isFinite(t) && t > 0) || (Number.isFinite(m) && m > 0);
  }, [factura]);

  const pdfUrl = useMemo(() => {
    const p = factura?.pdf_path || factura?.pdf_url || null;
    if (!p) return null;
    return String(p);
  }, [factura]);

  // ✅ si no hay factura, bloquear pago y mostrar cartel
  const sinFactura = useMemo(() => {
    const hasId =
      factura?.id_factura != null || factura?.cbte_nro != null || factura?.cae != null;
    const hasPdf = Boolean(pdfUrl);
    const hasMonto =
      (Number.isFinite(Number(factura?.total_ars)) && Number(factura?.total_ars) > 0) ||
      (Number.isFinite(Number(factura?.monto_ars)) && Number(factura?.monto_ars) > 0);

    return !hasId && !hasPdf && !hasMonto;
  }, [factura, pdfUrl]);

  const handleAbrirFactura = useCallback(() => {
    if (!pdfUrl) return;
    window.open(pdfUrl, "_blank", "noopener,noreferrer");
  }, [pdfUrl]);

  const puedePagar = useMemo(() => {
    if (sinFactura) return false;
    if (!id_sistema) return false;
    if (!anio || !idMes) return false;
    if (!fechaPago) return false;
    if (!idMedioPago) return false;
    if (!Number.isFinite(montoArsNum) || montoArsNum <= 0) return false;
    if (pago?.id_pago) return false; // ✅ si ya hay pago, no permitir otro
    return true;
  }, [sinFactura, id_sistema, anio, idMes, fechaPago, idMedioPago, montoArsNum, pago]);

  const handleRealizarPago = useCallback(async () => {
    if (!puedePagar) return;

    setError("");

    try {
      const url = `${API}?action=pagos&op=registrar_pago`;

      const payload = {
        id_sistema: Number(id_sistema),
        anio: Number(anio),
        meses: [Number(idMes)],
        monto: Number(montoArsNum),
        fecha_pago: String(fechaPago),
        id_medio_pago: Number(idMedioPago),
        id_factura: factura?.id_factura ? Number(factura.id_factura) : null,
      };

      const result = await fetchJSON(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (result?.exito !== true) {
        throw new Error(result?.mensaje || "Error al registrar el pago");
      }

      setPagoExitoso(true);
      onPagoRealizado?.();
    } catch (e) {
      setError(e?.message || "Ocurrió un error al realizar el pago.");
    }
  }, [
    API,
    fetchJSON,
    puedePagar,
    id_sistema,
    anio,
    idMes,
    montoArsNum,
    fechaPago,
    idMedioPago,
    factura,
    onPagoRealizado,
  ]);

  const cerrar = () => {
    cerrarModal?.();
  };

  /* =========================
     UI
  ========================= */
  return (
    <div
      className="mi-modal__overlay"
      onClick={(e) => e.target.classList.contains("mi-modal__overlay") && cerrar()}
    >
      <div
        className="mi-modal__container pay-modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header (mi-modal) */}
        <div className="mi-modal__header">
          <div className="mi-modal__head-left">
            <div className="pay-head">
              <span className="pay-head__ico">
                <FaCoins />
              </span>

              <div className="pay-head__txt">
                <h2 className="mi-modal__title">{tituloCliente}</h2>
                <p className="mi-modal__subtitle">Período: {periodoLabel}</p>
              </div>
            </div>
          </div>

          <button className="mi-modal__close" onClick={cerrar} aria-label="Cerrar">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body (misma estructura que mi-modal) */}
        <div className="mit-modal__body">
          <div className="mi-tabpanel">
            {/* Loading */}
            {loading ? (
              <div className="pay-center">
                <div className="pay-spinner" />
                <span>Cargando datos...</span>
              </div>
            ) : null}

            {/* Error general */}
            {!loading && error ? (
              <div className="pay-banner pay-banner--error">
                <strong>Error:</strong> {error}
              </div>
            ) : null}

            {/* Pago exitoso */}
            {!loading && !error && pagoExitoso ? (
              <div className="pay-banner pay-banner--success">
                <h3 className="pay-success-title">¡Pago realizado con éxito!</h3>
                <div className="pay-muted">Período: {periodoLabel}</div>
              </div>
            ) : null}

            {/* Sin factura */}
            {!loading && !error && !pagoExitoso && sinFactura ? (
              <div className="pay-banner pay-banner--warn">
                Este cliente todavía no ha sido facturado para el período{" "}
                <strong>{periodoLabel}</strong>.
                <br />
                Realizá la factura antes de registrar el pago.
              </div>
            ) : null}

            {/* Main */}
            {!loading && !error && !pagoExitoso && !sinFactura ? (
              <div className="mi-grid">
                {/* Card: Datos de pago */}
                <article className="mi-card mi-card--full pay-card">
                  <h3 className="mi-card__title">Datos del pago</h3>

                  <div className="fl-grid pay-fl">
                    <div className="fl-field fl-col-full">
                      <input
                        className="fl-input"
                        placeholder=" "
                        value={periodoLabel}
                        readOnly
                      />
                      <label className="fl-label">Período</label>
                    </div>

                    <div className="fl-field">
                      <input
                        className="fl-input"
                        placeholder=" "
                        type="date"
                        value={fechaPago}
                        onChange={(e) => setFechaPago(e.target.value)}
                      />
                      <label className="fl-label">Fecha pago</label>
                    </div>

                    <div className="fl-field">
                      <input
                        className="fl-input"
                        placeholder=" "
                        value={monto}
                        onChange={(e) =>
                          !montoEsFijo && setMonto(sanitizeMoneyTyping(e.target.value))
                        }
                        inputMode="decimal"
                        readOnly={montoEsFijo}
                        title={montoEsFijo ? "Monto tomado de la factura" : "Monto editable"}
                      />
                      <label className="fl-label">Monto (ARS)</label>
                    </div>

                    <div className="fl-field fl-col-full">
                      <select
                        className="fl-input fl-select"
                        value={idMedioPago}
                        onChange={(e) => setIdMedioPago(e.target.value)}
                      >
                        {mediosPago.length ? (
                          mediosPago.map((mp) => (
                            <option key={mp.id_medio_pago} value={mp.id_medio_pago}>
                              {mp.nombre}
                            </option>
                          ))
                        ) : (
                          <option value="">(No hay medios de pago)</option>
                        )}
                      </select>
                      <label className="fl-label">Medio de pago</label>
                    </div>

                    {pago?.id_pago ? (
                      <div className="fl-col-full">
                        <div className="pay-banner pay-banner--info">
                          Ya existe un pago registrado para este período (ID pago:{" "}
                          <strong>{pago.id_pago}</strong>).
                        </div>
                      </div>
                    ) : null}
                  </div>
                </article>

                {/* Card: Factura */}
                <article className="mi-card mi-card--full pay-card">
                  <div className="pay-fact-head">
                    <h3 className="mi-card__title" style={{ marginBottom: 0 }}>
                      Factura
                    </h3>

                    <button
                      type="button"
                      className="mit-btn mit-btn--ghost pay-btn-small"
                      onClick={handleAbrirFactura}
                      disabled={!pdfUrl}
                      title={pdfUrl ? "Ver factura (PDF)" : "No hay PDF de factura"}
                    >
                      <FaEye /> Ver
                    </button>
                  </div>

                  <div className="pay-fact-grid">
                    <div className="pay-kpi">
                      <span className="pay-kpi__k">Estado</span>
                      <span className="pay-kpi__v">
                        {factura?.estado || (pdfUrl ? "solo_pdf" : "—")}
                      </span>
                    </div>

                    <div className="pay-kpi">
                      <span className="pay-kpi__k">Total</span>
                      <span className="pay-kpi__v">
                        {moneyARS(factura?.total_ars ?? factura?.monto_ars ?? montoArsNum ?? 0)}
                      </span>
                    </div>

                    <div className="pay-kpi">
                      <span className="pay-kpi__k">CBTE</span>
                      <span className="pay-kpi__v">
                        {factura?.cbte_nro ? `N° ${factura.cbte_nro}` : "—"}{" "}
                        {factura?.pto_vta ? `• PV ${String(factura.pto_vta).padStart(4, "0")}` : ""}
                      </span>
                    </div>

                    <div className="pay-kpi">
                      <span className="pay-kpi__k">CAE</span>
                      <span className="pay-kpi__v">{factura?.cae || "—"}</span>
                    </div>

                    <div className="pay-kpi">
                      <span className="pay-kpi__k">Fecha cbte</span>
                      <span className="pay-kpi__v">{factura?.fecha_cbte || "—"}</span>
                    </div>

                    <div className="pay-kpi">
                      <span className="pay-kpi__k">Vto CAE</span>
                      <span className="pay-kpi__v">{factura?.cae_vto || "—"}</span>
                    </div>

                    <div className="pay-kpi">
                      <span className="pay-kpi__k">Período desde</span>
                      <span className="pay-kpi__v">{factura?.periodo_desde || "—"}</span>
                    </div>

                    <div className="pay-kpi">
                      <span className="pay-kpi__k">Período hasta</span>
                      <span className="pay-kpi__v">{factura?.periodo_hasta || "—"}</span>
                    </div>

                    <div className="pay-kpi">
                      <span className="pay-kpi__k">Vto pago</span>
                      <span className="pay-kpi__v">{factura?.vto_pago || "—"}</span>
                    </div>

                    <div className="pay-kpi">
                      <span className="pay-kpi__k">PDF</span>
                      <span className="pay-kpi__v">{pdfUrl ? "Disponible" : "No cargado"}</span>
                    </div>
                  </div>
                </article>
              </div>
            ) : null}
          </div>

          {/* Footer (mit-actions) */}
          <div className="mit-actions">
            <div className="mit-help">
              <span className="pay-total-pill">
                <span className="pay-total-pill__k">Total</span>
                <span className="pay-total-pill__v">{moneyARS(montoArsNum || 0)}</span>
              </span>
            </div>

            <button type="button" className="mit-btn mit-btn--ghost" onClick={cerrar}>
              <FaTimes style={{ marginRight: 8 }} />
              Cerrar
            </button>

            <button
              type="button"
              className="mit-btn mit-btn--solid"
              onClick={handleRealizarPago}
              disabled={!puedePagar}
              title={`Registrar pago: ${periodoLabel}`}
            >
              <FaCheck style={{ marginRight: 8 }} />
              Pagar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
