import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { formatCOP, BANCO_NAMES, TIPO_PRODUCTO, getCorteDisplayText } from "@/lib/contabilidad";
import { Building2, User, CreditCard, FileText, Hash, Calendar, Wallet, Tag, History } from "lucide-react";

export default function ProductoCreditoDetail({ open, onOpenChange, producto, titular, pucCuenta }) {
  const [versiones, setVersiones] = useState([]);

  useEffect(() => {
    if (producto?.codigo_interno) {
      base44.entities.ProductoCredito.filter({ codigo_interno: producto.codigo_interno })
        .then((v) => {
          v.sort((a, b) => (b.version_consecutivo || 1) - (a.version_consecutivo || 1));
          setVersiones(v);
        })
        .catch(() => setVersiones([]));
    } else {
      setVersiones([]);
    }
  }, [producto]);

  if (!producto) return null;

  const esCredito = ["CH","LIB","CR"].includes(producto.tipo);
  const esRotativo = producto.tipo === "CR";
  const disponible = (producto.cupo || 0) - Math.abs(producto.saldo || 0);
  const usoPct = producto.cupo > 0 ? (Math.abs(producto.saldo || 0) / producto.cupo) * 100 : 0;

  const fields = [
    { icon: Hash, label: "Nombre", value: producto.nombre },
    { icon: Tag, label: "Nomenclatura", value: producto.nomenclatura, mono: true },
    { icon: Tag, label: "Código interno", value: producto.codigo_interno || (producto.nomenclatura || "").replace(/-\d+$/, ""), mono: true },
    { icon: CreditCard, label: "Número completo", value: producto.numero_completo || "—", mono: true },
    { icon: CreditCard, label: "Tipo", value: TIPO_PRODUCTO[producto.tipo] || producto.tipo },
    { icon: Building2, label: "Banco", value: BANCO_NAMES[producto.banco] || producto.banco },
    ...(producto.franquicia ? [{ icon: CreditCard, label: "Franquicia", value: producto.franquicia }] : []),
    ...(producto.categoria ? [{ icon: CreditCard, label: "Categoría", value: producto.categoria }] : []),
    { icon: FileText, label: "Subcuenta PUC", value: pucCuenta ? `${pucCuenta.codigo} — ${pucCuenta.concepto}` : producto.subcuenta_puc, mono: !pucCuenta },
    { icon: User, label: "Titular", value: titular ? titular.nombre : "—" },
    { icon: User, label: "Cédula titular", value: titular?.cedula || "—" },
    ...(esCredito && !esRotativo
      ? [{ icon: Wallet, label: "Saldo a deber", value: formatCOP(Math.abs(producto.saldo || 0)), highlight: true }]
      : [
          { icon: Wallet, label: "Cupo / Límite", value: formatCOP(producto.cupo), highlight: true },
          { icon: Wallet, label: "Saldo utilizado", value: formatCOP(Math.abs(producto.saldo || 0)) },
          { icon: Wallet, label: "Disponible", value: formatCOP(disponible) },
        ]),
    { icon: Calendar, label: esCredito ? "Día de pago" : "Día de corte", value: getCorteDisplayText(producto) },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {producto.nombre}
            <Badge variant={producto.estado === "activo" ? "default" : producto.estado === "bloqueado" ? "destructive" : "secondary"} className="text-xs">
              {producto.estado}
            </Badge>
            {(producto.version_consecutivo || 1) > 1 && (
              <Badge variant="outline" className="text-xs">Versión {producto.version_consecutivo}</Badge>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {fields.map((f, i) => (
            <div key={i} className="flex items-center justify-between gap-3 py-1.5 border-b border-border last:border-0">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <f.icon className="w-3.5 h-3.5" />
                {f.label}
              </div>
              <span className={`text-sm font-medium text-right ${f.mono ? "font-mono" : ""} ${f.highlight ? "text-primary text-base font-heading font-bold" : ""}`}>
                {f.value}
              </span>
            </div>
          ))}
        </div>
        {(!esCredito || esRotativo) && (
        <div className="pt-1">
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>Uso del cupo</span>
            <span>{usoPct.toFixed(0)}%</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className={`h-full transition-all ${usoPct > 90 ? "bg-destructive" : usoPct > 70 ? "bg-warning" : "bg-primary"}`} style={{ width: `${Math.min(usoPct, 100)}%` }} />
          </div>
        </div>
        )}
        {versiones.length > 1 && (
          <div className="pt-2 border-t border-border">
            <div className="flex items-center gap-2 text-sm font-medium mb-2">
              <History className="w-4 h-4" /> Historial de versiones ({versiones.length})
            </div>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {versiones.map((v) => (
                <div key={v.id} className="flex items-center justify-between text-xs py-1 px-2 rounded-md bg-muted/30">
                  <div>
                    <span className="font-mono font-medium">{v.nomenclatura}</span>
                    <span className="text-muted-foreground ml-2">{v.nombre}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={v.estado === "activo" ? "default" : "secondary"} className="text-[10px]">{v.estado}</Badge>
                    {v.operacion && <span className="text-muted-foreground">{v.operacion}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}