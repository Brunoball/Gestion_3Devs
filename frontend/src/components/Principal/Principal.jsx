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
  faUserPlus,
} from "@fortawesome/free-solid-svg-icons";
import BASE_URL from "../../config/config";
import "./principal.css";
import "../Global/roots.css";
import logo3devs from "../../imagenes/Logo_3devs.jpeg";
import {
  buildAuthHeaders,
  clearStoredSession,
  getOrganizations,
  getStoredToken,
  getStoredUser,
  normalizeRole,
} from "../Global/session";

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
        onMouseDown={(e) => e.stopPropagation()}
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

const Principal = () => {
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [usuario, setUsuario] = useState(null);

  useEffect(() => {
    const token = getStoredToken();
    const storedUser = getStoredUser();

    if (!token || !storedUser) {
      clearStoredSession();
      navigate("/", { replace: true });
      return;
    }

    setUsuario(storedUser);
  }, [navigate]);

  useEffect(() => {
    try {
      localStorage.removeItem("ultimaBusqueda");
      localStorage.removeItem("ultimosResultados");
      localStorage.removeItem("alumnoSeleccionado");
      localStorage.removeItem("ultimaAccion");
    } catch {}
  }, []);

  const role = normalizeRole(usuario?.rol);
  const isAdmin = role === "admin";
  const organizations = getOrganizations(usuario);

  const menuOperativo = [
    { icon: faUsers, text: "Clientes", ruta: "/clientes" },
    { icon: faMoneyBillWave, text: "Pagos", ruta: "/pagos" },
    { icon: faUserTie, text: "Trabajadores", ruta: "/trabajadores" },
    { icon: faLayerGroup, text: "Mantenimiento", ruta: "/mantenimiento" },
    { icon: faChartLine, text: "Reportes", ruta: "/reportes" },
  ];

  const hasFullControl = isAdmin && organizations.length > 1;
  const visibleItems = hasFullControl
    ? [
        ...menuOperativo,
        { icon: faUserPlus, text: "Crear usuario", ruta: "/registro" },
      ]
    : menuOperativo;

  const handleItemClick = (item) => {
    navigate(item.ruta);
    document.activeElement?.blur?.();
  };

  const confirmarCierreSesion = async () => {
    setIsExiting(true);

    try {
      await fetch(`${BASE_URL}/api.php?action=logout`, {
        method: "POST",
        headers: buildAuthHeaders(),
      });
    } catch {
      // El cierre local se ejecuta igualmente si la red falla.
    }

    setTimeout(() => {
      sessionStorage.clear();
      clearStoredSession();
      setShowModal(false);
      navigate("/", { replace: true });
    }, 250);
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
              Sistema interno <span className="title-accent">3Devs + Balto</span>
            </h1>
            <p className="subtitle">
              {hasFullControl
                ? "Panel de administración con acceso multiempresa"
                : "Panel de gestión de la entidad autorizada"}
            </p>

            <div className="principal-organizaciones" aria-label="Organizaciones habilitadas">
              {organizations.map((organization) => (
                <span
                  key={organization.id_organizacion}
                  className="principal-organizacion-chip"
                >
                  {organization.codigo || organization.nombre}
                  <small>{organization.rol}</small>
                </span>
              ))}
            </div>
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

        {!hasFullControl && (
          <p className="principal-limited-note">
            Acceso operativo completo a la entidad habilitada. La creación de usuarios está reservada al administrador general.
          </p>
        )}

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
