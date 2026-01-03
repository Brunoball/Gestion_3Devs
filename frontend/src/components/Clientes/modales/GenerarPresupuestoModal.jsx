// src/components/Clientes/modales/GenerarPresupuestoModal.jsx
import React, { useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import "./GenerarPresupuestoModal.css";

import BASE_URL from "../../../config/config";

// ✅ Cabecera real
import CABECERA_IMG from "../../../imagenes/cabezera_presupuesto.png";

/**
 * Ítems base (editables)
 */
const ITEMS_BASE = [
  {
    id: "it1",
    item: "Análisis y planificación",
    desc: "Reuniones + documentación de requerimientos",
    horas: 5,
    unit: 20,
  },
  {
    id: "it2",
    item: "Diseño UI/UX",
    desc: "Bocetos, diseño responsivo, interacción con cliente",
    horas: 5,
    unit: 25,
  },
  {
    id: "it3",
    item: "Desarrollo Frontend",
    desc: "HTML, CSS, JavaScript, React",
    horas: 20,
    unit: 30,
  },
  {
    id: "it4",
    item: "Desarrollo Backend",
    desc: "API, base de datos",
    horas: 25,
    unit: 25,
  },
  {
    id: "it5",
    item: "Testing y QA",
    desc: "Pruebas funcionales y correcciones de errores",
    horas: 2,
    unit: 25,
  },
];

/* =========================
   Helpers
========================= */
function uid() {
  return (
    "it_" +
    Math.random().toString(16).slice(2) +
    "_" +
    Date.now().toString(16)
  );
}

/**
 * ✅ Parser numérico real (NO borra puntos decimales).
 * Acepta "1234.56" o "1234,56" y limpia letras.
 */
function toNumber(raw) {
  if (raw === null || raw === undefined) return 0;
  let s = String(raw).trim();
  if (!s) return 0;

  s = s.replace(/,/g, ".");
  s = s.replace(/[^0-9.]/g, "");

  const firstDot = s.indexOf(".");
  if (firstDot !== -1) {
    const before = s.slice(0, firstDot + 1);
    const after = s.slice(firstDot + 1).replace(/\./g, "");
    s = before + after;
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** número -> string prolija (hasta 2 decimales, sin ceros finales) */
function toNiceNumStr(n, decimals = 2) {
  const num = Number(n);
  if (!Number.isFinite(num)) return "";
  const s = num.toFixed(decimals);
  return s.replace(/\.?0+$/, "");
}

/** horas enteras */
function toInt(raw) {
  if (raw === null || raw === undefined) return 0;
  const s = String(raw).replace(/[^0-9]/g, "");
  if (!s) return 0;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}

function wrap(doc, text, maxWidth) {
  return doc.splitTextToSize(String(text || ""), maxWidth);
}

function todayStr() {
  const hoy = new Date();
  const dd = String(hoy.getDate()).padStart(2, "0");
  const mm = String(hoy.getMonth() + 1).padStart(2, "0");
  const yyyy = hoy.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

async function urlToDataUrl(url) {
  const res = await fetch(url);
  const blob = await res.blob();
  return await new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(blob);
  });
}

/**
 * ✅ Formato total según moneda elegida:
 * - ARS: ARS$ 1.780
 * - USD: USD$ 1.780
 */
function formatMoneyByCurrency(amount, currency) {
  const num = Number(amount || 0);
  const formatted = num.toLocaleString("es-AR", { maximumFractionDigits: 0 });

  if (currency === "USD") return `USD$ ${formatted}`;
  return `ARS$ ${formatted}`;
}

/** Para la tabla: $ + miles (sin decimales) */
function moneyARS(n) {
  const num = Number(n || 0);
  return "$" + num.toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

/** Input decimal */
function normalizeDecimalInput(raw) {
  let s = String(raw ?? "");
  s = s.replace(/,/g, ".");
  s = s.replace(/[^0-9.]/g, "");
  const firstDot = s.indexOf(".");
  if (firstDot !== -1) {
    const before = s.slice(0, firstDot + 1);
    const after = s.slice(firstDot + 1).replace(/\./g, "");
    s = before + after;
  }
  if (s.length > 1 && s[0] === "0" && s[1] !== ".") {
    s = s.replace(/^0+/, "");
    if (s === "") s = "0";
  }
  return s;
}

/** Input entero (horas / total objetivo) */
function normalizeIntInput(raw) {
  let s = String(raw ?? "");
  s = s.replace(/[^0-9]/g, "");
  if (s.length > 1) s = s.replace(/^0+/, "") || "0";
  return s;
}

function isAllowedDecimalKey(e) {
  const k = e.key;
  if (
    k === "Backspace" ||
    k === "Delete" ||
    k === "Tab" ||
    k === "Enter" ||
    k === "Escape" ||
    k === "ArrowLeft" ||
    k === "ArrowRight" ||
    k === "Home" ||
    k === "End"
  ) return true;

  if (e.ctrlKey || e.metaKey) return true;
  if (/^[0-9]$/.test(k)) return true;
  if (k === "." || k === ",") return true;
  return false;
}

function isAllowedIntKey(e) {
  const k = e.key;
  if (
    k === "Backspace" ||
    k === "Delete" ||
    k === "Tab" ||
    k === "Enter" ||
    k === "Escape" ||
    k === "ArrowLeft" ||
    k === "ArrowRight" ||
    k === "Home" ||
    k === "End"
  ) return true;

  if (e.ctrlKey || e.metaKey) return true;
  return /^[0-9]$/.test(k);
}

/**
 * Si no hay espacio, nueva página + cabecera
 */
function ensureSpace(doc, y, needed, drawHeaderFn) {
  const pageH = doc.internal.pageSize.getHeight();
  const bottom = 12;
  if (y + needed <= pageH - bottom) return y;

  doc.addPage();
  drawHeaderFn?.();
  return 62;
}

/* =========================
   Cabecera PNG + fecha blanca
========================= */
function buildHeaderDrawer(doc, headerDataUrl) {
  const headerW = 210;
  const headerH = 45;

  return () => {
    try {
      if (headerDataUrl) {
        doc.addImage(headerDataUrl, "PNG", 0, 0, headerW, headerH);
      }
    } catch {}

    const fecha = todayStr();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(255, 255, 255);
    doc.text(`Fecha: ${fecha}`, 205, 14, { align: "right" });
    doc.setTextColor(0, 0, 0);
  };
}

function drawSectionTitle(doc, x, y, text) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.text(text, x, y);
}

function drawDarkInfoBar(doc, x, y, w, text) {
  doc.setFillColor(36, 52, 67);
  const lines = wrap(doc, text, w - 8);
  const h = Math.max(10, lines.length * 5.2 + 4);
  doc.rect(x, y - 6, w, h, "F");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  lines.forEach((ln, i) => doc.text(ln, x + 4, y + i * 5.2));
  doc.setTextColor(0, 0, 0);

  return y - 6 + h;
}

// ✅ Ahora el precio se formatea por moneda (ARS/USD) igual que el total
function drawPlanBox(doc, x, y, w, title, desc, price, currency, rgbTitle, rgbDesc) {
  doc.setFillColor(...rgbTitle);
  doc.rect(x, y, w, 10, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.text(title, x + 4, y + 7);

  const priceStr = formatMoneyByCurrency(price, currency);
  doc.text(priceStr, x + w - 4, y + 7, { align: "right" });

  doc.setFillColor(...rgbDesc);
  const lines = wrap(doc, desc, w - 8);
  const descH = Math.max(12, lines.length * 5.2 + 6);
  doc.rect(x, y + 10, w, descH, "F");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const startTextY = y + 10 + 6;
  lines.forEach((ln, i) => doc.text(ln, x + 4, startTextY + i * 5.2));

  return y + 10 + descH;
}

function estimatePlanBoxHeight(doc, w, desc) {
  const lines = wrap(doc, desc, w - 8);
  const descH = Math.max(12, lines.length * 5.2 + 6);
  return 10 + descH + 6;
}

export default function GenerarPresupuestoModal({ open, onClose, onToast }) {
  const [razonSocial, setRazonSocial] = useState("");
  const [proyecto, setProyecto] = useState("");
  const [rows, setRows] = useState(ITEMS_BASE);
  const [headerDataUrl, setHeaderDataUrl] = useState("");

  // ✅ Moneda elegida
  const [currency, setCurrency] = useState("ARS");

  // ✅ Monto total objetivo (input arriba)
  const [targetTotal, setTargetTotal] = useState("");

  // ✅ Planes desde DB
  const [planes, setPlanes] = useState([]);

  const total = useMemo(() => {
    return rows.reduce((acc, r) => {
      const horas = toInt(r.horas);
      const unit = toNumber(r.unit);
      return acc + horas * unit;
    }, 0);
  }, [rows]);

  useEffect(() => {
    if (!open) return;

    setRazonSocial("");
    setProyecto("");
    setCurrency("ARS");
    setTargetTotal("");
    setPlanes([]);

    setRows(ITEMS_BASE.map((x) => ({ ...x, id: x.id || uid() })));

    // cabecera
    (async () => {
      try {
        const durl = await urlToDataUrl(CABECERA_IMG);
        setHeaderDataUrl(durl);
      } catch {
        setHeaderDataUrl("");
      }
    })();

    // ✅ cargar planes mantenimiento desde DB
    (async () => {
      try {
        const url = `${BASE_URL}/api.php?action=clientes&op=planes_mantenimiento_list`;
        const res = await fetch(url);
        const data = await res.json();

        if (!data?.exito) {
          setPlanes([]);
          onToast?.("advertencia", data?.mensaje || "No se pudieron cargar los planes.");
          return;
        }

        const arr = Array.isArray(data?.data) ? data.data : [];
        setPlanes(arr);
      } catch (e) {
        setPlanes([]);
        onToast?.("advertencia", "Error de red al cargar planes de mantenimiento.");
      }
    })();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const onChangeRow = (id, key, value) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [key]: value } : r))
    );
  };

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      { id: uid(), item: "", desc: "", horas: "", unit: "" },
    ]);
  };

  const removeRow = (id) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const moveRow = (id, dir) => {
    setRows((prev) => {
      const idx = prev.findIndex((x) => x.id === id);
      if (idx < 0) return prev;
      const nextIdx = idx + dir;
      if (nextIdx < 0 || nextIdx >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[nextIdx]] = [copy[nextIdx], copy[idx]];
      return copy;
    });
  };

  /**
   * ✅ Distribuir "Monto total" SOLO tocando precios (unit),
   * y dejando HORAS enteras.
   */
  const applyTargetTotal = () => {
    const t = toNumber(targetTotal);
    if (!t || t <= 0) return;

    setRows((prev) => {
      if (!prev.length) return prev;

      // 1) asegurar horas enteras >= 1
      const fixed = prev.map((r) => {
        const h = toInt(r.horas);
        const horas = h > 0 ? h : 1;
        return { ...r, horas: String(horas) };
      });

      // 2) pesos por subtotal actual (horas*unit)
      const subs = fixed.map((r) => toInt(r.horas) * toNumber(r.unit));
      let sumSubs = subs.reduce((a, b) => a + b, 0);

      // si todo es 0 -> pesos iguales
      if (!sumSubs || sumSubs <= 0) {
        sumSubs = fixed.length;
        for (let i = 0; i < subs.length; i++) subs[i] = 1;
      }

      // 3) calcular unit por fila para que cierre exacto
      const out = [...fixed];
      let acumulado = 0;

      for (let i = 0; i < out.length; i++) {
        const horas = toInt(out[i].horas);

        if (i === out.length - 1) {
          const restante = Math.max(0, t - acumulado);
          const unit = restante / horas;
          out[i] = { ...out[i], unit: toNiceNumStr(unit, 2) };
        } else {
          const share = (t * subs[i]) / sumSubs;
          const unit = share / horas;

          const unitRounded = Number(toNiceNumStr(unit, 2));
          const subRounded = horas * unitRounded;

          acumulado += subRounded;
          out[i] = { ...out[i], unit: toNiceNumStr(unit, 2) };
        }
      }

      return out;
    });

    onToast?.("exito", "Monto total aplicado ajustando precios por hora.");
  };

  const generarPDF = () => {
    const rs = (razonSocial || "").trim();
    const pr = (proyecto || "").trim();
    if (!rs) return onToast?.("advertencia", "Ingresá la razón social.");
    if (!pr) return onToast?.("advertencia", "Ingresá el proyecto.");
    if (!rows.length)
      return onToast?.("advertencia", "Agregá al menos una fila al detalle.");

    const doc = new jsPDF("p", "mm", "a4");
    const drawHeader = buildHeaderDrawer(doc, headerDataUrl);

    drawHeader();

    const marginX = 14;
    const contentW = 210 - marginX * 2;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(0, 0, 0);
    doc.text("PRESUPUESTO", 105, 58, { align: "center" });

    let y = 62;

    // 1. Datos del cliente
    y = ensureSpace(doc, y, 30, drawHeader);
    drawSectionTitle(doc, marginX, y, "1. Datos del cliente");
    y += 10;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(`Nombre o razón social: ${rs}`, marginX, y);
    y += 7;
    doc.text(`Proyecto: ${pr}`, marginX, y);

    // 2. Detalle
    y += 14;
    y = ensureSpace(doc, y, 25, drawHeader);
    drawSectionTitle(doc, marginX, y, "2. Detalle del presupuesto");
    y += 6;

    const body = rows.map((r) => {
      const horas = toInt(r.horas);
      const unit = toNumber(r.unit);
      const subtotal = horas * unit;
      return [
        (r.item || "").trim(),
        (r.desc || "").trim(),
        String(horas),
        moneyARS(unit),
        moneyARS(subtotal),
      ];
    });

    autoTable(doc, {
      startY: y,
      head: [
        ["Ítem", "Descripción", "Cantidad (horas)", "Precio Unitario", "Subtotal"],
      ],
      body,
      styles: { font: "helvetica", fontSize: 9, cellPadding: 2, valign: "middle" },
      headStyles: { fillColor: [109, 158, 235], textColor: 0, fontStyle: "bold" },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 78 },
        2: { cellWidth: 28, halign: "center" },
        3: { cellWidth: 28, halign: "right" },
        4: { cellWidth: 28, halign: "right" },
      },
      margin: { left: marginX, right: marginX },
      theme: "grid",
      didDrawPage: () => drawHeader(),
    });

    y = (doc.lastAutoTable?.finalY || y + 40) + 8;

    // ✅ Total final en PDF con ARS o USD explícito
    y = ensureSpace(doc, y, 15, drawHeader);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Total final", 140, y);
    doc.text(formatMoneyByCurrency(total, currency), 195, y, { align: "right" });

    // 3. Costo mensual
    y += 10;
    y = ensureSpace(doc, y, 12, drawHeader);
    drawSectionTitle(doc, marginX, y, "3. Costo mensual");
    y += 6;

    // ✅ Colores (se asignan por índice, cíclico)
    const palette = [
      { rgbTitle: [213, 166, 189], rgbDesc: [234, 209, 220] },
      { rgbTitle: [182, 215, 168], rgbDesc: [217, 234, 211] },
      { rgbTitle: [246, 178, 107], rgbDesc: [249, 203, 156] },
      { rgbTitle: [255, 217, 102], rgbDesc: [255, 229, 153] },
      { rgbTitle: [164, 194, 244], rgbDesc: [201, 218, 248] },
    ];

    const planesToUse = Array.isArray(planes) ? planes : [];

    if (!planesToUse.length) {
      // no rompe el PDF, pero avisa
      onToast?.("advertencia", "No hay planes de mantenimiento activos en la DB.");
    }

    for (let i = 0; i < planesToUse.length; i++) {
      const p = planesToUse[i];
      const colors = palette[i % palette.length];

      const title = String(p?.nombre || "").trim() || "Plan";
      const desc = String(p?.descripcion || "").trim() || "";
      const price = Number(p?.monto || 0);

      const need = estimatePlanBoxHeight(doc, contentW, desc);
      y = ensureSpace(doc, y, need, drawHeader);

      y =
        drawPlanBox(
          doc,
          marginX,
          y,
          contentW,
          title,
          desc,
          price,
          currency, // ✅ misma moneda elegida
          colors.rgbTitle,
          colors.rgbDesc
        ) + 6;
    }

    // Barra oscura
    y = ensureSpace(doc, y, 18, drawHeader);
    y =
      drawDarkInfoBar(
        doc,
        marginX,
        y + 6,
        contentW,
        "Se garantiza respuesta inmediata a las situaciones problemáticas o nuevos requerimientos de los clientes."
      ) + 12;

    // 4. Condiciones
    y = ensureSpace(doc, y, 45, drawHeader);
    drawSectionTitle(doc, marginX, y, "4. Condiciones");
    y += 8;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.text("Tiempo estimado de entrega: 4 semanas", marginX, y);
    y += 6;
    doc.text("Forma de pago: 50% al inicio, 50% contra entrega", marginX, y);
    y += 6;
    doc.text("Medio de pago: Transferencia o Efectivo.", marginX, y);
    y += 6;
    doc.text("Validez del presupuesto: 15 días", marginX, y);
    y += 10;

    // Barra oscura final
    y = ensureSpace(doc, y, 18, drawHeader);
    y =
      drawDarkInfoBar(
        doc,
        marginX,
        y + 6,
        contentW,
        "Cada plan puede ajustarse en función del volumen de trabajo o complejidad técnica."
      ) + 10;

    // Firma (evitar hoja sola)
    const pageH = doc.internal.pageSize.getHeight();
    const signBlockH = 18;
    const canFitSignatureHere = y + signBlockH <= pageH - 10;

    if (!canFitSignatureHere) {
      doc.addPage();
      drawHeader();
    }

    const finalPageH = doc.internal.pageSize.getHeight();
    const anchorY = finalPageH - 18;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text("Ing. Franco Valverde", 195, anchorY, { align: "right" });
    doc.text("Project Manager", 195, anchorY + 5, { align: "right" });
    doc.text("3Devs.Solutions", 195, anchorY + 10, { align: "right" });

    const fechaFile = todayStr();
    const fileNameSafe = rs.replace(/[\\/:*?"<>|]+/g, "").slice(0, 60);
    doc.save(`Presupuesto_${fileNameSafe || "cliente"}_${fechaFile}.pdf`);

    onToast?.("exito", "Presupuesto generado.");
    onClose?.();
  };

  if (!open) return null;

  return (
    <div className="pres_modal_backdrop" role="dialog" aria-modal="true">
      <div className="pres_modal_card">
        <div className="pres_modal_head">
          <div className="pres_modal_title">Generar presupuesto</div>
          <button className="pres_close" onClick={onClose} type="button">
            ✕
          </button>
        </div>

        <div className="pres_modal_body">
          <div className="pres_grid">
            <label className="pres_lbl">
              Razón social
              <input
                className="pres_in"
                value={razonSocial}
                onChange={(e) => setRazonSocial(e.target.value)}
                placeholder='Ej: IPET N° 50 “Ing. Emilio F. Olmos”'
              />
            </label>

            <label className="pres_lbl">
              Proyecto
              <input
                className="pres_in"
                value={proyecto}
                onChange={(e) => setProyecto(e.target.value)}
                placeholder='Ej: “Desarrollo de Página Web Educativa”'
              />
            </label>
          </div>

          <div className="pres_table_wrap">
            <div
              className="pres_table_title"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <span>Detalle del presupuesto</span>

              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                {/* ✅ Monto total objetivo */}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 800 }}>Monto total:</span>

                  <input
                    className="pres_in"
                    style={{ width: 180, padding: "8px 10px", fontSize: 12 }}
                    inputMode="numeric"
                    value={targetTotal}
                    placeholder="Ej: 1000000"
                    onKeyDown={(e) => {
                      if (!isAllowedIntKey(e)) e.preventDefault();
                    }}
                    onChange={(e) => setTargetTotal(normalizeIntInput(e.target.value))}
                    onPaste={(e) => {
                      e.preventDefault();
                      const txt = e.clipboardData.getData("text");
                      setTargetTotal(normalizeIntInput(txt));
                    }}
                    onBlur={applyTargetTotal}
                    title="Ingresá el monto total y salí del campo para distribuirlo ajustando precios por hora"
                  />

                  <button
                    type="button"
                    className="pres_btn ghost"
                    onClick={applyTargetTotal}
                    style={{ padding: "8px 10px", fontSize: 12 }}
                  >
                    Aplicar
                  </button>
                </div>

                <button
                  type="button"
                  className="pres_btn"
                  onClick={addRow}
                  style={{ padding: "8px 12px", fontSize: 12 }}
                >
                  + Agregar fila
                </button>
              </div>
            </div>

            <table className="pres_table">
              <thead>
                <tr>
                  <th style={{ width: 210 }}>Ítem</th>
                  <th>Descripción</th>
                  <th style={{ width: 120 }}>Horas</th>
                  <th style={{ width: 160 }}>Monto (por hora)</th>
                  <th style={{ width: 140 }}>Subtotal</th>
                  <th style={{ width: 120 }}>Acciones</th>
                </tr>
              </thead>

              <tbody>
                {rows.map((r, idx) => {
                  const horasInt = toInt(r.horas);
                  const unitNum = toNumber(r.unit);
                  const sub = horasInt * unitNum;

                  return (
                    <tr key={r.id}>
                      <td>
                        <input
                          className="pres_cell_in"
                          value={r.item}
                          onChange={(e) => onChangeRow(r.id, "item", e.target.value)}
                          placeholder="Ej: Desarrollo de módulo X"
                        />
                      </td>

                      <td>
                        <input
                          className="pres_cell_in"
                          value={r.desc}
                          onChange={(e) => onChangeRow(r.id, "desc", e.target.value)}
                          placeholder="Ej: Implementación + pruebas + deploy"
                        />
                      </td>

                      {/* ✅ HORAS ENTERAS */}
                      <td>
                        <input
                          className="pres_cell_in"
                          inputMode="numeric"
                          value={r.horas}
                          placeholder="0"
                          onKeyDown={(e) => {
                            if (!isAllowedIntKey(e)) e.preventDefault();
                          }}
                          onChange={(e) =>
                            onChangeRow(r.id, "horas", normalizeIntInput(e.target.value))
                          }
                          onPaste={(e) => {
                            e.preventDefault();
                            const txt = e.clipboardData.getData("text");
                            onChangeRow(r.id, "horas", normalizeIntInput(txt));
                          }}
                        />
                      </td>

                      {/* ✅ UNIT DECIMAL */}
                      <td>
                        <input
                          className="pres_cell_in"
                          inputMode="decimal"
                          value={r.unit}
                          placeholder="0"
                          onKeyDown={(e) => {
                            if (!isAllowedDecimalKey(e)) e.preventDefault();
                          }}
                          onChange={(e) =>
                            onChangeRow(r.id, "unit", normalizeDecimalInput(e.target.value))
                          }
                          onPaste={(e) => {
                            e.preventDefault();
                            const txt = e.clipboardData.getData("text");
                            onChangeRow(r.id, "unit", normalizeDecimalInput(txt));
                          }}
                        />
                      </td>

                      <td className="pres_td_money">{moneyARS(sub)}</td>

                      <td style={{ display: "flex", gap: 6, justifyContent: "center" }}>
                        <button
                          type="button"
                          className="pres_btn ghost"
                          onClick={() => moveRow(r.id, -1)}
                          disabled={idx === 0}
                          title="Subir"
                          style={{ padding: "6px 10px", fontSize: 12 }}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="pres_btn ghost"
                          onClick={() => moveRow(r.id, 1)}
                          disabled={idx === rows.length - 1}
                          title="Bajar"
                          style={{ padding: "6px 10px", fontSize: 12 }}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className="pres_btn ghost"
                          onClick={() => removeRow(r.id)}
                          disabled={rows.length === 1}
                          title="Eliminar"
                          style={{ padding: "6px 10px", fontSize: 12 }}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              <tfoot>
                <tr>
                  <td colSpan={3} />
                  <td colSpan={1} style={{ textAlign: "left" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14, fontWeight: 700 }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input
                          type="radio"
                          name="currency_total"
                          checked={currency === "ARS"}
                          onChange={() => setCurrency("ARS")}
                        />
                        ARS
                      </label>

                      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input
                          type="radio"
                          name="currency_total"
                          checked={currency === "USD"}
                          onChange={() => setCurrency("USD")}
                        />
                        USD
                      </label>
                    </div>
                  </td>

                  <td style={{ textAlign: "right", fontWeight: 800 }}>Total final</td>
                  <td className="pres_td_money" style={{ fontWeight: 900 }}>
                    {formatMoneyByCurrency(total, currency)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className="pres_modal_actions">
          <button className="pres_btn ghost" onClick={onClose} type="button">
            Cancelar
          </button>
          <button className="pres_btn" onClick={generarPDF} type="button">
            Generar PDF
          </button>
        </div>
      </div>
    </div>
  );
}
