// src/components/inicio/Inicio.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import BASE_URL from '../../config/config';
import './inicio.css';
import logoRH from '../../imagenes/Logo_3devs.jpeg';
import Toast from '../Global/Toast';
import { storeLoginResponse } from '../Global/session';

const STORAGE_KEYS = {
  rememberFlag: 'rememberLogin',
  user: 'remember_nombre',
};

const Inicio = () => {
  const [nombre, setNombre] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [cargando, setCargando] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);

  const [toast, setToast] = useState(null);
  const mostrarToast = (tipo, mensaje, duracion = 3000) =>
    setToast({ tipo, mensaje, duracion });

  const navigate = useNavigate();

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.rememberFlag) === '1';
    const savedUser = saved ? localStorage.getItem(STORAGE_KEYS.user) || '' : '';

    // Limpia el formato anterior que guardaba la contraseña en base64.
    localStorage.removeItem('remember_contrasena');

    setRemember(saved);
    setNombre(savedUser);
    setContrasena('');
  }, []);

  const persistRemember = (user, flag) => {
    if (flag) {
      localStorage.setItem(STORAGE_KEYS.rememberFlag, '1');
      localStorage.setItem(STORAGE_KEYS.user, user ?? '');
    } else {
      localStorage.removeItem(STORAGE_KEYS.rememberFlag);
      localStorage.removeItem(STORAGE_KEYS.user);
    }
  };

  const togglePasswordVisibility = () => setShowPassword((v) => !v);

  const manejarEnvio = async (e) => {
    e.preventDefault();
    if (cargando) return;
    setCargando(true);

    if (!nombre || !contrasena) {
      mostrarToast('advertencia', 'Por favor complete todos los campos');
      setCargando(false);
      return;
    }

    try {
      const res = await fetch(`${BASE_URL}/api.php?action=inicio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, contrasena }),
      });

      if (res.status === 401) {
        let d = null;
        try {
          d = await res.json();
        } catch {}
        mostrarToast('error', d?.mensaje || 'Usuario o contraseña incorrectos');
        setCargando(false);
        return;
      }

      if (!res.ok) {
        mostrarToast(
          'error',
          'No se pudo iniciar sesión. Intente nuevamente.'
        );
        setCargando(false);
        return;
      }

      let data = null;
      try {
        data = await res.json();
      } catch {}

      if (!data || !data.exito) {
        mostrarToast('error', data?.mensaje || 'Usuario o contraseña incorrectos');
        setCargando(false);
        return;
      }

      storeLoginResponse(data);
      persistRemember(nombre, remember);

      navigate('/panel');
    } catch {
      mostrarToast(
        'error',
        'No se pudo iniciar sesión. Intente nuevamente.'
      );
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="ini_contenedor-principal">
      <div className="ini_contenedor">
        <div className="ini_encabezado">
          <img src={logoRH} alt="Cooperadora IPET 50" className="ini_logo" />
          <h1 className="ini_titulo">Iniciar Sesión</h1>
          <p className="ini_subtitulo">
            Ingresá tus credenciales para acceder al sistema
          </p>
        </div>

        <form
          onSubmit={manejarEnvio}
          className="ini_formulario"
          autoComplete="on"
          noValidate
        >
          <div className="ini_campo">
            <input
              type="text"
              placeholder="Usuario"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
              className="ini_input"
              autoComplete="username"
              inputMode="text"
              name="username"
            />
          </div>

          <div className="ini_campo ini_campo-password">
            <input
              type={showPassword ? 'text' : 'password'}
              className="ini_input"
              placeholder="Contraseña"
              value={contrasena}
              onChange={(e) => setContrasena(e.target.value)}
              required
              autoComplete="current-password"
              name="password"
            />
            <button
              type="button"
              className="ini_toggle-password"
              onClick={togglePasswordVisibility}
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                {showPassword ? (
                  <>
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                  </>
                ) : (
                  <>
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </>
                )}
              </svg>
            </button>
          </div>

          <div className="ini_check-row">
            <input
              id="recordar"
              type="checkbox"
              className="ini_checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            <label htmlFor="recordar" className="ini_check-label">
              Recordar cuenta
            </label>
          </div>

          <div className="ini_footer">
            <button
              type="submit"
              className="ini_boton"
              disabled={cargando}
              aria-busy={cargando ? 'true' : 'false'}
              aria-live="polite"
            >
              {cargando ? 'Iniciando...' : 'Iniciar Sesión'}
            </button>
          </div>
        </form>
      </div>

      {toast && (
        <Toast
          tipo={toast.tipo}
          mensaje={toast.mensaje}
          duracion={toast.duracion}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
};

export default Inicio;