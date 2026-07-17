import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FaArrowLeft,
  FaBuilding,
  FaCubes,
  FaFileInvoice,
  FaInfoCircle,
  FaPen,
  FaPlus,
  FaSave,
  FaBalanceScale,
  FaTimes,
  FaTrashAlt,
  FaUsers,
} from "react-icons/fa";
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
import "./clientes.css";
import "./clientesMejoras.css";
import "../Global/roots.css";

import SistemasModal from "./modales/SistemasModal";
import AgregarSistemaModal from "./modales/AgregarSistemaModal";
import EliminarClienteModal from "./modales/EliminarClienteModal";
import EliminarSistemaModal from "./modales/EliminarSistemaModal";
import GenerarPresupuestoModal from "./modales/GenerarPresupuestoModal";
import DatosFacturacionModal from "./modales/DatosFacturacionModal";
import AgregarClienteModal from "./modales/AgregarClienteModal";

const API = `${BASE_URL}/api.php?action=clientes`;

const emptySystem = () => ({
  nombre: "",
  descripcion: "",
  id_plan: "",
  monto_mensual: "",
  estado: "activo",
  fecha_inicio: "",
});

function formatARS(value) {
  return Number(value || 0).toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  });
}

function splitExact(count) {
  if (!count) return [];
  const totalUnits = 1000000;
  const base = Math.floor(totalUnits / count);
  let rest = totalUnits - base * count;
  return Array.from({ length: count }, () => ((base + (rest-- > 0 ? 1 : 0)) / 10000).toFixed(4));
}

function TeamEditor({
  system,
  workers,
  items,
  canWrite,
  onChange,
  onSave,
  saving,
}) {
  const total = items.reduce((sum, item) => sum + Number(item.porcentaje || 0), 0);
  const totalOk = Math.abs(total - 100) <= 0.0001;
  const assignedIds = new Set(items.map((item) => Number(item.id_trabajador)));
  const available = workers.filter((worker) => !assignedIds.has(Number(worker.id)));
  const [selected, setSelected] = useState("");

  const add = () => {
    const worker = workers.find((item) => Number(item.id) === Number(selected));
    if (!worker) return;
    onChange([
      ...items,
      {
        id_trabajador: Number(worker.id),
        nombre: worker.nombre,
        apellido: worker.apellido,
        rol: worker.rol,
        porcentaje: "",
        rol_en_sistema: "",
      },
    ]);
    setSelected("");
  };

  const divide = () => {
    if (!items.length) return;
    const values = splitExact(items.length);
    onChange(items.map((item, index) => ({ ...item, porcentaje: values[index] })));
  };

  return (
    <div className="CL-TeamBox">
      <div className="CL-TeamHeader">
        <div>
          <strong><FaUsers /> Equipo y reparto de este sistema</strong>
          <span>Solo se aplica a los cobros propios de 3DEVS para este sistema.</span>
        </div>
        <span className={totalOk ? "is-ok" : ""}>Total {total.toFixed(4)}%</span>
      </div>

      {items.map((item, index) => (
        <div className="CL-TeamRow" key={item.id_trabajador}>
          <div>
            <strong>{item.apellido}, {item.nombre}</strong>
            <small>{item.rol || "integrante"}</small>
          </div>
          <input
            value={item.rol_en_sistema || ""}
            placeholder="Función (opcional)"
            onChange={(event) => onChange(items.map((row, i) => i === index ? { ...row, rol_en_sistema: event.target.value } : row))}
            disabled={!canWrite}
          />
          <label>
            <input
              type="number"
              min="0.0001"
              max="100"
              step="0.0001"
              value={item.porcentaje ?? ""}
              onChange={(event) => onChange(items.map((row, i) => i === index ? { ...row, porcentaje: event.target.value } : row))}
              disabled={!canWrite}
            />
            <span>%</span>
          </label>
          {canWrite && (
            <button type="button" className="CL-IconDanger" onClick={() => onChange(items.filter((_, i) => i !== index))} title="Quitar">
              <FaTrashAlt />
            </button>
          )}
        </div>
      ))}

      {!items.length && <div className="CL-EmptyMini">Todavía no hay integrantes asignados.</div>}

      {canWrite && (
        <div className="CL-TeamActions">
          <select value={selected} onChange={(event) => setSelected(event.target.value)}>
            <option value="">Seleccionar integrante…</option>
            {available.map((worker) => (
              <option key={worker.id} value={worker.id}>{worker.apellido}, {worker.nombre}</option>
            ))}
          </select>
          <button type="button" onClick={add} disabled={!selected}><FaPlus /> Agregar</button>
          <button type="button" onClick={divide} disabled={!items.length}><FaBalanceScale /> Dividir 100%</button>
          <button type="button" className="is-primary" onClick={() => onSave(system.id_sistema)} disabled={!items.length || !totalOk || saving}>
            <FaSave /> {saving ? "Guardando…" : "Guardar equipo"}
          </button>
        </div>
      )}
    </div>
  );
}

function EntityDistribution({ summary }) {
  const direct = summary?.regla_directa || [];
  const effective = summary?.items || [];
  return (
    <div className="CL-EntitySplit">
      <div className="CL-EntitySplitTitle"><FaBuilding /> Distribución automática de BALTO</div>
      <p>Este sistema hereda la regla general; no se vuelven a cargar personas ni porcentajes.</p>

      <div className="CL-SplitSection">
        <strong>Regla contractual</strong>
        <div className="CL-SplitChips">
          {direct.map((item, index) => (
            <span key={`direct-${item.id_trabajador || item.id_organizacion_beneficiaria}-${index}`}>
              <b>{item.beneficiario_nombre}</b> {Number(item.porcentaje || 0).toFixed(4)}%
            </span>
          ))}
          {!direct.length && <span className="is-warning">Configurá la regla 50 / 50 desde Personas y distribución.</span>}
        </div>
      </div>

      {effective.length > 0 && (
        <div className="CL-SplitSection">
          <strong>Resultado efectivo final</strong>
          <div className="CL-SplitChips">
            {effective.map((item, index) => (
              <span key={`effective-${item.id_trabajador || item.id_organizacion_beneficiaria}-${index}`}>
                <b>{item.beneficiario_nombre}</b> {Number(item.porcentaje || 0).toFixed(4)}%
                {item.rutas?.length ? <small>{item.rutas.join(" / ")}</small> : null}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Clientes() {
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

  const [clientes, setClientes] = useState([]);
  const [planes, setPlanes] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [modeloReparto, setModeloReparto] = useState("por_sistema");
  const [orgDistribution, setOrgDistribution] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({ show: false, tipo: "exito", mensaje: "", key: 0 });

  const [newClient, setNewClient] = useState({ nombre: "", notas: "" });
  const [addClientOpen, setAddClientOpen] = useState(false);
  const [savingClient, setSavingClient] = useState(false);
  const [editClientId, setEditClientId] = useState(null);
  const [editClient, setEditClient] = useState({ nombre: "", notas: "" });

  const [selectedClient, setSelectedClient] = useState(null);
  const [systems, setSystems] = useState([]);
  const [loadingSystems, setLoadingSystems] = useState(false);
  const [addSystemOpen, setAddSystemOpen] = useState(false);
  const [newSystem, setNewSystem] = useState(emptySystem());
  const [savingSystem, setSavingSystem] = useState(false);
  const [editSystemId, setEditSystemId] = useState(null);
  const [editSystem, setEditSystem] = useState({});
  const [teams, setTeams] = useState({});
  const [savingTeam, setSavingTeam] = useState(null);
  const [systemDistributions, setSystemDistributions] = useState({});

  const [deleteClientOpen, setDeleteClientOpen] = useState(false);
  const [deleteClient, setDeleteClient] = useState(null);
  const [deleteSystemOpen, setDeleteSystemOpen] = useState(false);
  const [deleteSystem, setDeleteSystem] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [billingOpen, setBillingOpen] = useState(false);
  const [billingClient, setBillingClient] = useState(null);

  const showToast = useCallback((tipo, mensaje) => {
    setToast((current) => ({ show: true, tipo, mensaje, key: current.key + 1 }));
  }, []);

  const request = useCallback(
    (url, options = {}) => fetchJSONAuth(url, options, idOrganizacion),
    [idOrganizacion]
  );

  const loadBase = useCallback(async () => {
    if (!idOrganizacion) return;
    setLoading(true);
    try {
      const [clientsData, plansData, workersData, splitData] = await Promise.all([
        request(`${API}&op=list`, { method: "GET" }),
        request(`${API}&op=planes_mantenimiento_list`, { method: "GET" }),
        request(`${API}&op=trabajadores_list`, { method: "GET" }),
        request(`${API}&op=reparto_resumen`, { method: "GET" }),
      ]);
      setClientes(Array.isArray(clientsData?.clientes) ? clientsData.clientes : []);
      setPlanes(Array.isArray(plansData?.data) ? plansData.data : []);
      setWorkers(Array.isArray(workersData?.trabajadores) ? workersData.trabajadores : []);
      setModeloReparto(splitData?.reparto?.modelo_reparto || "por_sistema");
      setOrgDistribution(splitData?.reparto || null);
    } catch (error) {
      if (error?.code === "SESSION_EXPIRED") {
        clearStoredSession();
        navigate("/", { replace: true });
        return;
      }
      showToast("error", error?.message || "No se pudo cargar Clientes.");
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
    setSelectedClient(null);
    setSystems([]);
    loadBase();
  }, [usuario, organizaciones, idOrganizacion, navigate, loadBase]);

  const changeOrganization = (id) => {
    const selected = setStoredActiveOrganization(id);
    if (!selected) return showToast("error", "No tenés acceso a esa entidad.");
    setIdOrganizacion(Number(selected.id_organizacion));
  };

  const createClient = async () => {
    if (!newClient.nombre.trim()) return showToast("advertencia", "Ingresá el nombre del cliente.");
    setSavingClient(true);
    try {
      const data = await request(`${API}&op=create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: newClient.nombre.trim(), notas: newClient.notas.trim() }),
      });
      setNewClient({ nombre: "", notas: "" });
      setAddClientOpen(false);
      showToast("exito", data?.mensaje || "Cliente creado.");
      await loadBase();
      return true;
    } catch (error) {
      showToast("error", error?.message || "No se pudo crear el cliente.");
      return false;
    } finally {
      setSavingClient(false);
    }
  };

  const saveClient = async () => {
    if (!editClientId || !editClient.nombre.trim()) return;
    try {
      const data = await request(`${API}&op=update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_cliente: editClientId, ...editClient }),
      });
      setEditClientId(null);
      showToast("exito", data?.mensaje || "Cliente actualizado.");
      await loadBase();
    } catch (error) {
      showToast("error", error?.message || "No se pudo actualizar el cliente.");
    }
  };

  const confirmDeleteClient = async (client) => {
    setDeleting(true);
    try {
      await request(`${API}&op=delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_cliente: client.id_cliente }),
      });
      setDeleteClientOpen(false);
      setDeleteClient(null);
      showToast("exito", "Cliente eliminado.");
      await loadBase();
      return true;
    } catch (error) {
      showToast("error", error?.message || "No se pudo eliminar el cliente.");
      return false;
    } finally {
      setDeleting(false);
    }
  };

  const loadTeam = useCallback(async (system, model = modeloReparto, fallbackDistribution = orgDistribution) => {
    if (model === "por_sistema") {
      const data = await request(`${API}&op=sistema_trabajadores_list&id_sistema=${system.id_sistema}`, { method: "GET" });
      setTeams((current) => ({
        ...current,
        [system.id_sistema]: Array.isArray(data?.asignados)
          ? data.asignados.map((item) => ({ ...item, porcentaje: String(item.porcentaje ?? 0) }))
          : [],
      }));
    } else {
      const data = await request(`${API}&op=reparto_resumen&id_sistema=${system.id_sistema}&monto=${Number(system.monto_mensual || 0)}`, { method: "GET" });
      setSystemDistributions((current) => ({
        ...current,
        [system.id_sistema]: data?.reparto || fallbackDistribution,
      }));
    }
  }, [modeloReparto, request, orgDistribution]);

  const openSystems = async (client) => {
    setSelectedClient(client);
    setLoadingSystems(true);
    try {
      const data = await request(`${API}&op=sistemas_list&id_cliente=${client.id_cliente}`, { method: "GET" });
      const list = Array.isArray(data?.sistemas) ? data.sistemas : [];
      const model = data?.modelo_reparto || modeloReparto;
      setModeloReparto(model);
      setSystems(list);
      await Promise.all(list.map((system) => loadTeam(system, model, orgDistribution)));
    } catch (error) {
      showToast("error", error?.message || "No se pudieron cargar los sistemas.");
    } finally {
      setLoadingSystems(false);
    }
  };

  const createSystem = async () => {
    if (!selectedClient) return;
    setSavingSystem(true);
    try {
      const data = await request(`${API}&op=sistemas_create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id_cliente: selectedClient.id_cliente,
          ...newSystem,
          id_plan: newSystem.id_plan ? Number(newSystem.id_plan) : null,
          monto_mensual: Number(String(newSystem.monto_mensual || 0).replace(",", ".")),
        }),
      });
      setNewSystem(emptySystem());
      setAddSystemOpen(false);
      showToast("exito", data?.mensaje || "Sistema creado.");
      await openSystems(selectedClient);
    } catch (error) {
      showToast("error", error?.message || "No se pudo crear el sistema.");
    } finally {
      setSavingSystem(false);
    }
  };

  const startEditSystem = (system) => {
    setEditSystemId(system.id_sistema);
    setEditSystem({
      nombre: system.nombre || "",
      descripcion: system.descripcion || "",
      id_plan: system.id_plan ? String(system.id_plan) : "",
      monto_mensual: String(system.monto_mensual ?? ""),
      estado: system.estado || "activo",
      fecha_inicio: system.fecha_inicio || "",
    });
  };

  const saveSystem = async () => {
    if (!editSystemId) return;
    try {
      const data = await request(`${API}&op=sistemas_update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id_sistema: editSystemId,
          ...editSystem,
          id_plan: editSystem.id_plan ? Number(editSystem.id_plan) : null,
          monto_mensual: Number(String(editSystem.monto_mensual || 0).replace(",", ".")),
        }),
      });
      setEditSystemId(null);
      showToast("exito", data?.mensaje || "Sistema actualizado.");
      await openSystems(selectedClient);
    } catch (error) {
      showToast("error", error?.message || "No se pudo actualizar el sistema.");
    }
  };

  const confirmDeleteSystem = async (system) => {
    setDeleting(true);
    try {
      await request(`${API}&op=sistemas_delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_sistema: system.id_sistema }),
      });
      setDeleteSystemOpen(false);
      setDeleteSystem(null);
      showToast("exito", "Sistema eliminado.");
      await openSystems(selectedClient);
      return true;
    } catch (error) {
      showToast("error", error?.message || "No se pudo eliminar el sistema.");
      return false;
    } finally {
      setDeleting(false);
    }
  };

  const saveTeam = async (idSystem) => {
    setSavingTeam(idSystem);
    try {
      const data = await request(`${API}&op=sistema_trabajadores_save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id_sistema: idSystem,
          items: (teams[idSystem] || []).map((item) => ({
            id_trabajador: Number(item.id_trabajador || item.id),
            porcentaje: Number(item.porcentaje),
            rol_en_sistema: item.rol_en_sistema || "",
          })),
        }),
      });
      showToast("exito", data?.mensaje || "Equipo guardado.");
      const system = systems.find((item) => Number(item.id_sistema) === Number(idSystem));
      if (system) await loadTeam(system);
    } catch (error) {
      showToast("error", error?.message || "No se pudo guardar el equipo.");
    } finally {
      setSavingTeam(null);
    }
  };

  const sortedClients = useMemo(
    () => [...clientes].sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), "es")),
    [clientes]
  );

  return (
    <div className="ini_contenedor-principal" onChangeCapture={uppercaseTextFieldOnChange}>
      {toast.show && <Toast key={toast.key} tipo={toast.tipo} mensaje={toast.mensaje} onClose={() => setToast((t) => ({ ...t, show: false }))} />}
      <main className="CL-Wrap">
        <section className="CL-Card">
          <header className="CL-Header">
            <h2><FaCubes /> Clientes y sistemas</h2>
            <div className="CL-OrgTabs" role="tablist" aria-label="Entidad de clientes">
              {organizaciones.map((org) => (
                <button
                  key={org.id_organizacion}
                  type="button"
                  role="tab"
                  aria-selected={Number(org.id_organizacion) === idOrganizacion}
                  className={Number(org.id_organizacion) === idOrganizacion ? "is-active" : ""}
                  onClick={() => changeOrganization(org.id_organizacion)}
                >
                  {org.codigo || org.nombre}<small>{org.rol}</small>
                </button>
              ))}
            </div>
            <button className="CL-HeaderBack" type="button" onClick={() => navigate("/panel")}>
              <FaArrowLeft /> Volver
            </button>
          </header>

          <div className="CL-ContentGrid">
            <section className="CL-ClientsIsland">
              {puedeEditar && (
                <div className="CL-Toolbar">
                  <div>
                    <div className="CL-ToolbarTitle">
                      <strong>Clientes registrados</strong>
                      <span className="CL-PolicyInfo" tabIndex={0} aria-label="Información sobre el reparto">
                        <FaInfoCircle />
                        <span className="CL-PolicyTooltip" role="tooltip">
                          <strong>{modeloReparto === "por_sistema" ? "Reparto por sistema" : "Reparto general por entidad"}</strong>
                          <span>{modeloReparto === "por_sistema" ? "En cada sistema de 3DEVS se define quién trabajó y qué porcentaje recibe." : "Todos los clientes BALTO usan automáticamente el 50% contador / 50% 3DEVS configurado en Trabajadores."}</span>
                        </span>
                      </span>
                    </div>
                    <span>Administrá sus datos, sistemas y facturación.</span>
                  </div>
                  <div className="CL-ToolbarActions">
                    <button type="button" onClick={() => setBudgetOpen(true)}><FaFileInvoice /> Generar presupuesto</button>
                    <button type="button" onClick={() => { setNewClient({ nombre: "", notas: "" }); setAddClientOpen(true); }}><FaPlus /> Agregar cliente</button>
                  </div>
                </div>
              )}

              <div className="CL-Table">
                <div className="CL-TableHead"><span>Cliente</span><span>Notas</span><span>Estado</span><span /></div>
                <div className="CL-TableBody">
                  {loading ? <div className="CL-Empty">Cargando clientes…</div> : !sortedClients.length ? <div className="CL-Empty">No hay clientes en esta entidad.</div> : sortedClients.map((client) => {
                    const editing = editClientId === client.id_cliente;
                    return (
                      <div className="CL-ClientRow" key={client.id_cliente}>
                        <div>
                          {editing ? <input value={editClient.nombre} onChange={(e) => setEditClient((current) => ({ ...current, nombre: e.target.value }))} /> : <strong>{client.nombre}</strong>}
                        </div>
                        <div>{editing ? <input value={editClient.notas} onChange={(e) => setEditClient((current) => ({ ...current, notas: e.target.value }))} /> : <span>{client.notas || "—"}</span>}</div>
                        <div><span className="CL-Status">Activo</span></div>
                        <div className="CL-Actions">
                          <button type="button" onClick={() => openSystems(client)} title="Sistemas"><FaCubes /></button>
                          <button type="button" onClick={() => { setBillingClient(client); setBillingOpen(true); }} title="Facturación"><FaFileInvoice /></button>
                          {puedeEditar && (editing ? (
                            <>
                              <button type="button" onClick={saveClient} title="Guardar"><FaSave /></button>
                              <button type="button" onClick={() => setEditClientId(null)} title="Cancelar"><FaTimes /></button>
                            </>
                          ) : (
                            <>
                              <button type="button" onClick={() => { setEditClientId(client.id_cliente); setEditClient({ nombre: client.nombre, notas: client.notas || "" }); }} title="Editar"><FaPen /></button>
                              <button type="button" className="is-danger" onClick={() => { setDeleteClient(client); setDeleteClientOpen(true); }} title="Eliminar"><FaTrashAlt /></button>
                            </>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </section>
          </div>
        </section>
      </main>

      <SistemasModal
        open={Boolean(selectedClient)}
        onClose={() => { setSelectedClient(null); setEditSystemId(null); }}
        cliente={selectedClient}
        sistemas={systems}
        cargando={loadingSystems}
        onOpenAdd={() => { setNewSystem(emptySystem()); setAddSystemOpen(true); }}
        canWrite={puedeEditar}
      >
        <div className="CL-SystemsList">
          {systems.map((system) => {
            const editing = editSystemId === system.id_sistema;
            const plan = planes.find((item) => Number(item.id) === Number(system.id_plan));
            return (
              <article className="CL-SystemCard" key={system.id_sistema}>
                <div className="CL-SystemTop">
                  <div>
                    {editing ? (
                      <>
                        <input value={editSystem.nombre || ""} onChange={(e) => setEditSystem((current) => ({ ...current, nombre: e.target.value }))} placeholder="Nombre" />
                        <input value={editSystem.descripcion || ""} onChange={(e) => setEditSystem((current) => ({ ...current, descripcion: e.target.value }))} placeholder="Descripción" />
                      </>
                    ) : (
                      <>
                        <h3>{system.nombre}</h3>
                        <p>{system.descripcion || "Sin descripción"}</p>
                      </>
                    )}
                  </div>
                  <div className="CL-Actions">
                    {puedeEditar && (editing ? (
                      <>
                        <button type="button" onClick={saveSystem}><FaSave /></button>
                        <button type="button" onClick={() => setEditSystemId(null)}><FaTimes /></button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => startEditSystem(system)}><FaPen /></button>
                        <button type="button" className="is-danger" onClick={() => { setDeleteSystem(system); setDeleteSystemOpen(true); }}><FaTrashAlt /></button>
                      </>
                    ))}
                  </div>
                </div>

                {editing ? (
                  <div className="CL-SystemForm">
                    <select value={editSystem.id_plan || ""} onChange={(e) => {
                      const value = e.target.value;
                      const selectedPlan = planes.find((item) => String(item.id) === value);
                      setEditSystem((current) => ({ ...current, id_plan: value, monto_mensual: selectedPlan ? String(selectedPlan.monto) : current.monto_mensual }));
                    }}>
                      <option value="">Sin plan / personalizado</option>
                      {planes.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}
                    </select>
                    <input value={editSystem.monto_mensual || ""} onChange={(e) => setEditSystem((current) => ({ ...current, monto_mensual: e.target.value }))} placeholder="Monto mensual" inputMode="decimal" />
                    <select value={editSystem.estado || "activo"} onChange={(e) => setEditSystem((current) => ({ ...current, estado: e.target.value }))}>
                      <option value="activo">Activo</option><option value="pausado">Pausado</option><option value="finalizado">Finalizado</option>
                    </select>
                    <input type="date" value={editSystem.fecha_inicio || ""} onChange={(e) => setEditSystem((current) => ({ ...current, fecha_inicio: e.target.value }))} />
                  </div>
                ) : (
                  <div className="CL-SystemMeta">
                    <span>Plan <b>{system.plan_nombre || plan?.nombre || "Personalizado"}</b></span>
                    <span>Mensual <b>{formatARS(system.monto_mensual)}</b></span>
                    <span>Estado <b>{system.estado}</b></span>
                    <span>Inicio <b>{system.fecha_inicio || "—"}</b></span>
                  </div>
                )}

                {!editing && (modeloReparto === "por_sistema" ? (
                  <TeamEditor
                    system={system}
                    workers={workers}
                    items={teams[system.id_sistema] || []}
                    canWrite={puedeEditar}
                    onChange={(items) => setTeams((current) => ({ ...current, [system.id_sistema]: items }))}
                    onSave={saveTeam}
                    saving={savingTeam === system.id_sistema}
                  />
                ) : (
                  <EntityDistribution summary={systemDistributions[system.id_sistema] || orgDistribution} />
                ))}
              </article>
            );
          })}
        </div>
      </SistemasModal>

      <AgregarSistemaModal
        open={addSystemOpen}
        onClose={() => setAddSystemOpen(false)}
        cliente={selectedClient}
        form={newSystem}
        onChange={(key, value) => setNewSystem((current) => ({ ...current, [key]: value }))}
        onSubmit={createSystem}
        submitting={savingSystem}
        planes={planes}
      />
      <AgregarClienteModal
        open={addClientOpen}
        onClose={() => !savingClient && setAddClientOpen(false)}
        form={newClient}
        onChange={(key, value) => setNewClient((current) => ({ ...current, [key]: value }))}
        onSubmit={createClient}
        submitting={savingClient}
      />
      <EliminarClienteModal open={deleteClientOpen} onClose={() => setDeleteClientOpen(false)} onConfirm={confirmDeleteClient} loading={deleting} cliente={deleteClient} mensaje="También se eliminarán sus sistemas sin movimientos asociados." />
      <EliminarSistemaModal open={deleteSystemOpen} onClose={() => setDeleteSystemOpen(false)} onConfirm={confirmDeleteSystem} loading={deleting} sistema={deleteSystem} mensaje="No se puede eliminar si tiene pagos o facturas." />
      <GenerarPresupuestoModal open={budgetOpen} onClose={() => setBudgetOpen(false)} onToast={showToast} sessionKey={getStoredToken()} organizationId={idOrganizacion} organizationName={organizacionActiva?.nombre || ""} />
      <DatosFacturacionModal open={billingOpen} onClose={() => setBillingOpen(false)} cliente={billingClient} apiFetch={request} apiBase={API} onToast={showToast} />
    </div>
  );
}
