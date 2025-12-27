// src/components/Clientes/Clientes.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import BASE_URL from "../../config/config";
import Toast from "../Global/Toast";
import "./clientes.css";

const API = `${BASE_URL}/api.php?action=clientes`;

export default function Clientes() {
  const navigate = useNavigate();

  const [toast, setToast] = useState(null);
  const mostrarToast = (tipo, mensaje, duracion = 3000) =>
    setToast({ tipo, mensaje, duracion });

  const [cargando, setCargando] = useState(false);
  const [clientes, setClientes] = useState([]);
  const [openClienteId, setOpenClienteId] = useState(null);

  // formularios clientes
  const [nuevoCliente, setNuevoCliente] = useState({ nombre: "", notas: "" });
  const [editClienteId, setEditClienteId] = useState(null);
  const [editCliente, setEditCliente] = useState({ nombre: "", notas: "" });

  // sistemas por cliente
  const [sistemas, setSistemas] = useState({}); // { [id_cliente]: [] }
  const [nuevoSistema, setNuevoSistema] = useState({}); // { [id_cliente]: form }
  const [editSistema, setEditSistema] = useState({}); // { [id_sistema]: form }
  const [editSistemaId, setEditSistemaId] = useState(null);

  const clientesOrdenados = useMemo(() => {
    return [...clientes].sort((a, b) =>
      String(a.nombre || "").localeCompare(String(b.nombre || ""), "es")
    );
  }, [clientes]);

  const fetchJSON = async (url, opts) => {
    const res = await fetch(url, opts);
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    // tu API siempre devuelve 200, entonces chequeamos exito
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
    try {
      const data = await fetchJSON(
        `${API}&op=sistemas_list&id_cliente=${id_cliente}`,
        { method: "GET" }
      );
      setSistemas((prev) => ({
        ...prev,
        [id_cliente]: Array.isArray(data?.sistemas) ? data.sistemas : [],
      }));
    } catch (e) {
      mostrarToast("error", e.message || "No se pudieron cargar los sistemas");
    }
  };

  useEffect(() => {
    cargarClientes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleOpen = async (id_cliente) => {
    const next = openClienteId === id_cliente ? null : id_cliente;
    setOpenClienteId(next);
    if (next && !sistemas[next]) {
      await cargarSistemasCliente(next);
    }
  };

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
      setOpenClienteId(null);
      await cargarClientes();
    } catch (e) {
      mostrarToast("error", e.message || "No se pudo eliminar el cliente");
    }
  };

  /* =========================
     SISTEMAS CRUD (por cliente)
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

    try {
      const data = await fetchJSON(`${API}&op=sistemas_create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      mostrarToast("exito", data?.mensaje || "Sistema agregado");
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
    } catch (e) {
      mostrarToast("error", e.message || "No se pudo agregar el sistema");
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
    if (!nombre)
      return mostrarToast("advertencia", "El nombre del sistema no puede estar vacío");

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

  return (
    <div className="clientes-page">
      {/* Header */}
      <div className="clientes-header">
        <h2>Clientes</h2>
        <button className="btn-volver" onClick={() => navigate("/panel")} type="button">
          ← Volver
        </button>
      </div>

      {/* Crear cliente */}
      <div className="card card-agregar">
        <h3>Agregar cliente</h3>

        <div className="form-grid">
          <input
            placeholder="Nombre del cliente (ej: IPET 50)"
            value={nuevoCliente.nombre}
            onChange={(e) =>
              setNuevoCliente((p) => ({ ...p, nombre: e.target.value }))
            }
          />
          <input
            placeholder="Notas (opcional)"
            value={nuevoCliente.notas}
            onChange={(e) =>
              setNuevoCliente((p) => ({ ...p, notas: e.target.value }))
            }
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

        {clientesOrdenados.map((c) => {
          const isOpen = openClienteId === c.id_cliente;
          const sis = sistemas[c.id_cliente] || [];

          return (
            <div key={c.id_cliente} className="cliente-card">
              {/* Header cliente */}
              <div className="cliente-header">
                <div>
                  <div className="cliente-nombre">{c.nombre}</div>
                  {c.notas ? <div className="cliente-notas">{c.notas}</div> : null}
                </div>

                <div className="cliente-actions">
                  {editClienteId === c.id_cliente ? (
                    <>
                      <button onClick={guardarEditarCliente} type="button">
                        Guardar
                      </button>
                      <button
                        className="secundario"
                        onClick={() => setEditClienteId(null)}
                        type="button"
                      >
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="secundario"
                        onClick={() => iniciarEditarCliente(c)}
                        type="button"
                      >
                        Editar
                      </button>
                      <button
                        className="peligro"
                        onClick={() => eliminarCliente(c.id_cliente)}
                        type="button"
                      >
                        Eliminar
                      </button>
                      <button
                        onClick={() => toggleOpen(c.id_cliente)}
                        type="button"
                      >
                        {isOpen ? "Ocultar sistemas" : "Ver sistemas"}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Edit cliente */}
              {editClienteId === c.id_cliente && (
                <div style={{ marginTop: 10 }} className="sistema-form">
                  <input
                    value={editCliente.nombre}
                    onChange={(e) =>
                      setEditCliente((p) => ({ ...p, nombre: e.target.value }))
                    }
                    placeholder="Nombre"
                  />
                  <input
                    value={editCliente.notas}
                    onChange={(e) =>
                      setEditCliente((p) => ({ ...p, notas: e.target.value }))
                    }
                    placeholder="Notas"
                  />
                </div>
              )}

              {/* Sistemas del cliente */}
              {isOpen && (
                <div className="sistemas-container">
                  <h4>Sistemas de {c.nombre}</h4>

                  {/* Agregar sistema */}
                  <div className="sistema-form">
                    <input
                      placeholder="Nombre del sistema (ej: Mesas de examen)"
                      value={nuevoSistema?.[c.id_cliente]?.nombre || ""}
                      onChange={(e) =>
                        onChangeNuevoSistema(c.id_cliente, "nombre", e.target.value)
                      }
                    />

                    <input
                      placeholder="Descripción (opcional)"
                      value={nuevoSistema?.[c.id_cliente]?.descripcion || ""}
                      onChange={(e) =>
                        onChangeNuevoSistema(
                          c.id_cliente,
                          "descripcion",
                          e.target.value
                        )
                      }
                    />

                    <select
                      value={nuevoSistema?.[c.id_cliente]?.plan || "mensual"}
                      onChange={(e) =>
                        onChangeNuevoSistema(c.id_cliente, "plan", e.target.value)
                      }
                    >
                      <option value="mensual">Mensual</option>
                      <option value="anual">Anual</option>
                      <option value="soporte">Soporte</option>
                      <option value="proyecto">Proyecto</option>
                    </select>

                    <select
                      value={nuevoSistema?.[c.id_cliente]?.estado || "activo"}
                      onChange={(e) =>
                        onChangeNuevoSistema(c.id_cliente, "estado", e.target.value)
                      }
                    >
                      <option value="activo">Activo</option>
                      <option value="pausado">Pausado</option>
                      <option value="finalizado">Finalizado</option>
                    </select>

                    <input
                      placeholder="Monto desarrollo (ej: 400000)"
                      value={nuevoSistema?.[c.id_cliente]?.monto_desarrollo || ""}
                      onChange={(e) =>
                        onChangeNuevoSistema(
                          c.id_cliente,
                          "monto_desarrollo",
                          e.target.value
                        )
                      }
                      inputMode="numeric"
                    />

                    <input
                      placeholder="Monto mensual base (ej: 35000)"
                      value={nuevoSistema?.[c.id_cliente]?.monto_mensual || ""}
                      onChange={(e) =>
                        onChangeNuevoSistema(
                          c.id_cliente,
                          "monto_mensual",
                          e.target.value
                        )
                      }
                      inputMode="numeric"
                    />

                    <input
                      type="date"
                      value={nuevoSistema?.[c.id_cliente]?.fecha_inicio || ""}
                      onChange={(e) =>
                        onChangeNuevoSistema(
                          c.id_cliente,
                          "fecha_inicio",
                          e.target.value
                        )
                      }
                    />

                    <button onClick={() => crearSistema(c.id_cliente)} type="button">
                      Agregar sistema
                    </button>
                  </div>

                  {/* Lista sistemas */}
                  {sis.length === 0 ? (
                    <div className="card" style={{ padding: 12 }}>
                      Este cliente todavía no tiene sistemas cargados.
                    </div>
                  ) : (
                    <div style={{ display: "grid", gap: 10 }}>
                      {sis.map((s) => {
                        const editing = editSistemaId === s.id_sistema;
                        const form = editSistema[s.id_sistema] || {};

                        return (
                          <div key={s.id_sistema} className="sistema-item">
                            {/* TITULO / DESC */}
                            <div>
                              {editing ? (
                                <>
                                  <input
                                    value={form.nombre ?? ""}
                                    onChange={(e) =>
                                      setEditSistema((p) => ({
                                        ...p,
                                        [s.id_sistema]: {
                                          ...p[s.id_sistema],
                                          nombre: e.target.value,
                                        },
                                      }))
                                    }
                                    placeholder="Nombre"
                                  />
                                  <div style={{ height: 8 }} />
                                  <input
                                    value={form.descripcion ?? ""}
                                    onChange={(e) =>
                                      setEditSistema((p) => ({
                                        ...p,
                                        [s.id_sistema]: {
                                          ...p[s.id_sistema],
                                          descripcion: e.target.value,
                                        },
                                      }))
                                    }
                                    placeholder="Descripción"
                                  />
                                </>
                              ) : (
                                <>
                                  <div className="sistema-nombre">{s.nombre}</div>
                                  {s.descripcion ? (
                                    <div className="sistema-meta">{s.descripcion}</div>
                                  ) : null}
                                </>
                              )}
                            </div>

                            {/* CAMPOS */}
                            {editing ? (
                              <div className="sistema-form">
                                <select
                                  value={form.plan ?? "mensual"}
                                  onChange={(e) =>
                                    setEditSistema((p) => ({
                                      ...p,
                                      [s.id_sistema]: {
                                        ...p[s.id_sistema],
                                        plan: e.target.value,
                                      },
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
                                      [s.id_sistema]: {
                                        ...p[s.id_sistema],
                                        estado: e.target.value,
                                      },
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
                                      [s.id_sistema]: {
                                        ...p[s.id_sistema],
                                        monto_desarrollo: e.target.value,
                                      },
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
                                      [s.id_sistema]: {
                                        ...p[s.id_sistema],
                                        monto_mensual: e.target.value,
                                      },
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
                                      [s.id_sistema]: {
                                        ...p[s.id_sistema],
                                        fecha_inicio: e.target.value,
                                      },
                                    }))
                                  }
                                />
                              </div>
                            ) : (
                              <div style={{ display: "grid", gap: 6 }}>
                                <div className="sistema-meta">
                                  Plan: <b>{s.plan}</b>
                                </div>
                                <div className="sistema-meta">
                                  Estado: <b>{s.estado}</b>
                                </div>
                                <div className="sistema-meta">
                                  Desarrollo:{" "}
                                  <b>
                                    ${Number(s.monto_desarrollo || 0).toLocaleString("es-AR")}
                                  </b>
                                </div>
                                <div className="sistema-meta">
                                  Base mes:{" "}
                                  <b>
                                    ${Number(s.monto_mensual || 0).toLocaleString("es-AR")}
                                  </b>
                                </div>
                                <div className="sistema-meta">
                                  Inicio: <b>{s.fecha_inicio || "-"}</b>
                                </div>
                              </div>
                            )}

                            {/* ACCIONES */}
                            <div className="sistema-actions">
                              {editing ? (
                                <>
                                  <button
                                    onClick={() => guardarEditarSistema(c.id_cliente)}
                                    type="button"
                                  >
                                    Guardar
                                  </button>
                                  <button
                                    className="secundario"
                                    onClick={() => setEditSistemaId(null)}
                                    type="button"
                                  >
                                    Cancelar
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    className="secundario"
                                    onClick={() => iniciarEditarSistema(s)}
                                    type="button"
                                  >
                                    Editar
                                  </button>
                                  <button
                                    className="peligro"
                                    onClick={() => eliminarSistema(c.id_cliente, s.id_sistema)}
                                    type="button"
                                  >
                                    Eliminar
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

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
