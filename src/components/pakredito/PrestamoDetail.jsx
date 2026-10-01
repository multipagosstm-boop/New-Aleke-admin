import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Pencil, Trash2, Wallet, Receipt, Eye, ChevronDown, ChevronUp, ExternalLink, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { formatCOP, formatDate } from "@/lib/contabilidad";
import AmortizacionTable from "@/components/pakredito/AmortizacionTable";
import EditarPrestamoDialog from "@/components/pakredito/EditarPrestamoDialog";
import EditarDesembolsoDialog from "@/components/pakredito/EditarDesembolsoDialog";
import ConfirmMotivoDialog from "@/components/pakredito/ConfirmMotivoDialog";
import AbonoDetailDialog from "@/components/pakredito/AbonoDetailDialog";
import EditarAbonoDialog from "@/components/pakredito/EditarAbonoDialog";
import { useToast } from "@/components/ui/use-toast";

const ESTADO_VARIANT = { vigente: "secondary", saldado: "outline", en_mora: "destructive", refinanciado: "secondary" };

const parseDet = (d) => {
  if (Array.isArray(d)) return d;
  if (typeof d === "string") {
    try { return JSON.parse(d); } catch { return []; }
  }
  if (typeof d === "object" && d !== null) {
    return Object.values(d);
  }
  return [];
};

export default function PrestamoDetail({
  open,
  onOpenChange,
  prestamo,
  clienteNombre,
  prestamos = [],
  clientes = [],
  onChanged
}) {
  const [cuotas, setCuotas] = useState([]);
  const [abonos, setAbonos] = useState([]);
  const [loadingAbonos, setLoadingAbonos] = useState(false);
  const [expandedAbonoId, setExpandedAbonoId] = useState(null);
  const [asientoCache, setAsientoCache] = useState({});
  const [currentPrestamo, setCurrentPrestamo] = useState(prestamo);

  const [editOpen, setEditOpen] = useState(false);
  const [editDesembolsoOpen, setEditDesembolsoOpen] = useState(false);
  const [deletePrestamoOpen, setDeletePrestamoOpen] = useState(false);
  const [deleteAbonoId, setDeleteAbonoId] = useState(null);
  const [viewAbono, setViewAbono] = useState(null);
  const [editAbono, setEditAbono] = useState(null);
  const { toast } = useToast();

  useEffect(() => {
    setCurrentPrestamo(prestamo);
  }, [prestamo]);

  useEffect(() => {
    if (!open || !currentPrestamo) return;
    base44.entities.CuotaAmortizacion.filter({ prestamo_id: currentPrestamo.id })
      .then((c) => setCuotas((c || []).sort((a, b) => a.numero - b.numero)))
      .catch(() => setCuotas([]));
    cargarAbonos();
  }, [open, currentPrestamo?.id]);

  const cargarAbonos = async () => {
    if (!currentPrestamo) return;
    setLoadingAbonos(true);
    try {
      const all = await base44.entities.AbonoPrestamo.list("-fecha", 1000);
      const pId = String(currentPrestamo.id).trim();
      const pCodigo = currentPrestamo.codigo ? String(currentPrestamo.codigo).trim().toLowerCase() : "";
      
      const filtrados = (all || []).filter((a) => {
        const dList = parseDet(a.detalles);
        return dList.some((d) => 
          String(d.prestamo_id).trim() === pId ||
          (d.codigo && String(d.codigo).trim().toLowerCase() === pCodigo)
        );
      });
      setAbonos(filtrados);
    } catch (e) {
      console.error("Error al cargar abonos:", e);
      setAbonos([]);
    } finally {
      setLoadingAbonos(false);
    }
  };

  const toggleAsiento = async (abono) => {
    if (expandedAbonoId === abono.id) {
      setExpandedAbonoId(null);
      return;
    }

    setExpandedAbonoId(abono.id);

    if (!abono.comprobante_id) {
      setAsientoCache((prev) => ({
        ...prev,
        [abono.id]: { comp: null, movs: [], loaded: true, error: "Sin comprobante vinculado" }
      }));
      return;
    }

    if (!asientoCache[abono.id]?.loaded) {
      setAsientoCache((prev) => ({
        ...prev,
        [abono.id]: { comp: null, movs: [], loading: true }
      }));

      try {
        const [comp, movs] = await Promise.all([
          base44.entities.ComprobanteContable.get(abono.comprobante_id),
          base44.entities.MovimientoContable.filter({ comprobante_id: abono.comprobante_id })
        ]);

        setAsientoCache((prev) => ({
          ...prev,
          [abono.id]: {
            comp,
            movs: (movs || []).filter((m) => m.estado !== "inactivo"),
            loaded: true,
            loading: false
          }
        }));
      } catch (err) {
        console.error("Error cargando asiento contable:", err);
        setAsientoCache((prev) => ({
          ...prev,
          [abono.id]: {
            comp: null,
            movs: [],
            loaded: true,
            loading: false,
            error: "Error al cargar movimientos contables"
          }
        }));
      }
    }
  };

  const eliminarAbono = async (motivo) => {
    if (!deleteAbonoId) return;
    try {
      const res = await base44.functions.invoke("gestionarPakredito", {
        accion: "eliminarAbono",
        abono_id: deleteAbonoId,
        motivo: motivo || "Eliminación de abono desde ficha de crédito"
      });

      const r = res?.data || res;
      if (r?.success === false || r?.error) {
        throw new Error(r?.error || "No se pudo eliminar el abono");
      }

      toast({
        title: "Abono eliminado con éxito",
        description: "Se anuló el comprobante contable y se restableció el saldo y cuotas del crédito."
      });

      setDeleteAbonoId(null);
      if (expandedAbonoId === deleteAbonoId) {
        setExpandedAbonoId(null);
      }

      // Recargar abonos
      await cargarAbonos();

      // Recargar el préstamo actualizado y cuotas
      const [updatedP, updatedCuotas] = await Promise.all([
        base44.entities.Prestamo.get(currentPrestamo.id),
        base44.entities.CuotaAmortizacion.filter({ prestamo_id: currentPrestamo.id })
      ]);

      if (updatedP) {
        setCurrentPrestamo(updatedP);
      }
      setCuotas((updatedCuotas || []).sort((a, b) => a.numero - b.numero));

      onChanged?.();
    } catch (err) {
      console.error("Error al eliminar abono:", err);
      toast({
        variant: "destructive",
        title: "Error al eliminar abono",
        description: err.message || "Ocurrió un error inesperado al eliminar el abono"
      });
      throw err;
    }
  };

  const eliminarPrestamo = async (motivo) => {
    try {
      const res = await base44.functions.invoke("gestionarPakredito", {
        accion: "eliminarPrestamo",
        prestamo_id: currentPrestamo.id,
        motivo
      });
      const r = res?.data || res;
      if (r?.success === false || r?.error) {
        throw new Error(r?.error || "No se pudo eliminar el préstamo");
      }
      toast({
        title: "Préstamo eliminado",
        description: `Se anuló el comprobante de desembolso de ${currentPrestamo.codigo}.`
      });
      setDeletePrestamoOpen(false);
      onChanged?.();
      onOpenChange(false);
    } catch (err) {
      console.error("Error al eliminar préstamo:", err);
      toast({
        variant: "destructive",
        title: "Error al eliminar préstamo",
        description: err.message || "No se pudo eliminar el préstamo"
      });
      throw err;
    }
  };

  const handleAbonoSaved = async () => {
    setEditAbono(null);
    await cargarAbonos();
    const [updatedP, updatedCuotas] = await Promise.all([
      base44.entities.Prestamo.get(currentPrestamo.id),
      base44.entities.CuotaAmortizacion.filter({ prestamo_id: currentPrestamo.id })
    ]);
    if (updatedP) {
      setCurrentPrestamo(updatedP);
    }
    setCuotas((updatedCuotas || []).sort((a, b) => a.numero - b.numero));
    onChanged?.();
  };

  if (!currentPrestamo) return null;

  const allPrestamosList = prestamos && prestamos.length > 0 ? prestamos : [currentPrestamo];
  const allClientesList = clientes && clientes.length > 0 ? clientes : [{ id: currentPrestamo.cliente_id, nombre: clienteNombre }];

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between gap-2">
              <DialogTitle className="flex items-center gap-2">
                Préstamo {currentPrestamo.codigo}
                <Badge variant={ESTADO_VARIANT[currentPrestamo.estado] || "outline"} className="text-[10px]">
                  {currentPrestamo.estado}
                </Badge>
              </DialogTitle>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
                  <Pencil className="w-4 h-4 mr-1" /> Editar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditDesembolsoOpen(true)}
                  title={abonos.length ? "Elimine primero los abonos" : "Corregir asiento de desembolso"}
                >
                  <Wallet className="w-4 h-4 mr-1" /> Editar desembolso
                </Button>
                <Button size="sm" variant="destructive" onClick={() => setDeletePrestamoOpen(true)}>
                  <Trash2 className="w-4 h-4 mr-1" /> Eliminar
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <Campo label="Cliente" value={clienteNombre} />
              <Campo label="Modelo" value={currentPrestamo.modelo === "cuota_fija" ? "Cuota Fija" : "Mes Vencido"} />
              <Campo label="Capital" value={formatCOP(currentPrestamo.capital)} />
              <Campo label="Saldo capital" value={formatCOP(currentPrestamo.saldo_capital)} />
              <Campo label="Tasa nominal mens." value={(currentPrestamo.tasa_nominal * 100).toFixed(2) + "%"} />
              <Campo
                label={`Tasa efectiva ${currentPrestamo.modelo === "cuota_fija" ? (currentPrestamo.periodo || "mensual") : "mensual"}`}
                value={(currentPrestamo.tasa_efectiva_periodo * 100).toFixed(4) + "%"}
              />
              {currentPrestamo.modelo === "cuota_fija" && <Campo label="Cuota fija" value={formatCOP(currentPrestamo.cuota_fija)} />}
              <Campo label="N° cuotas" value={currentPrestamo.numero_cuotas} />
              <Campo label="Total intereses" value={formatCOP(currentPrestamo.total_intereses)} />
              <Campo label="Total a pagar" value={formatCOP(currentPrestamo.total_a_pagar)} />
              {currentPrestamo.modelo === "mes_vencido" && (
                <Campo label="Intereses pendientes" value={formatCOP(currentPrestamo.saldo_intereses || 0)} />
              )}
              <Campo label="Fecha préstamo" value={formatDate(currentPrestamo.fecha_prestamo)} />
              <Campo label="Próximo pago" value={formatDate(currentPrestamo.fecha_proximo_pago)} />
              {currentPrestamo.comprobante_id && (
                <div className="col-span-2 md:col-span-1 rounded-md border border-border bg-muted/20 px-3 py-2">
                  <div className="text-[10px] uppercase text-muted-foreground">Comprobante Desembolso</div>
                  <Link
                    to={`/admin/contabilidad/libro-diario?comprobante_id=${currentPrestamo.comprobante_id}`}
                    className="text-primary hover:underline text-xs flex items-center gap-1 font-medium mt-0.5"
                  >
                    Ver asiento contable <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
              )}
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-2 uppercase text-muted-foreground">Amortización</h3>
              <AmortizacionTable cuotas={cuotas} modelo={currentPrestamo.modelo} />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold uppercase text-muted-foreground flex items-center gap-2">
                  Abonos aplicados ({abonos.length})
                  {loadingAbonos && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
                </h3>
              </div>

              {abonos.length === 0 ? (
                <div className="border border-dashed rounded-lg p-6 text-center text-xs text-muted-foreground">
                  Sin abonos registrados para este préstamo.
                </div>
              ) : (
                <div className="border border-border rounded-lg overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 border-b text-left text-muted-foreground uppercase">
                      <tr>
                        <th className="px-3 py-2 font-medium">Fecha</th>
                        <th className="px-3 py-2 font-medium text-right">Abono</th>
                        <th className="px-3 py-2 font-medium text-right">Intereses</th>
                        <th className="px-3 py-2 font-medium text-right">Capital</th>
                        <th className="px-3 py-2 font-medium text-center">Asiento</th>
                        <th className="px-3 py-2 font-medium text-center w-32">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {abonos.map((a) => {
                        const dList = parseDet(a.detalles);
                        const d = dList.find(
                          (x) =>
                            String(x.prestamo_id).trim() === String(currentPrestamo.id).trim() ||
                            (x.codigo && String(x.codigo).trim().toLowerCase() === String(currentPrestamo.codigo).trim().toLowerCase())
                        ) || {};
                        const isExpanded = expandedAbonoId === a.id;
                        const asiento = asientoCache[a.id];

                        return (
                          <React.Fragment key={a.id}>
                            <tr className={`border-b border-border/40 hover:bg-muted/20 transition-colors ${isExpanded ? "bg-muted/30" : ""}`}>
                              <td className="px-3 py-2 font-mono font-medium">{formatDate(a.fecha)}</td>
                              <td className="px-3 py-2 text-right font-mono font-bold text-foreground">
                                {formatCOP(d.valor_aplicado || a.valor_total || 0)}
                              </td>
                              <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                                {formatCOP(d.intereses || 0)}
                              </td>
                              <td className="px-3 py-2 text-right font-mono text-primary font-medium">
                                {formatCOP(d.capital !== undefined ? d.capital : Math.max(0, (d.valor_aplicado || 0) - (d.intereses || 0)))}
                              </td>
                              <td className="px-3 py-2 text-center">
                                <Button
                                  size="sm"
                                  variant={isExpanded ? "secondary" : "outline"}
                                  className="h-6 text-[11px] px-2 text-primary"
                                  onClick={() => toggleAsiento(a)}
                                >
                                  <Receipt className="w-3 h-3 mr-1" />
                                  {isExpanded ? "Ocultar asiento" : "Ver asiento"}
                                  {isExpanded ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />}
                                </Button>
                              </td>
                              <td className="px-3 py-2 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                    onClick={() => setViewAbono(a)}
                                    title="Ver detalle del abono y asiento contable"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                    onClick={() => setEditAbono(a)}
                                    title="Modificar abono"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 text-destructive hover:bg-destructive/10"
                                    onClick={() => setDeleteAbonoId(a.id)}
                                    title="Eliminar abono"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              </td>
                            </tr>

                            {/* Desglose inline del asiento contable */}
                            {isExpanded && (
                              <tr className="bg-muted/15 border-b border-border/60">
                                <td colSpan={6} className="p-3">
                                  <div className="rounded-lg border border-border/60 bg-background/90 p-3 space-y-2.5">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <div className="flex items-center gap-2">
                                        <Receipt className="w-4 h-4 text-primary" />
                                        <span className="font-semibold text-xs">
                                          Asiento Contable: {asiento?.comp?.numero ? `Comprobante ${asiento.comp.numero}` : "Comprobante de Ingreso"}
                                        </span>
                                        {asiento?.comp && (
                                          <Badge variant={asiento.comp.estado === "contabilizado" ? "default" : "destructive"} className="text-[10px] px-1.5 py-0">
                                            {asiento.comp.estado}
                                          </Badge>
                                        )}
                                      </div>

                                      <div className="flex items-center gap-2">
                                        {a.comprobante_id && (
                                          <Link
                                            to={`/admin/contabilidad/libro-diario?comprobante_id=${a.comprobante_id}`}
                                            className="text-xs text-primary hover:underline flex items-center gap-1 font-medium mr-2"
                                          >
                                            Ver en Libro Diario <ExternalLink className="w-3 h-3" />
                                          </Link>
                                        )}
                                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setViewAbono(a)}>
                                          <Eye className="w-3.5 h-3.5 mr-1" /> Detalle completo
                                        </Button>
                                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditAbono(a)}>
                                          <Pencil className="w-3.5 h-3.5 mr-1" /> Modificar
                                        </Button>
                                        <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => setDeleteAbonoId(a.id)}>
                                          <Trash2 className="w-3.5 h-3.5 mr-1" /> Eliminar
                                        </Button>
                                      </div>
                                    </div>

                                    {asiento?.loading ? (
                                      <div className="py-4 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                                        <Loader2 className="w-4 h-4 animate-spin text-primary" /> Cargando asiento contable...
                                      </div>
                                    ) : asiento?.error ? (
                                      <div className="p-3 text-xs text-destructive bg-destructive/10 rounded border border-destructive/20">
                                        {asiento.error}
                                      </div>
                                    ) : asiento?.movs && asiento.movs.length > 0 ? (
                                      <div className="space-y-1.5">
                                        <div className="border rounded overflow-hidden">
                                          <table className="w-full text-xs">
                                            <thead className="bg-muted/60 text-muted-foreground border-b text-left">
                                              <tr>
                                                <th className="px-2.5 py-1.5 font-medium">Subcuenta</th>
                                                <th className="px-2.5 py-1.5 font-medium">Cuenta</th>
                                                <th className="px-2.5 py-1.5 font-medium">Concepto</th>
                                                <th className="px-2.5 py-1.5 font-medium">Tercero</th>
                                                <th className="px-2.5 py-1.5 font-medium text-right">Débito</th>
                                                <th className="px-2.5 py-1.5 font-medium text-right">Crédito</th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border/30 font-mono">
                                              {asiento.movs.map((m) => (
                                                <tr key={m.id} className="hover:bg-muted/20">
                                                  <td className="px-2.5 py-1 text-primary font-semibold">{m.subcuenta}</td>
                                                  <td className="px-2.5 py-1 font-sans text-foreground">{m.cuenta_nombre || "—"}</td>
                                                  <td className="px-2.5 py-1 font-sans text-muted-foreground truncate max-w-[200px]">{m.descripcion || "—"}</td>
                                                  <td className="px-2.5 py-1 font-sans text-muted-foreground">{m.tercero || "—"}</td>
                                                  <td className="px-2.5 py-1 text-right">{Number(m.debito) > 0 ? formatCOP(m.debito) : "—"}</td>
                                                  <td className="px-2.5 py-1 text-right">{Number(m.credito) > 0 ? formatCOP(m.credito) : "—"}</td>
                                                </tr>
                                              ))}
                                            </tbody>
                                            <tfoot className="bg-muted/40 font-semibold border-t">
                                              <tr>
                                                <td colSpan={4} className="px-2.5 py-1 text-right font-sans">
                                                  Sumas iguales:
                                                </td>
                                                <td className="px-2.5 py-1 text-right font-mono">
                                                  {formatCOP(asiento.movs.reduce((s, m) => s + (Number(m.debito) || 0), 0))}
                                                </td>
                                                <td className="px-2.5 py-1 text-right font-mono">
                                                  {formatCOP(asiento.movs.reduce((s, m) => s + (Number(m.credito) || 0), 0))}
                                                </td>
                                              </tr>
                                            </tfoot>
                                          </table>
                                        </div>

                                        <div className="flex items-center gap-1.5 text-[11px]">
                                          {Math.abs(
                                            asiento.movs.reduce((s, m) => s + (Number(m.debito) || 0), 0) -
                                            asiento.movs.reduce((s, m) => s + (Number(m.credito) || 0), 0)
                                          ) < 0.01 ? (
                                            <span className="text-success flex items-center gap-1 font-medium">
                                              <CheckCircle2 className="w-3.5 h-3.5" /> Partida doble verificada (Asiento cuadrado)
                                            </span>
                                          ) : (
                                            <span className="text-destructive flex items-center gap-1 font-medium">
                                              <AlertTriangle className="w-3.5 h-3.5" /> Diferencia detectada en el asiento
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="py-2 text-xs text-muted-foreground text-center">
                                        No se encontraron líneas de movimiento contable para este abono.
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
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

      <EditarPrestamoDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={async () => {
          const updatedP = await base44.entities.Prestamo.get(currentPrestamo.id);
          if (updatedP) setCurrentPrestamo(updatedP);
          onChanged?.();
        }}
        prestamo={currentPrestamo}
      />

      <EditarDesembolsoDialog
        open={editDesembolsoOpen}
        onOpenChange={setEditDesembolsoOpen}
        onSaved={async () => {
          const updatedP = await base44.entities.Prestamo.get(currentPrestamo.id);
          if (updatedP) setCurrentPrestamo(updatedP);
          onChanged?.();
        }}
        prestamo={currentPrestamo}
      />
      
      <AbonoDetailDialog
        open={!!viewAbono}
        onOpenChange={(v) => !v && setViewAbono(null)}
        abono={viewAbono}
        prestamos={allPrestamosList}
        clientes={allClientesList}
        onEdit={(ab) => {
          setViewAbono(null);
          setEditAbono(ab);
        }}
        onDelete={(ab) => {
          setViewAbono(null);
          setDeleteAbonoId(ab.id);
        }}
      />

      <EditarAbonoDialog
        open={!!editAbono}
        onOpenChange={(v) => !v && setEditAbono(null)}
        abono={editAbono}
        prestamos={allPrestamosList}
        clientes={allClientesList}
        onSaved={handleAbonoSaved}
      />

      <ConfirmMotivoDialog
        open={deletePrestamoOpen}
        onOpenChange={setDeletePrestamoOpen}
        title="Eliminar préstamo"
        description={`Se anulará el comprobante de desembolso (nota crédito) y se eliminarán las cuotas y el registro ${currentPrestamo.codigo}. Esta acción no se puede deshacer.`}
        onConfirm={eliminarPrestamo}
      />

      <ConfirmMotivoDialog
        open={!!deleteAbonoId}
        onOpenChange={(v) => !v && setDeleteAbonoId(null)}
        title="Eliminar abono de crédito"
        description="Se anulará el comprobante del abono (nota crédito o anulación) y se restaurará el saldo de capital y las cuotas de amortización del crédito automáticamente."
        onConfirm={eliminarAbono}
      />
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