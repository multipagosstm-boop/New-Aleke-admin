import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertCircle, Loader2, Pencil } from "lucide-react";
import CuentaIngresoSelect from "@/components/admin/CuentaIngresoSelect";
import { formatCOP, hoyLocal } from "@/lib/contabilidad";

export default function EditarAbonoDialog({ open, onOpenChange, onSaved, abono }) {
  const [fecha, setFecha] = useState("");
  const [tipo, setTipo] = useState("otro");
  const [notas, setNotas] = useState("");
  const [cuentaIngreso, setCuentaIngreso] = useState({ subcuenta: "", cuenta_ahorro_id: "", producto_credito_id: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !abono) return;
    setFecha(abono.fecha || hoyLocal());
    setTipo(abono.tipo || "otro");
    setNotas(abono.notas || "");
    setCuentaIngreso({ subcuenta: abono.subcuenta_ingreso || "", cuenta_ahorro_id: abono.cda_id || "", producto_credito_id: abono.producto_credito_id || "" });
    setError("");
  }, [open, abono]);

  if (!abono) return null;

  const handleSubmit = async () => {
    setError("");
    setSaving(true);
    try {
      await base44.functions.invoke("gestionarEmprendamos", {
        accion: "editarAbono",
        abono_id: abono.id, fecha, tipo, notas, cuenta_ingreso: cuentaIngreso
      });
      onSaved(); onOpenChange(false);
    } catch (e) {
      const errData = e?.data || e?.response?.data || {};
      setError(errData.error || e?.message || "Error al editar");
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Pencil className="w-5 h-5 text-primary" /> Editar abono — {formatCOP(abono.valor_total)}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Fecha</Label><Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></div>
            <div><Label>Tipo de abono</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cuota_minima">Cuota mínima</SelectItem>
                  <SelectItem value="capital">Abono a capital</SelectItem>
                  <SelectItem value="total">Pago total</SelectItem>
                  <SelectItem value="fijo">Cuota fija</SelectItem>
                  <SelectItem value="otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>Cuenta de ingreso (asiento)</Label><CuentaIngresoSelect value={cuentaIngreso.subcuenta} onValueChange={setCuentaIngreso} placeholder="CDA, efectivo, TDC..." /></div>
          <div><Label>Notas</Label><Textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} /></div>
          {error && <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive"><AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /><span>{error}</span></div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}