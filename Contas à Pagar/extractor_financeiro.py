import pdfplumber
import os
import re
import json

def clean_value(val_str):
    """Converts a string like '2.493,79' to float."""
    if not val_str: return 0.0
    val_str = val_str.replace('.', '').replace(',', '.').strip()
    try:
        return float(val_str)
    except ValueError:
        return 0.0

def categorize_supplier(name):
    name = name.upper()
    
    # 1. Folha de Pagamento & Encargos (Deep Stratification)
    if any(x in name for x in ["SALARIO", "FOLHA DE PAGTO", "LIQUIDO"]):
        return "Folha: Salários Base"
    if any(x in name for x in ["FERIAS", "RESCISAO", "13O SALARIO", "DECIMO TERCEIRO"]):
        return "Folha: Rescisões/Férias/13º"
    if any(x in name for x in ["PRO LABORE", "DISTRIBUICAO DE LUCRO", "DIVIDENDOS"]):
        return "Folha: Pró-Labore/Lucros"
    if any(x in name for x in ["FGTS", "INSS", "PIS", "PASEP", "COFINS", "DARF IRRF"]):
        return "Encargos e Impostos S/ Folha"
    if any(x in name for x in ["TICKET", "ALIMENTACAO", "REFEICAO", "VALE TRANSPORTE", "VR ", "VT ", "PLANO DE SAUDE", "UNIMED", "ODONTOPREV"]):
        return "Folha: Benefícios"

    # 2. Serviços Médicos & Clínicos (The "PJ" doctors)
    if any(x in name for x in ["MEDIC", "CLINIC", "HOSPITAL", "ENFERMAGEM", "ANESTESIA", "ORTOPEDIA", "GINECO", "PEDIATRA", "CARDIOLOGIA", "LABORATORIO", "MEDLIFE", "VIDA SEM DOR"]):
        return "Serviços Médicos (PJ/Terceiros)"

    # 3. Utilities & Infrastructure
    if any(x in name for x in ["CEMIG", "COPASA", "ENERGIA", "AGUA"]):
        return "Utilidades (Luz/Água)"
    if any(x in name for x in ["TELEMAR", "OI S.A", "CLARO", "VIVO", "TELEFONICA", "TIM "]):
        return "Utilidades (Comunicação/Internet)"
    
    # 4. Maintenance & Obras
    if any(x in name for x in ["MATERIAIS DE CONSTRUCAO", "CONSTRUCAO", "FERRAGENS", "ELETRICA", "TINTAS", "MANUTENCAO", "AR CONDICIONADO"]):
        return "Manutenção e Obras"
    
    # 5. Insumos & Suprimentos
    if any(x in name for x in ["CIRURGICA", "FARMACEUTICA", "MEDICAMENTOS", "ESTERILIZACAO", "OXIGENIO"]):
        return "Insumos Médicos/Hospitalares"
    if any(x in name for x in ["PAPELARIA", "SUPRIMENTOS", "COPIADORA", "GRAFICA"]):
        return "Suprimentos Administrativos"
    
    # 6. TI & Tecnologia
    if any(x in name for x in ["INFORMATICA", "SOFTWARE", "SISTEMAS", "DELL", "HOST", "TI "]):
        return "TI e Tecnologia"
    
    # 7. Outros Serviços Terceiros
    if any(x in name for x in ["CONTABIL", "AUDITORIA", "CONSULTORIA"]):
        return "Serviços: Contabilidade/Consultoria"
    if any(x in name for x in ["ADVOG", "JURIDICO", "CARTORIO"]):
        return "Serviços: Jurídicos"
    if any(x in name for x in ["SEGURANCA", "VIGILANCIA", "MONITORAMENTO"]):
        return "Serviços: Segurança"
    if any(x in name for x in ["LIMPEZA", "CONSERVACAO", "JARDINAGEM"]):
        return "Serviços: Limpeza/Conservação"
    
    # 8. Financeiro
    if any(x in name for x in ["BANCO", "TARIF", "JUROS", "IOF"]):
        return "Taxas e Serviços Bancários"
    
    return "Outros Operacionais"

def extract_financeiro_data(pdf_path):
    data = []
    seen = set()
    
    print(f"Processando: {os.path.basename(pdf_path)}...")
    
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if not text: continue
            
            lines = text.split('\n')
            
            i = 0
            while i < len(lines):
                line = lines[i]
                
                # Try to find the line with supplier name
                # Example: 00174964 2/3 06/11/2025 145371 000270 - LOPES MATERIAIS DE CONSTRUCAO 05/01/2026 2.493,79 0,00
                match_supplier = re.search(r" - (.+?) (\d{2}/\d{2}/\d{4}) ([\d.,]+)", line)
                
                if match_supplier:
                    supplier_name = match_supplier.group(1).strip()
                    payment_date = match_supplier.group(2)
                    value = clean_value(match_supplier.group(3))
                    
                    match_doc = re.search(r"^(\S+)\s", line)
                    doc_id = match_doc.group(1) if match_doc else ""
                    
                    uniq_key = (doc_id, supplier_name, payment_date, value)
                    if uniq_key in seen:
                        i += 1
                        continue
                    seen.add(uniq_key)
                    
                    # Try to get payment method from the next line
                    payment_method = "Não Identificado"
                    if i + 1 < len(lines):
                        next_line = lines[i+1]
                        method_match = re.search(r"\d{2}/\d{2}/\d{4} \S+ (.+?) [\d.,]+", next_line)
                        if method_match:
                            payment_method = method_match.group(1).strip()
                    
                    data.append({
                        "supplier": supplier_name,
                        "date": payment_date,
                        "value": value,
                        "method": payment_method,
                        "category": categorize_supplier(supplier_name),
                        "month": f"{payment_date[6:]}/{payment_date[3:5]}" # YYYY/MM
                    })
                    i += 1
                i += 1
                    
    return data

def main():
    base_path = r"c:\Users\Marco\Documents\Centro Médico\Financeiro"
    pdf_path = os.path.join(base_path, "RELATORIO_DE_PAGAMENTOS_01_04.pdf")
    
    if not os.path.exists(pdf_path): return

    results = extract_financeiro_data(pdf_path)
    if not results: return

    # Filter by user period: 01/01/2026 to 30/04/2026
    filtered_results = [r for r in results if "2026/01" <= r['month'] <= "2026/04"]
    months = sorted(list(set(r['month'] for r in filtered_results)))
    
    # Aggregations for Dashboard
    # 1. Monthly totals for the behaviour chart
    monthly_totals = [sum(r['value'] for r in filtered_results if r['month'] == m) for m in months]
    
    # 2. Category totals with monthly breakdown
    categories_set = sorted(list(set(r['category'] for r in filtered_results)))
    category_data = []
    for cat in categories_set:
        cat_monthly = [sum(r['value'] for r in filtered_results if r['category'] == cat and r['month'] == m) for m in months]
        category_data.append({
            "name": cat,
            "monthly": cat_monthly,
            "total": sum(cat_monthly)
        })
    category_data.sort(key=lambda x: x['total'], reverse=True)

    # 3. Supplier ranking with monthly breakdown
    suppliers_set = sorted(list(set(r['supplier'] for r in filtered_results)))
    supplier_data = []
    for sup in suppliers_set:
        sup_monthly = [sum(r['value'] for r in filtered_results if r['supplier'] == sup and r['month'] == m) for m in months]
        supplier_data.append({
            "name": sup,
            "monthly": sup_monthly,
            "total": sum(sup_monthly)
        })
    supplier_data.sort(key=lambda x: x['total'], reverse=True)

    dashboard_data = {
        "months": months,
        "monthly_behaviour": monthly_totals,
        "categories": category_data,
        "suppliers": supplier_data,
        "total_period": sum(r['value'] for r in filtered_results),
        "count": len(filtered_results),
        "raw_transactions": filtered_results # Added for detailed view
    }

    js_content = f"const FINANCEIRO_DATA = {json.dumps(dashboard_data, indent=4, ensure_ascii=False)};"
    with open(os.path.join(base_path, "data_financeiro.js"), "w", encoding="utf-8") as f:
        f.write(js_content)
    
    print(f"\n[OK] Dashboards atualizados com estratificação e breakdown mensal.")

if __name__ == "__main__":
    main()
