// Lógica compartida para gestión de productos de crédito (tarjetas) y ciclo de vida
import { ejecutarCreacion } from "./contabilidad.ts";

const BANCOS = [
  { code: "BA", name: "Bancolombia" },
  { code: "BB", name: "BBVA" },
  { code: "BO", name: "Bogotá" },
  { code: "CO", name: "Colpatria" },
  { code: "DA", name: "Davivienda" },
  { code: "IT", name: "Itaú" },
  { code: "NU", name: "Nubank" },
  { code: "OC", name: "Occidente" },
  { code: "PO", name: "Popular" },
  { code: "SE", name: "Serfinanza" },
  { code: "TU", name: "Tuya" },
  { code: "FA", name: "Falabella" }
];

const BANCO_NAMES = Object.fromEntries(BANCOS.map((b) => [b.code, b.name]));

export function getBancoName(code) {
  return BANCO_NAMES[code] || code;
}

export function getCodigoInterno(p) {
  if (p.codigo_interno) return p.codigo_interno;
  return (p.nomenclatura || "").replace(/-\d+$/, "");
}

export function getVersionConsecutivo(p) {
  if (p.version_consecutivo && p.version_consecutivo > 0) return p.version_consecutivo;
  const match = (p.nomenclatura || "").match(/-(\d+)$/);
  return match ? Number(match[1]) : 1;
}

export function buildNomenclatura(codigoInterno, version) {
  if (!codigoInterno) return "";
  return version > 1 ? `${codigoInterno}-${version}` : codigoInterno;
}

// === Creación automática de cuenta contable (PUC) para TDC ===

async function encontrarSubcuentaBanco(base44, bancoName) {
  const todas = await base44.asServiceRole.entities.Cuenta.filter(
    { nivel: "Subcuenta" }, "codigo", 500
  );
  const subcuentas2110 = todas.filter((c) => c.codigo >= 211001 && c.codigo <= 211099);
  const lower = bancoName.toLowerCase();
  return subcuentas2110.find((c) =>
    (c.concepto || "").toLowerCase().includes(lower)
  ) || null;
}

async function crearSubcuentaBanco(base44, bancoName) {
  const todas = await base44.asServiceRole.entities.Cuenta.filter(
    { nivel: "Subcuenta" }, "codigo", 500
  );
  const subcuentas2110 = todas.filter((c) => c.codigo >= 211001 && c.codigo <= 211099);
  const maxCode = subcuentas2110.reduce((max, c) => Math.max(max, c.codigo), 211000);
  const newCode = maxCode + 1;

  return await base44.asServiceRole.entities.Cuenta.create({
    codigo: newCode,
    nivel: "Subcuenta",
    clase: 2,
    clase_nombre: "Pasivo",
    grupo: 21,
    cuenta: 2110,
    subcuenta: newCode,
    concepto: bancoName,
    naturaleza: "Crédito",
    tipo_estado: "Balance",
    es_transaccional: false
  });
}

export async function crearCuentaPUCTarjeta(base44, bancoCode, nombreTarjeta) {
  const bancoName = getBancoName(bancoCode);
  let subcuenta = await encontrarSubcuentaBanco(base44, bancoName);
  if (!subcuenta) {
    subcuenta = await crearSubcuentaBanco(base44, bancoName);
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
    clase: 2,
    clase_nombre: "Pasivo",
    grupo: 21,
    cuenta: 2110,
    subcuenta: subcuenta.codigo,
    auxiliar: auxNum,
    concepto: nombreTarjeta,
    naturaleza: "Crédito",
    tipo_estado: "Balance",
    es_transaccional: true
  });

  return String(newCode);
}

// === Generación de nomenclatura / código interno ===

export async function generarCodigoInterno(base44, bancoCode, tipo) {
  const productos = await base44.asServiceRole.entities.ProductoCredito.filter(
    { banco: bancoCode, tipo }
  );
  let maxNum = 0;
  productos.forEach((p) => {
    const base = getCodigoInterno(p);
    const match = base.match(/(\d+)$/);
    if (match) maxNum = Math.max(maxNum, Number(match[1]));
  });
  return `${bancoCode}${String(maxNum + 1).padStart(3, "0")}`;
}

// === Creación de producto de crédito con PUC automático ===

export async function crearProductoCredito(base44, user, params) {
  const { tipo, banco, titular_id, cupo, fecha_corte, digitos_ref, nombre, numero_completo, franquicia, categoria, corte_modo, corte_semana, corte_dia_semana } = params;

  if (!banco || !titular_id) throw new Error("Banco y titular son obligatorios");
  if (tipo === "TDC") {
    if (!numero_completo || String(numero_completo).replace(/\D/g, "").length < 4) {
      throw new Error("El número completo de la tarjeta es obligatorio para TDC");
    }
  }

  const nombreFinal = nombre || `${tipo} - ${String(digitos_ref || "").replace(/\D/g, "").slice(-4)}`;
  const cupoNum = Number(cupo) || 0;
  let corte = Number(fecha_corte) || 1;
  if (corte_modo === "dia_semana") {
    const hoy = new Date();
    const year = hoy.getFullYear();
    const month = hoy.getMonth();
    const ordinal = Number(corte_semana) || 1;
    const dow = Number(corte_dia_semana) || 5;
    const primer = new Date(year, month, 1);
    const primerDow = primer.getDay() === 0 ? 7 : primer.getDay();
    const offset = (dow - primerDow + 7) % 7;
    const calc = 1 + offset + (ordinal - 1) * 7;
    const last = new Date(year, month + 1, 0).getDate();
    if (calc <= last) corte = calc;
  }

  const codigoInterno = await generarCodigoInterno(base44, banco, tipo);
  const now = new Date().toISOString();
  const data = {
    nomenclatura: codigoInterno,
    codigo_interno: codigoInterno,
    nombre: nombreFinal,
    numero_completo: numero_completo ? String(numero_completo) : "",
    tipo,
    banco,
    titular_id,
    cupo: cupoNum,
    saldo: 0,
    fecha_corte: corte,
    franquicia: tipo === "TDC" ? (franquicia || "") : "",
    categoria: tipo === "TDC" ? (categoria || "") : "",
    corte_modo: corte_modo || "dia_fijo",
    corte_semana: corte_modo === "dia_semana" ? (Number(corte_semana) || 1) : 0,
    corte_dia_semana: corte_modo === "dia_semana" ? (Number(corte_dia_semana) || 5) : 0,
    estado: "activo",
    version_consecutivo: 1,
    operacion: "creacion",
    operacion_fecha: now,
    operacion_detalle: "Creación inicial"
  };

  if (tipo === "TDC") {
    const pucCode = await crearCuentaPUCTarjeta(base44, banco, nombreFinal);
    data.subcuenta_puc = pucCode;
  }

  const producto = await base44.asServiceRole.entities.ProductoCredito.create(data);
  return { producto, puc_creado: tipo === "TDC" };
}

// === Reemplazo de tarjeta ===

export async function ejecutarReemplazo(base44, user, tarjetaId, nuevosDigitos, cambios) {
  const tarjeta = await base44.asServiceRole.entities.ProductoCredito.get(tarjetaId);
  if (!tarjeta) throw new Error("Tarjeta no encontrada");
  if (tarjeta.tipo !== "TDC") throw new Error("El reemplazo solo aplica a tarjetas de crédito");

  const digitos = String(nuevosDigitos || "").replace(/\D/g, "").slice(-4);
  if (!digitos) throw new Error("Debe ingresar los 4 últimos dígitos del nuevo plástico");

  const nuevoNombre = `TDC - ${digitos}`;
  const codigoInterno = getCodigoInterno(tarjeta);
  const nuevaVersion = getVersionConsecutivo(tarjeta) + 1;
  const nuevaNomenclatura = buildNomenclatura(codigoInterno, nuevaVersion);
  const now = new Date().toISOString();

  // Categorías editables en el reemplazo (opcionales); por defecto hereda la versión anterior.
  const c = cambios || {};
  const nuevoTipo = c.tipo || tarjeta.tipo;
  const nuevoBanco = c.banco || tarjeta.banco;
  const nuevoCupo = c.cupo !== undefined ? Number(c.cupo) : tarjeta.cupo;
  const corteModo = c.corte_modo || tarjeta.corte_modo || "dia_fijo";
  let nuevoCorte = c.fecha_corte !== undefined ? Number(c.fecha_corte) : tarjeta.fecha_corte;
  if (corteModo === "dia_semana") {
    const hoy = new Date();
    const year = hoy.getFullYear();
    const month = hoy.getMonth();
    const ordinal = c.corte_semana !== undefined ? Number(c.corte_semana) : (tarjeta.corte_semana || 1);
    const dow = c.corte_dia_semana !== undefined ? Number(c.corte_dia_semana) : (tarjeta.corte_dia_semana || 5);
    const primer = new Date(year, month, 1);
    const primerDow = primer.getDay() === 0 ? 7 : primer.getDay();
    const offset = (dow - primerDow + 7) % 7;
    const calc = 1 + offset + (ordinal - 1) * 7;
    const last = new Date(year, month + 1, 0).getDate();
    if (calc <= last) nuevoCorte = calc;
  }
  const numeroCompleto = c.numero_completo !== undefined ? String(c.numero_completo) : (tarjeta.numero_completo || "");
  const nuevaFranquicia = c.franquicia !== undefined ? c.franquicia : tarjeta.franquicia;
  const nuevaCategoria = c.categoria !== undefined ? c.categoria : tarjeta.categoria;
  const nuevaCorteSemana = corteModo === "dia_semana" ? (c.corte_semana !== undefined ? Number(c.corte_semana) : (tarjeta.corte_semana || 1)) : 0;
  const nuevaCorteDiaSemana = corteModo === "dia_semana" ? (c.corte_dia_semana !== undefined ? Number(c.corte_dia_semana) : (tarjeta.corte_dia_semana || 5)) : 0;

  // Actualizar el nombre de la cuenta contable (mismo código, solo cambia el concepto)
  if (tarjeta.subcuenta_puc) {
    const codigoPuc = Number(tarjeta.subcuenta_puc);
    const cuentas = await base44.asServiceRole.entities.Cuenta.filter({ codigo: codigoPuc });
    if (cuentas.length > 0) {
      await base44.asServiceRole.entities.Cuenta.update(cuentas[0].id, { concepto: nuevoNombre });
    }
  }

  // Inhabilitar la tarjeta anterior
  await base44.asServiceRole.entities.ProductoCredito.update(tarjetaId, {
    estado: "inactivo",
    operacion_detalle: `Reemplazada por ${nuevaNomenclatura} el ${now.substring(0, 10)}`
  });

  // Crear la nueva versión
  const padreId = tarjeta.version_padre_id || tarjeta.id;
  const nueva = await base44.asServiceRole.entities.ProductoCredito.create({
    nomenclatura: nuevaNomenclatura,
    codigo_interno: codigoInterno,
    nombre: nuevoNombre,
    numero_completo: numeroCompleto,
    tipo: nuevoTipo,
    banco: nuevoBanco,
    subcuenta_puc: tarjeta.subcuenta_puc,
    titular_id: tarjeta.titular_id,
    cupo: nuevoCupo,
    saldo: tarjeta.saldo,
    fecha_corte: nuevoCorte,
    franquicia: nuevoTipo === "TDC" ? (nuevaFranquicia || "") : "",
    categoria: nuevoTipo === "TDC" ? (nuevaCategoria || "") : "",
    corte_modo: corteModo,
    corte_semana: nuevaCorteSemana,
    corte_dia_semana: nuevaCorteDiaSemana,
    estado: "activo",
    version_consecutivo: nuevaVersion,
    version_padre_id: padreId,
    version_anterior_id: tarjetaId,
    operacion: "reemplazo",
    operacion_fecha: now,
    operacion_detalle: `Reemplazo de plástico. Anterior: ${tarjeta.nombre} (${tarjeta.nomenclatura})`
  });

  return { tarjeta_anterior: tarjeta, tarjeta_nueva: nueva };
}

// === Unificación de tarjetas ===

export async function ejecutarUnificacion(base44, user, tarjetaIds, permanenteId) {
  if (!tarjetaIds || tarjetaIds.length < 2) throw new Error("Seleccione al menos 2 tarjetas");
  if (!permanenteId || !tarjetaIds.includes(permanenteId)) {
    throw new Error("La tarjeta permanente debe estar entre las seleccionadas");
  }

  const tarjetas = [];
  for (const id of tarjetaIds) {
    tarjetas.push(await base44.asServiceRole.entities.ProductoCredito.get(id));
  }

  // Validar mismo banco y mismo titular
  const bancoRef = tarjetas[0].banco;
  const titularRef = tarjetas[0].titular_id;
  for (const t of tarjetas) {
    if (t.banco !== bancoRef) throw new Error("Todas las tarjetas deben pertenecer al mismo banco");
    if (t.titular_id !== titularRef) throw new Error("Todas las tarjetas deben tener el mismo titular");
  }

  const permanente = tarjetas.find((t) => t.id === permanenteId);
  const aInhabilitar = tarjetas.filter((t) => t.id !== permanenteId);

  // Sumar cupos
  const cupoTotal = tarjetas.reduce((s, t) => s + (t.cupo || 0), 0);

  const now = new Date().toISOString();
  const fechaHoy = now.substring(0, 10);
  const warnings = [];

  // Transferir saldos de las tarjetas a inhabilitar hacia la permanente
  for (const t of aInhabilitar) {
    const saldoT = Number(t.saldo) || 0;
    if (Math.abs(saldoT) > 0.01) {
      const monto = Math.abs(saldoT);
      // Crear comprobante de traslado contable
      // Si saldo es negativo (pasivo): debitar tarjeta origen (reduce pasivo), acreditar permanente (aumenta pasivo)
      const movimientos = [
        {
          subcuenta: t.subcuenta_puc,
          debito: monto,
          credito: 0,
          descripcion: `Traslado por unificación - origen ${t.nomenclatura}`,
          producto_credito_id: t.id
        },
        {
          subcuenta: permanente.subcuenta_puc,
          debito: 0,
          credito: monto,
          descripcion: `Traslado por unificación - destino ${permanente.nomenclatura}`,
          producto_credito_id: permanente.id
        }
      ];

      const result = await ejecutarCreacion(base44, user, {
        tipo: "diario",
        fecha: fechaHoy,
        descripcion: `Unificación tarjetas: traslado saldo de ${t.nombre} a ${permanente.nombre}`,
        movimientos,
        modo: "balance"
      });
      warnings.push(...(result.warnings || []));
    }

    // Inhabilitar tarjeta
    await base44.asServiceRole.entities.ProductoCredito.update(t.id, {
      estado: "inactivo",
      operacion_detalle: `Unificada en ${permanente.nomenclatura} el ${fechaHoy}`
    });
  }

  // Crear nueva versión de la permanente con cupo total
  const codigoInterno = getCodigoInterno(permanente);
  const nuevaVersion = getVersionConsecutivo(permanente) + 1;
  const nuevaNomenclatura = buildNomenclatura(codigoInterno, nuevaVersion);

  await base44.asServiceRole.entities.ProductoCredito.update(permanente.id, {
    estado: "inactivo",
    operacion_detalle: `Unificada en nueva versión ${nuevaNomenclatura} el ${fechaHoy}`
  });

  const padreId = permanente.version_padre_id || permanente.id;
  const nueva = await base44.asServiceRole.entities.ProductoCredito.create({
    nomenclatura: nuevaNomenclatura,
    codigo_interno: codigoInterno,
    nombre: permanente.nombre,
    tipo: permanente.tipo,
    banco: permanente.banco,
    subcuenta_puc: permanente.subcuenta_puc,
    titular_id: permanente.titular_id,
    cupo: cupoTotal,
    saldo: permanente.saldo,
    fecha_corte: permanente.fecha_corte,
    estado: "activo",
    version_consecutivo: nuevaVersion,
    version_padre_id: padreId,
    version_anterior_id: permanente.id,
    operacion: "unificacion",
    operacion_fecha: now,
    operacion_detalle: `Unificación de ${tarjetas.length} tarjetas. Cupo total: ${cupoTotal}`
  });

  return { tarjeta_activa: nueva, warnings, tarjetas_inhabilitadas: aInhabilitar.length };
}

// === Aumento de cupo ===

export async function ejecutarAumentoCupo(base44, user, tarjetaId, nuevoCupo) {
  const tarjeta = await base44.asServiceRole.entities.ProductoCredito.get(tarjetaId);
  if (!tarjeta) throw new Error("Tarjeta no encontrada");

  const cupo = Number(nuevoCupo) || 0;
  if (cupo <= 0) throw new Error("El nuevo cupo debe ser mayor a 0");
  if (cupo <= (tarjeta.cupo || 0)) throw new Error("El nuevo cupo debe ser mayor al cupo actual");

  const codigoInterno = getCodigoInterno(tarjeta);
  const nuevaVersion = getVersionConsecutivo(tarjeta) + 1;
  const nuevaNomenclatura = buildNomenclatura(codigoInterno, nuevaVersion);
  const now = new Date().toISOString();

  // Inhabilitar versión anterior
  await base44.asServiceRole.entities.ProductoCredito.update(tarjetaId, {
    estado: "inactivo",
    operacion_detalle: `Aumento de cupo → versión ${nuevaNomenclatura} el ${now.substring(0, 10)}`
  });

  const padreId = tarjeta.version_padre_id || tarjeta.id;
  const nueva = await base44.asServiceRole.entities.ProductoCredito.create({
    nomenclatura: nuevaNomenclatura,
    codigo_interno: codigoInterno,
    nombre: tarjeta.nombre,
    tipo: tarjeta.tipo,
    banco: tarjeta.banco,
    subcuenta_puc: tarjeta.subcuenta_puc,
    titular_id: tarjeta.titular_id,
    cupo: cupo,
    saldo: tarjeta.saldo,
    fecha_corte: tarjeta.fecha_corte,
    estado: "activo",
    version_consecutivo: nuevaVersion,
    version_padre_id: padreId,
    version_anterior_id: tarjetaId,
    operacion: "aumento_cupo",
    operacion_fecha: now,
    operacion_detalle: `Aumento de cupo de ${tarjeta.cupo} a ${cupo}`
  });

  return { tarjeta_anterior: tarjeta, tarjeta_nueva: nueva };
}