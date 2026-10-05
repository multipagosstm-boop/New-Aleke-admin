import React from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { RefreshCw, RotateCcw, CheckCircle2, Gift, FileSearch, Trash2, SkipForward, AlertCircle, Calendar } from "lucide-react";
import { formatCOP, formatDate, BANCO_NAMES } from "@/lib/contabilidad";

export default function ExtractoCard({ extracto, producto, onRecalcular, onReversar, onAplicarSaldoFavor, onDelete, onOmitirPago, onReactivarPago, onCambiarPeriodo, recalcLoading }) {
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
  const esNoPagada = extracto.estado === "no_pagada";

  let badge;
  let progressColorClass;
  if (estaPagado) {
    badge = <Badge className="bg-emerald-600 text-white hover:bg-emerald-700">Pagado</Badge>;
    progressColorClass = "[&>div]:bg-emerald-600";
  } else if (esNoPagada) {
    badge = <Badge className="bg-amber-600 text-white hover:bg-amber-700">No pagada</Badge>;
    progressColorClass = "[&>div]:bg-amber-600";
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
    <Card className={estaPagado ? "border-emerald-500/40" : esNoPagada ? "border-amber-500/40 bg-amber-50/10" : ""}>
      <CardContent className="pt-5 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-medium flex items-center gap-1.5">
              {estaPagado && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
              {esNoPagada && <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />}
              <span className="truncate">{producto?.nombre || "—"}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
              {producto && <span>{BANCO_NAMES[producto.banco] || producto.banco} · </span>}
              <span className="font-semibold text-foreground">{extracto.periodo}</span>
              {onCambiarPeriodo && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onCambiarPeriodo(extracto);
                  }}
                  className="inline-flex items-center text-[11px] text-primary hover:underline hover:text-primary/80 transition-colors"
                  title="Cambiar el período de este extracto"
                >
                  <Calendar className="w-3 h-3 mr-0.5" /> Cambiar período
                </button>
              )}
              <span>· Vence: {formatDate(extracto.fecha_pago)}</span>
            </div>
          </div>
          {badge}
        </div>

        {estaPagado && saldoAFavor > 0 && (
          <div className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
            PAGADO — Saldo a favor: {formatCOP(saldoAFavor)}
          </div>
        )}

        {esNoPagada && (
          <div className="text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-100/50 dark:bg-amber-950/40 px-2 py-1 rounded">
            Pago omitido para este período (marcada como No Pagada)
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
              <div className="font-mono text-emerald-600 dark:text-emerald-400">{formatCOP(totalAbonado)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Pendiente</div>
              <div className="font-mono text-amber-700 dark:text-amber-400 font-semibold">{formatCOP(saldoPendiente)}</div>
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

        <div className="flex gap-2 pt-1 flex-wrap items-center">
          {!estaPagado && !esNoPagada && (
            <>
              <Button size="sm" type="button" variant="outline" onClick={() => onRecalcular(extracto)} disabled={recalcLoading}>
                <RefreshCw className={`w-3 h-3 mr-1 ${recalcLoading ? "animate-spin" : ""}`} /> Recalcular
              </Button>
              {onCambiarPeriodo && (
                <Button
                  size="sm"
                  type="button"
                  variant="outline"
                  className="text-primary border-primary/30 hover:bg-primary/5"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onCambiarPeriodo(extracto);
                  }}
                  title="Cambiar período del extracto"
                >
                  <Calendar className="w-3.5 h-3.5 mr-1" /> Cambiar período
                </Button>
              )}
              {onOmitirPago && (
                <Button
                  size="sm"
                  type="button"
                  variant="outline"
                  className="text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700/60 hover:bg-amber-50 dark:hover:bg-amber-950/30 font-medium"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onOmitirPago(extracto);
                  }}
                  title="Omitir o saltar pago (marcar como No Pagada)"
                >
                  <SkipForward className="w-3.5 h-3.5 mr-1 text-amber-600" /> Omitir pago
                </Button>
              )}
            </>
          )}

          {esNoPagada && onReactivarPago && (
            <Button
              size="sm"
              type="button"
              variant="outline"
              className="text-primary border-primary/40 hover:bg-primary/5 font-medium"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onReactivarPago(extracto);
              }}
              title="Reactivar y mover a Por Pagar"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1" /> Mover a Por Pagar
            </Button>
          )}

          {estaPagado && extracto.comprobante_id && (
            <Button
              size="sm"
              type="button"
              variant="outline"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onReversar(extracto);
              }}
            >
              <RotateCcw className="w-3 h-3 mr-1" /> Reversar
            </Button>
          )}
          {estaPagado && saldoAFavor > 0 && (
            <Button
              size="sm"
              type="button"
              variant="outline"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onAplicarSaldoFavor(extracto);
              }}
            >
              <Gift className="w-3 h-3 mr-1" /> Aplicar a favor
            </Button>
          )}
          {extracto.total_lineas_banco > 0 && (
            <Button size="sm" type="button" variant="secondary" onClick={() => navigate("/admin/conciliacion")}>
              <FileSearch className="w-3 h-3 mr-1" /> Ver en conciliación
            </Button>
          )}
          <Button
            size="sm"
            type="button"
            variant="ghost"
            className="text-destructive hover:text-destructive ml-auto"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDelete(extracto);
            }}
          >
            <Trash2 className="w-3 h-3 mr-1" /> Eliminar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}