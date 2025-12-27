// src/components/Mantenimiento/Mantenimiento.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import BASE_URL from "../../config/config";

export default function Mantenimiento() {
  const navigate = useNavigate();
  const [planes, setPlanes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    async function cargar() {
      try {
        setLoading(true);

        // ✅ Endpoint sugerido:
        // backend/routes/api.php?action=mantenimiento&op=planes
        const res = await fetch(`${BASE_URL}/routes/api.php?action=mantenimiento&op=planes`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });

        const data = await res.json().catch(() => null);

        if (!alive) return;

        if (data?.exito && Array.isArray(data?.planes)) {
          setPlanes(data.planes);
        } else {
          // Si todavía no tenés backend, mostramos vacío sin romper
          setPlanes([]);
        }
      } catch {
        if (!alive) return;
        setPlanes([]);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    cargar();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div style={{ padding: 20, maxWidth: 900, margin: "0 auto" }}>
      <h2>Planes de Mantenimiento</h2>
      <p>
        Acá administrás los planes de mantenimiento (monto y descripción). Luego los
        vinculás a clientes para generar cobros mensuales.
      </p>

      <div style={{ marginTop: 16, marginBottom: 16 }}>
        <button onClick={() => navigate("/panel")}>← Volver</button>
      </div>

      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: 16,
          border: "1px solid rgba(0,0,0,.08)",
        }}
      >
        {loading ? (
          <p>Cargando planes...</p>
        ) : planes.length === 0 ? (
          <p style={{ margin: 0 }}>
            No hay planes cargados (o todavía no conectaste el backend).
          </p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left" }}>
                <th style={{ padding: 10, borderBottom: "1px solid #eee" }}>Plan</th>
                <th style={{ padding: 10, borderBottom: "1px solid #eee" }}>Descripción</th>
                <th style={{ padding: 10, borderBottom: "1px solid #eee" }}>Monto</th>
                <th style={{ padding: 10, borderBottom: "1px solid #eee" }}>Activo</th>
              </tr>
            </thead>
            <tbody>
              {planes.map((p) => (
                <tr key={p.id}>
                  <td style={{ padding: 10, borderBottom: "1px solid #f2f2f2" }}>
                    {p.nombre}
                  </td>
                  <td style={{ padding: 10, borderBottom: "1px solid #f2f2f2" }}>
                    {p.descripcion || "-"}
                  </td>
                  <td style={{ padding: 10, borderBottom: "1px solid #f2f2f2" }}>
                    ${Number(p.monto || 0).toLocaleString("es-AR")}
                  </td>
                  <td style={{ padding: 10, borderBottom: "1px solid #f2f2f2" }}>
                    {String(p.activo) === "1" ? "Sí" : "No"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
