import React from "react";
import { useNavigate } from "react-router-dom";

export default function Pagos() {
  const navigate = useNavigate();

  return (
    <div style={{ padding: 20 }}>
      <h2>Pagos</h2>
      <p>
        Acá vas a controlar meses pagados, deuda, próximos vencimientos, y cuánto debe
        cada cliente según sistemas activos.
      </p>

      <button onClick={() => navigate("/principal")}>← Volver</button>
    </div>
  );
}
