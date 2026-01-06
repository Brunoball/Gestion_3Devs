import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { FaCoins, FaTimes, FaCheck } from "react-icons/fa";
import BASE_URL from "../../../config/config";
import "./ModalPago.css";

/* =========================
   Dropdown Año estilo "pill"
========================= */
function YearDropdown({ value, options = [], onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onDocClick = (e) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const handleSelect = (y) => {
    onChange?.({ target: { value: y } });
    setOpen(false);
  };

  return (
    <div className="modpag_year-dd" ref={ref}>
      <button
        type="button"
        className={`modpag_year-trigger ${open ? "is-open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="modpag_year-ico" aria-hidden="true" />
        {value}
        <span className="modpag_year-caret" aria-hidden="true" />
      </button>

      {open && (
        <div className="modpag_year-menu" role="listbox" tabIndex={-1}>
          {options.map((y) => {
            const selected = Number(y) === Number(value);
            return (
              <button
                key={y}
                type="button"
                role="option"
                aria-selected={selected}
                className={`modpag_year-item ${selected ? "is-selected" : ""}`}
                onClick={() => handleSelect(y)}
              >
                {y}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* =========================
   MultiSelect Planes (checkbox dropdown)
========================= */
function MultiSelectPlanes({
  options = [],
  selectedIds = [],
  onChangeIds,
  disabled,
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onDocClick = (e) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const selected = useMemo(() => {
    const set = new Set((selectedIds || []).map((x) => Number(x)));
    return (options || []).filter((p) => set.has(Number(p.id)));
  }, [options, selectedIds]);

  const label = useMemo(() => {
    if (!selected.length) return "Seleccionar mantenimientos";
    if (selected.length === 1) return selected[0].nombre;
    return `${selected.length} seleccionados`;
  }, [selected]);

  const toggle = useCallback(
    (id) => {
      const nid = Number(id);
      const set = new Set((selectedIds || []).map((x) => Number(x)));
      if (set.has(nid)) set.delete(nid);
      else set.add(nid);
      onChangeIds?.(Array.from(set));
    },
    [selectedIds, onChangeIds]
  );

  const clearAll = useCallback(() => onChangeIds?.([]), [onChangeIds]);

  return (
    <div className="modpag_ms" ref={ref}>
      <button
        type="button"
        className={`modpag_ms-trigger ${open ? "is-open" : ""}`}
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="modpag_ms-label">{label}</span>
        <span className="modpag_ms-caret" aria-hidden="true" />
      </button>

      {open && (
        <div className="modpag_ms-menu" role="listbox" tabIndex={-1}>
          <div className="modpag_ms-top">
            <span className="modpag_ms-top-title">Mantenimientos</span>
            <button
              type="button"
              className="modpag_ms-clear"
              onClick={clearAll}
              disabled={!selectedIds?.length}
              title="Limpiar"
            >
              Limpiar
            </button>
          </div>

          <div className="modpag_ms-list">
            {options.length ? (
              options.map((p) => {
                const checked = (selectedIds || []).some(
                  (x) => Number(x) === Number(p.id)
                );
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`modpag_ms-item ${checked ? "is-checked" : ""}`}
                    onClick={() => toggle(p.id)}
                  >
                    <span className={`modpag_ms-box ${checked ? "on" : ""}`}>
                      {checked ? "✓" : ""}
                    </span>
                    <span className="modpag_ms-item-text">
                      <span className="modpag_ms-item-name">{p.nombre}</span>
                      <span className="modpag_ms-item-amt">
                        ${Number(p.monto || 0).toLocaleString("es-AR")}
                      </span>
                    </span>
                  </button>
                );
              })
            ) : (
              <div className="modpag_ms-empty">(No hay planes activos)</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================
   Helpers números (monto manual)
========================= */
function parseMoneyInput(raw) {
  if (raw == null) return 0;
  const s = String(raw).trim();
  if (!s) return 0;

  const cleaned = s.replace(/\$/g, "").replace(/\s/g, "");
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;

  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function sanitizeMoneyTyping(raw) {
  return String(raw ?? "").replace(/[^\d.,]/g, "");
}

export default function ModalPago({ id_sistema, cerrarModal, onPagoRealizado }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [detalle, setDetalle] = useState(null);
  const [pagosPorAnio, setPagosPorAnio] = useState({});

  const [mesesSeleccionados, setMesesSeleccionados] = useState([]);
  const [pagoExitoso, setPagoExitoso] = useState(false);

  // ✅ montos base (por mes)
  const [montoDesarrollo, setMontoDesarrollo] = useState(""); // editable

  const [fechaPago, setFechaPago] = useState(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  });

  const [idMedioPago, setIdMedioPago] = useState("");

  const [mesesCatalogo, setMesesCatalogo] = useState([]);
  const [mediosPago, setMediosPago] = useState([]);

  // ✅ planes mantenimiento + selección múltiple
  const [planesMantenimiento, setPlanesMantenimiento] = useState([]);
  const [planesSeleccionadosIds, setPlanesSeleccionadosIds] = useState([]);

  const hoy = useMemo(() => new Date(), []);
  const yearNow = hoy.getFullYear();
  const [selectedYear, setSelectedYear] = useState(yearNow);

  const API = useMemo(() => `${BASE_URL}/api.php`, []);

  /* =========================================================
     ✅ LISTAS
  ========================================================= */
  const LISTAS_API = useMemo(() => `${API}?action=listas`, [API]);

  const BACKEND_BASE = useMemo(() => {
    if (typeof BASE_URL !== "string") return "";
    return BASE_URL.endsWith("/routes") ? BASE_URL.replace(/\/routes$/, "") : BASE_URL;
  }, []);

  const LISTAS_DIRECT = useMemo(
    () => `${BACKEND_BASE}/modules/global/obtener_listas.php`,
    [BACKEND_BASE]
  );

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

  const normalizarMeses = useCallback((data) => {
    const raw = data?.listas?.meses || data?.meses || [];
    const arr = Array.isArray(raw) ? raw : [];
    return arr
      .map((m) => ({
        id_mes: Number(m?.id_mes ?? m?.id ?? null),
        mes: String(m?.mes ?? m?.nombre ?? "").trim(),
      }))
      .filter(
        (m) =>
          Number.isFinite(m.id_mes) &&
          m.id_mes >= 1 &&
          m.id_mes <= 12 &&
          m.mes
      )
      .sort((a, b) => a.id_mes - b.id_mes);
  }, []);

  const normalizarMedios = useCallback((data) => {
    const raw =
      data?.listas?.medios_pago || data?.medios_pago || data?.mediosPago || [];
    const arr = Array.isArray(raw) ? raw : [];
    return arr
      .map((x) => ({
        id_medio_pago: Number(x?.id_medio_pago ?? x?.id ?? null),
        nombre: String(x?.nombre ?? x?.Medio_Pago ?? x?.medio_pago ?? "").trim(),
      }))
      .filter((x) => Number.isFinite(x.id_medio_pago) && x.nombre)
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, []);

  const normalizarPlanes = useCallback((data) => {
    const raw =
      data?.listas?.planes_mantenimiento ||
      data?.planes_mantenimiento ||
      data?.planesMantenimiento ||
      [];
    const arr = Array.isArray(raw) ? raw : [];
    return arr
      .map((p) => ({
        id: Number(p?.id ?? p?.id_plan ?? null),
        nombre: String(p?.nombre ?? p?.plan ?? "").trim(),
        monto: Number(p?.monto ?? p?.precio ?? 0),
      }))
      .filter(
        (p) =>
          Number.isFinite(p.id) &&
          p.id > 0 &&
          p.nombre &&
          Number.isFinite(p.monto)
      )
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, []);

  // ✅ Cargar catálogos
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        let data;
        try {
          data = await fetchJSON(LISTAS_API, { method: "GET" });
        } catch {
          data = await fetchJSON(LISTAS_DIRECT, { method: "GET" });
        }
        if (!alive) return;

        const m = normalizarMeses(data);
        const mp = normalizarMedios(data);
        const pl = normalizarPlanes(data);

        setMesesCatalogo(m.length ? m : []);
        setMediosPago(mp.length ? mp : []);
        setPlanesMantenimiento(pl.length ? pl : []);

        if (!idMedioPago && mp.length) setIdMedioPago(String(mp[0].id_medio_pago));
      } catch {
        if (!alive) return;

        setMesesCatalogo(
          Array.from({ length: 12 }, (_, i) => ({
            id_mes: i + 1,
            mes: new Date(0, i)
              .toLocaleString("es", { month: "long" })
              .toUpperCase(),
          }))
        );
        setMediosPago([]);
        setPlanesMantenimiento([]);
      }
    })();

    return () => {
      alive = false;
    };
  }, [
    LISTAS_API,
    LISTAS_DIRECT,
    fetchJSON,
    normalizarMeses,
    normalizarMedios,
    normalizarPlanes,
    idMedioPago,
  ]);

  // ✅ total planes (por mes)
  const totalPlanes = useMemo(() => {
    if (!planesSeleccionadosIds?.length) return 0;
    const set = new Set(planesSeleccionadosIds.map((x) => Number(x)));
    const total = (planesMantenimiento || []).reduce((acc, p) => {
      if (set.has(Number(p.id))) return acc + Number(p.monto || 0);
      return acc;
    }, 0);
    return Math.round(total * 100) / 100;
  }, [planesSeleccionadosIds, planesMantenimiento]);

  // ✅ monto manual (por mes)
  const montoDesarrolloNum = useMemo(
    () => Math.round(parseMoneyInput(montoDesarrollo) * 100) / 100,
    [montoDesarrollo]
  );

  // ✅ BASE por mes (planes + desarrollo)
  const basePorMes = useMemo(() => {
    const t = Number(totalPlanes) + Number(montoDesarrolloNum);
    return Math.round(t * 100) / 100;
  }, [totalPlanes, montoDesarrolloNum]);

  // ✅ TOTAL FINAL = basePorMes * cantidadMesesSeleccionados
  //    Si no hay meses seleccionados => 0 (aunque haya mantenimientos / desarrollo cargado)
  const totalFinal = useMemo(() => {
    const cant = Number(mesesSeleccionados?.length || 0);
    if (!cant) return 0;
    const t = Number(basePorMes) * cant;
    return Math.round(t * 100) / 100;
  }, [basePorMes, mesesSeleccionados]);

  // ESC para cerrar
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape" || e.key === "Esc" || e.keyCode === 27) {
        e.preventDefault();
        cerrarModal?.();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [cerrarModal]);

  // ✅ detalle sistema + pagosPorAnio
  useEffect(() => {
    let alive = true;

    const run = async () => {
      setLoading(true);
      setError("");
      setPagoExitoso(false);
      setMesesSeleccionados([]);
      setPlanesSeleccionadosIds([]);
      setMontoDesarrollo("");

      try {
        if (!id_sistema) throw new Error("Falta id_sistema");

        const url = `${API}?action=pagos&op=detalle_sistema&id_sistema=${encodeURIComponent(
          id_sistema
        )}`;
        const data = await fetchJSON(url, { method: "GET" });
        if (!alive) return;

        setDetalle(data?.detalle || data?.sistema || data || null);

        const pagos =
          data?.pagosPorAnio && typeof data.pagosPorAnio === "object"
            ? data.pagosPorAnio
            : {};
        setPagosPorAnio(pagos);

        const years = Object.keys(pagos).map(Number).filter(Boolean);
        if (years.length) {
          const maxYear = Math.max(...years, yearNow);
          setSelectedYear((prev) =>
            Number.isFinite(Number(prev)) ? Number(prev) : maxYear
          );
        } else {
          setSelectedYear((prev) =>
            Number.isFinite(Number(prev)) ? Number(prev) : yearNow
          );
        }
      } catch (e) {
        if (!alive) return;
        setError(e?.message || "Error al obtener datos del sistema.");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    };

    run();
    return () => {
      alive = false;
    };
  }, [id_sistema, fetchJSON, yearNow, API]);

  const yearOptions = useMemo(() => {
    const years = new Set([yearNow, yearNow + 1, yearNow + 2]);
    Object.keys(pagosPorAnio || {}).forEach((y) => years.add(Number(y)));
    return Array.from(years).filter(Boolean).sort((a, b) => b - a);
  }, [pagosPorAnio, yearNow]);

  const lastFixedYearRef = useRef(null);
  useEffect(() => {
    if (!yearOptions.length) return;
    const curr = Number(selectedYear);
    if (yearOptions.includes(curr)) {
      lastFixedYearRef.current = curr;
      return;
    }
    const next = Number(yearOptions[0]);
    if (lastFixedYearRef.current === next) return;
    lastFixedYearRef.current = next;

    setSelectedYear(next);
    setMesesSeleccionados([]);
    setPagoExitoso(false);
    setError("");
  }, [yearOptions, selectedYear]);

  const meses = useMemo(() => {
    const catalogo =
      Array.isArray(mesesCatalogo) && mesesCatalogo.length
        ? mesesCatalogo
        : Array.from({ length: 12 }, (_, i) => ({
            id_mes: i + 1,
            mes: new Date(0, i)
              .toLocaleString("es", { month: "long" })
              .toUpperCase(),
          }));

    return catalogo.map((m) => ({
      id: Number(m.id_mes),
      nombre: `${String(m.mes || "").toUpperCase()} ${selectedYear}`,
    }));
  }, [mesesCatalogo, selectedYear]);

  const isMesPagado = useCallback(
    (mesId) => {
      const arr = pagosPorAnio?.[selectedYear] || [];
      return Array.isArray(arr) && arr.includes(mesId);
    },
    [pagosPorAnio, selectedYear]
  );

  const disponiblesIds = useMemo(
    () => meses.filter((m) => !isMesPagado(m.id)).map((m) => m.id),
    [meses, isMesPagado]
  );

  const todosSeleccionados = useMemo(() => {
    return (
      disponiblesIds.length > 0 &&
      disponiblesIds.every((id) => mesesSeleccionados.includes(id)) &&
      mesesSeleccionados.length === disponiblesIds.length
    );
  }, [disponiblesIds, mesesSeleccionados]);

  const handleSeleccionarMes = useCallback((mesId, yaPagado) => {
    if (yaPagado) return;
    setMesesSeleccionados((prev) =>
      prev.includes(mesId) ? prev.filter((m) => m !== mesId) : [...prev, mesId]
    );
  }, []);

  const handleSeleccionarTodos = useCallback(() => {
    if (!disponiblesIds.length) {
      setMesesSeleccionados([]);
      return;
    }
    setMesesSeleccionados((prev) => {
      const allSelected = disponiblesIds.every((id) => prev.includes(id));
      return allSelected ? [] : [...disponiblesIds];
    });
  }, [disponiblesIds]);

  const onChangeYear = useCallback((e) => {
    const val = Number(e?.target?.value);
    if (!val) return;
    setSelectedYear(val);
    setMesesSeleccionados([]);
    setPagoExitoso(false);
    setError("");
  }, []);

  const planesSeleccionados = useMemo(() => {
    const set = new Set(planesSeleccionadosIds.map((x) => Number(x)));
    return (planesMantenimiento || []).filter((p) => set.has(Number(p.id)));
  }, [planesSeleccionadosIds, planesMantenimiento]);

  // ✅ registrar pago REAL
  const handleRealizarPago = useCallback(async () => {
    if (!id_sistema) return;

    if (mesesSeleccionados.length === 0) {
      setError("Seleccioná al menos un mes.");
      return;
    }

    // ✅ ahora puede ser: planes y/o desarrollo manual (POR MES)
    const tienePlanes = planesSeleccionadosIds.length > 0;
    const tieneDesarrollo = montoDesarrolloNum > 0;

    if (!tienePlanes && !tieneDesarrollo) {
      setError("Seleccioná al menos un mantenimiento o ingresá un monto por desarrollo.");
      return;
    }

    // ✅ validamos la base por mes
    const base = Number(basePorMes);
    if (!Number.isFinite(base) || base <= 0) {
      setError("El monto por mes es inválido. Revisá mantenimientos y/o monto por desarrollo.");
      return;
    }

    // ✅ total final = base * cantidadMeses
    const montoNum = Number(totalFinal);
    if (!Number.isFinite(montoNum) || montoNum <= 0) {
      setError("El total calculado es inválido. Revisá los meses y montos.");
      return;
    }

    if (!fechaPago) {
      setError("Seleccioná una fecha de pago.");
      return;
    }

    if (!idMedioPago) {
      setError("Seleccioná un medio de pago.");
      return;
    }

    setError("");

    try {
      const url = `${API}?action=pagos&op=registrar_pago`;

      const payload = {
        id_sistema: Number(id_sistema),
        anio: Number(selectedYear),
        meses: mesesSeleccionados,

        // ✅ MONTO FINAL (basePorMes * cantidadMeses)
        monto: montoNum,

        fecha_pago: String(fechaPago),
        id_medio_pago: Number(idMedioPago),

        // ✅ EXTRA (por mes, backend decide qué hace con esto)
        planes_seleccionados: planesSeleccionadosIds.map((x) => Number(x)),
        monto_desarrollo: tieneDesarrollo ? montoDesarrolloNum : 0,
      };

      const result = await fetchJSON(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (result?.exito !== true) {
        throw new Error(result?.mensaje || "Error al registrar el pago");
      }

      const insertados = Array.isArray(result?.insertados)
        ? result.insertados
        : mesesSeleccionados;

      setPagosPorAnio((prev) => {
        const copia = { ...(prev || {}) };
        const set = new Set(copia[selectedYear] || []);
        insertados.forEach((m) => set.add(Number(m)));
        copia[selectedYear] = Array.from(set).sort((a, b) => a - b);
        return copia;
      });

      setPagoExitoso(true);
      setMesesSeleccionados([]);
      setPlanesSeleccionadosIds([]);
      setMontoDesarrollo("");
      onPagoRealizado?.();
    } catch (e) {
      setError(e?.message || "Ocurrió un error al realizar el pago.");
    }
  }, [
    id_sistema,
    mesesSeleccionados,
    fechaPago,
    idMedioPago,
    selectedYear,
    fetchJSON,
    onPagoRealizado,
    API,
    planesSeleccionadosIds,
    montoDesarrolloNum,
    totalFinal,
    basePorMes,
  ]);

  const tituloCliente = useMemo(() => {
    const c = detalle?.cliente || detalle?.nombre_cliente || detalle?.cliente_nombre;
    const s = detalle?.sistema || detalle?.nombre_sistema || detalle?.nombre;
    if (c && s) return `${c} • ${s}`;
    return s || c || "Registro de Pagos";
  }, [detalle]);

  // ✅ botón pagar habilitado solo si:
  // - hay meses seleccionados
  // - basePorMes > 0 (aunque totalFinal ya depende de meses, dejamos claro)
  const puedePagar = useMemo(() => {
    if (mesesSeleccionados.length === 0) return false;
    if (basePorMes <= 0) return false;
    return true;
  }, [mesesSeleccionados.length, basePorMes]);

  if (loading) {
    return (
      <div className="modpag_overlay">
        <div className="modpag_contenido">
          <div className="modpag_header">
            <div className="modpag_header-left">
              <div className="modpag_icon-circle">
                <FaCoins size={20} />
              </div>
              <div className="modpag_header-texts">
                <h2 className="modpag_title">{tituloCliente}</h2>
              </div>
            </div>
            <button className="modpag_close-btn" disabled type="button">
              ✕
            </button>
          </div>
          <div className="modpag_body">
            <div className="modpag_loading-state">
              <div className="modpag_spinner"></div>
              <span>Cargando datos...</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="modpag_overlay">
        <div className="modpag_contenido">
          <div className="modpag_header">
            <div className="modpag_header-left">
              <div className="modpag_icon-circle">
                <FaCoins size={20} />
              </div>
              <div className="modpag_header-texts">
                <h2 className="modpag_title">{tituloCliente}</h2>
              </div>
            </div>
            <button className="modpag_close-btn" onClick={cerrarModal} type="button">
              ✕
            </button>
          </div>
          <div className="modpag_body">
            <p className="modpag_error-banner">{error}</p>
          </div>
          <div className="modpag_footer modpag_footer-sides">
            <div className="modpag_footer-left" />
            <div className="modpag_footer-right">
              <button className="modpag_btn modpag_btn-secondary" onClick={cerrarModal} type="button">
                <span className="only-desktop">Cerrar</span>
                <FaTimes className="only-mobile-inline" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (pagoExitoso) {
    return (
      <div className="modpag_overlay">
        <div className="modpag_contenido">
          <div className="modpag_header">
            <div className="modpag_header-left">
              <div className="modpag_icon-circle">
                <FaCoins size={20} />
              </div>
              <div className="modpag_header-texts">
                <h2 className="modpag_title">{tituloCliente}</h2>
              </div>
            </div>
            <button className="modpag_close-btn" type="button" onClick={cerrarModal}>
              ✕
            </button>
          </div>
          <div className="modpag_body">
            <div className="modpag_success">
              <h2 className="modpag_success-title">¡Pago realizado con éxito!</h2>
              <p className="modpag_success-subtitle">
                Ya quedó marcado como pagado en el año {selectedYear}.
              </p>
            </div>
          </div>
          <div className="modpag_footer modpag_footer-sides">
            <div className="modpag_footer-left" />
            <div className="modpag_footer-right">
              <button className="modpag_btn modpag_btn-secondary" type="button" onClick={cerrarModal}>
                <span className="only-desktop">Cerrar</span>
                <FaTimes className="only-mobile-inline" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modpag_overlay">
      <div className="modpag_contenido">
        <div className="modpag_header">
          <div className="modpag_header-left">
            <div className="modpag_icon-circle">
              <FaCoins size={20} />
            </div>
            <div className="modpag_header-texts">
              <h2 className="modpag_title">{tituloCliente}</h2>
            </div>
          </div>
          <button className="modpag_close-btn" onClick={cerrarModal} type="button">
            ✕
          </button>
        </div>

        <div className="modpag_body">
          <div className="modpag_info-summary">
            <div className="modpag_info-row">
              <div className="modpag_info-item">
                <span className="modpag_info-label">Fecha pago</span>
                <input
                  type="date"
                  value={fechaPago}
                  onChange={(e) => setFechaPago(e.target.value)}
                  className="modpag_input"
                />
              </div>

              <div className="modpag_info-item" style={{ minWidth: 260 }}>
                <span className="modpag_info-label">Mantenimientos</span>
                <MultiSelectPlanes
                  options={planesMantenimiento}
                  selectedIds={planesSeleccionadosIds}
                  onChangeIds={setPlanesSeleccionadosIds}
                  disabled={!planesMantenimiento.length}
                />
              </div>

              <div className="modpag_info-item" style={{ minWidth: 170 }}>
                <span className="modpag_info-label">Monto desarrollo</span>
                <input
                  type="text"
                  value={montoDesarrollo}
                  onChange={(e) => setMontoDesarrollo(sanitizeMoneyTyping(e.target.value))}
                  className="modpag_input"
                  placeholder="0"
                  inputMode="decimal"
                />
              </div>

              <div className="modpag_info-item" style={{ minWidth: 200 }}>
                <span className="modpag_info-label">Medio de pago</span>
                <select
                  className="modpag_input"
                  value={idMedioPago}
                  onChange={(e) => setIdMedioPago(e.target.value)}
                >
                  {mediosPago.length ? (
                    mediosPago.map((mp) => (
                      <option key={mp.id_medio_pago} value={mp.id_medio_pago}>
                        {mp.nombre}
                      </option>
                    ))
                  ) : (
                    <option value="">(No hay medios de pago)</option>
                  )}
                </select>
              </div>
            </div>

            {planesSeleccionados.length > 0 && (
              <div className="modpag_planes_chips">
                {planesSeleccionados.map((p) => (
                  <span key={p.id} className="modpag_chip">
                    {p.nombre} · ${Number(p.monto).toLocaleString("es-AR")}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="modpag_periodos-section">
            <div className="modpag_section-header">
              <h4 className="modpag_section-title">Meses</h4>

              <div className="modpag_section-header-actions" style={{ display: "flex", gap: 8 }}>
                <YearDropdown value={selectedYear} options={yearOptions} onChange={onChangeYear} />

                <button
                  className="modpag_btn modpag_btn-small modpag_btn-terciario"
                  onClick={handleSeleccionarTodos}
                  disabled={disponiblesIds.length === 0}
                  type="button"
                >
                  {todosSeleccionados ? "Deseleccionar todos" : "Seleccionar todos"}
                  {mesesSeleccionados.length > 0 && (
                    <span className="only-desktop"> ({mesesSeleccionados.length})</span>
                  )}
                </button>
              </div>
            </div>

            <div className="modpag_periodos-grid-container">
              <div className="modpag_periodos-grid">
                {meses.map((mes) => {
                  const yaPagado = isMesPagado(mes.id);
                  const checked = mesesSeleccionados.includes(mes.id);

                  return (
                    <div
                      key={`${selectedYear}-${mes.id}`}
                      className={`modpag_periodo-card ${yaPagado ? "modpag_pagado" : ""} ${
                        checked ? "modpag_seleccionado" : ""
                      }`}
                      onClick={() => handleSeleccionarMes(mes.id, yaPagado)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleSeleccionarMes(mes.id, yaPagado);
                        }
                      }}
                    >
                      <div className="modpag_periodo-checkbox">
                        <input
                          type="checkbox"
                          id={`periodo-${selectedYear}-${mes.id}`}
                          checked={checked}
                          onChange={(e) => {
                            e.stopPropagation();
                            handleSeleccionarMes(mes.id, yaPagado);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          disabled={yaPagado}
                        />
                        <span className="modpag_checkmark"></span>
                      </div>

                      <label
                        htmlFor={`periodo-${selectedYear}-${mes.id}`}
                        className="modpag_periodo-label"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {mes.nombre}
                        {yaPagado && (
                          <span className="modpag_periodo-status">
                            <span className="modpag_periodo-status-text">Pagado</span>
                          </span>
                        )}
                      </label>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="modpag_footer modpag_footer-sides">
          <div className="modpag_footer-left">
            <div className="modpag_footer-total">
              <span className="modpag_footer-total-label">Total:</span>
              <span className="modpag_footer-total-value">
                ${Number(totalFinal || 0).toLocaleString("es-AR")}
              </span>
            </div>
          </div>

          <div className="modpag_footer-right">
            <button className="modpag_btn modpag_btn-secondary" onClick={cerrarModal} type="button">
              <span className="only-desktop">Cerrar</span>
              <FaTimes className="only-mobile-inline" />
            </button>

            <button
              className="modpag_btn modpag_btn-primary"
              onClick={handleRealizarPago}
              disabled={!puedePagar}
              title={`Registrar pago en ${selectedYear}`}
              type="button"
            >
              <span className="only-desktop">Realizar Pago</span>
              <FaCheck className="only-mobile-inline" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
