import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Edit, AlertTriangle, Calendar, ChevronDown } from "lucide-react";
import { formatCOP, BANCO_NAMES } from "@/lib/contabilidad";

export default function NeedsAttention({ metasWithProgress, clienteMap, onEdit }) {
  const [open, setOpen] = useState(true);
  const needsAttention = metasWithProgress
    .filter((m) => !m.cumplida && !m.periodoVencido)
    .sort((a, b) => {
      if (a.sinCompras !== b.sinCompras) return a.sinCompras ? -1 : 1;
      return b.faltanteValor - a.faltanteValor;
    });

  if (needsAttention.length === 0) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="border-warning/30 bg-warning/5">
        <CardContent className="pt-5">
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 mb-3 w-full text-left hover:opacity-80 transition-opacity">
              <AlertTriangle className="w-4 h-4 text-warning" />
              <h3 className="font-heading font-semibold text-sm flex-1">
                Tarjetas que necesitan compras ({needsAttention.length})
              </h3>
              <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "" : "-rotate-90"}`} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="space-y-2">
              {needsAttention.map((m) => {
                const titular = m.card ? clienteMap[m.card.titular_id] : null;
                return (
                  <div
                    key={m.meta.id}
                    className={`flex flex-wrap items-center gap-3 px-3 py-2.5 rounded-md border ${
                      m.sinCompras
                        ? "border-destructive/30 bg-destructive/5"
                        : "border-warning/30 bg-warning/5"
                    }`}
                  >
                    <div className="flex-1 min-w-[180px]">
                      <div className="font-medium text-sm">{m.meta.nombre_tarjeta || "—"}</div>
                      <div className="text-xs text-muted-foreground">
                        {BANCO_NAMES[m.meta.banco] || m.meta.banco} · {titular?.nombre || "—"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Corte día</span>
                      <Badge variant="outline" className="font-mono text-xs">{m.corte}</Badge>
                      {m.despuesDeCorte ? (
                        <Badge className="text-xs bg-success/15 text-success gap-1">
                          ✓ Comprar ya
                        </Badge>
                      ) : (
                        <Badge className="text-xs bg-warning/15 text-warning gap-1">
                          ⏳ Esperar (corte día {m.corte})
                        </Badge>
                      )}
                    </div>
                    {m.faltanteCantidad > 0 && (
                      <Badge variant="secondary" className="text-xs bg-warning/15 text-warning">
                        Faltan {m.faltanteCantidad} compras
                      </Badge>
                    )}
                    {m.faltanteValor > 0 && (
                      <Badge variant="secondary" className="text-xs bg-warning/15 text-warning">
                        Faltan {formatCOP(m.faltanteValor)}
                      </Badge>
                    )}
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onEdit(m.meta)}>
                      <Edit className="w-3 h-3 mr-1" /> Editar
                    </Button>
                  </div>
                );
              })}
            </div>
          </CollapsibleContent>
        </CardContent>
      </Card>
    </Collapsible>
  );
}