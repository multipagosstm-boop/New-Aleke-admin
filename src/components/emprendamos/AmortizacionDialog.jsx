import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TrendingDown } from "lucide-react";
import { formatCOP, formatDate } from "@/lib/contabilidad";
import { generarEvolucionCredito, formatearTasaPorcentaje } from "@/lib/emprendamos";

export default function AmortizacionDialog({
  open,
  onOpenChange,
  credito,
  abonos = [],
  intereses = [],
  clienteNombre = "Cliente"
}) {
  if (!credito) return null;

  const evolucion = generarEvolucionCredito(credito, abonos, intereses);
  const totalAbonadoCapital = evolucion.reduce((s, e) => s + (Number(e.abono_capital) || 0), 0);
  const totalAbonadoInteres = evolucion.reduce((s, e) => s + (Number(e.abono_intereses) || 0), 0);
  const totalInteresesCausados = evolucion.reduce((s, e) => s + (Number(e.intereses_causados) || 0), 0);

  const capitalOriginal = Number(credito.capital) || 0;
  const porcentajeAmortizado = capitalOriginal > 0
    ? Math.min(100, Math.round((totalAbonadoCapital / capitalOriginal) * 100))
    : 100;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2 text-lg font-bold">
                <TrendingDown className="w-5 h-5 text-primary" />
                Evolución y Amortización — Crédito {credito.codigo}
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Titular: <strong>{clienteNombre}</strong> | Tipo: <strong>{credito.tipo}</strong> | Tasa nominal: <strong>{formatearTasaPorcentaje(credito.tasa_nominal)}</strong>
              </p>
            </div>
            <Badge variant={credito.estado === "saldado" ? "outline" : "default"}>
              {credito.estado === "saldado" ? "Crédito Saldado" : "Vigente"}
            </Badge>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-1 text-xs">
          {/* BARRA DE PROGRESO DE AMORTIZACIÓN */}
          <div className="p-3 bg-muted/30 border rounded-lg space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold">Progreso de Amortización de Capital:</span>
              <span className="font-bold text-primary">{porcentajeAmortizado}%</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-primary h-2.5 rounded-full transition-all duration-500"
                style={{ width: `${porcentajeAmortizado}%` }}
              />
            </div>
            <div className="grid grid-cols-3 gap-2 pt-1 text-[11px] text-muted-foreground">
              <div>Capital Inicial: <strong className="text-foreground">{formatCOP(capitalOriginal)}</strong></div>
              <div>Amortizado: <strong className="text-emerald-600 dark:text-emerald-400">{formatCOP(totalAbonadoCapital)}</strong></div>
              <div>Saldo Capital Vivo: <strong className="text-foreground">{formatCOP(credito.saldo_capital)}</strong></div>
            </div>
          </div>

          {/* TABLA HISTÓRICA / LIBRO AUXILIAR DE LA OBLIGACIÓN */}
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-muted/50 p-2.5 font-bold border-b flex justify-between items-center">
              <span>Cronología de Movimientos y Amortizaciones</span>
              <span className="text-[11px] text-muted-foreground font-normal">
                {evolucion.length} registros históricos
              </span>
            </div>

            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/20 border-b text-[10px] text-muted-foreground sticky top-0">
                  <tr>
                    <th className="p-2">Fecha</th>
                    <th className="p-2">Concepto / Evento</th>
                    <th className="p-2 text-right">Interés Causado</th>
                    <th className="p-2 text-right">Abono Interés</th>
                    <th className="p-2 text-right">Abono Capital</th>
                    <th className="p-2 text-right">Saldo Capital</th>
                    <th className="p-2 text-right">Saldo Intereses</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {evolucion.map((ev, i) => (
                    <tr key={i} className="hover:bg-muted/30">
                      <td className="p-2 font-medium">{formatDate(ev.fecha)}</td>
                      <td className="p-2">
                        <span className="block font-medium">{ev.descripcion}</span>
                      </td>
                      <td className="p-2 text-right text-amber-600 dark:text-amber-400">
                        {ev.intereses_causados > 0 ? `+${formatCOP(ev.intereses_causados)}` : "—"}
                      </td>
                      <td className="p-2 text-right text-emerald-600 dark:text-emerald-400">
                        {ev.abono_intereses > 0 ? `-${formatCOP(ev.abono_intereses)}` : "—"}
                      </td>
                      <td className="p-2 text-right text-emerald-600 dark:text-emerald-400">
                        {ev.abono_capital > 0 ? `-${formatCOP(ev.abono_capital)}` : "—"}
                      </td>
                      <td className="p-2 text-right font-bold">
                        {formatCOP(ev.saldo_capital_corriente)}
                      </td>
                      <td className="p-2 text-right">
                        {formatCOP(ev.saldo_intereses_corriente)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <DialogFooter className="pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
