// src/components/Clientes/Clientes.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import BASE_URL from "../../config/config";
import Toast from "../Global/Toast";
import "./clientes.css";

import SistemasModal from "./modales/SistemasModal";
import AgregarSistemaModal from "./modales/AgregarSistemaModal";

const API = `${BASE_URL}/api.php?action=clientes`;

export default function Clientes() {
  const navigate = useNavigate();

  const [toast, setToast] = useState(null);
  const mostrarToast = (tipo, mensaje, duracion = 3000) =>
    setToast({ tipo, mensaje, duracion });

  const [cargando, setCargando] = useState(false);
  const [clientes, setClientes] = useState([]);

  // ✅ modal ver sistemas
  const [modalClienteId, setModalClienteId] = useState(null);
  const [cargandoSistemas, setCargandoSistemas] = useState(false);

  // ✅ modal agregar sistema
  const [modalAddOpen, setModalAddOpen] = useState(false);
  const [addSubmitting, setAddSubmitting] = useState(false);

  // formularios clientes
  const [nuevoCliente, setNuevoCliente] = useState({ nombre: "", notas: "" });
  const [editClienteId, setEditClienteId] = useState(null);
  const [editCliente, setEditCliente] = useState({ nombre: "", notas: "" });

  // sistemas por cliente
  const [sistemas, setSistemas] = useState({}); // { [id_cliente]: [] }
  const [nuevoSistema, setNuevoSistema] = useState({}); // { [id_cliente]: form }
  const [editSistema, setEditSistema] = useState({}); // { [id_sistema]: form }
  const [editSistemaId, setEditSistemaId] = useState(null);

  // trabajadores globales + asignación por sistema
  const [trabajadores, setTrabajadores] = useState([]);
  const [asignadosPorSistema, setAsignadosPorSistema] = useState({});
  const [selectTrabajador, setSelectTrabajador] = useState({});

  const clientesOrdenados = useMemo(() => {
    return [...clientes].sort((a, b) =>
      String(a.nombre || "").localeCompare(String(b.nombre || ""), "es")
    );
  }, [clientes]);

  const clienteModal = useMemo(() => {
    return clientes.find((c) => c.id_cliente === modalClienteId) || null;
  }, [clientes, modalClienteId]);

  const sisModal = useMemo(() => {
    return modalClienteId ? sistemas?.[modalClienteId] || [] : [];
  }, [modalClienteId, sistemas]);

  const fetchJSON = async (url, opts) => {
    const res = await fetch(url, opts);
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!data || data.exito === false) {
      const msg = data?.mensaje || "Error en el servidor";
      throw new Error(msg);
    }
    return data;
  };

  const cargarClientes = async () => {
    setCargando(true);
    try {
      const data = await fetchJSON(`${API}&op=list`, { method: "GET" });
      setClientes(Array.isArray(data?.clientes) ? data.clientes : []);
    } catch (e) {
      mostrarToast("error", e.message || "No se pudieron cargar los clientes");
    } finally {
      setCargando(false);
    }
  };

  const cargarSistemasCliente = async (id_cliente) => {
    setCargandoSistemas(true);
    try {
      const data = await fetchJSON(
        `${API}&op=sistemas_list&id_cliente=${id_cliente}`,
        { method: "GET" }
      );
      const lista = Array.isArray(data?.sistemas) ? data.sistemas : [];
      setSistemas((prev) => ({
        ...prev,
        [id_cliente]: lista,
      }));
      return lista; // ✅ importante para usar la lista real en el mismo flujo
    } catch (e) {
      mostrarToast("error", e.message || "No se pudieron cargar los sistemas");
      return [];
    } finally {
      setCargandoSistemas(false);
    }
  };

  const cargarTrabajadores = async () => {
    try {
      const data = await fetchJSON(`${API}&op=trabajadores_list`, { method: "GET" });
      setTrabajadores(Array.isArray(data?.trabajadores) ? data.trabajadores : []);
    } catch (e) {
      mostrarToast("error", e.message || "No se pudieron cargar los trabajadores");
    }
  };

  const cargarAsignadosSistema = async (id_sistema) => {
    try {
      const data = await fetchJSON(
        `${API}&op=sistema_trabajadores_list&id_sistema=${id_sistema}`,
        { method: "GET" }
      );
      setAsignadosPorSistema((prev) => ({
        ...prev,
        [id_sistema]: Array.isArray(data?.asignados) ? data.asignados : [],
      }));
    } catch (e) {
      mostrarToast("error", e.message || "No se pudieron cargar los asignados");
    }
  };

  const asignarTrabajador = async (id_sistema) => {
    const id_trabajador = Number(selectTrabajador?.[id_sistema] || 0);
    if (!id_trabajador) return mostrarToast("advertencia", "Elegí un trabajador");

    try {
      const data = await fetchJSON(`${API}&op=sistema_trabajadores_add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_sistema, id_trabajador }),
      });

      mostrarToast("exito", data?.mensaje || "Trabajador asignado");
      setSelectTrabajador((p) => ({ ...p, [id_sistema]: "" }));
      await cargarAsignadosSistema(id_sistema);
    } catch (e) {
      mostrarToast("error", e.message || "No se pudo asignar el trabajador");
    }
  };

  const quitarTrabajador = async (id_sistema, id_trabajador) => {
    if (!window.confirm("¿Quitar este trabajador del sistema?")) return;

    try {
      const data = await fetchJSON(`${API}&op=sistema_trabajadores_remove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_sistema, id_trabajador }),
      });

      mostrarToast("exito", data?.mensaje || "Trabajador quitado");
      await cargarAsignadosSistema(id_sistema);
    } catch (e) {
      mostrarToast("error", e.message || "No se pudo quitar el trabajador");
    }
  };

  useEffect(() => {
    cargarClientes();
    cargarTrabajadores();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* =========================
     CLIENTES CRUD
  ========================= */

  const crearCliente = async () => {
    const nombre = (nuevoCliente.nombre || "").trim();
    if (!nombre) return mostrarToast("advertencia", "Ingresá el nombre del cliente");

    try {
      const data = await fetchJSON(`${API}&op=create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre, notas: (nuevoCliente.notas || "").trim() }),
      });

      mostrarToast("exito", data?.mensaje || "Cliente creado");
      setNuevoCliente({ nombre: "", notas: "" });
      await cargarClientes();
    } catch (e) {
      mostrarToast("error", e.message || "No se pudo crear el cliente");
    }
  };

  const iniciarEditarCliente = (c) => {
    setEditClienteId(c.id_cliente);
    setEditCliente({ nombre: c.nombre || "", notas: c.notas || "" });
  };

  const guardarEditarCliente = async () => {
    const id_cliente = editClienteId;
    if (!id_cliente) return;

    const nombre = (editCliente.nombre || "").trim();
    if (!nombre) return mostrarToast("advertencia", "El nombre no puede estar vacío");

    try {
      const data = await fetchJSON(`${API}&op=update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id_cliente,
          nombre,
          notas: (editCliente.notas || "").trim(),
        }),
      });

      mostrarToast("exito", data?.mensaje || "Cliente actualizado");
      setEditClienteId(null);
      await cargarClientes();
    } catch (e) {
      mostrarToast("error", e.message || "No se pudo actualizar el cliente");
    }
  };

  const eliminarCliente = async (id_cliente) => {
    if (!window.confirm("¿Eliminar cliente? También se eliminarán sus sistemas.")) return;

    try {
      const data = await fetchJSON(`${API}&op=delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_cliente }),
      });
      mostrarToast("exito", data?.mensaje || "Cliente eliminado");

      if (modalClienteId === id_cliente) {
        cerrarModal();
      }

      await cargarClientes();
    } catch (e) {
      mostrarToast("error", e.message || "No se pudo eliminar el cliente");
    }
  };

  /* =========================
     SISTEMAS CRUD
  ========================= */

  const ensureNuevoSistema = (id_cliente) => {
    const cur = nuevoSistema?.[id_cliente];
    if (cur) return cur;

    const base = {
      nombre: "",
      descripcion: "",
      plan: "mensual",
      monto_desarrollo: "",
      monto_mensual: "",
      estado: "activo",
      fecha_inicio: "",
    };

    setNuevoSistema((p) => ({ ...p, [id_cliente]: base }));
    return base;
  };

  const onChangeNuevoSistema = (id_cliente, key, value) => {
    const base = ensureNuevoSistema(id_cliente);
    setNuevoSistema((prev) => ({
      ...prev,
      [id_cliente]: {
        ...base,
        ...prev?.[id_cliente],
        [key]: value,
      },
    }));
  };

  const crearSistema = async (id_cliente) => {
    const form = nuevoSistema[id_cliente] || ensureNuevoSistema(id_cliente);

    const nombre = (form.nombre || "").trim();
    if (!nombre) return mostrarToast("advertencia", "Ingresá el nombre del sistema");

    const payload = {
      id_cliente,
      nombre,
      descripcion: (form.descripcion || "").trim(),
      plan: (form.plan || "mensual").trim(),
      estado: (form.estado || "activo").trim(),
      fecha_inicio: (form.fecha_inicio || "").trim(),
      monto_desarrollo:
        String(form.monto_desarrollo || "").trim() === ""
          ? 0
          : Number(String(form.monto_desarrollo).replace(",", ".")),
      monto_mensual:
        String(form.monto_mensual || "").trim() === ""
          ? 0
          : Number(String(form.monto_mensual).replace(",", ".")),
    };

    setAddSubmitting(true);
    try {
      const data = await fetchJSON(`${API}&op=sistemas_create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      mostrarToast("exito", data?.mensaje || "Sistema agregado");

      // reset form
      setNuevoSistema((prev) => ({
        ...prev,
        [id_cliente]: {
          nombre: "",
          descripcion: "",
          plan: "mensual",
          monto_desarrollo: "",
          monto_mensual: "",
          estado: "activo",
          fecha_inicio: "",
        },
      }));

      await cargarSistemasCliente(id_cliente);
      setModalAddOpen(false);
    } catch (e) {
      mostrarToast("error", e.message || "No se pudo agregar el sistema");
    } finally {
      setAddSubmitting(false);
    }
  };

  const iniciarEditarSistema = (s) => {
    setEditSistemaId(s.id_sistema);
    setEditSistema({
      [s.id_sistema]: {
        nombre: s.nombre || "",
        descripcion: s.descripcion || "",
        plan: s.plan || "mensual",
        estado: s.estado || "activo",
        fecha_inicio: s.fecha_inicio || "",
        monto_desarrollo: s.monto_desarrollo ?? 0,
        monto_mensual: s.monto_mensual ?? 0,
      },
    });
  };

  const guardarEditarSistema = async (id_cliente) => {
    const id_sistema = editSistemaId;
    if (!id_sistema) return;

    const form = editSistema[id_sistema] || {};
    const nombre = (form.nombre || "").trim();
    if (!nombre) return mostrarToast("advertencia", "El nombre no puede estar vacío");

    const payload = {
      id_sistema,
      nombre,
      descripcion: (form.descripcion || "").trim(),
      plan: (form.plan || "mensual").trim(),
      estado: (form.estado || "activo").trim(),
      fecha_inicio: (form.fecha_inicio || "").trim(),
      monto_desarrollo: Number(String(form.monto_desarrollo || 0).replace(",", ".")),
      monto_mensual: Number(String(form.monto_mensual || 0).replace(",", ".")),
    };

    try {
      const data = await fetchJSON(`${API}&op=sistemas_update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      mostrarToast("exito", data?.mensaje || "Sistema actualizado");
      setEditSistemaId(null);
      await cargarSistemasCliente(id_cliente);
    } catch (e) {
      mostrarToast("error", e.message || "No se pudo actualizar el sistema");
    }
  };

  const eliminarSistema = async (id_cliente, id_sistema) => {
    if (!window.confirm("¿Eliminar este sistema?")) return;

    try {
      const data = await fetchJSON(`${API}&op=sistemas_delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_sistema }),
      });

      mostrarToast("exito", data?.mensaje || "Sistema eliminado");
      await cargarSistemasCliente(id_cliente);
    } catch (e) {
      mostrarToast("error", e.message || "No se pudo eliminar el sistema");
    }
  };

  /* =========================
     MODALES OPEN/CLOSE
  ========================= */

  const abrirSistemasModal = async (id_cliente) => {
    setModalClienteId(id_cliente);

    // ✅ SIEMPRE refrescar (evita usar state viejo)
    const lista = await cargarSistemasCliente(id_cliente);

    // ✅ precargar asignados con la lista real recién traída
    if (Array.isArray(lista) && lista.length > 0) {
      lista.forEach((s) => {
        if (asignadosPorSistema[s.id_sistema] === undefined) {
          cargarAsignadosSistema(s.id_sistema);
        }
      });
    }
  };

  const cerrarModal = () => {
    setEditSistemaId(null);
    setModalClienteId(null);
    setModalAddOpen(false);
  };

  const openAddModal = () => {
    if (!modalClienteId) return;
    ensureNuevoSistema(modalClienteId);
    setModalAddOpen(true);
  };

  const closeAddModal = () => {
    setModalAddOpen(false);
  };

  // cuando cambian sistemas del cliente abierto, asegurar carga de asignados
  useEffect(() => {
    const idc = modalClienteId;
    if (!idc) return;

    const sis = sistemas?.[idc];
    if (!Array.isArray(sis) || sis.length === 0) return;

    sis.forEach((s) => {
      if (asignadosPorSistema[s.id_sistema] === undefined) {
        cargarAsignadosSistema(s.id_sistema);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalClienteId, sistemas]);

  return (
    <div className="clientes-page">
      <div className="clientes-shell">
        {/* Header */}
        <div className="clientes-header">
          <div className="clientes-title">
            <h2>Clientes</h2>
            <div className="clientes-subtitle">
              Gestión de clientes, sistemas y asignación de trabajadores.
            </div>
          </div>

          <button className="btn-volver" onClick={() => navigate("/panel")} type="button">
            ← Volver
          </button>
        </div>

        {/* Crear cliente */}
        <div className="card card-agregar">
          <div className="card-head">
            <h3>Agregar cliente</h3>
            <span className="badge">Nuevo</span>
          </div>

          <div className="form-grid">
            <input
              placeholder="Nombre del cliente (ej: IPET 50)"
              value={nuevoCliente.nombre}
              onChange={(e) => setNuevoCliente((p) => ({ ...p, nombre: e.target.value }))}
            />
            <input
              placeholder="Notas (opcional)"
              value={nuevoCliente.notas}
              onChange={(e) => setNuevoCliente((p) => ({ ...p, notas: e.target.value }))}
            />
            <button disabled={cargando} onClick={crearCliente} type="button">
              Agregar
            </button>
          </div>
        </div>

        {/* Lista clientes */}
        <div className="clientes-lista">
          {cargando && <div className="card">Cargando...</div>}

          {!cargando && clientesOrdenados.length === 0 && (
            <div className="card">No hay clientes cargados todavía.</div>
          )}

          {clientesOrdenados.map((c) => (
            <div key={c.id_cliente} className="cliente-card">
              <div className="cliente-left">
                <div className="cliente-nombre">{c.nombre}</div>
                {c.notas ? <div className="cliente-notas">{c.notas}</div> : null}
              </div>

              <div className="cliente-actions">
                {editClienteId === c.id_cliente ? (
                  <>
                    <button onClick={guardarEditarCliente} type="button">
                      Guardar
                    </button>
                    <button className="secundario" onClick={() => setEditClienteId(null)} type="button">
                      Cancelar
                    </button>
                  </>
                ) : (
                  <>
                    <button className="secundario" onClick={() => iniciarEditarCliente(c)} type="button">
                      Editar
                    </button>
                    <button className="peligro" onClick={() => eliminarCliente(c.id_cliente)} type="button">
                      Eliminar
                    </button>
                    <button className="outline" onClick={() => abrirSistemasModal(c.id_cliente)} type="button">
                      Ver sistemas
                    </button>
                  </>
                )}
              </div>

              {editClienteId === c.id_cliente && (
                <div className="inline-edit">
                  <input
                    value={editCliente.nombre}
                    onChange={(e) => setEditCliente((p) => ({ ...p, nombre: e.target.value }))}
                    placeholder="Nombre"
                  />
                  <input
                    value={editCliente.notas}
                    onChange={(e) => setEditCliente((p) => ({ ...p, notas: e.target.value }))}
                    placeholder="Notas"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ✅ MODAL VER SISTEMAS (solo ver/editar/asignar) */}
      <SistemasModal
        open={!!modalClienteId}
        onClose={cerrarModal}
        cliente={clienteModal}
        sistemas={sisModal}
        cargando={cargandoSistemas}
        onOpenAdd={openAddModal} // ✅ abre modal agregar
      >
        {/* ✅ Lista sistemas */}
        {modalClienteId && (
          <div className="panel-block">
            <div className="block-title">Sistemas cargados</div>

            <div className="sistemas-grid">
              {sisModal.map((s) => {
                const editing = editSistemaId === s.id_sistema;
                const form = editSistema[s.id_sistema] || {};
                const asignados = asignadosPorSistema[s.id_sistema] || [];

                return (
                  <div key={s.id_sistema} className="sistema-item">
                    <div className="sistema-top">
                      <div className="sistema-title">
                        {editing ? (
                          <>
                            <input
                              value={form.nombre ?? ""}
                              onChange={(e) =>
                                setEditSistema((p) => ({
                                  ...p,
                                  [s.id_sistema]: { ...p[s.id_sistema], nombre: e.target.value },
                                }))
                              }
                              placeholder="Nombre"
                            />
                            <input
                              value={form.descripcion ?? ""}
                              onChange={(e) =>
                                setEditSistema((p) => ({
                                  ...p,
                                  [s.id_sistema]: { ...p[s.id_sistema], descripcion: e.target.value },
                                }))
                              }
                              placeholder="Descripción"
                              style={{ marginTop: 8 }}
                            />
                          </>
                        ) : (
                          <>
                            <div className="sistema-nombre">{s.nombre}</div>
                            {s.descripcion ? <div className="sistema-meta">{s.descripcion}</div> : null}
                          </>
                        )}
                      </div>

                      <div className="sistema-actions">
                        {editing ? (
                          <>
                            <button onClick={() => guardarEditarSistema(modalClienteId)} type="button">
                              Guardar
                            </button>
                            <button className="secundario" onClick={() => setEditSistemaId(null)} type="button">
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <>
                            <button className="secundario" onClick={() => iniciarEditarSistema(s)} type="button">
                              Editar
                            </button>
                            <button
                              className="peligro"
                              onClick={() => eliminarSistema(modalClienteId, s.id_sistema)}
                              type="button"
                            >
                              Eliminar
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* datos / edición */}
                    {editing ? (
                      <div className="sistema-form">
                        <select
                          value={form.plan ?? "mensual"}
                          onChange={(e) =>
                            setEditSistema((p) => ({
                              ...p,
                              [s.id_sistema]: { ...p[s.id_sistema], plan: e.target.value },
                            }))
                          }
                        >
                          <option value="mensual">Mensual</option>
                          <option value="anual">Anual</option>
                          <option value="soporte">Soporte</option>
                          <option value="proyecto">Proyecto</option>
                        </select>

                        <select
                          value={form.estado ?? "activo"}
                          onChange={(e) =>
                            setEditSistema((p) => ({
                              ...p,
                              [s.id_sistema]: { ...p[s.id_sistema], estado: e.target.value },
                            }))
                          }
                        >
                          <option value="activo">Activo</option>
                          <option value="pausado">Pausado</option>
                          <option value="finalizado">Finalizado</option>
                        </select>

                        <input
                          value={form.monto_desarrollo ?? 0}
                          onChange={(e) =>
                            setEditSistema((p) => ({
                              ...p,
                              [s.id_sistema]: { ...p[s.id_sistema], monto_desarrollo: e.target.value },
                            }))
                          }
                          inputMode="numeric"
                          placeholder="Monto desarrollo"
                        />

                        <input
                          value={form.monto_mensual ?? 0}
                          onChange={(e) =>
                            setEditSistema((p) => ({
                              ...p,
                              [s.id_sistema]: { ...p[s.id_sistema], monto_mensual: e.target.value },
                            }))
                          }
                          inputMode="numeric"
                          placeholder="Monto mensual base"
                        />

                        <input
                          type="date"
                          value={form.fecha_inicio ?? ""}
                          onChange={(e) =>
                            setEditSistema((p) => ({
                              ...p,
                              [s.id_sistema]: { ...p[s.id_sistema], fecha_inicio: e.target.value },
                            }))
                          }
                        />
                      </div>
                    ) : (
                      <div className="sistema-info">
                        <div className="pill">Plan: <b>{s.plan}</b></div>
                        <div className="pill">Estado: <b>{s.estado}</b></div>
                        <div className="pill">
                          Desarrollo:{" "}
                          <b>${Number(s.monto_desarrollo || 0).toLocaleString("es-AR")}</b>
                        </div>
                        <div className="pill">
                          Base mes:{" "}
                          <b>${Number(s.monto_mensual || 0).toLocaleString("es-AR")}</b>
                        </div>
                        <div className="pill">Inicio: <b>{s.fecha_inicio || "-"}</b></div>
                      </div>
                    )}

                    {/* asignación */}
                    {!editing && (
                      <div className="asignacion">
                        <div className="asignacion-title">Trabajadores asignados</div>

                        <div className="asignacion-row">
                          <select
                            value={selectTrabajador?.[s.id_sistema] || ""}
                            onChange={(e) =>
                              setSelectTrabajador((p) => ({
                                ...p,
                                [s.id_sistema]: e.target.value,
                              }))
                            }
                          >
                            <option value="">Seleccionar trabajador...</option>
                            {trabajadores.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.apellido}, {t.nombre}
                              </option>
                            ))}
                          </select>

                          <button type="button" onClick={() => asignarTrabajador(s.id_sistema)}>
                            Asignar
                          </button>
                        </div>

                        <div className="asignados-list">
                          {asignados.length === 0 ? (
                            <div className="mini-card">Sin trabajadores asignados.</div>
                          ) : (
                            asignados.map((t) => (
                              <div key={t.id} className="mini-card mini-row">
                                <div className="mini-text">
                                  <div className="mini-name">
                                    {t.apellido}, {t.nombre}
                                  </div>
                                  <div className="mini-sub">
                                    Rol: <b>{t.rol}</b>
                                  </div>
                                </div>
                                <button
                                  className="peligro"
                                  type="button"
                                  onClick={() => quitarTrabajador(s.id_sistema, t.id)}
                                >
                                  Quitar
                                </button>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </SistemasModal>

      {/* ✅ MODAL AGREGAR SISTEMA (form separado) */}
      <AgregarSistemaModal
        open={modalAddOpen}
        onClose={closeAddModal}
        cliente={clienteModal}
        form={
          modalClienteId
            ? nuevoSistema?.[modalClienteId] || ensureNuevoSistema(modalClienteId)
            : null
        }
        onChange={(key, value) => modalClienteId && onChangeNuevoSistema(modalClienteId, key, value)}
        onSubmit={() => modalClienteId && crearSistema(modalClienteId)}
        submitting={addSubmitting}
      />

      {toast && (
        <Toast
          tipo={toast.tipo}
          mensaje={toast.mensaje}
          duracion={toast.duracion}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
