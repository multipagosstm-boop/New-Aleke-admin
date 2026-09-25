import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { ejecutarAnulacion } from "../../shared/contabilidad.ts";
import { sincronizarRooftopTrasComprobante } from "../../shared/rooftop-cascade.ts";

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin")
      return Response.json({ error: "Solo administradores pueden anular comprobantes" }, { status: 403 });

    const body = await req.json();
    const { comprobante_id, motivo } = body;

    if (!comprobante_id) return Response.json({ error: "comprobante_id es obligatorio" }, { status: 400 });
    if (!motivo || motivo.trim() === "")
      return Response.json({ error: "motivo de anulación es obligatorio" }, { status: 400 });

    const comprobante = await base44.asServiceRole.entities.ComprobanteContable.get(comprobante_id);
    if (!comprobante) return Response.json({ error: "Comprobante no encontrado" }, { status: 404 });
    if (comprobante.estado === "anulado")
      return Response.json({ error: "El comprobante ya está anulado" }, { status: 400 });

    const { numeroNota } = await ejecutarAnulacion(base44, comprobante, user, motivo);

    await base44.asServiceRole.entities.HistoricoContable.create({
      comprobante_id: comprobante.id,
      numero_comprobante: comprobante.numero,
      accion: "anulacion",
      descripcion: `Anulado: ${motivo}. Nota crédito: ${numeroNota}`,
      monto_total: comprobante.total_debito,
      usuario_email: user.email || "",
      fecha: new Date().toISOString().substring(0, 10)
    });

    const cambiosRooftop = await sincronizarRooftopTrasComprobante(base44, comprobante.id, "anulacion");

    return Response.json({
      mensaje: "Comprobante anulado correctamente",
      comprobante_anulado: comprobante.numero,
      nota_credito: numeroNota,
      rooftop: cambiosRooftop
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}