// src/components/Mantenimiento/Mantenimiento.jsx
import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import BASE_URL from "../../config/config";
import "./Mantenimiento.css";

// ✅ Toast
import Toast from "../Global/Toast";

// Font Awesome
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faPlus,
  faPenToSquare,
  faTrashCan,
} from "@fortawesome/free-solid-svg-icons";

// Modales
import ModalCrearPlan from "./modales/ModalCrearPlan";
import ModalEditarPlan from "./modales/ModalEditarPlan";
import ModalEliminarPlan from "./modales/ModalEliminarPlan";

// ✅ Layout de columnas (misma lógica que Trabajadores)
const COLS = {
  head: "1.2fr 2.2fr 1fr .9fr .8fr",
  row: "1.2fr 2.2fr 1fr .9fr .8fr",
};

export default function Mantenimiento() {
  const navigate = useNavigate();

  const [planes, setPlanes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const [openCrear, setOpenCrear] = useState(false);
  const [openEditar, setOpenEditar] = useState(false);
  const [openEliminar, setOpenEliminar] = useState(false);
  const [planSel, setPlanSel] = useState(null);

  const API_BASE = `${BASE_URL}/api.php`;

  /* ===========================
     ✅ TOAST SOLO PARA: crear/editar/eliminar
  =========================== */
  const [toast, setToast] = useState({
    show: false,
    tipo: "exito", // o "error"
    mensaje: "",
    duracion: 2500,
    key: 0,
  });

  const showToast = useCallback((tipo, mensaje, duracion = 2500) => {
    setToast((t) => ({
      show: true,
      tipo,
      mensaje, // ✅ solo texto (sin emojis, sin iconos)
      duracion,
      key: (t.key || 0) + 1,
    }));
  }, []);

  const closeToast = useCallback(() => {
    setToast((t) => ({ ...t, show: false }));
  }, []);

  // ✅ fetch robusto: evita crashear si el backend devuelve HTML
  const fetchJSON = useCallback(async (url, options) => {
    const res = await fetch(url, options);
    const text = await res.text();

    if (!res.ok) throw new Error(`HTTP ${res.status} :: ${text.slice(0, 300)}`);

    const trimmed = (text || "").trim();
    if (trimmed.startsWith("<")) {
      throw new Error(`Backend devolvió HTML (error PHP). ${trimmed.slice(0, 200)}`);
    }

    try {
      return JSON.parse(trimmed || "{}");
    } catch {
      throw new Error(`JSON inválido. ${trimmed.slice(0, 200)}`);
    }
  }, []);

  const cargarPlanes = useCallback(async () => {
    try {
      setLoading(true);
      setMsg("");

      const data = await fetchJSON(
        `${API_BASE}?action=mantenimiento&op=planes&ver_inactivos=0&ts=${Date.now()}`
      );

      if (data?.exito && Array.isArray(data?.planes)) {
        setPlanes(data.planes);
      } else {
        setPlanes([]);
        if (data?.mensaje) setMsg(data.mensaje);
      }
    } catch (e) {
      console.error(e);
      setPlanes([]);
      setMsg(String(e?.message || "Error cargando planes"));
    } finally {
      setLoading(false);
    }
  }, [API_BASE, fetchJSON]);

  useEffect(() => {
    cargarPlanes();
  }, [cargarPlanes]);

  const confirmarCrear = async (payload) => {
    try {
      setLoading(true);
      setMsg("");

      const data = await fetchJSON(
        `${API_BASE}?action=mantenimiento&op=crear_plan&ts=${Date.now()}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(payload),
        }
      );

      if (!data?.exito) {
        const m = data?.mensaje || "No se pudo crear el plan";
        setMsg(m);
        showToast("error", m, 3200);
        return;
      }

      setOpenCrear(false);
      showToast("exito", "Plan creado correctamente.", 2500);
      await cargarPlanes();
    } catch (e) {
      console.error(e);
      const m = String(e?.message || "Error de red creando plan");
      setMsg(m);
      showToast("error", m, 3200);
    } finally {
      setLoading(false);
    }
  };

  const abrirEditar = (p) => {
    setPlanSel(p);
    setOpenEditar(true);
  };

  const confirmarEditar = async (payload) => {
    try {
      setLoading(true);
      setMsg("");

      const data = await fetchJSON(
        `${API_BASE}?action=mantenimiento&op=editar_plan&ts=${Date.now()}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(payload),
        }
      );

      if (!data?.exito) {
        const m = data?.mensaje || "No se pudo editar el plan";
        setMsg(m);
        showToast("error", m, 3200);
        return;
      }

      setOpenEditar(false);
      setPlanSel(null);
      showToast("exito", "Plan editado correctamente.", 2500);
      await cargarPlanes();
    } catch (e) {
      console.error(e);
      const m = String(e?.message || "Error de red editando plan");
      setMsg(m);
      showToast("error", m, 3200);
    } finally {
      setLoading(false);
    }
  };

  const abrirEliminar = (p) => {
    setPlanSel(p);
    setOpenEliminar(true);
  };

  const confirmarEliminar = async (p) => {
    if (!p?.id) return;

    const prev = planes;
    setPlanes((arr) => arr.filter((x) => String(x.id) !== String(p.id)));

    try {
      setLoading(true);
      setMsg("");

      const data = await fetchJSON(
        `${API_BASE}?action=mantenimiento&op=eliminar_plan&ts=${Date.now()}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ id: p.id, hard: 1 }),
        }
      );

      if (!data?.exito) {
        setPlanes(prev);
        const m = data?.mensaje || "No se pudo eliminar el plan";
        setMsg(m);
        showToast("error", m, 3200);
        return;
      }

      setOpenEliminar(false);
      setPlanSel(null);
      showToast("exito", "Plan eliminado correctamente.", 2500);
      await cargarPlanes();
    } catch (e) {
      console.error(e);
      setPlanes(prev);
      const m = String(e?.message || "Error de red eliminando plan");
      setMsg(m);
      showToast("error", m, 3200);
    } finally {
      setLoading(false);
    }
  };

  const fmtARS = (n) =>
    Number(n || 0).toLocaleString("es-AR", {
      style: "currency",
      currency: "ARS",
      maximumFractionDigits: 0,
    });

  return (
    <div className="ini_contenedor-principal">
      {/* ✅ TOAST (solo crear/editar/eliminar) */}
      {toast.show ? (
        <Toast
          key={toast.key}
          tipo={toast.tipo}
          mensaje={toast.mensaje}
          duracion={toast.duracion}
          onClose={closeToast}
        />
      ) : null}

      <div className="Gelemts-Wrap">
        <div className="Gelemts-Card">
          <header className="Gelemts-Header">
            <h2 className="Gelemts-Title">Planes de Mantenimiento</h2>
          </header>

          {msg && <div className="Gelemts-Alert">{msg}</div>}

          {/* ✅ TABLA IDENTICA A TRABAJADORES (clases TP-*) */}
          <div className="TP-GridTableWrap">
            <div className="TP-GridTable">
              {/* HEAD */}
              <div className="TP-GridHead" style={{ gridTemplateColumns: COLS.head }}>
                <div className="TP-GridTh">Nombre</div>
                <div className="TP-GridTh">Descripción</div>
                <div className="TP-GridTh">Monto (ARS)</div>
                <div className="TP-GridTh">Activo</div>
                <div className="TP-GridTh TP-GridTh--right">Acciones</div>
              </div>

              {/* BODY */}
              <div className="TP-GridBody">
                {!loading && planes.length === 0 ? (
                  <div className="TP-GridEmpty">No hay planes cargados.</div>
                ) : (
                  planes.map((p, idx) => (
                    <div
                      key={p.id}
                      className={`TP-GridRow ${String(p.activo) !== "1" ? "TP-IsInactive" : ""}`}
                      style={{
                        gridTemplateColumns: COLS.row,
                        animationDelay: `${idx * 0.04}s`,
                      }}
                    >
                      <div className="TP-GridTd" data-label="Nombre">
                        {p.nombre}
                      </div>

                      <div className="TP-GridTd" data-label="Descripción">
                        {p.descripcion || "—"}
                      </div>

                      <div className="TP-GridTd" data-label="Monto">
                        {fmtARS(p.monto)}
                      </div>

                      <div className="TP-GridTd" data-label="Activo">
                        {String(p.activo) === "1" ? (
                          <span className="TP-Pill TP-Pill--ok">Activo</span>
                        ) : (
                          <span className="TP-Pill TP-Pill--no">Inactivo</span>
                        )}
                      </div>

                      <div className="TP-GridTd TP-GridTd--right" data-label="Acciones">
                        <div className="TP-RowActions">
                          <button
                            type="button"
                            className="TP-IconBtn TP-IconBtn--edit"
                            onClick={() => abrirEditar(p)}
                            title="Editar"
                            aria-label={`Editar ${p.nombre}`}
                            disabled={loading}
                          >
                            <FontAwesomeIcon icon={faPenToSquare} />
                          </button>

                          <button
                            type="button"
                            className="TP-IconBtn TP-IconBtn--del"
                            onClick={() => abrirEliminar(p)}
                            title="Eliminar"
                            aria-label={`Eliminar ${p.nombre}`}
                            disabled={loading}
                          >
                            <FontAwesomeIcon icon={faTrashCan} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="Gelemts-FooterActions">
            <button className="Gelemts-Btn" onClick={() => navigate("/panel")}>
              <FontAwesomeIcon icon={faArrowLeft} />
              <span>Volver</span>
            </button>

            <button
              className="Gelemts-Btn Gelemts-Btn--primary"
              onClick={() => setOpenCrear(true)}
              disabled={loading}
            >
              <FontAwesomeIcon icon={faPlus} />
              <span>Nuevo plan</span>
            </button>
          </div>
        </div>
      </div>

      {/* Modales */}
      <ModalCrearPlan
        open={openCrear}
        onClose={() => setOpenCrear(false)}
        onConfirm={confirmarCrear}
        loading={loading}
      />

      <ModalEditarPlan
        open={openEditar}
        plan={planSel}
        onClose={() => {
          setOpenEditar(false);
          setPlanSel(null);
        }}
        onConfirm={confirmarEditar}
        loading={loading}
      />

      <ModalEliminarPlan
        open={openEliminar}
        plan={planSel}
        onClose={() => {
          setOpenEliminar(false);
          setPlanSel(null);
        }}
        onConfirm={confirmarEliminar}
        loading={loading}
      />
    </div>
  );
}
