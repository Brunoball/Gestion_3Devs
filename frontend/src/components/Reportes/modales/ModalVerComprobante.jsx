// src/components/Contable/modales/ModalVerComprobante.jsx
import React, { useEffect, useMemo, useCallback } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faEye,
  faTimes,
  faUpRightFromSquare,
  faPaperclip,
  faFilePdf,
  faImage,
} from "@fortawesome/free-solid-svg-icons";

// ✅ Reutiliza la estética base (mi-modal__*, mi-card, mit-actions, etc.)
import "../../Trabajadores/modales/ModalEditarTrabajador.css";

// ✅ Solo agregamos estilos específicos del visor
import "./ModalVerComprobante.css";

function isPdf(url) {
  const u = String(url || "").toLowerCase();
  return u.includes(".pdf") || u.startsWith("data:application/pdf");
}

export default function ModalVerComprobante({
  open,
  onClose,
  title = "Comprobante",
  subtitle = "",
  url = "",
}) {
  const pdf = useMemo(() => isPdf(url), [url]);

  const cerrar = useCallback(() => {
    onClose?.();
  }, [onClose]);

  // ESC cierra
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && cerrar();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, cerrar]);

  if (!open) return null;

  const badgeText = !url ? "Sin archivo" : pdf ? "PDF" : "Imagen";
  const badgeIcon = !url ? faPaperclip : pdf ? faFilePdf : faImage;

  return (
    <div
      className="mi-modal__overlay"
      onClick={(e) =>
        e.target.classList.contains("mi-modal__overlay") && cerrar()
      }
    >
      <div
        className="mi-modal__container mvc2__container"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header azul (mi-modal__header) */}
        <div className="mi-modal__header">
          <div className="mi-modal__head-left">
            <h2 className="mi-modal__title">
              <FontAwesomeIcon icon={faEye} /> {title}
              <span className={`mvc2-badge ${pdf ? "is-pdf" : url ? "is-img" : ""}`}>
                <FontAwesomeIcon icon={badgeIcon} /> {badgeText}
              </span>
            </h2>

            <p className="mi-modal__subtitle">
              {subtitle ? subtitle : url ? "Vista previa del comprobante" : "No hay comprobante asociado"}
            </p>
          </div>

          <button
            className="mi-modal__close"
            onClick={cerrar}
            aria-label="Cerrar"
            type="button"
          >
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

        {/* Body en formato cards como tus modales */}
        <div className="mit-modal__body">
          <div className="mi-tabpanel is-active">
            <div className="mi-grid">
              <article className="mi-card mi-card--full">
                <h3 className="mi-card__title" id="none">Vista previa</h3>

                {!url ? (
                  <div className="mvc2-empty">
                    <div className="mvc2-empty-ic">📎</div>
                    <div className="mvc2-empty-title">No hay comprobante</div>
                    <div className="mvc2-empty-sub">
                      Este egreso no tiene un archivo asociado.
                    </div>
                  </div>
                ) : pdf ? (
                  <div className="mvc2-view">
                    <iframe
                      className="mvc2-frame"
                      src={url}
                      title="Comprobante PDF"
                    />
                  </div>
                ) : (
                  <div className="mvc2-view">
                    <img className="mvc2-img" src={url} alt="Comprobante" />
                  </div>
                )}
              </article>
            </div>
          </div>

<div className="mvc2-footer">
  <div className="mit-actions mvc2-actions">
    <button
      type="button"
      className="mit-btn mit-btn--ghost"
      onClick={cerrar}
    >
      <FontAwesomeIcon icon={faTimes} /> Cerrar
    </button>

    {url ? (
      <a
        className="mit-btn mit-btn--solid mvc2-open"
        href={url}
        target="_blank"
        rel="noreferrer"
        title="Abrir en nueva pestaña"
      >
        <FontAwesomeIcon icon={faUpRightFromSquare} /> Abrir
      </a>
    ) : null}
  </div>

  <div className="mit-help mvc2-help">
    {url
      ? "Tip: si no se ve bien, probá abrirlo en una pestaña nueva."
      : "No hay archivo cargado para este registro."}
  </div>
</div>

        </div>
      </div>
    </div>
  );
}
