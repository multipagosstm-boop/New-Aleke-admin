// Sincroniza los registros de Aleke Rooftop cuando un comprobante contable
// vinculado es anulado o modificado, para que pagos y depósitos reflejen
// siempre la realidad contable.

export async function sincronizarRooftopTrasComprobante(base44, comprobanteId, accion) {
  // accion: "anulacion" | "modificacion"
  const cambios = { pagos: 0, depositos: 0 };

  // 1. Pagos de arriendo vinculados a este comprobante
  const pagos = await base44.asServiceRole.entities.PagoArriendo.filter({ comprobante_id: comprobanteId });
  for (const pago of pagos) {
    if (accion === "anulacion") {
      await base44.asServiceRole.entities.PagoArriendo.update(pago.id, {
        valor_pagado: 0,
        fecha_pago_real: "",
        dias_mora: 0,
        estado: "pendiente",
        saldo_restante: pago.valor_esperado || 0,
        comprobante_id: ""
      });
    } else {
      const nuevoValor = await sumarDebitosIngreso(base44, comprobanteId);
      const esperado = pago.valor_esperado || 0;
      let estado;
      if (nuevoValor >= esperado) estado = "pagado";
      else if (nuevoValor > 0) estado = "parcial";
      else estado = "pendiente";
      await base44.asServiceRole.entities.PagoArriendo.update(pago.id, {
        valor_pagado: nuevoValor,
        estado,
        saldo_restante: Math.max(0, esperado - nuevoValor)
      });
    }
    cambios.pagos++;
  }

  // 2. Depósito inicial de contrato vinculado (comprobante_deposito_id)
  const contratos = await base44.asServiceRole.entities.ContratoArriendo.filter({ comprobante_deposito_id: comprobanteId });
  for (const cont of contratos) {
    if (accion === "anulacion") {
      await base44.asServiceRole.entities.ContratoArriendo.update(cont.id, {
        deposito_pagado: false,
        comprobante_deposito_id: ""
      });
    } else {
      const total = await sumarDebitosIngreso(base44, comprobanteId);
      await base44.asServiceRole.entities.ContratoArriendo.update(cont.id, {
        deposito_pagado: total > 0
      });
    }
    cambios.depositos++;
  }

  return cambios;
}

// Suma los débitos sobre cuentas de ahorro (entradas de efectivo) de los
// movimientos activos del comprobante. Para arriendos y depósitos de Rooftop
// este valor equivale al monto pagado/abonado.
async function sumarDebitosIngreso(base44, comprobanteId) {
  const movs = await base44.asServiceRole.entities.MovimientoContable.filter({
    comprobante_id: comprobanteId, estado: "activo"
  });
  return movs
    .filter((m) => Number(m.debito) > 0)
    .reduce((s, m) => s + (Number(m.debito) || 0), 0);
}