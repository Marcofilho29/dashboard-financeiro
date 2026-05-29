import pdfplumber
import re
import os

def clean_value(val_str):
    if not val_str: return 0.0
    val_str = val_str.replace('.', '').replace(',', '.').strip()
    try:
        return float(val_str)
    except ValueError:
        return 0.0

pdf_path = r'c:\Users\Marco\Documents\Centro Médico\Financeiro\RELATORIO_DE_PAGAMENTOS_01_04.pdf'
seen = set()
with pdfplumber.open(pdf_path) as pdf:
    for page in pdf.pages:
        text = page.extract_text()
        if not text: continue
        lines = text.split('\n')
        i = 0
        while i < len(lines):
            line = lines[i]
            match_supplier = re.search(r" - (.+?) (\d{2}/\d{2}/\d{4}) ([\d.,]+)", line)
            if match_supplier:
                supplier = match_supplier.group(1).strip()
                date = match_supplier.group(2)
                val = clean_value(match_supplier.group(3))
                
                match_doc = re.search(r"^(\S+)\s", line)
                doc_id = match_doc.group(1) if match_doc else ""
                
                key = (doc_id, supplier, date, val)
                if key in seen:
                    print(f"DUPLICATE SKIPPED: {key}")
                else:
                    if 'SALARIO' in supplier or val > 200000:
                        print(f"ADDED: {key}")
                    seen.add(key)
            i += 1
