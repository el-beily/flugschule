#!/usr/bin/env python3
"""Parst die ECQB-PPL(A)-Fragenkataloge (PDF, aircademy/EDUCADEMY-Layout) in den Katalog der App.

Aufruf: python3 tools/ecqb-parse.py content/pdf/*.pdf  → content/questions.json

Erkennung: Fragen sind fortlaufend nummeriert, enden mit "(x,xx P.)"; Antworten beginnen
mit einem Kästchen-Glyph: U+F0A8 = leer, U+F0FE = angekreuzt (richtige Antwort).
"Siehe Anlage N" verweist auf Bild-Anlagen am Ende des PDFs, die als Data-URI eingebettet werden.
Der Parser ist streng: jede Textzeile muss einer Frage/Antwort zugeordnet werden, sonst Abbruch."""
import base64, io, json, re, sys
import pdfplumber

UNCHECKED, CHECKED = '', ''
SUBJECTS = {  # ECQB-Code → id, Name, Icon, Fragen in der Prüfung (Angabe des Nutzers)
    '10': ('alw', 'Luftrecht', '📜', 16),
    '20': ('agk', 'Luftfahrzeugkunde', '🔧', 16),
    '30': ('met', 'Meteorologie', '🌦️', 16),
    '40': ('com', 'Kommunikation', '📻', 12),
    '50': ('nav', 'Navigation', '🧭', 12),
    '51': ('pfa', 'Aerodynamik', '🛩️', 12),
    '60': ('opr', 'Betriebliche Verfahren', '📋', 12),
    '70': ('fpp', 'Flugplanung', '🗺️', 12),
    '80': ('hpl', 'Menschliches Leistungsvermögen', '🧠', 12),
}
HEADER_RE = re.compile(r'^\d+ .*ECQB-PPL\(A\)$')
FOOTER_RE = re.compile(r'^v\d{4}\.\d+ \d+$')
POINTS_RE = re.compile(r'\s*\((\d+,\d{2}) P\.\)\s*$')
ANNEX_RE = re.compile(r'^Siehe Anlage (\d+)\s*$')

def page_lines(pg):
    txt = pg.extract_text(x_tolerance=1.5, y_tolerance=3) or ''
    return [l.rstrip() for l in txt.split('\n')]

def join_lines(lines, log):
    """Zeilen zu Text verbinden; Silbentrennung am Zeilenende wird gemeldet und ohne Leerzeichen verbunden."""
    out = ''
    for l in lines:
        l = l.strip()
        if not l: continue
        if not out: out = l; continue
        if out.endswith('-') and not out.endswith(' -'):
            # Trennstrich am Zeilenende: "ISA-" + "Bedingungen" → "ISA-Bedingungen";
            # vor Konjunktion bleibt ein Leerzeichen: "Beschränkungs-" + "und Gefahrengebiete"
            sep = ' ' if re.match(r'^(und|oder|bzw\.|sowie|beziehungsweise)\b', l) else ''
            log.append(f'Trennstrich: "{out[-25:]}"{sep!r}"{l[:20]}"')
            out += sep + l
        elif re.match(r'^[a-h]\) ', l) or re.match(r'^[a-h]\) ', out.split('\n')[-1]) or out.startswith('(Verwenden Sie') and out.endswith(')') and '\n' not in out:
            out += '\n' + l            # Aufzählungen a) b) c) … zeilenweise erhalten
        else:
            out += ' ' + l
    return out

def parse_pdf(path, log):
    with pdfplumber.open(path) as pdf:
        first = (pdf.pages[0].extract_text() or '')
        m = re.search(r'^(\d{2}) – ', first, re.M)
        code = m.group(1)
        sid, name, icon, exam_n = SUBJECTS[code]
        title = re.sub(r'\s+', ' ', first[m.start():].split('\n(Auszug)')[0]).strip()
        version = re.search(r'(v\d{4}\.\d+)', pdf.pages[1].extract_text() or pdf.pages[2].extract_text() or '')
        version = version.group(1) if version else '?'

        # 1) Textzeilen aller Fragen-Seiten einsammeln (bis "Anlagen zu den Aufgaben")
        lines, annex_pages = [], {}
        for pno, pg in enumerate(pdf.pages, 1):
            pl = page_lines(pg)
            if pl and pl[0].startswith('Anlagen zu den Aufgaben'):
                n = int(re.search(r'Anlage (\d+)', pl[1]).group(1))
                annex_pages[n] = pg
                continue
            if pno <= 2: continue   # Titel + Impressum
            for l in pl:
                if not l.strip() or HEADER_RE.match(l) or FOOTER_RE.match(l): continue
                lines.append((pno, l))

        # 2) Fragen parsen
        questions, i, expected = [], 0, 1
        while i < len(lines):
            pno, l = lines[i]
            m = re.match(r'^(\d+) (.*)$', l)
            if not (m and int(m.group(1)) == expected):
                raise SystemExit(f'{path} S.{pno}: erwartet Frage {expected}, gefunden: "{l}"')
            qlines, i = [m.group(2)], i + 1
            # Fragetext bis zur Punktangabe "(x,xx P.)" (kann auf eigener Zeile stehen)
            while not POINTS_RE.search(' '.join(qlines)):
                if i >= len(lines): raise SystemExit(f'Frage {expected}: Punktangabe fehlt')
                qlines.append(lines[i][1]); i += 1
            qtext = join_lines(qlines, log)
            points = float(POINTS_RE.search(qtext).group(1).replace(',', '.'))
            qtext = POINTS_RE.sub('', qtext).strip()
            annex = None
            if i < len(lines) and ANNEX_RE.match(lines[i][1]):
                annex = int(ANNEX_RE.match(lines[i][1]).group(1)); i += 1
            # Antworten
            answers, correct = [], []
            while i < len(lines) and not (re.match(r'^(\d+) ', lines[i][1]) and int(re.match(r'^(\d+) ', lines[i][1]).group(1)) == expected + 1 and answers):
                l = lines[i][1]
                if l[:1] in (UNCHECKED, CHECKED):
                    if l[0] == CHECKED: correct.append(len(answers))
                    answers.append([l[1:].strip()])
                elif answers:
                    answers[-1].append(l)
                else:
                    raise SystemExit(f'Frage {expected} S.{lines[i][0]}: unerwartete Zeile "{l}"')
                i += 1
            answers = [join_lines(a, log) for a in answers]
            if len(answers) != 4 or len(correct) != 1:
                raise SystemExit(f'Frage {expected}: {len(answers)} Antworten, {len(correct)} richtig')
            q = {'id': f'{sid}-{expected:03d}', 'topic': sid, 'q': qtext, 'a': answers, 'correct': correct[0], 'ref': f'ECQB-PPL {code} Nr. {expected}', 'points': points, 'page': pno}
            if annex is not None:
                if annex not in annex_pages: raise SystemExit(f'Frage {expected}: Anlage {annex} nicht gefunden')
                q['annex'] = annex
            questions.append(q); expected += 1

        # 3) Anlagen als Bilder
        images = {}
        for n, pg in annex_pages.items():
            if len(pg.images) != 1: raise SystemExit(f'Anlage {n}: {len(pg.images)} Bilder')
            im = pg.images[0]
            bbox = (max(0, im['x0'] - 2), im['top'] + 0.5, min(pg.width, im['x1'] + 2), min(pg.height, im['bottom'] + 2))
            res = 300 if im['width'] < 220 else 150   # kleine Symbolbilder schärfer
            pil = pg.crop(bbox).to_image(resolution=res).original.convert('RGB')
            buf = io.BytesIO(); pil.save(buf, format='JPEG', quality=82, optimize=True)
            images[n] = 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode()
        used = {q['annex'] for q in questions if 'annex' in q}
        unused = set(annex_pages) - used
        if unused: log.append(f'{sid}: Anlagen ohne Fragebezug: {sorted(unused)}')
        for q in questions:
            if 'annex' in q: q['image'] = f'img:{sid}-{q.pop("annex")}'
        images = {f'{sid}-{n}': uri for n, uri in images.items()}
        return {'id': sid, 'name': name, 'icon': icon, 'examQuestions': exam_n, 'source': f'ECQB-PPL(A) {title} ({version})', 'code': code, 'version': version}, questions, images

def main():
    files = sys.argv[1:] or sys.exit(__doc__)
    log, topics, questions, images = [], [], [], {}
    for f in files:
        t, qs, ims = parse_pdf(f, log)
        topics.append(t); questions += qs; images.update(ims)
        imgs = sum(1 for q in qs if 'image' in q)
        print(f'✔ {t["code"]} {t["name"]}: {len(qs)} Fragen, {imgs} mit Bild, {sum(q["points"] for q in qs):.0f} Punkte')
    topics.sort(key=lambda t: t['code'])
    order = {t['id']: i for i, t in enumerate(topics)}
    questions.sort(key=lambda q: (order[q['topic']], q['id']))
    bank = {
        'meta': {'title': 'PPL(A) Prüfungstrainer', 'subtitle': 'ECQB-PPL Fragenkatalog', 'version': 'Katalog ' + '/'.join(sorted({t['version'] for t in topics})),
                 'source': 'ECQB-PPL(A) Fragenkataloge (Auszug, EDUCADEMY GmbH / aircademy)', 'exam': {'questions': sum(t['examQuestions'] for t in topics), 'passPercent': 75}},
        'topics': topics, 'questions': questions, 'images': images,
    }
    with open('content/questions.json', 'w', encoding='utf-8') as fh: json.dump(bank, fh, ensure_ascii=False, indent=1)
    for l in log: print('ℹ ' + l)
    print(f'✔ Gesamt: {len(questions)} Fragen in {len(topics)} Themen, {len(images)} Bilder ({sum(len(v) for v in images.values())//1024} KB) → content/questions.json')

main()
