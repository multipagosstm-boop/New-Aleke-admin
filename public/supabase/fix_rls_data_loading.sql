-- ==============================================================================
-- SOLUCIÓN INTEGRAL PARA QUE LOS PERMISOS DE RLS NO AFECTEN LA CARGA DE DATOS
-- Sistema Contable y Financiero Aleke System
-- ==============================================================================
-- Este script soluciona de forma definitiva los errores de:
-- 1. "new row violates row-level security policy for table ..."
-- 2. "permission denied for table ..."
-- 3. Consultas SELECT que retornan arreglos vacíos [] debido a filtros silenciosos de RLS
-- 4. Bloqueos durante la Carga Masiva de comprobantes y movimientos contables
-- ==============================================================================

-- PARTE 1: Conceder uso completo del esquema public
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- PARTE 2: Deshabilitar Row Level Security (RLS) en todas las tablas operativas
-- (Recomendado para sistemas ERP/Contables donde el control de acceso RBAC
--  se gestiona a nivel de aplicación autenticada entre Administrador, Contador y Auxiliar)
ALTER TABLE IF EXISTS public.comprobante_contable DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.movimiento_contable DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cliente DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cuenta DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cuenta_ahorro DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.producto_credito DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.abono_prestamo DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.configuracion DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.consecutivo DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.contrato_arriendo DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cuota_amortizacion DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.emprendamos_abono DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.emprendamos_cliente DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.emprendamos_credito DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.emprendamos_interes DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.extracto_producto DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.historico_contable DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.inmueble DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.inquilino DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.linea_extracto DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.meta_tarjeta DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.pago_arriendo DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.prestamo DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.app_user DISABLE ROW LEVEL SECURITY;

-- PARTE 3: Crear Políticas Permisivas Universales (en caso de que RLS permanezca o se reactive)
DO $$
DECLARE
    tbl text;
    tables text[] := ARRAY[
        'comprobante_contable', 'movimiento_contable', 'cliente', 'cuenta',
        'cuenta_ahorro', 'producto_credito', 'abono_prestamo', 'configuracion',
        'consecutivo', 'contrato_arriendo', 'cuota_amortizacion', 'emprendamos_abono',
        'emprendamos_cliente', 'emprendamos_credito', 'emprendamos_interes',
        'extracto_producto', 'historico_contable', 'inmueble', 'inquilino',
        'linea_extracto', 'meta_tarjeta', 'pago_arriendo', 'prestamo', 'app_user'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
            -- Eliminar políticas restrictivas previas si existen
            EXECUTE format('DROP POLICY IF EXISTS "aleke_allow_all" ON public.%I', tbl);
            EXECUTE format('DROP POLICY IF EXISTS "Allow anon all on %s" ON public.%I', tbl, tbl);
            EXECUTE format('DROP POLICY IF EXISTS "Enable read access for all users" ON public.%I', tbl);
            EXECUTE format('DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.%I', tbl);
            
            -- Crear política universal para anon, authenticated y service_role
            EXECUTE format('CREATE POLICY "aleke_allow_all" ON public.%I FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true)', tbl);
        END IF;
    END LOOP;
END $$;

-- PARTE 4: Conceder permisos DML (SELECT, INSERT, UPDATE, DELETE) a todos los roles
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

-- PARTE 5: Garantizar permisos en tablas creadas en el futuro
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;

-- Listo! La carga masiva y operaciones del sistema funcionarán sin interferencia de RLS.
