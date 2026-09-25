import React, { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, FileSpreadsheet, Search, Calendar } from "lucide-react";
import * as XLSX from "xlsx";
import { formatCOP, formatDate, BANCO_NAMES } from "@/lib/contabilidad";

const normalize = (s) => (s || "").toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const ESTADOS_VALIDOS = ["pendiente_pago", "pagado"];
const MES_ACTUAL = new Date().toISOString().substring(0, 7);

// Construye las filas del informe a partir de los extractos
function buildRows(extractos, productoMap, titularMap = {}) {
  return extractos
    .filter((e) => ESTADOS_VALIDOS.includes(e.estado))
    .map((e) => {
      const prod = productoMap[e.producto_id];
      return {
        "Nombre de la tarjeta": prod?.nombre || "—",
        "Titular": titularMap[prod?.titular_id]?.nombre || "—",
        "Período": e.periodo || "",
        "Día de pago": e.fecha_pago || "",
        "Valor a pagar": Number(e.saldo_a_pagar || 0),
        "Estado": e.estado === "pagado" ? "Pagado" : "Por pagar",
      };
    });
}

function exportCSV(rows, fileName) {
  const headers = ["Nombre de la tarjeta", "Titular", "Período", "Día de pago", "Valor a pagar", "Estado"];
  const escape = (v) => {
    const s = String(v ?? "");
    if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push([escape(r["Nombre de la tarjeta"]), escape(r["Titular"]), escape(r["Período"]), escape(r["Día de pago"]), escape(r["Valor a pagar"]), escape(r["Estado"])].join(","));
  }
  // BOM para que Excel reconozca UTF-8
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

function exportExcel(rows, fileName) {
  const ws = XLSX.utils.json_to_sheet(rows, {
    header: ["Nombre de la tarjeta", "Titular", "Período", "Día de pago", "Valor a pagar", "Estado"],
  });
  // Formato de moneda para la columna "Valor a pagar"
  if (!ws["!cols"]) ws["!cols"] = [];
  ws["!cols"] = [{ wch: 28 }, { wch: 26 }, { wch: 12 }, { wch: 14 }, { wch: 18 }, { wch: 12 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Pagos Tarjetas");
  XLSX.writeFile(wb, fileName);
}

export default function InformePagosExport({ extractos, productoMap, titularMap = {} }) {
  const [periodoFiltro, setPeriodoFiltro] = useState(MES_ACTUAL);
  const [estadoFiltro, setEstadoFiltro] = useState("todos");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [busqueda, setBusqueda] = useState("");

  const periodosDisponibles = useMemo(() => {
    const s = new Set(extractos.map((e) => e.periodo).filter(Boolean));
    return Array.from(s).sort().reverse();
  }, [extractos]);

  const extractosFiltrados = useMemo(() => {
    let result = extractos.filter((e) => ESTADOS_VALIDOS.includes(e.estado));
    if (estadoFiltro !== "todos") result = result.filter((e) => e.estado === estadoFiltro);
    if (periodoFiltro !== "todos") result = result.filter((e) => e.periodo === periodoFiltro);
    if (fechaDesde) result = result.filter((e) => e.fecha_pago && e.fecha_pago >= fechaDesde);
    if (fechaHasta) result = result.filter((e) => e.fecha_pago && e.fecha_pago <= fechaHasta);
    if (busqueda.trim()) {
      const q = normalize(busqueda);
      result = result.filter((e) => {
        const prod = productoMap[e.producto_id];
        return [prod?.nombre, prod?.numero_completo, prod?.banco, BANCO_NAMES[prod?.banco], titularMap[prod?.titular_id]?.nombre, e.periodo]
          .some((v) => normalize(v).includes(q));
      });
    }
    return result.sort((a, b) => {
      // Pagados al final, luego por fecha de pago
      if (a.estado !== b.estado) return a.estado === "pagado" ? 1 : -1;
      return (a.fecha_pago || "").localeCompare(b.fecha_pago || "");
    });
  }, [extractos, periodoFiltro, estadoFiltro, fechaDesde, fechaHasta, busqueda, productoMap]);

  const rows = buildRows(extractosFiltrados, productoMap, titularMap);
  const total = rows.reduce((s, r) => s + r["Valor a pagar"], 0);
  const stamp = new Date().toISOString().substring(0, 10);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[220px] relative">
              <Label>Buscar (tarjeta, banco, número)</Label>
              <Search className="w-4 h-4 absolute left-2.5 top-[34px] text-muted-foreground" />
              <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Filtrar..." className="pl-8" />
            </div>
            <div>
              <Label>Período</Label>
              <div className="flex gap-1">
                <Select value={periodoFiltro} onValueChange={setPeriodoFiltro}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos los períodos</SelectItem>
                    {periodosDisponibles.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="ghost" onClick={() => setPeriodoFiltro(MES_ACTUAL)} title="Mes actual">Hoy</Button>
              </div>
            </div>
            <div>
              <Label>Estado</Label>
              <Select value={estadoFiltro} onValueChange={setEstadoFiltro}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="pendiente_pago">Por pagar</SelectItem>
                  <SelectItem value="pagado">Pagados</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Día de pago desde</Label>
              <Input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} className="w-44" />
            </div>
            <div>
              <Label>Día de pago hasta</Label>
              <Input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} className="w-44" />
            </div>
            <div className="text-sm text-muted-foreground pb-2">
              <Calendar className="w-4 h-4 inline mr-1" />
              {rows.length} registro(s)
            </div>
            <div className="flex gap-2 ml-auto pb-1">
              <Button variant="outline" onClick={() => exportCSV(rows, `pagos_tarjetas_${stamp}.csv`)} disabled={rows.length === 0}>
                <Download className="w-4 h-4 mr-1" /> CSV
              </Button>
              <Button onClick={() => exportExcel(rows, `pagos_tarjetas_${stamp}.xlsx`)} disabled={rows.length === 0}>
                <FileSpreadsheet className="w-4 h-4 mr-1" /> Excel
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="mb-4">
            <h2 className="font-heading text-lg font-bold">Informe de Pagos de Tarjetas</h2>
            <p className="text-sm text-muted-foreground">
              {rows.length} extracto(s) pendiente(s) de pago
              {periodoFiltro !== "todos" ? ` · Período ${periodoFiltro}` : ""}
            </p>
          </div>
          {rows.length === 0 ? (
            <p className="text-muted-foreground text-sm">No hay pagos pendientes con el filtro seleccionado.</p>
          ) : (
            <div className="overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-left text-xs text-muted-foreground uppercase">
                  <tr>
                    <th className="py-2 px-4 font-medium">Nombre de la tarjeta</th>
                    <th className="py-2 px-4 font-medium">Titular</th>
                    <th className="py-2 px-4 font-medium">Período</th>
                    <th className="py-2 px-4 font-medium">Día de pago</th>
                    <th className="py-2 px-4 font-medium text-right">Valor a pagar</th>
                    <th className="py-2 px-4 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td className="py-3 px-4 font-medium">{r["Nombre de la tarjeta"]}</td>
                      <td className="py-3 px-4 text-xs">{r["Titular"]}</td>
                      <td className="py-3 px-4 font-mono">{r["Período"]}</td>
                      <td className="py-3 px-4 text-xs whitespace-nowrap">{formatDate(r["Día de pago"]) || "—"}</td>
                      <td className="py-3 px-4 font-mono text-right">{formatCOP(r["Valor a pagar"])}</td>
                      <td className="py-3 px-4">
                        <span className={r["Estado"] === "Pagado" ? "text-success" : "text-warning"}>{r["Estado"]}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-border">
                  <tr className="font-bold">
                    <td className="py-3 px-4" colSpan={5}>TOTAL</td>
                    <td className="py-3 px-4 font-mono text-right">{formatCOP(total)}</td>
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