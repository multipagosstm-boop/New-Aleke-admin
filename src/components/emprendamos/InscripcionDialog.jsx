import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertCircle, Loader2, UserPlus, Plus, Trash2, CreditCard, Landmark, FileText, HandCoins } from "lucide-react";
import SearchableSelect from "@/components/ui/searchable-select";
import { NumberInput } from "@/components/ui/number-input";
import CuentaIngresoSelect from "@/components/admin/CuentaIngresoSelect";
import TarjetaForm from "@/components/admin/TarjetaForm";
import CuentaPUCForm from "@/components/admin/CuentaPUCForm";
import { hoyLocal, formatCOP, BANCOS } from "@/lib/contabilidad";

const TIPOS = [
  { key: "tdc", label: "Tarjeta de crédito", icon: CreditCard, color: "text-primary" },
  { key: "bancario", label: "Crédito bancario", icon: Landmark, color: "text-primary" },
  { key: "otro_prestamo", label: "Otro préstamo", icon: FileText, color: "text-primary" },
  { key: "emprendamos", label: "Préstamo Emprendamos", icon: HandCoins, color: "text-primary" }
];

let _key = 0;
const newKey = () => `p${++_key}`;

export default function InscripcionDialog({ open, onOpenChange, onSaved, clientes }) {
  const [clienteId, setClienteId] = useState("");
  const [fechaIngreso, setFechaIngreso] = useState(hoyLocal());
  const [diaPago, setDiaPago] = useState(Number(hoyLocal().split("-")[2]));
  const [tasaAcordada, setTasaAcordada] = useState(3);
  const [tasaExtracupo, setTasaExtracupo] = useState(6);
  const [cdaNueva, setCdaNueva] = useState({ banco: "", numero_completo: "", saldo: 0, nota: "" });
  const [notas, setNotas] = useState("");
  const [productos, setProductos] = useState([]);
  const [productosDB, setProductosDB] = useState([]);
  const [cuentasDB, setCuentasDB] = useState([]);
  const [tarjetaOpen, setTarjetaOpen] = useState(false);
  const [tarjetaTipo, setTarjetaTipo] = useState("TDC");
  const [cuentaPUCOpen, setCuentaPUCOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const listas = useCallback(async () => {
    const [pr, cu] = await Promise.all([
      base44.entities.ProductoCredito.list("-created_date", 500),
      base44.entities.Cuenta.list()
    ]);
    setProductosDB(pr); setCuentasDB(cu);
  }, []);

  useEffect(() => {
    if (!open) return;
    setClienteId(""); setFechaIngreso(hoyLocal()); setDiaPago(Number(hoyLocal().split("-")[2]));
    setTasaAcordada(3); setTasaExtracupo(6);
    setCdaNueva({ banco: "", numero_completo: "", saldo: 0, nota: "" });
    setNotas(""); setProductos([]); setError("");
    listas();
  }, [open, listas]);

  const total = productos.reduce((s, p) => s + (Number(p.saldo_inicial) || 0), 0);

  const addProducto = (tipo) => setProductos((ps) => [...ps, { key: newKey(), tipo, producto_credito_id: "", cuenta_codigo: "", cuenta_ahorro_id: "", nombre: "", saldo_inicial: 0, concepto: "" }]);
  const updateProducto = (key, field, value) => setProductos((ps) => ps.map((p) => (p.key === key ? { ...p, [field]: value } : p)));
  const removeProducto = (key) => setProductos((ps) => ps.filter((p) => p.key !== key));

  const onFechaChange = (v) => {
    setFechaIngreso(v);
    const d = Number((v || "").split("-")[2]);
    if (d >= 1 && d <= 28) setDiaPago(d);
  };

  const openTarjeta = (tipo) => { setTarjetaTipo(tipo === "tdc" ? "TDC" : "LIB"); setTarjetaOpen(true); };
  const onTarjetaSaved = async () => { await listas(); };
  const onCuentaPUCSaved = async () => { await listas(); };

  const handleSubmit = async () => {
    setError("");
    if (!clienteId) { setError("Seleccione un cliente"); return; }
    if ((cdaNueva.banco || cdaNueva.numero_completo.trim()) && !(cdaNueva.banco && cdaNueva.numero_completo.trim())) { setError("Complete ambos campos de la cuenta de ahorro (banco y número) o déjela vacía"); return; }
    if (productos.length === 0) { setError("Ingrese al menos un producto"); return; }
    for (const p of productos) {
      if (!p.cuenta_codigo) { setError("Cada producto debe tener una cuenta asignada"); return; }
      if (!p.saldo_inicial || Number(p.saldo_inicial) <= 0) { setError("Cada producto debe tener un saldo inicial válido"); return; }
    }
    setSaving(true);
    try {
      await base44.functions.invoke("gestionarEmprendamos", {
        accion: "inscribirClienteProductos",
        cliente_id: clienteId, fecha_ingreso: fechaIngreso, dia_pago: Number(diaPago),
        tasa_acordada: Number(tasaAcordada) / 100, tasa_extracupo: Number(tasaExtracupo) / 100,
        cda_nueva: (cdaNueva.banco && cdaNueva.numero_completo.trim()) ? { banco: cdaNueva.banco, numero_completo: cdaNueva.numero_completo.trim(), saldo: Number(cdaNueva.saldo) || 0, nota: cdaNueva.nota } : null,
        notas,
        productos: productos.map((p) => ({
          tipo: p.tipo, subcuenta: p.cuenta_codigo, producto_credito_id: p.producto_credito_id,
          cuenta_ahorro_id: p.cuenta_ahorro_id, saldo_inicial: Number(p.saldo_inicial), concepto: p.concepto
        }))
      });
      onSaved(); onOpenChange(false);
    } catch (e) {
      const errData = e?.data || e?.response?.data || {};
      setError(errData.error || e?.message || "Error al inscribir");
    }
    setSaving(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><UserPlus className="w-5 h-5 text-primary" /> Inscribir cliente — Préstamo inicial</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Cliente *</Label>
              <SearchableSelect value={clienteId} onValueChange={setClienteId} placeholder="Seleccionar cliente..." searchPlaceholder="Buscar cliente..."
                options={clientes.map((c) => ({ value: c.id, label: `${c.nombre}${c.cedula ? ` · ${c.cedula}` : ""}`, searchKey: `${c.nombre} ${c.cedula || ""}` }))} />
            </div>
            <div className="grid grid-cols-4 gap-3">
              <div><Label>Fecha ingreso *</Label><Input type="date" value={fechaIngreso} onChange={(e) => onFechaChange(e.target.value)} /></div>
              <div><Label>Día de pago *</Label><Input type="number" min={1} max={28} value={diaPago} onChange={(e) => setDiaPago(e.target.value)} /></div>
              <div><Label>Tasa mensual (%) *</Label><Input type="number" step="0.1" value={tasaAcordada} onChange={(e) => setTasaAcordada(e.target.value)} /></div>
              <div><Label>Tasa extracupo (%)</Label><Input type="number" step="0.1" value={tasaExtracupo} onChange={(e) => setTasaExtracupo(e.target.value)} /></div>
            </div>

            {/* Cuenta de ahorro a gestionar: siempre nueva */}
            <div className="rounded-lg border border-border p-3 space-y-2 bg-muted/20">
              <div className="flex items-center gap-1.5"><Landmark className="w-4 h-4 text-primary" /><Label className="text-xs uppercase">Cuenta de ahorro a gestionar (nueva)</Label><span className="text-[10px] text-muted-foreground">— opcional</span></div>
              <div className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-5">
                  <Label className="text-[10px] uppercase">Número de cuenta</Label>
                  <Input value={cdaNueva.numero_completo} onChange={(e) => setCdaNueva((s) => ({ ...s, numero_completo: e.target.value }))} placeholder="001-123456-78" />
                </div>
                <div className="col-span-4">
                  <Label className="text-[10px] uppercase">Banco</Label>
                  <Select value={cdaNueva.banco} onValueChange={(v) => setCdaNueva((s) => ({ ...s, banco: v }))}>
                    <SelectTrigger><SelectValue placeholder="Banco" /></SelectTrigger>
                    <SelectContent>{BANCOS.map((b) => <SelectItem key={b.code} value={b.code}>{b.code} — {b.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="col-span-3">
                  <Label className="text-[10px] uppercase">Saldo inicial</Label>
                  <NumberInput value={cdaNueva.saldo} onChange={(v) => setCdaNueva((s) => ({ ...s, saldo: v }))} className="text-right" />
                </div>
                <div className="col-span-12">
                  <Label className="text-[10px] uppercase">Nota CDA</Label>
                  <Input value={cdaNueva.nota} onChange={(e) => setCdaNueva((s) => ({ ...s, nota: e.target.value }))} placeholder="Observaciones..." />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">Opcional. Si la diligencia, se crea nueva bajo 1110 — Bancos y se vincula al cliente. {clienteId ? "" : "Seleccione un cliente primero."}</p>
            </div>

            <div><Label>Notas generales</Label><Input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Nota del préstamo..." /></div>

            {/* Tabla de productos */}
            <div className="rounded-lg border border-border">
              <div className="flex flex-wrap gap-2 p-3 border-b bg-muted/30">
                {TIPOS.map((t) => (
                  <Button key={t.key} type="button" size="sm" variant="outline" onClick={() => addProducto(t.key)}>
                    <t.icon className="w-3.5 h-3.5 mr-1" /> {t.label}
                  </Button>
                ))}
              </div>
              {productos.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                  Agregue los productos que el cliente aporta. El asiento será: Débito 120502 (cartera) vs Crédito cada producto ingresado.
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {productos.map((p) => (
                    <ProductoRow key={p.key} row={p} clienteId={clienteId} productosDB={productosDB} cuentasDB={cuentasDB}
                      clientes={clientes} onChange={(f, v) => updateProducto(p.key, f, v)} onRemove={() => removeProducto(p.key)}
                      onCrearTarjeta={() => openTarjeta(p.tipo)} onCrearCuenta={() => setCuentaPUCOpen(true)} />
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between px-3 py-2 border-t bg-muted/20 text-sm">
                <span className="text-muted-foreground">Total préstamo inicial</span>
                <span className="font-heading font-semibold font-mono">{formatCOP(total)}</span>
              </div>
            </div>

            {error && <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive"><AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /><span>{error}</span></div>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Inscribir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TarjetaForm open={tarjetaOpen} onOpenChange={setTarjetaOpen} onSaved={onTarjetaSaved}
        clientes={clientes} pucTransaccional={cuentasDB.filter((c) => c.es_transaccional)} productosExistentes={productosDB}
        initialTipo={tarjetaTipo} initialTitularId={clienteId} />
      <CuentaPUCForm open={cuentaPUCOpen} onOpenChange={setCuentaPUCOpen} onSaved={onCuentaPUCSaved} cuentas={cuentasDB} />
    </>
  );
}

function ProductoRow({ row, clienteId, productosDB, cuentasDB, clientes, onChange, onRemove, onCrearTarjeta, onCrearCuenta }) {
  const tipoLabel = TIPOS.find((t) => t.key === row.tipo)?.label || row.tipo;

  if (row.tipo === "emprendamos") {
    return (
      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase text-muted-foreground">{tipoLabel} <span className="text-foreground normal-case font-normal">— dinero que Emprendamos presta</span></span>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onRemove}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
        </div>
        <div className="grid grid-cols-12 gap-2 items-end">
          <div className="col-span-5">
            <Label className="text-[10px] uppercase">Cuenta nuestra (origen)</Label>
            <CuentaIngresoSelect value={row.cuenta_codigo} onValueChange={(v) => { onChange("cuenta_codigo", v.subcuenta); onChange("cuenta_ahorro_id", v.cuenta_ahorro_id); onChange("producto_credito_id", v.producto_credito_id); }} placeholder="CDA, efectivo, TDC..." />
          </div>
          <div className="col-span-3">
            <Label className="text-[10px] uppercase">Saldo inicial</Label>
            <NumberInput value={row.saldo_inicial} onChange={(v) => onChange("saldo_inicial", v)} className="text-right" />
          </div>
          <div className="col-span-4">
            <Label className="text-[10px] uppercase">Concepto</Label>
            <Input value={row.concepto} onChange={(e) => onChange("concepto", e.target.value)} placeholder="Nota..." />
          </div>
        </div>
      </div>
    );
  }

  if (row.tipo === "otro_prestamo") {
    const cuentaOptions = cuentasDB.filter((c) => c.es_transaccional).map((c) => ({ value: String(c.codigo), label: `${c.codigo} — ${c.concepto}`, searchKey: `${c.codigo} ${c.concepto}` }));
    return (
      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase text-muted-foreground">{tipoLabel} <span className="text-foreground normal-case font-normal">— cuenta contable (deuda)</span></span>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" className="h-7" onClick={onCrearCuenta}><Plus className="w-3.5 h-3.5 mr-1" /> Crear cuenta</Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onRemove}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
          </div>
        </div>
        <div className="grid grid-cols-12 gap-2 items-end">
          <div className="col-span-5">
            <Label className="text-[10px] uppercase">Cuenta PUC</Label>
            <SearchableSelect value={row.cuenta_codigo} onValueChange={(v) => { const c = cuentasDB.find((x) => String(x.codigo) === v); onChange("cuenta_codigo", v); onChange("nombre", c?.concepto || ""); }} placeholder="Seleccionar cuenta..." searchPlaceholder="Buscar cuenta..." options={cuentaOptions} />
          </div>
          <div className="col-span-3">
            <Label className="text-[10px] uppercase">Saldo inicial</Label>
            <NumberInput value={row.saldo_inicial} onChange={(v) => onChange("saldo_inicial", v)} className="text-right" />
          </div>
          <div className="col-span-4">
            <Label className="text-[10px] uppercase">Concepto</Label>
            <Input value={row.concepto} onChange={(e) => onChange("concepto", e.target.value)} placeholder="Nota..." />
          </div>
        </div>
      </div>
    );
  }

  // tdc o bancario
  const tiposProd = row.tipo === "tdc" ? ["TDC"] : ["LIB", "CR", "CH"];
  const prodOptions = productosDB.filter((p) => p.titular_id === clienteId && tiposProd.includes(p.tipo)).map((p) => ({ value: p.id, label: `${p.nombre} · ${p.banco}`, searchKey: `${p.nombre} ${p.banco}` }));
  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase text-muted-foreground">{tipoLabel} <span className="text-foreground normal-case font-normal">— producto del cliente</span></span>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" className="h-7" onClick={onCrearTarjeta}><Plus className="w-3.5 h-3.5 mr-1" /> Crear {row.tipo === "tdc" ? "tarjeta" : "crédito"}</Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onRemove}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
        </div>
      </div>
      <div className="grid grid-cols-12 gap-2 items-end">
        <div className="col-span-5">
          <Label className="text-[10px] uppercase">Producto</Label>
          {clienteId ? (
            <SearchableSelect value={row.producto_credito_id} onValueChange={(v) => { const pr = productosDB.find((x) => x.id === v); onChange("producto_credito_id", v); onChange("nombre", pr?.nombre || ""); onChange("cuenta_codigo", pr?.subcuenta_puc || ""); onChange("saldo_inicial", pr?.cupo || 0); }} placeholder="Seleccionar producto..." searchPlaceholder="Buscar producto..." options={prodOptions} />
          ) : (
            <div className="text-xs text-muted-foreground py-2">Seleccione un cliente primero</div>
          )}
        </div>
        <div className="col-span-3">
          <Label className="text-[10px] uppercase">Saldo inicial</Label>
          <NumberInput value={row.saldo_inicial} onChange={(v) => onChange("saldo_inicial", v)} className="text-right" />
        </div>
        <div className="col-span-4">
          <Label className="text-[10px] uppercase">Concepto</Label>
          <Input value={row.concepto} onChange={(e) => onChange("concepto", e.target.value)} placeholder="Nota..." />
        </div>
      </div>
      {row.producto_credito_id && !row.cuenta_codigo && (
        <div className="text-[11px] text-warning">El producto seleccionado no tiene subcuenta PUC asignada.</div>
      )}
    </div>
  );
}