import { getSupabase } from "@/api/supabaseClient";

export const ROLES = {
  ADMINISTRADOR: 'administrador',
  CONTADOR: 'contador',
  AUXILIAR: 'auxiliar',
};

export const ROLE_INFO = {
  [ROLES.ADMINISTRADOR]: {
    label: 'Administrador',
    description: 'Acceso total y control total a todo el sistema. Puede crear, modificar, bloquear o eliminar roles y usuarios, y configurar la conexión de Supabase.',
    badgeClass: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30',
    color: 'text-purple-600 dark:text-purple-400',
  },
  [ROLES.CONTADOR]: {
    label: 'Contador',
    description: 'Acceso a módulos financieros (Plan de cuentas, Balance, Auditoría de cuadre, Metas). Puede corregir y eliminar asientos contables, tarjetas, cuentas, préstamos y clientes.',
    badgeClass: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
    color: 'text-emerald-600 dark:text-emerald-400',
  },
  [ROLES.AUXILIAR]: {
    label: 'Auxiliar',
    description: 'Acceso a Libro Diario (registros), Dashboard, Líneas de negocio, consulta de estados de tarjetas, cuentas de ahorro, extractos/pagos, conciliación y cobros.',
    badgeClass: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30',
    color: 'text-blue-600 dark:text-blue-400',
  },
};

const STORAGE_USERS_KEY = 'aleke_rbac_users_v2';
const STORAGE_SESSION_KEY = 'aleke_active_session_v2';

// Hashea contraseñas usando SHA-256 nativo de Web Crypto API
export async function hashPassword(password, salt = 'aleke_salt_2026') {
  if (!password) return '';
  const text = `${salt}:${password}`;
  const msgBuffer = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Usuarios iniciales requeridos por el usuario
export const DEFAULT_PROVISIONAL_USERS = [
  {
    id: 'usr_admin_1',
    nombre: 'admin',
    username: 'admin1',
    email: 'admin@aleke.com',
    rol: ROLES.ADMINISTRADOR,
    estado: 'activo',
    raw_password_initial: 'iA1503',
    password_salt: 'salt_admin_1503',
    // SHA-256 precalculado para iA1503 con salt_admin_1503
    password_hash: '',
    creado_en: '2026-09-01T00:00:00.000Z',
    ultimo_acceso: null,
  },
  {
    id: 'usr_contador_1',
    nombre: 'Isaias',
    username: 'isaias15',
    email: 'isaias@aleke.com',
    rol: ROLES.CONTADOR,
    estado: 'activo',
    raw_password_initial: '4352845i',
    password_salt: 'salt_isaias_2845',
    password_hash: '',
    creado_en: '2026-09-01T00:00:00.000Z',
    ultimo_acceso: null,
  },
  {
    id: 'usr_auxiliar_1',
    nombre: 'Sandra',
    username: 'sandra1000',
    email: 'sandra@aleke.com',
    rol: ROLES.AUXILIAR,
    estado: 'activo',
    raw_password_initial: 'auxiliar001',
    password_salt: 'salt_sandra_1000',
    password_hash: '',
    creado_en: '2026-09-01T00:00:00.000Z',
    ultimo_acceso: null,
  },
];

// Inicializa las contraseñas hasheadas en memoria y persistencia
let initializedUsers = null;

export async function getInitialUsersWithHashes() {
  if (initializedUsers) return initializedUsers;
  const list = [];
  for (const u of DEFAULT_PROVISIONAL_USERS) {
    const hash = await hashPassword(u.raw_password_initial, u.password_salt);
    const { raw_password_initial, ...safeUser } = u;
    list.push({ ...safeUser, password_hash: hash });
  }
  initializedUsers = list;
  return list;
}

// Obtiene todos los usuarios desde localStorage / Supabase
export async function getAllUsers() {
  const defaults = await getInitialUsersWithHashes();
  if (typeof window === 'undefined') return defaults;

  const storedJson = localStorage.getItem(STORAGE_USERS_KEY);
  if (!storedJson) {
    localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(defaults));
    return defaults;
  }

  try {
    const parsed = JSON.parse(storedJson);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(defaults));
      return defaults;
    }
    // Asegurar que los 3 usuarios base existan siempre
    const existingUsernames = new Set(parsed.map(u => u.username?.toLowerCase()));
    let needsUpdate = false;
    for (const def of defaults) {
      if (!existingUsernames.has(def.username.toLowerCase())) {
        parsed.push(def);
        needsUpdate = true;
      }
    }
    if (needsUpdate) {
      localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(parsed));
    }
    return parsed;
  } catch (err) {
    console.warn('Error reading stored users:', err);
    return defaults;
  }
}

// Guarda usuarios en almacenamiento
export function saveUsers(users) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(users));
    window.dispatchEvent(new CustomEvent('aleke-users-updated', { detail: users }));
  }
}

// Encuentra un usuario por username o email
export async function findUserByCredentials(usernameOrEmail) {
  const clean = String(usernameOrEmail || '').trim().toLowerCase();
  if (!clean) return null;
  const users = await getAllUsers();
  return users.find(u => 
    (u.username && u.username.toLowerCase() === clean) ||
    (u.email && u.email.toLowerCase() === clean)
  ) || null;
}

// Autentica credenciales utilizando Supabase Auth y validación de roles RBAC
export async function authenticateViaSupabaseAuth(usernameOrEmail, password) {
  const cleanInput = String(usernameOrEmail || '').trim().toLowerCase();
  if (!cleanInput) throw new Error('Ingresa tu usuario o correo electrónico.');
  if (!password) throw new Error('Ingresa tu contraseña.');

  // 1. Resolver usuario local (para obtener rol, email y estado)
  const allUsers = await getAllUsers();
  let localUser = allUsers.find(u => 
    (u.username && u.username.toLowerCase() === cleanInput) ||
    (u.email && u.email.toLowerCase() === cleanInput)
  );

  if (localUser && localUser.estado === 'bloqueado') {
    throw new Error('Este usuario está bloqueado por el administrador. Contacte al soporte para reactivar el acceso.');
  }

  let emailToUse = '';
  if (cleanInput.includes('@')) {
    emailToUse = cleanInput;
  } else if (localUser?.email) {
    emailToUse = localUser.email;
  } else {
    emailToUse = `${cleanInput}@aleke.com`;
  }

  const client = getSupabase();
  let authUser = null;

  if (client?.auth) {
    try {
      // 1. Intentar login directo con Supabase Auth
      const { data, error } = await client.auth.signInWithPassword({
        email: emailToUse,
        password: password
      });

      if (!error && data?.user) {
        authUser = data.user;
      } else {
        // Si no se encuentra el usuario en Supabase Auth y coincide con cuenta local o provisional,
        // auto-registrarlo en Supabase Auth con sus metadatos de rol
        const isNotFound = error?.message?.toLowerCase().includes('invalid login credentials') ||
                           error?.message?.toLowerCase().includes('user not found');
        
        let validPassword = false;
        if (localUser) {
          const salt = localUser.password_salt || 'aleke_salt_2026';
          const expectedHash = await hashPassword(password, salt);
          validPassword = (expectedHash === localUser.password_hash);
        }

        if (isNotFound && localUser && validPassword) {
          const { data: signUpData, error: signUpError } = await client.auth.signUp({
            email: emailToUse,
            password: password,
            options: {
              data: {
                role: localUser.rol,
                username: localUser.username,
                full_name: localUser.nombre
              }
            }
          });

          if (!signUpError && signUpData?.user) {
            authUser = signUpData.user;
            // Si el signup no devolvió sesión directa, intentar re-login
            if (!signUpData.session) {
              const relogin = await client.auth.signInWithPassword({ email: emailToUse, password });
              if (relogin.data?.session) {
                authUser = relogin.data.user;
              }
            }
          }
        } else if (error && !localUser) {
          throw new Error(error.message || 'Credenciales incorrectas');
        }
      }
    } catch (authErr) {
      console.warn('Supabase Auth attempt warning:', authErr.message);
      if (!localUser) {
        throw authErr;
      }
    }
  }

  // 2. Si no pudimos conectar a Supabase Auth o no hay red, validar localmente
  if (!authUser) {
    if (!localUser) {
      throw new Error('Usuario o correo no encontrado en el sistema.');
    }
    const salt = localUser.password_salt || 'aleke_salt_2026';
    const computedHash = await hashPassword(password, salt);
    if (computedHash !== localUser.password_hash) {
      throw new Error('Contraseña incorrecta. Por favor verifica tus datos.');
    }
  }

  const assignedRole = authUser?.user_metadata?.role || 
                       authUser?.app_metadata?.role || 
                       localUser?.rol || 
                       (emailToUse.includes('admin') ? ROLES.ADMINISTRADOR : ROLES.AUXILIAR);

  const finalName = authUser?.user_metadata?.full_name || 
                    localUser?.nombre || 
                    cleanInput.split('@')[0];

  const finalUsername = authUser?.user_metadata?.username || 
                        localUser?.username || 
                        cleanInput.split('@')[0];

  const now = new Date().toISOString();
  const sessionUser = {
    id: authUser?.id || localUser?.id || `usr_${Date.now()}`,
    nombre: finalName,
    username: finalUsername,
    email: emailToUse,
    rol: assignedRole,
    estado: 'activo',
    ultimo_acceso: now,
    supabase_auth_id: authUser?.id || null,
  };

  // Actualizar último acceso en la lista local
  if (localUser) {
    localUser.ultimo_acceso = now;
    const updated = allUsers.map(u => u.id === localUser.id ? { ...u, ultimo_acceso: now } : u);
    saveUsers(updated);
  }

  // Actualizar / Upsert en tabla app_user de Supabase
  if (client && sessionUser.supabase_auth_id) {
    try {
      await client.from('app_user').upsert({
        id: sessionUser.supabase_auth_id,
        role: sessionUser.rol,
        updated_date: now
      });
    } catch (e) {
      console.warn('Sync to app_user warning:', e);
    }
  }

  saveActiveSession(sessionUser);
  return sessionUser;
}

// Compatibilidad
export const authenticateCredentials = authenticateViaSupabaseAuth;

// Manejo de sesión activa
export function getActiveSession() {
  if (typeof window === 'undefined') return null;
  const sessionJson = localStorage.getItem(STORAGE_SESSION_KEY);
  if (!sessionJson) {
    // Si no hay sesión, dejamos que inicie sesión o asignamos por defecto al admin provisional
    return null;
  }
  try {
    return JSON.parse(sessionJson);
  } catch {
    return null;
  }
}

export function saveActiveSession(sessionUser) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(sessionUser));
    window.dispatchEvent(new CustomEvent('aleke-session-updated', { detail: sessionUser }));
  }
}

export function clearActiveSession() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_SESSION_KEY);
    window.dispatchEvent(new CustomEvent('aleke-session-updated', { detail: null }));
  }
}

// Operaciones de gestión de usuarios (exclusivas del Administrador)
export async function createNewUser({ nombre, username, email, rol, password, estado = 'activo' }) {
  const cleanUsername = String(username || '').trim().toLowerCase();
  if (!cleanUsername) throw new Error('El nombre de usuario es obligatorio.');
  if (!password || password.length < 4) throw new Error('La contraseña debe tener al menos 4 caracteres.');
  if (!Object.values(ROLES).includes(rol)) throw new Error('El rol especificado no es válido.');

  const users = await getAllUsers();
  const exists = users.some(u => u.username?.toLowerCase() === cleanUsername);
  if (exists) {
    throw new Error(`El nombre de usuario "${cleanUsername}" ya se encuentra registrado.`);
  }

  const salt = `salt_${cleanUsername}_${Date.now()}`;
  const hash = await hashPassword(password, salt);

  const newUser = {
    id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    nombre: String(nombre || cleanUsername).trim(),
    username: cleanUsername,
    email: email ? String(email).trim().toLowerCase() : `${cleanUsername}@aleke.com`,
    rol,
    estado: estado === 'bloqueado' ? 'bloqueado' : 'activo',
    password_hash: hash,
    password_salt: salt,
    creado_en: new Date().toISOString(),
    ultimo_acceso: null,
  };

  users.push(newUser);
  saveUsers(users);

  // Intentar sincronizar con Supabase si está disponible
  try {
    const client = getSupabase();
    if (client) {
      await client.from('app_user').upsert({
        id: newUser.id,
        role: newUser.rol,
        updated_date: new Date().toISOString()
      });
    }
  } catch (e) {
    console.warn('Sync user to Supabase warning:', e);
  }

  return newUser;
}

export async function updateUser(id, updates) {
  const users = await getAllUsers();
  const index = users.findIndex(u => u.id === id);
  if (index === -1) throw new Error('Usuario no encontrado.');

  const existing = users[index];

  // Si se cambia el username, verificar que no choque con otro
  if (updates.username && updates.username.toLowerCase() !== existing.username.toLowerCase()) {
    const cleanUsername = updates.username.trim().toLowerCase();
    const clash = users.some(u => u.id !== id && u.username?.toLowerCase() === cleanUsername);
    if (clash) throw new Error(`El nombre de usuario "${cleanUsername}" ya está en uso.`);
    existing.username = cleanUsername;
  }

  if (updates.nombre !== undefined) existing.nombre = String(updates.nombre).trim();
  if (updates.email !== undefined) existing.email = String(updates.email).trim().toLowerCase();
  if (updates.rol && Object.values(ROLES).includes(updates.rol)) {
    // Protección: no degradar al último administrador
    if (existing.rol === ROLES.ADMINISTRADOR && updates.rol !== ROLES.ADMINISTRADOR) {
      const adminCount = users.filter(u => u.rol === ROLES.ADMINISTRADOR && u.estado === 'activo').length;
      if (adminCount <= 1) {
        throw new Error('No se puede cambiar el rol: el sistema debe contar con al menos un administrador activo.');
      }
    }
    existing.rol = updates.rol;
  }
  if (updates.estado) {
    if (existing.rol === ROLES.ADMINISTRADOR && updates.estado === 'bloqueado') {
      const activeAdmins = users.filter(u => u.rol === ROLES.ADMINISTRADOR && u.estado === 'activo' && u.id !== id);
      if (activeAdmins.length === 0) {
        throw new Error('No se puede bloquear al único administrador activo del sistema.');
      }
    }
    existing.estado = updates.estado;
  }

  // Si se envió nueva contraseña
  if (updates.password) {
    if (updates.password.length < 4) throw new Error('La contraseña debe tener al menos 4 caracteres.');
    const salt = existing.password_salt || `salt_${existing.username}_${Date.now()}`;
    existing.password_salt = salt;
    existing.password_hash = await hashPassword(updates.password, salt);
  }

  users[index] = existing;
  saveUsers(users);

  // Actualizar sesión activa si el usuario editado es el actual
  const currentSession = getActiveSession();
  if (currentSession && currentSession.id === id) {
    saveActiveSession({
      ...currentSession,
      nombre: existing.nombre,
      username: existing.username,
      email: existing.email,
      rol: existing.rol,
      estado: existing.estado,
    });
  }

  return existing;
}

export async function toggleUserStatus(id) {
  const users = await getAllUsers();
  const user = users.find(u => u.id === id);
  if (!user) throw new Error('Usuario no encontrado.');

  const nextStatus = user.estado === 'activo' ? 'bloqueado' : 'activo';
  return updateUser(id, { estado: nextStatus });
}

export async function deleteUser(id, currentUserId) {
  if (id === currentUserId) {
    throw new Error('No puedes eliminar tu propia cuenta de usuario en sesión.');
  }

  const users = await getAllUsers();
  const target = users.find(u => u.id === id);
  if (!target) throw new Error('Usuario no encontrado.');

  if (target.rol === ROLES.ADMINISTRADOR) {
    const adminCount = users.filter(u => u.rol === ROLES.ADMINISTRADOR).length;
    if (adminCount <= 1) {
      throw new Error('No se puede eliminar el único administrador del sistema.');
    }
  }

  const filtered = users.filter(u => u.id !== id);
  saveUsers(filtered);

  try {
    const client = getSupabase();
    if (client) {
      await client.from('app_user').delete().eq('id', id);
    }
  } catch (e) {
    console.warn('Delete user from Supabase warning:', e);
  }

  return true;
}

// Matriz de permisos por Rol
export function checkPermission(user, action) {
  if (!user) return false;
  const rol = user.rol || ROLES.AUXILIAR;

  // 1. El ADMINISTRADOR tiene acceso total y control total a todo el sistema
  if (rol === ROLES.ADMINISTRADOR) return true;

  // 2. El CONTADOR
  if (rol === ROLES.CONTADOR) {
    switch (action) {
      case 'manage_users': // Exclusivo de administrador
      case 'configure_supabase': // Exclusivo de administrador
      case 'permanent_delete_entries': // Exclusivo de administrador (depuración permanente)
      case 'system_settings':
        return false;
      case 'access_financials': // Plan de cuentas, balance, auditoría de cuadre, metas
      case 'edit_delete_entries': // Anular y corregir asientos contables
      case 'edit_delete_products': // Eliminar o editar tarjetas, cuentas de ahorro, préstamos, abonos
      case 'create_entries':
      case 'view_dashboard':
      case 'view_business_lines':
      case 'view_cards_accounts':
      case 'access_conciliacion':
      case 'access_clientes':
        return true;
      default:
        return true;
    }
  }

  // 3. El AUXILIAR
  if (rol === ROLES.AUXILIAR) {
    switch (action) {
      case 'manage_users': // Denegado
      case 'configure_supabase': // Denegado
      case 'permanent_delete_entries': // Denegado
      case 'system_settings': // Denegado
      case 'access_financials': // Denegado (No plan de cuentas, no balance, no auditoría, no metas)
      case 'edit_delete_entries': // Denegado (no puede eliminar asientos)
      case 'edit_delete_products': // Denegado (no puede eliminar tarjetas/cuentas/préstamos)
        return false;
      case 'create_entries': // Sí puede registrar en libro diario
      case 'view_dashboard': // Sí tiene acceso al dashboard
      case 'view_business_lines': // Sí tiene acceso a las líneas de negocio (Rooftop, Pakredito)
      case 'view_cards_accounts': // Sí puede consultar el estado de tarjetas y cuentas
      case 'access_conciliacion': // Sí puede conciliar extractos
      case 'access_clientes': // Sí puede consultar información de clientes
        return true;
      default:
        return false;
    }
  }

  return false;
}
