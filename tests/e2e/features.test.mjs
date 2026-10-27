import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { launch } from './harness.mjs';

let h;
const pageErrors = [];
// A real 16x16 PNG, served in place of Google's favicon service.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAKklEQVR42mP8z8Dwn4ECwESJ5lEDRg0YNWDUgFEDRg0YNWDUgFEDqAYAAB7PAR3l8yC2AAAAAElFTkSuQmCC',
  'base64'
);
let faviconHits = [];

before(async () => {
  h = await launch();
  h.context.on('weberror', (e) => pageErrors.push(e.error().message));
  await h.context.route('https://www.google.com/s2/favicons**', (route) => {
    const domain = new URL(route.request().url()).searchParams.get('domain');
    faviconHits.push(domain);
    if (domain === 'unknown-site.test') return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
  });
  await h.context.route('https://icons.duckduckgo.com/**', (route) => route.fulfill({ status: 404, body: '' }));
});
after(async () => {
  await h?.close();
});

beforeEach(async () => {
  for (const p of h.context.pages()) if (!p.url().includes('popup.html')) await p.close();
  await h.storage({
    sites: [],
    allowances: {},
    enabled: true,
    pausedUntil: 0,
    settings: { waitSeconds: 0, requireReason: false, durations: [5, 15, 30, 'day'], reblockOnExpiry: true },
    stats: {},
    favicons: {},
    appearance: { theme: 'ember', mode: 'light' },
  });
  await h.synced();
  faviconHits = [];
});

const isBlockPage = (url) => url.startsWith(h.ext('blocked.html'));
async function visit(url) {
  const page = await h.context.newPage();
  await page.goto(url).catch(() => {});
  await page.waitForLoadState('domcontentloaded');
  return page;
}
async function block(...patterns) {
  await h.storage({ sites: patterns.map((pattern) => ({ pattern, addedAt: Date.now() })) });
  await h.synced();
}

test('"Rest of today" unblocks the site until midnight', async () => {
  await block('distract.test');
  const page = await visit(h.site('distract.test', '/a'));
  await page.locator('#durations button', { hasText: 'Today' }).click();
  assert.match(await page.locator('#continue-label').textContent(), /Continue to distract\.test for the rest of today/);
  await page.locator('#continue-btn').click();
  await page.waitForURL(h.site('distract.test', '/a'));

  const s = await h.storage();
  const midnight = new Date();
  midnight.setHours(24, 0, 0, 0);
  assert.equal(s.allowances['distract.test'], midnight.getTime());

  // Still open on other pages and in new tabs.
  assert.ok(!isBlockPage((await visit(h.site('distract.test', '/b'))).url()));

  // The popup marks it as allowed.
  const popup = await h.context.newPage();
  await popup.goto(h.ext('popup.html'));
  await popup.locator('.site.allowed').first().waitFor();
  await popup.close();
});

test('real brand logos replace generic icons; Chrome favicon cache is never used', async () => {
  await block('youtube.com', 'reddit.com', 'x.com');
  const page = await visit(h.site('youtube.com', '/watch?v=1'));
  const chip = page.locator('#site-chip .logo');
  await chip.waitFor();
  assert.match(await chip.getAttribute('class'), /is-brand/);
  assert.match(await chip.getAttribute('style'), /brands\/youtube\.svg/);

  const popup = await h.context.newPage();
  await popup.goto(h.ext('popup.html'));
  await popup.locator('.site .logo.is-brand').nth(2).waitFor();
  const options = await h.context.newPage();
  await options.goto(h.ext('options.html'));
  await options.locator('.provider .logo.is-brand').first().waitFor();
  // Notion, Todoist, TickTick, Google Tasks/Calendar, Linear, Asana, Trello, ClickUp.
  assert.ok((await options.locator('.provider .logo.is-brand').count()) >= 9);

  for (const p of [page, popup, options]) {
    const srcs = await p.evaluate(() => [...document.images].map((i) => i.src));
    assert.ok(!srcs.some((s) => s.includes('_favicon')), 'no chrome _favicon lookups');
  }
  await popup.close();
  await options.close();
});

test('sites without a bundled logo get their real favicon, fetched once and cached', async () => {
  await block('focus-killer.test', 'unknown-site.test');
  const popup = await h.context.newPage();
  await popup.goto(h.ext('popup.html'));
  const known = popup.locator('.site .logo[data-domain="focus-killer.test"]');
  await known.locator('img').waitFor({ timeout: 5000 });
  assert.match(await known.locator('img').getAttribute('src'), /^data:image\/png;base64,/);

  // Unknown site: lettered tile, miss is cached so we don't hammer the service.
  const unknown = popup.locator('.site .logo[data-domain="unknown-site.test"]');
  await unknown.waitFor();
  assert.match(await unknown.getAttribute('class'), /is-letter/);
  assert.equal((await unknown.textContent()).trim(), 'U');

  const s = await h.storage();
  assert.match(s.favicons['focus-killer.test'].d, /^data:image\/png/);
  assert.equal(s.favicons['unknown-site.test'].d, '');

  const before = faviconHits.length;
  await popup.reload();
  await popup.locator('.site .logo[data-domain="focus-killer.test"] img').waitFor();
  await popup.waitForTimeout(300);
  assert.equal(faviconHits.length, before, 'served from cache on the next render');
  await popup.close();
});

test('themes and dark mode apply across pages, live', async () => {
  const options = await h.context.newPage();
  await options.goto(h.ext('options.html'));
  await options.locator('.theme', { hasText: 'Ocean' }).click();
  await options.locator('#modes button', { hasText: 'Dark' }).click();
  await options.waitForFunction(() => document.documentElement.dataset.theme === 'ocean' && document.documentElement.dataset.mode === 'dark');

  // Another page picks it up immediately, without a reload.
  await block('distract.test');
  const page = await visit(h.site('distract.test'));
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'ocean');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  assert.equal(bg, 'rgb(11, 15, 22)');

  await options.locator('.theme', { hasText: 'Forest' }).click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'forest');

  // Applied before first paint on the next load (no flash of the default theme).
  const fresh = await h.context.newPage();
  await fresh.addInitScript(() => {
    document.addEventListener('readystatechange', () => {
      if (document.readyState === 'interactive') window.__firstTheme = document.documentElement.dataset.theme;
    });
  });
  await fresh.goto(h.ext('popup.html'));
  assert.equal(await fresh.evaluate(() => window.__firstTheme), 'forest');
  await fresh.close();
  await options.close();
});

test('no uncaught errors', () => {
  assert.deepEqual(pageErrors, []);
});
