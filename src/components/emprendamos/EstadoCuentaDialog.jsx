import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { FileText, Printer } from "lucide-react";
import { formatCOP, formatDate } from "@/lib/contabilidad";
import { base44 } from "@/api/base44Client";

export default function EstadoCuentaDialog({
  open,
  onOpenChange,
  inscrito,
  cliente
}) {
  const hoy = new Date().toISOString().substring(0, 10);
  const [periodo, setPeriodo] = useState(hoy.substring(0, 7));
  const [loading, setLoading] = useState(false);
  const [datosEstado, setDatosEstado] = useState(null);

  useEffect(() => {
    if (!open || !inscrito?.id) return;
    const fetchEstado = async () => {
      setLoading(true);
      try {
        const resp = await base44.functions.invoke("gestionarEmprendamos", {
          accion: "generarEstadoCuenta",
          emprendamos_cliente_id: inscrito.id,
          periodo
        });
        const d = resp?.data || resp;
        setDatosEstado(d);
      } catch (err) {
        console.error("Error generando estado de cuenta:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchEstado();
  }, [open, inscrito?.id, periodo]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="print:hidden">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <FileText className="w-5 h-5 text-primary" />
              Estado de Cuenta Mensual — Emprendamos
            </DialogTitle>
            <div className="flex items-center gap-2">
              <Input
                type="month"
                className="w-40 h-8 text-xs"
                value={periodo}
                onChange={(e) => setPeriodo(e.target.value)}
              />
              <Button variant="outline" size="sm" onClick={handlePrint} className="h-8 text-xs">
                <Printer className="w-3.5 h-3.5 mr-1" /> Imprimir
              </Button>
            </div>
          </div>
        </DialogHeader>

        {loading ? (
          <div className="py-12 text-center text-sm text-muted-foreground animate-pulse">
            Generando estado de cuenta contable...
          </div>
        ) : datosEstado ? (
          <div className="space-y-4 pt-2 text-xs">
            {/* ENCABEZADO FICHA CLIENTE */}
            <div className="p-3 bg-muted/30 border rounded-lg grid grid-cols-2 md:grid-cols-4 gap-2">
              <div>
                <span className="text-muted-foreground block text-[11px]">Cliente:</span>
                <span className="font-bold text-sm block">{cliente?.nombre || 'Cliente'}</span>
                <span className="text-muted-foreground text-[10px]">Doc: {cliente?.documento || '—'}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">Día de Cobro:</span>
                <span className="font-bold text-sm">Día {inscrito?.dia_pago} de cada mes</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">Ingreso / Salida:</span>
                <span className="font-medium block">{formatDate(inscrito?.fecha_ingreso)}</span>
                <span className="text-[10px] text-muted-foreground">Elegible: {formatDate(inscrito?.fecha_eligible_salida)}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">Cupo Asignado:</span>
                <span className="font-bold text-sm text-primary">{formatCOP(inscrito?.cupo_asignado)}</span>
              </div>
            </div>

            {/* TABLERO RESUMEN DE SALDOS */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-center">
              <div className="p-2.5 bg-muted/40 border rounded-lg">
                <span className="text-[10px] text-muted-foreground block">Saldo Inicial</span>
                <span className="font-bold text-xs">{formatCOP(datosEstado.saldo_inicial)}</span>
              </div>
              <div className="p-2.5 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <span className="text-[10px] text-blue-700 dark:text-blue-300 block">+ Nuevos Préstamos</span>
                <span className="font-bold text-xs text-blue-700 dark:text-blue-300">
                  {formatCOP(datosEstado.prestamos_nuevos)}
                </span>
              </div>
              <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                <span className="text-[10px] text-amber-700 dark:text-amber-300 block">+ Intereses Causados</span>
                <span className="font-bold text-xs text-amber-700 dark:text-amber-300">
                  {formatCOP(datosEstado.intereses_generados)}
                </span>
              </div>
              <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                <span className="text-[10px] text-emerald-700 dark:text-emerald-300 block">- Abonos Recibidos</span>
                <span className="font-bold text-xs text-emerald-700 dark:text-emerald-300">
                  {formatCOP(datosEstado.abonos)}
                </span>
              </div>
              <div className="p-2.5 bg-primary/10 border border-primary/30 rounded-lg col-span-2 md:col-span-1">
                <span className="text-[10px] text-primary font-semibold block">= Saldo Final Deudor</span>
                <span className="font-bold text-sm text-primary">
                  {formatCOP(datosEstado.saldo_final)}
                </span>
              </div>
            </div>

            {/* DETALLE DE ABONOS EN EL PERIODO */}
            <div className="space-y-1.5 border rounded-lg p-3">
              <span className="font-bold block text-xs">Abonos Registrados en el Período</span>
              {(!datosEstado.detalle_abonos || datosEstado.detalle_abonos.length === 0) ? (
                <p className="text-muted-foreground text-[11px] py-1">Sin abonos registrados en este mes.</p>
              ) : (
                <div className="space-y-1">
                  {datosEstado.detalle_abonos.map((a, idx) => (
                    <div key={idx} className="flex justify-between items-center py-1 border-b last:border-0 text-xs">
                      <span>{formatDate(a.fecha)} — Modalidad: {a.tipo}</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">
                        -{formatCOP(a.valor_total || a.valor)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* DETALLE DE CRÉDITOS VIGENTES */}
            <div className="space-y-1.5 border rounded-lg p-3">
              <span className="font-bold block text-xs">Créditos y Obligaciones Vigentes</span>
              <div className="space-y-1.5">
                {(datosEstado.creditos || []).map((c) => (
                  <div key={c.codigo} className="flex justify-between items-center py-1.5 border-b last:border-0 text-xs">
                    <div>
                      <span className="font-bold mr-2">{c.codigo}</span>
                      <Badge variant="outline" className="text-[10px] mr-2">{c.tipo}</Badge>
                      <span className="text-muted-foreground">{c.concepto}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-semibold block">{formatCOP(Number(c.saldo_capital) + Number(c.saldo_intereses))}</span>
                      <span className="text-[10px] text-muted-foreground">
                        Cap: {formatCOP(c.saldo_capital)} | Int: {formatCOP(c.saldo_intereses)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        <DialogFooter className="print:hidden pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
