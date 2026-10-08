import React, { useState, useEffect, useCallback, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Sparkles,
  Plus,
  RefreshCw,
  Receipt,
  FileText,
  Percent,
  Search,
  Eye,
  Trash2,
  LogOut,
  Calendar,
  TrendingDown
} from "lucide-react";
import { formatCOP, formatDate, hoyLocal } from "@/lib/contabilidad";
import {
  calcularCupoDisponible,
  calcularCupoUsado,
  formatearTasaPorcentaje
} from "@/lib/emprendamos";
import InscribirClienteDialog from "@/components/emprendamos/InscribirClienteDialog";
import NuevoPrestamoDialog from "@/components/emprendamos/NuevoPrestamoDialog";
import NuevoProductoComisionDialog from "@/components/emprendamos/NuevoProductoComisionDialog";
import RegistrarAbonoDialog from "@/components/emprendamos/RegistrarAbonoDialog";
import GenerarInteresesDialog from "@/components/emprendamos/GenerarInteresesDialog";
import EstadoCuentaDialog from "@/components/emprendamos/EstadoCuentaDialog";
import AmortizacionDialog from "@/components/emprendamos/AmortizacionDialog";
import SalidaClienteDialog from "@/components/emprendamos/SalidaClienteDialog";
import ClienteEmprendamosDetail from "@/components/emprendamos/ClienteEmprendamosDetail";
import AvisosPanel from "@/components/emprendamos/AvisosPanel";
import ImportarCreditosDialog from "@/components/emprendamos/ImportarCreditosDialog";
import { useToast } from "@/components/ui/use-toast";
import { FileSpreadsheet } from "lucide-react";

export default function Emprendamos() {
  const { toast } = useToast();
  const [tab, setTab] = useState("clientes");

  const [inscritos, setInscritos] = useState([]);
  const [creditos, setCreditos] = useState([]);
  const [abonos, setAbonos] = useState([]);
  const [intereses, setIntereses] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [cdas, setCdas] = useState([]);
  const [productos, setProductos] = useState([]);
  const [puc, setPuc] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);

  // Filtros y búsquedas
  const [busquedaClientes, setBusquedaClientes] = useState("");
  const [filtroEstadoCliente, setFiltroEstadoCliente] = useState("activos"); // 'activos' | 'todos' | 'salidos'
  const [busquedaCreditos, setBusquedaCreditos] = useState("");
  const [filtroTipoCredito, setFiltroTipoCredito] = useState("todos"); // 'todos' | 'habitual' | 'extracupo' | 'cartera_inicial' | 'comision'

  // Estados de Modales
  const [openInscribir, setOpenInscribir] = useState(false);
  const [openNuevoPrestamo, setOpenNuevoPrestamo] = useState(false);
  const [openNuevoProducto, setOpenNuevoProducto] = useState(false);
  const [openAbono, setOpenAbono] = useState(false);
  const [openGenerarIntereses, setOpenGenerarIntereses] = useState(false);
  const [openEstadoCuenta, setOpenEstadoCuenta] = useState(false);
  const [openAmortizacion, setOpenAmortizacion] = useState(false);
  const [openSalida, setOpenSalida] = useState(false);
  const [openFichaDetail, setOpenFichaDetail] = useState(false);
  const [openImportarCreditos, setOpenImportarCreditos] = useState(false);

  // Cliente o crédito seleccionado para modales contextuales
  const [selectedInscrito, setSelectedInscrito] = useState(null);
  const [selectedCredito, setSelectedCredito] = useState(null);
  const [preselectedClienteId, setPreselectedClienteId] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [insList, credList, abonList, intList, cliList, cdaList, prodList, pucList] = await Promise.all([
        base44.entities.EmprendamosCliente.list("-created_date", 1000).catch(() => []),
        base44.entities.EmprendamosCredito.list("-created_date", 2000).catch(() => []),
        base44.entities.EmprendamosAbono.list("-fecha", 2000).catch(() => []),
        base44.entities.EmprendamosInteres.list("-fecha", 2000).catch(() => []),
        base44.entities.Cliente.list().catch(() => []),
        base44.entities.CuentaAhorro.list().catch(() => []),
        base44.entities.ProductoCredito.list().catch(() => []),
        base44.entities.Cuenta.list("codigo", 5000).catch(() => [])
      ]);

      setInscritos(insList || []);
      setCreditos(credList || []);
      setAbonos(abonList || []);
      setIntereses(intList || []);
      setClientes(cliList || []);
      setCdas(cdaList || []);
      setProductos(prodList || []);
      setPuc(pucList || []);
    } catch (err) {
      console.error("Error cargando datos de Emprendamos:", err);
      toast({ variant: "destructive", title: "Error", description: "No se pudieron cargar los datos de Emprendamos." });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Recalcular estados contables y financieros
  const handleRecalcular = async () => {
    setSincronizando(true);
    try {
      await base44.functions.invoke("gestionarEmprendamos", { accion: "recalcularEstado" });
      await loadData();
      toast({ title: "Sincronización completa", description: "Saldos, cuotas y estados de Emprendamos actualizados con éxito." });
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "Error", description: err.message || "Error al sincronizar" });
    } finally {
      setSincronizando(false);
    }
  };

  // Helper para resolver nombre de cliente
  const getCliente = (clienteId) => clientes.find((c) => c.id === clienteId);
  const clienteNombre = (clienteId) => getCliente(clienteId)?.nombre || "—";

  // Métricas financieras globales
  const metricas = useMemo(() => {
    const inscritosActivos = inscritos.filter((i) => i.estado === "activo");
    const creditosVigentes = creditos.filter((c) => c.estado === "vigente");

    const carteraTotal = creditosVigentes.reduce(
      (s, c) => s + (Number(c.saldo_capital) || 0) + (Number(c.saldo_intereses) || 0),
      0
    );

    const cupoTotalAsignado = inscritosActivos.reduce((s, i) => s + (Number(i.cupo_asignado) || 0), 0);
    const cupoTotalUsado = calcularCupoUsado(creditosVigentes);
    const cupoTotalDisponible = Math.max(0, cupoTotalAsignado - cupoTotalUsado);

    // Ingresos por intereses generados
    const ingresosIntereses = intereses
      .filter((i) => i.estado !== "anulado")
      .reduce((s, i) => s + (Number(i.intereses) || 0), 0);

    // Ingresos por comisiones de nuevos productos (10%)
    const ingresosComisiones = creditos
      .filter((c) => c.tipo === "comision" && c.estado !== "anulado")
      .reduce((s, c) => s + (Number(c.capital) || 0), 0);

    return {
      carteraTotal,
      cupoTotalAsignado,
      cupoTotalUsado,
      cupoTotalDisponible,
      ingresosIntereses,
      ingresosComisiones,
      totalClientesActivos: inscritosActivos.length
    };
  }, [inscritos, creditos, intereses]);

  // Lista de clientes filtrada
  const clientesFiltrados = useMemo(() => {
    return inscritos.filter((ins) => {
      const cli = getCliente(ins.cliente_id);
      const nombre = (cli?.nombre || "").toLowerCase();
      const doc = (cli?.documento || "").toLowerCase();
      const q = busquedaClientes.toLowerCase();

      const coincideBusqueda = !q || nombre.includes(q) || doc.includes(q);
      const coincideEstado =
        filtroEstadoCliente === "todos"
          ? true
          : filtroEstadoCliente === "activos"
          ? ins.estado === "activo"
          : ins.estado === "salido";

      return coincideBusqueda && coincideEstado;
    });
  }, [inscritos, clientes, busquedaClientes, filtroEstadoCliente]);

  // Lista de créditos filtrada
  const creditosFiltrados = useMemo(() => {
    return creditos.filter((c) => {
      const cli = getCliente(c.cliente_id);
      const nombre = (cli?.nombre || "").toLowerCase();
      const cod = (c.codigo || "").toLowerCase();
      const conc = (c.concepto || "").toLowerCase();
      const q = busquedaCreditos.toLowerCase();

      const coincideBusqueda = !q || nombre.includes(q) || cod.includes(q) || conc.includes(q);
      const coincideTipo = filtroTipoCredito === "todos" || c.tipo === filtroTipoCredito;

      return coincideBusqueda && coincideTipo;
    });
  }, [creditos, clientes, busquedaCreditos, filtroTipoCredito]);

  // Handlers para abrir modales desde filas
  const handleAbrirFicha = (inscritoId) => {
    const ins = inscritos.find((i) => i.id === inscritoId);
    if (ins) {
      setSelectedInscrito(ins);
      setOpenFichaDetail(true);
    }
  };

  const handleAbrirAbono = (inscritoId) => {
    setPreselectedClienteId(inscritoId);
    setOpenAbono(true);
  };

  const handleAbrirNuevoPrestamo = (ins) => {
    setSelectedInscrito(ins);
    setPreselectedClienteId(ins.id);
    setOpenNuevoPrestamo(true);
  };

  const handleAbrirNuevoProducto = (ins) => {
    setSelectedInscrito(ins);
    setPreselectedClienteId(ins.id);
    setOpenNuevoProducto(true);
  };

  const handleAbrirEstadoCuenta = (ins) => {
    setSelectedInscrito(ins);
    setOpenEstadoCuenta(true);
  };

  const handleAbrirAmortizacion = (cred) => {
    setSelectedCredito(cred);
    setOpenAmortizacion(true);
  };

  const handleAbrirSalida = (ins) => {
    setSelectedInscrito(ins);
    setOpenSalida(true);
  };

  const handleEliminarCredito = async (creditoId) => {
    if (!window.confirm("¿Seguro que desea eliminar este crédito? Se anulará su comprobante contable si aplica.")) return;
    try {
      await base44.functions.invoke("gestionarEmprendamos", {
        accion: "eliminarCredito",
        credito_id: creditoId
      });
      toast({ title: "Crédito eliminado", description: "Se revirtió el registro y el asiento contable." });
      await loadData();
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: err.message || "No se pudo eliminar el crédito" });
    }
  };

  const handleEliminarAbono = async (abonoId) => {
    if (!window.confirm("¿Seguro que desea eliminar este abono? Se anulará su comprobante y se revertirán los saldos de los créditos.")) return;
    try {
      await base44.functions.invoke("gestionarEmprendamos", {
        accion: "eliminarAbono",
        abono_id: abonoId
      });
      toast({ title: "Abono eliminado", description: "Se anularon los movimientos contables y se restauraron los saldos." });
      await loadData();
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: err.message || "No se pudo eliminar el abono" });
    }
  };

  const handleActualizarCliente = async (datos) => {
    try {
      await base44.functions.invoke("gestionarEmprendamos", {
        accion: "editarCliente",
        ...datos
      });
      toast({ title: "Cliente actualizado", description: "Parámetros y plan guardados con éxito." });
      await loadData();
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: err.message || "No se pudo actualizar el cliente" });
    }
  };

  const handleSuccessAction = async (payload) => {
    await base44.functions.invoke("gestionarEmprendamos", payload);
    await loadData();
  };

  return (
    <div className="space-y-5 p-4 md:p-6 max-w-7xl mx-auto">
      {/* ENCABEZADO PRINCIPAL */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/10 rounded-lg text-amber-600 dark:text-amber-400">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Emprendamos</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Línea de gestión de cartera, saneamiento crediticio en Datacrédito y compras de cartera con cupos y tarjetas.
              </p>
            </div>
          </div>
        </div>

        {/* BOTONERA DE ACCIONES PRINCIPALES */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-9 text-xs"
            onClick={handleRecalcular}
            disabled={sincronizando}
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${sincronizando ? 'animate-spin' : ''}`} />
            Sincronizar Estados
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="h-9 text-xs"
            onClick={() => setOpenGenerarIntereses(true)}
          >
            <Calendar className="w-3.5 h-3.5 mr-1.5 text-amber-500" />
            Intereses (Día 30)
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="h-9 text-xs"
            onClick={() => {
              setPreselectedClienteId(null);
              setOpenNuevoProducto(true);
            }}
          >
            <Percent className="w-3.5 h-3.5 mr-1.5 text-amber-500" />
            Nuevo Producto (10%)
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="h-9 text-xs"
            onClick={() => {
              setPreselectedClienteId(null);
              setOpenNuevoPrestamo(true);
            }}
          >
            <Plus className="w-3.5 h-3.5 mr-1.5 text-blue-500" />
            Nuevo Préstamo (C02...)
          </Button>

          <Button
            size="sm"
            variant="secondary"
            className="h-9 text-xs"
            onClick={() => {
              setPreselectedClienteId(null);
              setOpenAbono(true);
            }}
          >
            <Receipt className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />
            Registrar Abono
          </Button>

          <Button
            size="sm"
            className="h-9 text-xs"
            onClick={() => setOpenInscribir(true)}
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Inscribir Cliente (C01)
          </Button>
        </div>
      </div>

      {/* TARJETAS KPI: CARTERA VIVA, CUPO TOTAL Y CUPO DISPONIBLE */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="bg-amber-500/5 border-amber-500/20">
          <CardContent className="p-3.5">
            <span className="text-[11px] text-muted-foreground block font-medium">Cartera Viva</span>
            <span className="text-xl font-bold text-amber-700 dark:text-amber-400 block mt-0.5">
              {formatCOP(metricas.carteraTotal)}
            </span>
            <span className="text-[10px] text-muted-foreground">{metricas.totalClientesActivos} clientes activos</span>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3.5">
            <span className="text-[11px] text-muted-foreground block font-medium">Cupo Total</span>
            <span className="text-xl font-bold block mt-0.5">{formatCOP(metricas.cupoTotalAsignado)}</span>
            <span className="text-[10px] text-muted-foreground">Límite cupo total</span>
          </CardContent>
        </Card>

        <Card className="bg-emerald-500/5 border-emerald-500/20">
          <CardContent className="p-3.5">
            <span className="text-[11px] text-muted-foreground block font-medium">Cupo Disponible</span>
            <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400 block mt-0.5">
              {formatCOP(metricas.cupoTotalDisponible)}
            </span>
            <span className="text-[10px] text-muted-foreground">Margen para créditos</span>
          </CardContent>
        </Card>
      </div>

      {/* PESTAÑAS PRINCIPALES DEL MÓDULO */}
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="grid grid-cols-5 w-full sm:w-auto sm:inline-flex">
          <TabsTrigger value="clientes">
            Clientes & Cartera ({inscritos.length})
          </TabsTrigger>
          <TabsTrigger value="creditos">
            Créditos ({creditos.length})
          </TabsTrigger>
          <TabsTrigger value="abonos">
            Abonos & Pagos ({abonos.length})
          </TabsTrigger>
          <TabsTrigger value="intereses">
            Intereses Causados ({intereses.length})
          </TabsTrigger>
          <TabsTrigger value="avisos">
            Avisos & Alertas
          </TabsTrigger>
        </TabsList>

        {/* =================================================================== */}
        {/* TAB 1: CLIENTES & CARTERA */}
        {/* =================================================================== */}
        <TabsContent value="clientes" className="space-y-4 pt-2">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
              <Input
                placeholder="Buscar por cliente o documento..."
                value={busquedaClientes}
                onChange={(e) => setBusquedaClientes(e.target.value)}
                className="pl-9 h-9 text-xs"
              />
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <Button
                size="sm"
                variant={filtroEstadoCliente === "activos" ? "secondary" : "ghost"}
                onClick={() => setFiltroEstadoCliente("activos")}
                className="h-8 text-xs"
              >
                Activos ({inscritos.filter(i => i.estado === 'activo').length})
              </Button>
              <Button
                size="sm"
                variant={filtroEstadoCliente === "todos" ? "secondary" : "ghost"}
                onClick={() => setFiltroEstadoCliente("todos")}
                className="h-8 text-xs"
              >
                Todos ({inscritos.length})
              </Button>
              <Button
                size="sm"
                variant={filtroEstadoCliente === "salidos" ? "secondary" : "ghost"}
                onClick={() => setFiltroEstadoCliente("salidos")}
                className="h-8 text-xs"
              >
                Salidos ({inscritos.filter(i => i.estado === 'salido').length})
              </Button>
            </div>
          </div>

          <div className="border rounded-lg overflow-hidden bg-card">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/40 border-b text-[11px] text-muted-foreground">
                <tr>
                  <th className="p-3">Cliente</th>
                  <th className="p-3">Estado</th>
                  <th className="p-3 text-center">Día Pago</th>
                  <th className="p-3 text-right">Deuda Inicial</th>
                  <th className="p-3 text-right">Deuda Actual (120502)</th>
                  <th className="p-3 text-right">Cupo TDC</th>
                  <th className="p-3 text-right">Cupo Disponible</th>
                  <th className="p-3 text-center">Tasa Acordada</th>
                  <th className="p-3">Elegible Salida</th>
                  <th className="p-3 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {clientesFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-6 text-center text-muted-foreground">
                      No se encontraron clientes inscritos en Emprendamos.
                    </td>
                  </tr>
                ) : (
                  clientesFiltrados.map((ins) => {
                    const cli = getCliente(ins.cliente_id);
                    const credsCli = creditos.filter((c) => c.emprendamos_cliente_id === ins.id && c.estado === "vigente");
                    const cupoDisp = calcularCupoDisponible(ins.cupo_asignado, credsCli);
                    const hoyDate = hoyLocal();
                    const esEligible = ins.fecha_eligible_salida && ins.fecha_eligible_salida <= hoyDate;

                    return (
                      <tr key={ins.id} className="hover:bg-muted/30">
                        <td className="p-3">
                          <button
                            type="button"
                            onClick={() => handleAbrirFicha(ins.id)}
                            className="font-bold text-foreground hover:text-primary text-left block"
                          >
                            {cli?.nombre || "Cliente"}
                          </button>
                          <span className="text-[10px] text-muted-foreground block">
                            Doc: {cli?.documento || "—"} | Ingreso: {formatDate(ins.fecha_ingreso)}
                          </span>
                        </td>
                        <td className="p-3">
                          <Badge variant={ins.estado === "activo" ? "default" : "outline"} className="text-[10px]">
                            {ins.estado}
                          </Badge>
                        </td>
                        <td className="p-3 text-center font-semibold">
                          Día {ins.dia_pago}
                        </td>
                        <td className="p-3 text-right text-muted-foreground">
                          {formatCOP(ins.capital_inicial)}
                        </td>
                        <td className="p-3 text-right font-bold text-foreground">
                          {formatCOP(ins.saldo_deuda)}
                        </td>
                        <td className="p-3 text-right font-medium">
                          {formatCOP(ins.cupo_asignado)}
                        </td>
                        <td className="p-3 text-right">
                          <span className={`font-bold ${cupoDisp > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>
                            {formatCOP(cupoDisp)}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          {formatearTasaPorcentaje(ins.tasa_acordada)}
                        </td>
                        <td className="p-3 text-[11px]">
                          {ins.fecha_eligible_salida ? (
                            <span className={esEligible ? "text-emerald-600 dark:text-emerald-400 font-semibold" : "text-muted-foreground"}>
                              {formatDate(ins.fecha_eligible_salida)}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              title="Ver ficha técnica completa"
                              onClick={() => handleAbrirFicha(ins.id)}
                            >
                              <Eye className="w-3.5 h-3.5 text-primary" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              title="Estado de Cuenta"
                              onClick={() => handleAbrirEstadoCuenta(ins)}
                            >
                              <FileText className="w-3.5 h-3.5 text-primary" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs text-emerald-600"
                              title="Registrar Abono"
                              onClick={() => handleAbrirAbono(ins.id)}
                            >
                              <Receipt className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs text-blue-600"
                              title="Nuevo Préstamo"
                              onClick={() => handleAbrirNuevoPrestamo(ins)}
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </Button>
                            {ins.estado === "activo" && esEligible && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs text-amber-600"
                                title="Salida tras 1 año"
                                onClick={() => handleAbrirSalida(ins)}
                              >
                                <LogOut className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* =================================================================== */}
        {/* TAB 2: CRÉDITOS ACTIVOS */}
        {/* =================================================================== */}
        <TabsContent value="creditos" className="space-y-4 pt-2">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
              <Input
                placeholder="Buscar por código, cliente o concepto..."
                value={busquedaCreditos}
                onChange={(e) => setBusquedaCreditos(e.target.value)}
                className="pl-9 h-9 text-xs"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <Button
                size="sm"
                variant={filtroTipoCredito === "todos" ? "secondary" : "ghost"}
                onClick={() => setFiltroTipoCredito("todos")}
                className="h-8 text-xs"
              >
                Todos ({creditos.length})
              </Button>
              <Button
                size="sm"
                variant={filtroTipoCredito === "cartera_inicial" ? "secondary" : "ghost"}
                onClick={() => setFiltroTipoCredito("cartera_inicial")}
                className="h-8 text-xs"
              >
                Iniciales
              </Button>
              <Button
                size="sm"
                variant={filtroTipoCredito === "habitual" ? "secondary" : "ghost"}
                onClick={() => setFiltroTipoCredito("habitual")}
                className="h-8 text-xs"
              >
                Habituales (3%)
              </Button>
              <Button
                size="sm"
                variant={filtroTipoCredito === "extracupo" ? "secondary" : "ghost"}
                onClick={() => setFiltroTipoCredito("extracupo")}
                className="h-8 text-xs"
              >
                Extracupo (6%)
              </Button>
              <Button
                size="sm"
                variant={filtroTipoCredito === "comision" ? "secondary" : "ghost"}
                onClick={() => setFiltroTipoCredito("comision")}
                className="h-8 text-xs"
              >
                Comisiones (10%)
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs border-amber-500/40 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10 ml-auto"
                onClick={() => setOpenImportarCreditos(true)}
              >
                <FileSpreadsheet className="w-3.5 h-3.5 mr-1 text-amber-600" />
                Importar CSV (34 Créditos)
              </Button>
            </div>
          </div>

          <div className="border rounded-lg overflow-hidden bg-card">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/40 border-b text-[11px] text-muted-foreground">
                <tr>
                  <th className="p-3">Código</th>
                  <th className="p-3">Cliente</th>
                  <th className="p-3">Tipo</th>
                  <th className="p-3">Concepto</th>
                  <th className="p-3 text-right">Capital Original</th>
                  <th className="p-3 text-right">Saldo Capital</th>
                  <th className="p-3 text-right">Saldo Intereses</th>
                  <th className="p-3 text-center">Tasa</th>
                  <th className="p-3">Próximo Pago</th>
                  <th className="p-3 text-center">Estado</th>
                  <th className="p-3 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {creditosFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="p-6 text-center text-muted-foreground">
                      No se encontraron créditos registrados con estos filtros.
                    </td>
                  </tr>
                ) : (
                  creditosFiltrados.map((c) => (
                    <tr key={c.id} className="hover:bg-muted/30">
                      <td className="p-3 font-bold text-foreground">{c.codigo}</td>
                      <td className="p-3 font-medium">{clienteNombre(c.cliente_id)}</td>
                      <td className="p-3">
                        <Badge
                          variant={
                            c.tipo === "extracupo"
                              ? "outline"
                              : c.tipo === "comision"
                              ? "secondary"
                              : "default"
                          }
                          className="text-[10px]"
                        >
                          {c.tipo}
                        </Badge>
                      </td>
                      <td className="p-3 text-muted-foreground max-w-[180px] truncate">{c.concepto}</td>
                      <td className="p-3 text-right font-medium">{formatCOP(c.capital)}</td>
                      <td className="p-3 text-right font-bold text-foreground">{formatCOP(c.saldo_capital)}</td>
                      <td className="p-3 text-right text-amber-600 dark:text-amber-400 font-semibold">
                        {formatCOP(c.saldo_intereses)}
                      </td>
                      <td className="p-3 text-center">{formatearTasaPorcentaje(c.tasa_nominal)}</td>
                      <td className="p-3 text-[11px] text-muted-foreground">
                        {c.fecha_proximo_pago ? formatDate(c.fecha_proximo_pago) : "—"}
                      </td>
                      <td className="p-3 text-center">
                        <Badge variant={c.estado === "saldado" ? "outline" : "default"} className="text-[10px]">
                          {c.estado}
                        </Badge>
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            title="Ver evolución de amortización"
                            onClick={() => handleAbrirAmortizacion(c)}
                          >
                            <TrendingDown className="w-3.5 h-3.5 text-primary" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs text-destructive"
                            title="Eliminar crédito"
                            onClick={() => handleEliminarCredito(c.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* =================================================================== */}
        {/* TAB 3: ABONOS & PAGOS */}
        {/* =================================================================== */}
        <TabsContent value="abonos" className="space-y-4 pt-2">
          <div className="border rounded-lg overflow-hidden bg-card">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/40 border-b text-[11px] text-muted-foreground">
                <tr>
                  <th className="p-3">Fecha</th>
                  <th className="p-3">Cliente</th>
                  <th className="p-3">Modalidad</th>
                  <th className="p-3">Cuenta Ingreso</th>
                  <th className="p-3 text-right">Valor Pagado</th>
                  <th className="p-3">Detalle de Imputación</th>
                  <th className="p-3 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {abonos.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-muted-foreground">
                      No hay abonos registrados todavía.
                    </td>
                  </tr>
                ) : (
                  abonos.map((a) => {
                    const detalles = Array.isArray(a.detalles) ? a.detalles : [];
                    return (
                      <tr key={a.id} className="hover:bg-muted/30">
                        <td className="p-3 font-medium">{formatDate(a.fecha)}</td>
                        <td className="p-3 font-semibold">{clienteNombre(a.cliente_id)}</td>
                        <td className="p-3">
                          <Badge variant="outline" className="text-[10px]">{a.tipo}</Badge>
                        </td>
                        <td className="p-3 text-muted-foreground">{a.subcuenta_ingreso || "Bancos"}</td>
                        <td className="p-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                          {formatCOP(a.valor_total)}
                        </td>
                        <td className="p-3 text-[11px] text-muted-foreground">
                          {detalles.map((d, idx) => {
                            const cr = creditos.find((c) => c.id === d.credito_id);
                            return (
                              <span key={idx} className="block">
                                {cr?.codigo || 'Crédito'}: Int {formatCOP(d.intereses)} | Cap {formatCOP(d.capital)}
                              </span>
                            );
                          })}
                        </td>
                        <td className="p-3 text-center">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-destructive"
                            title="Eliminar abono y reversar saldos"
                            onClick={() => handleEliminarAbono(a.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* =================================================================== */}
        {/* TAB 4: INTERESES CAUSADOS (SUB-CUENTA 410509) */}
        {/* =================================================================== */}
        <TabsContent value="intereses" className="space-y-4 pt-2">
          <div className="border rounded-lg overflow-hidden bg-card">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/40 border-b text-[11px] text-muted-foreground">
                <tr>
                  <th className="p-3">Período</th>
                  <th className="p-3">Fecha Corte</th>
                  <th className="p-3">Cliente</th>
                  <th className="p-3">Crédito</th>
                  <th className="p-3 text-right">Capital Base</th>
                  <th className="p-3 text-center">Tasa</th>
                  <th className="p-3 text-right">Intereses Causados (410509)</th>
                  <th className="p-3 text-center">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {intereses.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-muted-foreground">
                      No hay liquidaciones de interés causadas aún.
                    </td>
                  </tr>
                ) : (
                  intereses.map((it) => {
                    const cr = creditos.find((c) => c.id === it.credito_id);
                    return (
                      <tr key={it.id} className="hover:bg-muted/30">
                        <td className="p-3 font-bold">{it.periodo}</td>
                        <td className="p-3 text-muted-foreground">{formatDate(it.fecha)}</td>
                        <td className="p-3 font-medium">{clienteNombre(it.cliente_id)}</td>
                        <td className="p-3 font-semibold">{cr?.codigo || "Crédito"}</td>
                        <td className="p-3 text-right">{formatCOP(it.capital_base)}</td>
                        <td className="p-3 text-center">{formatearTasaPorcentaje(it.tasa)}</td>
                        <td className="p-3 text-right font-bold text-amber-600 dark:text-amber-400">
                          +{formatCOP(it.intereses)}
                        </td>
                        <td className="p-3 text-center">
                          <Badge variant="outline" className="text-[10px]">{it.estado}</Badge>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* =================================================================== */}
        {/* TAB 5: AVISOS, RECORDATORIOS Y ALERTAS DE CARTERA */}
        {/* =================================================================== */}
        <TabsContent value="avisos" className="pt-2">
          <AvisosPanel
            inscritos={inscritos}
            creditos={creditos}
            abonos={abonos}
            clientes={clientes}
            onOpenAbono={handleAbrirAbono}
            onVerDetalle={handleAbrirFicha}
          />
        </TabsContent>
      </Tabs>

      {/* MODALES DEL MÓDULO */}
      <InscribirClienteDialog
        open={openInscribir}
        onOpenChange={setOpenInscribir}
        clientes={clientes}
        cdas={cdas}
        productos={productos}
        puc={puc}
        onSuccess={handleSuccessAction}
      />

      <NuevoPrestamoDialog
        open={openNuevoPrestamo}
        onOpenChange={setOpenNuevoPrestamo}
        inscritos={inscritos.filter((i) => i.estado === "activo")}
        clientes={clientes}
        creditos={creditos}
        cdas={cdas}
        puc={puc}
        clientePreseleccionadoId={preselectedClienteId}
        onSuccess={handleSuccessAction}
      />

      <NuevoProductoComisionDialog
        open={openNuevoProducto}
        onOpenChange={setOpenNuevoProducto}
        inscritos={inscritos.filter((i) => i.estado === "activo")}
        clientes={clientes}
        productos={productos}
        clientePreseleccionadoId={preselectedClienteId}
        onSuccess={handleSuccessAction}
      />

      <RegistrarAbonoDialog
        open={openAbono}
        onOpenChange={setOpenAbono}
        inscritos={inscritos.filter((i) => i.estado === "activo")}
        clientes={clientes}
        creditos={creditos}
        cdas={cdas}
        puc={puc}
        clientePreseleccionadoId={preselectedClienteId}
        onSuccess={handleSuccessAction}
      />

      <GenerarInteresesDialog
        open={openGenerarIntereses}
        onOpenChange={setOpenGenerarIntereses}
        inscritos={inscritos}
        creditos={creditos}
        clientes={clientes}
        onSuccess={handleSuccessAction}
      />

      <EstadoCuentaDialog
        open={openEstadoCuenta}
        onOpenChange={setOpenEstadoCuenta}
        inscrito={selectedInscrito}
        cliente={getCliente(selectedInscrito?.cliente_id)}
      />

      <AmortizacionDialog
        open={openAmortizacion}
        onOpenChange={setOpenAmortizacion}
        credito={selectedCredito}
        abonos={abonos}
        intereses={intereses}
        clienteNombre={clienteNombre(selectedCredito?.cliente_id)}
      />

      <SalidaClienteDialog
        open={openSalida}
        onOpenChange={setOpenSalida}
        inscrito={selectedInscrito}
        cliente={getCliente(selectedInscrito?.cliente_id)}
        onSuccess={handleSuccessAction}
      />

      <ClienteEmprendamosDetail
        open={openFichaDetail}
        onOpenChange={setOpenFichaDetail}
        inscrito={selectedInscrito}
        cliente={getCliente(selectedInscrito?.cliente_id)}
        creditos={creditos}
        abonos={abonos}
        intereses={intereses}
        cdas={cdas}
        productos={productos}
        onOpenNuevoPrestamo={handleAbrirNuevoPrestamo}
        onOpenNuevoProducto={handleAbrirNuevoProducto}
        onOpenAbono={handleAbrirAbono}
        onOpenEstadoCuenta={handleAbrirEstadoCuenta}
        onOpenAmortizacion={handleAbrirAmortizacion}
        onOpenSalida={handleAbrirSalida}
        onEliminarCredito={handleEliminarCredito}
        onEliminarAbono={handleEliminarAbono}
        onActualizarCliente={handleActualizarCliente}
      />

      <ImportarCreditosDialog
        open={openImportarCreditos}
        onOpenChange={setOpenImportarCreditos}
        inscritos={inscritos}
        clientes={clientes}
        onSuccess={handleSuccessAction}
      />
    </div>
  );
}
