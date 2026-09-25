import React, { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Printer, Calendar, Search, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { formatCOP, formatDate, BANCO_NAMES } from "@/lib/contabilidad";

export default function InformePagos({ extractos, productoMap, titularMap = {} }) {
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [periodoFiltro, setPeriodoFiltro] = useState("todos");
  const [busqueda, setBusqueda] = useState("");
  const [sortKey, setSortKey] = useState("fecha_pago");
  const [sortDir, setSortDir] = useState("asc");

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ k }) => {
    if (sortKey !== k) return <ChevronsUpDown className="w-3 h-3 inline ml-1 text-muted-foreground/50" />;
    return sortDir === "asc"
      ? <ChevronUp className="w-3 h-3 inline ml-1 text-primary" />
      : <ChevronDown className="w-3 h-3 inline ml-1 text-primary" />;
  };

  const getSortValue = (e, key) => {
    const prod = productoMap[e.producto_id];
    switch (key) {
      case "producto": return normalize(prod?.nombre || "");
      case "banco": return normalize(BANCO_NAMES[prod?.banco] || prod?.banco || "");
      case "titular": return normalize(titularMap[prod?.titular_id]?.nombre || "");
      case "saldo_a_pagar": return e.saldo_a_pagar || 0;
      case "total_abonado": return e.total_abonado || 0;
      case "saldo_pendiente": return e.saldo_pendiente || 0;
      case "fecha_pago": return e.fecha_pago || "";
      default: return "";
    }
  };

  const normalize = (s) => (s || "").toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  const periodosDisponibles = useMemo(() => {
    const s = new Set(extractos.map((e) => e.periodo).filter(Boolean));
    return Array.from(s).sort().reverse();
  }, [extractos]);

  const extractosFiltrados = useMemo(() => {
    let result = extractos.filter((e) => e.estado === "pendiente_pago" && e.fecha_pago);
    if (periodoFiltro !== "todos") {
      result = result.filter((e) => e.periodo === periodoFiltro);
    }
    if (fechaDesde) {
      result = result.filter((e) => e.fecha_pago >= fechaDesde);
    }
    if (fechaHasta) {
      result = result.filter((e) => e.fecha_pago <= fechaHasta);
    }
    if (busqueda.trim()) {
      const q = normalize(busqueda);
      result = result.filter((e) => {
        const prod = productoMap[e.producto_id];
        return [prod?.nombre, prod?.numero_completo, prod?.banco, BANCO_NAMES[prod?.banco], titularMap[prod?.titular_id]?.nombre, e.periodo, e.observaciones]
          .some((v) => normalize(v).includes(q));
      });
    }
    return result.sort((a, b) => {
      const va = getSortValue(a, sortKey);
      const vb = getSortValue(b, sortKey);
      let cmp = 0;
      if (typeof va === "number" && typeof vb === "number") cmp = va - vb;
      else cmp = String(va).localeCompare(String(vb));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [extractos, fechaDesde, fechaHasta, periodoFiltro, busqueda, productoMap, sortKey, sortDir]);

  const totales = useMemo(() => {
    return extractosFiltrados.reduce(
      (acc, e) => ({
        saldo_a_pagar: acc.saldo_a_pagar + (e.saldo_a_pagar || 0),
        total_abonado: acc.total_abonado + (e.total_abonado || 0),
        saldo_pendiente: acc.saldo_pendiente + (e.saldo_pendiente || 0),
      }),
      { saldo_a_pagar: 0, total_abonado: 0, saldo_pendiente: 0 }
    );
  }, [extractosFiltrados]);

  const handlePrint = () => window.print();

  const rangoTexto = fechaDesde || fechaHasta
    ? `${fechaDesde ? formatDate(fechaDesde) : "Inicio"} — ${fechaHasta ? formatDate(fechaHasta) : "Fin"}`
    : "Todas las fechas";

  return (
    <div className="space-y-4 print-area">
      <Card className="print:hidden">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[220px] relative">
              <Label>Buscar (producto, número, banco)</Label>
              <Search className="w-4 h-4 absolute left-2.5 top-[34px] text-muted-foreground" />
              <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Filtrar..." className="pl-8" />
            </div>
            <div>
              <Label>Período</Label>
              <Select value={periodoFiltro} onValueChange={setPeriodoFiltro}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los períodos</SelectItem>
                  {periodosDisponibles.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fecha de pago desde</Label>
              <Input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} className="w-44" />
            </div>
            <div>
              <Label>Fecha de pago hasta</Label>
              <Input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} className="w-44" />
            </div>
            <div className="text-sm text-muted-foreground pb-2">
              <Calendar className="w-4 h-4 inline mr-1" />
              {extractosFiltrados.length} extracto(s)
            </div>
            <Button variant="outline" onClick={handlePrint} className="ml-auto">
              <Printer className="w-4 h-4 mr-1" /> Imprimir / Exportar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="mb-4">
            <h2 className="font-heading text-lg font-bold">Informe de Extractos por Pagar</h2>
            <p className="text-sm text-muted-foreground">Rango: {rangoTexto}{periodoFiltro !== "todos" ? ` · Período ${periodoFiltro}` : ""}</p>
          </div>
          {extractosFiltrados.length === 0 ? (
            <p className="text-muted-foreground text-sm">No hay extractos pendientes de pago en el rango seleccionado.</p>
          ) : (
            <div className="overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-left text-xs text-muted-foreground uppercase">
                  <tr>
                    <th className="py-2 px-4 font-medium cursor-pointer select-none hover:bg-muted/50" onClick={() => toggleSort("producto")}>Producto <SortIcon k="producto" /></th>
                    <th className="py-2 px-4 font-medium cursor-pointer select-none hover:bg-muted/50" onClick={() => toggleSort("banco")}>Banco <SortIcon k="banco" /></th>
                    <th className="py-2 px-4 font-medium cursor-pointer select-none hover:bg-muted/50" onClick={() => toggleSort("titular")}>Titular <SortIcon k="titular" /></th>
                    <th className="py-2 px-4 font-medium text-right cursor-pointer select-none hover:bg-muted/50" onClick={() => toggleSort("saldo_a_pagar")}>Saldo a Pagar <SortIcon k="saldo_a_pagar" /></th>
                    <th className="py-2 px-4 font-medium text-right cursor-pointer select-none hover:bg-muted/50" onClick={() => toggleSort("total_abonado")}>Abonado <SortIcon k="total_abonado" /></th>
                    <th className="py-2 px-4 font-medium text-right cursor-pointer select-none hover:bg-muted/50" onClick={() => toggleSort("saldo_pendiente")}>Pendiente <SortIcon k="saldo_pendiente" /></th>
                    <th className="py-2 px-4 font-medium cursor-pointer select-none hover:bg-muted/50" onClick={() => toggleSort("fecha_pago")}>Fecha Pago <SortIcon k="fecha_pago" /></th>
                  </tr>
                </thead>
                <tbody>
                  {extractosFiltrados.map((e) => {
                    const prod = productoMap[e.producto_id];
                    return (
                      <tr key={e.id} className="border-b border-border/50">
                        <td className="py-3 px-4 font-medium">
                          <div>{prod?.nombre || "—"}</div>
                          {prod?.numero_completo && (
                            <div className="text-xs text-muted-foreground font-mono mt-0.5">{prod.numero_completo}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-xs">{BANCO_NAMES[prod?.banco] || prod?.banco || "—"}</td>
                        <td className="py-3 px-4 text-xs">{titularMap[prod?.titular_id]?.nombre || "—"}</td>
                        <td className="py-3 px-4 font-mono text-right">{formatCOP(e.saldo_a_pagar || 0)}</td>
                        <td className="py-3 px-4 font-mono text-right text-success">{formatCOP(e.total_abonado || 0)}</td>
                        <td className="py-3 px-4 font-mono text-right font-semibold">{formatCOP(e.saldo_pendiente || 0)}</td>
                        <td className="py-3 px-4 text-xs whitespace-nowrap">{formatDate(e.fecha_pago)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="border-t-2 border-border">
                  <tr className="font-bold">
                    <td className="py-3 px-4" colSpan={3}>TOTALES</td>
                    <td className="py-3 px-4 font-mono text-right">{formatCOP(totales.saldo_a_pagar)}</td>
                    <td className="py-3 px-4 font-mono text-right text-success">{formatCOP(totales.total_abonado)}</td>
                    <td className="py-3 px-4 font-mono text-right">{formatCOP(totales.saldo_pendiente)}</td>
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