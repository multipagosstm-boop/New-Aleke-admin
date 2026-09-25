import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Pencil, Trash2, Wallet } from "lucide-react";
import { formatCOP, formatDate } from "@/lib/contabilidad";
import AmortizacionTable from "@/components/pakredito/AmortizacionTable";
import EditarPrestamoDialog from "@/components/pakredito/EditarPrestamoDialog";
import EditarDesembolsoDialog from "@/components/pakredito/EditarDesembolsoDialog";
import ConfirmMotivoDialog from "@/components/pakredito/ConfirmMotivoDialog";
import { useToast } from "@/components/ui/use-toast";

const ESTADO_VARIANT = { vigente: "secondary", saldado: "outline", en_mora: "destructive", refinanciado: "secondary" };

export default function PrestamoDetail({ open, onOpenChange, prestamo, clienteNombre, onChanged }) {
  const [cuotas, setCuotas] = useState([]);
  const [abonos, setAbonos] = useState([]);
  const [editOpen, setEditOpen] = useState(false);
  const [editDesembolsoOpen, setEditDesembolsoOpen] = useState(false);
  const [deletePrestamoOpen, setDeletePrestamoOpen] = useState(false);
  const [deleteAbonoId, setDeleteAbonoId] = useState(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!open || !prestamo) return;
    base44.entities.CuotaAmortizacion.filter({ prestamo_id: prestamo.id })
      .then((c) => setCuotas(c.sort((a, b) => a.numero - b.numero))).catch(() => setCuotas([]));
    cargarAbonos();
  }, [open, prestamo]);

  const cargarAbonos = () => {
    if (!prestamo) return;
    base44.entities.AbonoPrestamo.filter({ cliente_id: prestamo.cliente_id })
      .then((all) => setAbonos(all.filter((a) => (a.detalles || []).some((d) => d.prestamo_id === prestamo.id))))
      .catch(() => setAbonos([]));
  };

  const eliminarAbono = async (motivo) => {
    await base44.functions.invoke("gestionarPakredito", { accion: "eliminarAbono", abono_id: deleteAbonoId, motivo });
    toast({ title: "Abono eliminado", description: "Se revirtió el comprobante y el estado del préstamo." });
    cargarAbonos();
    onChanged?.();
  };

  const eliminarPrestamo = async (motivo) => {
    await base44.functions.invoke("gestionarPakredito", { accion: "eliminarPrestamo", prestamo_id: prestamo.id, motivo });
    toast({ title: "Préstamo eliminado", description: `Se anuló el comprobante de desembolso de ${prestamo.codigo}.` });
    onChanged?.();
    onOpenChange(false);
  };

  if (!prestamo) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between gap-2">
              <DialogTitle className="flex items-center gap-2">
                Préstamo {prestamo.codigo}
                <Badge variant={ESTADO_VARIANT[prestamo.estado] || "outline"} className="text-[10px]">{prestamo.estado}</Badge>
              </DialogTitle>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditOpen(true)} disabled={false}><Pencil className="w-4 h-4 mr-1" /> Editar</Button>
                <Button size="sm" variant="outline" onClick={() => setEditDesembolsoOpen(true)} title={abonos.length ? "Elimine primero los abonos" : "Corregir asiento de desembolso"}><Wallet className="w-4 h-4 mr-1" /> Editar desembolso</Button>
                <Button size="sm" variant="destructive" onClick={() => setDeletePrestamoOpen(true)}><Trash2 className="w-4 h-4 mr-1" /> Eliminar</Button>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <Campo label="Cliente" value={clienteNombre} />
              <Campo label="Modelo" value={prestamo.modelo === "cuota_fija" ? "Cuota Fija" : "Mes Vencido"} />
              <Campo label="Capital" value={formatCOP(prestamo.capital)} />
              <Campo label="Saldo capital" value={formatCOP(prestamo.saldo_capital)} />
              <Campo label="Tasa nominal mens." value={(prestamo.tasa_nominal * 100).toFixed(2) + "%"} />
              <Campo label={`Tasa efectiva ${prestamo.modelo === "cuota_fija" ? (prestamo.periodo || "mensual") : "mensual"}`} value={(prestamo.tasa_efectiva_periodo * 100).toFixed(4) + "%"} />
              {prestamo.modelo === "cuota_fija" && <Campo label="Cuota fija" value={formatCOP(prestamo.cuota_fija)} />}
              <Campo label="N° cuotas" value={prestamo.numero_cuotas} />
              <Campo label="Total intereses" value={formatCOP(prestamo.total_intereses)} />
              <Campo label="Total a pagar" value={formatCOP(prestamo.total_a_pagar)} />
              {prestamo.modelo === "mes_vencido" && <Campo label="Intereses pendientes" value={formatCOP(prestamo.saldo_intereses || 0)} />}
              <Campo label="Fecha préstamo" value={formatDate(prestamo.fecha_prestamo)} />
              <Campo label="Próximo pago" value={formatDate(prestamo.fecha_proximo_pago)} />
              {prestamo.comprobante_id && (
                <div className="col-span-2 md:col-span-1">
                  <div className="text-[10px] uppercase text-muted-foreground">Comprobante</div>
                  <Link to={`/admin/contabilidad/libro-diario?comprobante_id=${prestamo.comprobante_id}`} className="text-primary hover:underline text-sm">Ver asiento</Link>
                </div>
              )}
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-2 uppercase text-muted-foreground">Amortización</h3>
              <AmortizacionTable cuotas={cuotas} modelo={prestamo.modelo} />
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-2 uppercase text-muted-foreground">Abonos aplicados</h3>
              {abonos.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sin abonos registrados.</p>
              ) : (
                <div className="border border-border rounded-lg overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 border-b text-left text-muted-foreground uppercase">
                      <tr>
                        <th className="px-2 py-2 font-medium">Fecha</th>
                        <th className="px-2 py-2 font-medium text-right">Abono</th>
                        <th className="px-2 py-2 font-medium text-right">Intereses</th>
                        <th className="px-2 py-2 font-medium text-right">Capital</th>
                        <th className="px-2 py-2 font-medium">Comprobante</th>
                        <th className="px-2 py-2 font-medium w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {abonos.map((a) => {
                        const d = (a.detalles || []).find((x) => x.prestamo_id === prestamo.id) || {};
                        return (
                          <tr key={a.id} className="border-b border-border/40">
                            <td className="px-2 py-1.5 font-mono">{formatDate(a.fecha)}</td>
                            <td className="px-2 py-1.5 text-right font-mono">{formatCOP(d.valor_aplicado || 0)}</td>
                            <td className="px-2 py-1.5 text-right font-mono">{formatCOP(d.intereses || 0)}</td>
                            <td className="px-2 py-1.5 text-right font-mono">{formatCOP(d.capital || 0)}</td>
                            <td className="px-2 py-1.5">{a.comprobante_id ? <Link to={`/admin/contabilidad/libro-diario?comprobante_id=${a.comprobante_id}`} className="text-primary hover:underline">Ver</Link> : "—"}</td>
                            <td className="px-2 py-1.5 text-center">
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setDeleteAbonoId(a.id)} title="Eliminar abono">
                                <Trash2 className="w-3.5 h-3.5 text-destructive" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <EditarPrestamoDialog open={editOpen} onOpenChange={setEditOpen} onSaved={() => { onChanged?.(); }} prestamo={prestamo} />
      <EditarDesembolsoDialog open={editDesembolsoOpen} onOpenChange={setEditDesembolsoOpen} onSaved={() => { onChanged?.(); }} prestamo={prestamo} />
      <ConfirmMotivoDialog open={deletePrestamoOpen} onOpenChange={setDeletePrestamoOpen}
        title="Eliminar préstamo"
        description={`Se anulará el comprobante de desembolso (nota crédito) y se eliminarán las cuotas y el registro ${prestamo.codigo}. Esta acción no se puede deshacer.`}
        onConfirm={eliminarPrestamo} />
      <ConfirmMotivoDialog open={!!deleteAbonoId} onOpenChange={(v) => !v && setDeleteAbonoId(null)}
        title="Eliminar abono"
        description="Se anulará el comprobante del abono (nota crédito) y se restaurará el estado del préstamo (saldos, cuotas e intereses)."
        onConfirm={eliminarAbono} />
    </>
  );
}

function Campo({ label, value }) {
  return (
    <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="font-medium text-sm truncate">{value ?? "—"}</div>
    </div>
  );
}