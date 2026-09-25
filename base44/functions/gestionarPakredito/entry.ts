import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { crearPrestamo, registrarAbono, recalcularEstado, editarPrestamo, editarDesembolso, eliminarPrestamo, eliminarAbono } from "../../shared/pakredito.ts";

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin")
      return Response.json({ error: "Solo administradores pueden operar Pakredito" }, { status: 403 });

    const body = await req.json();
    const { accion, ...params } = body;
    let result;
    switch (accion) {
      case "crearPrestamo": result = await crearPrestamo(base44, user, params); break;
      case "registrarAbono": result = await registrarAbono(base44, user, params); break;
      case "editarPrestamo": result = await editarPrestamo(base44, user, params); break;
      case "editarDesembolso": result = await editarDesembolso(base44, user, params); break;
      case "eliminarPrestamo": result = await eliminarPrestamo(base44, user, params); break;
      case "eliminarAbono": result = await eliminarAbono(base44, user, params); break;
      case "recalcularEstado": result = await recalcularEstado(base44); break;
      default: return Response.json({ error: "Acción no válida" }, { status: 400 });
    }
    return Response.json(result);
  } catch (error) {
    if (error.requiere_confirmacion)
      return Response.json({ error: error.message, requiere_confirmacion: true }, { status: 400 });
    return Response.json({ error: error.message }, { status: 500 });
  }
}