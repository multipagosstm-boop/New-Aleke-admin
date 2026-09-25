import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, FileBarChart } from "lucide-react";
import { formatCOP } from "@/lib/contabilidad";

function previousMonth(fecha) {
  const d = new Date(fecha + "T00:00:00");
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().substring(0, 7);
}

export default function EstadoCuentaDialog({ open, onOpenChange, inscrito }) {
  const [periodo, setPeriodo] = useState(previousMonth(new Date().toISOString().substring(0, 10)));
  const [estado, setEstado] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !inscrito) return;
    setEstado(null); setError("");
    setLoading(true);
    base44.functions.invoke("gestionarEmprendamos", { accion: "generarEstadoCuenta", emprendamos_cliente_id: inscrito.id, periodo })
      .then((res) => setEstado(res?.data || res))
      .catch((e) => setError(e?.data?.error || e?.message || "Error"))
      .finally(() => setLoading(false));
  }, [open, inscrito, periodo]);

  if (!inscrito) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileBarChart className="w-5 h-5 text-primary" /> Estado de cuenta — {inscrito._clienteNombre || ""}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-end gap-3">
            <div><Label>Período (YYYY-MM)</Label><Input value={periodo} onChange={(e) => setPeriodo(e.target.value)} placeholder="2026-08" /></div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : estado ? (
            <>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <Resumen label="Saldo inicial" value={formatCOP(estado.saldo_inicial)} />
                <Resumen label="Intereses generados" value={formatCOP(estado.intereses_generados)} tone="primary" />
                <Resumen label="Préstamos hechos" value={formatCOP(estado.prestamos_hechos)} />
                <Resumen label="Abonos del mes" value={formatCOP(estado.abonos)} tone="success" />
                <div className="col-span-2"><Resumen label="Saldo final" value={formatCOP(estado.saldo_final)} tone="destructive" big /></div>
              </div>

              <Detalle titulo="Intereses generados" rows={(estado.detalle_intereses || []).map((i) => [i.capital_base ? `Crédito base ${formatCOP(i.capital_base)}` : "—", formatCOP(i.intereses)])} />
              <Detalle titulo="Préstamos hechos" rows={(estado.detalle_prestamos || []).map((p) => [`${p.codigo} · ${p.tipo}`, formatCOP(p.capital)])} />
              <Detalle titulo="Abonos del mes" rows={(estado.detalle_abonos || []).map((a) => [`${a.fecha} · ${a.tipo}`, formatCOP(a.valor)])} />
              <Detalle titulo="Créditos actuales" rows={(estado.creditos || []).map((c) => [`${c.codigo} · ${c.tipo} (${c.estado})`, `${formatCOP(c.saldo_capital)} cap. + ${formatCOP(c.saldo_intereses)} int.`])} />
            </>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Resumen({ label, value, tone = "", big = false }) {
  const toneClass = tone === "primary" ? "text-primary" : tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-md border border-border bg-muted/30 px-3 py-2 flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`font-mono font-semibold ${toneClass} ${big ? "text-lg" : "text-sm"}`}>{value}</span>
    </div>
  );
}

function Detalle({ titulo, rows }) {
  if (!rows || rows.length === 0) return null;
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-1">{titulo}</h4>
      <div className="border border-border rounded-md divide-y divide-border/50 text-xs">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center justify-between px-3 py-1.5">
            <span>{r[0]}</span><span className="font-mono">{r[1]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}