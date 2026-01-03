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
  faUsers,
  faList,
  faCheckCircle,
  faExclamationTriangle,
  faExclamationCircle,
  faCreditCard,
  faTimes,
} from "@fortawesome/free-solid-svg-icons";

import BASE_URL from "../../config/config";
import Toast from "../Global/Toast";
import "./Pagos.css";

// ✅ Modal de pago
import ModalPago from "./modales/ModalPago";

// ✅ Modal eliminar pago (NUEVO)
import ModalEliminarPago from "./modales/ModalEliminarPago";

const ACTION_PAGOS = "pagos";
const API = `${BASE_URL}/api.php`;

// ✅ GLOBAL (meses/medios/planes/trabajadores)
const GLOBAL_ACTION = "global";
const GLOBAL_OP = "listas";
const GLOBAL_API = `${API}?action=${GLOBAL_ACTION}&op=${GLOBAL_OP}`;

// ✅ fallback directo al archivo (por si no está ruteado en api.php)
const GLOBAL_DIRECT = `${BASE_URL}/../modules/global/obtener_listas.php`;

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
    const resizeObs = new ResizeObserver(update);
    resizeObs.observe(el);

    return () => resizeObs.disconnect();
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

  const rs = (item?.razon_social || item?.RazonSocial || item?.RAZON_SOCIAL || "")
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

/* =========================
   Row virtualizado
========================= */
const Row = memo(
  ({ index, style, data, activeTab, onPayClick, onDeleteClick }) => {
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
            {/* ✅ DEUDORES: botón $ */}
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

            {/* ✅ PAGADO: eliminar (X) */}
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
    prev.style === next.style &&
    prev.data === next.data &&
    prev.activeTab === next.activeTab
);

function Pagos() {
  const navigate = useNavigate();

  // ===== Tabs =====
  const [activeTab, setActiveTab] = useState("pagado"); // "pagado" | "deudores"

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
  const [loading, setLoading] = useState({
    pagos: false,
    meses: false,
    years: false,
    mediosPago: false,
  });

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

  // ✅ MODAL ELIMINAR (NUEVO)
  const [modalEliminar, setModalEliminar] = useState(null);
  const closeModalEliminar = useCallback(() => setModalEliminar(null), []);

  // ===== Virtual / infinite =====
  const [limit, setLimit] = useState(120);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const listRef = useRef(null);

  // ===== Cache =====
  const cacheRef = useRef({
    pagos: { pagado: {}, deudor: {}, lastUpdated: {} },
    mesesGlobal: null,
    years: null,
    mediosPago: [],
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

  // ===== AÑOS =====
  const fetchYears = useCallback(async () => {
    setLoading((p) => ({ ...p, years: true }));
    try {
      const data = await fetchJSON(`${API}?action=anios_pagos`, { method: "GET" });

      const lista = Array.isArray(data)
        ? data
        : Array.isArray(data?.anios)
        ? data.anios
        : [];

      const norm = lista
        .map((a) => (typeof a === "object" ? a.anio ?? a.year ?? a.value : a))
        .filter((v) => v != null)
        .map((n) => parseInt(n, 10))
        .filter((n) => Number.isFinite(n))
        .sort((a, b) => b - a);

      cacheRef.current.years = norm;
      setYears(norm);

      const current = new Date().getFullYear();

      if (!selectedYear) {
        if (norm.includes(current)) setSelectedYear(String(current));
        else if (norm.length) setSelectedYear(String(norm[0]));
        else setSelectedYear("");
      } else {
        const cur = parseInt(selectedYear, 10);
        if (!norm.includes(cur)) {
          if (norm.includes(current)) setSelectedYear(String(current));
          else setSelectedYear(norm.length ? String(norm[0]) : "");
        }
      }
    } catch (e) {
      showToast("error", e.message || "No se pudieron cargar los años");
    } finally {
      setLoading((p) => ({ ...p, years: false }));
    }
  }, [fetchJSON, selectedYear, showToast]);

  useEffect(() => {
    fetchYears();
  }, [fetchYears]);

  // ===== MESES DESDE GLOBAL =====
  const fetchMesesGlobal = useCallback(async () => {
    if (
      Array.isArray(cacheRef.current.mesesGlobal) &&
      cacheRef.current.mesesGlobal.length
    ) {
      return cacheRef.current.mesesGlobal;
    }

    try {
      const data = await fetchJSON(GLOBAL_API, { method: "GET" });
      const mesesRaw =
        data?.listas?.meses || data?.meses || data?.listas?.mes || [];

      const normalizados = (Array.isArray(mesesRaw) ? mesesRaw : [])
        .map((m) => ({
          id: m?.id ?? m?.id_mes ?? null,
          mes: (m?.mes ?? m?.nombre ?? "").toString().trim(),
        }))
        .filter((m) => m.mes)
        .sort((a, b) => (a.id ?? 99999) - (b.id ?? 99999))
        .map((m) => ({ mes: m.mes }));

      if (!normalizados.length) throw new Error("Global no devolvió meses");

      cacheRef.current.mesesGlobal = normalizados;
      return normalizados;
    } catch {
      const data2 = await fetchJSON(GLOBAL_DIRECT, { method: "GET" });
      const mesesRaw2 = data2?.listas?.meses || data2?.meses || [];

      const normalizados2 = (Array.isArray(mesesRaw2) ? mesesRaw2 : [])
        .map((m) => ({
          id: m?.id ?? m?.id_mes ?? null,
          mes: (m?.mes ?? m?.nombre ?? "").toString().trim(),
        }))
        .filter((m) => m.mes)
        .sort((a, b) => (a.id ?? 99999) - (b.id ?? 99999))
        .map((m) => ({ mes: m.mes }));

      cacheRef.current.mesesGlobal = normalizados2;
      return normalizados2;
    }
  }, [fetchJSON]);

  useEffect(() => {
    const run = async () => {
      if (!selectedYear) {
        setMeses([]);
        return;
      }

      setLoading((p) => ({ ...p, meses: true }));
      try {
        let lista = await fetchMesesGlobal();

        if (selectedMonth && !lista.some((m) => m.mes === selectedMonth)) {
          lista = [{ mes: selectedMonth, _extra: true }, ...lista];
        }

        setMeses(lista);
      } catch (e) {
        showToast("error", e.message || "Error al cargar los meses (Global)");
        setMeses([]);
      } finally {
        setLoading((p) => ({ ...p, meses: false }));
      }
    };

    run();
  }, [selectedYear, selectedMonth, fetchMesesGlobal, showToast]);

  // ===== MEDIOS DE PAGO =====
  useEffect(() => {
    const fetchMediosPago = async () => {
      if (cacheRef.current.mediosPago.length > 0) {
        setMediosPago(cacheRef.current.mediosPago);
        return;
      }

      setLoading((p) => ({ ...p, mediosPago: true }));
      try {
        let data;
        try {
          data = await fetchJSON(GLOBAL_API, { method: "GET" });
        } catch {
          data = await fetchJSON(GLOBAL_DIRECT, { method: "GET" });
        }

        const raw = Array.isArray(data?.listas?.medios_pago)
          ? data.listas.medios_pago
          : Array.isArray(data?.mediosPago)
          ? data.mediosPago
          : [];

        const adapt = raw
          .map((item) => ({
            id:
              item?.id ??
              item?.IdMedios_pago ??
              item?.id_medio_pago ??
              item?.idMedios_Pago ??
              null,
            nombre: (item?.nombre ?? item?.Medio_Pago ?? item?.medio_pago ?? "")
              .toString()
              .trim(),
          }))
          .filter((m) => m.nombre);

        cacheRef.current.mediosPago = adapt;
        setMediosPago(adapt);
      } catch (e) {
        showToast("error", e.message || "Error al cargar medios de pago");
      } finally {
        setLoading((p) => ({ ...p, mediosPago: false }));
      }
    };

    fetchMediosPago();
  }, [fetchJSON, showToast]);

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
            `No se pudieron cargar los pagos (${mes}/${anio}). Revisa el endpoint action=${ACTION_PAGOS}`
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

  // ===== Filtrado (medio + búsqueda) =====
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
    if (offset + limit < datosFiltrados.length) setOffset((p) => p + limit);
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
  }, []);

  const handleMonthChange = useCallback((e) => {
    setSelectedMonth(e.target.value);
  }, []);

  const handleMedioPagoChange = useCallback((e) => {
    setSelectedMedioPago(e.target.value);
  }, []);

  const handleSearchChange = useCallback(
    (e) => {
      if (!selectedMonth || !selectedYear) return;
      setSearchTerm(e.target.value);
    },
    [selectedMonth, selectedYear]
  );

  // ✅ ABRE MODAL SOLO EN DEUDORES (icono $)
  const onPayClick = useCallback((row) => openModalPago(row), [openModalPago]);

  // ✅ ABRE MODAL ELIMINAR SOLO EN PAGADO (X)
  const onDeleteClick = useCallback(
    (row) => {
      const id_pago = getIdPago(row);
      if (!id_pago) {
        showToast(
          "error",
          "No pude eliminar: el registro no trae id_pago. Revisá el endpoint de pagados."
        );
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

  // mobile detection
  const isClient = typeof window !== "undefined";
  const isMobileRef = useRef(isClient ? window.innerWidth <= 768 : false);
  const [isMobile, setIsMobile] = useState(isMobileRef.current);

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

  // ✅ refrescar listados
  const recargarListado = useCallback(() => {
    if (!selectedYear || !selectedMonth) return;
    const k = cacheKey(selectedYear, selectedMonth);
    delete cacheRef.current.pagos.pagado[k];
    delete cacheRef.current.pagos.deudor[k];
    delete cacheRef.current.pagos.lastUpdated[k];
    cargarPagosPorMes(selectedYear, selectedMonth, true);
  }, [selectedYear, selectedMonth, cacheKey, cargarPagosPorMes]);

  // ✅ confirmar eliminación (backend)
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

    if (isMobileRef.current) {
      return (
        <div className="gpagos-mobile-list">
          {datosFiltradosPaginated.map((row, index) => {
            const isPagado = activeTab === "pagado";
            return (
              <div key={index} className="gpagos-mobile-card">
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
            if (visibleStopIndex >= datosFiltradosPaginated.length - 5 && hasMore) {
              loadMoreItems();
            }
          }}
        >
          {(props) => {
            if (props.index >= datosFiltradosPaginated.length) {
              return <div style={props.style} className="gpagos-loading-row"></div>;
            }
            return (
              <Row
                {...props}
                activeTab={activeTab}
                onPayClick={onPayClick}
                onDeleteClick={onDeleteClick}
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

      {/* ✅ MODAL ELIMINAR (NUEVO) */}
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
            <FontAwesomeIcon icon={faMoneyCheckAlt} className="gpagos-title-icon" />
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
                  onChange={handleYearChange}
                  className="gpagos-dropdown"
                  disabled={loading.years || loading.meses || loading.pagos}
                >
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
                  onChange={handleMonthChange}
                  className="gpagos-dropdown"
                  disabled={!selectedYear || loading.meses || loading.pagos}
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
                  onChange={handleMedioPagoChange}
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
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT */}
      <div
        className={`gpagos-right-section gpagos-box ${
          isMobile ? "gpagos-has-bottombar" : ""
        }`}
      >
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

            {selectedYear && (
              <span className="gpagos-summary-item">
                <FontAwesomeIcon icon={faCalendarAlt} />
                Año: {selectedYear}
              </span>
            )}

            {selectedMonth && (
              <span className="gpagos-summary-item">
                <FontAwesomeIcon icon={faCalendarAlt} />
                Mes: {selectedMonth}
              </span>
            )}

            {selectedMedioPago && (
              <span className="gpagos-summary-item">
                <FontAwesomeIcon icon={faCreditCard} />
                Medio: {selectedMedioPago}
              </span>
            )}
          </div>
        </div>

        <div className="gpagos-table-container">{renderTabla}</div>
      </div>

      {/* Bottom bar mobile */}
      {isMobile && (
        <div className="gpagos-mobile-bottombar">
          <button
            className="gpagos-mbar-btn mbar-back"
            onClick={handleVolver}
            disabled={loading.pagos}
            type="button"
          >
            <FontAwesomeIcon icon={faArrowLeft} />
            <span>Volver</span>
          </button>

          <button
            className="gpagos-mbar-btn mbar-refresh"
            onClick={() => {
              if (!selectedYear || !selectedMonth) return;
              const k = cacheKey(selectedYear, selectedMonth);
              delete cacheRef.current.pagos.pagado[k];
              delete cacheRef.current.pagos.deudor[k];
              delete cacheRef.current.pagos.lastUpdated[k];
              cargarPagosPorMes(selectedYear, selectedMonth, true);
            }}
            disabled={loading.pagos || !selectedYear || !selectedMonth}
            type="button"
          >
            <FontAwesomeIcon icon={faMoneyCheckAlt} />
            <span>Actualizar</span>
          </button>

          <button
            className="gpagos-mbar-btn mbar-clear"
            onClick={() => {
              setSelectedMedioPago("");
              setSearchTerm("");
            }}
            disabled={loading.pagos}
            type="button"
          >
            <FontAwesomeIcon icon={faTimes} />
            <span>Limpiar</span>
          </button>
        </div>
      )}
    </div>
  );
}

export default memo(Pagos);
