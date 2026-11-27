// robots.txt reader (the useful subset of RFC 9309). Pure functions, no network. Used by scripts/fetch-rss.mjs before it requests a feed.
//
// What is supported: User-agent groups, Allow / Disallow with the longest matching rule winning (Allow wins a tie), "*" and a closing "$" in
// paths, and Crawl-delay (not part of the standard but honoured when present). A missing group for our name falls back to the "*" group.
// What is not: percent-encoding normalisation and Sitemap lines (ignored). When in doubt the caller treats the file as restrictive.

export function parseRobots(text) {
  const groups = []; let cur = null, lastWasAgent = false;
  for (const raw of String(text || '').replace(/^﻿/, '').split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim(); if (!line) continue;
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line); if (!m) continue;
    const key = m[1].toLowerCase(), val = m[2].trim();
    if (key === 'user-agent') {
      if (!cur || !lastWasAgent) { cur = { agents: [], rules: [], delay: null }; groups.push(cur); }
      cur.agents.push(val.toLowerCase()); lastWasAgent = true; continue;
    }
    lastWasAgent = false; if (!cur) continue;
    if (key === 'allow' || key === 'disallow') cur.rules.push({ allow: key === 'allow', path: val });
    else if (key === 'crawl-delay') { const d = Number(val); if (Number.isFinite(d) && d >= 0) cur.delay = d; }
  }
  return groups;
}

const toRegex = p => new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));

// Is `pathAndQuery` (for example "/rss-feed/press-releases/feed/") allowed for the crawler called `token`?
// Returns { allowed, rule, crawlDelay }. rule = the winning line as written ("Disallow: /x") or null when no rule applied.
export function robotsDecision(groups, token, pathAndQuery) {
  const t = String(token).toLowerCase();
  let pick = groups.filter(g => g.agents.some(a => a !== '*' && a && t.startsWith(a)));
  if (!pick.length) pick = groups.filter(g => g.agents.includes('*'));
  const rules = pick.flatMap(g => g.rules).filter(r => r.path !== '');   // "Disallow:" with nothing after it means "allow everything"
  const delays = pick.map(g => g.delay).filter(d => d != null);
  let best = null;
  for (const r of rules) {
    if (!toRegex(r.path).test(pathAndQuery)) continue;
    if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow && !best.allow)) best = r;
  }
  return { allowed: best ? best.allow : true, rule: best ? (best.allow ? 'Allow: ' : 'Disallow: ') + best.path : null, crawlDelay: delays.length ? Math.max(...delays) : null };
}
