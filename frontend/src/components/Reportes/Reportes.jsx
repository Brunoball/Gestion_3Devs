// src/components/Reportes/Reportes.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./dashboard.css";
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
  faEye,
} from "@fortawesome/free-solid-svg-icons";
import * as XLSX from "xlsx";

// ✅ Toast
import Toast from "../Global/Toast";

/* =========================================================
   ✅ IMPORTS ROBUSTOS (evita error "got: object")
   Soporta default export y named export sin cambiar los modales
========================================================= */
import * as ModNuevoEgreso from "./modales/ModalNuevoEgreso";
import * as ModEditarMovimiento from "./modales/ModalEditarMovimiento";
import * as ModEliminarEgreso from "./modales/ModalEliminarEgreso";
import * as ModVerComprobante from "./modales/ModalVerComprobante";

// helper: elige default o named de forma segura
function pickComponent(mod, preferredName) {
  const c =
    (mod && mod.default) ||
    (preferredName && mod && mod[preferredName]) ||
    (mod && Object.values(mod).find((v) => typeof v === "function")) ||
    null;

  return c;
}

// ✅ componentes finales (funciones React)
const ModalNuevoEgreso = pickComponent(ModNuevoEgreso, "ModalNuevoEgreso");
const ModalEditarMovimiento = pickComponent(ModEditarMovimiento, "ModalEditarMovimiento");
const ModalEliminarEgreso = pickComponent(ModEliminarEgreso, "ModalEliminarEgreso");
const ModalVerComprobante = pickComponent(ModVerComprobante, "ModalVerComprobante");

// Si alguno sigue mal exportado (objeto/undefined), tiramos error claro en dev
function assertIsComponent(Cmp, name) {
  if (process.env.NODE_ENV !== "production") {
    if (typeof Cmp !== "function") {
      // eslint-disable-next-line no-console
      console.error(`[Reportes] ${name} no es un componente válido. Recibido:`, Cmp);
      throw new Error(
        `${name} no es un componente React válido. Revisá export/import del modal (${name}).`
      );
    }
  }
}
assertIsComponent(ModalNuevoEgreso, "ModalNuevoEgreso");
assertIsComponent(ModalEditarMovimiento, "ModalEditarMovimiento");
assertIsComponent(ModalEliminarEgreso, "ModalEliminarEgreso");
assertIsComponent(ModalVerComprobante, "ModalVerComprobante");

/* Helpers */
const nfPesos = new Intl.NumberFormat("es-AR");
const SKELETON_ROWS = 8;

function renderSkeletonRows(cols = 5) {
  return Array.from({ length: SKELETON_ROWS }).map((_, idx) => (
    <div className="gridtable-row skeleton-row" role="row" key={`sk-${idx}`} aria-hidden="true">
      {Array.from({ length: cols }).map((__, j) => (
        <div className="gridtable-cell" key={`sk-${idx}-${j}`}>
          <span className={`skeleton-bar ${j === 0 ? "w-80" : "w-60"}`} />
        </div>
      ))}
    </div>
  ));
}

/* Tabla genérica */
function GridTable({ title, icon, columns = [], rows = [], loading = false, actions }) {
  const safeRows = Array.isArray(rows) ? rows : [];

  const allCols = useMemo(() => {
    if (!actions) return columns;
    return [
      ...columns,
      {
        key: "__actions",
        label: "Acciones", // ✅ header visible
        fr: "1fr",
        center: true,
        render: (r) => actions(r),
      },
    ];
  }, [columns, actions]);

  return (
    <section className="reportes-block">
      <div className="contable-tablewrap reportes-tablewrap minimal">
        <div
          className="gridtable-header minimal"
          style={{ gridTemplateColumns: allCols.map((c) => c.fr).join(" ") }}
        >
          {allCols.map((c) => (
            <div key={c.key} className={`gridtable-cell ${c.center ? "centers" : ""}`}>
              {c.label}
            </div>
          ))}
        </div>

        <div className="gridtable-body minimal">
          {loading ? (
            renderSkeletonRows(allCols.length || 5)
          ) : safeRows.length ? (
            safeRows.map((r, idx) => (
              <div
                key={r?.id ?? `${title}-${idx}`}
                className="gridtable-row row-appear minimal"
                style={{ gridTemplateColumns: allCols.map((c) => c.fr).join(" ") }}
              >
                {allCols.map((c) => (
                  <div
                    key={c.key}
                    className={`gridtable-cell ${c.center ? "centers" : ""}`}
                    data-label={c.label}
                  >
                    {c.render ? c.render(r) : r?.[c.key] ?? ""}
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

  /* ===========================
     ✅ TOAST GLOBAL
  =========================== */
  const [toast, setToast] = useState({
    show: false,
    tipo: "info",
    mensaje: "",
    duracion: 2500,
    key: 0,
  });

  const showToast = useCallback((tipo, mensaje, duracion = 2500) => {
    setToast((t) => ({
      show: true,
      tipo,
      mensaje,
      duracion,
      key: (t.key || 0) + 1,
    }));
  }, []);

  const closeToast = useCallback(() => {
    setToast((t) => ({ ...t, show: false }));
  }, []);

  // ✅ Tabs
  const [view, setView] = useState("pagos");

  // ✅ Años
  const [aniosDisponibles, setAniosDisponibles] = useState([]);
  const [loadingAnios, setLoadingAnios] = useState(true);
  const [anioSeleccionado, setAnioSeleccionado] = useState("TODOS");

  // ✅ Meses
  const [mesesDisponibles, setMesesDisponibles] = useState([]);
  const [loadingMeses, setLoadingMeses] = useState(true);
  const [mesSeleccionado, setMesSeleccionado] = useState("TODOS");

  // ✅ medios pago
  const [mediosDisponibles, setMediosDisponibles] = useState([]);

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

  // Error visible (panel)
  const [errorMsg, setErrorMsg] = useState("");

  // ✅ Modal egreso
  const [modalEgresoOpen, setModalEgresoOpen] = useState(false);
  const [savingEgreso, setSavingEgreso] = useState(false);

  // ✅ Modal editar
  const [modalEditarOpen, setModalEditarOpen] = useState(false);
  const [savingEditar, setSavingEditar] = useState(false);
  const [editarTipo, setEditarTipo] = useState("pago");
  const [editarItem, setEditarItem] = useState(null);

  // ✅ Modal eliminar egreso
  const [modalEliminarOpen, setModalEliminarOpen] = useState(false);
  const [deletingEgreso, setDeletingEgreso] = useState(false);
  const [egresoAEliminar, setEgresoAEliminar] = useState(null);

  // ✅ Modal ver comprobante
  const [modalVerCompOpen, setModalVerCompOpen] = useState(false);
  const [compItem, setCompItem] = useState(null);

  const [reloadKey, setReloadKey] = useState(0);

  const volver = useCallback(() => navigate(-1), [navigate]);

  // ✅ arma URL absoluta al comprobante
  const buildFileUrl = useCallback((path) => {
    const p = String(path || "").trim();
    if (!p) return "";
    if (p.startsWith("http://") || p.startsWith("https://")) return p;
    const base = String(BASE_URL || "").replace(/\/+$/, "");
    const clean = p.replace(/^\/+/, "");
    return `${base}/${clean}`;
  }, []);

  // ✅ GET robusto
  const fetchJSON = useCallback(async (url) => {
    const sep = url.includes("?") ? "&" : "?";
    const finalUrl = `${url}${sep}ts=${Date.now()}`;

    const res = await fetch(finalUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    const text = await res.text();

    if (!res.ok) throw new Error(`HTTP ${res.status} :: ${text.slice(0, 300)}`);

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

  // ✅ POST JSON robusto
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
    if (!res.ok) throw new Error(`HTTP ${res.status} :: ${text.slice(0, 300)}`);

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

  // ✅✅ POST FormData robusto (SUBIR ARCHIVOS)
  const postFormData = useCallback(async (url, formData) => {
    const sep = url.includes("?") ? "&" : "?";
    const finalUrl = `${url}${sep}ts=${Date.now()}`;

    const res = await fetch(finalUrl, {
      method: "POST",
      headers: { Accept: "application/json" }, // ⚠️ NO Content-Type
      body: formData,
    });

    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status} :: ${text.slice(0, 300)}`);

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
        view === "egresos" ? "egreso" : view === "trabajadores" ? "trabajador" : "pago";

      const fixedId =
        row?.id ??
        row?.id_mov ??
        row?.id_pago ??
        row?.id_egreso ??
        row?.id_trabajador ??
        null;

      const fixedRow = { ...(row || {}), id: fixedId };

      setEditarTipo(t);
      setEditarItem(fixedRow);
      setModalEditarOpen(true);
    },
    [view]
  );

  // ✅ Ver comprobante (SOLO EGRESOS)
  const onVerComprobante = useCallback(
    (row) => {
      const r = row || {};
      const comp = String(r?.comprobante || "").trim();
      if (!comp) {
        showToast("advertencia", "Este egreso no tiene comprobante.", 2200);
        return;
      }
      setCompItem({
        id: r?.id ?? r?.id_egreso ?? null,
        concepto: r?.concepto || "Comprobante",
        fecha: r?.fecha || "",
        comprobante: comp,
        url: buildFileUrl(comp),
      });
      setModalVerCompOpen(true);
    },
    [buildFileUrl, showToast]
  );

  // ✅ Eliminar: SOLO EGRESOS
  const onEliminarEgreso = useCallback((row) => {
    setEgresoAEliminar(row);
    setModalEliminarOpen(true);
  }, []);

  // ✅ Confirmar editar
  const confirmarEditar = useCallback(
    async (payload) => {
      try {
        setErrorMsg("");
        setSavingEditar(true);
        showToast("cargando", "Guardando cambios…", 1200);

        const url = `${BASE_URL}/api.php?action=reportes&op=editar_movimiento`;
        const isFD = typeof FormData !== "undefined" && payload instanceof FormData;

        const data = isFD ? await postFormData(url, payload) : await postJSON(url, payload);

        if (!data?.exito) throw new Error(data?.mensaje || "No se pudo editar.");

        setModalEditarOpen(false);
        setEditarItem(null);
        setReloadKey((k) => k + 1);

        showToast("exito", "Editado correctamente.", 3000);
      } catch (e) {
        console.error("Error editando:", e);
        const msg = String(e?.message || e);
        setErrorMsg(msg);
        showToast("error", `Error al editar: ${msg}`, 3800);
      } finally {
        setSavingEditar(false);
      }
    },
    [postJSON, postFormData, showToast]
  );

  // ✅ Confirmar eliminar egreso
  const confirmarEliminarEgreso = useCallback(
    async (eg) => {
      try {
        setErrorMsg("");
        setDeletingEgreso(true);
        showToast("cargando", "Eliminando egreso…", 1200);

        const id = eg?.id ?? eg?.id_egreso ?? eg?.id_mov ?? null;
        if (!id) throw new Error("No se encontró ID del egreso para eliminar.");

        const url = `${BASE_URL}/api.php?action=reportes&op=eliminar_egreso`;
        const data = await postJSON(url, { id });

        if (!data?.exito) throw new Error(data?.mensaje || "No se pudo eliminar el egreso.");

        setModalEliminarOpen(false);
        setEgresoAEliminar(null);
        setReloadKey((k) => k + 1);

        showToast("exito", "Egreso eliminado correctamente.", 2400);
      } catch (e) {
        console.error("Error eliminando egreso:", e);
        const msg = String(e?.message || e);
        setErrorMsg(msg);
        showToast("error", `❌ Error al eliminar: ${msg}`, 3800);
      } finally {
        setDeletingEgreso(false);
      }
    },
    [postJSON, showToast]
  );

  /* ===== AÑOS ===== */
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setErrorMsg("");
        setLoadingAnios(true);

        const data = await fetchJSON(`${BASE_URL}/api.php?action=reportes&op=anios`).catch(
          () => null
        );

        const arr = Array.isArray(data?.anios) ? data.anios : [];
        const years = ["TODOS", ...arr.map((y) => String(y))];

        if (!alive) return;
        setAniosDisponibles(years);

        if (!didInitAnios.current) {
          const now = new Date();
          const yNow = String(now.getFullYear());

          let yDefault = "TODOS";
          if (years.includes(yNow)) yDefault = yNow;
          else if (arr.length > 0) yDefault = String(arr[0]);

          setAnioSeleccionado(yDefault);
          didInitAnios.current = true;
        }
      } catch (e) {
        console.error("Error cargando años:", e);
        if (!alive) return;

        const msg = String(e?.message || e);
        setErrorMsg(msg);
        setAniosDisponibles(["TODOS"]);
        if (!didInitAnios.current) {
          setAnioSeleccionado("TODOS");
          didInitAnios.current = true;
        }
        showToast("error", `❌ No se pudieron cargar los años: ${msg}`, 4200);
      } finally {
        if (alive) setLoadingAnios(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [fetchJSON, showToast]);

  /* ===== MESES + MEDIOS ===== */
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setErrorMsg("");
        setLoadingMeses(true);

        const data = await fetchJSON(`${BASE_URL}/api.php?action=listas`).catch(() => null);

        const meses = Array.isArray(data?.listas?.meses) ? data.listas.meses : [];
        const mesesNorm = meses
          .map((m) => ({
            ...m,
            id: m.id ?? m.id_mes,
            mes: m.mes ?? m.nombre ?? m.label,
          }))
          .filter((m) => m.id != null);

        const medios = Array.isArray(data?.listas?.medios_pago)
          ? data.listas.medios_pago
          : Array.isArray(data?.listas?.medios)
          ? data.listas.medios
          : [];

        const mediosNorm = medios
          .map((m) => ({
            ...m,
            id: m.id ?? m.id_medio_pago,
            nombre: m.nombre ?? m.medio ?? m.label,
          }))
          .filter((m) => m.id != null);

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

        const msg = String(e?.message || e);
        setErrorMsg(msg);
        setMesesDisponibles([]);
        setMediosDisponibles([]);
        if (!didInitMeses.current) {
          setMesSeleccionado("TODOS");
          didInitMeses.current = true;
        }
        showToast("error", `❌ No se pudieron cargar listas (meses/medios): ${msg}`, 4200);
      } finally {
        if (alive) setLoadingMeses(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [fetchJSON, showToast]);

  /* ===== Carga DATOS ===== */
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setErrorMsg("");
        setLoadingData(true);

        const u = new URL(`${BASE_URL}/api.php`);
        u.searchParams.set("action", "reportes");

        if (anioSeleccionado !== "TODOS") {
          const y = parseInt(anioSeleccionado, 10);
          if (!Number.isNaN(y)) u.searchParams.set("anio", String(y));
        }
        if (mesSeleccionado !== "TODOS") {
          const m = parseInt(mesSeleccionado, 10);
          if (!Number.isNaN(m)) u.searchParams.set("mes", String(m));
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
          fecha: r.fecha ?? r.Fecha ?? r.fecha_mov ?? r.fechaPago ?? r.fecha_pago ?? "",
          concepto: r.concepto ?? r.Concepto ?? r.nombre_concepto ?? "",
          descripcion: r.descripcion ?? r.detalle ?? r.Descripcion ?? "",
          categoria: r.categoria ?? r.Categoria ?? r.nombre_categoria ?? "",
          medio: r.medio ?? r.Medio ?? r.medio_pago ?? r.Medio_Pago ?? "",
          monto: Number(r.monto ?? r.Monto ?? r.importe ?? r.Precio ?? 0) || 0,
          cliente_nombre: r.cliente_nombre ?? r.cliente ?? "",
          sistema_nombre: r.sistema_nombre ?? r.sistema ?? "",
          id_medio_pago: r.id_medio_pago ?? r.idMedio ?? r.id_medio ?? r.medio_id ?? null,
          comprobante: r.comprobante ?? "",
        });

        if (!alive) return;
        setPagos(pagosArr.map(norm));
        setEgresos(egresosArr.map(norm));
        setTrabajadores([]);
      } catch (e) {
        console.error("Error cargando reportes:", e);
        if (!alive) return;

        const msg = String(e?.message || e);
        setErrorMsg(msg);
        setPagos([]);
        setEgresos([]);
        setTrabajadores([]);
        showToast("error", `❌ Error cargando datos: ${msg}`, 4200);
      } finally {
        if (alive) setLoadingData(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [mesSeleccionado, anioSeleccionado, view, fetchJSON, reloadKey, showToast]);

  /* ===== Totales ===== */
  const totalPagos = useMemo(
    () =>
      (Array.isArray(pagos) ? pagos : []).reduce(
        (acc, r) => acc + (Number(r?.monto || 0) || 0),
        0
      ),
    [pagos]
  );

  const totalEgresos = useMemo(
    () =>
      (Array.isArray(egresos) ? egresos : []).reduce(
        (acc, r) => acc + (Number(r?.monto || 0) || 0),
        0
      ),
    [egresos]
  );

  const balance = useMemo(() => totalPagos - totalEgresos, [totalPagos, totalEgresos]);

  const totalTrabajadores = useMemo(
    () =>
      (Array.isArray(trabajadores) ? trabajadores : []).reduce(
        (acc, r) => acc + (Number(r?.monto || 0) || 0),
        0
      ),
    [trabajadores]
  );

  /* ===== Búsqueda ===== */
  const q = (searchText || "").trim().toLowerCase();

  const pagosFiltrados = useMemo(() => {
    if (!q) return pagos;
    return (Array.isArray(pagos) ? pagos : []).filter((r) => {
      const blob = `${r?.fecha ?? ""} ${r?.concepto ?? ""} ${r?.cliente_nombre ?? ""} ${
        r?.sistema_nombre ?? ""
      } ${r?.categoria ?? ""} ${r?.medio ?? ""} ${r?.monto ?? ""}`.toLowerCase();
      return blob.includes(q);
    });
  }, [pagos, q]);

  const egresosFiltrados = useMemo(() => {
    if (!q) return egresos;
    return (Array.isArray(egresos) ? egresos : []).filter((r) => {
      const blob = `${r?.fecha ?? ""} ${r?.concepto ?? ""} ${r?.descripcion ?? ""} ${
        r?.categoria ?? ""
      } ${r?.medio ?? ""} ${r?.monto ?? ""}`.toLowerCase();
      return blob.includes(q);
    });
  }, [egresos, q]);

  const trabajadoresFiltrados = useMemo(() => {
    if (!q) return trabajadores;
    return (Array.isArray(trabajadores) ? trabajadores : []).filter((r) => {
      const blob = `${r?.nombre ?? ""} ${r?.apellido ?? ""} ${r?.rol ?? ""} ${
        r?.alias_pago ?? ""
      } ${r?.sistemas_cobrados ?? ""} ${r?.monto ?? ""}`.toLowerCase();
      return blob.includes(q);
    });
  }, [trabajadores, q]);

  /* ===== Columnas ===== */
  const colsMov = useMemo(
    () => [
      { key: "fecha", label: "Fecha", fr: "1fr" },
      {
        key: "cliente_nombre",
        label: "Cliente",
        fr: "1fr",
        render: (r) => {
          if (r?.cliente_nombre) return r.cliente_nombre;
          const parts = String(r?.concepto || "").split(" - ");
          return parts[0] || r?.concepto || "";
        },
      },
      {
        key: "sistema_nombre",
        label: "Sistema",
        fr: "1.6fr",
        render: (r) => {
          if (r?.sistema_nombre) return r.sistema_nombre;
          const parts = String(r?.concepto || "").split(" - ");
          return parts[1] || "";
        },
      },
      { key: "categoria", label: "Mes", fr: "1.1fr", center: true },
      { key: "medio", label: "Medio", fr: "1.1fr", center: true },
      {
        key: "monto",
        label: "Monto",
        fr: "1fr",
        center: true,
        render: (r) => `$${nfPesos.format(Number(r?.monto || 0))}`,
      },
    ],
    []
  );

  const colsEgresos = useMemo(
    () => [
      { key: "fecha", label: "Fecha", fr: "1fr" },
      { key: "concepto", label: "Concepto", fr: "1fr", render: (r) => r?.concepto || "—" },
      {
        key: "descripcion",
        label: "Descripción",
        fr: "1fr",
        // ✅✅ LIMITE VISUAL + "..." + tooltip con texto completo
        render: (r) => (
          <span className="truncate" title={r?.descripcion || ""}>
            {r?.descripcion || "—"}
          </span>
        ),
      },
      { key: "categoria", label: "Mes", fr: "1.1fr", center: true },
      { key: "medio", label: "Medio", fr: "1.1fr", center: true },
      {
        key: "monto",
        label: "Monto",
        fr: "1fr",
        center: true,
        render: (r) => `$${nfPesos.format(Number(r?.monto || 0))}`,
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
        render: (r) => `${r?.apellido || ""} ${r?.nombre || ""}`.trim() || "—",
      },
      { key: "rol", label: "Rol", fr: "1fr" },
      { key: "alias_pago", label: "Alias", fr: "1.4fr", render: (r) => r?.alias_pago || "—" },
      {
        key: "sistemas_cobrados",
        label: "Sistemas",
        fr: "0.9fr",
        center: true,
        render: (r) => String(r?.sistemas_cobrados ?? 0),
      },
      {
        key: "monto",
        label: "A pagar",
        fr: "1fr",
        center: true,
        render: (r) => `$${nfPesos.format(Number(r?.monto || 0))}`,
      },
    ],
    []
  );

  /* ===== Export Excel ===== */
  const exportarExcel = useCallback(() => {
    try {
      const wb = XLSX.utils.book_new();

      const mesTxt =
        mesSeleccionado === "TODOS"
          ? "TODOS"
          : mesesDisponibles.find((m) => String(m.id) === String(mesSeleccionado))?.mes ||
            `MES_${mesSeleccionado}`;

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
        ws["!cols"] = [{ wch: 28 }, { wch: 14 }, { wch: 22 }, { wch: 10 }, { wch: 14 }];
        XLSX.utils.book_append_sheet(wb, ws, "Trabajadores");
        XLSX.writeFile(wb, `reportes_trabajadores_${anioTxt}_${mesTxt}.xlsx`);
        showToast("exito", "📄 Excel generado (Trabajadores).", 2200);
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
            COMPROBANTE: r.comprobante || "",
          })),
          { header: ["FECHA", "CONCEPTO", "DESCRIPCION", "MES", "MEDIO", "MONTO", "COMPROBANTE"] }
        );
        ws["!cols"] = [
          { wch: 12 },
          { wch: 26 },
          { wch: 34 },
          { wch: 14 },
          { wch: 16 },
          { wch: 12 },
          { wch: 28 },
        ];
        XLSX.utils.book_append_sheet(wb, ws, "Egresos");
        XLSX.writeFile(wb, `reportes_egresos_${anioTxt}_${mesTxt}.xlsx`);
        showToast("exito", "📄 Excel generado (Egresos).", 2200);
        return;
      }

      const ws = XLSX.utils.json_to_sheet(
        pagosFiltrados.map((r) => ({
          FECHA: r.fecha,
          CLIENTE: r.cliente_nombre || String(r.concepto || "").split(" - ")[0] || "",
          SISTEMA: r.sistema_nombre || String(r.concepto || "").split(" - ")[1] || "",
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
      showToast("exito", "📄 Excel generado (Pagos).", 2200);
    } catch (e) {
      const msg = String(e?.message || e);
      showToast("error", `❌ No se pudo exportar Excel: ${msg}`, 3800);
    }
  }, [
    view,
    pagosFiltrados,
    egresosFiltrados,
    trabajadoresFiltrados,
    mesSeleccionado,
    mesesDisponibles,
    anioSeleccionado,
    showToast,
  ]);

  const labelMes =
    mesSeleccionado === "TODOS"
      ? "Todos los meses"
      : mesesDisponibles.find((m) => String(m.id) === String(mesSeleccionado))?.mes || "—";

  const labelAnio = anioSeleccionado === "TODOS" ? "Todos los años" : `Año ${anioSeleccionado}`;

  // ✅✅ Guardar egreso (FormData)
  const crearEgreso = useCallback(
    async (formData) => {
      try {
        setErrorMsg("");
        setSavingEgreso(true);
        showToast("cargando", "Registrando egreso…", 1200);

        const url = `${BASE_URL}/api.php?action=reportes&op=crear_egreso`;
        const data = await postFormData(url, formData);

        if (!data?.exito) throw new Error(data?.mensaje || "No se pudo crear el egreso.");

        setModalEgresoOpen(false);
        setReloadKey((k) => k + 1);

        showToast("exito", "Egreso creado correctamente.", 3000);
      } catch (e) {
        console.error("Error creando egreso:", e);
        const msg = String(e?.message || e);
        setErrorMsg(msg);
        showToast("error", `❌ Error al crear egreso: ${msg}`, 3800);
      } finally {
        setSavingEgreso(false);
      }
    },
    [postFormData, showToast]
  );

  const disableFilters = loadingMeses || loadingAnios;

  return (
    <div className="contable-viewport">
      {/* ✅ TOAST */}
      {toast.show ? (
        <Toast
          key={toast.key}
          tipo={toast.tipo}
          mensaje={toast.mensaje}
          duracion={toast.duracion}
          onClose={closeToast}
        />
      ) : null}

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
                Año {loadingAnios ? <span style={{ opacity: 0.7 }}>(cargando…)</span> : null}
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
                disabled={disableFilters}
                title="Exportar Excel"
              >
                <FontAwesomeIcon icon={faFileExcel} /> Excel
              </button>
            </div>

            {/* Error (panel) */}
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
          {/* Toolbar */}
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
                  disabled={disableFilters}
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
                  view === "trabajadores" ? "#0ea5e9" : balance < 0 ? "#dc2626" : "#16a34a",
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
                ${nfPesos.format(view === "trabajadores" ? totalTrabajadores : Math.abs(balance))}
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

          {/* Tabla */}
<div
  style={{
    padding: "10px 12px 14px",
    flex: "1 1 auto",
    minHeight: 0,
    overflow: "hidden",
  }}
>
            {view === "pagos" && (
              <GridTable
                title="Pagos"
                icon={faMoneyBillTrendUp}
                columns={colsMov}
                rows={pagosFiltrados}
                loading={loadingData}
              />
            )}

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
                      className={`icon-btn ${r?.comprobante ? "" : "disabled"}`}
                      title={r?.comprobante ? "Ver comprobante" : "Sin comprobante"}
                      onClick={() => onVerComprobante(r)}
                      aria-label="Ver comprobante"
                      disabled={!r?.comprobante}
                    >
                      <FontAwesomeIcon icon={faEye} />
                    </button>

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

            {view === "trabajadores" && (
              <GridTable
                title="Trabajadores"
                icon={faUsers}
                columns={colsTrab}
                rows={trabajadoresFiltrados}
                loading={loadingData}
              />
            )}
          </div>
        </main>
      </div>

      {/* ✅ Modal crear egreso */}
      <ModalNuevoEgreso
        open={modalEgresoOpen}
        onClose={() => {
          if (savingEgreso) return;
          setModalEgresoOpen(false);
        }}
        onConfirm={crearEgreso} // recibe FormData
        loading={savingEgreso}
        medios={mediosDisponibles}
      />

      {/* ✅ Modal editar */}
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
        buildFileUrl={buildFileUrl}
        onVerComprobante={(path) => {
          const p = String(path || "").trim();
          if (!p) {
            showToast("advertencia", "No hay comprobante para mostrar.", 2200);
            return;
          }
          setCompItem({
            id: editarItem?.id ?? null,
            concepto: editarItem?.concepto || "Comprobante",
            fecha: editarItem?.fecha || "",
            comprobante: p,
            url: buildFileUrl(p),
          });
          setModalVerCompOpen(true);
        }}
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

      {/* ✅ Modal ver comprobante */}
      <ModalVerComprobante
        open={modalVerCompOpen}
        onClose={() => {
          setModalVerCompOpen(false);
          setCompItem(null);
        }}
        title={compItem?.concepto || "Comprobante"}
        subtitle={compItem?.fecha ? `Fecha: ${compItem.fecha}` : ""}
        url={compItem?.url || ""}
      />
    </div>
  );
}
