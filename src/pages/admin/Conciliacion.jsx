import React, { useEffect, useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import MatrizConciliacion from "@/components/conciliacion/MatrizConciliacion";
import { ArrowLeft, Plus, Zap, CheckCircle2, Trash2, FileUp, Pencil, Lock, Loader2, Search } from "lucide-react";
import { formatCOP, formatDate, formatMonthYear, BANCO_NAMES } from "@/lib/contabilidad";
import LineaBancoForm from "@/components/conciliacion/LineaBancoForm";
import DiferenciasPanel from "@/components/conciliacion/DiferenciasPanel";
import PdfUploadDialog from "@/components/conciliacion/PdfUploadDialog";
import EditarLineaBancoDialog from "@/components/conciliacion/EditarLineaBancoDialog";
import ModificarSobranteDialog from "@/components/conciliacion/ModificarSobranteDialog";

const ESTADO_CONC_BADGE = {
  sin_iniciar: { label: "Pendiente", className: "bg-muted text-muted-foreground" },
  en_proceso: { label: "En proceso", className: "bg-primary/15 text-primary" },
  con_diferencias: { label: "Con diferencias", className: "bg-destructive/15 text-destructive" },
  conciliado: { label: "Conciliado ✓", className: "bg-success/15 text-success" },
  cerrado: { label: "Cerrado 🔒", className: "bg-success/25 text-success" }
};
const ESTADO_LINEA_BADGE = {
  conciliado: { label: "✓", className: "bg-success text-success-foreground" },
  sin_conciliar: { label: "✗", className: "bg-destructive text-destructive-foreground" },
  en_disputa: { label: "!", className: "bg-warning text-warning-foreground" }
};

export default function Conciliacion() {
  const [extractos, setExtractos] = useState([]);
  const [productos, setProductos] = useState([]);
  const [cdas, setCdas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [extractoActivo, setExtractoActivo] = useState(null);
  const [wsData, setWsData] = useState(null);
  const [lineasBanco, setLineasBanco] = useState([]);
  const [tab, setTab] = useState("lineas");
  const [comparacion, setComparacion] = useState(null);
  const [loadingWs, setLoadingWs] = useState(false);
  const [pdfModal, setPdfModal] = useState(false);
  const [editarLineaModal, setEditarLineaModal] = useState({ open: false, linea: null });
  const [modificarSistemaModal, setModificarSistemaModal] = useState({ open: false, movimiento: null });
  const [savingModificar, setSavingModificar] = useState(false);
  const [editandoSaldoAnt, setEditandoSaldoAnt] = useState(false);
  const [valorSaldoAnt, setValorSaldoAnt] = useState("");
  const [periodoFiltro, setPeriodoFiltro] = useState("todos");
  const [busquedaTdc, setBusquedaTdc] = useState("");
  const [vistaTab, setVistaTab] = useState("control");

  const normalize = (s) => (s || "").toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const [ajustePesoDialog, setAjustePesoDialog] = useState(false);
  const [ajustandoPeso, setAjustandoPeso] = useState(false);
  const [clientes, setClientes] = useState([]);

  const loadData = async () => {
    try {
      const [exts, prods, cdaList, cliList] = await Promise.all([
        base44.entities.ExtractoProducto.list("-fecha_pago"),
        base44.entities.ProductoCredito.list(),
        base44.entities.CuentaAhorro.list(),
        base44.entities.Cliente.list()
      ]);
      setExtractos(exts); setProductos(prods); setCdas(cdaList); setClientes(cliList);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const productoMap = useMemo(() => {
    const m = {};
    productos.forEach((p) => { m[p.id] = p; });
    return m;
  }, [productos]);

  const clienteMap = useMemo(() => {
    const m = {};
    clientes.forEach((c) => { m[c.id] = c; });
    return m;
  }, [clientes]);

  const periodos = useMemo(() => {
    const s = new Set(extractos.map((e) => e.periodo).filter(Boolean));
    return Array.from(s).sort().reverse();
  }, [extractos]);

  const extractosConciliar = extractos.filter((e) =>
    e.estado !== "pendiente_registro" && e.estado !== "saltado" && (periodoFiltro === "todos" || e.periodo === periodoFiltro)
  );
  const extractosFiltradosTdc = busquedaTdc.trim()
    ? extractosConciliar.filter((e) => {
        const q = normalize(busquedaTdc);
        const prod = productoMap[e.producto_id];
        const cliente = clienteMap[prod?.titular_id];
        return [prod?.nombre, prod?.numero_completo, prod?.nomenclatura, BANCO_NAMES[prod?.banco], prod?.banco, cliente?.nombre, e.periodo]
          .some((v) => normalize(v).includes(q));
      })
    : extractosConciliar;
  const porConciliar = extractosFiltradosTdc.filter((e) =>
    !e.estado_conciliacion || ["sin_iniciar", "en_proceso", "con_diferencias"].includes(e.estado_conciliacion)
  );
  const yaConciliados = extractosFiltradosTdc.filter((e) => ["conciliado", "cerrado"].includes(e.estado_conciliacion));

  const abrirConciliacion = async (ext) => {
    setExtractoActivo(ext);
    setLoadingWs(true);
    try {
      const resp = await base44.functions.invoke("conciliarExtracto", {
        action: "iniciarConciliacion", extracto_id: ext.id
      });
      if (resp.data?.error) throw new Error(resp.data.error);
      setWsData(resp.data);
      setLineasBanco(resp.data.lineas_banco || []);
      setComparacion(null);
      setTab("lineas");
    } catch (e) { alert("Error: " + e.message); }
    setLoadingWs(false);
  };

  const refreshWs = async () => {
    if (!extractoActivo) return;
    const resp = await base44.functions.invoke("conciliarExtracto", {
      action: "iniciarConciliacion", extracto_id: extractoActivo.id
    });
    setWsData(resp.data);
    setLineasBanco(resp.data.lineas_banco || []);
    if (comparacion) {
      const compResp = await base44.functions.invoke("conciliarExtracto", {
        action: "compararMovimientos", extracto_id: extractoActivo.id
      });
      setComparacion(compResp.data);
    }
  };

  const handleComparar = async () => {
    try {
      const resp = await base44.functions.invoke("conciliarExtracto", {
        action: "compararMovimientos", extracto_id: extractoActivo.id
      });
      if (resp.data?.error) { alert("Error: " + resp.data.error); return; }
      setComparacion(resp.data);
      const lineasResp = await base44.entities.LineaExtracto.filter({ extracto_id: extractoActivo.id });
      setLineasBanco(lineasResp);
      const wsResp = await base44.functions.invoke("conciliarExtracto", {
        action: "iniciarConciliacion", extracto_id: extractoActivo.id
      });
      setWsData(wsResp.data);
      setTab("diferencias");
    } catch (e) { alert("Error: " + e.message); }
  };

  const handleLineAdded = async () => {
    const lineasResp = await base44.entities.LineaExtracto.filter({ extracto_id: extractoActivo.id });
    setLineasBanco(lineasResp);
  };

  const handleDeleteLinea = async (linea) => {
    if (!window.confirm("¿Eliminar esta línea del extracto?")) return;
    try {
      await base44.entities.LineaExtracto.delete(linea.id);
      handleLineAdded();
    } catch (e) { alert("Error: " + e.message); }
  };

  const handleCrearFaltante = async (lineaId, contrapartidaSubcuenta, descAdicional) => {
    try {
      const resp = await base44.functions.invoke("conciliarExtracto", {
        action: "crearMovimientoFaltante", linea_banco_id: lineaId,
        contrapartida_subcuenta: contrapartidaSubcuenta, descripcion_adicional: descAdicional
      });
      if (resp.data?.error) throw new Error(resp.data.error);
      await refreshWs();
    } catch (e) { alert("Error: " + e.message); }
  };

  const handleAjustarDiferente = async (lineaId, movimientoId, accion) => {
    try {
      const resp = await base44.functions.invoke("conciliarExtracto", {
        action: "ajustarMovimientoDiferente", linea_banco_id: lineaId,
        movimiento_sistema_id: movimientoId, accion
      });
      if (resp.data?.error) throw new Error(resp.data.error);
      await refreshWs();
    } catch (e) { alert("Error: " + e.message); }
  };

  const handleMarcarSobrante = async (movimientoId, accion) => {
    try {
      const resp = await base44.functions.invoke("conciliarExtracto", {
        action: "marcarSobrante", movimiento_sistema_id: movimientoId, accion
      });
      if (resp.data?.error) throw new Error(resp.data.error);
      await refreshWs();
    } catch (e) { alert("Error: " + e.message); }
  };

  const handleMarcarEnDisputa = async (lineaId) => {
    try {
      await base44.entities.LineaExtracto.update(lineaId, { estado_conciliacion: "en_disputa" });
      const lineasResp = await base44.entities.LineaExtracto.filter({ extracto_id: extractoActivo.id });
      setLineasBanco(lineasResp);
    } catch (e) { alert("Error: " + e.message); }
  };

  const handleModificarSobrante = async (data) => {
    setSavingModificar(true);
    try {
      const resp = await base44.functions.invoke("conciliarExtracto", {
        action: "modificarSobrante", ...data, extracto_id: extractoActivo.id
      });
      if (resp.data?.error) throw new Error(resp.data.error);
      if (resp.data?.warnings?.length) alert("Advertencias: " + resp.data.warnings.join("; "));
      await refreshWs();
    } catch (e) { alert("Error: " + e.message); }
    setSavingModificar(false);
  };

  const handleCerrar = async () => {
    if (!window.confirm("¿Cerrar la conciliación definitivamente? Una vez cerrada NO podrá modificarse ni reabrirse.")) return;
    try {
      const resp = await base44.functions.invoke("conciliarExtracto", {
        action: "cerrarConciliacion", extracto_id: extractoActivo.id
      });
      if (resp.data?.error) {
        alert("No se puede cerrar la conciliación:\n\n" + resp.data.error);
        return;
      }
      alert("✓ Conciliación cerrada y bloqueada. Queda irreversible contra modificaciones.");
      setExtractoActivo(null);
      loadData();
    } catch (e) {
      // El SDK lanza ante respuestas no-2xx; el mensaje real del backend está en e.response.data.error.
      const msg = e?.response?.data?.error || e?.message || "Error desconocido";
      alert("No se puede cerrar la conciliación:\n\n" + msg);
    }
  };

  const handleAjustarAlPeso = async () => {
    setAjustandoPeso(true);
    try {
      const resp = await base44.functions.invoke("conciliarExtracto", {
        action: "ajustarAlPeso", extracto_id: extractoActivo.id
      });
      if (resp.data?.error) { alert("Error: " + resp.data.error); return; }
      await refreshWs();
      setAjustePesoDialog(false);
      alert("✓ Ajuste al peso aplicado. Diferencia ajustada: " + formatCOP(resp.data?.diferencia_ajustada || 0));
    } catch (e) { alert("Error: " + e.message); }
    setAjustandoPeso(false);
  };

  const handleReactivarSaltado = async (ext) => {
    if (!window.confirm(`¿Reactivar el período ${ext.periodo}? Se eliminará el registro de salto y el período quedará pendiente de cargar nuevamente.`)) return;
    try {
      await base44.entities.ExtractoProducto.delete(ext.id);
      loadData();
    } catch (e) { alert("Error: " + e.message); }
  };

  const handleEliminarConciliacion = async (ext) => {
    if (!window.confirm(`¿Eliminar la conciliación del período ${ext.periodo} del listado? Se removerán las líneas del extracto. Los movimientos contables asociados se conservan.`)) return;
    try {
      const resp = await base44.functions.invoke("conciliarExtracto", {
        action: "eliminarConciliacion", extracto_id: ext.id
      });
      if (resp.data?.error) { alert("Error: " + resp.data.error); return; }
      if (extractoActivo?.id === ext.id) setExtractoActivo(null);
      loadData();
    } catch (e) { alert("Error: " + e.message); }
  };

  const handleSalvarSaldoAnterior = async () => {
    const v = Number(valorSaldoAnt) || 0;
    try {
      await base44.entities.ExtractoProducto.update(extractoActivo.id, { saldo_anterior: v });
      setEditandoSaldoAnt(false);
      await refreshWs();
      loadData();
    } catch (e) { alert("Error: " + e.message); }
  };

  const matchMap = useMemo(() => {
    const map = {};
    if (comparacion?.conciliados) {
      comparacion.conciliados.forEach((c) => {
        const lbId = c?.linea_banco?.id || c?.linea_banco_id || c?.id;
        const msId = c?.movimiento_sistema?.id || c?.movimiento_sistema_id;
        if (lbId && msId) map[lbId] = msId;
      });
    }
    return map;
  }, [comparacion]);

  if (loading) return <div className="p-8 text-muted-foreground">Cargando conciliaciones...</div>;

  // === NIVEL 1 ===
  if (!extractoActivo) {
    return (
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-heading font-semibold">Conciliación Bancaria</h1>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busquedaTdc}
                onChange={(e) => setBusquedaTdc(e.target.value)}
                placeholder="Buscar tarjeta / banco / titular..."
                className="h-8 text-xs pl-8 w-64"
              />
            </div>
            <Select value={periodoFiltro} onValueChange={setPeriodoFiltro}>
              <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los períodos</SelectItem>
                {periodos.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={() => setPdfModal(true)}>
              <FileUp className="w-4 h-4 mr-1" /> Cargar extracto PDF
            </Button>
          </div>
        </div>
        <Tabs value={vistaTab} onValueChange={setVistaTab}>
          <TabsList>
            <TabsTrigger value="control">Control de conciliación</TabsTrigger>
            <TabsTrigger value="por_conciliar">Por conciliar ({porConciliar.length})</TabsTrigger>
            <TabsTrigger value="conciliados">Conciliados ({yaConciliados.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="control">
            <MatrizConciliacion
              productos={productos}
              extractos={busquedaTdc.trim() ? extractosFiltradosTdc : extractos}
              clienteMap={clienteMap}
              onAbrir={abrirConciliacion}
              onCargar={() => setPdfModal(true)}
              onReactivarSaltado={handleReactivarSaltado}
            />
          </TabsContent>
          <TabsContent value="por_conciliar">
            <div>
              <h2 className="text-sm font-semibold uppercase text-muted-foreground mb-2">Por conciliar</h2>
          {porConciliar.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No hay extractos pendientes de conciliación.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {porConciliar.map((ext) => {
                const prod = productoMap[ext.producto_id];
                const badge = ESTADO_CONC_BADGE[ext.estado_conciliacion || "sin_iniciar"];
                return (
                  <Card key={ext.id} className="hover:border-primary/50 transition-colors cursor-pointer" onClick={() => abrirConciliacion(ext)}>
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-medium text-sm">{prod?.nombre || "—"}</div>
                          <div className="text-xs text-muted-foreground">
                            {prod && <span>{BANCO_NAMES[prod.banco] || prod.banco} · </span>}
                            {formatMonthYear(ext.periodo)}
                          </div>
                        </div>
                        <Badge className={`text-xs ${badge.className}`}>{badge.label}</Badge>
                      </div>
                      {ext.fecha_corte && <div className="text-xs text-muted-foreground">Corte: {formatDate(ext.fecha_corte)}</div>}
                      <div className="text-sm">
                        <span className="text-muted-foreground text-xs">Saldo banco: </span>
                        <span className="font-bold text-primary">{formatCOP(ext.saldo_a_pagar)}</span>
                      </div>
                      <Button size="sm" className="w-full">Abrir conciliación →</Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
            </div>
          </TabsContent>
          <TabsContent value="conciliados">
            {yaConciliados.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No hay extractos conciliados.</p>
            ) : (
              <div>
                <h2 className="text-sm font-semibold uppercase text-muted-foreground mb-2">Conciliados</h2>
            <Card>
              <CardContent className="p-0 overflow-auto max-h-[70vh]">
                <table className="w-full text-sm thead-sticky">
                  <thead className="border-b text-left text-xs text-muted-foreground uppercase">
                    <tr>
                      <th className="px-4 py-2 font-medium">Producto</th>
                      <th className="px-4 py-2 font-medium">Período</th>
                      <th className="px-4 py-2 font-medium text-right">Saldo banco</th>
                      <th className="px-4 py-2 font-medium text-right">Diferencia</th>
                      <th className="px-4 py-2 font-medium">Fecha conc.</th>
                      <th className="px-4 py-2 font-medium">Responsable</th>
                      <th className="px-4 py-2 font-medium text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {yaConciliados.map((ext) => {
                      const prod = productoMap[ext.producto_id];
                      return (
                        <tr key={ext.id} className="border-b border-border/50 hover:bg-muted/30 cursor-pointer" onClick={() => abrirConciliacion(ext)}>
                          <td className="px-4 py-2">
                            <div className="font-medium">{prod?.nombre || "—"}</div>
                            <Badge className={`text-[10px] mt-0.5 ${ESTADO_CONC_BADGE[ext.estado_conciliacion]?.className || ""}`}>{ESTADO_CONC_BADGE[ext.estado_conciliacion]?.label || ext.estado_conciliacion}</Badge>
                          </td>
                          <td className="px-4 py-2 font-mono text-xs">{formatMonthYear(ext.periodo)}</td>
                          <td className="px-4 py-2 text-right font-mono">{formatCOP(ext.saldo_a_pagar)}</td>
                          <td className="px-4 py-2 text-right font-mono">{formatCOP(ext.diferencia_saldo || 0)}</td>
                          <td className="px-4 py-2 font-mono text-xs">{formatDate(ext.fecha_conciliacion)}</td>
                          <td className="px-4 py-2 text-xs">{ext.conciliado_por_email || "—"}</td>
                          <td className="px-4 py-2 text-right">
                            <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); handleEliminarConciliacion(ext); }}>
                              <Trash2 className="w-4 h-4 text-destructive" />
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
          </TabsContent>
        </Tabs>
        <PdfUploadDialog
          open={pdfModal}
          onOpenChange={setPdfModal}
          onConfirmado={() => loadData()}
          productos={productos.filter((p) => p.estado === "activo")}
        />
      </div>
    );
  }

  // === NIVEL 2 ===
  const ext = extractoActivo;
  const prod = productoMap[ext.producto_id];
  const esCerrado = ext.estado_conciliacion === "cerrado";
  const saldoBanco = wsData?.saldo_banco ?? ext.saldo_a_pagar;
  const saldoAnterior = wsData?.saldo_anterior ?? ext.saldo_anterior ?? 0;
  const saldoSistema = wsData?.saldo_sistema ?? ext.saldo_sistema ?? 0;
  const diferencia = wsData?.diferencia_saldo ?? ext.diferencia_saldo ?? 0;
  const porcentaje = comparacion?.resumen?.porcentaje_conciliado || 0;
  const lineasConciliadas = comparacion
    ? `${comparacion.conciliados.length}/${comparacion.resumen.total_banco} líneas`
    : "—";

  return (
    <div className="p-6 space-y-4">
      <Button variant="ghost" size="sm" onClick={() => { setExtractoActivo(null); loadData(); }}>
        <ArrowLeft className="w-4 h-4 mr-1" /> Volver
      </Button>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div>
            <div className="font-medium">{prod?.nombre} · Conciliación {formatMonthYear(ext.periodo)}</div>
            <div className="text-xs text-muted-foreground">
              Período: {wsData?.fecha_inicio_rango ? formatDate(wsData.fecha_inicio_rango) : "—"} al {ext.fecha_corte ? formatDate(ext.fecha_corte) : "—"}
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground uppercase">Saldo Banco</div>
              <div className="font-mono font-bold">{formatCOP(saldoBanco)}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground uppercase">Saldo anterior</div>
              {editandoSaldoAnt ? (
                <div className="flex items-center gap-1">
                  <Input type="number" value={valorSaldoAnt} onChange={(e) => setValorSaldoAnt(e.target.value)} className="h-7 text-xs font-mono" autoFocus onKeyDown={(e) => e.key === "Enter" && handleSalvarSaldoAnterior()} />
                  <Button size="sm" className="h-7 px-2" onClick={handleSalvarSaldoAnterior}>✓</Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditandoSaldoAnt(false)}>✕</Button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-1">
                  <div className="font-mono font-bold">{formatCOP(saldoAnterior)}</div>
                  <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => { setValorSaldoAnt(String(saldoAnterior)); setEditandoSaldoAnt(true); }}><Pencil className="w-3 h-3" /></Button>
                </div>
              )}
              <div className="text-[10px] text-muted-foreground">Cierre período anterior</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground uppercase">Mov. sistema</div>
              <div className="font-mono font-bold">{formatCOP(saldoSistema)}</div>
              <div className="text-[10px] text-muted-foreground">Suma movimientos del período</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground uppercase">Diferencia</div>
              <div className={`font-mono font-bold ${Math.abs(diferencia) < 0.01 ? "text-success" : "text-destructive"}`}>
                {Math.abs(diferencia) < 0.01 ? "✅ $0 — Cuadrado" : formatCOP(diferencia)}
              </div>
              <div className="text-[10px] text-muted-foreground">Banco − (Saldo ant. + Sistema)</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground uppercase">Conciliación</div>
              <div className="font-mono font-bold">{porcentaje}%</div>
              <Progress value={porcentaje} className="h-2 mt-1" />
              <div className="text-xs text-muted-foreground mt-0.5">{lineasConciliadas}</div>
            </div>
          </div>
          {esCerrado && (
            <div className="flex items-center gap-2 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
              <Lock className="w-4 h-4" /> Conciliación cerrada y bloqueada — solo lectura (irreversible).
            </div>
          )}
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" onClick={() => setTab("lineas")} disabled={esCerrado}><Plus className="w-4 h-4 mr-1" /> Agregar línea banco</Button>
            <Button size="sm" variant="secondary" onClick={handleComparar} disabled={lineasBanco.length === 0 || esCerrado}>
              <Zap className="w-4 h-4 mr-1" /> Comparar auto
            </Button>
            {!esCerrado && comparacion && Math.abs(diferencia) >= 0.01 &&
              (comparacion.faltantes?.length || 0) === 0 &&
              (comparacion.sobrantes?.length || 0) === 0 &&
              (comparacion.diferencias?.length || 0) === 0 && (
              <Button size="sm" variant="outline" onClick={() => setAjustePesoDialog(true)}>
                <Zap className="w-4 h-4 mr-1" /> Ajustar al peso ({formatCOP(diferencia)})
              </Button>
            )}
            {esCerrado ? (
              <>
                <Button size="sm" variant="secondary" disabled className="bg-success/20 text-success">
                  <Lock className="w-4 h-4 mr-1" /> Cerrada (irreversible)
                </Button>
                <Button size="sm" variant="destructive" onClick={() => handleEliminarConciliacion(ext)}>
                  <Trash2 className="w-4 h-4 mr-1" /> Eliminar conciliación
                </Button>
              </>
            ) : (
              <Button size="sm" variant="outline" onClick={handleCerrar}>
                <CheckCircle2 className="w-4 h-4 mr-1" /> Cerrar conciliación
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {loadingWs ? (
        <div className="text-center py-8 text-muted-foreground">Cargando datos de conciliación...</div>
      ) : (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="lineas">Ingresar líneas ({lineasBanco.length})</TabsTrigger>
            <TabsTrigger value="comparativa">Comparativa</TabsTrigger>
            <TabsTrigger value="diferencias">Diferencias y ajustes</TabsTrigger>
          </TabsList>

          <TabsContent value="lineas" className="space-y-3">
            {!esCerrado && <LineaBancoForm extractoId={ext.id} productoId={ext.producto_id} onAdded={handleLineAdded} />}
            {lineasBanco.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">No hay líneas ingresadas.</div>
            ) : (
              <Card>
                <CardContent className="p-0 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b text-left text-xs text-muted-foreground uppercase">
                      <tr>
                        <th className="px-3 py-2 font-medium">Fecha</th>
                        <th className="px-3 py-2 font-medium">Descripción</th>
                        <th className="px-3 py-2 font-medium">Tipo</th>
                        <th className="px-3 py-2 font-medium text-right">Cargo</th>
                        <th className="px-3 py-2 font-medium text-right">Abono</th>
                        <th className="px-3 py-2 font-medium text-center">Estado</th>
                        <th className="px-3 py-2 font-medium text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...lineasBanco].sort((a, b) => (a.fecha || "").localeCompare(b.fecha || "")).map((linea) => {
                        const badge = ESTADO_LINEA_BADGE[linea.estado_conciliacion] || ESTADO_LINEA_BADGE.sin_conciliar;
                        return (
                          <tr key={linea.id} className="border-b border-border/50">
                            <td className="px-3 py-1.5 font-mono text-xs">{formatDate(linea.fecha)}</td>
                            <td className="px-3 py-1.5">{linea.descripcion}</td>
                            <td className="px-3 py-1.5 text-xs">{linea.tipo}</td>
                            <td className="px-3 py-1.5 text-right font-mono">{linea.naturaleza === "cargo" ? formatCOP(linea.valor) : "—"}</td>
                            <td className="px-3 py-1.5 text-right font-mono">{linea.naturaleza === "abono" ? formatCOP(linea.valor) : "—"}</td>
                            <td className="px-3 py-1.5 text-center"><Badge className={`text-xs px-1.5 ${badge.className}`}>{badge.label}</Badge></td>
                            <td className="px-3 py-1.5 text-right">
                              <div className="flex justify-end gap-1">
                                <Button size="icon" variant="ghost" disabled={esCerrado} onClick={() => setEditarLineaModal({ open: true, linea })}><Pencil className="w-4 h-4" /></Button>
                                <Button size="icon" variant="ghost" disabled={esCerrado} onClick={() => handleDeleteLinea(linea)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}
            {lineasBanco.length > 0 && (
              <div className="flex justify-end gap-6 text-sm">
                <div>Total cargos banco: <span className="font-mono font-bold">{formatCOP(lineasBanco.filter((l) => l.naturaleza === "cargo").reduce((s, l) => s + l.valor, 0))}</span></div>
                <div>Total abonos banco: <span className="font-mono font-bold">{formatCOP(lineasBanco.filter((l) => l.naturaleza === "abono").reduce((s, l) => s + l.valor, 0))}</span></div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="comparativa">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Card>
                <CardContent className="p-0">
                  <div className="px-4 py-2 border-b font-medium text-sm">Extracto del banco ({lineasBanco.length})</div>
                  <div className="max-h-[500px] overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="border-b text-left text-muted-foreground sticky top-0 bg-card">
                        <tr>
                          <th className="px-2 py-1.5 font-medium">Fecha</th>
                          <th className="px-2 py-1.5 font-medium">Descripción</th>
                          <th className="px-2 py-1.5 font-medium text-right">Valor</th>
                          <th className="px-2 py-1.5 font-medium text-center">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...lineasBanco].sort((a, b) => (a.fecha || "").localeCompare(b.fecha || "")).map((linea) => {
                          const matched = !!matchMap[linea.id];
                          return (
                            <tr key={linea.id} className={`border-b border-border/40 ${matched ? "bg-success/10" : ""}`}>
                              <td className="px-2 py-1 font-mono">{formatDate(linea.fecha)}</td>
                              <td className="px-2 py-1 truncate max-w-[150px]">{linea.descripcion}</td>
                              <td className="px-2 py-1 text-right font-mono">{formatCOP(linea.valor)}</td>
                              <td className="px-2 py-1 text-center">
                                <Badge className={`text-[10px] px-1.5 ${matched ? "bg-success text-success-foreground" : "bg-destructive text-destructive-foreground"}`}>
                                  {matched ? "Conciliado" : "Sin conciliar"}
                                </Badge>
                              </td>
                            </tr>
                          );
                        })}
                        {lineasBanco.length === 0 && <tr><td colSpan={4} className="text-center py-4 text-muted-foreground">Sin líneas</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-0">
                  <div className="px-4 py-2 border-b font-medium text-sm">Movimientos del sistema ({wsData?.movimientos_sistema?.length || 0})</div>
                  <div className="max-h-[500px] overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="border-b text-left text-muted-foreground sticky top-0 bg-card">
                        <tr>
                          <th className="px-2 py-1.5 font-medium">Fecha</th>
                          <th className="px-2 py-1.5 font-medium">Descripción</th>
                          <th className="px-2 py-1.5 font-medium text-right">Crédito</th>
                          <th className="px-2 py-1.5 font-medium text-right">Débito</th>
                          <th className="px-2 py-1.5 font-medium text-center">Estado</th>
                          <th className="px-2 py-1.5 font-medium text-right">Acción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...(wsData?.movimientos_sistema || [])].sort((a, b) => (a.fecha || "").localeCompare(b.fecha || "")).map((mov) => {
                          const matchedIds = Object.values(matchMap);
                          const matched = matchedIds.includes(mov.id);
                          return (
                            <tr key={mov.id} className={`border-b border-border/40 ${matched ? "bg-success/10" : ""}`}>
                              <td className="px-2 py-1 font-mono">{formatDate(mov.fecha)}</td>
                              <td className="px-2 py-1 truncate max-w-[150px]">{mov.descripcion}</td>
                              <td className="px-2 py-1 text-right font-mono">{mov.credito > 0 ? formatCOP(mov.credito) : "—"}</td>
                              <td className="px-2 py-1 text-right font-mono">{mov.debito > 0 ? formatCOP(mov.debito) : "—"}</td>
                              <td className="px-2 py-1 text-center">
                                <Badge className={`text-[10px] px-1.5 ${matched ? "bg-success text-success-foreground" : "bg-warning/20 text-warning"}`}>
                                  {matched ? "Conciliado" : "Sobrante"}
                                </Badge>
                              </td>
                              <td className="px-2 py-1 text-right">
                                <Button size="sm" variant="ghost" disabled={esCerrado} onClick={() => setModificarSistemaModal({ open: true, movimiento: mov })}>Modificar</Button>
                              </td>
                            </tr>
                          );
                        })}
                        {(wsData?.movimientos_sistema || []).length === 0 && <tr><td colSpan={6} className="text-center py-4 text-muted-foreground">Sin movimientos</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="diferencias">
            <DiferenciasPanel
              comparacion={comparacion}
              cdas={cdas}
              bloqueado={esCerrado}
              onCrearFaltante={handleCrearFaltante}
              onAjustarDiferente={handleAjustarDiferente}
              onMarcarSobrante={handleMarcarSobrante}
              onModificarSobrante={handleModificarSobrante}
              onMarcarEnDisputa={handleMarcarEnDisputa}
              onCerrar={handleCerrar}
            />
          </TabsContent>
        </Tabs>
      )}

      <EditarLineaBancoDialog
        open={editarLineaModal.open}
        onOpenChange={(v) => setEditarLineaModal({ open: v, linea: v ? editarLineaModal.linea : null })}
        linea={editarLineaModal.linea}
        onSaved={handleLineAdded}
      />
      <Dialog open={ajustePesoDialog} onOpenChange={(v) => !ajustandoPeso && setAjustePesoDialog(v)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>¿Ajustar al peso?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Todas las líneas están conciliadas, pero queda una diferencia residual de{" "}
              <strong className="text-foreground">{formatCOP(diferencia)}</strong> entre el saldo del banco y el saldo del sistema (saldo anterior + movimientos).
            </p>
            <p className="text-sm text-muted-foreground">
              Si acepta, el sistema creará un movimiento de ajuste por ese valor para cuadrar la conciliación. ¿Desea ajustar al peso?
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAjustePesoDialog(false)} disabled={ajustandoPeso}>No, cancelar</Button>
            <Button onClick={handleAjustarAlPeso} disabled={ajustandoPeso}>
              {ajustandoPeso && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Sí, ajustar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ModificarSobranteDialog
        open={modificarSistemaModal.open}
        onOpenChange={(v) => setModificarSistemaModal({ open: v, movimiento: v ? modificarSistemaModal.movimiento : null })}
        movimiento={modificarSistemaModal.movimiento}
        saving={savingModificar}
        onConfirm={async (data) => {
          await handleModificarSobrante(data);
          setModificarSistemaModal({ open: false, movimiento: null });
        }}
      />

    </div>
  );
}