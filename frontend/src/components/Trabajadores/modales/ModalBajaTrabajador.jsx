import React, { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { FaTrashAlt } from "react-icons/fa";
import BASE_URL from "../../../config/config";
import Toast from "../../Global/Toast";
import { fetchJSONAuth } from "../../Global/api";
import "./ModalBajaTrabajador.css";
import "./ModalTrabajadorV2.css";

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

  return createPortal(
    <div className="tp-worker-modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && !loading && onClose?.()}>
      {toast.open && <Toast {...toast} onClose={() => setToast((t) => ({ ...t, open: false }))} />}
      <div className="tp-worker-modal tp-worker-modal--confirm" role="dialog" aria-modal="true" aria-labelledby="tp-disable-worker-title">
        <div className="tp-worker-modal__confirm-body">
          <div className="tp-worker-modal__danger-icon" aria-hidden="true"><FaTrashAlt /></div>
          <h3 id="tp-disable-worker-title" className="tp-worker-modal__confirm-title">Dar de baja en {organizacionNombre || "esta entidad"}</h3>
          <p className="tp-worker-modal__confirm-text">
            ¿Dar de baja a <strong>{nombre || "este trabajador"}</strong>? La persona seguirá disponible en otras entidades donde esté vinculada.
          </p>
        </div>
        <div className="mit-actions">
          <button type="button" className="mit-btn mit-btn--ghost" onClick={onClose} disabled={loading}>Cancelar</button>
          <button type="button" className="mit-btn mit-btn--danger" onClick={confirm} disabled={loading}>{loading ? "Procesando…" : "Sí, dar de baja"}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
