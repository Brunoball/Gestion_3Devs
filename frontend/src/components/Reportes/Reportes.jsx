import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./dashboard.css";
import BASE_URL from "../../config/config";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faBuilding,
  faCalendarAlt,
  faChartLine,
  faCircleInfo,
  faCircleCheck,
  faCoins,
  faEye,
  faFileExcel,
  faInbox,
  faMoneyBillTransfer,
  faMoneyBillTrendUp,
  faPaperclip,
  faPenToSquare,
  faPlus,
  faSearch,
  faTrash,
  faTriangleExclamation,
  faUsers,
} from "@fortawesome/free-solid-svg-icons";
import * as XLSX from "xlsx";

import Toast from "../Global/Toast";
import { uppercaseTextFieldOnChange } from "../Global/uppercaseFields";
import { fetchJSONAuth } from "../Global/api";
import {
  clearStoredSession,
  getOrganizations,
  getStoredActiveOrganization,
  getStoredToken,
  getStoredUser,
  setStoredActiveOrganization,
} from "../Global/session";

import * as ModNuevoEgreso from "./modales/ModalNuevoEgreso";
import * as ModEditarMovimiento from "./modales/ModalEditarMovimiento";
import * as ModEliminarEgreso from "./modales/ModalEliminarEgreso";
import * as ModVerComprobante from "./modales/ModalVerComprobante";
import * as ModComprobantePago from "./modales/ModalComprobantePago";
import * as ModGraficosReportes from "./modales/ModalGraficosReportes";
import ModalSubirComprobanteTrabajador from "./modales/ModalSubirComprobanteTrabajador";
import ModalVerComprobanteTrabajador from "./modales/ModalVerComprobanteTrabajador";
import ModalDetalleLiquidacionTrabajador from "./modales/ModalDetalleLiquidacionTrabajador";
import ModalConfirmarPagoTrabajador from "./modales/ModalConfirmarPagoTrabajador";
import "./modales/ModalFloatingLabels.css";
import "./modales/ModalCards.css";

function pickComponent(mod, preferredName) {
  return (
    mod?.default ||
    (preferredName ? mod?.[preferredName] : null) ||
    Object.values(mod || {}).find((value) => typeof value === "function") ||
    null
  );
}

const ModalNuevoEgreso = pickComponent(ModNuevoEgreso, "ModalNuevoEgreso");
const ModalEditarMovimiento = pickComponent(ModEditarMovimiento, "ModalEditarMovimiento");
const ModalEliminarEgreso = pickComponent(ModEliminarEgreso, "ModalEliminarEgreso");
const ModalVerComprobante = pickComponent(ModVerComprobante, "ModalVerComprobante");
const ModalComprobantePago = pickComponent(ModComprobantePago, "ModalComprobantePago");
const ModalGraficosReportes = pickComponent(ModGraficosReportes, "ModalGraficosReportes");

const nfPesos = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const money = (value) => `$${nfPesos.format(Number(value || 0))}`;
const SKELETON_ROWS = 8;

function GridTable({ title, columns = [], rows = [], loading = false, actions = null }) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const allColumns = useMemo(
    () =>
      actions
        ? [
            ...columns,
            {
              key: "__actions",
              label: "Acciones",
              fr: "minmax(172px, 1.15fr)",
              center: true,
              className: "gridtable-cell--actions",
              render: actions,
            },
          ]
        : columns,
    [actions, columns]
  );
  const template = allColumns.map((column) => column.fr || "1fr").join(" ");

  return (
    <section className="reportes-block">
      <div className="contable-tablewrap reportes-tablewrap minimal">
        <div className="gridtable-header minimal" style={{ gridTemplateColumns: template }}>
          {allColumns.map((column) => (
            <div
              key={column.key}
              className={`gridtable-cell ${column.className || ""} ${column.left ? "lefts" : ""} ${
                column.center ? "centers" : ""
              } ${column.right ? "rights" : ""}`}
            >
              {column.label}
            </div>
          ))}
        </div>

        <div className="gridtable-scroll minimal">
          <div className={`gridtable-body minimal ${!loading && !safeRows.length ? "is-empty" : ""}`}>
            {loading ? (
              Array.from({ length: SKELETON_ROWS }).map((_, rowIndex) => (
                <div
                  key={`skeleton-${rowIndex}`}
                  className="gridtable-row skeleton-row"
                  style={{ gridTemplateColumns: template }}
                  aria-hidden="true"
                >
                  {allColumns.map((column) => (
                    <div
                      className={`gridtable-cell ${column.className || ""}`}
                      key={`${rowIndex}-${column.key}`}
                    >
                      <span className="skeleton-bar" />
                    </div>
                  ))}
                </div>
              ))
            ) : safeRows.length ? (
              safeRows.map((row, rowIndex) => (
                <div
                  key={row?.id ?? `${title}-${rowIndex}`}
                  className="gridtable-row row-appear minimal"
                  style={{ gridTemplateColumns: template }}
                >
                  {allColumns.map((column) => (
                    <div
                      key={column.key}
                      className={`gridtable-cell ${column.className || ""} ${column.left ? "lefts" : ""} ${
                        column.center ? "centers" : ""
                      } ${column.right ? "rights" : ""}`}
                      data-label={column.label}
                    >
                      {column.render ? column.render(row) : row?.[column.key] ?? ""}
                    </div>
                  ))}
                </div>
              ))
            ) : (
              <div className="detalle-empty">
                <div className="gridtable-empty-inner">
                  <div className="empty-icon" aria-hidden="true">
                    <FontAwesomeIcon icon={faInbox} />
                  </div>
                  <div>No hay datos para los filtros aplicados.</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export default function Reportes() {
  const navigate = useNavigate();
  const storedUser = useMemo(() => getStoredUser(), []);
  const organizations = useMemo(() => getOrganizations(storedUser), [storedUser]);
  const [activeOrganization, setActiveOrganization] = useState(() =>
    getStoredActiveOrganization(storedUser)
  );

  const activeOrganizationId = Number(activeOrganization?.id_organizacion || 0);
  const activeRole = String(activeOrganization?.rol || "vista").toLowerCase();
  const canWrite = activeRole === "admin" || activeRole === "contador";

  const [toast, setToast] = useState({
    show: false,
    tipo: "info",
    mensaje: "",
    duracion: 2500,
    key: 0,
  });
  const [view, setView] = useState("pagos");
  const [aniosDisponibles, setAniosDisponibles] = useState([]);
  const [anioSeleccionado, setAnioSeleccionado] = useState("TODOS");
  const [mesesDisponibles, setMesesDisponibles] = useState([]);
  const [mesSeleccionado, setMesSeleccionado] = useState("TODOS");
  const [mediosDisponibles, setMediosDisponibles] = useState([]);
  const [trabajadoresActivos, setTrabajadoresActivos] = useState([]);
  const [organizacionesPagadoras, setOrganizacionesPagadoras] = useState([]);
  const [searchText, setSearchText] = useState("");
  const [loadingAnios, setLoadingAnios] = useState(true);
  const [loadingMeses, setLoadingMeses] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [pagos, setPagos] = useState([]);
  const [egresos, setEgresos] = useState([]);
  const [trabajadores, setTrabajadores] = useState([]);
  const [movimientosResumen, setMovimientosResumen] = useState(null);
  const [liquidacionResumen, setLiquidacionResumen] = useState(null);
  const [advertencias, setAdvertencias] = useState([]);
  const [beneficiariosNoPersona, setBeneficiariosNoPersona] = useState([]);
  const [reloadKey, setReloadKey] = useState(0);

  const [modalEgresoOpen, setModalEgresoOpen] = useState(false);
  const [savingEgreso, setSavingEgreso] = useState(false);
  const [modalEditarOpen, setModalEditarOpen] = useState(false);
  const [savingEditar, setSavingEditar] = useState(false);
  const [editarItem, setEditarItem] = useState(null);
  const [modalEliminarOpen, setModalEliminarOpen] = useState(false);
  const [deletingEgreso, setDeletingEgreso] = useState(false);
  const [egresoAEliminar, setEgresoAEliminar] = useState(null);
  const [modalVerCompOpen, setModalVerCompOpen] = useState(false);
  const [compItem, setCompItem] = useState(null);
  const [modalPagoCompOpen, setModalPagoCompOpen] = useState(false);
  const [savingPagoComp, setSavingPagoComp] = useState(false);
  const [pagoItem, setPagoItem] = useState(null);
  const [modalGraficosOpen, setModalGraficosOpen] = useState(false);
  const [modalTrabCompOpen, setModalTrabCompOpen] = useState(false);
  const [savingTrabComp, setSavingTrabComp] = useState(false);
  const [trabajadorCompItem, setTrabajadorCompItem] = useState(null);
  const [modalVerTrabCompOpen, setModalVerTrabCompOpen] = useState(false);
  const [trabajadorCompViewItem, setTrabajadorCompViewItem] = useState(null);
  const [trabajadorCompViewData, setTrabajadorCompViewData] = useState(null);
  const [modalDetalleOpen, setModalDetalleOpen] = useState(false);
  const [detalleTrabajador, setDetalleTrabajador] = useState(null);
  const [modalConfirmarPagoOpen, setModalConfirmarPagoOpen] = useState(false);
  const [pagoTrabajadorPendiente, setPagoTrabajadorPendiente] = useState(null);
  const [markingPaidId, setMarkingPaidId] = useState(null);

  const didInitMes = useRef(false);
  const initializedOrganizationsRef = useRef(new Set());

  const showToast = useCallback((tipo, mensaje, duracion = 2500) => {
    setToast((current) => ({
      show: true,
      tipo,
      mensaje,
      duracion,
      key: (current.key || 0) + 1,
    }));
  }, []);

  const closeToast = useCallback(() => {
    setToast((current) => ({ ...current, show: false }));
  }, []);

  useEffect(() => {
    if (!getStoredToken() || !storedUser || !organizations.length) {
      clearStoredSession();
      navigate("/", { replace: true });
    }
  }, [navigate, organizations, storedUser]);

  const changeOrganization = useCallback((organization) => {
    const selected = setStoredActiveOrganization(organization?.id_organizacion);
    if (!selected) return;
    setActiveOrganization(selected);
    setSearchText("");
    setPagos([]);
    setEgresos([]);
    setTrabajadores([]);
    setMovimientosResumen(null);
    setLiquidacionResumen(null);
    setAdvertencias([]);
    setBeneficiariosNoPersona([]);
    setTrabajadoresActivos([]);
    setOrganizacionesPagadoras([]);
  }, []);

  const fetchJSON = useCallback(
    async (url, options = {}) => {
      if (!activeOrganizationId) throw new Error("No hay una entidad activa.");
      const separator = url.includes("?") ? "&" : "?";
      try {
        return await fetchJSONAuth(
          `${url}${separator}ts=${Date.now()}`,
          options,
          activeOrganizationId
        );
      } catch (error) {
        if (error?.code === "SESSION_EXPIRED") {
          clearStoredSession();
          navigate("/", { replace: true });
        }
        throw error;
      }
    },
    [activeOrganizationId, navigate]
  );

  const postJSON = useCallback(
    (url, body) =>
      fetchJSON(url, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(body ?? {}),
      }),
    [fetchJSON]
  );

  const postFormData = useCallback(
    (url, formData) => fetchJSON(url, { method: "POST", body: formData }),
    [fetchJSON]
  );

  const buildFileUrl = useCallback((path) => {
    const value = String(path || "").trim();
    if (!value) return "";
    if (/^https?:\/\//i.test(value)) return value;
    return `${String(BASE_URL || "").replace(/\/+$/, "")}/${value.replace(/^\/+/, "")}`;
  }, []);

  const getPeriodoTrabajador = useCallback(() => {
    const anio = anioSeleccionado === "TODOS" ? 0 : Number(anioSeleccionado);
    const mes = mesSeleccionado === "TODOS" ? 0 : Number(mesSeleccionado);
    if (!Number.isInteger(anio) || anio < 2000 || !Number.isInteger(mes) || mes < 1 || mes > 12) {
      return null;
    }
    const nombreMes =
      mesesDisponibles.find((item) => String(item.id) === String(mes))?.mes || `Mes ${mes}`;
    return { anio, mes, id_mes: mes, label: `${nombreMes} ${anio}` };
  }, [anioSeleccionado, mesSeleccionado, mesesDisponibles]);

  useEffect(() => {
    if (!activeOrganizationId) return;
    let alive = true;

    (async () => {
      try {
        setLoadingAnios(true);
        const data = await fetchJSON(`${BASE_URL}/api.php?action=reportes&op=anios`);
        if (!alive) return;
        const rawYears = Array.isArray(data?.anios) ? data.anios : [];
        const years = ["TODOS", ...rawYears.map(String)];
        setAniosDisponibles(years);
        const currentYear = String(new Date().getFullYear());
        setAnioSeleccionado((current) => {
          if (current !== "TODOS" && years.includes(String(current))) return String(current);
          if (years.includes(currentYear)) return currentYear;
          return rawYears.length ? String(rawYears[0]) : "TODOS";
        });
      } catch (error) {
        if (!alive) return;
        setAniosDisponibles(["TODOS"]);
        setAnioSeleccionado("TODOS");
        showToast("error", `No se pudieron cargar los años: ${error.message}`, 4000);
      } finally {
        if (alive) setLoadingAnios(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [activeOrganizationId, fetchJSON, showToast]);

  useEffect(() => {
    if (!activeOrganizationId) return;
    let alive = true;

    (async () => {
      try {
        setLoadingMeses(true);
        const data = await fetchJSON(`${BASE_URL}/api.php?action=listas`);
        if (!alive) return;
        const rawMonths = Array.isArray(data?.listas?.meses) ? data.listas.meses : [];
        const rawMethods = Array.isArray(data?.listas?.medios_pago)
          ? data.listas.medios_pago
          : Array.isArray(data?.listas?.medios)
          ? data.listas.medios
          : [];
        const months = rawMonths
          .map((item) => ({
            ...item,
            id: item.id ?? item.id_mes,
            mes: item.mes ?? item.nombre ?? item.label,
          }))
          .filter((item) => item.id != null);
        const methods = rawMethods
          .map((item) => ({
            ...item,
            id: item.id ?? item.id_medio_pago,
            nombre: item.nombre ?? item.medio ?? item.label,
          }))
          .filter((item) => item.id != null);
        setMesesDisponibles(months);
        setMediosDisponibles(methods);
        if (!didInitMes.current) {
          const currentMonth = String(new Date().getMonth() + 1);
          setMesSeleccionado(months.some((item) => String(item.id) === currentMonth) ? currentMonth : "TODOS");
          didInitMes.current = true;
        }
      } catch (error) {
        if (!alive) return;
        setMesesDisponibles([]);
        setMediosDisponibles([]);
        showToast("error", `No se pudieron cargar meses y medios: ${error.message}`, 4000);
      } finally {
        if (alive) setLoadingMeses(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [activeOrganizationId, fetchJSON, showToast]);

  useEffect(() => {
    if (!activeOrganizationId) return;
    let alive = true;
    (async () => {
      try {
        const data = await fetchJSON(`${BASE_URL}/api.php?action=reportes&op=egreso_pagadores`);
        if (!alive) return;
        const rows = Array.isArray(data?.trabajadores) ? data.trabajadores : [];
        const organizations = Array.isArray(data?.organizaciones) ? data.organizaciones : [];
        setTrabajadoresActivos(
          rows.map((row) => ({
            id: row.id ?? row.id_trabajador,
            nombre: row.nombre ?? "",
            apellido: row.apellido ?? "",
            rol: row.rol ?? "",
            alias_pago: row.alias_pago ?? "",
            organizacion_codigo: row.organizacion_codigo ?? "",
            organizacion_nombre: row.organizacion_nombre ?? "",
          }))
        );
        setOrganizacionesPagadoras(
          organizations.map((row) => ({
            id: row.id ?? row.id_organizacion,
            id_organizacion: row.id_organizacion ?? row.id,
            codigo: row.codigo ?? "",
            nombre: row.nombre ?? row.codigo ?? "",
          }))
        );
      } catch (error) {
        if (alive) {
          setTrabajadoresActivos([]);
          setOrganizacionesPagadoras([]);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [activeOrganizationId, fetchJSON]);

  useEffect(() => {
    if (!activeOrganizationId) return;
    let alive = true;

    const withFilters = (operation) => {
      const params = new URLSearchParams({ action: "reportes", op: operation });
      if (anioSeleccionado !== "TODOS") params.set("anio", String(anioSeleccionado));
      if (mesSeleccionado !== "TODOS") params.set("mes", String(mesSeleccionado));
      return `${String(BASE_URL || "").replace(/\/+$/, "")}/api.php?${params.toString()}`;
    };

    (async () => {
      try {
        setLoadingData(true);

        // Congela una sola vez los movimientos históricos de la entidad y de
        // las entidades que la alimentan. Si algo no supera los controles, la
        // pantalla no continúa como si la liquidación fuera confiable.
        if (canWrite && !initializedOrganizationsRef.current.has(activeOrganizationId)) {
          await postJSON(`${BASE_URL}/api.php?action=reportes&op=blindaje_inicializar`, {});
          initializedOrganizationsRef.current.add(activeOrganizationId);
        }

        const movementData = await fetchJSON(withFilters("movimientos"));
        if (!alive) return;
        const rawPayments = Array.isArray(movementData?.pagos)
          ? movementData.pagos
          : Array.isArray(movementData?.ingresos)
          ? movementData.ingresos
          : [];
        const rawExpenses = Array.isArray(movementData?.egresos) ? movementData.egresos : [];

        setPagos(
          rawPayments.map((row) => ({
            id: row.id ?? row.id_pago,
            id_pago: row.id_pago ?? row.id,
            id_sistema: row.id_sistema ?? null,
            fecha: row.fecha ?? row.fecha_pago ?? "",
            anio_periodo: Number(row.anio_periodo || 0),
            id_mes: Number(row.id_mes || 0),
            concepto: row.concepto ?? "",
            categoria: row.categoria ?? "",
            medio: row.medio ?? "",
            id_medio_pago: row.id_medio_pago ?? null,
            monto: Number(row.monto || 0),
            cliente_nombre: row.cliente_nombre ?? "",
            sistema_nombre: row.sistema_nombre ?? "",
            comprobante: row.comprobante ?? "",
            factura_pdf: row.factura_pdf ?? "",
          }))
        );
        setEgresos(
          rawExpenses.map((row) => ({
            id: row.id ?? row.id_egreso,
            id_egreso: row.id_egreso ?? row.id,
            fecha: row.fecha ?? "",
            concepto: row.concepto ?? "",
            descripcion: row.descripcion ?? "",
            categoria: row.categoria ?? "",
            medio: row.medio ?? "",
            id_medio_pago: row.id_medio_pago ?? null,
            id_trabajador: row.id_trabajador ?? null,
            pagadores: Array.isArray(row.pagadores) ? row.pagadores : [],
            pagador: row.pagador ?? row.trabajador ?? "",
            trabajador: row.pagador ?? row.trabajador ?? "",
            tipo_egreso: row.tipo_egreso ?? (row.id_trabajador ? "trabajador" : "general"),
            monto: Number(row.monto || 0),
            comprobante: row.comprobante ?? "",
          }))
        );
        setMovimientosResumen(movementData?.resumen || null);

        if (view === "trabajadores") {
          const workerData = await fetchJSON(withFilters("trabajadores"));
          if (!alive) return;
          const rawWorkers = Array.isArray(workerData?.trabajadores) ? workerData.trabajadores : [];
          setTrabajadores(
            rawWorkers.map((row) => ({
              id: row.id ?? row.id_trabajador,
              id_trabajador: row.id_trabajador ?? row.id,
              nombre: row.nombre ?? "",
              apellido: row.apellido ?? "",
              rol: row.rol ?? "",
              alias_pago: row.alias_pago ?? "",
              porcentaje_efectivo: Number(row.porcentaje_efectivo || 0),
              sistemas_cobrados: Number(row.sistemas_cobrados || 0),
              monto_bruto: Number(row.monto_bruto || 0),
              descuento_egresos: Number(row.descuento_egresos || 0),
              monto_sistemas: Number(row.monto_sistemas || 0),
              monto_reembolso: Number(row.monto_reembolso || 0),
              monto: Number(row.monto || 0),
              miembro_organizacion: Boolean(row.miembro_organizacion),
              puede_comprobante: Boolean(row.puede_comprobante),
              liquidacion_indirecta: Boolean(row.liquidacion_indirecta),
              pagado: Boolean(row.pagado),
              pagado_at: row.pagado_at ?? "",
              liquidacion_snapshot_id: row.liquidacion_snapshot_id ?? null,
              puede_marcar_pagado: Boolean(row.puede_marcar_pagado),
              detalle: Array.isArray(row.detalle) ? row.detalle : [],
              comprobante_pago: row.comprobante_pago ?? "",
              comprobante_pago_fecha: row.comprobante_pago_fecha ?? "",
              comprobante_pago_nombre: row.comprobante_pago_nombre ?? "",
              comprobante_pago_tipo: row.comprobante_pago_tipo ?? "",
              comprobante_pago_id_mes: row.comprobante_pago_id_mes ?? null,
              comprobante_pago_anio: row.comprobante_pago_anio ?? null,
            }))
          );
          setLiquidacionResumen(workerData?.resumen || null);
          setAdvertencias(Array.isArray(workerData?.advertencias) ? workerData.advertencias : []);
          setBeneficiariosNoPersona(
            Array.isArray(workerData?.beneficiarios_no_persona)
              ? workerData.beneficiarios_no_persona
              : []
          );
        } else {
          setTrabajadores([]);
          setLiquidacionResumen(null);
          setAdvertencias([]);
          setBeneficiariosNoPersona([]);
        }
      } catch (error) {
        if (!alive) return;
        setPagos([]);
        setEgresos([]);
        setTrabajadores([]);
        setMovimientosResumen(null);
        setLiquidacionResumen(null);
        setAdvertencias([]);
        setBeneficiariosNoPersona([]);
        showToast("error", `Error cargando Reportes: ${error.message}`, 4200);
      } finally {
        if (alive) setLoadingData(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [
    activeOrganizationId,
    anioSeleccionado,
    canWrite,
    fetchJSON,
    mesSeleccionado,
    postJSON,
    reloadKey,
    showToast,
    view,
  ]);

  const totalPagos = Number(
    view === "trabajadores"
      ? liquidacionResumen?.total_ingresos ?? pagos.reduce((sum, row) => sum + Number(row.monto || 0), 0)
      : movimientosResumen?.total_ingresos ?? pagos.reduce((sum, row) => sum + Number(row.monto || 0), 0)
  );
  const totalEgresos = Number(
    view === "trabajadores"
      ? liquidacionResumen?.total_egresos ?? egresos.reduce((sum, row) => sum + Number(row.monto || 0), 0)
      : movimientosResumen?.total_egresos ?? egresos.reduce((sum, row) => sum + Number(row.monto || 0), 0)
  );
  const balance = Number(movimientosResumen?.balance ?? totalPagos - totalEgresos);
  const periodoCerradoExacto = Boolean(
    anioSeleccionado !== "TODOS" &&
      mesSeleccionado !== "TODOS" &&
      (movimientosResumen?.periodo_cerrado || liquidacionResumen?.periodo_cerrado)
  );
  const totalTrabajadores = Number(
    liquidacionResumen?.total_a_pagar ??
      trabajadores.reduce((sum, row) => sum + Number(row.monto || 0), 0)
  );

  const query = searchText.trim().toLowerCase();
  const pagosFiltrados = useMemo(() => {
    if (!query) return pagos;
    return pagos.filter((row) =>
      `${row.fecha} ${row.cliente_nombre} ${row.sistema_nombre} ${row.medio} ${row.monto}`
        .toLowerCase()
        .includes(query)
    );
  }, [pagos, query]);
  const egresosFiltrados = useMemo(() => {
    if (!query) return egresos;
    return egresos.filter((row) =>
      `${row.fecha} ${row.concepto} ${row.descripcion} ${row.trabajador} ${row.medio} ${row.monto}`
        .toLowerCase()
        .includes(query)
    );
  }, [egresos, query]);
  const trabajadoresFiltrados = useMemo(() => {
    if (!query) return trabajadores;
    return trabajadores.filter((row) =>
      `${row.apellido} ${row.nombre} ${row.rol} ${row.alias_pago} ${row.porcentaje_efectivo} ${row.monto}`
        .toLowerCase()
        .includes(query)
    );
  }, [query, trabajadores]);

  const colsPagos = useMemo(
    () => [
      { key: "fecha", label: "Fecha pago", fr: "1fr", left: true },
      { key: "cliente_nombre", label: "Cliente", fr: "1.35fr", center: true },
      { key: "sistema_nombre", label: "Sistema", fr: "1.65fr", center: true },
      { key: "categoria", label: "Período", fr: "1fr", center: true },
      { key: "medio", label: "Medio", fr: "1fr", center: true },
      { key: "monto", label: "Monto", fr: "1fr", right: true, render: (row) => money(row.monto) },
    ],
    []
  );

  const colsEgresos = useMemo(
    () => [
      { key: "fecha", label: "Fecha", fr: "1fr", left: true },
      { key: "concepto", label: "Concepto", fr: "1.8fr", left: true, render: (row) => row.concepto || "—" },
      { key: "trabajador", label: "Pagado por", fr: "1.55fr", left: true, render: (row) => row.trabajador || "ENTIDAD ACTIVA" },
      { key: "medio", label: "Medio", fr: "1fr", center: true },
      { key: "monto", label: "Monto", fr: "1fr", right: true, render: (row) => money(row.monto) },
    ],
    []
  );

  const colsTrabajadores = useMemo(
    () => [
      {
        key: "trabajador",
        label: "Trabajador",
        fr: "1.4fr",
        left: true,
        render: (row) => (
          <div className="reportes-worker-name">
            <strong>{`${row.apellido || ""} ${row.nombre || ""}`.trim() || "—"}</strong>
            {row.pagado ? <span className="is-paid">PAGADO</span> : null}
            {!row.pagado && row.liquidacion_indirecta ? <span>VÍA OTRA ENTIDAD</span> : null}
          </div>
        ),
      },
      { key: "alias_pago", label: "Alias", fr: "1.05fr", center: true, render: (row) => row.alias_pago || "—" },
      {
        key: "porcentaje_efectivo",
        label: "%",
        fr: "0.6fr",
        center: true,
        render: (row) => `${nfPesos.format(row.porcentaje_efectivo)}%`,
      },
      { key: "sistemas_cobrados", label: "Sistemas", fr: "0.65fr", center: true },
      {
        key: "descuento_egresos",
        label: "Impacto egresos",
        fr: "1fr",
        right: true,
        render: (row) => (Number(row.descuento_egresos) > 0 ? `− ${money(row.descuento_egresos)}` : money(0)),
      },
      { key: "monto_reembolso", label: "Reembolso", fr: "1fr", right: true, render: (row) => money(row.monto_reembolso) },
      { key: "monto", label: "Total a pagar", fr: "1fr", right: true, render: (row) => <strong>{money(row.monto)}</strong> },
    ],
    []
  );

  const labelMes =
    mesSeleccionado === "TODOS"
      ? "Todos los meses"
      : mesesDisponibles.find((item) => String(item.id) === String(mesSeleccionado))?.mes || "—";
  const labelAnio = anioSeleccionado === "TODOS" ? "Todos los años" : `Año ${anioSeleccionado}`;
  const periodoLabel = `${labelMes} • ${labelAnio}`;

  const openViewerFromRow = useCallback(
    (row, fallbackTitle = "Comprobante") => {
      const path = String(row?.comprobante || "").trim();
      if (!path) {
        showToast("advertencia", "Este registro no tiene comprobante.", 2200);
        return;
      }
      setCompItem({
        id: row?.id,
        concepto: row?.concepto || fallbackTitle,
        fecha: row?.fecha || "",
        comprobante: path,
        url: buildFileUrl(path),
      });
      setModalVerCompOpen(true);
    },
    [buildFileUrl, showToast]
  );

  const crearEgreso = useCallback(
    async (formData) => {
      if (periodoCerradoExacto) {
        showToast("advertencia", "El período está cerrado y no admite nuevos egresos.", 3200);
        return;
      }
      try {
        setSavingEgreso(true);
        await postFormData(`${BASE_URL}/api.php?action=reportes&op=crear_egreso`, formData);
        setModalEgresoOpen(false);
        setReloadKey((value) => value + 1);
        showToast("exito", "Egreso creado correctamente.", 2800);
      } catch (error) {
        showToast("error", `Error al crear el egreso: ${error.message}`, 4000);
      } finally {
        setSavingEgreso(false);
      }
    },
    [periodoCerradoExacto, postFormData, showToast]
  );

  const confirmarEditar = useCallback(
    async (payload) => {
      if (periodoCerradoExacto) {
        showToast("advertencia", "El período está cerrado y no admite cambios contables.", 3200);
        return;
      }
      try {
        setSavingEditar(true);
        const isFormData = typeof FormData !== "undefined" && payload instanceof FormData;
        if (isFormData) {
          await postFormData(`${BASE_URL}/api.php?action=reportes&op=editar_movimiento`, payload);
        } else {
          await postJSON(`${BASE_URL}/api.php?action=reportes&op=editar_movimiento`, payload);
        }
        setModalEditarOpen(false);
        setEditarItem(null);
        setReloadKey((value) => value + 1);
        showToast("exito", "Egreso actualizado correctamente.", 2600);
      } catch (error) {
        showToast("error", `Error al editar: ${error.message}`, 4000);
      } finally {
        setSavingEditar(false);
      }
    },
    [periodoCerradoExacto, postFormData, postJSON, showToast]
  );

  const confirmarEliminarEgreso = useCallback(
    async (row) => {
      if (periodoCerradoExacto) {
        showToast("advertencia", "El período está cerrado y no admite eliminaciones.", 3200);
        return;
      }
      try {
        setDeletingEgreso(true);
        await postJSON(`${BASE_URL}/api.php?action=reportes&op=eliminar_egreso`, {
          id: row?.id ?? row?.id_egreso,
        });
        setModalEliminarOpen(false);
        setEgresoAEliminar(null);
        setReloadKey((value) => value + 1);
        showToast("exito", "Egreso eliminado correctamente.", 2600);
      } catch (error) {
        showToast("error", `Error al eliminar: ${error.message}`, 4000);
      } finally {
        setDeletingEgreso(false);
      }
    },
    [periodoCerradoExacto, postJSON, showToast]
  );

  const guardarComprobantePago = useCallback(
    async (formData) => {
      try {
        setSavingPagoComp(true);
        await postFormData(`${BASE_URL}/api.php?action=reportes&op=pago_comprobante`, formData);
        setModalPagoCompOpen(false);
        setPagoItem(null);
        setReloadKey((value) => value + 1);
        showToast("exito", "Comprobante del pago actualizado.", 2600);
      } catch (error) {
        showToast("error", `Error guardando el comprobante: ${error.message}`, 4000);
      } finally {
        setSavingPagoComp(false);
      }
    },
    [postFormData, showToast]
  );

  const abrirSubirComprobanteTrabajador = useCallback(
    (row) => {
      const periodo = getPeriodoTrabajador();
      if (!periodo) {
        showToast("advertencia", "Seleccioná un año y un mes puntual.", 2800);
        return;
      }
      if (!row?.puede_comprobante) {
        showToast(
          "advertencia",
          "Esta liquidación es indirecta y se paga mediante otra entidad.",
          3200
        );
        return;
      }
      setTrabajadorCompItem({ ...row, periodo_comprobante: periodo });
      setModalTrabCompOpen(true);
    },
    [getPeriodoTrabajador, showToast]
  );

  const guardarComprobanteTrabajador = useCallback(
    async (formData) => {
      try {
        const periodo = getPeriodoTrabajador();
        if (!periodo) throw new Error("Seleccioná un año y un mes puntual.");
        setSavingTrabComp(true);
        if (formData instanceof FormData) {
          if (!formData.has("anio")) formData.append("anio", String(periodo.anio));
          if (!formData.has("mes")) formData.append("mes", String(periodo.mes));
          if (!formData.has("id_mes")) formData.append("id_mes", String(periodo.mes));
        }
        await postFormData(
          `${BASE_URL}/api.php?action=reportes&op=trabajador_subir_comprobante`,
          formData
        );
        setModalTrabCompOpen(false);
        setTrabajadorCompItem(null);
        setReloadKey((value) => value + 1);
        showToast("exito", `Comprobante de ${periodo.label} guardado.`, 2800);
      } catch (error) {
        showToast("error", `Error guardando el comprobante: ${error.message}`, 4200);
      } finally {
        setSavingTrabComp(false);
      }
    },
    [getPeriodoTrabajador, postFormData, showToast]
  );

  const verComprobanteTrabajador = useCallback(
    async (row) => {
      try {
        const periodo = getPeriodoTrabajador();
        if (!periodo) {
          showToast("advertencia", "Seleccioná un año y un mes puntual.", 2800);
          return;
        }
        const item = { ...row, periodo_comprobante: periodo };
        setTrabajadorCompViewItem(item);
        if (row?.comprobante_pago) {
          setTrabajadorCompViewData({
            archivo_url: row.comprobante_pago,
            archivo_nombre: row.comprobante_pago_nombre,
            archivo_tipo: row.comprobante_pago_tipo,
            created_at: row.comprobante_pago_fecha,
            id_mes: row.comprobante_pago_id_mes,
            anio: row.comprobante_pago_anio,
          });
          setModalVerTrabCompOpen(true);
          return;
        }
        const data = await fetchJSON(
          `${BASE_URL}/api.php?action=reportes&op=trabajador_comprobante_latest&id=${encodeURIComponent(
            row.id
          )}&anio=${periodo.anio}&mes=${periodo.mes}`
        );
        if (!data?.data) {
          showToast("advertencia", `No hay comprobante para ${periodo.label}.`, 2600);
          return;
        }
        setTrabajadorCompViewData(data.data);
        setModalVerTrabCompOpen(true);
      } catch (error) {
        showToast("error", `Error consultando el comprobante: ${error.message}`, 4000);
      }
    },
    [fetchJSON, getPeriodoTrabajador, showToast]
  );

  const marcarTrabajadorPagado = useCallback(
    (row) => {
      const periodo = getPeriodoTrabajador();
      if (!periodo) {
        showToast("advertencia", "Seleccioná un año y un mes puntual.", 2800);
        return;
      }
      if (!row?.puede_marcar_pagado || row?.pagado) return;

      setPagoTrabajadorPendiente({ row, periodo });
      setModalConfirmarPagoOpen(true);
    },
    [getPeriodoTrabajador, showToast]
  );

  const confirmarPagoTrabajador = useCallback(async () => {
    const row = pagoTrabajadorPendiente?.row;
    const periodo = pagoTrabajadorPendiente?.periodo;
    if (!row || !periodo || markingPaidId !== null) return;

    const trabajadorId = Number(row.id_trabajador || row.id);
    const nombre = `${row.apellido || ""} ${row.nombre || ""}`.trim() || "el trabajador";

    try {
      setMarkingPaidId(trabajadorId);
      await postJSON(`${BASE_URL}/api.php?action=reportes&op=trabajador_marcar_pagado`, {
        id_trabajador: trabajadorId,
        id_mes: periodo.mes,
        mes: periodo.mes,
        anio: periodo.anio,
      });
      setModalConfirmarPagoOpen(false);
      setPagoTrabajadorPendiente(null);
      setReloadKey((value) => value + 1);
      showToast("exito", `Liquidación de ${nombre} marcada como pagada.`, 3000);
    } catch (error) {
      showToast("error", `Error marcando la liquidación: ${error.message}`, 4200);
    } finally {
      setMarkingPaidId(null);
    }
  }, [markingPaidId, pagoTrabajadorPendiente, postJSON, showToast]);

  const exportarExcel = useCallback(() => {
    try {
      const workbook = XLSX.utils.book_new();
      const orgCode = String(activeOrganization?.codigo || activeOrganization?.nombre || "ENTIDAD")
        .replace(/\s+/g, "_")
        .toUpperCase();
      const filePeriod = `${anioSeleccionado}_${String(labelMes).replace(/\s+/g, "_")}`;

      if (view === "trabajadores") {
        const workerRows = trabajadoresFiltrados.map((row) => ({
          TRABAJADOR: `${row.apellido || ""} ${row.nombre || ""}`.trim(),
          ALIAS: row.alias_pago,
          PORCENTAJE: row.porcentaje_efectivo,
          SISTEMAS_COBRADOS: row.sistemas_cobrados,
          IMPACTO_EGRESOS: row.descuento_egresos,
          NETO_POR_SISTEMAS: row.monto_sistemas,
          REEMBOLSO: row.monto_reembolso,
          TOTAL_A_PAGAR: row.monto,
          ESTADO: row.pagado ? "PAGADO" : "PENDIENTE",
          FECHA_PAGO_LIQUIDACION: row.pagado_at || "",
          LIQUIDACION_INDIRECTA: row.liquidacion_indirecta ? "SI" : "NO",
        }));
        const sheet = XLSX.utils.json_to_sheet(workerRows);
        sheet["!cols"] = [
          { wch: 28 }, { wch: 22 }, { wch: 14 }, { wch: 18 }, { wch: 18 },
          { wch: 20 }, { wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 22 }, { wch: 22 },
        ];
        XLSX.utils.book_append_sheet(workbook, sheet, "Liquidación");

        const detailRows = trabajadoresFiltrados.flatMap((worker) =>
          (worker.detalle || []).map((detail) => ({
            TRABAJADOR: `${worker.apellido || ""} ${worker.nombre || ""}`.trim(),
            FECHA_PAGO: detail.fecha_pago,
            PERIODO: `${detail.id_mes || ""}/${detail.anio || ""}`,
            CLIENTE: detail.cliente_nombre,
            SISTEMA: detail.sistema_nombre,
            MONTO_PAGO: detail.monto_pago,
            PORCENTAJE: detail.porcentaje_pago,
            PARTE_BRUTA: detail.monto_bruto,
            PARTE_NETA: detail.monto_neto,
            RUTA: Array.isArray(detail.rutas) ? detail.rutas.join(" > ") : "",
          }))
        );
        if (detailRows.length) {
          XLSX.utils.book_append_sheet(
            workbook,
            XLSX.utils.json_to_sheet(detailRows),
            "Detalle por pago"
          );
        }
      } else if (view === "egresos") {
        XLSX.utils.book_append_sheet(
          workbook,
          XLSX.utils.json_to_sheet(
            egresosFiltrados.map((row) => ({
              FECHA: row.fecha,
              CONCEPTO: row.concepto,
              DESCRIPCION: row.descripcion,
              TIPO: row.tipo_egreso,
              PAGADO_POR: row.trabajador || "ENTIDAD ACTIVA",
              MEDIO: row.medio,
              MONTO: row.monto,
              COMPROBANTE: row.comprobante,
            }))
          ),
          "Egresos"
        );
      } else {
        XLSX.utils.book_append_sheet(
          workbook,
          XLSX.utils.json_to_sheet(
            pagosFiltrados.map((row) => ({
              FECHA_PAGO: row.fecha,
              ANIO_PERIODO: row.anio_periodo,
              MES_PERIODO: row.categoria,
              CLIENTE: row.cliente_nombre,
              SISTEMA: row.sistema_nombre,
              MEDIO: row.medio,
              MONTO: row.monto,
              COMPROBANTE: row.comprobante,
              FACTURA_PDF: row.factura_pdf,
            }))
          ),
          "Ingresos"
        );
      }

      XLSX.writeFile(workbook, `reportes_${orgCode}_${view}_${filePeriod}.xlsx`);
      showToast("exito", "Excel generado correctamente.", 2200);
    } catch (error) {
      showToast("error", `No se pudo exportar el Excel: ${error.message}`, 3800);
    }
  }, [
    activeOrganization,
    anioSeleccionado,
    egresosFiltrados,
    labelMes,
    pagosFiltrados,
    showToast,
    trabajadoresFiltrados,
    view,
  ]);

  const disableFilters = loadingAnios || loadingMeses;
  const exactWorkerPeriod = Boolean(getPeriodoTrabajador());

  return (
    <div className="contable-viewport reportes-viewport" onChangeCapture={uppercaseTextFieldOnChange}>
      {toast.show ? (
        <Toast
          key={toast.key}
          tipo={toast.tipo}
          mensaje={toast.mensaje}
          duracion={toast.duracion}
          onClose={closeToast}
        />
      ) : null}

      <header className="contable-topbar reportes-header">
        <h1 className="contable-topbar-title">
          <FontAwesomeIcon icon={faCoins} /> Reportes
        </h1>

        <div className="reportes-organization-tabs" role="tablist" aria-label="Entidad del reporte">
          {organizations.map((organization) => {
            const id = Number(organization?.id_organizacion || 0);
            const active = id === activeOrganizationId;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                className={`reportes-organization-tab ${active ? "is-active" : ""}`}
                onClick={() => changeOrganization(organization)}
              >
                <FontAwesomeIcon icon={faBuilding} />
                {String(organization?.codigo || organization?.nombre || `Entidad ${id}`).toUpperCase()}
              </button>
            );
          })}
        </div>

        <button className="contable-back-button" onClick={() => navigate(-1)} aria-label="Volver">
          <FontAwesomeIcon icon={faArrowLeft} /> Volver
        </button>
      </header>

      <div className="contable-grid reportes-grid">
        <aside className="contable-sidebar reportes-filterbar">
          <h3 className="side-block-title" style={{ marginTop: 0 }}>
            <FontAwesomeIcon icon={faCalendarAlt} /> Filtros
          </h3>
          <section className="side-block">
            <label className="side-field">
              <span>Año {loadingAnios ? "(cargando…)" : ""}</span>
              <select
                value={anioSeleccionado}
                onChange={(event) => setAnioSeleccionado(event.target.value)}
                disabled={loadingAnios || !aniosDisponibles.length}
              >
                {aniosDisponibles.map((year) => (
                  <option value={year} key={year}>
                    {year === "TODOS" ? "Todos los años" : year}
                  </option>
                ))}
              </select>
            </label>

            <label className="side-field">
              <span>Mes del período</span>
              <select
                value={mesSeleccionado}
                onChange={(event) => setMesSeleccionado(event.target.value)}
                disabled={loadingMeses || !mesesDisponibles.length}
              >
                <option value="TODOS">Todos los meses</option>
                {mesesDisponibles.map((month) => (
                  <option value={month.id} key={month.id}>
                    {String(month.mes || "").toUpperCase()}
                  </option>
                ))}
              </select>
            </label>

            <div className="reportes-active-entity">
              <span>Entidad activa</span>
              <strong>{String(activeOrganization?.nombre || activeOrganization?.codigo || "—")}</strong>
              <small>Rol: {activeRole.toUpperCase()}</small>
            </div>

            <div className="side-actions">
              <button className="btn-dark excel" type="button" onClick={exportarExcel} disabled={disableFilters}>
                <FontAwesomeIcon icon={faFileExcel} /> Excel
              </button>
              <button className="btn-dark" type="button" onClick={() => setModalGraficosOpen(true)} disabled={disableFilters}>
                <FontAwesomeIcon icon={faChartLine} /> Gráficos
              </button>
            </div>

          </section>
        </aside>

        <main className="contable-main reportes-main-island">
          <div className="main-switch" role="tablist" aria-label="Vista del reporte">
            <div className="switch-left">
              <button
                type="button"
                role="tab"
                aria-selected={view === "pagos"}
                className={`segmented ${view === "pagos" ? "is-active" : ""}`}
                onClick={() => setView("pagos")}
              >
                <FontAwesomeIcon icon={faMoneyBillTrendUp} /> Ingresos
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
                <FontAwesomeIcon icon={faUsers} /> Liquidación
              </button>
              {view === "egresos" && canWrite ? (
                <button
                  type="button"
                  className={`segmented reportes-new-expense ${periodoCerradoExacto ? "disabled" : ""}`}
                  title={periodoCerradoExacto ? "El período está cerrado" : "Nuevo egreso"}
                  disabled={periodoCerradoExacto}
                  onClick={() => setModalEgresoOpen(true)}
                >
                  <FontAwesomeIcon icon={faPlus} /> Nuevo egreso
                </button>
              ) : null}
            </div>

            <div className="switch-right">
              <div className="searchbox">
                <FontAwesomeIcon icon={faSearch} />
                <input
                  type="text"
                  placeholder="Buscar…"
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  disabled={disableFilters}
                />
              </div>
            </div>
          </div>

          <div className="reportes-summary-grid">
            <article className="reportes-summary-card is-income">
              <span><FontAwesomeIcon icon={faMoneyBillTrendUp} /> Total ingresos</span>
              <strong>{money(totalPagos)}</strong>
              <small>{periodoLabel}</small>
            </article>
            <article className="reportes-summary-card is-expense">
              <span><FontAwesomeIcon icon={faMoneyBillTransfer} /> Total egresos</span>
              <strong>{money(totalEgresos)}</strong>
              <small>{periodoLabel}</small>
            </article>
            <article className={`reportes-summary-card ${view === "trabajadores" ? "info" : balance < 0 ? "danger" : "success"}`}>
              <span>{view === "trabajadores" ? "Total a pagar" : "Balance operativo"}</span>
              <strong>{money(view === "trabajadores" ? totalTrabajadores : balance)}</strong>
              <small>{view === "trabajadores" ? periodoLabel : balance < 0 ? "Déficit" : "Superávit"}</small>
            </article>
          </div>

          {periodoCerradoExacto ? (
            <div className="reportes-warning-panel">
              <div className="reportes-warning-title">
                <FontAwesomeIcon icon={faCircleCheck} /> Período cerrado
              </div>
              <p>La liquidación ya comenzó. Los ingresos, egresos, pagadores y montos están congelados.</p>
            </div>
          ) : null}

          {view === "trabajadores" ? (
            <>
              {advertencias.length || beneficiariosNoPersona.length || Number(liquidacionResumen?.liquidaciones_pagadas || 0) > 0 ? (
                <div className="reportes-warning-panel">
                  <div className="reportes-warning-title">
                    <FontAwesomeIcon icon={faTriangleExclamation} /> Controles de liquidación
                  </div>
                  {advertencias.map((warning, index) => <p key={`warning-${index}`}>{warning}</p>)}
                  {Number(liquidacionResumen?.liquidaciones_pagadas || 0) > 0 ? (
                    <p>
                      {Number(liquidacionResumen?.liquidaciones_pagadas || 0)} liquidación(es) pagada(s) usan el monto histórico congelado.
                    </p>
                  ) : null}
                  {beneficiariosNoPersona.map((item, index) => (
                    <p key={`beneficiary-${index}`}>
                      {item.beneficiario || "Entidad sin trabajador final"}: {money(item.monto_neto)} pendiente de pago mediante su entidad.
                    </p>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}

          <div className="reportes-table-area">
            {view === "pagos" ? (
              <GridTable
                title="Ingresos"
                columns={colsPagos}
                rows={pagosFiltrados}
                loading={loadingData}
                actions={(row) => (
                  <div className="actions-cell">
                    <button
                      type="button"
                      className={`icon-btn ${row.comprobante ? "" : "disabled"}`}
                      title={row.comprobante ? "Ver comprobante" : "Sin comprobante"}
                      disabled={!row.comprobante}
                      onClick={() => openViewerFromRow(row, "Comprobante de pago")}
                    >
                      <FontAwesomeIcon icon={faEye} />
                    </button>
                    {canWrite ? (
                      <button
                        type="button"
                        className="icon-btn"
                        title="Adjuntar comprobante"
                        onClick={() => {
                          setPagoItem(row);
                          setModalPagoCompOpen(true);
                        }}
                      >
                        <FontAwesomeIcon icon={faPaperclip} />
                      </button>
                    ) : null}
                  </div>
                )}
              />
            ) : null}

            {view === "egresos" ? (
              <GridTable
                title="Egresos"
                columns={colsEgresos}
                rows={egresosFiltrados}
                loading={loadingData}
                actions={(row) => (
                  <div className="actions-cell">
                    <button
                      type="button"
                      className={`icon-btn ${row.comprobante ? "" : "disabled"}`}
                      title={row.comprobante ? "Ver comprobante" : "Sin comprobante"}
                      disabled={!row.comprobante}
                      onClick={() => openViewerFromRow(row)}
                    >
                      <FontAwesomeIcon icon={faEye} />
                    </button>
                    {canWrite ? (
                      <>
                        <button
                          type="button"
                          className={`icon-btn ${periodoCerradoExacto ? "disabled" : ""}`}
                          title={periodoCerradoExacto ? "Período cerrado" : "Editar egreso"}
                          disabled={periodoCerradoExacto}
                          onClick={() => {
                            setEditarItem({ ...row, id: row.id ?? row.id_egreso });
                            setModalEditarOpen(true);
                          }}
                        >
                          <FontAwesomeIcon icon={faPenToSquare} />
                        </button>
                        <button
                          type="button"
                          className={`icon-btn danger ${periodoCerradoExacto ? "disabled" : ""}`}
                          title={periodoCerradoExacto ? "Período cerrado" : "Eliminar egreso"}
                          disabled={periodoCerradoExacto}
                          onClick={() => {
                            setEgresoAEliminar(row);
                            setModalEliminarOpen(true);
                          }}
                        >
                          <FontAwesomeIcon icon={faTrash} />
                        </button>
                      </>
                    ) : null}
                  </div>
                )}
              />
            ) : null}

            {view === "trabajadores" ? (
              <GridTable
                title="Liquidación"
                columns={colsTrabajadores}
                rows={trabajadoresFiltrados}
                loading={loadingData}
                actions={(row) => {
                  const hasProof = exactWorkerPeriod && Boolean(String(row.comprobante_pago || "").trim());
                  const canUpload = canWrite && exactWorkerPeriod && row.puede_comprobante;
                  return (
                    <div className="actions-cell">
                      <button
                        type="button"
                        className="icon-btn"
                        title="Ver cálculo detallado"
                        onClick={() => {
                          setDetalleTrabajador(row);
                          setModalDetalleOpen(true);
                        }}
                      >
                        <FontAwesomeIcon icon={faCircleInfo} />
                      </button>
                      {canWrite ? (
                        <button
                          type="button"
                          className={`icon-btn ${row.pagado ? "is-paid" : row.puede_marcar_pagado && exactWorkerPeriod ? "" : "disabled"}`}
                          title={
                            row.pagado
                              ? `Pagado${row.pagado_at ? ` el ${row.pagado_at}` : ""}`
                              : !exactWorkerPeriod
                              ? "Seleccioná año y mes puntual"
                              : row.puede_marcar_pagado
                              ? "Marcar liquidación como pagada"
                              : "La liquidación se paga desde otra entidad"
                          }
                          disabled={
                            row.pagado ||
                            !exactWorkerPeriod ||
                            !row.puede_marcar_pagado ||
                            Number(markingPaidId) === Number(row.id_trabajador || row.id)
                          }
                          onClick={() => marcarTrabajadorPagado(row)}
                        >
                          <FontAwesomeIcon icon={faCircleCheck} />
                        </button>
                      ) : null}
                      {canWrite ? (
                        <button
                          type="button"
                          className={`icon-btn ${canUpload ? "" : "disabled"}`}
                          title={
                            !exactWorkerPeriod
                              ? "Seleccioná año y mes puntual"
                              : row.puede_comprobante
                              ? "Subir comprobante de pago"
                              : "Liquidación indirecta: se paga mediante otra entidad"
                          }
                          disabled={!canUpload}
                          onClick={() => abrirSubirComprobanteTrabajador(row)}
                        >
                          <FontAwesomeIcon icon={faPaperclip} />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className={`icon-btn ${hasProof ? "" : "disabled"}`}
                        title={hasProof ? "Ver comprobante" : "Sin comprobante para el período"}
                        disabled={!hasProof}
                        onClick={() => verComprobanteTrabajador(row)}
                      >
                        <FontAwesomeIcon icon={faEye} />
                      </button>
                    </div>
                  );
                }}
              />
            ) : null}
          </div>
        </main>
      </div>

      <ModalNuevoEgreso
        open={modalEgresoOpen}
        onClose={() => !savingEgreso && setModalEgresoOpen(false)}
        onConfirm={crearEgreso}
        loading={savingEgreso}
        medios={mediosDisponibles}
        trabajadores={trabajadoresActivos}
        organizacionesPagadoras={organizacionesPagadoras}
      />
      <ModalEditarMovimiento
        open={modalEditarOpen}
        onClose={() => {
          if (savingEditar) return;
          setModalEditarOpen(false);
          setEditarItem(null);
        }}
        onConfirm={confirmarEditar}
        loading={savingEditar}
        tipo="egreso"
        item={editarItem}
        medios={mediosDisponibles}
        buildFileUrl={buildFileUrl}
        trabajadores={trabajadoresActivos}
        organizacionesPagadoras={organizacionesPagadoras}
        onVerComprobante={(path) => {
          const value = String(path || "").trim();
          if (!value) return;
          setCompItem({
            id: editarItem?.id,
            concepto: editarItem?.concepto || "Comprobante",
            fecha: editarItem?.fecha || "",
            comprobante: value,
            url: buildFileUrl(value),
          });
          setModalVerCompOpen(true);
        }}
      />
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
      <ModalComprobantePago
        open={modalPagoCompOpen}
        onClose={() => {
          if (savingPagoComp) return;
          setModalPagoCompOpen(false);
          setPagoItem(null);
        }}
        onConfirm={guardarComprobantePago}
        loading={savingPagoComp}
        item={pagoItem}
        buildFileUrl={buildFileUrl}
      />
      <ModalSubirComprobanteTrabajador
        open={modalTrabCompOpen}
        trabajador={trabajadorCompItem}
        periodo={trabajadorCompItem?.periodo_comprobante || getPeriodoTrabajador()}
        loading={savingTrabComp}
        showToast={showToast}
        onClose={() => {
          if (savingTrabComp) return;
          setModalTrabCompOpen(false);
          setTrabajadorCompItem(null);
        }}
        onConfirm={guardarComprobanteTrabajador}
      />
      <ModalVerComprobanteTrabajador
        open={modalVerTrabCompOpen}
        trabajador={trabajadorCompViewItem}
        comprobante={trabajadorCompViewData}
        periodo={trabajadorCompViewItem?.periodo_comprobante || getPeriodoTrabajador()}
        onClose={() => {
          setModalVerTrabCompOpen(false);
          setTrabajadorCompViewItem(null);
          setTrabajadorCompViewData(null);
        }}
      />
      <ModalConfirmarPagoTrabajador
        open={modalConfirmarPagoOpen}
        trabajador={pagoTrabajadorPendiente?.row || null}
        periodo={pagoTrabajadorPendiente?.periodo || null}
        loading={markingPaidId !== null}
        onClose={() => {
          if (markingPaidId !== null) return;
          setModalConfirmarPagoOpen(false);
          setPagoTrabajadorPendiente(null);
        }}
        onConfirm={confirmarPagoTrabajador}
      />
      <ModalDetalleLiquidacionTrabajador
        open={modalDetalleOpen}
        trabajador={detalleTrabajador}
        organizacion={activeOrganization}
        periodo={periodoLabel}
        onClose={() => {
          setModalDetalleOpen(false);
          setDetalleTrabajador(null);
        }}
      />
      <ModalGraficosReportes
        open={modalGraficosOpen}
        onClose={() => setModalGraficosOpen(false)}
        fetchJSON={fetchJSON}
        baseUrl={BASE_URL}
        anioSeleccionado={anioSeleccionado}
        mesesDisponibles={mesesDisponibles}
        showToast={showToast}
      />
    </div>
  );
}
