import React, { useState, useEffect, useCallback, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Briefcase, Plus, RefreshCw, AlertTriangle, Loader2, Wallet, TrendingUp, Users, Clock, Search, CalendarClock, FileBarChart, Percent, LogOut, Trash2, CreditCard, Pencil } from "lucide-react";
import { formatCOP, formatDate, hoyLocal } from "@/lib/contabilidad";
import { useToast } from "@/components/ui/use-toast";
import InscripcionDialog from "@/components/emprendamos/InscripcionDialog";
import CreditoForm from "@/components/emprendamos/CreditoForm";
import ComisionDialog from "@/components/emprendamos/ComisionDialog";
import NuevoCupoDialog from "@/components/emprendamos/NuevoCupoDialog";
import AbonoForm from "@/components/emprendamos/AbonoForm";
import EstadoCuentaDialog from "@/components/emprendamos/EstadoCuentaDialog";
import EditarCreditoDialog from "@/components/emprendamos/EditarCreditoDialog";
import EditarAbonoDialog from "@/components/emprendamos/EditarAbonoDialog";
import ConfirmMotivoDialog from "@/components/pakredito/ConfirmMotivoDialog";

const ESTADO_VARIANT = { activo: "secondary", suspendido: "outline", salido: "destructive" };
const TIPO_LABEL = { cartera_inicial: "Cartera inicial", habitual: "Habitual", extracupo: "Extracupo", comision: "Comisión" };

function proximaFechaPago(diaPago, desde) {
  const hoy = desde || hoyLocal();
  const [a, m] = hoy.split("-").map(Number);
  let fecha = `${a}-${String(m).padStart(2, "0")}-${String(diaPago).padStart(2, "0")}`;
  if (fecha < hoy) { const d = new Date(fecha + "T00:00:00"); d.setMonth(d.getMonth() + 1); fecha = d.toISOString().substring(0, 10); }
  return fecha;
}

export default function Emprendamos() {
  const [clientes, setClientes] = useState([]);
  const [inscritos, setInscritos] = useState([]);
  const [creditos, setCreditos] = useState([]);
  const [abonos, setAbonos] = useState([]);
  const [cdas, setCdas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [recalculando, setRecalculando] = useState(false);
  const [generando, setGenerando] = useState(false);

  const [inscripcionOpen, setInscripcionOpen] = useState(false);
  const [creditoIns, setCreditoIns] = useState(null);
  const [comisionIns, setComisionIns] = useState(null);
  const [nuevoCupoIns, setNuevoCupoIns] = useState(null);
  const [abonoIns, setAbonoIns] = useState(null);
  const [estadoIns, setEstadoIns] = useState(null);
  const [deleteAbonoId, setDeleteAbonoId] = useState(null);
  const [deleteCreditoId, setDeleteCreditoId] = useState(null);
  const [editarCredito, setEditarCredito] = useState(null);
  const [editarAbono, setEditarAbono] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const { toast } = useToast();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [cl, ins, cr, ab, cdaList] = await Promise.all([
        base44.entities.Cliente.list(),
        base44.entities.EmprendamosCliente.list("-fecha_ingreso", 500),
        base44.entities.EmprendamosCredito.list("-fecha", 1000),
        base44.entities.EmprendamosAbono.list("-fecha", 500),
        base44.entities.CuentaAhorro.filter({ estado: "activa" })
      ]);
      setClientes(cl); setInscritos(ins); setCreditos(cr); setAbonos(ab); setCdas(cdaList);
    } catch (e) { console.error("Error cargando emprendamos", e); }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const clienteNombre = (id) => clientes.find((c) => c.id === id)?.nombre || "—";

  // Enriquecer inscritos con nombre y datos derivados.
  const inscritosRich = useMemo(() => inscritos.map((ins) => {
    const proxima = ins.estado === "activo" ? proximaFechaPago(ins.dia_pago) : "";
    const dias = proxima ? Math.ceil((new Date(proxima + "T00:00:00") - new Date(hoyLocal() + "T00:00:00")) / 86400000) : null;
    const mesActual = hoyLocal().substring(0, 7);
    const abonoEsteMes = abonos.filter((a) => a.emprendamos_cliente_id === ins.id && (a.fecha || "").startsWith(mesActual)).reduce((s, a) => s + (a.valor_total || 0), 0);
    const fechaPagoEsteMes = `${mesActual}-${String(ins.dia_pago).padStart(2, "0")}`;
    const enMora = ins.estado === "activo" && (ins.saldo_deuda || 0) > 0 && hoyLocal() > fechaPagoEsteMes && abonoEsteMes === 0;
    return { ...ins, _clienteNombre: clienteNombre(ins.cliente_id), _proxima: proxima, _dias: dias, _enMora: enMora };
  }), [inscritos, clientes, abonos]);

  const activos = inscritosRich.filter((i) => i.estado === "activo");
  const totalCartera = activos.reduce((s, i) => s + (i.saldo_deuda || 0), 0);
  const enMora = activos.filter((i) => i._enMora);
  const recordatorios = activos.filter((i) => i._dias !== null && i._dias >= 0 && i._dias <= 3 && !i._enMora);

  const normalizar = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const inscritosFiltrados = useMemo(() => {
    if (!busqueda.trim()) return inscritosRich;
    const q = normalizar(busqueda);
    return inscritosRich.filter((i) => normalizar(i._clienteNombre).includes(q));
  }, [inscritosRich, busqueda]);

  const recalcular = async () => {
    setRecalculando(true);
    try { await base44.functions.invoke("gestionarEmprendamos", { accion: "recalcularEstado" }); await loadData(); }
    catch (e) { console.error(e); }
    setRecalculando(false);
  };

  const generarInteresesTodos = async () => {
    setGenerando(true);
    let total = 0;
    for (const ins of activos) {
      try {
        const res = await base44.functions.invoke("gestionarEmprendamos", { accion: "generarInteresesMensuales", emprendamos_cliente_id: ins.id });
        const data = res?.data || res;
        total += data.totalIntereses || 0;
      } catch (e) { /* ignora clientes sin crédito vigente */ }
    }
    await loadData();
    toast({ title: "Intereses generados", description: `Total cargado: ${formatCOP(total)}` });
    setGenerando(false);
  };

  const generarInteresesCliente = async (ins) => {
    try {
      const res = await base44.functions.invoke("gestionarEmprendamos", { accion: "generarInteresesMensuales", emprendamos_cliente_id: ins.id });
      const data = res?.data || res;
      await loadData();
      toast({ title: `Intereses de ${ins._clienteNombre}`, description: `Generado: ${formatCOP(data.totalIntereses || 0)}` });
    } catch (e) {
      toast({ title: "Error", description: e?.data?.error || e?.message, variant: "destructive" });
    }
  };

  const salirCliente = async (motivo) => {
    try {
      await base44.functions.invoke("gestionarEmprendamos", { accion: "salirCliente", emprendamos_cliente_id: salirIns.id, motivo });
      toast({ title: "Cliente salido", description: "Se registró la salida de Emprendamos." });
      await loadData();
    } catch (e) { toast({ title: "Error", description: e?.data?.error || e?.message, variant: "destructive" }); }
  };
  const [salirIns, setSalirIns] = useState(null);

  const eliminarAbono = async (motivo) => {
    try {
      await base44.functions.invoke("gestionarEmprendamos", { accion: "eliminarAbono", abono_id: deleteAbonoId, motivo });
      toast({ title: "Abono eliminado", description: "Se revirtió el comprobante y los saldos." });
      await loadData();
    } catch (e) { toast({ title: "Error", description: e?.data?.error || e?.message, variant: "destructive" }); }
  };

  const eliminarCredito = async (motivo) => {
    try {
      await base44.functions.invoke("gestionarEmprendamos", { accion: "eliminarCredito", credito_id: deleteCreditoId, motivo });
      toast({ title: "Crédito eliminado", description: "Se anuló el comprobante y se ajustó la deuda." });
      await loadData();
    } catch (e) { toast({ title: "Error", description: e?.data?.error || e?.message, variant: "destructive" }); }
  };

  const cdaOptions = useMemo(() => cdas.map((c) => ({ value: c.id, label: c.nombre, searchKey: c.nombre })), [cdas]);

  if (loading) {
    return (<div className="flex items-center justify-center h-full"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>);
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Briefcase className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-xl font-heading font-semibold">Emprendamos</h1>
            <p className="text-xs text-muted-foreground">Compra de cartera — administración de deudas y créditos</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={recalcular} disabled={recalculando}>
            {recalculando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />} Recalcular
          </Button>
          <Button variant="outline" onClick={generarInteresesTodos} disabled={generando}>
            {generando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Percent className="w-4 h-4 mr-2" />} Generar intereses (mes)
          </Button>
          <Button onClick={() => setInscripcionOpen(true)}><Plus className="w-4 h-4 mr-2" /> Inscribir cliente</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <CardStat icon={TrendingUp} label="Total cartera" value={formatCOP(totalCartera)} tone="primary" />
        <CardStat icon={Users} label="Clientes activos" value={activos.length} />
        <CardStat icon={CalendarClock} label="Recordatorios (≤3d)" value={recordatorios.length} tone={recordatorios.length ? "warning" : ""} />
        <CardStat icon={AlertTriangle} label="En mora" value={enMora.length} tone={enMora.length ? "destructive" : ""} />
      </div>

      <Tabs defaultValue="cartera">
        <TabsList>
          <TabsTrigger value="cartera">Cartera y Alertas</TabsTrigger>
          <TabsTrigger value="clientes">Clientes</TabsTrigger>
          <TabsTrigger value="creditos">Créditos</TabsTrigger>
          <TabsTrigger value="abonos">Abonos</TabsTrigger>
        </TabsList>

        <TabsContent value="cartera" className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold mb-2 uppercase text-muted-foreground flex items-center gap-1.5"><Clock className="w-4 h-4" /> Próximos pagos</h2>
            <Card><CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs text-muted-foreground uppercase"><tr>
                  <th className="px-3 py-2 font-medium">Cliente</th><th className="px-3 py-2 font-medium">Día pago</th>
                  <th className="px-3 py-2 font-medium">Próximo pago</th><th className="px-3 py-2 font-medium text-right">Días</th>
                  <th className="px-3 py-2 font-medium text-right">Saldo deuda</th><th className="px-3 py-2 font-medium text-center">Estado</th>
                </tr></thead>
                <tbody>
                  {activos.length === 0 ? <tr><td colSpan={6} className="px-3 py-4 text-center text-muted-foreground text-sm">Sin clientes activos.</td></tr> :
                    activos.map((i) => (
                      <tr key={i.id} className="border-b border-border/50 hover:bg-muted/30 cursor-pointer" onClick={() => setEstadoIns(i)}>
                        <td className="px-3 py-1.5">{i._clienteNombre}</td>
                        <td className="px-3 py-1.5 text-center font-mono text-xs">{i.dia_pago}</td>
                        <td className="px-3 py-1.5 font-mono text-xs">{formatDate(i._proxima)}</td>
                        <td className={`px-3 py-1.5 text-right font-mono text-xs ${i._dias <= 3 ? "text-warning" : ""}`}>{i._dias}d</td>
                        <td className="px-3 py-1.5 text-right font-mono">{formatCOP(i.saldo_deuda)}</td>
                        <td className="px-3 py-1.5 text-center">{i._enMora ? <Badge variant="destructive" className="text-[10px]">mora</Badge> : <Badge variant="secondary" className="text-[10px]">activo</Badge>}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </CardContent></Card>
          </div>

          {recordatorios.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold mb-2 uppercase text-muted-foreground flex items-center gap-1.5"><CalendarClock className="w-4 h-4 text-warning" /> Recordatorios (≤ 3 días)</h2>
              <Card className="border-warning/30"><CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b text-left text-xs text-muted-foreground uppercase"><tr>
                    <th className="px-3 py-2 font-medium">Cliente</th><th className="px-3 py-2 font-medium">Vence</th>
                    <th className="px-3 py-2 font-medium text-right">Días</th><th className="px-3 py-2 font-medium text-right">Cuota mínima aprox.</th>
                  </tr></thead>
                  <tbody>
                    {recordatorios.map((i) => {
                      const cuotaMin = creditos.filter((c) => c.emprendamos_cliente_id === i.id && c.estado === "vigente").reduce((s, c) => s + (c.saldo_intereses || 0), 0);
                      return (
                        <tr key={i.id} className="border-b border-border/50 bg-warning/5 hover:bg-warning/10 cursor-pointer" onClick={() => setAbonoIns(i)}>
                          <td className="px-3 py-1.5">{i._clienteNombre}</td>
                          <td className="px-3 py-1.5 font-mono text-xs text-warning">{formatDate(i._proxima)}</td>
                          <td className="px-3 py-1.5 text-right text-xs font-medium text-warning">{i._dias}d</td>
                          <td className="px-3 py-1.5 text-right font-mono">{formatCOP(cuotaMin)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent></Card>
            </div>
          )}

          {enMora.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold mb-2 uppercase text-muted-foreground flex items-center gap-1.5"><AlertTriangle className="w-4 h-4 text-destructive" /> Clientes en mora</h2>
              <Card className="border-destructive/30"><CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b text-left text-xs text-muted-foreground uppercase"><tr>
                    <th className="px-3 py-2 font-medium">Cliente</th><th className="px-3 py-2 font-medium">Día pago</th><th className="px-3 py-2 font-medium text-right">Saldo deuda</th>
                  </tr></thead>
                  <tbody>
                    {enMora.map((i) => (
                      <tr key={i.id} className="border-b border-border/50 bg-destructive/5 hover:bg-destructive/10 cursor-pointer" onClick={() => setAbonoIns(i)}>
                        <td className="px-3 py-1.5">{i._clienteNombre}</td>
                        <td className="px-3 py-1.5 text-center font-mono text-xs">{i.dia_pago}</td>
                        <td className="px-3 py-1.5 text-right font-mono">{formatCOP(i.saldo_deuda)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent></Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="clientes" className="space-y-3">
          <div className="relative max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar cliente..." className="pl-9" />
          </div>
          <Card><CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm thead-sticky">
              <thead className="border-b text-left text-xs text-muted-foreground uppercase"><tr>
                <th className="px-3 py-2 font-medium">Cliente</th><th className="px-3 py-2 font-medium">Ingreso</th>
                <th className="px-3 py-2 font-medium text-center">Día pago</th><th className="px-3 py-2 font-medium text-right">Capital inicial</th>
                <th className="px-3 py-2 font-medium text-right">Saldo deuda</th><th className="px-3 py-2 font-medium text-right">Cupo</th>
                <th className="px-3 py-2 font-medium text-center">Estado</th><th className="px-3 py-2 font-medium text-right">Acciones</th>
              </tr></thead>
              <tbody>
                {inscritosFiltrados.length === 0 ? <tr><td colSpan={8} className="px-3 py-4 text-center text-muted-foreground text-sm">Sin clientes inscritos.</td></tr> :
                  inscritosFiltrados.map((i) => (
                    <tr key={i.id} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="px-3 py-1.5 font-medium">{i._clienteNombre}</td>
                      <td className="px-3 py-1.5 font-mono text-xs">{formatDate(i.fecha_ingreso)}</td>
                      <td className="px-3 py-1.5 text-center font-mono text-xs">{i.dia_pago}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{formatCOP(i.capital_inicial)}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{formatCOP(i.saldo_deuda)}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-xs text-muted-foreground">{formatCOP(i.cupo_asignado)}</td>
                      <td className="px-3 py-1.5 text-center"><Badge variant={ESTADO_VARIANT[i.estado]} className="text-[10px]">{i.estado}</Badge></td>
                      <td className="px-3 py-1.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <IconBtn icon={Plus} title="Agregar crédito" onClick={() => setCreditoIns(i)} disabled={i.estado !== "activo"} />
                          <IconBtn icon={CreditCard} title="Nuevo cupo TDC" onClick={() => setNuevoCupoIns(i)} disabled={i.estado !== "activo"} />
                          <IconBtn icon={Percent} title="Comisión" onClick={() => setComisionIns(i)} disabled={i.estado !== "activo"} />
                          <IconBtn icon={Wallet} title="Abono" onClick={() => setAbonoIns(i)} disabled={i.estado !== "activo"} />
                          <IconBtn icon={FileBarChart} title="Estado de cuenta" onClick={() => setEstadoIns(i)} />
                          <IconBtn icon={RefreshCw} title="Generar intereses" onClick={() => generarInteresesCliente(i)} disabled={i.estado !== "activo"} />
                          <IconBtn icon={LogOut} title="Salir" onClick={() => setSalirIns(i)} disabled={i.estado !== "activo"} />
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="creditos" className="space-y-3">
          <Card><CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm thead-sticky">
              <thead className="border-b text-left text-xs text-muted-foreground uppercase"><tr>
                <th className="px-3 py-2 font-medium">Código</th><th className="px-3 py-2 font-medium">Cliente</th>
                <th className="px-3 py-2 font-medium">Tipo</th><th className="px-3 py-2 font-medium text-right">Capital</th>
                <th className="px-3 py-2 font-medium text-right">Saldo cap.</th><th className="px-3 py-2 font-medium text-right">Intereses</th>
                <th className="px-3 py-2 font-medium text-right">Tasa</th><th className="px-3 py-2 font-medium text-center">Estado</th>
                <th className="px-3 py-2 font-medium text-right">Acciones</th>
              </tr></thead>
              <tbody>
                {creditos.length === 0 ? <tr><td colSpan={9} className="px-3 py-4 text-center text-muted-foreground text-sm">Sin créditos.</td></tr> :
                  creditos.map((c) => (
                    <tr key={c.id} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="px-3 py-1.5 font-mono text-xs">{c.codigo}</td>
                      <td className="px-3 py-1.5">{clienteNombre(c.cliente_id)}</td>
                      <td className="px-3 py-1.5 text-xs">{TIPO_LABEL[c.tipo] || c.tipo}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{formatCOP(c.capital)}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{formatCOP(c.saldo_capital)}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{formatCOP(c.saldo_intereses)}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-xs">{(c.tasa_nominal * 100).toFixed(2)}%</td>
                      <td className="px-3 py-1.5 text-center"><Badge variant={c.estado === "vigente" ? "secondary" : "outline"} className="text-[10px]">{c.estado}</Badge></td>
                      <td className="px-3 py-1.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <IconBtn icon={Pencil} title="Editar crédito" onClick={() => setEditarCredito(c)} />
                          <IconBtn icon={Trash2} title={c.tipo === "cartera_inicial" ? "Eliminar crédito e inscripción" : "Eliminar crédito"} onClick={() => setDeleteCreditoId(c.id)} />
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="abonos" className="space-y-3">
          <Card><CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm thead-sticky">
              <thead className="border-b text-left text-xs text-muted-foreground uppercase"><tr>
                <th className="px-3 py-2 font-medium">Fecha</th><th className="px-3 py-2 font-medium">Cliente</th>
                <th className="px-3 py-2 font-medium">Tipo</th><th className="px-3 py-2 font-medium text-right">Valor</th>
                <th className="px-3 py-2 font-medium">Créditos</th><th className="px-3 py-2 font-medium w-10"></th>
              </tr></thead>
              <tbody>
                {abonos.length === 0 ? <tr><td colSpan={6} className="px-3 py-4 text-center text-muted-foreground text-sm">Sin abonos.</td></tr> :
                  abonos.map((a) => (
                    <tr key={a.id} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="px-3 py-1.5 font-mono text-xs">{formatDate(a.fecha)}</td>
                      <td className="px-3 py-1.5">{clienteNombre(a.cliente_id)}</td>
                      <td className="px-3 py-1.5 text-xs">{a.tipo}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{formatCOP(a.valor_total)}</td>
                      <td className="px-3 py-1.5 text-xs text-muted-foreground">{(a.detalles || []).map((d) => creditos.find((c) => c.id === d.credito_id)?.codigo || "?").join(", ")}</td>
                      <td className="px-3 py-1.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <IconBtn icon={Pencil} title="Editar abono" onClick={() => setEditarAbono(a)} />
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setDeleteAbonoId(a.id)} title="Eliminar abono"><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      <InscripcionDialog open={inscripcionOpen} onOpenChange={setInscripcionOpen} onSaved={loadData} clientes={clientes} />
      <CreditoForm open={!!creditoIns} onOpenChange={(v) => !v && setCreditoIns(null)} onSaved={loadData} inscrito={creditoIns} />
      <ComisionDialog open={!!comisionIns} onOpenChange={(v) => !v && setComisionIns(null)} onSaved={loadData} inscrito={comisionIns} />
      <NuevoCupoDialog open={!!nuevoCupoIns} onOpenChange={(v) => !v && setNuevoCupoIns(null)} onSaved={loadData} inscrito={nuevoCupoIns} clientes={clientes} />
      <AbonoForm open={!!abonoIns} onOpenChange={(v) => !v && setAbonoIns(null)} onSaved={loadData} inscrito={abonoIns} creditos={creditos} />
      <EstadoCuentaDialog open={!!estadoIns} onOpenChange={(v) => !v && setEstadoIns(null)} inscrito={estadoIns} />
      <ConfirmMotivoDialog open={!!deleteAbonoId} onOpenChange={(v) => !v && setDeleteAbonoId(null)} title="Eliminar abono" description="Se anulará el comprobante y se restaurarán los saldos de los créditos." onConfirm={eliminarAbono} />
      <ConfirmMotivoDialog open={!!deleteCreditoId} onOpenChange={(v) => !v && setDeleteCreditoId(null)} title="Eliminar crédito" description="Si es cartera inicial y es el único crédito, se eliminará la inscripción completa (anulación del asiento). No debe tener abonos ni créditos adicionales." onConfirm={eliminarCredito} />
      <EditarCreditoDialog open={!!editarCredito} onOpenChange={(v) => !v && setEditarCredito(null)} onSaved={loadData} credito={editarCredito} />
      <EditarAbonoDialog open={!!editarAbono} onOpenChange={(v) => !v && setEditarAbono(null)} onSaved={loadData} abono={editarAbono} />
      <ConfirmMotivoDialog open={!!salirIns} onOpenChange={(v) => !v && setSalirIns(null)} title="Salida de Emprendamos" description="El cliente debe tener ≥ 1 año inscrito. Se registrará la salida." confirmLabel="Confirmar salida" onConfirm={salirCliente} />
    </div>
  );
}

function IconBtn({ icon: Icon, title, onClick, disabled }) {
  return <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClick} disabled={disabled} title={title}><Icon className="w-3.5 h-3.5" /></Button>;
}

function CardStat({ icon: Icon, label, value, tone = "" }) {
  const toneClass = tone === "primary" ? "text-primary" : tone === "destructive" ? "text-destructive" : tone === "warning" ? "text-warning" : "text-foreground";
  return (
    <Card><CardContent className="p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0"><Icon className={`w-5 h-5 ${toneClass}`} /></div>
      <div><div className="text-xs text-muted-foreground">{label}</div><div className={`font-heading font-semibold text-lg ${toneClass}`}>{value}</div></div>
    </CardContent></Card>
  );
}