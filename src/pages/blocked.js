import { getState, set, onChange, send, todayKey } from '../lib/store.js';
import { matchingPatterns, displayHost, isWebUrl } from '../lib/domains.js';
import { isBlockingActive } from '../lib/rules.js';
import { getProvider } from '../lib/embeds.js';
import { h, icon, favicon, monogram, toast, plural, BRAND_MARK } from '../lib/ui.js';
import { mountTasks } from './tasks.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const targetUrl = decodeTarget(location.hash.slice(1));
const isPreview = params.has('preview');
const isExpired = params.get('r') === 'expired';
const host = displayHost(targetUrl) || 'this site';

const COPY = [
  ['Is this on purpose?', `You reached for <strong>${esc(host)}</strong>. Your list is right there — knock out one small thing first.`],
  ['Hold on a second.', `<strong>${esc(host)}</strong> will still be there in an hour. Will the focus you have right now?`],
  ['Not right now.', `You blocked <strong>${esc(host)}</strong> for a reason. Pick one task on the right and start it.`],
  ['Pause. Breathe.', `Opening <strong>${esc(host)}</strong> was probably a reflex. What did you actually sit down to do?`],
];

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function decodeTarget(raw) {
  if (!raw) return '';
  if (isWebUrl(raw)) return raw;
  try {
    const d = decodeURIComponent(raw);
    return isWebUrl(d) ? d : '';
  } catch {
    return '';
  }
}

let state;
let selectedMinutes;
let countdownDone = false;

async function init() {
  state = await getState();
  document.title = `${host} is blocked · Redirectory`;
  $('brand').innerHTML = BRAND_MARK + '<span>Redirectory</span>';
  $('preview-tag').hidden = !isPreview;

  // Not actually blocked any more (removed from list, paused, reloaded after
  // allowing)? Get out of the way.
  const patterns = matchingPatterns(targetUrl, state.sites.map((s) => s.pattern));
  if (!isPreview && targetUrl && (!patterns.length || !isBlockingActive(state))) {
    location.replace(targetUrl);
    return;
  }

  renderHero();
  setupContinue();
  renderPanel();
  renderStats();
  countVisit();

  onChange(['stats'], async () => {
    state.stats = (await getState(['stats'])).stats;
    renderStats();
  });
  onChange(['embeds', 'activeEmbedId'], async () => {
    Object.assign(state, await getState(['embeds', 'activeEmbedId']));
    renderPanel();
  });

  document.addEventListener('keydown', (e) => {
    const typing = e.target.closest('input, textarea');
    if (e.key === 'Escape' && !typing) {
      e.preventDefault();
      goBack();
    }
  });
}

function renderHero() {
  const chip = $('site-chip');
  chip.replaceChildren(
    favicon(targetUrl || host),
    h('span', { class: 'strike' }, host),
    h('span', { class: 'dot', title: 'Blocked' })
  );

  let headline;
  let lede;
  if (isExpired) {
    headline = `Time’s up on ${host}.`;
    lede = `That was the deal. Close it out and get back to what matters — or take a few more minutes if you really need them.`;
  } else {
    [headline, lede] = COPY[Math.floor(Math.random() * COPY.length)];
  }
  $('headline').textContent = headline;
  $('lede').innerHTML = isExpired ? esc(lede) : lede;
  $('back-btn').addEventListener('click', goBack);
}

async function goBack() {
  if (isPreview) return toast('Preview: this would take you back.');
  await send('stat', { key: 'backed' }).catch(() => {});
  // Not navigation.canGoBack: it ignores cross-origin entries, and the page
  // before this one is always a website.
  if (history.length > 1) history.back();
  else closeTab();
}

async function closeTab() {
  const tab = await chrome.tabs.getCurrent();
  if (tab) chrome.tabs.remove(tab.id);
  else window.close();
}

/* ---------- Continue ---------- */

function setupContinue() {
  const { settings } = state;
  const durations = [...new Set(settings.durations)].filter((m) => m > 0).sort((a, b) => a - b);
  selectedMinutes = durations[0] || 5; // shortest first: a nudge toward less

  const seg = $('durations');
  const renderDurations = () =>
    seg.replaceChildren(
      ...durations.map((m) =>
        h(
          'button',
          {
            type: 'button',
            'aria-pressed': String(m === selectedMinutes),
            onclick: () => {
              selectedMinutes = m;
              renderDurations();
              updateButton();
            },
          },
          m >= 60 ? `${m / 60} h` : `${m} min`
        )
      )
    );
  renderDurations();

  const reason = $('reason');
  reason.placeholder = settings.requireReason ? 'What are you going there for? (required)' : 'What are you going there for? (optional)';
  reason.addEventListener('input', updateButton);
  $('continue-sub').textContent = settings.waitSeconds ? `Unlocks after a ${settings.waitSeconds}s pause` : '';

  startCountdown(settings.waitSeconds);

  $('continue-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!canContinue()) {
      if (settings.requireReason && countdownDone) {
        reason.classList.remove('invalid');
        void reason.offsetWidth;
        reason.classList.add('invalid');
        reason.focus();
      }
      return;
    }
    if (isPreview) return toast(`Preview: this would open ${host} for ${selectedMinutes} min.`);
    const btn = $('continue-btn');
    btn.disabled = true;
    $('continue-label').textContent = 'Opening…';
    const res = await send('allow', { url: targetUrl, minutes: selectedMinutes });
    if (res && res.error) {
      toast('Something went wrong: ' + res.error);
      btn.disabled = false;
      updateButton();
      return;
    }
    location.replace(targetUrl);
  });
}

function startCountdown(seconds) {
  const fill = $('ring-fill');
  const total = Math.max(0, Number(seconds) || 0);
  if (!total) {
    countdownDone = true;
    updateButton();
    return;
  }
  // Only counts down while this tab is visible: switching away doesn't skip the pause.
  let remaining = total * 1000;
  let last = performance.now();
  const tick = (now) => {
    if (!document.hidden) remaining -= now - last;
    last = now;
    const secs = Math.ceil(Math.max(0, remaining) / 1000);
    fill.style.strokeDashoffset = String(50.27 * Math.max(0, remaining / (total * 1000)));
    if (remaining <= 0) {
      countdownDone = true;
      updateButton();
      return;
    }
    $('continue-label').textContent = `Continue in ${secs}s`;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function canContinue() {
  if (!countdownDone) return false;
  if (state.settings.requireReason && $('reason').value.trim().length < 3) return false;
  return true;
}

function updateButton() {
  const btn = $('continue-btn');
  if (!countdownDone) return;
  btn.classList.add('ready');
  btn.disabled = state.settings.requireReason ? $('reason').value.trim().length < 3 : false;
  $('continue-label').textContent = `Continue to ${host} for ${selectedMinutes >= 60 ? selectedMinutes / 60 + ' h' : selectedMinutes + ' min'}`;
}

/* ---------- Stats ---------- */

function countVisit() {
  if (isPreview) return;
  // Reloading the block page shouldn't inflate the count.
  const key = 'counted:' + targetUrl;
  if (sessionStorage.getItem(key)) return;
  sessionStorage.setItem(key, '1');
  send('stat', { key: 'blocked' }).catch(() => {});
}

function renderStats() {
  const day = state.stats[todayKey()] || { blocked: 0, continued: 0, backed: 0 };
  const streakDays = focusStreak(state.stats);
  const items = [
    h('span', {}, h('b', {}, day.blocked || 0), ' ', (day.blocked || 0) === 1 ? 'redirect today' : 'redirects today'),
    h('span', {}, h('b', {}, day.backed || 0), ' turned back'),
  ];
  if (streakDays > 1) items.push(h('span', {}, h('b', {}, streakDays), ' day streak'));
  $('stats').replaceChildren(
    ...items,
    h('span', { class: 'spacer' }),
    h('a', { href: 'options.html', target: '_blank' }, 'Settings')
  );
}

/** Consecutive days (ending today or yesterday) where you turned back at least as often as you continued. */
function focusStreak(stats) {
  let n = 0;
  const d = new Date();
  for (let i = 0; i < 365; i++) {
    const s = stats[todayKey(d)];
    const good = s && (s.backed || 0) >= (s.continued || 0) && (s.blocked || 0) > 0;
    if (good) n++;
    else if (i > 0) break;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

/* ---------- Focus panel ---------- */

const views = new Map(); // embed id -> { el, iframe? }

function renderPanel() {
  const { embeds } = state;
  const tabs = $('panel-tabs');
  const body = $('panel-body');

  // Drop views for embeds that no longer exist or whose URL changed.
  for (const [id, v] of views) {
    const e = embeds.find((x) => x.id === id);
    if (!e || (v.url || '') !== (e.url || '')) {
      v.el.remove();
      views.delete(id);
    }
  }

  if (!embeds.length) {
    tabs.replaceChildren();
    $('open-embed').hidden = $('reload-embed').hidden = true;
    body.replaceChildren(
      h(
        'div',
        { class: 'empty-panel' },
        h(
          'div',
          {},
          h('span', { class: 'empty-icon' }, icon('layout')),
          h('h2', {}, 'Put your tasks here'),
          h('p', {}, 'Add Notion, Todoist, TickTick or any page you’d rather look at than a feed.'),
          h('a', { class: 'btn btn-primary', href: 'options.html#focus', target: '_blank' }, 'Set up focus panel')
        )
      )
    );
    return;
  }
  body.querySelector('.empty-panel')?.remove();

  const active = embeds.find((e) => e.id === state.activeEmbedId) || embeds[0];
  tabs.hidden = embeds.length < 2 && active.provider === 'tasks';
  tabs.replaceChildren(
    ...embeds.map((e) => {
      const p = getProvider(e.provider);
      return h(
        'button',
        {
          class: 'panel-tab',
          role: 'tab',
          'aria-selected': String(e.id === active.id),
          onclick: () => {
            state.activeEmbedId = e.id;
            if (!isPreview) set({ activeEmbedId: e.id });
            renderPanel();
          },
        },
        monogram(e.label || p.name, p.color),
        e.label || p.name
      );
    })
  );

  for (const e of embeds) {
    let v = views.get(e.id);
    if (!v && e.id === active.id) {
      v = createView(e);
      views.set(e.id, v);
      body.append(v.el);
    }
    if (v) v.el.hidden = e.id !== active.id;
  }

  const ext = $('open-embed');
  const reload = $('reload-embed');
  ext.innerHTML = icon('external').outerHTML;
  reload.innerHTML = icon('refresh').outerHTML;
  $('panel-settings').innerHTML = icon('settings').outerHTML;
  const isFrame = active.provider !== 'tasks' && active.url;
  ext.hidden = reload.hidden = !isFrame;
  if (isFrame) ext.href = active.url;
  reload.onclick = () => {
    const v = views.get(active.id);
    if (v && v.iframe) {
      v.loader.classList.remove('done');
      v.iframe.src = active.url;
    }
  };
}

function createView(embed) {
  const el = h('div', { class: 'view' });
  if (embed.provider === 'tasks' || !embed.url) {
    mountTasks(el);
    return { el, url: embed.url || '' };
  }
  const p = getProvider(embed.provider);
  const iframe = h('iframe', {
    src: embed.url,
    title: embed.label || p.name,
    // No allow-top-navigation: an embedded app can't hijack this page.
    sandbox:
      'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads allow-storage-access-by-user-activation',
    allow: 'clipboard-read; clipboard-write; fullscreen',
    referrerpolicy: 'strict-origin-when-cross-origin',
  });
  const hint = h(
    'div',
    { class: 'loading-hint' },
    `Taking a while? Make sure you’re signed in to ${p.name} in a regular tab, or `,
    h('a', { href: embed.url, target: '_blank', rel: 'noopener' }, 'open it directly'),
    '.'
  );
  const loader = h('div', { class: 'loading' }, h('div', { class: 'loading-text' }, h('div', { class: 'spinner' }), hint));
  const hintTimer = setTimeout(() => hint.classList.add('show'), 6000);
  iframe.addEventListener('load', () => {
    clearTimeout(hintTimer);
    loader.classList.add('done');
  });
  el.append(iframe, loader);
  return { el, iframe, loader, url: embed.url };
}

init();
