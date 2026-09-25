import React, { useEffect, useState, useMemo, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Search, Plus } from "lucide-react";
import * as XLSX from "xlsx";
import PUCTreeView from "@/components/admin/PUCTreeView";
import CuentaPUCForm from "@/components/admin/CuentaPUCForm";

const CLASES = [
  { num: 1, label: "Activo" },
  { num: 2, label: "Pasivo" },
  { num: 3, label: "Patrimonio" },
  { num: 4, label: "Ingresos" },
  { num: 5, label: "Gastos" },
  { num: 6, label: "Costos" }
];

export default function PlanCuentas() {
  const [cuentas, setCuentas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroClase, setFiltroClase] = useState("all");
  const [filtroNivel, setFiltroNivel] = useState("all");
  const [filtroTipo, setFiltroTipo] = useState("all");
  const [filtroTransaccional, setFiltroTransaccional] = useState("all");
  const [busqueda, setBusqueda] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const cargarCuentas = useCallback(() => {
    return base44.entities.Cuenta.list("-codigo", 2000).then((items) => {
      const seen = new Set();
      const unique = [];
      for (const item of items || []) {
        if (!item) continue;
        const key = item.id ? String(item.id) : (item.codigo !== undefined ? String(item.codigo) : null);
        if (key && !seen.has(key)) {
          seen.add(key);
          unique.push(item);
        }
      }
      setCuentas(unique);
      setLoading(false);
    });
  }, []);

  useEffect(() => { cargarCuentas(); }, [cargarCuentas]);

  const abrirNueva = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const abrirEditar = (cuenta) => {
    setEditing(cuenta);
    setFormOpen(true);
  };

  const handleEliminar = async (cuenta) => {
    await base44.functions.invoke("gestionarCuentaPUC", {
      operacion: "eliminar",
      id: cuenta.id
    });
    await cargarCuentas();
  };

  const filterPredicate = useMemo(() => {
    return (c) => {
      if (filtroClase !== "all" && c.clase !== Number(filtroClase)) return false;
      if (filtroNivel !== "all" && c.nivel !== filtroNivel) return false;
      if (filtroTipo !== "all" && c.tipo_estado !== filtroTipo) return false;
      if (filtroTransaccional === "si" && !c.es_transaccional) return false;
      if (filtroTransaccional === "no" && c.es_transaccional) return false;
      if (busqueda) {
        const q = busqueda.toLowerCase();
        if (!String(c.concepto).toLowerCase().includes(q) && !String(c.codigo).includes(q)) return false;
      }
      return true;
    };
  }, [filtroClase, filtroNivel, filtroTipo, filtroTransaccional, busqueda]);

  const hasFilters = filtroClase !== "all" || filtroNivel !== "all" || filtroTipo !== "all" || filtroTransaccional !== "all" || busqueda.trim() !== "";
  const filters = hasFilters ? filterPredicate : null;

  const handleExport = () => {
    const data = cuentas.map((c) => ({
      Código: c.codigo,
      Nivel: c.nivel,
      Clase: c.clase_nombre,
      Concepto: c.concepto,
      Naturaleza: c.naturaleza,
      "Tipo de Estado": c.tipo_estado,
      "Es Transaccional": c.es_transaccional ? "Sí" : "No"
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "PUC");
    XLSX.writeFile(wb, "Plan_de_Cuentas_PUC.xlsx");
  };

  if (loading) return <div className="p-8 text-muted-foreground">Cargando plan de cuentas...</div>;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por código o nombre..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="pl-9 w-64 bg-background"
            />
          </div>
          <Select value={filtroClase} onValueChange={setFiltroClase}>
            <SelectTrigger className="w-36 bg-background"><SelectValue placeholder="Clase" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las clases</SelectItem>
              {CLASES.map((c) => <SelectItem key={c.num} value={String(c.num)}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filtroNivel} onValueChange={setFiltroNivel}>
            <SelectTrigger className="w-36 bg-background"><SelectValue placeholder="Nivel" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los niveles</SelectItem>
              <SelectItem value="Clase">Clase</SelectItem>
              <SelectItem value="Grupo">Grupo</SelectItem>
              <SelectItem value="Cuenta">Cuenta</SelectItem>
              <SelectItem value="Subcuenta">Subcuenta</SelectItem>
              <SelectItem value="Auxiliar">Auxiliar</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filtroTipo} onValueChange={setFiltroTipo}>
            <SelectTrigger className="w-32 bg-background"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="Balance">Balance</SelectItem>
              <SelectItem value="Resultado">Resultado</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filtroTransaccional} onValueChange={setFiltroTransaccional}>
            <SelectTrigger className="w-40 bg-background"><SelectValue placeholder="Transaccional" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="si">Transaccionales</SelectItem>
              <SelectItem value="no">No transaccionales</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={abrirNueva}>
            <Plus className="w-4 h-4 mr-2" /> Nueva Cuenta
          </Button>
          <Button onClick={handleExport} variant="secondary">
            <Download className="w-4 h-4 mr-2" /> Exportar Excel
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {cuentas.length} cuentas en el PUC
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <PUCTreeView cuentas={cuentas} filters={filters} onEdit={abrirEditar} onDelete={handleEliminar} />
        </CardContent>
      </Card>

      <CuentaPUCForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSaved={cargarCuentas}
        cuentas={cuentas}
        editing={editing}
      />
    </div>
  );
}