// frontend/src/components/Pagos/modales/arcaPdfBuilder.js
import jsPDF from "jspdf";
import QRCode from "qrcode";

// ✅ Logo local
import defaultLogoSrc from "../../../imagenes/logo_factura.jpeg";

/**
 * PDF estilo ARCA (A4 pt) con:
 * - ORIGINAL / DUPLICADO / TRIPLICADO
 * - Emisor fijo (según tus PDFs)
 * - PV fijo 0002
 * - Ajustes: caja derecha con más aire, IIBB = CUIT, logo un poco más grande
 * - ✅ FIX: Razón Social del receptor PRIORIZA DB (cliente_facturacion.razon_social)
 * - ✅ NUEVO: Período + VtoPago desde data (lo que elijas en el modal)
 */

// =====================
// ✅ CONSTANTES FIJAS
// =====================
const FIX = {
  emisor_nombre: "VALVERDE FRANCO ANTONIO",
  emisor_domicilio: "Roma 2407 - San Francisco, Córdoba",
  cuit_emisor: "20257525164",
  cond_iva_emisor: "Responsable Monotributo",
  inicio_actividades: "01/07/2025", // DD/MM/AAAA
  letra: "C",
  tipoTxt: "FACTURA",
  cod_afip: "011",
  pto_vta_fijo: "0002", // ✅ SIEMPRE 0002
  cond_iva_receptor_default: "IVA Sujeto Exento",
  cond_venta_default: "Contado / Transferencia Bancaria",
};

// =====================
// Helpers
// =====================
function s(v) {
  return v == null ? "" : String(v);
}
function padLeft(v, len) {
  return s(v).padStart(len, "0");
}
function isYMD8(v) {
  const str = String(v || "");
  return str.length === 8 && /^\d{8}$/.test(str);
}
function ymdToHuman(ymd) {
  if (!ymd) return "";
  const str = String(ymd);

  if (isYMD8(str))
    return `${str.slice(6, 8)}/${str.slice(4, 6)}/${str.slice(0, 4)}`;

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
  return numEs(v, 2);
}

// =====================
// Draw helpers
// =====================
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

// =====================
// ✅ IMG -> DATAURL
// =====================
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

// =====================
// Items
// =====================
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

  const desc = s(data?.detalle || data?.labelSistema || data?.sistema || "");
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

// =====================
// Meta / Emisor / Receptor / Periodo
// =====================
function getMeta(fact) {
  const ptoVta = FIX.pto_vta_fijo;
  const cbteNro = padLeft(fact?.cbte_nro ?? fact?.cbte_numero ?? "", 8);
  const cbteTipo = padLeft(fact?.cbte_tipo ?? 11, 3);
  const fechaEmision = ymdToHuman(fact?.fecha_cbte || fact?.fecha_emision || "");
  const remito = cbteNro ? `${ptoVta}-${cbteNro}` : "";

  return {
    letra: FIX.letra,
    tipoTxt: FIX.tipoTxt,
    cod: FIX.cod_afip,
    cbteTipo,
    ptoVta,
    cbteNro,
    fechaEmision,
    cae: s(fact?.cae || ""),
    caeVto: ymdToHuman(fact?.cae_vto || fact?.fecha_vto_cae || ""),
    qrUrl: s(fact?.qr_url || fact?.qr || ""),
    remito,
  };
}

function getEmisor() {
  return {
    razon: FIX.emisor_nombre,
    domComercial: FIX.emisor_domicilio,
    cuit: FIX.cuit_emisor,
    condIva: FIX.cond_iva_emisor,
    iibb: FIX.cuit_emisor, // ✅ IIBB = CUIT
    inicioAct: FIX.inicio_actividades,
  };
}

/**
 * ✅ FIX IMPORTANTE:
 * Prioriza datos de DB en:
 *   data.cliente_facturacion = { doc_tipo, doc_nro, razon_social, domicilio, cond_iva, cond_venta }
 */
function getReceptor(fact, data) {
  const cf = data?.cliente_facturacion || null;

  const docTipo = Number(fact?.doc_tipo ?? cf?.doc_tipo ?? data?.doc_tipo ?? 0) || 0;
  const docNro = s(fact?.doc_nro ?? cf?.doc_nro ?? data?.doc_nro ?? "").replace(/\D/g, "");

  const nroParaCaja = docNro || s(fact?.receptor_cuit || data?.receptor_cuit || "");

  const razonDB = s(cf?.razon_social || "").trim();

  return {
    cuit: s(nroParaCaja || ""),
    razon: s(
      razonDB ||
        fact?.receptor_nombre ||
        data?.receptor_nombre ||
        data?.labelCliente ||
        data?.cliente ||
        ""
    ),
    dom: s(fact?.receptor_domicilio || cf?.domicilio || data?.cliente_domicilio || ""),
    condIva: s(
      fact?.cond_iva_receptor ||
        cf?.cond_iva ||
        data?.cond_iva_receptor ||
        FIX.cond_iva_receptor_default
    ),
    condVenta: s(
      fact?.condicion_venta ||
        cf?.cond_venta ||
        data?.condicion_venta ||
        FIX.cond_venta_default
    ),
    docTipo,
    docNro,
  };
}

/**
 * ✅ NUEVO (tolerante):
 * - Prioriza lo que elegiste en el modal: data.periodo_desde / data.periodo_hasta / data.vto_pago
 * - Si no, cae a campos del backend: fact.FchServDesde/Hasta/VtoPago (si algún día los mandás de vuelta)
 */
function getPeriodo(fact, data) {
  const pick = (...vals) => {
    for (const v of vals) {
      const t = s(v).trim();
      if (t) return t;
    }
    return "";
  };

  const desdeRaw = pick(
    data?.periodo_desde,
    data?.periodo_desde_iso,
    fact?.periodo_desde,
    fact?.FchServDesde,
    fact?.fch_serv_desde
  );

  const hastaRaw = pick(
    data?.periodo_hasta,
    data?.periodo_hasta_iso,
    fact?.periodo_hasta,
    fact?.FchServHasta,
    fact?.fch_serv_hasta
  );

  const vtoRaw = pick(
    data?.vto_pago,
    data?.vto_pago_iso,
    fact?.vto_pago,
    fact?.FchVtoPago,
    fact?.fch_vto_pago,
    fact?.fecha_vto_pago
  );

  return {
    desde: ymdToHuman(desdeRaw),
    hasta: ymdToHuman(hastaRaw),
    vtoPago: ymdToHuman(vtoRaw),
  };
}

// =====================
// Bottom anchored
// =====================
async function drawBottomAnchored(doc, ctx, layout) {
  const { fact, data, forceTestAmount, testAmount, arcaLogoDataUrl } = ctx;
  const { W, H, B, innerW } = layout;

  const meta = getMeta(fact);

  const totalReal = Number(fact?.importe ?? data?.monto ?? data?.importe ?? 0);
  const total = forceTestAmount ? Number(testAmount) : totalReal;

  const footerH = 145;
  const gap = 18;
  const totH = 78;
  const footY = H - B - footerH;
  const totY = footY - gap - totH;

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

  set(doc, "helvetica", "bold", 10);
  text(doc, "Comprobante Autorizado", arcaX, footY + 94);

  set(doc, "helvetica", "italic", 6.7);
  text(
    doc,
    "Esta Agencia no se responsabiliza por los datos ingresados en el detalle de la operación",
    arcaX,
    footY + 110
  );

  const statusY = footY + 58;
  const lineGap = 12;

  set(doc, "helvetica", "bold", 9);
  text(doc, "Pág. 1/1", W / 2 - 40, statusY, { align: "center" });

  const caeY = statusY + lineGap;
  set(doc, "helvetica", "bold", 9);
  text(doc, "CAE N°:", W / 2 + 10, caeY, { align: "left" });
  set(doc, "helvetica", "normal", 9);
  text(doc, meta.cae, W / 2 + 55, caeY, { align: "left" });

  const vtoY = caeY + lineGap;
  set(doc, "helvetica", "bold", 9);
  text(doc, "Fecha de Vto. de CAE:", W / 2 + 10, vtoY, { align: "left" });
  set(doc, "helvetica", "normal", 9);
  text(doc, meta.caeVto, W / 2 + 135, vtoY, { align: "left" });

  set(doc, "courier", "normal", 9);
  text(doc, meta.cae, W - B - 10, H - B - 6, { align: "right" });

  return { totY, footY };
}

// =====================
// Página
// =====================
async function drawPage(doc, pageName, ctx) {
  const { fact, data, forceTestAmount, testAmount, logoDataUrl, arcaLogoDataUrl } = ctx;

  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  const B = 10;
  const innerW = W - 2 * B;

  rect(doc, B, B, innerW, H - 2 * B, 0.75);

  const bandH = 28;
  set(doc, "helvetica", "bold", 14);
  text(doc, pageName.toUpperCase(), W / 2, B + 19, { align: "center" });
  line(doc, B, B + bandH, W - B, B + bandH, 0.55);

  const meta = getMeta(fact);
  const em = getEmisor();
  const rc = getReceptor(fact, data);
  const per = getPeriodo(fact, data);

  const headerY = B + bandH;
  const headerH = 132;
  rect(doc, B, headerY, innerW, headerH, 0.55);

  const splitX = B + innerW * 0.52;

  // Caja central C + COD
  const boxW = 50;
  const boxH = 50;
  const boxX = splitX - boxW / 2;
  const boxY = headerY + 0;

  const gap = 1.2;
  line(doc, splitX, headerY, splitX, boxY - gap, 0.55);
  line(doc, splitX, boxY + boxH + gap, splitX, headerY + headerH, 0.55);

  rect(doc, boxX, boxY, boxW, boxH, 0.55);

  set(doc, "helvetica", "bold", 30);
  text(doc, meta.letra, boxX + boxW / 2, boxY + 26, { align: "center" });

  set(doc, "helvetica", "bold", 9);
  text(doc, `COD. ${meta.cod}`, boxX + boxW / 2, boxY + 34, { align: "center" });

  // ✅ IZQ: logo
  const leftX = B + 12;
  const logoW = 140;
  const logoH = 40;
  const logoY = headerY + 5;

  if (logoDataUrl) {
    try {
      const isJpeg = String(logoDataUrl).startsWith("data:image/jpeg");
      doc.addImage(logoDataUrl, isJpeg ? "JPEG" : "PNG", leftX, logoY, logoW, logoH);
    } catch {}
  }

  // Emisor fijo
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

  // ==========================
  // ✅ DERECHA
  // ==========================
  const rx = splitX + 1;

  set(doc, "helvetica", "bold", 20);
  text(doc, "FACTURA", rx + 30, headerY + 48);

  const yPV = headerY + 65;
  const yFechaEmi = headerY + 80;

  set(doc, "helvetica", "bold", 9);
  text(doc, "Punto de Venta:", rx + 40, yPV);
  text(doc, "Comp. Nro:", rx + 168, yPV);

  set(doc, "helvetica", "bold", 9);
  text(doc, meta.ptoVta, rx + 140, yPV, { align: "left" });
  text(doc, meta.cbteNro, rx + 230, yPV, { align: "left" });

  set(doc, "helvetica", "bold", 9);
  text(doc, "Fecha de Emisión:", rx + 40, yFechaEmi);
  set(doc, "helvetica", "normal", 9);
  text(doc, meta.fechaEmision, rx + 185, yFechaEmi);

  const yCuit = headerY + 102;
  const lineGap2 = 13;
  const yIibb = yCuit + lineGap2;
  const yIni = yIibb + lineGap2;

  set(doc, "helvetica", "bold", 9);
  text(doc, "CUIT:", rx + 40, yCuit);
  set(doc, "helvetica", "normal", 9);
  text(doc, em.cuit, rx + 185, yCuit);

  set(doc, "helvetica", "bold", 9);
  text(doc, "Ingresos Brutos:", rx + 40, yIibb);
  set(doc, "helvetica", "normal", 9);
  text(doc, em.iibb, rx + 185, yIibb);

  set(doc, "helvetica", "bold", 9);
  text(doc, "Fecha de Inicio de Actividades:", rx + 40, yIni);
  set(doc, "helvetica", "normal", 9);
  text(doc, s(em.inicioAct), W - B - 18, yIni, { align: "right" });

  // ===== Periodo
  const periodY = headerY + headerH;
  const periodH = 30;
  rect(doc, B, periodY, innerW, periodH, 0.55);

  set(doc, "helvetica", "bold", 10);
  text(doc, "Período Facturado Desde:", B + 10, periodY + 20);
  set(doc, "helvetica", "normal", 10);
  text(doc, per.desde, B + 145, periodY + 20);

  set(doc, "helvetica", "bold", 10);
  text(doc, "Hasta:", B + 240, periodY + 20);
  set(doc, "helvetica", "normal", 10);
  text(doc, per.hasta, B + 275, periodY + 20);

  set(doc, "helvetica", "bold", 10);
  text(doc, "Fecha de Vto. para el pago:", B + 355, periodY + 20);
  set(doc, "helvetica", "normal", 10);
  text(doc, per.vtoPago, B + 545, periodY + 20, { align: "right" });

  // ===== Receptor
  const recY = periodY + periodH;
  const recH = 78;
  rect(doc, B, recY, innerW, recH, 0.55);

  const recLx = B + 10;
  set(doc, "helvetica", "bold", 9);
  text(doc, "CUIT:", recLx, recY + 18);
  set(doc, "helvetica", "normal", 9);
  text(doc, rc.cuit, recLx + 38, recY + 18);

  set(doc, "helvetica", "bold", 9);
  text(doc, "Condición frente al IVA:", recLx, recY + 46);
  set(doc, "helvetica", "normal", 9);
  text(doc, clampToWidth(doc, rc.condIva, 190), recLx + 110, recY + 46);

  set(doc, "helvetica", "bold", 9);
  text(doc, "Condición de venta:", recLx, recY + 62);
  set(doc, "helvetica", "normal", 9);
  text(doc, clampToWidth(doc, rc.condVenta, 220), recLx + 90, recY + 62);

  const recRx = B + innerW * 0.46;
  set(doc, "helvetica", "bold", 9);
  text(doc, "Apellido y Nombre / Razón Social:", 150, recY + 18);

  set(doc, "helvetica", "normal", 9);
  const razonLines = wrapByWidth(doc, rc.razon, innerW - (recRx - B) - 12);
  text(doc, razonLines[0] || "", recRx + 30, recY + 18);
  if (razonLines[1]) text(doc, razonLines[1], recRx + 185, recY + 30);

  set(doc, "helvetica", "bold", 9);
  text(doc, "Domicilio:", recRx + 0, recY + 46);
  set(doc, "helvetica", "normal", 9);
  text(doc, clampToWidth(doc, rc.dom, innerW - (recRx - B) - 12), recRx + 45, recY + 46);

  set(doc, "helvetica", "bold", 9);
  text(doc, "Remito:", recRx + 0, recY + 62);
  set(doc, "helvetica", "normal", 9);
  text(doc, meta.remito, recRx + 45, recY + 62);

  // ===== Bottom anclado
  const layout = { W, H, B, innerW };
  const bottom = await drawBottomAnchored(
    doc,
    { fact, data, forceTestAmount, testAmount, arcaLogoDataUrl },
    layout
  );

  // ===== Tabla items
  const tblY = recY + recH + 14;
  const gapBeforeTotals = 18;
  const tblBottomLimit = bottom.totY - gapBeforeTotals;
  const tblH = Math.max(140, tblBottomLimit - tblY);

  rect(doc, B, tblY, innerW, tblH, 0.55);

  const headerRowH = 22;
  fillRect(doc, B, tblY, innerW, headerRowH, 0.84);
  rect(doc, B, tblY, innerW, headerRowH, 0.55);

  const left = B;
  const right = B + innerW;

  const wCodigo = 50;
  const wCant = 70;
  const wUM = 50;
  const wPU = 60;
  const wBonif = 40;
  const wImpBon = 80;
  const wSubt = 52;
  const minProd = 10;

  const wProd = Math.max(
    minProd,
    innerW - (wCodigo + wCant + wUM + wPU + wBonif + wImpBon + wSubt)
  );

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

  const xCodigo = x0 + padL;
  const xProd = x1 + padL;

  const xCant = x3 - padR;
  const xUM = x4 - padR;
  const xPU = x5 - padR;
  const xBonif = x6 - padR;
  const xImpBon = x7 - padR;
  const xSubt = x8 - padR;

  line(doc, x1, tblY, x1, tblY + tblH, 0.45);
  line(doc, x2, tblY, x2, tblY + tblH, 0.45);
  line(doc, x3, tblY, x3, tblY + tblH, 0.45);
  line(doc, x4, tblY, x4, tblY + tblH, 0.45);
  line(doc, x5, tblY, x5, tblY + tblH, 0.45);
  line(doc, x6, tblY, x6, tblY + tblH, 0.45);
  line(doc, x7, tblY, x7, tblY + tblH, 0.45);

  set(doc, "helvetica", "bold", 8.6);
  text(doc, "Código", xCodigo, tblY + 15);
  text(doc, "Producto / Servicio", xProd, tblY + 15);
  text(doc, "Cantidad", xCant, tblY + 15, { align: "right" });
  text(doc, "U. Medida", xUM, tblY + 15, { align: "right" });
  text(doc, "Precio Unit.", xPU, tblY + 15, { align: "right" });
  text(doc, "% Bonif", xBonif, tblY + 15, { align: "right" });
  text(doc, "Imp. Bonif.", xImpBon, tblY + 15, { align: "right" });
  text(doc, "Subtotal", xSubt, tblY + 15, { align: "right" });

  const totalReal = Number(fact?.importe ?? data?.monto ?? data?.importe ?? 0);
  const total = forceTestAmount ? Number(testAmount) : totalReal;

  const items = computeItems({ ...fact, importe: total }, data);

  set(doc, "helvetica", "normal", 9);

  let y = tblY + headerRowH + 18;
  const maxBodyY = tblY + tblH - 12;

  for (let i = 0; i < items.length; i++) {
    const it = items[i];

    const descMaxW = x2 - padR - xProd;
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

// =====================
// Public API
// =====================
export async function buildArcaInvoicePdf({
  fact,
  data,
  forceTestAmount = false,
  testAmount = 1000,
  logoDataUrl = null,
  arcaLogoDataUrl = null,
} = {}) {
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

  const pto = FIX.pto_vta_fijo;
  const tipo = padLeft(fact?.cbte_tipo ?? 11, 3);
  const nro = padLeft(fact?.cbte_nro ?? "", 8);
  const fileNro = nro || "________";

  doc.save(`FACTURA_${pto}_${tipo}_${fileNro}.pdf`);
}
