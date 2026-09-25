// Lógica compartida de conciliación bancaria — matching automático de líneas de extracto
// con movimientos contables existentes en el sistema.

function addMonths(dateStr, months) {
  const d = new Date(dateStr + "T00:00:00");
  d.setMonth(d.getMonth() + months);
  return d.toISOString().substring(0, 10);
}

export function getFechaCorteAnterior(extracto) {
  if (extracto.fecha_corte_anterior) return extracto.fecha_corte_anterior;
  if (extracto.fecha_corte) return addMonths(extracto.fecha_corte, -1);
  return null;
}

// Obtiene los movimientos contables del período del extracto.
// Estrategia: filtra primero por producto_credito_id; si hay pocos resultados (muchos registros
// históricos no tienen ese campo lleno), amplía la búsqueda usando la subcuenta_puc del producto.
export async function getMovimientosPeriodo(base44, extracto) {
  const fechaCorteAnterior = getFechaCorteAnterior(extracto);

  // Buscar el producto para obtener su subcuenta_puc
  let subcuentaPuc: string | null = null;
  try {
    const producto = await base44.asServiceRole.entities.ProductoCredito.get(extracto.producto_id);
    subcuentaPuc = producto?.subcuenta_puc || null;
  } catch (_) {}

  // Filtro primario: por producto_credito_id (asientos nuevos, bien etiquetados)
  const movsPorId = await base44.asServiceRole.entities.MovimientoContable.filter({
    producto_credito_id: extracto.producto_id,
    estado: "activo"
  });

  // Filtro secundario: por subcuenta_puc (asientos históricos sin producto_credito_id)
  let movsPorSubcuenta: any[] = [];
  if (subcuentaPuc) {
    const todosSubcuenta = await base44.asServiceRole.entities.MovimientoContable.filter({
      subcuenta: subcuentaPuc,
      estado: "activo"
    });
    // Solo los que NO tienen producto_credito_id asignado (para no duplicar)
    movsPorSubcuenta = todosSubcuenta.filter((m) => !m.producto_credito_id);
  }

  // Excluir movimientos de notas de anulación (nota crédito espejo generada al anular un
  // comprobante). Estas notas reversan asientos pero NO deben sumarse al saldo del sistema
  // de la conciliación, porque el movimiento original ya fue excluido (estado: "anulado").
  const notasAnulacion = await base44.asServiceRole.entities.ComprobanteContable.filter({
    tipo: "nota_credito"
  });
  const idsNotasAnulacion = new Set(
    notasAnulacion.filter((c) => c.comprobante_origen_id).map((c) => c.id)
  );

  // Unir ambos conjuntos, excluir notas de anulación y filtrar por período
  const todosMovs = [...movsPorId, ...movsPorSubcuenta].filter(
    (m) => !idsNotasAnulacion.has(m.comprobante_id)
  );

  return todosMovs.filter((m) => {
    // Si periodo_extracto está asignado explícitamente, es la asignación autoritativa:
    // el movimiento solo aparece en la conciliación de ese período, anulando el filtro por fecha.
    // Esto permite "reenviar" un movimiento al próximo período.
    if (m.periodo_extracto) {
      return m.periodo_extracto === extracto.periodo;
    }
    // Sin periodo_extracto: filtrar por rango de fechas del extracto
    const porFecha = fechaCorteAnterior && extracto.fecha_corte &&
      m.fecha > fechaCorteAnterior && m.fecha <= extracto.fecha_corte;
    return porFecha;
  });
}

// Matching automático: asocia cada línea del extracto con un movimiento del sistema.
// Criterios: mismo valor (tolerancia $1.000), fecha dentro de 3 días.
// 1ra pasada: lado coherente con la naturaleza (cargo→crédito, abono→débito).
// 2da pasada: lado opuesto — relaciona movimientos que solo difieren en concepto/tercero
// pero cuadran en valor y fecha, evitando dejarlos como faltante + sobrante separados.
// No muta la base de datos — solo calcula las asociaciones. El caller decide si persistir.
export function autoConciliarLineas(lineasBanco, movimientosSistema) {
  const matcheados = new Set();
  const conciliados = [];
  const faltantes = [];
  const diferencias = [];

  const valorLado = (mov, naturaleza) => naturaleza === "cargo" ? (mov.credito || 0) : (mov.debito || 0);
  const valorLadoOpuesto = (mov, naturaleza) => naturaleza === "cargo" ? (mov.debito || 0) : (mov.credito || 0);
  const diffDias = (f1, f2) => Math.abs((new Date(f1 + "T00:00:00") - new Date(f2 + "T00:00:00")) / 86400000);

  const buscar = (linea, usarLadoOpuesto) => {
    for (const mov of movimientosSistema) {
      if (matcheados.has(mov.id)) continue;
      const valorSistema = usarLadoOpuesto ? valorLadoOpuesto(mov, linea.naturaleza) : valorLado(mov, linea.naturaleza);
      if (valorSistema === 0) continue;
      if (Math.abs(valorSistema - linea.valor) > 1000) continue;
      if (diffDias(mov.fecha, linea.fecha) > 3) continue;
      return mov;
    }
    return null;
  };

  for (const linea of lineasBanco) {
    let encontrado = buscar(linea, false);
    if (!encontrado) encontrado = buscar(linea, true);

    if (encontrado) {
      matcheados.add(encontrado.id);
      // Valor del lado que realmente produjo el match (correcto u opuesto)
      const valorSistema = valorLado(encontrado, linea.naturaleza) || valorLadoOpuesto(encontrado, linea.naturaleza);
      const diff = linea.valor - valorSistema;
      conciliados.push({ linea_banco: linea, movimiento_sistema: encontrado });
      if (Math.abs(diff) > 0) {
        diferencias.push({
          linea_banco: linea, movimiento_sistema: encontrado,
          valor_banco: linea.valor, valor_sistema: valorSistema, diferencia: diff
        });
      }
    } else {
      // ¿Existe una línea banco idéntica/similar ya conciliada en este mismo extracto?
      // El extracto es autoritativo: dos movimientos iguales son reales. Si el sistema solo
      // tiene uno, vinculamos esta línea al mismo movimiento (N:M) en vez de marcarla como
      // faltante — evita el aviso de "posible duplicado" sobre movimientos que sí existen.
      const twin = conciliados.find((c) => {
        if (c.linea_banco.fecha !== linea.fecha) return false;
        if (c.linea_banco.valor !== linea.valor) return false;
        if (c.linea_banco.naturaleza !== linea.naturaleza) return false;
        const dA = (c.linea_banco.descripcion || "").trim().toLowerCase();
        const dB = (linea.descripcion || "").trim().toLowerCase();
        return dA === dB || dA.includes(dB.substring(0, 12)) || dB.includes(dA.substring(0, 12));
      });
      if (twin) {
        conciliados.push({ linea_banco: linea, movimiento_sistema: twin.movimiento_sistema });
      } else {
        faltantes.push({ linea_banco: linea });
      }
    }
  }

  const sobrantes = movimientosSistema
    .filter((m) => !matcheados.has(m.id))
    .map((m) => ({ movimiento_sistema: m }));

  return { conciliados, faltantes, sobrantes, diferencias };
}

// Recalcula el saldo del sistema (créditos - débitos) y la diferencia vs el banco
export async function recalcularSaldoSistema(base44, extractoId) {
  const extracto = await base44.asServiceRole.entities.ExtractoProducto.get(extractoId);
  const movs = await getMovimientosPeriodo(base44, extracto);
  const sumaCreditos = movs.reduce((s, m) => s + (m.credito || 0), 0);
  const sumaDebitos = movs.reduce((s, m) => s + (m.debito || 0), 0);
  const saldo_sistema = sumaCreditos - sumaDebitos;
  const diferencia_saldo = (extracto.saldo_a_pagar || 0) - (extracto.saldo_anterior || 0) - saldo_sistema;
  await base44.asServiceRole.entities.ExtractoProducto.update(extractoId, {
    saldo_sistema, diferencia_saldo,
    total_lineas_sistema: movs.length
  });
  return { ...extracto, saldo_sistema, diferencia_saldo, total_lineas_sistema: movs.length };
}

// Persiste el resultado del matching automático en las líneas y el extracto.
// Actualiza estado_conciliacion y movimiento_sistema_id de cada línea, y el resumen del extracto.
export async function persistirConciliacion(base44, extractoId, resultado) {
  const { conciliados, faltantes, sobrantes, diferencias } = resultado;

  // Marcar líneas conciliadas con el movimiento del sistema asociado
  for (const c of conciliados) {
    await base44.asServiceRole.entities.LineaExtracto.update(c.linea_banco.id, {
      estado_conciliacion: "conciliado",
      movimiento_sistema_id: c.movimiento_sistema.id
    });
  }
  // Marcar líneas faltantes como sin conciliar
  for (const f of faltantes) {
    await base44.asServiceRole.entities.LineaExtracto.update(f.linea_banco.id, {
      estado_conciliacion: "sin_conciliar",
      movimiento_sistema_id: ""
    });
  }

  const estadoConc = (diferencias.length + faltantes.length + sobrantes.length) > 0
    ? "con_diferencias" : "conciliado";

  await base44.asServiceRole.entities.ExtractoProducto.update(extractoId, {
    lineas_conciliadas: conciliados.length,
    lineas_faltantes: faltantes.length,
    lineas_sobrantes: sobrantes.length,
    estado_conciliacion: estadoConc
  });

  return estadoConc;
}