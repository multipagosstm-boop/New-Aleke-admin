// Lógica de la línea de negocio Emprendamos.
// Emprendamos asume (compra de cartera) las deudas de clientes con historial
// crediticio reportado, las administra y cobra intereses mensuales. El cliente
// puede tener créditos habituales (dentro del cupo de sus tarjetas) y extracupo
// (avances extras al 6%). Todo genera comprobante contable con subcuentas PUC
// dedicadas: 120507 (cartera), 410509 (intereses), 410510 (comisiones).

import { ejecutarCreacion, ejecutarAnulacion, ejecutarModificacionDirecta } from "./contabilidad.ts";
import { crearCuentaAhorro } from "./cuentas-ahorro.ts";

export const SUBCUENTA_CARTERA = "120502";   // Activo — deuda del cliente con Emprendamos (cartera Emprendamos)
export const SUBCUENTA_INTERESES = "410509"; // Ingreso — intereses devengados
export const SUBCUENTA_COMISIONES = "410510";// Ingreso — comisión por nuevo producto

const CLASES_NOMBRE = { 1: "Activo", 2: "Pasivo", 3: "Patrimonio", 4: "Ingreso", 5: "Gasto", 6: "Costos", 7: "Costos", 8: "Cuentas de Orden" };

// Asegura (idempotente) que existan las subcuentas PUC de Emprendamos como
// transaccionales. Se ejecuta al inicio de cada operación.
export async function ensureSubcuentas(base44) {
  const defs = [
    { codigo: 120502, concepto: "Cartera Emprendamos", naturaleza: "Débito", tipo_estado: "Balance" },
    { codigo: 410509, concepto: "Intereses Emprendamos", naturaleza: "Crédito", tipo_estado: "Resultado" },
    { codigo: 410510, concepto: "Comisiones Emprendamos", naturaleza: "Crédito", tipo_estado: "Resultado" }
  ];
  for (const d of defs) {
    const exist = await base44.asServiceRole.entities.Cuenta.filter({ codigo: d.codigo });
    if (exist.length > 0) {
      if (!exist[0].es_transaccional) {
        await base44.asServiceRole.entities.Cuenta.update(exist[0].id, { es_transaccional: true });
      }
      continue;
    }
    const s = String(d.codigo);
    await base44.asServiceRole.entities.Cuenta.create({
      codigo: d.codigo, nivel: "Subcuenta",
      clase: Number(s[0]), clase_nombre: CLASES_NOMBRE[Number(s[0])],
      grupo: Number(s.slice(0, 2)), cuenta: Number(s.slice(0, 4)), subcuenta: Number(s.slice(0, 6)),
      concepto: d.concepto, naturaleza: d.naturaleza, tipo_estado: d.tipo_estado, es_transaccional: true
    });
  }
}

function sumarMes(fecha, n) {
  const d = new Date(fecha + "T00:00:00");
  d.setMonth(d.getMonth() + n);
  return d.toISOString().substring(0, 10);
}
function previousPeriodo(fecha) {
  const d = new Date(fecha + "T00:00:00");
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().substring(0, 7);
}
// Próxima fecha de pago: dia_pago del mes en curso si aún no pasó, si no, del mes siguiente.
function proximaFechaPago(diaPago, desde) {
  const hoy = desde || new Date().toISOString().substring(0, 10);
  const [a, m] = hoy.split("-").map(Number);
  let fecha = `${a}-${String(m).padStart(2, "0")}-${String(diaPago).padStart(2, "0")}`;
  if (fecha < hoy) fecha = sumarMes(fecha, 1);
  return fecha;
}

async function generarCodigoCredito(base44) {
  const existentes = await base44.asServiceRole.entities.EmprendamosCredito.list();
  return "EM-" + String(existentes.length + 1).padStart(3, "0");
}

async function cupoTDCCliente(base44, clienteId) {
  const prods = await base44.asServiceRole.entities.ProductoCredito.filter({ titular_id: clienteId, estado: "activo" });
  return prods.filter((p) => p.tipo === "TDC").reduce((s, p) => s + (Number(p.cupo) || 0), 0);
}

// === Inscripción / compra de cartera ===
export async function inscribirCliente(base44, user, params) {
  const { cliente_id, fecha_ingreso, dia_pago, tasa_acordada, tasa_extracupo, capital_inicial, cda_apoderada_id, cuenta_origen, plan_trazado, notas } = params;
  if (!cliente_id) throw new Error("Cliente obligatorio");
  if (!fecha_ingreso) throw new Error("Fecha de ingreso obligatoria");
  if (!dia_pago || dia_pago < 1 || dia_pago > 28) throw new Error("Día de pago inválido (1-28)");
  if (tasa_acordada == null || tasa_acordada < 0) throw new Error("Tasa acordada inválida");
  if (!capital_inicial || capital_inicial <= 0) throw new Error("Capital inicial (deuda asumida) inválido");
  if (!cuenta_origen || !cuenta_origen.subcuenta) throw new Error("Seleccione la cuenta de origen del dinero para pagar las obligaciones");

  const ya = await base44.asServiceRole.entities.EmprendamosCliente.filter({ cliente_id, estado: "activo" });
  if (ya.length > 0) throw new Error("El cliente ya está inscrito activo en Emprendamos");

  await ensureSubcuentas(base44);

  const cliente = await base44.asServiceRole.entities.Cliente.get(cliente_id);
  if (!cliente) throw new Error("Cliente no encontrado");
  const tercero = cliente.nombre || "";

  // Asiento de compra de cartera: débito cartera Emprendamos / crédito origen del dinero.
  const movimientos = [
    { subcuenta: SUBCUENTA_CARTERA, debito: capital_inicial, credito: 0, descripcion: `Compra de cartera — ${tercero}`, tercero, cliente_id },
    { subcuenta: cuenta_origen.subcuenta, debito: 0, credito: capital_inicial, descripcion: "Pago obligaciones cliente", tercero, cliente_id, cuenta_ahorro_id: cuenta_origen.cuenta_ahorro_id || "", producto_credito_id: cuenta_origen.producto_credito_id || "" }
  ];
  const { comprobante, warnings } = await ejecutarCreacion(base44, user, {
    tipo: "egreso", fecha: fecha_ingreso, descripcion: `Inscripción Emprendamos — ${tercero}`, movimientos, modo: "balance"
  });

  const cupo = await cupoTDCCliente(base44, cliente_id);

  const inscrito = await base44.asServiceRole.entities.EmprendamosCliente.create({
    cliente_id, fecha_ingreso, dia_pago, tasa_acordada: Number(tasa_acordada),
    tasa_extracupo: Number(tasa_extracupo) || 0.06, capital_inicial, saldo_deuda: capital_inicial,
    cupo_asignado: cupo, extracupo_autorizado: 0, cda_apoderada_id: cda_apoderada_id || "",
    comprobante_cartera_id: comprobante.id, plan_trazado: plan_trazado || "", contrato_url: "",
    fecha_eligible_salida: sumarMes(fecha_ingreso, 12), estado: "activo", notas: notas || ""
  });

  // Agregar "emprendamos" a las líneas de negocio del cliente si no está.
  const lineas = cliente.lineas_negocio || [];
  if (!lineas.includes("emprendamos")) {
    await base44.asServiceRole.entities.Cliente.update(cliente_id, { lineas_negocio: [...lineas, "emprendamos"] });
  }

  // Crédito de cartera inicial (genera intereses a la tasa acordada).
  const codigo = await generarCodigoCredito(base44);
  const credito = await base44.asServiceRole.entities.EmprendamosCredito.create({
    emprendamos_cliente_id: inscrito.id, cliente_id, codigo, tipo: "cartera_inicial",
    concepto: "Cartera inicial asumida", capital: capital_inicial, tasa_nominal: Number(tasa_acordada),
    cuota_fija: 0, fecha: fecha_ingreso, dia_pago,
    fecha_proximo_pago: proximaFechaPago(dia_pago, fecha_ingreso),
    saldo_capital: capital_inicial, saldo_intereses: 0, estado: "vigente",
    comprobante_id: comprobante.id, producto_credito_id: "", notas: ""
  });

  await base44.asServiceRole.entities.HistoricoContable.create({
    comprobante_id: comprobante.id, numero_comprobante: comprobante.numero, accion: "inscripcion_emprendamos",
    descripcion: `Inscripción de ${tercero} — cartera inicial ${capital_inicial}`,
    monto_total: capital_inicial, usuario_email: user.email || "", fecha: fecha_ingreso
  });

  return { inscrito, credito, comprobante, warnings };
}

// === Inscripción con tabla de productos (préstamo inicial) ===
// El cliente aporta varios productos (TDC, crédito bancario, otro préstamo o
// un préstamo que Emprendamos le hace). Cada uno ya fue registrado en su sitio
// (ProductoCredito / Cuenta PUC / cuenta nuestra) desde el formulario; aquí se
// consolida el asiento de compra de cartera y se crea un EmprendamosCredito
// por producto.
//   Débito  120502 (cartera Emprendamos) = total
//   Crédito  la subcuenta de cada producto ingresado
export async function inscribirClienteProductos(base44, user, params) {
  const { cliente_id, fecha_ingreso, dia_pago, tasa_acordada, tasa_extracupo, cda_apoderada_id, cda_nueva, plan_trazado, notas, productos } = params;
  if (!cliente_id) throw new Error("Cliente obligatorio");
  if (!fecha_ingreso) throw new Error("Fecha de ingreso obligatoria");
  if (!dia_pago || dia_pago < 1 || dia_pago > 28) throw new Error("Día de pago inválido (1-28)");
  if (tasa_acordada == null || tasa_acordada < 0) throw new Error("Tasa acordada inválida");
  if (!productos || productos.length === 0) throw new Error("Ingrese al menos un producto");

  for (const p of productos) {
    if (!p.subcuenta) throw new Error("Cada producto debe tener una cuenta contable (subcuenta)");
    if (!p.saldo_inicial || Number(p.saldo_inicial) <= 0) throw new Error("Cada producto debe tener un saldo inicial válido");
  }
  const total = productos.reduce((s, p) => s + Number(p.saldo_inicial), 0);
  if (total <= 0) throw new Error("El total del préstamo inicial es inválido");

  const ya = await base44.asServiceRole.entities.EmprendamosCliente.filter({ cliente_id, estado: "activo" });
  if (ya.length > 0) throw new Error("El cliente ya está inscrito activo en Emprendamos");

  await ensureSubcuentas(base44);

  const cliente = await base44.asServiceRole.entities.Cliente.get(cliente_id);
  if (!cliente) throw new Error("Cliente no encontrado");
  const tercero = cliente.nombre || "";

  // Cuenta de ahorro gestionada (CDA apoderada): siempre se crea nueva desde cero.
  let cdaIdFinal = cda_apoderada_id || "";
  if (cda_nueva && cda_nueva.banco && cda_nueva.numero_completo) {
    const resCda = await crearCuentaAhorro(base44, user, {
      banco: cda_nueva.banco, titular_id: cliente_id,
      numero_completo: cda_nueva.numero_completo, nombre: cda_nueva.nombre || "",
      saldo: Number(cda_nueva.saldo) || 0, nota: cda_nueva.nota || ""
    });
    cdaIdFinal = resCda.cuenta.id;
  }
  if (cdaIdFinal && cliente.cda_asignada_id !== cdaIdFinal) {
    await base44.asServiceRole.entities.Cliente.update(cliente_id, { cda_asignada_id: cdaIdFinal });
  }

  const movimientos = [
    { subcuenta: SUBCUENTA_CARTERA, debito: total, credito: 0, descripcion: `Préstamo inicial Emprendamos — ${tercero}`, tercero, cliente_id }
  ];
  for (const p of productos) {
    movimientos.push({
      subcuenta: String(p.subcuenta), debito: 0, credito: Number(p.saldo_inicial),
      descripcion: p.concepto || `Producto ingresado`, tercero, cliente_id,
      producto_credito_id: p.producto_credito_id || "", cuenta_ahorro_id: p.cuenta_ahorro_id || ""
    });
  }
  const { comprobante, warnings } = await ejecutarCreacion(base44, user, {
    tipo: "diario", fecha: fecha_ingreso, descripcion: `Inscripción Emprendamos — ${tercero}`, movimientos, modo: "balance"
  });

  const cupo = await cupoTDCCliente(base44, cliente_id);

  const inscrito = await base44.asServiceRole.entities.EmprendamosCliente.create({
    cliente_id, fecha_ingreso, dia_pago: Number(dia_pago), tasa_acordada: Number(tasa_acordada),
    tasa_extracupo: Number(tasa_extracupo) || 0.06, capital_inicial: total, saldo_deuda: total,
    cupo_asignado: cupo, extracupo_autorizado: 0, cda_apoderada_id: cdaIdFinal,
    comprobante_cartera_id: comprobante.id, plan_trazado: plan_trazado || "", contrato_url: "",
    fecha_eligible_salida: sumarMes(fecha_ingreso, 12), estado: "activo", notas: notas || ""
  });

  const lineas = cliente.lineas_negocio || [];
  if (!lineas.includes("emprendamos")) {
    await base44.asServiceRole.entities.Cliente.update(cliente_id, { lineas_negocio: [...lineas, "emprendamos"] });
  }

  // Un solo crédito de cartera inicial por inscripción; el asiento puede tener
  // varias partidas (un movimiento de crédito por cada producto aportado).
  const codigo = await generarCodigoCredito(base44);
  const credito = await base44.asServiceRole.entities.EmprendamosCredito.create({
    emprendamos_cliente_id: inscrito.id, cliente_id, codigo, tipo: "cartera_inicial",
    concepto: `Cartera inicial — ${productos.length} partida(s)`,
    capital: total, tasa_nominal: Number(tasa_acordada),
    cuota_fija: 0, fecha: fecha_ingreso, dia_pago: Number(dia_pago),
    fecha_proximo_pago: proximaFechaPago(Number(dia_pago), fecha_ingreso),
    saldo_capital: total, saldo_intereses: 0, estado: "vigente",
    comprobante_id: comprobante.id, producto_credito_id: "", notas: ""
  });
  const creditosCreados = [credito];

  await base44.asServiceRole.entities.HistoricoContable.create({
    comprobante_id: comprobante.id, numero_comprobante: comprobante.numero, accion: "inscripcion_emprendamos",
    descripcion: `Inscripción de ${tercero} — préstamo inicial ${total} (${productos.length} productos)`,
    monto_total: total, usuario_email: user.email || "", fecha: fecha_ingreso
  });

  return { inscrito, creditos: creditosCreados, comprobante, warnings };
}

// === Agregar crédito (habitual o extracupo) ===
export async function agregarCredito(base44, user, params) {
  const { emprendamos_cliente_id, tipo, concepto, capital, tasa_nominal, cuota_fija, fecha, cuenta_origen, producto_credito_id, notas } = params;
  if (!emprendamos_cliente_id) throw new Error("Cliente Emprendamos obligatorio");
  if (!["habitual", "extracupo"].includes(tipo)) throw new Error("Tipo debe ser habitual o extracupo");
  if (!capital || capital <= 0) throw new Error("Capital inválido");
  if (!fecha) throw new Error("Fecha obligatoria");
  if (!cuenta_origen || !cuenta_origen.subcuenta) throw new Error("Seleccione la cuenta de origen del dinero");

  await ensureSubcuentas(base44);

  const inscrito = await base44.asServiceRole.entities.EmprendamosCliente.get(emprendamos_cliente_id);
  if (!inscrito) throw new Error("Inscripción no encontrada");
  if (inscrito.estado !== "activo") throw new Error("El cliente no está activo en Emprendamos");

  const tasa = tipo === "extracupo" ? (Number(tasa_nominal) || inscrito.tasa_extracupo || 0.06) : (Number(tasa_nominal) || inscrito.tasa_acordada);

  // Gestor de cartera: validar cupos.
  const creditos = await base44.asServiceRole.entities.EmprendamosCredito.filter({ emprendamos_cliente_id, estado: "vigente" });
  if (tipo === "habitual") {
    const usado = creditos.filter((c) => c.tipo === "habitual" || c.tipo === "cartera_inicial").reduce((s, c) => s + (c.saldo_capital || 0), 0);
    if (usado + capital > inscrito.cupo_asignado) {
      throw new Error(`Cupo insuficiente: usado ${usado} + solicitado ${capital} supera el cupo asignado ${inscrito.cupo_asignado}`);
    }
  } else {
    const usadoExt = creditos.filter((c) => c.tipo === "extracupo").reduce((s, c) => s + (c.saldo_capital || 0), 0);
    if (inscrito.extracupo_autorizado > 0 && usadoExt + capital > inscrito.extracupo_autorizado) {
      throw new Error(`Extracupo insuficiente: usado ${usadoExt} + solicitado ${capital} supera el autorizado ${inscrito.extracupo_autorizado}`);
    }
  }

  const cliente = await base44.asServiceRole.entities.Cliente.get(inscrito.cliente_id);
  const tercero = cliente?.nombre || "";

  const movimientos = [
    { subcuenta: SUBCUENTA_CARTERA, debito: capital, credito: 0, descripcion: `Crédito ${tipo} — ${tercero}`, tercero, cliente_id: inscrito.cliente_id },
    { subcuenta: cuenta_origen.subcuenta, debito: 0, credito: capital, descripcion: concepto || `Préstamo ${tipo}`, tercero, cliente_id: inscrito.cliente_id, cuenta_ahorro_id: cuenta_origen.cuenta_ahorro_id || "", producto_credito_id: cuenta_origen.producto_credito_id || "" }
  ];
  const { comprobante, warnings } = await ejecutarCreacion(base44, user, {
    tipo: "egreso", fecha, descripcion: `Crédito ${tipo} Emprendamos — ${tercero}`, movimientos, modo: "balance"
  });

  const codigo = await generarCodigoCredito(base44);
  const credito = await base44.asServiceRole.entities.EmprendamosCredito.create({
    emprendamos_cliente_id, cliente_id: inscrito.cliente_id, codigo, tipo, concepto: concepto || `Crédito ${tipo}`,
    capital, tasa_nominal: tasa, cuota_fija: Number(cuota_fija) || 0, fecha, dia_pago: inscrito.dia_pago,
    fecha_proximo_pago: proximaFechaPago(inscrito.dia_pago, fecha),
    saldo_capital: capital, saldo_intereses: 0, estado: "vigente",
    comprobante_id: comprobante.id, producto_credito_id: producto_credito_id || "", notas: notas || ""
  });

  await base44.asServiceRole.entities.EmprendamosCliente.update(emprendamos_cliente_id, {
    saldo_deuda: (inscrito.saldo_deuda || 0) + capital
  });

  return { credito, comprobante, warnings };
}

// === Comisión por nuevo producto adquirido (10%) ===
export async function registrarComision(base44, user, params) {
  const { emprendamos_cliente_id, producto, base, porcentaje, fecha, notas } = params;
  if (!emprendamos_cliente_id) throw new Error("Cliente Emprendamos obligatorio");
  if (!base || base <= 0) throw new Error("Base (cupo o saldo del producto) inválida");
  if (!fecha) throw new Error("Fecha obligatoria");
  const pct = Number(porcentaje) || 0.10;
  const comision = Math.round(base * pct);

  await ensureSubcuentas(base44);

  const inscrito = await base44.asServiceRole.entities.EmprendamosCliente.get(emprendamos_cliente_id);
  if (!inscrito) throw new Error("Inscripción no encontrada");
  const cliente = await base44.asServiceRole.entities.Cliente.get(inscrito.cliente_id);
  const tercero = cliente?.nombre || "";

  // La comisión se carga a la cartera del cliente y se reconoce como ingreso.
  const movimientos = [
    { subcuenta: SUBCUENTA_CARTERA, debito: comision, credito: 0, descripcion: `Comisión ${producto || "nuevo producto"} — ${tercero}`, tercero, cliente_id: inscrito.cliente_id },
    { subcuenta: SUBCUENTA_COMISIONES, debito: 0, credito: comision, descripcion: `Comisión 10% por ${producto || "producto adquirido"}`, tercero, cliente_id: inscrito.cliente_id }
  ];
  const { comprobante, warnings } = await ejecutarCreacion(base44, user, {
    tipo: "diario", fecha, descripcion: `Comisión Emprendamos — ${tercero}`, movimientos, modo: "resultado"
  });

  const codigo = await generarCodigoCredito(base44);
  const credito = await base44.asServiceRole.entities.EmprendamosCredito.create({
    emprendamos_cliente_id, cliente_id: inscrito.cliente_id, codigo, tipo: "comision",
    concepto: `Comisión ${producto || "nuevo producto"} (${pct * 100}%)`, capital: comision, tasa_nominal: 0,
    cuota_fija: 0, fecha, dia_pago: inscrito.dia_pago, fecha_proximo_pago: "", saldo_capital: comision,
    saldo_intereses: 0, estado: "vigente", comprobante_id: comprobante.id, producto_credito_id: "", notas: notas || ""
  });

  await base44.asServiceRole.entities.EmprendamosCliente.update(emprendamos_cliente_id, {
    saldo_deuda: (inscrito.saldo_deuda || 0) + comision
  });

  return { credito, comision, comprobante, warnings };
}

// === Registro de nuevo cupo TDC ===
// El cliente adquirió una nueva TDC: se vincula el producto, se refresca el
// cupo_asignado (suma de cupos de sus TDC) y se cobra la comisión (10% por
// defecto) sobre el cupo de la nueva tarjeta en un solo paso.
export async function registrarNuevoCupo(base44, user, params) {
  const { emprendamos_cliente_id, producto_credito_id, fecha, porcentaje, notas, cobrar_comision } = params;
  if (!emprendamos_cliente_id) throw new Error("Cliente Emprendamos obligatorio");
  if (!producto_credito_id) throw new Error("Seleccione la TDC adquirida");
  if (!fecha) throw new Error("Fecha obligatoria");
  const cobrar = cobrar_comision !== false;
  const pct = Number(porcentaje) || 0.10;

  await ensureSubcuentas(base44);

  const inscrito = await base44.asServiceRole.entities.EmprendamosCliente.get(emprendamos_cliente_id);
  if (!inscrito) throw new Error("Inscripción no encontrada");
  if (inscrito.estado !== "activo") throw new Error("El cliente no está activo en Emprendamos");

  const tdc = await base44.asServiceRole.entities.ProductoCredito.get(producto_credito_id);
  if (!tdc) throw new Error("La TDC seleccionada no existe");
  if (tdc.tipo !== "TDC") throw new Error("El producto seleccionado no es una TDC");
  if (tdc.titular_id !== inscrito.cliente_id) throw new Error("La TDC no pertenece a este cliente");

  const cliente = await base44.asServiceRole.entities.Cliente.get(inscrito.cliente_id);
  const tercero = cliente?.nombre || "";

  // Refrescar cupo_asignado = suma de cupos de las TDC del cliente.
  const cupo = await cupoTDCCliente(base44, inscrito.cliente_id);
  await base44.asServiceRole.entities.EmprendamosCliente.update(emprendamos_cliente_id, { cupo_asignado: cupo });

  let credito = null, comprobante = null, comision = 0, warnings = [];
  if (cobrar) {
    comision = Math.round((Number(tdc.cupo) || 0) * pct);
    if (comision <= 0) throw new Error("La TDC no tiene cupo asignado; no se puede calcular la comisión");
    const movimientos = [
      { subcuenta: SUBCUENTA_CARTERA, debito: comision, credito: 0, descripcion: `Comisión nuevo cupo — ${tercero}`, tercero, cliente_id: inscrito.cliente_id },
      { subcuenta: SUBCUENTA_COMISIONES, debito: 0, credito: comision, descripcion: `Comisión ${(pct * 100)}% por nueva TDC`, tercero, cliente_id: inscrito.cliente_id }
    ];
    const res = await ejecutarCreacion(base44, user, {
      tipo: "diario", fecha, descripcion: `Comisión nuevo cupo Emprendamos — ${tercero}`, movimientos, modo: "resultado"
    });
    comprobante = res.comprobante; warnings = res.warnings;
    const codigo = await generarCodigoCredito(base44);
    credito = await base44.asServiceRole.entities.EmprendamosCredito.create({
      emprendamos_cliente_id, cliente_id: inscrito.cliente_id, codigo, tipo: "comision",
      concepto: `Comisión nueva TDC (${pct * 100}%)`, capital: comision, tasa_nominal: 0,
      cuota_fija: 0, fecha, dia_pago: inscrito.dia_pago, fecha_proximo_pago: "", saldo_capital: comision,
      saldo_intereses: 0, estado: "vigente", comprobante_id: comprobante.id, producto_credito_id, notas: notas || ""
    });
    await base44.asServiceRole.entities.EmprendamosCliente.update(emprendamos_cliente_id, {
      saldo_deuda: (inscrito.saldo_deuda || 0) + comision
    });
    await base44.asServiceRole.entities.HistoricoContable.create({
      comprobante_id: comprobante.id, numero_comprobante: comprobante.numero, accion: "nuevo_cupo_emprendamos",
      descripcion: `Nuevo cupo TDC ${tdc.nombre} — comisión ${comision}`,
      monto_total: comision, usuario_email: user.email || "", fecha
    });
  }

  return { cupo_asignado: cupo, credito, comision, comprobante, warnings };
}

// === Generación mensual de intereses (devengado) ===
export async function generarInteresesMensuales(base44, user, params) {
  const { emprendamos_cliente_id, periodo, fecha } = params;
  const f = fecha || new Date().toISOString().substring(0, 10);
  const per = periodo || previousPeriodo(f);
  const inscrito = await base44.asServiceRole.entities.EmprendamosCliente.get(emprendamos_cliente_id);
  if (!inscrito) throw new Error("Inscripción no encontrada");
  if (inscrito.estado !== "activo") throw new Error("El cliente no está activo");

  await ensureSubcuentas(base44);

  const cliente = await base44.asServiceRole.entities.Cliente.get(inscrito.cliente_id);
  const tercero = cliente?.nombre || "";

  const creditos = await base44.asServiceRole.entities.EmprendamosCredito.filter({ emprendamos_cliente_id, estado: "vigente" });
  const generados = [];
  let totalIntereses = 0;
  const movimientos = [];

  for (const c of creditos) {
    if (c.tipo === "comision") continue; // las comisiones no generan intereses
    if ((c.saldo_capital || 0) <= 0) continue;
    // Idempotente: no regenerar el mismo período para el mismo crédito.
    const yaGen = await base44.asServiceRole.entities.EmprendamosInteres.filter({ credito_id: c.id, periodo: per, estado: "generado" });
    if (yaGen.length > 0) continue;

    const intereses = Math.round((c.saldo_capital || 0) * (c.tasa_nominal || 0));
    if (intereses <= 0) continue;

    const interes = await base44.asServiceRole.entities.EmprendamosInteres.create({
      emprendamos_cliente_id, cliente_id: inscrito.cliente_id, credito_id: c.id, periodo: per,
      capital_base: c.saldo_capital, tasa: c.tasa_nominal, intereses, comprobante_id: "", estado: "generado", fecha: f
    });

    await base44.asServiceRole.entities.EmprendamosCredito.update(c.id, {
      saldo_intereses: (c.saldo_intereses || 0) + intereses
    });

    generados.push({ credito_id: c.id, codigo: c.codigo, capital_base: c.saldo_capital, intereses, interes_id: interes.id });
    totalIntereses += intereses;
  }

  if (generados.length === 0) return { generados: [], totalIntereses: 0, comprobante: null, warnings: [] };

  // Un único comprobante con todos los intereses del período.
  movimientos.push({ subcuenta: SUBCUENTA_CARTERA, debito: totalIntereses, credito: 0, descripcion: `Intereses ${per} — ${tercero}`, tercero, cliente_id: inscrito.cliente_id });
  movimientos.push({ subcuenta: SUBCUENTA_INTERESES, debito: 0, credito: totalIntereses, descripcion: `Intereses devengados ${per}`, tercero, cliente_id: inscrito.cliente_id });
  const { comprobante, warnings } = await ejecutarCreacion(base44, user, {
    tipo: "diario", fecha: f, descripcion: `Intereses Emprendamos ${per} — ${tercero}`, movimientos, modo: "resultado"
  });

  for (const g of generados) {
    await base44.asServiceRole.entities.EmprendamosInteres.update(g.interes_id, { comprobante_id: comprobante.id });
  }
  await base44.asServiceRole.entities.EmprendamosCliente.update(emprendamos_cliente_id, {
    saldo_deuda: (inscrito.saldo_deuda || 0) + totalIntereses
  });

  return { generados, totalIntereses, comprobante, warnings };
}

// === Registro de abono ===
export async function registrarAbono(base44, user, params) {
  const { emprendamos_cliente_id, fecha, valor_total, cuenta_ingreso, tipo, detalles, notas } = params;
  if (!emprendamos_cliente_id) throw new Error("Cliente Emprendamos obligatorio");
  if (!fecha) throw new Error("Fecha obligatoria");
  if (!valor_total || valor_total <= 0) throw new Error("Valor inválido");
  if (!cuenta_ingreso || !cuenta_ingreso.subcuenta) throw new Error("Seleccione la cuenta de ingreso del abono");
  if (!detalles || detalles.length === 0) throw new Error("Seleccione al menos un crédito");

  const suma = detalles.reduce((s, d) => s + (Number(d.valor_aplicado) || 0), 0);
  if (Math.abs(suma - valor_total) > 0.01)
    throw new Error(`Debe aplicar todo el abono (${valor_total}). Aplicado: ${suma}`);

  await ensureSubcuentas(base44);

  const inscrito = await base44.asServiceRole.entities.EmprendamosCliente.get(emprendamos_cliente_id);
  if (!inscrito) throw new Error("Inscripción no encontrada");
  const cliente = await base44.asServiceRole.entities.Cliente.get(inscrito.cliente_id);
  const tercero = cliente?.nombre || "";

  // Resolver y validar créditos, y distribuir el abono en intereses + capital.
  const detallesCalculados = [];
  for (const d of detalles) {
    const c = await base44.asServiceRole.entities.EmprendamosCredito.get(d.credito_id);
    if (!c) throw new Error(`Crédito no encontrado`);
    if (c.estado !== "vigente") throw new Error(`El crédito ${c.codigo} no está vigente`);
    const valor = Number(d.valor_aplicado) || 0;
    if (valor <= 0) continue;
    const intereses = Math.min(valor, c.saldo_intereses || 0);
    const capital = Math.min(valor - intereses, c.saldo_capital || 0);
    detallesCalculados.push({ credito: c, valor, intereses, capital });
  }
  if (detallesCalculados.length === 0) throw new Error("Ningún crédito recibe abono válido");

  // Asiento de ingreso: débito cuenta de ingreso / crédito cartera (reduce la deuda).
  const movimientos = [
    { subcuenta: cuenta_ingreso.subcuenta, debito: valor_total, credito: 0, descripcion: "Abono Emprendamos", tercero, cliente_id: inscrito.cliente_id, cuenta_ahorro_id: cuenta_ingreso.cuenta_ahorro_id || "", producto_credito_id: cuenta_ingreso.producto_credito_id || "", tipo_movimiento_tdc: cuenta_ingreso.producto_credito_id ? "abono" : null },
    { subcuenta: SUBCUENTA_CARTERA, debito: 0, credito: valor_total, descripcion: `Abono a cartera — ${tercero}`, tercero, cliente_id: inscrito.cliente_id }
  ];
  const { comprobante, warnings } = await ejecutarCreacion(base44, user, {
    tipo: "ingreso", fecha, descripcion: `Abono Emprendamos — ${tercero}`, movimientos, modo: "balance"
  });

  const abono = await base44.asServiceRole.entities.EmprendamosAbono.create({
    cliente_id: inscrito.cliente_id, emprendamos_cliente_id, fecha, valor_total,
    tipo: tipo || "otro", comprobante_id: comprobante.id, subcuenta_ingreso: cuenta_ingreso.subcuenta,
    cda_id: cuenta_ingreso.cuenta_ahorro_id || "", producto_credito_id: cuenta_ingreso.producto_credito_id || "",
    detalles: detallesCalculados.map((dc) => ({
      credito_id: dc.credito.id, valor_aplicado: dc.valor, intereses: dc.intereses, capital: dc.capital
    })), notas: notas || ""
  });

  // Aplicar a cada crédito y recalcular estado.
  let nuevaDeuda = inscrito.saldo_deuda || 0;
  for (const dc of detallesCalculados) {
    const nuevoSaldoCap = Math.max(0, (dc.credito.saldo_capital || 0) - dc.capital);
    const nuevoSaldoInt = Math.max(0, (dc.credito.saldo_intereses || 0) - dc.intereses);
    const saldado = nuevoSaldoCap <= 0.01 && nuevoSaldoInt <= 0.01;
    await base44.asServiceRole.entities.EmprendamosCredito.update(dc.credito.id, {
      saldo_capital: nuevoSaldoCap, saldo_intereses: nuevoSaldoInt,
      estado: saldado ? "saldado" : "vigente",
      fecha_proximo_pago: saldado ? "" : proximaFechaPago(dc.credito.dia_pago || inscrito.dia_pago, fecha)
    });
    nuevaDeuda -= dc.valor;
  }
  await base44.asServiceRole.entities.EmprendamosCliente.update(emprendamos_cliente_id, { saldo_deuda: Math.max(0, nuevaDeuda) });

  return { abono, comprobante, warnings };
}

// === Estado de cuenta de un cliente para un período ===
export async function generarEstadoCuenta(base44, params) {
  const { emprendamos_cliente_id, periodo } = params;
  const inscrito = await base44.asServiceRole.entities.EmprendamosCliente.get(emprendamos_cliente_id);
  if (!inscrito) throw new Error("Inscripción no encontrada");

  const per = periodo || previousPeriodo(new Date().toISOString().substring(0, 10));
  const [anio, mes] = per.split("-").map(Number);
  const inicio = `${per}-01`;
  const fin = sumarMes(inicio, 1);

  const creditos = await base44.asServiceRole.entities.EmprendamosCredito.filter({ emprendamos_cliente_id });
  const intereses = await base44.asServiceRole.entities.EmprendamosInteres.filter({ emprendamos_cliente_id, periodo: per, estado: "generado" });
  const abonos = await base44.asServiceRole.entities.EmprendamosAbono.filter({ emprendamos_cliente_id });

  const prestamosHechos = creditos.filter((c) => c.fecha >= inicio && c.fecha < fin && c.tipo !== "cartera_inicial");
  const abonosPeriodo = abonos.filter((a) => a.fecha >= inicio && a.fecha < fin);
  const totalIntereses = intereses.reduce((s, i) => s + (i.intereses || 0), 0);
  const totalAbonos = abonosPeriodo.reduce((s, a) => s + (a.valor_total || 0), 0);
  const totalPrestamos = prestamosHechos.reduce((s, c) => s + (c.capital || 0), 0);

  // Saldo inicial = saldo_deuda actual - intereses del período - préstamos del período + abonos del período
  const saldoFinal = inscrito.saldo_deuda || 0;
  const saldoInicial = saldoFinal - totalIntereses - totalPrestamos + totalAbonos;

  return {
    periodo: per, saldo_inicial: saldoInicial, intereses_generados: totalIntereses,
    prestamos_hechos: totalPrestamos, abonos: totalAbonos, saldo_final: saldoFinal,
    detalle_intereses: intereses.map((i) => ({ credito_id: i.credito_id, capital_base: i.capital_base, tasa: i.tasa, intereses: i.intereses })),
    detalle_prestamos: prestamosHechos.map((c) => ({ codigo: c.codigo, tipo: c.tipo, capital: c.capital })),
    detalle_abonos: abonosPeriodo.map((a) => ({ fecha: a.fecha, valor: a.valor_total, tipo: a.tipo })),
    creditos: creditos.map((c) => ({ codigo: c.codigo, tipo: c.tipo, saldo_capital: c.saldo_capital, saldo_intereses: c.saldo_intereses, estado: c.estado }))
  };
}

// === Recalcular estado (mora, saldado) ===
export async function recalcularEstado(base44) {
  const hoy = new Date().toISOString().substring(0, 10);
  const inscritos = await base44.asServiceRole.entities.EmprendamosCliente.filter({ estado: "activo" });
  let actualizados = 0;
  for (const ins of inscritos) {
    const creditos = await base44.asServiceRole.entities.EmprendamosCredito.filter({ emprendamos_cliente_id: ins.id });
    const vigentes = creditos.filter((c) => c.estado === "vigente");
    // Recalcular saldo_deuda desde los créditos (fuente de verdad).
    const saldoDeuda = vigentes.reduce((s, c) => s + (c.saldo_capital || 0) + (c.saldo_intereses || 0), 0);
    // Saldar créditos sin saldo.
    for (const c of vigentes) {
      if ((c.saldo_capital || 0) <= 0.01 && (c.saldo_intereses || 0) <= 0.01) {
        await base44.asServiceRole.entities.EmprendamosCredito.update(c.id, { estado: "saldado" });
      } else {
        await base44.asServiceRole.entities.EmprendamosCredito.update(c.id, { fecha_proximo_pago: proximaFechaPago(ins.dia_pago, hoy) });
      }
    }
    await base44.asServiceRole.entities.EmprendamosCliente.update(ins.id, { saldo_deuda: saldoDeuda });
    actualizados++;
  }
  return { actualizados };
}

// === Salida del cliente (≥ 1 año) ===
export async function salirCliente(base44, user, params) {
  const { emprendamos_cliente_id, fecha, motivo } = params;
  const inscrito = await base44.asServiceRole.entities.EmprendamosCliente.get(emprendamos_cliente_id);
  if (!inscrito) throw new Error("Inscripción no encontrada");
  const f = fecha || new Date().toISOString().substring(0, 10);
  if (f < inscrito.fecha_eligible_salida) {
    throw new Error(`El cliente aún no es elegible para salir. Fecha elegible: ${inscrito.fecha_eligible_salida}`);
  }
  const saldo = inscrito.saldo_deuda || 0;
  await base44.asServiceRole.entities.EmprendamosCliente.update(emprendamos_cliente_id, {
    estado: "salido", fecha_salida: f, notas: (inscrito.notas || "") + (motivo ? `\nSalida: ${motivo}` : "")
  });
  await base44.asServiceRole.entities.HistoricoContable.create({
    comprobante_id: inscrito.comprobante_cartera_id || "", numero_comprobante: "", accion: "salida_emprendamos",
    descripcion: `Salida de Emprendamos. Saldo pendiente: ${saldo}. ${motivo || ""}`,
    monto_total: saldo, usuario_email: user.email || "", fecha: f
  });
  return { ok: true, saldo_pendiente: saldo };
}

// === Eliminación de abono (anula comprobante y reversa saldos) ===
export async function eliminarAbono(base44, user, params) {
  const { abono_id, motivo } = params;
  const abono = await base44.asServiceRole.entities.EmprendamosAbono.get(abono_id);
  if (!abono) throw new Error("Abono no encontrado");

  if (abono.comprobante_id) {
    const comprobante = await base44.asServiceRole.entities.ComprobanteContable.get(abono.comprobante_id);
    if (comprobante && comprobante.estado !== "anulado") {
      await ejecutarAnulacion(base44, comprobante, user, motivo || "Eliminación abono Emprendamos");
    }
  }

  // Reversar la aplicación a cada crédito.
  for (const d of (abono.detalles || [])) {
    const c = await base44.asServiceRole.entities.EmprendamosCredito.get(d.credito_id);
    if (!c) continue;
    await base44.asServiceRole.entities.EmprendamosCredito.update(c.id, {
      saldo_capital: (c.saldo_capital || 0) + (d.capital || 0),
      saldo_intereses: (c.saldo_intereses || 0) + (d.intereses || 0),
      estado: "vigente"
    });
  }
  const inscrito = await base44.asServiceRole.entities.EmprendamosCliente.get(abono.emprendamos_cliente_id);
  if (inscrito) {
    await base44.asServiceRole.entities.EmprendamosCliente.update(inscrito.id, {
      saldo_deuda: (inscrito.saldo_deuda || 0) + (abono.valor_total || 0)
    });
  }

  await base44.asServiceRole.entities.EmprendamosAbono.delete(abono_id);
  await base44.asServiceRole.entities.HistoricoContable.create({
    comprobante_id: abono.comprobante_id || "", numero_comprobante: "", accion: "eliminacion_abono_emprendamos",
    descripcion: `Abono Emprendamos (${abono.valor_total}) eliminado: ${motivo || ""}`,
    monto_total: abono.valor_total || 0, usuario_email: user.email || "", fecha: new Date().toISOString().substring(0, 10)
  });
  return { ok: true };
}

// === Eliminación de crédito ===
export async function eliminarCredito(base44, user, params) {
  const { credito_id, motivo } = params;
  const c = await base44.asServiceRole.entities.EmprendamosCredito.get(credito_id);
  if (!c) throw new Error("Crédito no encontrado");

  const inscrito = await base44.asServiceRole.entities.EmprendamosCliente.get(c.emprendamos_cliente_id);
  const abonos = inscrito ? await base44.asServiceRole.entities.EmprendamosAbono.filter({ emprendamos_cliente_id: c.emprendamos_cliente_id }) : [];
  const tieneAbonos = abonos.some((a) => (a.detalles || []).some((d) => d.credito_id === credito_id));
  if (tieneAbonos) throw new Error("El crédito tiene abonos aplicados. Elimine primero los abonos.");

  if (c.tipo === "cartera_inicial") {
    if (!inscrito) throw new Error("Inscripción no encontrada");
    const todosCreditos = await base44.asServiceRole.entities.EmprendamosCredito.filter({ emprendamos_cliente_id: c.emprendamos_cliente_id });
    const otros = todosCreditos.filter((cr) => cr.id !== credito_id);
    const otrosNoCartera = otros.filter((cr) => cr.tipo !== "cartera_inicial");
    if (otrosNoCartera.length > 0) throw new Error("Elimine primero los créditos adicionales (habituales/extracupo/comisiones).");
    if (abonos.length > 0) throw new Error("La inscripción tiene abonos. Elimine primero los abonos.");

    const cliente = await base44.asServiceRole.entities.Cliente.get(c.cliente_id);
    const tercero = cliente?.nombre || "";

    // Multi-producto: quitar solo este producto del asiento compartido.
    if (otros.length > 0 && inscrito.comprobante_cartera_id) {
      const comprobante = await base44.asServiceRole.entities.ComprobanteContable.get(inscrito.comprobante_cartera_id);
      if (comprobante && comprobante.estado !== "anulado") {
        const movs = await base44.asServiceRole.entities.MovimientoContable.filter({ comprobante_id: comprobante.id, estado: "activo" });
        const carteraMov = movs.find((m) => String(m.subcuenta) === SUBCUENTA_CARTERA);
        const prodMovs = movs.filter((m) => String(m.subcuenta) !== SUBCUENTA_CARTERA);
        const carteraIniciales = todosCreditos.filter((cr) => cr.tipo === "cartera_inicial");
        const idxEste = carteraIniciales.findIndex((cr) => cr.id === credito_id);
        const restantes = prodMovs.filter((_, i) => i !== idxEste);
        const total = restantes.reduce((s, m) => s + (Number(m.credito) || 0), 0);
        const movsAsiento = [];
        if (carteraMov) movsAsiento.push({ subcuenta: SUBCUENTA_CARTERA, debito: total, credito: 0, descripcion: `Préstamo inicial Emprendamos — ${tercero}`, tercero, cliente_id: c.cliente_id });
        for (const m of restantes) movsAsiento.push({ subcuenta: String(m.subcuenta), debito: 0, credito: Number(m.credito) || 0, descripcion: m.descripcion || "Producto ingresado", tercero, cliente_id: c.cliente_id, producto_credito_id: m.producto_credito_id || "", cuenta_ahorro_id: m.cuenta_ahorro_id || "" });
        await ejecutarModificacionDirecta(base44, comprobante, user, { tipo: comprobante.tipo, fecha: comprobante.fecha, descripcion: comprobante.descripcion, movimientos: movsAsiento, modo: "balance" });
        const restantesCreditos = carteraIniciales.filter((cr) => cr.id !== credito_id);
        for (let i = 0; i < restantesCreditos.length; i++) {
          const cred = restantesCreditos[i];
          const rmov = restantes[i];
          const newCap = Number(rmov.credito) || 0;
          const delta = newCap - (cred.capital || 0);
          await base44.asServiceRole.entities.EmprendamosCredito.update(cred.id, { capital: newCap, saldo_capital: Math.max(0, (cred.saldo_capital || 0) + delta), producto_credito_id: rmov.producto_credito_id || "" });
        }
        await base44.asServiceRole.entities.EmprendamosCliente.update(inscrito.id, { capital_inicial: total, saldo_deuda: Math.max(0, (inscrito.saldo_deuda || 0) - (c.capital || 0)) });
      }
      await base44.asServiceRole.entities.EmprendamosCredito.delete(credito_id);
      await base44.asServiceRole.entities.HistoricoContable.create({ comprobante_id: inscrito.comprobante_cartera_id || "", numero_comprobante: "", accion: "eliminacion_credito_emprendamos", descripcion: `Crédito ${c.codigo} eliminado (producto de inscripción): ${motivo || ""}`, monto_total: c.capital || 0, usuario_email: user.email || "", fecha: new Date().toISOString().substring(0, 10) });
      return { ok: true };
    }

    // Único crédito cartera inicial: eliminar inscripción completa.
    if (inscrito.comprobante_cartera_id) {
      const comprobante = await base44.asServiceRole.entities.ComprobanteContable.get(inscrito.comprobante_cartera_id);
      if (comprobante && comprobante.estado !== "anulado") {
        await ejecutarAnulacion(base44, comprobante, user, motivo || "Eliminación inscripción Emprendamos");
      }
    }
    await base44.asServiceRole.entities.EmprendamosCredito.delete(credito_id);
    await base44.asServiceRole.entities.EmprendamosCliente.delete(inscrito.id);
    if (cliente) {
      const lineas = (cliente.lineas_negocio || []).filter((l) => l !== "emprendamos");
      await base44.asServiceRole.entities.Cliente.update(inscrito.cliente_id, { lineas_negocio: lineas });
    }
    await base44.asServiceRole.entities.HistoricoContable.create({ comprobante_id: inscrito.comprobante_cartera_id || "", numero_comprobante: "", accion: "eliminacion_inscripcion_emprendamos", descripcion: `Inscripción de ${tercero} eliminada: ${motivo || ""}`, monto_total: c.capital || 0, usuario_email: user.email || "", fecha: new Date().toISOString().substring(0, 10) });
    return { ok: true };
  }

  // Crédito habitual/extracupo/comision (asiento propio).
  if (c.comprobante_id) {
    const comprobante = await base44.asServiceRole.entities.ComprobanteContable.get(c.comprobante_id);
    if (comprobante && comprobante.estado !== "anulado") {
      await ejecutarAnulacion(base44, comprobante, user, motivo || `Eliminación crédito ${c.codigo}`);
    }
  }
  if (inscrito) {
    await base44.asServiceRole.entities.EmprendamosCliente.update(inscrito.id, {
      saldo_deuda: Math.max(0, (inscrito.saldo_deuda || 0) - (c.saldo_capital || 0) - (c.saldo_intereses || 0))
    });
  }
  await base44.asServiceRole.entities.EmprendamosCredito.delete(credito_id);
  await base44.asServiceRole.entities.HistoricoContable.create({ comprobante_id: c.comprobante_id || "", numero_comprobante: "", accion: "eliminacion_credito_emprendamos", descripcion: `Crédito ${c.codigo} eliminado: ${motivo || ""}`, monto_total: c.capital || 0, usuario_email: user.email || "", fecha: new Date().toISOString().substring(0, 10) });
  return { ok: true };
}

// === Edición de inscripción (notas, plan, cupos) ===
export async function editarCliente(base44, user, params) {
  const { emprendamos_cliente_id, plan_trazado, extracupo_autorizado, tasa_acordada, tasa_extracupo, dia_pago, notas, estado } = params;
  const ins = await base44.asServiceRole.entities.EmprendamosCliente.get(emprendamos_cliente_id);
  if (!ins) throw new Error("Inscripción no encontrada");
  const update = {};
  if (plan_trazado !== undefined) update.plan_trazado = plan_trazado;
  if (extracupo_autorizado !== undefined) update.extracupo_autorizado = Number(extracupo_autorizado) || 0;
  if (tasa_acordada !== undefined) update.tasa_acordada = Number(tasa_acordada);
  if (tasa_extracupo !== undefined) update.tasa_extracupo = Number(tasa_extracupo);
  if (dia_pago !== undefined) update.dia_pago = Number(dia_pago);
  if (notas !== undefined) update.notas = notas;
  if (estado !== undefined) update.estado = estado;
  // Refrescar cupo desde las TDC actuales del cliente.
  update.cupo_asignado = await cupoTDCCliente(base44, ins.cliente_id);
  await base44.asServiceRole.entities.EmprendamosCliente.update(emprendamos_cliente_id, update);
  return { ok: true };
}

// === Edición de crédito (campos + asiento) ===
export async function editarCredito(base44, user, params) {
  const { credito_id, concepto, tasa_nominal, cuota_fija, fecha, notas, cuenta_origen, movimientos } = params;
  const c = await base44.asServiceRole.entities.EmprendamosCredito.get(credito_id);
  if (!c) throw new Error("Crédito no encontrado");

  const update = {};
  if (concepto !== undefined) update.concepto = concepto;
  if (tasa_nominal !== undefined) update.tasa_nominal = Number(tasa_nominal);
  if (cuota_fija !== undefined) update.cuota_fija = Number(cuota_fija) || 0;
  if (fecha !== undefined) update.fecha = fecha;
  if (notas !== undefined) update.notas = notas;

  if (c.comprobante_id) {
    const comprobante = await base44.asServiceRole.entities.ComprobanteContable.get(c.comprobante_id);
    if (comprobante && comprobante.estado !== "anulado") {
      const cliente = await base44.asServiceRole.entities.Cliente.get(c.cliente_id);
      const tercero = cliente?.nombre || "";

      // Cartera inicial: editar el asiento de inscripción (cuentas y valores por producto).
      if (c.tipo === "cartera_inicial" && movimientos && movimientos.length) {
        const nuevaFecha = fecha || comprobante.fecha;
        const productos = movimientos.map((m) => ({
          subcuenta: String(m.subcuenta),
          valor: Number(m.valor) || 0,
          concepto: concepto || m.descripcion || "Producto ingresado",
          producto_credito_id: m.producto_credito_id || "",
          cuenta_ahorro_id: m.cuenta_ahorro_id || ""
        }));
        const total = productos.reduce((s, p) => s + p.valor, 0);
        const movsAsiento = [
          { subcuenta: SUBCUENTA_CARTERA, debito: total, credito: 0, descripcion: `Préstamo inicial Emprendamos — ${tercero}`, tercero, cliente_id: c.cliente_id },
          ...productos.map((p) => ({ subcuenta: p.subcuenta, debito: 0, credito: p.valor, descripcion: p.concepto, tercero, cliente_id: c.cliente_id, producto_credito_id: p.producto_credito_id, cuenta_ahorro_id: p.cuenta_ahorro_id }))
        ];
        await ejecutarModificacionDirecta(base44, comprobante, user, {
          tipo: comprobante.tipo, fecha: nuevaFecha, descripcion: `Inscripción Emprendamos — ${tercero}`, movimientos: movsAsiento, modo: "balance"
        });

        const creditosIns = await base44.asServiceRole.entities.EmprendamosCredito.filter({ emprendamos_cliente_id: c.emprendamos_cliente_id, tipo: "cartera_inicial" });
        for (let i = 0; i < creditosIns.length; i++) {
          const cred = creditosIns[i];
          // Un crédito por inscripción: su capital es el total de las partidas.
          // ( compatibilidad legacy: si existen varios créditos, se reparte por producto )
          const newCap = creditosIns.length === 1
            ? total
            : ((cred.producto_credito_id && productos.find((p) => p.producto_credito_id === cred.producto_credito_id)) || productos[i])?.valor || (cred.capital || 0);
          const delta = newCap - (cred.capital || 0);
          const credUpd = {
            capital: newCap,
            saldo_capital: Math.max(0, (cred.saldo_capital || 0) + delta),
            fecha: nuevaFecha,
            concepto: (cred.id === credito_id ? (concepto || cred.concepto) : cred.concepto) || `Cartera inicial — ${productos.length} partida(s)`
          };
          if (cred.id === credito_id) {
            Object.assign(credUpd, {
              tasa_nominal: Number(tasa_nominal) || cred.tasa_nominal,
              cuota_fija: Number(cuota_fija) || 0,
              notas: notas !== undefined ? notas : cred.notas
            });
          }
          await base44.asServiceRole.entities.EmprendamosCredito.update(cred.id, credUpd);
        }

        const ins = await base44.asServiceRole.entities.EmprendamosCliente.get(c.emprendamos_cliente_id);
        if (ins) {
          const deltaTotal = total - (ins.capital_inicial || 0);
          await base44.asServiceRole.entities.EmprendamosCliente.update(ins.id, {
            capital_inicial: total,
            saldo_deuda: Math.max(0, (ins.saldo_deuda || 0) + deltaTotal)
          });
        }
        await base44.asServiceRole.entities.HistoricoContable.create({
          comprobante_id: c.comprobante_id, numero_comprobante: comprobante.numero, accion: "edicion_credito_emprendamos",
          descripcion: `Crédito ${c.codigo} editado (asiento inscripción)`, monto_total: total,
          usuario_email: user.email || "", fecha: new Date().toISOString().substring(0, 10)
        });
        return { ok: true };
      }

      // Crédito con asiento propio (habitual/extracupo/comision).
      if (c.tipo !== "cartera_inicial") {
        const nuevaFecha = fecha || comprobante.fecha;
        const nuevoConcepto = concepto !== undefined ? concepto : c.concepto;
        await base44.asServiceRole.entities.ComprobanteContable.update(comprobante.id, {
          fecha: nuevaFecha, descripcion: `Crédito ${c.tipo} Emprendamos — ${tercero}`
        });
        const movs = await base44.asServiceRole.entities.MovimientoContable.filter({ comprobante_id: comprobante.id, estado: "activo" });
        for (const m of movs) {
          const esCartera = String(m.subcuenta) === SUBCUENTA_CARTERA;
          if (esCartera) {
            await base44.asServiceRole.entities.MovimientoContable.update(m.id, { fecha: nuevaFecha, descripcion: `Crédito ${c.tipo} — ${tercero}` });
          } else if (cuenta_origen && cuenta_origen.subcuenta) {
            await base44.asServiceRole.entities.MovimientoContable.update(m.id, {
              fecha: nuevaFecha, subcuenta: String(cuenta_origen.subcuenta),
              cuenta_ahorro_id: cuenta_origen.cuenta_ahorro_id || "",
              producto_credito_id: cuenta_origen.producto_credito_id || "",
              descripcion: nuevoConcepto || `Préstamo ${c.tipo}`
            });
          } else {
            await base44.asServiceRole.entities.MovimientoContable.update(m.id, { fecha: nuevaFecha, descripcion: nuevoConcepto || `Préstamo ${c.tipo}` });
          }
        }
      }
    }
  }

  await base44.asServiceRole.entities.EmprendamosCredito.update(credito_id, update);
  await base44.asServiceRole.entities.HistoricoContable.create({
    comprobante_id: c.comprobante_id || "", numero_comprobante: "", accion: "edicion_credito_emprendamos",
    descripcion: `Crédito ${c.codigo} editado`, monto_total: c.capital || 0,
    usuario_email: user.email || "", fecha: new Date().toISOString().substring(0, 10)
  });
  return { ok: true };
}

// === Edición de abono (fecha/tipo/notas + asiento: fecha y cuenta de ingreso) ===
export async function editarAbono(base44, user, params) {
  const { abono_id, fecha, tipo, notas, cuenta_ingreso } = params;
  const abono = await base44.asServiceRole.entities.EmprendamosAbono.get(abono_id);
  if (!abono) throw new Error("Abono no encontrado");

  const update = {};
  if (fecha !== undefined) update.fecha = fecha;
  if (tipo !== undefined) update.tipo = tipo;
  if (notas !== undefined) update.notas = notas;
  if (cuenta_ingreso && cuenta_ingreso.subcuenta) {
    update.subcuenta_ingreso = String(cuenta_ingreso.subcuenta);
    update.cda_id = cuenta_ingreso.cuenta_ahorro_id || "";
    update.producto_credito_id = cuenta_ingreso.producto_credito_id || "";
  }

  if (abono.comprobante_id) {
    const comprobante = await base44.asServiceRole.entities.ComprobanteContable.get(abono.comprobante_id);
    if (comprobante && comprobante.estado !== "anulado") {
      const inscrito = await base44.asServiceRole.entities.EmprendamosCliente.get(abono.emprendamos_cliente_id);
      const tercero = inscrito ? ((await base44.asServiceRole.entities.Cliente.get(inscrito.cliente_id))?.nombre || "") : "";
      const nuevaFecha = fecha || comprobante.fecha;
      await base44.asServiceRole.entities.ComprobanteContable.update(comprobante.id, {
        fecha: nuevaFecha, descripcion: `Abono Emprendamos — ${tercero}`
      });
      const movs = await base44.asServiceRole.entities.MovimientoContable.filter({ comprobante_id: comprobante.id, estado: "activo" });
      for (const m of movs) {
        const esIngreso = (m.debito || 0) > 0 && String(m.subcuenta) !== SUBCUENTA_CARTERA;
        if (esIngreso && cuenta_ingreso && cuenta_ingreso.subcuenta) {
          await base44.asServiceRole.entities.MovimientoContable.update(m.id, {
            fecha: nuevaFecha, subcuenta: String(cuenta_ingreso.subcuenta),
            cuenta_ahorro_id: cuenta_ingreso.cuenta_ahorro_id || "",
            producto_credito_id: cuenta_ingreso.producto_credito_id || "",
            tipo_movimiento_tdc: cuenta_ingreso.producto_credito_id ? "abono" : null
          });
        } else {
          await base44.asServiceRole.entities.MovimientoContable.update(m.id, { fecha: nuevaFecha });
        }
      }
    }
  }

  await base44.asServiceRole.entities.EmprendamosAbono.update(abono_id, update);
  await base44.asServiceRole.entities.HistoricoContable.create({
    comprobante_id: abono.comprobante_id || "", numero_comprobante: "", accion: "edicion_abono_emprendamos",
    descripcion: `Abono Emprendamos (${abono.valor_total}) editado`,
    monto_total: abono.valor_total || 0, usuario_email: user.email || "", fecha: new Date().toISOString().substring(0, 10)
  });
  return { ok: true };
}