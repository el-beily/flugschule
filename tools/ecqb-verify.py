#!/usr/bin/env python3
"""Unabhängige Gegenprüfung des Katalogs gegen die PDFs mit einem zweiten Extraktor (pypdf).
Prüft je Frage: Fragetext vorhanden, alle 4 Antworten vorhanden, genau die markierte Antwort folgt auf das
Häkchen-Glyph. Zählt außerdem Fragen- und Häkchenanzahl je PDF. Aufruf: python3 tools/ecqb-verify.py content/pdf/*.pdf"""
import json, re, sys, unicodedata
from pypdf import PdfReader

CHECKED, UNCHECKED = '', ''
bank = json.load(open('content/questions.json', encoding='utf-8'))
by_code = {t['code']: t['id'] for t in bank['topics']}
qs_by_topic = {}
for q in bank['questions']: qs_by_topic.setdefault(q['topic'], []).append(q)

def norm(s):
    s = unicodedata.normalize('NFKC', s)
    s = re.sub(r'\(\d+,\d{2} P\.\)', ' ', s)
    s = re.sub(r'-\s+', '-', s)           # Trennstriche
    s = re.sub(r'[\s ]+', ' ', s)
    return s.strip().lower()

total_err = 0
for f in sys.argv[1:]:
    reader = PdfReader(f)
    raw = '\n'.join((p.extract_text() or '') for p in reader.pages)
    code = re.search(r'^(\d{2}) – ', raw, re.M).group(1)
    sid = by_code[code]; qs = qs_by_topic[sid]
    n_checked, n_unchecked = raw.count(CHECKED), raw.count(UNCHECKED)
    # Fragen-Nummern in Reihenfolge finden (Zeilenanfang "N " mit N = nächste erwartete Nummer)
    text = norm(raw.replace(CHECKED, ' §CHK§ ').replace(UNCHECKED, ' §UNC§ '))
    errs = []
    if n_checked != len(qs): errs.append(f'{n_checked} Häkchen, aber {len(qs)} Fragen im Katalog')
    if n_checked + n_unchecked != 4 * len(qs): errs.append(f'{n_checked + n_unchecked} Kästchen ≠ 4×{len(qs)}')
    pos = 0
    for q in qs:
        nq = norm(q['q']).replace('\n', ' ')
        # Fragetext: als Wortfolge suchen (Zeilenumbrüche/Leerzeichen sind normalisiert)
        i = text.find(nq, pos)
        if i < 0:
            # Toleranz: Fragetext in Häppchen prüfen (pypdf bricht manchmal Wörter anders)
            parts = [p for p in re.split(r'[.?!:;,]\s', nq) if len(p) > 12]
            miss = [p for p in parts if text.find(p, pos) < 0]
            if miss: errs.append(f'{q["id"]}: Fragetext nicht gefunden: {miss[:2]}')
            i = pos
        pos = i
        # Antworten: die 4 Kästchen nach der Frage
        seg_end = text.find('§chk§', pos)
        boxes = [(m.start(), m.group(0)) for m in re.finditer(r'§(chk|unc)§', text[pos:pos + 6000])]
        if len(boxes) < 4: errs.append(f'{q["id"]}: weniger als 4 Kästchen gefunden'); continue
        boxes = boxes[:4]
        for k, (bpos, kind) in enumerate(boxes):
            start = pos + bpos + 5
            end = pos + boxes[k + 1][0] if k < 3 else start + 400
            seg = text[start:end]
            na = norm(q['a'][k])
            if not seg.startswith(na[:40]) and seg.replace(' ', '').find(na.replace(' ', '')[:40]) < 0:
                errs.append(f'{q["id"]}: Antwort {k + 1} weicht ab: PDF "{seg[:50]}" ≠ Katalog "{na[:50]}"')
            if (kind == '§chk§') != (q['correct'] == k):
                errs.append(f'{q["id"]}: Lösung weicht ab (PDF markiert {"Antwort " + str(k + 1) if kind == "§chk§" else "nicht " + str(k + 1)}, Katalog: {q["correct"] + 1})')
        pos = pos + boxes[3][0] + 5
    total_err += len(errs)
    print(f'{"✔" if not errs else "✖"} {code} {sid}: {len(qs)} Fragen, {n_checked} Häkchen, {n_unchecked} leere Kästchen, {len(errs)} Abweichungen')
    for e in errs[:30]: print('   ' + e)
print('✔ Gegenprüfung ohne Abweichungen' if not total_err else f'✖ {total_err} Abweichungen')
sys.exit(1 if total_err else 0)
