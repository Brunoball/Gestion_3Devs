import React, { useEffect } from "react";
import "./SistemasModal.css";

export default function SistemasModal({
  open,
  onClose,
  cliente,
  sistemas,
  cargando,
  onOpenAdd, // ✅ botón para abrir el otro modal
  children,
}) {
  useEffect(() => {
    if (!open) return;

    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const nombre = cliente?.nombre || "Cliente";

  return (
    <div className="sm-backdrop" onMouseDown={onClose}>
      <div className="sm-modal" onMouseDown={(e) => e.stopPropagation()}>
        {/* Header fijo */}
        <div className="sm-header">
          <div className="sm-title">
            <div className="sm-title-big">Sistemas</div>
            <div className="sm-title-sub">
              Cliente: <b>{nombre}</b>
            </div>
          </div>

          <div className="sm-header-actions">
            <button
              className="sm-btn sm-btn-primary"
              type="button"
              onClick={onOpenAdd}
              title="Agregar sistema"
            >
              + Agregar
            </button>

            <button
              className="sm-close"
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              title="Cerrar"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body con scroll */}
        <div className="sm-body">
          {cargando ? (
            <div className="sm-loading">Cargando sistemas…</div>
          ) : (
            <>
              <div className="sm-section">
                <div className="sm-section-title">Administración</div>
                <div className="sm-section-sub">
                  Acá solo ves, editás, eliminás y asignás trabajadores. Para cargar un sistema nuevo usá “+ Agregar”.
                </div>
              </div>

              <div className="sm-content">{children}</div>

              {!cargando && Array.isArray(sistemas) && sistemas.length === 0 && (
                <div className="sm-empty">
                  Este cliente todavía no tiene sistemas cargados.
                  <button className="sm-link" type="button" onClick={onOpenAdd}>
                    Agregar el primero
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer fijo */}
        <div className="sm-footer">
          <button className="sm-btn sm-btn-secondary" type="button" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
