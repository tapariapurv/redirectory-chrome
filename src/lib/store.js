// Thin wrapper over chrome.storage.local. Every top-level key is independent
// so listeners only react to what actually changed.

export const DEFAULT_SETTINGS = {
  waitSeconds: 10, // countdown before "Continue" unlocks; 0 = instant
  requireReason: false, // ask "what for?" before continuing
  durations: [5, 15, 30, 'day'], // minutes offered on the block page, or 'day' for the rest of today
  reblockOnExpiry: true, // send open tabs back to the block page when time is up
};

export const DEFAULTS = {
  enabled: true,
  pausedUntil: 0,
  sites: [], // [{ pattern, preset?, addedAt }]
  allowances: {}, // { pattern: expiresAtMs }
  settings: DEFAULT_SETTINGS,
  embeds: [{ id: 'tasks', provider: 'tasks', label: 'Quick tasks', url: '' }],
  activeEmbedId: 'tasks',
  tasks: [],
  stats: {}, // { 'YYYY-MM-DD': { blocked, continued, backed } }
  onboarded: false,
  appearance: { theme: 'ember', mode: 'system' },
  favicons: {}, // { domain: { d: dataUrl | '', t: fetchedAt } }
  schema: 2,
};

export const DAY = 'day';

/** Local midnight at the end of the given day. */
export function endOfDay(now = Date.now()) {
  const d = new Date(now);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

/** "5 min", "1 h", "today" — label for a duration option. */
export function durationLabel(m) {
  if (m === DAY) return 'Rest of today';
  return m >= 60 ? `${m / 60} h` : `${m} min`;
}

/** Sort numeric durations ascending with 'day' last. */
export function sortDurations(list) {
  return [...new Set(list)].sort((a, b) => (a === DAY) - (b === DAY) || a - b);
}

export async function getState(keys = Object.keys(DEFAULTS)) {
  const raw = await chrome.storage.local.get(keys);
  const out = {};
  for (const k of keys) {
    const v = raw[k];
    if (k === 'settings') out[k] = { ...DEFAULT_SETTINGS, ...(v || {}) };
    else out[k] = v === undefined ? structuredClone(DEFAULTS[k]) : v;
  }
  return out;
}

export async function get(key) {
  return (await getState([key]))[key];
}

export function set(values) {
  return chrome.storage.local.set(values);
}

/** Read-modify-write a single key. */
export async function update(key, fn) {
  const next = await fn(await get(key));
  await set({ [key]: next });
  return next;
}

/** Subscribe to changes for specific keys; returns an unsubscribe function. */
export function onChange(keys, fn) {
  const listener = (changes, area) => {
    if (area !== 'local') return;
    if (keys.some((k) => k in changes)) fn(changes);
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

export function todayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

/** Ask the background worker to do something and wait for the answer. */
export function send(type, payload = {}) {
  return chrome.runtime.sendMessage({ type, ...payload });
}

/**
 * Storage changes needed when the extension installs or updates: fill keys a
 * previous version didn't have, and run schema upgrades. Pure, for testing.
 */
export function migrate(raw, reason) {
  const patch = {};
  for (const k of Object.keys(DEFAULTS)) if (!(k in raw)) patch[k] = structuredClone(DEFAULTS[k]);
  // v1 -> v2: offer "rest of today" to people who installed before it existed.
  if (reason === 'update' && (raw.schema || 1) < 2) {
    const settings = { ...DEFAULT_SETTINGS, ...(raw.settings || {}) };
    const durations = settings.durations.includes(DAY) ? settings.durations : sortDurations([...settings.durations, DAY]);
    patch.settings = { ...settings, durations: durations.slice(-5) };
    patch.schema = 2;
  }
  return patch;
}
