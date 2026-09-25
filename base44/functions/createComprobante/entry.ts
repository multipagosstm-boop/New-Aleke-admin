import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { waitUntil } from "base44:runtime";
import { ejecutarCreacion, ValidationError } from "../../shared/contabilidad.ts";

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const result = await ejecutarCreacion(base44, user, body);

    await base44.asServiceRole.entities.HistoricoContable.create({
      comprobante_id: result.comprobante.id,
      numero_comprobante: result.numero,
      accion: "creacion",
      descripcion: body.descripcion,
      monto_total: result.comprobante.total_debito,
      usuario_email: user.email || "",
      fecha: body.fecha
    });

    // Recalcular estado de extractos afectados si hay abonos a TDC (en background)
    const movimientosAbono = (body.movimientos || []).filter(
      (m) => m.tipo_movimiento_tdc === "abono" && m.producto_credito_id
    );
    if (movimientosAbono.length > 0) {
      const productoIds = [...new Set(movimientosAbono.map((m) => m.producto_credito_id))];
      waitUntil(
        base44.functions.invoke("calcularEstadoExtractos", { producto_ids: productoIds }).catch(() => {})
      );
    }

    return Response.json({ comprobante: result.comprobante, warnings: result.warnings });
  } catch (error) {
    if (error.requiere_confirmacion) {
      return Response.json({ error: error.message, requiere_confirmacion: true }, { status: 400 });
    }
    if (error instanceof ValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
}