import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import BASE_URL from "../../config/config";
import "./Mantenimiento.css";

export default function Mantenimiento() {
  const navigate = useNavigate();

  const [planes, setPlanes] = useState([]);
  const [loading, setLoading] = useState(false);

  const API_BASE = `${BASE_URL}/routes/api.php`;

  async function cargarPlanes() {
    try {
      setLoading(true);

      const res = await fetch(
        `${API_BASE}?action=mantenimiento&op=planes&ver_inactivos=1`
      );

      const data = await res.json().catch(() => null);

      if (data?.exito && Array.isArray(data?.planes)) {
        setPlanes(data.planes);
      } else {
        setPlanes([]);
      }
    } catch {
      setPlanes([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    cargarPlanes();
  }, []);

  async function crearPlan() {
    const nombre = prompt("Nombre del plan:");
    if (!nombre) return;

    const descripcion = prompt("Descripción (opcional):", "");
    const monto = prompt("Monto:");
    if (!monto) return;

    await fetch(`${API_BASE}?action=mantenimiento&op=crear_plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre,
        descripcion,
        monto,
        activo: 1,
      }),
    });

    cargarPlanes();
  }

  async function editarPlan(p) {
    const nombre = prompt("Nombre:", p.nombre);
    if (!nombre) return;

    const descripcion = prompt("Descripción:", p.descripcion || "");
    const monto = prompt("Monto:", p.monto);
    if (!monto) return;

    await fetch(`${API_BASE}?action=mantenimiento&op=editar_plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: p.id,
        nombre,
        descripcion,
        monto,
        activo: p.activo,
      }),
    });

    cargarPlanes();
  }

  async function eliminarPlan(p) {
    if (!window.confirm(`¿Eliminar el plan "${p.nombre}"?`)) return;

    await fetch(`${API_BASE}?action=mantenimiento&op=eliminar_plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id }),
    });

    cargarPlanes();
  }

  return (
    /* ✅ CONTENEDOR PRINCIPAL PEDIDO */
    <div className="ini_contenedor-principal">
      <div className="mnt-wrap">
        <h2 className="mnt-title">Planes de Mantenimiento</h2>

        <div className="mnt-actions">
          <button className="mnt-btn" onClick={() => navigate("/panel")}>
            ← Volver
          </button>
          <button className="mnt-btn mnt-btn-primary" onClick={crearPlan}>
            + Nuevo plan
          </button>
        </div>

        <div className="mnt-card">
          {loading ? (
            <p className="mnt-muted">Cargando...</p>
          ) : planes.length === 0 ? (
            <p className="mnt-muted">No hay planes cargados</p>
          ) : (
            <div className="mnt-tableWrap">
              <table className="mnt-table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Descripción</th>
                    <th>Monto</th>
                    <th>Activo</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {planes.map((p) => (
                    <tr key={p.id}>
                      <td>{p.nombre}</td>
                      <td>{p.descripcion || "-"}</td>
                      <td>
                        ${Number(p.monto || 0).toLocaleString("es-AR")}
                      </td>
                      <td>{String(p.activo) === "1" ? "Sí" : "No"}</td>
                      <td className="mnt-rowActions">
                        <button
                          className="mnt-btn"
                          onClick={() => editarPlan(p)}
                        >
                          Editar
                        </button>
                        <button
                          className="mnt-btn mnt-btn-danger"
                          onClick={() => eliminarPlan(p)}
                        >
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
