import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to normalize strings for matching
function normalizeText(str) {
  if (!str) return '';
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

// Load existing clients
const clienteCsvPath = path.resolve(__dirname, '../data/csv/cliente.csv');
const clienteLines = fs.readFileSync(clienteCsvPath, 'utf8').trim().split('\n');
const clientes = clienteLines.slice(1).map(line => {
  const parts = line.split(',').map(p => p.replace(/^"|"$/g, '').trim());
  return {
    codigo: parts[0],
    nombre: parts[7],
    id: parts[parts.length - 5],
    documento: parts[3]
  };
});

// Load existing emprendamos_cliente seed
import { EMPRENDAMOS_CLIENTES_SEED } from '../src/lib/emprendamosSeedData.js';

export function matchCliente(search) {
  const norm = normalizeText(search);
  // Match by code (e.g. CLI-001)
  let found = clientes.find(c => normalizeText(c.codigo) === norm);
  if (found) return found;

  // Match by exact or partial name
  found = clientes.find(c => {
    const cNorm = normalizeText(c.nombre);
    return cNorm === norm || cNorm.includes(norm) || norm.includes(cNorm);
  });
  if (found) return found;

  // Match by words in name
  const words = norm.split(' ').filter(w => w.length > 2);
  found = clientes.find(c => {
    const cNorm = normalizeText(c.nombre);
    return words.every(w => cNorm.includes(w));
  });
  return found || null;
}

export function parseAndMount34Credits(csvContent) {
  const lines = csvContent.trim().split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return [];

  // Determine separator: comma, semicolon, tab
  const header = lines[0];
  const sep = header.includes(';') ? ';' : (header.includes('\t') ? '\t' : ',');

  const rows = lines.slice(1).map(l => l.split(sep).map(c => c.replace(/^"|"$/g, '').trim()));
  
  const parsedCredits = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 3) continue;

    // We look for: codigo (c01, c13...), cliente, monto/saldo inicial, tasa, dia_pago
    // Let's identify fields intelligently:
    let codigo = '';
    let clienteRaw = '';
    let capital = 0;
    let tasa = 0.03;
    let diaPago = 15;

    for (const val of row) {
      const v = val.trim();
      if (/^c\d+$/i.test(v) || /^em-\d+$/i.test(v)) {
        codigo = v.toUpperCase();
      } else if (/^\$?\s*[\d,.]+(\.\d+)?$/.test(v) && !v.includes('%')) {
        const num = Number(v.replace(/[$.,\s]/g, ''));
        if (num > 1000) {
          capital = num;
        } else if (num >= 1 && num <= 31) {
          diaPago = num;
        }
      } else if (v.includes('%') || (Number(v) > 0 && Number(v) <= 0.5)) {
        const t = Number(v.replace('%', '').trim());
        tasa = t > 1 ? t / 100 : t;
      } else if (v.length > 2 && isNaN(Number(v))) {
        clienteRaw = v;
      }
    }

    // Match client
    const matchedCli = matchCliente(clienteRaw);
    const empCli = matchedCli ? EMPRENDAMOS_CLIENTES_SEED.find(ec => ec.cliente_id === matchedCli.id) : null;

    parsedCredits.push({
      id: `crd_${codigo.toLowerCase()}_${Date.now()}_${i}`,
      codigo: codigo || `C${String(i + 1).padStart(2, '0')}`,
      tipo: 'cartera_inicial',
      capital: Math.round(capital),
      saldo_capital: Math.round(capital),
      estado: 'vigente',
      dia_pago: Number(diaPago) || 15,
      saldo_intereses: 0,
      notas: '',
      fecha: '2026-08-31',
      fecha_proximo_pago: `2026-09-${String(diaPago).padStart(2, '0')}`,
      tasa_nominal: tasa || 0.03,
      concepto: `Saldo inicial cartera a 31 de agosto — ${codigo}`,
      comprobante_id: '',
      cuota_fija: 0,
      cliente_id: matchedCli?.id || '',
      cliente_nombre: matchedCli?.nombre || clienteRaw,
      producto_credito_id: '',
      emprendamos_cliente_id: empCli?.id || `emp_cli_${matchedCli?.id || i}`,
      created_date: '2026-08-31T00:00:00.000Z',
      updated_date: '2026-08-31T00:00:00.000Z',
      is_sample: false
    });
  }

  return parsedCredits;
}

if (process.argv[2]) {
  const filePath = process.argv[2];
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf8');
    const credits = parseAndMount34Credits(content);
    console.log(`Parsed ${credits.length} credits.`);
  }
}
