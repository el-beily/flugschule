// Entschlüsselt den Katalog wieder (z. B. um den Klartext zu rekonstruieren).
// Aufruf: FLUGSCHULE_PASSWORD='…' node tools/decrypt.mjs [docs/data/questions.enc.json] [content/questions.json]
import { readFile, writeFile } from 'node:fs/promises';

const password = process.env.FLUGSCHULE_PASSWORD;
if (!password) { console.error('FLUGSCHULE_PASSWORD fehlt'); process.exit(1); }
const inFile = process.argv[2] || 'docs/data/questions.enc.json';
const outFile = process.argv[3];

const payload = JSON.parse(await readFile(inFile, 'utf8'));
const u8 = s => new Uint8Array(Buffer.from(s, 'base64'));
const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
const key = await crypto.subtle.deriveKey(
  { name: 'PBKDF2', salt: u8(payload.salt), iterations: payload.iter, hash: 'SHA-256' },
  keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
);
let plain;
try {
  plain = new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u8(payload.iv) }, key, u8(payload.ct)));
} catch {
  console.error('✖ Entschlüsselung fehlgeschlagen – falsches Passwort?');
  process.exit(1);
}
if (outFile) { await writeFile(outFile, JSON.stringify(JSON.parse(plain), null, 2) + '\n'); console.log(`✔ Klartext → ${outFile}`); }
else process.stdout.write(plain + '\n');
