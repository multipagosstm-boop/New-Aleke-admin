import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { formatCOP } from "@/lib/contabilidad";

const hoy = new Date().toISOString().substring(0, 10);

export default function TerminarContratoDialog({ open, onOpenChange, contrato, cdas, onSaved }) {
  const [devolver, setDevolver] = useState(false);
  const [cdaId, setCdaId] = useState("");
  const [fecha, setFecha] = useState(hoy);
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (contrato) {
      setDevolver(contrato.valor_deposito > 0);
      setCdaId("");
      setFecha(hoy);
      setMotivo("");
    }
  }, [contrato]);

  if (!contrato) return null;
  const cdasActivas = cdas.filter((c) => c.estado === "activa");

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const resp = await base44.functions.invoke("gestionarRooftop", {
        action: "terminarContrato",
        contrato_id: contrato.id,
        devolver_deposito: devolver,
        cda_devolucion_id: devolver ? cdaId : null,
        fecha_terminacion: fecha,
        motivo
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
          <DialogTitle>Terminar Contrato {contrato.codigo}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md border p-3 text-sm bg-muted/20">
            <div className="flex justify-between"><span className="text-muted-foreground">Depósito:</span><span>{formatCOP(contrato.valor_deposito)}</span></div>
          </div>
          <div>
            <Label>Fecha de terminación</Label>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="dev-dep" checked={devolver} onCheckedChange={setDevolver} disabled={contrato.valor_deposito <= 0} />
            <Label htmlFor="dev-dep" className="text-sm cursor-pointer">Devolver depósito al inquilino</Label>
          </div>
          {devolver && (
            <div className="pl-6 border-l-2 border-primary/30 space-y-2">
              <div>
                <Label>CDA para devolución *</Label>
                <Select value={cdaId} onValueChange={setCdaId}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar CDA..." /></SelectTrigger>
                  <SelectContent>
                    {cdasActivas.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <div>
            <Label>Motivo de terminación</Label>
            <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} placeholder="Ej: Fin de contrato, incumplimiento, mutuo acuerdo..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button variant="destructive" onClick={handleSubmit} disabled={saving || (devolver && !cdaId)}>
            {saving ? "Terminando..." : "Terminar Contrato"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}