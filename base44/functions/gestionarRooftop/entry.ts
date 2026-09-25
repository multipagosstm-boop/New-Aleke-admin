import { ejecutarCreacion, ValidationError, obtenerConsecutivo } from "../../shared/contabilidad.ts";
import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";

function addMonths(dateStr, months) {
  const d = new Date(dateStr + "T00:00:00");
  d.setMonth(d.getMonth() + months);
  return d.toISOString().substring(0, 10);
}

// Día de pago = día del mes de la fecha de inicio del contrato.
// El cobro es mes anticipado: el primer pago vence el mismo día de inicio.
function diaDesdeFecha(fechaStr) {
  return new Date((fechaStr || "") + "T00:00:00").getDate() || 1;
}

// El primer vencimiento se cuenta a partir de la fecha de inicio del contrato:
// si el día de pago ya pasó en el mes de inicio, el primer vencimiento es del mes siguiente.
function getPrimerVencimiento(fechaInicio, diaPago) {
  const d = Number(diaPago) || 1;
  const inicio = new Date(fechaInicio + "T00:00:00");
  const startDay = inicio.getDate();
  let año = inicio.getFullYear();
  let mes = inicio.getMonth(); // 0-based
  if (d < startDay) {
    mes += 1;
    if (mes > 11) { mes = 0; año += 1; }
  }
  return año + "-" + String(mes + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
}

function getFechaVencimiento(diaPago, periodo) {
  return periodo + "-" + String(diaPago).padStart(2, "0");
}

function calcularDiasMora(fechaPago, fechaVencimiento) {
  const pago = new Date(fechaPago + "T00:00:00");
  const venc = new Date(fechaVencimiento + "T00:00:00");
  const diff = Math.floor((pago - venc) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : 0;
}

// Resuelve el inquilino desde la entidad Inquilino (nuevos contratos) o,
// si no existe, desde Cliente (contratos históricos).
async function resolverInquilino(base44, id) {
  if (!id) return null;
  try { return await base44.asServiceRole.entities.Inquilino.get(id); } catch {}
  try { return await base44.asServiceRole.entities.Cliente.get(id); } catch {}
  return null;
}

// Apto 203: el arriendo se reconoce como pasivo a Teresa (220505), no como ingreso.
function esAptoTeresa(inmueble) {
  return (inmueble?.nombre || "").trim() === "203";
}

async function generarCodigoArriendo(base44) {
  // Usar tipo "arriendo" como clave en Consecutivo (sin año)
  // El Consecutivo de arriendos no lleva año, usar 0 como año fijo
  const token = Date.now().toString(36) + Math.random().toString(36).slice(2);

  const existentes = await base44.asServiceRole.entities.Consecutivo
    .filter({ tipo: "arriendo" });

  if (existentes.length === 0) {
    try {
      await base44.asServiceRole.entities.Consecutivo.create({
        tipo: "arriendo", año: 0, ultimo_numero: 1, ultimo_token: token
      });
      return "ARR-001";
    } catch (e) { /* otra llamada lo creó, continuar */ }
  }

  const antes = await base44.asServiceRole.entities.Consecutivo
    .filter({ tipo: "arriendo" });
  const valorActual = antes[0].ultimo_numero;
  await base44.asServiceRole.entities.Consecutivo.update(antes[0].id, {
    ultimo_numero: valorActual + 1,
    ultimo_token: token
  });
  const despues = await base44.asServiceRole.entities.Consecutivo
    .filter({ tipo: "arriendo" });
  if (despues[0].ultimo_token !== token) {
    await new Promise(r => setTimeout(r, 50));
    return generarCodigoArriendo(base44);
  }
  return "ARR-" + String(valorActual + 1).padStart(3, "0");
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const action = body.action;

    switch (action) {
      case "crearContrato": return await crearContrato(base44, user, body);
      case "registrarPago": return await registrarPago(base44, user, body);
      case "terminarContrato": return await terminarContrato(base44, user, body);
      case "renovarContrato": return await renovarContrato(base44, user, body);
      case "actualizarEstadoContratos": return await actualizarEstadoContratos(base44);
      case "abonarDeposito": return await abonarDeposito(base44, user, body);
      default: return Response.json({ error: "Acción no válida: " + action }, { status: 400 });
    }
  } catch (error) {
    if (error instanceof ValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
}

async function crearContrato(base44, user, body) {
  const { inmueble_id, inquilino_id, fecha_inicio, valor_arriendo, valor_deposito, cda_pago_id, fecha_deposito, notas, duracion_meses, tipo_contrato } = body;

  const inmueblePrev = await base44.asServiceRole.entities.Inmueble.get(inmueble_id);
  if (inmueblePrev.estado === "ocupado") {
    throw new ValidationError(`El inmueble "${inmueblePrev.nombre}" ya está ocupado. No se puede crear un segundo contrato sobre un inmueble ocupado.`);
  }

  // No crear un contrato nuevo si ya existe uno vigente o por vencer para el inmueble.
  const contratosActivos = await base44.asServiceRole.entities.ContratoArriendo.filter({
    inmueble_id, estado: { $in: ["vigente", "por_vencer"] }
  });
  if (contratosActivos.length > 0) {
    throw new ValidationError(`El inmueble "${inmueblePrev.nombre}" tiene un contrato vigente (${contratosActivos[0].codigo}). Termínelo o regréselo antes de crear uno nuevo.`);
  }

  const codigo = await generarCodigoArriendo(base44);
  const meses = Number(duracion_meses) || 6;
  const fecha_fin = addMonths(fecha_inicio, meses);

  const contrato = await base44.asServiceRole.entities.ContratoArriendo.create({
    codigo, inmueble_id, inquilino_id, fecha_inicio, fecha_fin,
    duracion_meses: meses, tipo_contrato: tipo_contrato || null,
    valor_arriendo, valor_deposito,
    estado: "vigente", deposito_pagado: false, alertas_enviadas: 0,
    notas: notas || ""
  });

  const inmueble = await base44.asServiceRole.entities.Inmueble.get(inmueble_id);
  await base44.asServiceRole.entities.Inmueble.update(inmueble_id, {
    estado: "ocupado", inquilino_id
  });

  const diaPago = diaDesdeFecha(fecha_inicio);
  const fecha_vencimiento = getPrimerVencimiento(fecha_inicio, diaPago);
  const periodo = fecha_vencimiento.substring(0, 7);
  await base44.asServiceRole.entities.PagoArriendo.create({
    inmueble_id, contrato_id: contrato.id, inquilino_id,
    periodo, fecha_vencimiento,
    valor_esperado: valor_arriendo,
    valor_pagado: 0, dias_mora: 0, estado: "pendiente"
  });

  let comprobante_deposito = null;
  if (cda_pago_id && valor_deposito > 0) {
    const cda = await base44.asServiceRole.entities.CuentaAhorro.get(cda_pago_id);
    const inquilino = await resolverInquilino(base44, inquilino_id);
    const result = await ejecutarCreacion(base44, user, {
      tipo: "diario",
      fecha: fecha_deposito || fecha_inicio,
      descripcion: "Depósito arriendo - " + inmueble.nombre,
      modo: "balance",
      movimientos: [
        {
          subcuenta: cda.subcuenta_puc,
          debito: valor_deposito, credito: 0,
          descripcion: "Ingreso depósito arriendo",
          cuenta_ahorro_id: cda_pago_id,
          modelo_negocio: "alekerooftop"
        },
        {
          subcuenta: "220513",
          debito: 0, credito: valor_deposito,
          descripcion: "Depósito en garantía - " + (inquilino?.nombre || ""),
          cliente_id: inquilino_id,
          modelo_negocio: "alekerooftop"
        }
      ]
    });
    comprobante_deposito = result.comprobante;
    await base44.asServiceRole.entities.ContratoArriendo.update(contrato.id, {
      deposito_pagado: true,
      comprobante_deposito_id: result.comprobante.id
    });
  }

  return Response.json({ contrato, pagos_generados: 1, comprobante_deposito });
}

async function registrarPago(base44, user, body) {
  const { pago_arriendo_id, valor_pagado, fecha_pago, cuenta_ingreso, notas } = body;

  const pago = await base44.asServiceRole.entities.PagoArriendo.get(pago_arriendo_id);
  if (pago.estado === "pagado") {
    throw new ValidationError(
      "Este pago ya fue registrado como pagado. " +
      "Si necesita corregirlo, anule el comprobante " + pago.comprobante_id
    );
  }
  const contrato = await base44.asServiceRole.entities.ContratoArriendo.get(pago.contrato_id);
  const inmueble = await base44.asServiceRole.entities.Inmueble.get(pago.inmueble_id);
  const inquilino = await resolverInquilino(base44, pago.inquilino_id);

  const dias_mora = calcularDiasMora(fecha_pago, pago.fecha_vencimiento);

  let estado;
  if (valor_pagado >= pago.valor_esperado) estado = "pagado";
  else if (valor_pagado > 0) estado = "parcial";
  else estado = "pendiente";

  const teresa = esAptoTeresa(inmueble);
  const subcuentaIngreso = teresa ? "220505" : "410504";
  const descripcionIngreso = teresa
    ? "Arriendo Apto 203 (Teresa) - " + inmueble.nombre
    : "Ingreso arriendo - " + inmueble.nombre;

  const result = await ejecutarCreacion(base44, user, {
    tipo: "diario",
    fecha: fecha_pago,
    descripcion: "Arriendo " + pago.periodo + " - " + inmueble.nombre,
    modo: "resultado",
    movimientos: [
      {
        subcuenta: cuenta_ingreso.subcuenta,
        debito: valor_pagado, credito: 0,
        descripcion: "Cobro arriendo " + pago.periodo,
        cuenta_ahorro_id: cuenta_ingreso.cuenta_ahorro_id || "",
        producto_credito_id: cuenta_ingreso.producto_credito_id || "",
        tipo_movimiento_tdc: cuenta_ingreso.producto_credito_id ? "abono" : null,
        modelo_negocio: "alekerooftop"
      },
      {
        subcuenta: subcuentaIngreso,
        debito: 0, credito: valor_pagado,
        descripcion: descripcionIngreso,
        tercero: inquilino?.nombre_completo || inquilino?.nombre || "",
        cliente_id: pago.inquilino_id,
        modelo_negocio: "alekerooftop"
      }
    ]
  });

  await base44.asServiceRole.entities.PagoArriendo.update(pago_arriendo_id, {
    valor_pagado, fecha_pago_real: fecha_pago,
    dias_mora, estado,
    saldo_restante: Math.max(0, pago.valor_esperado - valor_pagado),
    comprobante_id: result.comprobante.id,
    notas: notas || pago.notas || ""
  });

  let siguiente_periodo_creado = null;
  if (estado === "pagado") {
    const [año, mes] = pago.periodo.split("-").map(Number);
    const siguienteMes = mes === 12 ? 1 : mes + 1;
    const siguienteAño = mes === 12 ? año + 1 : año;
    const siguientePeriodo = siguienteAño + "-" + String(siguienteMes).padStart(2, "0");

    const existente = await base44.asServiceRole.entities.PagoArriendo.filter({
      contrato_id: pago.contrato_id,
      periodo: siguientePeriodo
    });
    if (existente.length === 0) {
      const siguienteVencimiento = getFechaVencimiento(diaDesdeFecha(contrato.fecha_inicio), siguientePeriodo);
      siguiente_periodo_creado = await base44.asServiceRole.entities.PagoArriendo.create({
        inmueble_id: pago.inmueble_id,
        contrato_id: pago.contrato_id,
        inquilino_id: pago.inquilino_id,
        periodo: siguientePeriodo,
        fecha_vencimiento: siguienteVencimiento,
        valor_esperado: contrato.valor_arriendo,
        valor_pagado: 0, dias_mora: 0, estado: "pendiente"
      });
    }
  }

  return Response.json({
    pago_actualizado: { ...pago, valor_pagado, dias_mora, estado },
    comprobante: result.comprobante,
    siguiente_periodo_creado
  });
}

async function terminarContrato(base44, user, body) {
  const { contrato_id, devolver_deposito, cda_devolucion_id, fecha_terminacion, motivo } = body;

  const contrato = await base44.asServiceRole.entities.ContratoArriendo.get(contrato_id);
  const inmueble = await base44.asServiceRole.entities.Inmueble.get(contrato.inmueble_id);

  let comprobante = null;
  if (devolver_deposito && contrato.valor_deposito > 0 && cda_devolucion_id) {
    const cda = await base44.asServiceRole.entities.CuentaAhorro.get(cda_devolucion_id);
    const result = await ejecutarCreacion(base44, user, {
      tipo: "diario",
      fecha: fecha_terminacion,
      descripcion: "Devolución depósito - " + inmueble.nombre,
      modo: "balance",
      movimientos: [
        {
          subcuenta: "220513",
          debito: contrato.valor_deposito, credito: 0,
          descripcion: "Devolución depósito en garantía",
          modelo_negocio: "alekerooftop"
        },
        {
          subcuenta: cda.subcuenta_puc,
          debito: 0, credito: contrato.valor_deposito,
          descripcion: "Salida devolución depósito",
          cuenta_ahorro_id: cda_devolucion_id,
          modelo_negocio: "alekerooftop"
        }
      ]
    });
    comprobante = result.comprobante;
  }

  await base44.asServiceRole.entities.ContratoArriendo.update(contrato_id, {
    estado: "terminado",
    notas: (motivo ? motivo + "\n" : "") + (contrato.notas || "")
  });

  await base44.asServiceRole.entities.Inmueble.update(contrato.inmueble_id, {
    estado: "disponible", inquilino_id: null
  });

  await base44.asServiceRole.entities.PagoArriendo.updateMany(
    { contrato_id, estado: "pendiente" },
    { $set: { estado: "condonado" } }
  );

  return Response.json({
    contrato_terminado: contrato_id,
    deposito_devuelto: !!comprobante,
    comprobante
  });
}

async function renovarContrato(base44, user, body) {
  const { contrato_id, nuevo_valor_arriendo, nueva_fecha_inicio } = body;

  const contratoAnt = await base44.asServiceRole.entities.ContratoArriendo.get(contrato_id);

  await base44.asServiceRole.entities.ContratoArriendo.update(contrato_id, {
    estado: "renovado"
  });

  const codigo = await generarCodigoArriendo(base44);
  const fecha_fin = addMonths(nueva_fecha_inicio, 6);
  const valor_deposito = nuevo_valor_arriendo / 2;

  const nuevoContrato = await base44.asServiceRole.entities.ContratoArriendo.create({
    codigo,
    inmueble_id: contratoAnt.inmueble_id,
    inquilino_id: contratoAnt.inquilino_id,
    fecha_inicio: nueva_fecha_inicio, fecha_fin,
    valor_arriendo: nuevo_valor_arriendo, valor_deposito,
    estado: "vigente", deposito_pagado: false, alertas_enviadas: 0
  });

  const fecha_vencimiento = getPrimerVencimiento(nueva_fecha_inicio, diaDesdeFecha(nueva_fecha_inicio));
  const periodo = fecha_vencimiento.substring(0, 7);

  await base44.asServiceRole.entities.PagoArriendo.create({
    inmueble_id: contratoAnt.inmueble_id,
    contrato_id: nuevoContrato.id,
    inquilino_id: contratoAnt.inquilino_id,
    periodo, fecha_vencimiento,
    valor_esperado: nuevo_valor_arriendo,
    valor_pagado: 0, dias_mora: 0, estado: "pendiente"
  });

  return Response.json({
    contrato_anterior: contrato_id,
    contrato_nuevo: nuevoContrato
  });
}

async function abonarDeposito(base44, user, body) {
  const { contrato_id, valor, cuenta_ingreso, fecha, notas } = body;
  if (!contrato_id || !cuenta_ingreso?.subcuenta || !(Number(valor) > 0)) {
    throw new ValidationError("Contrato, valor y cuenta de ingreso son obligatorios para el abono al depósito.");
  }
  const contrato = await base44.asServiceRole.entities.ContratoArriendo.get(contrato_id);
  const inmueble = await base44.asServiceRole.entities.Inmueble.get(contrato.inmueble_id);
  const inquilino = await resolverInquilino(base44, contrato.inquilino_id);
  const valorNum = Number(valor);
  const result = await ejecutarCreacion(base44, user, {
    tipo: "diario",
    fecha: fecha || new Date().toISOString().substring(0, 10),
    descripcion: "Abono depósito - " + inmueble.nombre,
    modo: "balance",
    movimientos: [
      {
        subcuenta: cuenta_ingreso.subcuenta,
        debito: valorNum, credito: 0,
        descripcion: "Abono depósito en garantía",
        cuenta_ahorro_id: cuenta_ingreso.cuenta_ahorro_id || "",
        producto_credito_id: cuenta_ingreso.producto_credito_id || "",
        tipo_movimiento_tdc: cuenta_ingreso.producto_credito_id ? "abono" : null,
        modelo_negocio: "alekerooftop"
      },
      {
        subcuenta: "220513",
        debito: 0, credito: valorNum,
        descripcion: "Depósito en garantía - " + (inquilino?.nombre_completo || inquilino?.nombre || ""),
        tercero: inquilino?.nombre_completo || inquilino?.nombre || "",
        cliente_id: contrato.inquilino_id,
        modelo_negocio: "alekerooftop"
      }
    ]
  });
  return Response.json({ comprobante: result.comprobante });
}

async function actualizarEstadoContratos(base44) {
  const hoy = new Date().toISOString().substring(0, 10);
  const hoyDate = new Date(hoy + "T00:00:00");

  const contratos = await base44.asServiceRole.entities.ContratoArriendo.filter({ estado: "vigente" });
  let contratos_actualizados = 0;
  for (const c of contratos) {
    const fechaFin = new Date(c.fecha_fin + "T00:00:00");
    const diffDays = Math.floor((fechaFin - hoyDate) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) {
      await base44.asServiceRole.entities.ContratoArriendo.update(c.id, { estado: "vencido" });
      contratos_actualizados++;
    } else if (diffDays <= 30) {
      await base44.asServiceRole.entities.ContratoArriendo.update(c.id, { estado: "por_vencer" });
      contratos_actualizados++;
    }
  }

  const pagos = await base44.asServiceRole.entities.PagoArriendo.filter({ estado: "pendiente" });
  let pagos_en_mora = 0;
  for (const p of pagos) {
    const fechaVenc = new Date(p.fecha_vencimiento + "T00:00:00");
    const diffDays = Math.floor((hoyDate - fechaVenc) / (1000 * 60 * 60 * 24));
    if (diffDays > 0) {
      await base44.asServiceRole.entities.PagoArriendo.update(p.id, {
        estado: "en_mora", dias_mora: diffDays
      });
      pagos_en_mora++;
    }
  }

  return Response.json({ contratos_actualizados, pagos_en_mora });
}