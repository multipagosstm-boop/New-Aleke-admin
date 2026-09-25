import json
import glob
import os
import re

def to_snake_case(name):
    # MetaTarjeta -> meta_tarjeta
    s1 = re.sub('(.)([A-Z][a-z]+)', r'\1_\2', name)
    return re.sub('([a-z0-9])([A-Z])', r'\1_\2', s1).lower()

TYPE_MAP = {
    'string': 'TEXT',
    'number': 'NUMERIC',
    'integer': 'BIGINT',
    'boolean': 'BOOLEAN',
    'array': 'JSONB',
    'object': 'JSONB'
}

tables = []

for filepath in sorted(glob.glob('base44/entities/*.jsonc')):
    with open(filepath, 'r', encoding='utf-8') as fp:
        content = fp.read()
        lines = [l for l in content.splitlines() if not l.strip().startswith('//')]
        schema = json.loads('\n'.join(lines))
    
    entity_name = schema.get('name')
    if not entity_name:
        continue
    
    table_name = to_snake_case(entity_name)
    if table_name == 'user':
        table_name = 'app_user'
        
    properties = schema.get('properties', {})
    
    columns = [
        '  id TEXT PRIMARY KEY',
        '  created_date TIMESTAMPTZ DEFAULT timezone(\'utc\'::text, now())',
        '  updated_date TIMESTAMPTZ DEFAULT timezone(\'utc\'::text, now())',
        '  created_by_id TEXT',
        '  is_sample BOOLEAN DEFAULT false'
    ]
    
    indices = []
    
    for prop_name, prop_def in properties.items():
        if prop_name in ['id', 'created_date', 'updated_date', 'created_by_id', 'is_sample']:
            continue
        p_type = prop_def.get('type', 'string')
        sql_type = TYPE_MAP.get(p_type, 'TEXT')
        
        # Check if it has a default
        col_def = f'  "{prop_name}" {sql_type}'
        if 'default' in prop_def:
            default_val = prop_def['default']
            if isinstance(default_val, bool):
                col_def += f' DEFAULT {str(default_val).lower()}'
            elif isinstance(default_val, (int, float)):
                col_def += f' DEFAULT {default_val}'
            elif isinstance(default_val, (list, dict)):
                col_def += f" DEFAULT '{json.dumps(default_val)}'::jsonb"
            elif isinstance(default_val, str) and default_val:
                col_def += f" DEFAULT '{default_val}'"
        
        columns.append(col_def)
        
        if prop_name.endswith('_id') or prop_name in ['cliente_id', 'comprobante_id', 'producto_id', 'prestamo_id', 'codigo', 'estado', 'fecha']:
            indices.append(f'CREATE INDEX IF NOT EXISTS idx_{table_name}_{prop_name} ON public."{table_name}" ("{prop_name}");')
            
    sql = f'-- Table: {table_name} ({entity_name})\n'
    sql += f'CREATE TABLE IF NOT EXISTS public."{table_name}" (\n'
    sql += ',\n'.join(columns)
    sql += '\n);\n'
    sql += f'ALTER TABLE public."{table_name}" ENABLE ROW LEVEL SECURITY;\n'
    sql += f'DROP POLICY IF EXISTS "Allow anon all on {table_name}" ON public."{table_name}";\n'
    sql += f'CREATE POLICY "Allow anon all on {table_name}" ON public."{table_name}" FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);\n'
    if indices:
        sql += '\n'.join(indices) + '\n'
        
    tables.append((table_name, entity_name, sql))

os.makedirs('supabase', exist_ok=True)
with open('supabase/schema.sql', 'w', encoding='utf-8') as out:
    out.write('-- =========================================================\n')
    out.write('-- Supabase Schema for Aleke Admin System\n')
    out.write('-- Execute this in Supabase SQL Editor\n')
    out.write('-- =========================================================\n\n')
    out.write('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";\n\n')
    for table_name, entity_name, sql in tables:
        out.write(sql + '\n\n')

print(f"Generated supabase/schema.sql with {len(tables)} tables successfully.")
