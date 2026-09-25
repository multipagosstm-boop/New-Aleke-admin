import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const periodo = body.periodo || null;

    const query = { estado: "activo" };
    if (periodo) query.periodo_operacion = periodo;

    // Solo contar movimientos cuyo comprobante existe y está contabilizado.
    // Excluye: (a) notas crédito de anulación (espejo) — revierten asientos ya anulados,
    // contarlas duplicaría el reverso; (b) movimientos huérfanos cuyo comprobante fue
    // borrado directamente pero el movimiento quedó activo (saldos fantasma del balance).
    const comprobantes = await base44.asServiceRole.entities.ComprobanteContable.list("-fecha", 10000);
    const compValido = new Set(comprobantes.filter((c) => c.estado === "contabilizado").map((c) => c.id));
    const idsNotasAnulacion = new Set(comprobantes.filter((c) => c.tipo === "nota_credito" && c.comprobante_origen_id).map((c) => c.id));

    const saldosPorSubcuenta = {};
    const totales = { activo: 0, pasivo: 0, patrimonio: 0, ingreso: 0, gasto: 0 };
    const periodosSet = new Set();

    // Cargar TODOS los movimientos activos en una sola llamada (limite alto).
    // La paginación con `skip` + sort "-fecha" es inestable y duplica/pierde
    // registros entre páginas, lo que desbalanceaba falsamente los totales.
    const todosMovs = await base44.asServiceRole.entities.MovimientoContable.filter(query, "-fecha", 10000);
    for (const m of todosMovs) {
      if (!compValido.has(m.comprobante_id) || idsNotasAnulacion.has(m.comprobante_id)) continue;
      const d = Number(m.debito) || 0;
      const c = Number(m.credito) || 0;
      const key = m.subcuenta;
      if (!saldosPorSubcuenta[key]) {
        saldosPorSubcuenta[key] = { codigo: m.subcuenta, nombre: m.cuenta_nombre, clase: m.clase, debito: 0, credito: 0, saldo: 0, cantidad: 0 };
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

    return Response.json({
      totales,
      saldosPorSubcuenta,
      saldos,
      periodos,
      periodoFiltrado: periodo,
      totalMovimientos: saldos.reduce((s, x) => s + x.cantidad, 0)
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}