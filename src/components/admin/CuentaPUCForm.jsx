import React, { useEffect, useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import SearchableSelect from "@/components/ui/searchable-select";
import { calcularNextCodigo, parentNivel, getClaseNombre } from "@/lib/cuentasPuc";

const NIVELES = [
  { value: "Clase", label: "Clase (1 dígito)" },
  { value: "Grupo", label: "Grupo (2 dígitos)" },
  { value: "Cuenta", label: "Cuenta (4 dígitos)" },
  { value: "Subcuenta", label: "Subcuenta (6 dígitos)" },
  { value: "Auxiliar", label: "Auxiliar (8 dígitos)" }
];

function previewCodigo(nivel, parentCodigo, cuentas) {
  if (!nivel || !cuentas) return "";
  return calcularNextCodigo(nivel, parentCodigo, cuentas);
}

function deriveParentCodigo(codigo, nivel) {
  const mult = nivel === "Grupo" ? 10 : 100;
  return Math.floor(Number(codigo) / mult);
}

export default function CuentaPUCForm({ open, onOpenChange, onSaved, cuentas = [], editing = null }) {
  const [nivel, setNivel] = useState("");
  const [parentCodigo, setParentCodigo] = useState(null);
  const [concepto, setConcepto] = useState("");
  const [naturaleza, setNaturaleza] = useState("Débito");
  const [tipoEstado, setTipoEstado] = useState("Balance");
  const [transaccional, setTransaccional] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setNivel(editing.nivel);
      setParentCodigo(deriveParentCodigo(editing.codigo, editing.nivel));
      setConcepto(editing.concepto || "");
      setNaturaleza(editing.naturaleza || "Débito");
      setTipoEstado(editing.tipo_estado || "Balance");
      setTransaccional(!!editing.es_transaccional);
    } else {
      setNivel("");
      setParentCodigo(null);
      setConcepto("");
      setNaturaleza("Débito");
      setTipoEstado("Balance");
      setTransaccional(false);
    }
  }, [open, editing]);

  const parentNiv = parentNivel(nivel);
  const parentOptions = useMemo(() => {
    if (!parentNiv) return [];
    return cuentas
      .filter((c) => c.nivel === parentNiv)
      .sort((a, b) => a.codigo - b.codigo)
      .map((c) => ({
        value: String(c.codigo),
        label: `${c.codigo} — ${c.concepto}`,
        searchKey: `${c.codigo} ${c.concepto}`
      }));
  }, [cuentas, parentNiv]);

  const nextCodigo = previewCodigo(nivel, parentCodigo, cuentas);
  const clasePrev = nextCodigo ? Number(String(nextCodigo)[0]) : (parentCodigo ? Number(String(parentCodigo)[0]) : null);

  const handleSubmit = async () => {
    if (!nivel) { alert("Seleccione el nivel"); return; }
    if (nivel !== "Clase" && !parentCodigo) { alert("Seleccione la cuenta padre"); return; }
    if (!concepto.trim()) { alert("Ingrese el concepto/nombre de la cuenta"); return; }
    setSaving(true);
    try {
      if (editing) {
        await base44.functions.invoke("gestionarCuentaPUC", {
          operacion: "actualizar",
          id: editing.id,
          concepto,
          naturaleza,
          tipo_estado: tipoEstado,
          es_transaccional: transaccional
        });
      } else {
        await base44.functions.invoke("gestionarCuentaPUC", {
          operacion: "crear",
          nivel,
          parent_codigo: Number(parentCodigo),
          concepto,
          naturaleza,
          tipo_estado: tipoEstado,
          es_transaccional: transaccional
        });
      }
      onSaved();
      onOpenChange(false);
    } catch (e) {
      alert("Error: " + (e?.response?.data?.error || e.message));
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-md max-h-[92vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar cuenta PUC" : "Nueva cuenta PUC"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>Nivel *</Label>
            <Select value={nivel} onValueChange={(v) => { setNivel(v); setParentCodigo(null); }} disabled={!!editing}>
              <SelectTrigger><SelectValue placeholder="Seleccione el nivel" /></SelectTrigger>
              <SelectContent>
                {NIVELES.map((n) => <SelectItem key={n.value} value={n.value}>{n.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {nivel && nivel !== "Clase" && (
            <div>
              <Label>Cuenta padre ({parentNiv}) *</Label>
              <SearchableSelect
                options={parentOptions}
                value={parentCodigo != null ? String(parentCodigo) : ""}
                onValueChange={(v) => setParentCodigo(v ? Number(v) : null)}
                placeholder="Buscar cuenta padre..."
                searchPlaceholder="Buscar por código o nombre"
              />
            </div>
          )}

          {nivel && (
            <div className="flex items-center gap-2 text-xs bg-muted/50 rounded-md p-2">
              <span className="text-muted-foreground">Código generado:</span>
              <span className="font-mono font-semibold">{nextCodigo ?? "—"}</span>
              {clasePrev && (
                <span className="ml-auto text-muted-foreground">Clase {clasePrev} — {getClaseNombre(clasePrev)}</span>
              )}
            </div>
          )}

          <div>
            <Label>Concepto / Nombre *</Label>
            <Input value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Ej: Bancos, Proveedores Nacionales..." />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Naturaleza *</Label>
              <Select value={naturaleza} onValueChange={setNaturaleza}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Débito">Débito</SelectItem>
                  <SelectItem value="Crédito">Crédito</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo de estado *</Label>
              <Select value={tipoEstado} onValueChange={setTipoEstado}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Balance">Balance</SelectItem>
                  <SelectItem value="Resultado">Resultado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Checkbox id="transaccional" checked={transaccional} onCheckedChange={(v) => setTransaccional(!!v)} />
            <Label htmlFor="transaccional" className="cursor-pointer text-sm font-normal">
              Es transaccional (admite movimientos contables)
            </Label>
          </div>
        </div>

        <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end w-full sm:w-auto mt-4">
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button className="w-full sm:w-auto" onClick={handleSubmit} disabled={saving}>{saving ? "Guardando..." : "Guardar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}