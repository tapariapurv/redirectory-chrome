// Thin wrapper over chrome.storage.local. Every top-level key is independent
// so listeners only react to what actually changed.

export const DEFAULT_SETTINGS = {
  waitSeconds: 10, // countdown before "Continue" unlocks; 0 = instant
  requireReason: false, // ask "what for?" before continuing
  durations: [5, 15, 30], // minutes offered on the blocked page; shortest is pre-selected
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
};

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
