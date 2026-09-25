import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertCircle, Loader2, Receipt } from "lucide-react";
import { NumberInput } from "@/components/ui/number-input";
import { formatCOP, hoyLocal } from "@/lib/contabilidad";

export default function ComisionDialog({ open, onOpenChange, onSaved, inscrito }) {
  const [producto, setProducto] = useState("");
  const [base, setBase] = useState(0);
  const [porcentaje, setPorcentaje] = useState(10);
  const [fecha, setFecha] = useState(hoyLocal());
  const [notas, setNotas] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setProducto(""); setBase(0); setPorcentaje(10); setFecha(hoyLocal()); setNotas(""); setError("");
  }, [open]);

  if (!inscrito) return null;
  const comision = Math.round((Number(base) || 0) * ((Number(porcentaje) || 0) / 100));

  const handleSubmit = async () => {
    setError("");
    if (!base || base <= 0) { setError("Base (cupo o saldo del producto) inválida"); return; }
    setSaving(true);
    try {
      await base44.functions.invoke("gestionarEmprendamos", {
        accion: "registrarComision",
        emprendamos_cliente_id: inscrito.id, producto, base: Number(base),
        porcentaje: Number(porcentaje) / 100, fecha, notas
      });
      onSaved(); onOpenChange(false);
    } catch (e) {
      const errData = e?.data || e?.response?.data || {};
      setError(errData.error || e?.message || "Error al registrar comisión");
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Receipt className="w-5 h-5 text-primary" /> Comisión por nuevo producto — {inscrito._clienteNombre || ""}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label>Producto adquirido</Label><Input value={producto} onChange={(e) => setProducto(e.target.value)} placeholder="Ej: TDC 10M, Libre destino 34M..." /></div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Cupo / Saldo *</Label><NumberInput value={base} onChange={setBase} className="text-right" /></div>
            <div><Label>Comisión %</Label><Input type="number" step="0.1" value={porcentaje} onChange={(e) => setPorcentaje(e.target.value)} /></div>
            <div><Label>Fecha *</Label><Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></div>
          </div>
          <div className="text-sm bg-primary/10 text-primary rounded-md px-3 py-2">Comisión a cobrar: <b>{formatCOP(comision)}</b> (se carga a la cartera del cliente)</div>
          <div><Label>Notas</Label><Input value={notas} onChange={(e) => setNotas(e.target.value)} /></div>
          {error && <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive"><AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /><span>{error}</span></div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Registrar comisión</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}