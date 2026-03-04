// ✅ REEMPLAZAR COMPLETO
// frontend/src/components/Pagos/modales/arcaPdfBuilder.js
import jsPDF from "jspdf";
import QRCode from "qrcode";

// ✅ Logo local
import defaultLogoSrc from "../../../imagenes/logo_factura.jpeg";

// =====================
// ✅ CONSTANTES FIJAS
// =====================
const FIX = {
  emisor_nombre: "VALVERDE FRANCO ANTONIO",
  emisor_domicilio: "Roma 2407 - San Francisco, Córdoba",
  cuit_emisor: "20257525164",
  cond_iva_emisor: "Responsable Monotributo",
  inicio_actividades: "01/07/2025",
  letra: "C",
  tipoTxt: "FACTURA",
  cod_afip: "011",
  pto_vta_fijo: "00002",
  cond_iva_receptor_default: "IVA Sujeto Exento",
  cond_venta_default: "Contado / Transferencia Bancaria",
  sistemas_default_label: "Todos los sistemas",
  sistemas_fallback_na: "N/D",
};

// =====================
// Text sanitization
// =====================
function sanitizePdfText(input) {
  let t = input == null ? "" : String(input);
  t = t.replace(/\s+/g, " ").trim();
  t = t
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/→/g, "->");

  let out = "";
  for (let i = 0; i < t.length; i++) {
    const code = t.charCodeAt(i);
    out += code <= 255 ? t[i] : " ";
  }
  return out.replace(/\s+/g, " ").trim();
}

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
  if (isYMD8(str)) return `${str.slice(6, 8)}/${str.slice(4, 6)}/${str.slice(0, 4)}`;
  if (str.length >= 10 && str.includes("-")) {
    const [y, m, d] = str.slice(0, 10).split("-");
    return `${d}/${m}/${y}`;
  }
  return str;
}
function numEs(v, dec = 2) {
  const n = Number(v);
  const x = Number.isFinite(n) ? n : 0;
  return x.toLocaleString("es-AR", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
}
function moneyEs(v) {
  return numEs(v, 2);
}
function safeNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function toBool(v) {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  const t = String(v || "").toLowerCase().trim();
  return t === "1" || t === "true" || t === "yes" || t === "si";
}
function firstFinite(...vals) {
  for (const v of vals) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
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
  doc.text(sanitizePdfText(str), x, y, opt);
}
function clampToWidth(doc, str, maxW) {
  const t = sanitizePdfText(str);
  if (!t) return "";
  if (doc.getTextWidth(t) <= maxW) return t;
  let out = t;
  while (out.length > 0 && doc.getTextWidth(out + "...") > maxW) out = out.slice(0, -1);
  return out.length ? out + "..." : "";
}
function wrapByWidth(doc, str, maxW) {
  const t = sanitizePdfText(str);
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
// ✅ Normalización items
// =====================
function splitDescAndSystem(descRaw) {
  const desc = sanitizePdfText(s(descRaw).trim());
  if (!desc) return { baseDesc: "", systemLabel: "" };
  const m = desc.match(/^(.*)\s\(([^()]{1,80})\)\s*$/);
  if (!m) return { baseDesc: desc, systemLabel: "" };
  const base = sanitizePdfText(s(m[1]).trim());
  const sys = sanitizePdfText(s(m[2]).trim());
  return { baseDesc: base || desc, systemLabel: sys || "" };
}

function uniqClean(arr) {
  const out = [];
  const seen = new Set();
  for (const v of arr) {
    const t = sanitizePdfText(s(v).trim());
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/**
 * ✅ FIX PRINCIPAL: getSystemsFromData
 *
 * Resuelve SIEMPRE los sistemas a mostrar en el PDF.
 * Prioridad:
 * 1) data.sistemas_labels / data.sistemas_aplicados / data.sistemas / data.sistemas_nombres (array en RAÍZ)
 *    → ModalFacturaArca.jsx ahora pasa sistemas_labels en el raíz de data ✅
 * 2) Extraer desde data.items_facturacion[*].sistemas_labels (fallback por si algo falla en 1)
 * 3) aplicar_a_todos_sistemas => "Todos los sistemas"
 * 4) labelSistema / sistema (string)
 * 5) "N/D"
 */
function getSystemsFromData(data) {
  const d = data || {};

  const pickArray = (...vals) => {
    for (const v of vals) {
      if (Array.isArray(v) && v.length) return v;
    }
    return null;
  };

  // 1) Campos raíz — ModalFacturaArca.jsx ahora envía sistemas_labels aquí ✅
  const arr = pickArray(
    d.sistemas_labels,
    d.sistemas_aplicados,
    d.sistemas,
    d.sistemas_nombres
  );
  if (arr) {
    const cleaned = uniqClean(arr);
    if (cleaned.length) return cleaned;
  }

  // 2) ✅ FIX FALLBACK: extraer desde items_facturacion (modo global y por_sistema)
  if (Array.isArray(d.items_facturacion) && d.items_facturacion.length) {
    const fromItems = [];
    for (const it of d.items_facturacion) {
      // modo global: sistemas_labels es array con todos los sistemas
      if (Array.isArray(it.sistemas_labels) && it.sistemas_labels.length) {
        fromItems.push(...it.sistemas_labels);
      }
      // modo por_sistema: sistema_label es string
      if (it.sistema_label && typeof it.sistema_label === "string") {
        fromItems.push(it.sistema_label);
      }
    }
    const cleaned = uniqClean(fromItems);
    if (cleaned.length) return cleaned;
  }

  // 3) flag aplicar_a_todos_sistemas
  if (
    toBool(d.aplicar_a_todos_sistemas) ||
    toBool(d.aplicarATodosSistemas) ||
    toBool(d.todosLosSistemas)
  ) {
    return [FIX.sistemas_default_label];
  }

  // 4) labelSistema / sistema como string
  const one = sanitizePdfText(s(d.labelSistema || d.sistema || "").trim());
  if (one) return [one];

  // 5) fallback final
  return [FIX.sistemas_fallback_na];
}

// =====================
// Items (DETALLE)
// =====================
function computeItems(fact, data, totalArs) {
  const total = safeNumber(
    totalArs,
    safeNumber(fact?.importe ?? data?.monto ?? data?.importe ?? 0, 0)
  );

  const fromModal = Array.isArray(data?.items_facturacion) ? data.items_facturacion : [];

  const modalRaw = fromModal
    .map((it, idx) => {
      const descRaw =
        it?.descripcion ??
        it?.detalle ??
        it?.nombre ??
        it?.label ??
        it?.titulo ??
        it?.plan ??
        "";

      const { baseDesc, systemLabel } = splitDescAndSystem(descRaw);
      if (!baseDesc) return null;

      const cant = safeNumber(it?.cantidad ?? it?.qty ?? 1, 1);
      const unidad = "unidades";

      const unitArs = firstFinite(
        it?.ars_unit,
        it?.precio_unitario_ars,
        it?.precio_ars,
        it?.precio_unitario,
        it?.precio
      );

      const subArs = firstFinite(
        it?.ars,
        it?.subtotal_ars,
        it?.ars_total,
        it?.subtotal,
        it?.importe,
        it?.monto
      );

      const precioUnit = unitArs != null ? unitArs : subArs != null ? subArs : 0;
      const subtotal = subArs != null ? subArs : precioUnit * cant;

      const unitKey = Number(unitArs != null ? unitArs : precioUnit).toFixed(2);
      const key = `${sanitizePdfText(baseDesc).toLowerCase()}|${unidad.toLowerCase()}|${unitKey}`;

      // ✅ Recopilar sistemas_labels del item (modo global) + sistema_label (modo por_sistema)
      const itemSystems = [];
      if (Array.isArray(it.sistemas_labels) && it.sistemas_labels.length) {
        itemSystems.push(...it.sistemas_labels);
      }
      if (it.sistema_label && typeof it.sistema_label === "string") {
        itemSystems.push(it.sistema_label);
      }
      // fallback: sufijo en descripción
      if (systemLabel) itemSystems.push(systemLabel);

      return {
        _key: key,
        _idx: idx,
        _title: sanitizePdfText(baseDesc),
        _systems: itemSystems,
        codigo: String(idx + 1),
        descripcion: sanitizePdfText(baseDesc),
        cantidad: cant,
        unidad,
        precio: precioUnit,
        bonifPct: 0,
        impBonif: 0,
        subtotal,
      };
    })
    .filter(Boolean);

  if (modalRaw.length) {
    const map = new Map();

    for (const it of modalRaw) {
      const prev = map.get(it._key);
      if (!prev) {
        map.set(it._key, { ...it, _systems: [...(it._systems || [])] });
      } else {
        prev.cantidad = safeNumber(prev.cantidad, 0) + safeNumber(it.cantidad, 0);
        prev.subtotal = safeNumber(prev.subtotal, 0) + safeNumber(it.subtotal, 0);
        prev._systems = uniqClean([...(prev._systems || []), ...(it._systems || [])]);
      }
    }

    const grouped = Array.from(map.values()).sort((a, b) => (a._idx ?? 0) - (b._idx ?? 0));

    // ✅ Para cada item agrupado: si _systems sigue vacío, usar getSystemsFromData(data)
    const dataSystems = getSystemsFromData(data);

    for (const g of grouped) {
      const systems = uniqClean(g._systems || []);
      g._systems = systems.length ? systems : dataSystems;

      const cant = safeNumber(g.cantidad ?? 1, 1);
      const sub = safeNumber(g.subtotal ?? 0, 0);
      if (!Number.isFinite(g.precio) || g.precio <= 0) {
        g.precio = cant > 0 ? sub / cant : sub;
      }
    }

    // Ajuste cierre con total
    const sum = grouped.reduce((acc, it) => acc + safeNumber(it.subtotal, 0), 0);
    const diff = total - sum;
    if (Number.isFinite(diff) && Math.abs(diff) >= 0.01) {
      const last = grouped[grouped.length - 1];
      last.subtotal = safeNumber(last.subtotal, 0) + diff;
      const cant = safeNumber(last.cantidad ?? 1, 1);
      if (cant === 1) last.precio = safeNumber(last.subtotal, 0);
    }

    return grouped.map((it, i) => ({ ...it, codigo: String(i + 1) }));
  }

  // fallback fact.items
  const raw = fact?.items;
  if (Array.isArray(raw) && raw.length) {
    const norm = raw
      .map((it, idx) => {
        const descRaw = it.descripcion || it.detalle || it.nombre || "";
        const { baseDesc, systemLabel } = splitDescAndSystem(descRaw);
        const title = sanitizePdfText(baseDesc);
        if (!title) return null;

        const cant = safeNumber(it.cantidad ?? 1, 1);
        const unidad = "unidades";

        const precioUnit =
          firstFinite(it?.ars_unit, it?.ars, it?.precio_unitario, it?.precio, it?.importe) ?? 0;

        const subtotal =
          firstFinite(it?.subtotal, it?.subtotal_ars, it?.ars_total) ?? precioUnit * cant;

        const itemSystems = [];
        if (Array.isArray(it.sistemas_labels) && it.sistemas_labels.length) {
          itemSystems.push(...it.sistemas_labels);
        }
        if (it.sistema_label) itemSystems.push(it.sistema_label);
        if (systemLabel) itemSystems.push(systemLabel);

        const systems = uniqClean(itemSystems);

        return {
          codigo: sanitizePdfText(s(it.codigo ?? it.cod ?? idx + 1) || String(idx + 1)),
          descripcion: title,
          _systems: systems.length ? systems : getSystemsFromData(data),
          cantidad: cant,
          unidad,
          precio: precioUnit,
          bonifPct: safeNumber(it.bonif_pct ?? 0, 0),
          impBonif: safeNumber(it.imp_bonif ?? 0, 0),
          subtotal,
        };
      })
      .filter(Boolean);

    if (norm.length) return norm;
  }

  // fallback 1 línea con total
  const fallbackTitle = sanitizePdfText(
    s(data?.detalle || data?.labelSistema || data?.sistema || "Servicio")
  );

  return [
    {
      codigo: "1",
      descripcion: fallbackTitle,
      _systems: getSystemsFromData(data),
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
    iibb: FIX.cuit_emisor,
    inicioAct: FIX.inicio_actividades,
  };
}

function getReceptor(fact, data) {
  const cf = data?.cliente_facturacion || null;
  const docTipo = Number(fact?.doc_tipo ?? cf?.doc_tipo ?? data?.doc_tipo ?? 0) || 0;
  const docNro = s(fact?.doc_nro ?? cf?.doc_nro ?? data?.doc_nro ?? "").replace(/\D/g, "");
  const nroParaCaja = docNro || s(fact?.receptor_cuit || data?.receptor_cuit || "");
  const razonDB = s(cf?.razon_social || "").trim();

  return {
    cuit: sanitizePdfText(s(nroParaCaja || "")),
    razon: sanitizePdfText(
      s(
        razonDB ||
          fact?.receptor_nombre ||
          data?.receptor_nombre ||
          data?.labelCliente ||
          data?.cliente ||
          ""
      )
    ),
    dom: sanitizePdfText(s(fact?.receptor_domicilio || cf?.domicilio || data?.cliente_domicilio || "")),
    condIva: sanitizePdfText(
      s(fact?.cond_iva_receptor || cf?.cond_iva || data?.cond_iva_receptor || FIX.cond_iva_receptor_default)
    ),
    condVenta: sanitizePdfText(
      s(fact?.condicion_venta || cf?.cond_venta || data?.condicion_venta || FIX.cond_venta_default)
    ),
    docTipo,
    docNro,
  };
}

function getPeriodo(fact, data) {
  const pick = (...vals) => {
    for (const v of vals) {
      const t = s(v).trim();
      if (t) return t;
    }
    return "";
  };

  const desdeRaw = pick(
    data?.periodo_desde, data?.periodo_desde_iso,
    fact?.periodo_desde, fact?.FchServDesde, fact?.fch_serv_desde
  );
  const hastaRaw = pick(
    data?.periodo_hasta, data?.periodo_hasta_iso,
    fact?.periodo_hasta, fact?.FchServHasta, fact?.fch_serv_hasta
  );
  const vtoRaw = pick(
    data?.vto_pago, data?.vto_pago_iso,
    fact?.vto_pago, fact?.FchVtoPago, fact?.fch_vto_pago, fact?.fecha_vto_pago
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

  const totalReal = safeNumber(fact?.importe ?? data?.monto ?? data?.importe ?? 0, 0);
  const totalTest = safeNumber(testAmount, 1000);
  const total = toBool(forceTestAmount) ? totalTest : totalReal;

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
      const qrDataUrl = await QRCode.toDataURL(String(meta.qrUrl), { margin: 0, scale: 6 });
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
    text(doc, "Y CONTROL ADUANANERO", arcaX, footY + 73);
  }

  set(doc, "helvetica", "bold", 10);
  text(doc, "Comprobante Autorizado", arcaX, footY + 94);

  set(doc, "helvetica", "italic", 6.7);
  text(
    doc,
    "Esta Agencia no se responsabiliza por los datos ingresados en el detalle de la operacion",
    arcaX,
    footY + 110
  );

  const statusY = footY + 58;
  const lineGap = 12;

  set(doc, "helvetica", "bold", 9);
  text(doc, "Pag. 1/1", W / 2 - 40, statusY, { align: "center" });

  const caeY = statusY + lineGap;
  set(doc, "helvetica", "bold", 9);
  text(doc, "CAE N:", W / 2 + 10, caeY, { align: "left" });
  set(doc, "helvetica", "normal", 9);
  text(doc, meta.cae, W / 2 + 55, caeY, { align: "left" });

  const vtoY = caeY + lineGap;
  set(doc, "helvetica", "bold", 9);
  text(doc, "Fecha de Vto. de CAE:", W / 2 + 10, vtoY, { align: "left" });
  set(doc, "helvetica", "normal", 9);
  text(doc, meta.caeVto, W / 2 + 135, vtoY, { align: "left" });

  set(doc, "courier", "normal", 9);
  text(doc, meta.cae, W - B - 10, H - B - 6, { align: "right" });

  return { totY, footY, total };
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

  const leftX = B + 12;
  const logoY = headerY + 4;

  // ✅ Caja máxima del logo (más grande que antes)
  const LOGO_MAX_W = 230;
  const LOGO_MAX_H = 60;

  if (logoDataUrl) {
    try {
      const isJpeg = String(logoDataUrl).startsWith("data:image/jpeg");

      // Escalado proporcional dentro de la caja
      const props = doc.getImageProperties(logoDataUrl);
      const scale = Math.min(LOGO_MAX_W / props.width, LOGO_MAX_H / props.height);

      const w = props.width * scale;
      const h = props.height * scale;

      doc.addImage(logoDataUrl, isJpeg ? "JPEG" : "PNG", leftX, logoY, w, h);
    } catch {}
  }

  const lx = leftX;
  const ly = headerY + 72;

  set(doc, "helvetica", "bold", 9);
  text(doc, "Razon Social:", lx, ly);
  set(doc, "helvetica", "normal", 9);
  text(doc, clampToWidth(doc, em.razon, splitX - lx - 12), lx + 78, ly);

  set(doc, "helvetica", "bold", 9);
  text(doc, "Domicilio Comercial:", lx, ly + 24);
  set(doc, "helvetica", "normal", 9);
  text(doc, clampToWidth(doc, em.domComercial, splitX - lx - 12), lx + 118, ly + 24);

  set(doc, "helvetica", "bold", 9);
  text(doc, "Condicion frente al IVA:", lx, ly + 48);
  set(doc, "helvetica", "normal", 9);
  text(doc, clampToWidth(doc, em.condIva, splitX - lx - 12), lx + 130, ly + 48);

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
  text(doc, "Fecha de Emision:", rx + 40, yFechaEmi);
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

  const periodY = headerY + headerH;
  const periodH = 30;
  rect(doc, B, periodY, innerW, periodH, 0.55);

  set(doc, "helvetica", "bold", 10);
  text(doc, "Periodo Facturado Desde:", B + 10, periodY + 20);
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

  const recY = periodY + periodH;
  const recH = 78;
  rect(doc, B, recY, innerW, recH, 0.55);

  const recLx = B + 10;
  set(doc, "helvetica", "bold", 9);
  text(doc, "CUIT:", recLx, recY + 18);
  set(doc, "helvetica", "normal", 9);
  text(doc, rc.cuit, recLx + 38, recY + 18);

  set(doc, "helvetica", "bold", 9);
  text(doc, "Condicion frente al IVA:", recLx, recY + 46);
  set(doc, "helvetica", "normal", 9);
  text(doc, clampToWidth(doc, rc.condIva, 190), recLx + 110, recY + 46);

  set(doc, "helvetica", "bold", 9);
  text(doc, "Condicion de venta:", recLx, recY + 62);
  set(doc, "helvetica", "normal", 9);
  text(doc, clampToWidth(doc, rc.condVenta, 220), recLx + 90, recY + 62);

  const recRx = B + innerW * 0.46;
  set(doc, "helvetica", "bold", 9);
  text(doc, "Apellido y Nombre / Razon Social:", 150, recY + 18);

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

  const layout = { W, H, B, innerW };
  const bottom = await drawBottomAnchored(
    doc,
    { fact, data, forceTestAmount, testAmount, arcaLogoDataUrl },
    layout
  );

  // ===== Tabla items =====
  const tblY = recY + recH + 14;
  const gapBeforeTotals = 18;
  const tblBottomLimit = bottom.totY - gapBeforeTotals;
  const tblH = Math.max(170, tblBottomLimit - tblY);

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
  const wProd = Math.max(minProd, innerW - (wCodigo + wCant + wUM + wPU + wBonif + wImpBon + wSubt));

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
  text(doc, "Codigo", xCodigo, tblY + 15);
  text(doc, "Producto / Servicio", xProd, tblY + 15);
  text(doc, "Cantidad", xCant, tblY + 15, { align: "right" });
  text(doc, "U. Medida", xUM, tblY + 15, { align: "right" });
  text(doc, "Precio Unit.", xPU, tblY + 15, { align: "right" });
  text(doc, "% Bonif", xBonif, tblY + 15, { align: "right" });
  text(doc, "Imp. Bonif.", xImpBon, tblY + 15, { align: "right" });
  text(doc, "Subtotal", xSubt, tblY + 15, { align: "right" });

  const totalReal = safeNumber(fact?.importe ?? data?.monto ?? data?.importe ?? 0, 0);
  const totalTest = safeNumber(testAmount, 1000);
  const total = toBool(forceTestAmount) ? totalTest : totalReal;

  const items = computeItems({ ...fact, importe: total }, data, total);
  const dataSystems = getSystemsFromData(data);

  set(doc, "helvetica", "normal", 9);

  let y = tblY + headerRowH + 16;
  const maxBodyY = tblY + tblH - 8;

  for (let i = 0; i < items.length; i++) {
    const it = items[i];

    const title = sanitizePdfText(it.descripcion || "");

    // ✅ Sistemas: prioriza _systems del item, fallback a dataSystems
    let systemsArr = Array.isArray(it._systems) ? uniqClean(it._systems) : [];
    if (!systemsArr.length) systemsArr = dataSystems;

    const sysLine = sanitizePdfText(`Sistemas: ${systemsArr.join(", ") || FIX.sistemas_fallback_na}`);

    const descMaxW = x2 - padR - xProd;
    const titleLines = wrapByWidth(doc, title, Math.max(20, descMaxW));
    const sysLines = wrapByWidth(doc, sysLine, Math.max(20, descMaxW));

    const lines = [
      ...(titleLines.length ? titleLines.slice(0, 2) : [""]),
      ...(sysLines.length ? sysLines.slice(0, 2) : [sysLine]),
    ];

    const finalLines = lines.slice(0, 4);

    const lh = 11;
    const blockH = Math.max(14, finalLines.length * lh);

    if (y + blockH > maxBodyY) break;

    text(doc, s(it.codigo || String(i + 1)), xCodigo, y);

    for (let li = 0; li < finalLines.length; li++) {
      text(doc, finalLines[li], xProd, y + li * lh);
    }

    text(doc, numEs(it.cantidad ?? 1, 2), xCant, y, { align: "right" });
    text(doc, s(it.unidad || "unidades"), xUM, y, { align: "right" });
    text(doc, moneyEs(it.precio || 0), xPU, y, { align: "right" });
    text(doc, numEs(it.bonifPct || 0, 2), xBonif, y, { align: "right" });
    text(doc, moneyEs(it.impBonif || 0), xImpBon, y, { align: "right" });
    text(doc, moneyEs(it.subtotal || 0), xSubt, y, { align: "right" });

    y += blockH + 4;
  }
}

// =====================
// Build PDF function
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
    fact, data, forceTestAmount, testAmount,
    logoDataUrl: finalLogo, arcaLogoDataUrl,
  });

  doc.addPage();
  await drawPage(doc, "DUPLICADO", {
    fact, data, forceTestAmount, testAmount,
    logoDataUrl: finalLogo, arcaLogoDataUrl,
  });

  doc.addPage();
  await drawPage(doc, "TRIPLICADO", {
    fact, data, forceTestAmount, testAmount,
    logoDataUrl: finalLogo, arcaLogoDataUrl,
  });

  return doc;
}

// =====================
// ✅ MAIN EXPORT FUNCTION
// =====================
export async function saveArcaInvoicePdf({
  fact,
  data,
  forceTestAmount = false,
  testAmount = 1000,
  logoDataUrl = null,
  arcaLogoDataUrl = null,
  download = true,
  filename: filenameIn,
} = {}) {
  const doc = await buildArcaInvoicePdf({
    fact, data, forceTestAmount, testAmount, logoDataUrl, arcaLogoDataUrl,
  });

  const blob = doc.output("blob");

  const safe = (x) =>
    sanitizePdfText(String(x || ""))
      .replace(/[^\w\-]+/g, "_")
      .slice(0, 60);

  const pv = String(fact?.pto_vta ?? FIX.pto_vta_fijo).padStart(5, "0");
  const nro = String(fact?.cbte_nro ?? "0").padStart(8, "0");
  const cli = safe(data?.labelCliente || data?.cliente || "CLIENTE");
  const sys = safe(data?.labelSistema || data?.sistema || "SISTEMA");

  const filename = filenameIn || `FACTURA_${pv}-${nro}_${cli}_${sys}.pdf`;

  if (download) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  return { blob, filename };
}
