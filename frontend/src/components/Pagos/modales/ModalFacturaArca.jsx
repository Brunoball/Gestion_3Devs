// frontend/src/components/Pagos/modales/ModalFacturaArca.jsx
import React, { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { FaCheck } from "react-icons/fa";
import "./ModalFacturaArca.css";
import "../../Trabajadores/modales/ModalEditarTrabajador.css";
import ModalFacturaArcaResumen from "./ModalFacturaArcaResumen";

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
  const lISO = `${y}-${String(mm).padStart(2, "0")}-${String(
    last.getDate()
  ).padStart(2, "0")}`;

  return { desde: fISO, hasta: lISO };
}

export default function ModalFacturaArca({
  open,
  onClose,
  apiBase,
  action,
  data,
  onFacturada,
  onDone,
}) {
  const [docTipo, setDocTipo] = useState(80);
  const [docNro, setDocNro] = useState("");
  const [cbteTipo, setCbteTipo] = useState(11);

  const [ptoVta] = useState(String(DEFAULT_PTO_VTA));

  const [error, setError] = useState("");
  const [openResumen, setOpenResumen] = useState(false);

  // ✅ cliente facturación (DB)
  const [clienteFact, setClienteFact] = useState(null);
  const [loadingCliente, setLoadingCliente] = useState(false);

  // ✅ fechas período
  const [periodoDesde, setPeriodoDesde] = useState("");
  const [periodoHasta, setPeriodoHasta] = useState("");
  const [vtoPago, setVtoPago] = useState("");

  const firstRef = useRef(null);

  // ✅ refs para abrir calendario al click en cualquier parte
  const refDesde = useRef(null);
  const refHasta = useRef(null);
  const refVto = useRef(null);

  const titulo = useMemo(
    () =>
      `${data?.labelCliente || "Cliente"} • ${data?.labelSistema || "Sistema"}`,
    [data]
  );

  const idPago = data?.id_pago || data?.id || "—";
  const nombreCliente = data?.labelCliente || data?.cliente || "—";
  const nombreSistema = data?.labelSistema || data?.sistema || "—";

  // ✅ monto REAL (sin modo prueba)
  const monto = useMemo(() => {
    const raw = data?.monto ?? data?.importe ?? 0;
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }, [data]);

  // ✅ helper: intentar abrir el date picker nativo
  const openNativePicker = (inputEl) => {
    if (!inputEl) return;
    // Muchos navegadores abren al focus+click; showPicker() está en Chrome/Edge modernos
    try {
      if (typeof inputEl.showPicker === "function") {
        inputEl.showPicker();
        return;
      }
    } catch {
      // ignore
    }
    inputEl.focus();
    // click adicional ayuda en algunos casos
    try {
      inputEl.click();
    } catch {
      // ignore
    }
  };

  // ✅ fetch helper local robusto
  const fetchJSON = useCallback(async (url, opts) => {
    const res = await fetch(url, opts);
    const raw = await res.text();
    const trimmed = (raw || "").trim();

    if (trimmed.startsWith("<")) {
      throw new Error("Backend devolvió HTML (error PHP).");
    }

    let j = null;
    try {
      j = trimmed ? JSON.parse(trimmed) : null;
    } catch {
      j = null;
    }

    const pickErr = () =>
      j?.mensaje || j?.error || j?.message || j?.detail || "";

    if (!res.ok) {
      const msg = pickErr();
      throw new Error(msg || `HTTP ${res.status}`);
    }

    if (j && typeof j === "object" && j.exito === false) {
      throw new Error(pickErr() || "Error servidor (exito=false)");
    }

    if (j == null) throw new Error("Respuesta inválida (no JSON)");
    return j;
  }, []);

  // ✅ al abrir: reset + precarga
  useEffect(() => {
    if (!open) return;

    setError("");
    setOpenResumen(false);

    // defaults
    setDocTipo(80);
    setCbteTipo(11);
    setDocNro("");
    setClienteFact(null);

    // ✅ default de fechas: mes seleccionado (data.anio + data.mes), si existe
    const { desde, hasta } = monthFirstLastISO(data?.anio, data?.mes);
    setPeriodoDesde(desde);
    setPeriodoHasta(hasta);
    setVtoPago(hasta);

    // ✅ SI VIENE desde Pagos.jsx, lo usamos y NO pedimos al backend
    const cfFromParent = data?.cliente_facturacion;

    if (cfFromParent !== undefined) {
      setClienteFact(cfFromParent || null);

      if (cfFromParent?.doc_tipo) setDocTipo(Number(cfFromParent.doc_tipo));
      if (cfFromParent?.doc_nro)
        setDocNro(String(cfFromParent.doc_nro).replace(/\D/g, ""));

      setTimeout(() => firstRef.current?.focus?.(), 0);
      return;
    }

    // ✅ si NO viene, recién ahí intentamos traerlo
    const id_pago_real = data?.id_pago;
    if (!id_pago_real) {
      setTimeout(() => firstRef.current?.focus?.(), 0);
      return;
    }

    (async () => {
      setLoadingCliente(true);
      try {
        const url = `${apiBase}?action=${action}&op=cliente_facturacion`;
        const resp = await fetchJSON(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            id_pago: Number(id_pago_real),
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
  }, [open, apiBase, action, data, fetchJSON]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const validarInputs = useCallback(() => {
    const doc = String(docNro || "").replace(/\D/g, "");
    const id_pago = data?.id_pago;

    if (!id_pago) return { ok: false, msg: "Falta id_pago." };
    if (!doc)
      return {
        ok: false,
        msg: "Ingresá el número de documento (solo números).",
      };

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

    if (!Number.isFinite(docN) || docN <= 0)
      return { ok: false, msg: "Documento inválido." };
    if (!Number.isFinite(pvN) || pvN <= 0)
      return { ok: false, msg: "Punto de venta inválido." };

    // ✅ validar monto real > 0 (para evitar facturas en 0)
    if (!Number.isFinite(monto) || monto <= 0) {
      return {
        ok: false,
        msg: "El monto del pago es inválido o está en 0. Verificá el registro del pago.",
      };
    }

    // ✅ validar fechas
    const d = dateToYMD8(periodoDesde);
    const h = dateToYMD8(periodoHasta);
    const v = dateToYMD8(vtoPago);

    if (!d) return { ok: false, msg: "Elegí Período Desde (fecha válida)." };
    if (!h) return { ok: false, msg: "Elegí Período Hasta (fecha válida)." };
    if (!v)
      return { ok: false, msg: "Elegí Vto. para el pago (fecha válida)." };
    if (h < d)
      return {
        ok: false,
        msg: "Período Hasta no puede ser menor que Desde.",
      };

    return {
      ok: true,
      id_pago,
      docN,
      pvN,
      periodo_desde: d,
      periodo_hasta: h,
      vto_pago: v,
    };
  }, [data, docNro, docTipo, periodoDesde, periodoHasta, vtoPago, monto]);

  const irAResumen = () => {
    setError("");
    const v = validarInputs();
    if (!v.ok) return setError(v.msg);
    setOpenResumen(true);
  };

  if (!open) return null;

  const cerrar = () => onClose?.();

  return (
    <>
      <div
        className="mi-modal__overlay"
        onClick={(e) =>
          e.target.classList.contains("mi-modal__overlay") && cerrar()
        }
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
                Pago: {idPago} &nbsp;|&nbsp; {titulo}
              </p>
            </div>

            <button
              className="mi-modal__close"
              onClick={cerrar}
              aria-label="Cerrar"
              type="button"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div className="mit-modal__body">
            <div className="mi-tabpanel is-active">
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
                      <span className="arca-kv__k">Monto</span>
                      <span className="arca-kv__v">{moneyARS(monto)}</span>
                    </div>
                    <div className="arca-kv__row">
                      <span className="arca-kv__k">Punto de venta</span>
                      <span className="arca-kv__v">{DEFAULT_PTO_VTA}</span>
                    </div>
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
                      <input
                        className="fl-input"
                        value={DEFAULT_PTO_VTA}
                        disabled
                        readOnly
                      />
                      <label className="fl-label">Punto de venta *</label>
                    </div>
                  </div>

                  {clienteFact ? (
                    <div className="arca-mini" style={{ marginTop: 10 }}>
                      {clienteFact.razon_social || "—"} •{" "}
                      {clienteFact.cond_iva || "—"}
                    </div>
                  ) : (
                    <div className="arca-mini" style={{ marginTop: 10 }}>
                      <b>DB:</b> (sin datos de facturación cargados)
                    </div>
                  )}
                </article>

                {/* ✅ período: clic en cualquier parte abre calendario */}
                <article className="mi-card mi-card--full">
                  <h3 className="mi-card__title">Período / Vencimiento</h3>

                  <div className="fl-grid">
                    <div
                      className="fl-field"
                      onMouseDown={(e) => {
                        // evita seleccionar texto y asegura apertura rápida
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
                          // si hicieron click directo en el input también abre
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
            </div>

            <div className="mit-actions">
              <button
                type="button"
                className="mit-btn mit-btn--ghost"
                onClick={cerrar}
              >
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
        data={{
          ...data,
          cliente_facturacion: clienteFact,

          // ✅ viaja al PDF y al backend (YYYYMMDD)
          periodo_desde: dateToYMD8(periodoDesde),
          periodo_hasta: dateToYMD8(periodoHasta),
          vto_pago: dateToYMD8(vtoPago),

          // opcional: conservar iso
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
