import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Target, CheckCircle2, AlertTriangle, ShoppingCart } from "lucide-react";

const cardStyles = {
  primary: { bg: "bg-primary/10", text: "text-primary", val: "" },
  success: { bg: "bg-success/10", text: "text-success", val: "text-success" },
  warning: { bg: "bg-warning/10", text: "text-warning", val: "text-warning" },
  destructive: { bg: "bg-destructive/10", text: "text-destructive", val: "text-destructive" },
};

export default function MetasResumen({ totalConMetas, cumpliendo, enRiesgoCount, sinComprasCount }) {
  const items = [
    { label: "Con metas activas", value: totalConMetas, Icon: Target, key: "primary" },
    { label: "Cumpliendo", value: cumpliendo, Icon: CheckCircle2, key: "success" },
    { label: "En riesgo", value: enRiesgoCount, Icon: AlertTriangle, key: "warning" },
    { label: "Sin compras", value: sinComprasCount, Icon: ShoppingCart, key: "destructive" },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {items.map((c) => {
        const s = cardStyles[c.key];
        return (
          <Card key={c.label}>
            <CardContent className="pt-4 pb-4 flex items-center gap-3">
              <div className={`p-2 rounded-md ${s.bg}`}>
                <c.Icon className={`w-4 h-4 ${s.text}`} />
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground uppercase">{c.label}</div>
                <div className={`text-lg font-heading font-bold ${s.val}`}>{c.value}</div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}