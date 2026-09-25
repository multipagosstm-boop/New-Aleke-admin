import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import CuentaIngresoSelect from "@/components/admin/CuentaIngresoSelect";
import { formatCOP, hoyLocal } from "@/lib/contabilidad";

const hoy = hoyLocal();

export default function PagoForm({ open, onOpenChange, pago, inmuebles, clientes, onSaved }) {
  const [form, setForm] = useState({ valor_pagado: 0, fecha_pago: hoy, cuentaIngreso: { subcuenta: "", cuenta_ahorro_id: "", producto_credito_id: "" }, notas: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (pago) {
      setForm({
        valor_pagado: pago.valor_esperado || 0,
        fecha_pago: hoy,
        cuentaIngreso: { subcuenta: "", cuenta_ahorro_id: "", producto_credito_id: "" },
        notas: pago.notas || ""
      });
    }
  }, [pago]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const inmueble = inmuebles.find((i) => i.id === pago?.inmueble_id);
  const inquilino = clientes.find((c) => c.id === pago?.inquilino_id);

  const handleSubmit = async () => {
    if (!pago || !form.cuentaIngreso.subcuenta || form.valor_pagado <= 0) return;
    setSaving(true);
    try {
      const resp = await base44.functions.invoke("gestionarRooftop", {
        action: "registrarPago",
        pago_arriendo_id: pago.id,
        valor_pagado: form.valor_pagado,
        fecha_pago: form.fecha_pago,
        cuenta_ingreso: form.cuentaIngreso,
        notas: form.notas
      });
      if (resp.data?.error) throw new Error(resp.data.error);
      onSaved();
      onOpenChange(false);
    } catch (e) {
      const msg = e?.response?.data?.error || e?.data?.error || e?.error || e?.message || "Error desconocido";
      alert("Error: " + msg);
    }
    setSaving(false);
  };

  if (!pago) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar Pago de Arriendo</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md border p-3 space-y-1 text-sm bg-muted/20">
            <div className="flex justify-between"><span className="text-muted-foreground">Inmueble:</span><span className="font-medium">{inmueble?.nombre || "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Inquilino:</span><span>{inquilino?.nombre || "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Período:</span><span className="font-mono">{pago.periodo}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Vencimiento:</span><span className="font-mono">{pago.fecha_vencimiento}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Valor esperado:</span><span className="font-bold text-primary">{formatCOP(pago.valor_esperado)}</span></div>
          </div>
          <div>
            <Label>Valor pagado *</Label>
            <NumberInput value={form.valor_pagado} onChange={(v) => set("valor_pagado", v)} placeholder="0" />
          </div>
          <div>
            <Label>Fecha de pago *</Label>
            <Input type="date" value={form.fecha_pago} onChange={(e) => set("fecha_pago", e.target.value)} />
          </div>
          <div>
            <Label>Cuenta de ingreso *</Label>
            <CuentaIngresoSelect value={form.cuentaIngreso.subcuenta} onValueChange={(v) => set("cuentaIngreso", v)} placeholder="CDA, efectivo, TDC, cruce..." />
          </div>
          <div>
            <Label>Notas</Label>
            <Textarea value={form.notas} onChange={(e) => set("notas", e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving || !form.cuentaIngreso.subcuenta || form.valor_pagado <= 0}>
            {saving ? "Registrando..." : "Registrar Pago"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}