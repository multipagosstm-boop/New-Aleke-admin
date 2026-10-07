import React, { useState, useMemo, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertCircle, Loader2, Wallet } from "lucide-react";
import SearchableSelect from "@/components/ui/searchable-select";
import { NumberInput } from "@/components/ui/number-input";
import CuentaIngresoSelect from "@/components/admin/CuentaIngresoSelect";
import { formatCOP, formatDate, hoyLocal } from "@/lib/contabilidad";
import { estimarInteresesMesVencido, proyectarAbonoCuotaFija, sumarPeriodo, calcularSaldoTotalDeber, generarAmortizacionCuotaFija, generarAmortizacionMesVencido } from "@/lib/pakredito";

export default function AbonoPrestamoForm({ open, onOpenChange, onSaved, clientes, prestamos }) {
  const [clienteId, setClienteId] = useState("");
  const [fecha, setFecha] = useState(hoyLocal());
  const [valorTotal, setValorTotal] = useState(0);
  const [cuentaIngreso, setCuentaIngreso] = useState({ subcuenta: "", cuenta_ahorro_id: "", producto_credito_id: "" });
  const [aplicaciones, setAplicaciones] = useState({});
  const [interesesInput, setInteresesInput] = useState({});
  const [cobroInteresesDeMas, setCobroInteresesDeMas] = useState({});
  const [otrosCobrosInput, setOtrosCobrosInput] = useState({});
  const [cuotasByPrestamo, setCuantosByPrestamo] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setClienteId(""); setFecha(hoyLocal()); setValorTotal(0);
    setCuentaIngreso({ subcuenta: "", cuenta_ahorro_id: "", producto_credito_id: "" });
    setAplicaciones({}); setInteresesInput({}); setCobroInteresesDeMas({}); setOtrosCobrosInput({}); setCuantosByPrestamo({}); setError("");
  }, [open]);

  const creditosCliente = useMemo(
    () => prestamos.filter((p) => p.cliente_id === clienteId && (p.estado === "vigente" || p.estado === "en_mora" || p.estado === "activo") && (p.saldo_capital === undefined || Number(p.saldo_capital) > 0)),
    [prestamos, clienteId]
  );

  // Cargar cuotas de todos los créditos del cliente (para cuota actual, intereses y amortización)
  useEffect(() => {
    if (!clienteId) { setCuantosByPrestamo({}); return; }
    const todosIds = creditosCliente.map((p) => p.id);
    if (todosIds.length === 0) { setCuantosByPrestamo({}); return; }
    let alive = true;
    (async () => {
      try {
        const results = await Promise.all(
          todosIds.map((id) => base44.entities.CuotaAmortizacion.filter({ prestamo_id: id }))
        );
        if (!alive) return;
        const map = {};
        todosIds.forEach((id, i) => {
          let arr = [...(results[i] || [])].sort((a, b) => a.numero - b.numero);
          if (arr.length === 0) {
            const pObj = creditosCliente.find((x) => x.id === id);
            if (pObj) {
              const gen = pObj.modelo === "cuota_fija"
                ? generarAmortizacionCuotaFija(pObj.capital, pObj.tasa_nominal, pObj.periodo || "mensual", pObj.numero_cuotas, pObj.fecha_prestamo, pObj.cuota_fija)
                : generarAmortizacionMesVencido(pObj.capital, pObj.tasa_nominal, pObj.periodo || "mensual", pObj.numero_cuotas, pObj.fecha_prestamo);
              arr = gen.schedule || [];
            }
          }
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
          const cuotas = cuotasByPrestamo[p.id] || [];
          const cuotaActual = cuotas.find((c) => c.estado !== "pagada") || cuotas[0];
          const proy = p.modelo === "cuota_fija" ? proyectarAbonoCuotaFija(cuotas, Number(aplicaciones[p.id]) || 0) : null;
          const defInteres = proy ? (proy.intereses + proy.exceso) : 0;
          const estim = p.modelo === "mes_vencido"
            ? estimarInteresesMesVencido(p.saldo_capital, p.tasa_nominal, p.fecha_ultimo_abono || p.fecha_prestamo, fecha)
            : null;
          const baseInteres = p.modelo === "cuota_fija" ? (cuotaActual?.interes || defInteres) : (estim?.intereses || cuotaActual?.interes || 0);

          const cobroMas = Boolean(cobroInteresesDeMas[p.id]);
          const valorAplicado = Number(aplicaciones[p.id]) || 0;
          const valorCuotaEsperada = cuotaActual
            ? (Number(cuotaActual.cuota) || 0)
            : (p.modelo === "cuota_fija" ? (Number(p.cuota_fija) || 0) : (Number(baseInteres) + (Number(p.saldo_capital) / Math.max(1, p.numero_cuotas || 1))));
          const intIngresado = (interesesInput[p.id] !== undefined && interesesInput[p.id] !== "")
            ? Number(interesesInput[p.id])
            : (p.modelo === "cuota_fija" ? defInteres : Math.round(Number(baseInteres)));
          const excesoInteresCampo = Math.max(0, intIngresado - Math.round(baseInteres));
          const excesoSobreCuota = Math.max(0, valorAplicado - Math.round(valorCuotaEsperada));
          const excCalculado = excesoInteresCampo > 0 ? excesoInteresCampo : excesoSobreCuota;

          const otrosCobros = cobroMas
            ? (otrosCobrosInput[p.id] !== undefined ? Number(otrosCobrosInput[p.id]) : excCalculado)
            : 0;

          const intVal = (intIngresado > otrosCobros && otrosCobros > 0)
            ? (intIngresado - otrosCobros)
            : intIngresado;

          return {
            prestamo_id: p.id,
            valor_aplicado: valorAplicado,
            intereses: intVal,
            cobro_intereses_de_mas: cobroMas,
            otros_cobros: otrosCobros,
            cuota_id: cuotaActual?.id || null,
            cuota_numero: cuotaActual?.numero || null
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
                    const capitalMesVencido = p.modelo === "mes_vencido" && sel
                      ? Math.max(0, Number(aplicaciones[p.id]) - Number(interesesInput[p.id] || 0))
                      : 0;
                    return (
                      <div key={p.id} className="p-2 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <input type="checkbox" checked={sel} onChange={() => toggleCredito(p)} className="h-4 w-4" />
                          <span className="text-sm font-semibold">{p.codigo}</span>
                          {cuotaActual && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
                              Cuota {cuotaActual.numero} de {p.numero_cuotas || cuotas.length || 1}
                            </span>
                          )}
                          <span className="text-xs font-medium text-foreground ml-auto">
                            Saldo a deber: <b className="font-mono text-primary">{formatCOP(calcularSaldoTotalDeber(p, cuotas))}</b>
                          </span>
                          <span className="text-xs text-muted-foreground">
                            (Cap: {formatCOP(p.saldo_capital)})
                          </span>
                          <span className="text-xs text-muted-foreground capitalize">
                            {p.modelo === "cuota_fija" ? `Fija: ${formatCOP(p.cuota_fija)}` : `Variable (${p.periodo || "mensual"})`}
                          </span>
                        </div>
                        {sel && (
                          <div className="space-y-2 pl-2 sm:pl-6">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              <div>
                                <Label className="text-[10px] uppercase">Abono a este crédito</Label>
                                <NumberInput value={aplicaciones[p.id]} onChange={(v) => setAplicacion(p.id, v)} className="h-8 text-xs text-right" />
                              </div>
                              {p.modelo === "mes_vencido" && (
                                <>
                                  <div>
                                    <div className="flex items-center justify-between">
                                      <Label className="text-[10px] uppercase">Intereses a cobrar</Label>
                                      {estim.intereses > 0 && (
                                        <button
                                          type="button"
                                          className="text-[9px] text-primary hover:underline font-medium"
                                          onClick={() => {
                                            const valInt = Math.round(estim.intereses);
                                            setAplicacion(p.id, valInt);
                                            setInteres(p.id, valInt);
                                          }}
                                        >
                                          Solo interés
                                        </button>
                                      )}
                                    </div>
                                    <NumberInput value={interesesInput[p.id] || 0} onChange={(v) => setInteres(p.id, v)} className="h-8 text-xs text-right" />
                                  </div>
                                  <div className="text-[10px] text-muted-foreground self-end pb-1">
                                    Estimado: {estim.dias}d → {formatCOP(estim.intereses)}<br />
                                    <span><b className="text-foreground">→ Capital: {formatCOP(capitalMesVencido)}</b></span><br />
                                    <span className="text-[9px]">(T/30·D·C){estim.dias === 0 ? " · 0 días → intereses en 0" : " · editable"}</span>
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

                            {/* Aviso de Prórroga por pago de solo intereses en cuota variable */}
                            {p.modelo === "mes_vencido" && Number(aplicaciones[p.id]) > 0 && capitalMesVencido <= 0 && Number(interesesInput[p.id] || 0) > 0 && (
                              <div className="rounded-md bg-amber-500/10 border border-amber-500/30 p-2 text-xs text-amber-800 dark:text-amber-300">
                                <b>ℹ️ Pago de solo intereses:</b> El capital ({formatCOP(p.saldo_capital)}) se mantiene intacto y el crédito se <b>prorrogará automáticamente</b> hasta el siguiente plazo ({formatDate(sumarPeriodo(p.fecha_proximo_pago || fecha, p.periodo || "mensual", 1))}).
                              </div>
                            )}

                            {/* Opción de cobro de intereses de más -> Otros cobros */}
                            {(() => {
                              const interesBase = p.modelo === "cuota_fija"
                                ? (cuotaActual?.interes || 0)
                                : (estim?.intereses || cuotaActual?.interes || 0);
                              const intIngresado = (interesesInput[p.id] !== undefined && interesesInput[p.id] !== "")
                                ? Number(interesesInput[p.id])
                                : (p.modelo === "cuota_fija" ? interesProyectado : Math.round(Number(interesBase)));
                              const abonoAplicado = Number(aplicaciones[p.id]) || 0;
                              const valorCuotaEsperada = cuotaActual
                                ? (Number(cuotaActual.cuota) || 0)
                                : (p.modelo === "cuota_fija" ? (Number(p.cuota_fija) || 0) : (Number(interesBase) + (Number(p.saldo_capital) / Math.max(1, p.numero_cuotas || 1))));
                              const excesoInteresCampo = Math.max(0, intIngresado - Math.round(interesBase));
                              const excesoSobreCuota = Math.max(0, abonoAplicado - Math.round(valorCuotaEsperada));
                              const excesoSugerido = excesoInteresCampo > 0 ? excesoInteresCampo : excesoSobreCuota;
                              const esCobroMas = Boolean(cobroInteresesDeMas[p.id]);

                              return (
                                <div className="pt-2 border-t border-border/50 text-xs space-y-1.5">
                                  <label className="flex items-start gap-2 cursor-pointer select-none">
                                    <input
                                      type="checkbox"
                                      checked={esCobroMas}
                                      onChange={(e) => {
                                        const checked = e.target.checked;
                                        setCobroInteresesDeMas((prev) => ({ ...prev, [p.id]: checked }));
                                        if (checked && (otrosCobrosInput[p.id] === undefined || otrosCobrosInput[p.id] === 0)) {
                                          setOtrosCobrosInput((prev) => ({ ...prev, [p.id]: excesoSugerido }));
                                        }
                                      }}
                                      className="mt-0.5 h-4 w-4 rounded border-input text-primary"
                                    />
                                    <div className="flex-1 space-y-1">
                                      <div className="flex items-center gap-2 flex-wrap font-medium text-foreground">
                                        <span>¿Se cobraron intereses de más? Destinar a &quot;Otros cobros&quot; / &quot;Cobro extra&quot;</span>
                                        {esCobroMas && (
                                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-400 font-semibold border border-amber-500/30">
                                            Activado
                                          </span>
                                        )}
                                      </div>
                                      {esCobroMas ? (
                                        <div className="space-y-1.5 pl-0.5 mt-1">
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-[11px] text-muted-foreground">Valor extra a registrar en Otros cobros:</span>
                                            <div className="w-36">
                                              <NumberInput
                                                value={otrosCobrosInput[p.id] !== undefined ? otrosCobrosInput[p.id] : excesoSugerido}
                                                onChange={(v) => setOtrosCobrosInput((prev) => ({ ...prev, [p.id]: v }))}
                                                className="h-7 text-xs text-right font-mono text-amber-600 dark:text-amber-400 font-bold"
                                              />
                                            </div>
                                            {excesoSugerido > 0 && (
                                              <button
                                                type="button"
                                                className="text-[10px] text-primary hover:underline"
                                                onClick={() => setOtrosCobrosInput((prev) => ({ ...prev, [p.id]: excesoSugerido }))}
                                              >
                                                (Sugerido: {formatCOP(excesoSugerido)})
                                              </button>
                                            )}
                                          </div>
                                          <p className="text-[11px] text-amber-800 dark:text-amber-300 bg-amber-500/10 p-2 rounded border border-amber-500/20 leading-relaxed">
                                            ✓ Este saldo de más cobrado se sumará en la columna <b>&quot;Otros cobros&quot;</b> de la cuota en la amortización una vez cubiertos los intereses y capital ordinarios, sin aplicarse para adelantar la cuota siguiente.
                                          </p>
                                        </div>
                                      ) : (
                                        <p className="text-[10px] text-muted-foreground">
                                          En caso contrario, cualquier saldo que sobrepase la cuota se aplica automáticamente para la cuota siguiente (comportamiento natural).
                                        </p>
                                      )}
                                    </div>
                                  </label>
                                </div>
                              );
                            })()}
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