import { ejecutarCreacion, ValidationError, obtenerConfiguracion } from "../../shared/contabilidad.ts";
import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";

function fechaToString(fecha) {
  if (fecha == null || fecha === "") return null;
  // Objeto Date
  if (fecha instanceof Date) {
    if (isNaN(fecha.getTime())) return null;
    const y = fecha.getFullYear();
    const m = String(fecha.getMonth() + 1).padStart(2, "0");
    const d = String(fecha.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  // Número de serie de Excel (ej: 46237 = 2026-08-03)
  if (typeof fecha === "number") {
    const date = new Date(Math.round((fecha - 25569) * 86400 * 1000));
    if (isNaN(date.getTime())) return null;
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    const d = String(date.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  // String
  const s = String(fecha).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  const match = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match) {
    const dd = match[1].padStart(2, "0");
    const mm = match[2].padStart(2, "0");
    return `${match[3]}-${mm}-${dd}`;
  }
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, "0");
    const d = String(parsed.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return null;
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin")
      return Response.json({ error: "Solo administradores pueden procesar cargas masivas" }, { status: 403 });

    const body = await req.json();
    const { movimientos: movimientosRaw } = body;

    if (!Array.isArray(movimientosRaw) || movimientosRaw.length === 0)
      return Response.json({ error: "No se recibieron movimientos" }, { status: 400 });

    // Agrupar por comprobante_numero
    const grupos = {};
    const ordenGrupos = [];
    for (const row of movimientosRaw) {
      const num = String(row.comprobante_numero);
      if (!grupos[num]) { grupos[num] = []; ordenGrupos.push(num); }
      grupos[num].push(row);
    }

    // Cargar ProductosCredito para lookup por codigo_interno (col_9) y subcuenta_puc
    // list() sin args devuelve máx 50; paginamos para traer todos.
    const productoMap = {};
    const productoPorSubcuenta = {};
    const productoById = new Map();
    let skipProd = 0;
    while (true) {
      const batch = await base44.asServiceRole.entities.ProductoCredito.list("-created_date", 5000, skipProd);
      batch.forEach((p) => {
        if (p.codigo_interno) productoMap[String(p.codigo_interno).trim()] = p;
        if (p.subcuenta_puc) productoPorSubcuenta[String(p.subcuenta_puc).trim()] = p;
        productoById.set(p.id, p);
      });
      if (batch.length < 5000) break;
      skipProd += 5000;
    }

    // Cargar CuentasAhorro para lookup por subcuenta_puc (actualización de saldos)
    const cdaPorSubcuenta = {};
    const cdaById = new Map();
    let skipCda = 0;
    while (true) {
      const batch = await base44.asServiceRole.entities.CuentaAhorro.list("-created_date", 5000, skipCda);
      batch.forEach((c) => {
        if (c.subcuenta_puc) cdaPorSubcuenta[String(c.subcuenta_puc).trim()] = c;
        cdaById.set(c.id, c);
      });
      if (batch.length < 5000) break;
      skipCda += 5000;
    }

    // Caches reutilizables entre comprobantes para minimizar llamadas a la BD
    const cuentaCache = new Map();
    const consecutivoCache = { record: null };
    const configGlobal = await obtenerConfiguracion(base44);

    const resultados = [];
    const errores = [];

    for (const num of ordenGrupos) {
      const rows = grupos[num];
      try {
        const movsValidados = [];
        let fechaComprobante = null;
        let descComprobante = "";

        for (const row of rows) {
          const subcuentaStr = String(row.subcuenta);
          let debito = Number(row.debito) || 0;
          let credito = Number(row.credito) || 0;

          // Manejar valores negativos: convertir al lado opuesto
          if (debito < 0) { credito += Math.abs(debito); debito = 0; }
          if (credito < 0) { debito += Math.abs(credito); credito = 0; }

          if (debito === 0 && credito === 0)
            throw new Error(`Movimiento sin valor (subcuenta ${subcuentaStr})`);

          // Lookup de producto por col_9 (codigo_interno) si no hay producto_credito_id
          const codigoProd = row.col_9 || row.codigo_producto;
          let productoId = row.producto_credito_id || "";
          if (!productoId && codigoProd) {
            const prod = productoMap[String(codigoProd).trim()];
            if (!prod)
              throw new Error(`Producto con código "${codigoProd}" no encontrado`);
            productoId = prod.id;
          }
          // Fallback: resolver producto por subcuenta_puc (para actualización de saldo)
          if (!productoId) {
            const prodBySub = productoPorSubcuenta[subcuentaStr];
            if (prodBySub) productoId = prodBySub.id;
          }

          // Resolver CuentaAhorro por subcuenta_puc (para actualización de saldo)
          let cuentaAhorroId = row.cuenta_ahorro_id || "";
          if (!cuentaAhorroId) {
            const cdaBySub = cdaPorSubcuenta[subcuentaStr];
            if (cdaBySub) cuentaAhorroId = cdaBySub.id;
          }

          const fecha = fechaToString(row.fecha);
          if (!fecha) throw new Error("Fecha inválida o faltante en una fila");
          if (!fechaComprobante) fechaComprobante = fecha;
          if (!descComprobante) descComprobante = row.descripcion || `Comprobante ${num}`;

          movsValidados.push({
            subcuenta: subcuentaStr,
            debito, credito,
            descripcion: row.descripcion || descComprobante,
            tercero: row.tercero || "",
            cliente_id: row.cliente_id || "",
            producto_credito_id: productoId,
            cuenta_ahorro_id: cuentaAhorroId,
            tipo_movimiento_tdc: row.tipo_movimiento_tdc || null,
            periodo_extracto: row.periodo_extracto || ""
          });
        }

        // Determinar modo: si alguna subcuenta inicia con 4-8 → resultado
        const tieneResultado = movsValidados.some((m) => {
          const d = String(m.subcuenta).charAt(0);
          return ["4", "5", "6", "7", "8"].includes(d);
        });
        const modo = tieneResultado ? "resultado" : "balance";

        const totalDebito = movsValidados.reduce((s, m) => s + m.debito, 0);
        const totalCredito = movsValidados.reduce((s, m) => s + m.credito, 0);

        const result = await ejecutarCreacion(base44, user, {
          tipo: "diario",
          fecha: fechaComprobante,
          descripcion: descComprobante,
          modo,
          confirmar_sobregiro: true,
          movimientos: movsValidados
        }, { cuentaCache, productoCache: productoById, cdaCache: cdaById, consecutivoCache, config: configGlobal });

        resultados.push({
          comprobante_numero: num,
          numero_generado: result.comprobante.numero,
          total: totalDebito,
          movimientos: movsValidados.length,
          warnings: result.warnings || []
        });
      } catch (error) {
        errores.push({
          comprobante_numero: num,
          error: error.message
        });
      }
    }

    return Response.json({
      total_comprobantes: ordenGrupos.length,
      creados: resultados.length,
      fallidos: errores.length,
      resultados,
      errores
    });
  } catch (error) {
    if (error instanceof ValidationError) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ error: error.message }, { status: 500 });
  }
}