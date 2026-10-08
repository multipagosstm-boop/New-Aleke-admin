// Utilidades y cálculos financieros para la línea de negocio Emprendamos
import { formatCOP, formatDate } from "./contabilidad";

export const SUBCUENTA_CARTERA = "120502";   // Activo — Cartera Emprendamos
export const SUBCUENTA_INTERESES = "410509"; // Ingreso — Intereses Emprendamos
export const SUBCUENTA_COMISIONES = "410510";// Ingreso — Comisiones Emprendamos

export const TASA_HABITUAL_DEFAULT = 0.03; // 3% mensual para créditos dentro de cupo
export const TASA_EXTRACUPO_DEFAULT = 0.06; // 6% mensual para extracupo
export const COMISION_PRODUCTO_PCT = 0.10; // 10% de comisión por nuevo cupo/producto

/**
 * Calcula el cupo total de tarjetas de crédito activas del cliente
 */
export function calcularCupoTDC(clienteId, productos = []) {
  if (!clienteId || !Array.isArray(productos)) return 0;
  return productos
    .filter((p) => p.titular_id === clienteId && p.estado === "activo" && p.tipo === "TDC")
    .reduce((sum, p) => sum + (Number(p.cupo) || 0), 0);
}

/**
 * Calcula el cupo usado en créditos habituales y cartera inicial
 */
export function calcularCupoUsado(creditos = []) {
  if (!Array.isArray(creditos)) return 0;
  return creditos
    .filter((c) => (c.tipo === "habitual" || c.tipo === "cartera_inicial") && c.estado === "vigente")
    .reduce((sum, c) => sum + (Number(c.saldo_capital) || 0), 0);
}

/**
 * Calcula el cupo disponible del cliente
 */
export function calcularCupoDisponible(cupoAsignado = 0, creditos = []) {
  const usado = calcularCupoUsado(creditos);
  return Math.max(0, Number(cupoAsignado || 0) - usado);
}

/**
 * Calcula el total de extracupo utilizado actualmente
 */
export function calcularExtracupoUsado(creditos = []) {
  if (!Array.isArray(creditos)) return 0;
  return creditos
    .filter((c) => c.tipo === "extracupo" && c.estado === "vigente")
    .reduce((sum, c) => sum + (Number(c.saldo_capital) || 0), 0);
}

/**
 * Formatea tasa decimal como porcentaje legible (0.03 -> 3.0%)
 */
export function formatearTasaPorcentaje(tasa) {
  if (tasa == null || isNaN(tasa)) return "0.0%";
  return `${(Number(tasa) * 100).toFixed(1)}%`;
}

/**
 * Calcula la próxima fecha de pago a partir del día del mes pactado (1-28)
 */
export function calcularProximaFechaPago(diaPago, desdeFecha) {
  const base = desdeFecha ? new Date(desdeFecha + "T00:00:00") : new Date();
  const year = base.getFullYear();
  const month = base.getMonth();
  const dia = Math.min(28, Math.max(1, Number(diaPago) || 15));

  // Fecha tentativa en el mes actual
  let tentativa = new Date(year, month, dia);
  const hoySinHora = new Date();
  hoySinHora.setHours(0, 0, 0, 0);

  if (tentativa < hoySinHora) {
    // Ya pasó en el mes actual, mover al siguiente mes
    tentativa = new Date(year, month + 1, dia);
  }

  const y = tentativa.getFullYear();
  const m = String(tentativa.getMonth() + 1).padStart(2, "0");
  const d = String(tentativa.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Evalúa alertas de pago, mora, topes de cupo y elegibilidad de salida
 */
export function evaluarAlertasEmprendamos(inscritos = [], creditos = [], abonos = [], diasAnticipacion = 3) {
  const hoy = new Date().toISOString().substring(0, 10);
  const hoyDate = new Date(hoy + "T00:00:00");
  const mesActual = hoy.substring(0, 7);

  const proximosPagos = [];
  const pagosVencidos = [];
  const cupoAlLimite = [];
  const elegiblesSalida = [];
  const sinAbonoMes = [];

  for (const ins of inscritos) {
    if (ins.estado !== "activo") continue;

    const credsCliente = creditos.filter((c) => c.emprendamos_cliente_id === ins.id && c.estado === "vigente");
    const saldoTotal = credsCliente.reduce((sum, c) => sum + (Number(c.saldo_capital) || 0) + (Number(c.saldo_intereses) || 0), 0);
    const cupoUsado = calcularCupoUsado(credsCliente);
    const cupoDisp = Math.max(0, (ins.cupo_asignado || 0) - cupoUsado);

    // 1. Alerta de cupo casi agotado (< 10% disponible y con cupo asignado)
    if (ins.cupo_asignado > 0 && cupoDisp <= ins.cupo_asignado * 0.1) {
      cupoAlLimite.push({
        cliente: ins,
        cupo_asignado: ins.cupo_asignado,
        cupo_usado: cupoUsado,
        cupo_disponible: cupoDisp,
        porcentaje_disponible: ins.cupo_asignado > 0 ? (cupoDisp / ins.cupo_asignado) * 100 : 0
      });
    }

    // 2. Alerta de elegibilidad para salida (1 año o más)
    if (ins.fecha_eligible_salida && ins.fecha_eligible_salida <= hoy) {
      elegiblesSalida.push({
        cliente: ins,
        fecha_ingreso: ins.fecha_ingreso,
        fecha_eligible: ins.fecha_eligible_salida,
        saldo_pendiente: saldoTotal
      });
    }

    // 3. Revisar si realizó abonos en el mes en curso
    const abonosDelMes = abonos.filter((a) => a.emprendamos_cliente_id === ins.id && a.fecha && a.fecha.startsWith(mesActual));
    if (abonosDelMes.length === 0 && saldoTotal > 0) {
      sinAbonoMes.push({
        cliente: ins,
        saldo_pendiente: saldoTotal,
        dia_pago: ins.dia_pago
      });
    }

    // 4. Próximos pagos / avisos anticipados (3 días o más)
    for (const c of credsCliente) {
      if (!c.fecha_proximo_pago) continue;
      const fVenc = new Date(c.fecha_proximo_pago + "T00:00:00");
      const diffDias = Math.round((fVenc - hoyDate) / (1000 * 60 * 60 * 24));

      if (diffDias < 0) {
        pagosVencidos.push({
          cliente: ins,
          credito: c,
          fecha_vencimiento: c.fecha_proximo_pago,
          dias_vencido: Math.abs(diffDias),
          saldo_capital: c.saldo_capital,
          saldo_intereses: c.saldo_intereses
        });
      } else if (diffDias <= diasAnticipacion) {
        proximosPagos.push({
          cliente: ins,
          credito: c,
          fecha_vencimiento: c.fecha_proximo_pago,
          dias_restantes: diffDias,
          saldo_capital: c.saldo_capital,
          saldo_intereses: c.saldo_intereses
        });
      }
    }
  }

  return {
    proximosPagos,
    pagosVencidos,
    cupoAlLimite,
    elegiblesSalida,
    sinAbonoMes
  };
}

/**
 * Genera la cronología / evolución de amortización de un crédito
 */
export function generarEvolucionCredito(credito, abonos = [], intereses = []) {
  if (!credito) return [];

  const eventos = [];

  // 1. Desembolso o saldo inicial
  eventos.push({
    tipo: "origen",
    fecha: credito.fecha,
    descripcion: credito.concepto || `Apertura crédito ${credito.codigo}`,
    capital_inicial: credito.capital,
    debito_cartera: credito.capital,
    credito_cartera: 0,
    intereses_causados: 0,
    abono_capital: 0,
    abono_intereses: 0,
    saldo_capital: credito.capital,
    saldo_intereses: 0
  });

  // 2. Intereses causados
  const intsCred = intereses.filter((i) => i.credito_id === credito.id && i.estado !== "anulado");
  for (const it of intsCred) {
    eventos.push({
      tipo: "interes",
      fecha: it.fecha,
      periodo: it.periodo,
      descripcion: `Interés mensual ${it.periodo} (${formatearTasaPorcentaje(it.tasa)})`,
      debito_cartera: it.intereses,
      credito_cartera: 0,
      intereses_causados: it.intereses,
      abono_capital: 0,
      abono_intereses: 0
    });
  }

  // 3. Abonos aplicados
  for (const ab of abonos) {
    const detalles = Array.isArray(ab.detalles) ? ab.detalles : [];
    const det = detalles.find((d) => d.credito_id === credito.id);
    if (det && (det.valor_aplicado > 0 || det.capital > 0 || det.intereses > 0)) {
      eventos.push({
        tipo: "abono",
        fecha: ab.fecha,
        descripcion: `Abono (${ab.tipo || 'pago'}) - ${ab.subcuenta_ingreso || 'Ingreso'}`,
        debito_cartera: 0,
        credito_cartera: det.valor_aplicado || (det.capital + det.intereses),
        intereses_causados: 0,
        abono_capital: det.capital || 0,
        abono_intereses: det.intereses || 0
      });
    }
  }

  // Ordenar cronológicamente
  eventos.sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""));

  // Calcular saldos acumulados paso a paso
  let saldoCap = 0;
  let saldoInt = 0;

  return eventos.map((ev) => {
    if (ev.tipo === "origen") {
      saldoCap = ev.capital_inicial;
      saldoInt = 0;
    } else if (ev.tipo === "interes") {
      saldoInt += ev.intereses_causados;
    } else if (ev.tipo === "abono") {
      saldoInt = Math.max(0, saldoInt - ev.abono_intereses);
      saldoCap = Math.max(0, saldoCap - ev.abono_capital);
    }

    return {
      ...ev,
      saldo_capital_corriente: saldoCap,
      saldo_intereses_corriente: saldoInt,
      saldo_total_corriente: saldoCap + saldoInt
    };
  });
}
