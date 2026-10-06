import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { 
  ShieldCheck, 
  Search, 
  RefreshCw, 
  Eye, 
  Database, 
  Clock, 
  User, 
  PlusCircle, 
  Pencil, 
  Trash2, 
  Zap,
  FilterX
} from "lucide-react";

const ACTION_COLORS = {
  create: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  update: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
  delete: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30",
  deleteMany: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30",
  bulkCreate: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  bulkDelete: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30"
};

function formatTimestamp(isoStr) {
  if (!isoStr) return "—";
  try {
    const d = new Date(isoStr);
    return d.toLocaleString("es-CO", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  } catch {
    return isoStr;
  }
}

export default function AuditoriaLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroTexto, setFiltroTexto] = useState("");
  const [filtroTabla, setFiltroTabla] = useState("todas");
  const [filtroAccion, setFiltroAccion] = useState("todas");
  const [detalleModal, setDetalleModal] = useState({ open: false, log: null });

  const loadLogs = async () => {
    setLoading(true);
    try {
      const data = await base44.entities.AuditLog.list("-created_date", 500);
      setLogs(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn("Error cargando logs de auditoría:", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadLogs();

    // Escuchar eventos en vivo emitidos por la aplicación
    const handleLiveAudit = (e) => {
      if (e.detail) {
        setLogs((prev) => [e.detail, ...prev.filter((l) => l.id !== e.detail.id)]);
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("app-audit-log", handleLiveAudit);
      return () => window.removeEventListener("app-audit-log", handleLiveAudit);
    }
  }, []);

  // Extraer tablas y acciones únicas para los selectores
  const { tablasDisponibles, accionesDisponibles } = useMemo(() => {
    const tSet = new Set();
    const aSet = new Set();
    logs.forEach((l) => {
      if (l.table_name) tSet.add(l.table_name);
      if (l.action) aSet.add(l.action);
      if (l.action_type) aSet.add(l.action_type);
    });
    return {
      tablasDisponibles: Array.from(tSet).sort(),
      accionesDisponibles: Array.from(aSet).sort()
    };
  }, [logs]);

  // Filtrado de logs
  const logsFiltrados = useMemo(() => {
    const q = filtroTexto.trim().toLowerCase();
    return logs.filter((l) => {
      const matchTabla = filtroTabla === "todas" || l.table_name === filtroTabla;
      const matchAccion =
        filtroAccion === "todas" ||
        l.action === filtroAccion ||
        l.action_type === filtroAccion;

      if (!matchTabla || !matchAccion) return false;
      if (!q) return true;

      const recordIdStr = String(l.record_id || "").toLowerCase();
      const actionStr = String(l.action || "").toLowerCase();
      const actionTypeStr = String(l.action_type || "").toLowerCase();
      const tableStr = String(l.table_name || "").toLowerCase();
      const userStr = String(l.user_email || "").toLowerCase();
      const payloadStr = typeof l.payload === "object" ? JSON.stringify(l.payload).toLowerCase() : "";

      return (
        recordIdStr.includes(q) ||
        actionStr.includes(q) ||
        actionTypeStr.includes(q) ||
        tableStr.includes(q) ||
        userStr.includes(q) ||
        payloadStr.includes(q)
      );
    });
  }, [logs, filtroTexto, filtroTabla, filtroAccion]);

  // Contadores
  const stats = useMemo(() => {
    let creates = 0;
    let updates = 0;
    let deletes = 0;
    let custom = 0;

    logs.forEach((l) => {
      const a = (l.action || "").toLowerCase();
      if (a === "create" || a === "bulkcreate") creates++;
      else if (a === "update" || a === "bulkupdate") updates++;
      else if (a === "delete" || a === "bulkdelete" || a === "deletemany") deletes++;
      else custom++;
    });

    return { total: logs.length, creates, updates, deletes, custom };
  }, [logs]);

  const limpiarFiltros = () => {
    setFiltroTexto("");
    setFiltroTabla("todas");
    setFiltroAccion("todas");
  };

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-heading font-semibold text-foreground">
              Registro de Auditoría (Audit Log)
            </h1>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Trazabilidad en tiempo real de operaciones CRUD y captura del tipo de acción para evitar errores de columnas desconocidas.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {(filtroTexto || filtroTabla !== "todas" || filtroAccion !== "todas") && (
            <Button variant="ghost" size="sm" onClick={limpiarFiltros} className="h-8 text-xs">
              <FilterX className="w-3.5 h-3.5 mr-1" /> Limpiar filtros
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={loadLogs} disabled={loading} className="h-8">
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Cargando..." : "Actualizar"}
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="bg-card/70 border-border/60">
          <CardContent className="p-3.5 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Total Eventos</p>
              <p className="text-2xl font-bold font-mono text-foreground mt-0.5">{stats.total}</p>
            </div>
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <Database className="w-4 h-4" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/70 border-border/60">
          <CardContent className="p-3.5 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Creaciones</p>
              <p className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">{stats.creates}</p>
            </div>
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-600">
              <PlusCircle className="w-4 h-4" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/70 border-border/60">
          <CardContent className="p-3.5 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Actualizaciones</p>
              <p className="text-2xl font-bold font-mono text-blue-600 dark:text-blue-400 mt-0.5">{stats.updates}</p>
            </div>
            <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-600">
              <Pencil className="w-4 h-4" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/70 border-border/60">
          <CardContent className="p-3.5 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Eliminaciones / Custom</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-2xl font-bold font-mono text-rose-600 dark:text-rose-400">{stats.deletes}</span>
                <span className="text-xs text-muted-foreground">/ {stats.custom} act.</span>
              </div>
            </div>
            <div className="w-9 h-9 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-600">
              <Trash2 className="w-4 h-4" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters Bar */}
      <Card className="border-border/60">
        <CardContent className="p-3 flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input
              placeholder="Buscar por tabla, ID, acción, usuario o contenido..."
              value={filtroTexto}
              onChange={(e) => setFiltroTexto(e.target.value)}
              className="pl-8 h-9 text-xs"
            />
          </div>

          <div className="w-44">
            <Select value={filtroTabla} onValueChange={setFiltroTabla}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Todas las tablas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas las tablas</SelectItem>
                {tablasDisponibles.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-44">
            <Select value={filtroAccion} onValueChange={setFiltroAccion}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Todas las acciones" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas las acciones</SelectItem>
                {accionesDisponibles.map((a) => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="border-border/60">
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 border-b border-border/60 text-muted-foreground uppercase text-[10px]">
              <tr>
                <th className="py-2.5 px-3 font-semibold">Timestamp</th>
                <th className="py-2.5 px-3 font-semibold">Acción</th>
                <th className="py-2.5 px-3 font-semibold">Tipo / Despacho</th>
                <th className="py-2.5 px-3 font-semibold">Tabla</th>
                <th className="py-2.5 px-3 font-semibold">ID Registro</th>
                <th className="py-2.5 px-3 font-semibold">Usuario</th>
                <th className="py-2.5 px-3 font-semibold text-right">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {logsFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted-foreground">
                    {loading ? "Cargando registros de auditoría..." : "No se encontraron operaciones de auditoría registradas."}
                  </td>
                </tr>
              ) : (
                logsFiltrados.map((item) => {
                  const actionClass = ACTION_COLORS[item.action] || "bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30";
                  return (
                    <tr key={item.id} className="hover:bg-muted/20 transition-colors">
                      <td className="py-2.5 px-3 font-mono text-[11px] whitespace-nowrap text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3 h-3 shrink-0" />
                          {formatTimestamp(item.created_date)}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <Badge variant="outline" className={`text-[10px] font-mono capitalize border ${actionClass}`}>
                          {item.action}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap font-mono text-[11px] text-foreground">
                        {item.action_type && item.action_type !== item.action ? (
                          <span className="inline-flex items-center gap-1 text-primary font-semibold">
                            <Zap className="w-3 h-3" />
                            {item.action_type}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">{item.action_type || item.action}</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <Badge variant="secondary" className="text-[10px] font-mono">
                          {item.table_name}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-muted-foreground max-w-[140px] truncate" title={item.record_id}>
                        {item.record_id || "—"}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-muted-foreground text-[11px]">
                        <div className="flex items-center gap-1">
                          <User className="w-3 h-3 shrink-0" />
                          <span className="max-w-[150px] truncate" title={item.user_email}>{item.user_email || "sistema"}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => setDetalleModal({ open: true, log: item })}
                        >
                          <Eye className="w-3.5 h-3.5 mr-1" /> Ver
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Modal de Detalle */}
      <Dialog
        open={detalleModal.open}
        onOpenChange={(v) => !v && setDetalleModal({ open: false, log: null })}
      >
        <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="w-5 h-5 text-primary" />
              Detalle de Auditoría — {detalleModal.log?.action}
            </DialogTitle>
          </DialogHeader>

          {detalleModal.log && (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-2 bg-muted/20 p-3 rounded-lg border border-border/60">
                <div>
                  <span className="text-muted-foreground">ID Registro:</span>{" "}
                  <span className="font-mono font-medium">{detalleModal.log.record_id || "—"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Tabla Afectada:</span>{" "}
                  <Badge variant="outline" className="font-mono text-[10px] ml-1">{detalleModal.log.table_name}</Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">Acción / Operación:</span>{" "}
                  <span className="font-mono font-bold text-primary">{detalleModal.log.action}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Acción Capturada:</span>{" "}
                  <span className="font-mono font-semibold">{detalleModal.log.action_type || "—"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Usuario:</span>{" "}
                  <span>{detalleModal.log.user_email || "sistema"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Fecha:</span>{" "}
                  <span className="font-mono">{formatTimestamp(detalleModal.log.created_date)}</span>
                </div>
              </div>

              {/* Metadatos Capturados */}
              {detalleModal.log.metadata && Object.keys(detalleModal.log.metadata).length > 0 && (
                <div>
                  <h4 className="font-semibold text-muted-foreground uppercase text-[10px] mb-1.5">
                    Parámetros Operativos / Metadatos Capturados
                  </h4>
                  <pre className="p-3 bg-muted/30 rounded border border-border/50 font-mono text-[11px] overflow-x-auto text-foreground">
                    {JSON.stringify(detalleModal.log.metadata, null, 2)}
                  </pre>
                </div>
              )}

              {/* Payload Guardado */}
              <div>
                <h4 className="font-semibold text-muted-foreground uppercase text-[10px] mb-1.5">
                  Payload de Datos Sanitizado
                </h4>
                <pre className="p-3 bg-muted/30 rounded border border-border/50 font-mono text-[11px] overflow-x-auto text-foreground">
                  {JSON.stringify(detalleModal.log.payload, null, 2) || "Sin datos de payload"}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
