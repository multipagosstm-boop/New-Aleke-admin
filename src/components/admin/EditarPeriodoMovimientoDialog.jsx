import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { formatCOP, formatDate } from "@/lib/contabilidad";

export default function EditarPeriodoMovimientoDialog({ movimiento, onOpenChange, onSaved }) {
  const [periodo, setPeriodo] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (movimiento) setPeriodo(movimiento.periodo_extracto || "");
  }, [movimiento]);

  if (!movimiento) return null;
  const valor = movimiento.credito || movimiento.debito || 0;

  const handleSave = async () => {
    setSaving(true);
    try {
      await base44.entities.MovimientoContable.update(movimiento.id, {
        periodo_extracto: periodo.trim() || ""
      });
      onSaved();
      onOpenChange(false);
    } catch (e) { alert("Error: " + e.message); }
    setSaving(false);
  };

  return (
    <Dialog open={!!movimiento} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Modificar período del movimiento</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md border p-3 space-y-1 text-sm bg-muted/20">
            <div><span className="text-muted-foreground">Fecha:</span> {formatDate(movimiento.fecha)}</div>
            <div><span className="text-muted-foreground">Cuenta:</span> {movimiento.subcuenta} — {movimiento.cuenta_nombre}</div>
            <div><span className="text-muted-foreground">Descripción:</span> {movimiento.descripcion}</div>
            <div><span className="text-muted-foreground">Valor:</span> <span className="font-bold text-primary">{formatCOP(valor)}</span></div>
          </div>
          <div>
            <Label>Período del extracto (YYYY-MM)</Label>
            <Input value={periodo} onChange={(e) => setPeriodo(e.target.value)} placeholder="Ej: 2026-07 (vacío = usa la fecha)" />
            <p className="text-xs text-muted-foreground mt-1">
              Define en qué período de extracto aparece este movimiento para conciliación. Vacío: se asigna automáticamente por la fecha del movimiento.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}