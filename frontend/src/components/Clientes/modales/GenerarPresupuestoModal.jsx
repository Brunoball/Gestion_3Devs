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

async function obtenerDolarOficialVenta() {
  const res = await fetch(`${BASE_URL}/api.php?action=dolar_oficial`);
  const data = await res.json();

  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || "No se pudo obtener la cotización del dólar.");
  }

  const venta = toNumber(data?.venta);
  if (!venta || venta <= 0) {
    throw new Error("La cotización del dólar recibida no es válida.");
  }

  return {
    venta,
    compra: toNumber(data?.compra),
    fuente: data?.fuente || "Dólar Oficial",
    fecha: data?.fecha || "",
  };
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

// Compatibilidad con bases viejas: antes planes_mantenimiento.monto estaba cargado en USD
// (ej.: 45, 65, 120). Desde el cambio nuevo se guarda en ARS. Si una DB todavía no
// fue migrada, no hay que dividir 45 por el dólar porque en PDF termina mostrando USD$ 0.
const PLAN_LEGACY_USD_THRESHOLD = 1000;

function planLooksLegacyUSD(monto, dolarVenta) {
  const n = Number(monto || 0);
  const r = Number(dolarVenta || 0);
  return Number.isFinite(n) && n > 0 && n < PLAN_LEGACY_USD_THRESHOLD && Number.isFinite(r) && r > 0;
}

function planMontoForCurrency(monto, currency, dolarVenta) {
  const n = Number(monto || 0);
  const r = Number(dolarVenta || 0);
  if (!Number.isFinite(n) || n <= 0) return 0;

  const legacyUsd = planLooksLegacyUSD(n, r);

  if (currency === "USD") {
    // DB vieja: monto ya era USD, se muestra directo.
    if (legacyUsd) return n;
    // DB nueva: monto está en ARS, se convierte a USD.
    return Number.isFinite(r) && r > 0 ? n / r : 0;
  }

  // PDF en pesos: DB vieja se convierte USD -> ARS; DB nueva se muestra directo.
  if (legacyUsd) return n * r;
  return n;
}

function getPlanId(plan) {
  return String(plan?.id ?? plan?.id_plan ?? plan?.nombre ?? "");
}

function getPlanPreviewAmount(plan, currency, dolarVenta) {
  const montoBase = Number(plan?.monto || 0);
  if (!montoBase || montoBase <= 0) return formatMoneyByCurrency(0, currency);

  const r = Number(dolarVenta || 0);
  if (currency === "USD" && (!Number.isFinite(r) || r <= 0)) {
    // Si no llegó todavía la cotización, no muestres USD$ 0 por error.
    // Para bases viejas con valores chicos, el monto ya era USD.
    if (montoBase > 0 && montoBase < PLAN_LEGACY_USD_THRESHOLD) {
      return formatMoneyByCurrency(montoBase, "USD");
    }
    return "USD a calcular";
  }

  return formatMoneyByCurrency(
    planMontoForCurrency(montoBase, currency, r),
    currency
  );
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
  )
    return true;

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
  )
    return true;

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

// ✅ El precio se formatea según la moneda elegida en el presupuesto.
// Los planes vienen guardados en ARS y solo se convierten a USD para mostrar el PDF si el usuario elige dólares.
function drawPlanBox(
  doc,
  x,
  y,
  w,
  title,
  desc,
  price,
  currency,
  rgbTitle,
  rgbDesc
) {
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

export default function GenerarPresupuestoModal({
  open,
  onClose,
  onToast,
  sessionKey = "",
  organizationId = 0,
  organizationName = "",
}) {
  const [activeTab, setActiveTab] = useState("cliente");
  const [razonSocial, setRazonSocial] = useState("");
  const [proyecto, setProyecto] = useState("");
  const [rows, setRows] = useState(ITEMS_BASE);
  const [headerDataUrl, setHeaderDataUrl] = useState("");

  // ✅ Moneda elegida para el presupuesto. Por defecto pesos, pero se puede emitir en dólares.
  const [currency, setCurrency] = useState("ARS");

  // ✅ Monto total objetivo (input arriba)
  const [targetTotal, setTargetTotal] = useState("");

  // ✅ Planes desde DB
  const [planes, setPlanes] = useState([]);
  const [selectedPlanIds, setSelectedPlanIds] = useState([]);

  // ✅ Cotización desde backend/modules/global/obtener_dolar.php para convertir planes ARS -> USD si se emite en dólares.
  const [dolarOficial, setDolarOficial] = useState(null);

  const total = useMemo(() => {
    return rows.reduce((acc, r) => {
      const horas = toInt(r.horas);
      const unit = toNumber(r.unit);
      return acc + horas * unit;
    }, 0);
  }, [rows]);

  const selectedPlanes = useMemo(() => {
    const selected = new Set(selectedPlanIds.map(String));
    return (Array.isArray(planes) ? planes : []).filter((p) =>
      selected.has(getPlanId(p))
    );
  }, [planes, selectedPlanIds]);

  useEffect(() => {
    if (!open) return;

    setRazonSocial("");
    setProyecto("");
    setActiveTab("cliente");
    setCurrency("ARS");
    setTargetTotal("");
    setPlanes([]);
    setSelectedPlanIds([]);
    setDolarOficial(null);

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

    // ✅ precargar dólar oficial. Si falla, no bloquea: solo se necesita si se elige USD.
    (async () => {
      try {
        const dolar = await obtenerDolarOficialVenta();
        setDolarOficial(dolar);
      } catch {
        setDolarOficial(null);
      }
    })();

    // ✅ cargar planes mantenimiento desde DB
    (async () => {
      try {
        const url = `${BASE_URL}/api.php?action=clientes&op=planes_mantenimiento_list`;
        const res = await fetch(url, {
          headers: {
            "X-Session": sessionKey,
            "X-Organization": String(organizationId || ""),
          },
        });
        const data = await res.json();

        if (!data?.exito) {
          setPlanes([]);
          onToast?.(
            "advertencia",
            data?.mensaje || "No se pudieron cargar los planes."
          );
          return;
        }

        const arr = Array.isArray(data?.data) ? data.data : [];
        setPlanes(arr);
        // Por defecto quedan todos marcados, así el comportamiento viejo no se rompe.
        // Después podés destildar los planes que no querés que salgan en el PDF.
        setSelectedPlanIds(arr.map((p) => getPlanId(p)).filter(Boolean));
      } catch (e) {
        setPlanes([]);
        onToast?.(
          "advertencia",
          "Error de red al cargar planes de mantenimiento."
        );
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sessionKey, organizationId]);

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

  const togglePlan = (planId) => {
    const id = String(planId || "");
    if (!id) return;

    setSelectedPlanIds((prev) => {
      const set = new Set(prev.map(String));
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return Array.from(set);
    });
  };

  const selectAllPlans = () => {
    setSelectedPlanIds((Array.isArray(planes) ? planes : []).map((p) => getPlanId(p)).filter(Boolean));
  };

  const clearSelectedPlans = () => setSelectedPlanIds([]);

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

  const asegurarDolarOficial = async () => {
    if (dolarOficial?.venta && dolarOficial.venta > 0) return dolarOficial;

    const dolar = await obtenerDolarOficialVenta();
    setDolarOficial(dolar);
    return dolar;
  };

  const generarPDF = async () => {
    const rs = (razonSocial || "").trim();
    const pr = (proyecto || "").trim();
    if (!rs) {
      setActiveTab("cliente");
      return onToast?.("advertencia", "Ingresá la razón social.");
    }
    if (!pr) {
      setActiveTab("cliente");
      return onToast?.("advertencia", "Ingresá el proyecto.");
    }
    if (!rows.length) {
      setActiveTab("detalle");
      return onToast?.("advertencia", "Agregá al menos una fila al detalle.");
    }

    let dolarParaPDF = dolarOficial;
    const planesDisponibles = Array.isArray(planes) ? planes : [];
    const planesToUse = Array.isArray(selectedPlanes) ? selectedPlanes : [];

    // Los planes de mantenimiento se guardan en ARS.
    // Si el presupuesto se emite en USD, se convierten solo para mostrar el PDF.
    if (currency === "USD" && planesToUse.length > 0) {
      try {
        dolarParaPDF = await asegurarDolarOficial();
      } catch (e) {
        return onToast?.(
          "advertencia",
          e?.message ||
            "No se pudo obtener el dólar actual para convertir los mantenimientos a dólares."
        );
      }
    }

    const doc = new jsPDF("p", "mm", "a4");
    const drawHeader = buildHeaderDrawer(doc, headerDataUrl);

    drawHeader();

    const marginX = 14;
    const contentW = 210 - marginX * 2;

    // ✅ TÍTULO: tipografía distinta + centrado real
    const pageW = doc.internal.pageSize.getWidth();
    doc.setFont("times", "bold");
    doc.setFontSize(22);
    doc.setTextColor(0, 0, 0);
    doc.text("PRESUPUESTO", pageW / 2, 58, { align: "center" });

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
        formatMoneyByCurrency(unit, currency),
        formatMoneyByCurrency(subtotal, currency),
      ];
    });

    autoTable(doc, {
      startY: y,
      head: [
        ["Ítem", "Descripción", "Cantidad (horas)", "Precio Unitario", "Subtotal"],
      ],
      body,
      styles: {
        font: "helvetica",
        fontSize: 9,
        cellPadding: 2,
        valign: "middle",
      },
      headStyles: { fillColor: [109, 158, 235], textColor: 0, fontStyle: "bold" },
      tableWidth: contentW,
      columnStyles: {
        0: { cellWidth: 32 },
        1: { cellWidth: 74 },
        2: { cellWidth: 26, halign: "center" },
        3: { cellWidth: 25, halign: "center" },
        4: { cellWidth: 25, halign: "center" },
      },
      margin: { left: marginX, right: marginX },
      theme: "grid",
      didDrawPage: () => drawHeader(),
    });

    y = (doc.lastAutoTable?.finalY || y + 40) + 8;

    // ✅ Total final alineado al borde derecho REAL de la tabla
    y = ensureSpace(doc, y, 15, drawHeader);

    const tbl = doc.lastAutoTable;
    const tableRight =
      tbl?.finalX && tbl?.table?.width
        ? tbl.finalX + tbl.table.width
        : marginX + contentW;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Total final", tableRight - 45, y, { align: "right" });
    doc.text(formatMoneyByCurrency(total, currency), tableRight, y, {
      align: "right",
    });

    // ✅ Colores (se asignan por índice, cíclico)
    const palette = [
      { rgbTitle: [213, 166, 189], rgbDesc: [234, 209, 220] },
      { rgbTitle: [182, 215, 168], rgbDesc: [217, 234, 211] },
      { rgbTitle: [246, 178, 107], rgbDesc: [249, 203, 156] },
      { rgbTitle: [255, 217, 102], rgbDesc: [255, 229, 153] },
      { rgbTitle: [164, 194, 244], rgbDesc: [201, 218, 248] },
    ];

    if (!planesDisponibles.length) {
      onToast?.("advertencia", "No hay planes de mantenimiento activos en la DB.");
    }

    if (planesToUse.length > 0) {
      // 3. Costo mensual
      y += 10;
      y = ensureSpace(doc, y, 12, drawHeader);
      drawSectionTitle(doc, marginX, y, "3. Costo mensual");
      y += 6;

      for (let i = 0; i < planesToUse.length; i++) {
        const p = planesToUse[i];
        const colors = palette[i % palette.length];

        const title = String(p?.nombre || "").trim() || "Plan";
        const desc = String(p?.descripcion || "").trim() || "";
        const montoBase = Number(p?.monto || 0);
        const planCurrency = currency === "USD" ? "USD" : "ARS";
        const planPrice = planMontoForCurrency(
          montoBase,
          planCurrency,
          Number(dolarParaPDF?.venta || 0)
        );

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
            planPrice,
            planCurrency, // ✅ ARS por defecto; USD si el presupuesto se emite en dólares
            colors.rgbTitle,
            colors.rgbDesc
          ) + 6;
      }

      // Barra oscura de mantenimiento: solo tiene sentido si salen planes en el PDF.
      y = ensureSpace(doc, y, 18, drawHeader);
      y =
        drawDarkInfoBar(
          doc,
          marginX,
          y + 6,
          contentW,
          "Se garantiza respuesta inmediata a las situaciones problemáticas o nuevos requerimientos de los clientes."
        ) + 12;
    }

    const condicionesNumero = planesToUse.length > 0 ? 4 : 3;

    // Condiciones
    y = ensureSpace(doc, y, 45, drawHeader);
    drawSectionTitle(doc, marginX, y, `${condicionesNumero}. Condiciones`);
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

    // Barra oscura final: solo si el presupuesto incluye planes.
    if (planesToUse.length > 0) {
      y = ensureSpace(doc, y, 18, drawHeader);
      y =
        drawDarkInfoBar(
          doc,
          marginX,
          y + 6,
          contentW,
          "Cada plan puede ajustarse en función del volumen de trabajo o complejidad técnica."
        ) + 10;
    }

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
    <div
      className="mi-modal__overlay pres_modal_overlay"
      role="dialog"
      aria-modal="true"
      onClick={(e) =>
        e.target.classList.contains("mi-modal__overlay") && onClose?.()
      }
    >
      <div
        className="mi-modal__container pres_modal_container"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mi-modal__header pres_modal_header">
          <div className="mi-modal__head-left">
            <h2 className="mi-modal__title">Generar presupuesto</h2>
            {organizationName ? (
              <div className="pres_modal_org">Empresa: {organizationName}</div>
            ) : null}
            <p className="mi-modal__subtitle">
              Completá los datos y generá el PDF
            </p>
          </div>

          <button
            className="mi-modal__close"
            onClick={onClose}
            aria-label="Cerrar"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="mit-modal__body">
          <div className="pres_tabs" role="tablist" aria-label="Secciones del presupuesto">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "cliente"}
              className={`pres_tab ${activeTab === "cliente" ? "is-active" : ""}`}
              onClick={() => setActiveTab("cliente")}
            >
              <span className="pres_tab_number">1</span>
              Cliente
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "detalle"}
              className={`pres_tab ${activeTab === "detalle" ? "is-active" : ""}`}
              onClick={() => setActiveTab("detalle")}
            >
              <span className="pres_tab_number">2</span>
              Detalle
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "planes"}
              className={`pres_tab ${activeTab === "planes" ? "is-active" : ""}`}
              onClick={() => setActiveTab("planes")}
            >
              <span className="pres_tab_number">3</span>
              Planes
            </button>
          </div>

          <div className="mi-tabpanel is-active">
            <div className="mi-grid">
              {activeTab === "cliente" && (
              <article className="mi-card mi-card--full pres_tab_card">
                <h3 className="mi-card__title">1. Datos del cliente</h3>

                <div className="fl-grid">
                  <div className="fl-field">
                    <input
                      className="fl-input"
                      placeholder=" "
                      value={razonSocial}
                      onChange={(e) => setRazonSocial(e.target.value)}
                    />
                    <label className="fl-label">Razón social *</label>
                  </div>

                  <div className="fl-field">
                    <input
                      className="fl-input"
                      placeholder=" "
                      value={proyecto}
                      onChange={(e) => setProyecto(e.target.value)}
                    />
                    <label className="fl-label">Proyecto *</label>
                  </div>
                </div>
              </article>
              )}

              {activeTab === "detalle" && (
              <article className="mi-card mi-card--full pres_tab_card">
                <h3 className="mi-card__title">2. Detalle del presupuesto</h3>

                <div className="pres_table_title2">
                  <div style={{ fontWeight: 900, color: "var(--mi-text)" }}>
                    Detalle del presupuesto
                  </div>

                  <div className="pres_tools">
                    <div className="pres_tool_group">
                      <span className="pres_tool_lbl">Monto total:</span>

                      <input
                        className="fl-input pres_tool_in"
                        inputMode="numeric"
                        value={targetTotal}
                        placeholder=" "
                        onKeyDown={(e) => {
                          if (!isAllowedIntKey(e)) e.preventDefault();
                        }}
                        onChange={(e) =>
                          setTargetTotal(normalizeIntInput(e.target.value))
                        }
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
                        className="mit-btn mit-btn--ghost"
                        onClick={applyTargetTotal}
                      >
                        Aplicar
                      </button>
                    </div>

                    <button
                      type="button"
                      className="mit-btn mit-btn--solid"
                      onClick={addRow}
                    >
                      + Agregar fila
                    </button>
                  </div>
                </div>

                <div className="pres_table_wrap2">
                  <table className="pres_table2">
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
                                className="pres_cell_in2"
                                value={r.item}
                                onChange={(e) =>
                                  onChangeRow(r.id, "item", e.target.value)
                                }
                                placeholder="Ej: Desarrollo de módulo X"
                              />
                            </td>

                            <td>
                              <input
                                className="pres_cell_in2"
                                value={r.desc}
                                onChange={(e) =>
                                  onChangeRow(r.id, "desc", e.target.value)
                                }
                                placeholder="Ej: Implementación + pruebas + deploy"
                              />
                            </td>

                            <td>
                              <input
                                className="pres_cell_in2 pres_cell_num"
                                inputMode="numeric"
                                value={r.horas}
                                placeholder="0"
                                onKeyDown={(e) => {
                                  if (!isAllowedIntKey(e)) e.preventDefault();
                                }}
                                onChange={(e) =>
                                  onChangeRow(
                                    r.id,
                                    "horas",
                                    normalizeIntInput(e.target.value)
                                  )
                                }
                                onPaste={(e) => {
                                  e.preventDefault();
                                  const txt = e.clipboardData.getData("text");
                                  onChangeRow(
                                    r.id,
                                    "horas",
                                    normalizeIntInput(txt)
                                  );
                                }}
                              />
                            </td>

                            <td>
                              <input
                                className="pres_cell_in2 pres_cell_num"
                                inputMode="decimal"
                                value={r.unit}
                                placeholder="0"
                                onKeyDown={(e) => {
                                  if (!isAllowedDecimalKey(e))
                                    e.preventDefault();
                                }}
                                onChange={(e) =>
                                  onChangeRow(
                                    r.id,
                                    "unit",
                                    normalizeDecimalInput(e.target.value)
                                  )
                                }
                                onPaste={(e) => {
                                  e.preventDefault();
                                  const txt = e.clipboardData.getData("text");
                                  onChangeRow(
                                    r.id,
                                    "unit",
                                    normalizeDecimalInput(txt)
                                  );
                                }}
                              />
                            </td>

                            <td className="pres_td_money2">{formatMoneyByCurrency(sub, currency)}</td>

                            <td className="pres_actions2">
                              <button
                                type="button"
                                className="mit-btn mit-btn--ghost pres_iconbtn"
                                onClick={() => moveRow(r.id, -1)}
                                disabled={idx === 0}
                                title="Subir"
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                className="mit-btn mit-btn--ghost pres_iconbtn"
                                onClick={() => moveRow(r.id, 1)}
                                disabled={idx === rows.length - 1}
                                title="Bajar"
                              >
                                ↓
                              </button>
                              <button
                                type="button"
                                className="mit-btn mit-btn--ghost pres_iconbtn"
                                onClick={() => removeRow(r.id)}
                                disabled={rows.length === 1}
                                title="Eliminar"
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
                        <td style={{ textAlign: "left" }}>
                          <div className="pres_currency2">
                            <label
                              style={{
                                display: "inline-flex",
                                gap: 8,
                                alignItems: "center",
                              }}
                              title="Emitir el presupuesto en pesos"
                            >
                              <input
                                type="radio"
                                name="currency_total"
                                checked={currency === "ARS"}
                                onChange={() => setCurrency("ARS")}
                              />
                              ARS
                            </label>

                            <label
                              style={{
                                display: "inline-flex",
                                gap: 8,
                                alignItems: "center",
                              }}
                              title="Emitir el presupuesto en dólares"
                            >
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

                        <td style={{ textAlign: "right", fontWeight: 900 }}>
                          Total final
                        </td>
                        <td
                          className="pres_td_money2"
                          style={{ fontWeight: 900 }}
                        >
                          {formatMoneyByCurrency(total, currency)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </article>
              )}

              {activeTab === "planes" && (
              <article className="mi-card mi-card--full pres_tab_card">
                <div className="pres_plan_header">
                  <div>
                    <h3 className="mi-card__title">3. Planes de mantenimiento</h3>
                    <p className="pres_plan_hint">
                      Marcá solamente los planes que querés que aparezcan en el presupuesto.
                    </p>
                  </div>

                  {planes.length > 0 && (
                    <div className="pres_plan_tools">
                      <button
                        type="button"
                        className="mit-btn mit-btn--ghost"
                        onClick={selectAllPlans}
                      >
                        Todos
                      </button>
                      <button
                        type="button"
                        className="mit-btn mit-btn--ghost"
                        onClick={clearSelectedPlans}
                      >
                        Ninguno
                      </button>
                    </div>
                  )}
                </div>

                {!planes.length ? (
                  <div className="pres_plan_empty">
                    No hay planes de mantenimiento activos para seleccionar.
                  </div>
                ) : (
                  <div className="pres_plan_grid">
                    {planes.map((p) => {
                      const id = getPlanId(p);
                      const checked = selectedPlanIds.map(String).includes(id);
                      const nombre = String(p?.nombre || "Plan").trim() || "Plan";
                      const descripcion = String(p?.descripcion || "").trim();
                      const montoPreview = getPlanPreviewAmount(
                        p,
                        currency,
                        Number(dolarOficial?.venta || 0)
                      );

                      return (
                        <label
                          key={id || nombre}
                          className={`pres_plan_option ${checked ? "is-selected" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => togglePlan(id)}
                          />
                          <span className="pres_plan_content">
                            <span className="pres_plan_topline">
                              <strong>{nombre}</strong>
                              <b>{montoPreview}</b>
                            </span>
                            {descripcion && (
                              <span className="pres_plan_desc">{descripcion}</span>
                            )}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </article>
              )}
            </div>
          </div>

          <div className="mit-actions pres_actions_bar">
            <div className="mit-help pres_help_in_actions">
              * Campos obligatorios
            </div>

            <div className="pres_actions_right">
              <button
                className="mit-btn mit-btn--ghost"
                onClick={onClose}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="mit-btn mit-btn--solid"
                onClick={generarPDF}
                type="button"
              >
                Generar PDF
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
