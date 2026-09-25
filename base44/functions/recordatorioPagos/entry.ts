import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Recordatorio automático de pagos: notifica 3 días antes del vencimiento
// de tarjetas/créditos (ExtractoProducto), préstamos PAKREDITO (Prestamo)
// y créditos Emprendamos (EmprendamosCredito). Un correo consolidado por
// administrador. Pensado para ejecutarse desde un workflow programado diario.

function fechaTarget(dias: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().substring(0, 10);
}

function fmtCOP(v: number): string {
  const n = Number(v || 0);
  return '$ ' + n.toLocaleString('es-CO', { maximumFractionDigits: 0 });
}

function fmtFecha(s: string): string {
  if (!s) return '—';
  const [y, m, d] = s.substring(0, 10).split('-');
  return `${d}/${m}/${y}`;
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

    const sv = base44.asServiceRole;
    let dias = 3;
    try {
      const body = await req.json();
      if (body && body.dias !== undefined) dias = Number(body.dias);
    } catch {
      const q = new URL(req.url).searchParams.get('dias');
      if (q) dias = Number(q);
    }
    const target = fechaTarget(dias);

    // --- 1. Extractos de tarjetas y créditos bancarios (TDC, CH, LIB, CR) ---
    const extractos = await sv.entities.ExtractoProducto.filter({
      estado: 'pendiente_pago',
      fecha_pago: target,
    });
    const productoIds = [...new Set(extractos.map((e: any) => e.producto_id).filter(Boolean))];
    const productos = productoIds.length
      ? await sv.entities.ProductoCredito.list()
      : [];
    const prodMap: Record<string, any> = {};
    for (const p of productos) prodMap[p.id] = p;

    const itemsTarjeta = extractos.map((e: any) => {
      const p = prodMap[e.producto_id];
      const nombre = p?.nombre || 'Producto sin nombre';
      return {
        tipo: 'Tarjeta / Crédito bancario',
        referencia: nombre,
        periodo: e.periodo || '',
        vence: e.fecha_pago || target,
        valor: Number(e.saldo_a_pagar || 0),
      };
    });

    // --- 2. Préstamos PAKREDITO ---
    const prestamos = await sv.entities.Prestamo.filter({
      estado: 'vigente',
      fecha_proximo_pago: target,
    });
    const clienteIdsP = [...new Set(prestamos.map((p: any) => p.cliente_id).filter(Boolean))];
    const clientesP = clienteIdsP.length
      ? await sv.entities.Cliente.list()
      : [];
    const cliMapP: Record<string, any> = {};
    for (const c of clientesP) cliMapP[c.id] = c;

    const itemsPrestamo = prestamos.map((p: any) => ({
      tipo: 'PAKREDITO',
      referencia: `${p.codigo || ''} · ${cliMapP[p.cliente_id]?.nombre || 'Cliente'}`,
      periodo: '',
      vence: p.fecha_proximo_pago || target,
      valor: Number(p.valor_proximo_pago || 0),
    }));

    // --- 3. Créditos Emprendamos ---
    const emCreditos = await sv.entities.EmprendamosCredito.filter({
      estado: 'vigente',
      fecha_proximo_pago: target,
    });
    const clienteIdsE = [...new Set(emCreditos.map((c: any) => c.cliente_id).filter(Boolean))];
    const clientesE = clienteIdsE.length
      ? await sv.entities.Cliente.list()
      : [];
    const cliMapE: Record<string, any> = {};
    for (const c of clientesE) cliMapE[c.id] = c;

    const itemsEmprendamos = emCreditos.map((c: any) => ({
      tipo: 'Emprendamos',
      referencia: `${c.codigo || ''} · ${cliMapE[c.cliente_id]?.nombre || 'Cliente'}`,
      periodo: '',
      vence: c.fecha_proximo_pago || target,
      valor: Number(c.cuota_fija || 0),
    }));

    const items = [...itemsTarjeta, ...itemsPrestamo, ...itemsEmprendamos];

    if (items.length === 0) {
      return Response.json({ ok: true, target, enviados: 0, items: 0 });
    }

    // --- Construir correo consolidado ---
    const filas = items.map((it) => `
      <tr>
        <td style="padding:6px 10px;border:1px solid #e2e8f0">${it.tipo}</td>
        <td style="padding:6px 10px;border:1px solid #e2e8f0">${it.referencia}</td>
        <td style="padding:6px 10px;border:1px solid #e2e8f0">${it.periodo}</td>
        <td style="padding:6px 10px;border:1px solid #e2e8f0">${fmtFecha(it.vence)}</td>
        <td style="padding:6px 10px;border:1px solid #e2e8f0;text-align:right">${fmtCOP(it.valor)}</td>
      </tr>`).join('');

    const total = items.reduce((s, it) => s + it.valor, 0);
    const html = `
      <div style="font-family:Arial,sans-serif;color:#1e293b">
        <h2 style="margin:0 0 8px">Recordatorio de pagos próximos</h2>
        <p style="margin:0 0 16px;color:#475569">
          Vencimientos en ${dias} día(s) — fecha objetivo: <strong>${fmtFecha(target)}</strong>.
        </p>
        <table style="border-collapse:collapse;font-size:13px;width:100%">
          <thead>
            <tr style="background:#f1f5f9">
              <th style="padding:6px 10px;border:1px solid #e2e8f0;text-align:left">Tipo</th>
              <th style="padding:6px 10px;border:1px solid #e2e8f0;text-align:left">Referencia</th>
              <th style="padding:6px 10px;border:1px solid #e2e8f0;text-align:left">Período</th>
              <th style="padding:6px 10px;border:1px solid #e2e8f0;text-align:left">Vence</th>
              <th style="padding:6px 10px;border:1px solid #e2e8f0;text-align:right">Valor</th>
            </tr>
          </thead>
          <tbody>${filas}
            <tr style="background:#f8fafc;font-weight:bold">
              <td colspan="4" style="padding:6px 10px;border:1px solid #e2e8f0;text-align:right">TOTAL</td>
              <td style="padding:6px 10px;border:1px solid #e2e8f0;text-align:right">${fmtCOP(total)}</td>
            </tr>
          </tbody>
        </table>
        <p style="margin:16px 0 0;color:#64748b;font-size:12px">
          Sistema Contable Aleke — recordatorio automático.
        </p>
      </div>`;

    const texto = `Recordatorio de pagos próximos (vencen en ${dias} día(s), ${fmtFecha(target)}):\n` +
      items.map((it) => `- ${it.tipo} | ${it.referencia} | vence ${fmtFecha(it.vence)} | ${fmtCOP(it.valor)}`).join('\n');

    // --- Enviar a todos los administradores ---
    const admins = await sv.entities.User.filter({ role: 'admin' });
    const destinos = admins.map((a: any) => a.email).filter(Boolean);
    let enviados = 0;
    for (const email of destinos) {
      try {
        await sv.integrations.Core.SendEmail({
          to: email,
          subject: `Recordatorio de pagos — vencimientos ${fmtFecha(target)}`,
          html,
          text: texto,
        });
        enviados++;
      } catch (e) {
        // continuar con los demás destinatarios
      }
    }

    return Response.json({ ok: true, target, enviados, items: items.length, destinos });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}