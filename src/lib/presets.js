// One-click block lists. A preset is "on" when all of its sites are on the
// list; turning it off removes every one of them, so off really means off.

export const PRESETS = [
  {
    id: 'social',
    name: 'Social media',
    blurb: 'Feeds, likes and notifications',
    icon: 'social',
    sites: [
      'facebook.com',
      'instagram.com',
      'x.com',
      'twitter.com',
      'threads.net',
      'tiktok.com',
      'snapchat.com',
      'bsky.app',
      'linkedin.com/feed',
    ],
  },
  {
    id: 'doomscroll',
    name: 'Doomscrolling',
    blurb: 'Infinite feeds built to keep you there',
    icon: 'scroll',
    sites: [
      'reddit.com',
      'youtube.com/shorts',
      'instagram.com/reels',
      'tiktok.com',
      'x.com',
      'twitter.com',
      '9gag.com',
      'imgur.com',
      'tumblr.com',
      'pinterest.com',
      'news.ycombinator.com',
    ],
  },
  {
    id: 'video',
    name: 'Video & streaming',
    blurb: 'Just one more episode',
    icon: 'play',
    sites: [
      'youtube.com',
      'netflix.com',
      'twitch.tv',
      'primevideo.com',
      'disneyplus.com',
      'hotstar.com',
      'hulu.com',
      'max.com',
      'kick.com',
    ],
  },
  {
    id: 'news',
    name: 'News',
    blurb: 'Headlines can wait an hour',
    icon: 'news',
    sites: [
      'news.google.com',
      'cnn.com',
      'foxnews.com',
      'bbc.com',
      'nytimes.com',
      'theguardian.com',
      'washingtonpost.com',
      'ndtv.com',
      'timesofindia.indiatimes.com',
      'buzzfeed.com',
    ],
  },
  {
    id: 'shopping',
    name: 'Shopping',
    blurb: 'Carts, deals and wishlists',
    icon: 'cart',
    sites: [
      'amazon.com',
      'amazon.in',
      'ebay.com',
      'etsy.com',
      'aliexpress.com',
      'temu.com',
      'shein.com',
      'flipkart.com',
      'myntra.com',
      'walmart.com',
    ],
  },
  {
    id: 'games',
    name: 'Games & sports',
    blurb: 'Scores, matches and quick games',
    icon: 'game',
    sites: [
      'chess.com',
      'lichess.org',
      'store.steampowered.com',
      'roblox.com',
      'poki.com',
      'crazygames.com',
      'espn.com',
      'cricbuzz.com',
      'bleacherreport.com',
    ],
  },
];

export function getPreset(id) {
  return PRESETS.find((p) => p.id === id) || null;
}

/** 'on' when every site from the preset is on the list, 'partial', or 'off'. */
export function presetState(preset, sites) {
  const have = new Set(sites.map((s) => s.pattern));
  const n = preset.sites.filter((p) => have.has(p)).length;
  if (n === 0) return 'off';
  return n === preset.sites.length ? 'on' : 'partial';
}

/** Returns a new site list with the preset applied or removed. */
export function togglePreset(sites, presetId, enable, now = Date.now()) {
  const preset = getPreset(presetId);
  if (!preset) return sites;
  if (enable) {
    const have = new Set(sites.map((s) => s.pattern));
    const added = preset.sites
      .filter((p) => !have.has(p))
      .map((pattern) => ({ pattern, preset: presetId, addedAt: now }));
    return [...sites, ...added];
  }
  const drop = new Set(preset.sites);
  return sites.filter((s) => !drop.has(s.pattern));
}
