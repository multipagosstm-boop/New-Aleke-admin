// Cálculos de amortización PAKREDITO (duplicado del backend para previsualización en UI).

const PERIODOS_POR_ANIO = { diaria: 365, semanal: 52, quincenal: 24, mensual: 12 };

export function tasaEfectivaPeriodo(tasaNominalMensual, periodo) {
  const ppy = PERIODOS_POR_ANIO[periodo];
  return Math.pow(1 + tasaNominalMensual, 12 / ppy) - 1;
}

export function tasaEfectivaAnual(tasaNominalMensual) {
  return Math.pow(1 + tasaNominalMensual, 12) - 1;
}

export function sumarPeriodo(fechaInicio, periodo, n) {
  const d = new Date(fechaInicio + "T00:00:00");
  if (periodo === "mensual") d.setMonth(d.getMonth() + n);
  else if (periodo === "quincenal") d.setDate(d.getDate() + 15 * n);
  else if (periodo === "semanal") d.setDate(d.getDate() + 7 * n);
  else d.setDate(d.getDate() + n);
  return d.toISOString().substring(0, 10);
}

// Deriva la tasa efectiva del periodo desde una cuota fija asignada,
// resolviendo por bisección la fórmula de anualidad:
//   cuota = capital * i / (1 - (1+i)^-n)
// Devuelve i (tasa efectiva del periodo). 0 si la cuota no supera al capital/n.
export function derivarTasaDesdeCuota(capital, cuota, numeroCuotas) {
  if (capital <= 0 || cuota <= 0 || numeroCuotas < 1) return 0;
  const cuotaSinInteres = capital / numeroCuotas;
  if (cuota <= cuotaSinInteres + 0.01) return 0;
  const f = (i) => capital * i / (1 - Math.pow(1 + i, -numeroCuotas)) - cuota;
  let lo = 0, hi = 10;
  if (f(hi) < 0) return hi;
  for (let iter = 0; iter < 200; iter++) {
    const mid = (lo + hi) / 2;
    if (Math.abs(hi - lo) < 1e-12) return mid;
    if (f(mid) > 0) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}

export function generarAmortizacionCuotaFija(capital, tasaNominal, periodo, numeroCuotas, fechaInicio, cuotaManual) {
  let i = tasaEfectivaPeriodo(tasaNominal, periodo);
  let cuota = i > 0 && numeroCuotas > 0
    ? (capital * i / (1 - Math.pow(1 + i, -numeroCuotas)))
    : (capital / Math.max(1, numeroCuotas));
  let tasaNominalUsada = tasaNominal;
  // Cuando se asigna una cuota fija manual, la tasa se deriva de la cuota:
  // se calcula la tasa efectiva del periodo y, desde ella, la nominal mensual.
  if (Number(cuotaManual) > 0) {
    cuota = Number(cuotaManual);
    i = derivarTasaDesdeCuota(capital, cuota, numeroCuotas);
    const ppy = PERIODOS_POR_ANIO[periodo];
    tasaNominalUsada = i > 0 ? Math.pow(1 + i, ppy / 12) - 1 : 0;
  }
  const schedule = [];
  let saldo = capital;
  for (let n = 1; n <= numeroCuotas; n++) {
    const interes = saldo * i;
    let cap = cuota - interes;
    if (n === numeroCuotas) cap = saldo;
    saldo -= cap;
    schedule.push({
      numero: n, fecha_vencimiento: sumarPeriodo(fechaInicio, periodo, n),
      cuota, interes, capital_abono: cap, otros_cobros: 0, cobro_extra: 0, saldo_capital: Math.max(0, saldo),
      estado: "pendiente", valor_pagado: 0
    });
  }
  const totalIntereses = schedule.reduce((s, r) => s + r.interes, 0);
  return { cuota, tasa_efectiva_periodo: i, tasa_nominal_derivada: tasaNominalUsada, schedule, totalIntereses, totalAPagar: cuota * numeroCuotas };
}

export function generarAmortizacionMesVencido(capital, tasaNominal, arg3, arg4, arg5) {
  let periodo = "mensual";
  let numeroCuotas = 1;
  let fechaInicio = "";

  if (typeof arg3 === "string" && ["diaria", "semanal", "quincenal", "mensual"].includes(arg3)) {
    periodo = arg3;
    numeroCuotas = Number(arg4) || 1;
    fechaInicio = arg5 || "";
  } else {
    numeroCuotas = Number(arg3) || 1;
    fechaInicio = arg4 || "";
    if (typeof arg5 === "string" && ["diaria", "semanal", "quincenal", "mensual"].includes(arg5)) {
      periodo = arg5;
    }
  }

  const i = tasaEfectivaPeriodo(tasaNominal, periodo);
  const schedule = [];
  const capBase = capital / Math.max(1, numeroCuotas);
  let saldo = capital;

  for (let n = 1; n <= numeroCuotas; n++) {
    const interes = saldo * i;
    const cap = n === numeroCuotas ? saldo : capBase;
    saldo -= cap;
    schedule.push({
      numero: n,
      fecha_vencimiento: sumarPeriodo(fechaInicio, periodo, n),
      cuota: cap + interes,
      interes,
      capital_abono: cap,
      otros_cobros: 0,
      cobro_extra: 0,
      saldo_capital: Math.max(0, saldo),
      estado: "pendiente",
      valor_pagado: 0
    });
  }
  const totalIntereses = schedule.reduce((s, r) => s + r.interes, 0);
  return {
    cuota: 0,
    cuota_inicial: schedule[0]?.cuota || 0,
    tasa_efectiva_periodo: i,
    schedule,
    totalIntereses,
    totalAPagar: capital + totalIntereses
  };
}

export function estimarInteresesMesVencido(saldoCapital, tasaNominal, fechaUltimoMovimiento, fechaAbono) {
  const f0 = new Date((fechaUltimoMovimiento || fechaAbono) + "T00:00:00");
  const f1 = new Date(fechaAbono + "T00:00:00");
  const dias = Math.max(0, Math.round((f1 - f0) / 86400000));
  const intereses = (tasaNominal / 30) * dias * saldoCapital;
  return { dias, intereses };
}

// Proyecta cuántos intereses y capital cubre un abono sobre las cuotas
// pendientes de un crédito de cuota fija o variable, sin mutar los registros.
export function proyectarAbonoCuotaFija(cuotas, valorAplicado) {
  let restante = valorAplicado;
  let intereses = 0;
  let capital = 0;
  for (const c of (cuotas || [])) {
    if (restante <= 0) break;
    if (c.estado === "pagada") continue;
    // Dentro de cada cuota los intereses se pagan antes que el capital.
    const interesPagado = Math.min(c.interes || 0, c.valor_pagado || 0);
    const capitalPagado = Math.max(0, (c.valor_pagado || 0) - (c.interes || 0));
    const restanteInteres = Math.max(0, (c.interes || 0) - interesPagado);
    const restanteCapital = Math.max(0, (c.capital_abono || 0) - capitalPagado);
    const pagoInteres = Math.min(restanteInteres, restante);
    intereses += pagoInteres;
    restante -= pagoInteres;
    if (restante <= 0) break;
    const pagoCapital = Math.min(restanteCapital, restante);
    capital += pagoCapital;
    restante -= pagoCapital;
  }
  const exceso = Math.max(0, restante);
  return { intereses, capital, exceso };
}

// Calcula el Saldo Total a Deber (valor real a deber según contabilidad: capital pendiente + intereses generados)
export function calcularSaldoTotalDeber(prestamo) {
  if (!prestamo) return 0;
  if (prestamo.estado === "saldado" || Number(prestamo.saldo_capital) <= 0.01) {
    return 0;
  }
  // En contabilidad, el saldo real a deber corresponde al saldo de capital pendiente
  // más los intereses causados/generados pendientes de cobro registrados.
  // El "saldo esperado" del cronograma inicial es una proyección que incluye intereses futuros no causados.
  const cap = Math.max(0, Number(prestamo.saldo_capital) || 0);
  const int = Math.max(0, Number(prestamo.saldo_intereses) || 0);
  return Math.round(cap + int);
}

const parseDetHelper = (d) => {
  if (Array.isArray(d)) return d;
  if (typeof d === "string") {
    try { return JSON.parse(d); } catch { return []; }
  }
  if (typeof d === "object" && d !== null) return [d];
  return [];
};

// Reconcilia el estado exacto de cada cuota a partir de la lista real de abonos aplicados al crédito.
// Garantiza que la amortización refleje 1:1 los abonos existentes, recalculando saldos reales y futuros.
export function reconciliarCuotasConAbonos(cuotasOriginales = [], abonos = [], prestamo = {}) {
  if (!cuotasOriginales || cuotasOriginales.length === 0) return [];

  const pId = prestamo?.id ? String(prestamo.id).trim() : "";
  const pCodigo = prestamo?.codigo ? String(prestamo.codigo).trim().toLowerCase() : "";
  const capitalInicial = Number(prestamo?.capital) || 0;

  // Resetear cuotas a base limpia
  const cuotas = cuotasOriginales.map((c) => ({
    ...c,
    valor_pagado: 0,
    otros_cobros: 0,
    cobro_extra: 0,
    estado: "pendiente",
    fecha_pago: null,
    abono_id: null
  })).sort((a, b) => a.numero - b.numero);

  // Ordenar abonos cronológicamente (más antiguo primero)
  const abonosOrdenados = [...(abonos || [])].sort((a, b) => {
    const cmp = (a.fecha || "").localeCompare(b.fecha || "");
    if (cmp !== 0) return cmp;
    return (a.created_date || "").localeCompare(b.created_date || "");
  });

  // Calcular capital total abonado en los registros reales
  let totalCapitalAbonado = 0;
  for (const ab of abonosOrdenados) {
    const dList = parseDetHelper(ab.detalles);
    const d = dList.find((x) =>
      (pId && String(x.prestamo_id).trim() === pId) ||
      (pCodigo && x.codigo && String(x.codigo).trim().toLowerCase() === pCodigo)
    );
    if (!d) continue;
    const val = Number(d.valor_aplicado) || 0;
    const intVal = Number(d.intereses) || 0;
    const extraVal = Number(d.otros_cobros) || 0;
    const capVal = d.capital !== undefined ? Number(d.capital) : Math.max(0, val - intVal - extraVal);
    totalCapitalAbonado += capVal;
  }

  const estaSaldado = prestamo?.estado === "saldado" || (capitalInicial > 0 && totalCapitalAbonado >= capitalInicial - 1);

  for (const ab of abonosOrdenados) {
    const dList = parseDetHelper(ab.detalles);
    const d = dList.find((x) =>
      (pId && String(x.prestamo_id).trim() === pId) ||
      (pCodigo && x.codigo && String(x.codigo).trim().toLowerCase() === pCodigo)
    );
    if (!d) continue;

    const valorAplicado = Number(d.valor_aplicado) || 0;
    if (valorAplicado <= 0) continue;

    const cobroMas = Boolean(d.cobro_intereses_de_mas);
    const otrosCobros = cobroMas ? Math.round(Number(d.otros_cobros) || 0) : 0;
    const fechaAbono = ab.fecha || null;
    const abonoId = ab.id || null;

    // Buscar la cuota objetivo
    let targetCuota = null;
    if (d.cuota_id) targetCuota = cuotas.find((c) => String(c.id) === String(d.cuota_id));
    if (!targetCuota && d.cuota_numero) targetCuota = cuotas.find((c) => Number(c.numero) === Number(d.cuota_numero));
    if (!targetCuota || targetCuota.estado === "pagada") {
      targetCuota = cuotas.find((c) => c.estado !== "pagada") || cuotas[cuotas.length - 1];
    }
    if (!targetCuota) continue;

    if (cobroMas && otrosCobros > 0) {
      const faltaOrd = Math.max(0, (Number(targetCuota.cuota) || 0) - (Number(targetCuota.valor_pagado) || 0));
      const pagoOrd = Math.min(valorAplicado, faltaOrd);
      let rem = valorAplicado - pagoOrd;
      const asignableExtra = Math.min(rem, otrosCobros);
      rem -= asignableExtra;

      targetCuota.otros_cobros = (Number(targetCuota.otros_cobros) || 0) + asignableExtra;
      targetCuota.cobro_extra = targetCuota.otros_cobros;
      targetCuota.valor_pagado = (Number(targetCuota.valor_pagado) || 0) + pagoOrd + asignableExtra;

      const pagadoSinExtra = targetCuota.valor_pagado - targetCuota.otros_cobros;
      targetCuota.estado = pagadoSinExtra >= ((Number(targetCuota.cuota) || 0) - 0.01) ? "pagada" : (targetCuota.valor_pagado > 0 ? "parcial" : "pendiente");
      targetCuota.fecha_pago = fechaAbono;
      targetCuota.abono_id = abonoId;

      if (rem > 0) {
        for (const sig of cuotas) {
          if (sig.numero <= targetCuota.numero || sig.estado === "pagada" || rem <= 0) continue;
          const fSig = Math.max(0, (Number(sig.cuota) || 0) - (Number(sig.valor_pagado) || 0));
          if (fSig <= 0) continue;
          const pSig = Math.min(rem, fSig);
          sig.valor_pagado = (Number(sig.valor_pagado) || 0) + pSig;
          sig.estado = sig.valor_pagado >= ((Number(sig.cuota) || 0) - 0.01) ? "pagada" : "parcial";
          sig.fecha_pago = fechaAbono;
          sig.abono_id = abonoId;
          rem -= pSig;
        }
        if (rem > 0) {
          const ult = cuotas[cuotas.length - 1];
          if (ult) {
            ult.valor_pagado = (Number(ult.valor_pagado) || 0) + rem;
            rem = 0;
          }
        }
      }
    } else {
      let rem = valorAplicado;
      const faltaOrd = Math.max(0, (Number(targetCuota.cuota) || 0) - (Number(targetCuota.valor_pagado) || 0));
      const pago = Math.min(rem, faltaOrd);
      targetCuota.valor_pagado = (Number(targetCuota.valor_pagado) || 0) + pago;
      targetCuota.estado = targetCuota.valor_pagado >= ((Number(targetCuota.cuota) || 0) - 0.01) ? "pagada" : (targetCuota.valor_pagado > 0 ? "parcial" : "pendiente");
      targetCuota.fecha_pago = fechaAbono;
      targetCuota.abono_id = abonoId;
      rem -= pago;

      if (rem > 0) {
        for (const sig of cuotas) {
          if (sig.numero <= targetCuota.numero || sig.estado === "pagada" || rem <= 0) continue;
          const fSig = Math.max(0, (Number(sig.cuota) || 0) - (Number(sig.valor_pagado) || 0));
          if (fSig <= 0) continue;
          const pSig = Math.min(rem, fSig);
          sig.valor_pagado = (Number(sig.valor_pagado) || 0) + pSig;
          sig.estado = sig.valor_pagado >= ((Number(sig.cuota) || 0) - 0.01) ? "pagada" : "parcial";
          sig.fecha_pago = fechaAbono;
          sig.abono_id = abonoId;
          rem -= pSig;
        }
        if (rem > 0) {
          const ult = cuotas[cuotas.length - 1];
          if (ult) {
            ult.valor_pagado = (Number(ult.valor_pagado) || 0) + rem;
            rem = 0;
          }
        }
      }
    }
  }

  // Si el préstamo fue saldado (o el capital abonado cubrió el 100% del capital prestado),
  // todas las cuotas quedan saldadas/pagadas sin arrastrar deudas teóricas de intereses condonados
  if (estaSaldado) {
    for (const c of cuotas) {
      c.estado = "pagada";
      c.saldo_capital = 0;
    }
    return cuotas;
  }

  // Si el préstamo NO está saldado pero todas las cuotas quedaron marcadas como pagadas
  // (por ejemplo, préstamos de 1 sola cuota donde se abonó parte del crédito),
  // la cuota debe permanecer activa (parcial) porque el cliente aún debe dicha cuota/préstamo.
  const hayPendiente = cuotas.some((c) => c.estado !== "pagada");
  if (!hayPendiente && cuotas.length > 0) {
    const ult = cuotas[cuotas.length - 1];
    ult.estado = (Number(ult.valor_pagado) || 0) > 0 ? "parcial" : "pendiente";
  }

  // Recalcular saldo_capital dinámico y real para cada fila de la tabla de amortización
  let saldoVivo = capitalInicial > 0 ? capitalInicial : (Number(cuotas[0]?.saldo_capital) || 0);

  for (let i = 0; i < cuotas.length; i++) {
    const c = cuotas[i];
    const isLast = i === cuotas.length - 1;

    if (c.estado === "pagada") {
      const extra = Number(c.otros_cobros || c.cobro_extra) || 0;
      const pagadoOrd = Math.max(0, (Number(c.valor_pagado) || 0) - extra);
      const interesOrd = Number(c.interes) || 0;
      const capAbonado = Math.max(Number(c.capital_abono) || 0, pagadoOrd - interesOrd);
      saldoVivo = Math.max(0, saldoVivo - capAbonado);
      c.saldo_capital = Math.round(saldoVivo);
    } else if (c.estado === "parcial") {
      if (isLast && !estaSaldado) {
        c.saldo_capital = Math.max(0, Math.round(capitalInicial - totalCapitalAbonado));
      } else {
        const extra = Number(c.otros_cobros || c.cobro_extra) || 0;
        const pagadoOrd = Math.max(0, (Number(c.valor_pagado) || 0) - extra);
        const interesOrd = Number(c.interes) || 0;
        const capAbonado = Math.max(0, pagadoOrd - interesOrd);
        saldoVivo = Math.max(0, saldoVivo - capAbonado);
        c.saldo_capital = Math.round(saldoVivo);
      }
    } else {
      // Cuota pendiente: saldo proyectado si se paga el capital previsto de esta cuota
      saldoVivo = Math.max(0, saldoVivo - (Number(c.capital_abono) || 0));
      c.saldo_capital = Math.round(saldoVivo);
    }
  }

  return cuotas;
}