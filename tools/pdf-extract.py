#!/usr/bin/env python3
"""Extrahiert den Text einer PDF seitenweise (mit Seitenmarkern) – Vorarbeit für den Fragenkatalog.
Aufruf: python3 tools/pdf-extract.py content/fragen.pdf [content/fragen.txt]
Versucht pdfplumber (layout-treuer), fällt auf pypdf zurück."""
import sys

src = sys.argv[1] if len(sys.argv) > 1 else None
if not src:
    print(__doc__); sys.exit(1)
dst = sys.argv[2] if len(sys.argv) > 2 else src.rsplit('.', 1)[0] + '.txt'

pages = []
try:
    import pdfplumber
    with pdfplumber.open(src) as pdf:
        for pg in pdf.pages:
            pages.append(pg.extract_text(x_tolerance=1.5, y_tolerance=3) or '')
    engine = 'pdfplumber'
except Exception as e:  # noqa
    from pypdf import PdfReader
    pages = [(p.extract_text() or '') for p in PdfReader(src).pages]
    engine = 'pypdf'

with open(dst, 'w', encoding='utf-8') as f:
    for i, t in enumerate(pages, 1):
        f.write(f'\n\n===== SEITE {i} =====\n{t}')
empty = sum(1 for t in pages if not t.strip())
print(f'✔ {len(pages)} Seiten via {engine} → {dst}' + (f' (⚠ {empty} Seiten ohne Text – evtl. gescannt, dann OCR nötig)' if empty else ''))
