import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePattern,
  parsePatternList,
  urlMatchesPattern,
  matchingPatterns,
  displayHost,
} from '../../src/lib/domains.js';
import { buildRules, enforcedPatterns, nextExpiry, isBlockingActive, siteRule, FRAME_RULE_ID } from '../../src/lib/rules.js';
import { PRESETS, presetState, togglePreset } from '../../src/lib/presets.js';
import { normalizeEmbedUrl, detectProvider, embedDomain, PROVIDERS } from '../../src/lib/embeds.js';
import { addPatterns, removePatterns } from '../../src/lib/sites.js';
import { migrate, endOfDay, sortDurations, durationLabel, DEFAULTS } from '../../src/lib/store.js';
import { allowanceEnd } from '../../src/lib/rules.js';
import { brandFor, brandStyle, BRANDS } from '../../src/lib/brands.js';
import { fetchFavicon, faviconSources, isFresh, mergeCache, HIT_TTL, MISS_TTL } from '../../src/lib/favicon-fetch.js';
import { existsSync } from 'node:fs';

test('normalizePattern cleans up whatever people paste', () => {
  const cases = {
    'youtube.com': 'youtube.com',
    'YouTube.com': 'youtube.com',
    'https://www.youtube.com/': 'youtube.com',
    'http://www.youtube.com/watch?v=abc#t=1': 'youtube.com/watch',
    'www2.example.co.uk': 'example.co.uk',
    '*.reddit.com': 'reddit.com',
    '  reddit.com/r/all/  ': 'reddit.com/r/all',
    'reddit.com//r//popular': 'reddit.com/r/popular',
    'news.ycombinator.com': 'news.ycombinator.com',
    'example.com:8080/path': 'example.com/path',
    'user:pw@example.com': 'example.com',
    'localhost': 'localhost',
    '192.168.1.10': '192.168.1.10',
    'xn--bcher-kva.example': 'xn--bcher-kva.example',
  };
  for (const [input, want] of Object.entries(cases)) assert.equal(normalizePattern(input), want, input);
});

test('normalizePattern rejects junk', () => {
  for (const bad of ['', '   ', 'youtube', 'not a site', 'http://', '.com', 'a..b.com', '-bad.com', null, 42]) {
    assert.equal(normalizePattern(bad), null, String(bad));
  }
});

test('parsePatternList splits and de-duplicates', () => {
  assert.deepEqual(parsePatternList('youtube.com, x.com\nreddit.com/r/all  youtube.com; junk'), [
    'youtube.com',
    'x.com',
    'reddit.com/r/all',
  ]);
});

test('urlMatchesPattern covers subdomains but not lookalikes', () => {
  assert.ok(urlMatchesPattern('https://youtube.com/', 'youtube.com'));
  assert.ok(urlMatchesPattern('https://www.youtube.com/watch?v=1', 'youtube.com'));
  assert.ok(urlMatchesPattern('https://m.youtube.com', 'youtube.com'));
  assert.ok(urlMatchesPattern('http://YOUTUBE.com:8080/x', 'youtube.com'));
  assert.ok(!urlMatchesPattern('https://notyoutube.com/', 'youtube.com'));
  assert.ok(!urlMatchesPattern('https://youtube.com.evil.io/', 'youtube.com'));
  assert.ok(!urlMatchesPattern('chrome://settings', 'settings'));
  assert.ok(!urlMatchesPattern('not a url', 'youtube.com'));
});

test('urlMatchesPattern respects path boundaries', () => {
  const p = 'reddit.com/r/all';
  assert.ok(urlMatchesPattern('https://www.reddit.com/r/all', p));
  assert.ok(urlMatchesPattern('https://www.reddit.com/r/all/', p));
  assert.ok(urlMatchesPattern('https://old.reddit.com/r/all/top?t=day', p));
  assert.ok(urlMatchesPattern('https://reddit.com/R/All', p));
  assert.ok(!urlMatchesPattern('https://reddit.com/r/allthings', p));
  assert.ok(!urlMatchesPattern('https://reddit.com/r/programming', p));
});

test('matchingPatterns returns most specific first', () => {
  assert.deepEqual(matchingPatterns('https://youtube.com/shorts/abc', ['x.com', 'youtube.com', 'youtube.com/shorts']), [
    'youtube.com/shorts',
    'youtube.com',
  ]);
});

test('displayHost strips www', () => {
  assert.equal(displayHost('https://www.reddit.com/r/x'), 'reddit.com');
  assert.equal(displayHost('garbage'), '');
});

/* ---------- DNR rules ---------- */

const EXT = 'abcdefghijklmnopabcdefghijklmnop';
const NOW = 1_700_000_000_000;
const site = (pattern) => ({ pattern, addedAt: 0 });

function regexFor(pattern) {
  return new RegExp(siteRule(pattern, 100, EXT).condition.regexFilter, 'i');
}

test('site rule regex agrees with urlMatchesPattern', () => {
  const urls = [
    'https://youtube.com/',
    'https://www.youtube.com/watch?v=1',
    'https://youtube.com',
    'https://youtube.com/shorts',
    'https://youtube.com/shorts/xyz',
    'https://youtube.com/shortsfoo',
    'https://youtube.com/shorts?x=1',
    'https://youtube.com/shorts#frag',
    'http://youtube.com:8080/shorts/1',
  ];
  for (const pattern of ['youtube.com', 'youtube.com/shorts']) {
    const re = regexFor(pattern);
    for (const url of urls) {
      // requestDomains handles the host; the regex handles the path.
      assert.equal(re.test(url), urlMatchesPattern(url, pattern), `${pattern} vs ${url}`);
    }
  }
});

test('site rule redirects the full URL into the block page fragment', () => {
  const rule = siteRule('reddit.com/r/all', 105, EXT);
  assert.equal(rule.action.type, 'redirect');
  assert.equal(rule.action.redirect.regexSubstitution, `chrome-extension://${EXT}/src/pages/blocked.html#\\1`);
  assert.deepEqual(rule.condition.requestDomains, ['reddit.com']);
  assert.deepEqual(rule.condition.resourceTypes, ['main_frame']);
  const url = 'https://old.reddit.com/r/all/?sort=top';
  const re = new RegExp(rule.condition.regexFilter);
  assert.equal(url.replace(re, rule.action.redirect.regexSubstitution.replace('\\1', '$1')), `chrome-extension://${EXT}/src/pages/blocked.html#${url}`);
});

test('buildRules: frame rule always present, one redirect per enforced site', () => {
  const state = { enabled: true, pausedUntil: 0, sites: [site('a.com'), site('b.com'), site('a.com')], allowances: {}, embeds: [] };
  const rules = buildRules(state, EXT, NOW);
  assert.equal(rules[0].id, FRAME_RULE_ID);
  assert.deepEqual(rules[0].condition.initiatorDomains, [EXT]);
  assert.deepEqual(
    rules.slice(1).map((r) => r.condition.requestDomains[0]),
    ['a.com', 'b.com']
  );
  assert.equal(new Set(rules.map((r) => r.id)).size, rules.length, 'rule ids unique');
});

test('frame rule also trusts navigations started by configured embed apps', () => {
  const state = {
    sites: [],
    embeds: [
      { provider: 'todoist', url: 'https://app.todoist.com/app/today' },
      { provider: 'tasks', url: '' },
    ],
  };
  const [frame] = buildRules(state, EXT, NOW);
  assert.deepEqual(frame.condition.initiatorDomains, [EXT, 'todoist.com']);
  assert.deepEqual(frame.condition.resourceTypes, ['sub_frame']);
  assert.deepEqual(
    frame.action.responseHeaders.map((h) => h.header),
    ['x-frame-options', 'content-security-policy']
  );
});

test('allowances, pause and master switch suspend blocking', () => {
  const base = { enabled: true, pausedUntil: 0, sites: [site('a.com'), site('b.com')], allowances: {} };
  assert.deepEqual(enforcedPatterns(base, NOW), ['a.com', 'b.com']);
  assert.deepEqual(enforcedPatterns({ ...base, allowances: { 'a.com': NOW + 1000 } }, NOW), ['b.com']);
  assert.deepEqual(enforcedPatterns({ ...base, allowances: { 'a.com': NOW - 1 } }, NOW), ['a.com', 'b.com'], 'expired allowance');
  assert.deepEqual(enforcedPatterns({ ...base, pausedUntil: NOW + 1000 }, NOW), []);
  assert.deepEqual(enforcedPatterns({ ...base, pausedUntil: NOW - 1 }, NOW), ['a.com', 'b.com'], 'pause over');
  assert.deepEqual(enforcedPatterns({ ...base, enabled: false }, NOW), []);
  assert.equal(isBlockingActive({ enabled: true, pausedUntil: 0 }, NOW), true);
});

test('nextExpiry picks the earliest future change', () => {
  const state = { pausedUntil: NOW + 5000, allowances: { a: NOW + 9000, b: NOW + 3000, c: NOW - 10 } };
  assert.equal(nextExpiry(state, NOW), NOW + 3000);
  assert.equal(nextExpiry({ pausedUntil: 0, allowances: {} }, NOW), null);
});

test('more specific patterns get higher priority', () => {
  assert.ok(siteRule('youtube.com/shorts', 1, EXT).priority > siteRule('youtube.com', 2, EXT).priority);
});

/* ---------- Presets & list ops ---------- */

test('every preset site is a valid, normalized pattern', () => {
  for (const p of PRESETS) {
    assert.ok(p.sites.length >= 5, p.id);
    for (const s of p.sites) assert.equal(normalizePattern(s), s, `${p.id}: ${s}`);
    assert.equal(new Set(p.sites).size, p.sites.length, `${p.id} has duplicates`);
  }
});

test('togglePreset adds missing sites and removes them all when turned off', () => {
  let sites = [site('reddit.com'), site('gmail.com')];
  sites = togglePreset(sites, 'doomscroll', true, NOW);
  const doom = PRESETS.find((p) => p.id === 'doomscroll');
  assert.equal(presetState(doom, sites), 'on');
  assert.equal(sites.filter((s) => s.pattern === 'reddit.com').length, 1, 'no duplicates');
  sites = togglePreset(sites, 'doomscroll', false);
  assert.equal(presetState(doom, sites), 'off');
  assert.deepEqual(sites.map((s) => s.pattern), ['gmail.com']);
});

test('presetState reports partial', () => {
  const social = PRESETS.find((p) => p.id === 'social');
  assert.equal(presetState(social, [site('x.com')]), 'partial');
});

test('addPatterns / removePatterns', () => {
  const r = addPatterns([site('a.com')], ['b.com', 'a.com', 'c.com'], NOW);
  assert.deepEqual(r.added, ['b.com', 'c.com']);
  assert.deepEqual(r.sites.map((s) => s.pattern), ['b.com', 'c.com', 'a.com'], 'new sites on top, in the order given');
  assert.deepEqual(removePatterns(r.sites, ['b.com']).map((s) => s.pattern), ['c.com', 'a.com']);
});

/* ---------- Embeds ---------- */

test('normalizeEmbedUrl', () => {
  assert.equal(normalizeEmbedUrl('notion.so/My-Page-123'), 'https://notion.so/My-Page-123');
  assert.equal(normalizeEmbedUrl('https://app.todoist.com/app/today'), 'https://app.todoist.com/app/today');
  assert.equal(normalizeEmbedUrl('javascript:alert(1)'), null);
  assert.equal(normalizeEmbedUrl('file:///etc/passwd'), null);
  assert.equal(normalizeEmbedUrl('nonsense'), null);
  assert.equal(normalizeEmbedUrl(''), null);
});

test('detectProvider and embedDomain', () => {
  assert.equal(detectProvider('https://www.notion.so/x'), 'notion');
  assert.equal(detectProvider('https://acme.notion.site/x'), 'notion');
  assert.equal(detectProvider('https://app.todoist.com/app'), 'todoist');
  assert.equal(detectProvider('https://tasks.google.com/embed'), 'gtasks');
  assert.equal(detectProvider('https://example.com'), 'custom');
  assert.equal(embedDomain('https://app.todoist.com/app/today'), 'todoist.com');
  assert.equal(embedDomain('https://notion.so/x'), 'notion.so');
});

test('every non-builtin provider ships a usable default or placeholder', () => {
  for (const p of PROVIDERS) {
    if (p.builtin) continue;
    if (p.url) assert.ok(normalizeEmbedUrl(p.url), p.id);
    assert.ok(p.placeholder, p.id);
  }
});

/* ---------- v1.1: rest of today, migration ---------- */

test('allowanceEnd: minutes are clamped, "day" ends at local midnight', () => {
  const now = new Date(2026, 9, 27, 14, 30).getTime();
  assert.equal(allowanceEnd(15, now), now + 15 * 60_000);
  assert.equal(allowanceEnd(9999, now), now + 240 * 60_000);
  assert.equal(allowanceEnd('junk', now), now + 15 * 60_000);
  assert.equal(allowanceEnd('day', now), new Date(2026, 9, 28, 0, 0).getTime());
  assert.equal(endOfDay(new Date(2026, 9, 27, 23, 59).getTime()), new Date(2026, 9, 28).getTime());
});

test('durations sort with "day" last and read naturally', () => {
  assert.deepEqual(sortDurations(['day', 30, 5, 15, 5]), [5, 15, 30, 'day']);
  assert.equal(durationLabel('day'), 'Rest of today');
  assert.equal(durationLabel(60), '1 h');
  assert.equal(durationLabel(5), '5 min');
});

test('migrate: fresh install gets every default', () => {
  const patch = migrate({}, 'install');
  assert.deepEqual(Object.keys(patch).sort(), Object.keys(DEFAULTS).sort());
  assert.ok(patch.settings.durations.includes('day'));
});

test('migrate: v1 users get "Rest of today" without losing their choices', () => {
  const raw = { schema: undefined, sites: [{ pattern: 'x.com' }], settings: { waitSeconds: 30, durations: [1, 5] } };
  const patch = migrate(raw, 'update');
  assert.deepEqual(patch.settings.durations, [1, 5, 'day']);
  assert.equal(patch.settings.waitSeconds, 30);
  assert.equal(patch.schema, 2);
  assert.ok(!('sites' in patch), 'existing data untouched');
  assert.deepEqual(migrate({ ...raw, ...patch }, 'update').schema, undefined, 'idempotent');
  // Already at five options: keep the five longest, "day" included.
  assert.deepEqual(migrate({ settings: { durations: [1, 5, 10, 15, 30] } }, 'update').settings.durations, [5, 10, 15, 30, 'day']);
});

/* ---------- v1.1: logos ---------- */

test('brandFor matches hosts, subdomains, patterns and URLs', () => {
  assert.equal(brandFor('youtube.com').slug, 'youtube');
  assert.equal(brandFor('m.youtube.com').slug, 'youtube');
  assert.equal(brandFor('https://www.reddit.com/r/all').slug, 'reddit');
  assert.equal(brandFor('twitter.com').slug, 'x');
  assert.equal(brandFor('store.steampowered.com').slug, 'steam');
  assert.equal(brandFor('news.ycombinator.com').slug, 'ycombinator');
  assert.equal(brandFor('notyoutube.com'), null);
  assert.equal(brandFor('youtube.com.evil.io'), null);
  assert.equal(brandFor(''), null);
});

test('every brand has a bundled SVG and a sensible style', () => {
  for (const [slug, b] of Object.entries(BRANDS)) {
    assert.ok(existsSync(new URL(`../../src/assets/brands/${slug}.svg`, import.meta.url)), slug);
    assert.match(b.hex, /^[0-9A-F]{6}$/i, slug);
  }
  assert.equal(brandStyle('000000').mode, 'ink', 'black marks follow the text colour');
  assert.equal(brandStyle('FFFC00').mode, 'filled', 'yellow marks get a filled tile');
  assert.deepEqual(brandStyle('FF0000'), { mode: 'color', fg: '#FF0000' });
});

test('every task-app provider shows a real logo', () => {
  for (const p of PROVIDERS) {
    if (p.builtin || p.id === 'custom' || p.id === 'mstodo') continue; // To Do: live favicon
    assert.ok(brandFor(p.domain), p.id);
  }
});

const res = (status, type, bytes) => ({
  ok: status >= 200 && status < 300,
  headers: { get: () => type },
  arrayBuffer: async () => new Uint8Array(bytes).buffer,
});

test('fetchFavicon: first good image wins, 404 globes and junk are skipped', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.includes('google')) return res(404, 'image/png', 200);
    if (url.includes('duckduckgo')) return res(200, 'text/html', 500);
    return res(200, 'image/x-icon', 300);
  };
  const d = await fetchFavicon('example.org', fetchImpl);
  assert.match(d, /^data:image\/x-icon;base64,/);
  assert.equal(calls.length, 3);
  assert.deepEqual(calls, faviconSources('example.org'));
  assert.equal(await fetchFavicon('none.org', async () => res(404, 'image/png', 10)), '');
  assert.equal(await fetchFavicon('err.org', async () => { throw new Error('offline'); }), '');
});

test('favicon cache: freshness and size cap', () => {
  const now = 1_000_000_000_000;
  assert.ok(isFresh({ d: 'x', t: now - HIT_TTL + 1 }, now));
  assert.ok(!isFresh({ d: 'x', t: now - HIT_TTL - 1 }, now));
  assert.ok(isFresh({ d: '', t: now - MISS_TTL + 1 }, now));
  assert.ok(!isFresh({ d: '', t: now - MISS_TTL - 1 }, now));
  let cache = {};
  for (let i = 0; i < 450; i++) cache = mergeCache(cache, { [`s${i}.com`]: 'd' }, now + i);
  assert.equal(Object.keys(cache).length, 400);
  assert.ok(!('s0.com' in cache) && 's449.com' in cache, 'oldest dropped first');
});
