import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, Loader2 } from "lucide-react";

export default function SaltarExtractoDialog({ open, onOpenChange, producto, periodo, onConfirmado }) {
  const [motivo, setMotivo] = useState("");
  const [cancelarTarjeta, setCancelarTarjeta] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) { setMotivo(""); setCancelarTarjeta(false); setError(""); setSaving(false); }
  }, [open]);

  const handleConfirmar = async () => {
    if (!motivo.trim()) { setError("Indica el motivo del salto"); return; }
    setSaving(true); setError("");
    try {
      await onConfirmado({ motivo: motivo.trim(), cancelarTarjeta });
      onOpenChange(false);
    } catch (e) {
      setError(e.message || "Error al saltar el extracto");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-warning" /> Saltar extracto
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Vas a saltar el extracto de <b>{producto?.nombre || "—"}</b> para el período{" "}
            <b className="font-mono">{periodo}</b>. Quedará registrado como <b>"saltado"</b> en la
            conciliación bancaria (no como vacío).
          </p>
          <div className="space-y-1.5">
            <Label>Motivo *</Label>
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              placeholder="Ej: tarjeta cancelada / no se pudo obtener el extracto del banco en este período"
            />
          </div>
          <label className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 p-3 cursor-pointer">
            <Checkbox
              checked={cancelarTarjeta}
              onCheckedChange={(v) => setCancelarTarjeta(v === true)}
              className="mt-0.5"
            />
            <span className="text-xs">
              <b>La tarjeta se canceló</b> — inhabilitar la tarjeta en el módulo de Tarjetas de
              Crédito (ya no se cargarán más extractos).
            </span>
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleConfirmar} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Saltar extracto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}