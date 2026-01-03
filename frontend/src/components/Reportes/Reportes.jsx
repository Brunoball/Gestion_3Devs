// src/components/Contable/Reportes.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./dashboard.css"; // ✅ misma estética del Dashboard Contable
import BASE_URL from "../../config/config";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faCalendarAlt,
  faFileExcel,
  faSearch,
  faCoins,
  faMoneyBillTrendUp,
  faMoneyBillTransfer,
} from "@fortawesome/free-solid-svg-icons";
import * as XLSX from "xlsx";

/* Helpers */
const nfPesos = new Intl.NumberFormat("es-AR");
const SKELETON_ROWS = 8;

function renderSkeletonRows(cols = 5) {
  return Array.from({ length: SKELETON_ROWS }).map((_, idx) => (
    <div
      className="gridtable-row skeleton-row"
      role="row"
      key={`sk-${idx}`}
      aria-hidden="true"
    >
      {Array.from({ length: cols }).map((__, j) => (
        <div className="gridtable-cell" key={j}>
          <span className={`skeleton-bar ${j === 0 ? "w-80" : "w-60"}`} />
        </div>
      ))}
    </div>
  ));
}

/* Tabla genérica usando estética gridtable */
function GridTable({ title, icon, columns, rows, loading }) {
  return (
    <section className="reportes-block">
      <div className="reportes-block-title">
        <span className="reportes-title-left">
          <FontAwesomeIcon icon={icon} /> {title}
        </span>
        <span className="reportes-count">{rows?.length || 0} registros</span>
      </div>

      <div className="contable-tablewrap reportes-tablewrap">
        <div
          className="gridtable-header"
          style={{ gridTemplateColumns: columns.map((c) => c.fr).join(" ") }}
        >
          {columns.map((c) => (
            <div key={c.key} className="gridtable-cell">
              {c.label}
            </div>
          ))}
        </div>

        <div className="gridtable-body">
          {loading ? (
            renderSkeletonRows(columns.length)
          ) : rows?.length ? (
            rows.map((r, idx) => (
              <div
                key={r.id ?? `${title}-${idx}`}
                className="gridtable-row row-appear"
                style={{
                  gridTemplateColumns: columns.map((c) => c.fr).join(" "),
                }}
              >
                {columns.map((c) => (
                  <div
                    key={c.key}
                    className={`gridtable-cell ${c.center ? "centers" : ""}`}
                  >
                    {c.render ? c.render(r) : r[c.key]}
                  </div>
                ))}
              </div>
            ))
          ) : (
            <div className="detalle-empty">
              <div className="gridtable-empty-inner">
                <div className="empty-icon">📭</div>
                <div>No hay datos para los filtros aplicados.</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default function Reportes() {
  const navigate = useNavigate();

  // ✅ Tabs (2 botones)
  const [view, setView] = useState("pagos"); // "pagos" | "egresos"

  // ✅ Filtro Año (AHORA viene del backend op=anios)
  const [aniosDisponibles, setAniosDisponibles] = useState([]);
  const [loadingAnios, setLoadingAnios] = useState(true);
  const [anioSeleccionado, setAnioSeleccionado] = useState("TODOS"); // ✅ "TODOS" | YYYY

  // ✅ Filtro Mes (sale de la BD via action=listas)
  const [mesesDisponibles, setMesesDisponibles] = useState([]);
  const [loadingMeses, setLoadingMeses] = useState(true);
  const [mesSeleccionado, setMesSeleccionado] = useState("TODOS"); // "TODOS" | id_mes

  // ✅ evita pisar el default cuando vuelven a cargar selects
  const didInitAnios = useRef(false);
  const didInitMeses = useRef(false);

  // Búsqueda
  const [searchText, setSearchText] = useState("");

  // Carga
  const [loadingData, setLoadingData] = useState(false);

  // Data
  const [pagos, setPagos] = useState([]);
  const [egresos, setEgresos] = useState([]);

  const volver = useCallback(() => navigate(-1), [navigate]);

  const fetchJSON = useCallback(async (url) => {
    const sep = url.includes("?") ? "&" : "?";
    const res = await fetch(`${url}${sep}ts=${Date.now()}`, { method: "GET" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }, []);

  /* ===== AÑOS (backend) =====
     Backend:
     GET /api.php?action=reportes&op=anios
     -> { exito:true, anios:[2026,2025,...] }
  */
  useEffect(() => {
    (async () => {
      try {
        setLoadingAnios(true);

        const data = await fetchJSON(
          `${BASE_URL}/api.php?action=reportes&op=anios`
        ).catch(() => null);

        const arr = Array.isArray(data?.anios) ? data.anios : [];

        // normaliza: strings para el select + agrega TODOS
        const years = ["TODOS", ...arr.map((y) => String(y))];

        setAniosDisponibles(years);

        // ✅ default: año actual si existe; si no, el más nuevo; si no, TODOS
        if (!didInitAnios.current) {
          const now = new Date();
          const yNow = String(now.getFullYear());

          let yDefault = "TODOS";
          if (years.includes(yNow)) yDefault = yNow;
          else if (arr.length > 0) yDefault = String(arr[0]); // viene ORDER BY DESC

          setAnioSeleccionado(yDefault);
          didInitAnios.current = true;
        }
      } catch (e) {
        console.error("Error cargando años:", e);
        setAniosDisponibles(["TODOS"]);
        if (!didInitAnios.current) {
          setAnioSeleccionado("TODOS");
          didInitAnios.current = true;
        }
      } finally {
        setLoadingAnios(false);
      }
    })();
  }, [fetchJSON]);

  /* ===== Cargar MESES =====
     Backend:
     GET /api.php?action=listas
     -> { exito:true, listas:{ meses:[{id, mes}], ... } }
  */
  useEffect(() => {
    (async () => {
      try {
        setLoadingMeses(true);

        const data = await fetchJSON(`${BASE_URL}/api.php?action=listas`).catch(
          () => null
        );

        const meses = Array.isArray(data?.listas?.meses) ? data.listas.meses : [];
        setMesesDisponibles(meses);

        // ✅ default: mes actual si existe (id_mes 1..12); si no, TODOS
        if (!didInitMeses.current) {
          const now = new Date();
          const mNow = String(now.getMonth() + 1); // 1..12

          const exists = meses.some((m) => String(m.id) === mNow);
          setMesSeleccionado(exists ? mNow : "TODOS");
          didInitMeses.current = true;
        }
      } catch (e) {
        console.error("Error cargando meses:", e);
        setMesesDisponibles([]);
        if (!didInitMeses.current) {
          setMesSeleccionado("TODOS");
          didInitMeses.current = true;
        }
      } finally {
        setLoadingMeses(false);
      }
    })();
  }, [fetchJSON]);

  /* ===== Carga de DATOS (REPORTES) =====
     Backend actual:
     GET /api.php?action=reportes&op=movimientos
     GET /api.php?action=reportes&op=movimientos&mes=ID_MES
     GET /api.php?action=reportes&op=movimientos&anio=YYYY
  */
  useEffect(() => {
    (async () => {
      try {
        setLoadingData(true);

        const u = new URL(`${BASE_URL}/api.php`);
        u.searchParams.set("action", "reportes");
        u.searchParams.set("op", "movimientos");

        // ✅ anio opcional (solo si no es TODOS)
        if (anioSeleccionado !== "TODOS") {
          u.searchParams.set("anio", String(parseInt(anioSeleccionado, 10)));
        }

        if (mesSeleccionado !== "TODOS") {
          u.searchParams.set("mes", String(parseInt(mesSeleccionado, 10)));
        }

        const data = await fetchJSON(u.toString());

        const pagosArr = Array.isArray(data?.pagos)
          ? data.pagos
          : Array.isArray(data?.ingresos)
          ? data.ingresos
          : [];

        const egresosArr = Array.isArray(data?.egresos) ? data.egresos : [];

        // Normaliza para que siempre existan estas keys
        const norm = (r) => ({
          id: r.id ?? r.ID ?? r.id_mov ?? r.id_pago ?? r.id_egreso ?? null,
          fecha:
            r.fecha ??
            r.Fecha ??
            r.fecha_mov ??
            r.fechaPago ??
            r.fecha_pago ??
            "",
          concepto: r.concepto ?? r.Concepto ?? r.detalle ?? r.descripcion ?? "",
          cliente_nombre: r.cliente_nombre ?? r.cliente ?? "",
          sistema_nombre: r.sistema_nombre ?? r.sistema ?? "",
          categoria: r.categoria ?? r.Categoria ?? r.nombre_categoria ?? "",
          medio: r.medio ?? r.Medio ?? r.medio_pago ?? r.Medio_Pago ?? "",
          monto: Number(r.monto ?? r.Monto ?? r.importe ?? r.Precio ?? 0) || 0,
        });

        setPagos(pagosArr.map(norm));
        setEgresos(egresosArr.map(norm));
      } catch (e) {
        console.error("Error cargando reportes:", e);
        setPagos([]);
        setEgresos([]);
      } finally {
        setLoadingData(false);
      }
    })();
  }, [mesSeleccionado, anioSeleccionado, fetchJSON]);

  /* ===== Totales ===== */
  const totalPagos = useMemo(
    () => pagos.reduce((acc, r) => acc + (Number(r.monto || 0) || 0), 0),
    [pagos]
  );

  const totalEgresos = useMemo(
    () => egresos.reduce((acc, r) => acc + (Number(r.monto || 0) || 0), 0),
    [egresos]
  );

  const balance = useMemo(
    () => totalPagos - totalEgresos,
    [totalPagos, totalEgresos]
  );

  /* ===== Búsqueda ===== */
  const q = (searchText || "").trim().toLowerCase();

  const pagosFiltrados = useMemo(() => {
    if (!q) return pagos;
    return pagos.filter((r) => {
      const blob =
        `${r.fecha} ${r.concepto} ${r.cliente_nombre} ${r.sistema_nombre} ${r.categoria} ${r.medio} ${r.monto}`.toLowerCase();
      return blob.includes(q);
    });
  }, [pagos, q]);

  const egresosFiltrados = useMemo(() => {
    if (!q) return egresos;
    return egresos.filter((r) => {
      const blob =
        `${r.fecha} ${r.concepto} ${r.cliente_nombre} ${r.sistema_nombre} ${r.categoria} ${r.medio} ${r.monto}`.toLowerCase();
      return blob.includes(q);
    });
  }, [egresos, q]);

  /* ===== Columnas ===== */
  const cols = useMemo(
    () => [
      { key: "fecha", label: "Fecha", fr: "0.9fr" },
      {
        key: "cliente_nombre",
        label: "Cliente",
        fr: "1.3fr",
        render: (r) => {
          if (r.cliente_nombre) return r.cliente_nombre;
          const parts = String(r.concepto || "").split(" - ");
          return parts[0] || r.concepto || "";
        },
      },
      {
        key: "sistema_nombre",
        label: "Sistema",
        fr: "1.6fr",
        render: (r) => {
          if (r.sistema_nombre) return r.sistema_nombre;
          const parts = String(r.concepto || "").split(" - ");
          return parts[1] || "";
        },
      },
      { key: "categoria", label: "Mes", fr: "1.1fr" },
      { key: "medio", label: "Medio", fr: "1.1fr" },
      {
        key: "monto",
        label: "Monto",
        fr: "1fr",
        center: true,
        render: (r) => `$${nfPesos.format(Number(r.monto || 0))}`,
      },
    ],
    []
  );

  /* ===== Export Excel (según tab activo) ===== */
  const exportarExcel = useCallback(() => {
    const wb = XLSX.utils.book_new();

    const rows = view === "pagos" ? pagosFiltrados : egresosFiltrados;

    const makeSheet = (arr) =>
      XLSX.utils.json_to_sheet(
        arr.map((r) => ({
          FECHA: r.fecha,
          CLIENTE:
            r.cliente_nombre || String(r.concepto || "").split(" - ")[0] || "",
          SISTEMA:
            r.sistema_nombre || String(r.concepto || "").split(" - ")[1] || "",
          MES: r.categoria,
          MEDIO: r.medio,
          MONTO: r.monto,
        })),
        { header: ["FECHA", "CLIENTE", "SISTEMA", "MES", "MEDIO", "MONTO"] }
      );

    const nombreHoja = view === "pagos" ? "Pagos" : "Egresos";

    const ws = makeSheet(rows);
    ws["!cols"] = [
      { wch: 12 },
      { wch: 22 },
      { wch: 28 },
      { wch: 14 },
      { wch: 16 },
      { wch: 12 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, nombreHoja);

    const mesTxt =
      mesSeleccionado === "TODOS"
        ? "TODOS"
        : (mesesDisponibles.find((m) => String(m.id) === String(mesSeleccionado))
            ?.mes || `MES_${mesSeleccionado}`);

    const anioTxt = anioSeleccionado === "TODOS" ? "TODOS" : anioSeleccionado;

    XLSX.writeFile(wb, `reportes_${view}_${anioTxt}_${mesTxt}.xlsx`);
  }, [
    view,
    pagosFiltrados,
    egresosFiltrados,
    mesSeleccionado,
    mesesDisponibles,
    anioSeleccionado,
  ]);

  const labelMes =
    mesSeleccionado === "TODOS"
      ? "Todos los meses"
      : (mesesDisponibles.find((m) => String(m.id) === String(mesSeleccionado))
          ?.mes || "");

  const labelAnio =
    anioSeleccionado === "TODOS" ? "Todos los años" : `Año ${anioSeleccionado}`;

  return (
    <div className="contable-viewport">
      {/* TOPBAR */}
      <header className="contable-topbar">
        <h1 className="contable-topbar-title">
          <FontAwesomeIcon icon={faCoins} /> Reportes
        </h1>

        <button
          className="contable-back-button"
          onClick={volver}
          aria-label="Volver"
        >
          <FontAwesomeIcon icon={faArrowLeft} />
          &nbsp; Volver
        </button>
      </header>

      <div className="contable-grid reportes-grid">
        {/* SIDEBAR */}
        <aside className="contable-sidebar">
          <h3 className="side-block-title" style={{ marginTop: 0 }}>
            <FontAwesomeIcon icon={faCalendarAlt} /> Filtros
          </h3>

          <section className="side-block">
            {/* Año */}
            <label className="side-field">
              <span>
                Año{" "}
                {loadingAnios ? (
                  <span style={{ opacity: 0.7 }}>(cargando…)</span>
                ) : null}
              </span>
              <select
                value={anioSeleccionado}
                onChange={(e) => setAnioSeleccionado(e.target.value)}
                disabled={loadingAnios || aniosDisponibles.length === 0}
              >
                {aniosDisponibles.map((y) => (
                  <option key={y} value={y}>
                    {y === "TODOS" ? "Todos los años" : y}
                  </option>
                ))}
              </select>
            </label>

            {/* Mes */}
            <label className="side-field">
              <span>Mes</span>
              <select
                value={mesSeleccionado}
                onChange={(e) => setMesSeleccionado(e.target.value)}
                disabled={loadingMeses || mesesDisponibles.length === 0}
              >
                <option value="TODOS">Todos los meses</option>
                {mesesDisponibles.map((m) => (
                  <option key={m.id} value={m.id}>
                    {String(m.mes || "").toUpperCase()}
                  </option>
                ))}
              </select>
            </label>

            {/* Acciones */}
            <div className="side-actions">
              <button
                className="btn-dark excel"
                type="button"
                onClick={exportarExcel}
                disabled={loadingMeses || loadingAnios}
                title="Exportar Excel"
              >
                <FontAwesomeIcon icon={faFileExcel} /> Excel
              </button>
            </div>
          </section>
        </aside>

        {/* MAIN */}
        <main className="contable-main">
          {/* Toolbar arriba (2 botones) */}
          <div
            className="main-switch"
            role="tablist"
            aria-label="Cambiar vista principal"
          >
            <div className="switch-left">
              <button
                type="button"
                role="tab"
                aria-selected={view === "pagos"}
                className={`segmented ${view === "pagos" ? "is-active" : ""}`}
                onClick={() => setView("pagos")}
              >
                <FontAwesomeIcon icon={faMoneyBillTrendUp} /> Pagos
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={view === "egresos"}
                className={`segmented ${view === "egresos" ? "is-active" : ""}`}
                onClick={() => setView("egresos")}
              >
                <FontAwesomeIcon icon={faMoneyBillTransfer} /> Egresos
              </button>
            </div>

            <div className="switch-right">
              <div className="searchbox">
                <FontAwesomeIcon icon={faSearch} />
                <input
                  type="text"
                  placeholder="Buscar por fecha, cliente, sistema, mes, medio o monto…"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  disabled={loadingMeses || loadingAnios}
                />
              </div>
            </div>
          </div>

          {/* Cards resumen */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: "12px",
              margin: "12px 10px 6px",
            }}
          >
            <div
              style={{
                border: "1px dashed rgba(0,0,0,.12)",
                borderRadius: 12,
                padding: "10px 16px",
                background: "#fff",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>
                <FontAwesomeIcon icon={faMoneyBillTrendUp} /> Total pagos
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>
                ${nfPesos.format(totalPagos)}
              </div>
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                {`${labelAnio} • ${labelMes || "Todos los meses"}`}
              </div>
            </div>

            <div
              style={{
                border: "1px dashed rgba(0,0,0,.12)",
                borderRadius: 12,
                padding: "10px 16px",
                background: "#fff",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>
                <FontAwesomeIcon icon={faMoneyBillTransfer} /> Total egresos
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>
                ${nfPesos.format(totalEgresos)}
              </div>
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                {`${labelAnio} • ${labelMes || "Todos los meses"}`}
              </div>
            </div>

            <div
              style={{
                border: "1px dashed rgba(0,0,0,.12)",
                borderRadius: 12,
                padding: "10px 16px",
                background: "#fff",
                borderColor: balance < 0 ? "#dc2626" : "#16a34a",
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: balance < 0 ? "#dc2626" : "#16a34a",
                }}
              >
                Balance (pagos − egresos)
              </div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  marginTop: 4,
                  color: balance < 0 ? "#dc2626" : "#16a34a",
                }}
              >
                ${nfPesos.format(Math.abs(balance))}
              </div>
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                {balance < 0 ? "Déficit" : "Superávit"}
              </div>
            </div>
          </div>

          {/* Tabla única según vista */}
          <div style={{ padding: "10px 12px 14px", flex: "1 1 auto", minHeight: 0 }}>
            {view === "pagos" && (
              <GridTable
                title="Pagos"
                icon={faMoneyBillTrendUp}
                columns={cols}
                rows={pagosFiltrados}
                loading={loadingData}
              />
            )}

            {view === "egresos" && (
              <GridTable
                title="Egresos"
                icon={faMoneyBillTransfer}
                columns={cols}
                rows={egresosFiltrados}
                loading={loadingData}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
