// Task apps that can live in the focus panel next to the "continue" button.
// Most of these refuse to be framed; the extension strips X-Frame-Options and
// CSP for frames its own pages load (see rules.js), so they render normally.

export const PROVIDERS = [
  {
    id: 'tasks',
    name: 'Quick tasks',
    color: '#F2643D',
    builtin: true,
    hint: 'A simple to-do list that lives inside Redirectory. Works offline, no account needed.',
  },
  {
    id: 'notion',
    name: 'Notion',
    color: '#191919',
    url: 'https://www.notion.so/',
    placeholder: 'https://www.notion.so/My-Tasks-1a2b3c…',
    hint: 'Paste the link to your task database, daily planner or any page.',
  },
  {
    id: 'todoist',
    name: 'Todoist',
    color: '#E44332',
    url: 'https://app.todoist.com/app/today',
    placeholder: 'https://app.todoist.com/app/today',
    hint: 'Today view by default. Paste a project or filter link to show that instead.',
  },
  {
    id: 'ticktick',
    name: 'TickTick',
    color: '#4772FA',
    url: 'https://ticktick.com/webapp/',
    placeholder: 'https://ticktick.com/webapp/',
  },
  {
    id: 'gtasks',
    name: 'Google Tasks',
    color: '#1A73E8',
    url: 'https://tasks.google.com/embed/?origin=https://calendar.google.com&fullWidth=1',
    placeholder: 'https://tasks.google.com/…',
    hint: 'Uses the same compact Tasks view Gmail shows in its side panel.',
  },
  {
    id: 'gcal',
    name: 'Google Calendar',
    color: '#0B8043',
    url: 'https://calendar.google.com/calendar/r/day',
    placeholder: 'https://calendar.google.com/calendar/r/day',
  },
  {
    id: 'mstodo',
    name: 'Microsoft To Do',
    color: '#2564CF',
    url: 'https://to-do.office.com/tasks/myday',
    placeholder: 'https://to-do.office.com/tasks/myday',
  },
  {
    id: 'linear',
    name: 'Linear',
    color: '#5E6AD2',
    url: 'https://linear.app/',
    placeholder: 'https://linear.app/your-team/my-issues',
  },
  {
    id: 'asana',
    name: 'Asana',
    color: '#F06A6A',
    url: 'https://app.asana.com/',
    placeholder: 'https://app.asana.com/0/home',
  },
  {
    id: 'trello',
    name: 'Trello',
    color: '#0C66E4',
    url: 'https://trello.com/',
    placeholder: 'https://trello.com/b/…',
  },
  {
    id: 'clickup',
    name: 'ClickUp',
    color: '#7B68EE',
    url: 'https://app.clickup.com/',
    placeholder: 'https://app.clickup.com/…',
  },
  {
    id: 'custom',
    name: 'Any website',
    color: '#6B6872',
    url: '',
    placeholder: 'https://…',
    hint: 'Any page you want in front of you: a planner, a doc, your goals.',
  },
];

export function getProvider(id) {
  return PROVIDERS.find((p) => p.id === id) || PROVIDERS[PROVIDERS.length - 1];
}

/** Validate a URL for embedding; returns a normalized https URL or null. */
export function normalizeEmbedUrl(input) {
  let s = String(input || '').trim();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = 'https://' + s;
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (!u.hostname.includes('.') && u.hostname !== 'localhost') return null;
    return u.href;
  } catch {
    return null;
  }
}

/** Guess the provider from a pasted URL, so "Any website" picks the right badge. */
export function detectProvider(url) {
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    return 'custom';
  }
  const map = [
    [/(^|\.)notion\.(so|site)$/, 'notion'],
    [/(^|\.)todoist\.com$/, 'todoist'],
    [/(^|\.)ticktick\.com$/, 'ticktick'],
    [/^tasks\.google\.com$/, 'gtasks'],
    [/^calendar\.google\.com$/, 'gcal'],
    [/(^|\.)to-do\.(office|live)\.com$/, 'mstodo'],
    [/(^|\.)linear\.app$/, 'linear'],
    [/(^|\.)asana\.com$/, 'asana'],
    [/(^|\.)trello\.com$/, 'trello'],
    [/(^|\.)clickup\.com$/, 'clickup'],
  ];
  for (const [re, id] of map) if (re.test(host)) return id;
  return 'custom';
}

/** Registrable-ish domain used to scope header stripping ("app.todoist.com" -> "todoist.com"). */
export function embedDomain(url) {
  try {
    const parts = new URL(url).hostname.split('.');
    return parts.length <= 2 ? parts.join('.') : parts.slice(-2).join('.');
  } catch {
    return null;
  }
}
