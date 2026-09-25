import csv
import json
import uuid

# Load clients
clientes = {r['id']: r['nombre'] for r in csv.DictReader(open('data/csv/cliente.csv'))}
cdas = {r['id']: r for r in csv.DictReader(open('data/csv/cuenta_ahorro.csv'))}
cda_subcuentas = {r['subcuenta_puc']: r for r in cdas.values() if r.get('subcuenta_puc')}

# Define PUC catalog
puc_accounts = [
    # Clases
    (1, "Clase", 1, "Activo", None, None, None, None, "Activo", "Débito", "Balance", False),
    (2, "Clase", 2, "Pasivo", None, None, None, None, "Pasivo", "Crédito", "Balance", False),
    (3, "Clase", 3, "Patrimonio", None, None, None, None, "Patrimonio", "Crédito", "Balance", False),
    (4, "Clase", 4, "Ingreso", None, None, None, None, "Ingresos", "Crédito", "Resultado", False),
    (5, "Clase", 5, "Gasto", None, None, None, None, "Gastos", "Débito", "Resultado", False),
    # Grupos
    (11, "Grupo", 1, "Activo", 11, None, None, None, "Disponible", "Débito", "Balance", False),
    (12, "Grupo", 1, "Activo", 12, None, None, None, "Inversiones y Cartera", "Débito", "Balance", False),
    (13, "Grupo", 1, "Activo", 13, None, None, None, "Deudores / Clientes", "Débito", "Balance", False),
    (21, "Grupo", 2, "Pasivo", 21, None, None, None, "Obligaciones Financieras", "Crédito", "Balance", False),
    (23, "Grupo", 2, "Pasivo", 23, None, None, None, "Cuentas por Pagar", "Crédito", "Balance", False),
    (28, "Grupo", 2, "Pasivo", 28, None, None, None, "Otros Pasivos y Depósitos", "Crédito", "Balance", False),
    (31, "Grupo", 3, "Patrimonio", 31, None, None, None, "Capital Social", "Crédito", "Balance", False),
    (41, "Grupo", 4, "Ingreso", 41, None, None, None, "Operacionales", "Crédito", "Resultado", False),
    (51, "Grupo", 5, "Gasto", 51, None, None, None, "Operacionales de Administración", "Débito", "Resultado", False),
    # Cuentas
    (1105, "Cuenta", 1, "Activo", 11, 1105, None, None, "Caja", "Débito", "Balance", False),
    (110505, "Subcuenta", 1, "Activo", 11, 1105, 110505, None, "Caja General", "Débito", "Balance", True),
    (1110, "Cuenta", 1, "Activo", 11, 1110, None, None, "Bancos", "Débito", "Balance", False),
    (1205, "Cuenta", 1, "Activo", 12, 1205, None, None, "Créditos Otorgados", "Débito", "Balance", False),
    (120506, "Subcuenta", 1, "Activo", 12, 1205, 120506, None, "Préstamos Pakredito", "Débito", "Balance", True),
    (1305, "Cuenta", 1, "Activo", 13, 1305, None, None, "Clientes Nacionales", "Débito", "Balance", False),
    (130505, "Subcuenta", 1, "Activo", 13, 1305, 130505, None, "Clientes Nacionales", "Débito", "Balance", True),
    (2105, "Cuenta", 2, "Pasivo", 21, 2105, None, None, "Bancos Nacionales", "Crédito", "Balance", False),
    (2110, "Cuenta", 2, "Pasivo", 21, 2110, None, None, "Tarjetas de Crédito", "Crédito", "Balance", False),
    (2805, "Cuenta", 2, "Pasivo", 28, 2805, None, None, "Depósitos y Anticipos Recibidos", "Crédito", "Balance", False),
    (280505, "Subcuenta", 2, "Pasivo", 28, 2805, 280505, None, "Depósitos de Arrendamiento Rooftop", "Crédito", "Balance", True),
    (3105, "Cuenta", 3, "Patrimonio", 31, 3105, None, None, "Capital Suscrito y Pagado", "Crédito", "Balance", False),
    (310505, "Subcuenta", 3, "Patrimonio", 31, 3105, 310505, None, "Capital Social", "Crédito", "Balance", True),
    (4105, "Cuenta", 4, "Ingreso", 41, 4105, None, None, "Financieros", "Crédito", "Resultado", False),
    (410503, "Subcuenta", 4, "Ingreso", 41, 4105, 410503, None, "Intereses por Préstamos", "Crédito", "Resultado", True),
    (4155, "Cuenta", 4, "Ingreso", 41, 4155, None, None, "Actividades Inmobiliarias", "Crédito", "Resultado", False),
    (415505, "Subcuenta", 4, "Ingreso", 41, 4155, 415505, None, "Arrendamientos Rooftop", "Crédito", "Resultado", True),
    (5105, "Cuenta", 5, "Gasto", 51, 5105, None, None, "Gastos de Personal", "Débito", "Resultado", False),
    (510506, "Subcuenta", 5, "Gasto", 51, 5105, 510506, None, "Sueldos y Honorarios", "Débito", "Resultado", True),
    (5135, "Cuenta", 5, "Gasto", 51, 5135, None, None, "Servicios", "Débito", "Resultado", False),
    (513505, "Subcuenta", 5, "Gasto", 51, 5135, 513505, None, "Servicios Públicos y Generales", "Débito", "Resultado", True),
    (5305, "Cuenta", 5, "Gasto", 53, 5305, None, None, "Gastos Financieros", "Débito", "Resultado", False),
    (530505, "Subcuenta", 5, "Gasto", 53, 5305, 530505, None, "Intereses y Comisiones Bancarias", "Débito", "Resultado", True)
]

# Add subcuentas for 1110 (Bancos) from cuentas de ahorro
for cda in cdas.values():
    sub = cda.get('subcuenta_puc')
    if sub and sub.isdigit():
        code = int(sub)
        puc_accounts.append((code, "Subcuenta", 1, "Activo", 11, 1110, code, None, f"Banco {cda.get('banco', '')} - {cda.get('nombre', '')}", "Débito", "Balance", True))

# Add subcuentas for 2105 and 2110 from producto_credito
prods = list(csv.DictReader(open('data/csv/producto_credito.csv')))
for p in prods:
    sub = p.get('subcuenta_puc')
    if sub and sub.isdigit():
        code = int(sub)
        clase = int(str(code)[0])
        clase_nom = "Pasivo" if clase == 2 else "Activo"
        grp = int(str(code)[:2])
        cta = int(str(code)[:4])
        nom = f"{p.get('tipo', '')} {p.get('banco', '')} {p.get('nombre', '')}"
        puc_accounts.append((code, "Subcuenta", clase, clase_nom, grp, cta, code, None, nom.strip(), "Crédito", "Balance", True))

# Deduplicate accounts by code
seen_codes = set()
unique_puc = []
for acc in puc_accounts:
    if acc[0] not in seen_codes:
        seen_codes.add(acc[0])
        unique_puc.append(acc)

unique_puc.sort(key=lambda x: x[0])

# Prepare SQL statements
sql_lines = []
sql_lines.append("-- =========================================================")
sql_lines.append("-- PLAN DE CUENTAS (PUC) & COMPROBANTES CONTABLES SEED")
sql_lines.append("-- =========================================================\n")

# 1. INSERT INTO cuenta
sql_lines.append(f"-- Table: cuenta ({len(unique_puc)} accounts)")
sql_lines.append('INSERT INTO public."cuenta" ("id", "codigo", "nivel", "clase", "clase_nombre", "grupo", "cuenta", "subcuenta", "auxiliar", "concepto", "naturaleza", "tipo_estado", "es_transaccional")\nVALUES')

puc_values = []
for acc in unique_puc:
    code, nivel, clase, clase_nom, grp, cta, sub, aux, concepto, nat, tipo_est, trans = acc
    acc_id = f"puc_{code}"
    concepto_esc = concepto.replace("'", "''")
    grp_v = grp if grp is not None else "NULL"
    cta_v = cta if cta is not None else "NULL"
    sub_v = sub if sub is not None else "NULL"
    aux_v = aux if aux is not None else "NULL"
    trans_v = "TRUE" if trans else "FALSE"
    puc_values.append(f"  ('{acc_id}', {code}, '{nivel}', {clase}, '{clase_nom}', {grp_v}, {cta_v}, {sub_v}, {aux_v}, '{concepto_esc}', '{nat}', '{tipo_est}', {trans_v})")

sql_lines.append(',\n'.join(puc_values) + '\nON CONFLICT (id) DO UPDATE SET updated_date = EXCLUDED.updated_date;\n')

# 2. GENERATE COMPROBANTES AND MOVIMIENTOS
comprobantes = []
movimientos = []
comp_num = 1

# Process 24 loans
loans = list(csv.DictReader(open('data/csv/prestamo.csv')))
for l in loans:
    cid = l.get('comprobante_id')
    if not cid:
        continue
    codigo = l.get('codigo', 'PK')
    capital = float(l.get('capital') or 0)
    fecha = (l.get('fecha_prestamo') or '2026-09-01')[:10]
    cli_id = l.get('cliente_id', '')
    cli_nombre = clientes.get(cli_id, 'Cliente Pakredito')
    desc = f"Desembolso préstamo {codigo} - {cli_nombre}"

    # Comprobante
    comp = {
        'id': cid,
        'numero': f"CC-{comp_num:04d}",
        'tipo': 'egreso',
        'fecha': fecha,
        'fecha_registro': f"{fecha}T10:00:00.000Z",
        'descripcion': desc,
        'estado': 'contabilizado',
        'total_debito': capital,
        'total_credito': capital
    }
    comprobantes.append(comp)
    comp_num += 1

    # Movimiento 1: Débito Cartera 120506
    movimientos.append({
        'id': f"mov_{cid}_deb",
        'comprobante_id': cid,
        'clase': '1', 'grupo': '12', 'cuenta': '1205', 'subcuenta': '120506',
        'cuenta_nombre': 'Préstamos Pakredito',
        'debito': capital, 'credito': 0,
        'descripcion': desc,
        'tercero': cli_nombre, 'cliente_id': cli_id,
        'modelo_negocio': 'pakredito', 'estado': 'activo',
        'fecha': fecha, 'fecha_registro': f"{fecha}T10:00:00.000Z"
    })

    # Movimiento 2: Crédito Banco/Caja 11100101
    movimientos.append({
        'id': f"mov_{cid}_cred",
        'comprobante_id': cid,
        'clase': '1', 'grupo': '11', 'cuenta': '1110', 'subcuenta': '11100101',
        'cuenta_nombre': 'Bancos Nacionales',
        'debito': 0, 'credito': capital,
        'descripcion': desc,
        'tercero': cli_nombre, 'cliente_id': cli_id,
        'modelo_negocio': 'pakredito', 'estado': 'activo',
        'fecha': fecha, 'fecha_registro': f"{fecha}T10:00:00.000Z"
    })

# Process 10 abonos de préstamos
abonos = list(csv.DictReader(open('data/csv/abono_prestamo.csv')))
for a in abonos:
    cid = a.get('comprobante_id')
    if not cid:
        continue
    valor = float(a.get('valor_total') or 0)
    fecha = (a.get('fecha') or '2026-09-01')[:10]
    cli_id = a.get('cliente_id', '')
    cli_nombre = clientes.get(cli_id, 'Cliente')
    sub_ingreso = a.get('subcuenta_ingreso') or '11100201'
    desc = f"Abono a préstamo - {cli_nombre}"

    # Parse details for capital & intereses
    capital = valor
    intereses = 0
    try:
        det = json.loads(a.get('detalles') or '[]')
        if det and isinstance(det, list):
            capital = sum(float(x.get('capital', 0)) for x in det)
            intereses = sum(float(x.get('intereses', 0)) for x in det)
    except:
        pass

    if capital + intereses == 0:
        capital = valor

    comp = {
        'id': cid,
        'numero': f"CC-{comp_num:04d}",
        'tipo': 'ingreso',
        'fecha': fecha,
        'fecha_registro': f"{fecha}T11:00:00.000Z",
        'descripcion': desc,
        'estado': 'contabilizado',
        'total_debito': valor,
        'total_credito': valor
    }
    comprobantes.append(comp)
    comp_num += 1

    # Movimiento 1: Débito Banco Receptor
    movimientos.append({
        'id': f"mov_{cid}_deb",
        'comprobante_id': cid,
        'clase': '1', 'grupo': '11', 'cuenta': '1110', 'subcuenta': sub_ingreso,
        'cuenta_nombre': 'Bancos / Disponible',
        'debito': valor, 'credito': 0,
        'descripcion': desc,
        'tercero': cli_nombre, 'cliente_id': cli_id,
        'modelo_negocio': 'pakredito', 'estado': 'activo',
        'fecha': fecha, 'fecha_registro': f"{fecha}T11:00:00.000Z"
    })

    # Movimiento 2: Crédito Cartera 120506
    if capital > 0:
        movimientos.append({
            'id': f"mov_{cid}_cred_cap",
            'comprobante_id': cid,
            'clase': '1', 'grupo': '12', 'cuenta': '1205', 'subcuenta': '120506',
            'cuenta_nombre': 'Préstamos Pakredito',
            'debito': 0, 'credito': capital,
            'descripcion': f"{desc} (Capital)",
            'tercero': cli_nombre, 'cliente_id': cli_id,
            'modelo_negocio': 'pakredito', 'estado': 'activo',
            'fecha': fecha, 'fecha_registro': f"{fecha}T11:00:00.000Z"
        })

    # Movimiento 3: Crédito Intereses 410503
    if intereses > 0:
        movimientos.append({
            'id': f"mov_{cid}_cred_int",
            'comprobante_id': cid,
            'clase': '4', 'grupo': '41', 'cuenta': '4105', 'subcuenta': '410503',
            'cuenta_nombre': 'Intereses por Préstamos',
            'debito': 0, 'credito': intereses,
            'descripcion': f"{desc} (Intereses)",
            'tercero': cli_nombre, 'cliente_id': cli_id,
            'modelo_negocio': 'pakredito', 'estado': 'activo',
            'fecha': fecha, 'fecha_registro': f"{fecha}T11:00:00.000Z"
        })

# Process 10 pagos de arriendo
arriendos = list(csv.DictReader(open('data/csv/pago_arriendo.csv')))
for r in arriendos:
    cid = r.get('comprobante_id')
    if not cid or r.get('estado') != 'pagado':
        continue
    valor = float(r.get('valor_pagado') or r.get('valor_esperado') or 0)
    if valor <= 0:
        continue
    fecha = (r.get('fecha_pago_real') or r.get('fecha_vencimiento') or '2026-08-01')[:10]
    periodo = r.get('periodo', '')
    desc = f"Pago arriendo Rooftop periodo {periodo}"

    comp = {
        'id': cid,
        'numero': f"CC-{comp_num:04d}",
        'tipo': 'ingreso',
        'fecha': fecha,
        'fecha_registro': f"{fecha}T12:00:00.000Z",
        'descripcion': desc,
        'estado': 'contabilizado',
        'total_debito': valor,
        'total_credito': valor
    }
    comprobantes.append(comp)
    comp_num += 1

    # Movimiento 1: Débito Banco 11100101
    movimientos.append({
        'id': f"mov_{cid}_deb",
        'comprobante_id': cid,
        'clase': '1', 'grupo': '11', 'cuenta': '1110', 'subcuenta': '11100101',
        'cuenta_nombre': 'Bancos Nacionales',
        'debito': valor, 'credito': 0,
        'descripcion': desc,
        'tercero': 'Inquilino Rooftop',
        'modelo_negocio': 'rooftop', 'estado': 'activo',
        'fecha': fecha, 'fecha_registro': f"{fecha}T12:00:00.000Z"
    })

    # Movimiento 2: Crédito Ingreso Arrendamiento 415505
    movimientos.append({
        'id': f"mov_{cid}_cred",
        'comprobante_id': cid,
        'clase': '4', 'grupo': '41', 'cuenta': '4155', 'subcuenta': '415505',
        'cuenta_nombre': 'Arrendamientos Rooftop',
        'debito': 0, 'credito': valor,
        'descripcion': desc,
        'tercero': 'Inquilino Rooftop',
        'modelo_negocio': 'rooftop', 'estado': 'activo',
        'fecha': fecha, 'fecha_registro': f"{fecha}T12:00:00.000Z"
    })

# Write Comprobantes SQL
sql_lines.append(f"-- Table: comprobante_contable ({len(comprobantes)} records)")
sql_lines.append('INSERT INTO public."comprobante_contable" ("id", "numero", "tipo", "fecha", "fecha_registro", "descripcion", "estado", "total_debito", "total_credito")\nVALUES')
comp_vals = []
for c in comprobantes:
    desc_esc = c['descripcion'].replace("'", "''")
    comp_vals.append(f"  ('{c['id']}', '{c['numero']}', '{c['tipo']}', '{c['fecha']}', '{c['fecha_registro']}', '{desc_esc}', '{c['estado']}', {c['total_debito']}, {c['total_credito']})")
sql_lines.append(',\n'.join(comp_vals) + '\nON CONFLICT (id) DO UPDATE SET updated_date = EXCLUDED.updated_date;\n')

# Write Movimientos SQL in batches of 50
sql_lines.append(f"-- Table: movimiento_contable ({len(movimientos)} records)")
headers = ["id", "comprobante_id", "clase", "grupo", "cuenta", "subcuenta", "cuenta_nombre", "debito", "credito", "descripcion", "tercero", "cliente_id", "modelo_negocio", "estado", "fecha", "fecha_registro"]
quoted_h = ', '.join([f'"{h}"' for h in headers])

for i in range(0, len(movimientos), 50):
    batch = movimientos[i:i+50]
    vals = []
    for m in batch:
        c_nom = m['cuenta_nombre'].replace("'", "''")
        m_desc = m['descripcion'].replace("'", "''")
        m_terc = m.get('tercero', '').replace("'", "''")
        cli_val = f"'{m['cliente_id']}'" if m.get('cliente_id') else "NULL"
        vals.append(f"  ('{m['id']}', '{m['comprobante_id']}', '{m['clase']}', '{m['grupo']}', '{m['cuenta']}', '{m['subcuenta']}', '{c_nom}', {m['debito']}, {m['credito']}, '{m_desc}', '{m_terc}', {cli_val}, '{m['modelo_negocio']}', '{m['estado']}', '{m['fecha']}', '{m['fecha_registro']}')")
    sql_lines.append(f'INSERT INTO public."movimiento_contable" ({quoted_h})\nVALUES\n' + ',\n'.join(vals) + '\nON CONFLICT (id) DO UPDATE SET updated_date = EXCLUDED.updated_date;\n')

output_content = '\n'.join(sql_lines)

with open('public/supabase/comprobantes_puc_seed.sql', 'w', encoding='utf-8') as f:
    f.write(output_content)

print(f"Generated public/supabase/comprobantes_puc_seed.sql: {len(unique_puc)} cuentas, {len(comprobantes)} comprobantes, {len(movimientos)} movimientos.")
