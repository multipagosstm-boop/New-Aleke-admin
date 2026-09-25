import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { base44 } from "@/api/base44Client";

const TIPOS = [
  { value: "compra", label: "Compra" },
  { value: "avance", label: "Avance" },
  { value: "financiero", label: "Financiero" },
  { value: "abono", label: "Abono" },
  { value: "ajuste", label: "Ajuste" }
];

export default function EditarLineaBancoDialog({ open, onOpenChange, linea, onSaved }) {
  const [fecha, setFecha] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [tipo, setTipo] = useState("compra");
  const [naturaleza, setNaturaleza] = useState("cargo");
  const [valor, setValor] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (linea) {
      setFecha(linea.fecha || "");
      setDescripcion(linea.descripcion || "");
      setTipo(linea.tipo || "compra");
      setNaturaleza(linea.naturaleza || "cargo");
      setValor(linea.valor || 0);
    }
  }, [linea]);

  if (!linea) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await base44.entities.LineaExtracto.update(linea.id, {
        fecha, descripcion, tipo, naturaleza, valor: Number(valor)
      });
      onSaved();
      onOpenChange(false);
    } catch (e) { alert("Error: " + e.message); }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Editar línea del extracto</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Fecha</Label>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div>
            <Label>Descripción</Label>
            <Input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Naturaleza</Label>
              <Select value={naturaleza} onValueChange={setNaturaleza}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cargo">Cargo</SelectItem>
                  <SelectItem value="abono">Abono</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Valor</Label>
            <Input type="number" value={valor} onChange={(e) => setValor(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Guardando..." : "Guardar cambios"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}