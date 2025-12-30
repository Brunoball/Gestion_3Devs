import React, { useEffect, useMemo, useState } from "react";
import BASE_URL from "../../../config/config";
import Toast from "../../Global/Toast";
import "./ModalEditarTrabajador.css";
import "./ModalBajaTrabajador.css";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUserCheck, faTrashAlt } from "@fortawesome/free-solid-svg-icons";

/* =========================
   Helpers API
========================= */
const apiGet = async (url) => {
  const res = await fetch(url);
  return await res.json();
};

const apiPost = async (url, payload) => {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload ?? {}),
  });
  return await res.json();
};

/* =========================
   Modal confirmación (verde) - Reactivar
========================= */
function ModalReactivarTrabajador({
  open,
  onClose,
  onConfirm,
  loading,
  trabajador,
}) {
  useEffect(() => {
    if (!open) return;
    const handleEsc = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [open, onClose]);

  if (!open) return null;

  const nombreCompleto = `${(trabajador?.nombre ?? "").trim()} ${(
    trabajador?.apellido ?? ""
  ).trim()}`.trim();

  const cerrar = () => {
    if (loading) return;
    onClose?.();
  };

  return (
    <div
      className="emp-baja-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-reactivar-trabajador-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) cerrar();
      }}
    >
      <div className="emp-baja-modal emp-baja-modal--success">
        <div className="emp-baja-modal__icon" aria-hidden="true">
          <FontAwesomeIcon icon={faUserCheck} />
        </div>

        <h3
          id="modal-reactivar-trabajador-title"
          className="emp-baja-modal__title emp-baja-modal__title--success"
        >
          Reactivar trabajador
        </h3>

        <p className="emp-baja-modal__body">
          ¿Reactivar a <strong>{nombreCompleto || "este trabajador"}</strong>?
          <br />
          Quedará marcado como <strong>activo</strong>.
        </p>

        <div className="emp-baja-modal__actions">
          <button
            type="button"
            className="emp-baja-btn emp-baja-btn--ghost"
            onClick={cerrar}
            disabled={loading}
          >
            Cancelar
          </button>

          <button
            type="button"
            className="emp-baja-btn emp-baja-btn--solid-success"
            onClick={() => onConfirm?.(trabajador)}
            disabled={loading}
          >
            Sí, reactivar
          </button>
        </div>
      </div>
    </div>
  );
}

/* =========================
   ✅ NUEVO: Modal confirmación (rojo) - Eliminar definitivo
========================= */
function ModalEliminarPermanente({
  open,
  onClose,
  onConfirm,
  loading,
  trabajador,
}) {
  useEffect(() => {
    if (!open) return;
    const handleEsc = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [open, onClose]);

  if (!open) return null;

  const nombreCompleto = `${(trabajador?.nombre ?? "").trim()} ${(
    trabajador?.apellido ?? ""
  ).trim()}`.trim();

  const cerrar = () => {
    if (loading) return;
    onClose?.();
  };

  return (
    <div
      className="emp-baja-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-eliminar-permanente-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) cerrar();
      }}
    >
      <div className="emp-baja-modal emp-baja-modal--danger">
        <div className="emp-baja-modal__icon emp-baja-modal__icon--danger" aria-hidden="true">
          <FontAwesomeIcon icon={faTrashAlt} />
        </div>

        <h3
          id="modal-eliminar-permanente-title"
          className="emp-baja-modal__title emp-baja-modal__title--danger"
        >
          Eliminar permanentemente
        </h3>

        <p className="emp-baja-modal__body">
          Vas a eliminar de forma <strong>definitiva</strong> a{" "}
          <strong>{nombreCompleto || "este trabajador"}</strong>.
          <br />
          <strong>Esta acción no se puede deshacer.</strong>
        </p>

        <div className="emp-baja-modal__actions">
          <button
            type="button"
            className="emp-baja-btn emp-baja-btn--ghost"
            onClick={cerrar}
            disabled={loading}
          >
            Cancelar
          </button>

          <button
            type="button"
            className="emp-baja-btn emp-baja-btn--solid-danger"
            onClick={() => onConfirm?.(trabajador)}
            disabled={loading}
          >
            Sí, eliminar
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ModalTrabajadoresBaja({ open, onClose, onChanged }) {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);

  // modal confirmación reactivar
  const [openConfirm, setOpenConfirm] = useState(false);
  const [sel, setSel] = useState(null);
  const [saving, setSaving] = useState(false);

  // ✅ NUEVO: modal confirmación eliminar definitivo
  const [openDelete, setOpenDelete] = useState(false);
  const [selDelete, setSelDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const [toast, setToast] = useState({
    open: false,
    tipo: "info",
    mensaje: "",
    duracion: 2600,
  });

  const showToast = (tipo, mensaje, duracion = 2600) => {
    setToast({ open: false, tipo: "info", mensaje: "", duracion: 0 });
    setTimeout(() => setToast({ open: true, tipo, mensaje, duracion }), 0);
  };
  const closeToast = () => setToast((t) => ({ ...t, open: false }));

  // Helper por si el backend manda el campo con otro nombre
  const getActivo = (x) =>
    x?.activo ?? x?.activos ?? x?.estado ?? x?.inactivo ?? 1;

  // Cargar (y filtrar SOLO inactivos desde React)
  useEffect(() => {
    if (!open) return;

    const cargar = async () => {
      setLoading(true);
      try {
        const data = await apiGet(
          `${BASE_URL}/api.php?action=trabajadores&op=listar&activos=0`
        );

        if (!data?.exito) {
          showToast("error", data?.mensaje || "Error al cargar");
          setRows([]);
          return;
        }

        const list = Array.isArray(data.data) ? data.data : [];
        const soloInactivos = list.filter((x) => Number(getActivo(x)) === 0);
        setRows(soloInactivos);
      } catch {
        showToast("error", "Error de red");
        setRows([]);
      } finally {
        setLoading(false);
      }
    };

    cargar();
  }, [open]);

  // ESC para cerrar modal grande
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const filtrados = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      `${r.nombre ?? ""} ${r.apellido ?? ""} ${r.email ?? ""}`
        .toLowerCase()
        .includes(s)
    );
  }, [rows, q]);

  // abrir modal confirmación reactivar
  const pedirReactivar = (r) => {
    setSel(r);
    setOpenConfirm(true);
  };

  const cerrarConfirm = () => {
    if (saving) return;
    setOpenConfirm(false);
    setSel(null);
  };

  const confirmarReactivar = async (r) => {
    if (!r?.id) return showToast("error", "Falta el ID del trabajador.");

    setSaving(true);
    try {
      const data = await apiPost(
        `${BASE_URL}/api.php?action=trabajadores&op=editar`,
        { ...r, activo: 1 }
      );

      if (!data?.exito) return showToast("error", data?.mensaje || "No se pudo reactivar");

      showToast("exito", "Trabajador reactivado", 2000);
      setRows((prev) => prev.filter((x) => x.id !== r.id));
      onChanged?.();
      cerrarConfirm();
    } catch {
      showToast("error", "Error de red");
    } finally {
      setSaving(false);
    }
  };

  // ✅ NUEVO: abrir modal confirmación eliminar definitivo
  const pedirEliminar = (r) => {
    setSelDelete(r);
    setOpenDelete(true);
  };

  const cerrarEliminar = () => {
    if (deleting) return;
    setOpenDelete(false);
    setSelDelete(null);
  };

  // ✅ NUEVO: confirmar eliminación definitiva
  const confirmarEliminar = async (r) => {
    if (!r?.id) return showToast("error", "Falta el ID del trabajador.");

    setDeleting(true);
    try {
      // ⬇️ Opción A (común): op=eliminar
      const data = await apiPost(
        `${BASE_URL}/api.php?action=trabajadores&op=eliminar`,
        { id: r.id }
      );

      // ⬇️ Si tu backend usa otro nombre, cambiá arriba por:
      // `${BASE_URL}/api.php?action=trabajadores&op=baja_definitiva`

      if (!data?.exito) return showToast("error", data?.mensaje || "No se pudo eliminar");

      showToast("exito", "Trabajador eliminado definitivamente", 2200);
      setRows((prev) => prev.filter((x) => x.id !== r.id));
      onChanged?.();
      cerrarEliminar();
    } catch {
      showToast("error", "Error de red");
    } finally {
      setDeleting(false);
    }
  };

  if (!open) return null;

  const busy = saving || deleting;

  return (
    <div
      className="mi-modal__overlay"
      onClick={(e) =>
        e.target.classList.contains("mi-modal__overlay") && onClose?.()
      }
    >
      {toast.open && <Toast {...toast} onClose={closeToast} />}

      {/* ✅ Modal confirmación verde */}
      <ModalReactivarTrabajador
        open={openConfirm}
        onClose={cerrarConfirm}
        onConfirm={confirmarReactivar}
        loading={saving}
        trabajador={sel}
      />

      {/* ✅ NUEVO: Modal confirmación rojo */}
      <ModalEliminarPermanente
        open={openDelete}
        onClose={cerrarEliminar}
        onConfirm={confirmarEliminar}
        loading={deleting}
        trabajador={selDelete}
      />

      <div
        className="mi-modal__container"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mi-modal__header">
          <div>
            <h2 className="mi-modal__title">Trabajadores dados de baja</h2>
            <p className="mi-modal__subtitle">Listado de trabajadores inactivos</p>
          </div>
          <button className="mi-modal__close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="mi-tabpanel is-active">
          <div className="mi-card mi-card--full">
            <div className="fl-field fl-col-full">
              <input
                className="fl-input"
                placeholder=" "
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <label className="fl-label">Buscar trabajador</label>
            </div>
          </div>

          <div
            className="mi-card mi-card--full"
            style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
          >
            {loading ? (
              <p>Cargando…</p>
            ) : filtrados.length === 0 ? (
              <p>No hay trabajadores dados de baja</p>
            ) : (
              filtrados.map((r) => (
                <div
                  key={r.id}
                  className="mi-row"
                  style={{ display: "flex", justifyContent: "space-between" }}
                >
                  <div>
                    <strong>
                      {r.apellido} {r.nombre}
                    </strong>
                    <div style={{ fontSize: ".85rem", opacity: 0.7 }}>
                      {r.email || "—"}
                    </div>
                  </div>

                  {/* ✅ Botones: Reactivar + Eliminar definitivo */}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      className="mit-btn mit-btn--solid"
                      onClick={() => pedirReactivar(r)}
                      title="Reactivar"
                      aria-label={`Reactivar ${r.nombre} ${r.apellido}`}
                      disabled={busy}
                    >
                      <FontAwesomeIcon icon={faUserCheck} />
                    </button>

                    <button
                      className="mit-btn mit-btn--danger"
                      onClick={() => pedirEliminar(r)}
                      title="Eliminar permanentemente"
                      aria-label={`Eliminar permanentemente a ${r.nombre} ${r.apellido}`}
                      disabled={busy}
                    >
                      <FontAwesomeIcon icon={faTrashAlt} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="mit-actions">
          <button className="mit-btn mit-btn--ghost" onClick={onClose} disabled={busy}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
