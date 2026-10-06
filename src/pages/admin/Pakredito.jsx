import React, { useState, useEffect, useCallback, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HandCoins, Plus, RefreshCw, AlertTriangle, Loader2, Wallet, TrendingUp, Users, Clock, Search, CalendarClock, CalendarPlus, Receipt, Pencil, Eye, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { formatCOP, formatDate, hoyLocal } from "@/lib/contabilidad";
import { calcularSaldoTotalDeber } from "@/lib/pakredito";
import PrestamoForm from "@/components/pakredito/PrestamoForm";
import AbonoPrestamoForm from "@/components/pakredito/AbonoPrestamoForm";
import PrestamoDetail from "@/components/pakredito/PrestamoDetail";
import ConfirmMotivoDialog from "@/components/pakredito/ConfirmMotivoDialog";
import ProrrocaDialog from "@/components/pakredito/ProrrocaDialog";
import AbonoDetailDialog from "@/components/pakredito/AbonoDetailDialog";
import EditarAbonoDialog from "@/components/pakredito/EditarAbonoDialog";
import { useToast } from "@/components/ui/use-toast";

const ESTADO_VARIANT = { vigente: "secondary", saldado: "outline", en_mora: "destructive", refinanciado: "secondary" };

const parseDet = (d) => {
  if (Array.isArray(d)) return d;
  if (typeof d === "string") {
    try { return JSON.parse(d); } catch { return []; }
  }
  return [];
};

export default function Pakredito() {
  const [clientes, setClientes] = useState([]);
  const [prestamos, setPrestamos] = useState([]);
  const [abonos, setAbonos] = useState([]);
  const [puc, setPuc] = useState([]);
  const [cdas, setCdas] = useState([]);
  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [recalculando, setRecalculando] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [abonoOpen, setAbonoOpen] = useState(false);
  const [detailPrestamo, setDetailPrestamo] = useState(null);
  const [deleteAbonoId, setDeleteAbonoId] = useState(null);
  const [deletePrestamoTarget, setDeletePrestamoTarget] = useState(null);
  const [prorrocaPrestamo, setProrrocaPrestamo] = useState(null);
  const [viewAbono, setViewAbono] = useState(null);
  const [editAbono, setEditAbono] = useState(null);
  const [filtroEstado, setFiltroEstado] = useState("vigentes"); // "vigentes" | "todos" | "saldados"
  const [busquedaPrestamos, setBusquedaPrestamos] = useState("");
  const [busquedaAbonos, setBusquedaAbonos] = useState("");
  const { toast } = useToast();

  const clientesPakredito = useMemo(
    () => clientes.filter((c) => (c.lineas_negocio || []).includes("pakredito") || prestamos.some((p) => p.cliente_id === c.id)),
    [clientes, prestamos]
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [cl, pr, ab, pucList, cdaList, prodList] = await Promise.all([
        base44.entities.Cliente.list(),
        base44.entities.Prestamo.list("-created_date", 500),
        base44.entities.AbonoPrestamo.list("-fecha", 500),
        base44.entities.Cuenta.filter({ es_transaccional: true }, "-codigo", 2000),
        base44.entities.CuentaAhorro.filter({ estado: "activa" }),
        base44.entities.ProductoCredito.filter({ estado: "activo" })
      ]);
      setClientes(cl); setPrestamos(pr); setAbonos(ab);
      setPuc(pucList); setCdas(cdaList); setProductos(prodList);
    } catch (e) {
      console.error("Error cargando pakredito", e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const clienteNombre = (id) => clientes.find((c) => c.id === id)?.nombre || "—";

  const recalcular = async () => {
    setRecalculando(true);
    try {
      await base44.functions.invoke("gestionarPakredito", { accion: "recalcularEstado" });
      await loadData();
    } catch (e) { console.error(e); }
    setRecalculando(false);
  };

  const eliminarAbono = async (motivo) => {
    try {
      const res = await base44.functions.invoke("gestionarPakredito", { accion: "eliminarAbono", abono_id: deleteAbonoId, motivo });
      const r = res?.data || res;
      if (r?.success === false || r?.error) {
        throw new Error(r?.error || "Error al eliminar abono");
      }
      toast({ title: "Abono eliminado", description: "Se revirtió el comprobante y el estado del préstamo con éxito." });
      setDeleteAbonoId(null);
      await loadData();
    } catch (err) {
      console.error("Error al eliminar abono:", err);
      toast({ variant: "destructive", title: "Error", description: err.message || "No se pudo eliminar el abono" });
      throw err;
    }
  };

  const eliminarPrestamo = async (motivo) => {
    if (!deletePrestamoTarget) return;
    try {
      await base44.functions.invoke("gestionarPakredito", { accion: "eliminarPrestamo", prestamo_id: deletePrestamoTarget.id, motivo });
      toast({ title: "Préstamo eliminado", description: `Se anuló el comprobante y registros de ${deletePrestamoTarget.codigo}.` });
      setDeletePrestamoTarget(null);
      await loadData();
    } catch (err) {
      console.error("Error al eliminar préstamo:", err);
      toast({ variant: "destructive", title: "Error", description: err.message || "No se pudo eliminar el préstamo" });
    }
  };

  const hoy = hoyLocal();
  const carteraActiva = prestamos.filter((p) => p.estado === "vigente" || p.estado === "en_mora");
  const totalCartera = carteraActiva.reduce((s, p) => s + (p.saldo_capital || 0), 0);
  const totalSaldoDeberActivo = carteraActiva.reduce((s, p) => s + (calcularSaldoTotalDeber(p) || 0), 0);
  const totalPrestado = prestamos.reduce((s, p) => s + (p.capital || 0), 0);
  const enMora = prestamos.filter((p) => p.estado === "en_mora");
  const clientesActivos = new Set(carteraActiva.map((p) => p.cliente_id)).size;

  const countActivos = useMemo(() => prestamos.filter((p) => p.estado !== "saldado").length, [prestamos]);
  const countSaldados = useMemo(() => prestamos.filter((p) => p.estado === "saldado").length, [prestamos]);

  const proximosPagos = useMemo(
    () => carteraActiva.filter((p) => p.fecha_proximo_pago).sort((a, b) => a.fecha_proximo_pago.localeCompare(b.fecha_proximo_pago)),
    [carteraActiva]
  );

  const vencimientoProximo = useMemo(
    () => proximosPagos.filter((p) => {
      if (p.estado === "en_mora") return false;
      const dias = Math.ceil((new Date(p.fecha_proximo_pago + "T00:00:00") - new Date(hoy + "T00:00:00")) / 86400000);
      return dias >= 0 && dias <= 7;
    }),
    [proximosPagos, hoy]
  );

  const normalizar = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const prestamosFiltrados = useMemo(() => {
    let list = prestamos;
    if (filtroEstado === "vigentes") {
      list = list.filter((p) => p.estado !== "saldado");
    } else if (filtroEstado === "saldados") {
      list = list.filter((p) => p.estado === "saldado");
    }
    if (!busquedaPrestamos.trim()) return list;
    const q = normalizar(busquedaPrestamos);
    return list.filter((p) => normalizar(clienteNombre(p.cliente_id)).includes(q) || normalizar(p.codigo).includes(q));
  }, [prestamos, busquedaPrestamos, filtroEstado, clientes]);

  const abonosFiltrados = useMemo(() => {
    if (!busquedaAbonos.trim()) return abonos;
    const q = normalizar(busquedaAbonos);
    return abonos.filter((a) => {
      const dList = parseDet(a.detalles);
      const cods = dList.map((d) => prestamos.find((p) => String(p.id) === String(d.prestamo_id))?.codigo || "").join(" ");
      return normalizar(clienteNombre(a.cliente_id)).includes(q) || normalizar(cods).includes(q);
    });
  }, [abonos, busquedaAbonos, clientes, prestamos]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HandCoins className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-xl font-heading font-semibold">Pakredito</h1>
            <p className="text-xs text-muted-foreground">Línea de microcréditos — préstamos por cuotas</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={recalcular} disabled={recalculando}>
            {recalculando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />} Recalcular estados
          </Button>
          <Button variant="outline" onClick={() => setAbonoOpen(true)}><Wallet className="w-4 h-4 mr-2" /> Registrar abono</Button>
          <Button onClick={() => setFormOpen(true)}><Plus className="w-4 h-4 mr-2" /> Nuevo préstamo</Button>
        </div>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <CardStat icon={TrendingUp} label="Total prestado" value={formatCOP(totalPrestado)} />
        <CardStat icon={Wallet} label="Cartera (Saldo Capital)" value={formatCOP(totalCartera)} tone="primary" />
        <CardStat icon={Receipt} label="Saldo total a deber" value={formatCOP(totalSaldoDeberActivo)} tone="primary" />
        <CardStat icon={Users} label="Clientes activos" value={clientesActivos} />
        <CardStat icon={AlertTriangle} label="En mora" value={enMora.length} tone={enMora.length ? "destructive" : ""} />
      </div>

      {enMora.length > 0 && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="text-sm font-semibold text-destructive">
              {enMora.length} {enMora.length === 1 ? "crédito en mora" : "créditos en mora"}
            </div>
            <div className="text-xs text-destructive/80 mt-0.5">
              {[...new Set(enMora.map((p) => clienteNombre(p.cliente_id)))].join(" · ")}
            </div>
          </div>
        </div>
      )}

      <Tabs defaultValue="cartera">
        <TabsList>
          <TabsTrigger value="cartera">Cartera y Alertas</TabsTrigger>
          <TabsTrigger value="prestamos">Préstamos</TabsTrigger>
          <TabsTrigger value="abonos">Abonos</TabsTrigger>
        </TabsList>

        <TabsContent value="cartera" className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold mb-2 uppercase text-muted-foreground flex items-center gap-1.5"><Clock className="w-4 h-4" /> Próximos pagos</h2>
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b text-left text-xs text-muted-foreground uppercase">
                    <tr>
                      <th className="px-3 py-2 font-medium">Cliente</th>
                      <th className="px-3 py-2 font-medium">Crédito</th>
                      <th className="px-3 py-2 font-medium">Próximo pago</th>
                      <th className="px-3 py-2 font-medium text-right">Valor</th>
                      <th className="px-3 py-2 font-medium text-right">Saldo capital</th>
                      <th className="px-3 py-2 font-medium text-center">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {proximosPagos.length === 0 ? (
                      <tr><td colSpan={6} className="px-3 py-4 text-center text-muted-foreground text-sm">Sin créditos activos.</td></tr>
                    ) : proximosPagos.map((p) => (
                      <tr key={p.id} className="border-b border-border/50 hover:bg-muted/30 cursor-pointer" onClick={() => setDetailPrestamo(p)}>
                        <td className="px-3 py-1.5">{clienteNombre(p.cliente_id)}</td>
                        <td className="px-3 py-1.5 font-mono text-xs">{p.codigo}</td>
                        <td className="px-3 py-1.5 font-mono text-xs">{formatDate(p.fecha_proximo_pago)}</td>
                        <td className="px-3 py-1.5 text-right font-mono">{formatCOP(p.valor_proximo_pago)}</td>
                        <td className="px-3 py-1.5 text-right font-mono">{formatCOP(p.saldo_capital)}</td>
                        <td className="px-3 py-1.5 text-center"><Badge variant={ESTADO_VARIANT[p.estado]} className="text-[10px]">{p.estado}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>

          {vencimientoProximo.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold mb-2 uppercase text-muted-foreground flex items-center gap-1.5"><CalendarClock className="w-4 h-4 text-warning" /> Vencimiento próximo (≤ 1 semana)</h2>
              <Card className="border-warning/30">
                <CardContent className="p-0 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b text-left text-xs text-muted-foreground uppercase">
                      <tr>
                        <th className="px-3 py-2 font-medium">Cliente</th>
                        <th className="px-3 py-2 font-medium">Crédito</th>
                        <th className="px-3 py-2 font-medium">Vence</th>
                        <th className="px-3 py-2 font-medium text-right">Valor</th>
                        <th className="px-3 py-2 font-medium text-right">Días</th>
                        <th className="px-3 py-2 font-medium text-center">Prórroga</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vencimientoProximo.map((p) => {
                        const dias = Math.ceil((new Date(p.fecha_proximo_pago + "T00:00:00") - new Date(hoy + "T00:00:00")) / 86400000);
                        return (
                          <tr key={p.id} className="border-b border-border/50 bg-warning/5 hover:bg-warning/10 cursor-pointer" onClick={() => setDetailPrestamo(p)}>
                            <td className="px-3 py-1.5">{clienteNombre(p.cliente_id)}</td>
                            <td className="px-3 py-1.5 font-mono text-xs">{p.codigo}</td>
                            <td className="px-3 py-1.5 font-mono text-xs text-warning">{formatDate(p.fecha_proximo_pago)}</td>
                            <td className="px-3 py-1.5 text-right font-mono">{formatCOP(p.valor_proximo_pago)}</td>
                            <td className="px-3 py-1.5 text-right text-xs font-medium text-warning">{dias}d</td>
                            <td className="px-3 py-1.5 text-center">
                              <Button size="sm" variant="outline" className="h-7 text-xs"
                                onClick={(e) => { e.stopPropagation(); setProrrocaPrestamo(p); }}>
                                <CalendarPlus className="w-3.5 h-3.5 mr-1" /> Prórroga
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>
          )}

          {enMora.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold mb-2 uppercase text-muted-foreground flex items-center gap-1.5"><AlertTriangle className="w-4 h-4 text-destructive" /> Clientes en mora</h2>
              <Card className="border-destructive/30">
                <CardContent className="p-0 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b text-left text-xs text-muted-foreground uppercase">
                      <tr>
                        <th className="px-3 py-2 font-medium">Cliente</th>
                        <th className="px-3 py-2 font-medium">Crédito</th>
                        <th className="px-3 py-2 font-medium">Vencido desde</th>
                        <th className="px-3 py-2 font-medium text-right">Saldo</th>
                        <th className="px-3 py-2 font-medium">Modelo</th>
                        <th className="px-3 py-2 font-medium text-center">Prórroga</th>
                      </tr>
                    </thead>
                    <tbody>
                      {enMora.map((p) => (
                        <tr key={p.id} className="border-b border-border/50 bg-destructive/5 hover:bg-destructive/10 cursor-pointer" onClick={() => setDetailPrestamo(p)}>
                          <td className="px-3 py-1.5">{clienteNombre(p.cliente_id)}</td>
                          <td className="px-3 py-1.5 font-mono text-xs">{p.codigo}</td>
                          <td className="px-3 py-1.5 font-mono text-xs text-destructive">{formatDate(p.fecha_proximo_pago)}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{formatCOP(p.saldo_capital)}</td>
                          <td className="px-3 py-1.5 text-xs">{p.modelo === "cuota_fija" ? "Cuota fija" : "Mes vencido"}</td>
                          <td className="px-3 py-1.5 text-center">
                            <Button size="sm" variant="outline" className="h-7 text-xs"
                              onClick={(e) => { e.stopPropagation(); setProrrocaPrestamo(p); }}>
                              <CalendarPlus className="w-3.5 h-3.5 mr-1" /> Prórroga
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="prestamos" className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative max-w-sm flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busquedaPrestamos}
                onChange={(e) => setBusquedaPrestamos(e.target.value)}
                placeholder="Buscar por cliente o código..."
                className="pl-9"
              />
            </div>
            {/* Filtro: Solo vigentes (oculta los saldados), Todos, o Solo saldados */}
            <div className="flex items-center gap-1.5 p-1 bg-muted/60 rounded-lg border text-xs">
              <button
                type="button"
                onClick={() => setFiltroEstado("vigentes")}
                className={`px-3 py-1 rounded-md font-medium transition-colors ${
                  filtroEstado === "vigentes"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Solo vigentes ({countActivos})
              </button>
              <button
                type="button"
                onClick={() => setFiltroEstado("todos")}
                className={`px-3 py-1 rounded-md font-medium transition-colors ${
                  filtroEstado === "todos"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Todos ({prestamos.length})
              </button>
              <button
                type="button"
                onClick={() => setFiltroEstado("saldados")}
                className={`px-3 py-1 rounded-md font-medium transition-colors ${
                  filtroEstado === "saldados"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Saldados ({countSaldados})
              </button>
            </div>
          </div>

          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm thead-sticky">
                <thead className="border-b text-left text-xs text-muted-foreground uppercase bg-muted/40">
                  <tr>
                    <th className="px-3 py-2 font-medium">Código</th>
                    <th className="px-3 py-2 font-medium">Cliente</th>
                    <th className="px-3 py-2 font-medium">Modelo / Plazo</th>
                    <th className="px-3 py-2 font-medium text-right">Capital</th>
                    <th className="px-3 py-2 font-medium text-right">Total Esperado</th>
                    <th className="px-3 py-2 font-medium text-right text-primary font-bold">Saldo a Deber</th>
                    <th className="px-3 py-2 font-medium text-right">Saldo Capital</th>
                    <th className="px-3 py-2 font-medium">Próx. Venc.</th>
                    <th className="px-3 py-2 font-medium text-center">Estado</th>
                    <th className="px-3 py-2 font-medium w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {prestamosFiltrados.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-3 py-6 text-center text-muted-foreground text-sm">
                        {filtroEstado === "vigentes"
                          ? "No hay préstamos vigentes o en mora coincidentes."
                          : "Sin préstamos registrados."}
                      </td>
                    </tr>
                  ) : prestamosFiltrados.map((p) => (
                    <tr key={p.id} className="border-b border-border/50 hover:bg-muted/30 cursor-pointer" onClick={() => setDetailPrestamo(p)}>
                      <td className="px-3 py-2 font-mono text-xs font-semibold">{p.codigo}</td>
                      <td className="px-3 py-2 font-medium">{clienteNombre(p.cliente_id)}</td>
                      <td className="px-3 py-2 text-xs">
                        <div className="font-medium text-foreground">{p.modelo === "cuota_fija" ? "Cuota fija" : "Cuota variable"}</div>
                        <div className="text-[10px] text-muted-foreground capitalize">
                          {p.periodo || "mensual"} · {p.numero_cuotas} cuota{p.numero_cuotas > 1 ? "s" : ""}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{formatCOP(p.capital)}</td>
                      <td className="px-3 py-2 text-right font-mono text-muted-foreground">{formatCOP(p.total_a_pagar || p.capital)}</td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-primary">
                        {formatCOP(calcularSaldoTotalDeber(p))}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-muted-foreground">{formatCOP(p.saldo_capital)}</td>
                      <td className="px-3 py-2 font-mono text-xs">{formatDate(p.fecha_proximo_pago) || "—"}</td>
                      <td className="px-3 py-2 text-center"><Badge variant={ESTADO_VARIANT[p.estado]} className="text-[10px]">{p.estado}</Badge></td>
                      <td className="px-3 py-2 text-center">
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:bg-destructive/10"
                          onClick={(e) => { e.stopPropagation(); setDeletePrestamoTarget(p); }} title="Eliminar préstamo">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="abonos" className="space-y-3">
          <div className="relative max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={busquedaAbonos} onChange={(e) => setBusquedaAbonos(e.target.value)} placeholder="Buscar por cliente o crédito..." className="pl-9" />
          </div>
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm thead-sticky">
                <thead className="border-b text-left text-xs text-muted-foreground uppercase">
                  <tr>
                    <th className="px-3 py-2 font-medium">Fecha</th>
                    <th className="px-3 py-2 font-medium">Cliente</th>
                    <th className="px-3 py-2 font-medium text-right">Valor</th>
                    <th className="px-3 py-2 font-medium">Créditos abonados</th>
                    <th className="px-3 py-2 font-medium text-center">Asiento</th>
                    <th className="px-3 py-2 font-medium text-center w-28">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {abonosFiltrados.length === 0 ? (
                    <tr><td colSpan={6} className="px-3 py-4 text-center text-muted-foreground text-sm">Sin abonos registrados.</td></tr>
                  ) : abonosFiltrados.map((a) => {
                    const dList = parseDet(a.detalles);
                    const codigos = dList.map((d) => prestamos.find((p) => String(p.id) === String(d.prestamo_id))?.codigo || "?").join(", ");
                    return (
                      <tr
                        key={a.id}
                        className="border-b border-border/50 hover:bg-muted/30 cursor-pointer"
                        onClick={() => setViewAbono(a)}
                      >
                        <td className="px-3 py-1.5 font-mono text-xs">{formatDate(a.fecha)}</td>
                        <td className="px-3 py-1.5 font-medium">{clienteNombre(a.cliente_id)}</td>
                        <td className="px-3 py-1.5 text-right font-mono font-semibold">{formatCOP(a.valor_total)}</td>
                        <td className="px-3 py-1.5 text-xs text-muted-foreground">{codigos || "—"}</td>
                        <td className="px-3 py-1.5 text-center" onClick={(e) => e.stopPropagation()}>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-[11px] px-2 text-primary"
                            onClick={() => setViewAbono(a)}
                          >
                            <Receipt className="w-3 h-3 mr-1" /> Ver asiento
                          </Button>
                        </td>
                        <td className="px-3 py-1.5 text-center" onClick={(e) => e.stopPropagation()}>
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
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <PrestamoForm open={formOpen} onOpenChange={setFormOpen} onSaved={loadData}
        clientes={clientes} pucTransaccional={puc} cuentasAhorro={cdas} productosCredito={productos} />
      <AbonoPrestamoForm open={abonoOpen} onOpenChange={setAbonoOpen} onSaved={loadData}
        clientes={clientesPakredito} cuentasAhorro={cdas} prestamos={prestamos} />
      <PrestamoDetail open={!!detailPrestamo} onOpenChange={(v) => !v && setDetailPrestamo(null)}
        prestamo={detailPrestamo} clienteNombre={detailPrestamo ? clienteNombre(detailPrestamo.cliente_id) : ""}
        prestamos={prestamos}
        clientes={clientes}
        onChanged={loadData} />
      
      <AbonoDetailDialog
        open={!!viewAbono}
        onOpenChange={(v) => !v && setViewAbono(null)}
        abono={viewAbono}
        prestamos={prestamos}
        clientes={clientes}
        onEdit={(ab) => { setViewAbono(null); setEditAbono(ab); }}
        onDelete={(ab) => { setViewAbono(null); setDeleteAbonoId(ab.id); }}
      />

      <EditarAbonoDialog
        open={!!editAbono}
        onOpenChange={(v) => !v && setEditAbono(null)}
        abono={editAbono}
        prestamos={prestamos}
        clientes={clientes}
        onSaved={loadData}
      />

      <ConfirmMotivoDialog open={!!deleteAbonoId} onOpenChange={(v) => !v && setDeleteAbonoId(null)}
        title="Eliminar abono"
        description="Se anulará el comprobante del abono (nota crédito) y se restaurará el estado del préstamo (saldos, cuotas e intereses)."
        onConfirm={eliminarAbono} />
      <ConfirmMotivoDialog open={!!deletePrestamoTarget} onOpenChange={(v) => !v && setDeletePrestamoTarget(null)}
        title={`Eliminar préstamo ${deletePrestamoTarget?.codigo || ""}`}
        description={`Se anulará el comprobante de desembolso, se eliminarán sus cuotas de amortización y se anularán los abonos vinculados a este crédito. Esta acción no se puede deshacer.`}
        onConfirm={eliminarPrestamo} />
      <ProrrocaDialog open={!!prorrocaPrestamo} onOpenChange={(v) => !v && setProrrocaPrestamo(null)}
        prestamo={prorrocaPrestamo}
        clienteNombre={prorrocaPrestamo ? clienteNombre(prorrocaPrestamo.cliente_id) : ""}
        onSaved={loadData} />
    </div>
  );
}

function CardStat({ icon: Icon, label, value, tone = "" }) {
  const toneClass = tone === "primary" ? "text-primary" : tone === "destructive" ? "text-destructive" : "text-foreground";
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
          <Icon className={`w-5 h-5 ${toneClass}`} />
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className={`font-heading font-semibold text-lg ${toneClass}`}>{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}