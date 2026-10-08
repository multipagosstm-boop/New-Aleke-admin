import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Percent } from "lucide-react";
import { formatCOP } from "@/lib/contabilidad";
import SearchableSelect from "@/components/ui/searchable-select";
import { useToast } from "@/components/ui/use-toast";

export default function NuevoProductoComisionDialog({
  open,
  onOpenChange,
  inscritos = [],
  clientes = [],
  productos = [],
  clientePreseleccionadoId = null,
  onSuccess
}) {
  const { toast } = useToast();
  const hoy = new Date().toISOString().substring(0, 10);

  const [emprendamosClienteId, setEmprendamosClienteId] = useState("");
  const [productoCreditoId, setProductoCreditoId] = useState("");
  const [nombreProductoManual, setNombreProductoManual] = useState("");
  const [cupoBase, setCupoBase] = useState("");
  const [porcentaje, setPorcentaje] = useState(10); // 10%
  const [fecha, setFecha] = useState(hoy);
  const [cobrarComision, setCobrarComision] = useState(true);
  const [notas, setNotas] = useState("");
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

  // Tarjetas y créditos registrados a nombre del cliente
  const productosCliente = productos.filter((p) => p.titular_id === inscrito?.cliente_id && p.tipo === "TDC");

  const handleProductoSelect = (prodId) => {
    setProductoCreditoId(prodId);
    const prod = productos.find((p) => p.id === prodId);
    if (prod) {
      setCupoBase(prod.cupo || "");
      setNombreProductoManual(`${prod.nombre || prod.tipo} (${prod.banco || ''})`);
    }
  };

  const baseNumerica = Number(cupoBase) || 0;
  const pctDecimal = (Number(porcentaje) || 10) / 100;
  const comisionCalculada = Math.round(baseNumerica * pctDecimal);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!emprendamosClienteId) {
      toast({ variant: "destructive", title: "Error", description: "Seleccione el cliente" });
      return;
    }
    if (baseNumerica <= 0) {
      toast({ variant: "destructive", title: "Error", description: "Ingrese el cupo aprobado o saldo base" });
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        accion: productoCreditoId ? "registrarNuevoCupo" : "registrarComision",
        emprendamos_cliente_id: emprendamosClienteId,
        producto_credito_id: productoCreditoId || null,
        producto: nombreProductoManual || "Nuevo producto de crédito",
        base: baseNumerica,
        porcentaje: pctDecimal,
        fecha,
        cobrar_comision: cobrarComision,
        notas
      };

      await onSuccess(payload);
      onOpenChange(false);
      setCupoBase("");
      setProductoCreditoId("");
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "Error", description: err.message || "No se pudo registrar la comisión" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <Percent className="w-5 h-5 text-amber-500" />
            Nuevo Producto y Comisión del 10%
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Al adquirir un nuevo cupo o tarjeta, la empresa cobra una comisión del 10% que se carga a la cartera de Emprendamos (120502) y se reconoce como ingreso (410510).
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {/* SELECCIÓN DE CLIENTE */}
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Cliente Emprendamos *</Label>
            <SearchableSelect
              value={emprendamosClienteId}
              onValueChange={setEmprendamosClienteId}
              placeholder="Seleccione cliente..."
              searchPlaceholder="Buscar cliente por nombre..."
              options={(inscritos || []).map((ins) => {
                const cli = clientes.find((c) => c.id === ins.cliente_id);
                return {
                  value: ins.id,
                  label: `${cli?.nombre || "Cliente"} · Cupo: ${formatCOP(ins.cupo_asignado)}`,
                  searchKey: `${cli?.nombre || ""} ${cli?.documento || ""}`
                };
              })}
              triggerClassName="h-9 text-xs"
            />
          </div>

          {/* VINCULACIÓN CON TDC REGISTRADA O PRODUCTO NUEVO */}
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Tarjeta de Crédito Vinculada (Módulo Tarjetas)</Label>
            <Select value={productoCreditoId} onValueChange={handleProductoSelect}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccione tarjeta del cliente (opcional)..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ninguna">-- Ingreso manual de producto --</SelectItem>
                {productosCliente.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nombre} — {p.banco} ({formatCOP(p.cupo)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-semibold">Nombre o Concepto del Producto *</Label>
            <Input
              placeholder="Ej: Tarjeta Crédito NuBank Oro, Crédito Rotativo..."
              value={nombreProductoManual}
              onChange={(e) => setNombreProductoManual(e.target.value)}
              required
            />
          </div>

          {/* CUPO APROBADO Y PORCENTAJE */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Cupo Aprobado Base ($) *</Label>
              <Input
                type="number"
                placeholder="Ej: 5000000"
                value={cupoBase}
                onChange={(e) => setCupoBase(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Comisión (%)</Label>
              <Input
                type="number"
                step="0.5"
                value={porcentaje}
                onChange={(e) => setPorcentaje(e.target.value)}
                placeholder="10"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-semibold">Fecha de Adquisición *</Label>
            <Input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              required
            />
          </div>

          {/* CHECKBOX DE COBRO DE COMISIÓN */}
          <div className="flex items-center space-x-2 pt-1">
            <Checkbox
              id="cobrarComision"
              checked={cobrarComision}
              onCheckedChange={setCobrarComision}
            />
            <label
              htmlFor="cobrarComision"
              className="text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Generar asiento contable y cargar la comisión a la cartera del cliente
            </label>
          </div>

          {/* CÁLCULO VISUAL DE LA COMISIÓN */}
          {cobrarComision && baseNumerica > 0 && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg space-y-1 text-xs">
              <div className="flex justify-between font-semibold">
                <span>Comisión a Cobrar ({porcentaje}%):</span>
                <span className="text-amber-700 dark:text-amber-400 font-bold text-sm">
                  {formatCOP(comisionCalculada)}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Asiento contable: Débito 120502 (Cartera Emprendamos) | Crédito 410510 (Comisiones Emprendamos).
              </p>
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs">Notas</Label>
            <Textarea
              rows={2}
              placeholder="Detalles de la aprobación o entidad financiera..."
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Registrando..." : "Registrar Producto y Comisión"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
