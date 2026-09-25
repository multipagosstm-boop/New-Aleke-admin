import React, { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, ShoppingCart } from "lucide-react";
import { formatCOP, BANCO_NAMES } from "@/lib/contabilidad";

export default function ComprasPeriodoTable({ movimientos, productos, currentMonth }) {
  const [open, setOpen] = useState(false);

  const productoMap = useMemo(() => {
    const m = {};
    (productos || []).forEach((p) => { m[p.id] = p; });
    return m;
  }, [productos]);

  const total = movimientos.reduce((s, m) => s + (Number(m.debito) || Number(m.credito) || 0), 0);

  const sorted = useMemo(() =>
    [...movimientos].sort((a, b) => (a.fecha > b.fecha ? -1 : a.fecha < b.fecha ? 1 : 0)),
    [movimientos]
  );

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between cursor-pointer" onClick={() => setOpen(!open)}>
          <div className="flex items-center gap-2">
            {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
            <ShoppingCart className="w-4 h-4 text-primary" />
            <span className="font-heading font-semibold text-sm">Compras del periodo actual</span>
            <Badge variant="secondary" className="text-xs">{movimientos.length}</Badge>
          </div>
          <span className="text-sm font-mono font-bold">{formatCOP(total)}</span>
        </div>

        {open && (
          <div className="mt-3 overflow-x-auto">
            {sorted.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No hay compras registradas en este periodo.</p>
            ) : (
              <table className="w-full text-xs">
                <thead className="text-muted-foreground border-b border-border">
                  <tr>
                    <th className="text-left py-2 px-2 font-medium">Fecha</th>
                    <th className="text-left py-2 px-2 font-medium">Tarjeta</th>
                    <th className="text-left py-2 px-2 font-medium">Subcuenta</th>
                    <th className="text-left py-2 px-2 font-medium">Descripción</th>
                    <th className="text-left py-2 px-2 font-medium">Tercero</th>
                    <th className="text-right py-2 px-2 font-medium">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((m) => {
                    const prod = productoMap[m.producto_credito_id];
                    return (
                      <tr key={m.id} className="border-b border-border/30 hover:bg-muted/20">
                        <td className="py-1.5 px-2 font-mono whitespace-nowrap">{m.fecha}</td>
                        <td className="py-1.5 px-2 whitespace-nowrap">{prod ? `${prod.nombre} · ${BANCO_NAMES[prod.banco] || prod.banco}` : "—"}</td>
                        <td className="py-1.5 px-2 font-mono">{m.subcuenta || "—"}</td>
                        <td className="py-1.5 px-2 max-w-xs truncate" title={m.descripcion}>{m.descripcion || "—"}</td>
                        <td className="py-1.5 px-2 text-muted-foreground">{m.tercero || "—"}</td>
                        <td className="py-1.5 px-2 text-right font-mono font-medium">{formatCOP(Number(m.debito) || Number(m.credito) || 0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border">
                    <td colSpan={5} className="py-2 px-2 text-right font-medium text-sm">Total compras:</td>
                    <td className="py-2 px-2 text-right font-mono font-bold">{formatCOP(total)}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}