import React, { useEffect, useMemo, useRef, useState } from "react";

/* 🔹 Importa la estética base */
import "../../Trabajadores/modales/ModalEditarTrabajador.css";
import "./DatosFacturacionModal.css";
import "./ModalesClientesMejoras.css";

/* Defaults */
const DEFAULTS = {
  doc_tipo: 80,
  doc_nro: "",
  razon_social: "",
  domicilio: "",
  id_condicion_iva: "", // ✅ ahora VACIO: no preselecciona
  cond_venta: "Contado / Transferencia Bancaria",
};

const DOC_TIPOS = [
  { id: 80, label: "CUIT (80)" },
  { id: 96, label: "DNI (96)" },
];

// arma URL de listas global desde apiBase (que viene como ...api.php?action=clientes)
function buildListasUrl(apiBase) {
  try {
    // caso común: ".../api.php?action=clientes"
    return String(apiBase).includes("action=clientes")
      ? String(apiBase).replace("action=clientes", "action=listas")
      : `${String(apiBase).split("?")[0]}?action=listas`;
  } catch {
    return `${apiBase}`;
  }
}

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

  // ✅ opciones IVA desde global/listas
  const [ivaOps, setIvaOps] = useState([]);
  const [loadingIva, setLoadingIva] = useState(false);

  const id_cliente = useMemo(() => Number(cliente?.id_cliente || 0), [cliente]);

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

  /* ✅ cargar listas IVA (global) */
  useEffect(() => {
    if (!open) return;
    let alive = true;

    (async () => {
      setLoadingIva(true);
      try {
        const urlListas = buildListasUrl(apiBase);
        const data = await apiFetch(urlListas, { method: "GET" });
        const arr = data?.listas?.iva_condiciones || [];
        if (alive) setIvaOps(Array.isArray(arr) ? arr : []);
      } catch {
        if (alive) setIvaOps([]);
      } finally {
        alive && setLoadingIva(false);
      }
    })();

    return () => (alive = false);
  }, [open, apiFetch, apiBase]);

  /* Cargar datos facturación */
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
          const ivaId = f?.id_condicion_iva;

          setForm({
            doc_tipo: Number(f?.doc_tipo ?? DEFAULTS.doc_tipo),
            doc_nro: String(f?.doc_nro ?? ""),
            razon_social: String(f?.razon_social ?? cliente?.nombre ?? ""),
            domicilio: String(f?.domicilio ?? ""),
            // ✅ si viene en DB, usarlo; si no, dejar vacío
            id_condicion_iva:
              ivaId == null || ivaId === ""
                ? ""
                : Number(ivaId),
            cond_venta: String(f?.cond_venta ?? DEFAULTS.cond_venta),
          });
        }
      } catch {
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

  const onDocNro = (v) => set("doc_nro", String(v || "").replace(/[^\d]/g, ""));

  const cerrar = () => !saving && onClose?.();

  const guardar = async (e) => {
    e.preventDefault();

    const doc_nro = form.doc_nro.trim();
    const razon_social = form.razon_social.trim();

    if (!razon_social) return onToast?.("advertencia", "Razón social obligatoria");
    if (!doc_nro) return onToast?.("advertencia", "Documento obligatorio");

    // ✅ ahora es obligatorio elegir condición IVA
    if (form.id_condicion_iva === "" || form.id_condicion_iva == null) {
      return onToast?.("advertencia", "Seleccioná una condición IVA");
    }

    // ✅ validar selección IVA si hay opciones cargadas
    if (ivaOps.length > 0) {
      const ok = ivaOps.some((x) => Number(x.id) === Number(form.id_condicion_iva));
      if (!ok) return onToast?.("advertencia", "Condición IVA inválida");
    }

    setSaving(true);
    try {
      const payload = {
        id_cliente,
        doc_tipo: Number(form.doc_tipo),
        doc_nro: Number(doc_nro),
        razon_social,
        domicilio: form.domicilio.trim(),
        id_condicion_iva: Number(form.id_condicion_iva),
        cond_venta: form.cond_venta.trim(),
      };

      const data = await apiFetch(`${apiBase}&op=facturacion_upsert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      onToast?.("exito", data?.mensaje || "Datos guardados");
      cerrar();
    } catch (e2) {
      onToast?.("error", e2?.message || "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="mi-modal__overlay"
      onClick={(e) => e.target.classList.contains("mi-modal__overlay") && cerrar()}
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
                        onChange={(e) => set("doc_tipo", Number(e.target.value))}
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

                    {/* ✅ CONDICION IVA: placeholder + solo descripcion */}
                    <div className="fl-field">
                      <select
                        className="fl-input fl-select"
                        value={form.id_condicion_iva}
                        onChange={(e) => {
                          const v = e.target.value;
                          set("id_condicion_iva", v === "" ? "" : Number(v));
                        }}
                        disabled={saving || loadingIva}
                      >
                        <option value="">
                          {loadingIva
                            ? "Cargando condiciones IVA..."
                            : "Seleccione condición IVA"}
                        </option>

                        {ivaOps.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.descripcion}
                          </option>
                        ))}
                      </select>
                      <label className="fl-label">Condición IVA *</label>
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
