// Renders the brand mark SVG to the PNG sizes Chrome needs.
// Usage: node tools/make-icons.mjs
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const { chromium } = createRequire(import.meta.url)('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'src/assets/icons');
mkdirSync(out, { recursive: true });

// Thicker strokes at small sizes keep the U-turn legible in the toolbar.
const mark = (size) => {
  const sw = size <= 16 ? 8 : size <= 32 ? 7 : 6;
  const r = size <= 16 ? 14 : 16;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF8A5B"/><stop offset="1" stop-color="#E5482A"/></linearGradient></defs>
  <rect width="64" height="64" rx="${r}" fill="url(#g)"/>
  <path d="M42 42V27a9 9 0 0 0-18 0v13" fill="none" stroke="#fff" stroke-width="${sw}" stroke-linecap="round"/>
  <path d="m15.5 33 8.5 8.5 8.5-8.5" fill="none" stroke="#fff" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
};

const browser = await chromium.launch();
const page = await browser.newPage();
for (const size of [16, 32, 48, 128]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${mark(size)}</body></html>`);
  await page.locator('svg').screenshot({ path: path.join(out, `icon-${size}.png`), omitBackground: true });
}
await browser.close();
console.log('icons written to', out);
