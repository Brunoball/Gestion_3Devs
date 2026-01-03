// src/components/Pagos/modales/ModalEquipoPago.jsx
import React, { useEffect, useMemo, useState } from "react";
import { FaTimes, FaUsers } from "react-icons/fa";
import "./ModalEquipoPago.css";

function formatARS(value) {
  const n = Number(value);
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
    return `${mes}${anio ? ` / ${anio}` : ""}`.trim();
  }, [data]);

  // ✅ solo trabajadores activos para el reparto
  const trabajadoresActivos = useMemo(() => {
    return (trabajadores || []).filter((t) => String(t?.activo ?? 1) === "1");
  }, [trabajadores]);

  const montoNumerico = useMemo(() => {
    const n = Number(montoCobrado);
    return Number.isFinite(n) ? n : 0;
  }, [montoCobrado]);

  const montoPorTrabajador = useMemo(() => {
    const cant = trabajadoresActivos.length;
    if (!cant || !montoNumerico) return 0;
    return montoNumerico / cant;
  }, [montoNumerico, trabajadoresActivos.length]);

  useEffect(() => {
    if (!open) return;

    setError("");
    setTrabajadores([]);

    // precarga (si viene del row), luego el backend puede sobre-escribirlo
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

        if (!res.ok) {
          throw new Error(json?.mensaje || json?.error || `HTTP ${res.status}`);
        }
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
        setError(e.message || "No se pudo cargar el equipo del sistema");
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [open, apiBase, action, id_sistema, data]);

  if (!open) return null;

  return (
    <div className="meq_overlay" onMouseDown={onClose}>
      <div className="meq_modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="meq_header">
          <div className="meq_title">
            <FaUsers />
            <div>
              <h3>Equipo / Monto cobrado</h3>
              <p className="meq_subtitle">{tituloSistema}</p>
            </div>
          </div>

          <button
            className="meq_close"
            onClick={onClose}
            type="button"
            title="Cerrar"
          >
            <FaTimes />
          </button>
        </div>

        <div className="meq_body">
          {error && <div className="meq_error">{error}</div>}

          <div className="meq_grid">
            <div className="meq_field">
              <label>Monto cobrado</label>
              <input
                type="text"
                value={montoCobrado === "" ? "" : formatARS(montoCobrado)}
                readOnly
                placeholder="—"
              />
              <small>(Se toma del pago registrado para este período.)</small>
            </div>

            <div className="meq_field">
              <label>Periodo</label>
              <input type="text" value={periodoLabel} readOnly />
              <small>Se usa el mes/año seleccionado en Pagos.</small>
            </div>

            <div className="meq_field">
              <label>Reparto entre activos</label>
              <input
                type="text"
                value={
                  trabajadoresActivos.length
                    ? `${trabajadoresActivos.length} trabajador(es)`
                    : "0 trabajador(es)"
                }
                readOnly
              />
              <small>
                Monto por trabajador:{" "}
                <b>{trabajadoresActivos.length ? formatARS(montoPorTrabajador) : "—"}</b>
              </small>
            </div>
          </div>

          <div className="meq_section">
            <h4>Trabajadores del sistema</h4>

            {loading ? (
              <div className="meq_loading">Cargando equipo...</div>
            ) : trabajadores.length === 0 ? (
              <div className="meq_empty">No hay trabajadores asignados a este sistema.</div>
            ) : (
              <div className="meq_tablewrap">
                <table className="meq_table">
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
                          style={!isActivo ? { opacity: 0.55 } : undefined}
                          title={!isActivo ? "Trabajador inactivo (no participa del reparto)" : ""}
                        >
                          <td>{nombre}</td>
                          <td>{t?.alias_pago || "—"}</td>
                          <td>{isActivo && montoPorTrabajador ? formatARS(montoPorTrabajador) : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                <div style={{ marginTop: 10, fontSize: 12, opacity: 0.85 }}>
                  * Los trabajadores inactivos aparecen atenuados y no participan del reparto.
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="meq_footer">
          <button className="meq_btn meq_btn_ghost" onClick={onClose} type="button">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
