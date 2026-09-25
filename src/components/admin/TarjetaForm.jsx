import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { BANCOS, TIPO_PRODUCTO, generateProductoNombre, computeDiaCortePorSemana } from "@/lib/contabilidad";
import { AlertCircle } from "lucide-react";
import QuickAddCliente from "./QuickAddCliente";
import TarjetaAtributosFields from "./TarjetaAtributos";

export default function TarjetaForm({ open, onOpenChange, onSaved, editing, clientes, pucTransaccional, productosExistentes, initialBanco = "", initialDigitos = "", initialTipo = "TDC", initialTitularId = "" }) {
  const [tipo, setTipo] = useState("TDC");
  const [banco, setBanco] = useState("");
  const [digitosRef, setDigitosRef] = useState("");
  const [numeroCompleto, setNumeroCompleto] = useState("");
  const [titularId, setTitularId] = useState("");
  const [cupo, setCupo] = useState(0);
  const [fechaCorte, setFechaCorte] = useState(1);
  const [subcuentaPuc, setSubcuentaPuc] = useState("");
  const [franquicia, setFranquicia] = useState("");
  const [categoria, setCategoria] = useState("");
  const [corteModo, setCorteModo] = useState("dia_fijo");
  const [corteSemana, setCorteSemana] = useState(1);
  const [corteDiaSemana, setCorteDiaSemana] = useState(5);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (editing) {
      setTipo(editing.tipo || "TDC");
      setBanco(editing.banco || "");
      setDigitosRef(editing.nombre ? (editing.nombre.split("-")[1] || "").replace(/\D/g, "") : "");
      setNumeroCompleto(editing.numero_completo || "");
      setTitularId(editing.titular_id || "");
      setCupo(editing.cupo || 0);
      setFechaCorte(editing.fecha_corte || 1);
      setSubcuentaPuc(editing.subcuenta_puc || "");
      setFranquicia(editing.franquicia || "");
      setCategoria(editing.categoria || "");
      setCorteModo(editing.corte_modo || "dia_fijo");
      setCorteSemana(editing.corte_semana || 1);
      setCorteDiaSemana(editing.corte_dia_semana || 5);
    } else {
      setTipo(initialTipo); setBanco(initialBanco || ""); setDigitosRef(initialDigitos || ""); setNumeroCompleto(""); setTitularId(initialTitularId || ""); setCupo(0); setFechaCorte(1); setSubcuentaPuc("");
      setFranquicia(""); setCategoria(""); setCorteModo("dia_fijo"); setCorteSemana(1); setCorteDiaSemana(5);
    }
    setError("");
  }, [editing, open, initialBanco, initialDigitos, initialTipo, initialTitularId]);

  // Detección automática de los 4 últimos dígitos desde el número completo
  const digitsOnly = String(numeroCompleto || "").replace(/\D/g, "");
  const digitosAuto = digitsOnly.length >= 4 ? digitsOnly.slice(-4) : "";
  const digitosEfectivos = tipo === "TDC" && digitosAuto ? digitosAuto : digitosRef;
  const nombreGenerado = generateProductoNombre(tipo, digitosEfectivos);

  const normNC = (s) => String(s || "").replace(/\D/g, "");
  const duplicado = (() => {
    if (editing) return null;
    const nc = normNC(numeroCompleto);
    if (nc) {
      const m = (productosExistentes || []).find((p) => normNC(p.numero_completo) === nc);
      if (m) return { tipo: "numero_completo", producto: m };
    }
    if (tipo === "TDC" && banco) {
      const d4 = String(digitosEfectivos || "").replace(/\D/g, "").slice(-4);
      if (d4.length === 4) {
        const m = (productosExistentes || []).find((p) =>
          p.banco === banco && String(p.nomenclatura || "").replace(/\D/g, "").endsWith(d4)
        );
        if (m) return { tipo: "banco_digitos", producto: m };
      }
    }
    return null;
  })();

  // Para TDC la cuenta PUC se crea automáticamente en el backend
  const esAutoPuc = tipo === "TDC" && !editing;

  const handleSubmit = async () => {
    if (!banco || !titularId) { setError("Complete todos los campos obligatorios"); return; }
    if (tipo === "TDC") {
      if (!digitsOnly || digitsOnly.length < 4) { setError("Ingrese el número completo de la tarjeta"); return; }
      if (!digitosEfectivos || digitosEfectivos.length !== 4) { setError("No se pudieron determinar los 4 últimos dígitos"); return; }
    }
    // Calcular día de corte efectivo
    let fechaCorteFinal = Number(fechaCorte) || 1;
    if (corteModo === "dia_semana") {
      const hoy = new Date();
      fechaCorteFinal = computeDiaCortePorSemana(hoy.getFullYear(), hoy.getMonth(), Number(corteSemana) || 1, Number(corteDiaSemana) || 5);
      if (!fechaCorteFinal) { setError("La configuración de corte por día de la semana no es válida para este mes"); return; }
    }
    if (duplicado) {
      setError(`Ya existe una tarjeta con estos datos: ${duplicado.producto.nombre} (${duplicado.producto.nomenclatura}).`);
      return;
    }
    if (!esAutoPuc && !editing && !subcuentaPuc) { setError("Seleccione la cuenta contable (PUC)"); return; }

    setSaving(true);
    setError("");
    try {
      if (editing) {
        // Edición directa (sin cambiar versiones)
        const data = {
          nombre: nombreGenerado,
          numero_completo: numeroCompleto,
          tipo,
          banco,
          subcuenta_puc: subcuentaPuc,
          titular_id: titularId,
          cupo: Number(cupo) || 0,
          fecha_corte: fechaCorteFinal,
          franquicia: tipo === "TDC" ? (franquicia || undefined) : undefined,
          categoria: tipo === "TDC" ? (categoria || undefined) : undefined,
          corte_modo: corteModo,
          corte_semana: corteModo === "dia_semana" ? Number(corteSemana) : undefined,
          corte_dia_semana: corteModo === "dia_semana" ? Number(corteDiaSemana) : undefined,
          estado: editing.estado || "activo",
          version_consecutivo: editing.version_consecutivo || 1
        };
        await base44.entities.ProductoCredito.update(editing.id, data);
      } else if (esAutoPuc) {
        // TDC: crear via backend con PUC automático
        await base44.functions.invoke("gestionarTarjeta", {
          operacion: "crear",
          tipo,
          banco,
          titular_id: titularId,
          cupo: Number(cupo) || 0,
          fecha_corte: fechaCorteFinal,
          digitos_ref: digitosEfectivos,
          nombre: nombreGenerado,
          numero_completo: numeroCompleto,
          franquicia: tipo === "TDC" ? franquicia : "",
          categoria: tipo === "TDC" ? categoria : "",
          corte_modo: corteModo,
          corte_semana: corteModo === "dia_semana" ? Number(corteSemana) : 0,
          corte_dia_semana: corteModo === "dia_semana" ? Number(corteDiaSemana) : 0
        });
      } else {
        // Otros tipos: creación directa con PUC manual
        await base44.entities.ProductoCredito.create({
          nombre: nombreGenerado,
          numero_completo: numeroCompleto,
          tipo,
          banco,
          subcuenta_puc: subcuentaPuc,
          titular_id: titularId,
          cupo: Number(cupo) || 0,
          saldo: 0,
          fecha_corte: fechaCorteFinal,
          corte_modo: corteModo,
          corte_semana: corteModo === "dia_semana" ? Number(corteSemana) : undefined,
          corte_dia_semana: corteModo === "dia_semana" ? Number(corteDiaSemana) : undefined,
          estado: "activo",
          version_consecutivo: 1,
          codigo_interno: `${banco}${String(productosExistentes.filter(p => p.banco === banco && p.tipo === tipo).length + 1).padStart(3, "0")}`,
          nomenclatura: `${banco}${String(productosExistentes.filter(p => p.banco === banco && p.tipo === tipo).length + 1).padStart(3, "0")}`,
          operacion: "creacion",
          operacion_fecha: new Date().toISOString(),
          operacion_detalle: "Creación inicial"
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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar Producto de Crédito" : "Nuevo Producto de Crédito"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tipo de producto *</Label>
              <Select value={tipo} onValueChange={setTipo} disabled={!!editing}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TIPO_PRODUCTO).map(([k, v]) => <SelectItem key={k} value={k}>{k} — {v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Banco *</Label>
              <Select value={banco} onValueChange={setBanco} disabled={!!editing}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  {BANCOS.map((b) => <SelectItem key={b.code} value={b.code}>{b.code} — {b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Número completo de la tarjeta{tipo === "TDC" ? " *" : " (opcional)"}</Label>
            <Input value={numeroCompleto} onChange={(e) => setNumeroCompleto(e.target.value)} placeholder="Ej: 4557 8800 1234 5678" maxLength={19} />
          </div>
          {tipo !== "TDC" && (
            <div>
              <Label>4 últimos dígitos (opcional)</Label>
              <Input value={digitosRef} onChange={(e) => setDigitosRef(e.target.value)} placeholder="Ej: 5513" maxLength={4} disabled={!!editing} />
            </div>
          )}
          <div>
            <Label>Nombre generado</Label>
            <Input value={nombreGenerado} disabled className="bg-muted font-mono text-sm" />
            {tipo === "TDC" && digitosAuto && (
              <p className="text-[11px] text-muted-foreground mt-1">Últimos 4 dígitos detectados automáticamente: <span className="font-mono font-medium text-foreground">{digitosAuto}</span></p>
            )}
          </div>
          {duplicado && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                Ya existe una tarjeta registrada con estos datos:{" "}
                <span className="font-semibold">{duplicado.producto.nombre}</span>{" "}
                ({duplicado.producto.nomenclatura}).{" "}
                {duplicado.tipo === "numero_completo"
                  ? "Coincide el número de tarjeta completo."
                  : "Coincide banco + últimos 4 dígitos."}
                {" "}Edita esa tarjeta o elimínala antes de continuar.
              </span>
            </div>
          )}
          <div>
            <Label>Cupo / Límite {tipo === "TDC" ? "*" : ""}</Label>
            <Input type="number" value={cupo} onChange={(e) => setCupo(e.target.value)} placeholder="0" />
          </div>
          <TarjetaAtributosFields
            esTDC={tipo === "TDC"}
            franquicia={franquicia} setFranquicia={setFranquicia}
            categoria={categoria} setCategoria={setCategoria}
            corteModo={corteModo} setCorteModo={setCorteModo}
            fechaCorte={fechaCorte} setFechaCorte={setFechaCorte}
            corteSemana={corteSemana} setCorteSemana={setCorteSemana}
            corteDiaSemana={corteDiaSemana} setCorteDiaSemana={setCorteDiaSemana}
          />
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
          {esAutoPuc ? (
            <div className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
              La cuenta contable (PUC) se creará automáticamente bajo 2110 — Tarjetas de Crédito.
            </div>
          ) : (
            <div>
              <Label>Subcuenta PUC (transaccional) *</Label>
              <Select value={subcuentaPuc} onValueChange={setSubcuentaPuc} disabled={!!editing}>
                <SelectTrigger><SelectValue placeholder="Seleccionar cuenta contable" /></SelectTrigger>
                <SelectContent>
                  {pucTransaccional.map((c) => <SelectItem key={c.id} value={String(c.codigo)}>{c.codigo} — {c.concepto}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {error && <div className="text-sm text-destructive">{error}</div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving || !!duplicado}>{saving ? "Guardando..." : editing ? "Guardar" : "Crear Producto"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}