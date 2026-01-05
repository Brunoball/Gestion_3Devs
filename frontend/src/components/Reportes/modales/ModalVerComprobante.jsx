// src/components/Contable/modales/ModalVerComprobante.jsx
import React, { useEffect, useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEye, faTimes, faUpRightFromSquare } from "@fortawesome/free-solid-svg-icons";
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
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const pdf = useMemo(() => isPdf(url), [url]);

  if (!open) return null;

  return (
    <div className="mvc-overlay" onClick={(e) => e.target.classList.contains("mvc-overlay") && onClose?.()}>
      <div className="mvc-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="mvc-head">
          <div className="mvc-head-left">
            <div className="mvc-title">
              <FontAwesomeIcon icon={faEye} /> {title}
            </div>
            {subtitle ? <div className="mvc-subtitle">{subtitle}</div> : null}
          </div>

          <div className="mvc-head-actions">
            {url ? (
              <a className="mvc-open" href={url} target="_blank" rel="noreferrer" title="Abrir en nueva pestaña">
                <FontAwesomeIcon icon={faUpRightFromSquare} /> Abrir
              </a>
            ) : null}

            <button className="mvc-close" onClick={onClose} type="button" aria-label="Cerrar">
              <FontAwesomeIcon icon={faTimes} />
            </button>
          </div>
        </div>

        <div className="mvc-body">
          {!url ? (
            <div className="mvc-empty">
              <div className="mvc-empty-ic">📎</div>
              <div>No hay comprobante asociado a este egreso.</div>
            </div>
          ) : pdf ? (
            <iframe className="mvc-frame" src={url} title="Comprobante PDF" />
          ) : (
            <img className="mvc-img" src={url} alt="Comprobante" />
          )}
        </div>
      </div>
    </div>
  );
}
