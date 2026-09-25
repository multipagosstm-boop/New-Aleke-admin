import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, Search, Wallet } from "lucide-react";
import { BANCO_NAMES } from "@/lib/contabilidad";

export default function TarjetasSinMetasTab({ cardsWithoutMetas, clienteMap, onAddMeta }) {
  const [search, setSearch] = useState("");

  const filtered = cardsWithoutMetas.filter((p) => {
    if (!search) return true;
    const s = search.toLowerCase();
    const titular = clienteMap[p.titular_id];
    return (
      (p.nombre || "").toLowerCase().includes(s) ||
      (p.nomenclatura || "").toLowerCase().includes(s) ||
      (p.codigo_interno || "").toLowerCase().includes(s) ||
      (BANCO_NAMES[p.banco] || p.banco || "").toLowerCase().includes(s) ||
      (titular?.nombre || "").toLowerCase().includes(s)
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Wallet className="w-4 h-4 text-muted-foreground" />
        <h3 className="font-heading font-semibold text-sm">
          Tarjetas sin metas ({cardsWithoutMetas.length})
        </h3>
      </div>

      <div className="relative max-w-sm">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar tarjeta por nombre, banco o titular…"
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            {cardsWithoutMetas.length === 0
              ? "Todas las tarjetas activas tienen metas asignadas."
              : "No se encontraron tarjetas con ese criterio."}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-auto max-h-[70vh]">
              <table className="w-full text-sm thead-sticky">
                <thead>
                  <tr className="border-b border-border text-[11px] text-muted-foreground uppercase">
                    <th className="text-left py-2.5 px-3 font-medium">Tarjeta</th>
                    <th className="text-left py-2.5 px-3 font-medium">Banco</th>
                    <th className="text-left py-2.5 px-3 font-medium">Titular</th>
                    <th className="text-center py-2.5 px-3 font-medium">Corte</th>
                    <th className="text-right py-2.5 px-3 font-medium">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => {
                    const titular = clienteMap[p.titular_id];
                    return (
                      <tr key={p.id} className="border-b border-border/40 hover:bg-muted/30">
                        <td className="py-2.5 px-3">
                          <div className="font-medium">{p.nombre}</div>
                          <div className="text-[11px] text-muted-foreground font-mono">
                            {p.codigo_interno || p.nomenclatura}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-xs text-muted-foreground">
                          {BANCO_NAMES[p.banco] || p.banco}
                        </td>
                        <td className="py-2.5 px-3 text-xs text-muted-foreground">
                          {titular?.nombre || "—"}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <Badge variant="outline" className="font-mono text-xs">
                            {p.fecha_corte || "—"}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => onAddMeta(p)}
                          >
                            <Plus className="w-3 h-3 mr-1" /> Agregar meta
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}