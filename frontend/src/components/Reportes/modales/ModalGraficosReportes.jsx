// src/components/Reportes/modales/ModalGraficosReportes.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChartLine,
  faChartPie,
  faUsers,
  faArrowTrendUp,
  faArrowTrendDown,
  faChartColumn,
  faCalendarAlt,
} from "@fortawesome/free-solid-svg-icons";

import "./ModalGraficosReportes.css";

// ✅ REUSAMOS EL MISMO CSS BASE DEL MODAL "identico"
import "../../Trabajadores/modales/ModalEditarTrabajador.css";

const nf = new Intl.NumberFormat("es-AR");

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

/* =========================
   SVG LINE CHART (2 series)
========================= */
function LineChartSVG({ labels = [], seriesA = [], seriesB = [], height = 260 }) {
  const w = 900;
  const h = height;
  const padL = 52;
  const padR = 22;
  const padT = 16;
  const padB = 42;

  const n = Math.max(labels.length, seriesA.length, seriesB.length, 0);

  const values = [];
  for (let i = 0; i < n; i++) {
    const a = Number(seriesA[i] ?? 0) || 0;
    const b = Number(seriesB[i] ?? 0) || 0;
    values.push(a, b);
  }

  const vMin = Math.min(...values, 0);
  const vMax = Math.max(...values, 0);

  const maxAbs = Math.max(Math.abs(vMin), Math.abs(vMax), 1);
  const niceMax = Math.ceil(maxAbs / 1000) * 1000;
  const minY = 0;
  const maxY = niceMax;

  const innerW = w - padL - padR;
  const innerH = h - padT - padB;

  const xAt = (i) => {
    if (n <= 1) return padL;
    return padL + (i / (n - 1)) * innerW;
  };
  const yAt = (val) => {
    const v = clamp(Number(val) || 0, minY, maxY);
    const t = (v - minY) / (maxY - minY || 1);
    return padT + (1 - t) * innerH;
  };

  const ptsA = [];
  const ptsB = [];
  for (let i = 0; i < n; i++) {
    ptsA.push(`${xAt(i)},${yAt(seriesA[i] ?? 0)}`);
    ptsB.push(`${xAt(i)},${yAt(seriesB[i] ?? 0)}`);
  }

  const ticks = 4;
  const tickVals = Array.from({ length: ticks + 1 }).map((_, i) => (maxY / ticks) * i);

  return (
    <div className="mgr-linewrap">
      <svg
        className="mgr-linesvg"
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Gráfico de línea"
      >
        {tickVals.map((tv, i) => {
          const y = yAt(tv);
          return (
            <g key={`yt-${i}`}>
              <line x1={padL} y1={y} x2={w - padR} y2={y} className="mgr-grid" />
              <text x={padL - 10} y={y + 4} textAnchor="end" className="mgr-tick">
                {`$${nf.format(Math.round(tv))}`}
              </text>
            </g>
          );
        })}

        {labels.map((lb, i) => {
          if (labels.length > 10 && i % 2 === 1) return null;
          const x = xAt(i);
          return (
            <text key={`xl-${i}`} x={x} y={h - 18} textAnchor="middle" className="mgr-xlab">
              {lb}
            </text>
          );
        })}

        <polyline points={ptsA.join(" ")} className="mgr-line mgr-line-a" />
        <polyline points={ptsB.join(" ")} className="mgr-line mgr-line-b" />

        {seriesA.map((v, i) => (
          <circle key={`da-${i}`} cx={xAt(i)} cy={yAt(v)} r="3.2" className="mgr-dot mgr-dot-a" />
        ))}
        {seriesB.map((v, i) => (
          <circle key={`db-${i}`} cx={xAt(i)} cy={yAt(v)} r="3.2" className="mgr-dot mgr-dot-b" />
        ))}
      </svg>

      <div className="mgr-legend">
        <div className="mgr-legitem">
          <span className="mgr-swatch a" /> Ingresos
        </div>
        <div className="mgr-legitem">
          <span className="mgr-swatch b" /> Egresos
        </div>
      </div>
    </div>
  );
}

/* =========================
   SVG DONUT (2 values)
========================= */
function DonutSVG({ a = 0, b = 0, size = 220 }) {
  const total = Math.max(0, (Number(a) || 0) + (Number(b) || 0));
  const pa = total > 0 ? (Number(a) || 0) / total : 0;
  const pb = total > 0 ? (Number(b) || 0) / total : 0;

  const r = 78;
  const cx = size / 2;
  const cy = size / 2;
  const c = 2 * Math.PI * r;
  const dashA = c * pa;
  const dashB = c * pb;

  return (
    <div className="mgr-donutwrap">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="mgr-donutsvg"
        role="img"
        aria-label="Gráfico circular ingresos vs egresos"
      >
        <circle cx={cx} cy={cy} r={r} className="mgr-donut-bg" />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          className="mgr-donut-a"
          strokeDasharray={`${dashA} ${c - dashA}`}
          strokeDashoffset={c * 0.25}
        />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          className="mgr-donut-b"
          strokeDasharray={`${dashB} ${c - dashB}`}
          strokeDashoffset={c * (0.25 + pa)}
        />

        <text x={cx} y={cy - 4} textAnchor="middle" className="mgr-donut-big">
          {total > 0 ? `${Math.round(pa * 100)}%` : "0%"}
        </text>
        <text x={cx} y={cy + 18} textAnchor="middle" className="mgr-donut-sub">
          ingresos
        </text>
      </svg>

      <div className="mgr-legend">
        <div className="mgr-legitem">
          <span className="mgr-swatch a" /> Ingresos: <b>${nf.format(Math.round(a))}</b>
        </div>
        <div className="mgr-legitem">
          <span className="mgr-swatch b" /> Egresos: <b>${nf.format(Math.round(b))}</b>
        </div>
      </div>
    </div>
  );
}

/* =========================
   SUBMODAL: detalle trabajador
========================= */
function ModalTrabajadorDetalle({
  open,
  onClose,
  worker,
  selectedYear,
  setSelectedYear,
  selectedToMonth,
  setSelectedToMonth,
  selectedMonthMode,
  setSelectedMonthMode,
  buildMonthLabel,
  seriesMeses,
  seriesMontos,
  loading,
}) {
  if (!open) return null;

  const n = Math.min(seriesMeses.length, seriesMontos.length);
  const maxVal = n ? Math.max(...seriesMontos.slice(0, n).map((x) => Number(x || 0)), 0) : 0;
  const idxMax = n ? seriesMontos.findIndex((x) => Number(x || 0) === maxVal) : -1;
  const mesTop = idxMax >= 0 ? seriesMeses[idxMax] : "—";

  const nombreCompleto = `${worker?.apellido || ""} ${worker?.nombre || ""}`.trim() || "—";

  return (
    <div
      className="mi-modal__overlay reportes-floating-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Detalle de trabajador"
      onClick={(e) => e.target.classList.contains("mi-modal__overlay") && onClose?.()}
    >
      <div className="mi-modal__container" style={{ width: "min(980px, 92vw)" }} onClick={(e) => e.stopPropagation()}>
        <div className="mi-modal__header">
          <div className="mi-modal__head-left">
            <h2 className="mi-modal__title">Detalle trabajador</h2>
            <p className="mi-modal__subtitle">
              {nombreCompleto}
              {worker?.rol ? ` • ${worker.rol}` : ""} • Año: <b>{selectedYear}</b> •{" "}
              {selectedMonthMode === "HASTA" ? "Hasta" : "Mes"}: <b>{selectedToMonth}/{selectedYear}</b>
            </p>
          </div>

          <button className="mi-modal__close" onClick={onClose} aria-label="Cerrar">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="mit-modal__body">
          <div className="mi-tabpanel is-active">
            <div className="mi-grid">
              <article className="mi-card mi-card--full">
                <h3 className="mi-card__title">Filtros</h3>

                <div className="fl-grid">
                  <div className="fl-field">
                    <input
                      className="fl-input"
                      placeholder=" "
                      type="number"
                      value={selectedYear}
                      onChange={(e) => setSelectedYear(String(e.target.value || "").slice(0, 4))}
                      min="2000"
                      max="2100"
                    />
                    <label className="fl-label">
                      <FontAwesomeIcon icon={faCalendarAlt} /> Año
                    </label>
                  </div>

                  <div className="fl-field">
                    <select className="fl-input fl-select" value={selectedMonthMode} onChange={(e) => setSelectedMonthMode(e.target.value)}>
                      <option value="HASTA">Acumulado (hasta mes)</option>
                      <option value="MES">Solo un mes</option>
                    </select>
                    <label className="fl-label">
                      <FontAwesomeIcon icon={faCalendarAlt} /> Modo
                    </label>
                  </div>

                  <div className="fl-field">
                    <select
                      className="fl-input fl-select"
                      value={String(selectedToMonth)}
                      onChange={(e) => setSelectedToMonth(parseInt(e.target.value, 10) || 1)}
                    >
                      {Array.from({ length: 12 }).map((_, i) => {
                        const id = i + 1;
                        return (
                          <option key={`mopt-${id}`} value={id}>
                            {String(buildMonthLabel(id) || id).toUpperCase()}
                          </option>
                        );
                      })}
                    </select>
                    <label className="fl-label">
                      <FontAwesomeIcon icon={faCalendarAlt} /> Mes
                    </label>
                  </div>
                </div>
              </article>

              <article className="mi-card mi-card--full">
                <h3 className="mi-card__title">
                  <FontAwesomeIcon icon={faChartColumn} /> Ganancia por mes
                </h3>

                {loading ? (
                  <div className="mgr-loading">Cargando gráfico…</div>
                ) : seriesMeses.length ? (
                  <>
                    <LineChartSVG
                      labels={seriesMeses}
                      seriesA={seriesMontos}
                      seriesB={new Array(seriesMontos.length).fill(0)}
                      height={270}
                    />
                    <div className="mgr-list" style={{ marginTop: 10 }}>
                      <div className="mgr-li">
                        <span>Mes con más ganancia:</span>
                        <b>
                          {mesTop} • ${nf.format(Math.round(maxVal || 0))}
                        </b>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="mgr-empty">No hay datos para graficar.</div>
                )}
              </article>

              <article className="mi-card mi-card--full">
                <h3 className="mi-card__title">Detalle rápido</h3>

                <div className="mgr-list">
                  <div className="mgr-li">
                    <span>Alias:</span>
                    <b>{worker?.alias_pago || "—"}</b>
                  </div>
                  <div className="mgr-li">
                    <span>Sistemas:</span>
                    <b>{String(worker?.sistemas_cobrados ?? 0)}</b>
                  </div>
                  <div className="mgr-li">
                    <span>{selectedMonthMode === "HASTA" ? "Total acumulado:" : "Total del mes:"}</span>
                    <b>${nf.format(Math.round(Number(worker?.monto || 0)))}</b>
                  </div>
                </div>
              </article>
            </div>
          </div>

          <div className="mit-actions">
            <button type="button" className="mit-btn mit-btn--ghost" onClick={onClose}>
              Cerrar
            </button>
          </div>

          <div className="mit-help">Tip: este gráfico se arma con acumulados por mes (diff entre meses).</div>
        </div>
      </div>
    </div>
  );
}

/* =========================
   MAIN MODAL
========================= */
export default function ModalGraficosReportes({
  open,
  onClose,
  fetchJSON,
  baseUrl,
  anioSeleccionado,
  mesesDisponibles = [],
  showToast,
}) {
  const [tab, setTab] = useState("general"); // general | trabajadores | resumen
  const [loading, setLoading] = useState(false);

  const [lineLabels, setLineLabels] = useState([]);
  const [lineIngresos, setLineIngresos] = useState([]);
  const [lineEgresos, setLineEgresos] = useState([]);

  const [totIng, setTotIng] = useState(0);
  const [totEgr, setTotEgr] = useState(0);

  const [trab, setTrab] = useState([]);
  const [loadingTrab, setLoadingTrab] = useState(false);

  const [trabYear, setTrabYear] = useState(() => {
    if (anioSeleccionado && anioSeleccionado !== "TODOS") return String(anioSeleccionado);
    return String(new Date().getFullYear());
  });
  const [trabMonthMode, setTrabMonthMode] = useState("HASTA"); // HASTA | MES
  const [trabMonth, setTrabMonth] = useState(() => new Date().getMonth() + 1);

  const [detalleOpen, setDetalleOpen] = useState(false);
  const [detalleWorker, setDetalleWorker] = useState(null);
  const [detalleLoading, setDetalleLoading] = useState(false);
  const [detalleSeriesMeses, setDetalleSeriesMeses] = useState([]);
  const [detalleSeriesMontos, setDetalleSeriesMontos] = useState([]);

  const cacheTrabRef = useRef(new Map());
  const mountedRef = useRef(false);

  useEffect(() => {
    // fetchJSON cambia cuando cambia la entidad activa: nunca reutilizar liquidaciones
    // cacheadas de 3DEVS en BALTO (ni viceversa).
    cacheTrabRef.current.clear();
  }, [fetchJSON]);

  const labelMesById = useCallback(
    (id) => {
      const m = (mesesDisponibles || []).find((x) => String(x.id) === String(id));
      return (m?.mes || m?.nombre || "").toString();
    },
    [mesesDisponibles]
  );

  const buildMonthLabel = useCallback(
    (id) => {
      const txt = labelMesById(id);
      return txt ? String(txt).slice(0, 3) : String(id);
    },
    [labelMesById]
  );

  const currentMonth = useMemo(() => new Date().getMonth() + 1, []);

  const yearForQuery = useMemo(() => {
    if (anioSeleccionado && anioSeleccionado !== "TODOS") return String(anioSeleccionado);
    return String(new Date().getFullYear());
  }, [anioSeleccionado]);

  const cutoffMonth = useMemo(() => {
    const ySel = parseInt(yearForQuery, 10);
    const yNow = new Date().getFullYear();
    if (!Number.isNaN(ySel) && ySel === yNow) return currentMonth;
    return 12;
  }, [yearForQuery, currentMonth]);

  const loadGeneral = useCallback(async () => {
    try {
      setLoading(true);

      const params = new URLSearchParams({
        action: "reportes",
        op: "movimientos",
        anio: yearForQuery,
      });
      const endpoint = `${String(baseUrl || "").replace(/\/+$/, "")}/api.php?${params.toString()}`;

      const data = await fetchJSON(endpoint);
      const pagos = Array.isArray(data?.pagos)
        ? data.pagos
        : Array.isArray(data?.ingresos)
        ? data.ingresos
        : [];
      const egresos = Array.isArray(data?.egresos) ? data.egresos : [];

      const norm = (r) => ({
        fecha: r.fecha ?? r.Fecha ?? r.fecha_mov ?? r.fechaPago ?? r.fecha_pago ?? "",
        id_mes: Number(r.id_mes ?? 0) || 0,
        monto: Number(r.monto ?? r.Monto ?? r.importe ?? r.Precio ?? 0) || 0,
      });

      const pN = pagos.map(norm);
      const eN = egresos.map(norm);

      const byMonthIng = Array(12).fill(0);
      const byMonthEgr = Array(12).fill(0);

      const monthFromFecha = (f) => {
        const s = String(f || "");
        if (s.includes("-")) {
          const parts = s.split("-");
          const m = parseInt(parts[1], 10);
          if (!Number.isNaN(m)) return m;
        }
        if (s.includes("/")) {
          const parts = s.split("/");
          const m = parseInt(parts[1], 10);
          if (!Number.isNaN(m)) return m;
        }
        return null;
      };

      pN.forEach((r) => {
        // Los ingresos se grafican por período facturado, no por fecha de acreditación.
        const m = r.id_mes || monthFromFecha(r.fecha);
        if (m && m >= 1 && m <= 12) byMonthIng[m - 1] += r.monto;
      });
      eN.forEach((r) => {
        const m = monthFromFecha(r.fecha);
        if (m && m >= 1 && m <= 12) byMonthEgr[m - 1] += r.monto;
      });

      const labels = Array.from({ length: 12 }).map((_, i) => {
        const id = i + 1;
        const txt = labelMesById(id) || String(id);
        return String(txt).slice(0, 3).toUpperCase();
      });

      setLineLabels(labels);
      setLineIngresos(byMonthIng.map((x) => Math.round(x)));
      setLineEgresos(byMonthEgr.map((x) => Math.round(x)));

      const tIng = byMonthIng.reduce((a, b) => a + b, 0);
      const tEgr = byMonthEgr.reduce((a, b) => a + b, 0);
      setTotIng(Math.round(tIng));
      setTotEgr(Math.round(tEgr));
    } catch (e) {
      const msg = String(e?.message || e);
      showToast?.("error", `❌ No se pudieron cargar los gráficos: ${msg}`, 4200);
    } finally {
      setLoading(false);
    }
  }, [baseUrl, fetchJSON, labelMesById, showToast, yearForQuery]);

  // ========= Trabajadores helpers =========
  // El endpoint devuelve un mes exacto. La acumulación se construye aquí sumando
  // meses reales, evitando restas incorrectas y preservando el cálculo auditado.
  const fetchTrabMes = useCallback(
    async (anio, mes) => {
      const key = `${anio}::${mes}`;
      if (cacheTrabRef.current.has(key)) return cacheTrabRef.current.get(key);

      const params = new URLSearchParams({
        action: "reportes",
        op: "trabajadores",
        anio: String(anio),
        mes: String(mes),
      });
      const endpoint = `${String(baseUrl || "").replace(/\/+$/, "")}/api.php?${params.toString()}`;

      const data = await fetchJSON(endpoint);
      const arr = Array.isArray(data?.trabajadores) ? data.trabajadores : [];
      const mapped = arr.map((r) => ({
        id: r.id ?? r.id_trabajador ?? null,
        nombre: r.nombre ?? "",
        apellido: r.apellido ?? "",
        rol: r.rol ?? "",
        alias_pago: r.alias_pago ?? "",
        sistemas_cobrados: Number(r.sistemas_cobrados ?? 0) || 0,
        monto: Number(r.monto ?? 0) || 0,
      }));

      cacheTrabRef.current.set(key, mapped);
      return mapped;
    },
    [baseUrl, fetchJSON]
  );

  const aggregateWorkerMonths = useCallback(async (anio, monthTo) => {
    const accumulator = new Map();
    for (let month = 1; month <= monthTo; month += 1) {
      const rows = await fetchTrabMes(anio, month);
      rows.forEach((row) => {
        const key = String(row.id);
        const current = accumulator.get(key) || { ...row, monto: 0, sistemas_cobrados: 0 };
        current.monto += Number(row.monto || 0);
        current.sistemas_cobrados += Number(row.sistemas_cobrados || 0);
        accumulator.set(key, current);
      });
    }
    return Array.from(accumulator.values());
  }, [fetchTrabMes]);

  const loadTrabajadores = useCallback(async () => {
    try {
      setLoadingTrab(true);

      const y = String(trabYear || "").trim() || String(new Date().getFullYear());
      const m = clamp(Number(trabMonth) || 1, 1, 12);
      const rows = trabMonthMode === "HASTA"
        ? await aggregateWorkerMonths(y, m)
        : await fetchTrabMes(y, m);

      setTrab(rows.slice().sort((a, b) => (b.monto || 0) - (a.monto || 0)));
    } catch (e) {
      const msg = String(e?.message || e);
      showToast?.("error", `❌ No se pudieron cargar trabajadores: ${msg}`, 4200);
      setTrab([]);
    } finally {
      setLoadingTrab(false);
    }
  }, [aggregateWorkerMonths, fetchTrabMes, showToast, trabMonth, trabMonthMode, trabYear]);

  const openDetalleTrabajador = useCallback(
    async (worker) => {
      try {
        if (!worker?.id) {
          showToast?.("advertencia", "No se encontró ID del trabajador.", 2200);
          return;
        }

        setDetalleWorker(worker);
        setDetalleOpen(true);
        setDetalleLoading(true);
        setDetalleSeriesMeses([]);
        setDetalleSeriesMontos([]);

        const y = String(trabYear || "").trim() || String(new Date().getFullYear());
        const mSel = clamp(Number(trabMonth) || 1, 1, 12);
        const months = Array.from({ length: mSel }).map((_, i) => i + 1);
        const byMonth = [];

        for (const month of months) {
          const rows = await fetchTrabMes(y, month);
          const found = rows.find((row) => String(row.id) === String(worker.id));
          byMonth.push(Math.round(Number(found?.monto || 0)));
        }

        setDetalleSeriesMeses(months.map((month) => String(buildMonthLabel(month)).toUpperCase()));
        setDetalleSeriesMontos(byMonth);
      } catch (e) {
        const msg = String(e?.message || e);
        showToast?.("error", `❌ No se pudo armar el gráfico del trabajador: ${msg}`, 4200);
      } finally {
        setDetalleLoading(false);
      }
    },
    [buildMonthLabel, fetchTrabMes, showToast, trabMonth, trabYear]
  );

  const balance = useMemo(() => (Number(totIng) || 0) - (Number(totEgr) || 0), [totIng, totEgr]);

  const resumen = useMemo(() => {
    const maxIng = Math.max(...(lineIngresos || [0]));
    const maxEgr = Math.max(...(lineEgresos || [0]));
    const idxMaxIng = (lineIngresos || []).findIndex((x) => x === maxIng);
    const idxMaxEgr = (lineEgresos || []).findIndex((x) => x === maxEgr);
    const topTrab = (trab || [])[0];

    return {
      mesTopIng: idxMaxIng >= 0 ? lineLabels[idxMaxIng] : "—",
      mesTopEgr: idxMaxEgr >= 0 ? lineLabels[idxMaxEgr] : "—",
      maxIng,
      maxEgr,
      topTrab,
    };
  }, [lineEgresos, lineIngresos, lineLabels, trab]);

  useEffect(() => {
    if (!open) return;
    if (!mountedRef.current) mountedRef.current = true;

    setTab("general");
    loadGeneral();

    const defaultYear =
      anioSeleccionado && anioSeleccionado !== "TODOS"
        ? String(anioSeleccionado)
        : String(new Date().getFullYear());
    setTrabYear(defaultYear);

    const ySel = parseInt(defaultYear, 10);
    const yNow = new Date().getFullYear();
    setTrabMonth(!Number.isNaN(ySel) && ySel === yNow ? currentMonth : 12);
    setTrabMonthMode("HASTA");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    if (tab === "trabajadores") loadTrabajadores();
  }, [open, tab, loadTrabajadores]);

  useEffect(() => {
    if (!open) return;
    if (tab !== "trabajadores") return;
    loadTrabajadores();
  }, [open, tab, trabYear, trabMonth, trabMonthMode, loadTrabajadores]);

  if (!open) return null;

  const cerrar = () => onClose?.();

  return (
    <>
      <div
        className="mi-modal__overlay reportes-floating-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Gráficos de Reportes"
        onClick={(e) => e.target.classList.contains("mi-modal__overlay") && cerrar()}
      >
        <div className="mi-modal__container mgr-wide" onClick={(e) => e.stopPropagation()}>
          {/* ✅ Header IDENTICO (mi-modal__header) */}
          <div className="mi-modal__header">
            <div className="mi-modal__head-left">
              <h2 className="mi-modal__title">Gráficos & Resumen</h2>
              <p className="mi-modal__subtitle">
                Año: <b>{yearForQuery}</b> • Corte:{" "}
                <b>
                  {cutoffMonth}/{yearForQuery}
                </b>
              </p>
            </div>

            <button className="mi-modal__close" onClick={cerrar} aria-label="Cerrar">
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div className="mit-modal__body">
            <div className="mi-tabpanel is-active">
              {/* ✅ Tabs estilo "pill" pero con la paleta mi-* */}
              <div className="mgr-tabs" role="tablist" aria-label="Pestañas de gráficos">
                <button
                  type="button"
                  className={`mgr-tab ${tab === "general" ? "is-active" : ""}`}
                  role="tab"
                  aria-selected={tab === "general"}
                  onClick={() => setTab("general")}
                >
                  <FontAwesomeIcon icon={faChartLine} /> Ingresos vs Egresos
                </button>

                <button
                  type="button"
                  className={`mgr-tab ${tab === "trabajadores" ? "is-active" : ""}`}
                  role="tab"
                  aria-selected={tab === "trabajadores"}
                  onClick={() => setTab("trabajadores")}
                >
                  <FontAwesomeIcon icon={faUsers} /> Trabajadores
                </button>

              </div>

              {/* =========================
                 CONTENT
              ========================= */}
              {tab === "general" && (
                <div className="mi-grid">
                  <article className="mi-card mi-card--full">
                    <h3 className="mi-card__title">Totales</h3>

                    <div className="mgr-kpis">
                      <div className="mgr-kpi">
                        <div className="mgr-kpi-top">
                          <FontAwesomeIcon icon={faArrowTrendUp} /> Ingresos
                        </div>
                        <div className="mgr-kpi-val">${nf.format(totIng)}</div>
                        <div className="mgr-kpi-sub">Año {yearForQuery}</div>
                      </div>

                      <div className="mgr-kpi">
                        <div className="mgr-kpi-top">
                          <FontAwesomeIcon icon={faArrowTrendDown} /> Egresos
                        </div>
                        <div className="mgr-kpi-val">${nf.format(totEgr)}</div>
                        <div className="mgr-kpi-sub">Año {yearForQuery}</div>
                      </div>

                      <div className={`mgr-kpi ${balance < 0 ? "is-bad" : "is-good"}`}>
                        <div className="mgr-kpi-top">Balance</div>
                        <div className="mgr-kpi-val">${nf.format(Math.abs(balance))}</div>
                        <div className="mgr-kpi-sub">{balance < 0 ? "Déficit" : "Superávit"}</div>
                      </div>
                    </div>
                  </article>

                  <article className="mi-card" style={{ gridColumn: "span 7" }}>
                    <h3 className="mi-card__title">Ingresos vs Egresos por mes</h3>
                    {loading ? (
                      <div className="mgr-loading">Cargando gráfico…</div>
                    ) : (
                      <LineChartSVG labels={lineLabels} seriesA={lineIngresos} seriesB={lineEgresos} height={270} />
                    )}
                  </article>

                  <article className="mi-card" style={{ gridColumn: "span 5" }}>
                    <h3 className="mi-card__title">
                      Proporción anual <span className="mgr-badge"><FontAwesomeIcon icon={faChartPie} /> Donut</span>
                    </h3>
                    {loading ? <div className="mgr-loading">Cargando gráfico…</div> : <DonutSVG a={totIng} b={totEgr} />}
                  </article>
                </div>
              )}

              {tab === "trabajadores" && (
                <div className="mi-grid">
                  <article className="mi-card mi-card--full">
                    <h3 className="mi-card__title">
                      <FontAwesomeIcon icon={faUsers} />{" "}
                      {trabMonthMode === "HASTA"
                        ? "Ganancias por trabajador (acumulado)"
                        : "Ganancias por trabajador (mes exacto)"}
                    </h3>

                    <div className="fl-grid">
                      <div className="fl-field">
                        <input
                          className="fl-input"
                          placeholder=" "
                          type="number"
                          value={trabYear}
                          onChange={(e) => setTrabYear(String(e.target.value || "").slice(0, 4))}
                          min="2000"
                          max="2100"
                        />
                        <label className="fl-label">
                          <FontAwesomeIcon icon={faCalendarAlt} /> Año
                        </label>
                      </div>

                      <div className="fl-field">
                        <select className="fl-input fl-select" value={trabMonthMode} onChange={(e) => setTrabMonthMode(e.target.value)}>
                          <option value="HASTA">Acumulado (hasta mes)</option>
                          <option value="MES">Solo un mes</option>
                        </select>
                        <label className="fl-label">
                          <FontAwesomeIcon icon={faCalendarAlt} /> Modo
                        </label>
                      </div>

                      <div className="fl-field">
                        <select
                          className="fl-input fl-select"
                          value={String(trabMonth)}
                          onChange={(e) => setTrabMonth(parseInt(e.target.value, 10) || 1)}
                        >
                          {Array.from({ length: 12 }).map((_, i) => {
                            const id = i + 1;
                            return (
                              <option key={`tm-${id}`} value={id}>
                                {String(labelMesById(id) || id).toUpperCase()}
                              </option>
                            );
                          })}
                        </select>
                        <label className="fl-label">
                          <FontAwesomeIcon icon={faCalendarAlt} /> Mes
                        </label>
                      </div>
                    </div>

                    {loadingTrab ? (
                      <div className="mgr-loading">Cargando trabajadores…</div>
                    ) : trab.length ? (
                      <>
                        <div className="mgr-table">
                          <div className="mgr-tr mgr-th" style={{ gridTemplateColumns: "1.2fr .6fr 1fr .7fr .55fr" }}>
                            <div>Trabajador</div>
                            <div className="center">Sistemas</div>
                            <div>Alias</div>
                            <div className="right">Monto</div>
                            <div className="center">Ver</div>
                          </div>

                          {trab.map((t) => (
                            <div
                              key={t.id ?? `${t.apellido}-${t.nombre}`}
                              className="mgr-tr"
                              style={{ gridTemplateColumns: "1.2fr .6fr 1fr .7fr .55fr" }}
                            >
                              <div className="mgr-name">
                                {(t.apellido || "")} {(t.nombre || "")}
                                <div className="mgr-mini">{t.rol || "—"}</div>
                              </div>
                              <div className="center">{t.sistemas_cobrados}</div>
                              <div className="mgr-mono">{t.alias_pago || "—"}</div>
                              <div className="right">
                                <b>${nf.format(Math.round(t.monto || 0))}</b>
                              </div>

                              <div className="center">
                                <button
                                  type="button"
                                  className="mit-btn mit-btn--ghost mgr-iconbtn"
                                  onClick={() => openDetalleTrabajador(t)}
                                  title="Ver gráfico personal"
                                >
                                  <FontAwesomeIcon icon={faChartColumn} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>

                      </>
                    ) : (
                      <div className="mgr-empty">No hay datos de trabajadores para ese período.</div>
                    )}
                  </article>
                </div>
              )}

            </div>

            {/* ✅ Footer IDENTICO (mit-actions + mit-help) */}
            <div className="mit-actions">
              <button type="button" className="mit-btn mit-btn--ghost" onClick={cerrar}>
                Cerrar
              </button>
            </div>

            <div className="mit-help">
              Tip: en “Trabajadores” podés cambiar Año/Mes y abrir el gráfico individual por persona.
            </div>
          </div>
        </div>
      </div>

      <ModalTrabajadorDetalle
        open={detalleOpen}
        onClose={() => {
          setDetalleOpen(false);
          setDetalleWorker(null);
          setDetalleSeriesMeses([]);
          setDetalleSeriesMontos([]);
        }}
        worker={detalleWorker}
        selectedYear={trabYear}
        setSelectedYear={(y) => setTrabYear(y)}
        selectedToMonth={trabMonth}
        setSelectedToMonth={(m) => setTrabMonth(m)}
        selectedMonthMode={trabMonthMode}
        setSelectedMonthMode={(m) => setTrabMonthMode(m)}
        buildMonthLabel={buildMonthLabel}
        seriesMeses={detalleSeriesMeses}
        seriesMontos={detalleSeriesMontos}
        loading={detalleLoading}
      />
    </>
  );
}
