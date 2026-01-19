import React, { useEffect, useMemo, useRef, useState } from "react";
import "./DatosFacturacionModal.css";

// defaults según tu tabla
const DEFAULTS = {
  doc_tipo: 80, // CUIT
  doc_nro: "",
  razon_social: "",
  domicilio: "",
  cond_iva: "IVA Sujeto Exento",
  cond_venta: "Contado / Transferencia Bancaria",
};

const DOC_TIPOS = [
  { id: 80, label: "CUIT (80)" },
  { id: 96, label: "DNI (96)" },
];

export default function DatosFacturacionModal({
  open,
  onClose,
  cliente,
  apiFetch,        // (url, opts) => data  (usa tu fetchJSON)
  apiBase,         // `${BASE_URL}/api.php?action=clientes`
  onToast,         // (tipo, msg)
}) {
  const boxRef = useRef(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState(DEFAULTS);

  const id_cliente = useMemo(() => Number(cliente?.id_cliente || 0), [cliente]);

  // cerrar con ESC + trap simple
  useEffect(() => {
    if (!open) return;

    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);

    // focus
    setTimeout(() => {
      try {
        boxRef.current?.querySelector("input,select,textarea,button")?.focus();
      } catch {}
    }, 50);

    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // cargar datos del cliente (si existen)
  useEffect(() => {
    if (!open || !id_cliente) return;

    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const data = await apiFetch(
          `${apiBase}&op=facturacion_get&id_cliente=${id_cliente}`,
          { method: "GET" }
        );

        const f = data?.facturacion || null;

        // Si no existe registro, quedás con defaults
        const next = {
          doc_tipo: Number(f?.doc_tipo ?? DEFAULTS.doc_tipo),
          doc_nro: String(f?.doc_nro ?? DEFAULTS.doc_nro),
          razon_social: String(f?.razon_social ?? (cliente?.nombre || "")),
          domicilio: String(f?.domicilio ?? DEFAULTS.domicilio),
          cond_iva: String(f?.cond_iva ?? DEFAULTS.cond_iva),
          cond_venta: String(f?.cond_venta ?? DEFAULTS.cond_venta),
        };

        if (alive) setForm(next);
      } catch (e) {
        // si el backend responde "no existe", no lo tratamos como error fuerte
        const msg = String(e?.message || "");
        if (!msg.toLowerCase().includes("no existe")) {
          onToast?.("error", msg || "No se pudieron cargar los datos");
        }
        if (alive) {
          setForm({
            ...DEFAULTS,
            razon_social: cliente?.nombre || "",
          });
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [open, id_cliente, apiBase, apiFetch, onToast, cliente]);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  // doc_nro solo números
  const onDocNro = (v) => {
    const clean = String(v || "").replace(/[^\d]/g, "");
    set("doc_nro", clean);
  };

  const guardar = async () => {
    if (!id_cliente) return;

    // validaciones mínimas
    const doc_nro = String(form.doc_nro || "").trim();
    const razon_social = String(form.razon_social || "").trim();
    const domicilio = String(form.domicilio || "").trim();

    if (!razon_social) return onToast?.("advertencia", "Razón social obligatoria");
    if (!doc_nro) return onToast?.("advertencia", "Documento (número) obligatorio");

    setSaving(true);
    try {
      const payload = {
        id_cliente,
        doc_tipo: Number(form.doc_tipo || 80),
        doc_nro: Number(doc_nro),
        razon_social,
        domicilio,
        cond_iva: String(form.cond_iva || DEFAULTS.cond_iva).trim(),
        cond_venta: String(form.cond_venta || DEFAULTS.cond_venta).trim(),
      };

      const data = await apiFetch(`${apiBase}&op=facturacion_upsert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      onToast?.("exito", data?.mensaje || "Datos de facturación guardados");
      onClose?.();
    } catch (e) {
      onToast?.("error", e?.message || "No se pudieron guardar los datos");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="dfm-overlay" onMouseDown={onClose}>
      <div
        className="dfm-modal"
        ref={boxRef}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="dfm-head">
          <div>
            <div className="dfm-title">Datos de facturación</div>
            <div className="dfm-sub">
              Cliente: <b>{cliente?.nombre || "-"}</b>
            </div>
          </div>

          <button className="dfm-x" type="button" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        {loading ? (
          <div className="dfm-loading">Cargando...</div>
        ) : (
          <div className="dfm-body">
            <div className="dfm-grid">
              <div className="dfm-field">
                <label>Tipo doc</label>
                <select value={form.doc_tipo} onChange={(e) => set("doc_tipo", Number(e.target.value))}>
                  {DOC_TIPOS.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="dfm-field">
                <label>Nro doc</label>
                <input
                  value={form.doc_nro}
                  onChange={(e) => onDocNro(e.target.value)}
                  inputMode="numeric"
                  placeholder="Solo números"
                />
              </div>

              <div className="dfm-field dfm-span2">
                <label>Razón social</label>
                <input
                  value={form.razon_social}
                  onChange={(e) => set("razon_social", e.target.value)}
                  placeholder="Ej: 3DEVS SOLUTIONS SRL"
                />
              </div>

              <div className="dfm-field dfm-span2">
                <label>Domicilio</label>
                <input
                  value={form.domicilio}
                  onChange={(e) => set("domicilio", e.target.value)}
                  placeholder="Ej: Calle 123, Ciudad, Provincia"
                />
              </div>

              <div className="dfm-field">
                <label>Condición IVA</label>
                <input
                  value={form.cond_iva}
                  onChange={(e) => set("cond_iva", e.target.value)}
                  placeholder="IVA Sujeto Exento"
                />
              </div>

              <div className="dfm-field">
                <label>Condición de venta</label>
                <input
                  value={form.cond_venta}
                  onChange={(e) => set("cond_venta", e.target.value)}
                  placeholder="Contado / Transferencia Bancaria"
                />
              </div>
            </div>
          </div>
        )}

        <div className="dfm-foot">
          <button className="dfm-btn dfm-btn-sec" type="button" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button className="dfm-btn dfm-btn-main" type="button" onClick={guardar} disabled={saving || loading}>
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
