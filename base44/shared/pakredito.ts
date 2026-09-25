// Cálculos y lógica de préstamos PAKREDITO.
// Las funciones puras de amortización se duplican en src/lib/pakredito.js
// para que la previsualización del frontend no dependa del backend.

import { ejecutarCreacion, ejecutarAnulacion, ejecutarModificacionDirecta } from "./contabilidad.ts";

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
  const f = (i: number) => capital * i / (1 - Math.pow(1 + i, -numeroCuotas)) - cuota;
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
  let cuota = capital * i / (1 - Math.pow(1 + i, -numeroCuotas));
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
      numero: n,
      fecha_vencimiento: sumarPeriodo(fechaInicio, periodo, n),
      cuota, interes, capital_abono: cap,
      saldo_capital: Math.max(0, saldo),
      estado: "pendiente", valor_pagado: 0
    });
  }
  const totalIntereses = schedule.reduce((s, r) => s + r.interes, 0);
  return { cuota, tasa_efectiva_periodo: i, tasa_nominal_derivada: tasaNominalUsada, schedule, totalIntereses, totalAPagar: cuota * numeroCuotas };
}

export function generarAmortizacionMesVencido(capital, tasaNominal, numeroCuotas, fechaInicio) {
  const schedule = [];
  const capBase = capital / numeroCuotas;
  let saldo = capital;
  for (let n = 1; n <= numeroCuotas; n++) {
    const interes = saldo * tasaNominal;
    const cap = n === numeroCuotas ? saldo : capBase;
    saldo -= cap;
    schedule.push({
      numero: n,
      fecha_vencimiento: sumarPeriodo(fechaInicio, "mensual", n),
      cuota: cap + interes, interes, capital_abono: cap,
      saldo_capital: Math.max(0, saldo),
      estado: "pendiente", valor_pagado: 0
    });
  }
  const totalIntereses = schedule.reduce((s, r) => s + r.interes, 0);
  return { cuota: 0, tasa_efectiva_periodo: tasaNominal, schedule, totalIntereses, totalAPagar: capital + totalIntereses };
}

export function estimarInteresesMesVencido(saldoCapital, tasaNominal, fechaUltimoMovimiento, fechaAbono) {
  const f0 = new Date((fechaUltimoMovimiento || fechaAbono) + "T00:00:00");
  const f1 = new Date(fechaAbono + "T00:00:00");
  const dias = Math.max(0, Math.round((f1 - f0) / 86400000));
  const intereses = (tasaNominal / 30) * dias * saldoCapital;
  return { dias, intereses };
}

// Proyecta cuántos intereses y capital cubre un abono sobre las cuotas
// pendientes de un crédito de cuota fija, sin mutar los registros.
// `exceso` = lo que sobra después de pagar todas las cuotas pendientes
// (se aplica como ingreso adicional de intereses).
export function proyectarAbonoCuotaFija(cuotas, valorAplicado) {
  let restante = valorAplicado;
  let intereses = 0;
  let capital = 0;
  for (const c of cuotas) {
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

async function generarCodigoPrestamo(base44) {
  const existentes = await base44.asServiceRole.entities.Prestamo.list();
  const n = existentes.length + 1;
  return "PK-" + String(n).padStart(3, "0");
}

export async function crearPrestamo(base44, user, params) {
  const { cliente_id, modelo, tasa_nominal, periodo, numero_cuotas, fecha_prestamo, movimientos, cuota_manual, notas } = params;
  const SUBCUENTA_INTERESES = "410503";
  const SUBCUENTA_CARTERA = "120506";

  if (!cliente_id) throw new Error("Cliente es obligatorio");
  const cuotaMan = Number(cuota_manual) || 0;
  // En cuota_fija la tasa puede derivarse desde la cuota asignada, por lo que
  // la tasa nominal ingresada es opcional cuando se define cuota manual.
  const tasaRequerida = !(modelo === "cuota_fija" && cuotaMan > 0);
  if (tasaRequerida && (!tasa_nominal || tasa_nominal <= 0)) throw new Error("Tasa nominal inválida");
  if (!numero_cuotas || numero_cuotas < 1) throw new Error("Número de cuotas inválido");
  if (!fecha_prestamo) throw new Error("Fecha de préstamo obligatoria");
  if (!movimientos || movimientos.length < 1) throw new Error("Debe registrar al menos un movimiento de desembolso");

  const capital = movimientos.reduce((s, m) => s + (Number(m.credito) || 0), 0);
  if (capital <= 0) throw new Error("Capital inválido");

  const gen = modelo === "cuota_fija"
    ? generarAmortizacionCuotaFija(capital, tasa_nominal, periodo, numero_cuotas, fecha_prestamo, cuota_manual)
    : generarAmortizacionMesVencido(capital, tasa_nominal, numero_cuotas, fecha_prestamo);

  // Cuando se asignó una cuota fija manual, la tasa nominal se deriva de ella.
  const tasaNominalFinal = (gen as any).tasa_nominal_derivada !== undefined ? (gen as any).tasa_nominal_derivada : tasa_nominal;

  const cliente = await base44.asServiceRole.entities.Cliente.get(cliente_id);
  const tercero = cliente?.nombre || "";

  // Los movimientos del desembolso son créditos (salidas de dinero: efectivo,
  // CDA, TDC, etc.) y su contrapartida es la cuenta 120506 (Pakredito) en el débito.
  const movimientosAsiento = movimientos
    .filter((m) => Number(m.credito) > 0)
    .map((m) => ({ ...m, debito: 0 }));
  movimientosAsiento.push({
    subcuenta: SUBCUENTA_CARTERA, debito: capital, credito: 0,
    descripcion: `Capital préstamo Pakredito — ${tercero}`,
    tercero, cliente_id
  });

  const { comprobante, warnings } = await ejecutarCreacion(base44, user, {
    tipo: "egreso",
    fecha: fecha_prestamo,
    descripcion: `Desembolso préstamo ${tercero || cliente_id}`,
    movimientos: movimientosAsiento, modo: "balance"
  });

  const codigo = await generarCodigoPrestamo(base44);

  const prestamo = await base44.asServiceRole.entities.Prestamo.create({
    codigo, cliente_id, modelo, capital, tasa_nominal: tasaNominalFinal, periodo, numero_cuotas, fecha_prestamo,
    cuota_fija: gen.cuota,
    tasa_efectiva_periodo: gen.tasa_efectiva_periodo,
    tasa_efectiva_anual: tasaEfectivaAnual(tasaNominalFinal),
    total_intereses: gen.totalIntereses,
    total_a_pagar: gen.totalAPagar,
    saldo_capital: capital, saldo_intereses: 0, estado: "vigente",
    comprobante_id: comprobante.id, subcuenta_cartera: SUBCUENTA_CARTERA, subcuenta_intereses: SUBCUENTA_INTERESES,
    fecha_proximo_pago: gen.schedule[0]?.fecha_vencimiento || "",
    valor_proximo_pago: gen.schedule[0]?.cuota || 0,
    fecha_ultimo_abono: "", notas: notas || ""
  });

  // Solo el modelo de cuota fija persiste el cronograma proyectado.
  // El modelo mes vencido registra cuotas reales a medida que se abona.
  if (modelo === "cuota_fija") {
    const cuotas = gen.schedule.map((c) => ({ ...c, prestamo_id: prestamo.id }));
    await base44.asServiceRole.entities.CuotaAmortizacion.bulkCreate(cuotas);
  }

  return { prestamo, schedule: gen.schedule, warnings, comprobante };
}

async function aplicarAbonoCuotaFija(base44, prestamo, valorAplicado, intereses, fecha, abonoId) {
  const cuotas = await base44.asServiceRole.entities.CuotaAmortizacion.filter({ prestamo_id: prestamo.id });
  cuotas.sort((a, b) => a.numero - b.numero);
  let restante = valorAplicado;
  for (const c of cuotas) {
    if (restante <= 0) break;
    if (c.estado === "pagada") continue;
    const saldoCuota = c.cuota - (c.valor_pagado || 0);
    const pago = Math.min(saldoCuota, restante);
    const nuevoValorPagado = (c.valor_pagado || 0) + pago;
    const nuevoEstado = nuevoValorPagado >= c.cuota - 0.01 ? "pagada" : "parcial";
    await base44.asServiceRole.entities.CuotaAmortizacion.update(c.id, {
      valor_pagado: nuevoValorPagado, estado: nuevoEstado, fecha_pago: fecha, abono_id: abonoId
    });
    restante -= pago;
  }
  // El capital aplicado al saldo = abono − intereses (intereses que el usuario
  // define; la proyección por cuota se usa solo si no se indicó un valor).
  const capitalAplicado = Math.max(0, valorAplicado - intereses);
  const nuevoSaldo = Math.max(0, prestamo.saldo_capital - capitalAplicado);
  const actualizadas = await base44.asServiceRole.entities.CuotaAmortizacion.filter({ prestamo_id: prestamo.id });
  const pendientes = actualizadas.filter((c) => c.estado !== "pagada").sort((a, b) => a.numero - b.numero);
  const proxima = pendientes[0];
  const hoy = new Date().toISOString().substring(0, 10);
  await base44.asServiceRole.entities.Prestamo.update(prestamo.id, {
    saldo_capital: nuevoSaldo,
    fecha_ultimo_abono: fecha,
    estado: nuevoSaldo <= 0.01 ? "saldado" : (proxima && proxima.fecha_vencimiento < hoy ? "en_mora" : "vigente"),
    fecha_proximo_pago: proxima?.fecha_vencimiento || "",
    valor_proximo_pago: proxima?.cuota || 0
  });
}

async function aplicarAbonoMesVencido(base44, prestamo, valorAplicado, intereses, fecha, abonoId) {
  const { dias, intereses: interesesGenerados } = estimarInteresesMesVencido(
    prestamo.saldo_capital, prestamo.tasa_nominal, prestamo.fecha_ultimo_abono || prestamo.fecha_prestamo, fecha
  );
  const estimacion = (prestamo.saldo_intereses || 0) + interesesGenerados;
  const capitalAplicado = Math.max(0, valorAplicado - intereses);
  const nuevoSaldoIntereses = Math.max(0, estimacion - intereses);
  const nuevoSaldoCapital = Math.max(0, prestamo.saldo_capital - capitalAplicado);

  const existentes = await base44.asServiceRole.entities.CuotaAmortizacion.filter({ prestamo_id: prestamo.id });
  const numero = existentes.length + 1;
  await base44.asServiceRole.entities.CuotaAmortizacion.create({
    prestamo_id: prestamo.id, numero,
    fecha_vencimiento: fecha,
    cuota: valorAplicado, interes: intereses, capital_abono: capitalAplicado,
    saldo_capital: nuevoSaldoCapital, estado: "pagada", valor_pagado: valorAplicado,
    fecha_pago: fecha, abono_id: abonoId
  });

  const hoy = new Date().toISOString().substring(0, 10);
  const proximaFecha = sumarPeriodo(fecha, "mensual", 1);
  await base44.asServiceRole.entities.Prestamo.update(prestamo.id, {
    saldo_capital: nuevoSaldoCapital,
    saldo_intereses: nuevoSaldoIntereses,
    fecha_ultimo_abono: fecha,
    estado: nuevoSaldoCapital <= 0.01 ? "saldado" : (proximaFecha < hoy ? "en_mora" : "vigente"),
    fecha_proximo_pago: proximaFecha,
    valor_proximo_pago: nuevoSaldoCapital * prestamo.tasa_nominal
  });
}

export async function registrarAbono(base44, user, params) {
  const { cliente_id, fecha, valor_total, cuenta_ingreso, detalles, notas } = params;
  const SUBCUENTA_CARTERA = "120506";
  const SUBCUENTA_INTERESES = "410503";

  if (!cliente_id) throw new Error("Cliente obligatorio");
  if (!fecha) throw new Error("Fecha obligatoria");
  if (!valor_total || valor_total <= 0) throw new Error("Valor total inválido");
  if (!cuenta_ingreso || !cuenta_ingreso.subcuenta) throw new Error("Seleccione la cuenta de ingreso del abono");
  if (!detalles || detalles.length === 0) throw new Error("Seleccione al menos un crédito");

  const sumaDetalles = detalles.reduce((s, d) => s + (Number(d.valor_aplicado) || 0), 0);
  if (Math.abs(sumaDetalles - valor_total) > 0.01)
    throw new Error(`Debe aplicar todo el abono recibido (${valor_total}). Actualmente aplicado: ${sumaDetalles}`);

  const prestamos = [];
  for (const d of detalles) {
    const p = await base44.asServiceRole.entities.Prestamo.get(d.prestamo_id);
    if (!p) throw new Error(`Préstamo ${d.prestamo_id} no encontrado`);
    if (p.estado === "saldado") throw new Error(`El préstamo ${p.codigo} ya está saldado`);
    prestamos.push(p);
  }

  const cliente = await base44.asServiceRole.entities.Cliente.get(cliente_id);
  const tercero = cliente?.nombre || "";

  // Pre-calcular intereses por crédito (cuota fija los deriva de la cuota que se paga)
  const detallesCalculados = [];
  for (let idx = 0; idx < detalles.length; idx++) {
    const d = detalles[idx];
    const p = prestamos[idx];
    const valorAplicado = Number(d.valor_aplicado) || 0;
    let intereses = 0;
    if (p.modelo === "cuota_fija") {
      const interesesInput = Number(d.intereses);
      if (Number.isFinite(interesesInput) && interesesInput >= 0) {
        // El usuario tiene la última palabra sobre los intereses a cobrar.
        intereses = Math.min(interesesInput, valorAplicado);
      } else {
        const cuotas = await base44.asServiceRole.entities.CuotaAmortizacion.filter({ prestamo_id: p.id });
        cuotas.sort((a, b) => a.numero - b.numero);
        const proy = proyectarAbonoCuotaFija(cuotas, valorAplicado);
        // El exceso (abono superior a capital + intereses pendientes) se aplica como ingreso de intereses.
        intereses = proy.intereses + proy.exceso;
      }
    } else {
      intereses = Number(d.intereses) || 0;
    }
    detallesCalculados.push({
      prestamo: p, valorAplicado, intereses,
      capital: Math.max(0, valorAplicado - intereses)
    });
  }

  // Movimiento de ingreso (débito) sobre la cuenta seleccionada (CDA, efectivo, TDC, cruce, etc.)
  const movimientos = [];
  movimientos.push({
    subcuenta: cuenta_ingreso.subcuenta, debito: valor_total, credito: 0,
    descripcion: "Abono pakredito", tercero, cliente_id,
    cuenta_ahorro_id: cuenta_ingreso.cuenta_ahorro_id || "",
    producto_credito_id: cuenta_ingreso.producto_credito_id || "",
    tipo_movimiento_tdc: cuenta_ingreso.producto_credito_id ? "abono" : null
  });

  // Por cada crédito: crédito a intereses (410503) + crédito a capital (120506)
  for (const dc of detallesCalculados) {
    if (dc.intereses > 0) {
      movimientos.push({
        subcuenta: SUBCUENTA_INTERESES, debito: 0, credito: dc.intereses,
        descripcion: `Intereses ${dc.prestamo.codigo}`, tercero, cliente_id
      });
    }
    if (dc.capital > 0) {
      movimientos.push({
        subcuenta: SUBCUENTA_CARTERA, debito: 0, credito: dc.capital,
        descripcion: `Abono capital ${dc.prestamo.codigo}`, tercero, cliente_id
      });
    }
  }

  const { comprobante, warnings } = await ejecutarCreacion(base44, user, {
    tipo: "ingreso", fecha,
    descripcion: `Abono pakredito — ${tercero}`,
    movimientos, modo: "resultado"
  });

  const abono = await base44.asServiceRole.entities.AbonoPrestamo.create({
    cliente_id, fecha, valor_total, comprobante_id: comprobante.id,
    subcuenta_ingreso: cuenta_ingreso.subcuenta,
    cda_id: cuenta_ingreso.cuenta_ahorro_id || "",
    detalles: detallesCalculados.map((dc) => ({
      prestamo_id: dc.prestamo.id, valor_aplicado: dc.valorAplicado,
      intereses: dc.intereses, capital: dc.capital
    })),
    notas: notas || ""
  });

  for (const dc of detallesCalculados) {
    if (dc.prestamo.modelo === "cuota_fija") {
      await aplicarAbonoCuotaFija(base44, dc.prestamo, dc.valorAplicado, dc.intereses, fecha, abono.id);
    } else {
      await aplicarAbonoMesVencido(base44, dc.prestamo, dc.valorAplicado, dc.intereses, fecha, abono.id);
    }
  }

  return { abono, comprobante, warnings };
}

// === Edición de préstamo ===
// Permite editar notas siempre. Si NO hay abonos aplicados, permite regenerar
// el cronograma (cuota_fija) o ajustar tasa (mes_vencido). Con abonos, cuota_fija
// queda congelado; mes_vencido aún permite ajustar la tasa (afecta intereses futuros).
export async function editarPrestamo(base44, user, params) {
  const { prestamo_id, notas, tasa_nominal, periodo, numero_cuotas, cuota_manual, fecha_prestamo } = params;
  if (!prestamo_id) throw new Error("prestamo_id obligatorio");
  const prestamo = await base44.asServiceRole.entities.Prestamo.get(prestamo_id);
  if (!prestamo) throw new Error("Préstamo no encontrado");

  const abonosCliente = await base44.asServiceRole.entities.AbonoPrestamo.filter({ cliente_id: prestamo.cliente_id });
  const tieneAbonos = abonosCliente.some((a) => (a.detalles || []).some((d) => d.prestamo_id === prestamo_id));

  const update = { notas: notas ?? prestamo.notas };

  if (!tieneAbonos) {
    const nuevaFecha = fecha_prestamo || prestamo.fecha_prestamo;
    if (prestamo.modelo === "cuota_fija") {
      const nuevaTasa = Number(tasa_nominal) || prestamo.tasa_nominal;
      const nuevoPeriodo = periodo || prestamo.periodo;
      const nuevoNum = Number(numero_cuotas) || prestamo.numero_cuotas;
      const cuotaMan = Number(cuota_manual) > 0 ? Number(cuota_manual) : 0;
      const regenerar =
        nuevaTasa !== prestamo.tasa_nominal ||
        nuevoPeriodo !== prestamo.periodo ||
        nuevoNum !== prestamo.numero_cuotas ||
        nuevaFecha !== prestamo.fecha_prestamo ||
        (cuotaMan > 0 && cuotaMan !== prestamo.cuota_fija);
      if (regenerar) {
        if (nuevaTasa <= 0) throw new Error("Tasa nominal inválida");
        if (nuevoNum < 1) throw new Error("Número de cuotas inválido");
        const gen = generarAmortizacionCuotaFija(prestamo.capital, nuevaTasa, nuevoPeriodo, nuevoNum, nuevaFecha, cuotaMan);
        update.tasa_nominal = nuevaTasa;
        update.periodo = nuevoPeriodo;
        update.numero_cuotas = nuevoNum;
        update.cuota_fija = gen.cuota;
        update.tasa_efectiva_periodo = gen.tasa_efectiva_periodo;
        update.tasa_efectiva_anual = tasaEfectivaAnual(nuevaTasa);
        update.total_intereses = gen.totalIntereses;
        update.total_a_pagar = gen.totalAPagar;
        update.fecha_prestamo = nuevaFecha;
        update.fecha_proximo_pago = gen.schedule[0]?.fecha_vencimiento || "";
        update.valor_proximo_pago = gen.schedule[0]?.cuota || 0;
        const cuotasOld = await base44.asServiceRole.entities.CuotaAmortizacion.filter({ prestamo_id });
        for (const c of cuotasOld) await base44.asServiceRole.entities.CuotaAmortizacion.delete(c.id);
        await base44.asServiceRole.entities.CuotaAmortizacion.bulkCreate(gen.schedule.map((c) => ({ ...c, prestamo_id })));
      }
    } else {
      const nuevaTasa = Number(tasa_nominal) || prestamo.tasa_nominal;
      const nuevoNum = Number(numero_cuotas) || prestamo.numero_cuotas;
      const nuevoPeriodo = periodo || prestamo.periodo;
      if (nuevaTasa <= 0) throw new Error("Tasa nominal inválida");
      const tep = tasaEfectivaPeriodo(nuevaTasa, nuevoPeriodo);
      update.tasa_nominal = nuevaTasa;
      update.periodo = nuevoPeriodo;
      update.numero_cuotas = nuevoNum;
      update.tasa_efectiva_periodo = tep;
      update.tasa_efectiva_anual = tasaEfectivaAnual(nuevaTasa);
      update.fecha_prestamo = nuevaFecha;
      update.fecha_proximo_pago = sumarPeriodo(nuevaFecha, nuevoPeriodo, 1);
      update.valor_proximo_pago = prestamo.saldo_capital * tep;
    }
  } else if (prestamo.modelo === "mes_vencido") {
    const nuevaTasa = Number(tasa_nominal) || prestamo.tasa_nominal;
    if (nuevaTasa > 0 && nuevaTasa !== prestamo.tasa_nominal) {
      update.tasa_nominal = nuevaTasa;
      update.tasa_efectiva_periodo = nuevaTasa;
      update.tasa_efectiva_anual = tasaEfectivaAnual(nuevaTasa);
      update.valor_proximo_pago = prestamo.saldo_capital * nuevaTasa;
    }
  }

  await base44.asServiceRole.entities.Prestamo.update(prestamo_id, update);

  await base44.asServiceRole.entities.HistoricoContable.create({
    comprobante_id: prestamo.comprobante_id || "",
    numero_comprobante: prestamo.codigo,
    accion: "edicion_prestamo",
    descripcion: `Préstamo ${prestamo.codigo} editado`,
    monto_total: prestamo.capital || 0,
    usuario_email: user.email || "",
    fecha: new Date().toISOString().substring(0, 10)
  });

  return { ok: true };
}

// === Edición del desembolso ===
// Permite corregir el asiento de desembolso desde el módulo (mismo comprobante,
// mismo id y número — modificación directa, sin nota crédito) y sincroniza el
// préstamo: capital, saldos, cronograma y comprobante_id. Bloquea si hay abonos.
export async function editarDesembolso(base44, user, params) {
  const { prestamo_id, movimientos, motivo } = params;
  if (!prestamo_id) throw new Error("prestamo_id obligatorio");
  if (!movimientos || movimientos.length < 1) throw new Error("Debe registrar al menos un movimiento de desembolso");

  const prestamo = await base44.asServiceRole.entities.Prestamo.get(prestamo_id);
  if (!prestamo) throw new Error("Préstamo no encontrado");

  const abonosCliente = await base44.asServiceRole.entities.AbonoPrestamo.filter({ cliente_id: prestamo.cliente_id });
  const tieneAbonos = abonosCliente.some((a) => (a.detalles || []).some((d) => d.prestamo_id === prestamo_id));
  if (tieneAbonos) throw new Error("No se puede editar el desembolso: el préstamo tiene abonos aplicados. Elimine primero los abonos.");
  if (!prestamo.comprobante_id) throw new Error("El préstamo no tiene comprobante de desembolso.");

  const SUBCUENTA_CARTERA = "120506";

  const nuevoCapital = movimientos.reduce((s, m) => s + (Number(m.credito) || 0), 0);
  if (nuevoCapital <= 0) throw new Error("Capital inválido");

  const cliente = await base44.asServiceRole.entities.Cliente.get(prestamo.cliente_id);
  const tercero = cliente?.nombre || "";

  // Reconstruir el asiento: créditos (salidas de dinero) + contrapartida 120506 al débito.
  const movimientosAsiento = movimientos
    .filter((m) => Number(m.credito) > 0)
    .map((m) => ({ ...m, debito: 0 }));
  movimientosAsiento.push({
    subcuenta: SUBCUENTA_CARTERA, debito: nuevoCapital, credito: 0,
    descripcion: `Capital préstamo Pakredito — ${tercero}`,
    tercero, cliente_id: prestamo.cliente_id
  });

  const comprobante = await base44.asServiceRole.entities.ComprobanteContable.get(prestamo.comprobante_id);
  if (!comprobante) throw new Error("Comprobante de desembolso no encontrado");
  if (comprobante.estado === "anulado") throw new Error("No se puede editar: el comprobante está anulado");

  const { comprobante: modificado, warnings } = await ejecutarModificacionDirecta(base44, comprobante, user, {
    tipo: "egreso",
    fecha: prestamo.fecha_prestamo,
    descripcion: `Desembolso préstamo ${tercero || prestamo.cliente_id}`,
    movimientos: movimientosAsiento, modo: "balance"
  });

  // Regenerar cronograma con el nuevo capital y los parámetros vigentes del préstamo.
  const gen = prestamo.modelo === "cuota_fija"
    ? generarAmortizacionCuotaFija(nuevoCapital, prestamo.tasa_nominal, prestamo.periodo, prestamo.numero_cuotas, prestamo.fecha_prestamo, 0)
    : generarAmortizacionMesVencido(nuevoCapital, prestamo.tasa_nominal, prestamo.numero_cuotas, prestamo.fecha_prestamo);

  const update: any = {
    capital: nuevoCapital,
    saldo_capital: nuevoCapital,
    saldo_intereses: 0,
    tasa_efectiva_periodo: gen.tasa_efectiva_periodo,
    tasa_efectiva_anual: tasaEfectivaAnual(prestamo.tasa_nominal),
    total_intereses: gen.totalIntereses,
    total_a_pagar: gen.totalAPagar
  };

  if (prestamo.modelo === "cuota_fija") {
    update.cuota_fija = gen.cuota;
    update.fecha_proximo_pago = gen.schedule[0]?.fecha_vencimiento || "";
    update.valor_proximo_pago = gen.schedule[0]?.cuota || 0;
  } else {
    update.fecha_proximo_pago = sumarPeriodo(prestamo.fecha_prestamo, "mensual", 1);
    update.valor_proximo_pago = nuevoCapital * prestamo.tasa_nominal;
  }

  await base44.asServiceRole.entities.Prestamo.update(prestamo_id, update);

  if (prestamo.modelo === "cuota_fija") {
    const cuotasOld = await base44.asServiceRole.entities.CuotaAmortizacion.filter({ prestamo_id });
    for (const c of cuotasOld) await base44.asServiceRole.entities.CuotaAmortizacion.delete(c.id);
    await base44.asServiceRole.entities.CuotaAmortizacion.bulkCreate(gen.schedule.map((c) => ({ ...c, prestamo_id })));
  }

  await base44.asServiceRole.entities.HistoricoContable.create({
    comprobante_id: modificado.id,
    numero_comprobante: prestamo.codigo,
    accion: "edicion_desembolso",
    descripcion: `Desembolso ${prestamo.codigo} corregido: ${motivo || "Corrección"}`,
    monto_total: nuevoCapital,
    usuario_email: user.email || "",
    fecha: new Date().toISOString().substring(0, 10)
  });

  return { ok: true, comprobante_id: modificado.id, capital: nuevoCapital, warnings: warnings || [] };
}

// === Eliminación de préstamo ===
// Bloquea si hay abonos aplicados. Anula el comprobante de desembolso (reversa
// saldos y genera nota crédito), elimina las cuotas y el registro del préstamo.
export async function eliminarPrestamo(base44, user, params) {
  const { prestamo_id, motivo } = params;
  if (!prestamo_id) throw new Error("prestamo_id obligatorio");
  const prestamo = await base44.asServiceRole.entities.Prestamo.get(prestamo_id);
  if (!prestamo) throw new Error("Préstamo no encontrado");

  const abonosCliente = await base44.asServiceRole.entities.AbonoPrestamo.filter({ cliente_id: prestamo.cliente_id });
  const abonosPrestamo = abonosCliente.filter((a) => (a.detalles || []).some((d) => d.prestamo_id === prestamo_id));
  if (abonosPrestamo.length > 0)
    throw new Error(`El préstamo tiene ${abonosPrestamo.length} abono(s) aplicado(s). Elimine primero los abonos.`);

  if (prestamo.comprobante_id) {
    const comprobante = await base44.asServiceRole.entities.ComprobanteContable.get(prestamo.comprobante_id);
    if (comprobante && comprobante.estado !== "anulado") {
      await ejecutarAnulacion(base44, comprobante, user, motivo || `Eliminación préstamo ${prestamo.codigo}`);
    }
  }

  const cuotas = await base44.asServiceRole.entities.CuotaAmortizacion.filter({ prestamo_id });
  for (const c of cuotas) await base44.asServiceRole.entities.CuotaAmortizacion.delete(c.id);

  await base44.asServiceRole.entities.Prestamo.delete(prestamo_id);

  await base44.asServiceRole.entities.HistoricoContable.create({
    comprobante_id: prestamo.comprobante_id || "",
    numero_comprobante: prestamo.codigo,
    accion: "eliminacion_prestamo",
    descripcion: `Préstamo ${prestamo.codigo} eliminado: ${motivo || ""}`,
    monto_total: prestamo.capital || 0,
    usuario_email: user.email || "",
    fecha: new Date().toISOString().substring(0, 10)
  });

  return { ok: true, codigo: prestamo.codigo };
}

async function reversarAbonoCuotaFija(base44, prestamo, abonoId, valorAplicado) {
  const cuotas = await base44.asServiceRole.entities.CuotaAmortizacion.filter({ prestamo_id: prestamo.id });
  cuotas.sort((a, b) => a.numero - b.numero);
  const touched = cuotas.filter((c) => c.abono_id === abonoId).sort((a, b) => b.numero - a.numero);
  let restante = valorAplicado;
  for (const c of touched) {
    if (restante <= 0) break;
    const pago = Math.min(restante, c.valor_pagado || 0);
    const nuevoValor = Math.max(0, (c.valor_pagado || 0) - pago);
    const nuevoEstado = nuevoValor <= 0.01 ? "pendiente" : "parcial";
    await base44.asServiceRole.entities.CuotaAmortizacion.update(c.id, {
      valor_pagado: nuevoValor,
      estado: nuevoEstado,
      fecha_pago: nuevoValor <= 0.01 ? "" : c.fecha_pago,
      abono_id: nuevoValor <= 0.01 ? "" : c.abono_id
    });
    restante -= pago;
  }
  const actualizadas = await base44.asServiceRole.entities.CuotaAmortizacion.filter({ prestamo_id: prestamo.id });
  actualizadas.sort((a, b) => a.numero - b.numero);
  // Saldo de capital desde el capital registrado en los abonos reales,
  // excluyendo el abono que se está reversando.
  const abonos = await base44.asServiceRole.entities.AbonoPrestamo.filter({ cliente_id: prestamo.cliente_id });
  const capAbonado = abonos
    .filter((a) => a.id !== abonoId)
    .reduce((s, a) => s + (a.detalles || []).filter((d) => d.prestamo_id === prestamo.id).reduce((s2, d) => s2 + (Number(d.capital) || 0), 0), 0);
  const saldoCapital = Math.max(0, prestamo.capital - capAbonado);
  const pendientes = actualizadas.filter((c) => c.estado !== "pagada").sort((a, b) => a.numero - b.numero);
  const pagas = actualizadas.filter((c) => c.estado === "pagada").sort((a, b) => b.numero - a.numero);
  const fechaUltimoAbono = pagas[0]?.fecha_pago || prestamo.fecha_prestamo;
  const hoy = new Date().toISOString().substring(0, 10);
  const proxima = pendientes[0];
  await base44.asServiceRole.entities.Prestamo.update(prestamo.id, {
    saldo_capital: saldoCapital,
    fecha_ultimo_abono: fechaUltimoAbono,
    estado: saldoCapital <= 0.01 ? "saldado" : (proxima && proxima.fecha_vencimiento < hoy ? "en_mora" : "vigente"),
    fecha_proximo_pago: proxima?.fecha_vencimiento || "",
    valor_proximo_pago: proxima?.cuota || 0
  });
}

async function reversarAbonoMesVencido(base44, prestamo, abonoId, detalle) {
  const cuotas = await base44.asServiceRole.entities.CuotaAmortizacion.filter({ prestamo_id: prestamo.id });
  const cuotaAbono = cuotas.find((c) => c.abono_id === abonoId);
  if (cuotaAbono) await base44.asServiceRole.entities.CuotaAmortizacion.delete(cuotaAbono.id);
  const restantes = (await base44.asServiceRole.entities.CuotaAmortizacion.filter({ prestamo_id: prestamo.id })).sort((a, b) => a.numero - b.numero);
  const saldoCap = Math.max(0, prestamo.capital - restantes.reduce((s, c) => s + (c.capital_abono || 0), 0));
  const ultima = restantes[restantes.length - 1];
  const fechaUltimoAbono = ultima?.fecha_pago || prestamo.fecha_prestamo;
  const saldoIntereses = Math.max(0, (prestamo.saldo_intereses || 0) + (cuotaAbono?.interes || Number(detalle.intereses) || 0));
  const hoy = new Date().toISOString().substring(0, 10);
  const proximaFecha = sumarPeriodo(fechaUltimoAbono, "mensual", 1);
  await base44.asServiceRole.entities.Prestamo.update(prestamo.id, {
    saldo_capital: saldoCap,
    saldo_intereses: saldoIntereses,
    fecha_ultimo_abono: fechaUltimoAbono,
    estado: saldoCap <= 0.01 ? "saldado" : (proximaFecha < hoy ? "en_mora" : "vigente"),
    fecha_proximo_pago: proximaFecha,
    valor_proximo_pago: saldoCap * prestamo.tasa_nominal
  });
}

// === Eliminación de abono ===
// Anula el comprobante del abono (reversa el libro diario: CDA/TDC, cartera 120506,
// intereses 410503) y restaura el estado del préstamo (cuotas, saldos, intereses).
export async function eliminarAbono(base44, user, params) {
  const { abono_id, motivo } = params;
  if (!abono_id) throw new Error("abono_id obligatorio");
  const abono = await base44.asServiceRole.entities.AbonoPrestamo.get(abono_id);
  if (!abono) throw new Error("Abono no encontrado");

  if (abono.comprobante_id) {
    const comprobante = await base44.asServiceRole.entities.ComprobanteContable.get(abono.comprobante_id);
    if (comprobante && comprobante.estado !== "anulado") {
      await ejecutarAnulacion(base44, comprobante, user, motivo || `Eliminación abono pakredito`);
    }
  }

  for (const d of (abono.detalles || [])) {
    const prestamo = await base44.asServiceRole.entities.Prestamo.get(d.prestamo_id);
    if (!prestamo) continue;
    if (prestamo.modelo === "cuota_fija") {
      await reversarAbonoCuotaFija(base44, prestamo, abono.id, Number(d.valor_aplicado) || 0);
    } else {
      await reversarAbonoMesVencido(base44, prestamo, abono.id, d);
    }
  }

  await base44.asServiceRole.entities.AbonoPrestamo.delete(abono_id);

  await base44.asServiceRole.entities.HistoricoContable.create({
    comprobante_id: abono.comprobante_id || "",
    numero_comprobante: abono.comprobante_id || "",
    accion: "eliminacion_abono",
    descripcion: `Abono pakredito (${abono.valor_total}) eliminado: ${motivo || ""}`,
    monto_total: abono.valor_total || 0,
    usuario_email: user.email || "",
    fecha: new Date().toISOString().substring(0, 10)
  });

  return { ok: true };
}

export async function recalcularEstado(base44) {
  // Primero sincroniza préstamos y abonos con los movimientos contables reales,
  // por si el usuario modificó asientos desde el libro diario.
  const sync = await sincronizarDesdeContable(base44);
  const hoy = new Date().toISOString().substring(0, 10);
  const prestamos = await base44.asServiceRole.entities.Prestamo.filter({ estado: "vigente" });
  const enMora = await base44.asServiceRole.entities.Prestamo.filter({ estado: "en_mora" });
  let actualizados = 0;

  for (const p of [...prestamos, ...enMora]) {
    if (p.saldo_capital <= 0.01) {
      await base44.asServiceRole.entities.Prestamo.update(p.id, { estado: "saldado" });
      actualizados++;
      continue;
    }
    if (p.modelo === "cuota_fija") {
      const cuotas = await base44.asServiceRole.entities.CuotaAmortizacion.filter({ prestamo_id: p.id });
      for (const c of cuotas) {
        if (c.estado === "pendiente" && c.fecha_vencimiento < hoy) {
          await base44.asServiceRole.entities.CuotaAmortizacion.update(c.id, { estado: "vencida" });
        }
      }
    }
    const enMoraAhora = (p.fecha_proximo_pago && p.fecha_proximo_pago < hoy);
    await base44.asServiceRole.entities.Prestamo.update(p.id, { estado: enMoraAhora ? "en_mora" : "vigente" });
    actualizados++;
  }
  return { ...sync, actualizados };
}

// === Sincronización desde el libro diario ===
// Recalcula los abonos y préstamos a partir de los movimientos contables reales.
// Si el usuario modificó un asiento desde el libro diario (por ejemplo, quitando
// intereses que no aplicaban), esta función actualiza los detalles del abono
// (intereses/capital) y los saldos del préstamo para que el módulo refleje lo
// que realmente está en contabilidad.
export async function sincronizarDesdeContable(base44) {
  const SUBCUENTA_INTERESES = "410503";
  const SUBCUENTA_CARTERA = "120506";
  const hoy = new Date().toISOString().substring(0, 10);

  const abonos = await base44.asServiceRole.entities.AbonoPrestamo.list();
  const prestamos = await base44.asServiceRole.entities.Prestamo.list();
  const prestamoById = new Map(prestamos.map((p) => [p.id, p]));

  const capitalPorPrestamo: any = {};
  const abonosPorPrestamo: any = {};
  let abonosActualizados = 0;

  for (const abono of abonos) {
    let newDetalles = abono.detalles || [];
    let changed = false;
    if (abono.comprobante_id) {
      const movs = await base44.asServiceRole.entities.MovimientoContable.filter({ comprobante_id: abono.comprobante_id });
      const activos = movs.filter((m) => m.estado === "activo");
      newDetalles = [];
      for (const d of (abono.detalles || [])) {
        const prestamo = prestamoById.get(d.prestamo_id);
        if (!prestamo) { newDetalles.push(d); continue; }
        const codigo = prestamo.codigo;
        const matchCodigo = (desc: string) => { const m = (desc || "").match(/PK-\d{3}/); return m && m[0] === codigo; };
        const interesesMov = activos
          .filter((m) => m.subcuenta === SUBCUENTA_INTERESES && Number(m.credito) > 0 && matchCodigo(m.descripcion))
          .reduce((s, m) => s + Number(m.credito || 0), 0);
        const capitalMov = activos
          .filter((m) => m.subcuenta === SUBCUENTA_CARTERA && Number(m.credito) > 0 && matchCodigo(m.descripcion))
          .reduce((s, m) => s + Number(m.credito || 0), 0);
        const newInt = Math.round(interesesMov * 100) / 100;
        const newCap = Math.round(capitalMov * 100) / 100;
        if (Math.abs(newInt - Number(d.intereses || 0)) > 0.01 || Math.abs(newCap - Number(d.capital || 0)) > 0.01) changed = true;
        newDetalles.push({ ...d, intereses: newInt, capital: newCap, valor_aplicado: Math.round((newInt + newCap) * 100) / 100 });
      }
      if (changed) {
        await base44.asServiceRole.entities.AbonoPrestamo.update(abono.id, { detalles: newDetalles });
        abonosActualizados++;
      }
    }
    for (const d of newDetalles) {
      capitalPorPrestamo[d.prestamo_id] = (capitalPorPrestamo[d.prestamo_id] || 0) + (Number(d.capital) || 0);
      (abonosPorPrestamo[d.prestamo_id] = abonosPorPrestamo[d.prestamo_id] || []).push({
        fecha: abono.fecha, intereses: Number(d.intereses) || 0, capital: Number(d.capital) || 0
      });
    }
  }

  let prestamosActualizados = 0;
  for (const p of prestamos) {
    const update: any = {};
    const capAbonado = capitalPorPrestamo[p.id] || 0;
    const nuevoSaldoCapital = Math.max(0, p.capital - capAbonado);
    if (Math.abs(nuevoSaldoCapital - Number(p.saldo_capital || 0)) > 0.01) update.saldo_capital = nuevoSaldoCapital;

    if (p.modelo === "mes_vencido") {
      const abonosP = (abonosPorPrestamo[p.id] || []).slice().sort((a: any, b: any) => a.fecha.localeCompare(b.fecha));
      let saldo = p.capital, saldoInt = 0, fechaUlt = p.fecha_prestamo;
      for (const a of abonosP) {
        const { intereses: gen } = estimarInteresesMesVencido(saldo, p.tasa_nominal, fechaUlt, a.fecha);
        saldoInt = Math.max(0, saldoInt + gen - a.intereses);
        saldo = Math.max(0, saldo - a.capital);
        fechaUlt = a.fecha;
      }
      if (Math.abs(saldoInt - Number(p.saldo_intereses || 0)) > 0.01) update.saldo_intereses = Math.round(saldoInt * 100) / 100;
    }

    const nuevoEstado = nuevoSaldoCapital <= 0.01 ? "saldado" : (p.fecha_proximo_pago && p.fecha_proximo_pago < hoy ? "en_mora" : "vigente");
    if (nuevoEstado !== p.estado) update.estado = nuevoEstado;

    if (Object.keys(update).length > 0) {
      await base44.asServiceRole.entities.Prestamo.update(p.id, update);
      prestamosActualizados++;
    }

    // cuota_fija saldado: marcar cuotas restantes como pagadas
    if (p.modelo === "cuota_fija" && nuevoSaldoCapital <= 0.01) {
      const cuotas = await base44.asServiceRole.entities.CuotaAmortizacion.filter({ prestamo_id: p.id });
      for (const c of cuotas) {
        if (c.estado !== "pagada") {
          await base44.asServiceRole.entities.CuotaAmortizacion.update(c.id, { estado: "pagada", valor_pagado: c.cuota, fecha_pago: c.fecha_pago || hoy });
        }
      }
    }
  }

  return { abonosActualizados, prestamosActualizados };
}