import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Merge } from "lucide-react";
import { formatCOP, BANCO_NAMES } from "@/lib/contabilidad";

export default function UnificacionTarjetaDialog({ open, onOpenChange, tarjetas, clientes, onDone }) {
  const [seleccionadas, setSeleccionadas] = useState([]);
  const [permanenteId, setPermanenteId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const tdcActivas = useMemo(
    () => tarjetas.filter((t) => t.tipo === "TDC" && t.estado === "activo"),
    [tarjetas]
  );

  const clienteMap = useMemo(() => {
    const m = {};
    clientes.forEach((c) => { m[c.id] = c; });
    return m;
  }, [clientes]);

  const toggleSeleccion = (id) => {
    setSeleccionadas((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      if (next.length > 0 && !next.includes(permanenteId)) setPermanenteId(next[0]);
      return next;
    });
  };

  const seleccionadasData = tdcActivas.filter((t) => seleccionadas.includes(t.id));
  const mismoBanco = seleccionadasData.length > 0 && seleccionadasData.every((t) => t.banco === seleccionadasData[0].banco);
  const mismoTitular = seleccionadasData.length > 0 && seleccionadasData.every((t) => t.titular_id === seleccionadasData[0].titular_id);
  const cupoTotal = seleccionadasData.reduce((s, t) => s + (t.cupo || 0), 0);
  const saldoTotal = seleccionadasData.reduce((s, t) => s + (t.saldo || 0), 0);
  const puedeConfirmar = seleccionadasData.length >= 2 && mismoBanco && mismoTitular && permanenteId;

  const handleSubmit = async () => {
    if (!puedeConfirmar) return;
    setSaving(true);
    setError("");
    try {
      await base44.functions.invoke("gestionarTarjeta", {
        operacion: "unificacion",
        tarjeta_ids: seleccionadas,
        permanente_id: permanenteId
      });
      onDone();
      onOpenChange(false);
      setSeleccionadas([]);
      setPermanenteId("");
    } catch (e) {
      const msg = e?.response?.data?.error || e.message;
      setError(msg);
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Merge className="w-4 h-4" /> Unificación de Tarjetas
          </DialogTitle>
          <DialogDescription>
            Seleccione 2 o más tarjetas del mismo banco y titular. Los cupos se sumarán y los saldos se trasladarán.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 max-h-[50vh] overflow-y-auto">
          {tdcActivas.length < 2 ? (
            <div className="text-sm text-muted-foreground text-center py-4">
              Se necesitan al menos 2 tarjetas de crédito activas para unificar.
            </div>
          ) : (
            tdcActivas.map((t) => {
              const titular = clienteMap[t.titular_id];
              const isSelected = seleccionadas.includes(t.id);
              const isPermanente = permanenteId === t.id;
              return (
                <div key={t.id} className={`rounded-md border p-3 ${isSelected ? "border-primary bg-primary/5" : "border-border"}`}>
                  <div className="flex items-start gap-3">
                    <Checkbox checked={isSelected} onCheckedChange={() => toggleSeleccion(t.id)} />
                    <div className="flex-1">
                      <div className="font-medium text-sm">{t.nombre} <span className="font-mono text-xs text-muted-foreground">({t.nomenclatura})</span></div>
                      <div className="text-xs text-muted-foreground">
                        {BANCO_NAMES[t.banco] || t.banco} · {titular?.nombre || "—"}
                      </div>
                      <div className="text-xs mt-1">
                        Cupo: <span className="font-mono">{formatCOP(t.cupo)}</span> · Saldo: <span className="font-mono">{formatCOP(t.saldo)}</span>
                      </div>
                    </div>
                    {isSelected && (
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input type="radio" checked={isPermanente} onChange={() => setPermanenteId(t.id)} />
                        Permanente
                      </label>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
        {seleccionadasData.length >= 2 && (
          <div className="bg-muted/50 rounded-md p-3 text-sm space-y-1">
            <div className="flex items-center gap-2">
              <span>Validación:</span>
              {mismoBanco
                ? <span className="text-success text-xs">✓ Mismo banco</span>
                : <span className="text-destructive text-xs">✗ Bancos diferentes</span>}
              {mismoTitular
                ? <span className="text-success text-xs">✓ Mismo titular</span>
                : <span className="text-destructive text-xs">✗ Titulares diferentes</span>}
            </div>
            <div>Cupo total unificado: <span className="font-mono font-medium">{formatCOP(cupoTotal)}</span></div>
            <div>Saldo total: <span className="font-mono">{formatCOP(saldoTotal)}</span></div>
          </div>
        )}
        {error && <div className="text-sm text-destructive">{error}</div>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!puedeConfirmar || saving}>
            {saving ? "Procesando..." : "Confirmar Unificación"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}