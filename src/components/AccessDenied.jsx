import React from 'react';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/AuthContext';
import { ROLE_INFO } from '@/lib/userStore';

export default function AccessDenied({ moduleName = "este módulo", requiredRoles = ["administrador"] }) {
  const { user } = useAuth();
  const currentRoleInfo = ROLE_INFO[user?.rol] || { label: user?.rol || 'Usuario' };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
      <div className="w-16 h-16 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mb-4">
        <ShieldAlert className="w-8 h-8" />
      </div>
      <h2 className="text-2xl font-heading font-bold mb-2">Acceso Restringido</h2>
      <p className="text-muted-foreground max-w-md mb-4 text-sm">
        Tu rol actual (<span className="font-semibold text-foreground">{currentRoleInfo.label}</span>) no cuenta con autorización para acceder a {moduleName}.
      </p>
      <div className="p-3 bg-muted/40 rounded-lg text-xs text-muted-foreground mb-6 max-w-md">
        Módulos autorizados para: {requiredRoles.map(r => ROLE_INFO[r]?.label || r).join(', ')}.
      </div>
      <Link to="/admin/contabilidad/resumen">
        <Button className="gap-2">
          <ArrowLeft className="w-4 h-4" /> Volver al Resumen Principal
        </Button>
      </Link>
    </div>
  );
}
