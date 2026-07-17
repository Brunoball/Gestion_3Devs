// ✅ REEMPLAZAR COMPLETO
// frontend/src/components/Pagos/modales/ModalFacturaArca.jsx
import React, { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { FaCheck } from "react-icons/fa";
import "./ModalFacturaArca.css";
import "../../Trabajadores/modales/ModalEditarTrabajador.css";
import ModalFacturaArcaResumen from "./ModalFacturaArcaResumen";
import { fetchJSONAuth } from "../../Global/api";

const DOC_TIPOS = [
  { id: 80, label: "CUIT (80)" },
  { id: 96, label: "DNI (96)" },
];

const CBTE_TIPOS = [{ id: 11, label: "Factura C (11)" }];

// ✅ PRODUCCIÓN: no usar monto de prueba
const FORCE_TEST_AMOUNT = false;
const TEST_AMOUNT = null;

const DEFAULT_PTO_VTA = 2;

function moneyARS(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "$0,00";
  try {
    return n.toLocaleString("es-AR", { style: "currency", currency: "ARS" });
  } catch {
    return `$${n.toFixed(2)}`;
  }
}


function parseMoneyInput(v) {
  const s = String(v ?? "").trim();
  if (!s) return 0;
  // Si el usuario usa coma decimal sin punto, normalizamos a número JS.
  const normalized = s.includes(",") && !s.includes(".") ? s.replace(",", ".") : s;
  const n = Number(normalized);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function moneyUSD(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "USD 0.00";
  try {
    return n.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } catch {
    return `USD ${n.toFixed(2)}`;
  }
}

// yyyy-mm-dd -> yyyymmdd
function dateToYMD8(iso) {
  const s = String(iso || "").trim();
  if (!s) return "";
  if (/^\d{8}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.replaceAll("-", "");
  return "";
}

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function monthFirstLastISO(anio, mesText) {
  const y = Number(anio);
  if (!Number.isFinite(y) || y <= 0) {
    const t = todayISO();
    return { desde: t, hasta: t };
  }

  const map = {
    enero: 1,
    febrero: 2,
    marzo: 3,
    abril: 4,
    mayo: 5,
    junio: 6,
    julio: 7,
    agosto: 8,
    septiembre: 9,
    setiembre: 9,
    octubre: 10,
    noviembre: 11,
    diciembre: 12,
  };

  const mm = map[String(mesText || "").toLowerCase().trim()];
  if (!mm) {
    const t = todayISO();
    return { desde: t, hasta: t };
  }

  const last = new Date(y, mm, 0);
  const fISO = `${y}-${String(mm).padStart(2, "0")}-01`;
  const lISO = `${y}-${String(mm).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;

  return { desde: fISO, hasta: lISO };
}

/* =========================================
   ✅ Dropdown multi-select (checkboxes)
========================================= */
function useOnClickOutside(ref, handler, when = true) {
  useEffect(() => {
    if (!when) return;
    const listener = (event) => {
      const el = ref?.current;
      if (!el) return;
      if (el.contains(event.target)) return;
      handler?.();
    };
    document.addEventListener("mousedown", listener);
    document.addEventListener("touchstart", listener);
    return () => {
      document.removeEventListener("mousedown", listener);
      document.removeEventListener("touchstart", listener);
    };
  }, [ref, handler, when]);
}

function safeStr(x) {
  return String(x ?? "").trim();
}

export default function ModalFacturaArca({
  open,
  onClose,
  apiBase,
  action,
  data,
  idOrganizacion,
  onFacturada,
  onDone,
}) {
  const [docTipo, setDocTipo] = useState(80);
  const [docNro, setDocNro] = useState("");
  const [cbteTipo, setCbteTipo] = useState(11);

  const [error, setError] = useState("");
  const [openResumen, setOpenResumen] = useState(false);

  // ✅ tabs
  const [tab, setTab] = useState("facturacion"); // "facturacion" | "detalle"

  // ✅ cliente facturación (DB)
  const [clienteFact, setClienteFact] = useState(null);
  const [loadingCliente, setLoadingCliente] = useState(false);

  // ✅ sistemas del cliente (DB)
  const [sistemasCliente, setSistemasCliente] = useState([]); // [{id_sistema,nombre,descripcion,activo}]
  const [loadingSistemas, setLoadingSistemas] = useState(false);
  const [sistemasErr, setSistemasErr] = useState("");

  // ✅ modo mantenimiento
  const [mantMode, setMantMode] = useState("global");

  // ✅ sistemas seleccionados para facturar
  const [sistemasSel, setSistemasSel] = useState([]); // ids

  // ✅ fechas período
  const [periodoDesde, setPeriodoDesde] = useState("");
  const [periodoHasta, setPeriodoHasta] = useState("");
  const [vtoPago, setVtoPago] = useState("");

  // ✅ USD -> ARS
  const [usdRate, setUsdRate] = useState(null);
  const [loadingUsd, setLoadingUsd] = useState(false);
  const [usdErr, setUsdErr] = useState("");

  // ✅ PLANES MANTENIMIENTO (DB)
  const [planesMant, setPlanesMant] = useState([]);
  const [loadingPlanes, setLoadingPlanes] = useState(false);
  const [planesErr, setPlanesErr] = useState("");

  // ✅ selector mantenimiento (multi) -> ids (number) — GLOBAL
  const [mantSel, setMantSel] = useState([]);

  // ✅ selector mantenimiento por sistema
  const [mantSelBySistema, setMantSelBySistema] = useState({});

  // ✅ dropdown UI (global)
  const [mantOpen, setMantOpen] = useState(false);
  const [mantSearch, setMantSearch] = useState("");
  const mantWrapRef = useRef(null);

  // ✅ desarrollo manual (global): ARS principal + USD como referencia editable
  const [devDesc, setDevDesc] = useState("");
  const [devArs, setDevArs] = useState("");
  const [devUsd, setDevUsd] = useState("");

  const firstRef = useRef(null);

  // ✅ refs para abrir calendario al click en cualquier parte
  const refDesde = useRef(null);
  const refHasta = useRef(null);
  const refVto = useRef(null);

  const closeMantDropdown = useCallback(() => setMantOpen(false), []);
  useOnClickOutside(mantWrapRef, closeMantDropdown, open && mantOpen);

  const titulo = useMemo(
    () => `${data?.labelCliente || "Cliente"} • ${data?.labelSistema || "Sistema"}`,
    [data]
  );

  // ✅ claves
  const idPagoReal = useMemo(() => (data?.id_pago ? Number(data.id_pago) : 0), [data]);
  const idSistemaReal = useMemo(() => (data?.id_sistema ? Number(data.id_sistema) : 0), [data]);

  const idPagoLabel = useMemo(() => (idPagoReal > 0 ? String(idPagoReal) : "SIN PAGO"), [idPagoReal]);

  const nombreCliente = useMemo(() => data?.labelCliente || data?.cliente || "—", [data]);
  const nombreSistema = useMemo(() => data?.labelSistema || data?.sistema || "—", [data]);

  // ✅ helper: intentar abrir el date picker nativo
  const openNativePicker = useCallback((inputEl) => {
    if (!inputEl) return;
    try {
      if (typeof inputEl.showPicker === "function") {
        inputEl.showPicker();
        return;
      }
    } catch {}
    try { inputEl.focus(); } catch {}
    try { inputEl.click(); } catch {}
  }, []);

  // ✅ fetch helper autenticado y aislado por organización
  const fetchJSON = useCallback(
    (url, opts = {}) => fetchJSONAuth(url, opts, idOrganizacion),
    [idOrganizacion]
  );

  /* =========================================
     ✅ DÓLAR OFICIAL
  ========================================= */
  const getUsdOficialVenta = useCallback(async () => {
    const maybe =
      Number(data?.usd_rate) ||
      Number(data?.dolar_oficial_venta) ||
      Number(data?.dolar_venta);

    if (Number.isFinite(maybe) && maybe > 0) return maybe;

    const url = `${apiBase}?action=dolar_oficial`;

    const j = await fetchJSON(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (j?.ok !== true) {
      throw new Error(j?.error || "Dólar oficial: ok=false");
    }

    const venta = Number(j?.venta);
    if (!Number.isFinite(venta) || venta <= 0) {
      throw new Error("Dólar oficial: 'venta' inválida");
    }

    return venta;
  }, [apiBase, data, fetchJSON]);

  /* =========================================
     ✅ PLANES MANTENIMIENTO (DB)
  ========================================= */
  const fetchPlanesMantenimiento = useCallback(async () => {
    const url = `${apiBase}?action=${action}&op=planes_mantenimiento`;
    const j = await fetchJSON(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    const arr = Array.isArray(j?.planes) ? j.planes : [];

    const norm = arr
      .map((p) => ({
        id: Number(p?.id) || 0,
        nombre: safeStr(p?.nombre),
        descripcion: safeStr(p?.descripcion),
        monto: Number(p?.monto) || 0,
        activo: Number(p?.activo) || 0,
      }))
      .filter((p) => p.id > 0 && p.nombre);

    return norm;
  }, [apiBase, action, fetchJSON]);

  /* =========================================
     ✅ SISTEMAS DEL CLIENTE (DB)
  ========================================= */
  const fetchSistemasCliente = useCallback(async () => {
    const url = `${apiBase}?action=${action}&op=cliente_sistemas`;
    const j = await fetchJSON(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ id_sistema: Number(idSistemaReal) }),
    });

    const arr = Array.isArray(j?.sistemas) ? j.sistemas : [];
    const norm = arr
      .map((s) => ({
        id_sistema: Number(s?.id_sistema) || 0,
        nombre: safeStr(s?.nombre),
        descripcion: safeStr(s?.descripcion),
        activo: Number(s?.activo) || 0,
      }))
      .filter((s) => s.id_sistema > 0 && s.nombre);

    return norm;
  }, [apiBase, action, fetchJSON, idSistemaReal]);

  // ✅ mantenimiento seleccionado (GLOBAL)
  const mantenimientoSeleccionado = useMemo(() => {
    const set = new Set((mantSel || []).map((x) => Number(x)));
    const base = Array.isArray(planesMant) ? planesMant : [];
    return base.filter((p) => set.has(Number(p.id)));
  }, [mantSel, planesMant]);

  const devArsNum = useMemo(() => parseMoneyInput(devArs), [devArs]);
  const devUsdNum = useMemo(() => parseMoneyInput(devUsd), [devUsd]);

  // ✅ cantidad de sistemas elegidos
  const cantSistemasSeleccionados = useMemo(() => {
    const n = (sistemasSel || []).length;
    return n > 0 ? n : 0;
  }, [sistemasSel]);

  // ✅ sistemas activos
  const sistemasActivos = useMemo(() => {
    return (sistemasCliente || []).filter((s) => Number(s.activo) === 1);
  }, [sistemasCliente]);

  // ✅ FIX: labels de los sistemas SELECCIONADOS (para pasar al PDF)
  const sistemasSelLabels = useMemo(() => {
    const map = new Map((sistemasCliente || []).map((s) => [Number(s.id_sistema), s]));
    return (sistemasSel || [])
      .map((sid) => {
        const s = map.get(Number(sid));
        return s ? safeStr(s.nombre) : null;
      })
      .filter(Boolean);
  }, [sistemasSel, sistemasCliente]);

  // ✅ total ARS mantenimiento según modo. Desde ahora planes_mantenimiento.monto se guarda en PESOS.
  const totalMantARS = useMemo(() => {
    const base = Array.isArray(planesMant) ? planesMant : [];

    if (mantMode === "global") {
      const sumPlan = mantenimientoSeleccionado.reduce((acc, it) => acc + (Number(it.monto) || 0), 0);
      const mult = cantSistemasSeleccionados || 0;
      return sumPlan * mult;
    }

    // personalizado por sistema
    let total = 0;
    for (const sid of sistemasSel || []) {
      const sel = mantSelBySistema?.[sid] || [];
      const set = new Set(sel.map((x) => Number(x)));
      const sum = base
        .filter((p) => set.has(Number(p.id)))
        .reduce((acc, it) => acc + (Number(it.monto) || 0), 0);
      total += sum;
    }
    return total;
  }, [
    mantMode,
    mantenimientoSeleccionado,
    cantSistemasSeleccionados,
    planesMant,
    sistemasSel,
    mantSelBySistema,
  ]);

  // ✅ Total ARS final. USD queda solo como referencia/histórico si hay cotización.
  const totalARS = useMemo(() => totalMantARS + devArsNum, [totalMantARS, devArsNum]);

  const totalUSD = useMemo(() => {
    const r = Number(usdRate);
    if (!Number.isFinite(r) || r <= 0) return 0;
    return totalARS / r;
  }, [totalARS, usdRate]);

  // ✅ helper selectedSystemsLabels para itemsDetalle desarrollo
  const selectedSystemsLabels = useMemo(() => {
    const sistMap = new Map((sistemasCliente || []).map((s) => [Number(s.id_sistema), s]));
    return (sistemasSel || [])
      .map((sid) => {
        const s = sistMap.get(Number(sid));
        return s ? safeStr(s.nombre) : `Sistema ${sid}`;
      })
      .filter(Boolean);
  }, [sistemasSel, sistemasCliente]);

  // ✅ items (detalle) para guardar en DB / mostrar resumen
  const itemsDetalle = useMemo(() => {
    const out = [];
    const r = Number(usdRate);
    const rateOk = Number.isFinite(r) && r > 0;

    const sistMap = new Map((sistemasCliente || []).map((s) => [Number(s.id_sistema), s]));

    // ===== mantenimiento =====
    if (mantMode === "global") {
      const mult = cantSistemasSeleccionados || 0;

      for (const it of mantenimientoSeleccionado) {
        const planNombre = safeStr(it.nombre) || "Mantenimiento";
        const arsUnit = Number(it.monto) || 0;
        const arsTotal = arsUnit * mult;
        const usdUnit = rateOk ? arsUnit / r : 0;
        const usdTotal = rateOk ? arsTotal / r : 0;

        out.push({
          tipo: "mantenimiento",
          modo: "global",
          plan_id: Number(it.id),
          descripcion: planNombre,
          cantidad: mult,
          unidad: "serv.",
          usd_unit: usdUnit,
          usd: usdTotal,
          ars_unit: arsUnit,
          ars: arsTotal,
          cantidad_sistemas: mult,
          sistemas_ids: [...(sistemasSel || [])],
          sistemas_labels: selectedSystemsLabels,
        });
      }
    } else {
      // personalizado por sistema
      const base = Array.isArray(planesMant) ? planesMant : [];
      const byId = new Map(base.map((p) => [Number(p.id), p]));

      for (const sid of sistemasSel || []) {
        const s = sistMap.get(Number(sid));
        const sLabel = s ? safeStr(s.nombre) : `Sistema ${sid}`;

        const sel = mantSelBySistema?.[sid] || [];
        const uniq = Array.from(new Set(sel.map((x) => Number(x)).filter((n) => n > 0)));

        for (const pid of uniq) {
          const p = byId.get(pid);
          if (!p) continue;

          const planNombre = safeStr(p.nombre) || "Mantenimiento";
          const ars = Number(p.monto) || 0;
          const usd = rateOk ? ars / r : 0;

          out.push({
            tipo: "mantenimiento",
            modo: "por_sistema",
            sistema_id: Number(sid),
            sistema_label: sLabel,
            sistemas_labels: [sLabel],
            plan_id: Number(p.id),
            descripcion: planNombre,
            cantidad: 1,
            unidad: "serv.",
            usd,
            ars_unit: ars,
            ars,
          });
        }
      }
    }

    // ===== desarrollo (global) =====
    if (devArsNum > 0 || String(devDesc || "").trim() !== "") {
      const usdRef = rateOk ? devArsNum / r : devUsdNum;

      out.push({
        tipo: "desarrollo",
        modo: "global",
        id: "desarrollo_manual",
        descripcion: String(devDesc || "").trim() || "Desarrollo",
        cantidad: 1,
        unidad: "serv.",
        usd: usdRef,
        ars_unit: devArsNum,
        ars: devArsNum,
        sistemas_labels: selectedSystemsLabels,
      });
    }

    return out;
  }, [
    mantMode,
    mantenimientoSeleccionado,
    cantSistemasSeleccionados,
    sistemasSel,
    mantSelBySistema,
    planesMant,
    sistemasCliente,
    devArsNum,
    devUsdNum,
    devDesc,
    usdRate,
    selectedSystemsLabels,
  ]);

  const toggleMant = useCallback((id) => {
    const nid = Number(id);
    if (!Number.isFinite(nid) || nid <= 0) return;

    setMantSel((prev) => {
      const set = new Set((prev || []).map((x) => Number(x)));
      if (set.has(nid)) set.delete(nid);
      else set.add(nid);
      return Array.from(set);
    });
    setError("");
  }, []);

  const toggleMantSistema = useCallback((id_sistema, plan_id) => {
    const sid = Number(id_sistema);
    const pid = Number(plan_id);
    if (!sid || !pid) return;

    setMantSelBySistema((prev) => {
      const next = { ...(prev || {}) };
      const arr = Array.isArray(next[sid]) ? next[sid] : [];
      const set = new Set(arr.map((x) => Number(x)));

      if (set.has(pid)) set.delete(pid);
      else set.add(pid);

      next[sid] = Array.from(set);
      return next;
    });

    setError("");
  }, []);

  // ===== dropdown helpers =====
  const planesFiltrados = useMemo(() => {
    const q = safeStr(mantSearch).toLowerCase();
    const base = Array.isArray(planesMant) ? planesMant : [];
    if (!q) return base;
    return base.filter((p) => {
      const n = safeStr(p.nombre).toLowerCase();
      const d = safeStr(p.descripcion).toLowerCase();
      return n.includes(q) || d.includes(q);
    });
  }, [planesMant, mantSearch]);

  const selectedLabel = useMemo(() => {
    const n = (mantSel || []).length;
    if (n === 0) return "Seleccionar planes...";
    if (n === 1) {
      const oneId = Number(mantSel[0]);
      const found = (planesMant || []).find((p) => Number(p.id) === oneId);
      return found ? found.nombre : "1 seleccionado";
    }
    return `${n} seleccionados`;
  }, [mantSel, planesMant]);

  const toggleSistemaSel = useCallback((sid) => {
    const id = Number(sid);
    if (!id) return;
    setSistemasSel((prev) => {
      const set = new Set((prev || []).map((x) => Number(x)));
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return Array.from(set);
    });
    setError("");
  }, []);

  const selectAllSistemas = useCallback(() => {
    setSistemasSel(sistemasActivos.map((s) => Number(s.id_sistema)));
  }, [sistemasActivos]);

  const clearAllSistemas = useCallback(() => {
    setSistemasSel([]);
  }, []);

  // ✅ al abrir: reset + precarga
  useEffect(() => {
    if (!open) return;

    setError("");
    setOpenResumen(false);
    setTab("facturacion");

    setDocTipo(80);
    setCbteTipo(11);
    setDocNro("");
    setClienteFact(null);

    setMantSel([]);
    setMantSelBySistema({});
    setMantMode("global");
    setMantOpen(false);
    setMantSearch("");
    setDevDesc("");
    setDevArs("");
    setDevUsd("");

    setSistemasCliente([]);
    setSistemasSel([]);
    setSistemasErr("");

    setPlanesMant([]);
    setPlanesErr("");

    const { desde, hasta } = monthFirstLastISO(data?.anio, data?.mes);
    setPeriodoDesde(desde);
    setPeriodoHasta(hasta);
    setVtoPago(hasta);

    // dólar oficial
    (async () => {
      setLoadingUsd(true);
      setUsdErr("");
      try {
        const venta = await getUsdOficialVenta();
        setUsdRate(venta);
      } catch (e) {
        setUsdRate(null);
        setUsdErr(e?.message || "No se pudo obtener el dólar oficial.");
      } finally {
        setLoadingUsd(false);
      }
    })();

    // planes mantenimiento
    (async () => {
      setLoadingPlanes(true);
      setPlanesErr("");
      try {
        const planes = await fetchPlanesMantenimiento();
        setPlanesMant(planes);
      } catch (e) {
        setPlanesMant([]);
        setPlanesErr(e?.message || "No se pudieron obtener planes de mantenimiento.");
      } finally {
        setLoadingPlanes(false);
      }
    })();

    // sistemas del cliente
    if (idSistemaReal > 0) {
      (async () => {
        setLoadingSistemas(true);
        setSistemasErr("");
        try {
          const sis = await fetchSistemasCliente();
          setSistemasCliente(sis);

          const activos = sis.filter((s) => Number(s.activo) === 1).map((s) => Number(s.id_sistema));
          setSistemasSel(activos);

          const init = {};
          for (const id of activos) init[id] = [];
          setMantSelBySistema(init);
        } catch (e) {
          setSistemasCliente([]);
          setSistemasSel([]);
          setSistemasErr(e?.message || "No se pudieron obtener sistemas del cliente.");
        } finally {
          setLoadingSistemas(false);
        }
      })();
    }

    const cfFromParent = data?.cliente_facturacion;
    if (cfFromParent !== undefined) {
      setClienteFact(cfFromParent || null);
      if (cfFromParent?.doc_tipo) setDocTipo(Number(cfFromParent.doc_tipo));
      if (cfFromParent?.doc_nro) setDocNro(String(cfFromParent.doc_nro).replace(/\D/g, ""));
      setTimeout(() => firstRef.current?.focus?.(), 0);
      return;
    }

    if (!idPagoReal) {
      setTimeout(() => firstRef.current?.focus?.(), 0);
      return;
    }

    (async () => {
      setLoadingCliente(true);
      try {
        const url = `${apiBase}?action=${action}&op=cliente_facturacion`;
        const resp = await fetchJSON(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            id_pago: Number(idPagoReal),
            anio: Number(data?.anio || 0),
            mes: String(data?.mes || ""),
          }),
        });

        const cf = resp?.cliente_facturacion ?? null;
        setClienteFact(cf);

        if (cf?.doc_tipo) setDocTipo(Number(cf.doc_tipo));
        if (cf?.doc_nro) setDocNro(String(cf.doc_nro).replace(/\D/g, ""));
      } catch (e) {
        console.warn("cliente_facturacion:", e?.message || e);
      } finally {
        setLoadingCliente(false);
        setTimeout(() => firstRef.current?.focus?.(), 0);
      }
    })();
  }, [
    open,
    apiBase,
    action,
    data,
    fetchJSON,
    getUsdOficialVenta,
    idPagoReal,
    idSistemaReal,
    fetchPlanesMantenimiento,
    fetchSistemasCliente,
  ]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const validarInputs = useCallback(() => {
    const doc = String(docNro || "").replace(/\D/g, "");

    if (!(idPagoReal > 0 || idSistemaReal > 0)) {
      return { ok: false, msg: "Falta id_sistema / id_pago (registro inválido)." };
    }

    if (!doc) return { ok: false, msg: "Ingresá el número de documento (solo números)." };

    if (Number(docTipo) === 96) {
      if (!(doc.length === 7 || doc.length === 8)) {
        return { ok: false, msg: "DNI inválido (7 u 8 dígitos, sin puntos)." };
      }
    }
    if (Number(docTipo) === 80) {
      if (doc.length !== 11) {
        return { ok: false, msg: "CUIT inválido (11 dígitos, sin guiones)." };
      }
    }

    const docN = Number(doc);
    const pvN = Number(DEFAULT_PTO_VTA);
    if (!Number.isFinite(docN) || docN <= 0) return { ok: false, msg: "Documento inválido." };
    if (!Number.isFinite(pvN) || pvN <= 0) return { ok: false, msg: "Punto de venta inválido." };

    if ((sistemasSel?.length || 0) === 0) {
      return { ok: false, msg: "Seleccioná al menos 1 sistema del cliente para facturar." };
    }

    const hasMant =
      mantMode === "global"
        ? (mantSel?.length || 0) > 0
        : Object.values(mantSelBySistema || {}).some((arr) => (arr?.length || 0) > 0);

    const hasDevMonto = devArsNum > 0;

    if (!hasMant && !hasDevMonto) {
      return { ok: false, msg: "Seleccioná al menos un plan de Mantenimiento o cargá un monto en Desarrollo." };
    }

    if (!Number.isFinite(totalARS) || totalARS <= 0) {
      return { ok: false, msg: "El total en pesos es inválido o 0. Revisá los montos cargados." };
    }

    const d = dateToYMD8(periodoDesde);
    const h = dateToYMD8(periodoHasta);
    const v = dateToYMD8(vtoPago);

    if (!d) return { ok: false, msg: "Elegí Período Desde (fecha válida)." };
    if (!h) return { ok: false, msg: "Elegí Período Hasta (fecha válida)." };
    if (!v) return { ok: false, msg: "Elegí Vto. para el pago (fecha válida)." };
    if (h < d) return { ok: false, msg: "Período Hasta no puede ser menor que Desde." };

    return { ok: true };
  }, [
    docNro,
    docTipo,
    periodoDesde,
    periodoHasta,
    vtoPago,
    usdRate,
    mantMode,
    mantSel,
    mantSelBySistema,
    devArsNum,
    totalARS,
    idPagoReal,
    idSistemaReal,
    sistemasSel,
  ]);

  const irAResumen = useCallback(() => {
    setError("");
    const v = validarInputs();
    if (!v.ok) return setError(v.msg);
    setOpenResumen(true);
  }, [validarInputs]);

  const cerrar = useCallback(() => onClose?.(), [onClose]);

  if (!open) return null;

  return (
    <>
      <div
        className="mi-modal__overlay"
        onClick={(e) => e.target.classList.contains("mi-modal__overlay") && cerrar()}
      >
        <div
          className="mi-modal__container"
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mi-modal__header">
            <div className="mi-modal__head-left">
              <h2 className="mi-modal__title">Factura ARCA (CAE)</h2>
              <p className="mi-modal__subtitle">
                Pago: {idPagoLabel} &nbsp;|&nbsp; {titulo}
              </p>
            </div>

            <button className="mi-modal__close" onClick={cerrar} aria-label="Cerrar" type="button">
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div className="mit-modal__body">
            {/* ✅ Tabs */}
            <div className="arca-tabs" role="tablist" aria-label="Secciones Factura ARCA">
              <button
                type="button"
                className={`arca-tab ${tab === "facturacion" ? "is-active" : ""}`}
                onClick={() => setTab("facturacion")}
                role="tab"
                aria-selected={tab === "facturacion"}
              >
                Facturación
              </button>

              <button
                type="button"
                className={`arca-tab ${tab === "detalle" ? "is-active" : ""}`}
                onClick={() => setTab("detalle")}
                role="tab"
                aria-selected={tab === "detalle"}
              >
                Detalle
              </button>
            </div>

            <div className="mit-modal__content">
              {/* ✅ Alertas globales (se ven en ambas pestañas) */}
              {error && (
                <div className="arca-alert arca-alert--error" role="alert">
                  {error}
                </div>
              )}

              {loadingCliente ? (
                <div className="arca-alert arca-alert--info" role="status">
                  Cargando datos de facturación del cliente...
                </div>
              ) : null}

              {loadingUsd ? (
                <div className="arca-alert arca-alert--info" role="status">
                  Obteniendo dólar oficial...
                </div>
              ) : usdErr ? (
                <div className="arca-alert arca-alert--error" role="alert">
                  {usdErr}
                </div>
              ) : usdRate ? (
                <div className="arca-alert arca-alert--info" role="status">
                  Dólar oficial (VENTA): <b>${Number(usdRate).toFixed(2)}</b> ARS
                </div>
              ) : null}

              {loadingPlanes ? (
                <div className="arca-alert arca-alert--info" role="status">
                  Cargando planes de mantenimiento...
                </div>
              ) : planesErr ? (
                <div className="arca-alert arca-alert--error" role="alert">
                  {planesErr}
                </div>
              ) : null}

              {loadingSistemas ? (
                <div className="arca-alert arca-alert--info" role="status">
                  Cargando sistemas del cliente...
                </div>
              ) : sistemasErr ? (
                <div className="arca-alert arca-alert--error" role="alert">
                  {sistemasErr}
                </div>
              ) : null}

              {/* ✅ PESTAÑA 1: Facturación */}
              {tab === "facturacion" && (
                <div className="mi-grid">
                  <article className="mi-card">
                    <h3 className="mi-card__title">Cliente / Servicio</h3>

                    <div className="arca-kv">
                      <div className="arca-kv__row">
                        <span className="arca-kv__k">Cliente</span>
                        <span className="arca-kv__v">{nombreCliente}</span>
                      </div>

                      <div className="arca-kv__row">
                        <span className="arca-kv__k">Sistema</span>
                        <span className="arca-kv__v">{nombreSistema}</span>
                      </div>

                      <div className="arca-kv__row">
                        <span className="arca-kv__k">Sistemas a facturar</span>
                        <span className="arca-kv__v">{cantSistemasSeleccionados || 0}</span>
                      </div>

                      <div className="arca-kv__row">
                        <span className="arca-kv__k">Total USD ref.</span>
                        <span className="arca-kv__v">{usdRate ? moneyUSD(totalUSD) : "Sin cotización"}</span>
                      </div>

                      <div className="arca-kv__row">
                        <span className="arca-kv__k">Total ARS (a facturar)</span>
                        <span className="arca-kv__v">{moneyARS(totalARS)}</span>
                      </div>

                      <div className="arca-kv__row">
                        <span className="arca-kv__k">Punto de venta</span>
                        <span className="arca-kv__v">{DEFAULT_PTO_VTA}</span>
                      </div>
                    </div>

                    <div className="arca-mini" style={{ marginTop: 10 }}>
                      {itemsDetalle.length ? (
                        <>
                          <b>Detalle:</b>{" "}
                          {itemsDetalle.map((it, idx) => {
                            const uiLabel =
                              it?.tipo === "mantenimiento" &&
                              it?.modo === "por_sistema" &&
                              it?.sistema_label
                                ? `${it.descripcion} (${it.sistema_label})`
                                : it.descripcion;

                            return (
                              <span key={`${it.plan_id || it.id}_${idx}`}>
                                {uiLabel} ({moneyARS(it.ars)}
                                {usdRate && Number(it.usd) > 0 ? ` · Ref. ${moneyUSD(it.usd)}` : ""})
                                {idx < itemsDetalle.length - 1 ? " • " : ""}
                              </span>
                            );
                          })}
                        </>
                      ) : (
                        <span>Seleccioná planes o cargá desarrollo para armar el monto.</span>
                      )}
                    </div>
                  </article>

                  <article className="mi-card">
                    <h3 className="mi-card__title">Datos de facturación</h3>

                    <div className="fl-grid">
                      <div className="fl-field">
                        <select
                          className="fl-input fl-select"
                          value={docTipo}
                          onChange={(e) => {
                            setDocTipo(Number(e.target.value));
                            setError("");
                          }}
                          ref={firstRef}
                        >
                          {DOC_TIPOS.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.label}
                            </option>
                          ))}
                        </select>
                        <label className="fl-label">Tipo doc</label>
                      </div>

                      <div className="fl-field">
                        <input
                          className="fl-input"
                          placeholder=" "
                          value={docNro}
                          onChange={(e) => {
                            setDocNro(e.target.value.replace(/\D/g, ""));
                            setError("");
                          }}
                          inputMode="numeric"
                        />
                        <label className="fl-label">Nro doc *</label>
                      </div>

                      <div className="fl-field fl-col-full">
                        <select
                          className="fl-input fl-select"
                          value={cbteTipo}
                          onChange={(e) => setCbteTipo(Number(e.target.value))}
                        >
                          {CBTE_TIPOS.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                        <label className="fl-label">Tipo comprobante</label>
                      </div>

                      <div className="fl-field fl-col-full">
                        <input className="fl-input" value={DEFAULT_PTO_VTA} disabled readOnly />
                        <label className="fl-label">Punto de venta *</label>
                      </div>
                    </div>

                    {clienteFact ? (
                      <div className="arca-mini" style={{ marginTop: 10 }}>
                        {clienteFact.razon_social || "—"} • {clienteFact.cond_iva || "—"}
                      </div>
                    ) : (
                      <div className="arca-mini" style={{ marginTop: 10 }}>
                        <b>DB:</b> (sin datos de facturación cargados)
                      </div>
                    )}
                  </article>
                </div>
              )}

              {/* ✅ PESTAÑA 2: Detalle */}
              {tab === "detalle" && (
                <div className="mi-grid">
                  {/* ✅ seleccionar sistemas del cliente */}
                  <article className="mi-card mi-card--full">
                    <h3 className="mi-card__title">Sistemas del cliente</h3>

                    {sistemasActivos.length === 0 ? (
                      <div className="arca-mini">No hay sistemas activos para este cliente.</div>
                    ) : (
                      <>
                        <div className="arca-mini" style={{ marginBottom: 10 }}>
                          Seleccioná a qué sistemas querés aplicar la factura (por defecto: todos los activos).
                        </div>

                        <div style={{ display: "flex", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
                          <button type="button" className="mit-btn mit-btn--ghost" onClick={selectAllSistemas}>
                            Seleccionar todos
                          </button>
                          <button type="button" className="mit-btn mit-btn--ghost" onClick={clearAllSistemas}>
                            Limpiar
                          </button>
                        </div>

                        <div className="arca-dd__list" style={{ maxHeight: 220, overflow: "auto", borderRadius: 12 }}>
                          {sistemasActivos.map((s) => {
                            const checked = (sistemasSel || []).includes(Number(s.id_sistema));
                            const label = `${s.nombre}${s.descripcion ? " • " + s.descripcion : ""}`;
                            return (
                              <label key={s.id_sistema} className={`arca-dd__item ${checked ? "is-checked" : ""}`}>
                                <input
                                  className="arca-dd__cb"
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleSistemaSel(s.id_sistema)}
                                />
                                <span className="arca-dd__fakecb" aria-hidden="true" />
                                <div className="arca-dd__meta">
                                  <div className="arca-dd__top">
                                    <span className="arca-dd__name">{label}</span>
                                  </div>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </article>

                  {/* ✅ modo mantenimiento */}
                  <article className="mi-card mi-card--full">
                    <h3 className="mi-card__title">Mantenimiento (ARS)</h3>

                    <div className="fl-grid" style={{ marginBottom: 10 }}>
                      <div className="fl-field fl-col-full">
                        <select
                          className="fl-input fl-select"
                          value={mantMode}
                          onChange={(e) => {
                            setMantMode(e.target.value);
                            setError("");
                          }}
                        >
                          <option value="global">
                            Mismo mantenimiento para todos los sistemas seleccionados (x{cantSistemasSeleccionados || 0})
                          </option>
                          <option value="por_sistema">Personalizado por sistema</option>
                        </select>
                        <label className="fl-label">Modo de mantenimiento</label>
                      </div>
                    </div>

                    {/* ===== GLOBAL ===== */}
                    {mantMode === "global" ? (
                      <>
                        <div ref={mantWrapRef} className="arca-dd">
                          <button
                            type="button"
                            className={`arca-dd__trigger ${mantOpen ? "is-open" : ""}`}
                            onClick={() => setMantOpen((v) => !v)}
                            disabled={loadingPlanes || !!planesErr}
                            title="Seleccionar planes de mantenimiento"
                          >
                            <span className="arca-dd__label">{selectedLabel}</span>
                            <span className="arca-dd__chev">{mantOpen ? "▲" : "▼"}</span>
                          </button>

                          {mantOpen && (
                            <div className="arca-dd__panel">
                              <div className="arca-dd__search">
                                <input
                                  className="fl-input arca-dd__search-input"
                                  placeholder="Buscar plan..."
                                  value={mantSearch}
                                  onChange={(e) => setMantSearch(e.target.value)}
                                />
                              </div>

                              {planesFiltrados.length === 0 ? (
                                <div className="arca-dd__empty">No hay planes para mostrar.</div>
                              ) : (
                                <div className="arca-dd__list">
                                  {planesFiltrados.map((p) => {
                                    const checked = mantSel.includes(Number(p.id));
                                    return (
                                      <label key={p.id} className={`arca-dd__item ${checked ? "is-checked" : ""}`}>
                                        <input
                                          className="arca-dd__cb"
                                          type="checkbox"
                                          checked={checked}
                                          onChange={() => toggleMant(p.id)}
                                        />
                                        <span className="arca-dd__fakecb" aria-hidden="true" />
                                        <div className="arca-dd__meta">
                                          <div className="arca-dd__top">
                                            <span className="arca-dd__name">{p.nombre}</span>
                                            <span className="arca-dd__amount">{moneyARS(p.monto)}</span>
                                          </div>
                                          {p.descripcion ? <div className="arca-dd__desc">{p.descripcion}</div> : null}
                                        </div>
                                      </label>
                                    );
                                  })}
                                </div>
                              )}

                              <div className="arca-dd__actions">
                                <button
                                  type="button"
                                  className="mit-btn mit-btn--ghost"
                                  onClick={() => setMantSel([])}
                                  title="Limpiar selección"
                                >
                                  Limpiar
                                </button>

                                <button
                                  type="button"
                                  className="mit-btn mit-btn--solid"
                                  onClick={() => setMantOpen(false)}
                                  title="Cerrar"
                                  style={{ marginLeft: "auto" }}
                                >
                                  Listo <FaCheck style={{ marginLeft: 8 }} />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="arca-mini" style={{ marginTop: 10 }}>
                          Se aplican los planes seleccionados a <b>{cantSistemasSeleccionados || 0}</b> sistemas (multiplicador).
                          {sistemasSelLabels.length > 0 && (
                            <>
                              {" "}
                              Sistemas: <b>{sistemasSelLabels.join(", ")}</b>
                            </>
                          )}
                        </div>
                      </>
                    ) : (
                      /* ===== PERSONALIZADO POR SISTEMA ===== */
                      <>
                        <div className="arca-mini" style={{ marginBottom: 10 }}>
                          Elegí planes por cada sistema seleccionado.
                        </div>

                        {(sistemasSel || []).length === 0 ? (
                          <div className="arca-alert arca-alert--error">Seleccioná al menos 1 sistema arriba.</div>
                        ) : (
                          <div style={{ display: "grid", gap: 12 }}>
                            {(sistemasSel || []).map((sid) => {
                              const s = (sistemasCliente || []).find((x) => Number(x.id_sistema) === Number(sid));
                              const sLabel = s ? `${s.nombre}${s.descripcion ? " • " + s.descripcion : ""}` : `Sistema ${sid}`;

                              const sel = mantSelBySistema?.[sid] || [];

                              return (
                                <div
                                  key={`s_${sid}`}
                                  style={{
                                    border: "1px solid rgba(255,255,255,0.08)",
                                    borderRadius: 12,
                                    padding: 12,
                                  }}
                                >
                                  <div style={{ fontWeight: 700, marginBottom: 8 }}>{sLabel}</div>

                                  <div className="arca-dd__list" style={{ maxHeight: 220, overflow: "auto" }}>
                                    {planesMant.map((p) => {
                                      const checked = sel.includes(Number(p.id));
                                      return (
                                        <label key={`p_${sid}_${p.id}`} className={`arca-dd__item ${checked ? "is-checked" : ""}`}>
                                          <input
                                            className="arca-dd__cb"
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() => toggleMantSistema(sid, p.id)}
                                          />
                                          <span className="arca-dd__fakecb" aria-hidden="true" />
                                          <div className="arca-dd__meta">
                                            <div className="arca-dd__top">
                                              <span className="arca-dd__name">{p.nombre}</span>
                                              <span className="arca-dd__amount">{moneyARS(p.monto)}</span>
                                            </div>
                                            {p.descripcion ? <div className="arca-dd__desc">{p.descripcion}</div> : null}
                                          </div>
                                        </label>
                                      );
                                    })}
                                  </div>

                                  <div className="arca-mini" style={{ marginTop: 8 }}>
                                    Seleccionados: <b>{sel.length}</b>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </>
                    )}
                  </article>

                  {/* ✅ Desarrollo manual */}
                  <article className="mi-card mi-card--full">
                    <h3 className="mi-card__title">Desarrollo (ARS) • Manual (global)</h3>

                    <div className="fl-grid">
                      <div className="fl-field fl-col-full">
                        <input
                          className="fl-input"
                          placeholder=" "
                          value={devDesc}
                          onChange={(e) => {
                            setDevDesc(e.target.value);
                            setError("");
                          }}
                        />
                        <label className="fl-label">Descripción (opcional)</label>
                      </div>

                      <div className="fl-field">
                        <input
                          className="fl-input"
                          placeholder=" "
                          value={devArs}
                          onChange={(e) => {
                            const v = e.target.value.replace(/[^\d.,]/g, "");
                            setDevArs(v);
                            const n = parseMoneyInput(v);
                            const r = Number(usdRate);
                            setDevUsd(Number.isFinite(r) && r > 0 && n > 0 ? (n / r).toFixed(2) : "");
                            setError("");
                          }}
                          inputMode="decimal"
                        />
                        <label className="fl-label">Monto (ARS)</label>
                      </div>

                      <div className="fl-field">
                        <input
                          className="fl-input"
                          placeholder=" "
                          value={devUsd}
                          onChange={(e) => {
                            const v = e.target.value.replace(/[^\d.,]/g, "");
                            setDevUsd(v);
                            const n = parseMoneyInput(v);
                            const r = Number(usdRate);
                            setDevArs(Number.isFinite(r) && r > 0 && n > 0 ? (n * r).toFixed(2) : "");
                            setError("");
                          }}
                          inputMode="decimal"
                        />
                        <label className="fl-label">Referencia (USD)</label>
                      </div>

                      <div className="arca-mini fl-col-full">
                        Podés escribir en pesos o en dólares. Si hay cotización cargada, el sistema calcula el otro importe automáticamente.
                      </div>
                    </div>
                  </article>

                  {/* ✅ Período / Vencimiento */}
                  <article className="mi-card mi-card--full">
                    <h3 className="mi-card__title">Período / Vencimiento</h3>

                    <div className="fl-grid">
                      <div
                        className="fl-field"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          openNativePicker(refDesde.current);
                        }}
                        onClick={() => openNativePicker(refDesde.current)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openNativePicker(refDesde.current);
                          }
                        }}
                      >
                        <input
                          ref={refDesde}
                          className="fl-input"
                          type="date"
                          value={periodoDesde}
                          onChange={(e) => {
                            setPeriodoDesde(e.target.value);
                            setError("");
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            openNativePicker(e.currentTarget);
                          }}
                        />
                        <label className="fl-label">Período desde *</label>
                      </div>

                      <div
                        className="fl-field"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          openNativePicker(refHasta.current);
                        }}
                        onClick={() => openNativePicker(refHasta.current)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openNativePicker(refHasta.current);
                          }
                        }}
                      >
                        <input
                          ref={refHasta}
                          className="fl-input"
                          type="date"
                          value={periodoHasta}
                          onChange={(e) => {
                            setPeriodoHasta(e.target.value);
                            setError("");
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            openNativePicker(e.currentTarget);
                          }}
                        />
                        <label className="fl-label">Período hasta *</label>
                      </div>

                      <div
                        className="fl-field"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          openNativePicker(refVto.current);
                        }}
                        onClick={() => openNativePicker(refVto.current)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openNativePicker(refVto.current);
                          }
                        }}
                      >
                        <input
                          ref={refVto}
                          className="fl-input"
                          type="date"
                          value={vtoPago}
                          onChange={(e) => {
                            setVtoPago(e.target.value);
                            setError("");
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            openNativePicker(e.currentTarget);
                          }}
                        />
                        <label className="fl-label">Vto. para el pago *</label>
                      </div>
                    </div>
                  </article>
                </div>
              )}
            </div>

            <div className="mit-actions">
              <button type="button" className="mit-btn mit-btn--ghost" onClick={cerrar}>
                Cancelar
              </button>

              <button
                type="button"
                className="mit-btn mit-btn--solid"
                onClick={irAResumen}
                title="Continuar al resumen"
              >
                Continuar <FaCheck style={{ marginLeft: 8 }} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <ModalFacturaArcaResumen
        open={openResumen}
        onClose={() => setOpenResumen(false)}
        onBack={() => setOpenResumen(false)}
        onCloseAll={() => onClose?.()}
        apiBase={apiBase}
        action={action}
        idOrganizacion={idOrganizacion}
        data={{
          ...data,

          id_sistema: idSistemaReal || data?.id_sistema || null,
          id_pago: idPagoReal > 0 ? idPagoReal : null,

          sistemas_facturar_ids: [...(sistemasSel || [])],
          mant_mode: mantMode,

          // ✅ FIX PRINCIPAL: pasar labels de sistemas seleccionados al raíz de data
          sistemas_labels: sistemasSelLabels,

          cliente_facturacion: clienteFact,

          usd_rate: usdRate,
          total_usd: totalUSD,
          total_ars: totalARS,

          items_facturacion: itemsDetalle,

          monto: totalARS,

          periodo_desde: dateToYMD8(periodoDesde),
          periodo_hasta: dateToYMD8(periodoHasta),
          vto_pago: dateToYMD8(vtoPago),

          periodo_desde_iso: periodoDesde,
          periodo_hasta_iso: periodoHasta,
          vto_pago_iso: vtoPago,
        }}
        docTipo={docTipo}
        docNro={docNro}
        cbteTipo={cbteTipo}
        ptoVta={String(DEFAULT_PTO_VTA)}
        onFacturada={onFacturada}
        onDone={onDone}
        forceTestAmount={FORCE_TEST_AMOUNT}
        testAmount={TEST_AMOUNT}
      />
    </>
  );
}