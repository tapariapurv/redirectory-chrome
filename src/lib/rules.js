// Builds the complete declarativeNetRequest rule set from state. Pure, so it
// can be unit-tested and so the background worker can always rebuild from
// scratch instead of patching rules incrementally.

import { splitPattern, escapeRegex } from './domains.js';
import { embedDomain } from './embeds.js';

export const FRAME_RULE_ID = 1;
export const SITE_RULE_BASE = 100;
export const BLOCKED_PAGE = 'src/pages/blocked.html';

/** Is blocking active right now (not switched off or paused)? */
export function isBlockingActive(state, now = Date.now()) {
  return state.enabled !== false && !(state.pausedUntil > now);
}

/** Patterns currently on a temporary allowance. */
export function activeAllowances(allowances, now = Date.now()) {
  return Object.entries(allowances || {})
    .filter(([, until]) => until > now)
    .map(([p]) => p);
}

/** Patterns that should redirect right now. */
export function enforcedPatterns(state, now = Date.now()) {
  if (!isBlockingActive(state, now)) return [];
  const allowed = new Set(activeAllowances(state.allowances, now));
  const seen = new Set();
  const out = [];
  for (const s of state.sites || []) {
    if (!s || !s.pattern || seen.has(s.pattern) || allowed.has(s.pattern)) continue;
    seen.add(s.pattern);
    out.push(s.pattern);
  }
  return out;
}

export function siteRule(pattern, id, extensionId) {
  const { host, path } = splitPattern(pattern);
  const pathRe = path ? escapeRegex(encodeURI(path)) + '(?:[/?#].*)?' : '(?:[/?#].*)?';
  return {
    id,
    priority: 1 + pattern.length, // more specific patterns win ties
    action: {
      type: 'redirect',
      redirect: { regexSubstitution: `chrome-extension://${extensionId}/${BLOCKED_PAGE}#\\1` },
    },
    condition: {
      requestDomains: [host],
      regexFilter: `^(https?://[^/?#]+${pathRe})$`,
      resourceTypes: ['main_frame'],
    },
  };
}

/**
 * Lets task apps render inside the focus panel. Only applies to frames our own
 * pages load, or frames those apps navigate to themselves (sign-in redirects).
 */
export function frameRule(extensionId, embeds = []) {
  const initiators = new Set([extensionId]);
  for (const e of embeds) {
    const d = e && e.url ? embedDomain(e.url) : null;
    if (d) initiators.add(d);
  }
  return {
    id: FRAME_RULE_ID,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      responseHeaders: [
        { header: 'x-frame-options', operation: 'remove' },
        { header: 'content-security-policy', operation: 'remove' },
      ],
    },
    condition: {
      initiatorDomains: [...initiators],
      resourceTypes: ['sub_frame'],
    },
  };
}

export function buildRules(state, extensionId, now = Date.now()) {
  const rules = [frameRule(extensionId, state.embeds)];
  enforcedPatterns(state, now).forEach((pattern, i) => {
    rules.push(siteRule(pattern, SITE_RULE_BASE + i, extensionId));
  });
  return rules;
}

/** Earliest future moment the rule set changes on its own (allowance or pause ending). */
export function nextExpiry(state, now = Date.now()) {
  const times = Object.values(state.allowances || {}).filter((t) => t > now);
  if (state.pausedUntil > now) times.push(state.pausedUntil);
  return times.length ? Math.min(...times) : null;
}
