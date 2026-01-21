// src/components/Pagos/modales/ModalPago.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { FaCoins, FaTimes, FaCheck, FaEye } from "react-icons/fa";
import BASE_URL from "../../../config/config";
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
   ModalPago (nuevo flujo)
========================= */
/**
 * ModalPago recibe:
 * - anioSeleccionado: number (ej 2026)
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

  const [detalle, setDetalle] = useState(null); // sistema/cliente
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
     Traer detalle del período: pago + factura
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

        // monto: prioridad factura.total_ars -> factura.monto_ars -> pago.monto
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

  // ✅ NUEVO: si no hay factura para el período, mostrar solo cartel y nada más
  const sinFactura = useMemo(() => {
    // consideramos "hay factura" si existe algún identificador fuerte o pdf o total/monto > 0
    const hasId =
      factura?.id_factura != null ||
      factura?.cbte_nro != null ||
      factura?.cae != null;
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
    if (sinFactura) return false; // si no hay factura, no se permite pagar
    if (!id_sistema) return false;
    if (!anio || !idMes) return false;
    if (!fechaPago) return false;
    if (!idMedioPago) return false;
    if (!Number.isFinite(montoArsNum) || montoArsNum <= 0) return false;
    return true;
  }, [sinFactura, id_sistema, anio, idMes, fechaPago, idMedioPago, montoArsNum]);

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

  /* =========================
     UI states
  ========================= */
  if (loading) {
    return (
      <div className="modpag_overlay">
        <div className="modpag_contenido">
          <div className="modpag_header">
            <div className="modpag_header-left">
              <div className="modpag_icon-circle">
                <FaCoins size={20} />
              </div>
              <div className="modpag_header-texts">
                <h2 className="modpag_title">{tituloCliente}</h2>
              </div>
            </div>
            <button className="modpag_close-btn" disabled type="button">
              ✕
            </button>
          </div>
          <div className="modpag_body">
            <div className="modpag_loading-state">
              <div className="modpag_spinner"></div>
              <span>Cargando datos...</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="modpag_overlay">
        <div className="modpag_contenido">
          <div className="modpag_header">
            <div className="modpag_header-left">
              <div className="modpag_icon-circle">
                <FaCoins size={20} />
              </div>
              <div className="modpag_header-texts">
                <h2 className="modpag_title">{tituloCliente}</h2>
              </div>
            </div>
            <button className="modpag_close-btn" onClick={cerrarModal} type="button">
              ✕
            </button>
          </div>

          <div className="modpag_body">
            <p className="modpag_error-banner">{error}</p>
          </div>

          <div className="modpag_footer modpag_footer-sides">
            <div className="modpag_footer-left" />
            <div className="modpag_footer-right">
              <button
                className="modpag_btn modpag_btn-secondary"
                onClick={cerrarModal}
                type="button"
              >
                <span className="only-desktop">Cerrar</span>
                <FaTimes className="only-mobile-inline" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (pagoExitoso) {
    return (
      <div className="modpag_overlay">
        <div className="modpag_contenido">
          <div className="modpag_header">
            <div className="modpag_header-left">
              <div className="modpag_icon-circle">
                <FaCoins size={20} />
              </div>
              <div className="modpag_header-texts">
                <h2 className="modpag_title">{tituloCliente}</h2>
              </div>
            </div>
            <button className="modpag_close-btn" type="button" onClick={cerrarModal}>
              ✕
            </button>
          </div>

          <div className="modpag_body">
            <div className="modpag_success">
              <h2 className="modpag_success-title">¡Pago realizado con éxito!</h2>
              <p className="modpag_success-subtitle">Período: {periodoLabel}</p>
            </div>
          </div>

          <div className="modpag_footer modpag_footer-sides">
            <div className="modpag_footer-left" />
            <div className="modpag_footer-right">
              <button
                className="modpag_btn modpag_btn-secondary"
                type="button"
                onClick={cerrarModal}
              >
                <span className="only-desktop">Cerrar</span>
                <FaTimes className="only-mobile-inline" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ✅ NUEVO: si no hay factura, mostrar SOLO el cartel
  if (sinFactura) {
    return (
      <div className="modpag_overlay">
        <div className="modpag_contenido">
          <div className="modpag_header">
            <div className="modpag_header-left">
              <div className="modpag_icon-circle">
                <FaCoins size={20} />
              </div>
              <div className="modpag_header-texts">
                <h2 className="modpag_title">{tituloCliente}</h2>
              </div>
            </div>
            <button className="modpag_close-btn" onClick={cerrarModal} type="button">
              ✕
            </button>
          </div>

          <div className="modpag_body">
            <div className="modpag_error-banner">
              Este cliente todavía no ha sido facturado para el período <strong>{periodoLabel}</strong>.
              <br />
              Realizá la factura antes de registrar el pago.
            </div>
          </div>

          <div className="modpag_footer modpag_footer-sides">
            <div className="modpag_footer-left" />
            <div className="modpag_footer-right">
              <button
                className="modpag_btn modpag_btn-secondary"
                onClick={cerrarModal}
                type="button"
              >
                <span className="only-desktop">Cerrar</span>
                <FaTimes className="only-mobile-inline" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* =========================
     Main
  ========================= */
  return (
    <div className="modpag_overlay">
      <div className="modpag_contenido">
        <div className="modpag_header">
          <div className="modpag_header-left">
            <div className="modpag_icon-circle">
              <FaCoins size={20} />
            </div>
            <div className="modpag_header-texts">
              <h2 className="modpag_title">{tituloCliente}</h2>
            </div>
          </div>
          <button className="modpag_close-btn" onClick={cerrarModal} type="button">
            ✕
          </button>
        </div>

        <div className="modpag_body">
          {/* ===== Datos principales ===== */}
          <div className="modpag_info-summary">
            <div className="modpag_info-row">
              <div className="modpag_info-item">
                <span className="modpag_info-label">Período</span>
                <input type="text" className="modpag_input" value={periodoLabel} readOnly />
              </div>

              <div className="modpag_info-item">
                <span className="modpag_info-label">Fecha pago</span>
                <input
                  type="date"
                  value={fechaPago}
                  onChange={(e) => setFechaPago(e.target.value)}
                  className="modpag_input"
                />
              </div>

              <div className="modpag_info-item">
                <span className="modpag_info-label">Monto (ARS)</span>
                <input
                  type="text"
                  value={monto}
                  onChange={(e) => !montoEsFijo && setMonto(sanitizeMoneyTyping(e.target.value))}
                  className="modpag_input"
                  placeholder="0"
                  inputMode="decimal"
                  readOnly={montoEsFijo}
                  title={montoEsFijo ? "Monto tomado de la factura" : "Sin factura: monto editable"}
                />
              </div>

              <div className="modpag_info-item">
                <span className="modpag_info-label">Medio de pago</span>
                <select
                  className="modpag_input"
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
              </div>
            </div>
          </div>

          {/* ===== Factura (resumen + ojo) ===== */}
          <div className="modpag_periodos-section">
            <div className="modpag_section-header" style={{ alignItems: "center" }}>
              <h4 className="modpag_section-title" style={{ marginBottom: 0 }}>
                Factura
              </h4>

              <div className="modpag_section-header-actions">
                <button
                  type="button"
                  className="modpag_btn modpag_btn-small modpag_btn-terciario"
                  onClick={handleAbrirFactura}
                  disabled={!pdfUrl}
                  title={pdfUrl ? "Ver factura (PDF)" : "No hay PDF de factura"}
                >
                  <FaEye style={{ marginRight: 8 }} />
                  Ver
                </button>
              </div>
            </div>

            <div className="modpag_periodos-grid-container">
              <div
                className="modpag_periodos-grid"
                style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}
              >
                <div className="modpag_periodo-card">
                  <div className="modpag_periodo-label">
                    <strong>Estado</strong>
                    <div>{factura?.estado || (pdfUrl ? "solo_pdf" : "—")}</div>
                  </div>
                </div>

                <div className="modpag_periodo-card">
                  <div className="modpag_periodo-label">
                    <strong>Total</strong>
                    <div>{moneyARS(factura?.total_ars ?? factura?.monto_ars ?? montoArsNum ?? 0)}</div>
                  </div>
                </div>

                <div className="modpag_periodo-card">
                  <div className="modpag_periodo-label">
                    <strong>CBTE</strong>
                    <div>
                      {factura?.cbte_nro ? `N° ${factura.cbte_nro}` : "—"}{" "}
                      {factura?.pto_vta ? `• PV ${String(factura.pto_vta).padStart(4, "0")}` : ""}
                    </div>
                  </div>
                </div>

                <div className="modpag_periodo-card">
                  <div className="modpag_periodo-label">
                    <strong>CAE</strong>
                    <div>{factura?.cae || "—"}</div>
                  </div>
                </div>

                <div className="modpag_periodo-card">
                  <div className="modpag_periodo-label">
                    <strong>Fecha cbte</strong>
                    <div>{factura?.fecha_cbte || "—"}</div>
                  </div>
                </div>

                <div className="modpag_periodo-card">
                  <div className="modpag_periodo-label">
                    <strong>Vto CAE</strong>
                    <div>{factura?.cae_vto || "—"}</div>
                  </div>
                </div>

                <div className="modpag_periodo-card">
                  <div className="modpag_periodo-label">
                    <strong>Período desde</strong>
                    <div>{factura?.periodo_desde || "—"}</div>
                  </div>
                </div>

                <div className="modpag_periodo-card">
                  <div className="modpag_periodo-label">
                    <strong>Período hasta</strong>
                    <div>{factura?.periodo_hasta || "—"}</div>
                  </div>
                </div>

                <div className="modpag_periodo-card">
                  <div className="modpag_periodo-label">
                    <strong>Vto pago</strong>
                    <div>{factura?.vto_pago || "—"}</div>
                  </div>
                </div>

                <div className="modpag_periodo-card">
                  <div className="modpag_periodo-label">
                    <strong>PDF</strong>
                    <div style={{ wordBreak: "break-word" }}>
                      {pdfUrl ? "Disponible" : "No cargado"}
                    </div>
                  </div>
                </div>
              </div>

              {pago?.id_pago ? (
                <div style={{ marginTop: 12 }}>
                  <div
                    className="modpag_error-banner"
                    style={{
                      background: "rgba(40,167,69,.12)",
                      borderColor: "rgba(40,167,69,.35)",
                    }}
                  >
                    Ya existe un pago registrado para este período (ID pago: {pago.id_pago}).
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* ===== Footer ===== */}
        <div className="modpag_footer modpag_footer-sides">
          <div className="modpag_footer-left">
            <div className="modpag_footer-total">
              <span className="modpag_footer-total-label">Total:</span>
              <span className="modpag_footer-total-value">{moneyARS(montoArsNum || 0)}</span>
            </div>
          </div>

          <div className="modpag_footer-right">
            <button className="modpag_btn modpag_btn-secondary" onClick={cerrarModal} type="button">
              <span className="only-desktop">Cerrar</span>
              <FaTimes className="only-mobile-inline" />
            </button>

            <button
              className="modpag_btn modpag_btn-primary"
              onClick={handleRealizarPago}
              disabled={!puedePagar}
              title={`Registrar pago: ${periodoLabel}`}
              type="button"
            >
              <span className="only-desktop">Pagar</span>
              <FaCheck className="only-mobile-inline" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
