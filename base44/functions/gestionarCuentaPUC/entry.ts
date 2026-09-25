import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { crearCuentaPUC, actualizarCuentaPUC, eliminarCuentaPUC } from "../../shared/cuentas-puc.ts";

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { operacion } = body;

    let result;
    switch (operacion) {
      case "crear":
        result = await crearCuentaPUC(base44, user, body);
        break;
      case "actualizar":
        result = await actualizarCuentaPUC(base44, user, body);
        break;
      case "eliminar":
        result = await eliminarCuentaPUC(base44, user, body);
        break;
      default:
        return Response.json({ error: "Operación no válida" }, { status: 400 });
    }

    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}