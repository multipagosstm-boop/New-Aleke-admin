import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Edit, Trash2, Clock } from "lucide-react";
import { formatCOP, BANCO_NAMES } from "@/lib/contabilidad";

export default function MetasTable({ metas, clienteMap, onEdit, onDelete, emptyMessage }) {
  if (metas.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-muted-foreground">
          {emptyMessage || "No se encontraron metas con ese criterio."}
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-auto max-h-[70vh]">
          <table className="w-full text-sm thead-sticky">
            <thead>
              <tr className="border-b border-border text-[11px] text-muted-foreground uppercase">
                <th className="text-left py-2.5 px-3 font-medium">Tarjeta</th>
                <th className="text-left py-2.5 px-3 font-medium">Titular</th>
                <th className="text-center py-2.5 px-3 font-medium">Corte</th>
                <th className="text-left py-2.5 px-3 font-medium">Meta Cantidad</th>
                <th className="text-left py-2.5 px-3 font-medium">Meta Valor</th>
                <th className="text-center py-2.5 px-3 font-medium">Estado</th>
                <th className="text-center py-2.5 px-3 font-medium">Periodo</th>
                <th className="text-right py-2.5 px-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {metas.map((m) => {
                const titular = m.card ? clienteMap[m.card.titular_id] : null;
                return (
                  <tr key={m.meta.id} className="border-b border-border/40 hover:bg-muted/30">
                    <td className="py-2.5 px-3">
                      <div className="font-medium">{m.meta.nombre_tarjeta || "—"}</div>
                      <div className="text-[11px] text-muted-foreground font-mono">
                        {m.meta.codigo_interno} · {BANCO_NAMES[m.meta.banco] || m.meta.banco}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-xs text-muted-foreground">{titular?.nombre || "—"}</td>
                    <td className="py-2.5 px-3 text-center">
                      <Badge variant="outline" className="font-mono text-xs">{m.corte}</Badge>
                    </td>
                    <td className="py-2.5 px-3">
                      {m.pctCantidad === null ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <div className="space-y-1">
                          <div className="text-xs font-mono">{m.comprasCantidad} / {m.meta.objetivo_cantidad}</div>
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden w-24">
                            <div
                              className={`h-full ${m.pctCantidad >= 100 ? "bg-success" : m.pctCantidad > 0 ? "bg-warning" : "bg-destructive"}`}
                              style={{ width: `${m.pctCantidad}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      {m.pctValor === null ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <div className="space-y-1">
                          <div className="text-xs font-mono">{formatCOP(m.comprasValor)} / {formatCOP(m.meta.objetivo_valor)}</div>
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden w-24">
                            <div
                              className={`h-full ${m.pctValor >= 100 ? "bg-success" : m.pctValor > 0 ? "bg-warning" : "bg-destructive"}`}
                              style={{ width: `${m.pctValor}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {m.periodoVencido ? (
                        <Badge variant="secondary" className="text-xs bg-muted">Vencida</Badge>
                      ) : m.cumplida ? (
                        <Badge className="text-xs bg-success/15 text-success">Cumplida</Badge>
                      ) : m.sinCompras ? (
                        <Badge className="text-xs bg-destructive/15 text-destructive">Sin compras</Badge>
                      ) : (
                        <Badge className="text-xs bg-warning/15 text-warning">En riesgo</Badge>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center text-[11px] text-muted-foreground">
                      {m.diasRestantes !== null && !m.periodoVencido ? (
                        <span className="flex items-center justify-center gap-1">
                          <Clock className="w-3 h-3" />{m.diasRestantes}d
                        </span>
                      ) : "—"}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onEdit(m.meta)}>
                          <Edit className="w-3 h-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => onDelete(m.meta)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}