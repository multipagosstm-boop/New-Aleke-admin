import React, { useState, useMemo, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Merge, Search, X, CheckCircle2, AlertCircle } from "lucide-react";
import { formatCOP, BANCO_NAMES } from "@/lib/contabilidad";

export default function UnificacionTarjetaDialog({ open, onOpenChange, tarjetas, clientes, onDone }) {
  const [seleccionadas, setSeleccionadas] = useState([]);
  const [permanenteId, setPermanenteId] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Limpiar búsqueda y selección al abrir/cerrar el diálogo
  useEffect(() => {
    if (!open) {
      setSeleccionadas([]);
      setPermanenteId("");
      setBusqueda("");
      setError("");
    }
  }, [open]);

  const tdcActivas = useMemo(
    () => tarjetas.filter((t) => t.tipo === "TDC" && t.estado === "activo"),
    [tarjetas]
  );

  const clienteMap = useMemo(() => {
    const m = {};
    clientes.forEach((c) => { m[c.id] = c; });
    return m;
  }, [clientes]);

  const toggleSeleccion = (id) => {
    setSeleccionadas((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      if (next.length > 0 && !next.includes(permanenteId)) {
        setPermanenteId(next[0]);
      } else if (next.length === 0) {
        setPermanenteId("");
      }
      return next;
    });
  };

  const seleccionadasData = useMemo(() => {
    return tdcActivas.filter((t) => seleccionadas.includes(t.id));
  }, [tdcActivas, seleccionadas]);

  // Filtrado de tarjetas por búsqueda
  const tdcFiltradas = useMemo(() => {
    if (!busqueda.trim()) return tdcActivas;
    const q = busqueda.toLowerCase().trim();
    return tdcActivas.filter((t) => {
      const titular = clienteMap[t.titular_id];
      const bancoNombre = BANCO_NAMES[t.banco] || t.banco || "";
      return (
        (t.nombre || "").toLowerCase().includes(q) ||
        (t.nomenclatura || "").toLowerCase().includes(q) ||
        (t.codigo_interno || "").toLowerCase().includes(q) ||
        (t.numero_completo || "").toLowerCase().includes(q) ||
        bancoNombre.toLowerCase().includes(q) ||
        (titular?.nombre || "").toLowerCase().includes(q) ||
        (titular?.documento || "").toLowerCase().includes(q)
      );
    });
  }, [tdcActivas, busqueda, clienteMap]);

  const mismoBanco = seleccionadasData.length > 0 && seleccionadasData.every((t) => t.banco === seleccionadasData[0].banco);
  const mismoTitular = seleccionadasData.length > 0 && seleccionadasData.every((t) => t.titular_id === seleccionadasData[0].titular_id);
  const cupoTotal = seleccionadasData.reduce((s, t) => s + (Number(t.cupo) || 0), 0);
  const saldoTotal = seleccionadasData.reduce((s, t) => s + (Number(t.saldo) || 0), 0);
  const puedeConfirmar = seleccionadasData.length >= 2 && mismoBanco && mismoTitular && permanenteId;

  const handleSubmit = async () => {
    if (!puedeConfirmar) return;
    setSaving(true);
    setError("");
    try {
      await base44.functions.invoke("gestionarTarjeta", {
        operacion: "unificacion",
        tarjeta_ids: seleccionadas,
        permanente_id: permanenteId
      });
      onDone();
      onOpenChange(false);
      setSeleccionadas([]);
      setPermanenteId("");
      setBusqueda("");
    } catch (e) {
      const msg = e?.response?.data?.error || e.message;
      setError(msg);
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Merge className="w-4 h-4 text-primary" /> Unificación de Tarjetas
          </DialogTitle>
          <DialogDescription>
            Seleccione 2 o más tarjetas del mismo banco y titular. Los cupos se sumarán y los saldos se trasladarán a la tarjeta permanente.
          </DialogDescription>
        </DialogHeader>

        {/* Buscador de tarjetas */}
        <div className="relative pt-1">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <Input
            placeholder="Buscar por nombre (ej: TDC - 4321), banco, titular o nomenclatura..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="pl-9 pr-9 text-xs h-9"
          />
          {busqueda && (
            <button
              type="button"
              onClick={() => setBusqueda("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 rounded cursor-pointer"
              title="Limpiar búsqueda"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Resumen de tarjetas seleccionadas (fijo arriba para no perder de vista la selección al filtrar) */}
        {seleccionadas.length > 0 && (
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-2.5 space-y-1.5 text-xs">
            <div className="flex items-center justify-between font-semibold text-primary">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> Tarjetas seleccionadas ({seleccionadas.length}):
              </span>
              <button
                type="button"
                onClick={() => { setSeleccionadas([]); setPermanenteId(""); }}
                className="text-[11px] text-muted-foreground hover:text-destructive underline cursor-pointer"
              >
                Limpiar selección
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {seleccionadasData.map((t) => {
                const isPerm = permanenteId === t.id;
                return (
                  <Badge
                    key={t.id}
                    variant={isPerm ? "default" : "secondary"}
                    className={`text-xs flex items-center gap-1 py-1 px-2.5 cursor-pointer transition-all ${isPerm ? "ring-2 ring-primary ring-offset-1" : "hover:bg-muted"}`}
                    onClick={() => setPermanenteId(t.id)}
                    title={isPerm ? "Tarjeta Permanente (Conservará el plástico y absorberá el cupo/saldo)" : "Clic para definir como Permanente"}
                  >
                    {isPerm && (
                      <span className="text-[9px] bg-primary-foreground text-primary rounded px-1 font-bold">
                        PERMANENTE
                      </span>
                    )}
                    <span className="font-medium">{t.nombre}</span>
                    <span className="opacity-70 text-[11px]">({BANCO_NAMES[t.banco] || t.banco})</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSeleccion(t.id);
                      }}
                      className="hover:text-destructive ml-1 p-0.5 rounded"
                      title="Quitar de selección"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                );
              })}
            </div>
            <div className="text-[11px] text-muted-foreground pt-0.5">
              💡 Marca o haz clic en una tarjeta para seleccionarla como <strong className="text-foreground">Permanente</strong> (la que se quedará activa).
            </div>
          </div>
        )}

        {/* Lista de tarjetas con scroll */}
        <div className="flex-1 space-y-2.5 overflow-y-auto max-h-[42vh] pr-1">
          {tdcActivas.length < 2 ? (
            <div className="text-sm text-muted-foreground text-center py-8">
              Se necesitan al menos 2 tarjetas de crédito activas en el sistema para realizar una unificación.
            </div>
          ) : tdcFiltradas.length === 0 ? (
            <div className="text-center py-8 space-y-2">
              <p className="text-xs text-muted-foreground">
                No se encontraron tarjetas activas que coincidan con &ldquo;<span className="font-semibold text-foreground">{busqueda}</span>&rdquo;
              </p>
              <Button size="sm" variant="outline" onClick={() => setBusqueda("")} className="text-xs h-7">
                Limpiar búsqueda
              </Button>
            </div>
          ) : (
            tdcFiltradas.map((t) => {
              const titular = clienteMap[t.titular_id];
              const isSelected = seleccionadas.includes(t.id);
              const isPermanente = permanenteId === t.id;
              return (
                <div
                  key={t.id}
                  onClick={() => toggleSeleccion(t.id)}
                  className={`rounded-lg border p-3 cursor-pointer transition-colors ${
                    isSelected
                      ? isPermanente
                        ? "border-primary bg-primary/10 shadow-xs"
                        : "border-primary/50 bg-primary/5"
                      : "border-border hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleSeleccion(t.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{t.nombre}</span>
                        <span className="font-mono text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {t.nomenclatura}
                        </span>
                        {isPermanente && (
                          <Badge variant="default" className="text-[10px] h-4 px-1.5 font-bold">
                            ★ Permanente
                          </Badge>
                        )}
                        {isSelected && !isPermanente && (
                          <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-muted-foreground">
                            Se inhabilitará
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        <span className="font-medium text-foreground">{BANCO_NAMES[t.banco] || t.banco}</span> · {titular?.nombre || "Sin titular"}
                      </div>
                      <div className="text-xs mt-1 flex flex-wrap gap-x-3 text-muted-foreground">
                        <span>Cupo: <strong className="font-mono text-foreground">{formatCOP(t.cupo)}</strong></span>
                        <span>Saldo: <strong className="font-mono text-foreground">{formatCOP(t.saldo)}</strong></span>
                      </div>
                    </div>
                    {isSelected && (
                      <label
                        onClick={(e) => {
                          e.stopPropagation();
                          setPermanenteId(t.id);
                        }}
                        className={`flex items-center gap-1.5 text-xs py-1 px-2 rounded-md cursor-pointer border transition-colors ${
                          isPermanente
                            ? "bg-primary text-primary-foreground border-primary font-medium"
                            : "bg-background text-muted-foreground border-border hover:text-foreground"
                        }`}
                      >
                        <input
                          type="radio"
                          name="permanente_tarjeta"
                          checked={isPermanente}
                          onChange={() => setPermanenteId(t.id)}
                          className="sr-only"
                        />
                        <span>{isPermanente ? "✓ Permanente" : "Hacer permanente"}</span>
                      </label>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Panel de validaciones y cálculo total */}
        {seleccionadasData.length >= 2 && (
          <div className="bg-muted/50 rounded-lg p-3 text-xs space-y-1.5 border border-border/60">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-semibold text-foreground">Validaciones:</span>
              <span className={`inline-flex items-center gap-1 font-medium ${mismoBanco ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                {mismoBanco ? "✓ Mismo banco" : "✗ Bancos diferentes (no permitido)"}
              </span>
              <span className={`inline-flex items-center gap-1 font-medium ${mismoTitular ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                {mismoTitular ? "✓ Mismo titular" : "✗ Titulares diferentes (no permitido)"}
              </span>
              {permanenteId ? (
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                  ✓ Permanente seleccionada
                </span>
              ) : (
                <span className="text-destructive font-medium">
                  ✗ Seleccione la tarjeta permanente
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/40 font-mono text-xs">
              <div>
                Cupo total unificado: <strong className="text-foreground text-sm">{formatCOP(cupoTotal)}</strong>
              </div>
              <div>
                Saldo total trasladado: <strong className="text-foreground text-sm">{formatCOP(saldoTotal)}</strong>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded p-2 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <DialogFooter className="pt-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={!puedeConfirmar || saving}>
            {saving ? "Procesando unificación..." : "Confirmar Unificación"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}