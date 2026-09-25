export function formatCOP(value) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(Number(value) || 0);
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