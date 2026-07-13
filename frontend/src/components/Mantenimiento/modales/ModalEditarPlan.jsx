import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import BASE_URL from "../../../config/config";
import "./ModalPlan.css";

export default function ModalEditarPlan({ open, plan, onClose, onConfirm, loading }) {
  const firstRef = useRef(null);

  const [form, setForm] = useState({
    id: null,
    nombre: "",
    descripcion: "",
    montoArs: "",
    montoUsd: "",
    activo: 1,
  });

  const [error, setError] = useState("");
  const [dolar, setDolar] = useState({ loading: false, error: "", venta: null, compra: null, fuente: "" });

  const API_BASE = `${BASE_URL}/api.php`;

  const sanitizeMontoInput = useCallback((raw) => {
    let s = String(raw ?? "");
    s = s.replace(/[^\d.,]/g, "");
    const firstDot = s.indexOf(".");
    const firstComma = s.indexOf(",");
    let sepIndex = -1;
    let sepChar = "";

    if (firstDot === -1 && firstComma === -1) sepIndex = -1;
    else if (firstDot === -1) { sepIndex = firstComma; sepChar = ","; }
    else if (firstComma === -1) { sepIndex = firstDot; sepChar = "."; }
    else if (firstDot < firstComma) { sepIndex = firstDot; sepChar = "."; }
    else { sepIndex = firstComma; sepChar = ","; }

    if (sepIndex !== -1) {
      const left = s.slice(0, sepIndex).replace(/[.,]/g, "");
      const right = s.slice(sepIndex + 1).replace(/[.,]/g, "");
      s = left + sepChar + right;
    } else {
      s = s.replace(/[.,]/g, "");
    }
    return s;
  }, []);

  const parseMoney = (v) => {
    const s = String(v ?? "").trim();
    if (!s) return NaN;
    if (s.includes(",") && !s.includes(".")) return Number(s.replace(",", "."));
    return Number(s);
  };

  const niceMoney = (n, decimals = 2) => {
    const num = Number(n);
    if (!Number.isFinite(num)) return "";
    return num.toFixed(decimals).replace(/\.?0+$/, "");
  };

  const fmtARS = (n) =>
    Number(n || 0).toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

  const fmtUSD = (n) =>
    Number(n || 0).toLocaleString("es-AR", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

  const venta = Number(dolar.venta || 0);

  const calcUsdFromArs = useCallback((ars) => (venta > 0 ? niceMoney(Number(ars) / venta, 2) : ""), [venta]);
  const calcArsFromUsd = useCallback((usd) => (venta > 0 ? niceMoney(Number(usd) * venta, 2) : ""), [venta]);

  useEffect(() => {
    if (!open) return;

    const montoArsInicial = plan?.monto ?? "";
    setForm({
      id: plan?.id ?? null,
      nombre: plan?.nombre ?? "",
      descripcion: plan?.descripcion ?? "",
      montoArs: String(montoArsInicial ?? ""),
      montoUsd: "",
      activo: plan?.activo ?? 1,
    });

    setError("");
    setTimeout(() => firstRef.current?.focus(), 0);

    (async () => {
      try {
        setDolar({ loading: true, error: "", venta: null, compra: null, fuente: "" });
        const res = await fetch(`${API_BASE}?action=dolar_oficial&ts=${Date.now()}`);
        const text = await res.text();
        if (!res.ok) throw new Error(`HTTP ${res.status} :: ${text.slice(0, 200)}`);
        const trimmed = (text || "").trim();
        if (trimmed.startsWith("<")) throw new Error(`Backend devolvió HTML (error PHP). ${trimmed.slice(0, 200)}`);
        const data = JSON.parse(trimmed || "{}");
        if (!data?.ok) throw new Error(data?.error || "No se pudo obtener el dólar.");
        setDolar({
          loading: false,
          error: "",
          venta: Number(data?.venta ?? 0),
          compra: Number(data?.compra ?? 0),
          fuente: String(data?.fuente ?? "Dólar Oficial"),
        });
      } catch (e) {
        setDolar((d) => ({ ...d, loading: false, error: String(e?.message || "Error obteniendo dólar") }));
      }
    })();
  }, [open, plan, API_BASE]);

  useEffect(() => {
    if (!open || venta <= 0) return;
    const ars = parseMoney(form.montoArs);
    if (!Number.isFinite(ars) || ars < 0) return;
    setForm((f) => ({ ...f, montoUsd: calcUsdFromArs(ars) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, venta]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && cerrar();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loading, onClose]);

  const tituloPlan = useMemo(() => {
    const n = (form.nombre || "").trim();
    return n || "-";
  }, [form.nombre]);

  if (!open) return null;

  const cerrar = () => {
    if (loading) return;
    onClose?.();
  };

  const montoArsNum = parseMoney(form.montoArs);
  const montoUsdNum = parseMoney(form.montoUsd);

  const submit = (e) => {
    e?.preventDefault?.();
    setError("");

    const nombre = (form.nombre ?? "").trim();
    const descripcion = (form.descripcion ?? "").trim();

    if (!form.id) return setError("Plan inválido.");
    if (!nombre) return setError("El nombre es obligatorio.");
    if (!String(form.montoArs ?? "").trim()) return setError("El monto en pesos es obligatorio.");

    const montoNum = parseMoney(form.montoArs);
    if (!Number.isFinite(montoNum) || montoNum < 0) return setError("El monto (ARS) es inválido.");

    onConfirm?.({
      id: form.id,
      nombre,
      descripcion,
      monto: montoNum, // ✅ desde ahora se guarda en ARS
      activo: form.activo ? 1 : 0,
    });
  };

  const onArsChange = (e) => {
    const clean = sanitizeMontoInput(e.target.value);
    const n = parseMoney(clean);
    setForm((f) => ({ ...f, montoArs: clean, montoUsd: Number.isFinite(n) && n >= 0 ? calcUsdFromArs(n) : "" }));
  };

  const onUsdChange = (e) => {
    const clean = sanitizeMontoInput(e.target.value);
    const n = parseMoney(clean);
    setForm((f) => ({ ...f, montoUsd: clean, montoArs: Number.isFinite(n) && n >= 0 ? calcArsFromUsd(n) : f.montoArs }));
  };

  return (
    <div className="mi-modal__overlay" onClick={(e) => e.target.classList.contains("mi-modal__overlay") && cerrar()}>
      <div className="mi-modal__container" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="mi-modal__header">
          <div className="mi-modal__head-left">
            <h2 className="mi-modal__title">Editar plan</h2>
            <p className="mi-modal__subtitle">ID: {form.id ?? "-"} &nbsp;|&nbsp; {tituloPlan}</p>
          </div>

          <button className="mi-modal__close" onClick={cerrar} aria-label="Cerrar" type="button">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form className="mit-modal__body" onSubmit={submit}>
          <div className="mi-tabpanel is-active">
            {error ? <div className="mnt-modalError">{error}</div> : null}

            <div className="mit-pill" style={{ marginBottom: 10 }}>
              {dolar.loading ? (
                <>Obteniendo dólar oficial...</>
              ) : dolar.error ? (
                <>Dólar no disponible: <b>{dolar.error}</b>. Podés editar el monto en pesos igual.</>
              ) : (
                <>{dolar.fuente || "Dólar Oficial"} (venta): <b>{fmtARS(dolar.venta)}</b></>
              )}
            </div>

            <div className="mi-grid">
              <article className="mi-card">
                <h3 className="mi-card__title">Datos del plan</h3>

                <div className="fl-grid">
                  <div className="fl-col-full">
                    <div className="fl-field">
                      <input
                        ref={firstRef}
                        className="fl-input"
                        placeholder=" "
                        value={form.nombre}
                        onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                        disabled={loading}
                      />
                      <label className="fl-label">Nombre *</label>
                    </div>
                  </div>

                  <div className="fl-col-full">
                    <div className="fl-field">
                      <textarea
                        className="fl-input fl-textarea"
                        placeholder=" "
                        value={form.descripcion}
                        onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                        disabled={loading}
                        rows={4}
                      />
                      <label className="fl-label">Descripción (opcional)</label>
                    </div>
                  </div>
                </div>
              </article>

              <article className="mi-card">
                <h3 className="mi-card__title">Monto y estado</h3>

                <div className="fl-grid">
                  <div className="fl-col-full">
                    <div className="fl-field fl-field--prefix">
                      <span className="fl-prefix">ARS</span>
                      <input
                        className="fl-input"
                        placeholder=" "
                        value={form.montoArs}
                        onChange={onArsChange}
                        inputMode="decimal"
                        disabled={loading}
                        autoComplete="off"
                      />
                      <label className="fl-label">Monto en pesos *</label>
                    </div>
                  </div>

                  <div className="fl-col-full">
                    <div className="fl-field fl-field--prefix">
                      <span className="fl-prefix">USD</span>
                      <input
                        className="fl-input"
                        placeholder=" "
                        value={form.montoUsd}
                        onChange={onUsdChange}
                        inputMode="decimal"
                        disabled={loading || venta <= 0}
                        autoComplete="off"
                      />
                      <label className="fl-label">Referencia en dólares</label>
                    </div>

                    <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
                      {Number.isFinite(montoArsNum) && montoArsNum >= 0 ? (
                        <>
                          Se guarda: <b>{fmtARS(montoArsNum)}</b>
                          {Number.isFinite(montoUsdNum) && montoUsdNum >= 0 ? <> · Ref: <b>{fmtUSD(montoUsdNum)}</b></> : null}
                        </>
                      ) : (
                        <>Ingresá el monto en pesos o escribí USD para calcularlo automáticamente.</>
                      )}
                    </div>
                  </div>

                  <div className="fl-col-full" style={{ marginTop: 4 }}>
                    <label className="mit-switch">
                      <input
                        type="checkbox"
                        checked={!!form.activo}
                        onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked ? 1 : 0 }))}
                        disabled={loading}
                      />
                      <span className="mit-switch__track" />
                      <span className="mit-switch__text">{form.activo ? "Activo" : "Inactivo"}</span>
                    </label>
                  </div>
                </div>
              </article>
            </div>
          </div>

          <div className="mit-actions">
            <button type="button" className="mit-btn mit-btn--ghost" onClick={cerrar} disabled={loading}>Cancelar</button>
            <button type="submit" className="mit-btn mit-btn--solid" disabled={loading}>{loading ? "Guardando..." : "Guardar cambios"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
