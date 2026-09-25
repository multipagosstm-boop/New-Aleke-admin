import React, { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Download, Upload } from "lucide-react";
import { base44 } from "@/api/base44Client";

/**
 * Exporta los comprobantes visibles (con sus movimientos) a un archivo Excel,
 * e importa comprobantes desde un Excel con el mismo formato.
 */
export default function LibroDiarioImportExport({ comprobantes, movsByComprobante, pucTransaccional, clientes, onImported }) {
  const fileRef = useRef(null);
  const [processing, setProcessing] = useState(false);
  const [msg, setMsg] = useState("");

  const pucMap = {};
  (pucTransaccional || []).forEach((c) => { pucMap[String(c.codigo)] = c; });

  const handleExport = () => {
    const rows = [];
    (comprobantes || []).forEach((c) => {
      const movs = (movsByComprobante && movsByComprobante[c.id]) || [];
      if (movs.length === 0) {
        rows.push({ Numero: c.numero, Tipo: c.tipo, Fecha: c.fecha, Descripcion: c.descripcion, Estado: c.estado, Subcuenta: "", Cuenta: "", Debito: "", Credito: "", Tercero: "", Nota: "", Periodo: "" });
      } else {
        movs.forEach((m) => {
          rows.push({
            Numero: c.numero, Tipo: c.tipo, Fecha: c.fecha, Descripcion: c.descripcion, Estado: c.estado,
            Subcuenta: m.subcuenta, Cuenta: m.cuenta_nombre || "",
            Debito: m.debito || 0, Credito: m.credito || 0,
            Tercero: m.tercero || "", Nota: m.descripcion || "", Periodo: m.periodo_extracto || ""
          });
        });
      }
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Libro Diario");
    XLSX.writeFile(wb, `libro-diario-${new Date().toISOString().substring(0, 10)}.xlsx`);
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProcessing(true); setMsg("");
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws);

      const grupos = {};
      const orden = [];
      rows.forEach((r) => {
        const num = String(r.Numero ?? "").trim();
        if (!num) return;
        if (!grupos[num]) { grupos[num] = { tipo: r.Tipo || "diario", fecha: r.Fecha, descripcion: r.Descripcion || "", movs: [] }; orden.push(num); }
        const subcuenta = String(r.Subcuenta ?? "").trim();
        const debito = Number(r.Debito) || 0;
        const credito = Number(r.Credito) || 0;
        if (!subcuenta && !debito && !credito) return;
        grupos[num].movs.push({ subcuenta, debito, credito, descripcion: r.Nota || "abono", tercero: r.Tercero || "" });
      });

      let creados = 0, errores = 0;
      for (const num of orden) {
        const g = grupos[num];
        if (g.movs.length < 2) { errores++; continue; }
        const totalD = g.movs.reduce((s, m) => s + m.debito, 0);
        const totalC = g.movs.reduce((s, m) => s + m.credito, 0);
        if (Math.abs(totalD - totalC) > 0.01) { errores++; continue; }
        const esResultado = g.movs.some((m) => {
          const c = pucMap[m.subcuenta];
          return c && (c.clase === 4 || c.clase === 5 || c.clase === 6 || c.clase === 7);
        });
        const movsPayload = g.movs.map((m) => {
          const cli = (clientes || []).find((c) => (c.nombre || "") === m.tercero);
          return {
            subcuenta: m.subcuenta, debito: m.debito, credito: m.credito,
            descripcion: m.descripcion, tercero: m.tercero,
            cliente_id: cli?.id || ""
          };
        });
        try {
          const resp = await base44.functions.invoke("createComprobante", {
            tipo: g.tipo, fecha: g.fecha, descripcion: g.descripcion,
            movimientos: movsPayload, modo: esResultado ? "resultado" : "balance"
          });
          if (resp.data?.error) { errores++; } else { creados++; }
        } catch { errores++; }
      }
      setMsg(`Importación: ${creados} comprobantes creados, ${errores} con error.`);
      if (creados > 0) onImported?.();
    } catch (err) {
      setMsg("Error al importar: " + (err?.message || "desconocido"));
    }
    setProcessing(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={handleExport} disabled={processing || (comprobantes || []).length === 0}>
        <Download className="w-4 h-4 mr-2" /> Exportar Excel
      </Button>
      <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={processing}>
        <Upload className="w-4 h-4 mr-2" /> {processing ? "Procesando..." : "Importar Excel"}
      </Button>
      <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleImport} className="hidden" />
      {msg && <span className="text-xs text-muted-foreground ml-1">{msg}</span>}
    </>
  );
}