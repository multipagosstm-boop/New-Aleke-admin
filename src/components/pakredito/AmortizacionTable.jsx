import React from "react";
import { Badge } from "@/components/ui/badge";
import { formatCOP, formatDate } from "@/lib/contabilidad";

const ESTADO_VARIANT = {
  pagada: "secondary",
  pendiente: "outline",
  parcial: "secondary",
  vencida: "destructive"
};

export default function AmortizacionTable({ cuotas = [], modelo }) {
  if (!cuotas.length) {
    return <p className="text-xs text-muted-foreground py-3">Sin cuotas registradas.</p>;
  }
  const ordenadas = [...cuotas].sort((a, b) => a.numero - b.numero);
  const totales = ordenadas.reduce((acc, c) => ({
    cuota: acc.cuota + (Number(c.cuota) || 0),
    interes: acc.interes + (Number(c.interes) || 0),
    capital: acc.capital + (Number(c.capital_abono) || 0),
    pagado: acc.pagado + (Number(c.valor_pagado) || 0)
  }), { cuota: 0, interes: 0, capital: 0, pagado: 0 });

  return (
    <div className="border border-border rounded-lg overflow-x-auto max-h-[50vh] overflow-y-auto">
      <table className="w-full text-xs">
        <thead className="bg-muted/50 border-b border-border text-left text-muted-foreground uppercase sticky top-0">
          <tr>
            <th className="px-2 py-2 font-medium">#</th>
            <th className="px-2 py-2 font-medium">Vencimiento</th>
            <th className="px-2 py-2 font-medium text-right">Cuota</th>
            <th className="px-2 py-2 font-medium text-right">Interés</th>
            <th className="px-2 py-2 font-medium text-right">Capital</th>
            <th className="px-2 py-2 font-medium text-right">Saldo</th>
            <th className="px-2 py-2 font-medium text-center">Estado</th>
            <th className="px-2 py-2 font-medium text-right">Pagado</th>
          </tr>
        </thead>
        <tbody>
          {ordenadas.map((c) => (
            <tr key={c.id || c.numero} className="border-b border-border/40">
              <td className="px-2 py-1.5 font-mono">{c.numero}</td>
              <td className="px-2 py-1.5 font-mono">{formatDate(c.fecha_vencimiento)}</td>
              <td className="px-2 py-1.5 text-right font-mono">{formatCOP(c.cuota)}</td>
              <td className="px-2 py-1.5 text-right font-mono text-muted-foreground">{formatCOP(c.interes)}</td>
              <td className="px-2 py-1.5 text-right font-mono">{formatCOP(c.capital_abono)}</td>
              <td className="px-2 py-1.5 text-right font-mono">{formatCOP(c.saldo_capital)}</td>
              <td className="px-2 py-1.5 text-center">
                <Badge variant={ESTADO_VARIANT[c.estado] || "outline"} className="text-[10px]">{c.estado}</Badge>
              </td>
              <td className="px-2 py-1.5 text-right font-mono">{formatCOP(c.valor_pagado || 0)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-muted/40 border-t-2 border-border sticky bottom-0">
          <tr className="font-semibold text-xs">
            <td className="px-2 py-2" colSpan={2}>Totales</td>
            <td className="px-2 py-2 text-right font-mono">{formatCOP(totales.cuota)}</td>
            <td className="px-2 py-2 text-right font-mono">{formatCOP(totales.interes)}</td>
            <td className="px-2 py-2 text-right font-mono">{formatCOP(totales.capital)}</td>
            <td className="px-2 py-2"></td>
            <td className="px-2 py-2"></td>
            <td className="px-2 py-2 text-right font-mono">{formatCOP(totales.pagado)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}