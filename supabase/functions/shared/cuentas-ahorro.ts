// Lógica compartida para gestión de cuentas de ahorro (CDA) y generación de PUC automático
import { getBancoName } from "./tarjetas.ts";

// === Creación automática de cuenta contable (PUC) para CDA bajo 1110 - Bancos ===

async function encontrarSubcuentaBanco1110(base44, bancoName) {
  const todas = await base44.asServiceRole.entities.Cuenta.filter(
    { nivel: "Subcuenta" }, "codigo", 500
  );
  const subcuentas1110 = todas.filter((c) => c.codigo >= 111001 && c.codigo <= 111099);
  const lower = bancoName.toLowerCase();
  return subcuentas1110.find((c) =>
    (c.concepto || "").toLowerCase().includes(lower)
  ) || null;
}

async function crearSubcuentaBanco1110(base44, bancoName) {
  const todas = await base44.asServiceRole.entities.Cuenta.filter(
    { nivel: "Subcuenta" }, "codigo", 500
  );
  const subcuentas1110 = todas.filter((c) => c.codigo >= 111001 && c.codigo <= 111099);
  const maxCode = subcuentas1110.reduce((max, c) => Math.max(max, c.codigo), 111000);
  const newCode = maxCode + 1;

  return await base44.asServiceRole.entities.Cuenta.create({
    codigo: newCode,
    nivel: "Subcuenta",
    clase: 1,
    clase_nombre: "Activo",
    grupo: 11,
    cuenta: 1110,
    subcuenta: newCode,
    concepto: bancoName,
    naturaleza: "Débito",
    tipo_estado: "Balance",
    es_transaccional: false
  });
}

export async function crearCuentaPUCCDA(base44, bancoCode, nombreCuenta) {
  const bancoName = getBancoName(bancoCode);
  let subcuenta = await encontrarSubcuentaBanco1110(base44, bancoName);
  if (!subcuenta) {
    subcuenta = await crearSubcuentaBanco1110(base44, bancoName);
  }

  const todasAux = await base44.asServiceRole.entities.Cuenta.filter(
    { nivel: "Auxiliar" }, "codigo", 500
  );
  const auxiliares = todasAux.filter(
    (c) => c.codigo >= subcuenta.codigo * 100 && c.codigo < (subcuenta.codigo + 1) * 100
  );
  const maxAux = auxiliares.reduce((max, c) => Math.max(max, c.codigo), subcuenta.codigo * 100);
  const newCode = maxAux + 1;
  const auxNum = newCode - subcuenta.codigo * 100;

  await base44.asServiceRole.entities.Cuenta.create({
    codigo: newCode,
    nivel: "Auxiliar",
    clase: 1,
    clase_nombre: "Activo",
    grupo: 11,
    cuenta: 1110,
    subcuenta: subcuenta.codigo,
    auxiliar: auxNum,
    concepto: nombreCuenta,
    naturaleza: "Débito",
    tipo_estado: "Balance",
    es_transaccional: true
  });

  return String(newCode);
}

// === Creación de CDA con PUC automático ===

export async function crearCuentaAhorro(base44, user, params) {
  const { banco, titular_id, numero_completo, nombre, saldo, nota } = params;

  if (!banco || !titular_id) throw new Error("Banco y titular son obligatorios");
  if (!numero_completo || !numero_completo.trim()) throw new Error("El número de cuenta es obligatorio");

  const nombreFinal = nombre || `CDA - ${numero_completo.replace(/\D/g, "").slice(-4)}`;
  const saldoNum = Number(saldo) || 0;

  const pucCode = await crearCuentaPUCCDA(base44, banco, nombreFinal);

  const cuenta = await base44.asServiceRole.entities.CuentaAhorro.create({
    nombre: nombreFinal,
    numero_completo: numero_completo.trim(),
    banco,
    subcuenta_puc: pucCode,
    titular_id,
    saldo: saldoNum,
    estado: "activa",
    movimientos_mes_acumulado: 0,
    nota: nota || ""
  });

  return { cuenta, puc_creado: true };
}