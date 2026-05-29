import pdfplumber

print("=== CONTAS A RECEBER ===")
with pdfplumber.open(r"Contas à Receber\RELATORIO DE CONTAS A RECEBER.pdf") as pdf:
    print("Pages:", len(pdf.pages))
    print("--- Page 1 ---")
    print(pdf.pages[0].extract_text()[:3000])
    print("--- Last Page ---")
    print(pdf.pages[-1].extract_text()[:2000])
