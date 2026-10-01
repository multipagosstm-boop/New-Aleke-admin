import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertTriangle, Loader2 } from "lucide-react";

export default function ConfirmMotivoDialog({ open, onOpenChange, title, description, confirmLabel = "Eliminar", onConfirm, requireMotivo = true }) {
  const [motivo, setMotivo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) { setMotivo(""); setError(""); setLoading(false); }
  }, [open]);

  const handleConfirm = async () => {
    if (requireMotivo && !motivo.trim()) { setError("Ingrese el motivo"); return; }
    setLoading(true); setError("");
    try {
      await onConfirm(motivo.trim());
      onOpenChange(false);
    } catch (e) {
      const errData = e?.data || e?.response?.data || {};
      setError(errData.error || e?.message || "Error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md z-[80]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-destructive" /> {title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Motivo *</Label>
          <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Describe el motivo de esta acción..." />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancelar</Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={loading || (requireMotivo && !motivo.trim())}>
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}