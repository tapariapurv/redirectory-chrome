// Background-side favicon fetching. Chrome's own favicon cache can't be used
// for blocked sites: it links favicons across redirect chains, so a blocked
// site's cached icon becomes Redirectory's. Instead we fetch the real icon
// once, store it as a data URL, and serve it from storage after that.

export const HIT_TTL = 30 * 24 * 3600_000; // refresh real icons monthly
export const MISS_TTL = 3 * 24 * 3600_000; // retry misses after a few days
export const MAX_ENTRIES = 400;
const MAX_BYTES = 200_000;

export function faviconSources(domain) {
  const d = encodeURIComponent(domain);
  return [
    `https://www.google.com/s2/favicons?domain=${d}&sz=64`,
    `https://icons.duckduckgo.com/ip3/${d}.ico`,
    `https://${domain}/favicon.ico`,
  ];
}

function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Resolve a domain to a data: URL of its favicon, or '' if none could be found. */
export async function fetchFavicon(domain, fetchImpl = fetch) {
  for (const src of faviconSources(domain)) {
    try {
      // Google and DuckDuckGo answer 404 (with a generic globe) for unknown sites.
      const res = await fetchImpl(src, { credentials: 'omit', redirect: 'follow', cache: 'force-cache' });
      if (!res.ok) continue;
      const type = (res.headers.get('content-type') || '').split(';')[0].trim();
      if (!type.startsWith('image/')) continue;
      const buf = await res.arrayBuffer();
      if (buf.byteLength < 60 || buf.byteLength > MAX_BYTES) continue;
      return `data:${type};base64,${toBase64(buf)}`;
    } catch {
      /* try the next source */
    }
  }
  return '';
}

export function isFresh(entry, now = Date.now()) {
  if (!entry) return false;
  return now - entry.t < (entry.d ? HIT_TTL : MISS_TTL);
}

/** Merge new results into the cache, dropping the oldest entries past the cap. */
export function mergeCache(cache, results, now = Date.now()) {
  const next = { ...cache };
  for (const [domain, d] of Object.entries(results)) next[domain] = { d, t: now };
  const keys = Object.keys(next);
  if (keys.length > MAX_ENTRIES) {
    keys
      .sort((a, b) => next[a].t - next[b].t)
      .slice(0, keys.length - MAX_ENTRIES)
      .forEach((k) => delete next[k]);
  }
  return next;
}
