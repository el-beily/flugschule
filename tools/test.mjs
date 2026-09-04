// End-to-End-Smoke-Test im echten Browser (Chromium via playwright). Aufruf: FLUGSCHULE_PASSWORD='…' npm test
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const PW = process.env.FLUGSCHULE_PASSWORD;
if (!PW) { console.error('FLUGSCHULE_PASSWORD fehlt'); process.exit(1); }
const PORT = 8765, BASE = `http://localhost:${PORT}/`;
const SHOTS = process.env.SHOTS || '';
if (SHOTS) await mkdir(SHOTS, { recursive: true });
const server = spawn(process.execPath, ['tools/serve.mjs', 'docs'], { env: { ...process.env, PORT }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 500));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'de-DE' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('dialog', d => d.accept());
let step = 0;
const shot = async name => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${String(++step).padStart(2, '0')}-${name}.png` }); };
const assert = (cond, msg) => { if (!cond) throw new Error('Assertion: ' + msg); };

try {
  await page.goto(BASE);
  await page.waitForSelector('form[data-form=unlock]');
  await shot('lock');
  // falsches Passwort
  await page.fill('input[name=pw]', 'falsch');
  await page.click('button[type=submit]');
  await page.waitForFunction(() => document.querySelector('[data-err]')?.textContent.includes('Falsches'));
  // richtiges Passwort
  await page.fill('input[name=pw]', PW);
  await page.click('button[type=submit]');
  await page.waitForSelector('form[data-form=login]');
  await shot('login');
  await page.fill('input[name=name]', 'Test Pilot');
  await page.fill('input[name=email]', 'test@example.com');
  await page.click('form[data-form=login] button[type=submit]');
  await page.waitForSelector('.screen-home');
  await shot('home');

  // Lernsession: 10 Fragen, immer erste Antwort (Mehrfachauswahl: prüfen-Button)
  await page.click('[data-action=start-learn]');
  await page.waitForSelector('.screen-quiz');
  await shot('quiz');
  for (let i = 0; i < 10; i++) {
    await page.click('.answer:not(:disabled)');
    if (await page.$('[data-action=check]:not(:disabled)')) await page.click('[data-action=check]');
    await page.waitForSelector('.feedback');
    if (i === 0) await shot('feedback');
    await page.click('[data-action=next]');
  }
  await page.waitForSelector('.screen-result');
  await shot('result');
  const xp = await page.evaluate(() => App.p.xp);
  assert(xp > 0, 'XP nach Lernsession > 0, ist ' + xp);
  assert(await page.evaluate(() => App.p.answered === 10), '10 Antworten verbucht');
  assert(await page.evaluate(() => !!App.p.badges.first), 'Abzeichen "first" vergeben');

  // Prüfung
  await page.click('[data-action=nav][data-screen=home]');
  await page.waitForSelector('.screen-home');
  await page.click('[data-action=nav][data-screen=exam]');
  await page.waitForSelector('form[data-form=exam]');
  await shot('exam-setup');
  if (await page.$('[data-action=start-exam]')) {   // Fachprüfung per Direkteinstieg: starten und gleich abbrechen
    await page.click('[data-action=start-exam]');
    await page.waitForSelector('.screen-quiz .timer');
    assert(await page.evaluate(() => App.session.items.length === App.bank.topics.find(t => t.id === App.session.topic).examQuestions), 'Fachprüfung hat Prüfungsanzahl');
    await page.click('[data-action=quit]');
    await page.waitForSelector('.screen-home');
    await page.click('[data-action=nav][data-screen=exam]');
    await page.waitForSelector('form[data-form=exam]');
  }
  await page.selectOption('select[name=n]', { index: 0 });
  await page.selectOption('select[name=minutes]', { index: 1 });
  const examN = Number(await page.$eval('select[name=n]', el => el.value));
  await page.click('form[data-form=exam] button[type=submit]');
  await page.waitForSelector('.screen-quiz .timer');
  for (let i = 0; i < examN; i++) {
    if (i === 3) { await page.click('[data-action=flag]'); await page.click('[data-action=next]'); continue; } // Frage 4 überspringen + markieren
    await page.click('.answer:not(:disabled)');
    if (i === 5) { await page.click('[data-action=prev]'); await page.click('[data-action=next]'); } // zurück und wieder vor
    await page.click('[data-action=next]');
  }
  await page.waitForSelector('.qgrid');
  await shot('exam-overview');
  assert(await page.evaluate(n => document.querySelectorAll('.qcell.answered').length === n - 1, examN), 'n-1 Fragen in Übersicht beantwortet');
  assert(await page.evaluate(() => document.querySelectorAll('.qcell.flagged').length === 1), '1 Frage markiert');
  await page.click('.qcell:not(.answered)');
  await page.waitForSelector('.exam-nav');
  await page.click('.answer:not(:disabled)');
  await page.click('[data-action=overview]');
  await page.waitForSelector('.qgrid');
  assert(await page.evaluate(n => document.querySelectorAll('.qcell.answered').length === n, examN), 'alle beantwortet');
  await page.click('[data-action=finish-exam]');
  await page.waitForSelector('.screen-result');
  assert(await page.evaluate(n => App.p.exams.length === 1 && App.p.exams[0].total === n, examN), 'Prüfung gespeichert');
  assert(await page.evaluate(n => App.p.answered === 10 + n, examN), 'Prüfungsantworten verbucht');
  await shot('exam-result');

  // Statistik + Profil
  await page.click('[data-action=nav][data-screen=home]');
  await page.waitForSelector('.screen-home');
  await page.click('[data-action=nav][data-screen=stats]');
  await page.waitForSelector('.chart');
  await shot('stats');
  await page.click('[data-action=nav][data-screen=topics]');
  await page.waitForSelector('[data-action=open-topic]');
  await shot('topics');
  await page.click('[data-action=open-topic]');
  await page.waitForSelector('.screen-topic');
  await shot('topic');
  await page.click('[data-action=back]');
  await page.click('[data-action=nav][data-screen=profile]');
  await page.waitForSelector('[data-action=export]');
  await shot('profile');

  // Reload: gespeicherter Schlüssel + Profil → direkt Home
  await page.reload();
  await page.waitForSelector('.screen-home', { timeout: 10000 });
  assert(await page.evaluate(n => App.p.answered === 10 + n, examN), 'Fortschritt nach Reload erhalten');

  // Sperren → Lock-Screen
  await page.click('[data-action=nav][data-screen=profile]');
  await page.click('[data-action=lock]');
  await page.waitForSelector('form[data-form=unlock]');
  await page.reload();
  await page.waitForSelector('form[data-form=unlock]');

  const filtered = errors.filter(e => !/favicon|sw\.js|serviceWorker/i.test(e));
  if (filtered.length) throw new Error('Browser-Fehler:\n' + filtered.join('\n'));
  console.log('✔ Alle Smoke-Tests bestanden');
} catch (e) {
  console.error('✖ ' + e.message);
  if (errors.length) console.error(errors.join('\n'));
  await shot('failure');
  process.exitCode = 1;
} finally {
  await browser.close();
  server.kill();
}
