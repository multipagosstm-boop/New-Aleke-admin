import { createClient } from '@supabase/supabase-js';
import {
  EMPRENDAMOS_CLIENTES_SEED,
  EMPRENDAMOS_CREDITOS_SEED,
  EMPRENDAMOS_ABONOS_SEED,
  EMPRENDAMOS_INTERESES_SEED
} from '@/lib/emprendamosSeedData';

// Configuration keys in localStorage
const STORAGE_URL_KEY = 'aleke_supabase_url';
const STORAGE_KEY_KEY = 'aleke_supabase_anon_key';

export function normalizeSupabaseUrl(rawUrl) {
  if (!rawUrl) return '';
  let url = String(rawUrl).trim().replace(/^['"]+|['"]+$/g, '');

  // If user pasted dashboard URL: https://supabase.com/dashboard/project/<ref>/...
  const dashboardMatch = url.match(/supabase\.com\/dashboard\/project\/([a-zA-Z0-9_-]+)/i);
  if (dashboardMatch && dashboardMatch[1]) {
    return `https://${dashboardMatch[1]}.supabase.co`;
  }

  // If user entered only the project reference (e.g. 20 alphanumeric chars)
  if (/^[a-z0-9]{20}$/i.test(url)) {
    return `https://${url}.supabase.co`;
  }

  // If no protocol was provided, add https://
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }

  try {
    const parsed = new URL(url);
    // Origin only - strips /rest/v1, /rest, trailing slash, subpaths
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return url.replace(/\/rest\/v1\/?$/i, '').replace(/\/rest\/?$/i, '').replace(/\/+$/, '');
  }
}

export function normalizeSupabaseKey(rawKey) {
  if (!rawKey) return '';
  return String(rawKey).trim().replace(/^['"]+|['"]+$/g, '');
}

const DEFAULT_SUPABASE_URL = 'https://tktxnvuuanlgsreiuwsm.supabase.co';
const DEFAULT_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRrdHhudnV1YW5sZ3NyZWl1d3NtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAyNzU2NTEsImV4cCI6MjEwNTg1MTY1MX0.KPv4eH9ViHQ7MCR2dSSgyOH1hM4Ka16Fjm9j3-NpvPU';

export function getSupabaseCredentials() {
  const envUrl = (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_SUPABASE_URL) || (typeof process !== 'undefined' && process?.env?.VITE_SUPABASE_URL) || '';
  const envKey = (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_SUPABASE_ANON_KEY) || (typeof process !== 'undefined' && process?.env?.VITE_SUPABASE_ANON_KEY) || '';
  const localUrl = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_URL_KEY) || '' : '';
  const localKey = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY_KEY) || '' : '';

  const rawUrl = localUrl || envUrl || DEFAULT_SUPABASE_URL;
  const rawKey = localKey || envKey || DEFAULT_SUPABASE_KEY;

  return {
    url: normalizeSupabaseUrl(rawUrl),
    anonKey: normalizeSupabaseKey(rawKey)
  };
}

export function saveSupabaseCredentials(url, anonKey) {
  if (typeof window !== 'undefined') {
    const cleanUrl = normalizeSupabaseUrl(url);
    const cleanKey = normalizeSupabaseKey(anonKey);
    if (cleanUrl) localStorage.setItem(STORAGE_URL_KEY, cleanUrl);
    else localStorage.removeItem(STORAGE_URL_KEY);
    if (cleanKey) localStorage.setItem(STORAGE_KEY_KEY, cleanKey);
    else localStorage.removeItem(STORAGE_KEY_KEY);
    cachedClient = null;
    currentConfigKey = '';
    window.dispatchEvent(new CustomEvent('supabase-credentials-updated'));
  }
}

// Entity name to table name mapping
export function entityToTable(entityName) {
  if (!entityName) return '';
  if (entityName === 'User') return 'app_user';
  return entityName
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase();
}

let cachedClient = null;
let currentConfigKey = '';

export function getSupabase() {
  const { url, anonKey } = getSupabaseCredentials();
  const configKey = `${url}:${anonKey}`;
  
  if (cachedClient && currentConfigKey === configKey) {
    return cachedClient;
  }

  if (!url || !anonKey) {
    return null;
  }

  try {
    cachedClient = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true
      }
    });
    currentConfigKey = configKey;
    return cachedClient;
  } catch (err) {
    console.error('Failed to create Supabase client:', err);
    return null;
  }
}

// In-memory fallback cache when Supabase is not yet configured or for offline prototyping
const memoryStore = new Map();

const LOCAL_STORAGE_TABLE_SEEDS = {
  emprendamos_cliente: EMPRENDAMOS_CLIENTES_SEED,
  emprendamos_credito: EMPRENDAMOS_CREDITOS_SEED,
  emprendamos_abono: EMPRENDAMOS_ABONOS_SEED,
  emprendamos_interes: EMPRENDAMOS_INTERESES_SEED
};

// LOCAL_MANAGED_TABLES is disabled so all queries and mutations go directly to Supabase
export const LOCAL_MANAGED_TABLES = new Set([]);

const initializedLocalTables = new Set();

function initLocalTable(table) {
  if (initializedLocalTables.has(table)) return;
  initializedLocalTables.add(table);

  if (!memoryStore.has(table)) {
    memoryStore.set(table, new Map());
  }
  const coll = memoryStore.get(table);

  const seed = LOCAL_STORAGE_TABLE_SEEDS[table] || [];
  let stored = null;
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(`aleke_local_${table}`);
      if (raw) stored = JSON.parse(raw);
    } catch {}
  }

  // Load seed records first so all clients, credits, and initial records are available
  seed.forEach((item) => {
    if (item && item.id) coll.set(String(item.id), { ...item });
  });

  // Layer stored records from localStorage on top so user modifications are preserved
  if (Array.isArray(stored)) {
    stored.forEach((item) => {
      if (item && item.id) coll.set(String(item.id), { ...item });
    });
  }
}

function saveLocalTable(table) {
  if (typeof window !== 'undefined' && LOCAL_MANAGED_TABLES.has(table)) {
    try {
      const coll = getMemoryCollection(table);
      const arr = Array.from(coll.values());
      localStorage.setItem(`aleke_local_${table}`, JSON.stringify(arr));
    } catch {}
  }
}

function getMemoryCollection(table) {
  if (LOCAL_MANAGED_TABLES.has(table)) {
    initLocalTable(table);
  }
  if (!memoryStore.has(table)) {
    memoryStore.set(table, new Map());
  }
  return memoryStore.get(table);
}

// Direct supabase client export with graceful query proxy fallback
export const supabase = new Proxy({}, {
  get(target, prop) {
    const client = getSupabase();
    if (prop === 'from') {
      return (table) => {
        if (LOCAL_MANAGED_TABLES.has(table)) {
          return {
            select: () => ({
              order: () => ({
                limit: () => Promise.resolve({ data: Array.from(getMemoryCollection(table).values()), error: null }),
                range: () => Promise.resolve({ data: Array.from(getMemoryCollection(table).values()), error: null }),
                then: (res) => Promise.resolve(res({ data: Array.from(getMemoryCollection(table).values()), error: null }))
              }),
              limit: () => Promise.resolve({ data: Array.from(getMemoryCollection(table).values()), error: null }),
              eq: (f, v) => ({
                single: () => Promise.resolve({ data: Array.from(getMemoryCollection(table).values()).find(x => String(x[f]) === String(v)) || null, error: null }),
                maybeSingle: () => Promise.resolve({ data: Array.from(getMemoryCollection(table).values()).find(x => String(x[f]) === String(v)) || null, error: null }),
                then: (res) => Promise.resolve(res({ data: Array.from(getMemoryCollection(table).values()).filter(x => String(x[f]) === String(v)), error: null }))
              }),
              then: (res) => Promise.resolve(res({ data: Array.from(getMemoryCollection(table).values()), error: null }))
            }),
            insert: (itms) => ({
              select: () => ({
                single: () => Promise.resolve({ data: Array.isArray(itms) ? itms[0] : itms, error: null })
              }),
              then: (res) => Promise.resolve(res({ data: Array.isArray(itms) ? itms : [itms], error: null }))
            }),
            update: () => ({
              eq: () => ({
                select: () => ({
                  single: () => Promise.resolve({ data: {}, error: null })
                }),
                then: (res) => Promise.resolve(res({ data: [], error: null }))
              })
            }),
            delete: () => ({
              eq: () => Promise.resolve({ error: null }),
              then: (res) => Promise.resolve(res({ error: null }))
            })
          };
        }
        if (client && typeof client.from === 'function') {
          return client.from(table);
        }
        return {
          select: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }), limit: () => Promise.resolve({ data: [], error: null }) }),
          insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: {}, error: null }) }) }),
          update: () => ({ eq: () => ({ select: () => ({ single: () => Promise.resolve({ data: {}, error: null }) }) }) }),
          delete: () => ({ eq: () => Promise.resolve({ error: null }) })
        };
      };
    }
    if (client && prop in client) {
      const val = client[prop];
      return typeof val === 'function' ? val.bind(client) : val;
    }
    return () => ({
      select: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }), limit: () => Promise.resolve({ data: [], error: null }) }),
      insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: {}, error: null }) }) }),
      update: () => ({ eq: () => ({ select: () => ({ single: () => Promise.resolve({ data: {}, error: null }) }) }) }),
      delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
      eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }),
      in: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) })
    });
  }
});

function deduplicateById(items) {
  if (!Array.isArray(items)) return [];
  const map = new Map();
  for (const item of items) {
    if (!item) continue;
    const id = item.id;
    if (id !== undefined && id !== null) {
      const idStr = String(id);
      if (map.has(idStr)) {
        map.set(idStr, { ...map.get(idStr), ...item });
      } else {
        map.set(idStr, { ...item });
      }
    } else {
      map.set(Symbol(), item);
    }
  }
  return Array.from(map.values());
}

// RLS Error Handler and Detector
export function handleRlsViolation(tableName, operation, error) {
  if (!error) return false;
  const isRls = error.code === '42501' || 
                error.message?.toLowerCase().includes('row-level security') || 
                error.message?.toLowerCase().includes('violates');
  if (isRls) {
    console.warn(`[Supabase RLS Alert] Operación "${operation}" en tabla "${tableName}" afectada por RLS: ${error.message}`);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('supabase-rls-violation', {
        detail: {
          table: tableName,
          operation,
          message: error.message
        }
      }));
    }
    return true;
  }
  return false;
}

// Known non-column dispatch keys that should never be sent to SQL insert/update
const NON_COLUMN_DISPATCH_KEYS = new Set([
  'action',
  'accion',
  '_action',
  'cda_pago_id',
  'fecha_deposito',
  'devolver_deposito',
  'cda_devolucion_id',
  'fecha_terminacion',
  'motivo',
  'pago_arriendo_id',
  'cuenta_ingreso',
  'nueva_fecha_inicio',
  'nuevo_valor_arriendo',
  'nuevo_canon',
  'nueva_fecha_fin'
]);

// Known column sets for core entities to ensure clean inserts/updates
const KNOWN_TABLE_COLUMNS = {
  contrato_arriendo: new Set([
    'id', 'created_date', 'updated_date', 'created_by_id', 'is_sample',
    'codigo', 'inmueble_id', 'inquilino_id', 'tipo_contrato',
    'fecha_inicio', 'fecha_fin', 'duracion_meses', 'valor_arriendo',
    'valor_deposito', 'estado', 'deposito_pagado', 'comprobante_deposito_id',
    'documento_pdf_url', 'email_enviado', 'alertas_enviadas', 'notas'
  ]),
  pago_arriendo: new Set([
    'id', 'created_date', 'updated_date', 'created_by_id', 'is_sample',
    'inmueble_id', 'contrato_id', 'inquilino_id', 'periodo',
    'fecha_vencimiento', 'fecha_pago_real', 'valor_esperado',
    'valor_pagado', 'saldo_restante', 'dias_mora', 'estado',
    'comprobante_id', 'notas'
  ]),
  inmueble: new Set([
    'id', 'created_date', 'updated_date', 'created_by_id', 'is_sample',
    'nombre', 'descripcion', 'direccion', 'valor_arriendo', 'valor_deposito',
    'estado', 'inquilino_id', 'tipo_propiedad', 'tipo_contrato', 'notas'
  ]),
  inquilino: new Set([
    'id', 'created_date', 'updated_date', 'created_by_id', 'is_sample',
    'nombre_completo', 'tipo_documento', 'numero_documento',
    'lugar_expedicion', 'email', 'telefono', 'estado', 'notas'
  ]),
  audit_log: new Set([
    'id', 'created_date', 'updated_date', 'created_by_id', 'is_sample',
    'table_name', 'record_id', 'action', 'action_type',
    'user_id', 'user_email', 'payload', 'metadata'
  ]),
  cuota_amortizacion: new Set([
    'id', 'created_date', 'updated_date', 'created_by_id', 'is_sample',
    'prestamo_id', 'numero', 'fecha_vencimiento', 'cuota', 'interes',
    'capital_abono', 'saldo_capital', 'estado', 'valor_pagado',
    'fecha_pago', 'abono_id'
  ]),
  emprendamos_cliente: new Set([
    'id', 'created_date', 'updated_date', 'created_at', 'updated_at',
    'nombre', 'documento', 'telefono', 'email', 'direccion',
    'cupo_total', 'cupo_disponible', 'estado'
  ]),
  emprendamos_credito: new Set([
    'id', 'created_date', 'updated_date', 'created_at', 'updated_at',
    'cliente_id', 'codigo', 'monto_inicial', 'saldo_actual',
    'tasa_interes', 'fecha_inicio', 'dia_pago', 'estado',
    'observaciones', 'tipo', 'comprobante_id'
  ]),
  emprendamos_abono: new Set([
    'id', 'created_date', 'updated_date', 'created_at', 'updated_at',
    'credito_id', 'cliente_id', 'cuenta_id', 'monto',
    'fecha', 'tipo_abono', 'comprobante_id', 'observaciones'
  ]),
  emprendamos_interes: new Set([
    'id', 'created_date', 'updated_date', 'created_at', 'updated_at',
    'credito_id', 'periodo', 'estado'
  ])
};

function sanitizePayloadForTable(table, rawPayload) {
  if (!rawPayload || typeof rawPayload !== 'object') return rawPayload;
  const sanitized = { ...rawPayload };

  for (const k of Object.keys(sanitized)) {
    if (NON_COLUMN_DISPATCH_KEYS.has(k)) {
      delete sanitized[k];
    }
  }

  const knownCols = KNOWN_TABLE_COLUMNS[table];
  if (knownCols) {
    for (const k of Object.keys(sanitized)) {
      if (!knownCols.has(k)) {
        delete sanitized[k];
      }
    }
  }

  return sanitized;
}

// Global Audit Log Recorder
export async function recordAuditLog({
  table,
  record_id,
  action,
  action_type = null,
  payload = null,
  metadata = null
}) {
  if (!table || table === 'audit_log') return;

  try {
    const id = `audit_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const now = new Date().toISOString();

    let userEmail = 'sistema@pakredito.com';
    let userId = 'system';
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('app_user_session');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed?.email) userEmail = parsed.email;
          if (parsed?.id) userId = parsed.id;
        }
      } catch {}
    }

    const logEntry = {
      id,
      created_date: now,
      updated_date: now,
      is_sample: false,
      table_name: table,
      record_id: record_id ? String(record_id) : null,
      action: String(action || 'operation'),
      action_type: action_type ? String(action_type) : String(action || 'operation'),
      user_id: userId,
      user_email: userEmail,
      payload: payload ? (typeof payload === 'object' ? payload : { value: payload }) : null,
      metadata: metadata ? (typeof metadata === 'object' ? metadata : { info: metadata }) : {}
    };

    // Keep in memory collection
    getMemoryCollection('audit_log').set(id, logEntry);

    // Persist in Supabase
    const client = getSupabase();
    if (client) {
      client.from('audit_log').insert([logEntry]).then(({ error }) => {
        if (error && !error.message?.includes('schema cache')) {
          console.warn('[AuditLog] Supabase write notice:', error.message);
        }
      }).catch(() => {});
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('app-audit-log', { detail: logEntry }));
    }
  } catch (err) {
    console.warn('[AuditLog] Failed to record:', err);
  }
}

export function mapEntityRecord(table, d) {
  if (!d || typeof d !== 'object') return d;
  const mapped = {
    ...d,
    created_date: d.created_date || d.created_at,
    updated_date: d.updated_date || d.updated_at
  };

  if (table === 'emprendamos_cliente') {
    let meta = null;
    if (d.direccion && typeof d.direccion === 'string' && d.direccion.startsWith('meta:')) {
      try {
        meta = JSON.parse(d.direccion.slice(5));
      } catch {}
    }

    mapped.cliente_id = (meta && meta.cliente_id) || mapped.cliente_id || '';
    mapped.nombre = (mapped.nombre && mapped.nombre !== 'Cliente Emprendamos' && mapped.nombre !== 'Cliente') 
      ? mapped.nombre 
      : ((meta && meta.nombre) || mapped.nombre || '');
    mapped.documento = mapped.documento || (meta && meta.documento) || '';
    mapped.telefono = mapped.telefono || (meta && meta.telefono) || '';
    mapped.cupo_asignado = mapped.cupo_asignado !== undefined ? Number(mapped.cupo_asignado) : (meta && meta.cupo_asignado !== undefined ? Number(meta.cupo_asignado) : (mapped.cupo_total !== undefined ? Number(mapped.cupo_total) : 0));
    mapped.saldo_deuda = mapped.saldo_deuda !== undefined ? Number(mapped.saldo_deuda) : (meta && meta.saldo_deuda !== undefined ? Number(meta.saldo_deuda) : (mapped.cupo_disponible !== undefined ? Number(mapped.cupo_disponible) : 0));
    mapped.capital_inicial = mapped.capital_inicial !== undefined ? Number(mapped.capital_inicial) : (meta && meta.capital_inicial !== undefined ? Number(meta.capital_inicial) : (mapped.cupo_total !== undefined ? Number(mapped.cupo_total) : 0));
    mapped.dia_pago = mapped.dia_pago !== undefined ? Number(mapped.dia_pago) : (meta && meta.dia_pago !== undefined ? Number(meta.dia_pago) : 15);
    mapped.tasa_acordada = mapped.tasa_acordada !== undefined ? Number(mapped.tasa_acordada) : (meta && meta.tasa_acordada !== undefined ? Number(meta.tasa_acordada) : 0.03);
    mapped.tasa_extracupo = mapped.tasa_extracupo !== undefined ? Number(mapped.tasa_extracupo) : (meta && meta.tasa_extracupo !== undefined ? Number(meta.tasa_extracupo) : 0.06);
    mapped.fecha_ingreso = mapped.fecha_ingreso || (meta && meta.fecha_ingreso) || '';
    mapped.fecha_eligible_salida = mapped.fecha_eligible_salida || (meta && meta.fecha_eligible_salida) || '';
    mapped.plan_trazado = mapped.plan_trazado || (meta && meta.plan_trazado) || '';
    mapped.contrato_url = mapped.contrato_url || (meta && meta.contrato_url) || '';
    mapped.cda_apoderada_id = mapped.cda_apoderada_id || (meta && meta.cda_apoderada_id) || '';
    mapped.comprobante_cartera_id = mapped.comprobante_cartera_id || (meta && meta.comprobante_cartera_id) || '';
    mapped.extracupo_autorizado = mapped.extracupo_autorizado !== undefined ? mapped.extracupo_autorizado : (meta && meta.extracupo_autorizado !== undefined ? meta.extracupo_autorizado : 0);
    mapped.notas = mapped.notas || (meta && meta.notas) || mapped.observaciones || '';
    mapped.estado = mapped.estado || 'activo';
  } else if (table === 'emprendamos_credito') {
    mapped.capital = mapped.capital !== undefined ? Number(mapped.capital) : (mapped.monto_inicial !== undefined ? Number(mapped.monto_inicial) : 0);
    mapped.saldo_capital = mapped.saldo_capital !== undefined ? Number(mapped.saldo_capital) : (mapped.saldo_actual !== undefined ? Number(mapped.saldo_actual) : (mapped.capital || 0));
    mapped.tasa_nominal = mapped.tasa_nominal !== undefined ? Number(mapped.tasa_nominal) : (mapped.tasa_interes !== undefined ? Number(mapped.tasa_interes) : 0.03);
    mapped.fecha = mapped.fecha || mapped.fecha_inicio || '';
    mapped.concepto = mapped.concepto || mapped.observaciones || 'Crédito Emprendamos';
    mapped.notas = mapped.notas || mapped.observaciones || '';
    mapped.tipo = mapped.tipo || 'habitual';
    mapped.dia_pago = mapped.dia_pago !== undefined ? Number(mapped.dia_pago) : 15;
    mapped.saldo_intereses = mapped.saldo_intereses !== undefined ? Number(mapped.saldo_intereses) : 0;
    mapped.cuota_fija = mapped.cuota_fija !== undefined ? Number(mapped.cuota_fija) : 0;
    mapped.fecha_proximo_pago = mapped.fecha_proximo_pago || '';
    mapped.estado = mapped.estado || 'vigente';
    // Link to enrolled client ID (which is cliente_id in Supabase)
    mapped.emprendamos_cliente_id = mapped.emprendamos_cliente_id || mapped.cliente_id || '';
    mapped.cliente_id = mapped.cliente_id || mapped.emprendamos_cliente_id || '';
    mapped.clienteNombre = mapped.clienteNombre || mapped.cliente_nombre || '';
  } else if (table === 'emprendamos_abono') {
    mapped.valor_total = mapped.valor_total !== undefined ? Number(mapped.valor_total) : (mapped.monto !== undefined ? Number(mapped.monto) : 0);
    mapped.monto = mapped.monto !== undefined ? Number(mapped.monto) : (mapped.valor_total || 0);
    mapped.emprendamos_cliente_id = mapped.emprendamos_cliente_id || mapped.cliente_id || '';
    mapped.emprendamos_credito_id = mapped.emprendamos_credito_id || mapped.credito_id || '';
    mapped.cda_id = mapped.cda_id || mapped.cuenta_id || '';
    mapped.tipo = mapped.tipo || mapped.tipo_abono || 'capital';
    mapped.notas = mapped.notas || mapped.observaciones || '';
    mapped.detalles = mapped.detalles || [];
  }

  return mapped;
}

export function prepareEmprendamosPayload(table, payload) {
  if (!payload || typeof payload !== 'object') return payload;
  const p = { ...payload };

  if (table === 'emprendamos_cliente') {
    if (!p.documento && (p.cedula || p.numero_documento)) {
      p.documento = String(p.cedula || p.numero_documento);
    }
    if (!p.nombre || p.nombre === 'Cliente' || p.nombre === 'Cliente Emprendamos') {
      p.nombre = p.cliente_nombre || p.nombre_completo || p.tercero || (p.documento ? `Cliente Doc ${p.documento}` : (p.cliente_id ? `Cliente ${String(p.cliente_id).slice(-6)}` : (p.nombre || 'Cliente Emprendamos')));
    }
    if (p.cupo_total === undefined && p.cupo_asignado !== undefined) {
      p.cupo_total = Number(p.cupo_asignado);
    } else if (p.cupo_total === undefined && p.capital_inicial !== undefined) {
      p.cupo_total = Number(p.capital_inicial);
    }
    if (p.cupo_disponible === undefined && p.saldo_deuda !== undefined) {
      p.cupo_disponible = Number(p.saldo_deuda);
    } else if (p.cupo_disponible === undefined && p.cupo_total !== undefined) {
      p.cupo_disponible = Number(p.cupo_total);
    }

    // Preserve non-column metadata in direccion field
    const meta = {
      cliente_id: p.cliente_id || '',
      nombre: p.nombre || '',
      documento: p.documento || '',
      telefono: p.telefono || '',
      dia_pago: p.dia_pago !== undefined ? Number(p.dia_pago) : 15,
      tasa_acordada: p.tasa_acordada !== undefined ? Number(p.tasa_acordada) : 0.03,
      tasa_extracupo: p.tasa_extracupo !== undefined ? Number(p.tasa_extracupo) : 0.06,
      capital_inicial: p.capital_inicial !== undefined ? Number(p.capital_inicial) : Number(p.cupo_total || 0),
      saldo_deuda: p.saldo_deuda !== undefined ? Number(p.saldo_deuda) : Number(p.cupo_disponible || 0),
      cupo_asignado: p.cupo_asignado !== undefined ? Number(p.cupo_asignado) : Number(p.cupo_total || 0),
      fecha_ingreso: p.fecha_ingreso || '',
      fecha_eligible_salida: p.fecha_eligible_salida || '',
      plan_trazado: p.plan_trazado || '',
      contrato_url: p.contrato_url || '',
      cda_apoderada_id: p.cda_apoderada_id || '',
      comprobante_cartera_id: p.comprobante_cartera_id || '',
      extracupo_autorizado: p.extracupo_autorizado || 0,
      notas: p.notas || p.observaciones || ''
    };
    p.direccion = `meta:${JSON.stringify(meta)}`;
    p.estado = p.estado || 'activo';
  } else if (table === 'emprendamos_credito') {
    if (!p.codigo) {
      p.codigo = `EMP-${Date.now().toString().slice(-6)}`;
    }
    if (p.monto_inicial === undefined && p.capital !== undefined) {
      p.monto_inicial = Number(p.capital);
    }
    if (p.saldo_actual === undefined && p.saldo_capital !== undefined) {
      p.saldo_actual = Number(p.saldo_capital);
    }
    if (p.tasa_interes === undefined && p.tasa_nominal !== undefined) {
      p.tasa_interes = Number(p.tasa_nominal);
    }
    if (!p.fecha_inicio && p.fecha) {
      p.fecha_inicio = p.fecha;
    }
    // In Supabase, cliente_id references emprendamos_cliente.id
    if (p.emprendamos_cliente_id) {
      p.cliente_id = p.emprendamos_cliente_id;
    }
    if (!p.observaciones && (p.notas || p.concepto)) {
      p.observaciones = p.notas || p.concepto;
    }
    if (p.dia_pago !== undefined) {
      p.dia_pago = Number(p.dia_pago);
    }
    p.estado = p.estado || 'vigente';
    p.tipo = p.tipo || 'habitual';
  } else if (table === 'emprendamos_abono') {
    if (p.monto === undefined && p.valor_total !== undefined) {
      p.monto = Number(p.valor_total);
    }
    if (p.valor_total === undefined && p.monto !== undefined) {
      p.valor_total = Number(p.monto);
    }
    if (p.emprendamos_cliente_id) {
      p.cliente_id = p.emprendamos_cliente_id;
    }
    if (p.emprendamos_credito_id) {
      p.credito_id = p.emprendamos_credito_id;
    }
    if (!p.cuenta_id && p.cda_id) {
      p.cuenta_id = p.cda_id;
    }
    if (!p.tipo_abono && p.tipo) {
      p.tipo_abono = p.tipo;
    }
    if (!p.observaciones && p.notas) {
      p.observaciones = p.notas;
    }
  }

  return p;
}

// Generic entity repository builder
export function createEntityRepository(entityName) {
  const table = entityToTable(entityName);

  if (LOCAL_MANAGED_TABLES.has(table)) {
    const sortItems = (items, sort) => {
      if (!sort) return items;
      const isDesc = sort.startsWith('-');
      const col = isDesc ? sort.slice(1) : sort;
      return [...items].sort((a, b) => {
        const valA = a[col] ?? '';
        const valB = b[col] ?? '';
        if (valA < valB) return isDesc ? 1 : -1;
        if (valA > valB) return isDesc ? -1 : 1;
        return 0;
      });
    };

    const filterItems = (items, criteria = {}) => {
      return items.filter(item => {
        return Object.entries(criteria || {}).every(([k, v]) => {
          if (v === undefined || v === null) return true;
          if (typeof v === 'object' && !Array.isArray(v)) {
            if (v.$in && Array.isArray(v.$in)) return v.$in.map(String).includes(String(item[k]));
            if (v.$gte !== undefined) return item[k] >= v.$gte;
            if (v.$lte !== undefined) return item[k] <= v.$lte;
            if (v.$gt !== undefined) return item[k] > v.$gt;
            if (v.$lt !== undefined) return item[k] < v.$lt;
            if (v.$neq !== undefined) return String(item[k]) !== String(v.$neq);
          }
          return String(item[k]) === String(v);
        });
      });
    };

    return {
      async list(sort = null, limit = 50000) {
        const all = Array.from(getMemoryCollection(table).values());
        const sorted = sortItems(all, sort);
        return sorted.slice(0, limit ? Number(limit) : 50000);
      },
      async filter(criteria = {}, sort = null, limit = 50000) {
        const all = Array.from(getMemoryCollection(table).values());
        const filtered = filterItems(all, criteria);
        const sorted = sortItems(filtered, sort);
        return sorted.slice(0, limit ? Number(limit) : 50000);
      },
      async get(id) {
        if (!id) return null;
        return getMemoryCollection(table).get(String(id)) || null;
      },
      async create(item) {
        const id = item.id || `gen_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const now = new Date().toISOString();
        const fullItem = {
          ...item,
          id: String(id),
          created_date: item.created_date || now,
          updated_date: now,
          is_sample: item.is_sample ?? false
        };
        getMemoryCollection(table).set(String(id), fullItem);
        saveLocalTable(table);
        recordAuditLog({
          table,
          record_id: id,
          action: item?.accion || item?.action || 'create',
          action_type: 'create',
          payload: fullItem
        });
        return fullItem;
      },
      async update(id, rawPayload) {
        const existing = getMemoryCollection(table).get(String(id)) || { id: String(id) };
        const now = new Date().toISOString();
        const updated = {
          ...existing,
          ...rawPayload,
          id: String(id),
          updated_date: now
        };
        getMemoryCollection(table).set(String(id), updated);
        saveLocalTable(table);
        recordAuditLog({
          table,
          record_id: id,
          action: rawPayload?.accion || rawPayload?.action || 'update',
          action_type: 'update',
          payload: updated
        });
        return updated;
      },
      async delete(id) {
        getMemoryCollection(table).delete(String(id));
        saveLocalTable(table);
        recordAuditLog({ table, record_id: id, action: 'delete', action_type: 'delete', payload: null });
        return { success: true };
      },
      async deleteMany(criteria = {}) {
        const coll = getMemoryCollection(table);
        if (criteria?.id && typeof criteria.id === 'object' && criteria.id.$in) {
          criteria.id.$in.forEach(id => coll.delete(String(id)));
        } else if (criteria) {
          for (const [id, item] of coll.entries()) {
            const match = Object.entries(criteria).every(([k, v]) => String(item[k]) === String(v));
            if (match) coll.delete(id);
          }
        }
        saveLocalTable(table);
        return { success: true };
      },
      async bulkCreate(items = []) {
        const now = new Date().toISOString();
        const prepared = items.map((item, idx) => ({
          ...item,
          id: String(item.id || `gen_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`),
          created_date: item.created_date || now,
          updated_date: now
        }));
        prepared.forEach(d => getMemoryCollection(table).set(d.id, d));
        saveLocalTable(table);
        return prepared;
      },
      async bulkUpdate(items = []) {
        const coll = getMemoryCollection(table);
        items.forEach(d => {
          if (d.id) {
            const existing = coll.get(String(d.id)) || {};
            coll.set(String(d.id), { ...existing, ...d });
          }
        });
        saveLocalTable(table);
        return items;
      },
      async bulkDelete(ids = []) {
        const coll = getMemoryCollection(table);
        ids.forEach(id => coll.delete(String(id)));
        saveLocalTable(table);
        return { success: true };
      }
    };
  }

  return {
    async list(sort = null, limit = 50000) {
      const client = getSupabase();
      let dbData = [];
      if (client) {
        const targetLimit = limit ? Number(limit) : 50000;
        let isDesc = false;
        let col = null;
        if (sort) {
          isDesc = sort.startsWith('-');
          col = isDesc ? sort.slice(1) : sort;
        }

        if (targetLimit <= 1000) {
          let actualCol = col;
          let query = client.from(table).select('*');
          if (actualCol) {
            query = query.order(actualCol, { ascending: !isDesc });
            if (actualCol !== 'id') query = query.order('id', { ascending: !isDesc });
          }
          query = query.limit(targetLimit);
          let { data, error } = await query;
          if (error && (error.message?.includes('does not exist') || error.code === '42703')) {
            if (actualCol === 'created_date') {
              actualCol = 'created_at';
              const retry = await client.from(table).select('*').order(actualCol, { ascending: !isDesc }).limit(targetLimit);
              if (!retry.error && Array.isArray(retry.data)) {
                data = retry.data;
                error = null;
              }
            }
            if (error) {
              const fallback = await client.from(table).select('*').limit(targetLimit);
              if (!fallback.error && Array.isArray(fallback.data)) {
                data = fallback.data;
                error = null;
              } else if (fallback.error) {
                error = fallback.error;
              }
            }
          }
          if (error) {
            handleRlsViolation(table, 'list', error);
            if (!error.message?.includes('schema cache')) {
              console.warn(`Supabase list error for ${table}:`, error.message);
            }
          } else if (Array.isArray(data)) {
            dbData = data.map(d => mapEntityRecord(table, d));
          }
        } else {
          // Paginación por bloques para superar el límite de 1000 registros por query de PostgREST
          const PAGE_SIZE = 1000;
          let from = 0;
          let actualCol = col;
          while (dbData.length < targetLimit) {
            const to = from + Math.min(PAGE_SIZE, targetLimit - dbData.length) - 1;
            let query = client.from(table).select('*');
            if (actualCol) {
              query = query.order(actualCol, { ascending: !isDesc });
              if (actualCol !== 'id') query = query.order('id', { ascending: !isDesc });
            }
            query = query.range(from, to);
            let { data, error } = await query;
            if (error && (error.message?.includes('does not exist') || error.code === '42703')) {
              if (actualCol === 'created_date') {
                actualCol = 'created_at';
                const retry = await client.from(table).select('*').order(actualCol, { ascending: !isDesc }).range(from, to);
                if (!retry.error && Array.isArray(retry.data)) {
                  data = retry.data;
                  error = null;
                }
              }
              if (error) {
                actualCol = null;
                const fallback = await client.from(table).select('*').range(from, to);
                if (!fallback.error && Array.isArray(fallback.data)) {
                  data = fallback.data;
                  error = null;
                } else if (fallback.error) {
                  error = fallback.error;
                }
              }
            }
            if (error) {
              handleRlsViolation(table, 'list', error);
              if (!error.message?.includes('schema cache')) {
                console.warn(`Supabase list error for ${table}:`, error.message);
              }
              break;
            }
            if (!data || data.length === 0) break;
            const mapped = data.map(d => mapEntityRecord(table, d));
            dbData.push(...mapped);
            if (data.length < PAGE_SIZE) break;
            from += data.length;
          }
        }
      }
      const memItems = Array.from(getMemoryCollection(table).values()).map(d => mapEntityRecord(table, d));
      return deduplicateById([...dbData, ...memItems]);
    },

    async filter(criteria = {}, sort = null, limit = 50000) {
      const client = getSupabase();
      if (client) {
        const targetLimit = limit ? Number(limit) : 50000;
        let isDesc = false;
        let col = null;
        if (sort) {
          isDesc = sort.startsWith('-');
          col = isDesc ? sort.slice(1) : sort;
        }

        const applyCriteria = (q, orderCol = col) => {
          for (const [key, val] of Object.entries(criteria || {})) {
            if (val !== undefined && val !== null) {
              if (typeof val === 'object' && !Array.isArray(val)) {
                if (val.$in && Array.isArray(val.$in)) q = q.in(key, val.$in);
                if (val.$gte !== undefined) q = q.gte(key, val.$gte);
                if (val.$lte !== undefined) q = q.lte(key, val.$lte);
                if (val.$gt !== undefined) q = q.gt(key, val.$gt);
                if (val.$lt !== undefined) q = q.lt(key, val.$lt);
                if (val.$neq !== undefined) q = q.neq(key, val.$neq);
              } else {
                q = q.eq(key, val);
              }
            }
          }
          if (orderCol) {
            q = q.order(orderCol, { ascending: !isDesc });
            if (orderCol !== 'id') q = q.order('id', { ascending: !isDesc });
          }
          return q;
        };

        let dbData = [];
        if (targetLimit <= 1000) {
          let query = applyCriteria(client.from(table).select('*'), col);
          query = query.limit(targetLimit);
          let { data, error } = await query;
          if (error && (error.message?.includes('does not exist') || error.code === '42703')) {
            const altCol = col === 'created_date' ? 'created_at' : null;
            const retryQ = applyCriteria(client.from(table).select('*'), altCol).limit(targetLimit);
            const retryRes = await retryQ;
            if (!retryRes.error && Array.isArray(retryRes.data)) {
              data = retryRes.data;
              error = null;
            } else {
              const fallback = applyCriteria(client.from(table).select('*'), null).limit(targetLimit);
              const fbRes = await fallback;
              if (!fbRes.error && Array.isArray(fbRes.data)) {
                data = fbRes.data;
                error = null;
              }
            }
          }
          if (error) {
            if (!error.message?.includes('schema cache')) {
              console.warn(`Supabase filter error for ${table}:`, error.message);
            }
          } else if (Array.isArray(data)) {
            dbData = data.map(d => mapEntityRecord(table, d));
          }
        } else {
          // Paginación por bloques para superar el límite de 1000 registros por query de PostgREST
          const PAGE_SIZE = 1000;
          let from = 0;
          let actualCol = col;
          while (dbData.length < targetLimit) {
            const to = from + Math.min(PAGE_SIZE, targetLimit - dbData.length) - 1;
            let query = applyCriteria(client.from(table).select('*'), actualCol);
            query = query.range(from, to);
            let { data, error } = await query;
            if (error && (error.message?.includes('does not exist') || error.code === '42703')) {
              actualCol = actualCol === 'created_date' ? 'created_at' : null;
              const retry = applyCriteria(client.from(table).select('*'), actualCol).range(from, to);
              const retryRes = await retry;
              if (!retryRes.error && Array.isArray(retryRes.data)) {
                data = retryRes.data;
                error = null;
              } else {
                actualCol = null;
                const fallback = applyCriteria(client.from(table).select('*'), null).range(from, to);
                const fbRes = await fallback;
                if (!fbRes.error && Array.isArray(fbRes.data)) {
                  data = fbRes.data;
                  error = null;
                } else if (fbRes.error) {
                  error = fbRes.error;
                }
              }
            }
            if (error) {
              if (!error.message?.includes('schema cache')) {
                console.warn(`Supabase filter error for ${table}:`, error.message);
              }
              break;
            }
            if (!data || data.length === 0) break;
            const mapped = data.map(d => mapEntityRecord(table, d));
            dbData.push(...mapped);
            if (data.length < PAGE_SIZE) break;
            from += data.length;
          }
        }

        if (dbData.length > 0) {
          return deduplicateById(dbData.map(d => mapEntityRecord(table, d)));
        }

        // Fallback to memory filter if empty or error
        const all = Array.from(getMemoryCollection(table).values());
        const filtered = all.filter(item => {
          return Object.entries(criteria || {}).every(([k, v]) => {
            if (v === undefined || v === null) return true;
            if (typeof v === 'object' && !Array.isArray(v)) {
              if (v.$in && Array.isArray(v.$in)) return v.$in.map(String).includes(String(item[k]));
              if (v.$gte !== undefined) return item[k] >= v.$gte;
              if (v.$lte !== undefined) return item[k] <= v.$lte;
              if (v.$gt !== undefined) return item[k] > v.$gt;
              if (v.$lt !== undefined) return item[k] < v.$lt;
              if (v.$neq !== undefined) return String(item[k]) !== String(v.$neq);
            }
            return String(item[k]) === String(v);
          });
        });
        return deduplicateById(filtered.map(d => mapEntityRecord(table, d)));
      }

      // Memory filter fallback
      const all = Array.from(getMemoryCollection(table).values());
      const filtered = all.filter(item => {
        return Object.entries(criteria || {}).every(([k, v]) => {
          if (v === undefined || v === null) return true;
          if (typeof v === 'object' && !Array.isArray(v)) {
            if (v.$in && Array.isArray(v.$in)) return v.$in.map(String).includes(String(item[k]));
            if (v.$gte !== undefined) return item[k] >= v.$gte;
            if (v.$lte !== undefined) return item[k] <= v.$lte;
            if (v.$gt !== undefined) return item[k] > v.$gt;
            if (v.$lt !== undefined) return item[k] < v.$lt;
            if (v.$neq !== undefined) return String(item[k]) !== String(v.$neq);
          }
          return String(item[k]) === String(v);
        });
      });
      return deduplicateById(filtered.map(d => mapEntityRecord(table, d)));
    },

    async get(id) {
      if (!id) return null;
      const client = getSupabase();
      if (client) {
        const { data, error } = await client.from(table).select('*').eq('id', id).maybeSingle();
        if (error) {
          console.warn(`Supabase get error for ${table} (${id}):`, error.message);
          const mem = getMemoryCollection(table).get(id);
          return mem ? mapEntityRecord(table, mem) : null;
        }
        if (data) return mapEntityRecord(table, data);
        const mem = getMemoryCollection(table).get(id);
        return mem ? mapEntityRecord(table, mem) : null;
      }
      const mem = getMemoryCollection(table).get(id);
      return mem ? mapEntityRecord(table, mem) : null;
    },

    async create(item) {
      const explicitAction = item?.action || item?.accion || item?._action || null;
      const extractedAction = explicitAction ? String(explicitAction) : 'create';

      const id = item.id || `gen_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const now = new Date().toISOString();
      const preparedItem = prepareEmprendamosPayload(table, item);
      const rawPayload = {
        ...preparedItem,
        id,
        created_date: preparedItem.created_date || now,
        updated_date: now,
        is_sample: preparedItem.is_sample ?? false
      };

      const dispatchMetadata = {};
      for (const k of Object.keys(rawPayload)) {
        if (NON_COLUMN_DISPATCH_KEYS.has(k)) {
          dispatchMetadata[k] = rawPayload[k];
        }
      }

      const payload = sanitizePayloadForTable(table, rawPayload);

      const client = getSupabase();
      let savedData = null;
      if (client) {
        let attempts = 0;
        let lastError = null;
        while (attempts < 15) {
          attempts++;
          const { data, error } = await client.from(table).insert([payload]).select().single();
          if (!error && data) {
            getMemoryCollection(table).set(id, data);
            savedData = data;
            break;
          }
          lastError = error;
          if (error?.message) {
            const match = error.message.match(/Could not find the '([^']+)' column/) ||
                          error.message.match(/column "?([a-zA-Z0-9_]+)"? of relation .* does not exist/i) ||
                          error.message.match(/column "?([a-zA-Z0-9_]+)"? does not exist/i);
            if (match && match[1] && match[1] in payload) {
              console.warn(`[Supabase Schema] Omitting unknown column '${match[1]}' for insert on '${table}'`);
              delete payload[match[1]];
              continue;
            }
          }
          break;
        }
        if (!savedData) {
          handleRlsViolation(table, 'create', lastError);
          console.warn(`Supabase insert fallback for ${table}:`, lastError?.message);
        }
      }

      if (!savedData) {
        getMemoryCollection(table).set(id, payload);
        savedData = payload;
      }

      if (rawPayload.otros_cobros !== undefined) {
        savedData = { ...savedData, otros_cobros: rawPayload.otros_cobros };
        getMemoryCollection(table).set(id, savedData);
      }

      // Record in audit log with captured action type
      recordAuditLog({
        table,
        record_id: id,
        action: extractedAction,
        action_type: explicitAction || 'create',
        payload: savedData,
        metadata: {
          ...dispatchMetadata,
          operation: 'create'
        }
      });

      return mapEntityRecord(table, savedData);
    },

    async update(id, updates) {
      const explicitAction = updates?.action || updates?.accion || updates?._action || null;
      const extractedAction = explicitAction ? String(explicitAction) : 'update';

      const now = new Date().toISOString();
      const preparedUpdates = prepareEmprendamosPayload(table, updates);
      const rawPayload = {
        ...preparedUpdates,
        updated_date: now
      };

      const dispatchMetadata = {};
      for (const k of Object.keys(rawPayload)) {
        if (NON_COLUMN_DISPATCH_KEYS.has(k)) {
          dispatchMetadata[k] = rawPayload[k];
        }
      }

      const payload = sanitizePayloadForTable(table, rawPayload);

      const client = getSupabase();
      let updatedData = null;
      if (client) {
        let attempts = 0;
        let lastError = null;
        while (attempts < 15) {
          attempts++;
          const { data, error } = await client.from(table).update(payload).eq('id', id).select().single();
          if (!error && data) {
            const coll = getMemoryCollection(table);
            coll.set(id, { ...coll.get(id), ...data });
            updatedData = data;
            break;
          }
          lastError = error;
          if (error?.message) {
            const match = error.message.match(/Could not find the '([^']+)' column/) ||
                          error.message.match(/column "?([a-zA-Z0-9_]+)"? of relation .* does not exist/i) ||
                          error.message.match(/column "?([a-zA-Z0-9_]+)"? does not exist/i);
            if (match && match[1] && match[1] in payload) {
              console.warn(`[Supabase Schema] Omitting unknown column '${match[1]}' for update on '${table}'`);
              delete payload[match[1]];
              continue;
            }
          }
          break;
        }
        if (!updatedData) {
          handleRlsViolation(table, 'update', lastError);
          console.warn(`Supabase update fallback for ${table}:`, lastError?.message);
        }
      }

      if (!updatedData) {
        const coll = getMemoryCollection(table);
        const existing = coll.get(id) || { id };
        updatedData = { ...existing, ...payload };
        coll.set(id, updatedData);
      }

      if (rawPayload.otros_cobros !== undefined) {
        updatedData = { ...updatedData, otros_cobros: rawPayload.otros_cobros };
        getMemoryCollection(table).set(id, updatedData);
      }

      // Record in audit log with captured action type
      recordAuditLog({
        table,
        record_id: id,
        action: extractedAction,
        action_type: explicitAction || 'update',
        payload: updatedData,
        metadata: {
          ...dispatchMetadata,
          operation: 'update'
        }
      });

      return mapEntityRecord(table, updatedData);
    },

    async delete(id) {
      const client = getSupabase();
      if (client) {
        const { error } = await client.from(table).delete().eq('id', id);
        if (error) {
          handleRlsViolation(table, 'delete', error);
          console.warn(`Supabase delete error for ${table}:`, error.message);
        }
      }
      getMemoryCollection(table).delete(id);

      recordAuditLog({
        table,
        record_id: id,
        action: 'delete',
        action_type: 'delete',
        payload: null,
        metadata: { operation: 'delete' }
      });

      return { success: true };
    },

    async deleteMany(criteria = {}) {
      const client = getSupabase();
      if (client) {
        if (criteria?.id && typeof criteria.id === 'object' && criteria.id.$in) {
          await client.from(table).delete().in('id', criteria.id.$in);
        } else if (criteria) {
          let query = client.from(table).delete();
          for (const [k, v] of Object.entries(criteria)) {
            query = query.eq(k, v);
          }
          await query;
        }
      }
      const coll = getMemoryCollection(table);
      if (criteria?.id && typeof criteria.id === 'object' && criteria.id.$in) {
        for (const id of criteria.id.$in) coll.delete(id);
      } else if (criteria) {
        for (const [id, item] of coll.entries()) {
          const match = Object.entries(criteria).every(([k, v]) => String(item[k]) === String(v));
          if (match) coll.delete(id);
        }
      }

      recordAuditLog({
        table,
        record_id: 'batch',
        action: 'deleteMany',
        action_type: 'deleteMany',
        payload: null,
        metadata: { criteria }
      });

      return { success: true };
    },

    async bulkCreate(items = []) {
      if (!items.length) return [];
      const now = new Date().toISOString();
      const prepared = items.map((item, idx) => {
        const raw = {
          ...item,
          id: item.id || `gen_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
          created_date: item.created_date || now,
          updated_date: now
        };
        return sanitizePayloadForTable(table, raw);
      });

      const client = getSupabase();
      if (client) {
        const { data, error } = await client.from(table).insert(prepared).select();
        if (!error && data) {
          data.forEach(d => getMemoryCollection(table).set(d.id, d));
          recordAuditLog({
            table,
            record_id: `batch_${prepared.length}`,
            action: 'bulkCreate',
            action_type: 'bulkCreate',
            metadata: { count: prepared.length }
          });
          return data;
        }
        handleRlsViolation(table, 'bulkCreate', error);
        console.warn(`Supabase bulkCreate fallback for ${table}:`, error?.message);
      }

      prepared.forEach(d => getMemoryCollection(table).set(d.id, d));
      recordAuditLog({
        table,
        record_id: `batch_${prepared.length}`,
        action: 'bulkCreate',
        action_type: 'bulkCreate',
        metadata: { count: prepared.length, source: 'memory' }
      });
      return prepared;
    },

    async bulkUpdate(items = []) {
      if (!items.length) return [];
      const client = getSupabase();
      if (client) {
        const { data, error } = await client.from(table).upsert(items).select();
        if (!error && data) {
          data.forEach(d => getMemoryCollection(table).set(d.id, d));
          return data;
        }
      }
      items.forEach(d => {
        if (d.id) {
          const coll = getMemoryCollection(table);
          coll.set(d.id, { ...coll.get(d.id), ...d });
        }
      });
      return items;
    },

    async bulkDelete(ids = []) {
      if (!ids.length) return { success: true };
      const client = getSupabase();
      if (client) {
        await client.from(table).delete().in('id', ids);
      }
      ids.forEach(id => getMemoryCollection(table).delete(id));
      recordAuditLog({
        table,
        record_id: `batch_${ids.length}`,
        action: 'bulkDelete',
        action_type: 'bulkDelete',
        metadata: { idsCount: ids.length }
      });
      return { success: true };
    }
  };
}

// Proxy to dynamically build entity repositories for any entity name
export const entities = new Proxy({}, {
  get(target, prop) {
    if (!target[prop]) {
      target[prop] = createEntityRepository(prop);
    }
    return target[prop];
  }
});

// Seed data into memory cache
export function seedMemoryStore(tableName, rows = []) {
  const coll = getMemoryCollection(tableName);
  rows.forEach(r => {
    if (r && r.id) coll.set(r.id, r);
  });
}
