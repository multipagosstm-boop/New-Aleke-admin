import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Upload, FileSpreadsheet, Download, CheckCircle2, XCircle, AlertCircle, Sparkles, AlertTriangle, Copy } from "lucide-react";
import * as XLSX from "xlsx";
import { formatCOP, formatDate } from "@/lib/contabilidad";
import { toast } from "sonner";

const COLUMNAS_REQ = ["fecha", "comprobante_numero", "descripcion", "subcuenta", "debito", "credito"];

function fechaToString(fecha) {
  if (fecha == null || fecha === "") return "";
  // Objeto Date (cuando cellDates: true)
  if (fecha instanceof Date) {
    if (isNaN(fecha.getTime())) return "";
    const y = fecha.getFullYear();
    const m = String(fecha.getMonth() + 1).padStart(2, "0");
    const d = String(fecha.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  // Número de serie de Excel (ej: 46237 = 2026-08-03)
  if (typeof fecha === "number") {
    const date = new Date(Math.round((fecha - 25569) * 86400 * 1000));
    if (isNaN(date.getTime())) return "";
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    const d = String(date.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  // String
  const s = String(fecha).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  const match = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match) {
    const dd = match[1].padStart(2, "0");
    const mm = match[2].padStart(2, "0");
    return `${match[3]}-${mm}-${dd}`;
  }
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, "0");
    const d = String(parsed.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return "";
}

const TIPOS_TDC = ["compra", "avance", "financiero", "abono"];

export default function CargaMasiva() {
  const [datos, setDatos] = useState(null);
  const [fileName, setFileName] = useState("");
  const [procesando, setProcesando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState("");
  const [productosMap, setProductosMap] = useState({});
  const [rlsAlert, setRlsAlert] = useState(false);
  const fileRef = useRef(null);

  // Escuchar violaciones de RLS si ocurren en inserciones
  useEffect(() => {
    const handleRls = () => {
      setRlsAlert(true);
    };
    window.addEventListener('supabase-rls-violation', handleRls);
    return () => window.removeEventListener('supabase-rls-violation', handleRls);
  }, []);

  // Mapa de codigo_interno -> tipo de producto, para hint de auto-detección TDC
  useEffect(() => {
    base44.entities.ProductoCredito.list().then((prods) => {
      const map = {};
      (prods || []).forEach((p) => {
        if (p.codigo_interno) map[String(p.codigo_interno).trim()] = p.tipo;
      });
      setProductosMap(map);
    }).catch(() => {});
  }, []);

  // Determina el tipo TDC a mostrar en la fila: explícito (usuario) o auto-detectado (compra)
  const resolverTipoTDC = (row) => {
    const explicito = row.tipo_movimiento_tdc ? String(row.tipo_movimiento_tdc).trim().toLowerCase() : "";
    if (explicito && TIPOS_TDC.includes(explicito)) {
      return { explicito: true, valor: explicito };
    }
    const credito = Number(row.credito) || 0;
    const codigo = String(row.col_9 || row.codigo_producto || "").trim();
    if (credito > 0 && codigo && productosMap[codigo] === "TDC") {
      return { explicito: false, valor: "compra" };
    }
    return null;
  };

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    setError("");
    setResultado(null);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: true });
      if (rows.length === 0) { setError("El archivo no tiene datos."); return; }
      const headers = Object.keys(rows[0]);
      const faltantes = COLUMNAS_REQ.filter((c) => !headers.includes(c));
      if (faltantes.length > 0) {
        setError(`Faltan columnas obligatorias: ${faltantes.join(", ")}`);
        return;
      }
      setDatos(rows);
    } catch (e) { setError("Error al leer el archivo: " + e.message); }
  };

  const handleProcesar = async () => {
    if (!datos) return;
    setProcesando(true);
    setError("");
    try {
      const resp = await base44.functions.invoke("procesarCargaMasiva", { movimientos: datos });
      if (resp.data?.error) throw new Error(resp.data.error);
      setResultado(resp.data);
      setDatos(null);
      if (fileRef.current) fileRef.current.value = "";
      setFileName("");
    } catch (e) { setError("Error: " + e.message); }
    setProcesando(false);
  };

  const handleDescargarPlantilla = () => {
    const ws = XLSX.utils.json_to_sheet([
      { fecha: "2026-08-01", comprobante_numero: 1, descripcion: "Abono TDC desde CDA", subcuenta: 21100102, debito: 100000, credito: null, tercero: null, cliente_id: null, producto_credito_id: null, col_9: "BA02", tipo_movimiento_tdc: "abono" },
      { fecha: "2026-08-01", comprobante_numero: 1, descripcion: "Abono TDC desde CDA", subcuenta: 11100109, debito: null, credito: 100000, tercero: null, cliente_id: null, producto_credito_id: null, col_9: null, tipo_movimiento_tdc: null },
      { fecha: "2026-08-01", comprobante_numero: 2, descripcion: "Compra con TDC", subcuenta: 21100102, debito: null, credito: 50000, tercero: null, cliente_id: null, producto_credito_id: null, col_9: "BA02", tipo_movimiento_tdc: "compra" },
      { fecha: "2026-08-01", comprobante_numero: 2, descripcion: "Compra con TDC", subcuenta: 510502, debito: 50000, credito: null, tercero: "Comercio Ejemplo", cliente_id: null, producto_credito_id: null, col_9: null, tipo_movimiento_tdc: null },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Movimientos");
    XLSX.writeFile(wb, "plantilla_carga_masiva.xlsx");
  };

  const gruposPreview = {};
  if (datos) {
    datos.forEach((row) => {
      const n = String(row.comprobante_numero);
      if (!gruposPreview[n]) gruposPreview[n] = { debito: 0, credito: 0, count: 0 };
      let d = Number(row.debito) || 0, c = Number(row.credito) || 0;
      if (d < 0) { c += Math.abs(d); d = 0; }
      if (c < 0) { d += Math.abs(c); c = 0; }
      gruposPreview[n].debito += d;
      gruposPreview[n].credito += c;
      gruposPreview[n].count++;
    });
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-heading font-semibold">Carga Masiva de Movimientos</h1>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-muted-foreground gap-1.5"
          onClick={() => {
            fetch('/supabase/fix_rls_data_loading.sql')
              .then(res => res.text())
              .then(sql => {
                navigator.clipboard.writeText(sql);
                toast.success('Script SQL de desbloqueo RLS copiado al portapapeles.');
              });
          }}
          title="Copiar script SQL para garantizar que RLS no afecte la carga en Supabase"
        >
          <Copy className="w-3.5 h-3.5" /> Script Permisos RLS
        </Button>
      </div>

      {rlsAlert && (
        <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs space-y-2 text-amber-900 dark:text-amber-300">
          <div className="font-semibold flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              Supabase RLS Detectado: Las políticas de seguridad pueden bloquear la inserción en la base de datos.
            </span>
            <Button 
              size="sm" 
              variant="outline" 
              className="h-7 text-xs border-amber-500/40 bg-card hover:bg-muted"
              onClick={() => {
                fetch('/supabase/fix_rls_data_loading.sql')
                  .then(res => res.text())
                  .then(sql => {
                    navigator.clipboard.writeText(sql);
                    toast.success('Script SQL copiado. Pégalo y ejecútalo en Supabase -> SQL Editor.');
                  });
              }}
            >
              <Copy className="w-3.5 h-3.5 mr-1" /> Copiar Script SQL de Desbloqueo
            </Button>
          </div>
          <p className="text-[11px] opacity-90">
            Para garantizar que todas las tablas acepten cargas masivas de datos sin restricciones de RLS, ejecuta el script <code>fix_rls_data_loading.sql</code> en el SQL Editor de tu proyecto de Supabase.
          </p>
        </div>
      )}

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground max-w-2xl">
              Sube un Excel (.xlsx) con los movimientos contables agrupados por número de comprobante.
              El sistema valida partida doble, lookup de PUC y productos por código (col_9), y crea los comprobantes automáticamente.
              Usa la columna opcional <span className="font-mono text-[11px] bg-muted px-1 rounded">tipo_movimiento_tdc</span> para marcar compras/avances/financieros/abonos; si la omites en un crédito de TDC, se asume <span className="font-medium">compra</span> automáticamente.
            </p>
            <Button variant="outline" size="sm" onClick={handleDescargarPlantilla}>
              <Download className="w-4 h-4 mr-1" /> Plantilla
            </Button>
          </div>
          <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
            <FileSpreadsheet className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
            <Input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" id="file-upload" />
            <Label htmlFor="file-upload" className="cursor-pointer text-primary hover:underline">
              {fileName || "Seleccionar archivo Excel..."}
            </Label>
          </div>
          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-2 rounded-md">
              <AlertCircle className="w-4 h-4 shrink-0" /> {error}
            </div>
          )}
        </CardContent>
      </Card>

      {datos && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">Vista previa ({datos.length} filas · {Object.keys(gruposPreview).length} comprobantes)</h3>
              <Button onClick={handleProcesar} disabled={procesando}>
                <Upload className="w-4 h-4 mr-1" /> {procesando ? "Procesando..." : "Procesar carga"}
              </Button>
            </div>

            <div className="space-y-1">
              {Object.entries(gruposPreview).map(([num, g]) => {
                const cuadrado = Math.abs(g.debito - g.credito) < 1;
                return (
                  <div key={num} className="flex items-center justify-between text-xs border rounded px-3 py-1.5">
                    <span className="font-medium">Comprobante {num} ({g.count} movs)</span>
                    <span className="font-mono text-muted-foreground">D: {formatCOP(g.debito)} · C: {formatCOP(g.credito)}</span>
                    <Badge className={cuadrado ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}>
                      {cuadrado ? "✓ Cuadrado" : "✗ Descuadre"}
                    </Badge>
                  </div>
                );
              })}
            </div>

            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="border-b text-left text-muted-foreground sticky top-0 bg-card">
                  <tr>
                    <th className="px-2 py-1.5 font-medium"># Comp</th>
                    <th className="px-2 py-1.5 font-medium">Fecha</th>
                    <th className="px-2 py-1.5 font-medium">Descripción</th>
                    <th className="px-2 py-1.5 font-medium">Subcuenta</th>
                    <th className="px-2 py-1.5 font-medium text-right">Débito</th>
                    <th className="px-2 py-1.5 font-medium text-right">Crédito</th>
                    <th className="px-2 py-1.5 font-medium">Tercero</th>
                    <th className="px-2 py-1.5 font-medium">Cód. Prod</th>
                    <th className="px-2 py-1.5 font-medium">Tipo TDC</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.slice(0, 100).map((row, i) => (
                    <tr key={i} className="border-b border-border/40">
                      <td className="px-2 py-1">{row.comprobante_numero}</td>
                      <td className="px-2 py-1 font-mono">{formatDate(fechaToString(row.fecha))}</td>
                      <td className="px-2 py-1 truncate max-w-[150px]">{row.descripcion}</td>
                      <td className="px-2 py-1 font-mono">{row.subcuenta}</td>
                      <td className="px-2 py-1 text-right font-mono">{row.debito ? formatCOP(Number(row.debito)) : "—"}</td>
                      <td className="px-2 py-1 text-right font-mono">{row.credito ? formatCOP(Number(row.credito)) : "—"}</td>
                      <td className="px-2 py-1 truncate max-w-[100px]">{row.tercero || "—"}</td>
                      <td className="px-2 py-1 font-mono">{row.col_9 || row.codigo_producto || "—"}</td>
                      <td className="px-2 py-1">
                        {(() => {
                          const t = resolverTipoTDC(row);
                          if (!t) return <span className="text-muted-foreground">—</span>;
                          if (t.explicito) {
                            return (
                              <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase bg-[#EEF2FF] text-[#4338CA]">
                                {t.valor}
                              </span>
                            );
                          }
                          return (
                            <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase bg-[#F1F5F9] text-[#64748B]">
                              <Sparkles className="w-3 h-3" />{t.valor}
                            </span>
                          );
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {datos.length > 100 && <p className="text-xs text-muted-foreground">Mostrando primeras 100 filas de {datos.length}.</p>}
          </CardContent>
        </Card>
      )}

      {resultado && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-3">
              <h3 className="font-medium">Resultado</h3>
              <Badge className="bg-success/15 text-success">{resultado.creados} creados</Badge>
              {resultado.fallidos > 0 && <Badge className="bg-destructive/15 text-destructive">{resultado.fallidos} fallidos</Badge>}
            </div>
            {resultado.resultados?.map((r, i) => (
              <div key={i} className="flex items-center justify-between text-sm border rounded px-3 py-2 bg-success/5">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-success" />
                  <span>Comprobante {r.comprobante_numero} → <span className="font-mono">{r.numero_generado}</span></span>
                </div>
                <span className="font-mono text-xs text-muted-foreground">{r.movimientos} movs · {formatCOP(r.total)}</span>
              </div>
            ))}
            {resultado.errores?.map((e, i) => (
              <div key={i} className="flex items-start gap-2 text-sm border rounded px-3 py-2 bg-destructive/5">
                <XCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                <div><span className="font-medium">Comprobante {e.comprobante_numero}: </span><span className="text-destructive">{e.error}</span></div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}