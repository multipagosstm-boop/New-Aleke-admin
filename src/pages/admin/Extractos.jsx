import React, { useEffect, useState, useCallback, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, DollarSign, CheckCircle2, Printer, FileText, FileUp, ChevronLeft, ChevronRight, Search, CalendarClock, ArrowUp, ArrowDown, ArrowUpDown, RefreshCw, SkipForward, RotateCcw, Trash2, Gift, Calendar, AlertCircle, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const fmtDateShort = (d) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

const shiftMonth = (periodo, delta) => {
  const [y, m] = periodo.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
import { formatCOP, BANCO_NAMES, TIPO_PRODUCTO, formatDate, evaluarCicloCorteTarjeta, getCorteDisplayText, getDiaCorteEfectivo } from "@/lib/contabilidad";
import ExtractoCard from "@/components/admin/ExtractoCard";
import InformePagos from "@/components/admin/InformePagos";
import InformeGastosFinancieros from "@/components/admin/InformeGastosFinancieros";
import PdfUploadDialog from "@/components/conciliacion/PdfUploadDialog";
import SaltarExtractoDialog from "@/components/extractos/SaltarExtractoDialog";

export default function Extractos() {
  const [extractos, setExtractos] = useState([]);
  const [productos, setProductos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("pendiente_pago");
  const [pdfModal, setPdfModal] = useState(false);
  const [recalcLoadingId, setRecalcLoadingId] = useState(null);
  const [periodoFiltro, setPeriodoFiltro] = useState("todos");
  const [periodoRegistro, setPeriodoRegistro] = useState(new Date().toISOString().substring(0, 7));
  const [busqueda, setBusqueda] = useState("");
  const [filtroPlazo, setFiltroPlazo] = useState("para_registrar");
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [saltarTarget, setSaltarTarget] = useState(null);
  const [sortBy, setSortBy] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    type: null, // "omitir" | "reactivar" | "reversar" | "eliminar" | "aplicar_favor"
    extracto: null,
    loading: false,
  });
  const [periodoDialog, setPeriodoDialog] = useState({
    open: false,
    extracto: null,
    nuevoPeriodo: "",
    nuevaFechaCorte: "",
    nuevaFechaPago: "",
    loading: false,
    error: "",
  });

  const normalize = (s) => (s || "").toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const matchBusqueda = (extracto) => {
    if (!busqueda.trim()) return true;
    const q = normalize(busqueda);
    const prod = productoMap[extracto.producto_id];
    return [
      prod?.nombre, prod?.numero_completo, prod?.banco, BANCO_NAMES[prod?.banco],
      extracto.periodo, extracto.observaciones
    ].some((v) => normalize(v).includes(q));
  };
  const matchBusquedaProducto = (p) => {
    if (!busqueda.trim()) return true;
    const q = normalize(busqueda);
    return [p.nombre, p.numero_completo, p.banco, BANCO_NAMES[p.banco], p.tipo, TIPO_PRODUCTO[p.tipo], titularMap[p.titular_id]?.nombre]
      .some((v) => normalize(v).includes(q));
  };

  const [modoRegistro, setModoRegistro] = useState("pendientes_corte"); // "pendientes_corte" | "por_mes"
  const [pdfModalTarget, setPdfModalTarget] = useState({ open: false, productoId: "", periodo: "" });

  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async (sincronizar = true) => {
    try {
      // 1. Carga inicial en paralelo para renderizado instantáneo
      const [exts, prods, clients] = await Promise.all([
        base44.entities.ExtractoProducto.list("-fecha_pago", 2000),
        base44.entities.ProductoCredito.list(),
        base44.entities.Cliente.list()
      ]);
      setExtractos(exts || []);
      setProductos(prods || []);
      setClientes(clients || []);
      setLoading(false);

      // 2. Sincronizar abonos con el Libro Diario
      if (sincronizar) {
        setRefreshing(true);
        const res = await base44.functions.invoke("calcularEstadoExtractos", {}).catch(() => null);
        if (res?.data?.actualizados > 0) {
          const freshExts = await base44.entities.ExtractoProducto.list("-fecha_pago", 2000);
          setExtractos(freshExts || []);
        }
      }
    } catch (e) {
      console.error("Error al cargar extractos:", e);
      setLoading(false);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData(true);
  }, [loadData]);

  const productoMap = {};
  productos.forEach((p) => { productoMap[p.id] = p; });
  const titularMap = {};
  clientes.forEach((c) => { titularMap[c.id] = c; });

  const periodos = useMemo(() => {
    const s = new Set(extractos.map((e) => e.periodo).filter(Boolean));
    return Array.from(s).sort().reverse();
  }, [extractos]);

  // Evaluación del ciclo de corte y extracto para todos los productos activos
  const evaluacionCorteMap = useMemo(() => {
    const map = {};
    productos.forEach((p) => {
      if (p.estado === "activo") {
        map[p.id] = evaluarCicloCorteTarjeta(p, extractos);
      }
    });
    return map;
  }, [productos, extractos]);

  // Tarjetas cuyo corte ya pasó y están fuera de plazo (URGENTES)
  const tarjetasVencidas = useMemo(() => {
    return productos.filter((p) => {
      if (p.estado !== "activo") return false;
      const ev = evaluacionCorteMap[p.id];
      return ev && ev.estado === "urgente";
    });
  }, [productos, evaluacionCorteMap]);

  // Tarjetas cuyo corte ya pasó y están dentro de los 5 días de plazo
  const tarjetasEnPlazo = useMemo(() => {
    return productos.filter((p) => {
      if (p.estado !== "activo") return false;
      const ev = evaluacionCorteMap[p.id];
      return ev && ev.estado === "en_plazo";
    });
  }, [productos, evaluacionCorteMap]);

  // Tarjetas cuyo próximo corte está en el futuro
  const tarjetasProximas = useMemo(() => {
    return productos.filter((p) => {
      if (p.estado !== "activo") return false;
      const ev = evaluacionCorteMap[p.id];
      return ev && ev.estado === "proximo";
    });
  }, [productos, evaluacionCorteMap]);

  const calcularPlazoMesEspecifico = useCallback((p, per) => {
    if (!p || !per) return null;
    const [y, m] = per.split("-").map(Number);
    const dia = getDiaCorteEfectivo(p, y, m - 1);
    if (!dia) return null;
    const cutoff = new Date(y, m - 1, dia);
    cutoff.setHours(0, 0, 0, 0);
    const deadline = new Date(cutoff);
    deadline.setDate(deadline.getDate() + 5);
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    let estado = "proximo";
    let diasDiferencia = 0;
    let mensaje = "";
    const cutoffFmt = fmtDateShort(cutoff);

    if (hoy > deadline) {
      estado = "urgente";
      diasDiferencia = Math.floor((hoy - deadline) / 86400000);
      mensaje = `Cortó el ${cutoffFmt} · Plazo vencido hace ${diasDiferencia} día${diasDiferencia === 1 ? "" : "s"}`;
    } else if (hoy >= cutoff && hoy <= deadline) {
      estado = "en_plazo";
      diasDiferencia = Math.max(0, Math.ceil((deadline - hoy) / 86400000));
      mensaje = `Cortó el ${cutoffFmt} · En plazo (${diasDiferencia} día${diasDiferencia === 1 ? "" : "s"} restante${diasDiferencia === 1 ? "" : "s"})`;
    } else {
      estado = "proximo";
      diasDiferencia = Math.ceil((cutoff - hoy) / 86400000);
      mensaje = `Próximo corte: ${cutoffFmt} (en ${diasDiferencia} día${diasDiferencia === 1 ? "" : "s"})`;
    }

    return { cutoff, deadline, estado, mensaje, diasDiferencia, periodoEsperado: per };
  }, []);

  const calcularPlazo = useCallback((p) => {
    if (modoRegistro === "por_mes") {
      return calcularPlazoMesEspecifico(p, periodoRegistro);
    }
    return evaluacionCorteMap[p.id] || null;
  }, [modoRegistro, periodoRegistro, evaluacionCorteMap, calcularPlazoMesEspecifico]);

  const productosConExtractoRegistro = useMemo(() => {
    return new Set(
      extractos.filter((e) => e.periodo === periodoRegistro).map((e) => e.producto_id)
    );
  }, [extractos, periodoRegistro]);

  const pendientesRegistroTotal = useMemo(() => {
    return productos.filter((p) => {
      if (p.estado !== "activo" || !matchBusquedaProducto(p)) return false;
      if (modoRegistro === "por_mes") {
        return !productosConExtractoRegistro.has(p.id);
      }
      return true;
    });
  }, [productos, matchBusquedaProducto, modoRegistro, productosConExtractoRegistro]);

  const pendientesRegistro = useMemo(() => {
    return pendientesRegistroTotal.filter((p) => {
      if (filtroPlazo === "todos") return true;
      const plazo = calcularPlazo(p);
      if (!plazo) return false;
      if (filtroPlazo === "para_registrar") return plazo.estado === "urgente" || plazo.estado === "en_plazo";
      return plazo.estado === "proximo";
    });
  }, [pendientesRegistroTotal, filtroPlazo, calcularPlazo]);

  const pendientesPago = extractos.filter((e) =>
    e.estado === "pendiente_pago" && (periodoFiltro === "todos" || e.periodo === periodoFiltro) && matchBusqueda(e)
  );
  const pagados = extractos.filter((e) =>
    (e.estado === "pagado" || e.estado === "no_pagada") && (periodoFiltro === "todos" || e.periodo === periodoFiltro) && matchBusqueda(e)
  );

  const getSortValue = (p) => {
    switch (sortBy) {
      case "producto": return normalize(p.nombre);
      case "titular": return normalize(titularMap[p.titular_id]?.nombre);
      case "tipo": return normalize(TIPO_PRODUCTO[p.tipo] || p.tipo);
      case "banco": return normalize(BANCO_NAMES[p.banco] || p.banco);
      case "saldo": return p.saldo || 0;
      case "corte": return p.fecha_corte || 0;
      case "plazo": { const pl = calcularPlazo(p); return pl?.cutoff?.getTime() || 0; }
      default: return 0;
    }
  };
  const handleSort = (col) => {
    if (sortBy === col) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("asc"); }
  };
  const sortedPendientes = useMemo(() => {
    return [...pendientesRegistro].sort((a, b) => {
      if (sortBy) {
        const va = getSortValue(a), vb = getSortValue(b);
        if (va < vb) return sortDir === "asc" ? -1 : 1;
        if (va > vb) return sortDir === "asc" ? 1 : -1;
        return 0;
      }
      // Orden por urgencia: urgentes primero (corte cumplido sin extracto), luego en_plazo, luego próximos
      const pza = calcularPlazo(a);
      const pzb = calcularPlazo(b);
      const scoreEst = (st) => (st === "urgente" ? 0 : st === "en_plazo" ? 1 : 2);
      const sa = scoreEst(pza?.estado);
      const sb = scoreEst(pzb?.estado);
      if (sa !== sb) return sa - sb;
      const ca = pza?.cutoff?.getTime() || 0;
      const cb = pzb?.cutoff?.getTime() || 0;
      return ca - cb;
    });
  }, [pendientesRegistro, sortBy, sortDir, titularMap, calcularPlazo]);

  useEffect(() => {
    setCurrentPage(1);
  }, [busqueda, periodoRegistro, filtroPlazo, pageSize]);

  const totalPages = Math.ceil(sortedPendientes.length / pageSize) || 1;
  const paginatedPendientes = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedPendientes.slice(start, start + pageSize);
  }, [sortedPendientes, currentPage, pageSize]);

  const handleOmitirPago = (ext) => {
    setConfirmDialog({
      open: true,
      type: "omitir",
      extracto: ext,
      loading: false,
    });
  };

  const handleReactivarPago = (ext) => {
    setConfirmDialog({
      open: true,
      type: "reactivar",
      extracto: ext,
      loading: false,
    });
  };

  const handleRecalcular = async (ext) => {
    setRecalcLoadingId(ext.id);
    try {
      await base44.functions.invoke("calcularEstadoExtractos", { producto_id: ext.producto_id });
      await loadData(false);
      toast.success("Estado de extracto recalculado exitosamente.");
    } catch (e) {
      toast.error("Error al recalcular: " + e.message);
    }
    setRecalcLoadingId(null);
  };

  const handleReversarPago = (ext) => {
    if (!ext.comprobante_id) {
      toast.error("Este extracto no tiene comprobante vinculado para reversar.");
      return;
    }
    setConfirmDialog({
      open: true,
      type: "reversar",
      extracto: ext,
      loading: false,
    });
  };

  const handleDeleteExtracto = (ext) => {
    setConfirmDialog({
      open: true,
      type: "eliminar",
      extracto: ext,
      loading: false,
    });
  };

  const handleAplicarSaldoFavor = (ext) => {
    const saldoFavor = ext.saldo_a_favor || 0;
    if (saldoFavor <= 0) return;
    setConfirmDialog({
      open: true,
      type: "aplicar_favor",
      extracto: ext,
      loading: false,
    });
  };

  const handleCambiarPeriodo = (ext) => {
    setPeriodoDialog({
      open: true,
      extracto: ext,
      nuevoPeriodo: ext.periodo || "",
      nuevaFechaCorte: ext.fecha_corte || "",
      nuevaFechaPago: ext.fecha_pago || "",
      loading: false,
      error: "",
    });
  };

  const handleGuardarNuevoPeriodo = async () => {
    const ext = periodoDialog.extracto;
    const nuevoPeriodo = periodoDialog.nuevoPeriodo?.trim();
    if (!ext || !nuevoPeriodo) {
      setPeriodoDialog((prev) => ({ ...prev, error: "Debes seleccionar un período válido (formato AAAA-MM)." }));
      return;
    }

    if (!/^\d{4}-\d{2}$/.test(nuevoPeriodo)) {
      setPeriodoDialog((prev) => ({ ...prev, error: "El formato del período debe ser AAAA-MM (ej. 2026-10)." }));
      return;
    }

    if (
      nuevoPeriodo === ext.periodo &&
      (!periodoDialog.nuevaFechaCorte || periodoDialog.nuevaFechaCorte === ext.fecha_corte) &&
      (!periodoDialog.nuevaFechaPago || periodoDialog.nuevaFechaPago === ext.fecha_pago)
    ) {
      setPeriodoDialog({ open: false, extracto: null, nuevoPeriodo: "", nuevaFechaCorte: "", nuevaFechaPago: "", loading: false, error: "" });
      return;
    }

    // Verificar si ya existe otro extracto para este producto en el nuevo período
    const yaExiste = extractos.some(
      (e) => e.id !== ext.id && e.producto_id === ext.producto_id && e.periodo === nuevoPeriodo
    );

    if (yaExiste) {
      const prodNom = productoMap[ext.producto_id]?.nombre || "este producto";
      setPeriodoDialog((prev) => ({
        ...prev,
        error: `Ya existe un extracto para el período ${nuevoPeriodo} en ${prodNom}. Debes eliminarlo primero o elegir otro período diferente.`
      }));
      return;
    }

    setPeriodoDialog((prev) => ({ ...prev, loading: true, error: "" }));

    try {
      const updateData = {
        periodo: nuevoPeriodo
      };
      if (periodoDialog.nuevaFechaCorte) updateData.fecha_corte = periodoDialog.nuevaFechaCorte;
      if (periodoDialog.nuevaFechaPago) updateData.fecha_pago = periodoDialog.nuevaFechaPago;

      await base44.entities.ExtractoProducto.update(ext.id, updateData);

      setExtractos((prev) =>
        prev.map((item) => (item.id === ext.id ? { ...item, ...updateData } : item))
      );

      toast.success(`Período del extracto actualizado a ${nuevoPeriodo} correctamente.`);
      setPeriodoDialog({ open: false, extracto: null, nuevoPeriodo: "", nuevaFechaCorte: "", nuevaFechaPago: "", loading: false, error: "" });
      await loadData(false);
    } catch (err) {
      console.error("Error al actualizar período:", err);
      setPeriodoDialog((prev) => ({ ...prev, loading: false, error: err.message || "Error al actualizar el período." }));
    }
  };

  const handleConfirmAction = async () => {
    const ext = confirmDialog.extracto;
    if (!ext) return;
    setConfirmDialog((prev) => ({ ...prev, loading: true }));

    try {
      if (confirmDialog.type === "omitir") {
        // 1. Actualización optimista inmediata
        setExtractos((prev) =>
          prev.map((item) => (item.id === ext.id ? { ...item, estado: "no_pagada" } : item))
        );
        // 2. Persistencia en la base de datos
        await base44.entities.ExtractoProducto.update(ext.id, {
          estado: "no_pagada",
        });
        toast.success("Pago omitido. Extracto marcado como 'No pagada' y alojado en Pagados.");
        setConfirmDialog({ open: false, type: null, extracto: null, loading: false });
        await loadData(false);
      } else if (confirmDialog.type === "reactivar") {
        setExtractos((prev) =>
          prev.map((item) => (item.id === ext.id ? { ...item, estado: "pendiente_pago" } : item))
        );
        await base44.entities.ExtractoProducto.update(ext.id, {
          estado: "pendiente_pago",
        });
        toast.success("Extracto devuelto a 'Por Pagar'.");
        setConfirmDialog({ open: false, type: null, extracto: null, loading: false });
        await loadData(true);
      } else if (confirmDialog.type === "reversar") {
        await base44.functions.invoke("anularComprobante", {
          comprobante_id: ext.comprobante_id,
          motivo: "Reversión de pago de extracto",
        });
        await base44.entities.ExtractoProducto.update(ext.id, { estado: "pendiente_pago" });
        toast.success("Pago reversado y devuelto a Por Pagar.");
        setConfirmDialog({ open: false, type: null, extracto: null, loading: false });
        await loadData(true);
      } else if (confirmDialog.type === "eliminar") {
        const lineas = await base44.entities.LineaExtracto.filter({ extracto_id: ext.id });
        if (lineas.length > 0) {
          await base44.entities.LineaExtracto.deleteMany({ extracto_id: ext.id });
        }
        await base44.entities.ExtractoProducto.delete(ext.id);
        setExtractos((prev) => prev.filter((item) => item.id !== ext.id));
        toast.success("Extracto eliminado exitosamente.");
        setConfirmDialog({ open: false, type: null, extracto: null, loading: false });
        await loadData(false);
      } else if (confirmDialog.type === "aplicar_favor") {
        const saldoFavor = ext.saldo_a_favor || 0;
        const extractosProducto = extractos
          .filter((e) => e.producto_id === ext.producto_id && e.estado === "pendiente_pago" && e.id !== ext.id)
          .sort((a, b) => (b.periodo || "").localeCompare(a.periodo || ""));

        if (extractosProducto.length > 0) {
          const proximo = extractosProducto[0];
          const nuevoSaldo = Math.max(0, (proximo.saldo_a_pagar || 0) - saldoFavor);
          const obsActual = proximo.observaciones || "";
          const nuevaObs = (obsActual + `\nSaldo a favor aplicado desde extracto ${ext.periodo}: ${formatCOP(saldoFavor)}`).trim();
          await base44.entities.ExtractoProducto.update(proximo.id, {
            saldo_a_pagar: nuevoSaldo,
            observaciones: nuevaObs,
          });
        } else {
          await base44.entities.ProductoCredito.update(ext.producto_id, {
            saldo_favor_acumulado: (productoMap[ext.producto_id]?.saldo_favor_acumulado || 0) + saldoFavor,
          });
        }
        await base44.entities.ExtractoProducto.update(ext.id, { saldo_a_favor: 0 });
        toast.success("Saldo a favor aplicado con éxito.");
        setConfirmDialog({ open: false, type: null, extracto: null, loading: false });
        await loadData(false);
      }
    } catch (err) {
      console.error(err);
      toast.error("Error al procesar la acción: " + (err.message || "desconocido"));
      setConfirmDialog((prev) => ({ ...prev, loading: false }));
    }
  };

  const handleSaltar = async (producto, { motivo, cancelarTarjeta }) => {
    try {
      await base44.entities.ExtractoProducto.create({
        producto_id: producto.id,
        periodo: periodoRegistro,
        saldo_a_pagar: 0,
        observaciones: `EXTRACTO SALTADO — ${motivo}`,
        motivo_salto: motivo,
        estado: "saltado",
        estado_conciliacion: "sin_iniciar",
        total_lineas_banco: 0,
        total_abonado: 0,
        saldo_pendiente: 0,
        porcentaje_pagado: 100,
        saldo_a_favor: 0,
      });
      if (cancelarTarjeta) {
        await base44.entities.ProductoCredito.update(producto.id, { estado: "inactivo" });
      }
      toast.success("Período saltado correctamente.");
      loadData();
    } catch (e) {
      toast.error(e.message || "Error al saltar el extracto");
    }
  };

  if (loading) return <div className="p-8 text-muted-foreground">Cargando extractos...</div>;

  return (
    <div className="p-6 space-y-4">
      {/* Banner de alerta de tarjetas cuyo corte ya ocurrió y están fuera de plazo */}
      {tarjetasVencidas.length > 0 && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3.5 text-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
            <div>
              <div className="font-semibold text-destructive flex items-center gap-2 flex-wrap">
                <span>Alerta: {tarjetasVencidas.length} tarjeta(s) cortaron y no tienen extracto registrado</span>
                <Badge variant="destructive" className="text-[10px] uppercase font-bold tracking-wider">Cortes Vencidos</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {tarjetasVencidas.length <= 4
                  ? tarjetasVencidas.map((p) => {
                      const ev = evaluacionCorteMap[p.id];
                      return `${p.nombre} (${ev?.mensaje || "corte cumplido"})`;
                    }).join(" · ")
                  : `${tarjetasVencidas.slice(0, 3).map((p) => p.nombre).join(", ")} y ${tarjetasVencidas.length - 3} tarjetas más cortaron y superaron los 5 días de plazo.`
                }
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="destructive"
            className="shrink-0 text-xs h-8 font-medium gap-1"
            onClick={() => {
              setTab("pendiente_registro");
              setModoRegistro("pendientes_corte");
              setFiltroPlazo("para_registrar");
            }}
          >
            <Clock className="w-3.5 h-3.5" />
            Ver tarjetas vencidas ({tarjetasVencidas.length})
          </Button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex gap-2 items-center">
          <Select value={periodoFiltro} onValueChange={setPeriodoFiltro}>
            <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los períodos</SelectItem>
              {periodos.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button
            variant={tab === "pendiente_registro" ? "default" : "outline"}
            size="sm"
            onClick={() => setTab("pendiente_registro")}
            className="relative"
          >
            <Clock className="w-4 h-4 mr-1" /> Por Registrar ({modoRegistro === "pendientes_corte" ? tarjetasVencidas.length + tarjetasEnPlazo.length : pendientesRegistroTotal.length})
            {tarjetasVencidas.length > 0 && (
              <Badge variant="destructive" className="ml-1.5 px-1.5 py-0 text-[10px] font-bold">
                {tarjetasVencidas.length} urgentes
              </Badge>
            )}
          </Button>
          <Button variant={tab === "pendiente_pago" ? "default" : "outline"} size="sm" onClick={() => setTab("pendiente_pago")}>
            <DollarSign className="w-4 h-4 mr-1" /> Por Pagar ({pendientesPago.length})
          </Button>
          <Button variant={tab === "pagado" ? "default" : "outline"} size="sm" onClick={() => setTab("pagado")}>
            <CheckCircle2 className="w-4 h-4 mr-1" /> Pagados ({pagados.length})
          </Button>
          <Button variant={tab === "informe_pagos" ? "default" : "outline"} size="sm" onClick={() => setTab("informe_pagos")}>
            <Printer className="w-4 h-4 mr-1" /> Informe Pagos
          </Button>
          <Button variant={tab === "gastos_financieros" ? "default" : "outline"} size="sm" onClick={() => setTab("gastos_financieros")}>
            <FileText className="w-4 h-4 mr-1" /> Gastos Financieros
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="text-xs h-9 gap-1.5"
            title="Recalcular abonos desde movimientos del Libro Diario"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin text-primary")} />
            <span>{refreshing ? "Sincronizando..." : "Sincronizar abonos"}</span>
          </Button>
          <Button onClick={() => setPdfModal(true)} size="sm" className="h-9">
            <FileUp className="w-4 h-4 mr-2" /> Cargar Extracto PDF
          </Button>
        </div>
      </div>

      {(tab === "pendiente_registro" || tab === "pendiente_pago" || tab === "pagado") && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder={
                tab === "pendiente_registro"
                  ? "Buscar producto, banco, tipo..."
                  : "Buscar producto, número, banco, período..."
              }
              className="pl-8 h-8 text-sm"
            />
          </div>
          {busqueda && (
            <Button size="sm" variant="ghost" onClick={() => setBusqueda("")}>Limpiar</Button>
          )}

          {tab === "pendiente_pago" && (
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTab("informe_pagos")}
                className="h-8 text-xs gap-1.5 font-medium border-primary/30 text-primary hover:bg-primary/5"
                title="Generar y visualizar Informe de Extractos por Pagar"
              >
                <Printer className="w-3.5 h-3.5" /> Generar Informe de Pagos
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTab("gastos_financieros")}
                className="h-8 text-xs gap-1.5 font-medium border-primary/30 text-primary hover:bg-primary/5"
                title="Generar y visualizar Informe de Gastos Financieros"
              >
                <FileText className="w-3.5 h-3.5" /> Generar Informe de Gastos
              </Button>
            </div>
          )}
        </div>
      )}

      {tab === "pendiente_registro" && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div>
                <h3 className="font-heading font-semibold text-base">Control de Registro de Extractos</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {modoRegistro === "pendientes_corte"
                    ? "Control por ciclo real de facturación: detecta y avisa automáticamente de tarjetas que ya cortaron (mes anterior o actual) y están pendientes de extracto."
                    : `Control por mes de facturación seleccionado (${periodoRegistro}).`}
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <div className="inline-flex rounded-md border p-0.5 bg-muted/40">
                  <Button
                    size="sm"
                    variant={modoRegistro === "pendientes_corte" ? "default" : "ghost"}
                    className="h-7 text-xs px-2.5 font-medium"
                    onClick={() => setModoRegistro("pendientes_corte")}
                  >
                    <Clock className="w-3.5 h-3.5 mr-1" />
                    Cortes Pendientes ({tarjetasVencidas.length + tarjetasEnPlazo.length})
                  </Button>
                  <Button
                    size="sm"
                    variant={modoRegistro === "por_mes" ? "default" : "ghost"}
                    className="h-7 text-xs px-2.5 font-medium"
                    onClick={() => setModoRegistro("por_mes")}
                  >
                    <Calendar className="w-3.5 h-3.5 mr-1" />
                    Por Mes ({periodoRegistro})
                  </Button>
                </div>

                {modoRegistro === "por_mes" && (
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" variant="outline" onClick={() => setPeriodoRegistro(shiftMonth(periodoRegistro, -1))}>
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <input
                      type="month"
                      value={periodoRegistro}
                      onChange={(e) => setPeriodoRegistro(e.target.value)}
                      className="h-8 rounded-md border border-input bg-transparent px-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <Button size="sm" variant="outline" onClick={() => setPeriodoRegistro(shiftMonth(periodoRegistro, 1))}>
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setPeriodoRegistro(new Date().toISOString().substring(0, 7))}>
                      Hoy
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm flex gap-2 mb-3">
              <CalendarClock className="w-4 h-4 text-warning mt-0.5 shrink-0" />
              <div>
                <span className="font-semibold">Plazo de registro:</span> el extracto debe ingresarse entre la fecha de corte de la tarjeta y hasta <b>5 días después</b>. Pasada esa fecha, el registro se considera <b>urgente / vencido</b>.
              </div>
            </div>

            <div className="flex items-center gap-1.5 mb-3 flex-wrap">
              <span className="text-xs text-muted-foreground mr-1">Filtrar por plazo:</span>
              <Button size="sm" variant={filtroPlazo === "para_registrar" ? "default" : "outline"} onClick={() => setFiltroPlazo("para_registrar")}>
                <Clock className="w-3.5 h-3.5 mr-1" /> Para registrar ({pendientesRegistroTotal.filter(p => { const pl = calcularPlazo(p); return pl?.estado === "urgente" || pl?.estado === "en_plazo"; }).length})
              </Button>
              <Button size="sm" variant={filtroPlazo === "proximo" ? "default" : "outline"} onClick={() => setFiltroPlazo("proximo")}>
                <CalendarClock className="w-3.5 h-3.5 mr-1" /> Próximos cortes ({pendientesRegistroTotal.filter(p => { const pl = calcularPlazo(p); return pl?.estado === "proximo"; }).length})
              </Button>
              <Button size="sm" variant={filtroPlazo === "todos" ? "default" : "outline"} onClick={() => setFiltroPlazo("todos")}>
                Todos ({pendientesRegistroTotal.length})
              </Button>
            </div>

            <p className="text-xs text-muted-foreground mb-3">
              {modoRegistro === "pendientes_corte"
                ? `${sortedPendientes.length} producto(s) en vista de cortes pendientes.`
                : pendientesRegistro.length === 0
                ? `Todos los productos activos tienen extracto registrado para ${periodoRegistro}.`
                : `${pendientesRegistro.length} producto(s) activo(s) sin extracto para el período ${periodoRegistro}.`}
            </p>

            {sortedPendientes.length === 0 ? (
              <p className="text-muted-foreground text-sm">No hay productos pendientes para el filtro seleccionado.</p>
            ) : (
              <>
                <table className="w-full text-sm thead-sticky">
                  <thead className="border-b border-border text-left text-xs text-muted-foreground uppercase">
                    <tr>
                      {[
                        { key: "producto", label: "Producto" },
                        { key: "titular", label: "Titular" },
                        { key: "tipo", label: "Tipo" },
                        { key: "banco", label: "Banco" },
                        { key: "saldo", label: "Saldo" },
                        { key: "corte", label: "Corte" },
                        { key: "plazo", label: "Plazo / Estado" },
                      ].map((h) => (
                        <th key={h.key} className="py-2 font-medium">
                          <button
                            type="button"
                            onClick={() => handleSort(h.key)}
                            className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                          >
                            {h.label}
                            {sortBy === h.key ? (
                              sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                            ) : (
                              <ArrowUpDown className="w-3 h-3 opacity-40" />
                            )}
                          </button>
                        </th>
                      ))}
                      <th className="py-2 font-medium text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedPendientes.map((p) => {
                      const plazo = calcularPlazo(p);
                      return (
                        <tr key={p.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                          <td className="py-2 font-medium">
                            <div className="flex items-center gap-1.5">
                              {plazo?.estado === "urgente" && (
                                <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" title="Corte vencido sin extracto" />
                              )}
                              <span>{p.nombre}</span>
                            </div>
                            {p.numero_completo && (
                              <div className="text-[11px] text-muted-foreground font-mono">{p.numero_completo}</div>
                            )}
                          </td>
                          <td className="py-2 text-xs text-muted-foreground">{titularMap[p.titular_id]?.nombre || "—"}</td>
                          <td className="py-2 text-xs">{TIPO_PRODUCTO[p.tipo] || p.tipo}</td>
                          <td className="py-2 text-xs">{BANCO_NAMES[p.banco] || p.banco}</td>
                          <td className="py-2 font-mono">{formatCOP(p.saldo)}</td>
                          <td className="py-2 text-xs font-medium">{getCorteDisplayText(p)}</td>
                          <td className="py-2 text-xs">
                            {(() => {
                              if (!plazo) return "—";
                              return (
                                <div className="space-y-1">
                                  <div className="font-mono text-xs flex items-center gap-1.5 flex-wrap">
                                    <span>{fmtDateShort(plazo.cutoff)} — {fmtDateShort(plazo.deadline)}</span>
                                    {plazo.estado === "urgente" && <Badge variant="destructive" className="text-[10px]">Urgente</Badge>}
                                    {plazo.estado === "en_plazo" && <Badge className="bg-warning text-warning-foreground text-[10px]">En plazo</Badge>}
                                    {plazo.estado === "proximo" && <Badge variant="secondary" className="text-[10px]">Próximo</Badge>}
                                  </div>
                                  <div className={cn("text-[11px]", plazo.estado === "urgente" ? "text-destructive font-medium" : plazo.estado === "en_plazo" ? "text-amber-600 dark:text-amber-400 font-medium" : "text-muted-foreground")}>
                                    {plazo.mensaje}
                                  </div>
                                </div>
                              );
                            })()}
                          </td>
                          <td className="py-2 text-right">
                            <div className="flex gap-1 justify-end">
                              <Button
                                size="sm"
                                variant={plazo?.estado === "urgente" ? "default" : "outline"}
                                className={cn("text-xs h-8", plazo?.estado === "urgente" && "bg-destructive text-destructive-foreground hover:bg-destructive/90")}
                                onClick={() => setPdfModalTarget({ open: true, productoId: p.id, periodo: plazo?.periodoEsperado || "" })}
                              >
                                <FileUp className="w-3.5 h-3.5 mr-1" /> Cargar PDF
                              </Button>
                              <Button size="sm" variant="ghost" className="text-muted-foreground text-xs h-8" onClick={() => setSaltarTarget(p)} title="Saltar este período (tarjeta cancelada o extracto no disponible)">
                                Saltar
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Controles de Paginación */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-border/60 text-xs text-muted-foreground mt-2">
                  <div className="flex items-center gap-2">
                    <span>Filas por página:</span>
                    <Select value={String(pageSize)} onValueChange={(val) => { setPageSize(Number(val)); setCurrentPage(1); }}>
                      <SelectTrigger className="w-20 h-8 text-xs font-mono"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="15">15</SelectItem>
                      </SelectContent>
                    </Select>
                    <span className="hidden sm:inline">
                      Mostrando {sortedPendientes.length > 0 ? (currentPage - 1) * pageSize + 1 : 0} - {Math.min(currentPage * pageSize, sortedPendientes.length)} de {sortedPendientes.length} productos
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-2.5"
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Anterior
                    </Button>
                    <span className="px-2 font-mono text-xs font-medium">
                      Página {currentPage} de {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-2.5"
                      disabled={currentPage >= totalPages}
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    >
                      Siguiente <ChevronRight className="w-3.5 h-3.5 ml-1" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "pendiente_pago" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {pendientesPago.map((e) => (
            <ExtractoCard
              key={e.id}
              extracto={e}
              producto={productoMap[e.producto_id]}
              onRecalcular={handleRecalcular}
              onReversar={handleReversarPago}
              onAplicarSaldoFavor={handleAplicarSaldoFavor}
              onDelete={handleDeleteExtracto}
              onOmitirPago={handleOmitirPago}
              onReactivarPago={handleReactivarPago}
              onCambiarPeriodo={handleCambiarPeriodo}
              recalcLoading={recalcLoadingId === e.id}
            />
          ))}
          {pendientesPago.length === 0 && (
            <Card className="col-span-full">
              <CardContent className="pt-6 text-center text-muted-foreground">
                No hay extractos pendientes de pago.
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {tab === "pagado" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {pagados.map((e) => (
            <ExtractoCard
              key={e.id}
              extracto={e}
              producto={productoMap[e.producto_id]}
              onRecalcular={handleRecalcular}
              onReversar={handleReversarPago}
              onAplicarSaldoFavor={handleAplicarSaldoFavor}
              onDelete={handleDeleteExtracto}
              onOmitirPago={handleOmitirPago}
              onReactivarPago={handleReactivarPago}
              onCambiarPeriodo={handleCambiarPeriodo}
              recalcLoading={recalcLoadingId === e.id}
            />
          ))}
          {pagados.length === 0 && (
            <Card className="col-span-full">
              <CardContent className="pt-6 text-center text-muted-foreground">
                No hay extractos pagados.
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {tab === "informe_pagos" && (
        <InformePagos
          extractos={extractos}
          productoMap={productoMap}
          titularMap={titularMap}
          periodoFiltro={periodoFiltro}
          onPeriodoFiltroChange={setPeriodoFiltro}
        />
      )}

      {tab === "gastos_financieros" && (
        <InformeGastosFinancieros
          extractos={extractos}
          productoMap={productoMap}
          periodoFiltro={periodoFiltro}
          onPeriodoFiltroChange={setPeriodoFiltro}
        />
      )}

      <SaltarExtractoDialog
        open={!!saltarTarget}
        onOpenChange={(v) => !v && setSaltarTarget(null)}
        producto={saltarTarget}
        periodo={periodoRegistro}
        onConfirmado={(opts) => handleSaltar(saltarTarget, opts)}
      />

      <PdfUploadDialog
        open={pdfModal || pdfModalTarget.open}
        onOpenChange={(v) => {
          setPdfModal(v);
          if (!v) setPdfModalTarget({ open: false, productoId: "", periodo: "" });
        }}
        productoInicial={pdfModalTarget.productoId}
        periodoInicial={pdfModalTarget.periodo}
        onConfirmado={(data) => {
          loadData();
          setPdfModalTarget({ open: false, productoId: "", periodo: "" });
          if (data?.extracto_id) {
            setTimeout(() => {
              const ok = window.confirm(
                "✅ Extracto creado con movimientos extraídos del PDF.\n\n" +
                `Se crearon ${data.lineas_creadas} líneas de movimiento.\n\n` +
                "¿Ir al módulo de Conciliación Bancaria para ver y conciliar los movimientos?"
              );
              if (ok) window.location.href = "/admin/conciliacion";
            }, 200);
          }
        }}
        productos={productos.filter((p) => p.estado === "activo")}
      />

      <Dialog
        open={confirmDialog.open}
        onOpenChange={(v) => {
          if (!v && !confirmDialog.loading) {
            setConfirmDialog({ open: false, type: null, extracto: null, loading: false });
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              {confirmDialog.type === "omitir" && (
                <>
                  <SkipForward className="w-5 h-5 text-amber-600 shrink-0" />
                  <span>¿Omitir el pago de esta tarjeta?</span>
                </>
              )}
              {confirmDialog.type === "reactivar" && (
                <>
                  <RotateCcw className="w-5 h-5 text-primary shrink-0" />
                  <span>¿Mover extracto a "Por Pagar"?</span>
                </>
              )}
              {confirmDialog.type === "reversar" && (
                <>
                  <RotateCcw className="w-5 h-5 text-amber-600 shrink-0" />
                  <span>¿Reversar pago de este extracto?</span>
                </>
              )}
              {confirmDialog.type === "eliminar" && (
                <>
                  <Trash2 className="w-5 h-5 text-destructive shrink-0" />
                  <span>¿Eliminar este extracto?</span>
                </>
              )}
              {confirmDialog.type === "aplicar_favor" && (
                <>
                  <Gift className="w-5 h-5 text-emerald-600 shrink-0" />
                  <span>¿Aplicar saldo a favor?</span>
                </>
              )}
            </DialogTitle>
            <DialogDescription className="text-sm pt-1">
              {confirmDialog.type === "omitir" && (
                <>
                  El extracto se marcará con la etiqueta <span className="font-semibold text-amber-700 dark:text-amber-400">"No pagada"</span>, saldrá de la lista <strong>Por Pagar</strong> y del <strong>Informe de Pagos</strong>, y se alojará en la pestaña <strong>Pagadas</strong>. Podrás reactivarlo en cualquier momento.
                </>
              )}
              {confirmDialog.type === "reactivar" && (
                <>
                  El extracto volverá a la lista <strong>Por Pagar</strong> y se reactivará su inclusión en el <strong>Informe de Pagos</strong>.
                </>
              )}
              {confirmDialog.type === "reversar" && (
                <>
                  Se anulará el comprobante contable vinculado y el extracto volverá al estado <strong>Por Pagar</strong>.
                </>
              )}
              {confirmDialog.type === "eliminar" && (
                <>
                  Esta acción eliminará el extracto y todas sus líneas de movimiento bancario asociadas. Esta acción no se puede deshacer.
                </>
              )}
              {confirmDialog.type === "aplicar_favor" && (
                <>
                  El saldo a favor acumulado de este extracto ({formatCOP(confirmDialog.extracto?.saldo_a_favor || 0)}) se trasladará al siguiente extracto pendiente del producto.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {confirmDialog.extracto && (
            <div className="bg-muted/50 rounded-lg p-3 text-xs space-y-1.5 border">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Producto:</span>
                <span className="font-semibold text-foreground">
                  {productoMap[confirmDialog.extracto.producto_id]?.nombre || "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Período:</span>
                <span className="font-medium font-mono text-foreground">{confirmDialog.extracto.periodo}</span>
              </div>
              {confirmDialog.extracto.fecha_pago && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Fecha límite de pago:</span>
                  <span className="font-medium">{formatDate(confirmDialog.extracto.fecha_pago)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Saldo extracto:</span>
                <span className="font-semibold font-mono text-foreground">
                  {formatCOP(confirmDialog.extracto.saldo_a_pagar)}
                </span>
              </div>
              {confirmDialog.type === "omitir" && (
                <div className="flex justify-between text-amber-700 dark:text-amber-400 pt-1 border-t">
                  <span className="font-medium">Saldo pendiente a omitir:</span>
                  <span className="font-bold font-mono">
                    {formatCOP(confirmDialog.extracto.saldo_pendiente ?? confirmDialog.extracto.saldo_a_pagar)}
                  </span>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0 mt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmDialog({ open: false, type: null, extracto: null, loading: false })}
              disabled={confirmDialog.loading}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant={
                confirmDialog.type === "eliminar"
                  ? "destructive"
                  : "default"
              }
              className={
                confirmDialog.type === "omitir"
                  ? "bg-amber-600 hover:bg-amber-700 text-white"
                  : ""
              }
              onClick={handleConfirmAction}
              disabled={confirmDialog.loading}
            >
              {confirmDialog.loading && <RefreshCw className="w-3.5 h-3.5 mr-2 animate-spin" />}
              {confirmDialog.type === "omitir" && "Confirmar Omitir Pago"}
              {confirmDialog.type === "reactivar" && "Confirmar Mover a Por Pagar"}
              {confirmDialog.type === "reversar" && "Confirmar Reversión"}
              {confirmDialog.type === "eliminar" && "Eliminar Extracto"}
              {confirmDialog.type === "aplicar_favor" && "Aplicar Saldo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo para Cambiar Período del Extracto */}
      <Dialog
        open={periodoDialog.open}
        onOpenChange={(v) => {
          if (!v && !periodoDialog.loading) {
            setPeriodoDialog({ open: false, extracto: null, nuevoPeriodo: "", nuevaFechaCorte: "", nuevaFechaPago: "", loading: false, error: "" });
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Calendar className="w-5 h-5 text-primary shrink-0" />
              <span>Cambiar período del extracto</span>
            </DialogTitle>
            <DialogDescription className="text-sm pt-1">
              Modifica el período asignado a este extracto si hubo un error al registrarlo, sin necesidad de repetir todo el proceso de carga.
            </DialogDescription>
          </DialogHeader>

          {periodoDialog.error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{periodoDialog.error}</span>
            </div>
          )}

          {periodoDialog.extracto && (
            <div className="space-y-3 py-1">
              <div className="bg-muted/50 rounded-lg p-3 text-xs space-y-1.5 border">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Producto:</span>
                  <span className="font-semibold text-foreground">
                    {productoMap[periodoDialog.extracto.producto_id]?.nombre || "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Período actual:</span>
                  <span className="font-bold font-mono text-foreground">{periodoDialog.extracto.periodo}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Saldo a pagar:</span>
                  <span className="font-semibold font-mono text-foreground">
                    {formatCOP(periodoDialog.extracto.saldo_a_pagar)}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="nuevo-periodo" className="text-xs font-medium">
                  Nuevo período (Mes/Año) *
                </Label>
                <Input
                  id="nuevo-periodo"
                  type="month"
                  value={periodoDialog.nuevoPeriodo}
                  onChange={(e) => setPeriodoDialog((prev) => ({ ...prev, nuevoPeriodo: e.target.value, error: "" }))}
                  className="font-mono h-9"
                  disabled={periodoDialog.loading}
                />
                <p className="text-[11px] text-muted-foreground">
                  Selecciona el mes y año real al que corresponde este extracto.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="space-y-1">
                  <Label htmlFor="fecha-corte" className="text-[11px] text-muted-foreground">
                    Fecha corte (opcional)
                  </Label>
                  <Input
                    id="fecha-corte"
                    type="date"
                    value={periodoDialog.nuevaFechaCorte}
                    onChange={(e) => setPeriodoDialog((prev) => ({ ...prev, nuevaFechaCorte: e.target.value }))}
                    className="font-mono text-xs h-8"
                    disabled={periodoDialog.loading}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="fecha-pago" className="text-[11px] text-muted-foreground">
                    Fecha límite pago (opcional)
                  </Label>
                  <Input
                    id="fecha-pago"
                    type="date"
                    value={periodoDialog.nuevaFechaPago}
                    onChange={(e) => setPeriodoDialog((prev) => ({ ...prev, nuevaFechaPago: e.target.value }))}
                    className="font-mono text-xs h-8"
                    disabled={periodoDialog.loading}
                  />
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0 mt-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPeriodoDialog({ open: false, extracto: null, nuevoPeriodo: "", nuevaFechaCorte: "", nuevaFechaPago: "", loading: false, error: "" })}
              disabled={periodoDialog.loading}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleGuardarNuevoPeriodo}
              disabled={periodoDialog.loading || !periodoDialog.nuevoPeriodo}
            >
              {periodoDialog.loading && <RefreshCw className="w-3.5 h-3.5 mr-2 animate-spin" />}
              Guardar Período
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}