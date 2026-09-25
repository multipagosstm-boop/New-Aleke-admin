import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import SearchableSelect from "@/components/ui/searchable-select";

// Selector de cuenta de ingreso para abonos: permite elegir cualquier cuenta
// transaccional (CDA, efectivo, TDC, cruces con otras líneas de negocio, etc.).
// onValueChange recibe { subcuenta, cuenta_ahorro_id, producto_credito_id }.
// value es el código de subcuenta seleccionado (string).
export default function CuentaIngresoSelect({ value, onValueChange, placeholder = "Cuenta de ingreso...", triggerClassName = "h-9" }) {
  const [puc, setPuc] = useState([]);
  const [cdas, setCdas] = useState([]);
  const [productos, setProductos] = useState([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [p, c, pr] = await Promise.all([
          base44.entities.Cuenta.filter({ es_transaccional: true }, "-codigo", 2000),
          base44.entities.CuentaAhorro.filter({ estado: "activa" }),
          base44.entities.ProductoCredito.filter({ estado: "activo" })
        ]);
        if (!alive) return;
        setPuc(p); setCdas(c); setProductos(pr);
      } catch { /* ignora */ }
    })();
    return () => { alive = false; };
  }, []);

  const options = useMemo(() => puc.map((c) => ({
    value: String(c.codigo),
    label: `${c.codigo} — ${c.concepto}`,
    searchKey: `${c.codigo} ${c.concepto}`
  })), [puc]);

  const handleChange = (codigo) => {
    const cuenta = puc.find((c) => String(c.codigo) === String(codigo));
    const cda = cuenta ? cdas.find((c) => String(c.subcuenta_puc) === String(cuenta.codigo)) : null;
    const tdc = cuenta ? productos.find((p) => String(p.subcuenta_puc) === String(cuenta.codigo)) : null;
    onValueChange({
      subcuenta: codigo,
      cuenta_ahorro_id: cda?.id || "",
      producto_credito_id: tdc?.id || ""
    });
  };

  return (
    <SearchableSelect
      value={value}
      onValueChange={handleChange}
      placeholder={placeholder}
      searchPlaceholder="Buscar cuenta..."
      options={options}
      triggerClassName={triggerClassName}
    />
  );
}