import React from "react";
import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCOP, BANCO_NAMES } from "@/lib/contabilidad";
import { Building2, User, Wallet, FileText, Hash, FileSpreadsheet } from "lucide-react";

export default function CuentaAhorroDetail({ open, onOpenChange, cuenta, titular, pucCuenta, acumuladoMes }) {
  if (!cuenta) return null;

  const fields = [
    { icon: Hash, label: "Nombre", value: cuenta.nombre },
    { icon: Hash, label: "Número de cuenta", value: cuenta.numero_completo, mono: true },
    { icon: Building2, label: "Banco", value: BANCO_NAMES[cuenta.banco] || cuenta.banco },
    { icon: FileText, label: "Subcuenta PUC", value: pucCuenta ? `${pucCuenta.codigo} — ${pucCuenta.concepto}` : cuenta.subcuenta_puc, mono: !pucCuenta },
    { icon: User, label: "Titular", value: titular ? titular.nombre : "—" },
    { icon: User, label: "Cédula titular", value: titular?.cedula || "—" },
    { icon: Wallet, label: "Saldo actual", value: formatCOP(cuenta.saldo), highlight: true },
    { icon: Wallet, label: "Movimientos acumulado (mes)", value: formatCOP(acumuladoMes || 0) },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {cuenta.nombre}
            <Badge variant={cuenta.estado === "activa" ? "default" : "secondary"} className="text-xs">
              {cuenta.estado === "activa" ? "Activa" : "Inactiva"}
            </Badge>
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
        {cuenta.nota && (
          <div className="text-xs text-muted-foreground italic border-t border-border pt-2">
            Nota: {cuenta.nota}
          </div>
        )}
        <div className="pt-3 border-t border-border flex items-center justify-between gap-3">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          <Button asChild size="sm" className="gap-2" variant="default">
            <Link to={`/admin/contabilidad/detalle-cuentas?cuenta=${cuenta.subcuenta_puc || "1110"}&cda_id=${cuenta.id}`}>
              <FileSpreadsheet className="w-4 h-4 mr-1" />
              Ver en Detalle de Cuentas ({cuenta.subcuenta_puc || "1110"})
            </Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}