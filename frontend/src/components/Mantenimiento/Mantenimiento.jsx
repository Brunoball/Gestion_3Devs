import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import BASE_URL from "../../config/config";
import Toast from "../Global/Toast";
import { uppercaseTextFieldOnChange } from "../Global/uppercaseFields";
import { fetchJSONAuth } from "../Global/api";
import {
  clearStoredSession,
  getOrganizations,
  getStoredActiveOrganization,
  getStoredToken,
  getStoredUser,
  setStoredActiveOrganization,
} from "../Global/session";
import "./Mantenimiento.css";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faPlus, faPenToSquare, faTrashCan, faLayerGroup } from "@fortawesome/free-solid-svg-icons";

import ModalCrearPlan from "./modales/ModalCrearPlan";
import ModalEditarPlan from "./modales/ModalEditarPlan";
import ModalEliminarPlan from "./modales/ModalEliminarPlan";

const API = `${BASE_URL}/api.php?action=mantenimiento`;

function fmtARS(value) {
  return Number(value || 0).toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  });
}

export default function Mantenimiento() {
  const navigate = useNavigate();
  const [usuario] = useState(() => getStoredUser());
  const organizaciones = useMemo(() => getOrganizations(usuario), [usuario]);
  const [idOrganizacion, setIdOrganizacion] = useState(() =>
    Number(getStoredActiveOrganization(usuario)?.id_organizacion || 0)
  );
  const organizacionActiva = useMemo(
    () => organizaciones.find((org) => Number(org.id_organizacion) === idOrganizacion) || organizaciones[0] || null,
    [organizaciones, idOrganizacion]
  );
  const puedeEditar = ["admin", "contador"].includes(String(organizacionActiva?.rol || "vista").toLowerCase());

  const [planes, setPlanes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [openCrear, setOpenCrear] = useState(false);
  const [openEditar, setOpenEditar] = useState(false);
  const [openEliminar, setOpenEliminar] = useState(false);
  const [planSel, setPlanSel] = useState(null);
  const [toast, setToast] = useState({ show: false, tipo: "exito", mensaje: "", key: 0 });

  const showToast = useCallback((tipo, mensaje) => {
    setToast((current) => ({ show: true, tipo, mensaje, key: current.key + 1 }));
  }, []);

  const request = useCallback(
    (url, options = {}) => fetchJSONAuth(url, options, idOrganizacion),
    [idOrganizacion]
  );

  const cargar = useCallback(async () => {
    if (!idOrganizacion) return;
    setLoading(true);
    try {
      const data = await request(`${API}&op=planes&ver_inactivos=0&ts=${Date.now()}`, { method: "GET" });
      setPlanes(Array.isArray(data?.planes) ? data.planes : []);
    } catch (error) {
      if (error?.code === "SESSION_EXPIRED") {
        clearStoredSession();
        navigate("/", { replace: true });
        return;
      }
      showToast("error", error?.message || "No se pudieron cargar los planes.");
      setPlanes([]);
    } finally {
      setLoading(false);
    }
  }, [idOrganizacion, request, navigate, showToast]);

  useEffect(() => {
    if (!getStoredToken() || !usuario || !organizaciones.length) {
      clearStoredSession();
      navigate("/", { replace: true });
      return;
    }
    if (!idOrganizacion) {
      setIdOrganizacion(Number(organizaciones[0]?.id_organizacion || 0));
      return;
    }
    cargar();
  }, [usuario, organizaciones, idOrganizacion, navigate, cargar]);

  const cambiarOrganizacion = (id) => {
    const selected = setStoredActiveOrganization(id);
    if (!selected) return showToast("error", "No tenés acceso a esa entidad.");
    setIdOrganizacion(Number(selected.id_organizacion));
  };

  const confirmarCrear = async (payload) => {
    setLoading(true);
    try {
      const data = await request(`${API}&op=crear_plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setOpenCrear(false);
      showToast("exito", data?.mensaje || "Plan creado.");
      await cargar();
    } catch (error) {
      showToast("error", error?.message || "No se pudo crear el plan.");
    } finally {
      setLoading(false);
    }
  };

  const confirmarEditar = async (payload) => {
    setLoading(true);
    try {
      const data = await request(`${API}&op=editar_plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setOpenEditar(false);
      setPlanSel(null);
      showToast("exito", data?.mensaje || "Plan actualizado.");
      await cargar();
    } catch (error) {
      showToast("error", error?.message || "No se pudo editar el plan.");
    } finally {
      setLoading(false);
    }
  };

  const confirmarEliminar = async (plan) => {
    setLoading(true);
    try {
      const data = await request(`${API}&op=eliminar_plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: plan?.id }),
      });
      setOpenEliminar(false);
      setPlanSel(null);
      showToast("exito", data?.mensaje || "Plan dado de baja.");
      await cargar();
    } catch (error) {
      showToast("error", error?.message || "No se pudo dar de baja el plan.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ini_contenedor-principal" onChangeCapture={uppercaseTextFieldOnChange}>
      {toast.show && <Toast key={toast.key} tipo={toast.tipo} mensaje={toast.mensaje} onClose={() => setToast((t) => ({ ...t, show: false }))} />}
      <main className="MP-Wrap">
        <section className="MP-Card">
          <header className="MP-Header">
            <div>
              <h2>Planes y servicios</h2>
              <p>Los planes son plantillas por entidad. El monto acordado definitivo se guarda en cada sistema del cliente.</p>
            </div>
            <FontAwesomeIcon icon={faLayerGroup} />
          </header>

          <div className="MP-OrgTabs">
            {organizaciones.map((org) => (
              <button
                key={org.id_organizacion}
                type="button"
                className={Number(org.id_organizacion) === idOrganizacion ? "is-active" : ""}
                onClick={() => cambiarOrganizacion(org.id_organizacion)}
              >
                {org.codigo || org.nombre}<small>{org.rol}</small>
              </button>
            ))}
          </div>

          <div className="MP-Info">
            Estás administrando el catálogo de <strong>{organizacionActiva?.nombre}</strong>. Un plan de 3DEVS nunca aparece en BALTO y viceversa.
          </div>

          <div className="MP-Table">
            <div className="MP-Head"><span>Plan</span><span>Descripción</span><span>Monto de referencia</span><span /></div>
            <div className="MP-Body">
              {loading ? (
                <div className="MP-Empty">Cargando planes…</div>
              ) : !planes.length ? (
                <div className="MP-Empty">No hay planes activos para esta entidad.</div>
              ) : (
                planes.map((plan) => (
                  <div className="MP-Row" key={plan.id}>
                    <strong>{plan.nombre}</strong>
                    <span className="MP-Description">{plan.descripcion || "Sin descripción"}</span>
                    <span className="MP-Amount">{fmtARS(plan.monto)}</span>
                    <div className="MP-Actions">
                      {puedeEditar && (
                        <>
                          <button type="button" onClick={() => { setPlanSel(plan); setOpenEditar(true); }} title="Editar"><FontAwesomeIcon icon={faPenToSquare} /></button>
                          <button type="button" className="is-danger" onClick={() => { setPlanSel(plan); setOpenEliminar(true); }} title="Dar de baja"><FontAwesomeIcon icon={faTrashCan} /></button>
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <footer className="MP-Footer">
            <button type="button" onClick={() => navigate("/panel")}><FontAwesomeIcon icon={faArrowLeft} /> Volver</button>
            {puedeEditar && <button type="button" className="is-primary" onClick={() => setOpenCrear(true)}><FontAwesomeIcon icon={faPlus} /> Nuevo plan</button>}
          </footer>
        </section>
      </main>

      <ModalCrearPlan open={openCrear} onClose={() => setOpenCrear(false)} onConfirm={confirmarCrear} loading={loading} />
      <ModalEditarPlan open={openEditar} plan={planSel} onClose={() => setOpenEditar(false)} onConfirm={confirmarEditar} loading={loading} />
      <ModalEliminarPlan open={openEliminar} plan={planSel} onClose={() => setOpenEliminar(false)} onConfirm={confirmarEliminar} loading={loading} />
    </div>
  );
}
