import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import BASE_URL from "../../config/config";
import "./Trabajadores.css";

const ROLES = [
  { value: "admin", label: "Admin" },
  { value: "desarrollador", label: "Desarrollador" },
  { value: "soporte", label: "Soporte" },
  { value: "vista", label: "Vista" },
];

const emptyForm = {
  id: null,
  nombre: "",
  apellido: "",
  email: "",
  rol: "vista",
  alias_pago: "",
  activo: 1,
};

export default function Trabajadores() {
  const navigate = useNavigate();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const [q, setQ] = useState("");
  const [verInactivos, setVerInactivos] = useState(false);

  const [openForm, setOpenForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const editMode = !!form?.id;

  // ========= API helpers =========
  const apiGet = async (url) => {
    const res = await fetch(url, { method: "GET" });
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

  // ========= Cargar lista =========
  const cargar = async () => {
    setLoading(true);
    setMsg("");
    try {
      const url = `${BASE_URL}/api.php?action=trabajadores&op=listar&activos=${
        verInactivos ? 0 : 1
      }`;
      const data = await apiGet(url);

      if (!data?.exito) {
        throw new Error(data?.mensaje || "Error al listar trabajadores");
      }
      setRows(Array.isArray(data.data) ? data.data : []);
    } catch (e) {
      setMsg(String(e.message || e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verInactivos]);

  // ========= Filtro =========
  const filtrados = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;

    return rows.filter((r) =>
      `${r.id} ${r.nombre ?? ""} ${r.apellido ?? ""} ${r.email ?? ""} ${
        r.rol ?? ""
      } ${r.alias_pago ?? ""}`
        .toLowerCase()
        .includes(s)
    );
  }, [rows, q]);

  // ========= UI actions =========
  const abrirCrear = () => {
    setForm(emptyForm);
    setOpenForm(true);
    setMsg("");
  };

  const abrirEditar = (r) => {
    setForm({
      id: r.id,
      nombre: r.nombre ?? "",
      apellido: r.apellido ?? "",
      email: r.email ?? "",
      rol: r.rol ?? "vista",
      alias_pago: r.alias_pago ?? "",
      activo: r.activo ?? 1,
    });
    setOpenForm(true);
    setMsg("");
  };

  const cerrarForm = () => {
    setOpenForm(false);
    setForm(emptyForm);
  };

  const guardar = async (e) => {
    e.preventDefault();
    setMsg("");

    const nombre = form.nombre.trim();
    const apellido = form.apellido.trim();
    if (!nombre || !apellido) {
      setMsg("Nombre y apellido son obligatorios.");
      return;
    }

    setLoading(true);
    try {
      const op = editMode ? "editar" : "crear";
      const url = `${BASE_URL}/api.php?action=trabajadores&op=${op}`;

      const payload = {
        ...form,
        nombre,
        apellido,
        email: (form.email ?? "").trim(),
        alias_pago: (form.alias_pago ?? "").trim(),
      };

      const data = await apiPost(url, payload);
      if (!data?.exito) {
        throw new Error(data?.mensaje || "No se pudo guardar");
      }

      cerrarForm();
      await cargar();
    } catch (e2) {
      setMsg(String(e2.message || e2));
    } finally {
      setLoading(false);
    }
  };

  const baja = async (r) => {
    const ok = window.confirm(
      `¿Dar de baja a ${r.nombre} ${r.apellido}? (queda inactivo)`
    );
    if (!ok) return;

    setLoading(true);
    setMsg("");
    try {
      const url = `${BASE_URL}/api.php?action=trabajadores&op=eliminar`;
      const data = await apiPost(url, { id: r.id });

      if (!data?.exito) {
        throw new Error(data?.mensaje || "No se pudo dar de baja");
      }
      await cargar();
    } catch (e) {
      setMsg(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ini_contenedor-principal">
      <div className="trab-page">
        <header className="trab-head">
          <div>
            <h2 className="trab-title">Trabajadores 3DEVs</h2>
            <p className="trab-sub">
              Alta, edición y baja (activo=0) de integrantes.
            </p>
          </div>

          <div className="trab-actions">
            <button className="btn" onClick={abrirCrear}>
              + Agregar
            </button>

            <button
              className="btn btn-ghost"
              onClick={() => navigate("/panel")}
            >
              ← Volver
            </button>
          </div>
        </header>

        <section className="trab-tools">
          <input
            className="trab-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre, email, rol, alias..."
          />

          <label className="trab-check">
            <input
              type="checkbox"
              checked={verInactivos}
              onChange={(e) => setVerInactivos(e.target.checked)}
            />
            Ver inactivos
          </label>

          <button className="btn" onClick={cargar} disabled={loading}>
            {loading ? "Cargando..." : "Refrescar"}
          </button>
        </section>

        {msg && <div className="trab-msg">{msg}</div>}

        <div className="trab-tableWrap">
          <table className="trab-table">
            <thead>
              <tr>
                {[
                  "ID",
                  "Nombre",
                  "Apellido",
                  "Email",
                  "Rol",
                  "Alias pago",
                  "Activo",
                  "Acciones",
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>

            <tbody>
              {!loading && filtrados.length === 0 && (
                <tr>
                  <td colSpan={8} className="trab-empty">
                    Sin resultados.
                  </td>
                </tr>
              )}

              {filtrados.map((r) => (
                <tr key={r.id} className={!r.activo ? "is-inactive" : ""}>
                  <td>{r.id}</td>
                  <td>{r.nombre}</td>
                  <td>{r.apellido}</td>
                  <td>{r.email ?? "-"}</td>
                  <td>{r.rol}</td>
                  <td>{r.alias_pago ?? "-"}</td>
                  <td>{r.activo ? "Sí" : "No"}</td>
                  <td>
                    <div className="trab-rowActions">
                      <button
                        className="btn btn-small"
                        onClick={() => abrirEditar(r)}
                      >
                        Editar
                      </button>
                      {r.activo && (
                        <button
                          className="btn btn-small btn-danger"
                          onClick={() => baja(r)}
                        >
                          Baja
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ===== Modal ===== */}
        {openForm && (
          <div
            className="trab-modalBackdrop"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) cerrarForm();
            }}
          >
            <form className="trab-modal" onSubmit={guardar}>
              <div className="trab-modalTop">
                <h3>{editMode ? "Editar trabajador" : "Nuevo trabajador"}</h3>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={cerrarForm}
                >
                  X
                </button>
              </div>

              <div className="trab-formGrid">
                <div>
                  <label>Nombre *</label>
                  <input
                    value={form.nombre}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        nombre: e.target.value.toUpperCase(),
                      }))
                    }
                  />
                </div>

                <div>
                  <label>Apellido *</label>
                  <input
                    value={form.apellido}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        apellido: e.target.value.toUpperCase(),
                      }))
                    }
                  />
                </div>

                <div>
                  <label>Email (opcional)</label>
                  <input
                    value={form.email}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, email: e.target.value }))
                    }
                  />
                </div>

                <div>
                  <label>Rol</label>
                  <select
                    value={form.rol}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, rol: e.target.value }))
                    }
                  >
                    {ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="trab-colFull">
                  <label>Alias de pago (opcional)</label>
                  <input
                    value={form.alias_pago}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        alias_pago: e.target.value,
                      }))
                    }
                  />
                </div>

                {editMode && (
                  <label className="trab-colFull trab-check">
                    <input
                      type="checkbox"
                      checked={!!form.activo}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          activo: e.target.checked ? 1 : 0,
                        }))
                      }
                    />
                    Activo
                  </label>
                )}
              </div>

              <div className="trab-modalBottom">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={cerrarForm}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn" disabled={loading}>
                  {loading ? "Guardando..." : "Guardar"}
                </button>
              </div>

              <div className="trab-help">* Campos obligatorios</div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
