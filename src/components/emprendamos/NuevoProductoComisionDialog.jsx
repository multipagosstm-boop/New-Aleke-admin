import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreditCard, Landmark, Percent, Sparkles } from "lucide-react";
import { formatCOP, BANCOS, generateProductoNombre } from "@/lib/contabilidad";
import SearchableSelect from "@/components/ui/searchable-select";
import { useToast } from "@/components/ui/use-toast";
import { base44 } from "@/api/base44Client";

export default function NuevoProductoComisionDialog({
  open,
  onOpenChange,
  inscritos = [],
  clientes = [],
  productos = [],
  creditos = [],
  clientePreseleccionadoId = null,
  onSuccess
}) {
  const { toast } = useToast();
  const hoy = new Date().toISOString().substring(0, 10);

  const [emprendamosClienteId, setEmprendamosClienteId] = useState("");
  const [tipoProducto, setTipoProducto] = useState("tarjeta_credito"); // 'tarjeta_credito' | 'otro'

  // Campos para Tarjeta de Crédito
  const [bancoTdc, setBancoTdc] = useState("Bancolombia");
  const [numeroTdc, setNumeroTdc] = useState("");
  const [franquicia, setFranquicia] = useState("Visa");
  const [categoria, setCategoria] = useState("Oro");
  const [diaCorte, setDiaCorte] = useState(15);
  const [cupoTdc, setCupoTdc] = useState("");

  // Campos para Otro Producto Bancario
  const [nombreOtro, setNombreOtro] = useState("");
  const [bancoOtro, setBancoOtro] = useState("");
  const [cupoOtro, setCupoOtro] = useState("");

  // Crédito existente seleccionado para cargar la comisión
  const [creditoDestinoId, setCreditoDestinoId] = useState("");

  const [fecha, setFecha] = useState(hoy);
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

  // Créditos vigentes de este cliente en Emprendamos
  const creditosCliente = creditos.filter(
    (c) => c.emprendamos_cliente_id === emprendamosClienteId && c.estado !== "anulado"
  );

  useEffect(() => {
    if (creditosCliente.length > 0 && !creditoDestinoId) {
      setCreditoDestinoId(creditosCliente[0].id);
    }
  }, [creditosCliente, creditoDestinoId]);

  // Monto base para cálculo del 10%
  const cupoBase = tipoProducto === "tarjeta_credito" ? Number(cupoTdc) || 0 : Number(cupoOtro) || 0;
  const comisionCalculada = Math.round(cupoBase * 0.10);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!emprendamosClienteId) {
      toast({ variant: "destructive", title: "Error", description: "Seleccione el cliente de Emprendamos" });
      return;
    }
    if (cupoBase <= 0) {
      toast({ variant: "destructive", title: "Error", description: "Ingrese el cupo aprobado del producto" });
      return;
    }
    if (!creditoDestinoId) {
      toast({
        variant: "destructive",
        title: "Crédito requerido",
        description: "Seleccione a cuál crédito existente del cliente se cargará el 10% de comisión"
      });
      return;
    }

    setSubmitting(true);
    try {
      let createdProductoId = null;
      let nombreProductoFinal = "";

      if (tipoProducto === "tarjeta_credito") {
        const digitos = String(numeroTdc).replace(/\D/g, "").slice(-4) || "0000";
        const nombreTarjeta = generateProductoNombre("TDC", digitos);
        nombreProductoFinal = `Tarjeta de Crédito ${bancoTdc} ${digitos}`;

        // Crear la nueva tarjeta de crédito en ProductoCredito
        const nuevaTdc = await base44.entities.ProductoCredito.create({
          titular_id: inscrito.cliente_id,
          tipo: "TDC",
          banco: bancoTdc,
          nombre: nombreTarjeta,
          numero_completo: numeroTdc,
          cupo: cupoBase,
          saldo_disponible: cupoBase,
          fecha_corte: Number(diaCorte) || 15,
          franquicia,
          categoria,
          estado: "activo",
          subcuenta_puc: "",
          created_date: new Date().toISOString()
        });
        createdProductoId = nuevaTdc?.id || null;
      } else {
        nombreProductoFinal = `${nombreOtro || "Producto Bancario"} (${bancoOtro || "Banco"})`;
      }

      // Cargar la comisión al crédito existente del cliente y crear comprobante contable
      const payload = {
        accion: "registrarComision",
        emprendamos_cliente_id: emprendamosClienteId,
        producto_credito_id: createdProductoId,
        credito_destino_id: creditoDestinoId,
        tipo_producto: tipoProducto,
        producto: nombreProductoFinal,
        banco: tipoProducto === "tarjeta_credito" ? bancoTdc : bancoOtro,
        base: cupoBase,
        porcentaje: 0.10,
        fecha,
        cobrar_comision: true,
        notas
      };

      await onSuccess(payload);
      onOpenChange(false);
      setCupoTdc("");
      setCupoOtro("");
      setNumeroTdc("");
      setNombreOtro("");
      toast({
        title: "Producto y comisión registrados",
        description: `Se registró el producto y la comisión de ${formatCOP(comisionCalculada)} fue cargada al crédito seleccionado.`
      });
    } catch (err) {
      console.error(err);
      toast({
        variant: "destructive",
        title: "Error al registrar",
        description: err.message || "No se pudo registrar el producto y comisión"
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <Percent className="w-5 h-5 text-amber-500" />
            Nuevo Producto & Comisión del 10%
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Crea una nueva tarjeta de crédito u otro producto bancario para el cliente. La comisión del 10% sobre el cupo se cargará a uno de sus créditos existentes.
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {/* SELECCIÓN DE CLIENTE */}
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Cliente Emprendamos *</Label>
            <SearchableSelect
              value={emprendamosClienteId}
              onValueChange={(val) => {
                setEmprendamosClienteId(val);
                setCreditoDestinoId("");
              }}
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

          {/* TIPO DE PRODUCTO: TARJETA DE CRÉDITO U OTRO */}
          <div className="space-y-1.5 p-3 bg-muted/20 border rounded-lg">
            <Label className="text-xs font-bold block">Tipo de Producto a Adquirir *</Label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setTipoProducto("tarjeta_credito")}
                className={`flex items-center space-x-2 border p-2.5 rounded-lg text-left transition-colors cursor-pointer ${
                  tipoProducto === "tarjeta_credito"
                    ? "border-primary bg-primary/10 text-primary font-bold shadow-xs"
                    : "bg-card text-muted-foreground hover:bg-muted/40"
                }`}
              >
                <CreditCard className="w-4 h-4 shrink-0 text-primary" />
                <span className="text-xs">Tarjeta de Crédito</span>
              </button>

              <button
                type="button"
                onClick={() => setTipoProducto("otro")}
                className={`flex items-center space-x-2 border p-2.5 rounded-lg text-left transition-colors cursor-pointer ${
                  tipoProducto === "otro"
                    ? "border-amber-600 bg-amber-500/10 text-amber-700 dark:text-amber-400 font-bold shadow-xs"
                    : "bg-card text-muted-foreground hover:bg-muted/40"
                }`}
              >
                <Landmark className="w-4 h-4 shrink-0 text-amber-600" />
                <span className="text-xs">Otro Producto Bancario</span>
              </button>
            </div>
          </div>

          {/* FORMULARIO ESPECÍFICO SEGÚN TIPO */}
          {tipoProducto === "tarjeta_credito" ? (
            <div className="space-y-3 p-3 border rounded-lg bg-card">
              <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <CreditCard className="w-4 h-4 text-primary" />
                Datos de la Nueva Tarjeta de Crédito
              </span>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Banco Emisor *</Label>
                  <Select value={bancoTdc} onValueChange={setBancoTdc}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BANCOS.map((b) => (
                        <SelectItem key={b} value={b}>
                          {b}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Número / Últimos 4 dígitos</Label>
                  <Input
                    value={numeroTdc}
                    onChange={(e) => setNumeroTdc(e.target.value)}
                    placeholder="Ej. 1234..."
                    className="h-9 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Franquicia</Label>
                  <Select value={franquicia} onValueChange={setFranquicia}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Visa">Visa</SelectItem>
                      <SelectItem value="Mastercard">Mastercard</SelectItem>
                      <SelectItem value="American Express">American Express</SelectItem>
                      <SelectItem value="Diners">Diners</SelectItem>
                      <SelectItem value="Otra">Otra</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Categoría</Label>
                  <Select value={categoria} onValueChange={setCategoria}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Clásica">Clásica</SelectItem>
                      <SelectItem value="Oro">Oro</SelectItem>
                      <SelectItem value="Platino">Platino</SelectItem>
                      <SelectItem value="Black">Black / Signature</SelectItem>
                      <SelectItem value="Infinite">Infinite</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Día de Corte</Label>
                  <Input
                    type="number"
                    min="1"
                    max="31"
                    value={diaCorte}
                    onChange={(e) => setDiaCorte(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  Cupo Aprobado de la Tarjeta (Base del 10%) *
                </Label>
                <Input
                  type="number"
                  value={cupoTdc}
                  onChange={(e) => setCupoTdc(e.target.value)}
                  placeholder="Ej. 10000000"
                  required
                  className="h-9 text-xs font-bold"
                />
                <span className="text-[11px] text-muted-foreground block">
                  {formatCOP(Number(cupoTdc) || 0)}
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-3 p-3 border rounded-lg bg-card">
              <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Landmark className="w-4 h-4 text-amber-600" />
                Datos del Producto Bancario
              </span>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Nombre del Producto *</Label>
                  <Input
                    value={nombreOtro}
                    onChange={(e) => setNombreOtro(e.target.value)}
                    placeholder="Ej. Crédito Rotativo, Libre Inversión..."
                    required
                    className="h-9 text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Banco / Entidad Financiera</Label>
                  <Input
                    value={bancoOtro}
                    onChange={(e) => setBancoOtro(e.target.value)}
                    placeholder="Ej. Davivienda, BBVA..."
                    className="h-9 text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  Cupo / Monto Aprobado (Base del 10%) *
                </Label>
                <Input
                  type="number"
                  value={cupoOtro}
                  onChange={(e) => setCupoOtro(e.target.value)}
                  placeholder="Ej. 15000000"
                  required
                  className="h-9 text-xs font-bold"
                />
                <span className="text-[11px] text-muted-foreground block">
                  {formatCOP(Number(cupoOtro) || 0)}
                </span>
              </div>
            </div>
          )}

          {/* CÁLCULO DE COMISIÓN (10%) */}
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-amber-900 dark:text-amber-200 block">
                Comisión a cobrar (10%)
              </span>
              <span className="text-[11px] text-muted-foreground">
                10% sobre cupo aprobado de {formatCOP(cupoBase)}
              </span>
            </div>
            <span className="text-base font-bold text-amber-700 dark:text-amber-400">
              {formatCOP(comisionCalculada)}
            </span>
          </div>

          {/* CRÉDITO EXISTENTE AL CUAL CARGAR LA COMISIÓN */}
          <div className="space-y-1.5 p-3 bg-muted/20 border rounded-lg">
            <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              Crédito existente del cliente donde se cargará la comisión *
            </Label>
            {creditosCliente.length === 0 ? (
              <p className="text-xs text-destructive">
                Este cliente no tiene créditos registrados. Debes crear o montar primero un crédito para cargar la comisión.
              </p>
            ) : (
              <Select value={creditoDestinoId} onValueChange={setCreditoDestinoId}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Seleccione el crédito a cargar..." />
                </SelectTrigger>
                <SelectContent>
                  {creditosCliente.map((cr) => (
                    <SelectItem key={cr.id} value={cr.id}>
                      {cr.codigo} · Saldo: {formatCOP(cr.saldo_capital)} ({cr.concepto || cr.tipo})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <span className="text-[11px] text-muted-foreground block">
              La comisión de {formatCOP(comisionCalculada)} se sumará al saldo capital de este crédito.
            </span>
          </div>

          {/* FECHA & NOTAS */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Fecha de Registro</Label>
              <Input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Notas / Observaciones</Label>
              <Input
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Observaciones opcionales..."
                className="h-9 text-xs"
              />
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={submitting || creditosCliente.length === 0}>
              {submitting ? "Registrando..." : "Crear Producto & Cargar Comisión"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
