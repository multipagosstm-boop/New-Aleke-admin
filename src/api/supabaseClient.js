import { createClient } from '@supabase/supabase-js';

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

// Direct supabase client export with graceful query proxy fallback
export const supabase = new Proxy({}, {
  get(target, prop) {
    const client = getSupabase();
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

// In-memory fallback cache when Supabase is not yet configured or for offline prototyping
const memoryStore = new Map();

function getMemoryCollection(table) {
  if (!memoryStore.has(table)) {
    memoryStore.set(table, new Map());
  }
  return memoryStore.get(table);
}

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

// Generic entity repository builder
export function createEntityRepository(entityName) {
  const table = entityToTable(entityName);

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
          let query = client.from(table).select('*');
          if (col) {
            query = query.order(col, { ascending: !isDesc });
            if (col !== 'id') query = query.order('id', { ascending: !isDesc });
          }
          query = query.limit(targetLimit);
          const { data, error } = await query;
          if (error) {
            handleRlsViolation(table, 'list', error);
            console.warn(`Supabase list error for ${table}:`, error.message);
          } else if (Array.isArray(data)) {
            dbData = data;
          }
        } else {
          // Paginación por bloques para superar el límite de 1000 registros por query de PostgREST
          const PAGE_SIZE = 1000;
          let from = 0;
          while (dbData.length < targetLimit) {
            const to = from + Math.min(PAGE_SIZE, targetLimit - dbData.length) - 1;
            let query = client.from(table).select('*');
            if (col) {
              query = query.order(col, { ascending: !isDesc });
              if (col !== 'id') query = query.order('id', { ascending: !isDesc });
            }
            query = query.range(from, to);
            const { data, error } = await query;
            if (error) {
              handleRlsViolation(table, 'list', error);
              console.warn(`Supabase list error for ${table}:`, error.message);
              break;
            }
            if (!data || data.length === 0) break;
            dbData.push(...data);
            if (data.length < PAGE_SIZE) break;
            from += data.length;
          }
        }
      }
      const memItems = Array.from(getMemoryCollection(table).values());
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

        const applyCriteria = (q) => {
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
          if (col) {
            q = q.order(col, { ascending: !isDesc });
            if (col !== 'id') q = q.order('id', { ascending: !isDesc });
          }
          return q;
        };

        let dbData = [];
        if (targetLimit <= 1000) {
          let query = applyCriteria(client.from(table).select('*'));
          query = query.limit(targetLimit);
          const { data, error } = await query;
          if (error) {
            console.warn(`Supabase filter error for ${table}:`, error.message);
          } else if (Array.isArray(data)) {
            dbData = data;
          }
        } else {
          // Paginación por bloques para superar el límite de 1000 registros por query de PostgREST
          const PAGE_SIZE = 1000;
          let from = 0;
          while (dbData.length < targetLimit) {
            const to = from + Math.min(PAGE_SIZE, targetLimit - dbData.length) - 1;
            let query = applyCriteria(client.from(table).select('*'));
            query = query.range(from, to);
            const { data, error } = await query;
            if (error) {
              console.warn(`Supabase filter error for ${table}:`, error.message);
              break;
            }
            if (!data || data.length === 0) break;
            dbData.push(...data);
            if (data.length < PAGE_SIZE) break;
            from += data.length;
          }
        }

        if (dbData.length > 0) {
          return deduplicateById(dbData);
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
        return deduplicateById(filtered);
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
      return deduplicateById(filtered);
    },

    async get(id) {
      if (!id) return null;
      const client = getSupabase();
      if (client) {
        const { data, error } = await client.from(table).select('*').eq('id', id).maybeSingle();
        if (error) {
          console.warn(`Supabase get error for ${table} (${id}):`, error.message);
          return getMemoryCollection(table).get(id) || null;
        }
        return data || getMemoryCollection(table).get(id) || null;
      }
      return getMemoryCollection(table).get(id) || null;
    },

    async create(item) {
      const explicitAction = item?.action || item?.accion || item?._action || null;
      const extractedAction = explicitAction ? String(explicitAction) : 'create';

      const id = item.id || `gen_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const now = new Date().toISOString();
      const rawPayload = {
        ...item,
        id,
        created_date: item.created_date || now,
        updated_date: now,
        is_sample: item.is_sample ?? false
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
        while (attempts < 5) {
          attempts++;
          const { data, error } = await client.from(table).insert([payload]).select().single();
          if (!error && data) {
            getMemoryCollection(table).set(id, data);
            savedData = data;
            break;
          }
          lastError = error;
          if (error?.message && error.message.includes('in the schema cache')) {
            const match = error.message.match(/Could not find the '([^']+)' column/);
            if (match && match[1] && match[1] in payload) {
              console.warn(`[Supabase Schema Cache] Omitting unknown column '${match[1]}' for insert on '${table}'`);
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

      return savedData;
    },

    async update(id, updates) {
      const explicitAction = updates?.action || updates?.accion || updates?._action || null;
      const extractedAction = explicitAction ? String(explicitAction) : 'update';

      const now = new Date().toISOString();
      const rawPayload = {
        ...updates,
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
        while (attempts < 5) {
          attempts++;
          const { data, error } = await client.from(table).update(payload).eq('id', id).select().single();
          if (!error && data) {
            const coll = getMemoryCollection(table);
            coll.set(id, { ...coll.get(id), ...data });
            updatedData = data;
            break;
          }
          lastError = error;
          if (error?.message && error.message.includes('in the schema cache')) {
            const match = error.message.match(/Could not find the '([^']+)' column/);
            if (match && match[1] && match[1] in payload) {
              console.warn(`[Supabase Schema Cache] Omitting unknown column '${match[1]}' for update on '${table}'`);
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

      return updatedData;
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
