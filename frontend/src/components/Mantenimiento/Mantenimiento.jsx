// src/components/Mantenimiento/Mantenimiento.jsx
import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import BASE_URL from "../../config/config";
import "./Mantenimiento.css";

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

  const cargarPlanes = useCallback(async () => {
    try {
      setLoading(true);
      setMsg("");

      const res = await fetch(
        `${API_BASE}?action=mantenimiento&op=planes&ver_inactivos=0`
      );
      const data = await res.json().catch(() => null);

      if (data?.exito && Array.isArray(data?.planes)) {
        setPlanes(data.planes);
      } else {
        setPlanes([]);
        if (data?.mensaje) setMsg(data.mensaje);
      }
    } catch (e) {
      console.error(e);
      setPlanes([]);
      setMsg("Error cargando planes");
    } finally {
      setLoading(false);
    }
  }, [API_BASE]);

  useEffect(() => {
    cargarPlanes();
  }, [cargarPlanes]);

  const confirmarCrear = async (payload) => {
    try {
      setLoading(true);
      setMsg("");

      const res = await fetch(
        `${API_BASE}?action=mantenimiento&op=crear_plan`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      const data = await res.json().catch(() => null);
      if (!data?.exito) {
        setMsg(data?.mensaje || "No se pudo crear el plan");
        return;
      }

      setOpenCrear(false);
      await cargarPlanes();
    } catch (e) {
      console.error(e);
      setMsg("Error de red creando plan");
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

      const res = await fetch(
        `${API_BASE}?action=mantenimiento&op=editar_plan`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      const data = await res.json().catch(() => null);
      if (!data?.exito) {
        setMsg(data?.mensaje || "No se pudo editar el plan");
        return;
      }

      setOpenEditar(false);
      setPlanSel(null);
      await cargarPlanes();
    } catch (e) {
      console.error(e);
      setMsg("Error de red editando plan");
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

      const res = await fetch(
        `${API_BASE}?action=mantenimiento&op=eliminar_plan`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: p.id, hard: 1 }),
        }
      );

      const data = await res.json().catch(() => null);
      if (!data?.exito) {
        setPlanes(prev);
        setMsg(data?.mensaje || "No se pudo eliminar el plan");
        return;
      }

      setOpenEliminar(false);
      setPlanSel(null);
      await cargarPlanes();
    } catch (e) {
      console.error(e);
      setPlanes(prev);
      setMsg("Error de red eliminando plan");
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
                <div className="TP-GridTh">Monto</div>
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
                          >
                            <FontAwesomeIcon icon={faPenToSquare} />
                          </button>

                          <button
                            type="button"
                            className="TP-IconBtn TP-IconBtn--del"
                            onClick={() => abrirEliminar(p)}
                            title="Eliminar"
                            aria-label={`Eliminar ${p.nombre}`}
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
