// src/components/Clientes/modales/SistemasModal.jsx
import React, { useEffect } from "react";
import "./SistemasModal.css";

import { FaPlus } from "react-icons/fa";

export default function SistemasModal({
  open,
  onClose,
  cliente,
  sistemas,
  cargando,
  onOpenAdd,
  canWrite = true,
  children,
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const nombre = cliente?.nombre || "Cliente";
  const lista = Array.isArray(sistemas) ? sistemas : [];

  return (
    <div
      className="mi-modal__overlay"
      onClick={(e) =>
        e.target.classList.contains("mi-modal__overlay") && onClose?.()
      }
    >
      <div
        className="mi-modal__container"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mi-modal-title-sistemas"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mi-modal__header">
          <div className="mi-modal__head-left">
            <h2 id="mi-modal-title-sistemas" className="mi-modal__title">
              Sistemas
            </h2>
            <p className="mi-modal__subtitle">
              Cliente: <b>{nombre}</b>
            </p>
          </div>

          <div className="mi-modal__head-actions">
            {canWrite && (
              <button
                className="mi-btn mi-btn--primary"
                type="button"
                onClick={onOpenAdd}
                title="Agregar sistema"
              >
                <FaPlus /> Agregar
              </button>
            )}

            <button
              className="mi-modal__close"
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              title="Cerrar"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="mi-modal__content">
          {cargando ? (
            <div className="mi-loading">Cargando sistemas…</div>
          ) : (
            <>
              <div className="mi-section">
                <div className="mi-section__title">Administración</div>
                <div className="mi-section__sub">
                  {canWrite
                    ? "Acá administrás el servicio contratado y la distribución que corresponda."
                    : "Acceso de solo lectura para esta organización."}
                </div>
              </div>

              {/* ✅ IMPORTANTÍSIMO: seguimos renderizando lo de adentro desde Clientes.jsx */}
              <div className="mi-content">{children}</div>

              {lista.length === 0 && (
                <div className="mi-empty">
                  <span>Este cliente todavía no tiene sistemas cargados.</span>
                  {canWrite && (
                    <button className="mi-link" type="button" onClick={onOpenAdd}>
                      Agregar el primero
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="mi-modal__footer">
          <button
            className="mi-btn mi-btn--secondary"
            type="button"
            onClick={onClose}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
