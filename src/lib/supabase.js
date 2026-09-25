import { createClient } from '@supabase/supabase-js';

// Tus credenciales de Supabase
const supabaseUrl = 'https://tktxnvuuanlgsreiuwsm.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRrdHhudnV1YW5sZ3NyZWl1d3NtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAyNzU2NTEsImV4cCI6MjEwNTg1MTY1MX0.KPv4eH9ViHQ7MCR2dSSgyOH1hM4Ka16Fjm9j3-NpvPU';

// Crear y exportar el cliente de Supabase
export const supabase = createClient(supabaseUrl, supabaseAnonKey);