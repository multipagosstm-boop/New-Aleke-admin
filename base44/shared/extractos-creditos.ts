/**
 * Detección y extracción de extractos de CRÉDITO (hipotecario, libre destino, rotativo).
 *
 * Estos extractos tienen una estructura distinta a las tarjetas de crédito (TDC):
 * - NO hay número de tarjeta ni cupo. Hay un NÚMERO DE OBLIGACIÓN / crédito.
 * - NO hay compras ni avances. Los movimientos son: abonos (pagos del cliente),
 *   intereses corrientes/mora, seguros, comisiones, GMF (4x1000) y otros.
 * - Suele haber un saldo capital pendiente y un desglose capital/intereses de la cuota.
 *
 * En esta fase (Fase 1) solo se extrae y registra; no se contabiliza ni se concilia.
 * El rol contable (pasivo de Aleke con el banco vs cartera que Aleke tiene con un
 * cliente) queda definido por la subcuenta PUC del producto, no por este módulo.
 */

export type TipoCredito = "CH" | "LIB" | "CR";

const KEYWORDS: Record<TipoCredito, string[]> = {
  CH: ["hipotecario", "hipoteca", "credito de vivienda", "credito hipotecario", "vivienda", "ch-"],
  LIB: ["libre destino", "libre inversion", "libredestino", "credito libre", "lib-"],
  CR: ["credito rotativo", "linea rotativa", "credito revolving", "rotativo", "cr-"]
};

const TIPO_LABEL: Record<TipoCredito, string> = {
  CH: "Hipotecario",
  LIB: "Libre Destino",
  CR: "Rotativo"
};

/** Detecta el tipo de crédito a partir de un texto inicial del PDF. */
export function detectarCredito(texto: string): TipoCredito | null {
  const lower = (texto || "").toLowerCase();
  for (const tipo of ["CH", "LIB", "CR"] as TipoCredito[]) {
    for (const kw of KEYWORDS[tipo]) {
      if (lower.includes(kw)) return tipo;
    }
  }
  return null;
}

export function labelCredito(tipo: string | null): string {
  if (!tipo) return "Crédito";
  return TIPO_LABEL[tipo as TipoCredito] || "Crédito";
}

// ===== Schema para InvokeLLM — extractos de crédito =====
export const EXTRACTO_CREDITO_SCHEMA = {
  type: "object",
  properties: {
    banco: { type: "string", description: "Nombre del banco emisor del crédito" },
    numero_obligacion: { type: "string", description: "Número de obligación/crédito tal como aparece en el extracto (ej: LIB-123456789 o 12345678901)" },
    titular: { type: "string", description: "Nombre del titular/deudor del crédito" },
    tipo_credito: { type: "string", description: "Tipo de crédito: hipotecario, libre destino, rotativo" },
    periodo: { type: "string", description: "Período del extracto (ej: 2026-08 o Agosto 2026)" },
    fecha_corte: { type: "string", description: "Fecha de corte del extracto o fecha de la cuota del período" },
    fecha_pago: { type: "string", description: "Fecha límite de pago de la cuota" },
    saldo_anterior: { type: "number", description: "Saldo capital anterior al pago del período" },
    saldo_a_pagar: { type: "number", description: "Valor total a pagar en el período (cuota o pago mínimo)" },
    saldo_capital: { type: "number", description: "Saldo capital pendiente después del pago del período (obtenido de 'Nuevo saldo de su crédito hipotecario')" },
    valor_cuota: { type: "number", description: "Valor de la cuota fija mensual si aplica" },
    intereses_corrientes: { type: "number", description: "Intereses corrientes del período según 'Nuevo saldo de su crédito hipotecario'" },
    intereses_mora: { type: "number", description: "Intereses de mora si los hay en 'Nuevo saldo de su crédito hipotecario'" },
    seguros: { type: "number", description: "Seguros liquidados en 'Nuevo saldo de su crédito hipotecario' (vida, incendio, terremoto, etc.)" },
    valor_cobertura: { type: "number", description: "Valor cobertura (FRECH / subsidio de tasa que descuenta a los intereses) en 'Nuevo saldo de su crédito hipotecario'" },
    movimientos: {
      type: "array",
      items: {
        type: "object",
        properties: {
          fecha: { type: "string", description: "Fecha del movimiento" },
          descripcion: { type: "string", description: "Descripción del movimiento (extraído exclusivamente de 'MOVIMIENTOS REGISTRADOS EN SU CRÉDITO DURANTE EL PERÍODO')" },
          valor: { type: "number", description: "Valor del movimiento (siempre positivo)" },
          tipo: { type: "string", description: "abono, intereses, seguros, cobertura, comisiones u otros" }
        }
      }
    },
    resumen_cargos: {
      type: "array",
      items: {
        type: "object",
        properties: {
          concepto: { type: "string", description: "Nombre del gasto: intereses corrientes, intereses mora, seguros, valor cobertura, etc." },
          valor: { type: "number", description: "Valor monetario" },
          fecha: { type: "string", description: "Fecha si aparece" },
          naturaleza: { type: "string", description: "cargo | ingreso | descuento_interes" }
        }
      }
    }
  }
};

/** Construye un prompt específico para extraer un extracto de crédito. */
export function construirPromptCredito(tipoCredito: string | null): string {
  const label = tipoCredito ? ` de tipo **${labelCredito(tipoCredito)}**` : "";
  return `Eres un asistente experto en lectura de extractos bancarios de CRÉDITO colombianos (NO tarjetas de crédito).
Estás analizando un extracto de un crédito${label}.

DIFERENCIAS CON UN EXTRACTO DE TARJETA DE CRÉDITO:
- NO hay número de tarjeta ni cupo. Hay un NÚMERO DE OBLIGACIÓN / crédito.
- NO hay compras ni avances comerciales. Los movimientos son: ABONOS (pagos del cliente), DESEMBOLSOS, INTERESES CORRIENTES, INTERESES DE MORA, SEGUROS, VALOR COBERTURA, COMISIONES, GMF (4x1000) y OTROS.
- Hay un SALDO CAPITAL pendiente y un desglose de capital/intereses de la cuota.

PARÁMETROS OBLIGATORIOS PARA CRÉDITOS HIPOTECARIOS (CH):
1. MOVIMIENTOS REGISTRADOS EN EL PERÍODO:
   - Los movimientos reales que ocurrieron en el período aparecen bajo el encabezado "MOVIMIENTOS REGISTRADOS EN SU CRÉDITO DURANTE EL PERÍODO" (o similar). Solo extrae los movimientos individuales reales de esta sección (abonos, pagos de cuota, abonos extraordinarios a capital, desembolsos).
   - REGLA MANDATORIA DE EXCLUSIÓN: IGNORAR COMPLETAMENTE los campos bajo el encabezado "VALORES APLICADOS EN EL PERÍODO" (o "Valores aplicados a su crédito en el período", "Aplicación de valores / cuota"). Esta sección es ÚNICAMENTE un resumen explicativo de cómo derivó o se distribuyó el abono aplicado (capital, intereses, seguros) y NO son movimientos independientes. Extraerlos causaría duplicidad con el abono y con los gastos.
2. GASTOS DEL PERÍODO Y NUEVO SALDO:
   - Los gastos del período aparecen al final bajo el encabezado "NUEVO SALDO DE SU CRÉDITO HIPOTECARIO" (o "Detalle del nuevo saldo").
   - De dicha sección, debes extraer con exactitud:
     * Intereses corrientes (intereses_corrientes): monto de intereses corrientes liquidados del período.
     * Intereses de mora (intereses_mora): intereses de mora si hubiere (si no hay, 0).
     * Seguros (seguros): seguros liquidados (seguro de vida/deudores, seguro de incendio/terremoto).
     * Valor cobertura (valor_cobertura): monto de la cobertura (cobertura FRECH / subsidio de tasa del gobierno). Ten en cuenta que por lo general es un "ingreso" o alivio que descuenta a los intereses generados. Regístralo en resumen_cargos como "Valor cobertura" (naturaleza: ingreso/descuento).
     * Saldo capital (saldo_capital): el saldo capital pendiente que aparece en esta misma sección.
     * Valor cuota (valor_cuota): valor de la cuota mensual a pagar.

INSTRUCCIONES GENERALES:
- Extrae el número de obligación tal como aparece en el PDF (con o sin prefijo).
- Extrae TODOS los movimientos individuales reales del período (solo de la sección de movimientos registrados, nunca de "valores aplicados").
- Clasifica cada movimiento como:
  - "abono": pagos/abonos del cliente que reducen el saldo.
  - "intereses": intereses corrientes o de mora.
  - "seguros": seguro deudor, seguro de vida, seguro de incendio/terremoto, etc.
  - "cobertura": valor de cobertura de tasa / FRECH (alivio/ingreso que descuenta a los intereses).
  - "comisiones": comisiones bancarias, estudio, administración.
  - "otros": GMF (4x1000) y cualquier otro cargo no clasificable arriba.
- NO incluyas líneas de subtotal o resumen como "Total pagos", "Saldo anterior", "Nuevo saldo", "Total intereses", "Valores aplicados en el período" — solo movimientos individuales reales.
- Los valores van siempre positivos; la naturaleza (cargo/abono) se infiere del tipo.
- Si una fecha no se puede determinar, usa la fecha de corte del extracto.
- Extrae saldo_anterior, saldo_a_pagar, saldo_capital, valor_cuota, intereses_corrientes, intereses_mora, seguros y valor_cobertura.

FECHA DE PAGO POR BANCO:
- Davivienda (libre inversión / hipotecario): la fecha límite de pago aparece bajo el campo "Págués antes de" / "Paguese antes de" / "Páguése antes de". Busca esa etiqueta y extrae la fecha que la acompaña como fecha_pago.
- Otros bancos (Bancolombia, BBVA, Bogotá, etc.): usa "Fecha de pago", "Fecha límite de pago", "Pagar hasta", "Vence", "Pague antes de" o equivalente.
- La fecha_pago SIEMPRE debe estar presente si el extracto la muestra; no la dejes vacía.`;
}

/** Clasifica un movimiento de crédito en uno de los tipos de crédito. */
export function inferTipoCredito(descripcion: string, tipoAI: string): string {
  const d = (descripcion || "").toLowerCase();
  if (tipoAI === "abono" || d.startsWith("pago") || d.startsWith("abono")) return "abono";
  if (d.includes("cobertura") || d.includes("frech") || d.includes("subsidio tasa") || d.includes("alivio tasa")) return "cobertura";
  if (d.includes("interes") || d.includes("interés") || d.includes("int.") || d.includes("int ")) return "intereses";
  if (d.includes("seguro") || d.includes("seg deud") || d.includes("seg deu") || d.includes("póliza") || d.includes("poliza") || d.includes("incendio") || d.includes("terremoto") || d.includes("vida")) return "seguros";
  if (d.includes("comision") || d.includes("comisión") || d.includes("estudio") || d.includes("admin")) return "comisiones";
  if (d.includes("4x1000") || d.includes("4x100") || d.includes("gmf") || d.includes("gravamen")) return "otros";
  if (tipoAI && ["abono", "intereses", "seguros", "cobertura", "comisiones", "otros"].includes(tipoAI)) return tipoAI;
  return "otros";
}

/** Naturaleza (cargo/abono) de un movimiento de crédito según su tipo. */
export function naturalezaCreditoFromTipo(tipo: string): "cargo" | "abono" {
  return (tipo === "abono" || tipo === "cobertura") ? "abono" : "cargo";
}

// Patrones de líneas de subtotal/resumen que NO son movimientos individuales en un extracto de crédito.
const SUBTOTALES_CREDITO = [
  "saldo anterior", "nuevo saldo", "saldo capital", "saldo en pesos",
  "total abonos", "total cargos", "total pagos", "total del periodo",
  "total intereses", "total comisiones", "total seguros",
  "suma total", "subtotal", "cuota mensual fija", "valor cuota fija",
  "valores aplicados", "valores aplicados en el periodo", "valores aplicados en el período",
  "valores aplicados a su credito", "valores aplicados a su crédito",
  "aplicacion de valores", "aplicación de valores", "distribucion del pago", "distribución del pago"
];

/** Detecta líneas de subtotal/resumen que NO son movimientos individuales en un extracto de crédito. */
export function esLineaSubtotalCredito(descripcion: string): boolean {
  const d = (descripcion || "").toLowerCase().trim();
  return SUBTOTALES_CREDITO.some((p) => d.includes(p));
}

/** Normaliza un número de obligación a solo dígitos para comparación. */
export function normalizeObligacion(input: string): string {
  return String(input || "").replace(/\D/g, "");
}