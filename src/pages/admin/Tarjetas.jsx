import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, Edit, Lock, Unlock, Eye, Search, RefreshCw, Layers, TrendingUp, Calendar, ShoppingCart, Target, Download } from "lucide-react";
import { formatCOP, BANCO_NAMES, TIPO_PRODUCTO, getCorteDisplayText } from "@/lib/contabilidad";
import TarjetaForm from "@/components/admin/TarjetaForm";
import ProductoCreditoDetail from "@/components/admin/ProductoCreditoDetail";
import ReemplazoTarjetaDialog from "@/components/admin/ReemplazoTarjetaDialog";
import UnificacionTarjetaDialog from "@/components/admin/UnificacionTarjetaDialog";
import AumentoCupoDialog from "@/components/admin/AumentoCupoDialog";

export default function Tarjetas() {
  const [productos, setProductos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [pucTransaccional, setPucTransaccional] = useState([]);
  const [movimientosMes, setMovimientosMes] = useState([]);
  const [extractos, setExtractos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detailProducto, setDetailProducto] = useState(null);
  const [search, setSearch] = useState("");
  const [reemplazoTarjeta, setReemplazoTarjeta] = useState(null);
  const [unifOpen, setUnifOpen] = useState(false);
  const [aumentoTarjeta, setAumentoTarjeta] = useState(null);

  const currentMonth = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }, []);

  const loadData = useCallback(async () => {
    try {
      const [prods, clients, puc, movsMes, extractos] = await Promise.all([
      base44.entities.ProductoCredito.list(),
      base44.entities.Cliente.list(),
      base44.entities.Cuenta.filter({ es_transaccional: true }, "codigo", 300),
      base44.entities.MovimientoContable.filter({
        tipo_movimiento_tdc: "compra",
        periodo_operacion: currentMonth,
        estado: "activo"
      }),
      base44.entities.ExtractoProducto.list()]
      );
      setProductos(prods);
      setClientes(clients);
      setPucTransaccional(puc);
      setMovimientosMes(movsMes);
      setExtractos(extractos);
    } catch (e) {console.error(e);}
    setLoading(false);
  }, [currentMonth]);

  useEffect(() => {loadData();}, [loadData]);

  const clienteMap = {};
  clientes.forEach((c) => {clienteMap[c.id] = c;});

  const pucMap = {};
  pucTransaccional.forEach((c) => {pucMap[String(c.codigo)] = c;});

  // Extracto pendiente más próximo a vencer por producto (para saldo a deber / próximo pago)
  const extractoPendientePorProducto = {};
  extractos.forEach((e) => {
    if (e.estado !== "pendiente_pago") return;
    const existing = extractoPendientePorProducto[e.producto_id];
    if (!existing || (e.fecha_pago || "9999-99-99") < (existing.fecha_pago || "9999-99-99")) {
      extractoPendientePorProducto[e.producto_id] = e;
    }
  });

  const handleSave = () => {loadData();setEditing(null);};

  const handleDescargarCSV = () => {
    const tdcs = productos.filter((p) => p.tipo === "TDC");
    const encabezado = ["Nombre", "Numero completo", "Sufijo (codigo interno)"];
    const filas = tdcs.map((p) => [
      p.nombre || "",
      p.numero_completo || "",
      p.codigo_interno || "",
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const csv = [encabezado.join(","), ...filas].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tarjetas_credito.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const cycleEstado = async (p) => {
    const estados = ["activo", "inactivo", "bloqueado"];
    const next = estados[(estados.indexOf(p.estado) + 1) % estados.length];
    await base44.entities.ProductoCredito.update(p.id, { estado: next });
    loadData();
  };

  const filtered = productos.filter((p) => {
    if (!search) return true;
    const s = search.toLowerCase();
    const titular = clienteMap[p.titular_id];
    return (
      (p.nombre || "").toLowerCase().includes(s) ||
      (p.nomenclatura || "").toLowerCase().includes(s) ||
      (BANCO_NAMES[p.banco] || p.banco || "").toLowerCase().includes(s) ||
      (titular?.nombre || "").toLowerCase().includes(s));

  });

  // Compras del mes agrupadas por tarjeta
  const comprasPorProducto = {};
  movimientosMes.forEach((m) => {
    const pid = m.producto_credito_id;
    if (!pid) return;
    if (!comprasPorProducto[pid]) comprasPorProducto[pid] = { count: 0, valor: 0 };
    comprasPorProducto[pid].count += 1;
    comprasPorProducto[pid].valor += (Number(m.debito) || Number(m.credito) || 0);
  });

  if (loading) return <div className="p-8 text-muted-foreground">Cargando productos...</div>;

  return (
    <div className="p-6 space-y-4">
      {/* Indicadores mensuales */}
      <div className="grid grid-cols-2 md:grid-cols-2 gap-3">
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="p-2 rounded-md bg-muted"><Layers className="w-4 h-4 text-muted-foreground" /></div>
            <div>
              <div className="text-[10px] text-muted-foreground uppercase">Total tarjetas</div>
              <div className="text-lg font-heading font-bold">{productos.length}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="p-2 rounded-md bg-success/10"><Lock className="w-4 h-4 text-success" /></div>
            <div>
              <div className="text-[10px] text-muted-foreground uppercase">Activas</div>
              <div className="text-lg font-heading font-bold text-success">{productos.filter((p) => p.estado === "activo").length}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre, código, banco o titular..." className="pl-9" />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/admin/financieros/metas-tarjetas">
              <Target className="w-4 h-4 mr-2" /> Metas
            </Link>
          </Button>
          <Button variant="outline" onClick={handleDescargarCSV} disabled={productos.filter((p) => p.tipo === "TDC").length === 0}>
            <Download className="w-4 h-4 mr-2" /> CSV
          </Button>
          <Button variant="outline" onClick={() => setUnifOpen(true)}>
            <Layers className="w-4 h-4 mr-2" /> Unificar
          </Button>
          <Button onClick={() => {setEditing(null);setFormOpen(true);}}>
            <Plus className="w-4 h-4 mr-2" /> Nuevo Producto
          </Button>
        </div>
      </div>

      {filtered.length === 0 ?
      <Card><CardContent className="pt-6 text-center text-muted-foreground">
          {search ? "No se encontraron tarjetas con ese criterio." : "No hay productos de crédito registrados."}
        </CardContent></Card> :

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => {
          const titular = clienteMap[p.titular_id];
          const disponible = (p.cupo || 0) - Math.abs(p.saldo || 0);
          const usoPct = p.cupo > 0 ? Math.abs(p.saldo || 0) / p.cupo * 100 : 0;
          const versionLabel = (p.version_consecutivo || 1) > 1 ? `v${p.version_consecutivo}` : null;
          const comprasTarjeta = comprasPorProducto[p.id] || { count: 0, valor: 0 };
          const esCredito = ["CH","LIB","CR"].includes(p.tipo);
          const esRotativo = p.tipo === "CR";
          const extPendiente = extractoPendientePorProducto[p.id];
          const saldoDeber = extPendiente?.saldo_pendiente || extPendiente?.saldo_a_pagar || Math.abs(p.saldo || 0);
          const fechaPago = extPendiente?.fecha_pago || "";
          const hoy = new Date(); hoy.setHours(0,0,0,0);
          const diasPago = fechaPago ? Math.ceil((new Date(fechaPago + "T00:00:00") - hoy) / 86400000) : null;
          return (
            <Card key={p.id} className={p.estado !== "activo" ? "opacity-70" : ""}>
                <CardContent className="pt-5">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="font-heading font-semibold text-base flex items-center gap-1.5">
                        {p.nombre}
                        {versionLabel && <Badge variant="secondary" className="text-[10px]">{versionLabel}</Badge>}
                      </div>
                      {p.nomenclatura &&
                    <div className="text-xs text-primary font-mono">{p.nomenclatura}</div>
                    }
                      {p.numero_completo &&
                    <div className="text-sm font-mono text-foreground/80 mt-1">
                          <span className="text-muted-foreground text-xs">N° </span>{p.numero_completo}
                        </div>
                    }
                    </div>
                    <Badge variant={p.estado === "activo" ? "default" : p.estado === "bloqueado" ? "destructive" : "secondary"} className="text-xs">
                      {p.estado}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mb-2">
                    {TIPO_PRODUCTO[p.tipo] || p.tipo} · {BANCO_NAMES[p.banco] || p.banco}
                  </div>
                  <div className="text-xs text-muted-foreground mb-3">
                    Titular: <span className="text-foreground">{titular?.nombre || "—"}</span>
                  </div>

                  {!esCredito && (
                  <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                    <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Corte:</span>
                    <Badge variant="outline" className="text-xs">{getCorteDisplayText(p)}</Badge>
                    {p.franquicia && <Badge variant="secondary" className="text-xs">{p.franquicia}</Badge>}
                    {p.categoria && <Badge variant="secondary" className="text-xs">{p.categoria}</Badge>}
                  </div>
                  )}

                  {esCredito ? (
                    <>
                      <div className="grid grid-cols-2 gap-2 text-center mb-3">
                        <div className="p-2 rounded-md bg-muted/50">
                          <div className="text-[10px] text-muted-foreground uppercase">Saldo a deber</div>
                          <div className="text-xs font-mono font-medium text-destructive">{formatCOP(saldoDeber)}</div>
                        </div>
                        <div className="p-2 rounded-md bg-muted/50">
                          <div className="text-[10px] text-muted-foreground uppercase">Pago mín.</div>
                          <div className="text-xs font-mono font-medium">{formatCOP(extPendiente?.saldo_a_pagar || saldoDeber)}</div>
                        </div>
                      </div>
                      {esRotativo && (
                        <div className="grid grid-cols-2 gap-2 text-center mb-3">
                          <div className="p-2 rounded-md bg-muted/50">
                            <div className="text-[10px] text-muted-foreground uppercase">Cupo</div>
                            <div className="text-xs font-mono font-medium">{formatCOP(p.cupo)}</div>
                          </div>
                          <div className="rounded-md bg-primary/10 py-2 px-1">
                            <div className="text-[10px] text-primary uppercase">Disponible</div>
                            <div className="text-xs font-mono font-medium text-primary">{formatCOP((p.cupo || 0) - Math.abs(p.saldo || 0))}</div>
                          </div>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 mb-3 rounded-md bg-primary/5 border border-primary/20 px-2.5 py-2">
                        <Calendar className="w-3.5 h-3.5 text-primary shrink-0" />
                        <span className="text-xs text-muted-foreground">Próximo pago:</span>
                        <span className="text-xs font-mono font-medium">{fechaPago || "—"}</span>
                        {diasPago !== null && (
                          <Badge variant={diasPago < 0 ? "destructive" : diasPago <= 7 ? "secondary" : "outline"} className="text-[10px] ml-auto">
                            {diasPago < 0 ? `${Math.abs(diasPago)}d mora` : `${diasPago}d`}
                          </Badge>
                        )}
                      </div>
                    </>
                  ) : (
                  <>
                  <div className="grid grid-cols-3 gap-2 text-center mb-3">
                    <div className="p-2 rounded-md bg-muted/50">
                      <div className="text-[10px] text-muted-foreground uppercase">Cupo</div>
                      <div className="text-xs font-mono font-medium">{formatCOP(p.cupo)}</div>
                    </div>
                    <div className="p-2 rounded-md bg-muted/50">
                      <div className="text-[10px] text-muted-foreground uppercase">Saldo</div>
                      <div className="text-xs font-mono font-medium text-destructive">{formatCOP(Math.abs(p.saldo || 0))}</div>
                    </div>
                    <div className="rounded-md bg-primary/10 py-2 px-1">
                      <div className="text-[10px] text-primary uppercase">Disponible</div>
                      <div className="text-xs font-mono font-medium text-primary">{formatCOP(disponible)}</div>
                    </div>
                  </div>

                  <div className="h-2 rounded-full bg-muted overflow-hidden mb-1">
                    <div className={`h-full transition-all ${usoPct > 90 ? "bg-destructive" : usoPct > 70 ? "bg-warning" : "bg-primary"}`} style={{ width: `${Math.min(usoPct, 100)}%` }} />
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground mb-3">
                    <span>Uso: {usoPct.toFixed(0)}%</span>
                    <span>Disponible: {p.cupo > 0 ? (100 - usoPct).toFixed(0) : 0}%</span>
                  </div>

                  <div className="flex items-center gap-2 rounded-md bg-primary/5 border border-primary/20 px-2.5 py-2 mb-3">
                    <ShoppingCart className="w-3.5 h-3.5 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] text-muted-foreground uppercase">Compras {currentMonth}</div>
                      <div className="text-xs font-mono font-medium">
                        <span className="text-primary font-bold">{comprasTarjeta.count}</span>
                        <span className="text-muted-foreground"> {comprasTarjeta.count === 1 ? "compra" : "compras"}</span>
                        {comprasTarjeta.count > 0 && <span className="text-muted-foreground"> · </span>}
                        {comprasTarjeta.count > 0 && <span className="text-foreground">{formatCOP(comprasTarjeta.valor)}</span>}
                      </div>
                    </div>
                  </div>
                  </>
                  )}

                  <div className="flex flex-wrap gap-1 border-t border-border pt-2">
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setDetailProducto(p)}>
                      <Eye className="w-3 h-3 mr-1" /> Ver
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => {setEditing(p);setFormOpen(true);}}>
                      <Edit className="w-3 h-3 mr-1" /> Editar
                    </Button>
                    {p.tipo === "TDC" && p.estado === "activo" &&
                  <>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setReemplazoTarjeta(p)}>
                          <RefreshCw className="w-3 h-3 mr-1" /> Reemplazar
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAumentoTarjeta(p)}>
                          <TrendingUp className="w-3 h-3 mr-1" /> Cupo
                        </Button>
                      </>
                  }
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => cycleEstado(p)}>
                      {p.estado === "activo" ? <><Lock className="w-3 h-3 mr-1" /> Bloquear</> : <><Unlock className="w-3 h-3 mr-1" /> Activar</>}
                    </Button>
                  </div>
                </CardContent>
              </Card>);

        })}
        </div>
      }

      <TarjetaForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSaved={handleSave}
        editing={editing}
        clientes={clientes}
        pucTransaccional={pucTransaccional}
        productosExistentes={productos} />
      

      <ProductoCreditoDetail
        open={!!detailProducto}
        onOpenChange={(v) => {if (!v) setDetailProducto(null);}}
        producto={detailProducto}
        titular={detailProducto ? clienteMap[detailProducto.titular_id] : null}
        pucCuenta={detailProducto ? pucMap[detailProducto.subcuenta_puc] : null} />
      

      <ReemplazoTarjetaDialog
        open={!!reemplazoTarjeta}
        onOpenChange={(v) => {if (!v) setReemplazoTarjeta(null);}}
        tarjeta={reemplazoTarjeta}
        onDone={loadData} />
      

      <UnificacionTarjetaDialog
        open={unifOpen}
        onOpenChange={setUnifOpen}
        tarjetas={productos}
        clientes={clientes}
        onDone={loadData} />
      

      <AumentoCupoDialog
        open={!!aumentoTarjeta}
        onOpenChange={(v) => {if (!v) setAumentoTarjeta(null);}}
        tarjeta={aumentoTarjeta}
        onDone={loadData} />
      
    </div>);

}