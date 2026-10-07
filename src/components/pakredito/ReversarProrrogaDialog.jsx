import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { Textarea } from "@/components/ui/textarea";
import { formatCOP, formatDate, hoyLocal } from "@/lib/contabilidad";
import { sumarPeriodo } from "@/lib/pakredito";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, History, RotateCcw, AlertTriangle } from "lucide-react";

const addDays = (dateStr, n) => {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + (Number(n) || 0));
  return d.toISOString().substring(0, 10);
};

export default function ReversarProrrogaDialog({ open, onOpenChange, prestamo, clienteNombre, onSaved }) {
  const [modo, setModo] = useState("dias"); // "dias", "original", "fecha"
  const [dias, setDias] = useState(15);
  const [nuevaFechaManual, setNuevaFechaManual] = useState("");
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);
  const [cuotas, setCuotas] = useState([]);
  const [loadingCuotas, setLoadingCuotas] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!open || !prestamo) return;
    setModo("dias");
    const defDias = prestamo.periodo === "semanal" ? 7 : (prestamo.periodo === "quincenal" ? 15 : 30);
    setDias(defDias);
    setMotivo("Eliminación de prórroga aplicada");
    setNuevaFechaManual("");

    // Cargar cuotas pendientes
    setLoadingCuotas(true);
    base44.entities.CuotaAmortizacion.filter({ prestamo_id: prestamo.id })
      .then((res) => {
        const sorted = (res || []).sort((a, b) => a.numero - b.numero);
        setCuotas(sorted);
      })
      .catch((err) => console.error(err))
      .finally(() => setLoadingCuotas(false));
  }, [open, prestamo?.id]);

  const pendientes = useMemo(() => {
    return cuotas.filter((c) => c.estado !== "pagada");
  }, [cuotas]);

  const primeraPendiente = pendientes[0];

  const fechaOriginalCalculada = useMemo(() => {
    if (!prestamo || !primeraPendiente) return null;
    return sumarPeriodo(prestamo.fecha_prestamo, prestamo.periodo || "mensual", primeraPendiente.numero);
  }, [prestamo, primeraPendiente]);

  const fechaResultante = useMemo(() => {
    if (!primeraPendiente) return prestamo?.fecha_proximo_pago || "";
    if (modo === "original") {
      return fechaOriginalCalculada || primeraPendiente.fecha_vencimiento;
    }
    if (modo === "fecha") {
      return nuevaFechaManual || primeraPendiente.fecha_vencimiento;
    }
    return addDays(primeraPendiente.fecha_vencimiento, -Number(dias || 0));
  }, [modo, dias, nuevaFechaManual, primeraPendiente, fechaOriginalCalculada, prestamo]);

  const hoy = hoyLocal();
  const quedaraEnMora = fechaResultante && fechaResultante < hoy;

  const confirmar = async () => {
    if (!prestamo) return;
    setSaving(true);
    try {
      const res = await base44.functions.invoke("gestionarPakredito", {
        accion: "reversarProrroga",
        prestamo_id: prestamo.id,
        modo,
        dias: Number(dias) || 0,
        nueva_fecha: modo === "fecha" ? nuevaFechaManual : null,
        motivo
      });

      const r = res?.data || res;
      if (r?.success === false || r?.error) {
        throw new Error(r?.error || "No se pudo reversar la prórroga");
      }

      toast({
        title: "Prórroga reversada con éxito",
        description: `Nuevo vencimiento establecido en ${formatDate(r.fecha_proximo_pago || fechaResultante)}.`
      });

      onSaved?.(r.prestamo);
      onOpenChange?.(false);
    } catch (e) {
      console.error(e);
      toast({
        variant: "destructive",
        title: "Error al reversar prórroga",
        description: e.message || "Ocurrió un error inesperado al reversar la prórroga."
      });
    } finally {
      setSaving(false);
    }
  };

  if (!prestamo) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <History className="w-5 h-5" /> Reversar / Eliminar Prórroga
          </DialogTitle>
          <DialogDescription>
            {clienteNombre} · {prestamo.codigo} — regresa las cuotas pendientes a su vencimiento previo o al calendario original.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md bg-muted p-2">
              <div className="text-muted-foreground">Vencimiento actual</div>
              <div className="font-mono font-medium text-foreground">{formatDate(prestamo.fecha_proximo_pago)}</div>
              <div className="text-[10px] text-muted-foreground">Cuota {primeraPendiente?.numero || 1} de {cuotas.length}</div>
            </div>
            <div className="rounded-md bg-primary/10 p-2">
              <div className="text-muted-foreground">Saldo capital</div>
              <div className="font-mono font-medium text-primary">{formatCOP(prestamo.saldo_capital)}</div>
              <div className="text-[10px] text-muted-foreground">{pendientes.length} cuotas pendientes</div>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold">Método de reversión</Label>
            <div className="grid grid-cols-3 gap-1.5 p-1 bg-muted/60 rounded-lg text-xs">
              <button
                type="button"
                onClick={() => setModo("dias")}
                className={`py-1.5 px-2 rounded font-medium text-center transition-colors ${
                  modo === "dias" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Restar días
              </button>
              <button
                type="button"
                onClick={() => setModo("original")}
                className={`py-1.5 px-2 rounded font-medium text-center transition-colors ${
                  modo === "original" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Cal. Original
              </button>
              <button
                type="button"
                onClick={() => {
                  setModo("fecha");
                  if (!nuevaFechaManual && primeraPendiente) {
                    setNuevaFechaManual(addDays(primeraPendiente.fecha_vencimiento, -15));
                  }
                }}
                className={`py-1.5 px-2 rounded font-medium text-center transition-colors ${
                  modo === "fecha" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Fijar fecha
              </button>
            </div>
          </div>

          {modo === "dias" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Días a retroceder</Label>
              <NumberInput value={dias} onChange={(v) => setDias(v)} className="text-right h-9" />
              <p className="text-[11px] text-muted-foreground">
                Se restarán {dias || 0} días a las {pendientes.length} cuotas pendientes.
              </p>
            </div>
          )}

          {modo === "original" && (
            <div className="rounded-md border border-border p-2.5 text-xs bg-muted/30 space-y-1">
              <div className="font-medium flex items-center gap-1.5">
                <RotateCcw className="w-3.5 h-3.5 text-primary" /> Restablecer al calendario inicial pactado
              </div>
              <p className="text-muted-foreground text-[11px]">
                Calculado desde la fecha de desembolso ({formatDate(prestamo.fecha_prestamo)}) con periodo {prestamo.periodo}.
              </p>
              {fechaOriginalCalculada && (
                <p className="text-foreground font-mono text-[11px] mt-1">
                  Vencimiento original cuota {primeraPendiente?.numero}: <b>{formatDate(fechaOriginalCalculada)}</b>
                </p>
              )}
            </div>
          )}

          {modo === "fecha" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Nueva fecha de vencimiento</Label>
              <input
                type="date"
                value={nuevaFechaManual}
                onChange={(e) => setNuevaFechaManual(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm font-mono"
              />
            </div>
          )}

          {/* Tarjeta de previsualización */}
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 space-y-1">
            <div className="text-[11px] uppercase tracking-wider font-semibold text-amber-700 dark:text-amber-300 flex items-center justify-between">
              <span>Nuevo vencimiento resultante</span>
              <span className="font-mono text-xs">{formatDate(fechaResultante)}</span>
            </div>
            {quedaraEnMora && (
              <div className="flex items-center gap-1.5 text-destructive text-[11px] pt-1">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>La fecha es anterior a hoy ({formatDate(hoy)}). El crédito pasará a estado <b>en mora</b>.</span>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Motivo o nota (opcional)</Label>
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={2}
              placeholder="Ej: Reversión de prórroga por solicitud del cliente..."
              className="text-xs"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange?.(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button
            onClick={confirmar}
            disabled={saving || loadingCuotas || !fechaResultante}
            className="bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-500 dark:hover:bg-amber-600"
          >
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <History className="w-4 h-4 mr-2" />}
            Confirmar reversión
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
