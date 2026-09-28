import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Upload, FileText, Loader2, CheckCircle2, AlertCircle, FileUp, Plus, RefreshCw } from "lucide-react";
import { formatCOP, formatDate, BANCO_NAMES } from "@/lib/contabilidad";
import SearchableSelect from "@/components/ui/searchable-select";
import TarjetaForm from "@/components/admin/TarjetaForm";
import ReemplazoTarjetaDialog from "@/components/admin/ReemplazoTarjetaDialog";

const LAST_PERIODO_KEY = "aleke_last_periodo_extracto";
const getLastPeriodo = () => { try { return localStorage.getItem(LAST_PERIODO_KEY) || ""; } catch { return ""; } };
const saveLastPeriodo = (p) => { try { if (p) localStorage.setItem(LAST_PERIODO_KEY, p); } catch {} };

const TIPO_LABEL = {
  compra: "Compra", abono: "Abono", avance: "Avance", financiero: "Financiero", ajuste: "Ajuste",
  intereses: "Intereses", seguros: "Seguros", comisiones: "Comisiones", otros: "Otros"
};
const NATURALEZA_BADGE = {
  cargo: "bg-destructive/15 text-destructive",
  abono: "bg-success/15 text-success"
};

const CARGOS_KEYS = [
  { key: "cuota_manejo", label: "Cuota manejo", defaultSub: "510504" },
  { key: "seguros", label: "Seguros", defaultSub: "510505" },
  { key: "intereses_corrientes", label: "Int. corrientes", defaultSub: "510502" },
  { key: "intereses_mora", label: "Int. mora", defaultSub: "510502" },
  { key: "comisiones", label: "Comisiones", defaultSub: "510506" },
  { key: "otros_gastos", label: "Otros gastos", defaultSub: "510507" }
];

export default function PdfUploadDialog({ open, onOpenChange, onConfirmado, productos }) {
  const [step, setStep] = useState("upload"); // upload | extracting | preview | confirming | done
  const [file, setFile] = useState(null);
  const [fileUrl, setFileUrl] = useState("");
  const [extracted, setExtracted] = useState(null);
  const [productoSel, setProductoSel] = useState("");
  const [error, setError] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [cargosDestino, setCargosDestino] = useState({});
  const [cuentasTransaccionales, setCuentasTransaccionales] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [periodoSel, setPeriodoSel] = useState("");
  const [extractoExistente, setExtractoExistente] = useState(null);
  const [productosLocales, setProductosLocales] = useState(productos);
  const [showTarjetaForm, setShowTarjetaForm] = useState(false);
  const [showReemplazo, setShowReemplazo] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { setProductosLocales(productos); }, [productos]);

  const refreshProductos = async () => {
    const prods = await base44.entities.ProductoCredito.list();
    const activos = prods.filter((p) => p.estado === "activo");
    setProductosLocales(activos);
    return activos;
  };

  const handleTarjetaCreada = async () => {
    setShowTarjetaForm(false);
    const prods = await refreshProductos();
    // Seleccionar automáticamente el producto recién creado que coincide con el PDF
    const match = prods.find((p) => coincideProducto(p));
    if (match) setProductoSel(match.id);
  };

  const bancoInicial = extracted?.banco_detectado?.code || "";
  const esCredito = !!extracted?.es_credito;
  const tipoProducto = extracted?.tipo_producto || "TDC";

  // Productos a mostrar: para créditos solo CH/LIB/CR, para TDC todos los activos
  const productosFiltrados = (productosLocales || []).filter((p) =>
    esCredito ? ["CH", "LIB", "CR"].includes(p.tipo) : true
  );

  // Coincidencia del producto: por número de tarjeta/nombre de cuenta o últimos 4 (TDC) o número de obligación (crédito)
  const coincideProducto = (p) => {
    if (!p) return false;
    if (esCredito) {
      const obl = String(extracted?.numero_obligacion || "").replace(/\D/g, "");
      if (obl.length < 4) return false;
      const pc = String(p.numero_completo || "").replace(/\D/g, "");
      const ci = String(p.codigo_interno || "").replace(/\D/g, "");
      return (pc && pc === obl) || (ci && ci === obl) ||
             (pc && (pc.endsWith(obl) || obl.endsWith(pc))) ||
             (ci && (ci.endsWith(obl) || obl.endsWith(ci)));
    }
    const last4 = extracted?.last4;
    if (!last4) return false;
    const regex = new RegExp(`(?:^|\\D)${last4}(?:\\D|$)`);
    const numRaw = String(extracted?.tarjeta || "").replace(/\D/g, "");

    // 1. Coincidencia por número completo si está registrado
    if (numRaw.length >= 8 && p.numero_completo) {
      const pnc = String(p.numero_completo).replace(/\D/g, "");
      if (pnc && (pnc === numRaw || numRaw.endsWith(pnc) || pnc.endsWith(numRaw))) return true;
    }

    // 2. Coincidencia con nombre de cuenta/tarjeta (ej: "TDC - 5513", "TDC-5513", "TDC 5513")
    if (regex.test(p.nombre || "")) return true;

    // 3. Coincidencia con nomenclatura
    if (regex.test(p.nomenclatura || "") || String(p.nomenclatura || "").replace(/\D/g, "").endsWith(last4)) return true;

    // 4. Coincidencia con terminación de numero_completo o codigo_interno
    if (p.numero_completo && String(p.numero_completo).replace(/\D/g, "").endsWith(last4)) return true;
    if (p.codigo_interno && regex.test(p.codigo_interno)) return true;

    return false;
  };

  useEffect(() => {
    if (!open || !productoSel || !periodoSel) { setExtractoExistente(null); return; }
    let active = true;
    base44.entities.ExtractoProducto.filter({ producto_id: productoSel, periodo: periodoSel })
      .then((r) => { if (active) setExtractoExistente(r.length > 0); })
      .catch(() => { if (active) setExtractoExistente(null); });
    return () => { active = false; };
  }, [open, productoSel, periodoSel]);

  const reset = () => {
    setStep("upload"); setFile(null); setFileUrl("");
    setExtracted(null); setProductoSel(""); setError("");
    setObservaciones(""); setCargosDestino({}); setPeriodoSel("");
    setShowTarjetaForm(false);
  };

  const handleReemplazoDone = async () => {
    setShowReemplazo(false);
    const prods = await refreshProductos();
    const match = prods.find((p) => coincideProducto(p));
    if (match) setProductoSel(match.id);
  };

  const handleClose = (v) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
      setError("El archivo debe ser un PDF");
      return;
    }
    setError("");
    setFile(f);
    setStep("upload");
  };

  const handleProcesar = async () => {
    if (!file) return;
    setStep("extracting");
    setError("");
    try {
      // 1. Subir el PDF
      const uploadRes = await base44.integrations.Core.UploadFile({ file });
      const url = uploadRes.file_url;
      setFileUrl(url);

      // Convertir el archivo a base64 para análisis directo con IA multimodal
      let fileBase64 = "";
      try {
        fileBase64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const res = String(reader.result || "");
            const base64 = res.includes(",") ? res.split(",")[1] : res;
            resolve(base64);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      } catch (convErr) {
        console.warn("No se pudo convertir a base64:", convErr);
      }

      // 2. Extraer datos con la función backend
      const resp = await base44.functions.invoke("procesarExtractoPDF", {
        action: "extraer",
        file_url: url,
        file_base64: fileBase64,
        file_name: file.name
      });
      if (resp.data?.error) throw new Error(resp.data.error);

      setExtracted(resp.data);
      setProductoSel(resp.data.producto_match?.id || "");
      const lastPeriodo = getLastPeriodo();
      setPeriodoSel(lastPeriodo || resp.data.periodo || "");
      const cuentas = await base44.entities.Cuenta.filter({ es_transaccional: true }, undefined, 500);
      setCuentasTransaccionales(cuentas);
      const cli = await base44.entities.Cliente.list();
      setClientes(cli);
      const initDestino = {};
      CARGOS_KEYS.forEach(({ key, defaultSub }) => {
        if (resp.data.cargos_categorizados?.[key]) initDestino[key] = { destino: "gasto", subcuenta: defaultSub };
      });
      setCargosDestino(initDestino);
      setStep("preview");
    } catch (e) {
      let msg = e.message || String(e || '');
      try {
        const parsed = JSON.parse(msg);
        if (parsed?.error) {
          if (parsed.error.code === 503 || parsed.error.status === 'UNAVAILABLE' || String(parsed.error.message).includes('high demand')) {
            msg = 'Los servidores de Google Gemini están experimentando alta demanda momentánea (Error 503 temporal). Por favor espera unos segundos y presiona "Procesar extracto" nuevamente.';
          } else if (parsed.error.code === 429) {
            msg = 'Límite de peticiones de Google Gemini alcanzado temporalmente (Error 429). Espera un minuto antes de reintentar.';
          } else if (parsed.error.message) {
            msg = parsed.error.message;
          }
        }
      } catch {
        // no es JSON
      }
      setError(msg);
      setStep("upload");
    }
  };

  const handleConfirmar = async () => {
    if (!productoSel) { setError("Selecciona un producto"); return; }
    if (!periodoSel) { setError("Define el período del extracto (campo editable arriba)"); return; }
    setStep("confirming");
    setError("");
    try {
      const resp = await base44.functions.invoke("procesarExtractoPDF", {
        action: "confirmar",
        producto_id: productoSel,
        periodo: periodoSel || extracted.periodo,
        fecha_corte: extracted.fecha_corte,
        fecha_corte_anterior: extracted.fecha_corte_anterior,
        fecha_pago: extracted.fecha_pago,
        saldo_a_pagar: extracted.saldo_a_pagar,
        saldo_anterior: extracted.saldo_anterior,
        lineas: extracted.lineas,
        cargos_categorizados: extracted.cargos_categorizados,
        observaciones,
        cargos_destino: cargosDestino
      });
      if (resp.data?.error) throw new Error(resp.data.error);
      saveLastPeriodo(periodoSel || extracted.periodo || "");
      setStep("done");
      if (onConfirmado) setTimeout(() => { onConfirmado(resp.data); handleClose(false); }, 1200);
    } catch (e) {
      const serverMsg = e?.response?.data?.error || e?.data?.error || e.message;
      setError(serverMsg);
      setStep("preview");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileUp className="w-5 h-5" /> Cargar extracto desde PDF
          </DialogTitle>
        </DialogHeader>

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Step: Upload */}
        {step === "upload" && (
          <div className="space-y-4">
            <div
              className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => inputRef.current?.click()}
            >
              <input ref={inputRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={handleFile} />
              <Upload className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
              {file ? (
                <div className="flex items-center justify-center gap-2 text-sm">
                  <FileText className="w-4 h-4 text-primary" />
                  <span className="font-medium">{file.name}</span>
                  <span className="text-muted-foreground">({(file.size / 1024).toFixed(0)} KB)</span>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Haz clic para seleccionar un PDF de extracto bancario</p>
              )}
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Bancos soportados: Bancolombia, BBVA, Bogotá, Occidente, Popular, Davivienda, Colpatria, Itaú, Falabella, Tuya, Serfinanza
            </p>
          </div>
        )}

        {/* Step: Extracting */}
        {step === "extracting" && (
          <div className="flex flex-col items-center py-12 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Analizando extracto con IA…</p>
            <p className="text-xs text-muted-foreground">Esto puede tardar 15-30 segundos</p>
          </div>
        )}

        {/* Step: Preview */}
        {step === "preview" && extracted && (
          <div className="space-y-4">
            {/* Banner superior de extracto duplicado */}
            {extractoExistente && (
              <div className="flex items-start gap-2 rounded-md border-2 border-destructive bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
                <span>
                  <span className="font-bold">Extracto duplicado.</span> Ya existe un extracto para el período{" "}
                  <span className="font-mono font-bold">{periodoSel}</span> de este producto. Cambia el período o elimina el extracto existente; no se puede crear dos veces.
                </span>
              </div>
            )}
            {/* Header data */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
              <div>
                <Label className="text-xs text-muted-foreground">Banco detectado</Label>
                <div className="font-medium">{extracted.banco_detectado?.name}</div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">{esCredito ? "Número de obligación" : "Tarjeta"}</Label>
                <div className="font-mono">{esCredito ? (extracted.numero_obligacion || "—") : extracted.tarjeta}</div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Titular</Label>
                <div className="truncate">{extracted.titular}</div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Período del extracto (editable)</Label>
                <input
                  type="month"
                  value={periodoSel}
                  onChange={(e) => setPeriodoSel(e.target.value)}
                  className={`font-mono w-full rounded-md border bg-transparent px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring ${!periodoSel ? "border-warning/60 bg-warning/5" : "border-input"}`}
                />
                {periodoSel !== extracted.periodo && (
                  <span className="text-[10px] text-muted-foreground">detectado: {extracted.periodo}</span>
                )}
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Fecha corte</Label>
                <div className="font-mono">{formatDate(extracted.fecha_corte)}</div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Fecha pago</Label>
                <div className="font-mono">{formatDate(extracted.fecha_pago) || "—"}</div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">{esCredito ? "Saldo a pagar / Cuota" : "Saldo a pagar"}</Label>
                <div className="font-bold text-primary">{formatCOP(extracted.saldo_a_pagar)}</div>
              </div>
              {esCredito && (
                <>
                  <div>
                    <Label className="text-xs text-muted-foreground">Saldo capital</Label>
                    <div className="font-mono">{formatCOP(extracted.saldo_capital)}</div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Valor cuota</Label>
                    <div className="font-mono">{formatCOP(extracted.valor_cuota)}</div>
                  </div>
                </>
              )}
              <div>
                <Label className="text-xs text-muted-foreground">Total cargos</Label>
                <div className="font-mono">{formatCOP(extracted.total_cargos)}</div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Total abonos</Label>
                <div className="font-mono">{formatCOP(extracted.total_abonos)}</div>
              </div>
            </div>

            {/* Alerta de extracto duplicado */}
            {extractoExistente && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>
                  Ya existe un extracto para el período <span className="font-mono font-bold">{periodoSel}</span> de este producto.
                  No se pueden crear dos extractos del mismo período para el mismo producto. Cambia el período o elimina el extracto existente.
                </span>
              </div>
            )}

            {/* Product selection */}
            <div className="space-y-2 rounded-md border border-border p-3 bg-muted/20">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">{esCredito ? "Crédito / Producto a asignar" : "Tarjeta / Producto a asignar"}</Label>
                {(esCredito ? extracted.numero_obligacion : (extracted.tarjeta || extracted.last4)) && (
                  <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
                    PDF detectó: {esCredito ? extracted.numero_obligacion : (extracted.tarjeta && extracted.tarjeta.length > 4 ? extracted.tarjeta : `****${extracted.last4}`)}
                  </span>
                )}
              </div>

              {/* Confirmación visual de match automático con la cuenta */}
              {extracted.producto_match && productoSel === extracted.producto_match.id && (
                <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded p-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span>
                    Vinculado automáticamente a la cuenta: <strong>{extracted.producto_match.nombre}</strong> {extracted.producto_match.match_reason ? `(${extracted.producto_match.match_reason})` : `(coincidencia ${extracted.last4})`}
                  </span>
                </div>
              )}

              {/* Alerta si no hubo match automático */}
              {!extracted.producto_match && (
                <div className="flex items-start gap-2 text-xs text-warning bg-warning/10 border border-warning/20 rounded p-2">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>
                    {esCredito
                      ? <>No se encontró un crédito con obligación <span className="font-mono font-bold">{extracted.numero_obligacion || "?"}</span> en el sistema. Selecciona manualmente el producto correcto.</>
                      : <>No se encontró una tarjeta o cuenta con terminación <span className="font-mono font-bold">****{extracted.last4 || "?"}</span> en el sistema. Selecciona manualmente el producto correcto o créala con "+ Crear".</>}
                  </span>
                </div>
              )}

              {/* Alerta si el producto seleccionado NO coincide con el dato del PDF */}
              {productoSel && (() => {
                const prod = productosFiltrados.find((p) => p.id === productoSel);
                return !coincideProducto(prod);
              })() && (
                <div className="flex items-start gap-2 text-xs text-warning bg-warning/10 border border-warning/20 rounded p-2">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>
                    {esCredito
                      ? <>El producto seleccionado no coincide con la obligación del PDF. Verifica que sea el correcto.</>
                      : <>El producto seleccionado no coincide con la tarjeta <span className="font-mono font-bold">{extracted.tarjeta || `****${extracted.last4}`}</span> detectada en el PDF. Verifica que sea el correcto.</>}
                  </span>
                </div>
              )}

              <div className="flex gap-2">
                <div className="flex-1">
                  <SearchableSelect
                    value={productoSel}
                    onValueChange={setProductoSel}
                    placeholder="Selecciona el producto…"
                    searchPlaceholder={esCredito ? "Buscar por nombre, banco u obligación…" : "Buscar por nombre, banco o últimos 4…"}
                    triggerClassName={!productoSel ? "border-warning/50" : ""}
                    options={productosFiltrados.map((p) => {
                    const isMatch = coincideProducto(p);
                    return {
                      value: p.id,
                      label: `${isMatch ? "✓ coincide · " : ""}${p.nombre} · ${BANCO_NAMES[p.banco] || p.banco}${p.nomenclatura ? ` (${p.nomenclatura})` : ""}`,
                      searchKey: `${p.nombre} ${BANCO_NAMES[p.banco] || p.banco} ${p.nomenclatura || ""} ${p.numero_completo || ""} ${String(p.nomenclatura || "").replace(/\D/g, "").slice(-4)}`
                    };
                  })}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowTarjetaForm(true)}
                  title={esCredito ? "Crear un crédito nuevo y vincularlo" : "Crear una tarjeta nueva y vincularla"}
                >
                  <Plus className="w-4 h-4 mr-1" /> Crear
                </Button>
                {!esCredito && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowReemplazo(true)}
                    disabled={!productoSel}
                    title="Reemplazar o renovar el plástico seleccionado (conserva saldo e historial)"
                  >
                    <RefreshCw className="w-4 h-4 mr-1" /> Reemplazar
                  </Button>
                )}
              </div>
            </div>

            {/* Observaciones / Notas del extracto */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Observaciones / Notas del extracto</Label>
              <Textarea
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                rows={2}
                placeholder="Notas internas para seguimiento (aparecen en el informe de gastos financieros)…"
              />
            </div>

            {/* Cargos financieros — destino de cada cargo (solo TDC; los créditos no se contabilizan en esta fase) */}
            {!esCredito && extracted.cargos_categorizados && (
              <div className="rounded-md border p-3 space-y-2">
                <Label className="text-xs text-muted-foreground">Cargos financieros — destino de cada cargo</Label>
                <div className="space-y-2">
                  {CARGOS_KEYS.map(({ key, label, defaultSub }) => {
                    const val = extracted.cargos_categorizados[key] || 0;
                    const fecha = extracted.cargos_categorizados[key + "_fecha"];
                    if (!val) return null;
                    const decision = cargosDestino[key] || { destino: "gasto", subcuenta: defaultSub };
                    return (
                      <div key={key} className="rounded bg-muted/40 px-3 py-2 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <span className="text-sm font-medium">{label}</span>
                            <span className="text-xs font-mono ml-2">{formatCOP(val)}</span>
                            {fecha && <span className="text-[10px] text-muted-foreground ml-2">{formatDate(fecha)}</span>}
                          </div>
                          <Select
                            value={decision.destino}
                            onValueChange={(v) => setCargosDestino((d) => {
                              const prev = d[key] || {};
                              return { ...d, [key]: { destino: v, subcuenta: v === "otra_cuenta" ? "" : defaultSub, cliente_id: v === "otra_cuenta" ? (prev.cliente_id || "") : "" } };
                            })}
                          >
                            <SelectTrigger className="w-48 h-7 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="gasto">Llevar a gasto ({defaultSub})</SelectItem>
                              <SelectItem value="otra_cuenta">Asignar a otra cuenta</SelectItem>
                              <SelectItem value="no_registrar">No registrar</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {decision.destino === "otra_cuenta" && (
                          <div className="pl-2 border-l-2 border-primary/30 space-y-2">
                            <SearchableSelect
                              value={decision.subcuenta}
                              onValueChange={(v) => setCargosDestino((d) => ({ ...d, [key]: { destino: "otra_cuenta", subcuenta: v, cliente_id: decision.cliente_id || "" } }))}
                              placeholder="Selecciona la cuenta para cruzar…"
                              searchPlaceholder="Buscar por código o concepto…"
                              options={cuentasTransaccionales.map((c) => ({
                                value: String(c.codigo),
                                label: `${c.codigo} — ${c.concepto}`,
                                searchKey: `${c.codigo} ${c.concepto}`
                              }))}
                            />
                            <SearchableSelect
                              value={decision.cliente_id || ""}
                              onValueChange={(v) => setCargosDestino((d) => ({ ...d, [key]: { destino: "otra_cuenta", subcuenta: decision.subcuenta || "", cliente_id: v } }))}
                              placeholder="Tercero / cliente (opcional)…"
                              searchPlaceholder="Buscar cliente…"
                              options={[
                                { value: "", label: "Sin tercero (opcional)", searchKey: "sin tercero" },
                                ...clientes.map((c) => ({
                                  value: c.id,
                                  label: `${c.nombre}${c.codigo ? ` (${c.codigo})` : ""}`,
                                  searchKey: `${c.nombre} ${c.codigo || ""} ${c.cedula || ""}`
                                }))
                              ]}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {(extracted.cargos_categorizados.rendimientos > 0 || extracted.cargos_categorizados.cashback > 0) && (
                    <div className="flex gap-4 text-xs text-muted-foreground pt-1">
                      {extracted.cargos_categorizados.rendimientos > 0 && (
                        <span>Rendimientos: <span className="font-mono">{formatCOP(extracted.cargos_categorizados.rendimientos)}</span></span>
                      )}
                      {extracted.cargos_categorizados.cashback > 0 && (
                        <span>Cashback: <span className="font-mono">{formatCOP(extracted.cargos_categorizados.cashback)}</span></span>
                      )}
                    </div>
                  )}
                  {CARGOS_KEYS.every(({ key }) => !extracted.cargos_categorizados[key]) && (
                    <p className="text-muted-foreground">Sin cargos financieros detectados</p>
                  )}
                </div>
              </div>
            )}

            {/* Movements preview */}
            <div>
              <Label className="text-xs text-muted-foreground">
                Movimientos extraídos ({extracted.lineas?.length || 0})
              </Label>
              <div className="max-h-[280px] overflow-y-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead className="border-b text-left text-muted-foreground sticky top-0 bg-card">
                    <tr>
                      <th className="px-2 py-1.5 font-medium">Fecha</th>
                      <th className="px-2 py-1.5 font-medium">Descripción</th>
                      <th className="px-2 py-1.5 font-medium">Tipo</th>
                      <th className="px-2 py-1.5 font-medium">Subcuenta</th>
                      <th className="px-2 py-1.5 font-medium text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(extracted.lineas || []).map((l, i) => (
                      <tr key={i} className="border-b border-border/40">
                        <td className="px-2 py-1 font-mono">{formatDate(l.fecha)}</td>
                        <td className="px-2 py-1 truncate max-w-[200px]">{l.descripcion}</td>
                        <td className="px-2 py-1">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${NATURALEZA_BADGE[l.naturaleza]}`}>
                            {TIPO_LABEL[l.tipo] || l.tipo}
                          </span>
                        </td>
                        <td className="px-2 py-1 font-mono text-[10px] text-primary">
                          {l.subcuenta_gasto || (l.tipo === "financiero" ? "510502" : "—")}
                        </td>
                        <td className="px-2 py-1 text-right font-mono">{formatCOP(l.valor)}</td>
                      </tr>
                    ))}
                    {(!extracted.lineas || extracted.lineas.length === 0) && (
                      <tr><td colSpan={5} className="text-center py-4 text-muted-foreground">Sin movimientos</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Step: Confirming */}
        {step === "confirming" && (
          <div className="flex flex-col items-center py-12 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Creando extracto y líneas…</p>
          </div>
        )}

        {/* Step: Done */}
        {step === "done" && (
          <div className="flex flex-col items-center py-12 gap-3">
            <CheckCircle2 className="w-12 h-12 text-success" />
            <p className="text-sm font-medium">¡Extracto cargado correctamente!</p>
          </div>
        )}

        <DialogFooter>
          {step === "upload" && (
            <Button onClick={handleProcesar} disabled={!file}>
              <Upload className="w-4 h-4 mr-1" /> Procesar PDF
            </Button>
          )}
          {step === "preview" && (
            <Button onClick={handleConfirmar} disabled={!productoSel || !periodoSel || extractoExistente}>
              <CheckCircle2 className="w-4 h-4 mr-1" /> Confirmar y crear extracto
            </Button>
          )}
          <Button variant="outline" onClick={() => handleClose(false)}>
            {step === "done" ? "Cerrar" : "Cancelar"}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Formulario anidado para crear una tarjeta nueva desde el extracto */}
      <TarjetaForm
        open={showTarjetaForm}
        onOpenChange={setShowTarjetaForm}
        onSaved={handleTarjetaCreada}
        clientes={clientes}
        pucTransaccional={cuentasTransaccionales}
        productosExistentes={productosLocales}
        initialBanco={bancoInicial}
        initialDigitos={esCredito ? String(extracted?.numero_obligacion || "").slice(-4) : (extracted?.last4 || "")}
        initialTipo={esCredito ? tipoProducto : "TDC"}
      />

      {/* Diálogo anidado para reemplazar/renovar el plástico seleccionado */}
      <ReemplazoTarjetaDialog
        open={showReemplazo}
        onOpenChange={setShowReemplazo}
        tarjeta={productosLocales.find((p) => p.id === productoSel) || null}
        onDone={handleReemplazoDone}
      />
    </Dialog>
  );
}