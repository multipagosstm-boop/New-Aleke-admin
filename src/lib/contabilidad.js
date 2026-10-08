export function formatCOP(value, allowDecimals = true) {
  const num = Number(value) || 0;
  const hasDecimals = allowDecimals && Math.abs(num % 1) > 0.001;
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: hasDecimals ? 2 : 0
  }).format(num);
}

export function formatNumber(value, decimals = 0) {
  return new Intl.NumberFormat("es-CO", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(Number(value) || 0);
}

export function formatDate(dateStr) {
  if (!dateStr) return "";
  const s = String(dateStr);
  // Extraer YYYY-MM-DD tanto de fecha pura como de ISO con hora/Z, y parsear como local
  // para evitar el desfase de un día al interpretar medianoche UTC en zonas occidentales.
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const dt = new Date(y, mo - 1, d);
    return dt.toLocaleDateString("es-CO", { year: "numeric", month: "2-digit", day: "2-digit" });
  }
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString("es-CO", { year: "numeric", month: "2-digit", day: "2-digit" });
}

// Devuelve la fecha de hoy en YYYY-MM-DD usando componentes locales (no UTC) para evitar desfase.
export function hoyLocal() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

export function formatMonthYear(periodo) {
  if (!periodo) return "";
  const [year, month] = String(periodo).split("-");
  const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const idx = Number(month) - 1;
  if (idx < 0 || idx > 11) return periodo;
  return `${months[idx]} ${year}`;
}

export const BANCOS = [
  { code: "BA", name: "Bancolombia" },
  { code: "BB", name: "BBVA" },
  { code: "BO", name: "Bogotá" },
  { code: "CO", name: "Colpatria" },
  { code: "DA", name: "Davivienda" },
  { code: "IT", name: "Itaú" },
  { code: "NU", name: "Nubank" },
  { code: "OC", name: "Occidente" },
  { code: "PO", name: "Popular" },
  { code: "SE", name: "Serfinanza" },
  { code: "TU", name: "Tuya" },
  { code: "FA", name: "Falabella" }
];

export const BANCO_NAMES = Object.fromEntries(BANCOS.map((b) => [b.code, b.name]));

export function generateCDANombre(numeroCompleto) {
  const last4 = String(numeroCompleto || "").replace(/\D/g, "").slice(-4);
  return `CDA - ${last4}`;
}

export const TIPO_PRODUCTO = {
  TDC: "Tarjeta de Crédito",
  CH: "Crédito Hipotecario",
  LIB: "Libre Destino",
  CR: "Crédito Rotativo (Crediexpress)",
  OTR: "Otro Producto"
};

export function generateProductoNombre(tipo, numRef) {
  const last4 = String(numRef || "").replace(/\D/g, "").slice(-4);
  return `${tipo} - ${last4}`;
}

export const FRANQUICIAS = ["Visa", "Mastercard", "American Express", "Diners Club"];

export const CATEGORIAS_TDC = ["Clásica", "Oro", "Platinum", "Signature", "Black", "Infinite", "Estándar", "Otro"];

export const DIAS_SEMANA = [
  { value: 1, label: "Lunes" },
  { value: 2, label: "Martes" },
  { value: 3, label: "Miércoles" },
  { value: 4, label: "Jueves" },
  { value: 5, label: "Viernes" },
  { value: 6, label: "Sábado" },
  { value: 7, label: "Domingo" }
];

export const ORDENES_SEMANA = [
  { value: 1, label: "Primer" },
  { value: 2, label: "Segundo" },
  { value: 3, label: "Tercer" },
  { value: 4, label: "Cuarto" },
  { value: 5, label: "Quinto" }
];

// Calcula el día del mes (1-31) para el N-ésimo (ordinal) día de la semana del mes/año dados.
// diaSemana: 1=Lunes ... 7=Domingo (ISO-like).
export function computeDiaCortePorSemana(year, monthIndex, ordinal, diaSemana) {
  const primer = new Date(year, monthIndex, 1);
  const primerDow = primer.getDay() === 0 ? 7 : primer.getDay();
  const offset = (diaSemana - primerDow + 7) % 7;
  const day = 1 + offset + (ordinal - 1) * 7;
  const ultimoDelMes = new Date(year, monthIndex + 1, 0).getDate();
  if (day > ultimoDelMes) return null;
  return day;
}

// Texto legible para mostrar el corte de una tarjeta en la UI.
export function getCorteDisplayText(p) {
  if (!p) return "—";
  if (p.corte_modo === "dia_semana" && p.corte_semana && p.corte_dia_semana) {
    const ord = ORDENES_SEMANA.find((o) => o.value === p.corte_semana)?.label.toLowerCase();
    const dia = DIAS_SEMANA.find((d) => d.value === p.corte_dia_semana)?.label.toLowerCase();
    return `${ord} ${dia} del mes`;
  }
  return `Día ${p.fecha_corte}`;
}

// Día de corte efectivo para un mes/año específicos según la configuración de la tarjeta.
export function getDiaCorteEfectivo(p, year, monthIndex) {
  if (!p) return null;
  if (p.corte_modo === "dia_semana" && p.corte_semana && p.corte_dia_semana) {
    return computeDiaCortePorSemana(year, monthIndex, p.corte_semana, p.corte_dia_semana);
  }
  return p.fecha_corte || null;
}

export function claseFromNumero(num) {
  const map = { 1: "activo", 2: "pasivo", 3: "patrimonio", 4: "ingreso", 5: "gasto", 6: "gasto", 7: "gasto", 8: "gasto" };
  return map[num] || "activo";
}

export const NIVEL_INDENT = {
  Clase: 0,
  Grupo: 1,
  Cuenta: 2,
  Subcuenta: 3,
  Auxiliar: 4
};

/**
 * Evalúa el estado de corte y plazo de registro de extracto para una tarjeta / producto de crédito.
 * Detecta si el corte más reciente ya ocurrió (incluso en el mes anterior) y alerta si falta su extracto.
 *
 * @param {Object} producto - Producto de crédito / tarjeta.
 * @param {Array} extractos - Lista de extractos registrados.
 * @param {Date} [fechaRef] - Fecha actual / referencia.
 * @returns {Object|null}
 */
export function evaluarCicloCorteTarjeta(producto, extractos = [], fechaRef = new Date()) {
  if (!producto || producto.estado !== "activo") return null;

  const hoy = new Date(fechaRef);
  hoy.setHours(0, 0, 0, 0);

  const curYear = hoy.getFullYear();
  const curMonth = hoy.getMonth(); // 0 = Ene, 8 = Sep, 9 = Oct

  // 1. Día de corte en el mes actual
  const diaCurrent = getDiaCorteEfectivo(producto, curYear, curMonth);
  if (!diaCurrent) return null;
  const fechaCorteCurrent = new Date(curYear, curMonth, diaCurrent);
  fechaCorteCurrent.setHours(0, 0, 0, 0);

  // 2. Día de corte en el mes anterior
  const prevMonthIndex = curMonth === 0 ? 11 : curMonth - 1;
  const prevYear = curMonth === 0 ? curYear - 1 : curYear;
  const diaPrev = getDiaCorteEfectivo(producto, prevYear, prevMonthIndex);
  const fechaCortePrev = diaPrev ? new Date(prevYear, prevMonthIndex, diaPrev) : null;
  if (fechaCortePrev) fechaCortePrev.setHours(0, 0, 0, 0);

  // 3. Día de corte en el mes siguiente
  const nextMonthIndex = curMonth === 11 ? 0 : curMonth + 1;
  const nextYear = curMonth === 11 ? curYear + 1 : curYear;
  const diaNext = getDiaCorteEfectivo(producto, nextYear, nextMonthIndex);
  const fechaCorteNext = diaNext ? new Date(nextYear, nextMonthIndex, diaNext) : null;
  if (fechaCorteNext) fechaCorteNext.setHours(0, 0, 0, 0);

  const extsProd = (extractos || []).filter((e) => e.producto_id === producto.id);

  // Helper para verificar si un corte ya tiene extracto registrado o saltado
  const tieneExtractoParaCorte = (fechaCorte) => {
    if (!fechaCorte) return false;
    const y = fechaCorte.getFullYear();
    const m = fechaCorte.getMonth() + 1;
    const mesStr = `${y}-${String(m).padStart(2, "0")}`;
    const nextM = m === 12 ? 1 : m + 1;
    const nextY = m === 12 ? y + 1 : y;
    const nextMesStr = `${nextY}-${String(nextM).padStart(2, "0")}`;

    return extsProd.some((e) => {
      if (e.estado === "saltado") {
        if (e.periodo === mesStr || e.periodo === nextMesStr) return true;
      }
      if (e.fecha_corte) {
        const fc = new Date(e.fecha_corte + "T00:00:00");
        const diffDias = Math.abs((fc - fechaCorte) / 86400000);
        if (diffDias <= 5) return true;
        if (e.fecha_corte.startsWith(mesStr)) return true;
      }
      if (e.periodo === mesStr) return true;
      if (e.periodo === nextMesStr && e.fecha_corte && e.fecha_corte.startsWith(mesStr)) return true;
      return false;
    });
  };

  // Determinar qué corte evaluar como ciclo activo:
  // Si hoy aún NO alcanza la fecha de corte del mes actual, el corte que debió ocurrir fue el del mes pasado.
  // Si hoy ya alcanzó o superó la fecha de corte actual, el corte que debió ocurrir es el actual.
  let corteAEvaluar = null;
  let corteSiguiente = null;

  if (hoy >= fechaCorteCurrent) {
    corteAEvaluar = fechaCorteCurrent;
    corteSiguiente = fechaCorteNext;
  } else {
    corteAEvaluar = fechaCortePrev;
    corteSiguiente = fechaCorteCurrent;
  }

  if (!corteAEvaluar) return null;

  const tieneExtracto = tieneExtractoParaCorte(corteAEvaluar);

  if (tieneExtracto) {
    // El corte evaluado ya está cubierto. El ciclo pendiente es el siguiente corte futuro.
    const deadlineSiguiente = new Date(corteSiguiente);
    deadlineSiguiente.setDate(deadlineSiguiente.getDate() + 5);
    const diasFaltan = Math.max(0, Math.ceil((corteSiguiente - hoy) / 86400000));
    const yS = corteSiguiente.getFullYear();
    const mS = corteSiguiente.getMonth() + 1;

    return {
      cutoff: corteSiguiente,
      deadline: deadlineSiguiente,
      estado: "proximo",
      diasDiferencia: diasFaltan,
      tieneExtracto: true,
      mensaje: `Próximo corte: ${String(corteSiguiente.getDate()).padStart(2, "0")}/${String(mS).padStart(2, "0")} (en ${diasFaltan} día${diasFaltan === 1 ? "" : "s"})`,
      corteReal: corteSiguiente,
      corteAEvaluar,
      periodoEsperado: `${yS}-${String(mS).padStart(2, "0")}`
    };
  }

  // Falta registrar extracto para el corte que ya ocurrió
  const deadline = new Date(corteAEvaluar);
  deadline.setDate(deadline.getDate() + 5);

  let estado = "proximo";
  let diasDiferencia = 0;
  let mensaje = "";
  const yC = corteAEvaluar.getFullYear();
  const mC = corteAEvaluar.getMonth() + 1;
  const fechaCorteFmt = `${String(corteAEvaluar.getDate()).padStart(2, "0")}/${String(mC).padStart(2, "0")}/${yC}`;

  if (hoy > deadline) {
    estado = "urgente";
    diasDiferencia = Math.floor((hoy - deadline) / 86400000);
    mensaje = `Cortó el ${fechaCorteFmt} · Plazo vencido hace ${diasDiferencia} día${diasDiferencia === 1 ? "" : "s"}`;
  } else if (hoy >= corteAEvaluar && hoy <= deadline) {
    estado = "en_plazo";
    diasDiferencia = Math.max(0, Math.ceil((deadline - hoy) / 86400000));
    mensaje = `Cortó el ${fechaCorteFmt} · En plazo (${diasDiferencia} día${diasDiferencia === 1 ? "" : "s"} restante${diasDiferencia === 1 ? "" : "s"})`;
  } else {
    estado = "proximo";
    diasDiferencia = Math.ceil((corteAEvaluar - hoy) / 86400000);
    mensaje = `Próximo corte: ${fechaCorteFmt} (en ${diasDiferencia} día${diasDiferencia === 1 ? "" : "s"})`;
  }

  // Período esperado: típicamente el mes de facturación/pago
  const nextMC = mC === 12 ? 1 : mC + 1;
  const nextYC = mC === 12 ? yC + 1 : yC;
  const periodoSiguienteStr = `${nextYC}-${String(nextMC).padStart(2, "0")}`;

  return {
    cutoff: corteAEvaluar,
    deadline,
    estado,
    diasDiferencia,
    tieneExtracto: false,
    mensaje,
    corteReal: corteAEvaluar,
    corteAEvaluar,
    periodoEsperado: periodoSiguienteStr,
    periodoCorte: `${yC}-${String(mC).padStart(2, "0")}`
  };
}