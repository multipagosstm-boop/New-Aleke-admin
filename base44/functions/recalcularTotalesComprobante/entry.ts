import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const EPS = 0.005;
function round(n) { return Math.round((Number(n) || 0) * 100) / 100; }

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const comprobanteId = body.comprobante_id;
    if (!comprobanteId) return Response.json({ error: 'comprobante_id requerido' }, { status: 400 });

    const sv = base44.asServiceRole;

    const comp = await sv.entities.ComprobanteContable.get(comprobanteId);
    if (comp.estado !== 'contabilizado') {
      return Response.json({ error: 'El comprobante no está contabilizado' }, { status: 400 });
    }

    // Sumar movimientos activos del comprobante
    let totalDebito = 0;
    let totalCredito = 0;
    let cantidad = 0;
    let skip = 0;
    const limit = 1000;
    let hasMore = true;
    while (hasMore) {
      const batch = await sv.entities.MovimientoContable.filter(
        { comprobante_id: comprobanteId, estado: 'activo' },
        "-fecha", limit, skip
      );
      for (const m of batch) {
        totalDebito += Number(m.debito) || 0;
        totalCredito += Number(m.credito) || 0;
        cantidad++;
      }
      hasMore = batch.length === limit;
      skip += limit;
    }

    const nuevoDebito = round(totalDebito);
    const nuevoCredito = round(totalCredito);
    const diff = round(nuevoDebito - nuevoCredito);

    const actualizado = await sv.entities.ComprobanteContable.update(comprobanteId, {
      total_debito: nuevoDebito,
      total_credito: nuevoCredito
    });

    return Response.json({
      ok: true,
      comprobante_id: comprobanteId,
      numero: comp.numero,
      total_debito_anterior: round(comp.total_debito),
      total_credito_anterior: round(comp.total_credito),
      total_debito_nuevo: nuevoDebito,
      total_credito_nuevo: nuevoCredito,
      diferencia_interna: diff,
      cantidad_movimientos: cantidad,
      cuadrado: Math.abs(diff) <= EPS,
      comprobante: actualizado
    });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
}