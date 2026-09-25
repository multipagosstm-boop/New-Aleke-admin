import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatCOP, formatDate } from "@/lib/contabilidad";
import { Forward, Calendar, DollarSign, FolderInput } from "lucide-react";

const OPCIONES = [
  { value: "vincular_proximo_periodo", label: "Vincular al próximo periodo", icon: Forward,
    desc: "El movimiento se reenvía al próximo periodo (aparecerá en el próximo extracto)" },
  { value: "cambiar_fecha", label: "Cambiar fecha", icon: Calendar,
    desc: "Modifica la fecha del comprobante" },
  { value: "cambiar_valor", label: "Cambiar valor", icon: DollarSign,
    desc: "Modifica el valor y ajusta la contrapartida para mantener el balance" },
  { value: "asignar_cuenta_pendiente", label: "Asignar a pendientes (139006)", icon: FolderInput,
    desc: "Reclasifica el movimiento a la cuenta de pendientes de difícil cobro" }
];

export default function ModificarSobranteDialog({ open, onOpenChange, movimiento, onConfirm, saving }) {
  const [tipoMod, setTipoMod] = useState("vincular_proximo_periodo");
  const [nuevoValor, setNuevoValor] = useState("");
  const [nuevaFecha, setNuevaFecha] = useState("");
  const [motivo, setMotivo] = useState("");

  if (!movimiento) return null;
  const valorActual = movimiento.credito || movimiento.debito || 0;

  const handleConfirm = () => {
    onConfirm({
      movimiento_sistema_id: movimiento.id,
      tipo_mod: tipoMod,
      nuevo_valor: nuevoValor ? Number(nuevoValor) : null,
      nueva_fecha: nuevaFecha || null,
      motivo: motivo || null
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Modificar movimiento sobrante</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md border p-3 space-y-1 text-sm bg-muted/20">
            <div><span className="text-muted-foreground">Fecha:</span> {formatDate(movimiento.fecha)}</div>
            <div><span className="text-muted-foreground">Descripción:</span> {movimiento.descripcion}</div>
            <div><span className="text-muted-foreground">Valor:</span> <span className="font-bold text-primary">{formatCOP(valorActual)}</span></div>
            <div className="text-xs text-warning">Está en el sistema — No aparece en extracto banco</div>
          </div>
          <div>
            <Label className="mb-2 block">Tipo de modificación</Label>
            <div className="space-y-1.5">
              {OPCIONES.map((op) => {
                const Icon = op.icon;
                const selected = tipoMod === op.value;
                return (
                  <button key={op.value} type="button"
                    onClick={() => setTipoMod(op.value)}
                    className={`w-full text-left rounded-md border p-2.5 transition-colors ${selected ? "border-primary bg-primary/5" : "hover:bg-muted/30"}`}>
                    <div className="flex items-start gap-2">
                      <Icon className={`w-4 h-4 mt-0.5 ${selected ? "text-primary" : "text-muted-foreground"}`} />
                      <div>
                        <div className="text-sm font-medium">{op.label}</div>
                        <div className="text-xs text-muted-foreground">{op.desc}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          {tipoMod === "cambiar_valor" && (
            <div>
              <Label>Nuevo valor</Label>
              <Input type="number" value={nuevoValor} onChange={(e) => setNuevoValor(e.target.value)} placeholder={String(valorActual)} />
              <p className="text-xs text-muted-foreground mt-1">Se ajustará automáticamente la contrapartida para mantener el balance.</p>
            </div>
          )}
          {tipoMod === "cambiar_fecha" && (
            <div>
              <Label>Nueva fecha</Label>
              <Input type="date" value={nuevaFecha} onChange={(e) => setNuevaFecha(e.target.value)} />
            </div>
          )}
          <div>
            <Label>Motivo (opcional)</Label>
            <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} placeholder="Razón de la modificación..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleConfirm}
            disabled={saving || (tipoMod === "cambiar_valor" && !nuevoValor) || (tipoMod === "cambiar_fecha" && !nuevaFecha)}>
            {saving ? "Modificando..." : "Aplicar modificación"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}