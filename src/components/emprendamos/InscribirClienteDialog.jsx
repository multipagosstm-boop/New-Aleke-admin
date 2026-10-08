import React, { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Wallet, CreditCard, Sparkles } from "lucide-react";
import { formatCOP } from "@/lib/contabilidad";
import { calcularCupoTDC } from "@/lib/emprendamos";
import SearchableSelect from "@/components/ui/searchable-select";
import { useToast } from "@/components/ui/use-toast";

export default function InscribirClienteDialog({
  open,
  onOpenChange,
  clientes = [],
  cdas = [],
  productos = [],
  puc = [],
  onSuccess
}) {
  const { toast } = useToast();
  const hoy = new Date().toISOString().substring(0, 10);

  const [clienteId, setClienteId] = useState("");
  const [fechaIngreso, setFechaIngreso] = useState(hoy);
  const [diaPago, setDiaPago] = useState(15);
  const [tasaAcordada, setTasaAcordada] = useState(3.0); // %
  const [tasaExtracupo, setTasaExtracupo] = useState(6.0); // %
  const [planTrazado, setPlanTrazado] = useState("");
  const [notas, setNotas] = useState("");

  // Modo: "productos" (varias tarjetas/deudas asumidas) o "global" (un solo monto y cuenta de origen)
  const [modoIngreso, setModoIngreso] = useState("productos");

  // Partidas de productos
  const [filasProductos, setFilasProductos] = useState([
    { concepto: "Tarjeta de Crédito Bancolombia", subcuenta: "11100101", saldo_inicial: "", producto_credito_id: "", cuenta_ahorro_id: "" }
  ]);

  // Modo global
  const [capitalInicialGlobal, setCapitalInicialGlobal] = useState("");
  const [cuentaOrigenGlobal, setCuentaOrigenGlobal] = useState("");

  // CDA Apoderada
  const [cdaTipo, setCdaTipo] = useState("existente"); // 'existente' | 'nueva'
  const [cdaExistenteId, setCdaExistenteId] = useState("");
  const [cdaNuevaBanco, setCdaNuevaBanco] = useState("Bancolombia");
  const [cdaNuevaNumero, setCdaNuevaNumero] = useState("");
  const [cdaNuevaSaldo, setCdaNuevaSaldo] = useState(0);

  const [submitting, setSubmitting] = useState(false);

  // Cuando cambia el cliente, sugerir CDAs y calcular su cupo en tarjetas
  const clienteSeleccionado = clientes.find((c) => c.id === clienteId);
  const cdasDelCliente = cdas.filter((c) => c.titular_id === clienteId);
  const prodsDelCliente = productos.filter((p) => p.titular_id === clienteId);
  const cupoTdcCalculado = calcularCupoTDC(clienteId, productos);

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

  const clienteOptions = useMemo(() => {
    return (clientes || []).map((c) => ({
      value: c.id,
      label: `${c.nombre} ${c.documento ? `· ${c.documento}` : ""}`,
      searchKey: `${c.nombre} ${c.documento || ""}`
    }));
  }, [clientes]);

  useEffect(() => {
    if (cdasDelCliente.length > 0 && !cdaExistenteId) {
      setCdaExistenteId(cdasDelCliente[0].id);
    }
  }, [clienteId, cdasDelCliente]);

  const agregarFilaProducto = () => {
    setFilasProductos([
      ...filasProductos,
      { concepto: "", subcuenta: "11100101", saldo_inicial: "", producto_credito_id: "", cuenta_ahorro_id: "" }
    ]);
  };

  const eliminarFilaProducto = (index) => {
    if (filasProductos.length <= 1) return;
    setFilasProductos(filasProductos.filter((_, i) => i !== index));
  };

  const actualizarFila = (index, campo, valor) => {
    const copia = [...filasProductos];
    copia[index][campo] = valor;
    // Si seleccionó un producto de crédito conocido, auto-completar concepto y subcuenta
    if (campo === "producto_credito_id" && valor) {
      const prod = productos.find((p) => p.id === valor);
      if (prod) {
        copia[index].concepto = `${prod.nombre || prod.tipo} (${prod.banco || ''})`;
        if (prod.subcuenta) copia[index].subcuenta = prod.subcuenta;
      }
    }
    setFilasProductos(copia);
  };

  const totalDeudaAsumida = modoIngreso === "productos"
    ? filasProductos.reduce((sum, f) => sum + (Number(f.saldo_inicial) || 0), 0)
    : Number(capitalInicialGlobal) || 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!clienteId) {
      toast({ variant: "destructive", title: "Error", description: "Seleccione un cliente" });
      return;
    }
    if (totalDeudaAsumida <= 0) {
      toast({ variant: "destructive", title: "Error", description: "El valor total de deuda asumida debe ser mayor a cero" });
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        accion: modoIngreso === "productos" ? "inscribirClienteProductos" : "inscribirCliente",
        cliente_id: clienteId,
        fecha_ingreso: fechaIngreso,
        dia_pago: Number(diaPago),
        tasa_acordada: Number(tasaAcordada) / 100,
        tasa_extracupo: Number(tasaExtracupo) / 100,
        plan_trazado: planTrazado,
        notas,
        cda_apoderada_id: cdaTipo === "existente" ? cdaExistenteId : "",
        cda_nueva: cdaTipo === "nueva" ? {
          banco: cdaNuevaBanco,
          numero_completo: cdaNuevaNumero,
          saldo: Number(cdaNuevaSaldo) || 0,
          nombre: `CDA ${cdaNuevaBanco} - ${clienteSeleccionado?.nombre || 'Cliente'}`
        } : null
      };

      if (modoIngreso === "productos") {
        payload.productos = filasProductos.map((f) => ({
          concepto: f.concepto || "Obligación inicial",
          subcuenta: f.subcuenta || "11100101",
          saldo_inicial: Number(f.saldo_inicial) || 0,
          producto_credito_id: f.producto_credito_id || null,
          cuenta_ahorro_id: f.cuenta_ahorro_id || null
        }));
      } else {
        payload.capital_inicial = totalDeudaAsumida;
        payload.cuenta_origen = { subcuenta: cuentaOrigenGlobal };
      }

      await onSuccess(payload);
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "Error al inscribir", description: err.message || "No se pudo registrar la inscripción" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <Sparkles className="w-5 h-5 text-amber-500" />
            Inscribir Cliente en Emprendamos (Préstamo C01)
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Compra de cartera inicial: asume las obligaciones del cliente, genera el asiento contable (Débito 120502) y crea el crédito inicial.
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 pt-2">
          {/* SELECCIÓN DE CLIENTE Y DATOS BASE */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-3 bg-muted/30 rounded-lg border">
            <div className="md:col-span-2 space-y-1.5">
              <Label className="text-xs font-semibold">Cliente *</Label>
              <SearchableSelect
                value={clienteId}
                onValueChange={setClienteId}
                placeholder="Seleccione el cliente a ingresar..."
                searchPlaceholder="Buscar cliente por nombre o cédula..."
                options={clienteOptions}
                triggerClassName="h-9"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Fecha de Ingreso *</Label>
              <Input
                type="date"
                value={fechaIngreso}
                onChange={(e) => setFechaIngreso(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Día de Pago del Mes (1-28) *</Label>
              <Input
                type="number"
                min="1"
                max="28"
                value={diaPago}
                onChange={(e) => setDiaPago(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Tasa Acordada Mensual (%)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={tasaAcordada}
                onChange={(e) => setTasaAcordada(e.target.value)}
                placeholder="3.0"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Tasa Extracupo Mensual (%)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={tasaExtracupo}
                onChange={(e) => setTasaExtracupo(e.target.value)}
                placeholder="6.0"
              />
            </div>
          </div>

          {/* INFORMACIÓN DE CUPOS EN TARJETAS */}
          {clienteId && (
            <div className="flex items-center justify-between p-3 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg text-xs">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>
                  Cupo detectado en tarjetas activas del cliente:{" "}
                  <strong>{formatCOP(cupoTdcCalculado)}</strong> ({prodsDelCliente.filter(p => p.tipo === 'TDC').length} tarjeta(s))
                </span>
              </div>
              <Badge variant="outline" className="border-blue-300 text-blue-700 dark:text-blue-300">
                Límite Habitual
              </Badge>
            </div>
          )}

          {/* CUENTA DE AHORRO GESTIONADA (CDA APODERADA) */}
          <div className="p-3 bg-muted/20 border rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <Wallet className="w-4 h-4 text-emerald-600" />
                Cuenta de Ahorro Apoderada (CDA para administrar el dinero)
              </Label>
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setCdaTipo("existente")}
                  className={`px-2 py-0.5 rounded ${cdaTipo === 'existente' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
                >
                  Asignar Existente
                </button>
                <button
                  type="button"
                  onClick={() => setCdaTipo("nueva")}
                  className={`px-2 py-0.5 rounded ${cdaTipo === 'nueva' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
                >
                  Crear Nueva
                </button>
              </div>
            </div>

            {cdaTipo === "existente" ? (
              <Select value={cdaExistenteId} onValueChange={setCdaExistenteId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccione una cuenta de ahorro registrada..." />
                </SelectTrigger>
                <SelectContent>
                  {cdas.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nombre || c.banco} — {c.numero_completo || c.numero_cuenta} (Saldo: {formatCOP(c.saldo)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <Input
                  placeholder="Banco (Ej: Bancolombia)"
                  value={cdaNuevaBanco}
                  onChange={(e) => setCdaNuevaBanco(e.target.value)}
                />
                <Input
                  placeholder="Número de Cuenta"
                  value={cdaNuevaNumero}
                  onChange={(e) => setCdaNuevaNumero(e.target.value)}
                />
                <Input
                  type="number"
                  placeholder="Saldo Inicial"
                  value={cdaNuevaSaldo}
                  onChange={(e) => setCdaNuevaSaldo(e.target.value)}
                />
              </div>
            )}
          </div>

          {/* OBLIGACIONES ASUMIDAS (TABLA DE PRODUCTOS O MONTO GLOBAL) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-bold">Obligaciones Asumidas (Deuda Inicial)</Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant={modoIngreso === "productos" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setModoIngreso("productos")}
                >
                  Detalle por Producto
                </Button>
                <Button
                  type="button"
                  variant={modoIngreso === "global" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setModoIngreso("global")}
                >
                  Monto Global
                </Button>
              </div>
            </div>

            {modoIngreso === "productos" ? (
              <div className="space-y-2 border rounded-lg p-3 bg-background">
                {filasProductos.map((fila, idx) => (
                  <div key={idx} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center text-xs">
                    <div className="md:col-span-4">
                      <Input
                        placeholder="Concepto (Ej: TDC Bancolombia)"
                        value={fila.concepto}
                        onChange={(e) => actualizarFila(idx, "concepto", e.target.value)}
                        required
                      />
                    </div>
                    <div className="md:col-span-3">
                      <SearchableSelect
                        value={fila.subcuenta}
                        onValueChange={(val) => actualizarFila(idx, "subcuenta", val)}
                        placeholder="Buscar cuenta contable..."
                        searchPlaceholder="Código o nombre de cuenta..."
                        options={pucOptions}
                        triggerClassName="h-9 text-xs"
                      />
                    </div>
                    <div className="md:col-span-4">
                      <Input
                        type="number"
                        placeholder="Saldo a Deber ($)"
                        value={fila.saldo_inicial}
                        onChange={(e) => actualizarFila(idx, "saldo_inicial", e.target.value)}
                        required
                      />
                    </div>
                    <div className="md:col-span-1 flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        disabled={filasProductos.length <= 1}
                        onClick={() => eliminarFilaProducto(idx)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={agregarFilaProducto}
                  className="w-full mt-2 text-xs"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Agregar otra obligación / tarjeta
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 border rounded-lg">
                <div className="space-y-1">
                  <Label className="text-xs">Monto Total de Cartera Asumida ($) *</Label>
                  <Input
                    type="number"
                    placeholder="Ej: 15000000"
                    value={capitalInicialGlobal}
                    onChange={(e) => setCapitalInicialGlobal(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Cuenta de Origen Contable *</Label>
                  <SearchableSelect
                    value={cuentaOrigenGlobal}
                    onValueChange={setCuentaOrigenGlobal}
                    placeholder="Seleccione subcuenta de origen..."
                    searchPlaceholder="Buscar por código o concepto..."
                    options={pucOptions}
                    triggerClassName="h-9 text-xs"
                  />
                </div>
              </div>
            )}

            {/* RESUMEN DEL ASIENTO CONTABLE */}
            <div className="flex items-center justify-between p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs">
              <span className="font-semibold text-amber-900 dark:text-amber-200">
                Total Cartera Asumida (Débito a Subcuenta 120502):
              </span>
              <span className="text-base font-bold text-amber-700 dark:text-amber-400">
                {formatCOP(totalDeudaAsumida)}
              </span>
            </div>
          </div>

          {/* PLAN TRAZADO Y NOTAS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Plan Trazado para Saneamiento y Créditos</Label>
              <Textarea
                rows={2}
                placeholder="Estrategia para recuperar historial y adquirir nuevos cupos..."
                value={planTrazado}
                onChange={(e) => setPlanTrazado(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notas y Observaciones</Label>
              <Textarea
                rows={2}
                placeholder="Observaciones de ingreso, acuerdos especiales..."
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Inscribiendo..." : "Registrar Inscripción y Cartera"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
