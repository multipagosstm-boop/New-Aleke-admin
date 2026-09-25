import { supabase } from './supabaseClient'; 

// Generador genérico para imitar las llamadas CRUD de Base44
const createEntityHandler = (tableName) => ({
  list: async (sort = "", limit = 1000) => {
    let query = supabase.from(tableName).select('*').limit(limit);
    if (sort.startsWith("-")) query = query.order(sort.substring(1), { ascending: false });
    else if (sort) query = query.order(sort, { ascending: true });
    
    const { data, error } = await query;
    if (error) console.error(`Error list ${tableName}:`, error);
    return data || [];
  },
  get: async (id) => {
    const { data, error } = await supabase.from(tableName).select('*').eq('id', id).single();
    if (error) console.error(`Error get ${tableName}:`, error);
    return data;
  },
  create: async (payload) => {
    const { data, error } = await supabase.from(tableName).insert([payload]).select().single();
    if (error) throw error;
    return data;
  },
  update: async (id, payload) => {
    const { data, error } = await supabase.from(tableName).update(payload).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },
  delete: async (id) => {
    const { error } = await supabase.from(tableName).delete().eq('id', id);
    if (error) throw error;
    return true;
  },
  filter: async (queryObj, sort = "", limit = 1000) => {
    let query = supabase.from(tableName).select('*').limit(limit);
    for (const [key, value] of Object.entries(queryObj)) {
        if (value && typeof value === 'object' && value.$in) query = query.in(key, value.$in);
        else query = query.eq(key, value);
    }
    if (sort.startsWith("-")) query = query.order(sort.substring(1), { ascending: false });
    else if (sort) query = query.order(sort, { ascending: true });
    
    const { data, error } = await query;
    if (error) console.error(`Error filter ${tableName}:`, error);
    return data || [];
  }
});

// Recreamos el objeto base44 para que el resto de tu app no note el cambio
export const base44 = {
  entities: {
    Cliente: createEntityHandler('Cliente'),
    ComprobanteContable: createEntityHandler('ComprobanteContable'),
    MovimientoContable: createEntityHandler('MovimientoContable'),
    CuentaAhorro: createEntityHandler('CuentaAhorro'),
    ProductoCredito: createEntityHandler('ProductoCredito'),
    ExtractoProducto: createEntityHandler('ExtractoProducto'),
    LineaExtracto: createEntityHandler('LineaExtracto'),
    Prestamo: createEntityHandler('Prestamo'),
    CuotaAmortizacion: createEntityHandler('CuotaAmortizacion'),
    AbonoPrestamo: createEntityHandler('AbonoPrestamo'),
    Inmueble: createEntityHandler('Inmueble'),
    ContratoArriendo: createEntityHandler('ContratoArriendo'),
    Inquilino: createEntityHandler('Inquilino'),
    PagoArriendo: createEntityHandler('PagoArriendo'),
    MetaTarjeta: createEntityHandler('MetaTarjeta'),
    Configuracion: createEntityHandler('Configuracion'),
    HistoricoContable: createEntityHandler('HistoricoContable'),
    Consecutivo: createEntityHandler('Consecutivo'),
    EmprendamosCliente: createEntityHandler('EmprendamosCliente'),
    EmprendamosCredito: createEntityHandler('EmprendamosCredito'),
    EmprendamosAbono: createEntityHandler('EmprendamosAbono'),
    EmprendamosInteres: createEntityHandler('EmprendamosInteres'),
    Cuenta: createEntityHandler('Cuenta'),
  },
  auth: {
    me: async () => {
      const { data } = await supabase.auth.getUser();
      if (data?.user) {
        return { 
          id: data.user.id, 
          email: data.user.email, 
          role: data.user.app_metadata?.role || 'admin' 
        };
      }
      return null;
    }
  },
  functions: {
    invoke: async (functionName, args) => {
      const { data, error } = await supabase.functions.invoke(functionName, { body: args });
      if (error) throw error;
      return data;
    }
  }
};

// Si usabas un hook, lo mantenemos igual:
export const useBase44 = () => {
  return base44;
};