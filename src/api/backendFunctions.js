// Backend functions implementation for Aleke System (replaces serverless functions)

export async function calcularTotales(entities, payload = {}) {
  const { periodo = null } = payload || {};
  const comprobantes = await entities.ComprobanteContable.list("-fecha", 10000);
  const compValido = new Set((comprobantes || []).filter((c) => c.estado === "contabilizado").map((c) => c.id));
  const idsNotasAnulacion = new Set((comprobantes || []).filter((c) => c.tipo === "nota_credito" && c.comprobante_origen_id).map((c) => c.id));

  const query = { estado: "activo" };
  if (periodo) query.periodo_operacion = periodo;

  const todosMovs = await entities.MovimientoContable.filter(query, "-fecha", 10000);
  const saldosPorSubcuenta = {};
  const totales = { activo: 0, pasivo: 0, patrimonio: 0, ingreso: 0, gasto: 0, utilidad: 0, balanceDiff: 0 };
  const periodosSet = new Set();

  for (const m of (todosMovs || [])) {
    if (!compValido.has(m.comprobante_id) || idsNotasAnulacion.has(m.comprobante_id)) continue;
    const d = Number(m.debito) || 0;
    const c = Number(m.credito) || 0;
    const key = m.subcuenta;
    if (!key) continue;
    if (!saldosPorSubcuenta[key]) {
      saldosPorSubcuenta[key] = {
        codigo: m.subcuenta,
        nombre: m.cuenta_nombre || '',
        clase: m.clase || 'activo',
        debito: 0,
        credito: 0,
        saldo: 0,
        cantidad: 0
      };
    }
    saldosPorSubcuenta[key].debito += d;
    saldosPorSubcuenta[key].credito += c;
    saldosPorSubcuenta[key].cantidad += 1;

    if (m.periodo_operacion) periodosSet.add(m.periodo_operacion);
  }

  const saldos = Object.values(saldosPorSubcuenta);
  for (const s of saldos) {
    if (s.clase === "activo" || s.clase === "gasto") {
      s.saldo = s.debito - s.credito;
    } else {
      s.saldo = s.credito - s.debito;
    }
    if (totales[s.clase] !== undefined) {
      if (s.clase === "activo" || s.clase === "gasto") {
        totales[s.clase] += s.debito - s.credito;
      } else {
        totales[s.clase] += s.credito - s.debito;
      }
    }
  }

  totales.utilidad = totales.ingreso - totales.gasto;
  totales.balanceDiff = totales.activo - totales.pasivo - totales.patrimonio - totales.utilidad;

  const periodos = [...periodosSet].sort().reverse();

  return {
    totales,
    saldosPorSubcuenta,
    saldos,
    periodos,
    periodoFiltrado: periodo,
    totalMovimientos: saldos.reduce((s, x) => s + x.cantidad, 0)
  };
}

export async function generarCodigoCliente(entities) {
  const clients = await entities.Cliente.list();
  const nums = (clients || []).map(c => {
    const m = String(c.codigo || '').match(/CLI-(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  });
  const next = Math.max(0, ...nums) + 1;
  return { codigo: `CLI-${String(next).padStart(3, '0')}` };
}

export async function auditarCuadre(entities, payload = {}) {
  const { periodo = null, comprobante_id = null, solo_descuadrados = true } = payload || {};
  const comprobantes = await entities.ComprobanteContable.list("-fecha", 10000);
  const compMap = new Map();
  for (const c of (comprobantes || [])) {
    if (c.estado !== 'contabilizado') continue;
    if (comprobante_id && c.id !== comprobante_id) continue;
    compMap.set(c.id, c);
  }

  const movQuery = { estado: 'activo' };
  if (comprobante_id) movQuery.comprobante_id = comprobante_id;
  const todosMovs = await entities.MovimientoContable.filter(movQuery, "-fecha", 10000);

  const movPorComp = new Map();
  const huerfanos = [];
  for (const m of (todosMovs || [])) {
    const key = m.comprobante_id;
    if (!compMap.has(key)) {
      huerfanos.push(m);
      continue;
    }
    if (!movPorComp.has(key)) movPorComp.set(key, { debito: 0, credito: 0, lineas: [] });
    const agg = movPorComp.get(key);
    const d = Number(m.debito) || 0;
    const c = Number(m.credito) || 0;
    agg.debito += d;
    agg.credito += c;
    agg.lineas.push(m);
  }

  const descuadres = [];
  let totalDebito = 0;
  let totalCredito = 0;

  for (const [cid, comp] of compMap.entries()) {
    const agg = movPorComp.get(cid) || { debito: 0, credito: 0, lineas: [] };
    const diff = Math.abs(agg.debito - agg.credito);
    const hasDiff = diff > 0.01;
    totalDebito += agg.debito;
    totalCredito += agg.credito;

    if (!solo_descuadrados || hasDiff) {
      descuadres.push({
        comprobante_id: cid,
        numero: comp.numero,
        fecha: comp.fecha,
        descripcion: comp.descripcion,
        estado: comp.estado,
        totales_comprobante: { debito: comp.total_debito || agg.debito, credito: comp.total_credito || agg.credito, diferencia: diff },
        sumas_movimientos: { debito: agg.debito, credito: agg.credito, diferencia: diff },
        cantidad_lineas: agg.lineas.length,
        lineas: agg.lineas
      });
    }
  }

  return {
    ok: true,
    resumen: {
      total_comprobantes: compMap.size,
      total_descuadrados: descuadres.filter(d => Math.abs(d.sumas_movimientos.diferencia) > 0.01).length,
      diferencia_neta_debito: totalDebito,
      diferencia_neta_credito: totalCredito
    },
    huerfanos,
    descuadres,
    filtros: { periodo, comprobante_id, solo_descuadrados }
  };
}

export async function createComprobante(entities, payload = {}) {
  const { fecha, tipo = "diario", descripcion = "", movimientos = [], soporte_url = "" } = payload;
  const year = fecha ? new Date(fecha).getFullYear() : new Date().getFullYear();
  
  const consecs = await entities.Consecutivo.filter({ año: year, tipo: "comprobante" });
  let nextNum = 1;
  const consecRecord = consecs && consecs[0];
  if (consecRecord) {
    nextNum = (Number(consecRecord.ultimo_numero) || 0) + 1;
    await entities.Consecutivo.update(consecRecord.id, { ultimo_numero: nextNum });
  } else {
    await entities.Consecutivo.create({
      año: year,
      tipo: "comprobante",
      ultimo_numero: 1
    });
  }
  const numero = `${String(nextNum).padStart(4, "0")}-${year}`;

  const debitoTotal = movimientos.reduce((s, m) => s + (Number(m.debito) || 0), 0);
  const creditoTotal = movimientos.reduce((s, m) => s + (Number(m.credito) || 0), 0);

  const comprobante = await entities.ComprobanteContable.create({
    numero,
    fecha: fecha || new Date().toISOString().split('T')[0],
    tipo,
    descripcion,
    estado: "contabilizado",
    total_debito: debitoTotal,
    total_credito: creditoTotal,
    soporte_url: soporte_url || null
  });

  const createdMovs = [];
  for (const m of movimientos) {
    const mov = await entities.MovimientoContable.create({
      ...m,
      comprobante_id: comprobante.id,
      estado: "activo",
      fecha: comprobante.fecha
    });
    createdMovs.push(mov);
  }

  await entities.HistoricoContable.create({
    comprobante_id: comprobante.id,
    numero_comprobante: numero,
    accion: "creacion",
    descripcion,
    monto_total: debitoTotal,
    usuario_email: "multipagosstm@gmail.com",
    fecha: comprobante.fecha
  });

  return {
    comprobante,
    movimientos: createdMovs,
    warnings: []
  };
}

export async function modificarComprobante(entities, payload = {}) {
  const { comprobante_id, fecha, tipo, descripcion, soporte_url, movimientos } = payload;
  const existing = await entities.ComprobanteContable.get(comprobante_id);
  if (!existing) throw new Error("Comprobante no encontrado");

  const debitoTotal = movimientos ? movimientos.reduce((s, m) => s + (Number(m.debito) || 0), 0) : existing.total_debito;
  const creditoTotal = movimientos ? movimientos.reduce((s, m) => s + (Number(m.credito) || 0), 0) : existing.total_credito;

  const updated = await entities.ComprobanteContable.update(comprobante_id, {
    ...(fecha ? { fecha } : {}),
    ...(tipo ? { tipo } : {}),
    ...(descripcion !== undefined ? { descripcion } : {}),
    ...(soporte_url !== undefined ? { soporte_url } : {}),
    total_debito: debitoTotal,
    total_credito: creditoTotal
  });

  if (movimientos && movimientos.length > 0) {
    const oldMovs = await entities.MovimientoContable.filter({ comprobante_id });
    for (const om of oldMovs) {
      await entities.MovimientoContable.update(om.id, { estado: "inactivo" });
    }
    for (const m of movimientos) {
      await entities.MovimientoContable.create({
        ...m,
        comprobante_id,
        estado: "activo",
        fecha: updated.fecha
      });
    }
  }

  return { comprobante: updated, success: true };
}

export async function anularComprobante(entities, payload = {}) {
  const { comprobante_id, motivo = "Anulación administrativa" } = payload;
  const comp = await entities.ComprobanteContable.get(comprobante_id);
  if (!comp) return { success: false, error: "Comprobante no encontrado" };

  await entities.ComprobanteContable.update(comprobante_id, {
    estado: "anulado",
    motivo_anulacion: motivo
  });

  const movs = await entities.MovimientoContable.filter({ comprobante_id });
  for (const m of movs) {
    await entities.MovimientoContable.update(m.id, { estado: "anulado" });
  }

  await entities.HistoricoContable.create({
    comprobante_id,
    numero_comprobante: comp.numero,
    accion: "anulacion",
    descripcion: motivo,
    monto_total: comp.total_debito,
    usuario_email: "multipagosstm@gmail.com",
    fecha: new Date().toISOString().split('T')[0]
  });

  return { success: true };
}

export async function recalcularTotalesComprobante(entities, payload = {}) {
  const { comprobante_id } = payload;
  const movs = await entities.MovimientoContable.filter({ comprobante_id, estado: "activo" });
  const deb = (movs || []).reduce((s, m) => s + (Number(m.debito) || 0), 0);
  const cred = (movs || []).reduce((s, m) => s + (Number(m.credito) || 0), 0);
  const updated = await entities.ComprobanteContable.update(comprobante_id, {
    total_debito: deb,
    total_credito: cred
  });
  return { success: true, comprobante: updated, debito: deb, credito: cred };
}

export async function gestionarPakredito(entities, payload = {}) {
  const { accion, ...params } = payload;
  if (accion === "crearPrestamo") {
    const prestamo = await entities.Prestamo.create({
      ...params,
      saldo_capital: params.monto || 0,
      total_abonado: 0,
      estado: "activo",
      cuotas_pagadas: 0
    });
    return { success: true, prestamo };
  }
  if (accion === "registrarAbono") {
    const abono = await entities.AbonoPrestamo.create({
      ...params,
      estado: "activo"
    });
    const p = await entities.Prestamo.get(params.prestamo_id);
    if (p) {
      const nuevoAbonado = (Number(p.total_abonado) || 0) + (Number(params.monto) || 0);
      const nuevoSaldo = Math.max(0, (Number(p.saldo_capital) || Number(p.monto) || 0) - (Number(params.abono_capital) || Number(params.monto) || 0));
      await entities.Prestamo.update(p.id, {
        total_abonado: nuevoAbonado,
        saldo_capital: nuevoSaldo,
        cuotas_pagadas: (Number(p.cuotas_pagadas) || 0) + 1,
        estado: nuevoSaldo <= 0 ? "finalizado" : "activo"
      });
    }
    return { success: true, abono };
  }
  if (accion === "editarPrestamo" || accion === "editarDesembolso") {
    const updated = await entities.Prestamo.update(params.prestamo_id || params.id, params);
    return { success: true, prestamo: updated };
  }
  if (accion === "eliminarPrestamo") {
    await entities.Prestamo.delete(params.prestamo_id || params.id);
    return { success: true };
  }
  if (accion === "eliminarAbono") {
    await entities.AbonoPrestamo.delete(params.abono_id || params.id);
    return { success: true };
  }
  if (accion === "recalcularEstado") {
    return { success: true };
  }
  return { success: true, ...params };
}

export async function gestionarRooftop(entities, payload = {}) {
  const action = payload.action || payload.accion;
  if (action === "actualizarEstadoContratos") {
    const contratos = await entities.ContratoArriendo.list();
    const hoy = new Date().toISOString().split("T")[0];
    for (const c of (contratos || [])) {
      if (c.fecha_fin && c.fecha_fin < hoy && c.estado === "activo") {
        await entities.ContratoArriendo.update(c.id, { estado: "finalizado" });
      }
    }
    return { success: true };
  }
  if (action === "crearContrato") {
    const contrato = await entities.ContratoArriendo.create(payload.data || payload);
    return { success: true, contrato };
  }
  if (action === "registrarPago") {
    const pago = await entities.PagoArriendo.create(payload.data || payload);
    return { success: true, pago };
  }
  if (action === "terminarContrato") {
    await entities.ContratoArriendo.update(payload.contrato_id, {
      estado: "finalizado",
      motivo_terminacion: payload.motivo || ""
    });
    return { success: true };
  }
  if (action === "renovarContrato") {
    const updated = await entities.ContratoArriendo.update(payload.contrato_id, {
      fecha_fin: payload.nueva_fecha_fin,
      canon_mensual: payload.nuevo_canon || payload.canon_mensual,
      estado: "activo"
    });
    return { success: true, contrato: updated };
  }
  return { success: true, ...payload };
}

export async function gestionarTarjeta(entities, payload = {}) {
  const { accion, operacion, ...params } = payload;
  const op = accion || operacion;
  if (op === "crear") {
    const tarjeta = await entities.ProductoCredito.create(params);
    return { success: true, tarjeta };
  }
  if (op === "editar") {
    const updated = await entities.ProductoCredito.update(params.id || params.tarjeta_id, params);
    return { success: true, tarjeta: updated };
  }
  if (op === "aumentoCupo") {
    const updated = await entities.ProductoCredito.update(params.producto_credito_id || params.id, {
      cupo_total: params.nuevo_cupo
    });
    return { success: true, producto: updated };
  }
  return { success: true, ...params };
}

export async function gestionarCuentaAhorro(entities, payload = {}) {
  const { operacion, ...params } = payload;
  if (operacion === "crear") {
    const cda = await entities.CuentaAhorro.create(params);
    return { success: true, cuentaAhorro: cda };
  }
  return { success: true, ...params };
}

export async function gestionarCuentaPUC(entities, payload = {}) {
  const { operacion, accion, ...params } = payload;
  const op = operacion || accion;
  if (op === "crear") {
    const cuenta = await entities.Cuenta.create(params);
    return { success: true, cuenta };
  }
  if (op === "editar") {
    const updated = await entities.Cuenta.update(params.id, params);
    return { success: true, cuenta: updated };
  }
  return { success: true, ...params };
}

export async function gestionarEmprendamos(entities, payload = {}) {
  const { accion, ...params } = payload;
  if (accion === "inscribir") {
    const cliente = await entities.EmprendamosCliente.create(params);
    return { success: true, cliente };
  }
  if (accion === "crearCredito") {
    const credito = await entities.EmprendamosCredito.create({
      ...params,
      estado: "activo",
      saldo_capital: params.monto || 0,
      total_abonado: 0
    });
    return { success: true, credito };
  }
  if (accion === "registrarAbono") {
    const abono = await entities.EmprendamosAbono.create(params);
    return { success: true, abono };
  }
  if (accion === "editarCredito") {
    const updated = await entities.EmprendamosCredito.update(params.credito_id || params.id, params);
    return { success: true, credito: updated };
  }
  if (accion === "editarAbono") {
    const updated = await entities.EmprendamosAbono.update(params.abono_id || params.id, params);
    return { success: true, abono: updated };
  }
  if (accion === "eliminarCredito") {
    await entities.EmprendamosCredito.delete(params.credito_id || params.id);
    return { success: true };
  }
  if (accion === "eliminarAbono") {
    await entities.EmprendamosAbono.delete(params.abono_id || params.id);
    return { success: true };
  }
  if (accion === "salirCliente") {
    await entities.EmprendamosCliente.update(params.emprendamos_cliente_id, {
      estado: "inactivo",
      motivo_salida: params.motivo || ""
    });
    return { success: true };
  }
  if (accion === "generarEstadoCuenta") {
    return {
      success: true,
      cliente: {},
      creditos: [],
      abonos: [],
      totalCredito: 0,
      totalAbonos: 0,
      saldo: 0
    };
  }
  return { success: true, ...params };
}
