import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Printer, FileText } from "lucide-react";
import { formatCOP, BANCO_NAMES } from "@/lib/contabilidad";
import EstadoMetaFilter, { filterByEstado } from "./EstadoMetaFilter";

export default function InformeMetasTab({ metasWithProgress, clienteMap, monthLabel }) {
  // Por defecto excluye las cumplidas
  const [estados, setEstados] = useState(["en_riesgo", "sin_compras"]);

  if (metasWithProgress.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-muted-foreground">
          No hay metas registradas para generar el informe.
        </CardContent>
      </Card>
    );
  }

  const metasVisibles = filterByEstado(metasWithProgress, estados);

  const totales = metasVisibles.reduce(
    (acc, m) => ({
      comprasCantidad: acc.comprasCantidad + m.comprasCantidad,
      objetivoCantidad: acc.objetivoCantidad + (m.meta.objetivo_cantidad || 0),
      comprasValor: acc.comprasValor + m.comprasValor,
      objetivoValor: acc.objetivoValor + (m.meta.objetivo_valor || 0),
    }),
    { comprasCantidad: 0, objetivoCantidad: 0, comprasValor: 0, objetivoValor: 0 }
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-heading font-semibold text-sm">
            Informe de Metas — {monthLabel}
          </h3>
        </div>
        <Button size="sm" variant="outline" onClick={() => window.print()}>
          <Printer className="w-4 h-4 mr-2" /> Imprimir / Exportar
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <EstadoMetaFilter value={estados} onChange={setEstados} />
        <Button
          variant="ghost"
          size="sm"
          className="h-9"
          onClick={() => setEstados(["en_riesgo", "sin_compras"])}
        >
          Restablecer
        </Button>
      </div>

      <Card className="print-area">
        <CardContent className="p-0">
          <div className="p-4 border-b border-border print:border-b-2">
            <h2 className="text-lg font-heading font-bold">Informe de Metas de Tarjetas</h2>
            <p className="text-sm text-muted-foreground">Periodo: {monthLabel}</p>
          </div>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] text-muted-foreground uppercase">
                  <th className="text-left py-2.5 px-3 font-medium" rowSpan={2}>Tarjeta</th>
                  <th className="text-center py-2 px-3 font-medium" colSpan={3}>Cantidad de Compras</th>
                  <th className="text-center py-2 px-3 font-medium" colSpan={3}>Valor de Compras</th>
                </tr>
                <tr className="border-b border-border text-[11px] text-muted-foreground uppercase">
                  <th className="text-center py-2 px-3 font-medium">Realizadas</th>
                  <th className="text-center py-2 px-3 font-medium">Faltan</th>
                  <th className="text-center py-2 px-3 font-medium">Total</th>
                  <th className="text-center py-2 px-3 font-medium">Realizado</th>
                  <th className="text-center py-2 px-3 font-medium">Falta</th>
                  <th className="text-center py-2 px-3 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {metasVisibles.map((m) => {
                  const titular = m.card ? clienteMap[m.card.titular_id] : null;
                  return (
                    <tr key={m.meta.id} className="border-b border-border/40">
                      <td className="py-2 px-3">
                        <div className="font-medium text-xs">{m.meta.nombre_tarjeta || "—"}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {BANCO_NAMES[m.meta.banco] || m.meta.banco} · {titular?.nombre || "—"}
                        </div>
                      </td>
                      <td className="py-2 px-3 text-center font-mono text-xs">{m.comprasCantidad}</td>
                      <td className="py-2 px-3 text-center font-mono text-xs">
                        {m.faltanteCantidad > 0 ? (
                          <span className="text-warning font-bold">{m.faltanteCantidad}</span>
                        ) : (
                          <span className="text-success">✓</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-center font-mono text-xs text-muted-foreground">
                        {m.meta.objetivo_cantidad || "—"}
                      </td>
                      <td className="py-2 px-3 text-center font-mono text-xs">{formatCOP(m.comprasValor)}</td>
                      <td className="py-2 px-3 text-center font-mono text-xs">
                        {m.faltanteValor > 0 ? (
                          <span className="text-warning font-bold">{formatCOP(m.faltanteValor)}</span>
                        ) : (
                          <span className="text-success">✓</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-center font-mono text-xs text-muted-foreground">
                        {m.meta.objetivo_valor ? formatCOP(m.meta.objetivo_valor) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border font-bold bg-muted/30">
                  <td className="py-2 px-3 text-xs">TOTALES</td>
                  <td className="py-2 px-3 text-center font-mono text-xs">{totales.comprasCantidad}</td>
                  <td className="py-2 px-3 text-center font-mono text-xs text-warning">
                    {Math.max(totales.objetivoCantidad - totales.comprasCantidad, 0)}
                  </td>
                  <td className="py-2 px-3 text-center font-mono text-xs">{totales.objetivoCantidad}</td>
                  <td className="py-2 px-3 text-center font-mono text-xs">{formatCOP(totales.comprasValor)}</td>
                  <td className="py-2 px-3 text-center font-mono text-xs text-warning">
                    {formatCOP(Math.max(totales.objetivoValor - totales.comprasValor, 0))}
                  </td>
                  <td className="py-2 px-3 text-center font-mono text-xs">{formatCOP(totales.objetivoValor)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}