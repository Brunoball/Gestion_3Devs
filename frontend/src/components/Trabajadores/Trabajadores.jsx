import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faPlus,
  faPenToSquare,
  faUserSlash,
  faMagnifyingGlass,
  faUsersSlash,
  faSave,
  faScaleBalanced,
  faDiagramProject,
  faBuilding,
  faCircleInfo,
  faUsers,
  faUserTie,
} from "@fortawesome/free-solid-svg-icons";
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
import "./Trabajadores.css";
import "./TrabajadoresMejoras.css";

import ModalAgregarTrabajador from "./modales/ModalAgregarTrabajador";
import ModalEditarTrabajador from "./modales/ModalEditarTrabajador";
import ModalBajaTrabajador from "./modales/ModalBajaTrabajador";
import ModalTrabajadoresBaja from "./modales/ModalTrabajadoresBaja";

const API = `${BASE_URL}/api.php?action=trabajadores`;

function splitExact(count) {
  if (!count) return [];
  const totalUnits = 1000000;
  const base = Math.floor(totalUnits / count);
  let rest = totalUnits - base * count;
  return Array.from({ length: count }, () => ((base + (rest-- > 0 ? 1 : 0)) / 10000).toFixed(4));
}

function formatPct(value) {
  const n = Number(value || 0);
  return Number.isFinite(n)
    ? n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })
    : "0,00";
}

export default function Trabajadores() {
  const navigate = useNavigate();
  const [usuario] = useState(() => getStoredUser());
  const organizaciones = useMemo(() => getOrganizations(usuario), [usuario]);
  const [idOrganizacion, setIdOrganizacion] = useState(() =>
    Number(getStoredActiveOrganization(usuario)?.id_organizacion || 0)
  );
  const organizacionActiva = useMemo(
    () => organizaciones.find((item) => Number(item.id_organizacion) === idOrganizacion) || organizaciones[0] || null,
    [organizaciones, idOrganizacion]
  );
  const puedeEditar = ["admin", "contador"].includes(
    String(organizacionActiva?.rol || "vista").toLowerCase()
  );

  const [rows, setRows] = useState([]);
  const [available, setAvailable] = useState([]);
  const [repartoWorkers, setRepartoWorkers] = useState([]);
  const [repartoOrgs, setRepartoOrgs] = useState([]);
  const [modeloReparto, setModeloReparto] = useState("por_sistema");
  const [repartoInterno, setRepartoInterno] = useState([]);
  const [contadorBalto, setContadorBalto] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingReparto, setSavingReparto] = useState(false);
  const [q, setQ] = useState("");

  const [openCrear, setOpenCrear] = useState(false);
  const [openEditar, setOpenEditar] = useState(false);
  const [openBaja, setOpenBaja] = useState(false);
  const [openBajaListado, setOpenBajaListado] = useState(false);
  const [sel, setSel] = useState(null);
  const [toast, setToast] = useState({ open: false, tipo: "info", mensaje: "", duracion: 2800, key: 0 });

  const showToast = useCallback((tipo, mensaje, duracion = 2800) => {
    setToast((current) => ({ open: true, tipo, mensaje, duracion, key: current.key + 1 }));
  }, []);

  const request = useCallback(
    (url, options = {}) => fetchJSONAuth(url, options, idOrganizacion),
    [idOrganizacion]
  );

  const cargar = useCallback(async () => {
    if (!idOrganizacion) return;
    setLoading(true);
    try {
      const [workersData, availableData, splitData] = await Promise.all([
        request(`${API}&op=listar&activos=1`, { method: "GET" }),
        request(`${API}&op=disponibles`, { method: "GET" }),
        request(`${API}&op=reparto_listar`, { method: "GET" }),
      ]);

      const workers = Array.isArray(workersData?.data) ? workersData.data : [];
      const beneficiaries = Array.isArray(splitData?.trabajadores) ? splitData.trabajadores : [];
      const saved = Array.isArray(splitData?.items) ? splitData.items : [];
      const model = splitData?.modelo_reparto || "por_sistema";

      setRows(workers);
      setAvailable(Array.isArray(availableData?.data) ? availableData.data : []);
      setRepartoWorkers(beneficiaries);
      setRepartoOrgs(Array.isArray(splitData?.organizaciones) ? splitData.organizaciones : []);
      setModeloReparto(model);

      if (model === "por_sistema") {
        setRepartoInterno(
          saved
            .filter((item) => item.tipo_beneficiario === "trabajador")
            .map((item) => ({
              id_trabajador: String(item.id_trabajador || ""),
              porcentaje: Number(item.porcentaje || 0).toFixed(4),
            }))
        );
        setContadorBalto("");
      } else {
        const accountant = saved.find((item) => item.tipo_beneficiario === "trabajador");
        setContadorBalto(accountant?.id_trabajador ? String(accountant.id_trabajador) : "");
        setRepartoInterno([]);
      }
    } catch (error) {
      if (error?.code === "SESSION_EXPIRED") {
        clearStoredSession();
        navigate("/", { replace: true });
        return;
      }
      showToast("error", error?.message || "No se pudo cargar Personas y distribución.");
      setRows([]);
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
    setQ("");
    setSel(null);
    cargar();
  }, [idOrganizacion, usuario, organizaciones, navigate, cargar]);

  const cambiarOrganizacion = (id) => {
    const selected = setStoredActiveOrganization(id);
    if (!selected) return showToast("error", "No tenés acceso a esa entidad.");
    setIdOrganizacion(Number(selected.id_organizacion));
  };

  const filtrados = useMemo(() => {
    const value = q.trim().toLowerCase();
    if (!value) return rows;
    return rows.filter((row) =>
      `${row.nombre || ""} ${row.apellido || ""} ${row.email || ""} ${row.rol || ""} ${row.entidades_codigos || ""}`
        .toLowerCase()
        .includes(value)
    );
  }, [rows, q]);

  const totalInterno = useMemo(
    () => repartoInterno.reduce((sum, item) => sum + (Number(item.porcentaje) || 0), 0),
    [repartoInterno]
  );
  const internoOk = repartoInterno.length > 0 && Math.abs(totalInterno - 100) <= 0.0001;
  const devsOrganization = repartoOrgs.find(
    (item) => String(item.codigo || "").toUpperCase() === "3DEVS"
  );
  const contadorOptions = repartoWorkers.filter(
    (item) => String(item.rol || "").toLowerCase() === "contador"
  );

  const cargarIntegrantesActivos = () => {
    const candidates = repartoWorkers.filter(
      (item) => String(item.rol || "").toLowerCase() !== "contador"
    );
    if (!candidates.length) return showToast("advertencia", "No hay integrantes activos vinculados a 3DEVS.");
    const percentages = splitExact(candidates.length);
    setRepartoInterno(
      candidates.map((item, index) => ({
        id_trabajador: String(item.id),
        porcentaje: percentages[index],
      }))
    );
  };

  const dividirInterno = () => {
    if (!repartoInterno.length) return cargarIntegrantesActivos();
    const percentages = splitExact(repartoInterno.length);
    setRepartoInterno((current) =>
      current.map((item, index) => ({ ...item, porcentaje: percentages[index] }))
    );
  };

  const guardarItems = async (items) => {
    setSavingReparto(true);
    try {
      const response = await request(`${API}&op=reparto_guardar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      showToast("exito", response?.mensaje || "Distribución guardada.");
      await cargar();
    } catch (error) {
      showToast("error", error?.message || "No se pudo guardar la distribución.", 3800);
    } finally {
      setSavingReparto(false);
    }
  };

  const guardarInterno3devs = () => {
    if (!internoOk) return showToast("advertencia", "La distribución debe sumar exactamente 100%.");
    return guardarItems(
      repartoInterno.map((item) => ({
        tipo_beneficiario: "trabajador",
        id_trabajador: Number(item.id_trabajador),
        id_organizacion_beneficiaria: null,
        porcentaje: Number(item.porcentaje),
      }))
    );
  };

  const guardarBalto = () => {
    if (!contadorBalto) return showToast("advertencia", "Seleccioná al contador de BALTO.");
    if (!devsOrganization) return showToast("error", "No se encontró la organización 3DEVS activa.");
    return guardarItems([
      {
        tipo_beneficiario: "trabajador",
        id_trabajador: Number(contadorBalto),
        id_organizacion_beneficiaria: null,
        porcentaje: 50,
      },
      {
        tipo_beneficiario: "organizacion",
        id_trabajador: null,
        id_organizacion_beneficiaria: Number(devsOrganization.id_organizacion),
        porcentaje: 50,
      },
    ]);
  };

  const isBalto = modeloReparto === "por_entidad";

  return (
    <div className="ini_contenedor-principal" onChangeCapture={uppercaseTextFieldOnChange}>
      {toast.open && (
        <Toast
          key={toast.key}
          tipo={toast.tipo}
          mensaje={toast.mensaje}
          duracion={toast.duracion}
          onClose={() => setToast((current) => ({ ...current, open: false }))}
        />
      )}

      <main className="TP-Wrap TP-Workers">
        <section className="TP-Card">
          <header className="TP-Header TP-Header--multi">
            <h2 className="TP-Title"><FontAwesomeIcon icon={faUsers} /> Personas y distribución</h2>
            <div className="TP-OrgTabs" role="tablist" aria-label="Entidad">
              {organizaciones.map((org) => {
                const active = Number(org.id_organizacion) === idOrganizacion;
                return (
                  <button
                    key={org.id_organizacion}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    className={`TP-OrgTab ${active ? "is-active" : ""}`}
                    onClick={() => cambiarOrganizacion(org.id_organizacion)}
                  >
                    <span>{org.codigo || org.nombre}</span><small>{org.rol}</small>
                  </button>
                );
              })}
            </div>
            <button className="TP-HeaderBack" type="button" onClick={() => navigate("/panel")}>
              <FontAwesomeIcon icon={faArrowLeft} /> Volver
            </button>
          </header>

          <div className="TP-ContentGrid">
            <section className="TP-MainIsland">
              <div className="TP-IslandScroll">
              <section className="TP-Tools">
                <div className="TP-ToolsTop">
                  <div className="TP-ToolsCopy">
                    <div className="TP-ToolsTitle">
                      <strong>Trabajadores registrados</strong>
                      <span className="TP-ModelInfo" tabIndex={0} aria-label="Información sobre el modelo de reparto">
                        <FontAwesomeIcon icon={faCircleInfo} />
                        <span className="TP-ModelTooltip" role="tooltip">
                          <strong>{isBalto ? "BALTO tiene una regla fija institucional" : "3DEVS distribuye sus clientes por sistema"}</strong>
                          <span>
                            {isBalto
                              ? "Cada cobro BALTO se divide 50% para el contador y 50% para 3DEVS. No se duplican los tres integrantes en cada cliente."
                              : "El porcentaje de los clientes propios se define en Clientes → Sistemas. Acá solo se define cómo se reparte la parte institucional que 3DEVS recibe desde BALTO."}
                          </span>
                        </span>
                      </span>
                    </div>
                    <span>Administrá las personas, sus roles y las entidades vinculadas.</span>
                  </div>
                  <div className="TP-ToolsActions">
                    <button type="button" className="TP-Btn TP-Btn--ghost" onClick={() => setOpenBajaListado(true)}>
                      <FontAwesomeIcon icon={faUsersSlash} /> Dados de baja
                    </button>
                    {puedeEditar && (
                      <button className="TP-Btn TP-Btn--primary" type="button" onClick={() => setOpenCrear(true)}>
                        <FontAwesomeIcon icon={faPlus} /> Agregar o vincular persona
                      </button>
                    )}
                  </div>
                </div>
                <div className="TP-SearchBox">
                  <FontAwesomeIcon icon={faMagnifyingGlass} />
                  <input className="TP-SearchInput" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Buscar persona, rol o entidad…" />
                </div>
              </section>

          <div className="TP-PeopleTable">
            <div className="TP-PeopleHead">
              <span>Persona</span><span>Rol en {organizacionActiva?.codigo}</span><span>Entidades</span><span>Estado</span><span />
            </div>
            <div className="TP-PeopleBody">
              {loading ? (
                <div className="TP-GridEmpty">Cargando personas…</div>
              ) : !filtrados.length ? (
                <div className="TP-GridEmpty">No hay personas vinculadas a esta entidad.</div>
              ) : (
                filtrados.map((worker) => (
                  <div className="TP-PeopleRow" key={worker.id}>
                    <div className="TP-Person">
                      <strong>{worker.nombre} {worker.apellido}</strong>
                      <span>{worker.email || worker.alias_pago || "Sin datos de contacto"}</span>
                    </div>
                    <div><span className="TP-Pill TP-Pill--role">{worker.rol}</span></div>
                    <div className="TP-EntityBadges">
                      {String(worker.entidades_codigos || organizacionActiva?.codigo || "")
                        .split(",").filter(Boolean).map((code) => <span key={code}>{code}</span>)}
                    </div>
                    <div><span className="TP-Pill TP-Pill--ok">Activo</span></div>
                    <div className="TP-RowActions">
                      {puedeEditar && (
                        <>
                          <button type="button" className="TP-IconBtn TP-IconBtn--edit" onClick={() => { setSel(worker); setOpenEditar(true); }} title="Editar">
                            <FontAwesomeIcon icon={faPenToSquare} />
                          </button>
                          <button type="button" className="TP-IconBtn TP-IconBtn--del" onClick={() => { setSel(worker); setOpenBaja(true); }} title="Dar de baja en esta entidad">
                            <FontAwesomeIcon icon={faUserSlash} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {isBalto ? (
            <section className="TP-RepartoCard">
              <div className="TP-RepartoHeader">
                <div>
                  <h3>Regla contable de BALTO</h3>
                  <p>Es única para todos los clientes y sistemas de BALTO.</p>
                </div>
                <div className="TP-RepartoTotal is-ok">Total: 100,00%</div>
              </div>

              <div className="TP-FixedRule">
                <div className="TP-FixedRuleRow">
                  <span className="TP-FixedIcon"><FontAwesomeIcon icon={faUserTie} /></span>
                  <div><strong>Contador de BALTO</strong><small>Beneficiario directo</small></div>
                  <select value={contadorBalto} onChange={(event) => setContadorBalto(event.target.value)} disabled={!puedeEditar}>
                    <option value="">Seleccionar contador</option>
                    {contadorOptions.map((worker) => <option key={worker.id} value={worker.id}>{worker.apellido}, {worker.nombre}</option>)}
                  </select>
                  <b>50,0000%</b>
                </div>
                <div className="TP-FixedRuleRow">
                  <span className="TP-FixedIcon"><FontAwesomeIcon icon={faBuilding} /></span>
                  <div><strong>3DEVS</strong><small>Organización beneficiaria</small></div>
                  <span>{devsOrganization?.nombre || "3Devs Solutions"}</span>
                  <b>50,0000%</b>
                </div>
              </div>

              <div className="TP-RuleNote">
                La mitad que recibe 3DEVS se distribuye automáticamente según la distribución interna configurada en la pestaña 3DEVS.
              </div>
              {puedeEditar && (
                <div className="TP-RepartoActions">
                  <button type="button" className="TP-Btn TP-Btn--primary" onClick={guardarBalto} disabled={savingReparto || !contadorBalto || !devsOrganization}>
                    <FontAwesomeIcon icon={faSave} /> {savingReparto ? "Guardando…" : "Guardar regla 50 / 50"}
                  </button>
                </div>
              )}
            </section>
          ) : (
            <section className="TP-RepartoCard">
              <div className="TP-RepartoHeader">
                <div>
                  <h3>Distribución interna de la participación de 3DEVS</h3>
                  <p>Solo se usa para distribuir el 50% que BALTO transfiere a 3DEVS. No reemplaza los porcentajes por sistema.</p>
                </div>
                <div className={`TP-RepartoTotal ${internoOk ? "is-ok" : ""}`}>Total: {formatPct(totalInterno)}%</div>
              </div>

              <div className="TP-RepartoList">
                {repartoInterno.map((item, index) => (
                  <div className="TP-RepartoRow TP-RepartoRow--simple" key={`${item.id_trabajador}-${index}`}>
                    <select
                      value={item.id_trabajador}
                      onChange={(event) => setRepartoInterno((current) => current.map((row, i) => i === index ? { ...row, id_trabajador: event.target.value } : row))}
                      disabled={!puedeEditar}
                    >
                      <option value="">Seleccionar integrante</option>
                      {repartoWorkers.filter((worker) => String(worker.rol || "").toLowerCase() !== "contador").map((worker) => (
                        <option key={worker.id} value={worker.id}>{worker.apellido}, {worker.nombre}</option>
                      ))}
                    </select>
                    <label className="TP-RepartoPct">
                      <input
                        type="number" min="0.0001" max="100" step="0.0001"
                        value={item.porcentaje}
                        onChange={(event) => setRepartoInterno((current) => current.map((row, i) => i === index ? { ...row, porcentaje: event.target.value } : row))}
                        disabled={!puedeEditar}
                      />
                      <span>%</span>
                    </label>
                    {puedeEditar && (
                      <button type="button" className="TP-IconBtn TP-IconBtn--del" onClick={() => setRepartoInterno((current) => current.filter((_, i) => i !== index))}>×</button>
                    )}
                  </div>
                ))}
                {!repartoInterno.length && <div className="TP-RepartoEmpty">Todavía no está configurada la distribución interna.</div>}
              </div>

              {puedeEditar && (
                <div className="TP-RepartoActions">
                  <button type="button" className="TP-Btn TP-Btn--ghost" onClick={cargarIntegrantesActivos}>
                    <FontAwesomeIcon icon={faPlus} /> Cargar integrantes activos
                  </button>
                  <button type="button" className="TP-Btn TP-Btn--ghost" onClick={dividirInterno}>
                    <FontAwesomeIcon icon={faScaleBalanced} /> Dividir 100% exacto
                  </button>
                  <button type="button" className="TP-Btn TP-Btn--primary" onClick={guardarInterno3devs} disabled={savingReparto || !internoOk}>
                    <FontAwesomeIcon icon={faSave} /> {savingReparto ? "Guardando…" : "Guardar distribución"}
                  </button>
                </div>
              )}
            </section>
          )}

              </div>
            </section>
          </div>
        </section>
      </main>

      <ModalAgregarTrabajador
        open={openCrear}
        onClose={() => setOpenCrear(false)}
        onSaved={async () => { setOpenCrear(false); showToast("exito", "Persona vinculada correctamente."); await cargar(); }}
        idOrganizacion={idOrganizacion}
        organizacion={organizacionActiva}
        trabajadoresDisponibles={available}
      />
      <ModalEditarTrabajador
        open={openEditar}
        trabajador={sel}
        onClose={() => setOpenEditar(false)}
        onSaved={async () => { setOpenEditar(false); showToast("exito", "Persona actualizada."); await cargar(); }}
        idOrganizacion={idOrganizacion}
      />
      <ModalBajaTrabajador
        open={openBaja}
        trabajador={sel}
        onClose={() => setOpenBaja(false)}
        onSaved={async () => { setOpenBaja(false); showToast("exito", "Persona dada de baja en esta entidad."); await cargar(); }}
        idOrganizacion={idOrganizacion}
        organizacionNombre={organizacionActiva?.nombre}
      />
      <ModalTrabajadoresBaja
        open={openBajaListado}
        onClose={() => setOpenBajaListado(false)}
        onChanged={cargar}
        idOrganizacion={idOrganizacion}
        organizacionNombre={organizacionActiva?.nombre}
      />
    </div>
  );
}
