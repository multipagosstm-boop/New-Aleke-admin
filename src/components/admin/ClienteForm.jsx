import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";

const LINEAS_NEGOCIO_OPTS = [
  { value: "multipagos", label: "Multipagos" },
  { value: "emprendamos", label: "Emprendamos" },
  { value: "pakredito", label: "Pakredito" },
  { value: "alekerooftop", label: "Aleke Rooftop" }
];

export default function ClienteForm({ open, onOpenChange, editing, onSaved }) {
  const [form, setForm] = useState({
    nombre: "", tipo: "persona", cedula: "", telefono: "", correo: "",
    direccion: "", ocupacion: "", lugar_trabajo: "", referido_por: "", estado: "activo", notas: "",
    lineas_negocio: []
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) {
      setForm({
        nombre: editing.nombre || "",
        tipo: editing.tipo || "persona",
        cedula: editing.cedula || "",
        telefono: editing.telefono || "",
        correo: editing.correo || "",
        direccion: editing.direccion || "",
        ocupacion: editing.ocupacion || "",
        lugar_trabajo: editing.lugar_trabajo || "",
        referido_por: editing.referido_por || "",
        estado: editing.estado || "activo",
        notas: editing.notas || "",
        lineas_negocio: editing.lineas_negocio || []
      });
    } else {
      setForm({ nombre: "", tipo: "persona", cedula: "", telefono: "", correo: "", direccion: "", ocupacion: "", lugar_trabajo: "", referido_por: "", estado: "activo", notas: "", lineas_negocio: [] });
    }
  }, [editing, open]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.nombre.trim() || !form.telefono.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        await base44.entities.Cliente.update(editing.id, {
          ...form, nombre: form.nombre.trim(), cedula: form.cedula.trim()
        });
      } else {
        // Generar código via backend function
        const resp = await base44.functions.invoke("generarCodigoCliente", {});
        const codigo = resp.data?.codigo || "";
        await base44.entities.Cliente.create({
          ...form,
          nombre: form.nombre.trim(),
          cedula: form.cedula.trim(),
          codigo,
          lineas_negocio: form.lineas_negocio
        });
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
      <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[92vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar Cliente" : "Nuevo Cliente"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Nombre / Razón social *</Label>
              <Input value={form.nombre} onChange={(e) => set("nombre", e.target.value)} />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={(v) => set("tipo", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="persona">Persona</SelectItem>
                  <SelectItem value="empresa">Empresa</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Cédula / NIT</Label>
              <Input value={form.cedula} onChange={(e) => set("cedula", e.target.value)} />
            </div>
            <div>
              <Label>Teléfono *</Label>
              <Input value={form.telefono} onChange={(e) => set("telefono", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Correo</Label>
              <Input type="email" value={form.correo} onChange={(e) => set("correo", e.target.value)} />
            </div>
            <div>
              <Label>Dirección</Label>
              <Input value={form.direccion} onChange={(e) => set("direccion", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Ocupación</Label>
              <Input value={form.ocupacion} onChange={(e) => set("ocupacion", e.target.value)} />
            </div>
            <div>
              <Label>Lugar de trabajo</Label>
              <Input value={form.lugar_trabajo} onChange={(e) => set("lugar_trabajo", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Referido por</Label>
              <Input value={form.referido_por} onChange={(e) => set("referido_por", e.target.value)} />
            </div>
            <div>
              <Label>Estado</Label>
              <Select value={form.estado} onValueChange={(v) => set("estado", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="activo">Activo</SelectItem>
                  <SelectItem value="castigado">Castigado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Líneas de negocio</Label>
            <p className="text-[11px] text-muted-foreground mb-2">Seleccione las líneas a las que se vinculará el cliente (puede ser ninguna).</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {LINEAS_NEGOCIO_OPTS.map((ln) => (
                <div key={ln.value} className="flex items-center gap-2 rounded-md border px-3 py-2">
                  <Checkbox
                    id={`ln-${ln.value}`}
                    checked={form.lineas_negocio.includes(ln.value)}
                    onCheckedChange={(checked) => {
                      set("lineas_negocio", checked
                        ? [...form.lineas_negocio, ln.value]
                        : form.lineas_negocio.filter((l) => l !== ln.value));
                    }}
                  />
                  <Label htmlFor={`ln-${ln.value}`} className="text-sm font-normal cursor-pointer">{ln.label}</Label>
                </div>
              ))}
            </div>
          </div>
          <div>
            <Label>Notas</Label>
            <Textarea value={form.notas} onChange={(e) => set("notas", e.target.value)} placeholder="Observaciones internas..." rows={2} />
          </div>
        </div>
        <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end w-full sm:w-auto mt-4">
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button className="w-full sm:w-auto" onClick={handleSubmit} disabled={saving || !form.nombre.trim() || !form.telefono.trim()}>
            {saving ? "Guardando..." : editing ? "Guardar Cambios" : "Crear Cliente"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}