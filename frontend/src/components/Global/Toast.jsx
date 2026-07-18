import React, { useEffect, useState } from 'react';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheckCircle,
  faExclamationTriangle,
  faTimesCircle,
  faSpinner,
  faInfoCircle
} from "@fortawesome/free-solid-svg-icons";
import './Toast.css';

// La duración se administra únicamente desde este componente global.
const TOAST_DURACION_MS = 3000;
const TOAST_SALIDA_MS = 500;

const Toast = ({ tipo, mensaje, onClose }) => {
  const [desapareciendo, setDesapareciendo] = useState(false);

  useEffect(() => {
    const mostrarTimer = setTimeout(() => {
      setDesapareciendo(true);
    }, TOAST_DURACION_MS - TOAST_SALIDA_MS);

    const ocultarTimer = setTimeout(() => {
      onClose?.();
    }, TOAST_DURACION_MS);

    return () => {
      clearTimeout(mostrarTimer);
      clearTimeout(ocultarTimer);
    };
  }, [onClose]);

  const iconos = {
    exito: faCheckCircle,
    error: faTimesCircle,
    advertencia: faExclamationTriangle,
    cargando: faSpinner
  };

  const clasesTipo = {
    exito: 'toast-exito',
    error: 'toast-error',
    advertencia: 'toast-advertencia',
    cargando: 'toast-cargando'
  };

  const iconoSeleccionado = iconos[tipo] || faInfoCircle;
  const claseSeleccionada = clasesTipo[tipo] || 'toast-info';

  return (
<div className={`toast-container ${claseSeleccionada} ${desapareciendo ? 'desaparecer' : ''}`}>
  <FontAwesomeIcon
    icon={iconoSeleccionado}
    className={`toast-icon ${tipo === 'cargando' ? 'spin' : ''}`}
  />
  <span className="toast-message">{mensaje}</span>
</div>

  );
};

export default Toast;
