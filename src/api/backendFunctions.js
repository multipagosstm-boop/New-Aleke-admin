// Backend functions implementation for Aleke System (replaces serverless functions)
import {
  parseAndRoundCOP,
  categorizarCargo,
  subcuentaParaCargo,
  detectarBanco,
  normalizeDate,
  esLineaSubtotal,
  esCuotaPosterior,
  restarUnDia,
  extraerDatosExtractoConIA
} from "../lib/extractoUtils";
import {
  generarAmortizacionCuotaFija,
  generarAmortizacionMesVencido,
  estimarInteresesMesVencido
} from "../lib/pakredito";

export async function calcularTotales(entities, payload = {}) {
  const { periodo = null } = payload || {};
  const comprobantes = await entities.ComprobanteContable.list("-fecha", 10000);
  const compValido = new Set((comprobantes || []).filter((c) => c.estado === "contabilizado").map((c) => c.id));
  const idsNotasAnulacion = new Set((comprobantes || []).filter((c) => c.tipo === "nota_credito" && c.comprobante_origen_id).map((c) => c.id));

  // Validación directa de conciliación contable (partida doble):
  // SELECT SUM(total_credito) - SUM(total_debito) AS RESULTADO_CONCILIADO FROM comprobante_contable;
  let totalDebitoComprobantes = 0;
  let totalCreditoComprobantes = 0;

  for (const c of (comprobantes || [])) {
    if (c.estado !== "contabilizado") continue;
    if (idsNotasAnulacion.has(c.id)) continue;
    if (periodo && !c.fecha?.startsWith(periodo)) continue;
    totalDebitoComprobantes += Number(c.total_debito) || 0;
    totalCreditoComprobantes += Number(c.total_credito) || 0;
  }

  const balanceDiff = Math.round((totalCreditoComprobantes - totalDebitoComprobantes) * 100) / 100;

  const query = { estado: "activo" };
  if (periodo) query.periodo_operacion = periodo;

  const todosMovs = await entities.MovimientoContable.filter(query, "-fecha", 10000);
  const saldosPorSubcuenta = {};
  const totales = {
    activo: 0,
    pasivo: 0,
    patrimonio: 0,
    ingreso: 0,
    gasto: 0,
    utilidad: 0,
    totalDebito: Math.round(totalDebitoComprobantes * 100) / 100,
    totalCredito: Math.round(totalCreditoComprobantes * 100) / 100,
    balanceDiff: balanceDiff
  };
  const periodosSet = new Set();

  function normalizarClase(claseRaw, subcuenta) {
    if (claseRaw) {
      const cl = String(claseRaw).toLowerCase().trim();
      if (cl === "1" || cl === "activo") return "activo";
      if (cl === "2" || cl === "pasivo") return "pasivo";
      if (cl === "3" || cl === "patrimonio") return "patrimonio";
      if (cl === "4" || cl === "ingreso" || cl === "ingresos") return "ingreso";
      if (cl === "5" || cl === "gasto" || cl === "gastos" || cl === "6" || cl === "costos") return "gasto";
    }
    const first = String(subcuenta || "").charAt(0);
    if (first === "1") return "activo";
    if (first === "2") return "pasivo";
    if (first === "3") return "patrimonio";
    if (first === "4") return "ingreso";
    if (first === "5" || first === "6") return "gasto";
    return "activo";
  }

  for (const m of (todosMovs || [])) {
    if (!compValido.has(m.comprobante_id) || idsNotasAnulacion.has(m.comprobante_id)) continue;
    const d = Number(m.debito) || 0;
    const c = Number(m.credito) || 0;
    const key = m.subcuenta;
    if (!key) continue;
    const claseNorm = normalizarClase(m.clase, m.subcuenta);
    if (!saldosPorSubcuenta[key]) {
      saldosPorSubcuenta[key] = {
        codigo: m.subcuenta,
        nombre: m.cuenta_nombre || '',
        clase: claseNorm,
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
  const huerfanosMap = new Map();
  for (const m of (todosMovs || [])) {
    const key = m.comprobante_id || "sin_comprobante";
    if (!compMap.has(key)) {
      if (!huerfanosMap.has(key)) {
        huerfanosMap.set(key, { comprobante_id: key, cantidad_lineas: 0, total_debito: 0, total_credito: 0, lineas: [] });
      }
      const h = huerfanosMap.get(key);
      h.cantidad_lineas += 1;
      h.total_debito += Number(m.debito) || 0;
      h.total_credito += Number(m.credito) || 0;
      h.lineas.push(m);
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
  const huerfanos = Array.from(huerfanosMap.values());

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

  const totalDescuadrados = descuadres.filter(d => Math.abs(d.sumas_movimientos.diferencia) > 0.01).length;
  const sinMovimientos = descuadres.filter(d => d.cantidad_lineas === 0).length;
  const diferenciaNeta = Math.round((totalCredito - totalDebito) * 100) / 100;

  return {
    ok: true,
    resumen: {
      total_comprobantes: compMap.size,
      cuadrados: compMap.size - totalDescuadrados,
      descuadrados: totalDescuadrados,
      sin_movimientos: sinMovimientos,
      diferencia_neta: diferenciaNeta,
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
    total_credito: creditoTotal
  });

  const createdMovs = [];
  let pucList = [];
  try {
    pucList = await entities.Cuenta.list();
  } catch {
    pucList = [];
  }
  const pucMap = {};
  (pucList || []).forEach((c) => { pucMap[String(c.codigo)] = c; });

  for (const m of movimientos) {
    const cuentaPuc = pucMap[String(m.subcuenta)] || {};
    const mov = await entities.MovimientoContable.create({
      ...m,
      comprobante_id: comprobante.id,
      cuenta_nombre: m.cuenta_nombre || cuentaPuc.concepto || "",
      clase: m.clase || cuentaPuc.clase || (cuentaPuc.tipo_naturaleza || "activo"),
      grupo: m.grupo || String(cuentaPuc.grupo || ""),
      cuenta: m.cuenta || String(cuentaPuc.cuenta || ""),
      periodo_operacion: (fecha || comprobante.fecha || "").substring(0, 7),
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

  try {
    await recalcularSaldos(entities);
  } catch (errRecalc) {
    console.warn("Recálculo tras creación:", errRecalc);
  }

  return {
    comprobante,
    movimientos: createdMovs,
    warnings: []
  };
}

export async function modificarComprobante(entities, payload = {}) {
  const { comprobante_id, fecha, tipo, descripcion, soporte_url, movimientos, motivo = "" } = payload;
  const existing = await entities.ComprobanteContable.get(comprobante_id);
  if (!existing) throw new Error("Comprobante no encontrado");

  const debitoTotal = movimientos ? movimientos.reduce((s, m) => s + (Number(m.debito) || 0), 0) : existing.total_debito;
  const creditoTotal = movimientos ? movimientos.reduce((s, m) => s + (Number(m.credito) || 0), 0) : existing.total_credito;
  const fechaDoc = fecha || existing.fecha || new Date().toISOString().split('T')[0];

  const updated = await entities.ComprobanteContable.update(comprobante_id, {
    ...(fecha ? { fecha: fechaDoc } : {}),
    ...(tipo ? { tipo } : {}),
    ...(descripcion !== undefined ? { descripcion: descripcion.trim() } : {}),
    ...(soporte_url !== undefined ? { soporte_url } : {}),
    total_debito: debitoTotal,
    total_credito: creditoTotal
  });

  const createdMovs = [];
  if (movimientos && movimientos.length > 0) {
    // 1. Eliminar PERMANENTEMENTE todos los movimientos anteriores vinculados a este comprobante
    const oldMovs = await entities.MovimientoContable.filter({ comprobante_id });
    if (oldMovs && oldMovs.length > 0) {
      for (const om of oldMovs) {
        try {
          await entities.MovimientoContable.delete(om.id);
        } catch (delErr) {
          console.warn(`Error eliminando movimiento viejo ${om.id}:`, delErr);
        }
      }
    }

    // 2. Mapear PUC para enriquecer nombres y clases contables
    let pucList = [];
    try {
      pucList = await entities.Cuenta.list();
    } catch {
      pucList = [];
    }
    const pucMap = {};
    (pucList || []).forEach((c) => { pucMap[String(c.codigo)] = c; });

    // 3. Crear exclusivamente los nuevos movimientos corregidos
    for (const m of movimientos) {
      const cuentaPuc = pucMap[String(m.subcuenta)] || {};
      const mov = await entities.MovimientoContable.create({
        ...m,
        comprobante_id,
        cuenta_nombre: m.cuenta_nombre || cuentaPuc.concepto || "",
        clase: m.clase || cuentaPuc.clase || (cuentaPuc.tipo_naturaleza || "activo"),
        grupo: m.grupo || String(cuentaPuc.grupo || ""),
        cuenta: m.cuenta || String(cuentaPuc.cuenta || ""),
        periodo_operacion: fechaDoc.substring(0, 7),
        estado: "activo",
        fecha: fechaDoc
      });
      createdMovs.push(mov);
    }

    // 4. Recalcular automáticamente saldos de cuentas de ahorro y tarjetas
    try {
      await recalcularSaldos(entities);
    } catch (errRecalc) {
      console.warn("Recálculo tras modificación:", errRecalc);
    }
  }

  // Registrar auditoría en histórico contable
  try {
    await entities.HistoricoContable.create({
      comprobante_id,
      numero_comprobante: existing.numero,
      accion: "modificacion",
      descripcion: motivo ? `Modificación comprobante ${existing.numero}: ${motivo}` : `Modificación comprobante ${existing.numero}`,
      monto_total: debitoTotal,
      usuario_email: "multipagosstm@gmail.com",
      fecha: fechaDoc
    });
  } catch (errHist) {
    console.warn("Error guardando histórico de modificación:", errHist);
  }

  return { comprobante: updated, movimientos: createdMovs, success: true };
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
  const hoy = new Date().toISOString().split("T")[0];

  // 1. CREAR PRÉSTAMO
  if (accion === "crearPrestamo") {
    const {
      cliente_id,
      modelo = "cuota_fija",
      tasa_nominal = 0,
      periodo = "mensual",
      numero_cuotas = 1,
      fecha_prestamo,
      cuota_manual = 0,
      movimientos = [],
      notas = ""
    } = params;

    if (!cliente_id) throw new Error("Cliente es requerido");
    const cliente = await entities.Cliente.get(cliente_id);
    if (!cliente) throw new Error("Cliente no encontrado");

    // Asegurar que el cliente tenga 'pakredito' en sus líneas de negocio
    if (!cliente.lineas_negocio || !cliente.lineas_negocio.includes("pakredito")) {
      const lineas = Array.isArray(cliente.lineas_negocio) ? [...cliente.lineas_negocio, "pakredito"] : ["pakredito"];
      try {
        await entities.Cliente.update(cliente.id, { lineas_negocio: lineas });
      } catch (errCli) {
        console.warn("No se pudo actualizar lineas_negocio del cliente:", errCli);
      }
    }

    const capital = Number(params.capital) || movimientos.reduce((s, m) => s + (Number(m.credito) || 0), 0);
    if (!capital || capital <= 0) {
      throw new Error("Debe ingresar al menos un movimiento de desembolso con valor de crédito");
    }

    const fechaDoc = fecha_prestamo || hoy;
    const numCuotas = Math.max(1, parseInt(numero_cuotas, 10) || 1);
    const tasaNom = Number(tasa_nominal) || 0;
    const cuotaMan = Number(cuota_manual) || 0;

    // Generar tabla de amortización
    const gen = modelo === "cuota_fija"
      ? generarAmortizacionCuotaFija(capital, tasaNom, periodo, numCuotas, fechaDoc, cuotaMan)
      : generarAmortizacionMesVencido(capital, tasaNom, numCuotas, fechaDoc);

    const tasaNominalFinal = gen.tasa_nominal_derivada !== undefined ? gen.tasa_nominal_derivada : tasaNom;

    // Obtener consecutivo incremental para el código (PK-001, PK-002, ...)
    const todosPrestamos = await entities.Prestamo.list("-created_date", 2000);
    let maxPk = 0;
    for (const p of (todosPrestamos || [])) {
      if (p.codigo && typeof p.codigo === "string" && p.codigo.startsWith("PK-")) {
        const n = parseInt(p.codigo.replace("PK-", ""), 10);
        if (!isNaN(n) && n > maxPk) maxPk = n;
      }
    }
    const codigo = `PK-${String(maxPk + 1).padStart(3, "0")}`;

    // Construir movimientos contables para el comprobante de egreso:
    // 1. Débito a la cartera 120506 PAKREDITO
    // 2. Créditos por cada salida de dinero (banco, caja, CDA, etc.)
    const movDebito = {
      subcuenta: "120506",
      debito: capital,
      credito: 0,
      descripcion: `Capital préstamo Pakredito — ${cliente.nombre}`,
      tercero: cliente.nombre,
      cliente_id: cliente.id
    };

    const movsCredito = movimientos.filter((m) => Number(m.credito) > 0).map((m) => ({
      subcuenta: String(m.subcuenta),
      debito: 0,
      credito: Number(m.credito) || 0,
      descripcion: m.descripcion || `Desembolso ${codigo}`,
      tercero: m.tercero || cliente.nombre,
      cliente_id: cliente.id,
      cuenta_ahorro_id: m.cuenta_ahorro_id || null,
      producto_credito_id: m.producto_credito_id || null,
      tipo_movimiento_tdc: m.tipo_movimiento_tdc || null
    }));

    const compRes = await createComprobante(entities, {
      fecha: fechaDoc,
      tipo: "egreso",
      descripcion: `Desembolso préstamo ${cliente.nombre} — ${codigo}`,
      movimientos: [movDebito, ...movsCredito]
    });

    const comprobante_id = compRes?.comprobante?.id || null;

    // Crear el préstamo
    const primerVencimiento = gen.schedule[0]?.fecha_vencimiento || null;
    const valorPrimeraCuota = gen.schedule[0]?.cuota || 0;

    const prestamo = await entities.Prestamo.create({
      codigo,
      cliente_id: cliente.id,
      modelo,
      capital,
      tasa_nominal: tasaNominalFinal,
      periodo: modelo === "cuota_fija" ? periodo : "mensual",
      numero_cuotas: numCuotas,
      fecha_prestamo: fechaDoc,
      cuota_fija: modelo === "cuota_fija" ? gen.cuota : 0,
      tasa_efectiva_periodo: gen.tasa_efectiva_periodo,
      tasa_efectiva_anual: Math.pow(1 + tasaNominalFinal, 12) - 1,
      total_intereses: gen.totalIntereses,
      total_a_pagar: gen.totalAPagar,
      saldo_capital: capital,
      saldo_intereses: 0,
      estado: "vigente",
      comprobante_id,
      subcuenta_cartera: "120506",
      subcuenta_intereses: "410503",
      fecha_proximo_pago: primerVencimiento,
      valor_proximo_pago: valorPrimeraCuota,
      fecha_ultimo_abono: null,
      notas: notas || null
    });

    // Guardar las cuotas de amortización en CuotaAmortizacion
    if (Array.isArray(gen.schedule)) {
      for (const c of gen.schedule) {
        await entities.CuotaAmortizacion.create({
          prestamo_id: prestamo.id,
          numero: c.numero,
          fecha_vencimiento: c.fecha_vencimiento,
          cuota: c.cuota,
          interes: c.interes,
          capital_abono: c.capital_abono,
          saldo_capital: c.saldo_capital,
          estado: "pendiente",
          valor_pagado: 0,
          fecha_pago: null,
          abono_id: null
        });
      }
    }

    await recalcularSaldos(entities);
    return { success: true, prestamo };
  }

  // 2. REGISTRAR ABONO
  if (accion === "registrarAbono") {
    const {
      cliente_id,
      fecha,
      valor_total,
      cuenta_ingreso = {},
      detalles = [],
      notas = ""
    } = params;

    if (!cliente_id) throw new Error("Cliente es requerido");
    const cliente = await entities.Cliente.get(cliente_id);
    if (!cliente) throw new Error("Cliente no encontrado");

    const totalVal = Number(valor_total) || 0;
    if (totalVal <= 0) throw new Error("El valor del abono debe ser mayor a 0");
    if (!cuenta_ingreso.subcuenta) throw new Error("Debe seleccionar la cuenta de ingreso");
    if (!detalles || detalles.length === 0) throw new Error("Debe seleccionar al menos un crédito para abonar");

    const fechaDoc = fecha || hoy;

    // Cargar los préstamos involucrados para validar y armar descripción y movimientos
    const prestamosMap = {};
    const codigosAbonados = [];
    for (const d of detalles) {
      const p = await entities.Prestamo.get(d.prestamo_id);
      if (p) {
        prestamosMap[d.prestamo_id] = p;
        if (p.codigo) codigosAbonados.push(p.codigo);
      }
    }

    // Movimientos contables del ingreso:
    // 1. Débito a la cuenta receptora del dinero (banco, caja, CDA, etc.)
    const movDebito = {
      subcuenta: String(cuenta_ingreso.subcuenta),
      debito: totalVal,
      credito: 0,
      descripcion: `Abono pakredito — ${cliente.nombre}`,
      tercero: cliente.nombre,
      cliente_id: cliente.id,
      cuenta_ahorro_id: cuenta_ingreso.cuenta_ahorro_id || null,
      producto_credito_id: cuenta_ingreso.producto_credito_id || null,
      tipo_movimiento_tdc: cuenta_ingreso.producto_credito_id ? "abono" : null
    };

    // 2. Créditos por cada préstamo:
    //    - Capital abonado a 120506 PAKREDITO
    //    - Intereses pagados a 410503 Pakredito
    const movsCredito = [];
    for (const d of detalles) {
      const p = prestamosMap[d.prestamo_id];
      const valorAplicado = Number(d.valor_aplicado) || 0;
      const intereses = Math.round(Number(d.intereses) || 0);
      const capitalAbono = Math.max(0, valorAplicado - intereses);

      if (capitalAbono > 0) {
        movsCredito.push({
          subcuenta: p?.subcuenta_cartera || "120506",
          debito: 0,
          credito: capitalAbono,
          descripcion: `Abono capital ${p?.codigo || ""}`,
          tercero: cliente.nombre,
          cliente_id: cliente.id
        });
      }
      if (intereses > 0) {
        movsCredito.push({
          subcuenta: p?.subcuenta_intereses || "410503",
          debito: 0,
          credito: intereses,
          descripcion: `Intereses ${p?.codigo || ""}`,
          tercero: cliente.nombre,
          cliente_id: cliente.id
        });
      }
    }

    const descComp = `Abono pakredito — ${cliente.nombre}${codigosAbonados.length ? ` (${codigosAbonados.join(", ")})` : ""}`;
    const compRes = await createComprobante(entities, {
      fecha: fechaDoc,
      tipo: "ingreso",
      descripcion: descComp,
      movimientos: [movDebito, ...movsCredito]
    });
    const comprobante_id = compRes?.comprobante?.id || null;

    // Crear registro AbonoPrestamo
    // Crear registro AbonoPrestamo (solo columnas válidas de la tabla abono_prestamo)
    const abono = await entities.AbonoPrestamo.create({
      cliente_id: cliente.id,
      fecha: fechaDoc,
      valor_total: totalVal,
      comprobante_id,
      subcuenta_ingreso: String(cuenta_ingreso.subcuenta),
      cda_id: cuenta_ingreso.cuenta_ahorro_id || null,
      detalles: detalles.map((d) => {
        const val = Number(d.valor_aplicado) || 0;
        const intVal = Number(d.intereses) || 0;
        return {
          prestamo_id: d.prestamo_id,
          valor_aplicado: val,
          intereses: intVal,
          capital: Math.max(0, val - intVal)
        };
      }),
      notas: notas || null
    });

    // Actualizar cada préstamo y sus cuotas
    for (const d of detalles) {
      const p = prestamosMap[d.prestamo_id];
      if (!p) continue;

      const valorAplicado = Number(d.valor_aplicado) || 0;
      const intereses = Number(d.intereses) || 0;
      const capitalAbono = Math.max(0, valorAplicado - intereses);

      const nuevoSaldoCapital = Math.max(0, (Number(p.saldo_capital) || 0) - capitalAbono);

      let fechaProximoPago = p.fecha_proximo_pago;
      let valorProximoPago = p.valor_proximo_pago;
      let nuevoSaldoIntereses = p.saldo_intereses || 0;

      if (p.modelo === "cuota_fija") {
        const cuotas = await entities.CuotaAmortizacion.filter({ prestamo_id: p.id });
        const cuotasOrdenadas = (cuotas || []).sort((a, b) => (Number(a.numero) || 0) - (Number(b.numero) || 0));

        let rem = valorAplicado;
        for (const c of cuotasOrdenadas) {
          if (rem <= 0 && nuevoSaldoCapital > 0) break;
          if (c.estado === "pagada") continue;

          // Si el saldo de capital quedó en 0, todas las cuotas restantes se dan por pagadas
          if (nuevoSaldoCapital <= 0) {
            await entities.CuotaAmortizacion.update(c.id, {
              valor_pagado: c.cuota,
              estado: "pagada",
              fecha_pago: fechaDoc,
              abono_id: abono.id
            });
            continue;
          }

          const falta = Math.max(0, (Number(c.cuota) || 0) - (Number(c.valor_pagado) || 0));
          if (falta <= 0) continue;
          const pago = Math.min(rem, falta);
          const nuevoPagado = (Number(c.valor_pagado) || 0) + pago;
          const yaPagada = nuevoPagado >= ((Number(c.cuota) || 0) - 0.01);
          await entities.CuotaAmortizacion.update(c.id, {
            valor_pagado: nuevoPagado,
            estado: yaPagada ? "pagada" : "pendiente",
            fecha_pago: fechaDoc,
            abono_id: abono.id
          });
          rem -= pago;
        }

        const cuotasActualizadas = await entities.CuotaAmortizacion.filter({ prestamo_id: p.id });
        const prox = (cuotasActualizadas || []).sort((a, b) => a.numero - b.numero).find((c) => c.estado !== "pagada");
        fechaProximoPago = prox ? prox.fecha_vencimiento : null;
        valorProximoPago = prox ? Math.max(0, (Number(prox.cuota) || 0) - (Number(prox.valor_pagado) || 0)) : 0;
      } else if (p.modelo === "mes_vencido") {
        nuevoSaldoIntereses = Math.max(0, (Number(p.saldo_intereses) || 0) - intereses);
        valorProximoPago = nuevoSaldoCapital > 0 ? (nuevoSaldoCapital * (Number(p.tasa_nominal) || 0)) : 0;
      }

      let nuevoEstado = "vigente";
      if (nuevoSaldoCapital <= 0) {
        nuevoEstado = "saldado";
        fechaProximoPago = null;
        valorProximoPago = 0;
      } else if (fechaProximoPago && fechaProximoPago < hoy) {
        nuevoEstado = "en_mora";
      }

      // Actualizar préstamo en Supabase (solo columnas válidas de la tabla prestamo)
      await entities.Prestamo.update(p.id, {
        saldo_capital: nuevoSaldoCapital,
        fecha_ultimo_abono: fechaDoc,
        saldo_intereses: p.modelo === "mes_vencido" ? nuevoSaldoIntereses : 0,
        fecha_proximo_pago: fechaProximoPago,
        valor_proximo_pago: valorProximoPago,
        estado: nuevoEstado
      });
    }

    await recalcularSaldos(entities);
    return { success: true, abono };
  }

  // 3. ELIMINAR ABONO
  if (accion === "eliminarAbono") {
    const abonoId = params.abono_id || params.id;
    if (!abonoId) throw new Error("ID de abono requerido");
    const abono = await entities.AbonoPrestamo.get(abonoId);
    if (!abono) return { success: false, error: "Abono no encontrado" };

    // 1. Anular el comprobante contable y sus movimientos
    if (abono.comprobante_id) {
      await anularComprobante(entities, {
        comprobante_id: abono.comprobante_id,
        motivo: params.motivo || "Eliminación de abono Pakredito"
      });
    }

    // 2. Revertir saldo en los préstamos y cuotas
    for (const d of (abono.detalles || [])) {
      const p = await entities.Prestamo.get(d.prestamo_id);
      if (!p) continue;

      const valorAplicado = Number(d.valor_aplicado) || 0;
      const intereses = Number(d.intereses) || 0;
      const capitalAbono = d.capital !== undefined ? Number(d.capital) : Math.max(0, valorAplicado - intereses);

      const saldoRestaurado = (Number(p.saldo_capital) || 0) + capitalAbono;

      let fechaProximoPago = p.fecha_proximo_pago;
      let valorProximoPago = p.valor_proximo_pago;
      let saldoIntereses = p.saldo_intereses || 0;

      if (p.modelo === "cuota_fija") {
        const cuotas = await entities.CuotaAmortizacion.filter({ prestamo_id: p.id });
        for (const c of (cuotas || [])) {
          if (c.abono_id === abono.id) {
            await entities.CuotaAmortizacion.update(c.id, {
              valor_pagado: 0,
              estado: "pendiente",
              fecha_pago: null,
              abono_id: null
            });
          }
        }
        const cuotasActualizadas = await entities.CuotaAmortizacion.filter({ prestamo_id: p.id });
        const prox = (cuotasActualizadas || []).sort((a, b) => a.numero - b.numero).find((c) => c.estado !== "pagada");
        fechaProximoPago = prox ? prox.fecha_vencimiento : null;
        valorProximoPago = prox ? prox.cuota : 0;
      } else if (p.modelo === "mes_vencido") {
        saldoIntereses = (Number(p.saldo_intereses) || 0) + intereses;
        valorProximoPago = saldoRestaurado * (Number(p.tasa_nominal) || 0);
      }

      const nuevoEstado = saldoRestaurado <= 0 ? "saldado" : (fechaProximoPago && fechaProximoPago < hoy ? "en_mora" : "vigente");

      await entities.Prestamo.update(p.id, {
        saldo_capital: saldoRestaurado,
        fecha_proximo_pago: fechaProximoPago,
        valor_proximo_pago: valorProximoPago,
        saldo_intereses: p.modelo === "mes_vencido" ? saldoIntereses : 0,
        estado: nuevoEstado
      });
    }

    // 3. Eliminar el registro AbonoPrestamo
    await entities.AbonoPrestamo.delete(abono.id);

    await recalcularSaldos(entities);
    return { success: true };
  }

  // 4. ELIMINAR PRÉSTAMO
  if (accion === "eliminarPrestamo") {
    const prestamoId = params.prestamo_id || params.id;
    if (!prestamoId) throw new Error("ID de préstamo requerido");
    const p = await entities.Prestamo.get(prestamoId);
    if (!p) return { success: false, error: "Préstamo no encontrado" };

    // 1. Eliminar o anular abonos vinculados a este préstamo
    const todosAbonos = await entities.AbonoPrestamo.filter({ cliente_id: p.cliente_id });
    const abonosDelPrestamo = (todosAbonos || []).filter((a) =>
      (a.detalles || []).some((d) => d.prestamo_id === p.id)
    );

    for (const ab of abonosDelPrestamo) {
      if (ab.comprobante_id) {
        await anularComprobante(entities, {
          comprobante_id: ab.comprobante_id,
          motivo: params.motivo || `Anulación por eliminación de préstamo ${p.codigo}`
        });
      }
      await entities.AbonoPrestamo.delete(ab.id);
    }

    // 2. Anular el comprobante de desembolso
    if (p.comprobante_id) {
      await anularComprobante(entities, {
        comprobante_id: p.comprobante_id,
        motivo: params.motivo || `Eliminación préstamo ${p.codigo}`
      });
    }

    // 3. Eliminar cuotas de amortización
    const cuotas = await entities.CuotaAmortizacion.filter({ prestamo_id: p.id });
    for (const c of (cuotas || [])) {
      await entities.CuotaAmortizacion.delete(c.id);
    }

    // 4. Eliminar el préstamo
    await entities.Prestamo.delete(p.id);

    await recalcularSaldos(entities);
    return { success: true };
  }

  // 5. EDITAR PRÉSTAMO
  if (accion === "editarPrestamo") {
    const prestamoId = params.prestamo_id || params.id;
    const p = await entities.Prestamo.get(prestamoId);
    if (!p) throw new Error("Préstamo no encontrado");

    // Verificar si tiene abonos
    const todosAbonos = await entities.AbonoPrestamo.filter({ cliente_id: p.cliente_id });
    const tieneAbonos = (todosAbonos || []).some((a) =>
      (a.detalles || []).some((d) => d.prestamo_id === p.id)
    );

    const notas = params.notas !== undefined ? params.notas : p.notas;

    if (tieneAbonos) {
      const updated = await entities.Prestamo.update(p.id, { notas });
      return { success: true, prestamo: updated };
    }

    // Si no tiene abonos, se pueden editar los parámetros financieros y recalcular el cronograma
    const tasaNom = params.tasa_nominal !== undefined ? Number(params.tasa_nominal) : Number(p.tasa_nominal);
    const periodo = params.periodo || p.periodo || "mensual";
    const numCuotas = params.numero_cuotas ? Math.max(1, parseInt(params.numero_cuotas, 10)) : p.numero_cuotas;
    const cuotaMan = Number(params.cuota_manual) || 0;
    const fechaPrestamo = params.fecha_prestamo || p.fecha_prestamo;

    const gen = p.modelo === "cuota_fija"
      ? generarAmortizacionCuotaFija(p.capital, tasaNom, periodo, numCuotas, fechaPrestamo, cuotaMan)
      : generarAmortizacionMesVencido(p.capital, tasaNom, numCuotas, fechaPrestamo);

    const tasaNominalFinal = gen.tasa_nominal_derivada !== undefined ? gen.tasa_nominal_derivada : tasaNom;

    // Eliminar cuotas anteriores
    const cuotasPrevias = await entities.CuotaAmortizacion.filter({ prestamo_id: p.id });
    for (const c of (cuotasPrevias || [])) {
      await entities.CuotaAmortizacion.delete(c.id);
    }

    // Crear nuevas cuotas
    for (const c of gen.schedule) {
      await entities.CuotaAmortizacion.create({
        prestamo_id: p.id,
        numero: c.numero,
        fecha_vencimiento: c.fecha_vencimiento,
        cuota: c.cuota,
        interes: c.interes,
        capital_abono: c.capital_abono,
        saldo_capital: c.saldo_capital,
        estado: "pendiente",
        valor_pagado: 0,
        fecha_pago: null,
        abono_id: null
      });
    }

    // Si cambió la fecha de desembolso, actualizar fecha del comprobante y movimientos
    if (fechaPrestamo !== p.fecha_prestamo && p.comprobante_id) {
      await entities.ComprobanteContable.update(p.comprobante_id, { fecha: fechaPrestamo });
      const movs = await entities.MovimientoContable.filter({ comprobante_id: p.comprobante_id });
      for (const m of (movs || [])) {
        await entities.MovimientoContable.update(m.id, {
          fecha: fechaPrestamo,
          periodo_operacion: fechaPrestamo.substring(0, 7)
        });
      }
    }

    const updated = await entities.Prestamo.update(p.id, {
      notas,
      tasa_nominal: tasaNominalFinal,
      periodo: p.modelo === "cuota_fija" ? periodo : "mensual",
      numero_cuotas: numCuotas,
      fecha_prestamo: fechaPrestamo,
      cuota_fija: p.modelo === "cuota_fija" ? gen.cuota : 0,
      tasa_efectiva_periodo: gen.tasa_efectiva_periodo,
      tasa_efectiva_anual: Math.pow(1 + tasaNominalFinal, 12) - 1,
      total_intereses: gen.totalIntereses,
      total_a_pagar: gen.totalAPagar,
      fecha_proximo_pago: gen.schedule[0]?.fecha_vencimiento || null,
      valor_proximo_pago: gen.schedule[0]?.cuota || 0
    });

    await recalcularSaldos(entities);
    return { success: true, prestamo: updated };
  }

  // 6. EDITAR DESEMBOLSO
  if (accion === "editarDesembolso") {
    const prestamoId = params.prestamo_id || params.id;
    const p = await entities.Prestamo.get(prestamoId);
    if (!p) throw new Error("Préstamo no encontrado");

    // Verificar si tiene abonos
    const todosAbonos = await entities.AbonoPrestamo.filter({ cliente_id: p.cliente_id });
    const tieneAbonos = (todosAbonos || []).some((a) =>
      (a.detalles || []).some((d) => d.prestamo_id === p.id)
    );
    if (tieneAbonos) {
      throw new Error("No se puede editar el desembolso porque el préstamo ya registra abonos. Elimine primero los abonos.");
    }

    const movimientos = params.movimientos || [];
    const nuevoCapital = movimientos.reduce((s, m) => s + (Number(m.credito) || 0), 0);
    if (!nuevoCapital || nuevoCapital <= 0) {
      throw new Error("El capital del desembolso debe ser mayor a 0");
    }

    const cliente = await entities.Cliente.get(p.cliente_id);

    // Actualizar el comprobante de desembolso existente
    if (p.comprobante_id) {
      const oldMovs = await entities.MovimientoContable.filter({ comprobante_id: p.comprobante_id });
      for (const om of (oldMovs || [])) {
        await entities.MovimientoContable.delete(om.id);
      }

      let pucList = [];
      try { pucList = await entities.Cuenta.list(); } catch {}
      const pucMap = {};
      (pucList || []).forEach((c) => { pucMap[String(c.codigo)] = c; });

      const movDebito = {
        subcuenta: "120506",
        debito: nuevoCapital,
        credito: 0,
        descripcion: `Capital préstamo Pakredito — ${cliente?.nombre || ""}`,
        tercero: cliente?.nombre || "",
        cliente_id: p.cliente_id,
        comprobante_id: p.comprobante_id,
        clase: "activo",
        grupo: "12",
        cuenta: "1205",
        cuenta_nombre: "PAKREDITO",
        periodo_operacion: p.fecha_prestamo.substring(0, 7),
        fecha: p.fecha_prestamo,
        estado: "activo"
      };
      await entities.MovimientoContable.create(movDebito);

      for (const m of movimientos) {
        const cuentaPuc = pucMap[String(m.subcuenta)] || {};
        await entities.MovimientoContable.create({
          subcuenta: String(m.subcuenta),
          debito: 0,
          credito: Number(m.credito) || 0,
          descripcion: m.descripcion || `Desembolso ${p.codigo}`,
          tercero: m.tercero || cliente?.nombre || "",
          cliente_id: p.cliente_id,
          cuenta_ahorro_id: m.cuenta_ahorro_id || null,
          producto_credito_id: m.producto_credito_id || null,
          tipo_movimiento_tdc: m.tipo_movimiento_tdc || null,
          comprobante_id: p.comprobante_id,
          cuenta_nombre: cuentaPuc.concepto || "",
          clase: cuentaPuc.clase_nombre?.toLowerCase() || "activo",
          grupo: String(cuentaPuc.grupo || ""),
          cuenta: String(cuentaPuc.cuenta || ""),
          periodo_operacion: p.fecha_prestamo.substring(0, 7),
          fecha: p.fecha_prestamo,
          estado: "activo"
        });
      }

      await entities.ComprobanteContable.update(p.comprobante_id, {
        total_debito: nuevoCapital,
        total_credito: nuevoCapital
      });
    }

    // Regenerar amortización con nuevoCapital
    const gen = p.modelo === "cuota_fija"
      ? generarAmortizacionCuotaFija(nuevoCapital, p.tasa_nominal, p.periodo, p.numero_cuotas, p.fecha_prestamo, p.cuota_fija)
      : generarAmortizacionMesVencido(nuevoCapital, p.tasa_nominal, p.numero_cuotas, p.fecha_prestamo);

    // Reemplazar cuotas
    const cuotasPrevias = await entities.CuotaAmortizacion.filter({ prestamo_id: p.id });
    for (const c of (cuotasPrevias || [])) {
      await entities.CuotaAmortizacion.delete(c.id);
    }
    for (const c of gen.schedule) {
      await entities.CuotaAmortizacion.create({
        prestamo_id: p.id,
        numero: c.numero,
        fecha_vencimiento: c.fecha_vencimiento,
        cuota: c.cuota,
        interes: c.interes,
        capital_abono: c.capital_abono,
        saldo_capital: c.saldo_capital,
        estado: "pendiente",
        valor_pagado: 0,
        fecha_pago: null,
        abono_id: null
      });
    }

    // Actualizar préstamo
    const updated = await entities.Prestamo.update(p.id, {
      capital: nuevoCapital,
      saldo_capital: nuevoCapital,
      cuota_fija: p.modelo === "cuota_fija" ? gen.cuota : 0,
      tasa_efectiva_periodo: gen.tasa_efectiva_periodo,
      total_intereses: gen.totalIntereses,
      total_a_pagar: gen.totalAPagar,
      fecha_proximo_pago: gen.schedule[0]?.fecha_vencimiento || null,
      valor_proximo_pago: gen.schedule[0]?.cuota || 0
    });

    await recalcularSaldos(entities);
    return { success: true, prestamo: updated };
  }

  // 7. RECALCULAR ESTADO
  if (accion === "recalcularEstado") {
    const prestamos = await entities.Prestamo.list("-created_date", 2000);
    let count = 0;

    for (const p of (prestamos || [])) {
      if (Number(p.saldo_capital) <= 0) {
        if (p.estado !== "saldado") {
          await entities.Prestamo.update(p.id, {
            estado: "saldado",
            fecha_proximo_pago: null,
            valor_proximo_pago: 0
          });
          count++;
        }
        continue;
      }

      if (p.modelo === "cuota_fija") {
        const cuotas = await entities.CuotaAmortizacion.filter({ prestamo_id: p.id });
        const prox = (cuotas || []).sort((a, b) => a.numero - b.numero).find((c) => c.estado !== "pagada");
        const enMora = prox && prox.fecha_vencimiento < hoy;
        const nuevoEstado = enMora ? "en_mora" : "vigente";
        const nuevaFechaProx = prox ? prox.fecha_vencimiento : p.fecha_proximo_pago;
        const nuevoValorProx = prox ? Math.max(0, (Number(prox.cuota) || 0) - (Number(prox.valor_pagado) || 0)) : p.valor_proximo_pago;

        if (p.estado !== nuevoEstado || p.fecha_proximo_pago !== nuevaFechaProx || p.valor_proximo_pago !== nuevoValorProx) {
          await entities.Prestamo.update(p.id, {
            estado: nuevoEstado,
            fecha_proximo_pago: nuevaFechaProx,
            valor_proximo_pago: nuevoValorProx
          });
          count++;
        }
      } else if (p.modelo === "mes_vencido") {
        const fechaBase = p.fecha_ultimo_abono || p.fecha_prestamo || hoy;
        const est = estimarInteresesMesVencido(p.saldo_capital, p.tasa_nominal, fechaBase, hoy);
        const enMora = p.fecha_proximo_pago && p.fecha_proximo_pago < hoy;
        const nuevoEstado = enMora ? "en_mora" : "vigente";
        const nuevoInteres = Math.round(est.intereses);

        if (p.estado !== nuevoEstado || Number(p.saldo_intereses) !== nuevoInteres) {
          await entities.Prestamo.update(p.id, {
            estado: nuevoEstado,
            saldo_intereses: nuevoInteres
          });
          count++;
        }
      }
    }

    return { success: true, actualizados: count };
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

export async function recalcularSaldos(entities) {
  const comprobantes = await entities.ComprobanteContable.list("-fecha", 10000);
  const compValido = new Set((comprobantes || []).filter((c) => c.estado === "contabilizado").map((c) => c.id));
  const idsNotasAnulacion = new Set(
    (comprobantes || []).filter((c) => c.tipo === "nota_credito" && c.comprobante_origen_id).map((c) => c.id)
  );

  const movs = await entities.MovimientoContable.list("-fecha", 20000);
  const activos = (movs || []).filter(
    (m) => m.estado === "activo" && compValido.has(m.comprobante_id) && !idsNotasAnulacion.has(m.comprobante_id)
  );

  const mesActual = new Date().toISOString().substring(0, 7);
  const saldosPorSubcuenta = {};
  const saldosProd = {};

  for (const m of activos) {
    const debito = Number(m.debito) || 0;
    const credito = Number(m.credito) || 0;
    const sub = String(m.subcuenta);
    if (!saldosPorSubcuenta[sub]) saldosPorSubcuenta[sub] = { debito: 0, credito: 0, acumMes: 0 };
    saldosPorSubcuenta[sub].debito += debito;
    saldosPorSubcuenta[sub].credito += credito;
    if (credito > 0 && m.periodo_operacion === mesActual) {
      saldosPorSubcuenta[sub].acumMes += credito;
    }
    if (m.producto_credito_id) {
      if (!saldosProd[m.producto_credito_id]) saldosProd[m.producto_credito_id] = { debito: 0, credito: 0 };
      saldosProd[m.producto_credito_id].debito += debito;
      saldosProd[m.producto_credito_id].credito += credito;
    }
  }

  const cdas = await entities.CuentaAhorro.list();
  let cdasActualizados = 0;
  for (const cda of (cdas || [])) {
    const s = saldosPorSubcuenta[String(cda.subcuenta_puc)] || { debito: 0, credito: 0, acumMes: 0 };
    const nuevoSaldo = Math.round((s.debito - s.credito) * 100) / 100;
    const nuevoAcum = Math.round(s.acumMes);
    if (Number(cda.saldo) !== nuevoSaldo || Number(cda.movimientos_mes_acumulado || 0) !== nuevoAcum) {
      await entities.CuentaAhorro.update(cda.id, {
        saldo: nuevoSaldo,
        movimientos_mes_acumulado: nuevoAcum
      });
      cdasActualizados++;
    }
  }

  const productos = await entities.ProductoCredito.list();
  let prodsActualizados = 0;
  for (const p of (productos || [])) {
    const s = saldosProd[p.id] || { debito: 0, credito: 0 };
    const esPasivo = p.tipo === "TDC";
    const nuevoSaldo = Math.round((esPasivo ? (s.credito - s.debito) : (s.debito - s.credito)) * 100) / 100;
    if (Number(p.saldo) !== nuevoSaldo) {
      await entities.ProductoCredito.update(p.id, { saldo: nuevoSaldo });
      prodsActualizados++;
    }
  }

  return {
    ok: true,
    cdas_actualizados: cdasActualizados,
    productos_actualizados: prodsActualizados,
    total_cdas: (cdas || []).length,
    total_productos: (productos || []).length
  };
}

export async function calcularEstadoExtractos(entities, payload = {}) {
  const { producto_id, producto_ids } = payload || {};
  const query = { estado: "pendiente_pago" };
  if (producto_id) {
    query.producto_id = producto_id;
  } else if (producto_ids && producto_ids.length > 0) {
    query.producto_id = { $in: producto_ids };
  }

  const extractos = await entities.ExtractoProducto.filter(query);
  const today = new Date().toISOString().substring(0, 10);
  const warnings = [];
  const resultados = [];

  for (const ext of (extractos || [])) {
    const prod = await entities.ProductoCredito.get(ext.producto_id);
    const fechaCorte = Math.floor(prod?.fecha_corte || 1);
    const periodo = ext.periodo || "";
    const [anioP, mesP] = periodo.split("-").map(Number);

    let inicio, fin;
    if (anioP && mesP) {
      let cAnio = anioP, cMes = mesP - 1;
      if (cMes === 0) { cMes = 12; cAnio -= 1; }
      inicio = `${cAnio}-${String(cMes).padStart(2, "0")}-${String(fechaCorte).padStart(2, "0")}`;
      const proximoCorte = `${anioP}-${String(mesP).padStart(2, "0")}-${String(fechaCorte).padStart(2, "0")}`;
      fin = today < proximoCorte ? today : proximoCorte;
    } else {
      inicio = today;
      fin = today;
    }

    const batch = await entities.MovimientoContable.filter({
      producto_credito_id: ext.producto_id,
      tipo_movimiento_tdc: "abono",
      estado: "activo",
      fecha: { $gte: inicio, $lte: fin }
    }, "-fecha", 1000);

    let totalAbonado = 0;
    for (const m of (batch || [])) {
      totalAbonado += Number(m.debito) || 0;
    }
    totalAbonado = parseAndRoundCOP(totalAbonado, 2);

    const saldoPagar = parseAndRoundCOP(ext.saldo_a_pagar, 2);
    let saldoPendiente = parseAndRoundCOP(saldoPagar - totalAbonado, 2);
    if (Math.abs(saldoPendiente) < 0.01) saldoPendiente = 0;
    const sinDeuda = saldoPagar === 0;
    let porcentajePagado = saldoPagar > 0 ? parseAndRoundCOP((totalAbonado / saldoPagar) * 100, 2) : (sinDeuda ? 100 : 0);
    if (porcentajePagado > 100 && Math.abs(saldoPendiente) < 0.01) porcentajePagado = 100;
    const saldoAFavor = saldoPendiente < 0 ? parseAndRoundCOP(Math.abs(saldoPendiente), 2) : 0;
    const nuevoEstado = (sinDeuda || (saldoPagar > 0 && saldoPendiente <= 0)) ? "pagado" : ext.estado;

    const updateData = {
      total_abonado: totalAbonado,
      saldo_pendiente: saldoPendiente,
      porcentaje_pagado: porcentajePagado,
      saldo_a_favor: saldoAFavor
    };
    if (nuevoEstado === "pagado" && ext.estado !== "pagado") {
      updateData.estado = "pagado";
      updateData.pagado_automaticamente = true;
      updateData.fecha_pago_efectivo = today;
    }
    await entities.ExtractoProducto.update(ext.id, updateData);
    resultados.push({
      extracto_id: ext.id,
      producto_id: ext.producto_id,
      total_abonado: totalAbonado,
      saldo_pendiente: saldoPendiente,
      porcentaje_pagado: porcentajePagado
    });
  }

  return { resultados, warnings };
}

export async function procesarCargaMasiva(entities, payload = {}) {
  const { movimientos: rows = [] } = payload || {};
  if (!rows || rows.length === 0) {
    return {
      error: "No se recibieron movimientos",
      total_comprobantes: 0,
      creados: 0,
      fallidos: 0,
      resultados: [],
      errores: []
    };
  }

  const grupos = {};
  const ordenGrupos = [];
  for (const row of rows) {
    const num = String(row.comprobante_numero || '1');
    if (!grupos[num]) { grupos[num] = []; ordenGrupos.push(num); }
    grupos[num].push(row);
  }

  const resultados = [];
  const errores = [];

  for (const num of ordenGrupos) {
    try {
      const groupRows = grupos[num];
      const fecha = groupRows[0]?.fecha || new Date().toISOString().split('T')[0];
      const descripcion = groupRows[0]?.descripcion || `Carga Masiva ${num}`;
      const movs = groupRows.map(r => ({
        subcuenta: String(r.subcuenta || ''),
        debito: Number(r.debito) || 0,
        credito: Number(r.credito) || 0,
        descripcion: r.descripcion || descripcion,
        tercero: r.tercero || '',
        cliente_id: r.cliente_id || '',
        producto_credito_id: r.producto_credito_id || '',
        cuenta_ahorro_id: r.cuenta_ahorro_id || '',
        tipo_movimiento_tdc: r.tipo_movimiento_tdc || null,
        periodo_extracto: r.periodo_extracto || ''
      }));

      const res = await createComprobante(entities, {
        fecha,
        descripcion,
        tipo: 'diario',
        movimientos: movs
      });
      resultados.push({
        comprobante_numero: num,
        numero_generado: res.comprobante?.numero,
        total: res.comprobante?.total_debito || 0,
        movimientos: movs.length
      });
    } catch (err) {
      errores.push({ comprobante_numero: num, error: err.message });
    }
  }

  return {
    total_comprobantes: ordenGrupos.length,
    creados: resultados.length,
    fallidos: errores.length,
    resultados,
    errores
  };
}

export async function conciliarExtracto(entities, payload = {}) {
  const action = payload.action;
  const extractoId = payload.extracto_id;

  if (action === "iniciarConciliacion") {
    const ext = (await entities.ExtractoProducto.get(extractoId)) || { id: extractoId };
    const lineasBanco = (await entities.LineaExtracto.filter({ extracto_id: extractoId })) || [];
    const movs = (await entities.MovimientoContable.filter({
      producto_credito_id: ext.producto_id,
      estado: "activo"
    })) || [];
    const sumaCreditos = movs.reduce((s, m) => s + (Number(m.credito) || 0), 0);
    const sumaDebitos = movs.reduce((s, m) => s + (Number(m.debito) || 0), 0);
    const saldoSistema = parseAndRoundCOP(sumaCreditos - sumaDebitos, 2);
    const saldoAnterior = parseAndRoundCOP(ext.saldo_anterior, 2);
    let diferencia = parseAndRoundCOP((Number(ext.saldo_a_pagar) || 0) - saldoAnterior - saldoSistema, 2);
    if (Math.abs(diferencia) < 0.01) diferencia = 0;

    return {
      extracto: { ...ext, saldo_sistema: saldoSistema, diferencia_saldo: diferencia },
      movimientos_sistema: movs,
      lineas_banco: lineasBanco,
      saldo_banco: ext.saldo_a_pagar || 0,
      saldo_sistema: saldoSistema,
      diferencia_saldo: diferencia,
      saldo_anterior: saldoAnterior,
      fecha_inicio_rango: ext.fecha_inicio || ext.fecha_corte,
      fecha_fin_rango: ext.fecha_corte
    };
  }

  if (action === "compararMovimientos") {
    const lineasBanco = (await entities.LineaExtracto.filter({ extracto_id: extractoId })) || [];
    const ext = (await entities.ExtractoProducto.get(extractoId)) || { id: extractoId };
    const movs = (await entities.MovimientoContable.filter({
      producto_credito_id: ext.producto_id,
      estado: "activo"
    })) || [];

    const conciliados = [];
    const faltantes = [];
    const sobrantes = [...movs];

    for (const lb of lineasBanco) {
      const matchIdx = sobrantes.findIndex(m => Math.abs((Number(m.debito || m.credito) || 0) - Number(lb.valor)) < 1.0);
      if (matchIdx !== -1) {
        conciliados.push({ linea_banco: lb, movimiento_sistema: sobrantes[matchIdx] });
        sobrantes.splice(matchIdx, 1);
      } else {
        faltantes.push(lb);
      }
    }

    return {
      conciliados,
      faltantes,
      sobrantes,
      diferencias: [],
      resumen: {
        total_banco: lineasBanco.length,
        total_sistema: movs.length,
        diferencia_saldo: parseAndRoundCOP(ext.diferencia_saldo || 0, 2),
        porcentaje_conciliado: lineasBanco.length > 0 ? Math.round((conciliados.length / lineasBanco.length) * 100) : 0
      }
    };
  }

  if (action === "crearMovimientoFaltante") {
    const { linea_banco_id, contrapartida_subcuenta, descripcion_adicional } = payload;
    const linea = await entities.LineaExtracto.get(linea_banco_id);
    if (!linea) throw new Error("Línea de banco no encontrada");
    const ext = await entities.ExtractoProducto.get(linea.extracto_id);
    const prod = await entities.ProductoCredito.get(linea.producto_id);

    const esCargo = linea.naturaleza === "cargo";
    const subcuentaContra = contrapartida_subcuenta || (esCargo ? "510502" : "111005");
    const movs = [
      {
        subcuenta: prod?.subcuenta_puc || "211001",
        debito: esCargo ? 0 : linea.valor,
        credito: esCargo ? linea.valor : 0,
        descripcion: linea.descripcion + (descripcion_adicional ? ` - ${descripcion_adicional}` : ""),
        producto_credito_id: prod?.id,
        tipo_movimiento_tdc: esCargo ? linea.tipo : "abono",
        periodo_extracto: ext?.periodo
      },
      {
        subcuenta: subcuentaContra,
        debito: esCargo ? linea.valor : 0,
        credito: esCargo ? 0 : linea.valor,
        descripcion: linea.descripcion
      }
    ];

    const res = await createComprobante(entities, {
      fecha: linea.fecha,
      tipo: "diario",
      descripcion: `Ajuste conciliación - ${linea.descripcion}`,
      movimientos: movs
    });

    await entities.LineaExtracto.update(linea_banco_id, {
      estado_conciliacion: "conciliado",
      movimiento_sistema_id: res.movimientos?.[0]?.id || ""
    });

    return { comprobante: res.comprobante, movimiento_creado: res.movimientos?.[0] };
  }

  if (action === "ajustarAlPeso") {
    const ext = await entities.ExtractoProducto.get(extractoId);
    const prod = await entities.ProductoCredito.get(ext.producto_id);
    const diff = parseAndRoundCOP(Math.abs(Number(ext.diferencia_saldo) || 0), 2);

    const res = await createComprobante(entities, {
      fecha: ext.fecha_corte || new Date().toISOString().split('T')[0],
      tipo: "diario",
      descripcion: `Ajuste al peso - conciliación ${ext.periodo} - ${prod?.nombre || ''}`,
      movimientos: [
        { subcuenta: prod?.subcuenta_puc || "211001", debito: 0, credito: diff, descripcion: `Ajuste al peso`, producto_credito_id: prod?.id },
        { subcuenta: "510502", debito: diff, credito: 0, descripcion: `Ajuste residual ${ext.periodo}` }
      ]
    });

    await entities.ExtractoProducto.update(extractoId, { diferencia_saldo: 0 });
    return { comprobante: res.comprobante, diferencia_ajustada: diff };
  }

  if (action === "cerrarConciliacion") {
    await entities.ExtractoProducto.update(extractoId, {
      estado_conciliacion: "cerrado",
      fecha_conciliacion: new Date().toISOString().substring(0, 10)
    });
    return { extracto_cerrado: extractoId, cerrado_ok: true };
  }

  if (action === "eliminarConciliacion") {
    await entities.ExtractoProducto.delete(extractoId);
    return { extracto_eliminado: extractoId };
  }

  return { success: true };
}

export async function procesarExtractoPDF(entities, payload = {}) {
  const action = payload.action || "extraer";

  if (action === "extraer") {
    const { file_base64, file_name } = payload;
    let data = null;

    if (file_base64) {
      try {
        data = await extraerDatosExtractoConIA({
          fileBase64: file_base64,
          fileName: file_name,
          onStatusUpdate: payload.onStatusUpdate
        });
      } catch (err) {
        console.error("Extracción multimodal con Gemini falló:", err);
        throw new Error(err.message || "Error al procesar el archivo con inteligencia artificial.");
      }
    }

    if (!data) {
      const bancoDefault = detectarBanco(file_name || "");
      const hoy = new Date().toISOString().substring(0, 10);
      data = {
        banco: bancoDefault.name,
        numero_tarjeta: "",
        titular: "",
        periodo: hoy.substring(0, 7),
        fecha_corte: hoy,
        fecha_corte_anterior: "",
        fecha_pago: hoy,
        saldo_anterior: 0,
        saldo_a_pagar: 0,
        pago_minimo: 0,
        cupo_total: 0,
        cupo_disponible: 0,
        movimientos: [],
        resumen_cargos: []
      };
    }

    const banco = detectarBanco(data.banco || file_name || "");
    const fechaCorte = normalizeDate(data.fecha_corte) || new Date().toISOString().substring(0, 10);
    const fechaPago = restarUnDia(normalizeDate(data.fecha_pago)) || fechaCorte;
    const fechaCorteAnterior = normalizeDate(data.fecha_corte_anterior) || "";
    const periodo = data.periodo ? String(data.periodo).substring(0, 7) : (fechaCorte ? fechaCorte.substring(0, 7) : "");

    // Detección robusta del número completo y los últimos 4 dígitos
    const numTarjetaRaw = String(data.numero_tarjeta || data.numero_producto || data.numero_obligacion || "").trim();
    let last4 = "";
    if (data.ultimos_4_digitos && String(data.ultimos_4_digitos).replace(/\D/g, "").length === 4) {
      last4 = String(data.ultimos_4_digitos).replace(/\D/g, "");
    } else {
      const allDigits = numTarjetaRaw.replace(/\D/g, "");
      if (allDigits.length >= 4) {
        last4 = allDigits.slice(-4);
      } else {
        const matchDigits = numTarjetaRaw.match(/\b\d{4}\b/g);
        if (matchDigits && matchDigits.length > 0) {
          last4 = matchDigits[matchDigits.length - 1];
        }
      }
    }

    // Sanitizar y redondear movimientos a máx 2 decimales (pesos colombianos)
    const movimientos = (data.movimientos || [])
      .map((m) => {
        const val = parseAndRoundCOP(m.valor, 2);
        const tipo = (m.tipo || "compra").toLowerCase();
        return {
          fecha: normalizeDate(m.fecha) || fechaCorte,
          descripcion: String(m.descripcion || "").trim(),
          valor: Math.abs(val),
          tipo,
          naturaleza: tipo === "abono" ? "abono" : "cargo"
        };
      })
      .filter((m) => m.valor > 0 && !esLineaSubtotal(m.descripcion) && !esCuotaPosterior(m.descripcion));

    // Sanitizar y redondear cargos financieros a máx 2 decimales
    const cargosFinancieros = (data.resumen_cargos || [])
      .map((c) => {
        const val = parseAndRoundCOP(c.valor, 2);
        const concepto = String(c.concepto || "").trim();
        return {
          fecha: normalizeDate(c.fecha) || fechaCorte,
          descripcion: concepto,
          valor: Math.abs(val),
          tipo: "financiero",
          naturaleza: "cargo",
          subcuenta_gasto: subcuentaParaCargo(concepto)
        };
      })
      .filter((c) => c.valor > 0 && !esLineaSubtotal(c.descripcion));

    // Evitar duplicados de cargos financieros que ya estén en movimientos
    const todasLineas = [...movimientos];
    for (const cf of cargosFinancieros) {
      const yaExiste = movimientos.some((m) =>
        m.valor === cf.valor &&
        m.tipo === "financiero" &&
        (m.descripcion.toLowerCase().includes(cf.descripcion.toLowerCase().substring(0, 8)) ||
         cf.descripcion.toLowerCase().includes(m.descripcion.toLowerCase().substring(0, 8)))
      );
      if (!yaExiste) todasLineas.push(cf);
    }

    // Categorizar cargos financieros para ExtractoProducto
    const cargosCategorizados = {
      cuota_manejo: 0, cuota_manejo_fecha: "",
      seguros: 0, seguros_fecha: "",
      intereses_corrientes: 0, intereses_corrientes_fecha: "",
      intereses_mora: 0, intereses_mora_fecha: "",
      comisiones: 0, comisiones_fecha: "",
      otros_gastos: 0, otros_gastos_fecha: "",
      rendimientos: 0, rendimientos_fecha: "",
      cashback: 0, cashback_fecha: ""
    };

    for (const cf of cargosFinancieros) {
      const cat = categorizarCargo(cf.descripcion);
      if (cargosCategorizados[cat] !== undefined) {
        cargosCategorizados[cat] = parseAndRoundCOP(cargosCategorizados[cat] + cf.valor, 2);
        if (!cargosCategorizados[cat + "_fecha"]) cargosCategorizados[cat + "_fecha"] = cf.fecha;
      }
    }

    // Match inteligente con productos de crédito y cuentas activas
    const productos = await entities.ProductoCredito.list();
    const productosActivos = (productos || []).filter((p) => p.estado === "activo");

    let cuentasPuc = [];
    try {
      cuentasPuc = await entities.Cuenta.list();
    } catch {
      cuentasPuc = [];
    }

    let productoMatch = null;
    let matchReason = "";

    if (last4) {
      const regexLast4 = new RegExp(`(?:^|\\D)${last4}(?:\\D|$)`);
      const normCard = numTarjetaRaw.replace(/\D/g, "");

      // 1. Coincidencia por número completo o enmascarado si existe en numero_completo
      if (normCard.length >= 8) {
        const porNumeroCompleto = productosActivos.find((p) => {
          const pnc = String(p.numero_completo || "").replace(/\D/g, "");
          return pnc && (pnc === normCard || normCard.endsWith(pnc) || pnc.endsWith(normCard));
        });
        if (porNumeroCompleto) {
          productoMatch = porNumeroCompleto;
          matchReason = `Número completo coincidente (${numTarjetaRaw})`;
        }
      }

      // 2. Coincidencia directa por nombre canónico de cuenta/tarjeta (ej: "TDC - 5513", "TDC-5513", "TDC 5513")
      if (!productoMatch) {
        const porNombreCanonico = productosActivos.find((p) => {
          const pNom = String(p.nombre || "").trim().toLowerCase();
          return (
            pNom === `tdc - ${last4}`.toLowerCase() ||
            pNom === `tdc-${last4}`.toLowerCase() ||
            pNom === `tdc ${last4}`.toLowerCase()
          );
        });
        if (porNombreCanonico) {
          productoMatch = porNombreCanonico;
          matchReason = `Coincidencia por nombre '${porNombreCanonico.nombre}'`;
        }
      }

      // 3. Coincidencia por banco + nombre o nomenclatura que contenga los 4 dígitos
      if (!productoMatch && banco.code) {
        const porBancoYDigitos = productosActivos.find((p) =>
          p.banco === banco.code && (
            regexLast4.test(p.nombre || "") ||
            regexLast4.test(p.nomenclatura || "") ||
            String(p.nomenclatura || "").replace(/\D/g, "").endsWith(last4) ||
            String(p.numero_completo || "").replace(/\D/g, "").endsWith(last4)
          )
        );
        if (porBancoYDigitos) {
          productoMatch = porBancoYDigitos;
          matchReason = `Banco (${banco.name || banco.code}) y terminación ${last4}`;
        }
      }

      // 4. Coincidencia por nombre o nomenclatura en cualquier producto activo
      if (!productoMatch) {
        const porCualquierNombre = productosActivos.find((p) =>
          regexLast4.test(p.nombre || "") ||
          regexLast4.test(p.nomenclatura || "") ||
          String(p.nomenclatura || "").replace(/\D/g, "").endsWith(last4) ||
          String(p.numero_completo || "").replace(/\D/g, "").endsWith(last4) ||
          (p.codigo_interno && regexLast4.test(p.codigo_interno))
        );
        if (porCualquierNombre) {
          productoMatch = porCualquierNombre;
          matchReason = `Coincidencia de 4 dígitos (${last4}) con '${porCualquierNombre.nombre}'`;
        }
      }

      // 5. Coincidencia a través de Cuenta contable PUC (ej: cuenta con concepto "TDC - 5513")
      if (!productoMatch && cuentasPuc.length > 0) {
        const cuentaPuc = cuentasPuc.find((c) =>
          regexLast4.test(c.concepto || "") ||
          String(c.concepto || "").toLowerCase().includes(`tdc - ${last4}`.toLowerCase())
        );
        if (cuentaPuc) {
          const porPuc = productosActivos.find((p) =>
            String(p.subcuenta_puc) === String(cuentaPuc.codigo)
          );
          if (porPuc) {
            productoMatch = porPuc;
            matchReason = `Vinculado vía cuenta PUC '${cuentaPuc.concepto}'`;
          }
        }
      }
    }

    const totalCargos = parseAndRoundCOP(
      todasLineas.filter((l) => l.naturaleza === "cargo").reduce((s, l) => s + l.valor, 0),
      2
    );
    const totalAbonos = parseAndRoundCOP(
      todasLineas.filter((l) => l.naturaleza === "abono").reduce((s, l) => s + l.valor, 0),
      2
    );

    return {
      banco_detectado: banco,
      cargos_categorizados: cargosCategorizados,
      tarjeta: numTarjetaRaw || (last4 ? `****${last4}` : "No identificada"),
      last4,
      titular: data.titular || "Titular de tarjeta",
      periodo,
      fecha_corte: fechaCorte,
      fecha_corte_anterior: fechaCorteAnterior,
      fecha_pago: fechaPago,
      saldo_anterior: parseAndRoundCOP(data.saldo_anterior, 2),
      saldo_a_pagar: parseAndRoundCOP(data.saldo_a_pagar, 2),
      pago_minimo: parseAndRoundCOP(data.pago_minimo, 2),
      cupo_total: parseAndRoundCOP(data.cupo_total, 2),
      cupo_disponible: parseAndRoundCOP(data.cupo_disponible, 2),
      lineas: todasLineas,
      total_cargos: totalCargos,
      total_abonos: totalAbonos,
      producto_match: productoMatch ? {
        id: productoMatch.id,
        nombre: productoMatch.nombre,
        banco: productoMatch.banco,
        nomenclatura: productoMatch.nomenclatura,
        match_reason: matchReason
      } : null,
      productos_disponibles: productosActivos.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        banco: p.banco,
        nomenclatura: p.nomenclatura
      }))
    };
  }

  if (action === "confirmar") {
    const {
      producto_id,
      periodo,
      fecha_corte,
      fecha_corte_anterior,
      fecha_pago,
      saldo_a_pagar,
      saldo_anterior,
      lineas = [],
      cargos_categorizados = {},
      observaciones,
      cargos_destino = {}
    } = payload;

    if (!producto_id || !periodo) {
      throw new Error("producto_id y periodo son requeridos para confirmar el extracto.");
    }

    // Verificar si ya existe extracto para este producto y período
    const existing = await entities.ExtractoProducto.filter({ producto_id, periodo });
    if (existing && existing.length > 0) {
      throw new Error(`Ya existe un extracto para el período ${periodo} de este producto. Elimina el extracto existente antes de cargar uno nuevo, o asigna un período diferente.`);
    }

    const saldoFinal = parseAndRoundCOP(saldo_a_pagar, 2);
    const saldoAnt = parseAndRoundCOP(saldo_anterior, 2);
    const sinDeuda = saldoFinal === 0;
    const today = new Date().toISOString().substring(0, 10);

    const camposFinancieros = {
      cuota_manejo: parseAndRoundCOP(cargos_categorizados.cuota_manejo, 2),
      cuota_manejo_fecha: cargos_categorizados.cuota_manejo_fecha || "",
      seguros: parseAndRoundCOP(cargos_categorizados.seguros, 2),
      seguros_fecha: cargos_categorizados.seguros_fecha || "",
      intereses_corrientes: parseAndRoundCOP(cargos_categorizados.intereses_corrientes, 2),
      intereses_corrientes_fecha: cargos_categorizados.intereses_corrientes_fecha || "",
      intereses_mora: parseAndRoundCOP(cargos_categorizados.intereses_mora, 2),
      intereses_mora_fecha: cargos_categorizados.intereses_mora_fecha || "",
      comisiones: parseAndRoundCOP(cargos_categorizados.comisiones, 2),
      comisiones_fecha: cargos_categorizados.comisiones_fecha || "",
      otros_gastos: parseAndRoundCOP(cargos_categorizados.otros_gastos, 2),
      otros_gastos_fecha: cargos_categorizados.otros_gastos_fecha || "",
      rendimientos: parseAndRoundCOP(cargos_categorizados.rendimientos, 2),
      rendimientos_fecha: cargos_categorizados.rendimientos_fecha || "",
      cashback: parseAndRoundCOP(cargos_categorizados.cashback, 2),
      cashback_fecha: cargos_categorizados.cashback_fecha || ""
    };

    const extractoCreado = await entities.ExtractoProducto.create({
      producto_id,
      periodo,
      fecha_corte: fecha_corte || "",
      fecha_corte_anterior: fecha_corte_anterior || "",
      fecha_pago: fecha_pago || "",
      saldo_a_pagar: saldoFinal,
      saldo_anterior: saldoAnt,
      observaciones: observaciones || "",
      ...camposFinancieros,
      estado: sinDeuda ? "pagado" : "pendiente_pago",
      estado_conciliacion: "sin_iniciar",
      total_lineas_banco: lineas.length,
      total_abonado: 0,
      saldo_pendiente: saldoFinal,
      porcentaje_pagado: sinDeuda ? 100 : 0,
      pagado_automaticamente: sinDeuda,
      fecha_pago_efectivo: sinDeuda ? today : "",
      saldo_a_favor: 0,
      saldo_sistema: 0,
      diferencia_saldo: 0
    });

    // Guardar las líneas del extracto en la tabla LineaExtracto
    const lineasCreadas = [];
    for (const l of lineas) {
      let subcuentaGasto = l.subcuenta_gasto || "";
      let destinoCargo = "gasto";
      let estadoConc = "sin_conciliar";
      let notasLinea = l.notas || "";

      if (l.tipo === "financiero" && cargos_destino) {
        const cat = categorizarCargo(l.descripcion);
        const decision = cargos_destino[cat];
        if (decision) {
          destinoCargo = decision.destino;
          if (decision.destino === "otra_cuenta" && decision.subcuenta) {
            subcuentaGasto = decision.subcuenta;
          } else if (decision.destino === "no_registrar") {
            estadoConc = "conciliado";
            notasLinea = "No registrar — decisión usuario al cargar extracto";
          }
        }
      }

      const lineaValor = parseAndRoundCOP(l.valor, 2);
      const lineaObj = await entities.LineaExtracto.create({
        extracto_id: extractoCreado.id,
        producto_id,
        fecha: l.fecha || fecha_corte,
        descripcion: (l.descripcion || "").trim(),
        tipo: l.tipo || "compra",
        valor: lineaValor,
        naturaleza: l.naturaleza || (l.tipo === "abono" ? "abono" : "cargo"),
        subcuenta_gasto: subcuentaGasto || subcuentaParaCargo(l.descripcion),
        destino_cargo: destinoCargo,
        estado_conciliacion: estadoConc,
        notas: notasLinea
      });
      lineasCreadas.push(lineaObj);
    }

    return {
      success: true,
      extracto: extractoCreado,
      total_lineas: lineasCreadas.length
    };
  }

  return { success: true };
}
