import React, { useState, useMemo, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Printer, Calendar, Search, ChevronUp, ChevronDown, ChevronsUpDown, DollarSign, CheckCircle2, Clock, FileSpreadsheet, Download } from "lucide-react";
import { formatCOP, formatDate, BANCO_NAMES } from "@/lib/contabilidad";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";

export default function InformePagos({ extractos, productoMap, titularMap = {}, periodoFiltro: periodoProp = "todos", onPeriodoFiltroChange }) {
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [periodoFiltro, setPeriodoFiltro] = useState(periodoProp || "todos");

  useEffect(() => {
    if (periodoProp) setPeriodoFiltro(periodoProp);
  }, [periodoProp]);

  const handlePeriodoChange = (val) => {
    setPeriodoFiltro(val);
    if (onPeriodoFiltroChange) onPeriodoFiltroChange(val);
  };
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
    if (sortKey !== k) return <ChevronsUpDown className="w-3.5 h-3.5 inline ml-1 text-muted-foreground/40" />;
    return sortDir === "asc"
      ? <ChevronUp className="w-3.5 h-3.5 inline ml-1 text-primary" />
      : <ChevronDown className="w-3.5 h-3.5 inline ml-1 text-primary" />;
  };

  const normalize = (s) => (s || "").toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  // Obtener únicamente el número completo de la tarjeta/producto sin prefijo
  const getNumeroProducto = (prod) => {
    if (prod?.numero_completo) return prod.numero_completo;
    if (prod?.numero_tarjeta) return prod.numero_tarjeta;
    const nombre = prod?.nombre || "";
    const sinPrefijo = nombre.replace(/^(TDC|CRÉDITO|CREDITO|TARJETA)\s*[-–—:]?\s*/i, "").trim();
    return sinPrefijo || nombre || "—";
  };

  const getSortValue = (e, key) => {
    const prod = productoMap[e.producto_id];
    switch (key) {
      case "producto": return normalize(getNumeroProducto(prod));
      case "banco": return normalize(BANCO_NAMES[prod?.banco] || prod?.banco || "");
      case "titular": return normalize(titularMap[prod?.titular_id]?.nombre || "");
      case "saldo_a_pagar": return Number(e.saldo_a_pagar) || 0;
      case "total_abonado": return Number(e.total_abonado) || 0;
      case "saldo_pendiente": return Number(e.saldo_pendiente) || 0;
      case "fecha_pago": return e.fecha_pago || "";
      default: return "";
    }
  };

  const periodosDisponibles = useMemo(() => {
    const s = new Set(extractos.map((e) => e.periodo).filter(Boolean));
    return Array.from(s).sort().reverse();
  }, [extractos]);

  // Solo extractos pendientes de pago (excluye pagados y no_pagadas)
  const extractosFiltrados = useMemo(() => {
    let result = extractos.filter((e) => e.estado === "pendiente_pago");
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
        return [
          prod?.nombre,
          prod?.numero_completo,
          getNumeroProducto(prod),
          prod?.banco,
          BANCO_NAMES[prod?.banco],
          titularMap[prod?.titular_id]?.nombre,
          e.periodo,
          e.observaciones
        ].some((v) => normalize(v).includes(q));
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
        saldo_a_pagar: acc.saldo_a_pagar + (Number(e.saldo_a_pagar) || 0),
        total_abonado: acc.total_abonado + (Number(e.total_abonado) || 0),
        saldo_pendiente: acc.saldo_pendiente + (Number(e.saldo_pendiente) || 0),
      }),
      { saldo_a_pagar: 0, total_abonado: 0, saldo_pendiente: 0 }
    );
  }, [extractosFiltrados]);

  const handleExportExcel = () => {
    try {
      if (extractosFiltrados.length === 0) {
        toast.info("No hay extractos pendientes para exportar.");
        return;
      }
      const data = extractosFiltrados.map((e) => {
        const prod = productoMap[e.producto_id];
        return {
          "Producto / Tarjeta": getNumeroProducto(prod),
          "Banco": BANCO_NAMES[prod?.banco] || prod?.banco || "—",
          "Titular": titularMap[prod?.titular_id]?.nombre || "—",
          "Período": e.periodo || "—",
          "Fecha Límite Pago": e.fecha_pago ? formatDate(e.fecha_pago) : "—",
          "Saldo a Pagar": Number(e.saldo_a_pagar) || 0,
          "Total Abonado": Number(e.total_abonado) || 0,
          "Saldo Pendiente": Number(e.saldo_pendiente ?? e.saldo_a_pagar) || 0,
        };
      });

      // Total row
      data.push({
        "Producto / Tarjeta": "TOTALES",
        "Banco": "",
        "Titular": "",
        "Período": "",
        "Fecha Límite Pago": "",
        "Saldo a Pagar": totales.saldo_a_pagar,
        "Total Abonado": totales.total_abonado,
        "Saldo Pendiente": totales.saldo_pendiente,
      });

      const ws = XLSX.utils.json_to_sheet(data);
      const colWidths = [
        { wch: 24 }, // Producto
        { wch: 18 }, // Banco
        { wch: 26 }, // Titular
        { wch: 12 }, // Período
        { wch: 18 }, // Fecha Límite
        { wch: 18 }, // Saldo Pagar
        { wch: 18 }, // Abonado
        { wch: 18 }, // Pendiente
      ];
      ws["!cols"] = colWidths;

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Extractos Por Pagar");

      const periodStr = periodoFiltro !== "todos" ? `_${periodoFiltro}` : "";
      const dateStr = new Date().toISOString().substring(0, 10);
      XLSX.writeFile(wb, `informe_extractos_por_pagar${periodStr}_${dateStr}.xlsx`);
      toast.success("Informe en Excel descargado exitosamente.");
    } catch (err) {
      console.error("Error al exportar Excel:", err);
      toast.error("Error al generar archivo Excel: " + (err.message || "desconocido"));
    }
  };

  const handleExportPDF = () => {
    try {
      if (extractosFiltrados.length === 0) {
        toast.info("No hay extractos pendientes para exportar.");
        return;
      }
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

      // Title & Header
      doc.setFontSize(16);
      doc.setTextColor(30, 41, 59);
      doc.text("Informe de Extractos por Pagar", 14, 15);

      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      const subHeader = `Rango: ${rangoTexto}  |  Período: ${periodoFiltro}  |  Fecha de emisión: ${new Date().toLocaleDateString("es-CO")}`;
      doc.text(subHeader, 14, 21);

      // Summary KPI banner
      const kpiText = `Total Facturado: ${formatCOP(totales.saldo_a_pagar)}  |  Total Abonado: ${formatCOP(totales.total_abonado)}  |  Total Pendiente: ${formatCOP(totales.saldo_pendiente)}  |  Total Extractos: ${extractosFiltrados.length}`;
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      doc.text(kpiText, 14, 27);

      const tableData = extractosFiltrados.map((e) => {
        const prod = productoMap[e.producto_id];
        return [
          getNumeroProducto(prod),
          BANCO_NAMES[prod?.banco] || prod?.banco || "—",
          titularMap[prod?.titular_id]?.nombre || "—",
          formatCOP(e.saldo_a_pagar || 0),
          formatCOP(e.total_abonado || 0),
          formatCOP(e.saldo_pendiente || 0),
          e.fecha_pago ? formatDate(e.fecha_pago) : "—",
        ];
      });

      const tableFooter = [[
        "TOTALES",
        "",
        "",
        formatCOP(totales.saldo_a_pagar),
        formatCOP(totales.total_abonado),
        formatCOP(totales.saldo_pendiente),
        `${extractosFiltrados.length} extractos`
      ]];

      autoTable(doc, {
        startY: 31,
        head: [["Producto", "Banco", "Titular", "Saldo Facturado", "Total Abonado", "Saldo Pendiente", "Fecha Límite"]],
        body: tableData,
        foot: tableFooter,
        theme: "striped",
        headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: "bold", fontSize: 9 },
        footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: "bold", fontSize: 9 },
        styles: { fontSize: 8.5, cellPadding: 2.5 },
        columnStyles: {
          0: { fontStyle: "bold" },
          3: { halign: "right", fontStyle: "bold" },
          4: { halign: "right", textColor: [16, 185, 129] },
          5: { halign: "right", fontStyle: "bold", textColor: [180, 83, 9] },
          6: { fontStyle: "bold" }
        }
      });

      const periodStr = periodoFiltro !== "todos" ? `_${periodoFiltro}` : "";
      const dateStr = new Date().toISOString().substring(0, 10);
      doc.save(`informe_extractos_por_pagar${periodStr}_${dateStr}.pdf`);
      toast.success("Informe en PDF descargado exitosamente.");
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

  const rangoTexto = fechaDesde || fechaHasta
    ? `${fechaDesde ? formatDate(fechaDesde) : "Inicio"} — ${fechaHasta ? formatDate(fechaHasta) : "Fin"}`
    : "Todas las fechas";

  return (
    <div className="space-y-6 print-area w-full max-w-full">
      {/* Tarjetas KPI de Resumen Financiero */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 print:hidden">
        <Card className="shadow-xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Total Facturado</p>
              <p className="text-xl font-bold font-mono mt-1">{formatCOP(totales.saldo_a_pagar)}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <DollarSign className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Total Abonado</p>
              <p className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">{formatCOP(totales.total_abonado)}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-xs border-amber-500/30">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Total Pendiente</p>
              <p className="text-xl font-bold font-mono text-amber-700 dark:text-amber-400 mt-1">{formatCOP(totales.saldo_pendiente)}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-700 dark:text-amber-400">
              <Clock className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Extractos Pendientes</p>
              <p className="text-xl font-bold font-mono mt-1">{extractosFiltrados.length}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
              <Calendar className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Barra de Filtros y Control */}
      <Card className="print:hidden shadow-xs">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[240px] relative">
              <Label className="text-xs font-semibold text-muted-foreground">Buscar por número, titular, banco</Label>
              <div className="relative mt-1">
                <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Número de tarjeta, titular, banco..."
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

            <div>
              <Label className="text-xs font-semibold text-muted-foreground">Fecha pago desde</Label>
              <Input
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                className="w-44 h-9 mt-1 text-sm"
              />
            </div>

            <div>
              <Label className="text-xs font-semibold text-muted-foreground">Fecha pago hasta</Label>
              <Input
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
                className="w-44 h-9 mt-1 text-sm"
              />
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportExcel}
                className="h-9 gap-1.5 font-medium border-emerald-600/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
                title="Generar y descargar informe en formato Excel (.xlsx)"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Excel (.xlsx)
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportPDF}
                className="h-9 gap-1.5 font-medium border-blue-600/40 text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/20"
                title="Generar y descargar informe en PDF"
              >
                <Download className="w-4 h-4 text-blue-600" /> Descargar PDF
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrint}
                className="h-9 gap-1.5 font-medium"
                title="Imprimir vista de extractos por pagar"
              >
                <Printer className="w-4 h-4" /> Imprimir
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Vista Ejecutiva Amplia del Informe */}
      <Card className="shadow-xs overflow-hidden">
        <CardContent className="p-6">
          <div className="mb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b pb-4">
            <div>
              <h2 className="font-heading text-xl font-bold tracking-tight">Informe de Extractos por Pagar</h2>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                Rango: <span className="font-medium text-foreground">{rangoTexto}</span>
                {periodoFiltro !== "todos" && <> · Período: <span className="font-medium text-foreground">{periodoFiltro}</span></>}
              </p>
            </div>
            <div className="text-xs font-mono text-muted-foreground">
              {extractosFiltrados.length} extracto(s) en lista
            </div>
          </div>

          {extractosFiltrados.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              No hay extractos pendientes de pago con los filtros seleccionados.
            </div>
          ) : (
            <div className="overflow-x-auto w-full rounded-md border border-border/60">
              <table className="w-full text-sm border-collapse min-w-full">
                <thead className="bg-muted/40 text-xs text-muted-foreground uppercase tracking-wider font-semibold border-b border-border/80">
                  <tr>
                    <th
                      className="py-3 px-5 text-left whitespace-nowrap cursor-pointer select-none hover:bg-muted/70 transition-colors"
                      onClick={() => toggleSort("producto")}
                    >
                      Producto <SortIcon k="producto" />
                    </th>
                    <th
                      className="py-3 px-5 text-left whitespace-nowrap cursor-pointer select-none hover:bg-muted/70 transition-colors"
                      onClick={() => toggleSort("banco")}
                    >
                      Banco <SortIcon k="banco" />
                    </th>
                    <th
                      className="py-3 px-5 text-left whitespace-nowrap cursor-pointer select-none hover:bg-muted/70 transition-colors"
                      onClick={() => toggleSort("titular")}
                    >
                      Titular <SortIcon k="titular" />
                    </th>
                    <th
                      className="py-3 px-5 text-right whitespace-nowrap cursor-pointer select-none hover:bg-muted/70 transition-colors"
                      onClick={() => toggleSort("saldo_a_pagar")}
                    >
                      Saldo a Pagar <SortIcon k="saldo_a_pagar" />
                    </th>
                    <th
                      className="py-3 px-5 text-right whitespace-nowrap cursor-pointer select-none hover:bg-muted/70 transition-colors"
                      onClick={() => toggleSort("total_abonado")}
                    >
                      Abonado <SortIcon k="total_abonado" />
                    </th>
                    <th
                      className="py-3 px-5 text-right whitespace-nowrap cursor-pointer select-none hover:bg-muted/70 transition-colors"
                      onClick={() => toggleSort("saldo_pendiente")}
                    >
                      Pendiente <SortIcon k="saldo_pendiente" />
                    </th>
                    <th
                      className="py-3 px-5 text-left whitespace-nowrap cursor-pointer select-none hover:bg-muted/70 transition-colors"
                      onClick={() => toggleSort("fecha_pago")}
                    >
                      Fecha Pago <SortIcon k="fecha_pago" />
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-border/40">
                  {extractosFiltrados.map((e) => {
                    const prod = productoMap[e.producto_id];
                    const numeroProd = getNumeroProducto(prod);
                    return (
                      <tr key={e.id} className="hover:bg-muted/20 transition-colors">
                        {/* Producto: únicamente el número completo sin prefijos en negritas */}
                        <td className="py-3.5 px-5 font-bold font-mono text-sm whitespace-nowrap text-foreground">
                          {numeroProd}
                        </td>

                        {/* Banco: texto limpio en un solo renglón */}
                        <td className="py-3.5 px-5 whitespace-nowrap font-medium text-xs text-muted-foreground">
                          {BANCO_NAMES[prod?.banco] || prod?.banco || "—"}
                        </td>

                        {/* Titular: texto limpio en un solo renglón */}
                        <td className="py-3.5 px-5 whitespace-nowrap text-sm">
                          {titularMap[prod?.titular_id]?.nombre || "—"}
                        </td>

                        {/* Saldo a pagar */}
                        <td className="py-3.5 px-5 font-mono text-right text-sm font-semibold whitespace-nowrap">
                          {formatCOP(e.saldo_a_pagar || 0)}
                        </td>

                        {/* Abonado */}
                        <td className="py-3.5 px-5 font-mono text-right text-sm whitespace-nowrap text-emerald-600 dark:text-emerald-400 font-semibold">
                          {formatCOP(e.total_abonado || 0)}
                        </td>

                        {/* Pendiente */}
                        <td className="py-3.5 px-5 font-mono text-right text-sm whitespace-nowrap font-bold text-amber-700 dark:text-amber-400">
                          {formatCOP(e.saldo_pendiente || 0)}
                        </td>

                        {/* Fecha Pago en NEGRITAS */}
                        <td className="py-3.5 px-5 font-bold text-sm whitespace-nowrap text-foreground">
                          {formatDate(e.fecha_pago)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>

                <tfoot className="border-t-2 border-border/80 bg-muted/30">
                  <tr className="font-bold text-sm">
                    <td className="py-4 px-5 whitespace-nowrap" colSpan={3}>
                      TOTALES ({extractosFiltrados.length} extractos)
                    </td>
                    <td className="py-4 px-5 font-mono text-right whitespace-nowrap font-bold">
                      {formatCOP(totales.saldo_a_pagar)}
                    </td>
                    <td className="py-4 px-5 font-mono text-right whitespace-nowrap font-bold text-emerald-600 dark:text-emerald-400">
                      {formatCOP(totales.total_abonado)}
                    </td>
                    <td className="py-4 px-5 font-mono text-right whitespace-nowrap font-bold text-amber-700 dark:text-amber-400">
                      {formatCOP(totales.saldo_pendiente)}
                    </td>
                    <td className="py-4 px-5 whitespace-nowrap"></td>
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