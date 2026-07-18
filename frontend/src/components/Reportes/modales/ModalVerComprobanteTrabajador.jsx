// src/components/Reportes/modales/ModalVerComprobanteTrabajador.jsx
import React, { useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEye, faXmark, faPaperclip } from "@fortawesome/free-solid-svg-icons";

import "../../Trabajadores/modales/ModalEditarTrabajador.css";
import "./ModalComprobantePago.css";
import "./ModalVerComprobanteTrabajador.css";

function isPdfUrl(url = "", mime = "") {
  const s = `${url} ${mime}`.toLowerCase();
  return s.includes("application/pdf") || s.endsWith(".pdf") || s.includes(".pdf?");
}

export default function ModalVerComprobanteTrabajador({ open, trabajador, comprobante, periodo, onClose }) {
  const nombre = useMemo(() => {
    const full = `${trabajador?.nombre ?? ""} ${trabajador?.apellido ?? ""}`.trim();
    return full || "Trabajador";
  }, [trabajador]);

  const url = useMemo(() => {
    return String(comprobante?.archivo_url || comprobante?.url || trabajador?.comprobante_pago || "").trim();
  }, [comprobante, trabajador]);

  const periodoTxt = useMemo(() => {
    const p = periodo || trabajador?.periodo_comprobante || comprobante || null;
    if (!p) return "";
    if (p.label) return p.label;
    if (p.id_mes && p.anio) return `Mes ${p.id_mes} / ${p.anio}`;
    if (p.mes && p.anio) return `Mes ${p.mes} / ${p.anio}`;
    return "";
  }, [periodo, trabajador, comprobante]);

  if (!open) return null;

  const pdf = isPdfUrl(url, comprobante?.archivo_tipo || "");

  return (
    <div
      className="mi-modal__overlay reportes-modal-theme"
      onClick={(e) => e.target.classList.contains("mi-modal__overlay") && onClose?.()}
    >
      <div
        className="mi-modal__container mtv-modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mi-modal__header">
          <div className="mi-modal__head-left">
            <h2 className="mi-modal__title">Ver comprobante</h2>
            <p className="mi-modal__subtitle">
              {nombre}
              {periodoTxt ? <> &nbsp;|&nbsp; Pago de {periodoTxt}</> : null}
            </p>
          </div>

          <button className="mi-modal__close" onClick={onClose} aria-label="Cerrar">
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        <div className="mit-modal__body">
          <div className="mi-tabpanel is-active">
            <article className="mi-card mi-card--full">
              <h3 className="mi-card__title">
                <FontAwesomeIcon icon={url ? faEye : faPaperclip} /> &nbsp;Comprobante cargado
              </h3>

              {!url ? (
                <div className="mcp-muted">Este trabajador todavía no tiene comprobante registrado.</div>
              ) : (
                <>
                  <div className="mtv-toolbar">
                    <a className="mcp-linklike" href={url} target="_blank" rel="noreferrer">
                      <FontAwesomeIcon icon={faEye} /> Abrir en otra pestaña
                    </a>
                    <span className="mtv-date">
                      {periodoTxt ? `Periodo: ${periodoTxt}` : ""}
                      {periodoTxt && comprobante?.created_at ? " · " : ""}
                      {comprobante?.created_at ? `Cargado: ${comprobante.created_at}` : ""}
                    </span>
                  </div>

                  <div className="mtv-preview">
                    {pdf ? (
                      <iframe src={url} title="Comprobante del trabajador" />
                    ) : (
                      <img src={url} alt="Comprobante del trabajador" />
                    )}
                  </div>
                </>
              )}
            </article>
          </div>
        </div>

        <div className="mit-actions">
          <button type="button" className="mit-btn mit-btn--solid" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
