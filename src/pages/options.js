import { getState, set, onChange, uid, todayKey, DEFAULTS, DEFAULT_SETTINGS } from '../lib/store.js';
import { parsePatternList, splitPattern, normalizePattern } from '../lib/domains.js';
import { isBlockingActive } from '../lib/rules.js';
import { PRESETS, presetState, togglePreset } from '../lib/presets.js';
import { PROVIDERS, getProvider, normalizeEmbedUrl, detectProvider } from '../lib/embeds.js';
import { addPatterns, removePatterns } from '../lib/sites.js';
import { h, icon, favicon, monogram, toast, formatTime, plural, BRAND_MARK } from '../lib/ui.js';

const $ = (id) => document.getElementById(id);
const WAIT_OPTIONS = [0, 5, 10, 20, 30, 60];
const DURATION_OPTIONS = [1, 5, 10, 15, 30, 60];
const MAX_DURATIONS = 4;

let state;
let filter = '';
let draftProvider = null;

async function init() {
  $('brand').innerHTML = BRAND_MARK + '<span>Redirectory</span>';
  for (const a of $('nav').querySelectorAll('a')) a.prepend(icon(a.dataset.icon));
  $('search-icon').append(icon('search'));
  $('welcome-close').append(icon('x'));
  $('note-icon').append(icon('sparkle'));
  $('preview-btn').append(icon('eye'), 'Preview');
  $('preview-btn').href = 'blocked.html?preview=1#https://www.youtube.com/';
  $('export-btn').append(icon('download'), 'Export');
  $('import-label').prepend(icon('upload'), 'Import');

  state = await getState();
  renderAll();

  onChange(Object.keys(DEFAULTS), async () => {
    state = await getState();
    renderAll();
  });

  wireBlocklist();
  wireFocus();
  wireFriction();
  wireData();
  wireNav();

  $('welcome-close').addEventListener('click', () => set({ onboarded: true }));
}

function renderAll() {
  $('welcome').hidden = !!state.onboarded;
  renderStatus();
  renderPresets();
  renderSites();
  renderEmbeds();
  renderProviders();
  renderFriction();
  renderInsights();
}

function renderStatus() {
  const el = $('nav-status');
  const on = isBlockingActive(state);
  el.classList.toggle('off', !on);
  const title = state.enabled === false ? 'Blocking off' : on ? 'Blocking on' : 'Paused';
  const desc =
    state.enabled === false
      ? 'Turn it on under Friction.'
      : on
        ? `${plural(state.sites.length, 'site')} on your list.`
        : `Resumes at ${formatTime(state.pausedUntil)}.`;
  el.replaceChildren(h('b', {}, h('span', { class: 'dot' }), title), desc);
}

/* ---------- Blocklist ---------- */

function wireBlocklist() {
  $('add-form').addEventListener('submit', async (e) => {
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
  });
  $('add-input').addEventListener('paste', (e) => {
    // Pasting a multi-line list submits straight away.
    const text = e.clipboardData.getData('text');
    if (/\n/.test(text.trim())) {
      e.preventDefault();
      $('add-input').value = parsePatternList(text).join(', ');
    }
  });
  $('search').addEventListener('input', (e) => {
    filter = e.target.value.trim().toLowerCase();
    renderSites();
  });
  $('clear-all').addEventListener('click', async () => {
    if (!state.sites.length) return;
    const before = state.sites;
    await set({ sites: [] });
    toast(`Cleared ${plural(before.length, 'site')}`, { label: 'Undo', run: () => set({ sites: before }) });
  });
}

function renderPresets() {
  $('presets').replaceChildren(
    ...PRESETS.map((p) => {
      const st = presetState(p, state.sites);
      return h(
        'button',
        {
          class: `preset-card ${st}`,
          type: 'button',
          'aria-pressed': String(st === 'on'),
          onclick: async () => {
            const enable = st !== 'on';
            const before = state.sites;
            await set({ sites: togglePreset(state.sites, p.id, enable) });
            toast(enable ? `${p.name} blocked` : `${p.name} unblocked`, enable ? null : { label: 'Undo', run: () => set({ sites: before }) });
          },
        },
        h(
          'div',
          { class: 'top' },
          h('span', { class: 'pi' }, icon(p.icon)),
          h(
            'span',
            { class: 'state' },
            st === 'partial' ? `${p.sites.filter((x) => state.sites.some((s) => s.pattern === x)).length} of ${p.sites.length}` : '',
            h('span', { class: 'check' }, icon('check'))
          )
        ),
        h('span', { class: 'name' }, p.name),
        h('span', { class: 'blurb' }, p.blurb),
        h('span', { class: 'sites-preview' }, p.sites.join(' · '))
      );
    })
  );
}

function renderSites() {
  const list = $('sites');
  const sites = state.sites.filter((s) => !filter || s.pattern.includes(filter));
  $('count').textContent = state.sites.length ? String(state.sites.length) : '';
  $('clear-all').hidden = !state.sites.length;
  if (!sites.length) {
    list.replaceChildren(
      h('li', { class: 'empty' }, state.sites.length ? 'No sites match that filter.' : 'Your list is empty. Add a site above or switch on a quick list.')
    );
    return;
  }
  list.replaceChildren(
    ...sites.map((s) => {
      const { host, path } = splitPattern(s.pattern);
      return h(
        'li',
        { class: 'site' },
        favicon(host),
        h('span', { class: 'site-name', title: s.pattern }, host, path ? h('span', { class: 'path' }, path) : null),
        h(
          'button',
          {
            class: 'icon-btn danger',
            'aria-label': `Unblock ${s.pattern}`,
            onclick: async () => {
              const before = state.sites;
              await set({ sites: removePatterns(before, [s.pattern]) });
              toast(`Unblocked ${s.pattern}`, { label: 'Undo', run: () => set({ sites: before }) });
            },
          },
          icon('x')
        )
      );
    })
  );
}

/* ---------- Focus panel ---------- */

function renderEmbeds() {
  const { embeds } = state;
  const list = $('embeds');
  if (!embeds.length) {
    list.replaceChildren(h('li', { class: 'empty' }, 'No panels yet — the block page will show a shortcut to set one up.'));
    return;
  }
  list.replaceChildren(
    ...embeds.map((e, i) => {
      const p = getProvider(e.provider);
      const isDefault = i === 0;
      return h(
        'li',
        { class: 'embed' },
        monogram(e.label || p.name, p.color),
        h(
          'div',
          { class: 'embed-info' },
          h('div', { class: 'embed-name' }, e.label || p.name, isDefault && embeds.length > 1 ? h('span', { class: 'tag accent' }, 'Opens first') : null),
          h('div', { class: 'embed-url' }, p.builtin ? 'Built in · stored on this device' : e.url)
        ),
        h(
          'div',
          { class: 'embed-actions' },
          h('button', { class: 'icon-btn', 'aria-label': 'Move up', disabled: i === 0, onclick: () => moveEmbed(i, -1) }, icon('up')),
          h('button', { class: 'icon-btn', 'aria-label': 'Move down', disabled: i === embeds.length - 1, onclick: () => moveEmbed(i, 1) }, icon('down')),
          h('button', { class: 'icon-btn danger', 'aria-label': `Remove ${e.label}`, onclick: () => removeEmbed(e.id) }, icon('trash'))
        )
      );
    })
  );
}

async function moveEmbed(i, dir) {
  const embeds = [...state.embeds];
  const [item] = embeds.splice(i, 1);
  embeds.splice(i + dir, 0, item);
  // The first panel is the one the block page opens with.
  await set({ embeds, activeEmbedId: embeds[0].id });
}

async function removeEmbed(id) {
  const before = state.embeds;
  const embeds = before.filter((e) => e.id !== id);
  await set({ embeds, activeEmbedId: embeds[0] ? embeds[0].id : null });
  toast('Panel removed', { label: 'Undo', run: () => set({ embeds: before, activeEmbedId: before[0].id }) });
}

function renderProviders() {
  const hasTasks = state.embeds.some((e) => e.provider === 'tasks');
  $('providers').replaceChildren(
    ...PROVIDERS.map((p) =>
      h(
        'button',
        {
          class: 'provider',
          type: 'button',
          'aria-pressed': String(draftProvider === p.id),
          disabled: p.builtin && hasTasks,
          title: p.builtin && hasTasks ? 'Already in your panel' : '',
          onclick: () => openEmbedForm(p.id),
        },
        monogram(p.name, p.color),
        p.name
      )
    )
  );
}

function openEmbedForm(providerId) {
  const p = getProvider(providerId);
  if (p.builtin) {
    addEmbed({ provider: 'tasks', label: p.name, url: '' });
    return;
  }
  draftProvider = providerId;
  renderProviders();
  const form = $('embed-form');
  form.hidden = false;
  $('embed-form-badge').replaceChildren(monogram(p.name, p.color));
  $('embed-form-title').textContent = p.id === 'custom' ? 'Add any website' : `Add ${p.name}`;
  $('embed-form-hint').textContent = p.hint || `Paste the ${p.name} link you want to see when you get redirected.`;
  $('embed-label').value = p.id === 'custom' ? '' : p.name;
  $('embed-label').placeholder = p.id === 'custom' ? 'My planner' : p.name;
  const url = $('embed-url');
  url.value = p.url || '';
  url.placeholder = p.placeholder || 'https://';
  url.classList.remove('invalid');
  (p.id === 'custom' || p.id === 'notion' ? url : $('embed-label')).focus();
  if (p.id === 'notion') url.select();
  form.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function closeEmbedForm() {
  draftProvider = null;
  $('embed-form').hidden = true;
  renderProviders();
}

async function addEmbed({ provider, label, url }) {
  const embed = { id: uid(), provider, label, url };
  const embeds = [...state.embeds, embed];
  // A freshly added app becomes the one you land on.
  const ordered = [embed, ...embeds.filter((e) => e.id !== embed.id)];
  await set({ embeds: ordered, activeEmbedId: embed.id });
  toast(`${label} added to your focus panel`, {
    label: 'Preview',
    run: () => window.open($('preview-btn').href, '_blank'),
  });
}

function wireFocus() {
  $('embed-cancel').addEventListener('click', closeEmbedForm);
  $('embed-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const urlInput = $('embed-url');
    const url = normalizeEmbedUrl(urlInput.value);
    if (!url) {
      urlInput.classList.remove('invalid');
      void urlInput.offsetWidth;
      urlInput.classList.add('invalid');
      urlInput.focus();
      return;
    }
    let provider = draftProvider;
    if (provider === 'custom') provider = detectProvider(url);
    const label = $('embed-label').value.trim() || getProvider(provider).name || new URL(url).hostname;
    closeEmbedForm();
    await addEmbed({ provider, label, url });
  });
}

/* ---------- Friction ---------- */

function renderFriction() {
  const s = state.settings;
  $('enabled').checked = state.enabled !== false;
  $('require-reason').checked = !!s.requireReason;
  $('reblock').checked = !!s.reblockOnExpiry;

  $('wait').replaceChildren(
    ...WAIT_OPTIONS.map((n) =>
      h(
        'button',
        { type: 'button', 'aria-pressed': String(s.waitSeconds === n), onclick: () => saveSettings({ waitSeconds: n }) },
        n ? `${n}s` : 'Off'
      )
    )
  );

  $('durations').replaceChildren(
    ...DURATION_OPTIONS.map((m) => {
      const on = s.durations.includes(m);
      return h(
        'button',
        { type: 'button', class: 'chip' + (on ? ' on' : ''), 'aria-pressed': String(on), onclick: () => toggleDuration(m) },
        m >= 60 ? `${m / 60} h` : `${m} min`
      );
    })
  );
}

function toggleDuration(m) {
  const { durations } = state.settings;
  if (!durations.includes(m)) {
    if (durations.length >= MAX_DURATIONS) return toast(`Up to ${MAX_DURATIONS} options — remove one first`);
    return saveSettings({ durations: [...durations, m].sort((a, b) => a - b) });
  }
  if (durations.length === 1) return toast('Keep at least one option');
  saveSettings({ durations: durations.filter((x) => x !== m) });
}

function saveSettings(patch) {
  return set({ settings: { ...state.settings, ...patch } });
}

function wireFriction() {
  $('enabled').addEventListener('change', (e) => set({ enabled: e.target.checked, pausedUntil: 0 }));
  $('require-reason').addEventListener('change', (e) => saveSettings({ requireReason: e.target.checked }));
  $('reblock').addEventListener('change', (e) => saveSettings({ reblockOnExpiry: e.target.checked }));
}

/* ---------- Insights ---------- */

function renderInsights() {
  const days = [];
  const d = new Date();
  d.setDate(d.getDate() - 13);
  for (let i = 0; i < 14; i++) {
    const key = todayKey(d);
    days.push({ key, date: new Date(d), ...(state.stats[key] || { blocked: 0, continued: 0, backed: 0 }) });
    d.setDate(d.getDate() + 1);
  }
  const total = (k) => days.reduce((n, x) => n + (x[k] || 0), 0);
  const blocked = total('blocked');
  const backed = total('backed');
  const continued = total('continued');
  const decided = backed + continued;
  const rate = decided ? Math.round((backed / decided) * 100) : null;

  $('kpis').replaceChildren(
    kpi(blocked, 'Redirects'),
    kpi(backed, 'Times you turned back'),
    kpi(rate == null ? '—' : rate + '%', 'Turn-back rate')
  );

  const max = Math.max(1, ...days.map((x) => (x.backed || 0) + (x.continued || 0)));
  $('chart').replaceChildren(
    ...days.map((x, i) => {
      const b = x.backed || 0;
      const c = x.continued || 0;
      const label = i === 13 ? 'Today' : x.date.toLocaleDateString([], { weekday: 'narrow' });
      return h(
        'div',
        { class: 'bar', title: `${x.date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}\n${b} turned back · ${c} continued` },
        b + c === 0 ? h('i', { class: 'none' }) : null,
        b ? h('i', { class: 'back', style: `height:${(b / max) * 100}%` }) : null,
        c ? h('i', { class: 'cont', style: `height:${(c / max) * 100}%` }) : null,
        h('span', {}, label)
      );
    })
  );
}

function kpi(value, label) {
  return h('div', { class: 'kpi' }, h('div', { class: 'kpi-value' }, value), h('div', { class: 'kpi-label' }, label));
}

/* ---------- Backup ---------- */

function wireData() {
  $('export-btn').addEventListener('click', () => {
    const data = {
      app: 'redirectory',
      version: 1,
      exportedAt: new Date().toISOString(),
      sites: state.sites,
      settings: state.settings,
      embeds: state.embeds,
      tasks: state.tasks,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `redirectory-${todayKey()}.json` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  $('import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data.app !== 'redirectory') throw new Error('Not a Redirectory backup');
      const patch = {};
      if (Array.isArray(data.sites)) {
        const patterns = data.sites.map((s) => normalizePattern(s && s.pattern)).filter(Boolean);
        patch.sites = addPatterns(state.sites, patterns).sites;
      }
      if (data.settings && typeof data.settings === 'object') patch.settings = { ...DEFAULT_SETTINGS, ...data.settings };
      if (Array.isArray(data.embeds)) {
        const embeds = data.embeds
          .filter((x) => x && (x.provider === 'tasks' || normalizeEmbedUrl(x.url)))
          .map((x) => ({ id: x.id || uid(), provider: x.provider, label: String(x.label || ''), url: x.url || '' }));
        if (embeds.length) Object.assign(patch, { embeds, activeEmbedId: embeds[0].id });
      }
      if (Array.isArray(data.tasks)) patch.tasks = data.tasks;
      await set(patch);
      toast('Backup imported');
    } catch (err) {
      toast('Couldn’t import: ' + err.message);
    }
  });

  $('reset-btn').addEventListener('click', async () => {
    if (!confirm('Reset Redirectory? This clears your blocklist, panels, tasks and stats.')) return;
    await chrome.storage.local.clear();
    await set(structuredClone({ ...DEFAULTS, onboarded: true }));
    toast('Everything reset');
  });
}

/* ---------- Nav ---------- */

function wireNav() {
  const links = [...$('nav').querySelectorAll('a')];
  const sections = links.map((a) => document.querySelector(a.getAttribute('href')));
  const setActive = () => {
    let current = sections[0];
    for (const s of sections) if (s.getBoundingClientRect().top < 140) current = s;
    if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 4) current = sections[sections.length - 1];
    links.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + current.id));
  };
  window.addEventListener('scroll', setActive, { passive: true });
  setActive();
}

init();
