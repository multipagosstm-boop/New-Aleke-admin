import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatCOP, BANCO_NAMES } from "@/lib/contabilidad";
import SearchableSelect from "@/components/ui/searchable-select";

export default function MetaTarjetaForm({
  open,
  onOpenChange,
  onSaved,
  editing,
  tarjetasDisponibles,
  preselectedCard,
}) {
  const [form, setForm] = useState({
    producto_credito_id: "",
    objetivo_cantidad: 0,
    objetivo_valor: 0,
    fecha_inicio: "",
    fecha_fin: "",
    nota: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    if (editing) {
      setForm({
        producto_credito_id: editing.producto_credito_id || "",
        objetivo_cantidad: editing.objetivo_cantidad || 0,
        objetivo_valor: editing.objetivo_valor || 0,
        fecha_inicio: editing.fecha_inicio || "",
        fecha_fin: editing.fecha_fin || "",
        nota: editing.nota || "",
      });
    } else if (preselectedCard) {
      const hoy = new Date();
      const fin = new Date(hoy);
      fin.setMonth(fin.getMonth() + 6);
      setForm({
        producto_credito_id: preselectedCard.id,
        objetivo_cantidad: 0,
        objetivo_valor: 0,
        fecha_inicio: hoy.toISOString().split("T")[0],
        fecha_fin: fin.toISOString().split("T")[0],
        nota: "",
      });
    } else {
      const hoy = new Date();
      const fin = new Date(hoy);
      fin.setMonth(fin.getMonth() + 6);
      setForm({
        producto_credito_id: "",
        objetivo_cantidad: 0,
        objetivo_valor: 0,
        fecha_inicio: hoy.toISOString().split("T")[0],
        fecha_fin: fin.toISOString().split("T")[0],
        nota: "",
      });
    }
  }, [open, editing, preselectedCard]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    setError("");
    if (!editing && !form.producto_credito_id) {
      setError("Seleccione una tarjeta.");
      return;
    }
    const cantidad = Number(form.objetivo_cantidad) || 0;
    const valor = Number(form.objetivo_valor) || 0;
    if (cantidad <= 0 && valor <= 0) {
      setError("Defina al menos una meta (cantidad o valor).");
      return;
    }
    if (!form.fecha_inicio || !form.fecha_fin) {
      setError("Defina las fechas del periodo.");
      return;
    }

    setSaving(true);
    try {
      const card = preselectedCard || tarjetasDisponibles.find(
        (t) => t.id === form.producto_credito_id
      );
      const data = {
        producto_credito_id: form.producto_credito_id,
        codigo_interno:
          card?.codigo_interno || card?.nomenclatura || editing?.codigo_interno,
        nombre_tarjeta: card?.nombre || editing?.nombre_tarjeta,
        banco: card?.banco || editing?.banco || "",
        objetivo_cantidad: cantidad,
        objetivo_valor: valor,
        fecha_inicio: form.fecha_inicio,
        fecha_fin: form.fecha_fin,
        estado: "activa",
        nota: form.nota,
      };
      if (editing) {
        await base44.entities.MetaTarjeta.update(editing.id, data);
      } else {
        await base44.entities.MetaTarjeta.create(data);
      }
      onSaved();
      onOpenChange(false);
    } catch (e) {
      setError(e.message || "Error al guardar la meta.");
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Editar Meta de Tarjeta" : "Nueva Meta de Tarjeta"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Tarjeta */}
          <div className="space-y-1.5">
            <Label>Tarjeta</Label>
            {editing || preselectedCard ? (
              <div className="px-3 py-2 rounded-md border border-input bg-muted/30 text-sm">
                {editing ? editing.nombre_tarjeta || "—" : preselectedCard.nombre}{" "}
                <span className="text-muted-foreground">
                  ({BANCO_NAMES[editing ? editing.banco : preselectedCard.banco] ||
                    (editing ? editing.banco : preselectedCard.banco) ||
                    ""})
                </span>
              </div>
            ) : (
              <SearchableSelect
                options={tarjetasDisponibles.map((t) => {
                  const sinAcentos = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                  return {
                    value: t.id,
                    label: `${t.nombre} (${t.nomenclatura}) — ${BANCO_NAMES[t.banco] || t.banco}`,
                    searchKey: `${sinAcentos(t.nombre)} ${t.nomenclatura} ${t.codigo_interno || ""} ${sinAcentos(BANCO_NAMES[t.banco] || t.banco)}`,
                  };
                })}
                value={form.producto_credito_id}
                onValueChange={(v) => set("producto_credito_id", v || "")}
                placeholder="Seleccione una tarjeta…"
                searchPlaceholder="Buscar por nombre, banco o código…"
                triggerClassName="h-9"
              />
            )}
          </div>

          {/* Objetivo cantidad */}
          <div className="space-y-1.5">
            <Label>Meta de cantidad (compras/mes)</Label>
            <Input
              type="number"
              min="0"
              value={form.objetivo_cantidad}
              onChange={(e) => set("objetivo_cantidad", e.target.value)}
              placeholder="0 = sin meta de cantidad"
            />
            <p className="text-[11px] text-muted-foreground">
              Número de compras mínimas por mes calendario.
            </p>
          </div>

          {/* Objetivo valor */}
          <div className="space-y-1.5">
            <Label>Meta de valor (COP/mes)</Label>
            <Input
              type="number"
              min="0"
              value={form.objetivo_valor}
              onChange={(e) => set("objetivo_valor", e.target.value)}
              placeholder="0 = sin meta de valor"
            />
            {Number(form.objetivo_valor) > 0 && (
              <p className="text-[11px] text-muted-foreground font-mono">
                {formatCOP(Number(form.objetivo_valor))}
              </p>
            )}
          </div>

          {/* Fechas */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Fecha inicio</Label>
              <Input
                type="date"
                value={form.fecha_inicio}
                onChange={(e) => set("fecha_inicio", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Fecha fin</Label>
              <Input
                type="date"
                value={form.fecha_fin}
                onChange={(e) => set("fecha_fin", e.target.value)}
              />
            </div>
          </div>

          {/* Nota */}
          <div className="space-y-1.5">
            <Label>Nota (opcional)</Label>
            <Textarea
              rows={2}
              value={form.nota}
              onChange={(e) => set("nota", e.target.value)}
              placeholder="Ej: Exención de cuota de manejo si se cumplen las metas"
            />
          </div>

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Guardando…" : editing ? "Guardar cambios" : "Crear meta"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}