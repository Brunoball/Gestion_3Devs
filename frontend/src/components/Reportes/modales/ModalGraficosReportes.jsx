// src/components/Reportes/modales/ModalGraficosReportes.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faXmark,
  faChartLine,
  faChartPie,
  faUsers,
  faCircleInfo,
  faArrowTrendUp,
  faArrowTrendDown,
  faChartColumn,
  faUser,
  faCalendarAlt,
} from "@fortawesome/free-solid-svg-icons";
import "./ModalGraficosReportes.css";

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
        {/* Grid + Y ticks */}
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

        {/* X axis labels */}
        {labels.map((lb, i) => {
          if (labels.length > 10 && i % 2 === 1) return null;
          const x = xAt(i);
          return (
            <text key={`xl-${i}`} x={x} y={h - 18} textAnchor="middle" className="mgr-xlab">
              {lb}
            </text>
          );
        })}

        {/* Series */}
        <polyline points={ptsA.join(" ")} className="mgr-line mgr-line-a" />
        <polyline points={ptsB.join(" ")} className="mgr-line mgr-line-b" />

        {/* Dots */}
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
   MODAL: detalle trabajador
========================= */
function ModalTrabajadorDetalle({
  open,
  onClose,
  worker,
  mesesDisponibles,
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

  return (
    <div className="mgr-overlay" role="dialog" aria-modal="true" aria-label="Detalle de trabajador">
      <div className="mgr-modal" style={{ maxWidth: 980 }}>
        <div className="mgr-head">
          <div className="mgr-title">
            <span className="mgr-ic">
              <FontAwesomeIcon icon={faUser} />
            </span>
            <div>
              <div className="mgr-h1">
                {(worker?.apellido || "")} {(worker?.nombre || "")}
              </div>
              <div className="mgr-sub">
                {worker?.rol ? <b>{worker.rol}</b> : null}
                {worker?.rol ? " • " : ""}
                Año: <b>{selectedYear}</b>
                {" • "}
                {selectedMonthMode === "HASTA" ? (
                  <>
                    Hasta: <b>{selectedToMonth}/{selectedYear}</b>
                  </>
                ) : (
                  <>
                    Mes: <b>{selectedToMonth}/{selectedYear}</b>
                  </>
                )}
              </div>
            </div>
          </div>

          <button className="mgr-close" type="button" onClick={onClose} aria-label="Cerrar">
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        {/* filtros */}
        <div className="mgr-body" style={{ paddingTop: 12 }}>
          <div
            className="mgr-card"
            style={{
              padding: 12,
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 10,
              alignItems: "end",
            }}
          >
            <div>
              <div className="mgr-cardtitle" style={{ marginBottom: 6 }}>
                <FontAwesomeIcon icon={faCalendarAlt} /> Año
              </div>
              <input
                className="mgr-input"
                type="number"
                value={selectedYear}
                onChange={(e) => setSelectedYear(String(e.target.value || "").slice(0, 4))}
                min="2000"
                max="2100"
              />
            </div>

            <div>
              <div className="mgr-cardtitle" style={{ marginBottom: 6 }}>
                <FontAwesomeIcon icon={faCalendarAlt} /> Modo
              </div>
              <select
                className="mgr-input"
                value={selectedMonthMode}
                onChange={(e) => setSelectedMonthMode(e.target.value)}
              >
                <option value="HASTA">Acumulado (hasta mes)</option>
                <option value="MES">Solo un mes</option>
              </select>
            </div>

            <div>
              <div className="mgr-cardtitle" style={{ marginBottom: 6 }}>
                <FontAwesomeIcon icon={faCalendarAlt} /> Mes
              </div>
              <select
                className="mgr-input"
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
            </div>
          </div>

          <div className="mgr-grid2" style={{ marginTop: 12 }}>
            <div className="mgr-card">
              <div className="mgr-cardtitle">
                <FontAwesomeIcon icon={faChartColumn} /> Ganancia por mes
              </div>

              {loading ? (
                <div className="mgr-loading">Cargando gráfico…</div>
              ) : seriesMeses.length ? (
                <>
                  {/* usamos LineChartSVG con serie B = 0 para “single series” */}
                  <LineChartSVG
                    labels={seriesMeses}
                    seriesA={seriesMontos}
                    seriesB={new Array(seriesMontos.length).fill(0)}
                    height={270}
                  />
                  <div className="mgr-list" style={{ marginTop: 8 }}>
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
            </div>

            <div className="mgr-card">
              <div className="mgr-cardtitle">Detalle rápido</div>

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
                  <span>
                    {selectedMonthMode === "HASTA" ? "Total acumulado:" : "Total del mes:"}
                  </span>
                  <b>${nf.format(Math.round(Number(worker?.monto || 0)))}</b>
                </div>
              </div>

              <div className="mgr-foot" style={{ borderTop: "1px solid rgba(0,0,0,.06)" }}>
                <button className="mgr-btn" type="button" onClick={onClose}>
                  Cerrar
                </button>
              </div>
            </div>
          </div>
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
  const [err, setErr] = useState("");

  const [lineLabels, setLineLabels] = useState([]);
  const [lineIngresos, setLineIngresos] = useState([]);
  const [lineEgresos, setLineEgresos] = useState([]);

  const [totIng, setTotIng] = useState(0);
  const [totEgr, setTotEgr] = useState(0);

  // trabajadores (tabla)
  const [trab, setTrab] = useState([]);
  const [loadingTrab, setLoadingTrab] = useState(false);

  // filtros trabajadores
  const [trabYear, setTrabYear] = useState(() => {
    if (anioSeleccionado && anioSeleccionado !== "TODOS") return String(anioSeleccionado);
    return String(new Date().getFullYear());
  });
  const [trabMonthMode, setTrabMonthMode] = useState("HASTA"); // HASTA | MES
  const [trabMonth, setTrabMonth] = useState(() => new Date().getMonth() + 1);

  // modal detalle trabajador
  const [detalleOpen, setDetalleOpen] = useState(false);
  const [detalleWorker, setDetalleWorker] = useState(null);
  const [detalleLoading, setDetalleLoading] = useState(false);
  const [detalleSeriesMeses, setDetalleSeriesMeses] = useState([]);
  const [detalleSeriesMontos, setDetalleSeriesMontos] = useState([]);

  // cache: por año+mes -> respuesta trabajadores (acumulado)
  const cacheTrabRef = useRef(new Map());

  const mountedRef = useRef(false);

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
      setErr("");
      setLoading(true);

      const u = new URL(`${baseUrl}/api.php`);
      u.searchParams.set("action", "reportes");
      u.searchParams.set("op", "movimientos");
      u.searchParams.set("anio", yearForQuery);

      const data = await fetchJSON(u.toString());
      const pagos = Array.isArray(data?.pagos)
        ? data.pagos
        : Array.isArray(data?.ingresos)
        ? data.ingresos
        : [];
      const egresos = Array.isArray(data?.egresos) ? data.egresos : [];

      const norm = (r) => ({
        fecha: r.fecha ?? r.Fecha ?? r.fecha_mov ?? r.fechaPago ?? r.fecha_pago ?? "",
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
        const m = monthFromFecha(r.fecha);
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
      setErr(msg);
      showToast?.("error", `❌ No se pudieron cargar los gráficos: ${msg}`, 4200);
    } finally {
      setLoading(false);
    }
  }, [baseUrl, fetchJSON, labelMesById, showToast, yearForQuery]);

  // ========= Trabajadores helpers =========
  const fetchTrabAcumulado = useCallback(
    async (anio, mesHasta) => {
      const key = `${anio}::${mesHasta}`;
      if (cacheTrabRef.current.has(key)) return cacheTrabRef.current.get(key);

      const u = new URL(`${baseUrl}/api.php`);
      u.searchParams.set("action", "reportes");
      u.searchParams.set("op", "trabajadores");
      u.searchParams.set("anio", String(anio));
      u.searchParams.set("mes", String(mesHasta));

      const data = await fetchJSON(u.toString());
      const arr = Array.isArray(data?.trabajadores) ? data.trabajadores : [];

      const normT = (r) => ({
        id: r.id ?? r.id_trabajador ?? null,
        nombre: r.nombre ?? "",
        apellido: r.apellido ?? "",
        rol: r.rol ?? "",
        alias_pago: r.alias_pago ?? "",
        sistemas_cobrados: Number(r.sistemas_cobrados ?? 0) || 0,
        monto: Number(r.monto ?? 0) || 0,
      });

      const mapped = arr.map(normT);
      cacheTrabRef.current.set(key, mapped);
      return mapped;
    },
    [baseUrl, fetchJSON]
  );

  const loadTrabajadores = useCallback(async () => {
    try {
      setErr("");
      setLoadingTrab(true);

      const y = String(trabYear || "").trim() || String(new Date().getFullYear());
      const m = clamp(Number(trabMonth) || 1, 1, 12);

      // MODO:
      // - HASTA => usamos acumulado hasta m tal cual devuelve el backend
      // - MES   => pedimos acumulado hasta m y acumulado hasta (m-1), y hacemos diff por trabajador
      if (trabMonthMode === "HASTA") {
        const arr = await fetchTrabAcumulado(y, m);
        const sorted = arr.slice().sort((a, b) => (b.monto || 0) - (a.monto || 0));
        setTrab(sorted);
        return;
      }

      // MES exacto:
      const arrUpTo = await fetchTrabAcumulado(y, m);
      const arrPrev = m > 1 ? await fetchTrabAcumulado(y, m - 1) : [];

      const prevById = new Map(arrPrev.map((t) => [String(t.id), t]));
      const diff = arrUpTo.map((t) => {
        const prev = prevById.get(String(t.id));
        const montoPrev = Number(prev?.monto || 0) || 0;
        const sistPrev = Number(prev?.sistemas_cobrados || 0) || 0;
        return {
          ...t,
          // en “MES” mostramos lo generado en ese mes (diff)
          monto: Math.max(0, (Number(t.monto || 0) || 0) - montoPrev),
          sistemas_cobrados: Math.max(
            0,
            (Number(t.sistemas_cobrados || 0) || 0) - sistPrev
          ),
        };
      });

      const sorted = diff.slice().sort((a, b) => (b.monto || 0) - (a.monto || 0));
      setTrab(sorted);
    } catch (e) {
      const msg = String(e?.message || e);
      setErr(msg);
      showToast?.("error", `❌ No se pudieron cargar trabajadores: ${msg}`, 4200);
      setTrab([]);
    } finally {
      setLoadingTrab(false);
    }
  }, [fetchTrabAcumulado, showToast, trabMonth, trabMonthMode, trabYear]);

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

        // Serie mensual:
        // si modo HASTA -> serie 1..mSel (diff entre acumulados)
        // si modo MES   -> igual hacemos 1..mSel, pero al final el “total del mes” se ve en tabla principal;
        // acá siempre mostramos “por mes”.
        const months = Array.from({ length: mSel }).map((_, i) => i + 1);

        const acumulados = [];
        for (const mm of months) {
          const arr = await fetchTrabAcumulado(y, mm);
          const found = arr.find((t) => String(t.id) === String(worker.id));
          acumulados.push(Number(found?.monto || 0) || 0);
        }

        const byMonth = acumulados.map((acc, idx) => {
          const prev = idx === 0 ? 0 : acumulados[idx - 1];
          return Math.max(0, Math.round(acc - prev));
        });

        const labels = months.map((mm) => String(buildMonthLabel(mm)).toUpperCase());

        setDetalleSeriesMeses(labels);
        setDetalleSeriesMontos(byMonth);
      } catch (e) {
        const msg = String(e?.message || e);
        showToast?.("error", `❌ No se pudo armar el gráfico del trabajador: ${msg}`, 4200);
      } finally {
        setDetalleLoading(false);
      }
    },
    [buildMonthLabel, fetchTrabAcumulado, showToast, trabMonth, trabYear]
  );

  // ===== resumen =====
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

  // ===== lifecycle =====
  useEffect(() => {
    if (!open) return;
    if (!mountedRef.current) mountedRef.current = true;

    // reset
    setTab("general");
    setErr("");

    // general siempre
    loadGeneral();

    // set default filtros trabajadores
    const defaultYear =
      anioSeleccionado && anioSeleccionado !== "TODOS"
        ? String(anioSeleccionado)
        : String(new Date().getFullYear());
    setTrabYear(defaultYear);

    // por defecto: si el año es el actual => mes actual, sino => 12
    const ySel = parseInt(defaultYear, 10);
    const yNow = new Date().getFullYear();
    setTrabMonth(!Number.isNaN(ySel) && ySel === yNow ? currentMonth : 12);
    setTrabMonthMode("HASTA");

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (tab === "trabajadores") loadTrabajadores();
  }, [open, tab, loadTrabajadores]);

  // recarga trabajadores al cambiar filtros (solo si estás en esa pestaña)
  useEffect(() => {
    if (!open) return;
    if (tab !== "trabajadores") return;
    loadTrabajadores();
  }, [open, tab, trabYear, trabMonth, trabMonthMode, loadTrabajadores]);

  if (!open) return null;

  return (
    <>
      <div className="mgr-overlay" role="dialog" aria-modal="true" aria-label="Gráficos de Reportes">
        <div className="mgr-modal">
          <div className="mgr-head">
            <div className="mgr-title">
              <span className="mgr-ic">
                <FontAwesomeIcon icon={faChartLine} />
              </span>
              <div>
                <div className="mgr-h1">Gráficos & Resumen</div>
                <div className="mgr-sub">
                  Año: <b>{yearForQuery}</b> • Corte:{" "}
                  <b>
                    {cutoffMonth}/{yearForQuery}
                  </b>
                </div>
              </div>
            </div>

            <button className="mgr-close" type="button" onClick={onClose} aria-label="Cerrar">
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </div>

          {/* Tabs */}
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

            <button
              type="button"
              className={`mgr-tab ${tab === "resumen" ? "is-active" : ""}`}
              role="tab"
              aria-selected={tab === "resumen"}
              onClick={() => setTab("resumen")}
            >
              <FontAwesomeIcon icon={faCircleInfo} /> Resumen
            </button>
          </div>

          {err ? <div className="mgr-error">❌ {err}</div> : null}

          {/* Content */}
          <div className="mgr-body">
            {tab === "general" && (
              <>
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

                <div className="mgr-grid2">
                  <div className="mgr-card">
                    <div className="mgr-cardtitle">Ingresos vs Egresos por mes</div>
                    {loading ? (
                      <div className="mgr-loading">Cargando gráfico…</div>
                    ) : (
                      <LineChartSVG
                        labels={lineLabels}
                        seriesA={lineIngresos}
                        seriesB={lineEgresos}
                        height={270}
                      />
                    )}
                  </div>

                  <div className="mgr-card">
                    <div className="mgr-cardtitle">
                      Proporción anual (Ingresos vs Egresos)
                      <span className="mgr-badge">
                        <FontAwesomeIcon icon={faChartPie} /> Donut
                      </span>
                    </div>
                    {loading ? (
                      <div className="mgr-loading">Cargando gráfico…</div>
                    ) : (
                      <DonutSVG a={totIng} b={totEgr} />
                    )}
                  </div>
                </div>
              </>
            )}

            {tab === "trabajadores" && (
              <div className="mgr-card">
                <div className="mgr-cardtitle" style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <span style={{ flex: "1 1 auto" }}>
                    {trabMonthMode === "HASTA" ? "Ganancias por trabajador (acumulado)" : "Ganancias por trabajador (mes exacto)"}
                  </span>
                </div>

                {/* Filtros tipo Reportes (año + mes) */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    gap: 10,
                    marginTop: 10,
                    marginBottom: 12,
                    alignItems: "end",
                  }}
                >
                  <div>
                    <div className="mgr-mini" style={{ marginBottom: 6 }}>
                      <FontAwesomeIcon icon={faCalendarAlt} /> Año
                    </div>
                    <input
                      className="mgr-input"
                      type="number"
                      value={trabYear}
                      onChange={(e) => {
                        setTrabYear(String(e.target.value || "").slice(0, 4));
                        // opcional: limpiar cache si querés
                      }}
                      min="2000"
                      max="2100"
                    />
                  </div>

                  <div>
                    <div className="mgr-mini" style={{ marginBottom: 6 }}>
                      <FontAwesomeIcon icon={faCalendarAlt} /> Modo
                    </div>
                    <select
                      className="mgr-input"
                      value={trabMonthMode}
                      onChange={(e) => setTrabMonthMode(e.target.value)}
                    >
                      <option value="HASTA">Acumulado (hasta mes)</option>
                      <option value="MES">Solo un mes</option>
                    </select>
                  </div>

                  <div>
                    <div className="mgr-mini" style={{ marginBottom: 6 }}>
                      <FontAwesomeIcon icon={faCalendarAlt} /> Mes
                    </div>
                    <select
                      className="mgr-input"
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

                          {/* ✅ botón por trabajador */}
                          <div className="center">
                            <button
                              type="button"
                              className="mgr-btn"
                              style={{ padding: "8px 10px" }}
                              onClick={() => openDetalleTrabajador(t)}
                              title="Ver gráfico personal"
                            >
                              <FontAwesomeIcon icon={faChartColumn} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* barras simples top 6 (visual) */}
                    <div className="mgr-bars">
                      <div className="mgr-cardtitle" style={{ marginTop: 10 }}>
                        Top 6 (visual)
                      </div>
                      {(() => {
                        const top = trab.slice(0, 6);
                        const max = Math.max(...top.map((x) => Number(x.monto || 0)), 1);
                        return top.map((t) => {
                          const pct = (Number(t.monto || 0) / max) * 100;
                          return (
                            <div key={`bar-${t.id ?? t.alias_pago}`} className="mgr-barrow">
                              <div className="mgr-barname">
                                {`${t.apellido || ""} ${t.nombre || ""}`.trim() || "—"}
                              </div>
                              <div className="mgr-bartrack">
                                <div className="mgr-barfill" style={{ width: `${pct}%` }} />
                              </div>
                              <div className="mgr-barval">${nf.format(Math.round(t.monto || 0))}</div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </>
                ) : (
                  <div className="mgr-empty">No hay datos de trabajadores para ese período.</div>
                )}
              </div>
            )}

            {tab === "resumen" && (
              <div className="mgr-grid2">
                <div className="mgr-card">
                  <div className="mgr-cardtitle">Highlights del año</div>

                  <div className="mgr-list">
                    <div className="mgr-li">
                      <span>Mes con más ingresos:</span>
                      <b>
                        {resumen.mesTopIng} • ${nf.format(Math.round(resumen.maxIng || 0))}
                      </b>
                    </div>
                    <div className="mgr-li">
                      <span>Mes con más egresos:</span>
                      <b>
                        {resumen.mesTopEgr} • ${nf.format(Math.round(resumen.maxEgr || 0))}
                      </b>
                    </div>
                    <div className="mgr-li">
                      <span>Balance anual:</span>
                      <b className={balance < 0 ? "bad" : "good"}>
                        {balance < 0 ? "-" : "+"}${nf.format(Math.round(Math.abs(balance)))}
                      </b>
                    </div>
                  </div>
                </div>

                <div className="mgr-card">
                  <div className="mgr-cardtitle">Top trabajador (según filtros de trabajadores)</div>

                  {resumen.topTrab ? (
                    <>
                      <div className="mgr-bigname">
                        {(resumen.topTrab.apellido || "")} {(resumen.topTrab.nombre || "")}
                      </div>
                      <div className="mgr-mini">{resumen.topTrab.rol || "—"}</div>

                      <div className="mgr-kpirow">
                        <div className="mgr-pill">
                          Sistemas: <b>{resumen.topTrab.sistemas_cobrados}</b>
                        </div>
                        <div className="mgr-pill">
                          Alias: <b>{resumen.topTrab.alias_pago || "—"}</b>
                        </div>
                      </div>

                      <div className="mgr-money">
                        ${nf.format(Math.round(resumen.topTrab.monto || 0))}
                      </div>
                      <div className="mgr-mini">
                        {tab === "resumen" && (
                          <>
                            {trabMonthMode === "HASTA" ? "Acumulado" : "Mes"}:{" "}
                            {trabMonth}/{trabYear}
                          </>
                        )}
                      </div>

                      <button
                        className="mgr-btn"
                        type="button"
                        style={{ marginTop: 10 }}
                        onClick={() => openDetalleTrabajador(resumen.topTrab)}
                      >
                        Ver gráfico personal
                      </button>
                    </>
                  ) : (
                    <div className="mgr-empty">No hay datos de trabajadores.</div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="mgr-foot">
            <div className="mgr-footnote">
              Tip: en “Trabajadores” podés cambiar Año/Mes y además abrir el gráfico individual por persona.
            </div>
            <button className="mgr-btn" type="button" onClick={onClose}>
              Cerrar
            </button>
          </div>
        </div>
      </div>

      {/* ✅ submodal gráfico personal */}
      <ModalTrabajadorDetalle
        open={detalleOpen}
        onClose={() => {
          setDetalleOpen(false);
          setDetalleWorker(null);
          setDetalleSeriesMeses([]);
          setDetalleSeriesMontos([]);
        }}
        worker={detalleWorker}
        mesesDisponibles={mesesDisponibles}
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
