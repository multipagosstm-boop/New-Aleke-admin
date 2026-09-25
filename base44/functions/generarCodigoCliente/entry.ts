import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Find or create Consecutivo with tipo="cliente"
    const existing = await base44.asServiceRole.entities.Consecutivo.filter({ tipo: "cliente" });
    let numero;
    if (existing.length > 0) {
      const cons = existing[0];
      numero = (cons.ultimo_numero || 0) + 1;
      await base44.asServiceRole.entities.Consecutivo.update(cons.id, { ultimo_numero: numero });
    } else {
      numero = 1;
      await base44.asServiceRole.entities.Consecutivo.create({
        tipo: "cliente",
        año: new Date().getFullYear(),
        ultimo_numero: numero
      });
    }

    const codigo = "CLI-" + String(numero).padStart(3, "0");
    return Response.json({ codigo });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}