import pdfplumber
import re
import os

pdf_path = r'c:\Users\Marco\Documents\Centro Médico\Financeiro\RELATORIO_DE_PAGAMENTOS_01_04.pdf'
with pdfplumber.open(pdf_path) as pdf:
    for page_num, page in enumerate(pdf.pages):
        text = page.extract_text()
        if not text: continue
        lines = text.split('\n')
        for i, line in enumerate(lines):
            match = re.search(r"^(\S+)\s+(.+?) - (.+?) (\d{2}/\d{2}/\d{4}) ([\d.,]+)", line)
            if match:
                doc_id = match.group(1)
                supplier = match.group(3).strip()
                val = match.group(5)
                date = match.group(4)
                if 'SALARIO' in supplier or val.startswith('201.'):
                    print(f"DocID: {doc_id} | {date} | {supplier} | {val}")
