import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { LogOut, AlertTriangle, CheckCircle } from "lucide-react";
import { formatCOP, formatDate } from "@/lib/contabilidad";
import { useToast } from "@/components/ui/use-toast";

export default function SalidaClienteDialog({
  open,
  onOpenChange,
  inscrito,
  cliente,
  onSuccess
}) {
  const { toast } = useToast();
  const hoy = new Date().toISOString().substring(0, 10);
  const [fechaSalida, setFechaSalida] = useState(hoy);
  const [motivo, setMotivo] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!inscrito) return null;

  const esEligible = !inscrito.fecha_eligible_salida || inscrito.fecha_eligible_salida <= hoy;
  const saldoPendiente = Number(inscrito.saldo_deuda) || 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!esEligible) {
      toast({
        variant: "destructive",
        title: "No elegible todavía",
        description: `El cliente cumple el año de permanencia el ${formatDate(inscrito.fecha_eligible_salida)}.`
      });
      return;
    }

    setSubmitting(true);
    try {
      await onSuccess({
        accion: "salirCliente",
        emprendamos_cliente_id: inscrito.id,
        fecha: fechaSalida,
        motivo
      });
      onOpenChange(false);
      toast({
        title: "Cliente retirado de Emprendamos",
        description: `Se procesó la salida de ${cliente?.nombre || 'Cliente'}. Sus productos y saldo remanente quedan bajo su propia gestión.`
      });
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "Error", description: err.message || "No se pudo procesar la salida" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <LogOut className="w-5 h-5 text-amber-500" />
            Salida de Cliente — Emprendamos
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Tras 1 año de saneamiento, el cliente puede retirarse con sus tarjetas y productos saneados.
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1 text-xs">
          {/* VERIFICACIÓN DE ELEGIBILIDAD */}
          <div className="p-3 bg-muted/40 border rounded-lg space-y-2">
            <div className="flex justify-between items-center">
              <span>Fecha de Ingreso:</span>
              <strong>{formatDate(inscrito.fecha_ingreso)}</strong>
            </div>
            <div className="flex justify-between items-center">
              <span>Fecha Elegible de Salida (1 año):</span>
              <strong>{formatDate(inscrito.fecha_eligible_salida)}</strong>
            </div>
            <div className="flex justify-between items-center pt-1 border-t">
              <span>Estado de Elegibilidad:</span>
              {esEligible ? (
                <Badge variant="outline" className="border-emerald-500 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle className="w-3 h-3 mr-1" /> Elegible para Salida
                </Badge>
              ) : (
                <Badge variant="destructive">
                  <AlertTriangle className="w-3 h-3 mr-1" /> No Cumple 1 Año
                </Badge>
              )}
            </div>
          </div>

          {/* SALDO PENDIENTE */}
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <div className="flex justify-between items-center font-semibold text-amber-900 dark:text-amber-200">
              <span>Saldo Remanente con Emprendamos:</span>
              <span className="text-base font-bold text-amber-700 dark:text-amber-400">
                {formatCOP(saldoPendiente)}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              {saldoPendiente > 0
                ? "El saldo pendiente se traspasa a los productos de crédito del cliente para que continúe pagándolo por su cuenta."
                : "El cliente se retira con sus obligaciones en $0 (a paz y salvo con Emprendamos)."}
            </p>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-semibold">Fecha de Salida *</Label>
            <Input
              type="date"
              value={fechaSalida}
              onChange={(e) => setFechaSalida(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-semibold">Motivo y Acta de Entrega de Productos</Label>
            <Textarea
              rows={3}
              placeholder="Detalle de entrega de tarjetas, acuerdo de pago del saldo remanente..."
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="default"
              disabled={submitting || !esEligible}
            >
              {submitting ? "Procesando..." : "Confirmar Salida de Cliente"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
