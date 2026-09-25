// Lógica compartida para creación/actualización de cuentas contables PUC de cualquier nivel.

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

function digitosNivel(nivel) {
  return { Clase: 1, Grupo: 2, Cuenta: 4, Subcuenta: 6, Auxiliar: 8 }[nivel] || 0;
}

// Calcula el siguiente código disponible bajo un padre (o siguiente clase si nivel=Clase).
export function calcularNextCodigo(nivel, parentCodigo, todas) {
  if (nivel === "Clase") {
    const usados = new Set(todas.filter((c) => c.nivel === "Clase").map((c) => c.codigo));
    for (let i = 1; i <= 8; i++) if (!usados.has(i)) return i;
    return null;
  }
  if (!parentCodigo) return null;
  const mult = nivel === "Grupo" ? 10 : 100;
  const base = Number(parentCodigo) * mult;
  const hijos = todas.filter((c) => {
    if (c.nivel !== nivel) return false;
    return Math.floor(c.codigo / mult) === Number(parentCodigo);
  });
  const maxSeq = hijos.reduce((max, c) => Math.max(max, c.codigo - base), 0);
  const seq = maxSeq + 1;
  if (mult === 10 && seq > 9) return null;
  if (mult === 100 && seq > 99) return null;
  return base + seq;
}

function derivarComponentes(codigo) {
  const s = String(codigo);
  const out = { clase: Number(s[0]) };
  if (s.length >= 2) out.grupo = Number(s.slice(0, 2));
  if (s.length >= 4) out.cuenta = Number(s.slice(0, 4));
  if (s.length >= 6) out.subcuenta = Number(s.slice(0, 6));
  if (s.length >= 8) out.auxiliar = Number(s.slice(0, 8));
  return out;
}

export async function crearCuentaPUC(base44, user, params) {
  const { nivel, parent_codigo, concepto, naturaleza, tipo_estado, es_transaccional } = params;

  if (!nivel) throw new Error("Nivel es obligatorio");
  if (!NIVELES_PUC.includes(nivel)) throw new Error("Nivel no válido");
  if (!concepto || !concepto.trim()) throw new Error("Concepto es obligatorio");
  if (!naturaleza) throw new Error("Naturaleza es obligatoria");
  if (!tipo_estado) throw new Error("Tipo de estado es obligatorio");
  if (nivel !== "Clase" && !parent_codigo) throw new Error("Debe indicar la cuenta padre");

  const todas = await base44.asServiceRole.entities.Cuenta.list("-codigo", 2000);
  const codigo = calcularNextCodigo(nivel, parent_codigo, todas);
  if (!codigo) throw new Error("No hay códigos disponibles bajo el padre seleccionado");

  const existentes = todas.find((c) => c.codigo === codigo);
  if (existentes) throw new Error(`Ya existe una cuenta con código ${codigo}`);

  const comps = derivarComponentes(codigo);

  return await base44.asServiceRole.entities.Cuenta.create({
    codigo,
    nivel,
    clase: comps.clase,
    clase_nombre: getClaseNombre(comps.clase),
    grupo: comps.grupo || undefined,
    cuenta: comps.cuenta || undefined,
    subcuenta: comps.subcuenta || undefined,
    auxiliar: comps.auxiliar || undefined,
    concepto: concepto.trim(),
    naturaleza,
    tipo_estado,
    es_transaccional: !!es_transaccional
  });
}

export async function eliminarCuentaPUC(base44, user, params) {
  const { id } = params;
  if (!id) throw new Error("ID es obligatorio");

  const todas = await base44.asServiceRole.entities.Cuenta.list("-codigo", 2000);
  const cuenta = todas.find((c) => c.id === id);
  if (!cuenta) throw new Error("La cuenta no existe");

  const codeStr = String(cuenta.codigo);
  const tieneHijos = todas.some((c) => {
    if (c.id === id) return false;
    const s = String(c.codigo);
    return s.startsWith(codeStr) && s.length > codeStr.length;
  });
  if (tieneHijos) {
    throw new Error("No se puede eliminar: la cuenta tiene subcuentas o auxiliares asociados. Elimine primero los hijos.");
  }

  const movs = await base44.asServiceRole.entities.MovimientoContable.filter(
    { subcuenta: codeStr }, null, 1
  );
  if (movs && movs.length > 0) {
    throw new Error("No se puede eliminar: la cuenta tiene movimientos contables asociados.");
  }

  await base44.asServiceRole.entities.Cuenta.delete(id);
  return { ok: true, codigo: cuenta.codigo, concepto: cuenta.concepto };
}

export async function actualizarCuentaPUC(base44, user, params) {
  const { id, concepto, naturaleza, tipo_estado, es_transaccional } = params;
  if (!id) throw new Error("ID es obligatorio");

  const data = {};
  if (concepto !== undefined && concepto.trim()) data.concepto = concepto.trim();
  if (naturaleza) data.naturaleza = naturaleza;
  if (tipo_estado) data.tipo_estado = tipo_estado;
  if (es_transaccional !== undefined && es_transaccional !== null) {
    data.es_transaccional = !!es_transaccional;
  }
  return await base44.asServiceRole.entities.Cuenta.update(id, data);
}