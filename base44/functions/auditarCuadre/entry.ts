import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Tolerancia de redondeo (centavos)
const EPS = 0.005;

function round(n) { return Math.round((Number(n) || 0) * 100) / 100; }

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const sv = base44.asServiceRole;

    // Filtros opcionales
    const periodo = body.periodo || null;
    const comprobanteId = body.comprobante_id || null;
    const soloDescuadrados = body.solo_descuadrados !== false;

    // 1. Cargar comprobantes contabilizados
    const comprobantes = await sv.entities.ComprobanteContable.list("-fecha", 10000);
    let compMap = new Map();
    for (const c of comprobantes) {
      if (c.estado !== 'contabilizado') continue;
      if (comprobanteId && c.id !== comprobanteId) continue;
      compMap.set(c.id, c);
    }

    // 2. Cargar movimientos activos (paginado)
    // Si se pide un comprobante concreto, filtramos por él para reducir volumen.
    const movQuery = { estado: 'activo' };
    if (comprobanteId) movQuery.comprobante_id = comprobanteId;

    // Cargar TODOS los movimientos activos en una sola llamada (limite alto).
    // La paginación con `skip` + sort "-fecha" es inestable (registros con la misma
    // fecha "saltan" de página y se duplican o se pierden), lo que producía falsos
    // descuadres. Una sola llamada evita el problema por completo.
    const movPorComp = new Map(); // comprobante_id -> { debito, credito, lineas: [] }
    const todosMovs = await sv.entities.MovimientoContable.filter(movQuery, "-fecha", 10000);
    for (const m of todosMovs) {
      const key = m.comprobante_id;
      if (!movPorComp.has(key)) movPorComp.set(key, { debito: 0, credito: 0, lineas: [] });
      const agg = movPorComp.get(key);
      const d = Number(m.debito) || 0;
      const c = Number(m.credito) || 0;
      agg.debito += d;
      agg.credito += c;
      agg.lineas.push({
        id: m.id,
        subcuenta: m.subcuenta,
        cuenta_nombre: m.cuenta_nombre,
        debito: round(d),
        credito: round(c),
        descripcion: m.descripcion,
        tercero: m.tercero,
        fecha: m.fecha
      });
    }

    // 3. Detectar movimientos huérfanos (activo sin comprobante contabilizado)
    const huerfanos = [];
    for (const [cid, agg] of movPorComp.entries()) {
      if (!compMap.has(cid)) {
        huerfanos.push({
          comprobante_id: cid,
          total_debito: round(agg.debito),
          total_credito: round(agg.credito),
          diferencia: round(agg.debito - agg.credito),
          cantidad_lineas: agg.lineas.length
        });
      }
    }

    // 4. Auditar cada comprobante contabilizado
    const descuadres = [];
    const resumen = {
      total_comprobantes: compMap.size,
      cuadrados: 0,
      descuadrados: 0,
      sin_movimientos: 0,
      diferencia_neta_debito: 0,
      diferencia_neta_credito: 0
    };

    for (const [cid, comp] of compMap.entries()) {
      const agg = movPorComp.get(cid);
      const totalDebitoComp = round(comp.total_debito);
      const totalCreditoComp = round(comp.total_credito);
      const sumDebitoMov = agg ? round(agg.debito) : 0;
      const sumCreditoMov = agg ? round(agg.credito) : 0;

      const diffInterna = round(sumDebitoMov - sumCreditoMov); // movimientos entre si
      const diffDebitoTotales = round(sumDebitoMov - totalDebitoComp); // mov vs comprobante
      const diffCreditoTotales = round(sumCreditoMov - totalCreditoComp);
      const diffComprobante = round(totalDebitoComp - totalCreditoComp);

      const tieneMovimientos = !!agg && agg.lineas.length > 0;

      const issues = [];
      if (!tieneMovimientos) issues.push('sin_movimientos');
      if (Math.abs(diffInterna) > EPS) issues.push('descuadre_interno');
      if (Math.abs(diffDebitoTotales) > EPS) issues.push('total_debito_no_coincide');
      if (Math.abs(diffCreditoTotales) > EPS) issues.push('total_credito_no_coincide');
      if (Math.abs(diffComprobante) > EPS) issues.push('comprobante_no_cuadrado');

      const ok = issues.length === 0;
      if (ok) {
        resumen.cuadrados++;
        continue;
      }
      resumen.descuadrados++;
      if (issues.includes('sin_movimientos')) resumen.sin_movimientos++;
      resumen.diferencia_neta_debito += diffInterna;
      resumen.diferencia_neta_credito += -diffInterna;

      // Localizar la singularidad del error:
      // - Si hay descuadre interno, identificar la(s) linea(s) sospechosas.
      // - Si los totales del comprobante no coincen con la suma de movimientos,
      //   el error esta en el comprobante (no en los movimientos).
      let singularidad = null;
      if (issues.includes('descuadre_interno') && agg) {
        // Buscar lineas individuales que no esten cuadradas (debito y credito ambos >0, o ambas 0 con monto, etc.)
        // Estrategia: una linea bien formada tiene O debito O credito (no ambos, no ninguno con valor).
        const lineasSospechosas = agg.lineas.filter(m =>
          (m.debito > 0 && m.credito > 0) ||
          (m.debito === 0 && m.credito === 0)
        );
        // Agrupar por subcuenta para ver si alguna subcuenta no cierra
        const porSubcuenta = {};
        for (const m of agg.lineas) {
          const k = m.subcuenta || '(sin_subcuenta)';
          if (!porSubcuenta[k]) porSubcuenta[k] = { subcuenta: k, nombre: m.cuenta_nombre, debito: 0, credito: 0, lineas: 0 };
          porSubcuenta[k].debito = round(porSubcuenta[k].debito + m.debito);
          porSubcuenta[k].credito = round(porSubcuenta[k].credito + m.credito);
          porSubcuenta[k].lineas++;
        }
        singularidad = {
          tipo: 'movimientos_no_cuadran',
          diferencia: diffInterna,
          lado_mayor: diffInterna > 0 ? 'debito' : 'credito',
          lineas_sospechosas: lineasSospechosas.slice(0, 20),
          desglose_por_subcuenta: Object.values(porSubcuenta).map(s => ({
            ...s,
            diferencia: round(s.debito - s.credito)
          })).sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia)).slice(0, 10)
        };
      } else if (issues.includes('total_debito_no_coincide') || issues.includes('total_credito_no_coincide')) {
        singularidad = {
          tipo: 'totales_comprobante_no_coinciden',
          diferencia_debito: diffDebitoTotales,
          diferencia_credito: diffCreditoTotales,
          nota: 'La suma de los movimientos no coincide con los totales registrados en el comprobante. El error esta en el comprobante (totales) o falta/n sobran movimientos.'
        };
      } else if (issues.includes('comprobante_no_cuadrado')) {
        singularidad = {
          tipo: 'comprobante_no_cuadrado',
          diferencia: diffComprobante,
          nota: 'El comprobante tiene total_debito != total_credito pero los movimientos si cuadran entre si.'
        };
      }

      if (soloDescuadrados) {
        descuadres.push({
          comprobante_id: cid,
          numero: comp.numero,
          tipo: comp.tipo,
          fecha: comp.fecha,
          descripcion: comp.descripcion,
          estado: comp.estado,
          issues,
          totales_comprobante: { debito: totalDebitoComp, credito: totalCreditoComp, diferencia: diffComprobante },
          sumas_movimientos: { debito: sumDebitoMov, credito: sumCreditoMov, diferencia: diffInterna },
          diferencias_totales: { debito: diffDebitoTotales, credito: diffCreditoTotales },
          cantidad_lineas: agg ? agg.lineas.length : 0,
          singularidad,
          lineas: agg ? agg.lineas : []
        });
      }
    }

    resumen.diferencia_neta_debito = round(resumen.diferencia_neta_debito);
    resumen.diferencia_neta_credito = round(resumen.diferencia_neta_credito);

    return Response.json({
      ok: true,
      resumen,
      huerfanos,
      descuadres,
      filtros: { periodo, comprobante_id: comprobanteId, solo_descuadrados: soloDescuadrados }
    });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
}