// Official brand marks bundled with the extension (from simple-icons, CC0),
// keyed by the domains they belong to. Anything not listed here falls back to
// the site's real favicon, fetched once and cached (see favicons.js).

export const BRANDS = {
  '9gag': { title: '9GAG', hex: '000000', domains: ['9gag.com'] },
  aliexpress: { title: 'AliExpress', hex: 'FF4747', domains: ['aliexpress.com', 'aliexpress.us'] },
  asana: { title: 'Asana', hex: 'F06A6A', domains: ['asana.com'] },
  bluesky: { title: 'Bluesky', hex: '1185FE', domains: ['bsky.app', 'bsky.social'] },
  buzzfeed: { title: 'BuzzFeed', hex: 'EE3322', domains: ['buzzfeed.com'] },
  chessdotcom: { title: 'Chess.com', hex: '81B64C', domains: ['chess.com'] },
  clickup: { title: 'ClickUp', hex: '7B68EE', domains: ['clickup.com'] },
  cnn: { title: 'CNN', hex: 'CC0000', domains: ['cnn.com'] },
  crunchyroll: { title: 'Crunchyroll', hex: 'FF5E00', domains: ['crunchyroll.com'] },
  discord: { title: 'Discord', hex: '5865F2', domains: ['discord.com', 'discord.gg'] },
  ebay: { title: 'eBay', hex: 'E53238', domains: ['ebay.com', 'ebay.co.uk', 'ebay.de', 'ebay.in'] },
  etsy: { title: 'Etsy', hex: 'F16521', domains: ['etsy.com'] },
  facebook: { title: 'Facebook', hex: '0866FF', domains: ['facebook.com', 'fb.com', 'messenger.com'] },
  googlecalendar: { title: 'Google Calendar', hex: '4285F4', domains: ['calendar.google.com'] },
  googlenews: { title: 'Google News', hex: '174EA6', domains: ['news.google.com'] },
  googletasks: { title: 'Google Tasks', hex: '2684FC', domains: ['tasks.google.com'] },
  imgur: { title: 'Imgur', hex: '1BB76E', domains: ['imgur.com'] },
  instagram: { title: 'Instagram', hex: 'FF0069', domains: ['instagram.com'] },
  kick: { title: 'Kick', hex: '53FC19', domains: ['kick.com'] },
  lichess: { title: 'Lichess', hex: '000000', domains: ['lichess.org'] },
  linear: { title: 'Linear', hex: '5E6AD2', domains: ['linear.app'] },
  max: { title: 'Max', hex: '525252', domains: ['max.com', 'hbomax.com'] },
  medium: { title: 'Medium', hex: '000000', domains: ['medium.com'] },
  netflix: { title: 'Netflix', hex: 'E50914', domains: ['netflix.com'] },
  newyorktimes: { title: 'New York Times', hex: '000000', domains: ['nytimes.com'] },
  notion: { title: 'Notion', hex: '000000', domains: ['notion.so', 'notion.site', 'notion.com'] },
  pinterest: { title: 'Pinterest', hex: 'BD081C', domains: ['pinterest.com', 'pinterest.co.uk', 'pinterest.ca', 'in.pinterest.com'] },
  producthunt: { title: 'Product Hunt', hex: 'DA552F', domains: ['producthunt.com'] },
  quora: { title: 'Quora', hex: 'B92B27', domains: ['quora.com'] },
  reddit: { title: 'Reddit', hex: 'FF4500', domains: ['reddit.com', 'redd.it'] },
  roblox: { title: 'Roblox', hex: '000000', domains: ['roblox.com'] },
  snapchat: { title: 'Snapchat', hex: 'FFFC00', domains: ['snapchat.com'] },
  spotify: { title: 'Spotify', hex: '1ED760', domains: ['spotify.com'] },
  steam: { title: 'Steam', hex: '000000', domains: ['steampowered.com', 'steamcommunity.com'] },
  substack: { title: 'Substack', hex: 'FF6719', domains: ['substack.com'] },
  telegram: { title: 'Telegram', hex: '26A5E4', domains: ['telegram.org', 't.me'] },
  theguardian: { title: 'The Guardian', hex: '052962', domains: ['theguardian.com'] },
  threads: { title: 'Threads', hex: '000000', domains: ['threads.net', 'threads.com'] },
  ticktick: { title: 'TickTick', hex: '4772FA', domains: ['ticktick.com', 'dida365.com'] },
  tiktok: { title: 'TikTok', hex: '000000', domains: ['tiktok.com'] },
  todoist: { title: 'Todoist', hex: 'E44332', domains: ['todoist.com'] },
  trello: { title: 'Trello', hex: '0052CC', domains: ['trello.com'] },
  tumblr: { title: 'Tumblr', hex: '36465D', domains: ['tumblr.com'] },
  twitch: { title: 'Twitch', hex: '9146FF', domains: ['twitch.tv'] },
  vimeo: { title: 'Vimeo', hex: '1AB7EA', domains: ['vimeo.com'] },
  whatsapp: { title: 'WhatsApp', hex: '25D366', domains: ['whatsapp.com', 'web.whatsapp.com'] },
  x: { title: 'X', hex: '000000', domains: ['x.com', 'twitter.com'] },
  ycombinator: { title: 'Hacker News', hex: 'F0652F', domains: ['news.ycombinator.com', 'ycombinator.com'] },
  youtube: { title: 'YouTube', hex: 'FF0000', domains: ['youtube.com', 'youtu.be', 'youtube-nocookie.com'] },
};

// domain -> slug, most specific (longest) domain first so news.google.com
// isn't swallowed by a hypothetical google.com entry.
const INDEX = Object.entries(BRANDS)
  .flatMap(([slug, b]) => b.domains.map((d) => [d, slug]))
  .sort((a, b) => b[0].length - a[0].length);

/** Bundled brand for a host or pattern ("m.youtube.com", "reddit.com/r/all"), or null. */
export function brandFor(hostOrPattern) {
  const host = String(hostOrPattern || '')
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .split(/[/:?#]/)[0]
    .replace(/^www\d?\./, '');
  if (!host) return null;
  for (const [d, slug] of INDEX) {
    if (host === d || host.endsWith('.' + d)) return { slug, ...BRANDS[slug] };
  }
  return null;
}

/** Relative luminance of a hex colour, 0 (black) to 1 (white). */
export function luminance(hex) {
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * How to draw a brand mark on a neutral tile:
 *  - near-black marks (X, Notion, TikTok) use the page's text colour so they
 *    flip correctly in dark themes;
 *  - very light marks (Snapchat yellow) get a filled tile so they stay visible;
 *  - everything else is the brand colour on a neutral tile.
 */
export function brandStyle(hex) {
  const l = luminance(hex);
  if (l < 0.09) return { mode: 'ink' };
  if (l > 0.55) return { mode: 'filled', bg: '#' + hex, fg: '#111' };
  return { mode: 'color', fg: '#' + hex };
}
