import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { formatCOP, hoyLocal } from "@/lib/contabilidad";
import { construirDatosContrato, generarContratoPDF, determinarTipoContrato } from "@/lib/contratoPdf";

const hoy = hoyLocal();

function addMonths(dateStr, months) {
  const d = new Date(dateStr + "T00:00:00");
  d.setMonth(d.getMonth() + months);
  return d.toISOString().substring(0, 10);
}

const TIPOS_DOC = [
  { value: "CC", label: "CC" }, { value: "CE", label: "CE" }, { value: "PP", label: "PP" }, { value: "TI", label: "TI" }, { value: "NIT", label: "NIT" }
];

export default function ContratoForm({ open, onOpenChange, inmuebles, inquilinos, cdas, inmueblePreselect, onSaved }) {
  const [modoInquilino, setModoInquilino] = useState("nuevo");
  const [form, setForm] = useState({
    inmueble_id: "", inquilino_id: "",
    fecha_inicio: hoy, duracion_meses: 6,
    valor_arriendo: 0, valor_deposito: 0,
    registrar_deposito: false, cda_pago_id: "", fecha_deposito: hoy, notas: ""
  });
  const [nuevoInq, setNuevoInq] = useState({
    nombre_completo: "", tipo_documento: "CC", numero_documento: "",
    lugar_expedicion: "", email: "", telefono: ""
  });
  const [saving, setSaving] = useState(false);
  const [generandoPdf, setGenerandoPdf] = useState(false);
  const [contratoCreado, setContratoCreado] = useState(null);
  const [pdfUrl, setPdfUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      const inm = inmueblePreselect || inmuebles.find((i) => i.estado === "disponible");
      setForm({
        inmueble_id: inm?.id || "",
        inquilino_id: "",
        fecha_inicio: hoy,
        duracion_meses: 6,
        valor_arriendo: inm?.valor_arriendo || 0,
        valor_deposito: (inm?.valor_arriendo || 0) / 2,
        registrar_deposito: false, cda_pago_id: "", fecha_deposito: hoy, notas: ""
      });
      setModoInquilino("nuevo");
      setNuevoInq({ nombre_completo: "", tipo_documento: "CC", numero_documento: "", lugar_expedicion: "", email: "", telefono: "" });
      setContratoCreado(null);
      setPdfUrl("");
      setError("");
    }
  }, [open, inmueblePreselect]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setInq = (k, v) => setNuevoInq((f) => ({ ...f, [k]: v }));

  const handleInmuebleChange = (inmId) => {
    const inm = inmuebles.find((i) => i.id === inmId);
    setForm((f) => ({ ...f, inmueble_id: inmId, valor_arriendo: inm?.valor_arriendo || 0, valor_deposito: (inm?.valor_arriendo || 0) / 2 }));
  };

  const handleValorArriendo = (v) => {
    const val = Number(v) || 0;
    setForm((f) => ({ ...f, valor_arriendo: val, valor_deposito: val / 2 }));
  };

  const disponibles = inmuebles.filter((i) => i.estado === "disponible");
  const cdasActivas = cdas.filter((c) => c.estado === "activa");
  const inmueble = inmuebles.find((i) => i.id === form.inmueble_id);
  const fechaFin = form.fecha_inicio ? addMonths(form.fecha_inicio, Number(form.duracion_meses) || 6) : "";
  const tipoContrato = inmueble
    ? (inmueble.tipo_contrato && inmueble.tipo_contrato !== "GENERICO" ? inmueble.tipo_contrato : determinarTipoContrato(inmueble))
    : "EDIFICIO";

  const canSubmit =
    form.inmueble_id && form.fecha_inicio && form.valor_arriendo > 0 &&
    (modoInquilino === "existente"
      ? !!form.inquilino_id
      : nuevoInq.nombre_completo.trim() && nuevoInq.numero_documento.trim());

  const resolverInquilinoObj = async (id) => {
    const local = inquilinos.find((i) => i.id === id);
    if (local) return local;
    try { return await base44.entities.Inquilino.get(id); } catch { return null; }
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      let inquilino_id = form.inquilino_id;
      if (modoInquilino === "nuevo") {
        const creado = await base44.entities.Inquilino.create({
          ...nuevoInq,
          nombre_completo: nuevoInq.nombre_completo.trim(),
          estado: "activo"
        });
        inquilino_id = creado.id;
      }
      const resp = await base44.functions.invoke("gestionarRooftop", {
        action: "crearContrato",
        inmueble_id: form.inmueble_id,
        inquilino_id,
        fecha_inicio: form.fecha_inicio,
        duracion_meses: Number(form.duracion_meses) || 6,
        tipo_contrato: tipoContrato,
        valor_arriendo: form.valor_arriendo,
        valor_deposito: form.valor_deposito,
        cda_pago_id: form.registrar_deposito ? form.cda_pago_id : null,
        fecha_deposito: form.fecha_deposito,
        notas: form.notas
      });
      if (resp.data?.error) throw new Error(resp.data.error);
      const contrato = resp.data?.contrato;
      setContratoCreado(contrato);

      // Generar PDF
      setGenerandoPdf(true);
      try {
        const inq = await resolverInquilinoObj(inquilino_id);
        const datos = construirDatosContrato({ inmueble, inquilino: inq, contrato });
        const doc = await generarContratoPDF(datos);
        const blob = doc.output("blob");
        const file = new File([blob], `contrato-${contrato.codigo || "ARR"}.pdf`, { type: "application/pdf" });
        const up = await base44.integrations.Core.UploadFile({ file });
        const url = up?.file_url || "";
        await base44.entities.ContratoArriendo.update(contrato.id, { documento_pdf_url: url });
        setPdfUrl(url);
        // Descarga automática en el navegador
        doc.save(`contrato-${contrato.codigo || "ARR"}.pdf`);
      } catch (e) {
        console.error("Error generando PDF:", e);
      }
      setGenerandoPdf(false);

      onSaved();
      onOpenChange(false);
    } catch (e) {
      const msg = e?.response?.data?.error || e?.data?.error || e?.error || e?.message || "No se pudo crear el contrato";
      setError(msg);
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving) onOpenChange(v); }}>
      <DialogContent className="w-[95vw] sm:max-w-lg max-h-[92vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Nuevo Contrato de Arriendo</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
              {error}
            </div>
          )}
          {/* Inmueble */}
          <div>
            <Label>Inmueble *</Label>
            <Select value={form.inmueble_id} onValueChange={handleInmuebleChange}>
              <SelectTrigger><SelectValue placeholder="Seleccionar inmueble disponible..." /></SelectTrigger>
              <SelectContent>
                {disponibles.map((i) => (
                  <SelectItem key={i.id} value={i.id}>{i.nombre} — {formatCOP(i.valor_arriendo)}/mes</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {inmueble && <div className="text-[10px] text-muted-foreground mt-1">Plantilla: {tipoContrato}{inmueble.nombre === "203" ? " · Ingreso a Teresa (220505)" : ""}</div>}
          </div>

          {/* Inquilino */}
          <div className="rounded-md border p-3 space-y-2 bg-muted/20">
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant={modoInquilino === "nuevo" ? "default" : "outline"} onClick={() => setModoInquilino("nuevo")}>Nuevo inquilino</Button>
              <Button type="button" size="sm" variant={modoInquilino === "existente" ? "default" : "outline"} onClick={() => setModoInquilino("existente")}>Inquilino existente</Button>
            </div>
            {modoInquilino === "existente" ? (
              <div>
                <Label>Inquilino *</Label>
                <Select value={form.inquilino_id} onValueChange={(v) => set("inquilino_id", v)}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar inquilino..." /></SelectTrigger>
                  <SelectContent>
                    {inquilinos.filter((i) => i.estado === "activo").map((i) => (
                      <SelectItem key={i.id} value={i.id}>{i.nombre_completo} ({i.numero_documento})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <div>
                  <Label>Nombre completo *</Label>
                  <Input value={nuevoInq.nombre_completo} onChange={(e) => setInq("nombre_completo", e.target.value)} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <Label>Tipo doc.</Label>
                    <Select value={nuevoInq.tipo_documento} onValueChange={(v) => setInq("tipo_documento", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{TIPOS_DOC.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Número documento *</Label>
                    <Input value={nuevoInq.numero_documento} onChange={(e) => setInq("numero_documento", e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label>Lugar de expedición</Label>
                  <Input value={nuevoInq.lugar_expedicion} onChange={(e) => setInq("lugar_expedicion", e.target.value)} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <Label>Correo</Label>
                    <Input type="email" value={nuevoInq.email} onChange={(e) => setInq("email", e.target.value)} />
                  </div>
                  <div>
                    <Label>Teléfono</Label>
                    <Input value={nuevoInq.telefono} onChange={(e) => setInq("telefono", e.target.value)} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Contrato */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Fecha inicio *</Label>
              <Input type="date" value={form.fecha_inicio} onChange={(e) => set("fecha_inicio", e.target.value)} />
            </div>
            <div>
              <Label>Duración (meses) *</Label>
              <NumberInput min="1" value={form.duracion_meses} onChange={(v) => set("duracion_meses", v)} placeholder="6" />
            </div>
          </div>
          <div>
            <Label>Fecha fin (auto)</Label>
            <Input type="date" value={fechaFin} disabled className="bg-muted/30" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Valor arriendo *</Label>
              <NumberInput value={form.valor_arriendo} onChange={(v) => handleValorArriendo(v)} placeholder="0" />
            </div>
            <div>
              <Label>Valor depósito</Label>
              <NumberInput value={form.valor_deposito} onChange={(v) => set("valor_deposito", v)} placeholder="0" />
            </div>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Checkbox id="reg-dep" checked={form.registrar_deposito} onCheckedChange={(v) => set("registrar_deposito", v)} />
            <Label htmlFor="reg-dep" className="text-sm cursor-pointer">Registrar depósito ahora</Label>
          </div>
          {form.registrar_deposito && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-4 sm:pl-6 border-l-2 border-primary/30">
              <div className="col-span-1 sm:col-span-2">
                <Label>CDA de recibo del depósito</Label>
                <Select value={form.cda_pago_id} onValueChange={(v) => set("cda_pago_id", v)}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar CDA..." /></SelectTrigger>
                  <SelectContent>
                    {cdasActivas.map((c) => (<SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-1 sm:col-span-2">
                <Label>Fecha del depósito</Label>
                <Input type="date" value={form.fecha_deposito} onChange={(e) => set("fecha_deposito", e.target.value)} />
              </div>
            </div>
          )}
          <div>
            <Label>Notas</Label>
            <Textarea value={form.notas} onChange={(e) => set("notas", e.target.value)} rows={2} />
          </div>

          {contratoCreado && (
            <div className="rounded-md border border-success/40 bg-success/10 p-3 text-sm space-y-1">
              <div className="font-semibold text-success">Contrato {contratoCreado.codigo} creado</div>
              {pdfUrl
                ? <div className="text-xs">PDF generado y guardado. La descarga inició en el navegador.</div>
                : <div className="text-xs text-warning">Contrato creado, pero el PDF no se pudo generar. Puedes generarlo desde el detalle del contrato.</div>}
            </div>
          )}
        </div>
        <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end w-full sm:w-auto mt-4">
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button className="w-full sm:w-auto" onClick={handleSubmit} disabled={saving || !canSubmit}>
            {saving ? (generandoPdf ? "Generando PDF..." : "Creando...") : "Crear Contrato y Generar PDF"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}