import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NumberInput } from "@/components/ui/number-input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import CuentaIngresoSelect from "@/components/admin/CuentaIngresoSelect";
import { formatCOP, hoyLocal } from "@/lib/contabilidad";

export default function AbonoDepositoDialog({ open, onOpenChange, contrato, inmuebles, onSaved }) {
  const [form, setForm] = useState({ valor: 0, fecha: hoyLocal(), cuentaIngreso: { subcuenta: "", cuenta_ahorro_id: "", producto_credito_id: "" }, notas: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm({ valor: 0, fecha: hoyLocal(), cuentaIngreso: { subcuenta: "", cuenta_ahorro_id: "", producto_credito_id: "" }, notas: "" });
  }, [open, contrato]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const inmueble = inmuebles.find((i) => i.id === contrato?.inmueble_id);

  const handleSubmit = async () => {
    if (!form.cuentaIngreso.subcuenta || form.valor <= 0) return;
    setSaving(true);
    try {
      const resp = await base44.functions.invoke("gestionarRooftop", {
        action: "abonarDeposito",
        contrato_id: contrato.id,
        valor: form.valor,
        cuenta_ingreso: form.cuentaIngreso,
        fecha: form.fecha,
        notas: form.notas
      });
      if (resp.data?.error) throw new Error(resp.data.error);
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      alert("Error: " + (e?.message || "No se pudo registrar el abono"));
    }
    setSaving(false);
  };

  if (!contrato) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Abono a Depósito — {contrato.codigo}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md border p-3 space-y-1 text-sm bg-muted/20">
            <div className="flex justify-between"><span className="text-muted-foreground">Inmueble:</span><span className="font-medium">{inmueble?.nombre || "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Depósito:</span><span className="font-bold text-primary">{formatCOP(contrato.valor_deposito)}</span></div>
          </div>
          <div>
            <Label>Valor del abono *</Label>
            <NumberInput value={form.valor} onChange={(v) => set("valor", v)} placeholder="0" />
          </div>
          <div>
            <Label>Fecha *</Label>
            <Input type="date" value={form.fecha} onChange={(e) => set("fecha", e.target.value)} />
          </div>
          <div>
            <Label>Cuenta de ingreso *</Label>
            <CuentaIngresoSelect value={form.cuentaIngreso.subcuenta} onValueChange={(v) => set("cuentaIngreso", v)} placeholder="CDA, efectivo, TDC, cruce..." />
          </div>
          <div>
            <Label>Notas</Label>
            <Textarea value={form.notas} onChange={(e) => set("notas", e.target.value)} rows={2} />
          </div>
          <p className="text-[11px] text-muted-foreground">
            El abono se contabiliza en la cuenta 220513 (Depósitos en garantía) y descuenta de la cuenta de ingreso seleccionada.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving || !form.cuentaIngreso.subcuenta || form.valor <= 0}>
            {saving ? "Registrando..." : "Registrar Abono"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}