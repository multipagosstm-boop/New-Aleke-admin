import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Calculator } from "lucide-react";
import { formatCOP } from "@/lib/contabilidad";
import { formatearTasaPorcentaje } from "@/lib/emprendamos";
import { useToast } from "@/components/ui/use-toast";

export default function GenerarInteresesDialog({
  open,
  onOpenChange,
  inscritos = [],
  creditos = [],
  clientes = [],
  onSuccess
}) {
  const { toast } = useToast();
  const hoy = new Date().toISOString().substring(0, 10);
  const periodoDefault = hoy.substring(0, 7);

  // Por regla del negocio, el corte de intereses es el día 30 de cada mes
  const [periodo, setPeriodo] = useState(periodoDefault);
  const [fechaCorte, setFechaCorte] = useState(`${periodoDefault}-30`);
  const [submitting, setSubmitting] = useState(false);

  // Al cambiar el mes, sugerir día 30
  const handlePeriodoChange = (val) => {
    setPeriodo(val);
    setFechaCorte(`${val}-30`);
  };

  // Calcular previsualización de intereses para todos los créditos activos
  const previsualizacion = [];
  let totalInteresesEstimados = 0;

  for (const ins of inscritos) {
    if (ins.estado !== "activo") continue;
    const cli = clientes.find((c) => c.id === ins.cliente_id);
    const creds = creditos.filter((c) => c.emprendamos_cliente_id === ins.id && c.estado === "vigente");

    for (const c of creds) {
      if (c.tipo === "comision") continue; // Las comisiones no causan interés
      const saldoCap = Number(c.saldo_capital) || 0;
      if (saldoCap <= 0) continue;

      const rawTasa = Number(c.tasa_nominal);
      const tasa = isNaN(rawTasa) || rawTasa <= 0 ? 0.03 : (rawTasa > 1 ? rawTasa / 100 : rawTasa);
      const interes = Math.round(Math.round(saldoCap) * tasa);
      if (interes <= 0) continue;

      totalInteresesEstimados += Math.round(interes);
      previsualizacion.push({
        clienteNombre: cli?.nombre || (ins.nombre && ins.nombre !== "Cliente Emprendamos" ? ins.nombre : "") || c.clienteNombre || "Cliente",
        codigo: c.codigo,
        tipo: c.tipo,
        concepto: c.concepto,
        saldo_capital: Math.round(saldoCap),
        tasa,
        interes_calculado: Math.round(interes)
      });
    }
  }

  const handleGenerar = async () => {
    if (previsualizacion.length === 0) {
      toast({ title: "Sin créditos pendientes", description: "No hay créditos vigentes con saldo capital para liquidar intereses." });
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        accion: "generarInteresesMensuales",
        periodo,
        fecha: fechaCorte
      };
      await onSuccess(payload);
      onOpenChange(false);
      toast({
        title: "Intereses causados con éxito",
        description: `Se liquidaron ${formatCOP(totalInteresesEstimados)} en intereses y se generaron los comprobantes contables (410509).`
      });
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "Error", description: err.message || "No se pudieron generar los intereses" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <Calculator className="w-5 h-5 text-amber-500" />
            Generar Intereses Mensuales (Corte Día 30)
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Calcula el devengado de intereses sobre el saldo de capital de cada crédito al corte del día 30 y genera el asiento contable (Débito 120502 vs Crédito 410509).
          </p>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* SELECCIÓN DE PERIODO Y FECHA DE CORTE */}
          <div className="grid grid-cols-2 gap-3 p-3 bg-muted/30 border rounded-lg">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Período de Liquidación</Label>
              <Input
                type="month"
                value={periodo}
                onChange={(e) => handlePeriodoChange(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Fecha de Corte (Día 30)</Label>
              <Input
                type="date"
                value={fechaCorte}
                onChange={(e) => setFechaCorte(e.target.value)}
              />
            </div>
          </div>

          {/* RESUMEN ESTIMADO */}
          <div className="flex items-center justify-between p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-xs">
            <div>
              <span className="font-semibold text-emerald-900 dark:text-emerald-200 block">
                Total Intereses a Causar ({previsualizacion.length} créditos):
              </span>
              <span className="text-[11px] text-muted-foreground">
                Reconocimiento contable como ingreso financiero en la subcuenta 410509
              </span>
            </div>
            <span className="text-base font-bold text-emerald-700 dark:text-emerald-400">
              {formatCOP(totalInteresesEstimados)}
            </span>
          </div>

          {/* TABLA PREVIA */}
          <div className="space-y-2 border rounded-lg p-3">
            <Label className="text-xs font-bold block">Previsualización por Crédito</Label>
            {previsualizacion.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">
                No hay créditos con saldo de capital para causar intereses en este período.
              </p>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {previsualizacion.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-2 bg-background border rounded-lg flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold">{item.codigo}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {item.tipo}
                        </Badge>
                        <span className="text-muted-foreground truncate max-w-[200px]">
                          {item.clienteNombre}
                        </span>
                      </div>
                      <span className="text-[11px] text-muted-foreground">
                        Base: {formatCOP(item.saldo_capital)} a tasa {formatearTasaPorcentaje(item.tasa)}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">
                        +{formatCOP(item.interes_calculado)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleGenerar}
            disabled={submitting || previsualizacion.length === 0}
          >
            {submitting ? "Liquidando..." : "Confirmar y Causar Intereses"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
