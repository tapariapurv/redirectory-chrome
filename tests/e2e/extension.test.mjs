import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { launch } from './harness.mjs';

// Note: hosts on Chrome's HSTS preload list (wikipedia.org, youtube.com…) get
// force-upgraded to https, which the local test server doesn't speak. Tests
// that need the real page to load use .test hosts; tests that only need the
// redirect can use real names, since blocking happens before any connection.

let h;
const pageErrors = [];

before(async () => {
  h = await launch();
  h.context.on('weberror', (e) => pageErrors.push(e.error().message));
});
after(async () => {
  await h?.close();
});

const FAST = { waitSeconds: 1, requireReason: false, durations: [5, 15, 30], reblockOnExpiry: true };

beforeEach(async () => {
  for (const p of h.context.pages()) if (!p.url().includes('popup.html')) await p.close();
  await h.storage({
    sites: [],
    allowances: {},
    enabled: true,
    pausedUntil: 0,
    settings: FAST,
    stats: {},
    tasks: [],
    embeds: [{ id: 'tasks', provider: 'tasks', label: 'Quick tasks', url: '' }],
    activeEmbedId: 'tasks',
  });
  await h.synced();
});

const sites = (...patterns) => patterns.map((pattern) => ({ pattern, addedAt: Date.now() }));
const isBlockPage = (url) => url.startsWith(h.ext('blocked.html'));

async function visit(url) {
  const page = await h.context.newPage();
  await page.goto(url).catch(() => {});
  await page.waitForLoadState('domcontentloaded');
  return page;
}

async function block(...patterns) {
  await h.storage({ sites: sites(...patterns) });
  await h.synced();
}

test('opens the welcome/settings page on install', async () => {
  // The very first page Chromium showed after loading the extension.
  const s = await h.storage();
  assert.equal(s.enabled, true);
  assert.ok(Array.isArray(s.embeds) && s.embeds[0].provider === 'tasks', 'built-in tasks panel by default');
});

test('blocks a listed site and its subdomains, keeping the full URL', async () => {
  await block('youtube.com');
  const target = h.site('www.youtube.com', '/watch?v=abc&t=10#comments');
  const page = await visit(target);
  assert.ok(isBlockPage(page.url()), page.url());
  assert.equal(decodeURI(page.url().split('#').slice(1).join('#')), target);
  await page.locator('#site-chip').getByText('youtube.com').waitFor();

  const m = await visit(h.site('m.youtube.com'));
  assert.ok(isBlockPage(m.url()), 'subdomain blocked');
});

test('does not block lookalike or unlisted sites', async () => {
  await block('youtube.com');
  for (const host of ['notyoutube.com', 'youtube.com.example.org', 'docs.test']) {
    const page = await visit(h.site(host));
    assert.ok(!isBlockPage(page.url()), host);
    assert.equal(await page.locator('#site').textContent(), host + '/');
  }
});

test('path patterns only block that part of a site', async () => {
  await block('reddit.com/r/all');
  assert.ok(isBlockPage((await visit(h.site('www.reddit.com', '/r/all/top'))).url()));
  assert.ok(!isBlockPage((await visit(h.site('www.reddit.com', '/r/programming'))).url()));
  assert.ok(!isBlockPage((await visit(h.site('www.reddit.com', '/r/allergies'))).url()));
});

test('continue: countdown gates the button, then the site opens and stays open', async () => {
  await h.storage({ settings: { ...FAST, waitSeconds: 2 } });
  await block('x.com');
  const target = h.site('x.com', '/home');
  const page = await visit(target);
  const btn = page.locator('#continue-btn');
  assert.equal(await btn.isDisabled(), true, 'locked during countdown');
  assert.match(await page.locator('#continue-label').textContent(), /Continue in \ds/);

  await page.waitForFunction(() => !document.getElementById('continue-btn').disabled, null, { timeout: 5000 });
  // Shortest duration is pre-selected.
  assert.equal(await page.locator('#durations [aria-pressed="true"]').textContent(), '5 min');
  await page.locator('#durations button', { hasText: '15 min' }).click();
  assert.match(await page.locator('#continue-label').textContent(), /Continue to x\.com for 15 min/);
  await btn.click();
  await page.waitForURL(target);
  assert.equal(await page.locator('#site').textContent(), 'x.com/home');

  const s = await h.storage();
  const left = s.allowances['x.com'] - Date.now();
  assert.ok(left > 14 * 60_000 && left <= 15 * 60_000, 'allowed for ~15 min');
  const today = Object.values(s.stats)[0];
  assert.equal(today.continued, 1);
  assert.equal(today.blocked, 1);

  // Other pages on the site work during the allowance, in other tabs too.
  assert.ok(!isBlockPage((await visit(h.site('x.com', '/explore'))).url()));
});

test('require a reason before continuing', async () => {
  await h.storage({ settings: { ...FAST, waitSeconds: 0, requireReason: true } });
  await block('x.com');
  const page = await visit(h.site('x.com'));
  const btn = page.locator('#continue-btn');
  assert.equal(await btn.isDisabled(), true);
  await page.locator('#reason').fill('reply to Sam');
  assert.equal(await btn.isDisabled(), false);
  await btn.click();
  await page.waitForURL(h.site('x.com'));
});

test('when an allowance ends, open tabs are sent back to the block page', async () => {
  await block('twitch.tv');
  const page = await visit(h.site('twitch.tv'));
  await page.locator('#continue-btn:not([disabled])').click();
  await page.waitForURL(h.site('twitch.tv'));

  // Expire it the way the popup's "End now" does.
  await h.msg('endAllowance', { patterns: ['twitch.tv'] });
  await page.waitForURL((u) => isBlockPage(u.href), { timeout: 5000 });
  assert.match(page.url(), /\?r=expired#/);
  assert.match(await page.locator('h1').textContent(), /Time’s up on twitch\.tv/);
});

test('allowance expiry fires on its own via alarms', async () => {
  await block('netflix.com');
  // Let the background create a real allowance, then shorten it to ~2s.
  await h.msg('allow', { url: h.site('netflix.com'), minutes: 1 });
  const page = await visit(h.site('netflix.com'));
  assert.ok(!isBlockPage(page.url()));
  await h.storage({ allowances: { 'netflix.com': Date.now() + 2000 } });
  await page.waitForURL((u) => isBlockPage(u.href), { timeout: 15000 });
});

test('pause stops blocking until it ends; master switch too', async () => {
  await block('youtube.com');
  await h.storage({ pausedUntil: Date.now() + 60_000 });
  await h.synced();
  assert.ok(!isBlockPage((await visit(h.site('youtube.com'))).url()), 'paused');

  await h.storage({ pausedUntil: 0 });
  await h.synced();
  assert.ok(isBlockPage((await visit(h.site('youtube.com'))).url()), 'resumed');

  await h.storage({ enabled: false });
  await h.synced();
  assert.ok(!isBlockPage((await visit(h.site('youtube.com'))).url()), 'switched off');
});

test('"Back to work" returns to the previous page and counts it', async () => {
  await block('instagram.com');
  const page = await visit(h.site('docs.test', '/wiki/Focus'));
  await page.goto(h.site('instagram.com')).catch(() => {});
  assert.ok(isBlockPage(page.url()));
  await page.locator('#back-btn').click();
  await page.waitForURL(h.site('docs.test', '/wiki/Focus'));
  const s = await h.storage();
  assert.equal(Object.values(s.stats)[0].backed, 1);
});

test('Escape key also goes back (but not while typing)', async () => {
  await block('instagram.com');
  const page = await visit(h.site('docs.test'));
  await page.goto(h.site('instagram.com')).catch(() => {});
  await page.locator('#reason').focus();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  assert.ok(isBlockPage(page.url()), 'typing: stays');
  await page.locator('h1').click();
  await page.keyboard.press('Escape');
  await page.waitForURL(h.site('docs.test'));
});

test('"Back to work" closes a tab that has nowhere to go back to', async () => {
  await block('tiktok.com');
  // Open it like a link opened in a new tab: no history before it.
  const opened = h.context.waitForEvent('page');
  await h.sw.evaluate((url) => chrome.tabs.create({ url }), h.site('tiktok.com'));
  const page = await opened;
  await page.waitForURL((u) => isBlockPage(u.href));
  await page.locator('#back-btn').waitFor();
  const closed = page.waitForEvent('close');
  await page.locator('#back-btn').click();
  await closed;
});

test('block page gets out of the way if the site is no longer blocked', async () => {
  await block('distract.test');
  const page = await visit(h.site('distract.test', '/feed'));
  assert.ok(isBlockPage(page.url()));
  await h.storage({ sites: [] });
  await h.synced();
  await page.reload();
  await page.waitForURL(h.site('distract.test', '/feed'));
});

test('popup: add a site, toggle a preset, unblock with undo', async () => {
  const popup = await h.context.newPage();
  await popup.setViewportSize({ width: 372, height: 600 });
  await popup.goto(h.ext('popup.html'));

  await popup.locator('#add-input').fill('https://www.Reddit.com/');
  await popup.locator('#add-input').press('Enter');
  await popup.locator('#sites').getByText('reddit.com').waitFor();

  await popup.locator('.preset', { hasText: 'Social media' }).click();
  await popup.locator('.preset.on', { hasText: 'Social media' }).waitFor();
  let s = await h.storage();
  for (const p of ['reddit.com', 'facebook.com', 'instagram.com', 'x.com', 'linkedin.com/feed']) {
    assert.ok(s.sites.some((x) => x.pattern === p), p);
  }
  await h.synced();
  assert.ok(isBlockPage((await visit(h.site('facebook.com'))).url()));
  assert.ok(!isBlockPage((await visit(h.site('linkedin.com', '/jobs'))).url()), 'only the LinkedIn feed');

  // Invalid input is rejected without changing the list.
  const before = (await h.storage()).sites.length;
  await popup.locator('#add-input').fill('not a site');
  await popup.locator('#add-input').press('Enter');
  await popup.waitForTimeout(200);
  assert.equal((await h.storage()).sites.length, before);
  assert.ok(await popup.locator('#add-input.invalid').count());

  // Turn the preset off, then undo.
  await popup.locator('.preset', { hasText: 'Social media' }).click();
  await popup.locator('.preset.off', { hasText: 'Social media' }).waitFor();
  s = await h.storage();
  assert.ok(!s.sites.some((x) => x.pattern === 'facebook.com'));
  await popup.locator('.toast button', { hasText: 'Undo' }).click();
  await popup.locator('.preset.on', { hasText: 'Social media' }).waitFor();
  await popup.close();
});

test('popup: pause menu pauses blocking and shows resume', async () => {
  await block('youtube.com');
  const popup = await h.context.newPage();
  await popup.goto(h.ext('popup.html'));
  await popup.locator('#pause-btn').click();
  await popup.locator('#pause-options button', { hasText: '15 min' }).click();
  await popup.locator('#status-banner', { hasText: 'Paused until' }).waitFor();
  const s = await h.storage();
  assert.ok(s.pausedUntil > Date.now() + 14 * 60_000);
  await popup.locator('#status-banner button', { hasText: 'Resume' }).click();
  await popup.locator('#pause-btn').waitFor();
  assert.equal((await h.storage()).pausedUntil, 0);
  await popup.close();
});

test('"Block this site" redirects the open tab immediately', async () => {
  const tab = await visit(h.site('news.ycombinator.com', '/item?id=1'));
  assert.ok(!isBlockPage(tab.url()));
  const tabId = await h.sw.evaluate(async (u) => (await chrome.tabs.query({ url: u.replace(/\?.*/, '*') }))[0].id, tab.url());
  await h.storage({ sites: sites('news.ycombinator.com') });
  const res = await h.msg('blockTab', { tabId });
  assert.equal(res.redirected, 1);
  await tab.waitForURL((u) => isBlockPage(u.href));
});

test('focus panel: a site that refuses framing loads inside the block page', async () => {
  const embedUrl = h.site('tasks.embed.test', '/framed');
  await h.storage({
    embeds: [
      { id: 'e1', provider: 'custom', label: 'My planner', url: embedUrl },
      { id: 'tasks', provider: 'tasks', label: 'Quick tasks', url: '' },
    ],
    activeEmbedId: 'e1',
  });
  await block('youtube.com');
  const page = await visit(h.site('youtube.com'));
  const frame = page.frameLocator('#panel-body iframe');
  await frame.locator('#marker').waitFor({ timeout: 5000 });
  assert.equal(await frame.locator('#marker').textContent(), 'EMBED_OK /framed');

  // Navigating inside the embed (sign-in redirects etc.) keeps working.
  await frame.locator('#next').click();
  await frame.locator('#marker', { hasText: '/framed-next' }).waitFor({ timeout: 5000 });

  // Frame-busting can't hijack the block page.
  await page.frames()[1].evaluate(() => {
    try {
      window.top.location = 'http://evil.test/';
    } catch {}
  });
  await page.waitForTimeout(300);
  assert.ok(isBlockPage(page.url()));

  // Tabs switch between panels without reloading the iframe.
  await page.locator('.panel-tab', { hasText: 'Quick tasks' }).click();
  await page.locator('.tasks-input').waitFor();
  await page.locator('.panel-tab', { hasText: 'My planner' }).click();
  await frame.locator('#marker', { hasText: '/framed-next' }).waitFor();
});

test('header stripping is scoped: regular websites still cannot frame protected pages', async () => {
  await h.storage({ embeds: [{ id: 'e1', provider: 'custom', label: 'P', url: h.site('tasks.embed.test', '/framed') }] });
  await h.synced();
  const embedder = await visit(h.site('attacker.test', '/embedder?src=' + encodeURIComponent(h.site('bank.test', '/framed'))));
  await embedder.waitForTimeout(800);
  const child = embedder.frames().find((f) => f !== embedder.mainFrame());
  const text = child ? await child.evaluate(() => document.body?.innerText || '').catch(() => '') : '';
  assert.ok(!text.includes('EMBED_OK'), 'framing still blocked for normal sites');
});

test('quick tasks: add, complete, edit, persist', async () => {
  await block('youtube.com');
  const page = await visit(h.site('youtube.com'));
  const input = page.locator('.tasks-input');
  await input.fill('Write the investor update');
  await input.press('Enter');
  await input.fill('Book flights');
  await input.press('Enter');
  await page.locator('.task').nth(1).waitFor();
  assert.equal(await page.locator('.tasks-count').textContent(), '2 to go');

  await page.locator('.task', { hasText: 'Write the investor update' }).locator('.task-check').click();
  await page.locator('.task.done').waitFor();
  assert.equal(await page.locator('.tasks-count').textContent(), '1 to go · 1 done');

  await page.locator('.task-text', { hasText: 'Book flights' }).dblclick();
  await page.locator('.task-edit').fill('Book flights to Goa');
  await page.locator('.task-edit').press('Enter');
  await page.locator('.task-text', { hasText: 'Book flights to Goa' }).waitFor();

  const s = await h.storage();
  assert.deepEqual(
    s.tasks.map((t) => [t.text, t.done]),
    [
      ['Book flights to Goa', false],
      ['Write the investor update', true],
    ]
  );
  // Shows up in a second block page tab too.
  const other = await visit(h.site('youtube.com', '/x'));
  await other.locator('.task-text', { hasText: 'Book flights to Goa' }).waitFor();
});

test('options: add an embed provider, reorder, configure friction', async () => {
  const page = await h.context.newPage();
  await page.goto(h.ext('options.html'));
  await page.locator('.provider', { hasText: 'Todoist' }).click();
  assert.equal(await page.locator('#embed-url').inputValue(), 'https://app.todoist.com/app/today');
  await page.locator('#embed-form button[type="submit"]').click();
  await page.locator('.embed', { hasText: 'Todoist' }).waitFor();

  let s = await h.storage();
  assert.equal(s.embeds[0].provider, 'todoist', 'new panel opens first');
  assert.equal(s.activeEmbedId, s.embeds[0].id);
  const rules = await h.synced();
  assert.ok(rules.find((r) => r.id === 1).condition.initiatorDomains.includes('todoist.com'));

  // Bad URL is rejected.
  await page.locator('.provider', { hasText: 'Any website' }).click();
  await page.locator('#embed-url').fill('not a url');
  await page.locator('#embed-form button[type="submit"]').click();
  assert.ok(await page.locator('#embed-url.invalid').count());
  await page.locator('#embed-cancel').click();

  await page.locator('.embed', { hasText: 'Quick tasks' }).locator('[aria-label="Move up"]').click();
  await page.waitForFunction(() => document.querySelector('.embed .embed-name').textContent.startsWith('Quick tasks'));
  s = await h.storage();
  assert.equal(s.embeds[0].provider, 'tasks');

  await page.locator('#wait button', { hasText: '30s' }).click();
  await page.locator('#require-reason').check({ force: true });
  await page.locator('#durations .chip', { hasText: '1 min' }).click();
  await page.locator('#durations .chip', { hasText: '30 min' }).click();
  s = await h.storage();
  assert.equal(s.settings.waitSeconds, 30);
  assert.equal(s.settings.requireReason, true);
  assert.deepEqual(s.settings.durations, [1, 5, 15]);

  // Bulk paste into the blocklist.
  await page.locator('#add-input').fill('a-site.com, b-site.com\nc-site.com/path');
  await page.locator('#add-btn').click();
  await page.locator('.site-list .site', { hasText: 'c-site.com' }).waitFor();
  s = await h.storage();
  assert.deepEqual(s.sites.slice(0, 3).map((x) => x.pattern), ['a-site.com', 'b-site.com', 'c-site.com/path']);
});

test('stats are not double-counted on reload', async () => {
  await block('youtube.com');
  const page = await visit(h.site('youtube.com'));
  await page.waitForTimeout(200);
  await page.reload();
  await page.waitForTimeout(300);
  const s = await h.storage();
  assert.equal(Object.values(s.stats)[0].blocked, 1);
});

test('no uncaught errors on any extension page', async () => {
  assert.deepEqual(pageErrors, []);
});
