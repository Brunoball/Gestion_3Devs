// frontend/src/components/Pagos/modales/ModalFacturaArca.jsx
import React, { useMemo, useState, useCallback } from "react";
import jsPDF from "jspdf";
import QRCode from "qrcode";
import { FaTimes, FaCheck } from "react-icons/fa";
import "./ModalFacturaArca.css";

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
  // si viene YYYY-MM-DD
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
  onDone, // ✅ compat
}) {
  const [docTipo, setDocTipo] = useState(80);
  const [docNro, setDocNro] = useState("");
  const [cbteTipo, setCbteTipo] = useState(11);
  const [ptoVta, setPtoVta] = useState(""); // obligatorio en backend
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const titulo = useMemo(() => {
    return `${data?.labelCliente || "Cliente"} • ${data?.labelSistema || "Sistema"}`;
  }, [data]);

  const fetchJSON = useCallback(async (url, opts) => {
    const res = await fetch(url, opts);
    let j = null;
    try { j = await res.json(); } catch { j = null; }
    if (!res.ok) throw new Error(j?.mensaje || j?.error || `HTTP ${res.status}`);
    if (j && typeof j === "object" && j.exito === false) throw new Error(j.mensaje || "Error servidor");
    return j;
  }, []);

  const generarPdf = useCallback(async (fact) => {
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

    // QR oficial
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
  }, [data]);

  const emitir = useCallback(async () => {
    setError("");

    const id_pago = data?.id_pago;
    if (!id_pago) { setError("Falta id_pago."); return; }

    const doc = String(docNro || "").replace(/\D/g, "");
    if (!doc) { setError("Ingresá el número de documento (solo números)."); return; }

    const pv = String(ptoVta || "").replace(/\D/g, "");
    if (!pv) { setError("Ingresá el punto de venta (obligatorio)."); return; }

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

      // ✅ callback compat
      onFacturada?.(fact);
      onDone?.(fact);

    } catch (e) {
      setError(e?.message || "No se pudo emitir la factura.");
    } finally {
      setLoading(false);
    }
  }, [action, apiBase, data, docNro, docTipo, cbteTipo, ptoVta, fetchJSON, generarPdf, onFacturada, onDone]);

  if (!open) return null;

  return (
    <div className="mfact_overlay" role="dialog" aria-modal="true">
      <div className="mfact_card">
        <div className="mfact_header">
          <div>
            <h3 className="mfact_title">Factura ARCA (CAE)</h3>
            <div className="mfact_sub">{titulo}</div>
          </div>
          <button className="mfact_close" onClick={onClose} type="button" aria-label="Cerrar">
            <FaTimes />
          </button>
        </div>

        <div className="mfact_body">
          {error && <div className="mfact_error">{error}</div>}

          <div className="mfact_grid">
            <div className="mfact_field">
              <label>Tipo doc</label>
              <select value={docTipo} onChange={(e) => setDocTipo(Number(e.target.value))} disabled={loading}>
                {DOC_TIPOS.map((d) => (
                  <option key={d.id} value={d.id}>{d.label}</option>
                ))}
              </select>
            </div>

            <div className="mfact_field">
              <label>Nro doc</label>
              <input
                value={docNro}
                onChange={(e) => setDocNro(e.target.value)}
                placeholder="Solo números"
                disabled={loading}
              />
            </div>

            <div className="mfact_field">
              <label>Tipo comprobante</label>
              <select value={cbteTipo} onChange={(e) => setCbteTipo(Number(e.target.value))} disabled={loading}>
                {CBTE_TIPOS.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
              <small style={{ opacity: 0.8 }}>
                * En backend quedó habilitado “perfecto” para Factura C (11).
              </small>
            </div>

            <div className="mfact_field">
              <label>Punto de venta (obligatorio)</label>
              <input
                value={ptoVta}
                onChange={(e) => setPtoVta(e.target.value.replace(/\D/g, ""))}
                placeholder="ej: 1"
                disabled={loading}
              />
            </div>
          </div>

          <div className="mfact_hint">
            * Esto emite CAE real usando WSAA+WSFEv1 (ARCA/AFIP). Necesitás cert/key y PV habilitado.{" "}
          </div>
        </div>

        <div className="mfact_footer">
          <button className="mfact_btn mfact_btn_sec" onClick={onClose} disabled={loading} type="button">
            Cerrar
          </button>

          <button className="mfact_btn mfact_btn_pri" onClick={emitir} disabled={loading} type="button">
            {loading ? "Emitiendo..." : <>Emitir + PDF <FaCheck style={{ marginLeft: 8 }} /></>}
          </button>
        </div>
      </div>
    </div>
  );
}
