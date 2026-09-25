import { createClientFromRequest } from 'npm:@base44/sdk@0.8.50';
import { generarInteresesMensuales } from '../../shared/emprendamos.ts';

// Generador automático de intereses (devengado) de Emprendamos.
// Recorre todos los clientes activos y genera los intereses del período
// anterior (previousPeriodo). Pensado para ejecutarse desde un workflow
// programado el último día de cada mes (cron 28-31 + validación). Idempotente:
// si el período ya fue generado para un crédito, lo salta.

// Devuelve true si `fecha` (YYYY-MM-DD) es el último día de su mes.
function esUltimoDiaMes(fecha: string): boolean {
  const d = new Date(fecha + "T00:00:00");
  const manana = new Date(d);
  manana.setDate(d.getDate() + 1);
  return manana.getMonth() !== d.getMonth();
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);

    // Permitir ejecución desde el scheduler (sin usuario) o invocación directa de admin.
    let user: any = null;
    let scheduled = false;
    try {
      user = await base44.auth.me();
    } catch {
      scheduled = true;
    }
    if (!scheduled && user && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // En ejecución programada, solo proceder si es el último día del mes
    // (el cron dispara 28-31; así evitamos correr varias veces en meses largos).
    // La invocación manual de admin puede ejecutarlo cualquier día.
    const fecha = new Date().toISOString().substring(0, 10);
    if (scheduled && !esUltimoDiaMes(fecha)) {
      return Response.json({ ok: true, fecha, skipped: true, reason: "No es el último día del mes" });
    }

    const sv = base44.asServiceRole;

    // Usuario para auditoría: el real si lo invoca un admin, o "sistema" si es cron.
    const auditor = user && user.email ? user : { email: 'sistema@aleke.app' };

    const activos = await sv.entities.EmprendamosCliente.filter({ estado: 'activo' });

    let clientesConIntereses = 0;
    let totalIntereses = 0;
    const errores = [];

    for (const ins of activos) {
      try {
        const res = await generarInteresesMensuales(base44, auditor, {
          emprendamos_cliente_id: ins.id,
        });
        if ((res.totalIntereses || 0) > 0) {
          clientesConIntereses++;
          totalIntereses += res.totalIntereses;
        }
      } catch (e: any) {
        errores.push({ cliente_id: ins.id, error: e.message });
      }
    }

    return Response.json({
      ok: true,
      fecha,
      clientes_procesados: activos.length,
      clientes_con_intereses: clientesConIntereses,
      total_intereses: totalIntereses,
      errores,
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}