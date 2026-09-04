// Wandelt das einfache Textformat (content/questions.md) in den JSON-Katalog um.
// Aufruf: node tools/md2json.mjs [content/questions.md] [content/questions.json]
//
// Format:
//   meta: title = Flugschule Prüfungstrainer      (beliebige meta-Felder; exam.questions, exam.minutes, exam.passPercent)
//   # nav | Navigation | 🧭                        (Thema: id | Name | Icon)
//   ## Fragetext (mehrzeilig erlaubt)
//   - falsche Antwort
//   * richtige Antwort                            (mehrere * = Mehrfachauswahl)
//   - falsche Antwort
//   > Erklärung (optional)
//   @ Quelle, z. B. Seite 12 (optional)
//   Kommentare beginnen mit //
import { readFile, writeFile } from 'node:fs/promises';
import { validateBank } from './validate.mjs';

const inFile = process.argv[2] || 'content/questions.md';
const outFile = process.argv[3] || 'content/questions.json';
const lines = (await readFile(inFile, 'utf8')).split(/\r?\n/);

const bank = { meta: { exam: {} }, topics: [], questions: [] };
let topic = null, q = null, counter = {};
const setMeta = (k, v) => { if (k.startsWith('exam.')) bank.meta.exam[k.slice(5)] = Number(v); else if (v === 'true' || v === 'false') bank.meta[k] = v === 'true'; else bank.meta[k] = v; };
const flush = () => { if (q) { if (!q.a.length) throw new Error(`Frage ohne Antworten: "${q.q.slice(0, 50)}"`); if (!q.correct.length) throw new Error(`Frage ohne richtige Antwort: "${q.q.slice(0, 50)}"`); q.correct = q.correct.length === 1 ? q.correct[0] : q.correct; bank.questions.push(q); q = null; } };

for (let n = 0; n < lines.length; n++) {
  const raw = lines[n], line = raw.trim();
  if (!line || line.startsWith('//')) continue;
  let m;
  if ((m = line.match(/^meta:\s*([\w.]+)\s*=\s*(.*)$/))) { setMeta(m[1], m[2].trim()); continue; }
  if ((m = line.match(/^#\s+(?!#)(.+)$/))) {
    flush();
    const [id, name, icon] = m[1].split('|').map(s => s.trim());
    topic = { id, name: name || id, icon: icon || '📘' };
    bank.topics.push(topic); counter[id] = 0; continue;
  }
  if ((m = line.match(/^##\s+(.+)$/))) {
    flush();
    if (!topic) throw new Error(`Zeile ${n + 1}: Frage vor dem ersten Thema`);
    counter[topic.id]++;
    q = { id: `${topic.id}-${String(counter[topic.id]).padStart(3, '0')}`, topic: topic.id, q: m[1].trim(), a: [], correct: [] };
    continue;
  }
  if (!q) throw new Error(`Zeile ${n + 1}: Text außerhalb einer Frage: "${line}"`);
  if ((m = line.match(/^([-*])\s+(.+)$/))) { if (m[1] === '*') q.correct.push(q.a.length); q.a.push(m[2].trim()); continue; }
  if ((m = line.match(/^>\s*(.*)$/))) { q.explanation = (q.explanation ? q.explanation + '\n' : '') + m[1]; continue; }
  if ((m = line.match(/^@\s*(.*)$/))) { q.ref = m[1]; continue; }
  if ((m = line.match(/^!img\s+(.+)$/))) { q.image = m[1].trim(); continue; }
  // Fortsetzungszeile: gehört zum Fragetext (vor den Antworten) bzw. zur letzten Antwort
  if (!q.a.length) q.q += '\n' + line; else q.a[q.a.length - 1] += ' ' + line;
}
flush();

const { errors, warn, stats } = validateBank(bank);
warn.forEach(w => console.warn('⚠ ' + w));
if (errors.length) { errors.forEach(e => console.error('✖ ' + e)); process.exit(1); }
await writeFile(outFile, JSON.stringify(bank, null, 2) + '\n');
console.log(`✔ ${stats.questions} Fragen in ${stats.topics} Themen → ${outFile}`);
