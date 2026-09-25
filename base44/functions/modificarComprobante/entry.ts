import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { ejecutarModificacionDirecta, ValidationError } from "../../shared/contabilidad.ts";
import { sincronizarRooftopTrasComprobante } from "../../shared/rooftop-cascade.ts";

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin")
      return Response.json({ error: "Solo administradores pueden modificar comprobantes" }, { status: 403 });

    const body = await req.json();
    const { comprobante_id, motivo, tipo, fecha, descripcion, movimientos, modo, confirmar_sobregiro } = body;

    if (!comprobante_id) return Response.json({ error: "comprobante_id es obligatorio" }, { status: 400 });
    if (!motivo || motivo.trim() === "")
      return Response.json({ error: "motivo de modificación es obligatorio" }, { status: 400 });

    const comprobante = await base44.asServiceRole.entities.ComprobanteContable.get(comprobante_id);
    if (!comprobante) return Response.json({ error: "Comprobante no encontrado" }, { status: 404 });
    if (comprobante.estado === "anulado")
      return Response.json({ error: "No se puede modificar un comprobante anulado" }, { status: 400 });

    // Guardar snapshot de datos originales para auditoría
    const movsOriginales = await base44.asServiceRole.entities.MovimientoContable.filter({
      comprobante_id: comprobante.id, estado: "activo"
    });
    const snapshotOriginal = JSON.stringify({
      numero: comprobante.numero,
      tipo: comprobante.tipo,
      fecha: comprobante.fecha,
      descripcion: comprobante.descripcion,
      total_debito: comprobante.total_debito,
      total_credito: comprobante.total_credito,
      movimientos: movsOriginales.map(m => ({
        subcuenta: m.subcuenta, cuenta_nombre: m.cuenta_nombre,
        debito: m.debito, credito: m.credito,
        tercero: m.tercero, descripcion: m.descripcion, cliente_id: m.cliente_id
      }))
    });

    // Modificación directa: mismo comprobante (mismo id y número), sin nota crédito.
    // La nota crédito solo aplica cuando el soporte se va a eliminar (anulación).
    const { comprobante: modificado, warnings } = await ejecutarModificacionDirecta(base44, comprobante, user, {
      tipo, fecha, descripcion, movimientos, modo, confirmar_sobregiro
    });

    await base44.asServiceRole.entities.HistoricoContable.create({
      comprobante_id: modificado.id,
      numero_comprobante: modificado.numero,
      accion: "modificacion",
      descripcion: `Comprobante ${modificado.numero} modificado directamente. Motivo: ${motivo}`,
      monto_total: modificado.total_debito,
      usuario_email: user.email || "",
      fecha: new Date().toISOString().substring(0, 10),
      datos_snapshot: snapshotOriginal
    });

    const cambiosRooftop = await sincronizarRooftopTrasComprobante(base44, modificado.id, "modificacion");

    return Response.json({
      comprobante_modificado: modificado,
      warnings,
      rooftop: cambiosRooftop
    });
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