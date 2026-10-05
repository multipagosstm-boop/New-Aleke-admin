import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Plus, Trash2, AlertCircle, Loader2, Pencil, Lock } from "lucide-react";
import SearchableSelect from "@/components/ui/searchable-select";
import { NumberInput } from "@/components/ui/number-input";
import { formatCOP } from "@/lib/contabilidad";

const MOV_VACIO = { subcuenta: "", credito: "", descripcion: "Desembolso", cuenta_ahorro_id: "", producto_credito_id: "", tipo_movimiento_tdc: "" };
const SUBCUENTA_CARTERA = "120506";

export default function EditarDesembolsoDialog({ open, onOpenChange, onSaved, prestamo }) {
  const [movimientos, setMovimientos] = useState([{ ...MOV_VACIO }]);
  const [tieneAbonos, setTieneAbonos] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [puc, setPuc] = useState([]);
  const [cdas, setCdas] = useState([]);
  const [productos, setProductos] = useState([]);

  const pucMap = useMemo(() => {
    const m = {}; puc.forEach((c) => { m[String(c.codigo)] = c; }); return m;
  }, [puc]);
  const pucBalance = useMemo(() => puc.filter((c) => c.clase === 1 || c.clase === 2 || c.clase === 3), [puc]);

  useEffect(() => {
    if (!open || !prestamo) return;
    setMotivo(""); setError(""); setMovimientos([{ ...MOV_VACIO }]);
    setLoading(true);
    (async () => {
      try {
        const [pucList, cdaList, prodList, abonosCliente, movsComp] = await Promise.all([
          base44.entities.Cuenta.filter({ es_transaccional: true }, "-codigo", 2000),
          base44.entities.CuentaAhorro.filter({ estado: "activa" }),
          base44.entities.ProductoCredito.filter({ estado: "activo" }),
          base44.entities.AbonoPrestamo.filter({ cliente_id: prestamo.cliente_id }),
          prestamo.comprobante_id
            ? base44.entities.MovimientoContable.filter({ comprobante_id: prestamo.comprobante_id, estado: "activo" })
            : Promise.resolve([])
        ]);
        setPuc(pucList); setCdas(cdaList); setProductos(prodList);
        const delPrestamo = abonosCliente.filter((a) => (a.detalles || []).some((d) => d.prestamo_id === prestamo.id));
        setTieneAbonos(delPrestamo.length > 0);

        // Cargar los movimientos de desembolso actuales (créditos ≠ 120506) como base editable.
        const credits = movsComp
          .filter((m) => Number(m.credito) > 0 && String(m.subcuenta) !== SUBCUENTA_CARTERA)
          .map((m) => ({
            subcuenta: String(m.subcuenta),
            credito: Number(m.credito) || 0,
            descripcion: m.descripcion || "Desembolso",
            cuenta_ahorro_id: m.cuenta_ahorro_id || "",
            producto_credito_id: m.producto_credito_id || "",
            tipo_movimiento_tdc: m.tipo_movimiento_tdc || ""
          }));
        setMovimientos(credits.length > 0 ? credits : [{ ...MOV_VACIO }]);
      } catch {
        setError("No se pudieron cargar los datos del desembolso");
      } finally {
        setLoading(false);
      }
    })();
  }, [open, prestamo]);

  if (!prestamo) return null;

  const capital = movimientos.reduce((s, m) => s + (Number(m.credito) || 0), 0);
  const congelado = tieneAbonos;

  const updateMov = (idx, field, value) => {
    const updated = [...movimientos];
    updated[idx] = { ...updated[idx], [field]: value };
    if (field === "subcuenta" && value) {
      const cuenta = pucMap[value];
      updated[idx].cuenta_ahorro_id = "";
      updated[idx].producto_credito_id = "";
      if (cuenta) {
        const cda = cdas.find((c) => String(c.subcuenta_puc) === String(cuenta.codigo));
        if (cda) updated[idx].cuenta_ahorro_id = cda.id;
        const tdc = productos.find((p) => String(p.subcuenta_puc) === String(cuenta.codigo));
        if (tdc) updated[idx].producto_credito_id = tdc.id;
        updated[idx].tipo_movimiento_tdc = tdc ? "abono" : "";
      }
    }
    setMovimientos(updated);
  };
  const addMov = () => setMovimientos([...movimientos, { ...MOV_VACIO }]);
  const removeMov = (idx) => movimientos.length > 1 && setMovimientos(movimientos.filter((_, i) => i !== idx));

  const handleSubmit = async () => {
    setError("");
    const validos = movimientos.filter((m) => m.subcuenta && Number(m.credito) > 0);
    if (validos.length < 1) { setError("Debe tener al menos un movimiento de desembolso con cuenta y valor"); return; }
    if (!motivo.trim()) { setError("Indique el motivo de la corrección"); return; }
    setSaving(true);
    try {
      await base44.functions.invoke("gestionarPakredito", {
        accion: "editarDesembolso",
        prestamo_id: prestamo.id,
        motivo: motivo.trim(),
        movimientos: validos.map((m) => ({
          subcuenta: m.subcuenta, debito: 0, credito: Number(m.credito) || 0,
          descripcion: m.descripcion || "Desembolso",
          cuenta_ahorro_id: m.cuenta_ahorro_id || "",
          producto_credito_id: m.producto_credito_id || "",
          tipo_movimiento_tdc: m.tipo_movimiento_tdc || null
        }))
      });
      onSaved();
      onOpenChange(false);
    } catch (e) {
      const errData = e?.data || e?.response?.data || {};
      setError(errData.error || e?.message || "Error al editar desembolso");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Pencil className="w-5 h-5 text-primary" /> Editar desembolso {prestamo.codigo}</DialogTitle>
          <DialogDescription>
            Corrija el asiento de desembolso. Se modifica el comprobante (mismo número) y se sincroniza el préstamo: capital, saldos y cronograma.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : (
          <div className="space-y-4">
            {tieneAbonos && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive">
                <Lock className="w-4 h-4 mt-0.5 shrink-0" />
                <span>Este préstamo tiene abonos aplicados. No se puede editar el desembolso. Elimine primero los abonos.</span>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <Label>Capital actual</Label>
                <div className="h-9 flex items-center justify-end px-3 rounded-md border text-sm font-mono bg-muted/30">{formatCOP(prestamo.capital)}</div>
              </div>
              <div>
                <Label>Nuevo capital</Label>
                <div className="h-9 flex items-center justify-end px-3 rounded-md border text-sm font-mono border-success/40 bg-success/10 text-success">{formatCOP(capital)}</div>
              </div>
              <div className="col-span-2">
                <Label>Motivo de la corrección *</Label>
                <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej: capital registrado incorrecto" disabled={congelado} />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Movimientos del desembolso — el total equivale al nuevo capital (contrapartida automática 120506 en débito)</Label>
                <Button size="sm" variant="outline" onClick={addMov} type="button" disabled={congelado}><Plus className="w-4 h-4 mr-1" /> Línea</Button>
              </div>
              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 border-b border-border text-left text-muted-foreground uppercase">
                    <tr>
                      <th className="px-2 py-2 font-medium w-[40%]">Cuenta PUC</th>
                      <th className="px-2 py-2 font-medium text-right w-[20%]">Crédito</th>
                      <th className="px-2 py-2 font-medium w-[32%]">Concepto</th>
                      <th className="px-2 py-2 font-medium w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {movimientos.map((m, idx) => (
                      <tr key={idx} className="border-b border-border/50">
                        <td className="px-2 py-1">
                          <SearchableSelect value={m.subcuenta} onValueChange={(v) => updateMov(idx, "subcuenta", v)} placeholder="Cuenta..."
                            options={pucBalance.map((c) => ({ value: String(c.codigo), label: `${c.codigo} — ${c.concepto}`, searchKey: `${c.codigo} ${c.concepto}` }))}
                            triggerClassName="h-8 text-xs" disabled={congelado} />
                        </td>
                        <td className="px-2 py-1"><NumberInput value={m.credito} onChange={(v) => updateMov(idx, "credito", v)} className="h-8 text-xs text-right" disabled={congelado} /></td>
                        <td className="px-2 py-1"><Input value={m.descripcion} onChange={(e) => updateMov(idx, "descripcion", e.target.value)} className="h-8 text-xs" disabled={congelado} /></td>
                        <td className="px-2 py-1 text-center"><Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeMov(idx)} disabled={congelado || movimientos.length <= 1}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-muted/30 border-t-2 border-border">
                    <tr className="font-medium text-sm">
                      <td className="px-2 py-2">Total desembolso</td>
                      <td className="px-2 py-2 text-right font-mono">{formatCOP(capital)}</td>
                      <td colSpan={2} className="px-2 py-2 text-right font-mono text-success">→ 120506 Pakredito</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /><span>{error}</span>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving || congelado || loading}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Guardar corrección
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}