// Lógica contable compartida entre funciones backend

export class ValidationError extends Error {}

const CLASE_MAP = {
  1: "activo",
  2: "pasivo",
  3: "patrimonio",
  4: "ingreso",
  5: "gasto",
  6: "gasto",
  7: "gasto",
  8: "gasto"
};

export function claseFromNumero(num) {
  return CLASE_MAP[num] || "activo";
}

export async function obtenerConsecutivo(base44, año, tipo = "comprobante", consecutivoCache = null) {
  const token = Date.now().toString(36) + Math.random().toString(36).slice(2);
  let existente;
  if (consecutivoCache && consecutivoCache.record && consecutivoCache.record.año === año && consecutivoCache.record.tipo === tipo) {
    existente = consecutivoCache.record;
  } else {
    const existentes = await base44.asServiceRole.entities.Consecutivo.filter({ año, tipo });
    existente = existentes[0];
  }

  if (!existente) {
    try {
      const created = await base44.asServiceRole.entities.Consecutivo.create({
        año, tipo, ultimo_numero: 1, ultimo_token: token
      });
      if (consecutivoCache) consecutivoCache.record = created;
      return String(1).padStart(4, "0") + "-" + año;
    } catch (e) {
      const existentes2 = await base44.asServiceRole.entities.Consecutivo.filter({ año, tipo });
      existente = existentes2[0];
    }
  }

  const valorActual = existente.ultimo_numero;
  await base44.asServiceRole.entities.Consecutivo.update(existente.id, {
    ultimo_numero: valorActual + 1,
    ultimo_token: token
  });
  const despues = await base44.asServiceRole.entities.Consecutivo.filter({ año, tipo });
  if (despues[0].ultimo_token !== token) {
    await new Promise(r => setTimeout(r, 50));
    if (consecutivoCache) consecutivoCache.record = despues[0];
    return obtenerConsecutivo(base44, año, tipo, consecutivoCache);
  }
  if (consecutivoCache) consecutivoCache.record = despues[0];
  return String(valorActual + 1).padStart(4, "0") + "-" + año;
}

export async function validarCuentaTransaccional(base44, codigoSubcuenta, cuentaCache = null) {
  const codigo = Number(codigoSubcuenta);
  if (isNaN(codigo)) return { valid: false, error: `Código de cuenta inválido: ${codigoSubcuenta}` };
  if (cuentaCache && cuentaCache.has(codigo)) return cuentaCache.get(codigo);
  const cuentas = await base44.asServiceRole.entities.Cuenta.filter({ codigo });
  let result;
  if (cuentas.length === 0) result = { valid: false, error: `La cuenta ${codigoSubcuenta} no existe en el PUC` };
  else {
    const cuenta = cuentas[0];
    if (!cuenta.es_transaccional) result = { valid: false, error: `La cuenta ${codigoSubcuenta} no es transaccional` };
    else if (cuenta.nivel !== "Subcuenta" && cuenta.nivel !== "Auxiliar") {
      result = { valid: false, error: `La cuenta ${codigoSubcuenta} es nivel ${cuenta.nivel}; solo se pueden registrar movimientos en subcuentas o auxiliares` };
    } else result = { valid: true, cuenta };
  }
  if (cuentaCache) cuentaCache.set(codigo, result);
  return result;
}

export async function actualizarSaldoCuentaAhorro(base44, cuentaAhorroId, debito, credito, reversar, cdaCache = null) {
  const cda = cdaCache && cdaCache.has(cuentaAhorroId) ? cdaCache.get(cuentaAhorroId) : await base44.asServiceRole.entities.CuentaAhorro.get(cuentaAhorroId);
  const saldoAnt = cda.saldo;
  const acumAnt = cda.movimientos_mes_acumulado || 0;
  let nuevoSaldo;
  let nuevoAcum;
  if (!reversar) {
    nuevoSaldo = cda.saldo + (debito || 0) - (credito || 0);
    nuevoAcum = acumAnt + Math.abs(credito || 0);
  } else {
    nuevoSaldo = cda.saldo - (debito || 0) + (credito || 0);
    nuevoAcum = Math.max(0, acumAnt - Math.abs(credito || 0));
  }
  await base44.asServiceRole.entities.CuentaAhorro.update(cuentaAhorroId, {
    saldo: nuevoSaldo,
    movimientos_mes_acumulado: nuevoAcum
  });
  if (cdaCache) { cda.saldo = nuevoSaldo; cda.movimientos_mes_acumulado = nuevoAcum; }
  return { saldoAnt, acumAnt, nuevoSaldo, nuevoAcum, nombre: cda.nombre };
}

export async function actualizarSaldoProductoCredito(base44, productoId, debito, credito, reversar, productoCache = null) {
  const prod = productoCache && productoCache.has(productoId) ? productoCache.get(productoId) : await base44.asServiceRole.entities.ProductoCredito.get(productoId);
  const saldoAnt = prod.saldo;
  let nuevoSaldo;
  const esPasivo = prod.tipo === "TDC";
  if (esPasivo) {
    if (!reversar) {
      nuevoSaldo = prod.saldo - (debito || 0) + (credito || 0);
    } else {
      nuevoSaldo = prod.saldo + (debito || 0) - (credito || 0);
    }
  } else {
    if (!reversar) {
      nuevoSaldo = prod.saldo + (debito || 0) - (credito || 0);
    } else {
      nuevoSaldo = prod.saldo - (debito || 0) + (credito || 0);
    }
  }
  await base44.asServiceRole.entities.ProductoCredito.update(productoId, { saldo: nuevoSaldo });
  if (productoCache) prod.saldo = nuevoSaldo;
  return { saldoAnt, nuevoSaldo, producto: prod };
}

export async function obtenerConfiguracion(base44) {
  const configs = await base44.asServiceRole.entities.Configuracion.list();
  if (configs.length > 0) return configs[0];
  // Crear configuración por defecto
  return await base44.asServiceRole.entities.Configuracion.create({
    gmf_limite: 18331000,
    gmf_año: 2026,
    año_fiscal: 2026
  });
}

export function formatearMovimientoData(mov, cuenta, clase, comprobanteId, fecha, userEmail, fechaRegistro) {
  return {
    comprobante_id: comprobanteId,
    clase,
    grupo: String(cuenta.grupo || ""),
    cuenta: String(cuenta.cuenta || ""),
    subcuenta: String(cuenta.codigo),
    cuenta_nombre: cuenta.concepto,
    prefijo_cuenta: String(cuenta.codigo).substring(0, 4),
    debito: mov.debito || 0,
    credito: mov.credito || 0,
    descripcion: mov.descripcion || "",
    tercero: mov.tercero || "",
    cliente_id: mov.cliente_id || "",
    modelo_negocio: mov.modelo_negocio || "",
    periodo_operacion: fecha.substring(0, 7),
    periodo_extracto: mov.periodo_extracto || "",
    tipo_movimiento_tdc: mov.tipo_movimiento_tdc || null,
    cuenta_ahorro_id: mov.cuenta_ahorro_id || "",
    producto_credito_id: mov.producto_credito_id || "",
    estado: "activo",
    fecha,
    fecha_registro: fechaRegistro || new Date().toISOString(),
    created_by_email: userEmail
  };
}

// === Validación por modo de registro ===
// modo "balance": solo activos, pasivos, patrimonio (clases 1,2,3)
// modo "resultado": permite todas, pero exige tercero + nota en ingreso/gasto
export function validarMovimientoPorModo(mov, cuenta, clase, modo) {
  const esResultado = clase === "ingreso" || clase === "gasto";
  if (modo === "balance" && esResultado) {
    return { valid: false, error: `En modo Balance no se permiten cuentas de ${clase} (${cuenta.codigo} - ${cuenta.concepto})` };
  }
  if (modo === "resultado" && esResultado) {
    if (!mov.tercero || mov.tercero.trim() === "") {
      return { valid: false, error: `La cuenta ${cuenta.concepto} (${cuenta.codigo}) es de ${clase} y requiere tercero vinculado` };
    }
    if (!mov.descripcion || mov.descripcion.trim() === "") {
      return { valid: false, error: `La cuenta ${cuenta.concepto} (${cuenta.codigo}) es de ${clase} y requiere nota/concepto` };
    }
  }
  return { valid: true };
}

// === Validación y preparación de movimientos (compartida por creación y modificación) ===
export async function prepararMovimientos(base44, movimientos, modo, tipo, confirmar_sobregiro, opts = {}) {
  const { cuentaCache = null, productoCache = null } = opts;
  if (!movimientos || movimientos.length < 2) throw new ValidationError("El comprobante debe tener al menos 2 movimientos");
  const totalDebito = movimientos.reduce((s, m) => s + (Number(m.debito) || 0), 0);
  const totalCredito = movimientos.reduce((s, m) => s + (Number(m.credito) || 0), 0);
  if (Math.abs(totalDebito - totalCredito) > 0.01) throw new ValidationError("La suma de débitos y créditos no balancea");
  if (totalDebito === 0) throw new ValidationError("El comprobante no puede tener valor 0");

  const warnings = [];
  const movimientosData = [];
  const config = opts.config || await obtenerConfiguracion(base44);

  // Pass 1: validar cuentas, clases y modo
  for (const mov of movimientos) {
    if (!mov.subcuenta) throw new ValidationError("Cada movimiento debe tener una subcuenta");
    if (!mov.debito && !mov.credito) throw new ValidationError("Cada movimiento debe tener débito o crédito");
    if (Number(mov.debito) > 0 && Number(mov.credito) > 0)
      throw new ValidationError(`Un movimiento no puede tener débito y crédito simultáneamente (cuenta ${mov.subcuenta})`);
    if (Number(mov.debito) < 0 || Number(mov.credito) < 0)
      throw new ValidationError(`Los valores no pueden ser negativos (cuenta ${mov.subcuenta})`);

    const cuentaCheck = await validarCuentaTransaccional(base44, mov.subcuenta, cuentaCache);
    if (!cuentaCheck.valid) throw new ValidationError(cuentaCheck.error);

    const cuenta = cuentaCheck.cuenta;
    const clase = claseFromNumero(cuenta.clase);

    const modoCheck = validarMovimientoPorModo(mov, cuenta, clase, modo);
    if (!modoCheck.valid) throw new ValidationError(modoCheck.error);

    movimientosData.push({ mov, cuenta, clase });
  }

  // Pass 2: validación TDC — ya conoce todas las contrapartidas del comprobante.
  // nota_crédito o contrapartida de ingreso = ajuste/corrección de saldo de la tarjeta:
  // no exige compra/avance/financiero ni validación de sobregiro (es un movimiento financiero de ajuste).
  const tieneIngresoContrapartida = movimientosData.some((d) => d.clase === "ingreso");
  const esNotaCredito = tipo === "nota_credito";
  for (const { mov, cuenta, clase } of movimientosData) {
    if (mov.producto_credito_id) {
      const prod = productoCache && productoCache.has(mov.producto_credito_id) ? productoCache.get(mov.producto_credito_id) : await base44.asServiceRole.entities.ProductoCredito.get(mov.producto_credito_id);
      if (prod.tipo === "TDC") {
        const esDebito = (Number(mov.debito) || 0) > 0;
        const esCredito = (Number(mov.credito) || 0) > 0;
        if (esDebito) {
          // Débito en TDC = abono (pago): asignación automática, sin sobregiro
          mov.tipo_movimiento_tdc = "abono";
        } else if (esCredito) {
          if (esNotaCredito || tieneIngresoContrapartida) {
            // Ajuste/corrección de saldo: se trata como movimiento financiero, sin forzar compra ni sobregiro
            if (!mov.tipo_movimiento_tdc) mov.tipo_movimiento_tdc = "financiero";
          } else {
            // Crédito en TDC = cargo (compra/avance/financiero)
            const tiposCargo = ["compra", "avance", "financiero"];
            if (!mov.tipo_movimiento_tdc || !tiposCargo.includes(mov.tipo_movimiento_tdc)) {
              mov.tipo_movimiento_tdc = "compra";
            }
            const disponible = prod.cupo - prod.saldo;
            if ((Number(mov.credito) || 0) > disponible && !confirmar_sobregiro) {
              const err = new Error(`SOBREGIRO: El movimiento (${mov.credito}) supera el disponible (${disponible}) de ${prod.nombre}. Envíe confirmar_sobregiro=true para proceder.`);
              err.requiere_confirmacion = true;
              throw err;
            }
            if ((Number(mov.credito) || 0) > disponible) {
              warnings.push(`Sobregiro autorizado en ${prod.nombre}: disponible ${disponible}, movimiento ${mov.credito}`);
            }
          }
        }
      }
    }
  }
  return { movimientosData, totalDebito, totalCredito, warnings, config };
}

// === Creación de comprobante (lógica extraída para reutilización) ===
export async function ejecutarCreacion(base44, user, params, opts = {}) {
  const { cuentaCache = null, productoCache = null, cdaCache = null, consecutivoCache = null } = opts;
  const { tipo = "diario", fecha, descripcion, movimientos = [], modo = "balance", confirmar_sobregiro = false } = params;

  if (!fecha) throw new ValidationError("Fecha es obligatoria");
  if (!descripcion || descripcion.trim() === "") throw new ValidationError("Descripción es obligatoria");
  if (!movimientos || movimientos.length < 2) throw new ValidationError("El comprobante debe tener al menos 2 movimientos");

  const { movimientosData, totalDebito, totalCredito, warnings, config } = await prepararMovimientos(base44, movimientos, modo, tipo, confirmar_sobregiro, { cuentaCache, productoCache, config: opts.config });

  const año = Number(fecha.substring(0, 4));
  const numero = await obtenerConsecutivo(base44, año, "comprobante", consecutivoCache);
  const fechaRegistro = new Date().toISOString();

  const comprobante = await base44.asServiceRole.entities.ComprobanteContable.create({
    numero, tipo, fecha, descripcion,
    estado: "contabilizado",
    total_debito: totalDebito, total_credito: totalCredito,
    fecha_registro: fechaRegistro,
    created_by_email: user.email || ""
  });

  const saldosModificados = [];
  try {
    for (const { mov, cuenta, clase } of movimientosData) {
      if (mov.cuenta_ahorro_id) {
        const result = await actualizarSaldoCuentaAhorro(base44, mov.cuenta_ahorro_id, Number(mov.debito) || 0, Number(mov.credito) || 0, false, cdaCache);
        saldosModificados.push({ type: "CuentaAhorro", id: mov.cuenta_ahorro_id, saldoAnt: result.saldoAnt, acumAnt: result.acumAnt });
        if (result.nuevoAcum > config.gmf_limite) {
          warnings.push(`GMF: Cuenta ${result.nombre} acumulado ${result.nuevoAcum} supera límite ${config.gmf_limite}`);
        }
        if (result.nuevoSaldo < 0) {
          warnings.push(`Saldo negativo: ${result.nombre} (${result.nuevoSaldo})`);
        }
      }
      if (mov.producto_credito_id) {
        const result = await actualizarSaldoProductoCredito(base44, mov.producto_credito_id, Number(mov.debito) || 0, Number(mov.credito) || 0, false, productoCache);
        saldosModificados.push({ type: "ProductoCredito", id: mov.producto_credito_id, saldoAnt: result.saldoAnt });
      }
      const movData = formatearMovimientoData(mov, cuenta, clase, comprobante.id, fecha, user.email || "", fechaRegistro);
      await base44.asServiceRole.entities.MovimientoContable.create(movData);
    }
  } catch (error) {
    for (const s of saldosModificados) {
      try {
        if (s.type === "CuentaAhorro") {
          await base44.asServiceRole.entities.CuentaAhorro.update(s.id, { saldo: s.saldoAnt, movimientos_mes_acumulado: s.acumAnt });
          if (cdaCache && cdaCache.has(s.id)) { const c = cdaCache.get(s.id); c.saldo = s.saldoAnt; c.movimientos_mes_acumulado = s.acumAnt; }
        } else if (s.type === "ProductoCredito") {
          await base44.asServiceRole.entities.ProductoCredito.update(s.id, { saldo: s.saldoAnt });
          if (productoCache && productoCache.has(s.id)) productoCache.get(s.id).saldo = s.saldoAnt;
        }
      } catch (e) { /* best effort */ }
    }
    try {
      const movsCreados = await base44.asServiceRole.entities.MovimientoContable.filter({ comprobante_id: comprobante.id });
      for (const m of movsCreados) await base44.asServiceRole.entities.MovimientoContable.delete(m.id);
      await base44.asServiceRole.entities.ComprobanteContable.delete(comprobante.id);
    } catch (e) { /* best effort */ }
    throw new Error(`Error tras modificar saldos: ${error.message}. Saldos revertidos.`);
  }

  return { comprobante, warnings, numero };
}

// === Modificación directa de comprobante (sin nota crédito — mismo id y número) ===
export async function ejecutarModificacionDirecta(base44, comprobante, user, params) {
  const { tipo = comprobante.tipo, fecha = comprobante.fecha, descripcion, movimientos = [], modo = "balance", confirmar_sobregiro = false } = params;
  if (!fecha) throw new ValidationError("Fecha es obligatoria");
  if (!descripcion || descripcion.trim() === "") throw new ValidationError("Descripción es obligatoria");

  const { movimientosData, totalDebito, totalCredito, warnings, config } = await prepararMovimientos(base44, movimientos, modo, tipo, confirmar_sobregiro);

  // 1. Reversar saldos de los movimientos originales activos
  const todosMovsOriginales = await base44.asServiceRole.entities.MovimientoContable.filter({
    comprobante_id: comprobante.id
  });
  for (const mov of (todosMovsOriginales || [])) {
    if (mov.estado === "activo") {
      if (mov.cuenta_ahorro_id) {
        await actualizarSaldoCuentaAhorro(base44, mov.cuenta_ahorro_id, mov.debito, mov.credito, true);
      }
      if (mov.producto_credito_id) {
        await actualizarSaldoProductoCredito(base44, mov.producto_credito_id, mov.debito, mov.credito, true);
      }
    }
  }

  // 2. Eliminar definitivamente todos los movimientos originales (activos o inactivos)
  for (const mov of (todosMovsOriginales || [])) {
    await base44.asServiceRole.entities.MovimientoContable.delete(mov.id);
  }

  // 3. Actualizar cabecera del comprobante (mismo id y número)
  const fechaRegistroMod = new Date().toISOString();
  await base44.asServiceRole.entities.ComprobanteContable.update(comprobante.id, {
    tipo, fecha, descripcion: descripcion.trim(),
    total_debito: totalDebito, total_credito: totalCredito,
    fecha_registro: fechaRegistroMod
  });

  // 4. Crear movimientos nuevos y aplicar saldos
  const saldosModificados = [];
  try {
    for (const { mov, cuenta, clase } of movimientosData) {
      if (mov.cuenta_ahorro_id) {
        const result = await actualizarSaldoCuentaAhorro(base44, mov.cuenta_ahorro_id, Number(mov.debito) || 0, Number(mov.credito) || 0, false);
        saldosModificados.push({ type: "CuentaAhorro", id: mov.cuenta_ahorro_id, saldoAnt: result.saldoAnt, acumAnt: result.acumAnt });
        if (result.nuevoAcum > config.gmf_limite) {
          warnings.push(`GMF: Cuenta ${result.nombre} acumulado ${result.nuevoAcum} supera límite ${config.gmf_limite}`);
        }
        if (result.nuevoSaldo < 0) {
          warnings.push(`Saldo negativo: ${result.nombre} (${result.nuevoSaldo})`);
        }
      }
      if (mov.producto_credito_id) {
        const result = await actualizarSaldoProductoCredito(base44, mov.producto_credito_id, Number(mov.debito) || 0, Number(mov.credito) || 0, false);
        saldosModificados.push({ type: "ProductoCredito", id: mov.producto_credito_id, saldoAnt: result.saldoAnt });
      }
      const movData = formatearMovimientoData(mov, cuenta, clase, comprobante.id, fecha, user.email || "", fechaRegistroMod);
      await base44.asServiceRole.entities.MovimientoContable.create(movData);
    }
  } catch (error) {
    for (const s of saldosModificados) {
      try {
        if (s.type === "CuentaAhorro") {
          await base44.asServiceRole.entities.CuentaAhorro.update(s.id, { saldo: s.saldoAnt, movimientos_mes_acumulado: s.acumAnt });
        } else if (s.type === "ProductoCredito") {
          await base44.asServiceRole.entities.ProductoCredito.update(s.id, { saldo: s.saldoAnt });
        }
      } catch (e) { /* best effort */ }
    }
    try {
      const movsCreados = await base44.asServiceRole.entities.MovimientoContable.filter({ comprobante_id: comprobante.id });
      for (const m of movsCreados) await base44.asServiceRole.entities.MovimientoContable.delete(m.id);
    } catch (e) { /* best effort */ }
    throw new Error(`Error tras modificar saldos: ${error.message}. Saldos nuevos revertidos. Revise el comprobante manualmente.`);
  }

  return { comprobante: { ...comprobante, tipo, fecha, descripcion: descripcion.trim(), total_debito: totalDebito, total_credito: totalCredito }, warnings };
}

// === Anulación de comprobante (lógica extraída para reutilización) ===
export async function ejecutarAnulacion(base44, comprobante, user, motivo) {
  const movimientos = await base44.asServiceRole.entities.MovimientoContable.filter({
    comprobante_id: comprobante.id, estado: "activo"
  });

  for (const mov of movimientos) {
    if (mov.cuenta_ahorro_id) {
      await actualizarSaldoCuentaAhorro(base44, mov.cuenta_ahorro_id, mov.debito, mov.credito, true);
    }
    if (mov.producto_credito_id) {
      await actualizarSaldoProductoCredito(base44, mov.producto_credito_id, mov.debito, mov.credito, true);
    }
    await base44.asServiceRole.entities.MovimientoContable.update(mov.id, { estado: "anulado" });
  }

  await base44.asServiceRole.entities.ComprobanteContable.update(comprobante.id, {
    estado: "anulado",
    anulado_por_email: user.email || "",
    anulado_at: new Date().toISOString(),
    motivo_anulacion: motivo
  });

  const año = Number(comprobante.fecha.substring(0, 4));
  const numeroNota = await obtenerConsecutivo(base44, año);
  const fechaHoy = new Date().toISOString().substring(0, 10);
  const fechaRegistroNota = new Date().toISOString();

  const notaCredito = await base44.asServiceRole.entities.ComprobanteContable.create({
    numero: numeroNota, tipo: "nota_credito", fecha: fechaHoy,
    descripcion: `Anulación comprobante ${comprobante.numero}: ${motivo}`,
    estado: "contabilizado",
    total_debito: comprobante.total_credito, total_credito: comprobante.total_debito,
    fecha_registro: fechaRegistroNota,
    created_by_email: user.email || "",
    comprobante_origen_id: comprobante.id
  });

  for (const mov of movimientos) {
    const cuentaStub = { codigo: Number(mov.subcuenta), grupo: mov.grupo, cuenta: mov.cuenta, concepto: mov.cuenta_nombre };
    const movInvertido = { ...mov, debito: mov.credito, credito: mov.debito, descripcion: `Reverso: ${mov.descripcion || ""}` };
    const movData = formatearMovimientoData(movInvertido, cuentaStub, mov.clase, notaCredito.id, fechaHoy, user.email || "", fechaRegistroNota);
    movData.cuenta_ahorro_id = "";
    movData.producto_credito_id = "";
    await base44.asServiceRole.entities.MovimientoContable.create(movData);
  }

  return { notaCredito, numeroNota, fechaHoy };
}