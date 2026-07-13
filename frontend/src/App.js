import React, { useEffect, useRef, useCallback } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  Outlet,
  useNavigate,
  useLocation,
} from "react-router-dom";

import Inicio from "./components/Login/Inicio";
import Registro from "./components/Login/Registro";
import Principal from "./components/Principal/Principal";
import Clientes from "./components/Clientes/Clientes";
import Pagos from "./components/Pagos/Pagos";
import Trabajadores from "./components/Trabajadores/Trabajadores";
import Mantenimiento from "./components/Mantenimiento/Mantenimiento";
import Reportes from "./components/Reportes/Reportes";

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

const IDLE_MS = 30 * 60 * 1000; // 30 minutos

function SessionTimeoutManager() {
  const navigate = useNavigate();
  const location = useLocation();
  // Usamos refs para evitar que los callbacks cambien y re-disparen efectos
  const timerRef = useRef(null);
  const navigateRef = useRef(navigate);

  // Mantener navigateRef actualizado sin re-disparar efectos
  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  // logout estable: no cambia nunca (usa ref)
  const logoutNow = useCallback(() => {
    try {
      sessionStorage.clear();
      localStorage.removeItem("token");
      localStorage.removeItem("usuario");
    } catch {}
    navigateRef.current("/", { replace: true });
  }, []); // sin dependencias → función estable

  // resetTimer estable
  const resetTimer = useCallback(() => {
    if (!isAuthenticated()) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(logoutNow, IDLE_MS);
  }, [logoutNow]); // logoutNow es estable → resetTimer también es estable

  // Adjuntar listeners UNA SOLA VEZ al montar
  useEffect(() => {
    if (!isAuthenticated()) return;

    const EVENTS = [
      "mousemove",
      "mousedown",
      "click",
      "scroll",
      "keydown",
      "touchstart",
    ];

    const handleActivity = () => resetTimer();

    EVENTS.forEach((ev) => {
      window.addEventListener(ev, handleActivity, { passive: true });
    });

    resetTimer(); // arrancar el timer al montar

    return () => {
      EVENTS.forEach((ev) => {
        window.removeEventListener(ev, handleActivity);
      });
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []); // ← array vacío: solo se ejecuta al montar/desmontar

  // Reiniciar timer al cambiar de ruta
  useEffect(() => {
    if (!isAuthenticated()) return;
    resetTimer();
  }, [location.pathname]); // ← solo pathname como dep, no resetTimer

  return null;
}

function RutaProtegidaLayout() {
  if (!isAuthenticated()) {
    return <Navigate to="/" replace />;
  }
  return (
    <>
      <SessionTimeoutManager />
      <Outlet />
    </>
  );
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Inicio />} />
        <Route path="/registro" element={<Registro />} />

        <Route element={<RutaProtegidaLayout />}>
          <Route path="/panel" element={<Principal />} />
          <Route path="/clientes" element={<Clientes />} />
          <Route path="/pagos" element={<Pagos />} />
          <Route path="/trabajadores" element={<Trabajadores />} />
          <Route path="/mantenimiento" element={<Mantenimiento />} />
          <Route path="/reportes" element={<Reportes />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}