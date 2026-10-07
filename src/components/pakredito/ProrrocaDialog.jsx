import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { Textarea } from "@/components/ui/textarea";
import { formatCOP, formatDate, hoyLocal } from "@/lib/contabilidad";
import { Loader2, CalendarClock } from "lucide-react";

const addDays = (dateStr, n) => {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + Number(n) || 0);
  return d.toISOString().substring(0, 10);
};

export default function ProrrocaDialog({ open, onOpenChange, prestamo, clienteNombre, onSaved }) {
  const [dias, setDias] = useState(15);
  const [nota, setNota] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) { setDias(15); setNota(""); }
  }, [open, prestamo?.id]);

  if (!prestamo) return null;

  const hoy = hoyLocal();
  const base = prestamo.fecha_proximo_pago || hoy;
  const nuevaFecha = addDays(base, dias);

  const confirmar = async () => {
    setSaving(true);
    try {
      const cuotas = await base44.entities.CuotaAmortizacion.filter({ prestamo_id: prestamo.id });
      let pendientes = (cuotas || []).filter((c) => c.estado !== "pagada").sort((a, b) => a.numero - b.numero);
      if (pendientes.length === 0 && (cuotas || []).length > 0) {
        pendientes = [cuotas[cuotas.length - 1]];
      }
      if (pendientes.length > 0) {
        await base44.entities.CuotaAmortizacion.bulkUpdate(
          pendientes.map((c) => ({
            id: c.id,
            fecha_vencimiento: nuevaFecha,
            estado: (Number(c.valor_pagado) || 0) > 0 ? "parcial" : "pendiente"
          }))
        );
      }
      const proxima = nuevaFecha;
      const notaLinea = `Prórroga ${hoy}: +${dias} días → nuevo vence ${proxima}${nota ? ". " + nota : ""}`;
      await base44.entities.Prestamo.update(prestamo.id, {
        fecha_proximo_pago: proxima,
        estado: "vigente",
        notas: prestamo.notas ? prestamo.notas + "\n" + notaLinea : notaLinea
      });
      onSaved?.();
      onOpenChange?.(false);
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CalendarClock className="w-5 h-5" /> Otorgar prórroga</DialogTitle>
          <DialogDescription>
            {clienteNombre} · {prestamo.codigo} — concede un nuevo periodo de espera sin generar asiento contable.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md bg-muted p-2">
              <div className="text-muted-foreground">Vencimiento actual</div>
              <div className="font-mono font-medium">{formatDate(prestamo.fecha_proximo_pago)}</div>
            </div>
            <div className="rounded-md bg-primary/10 p-2">
              <div className="text-muted-foreground">Saldo capital</div>
              <div className="font-mono font-medium">{formatCOP(prestamo.saldo_capital)}</div>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Días de espera</Label>
            <NumberInput value={dias} onChange={(v) => setDias(v)} className="text-right" />
            <p className="text-xs text-muted-foreground">Nuevo vencimiento: <b className="font-mono text-foreground">{formatDate(nuevaFecha)}</b></p>
          </div>
          <div className="space-y-1.5">
            <Label>Nota (opcional)</Label>
            <Textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} placeholder="Motivo del periodo de espera..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange?.(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={confirmar} disabled={saving || !dias}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CalendarClock className="w-4 h-4 mr-2" />} Otorgar prórroga
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}