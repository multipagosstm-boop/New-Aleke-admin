import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { actualizarSaldoCuentaAhorro, actualizarSaldoProductoCredito } from '../../shared/contabilidad.ts';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Solo administradores' }, { status: 403 });

    let body = {};
    try { body = await req.json(); } catch (e) {}
    const subcuenta = String(body.subcuenta || '');
    const confirmar = body.confirmar === true;
    if (!subcuenta) return Response.json({ error: 'subcuenta es obligatorio' }, { status: 400 });
    if (!confirmar) return Response.json({ error: 'Se requiere confirmar=true para eliminar' }, { status: 400 });

    // Movimientos que tocan la cuenta objetivo (solo activos)
    const movs = await base44.asServiceRole.entities.MovimientoContable.filter(
      { subcuenta, estado: 'activo' }, '-fecha', 5000
    );
    const comprobanteIds = [...new Set(movs.map(m => m.comprobante_id))];

    let comprobantesEliminados = 0;
    let movimientosEliminados = 0;
    let saldosReversados = 0;
    const errores = [];
    const fechaHoy = new Date().toISOString().substring(0, 10);

    for (const cid of comprobanteIds) {
      try {
        const todos = await base44.asServiceRole.entities.MovimientoContable.filter({ comprobante_id: cid });
        // 1. Reversar saldos afectados (cuentas de ahorro y productos de credito)
        for (const m of todos) {
          if (m.cuenta_ahorro_id) {
            await actualizarSaldoCuentaAhorro(base44, m.cuenta_ahorro_id, m.debito, m.credito, true);
            saldosReversados++;
          }
          if (m.producto_credito_id) {
            await actualizarSaldoProductoCredito(base44, m.producto_credito_id, m.debito, m.credito, true);
            saldosReversados++;
          }
        }
        // 2. Eliminar movimientos
        for (const m of todos) {
          await base44.asServiceRole.entities.MovimientoContable.delete(m.id);
          movimientosEliminados++;
        }
        // 3. Eliminar comprobante + registrar en historico
        let numeroComp = cid;
        try {
          const comp = await base44.asServiceRole.entities.ComprobanteContable.get(cid);
          numeroComp = comp.numero;
          await base44.asServiceRole.entities.ComprobanteContable.delete(cid);
        } catch (e) { /* comprobante ya inexistente */ }
        comprobantesEliminados++;
        await base44.asServiceRole.entities.HistoricoContable.create({
          comprobante_id: cid,
          numero_comprobante: numeroComp,
          accion: 'eliminacion_masiva',
          descripcion: `Eliminacion masiva de asiento con cuenta ${subcuenta}`,
          monto_total: 0,
          usuario_email: user.email || '',
          fecha: fechaHoy,
          datos_snapshot: ''
        });
      } catch (err) {
        errores.push({ comprobante_id: cid, error: err.message });
      }
    }

    return Response.json({
      ok: true,
      subcuenta,
      comprobantes_involucrados: comprobanteIds.length,
      comprobantesEliminados,
      movimientosEliminados,
      saldosReversados,
      errores
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}