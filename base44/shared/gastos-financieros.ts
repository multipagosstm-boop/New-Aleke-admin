/**
 * Mapeo entre categorías de cargos financieros de extractos bancarios
 * y sus subcuentas PUC correspondientes (cuenta 5105 - Gastos financieros).
 *
 * Subcuentas transaccionales:
 *   510504 - Cuota de manejo
 *   510505 - Seguros
 *   510506 - Comisiones
 *   510507 - Otros gastos financieros
 *
 * Las categorías sin subcuenta específica (intereses corrientes, intereses de mora)
 * usan la subcuenta genérica 510502 - Gastos Financieros.
 */

export const SUBCUENTAS_GASTOS_FINANCIEROS: Record<string, string> = {
  cuota_manejo: "510504",
  seguros: "510505",
  comisiones: "510506",
  otros_gastos: "510507",
};

export const SUBCUENTA_GASTO_GENERICA = "510502";

/**
 * Categoriza una descripción de cargo financiero en una categoría conocida.
 * Mismo orden/precedencia que usa el procesamiento de extractos PDF.
 */
export function categorizarCargo(descripcion: string): string {
  const d = (descripcion || "").toLowerCase();
  if (d.includes("cuota de manejo") || d.includes("cuota manejo") || d.includes("manejo tarj") ||
      d.includes("manejo") || d.includes("membresia") || d.includes("membresía"))
    return "cuota_manejo";
  if (d.includes("seguro") || d.includes("seg deud") || d.includes("seg deu") || d.includes("seg.") ||
      d.includes("seg ") || d.includes("deudores") || d.includes("deudor") || d.includes("amparo") ||
      d.includes("poliza") || d.includes("póliza") || d.includes("proteccion") || d.includes("protección"))
    return "seguros";
  if (d.includes("mora"))
    return "intereses_mora";
  if (d.includes("interes") || d.includes("interés") || d.includes("financiac"))
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

/**
 * Devuelve la subcuenta PUC correspondiente a un cargo financiero según su descripción.
 * Cuota de manejo → 510504, Seguros → 510505, Comisiones → 510506,
 * Otros gastos → 510507. Intereses y demás → 510502 (genérica).
 */
export function subcuentaParaCargo(descripcion: string): string {
  const cat = categorizarCargo(descripcion);
  return SUBCUENTAS_GASTOS_FINANCIEROS[cat] || SUBCUENTA_GASTO_GENERICA;
}