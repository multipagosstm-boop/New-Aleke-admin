import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { BANCOS, BANCO_NAMES, generateCDANombre } from "@/lib/contabilidad";
import { AlertCircle } from "lucide-react";
import QuickAddCliente from "./QuickAddCliente";

export default function CuentaAhorroForm({ open, onOpenChange, onSaved, editing, clientes, pucTransaccional }) {
  const [numeroCompleto, setNumeroCompleto] = useState("");
  const [banco, setBanco] = useState("");
  const [titularId, setTitularId] = useState("");
  const [subcuentaPuc, setSubcuentaPuc] = useState("");
  const [nota, setNota] = useState("");
  const [saldoInicial, setSaldoInicial] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [cuentasExistentes, setCuentasExistentes] = useState([]);

  useEffect(() => {
    if (open) {
      setError("");
      base44.entities.CuentaAhorro.list().then(setCuentasExistentes).catch(() => {});
    }
  }, [open]);

  const normNC = (s) => String(s || "").replace(/\D/g, "");
  const duplicado = (() => {
    if (editing) return null;
    const nc = normNC(numeroCompleto);
    if (!nc) return null;
    return (cuentasExistentes || []).find((c) => normNC(c.numero_completo) === nc);
  })();

  useEffect(() => {
    setError("");
    if (editing) {
      setNumeroCompleto(editing.numero_completo || "");
      setBanco(editing.banco || "");
      setTitularId(editing.titular_id || "");
      setSubcuentaPuc(editing.subcuenta_puc || "");
      setNota(editing.nota || "");
      setSaldoInicial(editing.saldo || 0);
    } else {
      setNumeroCompleto(""); setBanco(""); setTitularId(""); setSubcuentaPuc(""); setNota(""); setSaldoInicial(0);
    }
  }, [editing, open]);

  const nombreGenerado = generateCDANombre(numeroCompleto);

  const handleSubmit = async () => {
    if (!numeroCompleto.trim() || !banco || !titularId) {
      setError("Complete todos los campos obligatorios");
      return;
    }
    if (editing && !subcuentaPuc) {
      setError("La cuenta contable (PUC) es obligatoria");
      return;
    }
    if (duplicado) {
      setError(`Ya existe una cuenta de ahorro con ese número: ${duplicado.nombre}. Edita o elimina la existente.`);
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (editing) {
        await base44.entities.CuentaAhorro.update(editing.id, {
          nombre: nombreGenerado,
          numero_completo: numeroCompleto.trim(),
          banco,
          subcuenta_puc: subcuentaPuc,
          titular_id: titularId,
          nota: nota.trim(),
          estado: editing.estado || "activa",
          movimientos_mes_acumulado: editing.movimientos_mes_acumulado || 0
        });
      } else {
        await base44.functions.invoke("gestionarCuentaAhorro", {
          operacion: "crear",
          banco,
          titular_id: titularId,
          numero_completo: numeroCompleto.trim(),
          nombre: nombreGenerado,
          saldo: Number(saldoInicial) || 0,
          nota: nota.trim()
        });
      }
      onSaved();
      onOpenChange(false);
    } catch (e) {
      const msg = e?.response?.data?.error || e.message;
      setError(msg);
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-lg max-h-[92vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar Cuenta de Ahorro" : "Nueva Cuenta de Ahorro"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Número de cuenta completo *</Label>
              <Input value={numeroCompleto} onChange={(e) => setNumeroCompleto(e.target.value)} placeholder="Ej: 001-123456-78" />
            </div>
            <div>
              <Label>Nombre generado</Label>
              <Input value={nombreGenerado} disabled className="bg-muted font-mono text-sm" />
            </div>
          </div>
          {duplicado && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                Ya existe una cuenta de ahorro con ese número:{" "}
                <span className="font-semibold">{duplicado.nombre}</span>{" "}
                ({BANCO_NAMES[duplicado.banco] || duplicado.banco}).{" "}
                Edita esa cuenta o elimínala antes de continuar.
              </span>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Banco *</Label>
              <Select value={banco} onValueChange={setBanco}>
                <SelectTrigger><SelectValue placeholder="Seleccionar banco" /></SelectTrigger>
                <SelectContent>
                  {BANCOS.map((b) => <SelectItem key={b.code} value={b.code}>{b.code} — {b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {!editing && (
              <div>
                <Label>Saldo inicial</Label>
                <Input type="number" value={saldoInicial} onChange={(e) => setSaldoInicial(e.target.value)} placeholder="0" />
              </div>
            )}
          </div>
          <div>
            <Label>Titular (Cliente) *</Label>
            <div className="flex gap-2">
              <Select value={titularId} onValueChange={setTitularId}>
                <SelectTrigger className="flex-1"><SelectValue placeholder="Seleccionar titular" /></SelectTrigger>
                <SelectContent>
                  {clientes.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre} — {c.cedula}</SelectItem>)}
                </SelectContent>
              </Select>
              <QuickAddCliente onCreated={(c) => { setTitularId(c.id); clientes.unshift(c); }} />
            </div>
          </div>
          {editing ? (
            <div>
              <Label>Subcuenta PUC (transaccional) *</Label>
              <Select value={subcuentaPuc} onValueChange={setSubcuentaPuc}>
                <SelectTrigger><SelectValue placeholder="Seleccionar cuenta contable" /></SelectTrigger>
                <SelectContent>
                  {pucTransaccional.map((c) => <SelectItem key={c.id} value={String(c.codigo)}>{c.codigo} — {c.concepto}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
              La cuenta contable (PUC) se creará automáticamente bajo 1110 — Bancos.
            </div>
          )}
          <div>
            <Label>Nota</Label>
            <Textarea value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Observaciones (opcional)" rows={2} />
          </div>
          {error && <div className="text-sm text-destructive">{error}</div>}
        </div>
        <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end w-full sm:w-auto mt-4">
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button className="w-full sm:w-auto" onClick={handleSubmit} disabled={saving || !!duplicado}>{saving ? "Guardando..." : editing ? "Guardar" : "Crear Cuenta"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}