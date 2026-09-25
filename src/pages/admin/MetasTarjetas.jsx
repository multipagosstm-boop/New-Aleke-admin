import React, { useEffect, useState, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Plus, ArrowLeft } from "lucide-react";
import { formatMonthYear } from "@/lib/contabilidad";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import MonthSelector from "@/components/metas/MonthSelector";
import MetasEstadoTab from "@/components/metas/MetasEstadoTab";
import TarjetasSinMetasTab from "@/components/metas/TarjetasSinMetasTab";
import InformeMetasTab from "@/components/metas/InformeMetasTab";
import MetaTarjetaForm from "@/components/admin/MetaTarjetaForm";

export default function MetasTarjetas() {
  const [productos, setProductos] = useState([]);
  const [metas, setMetas] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [movimientosMes, setMovimientosMes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [preselectedCard, setPreselectedCard] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [activeTab, setActiveTab] = useState("estado");

  const monthOptions = useMemo(() => {
    const opts = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      opts.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    return opts;
  }, []);

  const loadData = useCallback(async () => {
    try {
      const [prods, metasData, clients, movsMes] = await Promise.all([
        base44.entities.ProductoCredito.list(),
        base44.entities.MetaTarjeta.filter({ estado: "activa" }),
        base44.entities.Cliente.list(),
        base44.entities.MovimientoContable.filter({
          tipo_movimiento_tdc: "compra",
          periodo_operacion: selectedMonth,
          estado: "activo",
        }),
      ]);
      setProductos(prods);
      setMetas(metasData);
      setClientes(clients);
      setMovimientosMes(movsMes);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [selectedMonth]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const clienteMap = useMemo(() => {
    const m = {};
    clientes.forEach((c) => { m[c.id] = c; });
    return m;
  }, [clientes]);

  const cardKey = (p) => p.codigo_interno || p.nomenclatura;

  const prodToCodigo = useMemo(() => {
    const m = {};
    productos.forEach((p) => { m[p.id] = cardKey(p); });
    return m;
  }, [productos]);

  const purchasesByCodigo = useMemo(() => {
    const m = {};
    movimientosMes.forEach((mov) => {
      const codigo = prodToCodigo[mov.producto_credito_id];
      if (!codigo) return;
      if (!m[codigo]) m[codigo] = [];
      m[codigo].push(mov);
    });
    return m;
  }, [movimientosMes, prodToCodigo]);

  const activeCardsByCodigo = useMemo(() => {
    const m = {};
    productos.filter((p) => p.estado === "activo").forEach((p) => {
      m[cardKey(p)] = p;
    });
    return m;
  }, [productos]);

  const today = new Date();
  const todayDay = today.getDate();

  const metasWithProgress = useMemo(() => {
    return metas.map((meta) => {
      const key = meta.codigo_interno;
      const card = activeCardsByCodigo[key] || productos.find((p) => p.id === meta.producto_credito_id);
      const purchases = purchasesByCodigo[key] || [];
      const comprasCantidad = purchases.length;
      const comprasValor = purchases.reduce((s, m) => s + (Number(m.credito) || 0), 0);
      const hasMetaCantidad = (meta.objetivo_cantidad || 0) > 0;
      const hasMetaValor = (meta.objetivo_valor || 0) > 0;
      const pctCantidad = hasMetaCantidad ? Math.min((comprasCantidad / meta.objetivo_cantidad) * 100, 100) : null;
      const pctValor = hasMetaValor ? Math.min((comprasValor / meta.objetivo_valor) * 100, 100) : null;
      const cumplidaCantidad = !hasMetaCantidad || comprasCantidad >= meta.objetivo_cantidad;
      const cumplidaValor = !hasMetaValor || comprasValor >= meta.objetivo_valor;
      const cumplida = cumplidaCantidad && cumplidaValor;
      const sinCompras = comprasCantidad === 0 && (hasMetaCantidad || hasMetaValor);
      const enRiesgo = !cumplida && !sinCompras;
      const faltanteCantidad = hasMetaCantidad ? Math.max(meta.objetivo_cantidad - comprasCantidad, 0) : 0;
      const faltanteValor = hasMetaValor ? Math.max(meta.objetivo_valor - comprasValor, 0) : 0;
      const fin = meta.fecha_fin ? new Date(meta.fecha_fin) : null;
      const periodoVencido = fin && fin < today;
      const diasRestantes = fin ? Math.ceil((fin - today) / (1000 * 60 * 60 * 24)) : null;
      const corte = card?.fecha_corte || 0;
      const diasHastaCorte = corte - todayDay;
      const despuesDeCorte = diasHastaCorte <= 0;
      const recomendacion = despuesDeCorte
        ? "Comprar ya (antes del próximo corte)"
        : `Comprar después del día ${corte}`;
      return {
        meta, card, comprasCantidad, comprasValor, pctCantidad, pctValor,
        cumplida, sinCompras, enRiesgo, faltanteCantidad, faltanteValor,
        periodoVencido, diasRestantes, corte, diasHastaCorte, despuesDeCorte, recomendacion,
      };
    });
  }, [metas, activeCardsByCodigo, productos, purchasesByCodigo, today, todayDay]);

  const codigosConMeta = useMemo(() => new Set(metas.map((m) => m.codigo_interno)), [metas]);

  const cardsWithoutMetas = useMemo(() => {
    return productos.filter(
      (p) => p.estado === "activo" && p.tipo === "TDC" && !codigosConMeta.has(cardKey(p))
    );
  }, [productos, codigosConMeta]);

  const tarjetasDisponibles = useMemo(() => {
    return productos.filter(
      (p) =>
        p.estado === "activo" &&
        p.tipo === "TDC" &&
        (!codigosConMeta.has(cardKey(p)) || (editing && editing.codigo_interno === cardKey(p)))
    );
  }, [productos, codigosConMeta, editing]);

  const handleSave = () => {
    loadData();
    setEditing(null);
    setPreselectedCard(null);
  };

  const handleDelete = async (meta) => {
    if (!window.confirm(`¿Eliminar la meta de ${meta.nombre_tarjeta}?`)) return;
    await base44.entities.MetaTarjeta.delete(meta.id);
    loadData();
  };

  const handleAddMeta = (card) => {
    setEditing(null);
    setPreselectedCard(card);
    setFormOpen(true);
  };

  const handleNewMeta = () => {
    setEditing(null);
    setPreselectedCard(null);
    setFormOpen(true);
  };

  const handleEdit = (meta) => {
    setEditing(meta);
    setPreselectedCard(null);
    setFormOpen(true);
  };

  if (loading) return <div className="p-8 text-muted-foreground">Cargando metas…</div>;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/admin/financieros/tarjetas">
            <ArrowLeft className="w-4 h-4 mr-1" /> Volver a Tarjetas
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <MonthSelector value={selectedMonth} onChange={setSelectedMonth} options={monthOptions} />
          <Button size="sm" onClick={handleNewMeta}>
            <Plus className="w-4 h-4 mr-2" /> Nueva Meta
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="estado">Estado de Metas</TabsTrigger>
          <TabsTrigger value="sin-metas">Tarjetas sin Metas</TabsTrigger>
          <TabsTrigger value="informe">Informe</TabsTrigger>
        </TabsList>
        <TabsContent value="estado">
          <MetasEstadoTab
            metasWithProgress={metasWithProgress}
            clienteMap={clienteMap}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        </TabsContent>
        <TabsContent value="sin-metas">
          <TarjetasSinMetasTab
            cardsWithoutMetas={cardsWithoutMetas}
            clienteMap={clienteMap}
            onAddMeta={handleAddMeta}
          />
        </TabsContent>
        <TabsContent value="informe">
          <InformeMetasTab
            metasWithProgress={metasWithProgress}
            clienteMap={clienteMap}
            monthLabel={formatMonthYear(selectedMonth)}
          />
        </TabsContent>
      </Tabs>

      <MetaTarjetaForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSaved={handleSave}
        editing={editing}
        preselectedCard={preselectedCard}
        tarjetasDisponibles={tarjetasDisponibles}
      />
    </div>
  );
}