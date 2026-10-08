-- ====================================================================
-- TABLAS EMPRENDAMOS EN SUPABASE (con Foreign Keys, RLS e Índices)
-- Ejecutar en el SQL Editor de Supabase
-- ====================================================================

-- 1. Tabla: emprendamos_cliente (Inscripción de clientes en Emprendamos)
CREATE TABLE IF NOT EXISTS public."emprendamos_cliente" (
  id TEXT PRIMARY KEY,
  created_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  updated_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  created_by_id TEXT,
  is_sample BOOLEAN DEFAULT false,
  "cliente_id" TEXT REFERENCES public."cliente"("id") ON DELETE SET NULL,
  "fecha_ingreso" TEXT,
  "dia_pago" NUMERIC,
  "tasa_acordada" NUMERIC,
  "tasa_extracupo" NUMERIC DEFAULT 0.06,
  "capital_inicial" NUMERIC DEFAULT 0,
  "saldo_deuda" NUMERIC DEFAULT 0,
  "cupo_asignado" NUMERIC DEFAULT 0,
  "extracupo_autorizado" NUMERIC DEFAULT 0,
  "cda_apoderada_id" TEXT,
  "comprobante_cartera_id" TEXT REFERENCES public."comprobante_contable"("id") ON DELETE SET NULL,
  "plan_trazado" TEXT,
  "contrato_url" TEXT,
  "fecha_eligible_salida" TEXT,
  "fecha_salida" TEXT,
  "estado" TEXT DEFAULT 'activo',
  "notas" TEXT
);

ALTER TABLE public."emprendamos_cliente" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all on emprendamos_cliente" ON public."emprendamos_cliente";
CREATE POLICY "Allow anon all on emprendamos_cliente" ON public."emprendamos_cliente" 
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_emprendamos_cliente_cliente_id ON public."emprendamos_cliente" ("cliente_id");
CREATE INDEX IF NOT EXISTS idx_emprendamos_cliente_comprobante_cartera_id ON public."emprendamos_cliente" ("comprobante_cartera_id");
CREATE INDEX IF NOT EXISTS idx_emprendamos_cliente_estado ON public."emprendamos_cliente" ("estado");


-- 2. Tabla: emprendamos_credito (Créditos y préstamos otorgados)
CREATE TABLE IF NOT EXISTS public."emprendamos_credito" (
  id TEXT PRIMARY KEY,
  created_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  updated_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  created_by_id TEXT,
  is_sample BOOLEAN DEFAULT false,
  "emprendamos_cliente_id" TEXT REFERENCES public."emprendamos_cliente"("id") ON DELETE CASCADE,
  "cliente_id" TEXT REFERENCES public."cliente"("id") ON DELETE SET NULL,
  "codigo" TEXT,
  "tipo" TEXT,
  "concepto" TEXT,
  "capital" NUMERIC DEFAULT 0,
  "tasa_nominal" NUMERIC DEFAULT 0,
  "cuota_fija" NUMERIC DEFAULT 0,
  "fecha" TEXT,
  "dia_pago" NUMERIC,
  "fecha_proximo_pago" TEXT,
  "saldo_capital" NUMERIC DEFAULT 0,
  "saldo_intereses" NUMERIC DEFAULT 0,
  "estado" TEXT DEFAULT 'vigente',
  "comprobante_id" TEXT REFERENCES public."comprobante_contable"("id") ON DELETE SET NULL,
  "producto_credito_id" TEXT,
  "notas" TEXT
);

ALTER TABLE public."emprendamos_credito" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all on emprendamos_credito" ON public."emprendamos_credito";
CREATE POLICY "Allow anon all on emprendamos_credito" ON public."emprendamos_credito" 
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_emprendamos_credito_emprendamos_cliente_id ON public."emprendamos_credito" ("emprendamos_cliente_id");
CREATE INDEX IF NOT EXISTS idx_emprendamos_credito_cliente_id ON public."emprendamos_credito" ("cliente_id");
CREATE INDEX IF NOT EXISTS idx_emprendamos_credito_codigo ON public."emprendamos_credito" ("codigo");
CREATE INDEX IF NOT EXISTS idx_emprendamos_credito_fecha ON public."emprendamos_credito" ("fecha");
CREATE INDEX IF NOT EXISTS idx_emprendamos_credito_estado ON public."emprendamos_credito" ("estado");
CREATE INDEX IF NOT EXISTS idx_emprendamos_credito_comprobante_id ON public."emprendamos_credito" ("comprobante_id");


-- Vista de compatibilidad para consultas bajo el nombre plural 'emprendamos_creditos'
CREATE OR REPLACE VIEW public."emprendamos_creditos" AS 
  SELECT * FROM public."emprendamos_credito";


-- 3. Tabla: emprendamos_abono (Abonos a capital e intereses)
CREATE TABLE IF NOT EXISTS public."emprendamos_abono" (
  id TEXT PRIMARY KEY,
  created_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  updated_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  created_by_id TEXT,
  is_sample BOOLEAN DEFAULT false,
  "cliente_id" TEXT REFERENCES public."cliente"("id") ON DELETE SET NULL,
  "emprendamos_cliente_id" TEXT REFERENCES public."emprendamos_cliente"("id") ON DELETE SET NULL,
  "credito_id" TEXT REFERENCES public."emprendamos_credito"("id") ON DELETE SET NULL,
  "fecha" TEXT,
  "valor_total" NUMERIC DEFAULT 0,
  "tipo" TEXT DEFAULT 'otro',
  "comprobante_id" TEXT REFERENCES public."comprobante_contable"("id") ON DELETE SET NULL,
  "subcuenta_ingreso" TEXT,
  "cda_id" TEXT,
  "producto_credito_id" TEXT,
  "detalles" JSONB DEFAULT '[]'::jsonb,
  "notas" TEXT
);

ALTER TABLE public."emprendamos_abono" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all on emprendamos_abono" ON public."emprendamos_abono";
CREATE POLICY "Allow anon all on emprendamos_abono" ON public."emprendamos_abono" 
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_emprendamos_abono_cliente_id ON public."emprendamos_abono" ("cliente_id");
CREATE INDEX IF NOT EXISTS idx_emprendamos_abono_emprendamos_cliente_id ON public."emprendamos_abono" ("emprendamos_cliente_id");
CREATE INDEX IF NOT EXISTS idx_emprendamos_abono_credito_id ON public."emprendamos_abono" ("credito_id");
CREATE INDEX IF NOT EXISTS idx_emprendamos_abono_fecha ON public."emprendamos_abono" ("fecha");
CREATE INDEX IF NOT EXISTS idx_emprendamos_abono_comprobante_id ON public."emprendamos_abono" ("comprobante_id");


-- 4. Tabla: emprendamos_interes (Causación de intereses)
CREATE TABLE IF NOT EXISTS public."emprendamos_interes" (
  id TEXT PRIMARY KEY,
  created_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  updated_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  created_by_id TEXT,
  is_sample BOOLEAN DEFAULT false,
  "emprendamos_cliente_id" TEXT REFERENCES public."emprendamos_cliente"("id") ON DELETE SET NULL,
  "cliente_id" TEXT REFERENCES public."cliente"("id") ON DELETE SET NULL,
  "credito_id" TEXT REFERENCES public."emprendamos_credito"("id") ON DELETE SET NULL,
  "periodo" TEXT,
  "capital_base" NUMERIC DEFAULT 0,
  "tasa" NUMERIC DEFAULT 0,
  "intereses" NUMERIC DEFAULT 0,
  "comprobante_id" TEXT REFERENCES public."comprobante_contable"("id") ON DELETE SET NULL,
  "estado" TEXT DEFAULT 'generado',
  "fecha" TEXT
);

ALTER TABLE public."emprendamos_interes" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all on emprendamos_interes" ON public."emprendamos_interes";
CREATE POLICY "Allow anon all on emprendamos_interes" ON public."emprendamos_interes" 
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_emprendamos_interes_emprendamos_cliente_id ON public."emprendamos_interes" ("emprendamos_cliente_id");
CREATE INDEX IF NOT EXISTS idx_emprendamos_interes_cliente_id ON public."emprendamos_interes" ("cliente_id");
CREATE INDEX IF NOT EXISTS idx_emprendamos_interes_credito_id ON public."emprendamos_interes" ("credito_id");
CREATE INDEX IF NOT EXISTS idx_emprendamos_interes_comprobante_id ON public."emprendamos_interes" ("comprobante_id");


-- ====================================================================
-- CARGA INICIAL DE DATOS (12 Clientes, 13 Créditos y Abonos iniciales)
-- ====================================================================

-- Inserción de 12 Clientes Emprendamos
INSERT INTO public."emprendamos_cliente" ("id", "cliente_id", "estado", "dia_pago", "cda_apoderada_id", "contrato_url", "notas", "cupo_asignado", "capital_inicial", "saldo_deuda", "fecha_ingreso", "fecha_eligible_salida", "tasa_acordada", "tasa_extracupo", "plan_trazado", "comprobante_cartera_id", "extracupo_autorizado", "created_date", "updated_date")
VALUES
  ('6ab550d85b7aefb6faf464c2', '6a98f370e7ff24e87b272441', 'activo', 15, '6a9b2981983614b2043bca38', NULL, 'Saldo inicial al 31 de agosto', 7710000, 33847171, 19741193, '2026-08-31', '2027-08-31', 0.03, 0.06, 'Saneamiento y adquisición de nuevos cupos bancarios', '6ab550d78f6971ee170225b8', 0, '2026-08-31T00:00:00.000Z', '2026-09-24T16:37:00.500Z'),
  ('6ab48c01ef96e6396707facd', '6a98f2e42665cda10340d60f', 'activo', 15, '6a990783d5cbfd223b0246d3', NULL, 'Saldos iniciales al 31 de agosto', 4300000, 11705124, 11705124, '2026-08-31', '2027-08-31', 0.03, 0.06, 'Restructuración y saneamiento financiero', '6ab48c01e816212db24ebf97', 0, '2026-08-31T00:00:00.000Z', '2026-09-24T02:34:20.725Z'),
  ('6ab48783654f4af5a911fae7', '6a98f2984726aaae7f1bae9b', 'activo', 23, '6a9907550f8556f85fa51719', NULL, 'Saldo inicial a corte 31 de agosto', 11500000, 38373364, 38373364, '2026-08-31', '2027-08-31', 0.03, 0.06, 'Gestión de tarjetas de crédito y rescate de historial', '6ab487822f83c9bb2bb04cb4', 0, '2026-08-31T00:00:00.000Z', '2026-09-24T02:30:57.330Z'),
  ('6ab4512cb6c296969672f8ea', '6a98f274b437ec02a10288fd', 'activo', 15, NULL, NULL, 'Compra de Cartera de 2024 - Saldo inicial', 21000000, 12697597, 0, '2026-08-31', '2027-08-31', 0.0164, 0.06, 'Finalización de cartera', '6ab4512cf2303c77c6e1dda5', 0, '2026-08-31T00:00:00.000Z', '2026-09-24T01:54:15.969Z'),
  ('emp_cli_6a98f53b4a3fa86e738b539e', '6a98f53b4a3fa86e738b539e', 'activo', 15, '6a990493deb0075f5f3a0be5', NULL, 'Saldo inicial extractos a corte 31 de agosto', 49800000, 12022848, 12022848, '2026-08-31', '2027-08-31', 0.03, 0.06, 'Manejo integral de cupos y optimización bancaria', '6ab5517644e9559cacbe8462', 0, '2026-08-31T00:00:00.000Z', '2026-08-31T00:00:00.000Z'),
  ('emp_cli_6a98f4b92ead03ed4ffe5eb6', '6a98f4b92ead03ed4ffe5eb6', 'activo', 15, '6a99078e3757950369fccb0c', NULL, 'Saldo inicial extractos a corte 31 de agosto', 31650000, 7487057, 7487057, '2026-08-31', '2027-08-31', 0.03, 0.06, 'Restructuración y desendeudamiento progresivo', '6ab5518f760ced0285bdb919', 0, '2026-08-31T00:00:00.000Z', '2026-08-31T00:00:00.000Z'),
  ('emp_cli_6a98f44b9b09c658c8ff8f87', '6a98f44b9b09c658c8ff8f87', 'activo', 25, '6ab18f8c1f4d93954a25c2a9', NULL, 'Saldo inicial extractos a corte 31 de agosto', 5300000, 1285589, 1285589, '2026-08-31', '2027-08-31', 0.03, 0.06, 'Consolidación de pasivos y cupo comercial', '6ab551ab107af9dce178b9ae', 0, '2026-08-31T00:00:00.000Z', '2026-08-31T00:00:00.000Z'),
  ('emp_cli_6a98f3f2b2ab7e8afdf8ec95', '6a98f3f2b2ab7e8afdf8ec95', 'activo', 15, '6a990712a18dfd7c0f35d860', NULL, 'Saldo inicial extractos a corte 31 de agosto', 23050000, 2213786, 2213786, '2026-08-31', '2027-08-31', 0.03, 0.06, 'Optimización de cupos múltiples y saneamiento', 'gen_1790631442219_sjcdmeg', 0, '2026-08-31T00:00:00.000Z', '2026-08-31T00:00:00.000Z'),
  ('emp_cli_6a98f3cd2f0c74160ca1493c', '6a98f3cd2f0c74160ca1493c', 'activo', 18, '6a990748b570299cdba31290', NULL, 'Saldo inicial extractos a corte 31 de agosto', 21713000, 974593, 974593, '2026-08-31', '2027-08-31', 0.03, 0.06, 'Reorganización de cartera y rotación de cupos', 'gen_1790631709952_eqmqupo', 0, '2026-08-31T00:00:00.000Z', '2026-08-31T00:00:00.000Z'),
  ('emp_cli_6a98f394673a207abc88d40f', '6a98f394673a207abc88d40f', 'activo', 30, '6a9a471df022ce03ca282aeb', NULL, 'Saldo inicial acordado a corte 31 de agosto', 31900000, 5000000, 5000000, '2026-08-31', '2027-08-31', 0.03, 0.06, 'Monitoreo de cupos altos y saneamiento bancario', 'gen_1790635392675_uvjtsx8', 0, '2026-08-31T00:00:00.000Z', '2026-08-31T00:00:00.000Z'),
  ('emp_cli_6a98f3521b828e5d47916bad', '6a98f3521b828e5d47916bad', 'activo', 15, '6a9904f8d5342ec4d0a6662f', NULL, 'Saldo inicial a corte 31 de agosto', 5000000, 3500000, 3500000, '2026-08-31', '2027-08-31', 0.03, 0.06, 'Asesoría financiera y reestructuración', '6abbc7e188bc3170915abeb5', 0, '2026-08-31T00:00:00.000Z', '2026-08-31T00:00:00.000Z'),
  ('emp_cli_6a98f30767b838abe34d9d46', '6a98f30767b838abe34d9d46', 'activo', 15, NULL, NULL, 'Saldo inicial a corte 31 de agosto', 7000000, 4200000, 4200000, '2026-08-31', '2027-08-31', 0.03, 0.06, 'Recuperación de historial y saneamiento de TDC', '6abbc87662346b9edb8432c7', 0, '2026-08-31T00:00:00.000Z', '2026-08-31T00:00:00.000Z')
ON CONFLICT (id) DO UPDATE SET saldo_deuda = EXCLUDED.saldo_deuda, updated_date = EXCLUDED.updated_date;

-- No hay créditos iniciales cargados

-- Inserción de Abonos Septiembre 2026
INSERT INTO public."emprendamos_abono" ("id", "valor_total", "fecha", "tipo", "cda_id", "notas", "subcuenta_ingreso", "detalles", "comprobante_id", "cliente_id", "producto_credito_id", "emprendamos_cliente_id", "created_date", "updated_date")
VALUES
  ('6ab551aceffd1905f76883db', 2980914, '2026-09-14', 'otro', NULL, NULL, '21100308', '[{"valor_aplicado":2980914,"capital":2980914,"credito_id":"6ab550d83bdd3b104bef5112","intereses":0}]'::jsonb, '6ab551ab107af9dce178b9ae', '6a98f370e7ff24e87b272441', '6a99a49712e11ee68987d163', '6ab550d85b7aefb6faf464c2', '2026-09-24T16:37:00.344Z', '2026-09-24T16:37:00.344Z'),
  ('6ab5519045ec1d78655df42c', 5105639, '2026-09-14', 'otro', NULL, NULL, '21101202', '[{"valor_aplicado":5105639,"capital":5105639,"credito_id":"6ab550d83bdd3b104bef5112","intereses":0}]'::jsonb, '6ab5518f760ced0285bdb919', '6a98f370e7ff24e87b272441', '6a99b48ef15d8c8d294f2fc9', '6ab550d85b7aefb6faf464c2', '2026-09-24T16:36:32.329Z', '2026-09-24T16:36:32.329Z'),
  ('6ab551771de3115aa03c5461', 6019425, '2026-09-14', 'otro', NULL, NULL, '21100215', '[{"valor_aplicado":6019425,"capital":6019425,"credito_id":"6ab550d83bdd3b104bef5112","intereses":0}]'::jsonb, '6ab5517644e9559cacbe8462', '6a98f370e7ff24e87b272441', '6a99b3416822a59d5d49510c', '6ab550d85b7aefb6faf464c2', '2026-09-24T16:36:07.217Z', '2026-09-24T16:36:07.217Z'),
  ('6ab482c7f2a9a042667d1e2e', 12097597, '2026-09-11', 'total', NULL, NULL, '130509', '[{"valor_aplicado":12097597,"capital":12097597,"credito_id":"6ab4512dcd0202cf44e6aeaf","intereses":0}]'::jsonb, '6ab482c7ca8d446dd9b342d1', '6a98f274b437ec02a10288fd', NULL, '6ab4512cb6c296969672f8ea', '2026-09-24T01:54:15.812Z', '2026-09-24T01:54:15.812Z'),
  ('6ab4824c94ae2e9313a7d9b2', 600000, '2026-09-01', 'otro', '6a9904f8d5342ec4d0a6662f', NULL, '11100104', '[{"valor_aplicado":600000,"capital":600000,"credito_id":"6ab4512dcd0202cf44e6aeaf","intereses":0}]'::jsonb, '6ab4824b40437c1cb7530b6e', '6a98f274b437ec02a10288fd', NULL, '6ab4512cb6c296969672f8ea', '2026-09-24T01:52:12.293Z', '2026-09-24T01:52:12.293Z')
ON CONFLICT (id) DO UPDATE SET updated_date = EXCLUDED.updated_date;

-- ====================================================================
-- COMPATIBILIDAD DE COLUMNAS (Asegurar created_date y created_at)
-- ====================================================================
DO $$
BEGIN
  -- emprendamos_cliente
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_cliente' AND column_name='created_date') THEN
    ALTER TABLE public."emprendamos_cliente" ADD COLUMN "created_date" TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_cliente' AND column_name='created_at') THEN
    ALTER TABLE public."emprendamos_cliente" ADD COLUMN "created_at" TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_cliente' AND column_name='updated_date') THEN
    ALTER TABLE public."emprendamos_cliente" ADD COLUMN "updated_date" TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
  END IF;

  -- emprendamos_credito
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_credito' AND column_name='created_date') THEN
    ALTER TABLE public."emprendamos_credito" ADD COLUMN "created_date" TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_credito' AND column_name='created_at') THEN
    ALTER TABLE public."emprendamos_credito" ADD COLUMN "created_at" TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_credito' AND column_name='updated_date') THEN
    ALTER TABLE public."emprendamos_credito" ADD COLUMN "updated_date" TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
  END IF;

  -- emprendamos_abono
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_abono' AND column_name='created_date') THEN
    ALTER TABLE public."emprendamos_abono" ADD COLUMN "created_date" TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_abono' AND column_name='created_at') THEN
    ALTER TABLE public."emprendamos_abono" ADD COLUMN "created_at" TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_abono' AND column_name='updated_date') THEN
    ALTER TABLE public."emprendamos_abono" ADD COLUMN "updated_date" TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
  END IF;

  -- emprendamos_interes
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_interes' AND column_name='created_date') THEN
    ALTER TABLE public."emprendamos_interes" ADD COLUMN "created_date" TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_interes' AND column_name='created_at') THEN
    ALTER TABLE public."emprendamos_interes" ADD COLUMN "created_at" TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_interes' AND column_name='updated_date') THEN
    ALTER TABLE public."emprendamos_interes" ADD COLUMN "updated_date" TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
  END IF;
END $$;
