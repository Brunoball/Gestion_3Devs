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
  faMoneyCheckAlt, // ✅ $ botón registrar/pagar
  faFilter,
  faCalendarAlt,
  faUsers, // ✅ equipo
  faList,
  faCheckCircle,
  faExclamationTriangle,
  faExclamationCircle,
  faCreditCard,
  faTimes, // ✅ eliminar
  faFileInvoiceDollar, // ✅ ARCA
} from "@fortawesome/free-solid-svg-icons";

import BASE_URL from "../../config/config";
import Toast from "../Global/Toast";
import "./Pagos.css";

// ✅ Modal de pago
import ModalPago from "./modales/ModalPago";
// ✅ Modal eliminar pago
import ModalEliminarPago from "./modales/ModalEliminarPago";
// ✅ NUEVO MODAL: equipo + monto a pagar
import ModalEquipoPago from "./modales/ModalEquipoPago";
// ✅ NUEVO MODAL: Factura ARCA
import ModalFacturaArca from "./modales/ModalFacturaArca";

const ACTION_PAGOS = "pagos";
const API = `${BASE_URL}/api.php`;

/**
 * ✅ LISTAS desde /api.php?action=listas
 */
const LISTAS_ACTION = "listas";
const LISTAS_API = `${API}?action=${LISTAS_ACTION}`;

/**
 * ✅ Fallback directo al archivo global (si tu router listas no está incluido)
 * Estructura: backend/modules/global/obtener_listas.php
 */
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
    item?.id_pago ?? item?.idPago ?? item?.IdPago ?? item?.ID_PAGO ?? null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/* =========================
   Row virtualizado
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

    return (
      <div style={style} className="gpagos-virtual-row">
        <div className="gpagos-virtual-cell">{buildClienteLabel(item)}</div>

        <div className="gpagos-virtual-cell">{buildSistemaLabel(item)}</div>

        <div className="gpagos-virtual-cell gpagos-virtual-actions">
          <div className="gpagos-actions-inline">
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

            {isPagado && (
              <button
                className="gpagos-action-button gpagos-arca-button"
                onClick={(e) => {
                  e.stopPropagation();
                  onArcaClick?.(item);
                }}
                title="Factura ARCA"
                type="button"
              >
                <FontAwesomeIcon icon={faFileInvoiceDollar} />
              </button>
            )}

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
    prev.activeTab === next.activeTab
);

function Pagos() {
  const navigate = useNavigate();

  // ===== Tabs =====
  const [activeTab, setActiveTab] = useState("pagado");

  // ===== Filtros =====
  const [years, setYears] = useState([]);
  const [selectedYear, setSelectedYear] = useState("");

  const [meses, setMeses] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState("");

  const [mediosPago, setMediosPago] = useState([]);
  const [selectedMedioPago, setSelectedMedioPago] = useState("");

  const [searchTerm, setSearchTerm] = useState("");

  // ===== Datos =====
  const [pagosPagados, setPagosPagados] = useState([]);
  const [pagosDeudores, setPagosDeudores] = useState([]);

  // ===== UI =====
  const [loading, setLoading] = useState({ pagos: false, listas: false });

  const [toast, setToast] = useState(null);
  const showToast = useCallback(
    (tipo, mensaje, duracion = 3000) => setToast({ tipo, mensaje, duracion }),
    []
  );

  // ✅ MODAL PAGO
  const [modalPago, setModalPago] = useState(null);
  const openModalPago = useCallback(
    (row) => {
      const id_sistema = getIdSistema(row);
      if (!id_sistema) {
        showToast(
          "error",
          "No pude abrir el modal: el registro no trae id_sistema (o viene inválido). Revisá el endpoint de deudores."
        );
        return;
      }
      setModalPago({
        open: true,
        id_sistema,
        labelCliente: buildClienteLabel(row),
        labelSistema: buildSistemaLabel(row),
      });
    },
    [showToast]
  );
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
      if (!id_sistema) {
        showToast(
          "error",
          "No pude abrir Equipo: el registro no trae id_sistema. Revisá el endpoint de pagados."
        );
        return;
      }

      setModalEquipo({
        open: true,
        id_sistema,
        anio: selectedYear || "",
        mes: selectedMonth || "",
        labelCliente: buildClienteLabel(row),
        labelSistema: buildSistemaLabel(row),
        monto: row?.monto ?? null,
        fecha_pago: row?.fecha_pago ?? null,
        id_pago: getIdPago(row),
      });
    },
    [selectedYear, selectedMonth, showToast]
  );

  // ✅ MODAL ARCA
  const [modalArca, setModalArca] = useState(null);
  const closeModalArca = useCallback(() => setModalArca(null), []);
  const openModalArca = useCallback(
    (row) => {
      const id_sistema = getIdSistema(row);
      const id_pago = getIdPago(row);

      if (!id_sistema) {
        showToast(
          "error",
          "No pude abrir ARCA: el registro no trae id_sistema. Revisá el endpoint de pagados."
        );
        return;
      }
      if (!id_pago) {
        showToast(
          "error",
          "No pude abrir ARCA: el registro no trae id_pago. Revisá el endpoint de pagados."
        );
        return;
      }
      if (!selectedYear || !selectedMonth) {
        showToast("error", "Seleccioná año y mes antes de generar la factura.");
        return;
      }

      setModalArca({
        open: true,
        id_sistema,
        id_pago,
        anio: selectedYear,
        mes: selectedMonth,
        labelCliente: buildClienteLabel(row),
        labelSistema: buildSistemaLabel(row),
        monto: row?.monto ?? null,
        fecha_pago: row?.fecha_pago ?? null,
        medio_pago: row?.medio_pago ?? null,
      });
    },
    [selectedYear, selectedMonth, showToast]
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

  const cacheKey = useCallback((anio, mes) => `${anio || ""}|${mes || ""}`, []);

  const filtrosCompletos = useMemo(
    () => Boolean(selectedYear && selectedMonth),
    [selectedYear, selectedMonth]
  );

  /* =========================================================
     ✅ LISTAS
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

        const rawMeses = Array.isArray(listas?.meses) ? listas.meses : [];
        const mesesNorm = rawMeses
          .map((m) => ({
            id: m?.id ?? m?.id_mes ?? null,
            mes: (m?.mes ?? m?.nombre ?? "").toString().trim(),
          }))
          .filter((m) => m.mes)
          .sort((a, b) => Number(a.id ?? 99999) - Number(b.id ?? 99999))
          .map((m) => ({ mes: m.mes }));
        setMeses(mesesNorm);

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

        const rawAnios = Array.isArray(listas?.anios) ? listas.anios : [];
        const aniosNorm = rawAnios
          .map((a) => (typeof a === "object" ? a.anio ?? a.year ?? a.value : a))
          .filter((v) => v != null)
          .map((n) => parseInt(n, 10))
          .filter((n) => Number.isFinite(n))
          .sort((a, b) => b - a);

        setYears(aniosNorm);

        const current = new Date().getFullYear();
        setSelectedYear((prev) => {
          if (prev) {
            const cur = parseInt(prev, 10);
            if (aniosNorm.includes(cur)) return prev;
          }
          if (aniosNorm.includes(current)) return String(current);
          return aniosNorm.length ? String(aniosNorm[0]) : "";
        });
      } catch (e) {
        showToast("error", e.message || "No se pudieron cargar las listas");
      }
    };
    run();
  }, [fetchListas, showToast]);

  // ===== Carga pagos por mes/año =====
  const cargarPagosPorMes = useCallback(
    async (anio, mes, force = false) => {
      if (!anio || !mes) return;
      if (loading.pagos) return;

      const key = cacheKey(anio, mes);
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
          mes
        )}`;

        const [pagados, deudores] = await Promise.all([
          fetchJSON(`${API}?action=${ACTION_PAGOS}&estado=pagado${qp}`, {
            method: "GET",
          }),
          fetchJSON(`${API}?action=${ACTION_PAGOS}&estado=deudor${qp}`, {
            method: "GET",
          }),
        ]);

        // ✅ FIX: acá estaba el bug "pagos is not defined"
        const arrP = Array.isArray(pagados) ? pagados : pagados?.pagos || [];
        const arrD = Array.isArray(deudores) ? deudores : deudores?.pagos || [];

        cacheRef.current.pagos.pagado[key] = arrP;
        cacheRef.current.pagos.deudor[key] = arrD;
        cacheRef.current.pagos.lastUpdated[key] = Date.now();

        setPagosPagados(arrP);
        setPagosDeudores(arrD);
      } catch (e) {
        showToast(
          "error",
          e.message ||
            `No se pudieron cargar los pagos (${mes}/${anio}). Revisá action=${ACTION_PAGOS}`
        );
      } finally {
        setLoading((p) => ({ ...p, pagos: false }));
      }
    },
    [cacheKey, fetchJSON, loading.pagos, showToast]
  );

  useEffect(() => {
    if (!filtrosCompletos) {
      setPagosPagados([]);
      setPagosDeudores([]);
      return;
    }

    const deb = setTimeout(() => {
      cargarPagosPorMes(selectedYear, selectedMonth);
    }, searchTerm ? 250 : 0);

    return () => clearTimeout(deb);
  }, [filtrosCompletos, selectedYear, selectedMonth, searchTerm, cargarPagosPorMes]);

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
  }, [selectedYear, selectedMonth, selectedMedioPago, searchTerm, activeTab]);

  // ===== handlers =====
  const handleVolver = useCallback(() => navigate(-1), [navigate]);

  const handleYearChange = useCallback((e) => {
    setSelectedYear(e.target.value);
    setSelectedMonth("");
    setSelectedMedioPago("");
    setSearchTerm("");
  }, []);

  const handleMonthChange = useCallback((e) => {
    setSelectedMonth(e.target.value);
    setSearchTerm("");
  }, []);

  const handleMedioPagoChange = useCallback((e) => {
    setSelectedMedioPago(e.target.value);
  }, []);

  const handleSearchChange = useCallback((e) => {
    setSearchTerm(e.target.value);
  }, []);

  const onPayClick = useCallback((row) => openModalPago(row), [openModalPago]);
  const onTeamClick = useCallback((row) => openModalEquipo(row), [openModalEquipo]);
  const onArcaClick = useCallback((row) => openModalArca(row), [openModalArca]);

  const onDeleteClick = useCallback(
    (row) => {
      const id_pago = getIdPago(row);
      if (!id_pago) {
        showToast("error", "No pude eliminar: el registro no trae id_pago.");
        return;
      }
      setModalEliminar({
        open: true,
        id_pago,
        labelCliente: buildClienteLabel(row),
        labelSistema: buildSistemaLabel(row),
        fecha: row?.fecha_pago ?? null,
        monto: row?.monto ?? null,
      });
    },
    [showToast]
  );

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
      `pagos-${activeTab}-${selectedYear}-${selectedMonth}-${selectedMedioPago}-${searchTerm}`,
    [activeTab, selectedYear, selectedMonth, selectedMedioPago, searchTerm]
  );

  // ✅ refrescar
  const recargarListado = useCallback(() => {
    if (!selectedYear || !selectedMonth) return;
    const k = cacheKey(selectedYear, selectedMonth);
    delete cacheRef.current.pagos.pagado[k];
    delete cacheRef.current.pagos.deudor[k];
    delete cacheRef.current.pagos.lastUpdated[k];
    cargarPagosPorMes(selectedYear, selectedMonth, true);
  }, [selectedYear, selectedMonth, cacheKey, cargarPagosPorMes]);

  // ✅ confirmar eliminación
  const confirmarEliminarPago = useCallback(async () => {
    if (!modalEliminar?.id_pago) return;

    try {
      setLoading((p) => ({ ...p, pagos: true }));

      await fetchJSON(`${API}?action=${ACTION_PAGOS}&op=eliminar_pago`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_pago: modalEliminar.id_pago }),
      });

      showToast("exito", "Pago eliminado correctamente");
      closeModalEliminar();
      recargarListado();
    } catch (e) {
      showToast("error", e.message || "No se pudo eliminar el pago");
    } finally {
      setLoading((p) => ({ ...p, pagos: false }));
    }
  }, [modalEliminar, fetchJSON, showToast, closeModalEliminar, recargarListado]);

  // ===== render tabla =====
  const renderTabla = useMemo(() => {
    if (!selectedYear) return <NoFiltersApplied />;
    if (!selectedMonth) return <NoMonthSelected />;
    if (loading.pagos) return <LoadingIndicator />;
    if (datosFiltrados.length === 0) return <NoDataFound />;

    // MOBILE
    if (isMobileRef.current) {
      return (
        <div className="gpagos-mobile-list">
          {datosFiltradosPaginated.map((row, index) => {
            const isPagado = activeTab === "pagado";
            const key = String(getIdPago(row) || getIdSistema(row) || index);

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
                    <>
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

                      <button
                        className="gpagos-mobile-arca-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onArcaClick(row);
                        }}
                        type="button"
                        title="Factura ARCA"
                      >
                        <FontAwesomeIcon icon={faFileInvoiceDollar} />
                        <span>ARCA</span>
                      </button>

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
                    </>
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
              />
            );
          }}
        </List>
      </div>
    );
  }, [
    selectedYear,
    selectedMonth,
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
  ]);

  return (
    <div className="gpagos-container">
      {/* ✅ MODAL PAGO */}
      {modalPago?.open && (
        <ModalPago
          id_sistema={modalPago.id_sistema}
          cerrarModal={closeModalPago}
          onPagoRealizado={() => {
            closeModalPago();
            recargarListado();
          }}
        />
      )}

      {/* ✅ MODAL EQUIPO */}
      {modalEquipo?.open && (
        <ModalEquipoPago
          open={modalEquipo.open}
          onClose={closeModalEquipo}
          apiBase={API}
          action={ACTION_PAGOS}
          data={modalEquipo}
        />
      )}

      {/* ✅ MODAL ARCA */}
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

      {/* ✅ MODAL ELIMINAR */}
      {modalEliminar?.open && (
        <ModalEliminarPago
          open={modalEliminar.open}
          onClose={closeModalEliminar}
          onConfirm={confirmarEliminarPago}
          loading={loading.pagos}
          data={modalEliminar}
        />
      )}

      {toast && (
        <Toast
          tipo={toast.tipo}
          mensaje={toast.mensaje}
          onClose={() => setToast(null)}
          duracion={toast.duracion}
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
                    setSelectedMonth("");
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
                  value={selectedMonth}
                  onChange={(e) => {
                    setSelectedMonth(e.target.value);
                    setSearchTerm("");
                  }}
                  className="gpagos-dropdown"
                  disabled={!selectedYear || loading.listas || loading.pagos}
                >
                  <option value="" disabled>
                    Mes
                  </option>
                  {meses.map((m, index) => (
                    <option key={index} value={m.mes}>
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
                  disabled={!selectedYear || !selectedMonth || loading.pagos}
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
                className="gpagos-button"
                onClick={() => {
                  cacheRef.current.listas = null;
                  fetchListas(true).catch(() => {});
                  recargarListado();
                }}
                disabled={loading.pagos || loading.listas}
                type="button"
                title="Refrescar"
              >
                <FontAwesomeIcon icon={faMoneyCheckAlt} />
                <span>Refrescar</span>
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
              icon={activeTab === "pagado" ? faCheckCircle : faExclamationTriangle}
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
                disabled={loading.pagos || !selectedYear || !selectedMonth}
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
