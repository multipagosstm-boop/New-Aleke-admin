import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCOP } from "@/lib/contabilidad";

export default function Estados() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.functions.invoke("calcularTotales", {}).then((res) => {
      const saldos = res.data.saldos || [];
      const t = res.data.totales || {};
      const activo = saldos.filter((s) => s.clase === "activo").sort((a, b) => a.codigo.localeCompare(b.codigo));
      const pasivo = saldos.filter((s) => s.clase === "pasivo").sort((a, b) => a.codigo.localeCompare(b.codigo));
      const patrimonio = saldos.filter((s) => s.clase === "patrimonio").sort((a, b) => a.codigo.localeCompare(b.codigo));
      const ingresos = saldos.filter((s) => s.clase === "ingreso").sort((a, b) => a.codigo.localeCompare(b.codigo));
      const gastos = saldos.filter((s) => s.clase === "gasto").sort((a, b) => a.codigo.localeCompare(b.codigo));
      setData({
        activo, pasivo, patrimonio, ingresos, gastos,
        totalActivo: t.activo || 0, totalPasivo: t.pasivo || 0, totalPatrimonio: t.patrimonio || 0,
        totalIngresos: t.ingreso || 0, totalGastos: t.gasto || 0, utilidad: t.utilidad || 0
      });
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 text-muted-foreground flex items-center gap-2">
    <div className="w-4 h-4 border-2 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
    Generando estados...
  </div>;

  if (!data) return <div className="p-8 text-muted-foreground">Sin datos.</div>;

  return (
    <div className="p-6 space-y-6">
      <Card>
        <CardHeader><CardTitle className="text-lg">Estado de Situación Financiera (Balance General)</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div>
              <h3 className="font-heading font-semibold mb-3 text-primary">ACTIVO</h3>
              <table className="w-full text-sm mb-4">
                <tbody>
                  {data.activo.map((s) => (
                    <tr key={s.codigo} className="border-b border-border/30">
                      <td className="py-1.5"><span className="font-mono text-xs text-muted-foreground mr-2">{s.codigo}</span>{s.nombre}</td>
                      <td className="py-1.5 text-right font-mono">{formatCOP(s.saldo)}</td>
                    </tr>
                  ))}
                  {data.activo.length === 0 && <tr><td colSpan={2} className="py-4 text-muted-foreground text-center">Sin movimientos</td></tr>}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border font-bold">
                    <td className="pt-2">TOTAL ACTIVO</td>
                    <td className="pt-2 text-right font-mono text-primary">{formatCOP(data.totalActivo)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div>
              <h3 className="font-heading font-semibold mb-3 text-destructive">PASIVO</h3>
              <table className="w-full text-sm mb-4">
                <tbody>
                  {data.pasivo.map((s) => (
                    <tr key={s.codigo} className="border-b border-border/30">
                      <td className="py-1.5"><span className="font-mono text-xs text-muted-foreground mr-2">{s.codigo}</span>{s.nombre}</td>
                      <td className="py-1.5 text-right font-mono">{formatCOP(s.saldo)}</td>
                    </tr>
                  ))}
                  {data.pasivo.length === 0 && <tr><td colSpan={2} className="py-4 text-muted-foreground text-center">Sin movimientos</td></tr>}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border font-bold">
                    <td className="pt-2">TOTAL PASIVO</td>
                    <td className="pt-2 text-right font-mono">{formatCOP(data.totalPasivo)}</td>
                  </tr>
                </tfoot>
              </table>
              <h3 className="font-heading font-semibold mb-3 text-success">PATRIMONIO</h3>
              <table className="w-full text-sm mb-4">
                <tbody>
                  {data.patrimonio.map((s) => (
                    <tr key={s.codigo} className="border-b border-border/30">
                      <td className="py-1.5"><span className="font-mono text-xs text-muted-foreground mr-2">{s.codigo}</span>{s.nombre}</td>
                      <td className="py-1.5 text-right font-mono">{formatCOP(s.saldo)}</td>
                    </tr>
                  ))}
                  <tr className="border-b border-border/30">
                    <td className="py-1.5 font-medium">{data.utilidad >= 0 ? "Utilidad del Ejercicio" : "Pérdida del Ejercicio"}</td>
                    <td className={`py-1.5 text-right font-mono ${data.utilidad >= 0 ? "text-success" : "text-destructive"}`}>{formatCOP(data.utilidad)}</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border font-bold">
                    <td className="pt-2">TOTAL PASIVO + PATRIMONIO</td>
                    <td className="pt-2 text-right font-mono text-primary">{formatCOP(data.totalPasivo + data.totalPatrimonio + data.utilidad)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
          <div className="mt-4 p-4 rounded-lg bg-muted/50 flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Diferencia (Activo - Pasivo - Patrimonio - Utilidad)</span>
            <span className={`font-mono font-bold ${Math.abs(data.totalActivo - data.totalPasivo - data.totalPatrimonio - data.utilidad) < 1 ? "text-success" : "text-destructive"}`}>
              {formatCOP(data.totalActivo - data.totalPasivo - data.totalPatrimonio - data.utilidad)}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">Estado de Resultados</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground uppercase border-b border-border">
                <th className="py-2 font-medium">Cuenta</th>
                <th className="py-2 font-medium text-right">Monto</th>
              </tr>
            </thead>
            <tbody>
              <tr><td colSpan={2} className="pt-3 pb-1 font-heading font-semibold text-success">INGRESOS</td></tr>
              {data.ingresos.map((s) => (
                <tr key={s.codigo} className="border-b border-border/30">
                  <td className="py-1.5 pl-4"><span className="font-mono text-xs text-muted-foreground mr-2">{s.codigo}</span>{s.nombre}</td>
                  <td className="py-1.5 text-right font-mono">{formatCOP(s.saldo)}</td>
                </tr>
              ))}
              {data.ingresos.length === 0 && <tr><td colSpan={2} className="py-2 pl-4 text-muted-foreground">Sin ingresos registrados</td></tr>}
              <tr className="border-t border-border font-medium">
                <td className="py-2">Total Ingresos</td>
                <td className="py-2 text-right font-mono text-success">{formatCOP(data.totalIngresos)}</td>
              </tr>
              <tr><td colSpan={2} className="pt-3 pb-1 font-heading font-semibold text-destructive">GASTOS</td></tr>
              {data.gastos.map((s) => (
                <tr key={s.codigo} className="border-b border-border/30">
                  <td className="py-1.5 pl-4"><span className="font-mono text-xs text-muted-foreground mr-2">{s.codigo}</span>{s.nombre}</td>
                  <td className="py-1.5 text-right font-mono">({formatCOP(s.saldo)})</td>
                </tr>
              ))}
              {data.gastos.length === 0 && <tr><td colSpan={2} className="py-2 pl-4 text-muted-foreground">Sin gastos registrados</td></tr>}
              <tr className="border-t border-border font-medium">
                <td className="py-2">Total Gastos</td>
                <td className="py-2 text-right font-mono text-destructive">({formatCOP(data.totalGastos)})</td>
              </tr>
              <tr className="border-t-2 border-border">
                <td className="pt-3 font-bold text-base">{data.utilidad >= 0 ? "UTILIDAD NETA" : "PÉRDIDA NETA"}</td>
                <td className={`pt-3 text-right font-mono font-bold text-base ${data.utilidad >= 0 ? "text-success" : "text-destructive"}`}>{formatCOP(data.utilidad)}</td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}