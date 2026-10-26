import { getState, set, update, onChange, todayKey, DEFAULTS } from './lib/store.js';
import { buildRules, enforcedPatterns, nextExpiry, BLOCKED_PAGE } from './lib/rules.js';
import { matchingPatterns, urlMatchesPattern, normalizePattern, isWebUrl } from './lib/domains.js';

const EXPIRY_ALARM = 'expiry';
const RULE_KEYS = ['enabled', 'pausedUntil', 'sites', 'allowances', 'embeds'];
const STATS_DAYS = 90;

// Rule syncs are serialized so overlapping storage events can't interleave
// getDynamicRules/updateDynamicRules and leave stale rules behind.
let syncChain = Promise.resolve();
function syncRules() {
  syncChain = syncChain.then(doSync, doSync);
  return syncChain;
}

async function doSync() {
  const state = await getState(RULE_KEYS);
  const now = Date.now();
  const addRules = buildRules(state, chrome.runtime.id, now);
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existing.map((r) => r.id),
    addRules,
  });

  const next = nextExpiry(state, now);
  if (next) await chrome.alarms.create(EXPIRY_ALARM, { when: Math.max(next, now + 1000) });
  else await chrome.alarms.clear(EXPIRY_ALARM);
  await updateBadge(state, now);
}

async function updateBadge(state, now) {
  const paused = state.enabled === false || state.pausedUntil > now;
  await chrome.action.setBadgeText({ text: paused ? 'off' : '' });
  await chrome.action.setBadgeBackgroundColor({ color: '#6B6872' });
}

function blockedUrl(url, reason) {
  return chrome.runtime.getURL(BLOCKED_PAGE) + (reason ? `?r=${reason}` : '') + '#' + url;
}

/** Send any open tab that should be blocked to the block page. */
async function enforceOpenTabs({ onlyPatterns = null, tabId = null, reason = null } = {}) {
  const state = await getState(RULE_KEYS);
  let patterns = enforcedPatterns(state);
  if (onlyPatterns) patterns = patterns.filter((p) => onlyPatterns.includes(p));
  if (!patterns.length) return 0;
  const tabs = tabId != null ? [await chrome.tabs.get(tabId)] : await chrome.tabs.query({});
  let n = 0;
  for (const tab of tabs) {
    const url = tab.pendingUrl || tab.url;
    if (!isWebUrl(url)) continue;
    if (patterns.some((p) => urlMatchesPattern(url, p))) {
      await chrome.tabs.update(tab.id, { url: blockedUrl(url, reason) }).catch(() => {});
      n++;
    }
  }
  return n;
}

async function handleExpiry() {
  const state = await getState(['allowances', 'pausedUntil', 'settings']);
  const now = Date.now();
  const expired = Object.entries(state.allowances)
    .filter(([, t]) => t <= now)
    .map(([p]) => p);
  const pauseEnded = state.pausedUntil && state.pausedUntil <= now;

  const changes = {};
  if (expired.length) {
    const kept = Object.fromEntries(Object.entries(state.allowances).filter(([, t]) => t > now));
    changes.allowances = kept;
  }
  if (pauseEnded) changes.pausedUntil = 0;
  if (Object.keys(changes).length) await set(changes);
  await syncRules();

  if (state.settings.reblockOnExpiry && (expired.length || pauseEnded)) {
    await enforceOpenTabs({ onlyPatterns: pauseEnded ? null : expired, reason: 'expired' });
  }
}

async function bumpStat(key) {
  const today = todayKey();
  await update('stats', (stats) => {
    const day = stats[today] || { blocked: 0, continued: 0, backed: 0 };
    day[key] = (day[key] || 0) + 1;
    stats[today] = day;
    const keys = Object.keys(stats).sort();
    for (const k of keys.slice(0, Math.max(0, keys.length - STATS_DAYS))) delete stats[k];
    return stats;
  });
}

async function allow(url, minutes) {
  const { sites } = await getState(['sites']);
  const patterns = matchingPatterns(url, sites.map((s) => s.pattern));
  const until = Date.now() + Math.max(1, Math.min(240, Number(minutes) || 15)) * 60_000;
  await update('allowances', (a) => {
    for (const p of patterns) a[p] = until;
    return a;
  });
  await syncRules();
  return { patterns, until };
}

const handlers = {
  async allow({ url, minutes }) {
    const res = await allow(url, minutes);
    await bumpStat('continued');
    return res;
  },
  async endAllowance({ patterns }) {
    await update('allowances', (a) => {
      for (const p of patterns || Object.keys(a)) delete a[p];
      return a;
    });
    await syncRules();
    await enforceOpenTabs({ onlyPatterns: patterns || null, reason: 'expired' });
    return { ok: true };
  },
  async stat({ key }) {
    if (['blocked', 'continued', 'backed'].includes(key)) await bumpStat(key);
    return { ok: true };
  },
  async blockTab({ tabId }) {
    await syncRules();
    return { redirected: await enforceOpenTabs({ tabId }) };
  },
  async sync() {
    await syncRules();
    return { ok: true };
  },
};

chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
  const fn = msg && handlers[msg.type];
  if (!fn) return false;
  fn(msg)
    .then(respond)
    .catch((err) => respond({ error: String(err && err.message ? err.message : err) }));
  return true;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === EXPIRY_ALARM) handleExpiry();
});

onChange(RULE_KEYS, () => syncRules());

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  // Fill in any keys a previous version didn't have, and clean bad patterns.
  const state = await getState();
  const fill = {};
  const raw = await chrome.storage.local.get(null);
  for (const k of Object.keys(DEFAULTS)) if (!(k in raw)) fill[k] = state[k];
  const cleaned = state.sites
    .map((s) => ({ ...s, pattern: normalizePattern(s.pattern) }))
    .filter((s) => s.pattern);
  if (cleaned.length !== state.sites.length) fill.sites = cleaned;
  if (Object.keys(fill).length) await set(fill);
  await syncRules();
  if (reason === 'install') chrome.runtime.openOptionsPage();
});

chrome.runtime.onStartup.addListener(() => handleExpiry());

chrome.contextMenus?.removeAll(() => {
  chrome.contextMenus.create({
    id: 'block-site',
    title: 'Block this site with Redirectory',
    contexts: ['page', 'link'],
    documentUrlPatterns: ['http://*/*', 'https://*/*'],
  });
});

chrome.contextMenus?.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'block-site') return;
  const target = info.linkUrl || info.pageUrl;
  let pattern = null;
  try {
    pattern = normalizePattern(new URL(target).hostname);
  } catch {
    return;
  }
  if (!pattern) return;
  await update('sites', (sites) =>
    sites.some((s) => s.pattern === pattern) ? sites : [...sites, { pattern, addedAt: Date.now() }]
  );
  await syncRules();
  if (!info.linkUrl && tab && tab.id != null) await enforceOpenTabs({ tabId: tab.id });
});
