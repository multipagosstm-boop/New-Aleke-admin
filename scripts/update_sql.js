import fs from 'fs';
import {
  EMPRENDAMOS_CLIENTES_SEED,
  EMPRENDAMOS_CREDITOS_SEED,
  EMPRENDAMOS_ABONOS_SEED
} from '../src/lib/emprendamosSeedData.js';

function formatVal(v) {
  if (v === null || v === undefined || v === '') return 'NULL';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'object') return `'` + JSON.stringify(v).replace(/'/g, "''") + `'::jsonb`;
  return `'` + String(v).replace(/'/g, "''") + `'`;
}

let sql = `

-- ====================================================================
-- CARGA INICIAL DE DATOS (12 Clientes, 13 Créditos y Abonos iniciales)
-- ====================================================================

`;

// Clientes
sql += `-- Inserción de 12 Clientes Emprendamos\n`;
sql += `INSERT INTO public."emprendamos_cliente" ("id", "cliente_id", "estado", "dia_pago", "cda_apoderada_id", "contrato_url", "notas", "cupo_asignado", "capital_inicial", "saldo_deuda", "fecha_ingreso", "fecha_eligible_salida", "tasa_acordada", "tasa_extracupo", "plan_trazado", "comprobante_cartera_id", "extracupo_autorizado", "created_date", "updated_date")\nVALUES\n`;
const cliValues = EMPRENDAMOS_CLIENTES_SEED.map(c => {
  return `  (${formatVal(c.id)}, ${formatVal(c.cliente_id)}, ${formatVal(c.estado)}, ${formatVal(c.dia_pago)}, ${formatVal(c.cda_apoderada_id)}, ${formatVal(c.contrato_url)}, ${formatVal(c.notas)}, ${formatVal(c.cupo_asignado)}, ${formatVal(c.capital_inicial)}, ${formatVal(c.saldo_deuda)}, ${formatVal(c.fecha_ingreso)}, ${formatVal(c.fecha_eligible_salida)}, ${formatVal(c.tasa_acordada)}, ${formatVal(c.tasa_extracupo)}, ${formatVal(c.plan_trazado)}, ${formatVal(c.comprobante_cartera_id)}, ${formatVal(c.extracupo_autorizado)}, ${formatVal(c.created_date)}, ${formatVal(c.updated_date)})`;
});
sql += cliValues.join(',\n') + `\nON CONFLICT (id) DO UPDATE SET saldo_deuda = EXCLUDED.saldo_deuda, updated_date = EXCLUDED.updated_date;\n\n`;

// Créditos
const crdValues = EMPRENDAMOS_CREDITOS_SEED.map(c => {
  return `  (${formatVal(c.id)}, ${formatVal(c.codigo)}, ${formatVal(c.tipo)}, ${formatVal(c.capital)}, ${formatVal(c.estado)}, ${formatVal(c.dia_pago)}, ${formatVal(c.saldo_intereses)}, ${formatVal(c.notas)}, ${formatVal(c.fecha_proximo_pago)}, ${formatVal(c.saldo_capital)}, ${formatVal(c.fecha)}, ${formatVal(c.tasa_nominal)}, ${formatVal(c.concepto)}, ${formatVal(c.comprobante_id)}, ${formatVal(c.cuota_fija)}, ${formatVal(c.cliente_id)}, ${formatVal(c.producto_credito_id)}, ${formatVal(c.emprendamos_cliente_id)}, ${formatVal(c.created_date)}, ${formatVal(c.updated_date)})`;
});
if (crdValues.length > 0) {
  sql += `-- Inserción de ${crdValues.length} Créditos Emprendamos\n`;
  sql += `INSERT INTO public."emprendamos_credito" ("id", "codigo", "tipo", "capital", "estado", "dia_pago", "saldo_intereses", "notas", "fecha_proximo_pago", "saldo_capital", "fecha", "tasa_nominal", "concepto", "comprobante_id", "cuota_fija", "cliente_id", "producto_credito_id", "emprendamos_cliente_id", "created_date", "updated_date")\nVALUES\n`;
  sql += crdValues.join(',\n') + `\nON CONFLICT (id) DO UPDATE SET saldo_capital = EXCLUDED.saldo_capital, updated_date = EXCLUDED.updated_date;\n\n`;
} else {
  sql += `-- No hay créditos iniciales cargados\n\n`;
}

// Abonos
sql += `-- Inserción de Abonos Septiembre 2026\n`;
sql += `INSERT INTO public."emprendamos_abono" ("id", "valor_total", "fecha", "tipo", "cda_id", "notas", "subcuenta_ingreso", "detalles", "comprobante_id", "cliente_id", "producto_credito_id", "emprendamos_cliente_id", "created_date", "updated_date")\nVALUES\n`;
const abonoValues = EMPRENDAMOS_ABONOS_SEED.map(a => {
  return `  (${formatVal(a.id)}, ${formatVal(a.valor_total)}, ${formatVal(a.fecha)}, ${formatVal(a.tipo)}, ${formatVal(a.cda_id)}, ${formatVal(a.notas)}, ${formatVal(a.subcuenta_ingreso)}, ${formatVal(a.detalles)}, ${formatVal(a.comprobante_id)}, ${formatVal(a.cliente_id)}, ${formatVal(a.producto_credito_id)}, ${formatVal(a.emprendamos_cliente_id)}, ${formatVal(a.created_date)}, ${formatVal(a.updated_date)})`;
});
sql += abonoValues.join(',\n') + `\nON CONFLICT (id) DO UPDATE SET updated_date = EXCLUDED.updated_date;\n`;

const baseSchema = fs.readFileSync('public/supabase/crear_tablas_emprendamos.sql', 'utf8');
const ddlPart = baseSchema.split('-- ====================================================================\n-- CARGA INICIAL DE DATOS')[0];
fs.writeFileSync('public/supabase/crear_tablas_emprendamos.sql', ddlPart.trim() + '\n' + sql, 'utf8');
fs.writeFileSync('supabase/crear_tablas_emprendamos.sql', ddlPart.trim() + '\n' + sql, 'utf8');
console.log('SQL scripts updated successfully with full DDL and DML seeds.');
