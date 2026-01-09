// src/components/Reportes/modales/ModalComprobantePago.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPaperclip, faTrash, faXmark, faFloppyDisk, faEye } from "@fortawesome/free-solid-svg-icons";
import "./ModalComprobantePago.css";

export default function ModalComprobantePago({
  open,
  onClose,
  onConfirm, // (FormData) => Promise
  loading = false,
  item = null, // pago seleccionado
  buildFileUrl, // helper
}) {
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [deleteCurrent, setDeleteCurrent] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setDeleteCurrent(false);
    if (fileRef.current) fileRef.current.value = "";
  }, [open, item?.id]);

  const currentUrl = useMemo(() => {
    const p = String(item?.comprobante || "").trim();
    if (!p) return "";
    return buildFileUrl ? buildFileUrl(p) : p;
  }, [item?.comprobante, buildFileUrl]);

  if (!open) return null;

  const closeSafe = () => {
    if (loading) return;
    onClose?.();
  };

  const submit = async () => {
    if (loading) return;

    const id = item?.id ?? item?.id_pago ?? null;
    if (!id) return;

    if (!file && !deleteCurrent) {
      // nada que hacer
      return;
    }

    const fd = new FormData();
    fd.append("id", String(id));
    if (deleteCurrent) fd.append("delete_comprobante", "1");
    if (file) fd.append("comprobante", file);

    await onConfirm?.(fd);
  };

  return (
    <div className="mcp-backdrop" role="dialog" aria-modal="true">
      <div className="mcp-modal">
        <div className="mcp-head">
          <div className="mcp-title">
            <FontAwesomeIcon icon={faPaperclip} /> Comprobante de pago
          </div>
          <button className="mcp-close" onClick={closeSafe} aria-label="Cerrar">
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        <div className="mcp-body">
          <div className="mcp-row">
            <div className="mcp-label">Pago</div>
            <div className="mcp-value">
              <b>{item?.concepto || "—"}</b>
              {item?.fecha ? <div className="mcp-sub">Fecha: {item.fecha}</div> : null}
            </div>
          </div>

          <div className="mcp-row">
            <div className="mcp-label">Comprobante actual</div>
            <div className="mcp-value">
              {currentUrl ? (
                <a className="mcp-link" href={currentUrl} target="_blank" rel="noreferrer">
                  <FontAwesomeIcon icon={faEye} /> Ver comprobante
                </a>
              ) : (
                <span style={{ opacity: 0.7 }}>No hay comprobante cargado.</span>
              )}
            </div>
          </div>

          <div className="mcp-row">
            <div className="mcp-label">Subir archivo</div>
            <div className="mcp-value">
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf,image/*"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                disabled={loading}
              />
              <div className="mcp-hint">PDF / JPG / PNG / WEBP (hasta 8MB)</div>
            </div>
          </div>

          {currentUrl ? (
            <label className="mcp-check">
              <input
                type="checkbox"
                checked={deleteCurrent}
                onChange={(e) => setDeleteCurrent(e.target.checked)}
                disabled={loading}
              />
              <span>
                <FontAwesomeIcon icon={faTrash} /> Eliminar comprobante actual
              </span>
            </label>
          ) : null}
        </div>

        <div className="mcp-actions">
          <button className="mcp-btn ghost" onClick={closeSafe} disabled={loading}>
            Cancelar
          </button>

          <button
            className="mcp-btn primary"
            onClick={submit}
            disabled={loading || (!file && !deleteCurrent)}
            title={!file && !deleteCurrent ? "Seleccioná un archivo o marcá eliminar" : "Guardar"}
          >
            <FontAwesomeIcon icon={faFloppyDisk} /> {loading ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
