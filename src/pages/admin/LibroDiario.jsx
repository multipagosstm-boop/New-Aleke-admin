import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Search, Ban, Edit, ChevronDown, ChevronRight, ChevronLeft, ChevronsLeft, ChevronsRight, RefreshCw, ArrowUp, ArrowDown, ArrowUpDown, Trash2, ShieldAlert, AlertTriangle } from "lucide-react";
import { formatCOP, formatDate } from "@/lib/contabilidad";
import { cn } from "@/lib/utils";
import ComprobanteForm from "@/components/admin/ComprobanteForm";
import EditarPeriodoMovimientoDialog from "@/components/admin/EditarPeriodoMovimientoDialog";
import LibroDiarioImportExport from "@/components/admin/LibroDiarioImportExport";
import { useAuth } from "@/lib/AuthContext";
import { ROLES } from "@/lib/userStore";
import { toast } from "sonner";

export default function LibroDiario() {
  const [searchParams] = useSearchParams();
  const subcuentaFilter = searchParams.get("subcuenta");
  const { can, user: authUser } = useAuth();
  const canEditOrDelete = can('edit_delete_entries');
  const isAdmin = authUser?.rol === ROLES.ADMINISTRADOR || can('permanent_delete_entries');
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
  const [loadingMovsId, setLoadingMovsId] = useState(null);
  const [sortKey, setSortKey] = useState("fecha");
  const [sortDir, setSortDir] = useState("desc");

  // Estados para depuración y eliminación permanente (Exclusivo Administrador)
  const [eliminarDialog, setEliminarDialog] = useState(null);
  const [eliminando, setEliminando] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [seleccionados, setSeleccionados] = useState(new Set());
  const [eliminarLoteDialog, setEliminarLoteDialog] = useState(false);
  const [eliminandoLote, setEliminandoLote] = useState(false);
  const [confirmLoteText, setConfirmLoteText] = useState("");

  // Paginación
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(50);
  const tableRef = useRef(null);

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
        base44.entities.MovimientoContable.list("-fecha", 2000),
        base44.entities.Cliente.list(),
        base44.entities.CuentaAhorro.list(),
        base44.entities.ProductoCredito.list(),
        base44.entities.Cuenta.filter({ es_transaccional: true }, "codigo", 500),
        base44.auth.me().catch(() => null)
      ]);
      setComprobantes(comps || []);
      setMovimientos((movs || []).filter((m) => m.estado !== "inactivo"));
      setClientes(clients || []);
      setCuentasAhorro(cdas || []);
      setProductosCredito(prods || []);
      setPucTransaccional(puc || []);
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
    const targetCompId = searchParams.get("comprobante_id");
    if (targetCompId && !loading && comprobantes.length > 0) {
      const found = comprobantes.find((c) => c.id === targetCompId);
      if (found) {
        setBusqueda(found.numero);
        setExpanded(targetCompId);
      }
    }
  }, [searchParams, loading, comprobantes]);

  const movsByComprobante = useMemo(() => {
    const map = {};
    movimientos.forEach((m) => {
      if (m.estado === "inactivo") return;
      if (!map[m.comprobante_id]) map[m.comprobante_id] = [];
      map[m.comprobante_id].push(m);
    });
    return map;
  }, [movimientos]);

  const handleToggleExpand = async (comprobanteId) => {
    const isNowExpanded = expanded === comprobanteId ? null : comprobanteId;
    setExpanded(isNowExpanded);
    if (isNowExpanded) {
      const currentMovs = movsByComprobante[comprobanteId];
      if (!currentMovs || currentMovs.length === 0) {
        setLoadingMovsId(comprobanteId);
        try {
          const fresh = await base44.entities.MovimientoContable.filter({ comprobante_id: comprobanteId });
          const activeFresh = (fresh || []).filter((m) => m.estado !== "inactivo");
          if (activeFresh.length > 0) {
            setMovimientos((prev) => {
              const otros = prev.filter((m) => m.comprobante_id !== comprobanteId);
              return [...otros, ...activeFresh];
            });
          }
        } catch (err) {
          console.warn("Error cargando movimientos del comprobante:", err);
        } finally {
          setLoadingMovsId(null);
        }
      }
    }
  };

  const handleEditComprobante = async (c) => {
    let compMovs = [];
    try {
      const fresh = await base44.entities.MovimientoContable.filter({ comprobante_id: c.id });
      compMovs = (fresh || []).filter((m) => m.estado !== "inactivo");
      setMovimientos((prev) => {
        const otros = prev.filter((m) => m.comprobante_id !== c.id);
        return [...otros, ...compMovs];
      });
    } catch (err) {
      console.warn("Error cargando movimientos para editar:", err);
      compMovs = (movsByComprobante[c.id] || []).filter((m) => m.estado !== "inactivo");
    }
    setEditingComp(c);
    setEditingMovs(compMovs);
    setFormOpen(true);
  };

  const handleSavedComprobante = async () => {
    if (editingComp) {
      const idModificado = editingComp.id;
      setMovimientos((prev) => prev.filter((m) => m.comprobante_id !== idModificado));
      setEditingComp(null);
      setEditingMovs([]);
    }
    await loadData();
  };

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

  // Resetear a la página 1 cuando cambien filtros o criterios de búsqueda
  useEffect(() => {
    setPagina(1);
  }, [filtroTipo, filtroEstado, busqueda, filtroCuenta, filtroFecha, filtroValor, subcuentaFilter, sortKey, sortDir, porPagina]);

  // Cálculos de paginación
  const totalItems = sortedFiltered.length;
  const totalPaginas = Math.max(1, Math.ceil(totalItems / porPagina));
  const paginaValida = Math.min(Math.max(1, pagina), totalPaginas);
  const inicio = (paginaValida - 1) * porPagina;
  const fin = Math.min(inicio + porPagina, totalItems);
  const itemsPagina = useMemo(() => {
    return sortedFiltered.slice(inicio, fin);
  }, [sortedFiltered, inicio, fin]);

  const cambiarPagina = (nueva) => {
    const p = Math.min(Math.max(1, nueva), totalPaginas);
    setPagina(p);
    setExpanded(null);
    if (tableRef.current) {
      tableRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  // Precargar movimientos para los comprobantes que se están visualizando en la página actual
  useEffect(() => {
    if (itemsPagina.length === 0) return;
    const idsSinMovs = itemsPagina
      .map((c) => c.id)
      .filter((id) => !movsByComprobante[id] || movsByComprobante[id].length === 0);

    if (idsSinMovs.length > 0) {
      base44.entities.MovimientoContable.filter({ comprobante_id: { $in: idsSinMovs } }, undefined, 1000)
        .then((fresh) => {
          if (fresh && fresh.length > 0) {
            setMovimientos((prev) => {
              const existingIds = new Set(prev.map((m) => m.id));
              const newItems = fresh.filter((m) => !existingIds.has(m.id));
              return [...prev, ...newItems];
            });
          }
        })
        .catch((err) => console.warn("Error precargando movimientos de la página:", err));
    }
  }, [itemsPagina, movsByComprobante]);

  const generarBotonesPaginacion = (actual, total) => {
    if (total <= 7) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }
    const pages = [];
    if (actual <= 4) {
      pages.push(1, 2, 3, 4, 5, "...", total);
    } else if (actual >= total - 3) {
      pages.push(1, "...", total - 4, total - 3, total - 2, total - 1, total);
    } else {
      pages.push(1, "...", actual - 1, actual, actual + 1, "...", total);
    }
    return pages;
  };

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

  const handleEliminarPermanente = async () => {
    if (!eliminarDialog || !isAdmin) return;
    setEliminando(true);
    try {
      const resp = await base44.functions.invoke("eliminarComprobantePermanente", {
        comprobante_id: eliminarDialog.id
      });
      if (resp.data?.error) throw new Error(resp.data.error);
      toast.success(`Comprobante ${eliminarDialog.numero} y sus movimientos fueron eliminados permanentemente.`);
      setEliminarDialog(null);
      setConfirmText("");
      setSeleccionados((prev) => {
        const next = new Set(prev);
        next.delete(eliminarDialog.id);
        return next;
      });
      loadData();
    } catch (e) {
      console.error("Error al eliminar permanentemente:", e);
      toast.error("Error al eliminar: " + e.message);
    } finally {
      setEliminando(false);
    }
  };

  const handleToggleSelect = (id) => {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    const pageIds = itemsPagina.map((c) => c.id);
    const todosSeleccionados = pageIds.length > 0 && pageIds.every((id) => seleccionados.has(id));
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (todosSeleccionados) {
        pageIds.forEach((id) => next.delete(id));
      } else {
        pageIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const handleEliminarLotePermanente = async () => {
    if (seleccionados.size === 0 || !isAdmin) return;
    setEliminandoLote(true);
    try {
      const ids = Array.from(seleccionados);
      const resp = await base44.functions.invoke("eliminarComprobantesLotePermanente", {
        comprobante_ids: ids
      });
      if (resp.data?.error) throw new Error(resp.data.error);
      toast.success(`${resp.data.total_eliminados || ids.length} comprobantes eliminados permanentemente de la base de datos.`);
      setSeleccionados(new Set());
      setEliminarLoteDialog(false);
      setConfirmLoteText("");
      loadData();
    } catch (e) {
      console.error("Error al eliminar lote:", e);
      toast.error("Error al eliminar lote: " + e.message);
    } finally {
      setEliminandoLote(false);
    }
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
    <div className="p-3 sm:p-6 space-y-4">
      {subcuentaFilter && (
        <Card className="border-primary/30">
          <CardContent className="pt-3 pb-3 px-4 flex items-center justify-between">
            <span className="text-xs sm:text-sm">
              Filtrando por cuenta: <span className="font-mono text-primary font-semibold">{subcuentaFilter}</span>
            </span>
            <Button variant="ghost" size="sm" onClick={() => window.history.pushState({}, "", "/admin/contabilidad/libro-diario")}>
              Quitar filtro
            </Button>
          </CardContent>
        </Card>
      )}

      {/* HEADER DE ACCIONES Y FILTROS RESPONSIVO */}
      <div className="space-y-3">
        {/* FILA DE ACCIONES PRINCIPALES */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="font-mono text-xs px-2.5 py-1">
              {totalItems} {totalItems === 1 ? "comprobante" : "comprobantes"}
            </Badge>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <LibroDiarioImportExport
              comprobantes={sortedFiltered}
              movsByComprobante={movsByComprobante}
              pucTransaccional={pucTransaccional}
              clientes={clientes}
              onImported={loadData}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleRecalcularSaldos}
              disabled={recalculando}
              className="text-xs h-9 flex-1 sm:flex-initial"
            >
              <RefreshCw className={cn("w-3.5 h-3.5 mr-1.5", recalculando && "animate-spin")} />
              <span className="hidden sm:inline">Recalcular saldos</span>
              <span className="sm:hidden">Recalcular</span>
            </Button>
            <Button
              size="sm"
              onClick={() => { setEditingComp(null); setEditingMovs([]); setFormOpen(true); }}
              className="text-xs h-9 flex-1 sm:flex-initial shadow-xs"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              <span>Nuevo Comprobante</span>
            </Button>
          </div>
        </div>

        {/* CAJA DE BÚSQUEDA Y FILTROS ADAPTABLE */}
        <div className="bg-card border border-border rounded-xl p-3 shadow-xs space-y-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2">
            {/* Buscador de texto libre */}
            <div className="relative sm:col-span-2 lg:col-span-2">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar (nº, descripción, cuenta, tercero)..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="pl-9 w-full bg-background h-9 text-xs"
              />
            </div>

            {/* Cuenta PUC */}
            <div>
              <Input
                placeholder="Cuenta (cód. o nombre)"
                value={filtroCuenta}
                onChange={(e) => setFiltroCuenta(e.target.value)}
                className="w-full bg-background h-9 text-xs"
              />
            </div>

            {/* Fecha */}
            <div>
              <Input
                type="date"
                value={filtroFecha}
                onChange={(e) => setFiltroFecha(e.target.value)}
                className="w-full bg-background h-9 text-xs"
              />
            </div>

            {/* Tipo */}
            <div>
              <Select value={filtroTipo} onValueChange={setFiltroTipo}>
                <SelectTrigger className="w-full bg-background h-9 text-xs"><SelectValue /></SelectTrigger>
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
            </div>

            {/* Estado */}
            <div>
              <Select value={filtroEstado} onValueChange={setFiltroEstado}>
                <SelectTrigger className="w-full bg-background h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  <SelectItem value="contabilizado">Contabilizado</SelectItem>
                  <SelectItem value="anulado">Anulado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Segunda fila: Filtro por valor y botón limpiar */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/50">
            <div className="w-full sm:w-auto">
              <Input
                placeholder="Monto exacto ($)"
                value={filtroValor}
                onChange={(e) => setFiltroValor(e.target.value)}
                className="w-full sm:w-44 bg-background h-8 text-xs"
              />
            </div>
            {(busqueda || filtroCuenta || filtroFecha || filtroValor || filtroTipo !== "all" || filtroEstado !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setBusqueda("");
                  setFiltroCuenta("");
                  setFiltroFecha("");
                  setFiltroValor("");
                  setFiltroTipo("all");
                  setFiltroEstado("all");
                }}
                className="text-xs text-muted-foreground hover:text-foreground h-8 ml-auto"
              >
                Limpiar filtros
              </Button>
            )}
          </div>
        </div>

        {/* Barra flotante de acciones masivas para Administrador */}
        {isAdmin && seleccionados.size > 0 && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs shadow-xs">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-destructive shrink-0" />
              <span className="font-semibold text-destructive">
                {seleccionados.size} comprobante(s) seleccionado(s) para depuración permanente
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setSeleccionados(new Set())}
              >
                Deseleccionar todos
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="h-8 text-xs gap-1.5 shadow-xs font-semibold"
                onClick={() => {
                  setConfirmLoteText("");
                  setEliminarLoteDialog(true);
                }}
              >
                <Trash2 className="w-3.5 h-3.5" /> Eliminar Permanentemente ({seleccionados.size})
              </Button>
            </div>
          </div>
        )}
      </div>

      <Card ref={tableRef} className="border-border shadow-xs overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto w-full">
            <table className="min-w-[760px] w-full text-xs sm:text-sm thead-sticky">
              <thead className="border-b border-border text-left text-xs text-muted-foreground uppercase">
                <tr>
                  {isAdmin && (
                    <th className="px-2 py-3 w-8 text-center">
                      <input
                        type="checkbox"
                        checked={itemsPagina.length > 0 && itemsPagina.every((c) => seleccionados.has(c.id))}
                        onChange={handleToggleSelectAll}
                        className="rounded border-input text-primary focus:ring-primary w-3.5 h-3.5 cursor-pointer align-middle"
                        title="Seleccionar todos los de esta página"
                      />
                    </th>
                  )}
                  <th className="px-2 sm:px-3 py-3 font-medium w-8"></th>
                  <SortTh k="numero" label="Número" />
                  <SortTh k="fecha" label="Fecha" />
                  <SortTh k="tipo" label="Tipo" />
                  <SortTh k="descripcion" label="Descripción" />
                  <SortTh k="debito" label="Débito" align="text-right" />
                  <SortTh k="credito" label="Crédito" align="text-right" />
                  <th className="px-3 sm:px-4 py-3 font-medium text-center">Estado</th>
                  {canEditOrDelete && <th className="px-3 sm:px-4 py-3 font-medium text-right">Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {itemsPagina.map((c) => {
                  const movs = movsByComprobante[c.id] || [];
                  const isExpanded = expanded === c.id;
                  const isSelected = seleccionados.has(c.id);
                  return (
                    <React.Fragment key={c.id}>
                      <tr className={`border-b border-border/50 hover:bg-muted/30 transition-colors ${c.estado === "anulado" ? "opacity-60" : ""} ${isSelected ? "bg-primary/5" : ""}`}>
                        {isAdmin && (
                          <td className="px-2 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelect(c.id)}
                              className="rounded border-input text-primary focus:ring-primary w-3.5 h-3.5 cursor-pointer align-middle"
                            />
                          </td>
                        )}
                        <td className="px-2 sm:px-3 py-2">
                          <button
                            type="button"
                            onClick={() => handleToggleExpand(c.id)}
                            className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground inline-flex items-center justify-center transition-colors"
                            title={isExpanded ? "Ocultar movimientos" : "Ver movimientos del asiento"}
                          >
                            {isExpanded ? <ChevronDown className="w-4 h-4 text-primary" /> : <ChevronRight className="w-4 h-4" />}
                          </button>
                        </td>
                        <td className="px-3 sm:px-4 py-2 font-mono text-xs">{c.numero}</td>
                        <td className="px-3 sm:px-4 py-2 text-xs">{formatDate(c.fecha)}</td>
                        <td className="px-3 sm:px-4 py-2"><Badge variant="outline" className="text-xs">{c.tipo}</Badge></td>
                        <td className="px-3 sm:px-4 py-2 text-xs">{c.descripcion}</td>
                        <td className="px-3 sm:px-4 py-2 text-right font-mono text-xs">{formatCOP(c.total_debito)}</td>
                        <td className="px-3 sm:px-4 py-2 text-right font-mono text-xs">{formatCOP(c.total_credito)}</td>
                        <td className="px-3 sm:px-4 py-2 text-center">
                          <Badge variant={c.estado === "contabilizado" ? "default" : "destructive"} className="text-xs">
                            {c.estado === "contabilizado" ? "Contab." : "Anulado"}
                          </Badge>
                        </td>
                        {canEditOrDelete && (
                          <td className="px-3 sm:px-4 py-2 text-right">
                            <div className="flex gap-1 justify-end items-center">
                              {c.estado === "contabilizado" && (
                                <>
                                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => handleEditComprobante(c)}>
                                    <Edit className="w-3 h-3 mr-1" /> Modificar
                                  </Button>
                                  <Button size="sm" variant="ghost" className="h-7 text-xs text-amber-600 dark:text-amber-400" onClick={() => { setAnularDialog(c); setMotivoAnulacion(""); }}>
                                    <Ban className="w-3 h-3 mr-1" /> Anular
                                  </Button>
                                </>
                              )}
                              {isAdmin && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-xs text-destructive hover:bg-destructive/10"
                                  onClick={() => {
                                    setEliminarDialog(c);
                                    setConfirmText("");
                                  }}
                                  title="Eliminar permanentemente de la base de datos (Exclusivo Administrador)"
                                >
                                  <Trash2 className="w-3 h-3 mr-1" /> Eliminar
                                </Button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                      {isExpanded && (
                        <tr className="bg-muted/20">
                          <td colSpan={canEditOrDelete ? (isAdmin ? 10 : 9) : (isAdmin ? 9 : 8)} className="p-2 sm:p-4">
                            {loadingMovsId === c.id ? (
                              <div className="py-4 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Cargando movimientos del comprobante...
                              </div>
                            ) : movs.length === 0 ? (
                              <div className="py-3 text-center text-xs text-muted-foreground">
                                No se encontraron movimientos registrados para este comprobante.
                              </div>
                            ) : (
                              <div className="rounded-lg border border-border/70 bg-card p-2 sm:p-3 overflow-x-auto">
                                <table className="min-w-[620px] w-full text-xs">
                                  <thead className="text-muted-foreground border-b border-border/40">
                                    <tr className="text-left">
                                      <th className="py-1.5 px-2 font-medium">Cuenta</th>
                                      <th className="py-1.5 px-2 font-medium">Concepto</th>
                                      <th className="py-1.5 px-2 font-medium">Tercero</th>
                                      <th className="py-1.5 px-2 font-medium text-right">Débito</th>
                                      <th className="py-1.5 px-2 font-medium text-right">Crédito</th>
                                      <th className="py-1.5 px-2 font-medium">Período</th>
                                      <th className="py-1.5 px-2 font-medium text-right">Acción</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {movs.map((m) => (
                                      <tr key={m.id} className="border-b border-border/30 hover:bg-muted/40">
                                        <td className="py-1.5 px-2 font-mono font-medium">{m.subcuenta}</td>
                                        <td className="py-1.5 px-2">{m.cuenta_nombre} {m.descripcion && <span className="text-muted-foreground">— {m.descripcion}</span>}</td>
                                        <td className="py-1.5 px-2 text-muted-foreground">{m.tercero || "—"}</td>
                                        <td className="py-1.5 px-2 text-right font-mono">{m.debito ? formatCOP(m.debito) : ""}</td>
                                        <td className="py-1.5 px-2 text-right font-mono">{m.credito ? formatCOP(m.credito) : ""}</td>
                                        <td className="py-1.5 px-2 font-mono text-xs">{m.periodo_extracto || <span className="text-muted-foreground">—</span>}</td>
                                        <td className="py-1.5 px-2 text-right">
                                          <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => setEditarPeriodoMov(m)}>
                                            <Edit className="w-3 h-3 mr-1" /> Período
                                          </Button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                                {isAdmin && (
                                  <div className="mt-2.5 pt-2 border-t border-border/50 flex flex-wrap items-center justify-between gap-2 text-xs">
                                    <span className="text-muted-foreground flex items-center gap-1.5">
                                      <ShieldAlert className="w-3.5 h-3.5 text-destructive" />
                                      ¿Asiento duplicado o de pruebas? Puedes eliminarlo de forma definitiva:
                                    </span>
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      className="h-7 text-xs gap-1 shadow-xs font-semibold"
                                      onClick={() => {
                                        setEliminarDialog(c);
                                        setConfirmText("");
                                      }}
                                    >
                                      <Trash2 className="w-3 h-3" /> Eliminar Asiento Definitivamente
                                    </Button>
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
                {totalItems === 0 && (
                  <tr><td colSpan={canEditOrDelete ? (isAdmin ? 10 : 9) : (isAdmin ? 9 : 8)} className="px-4 py-8 text-center text-muted-foreground">No hay comprobantes registrados.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Barra de paginación responsiva */}
          {totalItems > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-3 sm:px-4 py-3 border-t border-border bg-muted/10 text-xs">
              <div className="flex flex-wrap items-center justify-between sm:justify-start gap-2 text-muted-foreground w-full sm:w-auto">
                <span>
                  Mostrando <strong className="text-foreground">{inicio + 1}</strong> - <strong className="text-foreground">{fin}</strong> de <strong className="text-foreground">{totalItems}</strong>
                </span>
                <span className="hidden sm:inline text-border">|</span>
                <div className="flex items-center gap-1.5 ml-auto sm:ml-0">
                  <span className="text-muted-foreground text-[11px]">Por hoja:</span>
                  <select
                    value={porPagina}
                    onChange={(e) => {
                      setPorPagina(Number(e.target.value));
                      setPagina(1);
                    }}
                    className="bg-background border border-input rounded px-2 py-1 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-1 w-full sm:w-auto justify-center sm:justify-end">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => cambiarPagina(1)}
                  disabled={paginaValida <= 1}
                  title="Primera página"
                >
                  <ChevronsLeft className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2 text-xs gap-1"
                  onClick={() => cambiarPagina(paginaValida - 1)}
                  disabled={paginaValida <= 1}
                  title="Página anterior"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Anterior</span>
                </Button>

                {/* Lista numérica en tablet/desktop */}
                <div className="hidden sm:flex items-center gap-1 px-1">
                  {generarBotonesPaginacion(paginaValida, totalPaginas).map((p, idx) => {
                    if (p === "...") {
                      return <span key={`ellipsis-${idx}`} className="px-1 text-muted-foreground">...</span>;
                    }
                    const esActiva = p === paginaValida;
                    return (
                      <Button
                        key={`page-${p}`}
                        variant={esActiva ? "default" : "outline"}
                        size="sm"
                        className={`h-8 w-8 p-0 text-xs ${esActiva ? "font-bold" : ""}`}
                        onClick={() => cambiarPagina(p)}
                      >
                        {p}
                      </Button>
                    );
                  })}
                </div>

                {/* Indicador compacto en móvil */}
                <span className="sm:hidden text-xs font-semibold px-2">
                  {paginaValida} / {totalPaginas}
                </span>

                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2 text-xs gap-1"
                  onClick={() => cambiarPagina(paginaValida + 1)}
                  disabled={paginaValida >= totalPaginas}
                  title="Página siguiente"
                >
                  <span className="hidden sm:inline">Siguiente</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => cambiarPagina(totalPaginas)}
                  disabled={paginaValida >= totalPaginas}
                  title="Última página"
                >
                  <ChevronsRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <ComprobanteForm
        open={formOpen}
        onOpenChange={(v) => { setFormOpen(v); if (!v) { setEditingComp(null); setEditingMovs([]); } }}
        onSaved={handleSavedComprobante}
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

      {/* Dialog para Eliminar Permanentemente (Exclusivo Administrador) */}
      <Dialog open={!!eliminarDialog} onOpenChange={(v) => !v && setEliminarDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="w-5 h-5" /> Eliminar Asiento Permanentemente
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-xs space-y-1.5 text-destructive">
              <div className="font-semibold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0" /> Acción Definitiva e Irreversible
              </div>
              <p>
                Esta función exclusiva del <strong>Administrador</strong> eliminará FÍSICAMENTE de Supabase el comprobante <strong>{eliminarDialog?.numero}</strong> y todos sus movimientos contables vinculados.
              </p>
              <p>
                Los saldos de cuentas de ahorro y tarjetas se recalcularán automáticamente tras la eliminación.
              </p>
            </div>

            <div className="text-xs bg-muted/40 p-2.5 rounded border space-y-1 font-mono">
              <div><strong>Comprobante:</strong> {eliminarDialog?.numero}</div>
              <div><strong>Fecha:</strong> {formatDate(eliminarDialog?.fecha)}</div>
              <div><strong>Tipo:</strong> {eliminarDialog?.tipo}</div>
              <div><strong>Descripción:</strong> {eliminarDialog?.descripcion || "—"}</div>
              <div><strong>Total Débito/Crédito:</strong> {formatCOP(eliminarDialog?.total_debito || 0)}</div>
            </div>

            <div className="space-y-1.5 pt-1">
              <label className="text-xs font-medium text-foreground block">
                Para confirmar la eliminación permanente, escribe la palabra <strong className="text-destructive font-mono">ELIMINAR</strong>:
              </label>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="Escribe ELIMINAR para habilitar"
                className="h-8 font-mono text-xs"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setEliminarDialog(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleEliminarPermanente}
              disabled={eliminando || confirmText.trim().toUpperCase() !== "ELIMINAR"}
              className="gap-1.5 font-semibold"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {eliminando ? "Eliminando de la base de datos..." : "Eliminar Definitivamente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog para Eliminar Lote de Asientos Permanentemente (Exclusivo Administrador) */}
      <Dialog open={eliminarLoteDialog} onOpenChange={(v) => !v && setEliminarLoteDialog(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="w-5 h-5" /> Eliminar {seleccionados.size} Asientos en Lote
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-xs space-y-1.5 text-destructive">
              <div className="font-semibold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0" /> Depuración Masiva Definitiva
              </div>
              <p>
                Se eliminarán de forma permanente <strong>{seleccionados.size} comprobantes contables</strong> y todas sus líneas de movimiento asociadas de la base de datos.
              </p>
              <p>
                Esta acción no se puede deshacer. Los saldos globales se recalcularán una vez finalizada la operación.
              </p>
            </div>

            <div className="space-y-1.5 pt-1">
              <label className="text-xs font-medium text-foreground block">
                Para confirmar la eliminación masiva, escribe <strong className="text-destructive font-mono">ELIMINAR</strong>:
              </label>
              <Input
                value={confirmLoteText}
                onChange={(e) => setConfirmLoteText(e.target.value)}
                placeholder="Escribe ELIMINAR para habilitar"
                className="h-8 font-mono text-xs"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setEliminarLoteDialog(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleEliminarLotePermanente}
              disabled={eliminandoLote || confirmLoteText.trim().toUpperCase() !== "ELIMINAR"}
              className="gap-1.5 font-semibold"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {eliminandoLote ? "Eliminando lote..." : `Eliminar ${seleccionados.size} Asientos`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}