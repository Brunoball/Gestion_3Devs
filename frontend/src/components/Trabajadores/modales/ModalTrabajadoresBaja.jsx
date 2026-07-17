import React, { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUserCheck, faTrashAlt } from "@fortawesome/free-solid-svg-icons";
import BASE_URL from "../../../config/config";
import Toast from "../../Global/Toast";
import { fetchJSONAuth } from "../../Global/api";
import "./ModalEditarTrabajador.css";
import "./ModalBajaTrabajador.css";

export default function ModalTrabajadoresBaja({ open, onClose, onChanged, idOrganizacion, organizacionNombre }) {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({ open: false, tipo: "info", mensaje: "" });

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchJSONAuth(`${BASE_URL}/api.php?action=trabajadores&op=listar&activos=0`, { method: "GET" }, idOrganizacion);
      setRows(Array.isArray(data?.data) ? data.data : []);
    } catch (error) {
      setToast({ open: true, tipo: "error", mensaje: error?.message || "No se pudo cargar." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, idOrganizacion]);

  const filtered = useMemo(() => {
    const value = q.trim().toLowerCase();
    return !value ? rows : rows.filter((row) => `${row.nombre} ${row.apellido} ${row.email || ""}`.toLowerCase().includes(value));
  }, [rows, q]);

  if (!open) return null;

  const act = async (op, row) => {
    setLoading(true);
    try {
      const data = await fetchJSONAuth(`${BASE_URL}/api.php?action=trabajadores&op=${op}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id }),
      }, idOrganizacion);
      setToast({ open: true, tipo: "exito", mensaje: data?.mensaje || "Operación realizada." });
      await load();
      onChanged?.();
    } catch (error) {
      setToast({ open: true, tipo: "error", mensaje: error?.message || "No se pudo completar." });
      setLoading(false);
    }
  };

  return (
    <div className="mi-modal__overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      {toast.open && <Toast {...toast} onClose={() => setToast((t) => ({ ...t, open: false }))} />}
      <div className="mi-modal__container" role="dialog" aria-modal="true">
        <div className="mi-modal__header">
          <div>
            <h2 className="mi-modal__title">Bajas de {organizacionNombre || "la entidad"}</h2>
            <p className="mi-modal__subtitle">Reactivar o desvincular definitivamente de esta entidad.</p>
          </div>
          <button type="button" className="mi-modal__close" onClick={onClose}>✕</button>
        </div>
        <div className="mit-modal__body">
          <div className="fl-field fl-col-full">
            <input className="fl-input" placeholder=" " value={q} onChange={(e) => setQ(e.target.value)} />
            <label className="fl-label">Buscar</label>
          </div>
          <div className="mi-card mi-card--full" style={{ marginTop: 16 }}>
            {loading && !rows.length ? <p>Cargando…</p> : filtered.length === 0 ? <p>No hay trabajadores dados de baja.</p> : filtered.map((row) => (
              <div className="mi-row" key={row.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0" }}>
                <div><strong>{row.apellido}, {row.nombre}</strong><div style={{ opacity: .7 }}>{row.email || "—"}</div></div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="mit-btn mit-btn--solid" type="button" onClick={() => act("reactivar", row)} disabled={loading} title="Reactivar"><FontAwesomeIcon icon={faUserCheck} /></button>
                  <button className="mit-btn mit-btn--danger" type="button" onClick={() => act("eliminar", row)} disabled={loading} title="Desvincular de esta entidad"><FontAwesomeIcon icon={faTrashAlt} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="mit-actions"><button className="mit-btn mit-btn--ghost" onClick={onClose}>Cerrar</button></div>
      </div>
    </div>
  );
}
