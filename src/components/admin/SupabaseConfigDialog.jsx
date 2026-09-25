import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getSupabaseCredentials, saveSupabaseCredentials, getSupabase, normalizeSupabaseUrl, normalizeSupabaseKey } from '@/api/supabaseClient';
import { Database, CheckCircle2, AlertCircle, Copy, Check, ExternalLink, RefreshCw, Download, FileText, ShieldAlert, BookOpen } from 'lucide-react';
import { toast } from 'sonner';

function downloadSql(content, filename) {
  if (!content) return;
  const blob = new Blob([content], { type: 'text/sql' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast.success(`Descargado ${filename}`);
}

export default function SupabaseConfigDialog({ open, onOpenChange }) {
  const [url, setUrl] = useState('');
  const [anonKey, setAnonKey] = useState('');
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState(null); // 'success' | 'warning' | 'error' | null
  const [statusMessage, setStatusMessage] = useState('');
  const [tableStats, setTableStats] = useState({});
  const [schemaSql, setSchemaSql] = useState('');
  const [seedSql, setSeedSql] = useState('');
  const [fixRlsSql, setFixRlsSql] = useState('');
  const [comprobantesSql, setComprobantesSql] = useState('');
  const [copiedSchema, setCopiedSchema] = useState(false);
  const [copiedSeed, setCopiedSeed] = useState(false);
  const [copiedFix, setCopiedFix] = useState(false);
  const [copiedComps, setCopiedComps] = useState(false);

  useEffect(() => {
    if (open) {
      const creds = getSupabaseCredentials();
      setUrl(creds.url || '');
      setAnonKey(creds.anonKey || '');
      
      fetch('/supabase/schema.sql')
        .then(res => res.text())
        .then(text => setSchemaSql(text))
        .catch(() => {});
      fetch('/supabase/seed.sql')
        .then(res => res.text())
        .then(text => setSeedSql(text))
        .catch(() => {});
      fetch('/supabase/fix_permissions.sql')
        .then(res => res.text())
        .then(text => setFixRlsSql(text))
        .catch(() => {});
      fetch('/supabase/comprobantes_puc_seed.sql')
        .then(res => res.text())
        .then(text => setComprobantesSql(text))
        .catch(() => {});

      if (creds.url && creds.anonKey) {
        runDiagnostics(creds.url, creds.anonKey);
      }
    }
  }, [open]);

  const runDiagnostics = async (customUrl = url, customKey = anonKey) => {
    const cleanUrl = normalizeSupabaseUrl(customUrl);
    const cleanKey = normalizeSupabaseKey(customKey);

    if (!cleanUrl || !cleanKey) {
      toast.error('Por favor ingresa la URL y la Anon Key de Supabase');
      return;
    }

    setUrl(cleanUrl);
    setAnonKey(cleanKey);
    setTesting(true);
    setStatus(null);
    const stats = {};

    try {
      saveSupabaseCredentials(cleanUrl, cleanKey);
      const client = getSupabase();
      if (!client) throw new Error('No se pudo inicializar el cliente de Supabase');

      const tablesToCheck = [
        { name: 'cliente', label: 'Clientes' },
        { name: 'cuenta', label: 'Cuentas PUC' },
        { name: 'prestamo', label: 'Préstamos' },
        { name: 'producto_credito', label: 'Tarjetas / Créditos' },
        { name: 'contrato_arriendo', label: 'Arriendos Rooftop' },
        { name: 'comprobante_contable', label: 'Comprobantes' },
        { name: 'movimiento_contable', label: 'Movimientos' }
      ];

      let totalFound = 0;
      let hasRlsOrPermError = false;
      let hasInvalidPathError = false;

      for (const t of tablesToCheck) {
        try {
          const { data, count, error } = await client
            .from(t.name)
            .select('*', { count: 'exact' })
            .limit(1);

          if (error) {
            stats[t.name] = { label: t.label, status: 'error', message: error.message };
            if (error.message?.includes('Invalid path specified in request URL') || error.code === '404') {
              hasInvalidPathError = true;
            } else if (error.code === '42501' || error.message?.includes('permission denied') || error.message?.includes('row-level security')) {
              hasRlsOrPermError = true;
            }
          } else {
            const countNum = count ?? (data ? data.length : 0);
            stats[t.name] = { label: t.label, status: 'ok', count: countNum };
            totalFound += countNum;
          }
        } catch (err) {
          stats[t.name] = { label: t.label, status: 'error', message: err.message };
          if (err.message?.includes('Invalid path specified in request URL')) {
            hasInvalidPathError = true;
          }
        }
      }

      setTableStats(stats);

      if (hasInvalidPathError) {
        setStatus('error');
        setStatusMessage(`Error: "Invalid path specified in request URL". La URL del proyecto debe ser únicamente la raíz: https://${cleanUrl.replace(/^https?:\/\//, '').split('/')[0]} (sin /rest/v1). La hemos limpiado automáticamente. Haz clic en "Probar Conexión" nuevamente.`);
        toast.error('Ruta de URL no válida en Supabase');
      } else if (hasRlsOrPermError) {
        setStatus('warning');
        setStatusMessage('Supabase está conectado, pero las políticas RLS o permisos están bloqueando la lectura anónima. Ve a la pestaña "Solución Permisos (RLS)" para corregirlo en 1 clic.');
        toast.warning('Permisos RLS bloqueando datos');
      } else if (stats['comprobante_contable']?.count === 0) {
        setStatus('warning');
        setStatusMessage('Conexión exitosa, pero la tabla "comprobante_contable" aún tiene 0 registros. Ve a la pestaña "Comprobantes & PUC", copia el script y ejecútalo en Supabase SQL Editor para cargar los 43 comprobantes y 116 cuentas.');
        toast.warning('Comprobantes vacíos en Supabase');
      } else {
        setStatus('success');
        setStatusMessage(`¡Éxito! Se detectaron ${totalFound} registros entre las tablas principales en Supabase. Haz clic en "Recargar y Sincronizar App" para ver los datos.`);
        toast.success('Datos verificados en Supabase');
      }
    } catch (err) {
      const errMsg = err.message || '';
      setStatus('error');
      if (errMsg.includes('Invalid path specified in request URL')) {
        setStatusMessage(`Error: "Invalid path specified in request URL". La URL debe ser https://<tu-id>.supabase.co (sin /rest/v1 ni subrutas).`);
      } else {
        setStatusMessage(`Error de conexión: ${errMsg}`);
      }
      toast.error('Error al conectar con Supabase');
    } finally {
      setTesting(false);
    }
  };

  const handleSaveAndTest = async () => {
    await runDiagnostics(url, anonKey);
  };

  const handleReload = () => {
    saveSupabaseCredentials(url.trim(), anonKey.trim());
    toast.info('Recargando aplicación...');
    setTimeout(() => {
      window.location.reload();
    }, 300);
  };

  const handleCopy = (text, type) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    if (type === 'schema') {
      setCopiedSchema(true);
      setTimeout(() => setCopiedSchema(false), 2000);
    } else if (type === 'seed') {
      setCopiedSeed(true);
      setTimeout(() => setCopiedSeed(false), 2000);
    } else if (type === 'fix') {
      setCopiedFix(true);
      setTimeout(() => setCopiedFix(false), 2000);
    } else {
      setCopiedComps(true);
      setTimeout(() => setCopiedComps(false), 2000);
    }
    toast.success('Script SQL copiado al portapapeles');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="w-5 h-5 text-emerald-500" />
            Configuración & Diagnóstico de Supabase
          </DialogTitle>
          <DialogDescription>
            Verifica el estado de tus tablas, soluciona permisos RLS y carga los comprobantes contables.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="credenciales" className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid grid-cols-5 mb-3">
            <TabsTrigger value="credenciales">1. Diagnóstico</TabsTrigger>
            <TabsTrigger value="comprobantes" className="text-emerald-700 dark:text-emerald-400 font-medium">
              📄 Comprobantes & PUC
            </TabsTrigger>
            <TabsTrigger value="fix" className="text-amber-600 dark:text-amber-400 font-medium">
              ⚡ Permisos RLS
            </TabsTrigger>
            <TabsTrigger value="seed">Datos Base (Seed)</TabsTrigger>
            <TabsTrigger value="schema">Tablas (Schema)</TabsTrigger>
          </TabsList>

          {/* TAB 1: CREDENCIALES & DIAGNÓSTICO */}
          <TabsContent value="credenciales" className="space-y-4 flex-1 overflow-y-auto pr-1">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="supabase-url" className="text-xs">Project URL (Supabase URL)</Label>
                <Input
                  id="supabase-url"
                  placeholder="https://xyzcompany.supabase.co"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onBlur={(e) => setUrl(normalizeSupabaseUrl(e.target.value))}
                  className="font-mono text-xs"
                />
                <p className="text-[11px] text-muted-foreground">
                  Formato: <strong>https://[id-proyecto].supabase.co</strong> (sin <code>/rest/v1</code>).
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="supabase-key" className="text-xs">Anon Public Key</Label>
                <Input
                  id="supabase-key"
                  type="password"
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  value={anonKey}
                  onChange={(e) => setAnonKey(e.target.value)}
                  className="font-mono text-xs"
                />
                <p className="text-[11px] text-muted-foreground">
                  Encuéntrala en <strong>Project Settings → API → anon public</strong>
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <Button onClick={handleSaveAndTest} disabled={testing} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5">
                {testing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
                {testing ? 'Comprobando tablas...' : 'Probar Conexión y Diagnosticar'}
              </Button>

              <Button onClick={handleReload} variant="outline" className="border-emerald-600/40 text-emerald-700 dark:text-emerald-300 gap-1.5">
                <RefreshCw className="w-4 h-4" />
                Recargar y Sincronizar App
              </Button>
            </div>

            {/* STATUS BANNER */}
            {status === 'success' && (
              <div className="p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-2.5 text-xs text-emerald-800 dark:text-emerald-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <div>{statusMessage}</div>
              </div>
            )}

            {status === 'warning' && (
              <div className="p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200">
                <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>{statusMessage}</div>
              </div>
            )}

            {status === 'error' && (
              <div className="p-3.5 rounded-lg bg-destructive/10 border border-destructive/30 flex items-start gap-2.5 text-xs text-destructive">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>{statusMessage}</div>
              </div>
            )}

            {/* TABLA DE DIAGNÓSTICO EN VIVO */}
            {Object.keys(tableStats).length > 0 && (
              <div className="border border-border rounded-lg p-3 bg-card/60 space-y-2">
                <div className="text-xs font-semibold flex items-center justify-between">
                  <span>Diagnóstico en Vivo de Tablas en Supabase:</span>
                  <span className="text-[10px] text-muted-foreground">Consultado vía PostgREST Anon Key</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 text-xs">
                  {Object.entries(tableStats).map(([tName, info]) => (
                    <div key={tName} className="p-2 rounded border border-border/50 bg-muted/20 flex flex-col justify-between">
                      <span className="font-medium text-foreground">{info.label}</span>
                      <div className="mt-1">
                        {info.status === 'ok' ? (
                          <span className={`inline-flex items-center gap-1 font-mono font-bold ${info.count > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                            {info.count > 0 ? <Check className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                            {info.count} registros
                          </span>
                        ) : (
                          <span className="text-destructive font-mono text-[10px] truncate block" title={info.message}>
                            Error: {info.message}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          {/* TAB 2: COMPROBANTES & PUC */}
          <TabsContent value="comprobantes" className="flex-1 flex flex-col min-h-0 space-y-3">
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-xs text-emerald-900 dark:text-emerald-200 flex items-start gap-2">
              <BookOpen className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <strong>Carga de 43 Comprobantes Contables + 116 Cuentas PUC:</strong>
                <p className="mt-0.5">
                  Este script inserta el catálogo del Plan Único de Cuentas (PUC) y genera automáticamente los 43 comprobantes contables con sus 91 movimientos de débito/crédito correspondientes a tus préstamos, abonos y arriendos ya existentes.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Script SQL para comprobantes y PUC:</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => downloadSql(comprobantesSql, 'comprobantes_puc_seed.sql')}>
                  <Download className="w-3.5 h-3.5 mr-1" />
                  Descargar SQL
                </Button>
                <Button size="sm" onClick={() => handleCopy(comprobantesSql, 'comps')} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  {copiedComps ? <Check className="w-3.5 h-3.5 mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                  {copiedComps ? '¡Copiado!' : 'Copiar SQL Comprobantes'}
                </Button>
                <Button size="sm" variant="ghost" asChild>
                  <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">
                    <ExternalLink className="w-3.5 h-3.5 mr-1" />
                    Abrir SQL Editor
                  </a>
                </Button>
              </div>
            </div>

            <div className="flex-1 bg-neutral-950 text-neutral-100 p-4 rounded-lg font-mono text-xs overflow-y-auto max-h-[300px] border border-neutral-800">
              <pre>{comprobantesSql || '-- Cargando comprobantes...'}</pre>
            </div>
          </TabsContent>

          {/* TAB 3: SOLUCIÓN PERMISOS RLS */}
          <TabsContent value="fix" className="flex-1 flex flex-col min-h-0 space-y-3">
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
              <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong>Desbloqueo de permisos RLS:</strong>
                <p className="mt-0.5">
                  Ejecuta este script en Supabase SQL Editor para permitir lectura y escritura desde la aplicación administrativa.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Script de desbloqueo RLS:</span>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => handleCopy(fixRlsSql, 'fix')} className="bg-amber-600 hover:bg-amber-700 text-white">
                  {copiedFix ? <Check className="w-3.5 h-3.5 mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                  {copiedFix ? '¡Copiado!' : 'Copiar Permisos'}
                </Button>
              </div>
            </div>

            <div className="flex-1 bg-neutral-950 text-neutral-100 p-4 rounded-lg font-mono text-xs overflow-y-auto max-h-[300px] border border-neutral-800">
              <pre>{fixRlsSql || '-- Cargando script de permisos...'}</pre>
            </div>
          </TabsContent>

          {/* TAB 4: SEED (DATOS CSV) */}
          <TabsContent value="seed" className="flex-1 flex flex-col min-h-0 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-emerald-500" />
                Script de inserción con todos los datos base (clientes, créditos, arriendos, etc.).
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => downloadSql(seedSql, 'seed.sql')}>
                  <Download className="w-3.5 h-3.5 mr-1" />
                  Descargar seed.sql
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleCopy(seedSql, 'seed')}>
                  {copiedSeed ? <Check className="w-3.5 h-3.5 mr-1 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                  {copiedSeed ? 'Copiado' : 'Copiar SQL'}
                </Button>
              </div>
            </div>

            <div className="flex-1 bg-neutral-950 text-neutral-100 p-4 rounded-lg font-mono text-xs overflow-y-auto max-h-[340px] border border-neutral-800">
              <pre>{seedSql || '-- Cargando datos de inserción...'}</pre>
            </div>
          </TabsContent>

          {/* TAB 5: SCHEMA (CREAR TABLAS) */}
          <TabsContent value="schema" className="flex-1 flex flex-col min-h-0 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Script DDL con 24 tablas, claves primarias e índices.</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => downloadSql(schemaSql, 'schema.sql')}>
                  <Download className="w-3.5 h-3.5 mr-1" />
                  Descargar schema.sql
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleCopy(schemaSql, 'schema')}>
                  {copiedSchema ? <Check className="w-3.5 h-3.5 mr-1 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                  {copiedSchema ? 'Copiado' : 'Copiar SQL'}
                </Button>
              </div>
            </div>

            <div className="flex-1 bg-neutral-950 text-neutral-100 p-4 rounded-lg font-mono text-xs overflow-y-auto max-h-[340px] border border-neutral-800">
              <pre>{schemaSql || '-- Cargando esquema SQL...'}</pre>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
