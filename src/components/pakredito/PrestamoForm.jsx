import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, AlertCircle, Loader2, HandCoins, Calculator } from "lucide-react";
import SearchableSelect from "@/components/ui/searchable-select";
import { NumberInput } from "@/components/ui/number-input";
import AmortizacionTable from "@/components/pakredito/AmortizacionTable";
import { formatCOP, hoyLocal } from "@/lib/contabilidad";
import { generarAmortizacionCuotaFija, generarAmortizacionMesVencido } from "@/lib/pakredito";

const MOV_VACIO = { subcuenta: "", credito: "", descripcion: "Desembolso", tercero: "", cliente_id: "", cuenta_ahorro_id: "", producto_credito_id: "", tipo_movimiento_tdc: "" };

const PERIODO_LABEL = { diaria: "diaria", semanal: "semanal", quincenal: "quincenal", mensual: "mensual" };

export default function PrestamoForm({ open, onOpenChange, onSaved, clientes, pucTransaccional, cuentasAhorro, productosCredito }) {
  const [clienteId, setClienteId] = useState("");
  const [modelo, setModelo] = useState("cuota_fija");
  const [tasaPct, setTasaPct] = useState(0);
  const [periodo, setPeriodo] = useState("mensual");
  const [numCuotas, setNumCuotas] = useState(1);
  const [cuotaManual, setCuotaManual] = useState(0);
  const [fecha, setFecha] = useState(hoyLocal());
  const [movimientos, setMovimientos] = useState([{ ...MOV_VACIO }]);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const pucMap = useMemo(() => {
    const m = {}; pucTransaccional.forEach((c) => { m[String(c.codigo)] = c; }); return m;
  }, [pucTransaccional]);

  const pucBalance = useMemo(() => pucTransaccional.filter((c) => c.clase === 1 || c.clase === 2 || c.clase === 3), [pucTransaccional]);

  React.useEffect(() => {
    if (!open) return;
    setClienteId(""); setModelo("cuota_fija"); setTasaPct(0);
    setPeriodo("mensual"); setNumCuotas(1); setCuotaManual(0); setFecha(hoyLocal());
    setMovimientos([{ ...MOV_VACIO }]);
    setPreview(null); setError("");
  }, [open]);

  const tasaNominal = (Number(tasaPct) || 0) / 100;

  // El capital se deriva de los movimientos de desembolso (créditos: salidas de dinero).
  // La contrapartida 120506 (Pakredito) la agrega el backend automáticamente en el débito.
  const capital = movimientos.reduce((s, m) => s + (Number(m.credito) || 0), 0);

  const periodoLabel = modelo === "cuota_fija" ? PERIODO_LABEL[periodo] : "mensual";

  const generarPreview = () => {
    setError("");
    if (!capital || capital <= 0) { setError("Ingrese al menos un movimiento de desembolso con valor"); return; }
    const cuotaMan = modelo === "cuota_fija" && Number(cuotaManual) > 0 ? Number(cuotaManual) : 0;
    // En cuota fija con cuota manual, la tasa se deriva; no se exige ingresarla.
    const tasaRequerida = !(modelo === "cuota_fija" && cuotaMan > 0);
    if (tasaRequerida && (!tasaNominal || tasaNominal <= 0)) { setError("Ingrese una tasa nominal válida"); return; }
    if (!numCuotas || numCuotas < 1) { setError("Ingrese número de cuotas válido"); return; }
    const gen = modelo === "cuota_fija"
      ? generarAmortizacionCuotaFija(capital, tasaNominal, periodo, numCuotas, fecha, cuotaMan)
      : generarAmortizacionMesVencido(capital, tasaNominal, numCuotas, fecha);
    const tasaNominalFinal = gen.tasa_nominal_derivada !== undefined ? gen.tasa_nominal_derivada : tasaNominal;
    setPreview({ ...gen, modelo, tasaNominal: tasaNominalFinal, tep: gen.tasa_efectiva_periodo, cuotaManual: cuotaMan });
  };

  const updateMov = (idx, field, value) => {
    const updated = [...movimientos];
    updated[idx] = { ...updated[idx], [field]: value };
    if (field === "subcuenta" && value) {
      const cuenta = pucMap[value];
      updated[idx].cuenta_ahorro_id = "";
      updated[idx].producto_credito_id = "";
      if (cuenta) {
        const cda = cuentasAhorro.find((c) => String(c.subcuenta_puc) === String(cuenta.codigo));
        if (cda) updated[idx].cuenta_ahorro_id = cda.id;
        const tdc = productosCredito.find((p) => String(p.subcuenta_puc) === String(cuenta.codigo));
        if (tdc) updated[idx].producto_credito_id = tdc.id;
      }
    }
    setMovimientos(updated);
  };
  const addMov = () => setMovimientos([...movimientos, { ...MOV_VACIO }]);
  const removeMov = (idx) => movimientos.length > 1 && setMovimientos(movimientos.filter((_, i) => i !== idx));

  const handleSubmit = async () => {
    setError("");
    if (!clienteId) { setError("Seleccione un cliente"); return; }
    const cuotaMan = modelo === "cuota_fija" && Number(cuotaManual) > 0 ? Number(cuotaManual) : 0;
    const tasaRequerida = !(modelo === "cuota_fija" && cuotaMan > 0);
    if (tasaRequerida && (!tasaNominal || tasaNominal <= 0)) { setError("Tasa nominal inválida"); return; }
    if (!numCuotas || numCuotas < 1) { setError("Número de cuotas inválido"); return; }
    const validos = movimientos.filter((m) => m.subcuenta && Number(m.credito) > 0);
    if (validos.length < 1) { setError("Debe tener al menos un movimiento de desembolso con cuenta y valor"); return; }
    const cli = clientes.find((c) => c.id === clienteId);
    validos.forEach((m) => { if (!m.tercero) m.tercero = cli?.nombre || ""; });

    setSaving(true);
    try {
      await base44.functions.invoke("gestionarPakredito", {
        accion: "crearPrestamo",
        cliente_id: clienteId, modelo, tasa_nominal: tasaNominal, periodo, numero_cuotas: numCuotas,
        fecha_prestamo: fecha,
        cuota_manual: cuotaMan,
        movimientos: validos.map((m) => ({
          subcuenta: m.subcuenta, debito: 0, credito: Number(m.credito) || 0,
          descripcion: m.descripcion || "Desembolso", tercero: m.tercero || "",
          cliente_id: clienteId, cuenta_ahorro_id: m.cuenta_ahorro_id || "",
          producto_credito_id: m.producto_credito_id || "", tipo_movimiento_tdc: m.tipo_movimiento_tdc || null
        }))
      });
      onSaved();
      onOpenChange(false);
    } catch (e) {
      const errData = e?.data || e?.response?.data || {};
      setError(errData.error || e?.message || "Error al registrar préstamo");
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[94vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><HandCoins className="w-5 h-5 text-primary" /> Nuevo Préstamo Pakredito</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="col-span-2">
              <Label>Cliente *</Label>
              <SearchableSelect value={clienteId} onValueChange={setClienteId} placeholder="Seleccionar cliente..." searchPlaceholder="Buscar cliente..."
                options={clientes.map((c) => ({ value: c.id, label: `${c.nombre}${c.cedula ? ` · ${c.cedula}` : ""}`, searchKey: `${c.nombre} ${c.cedula || ""}` }))}
                triggerClassName="h-9" />
            </div>
            <div>
              <Label>Modelo *</Label>
              <Select value={modelo} onValueChange={setModelo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cuota_fija">Cuota Fija</SelectItem>
                  <SelectItem value="mes_vencido">Mes Vencido</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fecha *</Label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div>
              <Label>Tasa nominal mensual (%) {modelo === "cuota_fija" && Number(cuotaManual) > 0 ? "(opcional)" : "*"}</Label>
              <NumberInput value={tasaPct} onChange={setTasaPct} step="0.1" className="text-right" />
            </div>
            {modelo === "cuota_fija" && (
              <div>
                <Label>Periodo *</Label>
                <Select value={periodo} onValueChange={setPeriodo}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="diaria">Diaria</SelectItem>
                    <SelectItem value="semanal">Semanal</SelectItem>
                    <SelectItem value="quincenal">Quincenal</SelectItem>
                    <SelectItem value="mensual">Mensual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>N° Cuotas *</Label>
              <NumberInput value={numCuotas} onChange={setNumCuotas} min={1} className="text-right" />
            </div>
            {modelo === "cuota_fija" && (
              <div>
                <Label>Cuota a cobrar</Label>
                <NumberInput value={cuotaManual} onChange={setCuotaManual} className="text-right" />
                <p className="text-[10px] text-muted-foreground mt-1">Si la define, la tasa se calcula a partir de ella</p>
              </div>
            )}
            <div>
              <Label>Capital a prestar</Label>
              <div className="h-9 flex items-center justify-end px-3 rounded-md border font-mono text-sm border-success/40 bg-success/10 text-success">
                {formatCOP(capital)}
              </div>
            </div>
          </div>

          {/* Listado de movimientos del desembolso */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Movimientos del desembolso — el total equivale al capital a prestar (contrapartida automática 120506 en débito)</Label>
              <Button size="sm" variant="outline" onClick={addMov} type="button"><Plus className="w-4 h-4 mr-1" /> Línea</Button>
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
                          triggerClassName="h-8 text-xs" />
                      </td>
                      <td className="px-2 py-1"><NumberInput value={m.credito} onChange={(v) => updateMov(idx, "credito", v)} className="h-8 text-xs text-right" /></td>
                      <td className="px-2 py-1"><Input value={m.descripcion} onChange={(e) => updateMov(idx, "descripcion", e.target.value)} className="h-8 text-xs" /></td>
                      <td className="px-2 py-1 text-center"><Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeMov(idx)} disabled={movimientos.length <= 1}><Trash2 className="w-3 h-3 text-destructive" /></Button></td>
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

          {/* Botón de amortización */}
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={generarPreview} type="button"><Calculator className="w-4 h-4 mr-2" /> Generar amortización</Button>
          </div>

          {preview && (
            <div className="space-y-3 border-t pt-3">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                <Resumen label="Cuota fija" value={modelo === "cuota_fija" ? formatCOP(preview.cuota) : "Variable"} />
                <Resumen label="Total intereses" value={formatCOP(preview.totalIntereses)} />
                <Resumen label="Total a pagar" value={formatCOP(preview.totalAPagar)} />
                <Resumen label={`Tasa efectiva ${periodoLabel}`} value={(preview.tep * 100).toFixed(4) + "%"} />
                <Resumen label="Tasa nominal mensual" value={(preview.tasaNominal * 100).toFixed(4) + "%"} />
              </div>
              <AmortizacionTable cuotas={preview.schedule} modelo={modelo} />
              <p className="text-[11px] text-muted-foreground">
                {modelo === "cuota_fija"
                  ? "Intereses compuestos generados de forma anticipada. Los abonos prematuros no reducen los intereses."
                  : "Cronograma estimado (interés simple mensual). Los intereses reales se causan al momento del abono según días transcurridos."}
              </p>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /><span>{error}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Registrar préstamo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Resumen({ label, value }) {
  return (
    <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="font-mono font-semibold text-sm">{value}</div>
    </div>
  );
}