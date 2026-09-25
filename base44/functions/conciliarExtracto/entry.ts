import { ejecutarCreacion, ejecutarAnulacion, ValidationError } from "../../shared/contabilidad.ts";
import {
  getFechaCorteAnterior,
  getMovimientosPeriodo,
  autoConciliarLineas,
  persistirConciliacion,
  recalcularSaldoSistema
} from "../../shared/conciliacion.ts";
import { subcuentaParaCargo } from "../../shared/gastos-financieros.ts";
import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";

function formatCOP(val) {
  return "$" + (val || 0).toLocaleString("es-CO");
}

async function crearMovimientoDesdeLinea(base44, user, linea, extracto, producto, contrapartidaSubcuenta, descAdicional) {
  if (linea.destino_cargo === "no_registrar") {
    throw new ValidationError("Este cargo fue marcado como 'No registrar' al cargar el extracto. No se puede crear un asiento para él.");
  }
  const descExtra = descAdicional ? " — " + descAdicional : "";
  const esCargo = linea.naturaleza === "cargo";

  // Contrapartida: la que elija el usuario (efectivo, CDA, gasto, ingreso, pendiente 139006…).
  // Si no llega (ej. anular_y_recrear), conservar el default histórico: gasto para cargos.
  let subcuentaContra = String(contrapartidaSubcuenta || "").trim();
  if (!subcuentaContra) {
    if (esCargo) {
      subcuentaContra = linea.tipo === "financiero" ? (linea.subcuenta_gasto || subcuentaParaCargo(linea.descripcion)) : "510502";
    } else {
      throw new ValidationError("Debe indicar la cuenta contrapartida para crear el movimiento de abono");
    }
  }

  // Si la contrapartida corresponde a una CDA, vincularla para actualizar su saldo.
  let cdaId = "";
  const cdasMatch = await base44.asServiceRole.entities.CuentaAhorro.filter({ subcuenta_puc: subcuentaContra, estado: "activa" });
  if (cdasMatch.length > 0) cdaId = cdasMatch[0].id;

  const movimientos = [
    {
      subcuenta: producto.subcuenta_puc,
      debito: esCargo ? 0 : linea.valor,
      credito: esCargo ? linea.valor : 0,
      descripcion: (esCargo ? "" : "Abono - ") + linea.descripcion + " [Ajuste conciliación]" + descExtra,
      producto_credito_id: producto.id,
      tipo_movimiento_tdc: esCargo ? linea.tipo : "abono",
      periodo_extracto: extracto.periodo
    },
    {
      subcuenta: subcuentaContra,
      debito: esCargo ? linea.valor : 0,
      credito: esCargo ? 0 : linea.valor,
      descripcion: linea.descripcion + descExtra,
      tercero: producto.nombre,
      cuenta_ahorro_id: cdaId
    }
  ];

  const result = await ejecutarCreacion(base44, user, {
    tipo: "diario",
    fecha: linea.fecha,
    descripcion: `Ajuste conciliación - ${extracto.periodo} - ${linea.descripcion}`,
    modo: "resultado",
    confirmar_sobregiro: true,
    movimientos
  });

  const movsCreados = await base44.asServiceRole.entities.MovimientoContable.filter({
    comprobante_id: result.comprobante.id
  });
  const movTDC = movsCreados.find((m) => m.producto_credito_id) || movsCreados[0];
  return { comprobante: result.comprobante, movimiento: movTDC || null };
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    switch (body.action) {
      case "iniciarConciliacion": return await iniciarConciliacion(base44, user, body);
      case "compararMovimientos": return await compararMovimientos(base44, user, body);
      case "crearMovimientoFaltante": return await crearMovimientoFaltante(base44, user, body);
      case "ajustarMovimientoDiferente": return await ajustarMovimientoDiferente(base44, user, body);
      case "ajustarAlPeso": return await ajustarAlPeso(base44, user, body);
      case "marcarSobrante": return await marcarSobrante(base44, user, body);
      case "modificarSobrante": return await modificarSobrante(base44, user, body);
      case "cerrarConciliacion": return await cerrarConciliacion(base44, user, body);
      case "eliminarConciliacion": return await eliminarConciliacion(base44, user, body);
      default: return Response.json({ error: "Acción no válida: " + body.action }, { status: 400 });
    }
  } catch (error) {
    if (error instanceof ValidationError) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ error: error.message }, { status: 500 });
  }
}

async function iniciarConciliacion(base44, user, body) {
  const { extracto_id } = body;
  const extracto = await base44.asServiceRole.entities.ExtractoProducto.get(extracto_id);
  const movs = await getMovimientosPeriodo(base44, extracto);
  const sumaCreditos = movs.reduce((s, m) => s + (m.credito || 0), 0);
  const sumaDebitos = movs.reduce((s, m) => s + (m.debito || 0), 0);
  const saldo_sistema = sumaCreditos - sumaDebitos;
  const saldo_anterior = extracto.saldo_anterior || 0;
  const diferencia_saldo = (extracto.saldo_a_pagar || 0) - saldo_anterior - saldo_sistema;
  const lineasBanco = await base44.asServiceRole.entities.LineaExtracto.filter({ extracto_id });
  const fechaCorteAnterior = getFechaCorteAnterior(extracto);

  // Las conciliaciones cerradas son irreversibles y de solo lectura: al abrirlas
  // para revisar el detalle NO se debe sobrescribir el estado ni los saldos persistidos.
  const esCerrado = extracto.estado_conciliacion === "cerrado";
  if (!esCerrado) {
    await base44.asServiceRole.entities.ExtractoProducto.update(extracto_id, {
      saldo_sistema, diferencia_saldo,
      estado_conciliacion: "en_proceso",
      total_lineas_banco: lineasBanco.length,
      total_lineas_sistema: movs.length
    });
  }

  const estadoFinal = esCerrado ? "cerrado" : "en_proceso";
  const saldoSistemaFinal = esCerrado ? (extracto.saldo_sistema || 0) : saldo_sistema;
  const diferenciaFinal = esCerrado ? (extracto.diferencia_saldo || 0) : diferencia_saldo;

  return Response.json({
    extracto: { ...extracto, saldo_sistema: saldoSistemaFinal, diferencia_saldo: diferenciaFinal, estado_conciliacion: estadoFinal },
    movimientos_sistema: movs,
    lineas_banco: lineasBanco,
    saldo_banco: extracto.saldo_a_pagar,
    saldo_sistema: saldoSistemaFinal, diferencia_saldo: diferenciaFinal, saldo_anterior,
    fecha_inicio_rango: fechaCorteAnterior,
    fecha_fin_rango: extracto.fecha_corte
  });
}

async function compararMovimientos(base44, user, body) {
  const { extracto_id } = body;
  const extracto = await base44.asServiceRole.entities.ExtractoProducto.get(extracto_id);
  const movimientosSistema = await getMovimientosPeriodo(base44, extracto);
  const lineasBanco = await base44.asServiceRole.entities.LineaExtracto.filter({ extracto_id });

  const resultado = autoConciliarLineas(lineasBanco, movimientosSistema);
  const { conciliados, faltantes, sobrantes, diferencias } = resultado;
  await persistirConciliacion(base44, extracto_id, resultado);

  return Response.json({
    conciliados, faltantes, sobrantes, diferencias,
    resumen: {
      total_banco: lineasBanco.length,
      total_sistema: movimientosSistema.length,
      diferencia_saldo: extracto.diferencia_saldo,
      porcentaje_conciliado: lineasBanco.length > 0
        ? Math.round((conciliados.length / lineasBanco.length) * 100) : 0
    }
  });
}

async function crearMovimientoFaltante(base44, user, body) {
  const { linea_banco_id, contrapartida_subcuenta, descripcion_adicional } = body;
  if (!contrapartida_subcuenta) return Response.json({ error: "Debe indicar la cuenta contrapartida (contrapartida_subcuenta)" }, { status: 400 });
  const linea = await base44.asServiceRole.entities.LineaExtracto.get(linea_banco_id);
  const extracto = await base44.asServiceRole.entities.ExtractoProducto.get(linea.extracto_id);
  const producto = await base44.asServiceRole.entities.ProductoCredito.get(linea.producto_id);

  const result = await crearMovimientoDesdeLinea(base44, user, linea, extracto, producto, contrapartida_subcuenta, descripcion_adicional);

  await base44.asServiceRole.entities.LineaExtracto.update(linea_banco_id, {
    estado_conciliacion: "conciliado",
    movimiento_sistema_id: result.movimiento?.id || ""
  });

  const extractoActualizado = await recalcularSaldoSistema(base44, extracto.id);
  return Response.json({
    comprobante: result.comprobante,
    movimiento_creado: result.movimiento,
    extracto_actualizado: extractoActualizado
  });
}

async function ajustarMovimientoDiferente(base44, user, body) {
  const { linea_banco_id, movimiento_sistema_id, accion } = body;
  const linea = await base44.asServiceRole.entities.LineaExtracto.get(linea_banco_id);
  const mov = await base44.asServiceRole.entities.MovimientoContable.get(movimiento_sistema_id);
  const extracto = await base44.asServiceRole.entities.ExtractoProducto.get(linea.extracto_id);
  const producto = await base44.asServiceRole.entities.ProductoCredito.get(linea.producto_id);
  let comprobante_ajuste = null;

  if (accion === "anular_y_recrear") {
    const comprobante = await base44.asServiceRole.entities.ComprobanteContable.get(mov.comprobante_id);
    await ejecutarAnulacion(base44, comprobante, user, "Ajuste conciliación - anular y recrear con valor banco");
    const result = await crearMovimientoDesdeLinea(base44, user, linea, extracto, producto, null, "Recreado con valor banco");
    comprobante_ajuste = result.comprobante;
    const movsCreados = await base44.asServiceRole.entities.MovimientoContable.filter({
      comprobante_id: result.comprobante.id
    });
    await base44.asServiceRole.entities.LineaExtracto.update(linea_banco_id, {
      estado_conciliacion: "conciliado",
      movimiento_sistema_id: movsCreados[0]?.id || ""
    });
  } else if (accion === "crear_diferencia") {
    // Valor real del movimiento en el sistema: el lado que tenga el valor.
    // El match puede haberse dado en el lado opuesto al esperado por la naturaleza
    // (compra registrada como crédito vs. abono en extracto, o viceversa), así que
    // no se puede asumir el lado por la naturaleza — se tomaría 0 y el ajuste
    // terminaría creándose por el valor completo en vez de la diferencia.
    const valorSistema = (mov.credito || 0) > 0 ? (mov.credito || 0) : (mov.debito || 0);
    const diferencia = linea.valor - valorSistema;
    const diff = Math.abs(diferencia);
    const bancoMayor = diferencia > 0;

    const movimientos = linea.naturaleza === "cargo" ? [
      {
        subcuenta: producto.subcuenta_puc,
        debito: bancoMayor ? 0 : diff, credito: bancoMayor ? diff : 0,
        descripcion: `Ajuste conciliación - diferencia ${formatCOP(diff)} en ${linea.descripcion}`,
        producto_credito_id: producto.id, tipo_movimiento_tdc: linea.tipo,
        periodo_extracto: extracto.periodo
      },
      {
        subcuenta: linea.tipo === "financiero" ? (linea.subcuenta_gasto || subcuentaParaCargo(linea.descripcion)) : "510502",
        debito: bancoMayor ? diff : 0, credito: bancoMayor ? 0 : diff,
        descripcion: `Ajuste conciliación - ${linea.descripcion}`,
        tercero: producto.nombre
      }
    ] : [
      {
        subcuenta: producto.subcuenta_puc,
        debito: bancoMayor ? diff : 0, credito: bancoMayor ? 0 : diff,
        descripcion: `Ajuste conciliación - diferencia ${formatCOP(diff)} en ${linea.descripcion}`,
        producto_credito_id: producto.id, tipo_movimiento_tdc: "abono",
        periodo_extracto: extracto.periodo
      },
      {
        subcuenta: "510502",
        debito: bancoMayor ? 0 : diff, credito: bancoMayor ? diff : 0,
        descripcion: `Ajuste conciliación - ${linea.descripcion}`,
        tercero: producto.nombre
      }
    ];

    const result = await ejecutarCreacion(base44, user, {
      tipo: "diario", fecha: linea.fecha,
      descripcion: `Ajuste diferencia conciliación - ${extracto.periodo} - ${linea.descripcion}`,
      modo: "resultado", confirmar_sobregiro: true, movimientos
    });
    comprobante_ajuste = result.comprobante;
    await base44.asServiceRole.entities.LineaExtracto.update(linea_banco_id, {
      estado_conciliacion: "conciliado"
    });
  }

  const extractoActualizado = await recalcularSaldoSistema(base44, extracto.id);
  return Response.json({ comprobante_ajuste, extracto_actualizado: extractoActualizado });
}

async function marcarSobrante(base44, user, body) {
  const { movimiento_sistema_id, accion } = body;
  const mov = await base44.asServiceRole.entities.MovimientoContable.get(movimiento_sistema_id);
  let extractoActualizado = null;

  if (accion === "anular") {
    const comprobante = await base44.asServiceRole.entities.ComprobanteContable.get(mov.comprobante_id);
    await ejecutarAnulacion(base44, comprobante, user, "Movimiento sobrante en conciliación - no aparece en extracto banco");
    const extractos = await base44.asServiceRole.entities.ExtractoProducto.filter({
      producto_id: mov.producto_credito_id
    });
    const ext = extractos.find((e) => e.periodo === mov.periodo_extracto);
    if (ext) extractoActualizado = await recalcularSaldoSistema(base44, ext.id);
  } else if (accion === "marcar_en_disputa") {
    await base44.asServiceRole.entities.HistoricoContable.create({
      numero_comprobante: mov.comprobante_id || "",
      accion: "movimiento_en_disputa",
      descripcion: `Movimiento no aparece en extracto del banco. Pendiente revisión. Mov: ${mov.descripcion || ""}`,
      monto_total: mov.credito || mov.debito || 0,
      usuario_email: user.email || "",
      fecha: new Date().toISOString().substring(0, 10)
    });
  }

  return Response.json({ accion_ejecutada: accion, extracto_actualizado: extractoActualizado });
}

// Modificar un movimiento sobrante: vincular al próximo periodo, cambiar fecha/valor,
// o reclasificar a la cuenta 139006 (Pendientes conciliación).
async function modificarSobrante(base44, user, body) {
  const { movimiento_sistema_id, extracto_id, tipo_mod, nuevo_valor, nueva_fecha, motivo } = body;
  if (!movimiento_sistema_id || !extracto_id || !tipo_mod)
    return Response.json({ error: "movimiento_sistema_id, extracto_id y tipo_mod son requeridos" }, { status: 400 });

  const mov = await base44.asServiceRole.entities.MovimientoContable.get(movimiento_sistema_id);
  const extracto = await base44.asServiceRole.entities.ExtractoProducto.get(extracto_id);

  // CASO 1: Vincular al próximo periodo — actualizar periodo_extracto en todos los movimientos del comprobante
  if (tipo_mod === "vincular_proximo_periodo") {
    const [year, month] = extracto.periodo.split("-").map(Number);
    const nextDate = new Date(year, month, 1); // month 0-indexed: julio(7) → agosto(8)
    const nextPeriodo = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}`;

    const movsComprobante = await base44.asServiceRole.entities.MovimientoContable.filter({
      comprobante_id: mov.comprobante_id, estado: "activo"
    });
    for (const m of movsComprobante) {
      await base44.asServiceRole.entities.MovimientoContable.update(m.id, { periodo_extracto: nextPeriodo });
    }

    await base44.asServiceRole.entities.HistoricoContable.create({
      numero_comprobante: mov.comprobante_id || "",
      accion: "movimiento_reenviado_periodo",
      descripcion: `Movimiento "${mov.descripcion}" (${formatCOP(mov.credito || mov.debito)}) reenviado al período ${nextPeriodo}. Motivo: ${motivo || "Aparecerá en próximo extracto"}`,
      monto_total: mov.credito || mov.debito || 0,
      usuario_email: user.email || "",
      fecha: new Date().toISOString().substring(0, 10)
    });

    const extractoActualizado = await recalcularSaldoSistema(base44, extracto_id);
    return Response.json({ extracto_actualizado: extractoActualizado, proximo_periodo: nextPeriodo });
  }

  // CASO 2: Cambiar fecha — actualización directa (no afecta saldos)
  if (tipo_mod === "cambiar_fecha") {
    if (!nueva_fecha) return Response.json({ error: "nueva_fecha es requerida" }, { status: 400 });
    await base44.asServiceRole.entities.ComprobanteContable.update(mov.comprobante_id, { fecha: nueva_fecha });
    const movsComprobante = await base44.asServiceRole.entities.MovimientoContable.filter({
      comprobante_id: mov.comprobante_id, estado: "activo"
    });
    for (const m of movsComprobante) {
      await base44.asServiceRole.entities.MovimientoContable.update(m.id, { fecha: nueva_fecha });
    }

    await base44.asServiceRole.entities.HistoricoContable.create({
      numero_comprobante: mov.comprobante_id || "",
      accion: "movimiento_fecha_modificada",
      descripcion: `Fecha cambiada a ${nueva_fecha}. Mov: "${mov.descripcion}". Motivo: ${motivo || "Cambio de fecha"}`,
      monto_total: mov.credito || mov.debito || 0,
      usuario_email: user.email || "",
      fecha: new Date().toISOString().substring(0, 10)
    });

    const extractoActualizado = await recalcularSaldoSistema(base44, extracto_id);
    return Response.json({ extracto_actualizado: extractoActualizado });
  }

  // CASO 3 & 4: Cambiar valor / Asignar a cuenta pendiente (139006) — requiere anular + recrear
  if (tipo_mod === "cambiar_valor" || tipo_mod === "asignar_cuenta_pendiente") {
    const comprobante = await base44.asServiceRole.entities.ComprobanteContable.get(mov.comprobante_id);
    if (comprobante.estado === "anulado")
      return Response.json({ error: "No se puede modificar un comprobante anulado" }, { status: 400 });

    const movsOriginales = await base44.asServiceRole.entities.MovimientoContable.filter({
      comprobante_id: comprobante.id, estado: "activo"
    });

    // Construir array de movimientos para el nuevo comprobante
    const nuevosMovs = movsOriginales.map((m) => ({
      subcuenta: m.subcuenta,
      debito: Number(m.debito) || 0,
      credito: Number(m.credito) || 0,
      descripcion: m.descripcion || "",
      tercero: m.tercero || "",
      producto_credito_id: m.producto_credito_id || "",
      tipo_movimiento_tdc: m.tipo_movimiento_tdc || "",
      periodo_extracto: m.periodo_extracto || "",
      cuenta_ahorro_id: m.cuenta_ahorro_id || "",
      cliente_id: m.cliente_id || ""
    }));

    const targetIdx = movsOriginales.findIndex((m) => m.id === movimiento_sistema_id);
    if (targetIdx === -1) throw new ValidationError("Movimiento no encontrado en el comprobante");

    if (tipo_mod === "cambiar_valor") {
      if (!nuevo_valor) return Response.json({ error: "nuevo_valor es requerido" }, { status: 400 });
      const valor = Number(nuevo_valor);
      const target = nuevosMovs[targetIdx];
      const isCredito = target.credito > 0;
      const valorAnterior = isCredito ? target.credito : target.debito;
      const diff = valor - valorAnterior;

      if (isCredito) target.credito = valor;
      else target.debito = valor;

      // Ajustar la contrapartida para mantener el balance
      for (let i = 0; i < nuevosMovs.length; i++) {
        if (i === targetIdx) continue;
        if (isCredito && nuevosMovs[i].debito > 0) {
          nuevosMovs[i].debito += diff;
        } else if (!isCredito && nuevosMovs[i].credito > 0) {
          nuevosMovs[i].credito += diff;
        }
      }
    }

    if (tipo_mod === "asignar_cuenta_pendiente") {
      // Reclasificar a 139006 (Pendientes conciliación) y quitar del TDC
      nuevosMovs[targetIdx].subcuenta = "139006";
      nuevosMovs[targetIdx].producto_credito_id = "";
      nuevosMovs[targetIdx].tipo_movimiento_tdc = "";
      nuevosMovs[targetIdx].descripcion = (nuevosMovs[targetIdx].descripcion || "") + " [Reclasificado a pendientes]";
    }

    // Anular original + recrear con cambios
    await ejecutarAnulacion(base44, comprobante, user, `Modificación sobrante conciliación: ${motivo || tipo_mod}`);
    const result = await ejecutarCreacion(base44, user, {
      tipo: comprobante.tipo,
      fecha: comprobante.fecha,
      descripcion: comprobante.descripcion + " (modificado)",
      modo: "resultado",
      confirmar_sobregiro: true,
      movimientos: nuevosMovs
    });

    await base44.asServiceRole.entities.HistoricoContable.create({
      numero_comprobante: result.comprobante.numero,
      accion: "movimiento_modificado_conciliacion",
      descripcion: `Comprobante ${comprobante.numero} anulado y recreado como ${result.comprobante.numero}. Tipo: ${tipo_mod}. Motivo: ${motivo || ""}`,
      monto_total: result.comprobante.total_debito,
      usuario_email: user.email || "",
      fecha: new Date().toISOString().substring(0, 10)
    });

    const extractoActualizado = await recalcularSaldoSistema(base44, extracto_id);
    return Response.json({ comprobante_nuevo: result.comprobante, extracto_actualizado: extractoActualizado, warnings: result.warnings });
  }

  return Response.json({ error: "tipo_mod no válido: " + tipo_mod }, { status: 400 });
}

async function ajustarAlPeso(base44, user, body) {
  const { extracto_id } = body;
  const extracto = await base44.asServiceRole.entities.ExtractoProducto.get(extracto_id);
  const producto = await base44.asServiceRole.entities.ProductoCredito.get(extracto.producto_id);
  const movs = await getMovimientosPeriodo(base44, extracto);
  const sumaCreditos = movs.reduce((s, m) => s + (m.credito || 0), 0);
  const sumaDebitos = movs.reduce((s, m) => s + (m.debito || 0), 0);
  const saldo_sistema = sumaCreditos - sumaDebitos;
  const saldo_anterior = extracto.saldo_anterior || 0;
  const diferencia = (extracto.saldo_a_pagar || 0) - saldo_anterior - saldo_sistema;

  if (Math.abs(diferencia) < 0.01) {
    return Response.json({ error: "No hay diferencia que ajustar (la conciliación ya cuadra)." }, { status: 400 });
  }

  const diff = Math.abs(diferencia);
  const esPositiva = diferencia > 0;

  // Ajuste residual: llevar el saldo del sistema al del banco con un movimiento de ajuste
  // por la diferencia. Contrapartida a gasto financiero (510502). Mismo comprobante balanceado.
  const movimientos = [
    {
      subcuenta: producto.subcuenta_puc,
      debito: esPositiva ? 0 : diff,
      credito: esPositiva ? diff : 0,
      descripcion: `Ajuste al peso - conciliación ${extracto.periodo}`,
      producto_credito_id: producto.id,
      tipo_movimiento_tdc: "financiero",
      periodo_extracto: extracto.periodo
    },
    {
      subcuenta: "510502",
      debito: esPositiva ? diff : 0,
      credito: esPositiva ? 0 : diff,
      descripcion: `Ajuste al peso - diferencia residual ${formatCOP(diff)} en ${extracto.periodo}`,
      tercero: producto.nombre
    }
  ];

  const result = await ejecutarCreacion(base44, user, {
    tipo: "diario",
    fecha: extracto.fecha_corte || new Date().toISOString().substring(0, 10),
    descripcion: `Ajuste al peso - conciliación ${extracto.periodo} - ${producto.nombre}`,
    modo: "resultado",
    confirmar_sobregiro: true,
    movimientos
  });

  const extractoActualizado = await recalcularSaldoSistema(base44, extracto_id);

  await base44.asServiceRole.entities.HistoricoContable.create({
    numero_comprobante: result.comprobante.numero,
    accion: "ajuste_al_peso",
    descripcion: `Ajuste al peso aplicado en conciliación ${extracto.periodo}. Diferencia: ${formatCOP(diferencia)}. Comprobante: ${result.comprobante.numero}.`,
    monto_total: diff,
    usuario_email: user.email || "",
    fecha: new Date().toISOString().substring(0, 10)
  });

  return Response.json({
    comprobante: result.comprobante,
    diferencia_ajustada: diferencia,
    extracto_actualizado: extractoActualizado,
    warnings: result.warnings
  });
}

async function cerrarConciliacion(base44, user, body) {
  const { extracto_id } = body;
  const extracto = await base44.asServiceRole.entities.ExtractoProducto.get(extracto_id);

  // Validación fresca: recalcular saldo del sistema y diferencia con la fórmula completa
  const movs = await getMovimientosPeriodo(base44, extracto);
  const sumaCreditos = movs.reduce((s, m) => s + (m.credito || 0), 0);
  const sumaDebitos = movs.reduce((s, m) => s + (m.debito || 0), 0);
  const saldo_sistema = sumaCreditos - sumaDebitos;
  const saldo_anterior = extracto.saldo_anterior || 0;
  const diferencia = (extracto.saldo_a_pagar || 0) - saldo_anterior - saldo_sistema;

  // Validación estricta de cuadre
  if (Math.abs(diferencia) > 0.01) {
    return Response.json({
      error: `El saldo NO cuadra. Diferencia actual: ${formatCOP(diferencia)}. Debe resolver todas las diferencias antes de cerrar (Saldo banco = Saldo anterior + Movimientos del sistema).`,
      diferencia, saldo_sistema, saldo_anterior
    }, { status: 400 });
  }

  // Validar que todas las líneas del banco estén conciliadas
  const lineasBanco = await base44.asServiceRole.entities.LineaExtracto.filter({ extracto_id });
  const noConciliadas = lineasBanco.filter((l) => l.estado_conciliacion !== "conciliado");
  if (noConciliadas.length > 0) {
    return Response.json({
      error: `Hay ${noConciliadas.length} línea(s) del banco sin conciliar. Debe conciliar todas las líneas antes de cerrar.`,
      lineas_pendientes: noConciliadas.length
    }, { status: 400 });
  }

  const hoy = new Date().toISOString().substring(0, 10);

  await base44.asServiceRole.entities.ExtractoProducto.update(extracto_id, {
    estado_conciliacion: "cerrado",
    saldo_sistema, diferencia_saldo: diferencia,
    fecha_conciliacion: hoy,
    conciliado_por_email: user.email || "",
    total_lineas_banco: lineasBanco.length,
    total_lineas_sistema: movs.length,
    lineas_conciliadas: lineasBanco.length,
    lineas_faltantes: 0,
    lineas_sobrantes: 0
  });

  await base44.asServiceRole.entities.HistoricoContable.create({
    numero_comprobante: extracto_id,
    accion: "conciliacion_cerrada_definitiva",
    descripcion: `Conciliación período ${extracto.periodo} cerrada y bloqueada definitivamente. Diferencia: ${formatCOP(diferencia)}. Mov. sistema: ${movs.length}. Líneas banco: ${lineasBanco.length}. Estado IRREVERSIBLE.`,
    monto_total: extracto.saldo_a_pagar || 0,
    usuario_email: user.email || "",
    fecha: hoy
  });

  return Response.json({
    extracto_cerrado: extracto_id,
    cerrado_ok: true,
    diferencia,
    lineas_banco: lineasBanco.length,
    movimientos_sistema: movs.length
  });
}

async function eliminarConciliacion(base44, user, body) {
  const { extracto_id } = body;
  const extracto = await base44.asServiceRole.entities.ExtractoProducto.get(extracto_id);
  if (!["cerrado", "conciliado"].includes(extracto.estado_conciliacion)) {
    return Response.json({ error: "Solo se pueden eliminar conciliaciones que estén cerradas o conciliadas." }, { status: 400 });
  }

  const lineas = await base44.asServiceRole.entities.LineaExtracto.filter({ extracto_id });
  if (lineas.length > 0) {
    await base44.asServiceRole.entities.LineaExtracto.deleteMany({ extracto_id });
  }
  await base44.asServiceRole.entities.ExtractoProducto.delete(extracto_id);

  await base44.asServiceRole.entities.HistoricoContable.create({
    numero_comprobante: extracto_id,
    accion: "conciliacion_eliminada",
    descripcion: `Conciliación período ${extracto.periodo} eliminada del listado. Líneas removidas: ${lineas.length}. Los movimientos contables asociados se conservan.`,
    monto_total: extracto.saldo_a_pagar || 0,
    usuario_email: user.email || "",
    fecha: new Date().toISOString().substring(0, 10)
  });

  return Response.json({ extracto_eliminado: extracto_id, lineas_eliminadas: lineas.length });
}