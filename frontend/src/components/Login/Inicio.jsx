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
  pass: 'remember_contrasena_v2',
};

// Ofuscación simple para no dejar la contraseña en texto plano en el navegador.
// (No es cifrado fuerte: cualquiera con acceso a la PC podría recuperarla.)
const OBF_KEY = '3devs-gestion';
const ofuscar = (txt) => {
  try {
    const bytes = new TextEncoder().encode(String(txt ?? ''));
    let out = '';
    bytes.forEach((b, i) => {
      out += String.fromCharCode(b ^ OBF_KEY.charCodeAt(i % OBF_KEY.length));
    });
    return btoa(out);
  } catch {
    return '';
  }
};
const desofuscar = (enc) => {
  try {
    const raw = atob(String(enc ?? ''));
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
      bytes[i] = raw.charCodeAt(i) ^ OBF_KEY.charCodeAt(i % OBF_KEY.length);
    }
    return new TextDecoder().decode(bytes);
  } catch {
    return '';
  }
};
const lsGet = (k) => {
  try { return localStorage.getItem(k); } catch { return null; }
};
const lsSet = (k, v) => {
  try { localStorage.setItem(k, v); } catch {}
};
const lsDel = (k) => {
  try { localStorage.removeItem(k); } catch {}
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
    const saved = lsGet(STORAGE_KEYS.rememberFlag) === '1';
    const savedUser = saved ? lsGet(STORAGE_KEYS.user) || '' : '';
    const savedPass = saved ? desofuscar(lsGet(STORAGE_KEYS.pass) || '') : '';

    // Limpia el formato viejo (base64 plano) si quedó guardado.
    lsDel('remember_contrasena');

    setRemember(saved);
    setNombre(savedUser);
    setContrasena(savedPass);
  }, []);

  const persistRemember = (user, pass, flag) => {
    if (flag) {
      lsSet(STORAGE_KEYS.rememberFlag, '1');
      lsSet(STORAGE_KEYS.user, user ?? '');
      lsSet(STORAGE_KEYS.pass, ofuscar(pass ?? ''));
    } else {
      lsDel(STORAGE_KEYS.rememberFlag);
      lsDel(STORAGE_KEYS.user);
      lsDel(STORAGE_KEYS.pass);
    }
  };

  // Si la contraseña guardada ya no sirve (por ej. la cambiaron), se borra.
  const olvidarContrasenaGuardada = () => lsDel(STORAGE_KEYS.pass);

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
        olvidarContrasenaGuardada();
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
        olvidarContrasenaGuardada();
        mostrarToast('error', data?.mensaje || 'Usuario o contraseña incorrectos');
        setCargando(false);
        return;
      }

      storeLoginResponse(data);
      persistRemember(nombre, contrasena, remember);

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
          <img src={logoRH} alt="3Devs Solutions" className="ini_logo" />
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