import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { UserPlus } from "lucide-react";

export default function QuickAddCliente({ onCreated }) {
  const [open, setOpen] = useState(false);
  const [nombre, setNombre] = useState("");
  const [cedula, setCedula] = useState("");
  const [telefono, setTelefono] = useState("");
  const [tipo, setTipo] = useState("persona");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!nombre.trim() || !cedula.trim()) return;
    setSaving(true);
    try {
      // Generar código via backend function
      const resp = await base44.functions.invoke("generarCodigoCliente", {});
      const codigo = resp.data?.codigo || "";
      const created = await base44.entities.Cliente.create({
        nombre: nombre.trim(),
        cedula: cedula.trim(),
        telefono: telefono.trim(),
        tipo,
        estado: "activo",
        codigo,
        lineas_negocio: []
      });
      onCreated(created);
      setOpen(false);
      setNombre(""); setCedula(""); setTelefono("");
    } catch (e) {
      alert("Error: " + e.message);
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" size="sm" type="button" onClick={() => setOpen(true)}>
        <UserPlus className="w-4 h-4 mr-1" /> Nuevo
      </Button>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar Cliente Rápido</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nombre completo *</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre del titular" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Cédula / NIT *</Label>
              <Input value={cedula} onChange={(e) => setCedula(e.target.value)} placeholder="Número de identificación" />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="persona">Persona</SelectItem>
                  <SelectItem value="empresa">Empresa</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Teléfono</Label>
            <Input value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="Opcional" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving || !nombre.trim() || !cedula.trim()}>
            {saving ? "Guardando..." : "Crear Cliente"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}