import React from "react";
import { useNavigate } from "react-router-dom";

export default function Reportes() {
  const navigate = useNavigate();

  return (
    <div style={{ padding: 20 }}>
      <h2>Reportes</h2>
      <p>
        Dashboard: ingresos por mes, deuda total, top clientes, pagos al día, etc.
      </p>

      <button onClick={() => navigate("/principal")}>← Volver</button>
    </div>
  );
}
