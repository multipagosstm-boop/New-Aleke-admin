-- =========================================================
-- Supabase Schema for Aleke Admin System
-- Execute this in Supabase SQL Editor
-- =========================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table: abono_prestamo (AbonoPrestamo)
CREATE TABLE IF NOT EXISTS public."abono_prestamo" (
  id TEXT PRIMARY KEY,
  created_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  updated_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  created_by_id TEXT,
  is_sample BOOLEAN DEFAULT false,
  "cliente_id" TEXT,
  "fecha" TEXT,
  "valor_total" NUMERIC,
  "comprobante_id" TEXT,
  "subcuenta_ingreso" TEXT,
  "cda_id" TEXT,
  "detalles" JSONB DEFAULT '[]'::jsonb,
  "notas" TEXT
);
ALTER TABLE public."abono_prestamo" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all on abono_prestamo" ON public."abono_prestamo";
CREATE POLICY "Allow anon all on abono_prestamo" ON public."abono_prestamo" FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_abono_prestamo_cliente_id ON public."abono_prestamo" ("cliente_id");
CREATE INDEX IF NOT EXISTS idx_abono_prestamo_fecha ON public."abono_prestamo" ("fecha");
CREATE INDEX IF NOT EXISTS idx_abono_prestamo_comprobante_id ON public."abono_prestamo" ("comprobante_id");
CREATE INDEX IF NOT EXISTS idx_abono_prestamo_cda_id ON public."abono_prestamo" ("cda_id");


-- Table: cliente (Cliente)
CREATE TABLE IF NOT EXISTS public."cliente" (
  id TEXT PRIMARY KEY,
  created_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  updated_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  created_by_id TEXT,
  is_sample BOOLEAN DEFAULT false,
  "codigo" TEXT,
  "nombre" TEXT,
  "tipo" TEXT DEFAULT 'persona',
  "cedula" TEXT,
  "telefono" TEXT,
  "correo" TEXT,
  "direccion" TEXT,
  "ocupacion" TEXT,
  "lugar_trabajo" TEXT,
  "referido_por" TEXT,
  "estado" TEXT DEFAULT 'activo',
  "cda_asignada_id" TEXT,
  "lineas_negocio" JSONB DEFAULT '[]'::jsonb,
  "notas" TEXT
);
ALTER TABLE public."cliente" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all on cliente" ON public."cliente";
CREATE POLICY "Allow anon all on cliente" ON public."cliente" FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_cliente_codigo ON public."cliente" ("codigo");
CREATE INDEX IF NOT EXISTS idx_cliente_estado ON public."cliente" ("estado");
CREATE INDEX IF NOT EXISTS idx_cliente_cda_asignada_id ON public."cliente" ("cda_asignada_id");


-- Table: comprobante_contable (ComprobanteContable)
CREATE TABLE IF NOT EXISTS public."comprobante_contable" (
  id TEXT PRIMARY KEY,
  created_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  updated_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  created_by_id TEXT,
  is_sample BOOLEAN DEFAULT false,
  "numero" TEXT,
  "tipo" TEXT DEFAULT 'diario',
  "fecha" TEXT,
  "fecha_registro" TEXT,
  "descripcion" TEXT,
  "estado" TEXT DEFAULT 'contabilizado',
  "total_debito" NUMERIC DEFAULT 0,
  "total_credito" NUMERIC DEFAULT 0,
  "created_by_email" TEXT,
  "anulado_por_email" TEXT,
  "anulado_at" TEXT,
  "motivo_anulacion" TEXT,
  "comprobante_origen_id" TEXT
);
ALTER TABLE public."comprobante_contable" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all on comprobante_contable" ON public."comprobante_contable";
CREATE POLICY "Allow anon all on comprobante_contable" ON public."comprobante_contable" FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_comprobante_contable_fecha ON public."comprobante_contable" ("fecha");
CREATE INDEX IF NOT EXISTS idx_comprobante_contable_estado ON public."comprobante_contable" ("estado");
CREATE INDEX IF NOT EXISTS idx_comprobante_contable_comprobante_origen_id ON public."comprobante_contable" ("comprobante_origen_id");


-- Table: configuracion (Configuracion)
CREATE TABLE IF NOT EXISTS public."configuracion" (
  id TEXT PRIMARY KEY,
  created_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  updated_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  created_by_id TEXT,
  is_sample BOOLEAN DEFAULT false,
  "gmf_limite" NUMERIC DEFAULT 18331000,
  "gmf_año" NUMERIC DEFAULT 2026,
  "config_pin_hash" TEXT,
  "año_fiscal" NUMERIC DEFAULT 2026
);
ALTER TABLE public."configuracion" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all on configuracion" ON public."configuracion";
CREATE POLICY "Allow anon all on configuracion" ON public."configuracion" FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);


-- Table: consecutivo (Consecutivo)
CREATE TABLE IF NOT EXISTS public."consecutivo" (
  id TEXT PRIMARY KEY,
  created_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  updated_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  created_by_id TEXT,
  is_sample BOOLEAN DEFAULT false,
  "año" NUMERIC,
  "tipo" TEXT DEFAULT 'comprobante',
  "ultimo_numero" NUMERIC DEFAULT 0,
  "ultimo_token" TEXT
);
ALTER TABLE public."consecutivo" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all on consecutivo" ON public."consecutivo";
CREATE POLICY "Allow anon all on consecutivo" ON public."consecutivo" FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);


-- Table: contrato_arriendo (ContratoArriendo)
CREATE TABLE IF NOT EXISTS public."contrato_arriendo" (
  id TEXT PRIMARY KEY,
  created_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  updated_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  created_by_id TEXT,
  is_sample BOOLEAN DEFAULT false,
  "codigo" TEXT,
  "inmueble_id" TEXT,
  "inquilino_id" TEXT,
  "tipo_contrato" TEXT,
  "fecha_inicio" TEXT,
  "fecha_fin" TEXT,
  "duracion_meses" NUMERIC DEFAULT 6,
  "valor_arriendo" NUMERIC,
  "valor_deposito" NUMERIC,
  "estado" TEXT DEFAULT 'vigente',
  "deposito_pagado" BOOLEAN DEFAULT false,
  "comprobante_deposito_id" TEXT,
  "documento_pdf_url" TEXT,
  "email_enviado" BOOLEAN DEFAULT false,
  "alertas_enviadas" NUMERIC DEFAULT 0,
  "notas" TEXT
);
ALTER TABLE public."contrato_arriendo" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all on contrato_arriendo" ON public."contrato_arriendo";
CREATE POLICY "Allow anon all on contrato_arriendo" ON public."contrato_arriendo" FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_contrato_arriendo_codigo ON public."contrato_arriendo" ("codigo");
CREATE INDEX IF NOT EXISTS idx_contrato_arriendo_inmueble_id ON public."contrato_arriendo" ("inmueble_id");
CREATE INDEX IF NOT EXISTS idx_contrato_arriendo_inquilino_id ON public."contrato_arriendo" ("inquilino_id");
CREATE INDEX IF NOT EXISTS idx_contrato_arriendo_estado ON public."contrato_arriendo" ("estado");
CREATE INDEX IF NOT EXISTS idx_contrato_arriendo_comprobante_deposito_id ON public."contrato_arriendo" ("comprobante_deposito_id");


-- Table: cuenta (Cuenta)
CREATE TABLE IF NOT EXISTS public."cuenta" (
  id TEXT PRIMARY KEY,
  created_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  updated_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  created_by_id TEXT,
  is_sample BOOLEAN DEFAULT false,
  "codigo" NUMERIC,
  "nivel" TEXT,
  "clase" NUMERIC,
  "clase_nombre" TEXT,
  "grupo" NUMERIC,
  "cuenta" NUMERIC,
  "subcuenta" NUMERIC,
  "auxiliar" NUMERIC,
  "concepto" TEXT,
  "naturaleza" TEXT,
  "tipo_estado" TEXT,
  "es_transaccional" BOOLEAN DEFAULT false
);
ALTER TABLE public."cuenta" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all on cuenta" ON public."cuenta";
CREATE POLICY "Allow anon all on cuenta" ON public."cuenta" FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_cuenta_codigo ON public."cuenta" ("codigo");


-- Table: cuenta_ahorro (CuentaAhorro)
CREATE TABLE IF NOT EXISTS public."cuenta_ahorro" (
  id TEXT PRIMARY KEY,
  created_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  updated_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  created_by_id TEXT,
  is_sample BOOLEAN DEFAULT false,
  "nombre" TEXT,
  "numero_completo" TEXT,
  "banco" TEXT,
  "subcuenta_puc" TEXT,
  "titular_id" TEXT,
  "saldo" NUMERIC DEFAULT 0,
  "estado" TEXT DEFAULT 'activa',
  "movimientos_mes_acumulado" NUMERIC DEFAULT 0,
  "nota" TEXT
);
ALTER TABLE public."cuenta_ahorro" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all on cuenta_ahorro" ON public."cuenta_ahorro";
CREATE POLICY "Allow anon all on cuenta_ahorro" ON public."cuenta_ahorro" FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_cuenta_ahorro_titular_id ON public."cuenta_ahorro" ("titular_id");
CREATE INDEX IF NOT EXISTS idx_cuenta_ahorro_estado ON public."cuenta_ahorro" ("estado");


-- Table: cuota_amortizacion (CuotaAmortizacion)
CREATE TABLE IF NOT EXISTS public."cuota_amortizacion" (
  id TEXT PRIMARY KEY,
  created_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  updated_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  created_by_id TEXT,
  is_sample BOOLEAN DEFAULT false,
  "prestamo_id" TEXT,
  "numero" NUMERIC,
  "fecha_vencimiento" TEXT,
  "cuota" NUMERIC,
  "interes" NUMERIC,
  "capital_abono" NUMERIC,
  "saldo_capital" NUMERIC,
  "estado" TEXT DEFAULT 'pendiente',
  "valor_pagado" NUMERIC DEFAULT 0,
  "fecha_pago" TEXT,
  "abono_id" TEXT
);
ALTER TABLE public."cuota_amortizacion" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all on cuota_amortizacion" ON public."cuota_amortizacion";
CREATE POLICY "Allow anon all on cuota_amortizacion" ON public."cuota_amortizacion" FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_cuota_amortizacion_prestamo_id ON public."cuota_amortizacion" ("prestamo_id");
CREATE INDEX IF NOT EXISTS idx_cuota_amortizacion_estado ON public."cuota_amortizacion" ("estado");
CREATE INDEX IF NOT EXISTS idx_cuota_amortizacion_abono_id ON public."cuota_amortizacion" ("abono_id");


-- Table: emprendamos_abono (EmprendamosAbono)
CREATE TABLE IF NOT EXISTS public."emprendamos_abono" (
  id TEXT PRIMARY KEY,
  created_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  updated_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  created_by_id TEXT,
  is_sample BOOLEAN DEFAULT false,
  "cliente_id" TEXT,
  "emprendamos_cliente_id" TEXT,
  "fecha" TEXT,
  "valor_total" NUMERIC,
  "tipo" TEXT DEFAULT 'otro',
  "comprobante_id" TEXT,
  "subcuenta_ingreso" TEXT,
  "cda_id" TEXT,
  "producto_credito_id" TEXT,
  "detalles" JSONB DEFAULT '[]'::jsonb,
  "notas" TEXT
);
ALTER TABLE public."emprendamos_abono" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all on emprendamos_abono" ON public."emprendamos_abono";
CREATE POLICY "Allow anon all on emprendamos_abono" ON public."emprendamos_abono" FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_emprendamos_abono_cliente_id ON public."emprendamos_abono" ("cliente_id");
CREATE INDEX IF NOT EXISTS idx_emprendamos_abono_emprendamos_cliente_id ON public."emprendamos_abono" ("emprendamos_cliente_id");
CREATE INDEX IF NOT EXISTS idx_emprendamos_abono_fecha ON public."emprendamos_abono" ("fecha");
CREATE INDEX IF NOT EXISTS idx_emprendamos_abono_comprobante_id ON public."emprendamos_abono" ("comprobante_id");
CREATE INDEX IF NOT EXISTS idx_emprendamos_abono_cda_id ON public."emprendamos_abono" ("cda_id");
CREATE INDEX IF NOT EXISTS idx_emprendamos_abono_producto_credito_id ON public."emprendamos_abono" ("producto_credito_id");


-- Table: emprendamos_cliente (EmprendamosCliente)
CREATE TABLE IF NOT EXISTS public."emprendamos_cliente" (
  id TEXT PRIMARY KEY,
  created_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  updated_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  created_by_id TEXT,
  is_sample BOOLEAN DEFAULT false,
  "cliente_id" TEXT,
  "fecha_ingreso" TEXT,
  "dia_pago" NUMERIC,
  "tasa_acordada" NUMERIC,
  "tasa_extracupo" NUMERIC DEFAULT 0.06,
  "capital_inicial" NUMERIC DEFAULT 0,
  "saldo_deuda" NUMERIC DEFAULT 0,
  "cupo_asignado" NUMERIC DEFAULT 0,
  "extracupo_autorizado" NUMERIC DEFAULT 0,
  "cda_apoderada_id" TEXT,
  "comprobante_cartera_id" TEXT,
  "plan_trazado" TEXT,
  "contrato_url" TEXT,
  "fecha_eligible_salida" TEXT,
  "fecha_salida" TEXT,
  "estado" TEXT DEFAULT 'activo',
  "notas" TEXT
);
ALTER TABLE public."emprendamos_cliente" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all on emprendamos_cliente" ON public."emprendamos_cliente";
CREATE POLICY "Allow anon all on emprendamos_cliente" ON public."emprendamos_cliente" FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_emprendamos_cliente_cliente_id ON public."emprendamos_cliente" ("cliente_id");
CREATE INDEX IF NOT EXISTS idx_emprendamos_cliente_cda_apoderada_id ON public."emprendamos_cliente" ("cda_apoderada_id");
CREATE INDEX IF NOT EXISTS idx_emprendamos_cliente_comprobante_cartera_id ON public."emprendamos_cliente" ("comprobante_cartera_id");
CREATE INDEX IF NOT EXISTS idx_emprendamos_cliente_estado ON public."emprendamos_cliente" ("estado");


-- Table: emprendamos_credito (EmprendamosCredito)
CREATE TABLE IF NOT EXISTS public."emprendamos_credito" (
  id TEXT PRIMARY KEY,
  created_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  updated_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  created_by_id TEXT,
  is_sample BOOLEAN DEFAULT false,
  "emprendamos_cliente_id" TEXT,
  "cliente_id" TEXT,
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
  "comprobante_id" TEXT,
  "producto_credito_id" TEXT,
  "notas" TEXT
);
ALTER TABLE public."emprendamos_credito" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all on emprendamos_credito" ON public."emprendamos_credito";
CREATE POLICY "Allow anon all on emprendamos_credito" ON public."emprendamos_credito" FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_emprendamos_credito_emprendamos_cliente_id ON public."emprendamos_credito" ("emprendamos_cliente_id");
CREATE INDEX IF NOT EXISTS idx_emprendamos_credito_cliente_id ON public."emprendamos_credito" ("cliente_id");
CREATE INDEX IF NOT EXISTS idx_emprendamos_credito_codigo ON public."emprendamos_credito" ("codigo");
CREATE INDEX IF NOT EXISTS idx_emprendamos_credito_fecha ON public."emprendamos_credito" ("fecha");
CREATE INDEX IF NOT EXISTS idx_emprendamos_credito_estado ON public."emprendamos_credito" ("estado");
CREATE INDEX IF NOT EXISTS idx_emprendamos_credito_comprobante_id ON public."emprendamos_credito" ("comprobante_id");
CREATE INDEX IF NOT EXISTS idx_emprendamos_credito_producto_credito_id ON public."emprendamos_credito" ("producto_credito_id");


-- Table: emprendamos_interes (EmprendamosInteres)
CREATE TABLE IF NOT EXISTS public."emprendamos_interes" (
  id TEXT PRIMARY KEY,
  created_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  updated_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  created_by_id TEXT,
  is_sample BOOLEAN DEFAULT false,
  "emprendamos_cliente_id" TEXT,
  "cliente_id" TEXT,
  "credito_id" TEXT,
  "periodo" TEXT,
  "capital_base" NUMERIC,
  "tasa" NUMERIC,
  "intereses" NUMERIC,
  "comprobante_id" TEXT,
  "estado" TEXT DEFAULT 'generado',
  "fecha" TEXT
);
ALTER TABLE public."emprendamos_interes" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all on emprendamos_interes" ON public."emprendamos_interes";
CREATE POLICY "Allow anon all on emprendamos_interes" ON public."emprendamos_interes" FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_emprendamos_interes_emprendamos_cliente_id ON public."emprendamos_interes" ("emprendamos_cliente_id");
CREATE INDEX IF NOT EXISTS idx_emprendamos_interes_cliente_id ON public."emprendamos_interes" ("cliente_id");
CREATE INDEX IF NOT EXISTS idx_emprendamos_interes_credito_id ON public."emprendamos_interes" ("credito_id");
CREATE INDEX IF NOT EXISTS idx_emprendamos_interes_comprobante_id ON public."emprendamos_interes" ("comprobante_id");
CREATE INDEX IF NOT EXISTS idx_emprendamos_interes_estado ON public."emprendamos_interes" ("estado");
CREATE INDEX IF NOT EXISTS idx_emprendamos_interes_fecha ON public."emprendamos_interes" ("fecha");


-- Table: extracto_producto (ExtractoProducto)
CREATE TABLE IF NOT EXISTS public."extracto_producto" (
  id TEXT PRIMARY KEY,
  created_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  updated_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  created_by_id TEXT,
  is_sample BOOLEAN DEFAULT false,
  "producto_id" TEXT,
  "periodo" TEXT,
  "fecha_pago" TEXT,
  "fecha_corte" TEXT,
  "fecha_corte_anterior" TEXT,
  "saldo_a_pagar" NUMERIC DEFAULT 0,
  "saldo_anterior" NUMERIC DEFAULT 0,
  "cuota_manejo" NUMERIC DEFAULT 0,
  "cuota_manejo_fecha" TEXT,
  "seguros" NUMERIC DEFAULT 0,
  "seguros_fecha" TEXT,
  "intereses_corrientes" NUMERIC DEFAULT 0,
  "intereses_corrientes_fecha" TEXT,
  "intereses_mora" NUMERIC DEFAULT 0,
  "intereses_mora_fecha" TEXT,
  "comisiones" NUMERIC DEFAULT 0,
  "comisiones_fecha" TEXT,
  "otros_gastos" NUMERIC DEFAULT 0,
  "otros_gastos_fecha" TEXT,
  "rendimientos" NUMERIC DEFAULT 0,
  "rendimientos_fecha" TEXT,
  "cashback" NUMERIC DEFAULT 0,
  "cashback_fecha" TEXT,
  "observaciones" TEXT,
  "estado" TEXT DEFAULT 'pendiente_registro',
  "motivo_salto" TEXT,
  "comprobante_id" TEXT,
  "total_abonado" NUMERIC DEFAULT 0,
  "saldo_pendiente" NUMERIC DEFAULT 0,
  "porcentaje_pagado" NUMERIC DEFAULT 0,
  "saldo_a_favor" NUMERIC DEFAULT 0,
  "pagado_automaticamente" BOOLEAN DEFAULT false,
  "fecha_pago_efectivo" TEXT,
  "saldo_sistema" NUMERIC DEFAULT 0,
  "diferencia_saldo" NUMERIC DEFAULT 0,
  "estado_conciliacion" TEXT DEFAULT 'sin_iniciar',
  "total_lineas_banco" NUMERIC DEFAULT 0,
  "total_lineas_sistema" NUMERIC DEFAULT 0,
  "lineas_conciliadas" NUMERIC DEFAULT 0,
  "lineas_faltantes" NUMERIC DEFAULT 0,
  "lineas_sobrantes" NUMERIC DEFAULT 0,
  "fecha_conciliacion" TEXT,
  "conciliado_por_email" TEXT
);
ALTER TABLE public."extracto_producto" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all on extracto_producto" ON public."extracto_producto";
CREATE POLICY "Allow anon all on extracto_producto" ON public."extracto_producto" FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_extracto_producto_producto_id ON public."extracto_producto" ("producto_id");
CREATE INDEX IF NOT EXISTS idx_extracto_producto_estado ON public."extracto_producto" ("estado");
CREATE INDEX IF NOT EXISTS idx_extracto_producto_comprobante_id ON public."extracto_producto" ("comprobante_id");


-- Table: historico_contable (HistoricoContable)
CREATE TABLE IF NOT EXISTS public."historico_contable" (
  id TEXT PRIMARY KEY,
  created_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  updated_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  created_by_id TEXT,
  is_sample BOOLEAN DEFAULT false,
  "comprobante_id" TEXT,
  "numero_comprobante" TEXT,
  "accion" TEXT,
  "descripcion" TEXT,
  "monto_total" NUMERIC DEFAULT 0,
  "usuario_email" TEXT,
  "fecha" TEXT,
  "datos_snapshot" TEXT
);
ALTER TABLE public."historico_contable" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all on historico_contable" ON public."historico_contable";
CREATE POLICY "Allow anon all on historico_contable" ON public."historico_contable" FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_historico_contable_comprobante_id ON public."historico_contable" ("comprobante_id");
CREATE INDEX IF NOT EXISTS idx_historico_contable_fecha ON public."historico_contable" ("fecha");


-- Table: inmueble (Inmueble)
CREATE TABLE IF NOT EXISTS public."inmueble" (
  id TEXT PRIMARY KEY,
  created_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  updated_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  created_by_id TEXT,
  is_sample BOOLEAN DEFAULT false,
  "nombre" TEXT,
  "descripcion" TEXT,
  "direccion" TEXT,
  "valor_arriendo" NUMERIC,
  "valor_deposito" NUMERIC,
  "estado" TEXT DEFAULT 'disponible',
  "inquilino_id" TEXT,
  "tipo_propiedad" TEXT DEFAULT 'propio',
  "tipo_contrato" TEXT DEFAULT 'EDIFICIO',
  "notas" TEXT
);
ALTER TABLE public."inmueble" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all on inmueble" ON public."inmueble";
CREATE POLICY "Allow anon all on inmueble" ON public."inmueble" FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_inmueble_estado ON public."inmueble" ("estado");
CREATE INDEX IF NOT EXISTS idx_inmueble_inquilino_id ON public."inmueble" ("inquilino_id");


-- Table: inquilino (Inquilino)
CREATE TABLE IF NOT EXISTS public."inquilino" (
  id TEXT PRIMARY KEY,
  created_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  updated_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  created_by_id TEXT,
  is_sample BOOLEAN DEFAULT false,
  "nombre_completo" TEXT,
  "tipo_documento" TEXT DEFAULT 'CC',
  "numero_documento" TEXT,
  "lugar_expedicion" TEXT,
  "email" TEXT,
  "telefono" TEXT,
  "estado" TEXT DEFAULT 'activo',
  "notas" TEXT
);
ALTER TABLE public."inquilino" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all on inquilino" ON public."inquilino";
CREATE POLICY "Allow anon all on inquilino" ON public."inquilino" FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_inquilino_estado ON public."inquilino" ("estado");


-- Table: linea_extracto (LineaExtracto)
CREATE TABLE IF NOT EXISTS public."linea_extracto" (
  id TEXT PRIMARY KEY,
  created_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  updated_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  created_by_id TEXT,
  is_sample BOOLEAN DEFAULT false,
  "extracto_id" TEXT,
  "producto_id" TEXT,
  "fecha" TEXT,
  "descripcion" TEXT,
  "tipo" TEXT,
  "valor" NUMERIC,
  "naturaleza" TEXT,
  "subcuenta_gasto" TEXT,
  "destino_cargo" TEXT DEFAULT 'gasto',
  "estado_conciliacion" TEXT DEFAULT 'sin_conciliar',
  "movimiento_sistema_id" TEXT,
  "notas" TEXT
);
ALTER TABLE public."linea_extracto" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all on linea_extracto" ON public."linea_extracto";
CREATE POLICY "Allow anon all on linea_extracto" ON public."linea_extracto" FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_linea_extracto_extracto_id ON public."linea_extracto" ("extracto_id");
CREATE INDEX IF NOT EXISTS idx_linea_extracto_producto_id ON public."linea_extracto" ("producto_id");
CREATE INDEX IF NOT EXISTS idx_linea_extracto_fecha ON public."linea_extracto" ("fecha");
CREATE INDEX IF NOT EXISTS idx_linea_extracto_movimiento_sistema_id ON public."linea_extracto" ("movimiento_sistema_id");


-- Table: meta_tarjeta (MetaTarjeta)
CREATE TABLE IF NOT EXISTS public."meta_tarjeta" (
  id TEXT PRIMARY KEY,
  created_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  updated_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  created_by_id TEXT,
  is_sample BOOLEAN DEFAULT false,
  "producto_credito_id" TEXT,
  "codigo_interno" TEXT,
  "nombre_tarjeta" TEXT,
  "banco" TEXT,
  "objetivo_cantidad" NUMERIC DEFAULT 0,
  "objetivo_valor" NUMERIC DEFAULT 0,
  "fecha_inicio" TEXT,
  "fecha_fin" TEXT,
  "estado" TEXT DEFAULT 'activa',
  "nota" TEXT
);
ALTER TABLE public."meta_tarjeta" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all on meta_tarjeta" ON public."meta_tarjeta";
CREATE POLICY "Allow anon all on meta_tarjeta" ON public."meta_tarjeta" FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_meta_tarjeta_producto_credito_id ON public."meta_tarjeta" ("producto_credito_id");
CREATE INDEX IF NOT EXISTS idx_meta_tarjeta_estado ON public."meta_tarjeta" ("estado");


-- Table: movimiento_contable (MovimientoContable)
CREATE TABLE IF NOT EXISTS public."movimiento_contable" (
  id TEXT PRIMARY KEY,
  created_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  updated_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  created_by_id TEXT,
  is_sample BOOLEAN DEFAULT false,
  "comprobante_id" TEXT,
  "clase" TEXT,
  "grupo" TEXT,
  "cuenta" TEXT,
  "subcuenta" TEXT,
  "cuenta_nombre" TEXT,
  "prefijo_cuenta" TEXT,
  "debito" NUMERIC DEFAULT 0,
  "credito" NUMERIC DEFAULT 0,
  "descripcion" TEXT,
  "tercero" TEXT,
  "cliente_id" TEXT,
  "modelo_negocio" TEXT,
  "periodo_operacion" TEXT,
  "periodo_extracto" TEXT,
  "tipo_movimiento_tdc" TEXT,
  "cuenta_ahorro_id" TEXT,
  "producto_credito_id" TEXT,
  "estado" TEXT DEFAULT 'activo',
  "fecha" TEXT,
  "fecha_registro" TEXT,
  "created_by_email" TEXT
);
ALTER TABLE public."movimiento_contable" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all on movimiento_contable" ON public."movimiento_contable";
CREATE POLICY "Allow anon all on movimiento_contable" ON public."movimiento_contable" FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_movimiento_contable_comprobante_id ON public."movimiento_contable" ("comprobante_id");
CREATE INDEX IF NOT EXISTS idx_movimiento_contable_cliente_id ON public."movimiento_contable" ("cliente_id");
CREATE INDEX IF NOT EXISTS idx_movimiento_contable_cuenta_ahorro_id ON public."movimiento_contable" ("cuenta_ahorro_id");
CREATE INDEX IF NOT EXISTS idx_movimiento_contable_producto_credito_id ON public."movimiento_contable" ("producto_credito_id");
CREATE INDEX IF NOT EXISTS idx_movimiento_contable_estado ON public."movimiento_contable" ("estado");
CREATE INDEX IF NOT EXISTS idx_movimiento_contable_fecha ON public."movimiento_contable" ("fecha");


-- Table: pago_arriendo (PagoArriendo)
CREATE TABLE IF NOT EXISTS public."pago_arriendo" (
  id TEXT PRIMARY KEY,
  created_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  updated_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  created_by_id TEXT,
  is_sample BOOLEAN DEFAULT false,
  "inmueble_id" TEXT,
  "contrato_id" TEXT,
  "inquilino_id" TEXT,
  "periodo" TEXT,
  "fecha_vencimiento" TEXT,
  "fecha_pago_real" TEXT,
  "valor_esperado" NUMERIC,
  "valor_pagado" NUMERIC DEFAULT 0,
  "saldo_restante" NUMERIC DEFAULT 0,
  "dias_mora" NUMERIC DEFAULT 0,
  "estado" TEXT DEFAULT 'pendiente',
  "comprobante_id" TEXT,
  "notas" TEXT
);
ALTER TABLE public."pago_arriendo" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all on pago_arriendo" ON public."pago_arriendo";
CREATE POLICY "Allow anon all on pago_arriendo" ON public."pago_arriendo" FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_pago_arriendo_inmueble_id ON public."pago_arriendo" ("inmueble_id");
CREATE INDEX IF NOT EXISTS idx_pago_arriendo_contrato_id ON public."pago_arriendo" ("contrato_id");
CREATE INDEX IF NOT EXISTS idx_pago_arriendo_inquilino_id ON public."pago_arriendo" ("inquilino_id");
CREATE INDEX IF NOT EXISTS idx_pago_arriendo_estado ON public."pago_arriendo" ("estado");
CREATE INDEX IF NOT EXISTS idx_pago_arriendo_comprobante_id ON public."pago_arriendo" ("comprobante_id");


-- Table: prestamo (Prestamo)
CREATE TABLE IF NOT EXISTS public."prestamo" (
  id TEXT PRIMARY KEY,
  created_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  updated_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  created_by_id TEXT,
  is_sample BOOLEAN DEFAULT false,
  "codigo" TEXT,
  "cliente_id" TEXT,
  "modelo" TEXT,
  "capital" NUMERIC,
  "tasa_nominal" NUMERIC,
  "periodo" TEXT,
  "numero_cuotas" NUMERIC,
  "fecha_prestamo" TEXT,
  "cuota_fija" NUMERIC DEFAULT 0,
  "tasa_efectiva_periodo" NUMERIC,
  "tasa_efectiva_anual" NUMERIC,
  "total_intereses" NUMERIC DEFAULT 0,
  "total_a_pagar" NUMERIC DEFAULT 0,
  "saldo_capital" NUMERIC DEFAULT 0,
  "saldo_intereses" NUMERIC DEFAULT 0,
  "estado" TEXT DEFAULT 'vigente',
  "comprobante_id" TEXT,
  "subcuenta_cartera" TEXT,
  "subcuenta_intereses" TEXT,
  "fecha_proximo_pago" TEXT,
  "valor_proximo_pago" NUMERIC DEFAULT 0,
  "fecha_ultimo_abono" TEXT,
  "notas" TEXT
);
ALTER TABLE public."prestamo" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all on prestamo" ON public."prestamo";
CREATE POLICY "Allow anon all on prestamo" ON public."prestamo" FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_prestamo_codigo ON public."prestamo" ("codigo");
CREATE INDEX IF NOT EXISTS idx_prestamo_cliente_id ON public."prestamo" ("cliente_id");
CREATE INDEX IF NOT EXISTS idx_prestamo_estado ON public."prestamo" ("estado");
CREATE INDEX IF NOT EXISTS idx_prestamo_comprobante_id ON public."prestamo" ("comprobante_id");


-- Table: producto_credito (ProductoCredito)
CREATE TABLE IF NOT EXISTS public."producto_credito" (
  id TEXT PRIMARY KEY,
  created_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  updated_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  created_by_id TEXT,
  is_sample BOOLEAN DEFAULT false,
  "nomenclatura" TEXT,
  "codigo_interno" TEXT,
  "nombre" TEXT,
  "numero_completo" TEXT,
  "tipo" TEXT,
  "banco" TEXT,
  "franquicia" TEXT,
  "categoria" TEXT,
  "subcuenta_puc" TEXT,
  "titular_id" TEXT,
  "cupo" NUMERIC DEFAULT 0,
  "saldo" NUMERIC DEFAULT 0,
  "corte_modo" TEXT DEFAULT 'dia_fijo',
  "corte_semana" NUMERIC,
  "corte_dia_semana" NUMERIC,
  "fecha_corte" NUMERIC,
  "estado" TEXT DEFAULT 'activo',
  "version_consecutivo" NUMERIC DEFAULT 1,
  "version_padre_id" TEXT,
  "version_anterior_id" TEXT,
  "operacion" TEXT,
  "operacion_fecha" TEXT,
  "operacion_detalle" TEXT,
  "saldo_favor_acumulado" NUMERIC DEFAULT 0
);
ALTER TABLE public."producto_credito" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all on producto_credito" ON public."producto_credito";
CREATE POLICY "Allow anon all on producto_credito" ON public."producto_credito" FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_producto_credito_titular_id ON public."producto_credito" ("titular_id");
CREATE INDEX IF NOT EXISTS idx_producto_credito_estado ON public."producto_credito" ("estado");
CREATE INDEX IF NOT EXISTS idx_producto_credito_version_padre_id ON public."producto_credito" ("version_padre_id");
CREATE INDEX IF NOT EXISTS idx_producto_credito_version_anterior_id ON public."producto_credito" ("version_anterior_id");


-- Table: app_user (User)
CREATE TABLE IF NOT EXISTS public."app_user" (
  id TEXT PRIMARY KEY,
  created_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  updated_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  created_by_id TEXT,
  is_sample BOOLEAN DEFAULT false,
  "role" TEXT
);
ALTER TABLE public."app_user" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all on app_user" ON public."app_user";
CREATE POLICY "Allow anon all on app_user" ON public."app_user" FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- =========================================================
-- PERMISSIONS: Grant full access to anon, authenticated and service_role
-- =========================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;


