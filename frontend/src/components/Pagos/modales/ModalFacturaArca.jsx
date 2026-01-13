// frontend/src/components/Pagos/modales/ModalFacturaArca.jsx
import React, { useMemo, useState, useCallback, useEffect, useRef } from "react";
import jsPDF from "jspdf";
import QRCode from "qrcode";
import { FaCheck } from "react-icons/fa";
import "./ModalFacturaArca.css";
import "../../Trabajadores/modales/ModalEditarTrabajador.css";

const DOC_TIPOS = [
  { id: 80, label: "CUIT (80)" },
  { id: 96, label: "DNI (96)" },
];

// Por ahora “perfecto” para C (11)
const CBTE_TIPOS = [{ id: 11, label: "Factura C (11)" }];

/** ✅ MODO PRUEBA: fuerza el monto a $1000
 *  - Úsalo SOLO para pruebas en producción.
 *  - Cuando termines: poné FORCE_TEST_AMOUNT=false o TEST_AMOUNT=null
 */
const FORCE_TEST_AMOUNT = true;
const TEST_AMOUNT = 1000;

function ymdToHuman(ymd) {
  if (!ymd) return "";
  const s = String(ymd);

  if (s.length === 8 && /^\d{8}$/.test(s)) {
    // yyyymmdd
    return `${s.slice(6, 8)}/${s.slice(4, 6)}/${s.slice(0, 4)}`;
  }
  if (s.length >= 10 && s.includes("-")) {
    const [y, m, d] = s.slice(0, 10).split("-");
    return `${d}/${m}/${y}`;
  }
  return s;
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

function clampText(s, max = 90) {
  const t = String(s ?? "");
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + "…";
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
  // ✅ Hooks SIEMPRE ARRIBA (nunca después de returns condicionales)
  const [docTipo, setDocTipo] = useState(80);
  const [docNro, setDocNro] = useState("");
  const [cbteTipo, setCbteTipo] = useState(11);
  const [ptoVta, setPtoVta] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // ✅ confirmación antes de emitir
  const [confirm, setConfirm] = useState(false);

  const firstRef = useRef(null);

  const titulo = useMemo(
    () => `${data?.labelCliente || "Cliente"} • ${data?.labelSistema || "Sistema"}`,
    [data]
  );

  // ====== Datos “lo que se va a facturar” (desde el pago seleccionado) ======
  const idPago = data?.id_pago || data?.id || "—";
  const nombreCliente = data?.labelCliente || data?.cliente || "—";
  const nombreSistema = data?.labelSistema || data?.sistema || "—";

  // ✅ MONTO FORZADO A 1000 (pruebas)
  const montoReal = Number(data?.monto ?? data?.importe ?? 0);
  const monto = FORCE_TEST_AMOUNT ? Number(TEST_AMOUNT) : montoReal;

  const fechaPagoISO = String(data?.fecha_pago || data?.fecha || "").slice(0, 10);

  const docLabel = useMemo(() => {
    const it = DOC_TIPOS.find((x) => x.id === Number(docTipo));
    return it?.label || String(docTipo);
  }, [docTipo]);

  // ✅ RESUMEN (NO condicional, siempre se calcula)
  const resumen = useMemo(() => {
    const doc = String(docNro || "").replace(/\D/g, "");
    const pv = String(ptoVta || "").replace(/\D/g, "");

    return {
      pago: idPago,
      cliente: nombreCliente,
      sistema: nombreSistema,
      fechaISO: fechaPagoISO,
      montoTxt: moneyARS(monto),
      comprobante: "Factura C (11)",
      receptorTxt: doc ? `${docLabel}: ${doc}` : "—",
      pvTxt: pv || "—",
    };
  }, [idPago, nombreCliente, nombreSistema, fechaPagoISO, monto, docNro, ptoVta, docLabel]);

  useEffect(() => {
    if (!open) return;
    setError("");
    setConfirm(false);
    setDocTipo(80);
    setCbteTipo(11);
    setDocNro("");
    setPtoVta("");
    setTimeout(() => firstRef.current?.focus?.(), 0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // ✅ Convierte cualquier cosa a texto (string, array, object, etc.)
  const toText = useCallback((v) => {
    if (v == null) return "";
    if (typeof v === "string") return v;
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    try {
      return JSON.stringify(v);
    } catch {
      try {
        return String(v);
      } catch {
        return "";
      }
    }
  }, []);

  // ✅ fetch robusto: siempre intenta sacar el mensaje real del backend
  const fetchJSON = useCallback(
    async (url, opts) => {
      const res = await fetch(url, opts);

      // Primero leemos como texto para poder diagnosticar si vino HTML/500
      const raw = await res.text();

      let j = null;
      try {
        j = raw ? JSON.parse(raw) : null;
      } catch {
        j = null;
      }

      // Helpers para armar el mejor error posible
      const pickErr = () =>
        toText(j?.mensaje) ||
        toText(j?.error) ||
        toText(j?.message) ||
        toText(j?.detail) ||
        "";

      // HTTP error (4xx/5xx)
      if (!res.ok) {
        const msg = pickErr();
        if (msg) throw new Error(msg);

        const preview = (raw || "").slice(0, 300).replace(/\s+/g, " ").trim();
        throw new Error(
          `HTTP ${res.status} ${res.statusText || ""}`.trim() +
            (preview ? ` • Resp: ${preview}` : "")
        );
      }

      // Respuesta OK pero exito=false
      if (j && typeof j === "object" && j.exito === false) {
        const msg = pickErr() || "Error servidor (exito=false)";
        throw new Error(msg);
      }

      if (j == null) {
        const preview = (raw || "").slice(0, 300).replace(/\s+/g, " ").trim();
        throw new Error(
          preview
            ? `Respuesta inválida (no JSON): ${preview}`
            : "Respuesta inválida (no JSON)"
        );
      }

      return j;
    },
    [toText]
  );

  const generarPdf = useCallback(
    async (fact) => {
      const doc = new jsPDF({ unit: "pt", format: "a4" });

      // ✅ MONTO FORZADO A 1000 también en el PDF (pruebas)
      const total = FORCE_TEST_AMOUNT ? Number(TEST_AMOUNT) : Number(fact?.importe ?? data?.monto ?? 0);

      doc.setFontSize(14);
      doc.text("FACTURA ELECTRÓNICA (ARCA) - CAE", 40, 50);

      doc.setFontSize(11);
      doc.text(`Cliente: ${data?.labelCliente || fact?.cliente || "—"}`, 40, 80);
      doc.text(`Servicio: ${data?.labelSistema || fact?.sistema || "—"}`, 40, 100);

      doc.text(
        `Pto Vta: ${fact?.pto_vta}  Tipo: ${fact?.cbte_tipo}  Nro: ${fact?.cbte_nro}`,
        40,
        130
      );
      doc.text(
        `Fecha: ${ymdToHuman(fact?.fecha_cbte)}   Importe: ${
          Number.isFinite(total) ? moneyARS(total) : "$0,00"
        }`,
        40,
        150
      );

      doc.text(`CAE: ${fact?.cae || "—"}`, 40, 180);
      doc.text(`Vto CAE: ${ymdToHuman(fact?.cae_vto)}`, 40, 200);

      // Receptor
      if (fact?.doc_tipo && fact?.doc_nro) {
        doc.text(`Receptor DocTipo: ${fact.doc_tipo}  DocNro: ${fact.doc_nro}`, 40, 225);
      }

      if (fact?.qr_url) {
        const qrDataUrl = await QRCode.toDataURL(String(fact.qr_url));
        doc.text("QR (validación ARCA):", 40, 255);
        doc.addImage(qrDataUrl, "PNG", 40, 265, 140, 140);
        doc.setFontSize(8);
        doc.text("Escaneá para constatar comprobante", 40, 420);
        doc.setFontSize(9);
        doc.text(clampText(String(fact.qr_url), 110), 40, 440);
      }

      doc.save(`FACTURA_${fact?.pto_vta}-${fact?.cbte_tipo}-${fact?.cbte_nro}.pdf`);
    },
    [data]
  );

  const validarInputs = useCallback(() => {
    const doc = String(docNro || "").replace(/\D/g, "");
    const pv = String(ptoVta || "").replace(/\D/g, "");

    const id_pago = data?.id_pago;

    if (!id_pago) return { ok: false, msg: "Falta id_pago." };
    if (!doc) return { ok: false, msg: "Ingresá el número de documento (solo números)." };
    if (!pv) return { ok: false, msg: "Ingresá el punto de venta (obligatorio)." };

    // Validación simple según tipo
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

    return { ok: true, doc, pv, docN, pvN, id_pago };
  }, [data, docNro, ptoVta, docTipo]);

  const emitir = useCallback(async () => {
    setError("");

    const v = validarInputs();
    if (!v.ok) return setError(v.msg);

    if (!confirm) {
      return setError("Tenés que confirmar el resumen antes de emitir.");
    }

    setLoading(true);
    try {
      const url = `${apiBase}?action=${action}&op=factura_arca`;

      // ✅ además mandamos "importe" para que el backend pueda usarlo si lo soporta
      // (si tu backend lo ignora, no rompe nada)
      const resp = await fetchJSON(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id_pago: v.id_pago,
          doc_tipo: Number(docTipo),
          doc_nro: v.docN,
          cbte_tipo: Number(cbteTipo),
          pto_vta: v.pvN,
          // ✅ monto de prueba
          importe: FORCE_TEST_AMOUNT ? Number(TEST_AMOUNT) : undefined,
        }),
      });

      const fact = resp?.factura || resp;

      await generarPdf(fact);

      onFacturada?.(fact);
      onDone?.(fact);
      onClose?.();
    } catch (e) {
      setError(e?.message || "No se pudo emitir la factura.");
    } finally {
      setLoading(false);
    }
  }, [
    apiBase,
    action,
    fetchJSON,
    generarPdf,
    onFacturada,
    onDone,
    onClose,
    validarInputs,
    confirm,
    docTipo,
    cbteTipo,
  ]);

  // ✅ Recién acá el render condicional (sin hooks después)
  if (!open) return null;

  const cerrar = () => {
    if (!loading) onClose?.();
  };

  return (
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

            {/* ✅ RESUMEN ANTES DE EMITIR */}
            <div className="arca-alert arca-alert--info" style={{ marginBottom: 14 }}>
              <strong>Resumen de lo que se va a facturar</strong>

              <div style={{ marginTop: 8, lineHeight: 1.55 }}>
                <div>
                  <b>Pago:</b> {resumen.pago}
                </div>
                <div>
                  <b>Cliente:</b> {resumen.cliente}
                </div>
                <div>
                  <b>Sistema:</b> {resumen.sistema}
                </div>
                <div>
                  <b>Monto:</b> {resumen.montoTxt}{" "}
                  {FORCE_TEST_AMOUNT ? (
                    <span className="arca-mini" style={{ marginLeft: 8 }}>
                      (modo prueba)
                    </span>
                  ) : null}
                </div>
                {resumen.fechaISO ? (
                  <div>
                    <b>Fecha pago:</b> {resumen.fechaISO}
                  </div>
                ) : null}
                <div>
                  <b>Comprobante:</b> {resumen.comprobante}
                </div>
                <div>
                  <b>Receptor:</b> {resumen.receptorTxt}
                </div>
                <div>
                  <b>Punto de venta:</b> {resumen.pvTxt}
                </div>
              </div>

              <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center" }}>
                <input
                  id="arca_confirm"
                  type="checkbox"
                  checked={confirm}
                  onChange={(e) => setConfirm(e.target.checked)}
                  disabled={loading}
                  style={{ width: 18, height: 18 }}
                />
                <label htmlFor="arca_confirm" style={{ cursor: loading ? "default" : "pointer" }}>
                  Confirmo que el <b>DNI/CUIT del receptor</b> y el <b>monto</b> son correctos.
                </label>
              </div>

              <div className="arca-mini" style={{ marginTop: 6 }}>
                * El monto{" "}
                {FORCE_TEST_AMOUNT ? (
                  <>
                    está <b>forzado a {moneyARS(TEST_AMOUNT)}</b> para pruebas.
                  </>
                ) : (
                  <>
                    se toma del pago seleccionado (backend: <b>pagos.monto</b> por <b>id_pago</b>).
                  </>
                )}
              </div>
            </div>

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
                </div>

                <div className="arca-note">
                  * Emite CAE real usando WSAA + WSFEv1. Necesitás cert/key y PV habilitado.
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
                        setConfirm(false);
                      }}
                      disabled={loading}
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
                        setConfirm(false);
                      }}
                      disabled={loading}
                      inputMode="numeric"
                    />
                    <label className="fl-label">Nro doc *</label>
                  </div>

                  <div className="fl-field fl-col-full">
                    <select
                      className="fl-input fl-select"
                      value={cbteTipo}
                      onChange={(e) => setCbteTipo(Number(e.target.value))}
                      disabled={loading}
                    >
                      {CBTE_TIPOS.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    <label className="fl-label">Tipo comprobante</label>
                    <div className="arca-mini">* Backend configurado para Factura C (11).</div>
                  </div>

                  <div className="fl-field fl-col-full">
                    <input
                      className="fl-input"
                      placeholder=" "
                      value={ptoVta}
                      onChange={(e) => {
                        setPtoVta(e.target.value.replace(/\D/g, ""));
                        setConfirm(false);
                      }}
                      disabled={loading}
                      inputMode="numeric"
                    />
                    <label className="fl-label">Punto de venta *</label>
                  </div>
                </div>

                <div className="arca-mini" style={{ marginTop: 10 }}>
                  ⚠️ En “Nro doc” va el DNI/CUIT del <b>receptor (cliente)</b>, no el tuyo.
                </div>
              </article>

              <article className="mi-card mi-card--full">
                <h3 className="mi-card__title">Acción</h3>
                <div className="arca-help">
                  Al emitir, se genera la factura, vuelve CAE/QR y se descarga el PDF.
                </div>
              </article>
            </div>
          </div>

          <div className="mit-actions">
            <button
              type="button"
              className="mit-btn mit-btn--ghost"
              onClick={cerrar}
              disabled={loading}
            >
              Cancelar
            </button>

            <button
              type="button"
              className="mit-btn mit-btn--solid"
              onClick={emitir}
              disabled={loading || !confirm}
              title={!confirm ? "Marcá la confirmación del resumen para habilitar." : ""}
            >
              {loading ? (
                "Emitiendo..."
              ) : (
                <>
                  Emitir + PDF <FaCheck style={{ marginLeft: 8 }} />
                </>
              )}
            </button>
          </div>

          <div className="mit-help">* Campos obligatorios</div>
        </div>
      </div>
    </div>
  );
}
