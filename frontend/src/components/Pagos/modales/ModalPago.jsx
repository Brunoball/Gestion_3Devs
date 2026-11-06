// src/components/Pagos/modales/ModalPago.jsx
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import {
  FaCoins, FaTimes, FaCheck, FaEye, FaBan,
  FaExclamationTriangle, FaCheckCircle,
} from "react-icons/fa";
import BASE_URL from "../../../config/config";
import { fetchJSONAuth } from "../../Global/api";

import "../../Trabajadores/modales/ModalEditarTrabajador.css";
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
  // "135.000" / "1.250.000" sin coma → puntos de miles (formato argentino)
  if (!cleaned.includes(",") && /^\d{1,3}(\.\d{3})+$/.test(cleaned)) {
    const n = Number(cleaned.replace(/\./g, ""));
    return Number.isFinite(n) ? n : 0;
  }
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

function formatDateSlash(value) {
  if (value == null) return "—";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const dd = String(value.getDate()).padStart(2, "0");
    const mm = String(value.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}/${value.getFullYear()}`;
  }
  const s0 = String(value).trim();
  if (!s0) return "—";
  const s = s0.replace(/\./g, "/").replace(/-/g, "/");
  const m1 = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (m1) return `${String(m1[3]).padStart(2,"0")}/${String(m1[2]).padStart(2,"0")}/${m1[1]}`;
  const m2 = s0.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m2) return `${m2[3]}/${m2[2]}/${m2[1]}`;
  const m3 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m3) return `${String(m3[1]).padStart(2,"0")}/${String(m3[2]).padStart(2,"0")}/${m3[3]}`;
  const t = Date.parse(s0);
  if (!Number.isNaN(t)) {
    const d = new Date(t);
    if (!Number.isNaN(d.getTime())) return formatDateSlash(d);
  }
  return s0;
}

/* =========================
   ✅ Calcula monto por sistema desde items_facturacion_json

   Modo "global":
     { modo:"global", ars: TOTAL, sistemas_ids: [id1, id2, ...] }
     → el total se divide en centavos exactos entre los sistemas

   Modo "por_sistema":
     { modo:"por_sistema", ars: N, sistema_id: idX }
     → ese sistema recibe ars (todo el item es solo para él)

   Retorna: { [id_sistema]: monto_acumulado }
========================= */
function calcularMontoPorSistema(itemsJson) {
  let items = [];
  if (typeof itemsJson === "string") {
    try { items = JSON.parse(itemsJson); } catch { items = []; }
  } else if (Array.isArray(itemsJson)) {
    items = itemsJson;
  }
  if (!items.length) return {};

  const mapaMontos = {};

  for (const it of items) {
    const modo     = it?.modo || "global";
    const arsItem  = Number(it?.ars ?? 0);
    const arsUnit  = Number(it?.ars_unit ?? 0);

    if (modo === "por_sistema") {
      const sid = Number(it?.sistema_id ?? it?.id_sistema ?? 0);
      if (sid > 0) {
        mapaMontos[sid] = (mapaMontos[sid] || 0) + arsItem;
      }
    } else {
      // global: divide el total del item en centavos exactos entre los sistemas.
      const sids = Array.from(new Set(
        (Array.isArray(it?.sistemas_ids) ? it.sistemas_ids : [])
          .map((sid) => Number(sid))
          .filter((sid) => sid > 0)
      ));
      if (sids.length > 0 && arsItem > 0) {
        const totalCentavos = Math.round(arsItem * 100);
        const base = Math.floor(totalCentavos / sids.length);
        const resto = totalCentavos - base * sids.length;
        sids.forEach((id, index) => {
          const centavos = base + (index < resto ? 1 : 0);
          mapaMontos[id] = (mapaMontos[id] || 0) + centavos / 100;
        });
      } else if (sids.length > 0 && arsUnit > 0) {
        // Compatibilidad defensiva con items antiguos sin total `ars`.
        sids.forEach((id) => {
          mapaMontos[id] = (mapaMontos[id] || 0) + arsUnit;
        });
      }
    }
  }

  return mapaMontos;
}

/* =========================
   ModalPago
========================= */
export default function ModalPago({
  id_sistema,
  cerrarModal,
  onPagoRealizado,
  onSolicitarAnulacionFactura,
  anioSeleccionado,
  mesSeleccionado,
  idMesSeleccionado,
  aniosDisponibles = [],
  idOrganizacion,
}) {
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState("");
  const [detalle, setDetalle]           = useState(null);
  const [mediosPago, setMediosPago]     = useState([]);
  const [idMedioPago, setIdMedioPago]   = useState("");
  const [factura, setFactura]           = useState(null);
  const [pago, setPago]                 = useState(null);
  const [monto, setMonto]               = useState("");
  const [fechaPago, setFechaPago]       = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  });
  const [pagoExitoso, setPagoExitoso]   = useState(false);
  const [registrando, setRegistrando] = useState(false);
  const registrandoRef = useRef(false);
  // ✅ Mapa { [id_sistema]: nombre } para mostrar en el desglose
  const [sistemasNombres, setSistemasNombres] = useState({});
  // ✅ Pago SIN factura (ej. Balto): sistemas del cliente + montos editables + confirmación
  const [sistemasCliente, setSistemasCliente] = useState([]);
  const [montosSinFactura, setMontosSinFactura] = useState({});
  const [confirmaSinFactura, setConfirmaSinFactura] = useState(false);
  const [facturaAnulada, setFacturaAnulada] = useState(null);
  const [pagoSinFacturaOk, setPagoSinFacturaOk] = useState(false);
  // Texto del "Monto total" mientras se edita (null = mostrar la suma formateada)
  const [totalEditando, setTotalEditando] = useState(null);
  // Proporciones entre sistemas tomadas al empezar a editar el total
  const proporcionesRef = useRef(null);

  const API        = useMemo(() => `${BASE_URL}/api.php`, []);
  const LISTAS_API = useMemo(() => `${API}?action=listas`, [API]);

  const fetchJSON = useCallback(
    (url, opts = {}) => fetchJSONAuth(url, opts, idOrganizacion),
    [idOrganizacion]
  );

  const normalizarMedios = useCallback((data) => {
    const raw = data?.listas?.medios_pago || data?.medios_pago || data?.mediosPago || [];
    return (Array.isArray(raw) ? raw : [])
      .map((x) => ({
        id_medio_pago: Number(x?.id_medio_pago ?? x?.id ?? null),
        nombre: String(x?.nombre ?? x?.Medio_Pago ?? x?.medio_pago ?? "").trim(),
      }))
      .filter((x) => Number.isFinite(x.id_medio_pago) && x.nombre)
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, []);

  // Mes/año que vienen del filtro de la pantalla (valor inicial del período).
  const idMesInicial = useMemo(() => {
    const byId = Number(idMesSeleccionado);
    if (Number.isInteger(byId) && byId >= 1 && byId <= 12) return byId;
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
      ENERO:1,FEBRERO:2,MARZO:3,ABRIL:4,MAYO:5,JUNIO:6,
      JULIO:7,AGOSTO:8,SEPTIEMBRE:9,SETIEMBRE:9,
      OCTUBRE:10,NOVIEMBRE:11,DICIEMBRE:12,
    };
    return map[String(s).toUpperCase()] || 0;
  }, [mesSeleccionado, idMesSeleccionado]);

  const anioInicial = useMemo(() => {
    const n = Number(anioSeleccionado);
    return Number.isFinite(n) && n >= 2000 && n <= 2100 ? n : 0;
  }, [anioSeleccionado]);

  // ✅ Período APLICADO del pago: editable dentro del modal.
  //    Permite, por ejemplo, registrar ENERO 2027 estando parado en NOV 2026.
  const [anio, setAnio] = useState(anioInicial);
  const [idMes, setIdMes] = useState(idMesInicial);

  useEffect(() => { setAnio(anioInicial); }, [anioInicial]);
  useEffect(() => { setIdMes(idMesInicial); }, [idMesInicial]);

  const opcionesAnio = useMemo(() => {
    const actual = new Date().getFullYear();
    const set = new Set([actual - 1, actual, actual + 1]);
    (Array.isArray(aniosDisponibles) ? aniosDisponibles : []).forEach((y) => {
      const n = parseInt(y, 10);
      if (Number.isFinite(n) && n >= 2000 && n <= 2100) set.add(n);
    });
    if (anioInicial) set.add(anioInicial);
    if (anio) set.add(anio);
    return Array.from(set).sort((a, b) => b - a);
  }, [aniosDisponibles, anioInicial, anio]);

  const opcionesMes = useMemo(
    () => Array.from({ length: 12 }, (_, i) => ({ id: i + 1, nombre: getMonthNameEs(i + 1) })),
    []
  );

  const periodoCambiado = Boolean(
    anioInicial && idMesInicial && (anio !== anioInicial || idMes !== idMesInicial)
  );

  const periodoLabel = useMemo(() => {
    const mn = getMonthNameEs(idMes);
    if (!mn || !anio) return "Período no definido";
    return `${mn} ${anio}`;
  }, [idMes, anio]);

  // ✅ Mapa de montos por sistema calculado desde items_facturacion_json
  const montoPorSistema = useMemo(() => {
    const items = factura?.items_facturacion_json ?? factura?.items_facturacion ?? null;
    if (!items) return {};
    return calcularMontoPorSistema(items);
  }, [factura]);

  // ✅ Lista final: sistemas con monto + nombre para mostrar en UI y enviar al backend
  const sistemasConMonto = useMemo(() => {
    return Object.entries(montoPorSistema)
      .map(([sid, mnt]) => ({
        id_sistema: Number(sid),
        monto: Math.round(Number(mnt) * 100) / 100,
        nombre: sistemasNombres[Number(sid)] || `Sistema ${sid}`,
      }))
      .filter((x) => x.id_sistema > 0 && x.monto > 0);
  }, [montoPorSistema, sistemasNombres]);

  const tieneDesglose = useMemo(() => sistemasConMonto.length > 0, [sistemasConMonto]);
  const totalDesglose = useMemo(
    () => Math.round(sistemasConMonto.reduce((sum, item) => sum + Number(item.monto || 0), 0) * 100) / 100,
    [sistemasConMonto]
  );

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && !registrando) cerrarModal?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [cerrarModal, registrando]);

  // Cargar medios de pago
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const dataListas = await fetchJSON(LISTAS_API, { method: "GET" });
        if (!alive) return;
        const mp = normalizarMedios(dataListas);
        setMediosPago(mp);
        if (!idMedioPago && mp.length) setIdMedioPago(String(mp[0].id_medio_pago));
      } catch {
        if (!alive) return;
        setMediosPago([]);
      }
    })();
    return () => { alive = false; };
  }, [LISTAS_API, fetchJSON, normalizarMedios, idMedioPago]);

  // Cargar detalle período + nombres de sistemas del cliente
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError("");
      setPagoExitoso(false);
      setFactura(null);
      setPago(null);
      // No se limpia `detalle` (cliente/sistema no dependen del período): así,
      // si falla la carga de un período, los selectores siguen visibles.
      setMonto("");
      setSistemasNombres({});
      setSistemasCliente([]);
      setMontosSinFactura({});
      setConfirmaSinFactura(false);
      setFacturaAnulada(null);
      setPagoSinFacturaOk(false);
      setTotalEditando(null);

      try {
        if (!id_sistema) throw new Error("Falta id_sistema");
        if (!anio) throw new Error("Falta año seleccionado");
        if (!idMes) throw new Error("Falta mes seleccionado");

        // 1) Detalle período (pago + factura con items_facturacion_json parseado)
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
        setFacturaAnulada(data?.factura_anulada || null);

        const m1 = Number(data?.factura?.total_ars);
        const m2 = Number(data?.factura?.monto_ars);
        const m3 = Number(data?.pago?.monto);
        const finalMonto =
          Number.isFinite(m1) && m1 > 0 ? m1 :
          Number.isFinite(m2) && m2 > 0 ? m2 :
          Number.isFinite(m3) && m3 > 0 ? m3 : 0;

        setMonto(finalMonto ? String(finalMonto) : "");
        if (data?.pago?.id_medio_pago) setIdMedioPago(String(data.pago.id_medio_pago));
        if (data?.pago?.fecha_pago)    setFechaPago(String(data.pago.fecha_pago).slice(0, 10));

        // 2) ✅ Cargar nombres de sistemas del cliente para mostrar en el desglose
        try {
          const sisteData = await fetchJSON(`${API}?action=pagos&op=cliente_sistemas`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id_sistema: Number(id_sistema), anio: Number(anio), id_mes: Number(idMes) }),
          });
          if (!alive) return;
          if (Array.isArray(sisteData?.sistemas)) {
            const mapa = {};
            for (const s of sisteData.sistemas) {
              if (s?.id_sistema) mapa[Number(s.id_sistema)] = String(s.nombre || `Sistema ${s.id_sistema}`);
            }
            setSistemasNombres(mapa);
            setSistemasCliente(sisteData.sistemas);

            // Prellenar montos sugeridos (monto mensual o plan) para pago sin factura
            const iniciales = {};
            for (const s of sisteData.sistemas) {
              const sid = Number(s?.id_sistema);
              const sug = Number(s?.monto_sugerido ?? 0);
              if (sid > 0 && Number.isFinite(sug) && sug > 0) {
                iniciales[sid] = String(sug).replace(".", ",");
              }
            }
            setMontosSinFactura(iniciales);
          }
        } catch {
          // No crítico: el desglose muestra IDs si falla
        }

      } catch (e) {
        if (!alive) return;
        setError(e?.message || "Error al obtener el detalle del período.");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [API, fetchJSON, id_sistema, anio, idMes]);

  const tituloCliente = useMemo(() => {
    const c = detalle?.cliente?.nombre || detalle?.cliente_nombre || detalle?.cliente;
    const s = detalle?.sistema?.nombre || detalle?.sistema_nombre || detalle?.sistema || detalle?.nombre_sistema || detalle?.nombre;
    if (c && s) return `${c} • ${s}`;
    return s || c || "Registro de Pago";
  }, [detalle]);

  const pdfUrl = useMemo(() => {
    const p = factura?.pdf_path || factura?.pdf_url || null;
    return p ? String(p) : null;
  }, [factura]);

  const sinFactura = useMemo(() => {
    const hasId    = factura?.id_factura != null || factura?.cbte_nro != null || factura?.cae != null;
    const hasPdf   = Boolean(pdfUrl);
    const hasMonto =
      (Number.isFinite(Number(factura?.total_ars)) && Number(factura?.total_ars) > 0) ||
      (Number.isFinite(Number(factura?.monto_ars)) && Number(factura?.monto_ars) > 0);
    return !hasId && !hasPdf && !hasMonto;
  }, [factura, pdfUrl]);

  // ✅ Sistemas a cobrar SIN factura: los que corresponden al período y todavía no están pagos.
  const sistemasSinFactura = useMemo(() => {
    const list = (Array.isArray(sistemasCliente) ? sistemasCliente : [])
      .filter((s) => Number(s?.aplica_periodo ?? s?.activo ?? 0) === 1 && Number(s?.pagado_periodo ?? 0) !== 1)
      .map((s) => ({ id_sistema: Number(s.id_sistema), nombre: String(s.nombre || `Sistema ${s.id_sistema}`) }))
      .filter((s) => s.id_sistema > 0);
    if (list.length) return list;
    const sid = Number(id_sistema);
    return sid > 0 ? [{ id_sistema: sid, nombre: sistemasNombres[sid] || detalle?.sistema_nombre || `Sistema ${sid}` }] : [];
  }, [sistemasCliente, id_sistema, sistemasNombres, detalle]);

  const desgloseSinFactura = useMemo(
    () => sistemasSinFactura.map((s) => ({
      ...s,
      monto: Math.round(parseMoneyInput(montosSinFactura[s.id_sistema]) * 100) / 100,
    })),
    [sistemasSinFactura, montosSinFactura]
  );
  const totalSinFactura = useMemo(
    () => Math.round(desgloseSinFactura.reduce((acc, s) => acc + (s.monto > 0 ? s.monto : 0), 0) * 100) / 100,
    [desgloseSinFactura]
  );
  const sistemasEnCero = useMemo(
    () => desgloseSinFactura.filter((s) => !(s.monto > 0)),
    [desgloseSinFactura]
  );

  // ✅ Monto total LIBRE (pago sin factura): al cambiar el total se reparte entre
  //    los sistemas. 1 sistema → recibe todo. Varios → proporcional a lo cargado
  //    (o en partes iguales si estaban en 0). Los centavos sobrantes van al último.
  const aplicarTotalSinFactura = useCallback((textoTotal) => {
    const total = Math.round(parseMoneyInput(textoTotal) * 100);
    const lista = desgloseSinFactura;
    if (!lista.length) return;
    const fmt = (centavos) => (centavos / 100).toFixed(2).replace(".", ",").replace(/,00$/, "");

    if (lista.length === 1) {
      setMontosSinFactura((prev) => ({ ...prev, [lista[0].id_sistema]: total > 0 ? fmt(total) : "" }));
      return;
    }

    const base = proporcionesRef.current;
    const actuales = lista.map((x) =>
      base && base[x.id_sistema] != null
        ? base[x.id_sistema]
        : Math.max(0, Math.round(Number(x.monto || 0) * 100))
    );
    const sumaActual = actuales.reduce((a, b) => a + b, 0);
    const partes = lista.map((_, i) =>
      sumaActual > 0
        ? Math.floor((total * actuales[i]) / sumaActual)
        : Math.floor(total / lista.length)
    );
    const resto = total - partes.reduce((a, b) => a + b, 0);
    partes[partes.length - 1] += resto;

    setMontosSinFactura((prev) => {
      const next = { ...prev };
      lista.forEach((x, i) => {
        next[x.id_sistema] = partes[i] > 0 ? fmt(partes[i]) : "";
      });
      return next;
    });
  }, [desgloseSinFactura]);

  const montoArsNum  = useMemo(
    () => (sinFactura ? totalSinFactura : Math.round(parseMoneyInput(monto) * 100) / 100),
    [sinFactura, totalSinFactura, monto]
  );
  const desgloseCoincide = useMemo(
    () => !tieneDesglose || Math.abs(totalDesglose - montoArsNum) <= 0.05,
    [tieneDesglose, totalDesglose, montoArsNum]
  );
  const montoEsFijo  = useMemo(() => {
    const t = Number(factura?.total_ars);
    const m = Number(factura?.monto_ars);
    return (Number.isFinite(t) && t > 0) || (Number.isFinite(m) && m > 0);
  }, [factura]);

  const handleAbrirFactura = useCallback(() => {
    if (!pdfUrl) return;
    window.open(pdfUrl, "_blank", "noopener,noreferrer");
  }, [pdfUrl]);

  const puedePagar = useMemo(() => {
    if (sinFactura && !confirmaSinFactura) return false;
    if (!id_sistema) return false;
    if (!anio || !idMes) return false;
    if (!fechaPago) return false;
    if (!idMedioPago) return false;
    if (!Number.isFinite(montoArsNum) || montoArsNum <= 0) return false;
    if (pago?.id_pago) return false;
    if (registrando) return false;
    if (!sinFactura && !desgloseCoincide) return false;
    return true;
  }, [sinFactura, confirmaSinFactura, id_sistema, anio, idMes, fechaPago, idMedioPago, montoArsNum, pago, registrando, desgloseCoincide]);

  const handleRealizarPago = useCallback(async () => {
    if (!puedePagar || registrandoRef.current) return;
    registrandoRef.current = true;
    setRegistrando(true);
    setError("");
    try {
      const payload = sinFactura
        ? {
            // ✅ Pago SIN factura (confirmado por el usuario)
            id_sistema:    Number(id_sistema),
            anio:          Number(anio),
            meses:         [Number(idMes)],
            monto:         Number(totalSinFactura),
            fecha_pago:    String(fechaPago),
            id_medio_pago: Number(idMedioPago),
            id_factura:    null,
            confirmar_sin_factura: true,
            sistemas_con_monto: desgloseSinFactura
              .filter((s) => s.monto > 0)
              .map((s) => ({ id_sistema: s.id_sistema, monto: s.monto })),
          }
        : {
            id_sistema:    Number(id_sistema),
            anio:          Number(anio),
            meses:         [Number(idMes)],
            monto:         Number(montoArsNum),
            fecha_pago:    String(fechaPago),
            id_medio_pago: Number(idMedioPago),
            id_factura:    factura?.id_factura ? Number(factura.id_factura) : null,
            // ✅ Si hay desglose enviamos sistemas_con_monto (solo id_sistema + monto, sin nombre)
            // El backend registra 1 pago por sistema con su monto individual
            // Si viene [] el backend usa id_sistema + monto total (fallback)
            sistemas_con_monto: tieneDesglose
              ? sistemasConMonto.map((s) => ({ id_sistema: s.id_sistema, monto: s.monto }))
              : [],
          };

      const result = await fetchJSON(`${API}?action=pagos&op=registrar_pago`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (result?.exito !== true)
        throw new Error(result?.mensaje || "Error al registrar el pago");

      setPagoSinFacturaOk(Boolean(result?.sin_factura ?? sinFactura));
      setPagoExitoso(true);
      onPagoRealizado?.({
        anio: Number(anio),
        id_mes: Number(idMes),
        periodoLabel,
        fecha_pago: String(fechaPago),
      });
    } catch (e) {
      setError(e?.message || "Ocurrió un error al realizar el pago.");
    } finally {
      registrandoRef.current = false;
      setRegistrando(false);
    }
  }, [
    API, fetchJSON, puedePagar, id_sistema, anio, idMes,
    montoArsNum, fechaPago, idMedioPago, factura,
    onPagoRealizado, tieneDesglose, sistemasConMonto,
    sinFactura, totalSinFactura, desgloseSinFactura, periodoLabel,
  ]);

  // Año de la fecha de pago distinto del año del período (cobro adelantado o atrasado).
  const anioFechaPago = useMemo(() => {
    const y = Number(String(fechaPago || "").slice(0, 4));
    return Number.isFinite(y) ? y : 0;
  }, [fechaPago]);

  const handleAnularFactura = useCallback(() => {
    const idFactura = Number(factura?.id_factura || 0);
    if (!Number.isFinite(idFactura) || idFactura <= 0) return;

    setError("");
    onSolicitarAnulacionFactura?.({
      ...factura,
      cliente_nombre:
        factura?.cliente_nombre ||
        detalle?.cliente?.nombre ||
        detalle?.cliente_nombre ||
        (typeof detalle?.cliente === "string" ? detalle.cliente : "") ||
        "",
      sistema_nombre:
        factura?.sistema_nombre ||
        detalle?.sistema?.nombre ||
        detalle?.sistema_nombre ||
        (typeof detalle?.sistema === "string" ? detalle.sistema : "") ||
        detalle?.nombre_sistema ||
        detalle?.nombre ||
        "",
    });
  }, [factura, detalle, onSolicitarAnulacionFactura]);

  const cerrar = () => {
    if (registrando) return;
    cerrarModal?.();
  };

  /* =========================
     UI
  ========================= */
  return (
    <div
      className="mi-modal__overlay"
      onClick={(e) => e.target.classList.contains("mi-modal__overlay") && cerrar()}
    >
      <div
        className="mi-modal__container pay-modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mi-modal__header">
          <div className="mi-modal__head-left">
            <div className="pay-head">
              <span className="pay-head__ico"><FaCoins /></span>
              <div className="pay-head__txt">
                <h2 className="mi-modal__title">{tituloCliente}</h2>
                <p className="mi-modal__subtitle">Período: {periodoLabel}</p>
              </div>
            </div>
          </div>
          <button
            className="mi-modal__close"
            type="button"
            onClick={cerrar}
            aria-label="Cerrar"
            disabled={registrando}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="mit-modal__body">
          <div className="mi-tabpanel">

            {loading ? (
              <div className="pay-center">
                <div className="pay-spinner" /><span>Cargando datos...</span>
              </div>
            ) : null}

            {!loading && error ? (
              <div className="pay-banner pay-banner--error"><strong>Error:</strong> {error}</div>
            ) : null}

            {!loading && !error && pagoExitoso ? (
              <div className="pay-banner pay-banner--success">
                <h3 className="pay-success-title">¡Pago realizado con éxito!</h3>
                <div className="pay-muted">Período: {periodoLabel}</div>
                {!pagoSinFacturaOk && tieneDesglose && (
                  <div className="pay-muted" style={{ marginTop: 6 }}>
                    Se registraron <strong>{sistemasConMonto.length}</strong> pagos (uno por sistema).
                  </div>
                )}
                {pagoSinFacturaOk && (
                  <div className="pay-muted" style={{ marginTop: 6 }}>
                    El pago quedó registrado <strong>SIN FACTURA</strong>.
                  </div>
                )}
              </div>
            ) : null}

            {/* ✅ Aviso de estado de facturación (siempre visible al abrir el modal) */}
            {!loading && detalle && !pagoExitoso && !sinFactura ? (
              <div className="pay-banner pay-banner--success pay-status">
                <FaCheckCircle className="pay-status__ico pay-status__ico--ok" />
                <div>
                  <div className="pay-status__title">Período facturado</div>
                  <div className="pay-muted">
                    {factura?.cbte_nro ? `Factura N° ${factura.cbte_nro}` : "Factura generada"}
                    {factura?.pto_vta ? ` • PV ${String(factura.pto_vta).padStart(4, "0")}` : ""}
                    {factura?.estado ? ` • ${factura.estado}` : ""}
                    {" — "}{moneyARS(factura?.total_ars ?? factura?.monto_ars ?? 0)}
                  </div>
                </div>
              </div>
            ) : null}

            {!loading && detalle && !pagoExitoso && sinFactura && !pago?.id_pago ? (
              <div className="pay-banner pay-banner--warn pay-status">
                <FaExclamationTriangle className="pay-status__ico pay-status__ico--warn" />
                <div style={{ minWidth: 0 }}>
                  <div className="pay-status__title">Este período NO está facturado</div>
                  <div className="pay-muted">
                    No hay factura cargada en el sistema para <strong>{periodoLabel}</strong>.
                    {facturaAnulada?.id_factura
                      ? ` La factura${facturaAnulada?.cbte_nro ? ` N° ${facturaAnulada.cbte_nro}` : ""} de este período fue anulada.`
                      : ""}
                    {" "}Igual podés registrar el pago sin factura.
                  </div>
                  <label className="pay-confirm">
                    <input
                      type="checkbox"
                      checked={confirmaSinFactura}
                      onChange={(e) => setConfirmaSinFactura(e.target.checked)}
                      disabled={registrando}
                    />
                    <span>Confirmo que voy a registrar el pago <strong>sin factura</strong>.</span>
                  </label>
                </div>
              </div>
            ) : null}

            {!loading && detalle && !pagoExitoso ? (
              <div className="mi-grid">

                {/* Card: Datos del pago */}
                <article className="mi-card mi-card--full pay-card">
                  <h3 className="mi-card__title">Datos del pago</h3>

                  <div className="fl-grid pay-fl">
                    {/* ✅ Período aplicado del pago (editable: mes + año) */}
                    <div className="fl-field">
                      <select
                        className="fl-input fl-select"
                        value={idMes || ""}
                        onChange={(e) => setIdMes(Number(e.target.value) || 0)}
                        disabled={registrando || pagoExitoso}
                        title="Mes del período que se está pagando"
                      >
                        {opcionesMes.map((m) => (
                          <option key={m.id} value={m.id}>{m.nombre}</option>
                        ))}
                      </select>
                      <label className="fl-label">Mes del período</label>
                    </div>

                    <div className="fl-field">
                      <select
                        className="fl-input fl-select"
                        value={anio || ""}
                        onChange={(e) => setAnio(Number(e.target.value) || 0)}
                        disabled={registrando || pagoExitoso}
                        title="Año del período que se está pagando"
                      >
                        {opcionesAnio.map((y) => (
                          <option key={y} value={y}>{y}</option>
                        ))}
                      </select>
                      <label className="fl-label">Año del período</label>
                    </div>

                    {periodoCambiado ? (
                      <div className="fl-col-full">
                        <div className="pay-banner pay-banner--info">
                          El pago se va a aplicar a <strong>{periodoLabel}</strong>
                          {" "}(distinto del período filtrado en la pantalla:{" "}
                          {getMonthNameEs(idMesInicial)} {anioInicial}).
                        </div>
                      </div>
                    ) : null}

                    {anio && anioFechaPago && anioFechaPago !== anio ? (
                      <div className="fl-col-full">
                        <div className="pay-banner pay-banner--info">
                          La fecha de pago es de {anioFechaPago} y el período de {anio}.
                          En Reportes el ingreso se contabiliza en el mes de la <strong>fecha de pago</strong>
                          {" "}(con la categoría {periodoLabel}).
                        </div>
                      </div>
                    ) : null}

                    <div className="fl-field">
                      <input
                        className="fl-input" placeholder=" " type="date"
                        value={fechaPago} onChange={(e) => setFechaPago(e.target.value)}
                      />
                      <label className="fl-label">Fecha pago</label>
                    </div>

                    <div className="fl-field">
                      {sinFactura ? (
                        <input
                          className="fl-input" placeholder=" "
                          value={totalEditando ?? moneyARS(totalSinFactura)}
                          inputMode="decimal"
                          disabled={registrando || Boolean(pago?.id_pago)}
                          title="Podés escribir el monto que se cobró; se reparte entre los sistemas"
                          onFocus={() => {
                            const snap = {};
                            desgloseSinFactura.forEach((x) => {
                              snap[x.id_sistema] = Math.max(0, Math.round(Number(x.monto || 0) * 100));
                            });
                            proporcionesRef.current = snap;
                            setTotalEditando(
                              totalSinFactura > 0
                                ? String(totalSinFactura).replace(".", ",")
                                : ""
                            );
                          }}
                          onChange={(e) => {
                            const v = sanitizeMoneyTyping(e.target.value);
                            setTotalEditando(v);
                            aplicarTotalSinFactura(v);
                          }}
                          onBlur={() => {
                            proporcionesRef.current = null;
                            setTotalEditando(null);
                          }}
                        />
                      ) : (
                        <input
                          className="fl-input" placeholder=" " value={monto}
                          onChange={(e) => !montoEsFijo && setMonto(sanitizeMoneyTyping(e.target.value))}
                          inputMode="decimal" readOnly={montoEsFijo}
                          title={montoEsFijo ? "Monto tomado de la factura" : "Monto editable"}
                        />
                      )}
                      <label className="fl-label">Monto total (ARS)</label>
                    </div>

                    <div className="fl-field fl-col-full">
                      <select
                        className="fl-input fl-select" value={idMedioPago}
                        onChange={(e) => setIdMedioPago(e.target.value)}
                      >
                        {mediosPago.length
                          ? mediosPago.map((mp) => (
                              <option key={mp.id_medio_pago} value={mp.id_medio_pago}>{mp.nombre}</option>
                            ))
                          : <option value="">(No hay medios de pago)</option>
                        }
                      </select>
                      <label className="fl-label">Medio de pago</label>
                    </div>

                    {pago?.id_pago ? (
                      <div className="fl-col-full">
                        <div className="pay-banner pay-banner--info">
                          Ya existe un pago registrado para este período (ID pago:{" "}
                          <strong>{pago.id_pago}</strong>).
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {/* ✅ Desglose por sistema */}
                  {sinFactura ? (
                    <div style={{ marginTop: 16 }}>
                      <div className="pay-desglose-title">
                        Monto a cobrar por sistema (sin factura):
                      </div>
                      <div style={{ display: "grid", gap: 8 }}>
                        {desgloseSinFactura.map((s) => (
                          <div key={s.id_sistema} className="pay-sf-row">
                            <span className="pay-sf-row__name">{s.nombre}</span>
                            <input
                              className="fl-input pay-sf-row__input"
                              value={montosSinFactura[s.id_sistema] ?? ""}
                              onChange={(e) => {
                                const v = sanitizeMoneyTyping(e.target.value);
                                setMontosSinFactura((prev) => ({ ...prev, [s.id_sistema]: v }));
                              }}
                              inputMode="decimal"
                              placeholder="0,00"
                              disabled={registrando || Boolean(pago?.id_pago)}
                              aria-label={`Monto ${s.nombre}`}
                            />
                          </div>
                        ))}
                        <div className="pay-sf-total">
                          <span>Total ({desgloseSinFactura.length} sistema{desgloseSinFactura.length === 1 ? "" : "s"})</span>
                          <strong>{moneyARS(totalSinFactura)}</strong>
                        </div>
                      </div>
                      {sistemasEnCero.length > 0 && totalSinFactura > 0 ? (
                        <div className="pay-banner pay-banner--info" style={{ marginTop: 10 }}>
                          {sistemasEnCero.length} sistema(s) en $0 no se registrarán y el cliente seguirá apareciendo
                          como deudor por ese/esos sistema(s).
                        </div>
                      ) : null}
                    </div>
                  ) : tieneDesglose ? (
                    <div style={{ marginTop: 16 }}>
                      <div style={{
                        fontSize: 11, fontWeight: 700, marginBottom: 8,
                        opacity: 0.6, textTransform: "uppercase", letterSpacing: "0.06em",
                      }}>
                        Se registrará 1 pago individual por cada sistema:
                      </div>
                      <div style={{ display: "grid", gap: 6 }}>
                        {sistemasConMonto.map((s) => (
                          <div key={s.id_sistema} style={{
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                            padding: "9px 14px", borderRadius: 10,
                            background: "rgba(255,255,255,0.05)",
                            border: "1px solid rgba(255,255,255,0.1)",
                            fontSize: 13, gap: 12,
                          }}>
                            <span style={{ opacity: 0.88 }}>{s.nombre}</span>
                            <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{moneyARS(s.monto)}</span>
                          </div>
                        ))}
                        <div style={{
                          display: "flex", justifyContent: "space-between",
                          padding: "7px 14px", fontSize: 12, opacity: 0.5,
                          borderTop: "1px solid rgba(255,255,255,0.07)", marginTop: 2,
                        }}>
                          <span>Total ({sistemasConMonto.length} sistemas)</span>
                          <span>{moneyARS(montoArsNum)}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ marginTop: 10, fontSize: 12, opacity: 0.5 }}>
                      Sin desglose por sistema — se registrará 1 pago con el monto total.
                    </div>
                  )}
                  {!sinFactura && tieneDesglose && !desgloseCoincide ? (
                    <div className="pay-banner pay-banner--error" style={{ marginTop: 12 }}>
                      El desglose suma {moneyARS(totalDesglose)}, pero la factura totaliza {moneyARS(montoArsNum)}.
                      Volvé a generar la factura antes de registrar el pago.
                    </div>
                  ) : null}
                </article>

                {/* Card: Factura (solo si el período está facturado) */}
                {!sinFactura ? (
                <article className="mi-card mi-card--full pay-card">
                  <div className="pay-fact-head">
                    <h3 className="mi-card__title" style={{ marginBottom: 0 }}>Factura</h3>
                    <button
                      type="button" className="mit-btn mit-btn--ghost pay-btn-small"
                      onClick={handleAbrirFactura} disabled={!pdfUrl}
                      title={pdfUrl ? "Ver factura (PDF)" : "No hay PDF de factura"}
                    >
                      <FaEye /> Ver
                    </button>
                    {factura?.id_factura ? (
                      <button
                        type="button"
                        className="mit-btn mit-btn--ghost pay-btn-small"
                        onClick={handleAnularFactura}
                        disabled={!onSolicitarAnulacionFactura}
                        title={
                          factura?.cae && !/^0+$/.test(String(factura.cae))
                            ? "Emitir Nota de Crédito"
                            : "Eliminar factura local"
                        }
                      >
                        <FaBan />{
                          factura?.cae && !/^0+$/.test(String(factura.cae))
                            ? "Emitir Nota de Crédito"
                            : "Eliminar factura"
                        }
                      </button>
                    ) : null}
                  </div>

                  <div className="pay-fact-grid">
                    <div className="pay-kpi">
                      <span className="pay-kpi__k">Estado</span>
                      <span className="pay-kpi__v">{factura?.estado || (pdfUrl ? "solo_pdf" : "—")}</span>
                    </div>
                    <div className="pay-kpi">
                      <span className="pay-kpi__k">Total</span>
                      <span className="pay-kpi__v">{moneyARS(factura?.total_ars ?? factura?.monto_ars ?? montoArsNum ?? 0)}</span>
                    </div>
                    <div className="pay-kpi">
                      <span className="pay-kpi__k">CBTE</span>
                      <span className="pay-kpi__v">
                        {factura?.cbte_nro ? `N° ${factura.cbte_nro}` : "—"}{" "}
                        {factura?.pto_vta ? `• PV ${String(factura.pto_vta).padStart(4,"0")}` : ""}
                      </span>
                    </div>
                    <div className="pay-kpi">
                      <span className="pay-kpi__k">CAE</span>
                      <span className="pay-kpi__v">{factura?.cae || "—"}</span>
                    </div>
                    <div className="pay-kpi">
                      <span className="pay-kpi__k">Fecha cbte</span>
                      <span className="pay-kpi__v">{factura?.fecha_cbte ? formatDateSlash(factura.fecha_cbte) : "—"}</span>
                    </div>
                    <div className="pay-kpi">
                      <span className="pay-kpi__k">Vto CAE</span>
                      <span className="pay-kpi__v">{factura?.cae_vto ? formatDateSlash(factura.cae_vto) : "—"}</span>
                    </div>
                    <div className="pay-kpi">
                      <span className="pay-kpi__k">Período desde</span>
                      <span className="pay-kpi__v">{factura?.periodo_desde ? formatDateSlash(factura.periodo_desde) : "—"}</span>
                    </div>
                    <div className="pay-kpi">
                      <span className="pay-kpi__k">Período hasta</span>
                      <span className="pay-kpi__v">{factura?.periodo_hasta ? formatDateSlash(factura.periodo_hasta) : "—"}</span>
                    </div>
                    <div className="pay-kpi">
                      <span className="pay-kpi__k">Vto pago</span>
                      <span className="pay-kpi__v">{factura?.vto_pago ? formatDateSlash(factura.vto_pago) : "—"}</span>
                    </div>
                    <div className="pay-kpi">
                      <span className="pay-kpi__k">PDF</span>
                      <span className="pay-kpi__v">{pdfUrl ? "Disponible" : "No cargado"}</span>
                    </div>
                  </div>
                </article>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* Footer */}
          <div className="mit-actions">
            <div className="mit-help">
              <span className="pay-total-pill">
                <span className="pay-total-pill__k">Total</span>
                <span className="pay-total-pill__v">{moneyARS(montoArsNum || 0)}</span>
              </span>
            </div>

            <button
              type="button"
              className="mit-btn mit-btn--ghost"
              onClick={cerrar}
              disabled={registrando}
            >
              <FaTimes style={{ marginRight: 8 }} />Cerrar
            </button>

            <button
              type="button" className="mit-btn mit-btn--solid"
              onClick={handleRealizarPago} disabled={!puedePagar || pagoExitoso}
              title={
                sinFactura && !confirmaSinFactura
                  ? "Marcá la confirmación de pago sin factura para continuar"
                  : `Registrar pago: ${periodoLabel}`
              }
            >
              <FaCheck style={{ marginRight: 8 }} />
              {registrando
                ? "Registrando..."
                : sinFactura
                ? "Pagar sin factura"
                : (tieneDesglose ? `Pagar (${sistemasConMonto.length} sistemas)` : "Pagar")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
