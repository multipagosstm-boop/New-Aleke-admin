import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatCOP, formatMonthYear } from "@/lib/contabilidad";

export default function CuentaMovimientosDialog({ open, onOpenChange, cuentaKey, cuentaNombre, clase, periodo, periodos }) {
  const [movimientos, setMovimientos] = useState([]);
  const [comprobantes, setComprobantes] = useState({});
  const [loading, setLoading] = useState(false);
  const [periodoLocal, setPeriodoLocal] = useState(periodo || "");

  useEffect(() => { setPeriodoLocal(periodo || ""); }, [periodo, open]);

  useEffect(() => {
    if (!open || !cuentaKey) return;
    setLoading(true);
    const query = { estado: "activo", clase };
    if (periodoLocal) query.periodo_operacion = periodoLocal;
    base44.entities.MovimientoContable.filter(query, "-fecha", 2000).then(async (movs) => {
      const compIds = [...new Set(movs.map((m) => m.comprobante_id))];
      const comps = {};
      if (compIds.length > 0) {
        const allComps = await base44.entities.ComprobanteContable.list("-fecha", 1000);
        allComps.forEach((c) => { if (compIds.includes(c.id)) comps[c.id] = c; });
      }
      // Excluir notas crédito de anulación (espejo): revierten asientos ya anulados,
      // por lo que no deben sumarse al saldo habitual de la cuenta (igual que el Balance).
      const idsNotasAnulacion = new Set(
        Object.values(comps).filter((c) => c.tipo === "nota_credito" && c.comprobante_origen_id).map((c) => c.id)
      );
      const filtrados = movs.filter((m) =>
        String(m.subcuenta).startsWith(cuentaKey) && !idsNotasAnulacion.has(m.comprobante_id)
      );
      setComprobantes(comps);
      setMovimientos(filtrados);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [open, cuentaKey, clase, periodoLocal]);

  const totalDebito = movimientos.reduce((s, m) => s + (Number(m.debito) || 0), 0);
  const totalCredito = movimientos.reduce((s, m) => s + (Number(m.credito) || 0), 0);
  const saldo = (clase === "activo" || clase === "gasto") ? totalDebito - totalCredito : totalCredito - totalDebito;

  const idx = periodos ? periodos.indexOf(periodoLocal) : -1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="font-mono text-primary">{cuentaKey}</span>
            <span>{cuentaNombre}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2 pb-2">
          <span className="text-sm text-muted-foreground">{movimientos.length} movimiento(s)</span>
          {periodos && periodos.length > 0 && (
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { if (idx < periodos.length - 1) setPeriodoLocal(periodos[idx + 1]); }} disabled={!periodoLocal || idx >= periodos.length - 1}>
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              <span className="text-xs font-medium min-w-[90px] text-center">{periodoLocal ? formatMonthYear(periodoLocal) : "Todos"}</span>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { if (idx > 0) setPeriodoLocal(periodos[idx - 1]); }} disabled={!periodoLocal || idx <= 0}>
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
              {periodoLocal && (
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setPeriodoLocal("")}>Todos</Button>
              )}
            </div>
          )}
        </div>

        <div className="overflow-auto flex-1">
          {loading ? (
            <div className="py-8 text-center text-muted-foreground flex items-center justify-center gap-2">
              <div className="w-4 h-4 border-2 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
              Cargando movimientos...
            </div>
          ) : movimientos.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No hay movimientos para esta cuenta{periodoLocal ? " en este periodo" : ""}.</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="text-muted-foreground thead-sticky">
                <tr>
                  <th className="text-left py-2 px-2 font-medium">Fecha</th>
                  <th className="text-left py-2 px-2 font-medium">Comprobante</th>
                  <th className="text-left py-2 px-2 font-medium">Subcuenta</th>
                  <th className="text-left py-2 px-2 font-medium">Descripción</th>
                  <th className="text-left py-2 px-2 font-medium">Tercero</th>
                  <th className="text-right py-2 px-2 font-medium">Débito</th>
                  <th className="text-right py-2 px-2 font-medium">Crédito</th>
                </tr>
              </thead>
              <tbody>
                {movimientos.map((m) => {
                  const comp = comprobantes[m.comprobante_id];
                  return (
                    <tr key={m.id} className="border-b border-border/30 hover:bg-muted/20">
                      <td className="py-1.5 px-2 font-mono whitespace-nowrap">{m.fecha}</td>
                      <td className="py-1.5 px-2 font-mono whitespace-nowrap" title={comp?.descripcion}>
                        {comp?.numero || "—"}
                      </td>
                      <td className="py-1.5 px-2 font-mono">{m.subcuenta}</td>
                      <td className="py-1.5 px-2 max-w-xs truncate" title={m.descripcion}>{m.descripcion || comp?.descripcion || "—"}</td>
                      <td className="py-1.5 px-2 text-muted-foreground">{m.tercero || "—"}</td>
                      <td className="py-1.5 px-2 text-right font-mono">{Number(m.debito) ? formatCOP(Number(m.debito)) : ""}</td>
                      <td className="py-1.5 px-2 text-right font-mono">{Number(m.credito) ? formatCOP(Number(m.credito)) : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border font-medium">
                  <td colSpan={5} className="py-2 px-2 text-right text-sm">Totales:</td>
                  <td className="py-2 px-2 text-right font-mono font-bold">{formatCOP(totalDebito)}</td>
                  <td className="py-2 px-2 text-right font-mono font-bold">{formatCOP(totalCredito)}</td>
                </tr>
                <tr className="bg-muted/30">
                  <td colSpan={5} className="py-2 px-2 text-right text-sm font-medium">Saldo:</td>
                  <td colSpan={2} className={`py-2 px-2 text-right font-mono font-bold ${saldo >= 0 ? "text-success" : "text-destructive"}`}>{formatCOP(saldo)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}