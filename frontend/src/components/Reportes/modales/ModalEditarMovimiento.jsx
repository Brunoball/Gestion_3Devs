// src/components/Contable/modales/ModalEditarMovimiento.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPenToSquare,
  faSave,
  faTimes,
  faMoneyBillTrendUp,
  faMoneyBillTransfer,
  faUser,
} from "@fortawesome/free-solid-svg-icons";

// ✅ Reutiliza EXACTAMENTE la estética del modal que ya usás
// Ajustá la ruta si tu estructura es distinta:
import "../../Trabajadores/modales/ModalEditarTrabajador.css";

/**
 * ModalEditarMovimiento
 * - Sirve para editar filas de Pagos / Egresos / Trabajadores (según "tipo")
 * - Por ahora SOLO UI + validaciones básicas
 * - onConfirm(payload) devuelve el objeto editado (después conectamos backend)
 *
 * Props:
 *  open: boolean
 *  onClose: fn
 *  onConfirm: fn(payload)
 *  loading: boolean
 *  tipo: "pago" | "egreso" | "trabajador"
 *  item: objeto (la fila a editar)
 *  medios: array de medios (opcional)
 */
export default function ModalEditarMovimiento({
  open,
  onClose,
  onConfirm,
  loading,
  tipo = "pago",
  item = null,
  medios = [],
}) {
  const firstRef = useRef(null);

  // ✅ Iniciales (evita undefined)
  const itemFecha = useMemo(() => String(item?.fecha || ""), [item]);
  const itemMonto = useMemo(() => {
    const v = item?.monto;
    return v === 0 || v ? String(v) : "";
  }, [item]);

  const itemConcepto = useMemo(() => String(item?.concepto || ""), [item]);
  const itemDescripcion = useMemo(() => String(item?.descripcion || ""), [item]);

  // medios: puede venir como texto "medio" o id_medio_pago
  const itemMedioId = useMemo(() => {
    const v =
      item?.id_medio_pago ??
      item?.idMedio ??
      item?.id_medio ??
      item?.medio_id ??
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

  // ✅ States
  const [fecha, setFecha] = useState("");
  const [monto, setMonto] = useState("");
  const [concepto, setConcepto] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [idMedio, setIdMedio] = useState("");

  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [rol, setRol] = useState("");
  const [aliasPago, setAliasPago] = useState("");
  const [sistemasCobrados, setSistemasCobrados] = useState("");

  const [error, setError] = useState("");

  // ✅ icono y titulo según tipo
  const meta = useMemo(() => {
    if (tipo === "egreso") {
      return {
        icon: faMoneyBillTransfer,
        title: "Editar egreso",
      };
    }
    if (tipo === "trabajador") {
      return {
        icon: faUser,
        title: "Editar trabajador",
      };
    }
    return {
      icon: faMoneyBillTrendUp,
      title: "Editar pago",
    };
  }, [tipo]);

  // ✅ subtitle ANTES del return temprano (hooks first)
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

  // Reset al abrir: carga valores del item
  useEffect(() => {
    if (!open) return;

    setError("");

    // pagos / egresos
    setFecha(itemFecha);
    setMonto(itemMonto);
    setConcepto(itemConcepto);
    setDescripcion(itemDescripcion);
    setIdMedio(itemMedioId);

    // trabajador
    setNombre(itemNombre);
    setApellido(itemApellido);
    setRol(itemRol);
    setAliasPago(itemAlias);
    setSistemasCobrados(itemSistemas);

    setTimeout(() => firstRef.current?.focus(), 0);
  }, [
    open,
    itemFecha,
    itemMonto,
    itemConcepto,
    itemDescripcion,
    itemMedioId,
    itemNombre,
    itemApellido,
    itemRol,
    itemAlias,
    itemSistemas,
  ]);

  // ESC cierra
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

  const submit = (e) => {
    e?.preventDefault?.();
    setError("");

    if (!item?.id && item?.id !== 0) {
      return setError("No se encontró el ID del registro a editar.");
    }

    if (tipo === "trabajador") {
      if (!String(nombre || "").trim()) return setError("El nombre es obligatorio.");
      if (!String(apellido || "").trim()) return setError("El apellido es obligatorio.");

      const montoNum = validarMonto(monto);
      if (monto === "" || monto === null) return setError("El monto es obligatorio.");
      if (!montoNum) return setError("El monto debe ser un número mayor a 0.");

      const sis = Number(String(sistemasCobrados || "0").replace(",", "."));
      const sisOk = Number.isFinite(sis) && sis >= 0 ? Math.trunc(sis) : null;
      if (sisOk === null) return setError("Sistemas debe ser 0 o un número válido.");

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

    // pagos / egresos
    if (!fecha) return setError("La fecha es obligatoria.");
    if (!String(concepto || "").trim()) return setError("El concepto es obligatorio.");
    if (monto === "" || monto === null) return setError("El monto es obligatorio.");

    const montoNum = validarMonto(monto);
    if (!montoNum) return setError("El monto debe ser un número mayor a 0.");

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

  // ✅ return temprano DESPUÉS de hooks
  if (!open) return null;

  return (
    <div
      className="mi-modal__overlay"
      onClick={(e) => e.target.classList.contains("mi-modal__overlay") && cerrar()}
    >
      <div
        className="mi-modal__container"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header azul */}
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

        {/* Body */}
        <form className="mit-modal__body" onSubmit={submit}>
          <div className="mi-tabpanel is-active">
            <div className="mi-grid">
              {/* ======= TRABAJADOR ======= */}
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
                          onChange={(e) => setApellido(e.target.value)}
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
                          onChange={(e) => setNombre(e.target.value)}
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
                          onChange={(e) => setRol(e.target.value)}
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
                          onChange={(e) => setAliasPago(e.target.value)}
                          disabled={loading}
                        />
                        <label className="fl-label">Alias (opcional)</label>
                      </div>
                    </div>
                  </article>
                </>
              ) : (
                <>
                  {/* ======= PAGO / EGRESO ======= */}
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
                          onChange={(e) => setConcepto(e.target.value)}
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
                          style={{ minHeight: 110, resize: "vertical" }}
                          placeholder=" "
                          value={descripcion}
                          onChange={(e) => setDescripcion(e.target.value)}
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
                            <option
                              key={m.id ?? m.id_medio_pago}
                              value={m.id ?? m.id_medio_pago}
                            >
                              {m.nombre ?? m.medio ?? ""}
                            </option>
                          ))}
                        </select>
                        <label className="fl-label">Medio de pago (opcional)</label>
                      </div>
                    </div>
                  </article>
                </>
              )}

              {error ? (
                <article className="mi-card mi-card--full">
                  <div className="mit-alert mit-alert--danger">
                    <b>Error:</b> {error}
                  </div>
                </article>
              ) : null}
            </div>
          </div>

          {/* Footer */}
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

          <div className="mit-help">* Campos obligatorios</div>
        </form>
      </div>
    </div>
  );
}
