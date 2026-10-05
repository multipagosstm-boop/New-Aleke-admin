import { GoogleGenAI } from '@google/genai';

/**
 * Normaliza y redondea montos en pesos colombianos (COP).
 * Soporta números en formato colombiano (1.250.000,50), formato anglosajón (1,250,000.50),
 * cadenas con comillas simples (ej. "'-2.328e-10") y elimina residuos de punto flotante de JS.
 * Por defecto redondea a 2 decimales (o hasta maxDecimals, típicamente 2 o 3).
 */
export function parseAndRoundCOP(val, maxDecimals = 2) {
  if (val === null || val === undefined || val === '') return 0;

  if (typeof val === 'number') {
    if (isNaN(val) || !isFinite(val)) return 0;
    // Residuos infinitesimales de punto flotante (< 0.0005) son 0
    if (Math.abs(val) < 0.0005) return 0;
    const factor = Math.pow(10, maxDecimals);
    return Math.round((val + Number.EPSILON) * factor) / factor;
  }

  let str = String(val).trim();
  // Limpiar comillas iniciales o finales (ej: "'-2.3283064e-10")
  str = str.replace(/^['"]+|['"]+$/g, '').trim();

  // Si tiene notación científica negativa pequeña (e-X donde X >= 4), es 0
  if (/e-[4-9]\d*$/i.test(str)) return 0;

  const isNegative = str.includes('-');
  str = str.replace(/[^0-9.,]/g, '');
  if (!str) return 0;

  let parsed = 0;
  // Caso 1: Tiene tanto punto como coma (ej: 1.250.000,50 o 1,250,000.50)
  if (str.includes('.') && str.includes(',')) {
    const lastDot = str.lastIndexOf('.');
    const lastComma = str.lastIndexOf(',');
    if (lastComma > lastDot) {
      // Formato colombiano: 1.250.000,50 -> 1250000.50
      const clean = str.replace(/\./g, '').replace(',', '.');
      parsed = parseFloat(clean);
    } else {
      // Formato US: 1,250,000.50 -> 1250000.50
      const clean = str.replace(/,/g, '');
      parsed = parseFloat(clean);
    }
  } else if (str.includes(',')) {
    // Solo tiene comas
    const commaParts = str.split(',');
    if (commaParts.length > 2) {
      // Múltiples comas: 1,250,000
      parsed = parseFloat(str.replace(/,/g, ''));
    } else if (commaParts[1].length <= 2) {
      // Decimal evidente: ej 34500,50 o 12,5
      parsed = parseFloat(str.replace(',', '.'));
    } else {
      // Separador de miles o 3 decimales
      parsed = parseFloat(str.replace(/,/g, ''));
    }
  } else if (str.includes('.')) {
    // Solo tiene puntos
    const dotParts = str.split('.');
    if (dotParts.length > 2) {
      // Múltiples puntos: 1.250.000
      parsed = parseFloat(str.replace(/\./g, ''));
    } else if (dotParts[1].length <= 2) {
      // Decimal: 31458.39 o 10.5
      parsed = parseFloat(str);
    } else if (dotParts[1].length === 3 && parseInt(dotParts[0], 10) < 1000) {
      // 3 dígitos tras el punto en Colombia suele ser miles (ej: 50.960 -> 50960 pesos)
      parsed = parseFloat(str.replace(/\./g, ''));
    } else {
      parsed = parseFloat(str);
    }
  } else {
    parsed = parseFloat(str);
  }

  if (isNaN(parsed) || !isFinite(parsed)) return 0;
  if (isNegative) parsed = -Math.abs(parsed);
  if (Math.abs(parsed) < 0.0005) return 0;

  const factor = Math.pow(10, maxDecimals);
  return Math.round((parsed + Number.EPSILON) * factor) / factor;
}

export const SUBCUENTAS_GASTOS_FINANCIEROS = {
  cuota_manejo: "510504",
  seguros: "510505",
  comisiones: "510506",
  otros_gastos: "510507",
  valor_cobertura: "510502",
};
export const SUBCUENTA_GASTO_GENERICA = "510502";

export function categorizarCargo(descripcion) {
  const d = (descripcion || "").toLowerCase();
  if (d.includes("cuota de manejo") || d.includes("cuota manejo") || d.includes("manejo tarj") ||
      d.includes("manejo") || d.includes("membresia") || d.includes("membresía"))
    return "cuota_manejo";
  if (d.includes("cobertura") || d.includes("frech") || d.includes("subsidio tasa") || d.includes("alivio tasa") || d.includes("cob. tasa"))
    return "valor_cobertura";
  if (d.includes("seguro") || d.includes("seg deud") || d.includes("seg deu") || d.includes("seg.") ||
      d.includes("seg ") || d.includes("deudores") || d.includes("deudor") || d.includes("amparo") ||
      d.includes("poliza") || d.includes("póliza") || d.includes("proteccion") || d.includes("protección") ||
      d.includes("incendio") || d.includes("terremoto") || d.includes("vida"))
    return "seguros";
  if (d.includes("mora"))
    return "intereses_mora";
  if (d.includes("interes") || d.includes("interés") || d.includes("financiac") || d.includes("int.") || d.includes("int "))
    return "intereses_corrientes";
  if (d.includes("cashback") || d.includes("cash back"))
    return "cashback";
  if (d.includes("rendimiento"))
    return "rendimientos";
  if (d.includes("comision") || d.includes("comisión") || d.includes("gmf") ||
      d.includes("4x1000") || d.includes("4x100") || d.includes("iva") ||
      d.includes("utilizacion tarj") || d.includes("utilización tarj") ||
      d.includes("servicio tarj") || d.includes("serv. tarj") || d.includes("transacc"))
    return "comisiones";
  return "otros_gastos";
}

export function subcuentaParaCargo(descripcion) {
  const cat = categorizarCargo(descripcion);
  return SUBCUENTAS_GASTOS_FINANCIEROS[cat] || SUBCUENTA_GASTO_GENERICA;
}

const MESES_ES = {
  ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5,
  jul: 6, ago: 7, sep: 8, oct: 9, nov: 10, dic: 11,
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
  julio: 6, agosto: 7, septiembre: 8, setiembre: 8, octubre: 9, noviembre: 10, diciembre: 11
};

export function normalizeDate(input) {
  if (input == null || input === "") return null;
  if (input instanceof Date) {
    if (isNaN(input.getTime())) return null;
    const y = input.getFullYear();
    const m = String(input.getMonth() + 1).padStart(2, "0");
    const d = String(input.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof input === "number") {
    if (input > 20000 && input < 90000) {
      const date = new Date(Math.round((input - 25569) * 86400 * 1000));
      if (!isNaN(date.getTime())) {
        const y = date.getUTCFullYear();
        const m = String(date.getUTCMonth() + 1).padStart(2, "0");
        const d = String(date.getUTCDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
      }
    }
  }
  const str = String(input).trim();
  if (!str || str.toLowerCase() === "inmediato") return null;

  // YYYY-MM-DD
  let m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;

  // DD/MM/YYYY or DD-MM-YYYY
  m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;

  // DDMMYYYY (ej: 14082026 BBVA)
  m = str.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;

  // DD/MON/YYYY (ej: 15 jun. 2026)
  m = str.match(/^(\d{1,2})[\/\-\s]+([a-zA-Záéíóú]+)[\.\s,]+(\d{4})/i);
  if (m) {
    const mes = MESES_ES[m[2].toLowerCase().substring(0, 3)];
    if (mes !== undefined) return `${m[3]}-${String(mes + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }

  // MON DD, YYYY (jul. 02, 2026)
  m = str.match(/^([a-zA-Záéíóú]+)[\.\s]+(\d{1,2}),?\s+(\d{4})/i);
  if (m) {
    const mes = MESES_ES[m[1].toLowerCase().substring(0, 3)];
    if (mes !== undefined) return `${m[3]}-${String(mes + 1).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }

  return null;
}

export function detectarBanco(texto) {
  const lower = (texto || "").toLowerCase();
  if (lower.includes("falabella")) return { code: "FA", name: "Falabella" };
  if (lower.includes("tuya") || lower.includes("éxito") || lower.includes("exito")) return { code: "TU", name: "Tuya" };
  if (lower.includes("itau") || lower.includes("itaú")) return { code: "IT", name: "Itaú" };
  if (lower.includes("occidente")) return { code: "OC", name: "Occidente" };
  if (lower.includes("popular")) return { code: "PO", name: "Popular" };
  if (lower.includes("serfinanza")) return { code: "SE", name: "Serfinanza" };
  if (lower.includes("bancolombia")) return { code: "BA", name: "Bancolombia" };
  if (lower.includes("bbva")) return { code: "BB", name: "BBVA" };
  if (lower.includes("bogot")) return { code: "BO", name: "Bogotá" };
  if (lower.includes("colpatria") || lower.includes("scotiabank")) return { code: "CO", name: "Colpatria" };
  if (lower.includes("davivienda")) return { code: "DA", name: "Davivienda" };
  return { code: "OT", name: "Banco Nacional" };
}

export function esLineaSubtotal(descripcion) {
  const d = (descripcion || "").toLowerCase().trim();
  const patrones = [
    "consumos del mes facturados", "total compras", "total avances", "total abonos",
    "total cargos", "subtotal", "suma total", "total del periodo", "saldo anterior",
    "saldo en pesos", "nuevo saldo", "saldo a favor", "total financiaciones",
    // Encabezado y desglose de valores aplicados en créditos hipotecarios (DEBEN IGNORARSE)
    "valores aplicados", "valores aplicados en el periodo", "valores aplicados en el período",
    "valores aplicados a su credito", "valores aplicados a su crédito",
    "aplicacion de valores", "aplicación de valores", "distribucion del pago", "distribución del pago",
    "abono a capital aplicado", "interes corriente aplicado", "intereses corrientes aplicados"
  ];
  return patrones.some((p) => d.includes(p));
}

export function esCuotaPosterior(descripcion) {
  const match = (descripcion || "").match(/\b(\d+)\/(\d+)\b/);
  if (match && Number(match[1]) >= 2) return true;
  return false;
}

export function restarUnDia(dateStr) {
  if (!dateStr) return dateStr;
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() - 1);
  return d.toISOString().substring(0, 10);
}

/**
 * Llama a Gemini multimodal para extraer datos estructurados del extracto en PDF.
 */
export async function extraerDatosExtractoConIA({ fileBase64, fileName = "extracto.pdf", onStatusUpdate }) {
  const apiKey =
    import.meta.env.VITE_GEMINI_API_KEY ||
    (typeof process !== 'undefined' ? process.env?.GEMINI_API_KEY : '') ||
    '';

  if (!apiKey) {
    throw new Error(
      "No se encontró la clave de API de Gemini (VITE_GEMINI_API_KEY). " +
      "Debes configurar la variable de entorno 'VITE_GEMINI_API_KEY' en la configuración de tu proyecto en Vercel y redesplegar."
    );
  }

  const ai = new GoogleGenAI({ apiKey });

  const prompt = `Eres un auditor contable experto en extractos bancarios colombianos (Tarjetas de crédito, cuentas y Créditos Hipotecarios / Comerciales).
Analiza el documento PDF adjunto (${fileName}) y extrae los datos del extracto con precisión quirúrgica.

TIPO DE PRODUCTO:
- Determina si el documento corresponde a un CRÉDITO HIPOTECARIO (CH), CRÉDITO DE LIBRE DESTINO (LIB), CRÉDITO ROTATIVO (CR) o TARJETA DE CRÉDITO (TDC).
- Si es crédito hipotecario, asigna tipo_producto: "CH" y es_credito: true.
- Si es tarjeta de crédito, asigna tipo_producto: "TDC" y es_credito: false.

REGLAS OBLIGATORIAS DE NÚMEROS Y MONEDA (COP - PESOS COLOMBIANOS):
1. En Colombia, el punto (.) es separador de miles y la coma (,) es separador decimal (ej: "$ 1.250.000,50" son 1250000.5 pesos; "$ 31.458,39" son 31458.39 pesos; "$ 50.960" son 50960 pesos).
2. NUNCA multipliques por 100 ni por 1000 los números. Si ves "$ 34.719,10" el valor es 34719.1, NO 3471910.
3. Si un valor no tiene centavos, devuélvelo como entero (ej: 1841920). Si tiene centavos, redondea a máximo 2 o 3 decimales (ej: 31458.39).
4. Todos los montos deben ser devueltos como números estándar en JSON (no strings con símbolos de moneda ni comas).

PARÁMETROS OBLIGATORIOS PARA CRÉDITOS HIPOTECARIOS (CH):
1. MOVIMIENTOS REGISTRADOS EN EL PERÍODO:
   - Los movimientos reales ocurridos en el período aparecen bajo el encabezado "MOVIMIENTOS REGISTRADOS EN SU CRÉDITO DURANTE EL PERÍODO" (o "Movimientos registrados en su crédito"). Extrae exclusivamente las transacciones individuales que estén en esta sección (ej. pagos de cuota, abonos a capital, desembolsos).
   - REGLA MANDATORIA DE EXCLUSIÓN: IGNORAR COMPLETAMENTE los campos bajo el encabezado "VALORES APLICADOS EN EL PERÍODO" (o "Valores aplicados a su crédito en el período", "Aplicación de valores / cuota"). Esta sección es ÚNICAMENTE un resumen explicativo de cómo derivó o se distribuyó el abono aplicado (capital, intereses, seguros) y NO son transacciones independientes. Extraerlos causaría duplicidad con el abono del movimiento y con los gastos.
2. GASTOS DEL PERÍODO Y NUEVO SALDO:
   - Los gastos del período aparecen al final bajo el encabezado "NUEVO SALDO DE SU CRÉDITO HIPOTECARIO" (o "Detalle del nuevo saldo", "Liquidación de su crédito").
   - De dicha sección debes extraer a los campos específicos y a "resumen_cargos":
     * intereses_corrientes: Monto de intereses corrientes liquidados en el período.
     * intereses_mora: Intereses de mora liquidados (0 si no aplica).
     * seguros: Seguros liquidados del período (seguro de vida/deudores, seguro de incendio/terremoto).
     * valor_cobertura: Monto de la cobertura (cobertura FRECH / subsidio de tasa del gobierno). Ten en cuenta que por lo general es un "ingreso" o alivio que descuenta a los intereses generados. Regístralo en resumen_cargos como concepto "Valor cobertura" (naturaleza: "ingreso" o "descuento_interes").
     * saldo_capital: Saldo capital pendiente que aparece en esta sección.
     * valor_cuota: Valor de la cuota mensual a pagar.
     * numero_obligacion: Número de la obligación / crédito hipotecario.

REGLAS PARA TARJETAS DE CRÉDITO (TDC):
- Extrae todos los movimientos individuales reales del período: compras, avances, pagos/abonos.
- Excluye líneas de subtotales o resúmenes ("Total compras", "Consumos del mes").
- Excluye compras a cuotas donde la cuota sea 2 o superior (ej: "2/36", "5/12"). Solo incluye compras nuevas del mes o primera cuota (1/36).
- Si la compra muestra el valor total de la transacción en la primera cuota, usa el valor total.
- Extrae los cargos financieros en "resumen_cargos" (cuota de manejo, seguros, intereses corrientes, intereses de mora, comisiones, 4x1000, otros gastos).

Devuelve UNICAMENTE un objeto JSON válido con este esquema:
{
  "banco": "Nombre del banco (Bancolombia, BBVA, Bogotá, Davivienda, etc.)",
  "tipo_producto": "CH | LIB | CR | TDC",
  "es_credito": true,
  "numero_obligacion": "Número de obligación o crédito si aplica (ej: CH-123456 o 5711113200014298)",
  "numero_tarjeta": "Número completo o enmascarado del producto o tarjeta si es TDC",
  "ultimos_4_digitos": "Últimos 4 dígitos del producto o tarjeta",
  "titular": "Nombre completo del titular",
  "periodo": "YYYY-MM del extracto (ej: 2026-09)",
  "fecha_corte": "YYYY-MM-DD",
  "fecha_corte_anterior": "YYYY-MM-DD o vacío",
  "fecha_pago": "YYYY-MM-DD (fecha límite de pago)",
  "saldo_anterior": 0.0,
  "saldo_a_pagar": 0.0,
  "pago_minimo": 0.0,
  "saldo_capital": 0.0,
  "valor_cuota": 0.0,
  "cupo_total": 0.0,
  "cupo_disponible": 0.0,
  "intereses_corrientes": 0.0,
  "intereses_mora": 0.0,
  "seguros": 0.0,
  "valor_cobertura": 0.0,
  "movimientos": [
    {
      "fecha": "YYYY-MM-DD",
      "descripcion": "Descripción del movimiento (extraído exclusivamente de 'MOVIMIENTOS REGISTRADOS EN SU CRÉDITO DURANTE EL PERÍODO' si es crédito hipotecario)",
      "valor": 0.0,
      "tipo": "abono | compra | avance | financiero | ajuste"
    }
  ],
  "resumen_cargos": [
    {
      "concepto": "Nombre del cargo o gasto (intereses corrientes, intereses mora, seguros, valor cobertura, cuota de manejo, etc.)",
      "valor": 0.0,
      "fecha": "YYYY-MM-DD o vacío",
      "naturaleza": "cargo | ingreso | descuento_interes"
    }
  ]
}`;

  const contents = [
    {
      role: 'user',
      parts: [
        {
          inlineData: {
            mimeType: 'application/pdf',
            data: fileBase64
          }
        },
        { text: prompt }
      ]
    }
  ];

  // Configuración de Retroceso Exponencial (Exponential Backoff)
  const candidateModels = ['gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];
  const maxAttemptsPerModel = 3;
  const baseDelayMs = 1500; // 1.5s inicial
  const backoffMultiplier = 2; // 1.5s -> 3s -> 6s
  const maxDelayMs = 8000; // Máximo 8s de espera entre intentos

  let lastError = null;
  let response = null;

  for (let mIdx = 0; mIdx < candidateModels.length; mIdx++) {
    const model = candidateModels[mIdx];

    for (let attempt = 1; attempt <= maxAttemptsPerModel; attempt++) {
      try {
        if (typeof onStatusUpdate === 'function') {
          onStatusUpdate({
            status: 'attempting',
            model,
            attempt,
            maxAttempts: maxAttemptsPerModel,
            message: `Consultando ${model} (intento ${attempt}/${maxAttemptsPerModel})…`
          });
        }

        response = await ai.models.generateContent({
          model,
          contents,
          config: {
            temperature: 0.1,
            responseMimeType: 'application/json'
          }
        });

        if (response?.text) {
          break; // Éxito con este modelo
        }
      } catch (err) {
        lastError = err;
        const errMsg = String(err?.message || err || '');
        const isTemporary =
          errMsg.includes('503') ||
          errMsg.includes('high demand') ||
          errMsg.includes('UNAVAILABLE') ||
          errMsg.includes('temporarily') ||
          errMsg.includes('429') ||
          errMsg.includes('RESOURCE_EXHAUSTED') ||
          errMsg.includes('overloaded');

        console.warn(`[Gemini Backoff] Modelo ${model} fallo (intento ${attempt}/${maxAttemptsPerModel}):`, errMsg);

        // Si es un error temporal y aún quedan intentos para este modelo, aplicar exponential backoff
        if (isTemporary && attempt < maxAttemptsPerModel) {
          // Fórmula: base * multiplier^(attempt - 1)
          const rawDelay = baseDelayMs * Math.pow(backoffMultiplier, attempt - 1);
          // Jitter aleatorio (+-20%) para evitar colisiones entre peticiones simultáneas
          const jitter = 0.8 + Math.random() * 0.4;
          const waitMs = Math.min(Math.round(rawDelay * jitter), maxDelayMs);
          const waitSec = (waitMs / 1000).toFixed(1);

          if (typeof onStatusUpdate === 'function') {
            onStatusUpdate({
              status: 'retrying',
              model,
              attempt,
              nextAttempt: attempt + 1,
              maxAttempts: maxAttemptsPerModel,
              waitMs,
              message: `Alta demanda temporal en ${model} (503). Reintentando en ${waitSec}s con retroceso exponencial (intento ${attempt + 1}/${maxAttemptsPerModel})…`
            });
          }

          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }

        // Si no es temporal o se agotaron los intentos de este modelo, pasar al siguiente modelo
        if (mIdx < candidateModels.length - 1) {
          const nextModel = candidateModels[mIdx + 1];
          if (typeof onStatusUpdate === 'function') {
            onStatusUpdate({
              status: 'switching_model',
              previousModel: model,
              nextModel,
              message: `Cambiando a modelo alternativo ${nextModel} debido a saturación en ${model}…`
            });
          }
        }
        break;
      }
    }

    if (response?.text) break;
  }

  if (!response?.text) {
    throw parseAndHumanizeGeminiError(lastError);
  }

  const rawText = response.text || '{}';
  const cleanJson = rawText.replace(/```json\n?|```/g, '').trim();
  return JSON.parse(cleanJson);
}

/**
 * Convierte errores técnicos de Google Gemini (como 503 High Demand o 429) en mensajes comprensibles.
 */
function parseAndHumanizeGeminiError(err) {
  const rawMsg = err?.message || String(err || '');
  let code = null;
  let status = null;

  try {
    const parsed = JSON.parse(rawMsg);
    if (parsed.error) {
      code = parsed.error.code;
      status = parsed.error.status;
    }
  } catch {
    // rawMsg no es JSON
  }

  if (code === 503 || rawMsg.includes('503') || rawMsg.includes('high demand') || status === 'UNAVAILABLE') {
    return new Error(
      'Los servidores de Google Gemini están experimentando alta demanda temporal (Error 503). ' +
      'El sistema aplicó reintentos automáticos con retroceso exponencial, pero la congestión continúa. ' +
      'Por favor espera 15 a 30 segundos y vuelve a presionar "Procesar extracto".'
    );
  }

  if (code === 429 || rawMsg.includes('429') || rawMsg.includes('RESOURCE_EXHAUSTED') || rawMsg.includes('quota')) {
    return new Error(
      'Se alcanzó temporalmente el límite de peticiones de Google Gemini (Error 429 / Cuota excedida). ' +
      'Por favor espera un minuto antes de reintentar.'
    );
  }

  if (rawMsg.includes('API_KEY_INVALID') || code === 400 && rawMsg.includes('key')) {
    return new Error(
      'La clave de API de Gemini configurada no es válida. Revisa el valor de VITE_GEMINI_API_KEY en Vercel.'
    );
  }

  if (code === 403 || rawMsg.includes('403') || rawMsg.includes('PERMISSION_DENIED')) {
    return new Error(
      'Permiso denegado por Google Gemini (Error 403). Verifica que tu API key esté habilitada en Google AI Studio.'
    );
  }

  return err instanceof Error ? err : new Error(rawMsg || 'Error al comunicarse con Google Gemini.');
}


