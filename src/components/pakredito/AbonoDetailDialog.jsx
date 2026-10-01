import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { Receipt, Pencil, Trash2, ExternalLink, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { formatCOP, formatDate } from "@/lib/contabilidad";

export default function AbonoDetailDialog({
  open,
  onOpenChange,
  abono,
  prestamos = [],
  clientes = [],
  onEdit,
  onDelete
}) {
  const [comprobante, setComprobante] = useState(null);
  const [movimientos, setMovimientos] = useState([]);
  const [loadingComp, setLoadingComp] = useState(false);

  useEffect(() => {
    if (!open || !abono?.comprobante_id) {
      setComprobante(null);
      setMovimientos([]);
      return;
    }

    let alive = true;
    setLoadingComp(true);
    (async () => {
      try {
        const [comp, movs] = await Promise.all([
          base44.entities.ComprobanteContable.get(abono.comprobante_id),
          base44.entities.MovimientoContable.filter({ comprobante_id: abono.comprobante_id })
        ]);
        if (!alive) return;
        setComprobante(comp);
        setMovimientos((movs || []).filter((m) => m.estado !== "inactivo"));
      } catch (err) {
        console.error("Error cargando comprobante de abono:", err);
      } finally {
        if (alive) setLoadingComp(false);
      }
    })();

    return () => { alive = false; };
  }, [open, abono]);

  if (!abono) return null;

  const cliente = clientes.find((c) => c.id === abono.cliente_id) || {};
  const clienteNombre = cliente.nombre || "—";

  const detalles = Array.isArray(abono.detalles)
    ? abono.detalles
    : (typeof abono.detalles === "string" ? JSON.parse(abono.detalles || "[]") : []);

  const totalDebito = movimientos.reduce((s, m) => s + (Number(m.debito) || 0), 0);
  const totalCredito = movimientos.reduce((s, m) => s + (Number(m.credito) || 0), 0);
  const cuadrado = Math.abs(totalDebito - totalCredito) < 0.01;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto z-[70]">
        <DialogHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Receipt className="w-5 h-5 text-primary" />
              Detalle de Abono
              <Badge variant="outline" className="font-mono text-xs">
                {formatDate(abono.fecha)}
              </Badge>
            </DialogTitle>
            <div className="flex items-center gap-2">
              {onEdit && (
                <Button size="sm" variant="outline" onClick={() => onEdit(abono)}>
                  <Pencil className="w-3.5 h-3.5 mr-1" /> Editar Abono
                </Button>
              )}
              {onDelete && (
                <Button size="sm" variant="destructive" onClick={() => onDelete(abono)}>
                  <Trash2 className="w-3.5 h-3.5 mr-1" /> Eliminar Abono
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Tarjetas de Resumen */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <div className="rounded-md border p-2.5 bg-muted/20">
              <span className="text-[10px] uppercase text-muted-foreground block">Cliente</span>
              <span className="font-medium text-sm text-foreground truncate block">{clienteNombre}</span>
              {cliente.cedula && <span className="text-muted-foreground font-mono text-xs">CC: {cliente.cedula}</span>}
            </div>
            <div className="rounded-md border p-2.5 bg-muted/20">
              <span className="text-[10px] uppercase text-muted-foreground block">Valor Total Abonado</span>
              <span className="font-bold text-base text-primary font-mono">{formatCOP(abono.valor_total)}</span>
            </div>
            <div className="rounded-md border p-2.5 bg-muted/20">
              <span className="text-[10px] uppercase text-muted-foreground block">Cuenta de Ingreso</span>
              <span className="font-mono font-medium text-xs text-foreground block">{abono.subcuenta_ingreso || "—"}</span>
              <span className="text-[11px] text-muted-foreground truncate block">
                {abono.subcuenta_ingreso === "110505" ? "Caja / Efectivo" : "Cuenta bancaria o financiera"}
              </span>
            </div>
            <div className="rounded-md border p-2.5 bg-muted/20">
              <span className="text-[10px] uppercase text-muted-foreground block">Comprobante Contable</span>
              {comprobante ? (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="font-mono font-semibold text-xs">{comprobante.numero}</span>
                  <Badge variant={comprobante.estado === "contabilizado" ? "default" : "destructive"} className="text-[9px] uppercase px-1 py-0">
                    {comprobante.estado}
                  </Badge>
                </div>
              ) : (
                <span className="text-muted-foreground text-xs">{abono.comprobante_id ? "Cargando..." : "Sin comprobante"}</span>
              )}
            </div>
          </div>

          {abono.notas && (
            <div className="text-xs rounded-md bg-muted/30 p-2.5 border">
              <span className="font-semibold text-muted-foreground mr-1">Observaciones:</span>
              <span>{abono.notas}</span>
            </div>
          )}

          {/* Tabla de Aplicación a Préstamos */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Créditos Aplicados en este Abono ({detalles.length})
            </h4>
            <div className="border rounded-md overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 border-b text-left text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Código</th>
                    <th className="px-3 py-2 font-medium">Modelo</th>
                    <th className="px-3 py-2 font-medium text-right">Valor Aplicado</th>
                    <th className="px-3 py-2 font-medium text-right">Abono Capital</th>
                    <th className="px-3 py-2 font-medium text-right">Intereses</th>
                    <th className="px-3 py-2 font-medium text-right">Saldo Capital Actual</th>
                    <th className="px-3 py-2 font-medium text-center">Estado Préstamo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {detalles.map((d, idx) => {
                    const p = prestamos.find((pr) => String(pr.id) === String(d.prestamo_id) || (pr.codigo && String(pr.codigo).toLowerCase() === String(d.prestamo_id).toLowerCase())) || {};
                    const aplicado = Number(d.valor_aplicado) || 0;
                    const intereses = Number(d.intereses) || 0;
                    const capital = d.capital !== undefined ? Number(d.capital) : Math.max(0, aplicado - intereses);
                    return (
                      <tr key={idx} className="hover:bg-muted/20">
                        <td className="px-3 py-2 font-mono font-semibold text-primary">{p.codigo || d.prestamo_id}</td>
                        <td className="px-3 py-2 text-muted-foreground">{p.modelo === "cuota_fija" ? "Cuota fija" : "Mes vencido"}</td>
                        <td className="px-3 py-2 text-right font-mono font-semibold">{formatCOP(aplicado)}</td>
                        <td className="px-3 py-2 text-right font-mono text-foreground">{formatCOP(capital)}</td>
                        <td className="px-3 py-2 text-right font-mono text-muted-foreground">{formatCOP(intereses)}</td>
                        <td className="px-3 py-2 text-right font-mono">{formatCOP(p.saldo_capital ?? 0)}</td>
                        <td className="px-3 py-2 text-center">
                          <Badge variant={p.estado === "saldado" ? "outline" : "secondary"} className="text-[10px]">
                            {p.estado || "—"}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Asiento Contable */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Asiento Contable (Comprobante de Ingreso)
                </h4>
                {comprobante && (
                  <Badge variant="outline" className="font-mono text-xs">
                    {comprobante.numero}
                  </Badge>
                )}
                {loadingComp && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
              </div>
              {abono.comprobante_id && (
                <Link
                  to={`/admin/contabilidad/libro-diario?comprobante_id=${abono.comprobante_id}`}
                  className="text-xs text-primary hover:underline flex items-center gap-1 font-medium"
                >
                  Abrir en Libro Diario <ExternalLink className="w-3 h-3" />
                </Link>
              )}
            </div>

            {loadingComp ? (
              <div className="py-6 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Cargando asiento contable...
              </div>
            ) : movimientos.length === 0 ? (
              <div className="p-4 border rounded-md text-xs text-center text-muted-foreground bg-muted/10">
                No se encontraron movimientos contables registrados para este abono.
              </div>
            ) : (
              <div className="border rounded-md overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 border-b text-left text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Subcuenta</th>
                      <th className="px-3 py-2 font-medium">Nombre de Cuenta</th>
                      <th className="px-3 py-2 font-medium">Descripción</th>
                      <th className="px-3 py-2 font-medium">Tercero</th>
                      <th className="px-3 py-2 font-medium text-right">Débito</th>
                      <th className="px-3 py-2 font-medium text-right">Crédito</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40 font-mono">
                    {movimientos.map((m) => (
                      <tr key={m.id} className="hover:bg-muted/20">
                        <td className="px-3 py-1.5 text-primary font-semibold">{m.subcuenta}</td>
                        <td className="px-3 py-1.5 font-sans">{m.cuenta_nombre || "—"}</td>
                        <td className="px-3 py-1.5 font-sans text-muted-foreground truncate max-w-[200px]">{m.descripcion || "—"}</td>
                        <td className="px-3 py-1.5 font-sans text-muted-foreground">{m.tercero || "—"}</td>
                        <td className="px-3 py-1.5 text-right">{Number(m.debito) > 0 ? formatCOP(m.debito) : "—"}</td>
                        <td className="px-3 py-1.5 text-right">{Number(m.credito) > 0 ? formatCOP(m.credito) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t bg-muted/30 font-mono font-semibold">
                    <tr>
                      <td colSpan={4} className="px-3 py-2 text-right font-sans text-xs">
                        Totales del Asiento Contable:
                      </td>
                      <td className="px-3 py-2 text-right text-xs">{formatCOP(totalDebito)}</td>
                      <td className="px-3 py-2 text-right text-xs">{formatCOP(totalCredito)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {movimientos.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs mt-1.5">
                {cuadrado ? (
                  <span className="text-success flex items-center gap-1 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Asiento cuadrado (Partida doble verificada)
                  </span>
                ) : (
                  <span className="text-destructive flex items-center gap-1 font-medium">
                    <AlertTriangle className="w-3.5 h-3.5" /> Asiento con diferencia: {formatCOP(Math.abs(totalDebito - totalCredito))}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between border-t pt-3">
          <div className="text-xs text-muted-foreground font-mono">
            ID: {abono.id}
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
