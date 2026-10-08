import React, { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { HandCoins, AlertTriangle, ShieldCheck, Zap, Plus, Trash2 } from "lucide-react";
import { formatCOP } from "@/lib/contabilidad";
import { calcularCupoDisponible, calcularCupoUsado, calcularExtracupoUsado } from "@/lib/emprendamos";
import SearchableSelect from "@/components/ui/searchable-select";
import { NumberInput } from "@/components/ui/number-input";
import { useToast } from "@/components/ui/use-toast";

const LINEA_VACIA = {
  subcuenta: "",
  credito: "",
  descripcion: "Desembolso crédito",
  cuenta_ahorro_id: "",
  producto_credito_id: ""
};

export default function NuevoPrestamoDialog({
  open,
  onOpenChange,
  inscritos = [],
  clientes = [],
  creditos = [],
  cdas = [],
  productos = [],
  puc = [],
  clientePreseleccionadoId = null,
  onSuccess
}) {
  const { toast } = useToast();
  const hoy = new Date().toISOString().substring(0, 10);

  const [emprendamosClienteId, setEmprendamosClienteId] = useState("");
  const [tipo, setTipo] = useState("habitual"); // 'habitual' | 'extracupo'
  const [tasaNominal, setTasaNominal] = useState(3.0); // %
  const [fecha, setFecha] = useState(hoy);
  const [concepto, setConcepto] = useState("");
  const [lineas, setLineas] = useState([{ ...LINEA_VACIA }]);
  const [notas, setNotas] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Sincronizar cliente preseleccionado
  useEffect(() => {
    if (clientePreseleccionadoId) {
      setEmprendamosClienteId(clientePreseleccionadoId);
    } else if (inscritos.length > 0 && !emprendamosClienteId) {
      setEmprendamosClienteId(inscritos[0].id);
    }
  }, [clientePreseleccionadoId, inscritos, open]);

  // Reset al abrir
  useEffect(() => {
    if (open) {
      setFecha(new Date().toISOString().substring(0, 10));
      setConcepto("");
      setNotas("");
      setLineas([{ ...LINEA_VACIA }]);
    }
  }, [open]);

  const inscrito = inscritos.find((i) => i.id === emprendamosClienteId);
  const cliente = clientes.find((c) => c.id === inscrito?.cliente_id);

  // Créditos vigentes de este cliente
  const creditosCliente = creditos.filter(
    (c) => c.emprendamos_cliente_id === emprendamosClienteId && c.estado === "vigente"
  );
  const cupoTotal = Number(inscrito?.cupo_asignado) || 0;
  const cupoUsado = calcularCupoUsado(creditosCliente);
  const cupoDisponible = calcularCupoDisponible(cupoTotal, creditosCliente);
  const extracupoUsado = calcularExtracupoUsado(creditosCliente);

  // Actualizar tasa sugerida al cambiar tipo o cliente
  useEffect(() => {
    if (tipo === "habitual") {
      setTasaNominal((Number(inscrito?.tasa_acordada) || 0.03) * 100);
    } else {
      setTasaNominal((Number(inscrito?.tasa_extracupo) || 0.06) * 100);
    }
  }, [tipo, inscrito]);

  // Mapa de cuentas PUC para resolución rápida
  const pucMap = useMemo(() => {
    const map = {};
    (puc || []).forEach((c) => {
      map[String(c.codigo)] = c;
    });
    return map;
  }, [puc]);

  // Todas las cuentas disponibles para usar en el buscador (todas las clases)
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

  // Actualizar línea de desembolso
  const actualizarLinea = (index, campo, valor) => {
    const copia = [...lineas];
    copia[index] = { ...copia[index], [campo]: valor };

    if (campo === "subcuenta" && valor) {
      const cod = String(valor);
      // Auto-enlazar CDA si coincide subcuenta
      const cdaMatch = (cdas || []).find((c) => String(c.subcuenta_puc) === cod);
      copia[index].cuenta_ahorro_id = cdaMatch ? cdaMatch.id : "";

      // Auto-enlazar TDC si coincide subcuenta
      const prodMatch = (productos || []).find((p) => String(p.subcuenta_puc) === cod);
      copia[index].producto_credito_id = prodMatch ? prodMatch.id : "";

      // Si no tiene descripción personalizada, sugerir concepto de la cuenta
      if (!copia[index].descripcion || copia[index].descripcion === "Desembolso crédito") {
        const cuentaObj = pucMap[cod];
        if (cuentaObj) {
          copia[index].descripcion = `Desembolso vía ${cuentaObj.concepto || cod}`;
        }
      }
    }

    setLineas(copia);
  };

  const agregarLinea = () => {
    setLineas([...lineas, { ...LINEA_VACIA }]);
  };

  const eliminarLinea = (index) => {
    if (lineas.length <= 1) return;
    setLineas(lineas.filter((_, i) => i !== index));
  };

  // Capital total derivado de la suma de los créditos de salida
  const capitalTotal = lineas.reduce((sum, l) => sum + (Number(l.credito) || 0), 0);
  const excedeCupoHabitual = tipo === "habitual" && capitalTotal > cupoDisponible;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!emprendamosClienteId) {
      toast({ variant: "destructive", title: "Error", description: "Seleccione un cliente" });
      return;
    }
    if (capitalTotal <= 0) {
      toast({ variant: "destructive", title: "Error", description: "Ingrese al menos una partida de desembolso con valor mayor a cero" });
      return;
    }
    if (excedeCupoHabitual) {
      toast({
        variant: "destructive",
        title: "Cupo habitual insuficiente",
        description: `El capital solicitado (${formatCOP(capitalTotal)}) supera el cupo habitual disponible (${formatCOP(cupoDisponible)}). Puede otorgarlo como extracupo con tasa del 6%.`
      });
      return;
    }

    const lineasValidas = lineas.filter((l) => l.subcuenta && Number(l.credito) > 0);
    if (lineasValidas.length === 0) {
      toast({ variant: "destructive", title: "Partidas incompletas", description: "Cada línea debe tener una cuenta PUC seleccionada y un monto mayor a cero." });
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        accion: "agregarCredito",
        emprendamos_cliente_id: emprendamosClienteId,
        tipo,
        concepto: concepto || `Préstamo ${tipo === 'habitual' ? 'habitual' : 'extracupo'} — ${cliente?.nombre || ''}`,
        capital: capitalTotal,
        tasa_nominal: Number(tasaNominal) / 100,
        fecha,
        movimientos: lineasValidas.map((l) => ({
          subcuenta: l.subcuenta,
          credito: Number(l.credito) || 0,
          descripcion: l.descripcion || concepto || `Desembolso préstamo ${tipo}`,
          cuenta_ahorro_id: l.cuenta_ahorro_id || null,
          producto_credito_id: l.producto_credito_id || null
        })),
        cuenta_origen: {
          subcuenta: lineasValidas[0]?.subcuenta || "11100101"
        },
        notas
      };

      await onSuccess(payload);
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast({
        variant: "destructive",
        title: "Error al crear préstamo",
        description: err.message || "No se pudo registrar el crédito"
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-4xl max-h-[94vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl font-bold">
            <HandCoins className="w-5 h-5 text-primary" />
            Nuevo Préstamo Emprendamos (Asiento Multilínea)
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Permite desembolsar en una o múltiples cuentas contables de salida. Genera automáticamente el asiento contable (Débito 120502 Cartera vs Crédito en las cuentas indicadas).
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {/* SELECCIÓN CLIENTE Y TIPO */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 p-3 bg-muted/30 rounded-lg border">
            <div className="sm:col-span-6 space-y-1">
              <Label className="text-xs font-semibold">Cliente Inscrito *</Label>
              <SearchableSelect
                value={emprendamosClienteId}
                onValueChange={setEmprendamosClienteId}
                placeholder="Seleccionar cliente..."
                searchPlaceholder="Buscar cliente por nombre o cédula..."
                options={inscritos.map((i) => {
                  const cli = clientes.find((c) => c.id === i.cliente_id);
                  return {
                    value: i.id,
                    label: `${cli?.nombre || "Cliente"} ${cli?.documento ? `· ${cli.documento}` : ""}`,
                    searchKey: `${cli?.nombre || ""} ${cli?.documento || ""}`
                  };
                })}
                triggerClassName="h-9"
              />
            </div>

            <div className="sm:col-span-3 space-y-1">
              <Label className="text-xs font-semibold">Modalidad de Crédito *</Label>
              <div className="grid grid-cols-2 gap-1 h-9 p-0.5 bg-muted rounded-md border">
                <button
                  type="button"
                  onClick={() => setTipo("habitual")}
                  className={`text-xs font-medium rounded transition-colors flex items-center justify-center gap-1 ${
                    tipo === "habitual"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Habitual
                </button>
                <button
                  type="button"
                  onClick={() => setTipo("extracupo")}
                  className={`text-xs font-medium rounded transition-colors flex items-center justify-center gap-1 ${
                    tipo === "extracupo"
                      ? "bg-amber-600 text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Zap className="w-3.5 h-3.5" />
                  Extracupo
                </button>
              </div>
            </div>

            <div className="sm:col-span-3 space-y-1">
              <Label className="text-xs font-semibold">Tasa Mensual (%) *</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={tasaNominal}
                onChange={(e) => setTasaNominal(e.target.value)}
                className="h-9 text-right font-medium"
                required
              />
            </div>
          </div>

          {/* BANNER ESTADO DE CUPO DEL CLIENTE */}
          {inscrito && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-2.5 bg-muted/20 border rounded-lg text-xs">
              <div>
                <span className="text-[11px] text-muted-foreground block">Cupo Asignado:</span>
                <strong className="text-foreground">{formatCOP(cupoTotal)}</strong>
              </div>
              <div>
                <span className="text-[11px] text-muted-foreground block">Cupo Usado:</span>
                <strong className="text-foreground">{formatCOP(cupoUsado)}</strong>
              </div>
              <div>
                <span className="text-[11px] text-muted-foreground block">Cupo Disponible:</span>
                <strong className={cupoDisponible <= 0 ? "text-destructive font-bold" : "text-emerald-600 dark:text-emerald-400 font-bold"}>
                  {formatCOP(cupoDisponible)}
                </strong>
              </div>
              <div>
                <span className="text-[11px] text-muted-foreground block">Extracupo Utilizado:</span>
                <strong className={extracupoUsado > 0 ? "text-amber-600 font-bold" : "text-muted-foreground"}>
                  {formatCOP(extracupoUsado)}
                </strong>
              </div>
            </div>
          )}

          {/* CAMPOS DE FECHA Y CONCEPTO */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Fecha del Desembolso *</Label>
              <Input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="h-9 text-xs"
                required
              />
            </div>
            <div className="sm:col-span-2 space-y-1">
              <Label className="text-xs font-semibold">Concepto del Crédito</Label>
              <Input
                placeholder="Ej: Nuevo desembolso capital de trabajo / compra cartera..."
                value={concepto}
                onChange={(e) => setConcepto(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
          </div>

          {/* TABLA MULTILÍNEA DE DESEMBOLSO (ASIENTO CONTABLE) */}
          <div className="space-y-2 border rounded-lg p-3 bg-card shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1 border-b">
              <div>
                <Label className="text-xs font-bold text-foreground">
                  Partidas de Desembolso (Salidas de dinero)
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  Seleccione una o varias cuentas contables con sus montos. La contrapartida Débito (120502 Emprendamos) se genera automáticamente.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                type="button"
                onClick={agregarLinea}
                className="h-8 text-xs shrink-0"
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                Agregar Partida
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-xs">
                <thead className="bg-muted/40 border-b text-[11px] text-muted-foreground uppercase font-semibold">
                  <tr>
                    <th className="px-2.5 py-2 text-left w-[44%]">Cuenta Contable PUC *</th>
                    <th className="px-2.5 py-2 text-right w-[24%]">Monto Salida (Crédito) *</th>
                    <th className="px-2.5 py-2 text-left w-[26%]">Detalle de Partida</th>
                    <th className="px-2 py-2 text-center w-[6%]"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {lineas.map((linea, idx) => (
                    <tr key={idx} className="hover:bg-muted/20">
                      <td className="px-2 py-1.5">
                        <SearchableSelect
                          value={linea.subcuenta}
                          onValueChange={(val) => actualizarLinea(idx, "subcuenta", val)}
                          placeholder="Buscar cuenta PUC..."
                          searchPlaceholder="Escriba código o nombre de cuenta..."
                          options={pucOptions}
                          triggerClassName="h-8 text-xs font-mono"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <NumberInput
                          value={linea.credito}
                          onChange={(val) => actualizarLinea(idx, "credito", val)}
                          className="h-8 text-xs text-right font-mono"
                          placeholder="0"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          value={linea.descripcion}
                          onChange={(e) => actualizarLinea(idx, "descripcion", e.target.value)}
                          placeholder="Detalle de desembolso..."
                          className="h-8 text-xs"
                        />
                      </td>
                      <td className="px-1 py-1.5 text-center">
                        <Button
                          size="icon"
                          variant="ghost"
                          type="button"
                          className="h-7 w-7 text-destructive hover:bg-destructive/10"
                          disabled={lineas.length <= 1}
                          onClick={() => eliminarLinea(idx)}
                          title="Eliminar partida"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/30 border-t-2 border-border font-medium">
                  <tr>
                    <td className="px-2.5 py-2.5 font-bold text-foreground">
                      Total Capital del Préstamo:
                    </td>
                    <td className="px-2.5 py-2.5 text-right font-mono text-sm font-bold text-primary">
                      {formatCOP(capitalTotal)}
                    </td>
                    <td colSpan={2} className="px-2.5 py-2.5 text-right font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                      → Débito 120502 Cartera Emprendamos
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {excedeCupoHabitual && (
              <div className="flex items-center gap-2 p-2 bg-destructive/10 border border-destructive/30 rounded text-xs text-destructive">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  El monto solicitado ({formatCOP(capitalTotal)}) supera el cupo habitual disponible ({formatCOP(cupoDisponible)}). Cambie la modalidad a <strong>Extracupo</strong> (tasa 6%) para continuar.
                </span>
              </div>
            )}
          </div>

          {/* NOTAS */}
          <div className="space-y-1">
            <Label className="text-xs">Notas Adicionales</Label>
            <Textarea
              rows={2}
              placeholder="Detalles sobre acuerdos, garantías o transferencias..."
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              className="text-xs"
            />
          </div>

          <DialogFooter className="pt-2 flex flex-col sm:flex-row gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={submitting || capitalTotal <= 0 || excedeCupoHabitual}
              className="font-bold"
            >
              {submitting ? "Registrando..." : `Crear Crédito por ${formatCOP(capitalTotal)}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
