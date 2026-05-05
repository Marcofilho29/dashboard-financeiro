import pdfplumber
import os

pdf_path = r'c:\Users\Marco\Documents\Centro Médico\Financeiro\RELATORIO_DE_PAGAMENTOS_01_04.pdf'
with pdfplumber.open(pdf_path) as pdf:
    for page in pdf.pages:
        text = page.extract_text()
        if not text: continue
        for line in text.split('\n'):
            if '00176680' in line:
                print(repr(line))
