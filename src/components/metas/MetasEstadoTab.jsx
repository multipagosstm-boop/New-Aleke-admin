import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Target, Filter } from "lucide-react";
import { BANCO_NAMES } from "@/lib/contabilidad";
import { Button } from "@/components/ui/button";
import NeedsAttention from "./NeedsAttention";
import MetasTable from "./MetasTable";
import EstadoMetaFilter, { filterByEstado } from "./EstadoMetaFilter";

export default function MetasEstadoTab({ metasWithProgress, clienteMap, onEdit, onDelete }) {
  const [search, setSearch] = useState("");
  const [corteDesde, setCorteDesde] = useState("");
  const [corteHasta, setCorteHasta] = useState("");
  const [estados, setEstados] = useState([]);

  const corteDesdeNum = corteDesde ? Number(corteDesde) : null;
  const corteHastaNum = corteHasta ? Number(corteHasta) : null;
  const hayFiltroCorte = corteDesdeNum !== null || corteHastaNum !== null;
  const hayFiltroEstado = estados.length > 0;

  const filteredMetas = metasWithProgress.filter((m) => {
    if (hayFiltroCorte) {
      if (corteDesdeNum !== null && m.corte < corteDesdeNum) return false;
      if (corteHastaNum !== null && m.corte > corteHastaNum) return false;
    }
    if (!search) return true;
    const s = search.toLowerCase();
    const titular = m.card ? clienteMap[m.card.titular_id] : null;
    return (
      (m.meta.nombre_tarjeta || "").toLowerCase().includes(s) ||
      (m.meta.codigo_interno || "").toLowerCase().includes(s) ||
      (BANCO_NAMES[m.meta.banco] || m.meta.banco || "").toLowerCase().includes(s) ||
      (titular?.nombre || "").toLowerCase().includes(s)
    );
  });
  const filteredByEstado = filterByEstado(filteredMetas, estados);

  if (metasWithProgress.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-muted-foreground">
          No hay metas registradas. Cree una meta para empezar el seguimiento.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <NeedsAttention metasWithProgress={metasWithProgress} clienteMap={clienteMap} onEdit={onEdit} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Target className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por tarjeta, banco o titular…"
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <div className="space-y-0.5">
            <label className="text-[10px] text-muted-foreground uppercase">Corte desde</label>
            <Input
              type="number"
              min="1"
              max="31"
              value={corteDesde}
              onChange={(e) => setCorteDesde(e.target.value)}
              placeholder="Día"
              className="w-20 h-9"
            />
          </div>
          <span className="text-muted-foreground pt-5">—</span>
          <div className="space-y-0.5">
            <label className="text-[10px] text-muted-foreground uppercase">Corte hasta</label>
            <Input
              type="number"
              min="1"
              max="31"
              value={corteHasta}
              onChange={(e) => setCorteHasta(e.target.value)}
              placeholder="Día"
              className="w-20 h-9"
            />
          </div>
          {hayFiltroCorte && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9"
              onClick={() => { setCorteDesde(""); setCorteHasta(""); }}
            >
              Limpiar
            </Button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <EstadoMetaFilter value={estados} onChange={setEstados} />
        {hayFiltroEstado && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9"
            onClick={() => setEstados([])}
          >
            Limpiar estado
          </Button>
        )}
      </div>
      <MetasTable
        metas={filteredByEstado}
        clienteMap={clienteMap}
        onEdit={onEdit}
        onDelete={onDelete}
        emptyMessage="No se encontraron metas con ese criterio."
      />
    </div>
  );
}