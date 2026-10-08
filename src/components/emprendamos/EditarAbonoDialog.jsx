import React, { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Edit3, Wallet } from "lucide-react";
import { formatCOP } from "@/lib/contabilidad";
import SearchableSelect from "@/components/ui/searchable-select";
import { useToast } from "@/components/ui/use-toast";
import { base44 } from "@/api/base44Client";

export default function EditarAbonoDialog({
  open,
  onOpenChange,
  abono,
  clientes = [],
  creditos = [],
  puc = [],
  onSuccess
}) {
  const { toast } = useToast();

  const [fecha, setFecha] = useState("");
  const [valorTotal, setValorTotal] = useState("");
  const [tipo, setTipo] = useState("cuota_minima");
  const [subcuentaIngreso, setSubcuentaIngreso] = useState("11100101");
  const [notas, setNotas] = useState("");
  const [distribucion, setDistribucion] = useState([]);
  const [submitting, setSubmitting] = useState(false);

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

  useEffect(() => {
    if (abono) {
      setFecha(abono.fecha || "");
      setValorTotal(abono.valor_total !== undefined ? String(abono.valor_total) : "");
      setTipo(abono.tipo || "otro");
      setSubcuentaIngreso(abono.subcuenta_ingreso || "11100101");
      setNotas(abono.notas || "");

      const detallesActuales = Array.isArray(abono.detalles) ? abono.detalles : [];
      // Créditos asociados al cliente
      const credsCliente = creditos.filter((c) => c.emprendamos_cliente_id === abono.emprendamos_cliente_id);
      
      const dist = (credsCliente || []).map((c) => {
        const det = detallesActuales.find((d) => d.credito_id === c.id);
        const inter = det ? Number(det.intereses) || 0 : 0;
        const cap = det ? Number(det.capital) || 0 : 0;
        return {
          credito_id: c.id,
          codigo: c.codigo,
          concepto: c.concepto,
          saldo_capital: Number(c.saldo_capital) || 0,
          saldo_intereses: Number(c.saldo_intereses) || 0,
          intereses: inter,
          capital: cap,
          valor_aplicado: inter + cap
        };
      });

      // Si hay detalles que no están en credsCliente, agregarlos
      detallesActuales.forEach((det) => {
        if (!dist.some((d) => d.credito_id === det.credito_id)) {
          const cr = creditos.find((c) => c.id === det.credito_id);
          dist.push({
            credito_id: det.credito_id,
            codigo: cr?.codigo || "Crédito",
            concepto: cr?.concepto || "",
            saldo_capital: Number(cr?.saldo_capital) || 0,
            saldo_intereses: Number(cr?.saldo_intereses) || 0,
            intereses: Number(det.intereses) || 0,
            capital: Number(det.capital) || 0,
            valor_aplicado: (Number(det.intereses) || 0) + (Number(det.capital) || 0)
          });
        }
      });

      setDistribucion(dist);
    }
  }, [abono, open, creditos]);

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

  const sumaAplicada = distribucion.reduce((s, d) => s + (Number(d.valor_aplicado) || 0), 0);
  const montoTotalNum = Number(valorTotal) || 0;
  const diferenciaCuadre = Math.round((montoTotalNum - sumaAplicada) * 100) / 100;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!abono?.id) return;

    if (montoTotalNum <= 0) {
      toast({ variant: "destructive", title: "Error", description: "Ingrese el valor total del abono" });
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

    setSubmitting(true);
    try {
      await base44.functions.invoke("gestionarEmprendamos", {
        accion: "editarAbono",
        abono_id: abono.id,
        valor_total: montoTotalNum,
        fecha,
        subcuenta_ingreso: subcuentaIngreso,
        tipo,
        notas,
        detalles: distribucion
          .filter((d) => Number(d.valor_aplicado) > 0)
          .map((d) => ({
            credito_id: d.credito_id,
            valor_aplicado: Number(d.valor_aplicado),
            intereses: Number(d.intereses) || 0,
            capital: Number(d.capital) || 0
          }))
      });

      toast({
        title: "Abono actualizado",
        description: "El abono y los saldos de los créditos se recalcularon correctamente."
      });

      if (onSuccess) onSuccess();
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast({
        variant: "destructive",
        title: "Error al actualizar",
        description: err.message || "No se pudo actualizar el abono"
      });
    } finally {
      setSubmitting(false);
    }
  };

  const cli = clientes.find((c) => c.id === abono?.cliente_id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <Edit3 className="w-5 h-5 text-emerald-600" />
            Editar Abono de Emprendamos ({cli?.nombre || "Cliente"})
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="grid grid-cols-3 gap-3">
            {/* FECHA */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Fecha del Abono *</Label>
              <Input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                required
                className="h-9 text-xs"
              />
            </div>

            {/* VALOR TOTAL */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Valor Total Pagado *</Label>
              <Input
                type="number"
                value={valorTotal}
                onChange={(e) => setValorTotal(e.target.value)}
                required
                className="h-9 text-xs"
              />
              <span className="text-[10px] text-muted-foreground block">
                {formatCOP(montoTotalNum)}
              </span>
            </div>

            {/* MODALIDAD */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Modalidad *</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger className="text-xs h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cuota_minima">Intereses (Cuota mínima)</SelectItem>
                  <SelectItem value="capital">Abono a Capital</SelectItem>
                  <SelectItem value="total">Cancelación Total</SelectItem>
                  <SelectItem value="fijo">Cuota Fija</SelectItem>
                  <SelectItem value="otro">Otro</SelectItem>
                </SelectContent>
              </Select>
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
              placeholder="Buscar subcuenta de ingreso..."
              searchPlaceholder="Código o nombre de cuenta PUC..."
              options={pucOptions}
              triggerClassName="h-9 text-xs w-full"
            />
          </div>

          {/* IMPUTACIÓN A CRÉDITOS */}
          <div className="space-y-2 border rounded-lg p-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold">Imputación a Créditos</Label>
              <span className={`text-xs font-semibold ${Math.abs(diferenciaCuadre) <= 0.01 ? 'text-emerald-600' : 'text-destructive'}`}>
                Aplicado: {formatCOP(sumaAplicada)} / Total: {formatCOP(montoTotalNum)}
                {Math.abs(diferenciaCuadre) > 0.01 && ` (Dif: ${formatCOP(diferenciaCuadre)})`}
              </span>
            </div>

            <div className="divide-y divide-border border rounded-md overflow-hidden text-xs">
              <div className="grid grid-cols-12 gap-2 bg-muted/40 p-2 font-semibold text-[11px] text-muted-foreground">
                <div className="col-span-4">Crédito</div>
                <div className="col-span-4 text-center">Abono a Intereses</div>
                <div className="col-span-4 text-center">Abono a Capital</div>
              </div>
              {distribucion.map((d) => (
                <div key={d.credito_id} className="grid grid-cols-12 gap-2 p-2 items-center">
                  <div className="col-span-4">
                    <span className="font-bold block">{d.codigo}</span>
                    <span className="text-[10px] text-muted-foreground block truncate">{d.concepto}</span>
                  </div>
                  <div className="col-span-4">
                    <Input
                      type="number"
                      value={d.intereses}
                      onChange={(e) => handleUpdateFila(d.credito_id, "intereses", e.target.value)}
                      className="h-8 text-xs text-right"
                    />
                  </div>
                  <div className="col-span-4">
                    <Input
                      type="number"
                      value={d.capital}
                      onChange={(e) => handleUpdateFila(d.credito_id, "capital", e.target.value)}
                      className="h-8 text-xs text-right"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* NOTAS */}
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Notas / Observaciones</Label>
            <Textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Observaciones del abono..."
              rows={2}
              className="text-xs"
            />
          </div>

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
