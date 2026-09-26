import React, { useState, useEffect } from 'react';
import { 
  Users, 
  UserPlus, 
  ShieldCheck, 
  Edit3, 
  Trash2, 
  Lock, 
  Unlock, 
  CheckCircle2, 
  AlertCircle, 
  KeyRound, 
  Info,
  Clock,
  UserCheck
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter 
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';
import AccessDenied from '@/components/AccessDenied';
import { 
  getAllUsers, 
  createNewUser, 
  updateUser, 
  toggleUserStatus, 
  deleteUser, 
  ROLES, 
  ROLE_INFO 
} from '@/lib/userStore';

export default function Usuarios() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Dialog Crear Usuario
  const [createOpen, setCreateOpen] = useState(false);
  const [newNombre, setNewNombre] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRol, setNewRol] = useState(ROLES.AUXILIAR);
  const [newPassword, setNewPassword] = useState('');
  const [newConfirmPassword, setNewConfirmPassword] = useState('');
  const [newEstado, setNewEstado] = useState('activo');
  const [creating, setCreating] = useState(false);

  // Dialog Editar Usuario
  const [editOpen, setEditOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [editNombre, setEditNombre] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRol, setEditRol] = useState(ROLES.AUXILIAR);
  const [editEstado, setEditEstado] = useState('activo');
  const [editNewPassword, setEditNewPassword] = useState('');
  const [updating, setUpdating] = useState(false);

  // Alert Eliminar
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Cargar lista de usuarios
  const loadUsers = async () => {
    setLoading(true);
    try {
      const list = await getAllUsers();
      setUsers(list);
    } catch (err) {
      toast.error('Error al cargar la lista de usuarios: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();

    const handleUsersUpdated = () => {
      loadUsers();
    };

    window.addEventListener('aleke-users-updated', handleUsersUpdated);
    return () => {
      window.removeEventListener('aleke-users-updated', handleUsersUpdated);
    };
  }, []);

  // Control de acceso: solo Administrador
  if (currentUser?.rol !== ROLES.ADMINISTRADOR) {
    return <AccessDenied moduleName="Gestión de Usuarios y Roles" requiredRoles={[ROLES.ADMINISTRADOR]} />;
  }

  // Manejo Crear Usuario
  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!newNombre.trim() || !newUsername.trim() || !newPassword) {
      toast.error('Por favor completa todos los campos requeridos.');
      return;
    }

    if (newPassword !== newConfirmPassword) {
      toast.error('Las contraseñas no coinciden.');
      return;
    }

    if (newPassword.length < 4) {
      toast.error('La contraseña debe tener al menos 4 caracteres.');
      return;
    }

    setCreating(true);
    try {
      await createNewUser({
        nombre: newNombre.trim(),
        username: newUsername.trim(),
        email: newEmail.trim() || `${newUsername.trim().toLowerCase()}@aleke.com`,
        rol: newRol,
        password: newPassword,
        estado: newEstado,
      });

      toast.success(`Usuario @${newUsername.trim()} creado exitosamente con rol ${ROLE_INFO[newRol]?.label}.`);
      setCreateOpen(false);
      resetCreateForm();
      await loadUsers();
    } catch (err) {
      toast.error('Error al crear usuario: ' + err.message);
    } finally {
      setCreating(false);
    }
  };

  const resetCreateForm = () => {
    setNewNombre('');
    setNewUsername('');
    setNewEmail('');
    setNewRol(ROLES.AUXILIAR);
    setNewPassword('');
    setNewConfirmPassword('');
    setNewEstado('activo');
  };

  // Abrir modal de edición
  const openEditDialog = (u) => {
    setEditingUser(u);
    setEditNombre(u.nombre || '');
    setEditUsername(u.username || '');
    setEditEmail(u.email || '');
    setEditRol(u.rol || ROLES.AUXILIAR);
    setEditEstado(u.estado || 'activo');
    setEditNewPassword('');
    setEditOpen(true);
  };

  // Guardar edición
  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editingUser) return;

    if (!editNombre.trim() || !editUsername.trim()) {
      toast.error('Nombre y nombre de usuario no pueden estar vacíos.');
      return;
    }

    setUpdating(true);
    try {
      const updates = {
        nombre: editNombre.trim(),
        username: editUsername.trim(),
        email: editEmail.trim(),
        rol: editRol,
        estado: editEstado,
      };

      if (editNewPassword.trim()) {
        if (editNewPassword.trim().length < 4) {
          toast.error('La nueva contraseña debe tener al menos 4 caracteres.');
          setUpdating(false);
          return;
        }
        updates.password = editNewPassword.trim();
      }

      await updateUser(editingUser.id, updates);
      toast.success('Usuario actualizado correctamente.');
      setEditOpen(false);
      setEditingUser(null);
      await loadUsers();
    } catch (err) {
      toast.error('Error al actualizar usuario: ' + err.message);
    } finally {
      setUpdating(false);
    }
  };

  // Bloquear / Desbloquear usuario
  const handleToggleStatus = async (u) => {
    try {
      await toggleUserStatus(u.id);
      const nextStatus = u.estado === 'activo' ? 'bloqueado' : 'activo';
      toast.info(`Usuario @${u.username} ${nextStatus === 'activo' ? 'desbloqueado' : 'bloqueado'}.`);
      await loadUsers();
    } catch (err) {
      toast.error('Error: ' + err.message);
    }
  };

  // Eliminar usuario
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteUser(deleteTarget.id, currentUser.id);
      toast.success(`Usuario @${deleteTarget.username} eliminado correctamente.`);
      setDeleteTarget(null);
      await loadUsers();
    } catch (err) {
      toast.error('Error al eliminar: ' + err.message);
    } finally {
      setDeleting(false);
    }
  };

  // Métricas
  const totalCount = users.length;
  const adminCount = users.filter(u => u.rol === ROLES.ADMINISTRADOR).length;
  const contadorCount = users.filter(u => u.rol === ROLES.CONTADOR).length;
  const auxiliarCount = users.filter(u => u.rol === ROLES.AUXILIAR).length;
  const bloqueadosCount = users.filter(u => u.estado === 'bloqueado').length;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            <h1 className="text-2xl font-heading font-bold">Gestión de Usuarios y Roles</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Administra los roles del sistema: <strong className="text-purple-600">Administrador</strong>, <strong className="text-emerald-600">Contador</strong> y <strong className="text-blue-600">Auxiliar</strong>.
          </p>
        </div>

        <Button 
          onClick={() => { resetCreateForm(); setCreateOpen(true); }}
          className="bg-purple-600 hover:bg-purple-700 text-white gap-2 shadow-sm"
        >
          <UserPlus className="w-4 h-4" /> Nuevo Usuario
        </Button>
      </div>

      {/* METRIC CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="bg-card/70 border-border">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>Total Cuentas</span>
              <Users className="w-4 h-4" />
            </div>
            <div className="text-2xl font-bold font-heading">{totalCount}</div>
          </CardContent>
        </Card>

        <Card className="bg-purple-500/5 border-purple-500/20">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between text-xs text-purple-700 dark:text-purple-300 mb-1">
              <span>Administradores</span>
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div className="text-2xl font-bold font-heading text-purple-600 dark:text-purple-400">{adminCount}</div>
          </CardContent>
        </Card>

        <Card className="bg-emerald-500/5 border-emerald-500/20">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between text-xs text-emerald-700 dark:text-emerald-300 mb-1">
              <span>Contadores</span>
              <UserCheck className="w-4 h-4" />
            </div>
            <div className="text-2xl font-bold font-heading text-emerald-600 dark:text-emerald-400">{contadorCount}</div>
          </CardContent>
        </Card>

        <Card className="bg-blue-500/5 border-blue-500/20">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between text-xs text-blue-700 dark:text-blue-300 mb-1">
              <span>Auxiliares</span>
              <Users className="w-4 h-4" />
            </div>
            <div className="text-2xl font-bold font-heading text-blue-600 dark:text-blue-400">{auxiliarCount}</div>
          </CardContent>
        </Card>

        <Card className={bloqueadosCount > 0 ? "bg-destructive/5 border-destructive/20" : "bg-card/70 border-border"}>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>Bloqueados</span>
              <Lock className="w-4 h-4" />
            </div>
            <div className={`text-2xl font-bold font-heading ${bloqueadosCount > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
              {bloqueadosCount}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ROLES REFERENCE BOX */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="p-3.5 rounded-lg border border-purple-500/20 bg-purple-500/5 text-xs space-y-1">
          <div className="font-semibold text-purple-700 dark:text-purple-300 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" /> 1. Rol Administrador (Control Total)
          </div>
          <p className="text-muted-foreground">
            Acceso absoluto a todo el sistema. Único usuario con permiso para crear, modificar, bloquear y eliminar roles, así como configurar la conexión de Supabase.
          </p>
        </div>

        <div className="p-3.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 text-xs space-y-1">
          <div className="font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
            <UserCheck className="w-3.5 h-3.5" /> 2. Rol Contador (Módulos Financieros)
          </div>
          <p className="text-muted-foreground">
            Acceso a Plan de Cuentas, Balance, Auditoría de cuadre, Metas de tarjetas. Facultad para corregir y eliminar asientos contables, tarjetas, cuentas y créditos.
          </p>
        </div>

        <div className="p-3.5 rounded-lg border border-blue-500/20 bg-blue-500/5 text-xs space-y-1">
          <div className="font-semibold text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" /> 3. Rol Auxiliar (Operativo)
          </div>
          <p className="text-muted-foreground">
            Acceso al Libro Diario para crear registros contables, Dashboard, Líneas de Negocio, consulta de tarjetas y cuentas, productos por pagar, conciliación y cobros.
          </p>
        </div>
      </div>

      {/* USERS TABLE */}
      <div className="border border-border rounded-lg bg-card shadow-sm overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            <h3 className="font-heading font-semibold text-sm">Cuentas Registradas en el Sistema</h3>
          </div>
          <Badge variant="outline" className="text-xs font-mono">
            {users.length} {users.length === 1 ? 'usuario' : 'usuarios'}
          </Badge>
        </div>

        {loading ? (
          <div className="p-12 text-center text-muted-foreground">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            Cargando usuarios...
          </div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            No hay usuarios registrados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/40 text-xs text-muted-foreground uppercase border-b border-border">
                <tr>
                  <th className="py-3 px-4">Usuario</th>
                  <th className="py-3 px-4">Rol & Permisos</th>
                  <th className="py-3 px-4">Estado</th>
                  <th className="py-3 px-4">Último Acceso</th>
                  <th className="py-3 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.map((u) => {
                  const roleConfig = ROLE_INFO[u.rol] || { label: u.rol, badgeClass: '' };
                  const isCurrent = currentUser?.id === u.id;
                  const isBlocked = u.estado === 'bloqueado';

                  return (
                    <tr key={u.id} className={isBlocked ? "bg-destructive/5 opacity-80" : "hover:bg-muted/20"}>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-sm shrink-0 border border-primary/20">
                            {(u.nombre || u.username || 'U').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-medium flex items-center gap-1.5">
                              {u.nombre}
                              {isCurrent && (
                                <Badge variant="secondary" className="text-[10px] py-0 px-1.5">
                                  Tú
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground font-mono">
                              @{u.username} · {u.email}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="space-y-1">
                          <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${roleConfig.badgeClass}`}>
                            {u.rol === ROLES.ADMINISTRADOR && <ShieldCheck className="w-3 h-3" />}
                            {u.rol === ROLES.CONTADOR && <UserCheck className="w-3 h-3" />}
                            {u.rol === ROLES.AUXILIAR && <Users className="w-3 h-3" />}
                            {roleConfig.label}
                          </span>
                          <div className="text-[11px] text-muted-foreground truncate max-w-xs" title={roleConfig.description}>
                            {roleConfig.description}
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        {isBlocked ? (
                          <Badge variant="destructive" className="gap-1 text-xs">
                            <Lock className="w-3 h-3" /> Bloqueado
                          </Badge>
                        ) : (
                          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 gap-1 text-xs hover:bg-emerald-500/25">
                            <CheckCircle2 className="w-3 h-3" /> Activo
                          </Badge>
                        )}
                      </td>

                      <td className="py-3 px-4 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3 h-3" />
                          {u.ultimo_acceso ? new Date(u.ultimo_acceso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) : 'Sin registros'}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(u)}
                            title="Editar usuario y credenciales"
                            className="h-8 px-2"
                          >
                            <Edit3 className="w-3.5 h-3.5 mr-1" /> Editar
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleToggleStatus(u)}
                            title={isBlocked ? "Desbloquear usuario" : "Bloquear usuario"}
                            className={`h-8 px-2 ${isBlocked ? 'text-emerald-600 hover:text-emerald-700' : 'text-amber-600 hover:text-amber-700'}`}
                            disabled={isCurrent && u.rol === ROLES.ADMINISTRADOR}
                          >
                            {isBlocked ? (
                              <>
                                <Unlock className="w-3.5 h-3.5 mr-1" /> Activar
                              </>
                            ) : (
                              <>
                                <Lock className="w-3.5 h-3.5 mr-1" /> Bloquear
                              </>
                            )}
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteTarget(u)}
                            title="Eliminar usuario"
                            className="h-8 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                            disabled={isCurrent || (u.rol === ROLES.ADMINISTRADOR && adminCount <= 1)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL CREAR USUARIO */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-purple-600" />
              Crear Nuevo Usuario
            </DialogTitle>
            <DialogDescription>
              Asigna las credenciales y el rol de permisos para el nuevo miembro del equipo.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateSubmit} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="new-nombre" className="text-xs">Nombre Completo *</Label>
              <Input
                id="new-nombre"
                placeholder="ej. Isaias Perez"
                value={newNombre}
                onChange={(e) => setNewNombre(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="new-username" className="text-xs">Nombre de Usuario *</Label>
                <Input
                  id="new-username"
                  placeholder="ej. isaias15"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                  className="font-mono text-xs"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="new-rol" className="text-xs">Rol en el Sistema *</Label>
                <Select value={newRol} onValueChange={setNewRol}>
                  <SelectTrigger id="new-rol">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ROLES.ADMINISTRADOR}>1. Administrador</SelectItem>
                    <SelectItem value={ROLES.CONTADOR}>2. Contador</SelectItem>
                    <SelectItem value={ROLES.AUXILIAR}>3. Auxiliar</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="p-3 bg-muted/40 rounded-lg text-xs space-y-1 border border-border">
              <div className="font-semibold text-foreground flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-primary" /> Permisos del Rol Seleccionado:
              </div>
              <p className="text-muted-foreground">
                {ROLE_INFO[newRol]?.description}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new-email" className="text-xs">Correo Electrónico (Opcional)</Label>
              <Input
                id="new-email"
                type="email"
                placeholder="correo@ejemplo.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="new-password" className="text-xs">Contraseña *</Label>
                <Input
                  id="new-password"
                  type="password"
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="new-confirm-password" className="text-xs">Confirmar Contraseña *</Label>
                <Input
                  id="new-confirm-password"
                  type="password"
                  placeholder="••••••••"
                  value={newConfirmPassword}
                  onChange={(e) => setNewConfirmPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new-estado" className="text-xs">Estado Inicial</Label>
              <Select value={newEstado} onValueChange={setNewEstado}>
                <SelectTrigger id="new-estado">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="activo">Activo (acceso permitido)</SelectItem>
                  <SelectItem value="bloqueado">Bloqueado (acceso revocado)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-purple-600 hover:bg-purple-700 text-white" disabled={creating}>
                {creating ? 'Creando...' : 'Crear Usuario'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL EDITAR USUARIO */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit3 className="w-5 h-5 text-primary" />
              Editar Usuario @{editingUser?.username}
            </DialogTitle>
            <DialogDescription>
              Modifica los datos personales, rol de acceso o asigna una nueva contraseña.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleEditSubmit} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-nombre" className="text-xs">Nombre Completo *</Label>
              <Input
                id="edit-nombre"
                value={editNombre}
                onChange={(e) => setEditNombre(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-username" className="text-xs">Nombre de Usuario *</Label>
                <Input
                  id="edit-username"
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                  className="font-mono text-xs"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-rol" className="text-xs">Rol en el Sistema *</Label>
                <Select value={editRol} onValueChange={setEditRol}>
                  <SelectTrigger id="edit-rol">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ROLES.ADMINISTRADOR}>1. Administrador</SelectItem>
                    <SelectItem value={ROLES.CONTADOR}>2. Contador</SelectItem>
                    <SelectItem value={ROLES.AUXILIAR}>3. Auxiliar</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-email" className="text-xs">Correo Electrónico</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-estado" className="text-xs">Estado</Label>
                <Select value={editEstado} onValueChange={setEditEstado}>
                  <SelectTrigger id="edit-estado">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="activo">Activo</SelectItem>
                    <SelectItem value="bloqueado">Bloqueado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5 pt-2 border-t border-border">
              <div className="flex items-center justify-between">
                <Label htmlFor="edit-new-password" className="text-xs flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-muted-foreground" /> Nueva Contraseña
                </Label>
                <span className="text-[11px] text-muted-foreground">Opcional (dejar en blanco para mantener)</span>
              </div>
              <Input
                id="edit-new-password"
                type="password"
                placeholder="Ingresa nueva contraseña si deseas cambiarla"
                value={editNewPassword}
                onChange={(e) => setEditNewPassword(e.target.value)}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)} disabled={updating}>
                Cancelar
              </Button>
              <Button type="submit" disabled={updating}>
                {updating ? 'Guardando...' : 'Guardar Cambios'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ALERT DIALOG ELIMINAR */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="w-5 h-5" /> ¿Eliminar al usuario @{deleteTarget?.username}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. El usuario perderá el acceso al sistema inmediatamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDelete} 
              disabled={deleting} 
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              {deleting ? 'Eliminando...' : 'Sí, eliminar usuario'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
