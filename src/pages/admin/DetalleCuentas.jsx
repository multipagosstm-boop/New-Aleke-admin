import React, { useState, useEffect, useMemo } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { 
  Search, 
  Filter, 
  Download, 
  RotateCcw, 
  ExternalLink, 
  Eye, 
  Receipt, 
  ArrowUpRight, 
  ArrowDownLeft, 
  CheckCircle2, 
  AlertCircle, 
  Layers, 
  X,
  Wallet,
  ArrowLeft
} from "lucide-react";
import * as XLSX from "xlsx";
import { formatCOP, formatDate, formatMonthYear } from "@/lib/contabilidad";
import { toast } from "sonner";

// Determinar naturaleza contable de una cuenta según su código PUC
export function obtenerNaturalezaCuenta(codigo) {
  if (!codigo) return "debito";
  const primerDigito = String(codigo).trim().charAt(0);
  // Clases 1 (Activo), 5 (Gastos), 6 (Costos de Ventas), 7 (Costos de Producción) -> Débito
  if (["1", "5", "6", "7"].includes(primerDigito)) {
    return "debito";
  }
  // Clases 2 (Pasivo), 3 (Patrimonio), 4 (Ingresos) -> Crédito
  return "credito";
}

export function obtenerClaseNombre(codigo) {
  if (!codigo) return "Cuenta";
  const p = String(codigo).trim().charAt(0);
  switch (p) {
    case "1": return "Activo";
    case "2": return "Pasivo";
    case "3": return "Patrimonio";
    case "4": return "Ingresos";
    case "5": return "Gastos";
    case "6": return "Costos";
    case "7": return "Costos de Producción";
    default: return "Contabilidad";
  }
}

// Cuentas PUC frecuentes para acceso rápido
const CUENTAS_RAPIDAS = [
  { codigo: "1105", nombre: "Caja General" },
  { codigo: "1110", nombre: "Bancos" },
  { codigo: "1205", nombre: "Cartera / Créditos" },
  { codigo: "120502", nombre: "Emprendamos" },
  { codigo: "1305", nombre: "Clientes" },
  { codigo: "2105", nombre: "Bancos Nac. (TDC / Créditos)" },
  { codigo: "2205", nombre: "Proveedores" },
  { codigo: "2335", nombre: "Costos y Gastos por Pagar" },
  { codigo: "4135", nombre: "Comercio / Ingresos" },
  { codigo: "5105", nombre: "Gastos de Personal" }
];

export default function DetalleCuentas() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Estados de datos maestros
  const [cuentasPuc, setCuentasPuc] = useState([]);
  const [cuentasAhorro, setCuentasAhorro] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [comprobantesMap, setComprobantesMap] = useState({});
  const [loading, setLoading] = useState(true);

  // Cuenta seleccionada
  const cuentaParam = searchParams.get("cuenta") || "1110";
  const cdaIdParam = searchParams.get("cda_id") || searchParams.get("cuenta_ahorro_id");
  const [cuentaSel, setCuentaSel] = useState(cuentaParam);
  const [cuentaModalOpen, setCuentaModalOpen] = useState(false);
  const [filtroPucInput, setFiltroPucInput] = useState("");

  // Filtros del módulo
  const [periodoSel, setPeriodoSel] = useState(searchParams.get("periodo") || "");
  const [periodoExtractoSel, setPeriodoExtractoSel] = useState(searchParams.get("periodo_extracto") || "");
  const [fechaDesde, setFechaDesde] = useState(searchParams.get("fecha_desde") || "");
  const [fechaHasta, setFechaHasta] = useState(searchParams.get("fecha_hasta") || "");
  const [busquedaConcepto, setBusquedaConcepto] = useState(searchParams.get("concepto") || "");
  const [busquedaTercero, setBusquedaTercero] = useState(searchParams.get("tercero") || "");
  const [valorMin, setValorMin] = useState(searchParams.get("valor_min") || "");
  const [valorMax, setValorMax] = useState(searchParams.get("valor_max") || "");
  const [filtroSentido, setFiltroSentido] = useState(searchParams.get("sentido") || "todos"); // todos, debitos, creditos

  // Modal para ver asiento contable completo
  const [asientoDialogComp, setAsientoDialogComp] = useState(null);
  const [asientoDialogMovs, setAsientoDialogMovs] = useState([]);
  const [loadingAsiento, setLoadingAsiento] = useState(false);

  // Sincronizar cuenta desde query params si cambia en la URL
  useEffect(() => {
    const qCuenta = searchParams.get("cuenta");
    if (qCuenta && qCuenta !== cuentaSel) {
      setCuentaSel(qCuenta);
    }
    const qPeriodo = searchParams.get("periodo");
    if (qPeriodo !== null && qPeriodo !== periodoSel) {
      setPeriodoSel(qPeriodo);
    }
  }, [searchParams]);

  // Cargar cuentas PUC, cuentas de ahorro, comprobantes y movimientos
  useEffect(() => {
    let alive = true;
    setLoading(true);

    Promise.all([
      base44.entities.Cuenta.list("codigo", 1500).catch(() => []),
      base44.entities.ComprobanteContable.list("-fecha", 3000).catch(() => []),
      base44.entities.MovimientoContable.list("fecha", 10000).catch(() => []),
      base44.entities.CuentaAhorro.list().catch(() => [])
    ])
      .then(([puc, comps, movs, cdas]) => {
        if (!alive) return;
        setCuentasPuc(puc || []);
        setCuentasAhorro(cdas || []);

        const cMap = {};
        const idsComprobantesValidos = new Set();
        const idsComprobantesExcluidos = new Set();

        (comps || []).forEach((c) => {
          cMap[c.id] = c;
          const tipoNorm = String(c.tipo || "").toLowerCase().trim();
          const estadoNorm = String(c.estado || "").toLowerCase().trim();
          const descNorm = String(c.descripcion || "").toLowerCase();

          // 1. Debe estar estrictamente "contabilizado"
          const noContabilizado = estadoNorm !== "contabilizado";

          // 2. Excluir si es tipo nota de crédito
          const esNotaCredito = tipoNorm === "nota_credito" || tipoNorm.includes("nota_credito") || tipoNorm === "nota credito";

          // 3. Excluir si es anulación o reversión
          const esAnulado = estadoNorm === "anulado" || !!c.motivo_anulacion;
          const tieneOrigenEspejo = !!c.comprobante_origen_id;
          const esDescReversion = 
            descNorm.startsWith("anulación") || 
            descNorm.startsWith("anulacion") || 
            descNorm.startsWith("reversión") || 
            descNorm.startsWith("reversion") ||
            descNorm.includes("anulación de") ||
            descNorm.includes("reversión de");

          if (noContabilizado || esNotaCredito || esAnulado || tieneOrigenEspejo || esDescReversion) {
            idsComprobantesExcluidos.add(c.id);
            if (c.comprobante_origen_id) {
              idsComprobantesExcluidos.add(c.comprobante_origen_id);
            }
          } else {
            idsComprobantesValidos.add(c.id);
          }
        });
        setComprobantesMap(cMap);

        // Filtrar únicamente los movimientos activos y contabilizados
        const validMovs = (movs || []).filter((m) => {
          // Estado propio del movimiento
          const estadoM = String(m.estado || "activo").toLowerCase().trim();
          if (estadoM === "inactivo" || estadoM === "anulado" || estadoM === "reversado") {
            return false;
          }

          // Verificar que el comprobante asociado esté validado como contabilizado
          if (!idsComprobantesValidos.has(m.comprobante_id)) {
            return false;
          }
          if (idsComprobantesExcluidos.has(m.comprobante_id)) {
            return false;
          }

          // Descartar si el movimiento está marcado como anulación o reversión
          if (m.es_anulacion || m.es_reversion) {
            return false;
          }

          const descM = String(m.descripcion || "").toLowerCase();
          if (descM.startsWith("anulación") || descM.startsWith("anulacion") || descM.startsWith("reversión") || descM.startsWith("reversion")) {
            return false;
          }

          return true;
        });

        setMovimientos(validMovs);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error cargando datos contables:", err);
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  // Objeto de la cuenta seleccionada en el PUC
  const infoCuentaSel = useMemo(() => {
    if (!cuentaSel) return null;
    const match = cuentasPuc.find((c) => String(c.codigo) === String(cuentaSel));
    if (match) return match;

    // Si es un código como 1110 o 1205 no encontrado directamente, buscar primer hijo o armar objeto sintético
    const subHijo = cuentasPuc.find((c) => String(c.codigo).startsWith(cuentaSel));
    return {
      codigo: cuentaSel,
      concepto: subHijo ? `Grupo / Cuenta ${cuentaSel}` : `Cuenta ${cuentaSel}`,
      nivel: cuentaSel.length <= 2 ? "Grupo" : cuentaSel.length <= 4 ? "Cuenta" : "Subcuenta",
      clase: cuentaSel.charAt(0)
    };
  }, [cuentasPuc, cuentaSel]);

  const naturalezaCuenta = useMemo(() => {
    return obtenerNaturalezaCuenta(cuentaSel);
  }, [cuentaSel]);

  // Lista de periodos disponibles para el selector
  const listaPeriodosOperacion = useMemo(() => {
    const setP = new Set();
    movimientos.forEach((m) => {
      if (m.periodo_operacion) setP.add(m.periodo_operacion);
    });
    return Array.from(setP).sort((a, b) => b.localeCompare(a));
  }, [movimientos]);

  // Lista de periodos de extracto disponibles para el selector
  const listaPeriodosExtracto = useMemo(() => {
    const setP = new Set();
    movimientos.forEach((m) => {
      if (m.periodo_extracto) setP.add(m.periodo_extracto);
    });
    return Array.from(setP).sort((a, b) => b.localeCompare(a));
  }, [movimientos]);

  // Manejador de cambio de cuenta
  const handleSelectCuenta = (cod) => {
    setCuentaSel(cod);
    setCuentaModalOpen(false);
    const newParams = new URLSearchParams(searchParams);
    newParams.set("cuenta", cod);
    setSearchParams(newParams);
  };

  // Manejador de cambio de período
  const handleSelectPeriodo = (p) => {
    setPeriodoSel(p);
    const newParams = new URLSearchParams(searchParams);
    if (p) newParams.set("periodo", p);
    else newParams.delete("periodo");
    setSearchParams(newParams);
  };

  // Limpiar todos los filtros
  const handleLimpiarFiltros = () => {
    setPeriodoSel("");
    setPeriodoExtractoSel("");
    setFechaDesde("");
    setFechaHasta("");
    setBusquedaConcepto("");
    setBusquedaTercero("");
    setValorMin("");
    setValorMax("");
    setFiltroSentido("todos");
    setSearchParams({ cuenta: cuentaSel });
    toast.info("Filtros restablecidos");
  };

  // Identificar si la cuenta consultada corresponde a una Cuenta de Ahorro (CDA)
  const cdaActiva = useMemo(() => {
    return cuentasAhorro.find((c) => 
      (cdaIdParam && String(c.id) === String(cdaIdParam)) ||
      (cuentaSel && String(c.subcuenta_puc || "").trim() === String(cuentaSel || "").trim())
    );
  }, [cuentasAhorro, cdaIdParam, cuentaSel]);

  // Movimientos de la cuenta seleccionada (todos los históricos para calcular saldo anterior)
  const movimientosCuentaCompleta = useMemo(() => {
    if (!cuentaSel) return [];
    const prefix = String(cuentaSel).trim();
    return movimientos.filter((m) => {
      const matchSub = String(m.subcuenta || "").startsWith(prefix);
      if (!matchSub) return false;
      if (cdaIdParam && m.cuenta_ahorro_id) {
        return String(m.cuenta_ahorro_id) === String(cdaIdParam);
      }
      return true;
    });
  }, [movimientos, cuentaSel, cdaIdParam]);

  // Filtrado y cálculo de Saldo Inicial / Anterior
  const { movimientosFiltrados, saldoInicial, metricas } = useMemo(() => {
    if (!cuentaSel) {
      return {
        movimientosFiltrados: [],
        saldoInicial: 0,
        metricas: { debito: 0, credito: 0, neto: 0, saldoFinal: 0, count: 0 }
      };
    }

    const conceptoQuery = busquedaConcepto.trim().toLowerCase();
    const terceroQuery = busquedaTercero.trim().toLowerCase();
    const minVal = valorMin !== "" ? Number(valorMin) : null;
    const maxVal = valorMax !== "" ? Number(valorMax) : null;

    let saldoAnt = 0;
    const filtrados = [];

    // Ordenar cronológicamente (más antiguo a más reciente para saldo progresivo)
    const ordenados = [...movimientosCuentaCompleta].sort((a, b) => {
      const cmpFecha = (a.fecha || "").localeCompare(b.fecha || "");
      if (cmpFecha !== 0) return cmpFecha;
      return String(a.id || "").localeCompare(String(b.id || ""));
    });

    for (const m of ordenados) {
      const d = Number(m.debito) || 0;
      const c = Number(m.credito) || 0;
      const fechaM = m.fecha || "";
      const periodoM = m.periodo_operacion || "";

      // 1. Determinar si es anterior al rango temporal
      let esAnterior = false;
      if (fechaDesde && fechaM < fechaDesde) {
        esAnterior = true;
      } else if (!fechaDesde && periodoSel && periodoM < periodoSel) {
        esAnterior = true;
      }

      if (esAnterior) {
        if (naturalezaCuenta === "debito") {
          saldoAnt += d - c;
        } else {
          saldoAnt += c - d;
        }
        continue;
      }

      // 2. Aplicar filtros dentro del período/rango
      if (fechaDesde && fechaM < fechaDesde) continue;
      if (fechaHasta && fechaM > fechaHasta) continue;
      if (periodoSel && periodoM !== periodoSel) continue;
      if (periodoExtractoSel && m.periodo_extracto !== periodoExtractoSel) continue;

      if (filtroSentido === "debitos" && d <= 0) continue;
      if (filtroSentido === "creditos" && c <= 0) continue;

      if (minVal !== null && Math.max(d, c) < minVal) continue;
      if (maxVal !== null && Math.min(d > 0 ? d : c, c > 0 ? c : d) > maxVal) continue;

      if (conceptoQuery) {
        const descM = (m.descripcion || "").toLowerCase();
        const descC = (comprobantesMap[m.comprobante_id]?.descripcion || "").toLowerCase();
        if (!descM.includes(conceptoQuery) && !descC.includes(conceptoQuery)) {
          continue;
        }
      }

      if (terceroQuery) {
        const terc = (m.tercero || "").toLowerCase();
        if (!terc.includes(terceroQuery)) {
          continue;
        }
      }

      filtrados.push(m);
    }

    // Cálculo del saldo progresivo para cada movimiento
    let acumulador = saldoAnt;
    const conSaldoProgresivo = filtrados.map((m) => {
      const d = Number(m.debito) || 0;
      const c = Number(m.credito) || 0;
      if (naturalezaCuenta === "debito") {
        acumulador += d - c;
      } else {
        acumulador += c - d;
      }
      return {
        ...m,
        saldoProgresivo: acumulador
      };
    });

    // Invertir para mostrar de más reciente a más antiguo en la tabla principal
    const reversados = [...conSaldoProgresivo].reverse();

    const sumDeb = filtrados.reduce((s, m) => s + (Number(m.debito) || 0), 0);
    const sumCred = filtrados.reduce((s, m) => s + (Number(m.credito) || 0), 0);
    const netoPeriodo = naturalezaCuenta === "debito" ? sumDeb - sumCred : sumCred - sumDeb;
    const saldoFin = saldoAnt + netoPeriodo;

    return {
      movimientosFiltrados: reversados,
      saldoInicial: saldoAnt,
      metricas: {
        debito: sumDeb,
        credito: sumCred,
        neto: netoPeriodo,
        saldoFinal: saldoFin,
        count: filtrados.length
      }
    };
  }, [
    movimientosCuentaCompleta,
    cuentaSel,
    naturalezaCuenta,
    periodoSel,
    periodoExtractoSel,
    fechaDesde,
    fechaHasta,
    busquedaConcepto,
    busquedaTercero,
    valorMin,
    valorMax,
    filtroSentido,
    comprobantesMap
  ]);

  // Abrir modal de asiento contable
  const handleVerAsiento = async (comprobanteId) => {
    if (!comprobanteId) return;
    setLoadingAsiento(true);
    try {
      const comp = comprobantesMap[comprobanteId] || (await base44.entities.ComprobanteContable.get(comprobanteId));
      const movs = await base44.entities.MovimientoContable.filter({ comprobante_id: comprobanteId });
      setAsientoDialogComp(comp);
      setAsientoDialogMovs(movs || []);
    } catch (err) {
      console.error("Error al cargar asiento:", err);
      toast.error("No se pudo cargar el asiento contable.");
    } finally {
      setLoadingAsiento(false);
    }
  };

  // Exportar a Excel
  const handleExportarExcel = () => {
    if (movimientosFiltrados.length === 0) {
      toast.warning("No hay movimientos para exportar con los filtros actuales.");
      return;
    }

    try {
      const rows = movimientosFiltrados.map((m) => {
        const comp = comprobantesMap[m.comprobante_id];
        return {
          Fecha: m.fecha || "",
          "Comprobante N°": comp?.numero || "—",
          "Tipo Comprobante": comp?.tipo || "—",
          Subcuenta: m.subcuenta || "",
          "Nombre Cuenta": m.cuenta_nombre || "",
          Concepto: m.descripcion || comp?.descripcion || "",
          Tercero: m.tercero || "",
          "Periodo Operación": m.periodo_operacion || "",
          "Periodo Extracto": m.periodo_extracto || "",
          "Débito ($)": Number(m.debito) || 0,
          "Crédito ($)": Number(m.credito) || 0,
          "Saldo Progresivo ($)": m.saldoProgresivo || 0
        };
      });

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Detalle_Cuenta");
      
      const fileName = `detalle-cuenta-${cuentaSel}-${periodoSel || "todos"}.xlsx`;
      XLSX.writeFile(wb, fileName);
      toast.success(`Archivo descargado: ${fileName}`);
    } catch (err) {
      console.error("Error exportando a Excel:", err);
      toast.error("Ocurrió un error al generar el archivo Excel.");
    }
  };

  // Cuentas filtradas en el modal del PUC
  const cuentasPucFiltradas = useMemo(() => {
    if (!filtroPucInput.trim()) return cuentasPuc.slice(0, 150);
    const q = filtroPucInput.toLowerCase().trim();
    return cuentasPuc.filter(
      (c) => String(c.codigo).includes(q) || (c.concepto || "").toLowerCase().includes(q)
    );
  }, [cuentasPuc, filtroPucInput]);

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Encabezado Principal y Acciones */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border-b pb-4">
        <div>
          <div className="flex items-center flex-wrap gap-2">
            <h1 className="text-xl sm:text-2xl font-heading font-bold tracking-tight">Detalle de Cuentas</h1>
            <Badge variant="outline" className="text-xs uppercase font-mono bg-muted/30">
              Libro Mayor y Auxiliar
            </Badge>
            <Badge variant="outline" className="text-xs font-mono border-emerald-500/40 text-emerald-700 dark:text-emerald-400 bg-emerald-50/60 dark:bg-emerald-950/20 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" /> Solo Contabilizados
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Consulta cronológica de movimientos activos y contabilizados por cuenta contable (excluye notas crédito, anulaciones y reversiones).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportarExcel}
            className="h-8 text-xs gap-1.5"
            disabled={movimientosFiltrados.length === 0}
          >
            <Download className="w-3.5 h-3.5" /> Exportar a Excel
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleLimpiarFiltros}
            className="h-8 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
            title="Restablecer filtros"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Limpiar
          </Button>

          <Link to="/admin/contabilidad/balance">
            <Button variant="ghost" size="sm" className="h-8 text-xs gap-1 text-primary">
              Ir a Balance <ArrowUpRight className="w-3.5 h-3.5" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Banner informativo si se está consultando una Cuenta de Ahorro (CDA) */}
      {cdaActiva && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-lg border border-primary/25 bg-primary/5 text-xs shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0 border border-primary/20">
              <Wallet className="w-4 h-4" />
            </div>
            <div>
              <div className="font-semibold text-sm text-foreground flex items-center flex-wrap gap-2">
                <span>{cdaActiva.nombre}</span>
                <Badge variant="outline" className="text-[10px] font-mono border-primary/40 text-primary bg-primary/10">
                  CDA {cdaActiva.banco} · Subcuenta PUC {cdaActiva.subcuenta_puc}
                </Badge>
                <Badge variant={cdaActiva.estado === "activa" ? "default" : "secondary"} className="text-[10px]">
                  {cdaActiva.estado === "activa" ? "Activa" : "Inactiva"}
                </Badge>
              </div>
              <div className="text-muted-foreground mt-0.5">
                N° de cuenta: <span className="font-mono text-foreground">{cdaActiva.numero_completo || "—"}</span> · Saldo actual en CDA: <b className="font-mono text-foreground">{formatCOP(cdaActiva.saldo)}</b>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-center">
            <Button asChild size="sm" variant="outline" className="h-7 text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/10">
              <Link to="/admin/financieros/cuentas-ahorro">
                <ArrowLeft className="w-3.5 h-3.5" /> Volver a Cuentas de Ahorro
              </Link>
            </Button>
          </div>
        </div>
      )}

      {/* Selector de Cuenta PUC y Accesos Rápidos */}
      <Card className="border bg-card shadow-sm">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block">
                  Cuenta Contable Consultada
                </span>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="font-mono text-lg font-bold text-primary">{infoCuentaSel?.codigo}</span>
                  <span className="text-sm font-semibold text-foreground truncate max-w-[280px] sm:max-w-md">
                    {infoCuentaSel?.concepto}
                  </span>
                  <Badge variant="secondary" className="text-[10px] uppercase font-mono">
                    {infoCuentaSel?.nivel || "Cuenta"}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] uppercase">
                    Clase {obtenerClaseNombre(infoCuentaSel?.codigo)}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={`text-[10px] uppercase font-mono ${
                      naturalezaCuenta === "debito"
                        ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20"
                        : "border-blue-500/40 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/20"
                    }`}
                  >
                    Naturaleza {naturalezaCuenta === "debito" ? "Débito (+D -C)" : "Crédito (+C -D)"}
                  </Badge>
                </div>
              </div>
            </div>

            <Button
              onClick={() => setCuentaModalOpen(true)}
              variant="default"
              size="sm"
              className="h-9 gap-2 shrink-0 font-medium"
            >
              <Search className="w-4 h-4" /> Seleccionar Otra Cuenta del PUC
            </Button>
          </div>

          {/* Accesos rápidos a cuentas habituales */}
          <div className="pt-2 border-t flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span className="font-medium text-[11px] uppercase mr-1">Cuentas frecuentes:</span>
            {CUENTAS_RAPIDAS.map((c) => (
              <button
                key={c.codigo}
                onClick={() => handleSelectCuenta(c.codigo)}
                className={`px-2.5 py-1 rounded text-[11px] font-mono transition-colors border ${
                  cuentaSel === c.codigo
                    ? "bg-primary text-primary-foreground border-primary font-bold shadow-xs"
                    : "bg-muted/30 hover:bg-muted text-foreground/80 border-border"
                }`}
              >
                <span className="font-bold">{c.codigo}</span> · {c.nombre}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Tarjetas KPI de Saldos y Totales */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="p-3 bg-muted/20 border">
          <span className="text-[11px] uppercase font-semibold text-muted-foreground block">
            Saldo Anterior / Inicial
          </span>
          <div className="mt-1 font-mono font-bold text-sm sm:text-base text-foreground">
            {formatCOP(saldoInicial)}
          </div>
          <span className="text-[10px] text-muted-foreground block truncate">
            {fechaDesde ? `Hasta ${formatDate(fechaDesde)}` : periodoSel ? `Antes de ${formatMonthYear(periodoSel)}` : "Saldo de arranque"}
          </span>
        </Card>

        <Card className="p-3 bg-emerald-500/5 border border-emerald-500/20">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase font-semibold text-emerald-800 dark:text-emerald-400 block">
              Total Débitos
            </span>
            <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <div className="mt-1 font-mono font-bold text-sm sm:text-base text-emerald-700 dark:text-emerald-300">
            {formatCOP(metricas.debito)}
          </div>
          <span className="text-[10px] text-emerald-600/80 block">Movimientos al Debe</span>
        </Card>

        <Card className="p-3 bg-blue-500/5 border border-blue-500/20">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase font-semibold text-blue-800 dark:text-blue-400 block">
              Total Créditos
            </span>
            <ArrowUpRight className="w-3.5 h-3.5 text-blue-600" />
          </div>
          <div className="mt-1 font-mono font-bold text-sm sm:text-base text-blue-700 dark:text-blue-300">
            {formatCOP(metricas.credito)}
          </div>
          <span className="text-[10px] text-blue-600/80 block">Movimientos al Haber</span>
        </Card>

        <Card className="p-3 bg-muted/20 border">
          <span className="text-[11px] uppercase font-semibold text-muted-foreground block">
            Variación Neta
          </span>
          <div className={`mt-1 font-mono font-bold text-sm sm:text-base ${metricas.neto >= 0 ? "text-success" : "text-destructive"}`}>
            {formatCOP(metricas.neto)}
          </div>
          <span className="text-[10px] text-muted-foreground block">En el rango filtrado</span>
        </Card>

        <Card className="p-3 bg-primary/5 border border-primary/20">
          <span className="text-[11px] uppercase font-semibold text-primary block">
            Saldo Acumulado Final
          </span>
          <div className="mt-1 font-mono font-bold text-sm sm:text-base text-primary">
            {formatCOP(metricas.saldoFinal)}
          </div>
          <span className="text-[10px] text-muted-foreground block">Saldo final de la cuenta</span>
        </Card>

        <Card className="p-3 bg-muted/20 border">
          <span className="text-[11px] uppercase font-semibold text-muted-foreground block">
            Registros Filtrados
          </span>
          <div className="mt-1 font-mono font-bold text-sm sm:text-base text-foreground">
            {metricas.count}
          </div>
          <span className="text-[10px] text-muted-foreground block">Líneas de movimiento</span>
        </Card>
      </div>

      {/* Barra de Filtros Múltiples */}
      <Card className="border shadow-xs">
        <CardHeader className="py-3 px-4 border-b bg-muted/15 flex flex-row items-center justify-between">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-primary" /> Filtros de Movimientos
          </CardTitle>
          <div className="flex items-center gap-2">
            {(periodoSel || periodoExtractoSel || fechaDesde || fechaHasta || busquedaConcepto || busquedaTercero || valorMin || valorMax || filtroSentido !== "todos") && (
              <Badge variant="secondary" className="text-[10px]">
                Filtros activos
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 text-xs">
            {/* Período de Operación */}
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Período de Operación</Label>
              <select
                value={periodoSel}
                onChange={(e) => handleSelectPeriodo(e.target.value)}
                className="w-full h-8 px-2 rounded-md border bg-background font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">Todos los períodos</option>
                {listaPeriodosOperacion.map((p) => (
                  <option key={p} value={p}>
                    {formatMonthYear(p)} ({p})
                  </option>
                ))}
              </select>
            </div>

            {/* Fecha Desde */}
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Fecha Desde</Label>
              <Input
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                className="h-8 font-mono text-xs"
              />
            </div>

            {/* Fecha Hasta */}
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Fecha Hasta</Label>
              <Input
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
                className="h-8 font-mono text-xs"
              />
            </div>

            {/* Período del Extracto (TDC / Bancos) */}
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground" title="Período de facturación del extracto">
                Período Extracto (TDC)
              </Label>
              <select
                value={periodoExtractoSel}
                onChange={(e) => setPeriodoExtractoSel(e.target.value)}
                className="w-full h-8 px-2 rounded-md border bg-background font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">Todos los extractos</option>
                {listaPeriodosExtracto.map((p) => (
                  <option key={p} value={p}>
                    Extracto {p}
                  </option>
                ))}
              </select>
            </div>

            {/* Búsqueda por Concepto */}
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Buscar Concepto</Label>
              <div className="relative">
                <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={busquedaConcepto}
                  onChange={(e) => setBusquedaConcepto(e.target.value)}
                  placeholder="Ej: Abono, Compra..."
                  className="h-8 pl-7 text-xs"
                />
              </div>
            </div>

            {/* Búsqueda por Tercero */}
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Tercero / Cliente</Label>
              <div className="relative">
                <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={busquedaTercero}
                  onChange={(e) => setBusquedaTercero(e.target.value)}
                  placeholder="Ej: Emprendamos, Multipagos..."
                  className="h-8 pl-7 text-xs"
                />
              </div>
            </div>

            {/* Valor Mínimo */}
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Valor Mínimo ($)</Label>
              <Input
                type="number"
                value={valorMin}
                onChange={(e) => setValorMin(e.target.value)}
                placeholder="0"
                className="h-8 font-mono text-xs"
              />
            </div>

            {/* Valor Máximo */}
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Valor Máximo ($)</Label>
              <Input
                type="number"
                value={valorMax}
                onChange={(e) => setValorMax(e.target.value)}
                placeholder="Sin límite"
                className="h-8 font-mono text-xs"
              />
            </div>

            {/* Sentido / Tipo Movimiento */}
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Sentido Contable</Label>
              <select
                value={filtroSentido}
                onChange={(e) => setFiltroSentido(e.target.value)}
                className="w-full h-8 px-2 rounded-md border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="todos">Todos los movimientos</option>
                <option value="debitos">Solo Débitos</option>
                <option value="creditos">Solo Créditos</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabla Principal de Movimientos */}
      <Card className="border shadow-xs overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/20 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold uppercase text-muted-foreground tracking-wider">
              Movimientos Contables Registrados
            </h2>
            <Badge variant="outline" className="font-mono text-xs">
              {movimientosFiltrados.length} fila(s)
            </Badge>
          </div>

          <span className="text-xs text-muted-foreground">
            Ordenado cronológicamente con saldo progresivo acumulado
          </span>
        </div>

        {loading ? (
          <div className="py-16 text-center text-muted-foreground flex flex-col items-center justify-center gap-2">
            <div className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
            <span className="text-xs">Cargando movimientos de la cuenta...</span>
          </div>
        ) : movimientosFiltrados.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground space-y-2">
            <AlertCircle className="w-8 h-8 text-muted-foreground/60 mx-auto" />
            <p className="text-sm font-medium">No se encontraron movimientos para los filtros seleccionados.</p>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Verifica el rango de fechas, los términos de búsqueda o selecciona otro período o cuenta contable.
            </p>
            <Button variant="outline" size="sm" onClick={handleLimpiarFiltros} className="mt-2 text-xs">
              Limpiar Filtros
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/60 border-b text-left text-muted-foreground uppercase tracking-wider font-semibold">
                <tr>
                  <th className="px-3 py-2.5">Fecha</th>
                  <th className="px-3 py-2.5">Comprobante</th>
                  <th className="px-3 py-2.5">Subcuenta</th>
                  <th className="px-3 py-2.5 min-w-[200px]">Concepto / Descripción</th>
                  <th className="px-3 py-2.5 min-w-[150px]">Tercero / Cliente</th>
                  <th className="px-3 py-2.5 text-center">Per. Op.</th>
                  <th className="px-3 py-2.5 text-center">Extracto</th>
                  <th className="px-3 py-2.5 text-right">Débito</th>
                  <th className="px-3 py-2.5 text-right">Crédito</th>
                  <th className="px-3 py-2.5 text-right">Saldo Progresivo</th>
                  <th className="px-3 py-2.5 text-center w-28">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 font-mono">
                {movimientosFiltrados.map((m) => {
                  const comp = comprobantesMap[m.comprobante_id];
                  const d = Number(m.debito) || 0;
                  const c = Number(m.credito) || 0;

                  return (
                    <tr key={m.id} className="hover:bg-muted/25 transition-colors">
                      <td className="px-3 py-2 whitespace-nowrap text-foreground/90">{formatDate(m.fecha)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <button
                          onClick={() => handleVerAsiento(m.comprobante_id)}
                          className="font-bold text-primary hover:underline flex items-center gap-1 group"
                          title="Ver asiento contable completo"
                        >
                          <Receipt className="w-3 h-3 text-primary/70 group-hover:text-primary shrink-0" />
                          {comp?.numero || "S/N"}
                        </button>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="font-semibold text-primary">{m.subcuenta}</span>
                        {m.cuenta_nombre && (
                          <span className="text-[10px] font-sans text-muted-foreground block truncate max-w-[140px]">
                            {m.cuenta_nombre}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-sans text-foreground/90 max-w-xs truncate" title={m.descripcion || comp?.descripcion || ""}>
                        {m.descripcion || comp?.descripcion || "—"}
                      </td>
                      <td className="px-3 py-2 font-sans text-muted-foreground max-w-[180px] truncate" title={m.tercero || ""}>
                        {m.tercero ? (
                          <span className="font-medium text-foreground/85">{m.tercero}</span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2 text-center text-[11px] text-muted-foreground whitespace-nowrap">
                        {m.periodo_operacion || "—"}
                      </td>
                      <td className="px-3 py-2 text-center whitespace-nowrap">
                        {m.periodo_extracto ? (
                          <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0">
                            {m.periodo_extracto}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground/40">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {d > 0 ? (
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">
                            {formatCOP(d)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/30">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {c > 0 ? (
                          <span className="font-bold text-blue-600 dark:text-blue-400">
                            {formatCOP(c)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/30">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap font-bold">
                        <span
                          className={
                            m.saldoProgresivo >= 0
                              ? "text-foreground"
                              : "text-destructive"
                          }
                        >
                          {formatCOP(m.saldoProgresivo)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center whitespace-nowrap font-sans">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-primary hover:bg-primary/10"
                            onClick={() => handleVerAsiento(m.comprobante_id)}
                            title="Ver asiento contable completo"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                          {m.comprobante_id && (
                            <Link
                              to={`/admin/contabilidad/libro-diario?comprobante_id=${m.comprobante_id}`}
                              className="inline-flex items-center justify-center h-7 w-7 text-muted-foreground hover:text-foreground rounded hover:bg-muted"
                              title="Abrir en Libro Diario"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-muted/40 font-semibold border-t-2 border-border text-xs font-mono">
                <tr>
                  <td colSpan={7} className="px-3 py-2.5 text-right font-sans font-bold text-foreground">
                    Totales del Período / Filtro:
                  </td>
                  <td className="px-3 py-2.5 text-right text-emerald-700 dark:text-emerald-400 font-bold">
                    {formatCOP(metricas.debito)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-blue-700 dark:text-blue-400 font-bold">
                    {formatCOP(metricas.credito)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-bold text-primary">
                    {formatCOP(metricas.saldoFinal)}
                  </td>
                  <td className="px-3 py-2.5 text-center font-sans text-muted-foreground text-[10px]">
                    {metricas.count} filas
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      {/* Modal para Seleccionar Cuenta del PUC */}
      <Dialog open={cuentaModalOpen} onOpenChange={setCuentaModalOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-4 sm:p-6 z-[70]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-primary" /> Seleccionar Cuenta del Plan Único de Cuentas (PUC)
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2 flex-1 overflow-hidden flex flex-col">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={filtroPucInput}
                onChange={(e) => setFiltroPucInput(e.target.value)}
                placeholder="Buscar por código (ej. 1110, 120502) o nombre (ej. Bancos, Cartera, Emprendamos)..."
                className="pl-9 h-9 text-xs"
                autoFocus
              />
              {filtroPucInput && (
                <button
                  onClick={() => setFiltroPucInput("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="overflow-y-auto flex-1 border rounded-lg divide-y divide-border/40">
              {cuentasPucFiltradas.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground">
                  No se encontraron cuentas que coincidan con &quot;{filtroPucInput}&quot;.
                </div>
              ) : (
                cuentasPucFiltradas.map((c) => {
                  const esActiva = String(cuentaSel) === String(c.codigo);
                  const nat = obtenerNaturalezaCuenta(c.codigo);
                  return (
                    <button
                      key={c.id || c.codigo}
                      onClick={() => handleSelectCuenta(String(c.codigo))}
                      className={`w-full text-left p-2.5 flex items-center justify-between gap-3 hover:bg-muted/40 transition-colors ${
                        esActiva ? "bg-primary/10 border-l-4 border-l-primary" : ""
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="font-mono text-xs font-bold text-primary shrink-0 min-w-[70px]">
                          {c.codigo}
                        </span>
                        <span className="text-xs font-medium text-foreground truncate">{c.concepto}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge variant="outline" className="text-[10px] font-mono">
                          {c.nivel || "Cuenta"}
                        </Badge>
                        <Badge
                          variant="secondary"
                          className={`text-[10px] font-mono ${
                            nat === "debito" ? "text-emerald-600 dark:text-emerald-400" : "text-blue-600 dark:text-blue-400"
                          }`}
                        >
                          {nat === "debito" ? "D" : "C"}
                        </Badge>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <DialogFooter className="border-t pt-3">
            <Button variant="outline" size="sm" onClick={() => setCuentaModalOpen(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Asiento Contable Completo */}
      <Dialog open={!!asientoDialogComp} onOpenChange={(v) => !v && setAsientoDialogComp(null)}>
        <DialogContent className="max-w-4xl max-h-[88vh] overflow-y-auto z-[80]">
          <DialogHeader>
            <div className="flex items-center justify-between gap-2 border-b pb-3">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-primary" />
                <DialogTitle className="text-base font-heading">
                  Asiento Contable: Comprobante {asientoDialogComp?.numero}
                </DialogTitle>
                <Badge variant="outline" className="font-mono text-xs">
                  {asientoDialogComp?.tipo}
                </Badge>
                {asientoDialogComp && (
                  <Badge variant={asientoDialogComp.estado === "contabilizado" ? "default" : "destructive"} className="text-xs">
                    {asientoDialogComp.estado}
                  </Badge>
                )}
              </div>
              {asientoDialogComp?.id && (
                <Link
                  to={`/admin/contabilidad/libro-diario?comprobante_id=${asientoDialogComp.id}`}
                  className="text-xs text-primary hover:underline flex items-center gap-1 font-medium mr-6"
                >
                  Abrir en Libro Diario <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              )}
            </div>
          </DialogHeader>

          {loadingAsiento ? (
            <div className="py-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
              <div className="w-5 h-5 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
              Cargando detalle del asiento...
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-muted/20 p-3 rounded-lg border">
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase block">Fecha de Registro</span>
                  <span className="font-mono font-medium">{formatDate(asientoDialogComp?.fecha)}</span>
                </div>
                <div className="col-span-2 sm:col-span-2">
                  <span className="text-[10px] text-muted-foreground uppercase block">Descripción General</span>
                  <span className="font-medium truncate block">{asientoDialogComp?.descripcion || "—"}</span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase block">Total Partida</span>
                  <span className="font-mono font-bold text-primary">
                    {formatCOP(asientoDialogComp?.total_debito || 0)}
                  </span>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-1.5 tracking-wider">
                  Líneas de Movimiento del Asiento ({asientoDialogMovs.length})
                </h4>
                <div className="border rounded-lg overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 border-b text-left text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">Subcuenta</th>
                        <th className="px-3 py-2 font-medium">Nombre de Cuenta</th>
                        <th className="px-3 py-2 font-medium">Concepto</th>
                        <th className="px-3 py-2 font-medium">Tercero</th>
                        <th className="px-3 py-2 font-medium text-right">Débito</th>
                        <th className="px-3 py-2 font-medium text-right">Crédito</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30 font-mono">
                      {asientoDialogMovs.map((m) => {
                        const esEstaCuenta = String(m.subcuenta || "").startsWith(cuentaSel);
                        return (
                          <tr key={m.id} className={esEstaCuenta ? "bg-primary/5 font-semibold" : "hover:bg-muted/20"}>
                            <td className="px-3 py-2 text-primary">{m.subcuenta}</td>
                            <td className="px-3 py-2 font-sans">{m.cuenta_nombre || "—"}</td>
                            <td className="px-3 py-2 font-sans text-muted-foreground truncate max-w-xs">{m.descripcion || "—"}</td>
                            <td className="px-3 py-2 font-sans text-muted-foreground">{m.tercero || "—"}</td>
                            <td className="px-3 py-2 text-right">
                              {Number(m.debito) > 0 ? formatCOP(m.debito) : "—"}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {Number(m.credito) > 0 ? formatCOP(m.credito) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="border-t bg-muted/40 font-mono font-semibold">
                      <tr>
                        <td colSpan={4} className="px-3 py-2 text-right font-sans text-xs">
                          Sumas Iguales:
                        </td>
                        <td className="px-3 py-2 text-right text-xs">
                          {formatCOP(asientoDialogMovs.reduce((s, m) => s + (Number(m.debito) || 0), 0))}
                        </td>
                        <td className="px-3 py-2 text-right text-xs">
                          {formatCOP(asientoDialogMovs.reduce((s, m) => s + (Number(m.credito) || 0), 0))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <div className="flex items-center gap-1.5 text-xs mt-2">
                  {Math.abs(
                    asientoDialogMovs.reduce((s, m) => s + (Number(m.debito) || 0), 0) -
                    asientoDialogMovs.reduce((s, m) => s + (Number(m.credito) || 0), 0)
                  ) < 0.01 ? (
                    <span className="text-success flex items-center gap-1 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Asiento cuadrado (Partida doble verificada)
                    </span>
                  ) : (
                    <span className="text-destructive flex items-center gap-1 font-medium">
                      <AlertCircle className="w-3.5 h-3.5" /> Asiento con descuadre en débitos y créditos
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="border-t pt-3">
            <Button variant="outline" size="sm" onClick={() => setAsientoDialogComp(null)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
