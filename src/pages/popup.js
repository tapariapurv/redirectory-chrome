import { getState, set, onChange, send } from '../lib/store.js';
import { normalizePattern, parsePatternList, matchingPatterns, splitPattern, isWebUrl } from '../lib/domains.js';
import { isBlockingActive, activeAllowances } from '../lib/rules.js';
import { PRESETS, presetState, togglePreset, getPreset } from '../lib/presets.js';
import { addPatterns, removePatterns } from '../lib/sites.js';
import { h, icon, favicon, toast, formatTime, formatRemaining, BRAND_MARK } from '../lib/ui.js';

const $ = (id) => document.getElementById(id);
const LIST_LIMIT = 6;

let state;
let tab = null;
let showAll = false;

async function init() {
  $('brand').innerHTML = BRAND_MARK + '<span>Redirectory</span>';
  $('add-btn').append(icon('plus'));
  $('focus-link').append(icon('layout'), 'Focus panel');
  $('settings-link').append(icon('settings'), 'Settings');

  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  state = await getState();
  render();

  onChange(['sites', 'allowances', 'enabled', 'pausedUntil'], async () => {
    state = await getState();
    render();
  });

  $('add-form').addEventListener('submit', onAdd);
  $('pause-btn').addEventListener('click', onPauseClick);
  setInterval(() => render(), 15_000); // keep countdowns fresh
}

/** The site the user is "on" — for the block page, that's the site it blocked. */
function currentUrl() {
  if (!tab) return '';
  const url = tab.url || tab.pendingUrl || '';
  const blockedPrefix = chrome.runtime.getURL('src/pages/blocked.html');
  if (url.startsWith(blockedPrefix)) return url.slice(url.indexOf('#') + 1);
  return url;
}

function render() {
  renderHeader();
  renderCurrent();
  renderPresets();
  renderSites();
}

function renderHeader() {
  const now = Date.now();
  const btn = $('pause-btn');
  const banner = $('status-banner');
  const active = isBlockingActive(state, now);

  if (state.enabled === false) {
    btn.hidden = true;
    banner.hidden = false;
    banner.replaceChildren(
      h('span', { class: 'grow' }, 'Blocking is switched off.'),
      h('button', { class: 'btn btn-primary btn-sm', onclick: () => set({ enabled: true }) }, 'Turn on')
    );
  } else if (!active) {
    btn.hidden = true;
    banner.hidden = false;
    banner.replaceChildren(
      h('span', { class: 'pulse' }),
      h('span', { class: 'grow' }, `Paused until ${formatTime(state.pausedUntil)}`),
      h('button', { class: 'btn btn-primary btn-sm', onclick: () => set({ pausedUntil: 0 }) }, 'Resume')
    );
  } else {
    btn.hidden = false;
    banner.hidden = true;
    btn.replaceChildren(icon('pause'), 'Pause');
  }
}

function onPauseClick() {
  const bar = $('pause-bar');
  if (!bar.hidden) {
    bar.hidden = true;
    return;
  }
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 0);
  const options = [
    ['15 min', Date.now() + 15 * 60_000],
    ['1 hour', Date.now() + 60 * 60_000],
    ['Rest of day', endOfDay.getTime()],
  ];
  $('pause-options').replaceChildren(
    ...options.map(([label, until]) =>
      h(
        'button',
        {
          class: 'btn btn-sm',
          type: 'button',
          onclick: async () => {
            bar.hidden = true;
            await set({ pausedUntil: until });
            toast(`Paused until ${formatTime(until)}`);
          },
        },
        label
      )
    )
  );
  bar.hidden = false;
}

function renderCurrent() {
  const el = $('current');
  const url = currentUrl();
  if (!isWebUrl(url)) {
    el.className = 'current muted';
    el.replaceChildren(
      h('span', { class: 'favicon' }, icon('shield')),
      h('div', { class: 'current-info' }, 'Open any website and block it from here in one click.')
    );
    return;
  }
  const u = new URL(url);
  const hostname = u.hostname.replace(/^www\d?\./, '');
  const patterns = state.sites.map((s) => s.pattern);
  const matches = matchingPatterns(url, patterns);
  const now = Date.now();
  const allowedUntil = Math.max(0, ...matches.map((p) => state.allowances[p] || 0));
  const isAllowed = matches.length && allowedUntil > now;

  let stateEl;
  let action;
  if (!matches.length) {
    stateEl = h('div', { class: 'current-state' }, h('span', { class: 'dot' }), 'Not blocked');
    action = h('button', { class: 'btn btn-primary btn-sm', onclick: () => blockCurrent(hostname) }, icon('ban'), 'Block site');
  } else if (isAllowed) {
    stateEl = h(
      'div',
      { class: 'current-state allowed' },
      h('span', { class: 'dot' }),
      `Allowed · ${formatRemaining(allowedUntil - now)} left`
    );
    action = h(
      'button',
      {
        class: 'btn btn-ghost btn-sm',
        onclick: async () => {
          await send('endAllowance', { patterns: matches });
          toast('Back to blocked');
        },
      },
      'End now'
    );
  } else {
    const label = matches[0] === hostname ? 'Blocked' : `Blocked via ${matches[0]}`;
    stateEl = h('div', { class: 'current-state blocked' }, h('span', { class: 'dot' }), label);
    action = h('button', { class: 'btn btn-ghost btn-sm', onclick: () => removeSites(matches) }, 'Unblock');
  }

  el.className = 'current';
  el.replaceChildren(
    favicon(url),
    h('div', { class: 'current-info' }, h('div', { class: 'current-host', title: hostname }, hostname), stateEl),
    action
  );
}

async function blockCurrent(hostname) {
  const pattern = normalizePattern(hostname);
  if (!pattern) return;
  const res = addPatterns(state.sites, [pattern]);
  await set({ sites: res.sites });
  if (tab) await send('blockTab', { tabId: tab.id });
  window.close();
}

async function onAdd(e) {
  e.preventDefault();
  const input = $('add-input');
  const patterns = parsePatternList(input.value);
  if (!patterns.length) {
    input.classList.remove('invalid');
    void input.offsetWidth;
    input.classList.add('invalid');
    return;
  }
  input.classList.remove('invalid');
  const res = addPatterns(state.sites, patterns);
  input.value = '';
  if (!res.added.length) return toast('Already on your list');
  await set({ sites: res.sites });
  toast(res.added.length === 1 ? `Blocked ${res.added[0]}` : `Blocked ${res.added.length} sites`);
}

async function removeSites(patterns) {
  const before = state.sites;
  await set({ sites: removePatterns(before, patterns) });
  toast(patterns.length === 1 ? `Unblocked ${patterns[0]}` : `Unblocked ${patterns.length} sites`, {
    label: 'Undo',
    run: () => set({ sites: before }),
  });
}

function renderPresets() {
  $('presets').replaceChildren(
    ...PRESETS.map((p) => {
      const st = presetState(p, state.sites);
      return h(
        'button',
        {
          class: `preset ${st}`,
          type: 'button',
          title: `${p.blurb}\n\n${p.sites.join(', ')}`,
          'aria-pressed': String(st === 'on'),
          onclick: async () => {
            const enable = st !== 'on';
            const sites = togglePreset(state.sites, p.id, enable);
            const before = state.sites;
            await set({ sites });
            toast(enable ? `${p.name} blocked` : `${p.name} unblocked`, enable ? null : { label: 'Undo', run: () => set({ sites: before }) });
          },
        },
        h('span', { class: 'preset-icon' }, icon(p.icon)),
        h('span', { class: 'preset-name' }, p.name),
        h('span', { class: 'preset-check' }, icon('check'))
      );
    })
  );
}

function renderSites() {
  const list = $('sites');
  const { sites } = state;
  $('count').textContent = sites.length ? String(sites.length) : '';
  if (!sites.length) {
    list.replaceChildren(h('li', { class: 'sites-empty' }, 'Nothing blocked yet. Add a site or pick a quick list.'));
    return;
  }
  const allowed = new Set(activeAllowances(state.allowances));
  const shown = showAll ? sites : sites.slice(0, LIST_LIMIT);
  const rows = shown.map((s) => {
    const { host, path } = splitPattern(s.pattern);
    const preset = s.preset ? getPreset(s.preset) : null;
    return h(
      'li',
      { class: 'site' + (allowed.has(s.pattern) ? ' allowed' : '') },
      favicon(host),
      h('span', { class: 'site-name', title: s.pattern }, host, path ? h('span', { class: 'path' }, path) : null),
      preset ? h('span', { class: 'tag' }, preset.name.split(' ')[0]) : null,
      h(
        'button',
        { class: 'icon-btn danger', 'aria-label': `Unblock ${s.pattern}`, onclick: () => removeSites([s.pattern]) },
        icon('x')
      )
    );
  });
  if (sites.length > LIST_LIMIT) {
    rows.push(
      h(
        'li',
        {},
        h(
          'button',
          {
            class: 'sites-more',
            onclick: () => {
              showAll = !showAll;
              renderSites();
            },
          },
          showAll ? 'Show less' : `Show all ${sites.length}`
        )
      )
    );
  }
  list.replaceChildren(...rows);
}

init();
