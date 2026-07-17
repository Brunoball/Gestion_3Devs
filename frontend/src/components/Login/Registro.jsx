import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import BASE_URL from "../../config/config";
import "./registro.css";
import logoRH from "../../imagenes/Logo_3devs.jpeg";
import Toast from "../Global/Toast";
import {
  buildAuthHeaders,
  getOrganizations,
  getStoredToken,
  getStoredUser,
  normalizeRole,
} from "../Global/session";

const ACCESS_OPTIONS = [
  {
    value: "total",
    label: "Control total: 3DEVS + BALTO",
    help: "Administrador en las dos organizaciones.",
  },
  {
    value: "balto",
    label: "Solo BALTO",
    help: "Cuenta de contador, sin acceso a datos de 3DEVS.",
  },
];

const Registro = () => {
  const [nombre, setNombre] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [confirmarContrasena, setConfirmarContrasena] = useState("");
  const [alcance, setAlcance] = useState("balto");
  const [cargando, setCargando] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [toast, setToast] = useState(null);
  const navigate = useNavigate();

  const selectedAccess = ACCESS_OPTIONS.find((item) => item.value === alcance);

  useEffect(() => {
    const token = getStoredToken();
    const user = getStoredUser();
    const organizations = getOrganizations(user);
    const hasFullControl =
      normalizeRole(user?.rol) === "admin" && organizations.length > 1;

    if (!token || !hasFullControl) {
      navigate("/panel", { replace: true });
    }
  }, [navigate]);

  const mostrarToast = (tipo, mensaje, duracion = 3000) => {
    setToast({ tipo, mensaje, duracion });
  };

  const manejarRegistro = async (e) => {
    e.preventDefault();
    if (cargando) return;

    const nombreTrim = nombre.trim();
    if (!nombreTrim || !contrasena || !confirmarContrasena) {
      mostrarToast("advertencia", "Completá todos los campos.");
      return;
    }
    if (nombreTrim.length < 4) {
      mostrarToast("advertencia", "El usuario debe tener al menos 4 caracteres.");
      return;
    }
    if (contrasena.length < 8) {
      mostrarToast("advertencia", "La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (contrasena !== confirmarContrasena) {
      mostrarToast("advertencia", "Las contraseñas no coinciden.");
      return;
    }

    try {
      setCargando(true);

      const response = await fetch(`${BASE_URL}/api.php?action=registro`, {
        method: "POST",
        headers: buildAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          nombre: nombreTrim,
          contrasena,
          alcance,
        }),
      });

      const text = await response.text();
      let data = null;
      try {
        data = JSON.parse(text || "{}");
      } catch {}

      if (!response.ok || !data?.exito) {
        throw new Error(data?.mensaje || `No se pudo crear el usuario (HTTP ${response.status}).`);
      }

      mostrarToast("exito", data.mensaje || "Usuario creado correctamente.", 4000);
      setNombre("");
      setContrasena("");
      setConfirmarContrasena("");
    } catch (error) {
      mostrarToast("error", error.message || "Error del servidor.");
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="reg_global-container">
      {toast && (
        <Toast
          tipo={toast.tipo}
          mensaje={toast.mensaje}
          duracion={toast.duracion}
          onClose={() => setToast(null)}
        />
      )}

      <div className="reg_contenedor">
        <div className="reg_encabezado">
          <img src={logoRH} alt="Logo 3Devs" className="reg_logo" />
          <h1 className="reg_titulo">Crear usuario</h1>
          <p className="reg_subtitulo">
            Asigná control total o acceso exclusivo a BALTO.
          </p>
        </div>

        <form onSubmit={manejarRegistro} className="reg_formulario">
          <div className="reg_campo">
            <input
              type="text"
              placeholder="Usuario"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
              className="reg_input"
              autoComplete="off"
            />
          </div>

          <div className="reg_campo reg_campo-rol">
            <select
              className="reg_input"
              value={alcance}
              onChange={(e) => setAlcance(e.target.value)}
              required
              aria-label="Seleccionar alcance del usuario"
            >
              {ACCESS_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <small className="reg_access-help">{selectedAccess?.help}</small>
          </div>

          <div className="reg_fila-2">
            <div className="reg_campo reg_campo-password reg_col-6">
              <input
                type={showPassword ? "text" : "password"}
                className="reg_input"
                placeholder="Contraseña"
                value={contrasena}
                onChange={(e) => setContrasena(e.target.value)}
                required
                autoComplete="new-password"
              />
              <button
                type="button"
                className="reg_toggle-password"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              >
                {showPassword ? "Ocultar" : "Ver"}
              </button>
            </div>

            <div className="reg_campo reg_campo-password reg_col-6">
              <input
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Confirmar contraseña"
                value={confirmarContrasena}
                onChange={(e) => setConfirmarContrasena(e.target.value)}
                required
                className="reg_input"
                autoComplete="new-password"
              />
              <button
                type="button"
                className="reg_toggle-password"
                onClick={() => setShowConfirmPassword((value) => !value)}
                aria-label={showConfirmPassword ? "Ocultar confirmación" : "Mostrar confirmación"}
              >
                {showConfirmPassword ? "Ocultar" : "Ver"}
              </button>
            </div>
          </div>

          <div className="reg_footer">
            <button type="submit" className="reg_boton" disabled={cargando}>
              {cargando ? "Creando..." : "Crear usuario"}
            </button>
            <button
              type="button"
              onClick={() => navigate("/panel")}
              className="reg_boton reg_boton-secundario"
              disabled={cargando}
            >
              Volver al panel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Registro;
