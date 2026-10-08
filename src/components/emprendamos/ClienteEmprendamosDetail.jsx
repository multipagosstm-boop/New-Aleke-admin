import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Wallet,
  CreditCard,
  Receipt,
  FileText,
  Percent,
  Plus,
  TrendingDown,
  LogOut,
  Pencil,
  Trash2,
  ExternalLink
} from "lucide-react";
import { formatCOP, formatDate } from "@/lib/contabilidad";
import {
  calcularCupoDisponible,
  calcularCupoUsado,
  calcularExtracupoUsado,
  formatearTasaPorcentaje
} from "@/lib/emprendamos";
import { Link } from "react-router-dom";

export default function ClienteEmprendamosDetail({
  open,
  onOpenChange,
  inscrito,
  cliente,
  creditos = [],
  abonos = [],
  intereses = [],
  cdas = [],
  productos = [],
  onOpenNuevoPrestamo,
  onOpenNuevoProducto,
  onOpenAbono,
  onOpenEstadoCuenta,
  onOpenAmortizacion,
  onOpenSalida,
  onEliminarCredito,
  onEliminarAbono,
  onEditarCredito,
  onEditarAbono,
  onActualizarCliente
}) {
  // Edición de plan o notas
  const [editando, setEditando] = useState(false);
  const [diaPagoEdit, setDiaPagoEdit] = useState(15);
  const [tasaAcordadaEdit, setTasaAcordadaEdit] = useState("3.0");
  const [tasaExtracupoEdit, setTasaExtracupoEdit] = useState("6.0");
  const [planTrazadoEdit, setPlanTrazadoEdit] = useState("");
  const [notasEdit, setNotasEdit] = useState("");

  useEffect(() => {
    if (inscrito) {
      setDiaPagoEdit(inscrito.dia_pago || 15);
      setTasaAcordadaEdit(((inscrito.tasa_acordada || 0.03) * 100).toFixed(1));
      setTasaExtracupoEdit(((inscrito.tasa_extracupo || 0.06) * 100).toFixed(1));
      setPlanTrazadoEdit(inscrito.plan_trazado || "");
      setNotasEdit(inscrito.notas || "");
    }
  }, [inscrito]);

  if (!inscrito) return null;

  const hoy = new Date().toISOString().substring(0, 10);
  const creditosCliente = creditos.filter((c) => c.emprendamos_cliente_id === inscrito.id);
  const creditosVigentes = creditosCliente.filter((c) => c.estado === "vigente");
  const abonosCliente = abonos.filter((a) => a.emprendamos_cliente_id === inscrito.id);
  const interesesCliente = intereses.filter((i) => i.emprendamos_cliente_id === inscrito.id);

  const cdaApoderada = cdas.find((c) => c.id === inscrito.cda_apoderada_id);
  const tarjetasCliente = productos.filter((p) => (p.titular_id === inscrito.cliente_id || p.cliente_id === inscrito.cliente_id));
  const cdasDelCliente = cdas.filter((c) => (c.titular_id === inscrito.cliente_id || c.cliente_id === inscrito.cliente_id));

  const cupoTotal = Number(inscrito.cupo_asignado) || 0;
  const cupoUsado = calcularCupoUsado(creditosCliente);
  const cupoDisponible = calcularCupoDisponible(cupoTotal, creditosCliente);
  const extracupoUsado = calcularExtracupoUsado(creditosCliente);
  const saldoDeudaTotal = creditosVigentes.reduce((s, c) => s + (Number(c.saldo_capital) || 0) + (Number(c.saldo_intereses) || 0), 0);

  const esEligibleSalida = inscrito.fecha_eligible_salida && inscrito.fecha_eligible_salida <= hoy;

  const handleGuardarEdicion = async () => {
    await onActualizarCliente({
      emprendamos_cliente_id: inscrito.id,
      dia_pago: Number(diaPagoEdit),
      tasa_acordada: Number(tasaAcordadaEdit) / 100,
      tasa_extracupo: Number(tasaExtracupoEdit) / 100,
      plan_trazado: planTrazadoEdit,
      notas: notasEdit
    });
    setEditando(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader className="border-b pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <DialogTitle className="text-xl font-bold">
                  {cliente?.nombre || inscrito?.nombre || "Ficha del Cliente"}
                </DialogTitle>
                <Badge variant={inscrito.estado === "activo" ? "default" : "outline"}>
                  {inscrito.estado === "activo" ? "Activo en Emprendamos" : inscrito.estado}
                </Badge>
                {esEligibleSalida && (
                  <Badge variant="outline" className="border-emerald-500 text-emerald-600 dark:text-emerald-400">
                    Elegible Salida (&ge;1 año)
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Doc: {cliente?.documento || cliente?.cedula || inscrito?.documento || "—"} | Tel: {cliente?.telefono || inscrito?.telefono || "—"} | Ingreso: {formatDate(inscrito.fecha_ingreso)} | Día de Pago: Día {inscrito.dia_pago}
              </p>
            </div>

            {/* BOTONES DE ACCIÓN RÁPIDA */}
            <div className="flex flex-wrap items-center gap-1.5">
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => onOpenEstadoCuenta(inscrito)}>
                <FileText className="w-3.5 h-3.5 mr-1 text-primary" /> Estado de Cuenta
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => onOpenNuevoProducto(inscrito)}>
                <Percent className="w-3.5 h-3.5 mr-1 text-amber-500" /> Nuevo Producto (10%)
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => onOpenNuevoPrestamo(inscrito)}>
                <Plus className="w-3.5 h-3.5 mr-1 text-blue-500" /> Nuevo Préstamo
              </Button>
              <Button size="sm" variant="default" className="h-8 text-xs" onClick={() => onOpenAbono(inscrito.id)}>
                <Receipt className="w-3.5 h-3.5 mr-1" /> Registrar Abono
              </Button>
              {inscrito.estado === "activo" && (
                <Button size="sm" variant="ghost" className="h-8 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50" onClick={() => onOpenSalida(inscrito)}>
                  <LogOut className="w-3.5 h-3.5 mr-1" /> Salida
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-2 text-xs">
          {/* TABLERO DE MÉTRICAS FINANCIERAS */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="p-3">
                <span className="text-[11px] text-muted-foreground block">Deuda Total a Deber</span>
                <span className="text-base font-bold text-primary block mt-0.5">
                  {formatCOP(saldoDeudaTotal)}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  Inicial: {formatCOP(inscrito.capital_inicial)}
                </span>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-3">
                <span className="text-[11px] text-muted-foreground block">Cupo TDC Asignado</span>
                <span className="text-base font-bold block mt-0.5">
                  {formatCOP(cupoTotal)}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {tarjetasCliente.length} tarjeta(s) activa(s)
                </span>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-3">
                <span className="text-[11px] text-muted-foreground block">Cupo Usado (Habitual)</span>
                <span className="text-base font-bold text-amber-600 dark:text-amber-400 block mt-0.5">
                  {formatCOP(cupoUsado)}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  Tasa pactada: {formatearTasaPorcentaje(inscrito.tasa_acordada)}
                </span>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-3">
                <span className="text-[11px] text-muted-foreground block">Cupo Disponible</span>
                <span className={`text-base font-bold block mt-0.5 ${cupoDisponible > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>
                  {formatCOP(cupoDisponible)}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  Para nuevos créditos a 3%
                </span>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-3">
                <span className="text-[11px] text-muted-foreground block">Extracupo Utilizado</span>
                <span className="text-base font-bold text-purple-600 dark:text-purple-400 block mt-0.5">
                  {formatCOP(extracupoUsado)}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  Tasa extracupo: {formatearTasaPorcentaje(inscrito.tasa_extracupo)}
                </span>
              </CardContent>
            </Card>
          </div>

          {/* VÍNCULOS: CDA APODERADA Y TARJETAS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 bg-muted/20 border rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wallet className="w-4 h-4 text-emerald-600 shrink-0" />
                <div>
                  <span className="font-semibold block text-xs">CDA Apoderada:</span>
                  {cdaApoderada ? (
                    <span className="text-muted-foreground text-[11px]">
                      {cdaApoderada.banco} — {cdaApoderada.numero_completo || cdaApoderada.numero_cuenta} (Saldo: {formatCOP(cdaApoderada.saldo)})
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-[11px]">Sin CDA asignada</span>
                  )}
                </div>
              </div>
              {cdaApoderada?.subcuenta && (
                <Link
                  to={`/admin/contabilidad/detalle-cuentas?cuenta=${cdaApoderada.subcuenta}&cda_id=${cdaApoderada.id}`}
                  className="text-[11px] text-primary hover:underline flex items-center gap-1"
                >
                  Ver Movimientos <ExternalLink className="w-3 h-3" />
                </Link>
              )}
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-blue-600 shrink-0" />
                <div>
                  <span className="font-semibold block text-xs">Tarjetas Registradas ({tarjetasCliente.length}):</span>
                  <span className="text-muted-foreground text-[11px]">
                    {tarjetasCliente.map((t) => `${t.banco} (${formatCOP(t.cupo)})`).join(", ") || "Ninguna tarjeta"}
                  </span>
                </div>
              </div>
              <Link
                to="/admin/financieros/tarjetas"
                className="text-[11px] text-primary hover:underline flex items-center gap-1"
              >
                Módulo Tarjetas <ExternalLink className="w-3 h-3" />
              </Link>
            </div>
          </div>

          {/* PESTAÑAS DETALLADAS */}
          <Tabs defaultValue="creditos" className="w-full">
            <TabsList className="grid grid-cols-5 w-full">
              <TabsTrigger value="creditos">
                Créditos ({creditosCliente.length})
              </TabsTrigger>
              <TabsTrigger value="abonos">
                Abonos ({abonosCliente.length})
              </TabsTrigger>
              <TabsTrigger value="intereses">
                Intereses ({interesesCliente.length})
              </TabsTrigger>
              <TabsTrigger value="productos">
                Productos & Bancos ({tarjetasCliente.length + cdasDelCliente.length})
              </TabsTrigger>
              <TabsTrigger value="plan">
                Plan & Parámetros
              </TabsTrigger>
            </TabsList>

            {/* TAB CRÉDITOS */}
            <TabsContent value="creditos" className="space-y-2 pt-2">
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/40 border-b text-[10px] text-muted-foreground">
                    <tr>
                      <th className="p-2.5">Código</th>
                      <th className="p-2.5">Tipo</th>
                      <th className="p-2.5">Concepto</th>
                      <th className="p-2.5 text-right">Capital Original</th>
                      <th className="p-2.5 text-right">Saldo Capital</th>
                      <th className="p-2.5 text-right">Saldo Intereses</th>
                      <th className="p-2.5 text-center">Tasa</th>
                      <th className="p-2.5">Próx. Pago</th>
                      <th className="p-2.5 text-center">Estado</th>
                      <th className="p-2.5 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {creditosCliente.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="p-4 text-center text-muted-foreground">
                          Sin créditos registrados.
                        </td>
                      </tr>
                    ) : (
                      creditosCliente.map((c) => (
                        <tr key={c.id} className="hover:bg-muted/30">
                          <td className="p-2.5 font-bold">{c.codigo}</td>
                          <td className="p-2.5">
                            <Badge variant={c.tipo === "extracupo" ? "outline" : "secondary"} className="text-[10px]">
                              {c.tipo}
                            </Badge>
                          </td>
                          <td className="p-2.5 text-muted-foreground max-w-[150px] truncate">{c.concepto}</td>
                          <td className="p-2.5 text-right font-medium">{formatCOP(c.capital)}</td>
                          <td className="p-2.5 text-right font-bold text-foreground">{formatCOP(c.saldo_capital)}</td>
                          <td className="p-2.5 text-right text-amber-600 dark:text-amber-400 font-medium">
                            {formatCOP(c.saldo_intereses)}
                          </td>
                          <td className="p-2.5 text-center">{formatearTasaPorcentaje(c.tasa_nominal)}</td>
                          <td className="p-2.5 text-[11px] text-muted-foreground">
                            {c.fecha_proximo_pago ? formatDate(c.fecha_proximo_pago) : "—"}
                          </td>
                          <td className="p-2.5 text-center">
                            <Badge variant={c.estado === "saldado" ? "outline" : "default"} className="text-[10px]">
                              {c.estado}
                            </Badge>
                          </td>
                          <td className="p-2.5 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs"
                                title="Ver evolución de amortización"
                                onClick={() => onOpenAmortizacion(c)}
                              >
                                <TrendingDown className="w-3.5 h-3.5 text-primary" />
                              </Button>
                              {onEditarCredito && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2 text-xs text-primary"
                                  title="Editar crédito"
                                  onClick={() => onEditarCredito(c)}
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs text-destructive"
                                title="Eliminar crédito"
                                onClick={() => onEliminarCredito(c.id)}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            {/* TAB ABONOS */}
            <TabsContent value="abonos" className="space-y-2 pt-2">
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/40 border-b text-[10px] text-muted-foreground">
                    <tr>
                      <th className="p-2.5">Fecha</th>
                      <th className="p-2.5">Modalidad</th>
                      <th className="p-2.5">Cuenta Ingreso</th>
                      <th className="p-2.5 text-right">Valor Total</th>
                      <th className="p-2.5">Detalles de Aplicación</th>
                      <th className="p-2.5 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {abonosCliente.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-4 text-center text-muted-foreground">
                          No se han registrado abonos para este cliente.
                        </td>
                      </tr>
                    ) : (
                      abonosCliente.map((a) => {
                        const detalles = Array.isArray(a.detalles) ? a.detalles : [];
                        return (
                          <tr key={a.id} className="hover:bg-muted/30">
                            <td className="p-2.5 font-medium">{formatDate(a.fecha)}</td>
                            <td className="p-2.5">
                              <Badge variant="outline" className="text-[10px]">{a.tipo}</Badge>
                            </td>
                            <td className="p-2.5 text-muted-foreground">{a.subcuenta_ingreso || "Bancos"}</td>
                            <td className="p-2.5 text-right font-bold text-emerald-600 dark:text-emerald-400">
                              {formatCOP(a.valor_total)}
                            </td>
                            <td className="p-2.5 text-[11px] text-muted-foreground">
                              {detalles.map((d, idx) => {
                                const cr = creditos.find((c) => c.id === d.credito_id);
                                return (
                                  <span key={idx} className="block">
                                    {cr?.codigo || 'Crédito'}: Int {formatCOP(d.intereses)} | Cap {formatCOP(d.capital)}
                                  </span>
                                );
                              })}
                            </td>
                            <td className="p-2.5 text-center">
                              <div className="flex items-center justify-center gap-1">
                                {onEditarAbono && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-2 text-xs text-primary"
                                    title="Editar abono"
                                    onClick={() => onEditarAbono(a)}
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2 text-xs text-destructive"
                                  title="Eliminar abono y reversar saldos"
                                  onClick={() => onEliminarAbono(a.id)}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            {/* TAB INTERESES */}
            <TabsContent value="intereses" className="space-y-2 pt-2">
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/40 border-b text-[10px] text-muted-foreground">
                    <tr>
                      <th className="p-2.5">Período</th>
                      <th className="p-2.5">Fecha Liquidación</th>
                      <th className="p-2.5">Crédito</th>
                      <th className="p-2.5 text-right">Capital Base</th>
                      <th className="p-2.5 text-center">Tasa Aplicada</th>
                      <th className="p-2.5 text-right">Intereses Causados</th>
                      <th className="p-2.5 text-center">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {interesesCliente.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-4 text-center text-muted-foreground">
                          Sin liquidaciones de interés causadas en este cliente.
                        </td>
                      </tr>
                    ) : (
                      interesesCliente.map((it) => {
                        const cr = creditos.find((c) => c.id === it.credito_id);
                        return (
                          <tr key={it.id} className="hover:bg-muted/30">
                            <td className="p-2.5 font-bold">{it.periodo}</td>
                            <td className="p-2.5 text-muted-foreground">{formatDate(it.fecha)}</td>
                            <td className="p-2.5 font-medium">{cr?.codigo || "Crédito"}</td>
                            <td className="p-2.5 text-right">{formatCOP(it.capital_base)}</td>
                            <td className="p-2.5 text-center">{formatearTasaPorcentaje(it.tasa)}</td>
                            <td className="p-2.5 text-right font-bold text-amber-600 dark:text-amber-400">
                              +{formatCOP(it.intereses)}
                            </td>
                            <td className="p-2.5 text-center">
                              <Badge variant="outline" className="text-[10px]">{it.estado}</Badge>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            {/* TAB PRODUCTOS Y CUENTAS BANCARIAS */}
            <TabsContent value="productos" className="space-y-4 pt-2">
              {/* SECCIÓN TARJETAS DE CRÉDITO */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <CreditCard className="w-4 h-4 text-blue-600" />
                    <span className="font-bold text-xs text-foreground">
                      Tarjetas de Crédito y Productos Registrados ({tarjetasCliente.length})
                    </span>
                  </div>
                  <Link
                    to="/admin/financieros/tarjetas"
                    className="text-[11px] text-primary hover:underline flex items-center gap-1"
                  >
                    Ver en Módulo Tarjetas <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>

                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-muted/40 border-b text-[10px] text-muted-foreground uppercase">
                      <tr>
                        <th className="p-2.5">Producto</th>
                        <th className="p-2.5">Banco / Franquicia</th>
                        <th className="p-2.5">Número / Terminación</th>
                        <th className="p-2.5 text-right">Cupo Aprobado</th>
                        <th className="p-2.5 text-right">Saldo Deuda</th>
                        <th className="p-2.5 text-center">Subcuenta PUC</th>
                        <th className="p-2.5 text-center">Corte</th>
                        <th className="p-2.5 text-center">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {tarjetasCliente.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="p-4 text-center text-muted-foreground">
                            No hay tarjetas de crédito vinculadas a este cliente.
                          </td>
                        </tr>
                      ) : (
                        tarjetasCliente.map((t) => (
                          <tr key={t.id} className="hover:bg-muted/30">
                            <td className="p-2.5 font-bold text-foreground">
                              {t.nombre || t.nomenclatura || "TDC"}
                            </td>
                            <td className="p-2.5">
                              {t.banco || "—"} {t.franquicia ? `· ${t.franquicia}` : ""}
                            </td>
                            <td className="p-2.5 font-mono text-[11px] text-muted-foreground">
                              {t.numero_completo || "—"}
                            </td>
                            <td className="p-2.5 text-right font-medium text-foreground">
                              {formatCOP(t.cupo)}
                            </td>
                            <td className="p-2.5 text-right font-bold text-amber-600 dark:text-amber-400">
                              {formatCOP(t.saldo)}
                            </td>
                            <td className="p-2.5 text-center font-mono text-[11px] text-muted-foreground">
                              {t.subcuenta_puc || "—"}
                            </td>
                            <td className="p-2.5 text-center text-muted-foreground text-[11px]">
                              {t.fecha_corte ? `Día ${t.fecha_corte}` : "—"}
                            </td>
                            <td className="p-2.5 text-center">
                              <Badge variant={t.estado === "activo" ? "default" : "outline"} className="text-[10px]">
                                {t.estado || "activo"}
                              </Badge>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* SECCIÓN CUENTAS DE AHORRO (CDAs) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Wallet className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="font-bold text-xs text-foreground">
                      Cuentas de Ahorros del Cliente ({cdasDelCliente.length})
                    </span>
                  </div>
                  <Link
                    to="/admin/financieros/cuentas-ahorro"
                    className="text-[11px] text-primary hover:underline flex items-center gap-1"
                  >
                    Ver en Módulo CDAs <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>

                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-muted/40 border-b text-[10px] text-muted-foreground uppercase">
                      <tr>
                        <th className="p-2.5">Cuenta</th>
                        <th className="p-2.5">Banco</th>
                        <th className="p-2.5">Número de Cuenta</th>
                        <th className="p-2.5 text-center">Subcuenta PUC</th>
                        <th className="p-2.5 text-right">Saldo Actual</th>
                        <th className="p-2.5 text-center">Rol Emprendamos</th>
                        <th className="p-2.5 text-center">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {cdasDelCliente.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-4 text-center text-muted-foreground">
                            No hay cuentas de ahorro vinculadas a este cliente.
                          </td>
                        </tr>
                      ) : (
                        cdasDelCliente.map((c) => {
                          const esApoderada = c.id === inscrito.cda_apoderada_id;
                          return (
                            <tr key={c.id} className="hover:bg-muted/30">
                              <td className="p-2.5 font-bold text-foreground">
                                {c.nombre || "CDA"}
                              </td>
                              <td className="p-2.5">{c.banco || "—"}</td>
                              <td className="p-2.5 font-mono text-[11px] text-muted-foreground">
                                {c.numero_completo || "—"}
                              </td>
                              <td className="p-2.5 text-center font-mono text-[11px] text-muted-foreground">
                                {c.subcuenta_puc || "—"}
                              </td>
                              <td className="p-2.5 text-right font-bold text-emerald-600 dark:text-emerald-400">
                                {formatCOP(c.saldo)}
                              </td>
                              <td className="p-2.5 text-center">
                                {esApoderada ? (
                                  <Badge className="bg-emerald-600 text-white text-[10px]">
                                    CDA Apoderada
                                  </Badge>
                                ) : (
                                  <span className="text-muted-foreground text-[11px]">Ordinaria</span>
                                )}
                              </td>
                              <td className="p-2.5 text-center">
                                <Badge variant={c.estado === "activa" ? "default" : "outline"} className="text-[10px]">
                                  {c.estado || "activa"}
                                </Badge>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </TabsContent>

            {/* TAB PLAN Y NOTAS */}
            <TabsContent value="plan" className="space-y-3 pt-2">
              <div className="p-3 border rounded-lg space-y-3 bg-muted/10">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-xs">Estrategia y Condiciones Contractuales</span>
                  <Button
                    size="sm"
                    variant={editando ? "secondary" : "outline"}
                    className="h-7 text-xs"
                    onClick={() => setEditando(!editando)}
                  >
                    <Pencil className="w-3 h-3 mr-1" />
                    {editando ? "Cancelar Edición" : "Modificar Parámetros"}
                  </Button>
                </div>

                {editando ? (
                  <div className="space-y-3 pt-1">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Día de Pago (1-28)</Label>
                        <Input
                          type="number"
                          value={diaPagoEdit}
                          onChange={(e) => setDiaPagoEdit(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Tasa Acordada (%)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={tasaAcordadaEdit}
                          onChange={(e) => setTasaAcordadaEdit(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Tasa Extracupo (%)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={tasaExtracupoEdit}
                          onChange={(e) => setTasaExtracupoEdit(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Plan Trazado para Saneamiento y Créditos</Label>
                      <Textarea
                        rows={3}
                        value={planTrazadoEdit}
                        onChange={(e) => setPlanTrazadoEdit(e.target.value)}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Notas y Observaciones</Label>
                      <Textarea
                        rows={2}
                        value={notasEdit}
                        onChange={(e) => setNotasEdit(e.target.value)}
                      />
                    </div>

                    <Button size="sm" onClick={handleGuardarEdicion} className="w-full">
                      Guardar Cambios
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-3 text-xs bg-muted/40 p-2.5 rounded-lg">
                      <div>
                        <span className="text-muted-foreground block text-[11px]">Día de Cobro:</span>
                        <strong className="text-foreground">Día {inscrito.dia_pago} de cada mes</strong>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[11px]">Tasa Habitual:</span>
                        <strong className="text-foreground">{formatearTasaPorcentaje(inscrito.tasa_acordada)}</strong>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[11px]">Tasa Extracupo:</span>
                        <strong className="text-foreground">{formatearTasaPorcentaje(inscrito.tasa_extracupo)}</strong>
                      </div>
                    </div>

                    <div>
                      <span className="font-semibold block text-[11px] text-muted-foreground mb-1">Plan Trazado:</span>
                      <p className="p-2.5 bg-background border rounded-lg whitespace-pre-wrap text-foreground">
                        {inscrito.plan_trazado || "Sin plan redactado."}
                      </p>
                    </div>

                    <div>
                      <span className="font-semibold block text-[11px] text-muted-foreground mb-1">Notas:</span>
                      <p className="p-2.5 bg-background border rounded-lg whitespace-pre-wrap text-muted-foreground">
                        {inscrito.notas || "Sin notas adicionales."}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter className="pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
