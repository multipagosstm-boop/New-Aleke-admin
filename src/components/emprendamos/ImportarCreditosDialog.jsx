import React, { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Upload, FileSpreadsheet, CheckCircle2, UserPlus } from "lucide-react";
import { formatCOP } from "@/lib/contabilidad";
import { useToast } from "@/components/ui/use-toast";
import { base44 } from "@/api/base44Client";
import * as XLSX from "xlsx";

function normalizeText(str) {
  if (!str) return "";
  return String(str)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function parseNumber(val) {
  if (typeof val === "number") return val;
  if (!val) return 0;
  let clean = String(val).replace(/[$€\s]/g, "").trim();
  // Formato tipo 15.000.000,00 (Colombia / Europa)
  if (/\.\d{3},\d+$/.test(clean) || (clean.includes(".") && clean.includes(",") && clean.indexOf(".") < clean.indexOf(","))) {
    clean = clean.replace(/\./g, "").replace(",", ".");
  } else if (/,\d{3}\.\d+$/.test(clean) || (clean.includes(",") && clean.includes(".") && clean.indexOf(",") < clean.indexOf("."))) {
    // 15,000,000.00 (formato estándar)
    clean = clean.replace(/,/g, "");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(clean)) {
    // 15.000.000
    clean = clean.replace(/\./g, "");
  } else if (/^\d{1,3}(,\d{3})+$/.test(clean)) {
    // 15,000,000
    clean = clean.replace(/,/g, "");
  } else if (clean.includes(",")) {
    clean = clean.replace(",", ".");
  }
  const n = Number(clean);
  return isNaN(n) ? 0 : n;
}

export default function ImportarCreditosDialog({
  open,
  onOpenChange,
  inscritos = [],
  clientes = [],
  onSuccess
}) {
  const { toast } = useToast();
  const [csvRaw, setCsvRaw] = useState("");
  const [reemplazarExistentes, setReemplazarExistentes] = useState(true);
  const [loading, setLoading] = useState(false);

  // File upload handler (supports .csv, .txt, .xlsx, .xls)
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const fileName = (file.name || "").toLowerCase();
      if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer);
        const firstSheet = wb.Sheets[wb.SheetNames[0]];
        const csvText = XLSX.utils.sheet_to_csv(firstSheet);
        setCsvRaw(csvText);
      } else {
        const reader = new FileReader();
        reader.onload = (event) => {
          setCsvRaw(event.target?.result || "");
        };
        reader.readAsText(file);
      }
    } catch (err) {
      console.error("Error al leer archivo:", err);
      toast({
        variant: "destructive",
        title: "Error al leer archivo",
        description: err.message || "No se pudo leer el archivo cargado."
      });
    }
  };

  // Parser of credits from CSV content
  const parsedCredits = useMemo(() => {
    if (!csvRaw || !csvRaw.trim()) return [];

    const lines = csvRaw.trim().split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) return [];

    const header = lines[0];
    let sep = ",";
    if (header.includes(";")) sep = ";";
    else if (header.includes("\t")) sep = "\t";
    else if (header.includes("|")) sep = "|";

    // Detect if first line is header
    const isFirstLineHeader = /codigo|cliente|nombre|tasa|capital|saldo|dia|monto|cedula|documento|identificacion|nit|valor/i.test(header);
    let colMap = null;
    if (isFirstLineHeader) {
      const hParts = header.split(sep).map((p) => normalizeText(p.replace(/^"|"$/g, "")));
      colMap = {
        codigo: hParts.findIndex((p) => p.includes("cod") || p.includes("num") || p === "id" || p.includes("cred")),
        documento: hParts.findIndex((p) => p.includes("ced") || p.includes("doc") || p.includes("ident") || p.includes("nit")),
        cliente: hParts.findIndex((p) => p.includes("cli") || p.includes("nom") || p.includes("titu") || p.includes("terc")),
        capital: hParts.findIndex((p) => p.includes("cap") || p.includes("sal") || p.includes("mon") || p.includes("val") || p.includes("deud")),
        tasa: hParts.findIndex((p) => p.includes("tas") || p.includes("int") || p.includes("%")),
        dia: hParts.findIndex((p) => p.includes("dia") || p.includes("corte") || p.includes("fecha_pago") || p.includes("pago"))
      };
    }

    const dataLines = isFirstLineHeader ? lines.slice(1) : lines;

    return dataLines.map((line, idx) => {
      const parts = line.split(sep).map((p) => p.replace(/^"|"$/g, "").trim());

      let codigo = "";
      let documento = "";
      let clienteText = "";
      let capital = 0;
      let tasa = 0.03;
      let diaPago = 15;

      // Si se mapearon encabezados:
      if (colMap && colMap.codigo >= 0 && parts[colMap.codigo]) {
        codigo = parts[colMap.codigo].toUpperCase();
      }
      if (colMap && colMap.documento >= 0 && parts[colMap.documento]) {
        documento = parts[colMap.documento];
      }
      if (colMap && colMap.cliente >= 0 && parts[colMap.cliente]) {
        clienteText = parts[colMap.cliente];
      }
      if (colMap && colMap.capital >= 0 && parts[colMap.capital]) {
        capital = parseNumber(parts[colMap.capital]);
      }
      if (colMap && colMap.tasa >= 0 && parts[colMap.tasa]) {
        const rawT = parts[colMap.tasa];
        const numT = parseNumber(rawT.replace("%", ""));
        tasa = numT > 0.5 ? numT / 100 : (numT > 0 ? numT : 0.03);
      }
      if (colMap && colMap.dia >= 0 && parts[colMap.dia]) {
        diaPago = parseNumber(parts[colMap.dia]) || 15;
      }

      // Si no se mapearon encabezados o faltan datos, escanear celdas dinámicamente
      for (const val of parts) {
        const v = val.trim();
        if (!v) continue;

        if (!codigo && (/^c\d+$/i.test(v) || /^em-\d+$/i.test(v) || /^cre-\d+$/i.test(v))) {
          codigo = v.toUpperCase();
        } else if (v.includes("%") || (Number(v) > 0 && Number(v) <= 0.5 && !tasa)) {
          const t = Number(v.replace("%", "").trim());
          tasa = t > 1 ? t / 100 : t;
        } else if (/^\$?\s*[\d,.]+(\.\d+)?$/.test(v) && !v.includes("%")) {
          const num = parseNumber(v);
          if (num > 50000 && capital <= 0) {
            capital = num;
          } else if (num >= 1 && num <= 31 && diaPago === 15 && (!colMap || colMap.dia < 0)) {
            diaPago = num;
          } else if (num >= 1000000 && num <= 99999999999 && !documento) {
            // Documento de identidad (cédula)
            documento = String(num);
          }
        } else if (!documento && /^\d{6,12}$/.test(v)) {
          documento = v;
        } else if (v.length > 2 && isNaN(Number(v)) && !clienteText && !/^c\d+$/i.test(v)) {
          clienteText = v;
        }
      }

      // Fallback para código si es la primera columna
      if (!codigo && parts[0] && /^c\d+/i.test(parts[0])) {
        codigo = parts[0].toUpperCase();
      }

      // Si clienteText contiene una cédula exclusivamente
      if (!documento && clienteText && /^\d{6,12}$/.test(clienteText.trim())) {
        documento = clienteText.trim();
        clienteText = "";
      }

      const cleanDoc = documento ? String(documento).replace(/[^0-9a-zA-Z]/g, "").trim() : "";
      const isCliTextDoc = clienteText && /^\d{6,12}$/.test(clienteText.trim());
      const effectiveDoc = cleanDoc || (isCliTextDoc ? clienteText.trim() : "");

      // 1. Buscar coincidencia por documento en clientes o inscritos
      let matchedCliente = null;
      let empCli = null;

      if (effectiveDoc) {
        matchedCliente = clientes.find((c) => {
          const cDoc = String(c.cedula || c.documento || c.numero_documento || "").replace(/[^0-9a-zA-Z]/g, "").trim();
          return cDoc && cDoc === effectiveDoc;
        });
        empCli = inscritos.find((i) => {
          const iDoc = String(i.documento || i.cedula || "").replace(/[^0-9a-zA-Z]/g, "").trim();
          return iDoc && iDoc === effectiveDoc;
        });
      }

      // 2. Buscar por ID directo
      if (!matchedCliente && clienteText) {
        matchedCliente = clientes.find((c) => c.id === clienteText);
      }
      if (!empCli && clienteText) {
        empCli = inscritos.find((i) => i.id === clienteText || i.cliente_id === clienteText);
      }

      // 3. Buscar coincidencia por nombre en clientes o inscritos
      const normCli = normalizeText(clienteText);
      if (!matchedCliente && normCli && !isCliTextDoc) {
        matchedCliente = clientes.find((c) => {
          const cNorm = normalizeText(c.nombre);
          return cNorm === normCli || cNorm.includes(normCli) || normCli.includes(cNorm);
        });
        if (!matchedCliente) {
          const words = normCli.split(" ").filter((w) => w.length > 2);
          matchedCliente = clientes.find((c) => {
            const cNorm = normalizeText(c.nombre);
            return words.length > 0 && words.every((w) => cNorm.includes(w));
          });
        }
      }

      if (!empCli && normCli && !isCliTextDoc) {
        empCli = inscritos.find((i) => {
          const iNorm = normalizeText(i.nombre);
          return iNorm && (iNorm === normCli || iNorm.includes(normCli) || normCli.includes(iNorm));
        });
      }

      // Interconectar matchedCliente y empCli si uno fue hallado
      if (matchedCliente && !empCli) {
        empCli = inscritos.find((i) => i.cliente_id === matchedCliente.id || i.id === matchedCliente.id);
      }
      if (empCli && !matchedCliente && empCli.cliente_id) {
        matchedCliente = clientes.find((c) => c.id === empCli.cliente_id);
      }

      const validEmpNom = empCli?.nombre && empCli.nombre !== "Cliente Emprendamos" && empCli.nombre !== "Cliente" ? empCli.nombre : "";
      const nombreFinal = matchedCliente?.nombre || validEmpNom || (clienteText && !isCliTextDoc ? clienteText : (effectiveDoc ? `Cliente Doc ${effectiveDoc}` : `Cliente ${idx + 1}`));
      const docFinal = effectiveDoc || matchedCliente?.cedula || matchedCliente?.documento || empCli?.documento || "";

      return {
        key: idx,
        codigo: codigo || `C${String(idx + 1).padStart(2, "0")}`,
        clienteText: clienteText || nombreFinal,
        nombreFinal,
        documento: docFinal,
        matchedCliente: matchedCliente || (empCli ? { id: empCli.cliente_id || empCli.id, nombre: empCli.nombre } : null),
        empCli,
        capital: Math.round(capital),
        tasa: tasa || 0.03,
        diaPago: Number(diaPago) || 15,
        valido: capital > 0
      };
    });
  }, [csvRaw, clientes, inscritos]);

  const validCount = parsedCredits.filter((c) => c.valido).length;
  const matchedCount = parsedCredits.filter((c) => !!c.matchedCliente || !!c.empCli).length;

  const handleImport = async () => {
    if (parsedCredits.length === 0) {
      toast({ variant: "destructive", title: "Sin datos", description: "Pegue o cargue los datos del CSV primero." });
      return;
    }

    setLoading(true);
    try {
      const creditosPayload = parsedCredits.map((p) => ({
        codigo: p.codigo,
        capital: p.capital,
        tasa: p.tasa,
        dia_pago: p.diaPago,
        cliente_id: p.matchedCliente?.id || p.empCli?.cliente_id || "",
        emprendamos_cliente_id: p.empCli?.id || "",
        clienteNombre: p.nombreFinal || p.matchedCliente?.nombre || p.empCli?.nombre || p.clienteText || "Cliente",
        documento: p.documento || "",
        concepto: `Saldo inicial cartera a 31 de agosto — ${p.codigo}`
      }));

      const res = await base44.functions.invoke("gestionarEmprendamos", {
        accion: "montarCreditosIniciales",
        creditos: creditosPayload,
        reemplazarExistentes,
        fecha_corte: "2026-08-31"
      });

      toast({
        title: "¡Créditos importados con éxito!",
        description: `Se montaron ${parsedCredits.length} créditos a corte 31 de agosto y se generó el asiento contable en Supabase (120502 vs 310505).`
      });

      if (onSuccess) onSuccess();
      onOpenChange(false);
      setCsvRaw("");
    } catch (err) {
      console.error("Error al importar créditos:", err);
      toast({
        variant: "destructive",
        title: "Error al importar",
        description: err.message || "Ocurrió un error al guardar los créditos."
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <FileSpreadsheet className="w-5 h-5 text-amber-600" />
            Importar Créditos Emprendamos (CSV / Excel)
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto flex-1 pr-1">
          <p className="text-xs text-muted-foreground">
            Suba su archivo (.csv o .xlsx) o pegue los 34 créditos con saldo inicial a corte 31 de agosto. El sistema detecta automáticamente código, cliente, saldo inicial, tasa y día de pago, sincroniza los clientes y genera el comprobante contable en Supabase.
          </p>

          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Label htmlFor="csvFile" className="cursor-pointer inline-flex items-center gap-2 border rounded-md px-3 py-2 text-xs hover:bg-muted/50 font-medium">
                <Upload className="w-4 h-4 text-amber-600" />
                Subir archivo .csv o .xlsx
              </Label>
              <input
                id="csvFile"
                type="file"
                accept=".csv,.txt,.xlsx,.xls"
                className="hidden"
                onChange={handleFileUpload}
              />
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="reemplazar"
                checked={reemplazarExistentes}
                onCheckedChange={setReemplazarExistentes}
              />
              <Label htmlFor="reemplazar" className="text-xs font-normal cursor-pointer">
                Reemplazar créditos existentes antes de montar
              </Label>
            </div>
          </div>

          <div>
            <Label className="text-xs font-medium mb-1 block">O pegue el contenido CSV aquí:</Label>
            <Textarea
              rows={5}
              placeholder={`codigo,cliente,capital,tasa,dia_pago\nC01,Remigio Morales,15000000,3%,15\nC02,Dora Alicia,8500000,3%,23\n...`}
              value={csvRaw}
              onChange={(e) => setCsvRaw(e.target.value)}
              className="font-mono text-xs"
            />
          </div>

          {parsedCredits.length > 0 && (
            <div className="space-y-2 border rounded-md p-3 bg-muted/20">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-xs font-semibold">
                  Previsualización: {parsedCredits.length} créditos detectados
                </span>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs border-emerald-500/40 text-emerald-600">
                    {matchedCount} clientes existentes
                  </Badge>
                  {parsedCredits.length - matchedCount > 0 && (
                    <Badge variant="outline" className="text-xs border-blue-500/40 text-blue-600">
                      {parsedCredits.length - matchedCount} clientes nuevos (se auto-crearán)
                    </Badge>
                  )}
                </div>
              </div>

              <div className="max-h-56 overflow-y-auto border rounded bg-background">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted text-[10px] text-muted-foreground uppercase sticky top-0">
                    <tr>
                      <th className="p-2">Código</th>
                      <th className="p-2">Cliente CSV</th>
                      <th className="p-2">Estado Vinculación</th>
                      <th className="p-2 text-right">Saldo Inicial (31 Ago)</th>
                      <th className="p-2 text-center">Tasa</th>
                      <th className="p-2 text-center">Día Pago</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {parsedCredits.map((c) => (
                      <tr key={c.key} className={c.valido ? "hover:bg-muted/30" : "bg-destructive/5"}>
                        <td className="p-2 font-mono font-bold text-amber-700 dark:text-amber-400">{c.codigo}</td>
                        <td className="p-2 font-medium">
                          <div>
                            <span className="font-bold text-foreground block">{c.nombreFinal || c.clienteText || "—"}</span>
                            {c.documento && (
                              <span className="text-[10px] text-muted-foreground block">
                                Doc: {c.documento}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-2">
                          {c.matchedCliente ? (
                            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium" title={`ID: ${c.matchedCliente.id}`}>
                              <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                              <span className="truncate max-w-[160px]">{c.matchedCliente.nombre}</span>
                            </span>
                          ) : c.empCli ? (
                            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium" title={`Inscrito ID: ${c.empCli.id}`}>
                              <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                              <span className="truncate max-w-[160px]">{c.empCli.nombre}</span>
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                              <UserPlus className="w-3.5 h-3.5 flex-shrink-0" />
                              Se auto-inscribirá
                            </span>
                          )}
                        </td>
                        <td className="p-2 text-right font-medium">{formatCOP(c.capital)}</td>
                        <td className="p-2 text-center">{(c.tasa * 100).toFixed(1)}%</td>
                        <td className="p-2 text-center font-semibold">Día {c.diaPago}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="mt-4 pt-3 border-t flex items-center justify-between sm:justify-between">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>

          <Button
            size="sm"
            onClick={handleImport}
            disabled={loading || parsedCredits.length === 0}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            {loading ? "Montando créditos en Supabase..." : `Montar e Insertar ${parsedCredits.length} Créditos`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
