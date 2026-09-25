import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertCircle, Loader2, Pencil, Trash2, Plus } from "lucide-react";
import { NumberInput } from "@/components/ui/number-input";
import CuentaIngresoSelect from "@/components/admin/CuentaIngresoSelect";
import { formatCOP } from "@/lib/contabilidad";

const SUBCUENTA_CARTERA = "120502";

export default function EditarCreditoDialog({ open, onOpenChange, onSaved, credito }) {
  const [concepto, setConcepto] = useState("");
  const [tasa, setTasa] = useState("");
  const [cuotaFija, setCuotaFija] = useState(0);
  const [fecha, setFecha] = useState("");
  const [notas, setNotas] = useState("");
  // No cartera_inicial: una sola cuenta de origen.
  const [cuentaOrigen, setCuentaOrigen] = useState({ subcuenta: "", cuenta_ahorro_id: "", producto_credito_id: "" });
  // Cartera_inicial: editor de movimientos (cuenta + valor por producto).
  const [movs, setMovs] = useState([]);
  const [loadingMovs, setLoadingMovs] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !credito) return;
    setConcepto(credito.concepto || "");
    setTasa(credito.tasa_nominal != null ? String(Math.round(credito.tasa_nominal * 10000) / 100) : "");
    setCuotaFija(credito.cuota_fija || 0);
    setFecha(credito.fecha || "");
    setNotas(credito.notas || "");
    setCuentaOrigen({ subcuenta: "", cuenta_ahorro_id: "", producto_credito_id: "" });
    setMovs([]);
    setError("");

    if (credito.comprobante_id) {
      setLoadingMovs(true);
      base44.entities.MovimientoContable.filter({ comprobante_id: credito.comprobante_id, estado: "activo" })
        .then((list) => {
          const productos = list
            .filter((m) => String(m.subcuenta) !== SUBCUENTA_CARTERA)
            .map((m) => ({
              movimiento_id: m.id,
              subcuenta: String(m.subcuenta),
              cuenta_ahorro_id: m.cuenta_ahorro_id || "",
              producto_credito_id: m.producto_credito_id || "",
              valor: Number(m.credito) || 0,
              descripcion: m.descripcion || ""
            }));
          if (credito.tipo === "cartera_inicial") {
            setMovs(productos);
          } else {
            const ing = productos[0] || list.find((m) => String(m.subcuenta) !== SUBCUENTA_CARTERA);
            if (ing) setCuentaOrigen({ subcuenta: String(ing.subcuenta), cuenta_ahorro_id: ing.cuenta_ahorro_id || "", producto_credito_id: ing.producto_credito_id || "" });
          }
        })
        .catch(() => {})
        .finally(() => setLoadingMovs(false));
    }
  }, [open, credito]);

  if (!credito) return null;
  const esCarteraInicial = credito.tipo === "cartera_inicial";
  const totalMovs = movs.reduce((s, m) => s + (Number(m.valor) || 0), 0);

  const updateMov = (idx, patch) => setMovs((p) => p.map((m, i) => (i === idx ? { ...m, ...patch } : m)));
  const addMov = () => setMovs((p) => [...p, { movimiento_id: "", subcuenta: "", cuenta_ahorro_id: "", producto_credito_id: "", valor: 0, descripcion: "" }]);
  const removeMov = (idx) => setMovs((p) => p.filter((_, i) => i !== idx));

  const handleSubmit = async () => {
    setError("");
    if (esCarteraInicial) {
      if (!movs.length) { setError("Agregue al menos una cuenta del préstamo."); return; }
      if (movs.some((m) => !m.subcuenta)) { setError("Cada cuenta del préstamo debe tener una subcuenta."); return; }
      if (movs.some((m) => !Number(m.valor) || Number(m.valor) <= 0)) { setError("Cada cuenta del préstamo debe tener un valor mayor a 0."); return; }
    }
    setSaving(true);
    try {
      await base44.functions.invoke("gestionarEmprendamos", {
        accion: "editarCredito",
        credito_id: credito.id,
        concepto,
        tasa_nominal: tasa ? Number(tasa) / 100 : null,
        cuota_fija: Number(cuotaFija) || 0,
        fecha, notas,
        cuenta_origen: esCarteraInicial ? null : cuentaOrigen,
        movimientos: esCarteraInicial ? movs.map((m) => ({
          movimiento_id: m.movimiento_id, subcuenta: m.subcuenta,
          cuenta_ahorro_id: m.cuenta_ahorro_id, producto_credito_id: m.producto_credito_id,
          valor: Number(m.valor) || 0, descripcion: m.descripcion
        })) : null
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
          <DialogTitle className="flex items-center gap-2"><Pencil className="w-5 h-5 text-primary" /> Editar crédito — {credito.codigo}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Fecha</Label><Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></div>
            <div><Label>Tasa mensual %</Label><Input type="number" step="0.1" value={tasa} onChange={(e) => setTasa(e.target.value)} /></div>
            <div><Label>Cuota fija</Label><NumberInput value={cuotaFija} onChange={setCuotaFija} className="text-right" /></div>
          </div>
          <div><Label>Concepto</Label><Input value={concepto} onChange={(e) => setConcepto(e.target.value)} /></div>

          {esCarteraInicial ? (
            <div className="space-y-2">
              <Label>Asiento del préstamo inicial — cuenta y valor por cada producto</Label>
              <div className="text-xs text-muted-foreground">Débito 120502 (Cartera Emprendamos) = {formatCOP(totalMovs)}. Se balancea automáticamente con la suma de los productos.</div>
              {loadingMovs && <div className="text-xs text-muted-foreground">Cargando movimientos…</div>}
              <div className="space-y-2">
                {movs.map((m, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_140px_32px] gap-2 items-end">
                    <div>
                      {idx === 0 && <Label className="text-[11px]">Cuenta (crédito)</Label>}
                      <CuentaIngresoSelect
                        value={m.subcuenta}
                        onValueChange={(sel) => updateMov(idx, { subcuenta: sel.subcuenta, cuenta_ahorro_id: sel.cuenta_ahorro_id, producto_credito_id: sel.producto_credito_id })}
                        placeholder="Cuenta del producto..."
                        triggerClassName="h-9"
                      />
                    </div>
                    <div>
                      {idx === 0 && <Label className="text-[11px]">Valor</Label>}
                      <NumberInput value={m.valor} onChange={(v) => updateMov(idx, { valor: v })} className="text-right" />
                    </div>
                    <div className="flex justify-end">
                      <Button size="icon" variant="ghost" className="h-9 w-9 text-destructive" onClick={() => removeMov(idx)} title="Quitar cuenta" disabled={movs.length <= 1}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={addMov}><Plus className="w-4 h-4 mr-1" /> Agregar cuenta</Button>
              <div className="flex items-center justify-between text-sm font-medium pt-1 border-t">
                <span>Total préstamo inicial</span><span className="font-mono">{formatCOP(totalMovs)}</span>
              </div>
            </div>
          ) : (
            <div><Label>Cuenta de origen del dinero (asiento)</Label><CuentaIngresoSelect value={cuentaOrigen.subcuenta} onValueChange={setCuentaOrigen} placeholder="CDA, efectivo, TDC..." /></div>
          )}

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