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
      cuota, interes, capital_abono: cap, saldo_capital: Math.max(0, saldo),
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

// Calcula el Saldo Total a Deber (valor final pendiente por pagar)
export function calcularSaldoTotalDeber(prestamo, cuotas = []) {
  if (!prestamo) return 0;
  if (prestamo.estado === "saldado" || (Number(prestamo.saldo_capital) <= 0.01 && !prestamo.saldo_intereses)) {
    return 0;
  }

  if (Array.isArray(cuotas) && cuotas.length > 0) {
    const pendientes = cuotas.filter((c) => c.estado !== "pagada");
    if (pendientes.length > 0) {
      const sumaPendiente = pendientes.reduce(
        (sum, c) => sum + Math.max(0, (Number(c.cuota) || 0) - (Number(c.valor_pagado) || 0)),
        0
      );
      return sumaPendiente + (Number(prestamo.saldo_intereses) || 0);
    }
  }

  // Fallback si no hay cuotas cargadas: proporcional al capital o total_a_pagar
  const totalAPagar = Number(prestamo.total_a_pagar) || (Number(prestamo.capital) + Number(prestamo.total_intereses || 0));
  const capital = Number(prestamo.capital) || 1;
  const saldoCapital = Number(prestamo.saldo_capital) || 0;
  const proporcion = capital > 0 ? (saldoCapital / capital) : 0;
  return Math.round((totalAPagar * proporcion) + (Number(prestamo.saldo_intereses) || 0));
}