// Erzeugt aus dem JSON-Katalog eine lesbare Textfassung (ohne Bilder) zum Gegenlesen.
// Aufruf: node tools/json2md.mjs [content/questions.json] [content/questions.md]
import { readFile, writeFile } from 'node:fs/promises';
const bank = JSON.parse(await readFile(process.argv[2] || 'content/questions.json', 'utf8'));
let out = `// ${bank.meta.title} – ${bank.meta.subtitle || ''} (${bank.meta.version || ''})\n// Quelle: ${bank.meta.source || ''}\n`;
for (const [k, v] of Object.entries(bank.meta)) if (typeof v !== 'object') out += `meta: ${k} = ${v}\n`;
for (const [k, v] of Object.entries(bank.meta.exam || {})) out += `meta: exam.${k} = ${v}\n`;
for (const t of bank.topics) {
  const qs = bank.questions.filter(q => q.topic === t.id);
  out += `\n\n# ${t.id} | ${t.name} | ${t.icon || ''}\n// ${qs.length} Fragen${t.examQuestions ? `, ${t.examQuestions} in der Prüfung` : ''}${t.source ? ` – ${t.source}` : ''}\n`;
  for (const q of qs) {
    out += `\n## ${q.q.replace(/\n/g, '\n   ')}\n`;
    if (q.image) out += `!img ${q.image}\n`;
    const c = new Set(Array.isArray(q.correct) ? q.correct : [q.correct]);
    q.a.forEach((a, i) => { out += `${c.has(i) ? '*' : '-'} ${a}\n`; });
    if (q.explanation) out += `> ${q.explanation}\n`;
    if (q.ref) out += `@ ${q.ref}${q.points && q.points !== 1 ? ` (${q.points} Punkte)` : ''}\n`;
  }
}
await writeFile(process.argv[3] || 'content/questions.md', out);
console.log(`✔ ${bank.questions.length} Fragen → ${process.argv[3] || 'content/questions.md'}`);
