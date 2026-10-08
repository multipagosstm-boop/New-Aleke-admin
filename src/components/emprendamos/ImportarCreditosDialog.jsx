import React, { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle } from "lucide-react";
import { formatCOP } from "@/lib/contabilidad";
import { useToast } from "@/components/ui/use-toast";
import { base44 } from "@/api/base44Client";

function normalizeText(str) {
  if (!str) return "";
  return String(str)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
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

  // File upload handler
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setCsvRaw(event.target?.result || "");
    };
    reader.readAsText(file);
  };

  // Parser of credits from CSV content
  const parsedCredits = useMemo(() => {
    if (!csvRaw || !csvRaw.trim()) return [];

    const lines = csvRaw.trim().split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) return [];

    const header = lines[0];
    const sep = header.includes(";") ? ";" : (header.includes("\t") ? "\t" : ",");

    // Check if first line is header
    const isFirstLineHeader = /codigo|cliente|nombre|tasa|capital|saldo|dia|monto/i.test(header);
    const dataLines = isFirstLineHeader ? lines.slice(1) : lines;

    return dataLines.map((line, idx) => {
      const parts = line.split(sep).map((p) => p.replace(/^"|"$/g, "").trim());

      let codigo = "";
      let clienteText = "";
      let capital = 0;
      let tasa = 0.03;
      let diaPago = 15;

      for (const val of parts) {
        const v = val.trim();
        if (/^c\d+$/i.test(v) || /^em-\d+$/i.test(v)) {
          codigo = v.toUpperCase();
        } else if (/^\$?\s*[\d,.]+(\.\d+)?$/.test(v) && !v.includes("%")) {
          const num = Number(v.replace(/[$.,\s]/g, ""));
          if (num > 1000) {
            capital = num;
          } else if (num >= 1 && num <= 31 && !diaPago) {
            diaPago = num;
          } else if (num >= 1 && num <= 31) {
            diaPago = num;
          }
        } else if (v.includes("%") || (Number(v) > 0 && Number(v) <= 0.5)) {
          const t = Number(v.replace("%", "").trim());
          tasa = t > 1 ? t / 100 : t;
        } else if (v.length > 2 && isNaN(Number(v))) {
          clienteText = v;
        }
      }

      // If columns are positional fallback
      if (!codigo && parts[0] && /^c\d+/i.test(parts[0])) {
        codigo = parts[0].toUpperCase();
      }

      // Match client
      const normCli = normalizeText(clienteText);
      let matchedCliente = clientes.find((c) => {
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

      const empCli = matchedCliente
        ? inscritos.find((i) => i.cliente_id === matchedCliente.id)
        : null;

      return {
        key: idx,
        codigo: codigo || `C${String(idx + 1).padStart(2, "0")}`,
        clienteText,
        matchedCliente,
        empCli,
        capital: Math.round(capital),
        tasa,
        diaPago: Number(diaPago) || 15,
        valido: !!matchedCliente && capital > 0
      };
    });
  }, [csvRaw, clientes, inscritos]);

  const validCount = parsedCredits.filter((c) => c.valido).length;

  const handleImport = async () => {
    if (parsedCredits.length === 0) {
      toast({ variant: "destructive", title: "Sin datos", description: "Pegue o cargue los datos del CSV primero." });
      return;
    }

    setLoading(true);
    try {
      if (reemplazarExistentes) {
        const existing = await base44.entities.EmprendamosCredito.list("-created_date", 2000).catch(() => []);
        for (const cr of existing) {
          await base44.entities.EmprendamosCredito.delete(cr.id).catch(() => {});
        }
      }

      const clientDebts = {};

      for (let i = 0; i < parsedCredits.length; i++) {
        const p = parsedCredits[i];
        const clienteId = p.matchedCliente?.id || "";
        const emprendamosClienteId = p.empCli?.id || (p.matchedCliente ? `emp_cli_${p.matchedCliente.id}` : "");

        await base44.entities.EmprendamosCredito.create({
          codigo: p.codigo,
          tipo: "cartera_inicial",
          capital: p.capital,
          saldo_capital: p.capital,
          estado: "vigente",
          dia_pago: p.diaPago,
          saldo_intereses: 0,
          notas: "",
          fecha: "2026-08-31",
          fecha_proximo_pago: `2026-09-${String(p.diaPago).padStart(2, "0")}`,
          tasa_nominal: p.tasa,
          concepto: `Saldo inicial cartera a 31 de agosto — ${p.codigo}`,
          comprobante_id: "",
          cuota_fija: 0,
          cliente_id: clienteId,
          producto_credito_id: "",
          emprendamos_cliente_id: emprendamosClienteId,
          created_date: "2026-08-31T00:00:00.000Z",
          updated_date: "2026-08-31T00:00:00.000Z",
          is_sample: false
        });

        if (emprendamosClienteId) {
          clientDebts[emprendamosClienteId] = (clientDebts[emprendamosClienteId] || 0) + p.capital;
        }
      }

      // Update clients debt
      for (const [empId, totalCap] of Object.entries(clientDebts)) {
        await base44.entities.EmprendamosCliente.update(empId, {
          saldo_deuda: totalCap,
          capital_inicial: totalCap
        }).catch(() => {});
      }

      toast({
        title: "¡Créditos importados con éxito!",
        description: `Se montaron ${parsedCredits.length} créditos a corte 31 de agosto.`
      });

      if (onSuccess) onSuccess();
      onOpenChange(false);
      setCsvRaw("");
    } catch (err) {
      console.error(err);
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
            Importar Créditos Emprendamos (CSV)
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto flex-1 pr-1">
          <p className="text-xs text-muted-foreground">
            Pegue el contenido del CSV o suba el archivo con los 34 créditos. El sistema detectará automáticamente el código (C01, C02...), el cliente, la tasa, el saldo inicial (a 31 de agosto) y el día de pago.
          </p>

          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="csvFile" className="cursor-pointer inline-flex items-center gap-2 border rounded-md px-3 py-2 text-xs hover:bg-muted/50">
              <Upload className="w-4 h-4 text-muted-foreground" />
              Seleccionar archivo .csv
            </Label>
            <input
              id="csvFile"
              type="file"
              accept=".csv,.txt"
              className="hidden"
              onChange={handleFileUpload}
            />

            <div className="flex items-center gap-2">
              <Checkbox
                id="reemplazar"
                checked={reemplazarExistentes}
                onCheckedChange={setReemplazarExistentes}
              />
              <Label htmlFor="reemplazar" className="text-xs font-normal cursor-pointer">
                Eliminar créditos existentes antes de montar
              </Label>
            </div>
          </div>

          <div>
            <Label className="text-xs font-medium mb-1 block">Pegar datos CSV aquí:</Label>
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
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">
                  Previsualización: {parsedCredits.length} créditos detectados
                </span>
                <Badge variant={validCount === parsedCredits.length ? "default" : "secondary"} className="text-xs">
                  {validCount} / {parsedCredits.length} listos para vincular
                </Badge>
              </div>

              <div className="max-h-52 overflow-y-auto border rounded bg-background">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted text-[10px] text-muted-foreground uppercase sticky top-0">
                    <tr>
                      <th className="p-2">Código</th>
                      <th className="p-2">Cliente CSV</th>
                      <th className="p-2">Cliente Vinculado</th>
                      <th className="p-2 text-right">Saldo Inicial (31 Ago)</th>
                      <th className="p-2 text-center">Tasa</th>
                      <th className="p-2 text-center">Día Pago</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {parsedCredits.map((c) => (
                      <tr key={c.key} className={c.valido ? "hover:bg-muted/30" : "bg-destructive/5"}>
                        <td className="p-2 font-mono font-bold text-primary">{c.codigo}</td>
                        <td className="p-2">{c.clienteText || "—"}</td>
                        <td className="p-2">
                          {c.matchedCliente ? (
                            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              {c.matchedCliente.nombre}
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                              <AlertCircle className="w-3.5 h-3.5" />
                              Sin coincidencia
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
            {loading ? "Montando créditos..." : `Montar e Insertar ${parsedCredits.length} Créditos`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
