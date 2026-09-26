-- ==============================================================================
-- RESTAURAR USUARIOS Y ROLES EN SUPABASE (Aleke System)
-- ==============================================================================
-- Ejecuta este script en Supabase -> SQL Editor para garantizar que la tabla
-- app_user contenga los 3 usuarios del sistema con sus roles respectivos.

BEGIN;

-- 1. Asegurar que la tabla app_user exista con sus columnas requeridas
CREATE TABLE IF NOT EXISTS public."app_user" (
  id TEXT PRIMARY KEY,
  created_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  updated_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  created_by_id TEXT,
  is_sample BOOLEAN DEFAULT false,
  "role" TEXT
);

-- Agregar columnas adicionales de perfil si no existen
ALTER TABLE public."app_user" ADD COLUMN IF NOT EXISTS "nombre" TEXT;
ALTER TABLE public."app_user" ADD COLUMN IF NOT EXISTS "username" TEXT;
ALTER TABLE public."app_user" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE public."app_user" ADD COLUMN IF NOT EXISTS "estado" TEXT DEFAULT 'activo';

-- 2. Asegurar que las políticas de RLS no bloqueen la tabla app_user
ALTER TABLE public."app_user" DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public."app_user" TO anon, authenticated, service_role;

-- 3. Insertar o actualizar los 3 usuarios predeterminados del sistema
INSERT INTO public."app_user" (
  id,
  nombre,
  username,
  email,
  "role",
  estado,
  created_date,
  updated_date
)
VALUES
  (
    'usr_admin_1',
    'admin',
    'admin1',
    'admin@aleke.com',
    'administrador',
    'activo',
    timezone('utc'::text, now()),
    timezone('utc'::text, now())
  ),
  (
    'usr_contador_1',
    'Isaias',
    'isaias15',
    'isaias@aleke.com',
    'contador',
    'activo',
    timezone('utc'::text, now()),
    timezone('utc'::text, now())
  ),
  (
    'usr_auxiliar_1',
    'Sandra',
    'sandra1000',
    'sandra@aleke.com',
    'auxiliar',
    'activo',
    timezone('utc'::text, now()),
    timezone('utc'::text, now())
  )
ON CONFLICT (id) DO UPDATE SET
  nombre = EXCLUDED.nombre,
  username = EXCLUDED.username,
  email = EXCLUDED.email,
  "role" = EXCLUDED."role",
  estado = EXCLUDED.estado,
  updated_date = timezone('utc'::text, now());

COMMIT;

-- Verificar los usuarios registrados
SELECT id, username, nombre, email, "role", estado FROM public."app_user";
