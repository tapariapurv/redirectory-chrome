// Page-side logos for sites and apps: bundled brand mark > cached real
// favicon > lettered tile. Tiles upgrade in place when a favicon arrives.

import { brandFor, brandStyle } from './brands.js';
import { getProvider } from './embeds.js';
import { isFresh } from './favicon-fetch.js';

let cache = {};
let ready = null;
const requested = new Set();
let queue = new Set();
let flushTimer = null;

/** Load the favicon cache; await once before the first render to avoid flicker. */
export function initLogos() {
  if (!ready) {
    ready = chrome.storage.local.get('favicons').then((r) => {
      cache = r.favicons || {};
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes.favicons) return;
        const next = changes.favicons.newValue || {};
        const updated = Object.keys(next).filter((k) => next[k]?.d !== cache[k]?.d);
        cache = next;
        for (const d of updated) refresh(d);
      });
    });
  }
  return ready;
}

export function hostOf(target) {
  return String(target || '')
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .split(/[/:?#]/)[0]
    .replace(/^www\d?\./, '');
}

function letterHue(s) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

function requestFavicon(domain) {
  if (!domain || requested.has(domain) || isFresh(cache[domain])) return;
  requested.add(domain);
  queue.add(domain);
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    const domains = [...queue];
    queue = new Set();
    chrome.runtime.sendMessage({ type: 'favicons', domains }).catch(() => {});
  }, 30);
}

function paint(el, domain) {
  const brand = brandFor(domain);
  el.className = el.dataset.base;
  el.removeAttribute('style');
  el.replaceChildren();
  if (brand) {
    const st = brandStyle(brand.hex);
    el.classList.add('is-brand', st.mode);
    el.style.setProperty('--mark', `url("${chrome.runtime.getURL(`src/assets/brands/${brand.slug}.svg`)}")`);
    if (st.fg) el.style.setProperty('--fg', st.fg);
    if (st.bg) el.style.setProperty('--bg', st.bg);
    el.append(document.createElement('i'));
    return;
  }
  const hit = cache[domain]?.d;
  if (hit) {
    el.classList.add('is-img');
    const img = document.createElement('img');
    img.src = hit;
    img.alt = '';
    img.decoding = 'async';
    img.onerror = () => {
      img.remove();
      paintLetter(el, domain);
    };
    el.append(img);
    return;
  }
  paintLetter(el, domain);
  requestFavicon(domain);
}

function paintLetter(el, domain) {
  el.classList.add('is-letter');
  el.style.setProperty('--hue', letterHue(domain));
  el.textContent = (domain.replace(/^(m|app|web|news|store)\./, '')[0] || '?').toUpperCase();
}

function refresh(domain) {
  for (const el of document.querySelectorAll(`.logo[data-domain="${CSS.escape(domain)}"]`)) {
    paint(el, domain);
    el.classList.add('pop');
  }
}

/**
 * Logo for a site: accepts a host, a block pattern or a full URL.
 * size: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
 */
export function siteLogo(target, { size = 'md', className = '' } = {}) {
  const domain = hostOf(target);
  const el = document.createElement('span');
  el.dataset.base = `logo ${size} ${className}`.trim();
  el.dataset.domain = domain;
  el.setAttribute('aria-hidden', 'true');
  paint(el, domain);
  return el;
}

/** Logo for a focus-panel app: an embed { provider, url } or a provider id. */
export function appLogo(embedOrProvider, opts = {}) {
  const e = typeof embedOrProvider === 'string' ? { provider: embedOrProvider } : embedOrProvider || {};
  const p = getProvider(e.provider);
  if (p.builtin) {
    const el = document.createElement('span');
    el.className = `logo ${opts.size || 'md'} is-app-tasks ${opts.className || ''}`.trim();
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7"/></svg>';
    return el;
  }
  if (!e.url && !p.domain) {
    const el = document.createElement('span');
    el.className = `logo ${opts.size || 'md'} is-globe ${opts.className || ''}`.trim();
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3Z"/></svg>';
    return el;
  }
  return siteLogo(e.url || p.domain, opts);
}

/** A small overlapping stack of site logos (used for presets). */
export function logoStack(targets, { size = 'sm', max = 4 } = {}) {
  const wrap = document.createElement('span');
  wrap.className = 'logo-stack';
  for (const t of targets.slice(0, max)) wrap.append(siteLogo(t, { size }));
  return wrap;
}
