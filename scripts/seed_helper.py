import csv
import json
import os

# Helper to format SQL value
def format_sql_val(val, col_type):
    if val is None or val == '':
        return 'NULL'
    # clean value
    val = val.strip()
    if val == '':
        return 'NULL'
    if val.startswith("'") and val.endswith("'") and len(val) >= 2:
        val = val[1:-1]
        
    if col_type == 'BOOLEAN':
        return 'TRUE' if val.lower() in ('true', '1', 't') else 'FALSE'
    elif col_type in ('NUMERIC', 'BIGINT', 'INTEGER'):
        try:
            # test float conversion
            float(val)
            return val
        except:
            return 'NULL'
    elif col_type == 'JSONB':
        try:
            parsed = json.loads(val)
            escaped = json.dumps(parsed).replace("'", "''")
            return f"'{escaped}'::jsonb"
        except:
            escaped = val.replace("'", "''")
            return f"'{escaped}'::jsonb"
    else:
        escaped = val.replace("'", "''")
        return f"'{escaped}'"

print("Helper ready.")
