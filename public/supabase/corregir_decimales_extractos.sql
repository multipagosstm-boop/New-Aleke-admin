-- ==============================================================================
-- CORRECCIÓN Y NORMALIZACIÓN DE DECIMALES (Aleke System)
-- ==============================================================================
-- Este script redondea a 2 decimales todos los montos de extracto_producto
-- y linea_extracto, eliminando valores infinitesimales (ej: -2.32e-10) o
-- residuos de punto flotante de JavaScript.

BEGIN;

-- 1. Redondear y sanear valores en extracto_producto
UPDATE public.extracto_producto
SET
  saldo_a_pagar = ROUND(COALESCE(saldo_a_pagar, 0)::numeric, 2),
  saldo_anterior = ROUND(COALESCE(saldo_anterior, 0)::numeric, 2),
  cuota_manejo = ROUND(COALESCE(cuota_manejo, 0)::numeric, 2),
  seguros = ROUND(COALESCE(seguros, 0)::numeric, 2),
  intereses_corrientes = ROUND(COALESCE(intereses_corrientes, 0)::numeric, 2),
  intereses_mora = ROUND(COALESCE(intereses_mora, 0)::numeric, 2),
  comisiones = ROUND(COALESCE(comisiones, 0)::numeric, 2),
  otros_gastos = ROUND(COALESCE(otros_gastos, 0)::numeric, 2),
  rendimientos = ROUND(COALESCE(rendimientos, 0)::numeric, 2),
  cashback = ROUND(COALESCE(cashback, 0)::numeric, 2),
  total_abonado = ROUND(COALESCE(total_abonado, 0)::numeric, 2),
  saldo_pendiente = ROUND(COALESCE(saldo_pendiente, 0)::numeric, 2),
  saldo_a_favor = ROUND(COALESCE(saldo_a_favor, 0)::numeric, 2),
  saldo_sistema = ROUND(COALESCE(saldo_sistema, 0)::numeric, 2),
  porcentaje_pagado = ROUND(COALESCE(porcentaje_pagado, 0)::numeric, 2),
  diferencia_saldo = CASE
    WHEN ABS(COALESCE(diferencia_saldo, 0)::numeric) < 0.01 THEN 0
    ELSE ROUND(diferencia_saldo::numeric, 2)
  END;

-- 2. Redondear y sanear valores en linea_extracto si existen registros
UPDATE public.linea_extracto
SET
  valor = ROUND(ABS(COALESCE(valor, 0)::numeric), 2);

COMMIT;

-- Comprobación de extractos corregidos
SELECT
  id,
  periodo,
  saldo_a_pagar,
  saldo_anterior,
  saldo_pendiente,
  porcentaje_pagado,
  diferencia_saldo
FROM public.extracto_producto
ORDER BY periodo DESC
LIMIT 15;
