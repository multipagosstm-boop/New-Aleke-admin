import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClientInstance } from '@/lib/query-client';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { ROLES } from '@/lib/userStore';
import AccessDenied from '@/components/AccessDenied';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from "@/components/ProtectedRoute";
import ErrorBoundary from "@/components/ErrorBoundary";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import AdminLayout from "@/components/AdminLayout";
import Resumen from "@/pages/admin/Resumen";
import PlanCuentas from "@/pages/admin/PlanCuentas";
import LibroDiario from "@/pages/admin/LibroDiario";
import CargaMasiva from "@/pages/admin/CargaMasiva";
import Balance from "@/pages/admin/Balance";
import DetalleCuentas from "@/pages/admin/DetalleCuentas";
import Estados from "@/pages/admin/Estados";
import CuentasAhorro from "@/pages/admin/CuentasAhorro";
import Tarjetas from "@/pages/admin/Tarjetas";
import Extractos from "@/pages/admin/Extractos";
import MetasTarjetas from "@/pages/admin/MetasTarjetas";
import Clientes from "@/pages/admin/Clientes";
import AlekeRooftop from "@/pages/admin/AlekeRooftop";
import Pakredito from "@/pages/admin/Pakredito";
import Conciliacion from "@/pages/admin/Conciliacion";
import Asistente from "@/pages/admin/Asistente";
import AuditoriaCuadre from "@/pages/admin/AuditoriaCuadre";
import Usuarios from "@/pages/admin/Usuarios";

const RoleGatedRoute = ({ allowedRoles, moduleName, children }) => {
  const { user } = useAuth();
  const userRole = user?.rol || ROLES.AUXILIAR;
  if (!allowedRoles.includes(userRole)) {
    return <AccessDenied moduleName={moduleName} requiredRoles={allowedRoles} />;
  }
  return children;
};

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // Spinner mientras carga estado de autenticación
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  // Errores de autenticación
  if (authError && typeof authError === 'object') {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
          <Route element={<AdminLayout />}>
            <Route path="/" element={<Navigate to="/admin/contabilidad/resumen" replace />} />
            
            {/* Dashboard / Resumen (Todos los roles) */}
            <Route path="/admin/contabilidad/resumen" element={<Resumen />} />
            
            {/* Libro Diario (Todos los roles - auxiliar no puede anular ni eliminar) */}
            <Route path="/admin/contabilidad/libro-diario" element={<LibroDiario />} />
            
            {/* Módulos Financieros (Administrador y Contador) */}
            <Route 
              path="/admin/contabilidad/plan-cuentas" 
              element={
                <RoleGatedRoute allowedRoles={[ROLES.ADMINISTRADOR, ROLES.CONTADOR]} moduleName="Plan de Cuentas">
                  <PlanCuentas />
                </RoleGatedRoute>
              } 
            />
            <Route 
              path="/admin/contabilidad/carga-masiva" 
              element={
                <RoleGatedRoute allowedRoles={[ROLES.ADMINISTRADOR, ROLES.CONTADOR]} moduleName="Carga Masiva">
                  <CargaMasiva />
                </RoleGatedRoute>
              } 
            />
            <Route 
              path="/admin/contabilidad/balance" 
              element={
                <RoleGatedRoute allowedRoles={[ROLES.ADMINISTRADOR, ROLES.CONTADOR]} moduleName="Balance General">
                  <Balance />
                </RoleGatedRoute>
              } 
            />
            <Route 
              path="/admin/contabilidad/detalle-cuentas" 
              element={
                <RoleGatedRoute allowedRoles={[ROLES.ADMINISTRADOR, ROLES.CONTADOR, ROLES.AUXILIAR]} moduleName="Detalle de Cuentas">
                  <DetalleCuentas />
                </RoleGatedRoute>
              } 
            />
            <Route 
              path="/admin/contabilidad/estados" 
              element={
                <RoleGatedRoute allowedRoles={[ROLES.ADMINISTRADOR, ROLES.CONTADOR]} moduleName="Estados Financieros">
                  <Estados />
                </RoleGatedRoute>
              } 
            />
            <Route 
              path="/admin/contabilidad/auditoria-cuadre" 
              element={
                <RoleGatedRoute allowedRoles={[ROLES.ADMINISTRADOR, ROLES.CONTADOR]} moduleName="Auditoría de Cuadre">
                  <AuditoriaCuadre />
                </RoleGatedRoute>
              } 
            />
            <Route 
              path="/admin/financieros/metas-tarjetas" 
              element={
                <RoleGatedRoute allowedRoles={[ROLES.ADMINISTRADOR, ROLES.CONTADOR]} moduleName="Metas de Tarjetas">
                  <MetasTarjetas />
                </RoleGatedRoute>
              } 
            />

            {/* Módulo de Gestión de Usuarios y Roles (Exclusivo Administrador) */}
            <Route 
              path="/admin/usuarios" 
              element={
                <RoleGatedRoute allowedRoles={[ROLES.ADMINISTRADOR]} moduleName="Gestión de Usuarios y Roles">
                  <Usuarios />
                </RoleGatedRoute>
              } 
            />

            {/* Financieros & Operaciones (Todos los roles) */}
            <Route path="/admin/financieros/cuentas-ahorro" element={<CuentasAhorro />} />
            <Route path="/admin/financieros/tarjetas" element={<Tarjetas />} />
            <Route path="/admin/financieros/extractos" element={<Extractos />} />
            <Route path="/admin/conciliacion" element={<Conciliacion />} />
            <Route path="/admin/clientes" element={<Clientes />} />
            <Route path="/admin/asistente" element={<Asistente />} />

            {/* Líneas de Negocio (Todos los roles) */}
            <Route path="/admin/lineas/rooftop" element={<AlekeRooftop />} />
            <Route path="/admin/lineas/pakredito" element={<Pakredito />} />
          </Route>
        </Route>
        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </ErrorBoundary>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App;