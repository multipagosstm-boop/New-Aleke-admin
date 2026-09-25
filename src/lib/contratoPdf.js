import { jsPDF } from "jspdf";
import edificioRaw from "./contratos/edificioTpl.js";
import veneciaRaw from "./contratos/veneciaTpl.js";
import parques1Raw from "./contratos/parques1Tpl.js";

// Arrendador fijo referencial (se mantiene por compatibilidad; las plantillas traen el texto verbatim del arrendador).
export const ARRENDADOR = {
  nombre: "ISAÍAS DAVID ARIZA IBARRA",
  cc: "1.004.463.223",
  email: "alekerooftop@gmail.com",
  telefono: "304-3856419",
  direccion: "Kra 21a3 #29k 45, Barrio los Laureles, Santa Marta, Magdalena"
};

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const UNIDADES = ["cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve", "veinte", "veintiuno", "veintidós", "veintitrés", "veinticuatro", "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve"];
const DECENAS = ["", "", "", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
const CENTENAS = ["", "", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"];

function tresDigitos(n) {
  let w = "";
  const c = Math.floor(n / 100), resto = n % 100;
  if (c === 1 && resto === 0) return "cien";
  if (c > 0) w += CENTENAS[c] + (resto > 0 ? " " : "");
  if (resto > 0) {
    if (resto <= 29) w += UNIDADES[resto];
    else {
      const d = Math.floor(resto / 10), u = resto % 10;
      w += DECENAS[d];
      if (u > 0) w += " y " + UNIDADES[u];
    }
  } else if (c === 0) {
    w = "cero";
  }
  return w;
}

export function numeroAPalabras(num) {
  num = Math.floor(Number(num) || 0);
  if (num === 0) return "cero";
  const millones = Math.floor(num / 1000000);
  const miles = Math.floor((num % 1000000) / 1000);
  const resto = num % 1000;
  const parts = [];
  if (millones > 0) parts.push(millones === 1 ? "un millón" : tresDigitos(millones) + " millones");
  if (miles > 0) parts.push(miles === 1 ? "mil" : tresDigitos(miles) + " mil");
  if (resto > 0) parts.push(tresDigitos(resto));
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

export function montoEnPalabras(valor) {
  return numeroAPalabras(valor) + " pesos ($" + new Intl.NumberFormat("es-CO").format(valor) + ")";
}

function diaEnPalabras(d) {
  const map = ["cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve", "veinte", "veintiuno", "veintidós", "veintitrés", "veinticuatro", "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve", "treinta", "treinta y uno"];
  return map[d] || String(d);
}

export function determinarTipoContrato(inmueble) {
  if (inmueble?.tipo_contrato && inmueble.tipo_contrato !== "GENERICO") return inmueble.tipo_contrato;
  const nombre = (inmueble?.nombre || "").toLowerCase();
  if (nombre.includes("parques 1") || nombre === "parques1" || nombre.includes("parque bolívar 1")) return "PARQUES_1";
  if (nombre.includes("venecia")) return "VENECIA";
  return "EDIFICIO";
}

const TPL = {
  EDIFICIO: edificioRaw,
  VENECIA: veneciaRaw,
  PARQUES_1: parques1Raw,
  GENERICO: edificioRaw
};

// Firmas digitales del arrendador por plantilla (Parques 1 queda en blanco).
const FIRMAS = {
  EDIFICIO: "https://media.base44.com/images/public/6a6b7dc2514d6193f995c342/880f31c85_FirmaIsaias.png",
  VENECIA: "https://media.base44.com/images/public/6a6b7dc2514d6193f995c342/91efbf013_Firmaaleja.png"
};

async function fetchImage(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export function construirDatosContrato({ inmueble, inquilino, contrato }) {
  const inicio = new Date(contrato.fecha_inicio + "T00:00:00");
  const meses = Number(contrato.duracion_meses) || 6;
  const fmt = (v) => new Intl.NumberFormat("es-CO").format(Number(v) || 0);
  return {
    TIPO_CONTRATO: determinarTipoContrato(inmueble),
    FECHA_INICIO_DIA_NUM: inicio.getDate(),
    FECHA_INICIO_DIA_PALABRAS: diaEnPalabras(inicio.getDate()),
    FECHA_INICIO_MES: MESES[inicio.getMonth()].toUpperCase(),
    FECHA_INICIO_ANIO: inicio.getFullYear(),
    ARRENDATARIO_NOMBRE: (inquilino?.nombre_completo || inquilino?.nombre || "").toUpperCase(),
    ARRENDATARIO_CC: inquilino?.numero_documento || inquilino?.cedula || "",
    ARRENDATARIO_CC_LUGAR: (inquilino?.lugar_expedicion || "").toUpperCase(),
    INMUEBLE_DIRECCION: (inmueble?.direccion || inmueble?.nombre || "").toUpperCase(),
    VIGENCIA_MESES_PALABRAS: diaEnPalabras(meses),
    VIGENCIA_MESES_NUM: meses,
    VALOR_ARRIENDO_PALABRAS: numeroAPalabras(contrato.valor_arriendo),
    VALOR_ARRIENDO_NUM: fmt(contrato.valor_arriendo),
    VALOR_DEPOSITO_PALABRAS: numeroAPalabras(contrato.valor_deposito),
    VALOR_DEPOSITO_NUM: fmt(contrato.valor_deposito),
    INQUILINO_TELEFONO: inquilino?.telefono || "",
    INQUILINO_EMAIL: inquilino?.email || inquilino?.correo || "",
    CODIGO: contrato.codigo || ""
  };
}

const ORDINAL_RE = /^(PRIMERA|SEGUNDA|TERCERA|CUARTA|QUINTA|SEXTA|S[EÉ]PTIMA|OCTAVA|NOVENA|D[EÉ]CIMA(\s+\w+)?|VIG[EÉ]CIMA|SEGUNDO|PAR[ÁA]GRAFO|ART[IÍ]CULO)\b/i;
const ALLCAPS_RE = /^[A-ZÁÉÍÓÚÑ0-9\s:.\-()¿?,&]+$/;

function esTituloPrincipal(t) { return t === "CONTRATO DE ARRENDAMIENTO"; }
function esTituloSeccion(t) {
  return t.length > 0 && t.length <= 60 && ALLCAPS_RE.test(t) && /[A-ZÁÉÍÓÚÑ]/.test(t) && !esTituloPrincipal(t);
}
function esClausula(t) { return ORDINAL_RE.test(t); }

// Separa el encabezado de una cláusula ("PRIMERA: OBJETO... - cuerpo") del cuerpo justificado.
function separarClausula(texto) {
  let idx = texto.search(/\.\s*-\s*/);
  if (idx < 0) idx = texto.search(/\.-\s*/);
  if (idx < 0) idx = texto.indexOf(". ");
  if (idx >= 0) {
    return { heading: texto.slice(0, idx + 1).trim(), body: texto.slice(idx + 1).replace(/^[-\s]+/, "").trim() };
  }
  return { heading: "", body: texto };
}

export async function generarContratoPDF(datos) {
  const doc = new jsPDF({ unit: "mm", format: [216, 330] }); // Tamaño oficio colombiano
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 25; // 2.5 cm
  const contentW = W - M * 2;
  const gap = 8;
  const colW = (contentW - gap) / 2;
  const bodySize = 10;
  const bodyLineH = 4.9;
  const headSize = 10.5;
  const titleSize = 14;
  const sectionSize = 11;
  const topY = 24;
  const bottomLimit = H - 22;
  let y = topY;
  let pageNo = 1;

  const sigUrl = FIRMAS[datos.TIPO_CONTRATO];
  const sigImg = sigUrl ? await fetchImage(sigUrl) : null;

  const ensure = (needed) => {
    if (y + needed > bottomLimit) {
      doc.addPage();
      pageNo++;
      y = topY;
    }
  };

  const drawFooter = () => {
    const total = doc.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
      doc.setPage(p);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(120);
      const foot = (datos.CODIGO ? "Contrato " + datos.CODIGO + "  ·  " : "") + "Aleke Rooftop  ·  Página " + p + " de " + total;
      doc.text(foot, W / 2, H - 12, { align: "center" });
      doc.setDrawColor(210);
      doc.setLineWidth(0.2);
      doc.line(M, H - 15, W - M, H - 15);
      doc.setTextColor(0);
    }
  };

  const addMainTitle = (text) => {
    y += 3;
    ensure(10);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(titleSize);
    const lines = doc.splitTextToSize(text, contentW);
    for (const ln of lines) { ensure(bodyLineH); doc.text(ln, W / 2, y, { align: "center" }); y += bodyLineH + 1; }
    y += 4;
  };

  const addSectionTitle = (text) => {
    y += 2;
    ensure(8);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(sectionSize);
    const lines = doc.splitTextToSize(text, contentW);
    for (const ln of lines) { ensure(bodyLineH); doc.text(ln, M, y); y += bodyLineH; }
    y += 1.5;
  };

  const addBody = (text) => {
    if (!text || !text.trim()) { y += 1.5; return; }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(bodySize);
    const lines = doc.splitTextToSize(text, contentW);
    let k = 0;
    while (k < lines.length) {
      ensure(bodyLineH);
      const avail = Math.max(1, Math.floor((bottomLimit - y) / bodyLineH));
      const chunk = lines.slice(k, k + avail);
      doc.text(chunk, M, y, { align: "justify", maxWidth: contentW });
      y += chunk.length * bodyLineH;
      k += chunk.length;
    }
    y += 2.2;
  };

  const addHeading = (text) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(headSize);
    const lines = doc.splitTextToSize(text, contentW);
    for (const ln of lines) { ensure(bodyLineH); doc.text(ln, M, y); y += bodyLineH; }
  };

  const addClausula = (texto) => {
    const { heading, body } = separarClausula(texto);
    if (heading) addHeading(heading);
    if (body) addBody(body);
    else y += 1.5;
  };

  const addFirmas = (leftLines, rightLines) => {
    const xL = M, xR = M + colW + gap;
    y += 6;
    ensure(bodyLineH + 22);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(bodySize);
    doc.text(leftLines[0] || "ARRENDADOR:", xL, y);
    doc.text(rightLines[0] || "ARRENDATARIO:", xR, y);
    y += bodyLineH + 1;

    const imgH = 16;
    ensure(imgH + bodyLineH * 3);
    if (sigImg) {
      try {
        const imgW = colW * 0.6;
        doc.addImage(sigImg, "PNG", xL, y - 2, imgW, imgH);
      } catch (e) { /* ignore */ }
    }
    y += imgH;

    doc.setDrawColor(20);
    doc.setLineWidth(0.3);
    doc.line(xL, y, xL + colW, y);
    doc.line(xR, y, xR + colW, y);
    y += 2.5;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(bodySize);
    const restL = leftLines.slice(2);
    const restR = rightLines.slice(2);
    const rows = Math.max(restL.length, restR.length);
    for (let r = 0; r < rows; r++) {
      ensure(bodyLineH);
      if (restL[r]) doc.text(restL[r], xL, y);
      if (restR[r]) doc.text(restR[r], xR, y);
      y += bodyLineH;
    }
    y += 2.5;
  };

  const addCols = (leftLines, rightLines, heading) => {
    const xL = M, xR = M + colW + gap;
    if (heading) {
      y += 1.5;
      ensure(8);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(sectionSize);
      doc.text(heading, M, y);
      y += bodyLineH + 1;
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(bodySize);
    const wrapAll = (lines, w) => {
      const out = [];
      for (const l of lines) {
        const t = (l || "").replace(/\s+/g, " ").trim();
        if (!t) { out.push(""); continue; }
        const ws = doc.splitTextToSize(t, w);
        out.push(...ws);
      }
      return out;
    };
    const lw = wrapAll(leftLines, colW);
    const rw = wrapAll(rightLines, colW);
    const rows = Math.max(lw.length, rw.length);
    for (let i = 0; i < rows; i++) {
      ensure(bodyLineH);
      if (lw[i]) doc.text(lw[i], xL, y);
      if (rw[i]) doc.text(rw[i], xR, y);
      y += bodyLineH;
    }
    y += 2.5;
  };

  let text = TPL[datos.TIPO_CONTRATO] || TPL.EDIFICIO;
  Object.keys(datos).forEach((k) => {
    text = text.split("{{" + k + "}}").join(String(datos[k] ?? ""));
  });

  const rawLines = text.split("\n");
  let i = 0;
  while (i < rawLines.length) {
    const line = rawLines[i];
    const trimmed = line.trim();

    if (trimmed === "[[TABLA]]") {
      const block = [];
      i++;
      while (i < rawLines.length && rawLines[i].trim() !== "[[FIN_TABLA]]") { block.push(rawLines[i]); i++; }
      i++;
      const sepIdx = block.findIndex((l) => l.trim() === "|");
      let leftBlock, rightBlock;
      if (sepIdx >= 0) { leftBlock = block.slice(0, sepIdx); rightBlock = block.slice(sepIdx + 1); }
      else { leftBlock = block; rightBlock = []; }
      addCols(leftBlock, rightBlock, "NOTIFICACIONES");
      continue;
    }
    if (trimmed === "[[FIRMAS]]") {
      const block = [];
      i++;
      while (i < rawLines.length && rawLines[i].trim() !== "[[FIN_FIRMAS]]") { block.push(rawLines[i]); i++; }
      i++;
      const leftLines = [], rightLines = [];
      for (const l of block) {
        const parts = l.split("\t");
        leftLines.push((parts[0] || "").trim());
        rightLines.push((parts.slice(1).join(" ") || "").trim());
      }
      addFirmas(leftLines, rightLines);
      continue;
    }

    if (trimmed === "") { y += 1.5; i++; continue; }

    // Acumular párrafo hasta línea en blanco o marcador
    const para = [line];
    i++;
    while (i < rawLines.length && rawLines[i].trim() !== "" && !rawLines[i].trim().startsWith("[[")) {
      para.push(rawLines[i]);
      i++;
    }
    const texto = para.join(" ").replace(/\s+/g, " ").trim();

    if (esTituloPrincipal(texto)) addMainTitle(texto);
    else if (esTituloSeccion(texto)) addSectionTitle(texto);
    else if (esClausula(texto)) addClausula(texto);
    else addBody(texto);
  }

  drawFooter();
  return doc;
}