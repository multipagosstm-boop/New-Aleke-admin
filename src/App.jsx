import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import { Navigate } from "react-router-dom";
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
import Estados from "@/pages/admin/Estados";
import CuentasAhorro from "@/pages/admin/CuentasAhorro";
import Tarjetas from "@/pages/admin/Tarjetas";
import Extractos from "@/pages/admin/Extractos";
import MetasTarjetas from "@/pages/admin/MetasTarjetas";
import Clientes from "@/pages/admin/Clientes";
import AlekeRooftop from "@/pages/admin/AlekeRooftop";
import Pakredito from "@/pages/admin/Pakredito";
import Emprendamos from "@/pages/admin/Emprendamos";
import Conciliacion from "@/pages/admin/Conciliacion";
import Asistente from "@/pages/admin/Asistente";
import AuditoriaCuadre from "@/pages/admin/AuditoriaCuadre";

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
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
            <Route path="/admin/contabilidad/resumen" element={<Resumen />} />
            <Route path="/admin/contabilidad/plan-cuentas" element={<PlanCuentas />} />
            <Route path="/admin/contabilidad/libro-diario" element={<LibroDiario />} />
            <Route path="/admin/contabilidad/carga-masiva" element={<CargaMasiva />} />
            <Route path="/admin/contabilidad/balance" element={<Balance />} />
            <Route path="/admin/contabilidad/estados" element={<Estados />} />
            <Route path="/admin/contabilidad/auditoria-cuadre" element={<AuditoriaCuadre />} />
            <Route path="/admin/financieros/cuentas-ahorro" element={<CuentasAhorro />} />
            <Route path="/admin/financieros/tarjetas" element={<Tarjetas />} />
            <Route path="/admin/financieros/extractos" element={<Extractos />} />
            <Route path="/admin/financieros/metas-tarjetas" element={<MetasTarjetas />} />
            <Route path="/admin/clientes" element={<Clientes />} />
            <Route path="/admin/lineas/rooftop" element={<AlekeRooftop />} />
            <Route path="/admin/lineas/pakredito" element={<Pakredito />} />
            <Route path="/admin/lineas/emprendamos" element={<Emprendamos />} />
            <Route path="/admin/conciliacion" element={<Conciliacion />} />
            <Route path="/admin/asistente" element={<Asistente />} />
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
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App