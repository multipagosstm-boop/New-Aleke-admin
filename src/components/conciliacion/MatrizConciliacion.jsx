import React, { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Lock, CheckCircle2, CircleDot, Plus, MinusCircle, Filter, X } from "lucide-react";
import { BANCO_NAMES, getDiaCorteEfectivo } from "@/lib/contabilidad";
import { cn } from "@/lib/utils";

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

// Determina si un mes en un año dado está en el futuro para una tarjeta específica
function esMesFuturo(año, mes, currentYear, currentMonth, today, producto) {
  if (año > currentYear) return true;
  if (año < currentYear) return false;
  if (mes > currentMonth) return true;
  if (mes < currentMonth) return false;
  // En el mes actual: si el día de corte de la tarjeta aún no ha llegado
  if (producto && today) {
    const diaCorte = getDiaCorteEfectivo ? getDiaCorteEfectivo(producto, año, mes - 1) : (producto.fecha_corte || 1);
    if (diaCorte && today.getDate() < diaCorte) {
      return true;
    }
  }
  return false;
}

// Estado de cada celda de la matriz:
// - cerrado / conciliado  → verde (Conciliados)
// - diferencias (con diferencias / en proceso) → amarillo (Por conciliar)
// - cargado (extracto cargado sin conciliar) → gris (Por conciliar)
// - saltado → gris tachado (Pasaron en blanco)
// - faltante (no hay extracto y la fecha de corte ya cumplió) → rojo punteado (Por registrar)
// - futuro (mes aún no alcanza) → vacío tenue
function celdaEstado(extracto, esFuturo) {
  if (extracto) {
    const esSaltado = extracto.estado === "saltado" || !!extracto.motivo_salto || String(extracto.observaciones || "").includes("EXTRACTO SALTADO");
    if (esSaltado) return "saltado";
    const est = extracto.estado_conciliacion || "sin_iniciar";
    if (est === "cerrado") return "cerrado";
    if (est === "conciliado") return "conciliado";
    if (est === "con_diferencias" || est === "en_proceso") return "diferencias";
    return "cargado";
  }
  return esFuturo ? "futuro" : "faltante";
}

// Verifica si el estado de una celda pertenece a una categoría de filtro
function cumpleCategoria(est, categoria) {
  if (categoria === "todos") return true;
  if (categoria === "conciliados") return est === "conciliado" || est === "cerrado";
  if (categoria === "por_registrar") return est === "faltante";
  if (categoria === "por_conciliar") return est === "cargado" || est === "diferencias";
  if (categoria === "en_blanco") return est === "saltado";
  return false;
}

const CELL_STYLE = {
  cerrado: "bg-success/80 text-success-foreground",
  conciliado: "bg-success/25 text-success border border-success/40",
  diferencias: "bg-warning/25 text-warning border border-warning/50",
  cargado: "bg-muted text-muted-foreground border border-border",
  saltado: "bg-muted/60 text-muted-foreground border border-border/60 line-through opacity-70",
  faltante: "border-2 border-dashed border-destructive/50 text-destructive/40 hover:bg-destructive/10",
  futuro: "border border-border/30 text-transparent"
};

const CELL_ICON = {
  cerrado: Lock,
  conciliado: CheckCircle2,
  diferencias: AlertTriangle,
  cargado: CircleDot,
  saltado: MinusCircle,
  faltante: Plus,
  futuro: null
};

export default function MatrizConciliacion({ productos, extractos, clienteMap, onAbrir, onCargar, onReactivarSaltado }) {
  const today = useMemo(() => new Date(), []);
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;
  const [año, setAño] = useState(currentYear);
  const [filtroBanco, setFiltroBanco] = useState("todos");
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todos"); // "todos" | "conciliados" | "por_registrar" | "por_conciliar" | "en_blanco"
  const [filtroMes, setFiltroMes] = useState("todos"); // "todos" | 1..12

  const productosActivos = useMemo(() => productos.filter((p) => p.estado === "activo"), [productos]);

  const extractoMap = useMemo(() => {
    const m = {};
    for (const e of extractos) {
      m[`${e.producto_id}|${e.periodo}`] = e;
    }
    return m;
  }, [extractos]);

  const bancos = useMemo(() => Array.from(new Set(productosActivos.map((p) => p.banco))).sort(), [productosActivos]);

  // Contadores dinámicos para cada categoría de estado según los filtros actuales de año, banco, mes y búsqueda
  const countsPorCategoria = useMemo(() => {
    const counts = {
      todos: 0,
      conciliados: 0,
      por_registrar: 0,
      por_conciliar: 0,
      en_blanco: 0
    };

    let baseList = productosActivos;
    if (filtroBanco !== "todos") baseList = baseList.filter((p) => p.banco === filtroBanco);
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase();
      baseList = baseList.filter((p) => {
        const titular = clienteMap[p.titular_id]?.nombre || "";
        return (p.nombre || "").toLowerCase().includes(q) ||
          (p.nomenclatura || "").toLowerCase().includes(q) ||
          (p.codigo_interno || "").toLowerCase().includes(q) ||
          titular.toLowerCase().includes(q);
      });
    }

    counts.todos = baseList.length;

    const mesesAEvaluar = filtroMes === "todos"
      ? Array.from({ length: 12 }, (_, i) => i + 1)
      : [Number(filtroMes)];

    baseList.forEach((p) => {
      let tieneConciliado = false;
      let tienePorRegistrar = false;
      let tienePorConciliar = false;
      let tieneEnBlanco = false;

      for (const m of mesesAEvaluar) {
        const periodo = `${año}-${String(m).padStart(2, "0")}`;
        const ext = extractoMap[`${p.id}|${periodo}`];
        const esFuturo = esMesFuturo(año, m, currentYear, currentMonth, today, p);
        const est = celdaEstado(ext, esFuturo);

        if (cumpleCategoria(est, "conciliados")) tieneConciliado = true;
        if (cumpleCategoria(est, "por_registrar")) tienePorRegistrar = true;
        if (cumpleCategoria(est, "por_conciliar")) tienePorConciliar = true;
        if (cumpleCategoria(est, "en_blanco")) tieneEnBlanco = true;
      }

      if (tieneConciliado) counts.conciliados++;
      if (tienePorRegistrar) counts.por_registrar++;
      if (tienePorConciliar) counts.por_conciliar++;
      if (tieneEnBlanco) counts.en_blanco++;
    });

    return counts;
  }, [productosActivos, filtroBanco, busqueda, clienteMap, extractoMap, año, currentYear, currentMonth, today, filtroMes]);

  // Lista de filas filtradas
  const filas = useMemo(() => {
    let list = productosActivos;
    if (filtroBanco !== "todos") list = list.filter((p) => p.banco === filtroBanco);
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase();
      list = list.filter((p) => {
        const titular = clienteMap[p.titular_id]?.nombre || "";
        return (p.nombre || "").toLowerCase().includes(q) ||
          (p.nomenclatura || "").toLowerCase().includes(q) ||
          (p.codigo_interno || "").toLowerCase().includes(q) ||
          titular.toLowerCase().includes(q);
      });
    }

    if (filtroEstado !== "todos") {
      const mesesAEvaluar = filtroMes === "todos"
        ? Array.from({ length: 12 }, (_, i) => i + 1)
        : [Number(filtroMes)];

      list = list.filter((p) => {
        return mesesAEvaluar.some((m) => {
          const periodo = `${año}-${String(m).padStart(2, "0")}`;
          const ext = extractoMap[`${p.id}|${periodo}`];
          const esFuturo = esMesFuturo(año, m, currentYear, currentMonth, today, p);
          const est = celdaEstado(ext, esFuturo);
          return cumpleCategoria(est, filtroEstado);
        });
      });
    }

    return [...list].sort((a, b) =>
      (a.banco || "").localeCompare(b.banco || "") ||
      (clienteMap[a.titular_id]?.nombre || "").localeCompare(clienteMap[b.titular_id]?.nombre || "") ||
      (a.nomenclatura || "").localeCompare(b.nomenclatura || "")
    );
  }, [productosActivos, filtroBanco, busqueda, clienteMap, filtroEstado, filtroMes, año, currentYear, currentMonth, today, extractoMap]);

  // Alerta si algún extracto del año está con_diferencias o en_proceso
  const alertasPorProducto = useMemo(() => {
    const m = {};
    for (const e of extractos) {
      if (e.periodo && e.periodo.startsWith(String(año))) {
        if (["con_diferencias", "en_proceso"].includes(e.estado_conciliacion)) m[e.producto_id] = true;
      }
    }
    return m;
  }, [extractos, año]);

  const años = useMemo(() => {
    const set = new Set([currentYear, currentYear - 1]);
    for (const e of extractos) if (e.periodo) set.add(Number(e.periodo.substring(0, 4)));
    return Array.from(set).filter((n) => !isNaN(n)).sort((a, b) => b - a);
  }, [extractos, currentYear]);

  const renderCelda = (producto, mes) => {
    const periodo = `${año}-${String(mes).padStart(2, "0")}`;
    const ext = extractoMap[`${producto.id}|${periodo}`];
    const esFuturo = esMesFuturo(año, mes, currentYear, currentMonth, today, producto);
    const est = celdaEstado(ext, esFuturo);
    const Icon = CELL_ICON[est];
    const clickable = ext || est === "faltante";

    const handleClick = () => {
      if (est === "saltado" && ext) { onReactivarSaltado?.(ext); return; }
      if (ext) { onAbrir(ext); return; }
      if (est === "faltante") { onCargar(producto, periodo); }
    };

    const coincideFiltro = filtroEstado === "todos"
      ? true
      : cumpleCategoria(est, filtroEstado) && (filtroMes === "todos" || Number(filtroMes) === mes);

    const title = est === "saltado"
      ? `${periodo} · Pasó en blanco / Saltado${ext?.motivo_salto ? " — " + ext.motivo_salto : ""} (clic para reactivar)`
      : ext ? `${periodo} · ${ext.estado_conciliacion || "cargado"}`
      : (est === "faltante" ? `${periodo} · Falta cargar extracto (clic para cargar)` : periodo);

    return (
      <td
        key={mes}
        className={cn(
          "px-1 py-1 text-center transition-colors",
          filtroMes !== "todos" && Number(filtroMes) === mes && "bg-primary/5"
        )}
      >
        <button
          type="button"
          disabled={!clickable}
          onClick={handleClick}
          className={cn(
            "w-9 h-7 rounded flex items-center justify-center text-[10px] transition-all relative",
            CELL_STYLE[est],
            clickable ? "cursor-pointer" : "cursor-default",
            filtroEstado !== "todos" && (coincideFiltro
              ? "ring-2 ring-primary ring-offset-1 font-bold scale-105 z-10 shadow-xs"
              : "opacity-30 hover:opacity-100"
            )
          )}
          title={title}
        >
          {Icon && <Icon className="w-3.5 h-3.5" />}
        </button>
      </td>
    );
  };

  const getFiltroEstadoLabel = () => {
    switch (filtroEstado) {
      case "conciliados": return "Conciliados";
      case "por_registrar": return "Por registrar";
      case "por_conciliar": return "Por conciliar";
      case "en_blanco": return "Pasaron en blanco";
      default: return "Todos";
    }
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3.5">
        {/* Fila Superior: Título, Año, Banco y Búsqueda */}
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div>
            <h3 className="font-heading font-semibold text-base">Control de conciliación</h3>
            <p className="text-xs text-muted-foreground">
              Matriz anual: seguimiento de extractos cargados, conciliados, pendientes y en blanco por tarjeta.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={String(año)} onValueChange={(v) => setAño(Number(v))}>
              <SelectTrigger className="w-24 h-8 text-xs font-mono"><SelectValue /></SelectTrigger>
              <SelectContent>
                {años.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filtroBanco} onValueChange={setFiltroBanco}>
              <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los bancos</SelectItem>
                {bancos.map((b) => <SelectItem key={b} value={b}>{BANCO_NAMES[b] || b}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar tarjeta o titular..."
              className="h-8 w-52 text-xs"
            />
          </div>
        </div>

        {/* Fila de Filtros de Estado y Mes solicitados por el usuario */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-border/50">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-medium text-muted-foreground mr-1 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5" /> Filtrar por:
            </span>
            <Button
              size="sm"
              variant={filtroEstado === "todos" ? "default" : "outline"}
              className="h-7 text-xs px-2.5 font-medium"
              onClick={() => setFiltroEstado("todos")}
            >
              Todos ({countsPorCategoria.todos})
            </Button>
            <Button
              size="sm"
              variant={filtroEstado === "conciliados" ? "default" : "outline"}
              className={cn(
                "h-7 text-xs px-2.5 font-medium gap-1",
                filtroEstado === "conciliados"
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                  : "hover:border-emerald-500/50 text-emerald-700 dark:text-emerald-400"
              )}
              onClick={() => setFiltroEstado("conciliados")}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Conciliados ({countsPorCategoria.conciliados})
            </Button>
            <Button
              size="sm"
              variant={filtroEstado === "por_registrar" ? "default" : "outline"}
              className={cn(
                "h-7 text-xs px-2.5 font-medium gap-1",
                filtroEstado === "por_registrar"
                  ? "bg-rose-600 hover:bg-rose-700 text-white"
                  : "hover:border-rose-500/50 text-rose-700 dark:text-rose-400"
              )}
              onClick={() => setFiltroEstado("por_registrar")}
            >
              <Plus className="w-3.5 h-3.5" />
              Por registrar ({countsPorCategoria.por_registrar})
            </Button>
            <Button
              size="sm"
              variant={filtroEstado === "por_conciliar" ? "default" : "outline"}
              className={cn(
                "h-7 text-xs px-2.5 font-medium gap-1",
                filtroEstado === "por_conciliar"
                  ? "bg-amber-600 hover:bg-amber-700 text-white"
                  : "hover:border-amber-500/50 text-amber-700 dark:text-amber-400"
              )}
              onClick={() => setFiltroEstado("por_conciliar")}
            >
              <CircleDot className="w-3.5 h-3.5" />
              Por conciliar ({countsPorCategoria.por_conciliar})
            </Button>
            <Button
              size="sm"
              variant={filtroEstado === "en_blanco" ? "default" : "outline"}
              className={cn(
                "h-7 text-xs px-2.5 font-medium gap-1",
                filtroEstado === "en_blanco"
                  ? "bg-slate-700 hover:bg-slate-800 text-white"
                  : "hover:border-slate-500/50 text-slate-700 dark:text-slate-300"
              )}
              onClick={() => setFiltroEstado("en_blanco")}
            >
              <MinusCircle className="w-3.5 h-3.5" />
              Pasaron en blanco ({countsPorCategoria.en_blanco})
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>Mes:</span>
              <Select value={String(filtroMes)} onValueChange={setFiltroMes}>
                <SelectTrigger className="w-32 h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los meses</SelectItem>
                  {MESES.map((m, idx) => (
                    <SelectItem key={idx + 1} value={String(idx + 1)}>
                      {m} ({año}-{String(idx + 1).padStart(2, "0")})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {(filtroEstado !== "todos" || filtroMes !== "todos" || filtroBanco !== "todos" || busqueda) && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
                onClick={() => {
                  setFiltroEstado("todos");
                  setFiltroMes("todos");
                  setFiltroBanco("todos");
                  setBusqueda("");
                }}
              >
                <X className="w-3 h-3" /> Limpiar
              </Button>
            )}
          </div>
        </div>

        {/* Indicador de estado de filtrado activo */}
        {filtroEstado !== "todos" && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 px-3 py-1.5 rounded-md border border-border/40">
            <span>
              Mostrando <b>{filas.length}</b> tarjeta(s) con extractos <b>{getFiltroEstadoLabel()}</b>
              {filtroMes !== "todos" ? ` para el mes de ${MESES[Number(filtroMes) - 1]} ${año}` : ` en el año ${año}`}.
            </span>
          </div>
        )}

        {/* Tabla Matriz */}
        <div className="overflow-x-auto rounded-md border">
          <table className="text-xs min-w-full border-collapse">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium min-w-[90px]">Banco</th>
                <th className="px-2 py-1.5 text-left font-medium min-w-[90px]">No. TC</th>
                <th className="px-2 py-1.5 text-left font-medium min-w-[120px]">Tercero</th>
                {MESES.map((m, idx) => {
                  const mesNum = idx + 1;
                  const esMesFiltrado = filtroMes !== "todos" && Number(filtroMes) === mesNum;
                  return (
                    <th
                      key={m}
                      className={cn(
                        "px-1 py-1.5 text-center font-medium w-12 transition-colors",
                        esMesFiltrado && "bg-primary text-primary-foreground font-bold rounded-t"
                      )}
                    >
                      {m}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {filas.map((p) => {
                const titular = clienteMap[p.titular_id]?.nombre || "—";
                const noTC = p.nomenclatura || p.codigo_interno || "—";
                const alerta = alertasPorProducto[p.id];
                return (
                  <tr key={p.id} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                    <td className="px-2 py-1.5 whitespace-nowrap">{BANCO_NAMES[p.banco] || p.banco}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      <span className="flex items-center gap-1 font-mono">
                        {alerta && <AlertTriangle className="w-3 h-3 text-destructive shrink-0" />}
                        {noTC}
                      </span>
                      {p.nombre && <span className="block text-[10px] text-muted-foreground">{p.nombre}</span>}
                    </td>
                    <td className="px-2 py-1.5 truncate max-w-[140px]" title={titular}>{titular}</td>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((mes) => renderCelda(p, mes))}
                  </tr>
                );
              })}
              {filas.length === 0 && (
                <tr>
                  <td colSpan={15} className="text-center py-8 text-muted-foreground space-y-2">
                    <p>No se encontraron tarjetas con el filtro de "{getFiltroEstadoLabel()}" para {filtroMes !== "todos" ? MESES[Number(filtroMes) - 1] + " " + año : "el año " + año}.</p>
                    {filtroEstado !== "todos" && (
                      <Button size="sm" variant="outline" onClick={() => { setFiltroEstado("todos"); setFiltroMes("todos"); }}>
                        Ver todas las tarjetas
                      </Button>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Leyenda explicativa con los mismos términos del filtro */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground pt-1 border-t border-border/50">
          <span className="flex items-center gap-1 font-medium text-foreground">Leyenda:</span>
          <span className="flex items-center gap-1"><Lock className="w-3 h-3 text-success" /> Cerrado (Conciliado)</span>
          <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-success" /> Conciliado ✓</span>
          <span className="flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-warning" /> Con diferencias / en proceso (Por conciliar)</span>
          <span className="flex items-center gap-1"><CircleDot className="w-3 h-3 text-muted-foreground" /> Cargado sin conciliar (Por conciliar)</span>
          <span className="flex items-center gap-1"><MinusCircle className="w-3 h-3 text-muted-foreground" /> Pasó en blanco / Saltado</span>
          <span className="flex items-center gap-1"><span className="w-3.5 h-3.5 rounded border-2 border-dashed border-destructive/50 inline-block align-middle" /> Falta cargar extracto (Por registrar)</span>
        </div>
      </CardContent>
    </Card>
  );
}