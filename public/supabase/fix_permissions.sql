-- =========================================================
-- SOLUCIÓN DE ACCESO Y RLS PARA SUPABASE (Aleke System)
-- Ejecuta este script en Supabase -> SQL Editor si los datos no se ven en el frontend
-- =========================================================

-- 1. Deshabilitar RLS en las tablas para permitir lectura y escritura desde la aplicación administrativa
ALTER TABLE public.abono_prestamo DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.cliente DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.comprobante_contable DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracion DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.consecutivo DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.contrato_arriendo DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.cuenta DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.cuenta_ahorro DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.cuota_amortizacion DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.emprendamos_abono DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.emprendamos_cliente DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.emprendamos_credito DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.emprendamos_interes DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.extracto_producto DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico_contable DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.inmueble DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.inquilino DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.linea_extracto DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_tarjeta DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimiento_contable DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.pago_arriendo DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.prestamo DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.producto_credito DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_user DISABLE ROW LEVEL SECURITY;

-- 2. Conceder todos los permisos a los roles anónimos y autenticados
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
