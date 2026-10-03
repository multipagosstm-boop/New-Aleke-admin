import React, { useState, useMemo, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Printer, Filter, X, DollarSign, Receipt, CreditCard, Search, FileSpreadsheet, Download } from "lucide-react";
import { formatCOP, BANCO_NAMES } from "@/lib/contabilidad";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";

const CAMPOS_GASTO = [
  { key: "cuota_manejo", label: "Cuota Manejo" },
  { key: "intereses_corrientes", label: "Int. Corrientes" },
  { key: "intereses_mora", label: "Int. Mora" },
  { key: "seguros", label: "Seguros" },
  { key: "comisiones", label: "Comisiones" },
  { key: "otros_gastos", label: "Otros Gastos" },
];

export default function InformeGastosFinancieros({ extractos, productoMap, periodoFiltro: periodoProp = "todos", onPeriodoFiltroChange }) {
  const [textoBusqueda, setTextoBusqueda] = useState("");
  const [periodoFiltro, setPeriodoFiltro] = useState(periodoProp || "todos");
  const [cargosFiltro, setCargosFiltro] = useState({});

  useEffect(() => {
    if (periodoProp) setPeriodoFiltro(periodoProp);
  }, [periodoProp]);

  const handlePeriodoChange = (val) => {
    setPeriodoFiltro(val);
    if (onPeriodoFiltroChange) onPeriodoFiltroChange(val);
  };

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

  const handleExportExcel = () => {
    try {
      if (extractosConGastos.length === 0) {
        toast.info("No hay extractos con gastos para exportar.");
        return;
      }
      const data = extractosConGastos.map((e) => {
        const prod = productoMap[e.producto_id];
        const totalGasto = CAMPOS_GASTO.reduce((s, c) => s + (Number(e[c.key]) || 0), 0);
        return {
          "Producto": prod?.nombre || "—",
          "Banco": BANCO_NAMES[prod?.banco] || prod?.banco || "—",
          "Período": e.periodo || "—",
          "Cuota Manejo": Number(e.cuota_manejo) || 0,
          "Int. Corrientes": Number(e.intereses_corrientes) || 0,
          "Int. Mora": Number(e.intereses_mora) || 0,
          "Seguros": Number(e.seguros) || 0,
          "Comisiones": Number(e.comisiones) || 0,
          "Otros Gastos": Number(e.otros_gastos) || 0,
          "Total Gastos": totalGasto,
          "Observaciones": e.observaciones || ""
        };
      });

      // Total row
      data.push({
        "Producto": "TOTALES",
        "Banco": "",
        "Período": "",
        "Cuota Manejo": totales.cuota_manejo,
        "Int. Corrientes": totales.intereses_corrientes,
        "Int. Mora": totales.intereses_mora,
        "Seguros": totales.seguros,
        "Comisiones": totales.comisiones,
        "Otros Gastos": totales.otros_gastos,
        "Total Gastos": totales.total,
        "Observaciones": `${extractosConGastos.length} extractos`
      });

      const ws = XLSX.utils.json_to_sheet(data);
      const colWidths = [
        { wch: 22 }, // Producto
        { wch: 18 }, // Banco
        { wch: 12 }, // Período
        { wch: 15 }, // Cuota Manejo
        { wch: 15 }, // Int. Corrientes
        { wch: 15 }, // Int. Mora
        { wch: 15 }, // Seguros
        { wch: 15 }, // Comisiones
        { wch: 15 }, // Otros Gastos
        { wch: 16 }, // Total Gastos
        { wch: 30 }, // Observaciones
      ];
      ws["!cols"] = colWidths;

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Gastos Financieros");

      const periodStr = periodoFiltro !== "todos" ? `_${periodoFiltro}` : "";
      const dateStr = new Date().toISOString().substring(0, 10);
      XLSX.writeFile(wb, `informe_gastos_financieros${periodStr}_${dateStr}.xlsx`);
      toast.success("Informe de gastos en Excel descargado exitosamente.");
    } catch (err) {
      console.error("Error al exportar Excel:", err);
      toast.error("Error al generar archivo Excel: " + (err.message || "desconocido"));
    }
  };

  const handleExportPDF = () => {
    try {
      if (extractosConGastos.length === 0) {
        toast.info("No hay extractos con gastos para exportar.");
        return;
      }
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

      doc.setFontSize(16);
      doc.setTextColor(30, 41, 59);
      doc.text("Informe de Gastos Financieros", 14, 15);

      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      const subHeader = `Período: ${periodoFiltro}  |  Fecha de emisión: ${new Date().toLocaleDateString("es-CO")}  |  Extractos con cargos: ${extractosConGastos.length}`;
      doc.text(subHeader, 14, 21);

      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      doc.text(`Total Gastos Financieros: ${formatCOP(totales.total)}`, 14, 27);

      const tableData = extractosConGastos.map((e) => {
        const prod = productoMap[e.producto_id];
        const totalGasto = CAMPOS_GASTO.reduce((s, c) => s + (Number(e[c.key]) || 0), 0);
        return [
          prod?.nombre || "—",
          BANCO_NAMES[prod?.banco] || prod?.banco || "—",
          e.periodo || "—",
          Number(e.cuota_manejo) > 0 ? formatCOP(e.cuota_manejo) : "-",
          Number(e.intereses_corrientes) > 0 ? formatCOP(e.intereses_corrientes) : "-",
          Number(e.intereses_mora) > 0 ? formatCOP(e.intereses_mora) : "-",
          Number(e.seguros) > 0 ? formatCOP(e.seguros) : "-",
          Number(e.comisiones) > 0 ? formatCOP(e.comisiones) : "-",
          Number(e.otros_gastos) > 0 ? formatCOP(e.otros_gastos) : "-",
          formatCOP(totalGasto)
        ];
      });

      const tableFooter = [[
        "TOTALES",
        "",
        "",
        formatCOP(totales.cuota_manejo),
        formatCOP(totales.intereses_corrientes),
        formatCOP(totales.intereses_mora),
        formatCOP(totales.seguros),
        formatCOP(totales.comisiones),
        formatCOP(totales.otros_gastos),
        formatCOP(totales.total)
      ]];

      autoTable(doc, {
        startY: 31,
        head: [["Producto", "Banco", "Período", "Cuota Manejo", "Int. Corr.", "Int. Mora", "Seguros", "Comis.", "Otros", "Total Gastos"]],
        body: tableData,
        foot: tableFooter,
        theme: "striped",
        headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: "bold", fontSize: 8.5 },
        footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: "bold", fontSize: 8.5 },
        styles: { fontSize: 8, cellPadding: 2 },
        columnStyles: {
          0: { fontStyle: "bold" },
          2: { fontStyle: "bold" },
          3: { halign: "right" },
          4: { halign: "right" },
          5: { halign: "right" },
          6: { halign: "right" },
          7: { halign: "right" },
          8: { halign: "right" },
          9: { halign: "right", fontStyle: "bold", textColor: [2, 132, 199] }
        }
      });

      const periodStr = periodoFiltro !== "todos" ? `_${periodoFiltro}` : "";
      const dateStr = new Date().toISOString().substring(0, 10);
      doc.save(`informe_gastos_financieros${periodStr}_${dateStr}.pdf`);
      toast.success("Informe de gastos en PDF descargado exitosamente.");
    } catch (err) {
      console.error("Error al exportar PDF:", err);
      toast.error("Error al generar PDF: " + (err.message || "desconocido"));
    }
  };

  const handlePrint = () => {
    try {
      window.print();
    } catch {
      toast.info("Impresión bloqueada por el navegador. Descargando informe en PDF...");
      handleExportPDF();
    }
  };

  return (
    <div className="space-y-6 print-area w-full max-w-full">
      {/* Tarjetas KPI de Resumen Financiero */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 print:hidden">
        <Card className="shadow-xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Total Gastos Financieros</p>
              <p className="text-2xl font-bold font-mono mt-1 text-primary">{formatCOP(totales.total)}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <DollarSign className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Extractos con Cargos</p>
              <p className="text-2xl font-bold font-mono mt-1">{extractosConGastos.length}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
              <Receipt className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Períodos Evaluados</p>
              <p className="text-2xl font-bold font-mono mt-1">
                {periodoFiltro === "todos" ? periodosDisponibles.length : 1}
              </p>
            </div>
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
              <CreditCard className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Barra de Filtros y Control */}
      <Card className="print:hidden shadow-xs">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[240px] relative">
              <Label className="text-xs font-semibold text-muted-foreground">Buscar (producto, banco, observación)</Label>
              <div className="relative mt-1">
                <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={textoBusqueda}
                  onChange={(e) => setTextoBusqueda(e.target.value)}
                  placeholder="Nombre de producto, banco, nota..."
                  className="pl-8 h-9 text-sm"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold text-muted-foreground">Período</Label>
              <Select value={periodoFiltro} onValueChange={handlePeriodoChange}>
                <SelectTrigger className="w-44 h-9 mt-1 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los períodos</SelectItem>
                  {periodosDisponibles.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportExcel}
                className="h-9 gap-1.5 font-medium border-emerald-600/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
                title="Generar y descargar informe de gastos en Excel (.xlsx)"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Excel (.xlsx)
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportPDF}
                className="h-9 gap-1.5 font-medium border-blue-600/40 text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/20"
                title="Generar y descargar informe de gastos en PDF"
              >
                <Download className="w-4 h-4 text-blue-600" /> Descargar PDF
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrint}
                className="h-9 gap-1.5 font-medium"
                title="Imprimir vista de gastos financieros"
              >
                <Printer className="w-4 h-4" /> Imprimir
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/40">
            <span className="text-xs text-muted-foreground inline-flex items-center gap-1 font-semibold">
              <Filter className="w-3.5 h-3.5" /> Filtrar por cargos:
            </span>
            {CAMPOS_GASTO.map((c) => {
              const active = !!cargosFiltro[c.key];
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => toggleCargo(c.key)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors whitespace-nowrap ${active ? "bg-primary text-primary-foreground border-primary font-medium" : "bg-transparent text-muted-foreground border-border hover:border-primary/50"}`}
                >
                  {c.label}
                </button>
              );
            })}
            {cargosSeleccionados.length > 0 && (
              <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground hover:text-foreground" onClick={() => setCargosFiltro({})}>
                <X className="w-3 h-3 mr-1" /> Limpiar filtros
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Vista Ejecutiva Amplia del Informe de Gastos */}
      <Card className="shadow-xs overflow-hidden">
        <CardContent className="p-6">
          <div className="mb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b pb-4">
            <div>
              <h2 className="font-heading text-xl font-bold tracking-tight">Informe de Gastos Financieros</h2>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                Desglose de cuotas de manejo, intereses, seguros y comisiones por extracto
                {periodoFiltro !== "todos" && <> · Período: <span className="font-medium text-foreground">{periodoFiltro}</span></>}
              </p>
            </div>
            <div className="text-xs font-mono text-muted-foreground">
              {extractosConGastos.length} extracto(s) con gastos
            </div>
          </div>

          {extractosConGastos.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              No hay extractos con gastos financieros registrados para el filtro seleccionado.
            </div>
          ) : (
            <div className="overflow-x-auto w-full rounded-md border border-border/60">
              <table className="w-full text-sm border-collapse min-w-full">
                <thead className="bg-muted/40 text-xs text-muted-foreground uppercase tracking-wider font-semibold border-b border-border/80">
                  <tr>
                    <th className="py-3 px-4 text-left whitespace-nowrap">Producto</th>
                    <th className="py-3 px-4 text-left whitespace-nowrap">Banco</th>
                    <th className="py-3 px-4 text-left whitespace-nowrap">Período</th>
                    {CAMPOS_GASTO.map((c) => (
                      <th key={c.key} className="py-3 px-4 text-right whitespace-nowrap">{c.label}</th>
                    ))}
                    <th className="py-3 px-4 text-right whitespace-nowrap font-bold">Total Gastos</th>
                    <th className="py-3 px-4 text-left whitespace-nowrap">Observaciones</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-border/40">
                  {extractosConGastos.map((e) => {
                    const prod = productoMap[e.producto_id];
                    const totalGasto = CAMPOS_GASTO.reduce((s, c) => s + (Number(e[c.key]) || 0), 0);
                    return (
                      <tr key={e.id} className="hover:bg-muted/20 transition-colors">
                        {/* Producto: nombre acortado de la tarjeta en NEGRITAS */}
                        <td className="py-3.5 px-4 font-bold text-sm whitespace-nowrap text-foreground">
                          {prod?.nombre || "—"}
                        </td>

                        {/* Banco: sin partir en renglones */}
                        <td className="py-3.5 px-4 whitespace-nowrap font-medium text-xs text-muted-foreground">
                          {BANCO_NAMES[prod?.banco] || prod?.banco || "—"}
                        </td>

                        {/* Período en NEGRITAS */}
                        <td className="py-3.5 px-4 font-bold font-mono text-sm whitespace-nowrap text-foreground">
                          {e.periodo || "—"}
                        </td>

                        {/* Campos de gasto individuales */}
                        {CAMPOS_GASTO.map((c) => (
                          <td key={c.key} className="py-3.5 px-4 font-mono text-right text-xs whitespace-nowrap">
                            {Number(e[c.key]) > 0 ? (
                              <span className="font-medium text-foreground">{formatCOP(e[c.key])}</span>
                            ) : (
                              <span className="text-muted-foreground/50">—</span>
                            )}
                          </td>
                        ))}

                        {/* Total Gastos en negritas */}
                        <td className="py-3.5 px-4 font-mono text-right text-sm font-bold whitespace-nowrap text-primary">
                          {formatCOP(totalGasto)}
                        </td>

                        {/* Observaciones sin desbordar ni partir palabras */}
                        <td className="py-3.5 px-4 text-xs whitespace-nowrap text-muted-foreground truncate max-w-xs" title={e.observaciones || ""}>
                          {e.observaciones || "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>

                <tfoot className="border-t-2 border-border/80 bg-muted/30">
                  <tr className="font-bold text-sm">
                    <td className="py-4 px-4 whitespace-nowrap" colSpan={3}>
                      TOTALES ({extractosConGastos.length} extractos)
                    </td>
                    {CAMPOS_GASTO.map((c) => (
                      <td key={c.key} className="py-4 px-4 font-mono text-right whitespace-nowrap font-bold">
                        {formatCOP(totales[c.key])}
                      </td>
                    ))}
                    <td className="py-4 px-4 font-mono text-right whitespace-nowrap font-bold text-primary">
                      {formatCOP(totales.total)}
                    </td>
                    <td className="py-4 px-4 whitespace-nowrap"></td>
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