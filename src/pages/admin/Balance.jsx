import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, ChevronRight, Search, ChevronDown } from "lucide-react";
import { formatCOP, formatMonthYear } from "@/lib/contabilidad";
import CuentaMovimientosDialog from "@/components/balance/CuentaMovimientosDialog";

const claseLabels = { activo: "Activo", pasivo: "Pasivo", patrimonio: "Patrimonio", ingreso: "Ingresos", gasto: "Gastos" };
const claseOrder = ["activo", "pasivo", "patrimonio", "ingreso", "gasto"];

export default function Balance() {
  const navigate = useNavigate();
  const [saldos, setSaldos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [periodos, setPeriodos] = useState([]);
  const [periodoSel, setPeriodoSel] = useState("");
  const [search, setSearch] = useState("");
  const [expandidos, setExpandidos] = useState({});
  const [pucCuentas, setPucCuentas] = useState({});
  const [dialogCuenta, setDialogCuenta] = useState(null);

  useEffect(() => {
    base44.entities.Cuenta.filter({ nivel: "Cuenta" }, "codigo", 500).then((cuentas) => {
      const m = {};
      cuentas.forEach((c) => { m[String(c.codigo)] = c.concepto; });
      setPucCuentas(m);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    base44.functions.invoke("calcularTotales", { periodo: periodoSel || null }).then((res) => {
      setSaldos(res.data.saldos);
      if (periodoSel === "" || !periodoSel) {
        setPeriodos(res.data.periodos);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [periodoSel]);

  const toggleGrupo = (key) => setExpandidos((e) => ({ ...e, [key]: !e[key] }));

  const saldosFiltrados = useMemo(() => {
    if (!search.trim()) return saldos;
    const s = search.toLowerCase();
    return saldos.filter((it) =>
      String(it.codigo).includes(s) || (it.nombre || "").toLowerCase().includes(s)
    );
  }, [saldos, search]);

  const groupedByClase = useMemo(() => {
    const groups = {};
    saldosFiltrados.forEach((s) => {
      if (!groups[s.clase]) groups[s.clase] = [];
      groups[s.clase].push(s);
    });
    return groups;
  }, [saldosFiltrados]);

  // Dentro de cada clase, agrupar por cuenta (prefijo de 4 dígitos del código)
  const groupedByCuenta = (items) => {
    const map = {};
    items.forEach((it) => {
      const cuentaKey = String(it.codigo).substring(0, 4);
      if (!map[cuentaKey]) map[cuentaKey] = [];
      map[cuentaKey].push(it);
    });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  };

  if (loading) return <div className="p-8 text-muted-foreground flex items-center gap-2">
    <div className="w-4 h-4 border-2 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
    Cargando saldos...
  </div>;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cuenta por código o nombre..." className="pl-9" />
        </div>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setPeriodoSel("")} className={!periodoSel ? "bg-muted" : ""}>
            Todos los períodos
          </Button>
          {periodos.length > 0 && (
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => {
                const idx = periodos.indexOf(periodoSel);
                if (idx < periodos.length - 1) setPeriodoSel(periodos[idx + 1]);
              }} disabled={!periodoSel || periodos.indexOf(periodoSel) >= periodos.length - 1}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm font-medium min-w-[100px] text-center">
                {periodoSel ? formatMonthYear(periodoSel) : "Todos"}
              </span>
              <Button variant="ghost" size="icon" onClick={() => {
                const idx = periodos.indexOf(periodoSel);
                if (idx > 0) setPeriodoSel(periodos[idx - 1]);
              }} disabled={!periodoSel || periodos.indexOf(periodoSel) <= 0}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {periodos.length > 0 && !search && (
        <div className="flex flex-wrap gap-2">
          {periodos.map((p) => (
            <Button key={p} variant={periodoSel === p ? "default" : "outline"} size="sm" onClick={() => setPeriodoSel(p)}>
              {formatMonthYear(p)}
            </Button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {claseOrder.map((clase) => {
          const items = groupedByClase[clase];
          if (!items || items.length === 0) return null;
          const total = items.reduce((s, i) => s + i.saldo, 0);
          return (
            <Card key={clase}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base">
                  <span>{claseLabels[clase]}</span>
                  <span className="text-sm font-mono text-muted-foreground">{formatCOP(total)}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <tbody>
                    {groupedByCuenta(items).map(([cuentaKey, subItems]) => {
                      const cuentaTotal = subItems.reduce((s, i) => s + i.saldo, 0);
                      const debitoTotal = subItems.reduce((s, i) => s + i.debito, 0);
                      const creditoTotal = subItems.reduce((s, i) => s + i.credito, 0);
                      const nombreCuenta = pucCuentas[cuentaKey] || subItems[0]?.nombre || cuentaKey;
                      const expKey = clase + "-" + cuentaKey;
                      const abierto = expandidos[expKey];
                      return (
                        <React.Fragment key={cuentaKey}>
                          <tr
                            className="border-b border-border/50 hover:bg-muted/30 cursor-pointer bg-muted/20 transition-colors group"
                            onClick={() => {
                              navigate(`/admin/contabilidad/detalle-cuentas?cuenta=${cuentaKey}&periodo=${periodoSel || ""}`);
                            }}
                            title={`Ver detalle cronológico de movimientos de la cuenta ${cuentaKey}`}
                          >
                            <td className="px-4 py-2" colSpan={4}>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                  <span onClick={(e) => { e.stopPropagation(); toggleGrupo(expKey); }} className="inline-flex p-0.5 rounded hover:bg-muted" title={abierto ? "Contraer subcuentas" : "Desplegar subcuentas"}>
                                    {abierto ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                                  </span>
                                  <span className="font-mono text-xs text-primary font-bold group-hover:underline">{cuentaKey}</span>
                                  <span className="text-xs text-foreground/85 truncate font-medium">{nombreCuenta}</span>
                                </div>
                                <div className="flex items-center gap-3 text-xs font-mono text-muted-foreground pr-1">
                                  <span>D: {formatCOP(debitoTotal)}</span>
                                  <span>C: {formatCOP(creditoTotal)}</span>
                                  <span className={cuentaTotal >= 0 ? "text-success font-medium" : "text-destructive font-medium"}>Saldo: {formatCOP(cuentaTotal)}</span>
                                  <span className="text-[11px] font-sans text-primary font-medium group-hover:underline inline-flex items-center gap-0.5 ml-1">
                                    Ver Detalle <ChevronRight className="w-3 h-3" />
                                  </span>
                                </div>
                              </div>
                            </td>
                          </tr>
                          {abierto && subItems.map((s) => (
                            <tr
                              key={s.codigo}
                              className="border-b border-border/30 hover:bg-muted/30 cursor-pointer group"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/admin/contabilidad/detalle-cuentas?cuenta=${s.codigo}&periodo=${periodoSel || ""}`);
                              }}
                              title={`Ver detalle cronológico de la subcuenta ${s.codigo}`}
                            >
                              <td className="px-4 py-1.5 pl-9">
                                <div className="font-mono text-xs text-primary font-semibold group-hover:underline flex items-center gap-1">
                                  {s.codigo}
                                </div>
                                <div className="text-xs text-muted-foreground">{s.nombre}</div>
                              </td>
                              <td className="px-4 py-1.5 text-right font-mono text-xs">{formatCOP(s.debito)}</td>
                              <td className="px-4 py-1.5 text-right font-mono text-xs">{formatCOP(s.credito)}</td>
                              <td className={`px-4 py-1.5 text-right font-mono text-xs font-medium ${s.saldo >= 0 ? "text-success" : "text-destructive"}`}>
                                {formatCOP(s.saldo)}
                              </td>
                            </tr>
                          ))}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {saldosFiltrados.length === 0 && !loading && (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            {search ? "No se encontraron cuentas con ese criterio." : "No hay movimientos registrados para este período."}
          </CardContent>
        </Card>
      )}

      <CuentaMovimientosDialog
        open={!!dialogCuenta}
        onOpenChange={(v) => { if (!v) setDialogCuenta(null); }}
        cuentaKey={dialogCuenta?.cuentaKey}
        cuentaNombre={dialogCuenta?.cuentaNombre}
        clase={dialogCuenta?.clase}
        periodo={dialogCuenta?.periodo}
        periodos={periodos}
      />
    </div>
  );
}