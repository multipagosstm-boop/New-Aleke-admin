import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertCircle, Loader2, PlusCircle } from "lucide-react";
import { NumberInput } from "@/components/ui/number-input";
import CuentaIngresoSelect from "@/components/admin/CuentaIngresoSelect";
import { formatCOP, hoyLocal } from "@/lib/contabilidad";

export default function CreditoForm({ open, onOpenChange, onSaved, inscrito }) {
  const [tipo, setTipo] = useState("habitual");
  const [concepto, setConcepto] = useState("");
  const [capital, setCapital] = useState(0);
  const [tasa, setTasa] = useState("");
  const [cuotaFija, setCuotaFija] = useState(0);
  const [fecha, setFecha] = useState(hoyLocal());
  const [cuentaOrigen, setCuentaOrigen] = useState({ subcuenta: "", cuenta_ahorro_id: "", producto_credito_id: "" });
  const [notas, setNotas] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setTipo("habitual"); setConcepto(""); setCapital(0); setTasa(""); setCuotaFija(0);
    setFecha(hoyLocal()); setCuentaOrigen({ subcuenta: "", cuenta_ahorro_id: "", producto_credito_id: "" });
    setNotas(""); setError("");
  }, [open]);

  if (!inscrito) return null;
  const cupoDisponible = tipo === "habitual"
    ? (inscrito.cupo_asignado || 0) - (inscrito.saldo_deuda || 0)
    : (inscrito.extracupo_autorizado || 0);

  const handleSubmit = async () => {
    setError("");
    if (!capital || capital <= 0) { setError("Capital inválido"); return; }
    if (!cuentaOrigen.subcuenta) { setError("Seleccione la cuenta de origen del dinero"); return; }
    setSaving(true);
    try {
      await base44.functions.invoke("gestionarEmprendamos", {
        accion: "agregarCredito",
        emprendamos_cliente_id: inscrito.id, tipo, concepto, capital: Number(capital),
        tasa_nominal: tasa ? Number(tasa) / 100 : null, cuota_fija: Number(cuotaFija) || 0,
        fecha, cuenta_origen: cuentaOrigen, notas
      });
      onSaved(); onOpenChange(false);
    } catch (e) {
      const errData = e?.data || e?.response?.data || {};
      setError(errData.error || e?.message || "Error al agregar crédito");
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><PlusCircle className="w-5 h-5 text-primary" /> Agregar crédito — {inscrito._clienteNombre || ""}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Tipo de crédito *</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="habitual">Habitual (dentro del cupo)</SelectItem>
                  <SelectItem value="extracupo">Extracupo (avance extra, 6%)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Fecha *</Label><Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></div>
          </div>
          <div><Label>Concepto</Label><Input value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Compra concreta / préstamo..." /></div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Capital *</Label><NumberInput value={capital} onChange={setCapital} className="text-right" /></div>
            <div><Label>Tasa mensual % {tipo === "extracupo" ? "(default 6)" : `(default ${Math.round(inscrito.tasa_acordada * 100)})`}</Label><Input type="number" step="0.1" value={tasa} onChange={(e) => setTasa(e.target.value)} placeholder="auto" /></div>
            <div><Label>Cuota fija (opcional)</Label><NumberInput value={cuotaFija} onChange={setCuotaFija} className="text-right" /></div>
          </div>
          <div><Label>Cuenta de origen del dinero *</Label><CuentaIngresoSelect value={cuentaOrigen.subcuenta} onValueChange={setCuentaOrigen} placeholder="CDA, efectivo, TDC..." /></div>
          <div className="text-xs text-muted-foreground bg-muted/30 rounded-md px-3 py-2">
            {tipo === "habitual"
              ? <>Cupo asignado: <b>{formatCOP(inscrito.cupo_asignado)}</b> · Deuda actual: <b>{formatCOP(inscrito.saldo_deuda)}</b> · Disponible aprox: <b className={cupoDisponible < 0 ? "text-destructive" : "text-success"}>{formatCOP(cupoDisponible)}</b></>
              : <>Extracupo autorizado: <b>{formatCOP(inscrito.extracupo_autorizado)}</b> (0 = sin límite definido)</>}
          </div>
          <div><Label>Notas</Label><Textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} /></div>
          {error && <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive"><AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /><span>{error}</span></div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Agregar crédito</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}