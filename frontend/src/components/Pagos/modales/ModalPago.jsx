// src/components/Pagos/modales/ModalPago.jsx
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

export default function ModalPago({ id_sistema, cerrarModal, onPagoRealizado }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [detalle, setDetalle] = useState(null);
  const [pagosPorAnio, setPagosPorAnio] = useState({});

  const [mesesSeleccionados, setMesesSeleccionados] = useState([]);
  const [pagoExitoso, setPagoExitoso] = useState(false);

  const [monto, setMonto] = useState("");
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

  const hoy = useMemo(() => new Date(), []);
  const yearNow = hoy.getFullYear();
  const [selectedYear, setSelectedYear] = useState(yearNow);

  const API = useMemo(() => `${BASE_URL}/api.php`, []);

  // ✅ EXACTAMENTE IGUAL QUE EN Pagos.jsx
  const GLOBAL_ACTION = "global";
  const GLOBAL_OP = "listas";
  const GLOBAL_API = useMemo(
    () => `${API}?action=${GLOBAL_ACTION}&op=${GLOBAL_OP}`,
    [API]
  );

  // ✅ fallback directo (mismo enfoque que Pagos.jsx)
  const GLOBAL_DIRECT = useMemo(
    () => `${BASE_URL}/../modules/global/obtener_listas.php`,
    []
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
    const raw = data?.listas?.meses || data?.meses || data?.listas?.mes || [];
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
      data?.listas?.medios_pago ||
      data?.mediosPago ||
      data?.medios_pago ||
      [];
    const arr = Array.isArray(raw) ? raw : [];
    return arr
      .map((x) => ({
        id_medio_pago: Number(x?.id_medio_pago ?? x?.id ?? null),
        nombre: String(
          x?.nombre ?? x?.Medio_Pago ?? x?.medio_pago ?? ""
        ).trim(),
      }))
      .filter((x) => Number.isFinite(x.id_medio_pago) && x.nombre);
  }, []);

  // ✅ Catálogos desde GLOBAL_API
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        let data;
        try {
          data = await fetchJSON(GLOBAL_API, { method: "GET" });
        } catch {
          data = await fetchJSON(GLOBAL_DIRECT, { method: "GET" });
        }
        if (!alive) return;

        const m = normalizarMeses(data);
        const mp = normalizarMedios(data);

        setMesesCatalogo(m.length ? m : []);
        setMediosPago(mp.length ? mp : []);

        if (!idMedioPago && mp.length) {
          setIdMedioPago(String(mp[0].id_medio_pago));
        }
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
      }
    })();

    return () => {
      alive = false;
    };
  }, [
    GLOBAL_API,
    GLOBAL_DIRECT,
    fetchJSON,
    normalizarMeses,
    normalizarMedios,
    idMedioPago,
  ]);

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

      try {
        if (!id_sistema) throw new Error("Falta id_sistema");

        const url = `${BASE_URL}/api.php?action=pagos&op=detalle_sistema&id_sistema=${encodeURIComponent(
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
  }, [id_sistema, fetchJSON, yearNow]);

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

  // ✅ registrar pago REAL
  const handleRealizarPago = useCallback(async () => {
    if (!id_sistema) return;

    if (mesesSeleccionados.length === 0) {
      setError("Seleccioná al menos un mes.");
      return;
    }

    const montoNum = Number(monto);
    if (!Number.isFinite(montoNum) || montoNum <= 0) {
      setError("Ingresá un monto válido.");
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
      const url = `${BASE_URL}/api.php?action=pagos&op=registrar_pago`;

      const payload = {
        id_sistema: Number(id_sistema),
        anio: Number(selectedYear),
        meses: mesesSeleccionados,
        monto: montoNum,
        fecha_pago: String(fechaPago), // ✅ esta es la que ahora el backend guarda
        id_medio_pago: Number(idMedioPago),
      };

      const result = await fetchJSON(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      // backend devuelve { exito: true, insertados:[], omitidos:[] }
      if (result?.exito !== true) {
        throw new Error(result?.mensaje || "Error al registrar el pago");
      }

      // ✅ reflejar en UI lo insertado
      const insertados = Array.isArray(result?.insertados)
        ? result.insertados
        : mesesSeleccionados;

      setPagosPorAnio((prev) => {
        const copia = { ...(prev || {}) };
        const arr = new Set(copia[selectedYear] || []);
        insertados.forEach((m) => arr.add(Number(m)));
        copia[selectedYear] = Array.from(arr).sort((a, b) => a - b);
        return copia;
      });

      setPagoExitoso(true);

      // opcional: limpiar campos
      setMesesSeleccionados([]);
      // setMonto(""); // si querés que se limpie, descomentá
      onPagoRealizado?.();
    } catch (e) {
      setError(e?.message || "Ocurrió un error al realizar el pago.");
    }
  }, [
    id_sistema,
    mesesSeleccionados,
    monto,
    fechaPago,
    idMedioPago,
    selectedYear,
    fetchJSON,
    onPagoRealizado,
  ]);

  const tituloCliente = useMemo(() => {
    const c = detalle?.cliente || detalle?.nombre_cliente || detalle?.cliente_nombre;
    const s = detalle?.sistema || detalle?.nombre_sistema || detalle?.nombre;
    if (c && s) return `${c} • ${s}`;
    return s || c || "Registro de Pagos";
  }, [detalle]);

  if (loading) {
    return (
      <div className="modpag_overlay">
        <div className="modpag_contenido">
          <div className="modpag_header">
            <div className="modpag_header-left">
              <div className="modpag_icon-circle"><FaCoins size={20} /></div>
              <div className="modpag_header-texts"><h2 className="modpag_title">{tituloCliente}</h2></div>
            </div>
            <button className="modpag_close-btn" disabled type="button">✕</button>
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
              <div className="modpag_icon-circle"><FaCoins size={20} /></div>
              <div className="modpag_header-texts"><h2 className="modpag_title">{tituloCliente}</h2></div>
            </div>
            <button className="modpag_close-btn" onClick={cerrarModal} type="button">✕</button>
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
              <div className="modpag_icon-circle"><FaCoins size={20} /></div>
              <div className="modpag_header-texts"><h2 className="modpag_title">{tituloCliente}</h2></div>
            </div>
            <button className="modpag_close-btn" type="button" onClick={cerrarModal}>✕</button>
          </div>
          <div className="modpag_body">
            <div className="modpag_success">
              <h2 className="modpag_success-title">¡Pago realizado con éxito!</h2>
              <p className="modpag_success-subtitle">Ya quedó marcado como pagado en el año {selectedYear}.</p>
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
            <div className="modpag_icon-circle"><FaCoins size={20} /></div>
            <div className="modpag_header-texts">
              <h2 className="modpag_title">{tituloCliente}</h2>
            </div>
          </div>
          <button className="modpag_close-btn" onClick={cerrarModal} type="button">✕</button>
        </div>

        <div className="modpag_body">
          <div className="modpag_info-summary">
            <div className="modpag_info-row" style={{ gap: 12, display: "flex", flexWrap: "wrap" }}>
              <div className="modpag_info-item" style={{ minWidth: 140 }}>
                <span className="modpag_info-label">Fecha pago</span>
                <input
                  type="date"
                  value={fechaPago}
                  onChange={(e) => setFechaPago(e.target.value)}
                  className="modpag_input"
                />
              </div>

              <div className="modpag_info-item" style={{ minWidth: 140 }}>
                <span className="modpag_info-label">Monto</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  className="modpag_input"
                  placeholder="0.00"
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
          <div className="modpag_footer-left" />
          <div className="modpag_footer-right">
            <button className="modpag_btn modpag_btn-secondary" onClick={cerrarModal} type="button">
              <span className="only-desktop">Cerrar</span>
              <FaTimes className="only-mobile-inline" />
            </button>

            <button
              className="modpag_btn modpag_btn-primary"
              onClick={handleRealizarPago}
              disabled={mesesSeleccionados.length === 0}
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
