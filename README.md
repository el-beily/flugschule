# Flugschule – Prüfungstrainer 🛩️

Kleine Lern-App zur Prüfungsvorbereitung für Flugschul-Fragen. Läuft als statische
Web-App (PWA) auf GitHub Pages – kein Server, kein Backend, keine Kosten.

**Features**

- 🔐 Passwortschutz: Der Fragenkatalog liegt **verschlüsselt** im Repo (AES-256-GCM,
  Schlüssel per PBKDF2 aus dem Passwort). Ohne Passwort sind die Fragen nicht lesbar –
  auch nicht im öffentlichen Repo.
- 👤 Profile mit Name + E-Mail, Fortschritt wird auf dem Gerät gespeichert
  (Export/Import zum Übertragen auf andere Geräte).
- 📚 Lernen nach Thema, „Weiterlernen“ mit cleverer Fragenauswahl (Leitner-System:
  falsch beantwortete Fragen kommen früher wieder), Fehler wiederholen.
- 📝 Prüfungssimulation mit Zeitlimit, Bestehensgrenze und Auswertung.
- 🎮 Gamification: XP, Level, Piloten-Ränge, Tagesziel, Streaks, Abzeichen, Konfetti,
  Ergebnis teilen.
- 📱 Mobile-first, Dark Mode, installierbar als App, offline nutzbar.

## Veröffentlichen (GitHub Pages)

Einmalig in den Repo-Einstellungen: **Settings → Pages → Source: „GitHub Actions“**.
Danach deployt jeder Push auf `main` automatisch (`.github/workflows/pages.yml`).
Alternativ geht auch *Source: „Deploy from a branch“ → `main` / `/docs`*.

Die App liegt dann unter `https://<user>.github.io/<repo>/`.

## Fragenkatalog pflegen

Der Klartext-Katalog `content/questions.json` ist per `.gitignore` **vom Repo
ausgeschlossen** – bitte separat sicher aufbewahren. Das Format zeigt
`content/questions.example.json`:

```jsonc
{
  "meta": { "title": "…", "version": "2026-09", "exam": { "questions": 20, "minutes": 30, "passPercent": 75 } },
  "topics": [ { "id": "nav", "name": "Navigation", "icon": "🧭" } ],
  "questions": [
    { "id": "nav-001", "topic": "nav", "q": "Fragetext", "a": ["Antwort A", "Antwort B", "Antwort C", "Antwort D"],
      "correct": 0,                 // Index der richtigen Antwort, oder [0, 2] bei Mehrfachauswahl
      "explanation": "optional", "ref": "optional, z. B. Seite in der PDF", "image": "optional (data:-URL)" }
  ]
}
```

Befehle (Node ≥ 18, keine Abhängigkeiten nötig):

```bash
npm run validate                                   # Katalog prüfen
FLUGSCHULE_PASSWORD='…' npm run encrypt            # → docs/data/questions.enc.json (committen!)
FLUGSCHULE_PASSWORD='…' npm run decrypt -- docs/data/questions.enc.json content/questions.json   # Klartext zurückholen
npm run serve                                      # lokal testen: http://localhost:8080
```

**Passwort ändern** = Katalog mit neuem Passwort neu verschlüsseln und pushen.
Nutzer müssen sich danach einmal neu anmelden.

## Tests

```bash
FLUGSCHULE_PASSWORD='…' NODE_PATH=$(npm root -g) npm test   # End-to-End im Chromium (benötigt playwright)
```

## Grenzen

- Der Fortschritt liegt im Browser (localStorage) des jeweiligen Geräts. Es gibt keinen
  zentralen Server – daher Export/Import im Profil. Ein Backend (z. B. Supabase) ließe
  sich später ergänzen, `Store` in `docs/assets/js/store.js` ist die einzige Stelle dafür.
- Client-seitige Verschlüsselung schützt die Inhalte vor Mitlesen im Repo; wer das
  Passwort hat, kann die Fragen natürlich sehen.
