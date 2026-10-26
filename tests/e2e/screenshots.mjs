// Renders every surface in light + dark for visual review and the README.
// Usage: npm run screenshots   (writes docs/screenshots/*.png)
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { launch, ROOT } from './harness.mjs';

const out = path.join(ROOT, 'docs/screenshots');
mkdirSync(out, { recursive: true });

const day = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const now = Date.now();
const seed = {
  onboarded: true,
  sites: [
    'youtube.com',
    'x.com',
    'reddit.com',
    'instagram.com',
    'news.ycombinator.com',
    'linkedin.com/feed',
    'netflix.com',
    'twitch.tv',
    'amazon.in',
  ].map((pattern) => ({ pattern, addedAt: now })),
  tasks: [
    { id: 'a', text: 'Finish Q3 board deck — financials section', done: false, createdAt: now },
    { id: 'b', text: 'Reply to Priya about the hiring plan', done: false, createdAt: now },
    { id: 'c', text: 'Review pricing page copy', done: false, createdAt: now },
    { id: 'd', text: '30 min deep work: API spec', done: true, createdAt: now, doneAt: now },
  ],
  stats: Object.fromEntries(
    [
      [13, 9, 5, 3], [12, 12, 8, 4], [11, 7, 5, 2], [10, 14, 11, 3], [9, 6, 5, 1], [8, 4, 4, 0], [7, 10, 8, 2],
      [6, 8, 7, 1], [5, 11, 10, 1], [4, 6, 6, 0], [3, 9, 8, 1], [2, 5, 5, 0], [1, 7, 7, 0], [0, 6, 5, 1],
    ].map(([o, blocked, backed, continued]) => [day(o), { blocked, backed, continued }])
  ),
  settings: { waitSeconds: 10, requireReason: false, durations: [5, 15, 30], reblockOnExpiry: true },
};

for (const scheme of ['light', 'dark']) {
  const h = await launch({ colorScheme: scheme });
  await h.storage(seed);
  await h.synced();

  const page = await h.context.newPage();
  await page.goto(h.site('www.youtube.com', '/watch?v=dQw4w9WgXcQ')).catch(() => {});
  await page.locator('.task').first().waitFor();
  await page.evaluate(() => {
    document.getElementById('headline').textContent = 'Is this on purpose?';
  });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: path.join(out, `blocked-${scheme}.png`) });

  await page.setViewportSize({ width: 820, height: 1100 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, `blocked-narrow-${scheme}.png`) });

  const popup = await h.context.newPage();
  await popup.setViewportSize({ width: 372, height: 600 });
  await popup.goto(h.ext('popup.html'));
  await popup.locator('.site').first().waitFor();
  await popup.waitForTimeout(300);
  await popup.screenshot({ path: path.join(out, `popup-${scheme}.png`) });

  const opts = await h.context.newPage();
  await opts.setViewportSize({ width: 1280, height: 900 });
  await opts.goto(h.ext('options.html'));
  await opts.locator('.site-list .site').first().waitFor();
  await opts.waitForTimeout(300);
  await opts.screenshot({ path: path.join(out, `options-${scheme}.png`), fullPage: true });

  await h.close();
}
console.log('screenshots written to', out);
