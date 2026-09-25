import React, { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Printer, MessageSquare, Filter, X } from "lucide-react";
import { formatCOP, BANCO_NAMES } from "@/lib/contabilidad";

const CAMPOS_GASTO = [
  { key: "cuota_manejo", label: "Cuota Manejo" },
  { key: "intereses_corrientes", label: "Int. Corrientes" },
  { key: "intereses_mora", label: "Int. Mora" },
  { key: "seguros", label: "Seguros" },
  { key: "comisiones", label: "Comisiones" },
  { key: "otros_gastos", label: "Otros Gastos" },
];

export default function InformeGastosFinancieros({ extractos, productoMap }) {
  const [textoBusqueda, setTextoBusqueda] = useState("");
  const [periodoFiltro, setPeriodoFiltro] = useState("todos");
  const [cargosFiltro, setCargosFiltro] = useState({});

  const periodosDisponibles = useMemo(() => {
    const s = new Set(extractos.map((e) => e.periodo).filter(Boolean));
    return Array.from(s).sort().reverse();
  }, [extractos]);

  const toggleCargo = (key) => {
    setCargosFiltro((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const cargosSeleccionados = Object.keys(cargosFiltro).filter((k) => cargosFiltro[k]);

  const extractosConGastos = useMemo(() => {
    let conGastos = extractos.filter((e) =>
      CAMPOS_GASTO.some((c) => Number(e[c.key]) > 0)
    );
    if (periodoFiltro !== "todos") {
      conGastos = conGastos.filter((e) => e.periodo === periodoFiltro);
    }
    if (cargosSeleccionados.length > 0) {
      conGastos = conGastos.filter((e) =>
        cargosSeleccionados.some((k) => Number(e[k]) > 0)
      );
    }
    if (!textoBusqueda.trim()) return conGastos.sort((a, b) => (b.periodo || "").localeCompare(a.periodo || ""));
    const q = textoBusqueda.toLowerCase();
    return conGastos.filter((e) => {
      const prod = productoMap[e.producto_id];
      const obs = (e.observaciones || "").toLowerCase();
      return (
        (prod?.nombre || "").toLowerCase().includes(q) ||
        (prod?.banco || "").toLowerCase().includes(q) ||
        (e.periodo || "").toLowerCase().includes(q) ||
        obs.includes(q)
      );
    });
  }, [extractos, productoMap, textoBusqueda, periodoFiltro, cargosFiltro]);

  const totales = useMemo(() => {
    const t = {};
    CAMPOS_GASTO.forEach((c) => { t[c.key] = 0; });
    t.total = 0;
    extractosConGastos.forEach((e) => {
      CAMPOS_GASTO.forEach((c) => {
        const val = Number(e[c.key]) || 0;
        t[c.key] += val;
        t.total += val;
      });
    });
    return t;
  }, [extractosConGastos]);

  const handlePrint = () => window.print();

  return (
    <div className="space-y-4 print-area">
      <Card className="print:hidden">
        <CardContent className="pt-6 space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <Label>Buscar (producto, banco, período, observación)</Label>
              <Input value={textoBusqueda} onChange={(e) => setTextoBusqueda(e.target.value)} placeholder="Filtrar..." />
            </div>
            <div>
              <Label>Período</Label>
              <Select value={periodoFiltro} onValueChange={setPeriodoFiltro}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los períodos</SelectItem>
                  {periodosDisponibles.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="text-sm text-muted-foreground pb-2">
              <MessageSquare className="w-4 h-4 inline mr-1" />
              {extractosConGastos.length} extracto(s)
            </div>
            <Button variant="outline" onClick={handlePrint} className="ml-auto">
              <Printer className="w-4 h-4 mr-1" /> Imprimir / Exportar
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground inline-flex items-center gap-1"><Filter className="w-3.5 h-3.5" /> Cargos:</span>
            {CAMPOS_GASTO.map((c) => {
              const active = !!cargosFiltro[c.key];
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => toggleCargo(c.key)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${active ? "bg-primary text-primary-foreground border-primary" : "bg-transparent text-muted-foreground border-border hover:border-primary/50"}`}
                >
                  {c.label}
                </button>
              );
            })}
            {cargosSeleccionados.length > 0 && (
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setCargosFiltro({})}>
                <X className="w-3 h-3 mr-1" /> Limpiar cargos
              </Button>
            )}
            {cargosSeleccionados.length > 0 && (
              <span className="text-[11px] text-muted-foreground">Mostrando extractos con al menos uno de los cargos seleccionados</span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="mb-4">
            <h2 className="font-heading text-lg font-bold">Informe de Gastos Financieros</h2>
            <p className="text-sm text-muted-foreground">Extractos que generaron gastos financieros y sus observaciones</p>
          </div>
          {extractosConGastos.length === 0 ? (
            <p className="text-muted-foreground text-sm">No hay extractos con gastos financieros.</p>
          ) : (
            <div className="overflow-auto max-h-[65vh] rounded-md border">
            <table className="w-full text-sm thead-sticky">
              <thead className="border-b border-border text-left text-xs text-muted-foreground uppercase">
                <tr>
                  <th className="py-2 font-medium">Producto</th>
                  <th className="py-2 font-medium">Banco</th>
                  <th className="py-2 font-medium">Período</th>
                  {CAMPOS_GASTO.map((c) => (
                    <th key={c.key} className="py-2 font-medium text-right">{c.label}</th>
                  ))}
                  <th className="py-2 font-medium text-right">Total Gastos</th>
                  <th className="py-2 font-medium">Observaciones</th>
                </tr>
              </thead>
              <tbody>
                {extractosConGastos.map((e) => {
                  const prod = productoMap[e.producto_id];
                  const totalGasto = CAMPOS_GASTO.reduce((s, c) => s + (Number(e[c.key]) || 0), 0);
                  return (
                    <tr key={e.id} className="border-b border-border/50 align-top">
                      <td className="py-2 font-medium">{prod?.nombre || "—"}</td>
                      <td className="py-2 text-xs">{BANCO_NAMES[prod?.banco] || prod?.banco || "—"}</td>
                      <td className="py-2 font-mono text-xs">{e.periodo}</td>
                      {CAMPOS_GASTO.map((c) => (
                        <td key={c.key} className="py-2 font-mono text-right text-xs">
                          {Number(e[c.key]) > 0 ? formatCOP(e[c.key]) : "—"}
                        </td>
                      ))}
                      <td className="py-2 font-mono text-right font-semibold">{formatCOP(totalGasto)}</td>
                      <td className="py-2 text-xs max-w-[200px]">{e.observaciones || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t-2 border-border">
                <tr className="font-bold">
                  <td className="py-2" colSpan={3}>TOTALES</td>
                  {CAMPOS_GASTO.map((c) => (
                    <td key={c.key} className="py-2 font-mono text-right">{formatCOP(totales[c.key])}</td>
                  ))}
                  <td className="py-2 font-mono text-right">{formatCOP(totales.total)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}