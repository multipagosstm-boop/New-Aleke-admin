import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertCircle, Loader2, Wallet } from "lucide-react";
import { NumberInput } from "@/components/ui/number-input";
import CuentaIngresoSelect from "@/components/admin/CuentaIngresoSelect";
import { formatCOP, hoyLocal } from "@/lib/contabilidad";

export default function AbonoForm({ open, onOpenChange, onSaved, inscrito, creditos }) {
  const [fecha, setFecha] = useState(hoyLocal());
  const [valorTotal, setValorTotal] = useState(0);
  const [cuentaIngreso, setCuentaIngreso] = useState({ subcuenta: "", cuenta_ahorro_id: "", producto_credito_id: "" });
  const [tipo, setTipo] = useState("cuota_minima");
  const [aplicaciones, setAplicaciones] = useState({});
  const [notas, setNotas] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setFecha(hoyLocal()); setValorTotal(0);
    setCuentaIngreso({ subcuenta: "", cuenta_ahorro_id: "", producto_credito_id: "" });
    setTipo("cuota_minima"); setAplicaciones({}); setNotas(""); setError("");
  }, [open]);

  const creditosCliente = useMemo(
    () => (creditos || []).filter((c) => c.emprendamos_cliente_id === inscrito?.id && c.estado === "vigente"),
    [creditos, inscrito]
  );

  // Cuota mínima = intereses pendientes (saldo_intereses) de cada crédito.
  const aplicarCuotaMinima = () => {
    const next = {};
    let total = 0;
    for (const c of creditosCliente) {
      const v = c.saldo_intereses || 0;
      if (v > 0) { next[c.id] = v; total += v; }
    }
    setAplicaciones(next);
    setValorTotal(total);
  };

  const toggleCredito = (c) => {
    setAplicaciones((prev) => {
      const next = { ...prev };
      if (next[c.id]) delete next[c.id];
      else next[c.id] = c.saldo_intereses || 0;
      return next;
    });
  };

  const setAplicacion = (id, val) => setAplicaciones((prev) => ({ ...prev, [id]: val }));

  const sumaAplicada = Object.values(aplicaciones).reduce((s, v) => s + (Number(v) || 0), 0);
  const diferencia = valorTotal - sumaAplicada;

  const handleSubmit = async () => {
    setError("");
    if (!valorTotal || valorTotal <= 0) { setError("Valor inválido"); return; }
    if (!cuentaIngreso.subcuenta) { setError("Seleccione la cuenta de ingreso"); return; }
    const seleccionados = creditosCliente.filter((c) => aplicaciones[c.id] && Number(aplicaciones[c.id]) > 0);
    if (seleccionados.length === 0) { setError("Seleccione al menos un crédito con valor"); return; }
    if (Math.abs(diferencia) > 0.01) { setError(`Debe aplicar todo el abono. Faltan ${formatCOP(diferencia)}`); return; }
    setSaving(true);
    try {
      await base44.functions.invoke("gestionarEmprendamos", {
        accion: "registrarAbono",
        emprendamos_cliente_id: inscrito.id, fecha, valor_total: Number(valorTotal),
        cuenta_ingreso: cuentaIngreso, tipo,
        detalles: seleccionados.map((c) => ({ credito_id: c.id, valor_aplicado: Number(aplicaciones[c.id]) || 0 })),
        notas
      });
      onSaved(); onOpenChange(false);
    } catch (e) {
      const errData = e?.data || e?.response?.data || {};
      setError(errData.error || e?.message || "Error al registrar abono");
    }
    setSaving(false);
  };

  if (!inscrito) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Wallet className="w-5 h-5 text-primary" /> Registrar abono — {inscrito._clienteNombre || ""}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Fecha *</Label><input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm" /></div>
            <div><Label>Cuenta de ingreso *</Label><CuentaIngresoSelect value={cuentaIngreso.subcuenta} onValueChange={setCuentaIngreso} placeholder="CDA, efectivo, TDC..." /></div>
            <div><Label>Valor recibido *</Label><NumberInput value={valorTotal} onChange={setValorTotal} className="text-right" /></div>
            <div><Label>Tipo de abono</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cuota_minima">Cuota mínima (intereses mes anterior)</SelectItem>
                  <SelectItem value="capital">Abono a capital</SelectItem>
                  <SelectItem value="total">Pago total del crédito</SelectItem>
                  <SelectItem value="fijo">Cuota fija</SelectItem>
                  <SelectItem value="otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Label>Créditos del cliente</Label>
            <Button size="sm" variant="outline" onClick={aplicarCuotaMinima}>Aplicar cuota mínima</Button>
          </div>
          {creditosCliente.length === 0 ? (
            <p className="text-xs text-muted-foreground">Este cliente no tiene créditos vigentes.</p>
          ) : (
            <div className="border border-border rounded-lg divide-y divide-border/50">
              {creditosCliente.map((c) => {
                const sel = aplicaciones[c.id] !== undefined;
                return (
                  <div key={c.id} className="p-2 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <input type="checkbox" checked={sel} onChange={() => toggleCredito(c)} className="h-4 w-4" />
                      <span className="text-sm font-medium font-mono">{c.codigo}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{c.tipo}</span>
                      <span className="text-xs text-muted-foreground ml-auto">Capital: {formatCOP(c.saldo_capital)} · Intereses: {formatCOP(c.saldo_intereses)}</span>
                    </div>
                    {sel && (
                      <div className="pl-6">
                        <Label className="text-[10px] uppercase">Abono a este crédito</Label>
                        <NumberInput value={aplicaciones[c.id]} onChange={(v) => setAplicacion(c.id, v)} className="h-8 text-xs text-right" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className={`flex justify-between items-center rounded-md px-3 py-2 text-sm ${Math.abs(diferencia) < 0.01 ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
            <span>Total aplicado: <strong className="font-mono">{formatCOP(sumaAplicada)}</strong></span>
            <span>Diferencia: <strong className="font-mono">{formatCOP(diferencia)}</strong></span>
          </div>
          {error && <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive"><AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /><span>{error}</span></div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Registrar abono</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}