import React from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { FRANQUICIAS, CATEGORIAS_TDC, DIAS_SEMANA, ORDENES_SEMANA } from "@/lib/contabilidad";

// Campos compartidos por el formulario de nueva tarjeta y el de reemplazo:
// franquicia, categoría (solo TDC) y configuración del día de corte.
export default function TarjetaAtributosFields({
  esTDC = true,
  franquicia, setFranquicia,
  categoria, setCategoria,
  corteModo, setCorteModo,
  fechaCorte, setFechaCorte,
  corteSemana, setCorteSemana,
  corteDiaSemana, setCorteDiaSemana
}) {
  return (
    <div className="space-y-3 border-t border-border pt-3">
      {esTDC && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>Franquicia</Label>
            <Select value={franquicia || ""} onValueChange={setFranquicia}>
              <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
              <SelectContent>
                {FRANQUICIAS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Categoría</Label>
            <Select value={categoria || ""} onValueChange={setCategoria}>
              <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
              <SelectContent>
                {CATEGORIAS_TDC.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
      <div>
        <Label>Día de corte</Label>
        <Select value={corteModo || "dia_fijo"} onValueChange={setCorteModo}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="dia_fijo">Día fijo del mes</SelectItem>
            <SelectItem value="dia_semana">Día de la semana del mes</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {corteModo === "dia_semana" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>Ordinal</Label>
            <Select value={String(corteSemana || 1)} onValueChange={(v) => setCorteSemana(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ORDENES_SEMANA.map((o) => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Día de la semana</Label>
            <Select value={String(corteDiaSemana || 5)} onValueChange={(v) => setCorteDiaSemana(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DIAS_SEMANA.map((d) => <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : (
        <div>
          <Label>Día (1-28)</Label>
          <Input type="number" min={1} max={28} value={fechaCorte} onChange={(e) => setFechaCorte(e.target.value)} />
        </div>
      )}
    </div>
  );
}