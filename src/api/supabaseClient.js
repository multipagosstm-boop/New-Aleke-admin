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
  const envUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
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
  const seen = new Set();
  const result = [];
  for (const item of items) {
    if (!item) continue;
    const id = item.id;
    if (id !== undefined && id !== null) {
      const idStr = String(id);
      if (seen.has(idStr)) continue;
      seen.add(idStr);
    }
    result.push(item);
  }
  return result;
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

// Generic entity repository builder
export function createEntityRepository(entityName) {
  const table = entityToTable(entityName);

  return {
    async list(sort = null, limit = 5000) {
      const client = getSupabase();
      let dbData = [];
      if (client) {
        let query = client.from(table).select('*');
        if (sort) {
          const isDesc = sort.startsWith('-');
          const col = isDesc ? sort.slice(1) : sort;
          query = query.order(col, { ascending: !isDesc });
        }
        if (limit) query = query.limit(limit);
        const { data, error } = await query;
        if (error) {
          handleRlsViolation(table, 'list', error);
          console.warn(`Supabase list error for ${table}:`, error.message);
        } else if (Array.isArray(data)) {
          dbData = data;
        }
      }
      const memItems = Array.from(getMemoryCollection(table).values());
      return deduplicateById([...dbData, ...memItems]);
    },

    async filter(criteria = {}, sort = null, limit = 5000) {
      const client = getSupabase();
      if (client) {
        let query = client.from(table).select('*');
        for (const [key, val] of Object.entries(criteria || {})) {
          if (val !== undefined && val !== null) {
            if (typeof val === 'object' && !Array.isArray(val)) {
              if (val.$in && Array.isArray(val.$in)) query = query.in(key, val.$in);
              if (val.$gte !== undefined) query = query.gte(key, val.$gte);
              if (val.$lte !== undefined) query = query.lte(key, val.$lte);
              if (val.$gt !== undefined) query = query.gt(key, val.$gt);
              if (val.$lt !== undefined) query = query.lt(key, val.$lt);
              if (val.$neq !== undefined) query = query.neq(key, val.$neq);
            } else {
              query = query.eq(key, val);
            }
          }
        }
        if (sort) {
          const isDesc = sort.startsWith('-');
          const col = isDesc ? sort.slice(1) : sort;
          query = query.order(col, { ascending: !isDesc });
        }
        if (limit) query = query.limit(limit);
        const { data, error } = await query;
        if (error) {
          console.warn(`Supabase filter error for ${table}:`, error.message);
          // Fallback to memory filter
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
        return deduplicateById(data || []);
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
        const { data, error } = await client.from(table).select('*').eq('id', id).single();
        if (error) {
          console.warn(`Supabase get error for ${table} (${id}):`, error.message);
          return getMemoryCollection(table).get(id) || null;
        }
        return data;
      }
      return getMemoryCollection(table).get(id) || null;
    },

    async create(item) {
      const id = item.id || `gen_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const now = new Date().toISOString();
      const payload = {
        ...item,
        id,
        created_date: item.created_date || now,
        updated_date: now,
        is_sample: item.is_sample ?? false
      };

      const client = getSupabase();
      if (client) {
        const { data, error } = await client.from(table).insert([payload]).select().single();
        if (!error && data) {
          getMemoryCollection(table).set(id, data);
          return data;
        }
        handleRlsViolation(table, 'create', error);
        console.warn(`Supabase insert fallback for ${table}:`, error?.message);
      }

      getMemoryCollection(table).set(id, payload);
      return payload;
    },

    async update(id, updates) {
      const now = new Date().toISOString();
      const payload = {
        ...updates,
        updated_date: now
      };

      const client = getSupabase();
      if (client) {
        const { data, error } = await client.from(table).update(payload).eq('id', id).select().single();
        if (!error && data) {
          const coll = getMemoryCollection(table);
          coll.set(id, { ...coll.get(id), ...data });
          return data;
        }
        handleRlsViolation(table, 'update', error);
        console.warn(`Supabase update fallback for ${table}:`, error?.message);
      }

      const coll = getMemoryCollection(table);
      const existing = coll.get(id) || { id };
      const updated = { ...existing, ...payload };
      coll.set(id, updated);
      return updated;
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
      return { success: true };
    },

    async bulkCreate(items = []) {
      if (!items.length) return [];
      const now = new Date().toISOString();
      const prepared = items.map((item, idx) => ({
        ...item,
        id: item.id || `gen_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
        created_date: item.created_date || now,
        updated_date: now
      }));

      const client = getSupabase();
      if (client) {
        const { data, error } = await client.from(table).insert(prepared).select();
        if (!error && data) {
          data.forEach(d => getMemoryCollection(table).set(d.id, d));
          return data;
        }
        handleRlsViolation(table, 'bulkCreate', error);
        console.warn(`Supabase bulkCreate fallback for ${table}:`, error?.message);
      }

      prepared.forEach(d => getMemoryCollection(table).set(d.id, d));
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
