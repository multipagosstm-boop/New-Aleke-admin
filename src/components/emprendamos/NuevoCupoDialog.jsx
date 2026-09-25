import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertCircle, Loader2, CreditCard, Plus } from "lucide-react";
import SearchableSelect from "@/components/ui/searchable-select";
import TarjetaForm from "@/components/admin/TarjetaForm";
import { formatCOP, hoyLocal } from "@/lib/contabilidad";

export default function NuevoCupoDialog({ open, onOpenChange, onSaved, inscrito, clientes }) {
  const [tdcId, setTdcId] = useState("");
  const [porcentaje, setPorcentaje] = useState(10);
  const [cobrar, setCobrar] = useState(true);
  const [fecha, setFecha] = useState(hoyLocal());
  const [notas, setNotas] = useState("");
  const [productosDB, setProductosDB] = useState([]);
  const [cuentasDB, setCuentasDB] = useState([]);
  const [tarjetaOpen, setTarjetaOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const listas = useCallback(async () => {
    const [pr, cu] = await Promise.all([
      base44.entities.ProductoCredito.list("-created_date", 500),
      base44.entities.Cuenta.list()
    ]);
    setProductosDB(pr); setCuentasDB(cu);
  }, []);

  useEffect(() => {
    if (!open) return;
    setTdcId(""); setPorcentaje(10); setCobrar(true); setFecha(hoyLocal()); setNotas(""); setError("");
    listas();
  }, [open, listas]);

  if (!inscrito) return null;

  const tdcOptions = productosDB
    .filter((p) => p.titular_id === inscrito.cliente_id && p.tipo === "TDC")
    .map((p) => ({ value: p.id, label: `${p.nombre} · ${p.banco}`, searchKey: `${p.nombre} ${p.banco}` }));

  const tdcSel = productosDB.find((p) => p.id === tdcId);
  const cupoTdc = Number(tdcSel?.cupo) || 0;
  const comision = Math.round(cupoTdc * ((Number(porcentaje) || 0) / 100));

  const handleSubmit = async () => {
    setError("");
    if (!tdcId) { setError("Seleccione la TDC adquirida"); return; }
    setSaving(true);
    try {
      await base44.functions.invoke("gestionarEmprendamos", {
        accion: "registrarNuevoCupo",
        emprendamos_cliente_id: inscrito.id, producto_credito_id: tdcId,
        fecha, porcentaje: Number(porcentaje) / 100, cobrar_comision: cobrar, notas
      });
      onSaved(); onOpenChange(false);
    } catch (e) {
      const errData = e?.data || e?.response?.data || {};
      setError(errData.error || e?.message || "Error al registrar nuevo cupo");
    }
    setSaving(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CreditCard className="w-5 h-5 text-primary" /> Nuevo cupo TDC — {inscrito._clienteNombre || ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label>TDC adquirida *</Label>
                <Button size="sm" variant="outline" className="h-7" onClick={() => setTarjetaOpen(true)}><Plus className="w-3.5 h-3.5 mr-1" /> Crear nueva TDC</Button>
              </div>
              <SearchableSelect value={tdcId} onValueChange={setTdcId} placeholder="Seleccionar TDC del cliente..." searchPlaceholder="Buscar TDC..." options={tdcOptions} />
              {tdcOptions.length === 0 && <div className="text-xs text-muted-foreground mt-1">El cliente no tiene TDC registradas. Cree una con el botón superior.</div>}
            </div>

            {tdcSel && (
              <div className="grid grid-cols-3 gap-3 text-sm bg-muted/30 rounded-md px-3 py-2">
                <div><div className="text-[10px] uppercase text-muted-foreground">Banco</div><div className="font-medium">{tdcSel.banco}</div></div>
                <div><div className="text-[10px] uppercase text-muted-foreground">Cupo</div><div className="font-mono font-semibold text-primary">{formatCOP(cupoTdc)}</div></div>
                <div><div className="text-[10px] uppercase text-muted-foreground">Cupo actual</div><div className="font-mono">{formatCOP(inscrito.cupo_asignado || 0)}</div></div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div><Label>Comisión %</Label><Input type="number" step="0.1" value={porcentaje} onChange={(e) => setPorcentaje(e.target.value)} disabled={!cobrar} /></div>
              <div><Label>Fecha *</Label><Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></div>
              <div className="flex items-end">
                <div className="flex items-center gap-2 space-y-0">
                  <Checkbox id="cobrar" checked={cobrar} onCheckedChange={(v) => setCobrar(v === true)} />
                  <Label htmlFor="cobrar" className="text-sm cursor-pointer">Cobrar comisión</Label>
                </div>
              </div>
            </div>

            {cobrar && (
              <div className="text-sm bg-primary/10 text-primary rounded-md px-3 py-2">
                Comisión a cobrar (10% sobre el cupo): <b>{formatCOP(comision)}</b> — se carga a la cartera del cliente y se actualiza el cupo asignado.
              </div>
            )}
            {!cobrar && (
              <div className="text-xs text-muted-foreground bg-muted/30 rounded-md px-3 py-2">Solo se vinculará la TDC y se actualizará el cupo asignado, sin cobrar comisión.</div>
            )}

            <div><Label>Notas</Label><Input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Observaciones..." /></div>
            {error && <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive"><AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /><span>{error}</span></div>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Registrar nuevo cupo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TarjetaForm open={tarjetaOpen} onOpenChange={setTarjetaOpen} onSaved={listas}
        clientes={clientes} pucTransaccional={cuentasDB.filter((c) => c.es_transaccional)} productosExistentes={productosDB}
        initialTipo="TDC" initialTitularId={inscrito.cliente_id} />
    </>
  );
}