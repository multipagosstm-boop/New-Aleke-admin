import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import CuentaIngresoSelect from "@/components/admin/CuentaIngresoSelect";
import { formatCOP } from "@/lib/contabilidad";
import { Loader2, Pencil } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export default function EditarAbonoDialog({
  open,
  onOpenChange,
  onSaved,
  abono,
  prestamos = [],
  clientes = []
}) {
  const [fecha, setFecha] = useState("");
  const [cuentaIngreso, setCuentaIngreso] = useState({ subcuenta: "", cuenta_ahorro_id: "", producto_credito_id: "" });
  const [detalles, setDetalles] = useState([]);
  const [notas, setNotas] = useState("");
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    if (!open || !abono) {
      setFecha("");
      setCuentaIngreso({ subcuenta: "", cuenta_ahorro_id: "", producto_credito_id: "" });
      setDetalles([]);
      setNotas("");
      setMotivo("");
      setError("");
      return;
    }

    setFecha(abono.fecha || "");
    setCuentaIngreso({
      subcuenta: abono.subcuenta_ingreso || "",
      cuenta_ahorro_id: abono.cda_id || "",
      producto_credito_id: ""
    });
    setNotas(abono.notas || "");
    setMotivo("");
    setError("");

    const det = Array.isArray(abono.detalles)
      ? abono.detalles
      : (typeof abono.detalles === "string" ? JSON.parse(abono.detalles || "[]") : []);

    setDetalles(det.map((d) => {
      const cobroMas = Boolean(d.cobro_intereses_de_mas || Number(d.otros_cobros) > 0);
      const otros = Number(d.otros_cobros) || 0;
      const val = Number(d.valor_aplicado) || 0;
      const intVal = Number(d.intereses) || 0;
      const cap = d.capital !== undefined ? Number(d.capital) : Math.max(0, val - intVal - (cobroMas ? otros : 0));
      return {
        prestamo_id: d.prestamo_id,
        valor_aplicado: val,
        intereses: intVal,
        cobro_intereses_de_mas: cobroMas,
        otros_cobros: otros,
        capital: cap,
        cuota_id: d.cuota_id || null,
        cuota_numero: d.cuota_numero || null
      };
    }));
  }, [open, abono]);

  if (!abono) return null;

  const cliente = clientes.find((c) => c.id === abono.cliente_id) || {};
  const valorTotalCalculado = detalles.reduce((s, d) => s + (Number(d.valor_aplicado) || 0), 0);

  const handleDetalleChange = (index, field, val) => {
    setDetalles((prev) => {
      const copy = [...prev];
      const item = { ...copy[index] };
      if (typeof val === "boolean") {
        item[field] = val;
      } else {
        item[field] = Number(val) || 0;
      }
      const otros = item.cobro_intereses_de_mas ? (Number(item.otros_cobros) || 0) : 0;
      item.capital = Math.max(0, (Number(item.valor_aplicado) || 0) - (Number(item.intereses) || 0) - otros);
      copy[index] = item;
      return copy;
    });
  };

  const handleGuardar = async () => {
    setError("");
    if (!fecha) { setError("La fecha es obligatoria"); return; }
    if (!cuentaIngreso.subcuenta) { setError("Seleccione la cuenta de ingreso"); return; }
    if (valorTotalCalculado <= 0) { setError("El total del abono debe ser mayor a 0"); return; }

    for (let i = 0; i < detalles.length; i++) {
      const d = detalles[i];
      const p = prestamos.find((pr) => String(pr.id) === String(d.prestamo_id) || (pr.codigo && String(pr.codigo).toLowerCase() === String(d.prestamo_id).toLowerCase()));
      if (d.valor_aplicado <= 0) {
        setError(`El valor aplicado al crédito ${p?.codigo || (i + 1)} debe ser mayor a 0`);
        return;
      }
      if (d.intereses > d.valor_aplicado) {
        setError(`Los intereses del crédito ${p?.codigo || (i + 1)} no pueden superar el valor aplicado`);
        return;
      }
    }

    setSaving(true);
    try {
      const res = await base44.functions.invoke("gestionarPakredito", {
        accion: "editarAbono",
        abono_id: abono.id,
        fecha,
        valor_total: valorTotalCalculado,
        cuenta_ingreso: cuentaIngreso,
        detalles,
        notas: notas.trim() || null,
        motivo: motivo.trim() || "Modificación de abono Pakredito"
      });

      const r = res.data || res;
      if (r.error) throw new Error(r.error);

      toast({
        title: "Abono modificado",
        description: "Se actualizaron los saldos, cuotas y el comprobante contable con éxito."
      });

      onOpenChange(false);
      onSaved?.();
    } catch (err) {
      console.error("Error al modificar abono:", err);
      setError(err.message || "Error al modificar el abono");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto z-[75]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="w-5 h-5 text-primary" />
            Modificar Abono — {cliente.nombre || "Cliente"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2 text-sm">
          {error && (
            <div className="p-3 bg-destructive/10 text-destructive text-xs rounded-md border border-destructive/20 font-medium">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Fecha del Abono *</Label>
              <Input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="h-9 font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Cuenta Receptora / Ingreso *</Label>
              <CuentaIngresoSelect
                value={cuentaIngreso.subcuenta}
                onValueChange={setCuentaIngreso}
                triggerClassName="h-9"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">
                Distribución por Crédito
              </Label>
              <span className="text-xs font-mono font-bold text-primary">
                Total: {formatCOP(valorTotalCalculado)}
              </span>
            </div>

            <div className="space-y-3">
              {detalles.map((d, idx) => {
                const p = prestamos.find((pr) => String(pr.id) === String(d.prestamo_id) || (pr.codigo && String(pr.codigo).toLowerCase() === String(d.prestamo_id).toLowerCase())) || {};
                return (
                  <div key={idx} className="p-3 border rounded-md bg-muted/20 space-y-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono font-bold text-primary">
                        Crédito {p.codigo || d.prestamo_id}
                      </span>
                      <span className="text-muted-foreground">
                        {p.modelo === "cuota_fija" ? "Cuota fija" : "Mes vencido"} · Capital original: {formatCOP(p.capital)}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <span className="text-[11px] text-muted-foreground block">Valor Aplicado ($)</span>
                        <NumberInput
                          value={d.valor_aplicado}
                          onChange={(val) => handleDetalleChange(idx, "valor_aplicado", val)}
                          className="h-8 font-mono text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <span className="text-[11px] text-muted-foreground block">Intereses ($)</span>
                        <NumberInput
                          value={d.intereses}
                          onChange={(val) => handleDetalleChange(idx, "intereses", val)}
                          className="h-8 font-mono text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <span className="text-[11px] text-muted-foreground block">Abono a Capital</span>
                        <div className="h-8 px-2 flex items-center bg-background border rounded text-xs font-mono font-semibold">
                          {formatCOP(d.capital)}
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-border/40 text-xs space-y-1.5">
                      <label className="flex items-start gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={Boolean(d.cobro_intereses_de_mas)}
                          onChange={(e) => handleDetalleChange(idx, "cobro_intereses_de_mas", e.target.checked)}
                          className="mt-0.5 h-4 w-4 rounded border-input text-primary"
                        />
                        <div className="flex-1 space-y-1">
                          <span className="font-medium text-foreground block">
                            ¿Se cobraron intereses de más? Destinar a &quot;Otros cobros&quot; / &quot;Cobro extra&quot;
                          </span>
                          {d.cobro_intereses_de_mas && (
                            <div className="flex items-center gap-2 flex-wrap mt-1">
                              <span className="text-[11px] text-muted-foreground">Valor en Otros cobros:</span>
                              <div className="w-36">
                                <NumberInput
                                  value={d.otros_cobros || 0}
                                  onChange={(val) => handleDetalleChange(idx, "otros_cobros", val)}
                                  className="h-7 text-xs text-right font-mono text-amber-600 dark:text-amber-400 font-bold"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Observaciones / Notas</Label>
            <Input
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Notas adicionales sobre este abono..."
              className="h-9 text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Motivo del ajuste (para histórico contable)</Label>
            <Input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: Corrección de valor aplicado o fecha..."
              className="h-9 text-xs"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleGuardar} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Guardar Cambios
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
