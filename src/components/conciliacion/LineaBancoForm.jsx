import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";

export default function LineaBancoForm({ extractoId, productoId, onAdded }) {
  const [form, setForm] = useState({ fecha: "", descripcion: "", tipo: "compra", naturaleza: "cargo", valor: 0 });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleTipoChange = (tipo) => {
    const naturaleza = tipo === "abono" ? "abono" : "cargo";
    setForm((f) => ({ ...f, tipo, naturaleza }));
  };

  const handleSubmit = async () => {
    if (!form.fecha || !form.descripcion.trim() || Number(form.valor) <= 0) return;
    setSaving(true);
    try {
      await base44.entities.LineaExtracto.create({
        extracto_id: extractoId,
        producto_id: productoId,
        fecha: form.fecha,
        descripcion: form.descripcion,
        tipo: form.tipo,
        naturaleza: form.naturaleza,
        valor: Number(form.valor),
        estado_conciliacion: "sin_conciliar"
      });
      setForm({ fecha: "", descripcion: "", tipo: "compra", naturaleza: "cargo", valor: 0 });
      onAdded();
    } catch (e) { alert("Error: " + e.message); }
    setSaving(false);
  };

  return (
    <Card>
      <CardContent className="p-3">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
          <div>
            <Label className="text-xs">Fecha</Label>
            <Input type="date" value={form.fecha} onChange={(e) => set("fecha", e.target.value)} />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Descripción</Label>
            <Input value={form.descripcion} onChange={(e) => set("descripcion", e.target.value)} placeholder="Como aparece en el extracto..." />
          </div>
          <div>
            <Label className="text-xs">Tipo</Label>
            <Select value={form.tipo} onValueChange={handleTipoChange}>
              <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="compra">Compra</SelectItem>
                <SelectItem value="avance">Avance</SelectItem>
                <SelectItem value="financiero">Financiero</SelectItem>
                <SelectItem value="abono">Abono</SelectItem>
                <SelectItem value="ajuste">Ajuste</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Naturaleza</Label>
            <Select value={form.naturaleza} onValueChange={(v) => set("naturaleza", v)}>
              <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cargo">Cargo</SelectItem>
                <SelectItem value="abono">Abono</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Valor</Label>
            <Input type="number" value={form.valor} onChange={(e) => set("valor", e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end mt-2">
          <Button size="sm" onClick={handleSubmit} disabled={saving || !form.fecha || !form.descripcion.trim() || Number(form.valor) <= 0}>
            <Plus className="w-4 h-4 mr-1" /> {saving ? "Agregando..." : "Agregar línea"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}