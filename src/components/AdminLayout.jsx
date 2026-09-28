import React, { useState, useEffect } from "react";
import { Outlet, NavLink, useLocation, useNavigate } from "react-router-dom";
import { 
  LayoutDashboard, 
  ListTree, 
  BookOpen, 
  Scale, 
  FileText, 
  Wallet, 
  CreditCard, 
  Receipt, 
  ChevronLeft, 
  ChevronDown, 
  Building2, 
  Target, 
  Users, 
  GitCompare, 
  Upload, 
  Sun, 
  Moon, 
  HandCoins, 
  Bot, 
  ScanSearch, 
  Database,
  ShieldCheck,
  UserCheck,
  LogOut,
  UserCog,
  Menu,
  X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/lib/AuthContext";
import { ROLES, ROLE_INFO } from "@/lib/userStore";
import SupabaseConfigDialog from "@/components/admin/SupabaseConfigDialog";

const allNavGroups = [
  {
    label: "Contabilidad",
    items: [
      { to: "/admin/contabilidad/resumen", label: "Resumen", icon: LayoutDashboard, roles: [ROLES.ADMINISTRADOR, ROLES.CONTADOR, ROLES.AUXILIAR] },
      { to: "/admin/contabilidad/plan-cuentas", label: "Plan de Cuentas", icon: ListTree, roles: [ROLES.ADMINISTRADOR, ROLES.CONTADOR] },
      { to: "/admin/contabilidad/libro-diario", label: "Libro Diario", icon: BookOpen, roles: [ROLES.ADMINISTRADOR, ROLES.CONTADOR, ROLES.AUXILIAR] },
      { to: "/admin/contabilidad/carga-masiva", label: "Carga Masiva", icon: Upload, roles: [ROLES.ADMINISTRADOR, ROLES.CONTADOR] },
      { to: "/admin/contabilidad/balance", label: "Balance", icon: Scale, roles: [ROLES.ADMINISTRADOR, ROLES.CONTADOR] },
      { to: "/admin/contabilidad/estados", label: "Estados Financieros", icon: FileText, roles: [ROLES.ADMINISTRADOR, ROLES.CONTADOR] },
      { to: "/admin/contabilidad/auditoria-cuadre", label: "Auditoría de Cuadre", icon: ScanSearch, roles: [ROLES.ADMINISTRADOR, ROLES.CONTADOR] }
    ]
  },
  {
    label: "Financieros",
    items: [
      { to: "/admin/financieros/cuentas-ahorro", label: "Cuentas de Ahorro", icon: Wallet, roles: [ROLES.ADMINISTRADOR, ROLES.CONTADOR, ROLES.AUXILIAR] },
      { to: "/admin/financieros/tarjetas", label: "Tarjetas y Créditos", icon: CreditCard, roles: [ROLES.ADMINISTRADOR, ROLES.CONTADOR, ROLES.AUXILIAR] },
      { to: "/admin/financieros/extractos", label: "Extractos / Pagos", icon: Receipt, roles: [ROLES.ADMINISTRADOR, ROLES.CONTADOR, ROLES.AUXILIAR] },
      { to: "/admin/conciliacion", label: "Conciliación Bancaria", icon: GitCompare, roles: [ROLES.ADMINISTRADOR, ROLES.CONTADOR, ROLES.AUXILIAR] },
      { to: "/admin/financieros/metas-tarjetas", label: "Metas Tarjetas", icon: Target, roles: [ROLES.ADMINISTRADOR, ROLES.CONTADOR] }
    ]
  },
  {
    label: "Administración",
    items: [
      { to: "/admin/usuarios", label: "Usuarios y Roles", icon: UserCog, roles: [ROLES.ADMINISTRADOR] },
      { to: "/admin/clientes", label: "Clientes", icon: Users, roles: [ROLES.ADMINISTRADOR, ROLES.CONTADOR, ROLES.AUXILIAR] },
      { to: "/admin/asistente", label: "Asistente IA", icon: Bot, roles: [ROLES.ADMINISTRADOR, ROLES.CONTADOR, ROLES.AUXILIAR] }
    ]
  },
  {
    label: "Líneas de Negocio",
    items: [
      { to: "/admin/lineas/rooftop", label: "Aleke Rooftop", icon: Building2, roles: [ROLES.ADMINISTRADOR, ROLES.CONTADOR, ROLES.AUXILIAR] },
      { to: "/admin/lineas/pakredito", label: "Pakredito", icon: HandCoins, roles: [ROLES.ADMINISTRADOR, ROLES.CONTADOR, ROLES.AUXILIAR] }
    ]
  }
];

export default function AdminLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [supabaseOpen, setSupabaseOpen] = useState(false);
  const { theme, toggle } = useTheme();
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const userRole = user?.rol || ROLES.AUXILIAR;
  const roleConfig = ROLE_INFO[userRole] || { label: userRole, badgeClass: '' };

  // Cerrar menú móvil al cambiar de ruta
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  // Cerrar menú móvil con tecla Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") setMobileMenuOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Filtrar grupos y enlaces según los permisos del rol activo
  const filteredNavGroups = allNavGroups
    .map(group => ({
      ...group,
      items: group.items.filter(item => !item.roles || item.roles.includes(userRole))
    }))
    .filter(group => group.items.length > 0);

  const currentTitle = allNavGroups
    .flatMap((g) => g.items)
    .find((i) => location.pathname.startsWith(i.to))?.label || "Aleke System";

  const [expandedGroups, setExpandedGroups] = useState(() => {
    const activeGroup = filteredNavGroups.find((g) => g.items.some((i) => location.pathname.startsWith(i.to)));
    const state = {};
    filteredNavGroups.forEach((g) => { state[g.label] = g.label === activeGroup?.label; });
    return state;
  });

  const toggleGroup = (label) => setExpandedGroups((prev) => ({ ...prev, [label]: !prev[label] }));

  useEffect(() => {
    const activeGroup = filteredNavGroups.find((g) => g.items.some((i) => location.pathname.startsWith(i.to)));
    if (activeGroup && !expandedGroups[activeGroup.label]) {
      setExpandedGroups((prev) => ({ ...prev, [activeGroup.label]: true }));
    }
  }, [location.pathname, userRole]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      {/* MENÚ MÓVIL DESPLEGABLE (OVERLAY + DRAWER) */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 md:hidden transition-opacity"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-sidebar border-r border-border shadow-2xl flex flex-col transition-transform duration-300 ease-in-out md:hidden",
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        )}
        aria-label="Navegación de módulos"
      >
        {/* ENCABEZADO MENÚ MÓVIL */}
        <div className="flex items-center justify-between px-4 h-16 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5 text-primary-foreground" />
            </div>
            <div className="leading-tight overflow-hidden">
              <div className="font-heading font-semibold text-sm">Aleke System</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Contable & Financiero</div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileMenuOpen(false)}
            className="h-9 w-9 text-muted-foreground hover:text-foreground"
            aria-label="Cerrar menú"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* PERFIL ACTIVO EN MENÚ MÓVIL */}
        {user && (
          <div className="px-3 py-2.5 mx-3 my-2.5 rounded-lg bg-card/60 border border-border flex items-center justify-between text-xs shrink-0">
            <div className="overflow-hidden">
              <div className="font-semibold text-foreground truncate">{user.nombre || user.username}</div>
              <div className="text-[10px] text-muted-foreground font-mono truncate">@{user.username}</div>
            </div>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${roleConfig.badgeClass}`}>
              {roleConfig.label}
            </span>
          </div>
        )}

        {/* ENLACES DE MÓDULOS MÓVIL */}
        <nav className="flex-1 overflow-y-auto py-2 px-3 space-y-1">
          {filteredNavGroups.map((group) => {
            const isOpen = expandedGroups[group.label] !== false;
            return (
              <div key={`mob-${group.label}`} className="mb-2">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.label)}
                  className="w-full flex items-center justify-between px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                >
                  <span>{group.label}</span>
                  <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", isOpen && "rotate-180")} />
                </button>
                {isOpen && (
                  <div className="space-y-0.5 mt-0.5">
                    {group.items.map((item) => (
                      <NavLink
                        key={`mob-link-${item.to}`}
                        to={item.to}
                        onClick={() => setMobileMenuOpen(false)}
                        className={({ isActive }) =>
                          cn(
                            "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors",
                            isActive
                              ? "bg-primary/15 text-primary font-medium"
                              : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                          )
                        }
                      >
                        <item.icon className="w-4 h-4 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* PIE DE MENÚ MÓVIL */}
        <div className="border-t border-border p-3 shrink-0 space-y-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="w-full text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 justify-start gap-2 h-10"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span>Cerrar sesión</span>
          </Button>
        </div>
      </aside>

      {/* SIDEBAR DESKTOP (solo visible en pantallas md en adelante) */}
      <aside
        className={cn(
          "hidden md:flex flex-col border-r border-border bg-sidebar transition-all duration-200 shrink-0",
          collapsed ? "w-[68px]" : "w-60"
        )}
      >
        {/* LOGO DESKTOP */}
        <div className="flex items-center gap-3 px-4 h-16 border-b border-border shrink-0">
          <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5 text-primary-foreground" />
          </div>
          {!collapsed && (
            <div className="leading-tight overflow-hidden">
              <div className="font-heading font-semibold text-sm">Aleke System</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Contable & Financiero</div>
            </div>
          )}
        </div>

        {/* ACTIVE USER MINI PROFILE IN SIDEBAR */}
        {!collapsed && user && (
          <div className="px-3 py-2.5 mx-2 my-2 rounded-lg bg-card/60 border border-border flex items-center justify-between text-xs">
            <div className="overflow-hidden">
              <div className="font-semibold text-foreground truncate">{user.nombre || user.username}</div>
              <div className="text-[10px] text-muted-foreground font-mono truncate">@{user.username}</div>
            </div>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${roleConfig.badgeClass}`}>
              {roleConfig.label}
            </span>
          </div>
        )}

        {/* NAV ITEMS */}
        <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-1">
          {filteredNavGroups.map((group) => {
            const isOpen = collapsed || expandedGroups[group.label];
            return (
              <div key={group.label}>
                {!collapsed && (
                  <button
                    onClick={() => toggleGroup(group.label)}
                    className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <span>{group.label}</span>
                    <ChevronDown className={cn("w-3 h-3 transition-transform", isOpen && "rotate-180")} />
                  </button>
                )}
                {isOpen && (
                  <div className="space-y-0.5 mt-0.5">
                    {group.items.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        className={({ isActive }) =>
                          cn(
                            "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                            isActive
                              ? "bg-primary/15 text-primary font-medium"
                              : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                          )
                        }
                        title={collapsed ? item.label : undefined}
                      >
                        <item.icon className="w-4 h-4 shrink-0" />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* SIDEBAR FOOTER (LOGOUT & COLLAPSE) */}
        <div className="border-t border-border p-2 shrink-0 space-y-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className={cn(
              "w-full text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 justify-start gap-2 h-9",
              collapsed && "justify-center px-0"
            )}
            title="Cerrar sesión"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {!collapsed && <span>Cerrar sesión</span>}
          </Button>

          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-full flex items-center justify-center h-8 rounded text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
            title={collapsed ? "Expandir menú" : "Colapsar menú"}
          >
            <ChevronLeft className={cn("w-4 h-4 transition-transform", collapsed && "rotate-180")} />
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* TOPBAR RESPONSIVA */}
        <header className="h-16 border-b border-border bg-card/50 backdrop-blur-sm flex items-center justify-between px-3 sm:px-6 shrink-0 gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {/* Botón hamburguesa para dispositivos móviles */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden h-9 w-9 text-foreground hover:bg-muted shrink-0"
              aria-label="Abrir menú de módulos"
              title="Módulos del sistema"
            >
              <Menu className="w-5 h-5" />
            </Button>

            <h1 className="font-heading font-semibold text-base sm:text-lg truncate max-w-[200px] sm:max-w-none">
              {currentTitle}
            </h1>
            {user && (
              <span className={`hidden lg:inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full border shrink-0 ${roleConfig.badgeClass}`}>
                {user.rol === ROLES.ADMINISTRADOR && <ShieldCheck className="w-3.5 h-3.5" />}
                {user.rol === ROLES.CONTADOR && <UserCheck className="w-3.5 h-3.5" />}
                {user.rol === ROLES.AUXILIAR && <Users className="w-3.5 h-3.5" />}
                {roleConfig.label}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            {/* Supabase Button: Solo visible y ejecutable por el ADMINISTRADOR */}
            {user?.rol === ROLES.ADMINISTRADOR && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSupabaseOpen(true)}
                className="gap-1.5 border-emerald-600/30 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 h-8 sm:h-9 px-2 sm:px-3 text-xs"
                title="Configuración y conexión a Supabase (Acceso exclusivo Administrador)"
              >
                <Database className="w-4 h-4 text-emerald-500" />
                <span className="hidden sm:inline">Supabase</span>
              </Button>
            )}

            {/* USUARIO EN TOPBAR */}
            {user && (
              <div className="flex items-center gap-2 pl-2 border-l border-border">
                <div className="w-8 h-8 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-xs border border-primary/20">
                  {(user.nombre || user.username || 'U').charAt(0).toUpperCase()}
                </div>
                <div className="hidden md:block leading-tight text-left">
                  <div className="text-xs font-semibold">{user.nombre || user.username}</div>
                  <div className="text-[10px] text-muted-foreground font-mono">@{user.username}</div>
                </div>
              </div>
            )}

            <Button
              variant="ghost"
              size="icon"
              onClick={toggle}
              title={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto overflow-x-hidden min-w-0">
          <Outlet />
        </main>
      </div>

      {/* MODAL CONFIGURACIÓN SUPABASE (Solo Administrador) */}
      {user?.rol === ROLES.ADMINISTRADOR && (
        <SupabaseConfigDialog open={supabaseOpen} onOpenChange={setSupabaseOpen} />
      )}
    </div>
  );
}