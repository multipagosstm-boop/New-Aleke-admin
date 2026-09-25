import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { producto_id, producto_ids } = body;

    const query = { estado: "pendiente_pago" };
    if (producto_id) {
      query.producto_id = producto_id;
    } else if (producto_ids && producto_ids.length > 0) {
      query.producto_id = { $in: producto_ids };
    }

    const extractos = await base44.asServiceRole.entities.ExtractoProducto.filter(query);

    const today = new Date().toISOString().substring(0, 10);
    const warnings = [];
    const resultados = [];

    for (const ext of extractos) {
      // 1. Determinar rango de fechas basado en la fecha de corte de la tarjeta
      // El período del extracto es el período de PAGO (un mes después del corte).
      // Los abonos se cuentan desde la fecha de corte actual hasta la próxima fecha de corte.
      const prod = await base44.asServiceRole.entities.ProductoCredito.get(ext.producto_id);
      const fechaCorte = Math.floor(prod?.fecha_corte || 1);
      const periodo = ext.periodo || "";
      const [anioP, mesP] = periodo.split("-").map(Number);

      let inicio, fin;
      if (anioP && mesP) {
        // Corte actual: día de corte en el mes ANTERIOR al período de pago
        let cAnio = anioP, cMes = mesP - 1;
        if (cMes === 0) { cMes = 12; cAnio -= 1; }
        inicio = `${cAnio}-${String(cMes).padStart(2, "0")}-${String(fechaCorte).padStart(2, "0")}`;
        // Próximo corte: día de corte en el mes del período de pago
        const proximoCorte = `${anioP}-${String(mesP).padStart(2, "0")}-${String(fechaCorte).padStart(2, "0")}`;
        fin = today < proximoCorte ? today : proximoCorte;
      } else {
        inicio = today;
        fin = today;
      }

      // 2. Buscar abonos contabilizados en el rango [corte actual, próximo corte]
      const abonosQuery = {
        producto_credito_id: ext.producto_id,
        tipo_movimiento_tdc: "abono",
        estado: "activo",
        fecha: { $gte: inicio, $lte: fin }
      };

      let skip = 0;
      const limit = 1000;
      let hasMore = true;
      let totalAbonado = 0;

      while (hasMore) {
        const batch = await base44.asServiceRole.entities.MovimientoContable.filter(abonosQuery, "-fecha", limit, skip);
        for (const m of batch) {
          totalAbonado += Number(m.debito) || 0;
        }
        hasMore = batch.length === limit;
        skip += limit;
      }

      // 3. Calcular totales
      const saldoPagar = Number(ext.saldo_a_pagar) || 0;
      const saldoPendiente = saldoPagar - totalAbonado;
      const sinDeuda = saldoPagar === 0;
      const porcentajePagado = saldoPagar > 0 ? (totalAbonado / saldoPagar) * 100 : (sinDeuda ? 100 : 0);
      const saldoAFavor = saldoPendiente < 0 ? Math.abs(saldoPendiente) : 0;

      const estadoAnterior = ext.estado;
      const nuevoEstado = (sinDeuda || (saldoPagar > 0 && saldoPendiente <= 0)) ? "pagado" : estadoAnterior;
      const cambioEstado = nuevoEstado !== estadoAnterior;

      // 4. Actualizar ExtractoProducto
      const updateData = {
        total_abonado: totalAbonado,
        saldo_pendiente: saldoPendiente,
        porcentaje_pagado: porcentajePagado,
        saldo_a_favor: saldoAFavor
      };

      if (cambioEstado && nuevoEstado === "pagado") {
        updateData.estado = "pagado";
        updateData.pagado_automaticamente = true;
        updateData.fecha_pago_efectivo = today;

        // 5. Registrar en HistoricoContable
        await base44.asServiceRole.entities.HistoricoContable.create({
          comprobante_id: ext.id,
          numero_comprobante: ext.periodo || "",
          accion: "pago_automatico",
          descripcion: sinDeuda
            ? `Extracto con saldo $0 — nada por pagar. Marcado como pagado.`
            : `Extracto pagado por acumulación de abonos. Total abonado: $${totalAbonado}. Saldo a favor: $${saldoAFavor}`,
          monto_total: totalAbonado,
          fecha: today
        });

        if (saldoAFavor > 0) {
          const prod = await base44.asServiceRole.entities.ProductoCredito.get(ext.producto_id);
          warnings.push(`Extracto de ${prod?.nombre || ext.producto_id} pagado con $${saldoAFavor} a favor. Considerar aplicar al próximo extracto.`);
        }
      }

      await base44.asServiceRole.entities.ExtractoProducto.update(ext.id, updateData);

      resultados.push({
        extracto_id: ext.id,
        producto_id: ext.producto_id,
        total_abonado: totalAbonado,
        saldo_pendiente: saldoPendiente,
        porcentaje_pagado: porcentajePagado,
        cambio_estado: cambioEstado
      });
    }

    return Response.json({ resultados, warnings });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}