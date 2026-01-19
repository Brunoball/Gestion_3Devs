import React, { useEffect, useMemo, useRef, useState } from "react";

/* 🔹 Importa la estética base */
import "../../Trabajadores/modales/ModalEditarTrabajador.css";
import "./DatosFacturacionModal.css";

/* Defaults */
const DEFAULTS = {
  doc_tipo: 80,
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
  apiFetch,
  apiBase,
  onToast,
}) {
  const boxRef = useRef(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(DEFAULTS);

  const id_cliente = useMemo(
    () => Number(cliente?.id_cliente || 0),
    [cliente]
  );

  /* ESC + focus */
  useEffect(() => {
    if (!open) return;

    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);

    setTimeout(() => {
      try {
        boxRef.current?.querySelector("input,select,button")?.focus();
      } catch {}
    }, 50);

    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  /* Cargar datos */
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

        if (alive) {
          setForm({
            doc_tipo: Number(f?.doc_tipo ?? DEFAULTS.doc_tipo),
            doc_nro: String(f?.doc_nro ?? ""),
            razon_social: String(
              f?.razon_social ?? cliente?.nombre ?? ""
            ),
            domicilio: String(f?.domicilio ?? ""),
            cond_iva: String(f?.cond_iva ?? DEFAULTS.cond_iva),
            cond_venta: String(f?.cond_venta ?? DEFAULTS.cond_venta),
          });
        }
      } catch (e) {
        if (alive) {
          setForm({
            ...DEFAULTS,
            razon_social: cliente?.nombre || "",
          });
        }
      } finally {
        alive && setLoading(false);
      }
    })();

    return () => (alive = false);
  }, [open, id_cliente, apiFetch, apiBase, cliente]);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const onDocNro = (v) =>
    set("doc_nro", String(v || "").replace(/[^\d]/g, ""));

  const cerrar = () => !saving && onClose?.();

  const guardar = async (e) => {
    e.preventDefault();

    const doc_nro = form.doc_nro.trim();
    const razon_social = form.razon_social.trim();

    if (!razon_social)
      return onToast?.("advertencia", "Razón social obligatoria");
    if (!doc_nro)
      return onToast?.("advertencia", "Documento obligatorio");

    setSaving(true);
    try {
      const payload = {
        id_cliente,
        doc_tipo: Number(form.doc_tipo),
        doc_nro: Number(doc_nro),
        razon_social,
        domicilio: form.domicilio.trim(),
        cond_iva: form.cond_iva.trim(),
        cond_venta: form.cond_venta.trim(),
      };

      const data = await apiFetch(`${apiBase}&op=facturacion_upsert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      onToast?.("exito", data?.mensaje || "Datos guardados");
      cerrar();
    } catch (e) {
      onToast?.("error", e?.message || "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="mi-modal__overlay"
      onClick={(e) =>
        e.target.classList.contains("mi-modal__overlay") && cerrar()
      }
    >
      <div
        ref={boxRef}
        className="mi-modal__container dfm-mi__container"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div className="mi-modal__header">
          <div className="mi-modal__head-left">
            <h2 className="mi-modal__title">Datos de facturación</h2>
            <p className="mi-modal__subtitle">
              Cliente: <b>{cliente?.nombre || "-"}</b>
            </p>
          </div>

          <button className="mi-modal__close" onClick={cerrar}>
            ✕
          </button>
        </div>

        {/* BODY */}
        <form className="mit-modal__body" onSubmit={guardar}>
          <div className="mi-tabpanel">
            {loading ? (
              <div className="dfm-mi__loading">Cargando...</div>
            ) : (
              <div className="mi-grid">
                <article className="mi-card mi-card--full">
                  <h3 className="mi-card__title">Datos fiscales</h3>

                  <div className="dfm-onegrid">
                    <div className="fl-field">
                      <select
                        className="fl-input fl-select"
                        value={form.doc_tipo}
                        onChange={(e) =>
                          set("doc_tipo", Number(e.target.value))
                        }
                        disabled={saving}
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
                        value={form.doc_nro}
                        onChange={(e) => onDocNro(e.target.value)}
                        disabled={saving}
                      />
                      <label className="fl-label">Nro doc *</label>
                    </div>

                    <div className="fl-field dfm-span2">
                      <input
                        className="fl-input"
                        placeholder=" "
                        value={form.razon_social}
                        onChange={(e) =>
                          set("razon_social", e.target.value.toUpperCase())
                        }
                        disabled={saving}
                      />
                      <label className="fl-label">Razón social *</label>
                    </div>

                    <div className="fl-field dfm-span2">
                      <input
                        className="fl-input"
                        placeholder=" "
                        value={form.domicilio}
                        onChange={(e) => set("domicilio", e.target.value)}
                        disabled={saving}
                      />
                      <label className="fl-label">Domicilio</label>
                    </div>

                    <div className="fl-field">
                      <input
                        className="fl-input"
                        placeholder=" "
                        value={form.cond_iva}
                        onChange={(e) => set("cond_iva", e.target.value)}
                        disabled={saving}
                      />
                      <label className="fl-label">Condición IVA</label>
                    </div>

                    <div className="fl-field">
                      <input
                        className="fl-input"
                        placeholder=" "
                        value={form.cond_venta}
                        onChange={(e) => set("cond_venta", e.target.value)}
                        disabled={saving}
                      />
                      <label className="fl-label">Condición de venta</label>
                    </div>
                  </div>
                </article>
              </div>
            )}
          </div>

          {/* FOOTER */}
          <div className="mit-actions">
            <div className="mit-help">* Campos obligatorios</div>

            <button
              type="button"
              className="mit-btn mit-btn--ghost"
              onClick={cerrar}
              disabled={saving}
            >
              Cancelar
            </button>

            <button
              type="submit"
              className="mit-btn mit-btn--solid"
              disabled={saving || loading}
            >
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
