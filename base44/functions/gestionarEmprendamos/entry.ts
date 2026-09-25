import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import {
  inscribirCliente, inscribirClienteProductos, agregarCredito, registrarComision, registrarNuevoCupo, generarInteresesMensuales,
  registrarAbono, generarEstadoCuenta, recalcularEstado, salirCliente,
  eliminarAbono, eliminarCredito, editarCredito, editarAbono, editarCliente, ensureSubcuentas
} from "../../shared/emprendamos.ts";

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin")
      return Response.json({ error: "Solo administradores pueden operar Emprendamos" }, { status: 403 });

    const body = await req.json();
    const { accion, ...params } = body;
    let result;
    switch (accion) {
      case "inscribirCliente": result = await inscribirCliente(base44, user, params); break;
      case "inscribirClienteProductos": result = await inscribirClienteProductos(base44, user, params); break;
      case "agregarCredito": result = await agregarCredito(base44, user, params); break;
      case "registrarComision": result = await registrarComision(base44, user, params); break;
      case "registrarNuevoCupo": result = await registrarNuevoCupo(base44, user, params); break;
      case "generarInteresesMensuales": result = await generarInteresesMensuales(base44, user, params); break;
      case "registrarAbono": result = await registrarAbono(base44, user, params); break;
      case "generarEstadoCuenta": result = await generarEstadoCuenta(base44, params); break;
      case "recalcularEstado": result = await recalcularEstado(base44); break;
      case "salirCliente": result = await salirCliente(base44, user, params); break;
      case "eliminarAbono": result = await eliminarAbono(base44, user, params); break;
      case "eliminarCredito": result = await eliminarCredito(base44, user, params); break;
      case "editarCredito": result = await editarCredito(base44, user, params); break;
      case "editarAbono": result = await editarAbono(base44, user, params); break;
      case "editarCliente": result = await editarCliente(base44, user, params); break;
      case "ensureSubcuentas": result = await ensureSubcuentas(base44); break;
      default: return Response.json({ error: "Acción no válida" }, { status: 400 });
    }
    return Response.json(result);
  } catch (error) {
    if (error.requiere_confirmacion)
      return Response.json({ error: error.message, requiere_confirmacion: true }, { status: 400 });
    return Response.json({ error: error.message }, { status: 500 });
  }
}