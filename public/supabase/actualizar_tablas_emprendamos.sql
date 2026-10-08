-- ====================================================================
-- ACTUALIZACIÓN Y COMPATIBILIDAD TOTAL DE TABLAS EMPRENDAMOS EN SUPABASE
-- Ejecutar en el SQL Editor de Supabase (SQL Editor -> New Query -> Run)
-- ====================================================================

-- 1. Tabla: emprendamos_cliente
CREATE TABLE IF NOT EXISTS public."emprendamos_cliente" (
  id TEXT PRIMARY KEY,
  created_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  updated_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  estado TEXT DEFAULT 'activo'
);

ALTER TABLE public."emprendamos_cliente" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all on emprendamos_cliente" ON public."emprendamos_cliente";
CREATE POLICY "Allow anon all on emprendamos_cliente" ON public."emprendamos_cliente" 
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DO $$
BEGIN
  ALTER TABLE public."emprendamos_cliente" ALTER COLUMN "nombre" DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_cliente' AND column_name='created_date') THEN
    ALTER TABLE public."emprendamos_cliente" ADD COLUMN "created_date" TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_cliente' AND column_name='created_at') THEN
    ALTER TABLE public."emprendamos_cliente" ADD COLUMN "created_at" TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_cliente' AND column_name='updated_date') THEN
    ALTER TABLE public."emprendamos_cliente" ADD COLUMN "updated_date" TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_cliente' AND column_name='updated_at') THEN
    ALTER TABLE public."emprendamos_cliente" ADD COLUMN "updated_at" TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_cliente' AND column_name='cliente_id') THEN
    ALTER TABLE public."emprendamos_cliente" ADD COLUMN "cliente_id" TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_cliente' AND column_name='fecha_ingreso') THEN
    ALTER TABLE public."emprendamos_cliente" ADD COLUMN "fecha_ingreso" TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_cliente' AND column_name='dia_pago') THEN
    ALTER TABLE public."emprendamos_cliente" ADD COLUMN "dia_pago" NUMERIC DEFAULT 15;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_cliente' AND column_name='tasa_acordada') THEN
    ALTER TABLE public."emprendamos_cliente" ADD COLUMN "tasa_acordada" NUMERIC DEFAULT 0.03;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_cliente' AND column_name='tasa_extracupo') THEN
    ALTER TABLE public."emprendamos_cliente" ADD COLUMN "tasa_extracupo" NUMERIC DEFAULT 0.06;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_cliente' AND column_name='capital_inicial') THEN
    ALTER TABLE public."emprendamos_cliente" ADD COLUMN "capital_inicial" NUMERIC DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_cliente' AND column_name='saldo_deuda') THEN
    ALTER TABLE public."emprendamos_cliente" ADD COLUMN "saldo_deuda" NUMERIC DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_cliente' AND column_name='cupo_asignado') THEN
    ALTER TABLE public."emprendamos_cliente" ADD COLUMN "cupo_asignado" NUMERIC DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_cliente' AND column_name='extracupo_autorizado') THEN
    ALTER TABLE public."emprendamos_cliente" ADD COLUMN "extracupo_autorizado" NUMERIC DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_cliente' AND column_name='cda_apoderada_id') THEN
    ALTER TABLE public."emprendamos_cliente" ADD COLUMN "cda_apoderada_id" TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_cliente' AND column_name='comprobante_cartera_id') THEN
    ALTER TABLE public."emprendamos_cliente" ADD COLUMN "comprobante_cartera_id" TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_cliente' AND column_name='plan_trazado') THEN
    ALTER TABLE public."emprendamos_cliente" ADD COLUMN "plan_trazado" TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_cliente' AND column_name='contrato_url') THEN
    ALTER TABLE public."emprendamos_cliente" ADD COLUMN "contrato_url" TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_cliente' AND column_name='fecha_eligible_salida') THEN
    ALTER TABLE public."emprendamos_cliente" ADD COLUMN "fecha_eligible_salida" TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_cliente' AND column_name='fecha_salida') THEN
    ALTER TABLE public."emprendamos_cliente" ADD COLUMN "fecha_salida" TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_cliente' AND column_name='notas') THEN
    ALTER TABLE public."emprendamos_cliente" ADD COLUMN "notas" TEXT;
  END IF;
END $$;

-- 2. Tabla: emprendamos_credito
CREATE TABLE IF NOT EXISTS public."emprendamos_credito" (
  id TEXT PRIMARY KEY,
  created_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  updated_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  estado TEXT DEFAULT 'vigente'
);

ALTER TABLE public."emprendamos_credito" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all on emprendamos_credito" ON public."emprendamos_credito";
CREATE POLICY "Allow anon all on emprendamos_credito" ON public."emprendamos_credito" 
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_credito' AND column_name='created_date') THEN
    ALTER TABLE public."emprendamos_credito" ADD COLUMN "created_date" TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_credito' AND column_name='created_at') THEN
    ALTER TABLE public."emprendamos_credito" ADD COLUMN "created_at" TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_credito' AND column_name='updated_date') THEN
    ALTER TABLE public."emprendamos_credito" ADD COLUMN "updated_date" TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_credito' AND column_name='updated_at') THEN
    ALTER TABLE public."emprendamos_credito" ADD COLUMN "updated_at" TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_credito' AND column_name='emprendamos_cliente_id') THEN
    ALTER TABLE public."emprendamos_credito" ADD COLUMN "emprendamos_cliente_id" TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_credito' AND column_name='cliente_id') THEN
    ALTER TABLE public."emprendamos_credito" ADD COLUMN "cliente_id" TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_credito' AND column_name='codigo') THEN
    ALTER TABLE public."emprendamos_credito" ADD COLUMN "codigo" TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_credito' AND column_name='tipo') THEN
    ALTER TABLE public."emprendamos_credito" ADD COLUMN "tipo" TEXT DEFAULT 'habitual';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_credito' AND column_name='concepto') THEN
    ALTER TABLE public."emprendamos_credito" ADD COLUMN "concepto" TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_credito' AND column_name='capital') THEN
    ALTER TABLE public."emprendamos_credito" ADD COLUMN "capital" NUMERIC DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_credito' AND column_name='tasa_nominal') THEN
    ALTER TABLE public."emprendamos_credito" ADD COLUMN "tasa_nominal" NUMERIC DEFAULT 0.03;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_credito' AND column_name='cuota_fija') THEN
    ALTER TABLE public."emprendamos_credito" ADD COLUMN "cuota_fija" NUMERIC DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_credito' AND column_name='fecha') THEN
    ALTER TABLE public."emprendamos_credito" ADD COLUMN "fecha" TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_credito' AND column_name='dia_pago') THEN
    ALTER TABLE public."emprendamos_credito" ADD COLUMN "dia_pago" NUMERIC DEFAULT 15;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_credito' AND column_name='fecha_proximo_pago') THEN
    ALTER TABLE public."emprendamos_credito" ADD COLUMN "fecha_proximo_pago" TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_credito' AND column_name='saldo_capital') THEN
    ALTER TABLE public."emprendamos_credito" ADD COLUMN "saldo_capital" NUMERIC DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_credito' AND column_name='saldo_intereses') THEN
    ALTER TABLE public."emprendamos_credito" ADD COLUMN "saldo_intereses" NUMERIC DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_credito' AND column_name='comprobante_id') THEN
    ALTER TABLE public."emprendamos_credito" ADD COLUMN "comprobante_id" TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_credito' AND column_name='producto_credito_id') THEN
    ALTER TABLE public."emprendamos_credito" ADD COLUMN "producto_credito_id" TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_credito' AND column_name='notas') THEN
    ALTER TABLE public."emprendamos_credito" ADD COLUMN "notas" TEXT;
  END IF;
END $$;

-- 3. Tabla: emprendamos_abono
CREATE TABLE IF NOT EXISTS public."emprendamos_abono" (
  id TEXT PRIMARY KEY,
  created_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  updated_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public."emprendamos_abono" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all on emprendamos_abono" ON public."emprendamos_abono";
CREATE POLICY "Allow anon all on emprendamos_abono" ON public."emprendamos_abono" 
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DO $$
BEGIN
  ALTER TABLE public."emprendamos_abono" ALTER COLUMN "monto" DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_abono' AND column_name='created_date') THEN
    ALTER TABLE public."emprendamos_abono" ADD COLUMN "created_date" TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_abono' AND column_name='created_at') THEN
    ALTER TABLE public."emprendamos_abono" ADD COLUMN "created_at" TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_abono' AND column_name='updated_date') THEN
    ALTER TABLE public."emprendamos_abono" ADD COLUMN "updated_date" TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_abono' AND column_name='updated_at') THEN
    ALTER TABLE public."emprendamos_abono" ADD COLUMN "updated_at" TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_abono' AND column_name='valor_total') THEN
    ALTER TABLE public."emprendamos_abono" ADD COLUMN "valor_total" NUMERIC DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_abono' AND column_name='fecha') THEN
    ALTER TABLE public."emprendamos_abono" ADD COLUMN "fecha" TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_abono' AND column_name='tipo') THEN
    ALTER TABLE public."emprendamos_abono" ADD COLUMN "tipo" TEXT DEFAULT 'capital';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_abono' AND column_name='cda_id') THEN
    ALTER TABLE public."emprendamos_abono" ADD COLUMN "cda_id" TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_abono' AND column_name='notas') THEN
    ALTER TABLE public."emprendamos_abono" ADD COLUMN "notas" TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_abono' AND column_name='subcuenta_ingreso') THEN
    ALTER TABLE public."emprendamos_abono" ADD COLUMN "subcuenta_ingreso" TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_abono' AND column_name='detalles') THEN
    ALTER TABLE public."emprendamos_abono" ADD COLUMN "detalles" JSONB DEFAULT '[]'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_abono' AND column_name='comprobante_id') THEN
    ALTER TABLE public."emprendamos_abono" ADD COLUMN "comprobante_id" TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_abono' AND column_name='cliente_id') THEN
    ALTER TABLE public."emprendamos_abono" ADD COLUMN "cliente_id" TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_abono' AND column_name='producto_credito_id') THEN
    ALTER TABLE public."emprendamos_abono" ADD COLUMN "producto_credito_id" TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emprendamos_abono' AND column_name='emprendamos_cliente_id') THEN
    ALTER TABLE public."emprendamos_abono" ADD COLUMN "emprendamos_cliente_id" TEXT;
  END IF;
END $$;

-- 4. Tabla: emprendamos_interes
CREATE TABLE IF NOT EXISTS public."emprendamos_interes" (
  id TEXT PRIMARY KEY,
  created_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  updated_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  is_sample BOOLEAN DEFAULT false,
  "emprendamos_cliente_id" TEXT,
  "cliente_id" TEXT,
  "credito_id" TEXT,
  "periodo" TEXT,
  "capital_base" NUMERIC DEFAULT 0,
  "tasa" NUMERIC DEFAULT 0.03,
  "intereses" NUMERIC DEFAULT 0,
  "comprobante_id" TEXT,
  "estado" TEXT DEFAULT 'generado',
  "fecha" TEXT
);

ALTER TABLE public."emprendamos_interes" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all on emprendamos_interes" ON public."emprendamos_interes";
CREATE POLICY "Allow anon all on emprendamos_interes" ON public."emprendamos_interes" 
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 5. Tabla: emprendamos_producto (para registro histórico de comisiones de tarjetas y productos)
CREATE TABLE IF NOT EXISTS public."emprendamos_producto" (
  id TEXT PRIMARY KEY,
  created_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  updated_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  "cliente_id" TEXT,
  "tipo_producto" TEXT,
  "nombre" TEXT,
  "banco" TEXT,
  "cupo" NUMERIC DEFAULT 0,
  "porcentaje_comision" NUMERIC DEFAULT 10,
  "monto_comision" NUMERIC DEFAULT 0,
  "credito_cargado_id" TEXT,
  "fecha_registro" TEXT,
  "estado" TEXT DEFAULT 'activo'
);

ALTER TABLE public."emprendamos_producto" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all on emprendamos_producto" ON public."emprendamos_producto";
CREATE POLICY "Allow anon all on emprendamos_producto" ON public."emprendamos_producto" 
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Sincronizar datos entre columnas equivalentes si ya existen filas
DO $$
BEGIN
  UPDATE public."emprendamos_cliente"
  SET 
    cupo_asignado = COALESCE(cupo_asignado, cupo_total, 0),
    saldo_deuda = COALESCE(saldo_deuda, cupo_disponible, 0),
    capital_inicial = COALESCE(capital_inicial, cupo_total, 0);

  UPDATE public."emprendamos_credito"
  SET 
    capital = COALESCE(capital, monto_inicial, 0),
    saldo_capital = COALESCE(saldo_capital, saldo_actual, monto_inicial, 0),
    tasa_nominal = COALESCE(tasa_nominal, tasa_interes, 0.03),
    fecha = COALESCE(fecha, fecha_inicio, '');

  UPDATE public."emprendamos_abono"
  SET 
    valor_total = COALESCE(valor_total, monto, 0),
    monto = COALESCE(monto, valor_total, 0),
    cda_id = COALESCE(cda_id, cuenta_id, ''),
    tipo = COALESCE(tipo, tipo_abono, 'capital');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
