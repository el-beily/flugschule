// Prüft einen Fragenkatalog auf Schema-Fehler. Aufruf: node tools/validate.mjs [content/questions.json]
import { readFile } from 'node:fs/promises';

export function validateBank(bank) {
  const errors = [];
  const warn = [];
  if (!bank || typeof bank !== 'object') return { errors: ['Katalog ist kein Objekt'], warn };
  if (!bank.meta || typeof bank.meta !== 'object') errors.push('meta fehlt');
  if (!Array.isArray(bank.topics) || bank.topics.length === 0) errors.push('topics fehlt oder ist leer');
  if (!Array.isArray(bank.questions) || bank.questions.length === 0) errors.push('questions fehlt oder ist leer');
  if (errors.length) return { errors, warn };

  const topicIds = new Set();
  bank.topics.forEach((t, i) => {
    if (!t.id) errors.push(`topics[${i}]: id fehlt`);
    if (!t.name) errors.push(`topics[${i}]: name fehlt`);
    if (topicIds.has(t.id)) errors.push(`topics[${i}]: doppelte id "${t.id}"`);
    topicIds.add(t.id);
  });

  const qIds = new Set();
  const perTopic = {};
  bank.questions.forEach((q, i) => {
    const where = `questions[${i}]${q.id ? ` (${q.id})` : ''}`;
    if (!q.id) errors.push(`${where}: id fehlt`);
    else if (qIds.has(q.id)) errors.push(`${where}: doppelte id`);
    qIds.add(q.id);
    if (!topicIds.has(q.topic)) errors.push(`${where}: unbekanntes topic "${q.topic}"`);
    if (!q.q || typeof q.q !== 'string') errors.push(`${where}: Fragetext (q) fehlt`);
    if (!Array.isArray(q.a) || q.a.length < 2) errors.push(`${where}: mindestens 2 Antworten (a) nötig`);
    else {
      q.a.forEach((a, j) => { if (typeof a !== 'string' || !a.trim()) errors.push(`${where}: Antwort ${j} leer`); });
      const correct = Array.isArray(q.correct) ? q.correct : [q.correct];
      if (correct.length === 0) errors.push(`${where}: correct fehlt`);
      correct.forEach(c => {
        if (!Number.isInteger(c) || c < 0 || c >= q.a.length) errors.push(`${where}: correct=${c} außerhalb 0..${q.a.length - 1}`);
      });
      if (new Set(correct).size !== correct.length) errors.push(`${where}: correct enthält Duplikate`);
    }
    if (q.explanation != null && typeof q.explanation !== 'string') warn.push(`${where}: explanation ist kein String`);
    perTopic[q.topic] = (perTopic[q.topic] || 0) + 1;
  });
  bank.topics.forEach(t => { if (!perTopic[t.id]) warn.push(`Thema "${t.name}" hat keine Fragen`); });
  return { errors, warn, stats: { topics: bank.topics.length, questions: bank.questions.length, perTopic } };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const file = process.argv[2] || 'content/questions.json';
  const bank = JSON.parse(await readFile(file, 'utf8'));
  const { errors, warn, stats } = validateBank(bank);
  if (stats) {
    console.log(`✔ ${stats.questions} Fragen in ${stats.topics} Themen`);
    for (const [t, n] of Object.entries(stats.perTopic)) console.log(`   ${t}: ${n}`);
  }
  warn.forEach(w => console.warn('⚠ ' + w));
  errors.forEach(e => console.error('✖ ' + e));
  process.exit(errors.length ? 1 : 0);
}
