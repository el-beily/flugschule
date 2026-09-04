// Erzeugt PNG-Icons aus assets/icon.svg (benötigt global installiertes playwright + Chromium).
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const svg = await readFile('docs/assets/icon.svg', 'utf8');
const browser = await chromium.launch();
for (const size of [192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await page.screenshot({ path: `docs/assets/icon-${size}.png`, omitBackground: true });
  await page.close();
}
await browser.close();
console.log('✔ Icons erzeugt');
