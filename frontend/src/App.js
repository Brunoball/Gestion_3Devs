// src/App.js
import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";

/* ======================
   Páginas públicas
====================== */
import Inicio from "./components/Login/Inicio";
import Registro from "./components/Login/Registro";

/* ======================
   Panel (protegido)
====================== */
import Principal from "./components/Principal/Principal";

/* ======================
   Secciones 3DEVs (protegidas)
====================== */
import Clientes from "./components/Clientes/Clientes";
import Pagos from "./components/Pagos/Pagos";
import Trabajadores from "./components/Trabajadores/Trabajadores";
import Mantenimiento from "./components/Mantenimiento/Mantenimiento";
import Reportes from "./components/Reportes/Reportes";

/* ======================
   Auth helpers
====================== */
function isAuthenticated() {
  try {
    const token = localStorage.getItem("token");
    const rawUser = localStorage.getItem("usuario");

    if (token && String(token).trim() !== "") return true;
    if (!rawUser) return false;

    try {
      const u = JSON.parse(rawUser);
      return !!u && typeof u === "object";
    } catch {
      return false;
    }
  } catch {
    return false;
  }
}

function RutaProtegida({ children }) {
  return isAuthenticated() ? children : <Navigate to="/" replace />;
}

export default function App() {
  return (
    <Router>
      <Routes>
        {/* ============ Público ============ */}
        <Route path="/" element={<Inicio />} />
        <Route path="/registro" element={<Registro />} />

        {/* ============ Protegido ============ */}
        <Route
          path="/panel"
          element={
            <RutaProtegida>
              <Principal />
            </RutaProtegida>
          }
        />

        <Route
          path="/clientes"
          element={
            <RutaProtegida>
              <Clientes />
            </RutaProtegida>
          }
        />

        <Route
          path="/pagos"
          element={
            <RutaProtegida>
              <Pagos />
            </RutaProtegida>
          }
        />

        <Route
          path="/trabajadores"
          element={
            <RutaProtegida>
              <Trabajadores />
            </RutaProtegida>
          }
        />

        <Route
          path="/mantenimiento"
          element={
            <RutaProtegida>
              <Mantenimiento />
            </RutaProtegida>
          }
        />

        <Route
          path="/reportes"
          element={
            <RutaProtegida>
              <Reportes />
            </RutaProtegida>
          }
        />

        {/* ============ Catch-all ============ */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}
