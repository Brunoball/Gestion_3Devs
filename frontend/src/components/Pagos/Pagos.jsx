// src/components/Pagos/Pagos.jsx
import React, {
  useState,
  useEffect,
  useMemo,
  memo,
  useRef,
  useCallback,
} from "react";
import { FixedSizeList as List } from "react-window";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faSearch,
  faMoneyCheckAlt,
  faFilter,
  faCalendarAlt,
  faUsers,
  faList,
  faCheckCircle,
  faExclamationTriangle,
  faExclamationCircle,
  faCreditCard,
  faTimes,
  faFileInvoiceDollar,
  faFileExcel,
} from "@fortawesome/free-solid-svg-icons";

import * as XLSX from "xlsx";

import BASE_URL from "../../config/config";
import Toast from "../Global/Toast";
import "./Pagos.css";

import ModalPago from "./modales/ModalPago";
import ModalEliminarPago from "./modales/ModalEliminarPago";
import ModalEquipoPago from "./modales/ModalEquipoPago";
import ModalFacturaArca from "./modales/ModalFacturaArca";

const ACTION_PAGOS = "pagos";
const API = `${BASE_URL}/api.php`;

/** LISTAS desde /api.php?action=listas */
const LISTAS_ACTION = "listas";
const LISTAS_API = `${API}?action=${LISTAS_ACTION}`;

/** Fallback directo si tu router listas no está */
const BACKEND_BASE = BASE_URL.endsWith("/routes")
  ? BASE_URL.replace(/\/routes$/, "")
  : BASE_URL;
const LISTAS_DIRECT = `${BACKEND_BASE}/modules/global/obtener_listas.php`;

/* =========================
   UI helpers
========================= */
const LoadingIndicator = memo(() => (
  <div className="gpagos-loading-container">
    <div className="gpagos-loading-spinner"></div>
    <p>Cargando datos...</p>
  </div>
));

const NoMonthSelected = memo(() => (
  <div className="gpagos-info-message">
    <FontAwesomeIcon icon={faCalendarAlt} size="3x" />
    <p>Seleccioná un mes para ver datos</p>
  </div>
));

const NoDataFound = memo(() => (
  <div className="gpagos-info-message">
    <FontAwesomeIcon icon={faExclamationCircle} size="3x" />
    <p>No se encontraron datos para los filtros seleccionados</p>
  </div>
));

const NoFiltersApplied = memo(() => (
  <div className="gpagos-info-message">
    <FontAwesomeIcon icon={faFilter} size="3x" />
    <p>Aplicá filtros para ver los datos</p>
    <small>
      Seleccioná <strong>año</strong> y <strong>mes</strong>, y opcionalmente
      medio de pago o búsqueda.
    </small>
  </div>
));

/* =========================
   Outer: gutter solo si hay scroll real
========================= */
const Outer = React.forwardRef((props, ref) => {
  const { className, ...rest } = props;
  const localRef = useRef(null);

  const setRef = (node) => {
    localRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  };

  useEffect(() => {
    const el = localRef.current;
    if (!el) return;

    const update = () => {
      const hasScroll = el.scrollHeight > el.clientHeight + 1;
      if (hasScroll) el.classList.add("gpagos-viewport-hasscroll");
      else el.classList.remove("gpagos-viewport-hasscroll");
    };

    update();

    let resizeObs;
    try {
      resizeObs = new ResizeObserver(update);
      resizeObs.observe(el);
    } catch {
      window.addEventListener("resize", update);
    }

    return () => {
      if (resizeObs) resizeObs.disconnect();
      else window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <div
      ref={setRef}
      className={`gpagos-viewport ${className || ""}`}
      {...rest}
    />
  );
});

/* =========================
   Helpers
========================= */
function normalizeText(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function buildClienteLabel(item) {
  const a = (item?.apellido || item?.Apellido || item?.APELLIDO || "")
    .toString()
    .trim();
  const n = (item?.nombre || item?.Nombre || item?.NOMBRE || "")
    .toString()
    .trim();

  const rs = (item?.razon_social ||
    item?.RazonSocial ||
    item?.RAZON_SOCIAL ||
    "")
    .toString()
    .trim();

  const cli = (
    item?.cliente ||
    item?.cliente_nombre ||
    item?.nombre_cliente ||
    item?.titular ||
    ""
  )
    .toString()
    .trim();

  if (a || n) return `${a} ${n}`.trim();
  if (rs) return rs;
  if (cli) return cli;
  return "—";
}

function buildSistemaLabel(item) {
  const s =
    (item?.sistema ?? "").toString().trim() ||
    (item?.concepto ?? "").toString().trim() ||
    (item?.detalle ?? "").toString().trim() ||
    (item?.descripcion ?? "").toString().trim();
  return s || "—";
}

function getIdSistema(item) {
  const v =
    item?.id_sistema ??
    item?.idSistema ??
    item?.IdSistema ??
    item?.ID_SISTEMA ??
    item?.sistema_id ??
    item?.id ??
    null;

  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function getIdPago(item) {
  const v =
    item?.id_pago ??
    item?.idPago ??
    item?.IdPago ??
    item?.ID_PAGO ??
    null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** ✅ busyKey consistente en TODO (desktop/mobile) */
function arcaBusyKeyFromRow(row) {
  const idPago = getIdPago(row);
  const idSistema = getIdSistema(row);
  if (idPago) return idPago;
  if (idSistema) return -Number(idSistema);
  return null;
}

/** Helper para obtener nombre del mes desde ID */
function getMesLabelById(mesesArr, id) {
  const n = Number(id);
  if (!Number.isFinite(n) || n <= 0) return "";
  const found = (Array.isArray(mesesArr) ? mesesArr : []).find(
    (m) => Number(m?.id) === n
  );
  return (found?.mes || "").toString().trim();
}

/* =========================
   Row virtualizado
   ✅ ahora muestra ARCA también en DEUDORES
   ✅ FIX: loading ARCA correcto también en deudores (sin id_pago)
========================= */
const Row = memo(
  ({
    index,
    style,
    data,
    activeTab,
    onPayClick,
    onDeleteClick,
    onTeamClick,
    onArcaClick,
    arcaLoadingId,
  }) => {
    const item = data[index];

    if (!item) {
      return (
        <div style={style} className="gpagos-virtual-row gpagos-loading-row">
          <div className="gpagos-virtual-cell">Cargando...</div>
          <div className="gpagos-virtual-cell"></div>
          <div className="gpagos-virtual-cell"></div>
        </div>
      );
    }

    const isPagado = activeTab === "pagado";
    const busyKey = arcaBusyKeyFromRow(item);
    const arcaBusy = Boolean(busyKey && arcaLoadingId === busyKey);

    return (
      <div style={style} className="gpagos-virtual-row">
        <div className="gpagos-virtual-cell">{buildClienteLabel(item)}</div>
        <div className="gpagos-virtual-cell">{buildSistemaLabel(item)}</div>

        <div className="gpagos-virtual-cell gpagos-virtual-actions">
          <div className="gpagos-actions-inline">
            {/* Registrar pago (solo en deudores) */}
            {!isPagado && (
              <button
                className="gpagos-action-button gpagos-pay-button"
                onClick={(e) => {
                  e.stopPropagation();
                  onPayClick?.(item);
                }}
                title="Registrar pago"
                type="button"
              >
                <FontAwesomeIcon icon={faMoneyCheckAlt} />
              </button>
            )}

            {/* Equipo (solo en pagados) */}
            {isPagado && (
              <button
                className="gpagos-action-button gpagos-team-button"
                onClick={(e) => {
                  e.stopPropagation();
                  onTeamClick?.(item);
                }}
                title="Equipo / monto a pagar"
                type="button"
              >
                <FontAwesomeIcon icon={faUsers} />
              </button>
            )}

            {/* ✅ ARCA: aparece en pagados Y deudores */}
            <button
              className="gpagos-action-button gpagos-arca-button"
              onClick={(e) => {
                e.stopPropagation();
                onArcaClick?.(item);
              }}
              title={arcaBusy ? "Cargando datos..." : "Factura ARCA"}
              type="button"
              disabled={arcaBusy}
            >
              <FontAwesomeIcon icon={faFileInvoiceDollar} />
            </button>

            {/* Eliminar (solo pagados) */}
            {isPagado && (
              <button
                className="gpagos-action-button gpagos-delete-button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteClick?.(item);
                }}
                title="Eliminar pago"
                type="button"
              >
                <FontAwesomeIcon icon={faTimes} />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  },
  (prev, next) =>
    prev.index === next.index &&
    prev.data === next.data &&
    prev.activeTab === next.activeTab &&
    prev.arcaLoadingId === next.arcaLoadingId
);

function Pagos() {
  const navigate = useNavigate();

  // ✅ por defecto “pagado”, pero auto-cambiamos a deudores si hace falta
  const [activeTab, setActiveTab] = useState("pagado");

  // ===== Filtros =====
  const [years, setYears] = useState([]);
  const [selectedYear, setSelectedYear] = useState("");

  const [meses, setMeses] = useState([]); // [{id, mes}]
  const [selectedMonthId, setSelectedMonthId] = useState(""); // guarda id_mes (string/number)

  const [mediosPago, setMediosPago] = useState([]);
  const [selectedMedioPago, setSelectedMedioPago] = useState("");

  const [searchTerm, setSearchTerm] = useState("");

  // ===== Datos =====
  const [pagosPagados, setPagosPagados] = useState([]);
  const [pagosDeudores, setPagosDeudores] = useState([]);

  // ===== UI =====
  const [loading, setLoading] = useState({ pagos: false, listas: false });
  const [arcaLoadingId, setArcaLoadingId] = useState(null); // ✅ loading puntual de ARCA

  // ===== Toasts =====
  const [toast, setToast] = useState({
    show: false,
    tipo: "exito",
    mensaje: "",
    duracion: 2600,
    key: 0,
  });

  const showToast = useCallback((tipo, mensaje, duracion = 2600) => {
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

  // ===== fetch JSON robusto =====
  const fetchJSON = useCallback(async (url, opts) => {
    const res = await fetch(url, opts);
    const text = await res.text();

    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const parsed = JSON.parse(text);
        msg = parsed?.mensaje || parsed?.error || msg;
      } catch {}
      throw new Error(msg);
    }

    const trimmed = (text || "").trim();
    if (trimmed.startsWith("<")) {
      throw new Error("Backend devolvió HTML (error PHP).");
    }

    try {
      const data = JSON.parse(trimmed || "{}");
      if (data && typeof data === "object" && data?.exito === false) {
        throw new Error(data?.mensaje || "Error en el servidor");
      }
      return data;
    } catch {
      throw new Error("JSON inválido.");
    }
  }, []);

  // ✅ MODAL PAGO
  const [modalPago, setModalPago] = useState(null);
  const openModalPago = useCallback((row) => {
    const id_sistema = getIdSistema(row);
    if (!id_sistema) return;
    setModalPago({
      open: true,
      id_sistema,
      labelCliente: buildClienteLabel(row),
      labelSistema: buildSistemaLabel(row),
    });
  }, []);
  const closeModalPago = useCallback(() => setModalPago(null), []);

  // ✅ MODAL ELIMINAR
  const [modalEliminar, setModalEliminar] = useState(null);
  const closeModalEliminar = useCallback(() => setModalEliminar(null), []);

  // ✅ MODAL EQUIPO
  const [modalEquipo, setModalEquipo] = useState(null);
  const closeModalEquipo = useCallback(() => setModalEquipo(null), []);
  const openModalEquipo = useCallback(
    (row) => {
      const id_sistema = getIdSistema(row);
      if (!id_sistema) return;

      const mesLabel = getMesLabelById(meses, selectedMonthId);

      setModalEquipo({
        open: true,
        id_sistema,
        anio: selectedYear || "",
        mes: mesLabel || "", // label para mostrar / backend
        id_mes: Number(selectedMonthId) || 0, // ✅ id_mes real
        labelCliente: buildClienteLabel(row),
        labelSistema: buildSistemaLabel(row),
        monto: row?.monto ?? null,
        fecha_pago: row?.fecha_pago ?? null,
        id_pago: getIdPago(row),
      });
    },
    [selectedYear, selectedMonthId, meses]
  );

  // ✅ MODAL ARCA
  const [modalArca, setModalArca] = useState(null);
  const closeModalArca = useCallback(() => setModalArca(null), []);

  /**
   * ✅ Trae info de facturación.
   * - Si tengo id_pago, pruebo cliente_facturacion.
   * - Si no hay id_pago (deudores), pruebo cliente_facturacion_sistema.
   */
  const fetchClienteFacturacion = useCallback(
    async ({ id_pago, id_sistema, anio, mes }) => {
      const mesLabel = getMesLabelById(meses, mes);

      // 1) por id_pago (ruta principal)
      if (id_pago) {
        const url = `${API}?action=${ACTION_PAGOS}&op=cliente_facturacion`;
        const resp = await fetchJSON(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            id_pago: Number(id_pago),
            anio: Number(anio),
            mes: String(mesLabel), // ✅ label
          }),
        });
        return resp?.cliente_facturacion ?? null;
      }

      // 2) por id_sistema (deudores)
      if (id_sistema) {
        const url = `${API}?action=${ACTION_PAGOS}&op=cliente_facturacion_sistema`;
        const resp = await fetchJSON(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            id_sistema: Number(id_sistema),
            anio: Number(anio),
            mes: String(mesLabel), // ✅ label
          }),
        });
        return resp?.cliente_facturacion ?? null;
      }

      return null;
    },
    [fetchJSON, meses]
  );

  const openModalArca = useCallback(
    async (row) => {
      const id_sistema = getIdSistema(row);
      const id_pago = getIdPago(row); // ✅ en deudores puede venir null
      if (!id_sistema) return;

      if (!selectedYear || !selectedMonthId) {
        showToast("error", "Seleccioná año y mes antes de facturar.", 2600);
        return;
      }

      const mesLabel = getMesLabelById(meses, selectedMonthId);
      const id_mes = Number(selectedMonthId) || 0;

      // ✅ loading puntual: id_pago si existe, si no -id_sistema
      const busyKey = arcaBusyKeyFromRow(row);
      if (busyKey != null) setArcaLoadingId(busyKey);

      let cliente_facturacion = null;
      try {
        cliente_facturacion = await fetchClienteFacturacion({
          id_pago: id_pago || null,
          id_sistema,
          anio: selectedYear,
          mes: selectedMonthId, // 👈 se interpreta como id, y adentro lo transformamos a label
        });

        if (!cliente_facturacion) {
          showToast(
            "warning",
            "No se encontró info de facturación en la DB para este registro. Se abrirá igual.",
            3200
          );
        }
      } catch (e) {
        console.error(e);
        showToast(
          "error",
          `No pude traer datos de facturación (${e.message || "error"}). Se abrirá igual.`,
          3400
        );
      } finally {
        setArcaLoadingId(null);
      }

      setModalArca({
        open: true,
        id_sistema,
        id_pago: id_pago || null,

        // ✅ lo que necesita ARCA/Resumen
        anio: Number(selectedYear),
        id_mes, // ✅ AHORA SÍ LLEGA (1..12)
        mes: mesLabel, // (opcional) label para UI o backend

        labelCliente: buildClienteLabel(row),
        labelSistema: buildSistemaLabel(row),
        monto: row?.monto ?? null,
        fecha_pago: row?.fecha_pago ?? null,
        medio_pago: row?.medio_pago ?? null,
        cliente_facturacion,
        origen_estado: activeTab,
      });
    },
    [
      selectedYear,
      selectedMonthId,
      meses,
      showToast,
      fetchClienteFacturacion,
      activeTab,
    ]
  );

  // ===== Virtual / infinite =====
  const [limit, setLimit] = useState(120);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const listRef = useRef(null);

  // ===== Cache =====
  const cacheRef = useRef({
    pagos: { pagado: {}, deudor: {}, lastUpdated: {} },
    listas: null,
    cacheDuration: 30 * 60 * 1000,
  });

  const cacheKey = useCallback((anio, mes) => `${anio || ""}|${mes || ""}`, []);

  const filtrosCompletos = useMemo(
    () => Boolean(selectedYear && selectedMonthId),
    [selectedYear, selectedMonthId]
  );

  /* =========================================================
     ✅ LISTAS (con AÑO ACTUAL SIEMPRE)
  ========================================================= */
  const fetchListas = useCallback(
    async (force = false) => {
      if (!force && cacheRef.current.listas) return cacheRef.current.listas;

      setLoading((p) => ({ ...p, listas: true }));
      try {
        let data;
        try {
          data = await fetchJSON(LISTAS_API, { method: "GET" });
        } catch {
          data = await fetchJSON(LISTAS_DIRECT, { method: "GET" });
        }

        const listas = data?.listas || data || {};
        cacheRef.current.listas = listas;
        return listas;
      } finally {
        setLoading((p) => ({ ...p, listas: false }));
      }
    },
    [fetchJSON]
  );

  useEffect(() => {
    const run = async () => {
      try {
        const listas = await fetchListas(false);

        // meses
        const rawMeses = Array.isArray(listas?.meses) ? listas.meses : [];
        const mesesNorm = rawMeses
          .map((m) => ({
            id: m?.id ?? m?.id_mes ?? null,
            mes: (m?.mes ?? m?.nombre ?? "").toString().trim(),
          }))
          .filter((m) => m.id != null && m.mes)
          .sort((a, b) => Number(a.id) - Number(b.id));

        setMeses(mesesNorm);

        // medios pago
        const rawMP = Array.isArray(listas?.medios_pago)
          ? listas.medios_pago
          : [];
        const mpNorm = rawMP
          .map((item) => ({
            id:
              item?.id ??
              item?.id_medio_pago ??
              item?.IdMedios_Pago ??
              item?.idMedios_Pago ??
              null,
            nombre: (item?.nombre ?? item?.Medio_Pago ?? item?.medio_pago ?? "")
              .toString()
              .trim(),
          }))
          .filter((m) => m.nombre)
          .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
        setMediosPago(mpNorm);

        // años
        const current = new Date().getFullYear();

        const rawAnios = Array.isArray(listas?.anios) ? listas.anios : [];
        const aniosNorm = rawAnios
          .map((a) => (typeof a === "object" ? a.anio ?? a.year ?? a.value : a))
          .filter((v) => v != null)
          .map((n) => parseInt(n, 10))
          .filter((n) => Number.isFinite(n))
          .sort((a, b) => b - a);

        const finalYears = [current, ...aniosNorm.filter((y) => y !== current)];

        setYears(finalYears);
        setSelectedYear(String(current));
      } catch (e) {
        console.error(e);
        const current = new Date().getFullYear();
        setYears([current]);
        setSelectedYear(String(current));
      }
    };

    run();
  }, [fetchListas]);

  // ===== Carga pagos por mes/año =====
  const cargarPagosPorMes = useCallback(
    async (anio, mesId, force = false) => {
      if (!anio || !mesId) return;
      if (loading.pagos) return;

      const mesLabel = getMesLabelById(meses, mesId);
      if (!mesLabel) return;

      const key = cacheKey(anio, mesId);
      const now = Date.now();
      const cache = cacheRef.current.pagos;

      const isValid =
        !force &&
        cache.lastUpdated[key] &&
        now - cache.lastUpdated[key] < cacheRef.current.cacheDuration;

      if (isValid && cache.pagado[key] && cache.deudor[key]) {
        setPagosPagados(cache.pagado[key]);
        setPagosDeudores(cache.deudor[key]);
        return;
      }

      setLoading((p) => ({ ...p, pagos: true }));
      try {
        const qp = `&anio=${encodeURIComponent(anio)}&mes=${encodeURIComponent(
          mesLabel
        )}`;

        const [pagados, deudores] = await Promise.all([
          fetchJSON(`${API}?action=${ACTION_PAGOS}&estado=pagado${qp}`, {
            method: "GET",
          }),
          fetchJSON(`${API}?action=${ACTION_PAGOS}&estado=deudor${qp}`, {
            method: "GET",
          }),
        ]);

        const arrP = Array.isArray(pagados) ? pagados : pagados?.pagos || [];
        const arrD = Array.isArray(deudores) ? deudores : deudores?.pagos || [];

        cacheRef.current.pagos.pagado[key] = arrP;
        cacheRef.current.pagos.deudor[key] = arrD;
        cacheRef.current.pagos.lastUpdated[key] = Date.now();

        setPagosPagados(arrP);
        setPagosDeudores(arrD);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading((p) => ({ ...p, pagos: false }));
      }
    },
    [cacheKey, fetchJSON, loading.pagos, meses]
  );

  useEffect(() => {
    if (!filtrosCompletos) {
      setPagosPagados([]);
      setPagosDeudores([]);
      return;
    }

    const deb = setTimeout(() => {
      cargarPagosPorMes(selectedYear, selectedMonthId);
    }, searchTerm ? 250 : 0);

    return () => clearTimeout(deb);
  }, [
    filtrosCompletos,
    selectedYear,
    selectedMonthId,
    searchTerm,
    cargarPagosPorMes,
  ]);

  // ===== Filtrado =====
  const filterData = useCallback(
    (arr) => {
      const base = Array.isArray(arr) ? arr : [];
      let filtered = [...base];

      if (selectedMedioPago) {
        const mp = normalizeText(selectedMedioPago);
        filtered = filtered.filter((x) => normalizeText(x?.medio_pago) === mp);
      }

      if (searchTerm) {
        const t = normalizeText(searchTerm);
        filtered = filtered.filter((x) => {
          const label = normalizeText(buildClienteLabel(x));
          const sistema = normalizeText(buildSistemaLabel(x));
          return label.includes(t) || sistema.includes(t);
        });
      }

      return filtered;
    },
    [selectedMedioPago, searchTerm]
  );

  // ✅ si NO hay pagados pero SÍ hay deudores, auto "deudores"
  useEffect(() => {
    if (!filtrosCompletos) return;
    if (loading.pagos) return;

    const pagadosCount = filterData(pagosPagados).length;
    const deudoresCount = filterData(pagosDeudores).length;

    if (activeTab === "pagado" && pagadosCount === 0 && deudoresCount > 0) {
      setActiveTab("deudores");
    }
  }, [
    filtrosCompletos,
    loading.pagos,
    activeTab,
    pagosPagados,
    pagosDeudores,
    filterData,
  ]);

  const datosCrudosBase = useMemo(
    () => (activeTab === "pagado" ? pagosPagados : pagosDeudores),
    [activeTab, pagosPagados, pagosDeudores]
  );

  const datosFiltrados = useMemo(() => {
    if (!filtrosCompletos) return [];
    if (!datosCrudosBase?.length) return [];
    return filterData(datosCrudosBase);
  }, [filtrosCompletos, datosCrudosBase, filterData]);

  const countPagados = useMemo(() => {
    if (!filtrosCompletos) return 0;
    return filterData(pagosPagados).length;
  }, [filtrosCompletos, pagosPagados, filterData]);

  const countDeudores = useMemo(() => {
    if (!filtrosCompletos) return 0;
    return filterData(pagosDeudores).length;
  }, [filtrosCompletos, pagosDeudores, filterData]);

  // ===== infinite =====
  const datosFiltradosPaginated = useMemo(
    () => datosFiltrados.slice(0, offset + limit),
    [datosFiltrados, offset, limit]
  );

  const loadMoreItems = useCallback(() => {
    if (!hasMore || loading.pagos) return;
    const next = offset + limit;
    if (next < datosFiltrados.length) setOffset(next);
    else setHasMore(false);
  }, [hasMore, loading.pagos, offset, limit, datosFiltrados.length]);

  useEffect(() => {
    setOffset(0);
    setLimit(120);
    setHasMore(true);
    if (listRef.current) listRef.current.scrollTo(0);
  }, [selectedYear, selectedMonthId, selectedMedioPago, searchTerm, activeTab]);

  // ===== handlers =====
  const handleVolver = useCallback(() => navigate(-1), [navigate]);

  const handleSearchChange = useCallback((e) => {
    setSearchTerm(e.target.value);
  }, []);

  const onPayClick = useCallback((row) => openModalPago(row), [openModalPago]);
  const onTeamClick = useCallback(
    (row) => openModalEquipo(row),
    [openModalEquipo]
  );
  const onArcaClick = useCallback((row) => openModalArca(row), [openModalArca]);

  const onDeleteClick = useCallback((row) => {
    const id_pago = getIdPago(row);
    if (!id_pago) return;
    setModalEliminar({
      open: true,
      id_pago,
      labelCliente: buildClienteLabel(row),
      labelSistema: buildSistemaLabel(row),
      fecha: row?.fecha_pago ?? null,
      monto: row?.monto ?? null,
    });
  }, []);

  // mobile
  const isClient = typeof window !== "undefined";
  const isMobileRef = useRef(isClient ? window.innerWidth <= 768 : false);
  const [, setIsMobile] = useState(isMobileRef.current);

  useEffect(() => {
    if (!isClient) return;
    const handleResize = () => {
      const mobile = window.innerWidth <= 768;
      isMobileRef.current = mobile;
      setIsMobile(mobile);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isClient]);

  const listKey = useMemo(
    () =>
      `pagos-${activeTab}-${selectedYear}-${selectedMonthId}-${selectedMedioPago}-${searchTerm}`,
    [activeTab, selectedYear, selectedMonthId, selectedMedioPago, searchTerm]
  );

  // ✅ refrescar
  const recargarListado = useCallback(() => {
    if (!selectedYear || !selectedMonthId) return;
    const k = cacheKey(selectedYear, selectedMonthId);
    delete cacheRef.current.pagos.pagado[k];
    delete cacheRef.current.pagos.deudor[k];
    delete cacheRef.current.pagos.lastUpdated[k];
    cargarPagosPorMes(selectedYear, selectedMonthId, true);
  }, [selectedYear, selectedMonthId, cacheKey, cargarPagosPorMes]);

  // ✅ EXPORTAR EXCEL
  const exportarExcel = useCallback(() => {
    if (!filtrosCompletos) return;
    const data = Array.isArray(datosFiltrados) ? datosFiltrados : [];
    if (!data.length) return;

    const mesLabel = getMesLabelById(meses, selectedMonthId) || "mes";
    const safeMes = String(mesLabel)
      .toLowerCase()
      .replace(/\s+/g, "_")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    const rows = data.map((x) => ({
      Cliente: buildClienteLabel(x),
      Sistema: buildSistemaLabel(x),
      "Medio de Pago": x?.medio_pago ?? "",
      Monto: x?.monto ?? "",
      "Fecha de pago": x?.fecha_pago ?? "",
      "ID Pago": getIdPago(x) ?? "",
      "ID Sistema": getIdSistema(x) ?? "",
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      ws,
      activeTab === "pagado" ? "Pagos" : "Deudores"
    );

    const fileName = `pagos_${activeTab}_${selectedYear}_${safeMes}.xlsx`;
    XLSX.writeFile(wb, fileName);
  }, [
    filtrosCompletos,
    datosFiltrados,
    activeTab,
    selectedYear,
    selectedMonthId,
    meses,
  ]);

  // ✅ confirmar eliminación
  const confirmarEliminarPago = useCallback(async () => {
    if (!modalEliminar?.id_pago) return;

    try {
      setLoading((p) => ({ ...p, pagos: true }));

      await fetchJSON(`${API}?action=${ACTION_PAGOS}&op=eliminar_pago`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ id_pago: modalEliminar.id_pago }),
      });

      showToast("exito", "Pago eliminado correctamente.", 2600);
      closeModalEliminar();
      recargarListado();
    } catch (e) {
      console.error(e);
      showToast("error", e.message || "Error al eliminar pago.", 3200);
    } finally {
      setLoading((p) => ({ ...p, pagos: false }));
    }
  }, [
    modalEliminar,
    fetchJSON,
    showToast,
    closeModalEliminar,
    recargarListado,
  ]);

  // ===== render tabla =====
  const renderTabla = useMemo(() => {
    if (!selectedYear) return <NoFiltersApplied />;
    if (!selectedMonthId) return <NoMonthSelected />;
    if (loading.pagos) return <LoadingIndicator />;
    if (datosFiltrados.length === 0) return <NoDataFound />;

    // MOBILE
    if (isMobileRef.current) {
      return (
        <div className="gpagos-mobile-list">
          {datosFiltradosPaginated.map((row, index) => {
            const isPagado = activeTab === "pagado";
            const idPago = getIdPago(row);
            const idSistema = getIdSistema(row);
            const key = String(idPago || idSistema || index);

            const busyKey = arcaBusyKeyFromRow(row);
            const arcaBusy = Boolean(busyKey && arcaLoadingId === busyKey);

            return (
              <div key={key} className="gpagos-mobile-card">
                <div className="gpagos-mobile-row">
                  <span className="gpagos-mobile-label">Cliente:</span>
                  <span>{buildClienteLabel(row)}</span>
                </div>

                <div className="gpagos-mobile-row">
                  <span className="gpagos-mobile-label">Sistema:</span>
                  <span>{buildSistemaLabel(row)}</span>
                </div>

                <div className="gpagos-mobile-actions">
                  {!isPagado && (
                    <button
                      className="gpagos-mobile-pay-button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onPayClick(row);
                      }}
                      type="button"
                      title="Registrar pago"
                    >
                      <FontAwesomeIcon icon={faMoneyCheckAlt} />
                      <span>Pagar</span>
                    </button>
                  )}

                  {isPagado && (
                    <button
                      className="gpagos-mobile-team-button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onTeamClick(row);
                      }}
                      type="button"
                      title="Equipo / monto a pagar"
                    >
                      <FontAwesomeIcon icon={faUsers} />
                      <span>Equipo</span>
                    </button>
                  )}

                  <button
                    className="gpagos-mobile-arca-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onArcaClick(row);
                    }}
                    type="button"
                    title={arcaBusy ? "Cargando datos..." : "Factura ARCA"}
                    disabled={arcaBusy}
                  >
                    <FontAwesomeIcon icon={faFileInvoiceDollar} />
                    <span>ARCA</span>
                  </button>

                  {isPagado && (
                    <button
                      className="gpagos-mobile-delete-button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteClick(row);
                      }}
                      type="button"
                      title="Eliminar pago"
                    >
                      <FontAwesomeIcon icon={faTimes} />
                      <span>Eliminar</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    // DESKTOP
    const headerHeight = 50;
    const tableHeight = Math.max(
      (isClient ? window.innerHeight : 800) * 0.85 - headerHeight,
      320
    );

    return (
      <div className="gpagos-virtual-tables" style={{ height: "85vh" }}>
        <div className="gpagos-virtual-header">
          <div className="gpagos-virtual-cell">Cliente</div>
          <div className="gpagos-virtual-cell">Sistema</div>
          <div className="gpagos-virtual-cell">Acciones</div>
        </div>

        <List
          ref={listRef}
          key={listKey}
          height={tableHeight}
          itemCount={datosFiltradosPaginated.length + (hasMore ? 1 : 0)}
          itemSize={50}
          itemData={datosFiltradosPaginated}
          width={"100%"}
          outerElementType={Outer}
          onItemsRendered={({ visibleStopIndex }) => {
            if (
              visibleStopIndex >= datosFiltradosPaginated.length - 5 &&
              hasMore
            ) {
              loadMoreItems();
            }
          }}
        >
          {(props) => {
            if (props.index >= datosFiltradosPaginated.length) {
              return (
                <div style={props.style} className="gpagos-loading-row"></div>
              );
            }
            return (
              <Row
                {...props}
                activeTab={activeTab}
                onPayClick={onPayClick}
                onDeleteClick={onDeleteClick}
                onTeamClick={onTeamClick}
                onArcaClick={onArcaClick}
                arcaLoadingId={arcaLoadingId}
              />
            );
          }}
        </List>
      </div>
    );
  }, [
    selectedYear,
    selectedMonthId,
    loading.pagos,
    datosFiltrados,
    datosFiltradosPaginated,
    activeTab,
    onPayClick,
    onDeleteClick,
    onTeamClick,
    onArcaClick,
    hasMore,
    loadMoreItems,
    listKey,
    isClient,
    arcaLoadingId,
  ]);

  return (
    <div className="gpagos-container">
      {toast.show ? (
        <Toast
          key={toast.key}
          tipo={toast.tipo}
          mensaje={toast.mensaje}
          duracion={toast.duracion}
          onClose={closeToast}
        />
      ) : null}

      {modalPago?.open && (
        <ModalPago
          id_sistema={modalPago.id_sistema}
          cerrarModal={closeModalPago}
          onPagoRealizado={() => {
            closeModalPago();
            recargarListado();
            showToast("exito", "Pago realizado con éxito.", 2600);
          }}
        />
      )}

      {modalEquipo?.open && (
        <ModalEquipoPago
          open={modalEquipo.open}
          onClose={closeModalEquipo}
          apiBase={API}
          action={ACTION_PAGOS}
          data={modalEquipo}
        />
      )}

      {modalArca?.open && (
        <ModalFacturaArca
          open={modalArca.open}
          onClose={closeModalArca}
          apiBase={API}
          action={ACTION_PAGOS}
          data={modalArca}
          onDone={() => {
            closeModalArca();
            recargarListado();
          }}
          onFacturada={() => {
            closeModalArca();
            recargarListado();
          }}
        />
      )}

      {modalEliminar?.open && (
        <ModalEliminarPago
          open={modalEliminar.open}
          onClose={closeModalEliminar}
          onConfirm={confirmarEliminarPago}
          loading={loading.pagos}
          data={modalEliminar}
        />
      )}

      {/* LEFT */}
      <div className="gpagos-left-section gpagos-box">
        <div className="gpagos-header-section">
          <h2 className="gpagos-title">
            <FontAwesomeIcon
              icon={faMoneyCheckAlt}
              className="gpagos-title-icon"
            />
            Pagos
          </h2>
          <div className="gpagos-divider"></div>
        </div>

        <div className="gpagos-scrollable-content">
          {/* FILTROS */}
          <div className="gpagos-filter-card">
            <div className="gpagos-filter-header">
              <FontAwesomeIcon icon={faFilter} className="gpagos-filter-icon" />
              <span>Filtros</span>
            </div>

            <div className="gpagos-select-container">
              {/* Año */}
              <div className="gpagos-input-group">
                <label htmlFor="anio" className="gpagos-input-label">
                  <FontAwesomeIcon icon={faCalendarAlt} /> Año
                </label>
                <select
                  id="anio"
                  value={selectedYear}
                  onChange={(e) => {
                    setSelectedYear(e.target.value);
                    setSelectedMedioPago("");
                    setSearchTerm("");
                  }}
                  className="gpagos-dropdown"
                  disabled={loading.listas || loading.pagos}
                >
                  <option value="" disabled>
                    Año
                  </option>
                  {years.map((y, i) => (
                    <option key={i} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>

              {/* Mes */}
              <div className="gpagos-input-group">
                <label htmlFor="meses" className="gpagos-input-label">
                  <FontAwesomeIcon icon={faCalendarAlt} /> Mes
                </label>

                <select
                  id="meses"
                  value={selectedMonthId}
                  onChange={(e) => {
                    setSelectedMonthId(e.target.value);
                    setSearchTerm("");
                  }}
                  className="gpagos-dropdown"
                  disabled={loading.listas}
                >
                  <option value="" disabled>
                    Mes
                  </option>
                  {meses.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.mes}
                    </option>
                  ))}
                </select>
              </div>

              {/* Medio pago */}
              <div className="gpagos-input-group gpagos-input-full">
                <label htmlFor="medioPago" className="gpagos-input-label">
                  <FontAwesomeIcon icon={faCreditCard} /> Medio de Pago
                </label>
                <select
                  id="medioPago"
                  value={selectedMedioPago}
                  onChange={(e) => setSelectedMedioPago(e.target.value)}
                  className="gpagos-dropdown"
                  disabled={!selectedYear || !selectedMonthId || loading.pagos}
                >
                  <option value="">Todos</option>
                  {mediosPago.map((m, idx) => (
                    <option key={idx} value={m.nombre}>
                      {m.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* TABS */}
          <div className="gpagos-tabs-card">
            <div className="gpagos-tabs-header">
              <FontAwesomeIcon icon={faList} className="gpagos-tabs-icon" />
              <span>Estado</span>
            </div>

            <div className="gpagos-tab-container">
              <button
                className={`gpagos-tab-button ${
                  activeTab === "pagado" ? "gpagos-active-tab" : ""
                }`}
                onClick={() => setActiveTab("pagado")}
                disabled={loading.pagos}
                type="button"
              >
                <FontAwesomeIcon icon={faCheckCircle} />
                Pagado
                <span className="gpagos-tab-badge">{countPagados}</span>
              </button>

              <button
                className={`gpagos-tab-button ${
                  activeTab === "deudores" ? "gpagos-active-tab" : ""
                }`}
                onClick={() => setActiveTab("deudores")}
                disabled={loading.pagos}
                type="button"
              >
                <FontAwesomeIcon icon={faExclamationTriangle} />
                Deudores
                <span className="gpagos-tab-badge">{countDeudores}</span>
              </button>
            </div>
          </div>

          {/* ACCIONES */}
          <div className="gpagos-actions-card">
            <div className="gpagos-actions-header">
              <span>Acciones</span>
            </div>

            <div className="gpagos-buttons-container">
              <button
                className="gpagos-button gpagos-button-back"
                onClick={handleVolver}
                disabled={loading.pagos}
                type="button"
              >
                <FontAwesomeIcon icon={faArrowLeft} />
                <span>Volver</span>
              </button>

              <button
                className="gpagos-button gpagos-button-excel"
                onClick={exportarExcel}
                disabled={loading.pagos || loading.listas || !filtrosCompletos}
                type="button"
                title="Exportar a Excel"
              >
                <FontAwesomeIcon icon={faFileExcel} />
                <span>Excel</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT */}
      <div className="gpagos-right-section gpagos-box">
        <div className="gpagos-table-header">
          <h3>
            <FontAwesomeIcon
              icon={
                activeTab === "pagado" ? faCheckCircle : faExclamationTriangle
              }
            />
            {activeTab === "pagado" ? "Pagos Registrados" : "Pagos Pendientes"}
          </h3>

          <div className="gpagos-input-group gpagos-search-group">
            <div className="gpagos-search-integrated">
              <FontAwesomeIcon icon={faSearch} className="gpagos-search-icon" />
              <input
                type="text"
                placeholder="Buscar cliente o sistema..."
                value={searchTerm}
                onChange={handleSearchChange}
                disabled={loading.pagos || !selectedYear || !selectedMonthId}
              />
            </div>
          </div>

          <div className="gpagos-summary-info">
            <span className="gpagos-summary-item">
              <FontAwesomeIcon icon={faUsers} />
              Total: {filtrosCompletos ? datosFiltrados.length : 0}
            </span>
          </div>
        </div>

        <div className="gpagos-table-container">{renderTabla}</div>
      </div>
    </div>
  );
}

export default memo(Pagos);