// src/components/Principal/Principal.jsx
import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faUsers,
  faSignOutAlt,
  faMoneyBillWave,
  faUserTie,
  faLayerGroup,
  faChartLine,
  faUserPlus, // ✅ NUEVO (Registro)
} from "@fortawesome/free-solid-svg-icons";
import "./principal.css";
import "../Global/roots.css";
import logo3devs from "../../imagenes/Logo_3devs.jpeg";

/* =========== Modal cierre de sesión ============= */
const ConfirmLogoutModal = ({ open, onClose, onConfirm }) => {
  const cancelBtnRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    cancelBtnRef.current?.focus();
    const onKeyDown = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  const stop = (e) => e.stopPropagation();

  return (
    <div
      className="modalprincipal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modalprincipal-title"
      onMouseDown={onClose}
    >
      <div
        className="modalprincipal-container modalprincipal--danger"
        onMouseDown={stop}
      >
        <div className="modalprincipal__icon" aria-hidden="true">
          <FontAwesomeIcon icon={faSignOutAlt} />
        </div>

        <h3 id="modalprincipal-title" className="modalprincipal-title">
          Confirmar cierre de sesión
        </h3>
        <p className="modalprincipal-text">
          ¿Estás seguro de que deseas cerrar la sesión?
        </p>

        <div className="modalprincipal-buttons">
          <button
            type="button"
            className="modalprincipal-btn modalprincipal-btn--ghost"
            onClick={onClose}
            ref={cancelBtnRef}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="modalprincipal-btn modalprincipal-btn--solid-danger"
            onClick={onConfirm}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
};

function normalizeRol(value) {
  if (value == null) return "vista";
  const v = String(value).trim().toLowerCase();
  if (
    v === "1" ||
    v === "admin" ||
    v === "administrator" ||
    v === "administrador" ||
    v === "superadmin"
  )
    return "admin";
  return "vista";
}

const Principal = () => {
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [usuario, setUsuario] = useState(null);

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem("usuario"));
      if (u) u.rol = normalizeRol(u.rol);
      setUsuario(u || null);
    } catch {
      setUsuario(null);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.removeItem("ultimaBusqueda");
      localStorage.removeItem("ultimosResultados");
      localStorage.removeItem("alumnoSeleccionado");
      localStorage.removeItem("ultimaAccion");
    } catch {}
  }, []);

  const isAdmin = normalizeRol(usuario?.rol) === "admin";

  const menuAdmin = [
    { icon: faUsers, text: "Clientes", ruta: "/clientes" },
    { icon: faMoneyBillWave, text: "Pagos", ruta: "/pagos" },
    { icon: faUserTie, text: "Trabajadores", ruta: "/trabajadores" },
    { icon: faLayerGroup, text: "Mantenimiento", ruta: "/mantenimiento" },
    { icon: faChartLine, text: "Reportes", ruta: "/reportes" },

    // ✅ NUEVO: REGISTRO (solo admin, recomendado)
    { icon: faUserPlus, text: "Registro", ruta: "/registro" },
  ];

  const menuVista = [
    { icon: faUsers, text: "Clientes", ruta: "/clientes" },
    { icon: faMoneyBillWave, text: "Pagos", ruta: "/pagos" },
    { icon: faChartLine, text: "Reportes", ruta: "/reportes" },

    // ✅ NUEVO: REGISTRO (si también querés que lo vea "vista", dejalo)
    // Si NO querés que rol vista lo vea, borrá esta línea.
    { icon: faUserPlus, text: "Registro", ruta: "/registro" },
  ];

  const visibleItems = isAdmin ? menuAdmin : menuVista;

  const handleItemClick = (item) => {
    navigate(item.ruta);
    document.activeElement?.blur?.();
  };

  const confirmarCierreSesion = () => {
    setIsExiting(true);
    setTimeout(() => {
      sessionStorage.clear();
      localStorage.removeItem("token");
      localStorage.removeItem("usuario");
      setShowModal(false);
      navigate("/", { replace: true });
    }, 400);
  };

  return (
    <div
      className={`pagina-principal-container ${
        isExiting ? "slide-fade-out" : ""
      }`}
    >
      <div className="pagina-principal-card">
        <div className="pagina-principal-header header--row">
          <div className="header-text">
            <h1 className="title">
              Sistema interno <span className="title-accent">3Devs</span>
            </h1>
            <p className="subtitle">
              {isAdmin
                ? "Panel de administración y gestión"
                : "Panel de consulta y seguimiento"}
            </p>
          </div>

          <div className="logo-container logo-container--right">
            <img src={logo3devs} alt="Logo 3Devs" className="logo" />
          </div>
        </div>

        <div className="menu-container">
          <div className="menu-grid flex--compact">
            {visibleItems.map((item, index) => (
              <button
                key={`${item.ruta}-${index}`}
                className="menu-button card--compact"
                onClick={() => handleItemClick(item)}
                type="button"
              >
                <div className="button-icon icon--sm">
                  <FontAwesomeIcon icon={item.icon} size="lg" />
                </div>
                <span className="button-text text--sm">{item.text}</span>
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          className="logout-button"
          onClick={() => setShowModal(true)}
        >
          <FontAwesomeIcon icon={faSignOutAlt} className="logout-icon" />
          <span className="logout-text-full">Cerrar Sesión</span>
          <span className="logout-text-short">Salir</span>
        </button>

        <footer className="pagina-principal-footer">
          Desarrollado por{" "}
          <a
            href="https://3devsnet.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            3devs.solutions
          </a>
        </footer>
      </div>

      <ConfirmLogoutModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onConfirm={confirmarCierreSesion}
      />
    </div>
  );
};

export default Principal;
