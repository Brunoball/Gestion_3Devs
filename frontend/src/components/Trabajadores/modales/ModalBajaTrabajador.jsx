import React, { useMemo, useState } from "react";
import { FaTrashAlt } from "react-icons/fa";
import BASE_URL from "../../../config/config";
import Toast from "../../Global/Toast";
import { fetchJSONAuth } from "../../Global/api";
import "./ModalBajaTrabajador.css";

export default function ModalBajaTrabajador({ open, onClose, onSaved, trabajador, idOrganizacion, organizacionNombre }) {
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({ open: false, tipo: "info", mensaje: "" });
  const nombre = useMemo(() => `${trabajador?.nombre || ""} ${trabajador?.apellido || ""}`.trim(), [trabajador]);
  if (!open) return null;

  const confirm = async () => {
    setLoading(true);
    try {
      await fetchJSONAuth(`${BASE_URL}/api.php?action=trabajadores&op=baja`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: trabajador?.id }),
      }, idOrganizacion);
      onSaved?.();
    } catch (error) {
      setToast({ open: true, tipo: "error", mensaje: error?.message || "No se pudo dar de baja." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="emp-baja-modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && !loading && onClose?.()}>
      {toast.open && <Toast {...toast} onClose={() => setToast((t) => ({ ...t, open: false }))} />}
      <div className="emp-baja-modal emp-baja-modal--danger">
        <div className="emp-baja-modal__icon emp-baja-modal__icon--danger"><FaTrashAlt /></div>
        <h3 className="emp-baja-modal__title emp-baja-modal__title--danger">Dar de baja en {organizacionNombre || "esta entidad"}</h3>
        <p className="emp-baja-modal__body">
          ¿Dar de baja a <strong>{nombre || "este trabajador"}</strong>? La persona seguirá disponible en otras entidades donde esté vinculada.
        </p>
        <div className="emp-baja-modal__actions">
          <button type="button" className="emp-baja-btn emp-baja-btn--ghost" onClick={onClose} disabled={loading}>Cancelar</button>
          <button type="button" className="emp-baja-btn emp-baja-btn--solid-danger" onClick={confirm} disabled={loading}>{loading ? "Procesando…" : "Sí, dar de baja"}</button>
        </div>
      </div>
    </div>
  );
}
