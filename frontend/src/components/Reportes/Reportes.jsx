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
  faUsers,
  faPlus,
  faPenToSquare,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";
import * as XLSX from "xlsx";

// ✅ Modales
import ModalNuevoEgreso from "./modales/ModalNuevoEgreso";
import ModalEditarMovimiento from "./modales/ModalEditarMovimiento";
import ModalEliminarEgreso from "./modales/ModalEliminarEgreso";

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

/* Tabla genérica usando estética gridtable (ahora con acciones opcional) */
function GridTable({ title, icon, columns, rows, loading, actions }) {
  const allCols = useMemo(() => {
    if (!actions) return columns;
    return [
      ...columns,
      {
        key: "__actions",
        label: "",
        fr: "0.55fr", // ✅ angosta
        center: true,
        render: (r) => actions(r),
      },
    ];
  }, [columns, actions]);

  return (
    <section className="reportes-block">
      <div className="reportes-block-title">
        <span className="reportes-title-left">
          <FontAwesomeIcon icon={icon} /> {title}
        </span>
        <span className="reportes-count">{rows?.length || 0} registros</span>
      </div>

      <div className="contable-tablewrap reportes-tablewrap minimal">
        <div
          className="gridtable-header minimal"
          style={{ gridTemplateColumns: allCols.map((c) => c.fr).join(" ") }}
        >
          {allCols.map((c) => (
            <div key={c.key} className="gridtable-cell">
              {c.label}
            </div>
          ))}
        </div>

        <div className="gridtable-body minimal">
          {loading ? (
            renderSkeletonRows(allCols.length)
          ) : rows?.length ? (
            rows.map((r, idx) => (
              <div
                key={r.id ?? `${title}-${idx}`}
                className="gridtable-row row-appear minimal"
                style={{
                  gridTemplateColumns: allCols.map((c) => c.fr).join(" "),
                }}
              >
                {allCols.map((c) => (
                  <div
                    key={c.key}
                    className={`gridtable-cell ${c.center ? "centers" : ""}`}
                    data-label={c.label}
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

  // ✅ Tabs (3 botones)
  const [view, setView] = useState("pagos"); // "pagos" | "egresos" | "trabajadores"

  // ✅ Filtro Año (backend op=anios)
  const [aniosDisponibles, setAniosDisponibles] = useState([]);
  const [loadingAnios, setLoadingAnios] = useState(true);
  const [anioSeleccionado, setAnioSeleccionado] = useState("TODOS"); // ✅ "TODOS" | YYYY

  // ✅ Filtro Mes (sale de la BD via action=listas)
  const [mesesDisponibles, setMesesDisponibles] = useState([]);
  const [loadingMeses, setLoadingMeses] = useState(true);
  const [mesSeleccionado, setMesSeleccionado] = useState("TODOS"); // "TODOS" | id_mes

  // ✅ medios pago para modales
  const [mediosDisponibles, setMediosDisponibles] = useState([]);

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
  const [trabajadores, setTrabajadores] = useState([]);

  // Error visible
  const [errorMsg, setErrorMsg] = useState("");

  // ✅ Modal egreso
  const [modalEgresoOpen, setModalEgresoOpen] = useState(false);
  const [savingEgreso, setSavingEgreso] = useState(false);

  // ✅ Modal editar
  const [modalEditarOpen, setModalEditarOpen] = useState(false);
  const [savingEditar, setSavingEditar] = useState(false);
  const [editarTipo, setEditarTipo] = useState("pago"); // "pago" | "egreso" | "trabajador"
  const [editarItem, setEditarItem] = useState(null);

  // ✅ Modal eliminar egreso
  const [modalEliminarOpen, setModalEliminarOpen] = useState(false);
  const [deletingEgreso, setDeletingEgreso] = useState(false);
  const [egresoAEliminar, setEgresoAEliminar] = useState(null);

  // ✅ para forzar refresh sin tocar filtros
  const [reloadKey, setReloadKey] = useState(0);

  const volver = useCallback(() => navigate(-1), [navigate]);

  // ✅ FIX: fetch robusto (no revienta con HTML)
  const fetchJSON = useCallback(async (url) => {
    const sep = url.includes("?") ? "&" : "?";
    const finalUrl = `${url}${sep}ts=${Date.now()}`;

    const res = await fetch(finalUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    const text = await res.text();

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} :: ${text.slice(0, 300)}`);
    }

    const trimmed = (text || "").trim();

    if (trimmed.startsWith("<")) {
      throw new Error(
        `Backend devolvió HTML (error PHP). Primeros chars: ${trimmed.slice(0, 300)}`
      );
    }

    try {
      return JSON.parse(trimmed || "{}");
    } catch {
      throw new Error(`JSON inválido. Primeros chars: ${trimmed.slice(0, 300)}`);
    }
  }, []);

  // ✅ POST robusto (JSON)
  const postJSON = useCallback(async (url, bodyObj) => {
    const sep = url.includes("?") ? "&" : "?";
    const finalUrl = `${url}${sep}ts=${Date.now()}`;

    const res = await fetch(finalUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(bodyObj ?? {}),
    });

    const text = await res.text();

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} :: ${text.slice(0, 300)}`);
    }

    const trimmed = (text || "").trim();

    if (trimmed.startsWith("<")) {
      throw new Error(
        `Backend devolvió HTML (error PHP). Primeros chars: ${trimmed.slice(0, 300)}`
      );
    }

    try {
      return JSON.parse(trimmed || "{}");
    } catch {
      throw new Error(`JSON inválido. Primeros chars: ${trimmed.slice(0, 300)}`);
    }
  }, []);

  // ✅ Abrir modal editar según pestaña
  const onEditar = useCallback(
    (row) => {
      const t =
        view === "egresos"
          ? "egreso"
          : view === "trabajadores"
          ? "trabajador"
          : "pago";

      // ✅ garantizar un id válido en item.id (tu modal lo exige)
      const fixedId =
        row?.id ??
        row?.id_mov ??
        row?.id_pago ??
        row?.id_egreso ??
        row?.id_trabajador ??
        null;

      const fixedRow = { ...row, id: fixedId };

      setEditarTipo(t);
      setEditarItem(fixedRow);
      setModalEditarOpen(true);
    },
    [view]
  );

  // ✅ Eliminar: SOLO EGRESOS (abre modal)
  const onEliminarEgreso = useCallback((row) => {
    setEgresoAEliminar(row);
    setModalEliminarOpen(true);
  }, []);

  // ✅ Confirmar editar (backend)
  const confirmarEditar = useCallback(
    async (payload) => {
      try {
        setErrorMsg("");
        setSavingEditar(true);

        const url = `${BASE_URL}/api.php?action=reportes&op=editar_movimiento`;
        const data = await postJSON(url, payload);

        if (!data?.exito) {
          throw new Error(data?.mensaje || "No se pudo editar.");
        }

        setModalEditarOpen(false);
        setEditarItem(null);
        setReloadKey((k) => k + 1);
      } catch (e) {
        console.error("Error editando:", e);
        setErrorMsg(String(e?.message || e));
      } finally {
        setSavingEditar(false);
      }
    },
    [postJSON]
  );

  // ✅ Confirmar eliminar egreso (backend)
  const confirmarEliminarEgreso = useCallback(
    async (eg) => {
      try {
        setErrorMsg("");
        setDeletingEgreso(true);

        const id =
          eg?.id ??
          eg?.id_egreso ??
          eg?.id_mov ??
          null;

        if (!id) throw new Error("No se encontró ID del egreso para eliminar.");

        const url = `${BASE_URL}/api.php?action=reportes&op=eliminar_egreso`;
        const data = await postJSON(url, { id });

        if (!data?.exito) {
          throw new Error(data?.mensaje || "No se pudo eliminar el egreso.");
        }

        setModalEliminarOpen(false);
        setEgresoAEliminar(null);
        setReloadKey((k) => k + 1);
      } catch (e) {
        console.error("Error eliminando egreso:", e);
        setErrorMsg(String(e?.message || e));
      } finally {
        setDeletingEgreso(false);
      }
    },
    [postJSON]
  );

  /* ===== AÑOS (backend) ===== */
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setErrorMsg("");
        setLoadingAnios(true);

        const data = await fetchJSON(
          `${BASE_URL}/api.php?action=reportes&op=anios`
        ).catch(() => null);

        const arr = Array.isArray(data?.anios) ? data.anios : [];
        const years = ["TODOS", ...arr.map((y) => String(y))];

        if (!alive) return;
        setAniosDisponibles(years);

        if (!didInitAnios.current) {
          const now = new Date();
          const yNow = String(now.getFullYear());

          let yDefault = "TODOS";
          if (years.includes(yNow)) yDefault = yNow;
          else if (arr.length > 0) yDefault = String(arr[0]); // ORDER BY DESC

          setAnioSeleccionado(yDefault);
          didInitAnios.current = true;
        }
      } catch (e) {
        console.error("Error cargando años:", e);
        if (!alive) return;

        setErrorMsg(String(e?.message || e));
        setAniosDisponibles(["TODOS"]);
        if (!didInitAnios.current) {
          setAnioSeleccionado("TODOS");
          didInitAnios.current = true;
        }
      } finally {
        if (alive) setLoadingAnios(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [fetchJSON]);

  /* ===== Cargar MESES + MEDIOS ===== */
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setErrorMsg("");
        setLoadingMeses(true);

        const data = await fetchJSON(`${BASE_URL}/api.php?action=listas`).catch(
          () => null
        );

        const meses = Array.isArray(data?.listas?.meses)
          ? data.listas.meses
          : [];

        // Soporta ambas variantes: id_mes o id
        const mesesNorm = meses.map((m) => ({
          ...m,
          id: m.id ?? m.id_mes,
          mes: m.mes ?? m.nombre ?? m.label,
        }));

        const medios = Array.isArray(data?.listas?.medios_pago)
          ? data.listas.medios_pago
          : Array.isArray(data?.listas?.medios)
          ? data.listas.medios
          : [];

        // Soporta ambas variantes: id_medio_pago o id
        const mediosNorm = medios.map((m) => ({
          ...m,
          id: m.id ?? m.id_medio_pago,
          nombre: m.nombre ?? m.medio ?? m.label,
        }));

        if (!alive) return;

        setMesesDisponibles(mesesNorm);
        setMediosDisponibles(mediosNorm);

        if (!didInitMeses.current) {
          const now = new Date();
          const mNow = String(now.getMonth() + 1);

          const exists = mesesNorm.some((m) => String(m.id) === mNow);
          setMesSeleccionado(exists ? mNow : "TODOS");
          didInitMeses.current = true;
        }
      } catch (e) {
        console.error("Error cargando meses:", e);
        if (!alive) return;

        setErrorMsg(String(e?.message || e));
        setMesesDisponibles([]);
        setMediosDisponibles([]);
        if (!didInitMeses.current) {
          setMesSeleccionado("TODOS");
          didInitMeses.current = true;
        }
      } finally {
        if (alive) setLoadingMeses(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [fetchJSON]);

  /* ===== Carga de DATOS (REPORTES) ===== */
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setErrorMsg("");
        setLoadingData(true);

        const u = new URL(`${BASE_URL}/api.php`);
        u.searchParams.set("action", "reportes");

        if (anioSeleccionado !== "TODOS") {
          u.searchParams.set("anio", String(parseInt(anioSeleccionado, 10)));
        }
        if (mesSeleccionado !== "TODOS") {
          u.searchParams.set("mes", String(parseInt(mesSeleccionado, 10)));
        }

        if (view === "trabajadores") {
          u.searchParams.set("op", "trabajadores");
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

          if (!alive) return;
          setTrabajadores(arr.map(normT));
          setPagos([]);
          setEgresos([]);
          return;
        }

        u.searchParams.set("op", "movimientos");
        const data = await fetchJSON(u.toString());

        const pagosArr = Array.isArray(data?.pagos)
          ? data.pagos
          : Array.isArray(data?.ingresos)
          ? data.ingresos
          : [];

        const egresosArr = Array.isArray(data?.egresos) ? data.egresos : [];

        const norm = (r) => ({
          id: r.id ?? r.ID ?? r.id_mov ?? r.id_pago ?? r.id_egreso ?? null,
          fecha:
            r.fecha ??
            r.Fecha ??
            r.fecha_mov ??
            r.fechaPago ??
            r.fecha_pago ??
            "",
          concepto: r.concepto ?? r.Concepto ?? r.nombre_concepto ?? "",
          descripcion: r.descripcion ?? r.detalle ?? r.Descripcion ?? "",
          categoria: r.categoria ?? r.Categoria ?? r.nombre_categoria ?? "",
          medio: r.medio ?? r.Medio ?? r.medio_pago ?? r.Medio_Pago ?? "",
          monto: Number(r.monto ?? r.Monto ?? r.importe ?? r.Precio ?? 0) || 0,
          cliente_nombre: r.cliente_nombre ?? r.cliente ?? "",
          sistema_nombre: r.sistema_nombre ?? r.sistema ?? "",
          // ✅ NECESARIO para que el modal preseleccione medio:
          id_medio_pago:
            r.id_medio_pago ?? r.idMedio ?? r.id_medio ?? r.medio_id ?? null,
        });

        if (!alive) return;
        setPagos(pagosArr.map(norm));
        setEgresos(egresosArr.map(norm));
        setTrabajadores([]);
      } catch (e) {
        console.error("Error cargando reportes:", e);
        if (!alive) return;

        setErrorMsg(String(e?.message || e));
        setPagos([]);
        setEgresos([]);
        setTrabajadores([]);
      } finally {
        if (alive) setLoadingData(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [mesSeleccionado, anioSeleccionado, view, fetchJSON, reloadKey]);

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

  const totalTrabajadores = useMemo(
    () => trabajadores.reduce((acc, r) => acc + (Number(r.monto || 0) || 0), 0),
    [trabajadores]
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
        `${r.fecha} ${r.concepto} ${r.descripcion} ${r.categoria} ${r.medio} ${r.monto}`.toLowerCase();
      return blob.includes(q);
    });
  }, [egresos, q]);

  const trabajadoresFiltrados = useMemo(() => {
    if (!q) return trabajadores;
    return trabajadores.filter((r) => {
      const blob =
        `${r.nombre} ${r.apellido} ${r.rol} ${r.alias_pago} ${r.sistemas_cobrados} ${r.monto}`.toLowerCase();
      return blob.includes(q);
    });
  }, [trabajadores, q]);

  /* ===== Columnas ===== */
  const colsMov = useMemo(
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

  const colsEgresos = useMemo(
    () => [
      { key: "fecha", label: "Fecha", fr: "0.9fr" },
      {
        key: "concepto",
        label: "Concepto",
        fr: "1.3fr",
        render: (r) => r.concepto || "—",
      },
      {
        key: "descripcion",
        label: "Descripción",
        fr: "2fr",
        render: (r) => r.descripcion || "—",
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

  const colsTrab = useMemo(
    () => [
      {
        key: "trabajador",
        label: "Trabajador",
        fr: "1.8fr",
        render: (r) => `${r.apellido || ""} ${r.nombre || ""}`.trim() || "—",
      },
      { key: "rol", label: "Rol", fr: "1fr" },
      {
        key: "alias_pago",
        label: "Alias",
        fr: "1.4fr",
        render: (r) => r.alias_pago || "—",
      },
      {
        key: "sistemas_cobrados",
        label: "Sistemas",
        fr: "0.9fr",
        center: true,
        render: (r) => String(r.sistemas_cobrados ?? 0),
      },
      {
        key: "monto",
        label: "A pagar",
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

    const mesTxt =
      mesSeleccionado === "TODOS"
        ? "TODOS"
        : mesesDisponibles.find((m) => String(m.id) === String(mesSeleccionado))
            ?.mes || `MES_${mesSeleccionado}`;

    const anioTxt = anioSeleccionado === "TODOS" ? "TODOS" : anioSeleccionado;

    if (view === "trabajadores") {
      const ws = XLSX.utils.json_to_sheet(
        trabajadoresFiltrados.map((r) => ({
          TRABAJADOR: `${r.apellido || ""} ${r.nombre || ""}`.trim(),
          ROL: r.rol,
          ALIAS: r.alias_pago,
          SISTEMAS: r.sistemas_cobrados,
          A_PAGAR: r.monto,
        })),
        { header: ["TRABAJADOR", "ROL", "ALIAS", "SISTEMAS", "A_PAGAR"] }
      );

      ws["!cols"] = [
        { wch: 28 },
        { wch: 14 },
        { wch: 22 },
        { wch: 10 },
        { wch: 14 },
      ];

      XLSX.utils.book_append_sheet(wb, ws, "Trabajadores");
      XLSX.writeFile(wb, `reportes_trabajadores_${anioTxt}_${mesTxt}.xlsx`);
      return;
    }

    if (view === "egresos") {
      const ws = XLSX.utils.json_to_sheet(
        egresosFiltrados.map((r) => ({
          FECHA: r.fecha,
          CONCEPTO: r.concepto,
          DESCRIPCION: r.descripcion,
          MES: r.categoria,
          MEDIO: r.medio,
          MONTO: r.monto,
        })),
        { header: ["FECHA", "CONCEPTO", "DESCRIPCION", "MES", "MEDIO", "MONTO"] }
      );

      ws["!cols"] = [
        { wch: 12 },
        { wch: 26 },
        { wch: 34 },
        { wch: 14 },
        { wch: 16 },
        { wch: 12 },
      ];

      XLSX.utils.book_append_sheet(wb, ws, "Egresos");
      XLSX.writeFile(wb, `reportes_egresos_${anioTxt}_${mesTxt}.xlsx`);
      return;
    }

    // pagos
    const ws = XLSX.utils.json_to_sheet(
      pagosFiltrados.map((r) => ({
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

    ws["!cols"] = [
      { wch: 12 },
      { wch: 22 },
      { wch: 28 },
      { wch: 14 },
      { wch: 16 },
      { wch: 12 },
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Pagos");
    XLSX.writeFile(wb, `reportes_pagos_${anioTxt}_${mesTxt}.xlsx`);
  }, [
    view,
    pagosFiltrados,
    egresosFiltrados,
    trabajadoresFiltrados,
    mesSeleccionado,
    mesesDisponibles,
    anioSeleccionado,
  ]);

  const labelMes =
    mesSeleccionado === "TODOS"
      ? "Todos los meses"
      : mesesDisponibles.find((m) => String(m.id) === String(mesSeleccionado))
          ?.mes || "";

  const labelAnio =
    anioSeleccionado === "TODOS" ? "Todos los años" : `Año ${anioSeleccionado}`;

  // ✅ Guardar egreso (POST) y refrescar tabla
  const crearEgreso = useCallback(
    async (payload) => {
      try {
        setErrorMsg("");
        setSavingEgreso(true);

        const url = `${BASE_URL}/api.php?action=reportes&op=crear_egreso`;
        const data = await postJSON(url, payload);

        if (!data?.exito) {
          throw new Error(data?.mensaje || "No se pudo crear el egreso.");
        }

        setModalEgresoOpen(false);
        setReloadKey((k) => k + 1);
      } catch (e) {
        console.error("Error creando egreso:", e);
        setErrorMsg(String(e?.message || e));
      } finally {
        setSavingEgreso(false);
      }
    },
    [postJSON]
  );

  return (
    <div className="contable-viewport">
      {/* TOPBAR */}
      <header className="contable-topbar">
        <h1 className="contable-topbar-title">
          <FontAwesomeIcon icon={faCoins} /> Reportes
        </h1>

        <button className="contable-back-button" onClick={volver} aria-label="Volver">
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
                {loadingAnios ? <span style={{ opacity: 0.7 }}>(cargando…)</span> : null}
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

            {/* Error visible */}
            {errorMsg ? (
              <div
                style={{
                  marginTop: 10,
                  padding: "10px 12px",
                  borderRadius: 12,
                  background: "rgba(220,38,38,.08)",
                  border: "1px solid rgba(220,38,38,.25)",
                  color: "#991b1b",
                  fontSize: 12,
                  lineHeight: 1.35,
                  whiteSpace: "pre-wrap",
                }}
              >
                <b>Error:</b> {errorMsg}
              </div>
            ) : null}
          </section>
        </aside>

        {/* MAIN */}
        <main className="contable-main">
          {/* Toolbar arriba (3 botones) */}
          <div className="main-switch" role="tablist" aria-label="Cambiar vista principal">
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

              <button
                type="button"
                role="tab"
                aria-selected={view === "trabajadores"}
                className={`segmented ${view === "trabajadores" ? "is-active" : ""}`}
                onClick={() => setView("trabajadores")}
              >
                <FontAwesomeIcon icon={faUsers} /> Trabajadores
              </button>

              {/* ✅ Botón SOLO en EGRESOS */}
              {view === "egresos" && (
                <button
                  type="button"
                  className="segmented"
                  onClick={() => setModalEgresoOpen(true)}
                  style={{
                    marginLeft: 8,
                    borderColor: "rgba(11,94,215,.35)",
                    color: "#0b5ed7",
                    fontWeight: 800,
                  }}
                >
                  <FontAwesomeIcon icon={faPlus} /> Nuevo egreso
                </button>
              )}
            </div>

            <div className="switch-right">
              <div className="searchbox">
                <FontAwesomeIcon icon={faSearch} />
                <input
                  type="text"
                  placeholder="Buscar…"
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
                borderColor:
                  view === "trabajadores"
                    ? "#0ea5e9"
                    : balance < 0
                    ? "#dc2626"
                    : "#16a34a",
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color:
                    view === "trabajadores"
                      ? "#0ea5e9"
                      : balance < 0
                      ? "#dc2626"
                      : "#16a34a",
                }}
              >
                {view === "trabajadores"
                  ? "Total a pagar (trabajadores)"
                  : "Balance (pagos − egresos)"}
              </div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  marginTop: 4,
                  color:
                    view === "trabajadores"
                      ? "#0ea5e9"
                      : balance < 0
                      ? "#dc2626"
                      : "#16a34a",
                }}
              >
                $
                {nfPesos.format(
                  view === "trabajadores" ? totalTrabajadores : Math.abs(balance)
                )}
              </div>
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                {view === "trabajadores"
                  ? `${labelAnio} • ${labelMes || "Todos los meses"}`
                  : balance < 0
                  ? "Déficit"
                  : "Superávit"}
              </div>
            </div>
          </div>

          {/* Tabla única según vista */}
          <div style={{ padding: "10px 12px 14px", flex: "1 1 auto", minHeight: 0 }}>
            {/* ✅ PAGOS: SIN ACCIONES */}
            {view === "pagos" && (
              <GridTable
                title="Pagos"
                icon={faMoneyBillTrendUp}
                columns={colsMov}
                rows={pagosFiltrados}
                loading={loadingData}
              />
            )}

            {/* ✅ EGRESOS: con acciones (editar + eliminar egreso) */}
            {view === "egresos" && (
              <GridTable
                title="Egresos"
                icon={faMoneyBillTransfer}
                columns={colsEgresos}
                rows={egresosFiltrados}
                loading={loadingData}
                actions={(r) => (
                  <div className="actions-cell">
                    <button
                      type="button"
                      className="icon-btn"
                      title="Editar"
                      onClick={() => onEditar(r)}
                      aria-label="Editar"
                    >
                      <FontAwesomeIcon icon={faPenToSquare} />
                    </button>

                    <button
                      type="button"
                      className="icon-btn danger"
                      title="Eliminar"
                      onClick={() => onEliminarEgreso(r)}
                      aria-label="Eliminar"
                    >
                      <FontAwesomeIcon icon={faTrash} />
                    </button>
                  </div>
                )}
              />
            )}

            {/* ✅ TRABAJADORES: con SOLO editar (por ahora sin eliminar) */}
            {view === "trabajadores" && (
              <GridTable
                title="Trabajadores"
                icon={faUsers}
                columns={colsTrab}
                rows={trabajadoresFiltrados}
                loading={loadingData}
                actions={(r) => (
                  <div className="actions-cell">
                    <button
                      type="button"
                      className="icon-btn"
                      title="Editar"
                      onClick={() => onEditar(r)}
                      aria-label="Editar"
                    >
                      <FontAwesomeIcon icon={faPenToSquare} />
                    </button>
                  </div>
                )}
              />
            )}
          </div>
        </main>
      </div>

      {/* ✅ Modal crear egreso */}
      <ModalNuevoEgreso
        open={modalEgresoOpen}
        onClose={() => setModalEgresoOpen(false)}
        onConfirm={crearEgreso}
        loading={savingEgreso}
        medios={mediosDisponibles}
      />

      {/* ✅ Modal editar movimiento */}
      <ModalEditarMovimiento
        open={modalEditarOpen}
        onClose={() => {
          if (savingEditar) return;
          setModalEditarOpen(false);
          setEditarItem(null);
        }}
        onConfirm={confirmarEditar}
        loading={savingEditar}
        tipo={editarTipo}
        item={editarItem}
        medios={mediosDisponibles}
      />

      {/* ✅ Modal eliminar egreso */}
      <ModalEliminarEgreso
        open={modalEliminarOpen}
        egreso={egresoAEliminar}
        loading={deletingEgreso}
        onClose={() => {
          if (deletingEgreso) return;
          setModalEliminarOpen(false);
          setEgresoAEliminar(null);
        }}
        onConfirm={confirmarEliminarEgreso}
      />
    </div>
  );
}
