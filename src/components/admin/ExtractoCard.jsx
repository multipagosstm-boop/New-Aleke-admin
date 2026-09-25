import React from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { RefreshCw, RotateCcw, CheckCircle2, Gift, FileSearch, Trash2 } from "lucide-react";
import { formatCOP, formatDate, BANCO_NAMES } from "@/lib/contabilidad";

export default function ExtractoCard({ extracto, producto, onRecalcular, onReversar, onAplicarSaldoFavor, onDelete, recalcLoading }) {
  const navigate = useNavigate();
  const porcentaje = Math.min(extracto.porcentaje_pagado || 0, 100);
  const totalAbonado = extracto.total_abonado || 0;
  const saldoPendiente = extracto.saldo_pendiente ?? extracto.saldo_a_pagar;
  const saldoAFavor = extracto.saldo_a_favor || 0;
  const gastosFinancieros =
    (extracto.cuota_manejo || 0) +
    (extracto.seguros || 0) +
    (extracto.intereses_corrientes || 0) +
    (extracto.intereses_mora || 0) +
    (extracto.comisiones || 0) +
    (extracto.otros_gastos || 0);

  const estaPagado = extracto.estado === "pagado";

  let badge;
  let progressColorClass;
  if (estaPagado) {
    badge = <Badge className="bg-success text-success-foreground">Pagado</Badge>;
    progressColorClass = "[&>div]:bg-success";
  } else if (totalAbonado > 0) {
    badge = <Badge className="bg-warning text-warning-foreground">Parcial</Badge>;
    progressColorClass = "[&>div]:bg-warning";
  } else {
    badge = <Badge variant="destructive">Sin abonos</Badge>;
    progressColorClass = "[&>div]:bg-destructive";
  }

  const tooltipText =
    `Saldo extracto: ${formatCOP(extracto.saldo_a_pagar)}\n` +
    `Total abonado: ${formatCOP(totalAbonado)}\n` +
    `Saldo pendiente: ${formatCOP(saldoPendiente)}\n` +
    `Porcentaje: ${Math.round(extracto.porcentaje_pagado || 0)}%`;

  return (
    <Card className={estaPagado ? "border-success/40" : ""}>
      <CardContent className="pt-5 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-medium flex items-center gap-1.5">
              {estaPagado && <CheckCircle2 className="w-4 h-4 text-success shrink-0" />}
              <span className="truncate">{producto?.nombre || "—"}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {producto && <span>{BANCO_NAMES[producto.banco] || producto.banco} · </span>}
              {extracto.periodo} · Vence: {formatDate(extracto.fecha_pago)}
            </div>
          </div>
          {badge}
        </div>

        {estaPagado && saldoAFavor > 0 && (
          <div className="text-sm font-medium text-success">
            PAGADO — Saldo a favor: {formatCOP(saldoAFavor)}
          </div>
        )}

        <div title={tooltipText}>
          <Progress value={porcentaje} className={`h-3 ${progressColorClass}`} />
        </div>
        <div className="text-xs text-center text-muted-foreground">
          {Math.round(extracto.porcentaje_pagado || 0)}% pagado
        </div>

        {!estaPagado && (
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Saldo extracto</div>
              <div className="font-mono">{formatCOP(extracto.saldo_a_pagar)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Abonado</div>
              <div className="font-mono text-success">{formatCOP(totalAbonado)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Pendiente</div>
              <div className="font-mono text-warning">{formatCOP(saldoPendiente)}</div>
            </div>
          </div>
        )}

        {!estaPagado && (
          <div className="text-xs text-muted-foreground">
            Gastos financieros: {formatCOP(gastosFinancieros)}
          </div>
        )}

        {extracto.total_lineas_banco > 0 && (
          <div className="text-xs flex items-center gap-1.5">
            <Badge variant="secondary" className="text-[10px]">
              {extracto.total_lineas_banco} movs. del extracto
            </Badge>
          </div>
        )}

        <div className="flex gap-2 pt-1 flex-wrap">
          {!estaPagado && (
            <Button size="sm" variant="outline" onClick={() => onRecalcular(extracto)} disabled={recalcLoading}>
              <RefreshCw className={`w-3 h-3 mr-1 ${recalcLoading ? "animate-spin" : ""}`} /> Recalcular
            </Button>
          )}
          {estaPagado && extracto.comprobante_id && (
            <Button size="sm" variant="outline" onClick={() => onReversar(extracto)}>
              <RotateCcw className="w-3 h-3 mr-1" /> Reversar
            </Button>
          )}
          {estaPagado && saldoAFavor > 0 && (
            <Button size="sm" variant="outline" onClick={() => onAplicarSaldoFavor(extracto)}>
              <Gift className="w-3 h-3 mr-1" /> Aplicar a favor
            </Button>
          )}
          {extracto.total_lineas_banco > 0 && (
            <Button size="sm" variant="secondary" onClick={() => navigate("/admin/conciliacion")}>
              <FileSearch className="w-3 h-3 mr-1" /> Ver en conciliación
            </Button>
          )}
          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive ml-auto" onClick={() => onDelete(extracto)}>
            <Trash2 className="w-3 h-3 mr-1" /> Eliminar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}