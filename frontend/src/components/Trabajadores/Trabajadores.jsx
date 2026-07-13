// src/components/Trabajadores/Trabajadores.jsx
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import BASE_URL from "../../config/config";
import Toast from "../Global/Toast";
import "./Trabajadores.css";

// Font Awesome
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faPlus,
  faPenToSquare,
  faUserSlash,
  faMagnifyingGlass,
  faUsersSlash,
} from "@fortawesome/free-solid-svg-icons";

// Modales (archivos separados)
import ModalAgregarTrabajador from "./modales/ModalAgregarTrabajador";
import ModalEditarTrabajador from "./modales/ModalEditarTrabajador";
import ModalBajaTrabajador from "./modales/ModalBajaTrabajador";
import ModalTrabajadoresBaja from "./modales/ModalTrabajadoresBaja";

const COLS = {
  head: ".35fr 1.1fr 1.1fr 1.9fr .9fr 1.25fr .7fr 1.05fr",
  row: ".35fr 1.1fr 1.1fr 1.9fr .9fr 1.25fr .7fr 1.05fr",
};

export default function Trabajadores() {
  const navigate = useNavigate();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const [q, setQ] = useState("");

  // Modales
  const [openCrear, setOpenCrear] = useState(false);
  const [openEditar, setOpenEditar] = useState(false);
  const [openBaja, setOpenBaja] = useState(false);
  const [openBajaListado, setOpenBajaListado] = useState(false);
  const [sel, setSel] = useState(null);

  // ======= TOAST (según tu Toast.jsx) =======
  const [toast, setToast] = useState({
    open: false,
    tipo: "info", // exito | error | advertencia | cargando | info
    mensaje: "",
    duracion: 2600,
    key: 0, // ✅ para evitar “flicker” cuando se repite el mismo toast
  });

  const showToast = (tipo, mensaje, duracion = 2600) => {
    setToast((t) => ({
      open: true,
      tipo,
      mensaje,
      duracion,
      key: (t.key ?? 0) + 1,
    }));
  };

  const closeToast = () => setToast((t) => ({ ...t, open: false }));

  // ✅ Lock anti-doble onSaved (por StrictMode / doble submit)
  const bajaSavedLockRef = useRef(false);

  // ========= API helpers =========
  const apiGet = async (url) => {
    const res = await fetch(url, { method: "GET" });
    const raw = await res.text();
    try {
      return raw ? JSON.parse(raw) : null;
    } catch {
      return { exito: false, mensaje: raw || "Respuesta inválida del servidor" };
    }
  };



  // ========= Cargar lista (SOLO activos) =========
  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const url = `${BASE_URL}/api.php?action=trabajadores&op=listar&activos=1`;
      const data = await apiGet(url);

      if (!data?.exito) {
        showToast("error", data?.mensaje || "Error al listar trabajadores");
        setRows([]);
        return;
      }

      setRows(Array.isArray(data.data) ? data.data : []);
    } catch (e) {
      showToast(
        "error",
        String(e?.message || e || "Error al cargar trabajadores")
      );
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // ========= Filtro =========
  const filtrados = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;

    return rows.filter((r) =>
      `${r.id} ${r.nombre ?? ""} ${r.apellido ?? ""} ${r.email ?? ""} ${
        r.rol ?? ""
      } ${r.alias_pago ?? ""}`
        .toLowerCase()
        .includes(s)
    );
  }, [rows, q]);

  // ========= Acciones =========
  const abrirCrear = () => setOpenCrear(true);

  const abrirEditar = (r) => {
    setSel(r);
    setOpenEditar(true);
  };

  const abrirBaja = (r) => {
    setSel(r);
    setOpenBaja(true);
  };


  const cerrarCrear = () => setOpenCrear(false);
  const cerrarEditar = () => setOpenEditar(false);
  const cerrarBaja = () => setOpenBaja(false);

  return (
    <div className="ini_contenedor-principal">
      {toast.open && (
        <Toast
          key={toast.key}
          tipo={toast.tipo}
          mensaje={toast.mensaje}
          duracion={toast.duracion}
          onClose={closeToast}
        />
      )}

      <div className="TP-Wrap TP-Workers">
        <div className="TP-Card">
          <header className="TP-Header">
            <h2 className="TP-Title">Trabajadores</h2>
          </header>

          <section className="TP-Tools">
            <div className="TP-SearchBox">
              <FontAwesomeIcon icon={faMagnifyingGlass} />
              <input
                className="TP-SearchInput"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por nombre, email, rol, alias…"
              />
            </div>

            {/* ✅ Botón para ver listado de bajas */}
            <button
              type="button"
              className="TP-Btn TP-Btn--ghost"
              onClick={() => setOpenBajaListado(true)}
              title="Ver trabajadores dados de baja"
            >
              <FontAwesomeIcon icon={faUsersSlash} />
              <span>Dados de baja</span>
            </button>
          </section>

          {/* ✅ Tabla con columnas definidas en React */}
          <div className="TP-GridTableWrap">
            <div className="TP-GridTable">
              {/* HEAD */}
              <div
                className="TP-GridHead"
                style={{ gridTemplateColumns: COLS.head }}
              >
                <div className="TP-GridTh">ID</div>
                <div className="TP-GridTh">Nombre</div>
                <div className="TP-GridTh">Apellido</div>
                <div className="TP-GridTh">Email</div>
                <div className="TP-GridTh">Rol</div>
                <div className="TP-GridTh">Alias pago</div>
                <div className="TP-GridTh">Activo</div>
                <div className="TP-GridTh TP-GridTh--right">Acciones</div>
              </div>

              {/* BODY */}
              <div className="TP-GridBody">
                {!loading && filtrados.length === 0 ? (
                  <div className="TP-GridEmpty">Sin resultados.</div>
                ) : (
                  filtrados.map((r, idx) => (
                    <div
                      key={r.id}
                      className="TP-GridRow"
                      style={{
                        gridTemplateColumns: COLS.row,
                        animationDelay: `${idx * 0.04}s`,
                      }}
                    >
                        <div className="TP-GridTd" data-label="ID">
                          {r.id}
                        </div>

                        <div className="TP-GridTd" data-label="Nombre">
                          {r.nombre}
                        </div>

                        <div className="TP-GridTd" data-label="Apellido">
                          {r.apellido}
                        </div>

                        <div className="TP-GridTd" data-label="Email">
                          {r.email ?? "—"}
                        </div>

                        <div className="TP-GridTd" data-label="Rol">
                          {r.rol}
                        </div>

                        <div className="TP-GridTd" data-label="Alias pago">
                          {r.alias_pago ?? "—"}
                        </div>

                        <div className="TP-GridTd" data-label="Activo">
                          <span className="TP-Pill TP-Pill--ok">Activo</span>
                        </div>

                        <div
                          className="TP-GridTd TP-GridTd--right"
                          data-label="Acciones"
                        >
                          <div className="TP-RowActions">
                            <button
                              type="button"
                              className="TP-IconBtn TP-IconBtn--edit"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                abrirEditar(r);
                              }}
                              title="Editar"
                              aria-label={`Editar ${r.nombre} ${r.apellido}`}
                            >
                              <FontAwesomeIcon icon={faPenToSquare} />
                            </button>

                            {/* ✅ IMPORTANTE: frenamos evento para evitar glitches */}
                            <button
                              type="button"
                              className="TP-IconBtn TP-IconBtn--del"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                abrirBaja(r);
                              }}
                              title="Dar de baja"
                              aria-label={`Dar de baja a ${r.nombre} ${r.apellido}`}
                            >
                              <FontAwesomeIcon icon={faUserSlash} />
                            </button>
                          </div>
                        </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="TP-FooterActions">
            <button className="TP-Btn" onClick={() => navigate("/panel")}>
              <FontAwesomeIcon icon={faArrowLeft} />
              <span>Volver</span>
            </button>

            <button className="TP-Btn TP-Btn--primary" onClick={abrirCrear}>
              <FontAwesomeIcon icon={faPlus} />
              <span>Agregar</span>
            </button>
          </div>
        </div>
      </div>

      {/* ===== Modales separados ===== */}
      <ModalAgregarTrabajador
        open={openCrear}
        onClose={cerrarCrear}
        onSaved={() => {
          showToast("exito", "Trabajador creado", 2200);
          cargar();
        }}
      />

      <ModalEditarTrabajador
        open={openEditar}
        trabajador={sel}
        onClose={cerrarEditar}
        onSaved={() => {
          showToast("exito", "Trabajador actualizado", 2200);
          cargar();
        }}
      />

      <ModalBajaTrabajador
        open={openBaja}
        trabajador={sel}
        onClose={cerrarBaja}
        onSaved={() => {
          // ✅ lock anti doble disparo
          if (bajaSavedLockRef.current) return;
          bajaSavedLockRef.current = true;

          showToast("exito", "Trabajador dado de baja", 2200);
          cargar();

          // liberamos lock
          setTimeout(() => {
            bajaSavedLockRef.current = false;
          }, 500);
        }}
      />


      {/* ✅ Modal listado de dados de baja */}
      <ModalTrabajadoresBaja
        open={openBajaListado}
        onClose={() => setOpenBajaListado(false)}
        onChanged={() => {
          // si reactivás desde el modal, refrescamos la tabla principal
          cargar();
        }}
      />
    </div>
  );
}
