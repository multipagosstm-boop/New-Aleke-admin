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
    saldo_capital: { type: "number", description: "Saldo capital pendiente después del pago del período" },
    valor_cuota: { type: "number", description: "Valor de la cuota fija mensual si aplica" },
    movimientos: {
      type: "array",
      items: {
        type: "object",
        properties: {
          fecha: { type: "string", description: "Fecha del movimiento" },
          descripcion: { type: "string", description: "Descripción del movimiento (abono, intereses, seguros, comisiones, GMF, otros)" },
          valor: { type: "number", description: "Valor del movimiento (siempre positivo)" },
          tipo: { type: "string", description: "abono, intereses, seguros, comisiones u otros" }
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
- NO hay compras ni avances. Los movimientos son: ABONOS (pagos del cliente), INTERESES CORRIENTES, INTERESES DE MORA, SEGUROS, COMISIONES, GMF (4x1000) y OTROS.
- Puede haber un SALDO CAPITAL pendiente y un desglose de capital/intereses de la cuota.

INSTRUCCIONES:
- Extrae el número de obligación tal como aparece en el PDF (con o sin prefijo).
- Extrae TODOS los movimientos individuales del período. Cada uno con: fecha, descripción, valor (siempre positivo) y tipo.
- Clasifica cada movimiento como:
  - "abono": pagos/abonos del cliente que reducen el saldo.
  - "intereses": intereses corrientes o de mora.
  - "seguros": seguro deudor, seguro de vida, seguro de saldo, póliza, etc.
  - "comisiones": comisiones bancarias, estudio, administración.
  - "otros": GMF (4x1000) y cualquier otro cargo no clasificable arriba.
- NO incluyas líneas de subtotal o resumen como "Total pagos", "Saldo anterior", "Nuevo saldo", "Total intereses" — solo movimientos individuales reales.
- Los valores van siempre positivos; la naturaleza (cargo/abono) se infiere del tipo.
- Si una fecha no se puede determinar, usa la fecha de corte del extracto.
- Extrae saldo_anterior, saldo_a_pagar, saldo_capital y valor_cuota si aparecen en el extracto; si no aparecen, usa 0.

FECHA DE PAGO POR BANCO:
- Davivienda (libre inversión): la fecha límite de pago aparece bajo el campo "Págués antes de" / "Paguese antes de" / "Páguése antes de". Busca esa etiqueta y extrae la fecha que la acompaña como fecha_pago.
- Otros bancos: usa "Fecha de pago", "Fecha límite de pago", "Vence", "Pague antes de" o equivalente.
- La fecha_pago SIEMPRE debe estar presente si el extracto la muestra; no la dejes vacía.`;
}

/** Clasifica un movimiento de crédito en uno de los tipos de crédito. */
export function inferTipoCredito(descripcion: string, tipoAI: string): string {
  const d = (descripcion || "").toLowerCase();
  if (tipoAI === "abono" || d.startsWith("pago") || d.startsWith("abono")) return "abono";
  if (d.includes("interes") || d.includes("interés") || d.includes("int.") || d.includes("int ")) return "intereses";
  if (d.includes("seguro") || d.includes("seg deud") || d.includes("seg deu") || d.includes("póliza") || d.includes("poliza")) return "seguros";
  if (d.includes("comision") || d.includes("comisión") || d.includes("estudio") || d.includes("admin")) return "comisiones";
  if (d.includes("4x1000") || d.includes("4x100") || d.includes("gmf") || d.includes("gravamen")) return "otros";
  if (tipoAI && ["abono", "intereses", "seguros", "comisiones", "otros"].includes(tipoAI)) return tipoAI;
  return "otros";
}

/** Naturaleza (cargo/abono) de un movimiento de crédito según su tipo. */
export function naturalezaCreditoFromTipo(tipo: string): "cargo" | "abono" {
  return tipo === "abono" ? "abono" : "cargo";
}

// Patrones de líneas de subtotal/resumen que NO son movimientos individuales en un extracto de crédito.
const SUBTOTALES_CREDITO = [
  "saldo anterior", "nuevo saldo", "saldo capital", "saldo en pesos",
  "total abonos", "total cargos", "total pagos", "total del periodo",
  "total intereses", "total comisiones", "total seguros",
  "suma total", "subtotal", "cuota mensual fija", "valor cuota fija"
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