// Verschlüsselt den Fragenkatalog für die Veröffentlichung im (öffentlichen) Repo.
// Aufruf: FLUGSCHULE_PASSWORD='…' node tools/encrypt.mjs [content/questions.json] [docs/data/questions.enc.json]
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { validateBank } from './validate.mjs';

const ITERATIONS = 250000;
const password = process.env.FLUGSCHULE_PASSWORD;
if (!password) {
  console.error('Bitte Passwort per Umgebungsvariable setzen: FLUGSCHULE_PASSWORD=\'…\' npm run encrypt');
  process.exit(1);
}
const inFile = process.argv[2] || 'content/questions.json';
const outFile = process.argv[3] || 'docs/data/questions.enc.json';

const bank = JSON.parse(await readFile(inFile, 'utf8'));
const { errors, warn, stats } = validateBank(bank);
warn.forEach(w => console.warn('⚠ ' + w));
if (errors.length) { errors.forEach(e => console.error('✖ ' + e)); process.exit(1); }

const enc = new TextEncoder();
const salt = crypto.getRandomValues(new Uint8Array(16));
const iv = crypto.getRandomValues(new Uint8Array(12));
const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
const key = await crypto.subtle.deriveKey(
  { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
  keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt']
);
const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(bank))));
const b64 = u8 => Buffer.from(u8).toString('base64');
const payload = {
  v: 1, kdf: 'PBKDF2-SHA256', cipher: 'AES-256-GCM', iter: ITERATIONS,
  salt: b64(salt), iv: b64(iv), ct: b64(ct),
  bankVersion: bank.meta?.version || null, questions: stats.questions, builtAt: new Date().toISOString()
};
await mkdir(dirname(outFile), { recursive: true });
await writeFile(outFile, JSON.stringify(payload));
await writeFile(outFile.replace(/[^/]+$/, 'version.json'), JSON.stringify({ builtAt: payload.builtAt, bankVersion: payload.bankVersion, questions: stats.questions }));
console.log(`✔ ${stats.questions} Fragen verschlüsselt → ${outFile} (${(ct.length / 1024).toFixed(1)} KB)`);
