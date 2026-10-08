import React, { useState, useMemo } from "react";
import * as XLSX from "xlsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Search,
  ExternalLink,
  Layers,
  HelpCircle,
  Calendar
} from "lucide-react";
import { formatCOP, formatDate, BANCO_NAMES } from "@/lib/contabilidad";
import { Link } from "react-router-dom";

// Limpiar y normalizar texto
function normalizeText(str) {
  if (!str) return "";
  return String(str)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

// Parser numérico tolerante a monedas y formatos
function parseNumber(val) {
  if (typeof val === "number") return val;
  if (!val) return 0;
  let clean = String(val).replace(/[$€\s]/g, "").trim();
  // Formato tipo 15.000.000,00 (Colombia / Europa)
  if (/\.\d{3},\d+$/.test(clean) || (clean.includes(".") && clean.includes(",") && clean.indexOf(".") < clean.indexOf(","))) {
    clean = clean.replace(/\./g, "").replace(",", ".");
  } else if (/,\d{3}\.\d+$/.test(clean) || (clean.includes(",") && clean.includes(".") && clean.indexOf(",") < clean.indexOf("."))) {
    // 15,000,000.00
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

// Parser de fechas flexible (YYYY-MM-DD, DD/MM/YYYY, etc.)
function parseFechaStandard(val) {
  if (!val) return "";
  const s = String(val).trim();
  // Formato ISO ya existente YYYY-MM-DD
  const mIso = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (mIso) {
    const y = mIso[1];
    const m = mIso[2].padStart(2, "0");
    const d = mIso[3].padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  // Formato DD/MM/YYYY o DD-MM-YYYY
  const mLat = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (mLat) {
    const d = mLat[1].padStart(2, "0");
    const m = mLat[2].padStart(2, "0");
    const y = mLat[3];
    return `${y}-${m}-${d}`;
  }
  // Timestamp numérico de Excel
  const numDate = Number(s);
  if (!isNaN(numDate) && numDate > 30000 && numDate < 60000) {
    const excelDate = new Date(Math.round((numDate - 25569) * 86400 * 1000));
    return excelDate.toISOString().substring(0, 10);
  }
  return s;
}

// Extraer el código / sufijo CDA: "CDA - 7757", "CDA-7757", "7757" -> "7757"
function extractCdaKey(str) {
  if (!str) return "";
  const clean = String(str).trim();
  // Busca 4 dígitos que correspondan a la cuenta
  const m = clean.match(/(\d{4,})/);
  if (m) return m[1];
  return clean.toUpperCase().replace(/\s+/g, "");
}

export default function ConciliarCdaDialog({
  open,
  onOpenChange,
  cuentas = [],
  movimientos = []
}) {
  const [csvRaw, setCsvRaw] = useState("");
  const [cdaFiltro, setCdaFiltro] = useState("todas");
  const [estadoFiltro, setEstadoFiltro] = useState("todos"); // todos, coincidente, diferencia_fecha, no_encontrado
  const [toleranciaDias, setToleranciaDias] = useState(3);
  const [busqueda, setBusqueda] = useState("");
  const [mostrarSoloCargados, setMostrarSoloCargados] = useState(false);

  // Mapa de CDAs indexado por sufijo de 4 dígitos, número completo, y ID
  const cdaMap = useMemo(() => {
    const map = new Map();
    cuentas.forEach((c) => {
      // 1. Por ID
      map.set(String(c.id), c);
      // 2. Por sufijo de nombre: ej "CDA - 7757" -> "7757"
      const suffixMatch = (c.nombre || "").match(/(\d{4,})/);
      if (suffixMatch) map.set(suffixMatch[1], c);
      // 3. Por número completo limpio
      if (c.numero_completo) {
        const numClean = c.numero_completo.replace(/\D/g, "");
        map.set(numClean, c);
        if (numClean.length >= 4) {
          map.set(numClean.slice(-4), c);
        }
      }
      // 4. Por subcuenta PUC
      if (c.subcuenta_puc) {
        map.set(String(c.subcuenta_puc), c);
      }
      // 5. Por nombre completo normalizado
      map.set(normalizeText(c.nombre), c);
    });
    return map;
  }, [cuentas]);

  // Carga de archivo CSV / Excel / TXT
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
    }
  };

  // Parsear filas del CSV
  const partidasCSV = useMemo(() => {
    if (!csvRaw || !csvRaw.trim()) return [];

    const lines = csvRaw.trim().split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) return [];

    const header = lines[0];
    let sep = ",";
    if (header.includes(";")) sep = ";";
    else if (header.includes("\t")) sep = "\t";
    else if (header.includes("|")) sep = "|";

    // Mapeo dinámico de encabezados:
    // Cuenta (formato CDA - ), fecha, descripcion, referencia, valor
    const isFirstLineHeader = /cuenta|cda|fecha|descripcion|referencia|valor|monto/i.test(header);
    let colMap = null;
    if (isFirstLineHeader) {
      const hParts = header.split(sep).map((p) => normalizeText(p.replace(/^"|"$/g, "")));
      colMap = {
        cuenta: hParts.findIndex((p) => p.includes("cuen") || p.includes("cda") || p.includes("banco")),
        fecha: hParts.findIndex((p) => p.includes("fec") || p.includes("date")),
        descripcion: hParts.findIndex((p) => p.includes("desc") || p.includes("conc") || p.includes("deta")),
        referencia: hParts.findIndex((p) => p.includes("ref")),
        valor: hParts.findIndex((p) => p.includes("val") || p.includes("mon") || p.includes("imp") || p.includes("sal"))
      };
    }

    const dataLines = isFirstLineHeader ? lines.slice(1) : lines;

    return dataLines.map((line, idx) => {
      const parts = line.split(sep).map((p) => p.replace(/^"|"$/g, "").trim());

      let cuentaRaw = "";
      let fechaRaw = "";
      let descripcionRaw = "";
      let referenciaRaw = "";
      let valorRaw = 0;

      if (colMap && colMap.cuenta >= 0 && parts[colMap.cuenta] !== undefined) {
        cuentaRaw = parts[colMap.cuenta];
      } else if (parts[0]) {
        cuentaRaw = parts[0];
      }

      if (colMap && colMap.fecha >= 0 && parts[colMap.fecha] !== undefined) {
        fechaRaw = parts[colMap.fecha];
      } else if (parts[1]) {
        fechaRaw = parts[1];
      }

      if (colMap && colMap.descripcion >= 0 && parts[colMap.descripcion] !== undefined) {
        descripcionRaw = parts[colMap.descripcion];
      } else if (parts[2]) {
        descripcionRaw = parts[2];
      }

      if (colMap && colMap.referencia >= 0 && parts[colMap.referencia] !== undefined) {
        referenciaRaw = parts[colMap.referencia];
      } else if (parts[3] && !colMap) {
        referenciaRaw = parts[3];
      }

      if (colMap && colMap.valor >= 0 && parts[colMap.valor] !== undefined) {
        valorRaw = parseNumber(parts[colMap.valor]);
      } else {
        // Fallback: última columna con número o columna 4
        const valCol = parts[4] !== undefined ? parts[4] : parts[parts.length - 1];
        valorRaw = parseNumber(valCol);
      }

      const cdaKey = extractCdaKey(cuentaRaw);
      const cdaObjeto =
        cdaMap.get(cdaKey) ||
        cdaMap.get(normalizeText(cuentaRaw)) ||
        cuentas.find((c) => {
          const cSuffix = (c.nombre || "").match(/(\d{4,})/)?.[1];
          return cSuffix && cSuffix === cdaKey;
        }) ||
        null;

      const fechaStandard = parseFechaStandard(fechaRaw);

      return {
        id: `csv-${idx}`,
        linea_idx: idx + 1,
        cuentaRaw,
        cdaKey,
        cdaObjeto,
        fechaRaw,
        fechaStandard,
        descripcionRaw,
        referenciaRaw,
        valorAbsoluto: Math.abs(valorRaw),
        valorConSigno: valorRaw
      };
    });
  }, [csvRaw, cdaMap, cuentas]);

  // Indexar los movimientos del sistema asociados a CDA (por cuenta_ahorro_id y por subcuenta 1110)
  const movimientosCda = useMemo(() => {
    return movimientos.filter((m) => {
      if (m.estado && m.estado !== "activo") return false;
      if (m.cuenta_ahorro_id) return true;
      if (m.subcuenta && String(m.subcuenta).startsWith("1110")) return true;
      return false;
    });
  }, [movimientos]);

  // Mapa de movimientos agrupados por CDA (o subcuenta)
  const movsPorCdaMap = useMemo(() => {
    const map = new Map();
    movimientosCda.forEach((m) => {
      // Intentar vincular con el ID de la CDA
      let cdaId = m.cuenta_ahorro_id;
      if (!cdaId && m.subcuenta) {
        const cdaEncontrada = cuentas.find((c) => String(c.subcuenta_puc) === String(m.subcuenta).trim());
        if (cdaEncontrada) cdaId = cdaEncontrada.id;
      }

      if (cdaId) {
        if (!map.has(cdaId)) map.set(cdaId, []);
        map.get(cdaId).push(m);
      }
    });
    return map;
  }, [movimientosCda, cuentas]);

  // Cruce de conciliación: partida CSV <-> movimiento contable en el sistema
  const resultadosConciliacion = useMemo(() => {
    if (partidasCSV.length === 0) return [];

    // Trackear qué movimientos del sistema ya fueron emparejados para no duplicar matches
    const movsEmparejadosIds = new Set();

    return partidasCSV.map((p) => {
      if (!p.cdaObjeto) {
        return {
          ...p,
          estado: "cda_no_encontrada",
          movimientoMatch: null,
          diferenciaDias: null,
          diferenciaValor: null,
          mensaje: `Cuenta "${p.cuentaRaw}" no coincide con ninguna CDA registrada`
        };
      }

      const candidatos = (movsPorCdaMap.get(p.cdaObjeto.id) || []).filter(
        (m) => !movsEmparejadosIds.has(m.id)
      );

      // Calcular valor contable efectivo del movimiento (débito - crédito o valor absoluto)
      const pVal = p.valorAbsoluto;

      // 1. MATCH EXACTO: Mismo valor (tolerancia < 1 COP) y misma fecha exacta
      const matchExacto = candidatos.find((m) => {
        const valMov = Math.abs((Number(m.debito) || 0) - (Number(m.credito) || 0));
        const diffVal = Math.abs(valMov - pVal);
        const mismaFecha = p.fechaStandard && m.fecha && m.fecha.substring(0, 10) === p.fechaStandard;
        return diffVal <= 1 && mismaFecha;
      });

      if (matchExacto) {
        movsEmparejadosIds.add(matchExacto.id);
        return {
          ...p,
          estado: "conciliado_exacto",
          movimientoMatch: matchExacto,
          diferenciaDias: 0,
          diferenciaValor: 0,
          mensaje: "Partida reflejada exactamente en sistema"
        };
      }

      // 2. MATCH POR VALOR CON DIFERENCIA DE FECHAS (dentro de tolerancia configurable)
      const candidatosMismoValor = candidatos.filter((m) => {
        const valMov = Math.abs((Number(m.debito) || 0) - (Number(m.credito) || 0));
        return Math.abs(valMov - pVal) <= 1;
      });

      if (candidatosMismoValor.length > 0 && p.fechaStandard) {
        const pDate = new Date(p.fechaStandard);
        let mejorCandidato = null;
        let menorDiffDias = Infinity;

        candidatosMismoValor.forEach((m) => {
          if (m.fecha) {
            const mDate = new Date(m.fecha.substring(0, 10));
            const diffMs = Math.abs(pDate.getTime() - mDate.getTime());
            const diffDias = Math.round(diffMs / (1000 * 60 * 60 * 24));
            if (diffDias < menorDiffDias) {
              menorDiffDias = diffDias;
              mejorCandidato = m;
            }
          }
        });

        if (mejorCandidato && menorDiffDias <= toleranciaDias) {
          movsEmparejadosIds.add(mejorCandidato.id);
          return {
            ...p,
            estado: "diferencia_fecha",
            movimientoMatch: mejorCandidato,
            diferenciaDias: menorDiffDias,
            diferenciaValor: 0,
            mensaje: `Reflejado en sistema con desfase de ${menorDiffDias} día(s) (${mejorCandidato.fecha})`
          };
        }
      }

      // 3. MATCH POR FECHA Y DESCRIPCIÓN CON DIFERENCIA EN VALOR
      if (p.fechaStandard) {
        const candidatosMismaFecha = candidatos.filter(
          (m) => m.fecha && m.fecha.substring(0, 10) === p.fechaStandard
        );
        const matchParcial = candidatosMismaFecha.find((m) => {
          const valMov = Math.abs((Number(m.debito) || 0) - (Number(m.credito) || 0));
          const diffVal = Math.abs(valMov - pVal);
          // Si difiere en menos del 10% o menos de $10.000
          return diffVal > 1 && (diffVal <= 10000 || diffVal / pVal < 0.1);
        });

        if (matchParcial) {
          const valMov = Math.abs((Number(matchParcial.debito) || 0) - (Number(matchParcial.credito) || 0));
          return {
            ...p,
            estado: "diferencia_valor",
            movimientoMatch: matchParcial,
            diferenciaDias: 0,
            diferenciaValor: valMov - pVal,
            mensaje: `Misma fecha pero diferencia de valor de ${formatCOP(Math.abs(valMov - pVal))}`
          };
        }
      }

      // 4. NO ENCONTRADO EN SISTEMA (Partida faltante o pendiente)
      return {
        ...p,
        estado: "no_encontrado",
        movimientoMatch: null,
        diferenciaDias: null,
        diferenciaValor: null,
        mensaje: "Esta partida NO se encuentra reflejada en los movimientos contables"
      };
    });
  }, [partidasCSV, movsPorCdaMap, toleranciaDias]);

  // Resumen numérico y estadístico
  const metricas = useMemo(() => {
    const total = resultadosConciliacion.length;
    const exactos = resultadosConciliacion.filter((r) => r.estado === "conciliado_exacto").length;
    const conDesfaseFecha = resultadosConciliacion.filter((r) => r.estado === "diferencia_fecha").length;
    const reflejados = exactos + conDesfaseFecha;
    const noEncontrados = resultadosConciliacion.filter((r) => r.estado === "no_encontrado").length;
    const cdaNoEncontradas = resultadosConciliacion.filter((r) => r.estado === "cda_no_encontrada").length;
    const diferenciaValor = resultadosConciliacion.filter((r) => r.estado === "diferencia_valor").length;

    const valorTotalCSV = resultadosConciliacion.reduce((s, r) => s + r.valorAbsoluto, 0);
    const valorReflejado = resultadosConciliacion
      .filter((r) => r.estado === "conciliado_exacto" || r.estado === "diferencia_fecha")
      .reduce((s, r) => s + r.valorAbsoluto, 0);
    const valorPendiente = valorTotalCSV - valorReflejado;

    const pctReflejado = total > 0 ? Math.round((reflejados / total) * 100) : 0;

    return {
      total,
      exactos,
      conDesfaseFecha,
      reflejados,
      noEncontrados,
      cdaNoEncontradas,
      diferenciaValor,
      valorTotalCSV,
      valorReflejado,
      valorPendiente,
      pctReflejado
    };
  }, [resultadosConciliacion]);

  // Filtrado de partidas para la tabla
  const partidasFiltradas = useMemo(() => {
    return resultadosConciliacion.filter((r) => {
      // Filtro por CDA
      if (cdaFiltro !== "todas") {
        if (!r.cdaObjeto || String(r.cdaObjeto.id) !== cdaFiltro) return false;
      }
      // Filtro por Estado
      if (estadoFiltro === "reflejado") {
        if (r.estado !== "conciliado_exacto" && r.estado !== "diferencia_fecha") return false;
      } else if (estadoFiltro === "no_reflejado") {
        if (r.estado !== "no_encontrado" && r.estado !== "cda_no_encontrada" && r.estado !== "diferencia_valor") return false;
      } else if (estadoFiltro !== "todos") {
        if (r.estado !== estadoFiltro) return false;
      }
      // Filtro por texto / búsqueda
      if (busqueda.trim()) {
        const q = normalizeText(busqueda);
        const campos = [
          r.cuentaRaw,
          r.cdaObjeto?.nombre || "",
          r.cdaObjeto?.subcuenta_puc || "",
          r.descripcionRaw,
          r.referenciaRaw,
          r.fechaStandard,
          String(r.valorAbsoluto),
          r.movimientoMatch?.descripcion || ""
        ].map(normalizeText);
        if (!campos.some((c) => c.includes(q))) return false;
      }
      return true;
    });
  }, [resultadosConciliacion, cdaFiltro, estadoFiltro, busqueda]);

  // Ejemplo de plantilla para el usuario
  const cargarEjemploPlantilla = () => {
    const ejemplo = [
      "Cuenta,fecha,descripcion,referencia,valor",
      "CDA - 7757,2026-09-23,abono,REF1234,2581441",
      "CDA - 7856,2026-09-24,abono,REF5678,3800000",
      "CDA - 8154,2026-09-23,abono,,1761053",
      "CDA - 2436,2026-09-24,abono,TRANSF-99,40557",
      "CDA - 7757,2026-09-01,Abono pakredito,REF889,2000000",
      "CDA - 6005,2026-09-01,Abono Emprendamos,,600000",
      "CDA - 7757,2026-09-30,Gasto comision bancaria,GTO-01,25000"
    ].join("\n");
    setCsvRaw(ejemplo);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] flex flex-col p-0 overflow-hidden">
        {/* Cabecera */}
        <DialogHeader className="p-5 pb-3 border-b border-border bg-card">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <DialogTitle className="text-xl font-heading font-bold flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-primary" />
                Conciliación de Cuentas de Ahorro (CDA)
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Ingresa o pega tu archivo CSV / Excel con las partidas de los extractos y corrobora si están reflejadas en el sistema.
              </p>
            </div>
            {partidasCSV.length > 0 && (
              <div className="flex items-center gap-2">
                <Badge
                  variant={metricas.pctReflejado === 100 ? "default" : metricas.pctReflejado >= 80 ? "secondary" : "destructive"}
                  className="text-xs px-2.5 py-1 font-mono"
                >
                  {metricas.reflejados} de {metricas.total} reflejadas ({metricas.pctReflejado}%)
                </Badge>
              </div>
            )}
          </div>
        </DialogHeader>

        {/* Cuerpo con scroll */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Zona de entrada de datos (Pegar CSV o Subir Archivo) */}
          <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Upload className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold">Cargar Archivo de Partidas CDA</span>
                <span className="text-xs text-muted-foreground">
                  (Encabezados: Cuenta, fecha, descripcion, referencia, valor)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={cargarEjemploPlantilla}
                  className="text-xs h-7 gap-1"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  Cargar Ejemplo
                </Button>
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls,.txt"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <Button type="button" size="sm" variant="secondary" className="text-xs h-7 gap-1 pointer-events-none">
                    <Upload className="w-3.5 h-3.5" />
                    Subir archivo (.csv / .xlsx)
                  </Button>
                </label>
              </div>
            </div>

            <Textarea
              value={csvRaw}
              onChange={(e) => setCsvRaw(e.target.value)}
              placeholder={`Pega aquí el contenido de tu CSV o Excel...\nEjemplo:\nCuenta,fecha,descripcion,referencia,valor\nCDA - 7757,2026-09-23,abono,,2581441\nCDA - 7856,2026-09-24,abono,,3800000`}
              rows={csvRaw ? 4 : 3}
              className="font-mono text-xs bg-background"
            />

            {csvRaw && (
              <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                <span>
                  {partidasCSV.length} partida(s) detectada(s) en el archivo. Formato reconocido:{" "}
                  <code className="bg-muted px-1 py-0.5 rounded text-[11px]">Cuenta · Fecha · Descripción · Valor</code>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCsvRaw("")}
                  className="h-6 text-xs text-destructive hover:bg-destructive/10"
                >
                  Limpiar
                </Button>
              </div>
            )}
          </div>

          {/* Si hay partidas cargadas: Mostrar métricas de resumen y filtros */}
          {partidasCSV.length > 0 && (
            <>
              {/* Tarjetas de Métricas */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-lg border border-border bg-card p-3">
                  <div className="text-[10px] uppercase font-semibold text-muted-foreground flex items-center justify-between">
                    <span>Total Partidas</span>
                    <Layers className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                  <div className="text-xl font-heading font-bold mt-1">{metricas.total}</div>
                  <div className="text-xs text-muted-foreground font-mono mt-0.5">
                    {formatCOP(metricas.valorTotalCSV)}
                  </div>
                </div>

                <div className="rounded-lg border border-success/30 bg-success/5 p-3">
                  <div className="text-[10px] uppercase font-semibold text-success flex items-center justify-between">
                    <span>Reflejadas en Sistema</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                  </div>
                  <div className="text-xl font-heading font-bold text-success mt-1">
                    {metricas.reflejados}{" "}
                    <span className="text-xs font-normal text-muted-foreground">({metricas.pctReflejado}%)</span>
                  </div>
                  <div className="text-xs text-success/80 font-mono mt-0.5">
                    {formatCOP(metricas.valorReflejado)}
                  </div>
                </div>

                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                  <div className="text-[10px] uppercase font-semibold text-destructive flex items-center justify-between">
                    <span>No Reflejadas</span>
                    <XCircle className="w-3.5 h-3.5 text-destructive" />
                  </div>
                  <div className="text-xl font-heading font-bold text-destructive mt-1">
                    {metricas.noEncontrados + metricas.cdaNoEncontradas}
                  </div>
                  <div className="text-xs text-destructive/80 font-mono mt-0.5">
                    {formatCOP(metricas.valorPendiente)}
                  </div>
                </div>

                <div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
                  <div className="text-[10px] uppercase font-semibold text-warning flex items-center justify-between">
                    <span>Con Desfase de Días</span>
                    <Calendar className="w-3.5 h-3.5 text-warning" />
                  </div>
                  <div className="text-xl font-heading font-bold text-warning mt-1">
                    {metricas.conDesfaseFecha}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Mismo valor (±{toleranciaDias} días)
                  </div>
                </div>
              </div>

              {/* Barra de Filtros y Búsqueda */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-2 border-t border-border">
                <div className="flex flex-wrap items-center gap-2 flex-1">
                  {/* Filtro por CDA */}
                  <Select value={cdaFiltro} onValueChange={setCdaFiltro}>
                    <SelectTrigger className="w-full sm:w-[200px] h-8 text-xs">
                      <SelectValue placeholder="Todas las cuentas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">Todas las CDA ({cuentas.length})</SelectItem>
                      {cuentas.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nombre} · {BANCO_NAMES[c.banco] || c.banco} ({c.subcuenta_puc})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Filtro por Estado */}
                  <Select value={estadoFiltro} onValueChange={setEstadoFiltro}>
                    <SelectTrigger className="w-full sm:w-[180px] h-8 text-xs">
                      <SelectValue placeholder="Todos los estados" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos ({metricas.total})</SelectItem>
                      <SelectItem value="reflejado">Reflejadas ✓ ({metricas.reflejados})</SelectItem>
                      <SelectItem value="no_reflejado">No Reflejadas ✗ ({metricas.noEncontrados + metricas.cdaNoEncontradas})</SelectItem>
                      <SelectItem value="conciliado_exacto">Exactas ({metricas.exactos})</SelectItem>
                      <SelectItem value="diferencia_fecha">Con desfase de fecha ({metricas.conDesfaseFecha})</SelectItem>
                      <SelectItem value="no_encontrado">Faltantes en sistema ({metricas.noEncontrados})</SelectItem>
                      <SelectItem value="cda_no_encontrada">CDA no identificada ({metricas.cdaNoEncontradas})</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Tolerancia de días */}
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/40 px-2 py-1 rounded border border-border">
                    <span>Tolerancia fecha:</span>
                    <select
                      value={toleranciaDias}
                      onChange={(e) => setToleranciaDias(Number(e.target.value))}
                      className="bg-background text-foreground text-xs rounded border border-border px-1 py-0.5"
                    >
                      <option value={0}>0 días (exacta)</option>
                      <option value={1}>±1 día</option>
                      <option value={3}>±3 días</option>
                      <option value={7}>±7 días</option>
                      <option value={15}>±15 días</option>
                    </select>
                  </div>
                </div>

                {/* Búsqueda rápida */}
                <div className="relative w-full sm:w-[220px]">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Filtrar por texto, valor..."
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    className="pl-8 h-8 text-xs"
                  />
                </div>
              </div>

              {/* Tabla de Conciliación de Partidas */}
              <div className="rounded-lg border border-border overflow-hidden bg-card">
                <div className="overflow-x-auto max-h-[380px]">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/80 text-muted-foreground font-semibold sticky top-0 z-10 border-b border-border">
                      <tr>
                        <th className="py-2 px-3 text-left w-12">#</th>
                        <th className="py-2 px-3 text-left">Cuenta CSV</th>
                        <th className="py-2 px-3 text-left">CDA Sistema</th>
                        <th className="py-2 px-3 text-left">Fecha CSV</th>
                        <th className="py-2 px-3 text-left">Descripción CSV</th>
                        <th className="py-2 px-3 text-right">Valor CSV</th>
                        <th className="py-2 px-3 text-center">Estado</th>
                        <th className="py-2 px-3 text-left">Movimiento Reflejado en Sistema</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {partidasFiltradas.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-8 text-center text-muted-foreground">
                            No hay partidas que coincidan con los filtros seleccionados.
                          </td>
                        </tr>
                      ) : (
                        partidasFiltradas.map((item) => {
                          const esExacto = item.estado === "conciliado_exacto";
                          const esFecha = item.estado === "diferencia_fecha";
                          const esReflejado = esExacto || esFecha;
                          const esNoEncontrado = item.estado === "no_encontrado";
                          const esCdaInvalida = item.estado === "cda_no_encontrada";

                          return (
                            <tr
                              key={item.id}
                              className={`transition-colors hover:bg-muted/30 ${
                                esReflejado ? "bg-success/5" : esNoEncontrado ? "bg-destructive/5" : ""
                              }`}
                            >
                              <td className="py-2.5 px-3 text-muted-foreground font-mono">
                                {item.linea_idx}
                              </td>

                              <td className="py-2.5 px-3 font-semibold">
                                <span className="font-mono bg-muted/60 px-1.5 py-0.5 rounded text-[11px]">
                                  {item.cuentaRaw}
                                </span>
                              </td>

                              <td className="py-2.5 px-3">
                                {item.cdaObjeto ? (
                                  <div>
                                    <div className="font-semibold text-foreground">
                                      {item.cdaObjeto.nombre}
                                    </div>
                                    <div className="text-[11px] text-muted-foreground">
                                      PUC {item.cdaObjeto.subcuenta_puc} · {BANCO_NAMES[item.cdaObjeto.banco] || item.cdaObjeto.banco}
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-destructive font-medium text-[11px] flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3" /> No vinculada
                                  </span>
                                )}
                              </td>

                              <td className="py-2.5 px-3 font-mono whitespace-nowrap">
                                {item.fechaStandard || item.fechaRaw || "—"}
                              </td>

                              <td className="py-2.5 px-3 max-w-[200px] truncate" title={item.descripcionRaw}>
                                <div className="truncate font-medium">{item.descripcionRaw || "—"}</div>
                                {item.referenciaRaw && (
                                  <div className="text-[10px] text-muted-foreground font-mono">
                                    Ref: {item.referenciaRaw}
                                  </div>
                                )}
                              </td>

                              <td className="py-2.5 px-3 text-right font-mono font-semibold whitespace-nowrap">
                                {formatCOP(item.valorAbsoluto)}
                              </td>

                              <td className="py-2.5 px-3 text-center whitespace-nowrap">
                                {esExacto && (
                                  <Badge variant="default" className="bg-success text-success-foreground text-[10px] gap-1">
                                    <CheckCircle2 className="w-3 h-3" /> Reflejado ✓
                                  </Badge>
                                )}
                                {esFecha && (
                                  <Badge variant="secondary" className="bg-warning/20 text-warning text-[10px] border-warning/40 gap-1">
                                    <Calendar className="w-3 h-3" /> ±{item.diferenciaDias}d desfase
                                  </Badge>
                                )}
                                {item.estado === "diferencia_valor" && (
                                  <Badge variant="destructive" className="text-[10px] gap-1">
                                    <AlertTriangle className="w-3 h-3" /> Dif. valor
                                  </Badge>
                                )}
                                {esNoEncontrado && (
                                  <Badge variant="destructive" className="bg-destructive/15 text-destructive border-destructive/30 text-[10px] gap-1">
                                    <XCircle className="w-3 h-3" /> No en sistema
                                  </Badge>
                                )}
                                {esCdaInvalida && (
                                  <Badge variant="outline" className="text-[10px] text-muted-foreground border-dashed">
                                    CDA desconocida
                                  </Badge>
                                )}
                              </td>

                              <td className="py-2.5 px-3">
                                {item.movimientoMatch ? (
                                  <div className="space-y-0.5">
                                    <div className="flex items-center gap-1.5 font-medium">
                                      <span className="font-mono text-primary text-[11px]">
                                        {formatDate(item.movimientoMatch.fecha)}
                                      </span>
                                      <span className="text-muted-foreground">·</span>
                                      <span className="truncate max-w-[180px]">
                                        {item.movimientoMatch.descripcion || "Movimiento contable"}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                      <span className="font-mono">
                                        Subcuenta: {item.movimientoMatch.subcuenta}
                                      </span>
                                      {item.cdaObjeto && (
                                        <Link
                                          to={`/admin/contabilidad/detalle-cuentas?cuenta=${item.cdaObjeto.subcuenta_puc}&cda_id=${item.cdaObjeto.id}`}
                                          className="text-primary hover:underline flex items-center gap-0.5"
                                          target="_blank"
                                        >
                                          Ver libro <ExternalLink className="w-2.5 h-2.5" />
                                        </Link>
                                      )}
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground italic text-[11px]">
                                    {item.mensaje}
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Pie del diálogo */}
        <DialogFooter className="p-4 border-t border-border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            {partidasCSV.length > 0 ? (
              <span>
                Mostrando <b>{partidasFiltradas.length}</b> de <b>{partidasCSV.length}</b> partidas del archivo.
              </span>
            ) : (
              <span>Pega o sube un archivo para iniciar la corroboración automática.</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cerrar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
