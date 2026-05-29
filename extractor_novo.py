import pdfplumber
import re
import json

def clean_value(val_str):
    if not val_str: return 0.0
    val_str = str(val_str).replace('.', '').replace(',', '.').strip()
    try:
        return float(val_str)
    except ValueError:
        return 0.0

def is_valid_date(date_str):
    if not date_str: return False
    parts = date_str.split('/')
    if len(parts) == 3:
        return f"{parts[2]}{parts[1]}{parts[0]}" >= "20251101"
    return False

def categorize_pagar(name):
    n = name.upper()
    if any(x in n for x in ["SALARIO", "FOLHA DE PAGTO", "LIQUIDO DE FOLHA", "ADIANT SALARIO"]):
        return "Folha: Salários"
    if any(x in n for x in ["FERIAS", "RESCISAO", "13O SALARIO", "DECIMO TERCEIRO"]):
        return "Folha: Rescisões/Férias/13º"
    if any(x in n for x in ["PRO LABORE", "DISTRIBUICAO DE LUCRO", "DIVIDENDO"]):
        return "Folha: Pró-Labore/Lucros"
    if any(x in n for x in ["FGTS", "INSS", "PIS/", "PASEP", "COFINS", "DARF", "IRRF", "ISS "]):
        return "Encargos e Impostos"
    if any(x in n for x in ["TICKET", "ALIMENTACAO", "REFEICAO", "VALE TRANSP", "VR ", "VT ", "PLANO DE SAUDE", "UNIMED", "ODONTOPREV", "BENEFICIO"]):
        return "Folha: Benefícios"
    if any(x in n for x in ["MEDIC", "CLINIC", "HOSPITAL", "ENFERMAGEM", "ANESTESIA", "ORTOPEDIA", "GINECO", "PEDIATRA", "CARDIOLOG", "LABORATORIO", "LABCLIN", "FISIOTER", "PSICOLOG", "OFTALMO", "PATOLOG", "NEUROLOG", "CIRURGIA", "DERMATO", "GASTRO", "NUTRI", "RADIOL", "ULTRASSOM", "EXAMES", "CPE SERVICOS", "SERVICOS MEDICOS", "GGD SERVICOS", "MED LTDA", "CEME -", "GASPAR", "NEVES MED", "VANESSA NIERI", "ANNE CALHEIROS", "MIRELLA CLAUDINO", "DENISE MARIA", "MARIA FERNANDA", "RAQUEL JUNQUEIRA", "GOPI GINECO", "INSTITUTO DE PATOLO", "CRI - CLINICA", "CENTRO ITAJUBENSE", "ANDRE FERREIRA", "PATRICK WANDERSON", "RAFAEL KAZANGA"]):
        return "Serviços Médicos"
    if any(x in n for x in ["CEMIG", "COPASA", "ENERGIA ELETRICA", "AGUA E ESGOTO"]):
        return "Utilidades (Luz/Água)"
    if any(x in n for x in ["TELEMAR", "OI S.A", "CLARO", "VIVO", "TELEFONICA", "TIM ", "INTERNET", "FIBRA"]):
        return "Utilidades (Comunicação)"
    if any(x in n for x in ["CONSTRUCAO", "FERRAGENS", "ELETRICA", "TINTAS", "MANUTENCAO", "AR CONDICIONADO", "IMPERMEAB", "HIDRAULICA", "REFORMA", "LOPES MATERIAIS"]):
        return "Manutenção e Obras"
    if any(x in n for x in ["CIRURGICA", "FARMACEUTICA", "MEDICAMENTOS", "ESTERILIZACAO", "OXIGENIO", "INSUMO", "DESCARTAVEL", "CIRURGICO"]):
        return "Insumos Médicos"
    if any(x in n for x in ["PAPELARIA", "SUPRIMENTOS", "COPIADORA", "GRAFICA", "MATERIAL DE ESCRITORIO"]):
        return "Suprimentos Administrativos"
    if any(x in n for x in ["INFORMATICA", "SOFTWARE", "SISTEMAS", "WARELINE", "TI ", "TECNOLOGIA", "MICRO"]):
        return "TI e Tecnologia"
    if any(x in n for x in ["CONTABIL", "AUDITORIA", "CONSULTORIA", "ASSESSORIA"]):
        return "Serviços: Contabilidade"
    if any(x in n for x in ["ADVOG", "JURIDICO", "CARTORIO", "TRIBUNAL"]):
        return "Serviços: Jurídicos"
    if any(x in n for x in ["SEGURANCA", "VIGILANCIA", "MONITORAMENTO"]):
        return "Serviços: Segurança"
    if any(x in n for x in ["LIMPEZA", "CONSERVACAO", "JARDINAGEM", "HIGIENE"]):
        return "Serviços: Limpeza"
    if any(x in n for x in ["BANCO", "TARIFA", "JUROS", "IOF", "FINANCIAMENTO", "EMPRESTIMO", "CAIXA ECO"]):
        return "Taxas Bancárias"
    if any(x in n for x in ["ALUGUEL", "LOCACAO", "ARRENDAMENTO"]):
        return "Aluguéis"
    return "Outros Operacionais"

def month_key(date_str):
    # date_str = dd/mm/yyyy -> yyyy/mm
    parts = date_str.split('/')
    if len(parts) == 3:
        return f"{parts[2]}/{parts[1]}"
    return None

def extract_contas_pagar(pdf_path, company="Vale do Sapucaí"):
    entries = []
    seen = set()
    line_pattern = re.compile(
        r'^(\d{9})\s+(\d+/\d+)\s+(.*?)\s+(\d{2}/\d{2}/\d{4})\s+(\d{2}/\d{2}/\d{4})\s+([\d.]+,\d{2})\s+([\d.]+,\d{2})\s+([\d.]+,\d{2})\s*$'
    )
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if not text:
                continue
            for line in text.split('\n'):
                m = line_pattern.match(line.strip())
                if m:
                    emissao = m.group(4)
                    if not is_valid_date(emissao):
                        continue
                    pagamento = m.group(1)
                    parc = m.group(2)
                    middle = m.group(3).strip()
                    vencimento = m.group(5)
                    valor = clean_value(m.group(6))
                    pago = clean_value(m.group(7))
                    a_pagar = clean_value(m.group(8))

                    doc = ""
                    supplier = middle
                    sup_match = re.search(r'\b(\d{6})-(.*)', middle)
                    if sup_match:
                        doc = middle[:sup_match.start()].strip()
                        supplier = sup_match.group(2).strip()

                    key = (pagamento, parc, doc)
                    if key in seen:
                        continue
                    seen.add(key)

                    if valor == 0:
                        continue

                    status = "Pago" if a_pagar == 0 else ("A Pagar" if pago == 0 else "Pago Parcial")

                    entries.append({
                        "pagamento": pagamento,
                        "parc": parc,
                        "doc": doc,
                        "supplier": supplier,
                        "emissao": emissao,
                        "vencimento": vencimento,
                        "valor": valor,
                        "pago": pago,
                        "a_pagar": a_pagar,
                        "status": status,
                        "category": categorize_pagar(supplier),
                        "month_emissao": month_key(emissao),
                        "month_vencimento": month_key(vencimento),
                        "company": company
                    })
    return entries

def extract_contas_receber(pdf_path):
    entries = []
    seen = set()
    line_pattern = re.compile(
        r'^(\d{7})\s+(\d+/\d+)\s+(\S+)\s+(\d+-\S.*?)\s+(\d{2}/\d{2}/\d{4})\s+(\d{2}/\d{2}/\d{4})\s+([\d.]+,\d{2})\s+([\d.]+,\d{2})\s+([\d.]+,\d{2})\s+([\d.]+,\d{2})\s+([\d.]+,\d{2})\s*$'
    )
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if not text:
                continue
            for line in text.split('\n'):
                m = line_pattern.match(line.strip())
                if m:
                    emissao = m.group(5)
                    if not is_valid_date(emissao):
                        continue
                    recebim = m.group(1)
                    parc = m.group(2)
                    doc = m.group(3)
                    cliente_raw = m.group(4)
                    vencimento = m.group(6)
                    valor = clean_value(m.group(7))
                    baixado = clean_value(m.group(8))
                    juros = clean_value(m.group(9))
                    desc = clean_value(m.group(10))
                    a_receber = clean_value(m.group(11))

                    cli_match = re.match(r'\d+-(.+)', cliente_raw)
                    cliente = cli_match.group(1).strip() if cli_match else cliente_raw.strip()

                    key = (recebim, parc, doc)
                    if key in seen:
                        continue
                    seen.add(key)

                    if valor == 0:
                        continue

                    status = "Recebido" if a_receber == 0 else "A Receber"

                    # Tiny helper to assign CEAM employee payment to Ceam Brasil
                    company = "Ceam Brasil" if "CEAM" in cliente.upper() else "Vale do Sapucaí"

                    entries.append({
                        "recebim": recebim,
                        "doc": doc,
                        "cliente": cliente,
                        "emissao": emissao,
                        "vencimento": vencimento,
                        "valor": valor,
                        "baixado": baixado,
                        "a_receber": a_receber,
                        "status": status,
                        "month": month_key(vencimento),
                        "company": company
                    })
    return entries

def extract_ceam_receber(pdf_path):
    entries = []
    seen = set()
    date_pattern = re.compile(r'\b\d{2}/\d{2}/\d{4}\b')
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if not text:
                continue
            for line in text.split('\n'):
                line_str = line.strip()
                dates = date_pattern.findall(line_str)
                if len(dates) == 3:
                    idx1 = line_str.find(dates[0])
                    idx2 = line_str.find(dates[1], idx1 + len(dates[0]))
                    idx3 = line_str.find(dates[2], idx2 + len(dates[1]))
                    if idx1 == -1 or idx2 == -1 or idx3 == -1:
                        continue
                    before_dt1 = line_str[:idx1].strip()
                    between_dt2_dt3 = line_str[idx2 + len(dates[1]):idx3].strip()
                    after_dt3 = line_str[idx3 + len(dates[2]):].strip()
                    
                    before_tokens = before_dt1.split()
                    if len(before_tokens) < 3:
                        continue
                    codigo = before_tokens[0]
                    parc = before_tokens[-1]
                    cliente = " ".join(before_tokens[1:-1])
                    
                    between_tokens = between_dt2_dt3.split()
                    if not between_tokens:
                        continue
                    val_doc = clean_value(between_tokens[0])
                    
                    after_tokens = after_dt3.split()
                    if len(after_tokens) < 2:
                        continue
                    num_doc = after_tokens[-1]
                    baixado = clean_value(after_tokens[-2])
                    
                    emissao = dates[0]
                    vencimento = dates[1]
                    dt_pagto = dates[2]
                    
                    if not is_valid_date(dt_pagto):
                        continue
                        
                    key = (codigo, parc, num_doc)
                    if key in seen:
                        continue
                    seen.add(key)
                    
                    entries.append({
                        "recebim": codigo,
                        "doc": num_doc,
                        "cliente": cliente,
                        "emissao": emissao,
                        "vencimento": vencimento,
                        "valor": val_doc,
                        "baixado": baixado,
                        "a_receber": 0.0,
                        "status": "Recebido",
                        "month": month_key(dt_pagto),
                        "company": "Ceam Brasil"
                    })
    return entries

def extract_centro_medico_receber(pdf_path):
    entries = []
    seen = set()
    line1_pattern = re.compile(
        r'^(\d{8})\s+(\d+/\d+)\s+(\d{2}/\d{2}/\d{4})\s+(\S+)\s+(\d+)\s*-\s*(.*?)\s+(\d{2}/\d{2}/\d{4})\s+([\d.,]+)\s+([\d.,]+)\s*$'
    )
    line2_pattern = re.compile(
        r'^(\d{8})\s+(\d{2}/\d{2}/\d{4})\s+(.+?)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s*$'
    )
    
    current_recebto = None
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if not text:
                continue
            for line in text.split('\n'):
                line_str = line.strip()
                
                m1 = line1_pattern.match(line_str)
                if m1:
                    current_recebto = {
                        "emissao": m1.group(3),
                        "doc": m1.group(4),
                        "cliente": m1.group(6).strip(),
                        "vencimento": m1.group(7)
                    }
                    continue
                
                m2 = line2_pattern.match(line_str)
                if m2:
                    if not current_recebto:
                        continue
                    
                    dt_receb = m2.group(2)
                    if not is_valid_date(dt_receb):
                        continue
                        
                    recebim = m2.group(1)
                    val = clean_value(m2.group(4))
                    
                    key = (recebim, current_recebto['doc'])
                    if key in seen:
                        continue
                    seen.add(key)
                    
                    entries.append({
                        "recebim": recebim,
                        "doc": current_recebto['doc'],
                        "cliente": current_recebto['cliente'],
                        "emissao": current_recebto['emissao'],
                        "vencimento": current_recebto['vencimento'],
                        "valor": val,
                        "baixado": val,
                        "a_receber": 0.0,
                        "status": "Recebido",
                        "month": month_key(dt_receb),
                        "company": "Vale do Sapucaí"
                    })
    return entries


def aggregate(entries, group_by_field, value_fields, month_field):
    months = sorted(set(e[month_field] for e in entries if e[month_field]))
    groups = sorted(set(e[group_by_field] for e in entries))
    result = []
    for g in groups:
        g_entries = [e for e in entries if e[group_by_field] == g]
        monthly_data = {}
        for vf in value_fields:
            monthly_data[vf] = [sum(e[vf] for e in g_entries if e[month_field] == m) for m in months]
        monthly_data['total'] = [sum(monthly_data[vf][i] for vf in value_fields) for i in range(len(months))]
        result.append({
            "name": g,
            **{f"monthly_{vf}": monthly_data[vf] for vf in value_fields},
            "monthly_total": monthly_data['total'],
            "total": sum(monthly_data['total']),
        })
    result.sort(key=lambda x: x['total'], reverse=True)
    return months, result

def main():
    import os
    import glob
    
    # Path relative to script location
    base = os.path.dirname(os.path.abspath(__file__))

    print("Extraindo Contas a Pagar (Principal Vale do Sapucaí)...")
    pagar_entries = extract_contas_pagar(os.path.join(base, "Contas à Pagar", "Centro Médico", "RELATORIO DE CONTAS A PAGAR.pdf"), "Vale do Sapucaí")
    print(f"  {len(pagar_entries)} lançamentos encontrados")

    print("Extraindo Contas a Pagar (Maio Vale do Sapucaí)...")
    may_entries = extract_contas_pagar(os.path.join(base, "Contas à Pagar", "Centro Médico", "RELATORIO DE CONTAS A PAGAR - MAIO - CENTRO MEDICO.pdf"), "Vale do Sapucaí")
    print(f"  {len(may_entries)} lançamentos encontrados")

    # Mesclar dados de Maio no principal
    pagar_dict = { (e['company'], e['pagamento'], e['parc'], e['doc']): e for e in pagar_entries }
    for m_entry in may_entries:
        key = (m_entry['company'], m_entry['pagamento'], m_entry['parc'], m_entry['doc'])
        if key in pagar_dict:
            pagar_dict[key]['pago'] = m_entry['pago']
            pagar_dict[key]['a_pagar'] = m_entry['a_pagar']
            pagar_dict[key]['status'] = m_entry['status']
        else:
            pagar_dict[key] = m_entry
            
    # Extract all Ceam Brasil Contas a Pagar PDFs
    ceam_dir = os.path.join(base, "Contas à Pagar", "CEAM BRASIL - contas a pagar")
    ceam_entries = []
    if os.path.exists(ceam_dir):
        pdf_paths = glob.glob(os.path.join(ceam_dir, "*.pdf"))
        for path in sorted(pdf_paths):
            print(f"Extraindo Contas a Pagar (Ceam Brasil - {os.path.basename(path)})...")
            month_entries = extract_contas_pagar(path, "Ceam Brasil")
            ceam_entries.extend(month_entries)
            
    # Merge Ceam Brasil entries into main dictionary
    for c_entry in ceam_entries:
        key = (c_entry['company'], c_entry['pagamento'], c_entry['parc'], c_entry['doc'])
        if key in pagar_dict:
            pagar_dict[key]['pago'] = c_entry['pago']
            pagar_dict[key]['a_pagar'] = c_entry['a_pagar']
            pagar_dict[key]['status'] = c_entry['status']
        else:
            pagar_dict[key] = c_entry
            
    pagar_entries = list(pagar_dict.values())
    print(f"  Base mesclada de Contas a Pagar contém {len(pagar_entries)} lançamentos")

    print("Extraindo Contas a Receber (Centro Médico)...")
    receber_entries = extract_contas_receber(os.path.join(base, "Contas à Receber", "Centro Médico", "RELATORIO DE CONTAS A RECEBER.pdf"))
    print(f"  {len(receber_entries)} lançamentos encontrados")

    # Extract all Centro Médico received PDFs
    cm_rec_dir = os.path.join(base, "Contas à Receber", "Centro Médico")
    cm_rec_entries = []
    if os.path.exists(cm_rec_dir):
        pdf_paths = glob.glob(os.path.join(cm_rec_dir, "**", "*.pdf"), recursive=True)
        pdf_paths = [p for p in pdf_paths if "RECEBIDO" in p.upper() or "RECEBIDO" in os.path.basename(p).upper()]
        for path in sorted(pdf_paths):
            print(f"Extraindo Contas a Receber (Centro Médico Recebido - {os.path.basename(path)})...")
            month_entries = extract_centro_medico_receber(path)
            cm_rec_entries.extend(month_entries)
    print(f"  {len(cm_rec_entries)} lançamentos recebidos do Centro Médico encontrados")

    # Extract all Ceam Brasil Contas a Receber PDFs
    ceam_rec_dir = os.path.join(base, "Contas à Receber", "Ceam Brasil", "CEAM BRASIL", "CEAM BRASIL", "BOLETOS RECEBIDOS CEAM BRASIL - SISTEMA")
    ceam_rec_entries = []
    if os.path.exists(ceam_rec_dir):
        pdf_paths = glob.glob(os.path.join(ceam_rec_dir, "**", "*.pdf"), recursive=True)
        for path in sorted(pdf_paths):
            print(f"Extraindo Contas a Receber (Ceam Brasil - {os.path.basename(path)})...")
            month_entries = extract_ceam_receber(path)
            ceam_rec_entries.extend(month_entries)
    print(f"  {len(ceam_rec_entries)} lançamentos do convênio encontrados")

    receber_entries.extend(cm_rec_entries)
    receber_entries.extend(ceam_rec_entries)

    # Contas a Pagar aggregations by emission month (consolidated)
    pagar_months, pagar_categories = aggregate(
        pagar_entries, 'category', ['pago', 'a_pagar'], 'month_emissao'
    )
    _, pagar_suppliers = aggregate(
        pagar_entries, 'supplier', ['pago', 'a_pagar'], 'month_emissao'
    )

    # Monthly totals (consolidated)
    pagar_monthly_pago = [sum(e['pago'] for e in pagar_entries if e['month_emissao'] == m) for m in pagar_months]
    pagar_monthly_a_pagar = [sum(e['a_pagar'] for e in pagar_entries if e['month_emissao'] == m) for m in pagar_months]

    # KPIs (consolidated)
    total_pago = sum(e['pago'] for e in pagar_entries)
    total_a_pagar = sum(e['a_pagar'] for e in pagar_entries)
    total_valor = sum(e['valor'] for e in pagar_entries)
    count_pagar = len(pagar_entries)

    # Receber aggregations by vencimento month
    receber_months = sorted(set(e['month'] for e in receber_entries if e['month']))
    receber_by_cliente = {}
    for e in receber_entries:
        c = e['cliente']
        if c not in receber_by_cliente:
            receber_by_cliente[c] = {'valor': 0, 'baixado': 0, 'a_receber': 0}
        receber_by_cliente[c]['valor'] += e['valor']
        receber_by_cliente[c]['baixado'] += e['baixado']
        receber_by_cliente[c]['a_receber'] += e['a_receber']

    receber_clientes = [
        {"name": k, "valor": v['valor'], "baixado": v['baixado'], "a_receber": v['a_receber']}
        for k, v in receber_by_cliente.items()
    ]
    receber_clientes.sort(key=lambda x: x['valor'], reverse=True)

    total_receber_valor = sum(e['valor'] for e in receber_entries)
    total_recebido = sum(e['baixado'] for e in receber_entries)
    total_a_receber = sum(e['a_receber'] for e in receber_entries)
    count_receber = len(receber_entries)

    data = {
        "pagar": {
            "months": pagar_months,
            "monthly_pago": pagar_monthly_pago,
            "monthly_a_pagar": pagar_monthly_a_pagar,
            "categories": pagar_categories,
            "suppliers": pagar_suppliers,
            "total_pago": total_pago,
            "total_a_pagar": total_a_pagar,
            "total_valor": total_valor,
            "count": count_pagar,
            "transactions": pagar_entries,
        },
        "receber": {
            "months": receber_months,
            "clientes": receber_clientes,
            "total_valor": total_receber_valor,
            "total_recebido": total_recebido,
            "total_a_receber": total_a_receber,
            "count": count_receber,
            "transactions": receber_entries,
        }
    }

    out_path = os.path.join(base, "Contas à Pagar", "data_financeiro.js")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write("const FINANCEIRO_DATA = " + json.dumps(data, indent=2, ensure_ascii=False) + ";\n")

    print(f"\n[OK] data_financeiro.js gerado em {out_path}")
    print(f"  Pagar: {count_pagar} lançamentos, Total Valor: R$ {total_valor:,.2f}")
    print(f"         Total Pago: R$ {total_pago:,.2f}, A Pagar: R$ {total_a_pagar:,.2f}")
    print(f"  Receber: {count_receber} lançamentos, Total Valor: R$ {total_receber_valor:,.2f}")
    print(f"         Total Recebido: R$ {total_recebido:,.2f}, A Receber: R$ {total_a_receber:,.2f}")
    print(f"\nMeses Pagar: {pagar_months}")
    print(f"Meses Receber: {receber_months}")

if __name__ == "__main__":
    main()
