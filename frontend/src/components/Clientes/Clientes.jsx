// src/components/Clientes/Clientes.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import BASE_URL from "../../config/config";
import Toast from "../Global/Toast";
import "./clientes.css";

// Modales
import SistemasModal from "./modales/SistemasModal";
import AgregarSistemaModal from "./modales/AgregarSistemaModal";
import EliminarClienteModal from "./modales/EliminarClienteModal";
import QuitarTrabajadorModal from "./modales/QuitarTrabajadorModal";
import EliminarSistemaModal from "./modales/EliminarSistemaModal";

// ✅ NUEVO: modal presupuesto
import GenerarPresupuestoModal from "./modales/GenerarPresupuestoModal";

// ✅ mismos globales que Previas (estructura/fondo)
import "../Global/roots.css";

// ✅ iconos
import { FaPen, FaTrashAlt, FaCubes, FaSave, FaTimes } from "react-icons/fa";

const API = `${BASE_URL}/api.php?action=clientes`;

/**
 * ✅ Toast robusto, estilo Pagos/Reportes:
 * - show boolean
 * - key incremental para "re-disparar" el mismo mensaje
 * - SOLO toasts de ÉXITO para acciones: agregar / editar / eliminar / asignar / quitar
 * - errores: podés dejarlos (yo los dejo) para no quedarte ciego al fallar backend
 */
export default function Clientes() {
  const navigate = useNavigate();

  const [toast, setToast] = useState({
    show: false,
    tipo: "exito",
    mensaje: "",
    duracion: 2600,
    key: 0,
  });

  const showToast = useCallback((tipo, mensaje, duracion = 2600) => {
    setToast((t) => ({
      show: true,
      tipo,
      mensaje,
      duracion,
      key: (t.key || 0) + 1,
    }));
  }, []);

  const closeToast = useCallback(() => {
    setToast((t) => ({ ...t, show: false }));
  }, []);

  const [cargando, setCargando] = useState(false);
  const [clientes, setClientes] = useState([]);

  // ✅ modal ver sistemas
  const [modalClienteId, setModalClienteId] = useState(null);
  const [cargandoSistemas, setCargandoSistemas] = useState(false);

  // ✅ modal agregar sistema
  const [modalAddOpen, setModalAddOpen] = useState(false);
  const [addSubmitting, setAddSubmitting] = useState(false);

  // ✅ modal eliminar cliente
  const [delOpen, setDelOpen] = useState(false);
  const [delCliente, setDelCliente] = useState(null);
  const [delLoading, setDelLoading] = useState(false);

  // ✅ modal quitar trabajador
  const [qtOpen, setQtOpen] = useState(false);
  const [qtSistema, setQtSistema] = useState(null);
  const [qtTrabajador, setQtTrabajador] = useState(null);
  const [qtLoading, setQtLoading] = useState(false);

  // ✅ modal eliminar sistema
  const [sysDelOpen, setSysDelOpen] = useState(false);
  const [sysDelSistema, setSysDelSistema] = useState(null);
  const [sysDelLoading, setSysDelLoading] = useState(false);

  // ✅ NUEVO: modal presupuesto
  const [presOpen, setPresOpen] = useState(false);

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

  // =========================
  // Fetch robusto (evita reventar si viene HTML/errores)
  // =========================
  const fetchJSON = useCallback(async (url, opts) => {
    const res = await fetch(url, opts);
    const text = await res.text();

    // si vino html (warning php)
    const trimmed = (text || "").trim();
    if (trimmed.startsWith("<")) {
      throw new Error("Backend devolvió HTML (error PHP). Revisá logs.");
    }

    let data = null;
    try {
      data = JSON.parse(trimmed || "{}");
    } catch {
      data = null;
    }

    if (!res.ok || !data || data.exito === false) {
      const msg = data?.mensaje || data?.error || `HTTP ${res.status}`;
      throw new Error(msg);
    }

    return data;
  }, []);

  const cargarClientes = useCallback(async () => {
    setCargando(true);
    try {
      const data = await fetchJSON(`${API}&op=list`, { method: "GET" });
      setClientes(Array.isArray(data?.clientes) ? data.clientes : []);
    } catch (e) {
      // (si querés SOLO éxito, podés comentar esto)
      showToast("error", e.message || "No se pudieron cargar los clientes");
    } finally {
      setCargando(false);
    }
  }, [fetchJSON, showToast]);

  const cargarSistemasCliente = useCallback(
    async (id_cliente) => {
      setCargandoSistemas(true);
      try {
        const data = await fetchJSON(
          `${API}&op=sistemas_list&id_cliente=${id_cliente}`,
          { method: "GET" }
        );
        const lista = Array.isArray(data?.sistemas) ? data.sistemas : [];
        setSistemas((prev) => ({ ...prev, [id_cliente]: lista }));
        return lista;
      } catch (e) {
        showToast("error", e.message || "No se pudieron cargar los sistemas");
        return [];
      } finally {
        setCargandoSistemas(false);
      }
    },
    [fetchJSON, showToast]
  );

  const cargarTrabajadores = useCallback(async () => {
    try {
      const data = await fetchJSON(`${API}&op=trabajadores_list`, {
        method: "GET",
      });
      setTrabajadores(Array.isArray(data?.trabajadores) ? data.trabajadores : []);
    } catch (e) {
      showToast("error", e.message || "No se pudieron cargar los trabajadores");
    }
  }, [fetchJSON, showToast]);

  const cargarAsignadosSistema = useCallback(
    async (id_sistema) => {
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
        showToast("error", e.message || "No se pudieron cargar los asignados");
      }
    },
    [fetchJSON, showToast]
  );

  const asignarTrabajador = useCallback(
    async (id_sistema) => {
      const id_trabajador = Number(selectTrabajador?.[id_sistema] || 0);
      if (!id_trabajador)
        return showToast("advertencia", "Elegí un trabajador");

      try {
        const data = await fetchJSON(`${API}&op=sistema_trabajadores_add`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id_sistema, id_trabajador }),
        });

        // ✅ ÉXITO
        showToast("exito", data?.mensaje || "Trabajador asignado");
        setSelectTrabajador((p) => ({ ...p, [id_sistema]: "" }));
        await cargarAsignadosSistema(id_sistema);
      } catch (e) {
        showToast("error", e.message || "No se pudo asignar el trabajador");
      }
    },
    [API, fetchJSON, selectTrabajador, showToast, cargarAsignadosSistema]
  );

  /* =========================
     MODALES: QUITAR / ELIMINAR SISTEMA
  ========================= */

  const abrirQuitarTrabajador = useCallback((sistema, trabajador) => {
    setQtSistema(sistema);
    setQtTrabajador(trabajador);
    setQtOpen(true);
  }, []);

  const confirmarQuitarTrabajador = useCallback(
    async (sistema, trabajador) => {
      const id_sistema = sistema?.id_sistema;
      const id_trabajador = trabajador?.id;

      if (!id_sistema || !id_trabajador) return false;

      setQtLoading(true);
      try {
        const data = await fetchJSON(`${API}&op=sistema_trabajadores_remove`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id_sistema, id_trabajador }),
        });

        // ✅ ÉXITO
        showToast("exito", data?.mensaje || "Trabajador quitado");
        await cargarAsignadosSistema(id_sistema);

        setQtOpen(false);
        setQtSistema(null);
        setQtTrabajador(null);
        return true;
      } catch (e) {
        showToast("error", e.message || "No se pudo quitar el trabajador");
        return false;
      } finally {
        setQtLoading(false);
      }
    },
    [fetchJSON, showToast, cargarAsignadosSistema]
  );

  const abrirEliminarSistema = useCallback((sistema) => {
    setSysDelSistema(sistema);
    setSysDelOpen(true);
  }, []);

  const confirmarEliminarSistema = useCallback(
    async (sistema) => {
      const id_sistema = sistema?.id_sistema;
      if (!id_sistema) return false;

      setSysDelLoading(true);
      try {
        const data = await fetchJSON(`${API}&op=sistemas_delete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id_sistema }),
        });

        // ✅ ÉXITO
        showToast("exito", data?.mensaje || "Sistema eliminado");

        if (modalClienteId) await cargarSistemasCliente(modalClienteId);

        setSysDelOpen(false);
        setSysDelSistema(null);
        return true;
      } catch (e) {
        showToast("error", e.message || "No se pudo eliminar el sistema");
        return false;
      } finally {
        setSysDelLoading(false);
      }
    },
    [fetchJSON, showToast, modalClienteId, cargarSistemasCliente]
  );

  useEffect(() => {
    cargarClientes();
    cargarTrabajadores();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* =========================
     CLIENTES CRUD
  ========================= */

  const crearCliente = useCallback(async () => {
    const nombre = (nuevoCliente.nombre || "").trim();
    if (!nombre) return showToast("advertencia", "Ingresá el nombre del cliente");

    try {
      const data = await fetchJSON(`${API}&op=create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre, notas: (nuevoCliente.notas || "").trim() }),
      });

      // ✅ ÉXITO
      showToast("exito", data?.mensaje || "Cliente creado");
      setNuevoCliente({ nombre: "", notas: "" });
      await cargarClientes();
    } catch (e) {
      showToast("error", e.message || "No se pudo crear el cliente");
    }
  }, [nuevoCliente, fetchJSON, showToast, cargarClientes]);

  const iniciarEditarCliente = useCallback((c) => {
    setEditClienteId(c.id_cliente);
    setEditCliente({ nombre: c.nombre || "", notas: c.notas || "" });
  }, []);

  const guardarEditarCliente = useCallback(async () => {
    const id_cliente = editClienteId;
    if (!id_cliente) return;

    const nombre = (editCliente.nombre || "").trim();
    if (!nombre) return showToast("advertencia", "El nombre no puede estar vacío");

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

      // ✅ ÉXITO
      showToast("exito", data?.mensaje || "Cliente actualizado");
      setEditClienteId(null);
      await cargarClientes();
    } catch (e) {
      showToast("error", e.message || "No se pudo actualizar el cliente");
    }
  }, [editClienteId, editCliente, fetchJSON, showToast, cargarClientes]);

  // ✅ ahora sin window.confirm, lo maneja el modal
  const abrirEliminarCliente = useCallback((c) => {
    setDelCliente(c);
    setDelOpen(true);
  }, []);

  const confirmarEliminarCliente = useCallback(
    async (cliente) => {
      const id_cliente = cliente?.id_cliente;
      if (!id_cliente) return false;

      setDelLoading(true);
      try {
        const data = await fetchJSON(`${API}&op=delete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id_cliente }),
        });

        // ✅ ÉXITO
        showToast("exito", data?.mensaje || "Cliente eliminado");

        if (modalClienteId === id_cliente) cerrarModal();
        await cargarClientes();

        setDelOpen(false);
        setDelCliente(null);
        return true;
      } catch (e) {
        showToast("error", e.message || "No se pudo eliminar el cliente");
        return false;
      } finally {
        setDelLoading(false);
      }
    },
    [fetchJSON, showToast, modalClienteId, cargarClientes]
  );

  /* =========================
     SISTEMAS CRUD
  ========================= */

  const ensureNuevoSistema = useCallback(
    (id_cliente) => {
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
    },
    [nuevoSistema]
  );

  const onChangeNuevoSistema = useCallback(
    (id_cliente, key, value) => {
      const base = ensureNuevoSistema(id_cliente);
      setNuevoSistema((prev) => ({
        ...prev,
        [id_cliente]: {
          ...base,
          ...prev?.[id_cliente],
          [key]: value,
        },
      }));
    },
    [ensureNuevoSistema]
  );

  const crearSistema = useCallback(
    async (id_cliente) => {
      const form = nuevoSistema[id_cliente] || ensureNuevoSistema(id_cliente);

      const nombre = (form.nombre || "").trim();
      if (!nombre) return showToast("advertencia", "Ingresá el nombre del sistema");

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

        // ✅ ÉXITO
        showToast("exito", data?.mensaje || "Sistema agregado");

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
        showToast("error", e.message || "No se pudo agregar el sistema");
      } finally {
        setAddSubmitting(false);
      }
    },
    [
      nuevoSistema,
      ensureNuevoSistema,
      fetchJSON,
      showToast,
      cargarSistemasCliente,
    ]
  );

  const iniciarEditarSistema = useCallback((s) => {
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
  }, []);

  const guardarEditarSistema = useCallback(
    async (id_cliente) => {
      const id_sistema = editSistemaId;
      if (!id_sistema) return;

      const form = editSistema[id_sistema] || {};
      const nombre = (form.nombre || "").trim();
      if (!nombre) return showToast("advertencia", "El nombre no puede estar vacío");

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

        // ✅ ÉXITO
        showToast("exito", data?.mensaje || "Sistema actualizado");
        setEditSistemaId(null);
        await cargarSistemasCliente(id_cliente);
      } catch (e) {
        showToast("error", e.message || "No se pudo actualizar el sistema");
      }
    },
    [editSistemaId, editSistema, fetchJSON, showToast, cargarSistemasCliente]
  );

  /* =========================
     MODALES OPEN/CLOSE
  ========================= */

  const abrirSistemasModal = useCallback(
    async (id_cliente) => {
      setModalClienteId(id_cliente);
      const lista = await cargarSistemasCliente(id_cliente);

      if (Array.isArray(lista) && lista.length > 0) {
        lista.forEach((s) => {
          if (asignadosPorSistema[s.id_sistema] === undefined) {
            cargarAsignadosSistema(s.id_sistema);
          }
        });
      }
    },
    [cargarSistemasCliente, asignadosPorSistema, cargarAsignadosSistema]
  );

  const cerrarModal = useCallback(() => {
    setEditSistemaId(null);
    setModalClienteId(null);
    setModalAddOpen(false);
  }, []);

  const openAddModal = useCallback(() => {
    if (!modalClienteId) return;
    ensureNuevoSistema(modalClienteId);
    setModalAddOpen(true);
  }, [modalClienteId, ensureNuevoSistema]);

  const closeAddModal = useCallback(() => setModalAddOpen(false), []);

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
    <div className="glob-profesor-container clientes-wrap">
      <div className="glob-profesor-box clientes-box">
        {/* ✅ TOAST */}
        {toast.show ? (
          <Toast
            key={toast.key}
            tipo={toast.tipo}
            mensaje={toast.mensaje}
            duracion={toast.duracion}
            onClose={closeToast}
          />
        ) : null}

        <div className="clientes-shell">
          <div className="clientes-header">
            <div className="clientes-title">
              <h2>Clientes</h2>
              <div className="clientes-subtitle">
                Gestión de clientes, sistemas y asignación de trabajadores.
              </div>
            </div>

            {/* ✅ BOTONES HEADER */}
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button
                className="btn-volver"
                onClick={() => navigate("/panel")}
                type="button"
              >
                ← Volver
              </button>

              <button
                className="btn-volver"
                onClick={() => setPresOpen(true)}
                type="button"
                title="Generar presupuesto en PDF"
                aria-label="Generar presupuesto"
              >
                💼 Generar presupuesto
              </button>
            </div>
          </div>

          <div className="card card-agregar">
            <div className="card-head">
              <h3>Agregar cliente</h3>
              <span className="badge">Nuevo</span>
            </div>

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
                      <button
                        className="icon-btn"
                        onClick={guardarEditarCliente}
                        type="button"
                        aria-label="Guardar"
                        title="Guardar"
                      >
                        <FaSave />
                      </button>

                      <button
                        className="icon-btn secundario"
                        onClick={() => setEditClienteId(null)}
                        type="button"
                        aria-label="Cancelar"
                        title="Cancelar"
                      >
                        <FaTimes />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="icon-btn secundario"
                        onClick={() => iniciarEditarCliente(c)}
                        type="button"
                        aria-label="Editar"
                        title="Editar"
                      >
                        <FaPen />
                      </button>

                      <button
                        className="icon-btn peligro"
                        onClick={() => abrirEliminarCliente(c)}
                        type="button"
                        aria-label="Eliminar"
                        title="Eliminar"
                      >
                        <FaTrashAlt />
                      </button>

                      <button
                        className="icon-btn outline"
                        onClick={() => abrirSistemasModal(c.id_cliente)}
                        type="button"
                        aria-label="Ver sistemas"
                        title="Ver sistemas"
                      >
                        <FaCubes />
                      </button>
                    </>
                  )}
                </div>

                {editClienteId === c.id_cliente && (
                  <div className="inline-edit">
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
              </div>
            ))}
          </div>
        </div>

        {/* ✅ MODAL ELIMINAR CLIENTE */}
        <EliminarClienteModal
          open={delOpen}
          onClose={() => {
            if (delLoading) return;
            setDelOpen(false);
            setDelCliente(null);
          }}
          onConfirm={confirmarEliminarCliente}
          loading={delLoading}
          cliente={delCliente}
          mensaje="También se eliminarán sus sistemas."
        />

        {/* ✅ MODAL ELIMINAR SISTEMA */}
        <EliminarSistemaModal
          open={sysDelOpen}
          onClose={() => {
            if (sysDelLoading) return;
            setSysDelOpen(false);
            setSysDelSistema(null);
          }}
          onConfirm={confirmarEliminarSistema}
          loading={sysDelLoading}
          sistema={sysDelSistema}
          mensaje="Esta acción no se puede deshacer."
        />

        {/* ✅ MODAL QUITAR TRABAJADOR */}
        <QuitarTrabajadorModal
          open={qtOpen}
          onClose={() => {
            if (qtLoading) return;
            setQtOpen(false);
            setQtSistema(null);
            setQtTrabajador(null);
          }}
          onConfirm={confirmarQuitarTrabajador}
          loading={qtLoading}
          sistema={qtSistema}
          trabajador={qtTrabajador}
          mensaje="Esta acción solo lo desasigna, no elimina el trabajador."
        />

        {/* ✅ MODAL VER SISTEMAS */}
        <SistemasModal
          open={!!modalClienteId}
          onClose={cerrarModal}
          cliente={clienteModal}
          sistemas={sisModal}
          cargando={cargandoSistemas}
          onOpenAdd={openAddModal}
        >
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
                                    [s.id_sistema]: {
                                      ...p[s.id_sistema],
                                      nombre: e.target.value,
                                    },
                                  }))
                                }
                                placeholder="Nombre"
                              />
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
                                style={{ marginTop: 8 }}
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

                        <div className="sistema-actions">
                          {editing ? (
                            <>
                              <button
                                onClick={() => guardarEditarSistema(modalClienteId)}
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
                                onClick={() => abrirEliminarSistema(s)}
                                type="button"
                              >
                                Eliminar
                              </button>
                            </>
                          )}
                        </div>
                      </div>

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
                        <div className="sistema-info">
                          <div className="pill">
                            Plan: <b>{s.plan}</b>
                          </div>
                          <div className="pill">
                            Estado: <b>{s.estado}</b>
                          </div>
                          <div className="pill">
                            Desarrollo:{" "}
                            <b>${Number(s.monto_desarrollo || 0).toLocaleString("es-AR")}</b>
                          </div>
                          <div className="pill">
                            Base mes:{" "}
                            <b>${Number(s.monto_mensual || 0).toLocaleString("es-AR")}</b>
                          </div>
                          <div className="pill">
                            Inicio: <b>{s.fecha_inicio || "-"}</b>
                          </div>
                        </div>
                      )}

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

                            <button
                              type="button"
                              onClick={() => asignarTrabajador(s.id_sistema)}
                            >
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
                                    onClick={() => abrirQuitarTrabajador(s, t)}
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

        {/* ✅ MODAL AGREGAR SISTEMA */}
        <AgregarSistemaModal
          open={modalAddOpen}
          onClose={closeAddModal}
          cliente={clienteModal}
          form={
            modalClienteId
              ? nuevoSistema?.[modalClienteId] || ensureNuevoSistema(modalClienteId)
              : null
          }
          onChange={(key, value) =>
            modalClienteId && onChangeNuevoSistema(modalClienteId, key, value)
          }
          onSubmit={() => modalClienteId && crearSistema(modalClienteId)}
          submitting={addSubmitting}
        />

        {/* ✅ NUEVO: MODAL GENERAR PRESUPUESTO */}
        <GenerarPresupuestoModal
          open={presOpen}
          onClose={() => setPresOpen(false)}
          // ✅ si el modal quiere disparar toasts, lo conectamos al showToast
          onToast={(tipo, msg) => showToast(tipo, msg)}
        />
      </div>
    </div>
  );
}
