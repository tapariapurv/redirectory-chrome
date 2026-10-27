// Renders the 1280x640 social preview (docs/assets/og.png) used by the
// website's Open Graph tags and as the GitHub repository social preview.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 640 } });
await page.goto(pathToFileURL(path.join(root, 'tools/og.html')).href);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: path.join(root, 'docs/assets/og.png') });
await browser.close();
console.log('wrote docs/assets/og.png');
