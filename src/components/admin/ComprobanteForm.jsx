import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, AlertCircle, Loader2, CreditCard, ArrowRightLeft, FileText } from "lucide-react";
import SearchableSelect from "@/components/ui/searchable-select";

const MOV_VACIO = {
  subcuenta: "", debito: "", credito: "",
  descripcion: "abono", tercero: "", cliente_id: "",
  cuenta_ahorro_id: "", producto_credito_id: "", tipo_movimiento_tdc: ""
};

export default function ComprobanteForm({
  open, onOpenChange, onSaved,
  pucTransaccional, clientes, cuentasAhorro, productosCredito,
  editing, editingMovimientos
}) {
  const [fecha, setFecha] = useState(new Date().toISOString().substring(0, 10));
  const [tipo, setTipo] = useState("diario");
  const [modo, setModo] = useState("balance");
  const [descripcion, setDescripcion] = useState("Abono");
  const [movimientos, setMovimientos] = useState([MOV_VACIO, MOV_VACIO]);
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmarSobregiro, setConfirmarSobregiro] = useState(false);

  const pucMap = {};
  pucTransaccional.forEach((c) => { pucMap[String(c.codigo)] = c; });

  useEffect(() => {
    if (!open) return;
    setError("");
    setMotivo("");
    setConfirmarSobregiro(false);
    if (editing && editingMovimientos) {
      setFecha(editing.fecha);
      setTipo(editing.tipo);
      setDescripcion(editing.descripcion || "Abono");
      const hasResultado = editingMovimientos.some((m) => {
        const c = pucMap[m.subcuenta];
        return c && (c.clase === 4 || c.clase === 5 || c.clase === 6 || c.clase === 7);
      });
      setModo(hasResultado ? "resultado" : "balance");
      setMovimientos(editingMovimientos.map((m) => ({
        subcuenta: m.subcuenta,
        debito: m.debito || "",
        credito: m.credito || "",
        descripcion: m.descripcion || "abono",
        tercero: m.tercero || "",
        cliente_id: m.cliente_id || "",
        cuenta_ahorro_id: m.cuenta_ahorro_id || "",
        producto_credito_id: m.producto_credito_id || "",
        tipo_movimiento_tdc: m.tipo_movimiento_tdc || ""
      })));
    } else {
      setFecha(new Date().toISOString().substring(0, 10));
      setTipo("diario");
      setModo("balance");
      setDescripcion("Abono");
      setMovimientos([{ ...MOV_VACIO }, { ...MOV_VACIO }]);
    }
  }, [open, editing, editingMovimientos]);

  const pucFiltradas = pucTransaccional.filter((c) => {
    if (modo === "balance") return c.clase === 1 || c.clase === 2 || c.clase === 3;
    return true;
  });

  const updateMov = (idx, field, value) => {
    const updated = [...movimientos];
    updated[idx] = { ...updated[idx], [field]: value };

    // Auto-vinculación de CDA / TDC al seleccionar cuenta PUC
    if (field === "subcuenta" && value) {
      const cuenta = pucMap[value];
      updated[idx].cuenta_ahorro_id = "";
      updated[idx].producto_credito_id = "";
      updated[idx].tipo_movimiento_tdc = "";
      if (cuenta) {
        const nombrePuc = (cuenta.concepto || "").trim();
        const cdaMatch = cuentasAhorro.find((c) =>
          String(c.subcuenta_puc) === String(cuenta.codigo) ||
          (nombrePuc && (c.nombre || "").trim() === nombrePuc)
        );
        if (cdaMatch) updated[idx].cuenta_ahorro_id = cdaMatch.id;

        const tdcMatch = productosCredito.find((p) =>
          String(p.subcuenta_puc) === String(cuenta.codigo) ||
          (nombrePuc && (p.nombre || "").trim() === nombrePuc)
        );
        if (tdcMatch) {
          updated[idx].producto_credito_id = tdcMatch.id;
          // Auto-asignar tipo_movimiento_tdc según débito/crédito existente
          if (Number(updated[idx].debito) > 0) {
            updated[idx].tipo_movimiento_tdc = "abono";
          } else if (Number(updated[idx].credito) > 0) {
            updated[idx].tipo_movimiento_tdc = "compra";
          }
        }
      }
    }

    // Auto-asignar tipo_movimiento_tdc según columna débito/crédito.
    // Débito = abono (pago que reduce deuda) aplica a TDC, CH, LIB y CR.
    // Crédito = compra/avance/financiero solo aplica a TDC.
    if (field === "debito" || field === "credito") {
      const prod = updated[idx].producto_credito_id
        ? productosCredito.find((p) => p.id === updated[idx].producto_credito_id)
        : null;
      if (prod) {
        if (field === "debito" && Number(value) > 0) {
          updated[idx].tipo_movimiento_tdc = "abono";
        } else if (field === "credito" && Number(value) > 0 && prod.tipo === "TDC") {
          if (!["avance", "financiero"].includes(updated[idx].tipo_movimiento_tdc)) {
            updated[idx].tipo_movimiento_tdc = "compra";
          }
        }
      }
    }

    // Auto-contrapartida: al escribir débito/crédito en el primer movimiento,
    // se autollena el campo contrario del segundo (solo cuando hay 2 movimientos)
    if ((field === "debito" || field === "credito") && idx === 0 && updated.length === 2) {
      const campoContrario = field === "debito" ? "credito" : "debito";
      updated[1] = { ...updated[1], [campoContrario]: value };
    }

    setMovimientos(updated);
  };

  const addMov = () => setMovimientos([...movimientos, { ...MOV_VACIO }]);
  const removeMov = (idx) => movimientos.length > 2 && setMovimientos(movimientos.filter((_, i) => i !== idx));

  const totalDebito = movimientos.reduce((s, m) => s + (Number(m.debito) || 0), 0);
  const totalCredito = movimientos.reduce((s, m) => s + (Number(m.credito) || 0), 0);
  const diferencia = totalDebito - totalCredito;

  const handleSubmit = async () => {
    setError("");
    if (!descripcion.trim()) { setError("La descripción es obligatoria"); return; }
    if (movimientos.length < 2) { setError("Debe tener al menos 2 movimientos"); return; }
    if (Math.abs(diferencia) > 0.01) { setError("Los débitos y créditos no balancean"); return; }

    const movsValidos = movimientos.filter((m) => m.subcuenta && (Number(m.debito) > 0 || Number(m.credito) > 0));
    if (movsValidos.length < 2) { setError("Debe tener al menos 2 movimientos con cuenta y valor"); return; }

    for (const m of movsValidos) {
      const cuenta = pucMap[m.subcuenta];
      if (!cuenta) { setError(`Cuenta ${m.subcuenta} no encontrada en el PUC`); return; }
      const esResultado = cuenta.clase === 4 || cuenta.clase === 5 || cuenta.clase === 6 || cuenta.clase === 7;
      if (modo === "balance" && esResultado) {
        setError(`En modo Balance no se permiten cuentas de resultado (${cuenta.concepto})`); return;
      }
      if (modo === "resultado" && esResultado) {
        if (!m.tercero?.trim()) { setError(`La cuenta ${cuenta.concepto} requiere tercero vinculado`); return; }
        if (!m.descripcion?.trim()) { setError(`La cuenta ${cuenta.concepto} requiere nota/concepto`); return; }
      }
    }

    if (editing && !motivo.trim()) { setError("El motivo de modificación es obligatorio"); return; }

    setSaving(true);
    try {
      const payload = {
        tipo, fecha, descripcion: descripcion.trim(),
        movimientos: movsValidos.map((m) => ({
          subcuenta: m.subcuenta,
          debito: Number(m.debito) || 0,
          credito: Number(m.credito) || 0,
          descripcion: m.descripcion || "abono",
          tercero: m.tercero || "",
          cliente_id: m.cliente_id || "",
          cuenta_ahorro_id: m.cuenta_ahorro_id || "",
          producto_credito_id: m.producto_credito_id || "",
          tipo_movimiento_tdc: m.tipo_movimiento_tdc || null
        })),
        modo,
        confirmar_sobregiro: confirmarSobregiro
      };

      let response;
      if (editing) {
        payload.comprobante_id = editing.id;
        payload.motivo = motivo.trim();
        response = await base44.functions.invoke("modificarComprobante", payload);
      } else {
        response = await base44.functions.invoke("createComprobante", payload);
      }

      onSaved();
      onOpenChange(false);
    } catch (e) {
      const errData = e?.data || e?.response?.data || {};
      const errMsg = errData.error || errData.message || e?.message || "Error al procesar comprobante";
      if (errData.requiere_confirmacion) {
        setConfirmarSobregiro(true);
      }
      setError(errMsg);
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {editing ? (
              <><ArrowRightLeft className="w-5 h-5 text-primary" /> Modificar Comprobante {editing.numero}</>
            ) : (
              <><FileText className="w-5 h-5 text-primary" /> Nuevo Comprobante Contable</>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Modo + encabezado */}
          <div className="grid grid-cols-4 gap-3">
            <div>
              <Label>Modo de Registro *</Label>
              <Select value={modo} onValueChange={(v) => { setModo(v); setConfirmarSobregiro(false); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="balance">Balance</SelectItem>
                  <SelectItem value="resultado">Gastos e Ingresos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fecha *</Label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="diario">Diario</SelectItem>
                  <SelectItem value="ingreso">Ingreso</SelectItem>
                  <SelectItem value="egreso">Egreso</SelectItem>
                  <SelectItem value="apertura">Apertura</SelectItem>
                  <SelectItem value="cierre">Cierre</SelectItem>
                  <SelectItem value="nota_credito">Nota Crédito</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Nota / Concepto *</Label>
              <Input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Concepto del asiento" />
            </div>
          </div>

          {modo === "balance" && (
            <div className="text-xs text-muted-foreground bg-muted/30 rounded-md px-3 py-2">
              <strong>Modo Balance:</strong> Solo se permiten cuentas de Activo, Pasivo y Patrimonio. No se pueden registrar gastos ni ingresos.
            </div>
          )}
          {modo === "resultado" && (
            <div className="text-xs text-muted-foreground bg-muted/30 rounded-md px-3 py-2">
              <strong>Modo Gastos e Ingresos:</strong> Las cuentas de resultado exigen <strong>tercero vinculado</strong> y <strong>nota/concepto</strong> en cada movimiento.
            </div>
          )}

          {/* Tabla de movimientos */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Movimientos del Asiento</Label>
              <Button size="sm" variant="outline" onClick={addMov} type="button"><Plus className="w-4 h-4 mr-1" /> Agregar línea</Button>
            </div>
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 border-b border-border">
                  <tr className="text-left text-muted-foreground uppercase">
                    <th className="px-2 py-2 font-medium w-[26%]">Cuenta PUC</th>
                    <th className="px-2 py-2 font-medium text-right w-[12%]">Débito</th>
                    <th className="px-2 py-2 font-medium text-right w-[12%]">Crédito</th>
                    <th className="px-2 py-2 font-medium w-[16%]">Concepto</th>
                    <th className="px-2 py-2 font-medium w-[24%]">Tercero (Cliente)</th>
                    <th className="px-2 py-2 font-medium w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {movimientos.map((m, idx) => {
                    const cuenta = pucMap[m.subcuenta];
                    const esResultado = cuenta && (cuenta.clase === 4 || cuenta.clase === 5 || cuenta.clase === 6 || cuenta.clase === 7);
                    const requiereTercero = modo === "resultado" && esResultado;
                    const prodCredito = m.producto_credito_id ? productosCredito.find(p => p.id === m.producto_credito_id) : null;
                    return (
                      <tr key={idx} className="border-b border-border/50">
                        <td className="px-2 py-1">
                          <SearchableSelect
                            value={m.subcuenta}
                            onValueChange={(v) => updateMov(idx, "subcuenta", v)}
                            placeholder="Cuenta..."
                            searchPlaceholder="Buscar por código o nombre..."
                            triggerClassName="h-8 text-xs"
                            options={pucFiltradas.map((c) => ({
                              value: String(c.codigo),
                              label: `${c.codigo} — ${c.concepto}`,
                              searchKey: `${c.codigo} ${c.concepto}`
                            }))}
                          />
                          {prodCredito?.tipo === "TDC" && Number(m.debito) > 0 && (
                            <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground bg-muted/40 rounded px-1.5 py-1">
                              <CreditCard className="w-2.5 h-2.5 shrink-0" /> Abono
                            </div>
                          )}
                          {prodCredito?.tipo === "TDC" && Number(m.credito) > 0 && (
                            <Select value={m.tipo_movimiento_tdc || "compra"} onValueChange={(v) => updateMov(idx, "tipo_movimiento_tdc", v)}>
                              <SelectTrigger className="h-7 text-xs mt-1"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="compra">Compra</SelectItem>
                                <SelectItem value="avance">Avance</SelectItem>
                                <SelectItem value="financiero">Financiero</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        </td>
                        <td className="px-2 py-1"><Input type="number" value={m.debito} onChange={(e) => updateMov(idx, "debito", e.target.value)} className="h-8 text-xs text-right" placeholder="0" /></td>
                        <td className="px-2 py-1"><Input type="number" value={m.credito} onChange={(e) => updateMov(idx, "credito", e.target.value)} className="h-8 text-xs text-right" placeholder="0" /></td>
                        <td className="px-2 py-1"><Input value={m.descripcion} onChange={(e) => updateMov(idx, "descripcion", e.target.value)} className={`h-8 text-xs ${requiereTercero ? "border-warning" : ""}`} placeholder="abono" /></td>
                        <td className="px-2 py-1">
                          <SearchableSelect
                            value={m.cliente_id}
                            onValueChange={(v) => {
                              const cli = clientes.find(c => c.id === v);
                              updateMov(idx, "cliente_id", v);
                              updateMov(idx, "tercero", cli ? cli.nombre : "");
                            }}
                            placeholder={requiereTercero ? "Requerido" : "Seleccionar"}
                            searchPlaceholder="Buscar cliente..."
                            triggerClassName={`h-8 text-xs ${requiereTercero ? "border-warning" : ""}`}
                            options={clientes.map((c) => ({
                              value: c.id,
                              label: `${c.nombre}${c.cedula ? ` · ${c.cedula}` : ""}`,
                              searchKey: `${c.nombre} ${c.cedula || ""}`
                            }))}
                          />
                        </td>
                        <td className="px-2 py-1 text-center"><Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeMov(idx)} disabled={movimientos.length <= 2}><Trash2 className="w-3 h-3 text-destructive" /></Button></td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-muted/30 border-t-2 border-border">
                  <tr className="font-medium text-sm">
                    <td className="px-2 py-2">Totales</td>
                    <td className="px-2 py-2 text-right font-mono">{totalDebito.toLocaleString("es-CO")}</td>
                    <td className="px-2 py-2 text-right font-mono">{totalCredito.toLocaleString("es-CO")}</td>
                    <td colSpan={3} className={`px-2 py-2 text-right font-mono ${Math.abs(diferencia) < 0.01 ? "text-success" : "text-destructive"}`}>
                      Diff: {diferencia.toLocaleString("es-CO")}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Las vinculaciones con cuentas de ahorro y tarjetas se gestionan automáticamente
              desde el backend al seleccionar la cuenta PUC; no se exponen al registrante. */}

          {/* Motivo de modificación (solo edición) */}
          {editing && (
            <div>
              <Label>Motivo de Modificación *</Label>
              <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Justifique la modificación..." />
              <p className="text-xs text-muted-foreground mt-1">
                El comprobante se actualizará directamente con los cambios (mismo número, sin nota crédito). Los datos originales se guardarán en el histórico como respaldo de la justificación.
              </p>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {confirmarSobregiro && !error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 border border-warning/30 text-sm text-warning">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>Confirme el sobregiro y vuelva a enviar el comprobante.</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {editing ? "Guardar Modificación" : confirmarSobregiro ? "Confirmar y Guardar" : "Guardar Comprobante"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}