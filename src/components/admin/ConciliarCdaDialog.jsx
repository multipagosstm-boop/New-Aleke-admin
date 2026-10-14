import React, { useState, useMemo, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import { base44 } from "@/api/base44Client";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Calendar,
  Copy,
  ArrowRightLeft,
  ShieldAlert,
  Download,
  AlertCircle,
  Clock,
  Sparkles,
  Info,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  CheckSquare,
  Square
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

// Formatear mes en formato legible "Septiembre 2026"
function formatPeriodoNombre(periodo) {
  if (!periodo || periodo === "todos") return "Todos los períodos";
  const [year, month] = periodo.split("-");
  const meses = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];
  const idx = parseInt(month, 10) - 1;
  if (idx >= 0 && idx < 12) {
    return `${meses[idx]} ${year}`;
  }
  return periodo;
}

// Sumar o restar meses a un período YYYY-MM
function shiftPeriodo(periodo, delta) {
  let base = periodo;
  if (!base || base === "todos") {
    base = new Date().toISOString().substring(0, 7);
  }
  const [y, m] = base.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  const ny = d.getFullYear();
  const nm = String(d.getMonth() + 1).padStart(2, "0");
  return `${ny}-${nm}`;
}

export default function ConciliarCdaDialog({
  open,
  onOpenChange,
  cuentas = [],
  movimientos = [],
  defaultPeriodo = ""
}) {
  const [csvRaw, setCsvRaw] = useState("");
  const [periodoFiltro, setPeriodoFiltro] = useState(defaultPeriodo || new Date().toISOString().substring(0, 7));
  const [cdaFiltro, setCdaFiltro] = useState("todas");
  const [estadoFiltroCsv, setEstadoFiltroCsv] = useState("todos"); // todos, coincidente, diferencia_fecha, no_encontrado
  const [estadoFiltroSistema, setEstadoFiltroSistema] = useState("todos"); // todos, conciliados, no_en_csv, duplicados, inconsistentes, discordantes, mal_ingresados
  const [filtroTipoAlerta, setFiltroTipoAlerta] = useState("todas");
  const [toleranciaDias, setToleranciaDias] = useState(3);
  const [busqueda, setBusqueda] = useState("");
  const [tabActivo, setTabActivo] = useState("resumen");
  const [filtrarSoloMesActual, setFiltrarSoloMesActual] = useState(true);
  const [movimientosLocal, setMovimientosLocal] = useState(movimientos || []);
  const [cargandoMovs, setCargandoMovs] = useState(false);

  // Sincronizar movimientos si cambian desde la prop
  useEffect(() => {
    if (movimientos && movimientos.length > 0) {
      setMovimientosLocal(movimientos);
    }
  }, [movimientos]);

  // Sincronizar defaultPeriodo cuando se abre el diálogo
  useEffect(() => {
    if (open && defaultPeriodo) {
      setPeriodoFiltro(defaultPeriodo);
    }
  }, [open, defaultPeriodo]);

  // Recarga activa de movimientos contables desde la base de datos
  const recargarMovimientos = useCallback(async () => {
    setCargandoMovs(true);
    try {
      const fresh = await base44.entities.MovimientoContable.filter({ estado: "activo" }, "-fecha", 15000);
      if (fresh && fresh.length > 0) {
        setMovimientosLocal(fresh);
      }
    } catch (e) {
      console.warn("No se pudieron refrescar movimientos contables:", e);
    } finally {
      setCargandoMovs(false);
    }
  }, []);

  const cambiarMes = (delta) => {
    setPeriodoFiltro((prev) => shiftPeriodo(prev, delta));
  };

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
        map.set(String(c.subcuenta_puc).trim(), c);
      }
      // 5. Por nombre completo normalizado
      map.set(normalizeText(c.nombre), c);
    });
    return map;
  }, [cuentas]);

  // Subcuentas PUC válidas para las CDAs
  const cdaSubcuentasSet = useMemo(() => {
    const set = new Set();
    cuentas.forEach((c) => {
      if (c.subcuenta_puc) set.add(String(c.subcuenta_puc).trim());
    });
    return set;
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
      const periodoPartida = fechaStandard && fechaStandard.length >= 7 ? fechaStandard.substring(0, 7) : "";

      return {
        id: `csv-${idx}`,
        linea_idx: idx + 1,
        cuentaRaw,
        cdaKey,
        cdaObjeto,
        fechaRaw,
        fechaStandard,
        periodoPartida,
        descripcionRaw,
        referenciaRaw,
        valorAbsoluto: Math.abs(valorRaw),
        valorConSigno: valorRaw
      };
    });
  }, [csvRaw, cdaMap, cuentas]);

  // Detección automática del período predominante en el CSV
  const periodoDetectadoCsv = useMemo(() => {
    if (partidasCSV.length === 0) return null;
    const conteo = {};
    partidasCSV.forEach((p) => {
      if (p.periodoPartida) {
        conteo[p.periodoPartida] = (conteo[p.periodoPartida] || 0) + 1;
      }
    });
    let mejorPeriodo = null;
    let maxCount = 0;
    for (const [per, count] of Object.entries(conteo)) {
      if (count > maxCount) {
        maxCount = count;
        mejorPeriodo = per;
      }
    }
    return mejorPeriodo ? { periodo: mejorPeriodo, count: maxCount } : null;
  }, [partidasCSV]);

  // Lista de períodos disponibles encontrados en el sistema contable, en el CSV y últimos 24 meses
  const periodosDisponibles = useMemo(() => {
    const set = new Set();
    const hoy = new Date();
    for (let i = -1; i < 24; i++) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      set.add(`${y}-${m}`);
    }
    movimientosLocal.forEach((m) => {
      if (m.fecha && m.fecha.length >= 7) {
        set.add(m.fecha.substring(0, 7));
      }
      if (m.periodo_operacion && m.periodo_operacion.length >= 7) {
        set.add(m.periodo_operacion.substring(0, 7));
      }
    });
    partidasCSV.forEach((p) => {
      if (p.periodoPartida) {
        set.add(p.periodoPartida);
      }
    });

    return Array.from(set).sort().reverse();
  }, [movimientosLocal, partidasCSV]);

  // Indexar y normalizar los movimientos del sistema asociados a CDA
  const todosMovimientosCda = useMemo(() => {
    return movimientosLocal
      .filter((m) => {
        if (m.estado && (m.estado === "inactivo" || m.estado === "anulado" || m.estado === "reversado")) {
          return false;
        }
        if (m.cuenta_ahorro_id) return true;
        if (m.subcuenta && String(m.subcuenta).startsWith("1110")) return true;
        if (m.subcuenta && cdaSubcuentasSet.has(String(m.subcuenta).trim())) return true;
        if (m.cuenta_nombre && /cda|ahorro/i.test(m.cuenta_nombre)) return true;
        return false;
      })
      .map((m) => {
        // Enlazar con objeto CDA
        let cdaAsociada = null;
        if (m.cuenta_ahorro_id) {
          cdaAsociada = cuentas.find((c) => String(c.id) === String(m.cuenta_ahorro_id));
        }
        if (!cdaAsociada && m.subcuenta) {
          cdaAsociada = cuentas.find((c) => String(c.subcuenta_puc).trim() === String(m.subcuenta).trim());
        }
        if (!cdaAsociada && m.cuenta_nombre) {
          const k = extractCdaKey(m.cuenta_nombre);
          if (k) cdaAsociada = cdaMap.get(k);
        }

        const debito = Number(m.debito) || 0;
        const credito = Number(m.credito) || 0;
        const valorEfectivo = Math.abs(debito - credito);
        const fecha = m.fecha ? m.fecha.substring(0, 10) : "";
        const periodo = m.periodo_operacion || (fecha && fecha.length >= 7 ? fecha.substring(0, 7) : "");

        // 1. Verificación de movimiento mal ingresado:
        let esMalIngresado = false;
        let motivoMalIngresado = "";
        if (valorEfectivo <= 0) {
          esMalIngresado = true;
          motivoMalIngresado = "Monto $0 o sin valor especificado (débito y crédito en cero).";
        } else if (debito > 0 && credito > 0) {
          esMalIngresado = true;
          motivoMalIngresado = "Débito y Crédito simultáneos en la misma fila contable (asiento inconsistente).";
        } else if (!fecha || !/^\d{4}-\d{2}-\d{2}/.test(fecha)) {
          esMalIngresado = true;
          motivoMalIngresado = "Fecha no válida o ausente en el sistema contable.";
        } else if (!m.descripcion || !m.descripcion.trim()) {
          esMalIngresado = true;
          motivoMalIngresado = "Movimiento sin descripción o concepto contable.";
        } else if (!cdaAsociada && !m.subcuenta) {
          esMalIngresado = true;
          motivoMalIngresado = "Sin cuenta CDA asignada ni subcuenta contable PUC.";
        }

        // 2. Verificación de cuenta que no corresponde (discordante):
        let cuentaDiscordante = false;
        let motivoDiscordancia = "";
        if (cdaAsociada && m.subcuenta && cdaAsociada.subcuenta_puc) {
          if (String(m.subcuenta).trim() !== String(cdaAsociada.subcuenta_puc).trim()) {
            cuentaDiscordante = true;
            motivoDiscordancia = `Subcuenta contable ${m.subcuenta} no coincide con el PUC oficial ${cdaAsociada.subcuenta_puc} de ${cdaAsociada.nombre}`;
          }
        }

        // Si la descripción menciona otra CDA diferente a la asignada
        if (m.descripcion) {
          const matchOtro = (m.descripcion || "").match(/(?:cda|cuenta|ahorros?)\s*[-–#]?\s*(\d{4,})/i);
          if (matchOtro && matchOtro[1]) {
            const keyDesc = matchOtro[1];
            if (cdaAsociada) {
              const suffixCda = (cdaAsociada.nombre || "").match(/(\d{4,})/)?.[1];
              if (suffixCda && suffixCda !== keyDesc) {
                cuentaDiscordante = true;
                motivoDiscordancia = `Descripción menciona CDA ${keyDesc} pero está contabilizado en ${cdaAsociada.nombre}`;
              }
            } else {
              const referida = cdaMap.get(keyDesc);
              if (referida) {
                cuentaDiscordante = true;
                motivoDiscordancia = `Descripción menciona ${referida.nombre} pero está asentado en subcuenta ${m.subcuenta || 'sin clasificar'}`;
              }
            }
          }
        }

        return {
          ...m,
          cdaAsociada,
          debito,
          credito,
          valorEfectivo,
          fecha,
          periodo,
          esMalIngresado,
          motivoMalIngresado,
          cuentaDiscordante,
          motivoDiscordancia
        };
      });
  }, [movimientosLocal, cuentas, cdaMap, cdaSubcuentasSet]);

  // Movimientos filtrados por período y cuenta
  const movimientosSistemaFiltrados = useMemo(() => {
    return todosMovimientosCda.filter((m) => {
      // Filtro por período
      if (periodoFiltro !== "todos") {
        if (m.periodo !== periodoFiltro) return false;
      }
      // Filtro por CDA
      if (cdaFiltro !== "todas") {
        if (!m.cdaAsociada || String(m.cdaAsociada.id) !== cdaFiltro) return false;
      }
      return true;
    });
  }, [todosMovimientosCda, periodoFiltro, cdaFiltro]);

  // Detección de posibles duplicados en el sistema contable
  // (Mismo valor, misma cuenta, misma fecha o mismo comprobante)
  const duplicadosSistemaMap = useMemo(() => {
    const map = new Map();
    const grupos = {};

    movimientosSistemaFiltrados.forEach((m) => {
      if (m.valorEfectivo <= 0) return;
      const cdaId = m.cdaAsociada ? m.cdaAsociada.id : (m.subcuenta || "sin_cuenta");
      const key = `${cdaId}_${m.fecha}_${m.valorEfectivo}`;
      if (!grupos[key]) grupos[key] = [];
      grupos[key].push(m);
    });

    for (const [key, lista] of Object.entries(grupos)) {
      if (lista.length > 1) {
        lista.forEach((m) => {
          map.set(m.id, {
            cantidad: lista.length,
            idsHermanos: lista.map((x) => x.id).filter((id) => id !== m.id),
            comprobantes: Array.from(new Set(lista.map((x) => x.comprobante_id).filter(Boolean))),
            descripciones: Array.from(new Set(lista.map((x) => x.descripcion).filter(Boolean)))
          });
        });
      }
    }
    return map;
  }, [movimientosSistemaFiltrados]);

  // Partidas CSV efectivas (filtradas por período si está activado)
  const partidasCsvEfectivas = useMemo(() => {
    return partidasCSV.filter((p) => {
      if (filtrarSoloMesActual && periodoFiltro !== "todos") {
        if (p.periodoPartida && p.periodoPartida !== periodoFiltro) {
          return false;
        }
      }
      return true;
    });
  }, [partidasCSV, filtrarSoloMesActual, periodoFiltro]);

  // Agrupación de movimientos contables por CDA para el cruce
  const movsPorCdaMap = useMemo(() => {
    const map = new Map();
    movimientosSistemaFiltrados.forEach((m) => {
      const cdaId = m.cdaAsociada ? m.cdaAsociada.id : null;
      if (cdaId) {
        if (!map.has(cdaId)) map.set(cdaId, []);
        map.get(cdaId).push(m);
      }
    });
    return map;
  }, [movimientosSistemaFiltrados]);

  // =========================================================================
  // CRUCE BIDIRECCIONAL: CSV <-> SISTEMA
  // =========================================================================
  const { resultadosCsv, resultadosSistema, movsEmparejadosIds } = useMemo(() => {
    const emparejados = new Set();
    const matchMapCsvToMov = new Map();
    const matchMapMovToCsv = new Map();

    // 1. EVALUAR CADA PARTIDA DEL CSV
    const resCsv = partidasCsvEfectivas.map((p) => {
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

      // Candidatos en sistema para esta CDA que no hayan sido ya emparejados
      const candidatos = (movsPorCdaMap.get(p.cdaObjeto.id) || []).filter(
        (m) => !emparejados.has(m.id)
      );

      const pVal = p.valorAbsoluto;

      // 1. MATCH EXACTO: Mismo valor (< 1 COP de dif) y misma fecha exacta
      const matchExacto = candidatos.find((m) => {
        const valMov = m.valorEfectivo;
        const diffVal = Math.abs(valMov - pVal);
        const mismaFecha = p.fechaStandard && m.fecha === p.fechaStandard;
        return diffVal <= 1 && mismaFecha;
      });

      if (matchExacto) {
        emparejados.add(matchExacto.id);
        matchMapCsvToMov.set(p.id, matchExacto);
        matchMapMovToCsv.set(matchExacto.id, p);
        return {
          ...p,
          estado: "conciliado_exacto",
          movimientoMatch: matchExacto,
          diferenciaDias: 0,
          diferenciaValor: 0,
          mensaje: "Partida reflejada exactamente en el sistema contable"
        };
      }

      // 2. MATCH POR VALOR CON DESFASE DE FECHAS (dentro de tolerancia configurada)
      const candidatosMismoValor = candidatos.filter((m) => {
        return Math.abs(m.valorEfectivo - pVal) <= 1;
      });

      if (candidatosMismoValor.length > 0 && p.fechaStandard) {
        const pDate = new Date(p.fechaStandard);
        let mejorCandidato = null;
        let menorDiffDias = Infinity;

        candidatosMismoValor.forEach((m) => {
          if (m.fecha) {
            const mDate = new Date(m.fecha);
            const diffMs = Math.abs(pDate.getTime() - mDate.getTime());
            const diffDias = Math.round(diffMs / (1000 * 60 * 60 * 24));
            if (diffDias < menorDiffDias) {
              menorDiffDias = diffDias;
              mejorCandidato = m;
            }
          }
        });

        if (mejorCandidato && menorDiffDias <= toleranciaDias) {
          emparejados.add(mejorCandidato.id);
          matchMapCsvToMov.set(p.id, mejorCandidato);
          matchMapMovToCsv.set(mejorCandidato.id, p);
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

      // 3. MATCH POR FECHA Y DESCRIPCIÓN CON DIFERENCIA MENOR EN VALOR
      if (p.fechaStandard) {
        const candidatosMismaFecha = candidatos.filter((m) => m.fecha === p.fechaStandard);
        const matchParcial = candidatosMismaFecha.find((m) => {
          const valMov = m.valorEfectivo;
          const diffVal = Math.abs(valMov - pVal);
          return diffVal > 1 && (diffVal <= 5000 || diffVal / pVal < 0.05);
        });

        if (matchParcial) {
          emparejados.add(matchParcial.id);
          matchMapCsvToMov.set(p.id, matchParcial);
          matchMapMovToCsv.set(matchParcial.id, p);
          return {
            ...p,
            estado: "diferencia_valor",
            movimientoMatch: matchParcial,
            diferenciaDias: 0,
            diferenciaValor: matchParcial.valorEfectivo - pVal,
            mensaje: `Misma fecha pero diferencia de valor de ${formatCOP(Math.abs(matchParcial.valorEfectivo - pVal))}`
          };
        }
      }

      // 4. NO ENCONTRADO EN SISTEMA
      return {
        ...p,
        estado: "no_encontrado",
        movimientoMatch: null,
        diferenciaDias: null,
        diferenciaValor: null,
        mensaje: "Esta partida NO se encuentra reflejada en los movimientos contables del período"
      };
    });

    // 2. EVALUAR CADA MOVIMIENTO DEL SISTEMA (¿Aparece en el extracto CSV?)
    const resSistema = movimientosSistemaFiltrados.map((m) => {
      const matchCsv = matchMapMovToCsv.get(m.id) || null;
      const esConciliado = !!matchCsv;
      const dupInfo = duplicadosSistemaMap.get(m.id) || null;
      const esDuplicado = !!dupInfo;

      let estadoSistema = "conciliado";
      let mensajeSistema = "Partida reflejada y conciliada con el extracto bancario";

      if (!esConciliado) {
        estadoSistema = "no_en_csv";
        mensajeSistema = "Registrado en el sistema contable pero NO aparece en el extracto CSV del período";
      }

      if (esDuplicado) {
        estadoSistema = "duplicado";
        mensajeSistema = `Posible movimiento duplicado: existen ${dupInfo.cantidad} registros idénticos en esta fecha/monto`;
      } else if (m.cuentaDiscordante) {
        estadoSistema = "cuenta_discordante";
        mensajeSistema = m.motivoDiscordancia;
      } else if (m.esMalIngresado) {
        estadoSistema = "mal_ingresado";
        mensajeSistema = "Movimiento con valor $0 o datos incompletos";
      }

      return {
        ...m,
        matchCsv,
        esConciliado,
        esDuplicado,
        dupInfo,
        estadoSistema,
        mensajeSistema
      };
    });

    return {
      resultadosCsv: resCsv,
      resultadosSistema: resSistema,
      movsEmparejadosIds: emparejados
    };
  }, [
    partidasCsvEfectivas,
    movimientosSistemaFiltrados,
    movsPorCdaMap,
    duplicadosSistemaMap,
    toleranciaDias
  ]);

  // Resumen numérico y estadístico global
  const metricas = useMemo(() => {
    const totalCsv = resultadosCsv.length;
    const exactosCsv = resultadosCsv.filter((r) => r.estado === "conciliado_exacto").length;
    const fechaCsv = resultadosCsv.filter((r) => r.estado === "diferencia_fecha").length;
    const difValorCsv = resultadosCsv.filter((r) => r.estado === "diferencia_valor").length;
    const reflejadosCsv = exactosCsv + fechaCsv + difValorCsv;
    const faltantesEnSistema = resultadosCsv.filter((r) => r.estado === "no_encontrado" || r.estado === "cda_no_encontrada").length;

    const valorTotalCsv = resultadosCsv.reduce((s, r) => s + r.valorAbsoluto, 0);
    const valorReflejadoCsv = resultadosCsv
      .filter((r) => r.estado === "conciliado_exacto" || r.estado === "diferencia_fecha" || r.estado === "diferencia_valor")
      .reduce((s, r) => s + r.valorAbsoluto, 0);
    const valorFaltanteEnSistema = valorTotalCsv - valorReflejadoCsv;

    // Métricas del sistema contable
    const totalSistema = resultadosSistema.length;
    const conciliadosSistema = resultadosSistema.filter((s) => s.esConciliado).length;
    const sobrantesSistema = resultadosSistema.filter((s) => !s.esConciliado).length;
    const duplicadosSistema = resultadosSistema.filter((s) => s.esDuplicado).length;
    const discordantesSistema = resultadosSistema.filter((s) => s.cuentaDiscordante).length;
    const malIngresadosSistema = resultadosSistema.filter((s) => s.esMalIngresado).length;

    const valorTotalSistema = resultadosSistema.reduce((s, m) => s + m.valorEfectivo, 0);
    const valorConciliadoSistema = resultadosSistema.filter((s) => s.esConciliado).reduce((s, m) => s + m.valorEfectivo, 0);
    const valorSobranteSistema = valorTotalSistema - valorConciliadoSistema;

    // Cuadre neto entre extracto y sistema
    const diferenciaNeta = valorTotalCsv - valorTotalSistema;
    const pctConciliacion = totalCsv > 0 ? Math.round((reflejadosCsv / totalCsv) * 100) : 0;
    const totalAnomalias = duplicadosSistema + discordantesSistema + malIngresadosSistema + faltantesEnSistema + sobrantesSistema;

    return {
      totalCsv,
      exactosCsv,
      fechaCsv,
      reflejadosCsv,
      faltantesEnSistema,
      valorTotalCsv,
      valorReflejadoCsv,
      valorFaltanteEnSistema,
      totalSistema,
      conciliadosSistema,
      sobrantesSistema,
      duplicadosSistema,
      discordantesSistema,
      malIngresadosSistema,
      valorTotalSistema,
      valorConciliadoSistema,
      valorSobranteSistema,
      diferenciaNeta,
      pctConciliacion,
      totalAnomalias
    };
  }, [resultadosCsv, resultadosSistema]);

  // Filtrado de partidas CSV para la tabla
  const partidasCsvFiltradas = useMemo(() => {
    return resultadosCsv.filter((r) => {
      // Filtro por CDA
      if (cdaFiltro !== "todas") {
        if (!r.cdaObjeto || String(r.cdaObjeto.id) !== cdaFiltro) return false;
      }
      // Filtro por Estado
      if (estadoFiltroCsv === "reflejado") {
        if (r.estado !== "conciliado_exacto" && r.estado !== "diferencia_fecha") return false;
      } else if (estadoFiltroCsv === "no_reflejado") {
        if (r.estado !== "no_encontrado" && r.estado !== "cda_no_encontrada" && r.estado !== "diferencia_valor") return false;
      } else if (estadoFiltroCsv !== "todos") {
        if (r.estado !== estadoFiltroCsv) return false;
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
  }, [resultadosCsv, cdaFiltro, estadoFiltroCsv, busqueda]);

  // Filtrado de movimientos del sistema para la tabla
  const movimientosSistemaFiltradosVista = useMemo(() => {
    return resultadosSistema.filter((m) => {
      // Filtro por CDA
      if (cdaFiltro !== "todas") {
        if (!m.cdaAsociada || String(m.cdaAsociada.id) !== cdaFiltro) return false;
      }
      // Filtro por Estado Sistema
      if (estadoFiltroSistema === "conciliados") {
        if (!m.esConciliado) return false;
      } else if (estadoFiltroSistema === "no_en_csv") {
        if (m.esConciliado) return false;
      } else if (estadoFiltroSistema === "duplicados") {
        if (!m.esDuplicado) return false;
      } else if (estadoFiltroSistema === "discordantes") {
        if (!m.cuentaDiscordante) return false;
      } else if (estadoFiltroSistema === "mal_ingresados") {
        if (!m.esMalIngresado) return false;
      } else if (estadoFiltroSistema === "inconsistentes") {
        if (!m.cuentaDiscordante && !m.esMalIngresado && !m.esDuplicado) return false;
      }
      // Filtro por texto
      if (busqueda.trim()) {
        const q = normalizeText(busqueda);
        const campos = [
          m.cdaAsociada?.nombre || "",
          m.subcuenta || "",
          m.descripcion || "",
          m.tercero || "",
          m.fecha,
          String(m.valorEfectivo),
          m.comprobante_id || "",
          m.matchCsv?.cuentaRaw || ""
        ].map(normalizeText);
        if (!campos.some((c) => c.includes(q))) return false;
      }
      return true;
    });
  }, [resultadosSistema, cdaFiltro, estadoFiltroSistema, busqueda]);

  // Lista de auditoría: solo anomalías
  const anomaliasFiltradas = useMemo(() => {
    const items = [];

    // 1. Duplicados en sistema
    resultadosSistema.filter((m) => m.esDuplicado).forEach((m) => {
      items.push({
        tipo: "duplicado_sistema",
        severidad: "alta",
        titulo: "Posible duplicado en sistema contable",
        origen: "Sistema Contable",
        fecha: m.fecha,
        cuenta: m.cdaAsociada?.nombre || `Subcuenta ${m.subcuenta}`,
        valor: m.valorEfectivo,
        descripcion: m.descripcion || "Movimiento contable",
        detalle: `Existen ${m.dupInfo?.cantidad} movimientos con el mismo valor y fecha en el comprobante(s): ${m.dupInfo?.comprobantes.join(', ') || '—'}. ${m.esConciliado ? 'Uno de ellos emparejó con el extracto bancario, los otros son excedentes en libros.' : 'Ninguno se encontró en el extracto bancario.'}`,
        id: `dup-${m.id}`,
        raw: m
      });
    });

    // 2. Cuentas discordantes (no corresponden a la cuenta)
    resultadosSistema.filter((m) => m.cuentaDiscordante).forEach((m) => {
      items.push({
        tipo: "cuenta_discordante",
        severidad: "alta",
        titulo: "Movimiento no corresponde a esta cuenta / Discordante",
        origen: "Sistema Contable",
        fecha: m.fecha,
        cuenta: m.cdaAsociada?.nombre || `Subcuenta ${m.subcuenta}`,
        valor: m.valorEfectivo,
        descripcion: m.descripcion || "Movimiento contable",
        detalle: m.motivoDiscordancia,
        id: `disc-${m.id}`,
        raw: m
      });
    });

    // 3. Movimientos mal ingresados (datos incompletos, $0, etc.)
    resultadosSistema.filter((m) => m.esMalIngresado).forEach((m) => {
      items.push({
        tipo: "mal_ingresado",
        severidad: "alta",
        titulo: "Movimiento contable mal ingresado / incompleto",
        origen: "Sistema Contable",
        fecha: m.fecha,
        cuenta: m.cdaAsociada?.nombre || `Subcuenta ${m.subcuenta}`,
        valor: m.valorEfectivo,
        descripcion: m.descripcion || "Movimiento contable",
        detalle: m.motivoMalIngresado || "Movimiento con datos incompletos o valor $0.",
        id: `mal-${m.id}`,
        raw: m
      });
    });

    // 4. Partidas de extracto faltantes en sistema
    resultadosCsv.filter((r) => r.estado === "no_encontrado" || r.estado === "cda_no_encontrada").forEach((r) => {
      items.push({
        tipo: "faltante_en_sistema",
        severidad: "alta",
        titulo: "Partida de extracto no registrada en contabilidad",
        origen: "Extracto CSV",
        fecha: r.fechaStandard || r.fechaRaw,
        cuenta: r.cdaObjeto?.nombre || r.cuentaRaw,
        valor: r.valorAbsoluto,
        descripcion: r.descripcionRaw || "Partida CSV",
        detalle: r.mensaje,
        id: `csv-no-${r.id}`,
        raw: r
      });
    });

    // 5. Movimientos del sistema no hallados en el extracto
    resultadosSistema.filter((m) => !m.esConciliado && !m.esDuplicado).forEach((m) => {
      items.push({
        tipo: "sobrante_sistema",
        severidad: "baja",
        titulo: "Movimiento contable sin contrapartida en extracto bancario",
        origen: "Sistema Contable",
        fecha: m.fecha,
        cuenta: m.cdaAsociada?.nombre || `Subcuenta ${m.subcuenta}`,
        valor: m.valorEfectivo,
        descripcion: m.descripcion || "Movimiento contable",
        detalle: "Registrado en el sistema contable pero no aparece en el extracto CSV (puede ser un abono/cheque pendiente o movimiento de otra fecha).",
        id: `sob-${m.id}`,
        raw: m
      });
    });

    let res = items;
    if (filtroTipoAlerta !== "todas") {
      res = res.filter((it) => it.tipo === filtroTipoAlerta);
    }

    // Filtro por búsqueda
    if (busqueda.trim()) {
      const q = normalizeText(busqueda);
      return res.filter((it) =>
        normalizeText(it.titulo).includes(q) ||
        normalizeText(it.cuenta).includes(q) ||
        normalizeText(it.descripcion).includes(q) ||
        normalizeText(it.detalle).includes(q) ||
        String(it.valor).includes(q)
      );
    }

    return res;
  }, [resultadosSistema, resultadosCsv, filtroTipoAlerta, busqueda]);

  // Exportar reporte consolidado a Excel
  const handleExportarExcel = () => {
    try {
      const wb = XLSX.utils.book_new();

      // Hoja 1: Resumen
      const resumenData = [
        ["INFORME DE CONCILIACIÓN DE CUENTAS DE AHORRO (CDA)"],
        ["Período evaluado:", formatPeriodoNombre(periodoFiltro)],
        ["Cuenta CDA filtro:", cdaFiltro === "todas" ? "Todas las CDAs" : (cuentas.find((c) => c.id === cdaFiltro)?.nombre || cdaFiltro)],
        ["Fecha de generación:", new Date().toLocaleString()],
        [],
        ["MÉTRICAS CONSOLIDADAS", ""],
        ["Total partidas extracto CSV:", metricas.totalCsv],
        ["Valor total extracto CSV:", metricas.valorTotalCsv],
        ["Partidas reflejadas en sistema:", metricas.reflejadosCsv],
        ["Partidas no encontradas en sistema:", metricas.faltantesEnSistema],
        [],
        ["Total movimientos sistema contable:", metricas.totalSistema],
        ["Valor total sistema contable:", metricas.valorTotalSistema],
        ["Movimientos conciliados con extracto:", metricas.conciliadosSistema],
        ["Movimientos en sistema no reportados en extracto:", metricas.sobrantesSistema],
        ["Posibles duplicados detectados en sistema:", metricas.duplicadosSistema],
        ["Inconsistencias de cuenta o datos:", metricas.discordantesSistema + metricas.malIngresadosSistema],
        [],
        ["DIFERENCIA NETA (Extracto - Contabilidad):", metricas.diferenciaNeta]
      ];
      const wsResumen = XLSX.utils.aoa_to_sheet(resumenData);
      XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen");

      // Hoja 2: Partidas CSV
      if (resultadosCsv.length > 0) {
        const csvRows = resultadosCsv.map((r) => ({
          Linea: r.linea_idx,
          Cuenta_CSV: r.cuentaRaw,
          CDA_Sistema: r.cdaObjeto?.nombre || "No identificada",
          Fecha: r.fechaStandard || r.fechaRaw,
          Descripcion: r.descripcionRaw,
          Referencia: r.referenciaRaw || "",
          Valor: r.valorAbsoluto,
          Estado: r.estado,
          Mensaje: r.mensaje,
          Match_Fecha: r.movimientoMatch?.fecha || "",
          Match_Descripcion: r.movimientoMatch?.descripcion || ""
        }));
        const wsCsv = XLSX.utils.json_to_sheet(csvRows);
        XLSX.utils.book_append_sheet(wb, wsCsv, "Extracto_CSV");
      }

      // Hoja 3: Movimientos Sistema
      if (resultadosSistema.length > 0) {
        const sisRows = resultadosSistema.map((m) => ({
          ID: m.id,
          Fecha: m.fecha,
          CDA: m.cdaAsociada?.nombre || "Sin CDA",
          Subcuenta: m.subcuenta,
          Descripcion: m.descripcion,
          Tercero: m.tercero || "",
          Debito: m.debito,
          Credito: m.credito,
          Valor_Efectivo: m.valorEfectivo,
          Conciliado_En_CSV: m.esConciliado ? "SÍ" : "NO",
          Es_Duplicado: m.esDuplicado ? "SÍ" : "NO",
          Estado_Auditoria: m.estadoSistema,
          Observacion: m.mensajeSistema
        }));
        const wsSis = XLSX.utils.json_to_sheet(sisRows);
        XLSX.utils.book_append_sheet(wb, wsSis, "Sistema_Contable");
      }

      // Hoja 4: Auditoría e Inconsistencias
      if (anomaliasFiltradas.length > 0) {
        const anomRows = anomaliasFiltradas.map((a) => ({
          Tipo: a.tipo,
          Severidad: a.severidad,
          Titulo: a.titulo,
          Origen: a.origen,
          Fecha: a.fecha,
          Cuenta: a.cuenta,
          Valor: a.valor,
          Descripcion: a.descripcion,
          Detalle: a.detalle
        }));
        const wsAnom = XLSX.utils.json_to_sheet(anomRows);
        XLSX.utils.book_append_sheet(wb, wsAnom, "Inconsistencias");
      }

      XLSX.writeFile(wb, `Conciliacion_CDA_${periodoFiltro}_${new Date().toISOString().substring(0, 10)}.xlsx`);
    } catch (err) {
      console.error("Error al exportar Excel:", err);
    }
  };

  // Ejemplo de plantilla para el usuario
  const cargarEjemploPlantilla = () => {
    const ejemplo = [
      "Cuenta,fecha,descripcion,referencia,valor",
      "CDA - 7757,2026-09-23,abono pakredito,REF1234,2581441",
      "CDA - 7856,2026-09-24,abono cliente,REF5678,3800000",
      "CDA - 8154,2026-09-23,abono cuota,,1761053",
      "CDA - 2436,2026-09-24,abono ahorro,TRANSF-99,40557",
      "CDA - 7757,2026-09-01,Abono pakredito cuota,REF889,2000000",
      "CDA - 6005,2026-09-01,Abono Emprendamos cartera,,600000",
      "CDA - 7757,2026-09-30,Gasto comision bancaria,GTO-01,25000"
    ].join("\n");
    setCsvRaw(ejemplo);
    setPeriodoFiltro("2026-09");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[94vh] flex flex-col p-0 overflow-hidden">
        {/* Cabecera */}
        <DialogHeader className="p-5 pb-3 border-b border-border bg-card">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <DialogTitle className="text-xl font-heading font-bold flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-primary" />
                Conciliación Integral de Cuentas de Ahorro (CDA)
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Cruce bidireccional entre extracto bancario y movimientos contables del sistema: detecta partidas faltantes, duplicados e inconsistencias por período.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {metricas.totalCsv > 0 && (
                <Badge
                  variant={metricas.pctConciliacion === 100 && metricas.sobrantesSistema === 0 ? "default" : metricas.pctConciliacion >= 80 ? "secondary" : "destructive"}
                  className="text-xs px-2.5 py-1 font-mono"
                >
                  {metricas.reflejadosCsv} de {metricas.totalCsv} extracto ({metricas.pctConciliacion}%)
                </Badge>
              )}
              {metricas.totalAnomalias > 0 && (
                <Badge variant="outline" className="text-xs border-amber-500/40 text-amber-600 bg-amber-500/10 gap-1 font-mono">
                  <AlertTriangle className="w-3 h-3 text-amber-500" />
                  {metricas.totalAnomalias} alertas
                </Badge>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportarExcel}
                disabled={partidasCSV.length === 0 && movimientosSistemaFiltrados.length === 0}
                className="h-8 text-xs gap-1 border-primary/30 hover:bg-primary/5"
              >
                <Download className="w-3.5 h-3.5 text-primary" />
                Exportar Informe
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Barra de Parámetros Globales (Período, CDA, Tolerancia, Filtros) */}
        <div className="bg-muted/30 border-b border-border px-5 py-3 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            {/* Parámetro 1: Selector de Período / Mes a Comparar */}
            <div className="flex items-center gap-2 bg-background border border-border rounded-lg p-1.5 px-2.5 shadow-sm">
              <Calendar className="w-4 h-4 text-primary flex-shrink-0" />
              <div className="flex flex-col">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold uppercase text-muted-foreground">
                    Período / Mes a Comparar
                  </span>
                  <span className="font-mono text-[10px] font-bold text-primary">
                    {formatPeriodoNombre(periodoFiltro)}
                  </span>
                </div>
                <div className="flex items-center gap-1 mt-1 flex-wrap">
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-7 w-7"
                    onClick={() => cambiarMes(-1)}
                    title="Mes anterior"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </Button>
                  <Input
                    type="month"
                    value={periodoFiltro === "todos" ? "" : periodoFiltro}
                    onChange={(e) => setPeriodoFiltro(e.target.value || "todos")}
                    className="h-7 w-32 text-xs font-mono bg-muted/40 px-2"
                  />
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-7 w-7"
                    onClick={() => cambiarMes(1)}
                    title="Mes siguiente"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                  <Select value={periodoFiltro} onValueChange={setPeriodoFiltro}>
                    <SelectTrigger className="h-7 w-32 text-[11px]">
                      <SelectValue placeholder="Mes rápido" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos los meses</SelectItem>
                      {periodosDisponibles.map((p) => (
                        <SelectItem key={p} value={p}>
                          {formatPeriodoNombre(p)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant={periodoFiltro === new Date().toISOString().substring(0, 7) ? "secondary" : "outline"}
                    className="h-7 text-[11px] px-2"
                    onClick={() => setPeriodoFiltro(new Date().toISOString().substring(0, 7))}
                  >
                    Mes actual
                  </Button>
                  <Button
                    size="sm"
                    variant={periodoFiltro === "todos" ? "secondary" : "ghost"}
                    className="h-7 text-[11px] px-2"
                    onClick={() => setPeriodoFiltro("todos")}
                  >
                    Todos
                  </Button>
                </div>
              </div>
            </div>

            {/* Parámetro 2: Cuenta CDA */}
            <div className="flex items-center gap-2 bg-background border border-border rounded-lg p-1.5 px-2.5 shadow-sm flex-1 sm:max-w-xs">
              <Layers className="w-4 h-4 text-primary flex-shrink-0" />
              <div className="flex flex-col flex-1">
                <span className="text-[10px] font-semibold uppercase text-muted-foreground">Cuenta CDA Evaluada</span>
                <Select value={cdaFiltro} onValueChange={setCdaFiltro}>
                  <SelectTrigger className="h-7 text-xs mt-1 w-full">
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
              </div>
            </div>

            {/* Parámetro 3: Tolerancia de Fechas */}
            <div className="flex items-center gap-2 bg-background border border-border rounded-lg p-1.5 px-2.5 shadow-sm">
              <Clock className="w-4 h-4 text-amber-500 flex-shrink-0" />
              <div className="flex flex-col">
                <span className="text-[10px] font-semibold uppercase text-muted-foreground">Tolerancia Fecha</span>
                <select
                  value={toleranciaDias}
                  onChange={(e) => setToleranciaDias(Number(e.target.value))}
                  className="bg-muted/40 text-foreground text-xs rounded border border-border h-7 px-2 mt-1 font-medium"
                >
                  <option value={0}>0 días (Fecha exacta)</option>
                  <option value={1}>± 1 día</option>
                  <option value={3}>± 3 días (Recomendado)</option>
                  <option value={5}>± 5 días</option>
                  <option value={7}>± 7 días</option>
                  <option value={15}>± 15 días</option>
                </select>
              </div>
            </div>

            {/* Parámetro 4: Botón de recarga de datos contables */}
            <div className="flex items-center">
              <Button
                variant="outline"
                size="sm"
                onClick={recargarMovimientos}
                disabled={cargandoMovs}
                className="h-8 text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/5"
                title="Refrescar movimientos contables desde la base de datos"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${cargandoMovs ? "animate-spin" : ""}`} />
                {cargandoMovs ? "Cargando..." : "Refrescar Libros"}
              </Button>
            </div>
          </div>

          {/* Fila secundaria: Modo de evaluación del CSV y Sugerencia de Período Detectado */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border/50 text-xs text-muted-foreground">
            <div className="flex items-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={() => setFiltrarSoloMesActual(!filtrarSoloMesActual)}
                className="flex items-center gap-1.5 text-xs text-foreground hover:text-primary transition-colors cursor-pointer select-none"
              >
                {filtrarSoloMesActual ? (
                  <CheckSquare className="w-4 h-4 text-primary" />
                ) : (
                  <Square className="w-4 h-4 text-muted-foreground" />
                )}
                <span className="font-medium">
                  Evaluar solo partidas de este período en el extracto CSV
                </span>
                <Badge variant="outline" className="text-[10px] font-mono py-0 h-5">
                  {partidasCsvEfectivas.length} de {partidasCSV.length}
                </Badge>
              </button>

              <span className="text-border">|</span>

              <span className="text-[11px]">
                En libros: <strong className="text-foreground">{movimientosSistemaFiltrados.length}</strong> movimientos contables para {formatPeriodoNombre(periodoFiltro)}
              </span>
            </div>

            {/* Sugerencia de Período Detectado desde el CSV */}
            {periodoDetectadoCsv && periodoDetectadoCsv.periodo !== periodoFiltro && (
              <div className="flex items-center gap-1.5 bg-primary/10 border border-primary/30 rounded-md px-2 py-1 text-xs">
                <Sparkles className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                <span>
                  Extracto parece ser de <strong>{formatPeriodoNombre(periodoDetectadoCsv.periodo)}</strong> ({periodoDetectadoCsv.count} filas).
                </span>
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => setPeriodoFiltro(periodoDetectadoCsv.periodo)}
                  className="h-5 text-[10px] px-2 py-0 ml-1"
                >
                  Fijar mes
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Cuerpo con scroll */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Zona de entrada de datos (Pegar CSV o Subir Archivo) */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-3 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Upload className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold">Cargar Extracto Bancario CDA (CSV / Excel)</span>
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  (Encabezados esperados: Cuenta, fecha, descripcion, referencia, valor)
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
              placeholder={`Pega aquí el contenido de tu CSV o Excel...\nEjemplo:\nCuenta,fecha,descripcion,referencia,valor\nCDA - 7757,2026-09-23,abono pakredito,REF1234,2581441\nCDA - 7856,2026-09-24,abono cliente,REF5678,3800000`}
              rows={csvRaw ? 3 : 2}
              className="font-mono text-xs bg-background"
            />

            {csvRaw && (
              <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/50">
                <span>
                  {partidasCSV.length} partida(s) en archivo ({partidasCsvEfectivas.length} evaluadas en período {formatPeriodoNombre(periodoFiltro)}).
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCsvRaw("")}
                  className="h-6 text-xs text-destructive hover:bg-destructive/10"
                >
                  Limpiar texto
                </Button>
              </div>
            )}
          </div>

          {/* Tarjetas de Métricas Ejecutivas de Conciliación */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {/* 1. Extracto CSV */}
            <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
              <div className="text-[10px] uppercase font-semibold text-muted-foreground flex items-center justify-between">
                <span>Extracto Bancario</span>
                <FileSpreadsheet className="w-3.5 h-3.5 text-primary" />
              </div>
              <div className="text-lg font-heading font-bold mt-1 text-foreground">
                {metricas.totalCsv} <span className="text-xs font-normal text-muted-foreground">partidas</span>
              </div>
              <div className="text-xs text-primary font-mono font-semibold mt-0.5 truncate">
                {formatCOP(metricas.valorTotalCsv)}
              </div>
            </div>

            {/* 2. Sistema Contable */}
            <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
              <div className="text-[10px] uppercase font-semibold text-muted-foreground flex items-center justify-between">
                <span>Sistema Contable</span>
                <Layers className="w-3.5 h-3.5 text-blue-500" />
              </div>
              <div className="text-lg font-heading font-bold mt-1 text-foreground">
                {metricas.totalSistema} <span className="text-xs font-normal text-muted-foreground">movs</span>
              </div>
              <div className="text-xs text-blue-600 dark:text-blue-400 font-mono font-semibold mt-0.5 truncate">
                {formatCOP(metricas.valorTotalSistema)}
              </div>
            </div>

            {/* 3. Conciliadas Exactas / Conformes */}
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 shadow-sm">
              <div className="text-[10px] uppercase font-semibold text-emerald-600 dark:text-emerald-400 flex items-center justify-between">
                <span>Coincidentes</span>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              </div>
              <div className="text-lg font-heading font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                {metricas.reflejadosCsv}{" "}
                <span className="text-xs font-normal text-muted-foreground">({metricas.pctConciliacion}%)</span>
              </div>
              <div className="text-xs text-emerald-600/80 font-mono mt-0.5 truncate">
                {formatCOP(metricas.valorReflejadoCsv)}
              </div>
            </div>

            {/* 4. Diferencia Neta / Descuadre */}
            <div className={`rounded-lg border p-3 shadow-sm ${
              Math.abs(metricas.diferenciaNeta) < 1 ? "border-emerald-500/30 bg-emerald-500/5" : "border-destructive/30 bg-destructive/5"
            }`}>
              <div className="text-[10px] uppercase font-semibold flex items-center justify-between text-muted-foreground">
                <span>Diferencia Neta</span>
                <ArrowRightLeft className="w-3.5 h-3.5" />
              </div>
              <div className={`text-lg font-heading font-bold mt-1 ${
                Math.abs(metricas.diferenciaNeta) < 1 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
              }`}>
                {Math.abs(metricas.diferenciaNeta) < 1 ? "Cuadrado ✓" : formatCOP(metricas.diferenciaNeta)}
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                {metricas.faltantesEnSistema} faltan en contab. · {metricas.sobrantesSistema} sin extracto
              </div>
            </div>

            {/* 5. Alertas & Duplicados */}
            <div className={`rounded-lg border p-3 shadow-sm ${
              metricas.totalAnomalias === 0 ? "border-border bg-card" : "border-amber-500/30 bg-amber-500/5"
            }`}>
              <div className="text-[10px] uppercase font-semibold text-amber-700 dark:text-amber-400 flex items-center justify-between">
                <span>Alertas Auditoría</span>
                <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
              </div>
              <div className="text-lg font-heading font-bold text-amber-700 dark:text-amber-400 mt-1">
                {metricas.totalAnomalias}
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                {metricas.duplicadosSistema} duplicados · {metricas.discordantesSistema} ctas. erradas
              </div>
            </div>
          </div>

          {/* Selector de Pestañas Principales */}
          <Tabs value={tabActivo} onValueChange={setTabActivo} className="w-full">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-border pb-2">
              <TabsList className="grid grid-cols-4 sm:w-[540px] h-9">
                <TabsTrigger value="resumen" className="text-xs gap-1.5">
                  <Layers className="w-3.5 h-3.5" />
                  Resumen
                </TabsTrigger>
                <TabsTrigger value="csv" className="text-xs gap-1.5">
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  Extracto CSV ({resultadosCsv.length})
                </TabsTrigger>
                <TabsTrigger value="sistema" className="text-xs gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  En Sistema ({resultadosSistema.length})
                </TabsTrigger>
                <TabsTrigger value="alertas" className="text-xs gap-1.5 text-amber-700 dark:text-amber-400">
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
                  Alertas ({anomaliasFiltradas.length})
                </TabsTrigger>
              </TabsList>

              {/* Búsqueda rápida contextual */}
              <div className="relative w-full sm:w-[240px]">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar valor, cuenta, desc..."
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  className="pl-8 h-8 text-xs"
                />
              </div>
            </div>

            {/* ============================================================= */}
            {/* TAB 1: RESUMEN Y CUADRE GLOBAL */}
            {/* ============================================================= */}
            <TabsContent value="resumen" className="pt-3 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Cuadro Extracto Bancario */}
                <div className="border border-border rounded-lg p-4 bg-card space-y-3">
                  <div className="flex items-center justify-between border-b pb-2">
                    <span className="font-bold text-sm flex items-center gap-1.5">
                      <FileSpreadsheet className="w-4 h-4 text-primary" />
                      Estado del Extracto Bancario (CSV)
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {partidasCsvEfectivas.length} partidas
                    </Badge>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-border/50">
                      <span className="text-muted-foreground">Valor total informado en extracto:</span>
                      <span className="font-mono font-bold">{formatCOP(metricas.valorTotalCsv)}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-border/50 text-emerald-600 dark:text-emerald-400">
                      <span>✓ Partidas reflejadas en contabilidad:</span>
                      <span className="font-mono font-bold">
                        {metricas.reflejadosCsv} ({formatCOP(metricas.valorReflejadoCsv)})
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-border/50 text-destructive">
                      <span>✗ Partidas NO reflejadas (Faltan en sistema):</span>
                      <span className="font-mono font-bold">
                        {metricas.faltantesEnSistema} ({formatCOP(metricas.valorFaltanteEnSistema)})
                      </span>
                    </div>
                    <div className="flex justify-between py-1 text-muted-foreground">
                      <span>Período evaluado:</span>
                      <span className="font-semibold text-foreground">{formatPeriodoNombre(periodoFiltro)}</span>
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs h-8"
                    onClick={() => setTabActivo("csv")}
                  >
                    Ver detalle de partidas del extracto &rarr;
                  </Button>
                </div>

                {/* Cuadro Sistema Contable */}
                <div className="border border-border rounded-lg p-4 bg-card space-y-3">
                  <div className="flex items-center justify-between border-b pb-2">
                    <span className="font-bold text-sm flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-blue-500" />
                      Estado del Sistema Contable
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {movimientosSistemaFiltrados.length} movimientos
                    </Badge>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-border/50">
                      <span className="text-muted-foreground">Valor total en libros CDA:</span>
                      <span className="font-mono font-bold">{formatCOP(metricas.valorTotalSistema)}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-border/50 text-emerald-600 dark:text-emerald-400">
                      <span>✓ Movimientos confirmados por extracto:</span>
                      <span className="font-mono font-bold">
                        {metricas.conciliadosSistema} ({formatCOP(metricas.valorConciliadoSistema)})
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-border/50 text-amber-600 dark:text-amber-400">
                      <span>⚠️ Movimientos en sistema SIN extracto:</span>
                      <span className="font-mono font-bold">
                        {metricas.sobrantesSistema} ({formatCOP(metricas.valorSobranteSistema)})
                      </span>
                    </div>
                    <div className="flex justify-between py-1 text-destructive">
                      <span>🚨 Posibles registros duplicados en sistema:</span>
                      <span className="font-mono font-bold">{metricas.duplicadosSistema} registro(s)</span>
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs h-8"
                    onClick={() => setTabActivo("sistema")}
                  >
                    Ver todos los movimientos del sistema &rarr;
                  </Button>
                </div>
              </div>

              {/* Conclusión del Cuadre */}
              <div className={`p-4 rounded-lg border text-xs flex items-start gap-3 ${
                Math.abs(metricas.diferenciaNeta) < 1 && metricas.totalAnomalias === 0
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-900 dark:text-emerald-200"
                  : "bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200"
              }`}>
                {Math.abs(metricas.diferenciaNeta) < 1 && metricas.totalAnomalias === 0 ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                )}
                <div className="space-y-1">
                  <div className="font-bold text-sm">
                    {Math.abs(metricas.diferenciaNeta) < 1 && metricas.totalAnomalias === 0
                      ? "¡Conciliación Cuadrada y Limpia!"
                      : `Diferencia de Conciliación: ${formatCOP(metricas.diferenciaNeta)}`}
                  </div>
                  <p className="text-[11px] opacity-90 leading-relaxed">
                    {Math.abs(metricas.diferenciaNeta) < 1 && metricas.totalAnomalias === 0
                      ? `Todas las partidas del extracto bancario coinciden con la contabilidad para ${formatPeriodoNombre(periodoFiltro)} y no existen registros duplicados ni cuentas erróneas.`
                      : `Se encontraron ${metricas.faltantesEnSistema} partida(s) del extracto no registradas en sistema, ${metricas.sobrantesSistema} movimiento(s) del sistema no reportados en el extracto, y ${metricas.duplicadosSistema} posible(s) duplicado(s). Consulta la pestaña "Alertas" para revisarlas puntualmente.`}
                  </p>
                </div>
              </div>
            </TabsContent>

            {/* ============================================================= */}
            {/* TAB 2: PARTIDAS DEL EXTRACTO CSV */}
            {/* ============================================================= */}
            <TabsContent value="csv" className="pt-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Filtro de estado:</span>
                  <Select value={estadoFiltroCsv} onValueChange={setEstadoFiltroCsv}>
                    <SelectTrigger className="w-[180px] h-7 text-xs">
                      <SelectValue placeholder="Estado CSV" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos ({resultadosCsv.length})</SelectItem>
                      <SelectItem value="reflejado">Reflejadas ✓ ({metricas.reflejadosCsv})</SelectItem>
                      <SelectItem value="no_reflejado">No Reflejadas ✗ ({metricas.faltantesEnSistema})</SelectItem>
                      <SelectItem value="conciliado_exacto">Exactas ({metricas.exactosCsv})</SelectItem>
                      <SelectItem value="diferencia_fecha">Con desfase de fecha ({metricas.fechaCsv})</SelectItem>
                      <SelectItem value="no_encontrado">Faltantes en sistema ({metricas.faltantesEnSistema})</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="text-muted-foreground text-[11px]">
                  Mostrando {partidasCsvFiltradas.length} de {resultadosCsv.length} partidas
                </div>
              </div>

              {/* Tabla CSV */}
              <div className="rounded-lg border border-border overflow-hidden bg-card">
                <div className="overflow-x-auto max-h-[380px]">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/80 text-muted-foreground font-semibold sticky top-0 z-10 border-b border-border">
                      <tr>
                        <th className="py-2 px-3 text-left w-10">#</th>
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
                      {partidasCsvFiltradas.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-8 text-center text-muted-foreground">
                            {partidasCSV.length === 0
                              ? "Cargue o pegue un archivo CSV para evaluar las partidas."
                              : "No hay partidas que coincidan con los filtros seleccionados."}
                          </td>
                        </tr>
                      ) : (
                        partidasCsvFiltradas.map((item) => {
                          const esExacto = item.estado === "conciliado_exacto";
                          const esFecha = item.estado === "diferencia_fecha";
                          const esReflejado = esExacto || esFecha;
                          const esNoEncontrado = item.estado === "no_encontrado";
                          const esCdaInvalida = item.estado === "cda_no_encontrada";

                          return (
                            <tr
                              key={item.id}
                              className={`transition-colors hover:bg-muted/30 ${
                                esReflejado ? "bg-emerald-500/5" : esNoEncontrado ? "bg-destructive/5" : ""
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
                                  <Badge variant="default" className="bg-emerald-600 text-white text-[10px] gap-1">
                                    <CheckCircle2 className="w-3 h-3" /> Reflejado ✓
                                  </Badge>
                                )}
                                {esFecha && (
                                  <Badge variant="secondary" className="bg-amber-500/20 text-amber-700 dark:text-amber-400 text-[10px] border-amber-500/40 gap-1">
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
            </TabsContent>

            {/* ============================================================= */}
            {/* TAB 3: MOVIMIENTOS DEL SISTEMA CONTABLE */}
            {/* ============================================================= */}
            <TabsContent value="sistema" className="pt-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-muted-foreground font-semibold">Filtro de movimientos:</span>
                  <Select value={estadoFiltroSistema} onValueChange={setEstadoFiltroSistema}>
                    <SelectTrigger className="w-[240px] h-7 text-xs">
                      <SelectValue placeholder="Estado en sistema" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos los movimientos ({resultadosSistema.length})</SelectItem>
                      <SelectItem value="conciliados">Conciliados en CSV ✓ ({metricas.conciliadosSistema})</SelectItem>
                      <SelectItem value="no_en_csv">No en CSV (Sobrantes) ⚠️ ({metricas.sobrantesSistema})</SelectItem>
                      <SelectItem value="duplicados">🚨 Posibles Duplicados ({metricas.duplicadosSistema})</SelectItem>
                      <SelectItem value="discordantes">🚫 Cuentas que no corresponden ({metricas.discordantesSistema})</SelectItem>
                      <SelectItem value="mal_ingresados">⚠️ Mal Ingresados / Incompletos ({metricas.malIngresadosSistema})</SelectItem>
                      <SelectItem value="inconsistentes">Cualquier inconsistencia ({metricas.duplicadosSistema + metricas.discordantesSistema + metricas.malIngresadosSistema})</SelectItem>
                    </SelectContent>
                  </Select>

                  <div className="hidden sm:flex items-center gap-1">
                    <Button
                      size="sm"
                      variant={estadoFiltroSistema === "duplicados" ? "destructive" : "outline"}
                      className="h-6 text-[10px] px-2 gap-1"
                      onClick={() => setEstadoFiltroSistema(estadoFiltroSistema === "duplicados" ? "todos" : "duplicados")}
                    >
                      <Copy className="w-2.5 h-2.5" /> Duplicados ({metricas.duplicadosSistema})
                    </Button>
                    <Button
                      size="sm"
                      variant={estadoFiltroSistema === "discordantes" ? "destructive" : "outline"}
                      className="h-6 text-[10px] px-2 gap-1"
                      onClick={() => setEstadoFiltroSistema(estadoFiltroSistema === "discordantes" ? "todos" : "discordantes")}
                    >
                      <AlertTriangle className="w-2.5 h-2.5" /> Discordantes ({metricas.discordantesSistema})
                    </Button>
                    <Button
                      size="sm"
                      variant={estadoFiltroSistema === "mal_ingresados" ? "destructive" : "outline"}
                      className="h-6 text-[10px] px-2 gap-1"
                      onClick={() => setEstadoFiltroSistema(estadoFiltroSistema === "mal_ingresados" ? "todos" : "mal_ingresados")}
                    >
                      <AlertCircle className="w-2.5 h-2.5" /> Mal Ingresados ({metricas.malIngresadosSistema})
                    </Button>
                  </div>
                </div>

                <div className="text-muted-foreground text-[11px]">
                  Mostrando <strong>{movimientosSistemaFiltradosVista.length}</strong> de {resultadosSistema.length} movimientos
                </div>
              </div>

              {/* Tabla Sistema */}
              <div className="rounded-lg border border-border overflow-hidden bg-card">
                <div className="overflow-x-auto max-h-[380px]">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/80 text-muted-foreground font-semibold sticky top-0 z-10 border-b border-border">
                      <tr>
                        <th className="py-2 px-3 text-left">Fecha</th>
                        <th className="py-2 px-3 text-left">CDA Asignada</th>
                        <th className="py-2 px-3 text-left">Subcuenta PUC</th>
                        <th className="py-2 px-3 text-left">Descripción / Tercero</th>
                        <th className="py-2 px-3 text-right">Débito</th>
                        <th className="py-2 px-3 text-right">Crédito</th>
                        <th className="py-2 px-3 text-center">Auditoría & Extracto</th>
                        <th className="py-2 px-3 text-left">Partida CSV Emparejada / Detalle</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {movimientosSistemaFiltradosVista.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-8 text-center text-muted-foreground">
                            No se encontraron movimientos contables para el período y filtros seleccionados.
                          </td>
                        </tr>
                      ) : (
                        movimientosSistemaFiltradosVista.map((m) => {
                          const esConciliado = m.esConciliado;
                          const esDuplicado = m.esDuplicado;
                          const esDiscordante = m.cuentaDiscordante;
                          const esMal = m.esMalIngresado;

                          return (
                            <tr
                              key={m.id}
                              className={`transition-colors hover:bg-muted/30 ${
                                esDuplicado
                                  ? "bg-amber-500/10"
                                  : esDiscordante || esMal
                                  ? "bg-destructive/5"
                                  : esConciliado
                                  ? "bg-emerald-500/5"
                                  : ""
                              }`}
                            >
                              <td className="py-2.5 px-3 font-mono whitespace-nowrap">
                                {formatDate(m.fecha)}
                              </td>

                              <td className="py-2.5 px-3 font-semibold">
                                {m.cdaAsociada ? (
                                  <div>
                                    <span className="font-semibold text-foreground block">
                                      {m.cdaAsociada.nombre}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground">
                                      {BANCO_NAMES[m.cdaAsociada.banco] || m.cdaAsociada.banco}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-amber-600 font-mono text-[11px]">
                                    {m.cuenta_nombre || "Sin CDA"}
                                  </span>
                                )}
                              </td>

                              <td className="py-2.5 px-3 font-mono">
                                <span className={m.cuentaDiscordante ? "text-destructive font-bold underline" : ""}>
                                  {m.subcuenta || "—"}
                                </span>
                              </td>

                              <td className="py-2.5 px-3 max-w-[220px] truncate" title={m.descripcion}>
                                <div className="truncate font-medium">{m.descripcion || "—"}</div>
                                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground truncate">
                                  {m.tercero && <span>Tercero: {m.tercero}</span>}
                                  {m.comprobante_id && (
                                    <span className="font-mono">· Comp: {m.comprobante_id}</span>
                                  )}
                                </div>
                              </td>

                              <td className="py-2.5 px-3 text-right font-mono font-medium">
                                {m.debito > 0 ? formatCOP(m.debito) : "—"}
                              </td>

                              <td className="py-2.5 px-3 text-right font-mono font-medium">
                                {m.credito > 0 ? formatCOP(m.credito) : "—"}
                              </td>

                              <td className="py-2.5 px-3 text-center whitespace-nowrap">
                                <div className="flex flex-col items-center gap-1">
                                  {esDuplicado && (
                                    <Badge variant="destructive" className="bg-amber-600 text-white text-[10px] gap-1">
                                      <Copy className="w-3 h-3" /> Duplicado ({m.dupInfo?.cantidad})
                                    </Badge>
                                  )}
                                  {esDiscordante && (
                                    <Badge variant="destructive" className="text-[10px] gap-1">
                                      <AlertTriangle className="w-3 h-3" /> Cta. Discordante
                                    </Badge>
                                  )}
                                  {esMal && (
                                    <Badge variant="destructive" className="bg-destructive/80 text-white text-[10px] gap-1">
                                      <AlertCircle className="w-3 h-3" /> Mal Ingresado
                                    </Badge>
                                  )}
                                  {esConciliado ? (
                                    <Badge variant="default" className="bg-emerald-600 text-white text-[10px] gap-1">
                                      <CheckCircle2 className="w-3 h-3" /> En Extracto ✓
                                    </Badge>
                                  ) : (
                                    <Badge variant="secondary" className="bg-amber-500/15 text-amber-700 dark:text-amber-400 text-[10px] gap-1">
                                      <Clock className="w-3 h-3" /> No en Extracto
                                    </Badge>
                                  )}
                                </div>
                              </td>

                              <td className="py-2.5 px-3">
                                {m.matchCsv ? (
                                  <div className="text-[11px] font-mono">
                                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                      Partida #{m.matchCsv.linea_idx}
                                    </span>
                                    <span className="text-muted-foreground ml-1">
                                      ({m.matchCsv.cuentaRaw} · {formatCOP(m.matchCsv.valorAbsoluto)})
                                    </span>
                                    {m.matchCsv.diferenciaDias > 0 && (
                                      <span className="text-amber-600 ml-1 text-[10px]">
                                        (±{m.matchCsv.diferenciaDias}d)
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <div className="space-y-0.5">
                                    <span className="text-[11px] text-muted-foreground italic block">
                                      {m.mensajeSistema}
                                    </span>
                                    {m.motivoDiscordancia && (
                                      <span className="text-[10px] text-destructive font-medium block">
                                        🚫 {m.motivoDiscordancia}
                                      </span>
                                    )}
                                    {m.motivoMalIngresado && (
                                      <span className="text-[10px] text-destructive font-medium block">
                                        ⚠️ {m.motivoMalIngresado}
                                      </span>
                                    )}
                                  </div>
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
            </TabsContent>

            {/* ============================================================= */}
            {/* TAB 4: ALERTAS Y AUDITORÍA DE INCONSISTENCIAS */}
            {/* ============================================================= */}
            <TabsContent value="alertas" className="pt-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-muted-foreground font-semibold">Filtrar alertas:</span>
                  <Button
                    size="sm"
                    variant={filtroTipoAlerta === "todas" ? "secondary" : "outline"}
                    className="h-6 text-[10px] px-2"
                    onClick={() => setFiltroTipoAlerta("todas")}
                  >
                    Todas ({metricas.totalAnomalias})
                  </Button>
                  <Button
                    size="sm"
                    variant={filtroTipoAlerta === "duplicado_sistema" ? "destructive" : "outline"}
                    className="h-6 text-[10px] px-2 gap-1 text-amber-700 dark:text-amber-400"
                    onClick={() => setFiltroTipoAlerta("duplicado_sistema")}
                  >
                    <Copy className="w-2.5 h-2.5" /> Duplicados ({metricas.duplicadosSistema})
                  </Button>
                  <Button
                    size="sm"
                    variant={filtroTipoAlerta === "cuenta_discordante" ? "destructive" : "outline"}
                    className="h-6 text-[10px] px-2 gap-1"
                    onClick={() => setFiltroTipoAlerta("cuenta_discordante")}
                  >
                    <AlertTriangle className="w-2.5 h-2.5" /> No corresponden ({metricas.discordantesSistema})
                  </Button>
                  <Button
                    size="sm"
                    variant={filtroTipoAlerta === "mal_ingresado" ? "destructive" : "outline"}
                    className="h-6 text-[10px] px-2 gap-1"
                    onClick={() => setFiltroTipoAlerta("mal_ingresado")}
                  >
                    <AlertCircle className="w-2.5 h-2.5" /> Mal ingresados ({metricas.malIngresadosSistema})
                  </Button>
                  <Button
                    size="sm"
                    variant={filtroTipoAlerta === "faltante_en_sistema" ? "destructive" : "outline"}
                    className="h-6 text-[10px] px-2 gap-1"
                    onClick={() => setFiltroTipoAlerta("faltante_en_sistema")}
                  >
                    <XCircle className="w-2.5 h-2.5" /> Faltan en sistema ({metricas.faltantesEnSistema})
                  </Button>
                  <Button
                    size="sm"
                    variant={filtroTipoAlerta === "sobrante_sistema" ? "secondary" : "outline"}
                    className="h-6 text-[10px] px-2 gap-1"
                    onClick={() => setFiltroTipoAlerta("sobrante_sistema")}
                  >
                    <Clock className="w-2.5 h-2.5" /> Sin extracto ({metricas.sobrantesSistema})
                  </Button>
                </div>

                <span className="text-[11px] text-muted-foreground">
                  Filtro activo: <strong>{formatPeriodoNombre(periodoFiltro)}</strong>
                </span>
              </div>

              {anomaliasFiltradas.length === 0 ? (
                <div className="py-12 border border-dashed rounded-lg text-center space-y-2 bg-emerald-500/5 border-emerald-500/30">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                  <div className="font-bold text-sm text-emerald-700 dark:text-emerald-400">
                    ¡No se detectaron inconsistencias!
                  </div>
                  <p className="text-xs text-muted-foreground max-w-md mx-auto">
                    No hay registros duplicados, partidas huérfanas ni desajustes de cuentas para el período seleccionado.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                  {anomaliasFiltradas.map((a) => (
                    <div
                      key={a.id}
                      className={`p-3 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs ${
                        a.severidad === "alta"
                          ? "bg-destructive/5 border-destructive/30"
                          : a.tipo === "duplicado_sistema"
                          ? "bg-amber-500/10 border-amber-500/40"
                          : "bg-muted/40 border-border"
                      }`}
                    >
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={a.severidad === "alta" ? "destructive" : "outline"}
                            className="text-[10px]"
                          >
                            {a.tipo === "duplicado_sistema"
                              ? "🚨 Duplicado en Sistema"
                              : a.tipo === "cuenta_discordante"
                              ? "🚫 Cuenta no Corresponde"
                              : a.tipo === "mal_ingresado"
                              ? "⚠️ Mal Ingresado"
                              : a.tipo === "faltante_en_sistema"
                              ? "✗ Faltante en Contabilidad"
                              : "ℹ️ Sin Extracto"}
                          </Badge>
                          <span className="font-bold text-foreground">{a.titulo}</span>
                          <span className="text-[11px] text-muted-foreground font-mono">
                            {formatDate(a.fecha)}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          {a.detalle}
                        </p>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span>Origen: <strong>{a.origen}</strong></span>
                          <span>·</span>
                          <span>Cuenta: <strong>{a.cuenta}</strong></span>
                          <span>·</span>
                          <span>Concepto: <em>{a.descripcion}</em></span>
                        </div>
                      </div>

                      <div className="text-right flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-1 border-t sm:border-t-0 pt-2 sm:pt-0">
                        <span className="font-mono font-bold text-sm text-foreground">
                          {formatCOP(a.valor)}
                        </span>
                        {a.raw?.comprobante_id && (
                          <Link
                            to={`/admin/contabilidad?busqueda=${a.raw.comprobante_id}`}
                            target="_blank"
                            className="text-[11px] text-primary hover:underline flex items-center gap-0.5"
                          >
                            Ver comprobante <ExternalLink className="w-2.5 h-2.5" />
                          </Link>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Pie del diálogo */}
        <DialogFooter className="p-4 border-t border-border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <Info className="w-3.5 h-3.5 text-primary" />
            <span>
              Período evaluado: <strong>{formatPeriodoNombre(periodoFiltro)}</strong> ·{" "}
              {resultadosCsv.length} en extracto · {resultadosSistema.length} en sistema contable.
            </span>
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
