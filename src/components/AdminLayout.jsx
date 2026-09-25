import React, { useState, useEffect } from "react";
import { Outlet, NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, ListTree, BookOpen, Scale, FileText, Wallet, CreditCard, Receipt, ChevronLeft, ChevronDown, Building2, Target, Users, GitCompare, Upload, Sun, Moon, HandCoins, Bot, Briefcase, ScanSearch, Database } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/useTheme";
import SupabaseConfigDialog from "@/components/admin/SupabaseConfigDialog";

const navGroups = [
{
  label: "Contabilidad",
  items: [
  { to: "/admin/contabilidad/resumen", label: "Resumen", icon: LayoutDashboard },
  { to: "/admin/contabilidad/plan-cuentas", label: "Plan de Cuentas", icon: ListTree },
  { to: "/admin/contabilidad/libro-diario", label: "Libro Diario", icon: BookOpen },
  { to: "/admin/contabilidad/carga-masiva", label: "Carga Masiva", icon: Upload },
  { to: "/admin/contabilidad/balance", label: "Balance", icon: Scale },
  { to: "/admin/contabilidad/estados", label: "Estados Financieros", icon: FileText },
  { to: "/admin/contabilidad/auditoria-cuadre", label: "Auditoría de Cuadre", icon: ScanSearch }]

  },
{
  label: "Financieros",
  items: [
  { to: "/admin/financieros/cuentas-ahorro", label: "Cuentas de Ahorro", icon: Wallet },
  { to: "/admin/financieros/tarjetas", label: "Tarjetas y Créditos", icon: CreditCard },
  { to: "/admin/financieros/extractos", label: "Extractos / Pagos", icon: Receipt },
  { to: "/admin/conciliacion", label: "Conciliación Bancaria", icon: GitCompare },
  { to: "/admin/financieros/metas-tarjetas", label: "Metas Tarjetas", icon: Target }]

},
{
  label: "Administración",
  items: [
  { to: "/admin/clientes", label: "Clientes", icon: Users },
  { to: "/admin/asistente", label: "Asistente IA", icon: Bot }]

},
{
  label: "Líneas de Negocio",
  items: [
  { to: "/admin/lineas/rooftop", label: "Aleke Rooftop", icon: Building2 },
  { to: "/admin/lineas/pakredito", label: "Pakredito", icon: HandCoins },
  { to: "/admin/lineas/emprendamos", label: "Emprendamos", icon: Briefcase }]

}];


export default function AdminLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [supabaseOpen, setSupabaseOpen] = useState(false);
  const { theme, toggle } = useTheme();
  const location = useLocation();
  const currentTitle = navGroups.
  flatMap((g) => g.items).
  find((i) => location.pathname.startsWith(i.to))?.label || "Aleke System";

  const [expandedGroups, setExpandedGroups] = useState(() => {
    const activeGroup = navGroups.find((g) => g.items.some((i) => location.pathname.startsWith(i.to)));
    const state = {};
    navGroups.forEach((g) => {state[g.label] = g.label === activeGroup?.label;});
    return state;
  });
  const toggleGroup = (label) => setExpandedGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  useEffect(() => {
    const activeGroup = navGroups.find((g) => g.items.some((i) => location.pathname.startsWith(i.to)));
    if (activeGroup && !expandedGroups[activeGroup.label]) {
      setExpandedGroups((prev) => ({ ...prev, [activeGroup.label]: true }));
    }
     
  }, [location.pathname]);

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <aside
        className={cn(
          "flex flex-col border-r border-border bg-sidebar transition-all duration-200 shrink-0",
          collapsed ? "w-[68px]" : "w-60"
        )}>
        
        <div className="flex items-center gap-3 px-4 h-16 border-b border-border shrink-0">
          <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5 text-primary-foreground" />
          </div>
          {!collapsed &&
          <div className="leading-tight overflow-hidden">
              <div className="font-heading font-semibold text-sm">Aleke System</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Contable V2</div>
            </div>
          }
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1 ml-2 mb-1 mr-2">
          {navGroups.map((group) => {
            const isOpen = collapsed || expandedGroups[group.label];
            return (
              <div key={group.label}>
                {!collapsed &&
                <button
                  onClick={() => toggleGroup(group.label)}
                  className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors">
                  
                    <span>{group.label}</span>
                    <ChevronDown className={cn("w-3 h-3 transition-transform", isOpen && "rotate-180")} />
                  </button>
                }
                {isOpen &&
                <div className="space-y-0.5 mt-0.5">
                    {group.items.map((item) =>
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                      isActive ?
                      "bg-primary/15 text-primary font-medium" :
                      "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    )
                    }
                    title={collapsed ? item.label : undefined}>
                    
                        <item.icon className="w-4 h-4 shrink-0" />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                      </NavLink>
                  )}
                  </div>
                }
              </div>);

          })}
        </nav>

        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center justify-center h-10 border-t border-border text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors shrink-0">
          
          <ChevronLeft className={cn("w-4 h-4 transition-transform", collapsed && "rotate-180")} />
        </button>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 border-b border-border bg-card/50 backdrop-blur-sm flex items-center justify-between px-6 shrink-0">
          <h1 className="font-heading font-semibold text-lg">{currentTitle}</h1>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSupabaseOpen(true)}
              className="gap-1.5 border-emerald-600/30 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
              title="Configurar conexión Supabase y Esquema SQL"
            >
              <Database className="w-4 h-4 text-emerald-500" />
              <span className="hidden sm:inline">Supabase</span>
            </Button>
            <div className="text-xs text-muted-foreground hidden md:block">Sistema Contable Aleke Company</div>
            <Button variant="ghost" size="icon" onClick={toggle} title={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}>
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
      <SupabaseConfigDialog open={supabaseOpen} onOpenChange={setSupabaseOpen} />
    </div>);

}