-- ==============================================================================
-- SCRIPT PARA LIMPIAR LA BASE DE DATOS EN SUPABASE (Aleke System)
-- ==============================================================================
-- Este script vacía todas las tablas operativas y contables para permitir una
-- recarga limpia desde archivos CSV, conservando la estructura de las tablas,
-- tipos de datos, índices y relaciones intactas.
--
-- INSTRUCCIONES:
-- 1. Ve a Supabase Dashboard (https://supabase.com/dashboard) -> Tu Proyecto.
-- 2. Entra en "SQL Editor" (icono de consola '>_' en el menú izquierdo).
-- 3. Pega este contenido y haz clic en "RUN".
-- ==============================================================================

BEGIN;

-- 1. Desactivar temporalmente disparadores y comprobaciones si fuera necesario
SET session_replication_role = 'replica';

-- 2. Vaciar tablas contables y financieras (con CASCADE para respetar llaves foráneas)
TRUNCATE TABLE
    public.movimiento_contable,
    public.comprobante_contable,
    public.linea_extracto,
    public.extracto_producto,
    public.abono_prestamo,
    public.cuota_amortizacion,
    public.prestamo,
    public.pago_arriendo,
    public.contrato_arriendo,
    public.inquilino,
    public.inmueble,
    public.emprendamos_abono,
    public.emprendamos_interes,
    public.emprendamos_credito,
    public.emprendamos_cliente,
    public.meta_tarjeta,
    public.producto_credito,
    public.cuenta_ahorro,
    public.cliente,
    public.cuenta,
    public.historico_contable,
    public.consecutivo,
    public.configuracion
RESTART IDENTITY CASCADE;

-- NOTA: Si también deseas vaciar los usuarios creados en la tabla 'app_user', 
-- descomenta la siguiente línea:
-- TRUNCATE TABLE public.app_user RESTART IDENTITY CASCADE;

-- 3. Reactivar restricciones y roles normales
SET session_replication_role = 'origin';

-- 4. Asegurar que los permisos de lectura y escritura estén activos para la nueva carga
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;

COMMIT;

-- Confirmación de ejecución exitosa
SELECT 'Base de datos limpiada exitosamente. Lista para cargar archivos CSV.' AS resultado;
