// frontend/src/components/Pagos/modales/arcaPdfBuilder.js
import jsPDF from "jspdf";
import QRCode from "qrcode";

// ✅ Logo local (ruta que pasaste)
import defaultLogoSrc from "../../../imagenes/lg_blanco_horizontal.png";

/**
 * Layout calcado al PDF ARCA (A4 pt) con BLOQUE INFERIOR anclado al pie.
 * - Soporta logoDataUrl / arcaLogoDataUrl opcionales (DataURL PNG/JPG).
 * - Si NO pasás logoDataUrl, usa el logo local (defaultLogoSrc) y lo convierte a DataURL.
 * - Bottom: Totales + QR/ARCA + Pág + CAE anclado al pie.
 * - ✅ Tabla: columnas robustas (NO se pisan)
 */

function s(v) {
  return v == null ? "" : String(v);
}
function padLeft(v, len) {
  return s(v).padStart(len, "0");
}
function ymdToHuman(ymd) {
  if (!ymd) return "";
  const str = String(ymd);

  if (str.length === 8 && /^\d{8}$/.test(str)) {
    return `${str.slice(6, 8)}/${str.slice(4, 6)}/${str.slice(0, 4)}`;
  }
  if (str.length >= 10 && str.includes("-")) {
    const [y, m, d] = str.slice(0, 10).split("-");
    return `${d}/${m}/${y}`;
  }
  return str;
}
function numEs(v, dec = 2) {
  const n = Number(v);
  if (!Number.isFinite(n)) {
    return (0).toLocaleString("es-AR", {
      minimumFractionDigits: dec,
      maximumFractionDigits: dec,
    });
  }
  return n.toLocaleString("es-AR", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
}
function moneyEs(v) {
  // Devuelve "219100,00" (sin $) como el PDF ARCA
  return numEs(v, 2);
}

// ====== DRAW HELPERS (estética ARCA: líneas finas, gris correcto) ======
function rect(doc, x, y, w, h, lw = 0.55) {
  doc.setLineWidth(lw);
  doc.rect(x, y, w, h);
}
function line(doc, x1, y1, x2, y2, lw = 0.45) {
  doc.setLineWidth(lw);
  doc.line(x1, y1, x2, y2);
}
function fillRect(doc, x, y, w, h, gray = 0.84) {
  const g = Math.max(0, Math.min(1, gray));
  doc.setFillColor(Math.round(g * 255));
  doc.rect(x, y, w, h, "F");
}
function set(doc, font = "helvetica", style = "normal", size = 10) {
  doc.setFont(font, style);
  doc.setFontSize(size);
}
function text(doc, str, x, y, opt) {
  doc.text(s(str), x, y, opt);
}
function clampToWidth(doc, str, maxW) {
  const t = s(str).replace(/\s+/g, " ").trim();
  if (!t) return "";
  if (doc.getTextWidth(t) <= maxW) return t;

  let out = t;
  while (out.length > 0 && doc.getTextWidth(out + "…") > maxW) out = out.slice(0, -1);
  return out.length ? out + "…" : "";
}
function wrapByWidth(doc, str, maxW) {
  const t = s(str).replace(/\s+/g, " ").trim();
  if (!t) return [];
  const words = t.split(" ");
  const lines = [];
  let cur = "";

  for (const w of words) {
    const test = cur ? cur + " " + w : w;
    if (doc.getTextWidth(test) <= maxW) cur = test;
    else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

// ====== IMG -> DATAURL (para usar logo local por ruta) ======
async function toDataUrlFromSrc(src) {
  if (!src) return null;
  try {
    const res = await fetch(src);
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result || ""));
      fr.onerror = () => resolve(null);
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function computeItems(fact, data) {
  const raw = fact?.items;
  if (Array.isArray(raw) && raw.length) {
    return raw.map((it) => ({
      codigo: s(it.codigo ?? it.cod ?? 1) || "1",
      descripcion: s(it.descripcion || it.detalle || it.nombre || ""),
      cantidad: Number(it.cantidad ?? 1),
      unidad: s(it.unidad || it.u_medida || "unidades"),
      precio: Number(it.precio_unitario ?? it.precio ?? it.importe ?? 0),
      bonifPct: Number(it.bonif_pct ?? 0),
      impBonif: Number(it.imp_bonif ?? 0),
      subtotal: Number(it.subtotal ?? it.importe ?? 0),
    }));
  }

  const desc = s(data?.detalle || data?.labelSistema || data?.sistema || "Servicio");
  const total = Number(fact?.importe ?? data?.monto ?? data?.importe ?? 0);

  return [
    {
      codigo: "1",
      descripcion: desc,
      cantidad: 1,
      unidad: "unidades",
      precio: total,
      bonifPct: 0,
      impBonif: 0,
      subtotal: total,
    },
  ];
}

function getMeta(fact) {
  const ptoVta = padLeft(fact?.pto_vta ?? fact?.pto_vta_nro ?? "", 5);
  const cbteNro = padLeft(fact?.cbte_nro ?? fact?.cbte_numero ?? "", 8);

  return {
    letra: "C",
    tipoTxt: "FACTURA",
    cod: padLeft(fact?.cbte_tipo ?? 11, 3), // 011
    ptoVta,
    cbteNro,
    fechaEmision: ymdToHuman(fact?.fecha_cbte || fact?.fecha_emision || ""),
    cae: s(fact?.cae || ""),
    caeVto: ymdToHuman(fact?.cae_vto || fact?.fecha_vto_cae || ""),
    qrUrl: s(fact?.qr_url || fact?.qr || ""),
    remito: s(fact?.remito || (ptoVta && cbteNro ? `${ptoVta}-${cbteNro}` : "")),
  };
}
function getEmisor(fact, data) {
  return {
    razon: s(fact?.emisor_nombre || fact?.razon_social_emisor || data?.emisor_nombre || "—"),
    domComercial: s(fact?.emisor_domicilio || data?.emisor_domicilio || ""),
    cuit: s(fact?.cuit_emisor || data?.cuit_emisor || ""),
    condIva: s(fact?.cond_iva_emisor || "Responsable Monotributo"),
    iibb: s(fact?.iibb_emisor || ""),
    inicioAct: s(fact?.inicio_act_emisor || fact?.fecha_inicio_actividades || ""),
  };
}
function getReceptor(fact, data) {
  return {
    cuit: s(fact?.receptor_cuit || fact?.doc_nro || data?.doc_nro || ""),
    razon: s(
      fact?.receptor_nombre ||
        fact?.razon_social_receptor ||
        data?.labelCliente ||
        data?.cliente ||
        "—"
    ),
    dom: s(fact?.receptor_domicilio || data?.cliente_domicilio || ""),
    condIva: s(fact?.cond_iva_receptor || "IVA Sujeto Exento"),
    condVenta: s(fact?.condicion_venta || "Contado / Transferencia Bancaria"),
  };
}
function getPeriodo(fact, data) {
  const desde = ymdToHuman(fact?.periodo_desde || fact?.desde || data?.periodo_desde || "");
  const hasta = ymdToHuman(fact?.periodo_hasta || fact?.hasta || data?.periodo_hasta || "");
  const vtoPago = ymdToHuman(fact?.vto_pago || fact?.fecha_vto_pago || data?.vto_pago || "");
  return { desde, hasta, vtoPago };
}

/**
 * Bloque inferior ARCA-like:
 * - Caja Totales arriba del pie
 * - Pie con QR+ARCA + regleta (Pág/CAE/Vto) + disclaimer + código courier
 * Todo ANCLADO AL FONDO de la hoja.
 */
async function drawBottomAnchored(doc, ctx, layout) {
  const { fact, data, forceTestAmount, testAmount, arcaLogoDataUrl } = ctx;
  const { W, H, B, innerW } = layout;

  const meta = getMeta(fact);

  // Total
  const totalReal = Number(fact?.importe ?? data?.monto ?? data?.importe ?? 0);
  const total = forceTestAmount ? Number(testAmount) : totalReal;

  // ---- MEDIDAS bottom
  const footerH = 145;
  const gap = 18;
  const totH = 78;
  const footY = H - B - footerH; // ANCLA
  const totY = footY - gap - totH;

  // Caja Totales
  rect(doc, B, totY, innerW, totH, 0.55);

  const padR = 14;
  const xVal = B + innerW - padR;
  const xLbl = xVal - 132;

  set(doc, "helvetica", "bold", 9);
  text(doc, "Subtotal: $", xLbl, totY + 24, { align: "right" });
  text(doc, moneyEs(total), xVal, totY + 24, { align: "right" });

  text(doc, "Importe Otros Tributos: $", xLbl, totY + 44, { align: "right" });
  text(doc, moneyEs(0), xVal, totY + 44, { align: "right" });

  text(doc, "Importe Total: $", xLbl, totY + 64, { align: "right" });
  text(doc, moneyEs(total), xVal, totY + 64, { align: "right" });

  // ---- Footer content (QR / ARCA / Regleta / CAE)
  const qrSize = 92;
  const qrX = B + 10;
  const qrY = footY + 20;

  if (meta.qrUrl) {
    try {
      const qrDataUrl = await QRCode.toDataURL(String(meta.qrUrl), {
        margin: 0,
        scale: 6,
      });
      doc.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize);
    } catch {
      rect(doc, qrX, qrY, qrSize, qrSize, 0.4);
    }
  } else {
    rect(doc, qrX, qrY, qrSize, qrSize, 0.4);
  }

  // ARCA (logo o texto) a la derecha del QR
  const arcaX = qrX + qrSize + 22;

  if (arcaLogoDataUrl) {
    try {
      doc.addImage(arcaLogoDataUrl, "PNG", arcaX, footY + 34, 86, 28);
    } catch {
      set(doc, "helvetica", "bold", 20);
      text(doc, "ARCA", arcaX, footY + 58);
    }
  } else {
    set(doc, "helvetica", "bold", 20);
    text(doc, "ARCA", arcaX, footY + 58);
    set(doc, "helvetica", "normal", 6);
    text(doc, "AGENCIA DE RECAUDACION", arcaX, footY + 66);
    text(doc, "Y CONTROL ADUANERO", arcaX, footY + 73);
  }

  // "Comprobante Autorizado"
  set(doc, "helvetica", "bold", 10);
  text(doc, "Comprobante Autorizado", arcaX, footY + 94);

  // Disclaimer (itálica)
  set(doc, "helvetica", "italic", 6.7);
  text(
    doc,
    "Esta Agencia no se responsabiliza por los datos ingresados en el detalle de la operación",
    arcaX,
    footY + 110
  );

  // ✅ Regleta: Pág en una línea + CAE y Vto en 2 líneas (uno abajo del otro)
  const statusY = footY + 58;
  const lineGap = 12; // separación vertical entre líneas

  // Pág (queda arriba)
  set(doc, "helvetica", "bold", 9);
  text(doc, "Pág. 1/1", W / 2 - 40, statusY, { align: "center" });

  // CAE (línea 1)
  const caeY = statusY + lineGap;
  set(doc, "helvetica", "bold", 9);
  text(doc, "CAE N°:", W / 2 + 10, caeY, { align: "left" });
  set(doc, "helvetica", "normal", 9);
  text(doc, meta.cae || "—", W / 2 + 55, caeY, { align: "left" });

  // Vto (línea 2, debajo)
  const vtoY = caeY + lineGap;
  set(doc, "helvetica", "bold", 9);
  text(doc, "Fecha de Vto. de CAE:", W / 2 + 10, vtoY, { align: "left" });
  set(doc, "helvetica", "normal", 9);
  text(doc, meta.caeVto || "—", W / 2 + 135, vtoY, { align: "left" });

  // Abajo del todo (número largo) en courier
  const code =
    meta.cae && meta.cae.length >= 8
      ? meta.cae
      : `7${padLeft(meta.ptoVta, 5)}${padLeft(meta.cbteNro, 8)}36`;

  set(doc, "courier", "normal", 9);
  text(doc, code, W - B - 10, H - B - 6, { align: "right" });

  return { totY, footY };
}

async function drawPage(doc, pageName, ctx) {
  const { fact, data, forceTestAmount, testAmount, logoDataUrl, arcaLogoDataUrl } = ctx;

  const W = doc.internal.pageSize.getWidth(); // ~595.28
  const H = doc.internal.pageSize.getHeight(); // ~841.89

  // ====== Base ======
  const B = 10;
  const innerW = W - 2 * B;

  // Marco exterior
  rect(doc, B, B, innerW, H - 2 * B, 0.75);

  // Banda ORIGINAL/DUPLICADO/TRIPLICADO
  const bandH = 28;
  set(doc, "helvetica", "bold", 14);
  text(doc, pageName.toUpperCase(), W / 2, B + 19, { align: "center" });
  line(doc, B, B + bandH, W - B, B + bandH, 0.55);

  const meta = getMeta(fact);
  const em = getEmisor(fact, data);
  const rc = getReceptor(fact, data);
  const per = getPeriodo(fact, data);

  // ===== Header grande =====
  const headerY = B + bandH;
  const headerH = 132;
  rect(doc, B, headerY, innerW, headerH, 0.55);

  const splitX = B + innerW * 0.52;
// --- Caja central C + COD (como ya tenés)
const boxW = 50;
const boxH = 50;
const boxX = splitX - boxW / 2;
const boxY = headerY + 0;

// ✅ Línea vertical PARTIDA: deja un hueco para que NO cruce el COD.011
const gap = 1.2; // margen extra para que no toque el borde de la caja
line(doc, splitX, headerY, splitX, boxY - gap, 0.55);                // tramo arriba
line(doc, splitX, boxY + boxH + gap, splitX, headerY + headerH, 0.55); // tramo abajo

// ✅ Dibujá la caja encima (queda prolijo)
rect(doc, boxX, boxY, boxW, boxH, 0.55);


set(doc, "helvetica", "bold", 30);
text(doc, meta.letra, boxX + boxW / 2, boxY + 26, { align: "center" });

set(doc, "helvetica", "bold", 9);
text(doc, `COD. ${meta.cod}`, boxX + boxW / 2, boxY + 34, { align: "center" });


// IZQUIERDA: logo + emisor (más chico y más arriba)
const leftX = B + 12;

// ✅ Ajuste fino para que quede como el "bien"
const logoW = 125;
const logoH = 36;
const logoY = headerY + 6; // ✅ pegado arriba

if (logoDataUrl) {
  try {
    doc.addImage(logoDataUrl, "PNG", leftX, logoY, logoW, logoH);
  } catch {
    set(doc, "helvetica", "bold", 22);
    text(doc, "3 DEVS", leftX + 5, headerY + 26);
    set(doc, "helvetica", "normal", 10);
    text(doc, "SOLUTIONS", leftX + 60, headerY + 40);
  }
} else {
  set(doc, "helvetica", "bold", 22);
  text(doc, "3 DEVS", leftX + 5, headerY + 26);
  set(doc, "helvetica", "normal", 10);
  text(doc, "SOLUTIONS", leftX + 60, headerY + 40);
}


  const lx = leftX;
  const ly = headerY + 72;

  set(doc, "helvetica", "bold", 9);
  text(doc, "Razón Social:", lx, ly);
  set(doc, "helvetica", "normal", 9);
  text(doc, clampToWidth(doc, em.razon, splitX - lx - 12), lx + 78, ly);

  set(doc, "helvetica", "bold", 9);
  text(doc, "Domicilio Comercial:", lx, ly + 24);
  set(doc, "helvetica", "normal", 9);
  text(doc, clampToWidth(doc, em.domComercial, splitX - lx - 12), lx + 118, ly + 24);

  set(doc, "helvetica", "bold", 9);
  text(doc, "Condición frente al IVA:", lx, ly + 48);
  set(doc, "helvetica", "normal", 9);
  text(doc, clampToWidth(doc, em.condIva, splitX - lx - 12), lx + 130, ly + 48);

  // DERECHA: FACTURA + datos
  const rx = splitX + 1;
  set(doc, "helvetica", "bold", 20);
  text(doc, "FACTURA", rx + 30, headerY + 48);

  set(doc, "helvetica", "bold", 9);
  text(doc, "Punto de Venta:", rx + 40, headerY + 65);
  text(doc, "Comp. Nro:", rx + 168, headerY + 65);

  set(doc, "helvetica", "bold", 9);
  text(doc, meta.ptoVta || "00000", rx + 232, headerY + 65, { align: "left" });
  text(doc, meta.cbteNro || "00000000", rx + 112, headerY + 65, { align: "left" });

  set(doc, "helvetica", "bold", 9);
  text(doc, "Fecha de Emisión:", rx + 40, headerY + 80);
  text(doc, meta.fechaEmision || "—", rx + 185, headerY + 80);

  set(doc, "helvetica", "bold", 9);
  text(doc, "CUIT:", rx + 40, headerY + 108);
  set(doc, "helvetica", "normal", 9);
  text(doc, s(em.cuit), rx + 185, headerY + 114);

  set(doc, "helvetica", "bold", 9);
  text(doc, "Ingresos Brutos:", rx + 40, headerY + 118);
  set(doc, "helvetica", "normal", 9);
  text(doc, s(em.iibb), rx + 182, headerY + 128);

  set(doc, "helvetica", "bold", 9);
  text(doc, "Fecha de Inicio de Actividades:", rx + 40, headerY + 128);
  set(doc, "helvetica", "normal", 9);
  text(doc, ymdToHuman(em.inicioAct), rx + 265, headerY + 142);

  // ===== Fila período =====
  const periodY = headerY + headerH;
  const periodH = 30;
  rect(doc, B, periodY, innerW, periodH, 0.55);

  set(doc, "helvetica", "bold", 10);
  text(doc, "Período Facturado Desde:", B + 10, periodY + 20);
  set(doc, "helvetica", "normal", 10);
  text(doc, per.desde || "—", B + 165, periodY + 20);

  set(doc, "helvetica", "bold", 10);
  text(doc, "Hasta:", B + 260, periodY + 20);
  set(doc, "helvetica", "normal", 10);
  text(doc, per.hasta || "—", B + 305, periodY + 20);

  set(doc, "helvetica", "bold", 10);
  text(doc, "Fecha de Vto. para el pago:", B + 375, periodY + 20);
  set(doc, "helvetica", "normal", 10);
  text(doc, per.vtoPago || "—", B + 545, periodY + 20, { align: "right" });

  // ===== Caja receptor =====
  const recY = periodY + periodH;
  const recH = 78;
  rect(doc, B, recY, innerW, recH, 0.55);

  const recLx = B + 10;
  set(doc, "helvetica", "bold", 9);
  text(doc, "CUIT:", recLx, recY + 18);
  set(doc, "helvetica", "normal", 9);
  text(doc, s(rc.cuit), recLx + 38, recY + 18);

  set(doc, "helvetica", "bold", 9);
  text(doc, "Condición frente al IVA:", recLx, recY + 38);
  set(doc, "helvetica", "normal", 9);
  text(doc, clampToWidth(doc, rc.condIva, 190), recLx + 140, recY + 38);

  set(doc, "helvetica", "bold", 9);
  text(doc, "Condición de venta:", recLx, recY + 58);
  set(doc, "helvetica", "normal", 9);
  text(doc, clampToWidth(doc, rc.condVenta, 220), recLx + 110, recY + 58);

  const recRx = B + innerW * 0.46;
  set(doc, "helvetica", "bold", 9);
  text(doc, "Apellido y Nombre / Razón Social:", recRx, recY + 18);

  set(doc, "helvetica", "normal", 9);
  const razonLines = wrapByWidth(doc, rc.razon, innerW - (recRx - B) - 12);
  text(doc, razonLines[0] || "—", recRx + 185, recY + 18);
  if (razonLines[1]) text(doc, razonLines[1], recRx + 185, recY + 30);

  set(doc, "helvetica", "bold", 9);
  text(doc, "Domicilio:", recRx + 95, recY + 46);
  set(doc, "helvetica", "normal", 9);
  text(doc, clampToWidth(doc, rc.dom, innerW - (recRx - B) - 12), recRx + 155, recY + 46);

  set(doc, "helvetica", "bold", 9);
  text(doc, "Remito:", recRx + 95, recY + 62);
  set(doc, "helvetica", "normal", 9);
  text(doc, meta.remito ? `${meta.remito}` : "—", recRx + 140, recY + 62);

  // ===== BLOQUE INFERIOR ANCLADO (totales + footer) =====
  const layout = { W, H, B, innerW };
  const bottom = await drawBottomAnchored(doc, { fact, data, forceTestAmount, testAmount, arcaLogoDataUrl }, layout);

  // ===== Tabla items (altura automática para no pisar totales) =====
  const tblY = recY + recH + 14;

  const gapBeforeTotals = 18;
  const tblBottomLimit = bottom.totY - gapBeforeTotals;
  const tblH = Math.max(140, tblBottomLimit - tblY);

  rect(doc, B, tblY, innerW, tblH, 0.55);

  // Header tabla gris
  const headerRowH = 22;
  fillRect(doc, B, tblY, innerW, headerRowH, 0.84);
  rect(doc, B, tblY, innerW, headerRowH, 0.55);

  // =========================
// ✅ COLUMNAS ARCA (8) ROBUSTAS (NO SE PISAN)
// Código | Producto/Servicio | Cantidad | U. Medida | Precio Unit. | % Bonif | Imp. Bonif. | Subtotal
// =========================
const left = B;
const right = B + innerW;

// anchos mínimos (prioridad al bloque derecho)
const wCodigo = 50;
const wCant = 70;
const wUM = 50;
const wPU = 60;
const wBonif = 40;
const wImpBon = 80;
const wSubt = 52;

// ancho mínimo de descripción
const minProd = 10;

// descripción se queda con el sobrante
const wProd = Math.max(
  minProd,
  innerW - (
    wCodigo +
    wCant +
    wUM +
    wPU +
    wBonif +
    wImpBon +
    wSubt
  )
);

// límites x
const x0 = left;
const x1 = x0 + wCodigo;
const x2 = x1 + wProd;
const x3 = x2 + wCant;
const x4 = x3 + wUM;
const x5 = x4 + wPU;
const x6 = x5 + wBonif;
const x7 = x6 + wImpBon;
const x8 = right;

const padL = 8;
const padR = 8;

// texto (izq)
const xCodigo = x0 + padL;
const xProd = x1 + padL;

// números (der)
const xCant = x3 - padR;
const xUM = x4 - padR;
const xPU = x5 - padR;
const xBonif = x6 - padR;
const xImpBon = x7 - padR;
const xSubt = x8 - padR;

// separadores verticales (toda la tabla)
line(doc, x1, tblY, x1, tblY + tblH, 0.45);
line(doc, x2, tblY, x2, tblY + tblH, 0.45);
line(doc, x3, tblY, x3, tblY + tblH, 0.45);
line(doc, x4, tblY, x4, tblY + tblH, 0.45);
line(doc, x5, tblY, x5, tblY + tblH, 0.45);
line(doc, x6, tblY, x6, tblY + tblH, 0.45);
line(doc, x7, tblY, x7, tblY + tblH, 0.45);

// Header
set(doc, "helvetica", "bold", 8.6);
text(doc, "Código", xCodigo, tblY + 15);
text(doc, "Producto / Servicio", xProd, tblY + 15);
text(doc, "Cantidad", xCant, tblY + 15, { align: "right" });
text(doc, "U. Medida", xUM, tblY + 15, { align: "right" });
text(doc, "Precio Unit.", xPU, tblY + 15, { align: "right" });
text(doc, "% Bonif", xBonif, tblY + 15, { align: "right" });
text(doc, "Imp. Bonif.", xImpBon, tblY + 15, { align: "right" });
text(doc, "Subtotal", xSubt, tblY + 15, { align: "right" });

  // Items
  const totalReal = Number(fact?.importe ?? data?.monto ?? data?.importe ?? 0);
  const total = forceTestAmount ? Number(testAmount) : totalReal;

  const items = computeItems({ ...fact, importe: total }, data);

  set(doc, "helvetica", "normal", 9);

  let y = tblY + headerRowH + 18;
  const maxBodyY = tblY + tblH - 12;

  for (let i = 0; i < items.length; i++) {
    const it = items[i];

    // wrap dentro de su columna real
    const descMaxW = (x2 - padR) - xProd;
    const descLines = wrapByWidth(doc, it.descripcion, Math.max(20, descMaxW)).slice(0, 3);
    const blockH = Math.max(14, descLines.length * 12);

    if (y + blockH > maxBodyY) break;

    text(doc, s(it.codigo || "1"), xCodigo, y);

    for (let li = 0; li < descLines.length; li++) {
      text(doc, descLines[li], xProd, y + li * 12);
    }

    text(doc, numEs(it.cantidad ?? 1, 2), xCant, y, { align: "right" });
    text(doc, s(it.unidad || "unidades"), xUM, y, { align: "right" });
    text(doc, moneyEs(it.precio || 0), xPU, y, { align: "right" });
    text(doc, numEs(it.bonifPct || 0, 2), xBonif, y, { align: "right" });
    text(doc, moneyEs(it.impBonif || 0), xImpBon, y, { align: "right" });
    text(doc, moneyEs(it.subtotal || 0), xSubt, y, { align: "right" });

    y += blockH + 8;
  }
}

export async function buildArcaInvoicePdf({
  fact,
  data,
  forceTestAmount = false,
  testAmount = 1000,
  logoDataUrl = null,
  arcaLogoDataUrl = null,
} = {}) {
  // ✅ si no te pasan logoDataUrl, levantamos el logo local por ruta y lo convertimos
  let finalLogo = logoDataUrl;
  if (!finalLogo) {
    finalLogo = await toDataUrlFromSrc(defaultLogoSrc);
  }

  const doc = new jsPDF({ unit: "pt", format: "a4" });

  await drawPage(doc, "ORIGINAL", {
    fact,
    data,
    forceTestAmount,
    testAmount,
    logoDataUrl: finalLogo,
    arcaLogoDataUrl,
  });

  doc.addPage();
  await drawPage(doc, "DUPLICADO", {
    fact,
    data,
    forceTestAmount,
    testAmount,
    logoDataUrl: finalLogo,
    arcaLogoDataUrl,
  });

  doc.addPage();
  await drawPage(doc, "TRIPLICADO", {
    fact,
    data,
    forceTestAmount,
    testAmount,
    logoDataUrl: finalLogo,
    arcaLogoDataUrl,
  });

  return doc;
}

export async function saveArcaInvoicePdf({
  fact,
  data,
  forceTestAmount = false,
  testAmount = 1000,
  logoDataUrl = null,
  arcaLogoDataUrl = null,
} = {}) {
  const doc = await buildArcaInvoicePdf({
    fact,
    data,
    forceTestAmount,
    testAmount,
    logoDataUrl,
    arcaLogoDataUrl,
  });

  const pto = padLeft(fact?.pto_vta ?? "", 5) || "00000";
  const tipo = padLeft(fact?.cbte_tipo ?? 11, 3);
  const nro = padLeft(fact?.cbte_nro ?? "", 8) || "00000000";

  doc.save(`FACTURA_${pto}_${tipo}_${nro}.pdf`);
}
