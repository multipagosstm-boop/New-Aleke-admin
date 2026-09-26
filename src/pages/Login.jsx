import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogIn, User, Lock, Loader2, ShieldCheck, UserCheck, Users, KeyRound, AlertCircle } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { safeReturnTo } from "@/lib/authReturnTo";

const PROVISIONAL_ACCOUNTS = [
  {
    label: "admin1",
    name: "admin",
    role: "administrador",
    roleLabel: "Administrador",
    password: "iA1503",
    color: "border-purple-500/30 hover:border-purple-500 bg-purple-500/5 text-purple-700 dark:text-purple-300",
    icon: ShieldCheck,
  },
  {
    label: "isaias15",
    name: "Isaias",
    role: "contador",
    roleLabel: "Contador",
    password: "4352845i",
    color: "border-emerald-500/30 hover:border-emerald-500 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300",
    icon: UserCheck,
  },
  {
    label: "sandra1000",
    name: "Sandra",
    role: "auxiliar",
    roleLabel: "Auxiliar",
    password: "auxiliar001",
    color: "border-blue-500/30 hover:border-blue-500 bg-blue-500/5 text-blue-700 dark:text-blue-300",
    icon: Users,
  },
];

export default function Login() {
  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const returnTo = safeReturnTo();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(usernameOrEmail, password);
      navigate(returnTo !== "/login" ? returnTo : "/admin/contabilidad/resumen");
    } catch (err) {
      setError(err.message || "Usuario o contraseña inválidos");
    } finally {
      setLoading(false);
    }
  };

  const handleQuickFill = (acc) => {
    setUsernameOrEmail(acc.label);
    setPassword(acc.password);
    setError("");
  };

  return (
    <AuthLayout
      icon={LogIn}
      title="Aleke System"
      subtitle="Ingresa con tu usuario y contraseña asignados"
      footer={
        <div className="text-xs text-muted-foreground text-center">
          Control de acceso y auditoría contable · Aleke Admin
        </div>
      }
    >
      {/* QUICK ACCOUNT SELECTOR */}
      <div className="mb-6 space-y-2">
        <div className="text-xs font-semibold text-muted-foreground flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <KeyRound className="w-3.5 h-3.5 text-primary" /> Cuentas Provisionalmente Habilitadas:
          </span>
          <span className="text-[10px] text-muted-foreground">Clic para autocompletar</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {PROVISIONAL_ACCOUNTS.map((acc) => (
            <button
              key={acc.label}
              type="button"
              onClick={() => handleQuickFill(acc)}
              className={`p-2 rounded-lg border text-left transition-all text-xs flex flex-col justify-between ${acc.color}`}
            >
              <div className="flex items-center justify-between font-semibold">
                <span className="truncate">{acc.name}</span>
                <acc.icon className="w-3.5 h-3.5 shrink-0" />
              </div>
              <div className="mt-1 font-mono text-[10px] opacity-80">@{acc.label}</div>
              <div className="text-[10px] mt-0.5 font-medium">{acc.roleLabel}</div>
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="username" className="text-xs font-medium">Usuario o Correo Electrónico</Label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="username"
              type="text"
              autoComplete="username"
              autoFocus
              placeholder="ej. admin1, isaias15, sandra1000"
              value={usernameOrEmail}
              onChange={(e) => setUsernameOrEmail(e.target.value)}
              className="pl-10 h-11 text-sm font-mono"
              required
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password" className="text-xs font-medium">Contraseña</Label>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-10 h-11 text-sm"
              required
            />
          </div>
        </div>

        <Button type="submit" className="w-full h-11 font-medium bg-primary hover:bg-primary/90 text-primary-foreground gap-2" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Verificando credenciales...
            </>
          ) : (
            <>
              <LogIn className="w-4 h-4" />
              Iniciar Sesión
            </>
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
