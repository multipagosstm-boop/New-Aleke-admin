import React, { useEffect, useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, User, Building2, FileText } from "lucide-react";
import { TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import ClienteForm from "@/components/admin/ClienteForm";
import ClienteFicha from "@/components/admin/ClienteFicha";

const LINEAS_LABELS = {
  multipagos: "Multipagos",
  emprendamos: "Emprendamos",
  pakredito: "Pakredito",
  alekerooftop: "Aleke Rooftop"
};

export default function Clientes() {
  const [clientes, setClientes] = useState([]);
  const [productos, setProductos] = useState([]);
  const [cuentasAhorro, setCuentasAhorro] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [filtroLinea, setFiltroLinea] = useState("todas");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [fichaCliente, setFichaCliente] = useState(null);

  const loadData = async () => {
    try {
      const [cls, prods, cdas] = await Promise.all([
        base44.entities.Cliente.list(),
        base44.entities.ProductoCredito.list(),
        base44.entities.CuentaAhorro.list()
      ]);
      setClientes(cls);
      setProductos(prods);
      setCuentasAhorro(cdas);
      setLoading(false);

      // Migración suave en segundo plano: asignar código a clientes sin codigo
      const sinCodigo = cls.filter((c) => !c.codigo);
      if (sinCodigo.length > 0) {
        for (const c of sinCodigo) {
          try {
            const resp = await base44.functions.invoke("generarCodigoCliente", {});
            if (resp.data?.codigo) {
              await base44.entities.Cliente.update(c.id, { codigo: resp.data.codigo });
            }
          } catch (e) { console.error("Migración código cliente:", e); }
        }
        const actualizados = await base44.entities.Cliente.list();
        setClientes(actualizados);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const vinculaciones = useMemo(() => {
    const map = {};
    productos.forEach((p) => {
      if (p.titular_id) {
        if (!map[p.titular_id]) map[p.titular_id] = { tdc: 0, cda: 0 };
        map[p.titular_id].tdc += 1;
      }
    });
    cuentasAhorro.forEach((c) => {
      if (c.titular_id) {
        if (!map[c.titular_id]) map[c.titular_id] = { tdc: 0, cda: 0 };
        map[c.titular_id].cda += 1;
      }
    });
    return map;
  }, [productos, cuentasAhorro]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clientes.filter((c) => {
      const matchSearch = !q || (c.nombre || "").toLowerCase().includes(q) || (c.cedula || "").toLowerCase().includes(q) || (c.telefono || "").toLowerCase().includes(q);
      const matchEstado = filtroEstado === "todos" || c.estado === filtroEstado;
      const matchLinea = filtroLinea === "todas" || (c.lineas_negocio || []).includes(filtroLinea);
      return matchSearch && matchEstado && matchLinea;
    });
  }, [clientes, search, filtroEstado, filtroLinea]);

  if (loading) return <div className="p-8 text-muted-foreground">Cargando clientes...</div>;

  return (
    <div className="p-6 space-y-4">
      {/* Barra superior */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-heading font-semibold">Clientes</h1>
          <Badge variant="secondary" className="text-xs">{clientes.length}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre o cédula..."
              className="pl-9 w-56"
            />
          </div>
          <Select value={filtroEstado} onValueChange={setFiltroEstado}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="activo">Activos</SelectItem>
              <SelectItem value="castigado">Castigados</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filtroLinea} onValueChange={setFiltroLinea}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas las líneas</SelectItem>
              <SelectItem value="multipagos">Multipagos</SelectItem>
              <SelectItem value="emprendamos">Emprendamos</SelectItem>
              <SelectItem value="pakredito">Pakredito</SelectItem>
              <SelectItem value="alekerooftop">Aleke Rooftop</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus className="w-4 h-4 mr-2" /> Nuevo Cliente
          </Button>
        </div>
      </div>

      {/* Lista de clientes (tabla con encabezados fijos) */}
      <div className="rounded-md border bg-card max-h-[calc(100vh-220px)] overflow-y-auto">
        <table className="w-full caption-bottom text-sm thead-sticky">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[35%]">Nombre</TableHead>
              <TableHead className="w-[15%]">Documento</TableHead>
              <TableHead className="w-[15%]">Teléfono</TableHead>
              <TableHead className="w-[25%]">Líneas de negocio</TableHead>
              <TableHead className="w-[10%] text-right">Ficha</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((c) => {
              const lineas = c.lineas_negocio || [];
              return (
                <TableRow key={c.id} className="hover:bg-muted/50">
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                        {c.tipo === "empresa"
                          ? <Building2 className="w-3.5 h-3.5 text-primary" />
                          : <User className="w-3.5 h-3.5 text-primary" />}
                      </div>
                      <div>
                        <div className="font-medium text-sm">{c.nombre}</div>
                        <div className="text-[10px] font-mono text-muted-foreground">{c.codigo || "—"}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{c.cedula || "—"}</TableCell>
                  <TableCell className="text-sm">{c.telefono || "—"}</TableCell>
                  <TableCell>
                    {lineas.length > 0 ? (
                      <div className="flex gap-1 flex-wrap">
                        {lineas.map((l) => (
                          <Badge key={l} variant="secondary" className="text-[10px]">{LINEAS_LABELS[l] || l}</Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => setFichaCliente(c)}>
                      <FileText className="w-3 h-3 mr-1" /> Ver ficha
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </table>
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">No se encontraron clientes.</div>
      )}

      <ClienteForm open={formOpen} onOpenChange={setFormOpen} editing={editing} onSaved={loadData} />

      <ClienteFicha
        open={!!fichaCliente}
        onOpenChange={(v) => { if (!v) setFichaCliente(null); }}
        cliente={fichaCliente}
        cuentasAhorro={cuentasAhorro}
        productos={productos}
        onSaved={loadData}
        onEdit={() => { setEditing(fichaCliente); setFichaCliente(null); setFormOpen(true); }}
      />
    </div>
  );
}