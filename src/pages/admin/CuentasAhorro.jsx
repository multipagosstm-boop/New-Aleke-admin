import React, { useEffect, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Ban, Trash2, Eye, AlertTriangle, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { formatCOP, BANCO_NAMES } from "@/lib/contabilidad";
import CuentaAhorroForm from "@/components/admin/CuentaAhorroForm";
import CuentaAhorroDetail from "@/components/admin/CuentaAhorroDetail";

export default function CuentasAhorro() {
  const [cuentas, setCuentas] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [config, setConfig] = useState(null);
  const [pucTransaccional, setPucTransaccional] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detailCuenta, setDetailCuenta] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [acumuladoPorSubcuenta, setAcumuladoPorSubcuenta] = useState({});

  const loadData = useCallback(async () => {
    try {
      const mesActual = new Date().toISOString().substring(0, 7);
      const [cdas, clients, configs, puc, movs, comps] = await Promise.all([
        base44.entities.CuentaAhorro.list(),
        base44.entities.Cliente.list(),
        base44.entities.Configuracion.list(),
        base44.entities.Cuenta.filter({ es_transaccional: true }, "codigo", 300),
        base44.entities.MovimientoContable.filter({ estado: "activo", periodo_operacion: mesActual }, "-fecha", 5000),
        base44.entities.ComprobanteContable.list("-fecha", 5000)
      ]);
      // Excluir notas crédito de anulación (espejo) — mismo criterio que el Balance.
      const idsNotasAnulacion = new Set(
        comps.filter((c) => c.tipo === "nota_credito" && c.comprobante_origen_id).map((c) => c.id)
      );
      // Acumulado mensual por subcuenta: suma de créditos (salidas) del mes en curso.
      const acum = {};
      for (const m of movs) {
        if (idsNotasAnulacion.has(m.comprobante_id)) continue;
        const cred = Number(m.credito) || 0;
        if (!cred) continue;
        acum[m.subcuenta] = (acum[m.subcuenta] || 0) + cred;
      }
      setCuentas(cdas);
      setClientes(clients);
      setConfig(configs[0] || null);
      setPucTransaccional(puc);
      setAcumuladoPorSubcuenta(acum);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const clienteMap = {};
  clientes.forEach((c) => { clienteMap[c.id] = c; });

  const pucMap = {};
  pucTransaccional.forEach((c) => { pucMap[String(c.codigo)] = c; });

  const UMBRAL_GMF_CERCANO = 2000000;

  const cuentasFiltradas = cuentas.filter((cda) => {
    if (!busqueda.trim()) return true;
    const q = busqueda.toLowerCase().trim();
    const titular = clienteMap[cda.titular_id];
    const campos = [
      cda.nombre,
      cda.numero_completo,
      cda.banco,
      BANCO_NAMES[cda.banco] || "",
      titular?.nombre || "",
      cda.subcuenta_puc,
      cda.nota,
    ].filter(Boolean);
    return campos.some((c) => c.toLowerCase().includes(q));
  });

  const handleSave = () => { loadData(); setEditing(null); };

  const handleToggleEstado = async (cda) => {
    await base44.entities.CuentaAhorro.update(cda.id, { estado: cda.estado === "activa" ? "inactiva" : "activa" });
    loadData();
  };

  const handleDelete = async (cda) => {
    if (!confirm(`¿Eliminar la cuenta ${cda.nombre}? Esta acción no se puede deshacer.`)) return;
    await base44.entities.CuentaAhorro.delete(cda.id);
    loadData();
  };

  if (loading) return <div className="p-8 text-muted-foreground">Cargando cuentas de ahorro...</div>;

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative w-full sm:max-w-xs">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar CDA por nombre, número, banco o titular..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground whitespace-nowrap">
            {cuentasFiltradas.length} de {cuentas.length} cuenta(s) · {cuentas.filter((c) => c.estado === "activa").length} activa(s)
          </div>
          <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus className="w-4 h-4 mr-2" /> Nueva Cuenta
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-[10px] text-muted-foreground uppercase mb-1">Total disponible</div>
            <div className="text-xl font-heading font-bold">{formatCOP(cuentas.filter((c) => c.estado === "activa").reduce((s, c) => s + (Number(c.saldo) || 0), 0))}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Cuentas activas</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-[10px] text-muted-foreground uppercase mb-1">Disponible Bancolombia</div>
            <div className="text-xl font-heading font-bold text-primary">{formatCOP(cuentas.filter((c) => c.estado === "activa" && c.banco === "BA").reduce((s, c) => s + (Number(c.saldo) || 0), 0))}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Cuentas de ahorro</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-[10px] text-muted-foreground uppercase mb-1">Disponible Davivienda</div>
            <div className="text-xl font-heading font-bold text-primary">{formatCOP(cuentas.filter((c) => c.estado === "activa" && c.banco === "DA").reduce((s, c) => s + (Number(c.saldo) || 0), 0))}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Cuentas de ahorro</div>
          </CardContent>
        </Card>
      </div>

      {cuentas.length === 0 ? (
        <Card><CardContent className="pt-6 text-center text-muted-foreground">No hay cuentas de ahorro registradas.</CardContent></Card>
      ) : cuentasFiltradas.length === 0 ? (
        <Card><CardContent className="pt-6 text-center text-muted-foreground">No se encontraron cuentas con "{busqueda}".</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {cuentasFiltradas.map((cda) => {
            const titular = clienteMap[cda.titular_id];
            const acumuladoMes = Number(acumuladoPorSubcuenta[String(cda.subcuenta_puc)] || 0);
            const gmfPct = config && config.gmf_limite > 0 ? (acumuladoMes / config.gmf_limite) * 100 : 0;
            const gmfColor = gmfPct > 100 ? "bg-destructive" : gmfPct > 80 ? "bg-warning" : "bg-success";
            const gmfRestante = config ? (config.gmf_limite || 0) - acumuladoMes : 0;
            const gmfCercano = config && gmfRestante > 0 && gmfRestante <= UMBRAL_GMF_CERCANO;
            return (
              <Card key={cda.id} className={cda.estado === "inactiva" ? "opacity-60" : ""}>
                <CardContent className="pt-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-heading font-semibold text-base">{cda.nombre}</span>
                        <Badge variant={cda.estado === "activa" ? "default" : "secondary"} className="text-xs">
                          {cda.estado === "activa" ? "Activa" : "Inactiva"}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {BANCO_NAMES[cda.banco] || cda.banco} · {titular?.nombre || "Sin titular"}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setDetailCuenta(cda)}>
                        <Eye className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setEditing(cda); setFormOpen(true); }}>
                        <Edit className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleToggleEstado(cda)}>
                        <Ban className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleDelete(cda)}>
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>

                  <div className={`text-2xl font-heading font-bold mb-1 ${cda.saldo < 0 ? "text-destructive" : "text-foreground"}`}>
                    {formatCOP(cda.saldo)}
                  </div>
                  {cda.saldo < 0 && (
                    <div className="flex items-center gap-1 text-xs text-destructive mb-2">
                      <AlertTriangle className="w-3 h-3" /> Saldo negativo — revisar cuenta
                    </div>
                  )}

                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Movimientos acumulado (mes)</span>
                      <span className="font-mono">{formatCOP(acumuladoMes)}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Límite GMF ({config?.gmf_año || "—"})</span>
                      <span className="font-mono">{formatCOP(config?.gmf_limite || 0)}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                        <div className={`h-full ${gmfColor} transition-all`} style={{ width: `${Math.min(gmfPct, 100)}%` }} />
                      </div>
                      <span className={`font-mono ${gmfPct > 100 ? "text-destructive" : gmfPct > 80 ? "text-warning" : "text-muted-foreground"}`}>
                        {gmfPct.toFixed(1)}%
                      </span>
                    </div>
                    {gmfPct > 100 && (
                      <div className="flex items-center gap-1 text-destructive">
                        <AlertTriangle className="w-3 h-3" /> Supera límite GMF
                      </div>
                    )}
                    {gmfCercano && gmfPct <= 100 && (
                      <div className="mt-2 flex items-start gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-destructive">
                        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        <div className="text-xs leading-tight">
                          <span className="font-semibold">Cerca del límite GMF</span> — quedan {formatCOP(gmfRestante)} de margen. Evita nuevos movimientos para no superar el tope exento.
                        </div>
                      </div>
                    )}
                  </div>
                  {cda.nota && <div className="mt-3 text-xs text-muted-foreground italic border-t border-border pt-2">{cda.nota}</div>}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <CuentaAhorroForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSaved={handleSave}
        editing={editing}
        clientes={clientes}
        pucTransaccional={pucTransaccional}
      />

      <CuentaAhorroDetail
        open={!!detailCuenta}
        onOpenChange={(v) => { if (!v) setDetailCuenta(null); }}
        cuenta={detailCuenta}
        titular={detailCuenta ? clienteMap[detailCuenta.titular_id] : null}
        pucCuenta={detailCuenta ? pucMap[detailCuenta.subcuenta_puc] : null}
        acumuladoMes={detailCuenta ? (Number(acumuladoPorSubcuenta[String(detailCuenta.subcuenta_puc)] || 0)) : 0}
      />
    </div>
  );
}