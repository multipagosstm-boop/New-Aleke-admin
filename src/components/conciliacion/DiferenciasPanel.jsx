import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { CheckCircle2, XCircle, AlertTriangle, Plus, Lock, Zap, RotateCcw, Trash2 } from "lucide-react";
import { formatCOP, formatDate } from "@/lib/contabilidad";
import { base44 } from "@/api/base44Client";
import SearchableSelect from "@/components/ui/searchable-select";
import ModificarSobranteDialog from "@/components/conciliacion/ModificarSobranteDialog";

export default function DiferenciasPanel({
  comparacion,
  cdas,
  onCrearFaltante,
  onAjustarDiferente,
  onMarcarSobrante,
  onModificarSobrante,
  onMarcarLineaBanco,
  onCerrar,
  onAjustarAlPeso,
  diferenciaSaldo = 0,
  bloqueado
}) {
  const [crearModal, setCrearModal] = useState({ open: false, linea: null });
  const [contrapartida, setContrapartida] = useState("");
  const [descAdicional, setDescAdicional] = useState("");
  const [saving, setSaving] = useState(false);
  const [modificarModal, setModificarModal] = useState({ open: false, movimiento: null });
  const [savingMod, setSavingMod] = useState(false);
  const [anularConfirmModal, setAnularConfirmModal] = useState({ open: false, movimiento: null });
  const [eliminarLineaModal, setEliminarLineaModal] = useState({ open: false, linea: null });
  const [cuentas, setCuentas] = useState([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const cs = await base44.entities.Cuenta.list();
        const validas = cs.filter((c) => c.es_transaccional && (c.nivel === "Subcuenta" || c.nivel === "Auxiliar"));
        if (mounted) setCuentas(validas);
      } catch { /* ignore */ }
    })();
    return () => { mounted = false; };
  }, []);

  if (!comparacion) {
    return <div className="text-center py-12 text-muted-foreground text-sm">Ejecuta la comparación automática para ver las diferencias.</div>;
  }

  const { conciliados = [], faltantes = [], sobrantes = [], diferencias = [], ignorados = [] } = comparacion;
  const cdasActivas = cdas.filter((c) => c.estado === "activa");

  const handleCrear = async () => {
    setSaving(true);
    await onCrearFaltante(crearModal.linea.id, contrapartida, descAdicional);
    setSaving(false);
    setCrearModal({ open: false, linea: null });
    setContrapartida(""); setDescAdicional("");
  };

  const handleConfirmarAnulacion = async () => {
    if (!anularConfirmModal.movimiento) return;
    const movId = anularConfirmModal.movimiento.id;
    setAnularConfirmModal({ open: false, movimiento: null });
    await onMarcarSobrante(movId, "anular");
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
        <div className="rounded-md border p-2"><span className="text-success">✓ Conciliados:</span> <span className="font-bold">{conciliados.length}</span></div>
        <div className="rounded-md border p-2"><span className="text-destructive">✗ Faltantes:</span> <span className="font-bold">{faltantes.length}</span></div>
        <div className="rounded-md border p-2"><span className="text-warning">⚠ Sobrantes:</span> <span className="font-bold">{sobrantes.length}</span></div>
        <div className="rounded-md border p-2"><span className="text-warning">💛 Con dif.:</span> <span className="font-bold">{diferencias.length}</span></div>
        <div className="rounded-md border p-2"><span className="text-muted-foreground">👁 Ignorados:</span> <span className="font-bold">{ignorados.length}</span></div>
      </div>

      {conciliados.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-1"><CheckCircle2 className="w-4 h-4 inline mr-1 text-success" /> Conciliados ({conciliados.length})</h3>
          <details className="rounded-md border">
            <summary className="px-3 py-1.5 cursor-pointer text-xs text-muted-foreground">Ver detalle</summary>
            <table className="w-full text-xs">
              <tbody>
                {conciliados.map((c, i) => {
                  const lb = c?.linea_banco || c;
                  return (
                    <tr key={i} className="border-t border-border/40">
                      <td className="px-3 py-1.5">{formatDate(lb?.fecha)}</td>
                      <td className="px-3 py-1.5">{lb?.descripcion}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{formatCOP(lb?.valor)}</td>
                      <td className="px-3 py-1.5"><Badge className="bg-success/15 text-success text-[10px]">✓</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </details>
        </div>
      )}

      {faltantes.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-1"><XCircle className="w-4 h-4 inline mr-1 text-destructive" /> Faltantes en sistema ({faltantes.length})</h3>
          <div className="space-y-1.5">
            {faltantes.map((f, idx) => {
              const l = f?.linea_banco || f;
              if (!l) return null;
              const esDisputa = f.en_disputa || l.estado_conciliacion === "en_disputa";
              return (
                <div key={l.id || idx} className={`rounded-md border p-3 ${esDisputa ? "border-warning/40 bg-warning/5" : "border-destructive/30 bg-destructive/5"}`}>
                  <div className="flex items-start justify-between flex-wrap gap-2">
                    <div className="text-sm">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium">❌ {formatDate(l.fecha)}</span> · {l.tipo || "Gasto"} · {formatCOP(l.valor)}
                        {esDisputa && <Badge className="bg-warning/20 text-warning text-[10px]">En disputa</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground">{l.descripcion}</div>
                      <div className="text-xs text-destructive">Aparece en extracto banco — No está en el sistema</div>
                    </div>
                    <div className="flex gap-1 flex-wrap">
                      <Button size="sm" disabled={bloqueado} onClick={() => {
                        let def = "";
                        if (l.naturaleza === "cargo") {
                          def = l.tipo === "financiero" ? (l.subcuenta_gasto || "510502") : "510502";
                        } else {
                          def = cdasActivas[0]?.subcuenta_puc || "139006";
                        }
                        setCrearModal({ open: true, linea: l });
                        setContrapartida(def);
                        setDescAdicional("");
                      }}>
                        <Plus className="w-3 h-3 mr-1" /> Crear en sistema
                      </Button>
                      <Button
                        size="sm"
                        variant={esDisputa ? "secondary" : "outline"}
                        disabled={bloqueado}
                        onClick={() => onMarcarLineaBanco && onMarcarLineaBanco(l.id, "marcar_en_disputa")}
                      >
                        {esDisputa ? "Quitar disputa" : "En disputa"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={bloqueado}
                        onClick={() => onMarcarLineaBanco && onMarcarLineaBanco(l.id, "ignorar")}
                      >
                        Ignorar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:bg-destructive/10"
                        disabled={bloqueado}
                        onClick={() => setEliminarLineaModal({ open: true, linea: l })}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {sobrantes.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-1"><AlertTriangle className="w-4 h-4 inline mr-1 text-warning" /> Sobrantes en sistema ({sobrantes.length})</h3>
          <div className="space-y-1.5">
            {sobrantes.map((s, idx) => {
              const ms = s?.movimiento_sistema || s;
              if (!ms) return null;
              const esDisputa = s.en_disputa || String(ms.estado || "").toLowerCase().trim() === "en_disputa";
              return (
                <div key={ms.id || idx} className={`rounded-md border p-3 ${esDisputa ? "border-warning/50 bg-warning/10" : "border-warning/30 bg-warning/5"}`}>
                  <div className="flex items-start justify-between flex-wrap gap-2">
                    <div className="text-sm">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium">⚠️ {formatDate(ms.fecha)}</span> · {formatCOP(ms.credito || ms.debito || 0)}
                        {esDisputa && <Badge className="bg-warning/20 text-warning text-[10px]">En disputa</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground">{ms.descripcion}</div>
                      <div className="text-xs text-warning">Está en el sistema — No aparece en extracto banco</div>
                    </div>
                    <div className="flex gap-1 flex-wrap">
                      <Button size="sm" variant="secondary" disabled={bloqueado} onClick={() => setModificarModal({ open: true, movimiento: ms })}>Modificar</Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={bloqueado}
                        onClick={() => setAnularConfirmModal({ open: true, movimiento: ms })}
                      >
                        Anular
                      </Button>
                      <Button
                        size="sm"
                        variant={esDisputa ? "secondary" : "outline"}
                        disabled={bloqueado}
                        onClick={() => onMarcarSobrante(ms.id, "marcar_en_disputa")}
                      >
                        {esDisputa ? "Quitar disputa" : "En disputa"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={bloqueado}
                        onClick={() => onMarcarSobrante(ms.id, "ignorar")}
                      >
                        Ignorar
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {diferencias.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-1"><AlertTriangle className="w-4 h-4 inline mr-1 text-warning" /> Con diferencias de valor ({diferencias.length})</h3>
          <div className="space-y-1.5">
            {diferencias.map((d, i) => {
              const lb = d?.linea_banco || {};
              const ms = d?.movimiento_sistema || {};
              return (
                <div key={i} className="rounded-md border border-warning/30 bg-warning/5 p-3">
                  <div className="flex items-start justify-between flex-wrap gap-2">
                    <div className="text-sm">
                      <div><span className="font-medium">💛 {formatDate(lb.fecha)}</span> · {lb.descripcion}</div>
                      <div className="text-xs space-x-3 mt-1">
                        <span>Banco: <span className="font-mono">{formatCOP(d.valor_banco || lb.valor || 0)}</span></span>
                        <span>Sistema: <span className="font-mono">{formatCOP(d.valor_sistema || ms.credito || ms.debito || 0)}</span></span>
                        <span className={d.diferencia > 0 ? "text-destructive" : "text-success"}>Dif: <span className="font-mono">{formatCOP(d.diferencia)}</span></span>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" disabled={bloqueado} onClick={() => onAjustarDiferente(lb.id, ms.id, "anular_y_recrear")}>Anular y recrear</Button>
                      <Button size="sm" variant="outline" disabled={bloqueado} onClick={() => onAjustarDiferente(lb.id, ms.id, "crear_diferencia")}>Crear ajuste ${formatCOP(Math.abs(d.diferencia))}</Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {ignorados.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-1 text-muted-foreground">👁 Movimientos o líneas ignoradas ({ignorados.length})</h3>
          <details className="rounded-md border p-2 text-xs">
            <summary className="cursor-pointer text-muted-foreground font-medium">Ver elementos ignorados y restaurar</summary>
            <div className="space-y-1.5 mt-2">
              {ignorados.map((it, idx) => {
                const isBanco = it.tipo === "linea_banco";
                const d = it.data || {};
                return (
                  <div key={it.id || idx} className="flex items-center justify-between border-t border-border/40 py-1.5 text-xs">
                    <div>
                      <span className="font-semibold">{isBanco ? "Extracto Banco:" : "Sistema:"}</span> {formatDate(d.fecha)} · {d.descripcion} · <span className="font-mono">{formatCOP(d.valor || d.credito || d.debito || 0)}</span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-[11px] px-2"
                      disabled={bloqueado}
                      onClick={() => {
                        if (isBanco) {
                          onMarcarLineaBanco && onMarcarLineaBanco(d.id, "ignorar");
                        } else {
                          onMarcarSobrante && onMarcarSobrante(d.id, "ignorar");
                        }
                      }}
                    >
                      <RotateCcw className="w-3 h-3 mr-1" /> Restaurar
                    </Button>
                  </div>
                );
              })}
            </div>
          </details>
        </div>
      )}

      <div className="flex justify-between items-center pt-2 flex-wrap gap-2">
        <div>
          {!bloqueado && Math.abs(diferenciaSaldo) >= 0.01 && onAjustarAlPeso && (
            <Button size="sm" variant="outline" onClick={onAjustarAlPeso}>
              <Zap className="w-4 h-4 mr-1 text-primary" /> Ajustar al peso ({formatCOP(diferenciaSaldo)})
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          {bloqueado ? (
            <Button disabled className="bg-success/20 text-success"><Lock className="w-4 h-4 mr-1" /> Cerrada (irreversible)</Button>
          ) : (
            <Button onClick={onCerrar}><CheckCircle2 className="w-4 h-4 mr-1" /> Cerrar conciliación</Button>
          )}
        </div>
      </div>

      <Dialog open={crearModal.open} onOpenChange={(v) => setCrearModal({ open: v, linea: v ? crearModal.linea : null })}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Crear movimiento en sistema</DialogTitle></DialogHeader>
          {crearModal.linea && (
            <div className="space-y-3">
              <div className="rounded-md border p-3 space-y-1 text-sm bg-muted/20">
                <div><span className="text-muted-foreground">Fecha:</span> {formatDate(crearModal.linea.fecha)}</div>
                <div><span className="text-muted-foreground">Descripción:</span> {crearModal.linea.descripcion}</div>
                <div><span className="text-muted-foreground">Tipo:</span> {crearModal.linea.tipo}</div>
                <div><span className="text-muted-foreground">Naturaleza:</span> {crearModal.linea.naturaleza}</div>
                <div><span className="text-muted-foreground">Valor:</span> <span className="font-bold text-primary">{formatCOP(crearModal.linea.valor)}</span></div>
              </div>
              <div>
                <Label>Cuenta contrapartida *</Label>
                <p className="text-xs text-muted-foreground mb-1">Asigna el movimiento a la cuenta que requieras: efectivo, CDA, gasto, ingreso o pendiente (139006).</p>
                <SearchableSelect
                  value={contrapartida}
                  onValueChange={setContrapartida}
                  placeholder="Selecciona la cuenta contrapartida…"
                  searchPlaceholder="Buscar por código o nombre…"
                  options={cuentas.map((c) => {
                    const cda = cdasActivas.find((d) => d.subcuenta_puc === String(c.codigo));
                    const label = cda ? `CDA · ${cda.nombre} · ${c.codigo} — ${c.concepto}` : `${c.codigo} — ${c.concepto}`;
                    return { value: String(c.codigo), label, searchKey: `${c.codigo} ${c.concepto}${cda ? " " + cda.nombre : ""}` };
                  })}
                />
              </div>
              <div>
                <Label>Descripción adicional</Label>
                <Textarea value={descAdicional} onChange={(e) => setDescAdicional(e.target.value)} rows={2} placeholder="Notas sobre el ajuste..." />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCrearModal({ open: false, linea: null })}>Cancelar</Button>
            <Button onClick={handleCrear} disabled={saving || !contrapartida}>
              {saving ? "Creando..." : "Crear movimiento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={anularConfirmModal.open} onOpenChange={(v) => setAnularConfirmModal({ open: v, movimiento: v ? anularConfirmModal.movimiento : null })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>¿Anular movimiento y comprobante?</DialogTitle>
          </DialogHeader>
          {anularConfirmModal.movimiento && (
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                Estás a punto de anular el siguiente movimiento en el sistema contable:
              </p>
              <div className="rounded-md border p-3 bg-muted/20 text-foreground font-mono text-xs space-y-1">
                <div><strong>Fecha:</strong> {formatDate(anularConfirmModal.movimiento.fecha)}</div>
                <div><strong>Descripción:</strong> {anularConfirmModal.movimiento.descripcion}</div>
                <div><strong>Valor:</strong> {formatCOP(anularConfirmModal.movimiento.credito || anularConfirmModal.movimiento.debito || 0)}</div>
              </div>
              <p className="text-xs text-destructive">
                Esta acción anulará el comprobante contable asociado en el Libro Diario y el movimiento dejará de afectar el saldo de la tarjeta.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAnularConfirmModal({ open: false, movimiento: null })}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleConfirmarAnulacion}>
              Sí, anular definitivamente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={eliminarLineaModal.open} onOpenChange={(v) => setEliminarLineaModal({ open: v, linea: v ? eliminarLineaModal.linea : null })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-5 h-5" /> Eliminar línea del extracto
            </DialogTitle>
          </DialogHeader>
          {eliminarLineaModal.linea && (
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>¿Estás seguro de eliminar esta línea del extracto bancario?</p>
              <div className="rounded-md border p-3 bg-muted/20 text-foreground font-mono text-xs space-y-1">
                <div><strong>Fecha:</strong> {formatDate(eliminarLineaModal.linea.fecha)}</div>
                <div><strong>Descripción:</strong> {eliminarLineaModal.linea.descripcion}</div>
                <div><strong>Valor:</strong> {formatCOP(eliminarLineaModal.linea.valor)}</div>
              </div>
              <p className="text-xs text-destructive">Esta acción no se puede deshacer.</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEliminarLineaModal({ open: false, linea: null })}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (eliminarLineaModal.linea) {
                  onMarcarLineaBanco && onMarcarLineaBanco(eliminarLineaModal.linea.id, "anular");
                }
                setEliminarLineaModal({ open: false, linea: null });
              }}
            >
              Sí, eliminar línea
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ModificarSobranteDialog
        open={modificarModal.open}
        onOpenChange={(v) => setModificarModal({ open: v, movimiento: v ? modificarModal.movimiento : null })}
        movimiento={modificarModal.movimiento}
        saving={savingMod}
        onConfirm={async (data) => {
          setSavingMod(true);
          try {
            await onModificarSobrante(data);
            setModificarModal({ open: false, movimiento: null });
          } finally {
            setSavingMod(false);
          }
        }}
      />
    </div>
  );
}