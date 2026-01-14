import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import BASE_URL from "../../../config/config";
import "./ModalPlan.css";

export default function ModalEditarPlan({ open, plan, onClose, onConfirm, loading }) {
  const firstRef = useRef(null);

  const [form, setForm] = useState({
    id: null,
    nombre: "",
    descripcion: "",
    monto: "", // USD (string controlado)
    activo: 1,
  });

  const [error, setError] = useState("");

  // Dólar oficial hoy (venta)
  const [dolar, setDolar] = useState({
    loading: false,
    error: "",
    venta: null,
    compra: null,
    fuente: "",
  });

  const API_BASE = `${BASE_URL}/api.php`;

  // ✅ Sanitiza monto: solo dígitos + un separador decimal (.,)
  const sanitizeMontoInput = useCallback((raw) => {
    let s = String(raw ?? "");

    // 1) dejar solo dígitos, punto y coma
    s = s.replace(/[^\d.,]/g, "");

    // 2) permitir SOLO 1 separador decimal (el primero que aparezca)
    const firstDot = s.indexOf(".");
    const firstComma = s.indexOf(",");

    let sepIndex = -1;
    let sepChar = "";

    if (firstDot === -1 && firstComma === -1) {
      sepIndex = -1;
    } else if (firstDot === -1) {
      sepIndex = firstComma;
      sepChar = ",";
    } else if (firstComma === -1) {
      sepIndex = firstDot;
      sepChar = ".";
    } else {
      if (firstDot < firstComma) {
        sepIndex = firstDot;
        sepChar = ".";
      } else {
        sepIndex = firstComma;
        sepChar = ",";
      }
    }

    if (sepIndex !== -1) {
      const left = s.slice(0, sepIndex).replace(/[.,]/g, "");
      const right = s.slice(sepIndex + 1).replace(/[.,]/g, "");
      s = left + sepChar + right;
    } else {
      s = s.replace(/[.,]/g, "");
    }

    return s;
  }, []);

  // ✅ Convierte a number (soporta 1234,56 / 1234.56 / 1234)
  const parseMoney = (v) => {
    const s = String(v ?? "").trim();
    if (!s) return NaN;
    if (s.includes(",") && !s.includes(".")) return Number(s.replace(",", "."));
    return Number(s);
  };

  const fmtARS = (n) =>
    Number(n || 0).toLocaleString("es-AR", {
      style: "currency",
      currency: "ARS",
      maximumFractionDigits: 0,
    });

  const fmtUSD = (n) =>
    Number(n || 0).toLocaleString("es-AR", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    });

  useEffect(() => {
    if (!open) return;

    setForm({
      id: plan?.id ?? null,
      nombre: plan?.nombre ?? "",
      descripcion: plan?.descripcion ?? "",
      monto: plan?.monto ?? "", // USD
      activo: plan?.activo ?? 1,
    });

    setError("");
    setTimeout(() => firstRef.current?.focus(), 0);

    (async () => {
      try {
        setDolar((d) => ({
          ...d,
          loading: true,
          error: "",
          venta: null,
          compra: null,
          fuente: "",
        }));

        const res = await fetch(`${API_BASE}?action=dolar_oficial&ts=${Date.now()}`);
        const text = await res.text();

        if (!res.ok) throw new Error(`HTTP ${res.status} :: ${text.slice(0, 200)}`);

        const trimmed = (text || "").trim();
        if (trimmed.startsWith("<")) {
          throw new Error(`Backend devolvió HTML (error PHP). ${trimmed.slice(0, 200)}`);
        }

        const data = JSON.parse(trimmed || "{}");
        if (!data?.ok) throw new Error(data?.error || "No se pudo obtener el dólar.");

        setDolar((d) => ({
          ...d,
          loading: false,
          error: "",
          venta: Number(data?.venta ?? 0),
          compra: Number(data?.compra ?? 0),
          fuente: String(data?.fuente ?? "Dólar Oficial"),
        }));
      } catch (e) {
        setDolar((d) => ({
          ...d,
          loading: false,
          error: String(e?.message || "Error obteniendo dólar"),
        }));
      }
    })();
  }, [open, plan, API_BASE]);

  // ESC cierra
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

  const montoUsdNum = parseMoney(form.monto);
  const venta = Number(dolar.venta || 0);
  const arsCalc =
    Number.isFinite(montoUsdNum) && montoUsdNum >= 0 && venta > 0 ? montoUsdNum * venta : null;

  const submit = (e) => {
    e?.preventDefault?.();
    setError("");

    const nombre = (form.nombre ?? "").trim();
    const descripcion = (form.descripcion ?? "").trim();

    if (!form.id) return setError("Plan inválido.");
    if (!nombre) return setError("El nombre es obligatorio.");
    if (!String(form.monto ?? "").trim()) return setError("El monto es obligatorio.");

    const montoNum = parseMoney(form.monto);
    if (!Number.isFinite(montoNum) || montoNum < 0) {
      return setError("El monto (USD) es inválido.");
    }

    onConfirm?.({
      id: form.id,
      nombre,
      descripcion,
      monto: montoNum, // ✅ se guarda en USD
      activo: form.activo ? 1 : 0,
    });
  };

  const onMontoChange = (e) => {
    const clean = sanitizeMontoInput(e.target.value);
    setForm((f) => ({ ...f, monto: clean }));
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
        {/* Header */}
        <div className="mi-modal__header">
          <div className="mi-modal__head-left">
            <h2 className="mi-modal__title">Editar plan</h2>
            <p className="mi-modal__subtitle">
              ID: {form.id ?? "-"} &nbsp;|&nbsp; {tituloPlan}
            </p>
          </div>

          <button className="mi-modal__close" onClick={cerrar} aria-label="Cerrar">
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

        <form className="mit-modal__body" onSubmit={submit}>
          <div className="mi-tabpanel is-active">
            {error ? <div className="mnt-modalError">{error}</div> : null}

            {/* DÓLAR HOY */}
            <div className="mit-pill" style={{ marginBottom: 10 }}>
              {dolar.loading ? (
                <>Obteniendo dólar oficial...</>
              ) : dolar.error ? (
                <>No se pudo obtener el dólar: <b>{dolar.error}</b></>
              ) : (
                <>
                  {dolar.fuente || "Dólar Oficial"} (venta): <b>{fmtARS(dolar.venta)}</b>
                </>
              )}
            </div>

            <div className="mi-grid">
              {/* Caja 1 */}
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
                        onChange={(e) =>
                          setForm((f) => ({ ...f, descripcion: e.target.value }))
                        }
                        disabled={loading}
                        rows={4}
                      />
                      <label className="fl-label">Descripción (opcional)</label>
                    </div>
                  </div>
                </div>
              </article>

              {/* Caja 2 */}
              <article className="mi-card">
                <h3 className="mi-card__title">Monto y estado</h3>

                <div className="fl-grid">
                  {/* MONTO USD (solo números) */}
                  <div className="fl-col-full">
                    <div className="fl-field" style={{ position: "relative" }}>
                      <span
                        style={{
                          position: "absolute",
                          left: 12,
                          top: "50%",
                          transform: "translateY(-50%)",
                          fontWeight: 800,
                          opacity: 0.8,
                          pointerEvents: "none",
                        }}
                      >
                        USD
                      </span>

                      <input
                        className="fl-input"
                        placeholder=" "
                        value={form.monto}
                        onChange={onMontoChange}
                        inputMode="decimal"
                        disabled={loading}
                        style={{ paddingLeft: 56 }}
                        autoComplete="off"
                      />
                      <label className="fl-label">Monto (USD) *</label>
                    </div>
                  </div>

                  {/* EQUIVALENTE ARS */}
                  <div className="fl-col-full">
                    <div className="fl-field">
                      <input
                        className="fl-input"
                        placeholder=" "
                        value={arsCalc === null ? "" : fmtARS(arsCalc)}
                        readOnly
                        disabled
                      />
                      <label className="fl-label">Equivalente en ARS (hoy)</label>
                    </div>

                    <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
                      {Number.isFinite(montoUsdNum) && montoUsdNum >= 0 ? (
                        <>Ingresado: <b>{fmtUSD(montoUsdNum)}</b></>
                      ) : (
                        <>Ingresá un monto en USD para ver la conversión.</>
                      )}
                    </div>
                  </div>

                  {/* Switch activo */}
                  <div className="fl-col-full" style={{ marginTop: 4 }}>
                    <label className="mit-switch">
                      <input
                        type="checkbox"
                        checked={!!form.activo}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, activo: e.target.checked ? 1 : 0 }))
                        }
                        disabled={loading}
                      />
                      <span className="mit-switch__track" />
                      <span className="mit-switch__text">
                        {form.activo ? "Activo" : "Inactivo"}
                      </span>
                    </label>
                  </div>
                </div>
              </article>
            </div>
          </div>

          {/* Footer */}
          <div className="mit-actions">
            <button
              type="button"
              className="mit-btn mit-btn--ghost"
              onClick={cerrar}
              disabled={loading}
            >
              Cancelar
            </button>

            <button type="submit" className="mit-btn mit-btn--solid" disabled={loading}>
              {loading ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
