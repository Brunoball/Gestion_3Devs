// src/components/Contable/modales/ModalEditarMovimiento.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faSave,
  faTimes,
  faMoneyBillTrendUp,
  faMoneyBillTransfer,
  faUser,
  faTrash,
  faPaperclip,
  faFilePdf,
  faImage,
} from "@fortawesome/free-solid-svg-icons";

import "../../Trabajadores/modales/ModalEditarTrabajador.css";
import Toast from "../../Global/Toast";

function isPdfPath(pathOrUrl) {
  const p = String(pathOrUrl || "").toLowerCase();
  return p.includes(".pdf") || p.startsWith("data:application/pdf");
}

const toUpperLive = (v) => String(v ?? "").toUpperCase();

function fileNameFromPath(p) {
  const s = String(p || "").trim();
  if (!s) return "";
  const clean = s.split("?")[0].split("#")[0];
  const parts = clean.split("/").filter(Boolean);
  return parts[parts.length - 1] || clean;
}

export default function ModalEditarMovimiento({
  open,
  onClose,
  onConfirm,
  loading,
  tipo = "pago",
  item = null,
  medios = [],
  trabajadores = [],
  buildFileUrl,
  onVerComprobante,
}) {
  const firstRef = useRef(null);
  const fileRef = useRef(null);

  const [toast, setToast] = useState({
    open: false,
    type: "danger",
    message: null,
  });

  const showError = useCallback((msg) => {
    const m = String(msg || "").trim();
    if (!m) return;
    setToast({ open: true, type: "danger", message: m });
  }, []);

  const closeToast = useCallback(() => {
    setToast({ open: false, type: "danger", message: null });
  }, []);

  const itemFecha = useMemo(() => String(item?.fecha || ""), [item]);
  const itemMonto = useMemo(() => {
    const v = item?.monto;
    return v === 0 || v ? String(v) : "";
  }, [item]);

  const itemConcepto = useMemo(() => String(item?.concepto || ""), [item]);
  const itemDescripcion = useMemo(() => String(item?.descripcion || ""), [item]);

  const itemMedioId = useMemo(() => {
    const v =
      item?.id_medio_pago ??
      item?.idMedio ??
      item?.id_medio ??
      item?.medio_id ??
      "";
    return v === 0 || v ? String(v) : "";
  }, [item]);

  const itemTrabajadorId = useMemo(() => {
    const v =
      item?.id_trabajador ??
      item?.idTrabajador ??
      item?.trabajador_id ??
      "";
    return v === 0 || v ? String(v) : "";
  }, [item]);

  const itemNombre = useMemo(() => String(item?.nombre || ""), [item]);
  const itemApellido = useMemo(() => String(item?.apellido || ""), [item]);
  const itemRol = useMemo(() => String(item?.rol || ""), [item]);
  const itemAlias = useMemo(() => String(item?.alias_pago || ""), [item]);
  const itemSistemas = useMemo(() => {
    const v = item?.sistemas_cobrados;
    return v === 0 || v ? String(v) : "";
  }, [item]);

  const itemComprobante = useMemo(() => String(item?.comprobante || ""), [item]);

  const [fecha, setFecha] = useState("");
  const [monto, setMonto] = useState("");
  const [concepto, setConcepto] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [idMedio, setIdMedio] = useState("");
  const [idTrabajador, setIdTrabajador] = useState("");

  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [rol, setRol] = useState("");
  const [aliasPago, setAliasPago] = useState("");
  const [sistemasCobrados, setSistemasCobrados] = useState("");

  const [deleteComp, setDeleteComp] = useState(false);
  const [newFile, setNewFile] = useState(null);

  const trabajadoresOrdenados = useMemo(() => {
    return [...(Array.isArray(trabajadores) ? trabajadores : [])].sort((a, b) => {
      const aa = `${a?.apellido || ""} ${a?.nombre || ""}`.trim().toLowerCase();
      const bb = `${b?.apellido || ""} ${b?.nombre || ""}`.trim().toLowerCase();
      return aa.localeCompare(bb, "es");
    });
  }, [trabajadores]);

  const meta = useMemo(() => {
    if (tipo === "egreso") return { icon: faMoneyBillTransfer, title: "Editar egreso" };
    if (tipo === "trabajador") return { icon: faUser, title: "Editar trabajador" };
    return { icon: faMoneyBillTrendUp, title: "Editar pago" };
  }, [tipo]);

  const subtitle = useMemo(() => {
    if (tipo === "trabajador") {
      const n = `${(apellido || "").trim()} ${(nombre || "").trim()}`.trim();
      const m = (monto || "").toString().trim();
      if (!n && !m) return "Actualizá los datos del trabajador";
      return `${n || "Trabajador"}${m ? ` • $${m}` : ""}`;
    }

    const c = (concepto || "").trim();
    const m = (monto || "").toString().trim();
    if (!c && !m) return "Actualizá los datos del registro";
    return `${c || "Registro"}${m ? ` • $${m}` : ""}`;
  }, [tipo, concepto, monto, nombre, apellido]);

  const currentCompPath = useMemo(() => String(itemComprobante || "").trim(), [itemComprobante]);
  const currentCompUrl = useMemo(() => {
    if (!currentCompPath) return "";
    if (typeof buildFileUrl === "function") return buildFileUrl(currentCompPath);
    return currentCompPath;
  }, [currentCompPath, buildFileUrl]);

  useEffect(() => {
    if (!open) return;

    closeToast();

    setFecha(itemFecha);
    setMonto(itemMonto);
    setConcepto(toUpperLive(itemConcepto));
    setDescripcion(toUpperLive(itemDescripcion));
    setIdMedio(itemMedioId);
    setIdTrabajador(itemTrabajadorId);

    setNombre(toUpperLive(itemNombre));
    setApellido(toUpperLive(itemApellido));
    setRol(toUpperLive(itemRol));
    setAliasPago(toUpperLive(itemAlias));
    setSistemasCobrados(itemSistemas);

    setDeleteComp(false);
    setNewFile(null);
    if (fileRef.current) fileRef.current.value = "";

    setTimeout(() => firstRef.current?.focus(), 0);
  }, [
    open,
    closeToast,
    itemFecha,
    itemMonto,
    itemConcepto,
    itemDescripcion,
    itemMedioId,
    itemTrabajadorId,
    itemNombre,
    itemApellido,
    itemRol,
    itemAlias,
    itemSistemas,
  ]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") cerrar();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loading]);

  const cerrar = () => {
    if (loading) return;
    onClose?.();
  };

  const validarMonto = (value) => {
    const montoNum = Number(String(value).replace(",", "."));
    if (!Number.isFinite(montoNum) || montoNum <= 0) return null;
    return montoNum;
  };

  const onPickFile = (f) => {
    if (!f) {
      setNewFile(null);
      return;
    }

    const okExt = /\.(pdf|jpg|jpeg|png|webp)$/i.test(f.name || "");
    if (!okExt) {
      showError("Comprobante: formato inválido. Solo PDF/JPG/PNG/WEBP.");
      setNewFile(null);
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

    if (f.size > 8 * 1024 * 1024) {
      showError("Comprobante: el archivo supera 8MB.");
      setNewFile(null);
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

    setNewFile(f);
    setDeleteComp(false);
  };

  const submit = (e) => {
    e?.preventDefault?.();

    if (!item?.id && item?.id !== 0) {
      return showError("No se encontró el ID del registro a editar.");
    }

    if (tipo === "trabajador") {
      if (!String(nombre || "").trim()) return showError("El nombre es obligatorio.");
      if (!String(apellido || "").trim()) return showError("El apellido es obligatorio.");

      const montoNum = validarMonto(monto);
      if (monto === "" || monto === null) return showError("El monto es obligatorio.");
      if (!montoNum) return showError("El monto debe ser un número mayor a 0.");

      const sis = Number(String(sistemasCobrados || "0").replace(",", "."));
      const sisOk = Number.isFinite(sis) && sis >= 0 ? Math.trunc(sis) : null;
      if (sisOk === null) return showError("Sistemas debe ser 0 o un número válido.");

      onConfirm?.({
        id: item.id,
        tipo,
        nombre: String(nombre).trim(),
        apellido: String(apellido).trim(),
        rol: String(rol || "").trim() || null,
        alias_pago: String(aliasPago || "").trim() || null,
        sistemas_cobrados: sisOk,
        monto: montoNum,
      });
      return;
    }

    if (!fecha) return showError("La fecha es obligatoria.");
    if (!String(concepto || "").trim()) return showError("El concepto es obligatorio.");
    if (monto === "" || monto === null) return showError("El monto es obligatorio.");

    const montoNum = validarMonto(monto);
    if (!montoNum) return showError("El monto debe ser un número mayor a 0.");

    if (tipo === "egreso") {
      const fd = new FormData();
      fd.append("id", String(item.id));
      fd.append("tipo", "egreso");
      fd.append("fecha", String(fecha));
      fd.append("concepto", String(concepto).trim());
      fd.append("descripcion", String(descripcion || "").trim());
      fd.append("monto", String(montoNum));
      fd.append("id_medio_pago", idMedio ? String(Number(idMedio)) : "");
      fd.append("id_trabajador", idTrabajador ? String(Number(idTrabajador)) : "");
      fd.append("delete_comprobante", deleteComp ? "1" : "0");
      if (newFile) fd.append("comprobante", newFile);

      onConfirm?.(fd);
      return;
    }

    onConfirm?.({
      id: item.id,
      tipo,
      fecha,
      concepto: String(concepto).trim(),
      descripcion: String(descripcion || "").trim() || null,
      monto: montoNum,
      id_medio_pago: idMedio ? Number(idMedio) : null,
    });
  };

  if (!open) return null;

  const hasCurrent = !!currentCompPath;
  const canPreviewInline = hasCurrent && !!currentCompUrl;

  const currentIsPdf = isPdfPath(currentCompPath) || isPdfPath(currentCompUrl);
  const currentName = fileNameFromPath(currentCompPath) || "Comprobante";
  const newIsPdf = newFile ? /\.(pdf)$/i.test(newFile.name || "") : false;
  const newIsImg = newFile ? /\.(jpg|jpeg|png|webp)$/i.test(newFile.name || "") : false;

  return (
    <div
      className="mi-modal__overlay"
      onClick={(e) => e.target.classList.contains("mi-modal__overlay") && cerrar()}
    >
      {toast.open && toast.message ? (
        <Toast
          open
          show
          type={toast.type}
          variant={toast.type}
          message={toast.message}
          text={toast.message}
          onClose={closeToast}
          onHide={closeToast}
        />
      ) : null}

      <div
        className="mi-modal__container"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mi-modal__header">
          <div className="mi-modal__head-left">
            <h2 className="mi-modal__title">
              <FontAwesomeIcon icon={meta.icon} /> {meta.title}
            </h2>
            <p className="mi-modal__subtitle">{subtitle}</p>
          </div>

          <button
            className="mi-modal__close"
            onClick={cerrar}
            aria-label="Cerrar"
            disabled={loading}
            type="button"
            title="Cerrar"
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

        <form className="mit-modal__body" onSubmit={submit}>
          <div className="mi-tabpanel is-active">
            <div className="mi-grid">
              {tipo === "trabajador" ? (
                <>
                  <article className="mi-card">
                    <h3 className="mi-card__title">Datos del trabajador</h3>

                    <div className="fl-grid">
                      <div className="fl-field">
                        <input
                          ref={firstRef}
                          className="fl-input"
                          type="text"
                          placeholder=" "
                          value={apellido}
                          onChange={(e) => setApellido(toUpperLive(e.target.value))}
                          disabled={loading}
                        />
                        <label className="fl-label">Apellido *</label>
                      </div>

                      <div className="fl-field">
                        <input
                          className="fl-input"
                          type="text"
                          placeholder=" "
                          value={nombre}
                          onChange={(e) => setNombre(toUpperLive(e.target.value))}
                          disabled={loading}
                        />
                        <label className="fl-label">Nombre *</label>
                      </div>

                      <div className="fl-field fl-col-full">
                        <input
                          className="fl-input"
                          type="text"
                          placeholder=" "
                          value={rol}
                          onChange={(e) => setRol(toUpperLive(e.target.value))}
                          disabled={loading}
                        />
                        <label className="fl-label">Rol (opcional)</label>
                      </div>
                    </div>
                  </article>

                  <article className="mi-card">
                    <h3 className="mi-card__title">Pago</h3>

                    <div className="fl-grid">
                      <div className="fl-field">
                        <input
                          className="fl-input"
                          type="number"
                          placeholder=" "
                          value={sistemasCobrados}
                          onChange={(e) => setSistemasCobrados(e.target.value)}
                          disabled={loading}
                        />
                        <label className="fl-label">Sistemas</label>
                      </div>

                      <div className="fl-field">
                        <input
                          className="fl-input"
                          type="number"
                          inputMode="decimal"
                          placeholder=" "
                          value={monto}
                          onChange={(e) => setMonto(e.target.value)}
                          disabled={loading}
                        />
                        <label className="fl-label">A pagar *</label>
                      </div>

                      <div className="fl-field fl-col-full">
                        <input
                          className="fl-input"
                          type="text"
                          placeholder=" "
                          value={aliasPago}
                          onChange={(e) => setAliasPago(toUpperLive(e.target.value))}
                          disabled={loading}
                        />
                        <label className="fl-label">Alias (opcional)</label>
                      </div>
                    </div>
                  </article>
                </>
              ) : (
                <>
                  <article className="mi-card">
                    <h3 className="mi-card__title">Datos del registro</h3>

                    <div className="fl-grid">
                      <div className="fl-field">
                        <input
                          ref={firstRef}
                          className="fl-input"
                          type="date"
                          placeholder=" "
                          value={fecha}
                          onChange={(e) => setFecha(e.target.value)}
                          disabled={loading}
                        />
                        <label className="fl-label">Fecha *</label>
                      </div>

                      <div className="fl-field">
                        <input
                          className="fl-input"
                          type="number"
                          inputMode="decimal"
                          placeholder=" "
                          value={monto}
                          onChange={(e) => setMonto(e.target.value)}
                          disabled={loading}
                        />
                        <label className="fl-label">Monto *</label>
                      </div>

                      <div className="fl-field fl-col-full">
                        <input
                          className="fl-input"
                          type="text"
                          placeholder=" "
                          value={concepto}
                          onChange={(e) => setConcepto(toUpperLive(e.target.value))}
                          disabled={loading}
                        />
                        <label className="fl-label">Concepto *</label>
                      </div>
                    </div>
                  </article>

                  <article className="mi-card">
                    <h3 className="mi-card__title">Detalles</h3>

                    <div className="fl-grid">
                      <div className="fl-field fl-col-full">
                        <textarea
                          className="fl-input"
                          style={{ resize: "vertical" }}
                          placeholder=" "
                          value={descripcion}
                          onChange={(e) => setDescripcion(toUpperLive(e.target.value))}
                          disabled={loading}
                        />
                        <label className="fl-label">Descripción (opcional)</label>
                      </div>

                      <div className="fl-field fl-col-full">
                        <select
                          className="fl-input fl-select"
                          value={idMedio}
                          onChange={(e) => setIdMedio(e.target.value)}
                          disabled={loading || !medios?.length}
                        >
                          <option value="">(Sin medio)</option>
                          {medios.map((m) => (
                            <option key={m.id ?? m.id_medio_pago} value={m.id ?? m.id_medio_pago}>
                              {m.nombre ?? m.medio ?? ""}
                            </option>
                          ))}
                        </select>
                        <label className="fl-label">Medio de pago (opcional)</label>
                      </div>

                      {tipo === "egreso" && (
                        <div className="fl-field fl-col-full">
                          <select
                            className="fl-input fl-select"
                            value={idTrabajador}
                            onChange={(e) => setIdTrabajador(e.target.value)}
                            disabled={loading || !trabajadoresOrdenados.length}
                          >
                            <option value="">(Sin trabajador asignado)</option>
                            {trabajadoresOrdenados.map((t) => (
                              <option key={t.id} value={t.id}>
                                {`${t.apellido || ""} ${t.nombre || ""}`.trim()}
                              </option>
                            ))}
                          </select>
                          <label className="fl-label">
                            <FontAwesomeIcon icon={faUser} /> Trabajador que pagó el gasto
                          </label>
                        </div>
                      )}
                    </div>
                  </article>

                  {tipo === "egreso" && (
                    <article className="mi-card mi-card--fullsd">
                      <h3 className="mi-card__title">Comprobante</h3>

                      <div className="fl-grid">
                        <div className="fl-field fl-col-full">
                          <div className="cmp-box">
                            <div className="cmp-actions"></div>

                            <label className="cmp-drop">
                              <input
                                ref={fileRef}
                                className="cmp-inputfile"
                                type="file"
                                accept="application/pdf,image/*"
                                disabled={loading}
                                onChange={(e) => onPickFile(e.target.files?.[0] || null)}
                              />

                              <div className="cmp-drop__icon">
                                <FontAwesomeIcon icon={faPaperclip} />
                              </div>

                              <div className="cmp-drop__text">
                                <b>{hasCurrent ? "Reemplazar archivo" : "Seleccioná un archivo"}</b>
                                <span>o arrastralo acá</span>
                              </div>

                              <div className="cmp-drop__btn">Elegir archivo</div>
                            </label>

                            {newFile ? (
                              <div className="cmp-file">
                                <div className="cmp-file__left">
                                  <div
                                    className={`cmp-badge ${
                                      newIsPdf ? "is-pdf" : newIsImg ? "is-img" : ""
                                    }`}
                                  >
                                    <FontAwesomeIcon
                                      icon={newIsPdf ? faFilePdf : newIsImg ? faImage : faPaperclip}
                                    />
                                  </div>

                                  <div className="cmp-file__meta">
                                    <div className="cmp-file__name" title={newFile.name}>
                                      {newFile.name}
                                    </div>
                                    <div className="cmp-file__size">
                                      {Math.round(newFile.size / 1024)} KB
                                    </div>
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  className="cmp-remove"
                                  onClick={() => {
                                    setNewFile(null);
                                    if (fileRef.current) fileRef.current.value = "";
                                  }}
                                  disabled={loading}
                                  title="Quitar archivo"
                                >
                                  <FontAwesomeIcon icon={faTimes} />
                                </button>
                              </div>
                            ) : hasCurrent ? (
                              deleteComp ? (
                                <div className="cmp-empty">Marcado para eliminar</div>
                              ) : (
                                <div className="cmp-file">
                                  <div className="cmp-file__left">
                                    <div className={`cmp-badge ${currentIsPdf ? "is-pdf" : "is-img"}`}>
                                      <FontAwesomeIcon icon={currentIsPdf ? faFilePdf : faImage} />
                                    </div>

                                    <div className="cmp-file__meta">
                                      <div className="cmp-file__name" title={currentName}>
                                        {currentName}
                                      </div>
                                      <div className="cmp-file__size">Actual</div>
                                    </div>
                                  </div>

                                  <div style={{ display: "flex", gap: 8 }}>
                                    {typeof onVerComprobante === "function" ? (
                                      <button
                                        type="button"
                                        className="cmp-remove"
                                        onClick={() => onVerComprobante(currentCompPath)}
                                        disabled={loading}
                                        title="Ver comprobante"
                                      >
                                        <FontAwesomeIcon icon={faPaperclip} />
                                      </button>
                                    ) : null}

                                    <button
                                      type="button"
                                      className="cmp-remove"
                                      onClick={() => setDeleteComp(true)}
                                      disabled={loading}
                                      title="Marcar para eliminar"
                                    >
                                      <FontAwesomeIcon icon={faTrash} />
                                    </button>
                                  </div>
                                </div>
                              )
                            ) : (
                              <div className="cmp-empty">Sin archivo adjunto</div>
                            )}

                            {canPreviewInline && !deleteComp && !newFile ? (
                              <div
                                style={{
                                  marginTop: 10,
                                  border: "1px solid rgba(0,0,0,.10)",
                                  borderRadius: 12,
                                  overflow: "hidden",
                                  background: "#fff",
                                }}
                              >
                                {isPdfPath(currentCompUrl) ? (
                                  <iframe
                                    title="Comprobante PDF"
                                    src={currentCompUrl}
                                    style={{ width: "100%", height: 340, border: 0 }}
                                  />
                                ) : (
                                  <img
                                    src={currentCompUrl}
                                    alt="Comprobante"
                                    style={{
                                      width: "100%",
                                      maxHeight: 340,
                                      objectFit: "contain",
                                      display: "block",
                                    }}
                                  />
                                )}
                              </div>
                            ) : null}

                            <div style={{ marginTop: 8, fontSize: 11, color: "#64748b" }}>
                              * Si subís un archivo nuevo, reemplaza al anterior automáticamente. (Máx 8MB)
                            </div>
                          </div>
                        </div>
                      </div>
                    </article>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="mit-actions">
            <button
              type="button"
              className="mit-btn mit-btn--ghost"
              onClick={cerrar}
              disabled={loading}
            >
              <FontAwesomeIcon icon={faTimes} /> Cancelar
            </button>

            <button type="submit" className="mit-btn mit-btn--solid" disabled={loading}>
              <FontAwesomeIcon icon={faSave} /> {loading ? "Guardando…" : "Guardar"}
            </button>
          </div>

          <div className="mit-help"></div>
        </form>
      </div>
    </div>
  );
}