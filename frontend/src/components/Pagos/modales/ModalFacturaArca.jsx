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

const FORCE_TEST_AMOUNT = true;
const TEST_AMOUNT = 1000;

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

  const firstRef = useRef(null);

  const titulo = useMemo(
    () => `${data?.labelCliente || "Cliente"} • ${data?.labelSistema || "Sistema"}`,
    [data]
  );

  const idPago = data?.id_pago || data?.id || "—";
  const nombreCliente = data?.labelCliente || data?.cliente || "—";
  const nombreSistema = data?.labelSistema || data?.sistema || "—";

  const montoReal = Number(data?.monto ?? data?.importe ?? 0);
  const monto = FORCE_TEST_AMOUNT ? Number(TEST_AMOUNT) : montoReal;

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

    // ✅ SI VIENE desde Pagos.jsx, lo usamos y NO pedimos al backend
    const cfFromParent = data?.cliente_facturacion;

    if (cfFromParent !== undefined) {
      // ojo: puede ser null (no hay datos cargados) o un objeto
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
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            id_pago: Number(id_pago_real),
            // por compatibilidad (si tu backend lo pide en algún momento)
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

    return { ok: true, id_pago, docN, pvN };
  }, [data, docNro, docTipo]);

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
                Pago: {idPago} &nbsp;|&nbsp; {titulo}
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
                      <span className="arca-kv__v">
                        {moneyARS(monto)}{" "}
                        {FORCE_TEST_AMOUNT ? (
                          <span className="arca-mini" style={{ marginLeft: 8 }}>
                            (modo prueba)
                          </span>
                        ) : null}
                      </span>
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
                      <input className="fl-input" value={DEFAULT_PTO_VTA} disabled readOnly />
                      <label className="fl-label">Punto de venta *</label>
                    </div>
                  </div>

                  {clienteFact ? (
                    <div className="arca-mini" style={{ marginTop: 10 }}>
                      <b>DB:</b> {clienteFact.razon_social || "—"} • {clienteFact.cond_iva || "—"}
                    </div>
                  ) : (
                    <div className="arca-mini" style={{ marginTop: 10 }}>
                      <b>DB:</b> (sin datos de facturación cargados)
                    </div>
                  )}
                </article>

                <article className="mi-card mi-card--full">
                  <h3 className="mi-card__title">Acción</h3>
                  <div className="arca-help">
                    Continuar → confirmás → emitir → PDF profesional (ORIGINAL/DUPLICADO/TRIPLICADO)
                  </div>
                </article>
              </div>
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
        data={{
          ...data,
          cliente_facturacion: clienteFact,
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
