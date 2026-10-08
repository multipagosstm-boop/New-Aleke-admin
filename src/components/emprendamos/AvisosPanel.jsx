import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Clock, CheckCircle2, UserCheck, Wallet, CreditCard } from "lucide-react";
import { formatCOP, formatDate } from "@/lib/contabilidad";
import { evaluarAlertasEmprendamos } from "@/lib/emprendamos";

export default function AvisosPanel({
  inscritos = [],
  creditos = [],
  abonos = [],
  clientes = [],
  onOpenAbono,
  onVerDetalle
}) {
  const alertas = evaluarAlertasEmprendamos(inscritos, creditos, abonos, 3);
  const clienteNombre = (cliId) => clientes.find((c) => c.id === cliId)?.nombre || "Cliente";

  return (
    <div className="space-y-4">
      {/* TARJETAS RESUMEN DE ALERTAS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <span className="text-xs text-muted-foreground font-medium block">Próximos Pagos (&le;3 días)</span>
              <span className="text-2xl font-bold text-amber-700 dark:text-amber-400">
                {alertas.proximosPagos.length}
              </span>
            </div>
            <Clock className="w-8 h-8 text-amber-500 opacity-80" />
          </CardContent>
        </Card>

        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <span className="text-xs text-muted-foreground font-medium block">Vencidos / Sin Pago</span>
              <span className="text-2xl font-bold text-destructive">
                {alertas.pagosVencidos.length}
              </span>
            </div>
            <AlertTriangle className="w-8 h-8 text-destructive opacity-80" />
          </CardContent>
        </Card>

        <Card className="border-blue-500/30 bg-blue-500/5">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <span className="text-xs text-muted-foreground font-medium block">Sin Abono en el Mes</span>
              <span className="text-2xl font-bold text-blue-700 dark:text-blue-400">
                {alertas.sinAbonoMes.length}
              </span>
            </div>
            <Wallet className="w-8 h-8 text-blue-500 opacity-80" />
          </CardContent>
        </Card>

        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <span className="text-xs text-muted-foreground font-medium block">Elegibles para Salida (&ge;1 año)</span>
              <span className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                {alertas.elegiblesSalida.length}
              </span>
            </div>
            <UserCheck className="w-8 h-8 text-emerald-500 opacity-80" />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* SECCIÓN 1: PRÓXIMOS PAGOS CON ANTICIPACIÓN */}
        <Card>
          <CardHeader className="py-3 px-4 border-b">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500" />
              Avisos de Cobro Anticipados (&le; 3 Días)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 space-y-2">
            {alertas.proximosPagos.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">
                No hay pagos con vencimiento en los próximos 3 días.
              </p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {alertas.proximosPagos.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 bg-background border rounded-lg flex items-center justify-between text-xs hover:bg-muted/30"
                  >
                    <div>
                      <span className="font-bold block text-foreground">
                        {clienteNombre(item.cliente.cliente_id)}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {item.credito.codigo} — Vence: {formatDate(item.fecha_vencimiento)} ({item.dias_restantes === 0 ? '¡Hoy!' : `en ${item.dias_restantes} día(s)`})
                      </span>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        Interés pendiente: <strong className="text-amber-600">{formatCOP(item.saldo_intereses)}</strong> | Capital: {formatCOP(item.saldo_capital)}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => onOpenAbono(item.cliente.id)}
                      >
                        Abonar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={() => onVerDetalle(item.cliente.id)}
                      >
                        Ver
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* SECCIÓN 2: CRÉDITOS EN MORA O VENCIDOS */}
        <Card>
          <CardHeader className="py-3 px-4 border-b">
            <CardTitle className="text-sm font-bold flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              Pagos Pendientes Vencidos
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 space-y-2">
            {alertas.pagosVencidos.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center flex items-center justify-center gap-1">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                Cartera al día. No hay cuotas vencidas.
              </p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {alertas.pagosVencidos.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 bg-destructive/5 border border-destructive/20 rounded-lg flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold">{clienteNombre(item.cliente.cliente_id)}</span>
                        <Badge variant="destructive" className="text-[10px]">
                          {item.dias_vencido} día(s) de atraso
                        </Badge>
                      </div>
                      <span className="text-[11px] text-muted-foreground">
                        {item.credito.codigo} — Venció el {formatDate(item.fecha_vencimiento)}
                      </span>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        Interés: <strong className="text-destructive">{formatCOP(item.saldo_intereses)}</strong> | Capital: {formatCOP(item.saldo_capital)}
                      </div>
                    </div>

                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-7 text-xs"
                      onClick={() => onOpenAbono(item.cliente.id)}
                    >
                      Cobrar
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* SECCIÓN 3: CONTROL DE CUPO Y CLIENTES AL LÍMITE */}
        <Card>
          <CardHeader className="py-3 px-4 border-b">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-primary" />
              Gestión de Cupo — Clientes al Límite (&le;10% disponible)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 space-y-2">
            {alertas.cupoAlLimite.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">
                Todos los clientes tienen holgura en sus cupos asignados.
              </p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {alertas.cupoAlLimite.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 bg-background border rounded-lg flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-bold block">{clienteNombre(item.cliente.cliente_id)}</span>
                      <div className="flex gap-2 text-[11px] text-muted-foreground">
                        <span>Cupo Total: {formatCOP(item.cupo_asignado)}</span>
                        <span>Usado: {formatCOP(item.cupo_usado)}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-destructive font-bold block">
                        Disp: {formatCOP(item.cupo_disponible)}
                      </span>
                      <Badge variant="outline" className="text-[9px] text-amber-600 border-amber-300">
                        {item.porcentaje_disponible.toFixed(0)}% restante
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* SECCIÓN 4: CLIENTES ELEGIBLES PARA SALIDA (≥ 1 AÑO) */}
        <Card>
          <CardHeader className="py-3 px-4 border-b">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-emerald-600" />
              Elegibles para Salida y Entrega de Productos (&ge; 1 Año)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 space-y-2">
            {alertas.elegiblesSalida.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">
                Ningún cliente activo ha cumplido el periodo mínimo de 1 año aún.
              </p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {alertas.elegiblesSalida.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 bg-emerald-500/5 border border-emerald-500/20 rounded-lg flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-bold block">{clienteNombre(item.cliente.cliente_id)}</span>
                      <span className="text-[11px] text-muted-foreground">
                        Ingresó: {formatDate(item.fecha_ingreso)} | Cumplió 1 año el {formatDate(item.fecha_eligible)}
                      </span>
                      <span className="text-[10px] text-muted-foreground block mt-0.5">
                        Saldo remanente a traspasar: <strong>{formatCOP(item.saldo_pendiente)}</strong>
                      </span>
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs border-emerald-400 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50"
                      onClick={() => onVerDetalle(item.cliente.id)}
                    >
                      Gestionar Salida
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
