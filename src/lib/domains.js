// Pure helpers for turning user input into block patterns and matching URLs.
// A pattern is either a bare host ("youtube.com") or host + path prefix
// ("reddit.com/r/popular"). Hosts always cover their subdomains.

const HOST_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/;
const IPV4_RE = /^(?:\d{1,3}\.){3}\d{1,3}$/;

/**
 * Normalize free-form input ("https://www.YouTube.com/", "*.reddit.com/r/all?x=1")
 * into a canonical pattern, or return null if it isn't a usable site.
 */
export function normalizePattern(input) {
  if (typeof input !== 'string') return null;
  let s = input.trim().toLowerCase();
  if (!s) return null;

  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, ''); // scheme
  s = s.replace(/^\*\.?/, ''); // leading wildcard
  s = s.split(/[?#]/)[0]; // query + hash

  const slash = s.indexOf('/');
  let host = slash === -1 ? s : s.slice(0, slash);
  let path = slash === -1 ? '' : s.slice(slash);

  host = host.replace(/^[^@]*@/, ''); // credentials
  host = host.replace(/:\d+$/, ''); // port
  host = host.replace(/\.$/, '');
  host = host.replace(/^www\d?\./, '');

  if (host !== 'localhost' && !HOST_RE.test(host) && !IPV4_RE.test(host)) return null;

  path = path.replace(/\/{2,}/g, '/').replace(/\/+$/, '');
  try {
    path = decodeURI(path);
  } catch {
    /* keep as typed */
  }
  return path ? host + path : host;
}

/** Split a pattern into its host and (possibly empty) path prefix. */
export function splitPattern(pattern) {
  const i = pattern.indexOf('/');
  return i === -1 ? { host: pattern, path: '' } : { host: pattern.slice(0, i), path: pattern.slice(i) };
}

/** Parse many patterns from pasted text: commas, spaces or newlines. */
export function parsePatternList(text) {
  const out = [];
  const seen = new Set();
  for (const chunk of String(text || '').split(/[\s,;]+/)) {
    const p = normalizePattern(chunk);
    if (p && !seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  }
  return out;
}

export function hostMatches(hostname, host) {
  const h = String(hostname || '').toLowerCase().replace(/\.$/, '');
  return h === host || h.endsWith('.' + host);
}

/** Does this URL fall under the pattern? Only http(s) pages are ever matched. */
export function urlMatchesPattern(url, pattern) {
  let u;
  try {
    u = url instanceof URL ? url : new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const { host, path } = splitPattern(pattern);
  if (!hostMatches(u.hostname, host)) return false;
  if (!path) return true;
  let pathname = u.pathname.toLowerCase();
  try {
    pathname = decodeURI(pathname);
  } catch {
    /* compare raw */
  }
  return pathname === path || pathname.startsWith(path + '/');
}

/** Patterns from `patterns` that match `url`, most specific first. */
export function matchingPatterns(url, patterns) {
  return patterns.filter((p) => urlMatchesPattern(url, p)).sort((a, b) => b.length - a.length);
}

/** Hostname for display ("www.youtube.com" -> "youtube.com"). */
export function displayHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\d?\./, '');
  } catch {
    return '';
  }
}

export function isWebUrl(url) {
  return /^https?:\/\//i.test(String(url || ''));
}

export function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
