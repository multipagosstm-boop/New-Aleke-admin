import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { CreditCard } from "lucide-react";
import { BANCOS, TIPO_PRODUCTO, computeDiaCortePorSemana } from "@/lib/contabilidad";
import TarjetaAtributosFields from "./TarjetaAtributos";

export default function ReemplazoTarjetaDialog({ open, onOpenChange, tarjeta, onDone }) {
  const [digitos, setDigitos] = useState("");
  const [numeroCompleto, setNumeroCompleto] = useState("");
  const [tipo, setTipo] = useState("TDC");
  const [banco, setBanco] = useState("");
  const [cupo, setCupo] = useState(0);
  const [fechaCorte, setFechaCorte] = useState(1);
  const [franquicia, setFranquicia] = useState("");
  const [categoria, setCategoria] = useState("");
  const [corteModo, setCorteModo] = useState("dia_fijo");
  const [corteSemana, setCorteSemana] = useState(1);
  const [corteDiaSemana, setCorteDiaSemana] = useState(5);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (tarjeta && open) {
      setDigitos("");
      setNumeroCompleto(tarjeta.numero_completo || "");
      setTipo(tarjeta.tipo || "TDC");
      setBanco(tarjeta.banco || "");
      setCupo(tarjeta.cupo || 0);
      setFechaCorte(tarjeta.fecha_corte || 1);
      setFranquicia(tarjeta.franquicia || "");
      setCategoria(tarjeta.categoria || "");
      setCorteModo(tarjeta.corte_modo || "dia_fijo");
      setCorteSemana(tarjeta.corte_semana || 1);
      setCorteDiaSemana(tarjeta.corte_dia_semana || 5);
      setError("");
    }
  }, [tarjeta, open]);

  if (!tarjeta) return null;

  const handleSubmit = async () => {
    // Detección automática de los 4 últimos dígitos desde el número completo
    const digitsOnlyNC = String(numeroCompleto || "").replace(/\D/g, "");
    const digitosAuto = digitsOnlyNC.length >= 4 ? digitsOnlyNC.slice(-4) : "";
    const dFinal = (digitosAuto || digitos.replace(/\D/g, "")).slice(0, 4);
    if (tipo === "TDC") {
      if (!digitsOnlyNC || digitsOnlyNC.length < 4) { setError("Ingrese el número completo de la tarjeta"); return; }
    } else if (dFinal.length !== 4) {
      setError("Ingrese el número completo o los 4 últimos dígitos"); return;
    }
    // Calcular día de corte efectivo
    let fechaCorteFinal = Number(fechaCorte) || 1;
    if (corteModo === "dia_semana") {
      const hoy = new Date();
      fechaCorteFinal = computeDiaCortePorSemana(hoy.getFullYear(), hoy.getMonth(), Number(corteSemana) || 1, Number(corteDiaSemana) || 5);
      if (!fechaCorteFinal) { setError("La configuración de corte por día de la semana no es válida para este mes"); return; }
    }
    setSaving(true);
    setError("");
    try {
      await base44.functions.invoke("gestionarTarjeta", {
        operacion: "reemplazo",
        tarjeta_id: tarjeta.id,
        nuevos_digitos: dFinal,
        tipo,
        banco,
        cupo: Number(cupo) || 0,
        fecha_corte: fechaCorteFinal,
        numero_completo: numeroCompleto,
        franquicia: tipo === "TDC" ? franquicia : "",
        categoria: tipo === "TDC" ? categoria : "",
        corte_modo: corteModo,
        corte_semana: corteModo === "dia_semana" ? Number(corteSemana) : 0,
        corte_dia_semana: corteModo === "dia_semana" ? Number(corteDiaSemana) : 0
      });
      onDone();
      onOpenChange(false);
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message;
      setError(msg);
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="w-4 h-4" /> Reemplazo de Tarjeta
          </DialogTitle>
          <DialogDescription>
            Reemplazo físico del plástico. Se conserva el código interno, saldo e historial. Puede ajustar categorías y el número completo.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="bg-muted/50 rounded-md p-3 text-sm space-y-1">
            <div>Tarjeta actual: <span className="font-mono font-medium">{tarjeta.nombre}</span></div>
            <div>Código: <span className="font-mono">{tarjeta.nomenclatura}</span></div>
            <div>Saldo: <span className="font-mono">{tarjeta.saldo?.toLocaleString() || 0}</span></div>
          </div>
          <div>
            <Label>Número completo del nuevo plástico{tipo === "TDC" ? " *" : " (opcional)"}</Label>
            <Input value={numeroCompleto} onChange={(e) => setNumeroCompleto(e.target.value)} placeholder="Ej: 4557 8800 1234 5678" maxLength={19} />
            {numeroCompleto && String(numeroCompleto).replace(/\D/g, "").length >= 4 && (
              <p className="text-[11px] text-muted-foreground mt-1">Últimos 4 dígitos detectados: <span className="font-mono font-medium text-foreground">{String(numeroCompleto).replace(/\D/g, "").slice(-4)}</span></p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TIPO_PRODUCTO).map(([k, v]) => <SelectItem key={k} value={k}>{k} — {v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Banco</Label>
              <Select value={banco} onValueChange={setBanco}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  {BANCOS.map((b) => <SelectItem key={b.code} value={b.code}>{b.code} — {b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Cupo / Límite</Label>
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
          {error && <div className="text-sm text-destructive">{error}</div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving}>{saving ? "Procesando..." : "Confirmar Reemplazo"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}