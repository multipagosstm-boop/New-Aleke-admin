import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wallet, CreditCard, TrendingUp, Pencil, AlertTriangle, ExternalLink, Save } from "lucide-react";
import { Link } from "react-router-dom";
import { formatCOP, formatDate, BANCO_NAMES, TIPO_PRODUCTO } from "@/lib/contabilidad";

const LINEAS_NEGOCIO = [
  { value: "multipagos", label: "Multipagos" },
  { value: "emprendamos", label: "Emprendamos" },
  { value: "pakredito", label: "Pakredito" },
  { value: "alekerooftop", label: "Aleke Rooftop" }
];

export default function ClienteFicha({ open, onOpenChange, cliente, cuentasAhorro, productos, onSaved, onEdit }) {
  const [notas, setNotas] = useState("");
  const [notasDirty, setNotasDirty] = useState(false);
  const [lineas, setLineas] = useState([]);
  const [cdaAsignada, setCdaAsignada] = useState("");
  const [movimientos, setMovimientos] = useState([]);
  const [loadingMovs, setLoadingMovs] = useState(false);
  const [savingNotas, setSavingNotas] = useState(false);
  const [savingLineas, setSavingLineas] = useState(false);

  useEffect(() => {
    if (cliente) {
      setNotas(cliente.notas || "");
      setNotasDirty(false);
      setLineas(cliente.lineas_negocio || []);
      setCdaAsignada(cliente.cda_asignada_id || "");
      setMovimientos([]);
    }
  }, [cliente?.id]);

  useEffect(() => {
    if (open && cliente) {
      setLoadingMovs(true);
      base44.entities.MovimientoContable.filter({ cliente_id: cliente.id }, "-fecha", 5)
        .then((movs) => setMovimientos(movs))
        .catch(() => setMovimientos([]))
        .finally(() => setLoadingMovs(false));
    }
  }, [open, cliente?.id]);

  if (!cliente) return null;

  const cdas = (cuentasAhorro || []).filter((c) => c.titular_id === cliente.id);
  const tdcs = (productos || []).filter((p) => p.titular_id === cliente.id);
  const cupoTotalTdc = tdcs.filter((p) => p.tipo === "TDC").reduce((s, p) => s + (p.cupo || 0), 0);
  const isCastigado = cliente.estado === "castigado";

  const handleCambiarEstado = async () => {
    const nuevoEstado = isCastigado ? "activo" : "castigado";
    if (!isCastigado) {
      const ok = window.confirm(
        `¿Confirmas que este cliente pasa a cartera castigada? No podrá vincularse a líneas de negocio.`
      );
      if (!ok) return;
    }
    try {
      const updateData = { estado: nuevoEstado };
      if (nuevoEstado === "castigado") updateData.lineas_negocio = [];
      await base44.entities.Cliente.update(cliente.id, updateData);
      onSaved();
    } catch (e) {
      alert("Error: " + e.message);
    }
  };

  const guardarNotas = async () => {
    setSavingNotas(true);
    try {
      await base44.entities.Cliente.update(cliente.id, { notas });
      setNotasDirty(false);
      onSaved();
    } catch (e) {
      alert("Error: " + e.message);
    }
    setSavingNotas(false);
  };

  const toggleLinea = (val) => {
    if (isCastigado) return;
    setLineas((prev) => prev.includes(val) ? prev.filter((l) => l !== val) : [...prev, val]);
  };

  const guardarLineas = async () => {
    setSavingLineas(true);
    try {
      await base44.entities.Cliente.update(cliente.id, { lineas_negocio: lineas });
      onSaved();
    } catch (e) {
      alert("Error: " + e.message);
    }
    setSavingLineas(false);
  };

  const guardarCdaAsignada = async (val) => {
    try {
      await base44.entities.Cliente.update(cliente.id, { cda_asignada_id: val || null });
      setCdaAsignada(val);
      onSaved();
    } catch (e) {
      alert("Error: " + e.message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {cliente.nombre}
            <Badge variant={isCastigado ? "destructive" : "default"} className="text-xs">
              {isCastigado ? "Castigado" : "Activo"}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            {cliente.codigo && <span className="font-mono text-primary">{cliente.codigo}</span>}
            {` · ${cliente.tipo === "empresa" ? "Empresa" : "Persona"} · Cédula: ${cliente.cedula || "—"}`}
            {cliente.telefono && ` · Tel: ${cliente.telefono}`}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* COLUMNA IZQUIERDA — Datos personales */}
          <div className="space-y-4">
            <div className="rounded-md border p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Código:</span>
                <span className="font-mono text-primary">{cliente.codigo || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Nombre:</span>
                <span className="font-medium">{cliente.nombre}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tipo:</span>
                <span>{cliente.tipo === "empresa" ? "Empresa" : "Persona"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cédula / NIT:</span>
                <span className="font-mono text-xs">{cliente.cedula || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Teléfono:</span>
                <span>{cliente.telefono || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Correo:</span>
                <span className="text-xs">{cliente.correo || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Dirección:</span>
                <span className="text-xs text-right">{cliente.direccion || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Ocupación:</span>
                <span className="text-xs">{cliente.ocupacion || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Lugar de trabajo:</span>
                <span className="text-xs text-right">{cliente.lugar_trabajo || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Referido por:</span>
                <span className="text-xs">{cliente.referido_por || "—"}</span>
              </div>
            </div>

            {/* Notas */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Notas internas</Label>
              <Textarea
                value={notas}
                onChange={(e) => { setNotas(e.target.value); setNotasDirty(true); }}
                placeholder="Observaciones internas..."
                rows={3}
                className="text-sm"
              />
              {notasDirty && (
                <Button size="sm" variant="outline" onClick={guardarNotas} disabled={savingNotas}>
                  <Save className="w-3 h-3 mr-1" /> {savingNotas ? "Guardando..." : "Guardar notas"}
                </Button>
              )}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={onEdit}>
                <Pencil className="w-3 h-3 mr-1" /> Editar datos
              </Button>
              <Button
                variant={isCastigado ? "default" : "outline"}
                size="sm"
                onClick={handleCambiarEstado}
                className={isCastigado ? "bg-success text-success-foreground hover:bg-success/90" : ""}
              >
                <AlertTriangle className="w-3 h-3 mr-1" />
                {isCastigado ? "Reactivar" : "Castigar"}
              </Button>
            </div>
          </div>

          {/* COLUMNA DERECHA — Productos y actividad */}
          <div className="space-y-4">
            {/* Resumen */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-md border p-2 text-center">
                <Wallet className="w-4 h-4 mx-auto text-muted-foreground mb-0.5" />
                <div className="text-[10px] text-muted-foreground">CDAs</div>
                <div className="text-base font-heading font-bold">{cdas.length}</div>
              </div>
              <div className="rounded-md border p-2 text-center">
                <CreditCard className="w-4 h-4 mx-auto text-muted-foreground mb-0.5" />
                <div className="text-[10px] text-muted-foreground">TDCs</div>
                <div className="text-base font-heading font-bold">{tdcs.filter((p) => p.tipo === "TDC").length}</div>
              </div>
              <div className="rounded-md border p-2 text-center">
                <TrendingUp className="w-4 h-4 mx-auto text-primary mb-0.5" />
                <div className="text-[10px] text-muted-foreground">Cupo Total</div>
                <div className="text-xs font-mono font-bold text-primary">{formatCOP(cupoTotalTdc)}</div>
              </div>
            </div>

            {/* Productos vinculados */}
            <div>
              <h3 className="text-xs font-semibold mb-1.5 uppercase text-muted-foreground">Productos vinculados</h3>
              {cdas.length === 0 && tdcs.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">Sin productos vinculados.</p>
              ) : (
                <div className="space-y-1.5">
                  {cdas.map((c) => (
                    <div key={c.id} className="flex items-center justify-between rounded-md border px-3 py-1.5 text-xs">
                      <div className="flex items-center gap-2">
                        <Wallet className="w-3 h-3 text-muted-foreground" />
                        <span className="font-medium">{c.nombre}</span>
                        <span className="text-muted-foreground">{BANCO_NAMES[c.banco] || c.banco}</span>
                      </div>
                      <span className={`font-mono ${c.saldo < 0 ? "text-destructive" : ""}`}>{formatCOP(c.saldo)}</span>
                    </div>
                  ))}
                  {tdcs.map((p) => (
                    <div key={p.id} className="flex items-center justify-between rounded-md border px-3 py-1.5 text-xs">
                      <div className="flex items-center gap-2">
                        <CreditCard className="w-3 h-3 text-muted-foreground" />
                        <span className="font-medium">{p.nombre}</span>
                        <span className="text-muted-foreground">{TIPO_PRODUCTO[p.tipo] || p.tipo}</span>
                        <span className="text-muted-foreground">{BANCO_NAMES[p.banco] || p.banco}</span>
                      </div>
                      <div className="flex gap-3 font-mono">
                        <span>Saldo: <span className="text-destructive">{formatCOP(Math.abs(p.saldo || 0))}</span></span>
                        <span>Disp: {formatCOP((p.cupo || 0) - Math.abs(p.saldo || 0))}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* CDA asignada para pagos */}
            <div>
              <h3 className="text-xs font-semibold mb-1.5 uppercase text-muted-foreground">CDA asignada para pagos</h3>
              <Select value={cdaAsignada || "none"} onValueChange={(v) => guardarCdaAsignada(v === "none" ? "" : v)}>
                <SelectTrigger className="text-sm"><SelectValue placeholder="Seleccionar CDA..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin asignar</SelectItem>
                  {cdas.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nombre} · {BANCO_NAMES[c.banco] || c.banco}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Líneas de negocio */}
            <div>
              <h3 className="text-xs font-semibold mb-1.5 uppercase text-muted-foreground">Líneas de negocio</h3>
              <div className="space-y-2">
                {LINEAS_NEGOCIO.map((ln) => (
                  <div key={ln.value} className="flex items-center gap-2">
                    <Checkbox
                      id={`ln-${ln.value}`}
                      checked={lineas.includes(ln.value)}
                      onCheckedChange={() => toggleLinea(ln.value)}
                      disabled={isCastigado}
                    />
                    <Label htmlFor={`ln-${ln.value}`} className={`text-sm ${isCastigado ? "text-muted-foreground" : ""}`}>
                      {ln.label}
                    </Label>
                  </div>
                ))}
              </div>
              {!isCastigado && (
                <Button size="sm" variant="outline" className="mt-2" onClick={guardarLineas} disabled={savingLineas}>
                  {savingLineas ? "Actualizando..." : "Actualizar"}
                </Button>
              )}
              {isCastigado && (
                <p className="text-[10px] text-muted-foreground mt-1">Cliente castigado — líneas de negocio deshabilitadas.</p>
              )}
            </div>

            {/* Últimos movimientos */}
            <div>
              <h3 className="text-xs font-semibold mb-1.5 uppercase text-muted-foreground">Últimos movimientos</h3>
              {loadingMovs ? (
                <p className="text-xs text-muted-foreground py-2">Cargando...</p>
              ) : movimientos.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">Sin movimientos registrados.</p>
              ) : (
                <div className="space-y-1">
                  {movimientos.map((m) => (
                    <div key={m.id} className="flex items-center justify-between rounded-md border px-3 py-1.5 text-xs">
                      <div>
                        <span className="font-mono text-muted-foreground">{formatDate(m.fecha)}</span>
                        <span className="ml-2">{m.descripcion || m.cuenta_nombre || "—"}</span>
                      </div>
                      <span className={`font-mono ${m.debito > 0 ? "text-warning" : "text-success"}`}>
                        {m.debito > 0 ? `-${formatCOP(m.debito)}` : `+${formatCOP(m.credito)}`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <Link
                to={`/admin/contabilidad/libro-diario?cliente_id=${cliente.id}`}
                className="text-xs text-primary hover:underline flex items-center gap-1 mt-2"
                onClick={() => onOpenChange(false)}
              >
                <ExternalLink className="w-3 h-3" /> Ver todos en Libro Diario
              </Link>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}