import React, { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Lock, CheckCircle2, CircleDot, Plus, MinusCircle } from "lucide-react";
import { BANCO_NAMES } from "@/lib/contabilidad";

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

// Estado de cada celda de la matriz
// - cerrado / conciliado  → verde
// - con_diferencias / en_proceso → amarillo
// - sin_iniciar (extracto cargado sin conciliar) → gris
// - faltante (no hay extracto y el mes ya pasó) → rojo (pendiente de cargar)
// - futuro (mes aún no alcanza) → vacío tenue
function celdaEstado(extracto, esFuturo) {
  if (extracto) {
    if (extracto.estado === "saltado") return "saltado";
    const est = extracto.estado_conciliacion || "sin_iniciar";
    if (est === "cerrado") return "cerrado";
    if (est === "conciliado") return "conciliado";
    if (est === "con_diferencias" || est === "en_proceso") return "diferencias";
    return "cargado";
  }
  return esFuturo ? "futuro" : "faltante";
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
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;
  const [año, setAño] = useState(currentYear);
  const [filtroBanco, setFiltroBanco] = useState("todos");
  const [busqueda, setBusqueda] = useState("");

  const productosActivos = useMemo(() => productos.filter((p) => p.estado === "activo"), [productos]);

  const extractoMap = useMemo(() => {
    const m = {};
    for (const e of extractos) m[`${e.producto_id}|${e.periodo}`] = e;
    return m;
  }, [extractos]);

  const bancos = useMemo(() => Array.from(new Set(productosActivos.map((p) => p.banco))).sort(), [productosActivos]);

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
    return [...list].sort((a, b) =>
      (a.banco || "").localeCompare(b.banco || "") ||
      (clienteMap[a.titular_id]?.nombre || "").localeCompare(clienteMap[b.titular_id]?.nombre || "") ||
      (a.nomenclatura || "").localeCompare(b.nomenclatura || "")
    );
  }, [productosActivos, filtroBanco, busqueda, clienteMap]);

  // Alerta (triángulo rojo) si algún extracto del año está con_diferencias o en_proceso
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
    const esFuturo = año > currentYear || (año === currentYear && mes > currentMonth);
    const est = celdaEstado(ext, esFuturo);
    const Icon = CELL_ICON[est];
    const clickable = ext || est === "faltante";
    const handleClick = () => {
      if (est === "saltado" && ext) { onReactivarSaltado?.(ext); return; }
      if (ext) { onAbrir(ext); return; }
      if (est === "faltante") { onCargar(producto); }
    };
    const title = est === "saltado"
      ? `${periodo} · Saltado${ext?.motivo_salto ? " — " + ext.motivo_salto : ""} (clic para reactivar)`
      : ext ? `${periodo} · ${ext.estado_conciliacion || "cargado"}`
      : (est === "faltante" ? `${periodo} · Falta cargar extracto` : periodo);
    return (
      <td key={mes} className="px-1 py-1 text-center">
        <button
          type="button"
          disabled={!clickable}
          onClick={handleClick}
          className={`w-9 h-7 rounded flex items-center justify-center text-[10px] transition-colors ${CELL_STYLE[est]} ${clickable ? "cursor-pointer" : "cursor-default"}`}
          title={title}
        >
          {Icon && <Icon className="w-3.5 h-3.5" />}
        </button>
      </td>
    );
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-heading font-semibold">Control de pendientes por conciliar</h3>
            <p className="text-xs text-muted-foreground">Matriz anual: extractos cargados vs. pendientes por tarjeta.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={String(año)} onValueChange={(v) => setAño(Number(v))}>
              <SelectTrigger className="w-24 h-8 text-xs"><SelectValue /></SelectTrigger>
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
            <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar tarjeta o titular..." className="h-8 w-52 text-xs" />
          </div>
        </div>

        <div className="overflow-x-auto rounded-md border">
          <table className="text-xs min-w-full border-collapse">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium min-w-[90px]">Banco</th>
                <th className="px-2 py-1.5 text-left font-medium min-w-[90px]">No. TC</th>
                <th className="px-2 py-1.5 text-left font-medium min-w-[120px]">Tercero</th>
                {MESES.map((m) => <th key={m} className="px-1 py-1.5 text-center font-medium w-12">{m}</th>)}
              </tr>
            </thead>
            <tbody>
              {filas.map((p) => {
                const titular = clienteMap[p.titular_id]?.nombre || "—";
                const noTC = p.nomenclatura || p.codigo_interno || "—";
                const alerta = alertasPorProducto[p.id];
                return (
                  <tr key={p.id} className="border-b border-border/40 hover:bg-muted/20">
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
                <tr><td colSpan={15} className="text-center py-6 text-muted-foreground">Sin productos activos para mostrar.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Lock className="w-3 h-3 text-success" /> Cerrado</span>
          <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-success" /> Conciliado</span>
          <span className="flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-warning" /> Con diferencias / en proceso</span>
          <span className="flex items-center gap-1"><CircleDot className="w-3 h-3 text-muted-foreground" /> Cargado sin conciliar</span>
          <span className="flex items-center gap-1"><MinusCircle className="w-3 h-3 text-muted-foreground" /> Saltado (no vacío)</span>
          <span className="flex items-center gap-1"><span className="w-3.5 h-3.5 rounded border-2 border-dashed border-destructive/50 inline-block" /> Falta cargar extracto</span>
        </div>
      </CardContent>
    </Card>
  );
}