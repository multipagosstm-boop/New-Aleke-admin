// Helpers del PUC reutilizados en el frontend (espejo de base44/shared/cuentas-puc.ts)
export const CLASES_NOMBRE = {
  1: "Activo",
  2: "Pasivo",
  3: "Patrimonio",
  4: "Ingreso",
  5: "Gasto",
  6: "Costos",
  7: "Costos",
  8: "Cuentas de Orden"
};

export function getClaseNombre(clase) {
  return CLASES_NOMBRE[clase] || "Otra";
}

export const NIVELES_PUC = ["Clase", "Grupo", "Cuenta", "Subcuenta", "Auxiliar"];

export function parentNivel(nivel) {
  return { Grupo: "Clase", Cuenta: "Grupo", Subcuenta: "Cuenta", Auxiliar: "Subcuenta" }[nivel] || null;
}

export function calcularNextCodigo(nivel, parentCodigo, todas) {
  if (nivel === "Clase") {
    const usados = new Set(todas.filter((c) => c.nivel === "Clase").map((c) => c.codigo));
    for (let i = 1; i <= 8; i++) if (!usados.has(i)) return i;
    return null;
  }
  if (!parentCodigo) return null;
  const mult = nivel === "Grupo" ? 10 : 100;
  const base = Number(parentCodigo) * mult;
  const hijos = todas.filter((c) => c.nivel === nivel && Math.floor(c.codigo / mult) === Number(parentCodigo));
  const maxSeq = hijos.reduce((max, c) => Math.max(max, c.codigo - base), 0);
  const seq = maxSeq + 1;
  if (mult === 10 && seq > 9) return null;
  if (mult === 100 && seq > 99) return null;
  return base + seq;
}