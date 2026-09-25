import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const TIPOS = [
  { value: "CC", label: "Cédula de ciudadanía (CC)" },
  { value: "CE", label: "Cédula de extranjería (CE)" },
  { value: "PP", label: "Pasaporte (PP)" },
  { value: "TI", label: "Tarjeta de identidad (TI)" },
  { value: "NIT", label: "NIT" }
];

export default function InquilinoForm({ open, onOpenChange, editing, onSaved }) {
  const [form, setForm] = useState({
    nombre_completo: "", tipo_documento: "CC", numero_documento: "",
    lugar_expedicion: "", email: "", telefono: "", estado: "activo", notas: ""
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) {
      setForm({
        nombre_completo: editing.nombre_completo || "",
        tipo_documento: editing.tipo_documento || "CC",
        numero_documento: editing.numero_documento || "",
        lugar_expedicion: editing.lugar_expedicion || "",
        email: editing.email || "",
        telefono: editing.telefono || "",
        estado: editing.estado || "activo",
        notas: editing.notas || ""
      });
    } else {
      setForm({ nombre_completo: "", tipo_documento: "CC", numero_documento: "", lugar_expedicion: "", email: "", telefono: "", estado: "activo", notas: "" });
    }
  }, [editing, open]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.nombre_completo.trim() || !form.numero_documento.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        await base44.entities.Inquilino.update(editing.id, { ...form, nombre_completo: form.nombre_completo.trim() });
      } else {
        await base44.entities.Inquilino.create({ ...form, nombre_completo: form.nombre_completo.trim() });
      }
      onSaved();
      onOpenChange(false);
    } catch (e) {
      alert("Error: " + (e?.message || "No se pudo guardar el inquilino"));
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar Inquilino" : "Nuevo Inquilino"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nombre completo *</Label>
            <Input value={form.nombre_completo} onChange={(e) => set("nombre_completo", e.target.value)} placeholder="Ej: RANDY DAMIAN ACOSTA URQUIJO" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tipo de documento *</Label>
              <Select value={form.tipo_documento} onValueChange={(v) => set("tipo_documento", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Número de documento *</Label>
              <Input value={form.numero_documento} onChange={(e) => set("numero_documento", e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Lugar de expedición</Label>
            <Input value={form.lugar_expedicion} onChange={(e) => set("lugar_expedicion", e.target.value)} placeholder="Ej: Santa Marta" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Correo</Label>
              <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </div>
            <div>
              <Label>Teléfono</Label>
              <Input value={form.telefono} onChange={(e) => set("telefono", e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Notas</Label>
            <Textarea value={form.notas} onChange={(e) => set("notas", e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving || !form.nombre_completo.trim() || !form.numero_documento.trim()}>
            {saving ? "Guardando..." : editing ? "Guardar" : "Crear Inquilino"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}