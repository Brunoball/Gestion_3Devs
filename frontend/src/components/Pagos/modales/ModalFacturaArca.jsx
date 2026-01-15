// frontend/src/components/Pagos/modales/ModalFacturaArca.jsx
import React, { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { FaCheck } from "react-icons/fa";
import "./ModalFacturaArca.css";
import "../../Trabajadores/modales/ModalEditarTrabajador.css";

// ✅ Modal resumen (emite + PDF)
import ModalFacturaArcaResumen from "./ModalFacturaArcaResumen";

const DOC_TIPOS = [
  { id: 80, label: "CUIT (80)" },
  { id: 96, label: "DNI (96)" },
];

// Por ahora “perfecto” para C (11)
const CBTE_TIPOS = [{ id: 11, label: "Factura C (11)" }];

/** ✅ MODO PRUEBA: fuerza el monto a $1000
 *  - Úsalo SOLO para pruebas.
 *  - Cuando termines: poné FORCE_TEST_AMOUNT=false
 */
const FORCE_TEST_AMOUNT = true;
const TEST_AMOUNT = 1000;

// ✅ PV fijo (default)
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
  // ✅ Hooks SIEMPRE ARRIBA
  const [docTipo, setDocTipo] = useState(80);
  const [docNro, setDocNro] = useState("");
  const [cbteTipo, setCbteTipo] = useState(11);

  // ✅ PV fijo: siempre 2 (no se edita)
  const [ptoVta, setPtoVta] = useState(String(DEFAULT_PTO_VTA));

  const [error, setError] = useState("");

  // ✅ abrir/cerrar resumen
  const [openResumen, setOpenResumen] = useState(false);

  const firstRef = useRef(null);

  const titulo = useMemo(
    () => `${data?.labelCliente || "Cliente"} • ${data?.labelSistema || "Sistema"}`,
    [data]
  );

  // ====== Datos del pago seleccionado ======
  const idPago = data?.id_pago || data?.id || "—";
  const nombreCliente = data?.labelCliente || data?.cliente || "—";
  const nombreSistema = data?.labelSistema || data?.sistema || "—";

  const montoReal = Number(data?.monto ?? data?.importe ?? 0);
  const monto = FORCE_TEST_AMOUNT ? Number(TEST_AMOUNT) : montoReal;

  useEffect(() => {
    if (!open) return;

    setError("");
    setOpenResumen(false);

    // reset inputs
    setDocTipo(80);
    setCbteTipo(11);
    setDocNro("");

    // ✅ PV fijo siempre 2
    setPtoVta(String(DEFAULT_PTO_VTA));

    setTimeout(() => firstRef.current?.focus?.(), 0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const validarInputs = useCallback(() => {
    const doc = String(docNro || "").replace(/\D/g, "");
    const id_pago = data?.id_pago;

    const pv = String(DEFAULT_PTO_VTA);

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
    const pvN = Number(pv);

    if (!Number.isFinite(docN) || docN <= 0) return { ok: false, msg: "Documento inválido." };
    if (!Number.isFinite(pvN) || pvN <= 0) return { ok: false, msg: "Punto de venta inválido." };

    return { ok: true, id_pago, docN, pvN };
  }, [data, docNro, docTipo]);

  const irAResumen = () => {
    setError("");
    const v = validarInputs();
    if (!v.ok) return setError(v.msg);

    setPtoVta(String(DEFAULT_PTO_VTA));
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
        data={data}
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
