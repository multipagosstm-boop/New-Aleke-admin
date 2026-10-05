import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import {
  BANCOS_DEFINICIONES,
  detectarBanco,
  construirPromptBanco
} from "../../shared/extractos-bancos.ts";
import {
  EXTRACTO_CREDITO_SCHEMA,
  construirPromptCredito,
  detectarCredito,
  inferTipoCredito,
  naturalezaCreditoFromTipo,
  esLineaSubtotalCredito,
  normalizeObligacion
} from "../../shared/extractos-creditos.ts";
import {
  getMovimientosPeriodo,
  autoConciliarLineas,
  persistirConciliacion,
  recalcularSaldoSistema
} from "../../shared/conciliacion.ts";
import { categorizarCargo, subcuentaParaCargo } from "../../shared/gastos-financieros.ts";
import { ejecutarCreacion } from "../../shared/contabilidad.ts";

// ===== Normalización de fechas — soporta todos los formatos de los 11 bancos =====
const MESES_ES = {
  ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5,
  jul: 6, ago: 7, sep: 8, oct: 9, nov: 10, dic: 11,
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
  julio: 6, agosto: 7, septiembre: 8, setiembre: 8, octubre: 9, noviembre: 10, diciembre: 11
};

function normalizeDate(input) {
  if (!input) return null;
  const str = String(input).trim();
  if (!str || str.toLowerCase() === "inmediato") return null;

  // YYYY-MM-DD
  let m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;

  // DD/MM/YYYY or DD-MM-YYYY
  m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;

  // DDMMYYYY pegado sin separadores (ej: 14082026 = 14/08/2026) — formato BBVA
  m = str.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;

  // DD/MON/YYYY  (30/JUN/2026, 08/Jun/2026, 15 jun. 2026, 19-05-2026 handled above)
  m = str.match(/^(\d{1,2})[\/\-\s]+([a-zA-Záéíóú]+)[\.\s,]+(\d{4})/i);
  if (m) {
    const mes = MESES_ES[m[2].toLowerCase().substring(0, 3)];
    if (mes !== undefined) return `${m[3]}-${String(mes + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }

  // MON DD, YYYY  (jul. 02, 2026)
  m = str.match(/^([a-zA-Záéíóú]+)[\.\s]+(\d{1,2}),?\s+(\d{4})/i);
  if (m) {
    const mes = MESES_ES[m[1].toLowerCase().substring(0, 3)];
    if (mes !== undefined) return `${m[3]}-${String(mes + 1).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }

  // Range — take last date (multiple bank formats)
  const rangeISO = str.match(/al\s+(\d{4}-\d{2}-\d{2})/);
  if (rangeISO) return rangeISO[1];

  const rangeEnd = str.match(/-\s*(\d{1,2})\s+([a-zA-Záéíóú]+)\.*\s+(\d{4})/i);
  if (rangeEnd) {
    const mes = MESES_ES[rangeEnd[2].toLowerCase().substring(0, 3)];
    if (mes !== undefined) return `${rangeEnd[3]}-${String(mes + 1).padStart(2, "0")}-${rangeEnd[1].padStart(2, "0")}`;
  }

  const rangeEnd2 = str.match(/-\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/);
  if (rangeEnd2) return normalizeDate(rangeEnd2[1]);

  // Excel serial
  const num = Number(str);
  if (!isNaN(num) && num > 30000 && num < 100000) {
    const d = new Date((num - 25569) * 86400 * 1000);
    return d.toISOString().substring(0, 10);
  }

  return null;
}

// ===== Normalización del nombre del banco — mapeo AI → código interno =====
function normalizeBanco(bancoAI, bancoDetectadoCode) {
  // Priorizar el banco detectado del texto del PDF sobre el que reporta la IA
  if (bancoDetectadoCode && BANCOS_DEFINICIONES[bancoDetectadoCode]) {
    return { code: bancoDetectadoCode, name: BANCOS_DEFINICIONES[bancoDetectadoCode].name };
  }
  const b = (bancoAI || "").toLowerCase();
  if (b.includes("falabella")) return { code: "FA", name: "Falabella" };
  if (b.includes("tuya") || b.includes("exito") || b.includes("éxito")) return { code: "TU", name: "Tuya" };
  if (b.includes("itau") || b.includes("itaú")) return { code: "IT", name: "Itaú" };
  if (b.includes("occidente")) return { code: "OC", name: "Occidente" };
  if (b.includes("popular")) return { code: "PO", name: "Popular" };
  if (b.includes("serfinanza")) return { code: "SE", name: "Serfinanza" };
  if (b.includes("bancolombia")) return { code: "BA", name: "Bancolombia" };
  if (b.includes("bbva")) return { code: "BB", name: "BBVA" };
  if (b.includes("bogot")) return { code: "BO", name: "Bogotá" };
  if (b.includes("colpatria") || b.includes("davi bank") || b.includes("davibank") || b.includes("scotiabank")) return { code: "CO", name: "Colpatria" };
  if (b.includes("davivienda")) return { code: "DA", name: "Davivienda" };
  return { code: null, name: bancoAI || "Desconocido" };
}

function getLast4(numeroTarjeta) {
  return String(numeroTarjeta || "").replace(/\D/g, "").slice(-4);
}

// Inferir tipo desde descripción cuando la AI no clasifica bien
function inferTipo(descripcion, tipoAI, bancoDef) {
  const d = (descripcion || "").toLowerCase();
  // Confiar en la clasificación de la IA; NO marcar como abono solo porque la
  // descripción contenga "pago"/"abono" — pagar una factura con la tarjeta es compra (cargo).
  if (tipoAI === "abono") return "abono";
  // Patrones del banco: matching por prefijo para evitar falsos abonos (ej: "COMCEL PAGOS" no es abono)
  if (bancoDef) {
    if (bancoDef.abonosConocidos.some((a) => d.startsWith(a.toLowerCase()))) return "abono";
    if (bancoDef.avancesConocidos.some((a) => d.startsWith(a.toLowerCase()))) return "avance";
    if (bancoDef.cargosFinancieros.some((c) => d.startsWith(c.toLowerCase().substring(0, 8)))) return "financiero";
  }
  if (d.includes("avance") || d.includes("retiro") || d.includes("saque") || d.includes("disposicion")) return "avance";
  if (d.includes("cuota de manejo") || d.includes("cuota manejo") || d.includes("interes") ||
      d.includes("interés") || d.includes("seguro") || d.includes("seg deud") || d.includes("seg deu") ||
      d.includes("comision") || d.includes("comisión") || d.includes("4x1000") || d.includes("4x100") ||
      d.includes("gmf") || d.includes("poliza") || d.includes("póliza") || d.includes("rev seg") ||
      d.includes("cashback") || d.includes("iva"))
    return "financiero";
  if (d.includes("ajuste") || d.includes("revers") || d.includes("privilegio") || d.includes("traspaso")) return "ajuste";
  return tipoAI || "compra";
}

function naturalezaFromTipo(tipo) {
  return tipo === "abono" ? "abono" : "cargo";
}

// Restar un día a una fecha YYYY-MM-DD (la fecha de pago se registra un día antes del extracto)
function restarUnDia(dateStr) {
  if (!dateStr) return dateStr;
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() - 1);
  return d.toISOString().substring(0, 10);
}

// Detectar movimientos que son cuotas 2+ (ej: "2/36", "3/24") — ya registradas en períodos anteriores
function esCuotaPosterior(descripcion) {
  const match = (descripcion || "").match(/\b(\d+)\/(\d+)\b/);
  if (match && Number(match[1]) >= 2) return true;
  return false;
}

// Detectar líneas de subtotal/resumen que NO son movimientos individuales
function esLineaSubtotal(descripcion) {
  const d = (descripcion || "").toLowerCase().trim();
  const patrones = [
    "consumos del mes facturados", "total compras", "total avances", "total abonos",
    "total cargos", "subtotal", "suma total", "total del periodo", "saldo anterior",
    "saldo en pesos", "nuevo saldo", "saldo a favor", "total financiaciones"
  ];
  return patrones.some((p) => d.includes(p));
}

// Categorizar los cargos financieros extraídos en los campos del ExtractoProducto
function categorizarCargos(cargosFinancieros) {
  const cat = {
    cuota_manejo: 0, cuota_manejo_fecha: "",
    seguros: 0, seguros_fecha: "",
    intereses_corrientes: 0, intereses_corrientes_fecha: "",
    intereses_mora: 0, intereses_mora_fecha: "",
    comisiones: 0, comisiones_fecha: "",
    otros_gastos: 0, otros_gastos_fecha: "",
    rendimientos: 0, rendimientos_fecha: "",
    cashback: 0, cashback_fecha: ""
  };
  for (const c of cargosFinancieros) {
    const key = categorizarCargo(c.descripcion || "");
    const fecha = c.fecha || "";
    cat[key] += c.valor;
    if (!cat[key + "_fecha"]) cat[key + "_fecha"] = fecha;
  }
  return cat;
}

// ===== Schema para ExtracDataFromUploadedFile — funciona para los 11 bancos =====
const EXTRACTO_SCHEMA = {
  type: "object",
  properties: {
    banco: { type: "string", description: "Nombre del banco emisor del extracto" },
    numero_tarjeta: { type: "string", description: "Número de tarjeta (enmascarado o completo)" },
    titular: { type: "string", description: "Nombre del titular de la tarjeta" },
    periodo: { type: "string", description: "Período del extracto" },
    fecha_corte: { type: "string", description: "Fecha de corte del extracto" },
    fecha_corte_anterior: { type: "string", description: "Fecha de corte del período anterior si aparece" },
    fecha_pago: { type: "string", description: "Fecha límite de pago" },
    saldo_anterior: { type: "number", description: "Saldo anterior" },
    saldo_a_pagar: { type: "number", description: "Saldo total a pagar" },
    pago_minimo: { type: "number", description: "Pago mínimo" },
    pago_total_contado: { type: "number", description: "Pago total sin intereses" },
    cupo_total: { type: "number", description: "Cupo total de la tarjeta" },
    cupo_disponible: { type: "number", description: "Cupo disponible" },
    movimientos: {
      type: "array",
      items: {
        type: "object",
        properties: {
          fecha: { type: "string", description: "Fecha del movimiento" },
          descripcion: { type: "string", description: "Descripción del comercio o movimiento" },
          valor: { type: "number", description: "Valor del movimiento (siempre positivo)" },
          tipo: { type: "string", description: "compra, abono, avance, financiero o ajuste" }
        }
      }
    },
    resumen_cargos: {
      type: "array",
      items: {
        type: "object",
        properties: {
          concepto: { type: "string", description: "Concepto del cargo financiero" },
          valor: { type: "number" },
          fecha: { type: "string", description: "Fecha del cargo si aparece" }
        }
      }
    }
  }
};

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    switch (body.action) {
      case "extraer": return await extraer(base44, user, body);
      case "confirmar": return await confirmar(base44, user, body);
      case "listar_bancos": return await listarBancos();
      default: return Response.json({ error: "Acción no válida: " + body.action }, { status: 400 });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// Endpoint para listar los bancos soportados y sus definiciones
async function listarBancos() {
  return Response.json({
    bancos: Object.values(BANCOS_DEFINICIONES).map((d) => ({
      code: d.code,
      name: d.name,
      identification: d.identification,
      dateFormat: d.dateFormat,
      tieneFechaCorteAnterior: d.tieneFechaCorteAnterior
    }))
  });
}

// ===== Limpiar wrapper MIME/MTOM si el PDF viene envuelto (caso BBVA) =====
// BBVA descarga los extractos como un mensaje MIME multipart: el archivo empieza con
// "--uuid:...\r\nContent-Type: application/pdf...\r\n\r\n" y el PDF real (%PDF-) arranca
// ~140 bytes después. La IA no lo lee porque espera %PDF- al inicio. Esta función
// recorta el wrapper inicial y el boundary final, y sube un PDF limpio a storage.
async function limpiarPdfWrapper(base44, file_url) {
  try {
    const resp = await fetch(file_url);
    if (!resp.ok) return file_url;
    const buf = Buffer.from(await resp.arrayBuffer());
    const latin = buf.toString("latin1");
    // Si ya empieza con %PDF- (con o sin salto inicial), no hay wrapper
    if (latin.startsWith("%PDF-") || latin.startsWith("\n%PDF-") || latin.startsWith("\r\n%PDF-")) {
      return file_url;
    }
    const pdfStart = latin.indexOf("%PDF-");
    if (pdfStart < 0) return file_url; // no hay PDF recuperable
    const eofIdx = latin.lastIndexOf("%%EOF");
    const endIdx = eofIdx >= 0 ? eofIdx + 5 : buf.length;
    const cleanBuf = buf.subarray(pdfStart, endIdx);
    const upload = await base44.asServiceRole.integrations.Core.UploadPublicFile({
      file: new File([cleanBuf], "extracto.pdf", { type: "application/pdf" })
    });
    return upload.file_url || file_url;
  } catch {
    return file_url; // si falla la limpieza, usar el original
  }
}

async function extraer(base44, user, body) {
  const { file_url } = body;
  if (!file_url) return Response.json({ error: "file_url requerido" }, { status: 400 });

  // Limpiar wrapper MIME/MTOM si existe (caso BBVA) antes de procesar
  const cleanUrl = await limpiarPdfWrapper(base44, file_url);

  // Paso 1: Detectar el banco Y el tipo de producto (TDC vs crédito) del PDF
  const deteccionRes = await base44.asServiceRole.integrations.Core.ExtractDataFromUploadedFile({
    file_url: cleanUrl,
    json_schema: {
      type: "object",
      properties: {
        banco_nombre: { type: "string", description: "Nombre del banco que aparece en el encabezado del extracto" },
        texto_encabezado: { type: "string", description: "Texto visible en las primeras líneas del PDF (primeras 500 palabras)" },
        tipo_producto: { type: "string", description: "Tipo de producto: 'tarjeta_credito', 'credito_hipotecario', 'credito_libre_destino', 'credito_rotativo' u 'otro'" },
        numero_obligacion: { type: "string", description: "Número de obligación/crédito si el extracto es de un crédito (no tarjeta). Tal como aparece en el PDF." }
      }
    }
  });

  let bancoDetectadoCode = null;
  let tipoProducto = "TDC";
  let numeroObligacionDetectado = "";
  if (deteccionRes.status === "success" && deteccionRes.output) {
    const textoDeteccion = `${deteccionRes.output.banco_nombre || ""} ${deteccionRes.output.texto_encabezado || ""}`;
    bancoDetectadoCode = detectarBanco(textoDeteccion);
    numeroObligacionDetectado = deteccionRes.output.numero_obligacion || "";
    const tp = String(deteccionRes.output.tipo_producto || "").toLowerCase();
    if (tp.includes("hipotecario")) tipoProducto = "CH";
    else if (tp.includes("libre")) tipoProducto = "LIB";
    else if (tp.includes("rotativo")) tipoProducto = "CR";
    else if (tp.includes("credito") && !tp.includes("tarjeta")) {
      const credDet = detectarCredito(textoDeteccion);
      tipoProducto = credDet || "LIB";
    } else {
      // La IA dijo tarjeta u otro; verificar con keywords por si es crédito
      const credDet = detectarCredito(textoDeteccion);
      if (credDet) tipoProducto = credDet;
    }
  }

  // Si se detectó crédito, usar el flujo de extracción de crédito
  if (tipoProducto !== "TDC") {
    return await extraerCredito(base44, cleanUrl, bancoDetectadoCode, tipoProducto, numeroObligacionDetectado);
  }

  // Paso 2: Extraer datos completos con prompt específico del banco (TDC)
  const promptBanco = construirPromptBanco(bancoDetectadoCode);
  const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
    prompt: `${promptBanco}

Analiza el siguiente extracto bancario en PDF y devuelve un JSON con la estructura solicitada.
Extrae TODOS los movimientos individuales (compras, avances, abonos) de la sección de movimientos.
Extrae TODOS los cargos financieros (intereses, seguros, comisiones, cuota de manejo) de la sección de resumen de cargos.
Cada cargo financiero debe ir como una entrada separada en "resumen_cargos" con su concepto, valor y fecha (si aparece).`,
    file_urls: [cleanUrl],
    response_json_schema: EXTRACTO_SCHEMA
  });

  const data = result;
  const banco = normalizeBanco(data.banco, bancoDetectadoCode);
  const bancoDef = BANCOS_DEFINICIONES[banco.code] || null;
  const fechaCorte = normalizeDate(data.fecha_corte);
  const fechaPago = restarUnDia(normalizeDate(data.fecha_pago));
  const fechaCorteAnterior = normalizeDate(data.fecha_corte_anterior);

  // Normalizar movimientos — filtrar líneas de subtotal
  const movimientos = (data.movimientos || []).map((m) => {
    const tipo = inferTipo(m.descripcion, m.tipo, bancoDef);
    return {
      fecha: normalizeDate(m.fecha),
      descripcion: (m.descripcion || "").trim(),
      valor: Math.abs(Number(m.valor) || 0),
      tipo,
      naturaleza: naturalezaFromTipo(tipo)
    };
  }).filter((m) => m.fecha && m.valor > 0 && !esLineaSubtotal(m.descripcion) && !esCuotaPosterior(m.descripcion));

  // Normalizar cargos financieros como líneas adicionales
  const cargosFinancieros = (data.resumen_cargos || []).map((c) => {
    const concepto = (c.concepto || "").trim();
    return {
      fecha: normalizeDate(c.fecha) || fechaCorte,
      descripcion: concepto,
      valor: Math.abs(Number(c.valor) || 0),
      tipo: "financiero",
      naturaleza: "cargo",
      subcuenta_gasto: subcuentaParaCargo(concepto)
    };
  }).filter((c) => c.valor > 0 && !esLineaSubtotal(c.descripcion));

  // Evitar duplicados: si un cargo financiero ya está en movimientos con mismo valor+descripción, omitirlo
  const todasLineas = [...movimientos];
  for (const cf of cargosFinancieros) {
    const yaExiste = movimientos.some((m) =>
      m.valor === cf.valor &&
      m.tipo === "financiero" &&
      (m.descripcion.toLowerCase().includes(cf.descripcion.toLowerCase().substring(0, 10)) ||
       cf.descripcion.toLowerCase().includes(m.descripcion.toLowerCase().substring(0, 10)))
    );
    if (!yaExiste) todasLineas.push(cf);
  }

  // Matching de tarjeta a producto
  const last4 = getLast4(data.numero_tarjeta);
  const productos = await base44.asServiceRole.entities.ProductoCredito.list();
  const productosActivos = productos.filter((p) => p.estado === "activo");

  let productoMatch = null;
  // 1. Match exacto: banco + últimos 4 dígitos (más confiable)
  if (banco.code && last4) {
    productoMatch = productosActivos.find((p) =>
      p.banco === banco.code && String(p.nomenclatura || "").replace(/\D/g, "").endsWith(last4)
    );
  }
  // 2. Solo últimos 4 dígitos si no hubo match por banco+last4
  if (!productoMatch && last4) {
    productoMatch = productosActivos.find((p) =>
      String(p.nomenclatura || "").replace(/\D/g, "").endsWith(last4)
    );
  }
  // IMPORTANTE: NO hacer fallback por banco solo — un banco puede tener múltiples tarjetas
  // Si no hay match, producto_match = null y el usuario debe seleccionar manualmente

  // Categorizar cargos financieros en los campos del ExtractoProducto
  const cargosCategorizados = categorizarCargos(cargosFinancieros);

  let periodo = fechaCorte ? fechaCorte.substring(0, 7) : "";

  return Response.json({
    banco_detectado: banco,
    cargos_categorizados: cargosCategorizados,
    banco_definicion: bancoDef ? {
      dateFormat: bancoDef.dateFormat,
      tieneFechaCorteAnterior: bancoDef.tieneFechaCorteAnterior,
      cargosFinancieros: bancoDef.cargosFinancieros
    } : null,
    tarjeta: data.numero_tarjeta,
    last4,
    titular: data.titular,
    periodo,
    fecha_corte: fechaCorte,
    fecha_corte_anterior: fechaCorteAnterior,
    fecha_pago: fechaPago,
    saldo_anterior: Number(data.saldo_anterior) || 0,
    saldo_a_pagar: Number(data.saldo_a_pagar) || 0,
    pago_minimo: Number(data.pago_minimo) || 0,
    cupo_total: Number(data.cupo_total) || 0,
    cupo_disponible: Number(data.cupo_disponible) || 0,
    lineas: todasLineas,
    total_cargos: todasLineas.filter((l) => l.naturaleza === "cargo").reduce((s, l) => s + l.valor, 0),
    total_abonos: todasLineas.filter((l) => l.naturaleza === "abono").reduce((s, l) => s + l.valor, 0),
    producto_match: productoMatch ? {
      id: productoMatch.id, nombre: productoMatch.nombre,
      banco: productoMatch.banco, nomenclatura: productoMatch.nomenclatura
    } : null,
    productos_disponibles: productosActivos.map((p) => ({
      id: p.id, nombre: p.nombre, banco: p.banco, nomenclatura: p.nomenclatura
    }))
  });
}

// ===== Extracción de extractos de CRÉDITO (CH/LIB/CR) =====
// Flujo paralelo al de TDC pero con schema/prompt propios. En esta fase solo se
// extrae y devuelve al frontend para previsualización; la confirmación no genera
// asientos ni conciliación (ver rama `esCredito` en `confirmar`).
async function extraerCredito(base44, cleanUrl, bancoDetectadoCode, tipoProducto, numeroObligacionDetectado) {
  const prompt = construirPromptCredito(tipoProducto);
  const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
    prompt: `${prompt}

Analiza el siguiente extracto de crédito en PDF y devuelve un JSON con la estructura solicitada.
Extrae TODOS los movimientos individuales del período (abonos, intereses, seguros, comisiones, GMF y otros).`,
    file_urls: [cleanUrl],
    response_json_schema: EXTRACTO_CREDITO_SCHEMA
  });

  const data = result;
  const banco = normalizeBanco(data.banco, bancoDetectadoCode);
  const numeroObligacion = (data.numero_obligacion || numeroObligacionDetectado || "").trim();
  const fechaCorte = normalizeDate(data.fecha_corte);
  const fechaPago = restarUnDia(normalizeDate(data.fecha_pago));
  const periodo = fechaCorte ? fechaCorte.substring(0, 7) : "";

  const movimientos = (data.movimientos || []).map((m) => {
    const tipo = inferTipoCredito(m.descripcion, m.tipo);
    return {
      fecha: normalizeDate(m.fecha) || fechaCorte,
      descripcion: (m.descripcion || "").trim(),
      valor: Math.abs(Number(m.valor) || 0),
      tipo,
      naturaleza: naturalezaCreditoFromTipo(tipo)
    };
  }).filter((m) => m.valor > 0 && !esLineaSubtotalCredito(m.descripcion));

  const cargosCategorizados = {
    cuota_manejo: 0,
    seguros: Number(data.seguros) || 0,
    intereses_corrientes: Number(data.intereses_corrientes) || 0,
    intereses_mora: Number(data.intereses_mora) || 0,
    comisiones: 0,
    otros_gastos: 0,
    rendimientos: Number(data.valor_cobertura) || 0,
    cashback: 0,
    valor_cobertura: Number(data.valor_cobertura) || 0
  };

  (data.resumen_cargos || []).forEach((c) => {
    const d = (c.concepto || "").toLowerCase();
    const val = Math.abs(Number(c.valor) || 0);
    if (d.includes("cobertura") || d.includes("frech") || d.includes("subsidio tasa")) cargosCategorizados.valor_cobertura = val;
    else if (d.includes("seguro") || d.includes("vida") || d.includes("incendio") || d.includes("terremoto")) cargosCategorizados.seguros = val;
    else if (d.includes("mora")) cargosCategorizados.intereses_mora = val;
    else if (d.includes("interes") || d.includes("interés")) cargosCategorizados.intereses_corrientes = val;
  });

  if (cargosCategorizados.valor_cobertura > 0 && !movimientos.some((l) => l.descripcion.toLowerCase().includes("cobertura"))) {
    movimientos.push({
      fecha: fechaCorte,
      descripcion: "Valor cobertura (subsidio tasa / descuento intereses)",
      valor: cargosCategorizados.valor_cobertura,
      tipo: "cobertura",
      naturaleza: "abono"
    });
  }

  // Matching por número de obligación contra productos de crédito activos
  const productos = await base44.asServiceRole.entities.ProductoCredito.list();
  const productosCreditoActivos = productos.filter((p) =>
    p.estado === "activo" && ["CH", "LIB", "CR"].includes(p.tipo)
  );

  let productoMatch = null;
  const oblNorm = normalizeObligacion(numeroObligacion);
  if (oblNorm && oblNorm.length >= 4) {
    productoMatch = productosCreditoActivos.find((p) => {
      const pcNorm = normalizeObligacion(p.numero_completo || "");
      const ciNorm = normalizeObligacion(p.codigo_interno || "");
      if (pcNorm && pcNorm === oblNorm) return true;
      if (ciNorm && ciNorm === oblNorm) return true;
      if (pcNorm && (pcNorm.endsWith(oblNorm) || oblNorm.endsWith(pcNorm))) return true;
      if (ciNorm && (ciNorm.endsWith(oblNorm) || oblNorm.endsWith(ciNorm))) return true;
      return false;
    });
  }

  return Response.json({
    tipo_producto: tipoProducto,
    es_credito: true,
    banco_detectado: banco,
    numero_obligacion: numeroObligacion,
    titular: data.titular,
    periodo,
    fecha_corte: fechaCorte,
    fecha_pago: fechaPago,
    saldo_anterior: Number(data.saldo_anterior) || 0,
    saldo_a_pagar: Number(data.saldo_a_pagar) || 0,
    saldo_capital: Number(data.saldo_capital) || 0,
    valor_cuota: Number(data.valor_cuota) || 0,
    valor_cobertura: cargosCategorizados.valor_cobertura,
    cargos_categorizados: cargosCategorizados,
    lineas: movimientos,
    total_cargos: movimientos.filter((l) => l.naturaleza === "cargo").reduce((s, l) => s + l.valor, 0),
    total_abonos: movimientos.filter((l) => l.naturaleza === "abono").reduce((s, l) => s + l.valor, 0),
    producto_match: productoMatch ? {
      id: productoMatch.id, nombre: productoMatch.nombre,
      banco: productoMatch.banco, nomenclatura: productoMatch.nomenclatura
    } : null,
    productos_disponibles: productosCreditoActivos.map((p) => ({
      id: p.id, nombre: p.nombre, banco: p.banco, nomenclatura: p.nomenclatura
    }))
  });
}

async function confirmar(base44, user, body) {
  const { producto_id, periodo, fecha_corte, fecha_corte_anterior, fecha_pago, saldo_a_pagar, saldo_anterior, lineas, cargos_categorizados, observaciones, cargos_destino } = body;
  if (!producto_id || !periodo) return Response.json({ error: "producto_id y periodo son requeridos" }, { status: 400 });

  const cc = cargos_categorizados || {};
  const camposFinancieros = {
    cuota_manejo: Number(cc.cuota_manejo) || 0,
    cuota_manejo_fecha: cc.cuota_manejo_fecha || "",
    seguros: Number(cc.seguros) || 0,
    seguros_fecha: cc.seguros_fecha || "",
    intereses_corrientes: Number(cc.intereses_corrientes) || 0,
    intereses_corrientes_fecha: cc.intereses_corrientes_fecha || "",
    intereses_mora: Number(cc.intereses_mora) || 0,
    intereses_mora_fecha: cc.intereses_mora_fecha || "",
    comisiones: Number(cc.comisiones) || 0,
    comisiones_fecha: cc.comisiones_fecha || "",
    otros_gastos: Number(cc.otros_gastos) || 0,
    otros_gastos_fecha: cc.otros_gastos_fecha || "",
    rendimientos: Number(cc.rendimientos) || 0,
    rendimientos_fecha: cc.rendimientos_fecha || "",
    cashback: Number(cc.cashback) || 0,
    cashback_fecha: cc.cashback_fecha || ""
  };

  // Validación: no puede haber dos extractos del mismo período para una misma tarjeta
  const existing = await base44.asServiceRole.entities.ExtractoProducto.filter({ producto_id, periodo });
  if (existing.length > 0) {
    return Response.json({
      error: `Ya existe un extracto para el período ${periodo} de esta tarjeta. Elimina el extracto existente (período ${periodo}) antes de cargar uno nuevo, o asigna un período diferente.`
    }, { status: 400 });
  }

  const saldoFinal = Number(saldo_a_pagar) || 0;
  const sinDeuda = saldoFinal === 0;
  const today = new Date().toISOString().substring(0, 10);
  const extracto = await base44.asServiceRole.entities.ExtractoProducto.create({
    producto_id, periodo,
    fecha_corte: fecha_corte || "",
    fecha_corte_anterior: fecha_corte_anterior || "",
    fecha_pago: fecha_pago || "",
    saldo_a_pagar: saldoFinal,
    saldo_anterior: Number(saldo_anterior) || 0,
    observaciones: observaciones || "",
    ...camposFinancieros,
    estado: sinDeuda ? "pagado" : "pendiente_pago",
    estado_conciliacion: "sin_iniciar",
    total_lineas_banco: lineas.length,
    total_abonado: 0,
    saldo_pendiente: 0,
    porcentaje_pagado: sinDeuda ? 100 : 0,
    pagado_automaticamente: sinDeuda,
    fecha_pago_efectivo: sinDeuda ? today : "",
    saldo_a_favor: 0
  });

  // Crear líneas del extracto
  const lineasData = lineas.map((l) => {
    let subcuentaGasto = l.subcuenta_gasto || "";
    let destinoCargo = "gasto";
    let estadoConc = "sin_conciliar";
    let notasLinea = l.notas || "";
    if (l.tipo === "financiero" && cargos_destino) {
      const cat = categorizarCargo(l.descripcion);
      const decision = cargos_destino[cat];
      if (decision) {
        destinoCargo = decision.destino;
        if (decision.destino === "otra_cuenta" && decision.subcuenta) {
          subcuentaGasto = decision.subcuenta;
        } else if (decision.destino === "no_registrar") {
          estadoConc = "conciliado";
          notasLinea = "No registrar — decisión usuario al cargar extracto";
        }
      }
    }
    return {
      extracto_id: extracto.id,
      producto_id,
      fecha: l.fecha,
      descripcion: l.descripcion,
      tipo: l.tipo,
      naturaleza: l.naturaleza,
      valor: Number(l.valor) || 0,
      subcuenta_gasto: subcuentaGasto,
      destino_cargo: destinoCargo,
      estado_conciliacion: estadoConc,
      notas: notasLinea
    };
  });

  const lineasCreadas = lineasData.length > 0
    ? await base44.asServiceRole.entities.LineaExtracto.bulkCreate(lineasData)
    : [];

  // ===== Crear asientos contables para los cargos financieros (excepto "no_registrar") =====
  // Solo aplica a tarjetas de crédito (TDC). Los extractos de crédito (CH/LIB/CR) en
  // esta fase solo se registran; no generan asientos ni conciliación automática.
  const producto = await base44.asServiceRole.entities.ProductoCredito.get(producto_id);
  const esCredito = ["CH", "LIB", "CR"].includes(producto.tipo);
  const lineasVinculadas = new Set();
  const movsCreadosIds = new Set();
  if (!esCredito) {
    for (const linea of lineasCreadas) {
      if (linea.tipo !== "financiero" || linea.destino_cargo === "no_registrar") continue;

      let subcuentaContra = String(linea.subcuenta_gasto || subcuentaParaCargo(linea.descripcion)).trim();
      let tercero = producto.nombre;
      let clienteIdLinea = "";
      if (linea.destino_cargo === "otra_cuenta") {
        const decision = cargos_destino?.[categorizarCargo(linea.descripcion)];
        if (decision?.cliente_id) {
          try {
            const cli = await base44.asServiceRole.entities.Cliente.get(decision.cliente_id);
            if (cli?.nombre) tercero = cli.nombre;
            clienteIdLinea = decision.cliente_id;
          } catch (_) {}
        }
      }
      let cdaId = "";
      const cdasMatch = await base44.asServiceRole.entities.CuentaAhorro.filter({ subcuenta_puc: subcuentaContra, estado: "activa" });
      if (cdasMatch.length > 0) cdaId = cdasMatch[0].id;

      const result = await ejecutarCreacion(base44, user, {
        tipo: "diario",
        fecha: linea.fecha,
        descripcion: `Cargo financiero - ${extracto.periodo} - ${linea.descripcion}`,
        modo: "resultado",
        confirmar_sobregiro: true,
        movimientos: [
          {
            subcuenta: producto.subcuenta_puc,
            debito: 0, credito: linea.valor,
            descripcion: linea.descripcion + " [Cargo financiero extracto]",
            producto_credito_id: producto.id,
            tipo_movimiento_tdc: "financiero",
            periodo_extracto: extracto.periodo
          },
          {
            subcuenta: subcuentaContra,
            debito: linea.valor, credito: 0,
            descripcion: linea.descripcion,
            tercero,
            cliente_id: clienteIdLinea,
            cuenta_ahorro_id: cdaId
          }
        ]
      });

      const movsCreados = await base44.asServiceRole.entities.MovimientoContable.filter({ comprobante_id: result.comprobante.id });
      const movTDC = movsCreados.find((m) => m.producto_credito_id) || movsCreados[0];
      movsCreados.forEach((m) => movsCreadosIds.add(m.id));
      await base44.asServiceRole.entities.LineaExtracto.update(linea.id, {
        estado_conciliacion: "conciliado",
        movimiento_sistema_id: movTDC?.id || ""
      });
      lineasVinculadas.add(linea.id);
    }
  }

  // ===== Matching automático con movimientos contables existentes =====
  // Se excluyen las líneas ya vinculadas (cargos financieros con asiento propio) y los
  // movimientos recién creados para que no aparezcan como faltantes/sobrantes artificiales.
  // Los créditos (CH/LIB/CR) no se concilian en esta fase.
  let estadoConc = "sin_iniciar";
  let extractoActualizado = extracto;
  let resultadoConciliacion = { conciliados: [], faltantes: [], sobrantes: [], diferencias: [] };
  if (!esCredito && lineasCreadas.length > 0) {
    const movimientosSistema = (await getMovimientosPeriodo(base44, extracto))
      .filter((m) => !movsCreadosIds.has(m.id));
    const lineasParaConciliar = lineasCreadas.filter(
      (l) => !lineasVinculadas.has(l.id) && l.destino_cargo !== "no_registrar"
    );
    resultadoConciliacion = autoConciliarLineas(lineasParaConciliar, movimientosSistema);
    estadoConc = await persistirConciliacion(base44, extracto.id, resultadoConciliacion);
    extractoActualizado = await recalcularSaldoSistema(base44, extracto.id);
  }

  await base44.asServiceRole.entities.HistoricoContable.create({
    numero_comprobante: extracto.id,
    accion: "extracto_pdf_cargado",
    descripcion: esCredito
      ? `Extracto de crédito (${producto.tipo}) cargado: ${periodo}, ${lineasCreadas.length} líneas. Registro solo (sin contabilizar).`
      : `Extracto PDF cargado: ${periodo}, ${lineasCreadas.length} líneas. Auto-conciliación: ${resultadoConciliacion.conciliados.length} conciliadas, ${resultadoConciliacion.faltantes.length} faltantes, ${resultadoConciliacion.sobrantes.length} sobrantes.`,
    monto_total: Number(saldo_a_pagar) || 0,
    usuario_email: user.email || "",
    fecha: new Date().toISOString().substring(0, 10)
  });

  return Response.json({
    extracto_id: extracto.id,
    lineas_creadas: lineasCreadas.length,
    conciliacion_automatica: {
      conciliadas: resultadoConciliacion.conciliados.length,
      faltantes: resultadoConciliacion.faltantes.length,
      sobrantes: resultadoConciliacion.sobrantes.length,
      diferencias: resultadoConciliacion.diferencias.length,
      estado: estadoConc,
      saldo_sistema: extractoActualizado.saldo_sistema,
      diferencia_saldo: extractoActualizado.diferencia_saldo
    },
    message: "Extracto creado y conciliado automáticamente"
  });
}