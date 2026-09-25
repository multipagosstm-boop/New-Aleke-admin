import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { TrendingUp } from "lucide-react";

export default function AumentoCupoDialog({ open, onOpenChange, tarjeta, onDone }) {
  const [nuevoCupo, setNuevoCupo] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!tarjeta) return null;

  const cupoActual = tarjeta.cupo || 0;
  const incremento = (Number(nuevoCupo) || 0) - cupoActual;

  const handleSubmit = async () => {
    if (Number(nuevoCupo) <= cupoActual) { setError("El nuevo cupo debe ser mayor al actual"); return; }
    setSaving(true);
    setError("");
    try {
      await base44.functions.invoke("gestionarTarjeta", {
        operacion: "aumento_cupo",
        tarjeta_id: tarjeta.id,
        nuevo_cupo: Number(nuevoCupo)
      });
      onDone();
      onOpenChange(false);
      setNuevoCupo("");
    } catch (e) {
      const msg = e?.response?.data?.error || e.message;
      setError(msg);
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4" /> Aumento de Cupo
          </DialogTitle>
          <DialogDescription>
            Se creará una nueva versión de la tarjeta conservando el historial completo.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="bg-muted/50 rounded-md p-3 text-sm space-y-1">
            <div>Tarjeta: <span className="font-mono font-medium">{tarjeta.nombre}</span></div>
            <div>Código: <span className="font-mono">{tarjeta.nomenclatura}</span></div>
            <div>Cupo actual: <span className="font-mono">{cupoActual.toLocaleString()}</span></div>
          </div>
          <div>
            <Label>Nuevo cupo aprobado *</Label>
            <Input type="number" value={nuevoCupo} onChange={(e) => setNuevoCupo(e.target.value)} placeholder={String(cupoActual)} />
            {Number(nuevoCupo) > cupoActual && (
              <div className="text-xs text-success mt-1">Incremento: +{incremento.toLocaleString()}</div>
            )}
          </div>
          {error && <div className="text-sm text-destructive">{error}</div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving}>{saving ? "Procesando..." : "Confirmar Aumento"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}