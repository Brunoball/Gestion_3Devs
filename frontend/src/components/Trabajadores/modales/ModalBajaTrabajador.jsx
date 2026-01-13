// src/components/Trabajadores/modales/ModalBajaTrabajador.jsx
import React, { useState, useEffect, useRef, useMemo } from "react";
import BASE_URL from "../../../config/config";
import Toast from "../../Global/Toast";
import "./ModalBajaTrabajador.css";
import { FaTrashAlt } from "react-icons/fa";

function buildApiUrl(base, qs) {
  const b = String(base || "").replace(/\/+$/, ""); // sin barra final
  // si base ya termina en api.php -> agregamos ?...
  if (/\/api\.php$/i.test(b)) return `${b}?${qs}`;
  // si base es carpeta (/routes) -> agregamos /api.php?...
  return `${b}/api.php?${qs}`;
}

const apiPost = async (url, payload) => {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload ?? {}),
  });

  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {}

  if (!res.ok) {
    const msg = data?.mensaje || text || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  if (!data) throw new Error("Respuesta inválida del servidor (no es JSON).");

  return data;
};

export default function ModalBajaTrabajador({ open, onClose, onSaved, trabajador }) {
  const [loading, setLoading] = useState(false);
  const submitLockRef = useRef(false);

  const [toast, setToast] = useState({ show: false, tipo: "info", mensaje: "" });
  const closeToast = () => setToast((s) => ({ ...s, show: false }));

  useEffect(() => {
    if (!open) return;

    submitLockRef.current = false;
    setLoading(false);
    setToast((s) => ({ ...s, show: false }));

    const handleEsc = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [open, onClose]);

  const nombreCompleto = useMemo(() => {
    return `${(trabajador?.nombre ?? "").trim()} ${(trabajador?.apellido ?? "").trim()}`.trim();
  }, [trabajador?.nombre, trabajador?.apellido]);

  if (!open) return null;

  const cerrar = () => {
    if (loading) return;
    onClose?.();
  };

  const confirmarBaja = async () => {
    if (submitLockRef.current) return;
    submitLockRef.current = true;

    if (!trabajador?.id) {
      setToast({ show: true, tipo: "error", mensaje: "Falta el ID del trabajador." });
      submitLockRef.current = false;
      return;
    }

    setLoading(true);

    try {
      const url = buildApiUrl(BASE_URL, "action=trabajadores&op=baja");
      // console.log("URL baja:", url);

      const data = await apiPost(url, { id: trabajador.id });

      if (!data?.exito) {
        setToast({ show: true, tipo: "error", mensaje: data?.mensaje || "No se pudo dar de baja." });
        submitLockRef.current = false;
        return;
      }

      onSaved?.();
      onClose?.(); // cerrar
    } catch (e) {
      setToast({
        show: true,
        tipo: "error",
        mensaje: e?.message || "Falló el fetch (revisá que tu API local esté corriendo).",
      });
      submitLockRef.current = false;
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="emp-baja-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-baja-trabajador-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) cerrar();
      }}
    >
      {toast.show && (
        <Toast tipo={toast.tipo} mensaje={toast.mensaje} onClose={closeToast} duracion={3000} />
      )}

      <div className="emp-baja-modal emp-baja-modal--danger">
        <div className="emp-baja-modal__icon emp-baja-modal__icon--danger" aria-hidden="true">
          <FaTrashAlt />
        </div>

        <h3 id="modal-baja-trabajador-title" className="emp-baja-modal__title emp-baja-modal__title--danger">
          Dar de baja
        </h3>

        <p className="emp-baja-modal__body">
          ¿Dar de baja a <strong>{nombreCompleto || "este trabajador"}</strong>?
          <br />
          Quedará marcado como <strong>inactivo</strong>.
        </p>

        <div className="emp-baja-modal__actions">
          <button type="button" className="emp-baja-btn emp-baja-btn--ghost" onClick={cerrar} disabled={loading}>
            Cancelar
          </button>

          <button
            type="button"
            className="emp-baja-btn emp-baja-btn--solid-danger"
            onClick={confirmarBaja}
            disabled={loading}
          >
            {loading ? "Procesando..." : "Sí, dar de baja"}
          </button>
        </div>
      </div>
    </div>
  );
}
