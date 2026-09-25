import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Search, Ban, Edit, ChevronDown, ChevronRight, RefreshCw, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { formatCOP, formatDate } from "@/lib/contabilidad";
import ComprobanteForm from "@/components/admin/ComprobanteForm";
import EditarPeriodoMovimientoDialog from "@/components/admin/EditarPeriodoMovimientoDialog";
import LibroDiarioImportExport from "@/components/admin/LibroDiarioImportExport";

export default function LibroDiario() {
  const [searchParams] = useSearchParams();
  const subcuentaFilter = searchParams.get("subcuenta");
  const [comprobantes, setComprobantes] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [cuentasAhorro, setCuentasAhorro] = useState([]);
  const [productosCredito, setProductosCredito] = useState([]);
  const [pucTransaccional, setPucTransaccional] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [filtroTipo, setFiltroTipo] = useState("all");
  const [filtroEstado, setFiltroEstado] = useState("all");
  const [busqueda, setBusqueda] = useState("");
  const [filtroCuenta, setFiltroCuenta] = useState("");
  const [filtroFecha, setFiltroFecha] = useState("");
  const [filtroValor, setFiltroValor] = useState("");
  const [anularDialog, setAnularDialog] = useState(null);
  const [motivoAnulacion, setMotivoAnulacion] = useState("");
  const [anulando, setAnulando] = useState(false);
  const [editingComp, setEditingComp] = useState(null);
  const [editingMovs, setEditingMovs] = useState([]);
  const [editarPeriodoMov, setEditarPeriodoMov] = useState(null);
  const [recalculando, setRecalculando] = useState(false);
  const [sortKey, setSortKey] = useState("fecha");
  const [sortDir, setSortDir] = useState("desc");

  const toggleSort = (k) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("asc"); }
  };

  const SortTh = ({ k, label, align = "text-left" }) => {
    const active = sortKey === k;
    const Icon = active ? (sortDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
    const rowReverse = align === "text-right" ? "flex-row-reverse" : "";
    return (
      <th className={`px-4 py-3 font-medium ${align}`}>
        <button
          type="button"
          onClick={() => toggleSort(k)}
          className={`inline-flex items-center gap-1 hover:text-foreground ${active ? "text-foreground" : "text-muted-foreground"} ${rowReverse}`}
        >
          {label}
          <Icon className={`w-3 h-3 ${active ? "" : "opacity-40"}`} />
        </button>
      </th>
    );
  };

  const loadData = useCallback(async () => {
    try {
      const [comps, movs, clients, cdas, prods, puc, me] = await Promise.all([
        base44.entities.ComprobanteContable.list("-fecha", 5000),
        base44.entities.MovimientoContable.list("-fecha", 10000),
        base44.entities.Cliente.list(),
        base44.entities.CuentaAhorro.list(),
        base44.entities.ProductoCredito.list(),
        base44.entities.Cuenta.filter({ es_transaccional: true }, "codigo", 300),
        base44.auth.me().catch(() => null)
      ]);
      setComprobantes(comps);
      setMovimientos(movs);
      setClientes(clients);
      setCuentasAhorro(cdas);
      setProductosCredito(prods);
      setPucTransaccional(puc);
      setUser(me);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (searchParams.get("nuevo") === "1" && !loading) {
      setFormOpen(true);
      window.history.replaceState({}, "", "/admin/contabilidad/libro-diario");
    }
  }, [searchParams, loading]);

  const movsByComprobante = {};
  movimientos.forEach((m) => {
    if (!movsByComprobante[m.comprobante_id]) movsByComprobante[m.comprobante_id] = [];
    movsByComprobante[m.comprobante_id].push(m);
  });

  const filtered = comprobantes.filter((c) => {
    if (filtroTipo !== "all" && c.tipo !== filtroTipo) return false;
    if (filtroEstado !== "all" && c.estado !== filtroEstado) return false;
    const movs = movsByComprobante[c.id] || [];
    if (subcuentaFilter) {
      if (!movs.some((m) => m.subcuenta === subcuentaFilter)) return false;
    }
    if (filtroCuenta) {
      const q = filtroCuenta.toLowerCase();
      if (!movs.some((m) => (m.subcuenta || "").toLowerCase().includes(q) || (m.cuenta_nombre || "").toLowerCase().includes(q))) return false;
    }
    if (filtroFecha) {
      if (c.fecha !== filtroFecha) return false;
    }
    if (filtroValor) {
      const v = parseFloat(filtroValor.replace(/[^\d.-]/g, ""));
      if (!isNaN(v) && !movs.some((m) => Math.abs((m.debito || 0) - v) < 0.01 || Math.abs((m.credito || 0) - v) < 0.01)) return false;
    }
    if (busqueda) {
      const q = busqueda.toLowerCase();
      const matchComp = c.numero.toLowerCase().includes(q) || (c.descripcion || "").toLowerCase().includes(q);
      const matchMov = movs.some((m) =>
        (m.subcuenta || "").toLowerCase().includes(q) ||
        (m.cuenta_nombre || "").toLowerCase().includes(q) ||
        (m.descripcion || "").toLowerCase().includes(q) ||
        (m.tercero || "").toLowerCase().includes(q)
      );
      if (!matchComp && !matchMov) return false;
    }
    return true;
  });

  const sortedFiltered = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      let va, vb;
      if (sortKey === "numero") { va = a.numero || ""; vb = b.numero || ""; }
      else if (sortKey === "fecha") { va = a.fecha || ""; vb = b.fecha || ""; }
      else if (sortKey === "tipo") { va = a.tipo || ""; vb = b.tipo || ""; }
      else if (sortKey === "descripcion") { va = a.descripcion || ""; vb = b.descripcion || ""; }
      else if (sortKey === "debito") { va = Number(a.total_debito) || 0; vb = Number(b.total_debito) || 0; }
      else if (sortKey === "credito") { va = Number(a.total_credito) || 0; vb = Number(b.total_credito) || 0; }
      else if (sortKey === "estado") { va = a.estado || ""; vb = b.estado || ""; }
      else return 0;
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
  }, [filtered, sortKey, sortDir]);

  const handleAnular = async () => {
    if (!motivoAnulacion.trim() || !anularDialog) return;
    setAnulando(true);
    try {
      await base44.functions.invoke("anularComprobante", {
        comprobante_id: anularDialog.id,
        motivo: motivoAnulacion.trim()
      });
      setAnularDialog(null);
      setMotivoAnulacion("");
      loadData();
    } catch (e) { alert("Error: " + e.message); }
    setAnulando(false);
  };

  const handleRecalcularSaldos = async () => {
    if (!window.confirm("¿Recalcular todos los saldos de cuentas de ahorro y tarjetas/crédito desde los movimientos contables? Útil tras eliminar movimientos manualmente."))
      return;
    setRecalculando(true);
    try {
      const resp = await base44.functions.invoke("recalcularSaldos", {});
      if (resp.data?.error) throw new Error(resp.data.error);
      const t = resp.data.totales || {};
      const fmt = (v) => "$" + (v || 0).toLocaleString("es-CO");
      alert(`Saldos recalculados correctamente.\nMovimientos huérfanos eliminados: ${resp.data.huerfanos_eliminados || 0}\nCuentas de ahorro actualizadas: ${resp.data.cdas_actualizados} de ${resp.data.total_cdas}\nTarjetas/créditos actualizados: ${resp.data.productos_actualizados} de ${resp.data.total_productos}\n\nBalance y Estados actualizados:\nActivo: ${fmt(t.activo)}\nPasivo: ${fmt(t.pasivo)}\nPatrimonio: ${fmt(t.patrimonio)}\nIngresos: ${fmt(t.ingreso)}\nGastos: ${fmt(t.gasto)}\nUtilidad: ${fmt(t.utilidad)}`);
      loadData();
    } catch (e) { alert("Error: " + e.message); }
    setRecalculando(false);
  };

  if (loading) return <div className="p-8 text-muted-foreground">Cargando libro diario...</div>;

  return (
    <div className="p-6 space-y-4">
      {subcuentaFilter && (
        <Card className="border-primary/30">
          <CardContent className="pt-4 pb-4 flex items-center justify-between">
            <span className="text-sm">Filtrando por cuenta: <span className="font-mono text-primary">{subcuentaFilter}</span></span>
            <Button variant="ghost" size="sm" onClick={() => window.history.pushState({}, "", "/admin/contabilidad/libro-diario")}>
              Quitar filtro
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar (nº, descripción, cuenta, tercero)..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="pl-9 w-64 bg-background" />
          </div>
          <Input placeholder="Cuenta (código o nombre)" value={filtroCuenta} onChange={(e) => setFiltroCuenta(e.target.value)} className="w-48 bg-background" />
          <Input type="date" value={filtroFecha} onChange={(e) => setFiltroFecha(e.target.value)} className="w-40 bg-background" />
          <Input placeholder="Valor exacto" value={filtroValor} onChange={(e) => setFiltroValor(e.target.value)} className="w-36 bg-background" />
          <Select value={filtroTipo} onValueChange={setFiltroTipo}>
            <SelectTrigger className="w-36 bg-background"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los tipos</SelectItem>
              <SelectItem value="diario">Diario</SelectItem>
              <SelectItem value="ingreso">Ingreso</SelectItem>
              <SelectItem value="egreso">Egreso</SelectItem>
              <SelectItem value="apertura">Apertura</SelectItem>
              <SelectItem value="cierre">Cierre</SelectItem>
              <SelectItem value="nota_credito">Nota Crédito</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filtroEstado} onValueChange={setFiltroEstado}>
            <SelectTrigger className="w-32 bg-background"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="contabilizado">Contabilizado</SelectItem>
              <SelectItem value="anulado">Anulado</SelectItem>
            </SelectContent>
          </Select>
          {(filtroCuenta || filtroFecha || filtroValor) && (
            <Button variant="ghost" size="sm" onClick={() => { setFiltroCuenta(""); setFiltroFecha(""); setFiltroValor(""); }}>
              Limpiar filtros
            </Button>
          )}
        </div>
        <div className="flex gap-2 items-center">
          <LibroDiarioImportExport comprobantes={sortedFiltered} movsByComprobante={movsByComprobante} pucTransaccional={pucTransaccional} clientes={clientes} onImported={loadData} />
          <Button variant="outline" onClick={handleRecalcularSaldos} disabled={recalculando}>
            <RefreshCw className={`w-4 h-4 mr-2 ${recalculando ? "animate-spin" : ""}`} />
            {recalculando ? "Recalculando..." : "Refrescar saldos"}
          </Button>
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="w-4 h-4 mr-2" /> Nuevo Comprobante
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm thead-sticky">
            <thead className="border-b border-border text-left text-xs text-muted-foreground uppercase">
              <tr>
                <th className="px-4 py-3 font-medium w-8"></th>
                <SortTh k="numero" label="Número" />
                <SortTh k="fecha" label="Fecha" />
                <SortTh k="tipo" label="Tipo" />
                <SortTh k="descripcion" label="Descripción" />
                <SortTh k="debito" label="Débito" align="text-right" />
                <SortTh k="credito" label="Crédito" align="text-right" />
                <th className="px-4 py-3 font-medium text-center">Estado</th>
                {user?.role === "admin" && <th className="px-4 py-3 font-medium"></th>}
              </tr>
            </thead>
            <tbody>
              {sortedFiltered.map((c) => {
                const movs = movsByComprobante[c.id] || [];
                const isExpanded = expanded === c.id;
                return (
                  <React.Fragment key={c.id}>
                    <tr className={`border-b border-border/50 hover:bg-muted/30 ${c.estado === "anulado" ? "opacity-50" : ""}`}>
                      <td className="px-4 py-2">
                        {movs.length > 0 && (
                          <button onClick={() => setExpanded(isExpanded ? null : c.id)}>
                            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs">{c.numero}</td>
                      <td className="px-4 py-2 text-xs">{formatDate(c.fecha)}</td>
                      <td className="px-4 py-2"><Badge variant="outline" className="text-xs">{c.tipo}</Badge></td>
                      <td className="px-4 py-2 text-xs">{c.descripcion}</td>
                      <td className="px-4 py-2 text-right font-mono text-xs">{formatCOP(c.total_debito)}</td>
                      <td className="px-4 py-2 text-right font-mono text-xs">{formatCOP(c.total_credito)}</td>
                      <td className="px-4 py-2 text-center">
                        <Badge variant={c.estado === "contabilizado" ? "default" : "destructive"} className="text-xs">
                          {c.estado === "contabilizado" ? "Contab." : "Anulado"}
                        </Badge>
                      </td>
                      {user?.role === "admin" && (
                        <td className="px-4 py-2">
                          {c.estado === "contabilizado" && (
                            <div className="flex gap-1">
                              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => {
                                setEditingComp(c);
                                setEditingMovs(movsByComprobante[c.id] || []);
                                setFormOpen(true);
                              }}>
                                <Edit className="w-3 h-3 mr-1" /> Modificar
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => { setAnularDialog(c); setMotivoAnulacion(""); }}>
                                <Ban className="w-3 h-3 mr-1" /> Anular
                              </Button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                    {isExpanded && (
                      <tr className="bg-muted/20">
                        <td colSpan={user?.role === "admin" ? 9 : 8} className="px-12 py-3">
                          <table className="w-full text-xs">
                            <thead className="text-muted-foreground">
                              <tr className="text-left">
                                <th className="py-1 font-medium">Cuenta</th>
                                <th className="py-1 font-medium">Concepto</th>
                                <th className="py-1 font-medium">Tercero</th>
                                <th className="py-1 font-medium text-right">Débito</th>
                                <th className="py-1 font-medium text-right">Crédito</th>
                                <th className="py-1 font-medium">Período</th>
                                <th className="py-1 font-medium text-right">Acción</th>
                              </tr>
                            </thead>
                            <tbody>
                              {movs.map((m) => (
                                <tr key={m.id} className="border-b border-border/30">
                                  <td className="py-1 font-mono">{m.subcuenta}</td>
                                  <td className="py-1">{m.cuenta_nombre} {m.descripcion && <span className="text-muted-foreground">— {m.descripcion}</span>}</td>
                                  <td className="py-1 text-muted-foreground">{m.tercero || "—"}</td>
                                  <td className="py-1 text-right font-mono">{m.debito ? formatCOP(m.debito) : ""}</td>
                                  <td className="py-1 text-right font-mono">{m.credito ? formatCOP(m.credito) : ""}</td>
                                  <td className="py-1 font-mono text-xs">{m.periodo_extracto || <span className="text-muted-foreground">—</span>}</td>
                                  <td className="py-1 text-right">
                                    <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setEditarPeriodoMov(m)}>
                                      <Edit className="w-3 h-3 mr-1" /> Período
                                    </Button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">No hay comprobantes registrados.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <ComprobanteForm
        open={formOpen}
        onOpenChange={(v) => { setFormOpen(v); if (!v) { setEditingComp(null); setEditingMovs([]); } }}
        onSaved={loadData}
        pucTransaccional={pucTransaccional}
        clientes={clientes}
        cuentasAhorro={cuentasAhorro}
        productosCredito={productosCredito}
        editing={editingComp}
        editingMovimientos={editingMovs}
      />

      <EditarPeriodoMovimientoDialog
        movimiento={editarPeriodoMov}
        onOpenChange={(v) => !v && setEditarPeriodoMov(null)}
        onSaved={loadData}
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