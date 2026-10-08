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
  estimarInteresesMesVencido,
  sumarPeriodo,
  calcularSaldoTotalDeber,
  reconciliarCuotasConAbonos
} from "../lib/pakredito";
import { calcularNextCodigo, getClaseNombre } from "../lib/cuentasPuc";
import { formatCOP } from "../lib/contabilidad";

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
    if (c.estado === "anulado") continue;
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
  const cleanFecha = normalizeDate(fecha) || new Date().toISOString().split('T')[0];
  const year = cleanFecha ? parseInt(cleanFecha.substring(0, 4), 10) : new Date().getFullYear();
  
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
    fecha: cleanFecha,
    tipo,
    descripcion,
    estado: "contabilizado",
    total_debito: debitoTotal,
    total_credito: creditoTotal,
    soporte_url
  });

  const createdMovs = [];
  let pucList = [];
  let prodsList = [];
  let cdasList = [];
  try {
    [pucList, prodsList, cdasList] = await Promise.all([
      entities.Cuenta.list(),
      entities.ProductoCredito.list().catch(() => []),
      entities.CuentaAhorro.list().catch(() => [])
    ]);
  } catch {
    pucList = [];
  }
  const pucMap = {};
  (pucList || []).forEach((c) => { pucMap[String(c.codigo)] = c; });
  const prodBySubcuenta = {};
  (prodsList || []).forEach((p) => { if (p.subcuenta_puc) prodBySubcuenta[String(p.subcuenta_puc).trim()] = p; });
  const cdaBySubcuenta = {};
  (cdasList || []).forEach((c) => { if (c.subcuenta_puc) cdaBySubcuenta[String(c.subcuenta_puc).trim()] = c; });

  const periodoOp = cleanFecha.substring(0, 7);

  for (const m of movimientos) {
    const subStr = String(m.subcuenta || "").trim();
    const cuentaPuc = pucMap[subStr] || {};
    let prodId = m.producto_credito_id || null;
    let cdaId = m.cuenta_ahorro_id || null;
    if (!prodId && subStr && prodBySubcuenta[subStr]) {
      prodId = prodBySubcuenta[subStr].id;
    }
    if (!cdaId && subStr && cdaBySubcuenta[subStr]) {
      cdaId = cdaBySubcuenta[subStr].id;
    }

    const mov = await entities.MovimientoContable.create({
      ...m,
      comprobante_id: comprobante.id,
      producto_credito_id: prodId,
      cuenta_ahorro_id: cdaId,
      cuenta_nombre: m.cuenta_nombre || prodBySubcuenta[subStr]?.nombre || cdaBySubcuenta[subStr]?.nombre || cuentaPuc.concepto || "",
      clase: m.clase || cuentaPuc.clase || (cuentaPuc.tipo_naturaleza || "activo"),
      grupo: m.grupo || String(cuentaPuc.grupo || ""),
      cuenta: m.cuenta || String(cuentaPuc.cuenta || ""),
      periodo_operacion: periodoOp,
      estado: "activo",
      fecha: cleanFecha
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
  if (!comp) {
    const movs = await entities.MovimientoContable.filter({ comprobante_id });
    for (const m of movs) {
      await entities.MovimientoContable.update(m.id, { estado: "anulado" });
    }
    return { success: true, advertencia: "Comprobante no encontrado en cabecera; movimientos anulados." };
  }

  await entities.ComprobanteContable.update(comprobante_id, {
    estado: "anulado",
    motivo_anulacion: motivo,
    anulado_at: new Date().toISOString(),
    anulado_por_email: "multipagosstm@gmail.com"
  });

  const movs = await entities.MovimientoContable.filter({ comprobante_id });
  for (const m of movs) {
    await entities.MovimientoContable.update(m.id, { estado: "anulado" });
  }

  try {
    await entities.HistoricoContable.create({
      comprobante_id,
      numero_comprobante: comp.numero,
      accion: "anulacion",
      descripcion: motivo,
      monto_total: comp.total_debito,
      usuario_email: "multipagosstm@gmail.com",
      fecha: new Date().toISOString().split('T')[0]
    });
  } catch (errHist) {
    console.warn("Error en HistoricoContable:", errHist);
  }

  return { success: true };
}

export async function eliminarComprobantePermanente(entities, payload = {}) {
  const { comprobante_id } = payload;
  if (!comprobante_id) {
    return { success: false, error: "ID de comprobante requerido" };
  }

  const comp = await entities.ComprobanteContable.get(comprobante_id).catch(() => null);
  const numeroComp = comp?.numero || comprobante_id;

  // 1. Eliminar notas de crédito espejo vinculadas (si las hay)
  try {
    const notasHijas = await entities.ComprobanteContable.filter({ comprobante_origen_id: comprobante_id });
    if (notasHijas && notasHijas.length > 0) {
      for (const nota of notasHijas) {
        const movsNota = await entities.MovimientoContable.filter({ comprobante_id: nota.id });
        if (movsNota?.length > 0) {
          await entities.MovimientoContable.bulkDelete(movsNota.map(m => m.id));
        }
        const histNota = await entities.HistoricoContable.filter({ comprobante_id: nota.id });
        if (histNota?.length > 0) {
          await entities.HistoricoContable.bulkDelete(histNota.map(h => h.id));
        }
        await entities.ComprobanteContable.delete(nota.id);
      }
    }
  } catch (errNotas) {
    console.warn("Advertencia eliminando notas hijas vinculadas:", errNotas);
  }

  // 2. Eliminar movimientos contables del comprobante
  let totalMovsEliminados = 0;
  try {
    const movs = await entities.MovimientoContable.filter({ comprobante_id });
    if (movs && movs.length > 0) {
      totalMovsEliminados = movs.length;
      await entities.MovimientoContable.bulkDelete(movs.map(m => m.id));
      await entities.MovimientoContable.deleteMany({ comprobante_id });
    }
  } catch (errMovs) {
    console.warn("Advertencia eliminando movimientos:", errMovs);
  }

  // 3. Eliminar histórico contable del comprobante
  try {
    const hist = await entities.HistoricoContable.filter({ comprobante_id });
    if (hist && hist.length > 0) {
      await entities.HistoricoContable.bulkDelete(hist.map(h => h.id));
      await entities.HistoricoContable.deleteMany({ comprobante_id });
    }
  } catch (errHist) {
    console.warn("Advertencia eliminando histórico:", errHist);
  }

  // 4. Eliminar el comprobante contable físico
  try {
    await entities.ComprobanteContable.delete(comprobante_id);
  } catch (errComp) {
    console.warn("Advertencia eliminando comprobante:", errComp);
  }

  // 5. Recalcular saldos de inmediato para que los balances y extractos queden al día
  try {
    await recalcularSaldos(entities);
  } catch (errRecalc) {
    console.warn("Advertencia recalculando saldos tras eliminación:", errRecalc);
  }

  return {
    success: true,
    numero: numeroComp,
    comprobante_id,
    movimientos_eliminados: totalMovsEliminados,
    mensaje: `Comprobante ${numeroComp} y ${totalMovsEliminados} movimientos eliminados permanentemente.`
  };
}

export async function eliminarComprobantesLotePermanente(entities, payload = {}) {
  const { comprobante_ids = [] } = payload;
  if (!Array.isArray(comprobante_ids) || comprobante_ids.length === 0) {
    return { success: false, error: "Lista de IDs de comprobantes vacía" };
  }

  const resultados = [];
  const errores = [];

  for (const compId of comprobante_ids) {
    try {
      // Eliminar notas hijas
      const notasHijas = await entities.ComprobanteContable.filter({ comprobante_origen_id: compId }).catch(() => []);
      for (const nota of (notasHijas || [])) {
        const movsNota = await entities.MovimientoContable.filter({ comprobante_id: nota.id }).catch(() => []);
        if (movsNota?.length > 0) await entities.MovimientoContable.bulkDelete(movsNota.map(m => m.id));
        const histNota = await entities.HistoricoContable.filter({ comprobante_id: nota.id }).catch(() => []);
        if (histNota?.length > 0) await entities.HistoricoContable.bulkDelete(histNota.map(h => h.id));
        await entities.ComprobanteContable.delete(nota.id);
      }

      // Eliminar movimientos
      const movs = await entities.MovimientoContable.filter({ comprobante_id: compId }).catch(() => []);
      if (movs?.length > 0) {
        await entities.MovimientoContable.bulkDelete(movs.map(m => m.id));
        await entities.MovimientoContable.deleteMany({ comprobante_id: compId });
      }

      // Eliminar históricos
      const hist = await entities.HistoricoContable.filter({ comprobante_id: compId }).catch(() => []);
      if (hist?.length > 0) {
        await entities.HistoricoContable.bulkDelete(hist.map(h => h.id));
        await entities.HistoricoContable.deleteMany({ comprobante_id: compId });
      }

      // Eliminar comprobante
      await entities.ComprobanteContable.delete(compId);

      resultados.push(compId);
    } catch (err) {
      errores.push({ id: compId, error: err.message });
    }
  }

  // Recalcular saldos una sola vez al final de todo el lote
  try {
    await recalcularSaldos(entities);
  } catch (errRecalc) {
    console.warn("Advertencia recalculando saldos tras eliminación por lote:", errRecalc);
  }

  return {
    success: true,
    total_solicitados: comprobante_ids.length,
    total_eliminados: resultados.length,
    fallidos: errores.length,
    errores
  };
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

export async function reconciliarCuotasPrestamo(entities, prestamoId) {
  if (!prestamoId) return [];
  const p = await entities.Prestamo.get(prestamoId);
  if (!p) return [];

  const pId = String(p.id).trim();
  const pCodigo = p.codigo ? String(p.codigo).trim().toLowerCase() : "";

  let cuotasBD = await entities.CuotaAmortizacion.filter({ prestamo_id: p.id });
  cuotasBD = (cuotasBD || []).sort((a, b) => a.numero - b.numero);

  if (cuotasBD.length === 0) {
    const gen = p.modelo === "cuota_fija"
      ? generarAmortizacionCuotaFija(p.capital, p.tasa_nominal, p.periodo || "mensual", p.numero_cuotas, p.fecha_prestamo, p.cuota_fija)
      : generarAmortizacionMesVencido(p.capital, p.tasa_nominal, p.periodo || "mensual", p.numero_cuotas, p.fecha_prestamo);
    if (Array.isArray(gen.schedule)) {
      cuotasBD = [];
      for (const c of gen.schedule) {
        const created = await entities.CuotaAmortizacion.create({
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
        cuotasBD.push(created);
      }
    }
  }

  const todosAbonos = await entities.AbonoPrestamo.list("-fecha", 1000);
  const parseDet = (d) => {
    if (Array.isArray(d)) return d;
    if (typeof d === "string") {
      try { return JSON.parse(d); } catch { return []; }
    }
    return [];
  };

  const abonosPrestamo = (todosAbonos || []).filter((a) => {
    const dList = parseDet(a.detalles);
    return dList.some((d) => 
      String(d.prestamo_id).trim() === pId ||
      (d.codigo && String(d.codigo).trim().toLowerCase() === pCodigo)
    );
  });

  // Calcular capital efectivamente abonado según contabilidad y recibos reales
  let capitalTotalAbonado = 0;
  for (const a of abonosPrestamo) {
    const dList = parseDet(a.detalles);
    const d = dList.find((x) =>
      String(x.prestamo_id).trim() === pId ||
      (x.codigo && String(x.codigo).trim().toLowerCase() === pCodigo)
    );
    if (!d) continue;
    const val = Number(d.valor_aplicado) || 0;
    const intVal = Number(d.intereses) || 0;
    const extraVal = Number(d.otros_cobros) || 0;
    const capVal = d.capital !== undefined ? Number(d.capital) : Math.max(0, val - intVal - extraVal);
    capitalTotalAbonado += capVal;
  }

  const capitalOriginal = Number(p.capital) || 0;
  const nuevoSaldoCapital = Math.max(0, capitalOriginal - capitalTotalAbonado);
  const estaSaldado = p.estado === "saldado" || (capitalOriginal > 0 && nuevoSaldoCapital <= 0.01);

  const cuotasReconciliadas = reconciliarCuotasConAbonos(cuotasBD, abonosPrestamo, {
    ...p,
    saldo_capital: estaSaldado ? 0 : nuevoSaldoCapital,
    estado: estaSaldado ? "saldado" : p.estado
  });

  for (const c of cuotasReconciliadas) {
    if (c.id) {
      await entities.CuotaAmortizacion.update(c.id, {
        valor_pagado: c.valor_pagado,
        otros_cobros: c.otros_cobros || 0,
        estado: estaSaldado ? "pagada" : c.estado,
        saldo_capital: estaSaldado ? 0 : c.saldo_capital,
        fecha_pago: c.fecha_pago,
        abono_id: c.abono_id
      });
    }
  }

  const hoy = new Date().toISOString().substring(0, 10);
  const ultAbono = [...abonosPrestamo].sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""))[0];

  if (estaSaldado) {
    await entities.Prestamo.update(p.id, {
      saldo_capital: 0,
      saldo_intereses: 0,
      estado: "saldado",
      fecha_proximo_pago: null,
      valor_proximo_pago: 0,
      fecha_ultimo_abono: ultAbono ? ultAbono.fecha : p.fecha_ultimo_abono
    });
    return cuotasReconciliadas;
  }

  const proxCuota = cuotasReconciliadas.find((c) => c.estado !== "pagada") || cuotasReconciliadas[cuotasReconciliadas.length - 1];

  // En un plan de amortización ordenado, la fecha del próximo pago corresponde al vencimiento programado
  // de la cuota pendiente (proxCuota). No se debe alterar la fecha_vencimiento de una cuota individual
  // dentro del cronograma al abonar, pues desordena la secuencia de las cuotas siguientes.
  let fechaProxFinal = proxCuota ? proxCuota.fecha_vencimiento : null;

  // Solo para préstamos de 1 sola cuota donde se registró prórroga explícita en notas:
  if (cuotasReconciliadas.length === 1 && p.notas) {
    const match = p.notas.match(/(?:nuevo vencimiento|nuevo vence)\s+([0-9]{4}-[0-9]{2}-[0-9]{2})/i);
    if (match && match[1]) {
      fechaProxFinal = match[1];
      if (proxCuota && proxCuota.fecha_vencimiento !== fechaProxFinal) {
        proxCuota.fecha_vencimiento = fechaProxFinal;
        if (proxCuota.id) {
          await entities.CuotaAmortizacion.update(proxCuota.id, { fecha_vencimiento: fechaProxFinal });
        }
      }
    }
  }

  // Fallback si no tuviera fecha de vencimiento asignada
  if (!fechaProxFinal) {
    const baseFecha = p.fecha_prestamo || hoy;
    fechaProxFinal = sumarPeriodo(baseFecha, p.periodo || "mensual", 1);
  }

  const nuevoEstado = (fechaProxFinal && fechaProxFinal < hoy) ? "en_mora" : "vigente";

  let valorProxFinal = 0;
  if (p.modelo === "mes_vencido") {
    const tasa = Number(p.tasa_efectiva_periodo) || Number(p.tasa_nominal) || 0.1;
    const interesPeriodo = Math.round(nuevoSaldoCapital * tasa);
    valorProxFinal = (p.valor_proximo_pago > 0 && p.valor_proximo_pago <= interesPeriodo)
      ? p.valor_proximo_pago
      : (interesPeriodo > 0 ? interesPeriodo : nuevoSaldoCapital);
  } else {
    valorProxFinal = proxCuota ? Math.max(0, (Number(proxCuota.cuota) || 0) - (Number(proxCuota.valor_pagado) || 0)) : nuevoSaldoCapital;
  }

  await entities.Prestamo.update(p.id, {
    saldo_capital: nuevoSaldoCapital,
    estado: nuevoEstado,
    fecha_proximo_pago: fechaProxFinal,
    valor_proximo_pago: valorProxFinal,
    fecha_ultimo_abono: ultAbono ? ultAbono.fecha : null
  });

  return cuotasReconciliadas;
}

export async function gestionarPakredito(entities, payload = {}) {
  const { accion, ...params } = payload;
  const hoy = new Date().toISOString().split("T")[0];

  // 0. RECONCILIAR CUOTAS
  if (accion === "reconciliarCuotas") {
    const { prestamo_id } = params;
    if (prestamo_id) {
      const cuotas = await reconciliarCuotasPrestamo(entities, prestamo_id);
      return { success: true, cuotas };
    }
    const prestamos = await entities.Prestamo.list("-created_date", 200);
    for (const p of (prestamos || [])) {
      await reconciliarCuotasPrestamo(entities, p.id);
    }
    await recalcularSaldos(entities);
    return { success: true };
  }

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
    const periodoFinal = periodo || "mensual";

    // Generar tabla de amortización
    const gen = modelo === "cuota_fija"
      ? generarAmortizacionCuotaFija(capital, tasaNom, periodoFinal, numCuotas, fechaDoc, cuotaMan)
      : generarAmortizacionMesVencido(capital, tasaNom, periodoFinal, numCuotas, fechaDoc);

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
      periodo: periodoFinal,
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
    // 2. Créditos por cada préstamo:
    //    - Capital abonado a 120506 PAKREDITO
    //    - Intereses pagados a 410503 Pakredito
    //    - Otros cobros pagados a 410503 Pakredito
    // Pre-resolver cuota_id y cuota_numero si no fueron enviados
    for (const d of detalles) {
      if (!d.cuota_id || !d.cuota_numero) {
        try {
          const cuotasP = await entities.CuotaAmortizacion.filter({ prestamo_id: d.prestamo_id });
          const cuotaPend = (cuotasP || []).filter((c) => c.estado !== "pagada").sort((a, b) => a.numero - b.numero)[0];
          if (cuotaPend) {
            if (!d.cuota_id) d.cuota_id = cuotaPend.id;
            if (!d.cuota_numero) d.cuota_numero = cuotaPend.numero;
          }
        } catch { /* noop */ }
      }
    }

    const movsCredito = [];
    for (const d of detalles) {
      const p = prestamosMap[d.prestamo_id];
      const valorAplicado = Number(d.valor_aplicado) || 0;
      const intRaw = Math.round(Number(d.intereses) || 0);
      const cobroMas = Boolean(d.cobro_intereses_de_mas);
      const otrosCobros = cobroMas ? Math.round(Number(d.otros_cobros) || 0) : 0;
      const intereses = (cobroMas && intRaw > otrosCobros && otrosCobros > 0)
        ? (intRaw - otrosCobros)
        : (cobroMas && intRaw === otrosCobros ? 0 : intRaw);
      const capitalAbono = Math.max(0, valorAplicado - intereses - otrosCobros);

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
      if (otrosCobros > 0) {
        movsCredito.push({
          subcuenta: p?.subcuenta_intereses || "410503",
          debito: 0,
          credito: otrosCobros,
          descripcion: `Otros cobros / Cobro extra ${p?.codigo || ""}`,
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
    const abono = await entities.AbonoPrestamo.create({
      cliente_id: cliente.id,
      fecha: fechaDoc,
      valor_total: totalVal,
      comprobante_id,
      subcuenta_ingreso: String(cuenta_ingreso.subcuenta),
      cda_id: cuenta_ingreso.cuenta_ahorro_id || null,
      detalles: detalles.map((d) => {
        const val = Number(d.valor_aplicado) || 0;
        const intRaw = Number(d.intereses) || 0;
        const cobroMas = Boolean(d.cobro_intereses_de_mas);
        const otrosCobros = cobroMas ? Math.round(Number(d.otros_cobros) || 0) : 0;
        const intVal = (cobroMas && intRaw > otrosCobros && otrosCobros > 0)
          ? (intRaw - otrosCobros)
          : (cobroMas && intRaw === otrosCobros ? 0 : intRaw);
        return {
          prestamo_id: d.prestamo_id,
          valor_aplicado: val,
          intereses: intVal,
          cobro_intereses_de_mas: cobroMas,
          otros_cobros: otrosCobros,
          cuota_id: d.cuota_id || null,
          cuota_numero: d.cuota_numero || null,
          capital: Math.max(0, val - intVal - otrosCobros)
        };
      }),
      notas: notas || null
    });

    // Actualizar cada préstamo y sus cuotas
    for (const d of detalles) {
      const p = prestamosMap[d.prestamo_id];
      if (!p) continue;

      const valorAplicado = Number(d.valor_aplicado) || 0;
      const intRaw = Number(d.intereses) || 0;
      const cobroMas = Boolean(d.cobro_intereses_de_mas);
      const otrosCobros = cobroMas ? Math.round(Number(d.otros_cobros) || 0) : 0;
      const intereses = (cobroMas && intRaw > otrosCobros && otrosCobros > 0)
        ? (intRaw - otrosCobros)
        : (cobroMas && intRaw === otrosCobros ? 0 : intRaw);
      const capitalAbono = Math.max(0, valorAplicado - intereses - otrosCobros);

      const nuevoSaldoCapital = Math.max(0, (Number(p.saldo_capital) || 0) - capitalAbono);

      let fechaProximoPago = p.fecha_proximo_pago;
      let valorProximoPago = p.valor_proximo_pago;
      let nuevoSaldoIntereses = p.saldo_intereses || 0;

      const periodoCredito = p.periodo || "mensual";
      let notaAdicional = "";

      if (p.modelo === "mes_vencido" && capitalAbono <= 0 && intereses > 0) {
        // CASO: CUOTA VARIABLE - PAGO EXCLUSIVO DE INTERESES (PRÓRROGA AUTOMÁTICA)
        const baseFecha = (p.fecha_proximo_pago && p.fecha_proximo_pago >= fechaDoc) ? p.fecha_proximo_pago : fechaDoc;
        fechaProximoPago = sumarPeriodo(baseFecha, periodoCredito, 1);
        valorProximoPago = Math.round(nuevoSaldoCapital * (Number(p.tasa_efectiva_periodo) || Number(p.tasa_nominal) || 0));

        const cuotas = await entities.CuotaAmortizacion.filter({ prestamo_id: p.id });
        const cuotasPendientes = (cuotas || []).filter((c) => c.estado !== "pagada").sort((a, b) => a.numero - b.numero);

        if (cuotasPendientes.length > 0) {
          const cuotaActual = cuotasPendientes[0];
          await entities.CuotaAmortizacion.update(cuotaActual.id, {
            valor_pagado: (Number(cuotaActual.valor_pagado) || 0) + valorAplicado,
            otros_cobros: (Number(cuotaActual.otros_cobros) || 0) + otrosCobros,
            fecha_pago: fechaDoc,
            abono_id: abono.id
          });

          for (const c of cuotasPendientes) {
            const nuevaVenc = sumarPeriodo(c.fecha_vencimiento, periodoCredito, 1);
            await entities.CuotaAmortizacion.update(c.id, {
              fecha_vencimiento: nuevaVenc
            });
          }
        }
        notaAdicional = `Prórroga por pago de intereses (${fechaDoc}): +1 ${periodoCredito} → nuevo vencimiento ${fechaProximoPago}${otrosCobros > 0 ? ` (Cobro extra: $${otrosCobros})` : ""}`;
      } else if (p.modelo === "mes_vencido") {
        // CASO: CUOTA VARIABLE CON ABONO A CAPITAL
        const cuotas = await entities.CuotaAmortizacion.filter({ prestamo_id: p.id });
        const cuotasPendientes = (cuotas || []).filter((c) => c.estado !== "pagada").sort((a, b) => a.numero - b.numero);
        const cuotaActual = cuotasPendientes[0];

        if (cobroMas && otrosCobros > 0 && cuotaActual) {
          const faltaOrd = Math.max(0, (Number(cuotaActual.cuota) || 0) - (Number(cuotaActual.valor_pagado) || 0));
          const pagoOrd = Math.min(valorAplicado, faltaOrd);
          let rem = valorAplicado - pagoOrd;
          const asignableExtra = Math.min(rem, otrosCobros);
          rem -= asignableExtra;

          const totalPagadoCuota = (Number(cuotaActual.valor_pagado) || 0) + pagoOrd + asignableExtra;
          const yaPagada = ((Number(cuotaActual.valor_pagado) || 0) + pagoOrd) >= ((Number(cuotaActual.cuota) || 0) - 0.01);

          await entities.CuotaAmortizacion.update(cuotaActual.id, {
            valor_pagado: totalPagadoCuota,
            otros_cobros: (Number(cuotaActual.otros_cobros) || 0) + asignableExtra,
            estado: yaPagada ? "pagada" : "pendiente",
            fecha_pago: fechaDoc,
            abono_id: abono.id
          });

          if (rem > 0) {
            for (const sig of cuotasPendientes) {
              if (sig.id === cuotaActual.id || rem <= 0) continue;
              const fSig = Math.max(0, (Number(sig.cuota) || 0) - (Number(sig.valor_pagado) || 0));
              if (fSig <= 0) continue;
              const pSig = Math.min(rem, fSig);
              const nuevoPagSig = (Number(sig.valor_pagado) || 0) + pSig;
              const yaPagSig = nuevoPagSig >= ((Number(sig.cuota) || 0) - 0.01);
              await entities.CuotaAmortizacion.update(sig.id, {
                valor_pagado: nuevoPagSig,
                estado: yaPagSig ? "pagada" : "pendiente",
                fecha_pago: fechaDoc,
                abono_id: abono.id
              });
              rem -= pSig;
            }
          }
        } else {
          // Comportamiento natural: todo el saldo restante se aplica a la siguiente cuota
          let rem = valorAplicado;
          for (const c of (cuotasPendientes || [])) {
            if (rem <= 0) break;
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
        }

        const cuotasActualizadas = await entities.CuotaAmortizacion.filter({ prestamo_id: p.id });
        const prox = (cuotasActualizadas || []).sort((a, b) => a.numero - b.numero).find((c) => c.estado !== "pagada");
        fechaProximoPago = prox ? prox.fecha_vencimiento : null;
        valorProximoPago = prox ? Math.max(0, (Number(prox.cuota) || 0) - (Number(prox.valor_pagado) || 0)) : 0;
      } else {
        // CASO: CUOTA FIJA
        const cuotas = await entities.CuotaAmortizacion.filter({ prestamo_id: p.id });
        const cuotasOrdenadas = (cuotas || []).sort((a, b) => (Number(a.numero) || 0) - (Number(b.numero) || 0));

        if (cobroMas && otrosCobros > 0) {
          // Si se cobró de más en intereses:
          // Cubrimos intereses y capital de esta cuota, y sumamos el saldo de más a 'otros_cobros'
          // sin aplicarse para la cuota siguiente!
          const c = cuotasOrdenadas.find((x) => x.estado !== "pagada");
          if (c) {
            const faltaCuotaOrd = Math.max(0, (Number(c.cuota) || 0) - (Number(c.valor_pagado) || 0));
            const pagoOrd = Math.min(valorAplicado, faltaCuotaOrd);
            let rem = valorAplicado - pagoOrd;
            const asignadoExtra = Math.min(rem, otrosCobros);
            rem -= asignadoExtra;

            const totalPagadoCuota = (Number(c.valor_pagado) || 0) + pagoOrd + asignadoExtra;
            const yaPagada = ((Number(c.valor_pagado) || 0) + pagoOrd) >= ((Number(c.cuota) || 0) - 0.01);

            await entities.CuotaAmortizacion.update(c.id, {
              valor_pagado: totalPagadoCuota,
              otros_cobros: (Number(c.otros_cobros) || 0) + asignadoExtra,
              estado: yaPagada ? "pagada" : "pendiente",
              fecha_pago: fechaDoc,
              abono_id: abono.id
            });

            // Si aún sobró dinero más allá de cuota ord + otros cobros, se aplica a siguientes cuotas
            if (rem > 0) {
              for (const sig of cuotasOrdenadas) {
                if (sig.id === c.id || sig.estado === "pagada" || rem <= 0) continue;
                const fSig = Math.max(0, (Number(sig.cuota) || 0) - (Number(sig.valor_pagado) || 0));
                if (fSig <= 0) continue;
                const pSig = Math.min(rem, fSig);
                const nuevoPagSig = (Number(sig.valor_pagado) || 0) + pSig;
                const yaPagSig = nuevoPagSig >= ((Number(sig.cuota) || 0) - 0.01);
                await entities.CuotaAmortizacion.update(sig.id, {
                  valor_pagado: nuevoPagSig,
                  estado: yaPagSig ? "pagada" : "pendiente",
                  fecha_pago: fechaDoc,
                  abono_id: abono.id
                });
                rem -= pSig;
              }
            }
          }
        } else {
          // En caso contrario: dicho saldo automáticamente se aplica para la cuota siguiente
          let rem = valorAplicado;
          for (const c of cuotasOrdenadas) {
            if (rem <= 0 && nuevoSaldoCapital > 0) break;
            if (c.estado === "pagada") continue;

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
        }

        const cuotasActualizadas = await entities.CuotaAmortizacion.filter({ prestamo_id: p.id });
        const prox = (cuotasActualizadas || []).sort((a, b) => a.numero - b.numero).find((c) => c.estado !== "pagada");
        fechaProximoPago = prox ? prox.fecha_vencimiento : null;
        valorProximoPago = prox ? Math.max(0, (Number(prox.cuota) || 0) - (Number(prox.valor_pagado) || 0)) : 0;
      }

      let nuevoEstado = "vigente";
      if (nuevoSaldoCapital <= 0.01) {
        nuevoEstado = "saldado";
        fechaProximoPago = null;
        valorProximoPago = 0;
      } else if (fechaProximoPago && fechaProximoPago < hoy) {
        nuevoEstado = "en_mora";
      } else {
        nuevoEstado = "vigente";
      }

      const notasFinales = notaAdicional
        ? (p.notas ? `${p.notas}\n${notaAdicional}` : notaAdicional)
        : (p.notas || null);

      // Actualizar préstamo en Supabase (solo columnas válidas de la tabla prestamo)
      await entities.Prestamo.update(p.id, {
        saldo_capital: nuevoSaldoCapital,
        fecha_ultimo_abono: fechaDoc,
        saldo_intereses: 0,
        fecha_proximo_pago: fechaProximoPago,
        valor_proximo_pago: valorProximoPago,
        estado: nuevoEstado,
        notas: notasFinales
      });
    }

    for (const d of detalles) {
      if (d.prestamo_id) {
        await reconciliarCuotasPrestamo(entities, d.prestamo_id);
      }
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

    const parseDet = (d) => {
      if (Array.isArray(d)) return d;
      if (typeof d === "string") {
        try { return JSON.parse(d); } catch { return []; }
      }
      return [];
    };

    // 1. Anular el comprobante contable y sus movimientos
    if (abono.comprobante_id) {
      await anularComprobante(entities, {
        comprobante_id: abono.comprobante_id,
        motivo: params.motivo || "Eliminación de abono Pakredito"
      });
    }

    // 2. Eliminar el registro AbonoPrestamo
    const detallesAbono = parseDet(abono.detalles);
    await entities.AbonoPrestamo.delete(abono.id);

    // 3. Reconciliar matemáticamente cada préstamo afectado y su tabla de cuotas
    for (const d of detallesAbono) {
      if (d.prestamo_id) {
        await reconciliarCuotasPrestamo(entities, d.prestamo_id);
      }
    }

    await recalcularSaldos(entities);
    return { success: true };
  }

  // 3.1 MODIFICAR ABONO
  if (accion === "editarAbono") {
    const abonoId = params.abono_id || params.id;
    if (!abonoId) throw new Error("ID de abono requerido");
    const abono = await entities.AbonoPrestamo.get(abonoId);
    if (!abono) return { success: false, error: "Abono no encontrado" };

    const parseDet = (d) => {
      if (Array.isArray(d)) return d;
      if (typeof d === "string") {
        try { return JSON.parse(d); } catch { return []; }
      }
      return [];
    };

    const {
      fecha: nuevaFecha,
      valor_total: nuevoValorTotal,
      cuenta_ingreso: nuevaCuentaIngreso,
      detalles: nuevosDetalles,
      notas: nuevasNotas,
      motivo
    } = params;

    // 1. Revertir saldo anterior en los préstamos y cuotas
    const detallesViejos = parseDet(abono.detalles);
    for (const d of detallesViejos) {
      const p = await entities.Prestamo.get(d.prestamo_id);
      if (!p) continue;
      const valorAplicado = Number(d.valor_aplicado) || 0;
      const intereses = Number(d.intereses) || 0;
      const capitalAbono = d.capital !== undefined ? Number(d.capital) : Math.max(0, valorAplicado - intereses);
      const saldoRestaurado = (Number(p.saldo_capital) || 0) + capitalAbono;

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
      }
      await entities.Prestamo.update(p.id, {
        saldo_capital: saldoRestaurado,
        estado: saldoRestaurado <= 0 ? "saldado" : "vigente"
      });
    }

    // 2. Preparar nuevos valores
    const fechaDoc = nuevaFecha || abono.fecha || hoy;
    const detallesFinales = nuevosDetalles && nuevosDetalles.length > 0 ? nuevosDetalles : detallesViejos;
    const totalVal = Number(nuevoValorTotal) || detallesFinales.reduce((s, d) => s + (Number(d.valor_aplicado) || 0), 0);
    const subcuentaIngreso = nuevaCuentaIngreso?.subcuenta ? String(nuevaCuentaIngreso.subcuenta) : abono.subcuenta_ingreso;
    const cdaId = nuevaCuentaIngreso?.cuenta_ahorro_id !== undefined ? nuevaCuentaIngreso.cuenta_ahorro_id : abono.cda_id;

    const cliente = await entities.Cliente.get(abono.cliente_id);

    // 3. Modificar el comprobante contable si existe
    if (abono.comprobante_id) {
      const prestamosMap = {};
      const codigosAbonados = [];
      for (const d of detallesFinales) {
        const p = await entities.Prestamo.get(d.prestamo_id);
        if (p) {
          prestamosMap[d.prestamo_id] = p;
          if (p.codigo) codigosAbonados.push(p.codigo);
        }
      }

      const movDebito = {
        subcuenta: subcuentaIngreso,
        debito: totalVal,
        credito: 0,
        descripcion: `Abono pakredito — ${cliente?.nombre || ""}`,
        tercero: cliente?.nombre || "",
        cliente_id: abono.cliente_id,
        cuenta_ahorro_id: cdaId || null
      };

      const movsCredito = [];
      for (const d of detallesFinales) {
        const p = prestamosMap[d.prestamo_id];
        const val = Number(d.valor_aplicado) || 0;
        const intRaw = Math.round(Number(d.intereses) || 0);
        const cobroMas = Boolean(d.cobro_intereses_de_mas);
        const otros = cobroMas ? Math.round(Number(d.otros_cobros) || 0) : 0;
        const intVal = (cobroMas && intRaw > otros && otros > 0)
          ? (intRaw - otros)
          : (cobroMas && intRaw === otros ? 0 : intRaw);
        const cap = Math.max(0, val - intVal - otros);

        if (cap > 0) {
          movsCredito.push({
            subcuenta: p?.subcuenta_cartera || "120506",
            debito: 0,
            credito: cap,
            descripcion: `Abono capital ${p?.codigo || ""}`,
            tercero: cliente?.nombre || "",
            cliente_id: abono.cliente_id
          });
        }
        if (intVal > 0) {
          movsCredito.push({
            subcuenta: p?.subcuenta_intereses || "410503",
            debito: 0,
            credito: intVal,
            descripcion: `Intereses ${p?.codigo || ""}`,
            tercero: cliente?.nombre || "",
            cliente_id: abono.cliente_id
          });
        }
        if (otros > 0) {
          movsCredito.push({
            subcuenta: p?.subcuenta_intereses || "410503",
            debito: 0,
            credito: otros,
            descripcion: `Otros cobros / Cobro extra ${p?.codigo || ""}`,
            tercero: cliente?.nombre || "",
            cliente_id: abono.cliente_id
          });
        }
      }

      const descComp = `Abono pakredito — ${cliente?.nombre || ""}${codigosAbonados.length ? ` (${codigosAbonados.join(", ")})` : ""}`;

      await modificarComprobante(entities, {
        comprobante_id: abono.comprobante_id,
        fecha: fechaDoc,
        descripcion: descComp,
        movimientos: [movDebito, ...movsCredito],
        motivo: motivo || "Modificación de abono Pakredito"
      });
    }

    // 4. Aplicar nuevos saldos a préstamos y cuotas
    for (const d of detallesFinales) {
      const p = await entities.Prestamo.get(d.prestamo_id);
      if (!p) continue;
      const val = Number(d.valor_aplicado) || 0;
      const intRaw = Number(d.intereses) || 0;
      const cobroMas = Boolean(d.cobro_intereses_de_mas);
      const otros = cobroMas ? Math.round(Number(d.otros_cobros) || 0) : 0;
      const intVal = (cobroMas && intRaw > otros && otros > 0)
        ? (intRaw - otros)
        : (cobroMas && intRaw === otros ? 0 : intRaw);
      const cap = Math.max(0, val - intVal - otros);

      const nuevoSaldoCapital = Math.max(0, (Number(p.saldo_capital) || 0) - cap);
      let fechaProximoPago = p.fecha_proximo_pago;
      let valorProximoPago = p.valor_proximo_pago;
      let nuevoSaldoIntereses = p.saldo_intereses || 0;

      if (p.modelo === "cuota_fija") {
        const cuotas = await entities.CuotaAmortizacion.filter({ prestamo_id: p.id });
        const cuotasOrdenadas = (cuotas || []).sort((a, b) => (Number(a.numero) || 0) - (Number(b.numero) || 0));

        if (cobroMas && otros > 0) {
          const c = cuotasOrdenadas.find((x) => x.estado !== "pagada");
          if (c) {
            const faltaCuotaOrd = Math.max(0, (Number(c.cuota) || 0) - (Number(c.valor_pagado) || 0));
            const pagoOrd = Math.min(val, faltaCuotaOrd);
            let rem = val - pagoOrd;
            const asignadoExtra = Math.min(rem, otros);
            rem -= asignadoExtra;

            const totalPagadoCuota = (Number(c.valor_pagado) || 0) + pagoOrd + asignadoExtra;
            const yaPagada = ((Number(c.valor_pagado) || 0) + pagoOrd) >= ((Number(c.cuota) || 0) - 0.01);

            await entities.CuotaAmortizacion.update(c.id, {
              valor_pagado: totalPagadoCuota,
              otros_cobros: (Number(c.otros_cobros) || 0) + asignadoExtra,
              estado: yaPagada ? "pagada" : "pendiente",
              fecha_pago: fechaDoc,
              abono_id: abono.id
            });

            if (rem > 0) {
              for (const sig of cuotasOrdenadas) {
                if (sig.id === c.id || sig.estado === "pagada" || rem <= 0) continue;
                const fSig = Math.max(0, (Number(sig.cuota) || 0) - (Number(sig.valor_pagado) || 0));
                if (fSig <= 0) continue;
                const pSig = Math.min(rem, fSig);
                const nuevoPagSig = (Number(sig.valor_pagado) || 0) + pSig;
                const yaPagSig = nuevoPagSig >= ((Number(sig.cuota) || 0) - 0.01);
                await entities.CuotaAmortizacion.update(sig.id, {
                  valor_pagado: nuevoPagSig,
                  estado: yaPagSig ? "pagada" : "pendiente",
                  fecha_pago: fechaDoc,
                  abono_id: abono.id
                });
                rem -= pSig;
              }
            }
          }
        } else {
          let rem = val;
          for (const c of cuotasOrdenadas) {
            if (rem <= 0 && nuevoSaldoCapital > 0) break;
            if (c.estado === "pagada") continue;

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
        }

        const cuotasActualizadas = await entities.CuotaAmortizacion.filter({ prestamo_id: p.id });
        const prox = (cuotasActualizadas || []).sort((a, b) => a.numero - b.numero).find((c) => c.estado !== "pagada");
        fechaProximoPago = prox ? prox.fecha_vencimiento : null;
        valorProximoPago = prox ? Math.max(0, (Number(prox.cuota) || 0) - (Number(prox.valor_pagado) || 0)) : 0;
      } else if (p.modelo === "mes_vencido") {
        const cuotas = await entities.CuotaAmortizacion.filter({ prestamo_id: p.id });
        const cuotasPendientes = (cuotas || []).filter((c) => c.estado !== "pagada").sort((a, b) => a.numero - b.numero);
        const cuotaActual = cuotasPendientes[0];

        if (cobroMas && otros > 0 && cuotaActual) {
          const faltaOrd = Math.max(0, (Number(cuotaActual.cuota) || 0) - (Number(cuotaActual.valor_pagado) || 0));
          const pagoOrd = Math.min(val, faltaOrd);
          let rem = val - pagoOrd;
          const asignableExtra = Math.min(rem, otros);
          rem -= asignableExtra;

          const totalPagadoCuota = (Number(cuotaActual.valor_pagado) || 0) + pagoOrd + asignableExtra;
          const yaPagada = ((Number(cuotaActual.valor_pagado) || 0) + pagoOrd) >= ((Number(cuotaActual.cuota) || 0) - 0.01);

          await entities.CuotaAmortizacion.update(cuotaActual.id, {
            valor_pagado: totalPagadoCuota,
            otros_cobros: (Number(cuotaActual.otros_cobros) || 0) + asignableExtra,
            estado: yaPagada ? "pagada" : "pendiente",
            fecha_pago: fechaDoc,
            abono_id: abono.id
          });

          if (rem > 0) {
            for (const sig of cuotasPendientes) {
              if (sig.id === cuotaActual.id || rem <= 0) continue;
              const fSig = Math.max(0, (Number(sig.cuota) || 0) - (Number(sig.valor_pagado) || 0));
              if (fSig <= 0) continue;
              const pSig = Math.min(rem, fSig);
              const nuevoPagSig = (Number(sig.valor_pagado) || 0) + pSig;
              const yaPagSig = nuevoPagSig >= ((Number(sig.cuota) || 0) - 0.01);
              await entities.CuotaAmortizacion.update(sig.id, {
                valor_pagado: nuevoPagSig,
                estado: yaPagSig ? "pagada" : "pendiente",
                fecha_pago: fechaDoc,
                abono_id: abono.id
              });
              rem -= pSig;
            }
          }
        } else {
          let rem = val;
          for (const c of (cuotasPendientes || [])) {
            if (rem <= 0) break;
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
        }

        nuevoSaldoIntereses = Math.max(0, (Number(p.saldo_intereses) || 0) - intVal);
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

      await entities.Prestamo.update(p.id, {
        saldo_capital: nuevoSaldoCapital,
        fecha_ultimo_abono: fechaDoc,
        saldo_intereses: p.modelo === "mes_vencido" ? nuevoSaldoIntereses : 0,
        fecha_proximo_pago: fechaProximoPago,
        valor_proximo_pago: valorProximoPago,
        estado: nuevoEstado
      });
    }

    // 5. Actualizar el registro AbonoPrestamo
    const updatedAbono = await entities.AbonoPrestamo.update(abono.id, {
      fecha: fechaDoc,
      valor_total: totalVal,
      subcuenta_ingreso: subcuentaIngreso,
      cda_id: cdaId || null,
      detalles: detallesFinales.map((d) => {
        const val = Number(d.valor_aplicado) || 0;
        const intVal = Number(d.intereses) || 0;
        const cobroMas = Boolean(d.cobro_intereses_de_mas);
        const otros = cobroMas ? Math.round(Number(d.otros_cobros) || 0) : 0;
        return {
          prestamo_id: d.prestamo_id,
          valor_aplicado: val,
          intereses: intVal,
          cobro_intereses_de_mas: cobroMas,
          otros_cobros: otros,
          cuota_id: d.cuota_id || null,
          cuota_numero: d.cuota_numero || null,
          capital: Math.max(0, val - intVal - otros)
        };
      }),
      notas: nuevasNotas !== undefined ? nuevasNotas : abono.notas
    });

    for (const d of detallesFinales) {
      if (d.prestamo_id) {
        await reconciliarCuotasPrestamo(entities, d.prestamo_id);
      }
    }

    await recalcularSaldos(entities);
    return { success: true, abono: updatedAbono };
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
      : generarAmortizacionMesVencido(p.capital, tasaNom, periodo, numCuotas, fechaPrestamo);

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
      periodo: periodo,
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
      : generarAmortizacionMesVencido(nuevoCapital, p.tasa_nominal, p.periodo || "mensual", p.numero_cuotas, p.fecha_prestamo);

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
      try {
        await reconciliarCuotasPrestamo(entities, p.id);
        count++;
      } catch (errP) {
        console.warn(`Error reconciliando préstamo ${p.codigo || p.id}:`, errP);
      }
    }

    await recalcularSaldos(entities);
    return { success: true, actualizados: count };
  }

  return { success: true, ...params };
}

function rooftopAddMonths(dateStr, months) {
  const d = new Date(dateStr + "T00:00:00");
  d.setMonth(d.getMonth() + Number(months));
  return d.toISOString().substring(0, 10);
}

function rooftopDiaDesdeFecha(fechaStr) {
  return new Date((fechaStr || "") + "T00:00:00").getDate() || 1;
}

function rooftopGetPrimerVencimiento(fechaInicio, diaPago) {
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

function rooftopGetFechaVencimiento(diaPago, periodo) {
  return periodo + "-" + String(diaPago).padStart(2, "0");
}

function rooftopCalcularDiasMora(fechaPago, fechaVencimiento) {
  const pago = new Date(fechaPago + "T00:00:00");
  const venc = new Date(fechaVencimiento + "T00:00:00");
  const diff = Math.floor((pago - venc) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : 0;
}

async function rooftopGenerarCodigoArriendo(entities) {
  let consec = (await entities.Consecutivo.filter({ tipo: "arriendo" }).catch(() => []))?.[0];
  let maxNum = consec ? Number(consec.ultimo_numero) || 0 : 0;

  const contratos = await entities.ContratoArriendo.list().catch(() => []);
  for (const c of contratos) {
    if (c.codigo && c.codigo.startsWith("ARR-")) {
      const n = parseInt(c.codigo.replace("ARR-", ""), 10);
      if (!isNaN(n) && n > maxNum) maxNum = n;
    }
  }

  const nextNum = maxNum + 1;
  if (consec) {
    await entities.Consecutivo.update(consec.id, { ultimo_numero: nextNum }).catch(() => {});
  } else {
    await entities.Consecutivo.create({ tipo: "arriendo", año: 0, ultimo_numero: nextNum }).catch(() => {});
  }
  return "ARR-" + String(nextNum).padStart(3, "0");
}

async function rooftopResolverInquilino(entities, id) {
  if (!id) return null;
  try {
    const inq = await entities.Inquilino.get(id);
    if (inq) return inq;
  } catch {}
  try {
    const cli = await entities.Cliente.get(id);
    if (cli) return cli;
  } catch {}
  return null;
}

export async function gestionarRooftop(entities, payload = {}) {
  const action = payload.action || payload.accion;

  if (action === "actualizarEstadoContratos") {
    const hoy = new Date().toISOString().substring(0, 10);
    const hoyDate = new Date(hoy + "T00:00:00");

    const contratos = await entities.ContratoArriendo.list().catch(() => []);
    let contratos_actualizados = 0;
    for (const c of (contratos || [])) {
      if (c.estado === "vigente" && c.fecha_fin) {
        const fechaFin = new Date(c.fecha_fin + "T00:00:00");
        const diffDays = Math.floor((fechaFin - hoyDate) / (1000 * 60 * 60 * 24));
        if (diffDays < 0) {
          await entities.ContratoArriendo.update(c.id, { estado: "vencido" });
          contratos_actualizados++;
        } else if (diffDays <= 30) {
          await entities.ContratoArriendo.update(c.id, { estado: "por_vencer" });
          contratos_actualizados++;
        }
      }
    }

    const pagos = await entities.PagoArriendo.list().catch(() => []);
    let pagos_en_mora = 0;
    for (const p of (pagos || [])) {
      if ((p.estado === "pendiente" || p.estado === "parcial") && p.fecha_vencimiento) {
        const fechaVenc = new Date(p.fecha_vencimiento + "T00:00:00");
        const diffDays = Math.floor((hoyDate - fechaVenc) / (1000 * 60 * 60 * 24));
        if (diffDays > 0) {
          await entities.PagoArriendo.update(p.id, {
            estado: "en_mora",
            dias_mora: diffDays
          });
          pagos_en_mora++;
        }
      }
    }
    return { success: true, contratos_actualizados, pagos_en_mora };
  }

  if (action === "crearContrato") {
    const {
      inmueble_id, inquilino_id, fecha_inicio, duracion_meses, tipo_contrato,
      valor_arriendo, valor_deposito, cda_pago_id, fecha_deposito, notas
    } = payload;

    const inmueble = await entities.Inmueble.get(inmueble_id);
    if (!inmueble) throw new Error("Inmueble no encontrado");
    if (inmueble.estado === "ocupado") {
      throw new Error(`El inmueble "${inmueble.nombre}" ya está ocupado. No se puede crear un segundo contrato.`);
    }

    const contratosActivos = await entities.ContratoArriendo.filter({
      inmueble_id,
      estado: { $in: ["vigente", "por_vencer"] }
    }).catch(() => []);
    if (contratosActivos && contratosActivos.length > 0) {
      throw new Error(`El inmueble "${inmueble.nombre}" tiene un contrato activo (${contratosActivos[0].codigo || 'vigente'}). Termínelo antes de crear uno nuevo.`);
    }

    const codigo = await rooftopGenerarCodigoArriendo(entities);
    const meses = Number(duracion_meses) || 6;
    const fecha_fin = rooftopAddMonths(fecha_inicio, meses);

    const contrato = await entities.ContratoArriendo.create({
      codigo,
      inmueble_id,
      inquilino_id,
      fecha_inicio,
      fecha_fin,
      duracion_meses: meses,
      tipo_contrato: tipo_contrato || null,
      valor_arriendo: Number(valor_arriendo) || 0,
      valor_deposito: Number(valor_deposito) || 0,
      estado: "vigente",
      deposito_pagado: false,
      alertas_enviadas: 0,
      notas: notas || ""
    });

    await entities.Inmueble.update(inmueble_id, {
      estado: "ocupado",
      inquilino_id
    });

    const diaPago = rooftopDiaDesdeFecha(fecha_inicio);
    const fecha_vencimiento = rooftopGetPrimerVencimiento(fecha_inicio, diaPago);
    const periodo = fecha_vencimiento.substring(0, 7);
    const hoyStr = new Date().toISOString().substring(0, 10);
    const diasMoraInicial = hoyStr > fecha_vencimiento ? rooftopCalcularDiasMora(hoyStr, fecha_vencimiento) : 0;
    const estadoInicial = diasMoraInicial > 0 ? "en_mora" : "pendiente";

    await entities.PagoArriendo.create({
      inmueble_id,
      contrato_id: contrato.id,
      inquilino_id,
      periodo,
      fecha_vencimiento,
      valor_esperado: Number(valor_arriendo) || 0,
      valor_pagado: 0,
      saldo_restante: Number(valor_arriendo) || 0,
      dias_mora: diasMoraInicial,
      estado: estadoInicial
    });

    let comprobante_deposito = null;
    if (cda_pago_id && Number(valor_deposito) > 0) {
      try {
        const cda = await entities.CuentaAhorro.get(cda_pago_id);
        const inq = await rooftopResolverInquilino(entities, inquilino_id);
        const inqNom = inq?.nombre_completo || inq?.nombre || "";
        const compRes = await createComprobante(entities, {
          tipo: "diario",
          fecha: fecha_deposito || fecha_inicio,
          descripcion: "Depósito arriendo - " + inmueble.nombre,
          movimientos: [
            {
              subcuenta: cda.subcuenta_puc,
              debito: Number(valor_deposito),
              credito: 0,
              descripcion: "Ingreso depósito arriendo",
              cuenta_ahorro_id: cda_pago_id,
              modelo_negocio: "alekerooftop"
            },
            {
              subcuenta: "220513",
              debito: 0,
              credito: Number(valor_deposito),
              descripcion: "Depósito en garantía - " + inqNom,
              tercero: inqNom,
              cliente_id: inquilino_id,
              modelo_negocio: "alekerooftop"
            }
          ]
        });
        comprobante_deposito = compRes?.comprobante;
        await entities.ContratoArriendo.update(contrato.id, {
          deposito_pagado: true,
          comprobante_deposito_id: compRes?.comprobante?.id || null
        });
      } catch (depErr) {
        console.warn("No se pudo contabilizar el depósito inicial:", depErr);
      }
    }

    return { success: true, contrato, pagos_generados: 1, comprobante_deposito };
  }

  if (action === "registrarPago") {
    const { pago_arriendo_id, valor_pagado, fecha_pago, cuenta_ingreso, notas } = payload;
    const pago = await entities.PagoArriendo.get(pago_arriendo_id);
    if (!pago) throw new Error("Pago no encontrado");
    if (pago.estado === "pagado") throw new Error("Este pago ya fue registrado como pagado.");

    const contrato = await entities.ContratoArriendo.get(pago.contrato_id);
    const inmueble = await entities.Inmueble.get(pago.inmueble_id);
    const inquilino = await rooftopResolverInquilino(entities, pago.inquilino_id);
    const inqNom = inquilino?.nombre_completo || inquilino?.nombre || "";

    const valorAbono = Number(valor_pagado) || 0;
    const totalPagado = (Number(pago.valor_pagado) || 0) + valorAbono;
    const dias_mora = rooftopCalcularDiasMora(fecha_pago, pago.fecha_vencimiento);
    const saldo_restante = Math.max(0, (Number(pago.valor_esperado) || 0) - totalPagado);

    let estado = "pendiente";
    if (totalPagado >= (Number(pago.valor_esperado) || 0)) {
      estado = "pagado";
    } else if (totalPagado > 0) {
      estado = "parcial";
    }

    const esTeresa = (inmueble?.nombre || "").trim() === "203";
    const subcuentaIngreso = esTeresa ? "220505" : "410504";
    const descIngreso = esTeresa
      ? "Arriendo Apto 203 (Teresa) - " + inmueble.nombre
      : "Ingreso arriendo - " + inmueble.nombre;

    let compRes = null;
    if (cuenta_ingreso?.subcuenta && valorAbono > 0) {
      compRes = await createComprobante(entities, {
        tipo: "diario",
        fecha: fecha_pago,
        descripcion: "Arriendo " + pago.periodo + " - " + inmueble.nombre,
        movimientos: [
          {
            subcuenta: cuenta_ingreso.subcuenta,
            debito: valorAbono,
            credito: 0,
            descripcion: "Cobro arriendo " + pago.periodo,
            cuenta_ahorro_id: cuenta_ingreso.cuenta_ahorro_id || null,
            producto_credito_id: cuenta_ingreso.producto_credito_id || null,
            tipo_movimiento_tdc: cuenta_ingreso.producto_credito_id ? "abono" : null,
            modelo_negocio: "alekerooftop"
          },
          {
            subcuenta: subcuentaIngreso,
            debito: 0,
            credito: valorAbono,
            descripcion: descIngreso,
            tercero: inqNom,
            cliente_id: pago.inquilino_id,
            modelo_negocio: "alekerooftop"
          }
        ]
      });
    }

    await entities.PagoArriendo.update(pago_arriendo_id, {
      valor_pagado: totalPagado,
      fecha_pago_real: fecha_pago,
      dias_mora,
      estado,
      saldo_restante,
      comprobante_id: compRes?.comprobante?.id || pago.comprobante_id || null,
      notas: notas || pago.notas || ""
    });

    let siguiente_periodo_creado = null;
    if (estado === "pagado" && contrato && (contrato.estado === "vigente" || contrato.estado === "por_vencer")) {
      const [año, mes] = pago.periodo.split("-").map(Number);
      const siguienteMes = mes === 12 ? 1 : mes + 1;
      const siguienteAño = mes === 12 ? año + 1 : año;
      const siguientePeriodo = siguienteAño + "-" + String(siguienteMes).padStart(2, "0");

      const existentes = await entities.PagoArriendo.filter({
        contrato_id: pago.contrato_id,
        periodo: siguientePeriodo
      }).catch(() => []);
      if (!existentes || existentes.length === 0) {
        const diaPago = rooftopDiaDesdeFecha(contrato.fecha_inicio);
        const siguienteVencimiento = rooftopGetFechaVencimiento(diaPago, siguientePeriodo);
        const hoyStr = new Date().toISOString().substring(0, 10);
        const diasMoraSig = hoyStr > siguienteVencimiento ? rooftopCalcularDiasMora(hoyStr, siguienteVencimiento) : 0;
        const estadoSig = diasMoraSig > 0 ? "en_mora" : "pendiente";

        siguiente_periodo_creado = await entities.PagoArriendo.create({
          inmueble_id: pago.inmueble_id,
          contrato_id: pago.contrato_id,
          inquilino_id: pago.inquilino_id,
          periodo: siguientePeriodo,
          fecha_vencimiento: siguienteVencimiento,
          valor_esperado: contrato.valor_arriendo,
          valor_pagado: 0,
          saldo_restante: contrato.valor_arriendo,
          dias_mora: diasMoraSig,
          estado: estadoSig
        });
      }
    }

    return {
      success: true,
      pago_actualizado: { ...pago, valor_pagado: totalPagado, dias_mora, estado, saldo_restante },
      comprobante: compRes?.comprobante,
      siguiente_periodo_creado
    };
  }

  if (action === "abonarDeposito") {
    const { contrato_id, valor, cuenta_ingreso, fecha, notas } = payload;
    const contrato = await entities.ContratoArriendo.get(contrato_id);
    if (!contrato) throw new Error("Contrato no encontrado");
    const inmueble = await entities.Inmueble.get(contrato.inmueble_id);
    const inquilino = await rooftopResolverInquilino(entities, contrato.inquilino_id);
    const inqNom = inquilino?.nombre_completo || inquilino?.nombre || "";
    const valorNum = Number(valor) || 0;

    const compRes = await createComprobante(entities, {
      tipo: "diario",
      fecha: fecha || new Date().toISOString().substring(0, 10),
      descripcion: "Abono depósito - " + (inmueble?.nombre || ""),
      movimientos: [
        {
          subcuenta: cuenta_ingreso.subcuenta,
          debito: valorNum,
          credito: 0,
          descripcion: "Abono depósito en garantía",
          cuenta_ahorro_id: cuenta_ingreso.cuenta_ahorro_id || null,
          producto_credito_id: cuenta_ingreso.producto_credito_id || null,
          tipo_movimiento_tdc: cuenta_ingreso.producto_credito_id ? "abono" : null,
          modelo_negocio: "alekerooftop"
        },
        {
          subcuenta: "220513",
          debito: 0,
          credito: valorNum,
          descripcion: "Depósito en garantía - " + inqNom,
          tercero: inqNom,
          cliente_id: contrato.inquilino_id,
          modelo_negocio: "alekerooftop"
        }
      ]
    });

    const movs = await entities.MovimientoContable.filter({
      subcuenta: "220513",
      cliente_id: contrato.inquilino_id,
      estado: "activo"
    }).catch(() => []);
    const totalDeposit = (movs || []).reduce((s, m) => s + (Number(m.credito) || 0) - (Number(m.debito) || 0), 0);
    if (totalDeposit >= Number(contrato.valor_deposito || 0)) {
      await entities.ContratoArriendo.update(contrato.id, { deposito_pagado: true });
    }

    return { success: true, comprobante: compRes?.comprobante };
  }

  if (action === "terminarContrato") {
    const { contrato_id, devolver_deposito, cda_devolucion_id, fecha_terminacion, motivo } = payload;
    const contrato = await entities.ContratoArriendo.get(contrato_id);
    if (!contrato) throw new Error("Contrato no encontrado");
    const inmueble = await entities.Inmueble.get(contrato.inmueble_id);

    let comprobante = null;
    if (devolver_deposito && Number(contrato.valor_deposito) > 0 && cda_devolucion_id) {
      const cda = await entities.CuentaAhorro.get(cda_devolucion_id);
      const compRes = await createComprobante(entities, {
        tipo: "diario",
        fecha: fecha_terminacion || new Date().toISOString().substring(0, 10),
        descripcion: "Devolución depósito - " + (inmueble?.nombre || ""),
        movimientos: [
          {
            subcuenta: "220513",
            debito: Number(contrato.valor_deposito),
            credito: 0,
            descripcion: "Devolución depósito en garantía",
            modelo_negocio: "alekerooftop"
          },
          {
            subcuenta: cda.subcuenta_puc,
            debito: 0,
            credito: Number(contrato.valor_deposito),
            descripcion: "Salida devolución depósito",
            cuenta_ahorro_id: cda_devolucion_id,
            modelo_negocio: "alekerooftop"
          }
        ]
      });
      comprobante = compRes?.comprobante;
    }

    await entities.ContratoArriendo.update(contrato_id, {
      estado: "terminado",
      notas: (motivo ? motivo + "\n" : "") + (contrato.notas || "")
    });

    await entities.Inmueble.update(contrato.inmueble_id, {
      estado: "disponible",
      inquilino_id: null
    });

    const pendientes = await entities.PagoArriendo.filter({ contrato_id, estado: "pendiente" }).catch(() => []);
    for (const p of (pendientes || [])) {
      await entities.PagoArriendo.update(p.id, { estado: "condonado" }).catch(() => {});
    }

    return { success: true, contrato_terminado: contrato_id, comprobante };
  }

  if (action === "renovarContrato") {
    const { contrato_id, nuevo_valor_arriendo, nueva_fecha_inicio } = payload;
    const contratoAnt = await entities.ContratoArriendo.get(contrato_id);
    if (!contratoAnt) throw new Error("Contrato no encontrado");

    await entities.ContratoArriendo.update(contrato_id, { estado: "renovado" });

    const codigo = await rooftopGenerarCodigoArriendo(entities);
    const fecha_fin = rooftopAddMonths(nueva_fecha_inicio, 6);
    const nuevoCanon = Number(nuevo_valor_arriendo) || contratoAnt.valor_arriendo;
    const valor_deposito = nuevoCanon / 2;

    const nuevoContrato = await entities.ContratoArriendo.create({
      codigo,
      inmueble_id: contratoAnt.inmueble_id,
      inquilino_id: contratoAnt.inquilino_id,
      fecha_inicio: nueva_fecha_inicio,
      fecha_fin,
      duracion_meses: 6,
      tipo_contrato: contratoAnt.tipo_contrato || "EDIFICIO",
      valor_arriendo: nuevoCanon,
      valor_deposito,
      estado: "vigente",
      deposito_pagado: false,
      alertas_enviadas: 0
    });

    const diaPago = rooftopDiaDesdeFecha(nueva_fecha_inicio);
    const fecha_vencimiento = rooftopGetPrimerVencimiento(nueva_fecha_inicio, diaPago);
    const periodo = fecha_vencimiento.substring(0, 7);

    await entities.PagoArriendo.create({
      inmueble_id: contratoAnt.inmueble_id,
      contrato_id: nuevoContrato.id,
      inquilino_id: contratoAnt.inquilino_id,
      periodo,
      fecha_vencimiento,
      valor_esperado: nuevoCanon,
      valor_pagado: 0,
      saldo_restante: nuevoCanon,
      dias_mora: 0,
      estado: "pendiente"
    });

    return { success: true, contrato_anterior: contrato_id, contrato_nuevo: nuevoContrato };
  }

  return { success: true, ...payload };
}

// Mapeo canónico de bancos y subcuentas PUC estándar
const BANCOS_PUC_MAP = {
  BA: { name: "Bancolombia", sub1110: 111001, sub2110: 211001, sub2105: 210501 },
  DA: { name: "Davivienda", sub1110: 111002, sub2110: 211002, sub2105: 210502 },
  CO: { name: "Colpatria", sub1110: 111003, sub2110: 211003, sub2105: 210503 },
  IT: { name: "Itaú", sub1110: 111004, sub2110: 211006, sub2105: 210506 },
  NU: { name: "Nubank", sub1110: 111007, sub2110: 211007, sub2105: 210507 },
  OC: { name: "Occidente", sub1110: 111008, sub2110: 211008, sub2105: 210508 },
  PO: { name: "Popular", sub1110: 111009, sub2110: 211009, sub2105: 210509 },
  TU: { name: "Tuya", sub1110: 111011, sub2110: 211011, sub2105: 210511 },
  FA: { name: "Falabella", sub1110: 111012, sub2110: 211012, sub2105: 210512 },
  BB: { name: "BBVA", sub1110: 111013, sub2110: 211013, sub2105: 210513 },
  BO: { name: "Bogotá", sub1110: 111014, sub2110: 211014, sub2105: 210514 },
  SE: { name: "Serfinanza", sub1110: 111016, sub2110: 211016, sub2105: 210516 },
};

function normalizarTextoPUC(txt) {
  return String(txt || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Crea o recupera la cuenta contable (nivel Auxiliar) en el PUC para un producto bancario (TDC / Crédito) o CDA.
 * Respeta rigurosamente la jerarquía del PUC:
 *  - Cuentas de Ahorro (CDA): Clase 1 -> Grupo 11 -> Cuenta 1110 (Bancos) -> Subcuenta Banco (1110xx) -> Auxiliar (1110xxxx) [Débito]
 *  - Tarjetas de Crédito (TDC): Clase 2 -> Grupo 21 -> Cuenta 2110 (Tarjetas de Crédito) -> Subcuenta Banco (2110xx) -> Auxiliar (2110xxxx) [Crédito]
 *  - Otros Créditos (CH, LIB, CR, etc.): Clase 2 -> Grupo 21 -> Cuenta 2105 (Otros Productos Bancarios) -> Subcuenta Banco (2105xx) -> Auxiliar (2105xxxx) [Crédito]
 */
export async function crearCuentaPUCProducto(entities, { categoriaProducto, tipo, banco, nombre }) {
  const isCda = categoriaProducto === "CDA" || tipo === "CDA";
  const isTdc = !isCda && (categoriaProducto === "TDC" || tipo === "TDC");

  let parentCuentaCodigo = 1110;
  let clase = 1;
  let claseNombre = "Activo";
  let grupo = 11;
  let naturaleza = "Débito";

  if (isTdc) {
    parentCuentaCodigo = 2110;
    clase = 2;
    claseNombre = "Pasivo";
    grupo = 21;
    naturaleza = "Crédito";
  } else if (!isCda) {
    parentCuentaCodigo = 2105;
    clase = 2;
    claseNombre = "Pasivo";
    grupo = 21;
    naturaleza = "Crédito";
  }

  const bancoKey = String(banco || "").toUpperCase().trim();
  const bancoDef = BANCOS_PUC_MAP[bancoKey] || Object.values(BANCOS_PUC_MAP).find(
    (b) => normalizarTextoPUC(b.name) === normalizarTextoPUC(banco)
  );
  const bancoNombreFinal = bancoDef?.name || banco || "BANCO";

  // Listar cuentas para determinar códigos disponibles
  const todasCuentas = await entities.Cuenta.list("codigo", 3000);

  // Subcuentas bajo la cuenta padre
  const subcuentasExistentes = todasCuentas.filter(
    (c) => c.nivel === "Subcuenta" && Math.floor(Number(c.codigo) / 100) === parentCuentaCodigo
  );

  const normBancoBuscado = normalizarTextoPUC(bancoNombreFinal);
  let subcuentaEncontrada = subcuentasExistentes.find((c) => {
    const normConcepto = normalizarTextoPUC(c.concepto);
    if (normBancoBuscado && (normConcepto.includes(normBancoBuscado) || normBancoBuscado.includes(normConcepto))) {
      return true;
    }
    if (bancoKey && bancoKey.length === 2 && normConcepto.includes(normalizarTextoPUC(bancoKey))) {
      return true;
    }
    return false;
  });

  let subcuentaCodigo;
  if (subcuentaEncontrada) {
    subcuentaCodigo = Number(subcuentaEncontrada.codigo);
  } else {
    let suggestedCode = null;
    if (bancoDef) {
      if (isCda && bancoDef.sub1110) suggestedCode = bancoDef.sub1110;
      else if (isTdc && bancoDef.sub2110) suggestedCode = bancoDef.sub2110;
      else if (!isCda && !isTdc && bancoDef.sub2105) suggestedCode = bancoDef.sub2105;
    }

    const yaUsado = suggestedCode && todasCuentas.some((c) => Number(c.codigo) === suggestedCode);
    if (!suggestedCode || yaUsado) {
      const maxSub = subcuentasExistentes.reduce((max, c) => Math.max(max, Number(c.codigo)), parentCuentaCodigo * 100);
      subcuentaCodigo = maxSub + 1;
    } else {
      subcuentaCodigo = suggestedCode;
    }

    const nuevaSub = await entities.Cuenta.create({
      codigo: subcuentaCodigo,
      nivel: "Subcuenta",
      clase,
      clase_nombre: claseNombre,
      grupo,
      cuenta: parentCuentaCodigo,
      subcuenta: subcuentaCodigo,
      auxiliar: null,
      concepto: bancoNombreFinal.toUpperCase(),
      naturaleza,
      tipo_estado: "Balance",
      es_transaccional: false
    });
    todasCuentas.push(nuevaSub);
  }

  // Buscar o crear cuenta Auxiliar (8 dígitos)
  const auxiliares = todasCuentas.filter(
    (c) => c.nivel === "Auxiliar" && Math.floor(Number(c.codigo) / 100) === subcuentaCodigo
  );

  // Si ya existe un auxiliar con este concepto en la subcuenta, reutilizarlo
  const normNombre = normalizarTextoPUC(nombre);
  const existente = auxiliares.find((c) => normalizarTextoPUC(c.concepto) === normNombre);
  if (existente) {
    return String(existente.codigo);
  }

  const baseAux = subcuentaCodigo * 100;
  const maxAux = auxiliares.reduce((max, c) => Math.max(max, Number(c.codigo)), baseAux);
  const nextAuxCodigo = maxAux + 1;
  const auxNum = nextAuxCodigo - baseAux;

  await entities.Cuenta.create({
    codigo: nextAuxCodigo,
    nivel: "Auxiliar",
    clase,
    clase_nombre: claseNombre,
    grupo,
    cuenta: parentCuentaCodigo,
    subcuenta: subcuentaCodigo,
    auxiliar: auxNum,
    concepto: String(nombre || "").trim(),
    naturaleza,
    tipo_estado: "Balance",
    es_transaccional: true
  });

  return String(nextAuxCodigo);
}

export async function gestionarTarjeta(entities, payload = {}) {
  const { accion, operacion, ...params } = payload;
  const op = accion || operacion;

  if (op === "crear") {
    const {
      tipo = "TDC",
      banco,
      titular_id,
      cupo,
      saldo,
      fecha_corte,
      digitos_ref,
      nombre,
      numero_completo,
      franquicia,
      categoria,
      corte_modo,
      corte_semana,
      corte_dia_semana,
      subcuenta_puc,
      ...extra
    } = params;

    if (!banco || !titular_id) {
      throw new Error("Banco y titular son obligatorios");
    }

    const dRef = digitos_ref || (numero_completo ? String(numero_completo).replace(/\D/g, "").slice(-4) : "");
    const nombreFinal = nombre || (tipo === "TDC" ? `TDC - ${dRef}` : `${tipo} - ${dRef}`);

    // Auto-generar código interno y nomenclatura si no vienen
    let codInterno = params.codigo_interno;
    let nomenc = params.nomenclatura;
    if (!codInterno || !nomenc) {
      const prods = await entities.ProductoCredito.filter({ banco, tipo });
      let maxNum = 0;
      prods.forEach((p) => {
        const base = p.codigo_interno || (p.nomenclatura || "").replace(/-\d+$/, "");
        const match = base.match(/(\d+)$/);
        if (match) maxNum = Math.max(maxNum, Number(match[1]));
      });
      const generatedCod = `${banco}${String(maxNum + 1).padStart(3, "0")}`;
      codInterno = codInterno || generatedCod;
      nomenc = nomenc || generatedCod;
    }

    // Auto-crear cuenta PUC con la jerarquía correspondiente si no viene asignada
    let finalSubcuentaPuc = subcuenta_puc;
    if (!finalSubcuentaPuc) {
      finalSubcuentaPuc = await crearCuentaPUCProducto(entities, {
        categoriaProducto: tipo === "TDC" ? "TDC" : "OTRO_CREDITO",
        tipo,
        banco,
        nombre: nombreFinal
      });
    }

    const now = new Date().toISOString();
    const dataToCreate = {
      ...extra,
      nombre: nombreFinal,
      numero_completo: numero_completo ? String(numero_completo).trim() : "",
      tipo,
      banco,
      titular_id,
      cupo: Number(cupo) || 0,
      saldo: Number(saldo) || 0,
      fecha_corte: Number(fecha_corte) || 1,
      franquicia: tipo === "TDC" ? (franquicia || "") : "",
      categoria: tipo === "TDC" ? (categoria || "") : "",
      corte_modo: corte_modo || "dia_fijo",
      corte_semana: corte_modo === "dia_semana" ? (Number(corte_semana) || 1) : 0,
      corte_dia_semana: corte_modo === "dia_semana" ? (Number(corte_dia_semana) || 5) : 0,
      estado: params.estado || "activo",
      version_consecutivo: params.version_consecutivo || 1,
      codigo_interno: codInterno,
      nomenclatura: nomenc,
      subcuenta_puc: String(finalSubcuentaPuc),
      operacion: params.operacion || "creacion",
      operacion_fecha: now,
      operacion_detalle: params.operacion_detalle || "Creación de producto bancario con cuenta contable PUC"
    };

    const tarjeta = await entities.ProductoCredito.create(dataToCreate);
    return { success: true, tarjeta, producto: tarjeta, subcuenta_puc: finalSubcuentaPuc };
  }

  if (op === "editar") {
    const tarjetaId = params.id || params.tarjeta_id;
    const updated = await entities.ProductoCredito.update(tarjetaId, params);
    // Sincronizar concepto en el PUC si cambió de nombre
    if (params.nombre && updated?.subcuenta_puc) {
      const cuentas = await entities.Cuenta.filter({ codigo: Number(updated.subcuenta_puc) });
      if (cuentas.length > 0) {
        await entities.Cuenta.update(cuentas[0].id, { concepto: params.nombre.trim() });
      }
    }
    return { success: true, tarjeta: updated, producto: updated };
  }

  if (op === "reemplazo") {
    const tarjetaId = params.tarjeta_id || params.id;
    const tarjeta = await entities.ProductoCredito.get(tarjetaId);
    if (!tarjeta) throw new Error("Tarjeta no encontrada");

    const digitos = String(params.nuevos_digitos || "").replace(/\D/g, "").slice(-4);
    if (!digitos) throw new Error("Debe ingresar los 4 últimos dígitos del nuevo plástico");

    const nuevoNombre = `TDC - ${digitos}`;
    const codInterno = tarjeta.codigo_interno || (tarjeta.nomenclatura || "").replace(/-\d+$/, "");
    const nuevaVersion = (Number(tarjeta.version_consecutivo) || 1) + 1;
    const nuevaNomenclatura = `${codInterno}-${nuevaVersion}`;
    const now = new Date().toISOString();

    // Actualizar nombre en la cuenta contable existente
    if (tarjeta.subcuenta_puc) {
      const cuentas = await entities.Cuenta.filter({ codigo: Number(tarjeta.subcuenta_puc) });
      if (cuentas.length > 0) {
        await entities.Cuenta.update(cuentas[0].id, { concepto: nuevoNombre });
      }
    }

    // Inhabilitar tarjeta anterior
    await entities.ProductoCredito.update(tarjetaId, {
      estado: "inactivo",
      operacion_detalle: `Reemplazada por ${nuevaNomenclatura} el ${now.substring(0, 10)}`
    });

    // Crear la nueva versión
    const padreId = tarjeta.version_padre_id || tarjeta.id;
    const nueva = await entities.ProductoCredito.create({
      nomenclatura: nuevaNomenclatura,
      codigo_interno: codInterno,
      nombre: nuevoNombre,
      numero_completo: params.numero_completo ? String(params.numero_completo).trim() : (tarjeta.numero_completo || ""),
      tipo: params.tipo || tarjeta.tipo,
      banco: params.banco || tarjeta.banco,
      subcuenta_puc: tarjeta.subcuenta_puc,
      titular_id: tarjeta.titular_id,
      cupo: params.cupo !== undefined ? Number(params.cupo) : tarjeta.cupo,
      saldo: tarjeta.saldo || 0,
      fecha_corte: params.fecha_corte !== undefined ? Number(params.fecha_corte) : tarjeta.fecha_corte,
      franquicia: params.franquicia !== undefined ? params.franquicia : tarjeta.franquicia,
      categoria: params.categoria !== undefined ? params.categoria : tarjeta.categoria,
      corte_modo: params.corte_modo || tarjeta.corte_modo || "dia_fijo",
      corte_semana: params.corte_semana !== undefined ? Number(params.corte_semana) : tarjeta.corte_semana,
      corte_dia_semana: params.corte_dia_semana !== undefined ? Number(params.corte_dia_semana) : tarjeta.corte_dia_semana,
      estado: "activo",
      version_consecutivo: nuevaVersion,
      version_padre_id: padreId,
      version_anterior_id: tarjetaId,
      operacion: "reemplazo",
      operacion_fecha: now,
      operacion_detalle: `Reemplazo de plástico. Anterior: ${tarjeta.nombre} (${tarjeta.nomenclatura})`
    });

    return { success: true, tarjeta_anterior: tarjeta, tarjeta_nueva: nueva, tarjeta: nueva };
  }

  if (op === "unificacion") {
    const { tarjeta_origen_id, tarjeta_destino_id } = params;
    const origen = await entities.ProductoCredito.get(tarjeta_origen_id);
    const destino = await entities.ProductoCredito.get(tarjeta_destino_id);
    if (!origen || !destino) throw new Error("Tarjetas no encontradas para unificación");

    const nuevoCupo = (Number(destino.cupo) || 0) + (Number(origen.cupo) || 0);
    const nuevoSaldo = (Number(destino.saldo) || 0) + (Number(origen.saldo) || 0);
    const now = new Date().toISOString();

    await entities.ProductoCredito.update(destino.id, {
      cupo: nuevoCupo,
      saldo: nuevoSaldo,
      operacion_detalle: `Unificada con ${origen.nombre} el ${now.substring(0, 10)}`
    });

    await entities.ProductoCredito.update(origen.id, {
      estado: "inactivo",
      cupo: 0,
      saldo: 0,
      operacion_detalle: `Inhabilitada por unificación en ${destino.nombre} el ${now.substring(0, 10)}`
    });

    return { success: true, tarjeta_destino: destino, tarjeta_origen: origen };
  }

  if (op === "aumentoCupo") {
    const prodId = params.producto_credito_id || params.id;
    const nuevoCupo = Number(params.nuevo_cupo ?? params.cupo_total ?? params.cupo) || 0;
    const updated = await entities.ProductoCredito.update(prodId, {
      cupo: nuevoCupo
    });
    return { success: true, producto: updated, tarjeta: updated };
  }

  return { success: true, ...params };
}

export async function gestionarCuentaAhorro(entities, payload = {}) {
  const { operacion, accion, ...params } = payload;
  const op = operacion || accion;

  if (op === "crear") {
    const { banco, titular_id, numero_completo, nombre, saldo, nota, subcuenta_puc, ...extra } = params;

    if (!banco || !titular_id) {
      throw new Error("Banco y titular son obligatorios");
    }
    if (!numero_completo || !String(numero_completo).trim()) {
      throw new Error("El número de cuenta es obligatorio");
    }

    const dRef = String(numero_completo).replace(/\D/g, "").slice(-4);
    const nombreFinal = nombre || `CDA - ${dRef}`;

    // Auto-crear cuenta PUC bajo 1110 (Bancos) con jerarquía si no viene asignada
    let finalSubcuentaPuc = subcuenta_puc;
    if (!finalSubcuentaPuc) {
      finalSubcuentaPuc = await crearCuentaPUCProducto(entities, {
        categoriaProducto: "CDA",
        tipo: "CDA",
        banco,
        nombre: nombreFinal
      });
    }

    const dataToCreate = {
      ...extra,
      nombre: nombreFinal,
      numero_completo: String(numero_completo).trim(),
      banco,
      subcuenta_puc: String(finalSubcuentaPuc),
      titular_id,
      saldo: Number(saldo) || 0,
      estado: params.estado || "activa",
      movimientos_mes_acumulado: Number(params.movimientos_mes_acumulado) || 0,
      nota: String(nota || "").trim()
    };

    const cda = await entities.CuentaAhorro.create(dataToCreate);
    return { success: true, cuentaAhorro: cda, cuenta: cda, subcuenta_puc: finalSubcuentaPuc };
  }

  if (op === "editar" || op === "actualizar") {
    const cdaId = params.id || params.cuenta_id;
    const updated = await entities.CuentaAhorro.update(cdaId, params);
    // Sincronizar concepto en el PUC si cambió de nombre
    if (params.nombre && updated?.subcuenta_puc) {
      const cuentas = await entities.Cuenta.filter({ codigo: Number(updated.subcuenta_puc) });
      if (cuentas.length > 0) {
        await entities.Cuenta.update(cuentas[0].id, { concepto: params.nombre.trim() });
      }
    }
    return { success: true, cuentaAhorro: updated, cuenta: updated };
  }

  return { success: true, ...params };
}

export async function gestionarCuentaPUC(entities, payload = {}) {
  const { operacion, accion, ...params } = payload;
  const op = operacion || accion;

  if (op === "crear") {
    const { nivel, parent_codigo, concepto, naturaleza, tipo_estado, es_transaccional, codigo } = params;

    if (codigo) {
      const cuenta = await entities.Cuenta.create(params);
      return { success: true, cuenta };
    }

    if (!nivel) throw new Error("Nivel es obligatorio");
    if (!concepto || !concepto.trim()) throw new Error("Concepto es obligatorio");

    const todas = await entities.Cuenta.list("-codigo", 2000);
    const nextCod = calcularNextCodigo(nivel, parent_codigo, todas);
    if (!nextCod) throw new Error("No hay códigos disponibles bajo la cuenta padre seleccionada");

    const s = String(nextCod);
    const comps = {
      clase: Number(s[0]),
      grupo: s.length >= 2 ? Number(s.slice(0, 2)) : null,
      cuenta: s.length >= 4 ? Number(s.slice(0, 4)) : null,
      subcuenta: s.length >= 6 ? Number(s.slice(0, 6)) : null,
      auxiliar: s.length >= 8 ? (nextCod - Number(s.slice(0, 6)) * 100) : null
    };

    const nuevaCuenta = await entities.Cuenta.create({
      codigo: nextCod,
      nivel,
      clase: comps.clase,
      clase_nombre: getClaseNombre(comps.clase),
      grupo: comps.grupo,
      cuenta: comps.cuenta,
      subcuenta: comps.subcuenta,
      auxiliar: comps.auxiliar,
      concepto: concepto.trim(),
      naturaleza: naturaleza || "Débito",
      tipo_estado: tipo_estado || "Balance",
      es_transaccional: !!es_transaccional
    });

    return { success: true, cuenta: nuevaCuenta };
  }

  if (op === "editar" || op === "actualizar") {
    const updated = await entities.Cuenta.update(params.id, params);
    return { success: true, cuenta: updated };
  }

  if (op === "eliminar") {
    if (!params.id) throw new Error("ID es obligatorio para eliminar");
    await entities.Cuenta.delete(params.id);
    return { success: true };
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
  const today = new Date().toISOString().substring(0, 10);
  const warnings = [];
  const resultados = [];

  // Helper local para desplazar meses en formato YYYY-MM-DD
  const shiftMonthStr = (strDate, deltaMonths) => {
    if (!strDate) return "";
    const parts = strDate.split("-").map(Number);
    const y = parts[0] || 2026;
    const m = parts[1] || 1;
    const d = parts[2] || 1;
    const dt = new Date(y, m - 1 + deltaMonths, d);
    const yy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const maxDays = new Date(yy, dt.getMonth() + 1, 0).getDate();
    const dd = String(Math.min(d, maxDays)).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
  };

  // 1. CARGA EN PARALELO ULTRA-RÁPIDA (1 sola ronda de red en lugar de N llamadas secuenciales)
  const [extractosTodos, prodsTodos, movsTodos] = await Promise.all([
    entities.ExtractoProducto.list("-periodo", 2000),
    entities.ProductoCredito.list(),
    entities.MovimientoContable.list("-fecha", 15000)
  ]);

  const prodMap = new Map((prodsTodos || []).map((p) => [p.id, p]));
  const subcuentaToProd = new Map();
  (prodsTodos || []).forEach((p) => {
    if (p.subcuenta_puc) subcuentaToProd.set(String(p.subcuenta_puc).trim(), p);
  });

  // Filtrar abonos contables válidos (excluir anulados/reversiones)
  const abonosValidos = (movsTodos || []).filter((m) => {
    const estado = String(m.estado || "activo").toLowerCase().trim();
    if (estado === "inactivo" || estado === "anulado" || estado === "reversado") return false;
    if (m.es_anulacion || m.es_reversion) return false;

    const esAbonoTipo = String(m.tipo_movimiento_tdc || "").toLowerCase().trim() === "abono";
    const esDebitoTDC = Number(m.debito) > 0 && (
      (m.producto_credito_id && prodMap.has(m.producto_credito_id)) ||
      (m.subcuenta && subcuentaToProd.has(String(m.subcuenta).trim()))
    );

    return esAbonoTipo || esDebitoTDC;
  });

  // Agrupar extractos por producto para calcular ventanas de facturación cronológicas
  const extsByProd = new Map();
  (extractosTodos || []).forEach((e) => {
    if (!extsByProd.has(e.producto_id)) extsByProd.set(e.producto_id, []);
    extsByProd.get(e.producto_id).push(e);
  });

  const updatesToRun = [];

  for (const [pId, pExts] of extsByProd.entries()) {
    // Si se especificó un producto_id o producto_ids de filtro, saltar los no solicitados
    if (producto_id && pId !== producto_id) continue;
    if (producto_ids && producto_ids.length > 0 && !producto_ids.includes(pId)) continue;

    const prod = prodMap.get(pId);

    // Ordenar extractos cronológicamente por fecha de corte / período
    pExts.sort((a, b) => {
      const fa = a.fecha_corte || a.periodo || "";
      const fb = b.fecha_corte || b.periodo || "";
      return fa.localeCompare(fb);
    });

    // Abonos pertenecientes a este producto
    const pAbonos = abonosValidos.filter((a) => {
      if (a.producto_credito_id === pId) return true;
      if (prod?.subcuenta_puc && String(a.subcuenta).trim() === String(prod.subcuenta_puc).trim()) return true;
      return false;
    });

    pExts.forEach((ext, idx) => {
      // Determinar la fecha de corte del extracto normalizada
      let fechaCorteExt = normalizeDate(ext.fecha_corte);
      const diaCorteProd = Math.floor(prod?.fecha_corte || 1);

      if (!fechaCorteExt && ext.periodo) {
        fechaCorteExt = `${ext.periodo}-${String(diaCorteProd).padStart(2, "0")}`;
      }

      // Ventana de pago: desde la fecha de corte del extracto hasta el próximo corte
      const nextExt = pExts[idx + 1];
      let fechaFinVentana;
      if (nextExt && nextExt.fecha_corte) {
        fechaFinVentana = normalizeDate(nextExt.fecha_corte);
      } else {
        fechaFinVentana = shiftMonthStr(fechaCorteExt, 1);
      }

      let totalAbonado = 0;
      pAbonos.forEach((a) => {
        const fAbono = normalizeDate(a.fecha);

        // 1. Coincidencia explícita
        const matchExplicit = (a.extracto_id && a.extracto_id === ext.id) ||
                              (a.periodo_extracto && a.periodo_extracto === ext.periodo);

        // 2. Coincidencia por ventana de facturación y pago
        // Los pagos se realizan a partir de la fecha de corte y antes del siguiente corte
        let matchFecha = false;
        if (fAbono && fechaCorteExt) {
          matchFecha = (fAbono >= fechaCorteExt && (!fechaFinVentana || fAbono < fechaFinVentana));
        }

        if (matchExplicit || matchFecha) {
          totalAbonado += Number(a.debito) || 0;
        }
      });

      totalAbonado = parseAndRoundCOP(totalAbonado, 2);
      const saldoPagar = parseAndRoundCOP(ext.saldo_a_pagar, 2);
      let saldoPendiente = parseAndRoundCOP(saldoPagar - totalAbonado, 2);
      if (Math.abs(saldoPendiente) < 0.01) saldoPendiente = 0;
      const sinDeuda = saldoPagar === 0;
      let porcentajePagado = saldoPagar > 0 ? parseAndRoundCOP((totalAbonado / saldoPagar) * 100, 2) : (sinDeuda ? 100 : 0);
      if (porcentajePagado > 100 && Math.abs(saldoPendiente) < 0.01) porcentajePagado = 100;
      const saldoAFavor = saldoPendiente < 0 ? parseAndRoundCOP(Math.abs(saldoPendiente), 2) : 0;
      const nuevoEstado = (sinDeuda || (saldoPagar > 0 && saldoPendiente <= 0)) ? "pagado" : ext.estado;

      const cambioValores =
        Number(ext.total_abonado) !== totalAbonado ||
        Number(ext.saldo_pendiente) !== saldoPendiente ||
        Number(ext.porcentaje_pagado) !== porcentajePagado ||
        Number(ext.saldo_a_favor || 0) !== saldoAFavor ||
        ext.estado !== nuevoEstado;

      if (cambioValores) {
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
        updatesToRun.push(entities.ExtractoProducto.update(ext.id, updateData));
      }

      resultados.push({
        extracto_id: ext.id,
        producto_id: ext.producto_id,
        total_abonado: totalAbonado,
        saldo_pendiente: saldoPendiente,
        porcentaje_pagado: porcentajePagado,
        estado: nuevoEstado
      });
    });
  }

  // Ejecutar todas las actualizaciones necesarias en paralelo
  if (updatesToRun.length > 0) {
    await Promise.all(updatesToRun);
  }

  return { resultados, warnings, actualizados: updatesToRun.length };
}

export async function procesarCargaMasiva(entities, payload = {}) {
  const t0 = Date.now();
  const { movimientos: rows = [] } = payload || {};
  if (!rows || rows.length === 0) {
    return {
      error: "No se recibieron movimientos",
      total_comprobantes: 0,
      creados: 0,
      fallidos: 0,
      total_movimientos: 0,
      duracion_ms: 0,
      resultados: [],
      errores: []
    };
  }

  // 1. Group rows by comprobante_numero
  const grupos = {};
  const ordenGrupos = [];
  for (const row of rows) {
    const num = String(row.comprobante_numero || '1');
    if (!grupos[num]) {
      grupos[num] = [];
      ordenGrupos.push(num);
    }
    grupos[num].push(row);
  }

  // 2. Fetch catalogs once in parallel
  const [pucList, prodsList, cdaList] = await Promise.all([
    entities.Cuenta.list().catch(() => []),
    entities.ProductoCredito.list().catch(() => []),
    entities.CuentaAhorro.list().catch(() => [])
  ]);

  const pucMap = {};
  (pucList || []).forEach((c) => { pucMap[String(c.codigo)] = c; });

  const prodsMap = {};
  const prodsByCode = {};
  (prodsList || []).forEach((p) => {
    prodsMap[p.id] = p;
    if (p.codigo_interno) {
      prodsByCode[String(p.codigo_interno).trim().toLowerCase()] = p;
    }
  });

  const cdaMap = {};
  (cdaList || []).forEach((c) => {
    if (c.subcuenta_puc) {
      cdaMap[String(c.subcuenta_puc)] = c.id;
    }
  });

  // 3. Group by year to reserve all consecutives in a single pass
  const groupsByYear = {};
  const today = new Date().toISOString().split("T")[0];

  for (const num of ordenGrupos) {
    const groupRows = grupos[num];
    const rawFecha = groupRows[0]?.fecha;
    const cleanFecha = normalizeDate(rawFecha) || today;
    const year = parseInt(cleanFecha.substring(0, 4), 10) || new Date().getFullYear();
    if (!groupsByYear[year]) groupsByYear[year] = [];
    groupsByYear[year].push({ num, cleanFecha, rows: groupRows });
  }

  const comprobanteNumerosMap = {}; // num -> "0001-2026"

  for (const [yearStr, yearGroups] of Object.entries(groupsByYear)) {
    const year = parseInt(yearStr, 10);
    const consecs = await entities.Consecutivo.filter({ año: year, tipo: "comprobante" });
    const consecRecord = consecs && consecs[0];
    let nextNum = (Number(consecRecord?.ultimo_numero) || 0) + 1;

    for (const g of yearGroups) {
      comprobanteNumerosMap[g.num] = `${String(nextNum).padStart(4, "0")}-${year}`;
      nextNum++;
    }

    const finalUltimo = nextNum - 1;
    if (consecRecord) {
      await entities.Consecutivo.update(consecRecord.id, { ultimo_numero: finalUltimo });
    } else {
      await entities.Consecutivo.create({
        año: year,
        tipo: "comprobante",
        ultimo_numero: finalUltimo
      });
    }
  }

  // 4. Assemble Comprobantes, Movimientos, and Historicos in memory
  const comprobantesToCreate = [];
  const movimientosToCreate = [];
  const historicosToCreate = [];
  const resultados = [];
  const errores = [];

  for (const num of ordenGrupos) {
    try {
      const groupRows = grupos[num];
      const rawFecha = groupRows[0]?.fecha;
      const cleanFecha = normalizeDate(rawFecha) || today;
      const periodoOp = cleanFecha.substring(0, 7);
      const descripcion = groupRows[0]?.descripcion || `Carga Masiva ${num}`;
      const numeroGenerado = comprobanteNumerosMap[num];

      let debTotal = 0;
      let credTotal = 0;
      for (const r of groupRows) {
        let d = Number(r.debito) || 0;
        let c = Number(r.credito) || 0;
        if (d < 0) { c += Math.abs(d); d = 0; }
        if (c < 0) { d += Math.abs(c); c = 0; }
        debTotal += d;
        credTotal += c;
      }

      const compId = `comp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}_${num}`;

      comprobantesToCreate.push({
        id: compId,
        numero: numeroGenerado,
        fecha: cleanFecha,
        tipo: 'diario',
        descripcion,
        estado: 'contabilizado',
        total_debito: debTotal,
        total_credito: credTotal
      });

      for (let i = 0; i < groupRows.length; i++) {
        const r = groupRows[i];
        let d = Number(r.debito) || 0;
        let c = Number(r.credito) || 0;
        if (d < 0) { c += Math.abs(d); d = 0; }
        if (c < 0) { d += Math.abs(c); c = 0; }

        const subcuentaStr = String(r.subcuenta || '').trim();
        const cuentaPuc = pucMap[subcuentaStr] || {};

        // Resolve product ID from col_9 or codigo_producto if not provided
        let prodId = r.producto_credito_id || '';
        const prodCode = String(r.col_9 || r.codigo_producto || '').trim().toLowerCase();
        if (!prodId && prodCode && prodsByCode[prodCode]) {
          prodId = prodsByCode[prodCode].id;
        }

        // Resolve CDA id from subcuenta if not provided
        let cdaId = r.cuenta_ahorro_id || '';
        if (!cdaId && cdaMap[subcuentaStr]) {
          cdaId = cdaMap[subcuentaStr];
        }

        // Resolve TDC movement type
        let tipoTdc = r.tipo_movimiento_tdc ? String(r.tipo_movimiento_tdc).trim().toLowerCase() : null;
        if (!tipoTdc && c > 0 && prodId && prodsMap[prodId]?.tipo === "TDC") {
          tipoTdc = "compra";
        }

        movimientosToCreate.push({
          id: `mov_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 7)}`,
          comprobante_id: compId,
          subcuenta: subcuentaStr,
          cuenta_nombre: r.cuenta_nombre || cuentaPuc.concepto || '',
          clase: r.clase || cuentaPuc.clase || (cuentaPuc.tipo_naturaleza || 'activo'),
          grupo: r.grupo || String(cuentaPuc.grupo || ''),
          cuenta: r.cuenta || String(cuentaPuc.cuenta || ''),
          debito: d,
          credito: c,
          descripcion: r.descripcion || descripcion,
          tercero: r.tercero || '',
          cliente_id: r.cliente_id || '',
          producto_credito_id: prodId,
          cuenta_ahorro_id: cdaId,
          tipo_movimiento_tdc: tipoTdc,
          periodo_extracto: r.periodo_extracto || '',
          periodo_operacion: periodoOp,
          estado: 'activo',
          fecha: cleanFecha
        });
      }

      historicosToCreate.push({
        id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 9)}_${num}`,
        comprobante_id: compId,
        numero_comprobante: numeroGenerado,
        accion: 'creacion',
        descripcion,
        monto_total: debTotal,
        usuario_email: 'multipagosstm@gmail.com',
        fecha: cleanFecha
      });

      resultados.push({
        comprobante_numero: num,
        numero_generado: numeroGenerado,
        total: debTotal,
        movimientos: groupRows.length
      });
    } catch (err) {
      errores.push({ comprobante_numero: num, error: err.message });
    }
  }

  // 5. Batch insert in chunks for high throughput
  const chunkArray = (arr, size) => {
    const chunks = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  };

  // Insert Comprobantes (batches of 50)
  for (const chunk of chunkArray(comprobantesToCreate, 50)) {
    await entities.ComprobanteContable.bulkCreate(chunk);
  }

  // Insert Movimientos (batches of 100)
  for (const chunk of chunkArray(movimientosToCreate, 100)) {
    await entities.MovimientoContable.bulkCreate(chunk);
  }

  // Insert Historicos (batches of 50)
  for (const chunk of chunkArray(historicosToCreate, 50)) {
    await entities.HistoricoContable.bulkCreate(chunk);
  }

  // 6. Recalculate balances EXACTLY ONCE
  try {
    await recalcularSaldos(entities);
  } catch (errRecalc) {
    console.warn("Recálculo tras carga masiva:", errRecalc);
  }

  const duracionMs = Date.now() - t0;

  return {
    total_comprobantes: ordenGrupos.length,
    creados: resultados.length,
    fallidos: errores.length,
    total_movimientos: movimientosToCreate.length,
    duracion_ms: duracionMs,
    resultados,
    errores
  };
}

export async function determinarVentanaConciliacion(entities, ext, prod, lineasBanco = []) {
  // 1. Fecha de corte actual (límite superior estricto)
  let fechaFin = normalizeDate(ext?.fecha_corte);
  const diaCorteProd = Math.floor(prod?.fecha_corte || 1);

  if (!fechaFin && ext?.periodo) {
    const parts = ext.periodo.split("-").map(Number);
    const y = parts[0] || 2026;
    const m = parts[1] || 1;
    const maxDays = new Date(y, m, 0).getDate();
    const d = Math.min(diaCorteProd, maxDays);
    fechaFin = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  // 2. Fecha de corte anterior (límite inferior)
  let fechaInicio = normalizeDate(ext?.fecha_inicio || ext?.fecha_corte_anterior);

  if (!fechaInicio && ext?.producto_id) {
    try {
      const extsProd = await entities.ExtractoProducto.filter({ producto_id: ext.producto_id });
      const extsAnteriores = (extsProd || [])
        .filter((e) => e.id !== ext.id && (e.fecha_corte || e.periodo))
        .sort((a, b) => {
          const fa = a.fecha_corte || a.periodo || "";
          const fb = b.fecha_corte || b.periodo || "";
          return fb.localeCompare(fa);
        });

      const prev = extsAnteriores.find((e) => {
        const f = normalizeDate(e.fecha_corte);
        return f && fechaFin && f < fechaFin;
      });

      if (prev?.fecha_corte) {
        fechaInicio = normalizeDate(prev.fecha_corte);
      }
    } catch {
      // Ignorar fallback
    }
  }

  // Si no hay fechaInicio previa, desplazar exactamente 1 mes hacia atrás desde fechaFin
  if (!fechaInicio && fechaFin) {
    const parts = fechaFin.split("-").map(Number);
    const y = parts[0];
    const m = parts[1];
    const d = parts[2];
    const dt = new Date(y, m - 2, d);
    const yy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const maxDays = new Date(yy, dt.getMonth() + 1, 0).getDate();
    const dd = String(Math.min(d, maxDays)).padStart(2, "0");
    fechaInicio = `${yy}-${mm}-${dd}`;
  }

  // Si las líneas del banco contienen transacciones con fechas ligeramente previas al corte (ej: festivos o fin de semana)
  if (lineasBanco && lineasBanco.length > 0 && fechaInicio) {
    const fechasLineas = lineasBanco.map((l) => normalizeDate(l.fecha)).filter(Boolean).sort();
    if (fechasLineas.length > 0) {
      const minFecha = fechasLineas[0];
      if (minFecha < fechaInicio) {
        const diffMs = new Date(fechaInicio).getTime() - new Date(minFecha).getTime();
        const diffDias = diffMs / (1000 * 60 * 60 * 24);
        if (diffDias <= 4) {
          fechaInicio = minFecha;
        }
      }
    }
  }

  return { fechaInicio, fechaFin };
}

export async function conciliarExtracto(entities, payload = {}) {
  const action = payload.action;
  const extractoId = payload.extracto_id || payload.extractoId || payload.id;

  if (action === "iniciarConciliacion") {
    const ext = (await entities.ExtractoProducto.get(extractoId)) || { id: extractoId };
    const prod = ext.producto_id ? await entities.ProductoCredito.get(ext.producto_id).catch(() => null) : null;
    const lineasBanco = (await entities.LineaExtracto.filter({ extracto_id: extractoId })) || [];
    
    const { fechaInicio, fechaFin } = await determinarVentanaConciliacion(entities, ext, prod, lineasBanco);

    const movsTodos = (await entities.MovimientoContable.list("-fecha", 35000)) || [];
    
    // Movimientos del período dentro de la ventana de corte
    const movs = movsTodos.filter(m => {
      const estado = String(m.estado || "activo").toLowerCase().trim();
      if (estado === "inactivo" || estado === "anulado" || estado === "reversado" || estado === "ignorado") return false;
      if (m.es_anulacion || m.es_reversion) return false;
      if (m.conciliacion_ignorada || m.estado_conciliacion === "ignorado") return false;

      const matchProd = (ext.producto_id && m.producto_credito_id === ext.producto_id) ||
                        (prod?.subcuenta_puc && String(m.subcuenta).trim() === String(prod.subcuenta_puc).trim());
      if (!matchProd) return false;

      // Asignación explícita
      if (m.extracto_id && m.extracto_id === ext.id) return true;
      if (m.periodo_extracto && m.periodo_extracto === ext.periodo) return true;

      // Si pertenece explícitamente a otro extracto o período diferente
      if (m.extracto_id && m.extracto_id !== ext.id) return false;
      if (m.periodo_extracto && m.periodo_extracto !== ext.periodo) return false;

      // Ventana de corte estricta: entre corte anterior y corte actual
      const fMov = normalizeDate(m.fecha);
      if (fMov && fechaInicio && fechaFin) {
        return fMov >= fechaInicio && fMov <= fechaFin;
      }
      if (fMov && fechaFin) {
        return fMov <= fechaFin;
      }
      return true;
    });

    // Desglose de movimientos del período: Abonos, Compras y Gastos Financieros
    let totalAbonos = 0;
    let totalGastosFinancieros = 0;
    let totalCompras = 0;
    let cantidadAbonos = 0;
    let cantidadGastosFinancieros = 0;
    let cantidadCompras = 0;

    movs.forEach(m => {
      const deb = Number(m.debito) || 0;
      const cred = Number(m.credito) || 0;
      const desc = String(m.descripcion || "").toLowerCase();
      const esAbono = m.tipo_movimiento_tdc === "abono" || (deb > 0 && cred === 0);
      const esFinanciero = m.tipo_movimiento_tdc === "financiero" ||
        /interes|cuota.*manejo|seguro|comision|financier|4x1000|gravamen/i.test(desc) ||
        (desc.includes("ajuste al peso") && cred > 0);

      if (esAbono) {
        totalAbonos += deb;
        cantidadAbonos++;
      } else if (esFinanciero) {
        totalGastosFinancieros += cred;
        cantidadGastosFinancieros++;
      } else {
        totalCompras += cred;
        cantidadCompras++;
      }
    });

    totalAbonos = parseAndRoundCOP(totalAbonos, 2);
    totalGastosFinancieros = parseAndRoundCOP(totalGastosFinancieros, 2);
    totalCompras = parseAndRoundCOP(totalCompras, 2);

    const saldoSistema = parseAndRoundCOP(totalCompras + totalGastosFinancieros - totalAbonos, 2);
    const saldoAnterior = parseAndRoundCOP(ext.saldo_anterior, 2);
    let diferencia = parseAndRoundCOP((Number(ext.saldo_a_pagar) || 0) - saldoAnterior - saldoSistema, 2);
    if (Math.abs(diferencia) < 0.01) diferencia = 0;

    // Comparativa de saldo anterior del extracto con el saldo que tenía la tarjeta en el sistema ANTES de este período
    const movsPrevios = movsTodos.filter(m => {
      const estado = String(m.estado || "activo").toLowerCase().trim();
      if (estado === "inactivo" || estado === "anulado" || estado === "reversado" || estado === "ignorado") return false;
      if (m.es_anulacion || m.es_reversion) return false;
      const matchProd = (ext.producto_id && m.producto_credito_id === ext.producto_id) ||
                        (prod?.subcuenta_puc && String(m.subcuenta).trim() === String(prod.subcuenta_puc).trim());
      if (!matchProd) return false;
      const fMov = normalizeDate(m.fecha);
      return fMov && fechaInicio && fMov < fechaInicio;
    });

    const saldoPrevioCreditos = movsPrevios.reduce((s, m) => s + (Number(m.credito) || 0), 0);
    const saldoPrevioDebitos = movsPrevios.reduce((s, m) => s + (Number(m.debito) || 0), 0);
    const saldoSistemaAnterior = parseAndRoundCOP(saldoPrevioCreditos - saldoPrevioDebitos, 2);
    const desfaseSaldoAnterior = parseAndRoundCOP(saldoAnterior - saldoSistemaAnterior, 2);
    const hayDesfaseSaldoAnterior = Math.abs(desfaseSaldoAnterior) >= 1.0;

    return {
      extracto: { ...ext, saldo_sistema: saldoSistema, diferencia_saldo: diferencia },
      movimientos_sistema: movs,
      lineas_banco: lineasBanco,
      saldo_banco: Number(ext.saldo_a_pagar) || 0,
      saldo_sistema: saldoSistema,
      total_abonos_sistema: totalAbonos,
      total_compras_sistema: totalCompras,
      total_gastos_financieros_sistema: totalGastosFinancieros,
      cantidad_abonos_sistema: cantidadAbonos,
      cantidad_compras_sistema: cantidadCompras,
      cantidad_gastos_financieros_sistema: cantidadGastosFinancieros,
      diferencia_saldo: diferencia,
      saldo_anterior: saldoAnterior,
      saldo_sistema_anterior: saldoSistemaAnterior,
      desfase_saldo_anterior: desfaseSaldoAnterior,
      hay_desfase_saldo_anterior: hayDesfaseSaldoAnterior,
      fecha_inicio_rango: fechaInicio,
      fecha_fin_rango: fechaFin
    };
  }

  if (action === "compararMovimientos") {
    const ext = (await entities.ExtractoProducto.get(extractoId)) || { id: extractoId };
    const prod = ext.producto_id ? await entities.ProductoCredito.get(ext.producto_id).catch(() => null) : null;
    const lineasBanco = (await entities.LineaExtracto.filter({ extracto_id: extractoId })) || [];
    
    const { fechaInicio, fechaFin } = await determinarVentanaConciliacion(entities, ext, prod, lineasBanco);

    const movsTodos = (await entities.MovimientoContable.list("-fecha", 35000)) || [];
    const movs = movsTodos.filter(m => {
      const estado = String(m.estado || "activo").toLowerCase().trim();
      if (estado === "inactivo" || estado === "anulado" || estado === "reversado" || estado === "ignorado") return false;
      if (m.es_anulacion || m.es_reversion) return false;
      if (m.conciliacion_ignorada || m.estado_conciliacion === "ignorado") return false;

      const matchProd = (ext.producto_id && m.producto_credito_id === ext.producto_id) ||
                        (prod?.subcuenta_puc && String(m.subcuenta).trim() === String(prod.subcuenta_puc).trim());
      if (!matchProd) return false;

      // Asignación explícita
      if (m.extracto_id && m.extracto_id === ext.id) return true;
      if (m.periodo_extracto && m.periodo_extracto === ext.periodo) return true;

      // Si pertenece explícitamente a otro extracto o período diferente
      if (m.extracto_id && m.extracto_id !== ext.id) return false;
      if (m.periodo_extracto && m.periodo_extracto !== ext.periodo) return false;

      // Ventana de corte estricta: entre corte anterior y corte actual
      const fMov = normalizeDate(m.fecha);
      if (fMov && fechaInicio && fechaFin) {
        return fMov >= fechaInicio && fMov <= fechaFin;
      }
      if (fMov && fechaFin) {
        return fMov <= fechaFin;
      }
      return true;
    });

    const movsIgnorados = movsTodos.filter(m => {
      const estado = String(m.estado || "").toLowerCase().trim();
      if (estado !== "ignorado" && !m.conciliacion_ignorada && m.estado_conciliacion !== "ignorado") return false;
      const matchProd = (ext.producto_id && m.producto_credito_id === ext.producto_id) ||
                        (prod?.subcuenta_puc && String(m.subcuenta).trim() === String(prod.subcuenta_puc).trim());
      if (!matchProd) return false;
      const fMov = normalizeDate(m.fecha);
      if (fMov && fechaInicio && fechaFin) return fMov >= fechaInicio && fMov <= fechaFin;
      if (fMov && fechaFin) return fMov <= fechaFin;
      return true;
    });

    const lineasActivas = lineasBanco.filter(l => l.estado_conciliacion !== "ignorado");
    const lineasIgnoradas = lineasBanco.filter(l => l.estado_conciliacion === "ignorado");

    const conciliados = [];
    const faltantes = [];
    const sobrantesPool = [...movs];

    for (const lb of lineasActivas) {
      const valLinea = Number(lb.valor) || 0;
      const fLinea = normalizeDate(lb.fecha);

      // 1. Coincidencia por vínculo previo directo
      let matchIdx = -1;
      if (lb.movimiento_sistema_id) {
        matchIdx = sobrantesPool.findIndex(m => m.id === lb.movimiento_sistema_id);
      }

      // 2. Coincidencia por valor y fecha idéntica
      if (matchIdx === -1) {
        matchIdx = sobrantesPool.findIndex(m => {
          const valMov = Number(m.debito > 0 ? m.debito : m.credito) || 0;
          if (Math.abs(valMov - valLinea) >= 1.0) return false;
          const fMov = normalizeDate(m.fecha);
          return fLinea && fMov && fLinea === fMov;
        });
      }

      // 3. Coincidencia por valor dentro de la ventana de corte
      if (matchIdx === -1) {
        matchIdx = sobrantesPool.findIndex(m => {
          const valMov = Number(m.debito > 0 ? m.debito : m.credito) || 0;
          return Math.abs(valMov - valLinea) < 1.0;
        });
      }

      if (matchIdx !== -1) {
        conciliados.push({
          linea_banco: lb,
          movimiento_sistema: sobrantesPool[matchIdx]
        });
        sobrantesPool.splice(matchIdx, 1);
      } else {
        faltantes.push({
          linea_banco: lb,
          en_disputa: lb.estado_conciliacion === "en_disputa"
        });
      }
    }

    const sobrantes = sobrantesPool.map(m => ({
      movimiento_sistema: m,
      en_disputa: String(m.estado || "").toLowerCase().trim() === "en_disputa"
    }));

    const disputados = [
      ...faltantes.filter(f => f.en_disputa).map(f => ({ tipo: "linea_banco", data: f.linea_banco })),
      ...sobrantes.filter(s => s.en_disputa).map(s => ({ tipo: "movimiento_sistema", data: s.movimiento_sistema }))
    ];

    const ignorados = [
      ...lineasIgnoradas.map(l => ({ tipo: "linea_banco", data: l, id: l.id })),
      ...movsIgnorados.map(m => ({ tipo: "movimiento_sistema", data: m, id: m.id }))
    ];

    return {
      conciliados,
      faltantes,
      sobrantes,
      disputados,
      ignorados,
      diferencias: [],
      resumen: {
        total_banco: lineasBanco.length,
        total_sistema: movs.length,
        diferencia_saldo: parseAndRoundCOP(ext.diferencia_saldo || 0, 2),
        porcentaje_conciliado: lineasBanco.length > 0 ? Math.round((conciliados.length / lineasBanco.length) * 100) : 0
      }
    };
  }

  if (action === "marcarSobrante") {
    const { movimiento_sistema_id, accion } = payload;
    const mov = await entities.MovimientoContable.get(movimiento_sistema_id);
    if (!mov) throw new Error("Movimiento no encontrado");

    if (accion === "anular") {
      if (mov.comprobante_id) {
        try {
          await anularComprobante(entities, {
            comprobante_id: mov.comprobante_id,
            motivo: "Anulado desde conciliación de extractos (movimiento sobrante)"
          });
        } catch (e) {
          console.warn("Error en anularComprobante:", e);
        }
      }
      await entities.MovimientoContable.update(mov.id, {
        estado: "anulado"
      });
      return { success: true, accion: "anular", mensaje: "Movimiento y comprobante anulados correctamente" };
    }

    if (accion === "marcar_en_disputa" || accion === "disputa") {
      const estadoActual = String(mov.estado || "activo").toLowerCase().trim();
      const nuevoEstado = estadoActual === "en_disputa" ? "activo" : "en_disputa";
      await entities.MovimientoContable.update(mov.id, {
        estado: nuevoEstado
      });
      return { success: true, accion: "en_disputa", estado: nuevoEstado };
    }

    if (accion === "ignorar") {
      const estadoActual = String(mov.estado || "activo").toLowerCase().trim();
      const nuevoEstado = estadoActual === "ignorado" ? "activo" : "ignorado";
      await entities.MovimientoContable.update(mov.id, {
        estado: nuevoEstado
      });
      return { success: true, accion: "ignorar", estado: nuevoEstado, ignorado: nuevoEstado === "ignorado" };
    }

    return { success: true };
  }

  if (action === "marcarLineaBanco" || action === "marcarLineaExtracto") {
    const { linea_banco_id, accion } = payload;
    const linea = await entities.LineaExtracto.get(linea_banco_id);
    if (!linea) throw new Error("Línea bancaria no encontrada");

    if (accion === "marcar_en_disputa" || accion === "disputa") {
      const nuevoEstado = linea.estado_conciliacion === "en_disputa" ? "sin_conciliar" : "en_disputa";
      await entities.LineaExtracto.update(linea.id, {
        estado_conciliacion: nuevoEstado
      });
      return { success: true, accion: "en_disputa", estado_conciliacion: nuevoEstado };
    }

    if (accion === "ignorar") {
      const nuevoEstado = linea.estado_conciliacion === "ignorado" ? "sin_conciliar" : "ignorado";
      await entities.LineaExtracto.update(linea.id, {
        estado_conciliacion: nuevoEstado
      });
      return { success: true, accion: "ignorar", estado_conciliacion: nuevoEstado };
    }

    if (accion === "anular" || accion === "eliminar") {
      await entities.LineaExtracto.delete(linea.id);
      return { success: true, accion: "eliminar" };
    }

    return { success: true };
  }

  if (action === "ajustarMovimientoDiferente") {
    const { linea_banco_id, movimiento_sistema_id, accion } = payload;
    const linea = await entities.LineaExtracto.get(linea_banco_id);
    const mov = movimiento_sistema_id ? await entities.MovimientoContable.get(movimiento_sistema_id) : null;
    if (!linea) throw new Error("Línea bancaria no encontrada");

    if (accion === "anular_y_recrear") {
      if (mov && mov.comprobante_id) {
        try {
          await anularComprobante(entities, {
            comprobante_id: mov.comprobante_id,
            motivo: "Reemplazado por valor exacto del extracto bancario"
          });
        } catch {
          await entities.MovimientoContable.update(mov.id, { estado: "anulado", es_anulacion: true });
        }
      }
      const ext = await entities.ExtractoProducto.get(linea.extracto_id);
      const prod = await entities.ProductoCredito.get(linea.producto_id);
      const esCargo = linea.naturaleza === "cargo";
      const res = await createComprobante(entities, {
        fecha: linea.fecha,
        tipo: "diario",
        descripcion: `Ajuste conciliación - ${linea.descripcion}`,
        movimientos: [
          {
            subcuenta: prod?.subcuenta_puc || "211001",
            debito: esCargo ? 0 : linea.valor,
            credito: esCargo ? linea.valor : 0,
            descripcion: linea.descripcion,
            producto_credito_id: prod?.id,
            tipo_movimiento_tdc: esCargo ? linea.tipo : "abono",
            periodo_extracto: ext?.periodo
          },
          {
            subcuenta: esCargo ? "510502" : "111005",
            debito: esCargo ? linea.valor : 0,
            credito: esCargo ? 0 : linea.valor,
            descripcion: linea.descripcion
          }
        ]
      });
      await entities.LineaExtracto.update(linea_banco_id, {
        estado_conciliacion: "conciliado",
        movimiento_sistema_id: res.movimientos?.[0]?.id || ""
      });
      return { success: true };
    }

    if (accion === "crear_diferencia") {
      const ext = await entities.ExtractoProducto.get(linea.extracto_id);
      const prod = await entities.ProductoCredito.get(linea.producto_id);
      const valBanco = Number(linea.valor) || 0;
      const valSistema = Number(mov?.credito > 0 ? mov.credito : mov?.debito) || 0;
      const dif = parseAndRoundCOP(valBanco - valSistema, 2);
      const esCargo = dif > 0;
      const absDif = Math.abs(dif);

      await createComprobante(entities, {
        fecha: linea.fecha,
        tipo: "diario",
        descripcion: `Ajuste diferencia extracto vs sistema - ${linea.descripcion}`,
        movimientos: [
          {
            subcuenta: prod?.subcuenta_puc || "211001",
            debito: esCargo ? 0 : absDif,
            credito: esCargo ? absDif : 0,
            descripcion: `Ajuste diferencia ${linea.descripcion}`,
            producto_credito_id: prod?.id,
            tipo_movimiento_tdc: esCargo ? "financiero" : "abono",
            periodo_extracto: ext?.periodo
          },
          {
            subcuenta: esCargo ? "510502" : "429553",
            debito: esCargo ? absDif : 0,
            credito: esCargo ? 0 : absDif,
            descripcion: `Ajuste diferencia ${linea.descripcion}`
          }
        ]
      });

      await entities.LineaExtracto.update(linea_banco_id, {
        estado_conciliacion: "conciliado",
        movimiento_sistema_id: mov?.id || ""
      });
      return { success: true };
    }

    return { success: true };
  }

  if (action === "modificarSobrante") {
    const { movimiento_sistema_id, tipo_mod, nuevo_valor, nueva_fecha, extracto_id } = payload;
    const mov = await entities.MovimientoContable.get(movimiento_sistema_id);
    if (!mov) throw new Error("Movimiento no encontrado");

    if (tipo_mod === "vincular_proximo_periodo") {
      const ext = extracto_id ? await entities.ExtractoProducto.get(extracto_id) : null;
      let nextPeriodo = "";
      if (ext?.periodo) {
        const [yStr, mStr] = ext.periodo.split("-");
        let y = parseInt(yStr, 10);
        let m = parseInt(mStr, 10) + 1;
        if (m > 12) { m = 1; y += 1; }
        nextPeriodo = `${y}-${String(m).padStart(2, "0")}`;
      } else {
        const d = new Date();
        nextPeriodo = `${d.getFullYear()}-${String(d.getMonth() + 2).padStart(2, "0")}`;
      }
      await entities.MovimientoContable.update(mov.id, {
        periodo_extracto: nextPeriodo,
        extracto_id: null
      });
      return { success: true, nuevo_periodo: nextPeriodo };
    }

    if (tipo_mod === "cambiar_fecha" && nueva_fecha) {
      await entities.MovimientoContable.update(mov.id, { fecha: nueva_fecha });
      if (mov.comprobante_id) {
        await entities.ComprobanteContable.update(mov.comprobante_id, { fecha: nueva_fecha });
      }
      return { success: true, nueva_fecha };
    }

    if (tipo_mod === "cambiar_valor" && nuevo_valor !== null && nuevo_valor !== undefined) {
      const esDebito = Number(mov.debito) > 0;
      const patch = esDebito ? { debito: nuevo_valor } : { credito: nuevo_valor };
      await entities.MovimientoContable.update(mov.id, patch);

      // Si tiene comprobante con contrapartida directa, ajustar la contrapartida para mantener balance
      if (mov.comprobante_id) {
        const movsComp = await entities.MovimientoContable.filter({ comprobante_id: mov.comprobante_id });
        const contra = (movsComp || []).find(m => m.id !== mov.id);
        if (contra) {
          const contraPatch = esDebito ? { credito: nuevo_valor } : { debito: nuevo_valor };
          await entities.MovimientoContable.update(contra.id, contraPatch);
        }
        await entities.ComprobanteContable.update(mov.comprobante_id, {
          total_debito: nuevo_valor,
          total_credito: nuevo_valor
        });
      }
      return { success: true, nuevo_valor };
    }

    if (tipo_mod === "asignar_cuenta_pendiente") {
      await entities.MovimientoContable.update(mov.id, {
        subcuenta: "139006",
        cuenta_nombre: "Cuentas por cobrar pendientes de cobro",
        producto_credito_id: null
      });
      return { success: true };
    }

    return { success: true };
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
    if (!ext) throw new Error("Extracto no encontrado");
    const prod = ext.producto_id ? await entities.ProductoCredito.get(ext.producto_id).catch(() => null) : null;
    
    // Obtener ventana y movimientos reales para calcular diferencia exacta
    const lineasBanco = (await entities.LineaExtracto.filter({ extracto_id: extractoId })) || [];
    const { fechaInicio, fechaFin } = await determinarVentanaConciliacion(entities, ext, prod, lineasBanco);
    const movsTodos = (await entities.MovimientoContable.list("-fecha", 35000)) || [];
    const movs = movsTodos.filter(m => {
      const estado = String(m.estado || "activo").toLowerCase().trim();
      if (estado === "inactivo" || estado === "anulado" || estado === "reversado" || estado === "ignorado") return false;
      if (m.es_anulacion || m.es_reversion) return false;
      if (m.conciliacion_ignorada || m.estado_conciliacion === "ignorado") return false;

      const matchProd = (ext.producto_id && m.producto_credito_id === ext.producto_id) ||
                        (prod?.subcuenta_puc && String(m.subcuenta).trim() === String(prod.subcuenta_puc).trim());
      if (!matchProd) return false;

      if (m.extracto_id && m.extracto_id === ext.id) return true;
      if (m.periodo_extracto && m.periodo_extracto === ext.periodo) return true;
      if (m.extracto_id && m.extracto_id !== ext.id) return false;
      if (m.periodo_extracto && m.periodo_extracto !== ext.periodo) return false;

      const fMov = normalizeDate(m.fecha);
      if (fMov && fechaInicio && fechaFin) return fMov >= fechaInicio && fMov <= fechaFin;
      if (fMov && fechaFin) return fMov <= fechaFin;
      return true;
    });

    const sumaCreditos = movs.reduce((s, m) => s + (Number(m.credito) || 0), 0);
    const sumaDebitos = movs.reduce((s, m) => s + (Number(m.debito) || 0), 0);
    const saldoSistema = parseAndRoundCOP(sumaCreditos - sumaDebitos, 2);
    const saldoAnterior = parseAndRoundCOP(ext.saldo_anterior, 2);
    const saldoBanco = Number(ext.saldo_a_pagar) || 0;

    let diff = parseAndRoundCOP(saldoBanco - saldoAnterior - saldoSistema, 2);
    if (payload.diferencia !== undefined && Math.abs(Number(payload.diferencia) - diff) < 1.0) {
      diff = Number(payload.diferencia);
    }

    if (Math.abs(diff) < 0.01) {
      await entities.ExtractoProducto.update(extractoId, { diferencia_saldo: 0 });
      return { diferencia_ajustada: 0, mensaje: "La conciliación ya está totalmente cuadrada ($0)." };
    }

    const absDiff = parseAndRoundCOP(Math.abs(diff), 2);
    // Si diff > 0: El banco tiene mayor saldo a pagar que lo registrado en el sistema.
    // La deuda de la tarjeta debe aumentar (CRÉDITO), y la contrapartida es un GASTO (DÉBITO 510502).
    // Si diff < 0: El sistema tiene mayor deuda registrada que el extracto del banco.
    // La deuda de la tarjeta debe disminuir (DÉBITO), y la contrapartida es un INGRESO (CRÉDITO 429553).
    const esGasto = diff > 0;
    const fechaAjuste = ext.fecha_corte || (fechaFin || new Date().toISOString().split("T")[0]);
    const subcuentaContra = esGasto ? "510502" : "429553"; // 510502 Gastos Diversos / 429553 Aprovechamientos

    const movsAjuste = [
      {
        subcuenta: prod?.subcuenta_puc || "211001",
        debito: esGasto ? 0 : absDiff,
        credito: esGasto ? absDiff : 0,
        descripcion: `Ajuste al peso conciliación ${ext.periodo} - ${prod?.nombre || ''}`,
        producto_credito_id: prod?.id,
        tipo_movimiento_tdc: esGasto ? "financiero" : "abono",
        periodo_extracto: ext.periodo
      },
      {
        subcuenta: subcuentaContra,
        debito: esGasto ? absDiff : 0,
        credito: esGasto ? 0 : absDiff,
        descripcion: `Ajuste al peso (${esGasto ? 'Gasto' : 'Ingreso'}) residual período ${ext.periodo}`
      }
    ];

    const res = await createComprobante(entities, {
      fecha: fechaAjuste,
      tipo: "diario",
      descripcion: `Ajuste al peso - conciliación ${ext.periodo} - ${prod?.nombre || ''}`,
      periodo_operacion: ext.periodo,
      movimientos: movsAjuste
    });

    await entities.ExtractoProducto.update(extractoId, { diferencia_saldo: 0 });
    return { comprobante: res.comprobante, diferencia_ajustada: diff, es_gasto: esGasto };
  }

  if (action === "cerrarConciliacion") {
    const idToClose = extractoId || payload.extracto_id || payload.extractoId;
    if (!idToClose) throw new Error("ID de extracto no especificado");
    const updateData = {
      estado_conciliacion: "cerrado",
      fecha_conciliacion: new Date().toISOString().substring(0, 10),
      conciliado_por_email: payload.email || "multipagosstm@gmail.com"
    };
    if (payload.diferencia_saldo !== undefined) {
      updateData.diferencia_saldo = Number(payload.diferencia_saldo);
    }
    await entities.ExtractoProducto.update(idToClose, updateData);
    return { extracto_cerrado: idToClose, cerrado_ok: true, success: true };
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
      cashback: 0, cashback_fecha: "",
      valor_cobertura: 0, valor_cobertura_fecha: ""
    };

    for (const cf of cargosFinancieros) {
      const cat = categorizarCargo(cf.descripcion);
      if (cargosCategorizados[cat] !== undefined) {
        cargosCategorizados[cat] = parseAndRoundCOP(cargosCategorizados[cat] + cf.valor, 2);
        if (!cargosCategorizados[cat + "_fecha"]) cargosCategorizados[cat + "_fecha"] = cf.fecha;
      }
    }

    // Si la IA devolvió campos directos de crédito hipotecario / nuevo saldo:
    if (data.intereses_corrientes > 0 && !cargosCategorizados.intereses_corrientes) {
      cargosCategorizados.intereses_corrientes = parseAndRoundCOP(data.intereses_corrientes, 2);
      cargosCategorizados.intereses_corrientes_fecha = fechaCorte;
    }
    if (data.intereses_mora > 0 && !cargosCategorizados.intereses_mora) {
      cargosCategorizados.intereses_mora = parseAndRoundCOP(data.intereses_mora, 2);
      cargosCategorizados.intereses_mora_fecha = fechaCorte;
    }
    if (data.seguros > 0 && !cargosCategorizados.seguros) {
      cargosCategorizados.seguros = parseAndRoundCOP(data.seguros, 2);
      cargosCategorizados.seguros_fecha = fechaCorte;
    }
    if (data.valor_cobertura > 0 && !cargosCategorizados.valor_cobertura) {
      cargosCategorizados.valor_cobertura = parseAndRoundCOP(data.valor_cobertura, 2);
      cargosCategorizados.valor_cobertura_fecha = fechaCorte;
    }

    // Si hay valor cobertura, actúa como un ingreso que descuenta a los intereses generados
    if (cargosCategorizados.valor_cobertura > 0) {
      const yaEnLineas = todasLineas.some((l) => l.descripcion.toLowerCase().includes("cobertura"));
      if (!yaEnLineas) {
        todasLineas.push({
          fecha: fechaCorte,
          descripcion: "Valor cobertura (subsidio tasa / descuento intereses)",
          valor: cargosCategorizados.valor_cobertura,
          tipo: "financiero",
          naturaleza: "abono",
          subcuenta_gasto: "510502"
        });
      }
    }

    // Match inteligente con productos de crédito y cuentas activas
    const productos = await entities.ProductoCredito.list();
    const productosActivos = (productos || []).filter((p) => p.estado === "activo");

    const esCredito = !!(
      data.es_credito ||
      ["CH", "LIB", "CR"].includes(data.tipo_producto) ||
      String(data.tipo_producto || "").toLowerCase().includes("hipotecari") ||
      String(file_name || "").toLowerCase().includes("hipotecari") ||
      (data.numero_obligacion && !data.numero_tarjeta)
    );
    const tipoProducto = data.tipo_producto || (esCredito ? "CH" : "TDC");

    let cuentasPuc = [];
    try {
      cuentasPuc = await entities.Cuenta.list();
    } catch {
      cuentasPuc = [];
    }

    let productoMatch = null;
    let matchReason = "";

    // 1. Si es crédito hipotecario / crédito, match prioritario por número de obligación
    if (esCredito) {
      const prodsCredito = productosActivos.filter((p) => ["CH", "LIB", "CR"].includes(p.tipo));
      const numOblig = String(data.numero_obligacion || numTarjetaRaw || "").trim();
      const oblNorm = numOblig.replace(/\D/g, "");

      if (oblNorm && oblNorm.length >= 4) {
        productoMatch = prodsCredito.find((p) => {
          const pcNorm = String(p.numero_completo || "").replace(/\D/g, "");
          const ciNorm = String(p.codigo_interno || "").replace(/\D/g, "");
          return (
            (pcNorm && (pcNorm === oblNorm || pcNorm.endsWith(oblNorm) || oblNorm.endsWith(pcNorm))) ||
            (ciNorm && (ciNorm === oblNorm || ciNorm.endsWith(oblNorm) || oblNorm.endsWith(ciNorm)))
          );
        });
        if (productoMatch) {
          matchReason = `Crédito coincidente por obligación (${numOblig})`;
        }
      }

      if (!productoMatch && last4) {
        productoMatch = prodsCredito.find((p) => {
          const pcNorm = String(p.numero_completo || "").replace(/\D/g, "");
          const ciNorm = String(p.codigo_interno || "").replace(/\D/g, "");
          return (
            pcNorm.endsWith(last4) ||
            ciNorm.endsWith(last4) ||
            String(p.nombre || "").includes(last4)
          );
        });
        if (productoMatch) {
          matchReason = `Crédito coincidente por terminación ${last4}`;
        }
      }
    }

    if (!productoMatch && last4) {
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

      // 2. Coincidencia directa por nombre canónico de cuenta/tarjeta (ej: "TDC - 5513", "TDC-5513", "TDC 5513", "CH - 4298")
      if (!productoMatch) {
        const porNombreCanonico = productosActivos.find((p) => {
          const pNom = String(p.nombre || "").trim().toLowerCase();
          return (
            pNom === `tdc - ${last4}`.toLowerCase() ||
            pNom === `tdc-${last4}`.toLowerCase() ||
            pNom === `tdc ${last4}`.toLowerCase() ||
            pNom === `ch - ${last4}`.toLowerCase() ||
            pNom === `ch-${last4}`.toLowerCase()
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

      // 5. Coincidencia a través de Cuenta contable PUC (ej: cuenta con concepto "TDC - 5513" o "CH - 4298")
      if (!productoMatch && cuentasPuc.length > 0) {
        const cuentaPuc = cuentasPuc.find((c) =>
          regexLast4.test(c.concepto || "") ||
          String(c.concepto || "").toLowerCase().includes(last4)
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
      tipo_producto: tipoProducto,
      es_credito: esCredito,
      numero_obligacion: data.numero_obligacion || numTarjetaRaw || "",
      cargos_categorizados: cargosCategorizados,
      tarjeta: numTarjetaRaw || (last4 ? `****${last4}` : "No identificada"),
      last4,
      titular: data.titular || "Titular",
      periodo,
      fecha_corte: fechaCorte,
      fecha_corte_anterior: fechaCorteAnterior,
      fecha_pago: fechaPago,
      saldo_anterior: parseAndRoundCOP(data.saldo_anterior, 2),
      saldo_a_pagar: parseAndRoundCOP(data.saldo_a_pagar, 2),
      pago_minimo: parseAndRoundCOP(data.pago_minimo, 2),
      saldo_capital: parseAndRoundCOP(data.saldo_capital, 2),
      valor_cuota: parseAndRoundCOP(data.valor_cuota, 2),
      valor_cobertura: parseAndRoundCOP(cargosCategorizados.valor_cobertura, 2),
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
      productos_disponibles: (esCredito
        ? productosActivos.filter((p) => ["CH", "LIB", "CR"].includes(p.tipo))
        : productosActivos
      ).map((p) => ({
        id: p.id,
        nombre: p.nombre,
        banco: p.banco,
        nomenclatura: p.nomenclatura,
        tipo: p.tipo
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

    let observacionesFinal = (observaciones || "").trim();
    if (cargos_categorizados?.valor_cobertura > 0 && !observacionesFinal.toLowerCase().includes("cobertura")) {
      observacionesFinal = (observacionesFinal + `\nValor cobertura aplicada (subsidio tasa / descuento intereses): ${formatCOP(cargos_categorizados.valor_cobertura)}`).trim();
    }

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
      rendimientos: parseAndRoundCOP((cargos_categorizados.rendimientos || 0) + (cargos_categorizados.valor_cobertura || 0), 2),
      rendimientos_fecha: cargos_categorizados.rendimientos_fecha || (cargos_categorizados.valor_cobertura ? fecha_corte : ""),
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
      observaciones: observacionesFinal,
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

// ============================================================================
// LÍNEA DE NEGOCIO: EMPRENDAMOS
// ============================================================================

export async function ensureSubcuentasEmprendamos(entities) {
  const defs = [
    { codigo: 120502, concepto: "Cartera Emprendamos", naturaleza: "Débito", tipo_estado: "Balance", clase: 1, grupo: 12, cuenta: 1205, subcuenta: 120502 },
    { codigo: 410509, concepto: "Intereses Emprendamos", naturaleza: "Crédito", tipo_estado: "Resultado", clase: 4, grupo: 41, cuenta: 4105, subcuenta: 410509 },
    { codigo: 410510, concepto: "Comisiones Emprendamos", naturaleza: "Crédito", tipo_estado: "Resultado", clase: 4, grupo: 41, cuenta: 4105, subcuenta: 410510 }
  ];

  for (const d of defs) {
    try {
      const exist = await entities.Cuenta.filter({ codigo: d.codigo });
      if (exist && exist.length > 0) {
        if (!exist[0].es_transaccional) {
          await entities.Cuenta.update(exist[0].id, { es_transaccional: true });
        }
        continue;
      }
      await entities.Cuenta.create({
        codigo: d.codigo,
        nivel: "Subcuenta",
        clase: d.clase,
        clase_nombre: d.clase === 1 ? "Activo" : "Ingreso",
        grupo: d.grupo,
        cuenta: d.cuenta,
        subcuenta: d.subcuenta,
        concepto: d.concepto,
        naturaleza: d.naturaleza,
        tipo_estado: d.tipo_estado,
        es_transaccional: true
      });
    } catch (err) {
      console.warn(`[ensureSubcuentasEmprendamos] Cuenta ${d.codigo}:`, err?.message || err);
    }
  }
}

function sumarMesesISO(fechaStr, n) {
  const d = new Date(fechaStr + "T00:00:00");
  d.setMonth(d.getMonth() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function calcularProximoPagoEmprendamos(diaPago, desde) {
  const base = desde ? new Date(desde + "T00:00:00") : new Date();
  const year = base.getFullYear();
  const month = base.getMonth();
  const dia = Math.min(28, Math.max(1, Number(diaPago) || 15));

  let tentativa = new Date(year, month, dia);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  if (tentativa <= hoy) {
    tentativa = new Date(year, month + 1, dia);
  }

  const y = tentativa.getFullYear();
  const m = String(tentativa.getMonth() + 1).padStart(2, "0");
  const d = String(tentativa.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function generarCodigoCreditoEmprendamos(entities) {
  const existentes = await entities.EmprendamosCredito.list("-created_date", 1000).catch(() => []);
  const maxNum = (existentes || []).reduce((max, c) => {
    const match = (c.codigo || "").match(/EM-(\d+)/i);
    if (match) {
      const n = parseInt(match[1], 10);
      return n > max ? n : max;
    }
    return max;
  }, 0);
  return "EM-" + String(maxNum + 1).padStart(3, "0");
}

export async function gestionarEmprendamos(entities, payload = {}) {
  const accion = payload.accion || payload.action;
  const hoy = new Date().toISOString().substring(0, 10);

  // Asegurar siempre las cuentas transaccionales de Emprendamos
  await ensureSubcuentasEmprendamos(entities);

  // 1. INSCRIBIR CLIENTE (Sencillo o con Productos)
  if (accion === "inscribirCliente" || accion === "inscribirClienteProductos") {
    const {
      cliente_id,
      fecha_ingreso,
      dia_pago,
      tasa_acordada,
      tasa_extracupo,
      capital_inicial,
      cda_apoderada_id,
      cda_nueva,
      cuenta_origen,
      plan_trazado,
      notas,
      productos
    } = payload;

    if (!cliente_id) throw new Error("Cliente es obligatorio");
    if (!fecha_ingreso) throw new Error("Fecha de ingreso obligatoria");
    const dp = Math.min(28, Math.max(1, Number(dia_pago) || 15));
    const tasa = Number(tasa_acordada) || 0.03;
    const tasaExt = Number(tasa_extracupo) || 0.06;

    const cliente = await entities.Cliente.get(cliente_id);
    if (!cliente) throw new Error("Cliente no encontrado");
    const tercero = cliente.nombre || "Cliente";

    // Validar si ya está inscrito
    const ya = await entities.EmprendamosCliente.filter({ cliente_id, estado: "activo" }).catch(() => []);
    if (ya && ya.length > 0) throw new Error("El cliente ya está inscrito como activo en Emprendamos");

    // Resolver cuentas y monto
    let totalDeuda = Number(capital_inicial) || 0;
    const movsAsiento = [];

    if (productos && Array.isArray(productos) && productos.length > 0) {
      totalDeuda = productos.reduce((s, p) => s + (Number(p.saldo_inicial) || 0), 0);
      movsAsiento.push({
        subcuenta: "120502",
        debito: totalDeuda,
        credito: 0,
        descripcion: `Préstamo inicial Emprendamos — ${tercero}`,
        tercero,
        cliente_id
      });
      for (const p of productos) {
        movsAsiento.push({
          subcuenta: String(p.subcuenta || "11100101"),
          debito: 0,
          credito: Number(p.saldo_inicial) || 0,
          descripcion: p.concepto || `Obligación asumida`,
          tercero,
          cliente_id,
          producto_credito_id: p.producto_credito_id || null,
          cuenta_ahorro_id: p.cuenta_ahorro_id || null
        });
      }
    } else {
      if (!cuenta_origen || !cuenta_origen.subcuenta) {
        throw new Error("Seleccione la cuenta de origen para registrar el desembolso/pago de obligaciones");
      }
      movsAsiento.push(
        {
          subcuenta: "120502",
          debito: totalDeuda,
          credito: 0,
          descripcion: `Compra de cartera inicial — ${tercero}`,
          tercero,
          cliente_id
        },
        {
          subcuenta: String(cuenta_origen.subcuenta),
          debito: 0,
          credito: totalDeuda,
          descripcion: `Pago obligaciones cliente — ${tercero}`,
          tercero,
          cliente_id,
          cuenta_ahorro_id: cuenta_origen.cuenta_ahorro_id || null,
          producto_credito_id: cuenta_origen.producto_credito_id || null
        }
      );
    }

    if (totalDeuda <= 0) throw new Error("El monto total de deuda asumida debe ser mayor a 0");

    // Manejo de CDA apoderada nueva si se especificó
    let cdaIdFinal = cda_apoderada_id || "";
    if (cda_nueva && cda_nueva.banco && cda_nueva.numero_completo) {
      try {
        const cdaCreada = await entities.CuentaAhorro.create({
          banco: cda_nueva.banco,
          titular_id: cliente_id,
          numero_completo: cda_nueva.numero_completo,
          nombre: cda_nueva.nombre || `CDA ${cda_nueva.banco} ${tercero}`,
          saldo: Number(cda_nueva.saldo) || 0,
          estado: "activa",
          nota: cda_nueva.nota || "Creada para administración Emprendamos"
        });
        cdaIdFinal = cdaCreada.id;
      } catch (errCda) {
        console.warn("No se pudo crear CDA apoderada:", errCda);
      }
    }

    // Comprobante contable
    const compRes = await createComprobante(entities, {
      tipo: "diario",
      fecha: fecha_ingreso,
      descripcion: `Inscripción Emprendamos — ${tercero}`,
      movimientos: movsAsiento
    });
    const comprobante_id = compRes?.comprobante?.id || null;

    // Calcular cupo total en tarjetas del cliente
    const prodsCliente = await entities.ProductoCredito.filter({ titular_id: cliente_id, estado: "activo" }).catch(() => []);
    const cupoTDC = (prodsCliente || [])
      .filter((p) => p.tipo === "TDC")
      .reduce((s, p) => s + (Number(p.cupo) || 0), 0);

    // Crear registro EmprendamosCliente
    const fechaSalidaEligible = sumarMesesISO(fecha_ingreso, 12);
    const inscrito = await entities.EmprendamosCliente.create({
      cliente_id,
      fecha_ingreso,
      dia_pago: dp,
      tasa_acordada: tasa,
      tasa_extracupo: tasaExt,
      capital_inicial: totalDeuda,
      saldo_deuda: totalDeuda,
      cupo_asignado: cupoTDC,
      extracupo_autorizado: 0,
      cda_apoderada_id: cdaIdFinal,
      comprobante_cartera_id: comprobante_id,
      plan_trazado: plan_trazado || "",
      contrato_url: "",
      fecha_eligible_salida: fechaSalidaEligible,
      estado: "activo",
      notas: notas || ""
    });

    // Actualizar líneas de negocio del cliente
    const lineasActuales = Array.isArray(cliente.lineas_negocio) ? cliente.lineas_negocio : [];
    if (!lineasActuales.includes("emprendamos")) {
      await entities.Cliente.update(cliente_id, {
        lineas_negocio: [...lineasActuales, "emprendamos"],
        ...(cdaIdFinal ? { cda_asignada_id: cdaIdFinal } : {})
      }).catch(() => {});
    }

    // Crear crédito inicial de cartera (EM-001...)
    const codigoCredito = await generarCodigoCreditoEmprendamos(entities);
    const credito = await entities.EmprendamosCredito.create({
      emprendamos_cliente_id: inscrito.id,
      cliente_id,
      codigo: codigoCredito,
      tipo: "cartera_inicial",
      concepto: `Cartera inicial asumida — ${productos?.length ? productos.length + " partidas" : "1 partida"}`,
      capital: totalDeuda,
      tasa_nominal: tasa,
      cuota_fija: 0,
      fecha: fecha_ingreso,
      dia_pago: dp,
      fecha_proximo_pago: calcularProximoPagoEmprendamos(dp, fecha_ingreso),
      saldo_capital: totalDeuda,
      saldo_intereses: 0,
      estado: "vigente",
      comprobante_id,
      producto_credito_id: "",
      notas: notas || ""
    });

    return {
      success: true,
      inscrito,
      credito,
      comprobante: compRes?.comprobante
    };
  }

  // 2. AGREGAR NUEVO PRÉSTAMO (Habitual @ 3% o Extracupo @ 6%)
  if (accion === "agregarCredito") {
    const {
      emprendamos_cliente_id,
      tipo, // 'habitual' | 'extracupo'
      concepto,
      capital,
      tasa_nominal,
      cuota_fija = 0,
      fecha,
      cuenta_origen,
      producto_credito_id,
      notas
    } = payload;

    if (!emprendamos_cliente_id) throw new Error("Cliente Emprendamos es obligatorio");
    if (!["habitual", "extracupo"].includes(tipo)) throw new Error("Tipo debe ser habitual o extracupo");
    const monto = Number(capital);
    if (!monto || monto <= 0) throw new Error("El monto del crédito debe ser mayor a 0");
    if (!fecha) throw new Error("Fecha es obligatoria");

    const tieneLineas = Array.isArray(payload.movimientos) && payload.movimientos.length > 0;
    if (!tieneLineas && (!cuenta_origen || !cuenta_origen.subcuenta)) {
      throw new Error("Seleccione la cuenta de origen del dinero o detalle las partidas de desembolso");
    }

    const inscrito = await entities.EmprendamosCliente.get(emprendamos_cliente_id);
    if (!inscrito) throw new Error("Inscripción no encontrada");
    if (inscrito.estado !== "activo") throw new Error("El cliente no está activo en Emprendamos");

    const cliente = await entities.Cliente.get(inscrito.cliente_id);
    const tercero = cliente?.nombre || "Cliente";

    // Validar cupo disponible
    const creditosCliente = await entities.EmprendamosCredito.filter({
      emprendamos_cliente_id,
      estado: "vigente"
    }).catch(() => []);

    const tasa = tipo === "extracupo"
      ? (Number(tasa_nominal) || inscrito.tasa_extracupo || 0.06)
      : (Number(tasa_nominal) || inscrito.tasa_acordada || 0.03);

    if (tipo === "habitual") {
      const usado = (creditosCliente || [])
        .filter((c) => c.tipo === "habitual" || c.tipo === "cartera_inicial")
        .reduce((s, c) => s + (Number(c.saldo_capital) || 0), 0);
      const cupoTotal = Number(inscrito.cupo_asignado) || 0;
      if (usado + monto > cupoTotal) {
        throw new Error(`Cupo insuficiente: Cupo asignado $${cupoTotal.toLocaleString()} | Ya usado $${usado.toLocaleString()} | Solicitado $${monto.toLocaleString()}`);
      }
    }

    // Asiento contable de egreso (Débito 120502 vs Crédito(s) de salida)
    let movimientosAsiento = [];
    if (tieneLineas) {
      movimientosAsiento = [
        {
          subcuenta: "120502",
          debito: monto,
          credito: 0,
          descripcion: concepto || `Crédito ${tipo} — ${tercero}`,
          tercero,
          cliente_id: inscrito.cliente_id
        },
        ...payload.movimientos.map((m) => ({
          subcuenta: String(m.subcuenta),
          debito: 0,
          credito: Number(m.credito) || 0,
          descripcion: m.descripcion || concepto || `Desembolso préstamo ${tipo}`,
          tercero: m.tercero || tercero,
          cliente_id: inscrito.cliente_id,
          cuenta_ahorro_id: m.cuenta_ahorro_id || null,
          producto_credito_id: m.producto_credito_id || null
        }))
      ];
    } else {
      movimientosAsiento = [
        {
          subcuenta: "120502",
          debito: monto,
          credito: 0,
          descripcion: `Crédito ${tipo} — ${tercero}`,
          tercero,
          cliente_id: inscrito.cliente_id
        },
        {
          subcuenta: String(cuenta_origen.subcuenta),
          debito: 0,
          credito: monto,
          descripcion: concepto || `Desembolso préstamo ${tipo}`,
          tercero,
          cliente_id: inscrito.cliente_id,
          cuenta_ahorro_id: cuenta_origen.cuenta_ahorro_id || null,
          producto_credito_id: cuenta_origen.producto_credito_id || null
        }
      ];
    }

    const compRes = await createComprobante(entities, {
      tipo: "egreso",
      fecha,
      descripcion: `Crédito ${tipo} Emprendamos — ${tercero}`,
      movimientos: movimientosAsiento
    });

    const codigo = await generarCodigoCreditoEmprendamos(entities);
    const credito = await entities.EmprendamosCredito.create({
      emprendamos_cliente_id,
      cliente_id: inscrito.cliente_id,
      codigo,
      tipo,
      concepto: concepto || `Crédito ${tipo}`,
      capital: monto,
      tasa_nominal: tasa,
      cuota_fija: Number(cuota_fija) || 0,
      fecha,
      dia_pago: inscrito.dia_pago,
      fecha_proximo_pago: calcularProximoPagoEmprendamos(inscrito.dia_pago, fecha),
      saldo_capital: monto,
      saldo_intereses: 0,
      estado: "vigente",
      comprobante_id: compRes?.comprobante?.id || null,
      producto_credito_id: producto_credito_id || "",
      notas: notas || ""
    });

    // Actualizar saldo de deuda del cliente
    await entities.EmprendamosCliente.update(emprendamos_cliente_id, {
      saldo_deuda: (Number(inscrito.saldo_deuda) || 0) + monto
    });

    return {
      success: true,
      credito,
      comprobante: compRes?.comprobante
    };
  }

  // 3. REGISTRAR COMISIÓN O NUEVO CUPO TDC (10% sobre cupo/saldo)
  if (accion === "registrarComision" || accion === "registrarNuevoCupo") {
    const {
      emprendamos_cliente_id,
      producto_credito_id,
      base = 0,
      porcentaje = 0.10,
      fecha = hoy,
      notas,
      cobrar_comision = true
    } = payload;

    if (!emprendamos_cliente_id) throw new Error("Cliente Emprendamos es obligatorio");
    const inscrito = await entities.EmprendamosCliente.get(emprendamos_cliente_id);
    if (!inscrito) throw new Error("Inscripción no encontrada");

    const cliente = await entities.Cliente.get(inscrito.cliente_id);
    const tercero = cliente?.nombre || "Cliente";

    let baseCalculo = Number(base) || 0;
    let tdcProducto = null;

    if (producto_credito_id) {
      tdcProducto = await entities.ProductoCredito.get(producto_credito_id);
      if (tdcProducto) {
        baseCalculo = Number(tdcProducto.cupo) || baseCalculo;
      }
    }

    // Refrescar cupo total
    const prods = await entities.ProductoCredito.filter({ titular_id: inscrito.cliente_id, estado: "activo" }).catch(() => []);
    const nuevoCupoTotal = (prods || [])
      .filter((p) => p.tipo === "TDC")
      .reduce((s, p) => s + (Number(p.cupo) || 0), 0);
    await entities.EmprendamosCliente.update(emprendamos_cliente_id, { cupo_asignado: nuevoCupoTotal });

    let credito = null;
    let comprobante = null;
    let comisionMonto = 0;

    if (cobrar_comision !== false && baseCalculo > 0) {
      const pct = Number(porcentaje) || 0.10;
      comisionMonto = Math.round(baseCalculo * pct);

      const compRes = await createComprobante(entities, {
        tipo: "diario",
        fecha,
        descripcion: `Comisión nuevo producto Emprendamos — ${tercero}`,
        movimientos: [
          {
            subcuenta: "120502",
            debito: comisionMonto,
            credito: 0,
            descripcion: `Comisión ${tdcProducto?.nombre || "nuevo producto"} — ${tercero}`,
            tercero,
            cliente_id: inscrito.cliente_id
          },
          {
            subcuenta: "410510",
            debito: 0,
            credito: comisionMonto,
            descripcion: `Comisión ${(pct * 100).toFixed(0)}% por nuevo producto`,
            tercero,
            cliente_id: inscrito.cliente_id
          }
        ]
      });
      comprobante = compRes?.comprobante;

      const codigo = await generarCodigoCreditoEmprendamos(entities);
      credito = await entities.EmprendamosCredito.create({
        emprendamos_cliente_id,
        cliente_id: inscrito.cliente_id,
        codigo,
        tipo: "comision",
        concepto: `Comisión ${tdcProducto?.nombre || "nuevo producto"} (${(pct * 100).toFixed(0)}%)`,
        capital: comisionMonto,
        tasa_nominal: 0,
        cuota_fija: 0,
        fecha,
        dia_pago: inscrito.dia_pago,
        fecha_proximo_pago: "",
        saldo_capital: comisionMonto,
        saldo_intereses: 0,
        estado: "vigente",
        comprobante_id: comprobante?.id || null,
        producto_credito_id: producto_credito_id || "",
        notas: notas || ""
      });

      await entities.EmprendamosCliente.update(emprendamos_cliente_id, {
        saldo_deuda: (Number(inscrito.saldo_deuda) || 0) + comisionMonto
      });
    }

    return {
      success: true,
      cupo_asignado: nuevoCupoTotal,
      comision: comisionMonto,
      credito,
      comprobante
    };
  }

  // 4. REGISTRAR ABONO
  if (accion === "registrarAbono") {
    const {
      emprendamos_cliente_id,
      fecha = hoy,
      valor_total,
      cuenta_ingreso,
      tipo = "otro", // 'cuota_minima' | 'capital' | 'total' | 'fijo' | 'otro'
      detalles = [],
      notas = ""
    } = payload;

    if (!emprendamos_cliente_id) throw new Error("Cliente Emprendamos obligatorio");
    const monto = Number(valor_total);
    if (!monto || monto <= 0) throw new Error("Valor del abono debe ser mayor a 0");
    if (!cuenta_ingreso || !cuenta_ingreso.subcuenta) throw new Error("Seleccione la cuenta contable de ingreso");
    if (!detalles || detalles.length === 0) throw new Error("Especifique al menos un crédito a abonar");

    const inscrito = await entities.EmprendamosCliente.get(emprendamos_cliente_id);
    if (!inscrito) throw new Error("Inscripción no encontrada");
    const cliente = await entities.Cliente.get(inscrito.cliente_id);
    const tercero = cliente?.nombre || "Cliente";

    // Asiento de ingreso: Débito cuenta_ingreso vs Crédito 120502 (reduce cartera)
    const compRes = await createComprobante(entities, {
      tipo: "ingreso",
      fecha,
      descripcion: `Abono Emprendamos — ${tercero}`,
      movimientos: [
        {
          subcuenta: String(cuenta_ingreso.subcuenta),
          debito: monto,
          credito: 0,
          descripcion: "Abono cartera Emprendamos",
          tercero,
          cliente_id: inscrito.cliente_id,
          cuenta_ahorro_id: cuenta_ingreso.cuenta_ahorro_id || null,
          producto_credito_id: cuenta_ingreso.producto_credito_id || null
        },
        {
          subcuenta: "120502",
          debito: 0,
          credito: monto,
          descripcion: `Abono cartera — ${tercero}`,
          tercero,
          cliente_id: inscrito.cliente_id
        }
      ]
    });

    const comprobante_id = compRes?.comprobante?.id || null;

    // Distribuir e imputar por crédito
    const detallesGuardados = [];
    let nuevaDeuda = Number(inscrito.saldo_deuda) || 0;

    for (const d of detalles) {
      const c = await entities.EmprendamosCredito.get(d.credito_id);
      if (!c) continue;

      const val = Number(d.valor_aplicado) || 0;
      if (val <= 0) continue;

      const saldoInt = Number(c.saldo_intereses) || 0;
      const saldoCap = Number(c.saldo_capital) || 0;

      let pagoInt = Number(d.intereses);
      let pagoCap = Number(d.capital);

      if (pagoInt == null || isNaN(pagoInt)) {
        pagoInt = Math.min(val, saldoInt);
        pagoCap = Math.min(val - pagoInt, saldoCap);
      }

      const nuevoSaldoInt = Math.max(0, saldoInt - pagoInt);
      const nuevoSaldoCap = Math.max(0, saldoCap - pagoCap);
      const saldado = nuevoSaldoCap <= 0.01 && nuevoSaldoInt <= 0.01;

      await entities.EmprendamosCredito.update(c.id, {
        saldo_intereses: nuevoSaldoInt,
        saldo_capital: nuevoSaldoCap,
        estado: saldado ? "saldado" : "vigente",
        fecha_proximo_pago: saldado ? "" : calcularProximoPagoEmprendamos(c.dia_pago || inscrito.dia_pago, fecha)
      });

      detallesGuardados.push({
        credito_id: c.id,
        valor_aplicado: val,
        intereses: pagoInt,
        capital: pagoCap
      });

      nuevaDeuda -= val;
    }

    const abono = await entities.EmprendamosAbono.create({
      cliente_id: inscrito.cliente_id,
      emprendamos_cliente_id,
      fecha,
      valor_total: monto,
      tipo,
      comprobante_id,
      subcuenta_ingreso: String(cuenta_ingreso.subcuenta),
      cda_id: cuenta_ingreso.cuenta_ahorro_id || "",
      producto_credito_id: cuenta_ingreso.producto_credito_id || "",
      detalles: detallesGuardados,
      notas: notas || ""
    });

    await entities.EmprendamosCliente.update(emprendamos_cliente_id, {
      saldo_deuda: Math.max(0, nuevaDeuda)
    });

    return {
      success: true,
      abono,
      comprobante: compRes?.comprobante
    };
  }

  // 5. GENERACIÓN MENSUAL DE INTERESES (Corte día 30 / fin de mes)
  if (accion === "generarInteresesMensuales") {
    const {
      emprendamos_cliente_id,
      periodo, // 'YYYY-MM'
      fecha = hoy
    } = payload;

    const per = periodo || fecha.substring(0, 7);
    const filterQuery = { estado: "activo" };
    if (emprendamos_cliente_id) filterQuery.id = emprendamos_cliente_id;

    const inscritos = await entities.EmprendamosCliente.filter(filterQuery).catch(() => []);
    let totalInteresesGlobal = 0;
    const generadosGlobal = [];

    for (const ins of (inscritos || [])) {
      const cliente = await entities.Cliente.get(ins.cliente_id);
      const tercero = cliente?.nombre || "Cliente";

      const creditos = await entities.EmprendamosCredito.filter({
        emprendamos_cliente_id: ins.id,
        estado: "vigente"
      }).catch(() => []);

      let totalIntCliente = 0;
      const generadosCliente = [];

      for (const c of (creditos || [])) {
        if (c.tipo === "comision") continue;
        const cap = Number(c.saldo_capital) || 0;
        if (cap <= 0) continue;

        // Idempotencia: no cobrar dos veces el mismo periodo
        const yaGen = await entities.EmprendamosInteres.filter({
          credito_id: c.id,
          periodo: per,
          estado: "generado"
        }).catch(() => []);
        if (yaGen && yaGen.length > 0) continue;

        const rawTasa = Number(c.tasa_nominal);
        const tasa = isNaN(rawTasa) || rawTasa <= 0 ? 0.03 : (rawTasa > 1 ? rawTasa / 100 : rawTasa);
        const interesCalculado = Math.round(Math.round(cap) * tasa);
        if (interesCalculado <= 0) continue;

        const interesRec = await entities.EmprendamosInteres.create({
          emprendamos_cliente_id: ins.id,
          cliente_id: ins.cliente_id,
          credito_id: c.id,
          periodo: per,
          capital_base: Math.round(cap),
          tasa,
          intereses: Math.round(interesCalculado),
          comprobante_id: "",
          estado: "generado",
          fecha
        });

        await entities.EmprendamosCredito.update(c.id, {
          saldo_intereses: (Number(c.saldo_intereses) || 0) + interesCalculado
        });

        generadosCliente.push({
          credito_id: c.id,
          codigo: c.codigo,
          intereses: interesCalculado,
          interes_id: interesRec.id
        });
        totalIntCliente += interesCalculado;
      }

      if (totalIntCliente > 0) {
        // Asiento contable mensual: Débito 120502 vs Crédito 410509 (Ingresos por intereses)
        const compRes = await createComprobante(entities, {
          tipo: "diario",
          fecha,
          descripcion: `Intereses Emprendamos periodo ${per} — ${tercero}`,
          movimientos: [
            {
              subcuenta: "120502",
              debito: totalIntCliente,
              credito: 0,
              descripcion: `Intereses causados ${per} — ${tercero}`,
              tercero,
              cliente_id: ins.cliente_id
            },
            {
              subcuenta: "410509",
              debito: 0,
              credito: totalIntCliente,
              descripcion: `Intereses devengados ${per}`,
              tercero,
              cliente_id: ins.cliente_id
            }
          ]
        });

        const compId = compRes?.comprobante?.id || "";
        for (const g of generadosCliente) {
          await entities.EmprendamosInteres.update(g.interes_id, { comprobante_id: compId }).catch(() => {});
        }

        await entities.EmprendamosCliente.update(ins.id, {
          saldo_deuda: (Number(ins.saldo_deuda) || 0) + totalIntCliente
        });

        totalInteresesGlobal += totalIntCliente;
        generadosGlobal.push(...generadosCliente);
      }
    }

    return {
      success: true,
      periodo: per,
      total_intereses: totalInteresesGlobal,
      creditos_procesados: generadosGlobal.length
    };
  }

  // 6. GENERAR ESTADO DE CUENTA
  if (accion === "generarEstadoCuenta") {
    const { emprendamos_cliente_id, periodo } = payload;
    if (!emprendamos_cliente_id) throw new Error("Cliente Emprendamos es obligatorio");

    const inscrito = await entities.EmprendamosCliente.get(emprendamos_cliente_id);
    if (!inscrito) throw new Error("Inscripción no encontrada");

    const per = periodo || hoy.substring(0, 7);
    const inicio = `${per}-01`;
    const fin = sumarMesesISO(inicio, 1);

    const [creditos, intereses, abonos] = await Promise.all([
      entities.EmprendamosCredito.filter({ emprendamos_cliente_id }),
      entities.EmprendamosInteres.filter({ emprendamos_cliente_id, periodo: per, estado: "generado" }),
      entities.EmprendamosAbono.filter({ emprendamos_cliente_id })
    ]);

    const prestamosNuevos = (creditos || []).filter((c) => c.fecha >= inicio && c.fecha < fin && c.tipo !== "cartera_inicial");
    const abonosPeriodo = (abonos || []).filter((a) => a.fecha >= inicio && a.fecha < fin);

    const totalInt = (intereses || []).reduce((s, i) => s + (Number(i.intereses) || 0), 0);
    const totalNuevosPrest = prestamosNuevos.reduce((s, c) => s + (Number(c.capital) || 0), 0);
    const totalAbon = abonosPeriodo.reduce((s, a) => s + (Number(a.valor_total) || 0), 0);

    const saldoFinal = Number(inscrito.saldo_deuda) || 0;
    const saldoInicial = saldoFinal - totalInt - totalNuevosPrest + totalAbon;

    return {
      success: true,
      periodo: per,
      saldo_inicial: saldoInicial,
      prestamos_nuevos: totalNuevosPrest,
      intereses_generados: totalInt,
      abonos: totalAbon,
      saldo_final: saldoFinal,
      creditos: creditos || [],
      detalle_prestamos: prestamosNuevos,
      detalle_abonos: abonosPeriodo,
      detalle_intereses: intereses || []
    };
  }

  // 7. RECALCULAR ESTADO
  if (accion === "recalcularEstado") {
    const inscritos = await entities.EmprendamosCliente.filter({ estado: "activo" }).catch(() => []);
    let count = 0;

    for (const ins of (inscritos || [])) {
      const creditos = await entities.EmprendamosCredito.filter({ emprendamos_cliente_id: ins.id }).catch(() => []);
      let totalDeuda = 0;

      for (const c of (creditos || [])) {
        const cap = Number(c.saldo_capital) || 0;
        const int = Number(c.saldo_intereses) || 0;

        if (cap <= 0.01 && int <= 0.01) {
          if (c.estado !== "saldado") {
            await entities.EmprendamosCredito.update(c.id, { estado: "saldado", fecha_proximo_pago: "" });
          }
        } else {
          totalDeuda += (cap + int);
          await entities.EmprendamosCredito.update(c.id, {
            fecha_proximo_pago: calcularProximoPagoEmprendamos(c.dia_pago || ins.dia_pago, hoy)
          });
        }
      }

      await entities.EmprendamosCliente.update(ins.id, { saldo_deuda: Math.round(totalDeuda) });
      count++;
    }

    return { success: true, actualizados: count };
  }

  // 8. SALIDA DEL CLIENTE (≥ 1 año)
  if (accion === "salirCliente") {
    const { emprendamos_cliente_id, fecha = hoy, motivo } = payload;
    const ins = await entities.EmprendamosCliente.get(emprendamos_cliente_id);
    if (!ins) throw new Error("Inscripción no encontrada");

    if (ins.fecha_eligible_salida && fecha < ins.fecha_eligible_salida) {
      throw new Error(`El cliente aún no cumple el periodo mínimo de 1 año. Elegible a partir de: ${ins.fecha_eligible_salida}`);
    }

    const saldoPendiente = Number(ins.saldo_deuda) || 0;
    await entities.EmprendamosCliente.update(emprendamos_cliente_id, {
      estado: "salido",
      fecha_salida: fecha,
      notas: (ins.notas || "") + (motivo ? `\n[Salida ${fecha}]: ${motivo}` : `\n[Salida ${fecha}]`)
    });

    return { success: true, saldo_pendiente: saldoPendiente };
  }

  // 9. ELIMINAR ABONO
  if (accion === "eliminarAbono") {
    const { abono_id, motivo } = payload;
    const abono = await entities.EmprendamosAbono.get(abono_id);
    if (!abono) throw new Error("Abono no encontrado");

    if (abono.comprobante_id) {
      try {
        await anularComprobante(entities, { id: abono.comprobante_id, motivo: motivo || "Eliminación de abono Emprendamos" });
      } catch (errComp) {
        console.warn("No se pudo anular comprobante de abono:", errComp);
      }
    }

    // Reversar saldos a cada crédito
    const detalles = Array.isArray(abono.detalles) ? abono.detalles : [];
    for (const d of detalles) {
      const c = await entities.EmprendamosCredito.get(d.credito_id);
      if (!c) continue;
      await entities.EmprendamosCredito.update(c.id, {
        saldo_capital: (Number(c.saldo_capital) || 0) + (Number(d.capital) || 0),
        saldo_intereses: (Number(c.saldo_intereses) || 0) + (Number(d.intereses) || 0),
        estado: "vigente"
      });
    }

    const ins = await entities.EmprendamosCliente.get(abono.emprendamos_cliente_id);
    if (ins) {
      await entities.EmprendamosCliente.update(ins.id, {
        saldo_deuda: (Number(ins.saldo_deuda) || 0) + (Number(abono.valor_total) || 0)
      });
    }

    await entities.EmprendamosAbono.delete(abono_id);
    return { success: true };
  }

  // 10. ELIMINAR CRÉDITO
  if (accion === "eliminarCredito") {
    const { credito_id, motivo } = payload;
    const c = await entities.EmprendamosCredito.get(credito_id);
    if (!c) throw new Error("Crédito no encontrado");

    if (c.comprobante_id) {
      try {
        await anularComprobante(entities, { id: c.comprobante_id, motivo: motivo || `Eliminación crédito ${c.codigo}` });
      } catch (errComp) {
        console.warn("No se pudo anular comprobante del crédito:", errComp);
      }
    }

    const ins = await entities.EmprendamosCliente.get(c.emprendamos_cliente_id);
    if (ins) {
      const resta = (Number(c.saldo_capital) || 0) + (Number(c.saldo_intereses) || 0);
      await entities.EmprendamosCliente.update(ins.id, {
        saldo_deuda: Math.max(0, (Number(ins.saldo_deuda) || 0) - resta)
      });
    }

    await entities.EmprendamosCredito.delete(credito_id);
    return { success: true };
  }

  // 11. EDITAR CLIENTE
  if (accion === "editarCliente") {
    const { emprendamos_cliente_id, dia_pago, tasa_acordada, tasa_extracupo, extracupo_autorizado, plan_trazado, notas, estado } = payload;
    const upd = {};
    if (dia_pago !== undefined) upd.dia_pago = Number(dia_pago);
    if (tasa_acordada !== undefined) upd.tasa_acordada = Number(tasa_acordada);
    if (tasa_extracupo !== undefined) upd.tasa_extracupo = Number(tasa_extracupo);
    if (extracupo_autorizado !== undefined) upd.extracupo_autorizado = Number(extracupo_autorizado);
    if (plan_trazado !== undefined) upd.plan_trazado = plan_trazado;
    if (notas !== undefined) upd.notas = notas;
    if (estado !== undefined) upd.estado = estado;

    await entities.EmprendamosCliente.update(emprendamos_cliente_id, upd);
    return { success: true };
  }

  return { success: true };
}
