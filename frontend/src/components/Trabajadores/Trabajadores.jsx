import React from "react";
import { useNavigate } from "react-router-dom";

export default function Trabajadores() {
  const navigate = useNavigate();

  return (
    <div style={{ padding: 20 }}>
      <h2>Trabajadores 3DEVs</h2>
      <p>
        Acá vas a gestionar integrantes, roles, y asignación de porcentaje por sistema
        o por cliente.
      </p>

      <button onClick={() => navigate("/principal")}>← Volver</button>
    </div>
  );
}
