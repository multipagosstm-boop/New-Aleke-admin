import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { 
  getActiveSession, 
  saveActiveSession, 
  clearActiveSession, 
  authenticateViaSupabaseAuth, 
  checkPermission, 
  getInitialUsersWithHashes,
  ROLES,
  getAllUsers
} from './userStore';
import { getSupabase } from '@/api/supabaseClient';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  // Inicializa el sistema de usuarios y la sesión
  const initAuth = useCallback(async () => {
    setIsLoadingAuth(true);
    try {
      // 1. Inicializar usuarios por defecto con hashes
      await getInitialUsersWithHashes();

      const client = getSupabase();
      let currentSession = getActiveSession();

      // 2. Verificar si hay sesión activa en Supabase Auth
      if (client?.auth) {
        try {
          const { data: { session } } = await client.auth.getSession();
          if (session?.user) {
            const sbUser = session.user;
            const all = await getAllUsers();
            const matchedLocal = all.find(u => 
              (u.email && u.email.toLowerCase() === sbUser.email?.toLowerCase()) ||
              (u.username && u.username.toLowerCase() === sbUser.user_metadata?.username?.toLowerCase())
            );

            const role = sbUser.user_metadata?.role || 
                         sbUser.app_metadata?.role || 
                         matchedLocal?.rol || 
                         ROLES.ADMINISTRADOR;

            currentSession = {
              id: sbUser.id,
              nombre: sbUser.user_metadata?.full_name || matchedLocal?.nombre || sbUser.email?.split('@')[0],
              username: sbUser.user_metadata?.username || matchedLocal?.username || sbUser.email?.split('@')[0],
              email: sbUser.email,
              rol: role,
              estado: 'activo',
              supabase_auth_id: sbUser.id
            };
            saveActiveSession(currentSession);
          }
        } catch (e) {
          console.warn('Supabase getSession check warning:', e);
        }
      }

      // Si no hay sesión previa, iniciar con el usuario Administrador por defecto
      if (!currentSession) {
        const users = await getAllUsers();
        const defaultAdmin = users.find(u => u.rol === ROLES.ADMINISTRADOR && u.estado === 'activo') || users[0];
        if (defaultAdmin) {
          currentSession = {
            id: defaultAdmin.id,
            nombre: defaultAdmin.nombre,
            username: defaultAdmin.username,
            email: defaultAdmin.email,
            rol: defaultAdmin.rol,
            estado: defaultAdmin.estado,
          };
          saveActiveSession(currentSession);
        }
      }

      if (currentSession && currentSession.estado !== 'bloqueado') {
        setUser(currentSession);
        setIsAuthenticated(true);
      } else {
        setUser(null);
        setIsAuthenticated(false);
      }
    } catch (err) {
      console.warn('Auth initialization error:', err);
      setAuthError(err);
    } finally {
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  }, []);

  useEffect(() => {
    initAuth();

    // Escuchar eventos de sesión local
    const handleSessionUpdated = (e) => {
      const sessionUser = e.detail;
      if (sessionUser && sessionUser.estado !== 'bloqueado') {
        setUser(sessionUser);
        setIsAuthenticated(true);
      } else {
        setUser(null);
        setIsAuthenticated(false);
      }
    };

    window.addEventListener('aleke-session-updated', handleSessionUpdated);

    // Escuchar cambios de estado directamente en Supabase Auth
    const client = getSupabase();
    let authListener = null;
    if (client?.auth) {
      const { data } = client.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          const sbUser = session.user;
          const role = sbUser.user_metadata?.role || sbUser.app_metadata?.role || ROLES.ADMINISTRADOR;
          const sessionUser = {
            id: sbUser.id,
            nombre: sbUser.user_metadata?.full_name || sbUser.email?.split('@')[0],
            username: sbUser.user_metadata?.username || sbUser.email?.split('@')[0],
            email: sbUser.email,
            rol: role,
            estado: 'activo',
            supabase_auth_id: sbUser.id
          };
          setUser(sessionUser);
          setIsAuthenticated(true);
          saveActiveSession(sessionUser);
        } else if (event === 'SIGNED_OUT') {
          clearActiveSession();
          setUser(null);
          setIsAuthenticated(false);
        }
      });
      authListener = data?.subscription;
    }

    return () => {
      window.removeEventListener('aleke-session-updated', handleSessionUpdated);
      authListener?.unsubscribe();
    };
  }, [initAuth]);

  // Login mediante usuario/correo y contraseña con Supabase Auth
  const login = async (usernameOrEmail, password) => {
    setIsLoadingAuth(true);
    setAuthError(null);
    try {
      const sessionUser = await authenticateViaSupabaseAuth(usernameOrEmail, password);
      setUser(sessionUser);
      setIsAuthenticated(true);
      return sessionUser;
    } catch (err) {
      setAuthError(err.message);
      throw err;
    } finally {
      setIsLoadingAuth(false);
    }
  };

  // Cierre de sesión seguro en Supabase Auth y local
  const logout = async () => {
    try {
      const client = getSupabase();
      if (client?.auth) {
        await client.auth.signOut().catch(() => {});
      }
    } catch (e) {
      console.warn('Sign out warning:', e);
    }
    clearActiveSession();
    setUser(null);
    setIsAuthenticated(false);
  };

  // Ayudante para verificar roles
  const hasRole = (...allowedRoles) => {
    if (!user) return false;
    return allowedRoles.includes(user.rol);
  };

  // Ayudante de permisos granulares
  const can = (action) => {
    return checkPermission(user, action);
  };

  const navigateToLogin = () => {
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      authChecked,
      login,
      logout,
      hasRole,
      can,
      navigateToLogin,
      checkUserAuth: initAuth,
      checkAppState: initAuth,
      ROLES
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
