// frontend/src/components/Pagos/modales/ModalFacturaArca.jsx
import React, { useMemo, useState, useCallback, useEffect, useRef } from "react";
import jsPDF from "jspdf";
import QRCode from "qrcode";
import { FaCheck } from "react-icons/fa";
import "./ModalFacturaArca.css";

// ✅ Reutiliza la estética completa del modal “mi- / mit- / fl-”
import "../../Trabajadores/modales/ModalEditarTrabajador.css";

const DOC_TIPOS = [
  { id: 80, label: "CUIT (80)" },
  { id: 96, label: "DNI (96)" },
];

const CBTE_TIPOS = [
  { id: 11, label: "Factura C (11)" },
  { id: 6, label: "Factura B (6)" },
  { id: 1, label: "Factura A (1)" },
];

function ymdToHuman(ymd) {
  if (!ymd) return "";
  const s = String(ymd);
  if (s.length === 8) return `${s.slice(6, 8)}/${s.slice(4, 6)}/${s.slice(0, 4)}`;
  if (s.length >= 10 && s.includes("-")) {
    const [y, m, d] = s.slice(0, 10).split("-");
    return `${d}/${m}/${y}`;
  }
  return s;
}

export default function ModalFacturaArca({
  open,
  onClose,
  apiBase,
  action,
  data,
  onFacturada,
  onDone, // compat
}) {
  const [docTipo, setDocTipo] = useState(80);
  const [docNro, setDocNro] = useState("");
  const [cbteTipo, setCbteTipo] = useState(11);
  const [ptoVta, setPtoVta] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const firstRef = useRef(null);

  const titulo = useMemo(() => {
    return `${data?.labelCliente || "Cliente"} • ${data?.labelSistema || "Sistema"}`;
  }, [data]);

  // Reset al abrir (opcional, prolijo)
  useEffect(() => {
    if (!open) return;
    setError("");
    setDocTipo(80);
    setCbteTipo(11);
    setDocNro("");
    setPtoVta("");
    setTimeout(() => firstRef.current?.focus?.(), 0);
  }, [open]);

  // ESC cierra
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const fetchJSON = useCallback(async (url, opts) => {
    const res = await fetch(url, opts);
    let j = null;
    try {
      j = await res.json();
    } catch {
      j = null;
    }
    if (!res.ok) throw new Error(j?.mensaje || j?.error || `HTTP ${res.status}`);
    if (j && typeof j === "object" && j.exito === false) throw new Error(j.mensaje || "Error servidor");
    return j;
  }, []);

  const generarPdf = useCallback(
    async (fact) => {
      const doc = new jsPDF({ unit: "pt", format: "a4" });

      const total = Number(fact?.importe ?? data?.monto ?? 0);

      doc.setFontSize(14);
      doc.text("FACTURA ELECTRÓNICA (ARCA) - CAE", 40, 50);

      doc.setFontSize(11);
      doc.text(`Cliente: ${data?.labelCliente || fact?.cliente || "—"}`, 40, 80);
      doc.text(`Servicio: ${data?.labelSistema || fact?.sistema || "—"}`, 40, 100);

      doc.text(`Pto Vta: ${fact?.pto_vta}  Tipo: ${fact?.cbte_tipo}  Nro: ${fact?.cbte_nro}`, 40, 130);
      doc.text(`Fecha: ${ymdToHuman(fact?.fecha_cbte)}   Importe: $${total.toFixed(2)}`, 40, 150);

      doc.text(`CAE: ${fact?.cae || "—"}`, 40, 180);
      doc.text(`Vto CAE: ${ymdToHuman(fact?.cae_vto)}`, 40, 200);

      if (fact?.qr_url) {
        const qrDataUrl = await QRCode.toDataURL(fact.qr_url);
        doc.text("QR (validación ARCA):", 40, 240);
        doc.addImage(qrDataUrl, "PNG", 40, 250, 140, 140);
        doc.setFontSize(8);
        doc.text("Escaneá para constatar comprobante", 40, 405);
        doc.setFontSize(9);
        doc.text(String(fact.qr_url).slice(0, 95) + "…", 40, 425);
      }

      doc.save(`FACTURA_${fact?.pto_vta}-${fact?.cbte_tipo}-${fact?.cbte_nro}.pdf`);
    },
    [data]
  );

  const emitir = useCallback(async () => {
    setError("");

    const id_pago = data?.id_pago;
    if (!id_pago) {
      setError("Falta id_pago.");
      return;
    }

    const doc = String(docNro || "").replace(/\D/g, "");
    if (!doc) {
      setError("Ingresá el número de documento (solo números).");
      return;
    }

    const pv = String(ptoVta || "").replace(/\D/g, "");
    if (!pv) {
      setError("Ingresá el punto de venta (obligatorio).");
      return;
    }

    setLoading(true);
    try {
      const url = `${apiBase}?action=${action}&op=factura_arca`;

      const resp = await fetchJSON(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id_pago,
          doc_tipo: Number(docTipo),
          doc_nro: Number(doc),
          cbte_tipo: Number(cbteTipo),
          pto_vta: Number(pv),
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
  }, [action, apiBase, data, docNro, docTipo, cbteTipo, ptoVta, fetchJSON, generarPdf, onFacturada, onDone, onClose]);

  if (!open) return null;

  const cerrar = () => {
    if (loading) return;
    onClose?.();
  };

  const nombreCliente = data?.labelCliente || "—";
  const nombreSistema = data?.labelSistema || "—";
  const idPago = data?.id_pago || data?.id || "—";

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
        {/* Header (misma estética) */}
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

        {/* Body wrapper igual que el otro modal */}
        <div className="mit-modal__body">
          <div className="mi-tabpanel is-active">
            {error && (
              <div className="arca-alert arca-alert--error" role="alert">
                {error}
              </div>
            )}

            <div className="mi-grid">
              {/* Card 1 */}
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
                </div>

                <div className="arca-note">
                  * Esto emite CAE real usando WSAA + WSFEv1. Necesitás cert/key y PV habilitado.
                </div>
              </article>

              {/* Card 2 */}
              <article className="mi-card">
                <h3 className="mi-card__title">Datos de facturación</h3>

                <div className="fl-grid">
                  <div className="fl-field">
                    <select
                      className="fl-input fl-select"
                      value={docTipo}
                      onChange={(e) => setDocTipo(Number(e.target.value))}
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
                      onChange={(e) => setDocNro(e.target.value.replace(/\D/g, ""))}
                      disabled={loading}
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

                    <div className="arca-mini">
                      * En backend quedó habilitado “perfecto” para Factura C (11).
                    </div>
                  </div>

                  <div className="fl-field fl-col-full">
                    <input
                      className="fl-input"
                      placeholder=" "
                      value={ptoVta}
                      onChange={(e) => setPtoVta(e.target.value.replace(/\D/g, ""))}
                      disabled={loading}
                    />
                    <label className="fl-label">Punto de venta *</label>
                  </div>
                </div>
              </article>

              {/* Card full */}
              <article className="mi-card mi-card--full">
                <h3 className="mi-card__title">Acción</h3>

                <div className="arca-help">
                  Al emitir, se genera la factura, vuelve CAE/QR y se descarga el PDF.
                </div>
              </article>
            </div>
          </div>

          {/* Footer acciones (igual que el otro) */}
          <div className="mit-actions">
            <button type="button" className="mit-btn mit-btn--ghost" onClick={cerrar} disabled={loading}>
              Cancelar
            </button>

            <button type="button" className="mit-btn mit-btn--solid" onClick={emitir} disabled={loading}>
              {loading ? "Emitiendo..." : <>Emitir + PDF <FaCheck style={{ marginLeft: 8 }} /></>}
            </button>
          </div>

          <div className="mit-help">* Campos obligatorios</div>
        </div>
      </div>
    </div>
  );
}
