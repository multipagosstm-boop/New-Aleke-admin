import React, { useEffect, useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Home, FileText, Eye, Pencil, RefreshCw, AlertTriangle, Wrench, LayoutDashboard, Users, Trash2, Mail, Phone } from "lucide-react";
import { Link } from "react-router-dom";
import { formatCOP, formatDate, formatMonthYear } from "@/lib/contabilidad";
import InmuebleForm from "@/components/rooftop/InmuebleForm";
import ContratoForm from "@/components/rooftop/ContratoForm";
import PagoForm from "@/components/rooftop/PagoForm";
import ContratoDetail from "@/components/rooftop/ContratoDetail";
import RenovarContratoDialog from "@/components/rooftop/RenovarContratoDialog";
import TerminarContratoDialog from "@/components/rooftop/TerminarContratoDialog";
import InquilinoForm from "@/components/rooftop/InquilinoForm";
import RooftopDashboard from "@/components/rooftop/RooftopDashboard";

const ESTADO_INMUEBLE_VARIANT = { disponible: "default", ocupado: "secondary", mantenimiento: "outline" };
const ESTADO_CONTRATO_VARIANT = { vigente: "default", por_vencer: "secondary", vencido: "destructive", renovado: "outline", terminado: "outline" };
const ESTADO_PAGO_VARIANT = { pendiente: "secondary", pagado: "default", parcial: "secondary", en_mora: "destructive", condonado: "outline" };

export default function AlekeRooftop() {
  const [tab, setTab] = useState("resumen");
  const [inmuebles, setInmuebles] = useState([]);
  const [contratos, setContratos] = useState([]);
  const [pagos, setPagos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [inquilinos, setInquilinos] = useState([]);
  const [cdas, setCdas] = useState([]);
  const [loading, setLoading] = useState(true);

  const [inmuebleForm, setInmuebleForm] = useState({ open: false, editing: null });
  const [contratoForm, setContratoForm] = useState({ open: false, inmueble: null });
  const [pagoForm, setPagoForm] = useState({ open: false, pago: null });
  const [contratoDetail, setContratoDetail] = useState({ open: false, contrato: null });
  const [renovar, setRenovar] = useState({ open: false, contrato: null });
  const [terminar, setTerminar] = useState({ open: false, contrato: null });
  const [gestionar, setGestionar] = useState({ open: false, inmueble: null });
  const [inquilinoForm, setInquilinoForm] = useState({ open: false, editing: null });
  const [actualizando, setActualizando] = useState(false);

  const [filtroContratoEstado, setFiltroContratoEstado] = useState("todos");
  const [filtroContratoInmueble, setFiltroContratoInmueble] = useState("todos");
  const [filtroPagoInmueble, setFiltroPagoInmueble] = useState("todos");
  const [filtroPagoEstado, setFiltroPagoEstado] = useState("todos");
  const [busquedaInquilino, setBusquedaInquilino] = useState("");
  const [filtroInmOcupacion, setFiltroInmOcupacion] = useState("todos");
  const [filtroInmEdificio, setFiltroInmEdificio] = useState("todos");
  const [busquedaInm, setBusquedaInm] = useState("");
  const [filtroDias, setFiltroDias] = useState("todos");

  const loadData = async () => {
    try {
      const [inm, cont, pag, cli, inq, cda] = await Promise.all([
        base44.entities.Inmueble.list(),
        base44.entities.ContratoArriendo.list(),
        base44.entities.PagoArriendo.list(),
        base44.entities.Cliente.list(),
        base44.entities.Inquilino.list(),
        base44.entities.CuentaAhorro.list()
      ]);
      setInmuebles(inm); setContratos(cont); setPagos(pag); setClientes(cli); setInquilinos(inq); setCdas(cda);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  // Resuelve nombre del inquilino desde Inquilino (nuevos) o Cliente (históricos)
  const clienteNombre = (id) => {
    const inq = inquilinos.find((c) => c.id === id);
    if (inq) return inq.nombre_completo;
    const cli = clientes.find((c) => c.id === id);
    return cli?.nombre || "—";
  };
  const inmuebleNombre = (id) => inmuebles.find((i) => i.id === id)?.nombre || "—";
  const contratoDeInmueble = (inmId) => contratos.find((c) => c.inmueble_id === inmId && (c.estado === "vigente" || c.estado === "por_vencer"));

  const handleActualizarEstados = async () => {
    setActualizando(true);
    try {
      const resp = await base44.functions.invoke("gestionarRooftop", { action: "actualizarEstadoContratos" });
      if (resp.data?.error) throw new Error(resp.data.error);
      await loadData();
      alert(`Estados actualizados: ${resp.data?.contratos_actualizados || 0} contratos, ${resp.data?.pagos_en_mora || 0} pagos en mora`);
    } catch (e) { alert("Error: " + e.message); }
    setActualizando(false);
  };

  const handleCambiarEstadoInmueble = async (inm, estado) => {
    if (estado === "disponible" && inm.estado === "ocupado") {
      alert("No se puede cambiar a disponible un inmueble ocupado. Termine el contrato primero.");
      return;
    }
    try {
      await base44.entities.Inmueble.update(inm.id, { estado });
      loadData();
    } catch (e) { alert("Error: " + e.message); }
  };

  const handleEliminarInquilino = async (inq) => {
    const usado = contratos.some((c) => c.inquilino_id === inq.id && (c.estado === "vigente" || c.estado === "por_vencer"));
    if (usado) { alert("Este inquilino tiene un contrato activo. No se puede eliminar."); return; }
    if (!confirm(`¿Eliminar al inquilino ${inq.nombre_completo}?`)) return;
    try {
      await base44.entities.Inquilino.delete(inq.id);
      loadData();
    } catch (e) { alert("Error: " + e.message); }
  };

  // === Alertas calculadas ===
  const hoy = new Date().toISOString().substring(0, 10);
  const hoyDate = new Date(hoy + "T00:00:00");
  const en30dias = new Date(hoyDate.getTime() + 30 * 86400000).toISOString().substring(0, 10);
  const en7dias = new Date(hoyDate.getTime() + 7 * 86400000).toISOString().substring(0, 10);

  const contratosPorVencer = useMemo(() =>
    contratos.filter((c) => (c.estado === "vigente" || c.estado === "por_vencer") && c.fecha_fin >= hoy && c.fecha_fin <= en30dias)
      .sort((a, b) => a.fecha_fin.localeCompare(b.fecha_fin)), [contratos, hoy, en30dias]);

  const pagosEnMora = useMemo(() =>
    pagos.filter((p) => p.estado === "en_mora").sort((a, b) => (b.dias_mora || 0) - (a.dias_mora || 0)), [pagos]);

  const proximosPagos = useMemo(() =>
    pagos.filter((p) => p.estado === "pendiente" && p.fecha_vencimiento >= hoy && p.fecha_vencimiento <= en7dias)
      .sort((a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento)), [pagos, hoy, en7dias]);

  // === Filtros contratos ===
  const contratosFiltrados = useMemo(() => {
    return contratos.filter((c) => {
      const matchEstado = filtroContratoEstado === "todos" || c.estado === filtroContratoEstado;
      const matchInmueble = filtroContratoInmueble === "todos" || c.inmueble_id === filtroContratoInmueble;
      return matchEstado && matchInmueble;
    }).sort((a, b) => (b.fecha_inicio || "").localeCompare(a.fecha_inicio || ""));
  }, [contratos, filtroContratoEstado, filtroContratoInmueble]);

  // === Filtros pagos ===
  const pagosFiltrados = useMemo(() => {
    return pagos.filter((p) => {
      const matchInmueble = filtroPagoInmueble === "todos" || p.inmueble_id === filtroPagoInmueble;
      const matchEstado = filtroPagoEstado === "todos" || p.estado === filtroPagoEstado;
      return matchInmueble && matchEstado;
    }).sort((a, b) => (b.periodo || "").localeCompare(a.periodo || ""));
  }, [pagos, filtroPagoInmueble, filtroPagoEstado]);

  const inquilinosFiltrados = useMemo(() => {
    const q = busquedaInquilino.trim().toLowerCase();
    if (!q) return inquilinos;
    return inquilinos.filter((i) =>
      (i.nombre_completo || "").toLowerCase().includes(q) ||
      (i.numero_documento || "").toLowerCase().includes(q) ||
      (i.email || "").toLowerCase().includes(q)
    );
  }, [inquilinos, busquedaInquilino]);

  const edificioDe = (inm) => {
    const n = ((inm.nombre || "") + " " + (inm.direccion || "")).toLowerCase();
    if (n.includes("venecia")) return "venecia";
    if (n.includes("parques")) return "parques_1";
    return "aleke";
  };

  const inmueblesFiltrados = useMemo(() => {
    return inmuebles.filter((inm) => {
      const occ = filtroInmOcupacion === "todos" || (filtroInmOcupacion === "ocupado" ? inm.estado === "ocupado" : inm.estado !== "ocupado");
      const edif = filtroInmEdificio === "todos" || edificioDe(inm) === filtroInmEdificio;
      const q = busquedaInm.trim().toLowerCase();
      const match = !q || (inm.nombre || "").toLowerCase().includes(q) || (inm.direccion || "").toLowerCase().includes(q);
      return occ && edif && match;
    });
  }, [inmuebles, filtroInmOcupacion, filtroInmEdificio, busquedaInm]);

  const pendientesDia = useMemo(() => {
    const rango = { hoy: 0, "3dias": 3, semana: 7, "30dias": 30 };
    const limite = rango[filtroDias];
    return pagos
      .filter((p) => p.estado === "pendiente" || p.estado === "parcial" || p.estado === "en_mora")
      .filter((p) => {
        if (p.estado === "en_mora") return true;
        if (filtroDias === "todos") return true;
        const venc = new Date(p.fecha_vencimiento + "T00:00:00").getTime();
        const diff = Math.floor((venc - hoyDate.getTime()) / 86400000);
        return diff >= 0 && diff <= limite;
      })
      .sort((a, b) => (a.fecha_vencimiento || "").localeCompare(b.fecha_vencimiento || ""));
  }, [pagos, filtroDias, hoyDate]);

  if (loading) return <div className="p-8 text-muted-foreground">Cargando módulo Aleke Rooftop...</div>;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-heading font-semibold">Aleke Rooftop — Arriendos</h1>
        <Button variant="outline" size="sm" onClick={handleActualizarEstados} disabled={actualizando}>
          <RefreshCw className={`w-4 h-4 mr-2 ${actualizando ? "animate-spin" : ""}`} />
          {actualizando ? "Actualizando..." : "Actualizar estados"}
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="resumen"><LayoutDashboard className="w-4 h-4 mr-1" />Resumen</TabsTrigger>
          <TabsTrigger value="inmuebles"><Home className="w-4 h-4 mr-1" />Inmuebles</TabsTrigger>
          <TabsTrigger value="inquilinos"><Users className="w-4 h-4 mr-1" />Inquilinos</TabsTrigger>
          <TabsTrigger value="contratos"><FileText className="w-4 h-4 mr-1" />Contratos</TabsTrigger>
          <TabsTrigger value="pagos">Pagos</TabsTrigger>
          <TabsTrigger value="alertas"><AlertTriangle className="w-4 h-4 mr-1" />Alertas</TabsTrigger>
        </TabsList>

        {/* === TAB: RESUMEN === */}
        <TabsContent value="resumen">
          <RooftopDashboard inmuebles={inmuebles} contratos={contratos} pagos={pagos} clienteNombre={clienteNombre} />
        </TabsContent>

        {/* === TAB 1: INMUEBLES === */}
        <TabsContent value="inmuebles" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <Input placeholder="Buscar apartamento..." value={busquedaInm} onChange={(e) => setBusquedaInm(e.target.value)} className="max-w-xs h-9" />
              <Select value={filtroInmOcupacion} onValueChange={setFiltroInmOcupacion}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="ocupado">Ocupados</SelectItem>
                  <SelectItem value="desocupado">Desocupados</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filtroInmEdificio} onValueChange={setFiltroInmEdificio}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los edificios</SelectItem>
                  <SelectItem value="aleke">Aleke</SelectItem>
                  <SelectItem value="venecia">Venecia</SelectItem>
                  <SelectItem value="parques_1">Parques 1</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => setInmuebleForm({ open: true, editing: null })}>
              <Plus className="w-4 h-4 mr-2" /> Nuevo Inmueble
            </Button>
          </div>
          {inmueblesFiltrados.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">No hay inmuebles registrados.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {inmueblesFiltrados.map((inm) => {
                const cont = contratoDeInmueble(inm.id);
                const diasRestantes = cont ? Math.floor((new Date(cont.fecha_fin + "T00:00:00") - hoyDate) / 86400000) : null;
                const porVencer = cont && diasRestantes !== null && diasRestantes <= 30 && diasRestantes >= 0;
                return (
                  <Card key={inm.id} className="hover:border-primary/50 transition-colors">
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                            <Home className="w-4 h-4 text-primary" />
                          </div>
                          <div>
                            <div className="font-medium text-sm">{inm.nombre}</div>
                            {inm.direccion && <div className="text-[10px] text-muted-foreground">{inm.direccion}</div>}
                          </div>
                        </div>
                        <Badge variant={porVencer ? "secondary" : ESTADO_INMUEBLE_VARIANT[inm.estado] || "outline"} className="text-[10px]">
                          {porVencer ? "Por vencer" : inm.estado}
                        </Badge>
                      </div>
                      <div className="text-sm space-y-0.5">
                        <div><span className="text-muted-foreground text-xs">Arriendo:</span> <span className="font-bold text-primary">{formatCOP(inm.valor_arriendo)}</span><span className="text-xs text-muted-foreground">/mes</span></div>
                        <div><span className="text-muted-foreground text-xs">Inquilino:</span> {inm.estado === "ocupado" ? clienteNombre(inm.inquilino_id) : "—"}</div>
                        {cont && <div><span className="text-muted-foreground text-xs">Pago:</span> día {new Date(cont.fecha_inicio + "T00:00:00").getDate()} de cada mes</div>}
                        {cont && <div><span className="text-muted-foreground text-xs">Contrato vence:</span> <span className="font-mono text-xs">{formatDate(cont.fecha_fin)}</span></div>}
                      </div>
                      <div className="flex gap-1 pt-1 border-t border-border/40">
                        <Button size="sm" variant="outline" onClick={() => { setTab("pagos"); setFiltroPagoInmueble(inm.id); }}>Ver pagos</Button>
                        <Button size="sm" variant="ghost" onClick={() => setGestionar({ open: true, inmueble: inm })}>Gestionar</Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* === TAB: INQUILINOS === */}
        <TabsContent value="inquilinos" className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <Input placeholder="Buscar inquilino (nombre, documento, email)..." value={busquedaInquilino} onChange={(e) => setBusquedaInquilino(e.target.value)} className="max-w-sm" />
            <Button onClick={() => setInquilinoForm({ open: true, editing: null })}>
              <Plus className="w-4 h-4 mr-2" /> Nuevo Inquilino
            </Button>
          </div>
          <Card>
            <CardContent className="p-0 overflow-auto max-h-[70vh]">
              <table className="w-full text-sm thead-sticky">
                <thead className="border-b text-left text-xs text-muted-foreground uppercase">
                  <tr>
                    <th className="px-4 py-2 font-medium">Nombre</th>
                    <th className="px-4 py-2 font-medium">Documento</th>
                    <th className="px-4 py-2 font-medium">Contacto</th>
                    <th className="px-4 py-2 font-medium text-center">Estado</th>
                    <th className="px-4 py-2 font-medium text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {inquilinosFiltrados.map((i) => {
                    const tieneContrato = contratos.some((c) => c.inquilino_id === i.id && (c.estado === "vigente" || c.estado === "por_vencer"));
                    return (
                      <tr key={i.id} className="border-b border-border/40 hover:bg-muted/30">
                        <td className="px-4 py-2 font-medium">{i.nombre_completo}</td>
                        <td className="px-4 py-2 font-mono text-xs">{i.tipo_documento} {i.numero_documento}{i.lugar_expedicion ? ` · ${i.lugar_expedicion}` : ""}</td>
                        <td className="px-4 py-2 text-xs">
                          {i.email && <div className="flex items-center gap-1"><Mail className="w-3 h-3" />{i.email}</div>}
                          {i.telefono && <div className="flex items-center gap-1"><Phone className="w-3 h-3" />{i.telefono}</div>}
                        </td>
                        <td className="px-4 py-2 text-center">
                          <Badge variant={i.estado === "activo" ? "default" : "outline"} className="text-[10px]">{i.estado}</Badge>
                          {tieneContrato && <Badge variant="secondary" className="text-[10px] ml-1">con contrato</Badge>}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex justify-end gap-1">
                            <Button size="icon" variant="ghost" title="Editar" onClick={() => setInquilinoForm({ open: true, editing: i })}><Pencil className="w-4 h-4" /></Button>
                            <Button size="icon" variant="ghost" title="Eliminar" onClick={() => handleEliminarInquilino(i)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {inquilinosFiltrados.length === 0 && (<tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Sin inquilinos para mostrar.</td></tr>)}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* === TAB: CONTRATOS === */}
        <TabsContent value="contratos" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2">
              <Select value={filtroContratoEstado} onValueChange={setFiltroContratoEstado}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los estados</SelectItem>
                  <SelectItem value="vigente">Vigentes</SelectItem>
                  <SelectItem value="por_vencer">Por vencer</SelectItem>
                  <SelectItem value="vencido">Vencidos</SelectItem>
                  <SelectItem value="terminado">Terminados</SelectItem>
                  <SelectItem value="renovado">Renovados</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filtroContratoInmueble} onValueChange={setFiltroContratoInmueble}>
                <SelectTrigger className="w-40"><SelectValue placeholder="Inmueble" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los inmuebles</SelectItem>
                  {inmuebles.map((i) => (<SelectItem key={i.id} value={i.id}>{i.nombre}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => setContratoForm({ open: true, inmueble: null })}>
              <Plus className="w-4 h-4 mr-2" /> Nuevo Contrato
            </Button>
          </div>
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs text-muted-foreground uppercase">
                  <tr>
                    <th className="px-4 py-3 font-medium">Código</th>
                    <th className="px-4 py-3 font-medium">Inmueble</th>
                    <th className="px-4 py-3 font-medium">Inquilino</th>
                    <th className="px-4 py-3 font-medium">Inicio</th>
                    <th className="px-4 py-3 font-medium">Fin</th>
                    <th className="px-4 py-3 font-medium text-right">Valor</th>
                    <th className="px-4 py-3 font-medium text-center">PDF</th>
                    <th className="px-4 py-3 font-medium text-center">Estado</th>
                    <th className="px-4 py-3 font-medium text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {contratosFiltrados.map((c) => (
                    <tr key={c.id} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="px-4 py-2 font-mono text-xs text-primary">{c.codigo}</td>
                      <td className="px-4 py-2">{inmuebleNombre(c.inmueble_id)}</td>
                      <td className="px-4 py-2">{clienteNombre(c.inquilino_id)}</td>
                      <td className="px-4 py-2 font-mono text-xs">{formatDate(c.fecha_inicio)}</td>
                      <td className="px-4 py-2 font-mono text-xs">{formatDate(c.fecha_fin)}</td>
                      <td className="px-4 py-2 text-right font-mono">{formatCOP(c.valor_arriendo)}</td>
                      <td className="px-4 py-2 text-center">
                        {c.documento_pdf_url
                          ? <Badge variant="default" className="text-[10px]">PDF</Badge>
                          : <Badge variant="outline" className="text-[10px]">—</Badge>}
                      </td>
                      <td className="px-4 py-2 text-center">
                        <Badge variant={ESTADO_CONTRATO_VARIANT[c.estado] || "outline"} className="text-xs">
                          {c.estado === "por_vencer" && <AlertTriangle className="w-3 h-3 mr-1" />}
                          {c.estado}
                        </Badge>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" title="Ver detalles" onClick={() => setContratoDetail({ open: true, contrato: c })}><Eye className="w-4 h-4" /></Button>
                          {(c.estado === "por_vencer" || c.estado === "vencido") && (
                            <Button size="icon" variant="ghost" title="Renovar" onClick={() => setRenovar({ open: true, contrato: c })}><RefreshCw className="w-4 h-4 text-primary" /></Button>
                          )}
                          {c.estado === "vigente" && (
                            <Button size="icon" variant="ghost" title="Terminar" onClick={() => setTerminar({ open: true, contrato: c })}><AlertTriangle className="w-4 h-4 text-destructive" /></Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {contratosFiltrados.length === 0 && (<tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">Sin contratos para mostrar.</td></tr>)}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* === TAB: PAGOS === */}
        <TabsContent value="pagos" className="space-y-4">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <h2 className="text-sm font-semibold uppercase text-muted-foreground">Pendientes y en mora</h2>
              <div className="flex gap-2">
                <Select value={filtroDias} onValueChange={setFiltroDias}>
                  <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="hoy">Vencen hoy</SelectItem>
                    <SelectItem value="3dias">En 3 días</SelectItem>
                    <SelectItem value="semana">Esta semana</SelectItem>
                    <SelectItem value="30dias">Próximos 30 días</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {pendientesDia.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No hay pagos pendientes para este filtro.</p>
            ) : (
              <Card>
                <CardContent className="p-0 overflow-x-auto max-h-[60vh]">
                  <table className="w-full text-sm thead-sticky">
                    <thead className="border-b text-left text-xs text-muted-foreground uppercase">
                      <tr>
                        <th className="px-3 py-2 font-medium">Inmueble</th>
                        <th className="px-3 py-2 font-medium">Inquilino</th>
                        <th className="px-3 py-2 font-medium">Período</th>
                        <th className="px-3 py-2 font-medium">Vencimiento</th>
                        <th className="px-3 py-2 font-medium text-center">Días</th>
                        <th className="px-3 py-2 font-medium text-center">Estado</th>
                        <th className="px-3 py-2 font-medium text-right">Valor</th>
                        <th className="px-3 py-2 font-medium text-right">Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendientesDia.map((p) => {
                        const enMora = p.estado === "en_mora";
                        const dias = enMora ? p.dias_mora : Math.max(0, Math.floor((new Date(p.fecha_vencimiento + "T00:00:00") - hoyDate) / 86400000));
                        return (
                          <tr key={p.id} className={enMora ? "border-b border-border/50 bg-destructive/5" : "border-b border-border/50 hover:bg-muted/30"}>
                            <td className="px-3 py-1.5 font-medium">{inmuebleNombre(p.inmueble_id)}</td>
                            <td className="px-3 py-1.5">{clienteNombre(p.inquilino_id)}</td>
                            <td className="px-3 py-1.5 font-mono text-xs">{formatMonthYear(p.periodo)}</td>
                            <td className="px-3 py-1.5 font-mono text-xs">{formatDate(p.fecha_vencimiento)}</td>
                            <td className="px-3 py-1.5 text-center">
                              {enMora ? <span className="text-destructive font-medium">{p.dias_mora}d mora</span>
                                : dias === 0 ? <span className="text-warning font-medium">Hoy</span>
                                : <span>{dias}d</span>}
                            </td>
                            <td className="px-3 py-1.5 text-center"><Badge variant={enMora ? "destructive" : (dias === 0 ? "secondary" : "outline")} className="text-[10px]">{p.estado}</Badge></td>
                            <td className="px-3 py-1.5 text-right font-mono">{formatCOP(p.valor_esperado)}</td>
                            <td className="px-3 py-1.5 text-right">
                              <Button size="sm" onClick={() => setPagoForm({ open: true, pago: p })}>Registrar pago</Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold uppercase text-muted-foreground">Historial completo</h2>
              <div className="flex gap-2">
                <Select value={filtroPagoInmueble} onValueChange={setFiltroPagoInmueble}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos los inmuebles</SelectItem>
                    {inmuebles.map((i) => (<SelectItem key={i.id} value={i.id}>{i.nombre}</SelectItem>))}
                  </SelectContent>
                </Select>
                <Select value={filtroPagoEstado} onValueChange={setFiltroPagoEstado}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="pagado">Pagados</SelectItem>
                    <SelectItem value="pendiente">Pendientes</SelectItem>
                    <SelectItem value="en_mora">En mora</SelectItem>
                    <SelectItem value="parcial">Parciales</SelectItem>
                    <SelectItem value="condonado">Condonados</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b text-left text-xs text-muted-foreground uppercase">
                    <tr>
                      <th className="px-3 py-2 font-medium">Inmueble</th>
                      <th className="px-3 py-2 font-medium">Inquilino</th>
                      <th className="px-3 py-2 font-medium">Período</th>
                      <th className="px-3 py-2 font-medium">Vencimiento</th>
                      <th className="px-3 py-2 font-medium text-right">Esperado</th>
                      <th className="px-3 py-2 font-medium text-right">Pagado</th>
                      <th className="px-3 py-2 font-medium text-center">Mora</th>
                      <th className="px-3 py-2 font-medium text-center">Estado</th>
                      <th className="px-3 py-2 font-medium text-center">Comp.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagosFiltrados.map((p) => (
                      <tr key={p.id} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="px-3 py-1.5">{inmuebleNombre(p.inmueble_id)}</td>
                        <td className="px-3 py-1.5">{clienteNombre(p.inquilino_id)}</td>
                        <td className="px-3 py-1.5 font-mono text-xs">{formatMonthYear(p.periodo)}</td>
                        <td className="px-3 py-1.5 font-mono text-xs">{formatDate(p.fecha_vencimiento)}</td>
                        <td className="px-3 py-1.5 text-right font-mono">{formatCOP(p.valor_esperado)}</td>
                        <td className="px-3 py-1.5 text-right font-mono">{formatCOP(p.valor_pagado)}</td>
                        <td className="px-3 py-1.5 text-center">{p.dias_mora > 0 ? <span className="text-destructive">{p.dias_mora}d</span> : "—"}</td>
                        <td className="px-3 py-1.5 text-center">
                          <Badge variant={ESTADO_PAGO_VARIANT[p.estado] || "outline"} className="text-[10px]">{p.estado}</Badge>
                          {p.estado === "parcial" && p.saldo_restante > 0 && (
                            <Badge className="text-[10px] ml-1 bg-warning/20 text-warning">Falta: {formatCOP(p.saldo_restante)}</Badge>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          {p.comprobante_id ? (
                            <Link to={`/admin/contabilidad/libro-diario?comprobante_id=${p.comprobante_id}`} className="text-primary hover:underline text-xs">Ver</Link>
                          ) : "—"}
                        </td>
                      </tr>
                    ))}
                    {pagosFiltrados.length === 0 && (<tr><td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">Sin pagos registrados.</td></tr>)}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* === TAB: ALERTAS === */}
        <TabsContent value="alertas" className="space-y-4">
          {/* Apartamentos disponibles */}
          <div>
            <h2 className="text-sm font-semibold mb-2 uppercase">Apartamentos disponibles (sin arrendar)</h2>
            {inmuebles.filter((i) => i.estado === "disponible").length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No hay apartamentos disponibles.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {inmuebles.filter((i) => i.estado === "disponible").map((inm) => (
                  <div key={inm.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                    <div><span className="font-medium">{inm.nombre}</span> <span className="text-muted-foreground text-xs ml-1">{inm.direccion}</span></div>
                    <Button size="sm" variant="outline" onClick={() => setContratoForm({ open: true, inmueble: inm })}>Crear contrato</Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Contratos por vencer */}
          <div>
            <h2 className="text-sm font-semibold mb-2 uppercase text-muted-foreground">Contratos por vencer (próximos 30 días)</h2>
            {contratosPorVencer.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No hay contratos por vencer en los próximos 30 días.</p>
            ) : (
              <div className="space-y-1.5">
                {contratosPorVencer.map((c) => {
                  const dias = Math.floor((new Date(c.fecha_fin + "T00:00:00") - hoyDate) / 86400000);
                  return (
                    <div key={c.id} className="flex items-center justify-between rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-sm">
                      <div>
                        <span className="font-medium">{inmuebleNombre(c.inmueble_id)}</span>
                        <span className="text-muted-foreground ml-2">— {clienteNombre(c.inquilino_id)}</span>
                        <span className="text-muted-foreground ml-2">vence {formatDate(c.fecha_fin)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">{dias} días</Badge>
                        <Button size="sm" variant="outline" onClick={() => setRenovar({ open: true, contrato: c })}>Renovar</Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Pagos en mora */}
          <div>
            <h2 className="text-sm font-semibold mb-2 uppercase text-destructive">Pagos en mora</h2>
            {pagosEnMora.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No hay pagos en mora.</p>
            ) : (
              <div className="space-y-1.5">
                {pagosEnMora.map((p) => (
                  <div key={p.id} className="flex items-center justify-between rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
                    <div>
                      <span className="font-medium">{inmuebleNombre(p.inmueble_id)}</span>
                      <span className="text-muted-foreground ml-2">— {clienteNombre(p.inquilino_id)}</span>
                      <span className="text-muted-foreground ml-2">{formatMonthYear(p.periodo)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-destructive text-xs">{p.dias_mora} días mora</span>
                      <span className="font-bold">{formatCOP(p.valor_esperado)}</span>
                      <Button size="sm" onClick={() => setPagoForm({ open: true, pago: p })}>Registrar pago</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Próximos pagos */}
          <div>
            <h2 className="text-sm font-semibold mb-2 uppercase text-muted-foreground">Próximos pagos (esta semana)</h2>
            {proximosPagos.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No hay pagos que vencen esta semana.</p>
            ) : (
              <div className="space-y-1.5">
                {proximosPagos.map((p) => {
                  const dias = Math.floor((new Date(p.fecha_vencimiento + "T00:00:00") - hoyDate) / 86400000);
                  return (
                    <div key={p.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                      <div>
                        <span className="font-medium">{inmuebleNombre(p.inmueble_id)}</span>
                        <span className="text-muted-foreground ml-2">— {clienteNombre(p.inquilino_id)}</span>
                        <span className="text-muted-foreground ml-2">vence {formatDate(p.fecha_vencimiento)}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground text-xs">{dias === 0 ? "Hoy" : `${dias} días`}</span>
                        <span className="font-bold text-primary">{formatCOP(p.valor_esperado)}</span>
                        <Button size="sm" variant="outline" onClick={() => setPagoForm({ open: true, pago: p })}>Registrar pago anticipado</Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* === MODAL: Gestionar inmueble === */}
      <Dialog open={gestionar.open} onOpenChange={(v) => !v && setGestionar({ open: false, inmueble: null })}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Gestionar — {gestionar.inmueble?.nombre}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {gestionar.inmueble?.estado === "disponible" && (
              <Button className="w-full justify-start" onClick={() => { const inm = gestionar.inmueble; setGestionar({ open: false, inmueble: null }); setContratoForm({ open: true, inmueble: inm }); }}>
                <FileText className="w-4 h-4 mr-2" /> Crear contrato
              </Button>
            )}
            {gestionar.inmueble?.estado === "ocupado" && (
              <>
                <Button className="w-full justify-start" variant="outline" onClick={() => { const inm = gestionar.inmueble; const cont = contratoDeInmueble(inm.id); setGestionar({ open: false, inmueble: null }); if (cont) setContratoDetail({ open: true, contrato: cont }); }}>
                  <Eye className="w-4 h-4 mr-2" /> Ver contrato activo
                </Button>
                <Button className="w-full justify-start" variant="outline" onClick={() => { const inm = gestionar.inmueble; const cont = contratoDeInmueble(inm.id); setGestionar({ open: false, inmueble: null }); if (cont) setRenovar({ open: true, contrato: cont }); }}>
                  <RefreshCw className="w-4 h-4 mr-2 text-primary" /> Renovar contrato
                </Button>
                <Button className="w-full justify-start" variant="outline" onClick={() => { const inm = gestionar.inmueble; const cont = contratoDeInmueble(inm.id); setGestionar({ open: false, inmueble: null }); if (cont) setTerminar({ open: true, contrato: cont }); }}>
                  <AlertTriangle className="w-4 h-4 mr-2 text-destructive" /> Terminar contrato
                </Button>
              </>
            )}
            <Button className="w-full justify-start" variant="outline" onClick={() => { const inm = gestionar.inmueble; setGestionar({ open: false, inmueble: null }); setInmuebleForm({ open: true, editing: inm }); }}>
              <Pencil className="w-4 h-4 mr-2" /> Editar inmueble
            </Button>
            {gestionar.inmueble?.estado !== "mantenimiento" && (
              <Button className="w-full justify-start" variant="outline" onClick={() => { const inm = gestionar.inmueble; setGestionar({ open: false, inmueble: null }); handleCambiarEstadoInmueble(inm, "mantenimiento"); }}>
                <Wrench className="w-4 h-4 mr-2 text-warning" /> Cambiar a mantenimiento
              </Button>
            )}
            {gestionar.inmueble?.estado === "mantenimiento" && (
              <Button className="w-full justify-start" variant="outline" onClick={() => { const inm = gestionar.inmueble; setGestionar({ open: false, inmueble: null }); handleCambiarEstadoInmueble(inm, "disponible"); }}>
                <Home className="w-4 h-4 mr-2 text-success" /> Marcar como disponible
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* === MODALS === */}
      <InmuebleForm open={inmuebleForm.open} onOpenChange={(v) => setInmuebleForm({ open: v, editing: v ? inmuebleForm.editing : null })} editing={inmuebleForm.editing} onSaved={loadData} />
      <ContratoForm open={contratoForm.open} onOpenChange={(v) => setContratoForm({ open: v, inmueble: v ? contratoForm.inmueble : null })} inmuebles={inmuebles} inquilinos={inquilinos} cdas={cdas} inmueblePreselect={contratoForm.inmueble} onSaved={loadData} />
      <PagoForm open={pagoForm.open} onOpenChange={(v) => setPagoForm({ open: v, pago: v ? pagoForm.pago : null })} pago={pagoForm.pago} inmuebles={inmuebles} clientes={clientes} cdas={cdas} onSaved={loadData} />
      <ContratoDetail open={contratoDetail.open} onOpenChange={(v) => setContratoDetail({ open: v, contrato: v ? contratoDetail.contrato : null })} contrato={contratoDetail.contrato} inmuebles={inmuebles} clientes={clientes} inquilinos={inquilinos} pagos={pagos} cdas={cdas} onSaved={loadData} />
      <RenovarContratoDialog open={renovar.open} onOpenChange={(v) => setRenovar({ open: v, contrato: v ? renovar.contrato : null })} contrato={renovar.contrato} onSaved={loadData} />
      <TerminarContratoDialog open={terminar.open} onOpenChange={(v) => setTerminar({ open: v, contrato: v ? terminar.contrato : null })} contrato={terminar.contrato} cdas={cdas} onSaved={loadData} />
      <InquilinoForm open={inquilinoForm.open} onOpenChange={(v) => setInquilinoForm({ open: v, editing: v ? inquilinoForm.editing : null })} editing={inquilinoForm.editing} onSaved={loadData} />
    </div>
  );
}