import os
import glob
import csv
import json

from seed_helper import format_sql_val

# Read schema properties to know column types
schema_types = {}
for filepath in glob.glob('base44/entities/*.jsonc'):
    with open(filepath, 'r', encoding='utf-8') as fp:
        content = fp.read()
        lines = [l for l in content.splitlines() if not l.strip().startswith('//')]
        schema = json.loads('\n'.join(lines))
    name = schema.get('name')
    import re
    table_name = re.sub('([a-z0-9])([A-Z])', r'\1_\2', name).lower()
    if table_name == 'user':
        table_name = 'app_user'
    
    props = schema.get('properties', {})
    col_types = {
        'id': 'TEXT',
        'created_date': 'TIMESTAMPTZ',
        'updated_date': 'TIMESTAMPTZ',
        'created_by_id': 'TEXT',
        'is_sample': 'BOOLEAN'
    }
    for k, v in props.items():
        t = v.get('type', 'string')
        if t == 'number':
            col_types[k] = 'NUMERIC'
        elif t == 'integer':
            col_types[k] = 'BIGINT'
        elif t == 'boolean':
            col_types[k] = 'BOOLEAN'
        elif t in ('array', 'object'):
            col_types[k] = 'JSONB'
        else:
            col_types[k] = 'TEXT'
    schema_types[table_name] = col_types

out_file = open('supabase/seed.sql', 'w', encoding='utf-8')
out_file.write('-- =========================================================\n')
out_file.write('-- Supabase Seed Data for Aleke Admin System\n')
out_file.write('-- =========================================================\n\n')

csv_files = sorted(glob.glob('data/csv/*.csv'))
for csv_path in csv_files:
    table = os.path.basename(csv_path).replace('.csv', '')
    col_types = schema_types.get(table, {})
    
    with open(csv_path, 'r', encoding='utf-8') as fp:
        reader = csv.reader(fp)
        try:
            headers = next(reader)
        except StopIteration:
            continue
            
        rows = list(reader)
        if not rows:
            continue
            
        out_file.write(f'-- Table: {table} ({len(rows)} records)\n')
        quoted_headers = ', '.join([f'"{h}"' for h in headers])
        
        # Write INSERT statement in batches of 50
        batch_size = 50
        for i in range(0, len(rows), batch_size):
            batch = rows[i:i+batch_size]
            val_clauses = []
            for row in batch:
                row_vals = []
                for idx, h in enumerate(headers):
                    val = row[idx] if idx < len(row) else None
                    c_type = col_types.get(h, 'TEXT')
                    row_vals.append(format_sql_val(val, c_type))
                val_clauses.append('(' + ', '.join(row_vals) + ')')
                
            out_file.write(f'INSERT INTO public."{table}" ({quoted_headers})\nVALUES\n  ' + ',\n  '.join(val_clauses) + '\nON CONFLICT (id) DO UPDATE SET updated_date = EXCLUDED.updated_date;\n\n')

out_file.close()
print("Generated supabase/seed.sql successfully.")
