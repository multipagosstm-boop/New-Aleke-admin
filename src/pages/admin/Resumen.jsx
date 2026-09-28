import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, Scale, Wallet, AlertTriangle, CheckCircle2, DollarSign, Plus, Landmark } from "lucide-react";
import { formatCOP, formatNumber } from "@/lib/contabilidad";

export default function Resumen() {
  const [totales, setTotales] = useState(null);
  const [totalMovimientos, setTotalMovimientos] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dollarRate, setDollarRate] = useState(null);
  const [dollarLoading, setDollarLoading] = useState(true);
  const [cdaList, setCdaList] = useState([]);

  useEffect(() => {
    base44.functions.invoke("calcularTotales", {}).then((res) => {
      setTotales(res.data.totales);
      setTotalMovimientos(res.data.totalMovimientos);
      setLoading(false);
    }).catch(() => setLoading(false));
    base44.entities.CuentaAhorro.list().then(setCdaList).catch(() => {});
  }, []);

  const cdaActivas = cdaList.filter((c) => c.estado === "activa");
  const totalDisponible = cdaActivas.reduce((s, c) => s + (Number(c.saldo) || 0), 0);
  const dispBancolombia = cdaActivas.filter((c) => c.banco === "BA").reduce((s, c) => s + (Number(c.saldo) || 0), 0);
  const dispDavivienda = cdaActivas.filter((c) => c.banco === "DA").reduce((s, c) => s + (Number(c.saldo) || 0), 0);

  useEffect(() => {
    base44.integrations.Core.InvokeLLM({
      prompt: "¿Cuál es la TRM (Tasa Representativa del Mercado) del dólar en Colombia para hoy? Indica el valor en pesos colombianos por cada dólar USD.",
      add_context_from_internet: true,
      model: "gemini-3.8-flash",
      response_json_schema: {
        type: "object",
        properties: {
          trm: { type: "number", description: "Valor del dólar en pesos colombianos" },
          fecha: { type: "string", description: "Fecha de vigencia" },
          fuente: { type: "string" }
        }
      }
    }).then((res) => {
      setDollarRate(res);
      setDollarLoading(false);
    }).catch(() => setDollarLoading(false));
  }, []);

  if (loading) return <div className="p-8 text-muted-foreground flex items-center gap-2">
    <div className="w-4 h-4 border-2 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
    Calculando resumen...
  </div>;

  if (!totales) return <div className="p-8 text-muted-foreground">Sin datos.</div>;

  const cards = [
    { label: "Total Activo", value: totales.activo, icon: TrendingUp, color: "text-primary" },
    { label: "Total Pasivo", value: totales.pasivo, icon: TrendingDown, color: "text-destructive" },
    { label: "Total Patrimonio", value: totales.patrimonio, icon: Wallet, color: "text-success" },
    { label: "Total Ingresos", value: totales.ingreso, icon: TrendingUp, color: "text-success" },
    { label: "Total Gastos", value: totales.gasto, icon: TrendingDown, color: "text-destructive" },
    { label: totales.utilidad >= 0 ? "Utilidad" : "Pérdida", value: totales.utilidad, icon: Scale, color: totales.utilidad >= 0 ? "text-success" : "text-destructive" }
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-end">
        <Link to="/admin/contabilidad/libro-diario?nuevo=1">
          <Button>
            <Plus className="w-4 h-4 mr-2" /> Nuevo Registro Contable
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between mb-2">
                <span className="text-sm text-muted-foreground">{c.label}</span>
                <c.icon className={`w-5 h-5 ${c.color}`} />
              </div>
              <div className={`text-2xl font-heading font-bold ${c.color}`}>
                {formatCOP(c.value)}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className={Math.abs(totales.balanceDiff) < 1 ? "border-success/50" : "border-destructive/50"}>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            {Math.abs(totales.balanceDiff) < 1 ? (
              <CheckCircle2 className="w-12 h-12 text-success" />
            ) : (
              <AlertTriangle className="w-12 h-12 text-destructive" />
            )}
            <div className="flex-1">
              <div className="text-sm text-muted-foreground mb-1">Estado del Sistema</div>
              <div className="text-xl font-heading font-bold">
                {Math.abs(totales.balanceDiff) < 1 ? "Sistema Cuadrado" : "Sistema Descuadrado"}
              </div>
              {Math.abs(totales.balanceDiff) >= 1 && (
                <div className="text-sm text-destructive mt-1">
                  Diferencia: {formatCOP(totales.balanceDiff)}
                </div>
              )}
            </div>
            <Badge variant={Math.abs(totales.balanceDiff) < 1 ? "default" : "destructive"} className="text-sm">
              {Math.abs(totales.balanceDiff) < 1 ? "BALANCE OK" : "REVISAR"}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <h3 className="font-heading font-semibold mb-3 flex items-center gap-2">
            <Landmark className="w-4 h-4 text-primary" /> Disponible — Cuentas de Ahorro y Efectivo
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Total disponible</span><span className="font-mono font-bold">{formatCOP(totalDisponible)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Bancolombia</span><span className="font-mono">{formatCOP(dispBancolombia)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Davivienda</span><span className="font-mono">{formatCOP(dispDavivienda)}</span></div>
            <div className="border-t border-border pt-2 text-xs text-muted-foreground">
              {cdaActivas.length} cuenta(s) activa(s) · {cdaList.length} registrada(s)
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <h3 className="font-heading font-semibold mb-3">Ecuación Contable</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Activo</span><span className="font-mono">{formatCOP(totales.activo)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Pasivo + Patrimonio + Utilidad</span><span className="font-mono">{formatCOP(totales.pasivo + totales.patrimonio + totales.utilidad)}</span></div>
              <div className="border-t border-border pt-2 flex justify-between font-medium">
                <span>Diferencia</span>
                <span className={Math.abs(totales.balanceDiff) < 1 ? "text-success font-mono" : "text-destructive font-mono"}>{formatCOP(totales.balanceDiff)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <h3 className="font-heading font-semibold mb-3">Movimientos Registrados</h3>
            <div className="text-3xl font-heading font-bold text-primary">{totalMovimientos}</div>
            <div className="text-sm text-muted-foreground mt-1">movimientos contables activos</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <h3 className="font-heading font-semibold mb-3 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-success" /> Dólar (TRM) — Hoy
            </h3>
            {dollarLoading ? (
              <div className="text-sm text-muted-foreground">Consultando tasa...</div>
            ) : dollarRate ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground text-left">
                    <th className="pb-1 font-medium">Moneda</th>
                    <th className="pb-1 font-medium text-right">Tasa (COP)</th>
                    <th className="pb-1 font-medium">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-border/30">
                    <td className="py-2 font-medium">USD</td>
                    <td className="py-2 text-right font-mono font-bold text-success">${formatNumber(dollarRate.trm)}</td>
                    <td className="py-2 text-xs text-muted-foreground">{dollarRate.fecha}</td>
                  </tr>
                </tbody>
              </table>
            ) : (
              <div className="text-sm text-muted-foreground">No disponible</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}