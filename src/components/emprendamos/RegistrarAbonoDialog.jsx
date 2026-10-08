import React, { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Receipt, CheckCircle, Calculator, Wallet } from "lucide-react";
import { formatCOP } from "@/lib/contabilidad";
import SearchableSelect from "@/components/ui/searchable-select";
import { useToast } from "@/components/ui/use-toast";

export default function RegistrarAbonoDialog({
  open,
  onOpenChange,
  inscritos = [],
  clientes = [],
  creditos = [],
  cdas = [],
  puc = [],
  clientePreseleccionadoId = null,
  onSuccess
}) {
  const { toast } = useToast();
  const hoy = new Date().toISOString().substring(0, 10);

  const [emprendamosClienteId, setEmprendamosClienteId] = useState("");
  const [fecha, setFecha] = useState(hoy);
  const [valorTotal, setValorTotal] = useState("");
  const [tipoAbono, setTipoAbono] = useState("cuota_minima"); // 'cuota_minima' | 'capital' | 'total' | 'fijo' | 'otro'
  const [cdaIngresoId, setCdaIngresoId] = useState("");
  const [subcuentaIngreso, setSubcuentaIngreso] = useState("11100101");
  const [notas, setNotas] = useState("");

  // Distribución por créditos
  // Array de { credito_id, valor_aplicado, intereses, capital }
  const [distribucion, setDistribucion] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (clientePreseleccionadoId) {
      setEmprendamosClienteId(clientePreseleccionadoId);
    } else if (inscritos.length > 0 && !emprendamosClienteId) {
      setEmprendamosClienteId(inscritos[0].id);
    }
  }, [clientePreseleccionadoId, inscritos]);

  const inscrito = inscritos.find((i) => i.id === emprendamosClienteId);
  const cliente = clientes.find((c) => c.id === inscrito?.cliente_id);

  // Créditos vigentes de este cliente
  const creditosCliente = creditos.filter(
    (c) => c.emprendamos_cliente_id === emprendamosClienteId && c.estado === "vigente"
  );

  const totalInteresesPendientes = creditosCliente.reduce((s, c) => s + (Number(c.saldo_intereses) || 0), 0);
  const totalCapitalPendiente = creditosCliente.reduce((s, c) => s + (Number(c.saldo_capital) || 0), 0);
  const deudaTotal = totalInteresesPendientes + totalCapitalPendiente;

  const pucOptions = useMemo(() => {
    return (puc || [])
      .map((c) => {
        const cod = String(c.codigo);
        const nom = c.concepto || c.nombre || "";
        const claseNombre = c.clase_nombre || (c.clase === 1 ? 'Activo' : c.clase === 2 ? 'Pasivo' : c.clase === 3 ? 'Patrimonio' : c.clase === 4 ? 'Ingreso' : 'Gasto');
        return {
          value: cod,
          label: `${cod} — ${nom} (${claseNombre})`,
          searchKey: `${cod} ${nom} ${claseNombre}`.toLowerCase()
        };
      })
      .sort((a, b) => a.value.localeCompare(b.value));
  }, [puc]);

  const inscritoOptions = useMemo(() => {
    return (inscritos || []).map((ins) => {
      const cli = clientes.find((c) => c.id === ins.cliente_id);
      return {
        value: ins.id,
        label: `${cli?.nombre || "Cliente"} · Deuda: ${formatCOP(ins.saldo_deuda)} (Día ${ins.dia_pago})`,
        searchKey: `${cli?.nombre || ""} ${cli?.documento || ""} ${ins.dia_pago}`
      };
    });
  }, [inscritos, clientes]);

  // Auto-llenar valor según tipo de pago
  useEffect(() => {
    if (tipoAbono === "cuota_minima") {
      setValorTotal(totalInteresesPendientes > 0 ? String(totalInteresesPendientes) : "");
    } else if (tipoAbono === "total") {
      setValorTotal(deudaTotal > 0 ? String(deudaTotal) : "");
    }
  }, [tipoAbono, totalInteresesPendientes, deudaTotal]);

  // Al cambiar el valor total o cliente, inicializar o repartir automáticamente
  const distribuirAutomatico = (montoIngresado) => {
    let remanente = Number(montoIngresado) || 0;
    const nuevaDist = [];

    // 1. Primero cubrir intereses de cada crédito
    for (const c of creditosCliente) {
      const saldoInt = Number(c.saldo_intereses) || 0;
      const pagoInt = Math.min(remanente, saldoInt);
      remanente -= pagoInt;
      nuevaDist.push({
        credito_id: c.id,
        codigo: c.codigo,
        concepto: c.concepto,
        saldo_intereses: saldoInt,
        saldo_capital: Number(c.saldo_capital) || 0,
        intereses: pagoInt,
        capital: 0,
        valor_aplicado: pagoInt
      });
    }

    // 2. Si sobra, abonar a capital de los créditos
    if (remanente > 0) {
      for (const item of nuevaDist) {
        if (remanente <= 0) break;
        const saldoCap = item.saldo_capital;
        const pagoCap = Math.min(remanente, saldoCap);
        item.capital += pagoCap;
        item.valor_aplicado += pagoCap;
        remanente -= pagoCap;
      }
    }

    setDistribucion(nuevaDist);
  };

  useEffect(() => {
    distribuirAutomatico(valorTotal);
  }, [valorTotal, emprendamosClienteId]);

  const handleUpdateFila = (credId, campo, val) => {
    const num = Number(val) || 0;
    const copia = distribucion.map((d) => {
      if (d.credito_id !== credId) return d;
      const updated = { ...d, [campo]: num };
      updated.valor_aplicado = (Number(updated.intereses) || 0) + (Number(updated.capital) || 0);
      return updated;
    });
    setDistribucion(copia);
  };

  const handleSelectCda = (cdaId) => {
    setCdaIngresoId(cdaId);
    const cda = cdas.find((c) => c.id === cdaId);
    if (cda?.subcuenta) {
      setSubcuentaIngreso(cda.subcuenta);
    }
  };

  const sumaAplicada = distribucion.reduce((s, d) => s + (Number(d.valor_aplicado) || 0), 0);
  const montoTotalNum = Number(valorTotal) || 0;
  const diferenciaCuadre = Math.round((montoTotalNum - sumaAplicada) * 100) / 100;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!emprendamosClienteId) {
      toast({ variant: "destructive", title: "Error", description: "Seleccione un cliente" });
      return;
    }
    if (montoTotalNum <= 0) {
      toast({ variant: "destructive", title: "Error", description: "Ingrese el valor del abono" });
      return;
    }
    if (Math.abs(diferenciaCuadre) > 0.01) {
      toast({
        variant: "destructive",
        title: "Diferencia de distribución",
        description: `El valor total ($${montoTotalNum.toLocaleString()}) no coincide con la suma aplicada ($${sumaAplicada.toLocaleString()}). Diferencia: $${diferenciaCuadre.toLocaleString()}`
      });
      return;
    }
    if (!subcuentaIngreso) {
      toast({ variant: "destructive", title: "Error", description: "Seleccione la cuenta contable de ingreso" });
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        accion: "registrarAbono",
        emprendamos_cliente_id: emprendamosClienteId,
        fecha,
        valor_total: montoTotalNum,
        tipo: tipoAbono,
        cuenta_ingreso: {
          subcuenta: subcuentaIngreso,
          cuenta_ahorro_id: cdaIngresoId || null
        },
        detalles: distribucion
          .filter((d) => Number(d.valor_aplicado) > 0)
          .map((d) => ({
            credito_id: d.credito_id,
            valor_aplicado: Number(d.valor_aplicado),
            intereses: Number(d.intereses) || 0,
            capital: Number(d.capital) || 0
          })),
        notas
      };

      await onSuccess(payload);
      onOpenChange(false);
      setValorTotal("");
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "Error", description: err.message || "No se pudo registrar el abono" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <Receipt className="w-5 h-5 text-emerald-600" />
            Registrar Abono / Pago Emprendamos
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Registra el ingreso recibido del cliente, reduce la cartera contable (120502) e imputa a intereses y capital de cada crédito.
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {/* SELECCIÓN CLIENTE */}
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Cliente Emprendamos *</Label>
            <SearchableSelect
              value={emprendamosClienteId}
              onValueChange={setEmprendamosClienteId}
              placeholder="Seleccione cliente..."
              searchPlaceholder="Buscar por nombre o cédula..."
              options={inscritoOptions}
              triggerClassName="h-9 text-xs"
            />
          </div>

          {/* RESUMEN DE SALDOS DEL CLIENTE */}
          {inscrito && (
            <div className="grid grid-cols-3 gap-2 p-3 bg-muted/30 border rounded-lg text-xs">
              <div>
                <span className="text-muted-foreground block">Intereses Pendientes:</span>
                <span className="font-semibold text-amber-600 dark:text-amber-400">
                  {formatCOP(totalInteresesPendientes)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block">Capital Pendiente:</span>
                <span className="font-semibold text-blue-600 dark:text-blue-400">
                  {formatCOP(totalCapitalPendiente)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block">Deuda Total a Deber:</span>
                <span className="font-bold text-foreground">
                  {formatCOP(deudaTotal)}
                </span>
              </div>
            </div>
          )}

          {/* MODALIDAD DE PAGO Y MONTO */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Modalidad de Pago</Label>
              <Select value={tipoAbono} onValueChange={setTipoAbono}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cuota_minima">Intereses (Cuota Mínima)</SelectItem>
                  <SelectItem value="capital">Abono a Capital</SelectItem>
                  <SelectItem value="total">Pago Total (Saldar Deuda)</SelectItem>
                  <SelectItem value="otro">Monto Libre / Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Valor Total del Abono ($) *</Label>
              <Input
                type="number"
                placeholder="Ej: 500000"
                value={valorTotal}
                onChange={(e) => setValorTotal(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Fecha del Abono *</Label>
              <Input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                required
              />
            </div>
          </div>

          {/* CUENTA DE INGRESO */}
          <div className="space-y-2 p-3 bg-muted/20 border rounded-lg">
            <Label className="text-xs font-semibold flex items-center gap-1.5">
              <Wallet className="w-3.5 h-3.5 text-emerald-600" />
              Cuenta Contable de Ingreso del Dinero (Bancos / Caja) *
            </Label>
            <SearchableSelect
              value={subcuentaIngreso}
              onValueChange={setSubcuentaIngreso}
              placeholder="Buscar subcuenta de ingreso (ej. 111005 Bancos, 110505 Caja)..."
              searchPlaceholder="Código o nombre de cuenta PUC..."
              options={pucOptions}
              triggerClassName="h-9 text-xs w-full"
            />
          </div>

          {/* TABLA DE IMPUTACIÓN A CRÉDITOS */}
          <div className="space-y-2 border rounded-lg p-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold">Imputación a Créditos Activos</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => distribuirAutomatico(valorTotal)}
              >
                <Calculator className="w-3.5 h-3.5 mr-1" />
                Redistribuir Automático
              </Button>
            </div>

            {creditosCliente.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2 text-center">
                El cliente no tiene créditos activos pendientes.
              </p>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {distribucion.map((item) => (
                  <div
                    key={item.credito_id}
                    className="p-2.5 bg-background border rounded-lg grid grid-cols-1 md:grid-cols-12 gap-2 items-center text-xs"
                  >
                    <div className="md:col-span-4">
                      <span className="font-bold block">{item.codigo}</span>
                      <span className="text-[11px] text-muted-foreground block truncate">{item.concepto}</span>
                      <div className="text-[10px] text-muted-foreground flex gap-2 mt-0.5">
                        <span>Int: {formatCOP(item.saldo_intereses)}</span>
                        <span>Cap: {formatCOP(item.saldo_capital)}</span>
                      </div>
                    </div>

                    <div className="md:col-span-4 space-y-0.5">
                      <Label className="text-[10px] text-muted-foreground">Abono Intereses ($)</Label>
                      <Input
                        type="number"
                        className="h-7 text-xs"
                        value={item.intereses}
                        onChange={(e) => handleUpdateFila(item.credito_id, "intereses", e.target.value)}
                      />
                    </div>

                    <div className="md:col-span-4 space-y-0.5">
                      <Label className="text-[10px] text-muted-foreground">Abono Capital ($)</Label>
                      <Input
                        type="number"
                        className="h-7 text-xs"
                        value={item.capital}
                        onChange={(e) => handleUpdateFila(item.credito_id, "capital", e.target.value)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* BALANCE DE CUADRE */}
            <div className="flex items-center justify-between pt-2 border-t text-xs">
              <span>Total Aplicado: <strong>{formatCOP(sumaAplicada)}</strong></span>
              {Math.abs(diferenciaCuadre) > 0.01 ? (
                <span className="text-destructive font-semibold">
                  Diferencia por asignar: {formatCOP(diferenciaCuadre)}
                </span>
              ) : (
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" /> Total Cuadrado
                </span>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Notas</Label>
            <Textarea
              rows={2}
              placeholder="Detalles del pago, comprobante de transferencia..."
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting || Math.abs(diferenciaCuadre) > 0.01}>
              {submitting ? "Registrando..." : "Confirmar Abono"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
