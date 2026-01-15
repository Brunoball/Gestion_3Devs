// frontend/src/components/Pagos/modales/ModalFacturaArcaResumen.jsx
import React, { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { FaCheck } from "react-icons/fa";
import "./ModalFacturaArca.css";
import "../../Trabajadores/modales/ModalEditarTrabajador.css";

import { saveArcaInvoicePdf } from "./arcaPdfBuilder";

const DOC_TIPOS = [
  { id: 80, label: "CUIT (80)" },
  { id: 96, label: "DNI (96)" },
];

function ymdToHuman(ymd) {
  if (!ymd) return "";
  const s = String(ymd);
  if (s.length === 8 && /^\d{8}$/.test(s)) return `${s.slice(6, 8)}/${s.slice(4, 6)}/${s.slice(0, 4)}`;
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

function padLeft(n, len) {
  const s = String(n ?? "");
  return s.padStart(len, "0");
}

export default function ModalFacturaArcaResumen({
  open,
  onClose,
  onBack,
  onCloseAll,
  apiBase,
  action,
  data,

  docTipo,
  docNro,
  cbteTipo,
  ptoVta,

  onFacturada,
  onDone,

  forceTestAmount = false,
  testAmount = 1000,
}) {
  // ✅ hooks arriba
  const [loading, setLoading] = useState(false);
  const [loadingPdf, setLoadingPdf] = useState(false); // ✅ nuevo: loader solo PDF
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);

  const firstRef = useRef(null);

  const docLabel = useMemo(() => {
    const it = DOC_TIPOS.find((x) => x.id === Number(docTipo));
    return it?.label || String(docTipo);
  }, [docTipo]);

  const idPago = data?.id_pago || data?.id || "—";
  const nombreCliente = data?.labelCliente || data?.cliente || "—";
  const nombreSistema = data?.labelSistema || data?.sistema || "—";

  const montoReal = Number(data?.monto ?? data?.importe ?? 0);
  const monto = forceTestAmount ? Number(testAmount) : montoReal;

  const fechaPagoISO = String(data?.fecha_pago || data?.fecha || "").slice(0, 10);

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

  // ✅ fetch robusto
  const fetchJSON = useCallback(
    async (url, opts) => {
      const res = await fetch(url, opts);
      const raw = await res.text();

      let j = null;
      try {
        j = raw ? JSON.parse(raw) : null;
      } catch {
        j = null;
      }

      const pickErr = () =>
        toText(j?.mensaje) ||
        toText(j?.error) ||
        toText(j?.message) ||
        toText(j?.detail) ||
        "";

      if (!res.ok) {
        const msg = pickErr();
        if (msg) throw new Error(msg);

        const preview = (raw || "").slice(0, 300).replace(/\s+/g, " ").trim();
        throw new Error(
          `HTTP ${res.status} ${res.statusText || ""}`.trim() + (preview ? ` • Resp: ${preview}` : "")
        );
      }

      if (j && typeof j === "object" && j.exito === false) {
        const msg = pickErr() || "Error servidor (exito=false)";
        throw new Error(msg);
      }

      if (j == null) {
        const preview = (raw || "").slice(0, 300).replace(/\s+/g, " ").trim();
        throw new Error(preview ? `Respuesta inválida (no JSON): ${preview}` : "Respuesta inválida (no JSON)");
      }

      return j;
    },
    [toText]
  );

  const validar = useCallback(() => {
    const doc = String(docNro || "").replace(/\D/g, "");
    const pv = String(ptoVta || "").replace(/\D/g, "");

    const id_pago = data?.id_pago;

    if (!id_pago) return { ok: false, msg: "Falta id_pago." };
    if (!doc) return { ok: false, msg: "Ingresá el número de documento (solo números)." };
    if (!pv) return { ok: false, msg: "Ingresá el punto de venta (obligatorio)." };

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
  }, [data, docNro, ptoVta, docTipo]);

  // ✅ NUEVO: genera SOLO el PDF (sin emitir en ARCA)
  const exportarSoloPDF = useCallback(async () => {
    setError("");
    const v = validar();
    if (!v.ok) return setError(v.msg);

    // opcional: pedís confirmar para exportar también (recomendado)
    if (!confirm) return setError("Tenés que confirmar el resumen antes de exportar el PDF.");

    setLoadingPdf(true);
    try {
      // Armamos un "fact" mock para que el builder tenga TODO lo necesario
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, "0");
      const d = String(now.getDate()).padStart(2, "0");

      const factMock = {
        // mínimos para el builder
        pto_vta: v.pvN,
        cbte_tipo: Number(cbteTipo),     // 11
        cbte_nro: 1,                     // mock (si querés incremental, lo guardás en backend/localStorage)
        fecha_cbte: `${y}${m}${d}`,       // yyyymmdd
        importe: forceTestAmount ? Number(testAmount) : Number(monto),

        // CAE fake para que el pie quede igual visualmente
        cae: "00000000000000",
        cae_vto: `${y}${m}${d}`,

        // QR: si no hay url real, el builder no rompe. Podés poner una dummy:
        qr_url: "",

        // extras opcionales que el builder intenta mostrar
        emisor_nombre: data?.emisor_nombre || "3DEVS SOLUTIONS",
        emisor_domicilio: data?.emisor_domicilio || "",
        cuit_emisor: data?.cuit_emisor || "",
        cond_iva_emisor: data?.cond_iva_emisor || "Responsable Monotributo",

        receptor_nombre: nombreCliente,
        receptor_domicilio: data?.cliente_domicilio || "",
        doc_tipo: Number(docTipo),
        doc_nro: v.docN,

        // ítems: si querés forzar algo acá, podés pasar factMock.items
        // items: [{ descripcion: nombreSistema, cantidad: 1, unidad: "unidades", precio: Number(monto), bonif_pct: 0, subtotal: Number(monto) }],
      };

      await saveArcaInvoicePdf({
        fact: factMock,
        data: {
          ...data,
          // por si el builder usa data.monto/importe
          monto: forceTestAmount ? Number(testAmount) : Number(monto),
          importe: forceTestAmount ? Number(testAmount) : Number(monto),
          labelCliente: nombreCliente,
          labelSistema: nombreSistema,
        },
        forceTestAmount,
        testAmount,
      });
    } catch (e) {
      setError(e?.message || "No se pudo exportar el PDF.");
    } finally {
      setLoadingPdf(false);
    }
  }, [
    validar,
    confirm,
    cbteTipo,
    docTipo,
    forceTestAmount,
    testAmount,
    monto,
    data,
    nombreCliente,
    nombreSistema,
  ]);

  const emitir = useCallback(async () => {
    setError("");
    const v = validar();
    if (!v.ok) return setError(v.msg);

    if (!confirm) return setError("Tenés que confirmar el resumen antes de emitir.");

    setLoading(true);
    try {
      const url = `${apiBase}?action=${action}&op=factura_arca`;

      const resp = await fetchJSON(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id_pago: v.id_pago,
          doc_tipo: Number(docTipo),
          doc_nro: v.docN,
          cbte_tipo: Number(cbteTipo),
          pto_vta: v.pvN,
          importe: forceTestAmount ? Number(testAmount) : undefined,
        }),
      });

      const fact = resp?.factura || resp;

      // ✅ PDF profesional (3 páginas)
      await saveArcaInvoicePdf({
        fact,
        data,
        forceTestAmount,
        testAmount,
      });

      onFacturada?.(fact);
      onDone?.(fact);

      onClose?.();
      onCloseAll?.();
    } catch (e) {
      setError(e?.message || "No se pudo emitir la factura.");
    } finally {
      setLoading(false);
    }
  }, [
    apiBase,
    action,
    fetchJSON,
    validar,
    confirm,
    docTipo,
    cbteTipo,
    data,
    onFacturada,
    onDone,
    onClose,
    onCloseAll,
    forceTestAmount,
    testAmount,
  ]);

  if (!open) return null;

  const cerrar = () => {
    if (!loading && !loadingPdf) onClose?.();
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
            <h2 className="mi-modal__title">Resumen antes de emitir</h2>
            <p className="mi-modal__subtitle">Confirmá datos → Emitir → PDF (estilo ARCA)</p>
          </div>

          <button className="mi-modal__close" onClick={cerrar} aria-label="Cerrar" type="button">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="mit-modal__body">
          {error && (
            <div className="arca-alert arca-alert--error" role="alert">
              {error}
            </div>
          )}

          <div className="arca-alert arca-alert--info" style={{ marginBottom: 14 }}>
            <strong>Resumen de lo que se va a facturar</strong>

            <div style={{ marginTop: 8, lineHeight: 1.55 }}>
              <div><b>Pago:</b> {resumen.pago}</div>
              <div><b>Cliente:</b> {resumen.cliente}</div>
              <div><b>Sistema:</b> {resumen.sistema}</div>
              <div>
                <b>Monto:</b> {resumen.montoTxt}{" "}
                {forceTestAmount ? (
                  <span className="arca-mini" style={{ marginLeft: 8 }}>
                    (modo prueba)
                  </span>
                ) : null}
              </div>
              {resumen.fechaISO ? (
                <div><b>Fecha pago:</b> {ymdToHuman(resumen.fechaISO)}</div>
              ) : null}
              <div><b>Comprobante:</b> {resumen.comprobante}</div>
              <div><b>Receptor:</b> {resumen.receptorTxt}</div>
              <div><b>Punto de venta:</b> {resumen.pvTxt}</div>
            </div>

            <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center" }}>
              <input
                ref={firstRef}
                id="arca_confirm"
                type="checkbox"
                checked={confirm}
                onChange={(e) => setConfirm(e.target.checked)}
                disabled={loading || loadingPdf}
                style={{ width: 18, height: 18 }}
              />
              <label htmlFor="arca_confirm" style={{ cursor: (loading || loadingPdf) ? "default" : "pointer" }}>
                Confirmo que el <b>DNI/CUIT del receptor</b> y el <b>monto</b> son correctos.
              </label>
            </div>

            <div className="arca-mini" style={{ marginTop: 6 }}>
              * El PDF se genera con 3 copias: <b>ORIGINAL / DUPLICADO / TRIPLICADO</b>.
            </div>
          </div>

          <div className="mit-actions" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              className="mit-btn mit-btn--ghost"
              onClick={() => !(loading || loadingPdf) && onBack?.()}
              disabled={loading || loadingPdf}
            >
              Volver
            </button>

            {/* ✅ NUEVO BOTÓN: Solo PDF */}
            <button
              type="button"
              className="mit-btn mit-btn--ghost"
              onClick={exportarSoloPDF}
              disabled={loading || loadingPdf || !confirm}
              title={!confirm ? "Marcá la confirmación para habilitar." : "Exporta el PDF sin emitir en ARCA."}
            >
              {loadingPdf ? "Generando PDF..." : "Solo PDF (sin emitir)"}
            </button>

            {/* Botón existente */}
            <button
              type="button"
              className="mit-btn mit-btn--solid"
              onClick={emitir}
              disabled={loading || loadingPdf || !confirm}
              title={!confirm ? "Marcá la confirmación para habilitar." : ""}
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
