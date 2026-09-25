import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const hoy = new Date().toISOString().substring(0, 10);

export default function InmuebleForm({ open, onOpenChange, editing, onSaved }) {
  const [form, setForm] = useState({
    nombre: "", descripcion: "", direccion: "",
    valor_arriendo: 0, valor_deposito: 0,
    estado: "disponible",
    tipo_propiedad: "propio", tipo_contrato: "EDIFICIO",
    notas: ""
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) {
      setForm({
        nombre: editing.nombre || "",
        descripcion: editing.descripcion || "",
        direccion: editing.direccion || "",
        valor_arriendo: editing.valor_arriendo || 0,
        valor_deposito: editing.valor_deposito || 0,
        estado: editing.estado || "disponible",
        tipo_propiedad: editing.tipo_propiedad || "propio",
        tipo_contrato: editing.tipo_contrato || "EDIFICIO",
        notas: editing.notas || ""
      });
    } else {
      setForm({ nombre: "", descripcion: "", direccion: "", valor_arriendo: 0, valor_deposito: 0, estado: "disponible", tipo_propiedad: "propio", tipo_contrato: "EDIFICIO", notas: "" });
    }
  }, [editing, open]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleValorArriendo = (v) => {
    const val = Number(v) || 0;
    setForm((f) => ({ ...f, valor_arriendo: val, valor_deposito: val / 2 }));
  };

  const handleSubmit = async () => {
    if (!form.nombre.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        await base44.entities.Inmueble.update(editing.id, { ...form, nombre: form.nombre.trim() });
      } else {
        await base44.entities.Inmueble.create({ ...form, nombre: form.nombre.trim() });
      }
      onSaved();
      onOpenChange(false);
    } catch (e) {
      alert("Error: " + e.message);
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar Inmueble" : "Nuevo Inmueble"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nombre *</Label>
            <Input value={form.nombre} onChange={(e) => set("nombre", e.target.value)} placeholder="Ej: Apto 301 Torre A" />
          </div>
          <div>
            <Label>Dirección</Label>
            <Input value={form.direccion} onChange={(e) => set("direccion", e.target.value)} placeholder="Ej: Calle 45 #23-10" />
          </div>
          <div>
            <Label>Descripción</Label>
            <Textarea value={form.descripcion} onChange={(e) => set("descripcion", e.target.value)} rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Valor arriendo *</Label>
              <NumberInput value={form.valor_arriendo} onChange={(v) => handleValorArriendo(v)} placeholder="0" />
            </div>
            <div>
              <Label>Valor depósito</Label>
              <NumberInput value={form.valor_deposito} onChange={(v) => set("valor_deposito", v)} placeholder="0" />
            </div>
          </div>
          <div>
            <Label>Estado</Label>
            <Select value={form.estado} onValueChange={(v) => set("estado", v)} disabled={editing?.estado === "ocupado"}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="disponible">Disponible</SelectItem>
                <SelectItem value="mantenimiento">Mantenimiento</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tipo de propiedad *</Label>
              <Select value={form.tipo_propiedad} onValueChange={(v) => set("tipo_propiedad", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="propio">Propio (genera ingreso)</SelectItem>
                  <SelectItem value="tercero">Tercero (administrado)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Plantilla de contrato *</Label>
              <Select value={form.tipo_contrato} onValueChange={(v) => set("tipo_contrato", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="EDIFICIO">Edificio</SelectItem>
                  <SelectItem value="VENECIA">Venecia</SelectItem>
                  <SelectItem value="PARQUES_1">Parques 1</SelectItem>
                  <SelectItem value="GENERICO">Genérico</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Notas</Label>
            <Textarea value={form.notas} onChange={(e) => set("notas", e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving || !form.nombre.trim()}>
            {saving ? "Guardando..." : editing ? "Guardar" : "Crear Inmueble"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}