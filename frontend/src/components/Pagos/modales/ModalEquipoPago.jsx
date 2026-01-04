// src/components/Pagos/modales/ModalEquipoPago.jsx
import React, { useEffect, useMemo, useState } from "react";
import { FaUsers } from "react-icons/fa";
import "../../Trabajadores/modales/ModalEditarTrabajador.css"; // ✅ MISMA estética
import "./ModalEquipoPago.css"; // ✅ solo ajustes (tabla/hints)

function formatARS(value) {
  const n = Number(
    typeof value === "string" ? value.replace(/[^\d.-]/g, "") : value
  );
  if (!Number.isFinite(n)) return "—";
  try {
    return n.toLocaleString("es-AR", {
      style: "currency",
      currency: "ARS",
      maximumFractionDigits: 2,
    });
  } catch {
    return `$ ${n.toFixed(2)}`;
  }
}

export default function ModalEquipoPago({ open, onClose, apiBase, action, data }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [trabajadores, setTrabajadores] = useState([]);
  const [montoCobrado, setMontoCobrado] = useState("");

  const id_sistema = data?.id_sistema || null;

  const tituloSistema = useMemo(() => {
    const s = data?.labelSistema ? String(data.labelSistema) : "Sistema";
    const c = data?.labelCliente ? String(data.labelCliente) : "";
    return c ? `${s} — ${c}` : s;
  }, [data]);

  const periodoLabel = useMemo(() => {
    const mes = data?.mes ?? "";
    const anio = data?.anio ?? "";
    return `${mes}${anio ? ` / ${anio}` : ""}`.trim() || "—";
  }, [data]);

  const trabajadoresActivos = useMemo(() => {
    return (trabajadores || []).filter((t) => String(t?.activo ?? 1) === "1");
  }, [trabajadores]);

  const montoNumerico = useMemo(() => {
    const n = Number(String(montoCobrado).replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }, [montoCobrado]);

  const montoPorTrabajador = useMemo(() => {
    const cant = trabajadoresActivos.length;
    if (!cant || !montoNumerico) return 0;
    return montoNumerico / cant;
  }, [montoNumerico, trabajadoresActivos.length]);

  const cerrar = () => {
    if (loading) return;
    onClose?.();
  };

  useEffect(() => {
    if (!open) return;

    setError("");
    setTrabajadores([]);

    // precarga (si viene del row)
    if (data?.monto != null && data?.monto !== "") setMontoCobrado(String(data.monto));
    else setMontoCobrado("");

    const run = async () => {
      if (!id_sistema) {
        setError("Falta id_sistema.");
        return;
      }

      setLoading(true);
      try {
        const url =
          `${apiBase}?action=${encodeURIComponent(action)}` +
          `&op=equipo_sistema&id_sistema=${encodeURIComponent(id_sistema)}` +
          (data?.anio ? `&anio=${encodeURIComponent(data.anio)}` : "") +
          (data?.mes ? `&mes=${encodeURIComponent(data.mes)}` : "");

        const res = await fetch(url, { method: "GET" });
        const json = await res.json().catch(() => null);

        if (!res.ok) throw new Error(json?.mensaje || json?.error || `HTTP ${res.status}`);
        if (json && typeof json === "object" && json?.exito === false) {
          throw new Error(json?.mensaje || "Error en el servidor");
        }

        const arr = Array.isArray(json?.trabajadores)
          ? json.trabajadores
          : Array.isArray(json)
          ? json
          : [];

        setTrabajadores(arr);

        // ✅ monto real del periodo (si existe)
        if (json?.pago?.monto != null && json?.pago?.monto !== "") {
          setMontoCobrado(String(json.pago.monto));
        }
      } catch (e) {
        setError(e?.message || "No se pudo cargar el equipo del sistema");
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [open, apiBase, action, id_sistema, data]);

  // ESC para cerrar (igual a los otros)
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && cerrar();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loading]);

  if (!open) return null;

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
        {/* Header azul */}
        <div className="mi-modal__header">
          <div className="mi-modal__head-left">
            <h2 className="mi-modal__title">
              <span className="mep-inlineicon">
                <FaUsers />
              </span>
              Equipo / Monto cobrado
            </h2>
            <p className="mi-modal__subtitle">{tituloSistema}</p>
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

        {/* Body estilo cards */}
        <div className="mit-modal__body">
          <div className="mi-tabpanel is-active">
            {error && <div className="mep-alert mep-alert--error">{error}</div>}

            <div className="mi-grid">
              {/* Resumen */}
              <article className="mi-card mep-card--full">
                <h3 className="mi-card__title">Resumen</h3>

                <div className="fl-grid">
                  <div className="fl-field fl-col-full">
                    <input
                      className="fl-input"
                      placeholder=" "
                      value={montoCobrado === "" ? "" : formatARS(montoCobrado)}
                      readOnly
                    />
                    <label className="fl-label">Monto cobrado</label>
                    <div className="mep-hint">
                      Se toma del pago registrado para este período.
                    </div>
                  </div>

                  <div className="fl-field">
                    <input className="fl-input" placeholder=" " value={periodoLabel} readOnly />
                    <label className="fl-label">Período</label>
                    <div className="mep-hint">Mes/año seleccionado en Pagos.</div>
                  </div>

                  <div className="fl-field">
                    <input
                      className="fl-input"
                      placeholder=" "
                      value={`${trabajadoresActivos.length} trabajador(es)`}
                      readOnly
                    />
                    <label className="fl-label">Reparto entre activos</label>
                    <div className="mep-hint">
                      Monto por trabajador:{" "}
                      <b>{trabajadoresActivos.length ? formatARS(montoPorTrabajador) : "—"}</b>
                    </div>
                  </div>
                </div>
              </article>

              {/* Equipo */}
              <article className="mi-card mi-card--full">
                <h3 className="mi-card__title">Trabajadores del sistema</h3>

                {loading ? (
                  <div className="mep-empty">Cargando equipo...</div>
                ) : trabajadores.length === 0 ? (
                  <div className="mep-empty">No hay trabajadores asignados a este sistema.</div>
                ) : (
                  <>
                    <div className="mep-tablewrap">
                      <table className="mep-table">
                        <thead>
                          <tr>
                            <th>Trabajador</th>
                            <th>Alias pago</th>
                            <th>Monto a cobrar</th>
                          </tr>
                        </thead>
                        <tbody>
                          {trabajadores.map((t, i) => {
                            const isActivo = String(t?.activo ?? 1) === "1";
                            const nombre = `${(t?.apellido || "").toString().trim()} ${(t?.nombre || "")
                              .toString()
                              .trim()}`.trim() || "—";

                            return (
                              <tr
                                key={t?.id_trabajador || t?.id || i}
                                className={!isActivo ? "is-inactivo" : ""}
                                title={!isActivo ? "Trabajador inactivo (no participa del reparto)" : ""}
                              >
                                <td>{nombre}</td>
                                <td>{t?.alias_pago || "—"}</td>
                                <td>
                                  {isActivo && montoPorTrabajador
                                    ? formatARS(montoPorTrabajador)
                                    : "—"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div className="mep-hint" style={{ marginTop: 10 }}>
                      * Los trabajadores inactivos aparecen atenuados y no participan del reparto.
                    </div>
                  </>
                )}
              </article>
            </div>
          </div>

          {/* Footer acciones (igual estilo) */}
          <div className="mit-actions">
            <button
              type="button"
              className="mit-btn mit-btn--ghost"
              onClick={cerrar}
              disabled={loading}
            >
              Cerrar
            </button>
          </div>

          <div className="mit-help">* Este modal es solo informativo (reparto estimado).</div>
        </div>
      </div>
    </div>
  );
}
