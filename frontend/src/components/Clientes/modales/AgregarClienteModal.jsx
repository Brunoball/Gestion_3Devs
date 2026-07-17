import React, { useEffect, useRef } from "react";
import { FaTimes, FaUserPlus } from "react-icons/fa";
import "./AgregarClienteModal.css";

export default function AgregarClienteModal({ open, onClose, form, onChange, onSubmit, submitting = false }) {
  const nameRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const timer = window.setTimeout(() => nameRef.current?.focus(), 80);
    const handleKey = (event) => event.key === "Escape" && !submitting && onClose?.();
    document.addEventListener("keydown", handleKey);
    return () => { window.clearTimeout(timer); document.removeEventListener("keydown", handleKey); };
  }, [open, onClose, submitting]);

  if (!open) return null;

  const submit = async (event) => {
    event.preventDefault();
    if (!String(form?.nombre || "").trim() || submitting) return;
    await onSubmit?.();
  };

  return (
    <div className="acm-overlay" onMouseDown={(event) => event.target === event.currentTarget && !submitting && onClose?.()}>
      <section className="acm-modal" role="dialog" aria-modal="true" aria-labelledby="acm-title">
        <header className="acm-header">
          <div className="acm-heading">
            <span className="acm-icon" aria-hidden="true"><FaUserPlus /></span>
            <div><h2 id="acm-title">Agregar cliente</h2><p>Registrá los datos principales. Luego podrás cargar sistemas y facturación.</p></div>
          </div>
          <button type="button" className="acm-close" onClick={onClose} disabled={submitting} aria-label="Cerrar"><FaTimes /></button>
        </header>
        <form onSubmit={submit}>
          <div className="acm-body">
            <div className="acm-field">
              <input ref={nameRef} id="acm-name" value={form?.nombre || ""} placeholder=" " onChange={(event) => onChange?.("nombre", event.target.value)} disabled={submitting} autoComplete="organization" />
              <label htmlFor="acm-name">Nombre del cliente *</label>
            </div>
            <div className="acm-field">
              <textarea id="acm-notes" value={form?.notas || ""} placeholder=" " onChange={(event) => onChange?.("notas", event.target.value)} disabled={submitting} rows={4} />
              <label htmlFor="acm-notes">Nota breve (opcional)</label>
            </div>
          </div>
          <footer className="acm-footer">
            <button type="button" className="acm-btn acm-btn--ghost" onClick={onClose} disabled={submitting}>Cancelar</button>
            <button type="submit" className="acm-btn acm-btn--primary" disabled={submitting || !String(form?.nombre || "").trim()}><FaUserPlus /> {submitting ? "Guardando…" : "Crear cliente"}</button>
          </footer>
        </form>
      </section>
    </div>
  );
}
