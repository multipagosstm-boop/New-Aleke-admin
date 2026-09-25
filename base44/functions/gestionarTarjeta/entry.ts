import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import {
  crearProductoCredito,
  ejecutarReemplazo,
  ejecutarUnificacion,
  ejecutarAumentoCupo
} from "../../shared/tarjetas.ts";

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
        result = await crearProductoCredito(base44, user, body);
        break;
      case "reemplazo":
        result = await ejecutarReemplazo(base44, user, body.tarjeta_id, body.nuevos_digitos, {
          tipo: body.tipo,
          banco: body.banco,
          cupo: body.cupo,
          fecha_corte: body.fecha_corte,
          numero_completo: body.numero_completo,
          franquicia: body.franquicia,
          categoria: body.categoria,
          corte_modo: body.corte_modo,
          corte_semana: body.corte_semana,
          corte_dia_semana: body.corte_dia_semana
        });
        break;
      case "unificacion":
        result = await ejecutarUnificacion(base44, user, body.tarjeta_ids, body.permanente_id);
        break;
      case "aumento_cupo":
        result = await ejecutarAumentoCupo(base44, user, body.tarjeta_id, body.nuevo_cupo);
        break;
      default:
        return Response.json({ error: "Operación no válida" }, { status: 400 });
    }

    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}