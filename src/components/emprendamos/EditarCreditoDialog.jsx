import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Edit3 } from "lucide-react";
import { formatCOP } from "@/lib/contabilidad";
import { useToast } from "@/components/ui/use-toast";
import { base44 } from "@/api/base44Client";

export default function EditarCreditoDialog({
  open,
  onOpenChange,
  credito,
  clientes = [],
  inscritos = [],
  onSuccess
}) {
  const { toast } = useToast();

  const [codigo, setCodigo] = useState("");
  const [tipo, setTipo] = useState("habitual");
  const [capital, setCapital] = useState("");
  const [saldoCapital, setSaldoCapital] = useState("");
  const [saldoIntereses, setSaldoIntereses] = useState("");
  const [tasaNominal, setTasaNominal] = useState("");
  const [diaPago, setDiaPago] = useState(15);
  const [fecha, setFecha] = useState("");
  const [fechaProximoPago, setFechaProximoPago] = useState("");
  const [estado, setEstado] = useState("vigente");
  const [concepto, setConcepto] = useState("");
  const [notas, setNotas] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (credito) {
      setCodigo(credito.codigo || "");
      setTipo(credito.tipo === "cartera_inicial" ? "habitual" : (credito.tipo || "habitual"));
      setCapital(credito.capital !== undefined ? String(credito.capital) : "");
      setSaldoCapital(credito.saldo_capital !== undefined ? String(credito.saldo_capital) : "");
      setSaldoIntereses(credito.saldo_intereses !== undefined ? String(credito.saldo_intereses) : "0");
      setTasaNominal(credito.tasa_nominal !== undefined ? String(Number(credito.tasa_nominal) * 100) : "3");
      setDiaPago(credito.dia_pago || 15);
      setFecha(credito.fecha || "2026-08-31");
      setFechaProximoPago(credito.fecha_proximo_pago || "");
      setEstado(credito.estado || "vigente");
      setConcepto(credito.concepto || "");
      setNotas(credito.notas || "");
      setClienteId(credito.cliente_id || "");
    }
  }, [credito, open]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!credito?.id) return;

    if (!codigo.trim()) {
      toast({ variant: "destructive", title: "Error", description: "Ingrese el código del crédito (ej. C01)" });
      return;
    }

    const capNum = Number(capital) || 0;
    const saldoCapNum = saldoCapital !== "" ? Number(saldoCapital) : capNum;
    const saldoIntNum = Number(saldoIntereses) || 0;
    const tasaNum = (Number(tasaNominal) || 0) / 100;

    setSubmitting(true);
    try {
      await base44.functions.invoke("gestionarEmprendamos", {
        accion: "editarCredito",
        credito_id: credito.id,
        codigo: codigo.trim(),
        tipo,
        capital: capNum,
        saldo_capital: saldoCapNum,
        saldo_intereses: saldoIntNum,
        tasa_nominal: tasaNum,
        dia_pago: Number(diaPago) || 15,
        fecha,
        fecha_proximo_pago: fechaProximoPago,
        estado,
        concepto,
        notas,
        cliente_id: clienteId,
        actualizar_asiento: true
      });

      toast({
        title: "Crédito actualizado",
        description: `Los cambios en el crédito ${codigo} y su asiento contable asociado se guardaron exitosamente.`
      });

      if (onSuccess) onSuccess();
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast({
        variant: "destructive",
        title: "Error al actualizar",
        description: err.message || "No se pudo actualizar el crédito"
      });
    } finally {
      setSubmitting(false);
    }
  };

  const cliActual = clientes.find((c) => c.id === clienteId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <Edit3 className="w-5 h-5 text-primary" />
            Editar Crédito de Emprendamos ({credito?.codigo})
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* CLIENTE TITULAR */}
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Cliente Titular</Label>
            <Select value={clienteId} onValueChange={setClienteId}>
              <SelectTrigger className="text-xs h-9">
                <SelectValue placeholder="Seleccione un cliente..." />
              </SelectTrigger>
              <SelectContent>
                {clientes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nombre} {c.documento ? `(${c.documento})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* CÓDIGO */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Código del Crédito *</Label>
              <Input
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                placeholder="Ej. C01, C13..."
                required
                className="h-9 text-xs"
              />
            </div>

            {/* TIPO DE CRÉDITO */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Tipo de Crédito *</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger className="text-xs h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="habitual">Habitual</SelectItem>
                  <SelectItem value="extracupo">Extracupo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {/* CAPITAL ORIGINAL / SALDO INICIAL */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Monto / Saldo Inicial *</Label>
              <Input
                type="number"
                value={capital}
                onChange={(e) => {
                  setCapital(e.target.value);
                  if (saldoCapital === capital) setSaldoCapital(e.target.value);
                }}
                required
                className="h-9 text-xs"
              />
              <span className="text-[10px] text-muted-foreground block">
                {formatCOP(Number(capital) || 0)}
              </span>
            </div>

            {/* SALDO CAPITAL ACTUAL */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Saldo Capital Actual *</Label>
              <Input
                type="number"
                value={saldoCapital}
                onChange={(e) => setSaldoCapital(e.target.value)}
                required
                className="h-9 text-xs"
              />
              <span className="text-[10px] text-muted-foreground block">
                {formatCOP(Number(saldoCapital) || 0)}
              </span>
            </div>

            {/* SALDO INTERESES */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Saldo Intereses</Label>
              <Input
                type="number"
                value={saldoIntereses}
                onChange={(e) => setSaldoIntereses(e.target.value)}
                className="h-9 text-xs"
              />
              <span className="text-[10px] text-muted-foreground block">
                {formatCOP(Number(saldoIntereses) || 0)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {/* TASA DE INTERÉS MENSUAL (%) */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Tasa Mensual (%) *</Label>
              <Input
                type="number"
                step="0.01"
                value={tasaNominal}
                onChange={(e) => setTasaNominal(e.target.value)}
                placeholder="Ej. 3, 6, 1.64"
                required
                className="h-9 text-xs"
              />
            </div>

            {/* DÍA DE PAGO */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Día de Pago (1-31) *</Label>
              <Input
                type="number"
                min="1"
                max="31"
                value={diaPago}
                onChange={(e) => setDiaPago(e.target.value)}
                required
                className="h-9 text-xs"
              />
            </div>

            {/* ESTADO */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Estado *</Label>
              <Select value={estado} onValueChange={setEstado}>
                <SelectTrigger className="text-xs h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vigente">Vigente</SelectItem>
                  <SelectItem value="saldado">Saldado</SelectItem>
                  <SelectItem value="anulado">Anulado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* FECHA */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Fecha de Inicio / Corte</Label>
              <Input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            {/* FECHA PRÓXIMO PAGO */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Fecha Próximo Pago</Label>
              <Input
                type="date"
                value={fechaProximoPago}
                onChange={(e) => setFechaProximoPago(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
          </div>

          {/* CONCEPTO */}
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Concepto</Label>
            <Input
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
              placeholder="Descripción o concepto del crédito..."
              className="h-9 text-xs"
            />
          </div>

          {/* NOTAS */}
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Notas / Observaciones</Label>
            <Textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Notas internas..."
              rows={2}
              className="text-xs"
            />
          </div>

          {credito?.comprobante_id && (
            <p className="text-[11px] text-muted-foreground bg-muted/40 p-2 rounded border">
              ℹ Este crédito está enlazado a un comprobante contable ({credito.comprobante_id}). Si modificas el monto o saldo inicial, el asiento contable se recalculará automáticamente.
            </p>
          )}

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting ? "Guardando..." : "Guardar Cambios"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
