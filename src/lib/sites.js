// Pure list operations on the blocked-sites array.

export function addPatterns(sites, patterns, now = Date.now()) {
  const have = new Set(sites.map((s) => s.pattern));
  const added = [];
  for (const p of patterns) {
    if (have.has(p)) continue;
    have.add(p);
    added.push({ pattern: p, addedAt: now });
  }
  return { sites: [...added, ...sites], added: added.map((s) => s.pattern) };
}

export function removePatterns(sites, patterns) {
  const drop = new Set(patterns);
  return sites.filter((s) => !drop.has(s.pattern));
}
