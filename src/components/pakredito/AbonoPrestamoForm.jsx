import React, { useState, useMemo, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertCircle, Loader2, Wallet } from "lucide-react";
import SearchableSelect from "@/components/ui/searchable-select";
import { NumberInput } from "@/components/ui/number-input";
import CuentaIngresoSelect from "@/components/admin/CuentaIngresoSelect";
import { formatCOP, hoyLocal } from "@/lib/contabilidad";
import { estimarInteresesMesVencido, proyectarAbonoCuotaFija } from "@/lib/pakredito";

export default function AbonoPrestamoForm({ open, onOpenChange, onSaved, clientes, prestamos }) {
  const [clienteId, setClienteId] = useState("");
  const [fecha, setFecha] = useState(hoyLocal());
  const [valorTotal, setValorTotal] = useState(0);
  const [cuentaIngreso, setCuentaIngreso] = useState({ subcuenta: "", cuenta_ahorro_id: "", producto_credito_id: "" });
  const [aplicaciones, setAplicaciones] = useState({});
  const [interesesInput, setInteresesInput] = useState({});
  const [cuotasByPrestamo, setCuantosByPrestamo] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setClienteId(""); setFecha(hoyLocal()); setValorTotal(0);
    setCuentaIngreso({ subcuenta: "", cuenta_ahorro_id: "", producto_credito_id: "" });
    setAplicaciones({}); setInteresesInput({}); setCuantosByPrestamo({}); setError("");
  }, [open]);

  const creditosCliente = useMemo(
    () => prestamos.filter((p) => p.cliente_id === clienteId && (p.estado === "vigente" || p.estado === "en_mora")),
    [prestamos, clienteId]
  );

  // Cargar cuotas de los créditos de cuota fija del cliente (para mostrar cuota actual e intereses)
  useEffect(() => {
    if (!clienteId) { setCuantosByPrestamo({}); return; }
    const cfIds = creditosCliente.filter((p) => p.modelo === "cuota_fija").map((p) => p.id);
    if (cfIds.length === 0) { setCuantosByPrestamo({}); return; }
    let alive = true;
    (async () => {
      try {
        const results = await Promise.all(
          cfIds.map((id) => base44.entities.CuotaAmortizacion.filter({ prestamo_id: id }))
        );
        if (!alive) return;
        const map = {};
        cfIds.forEach((id, i) => {
          const arr = [...(results[i] || [])].sort((a, b) => a.numero - b.numero);
          map[id] = arr;
        });
        setCuantosByPrestamo(map);
      } catch { setCuantosByPrestamo({}); }
    })();
    return () => { alive = false; };
  }, [clienteId, creditosCliente]);

  const sumaAplicada = Object.values(aplicaciones).reduce((s, v) => s + (Number(v) || 0), 0);
  const diferencia = valorTotal - sumaAplicada;

  const toggleCredito = (p) => {
    setAplicaciones((prev) => {
      const next = { ...prev };
      if (next[p.id]) {
        delete next[p.id];
      } else {
        next[p.id] = p.modelo === "cuota_fija" ? (p.cuota_fija || 0) : 0;
      }
      return next;
    });
  };

  const setAplicacion = (pid, val) => setAplicaciones((prev) => ({ ...prev, [pid]: val }));
  const setInteres = (pid, val) => setInteresesInput((prev) => ({ ...prev, [pid]: val }));

  const handleSubmit = async () => {
    setError("");
    if (!clienteId) { setError("Seleccione un cliente"); return; }
    if (!valorTotal || valorTotal <= 0) { setError("Valor total inválido"); return; }
    if (!cuentaIngreso.subcuenta) { setError("Seleccione la cuenta de ingreso"); return; }
    const seleccionados = creditosCliente.filter((p) => aplicaciones[p.id] && Number(aplicaciones[p.id]) > 0);
    if (seleccionados.length === 0) { setError("Seleccione al menos un crédito con valor"); return; }
    if (Math.abs(diferencia) > 0.01) { setError(`Debe aplicar todo el abono recibido. Faltan ${formatCOP(diferencia)}`); return; }
    for (const p of seleccionados) {
      if (interesesInput[p.id] !== undefined && Number(interesesInput[p.id]) > Number(aplicaciones[p.id])) {
        setError(`Los intereses del crédito ${p.codigo} no pueden superar el abono aplicado`); return;
      }
    }

    setSaving(true);
    try {
      await base44.functions.invoke("gestionarPakredito", {
        accion: "registrarAbono",
        cliente_id: clienteId, fecha, valor_total: valorTotal, cuenta_ingreso: cuentaIngreso,
        detalles: seleccionados.map((p) => {
          if (p.modelo === "cuota_fija") {
            const cuotas = cuotasByPrestamo[p.id] || [];
            const proy = proyectarAbonoCuotaFija(cuotas, Number(aplicaciones[p.id]) || 0);
            const defInteres = proy.intereses + proy.exceso;
            return {
              prestamo_id: p.id,
              valor_aplicado: Number(aplicaciones[p.id]) || 0,
              intereses: interesesInput[p.id] !== undefined ? Number(interesesInput[p.id]) : defInteres
            };
          }
          return {
            prestamo_id: p.id,
            valor_aplicado: Number(aplicaciones[p.id]) || 0,
            intereses: Number(interesesInput[p.id] || 0)
          };
        })
      });
      onSaved();
      onOpenChange(false);
    } catch (e) {
      const errData = e?.data || e?.response?.data || {};
      setError(errData.error || e?.message || "Error al registrar abono");
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-3xl max-h-[92vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Wallet className="w-5 h-5 text-primary" /> Registrar Abono</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Cliente *</Label>
              <SearchableSelect value={clienteId} onValueChange={setClienteId} placeholder="Seleccionar cliente..." searchPlaceholder="Buscar cliente..."
                options={clientes.map((c) => ({ value: c.id, label: `${c.nombre}${c.cedula ? ` · ${c.cedula}` : ""}`, searchKey: `${c.nombre} ${c.cedula || ""}` }))}
                triggerClassName="h-9" />
            </div>
            <div>
              <Label>Cuenta de ingreso *</Label>
              <CuentaIngresoSelect value={cuentaIngreso.subcuenta} onValueChange={setCuentaIngreso} placeholder="CDA, efectivo, TDC, cruce..." />
            </div>
            <div>
              <Label>Fecha *</Label>
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm" />
            </div>
            <div>
              <Label>Valor recibido *</Label>
              <NumberInput value={valorTotal} onChange={setValorTotal} className="text-right" />
            </div>
          </div>

          {clienteId && (
            <div className="space-y-2">
              <Label>Créditos del cliente (seleccione y distribuya el abono)</Label>
              {creditosCliente.length === 0 ? (
                <p className="text-xs text-muted-foreground">Este cliente no tiene créditos vigentes.</p>
              ) : (
                <div className="border border-border rounded-lg divide-y divide-border/50">
                  {creditosCliente.map((p) => {
                    const sel = aplicaciones[p.id] !== undefined;
                    const cuotas = cuotasByPrestamo[p.id] || [];
                    const cuotaActual = cuotas.find((c) => c.estado !== "pagada");
                    const estim = p.modelo === "mes_vencido"
                      ? estimarInteresesMesVencido(p.saldo_capital, p.tasa_nominal, p.fecha_ultimo_abono || p.fecha_prestamo, fecha)
                      : null;
                    const proy = p.modelo === "cuota_fija" && sel
                      ? proyectarAbonoCuotaFija(cuotas, Number(aplicaciones[p.id]) || 0)
                      : null;
                    const interesProyectado = proy ? (proy.intereses + proy.exceso) : 0;
                    const capitalProyectado = proy ? proy.capital : 0;
                    const capitalMesVencido = p.modelo === "mes_vencido" && sel
                      ? Math.max(0, Number(aplicaciones[p.id]) - Number(interesesInput[p.id] || 0))
                      : 0;
                    return (
                      <div key={p.id} className="p-2 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <input type="checkbox" checked={sel} onChange={() => toggleCredito(p)} className="h-4 w-4" />
                          <span className="text-sm font-medium">{p.codigo}</span>
                          {p.modelo === "cuota_fija" && cuotaActual && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">Cuota actual: {cuotaActual.numero}</span>
                          )}
                          <span className="text-xs text-muted-foreground ml-auto">Saldo: {formatCOP(p.saldo_capital)}</span>
                          <span className="text-xs text-muted-foreground">{p.modelo === "cuota_fija" ? `Cuota: ${formatCOP(p.cuota_fija)}` : "Mes vencido"}</span>
                        </div>
                        {sel && (
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pl-2 sm:pl-6">
                            <div>
                              <Label className="text-[10px] uppercase">Abono a este crédito</Label>
                              <NumberInput value={aplicaciones[p.id]} onChange={(v) => setAplicacion(p.id, v)} className="h-8 text-xs text-right" />
                            </div>
                            {p.modelo === "mes_vencido" && (
                              <>
                                <div>
                                  <Label className="text-[10px] uppercase">Intereses a cobrar</Label>
                                  <NumberInput value={interesesInput[p.id] || 0} onChange={(v) => setInteres(p.id, v)} className="h-8 text-xs text-right" />
                                </div>
                                <div className="text-[10px] text-muted-foreground self-end pb-1">
                                  Estimado: {estim.dias}d → {formatCOP(estim.intereses)}<br />
                                  <span><b className="text-foreground">→ Capital: {formatCOP(capitalMesVencido)}</b></span><br />
                                  <span className="text-[9px]">(T/30·D·C){estim.dias === 0 ? " · 0 días → intereses en 0" : " · puede dejar en 0"}</span>
                                </div>
                              </>
                            )}
                            {p.modelo === "cuota_fija" && (
                              <>
                                <div>
                                  <Label className="text-[10px] uppercase">Intereses a cobrar</Label>
                                  <NumberInput
                                    value={interesesInput[p.id] ?? interesProyectado}
                                    onChange={(v) => setInteres(p.id, v)}
                                    className="h-8 text-xs text-right"
                                  />
                                </div>
                                <div className="text-[10px] text-muted-foreground self-end pb-1 space-y-0.5">
                                  <div>Estimado (según cuota): <span className="font-mono">{formatCOP(interesProyectado)}</span></div>
                                  <div><b className="text-foreground">→ Capital: {formatCOP(Math.max(0, Number(aplicaciones[p.id]) - (interesesInput[p.id] ?? interesProyectado)))}</b></div>
                                  <div className="text-[9px]">Editable: ajuste si necesita la última palabra</div>
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className={`flex justify-between items-center rounded-md px-3 py-2 text-sm ${Math.abs(diferencia) < 0.01 ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
            <span>Total aplicado: <strong className="font-mono">{formatCOP(sumaAplicada)}</strong></span>
            <span>Diferencia: <strong className="font-mono">{formatCOP(diferencia)}</strong></span>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /><span>{error}</span>
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end w-full sm:w-auto mt-4">
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button className="w-full sm:w-auto" onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Registrar abono
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}