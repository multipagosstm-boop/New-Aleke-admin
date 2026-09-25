import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";

// Recalcula los saldos de TODAS las CuentasAhorro y ProductosCredito directamente
// desde los MovimientoContable activos. Útil cuando se eliminan o modifican
// movimientos manualmente (fuera del flujo de anulación/modificación) y los
// saldos almacenados quedan desincronizados.

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Cargar comprobantes válidos (contabilizados) para detectar movimientos huérfanos
    const comprobantes = await base44.asServiceRole.entities.ComprobanteContable.list("-fecha", 10000);
    const compValido = new Set(comprobantes.filter((c) => c.estado === "contabilizado").map((c) => c.id));
    // Notas crédito de anulación (espejo): revierten asientos ya anulados; excluirlas de
    // saldos de CDA y productos para no duplicar el reverso.
    const idsNotasAnulacion = new Set(
      comprobantes.filter((c) => c.tipo === "nota_credito" && c.comprobante_origen_id).map((c) => c.id)
    );

    // Cargar todos los movimientos
    const movs = await base44.asServiceRole.entities.MovimientoContable.list("-fecha", 20000);

    // Eliminar movimientos huérfanos: su comprobante fue borrado directamente o anulado,
    // pero el movimiento quedó activo. Estos son los "saldos fantasma" del balance y los
    // saldos residuales en cuentas de ahorro y tarjetas.
    const huerfanos = movs.filter((m) => m.estado === "activo" && !compValido.has(m.comprobante_id));
    let huerfanosEliminados = 0;
    if (huerfanos.length > 0) {
      await base44.asServiceRole.entities.MovimientoContable.deleteMany({ id: { $in: huerfanos.map((m) => m.id) } });
      huerfanosEliminados = huerfanos.length;
    }

    // Movimientos válidos: activos, comprobante contabilizado y no nota de anulación.
    const activos = movs.filter(
      (m) => m.estado === "activo" && compValido.has(m.comprobante_id) && !idsNotasAnulacion.has(m.comprobante_id)
    );

    const mesActual = new Date().toISOString().substring(0, 7);

    // Acumuladores por subcuenta (CDA) y por producto (TDC/crédito).
    // El saldo y el acumulado GMF de una CDA se calculan desde su subcuenta PUC, no desde
    // el vínculo cuenta_ahorro_id, para incluir los movimientos registrados sobre la
    // subcuenta sin vínculo explícito (brecha histórica de GMF). El acumulado se acota al
    // mes en curso (periodo_operacion), reiniciándose cada mes.
    const saldosPorSubcuenta = {}; // subcuenta -> { debito, credito, acumMes }
    const saldosProd = {};        // id -> { debito, credito }
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

    // Recalcular CuentasAhorro desde su subcuenta PUC
    const cdas = await base44.asServiceRole.entities.CuentaAhorro.list();
    let cdasActualizados = 0;
    for (const cda of cdas) {
      const s = saldosPorSubcuenta[String(cda.subcuenta_puc)] || { debito: 0, credito: 0, acumMes: 0 };
      const nuevoSaldo = Math.round((s.debito - s.credito) * 100) / 100;
      const nuevoAcum = Math.round(s.acumMes);
      if (Number(cda.saldo) !== nuevoSaldo || Number(cda.movimientos_mes_acumulado || 0) !== nuevoAcum) {
        await base44.asServiceRole.entities.CuentaAhorro.update(cda.id, {
          saldo: nuevoSaldo,
          movimientos_mes_acumulado: nuevoAcum
        });
        cdasActualizados++;
      }
    }

    // Recalcular ProductosCredito: TDC (pasivo) saldo = créditos - débitos; resto = débitos - créditos
    const productos = await base44.asServiceRole.entities.ProductoCredito.list();
    let prodsActualizados = 0;
    for (const p of productos) {
      const s = saldosProd[p.id] || { debito: 0, credito: 0 };
      const esPasivo = p.tipo === "TDC";
      const nuevoSaldo = Math.round((esPasivo ? (s.credito - s.debito) : (s.debito - s.credito)) * 100) / 100;
      if (Number(p.saldo) !== nuevoSaldo) {
        await base44.asServiceRole.entities.ProductoCredito.update(p.id, { saldo: nuevoSaldo });
        prodsActualizados++;
      }
    }

    // Recalcular totales de balance y estados financieros
    // (los activos ya excluyen notas crédito de anulación)
    const totales = { activo: 0, pasivo: 0, patrimonio: 0, ingreso: 0, gasto: 0 };
    for (const m of activos) {
      const d = Number(m.debito) || 0;
      const c = Number(m.credito) || 0;
      if (totales[m.clase] !== undefined) {
        if (m.clase === "activo" || m.clase === "gasto") totales[m.clase] += d - c;
        else totales[m.clase] += c - d;
      }
    }
    totales.utilidad = totales.ingreso - totales.gasto;

    await base44.asServiceRole.entities.HistoricoContable.create({
      numero_comprobante: "RECALCULO-SALDOS",
      accion: "recalculo_saldos_global",
      descripcion: `Recálculo global de saldos desde MovimientoContable. Huérfanos eliminados: ${huerfanosEliminados}. CDAs actualizados: ${cdasActualizados}/${cdas.length}. Productos actualizados: ${prodsActualizados}/${productos.length}. Totales: Activo ${totales.activo}, Pasivo ${totales.pasivo}, Patrimonio ${totales.patrimonio}, Utilidad ${totales.utilidad}.`,
      monto_total: 0,
      usuario_email: user.email || "",
      fecha: new Date().toISOString().substring(0, 10)
    });

    return Response.json({
      ok: true,
      huerfanos_eliminados: huerfanosEliminados,
      cdas_actualizados: cdasActualizados,
      productos_actualizados: prodsActualizados,
      total_cdas: cdas.length,
      total_productos: productos.length,
      totales
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}