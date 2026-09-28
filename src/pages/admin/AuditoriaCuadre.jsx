import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertTriangle, Search, Loader2, CheckCircle2, FileWarning, Edit, Ban, RefreshCw } from "lucide-react";
import ComprobanteForm from "@/components/admin/ComprobanteForm";

const ISSUE_LABELS = {
  sin_movimientos: "Sin movimientos",
  descuadre_interno: "Movimientos no cuadran",
  total_debito_no_coincide: "Total débito no coincide",
  total_credito_no_coincide: "Total crédito no coincide",
  comprobante_no_cuadrado: "Comprobante no cuadrado"
};

function fmt(n) {
  const v = Number(n) || 0;
  return v.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 2 });
}

export default function AuditoriaCuadre() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [expandido, setExpandido] = useState({});

  // Soporte para editar/anular
  const [pucTransaccional, setPucTransaccional] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [cuentasAhorro, setCuentasAhorro] = useState([]);
  const [productosCredito, setProductosCredito] = useState([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editingComp, setEditingComp] = useState(null);
  const [editingMovs, setEditingMovs] = useState([]);
  const [cargandoEdicion, setCargandoEdicion] = useState(null);
  const [anularDialog, setAnularDialog] = useState(null);
  const [motivoAnulacion, setMotivoAnulacion] = useState("");
  const [anulando, setAnulando] = useState(false);
  const [recalculandoId, setRecalculandoId] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [puc, clis, cdas, prods] = await Promise.all([
          base44.entities.Cuenta.filter({ es_transaccional: true }, "codigo", 300),
          base44.entities.Cliente.list(),
          base44.entities.CuentaAhorro.list(),
          base44.entities.ProductoCredito.list()
        ]);
        setPucTransaccional(puc);
        setClientes(clis);
        setCuentasAhorro(cdas);
        setProductosCredito(prods);
      } catch (e) { console.error(e); }
    })();
  }, []);

  async function auditar() {
    setLoading(true);
    setError(null);
    try {
      const res = await base44.functions.invoke("auditarCuadre", {});
      setData(res.data || res);
    } catch (e) {
      setError(e.message || "Error al auditar");
    } finally {
      setLoading(false);
    }
  }

  const toggle = (id) => setExpandido((p) => ({ ...p, [id]: !p[id] }));

  async function handleEditar(d) {
    setCargandoEdicion(d.comprobante_id);
    try {
      const [comp, movs] = await Promise.all([
        base44.entities.ComprobanteContable.get(d.comprobante_id),
        base44.entities.MovimientoContable.filter({ comprobante_id: d.comprobante_id })
      ]);
      setEditingComp(comp);
      setEditingMovs(movs);
      setFormOpen(true);
    } catch (e) {
      alert("Error al cargar el comprobante: " + (e.message || e));
    } finally {
      setCargandoEdicion(null);
    }
  }

  async function handleAnular() {
    if (!motivoAnulacion.trim() || !anularDialog) return;
    setAnulando(true);
    try {
      await base44.functions.invoke("anularComprobante", {
        comprobante_id: anularDialog.id,
        motivo: motivoAnulacion.trim()
      });
      setAnularDialog(null);
      setMotivoAnulacion("");
      auditar();
    } catch (e) {
      alert("Error: " + (e.message || e));
    } finally {
      setAnulando(false);
    }
  }

  function onSaved() {
    setFormOpen(false);
    setEditingComp(null);
    setEditingMovs([]);
    auditar();
  }

  async function handleRecalcular(d) {
    setRecalculandoId(d.comprobante_id);
    try {
      const res = await base44.functions.invoke("recalcularTotalesComprobante", { comprobante_id: d.comprobante_id });
      const r = res.data || res;
      if (r.error) throw new Error(r.error);
      const msg = `${r.numero}: D ${fmt(r.total_debito_nuevo)} / C ${fmt(r.total_credito_nuevo)}${Math.abs(r.diferencia_interna) <= 0.005 ? " · cuadrado ✓" : " · sigue descuadrado"}`;
      alert("Totales recalculados.\n" + msg);
      auditar();
    } catch (e) {
      alert("Error: " + (e.message || e));
    } finally {
      setRecalculandoId(null);
    }
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Auditoría de Cuadre</h1>
          <p className="text-sm text-muted-foreground">
            Detecta comprobantes descuadrados y localiza la línea singular del error.
          </p>
        </div>
        <Button onClick={auditar} disabled={loading}>
          {loading ? <Loader2 className="animate-spin" /> : <Search />}
          {loading ? "Auditando..." : "Auditar ahora"}
        </Button>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <ResumenCard label="Comprobantes" value={data.resumen.total_comprobantes} />
            <ResumenCard label="Cuadrados" value={data.resumen.cuadrados} ok />
            <ResumenCard label="Descuadrados" value={data.resumen.descuadrados} warn />
            <ResumenCard
              label="Diferencia neta"
              value={fmt(data.resumen.diferencia_neta !== undefined ? data.resumen.diferencia_neta : (data.resumen.diferencia_neta_credito - data.resumen.diferencia_neta_debito))}
              ok={Math.abs(data.resumen.diferencia_neta || 0) < 1}
              warn={Math.abs(data.resumen.diferencia_neta || 0) >= 1}
            />
          </div>

          {data.huerfanos?.length > 0 && (
            <Card className="border-warning">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-warning">
                  <FileWarning /> Movimientos huérfanos ({data.huerfanos.length})
                </CardTitle>
                <CardDescription>Movimientos activos sin comprobante contabilizado.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-1 text-sm">
                  {data.huerfanos.map((h, idx) => (
                    <div key={h.comprobante_id ? `${h.comprobante_id}_${idx}` : `huerfano_${idx}`} className="flex justify-between">
                      <span className="font-mono text-xs">{h.comprobante_id}</span>
                      <span>{h.cantidad_lineas} líneas · {fmt(h.total_debito)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle /> Descuadres detectados ({data.descuadres.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.descuadres.length === 0 && (
                <div className="flex items-center gap-2 text-success">
                  <CheckCircle2 /> Todos los comprobantes están cuadrados.
                </div>
              )}
              {data.descuadres.map((d, idx) => (
                <div key={d.comprobante_id ? `${d.comprobante_id}_${idx}` : `descuadre_${idx}`} className="border rounded-lg p-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-mono font-semibold">{d.numero}</span>
                      <span className="text-xs text-muted-foreground ml-2">{d.tipo} · {d.fecha}</span>
                      <div className="text-sm">{d.descripcion}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      {d.issues.map((i) => (
                        <Badge key={i} variant="destructive">{ISSUE_LABELS[i] || i}</Badge>
                      ))}
                      <Button size="sm" variant="outline" onClick={() => handleEditar(d)} disabled={cargandoEdicion === d.comprobante_id}>
                        {cargandoEdicion === d.comprobante_id ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Edit className="w-3 h-3 mr-1" />}
                        Editar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleRecalcular(d)} disabled={recalculandoId === d.comprobante_id}>
                        {recalculandoId === d.comprobante_id ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
                        Recalcular totales
                      </Button>
                      <Button size="sm" variant="outline" className="text-destructive" onClick={() => { setAnularDialog({ id: d.comprobante_id, numero: d.numero }); setMotivoAnulacion(""); }}>
                        <Ban className="w-3 h-3 mr-1" /> Anular
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                    <Box label="Totales comprobante" debito={d.totales_comprobante.debito} credito={d.totales_comprobante.credito} diff={d.totales_comprobante.diferencia} />
                    <Box label="Suma movimientos" debito={d.sumas_movimientos.debito} credito={d.sumas_movimientos.credito} diff={d.sumas_movimientos.diferencia} />
                    <Box label="Dif. totales" debito={d.diferencias_totales.debito} credito={d.diferencias_totales.credito} />
                  </div>

                  {d.singularidad && (
                    <div className="bg-muted/50 rounded p-2 text-xs space-y-1">
                      <div className="font-semibold">Singularidad del error: {d.singularidad.tipo}</div>
                      {d.singularidad.nota && <div className="text-muted-foreground">{d.singularidad.nota}</div>}
                      {d.singularidad.lado_mayor && (
                        <div>El lado mayor es <b>{d.singularidad.lado_mayor}</b> por {fmt(Math.abs(d.singularidad.diferencia))}.</div>
                      )}
                      {d.singularidad.diferencia_debito !== undefined && (
                        <div>Diferencia débito: {fmt(d.singularidad.diferencia_debito)} · Crédito: {fmt(d.singularidad.diferencia_credito)}</div>
                      )}
                      {d.singularidad.desglose_por_subcuenta?.length > 0 && (
                        <div className="mt-2">
                          <div className="font-semibold mb-1">Desglose por subcuenta (mayor diferencia primero):</div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-muted-foreground">
                                  <th className="text-left">Subcuenta</th>
                                  <th className="text-left">Nombre</th>
                                  <th className="text-right">Débito</th>
                                  <th className="text-right">Crédito</th>
                                  <th className="text-right">Diferencia</th>
                                </tr>
                              </thead>
                              <tbody>
                                {d.singularidad.desglose_por_subcuenta.map((s) => (
                                  <tr key={s.subcuenta} className="border-t">
                                    <td className="font-mono">{s.subcuenta}</td>
                                    <td>{s.nombre}</td>
                                    <td className="text-right">{fmt(s.debito)}</td>
                                    <td className="text-right">{fmt(s.credito)}</td>
                                    <td className={"text-right " + (Math.abs(s.diferencia) > 0.005 ? "text-destructive font-semibold" : "")}>{fmt(s.diferencia)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                      {d.singularidad.lineas_sospechosas?.length > 0 && (
                        <div className="mt-2">
                          <div className="font-semibold mb-1">Líneas sospechosas (débito y crédito ambos &gt;0, o ambos 0):</div>
                          <div className="space-y-1">
                            {d.singularidad.lineas_sospechosas.map((l) => (
                              <div key={l.id} className="font-mono text-xs">
                                {l.subcuenta} {l.cuenta_nombre} — D {fmt(l.debito)} / C {fmt(l.credito)}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {d.lineas.length > 0 && (
                    <Button variant="ghost" size="sm" onClick={() => toggle(d.comprobante_id)}>
                      {expandido[d.comprobante_id] ? "Ocultar" : "Ver"} {d.lineas.length} líneas
                    </Button>
                  )}
                  {expandido[d.comprobante_id] && (
                    <div className="overflow-x-auto border rounded">
                      <table className="w-full text-xs">
                        <thead className="bg-muted">
                          <tr>
                            <th className="text-left p-1">Subcuenta</th>
                            <th className="text-left p-1">Nombre</th>
                            <th className="text-left p-1">Tercero</th>
                            <th className="text-right p-1">Débito</th>
                            <th className="text-right p-1">Crédito</th>
                          </tr>
                        </thead>
                        <tbody>
                          {d.lineas.map((l) => (
                            <tr key={l.id} className="border-t">
                              <td className="p-1 font-mono">{l.subcuenta}</td>
                              <td className="p-1">{l.cuenta_nombre}</td>
                              <td className="p-1">{l.tercero || "-"}</td>
                              <td className="p-1 text-right">{fmt(l.debito)}</td>
                              <td className="p-1 text-right">{fmt(l.credito)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}

      <ComprobanteForm
        open={formOpen}
        onOpenChange={(v) => { setFormOpen(v); if (!v) { setEditingComp(null); setEditingMovs([]); } }}
        onSaved={onSaved}
        pucTransaccional={pucTransaccional}
        clientes={clientes}
        cuentasAhorro={cuentasAhorro}
        productosCredito={productosCredito}
        editing={editingComp}
        editingMovimientos={editingMovs}
      />

      <Dialog open={!!anularDialog} onOpenChange={(v) => !v && setAnularDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Anular Comprobante {anularDialog?.numero}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Esta acción anulará todos los movimientos, revertirá los saldos de cuentas y tarjetas afectadas, y generará una nota crédito espejo. No se puede deshacer.
            </p>
            <div>
              <label className="text-sm font-medium">Motivo de anulación *</label>
              <Input value={motivoAnulacion} onChange={(e) => setMotivoAnulacion(e.target.value)} placeholder="Explique el motivo..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAnularDialog(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleAnular} disabled={anulando || !motivoAnulacion.trim()}>
              {anulando ? "Anulando..." : "Confirmar Anulación"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ResumenCard({ label, value, ok, warn }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={"text-xl font-bold " + (ok ? "text-success" : warn ? "text-warning" : "")}>
          {typeof value === "number" ? value.toLocaleString("es-CO") : value}
        </div>
      </CardContent>
    </Card>
  );
}

function Box({ label, debito, credito, diff }) {
  return (
    <div className="border rounded p-2">
      <div className="text-muted-foreground">{label}</div>
      <div className="flex justify-between">
        <span>D: {fmt(debito)}</span>
        <span>C: {fmt(credito)}</span>
      </div>
      {diff !== undefined && (
        <div className={"text-right font-semibold " + (Math.abs(diff) > 0.005 ? "text-destructive" : "text-success")}>
          Δ {fmt(diff)}
        </div>
      )}
    </div>
  );
}