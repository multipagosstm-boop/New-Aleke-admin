import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { formatCOP } from "@/lib/contabilidad";

function addMonths(dateStr, months) {
  const d = new Date(dateStr + "T00:00:00");
  d.setMonth(d.getMonth() + months);
  return d.toISOString().substring(0, 10);
}

export default function RenovarContratoDialog({ open, onOpenChange, contrato, onSaved }) {
  const [nuevoValor, setNuevoValor] = useState(0);
  const [nuevaFecha, setNuevaFecha] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (contrato) {
      setNuevoValor(contrato.valor_arriendo || 0);
      setNuevaFecha(contrato.fecha_fin || new Date().toISOString().substring(0, 10));
    }
  }, [contrato]);

  if (!contrato) return null;
  const fechaFin = nuevaFecha ? addMonths(nuevaFecha, 6) : "";

  const handleSubmit = async () => {
    if (!nuevoValor || !nuevaFecha) return;
    setSaving(true);
    try {
      const resp = await base44.functions.invoke("gestionarRooftop", {
        action: "renovarContrato",
        contrato_id: contrato.id,
        nuevo_valor_arriendo: nuevoValor,
        nueva_fecha_inicio: nuevaFecha
      });
      if (resp.data?.error) throw new Error(resp.data.error);
      onSaved();
      onOpenChange(false);
    } catch (e) {
      alert("Error: " + e.message);
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Renovar Contrato {contrato.codigo}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md border p-3 text-sm bg-muted/20">
            <div className="flex justify-between"><span className="text-muted-foreground">Arriendo actual:</span><span>{formatCOP(contrato.valor_arriendo)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Fin actual:</span><span className="font-mono">{contrato.fecha_fin}</span></div>
          </div>
          <div>
            <Label>Nuevo valor de arriendo *</Label>
            <NumberInput value={nuevoValor} onChange={(v) => setNuevoValor(v)} placeholder="0" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Nueva fecha inicio *</Label>
              <Input type="date" value={nuevaFecha} onChange={(e) => setNuevaFecha(e.target.value)} />
            </div>
            <div>
              <Label>Nueva fecha fin (auto)</Label>
              <Input type="date" value={fechaFin} disabled className="bg-muted/30" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving || !nuevoValor || !nuevaFecha}>
            {saving ? "Renovando..." : "Renovar Contrato"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}