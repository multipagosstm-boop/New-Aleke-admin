/**
 * Definiciones estructurales de los extractos bancarios de tarjetas de crédito.
 * Cada banco tiene un formato distinto de PDF: Layout, fechas, secciones de movimientos,
 * cargos financieros y forma de enmascarar la tarjeta.
 *
 * Estas definiciones se usan para construir prompts específicos por banco que guían
 * a la IA en la extracción precisa de movimientos.
 */

export interface BancoDefinicion {
  code: string;
  name: string;
  /** Palabras clave para identificar el banco en el PDF */
  identification: string[];
  /** Formato de fecha predominante en la tabla de movimientos */
  dateFormat: string;
  /** Cómo aparece el número de tarjeta */
  cardFormat: string;
  /** Sección donde aparecen los movimientos de compras/avances/abonos */
  movimientosSection: { start: string; end: string };
  /** Sección donde aparecen los cargos financieros (intereses, seguros, etc.) */
  cargosSection: { start: string; end: string };
  /** Conceptos de cargos financieros conocidos */
  cargosFinancieros: string[];
  /** Descripciones que siempre son abonos */
  abonosConocidos: string[];
  /** Descripciones que siempre son avances */
  avancesConocidos: string[];
  /** Indica si el extracto trae fecha de corte anterior explícita */
  tieneFechaCorteAnterior: boolean;
  /** Indica si el pago mínimo suele ser igual al saldo total */
  pagoMinimoIgualSaldo: boolean;
  /** Notas adicionales para guiar a la IA */
  notas: string;
}

export const BANCOS_DEFINICIONES: Record<string, BancoDefinicion> = {
  BA: {
    code: "BA",
    name: "Bancolombia",
    identification: ["bancolombia", "grupo bancolombia"],
    dateFormat: "DD MON YYYY (ej: 15 jun. 2026) o DD/MM/YYYY",
    cardFormat: "Asteriscos + últimos 4 dígitos (ej: *********9538)",
    movimientosSection: { start: "MOVIMIENTOS DEL PERIODO", end: "RESUMEN DE LA TARJETA" },
    cargosSection: { start: "RESUMEN DE LA TARJETA", end: "TASA" },
    cargosFinancieros: [
      "CUOTA DE MANEJO", "INTERES CORRIENTE", "INTERES DE MORA", "SEGURO DEUDOR",
      "SEGURO VIDA", "COMISION", "GMF", "4X1000", "INTERES FINANCIACION",
      "SUPERAVANCE", "CONCEPTOS ESPECIALES"
    ],
    abonosConocidos: ["PAGO", "ABONO", "DEBITO AUTOMATICO", "NOTA CREDITO"],
    avancesConocidos: ["AVANCE", "RETIRO", "SUPERAVANCE"],
    tieneFechaCorteAnterior: true,
    pagoMinimoIgualSaldo: false,
    notas: "Las fechas pueden venir como '15 jun. 2026' o 'jul. 02, 2026'. Los abonos aparecen como negativos en la columna de valor. Incluir fecha_corte_anterior explícitamente."
  },

  BB: {
    code: "BB",
    name: "BBVA",
    identification: ["bbva", "bbva colombia", "resumen de tu tarjeta"],
    dateFormat: "DDMMYYYY pegado sin separadores (ej: 14082026 = 14/08/2026)",
    cardFormat: "Enmascarado con X o asteriscos, últimos 4 visibles",
    movimientosSection: { start: "Resumen de tu tarjeta", end: "RESUMEN" },
    cargosSection: { start: "RESUMEN DE LA TARJETA", end: "INFORMACION" },
    cargosFinancieros: [
      "CUOTA DE MANEJO", "INTERES CORRIENTE", "INTERES MORA", "SEGURO DEUDOR",
      "SEGURO VIDA", "COMISION", "GMF", "4X1000", "IVA", "INTERESES FINANCIACION"
    ],
    abonosConocidos: ["PAGO", "ABONO", "NOTA CREDITO", "PAGO MINIMO"],
    avancesConocidos: ["AVANCE", "RETIRO"],
    tieneFechaCorteAnterior: true,
    pagoMinimoIgualSaldo: false,
    notas: `El encabezado del extracto se llama "Resumen de tu tarjeta". Debajo hay una tabla con TODOS los movimientos del mes, con columnas: fecha, descripción y "valor original".
IMPORTANTE SOBRE LAS FECHAS: en esta tabla las fechas aparecen SIN separadores, pegadas como 8 dígitos DDMMYYYY (ej: "14082026" significa 14/08/2026, es decir día=14, mes=08, año=2026). Devuelve la fecha exactamente como aparece en el PDF (los 8 dígitos juntos), sin agregarle separadores tú mismo.
Usa la columna "valor original" como el valor del movimiento. Distinguir bien entre compras y avances.`
  },

  BO: {
    code: "BO",
    name: "Bogotá",
    identification: ["banco de bogota", "banco de bogotá", "bogota"],
    dateFormat: "DD/MM/YYYY",
    cardFormat: "Número completo o enmascarado (ej: 4916170017597382 o ****7382)",
    movimientosSection: { start: "MOVIMIENTOS", end: "RESUMEN" },
    cargosSection: { start: "RESUMEN FINANCIERO", end: "INFORMACION" },
    cargosFinancieros: [
      "CUOTA DE MANEJO", "INTERES CORRIENTE", "INTERES MORA", "SEGURO DEUDOR",
      "SEGURO VIDA", "COMISION", "GMF", "4X1000", "CASHBACK"
    ],
    abonosConocidos: ["PAGO", "ABONO", "CASHBACK", "NOTA CREDITO", "PSE"],
    avancesConocidos: ["AVANCE", "RETIRO"],
    tieneFechaCorteAnterior: false,
    pagoMinimoIgualSaldo: true,
    notas: "Incluye CASHBACK como abono. La fecha de corte anterior no siempre aparece explícita. El pago mínimo suele ser igual al saldo total."
  },

  OC: {
    code: "OC",
    name: "Occidente",
    identification: ["banco de occidente", "occidente"],
    dateFormat: "DD/MM/YYYY o DD-MON-YYYY",
    cardFormat: "Enmascarado, últimos 4 visibles",
    movimientosSection: { start: "MOVIMIENTOS", end: "RESUMEN" },
    cargosSection: { start: "RESUMEN DE CARGOS", end: "INFORMACION" },
    cargosFinancieros: [
      "CUOTA DE MANEJO", "INTERES CORRIENTE", "INTERES MORA", "SEGURO DEUDOR",
      "SEGURO VIDA", "COMISION", "GMF", "4X1000", "IVA INTERESES"
    ],
    abonosConocidos: ["PAGO", "ABONO", "NOTA CREDITO"],
    avancesConocidos: ["AVANCE", "RETIRO EFECTIVO"],
    tieneFechaCorteAnterior: true,
    pagoMinimoIgualSaldo: false,
    notas: "Banco del Grupo Aval. Formato similar a Bogotá y Popular."
  },

  PO: {
    code: "PO",
    name: "Popular",
    identification: ["banco popular", "popular"],
    dateFormat: "DD/MM/YYYY",
    cardFormat: "Enmascarado, últimos 4 visibles",
    movimientosSection: { start: "MOVIMIENTOS", end: "RESUMEN" },
    cargosSection: { start: "RESUMEN FINANCIERO", end: "INFORMACION" },
    cargosFinancieros: [
      "CUOTA DE MANEJO", "INTERES CORRIENTE", "INTERES MORA", "SEGURO DEUDOR",
      "SEGURO VIDA", "COMISION", "GMF", "4X1000"
    ],
    abonosConocidos: ["PAGO", "ABONO", "NOTA CREDITO"],
    avancesConocidos: ["AVANCE", "RETIRO"],
    tieneFechaCorteAnterior: true,
    pagoMinimoIgualSaldo: false,
    notas: "Banco del Grupo Aval. Formato similar a Bogotá y Occidente. FECHA DE PAGO: la fecha límite de pago aparece en el extracto bajo el encabezado 'Pague antes de:' (o 'PAGUE ANTES DE:'). Extrae esa fecha como fecha_pago — es obligatoria, NO la dejes vacía. Si aparece solo como día/mes, completa con el año del período."
  },

  DA: {
    code: "DA",
    name: "Davivienda",
    identification: ["davivienda", "davi"],
    dateFormat: "DD/MM/YYYY",
    cardFormat: "Enmascarado, últimos 4 visibles",
    movimientosSection: { start: "DETALLE DE MOVIMIENTOS", end: "RESUMEN" },
    cargosSection: { start: "RESUMEN DE CARGOS", end: "INFORMACION" },
    cargosFinancieros: [
      "CUOTA DE MANEJO", "INTERES CORRIENTE", "INTERES MORA", "SEGURO DEUDOR",
      "SEGURO VIDA", "COMISION", "GMF", "4X1000", "SEGURO FRAUDE", "CUOTA APROVECHAMIENTO"
    ],
    abonosConocidos: ["PAGO DAVIVIENDA", "ABONO", "NOTA CREDITO"],
    avancesConocidos: ["AVANCE", "RETIRO", "SUPERAVANCE"],
    tieneFechaCorteAnterior: true,
    pagoMinimoIgualSaldo: false,
    notas: `DISTRIBUCIÓN DE TABLAS (CRÍTICO): el extracto tiene tablas separadas para cargos y abonos.
1. "DETALLE DE MOVIMIENTOS DEL MES" y "MOVIMIENTOS DE MESES ANTERIORES" → son CARGOS (compras, avances y cargos financieros): AUMENTAN la deuda. Clasifícalos como 'compra', 'avance' o 'financiero', NUNCA como 'abono'.
2. "DETALLE APLICACIÓN DE PAGOS Y ABONOS" → son ABONOS (pagos del cliente): REDUCEN la deuda. SOLO estos se marcan como 'abono'.
NO clasifiques un movimiento como 'abono' solo porque su descripción contiene la palabra 'pago'. Pagar una factura con la tarjeta (ej: 'PAGO DE FACTURA', 'COMCEL PAGOS', 'PAGO SERVICIO') es una COMPRA (cargo), no un abono. Únicamente 'PAGO DAVIVIENDA' y los movimientos de la tabla 'aplicación de pagos y abonos' son abonos.
Aplica el filtro de cuotas: ignora los movimientos con cuota X/Y donde X >= 2 (ej: 2/36, 3/24) pues ya fueron registrados en períodos anteriores. Distingue cuota de manejo de aprovechamiento del saldo.`
  },

  CO: {
    code: "CO",
    name: "Colpatria",
    identification: ["colpatria", "davi bank", "davibank", "banco colpatria"],
    dateFormat: "DD/MM/YYYY",
    cardFormat: "Enmascarado, últimos 4 visibles",
    movimientosSection: { start: "MOVIMIENTOS", end: "RESUMEN" },
    cargosSection: { start: "RESUMEN", end: "INFORMACION" },
    cargosFinancieros: [
      "CUOTA DE MANEJO", "INTERES CORRIENTE", "INTERES MORA", "SEGURO DEUDOR",
      "SEGURO VIDA", "COMISION", "GMF", "4X1000", "PROTECCION DATOS"
    ],
    abonosConocidos: ["PAGO", "ABONO", "NOTA CREDITO"],
    avancesConocidos: ["AVANCE", "RETIRO"],
    tieneFechaCorteAnterior: true,
    pagoMinimoIgualSaldo: false,
    notas: "Ahora parte de Scotiabank Colpatria. Buscar 'Scotiabank Colpatria' como identificador alternativo."
  },

  IT: {
    code: "IT",
    name: "Itaú",
    identification: ["itau", "itaú", "itau colombia"],
    dateFormat: "DD/MM/YYYY",
    cardFormat: "Enmascarado, últimos 4 visibles",
    movimientosSection: { start: "MOVIMIENTOS", end: "RESUMEN" },
    cargosSection: { start: "RESUMEN DE CARGOS", end: "INFORMACION" },
    cargosFinancieros: [
      "CUOTA DE MANEJO", "INTERES CORRIENTE", "INTERES MORA", "SEGURO DEUDOR",
      "SEGURO VIDA", "COMISION", "GMF", "4X1000", "SEGURO PROTECCION"
    ],
    abonosConocidos: ["PAGO", "ABONO", "NOTA CREDITO"],
    avancesConocidos: ["AVANCE", "RETIRO", "SAQUE"],
    tieneFechaCorteAnterior: true,
    pagoMinimoIgualSaldo: false,
    notas: "Anteriormente CorpBanca. Los avances pueden aparecer como 'SAQUE' o 'RETIRO'."
  },

  FA: {
    code: "FA",
    name: "Falabella",
    identification: ["falabella", "cmr", "tarjeta cmr", "falabella colombia"],
    dateFormat: "DD/MM/YYYY",
    cardFormat: "Con espacios, asteriscos en medio (ej: 5282 09** **** 0162)",
    movimientosSection: { start: "DETALLE DE MOVIMIENTOS", end: "RESUMEN" },
    cargosSection: { start: "RESUMEN DE CARGOS", end: "TASA" },
    cargosFinancieros: [
      "COBRO SEGURO VIDA DEUDOR", "GMF GRAVAMEN MOVIMIENTO FINANC", "CUOTA DE MANEJO",
      "INTERES CORRIENTE", "INTERES MORA", "SEGURO", "COMISION", "4X1000"
    ],
    abonosConocidos: ["PAGO", "ABONO", "NOTA CREDITO", "TRASPASO SALDO"],
    avancesConocidos: ["AVANCE", "RETIRO"],
    tieneFechaCorteAnterior: true,
    pagoMinimoIgualSaldo: true,
    notas: "Incluye 'TRASPASO SALDO INI. ACREEDOR' como ajuste. Hay una línea de resumen 'Consumos del mes facturados' que NO es un movimiento individual sino un subtotal — NO incluirla como línea. El pago mínimo suele ser igual al saldo total."
  },

  TU: {
    code: "TU",
    name: "Tuya",
    identification: ["tuya", "exito", "éxito", "tarjeta exito", "grupo exito"],
    dateFormat: "DD/MM/YYYY",
    cardFormat: "Enmascarado, últimos 4 visibles",
    movimientosSection: { start: "MOVIMIENTOS", end: "RESUMEN" },
    cargosSection: { start: "RESUMEN DE CARGOS", end: "INFORMACION" },
    cargosFinancieros: [
      "CUOTA DE MANEJO", "INTERES CORRIENTE", "INTERES MORA", "SEGURO DEUDOR",
      "SEGURO VIDA", "COMISION", "GMF", "4X1000", "SEGURO PROTECCION"
    ],
    abonosConocidos: ["PAGO", "ABONO", "NOTA CREDITO", "DEVOLUCION"],
    avancesConocidos: ["AVANCE", "RETIRO"],
    tieneFechaCorteAnterior: true,
    pagoMinimoIgualSaldo: false,
    notas: "Tarjeta del Grupo Éxito. Las devoluciones de compras aparecen como abonos."
  },

  SE: {
    code: "SE",
    name: "Serfinanza",
    identification: ["serfinanza", "serfinansa"],
    dateFormat: "DD/MM/YYYY",
    cardFormat: "Enmascarado, últimos 4 visibles",
    movimientosSection: { start: "MOVIMIENTOS", end: "RESUMEN" },
    cargosSection: { start: "RESUMEN DE CARGOS", end: "INFORMACION" },
    cargosFinancieros: [
      "CUOTA DE MANEJO", "INTERES CORRIENTE", "INTERES MORA", "SEGURO DEUDOR",
      "SEGURO VIDA", "COMISION", "GMF", "4X1000", "SEGURO SALDO DEUDOR"
    ],
    abonosConocidos: ["PAGO", "ABONO", "NOTA CREDITO"],
    avancesConocidos: ["AVANCE", "RETIRO"],
    tieneFechaCorteAnterior: true,
    pagoMinimoIgualSaldo: false,
    notas: "Anteriormente Tarjeta Avianca. Los movimientos de avances pueden aparecer con texto 'DISPOSICION'."
  }
};

/** Detecta el banco a partir de un texto inicial del PDF */
export function detectarBanco(texto: string): string | null {
  const lower = (texto || "").toLowerCase();
  for (const [code, def] of Object.entries(BANCOS_DEFINICIONES)) {
    for (const id of def.identification) {
      if (lower.includes(id.toLowerCase())) return code;
    }
  }
  return null;
}

/** Construye un prompt específico para el banco detectado, guiando a la IA en la extracción */
export function construirPromptBanco(bancoCode: string | null): string {
  if (!bancoCode) {
    return `Eres un asistente experto en lectura de extractos bancarios de tarjetas de crédito colombianas.
Extrae TODOS los movimientos del extracto (compras, avances, abonos y cargos financieros).
Cada movimiento debe tener: fecha, descripción, valor (siempre positivo) y tipo (compra, abono, avance, financiero o ajuste).
Los pagos y abonos son tipo "abono". Los intereses, seguros, comisiones y cuota de manejo son tipo "financiero".
Las compras son tipo "compra". Los retiros/avances son tipo "avance".
NO incluyas líneas de subtotal o resumen como "Total compras del mes" — solo movimientos individuales.

REGLAS SOBRE CUOTAS (COMPRAS DIFERIDAS):
- Algunas compras se diferiden a cuotas. En la descripción aparece el formato "X/Y" (ej: "1/36", "2/24", "3/12").
- X = número de cuota actual, Y = total de cuotas.
- SOLO incluye la PRIMERA cuota (X=1, ej: "1/36", "1/12"). Esta representa el movimiento original.
- NO incluyas cuotas con X >= 2 (ej: "2/36", "3/24", "5/12"). Estas ya fueron registradas en períodos anteriores.
- Para la PRIMERA cuota, extrae el VALOR TOTAL de la compra, NO el valor de la cuota mensual.
- Si el extracto muestra "iPhone 1/36 $5.000.000", el valor es 5000000. Si muestra "iPhone 2/36 $138.889", NO lo incluyas.`;
  }

  const def = BANCOS_DEFINICIONES[bancoCode];
  return `Eres un asistente experto en lectura de extractos bancarios de tarjetas de crédito colombianas.
Estás analizando un extracto de **${def.name}**.

FORMATO DE FECHAS: ${def.dateFormat}
FORMATO DE TARJETA: ${def.cardFormat}

ESTRUCTURA DEL PDF:
- Los movimientos individuales aparecen en la sección "${def.movimientosSection.start}" (termina antes de "${def.movimientosSection.end}").
- Los cargos financieros aparecen en la sección "${def.cargosSection.start}" (termina antes de "${def.cargosSection.end}").

REGLAS DE CLASIFICACIÓN:
- Descripciones que son ABONOS: ${def.abonosConocidos.join(", ")}
- Descripciones que son AVANCES: ${def.avancesConocidos.join(", ")}
- Cargos financieros conocidos: ${def.cargosFinancieros.join(", ")}

INSTRUCCIONES ESPECÍFICAS:
${def.notas}

${def.tieneFechaCorteAnterior ? "- Extrae la fecha de corte del período anterior si aparece en el extracto." : "- La fecha de corte anterior puede no aparecer; si no la encuentras, déjala vacía."}
${def.pagoMinimoIgualSaldo ? "- El pago mínimo suele ser igual al saldo total a pagar." : "- El pago mínimo es un valor distinto al saldo total."}

REGLAS GENERALES:
- Cada movimiento debe tener: fecha, descripción, valor (siempre positivo) y tipo (compra, abono, avance, financiero o ajuste).
- NO incluyas líneas de subtotal o resumen como "Total compras del mes" o "Consumos del mes facturados" — solo movimientos individuales reales.
- Los valores van siempre positivos; la naturaleza (cargo/abono) se infiere del tipo.
- Si una fecha no se puede determinar, usa la fecha de corte del extracto.

REGLAS SOBRE CUOTAS (COMPRAS DIFERIDAS):
- Algunas compras se diferiden a cuotas. En la descripción aparece el formato "X/Y" (ej: "1/36", "2/24", "3/12").
- X = número de cuota actual, Y = total de cuotas.
- SOLO incluye la PRIMERA cuota (X=1, ej: "1/36", "1/12"). Esta representa el movimiento original.
- NO incluyas cuotas con X >= 2 (ej: "2/36", "3/24", "5/12"). Estas ya fueron registradas en períodos anteriores y aparecen como cargos recurrentes.
- Para la PRIMERA cuota, extrae el VALOR TOTAL de la compra, NO el valor de la cuota mensual. Si el extracto muestra tanto el valor total como el valor de la cuota, usa el VALOR TOTAL.
- Ejemplos: "iPhone 15 Pro 1/36 $5.000.000" → incluye con valor 5000000. "iPhone 15 Pro 2/36 $138.889" → NO incluye.`;
}