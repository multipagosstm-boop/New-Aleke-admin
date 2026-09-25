import React from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { AlertTriangle, Ban, CheckCircle2 } from "lucide-react";

// Filtro de estado de meta reutilizable.
// value: array de strings con los estados activos ("en_riesgo", "sin_compras", "cumplidas")
export default function EstadoMetaFilter({ value, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-muted-foreground uppercase whitespace-nowrap">Estado</span>
      <ToggleGroup
        type="multiple"
        value={value}
        onValueChange={onChange}
        className="flex-wrap justify-start"
      >
        <ToggleGroupItem
          value="en_riesgo"
          aria-label="En riesgo"
          className="text-xs gap-1.5 h-9 data-[state=on]:bg-warning/15 data-[state=on]:text-warning"
        >
          <AlertTriangle className="w-3.5 h-3.5" /> En riesgo
        </ToggleGroupItem>
        <ToggleGroupItem
          value="sin_compras"
          aria-label="Sin compras"
          className="text-xs gap-1.5 h-9 data-[state=on]:bg-destructive/15 data-[state=on]:text-destructive"
        >
          <Ban className="w-3.5 h-3.5" /> Sin compras
        </ToggleGroupItem>
        <ToggleGroupItem
          value="cumplidas"
          aria-label="Cumplidas"
          className="text-xs gap-1.5 h-9 data-[state=on]:bg-success/15 data-[state=on]:text-success"
        >
          <CheckCircle2 className="w-3.5 h-3.5" /> Cumplidas
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}

// Mapa de estado computado -> clave de filtro
export function getEstadoKey(m) {
  if (m.cumplida) return "cumplidas";
  if (m.sinCompras) return "sin_compras";
  return "en_riesgo";
}

// Filtra la lista según los estados seleccionados; vacío = todos
export function filterByEstado(metasWithProgress, estadosSeleccionados) {
  if (!estadosSeleccionados || estadosSeleccionados.length === 0) return metasWithProgress;
  const set = new Set(estadosSeleccionados);
  return metasWithProgress.filter((m) => set.has(getEstadoKey(m)));
}