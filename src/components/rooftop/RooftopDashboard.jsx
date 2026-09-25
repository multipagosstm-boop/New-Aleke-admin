import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCOP, formatDate } from "@/lib/contabilidad";

export default function RooftopDashboard({ inmuebles, contratos, pagos, clienteNombre }) {
  const hoy = new Date().toISOString().substring(0, 10);
  const hoyDate = new Date(hoy + "T00:00:00");

  const activos = contratos.filter((c) => c.estado === "vigente" || c.estado === "por_vencer");
  const ocupados = inmuebles.filter((i) => i.estado === "ocupado").length;
  const total = inmuebles.length;
  const pct = total > 0 ? Math.round((ocupados / total) * 100) : 0;

  const ingresoMensual = activos.reduce((s, c) => s + (c.valor_arriendo || 0), 0);
  const depositosRetenidos = activos.reduce((s, c) => s + (c.deposito_pagado ? (c.valor_deposito || 0) : 0), 0);

  const enMora = pagos.filter((p) => p.estado === "en_mora").length;
  const disponibles = inmuebles.filter((i) => i.estado === "disponible").length;
  const porVencerPago = pagos.filter((p) => p.estado === "pendiente" && p.fecha_vencimiento >= hoy && p.fecha_vencimiento <= new Date(hoyDate.getTime() + 7 * 86400000).toISOString().substring(0, 10)).length;
  const renovacionesProx = contratos.filter((c) => (c.estado === "vigente" || c.estado === "por_vencer") && c.fecha_fin >= hoy && c.fecha_fin <= new Date(hoyDate.getTime() + 30 * 86400000).toISOString().substring(0, 10)).length;

  const contratoDeInmueble = (inmId) => contratos.find((c) => c.inmueble_id === inmId && (c.estado === "vigente" || c.estado === "por_vencer"));
  const pagoDeInmueble = (inmId) => pagos
    .filter((p) => p.inmueble_id === inmId)
    .sort((a, b) => (b.periodo || "").localeCompare(a.periodo || ""))[0];

  const cards = [
    { titulo: "Ocupación", valor: `${ocupados}/${total}`, sub: `${pct}% ocupado`, color: "text-success" },
    { titulo: "Ingreso mensual", valor: formatCOP(ingresoMensual), sub: `${activos.length} contratos activos`, color: "text-primary" },
    { titulo: "Depósitos retenidos", valor: formatCOP(depositosRetenidos), sub: "garantías activas", color: "text-muted-foreground" },
    { titulo: "Alertas activas", valor: enMora + porVencerPago + disponibles, sub: `${enMora} mora · ${porVencerPago} por vencer · ${disponibles} libres`, color: "text-destructive" },
    { titulo: "Renovaciones próximas", valor: renovacionesProx, sub: "próximos 30 días", color: "text-warning" }
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {cards.map((c) => (
          <Card key={c.titulo}>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground uppercase">{c.titulo}</div>
              <div className={`text-2xl font-bold mt-1 ${c.color}`}>{c.valor}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{c.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <div className="px-4 py-3 border-b text-sm font-semibold">Estado de Apartamentos</div>
          <table className="w-full text-sm thead-sticky">
            <thead className="border-b text-left text-xs text-muted-foreground uppercase">
              <tr>
                <th className="px-4 py-2 font-medium">Apto</th>
                <th className="px-4 py-2 font-medium">Inquilino</th>
                <th className="px-4 py-2 font-medium text-right">Arriendo</th>
                <th className="px-4 py-2 font-medium text-center">Estado pago</th>
                <th className="px-4 py-2 font-medium">Vencimiento</th>
                <th className="px-4 py-2 font-medium text-center">Estado</th>
              </tr>
            </thead>
            <tbody>
              {inmuebles.map((inm) => {
                const cont = contratoDeInmueble(inm.id);
                const pago = pagoDeInmueble(inm.id);
                return (
                  <tr key={inm.id} className="border-b border-border/40 hover:bg-muted/30">
                    <td className="px-4 py-2 font-medium">{inm.nombre}</td>
                    <td className="px-4 py-2">{inm.estado === "ocupado" ? clienteNombre(inm.inquilino_id) : "—"}</td>
                    <td className="px-4 py-2 text-right font-mono">{cont ? formatCOP(cont.valor_arriendo) : "—"}</td>
                    <td className="px-4 py-2 text-center">
                      {pago ? <Badge variant={pago.estado === "en_mora" ? "destructive" : pago.estado === "pagado" ? "default" : "secondary"} className="text-[10px]">{pago.estado}</Badge> : "—"}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">{pago ? formatDate(pago.fecha_vencimiento) : "—"}</td>
                    <td className="px-4 py-2 text-center">
                      <Badge variant={inm.estado === "ocupado" ? "secondary" : inm.estado === "disponible" ? "outline" : "default"} className="text-[10px]">{inm.estado}</Badge>
                    </td>
                  </tr>
                );
              })}
              {inmuebles.length === 0 && (<tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">Sin inmuebles.</td></tr>)}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}