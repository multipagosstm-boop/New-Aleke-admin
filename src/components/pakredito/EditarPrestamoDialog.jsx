import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertCircle, Loader2, Pencil, Lock } from "lucide-react";
import { NumberInput } from "@/components/ui/number-input";
import AmortizacionTable from "@/components/pakredito/AmortizacionTable";
import { formatCOP } from "@/lib/contabilidad";
import { generarAmortizacionCuotaFija, generarAmortizacionMesVencido, tasaEfectivaPeriodo } from "@/lib/pakredito";

const PERIODO_LABEL = { diaria: "diaria", semanal: "semanal", quincenal: "quincenal", mensual: "mensual" };

export default function EditarPrestamoDialog({ open, onOpenChange, onSaved, prestamo }) {
  const [notas, setNotas] = useState("");
  const [tasaPct, setTasaPct] = useState(0);
  const [periodo, setPeriodo] = useState("mensual");
  const [numCuotas, setNumCuotas] = useState(1);
  const [cuotaManual, setCuotaManual] = useState(0);
  const [fechaPrestamo, setFechaPrestamo] = useState("");
  const [tieneAbonos, setTieneAbonos] = useState(false);
  const [abonos, setAbonos] = useState([]);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !prestamo) return;
    setNotas(prestamo.notas || "");
    setTasaPct((prestamo.tasa_nominal || 0) * 100);
    setPeriodo(prestamo.periodo || "mensual");
    setNumCuotas(prestamo.numero_cuotas || 1);
    setCuotaManual(prestamo.cuota_fija || 0);
    setFechaPrestamo(prestamo.fecha_prestamo || "");
    setPreview(null); setError("");
    base44.entities.AbonoPrestamo.filter({ cliente_id: prestamo.cliente_id })
      .then((all) => {
        const delPrestamo = all.filter((a) => (a.detalles || []).some((d) => d.prestamo_id === prestamo.id));
        setAbonos(delPrestamo);
        setTieneAbonos(delPrestamo.length > 0);
      })
      .catch(() => { setAbonos([]); setTieneAbonos(false); });
  }, [open, prestamo]);

  if (!prestamo) return null;

  const tasaNominal = (Number(tasaPct) || 0) / 100;
  const congelado = tieneAbonos && prestamo.modelo === "cuota_fija";

  const generarPreview = () => {
    setError("");
    if (!tasaNominal || tasaNominal <= 0) { setError("Tasa nominal inválida"); return; }
    if (!numCuotas || numCuotas < 1) { setError("Número de cuotas inválido"); return; }
    const cuotaMan = prestamo.modelo === "cuota_fija" && Number(cuotaManual) > 0 ? Number(cuotaManual) : 0;
    const gen = prestamo.modelo === "cuota_fija"
      ? generarAmortizacionCuotaFija(prestamo.capital, tasaNominal, periodo, numCuotas, fechaPrestamo || prestamo.fecha_prestamo, cuotaMan)
      : generarAmortizacionMesVencido(prestamo.capital, tasaNominal, numCuotas, fechaPrestamo || prestamo.fecha_prestamo);
    setPreview({ ...gen, tep: tasaEfectivaPeriodo(tasaNominal, periodo) });
  };

  const handleSubmit = async () => {
    setError("");
    setSaving(true);
    try {
      await base44.functions.invoke("gestionarPakredito", {
        accion: "editarPrestamo",
        prestamo_id: prestamo.id,
        notas,
        tasa_nominal: tasaNominal,
        periodo: periodo,
        numero_cuotas: numCuotas,
        cuota_manual: prestamo.modelo === "cuota_fija" && Number(cuotaManual) > 0 ? Number(cuotaManual) : 0,
        fecha_prestamo: fechaPrestamo || prestamo.fecha_prestamo
      });
      onSaved();
      onOpenChange(false);
    } catch (e) {
      const errData = e?.data || e?.response?.data || {};
      setError(errData.error || e?.message || "Error al editar préstamo");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Pencil className="w-5 h-5 text-primary" /> Editar Préstamo {prestamo.codigo}</DialogTitle>
          <DialogDescription>Modifique los parámetros del crédito. Los cambios que afecten el cronograma solo aplican si no hay abonos registrados.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {tieneAbonos && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 border border-warning/30 text-sm text-warning-foreground">
              <Lock className="w-4 h-4 mt-0.5 shrink-0 text-warning" />
              <span>Este préstamo tiene <b>{abonos.length}</b> abono(s) aplicado(s).
                {prestamo.modelo === "cuota_fija"
                  ? " El cronograma (tasa, periodo, cuotas) queda congelado; solo puede editar notas."
                  : " Puede editar la tasa nominal (afecta intereses futuros) y notas."}
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <Label>Modelo</Label>
              <div className="h-9 flex items-center px-3 rounded-md border text-sm bg-muted/30">
                {prestamo.modelo === "cuota_fija" ? "Cuota Fija" : "Mes Vencido"}
              </div>
            </div>
            <div>
              <Label>Capital</Label>
              <div className="h-9 flex items-center justify-end px-3 rounded-md border text-sm font-mono bg-muted/30">{formatCOP(prestamo.capital)}</div>
            </div>
            <div>
              <Label>Saldo capital</Label>
              <div className="h-9 flex items-center justify-end px-3 rounded-md border text-sm font-mono bg-muted/30">{formatCOP(prestamo.saldo_capital)}</div>
            </div>
            <div>
              <Label>Fecha de préstamo *</Label>
              <input type="date" value={fechaPrestamo} onChange={(e) => setFechaPrestamo(e.target.value)}
                disabled={congelado}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm" />
            </div>
            <div>
              <Label>Tasa nominal mensual (%) *</Label>
              <NumberInput value={tasaPct} onChange={setTasaPct} step="0.1" className="text-right" disabled={congelado} />
            </div>
            {prestamo.modelo === "cuota_fija" && (
              <>
                <div>
                  <Label>Periodo *</Label>
                  <Select value={periodo} onValueChange={setPeriodo} disabled={congelado}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="diaria">Diaria</SelectItem>
                      <SelectItem value="semanal">Semanal</SelectItem>
                      <SelectItem value="quincenal">Quincenal</SelectItem>
                      <SelectItem value="mensual">Mensual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>N° Cuotas *</Label>
                  <NumberInput value={numCuotas} onChange={setNumCuotas} min={1} className="text-right" disabled={congelado} />
                </div>
                <div>
                  <Label>Cuota a cobrar</Label>
                  <NumberInput value={cuotaManual} onChange={setCuotaManual} className="text-right" disabled={congelado} />
                </div>
              </>
            )}
            {prestamo.modelo === "mes_vencido" && (
              <>
                <div>
                  <Label>Periodo *</Label>
                  <Select value={periodo} onValueChange={setPeriodo} disabled={tieneAbonos}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="semanal">Semanal</SelectItem>
                      <SelectItem value="quincenal">Quincenal</SelectItem>
                      <SelectItem value="mensual">Mensual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>N° Cuotas (estimado)</Label>
                  <NumberInput value={numCuotas} onChange={setNumCuotas} min={1} className="text-right" disabled={tieneAbonos} />
                </div>
              </>
            )}
          </div>

          <div>
            <Label>Notas</Label>
            <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} placeholder="Observaciones internas..." />
          </div>

          {!congelado && (
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={generarPreview} type="button">Previsualizar cronograma</Button>
            </div>
          )}

          {preview && (
            <div className="space-y-3 border-t pt-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <Resumen label="Cuota fija" value={prestamo.modelo === "cuota_fija" ? formatCOP(preview.cuota) : "Variable"} />
                <Resumen label="Total intereses" value={formatCOP(preview.totalIntereses)} />
                <Resumen label="Total a pagar" value={formatCOP(preview.totalAPagar)} />
                <Resumen label={`Tasa efectiva ${PERIODO_LABEL[periodo]}`} value={(preview.tep * 100).toFixed(4) + "%"} />
              </div>
              <AmortizacionTable cuotas={preview.schedule} modelo={prestamo.modelo} />
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
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Guardar cambios
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