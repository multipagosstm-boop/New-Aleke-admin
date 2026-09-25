import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCOP, formatDate } from "@/lib/contabilidad";
import { construirDatosContrato, generarContratoPDF } from "@/lib/contratoPdf";
import AbonoDepositoDialog from "@/components/rooftop/AbonoDepositoDialog";

const ESTADO_VARIANT = {
  vigente: "default", por_vencer: "secondary", vencido: "destructive",
  renovado: "outline", terminado: "outline", pendiente: "secondary",
  pagado: "default", parcial: "secondary", en_mora: "destructive", condonado: "outline"
};

export default function ContratoDetail({ open, onOpenChange, contrato, inmuebles, clientes, inquilinos, pagos, cdas, onSaved }) {
  const [generando, setGenerando] = useState(false);
  const [abonoOpen, setAbonoOpen] = useState(false);
  const [depositMovs, setDepositMovs] = useState([]);

  const fetchDepositos = async () => {
    if (!contrato?.inquilino_id) { setDepositMovs([]); return; }
    try {
      const movs = await base44.entities.MovimientoContable.filter({
        subcuenta: "220513", cliente_id: contrato.inquilino_id, estado: "activo"
      });
      setDepositMovs(movs.sort((a, b) => (b.fecha || "").localeCompare(a.fecha || "")));
    } catch { setDepositMovs([]); }
  };
  useEffect(() => { if (open) fetchDepositos(); }, [open, contrato]);
  if (!contrato) return null;
  const inmueble = inmuebles.find((i) => i.id === contrato.inmueble_id);
  const inq = inquilinos?.find((i) => i.id === contrato.inquilino_id);
  const cli = clientes.find((c) => c.id === contrato.inquilino_id);
  const inquilino = inq || cli;
  const pagosContrato = pagos
    .filter((p) => p.contrato_id === contrato.id)
    .sort((a, b) => (b.periodo || "").localeCompare(a.periodo || ""));

  const inquilinoNombre = inq?.nombre_completo || cli?.nombre || "—";

  const handleGenerarPdf = async () => {
    setGenerando(true);
    try {
      let inqObj = inq;
      if (!inqObj && contrato.inquilino_id) {
        try { inqObj = await base44.entities.Inquilino.get(contrato.inquilino_id); } catch { inqObj = cli; }
      }
      const datos = construirDatosContrato({ inmueble, inquilino: inqObj || cli, contrato });
      const doc = await generarContratoPDF(datos);
      const blob = doc.output("blob");
      const file = new File([blob], `contrato-${contrato.codigo || "ARR"}.pdf`, { type: "application/pdf" });
      const up = await base44.integrations.Core.UploadFile({ file });
      const url = up?.file_url || "";
      await base44.entities.ContratoArriendo.update(contrato.id, { documento_pdf_url: url });
      doc.save(`contrato-${contrato.codigo || "ARR"}.pdf`);
      onOpenChange(false);
    } catch (e) {
      alert("No se pudo generar el PDF: " + (e?.message || "error"));
    }
    setGenerando(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Contrato {contrato.codigo}
            <Badge variant={ESTADO_VARIANT[contrato.estado] || "outline"} className="text-xs">{contrato.estado}</Badge>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-md border p-4 grid grid-cols-2 gap-2 text-sm">
            <div><span className="text-muted-foreground">Inmueble:</span> <span className="font-medium">{inmueble?.nombre || "—"}</span></div>
            <div><span className="text-muted-foreground">Inquilino:</span> <span className="font-medium">{inquilinoNombre}</span></div>
            <div><span className="text-muted-foreground">Inicio:</span> <span className="font-mono">{formatDate(contrato.fecha_inicio)}</span></div>
            <div><span className="text-muted-foreground">Fin:</span> <span className="font-mono">{formatDate(contrato.fecha_fin)}</span></div>
            <div><span className="text-muted-foreground">Duración:</span> <span>{contrato.duracion_meses || 6} meses</span></div>
            <div><span className="text-muted-foreground">Plantilla:</span> <span>{contrato.tipo_contrato || "—"}</span></div>
            <div><span className="text-muted-foreground">Arriendo:</span> <span className="font-bold text-primary">{formatCOP(contrato.valor_arriendo)}</span></div>
            <div><span className="text-muted-foreground">Depósito:</span> <span>{formatCOP(contrato.valor_deposito)}</span></div>
            <div><span className="text-muted-foreground">Depósito pagado:</span>
              <Badge variant={contrato.deposito_pagado ? "default" : "outline"} className="text-xs">{contrato.deposito_pagado ? "Sí" : "No"}</Badge>
            </div>
            {inquilino?.numero_documento && <div><span className="text-muted-foreground">Documento:</span> {(inquilino.tipo_documento || "CC") + " " + inquilino.numero_documento}</div>}
            {inquilino?.telefono && <div><span className="text-muted-foreground">Teléfono:</span> {inquilino.telefono}</div>}
            {inquilino?.email && <div><span className="text-muted-foreground">Email:</span> {inquilino.email}</div>}
            {contrato.notas && <div className="col-span-2"><span className="text-muted-foreground">Notas:</span> {contrato.notas}</div>}
          </div>

          {/* Depósito */}
          <div className="rounded-md border p-3 bg-muted/20 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Depósito en garantía</div>
                <div className="text-xs text-muted-foreground">Valor objetivo: {formatCOP(contrato.valor_deposito)}</div>
              </div>
              {contrato.estado === "vigente" && (
                <Button size="sm" variant="outline" onClick={() => setAbonoOpen(true)}>Abonar al depósito</Button>
              )}
            </div>
            {(() => {
              const totalAbonado = depositMovs.reduce((s, m) => s + (Number(m.credito) || 0), 0);
              const saldo = (contrato.valor_deposito || 0) - totalAbonado;
              return (
                <div className="text-xs space-y-1">
                  <div className="flex justify-between"><span className="text-muted-foreground">Total abonado:</span><span className="font-bold text-primary">{formatCOP(totalAbonado)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Saldo:</span><span className={saldo > 0 ? "text-warning font-medium" : "text-success font-medium"}>{formatCOP(Math.abs(saldo))}{saldo < 0 ? " (a favor)" : ""}</span></div>
                  {depositMovs.length > 0 && (
                    <div className="mt-2 max-h-40 overflow-y-auto border-t pt-2">
                      {depositMovs.map((m) => (
                        <div key={m.id} className="flex justify-between items-center py-0.5 text-xs">
                          <span className="font-mono text-muted-foreground">{formatDate(m.fecha)}</span>
                          <span className="text-muted-foreground truncate mx-2 flex-1">{m.descripcion || "Abono depósito"}</span>
                          <span className="font-mono">{formatCOP(Number(m.credito) || 0)}</span>
                          {m.comprobante_id && <Link to={`/admin/contabilidad/libro-diario?comprobante_id=${m.comprobante_id}`} className="text-primary hover:underline ml-2">Ver</Link>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* PDF */}
          <div className="rounded-md border p-3 flex items-center justify-between bg-muted/20">
            <div>
              <div className="text-sm font-medium">Documento del contrato</div>
              <div className="text-xs text-muted-foreground">
                {contrato.documento_pdf_url ? "PDF generado y guardado" : "Sin PDF generado todavía"}
              </div>
            </div>
            <div className="flex gap-2">
              {contrato.documento_pdf_url && (
                <a href={contrato.documento_pdf_url} target="_blank" rel="noreferrer" download={`contrato-${contrato.codigo || "ARR"}.pdf`}>
                  <Button size="sm" variant="outline">Descargar PDF</Button>
                </a>
              )}
              <Button size="sm" onClick={handleGenerarPdf} disabled={generando}>
                {generando ? "Generando..." : contrato.documento_pdf_url ? "Regenerar PDF" : "Generar PDF"}
              </Button>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold mb-2 uppercase text-muted-foreground">Historial de Pagos</h3>
            {pagosContrato.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">Sin pagos registrados.</p>
            ) : (
              <table className="w-full text-xs">
                <thead className="text-left text-muted-foreground border-b">
                  <tr>
                    <th className="py-1.5 font-medium">Período</th>
                    <th className="py-1.5 font-medium">Vencimiento</th>
                    <th className="py-1.5 font-medium text-right">Esperado</th>
                    <th className="py-1.5 font-medium text-right">Pagado</th>
                    <th className="py-1.5 font-medium text-center">Mora</th>
                    <th className="py-1.5 font-medium text-center">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {pagosContrato.map((p) => (
                    <tr key={p.id} className="border-b border-border/40">
                      <td className="py-1.5 font-mono">{p.periodo}</td>
                      <td className="py-1.5 font-mono">{formatDate(p.fecha_vencimiento)}</td>
                      <td className="py-1.5 text-right font-mono">{formatCOP(p.valor_esperado)}</td>
                      <td className="py-1.5 text-right font-mono">{formatCOP(p.valor_pagado)}</td>
                      <td className="py-1.5 text-center">{p.dias_mora > 0 ? <span className="text-destructive">{p.dias_mora}d</span> : "—"}</td>
                      <td className="py-1.5 text-center"><Badge variant={ESTADO_VARIANT[p.estado] || "outline"} className="text-[10px]">{p.estado}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <AbonoDepositoDialog open={abonoOpen} onOpenChange={setAbonoOpen} contrato={contrato} inmuebles={inmuebles} cdas={cdas || []} onSaved={() => { fetchDepositos(); onSaved?.(); }} />
        </div>
      </DialogContent>
    </Dialog>
  );
}