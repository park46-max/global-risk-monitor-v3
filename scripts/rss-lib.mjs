// Pure helper functions for the RSS pipeline (no network, no file access), so they can be tested on their own.

export class ParseError extends Error {}

// ---------- XML text helpers (no dependencies) ----------
export const decodeEntities = s => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (m, e) => {
  const k = e.toLowerCase();
  if (k[0] === '#') {
    const cp = k[1] === 'x' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
    try { return cp > 0 && cp <= 0x10FFFF ? String.fromCodePoint(cp) : m; } catch { return m; }
  }
  return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }[k];
});

// Text of an XML node: CDATA is taken literally, everything else has its entities decoded once. Markup is removed, spaces collapsed.
export function clean(inner) {
  if (inner == null) return '';
  let out = '', last = 0, m;
  const re = /<!\[CDATA\[([\s\S]*?)\]\]>/g;
  while ((m = re.exec(inner))) { out += decodeEntities(inner.slice(last, m.index)) + m[1]; last = re.lastIndex; }
  out += decodeEntities(inner.slice(last));
  return out.replace(/<\/?[a-zA-Z][^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function tag(block, name) {
  const m = new RegExp(`<${name}(?=[\\s/>])[^>]*?(?:/>|>([\\s\\S]*?)</${name}\\s*>)`, 'i').exec(block);
  return m && m[1] != null ? m[1] : null;
}
function atomLink(block) {
  for (const t of block.match(/<link\b[^>]*>/gi) || []) {
    const rel = /\brel\s*=\s*["']([^"']*)["']/i.exec(t), href = /\bhref\s*=\s*["']([^"']*)["']/i.exec(t);
    if (href && (!rel || rel[1] === 'alternate')) return decodeEntities(href[1]).trim();
  }
  return '';
}

// Reads RSS 2.0, RSS 1.0 / RDF (used by DW) and Atom. Returns the raw entries; nothing is validated here.
export function parseFeed(xml) {
  const text = String(xml || '').replace(/^﻿/, '');
  const head = text.slice(0, 2000).toLowerCase();
  if (/<html[\s>]|<!doctype html/.test(head)) throw new ParseError('received an HTML page, not a feed');
  if (!/<(rss|rdf:rdf|feed)[\s>]/i.test(text.slice(0, 5000))) throw new ParseError('not an RSS, RDF or Atom feed');
  const out = [];
  for (const m of text.matchAll(/<(item|entry)(?=[\s>])[\s\S]*?<\/\1\s*>/gi)) {
    const b = m[0];
    const link = clean(tag(b, 'link')) || atomLink(b);
    const dateRaw = clean(tag(b, 'pubDate') ?? tag(b, 'dc:date') ?? tag(b, 'published') ?? tag(b, 'updated'));
    const summary = clean(tag(b, 'description') ?? tag(b, 'summary')).slice(0, 2000);
    out.push({ title: clean(tag(b, 'title')), link, dateRaw, summary });
  }
  return out;
}

// ---------- verification helpers (used by verify mode only; nothing here is stored) ----------
// Which kind of feed is this, and what does it call itself? Reads only the first part of the document.
export function feedFormat(xml) {
  const text = String(xml || '').replace(/^\uFEFF/, ''), head = text.slice(0, 5000);
  let format = 'unknown';
  const rss = /<rss\b[^>]*>/i.exec(head);
  if (rss) { const v = /\bversion\s*=\s*["']([\d.]+)["']/i.exec(rss[0]); format = 'RSS ' + (v ? v[1] : '(version not stated)'); }
  else if (/<rdf:rdf[\s>]/i.test(head)) format = 'RSS 1.0 (RDF)';
  else if (/<feed[\s>]/i.test(head)) format = 'Atom';
  const t = /<(?:channel|feed)\b[^>]*>[\s\S]*?<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(text.slice(0, 20000));
  return { format, title: t ? clean(t[1]).slice(0, 120) : null };
}
// How complete are the entries? Counts only. A "usable link" is an http(s) address on one of the publisher's own hosts.
export function auditEntries(entries, { publisher, now = Date.now() }) {
  let headline = 0, link = 0, ownLink = 0, date = 0; const times = [];
  for (const e of entries) {
    if (e.title) headline++;
    const u = safeUrl(e.link); if (u) { link++; if (hostAllowed(u.hostname.toLowerCase(), publisher.hosts || [])) ownLink++; }
    const d = parseDate(e.dateRaw, now); if (d) { date++; times.push(Date.parse(d)); }
  }
  const valid = entries.filter(e => e.title && (() => { const u = safeUrl(e.link); return u && hostAllowed(u.hostname.toLowerCase(), publisher.hosts || []); })()).length;
  return { entries: entries.length, valid, headline, link, ownLink, date, newest: times.length ? new Date(Math.max(...times)).toISOString() : null, oldest: times.length ? new Date(Math.min(...times)).toISOString() : null };
}

// ---------- dates ----------
// Returns an ISO string, or null when the date is missing, unreadable, in the future (more than 1 h ahead) or before 2000.
// A date is never guessed: null is shown as "date not provided".
export function parseDate(raw, now = Date.now()) {
  if (!raw || typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!/\d{4}-\d{2}-\d{2}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}/.test(s)) return null;   // Date.parse accepts junk such as "5": require a real date shape
  const t = Date.parse(s);
  if (isNaN(t) || t > now + 3600e3 || t < Date.UTC(2000, 0, 1)) return null;
  return new Date(t).toISOString();
}

// ---------- links and duplicates ----------
const TRACK = /^(utm_|at_|ns_)/i, TRACK_NAMES = new Set(['fbclid', 'gclid', 'ocid', 'xtor', 'cmpid', 'mc_cid', 'mc_eid']);
export function safeUrl(u) {
  try { const x = new URL(String(u || '').trim()); return x.protocol === 'https:' || x.protocol === 'http:' ? x : null; } catch { return null; }
}
export const hostAllowed = (host, hosts) => hosts.some(h => host === h || host.endsWith('.' + h));
// Identity of a link for duplicate detection: host without "www.", path without a trailing slash, no fragment, no tracking parameters.
export function urlKey(u) {
  const x = safeUrl(u); if (!x) return null;
  const keep = [...x.searchParams].filter(([k]) => !TRACK.test(k) && !TRACK_NAMES.has(k.toLowerCase())).sort(([a], [b]) => a.localeCompare(b));
  const path = x.pathname.length > 1 ? x.pathname.replace(/\/+$/, '') : x.pathname;
  return x.hostname.toLowerCase().replace(/^www\./, '') + path.toLowerCase() + (keep.length ? '?' + keep.map(([k, v]) => k + '=' + v).join('&') : '');
}
// Same publisher + same headline (ignoring case and punctuation) counts as one article. Different publishers never merge.
export const titleKey = (publisherId, title) => publisherId + '|' + String(title).normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// ---------- country matching ----------
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function buildMatchers(terms) {
  const out = {};
  for (const [id, list] of Object.entries(terms)) {
    out[id] = list.map(x => {
      const t = typeof x === 'string' ? x : x.t, cs = typeof x === 'object' && x.cs, kind = typeof x === 'object' && x.kind ? x.kind : 'name';
      return { term: t, kind, re: new RegExp(`(?<![\\p{L}\\p{N}])${esc(t)}(?![\\p{L}\\p{N}])`, cs ? 'u' : 'iu') };
    });
  }
  return out;
}
// For each country: { level, terms } or nothing. Levels, strongest first:
//   'country'      the headline contains the country's name or demonym ("China", "Chinese")
//   'institution'  no name, but the headline contains its capital or a government/armed-forces body ("Beijing", "Kremlin")
//   'summary'      only the feed's summary contains a term (the summary is read here and never kept)
// Person names are not terms (see data/country-terms.mjs), so a leader's name alone never matches a country.
export function matchCountries(matchers, title, summary = '') {
  const res = {};
  for (const [id, ms] of Object.entries(matchers)) {
    const th = ms.filter(m => m.re.test(title)), names = th.filter(m => m.kind === 'name'), inst = th.filter(m => m.kind === 'institution');
    if (names.length) { res[id] = { level: 'country', terms: names.map(m => m.term) }; continue; }
    if (inst.length) { res[id] = { level: 'institution', terms: inst.map(m => m.term) }; continue; }
    const sm = ms.filter(m => m.re.test(summary)).map(m => m.term);
    if (sm.length) res[id] = { level: 'summary', terms: sm };
  }
  return res;
}

// ---------- turning raw entries into stored articles ----------
// Keeps only entries with a real title and an http(s) link on one of the publisher's own hosts and with at least one country match.
export function buildItems(entries, { publisher, feedId, now = Date.now(), matchers }) {
  const stat = { entries: entries.length, noTitle: 0, badLink: 0, offHost: 0, undated: 0, unmatched: 0 }, items = [];
  for (const e of entries) {
    if (!e.title) { stat.noTitle++; continue; }
    const u = safeUrl(e.link);
    if (!u) { stat.badLink++; continue; }
    if (!hostAllowed(u.hostname.toLowerCase(), publisher.hosts)) { stat.offHost++; continue; }
    const published = parseDate(e.dateRaw, now);
    if (!published) stat.undated++;
    const matches = matchCountries(matchers, e.title, e.summary);
    if (!Object.keys(matches).length) { stat.unmatched++; continue; }
    items.push({ title: e.title, url: u.href, publisher: publisher.name, publisherId: publisher.id, sourceType: publisher.sourceType || 'journalism', feedId, published, matches });
  }
  return { items, stat };
}

// Adds new articles to the ones already cached. Duplicates (same link key or same publisher+headline) are merged, the earliest firstSeenAt is kept.
export function mergeItems(prev, incoming, { now = Date.now(), retentionDays = 7, maxItems = 400 } = {}) {
  const nowIso = new Date(now).toISOString(), byUrl = new Map(), byTitle = new Map(), list = [];
  let dupes = 0, added = 0;
  const reg = it => { list.push(it); const k = urlKey(it.url); if (k) byUrl.set(k, it); byTitle.set(titleKey(it.publisherId, it.title), it); };
  prev.forEach(reg);
  for (const n of incoming) {
    const old = byUrl.get(urlKey(n.url)) || byTitle.get(titleKey(n.publisherId, n.title));
    if (old) {
      dupes++;
      old.lastSeenAt = nowIso; old.matches = n.matches; old.feedId = n.feedId;
      if (!old.published && n.published) old.published = n.published;
    } else { reg({ ...n, firstSeenAt: nowIso, lastSeenAt: nowIso }); added++; }
  }
  const cutoff = now - retentionDays * 864e5, when = it => Date.parse(it.published || it.firstSeenAt);
  const kept = list.filter(it => when(it) >= cutoff).sort((a, b) => when(b) - when(a)).slice(0, maxItems);
  return { items: kept, dupes, added, expired: list.length - kept.length };
}

// ---------- feed discovery ----------
// Finds candidate feed addresses on a web page: <link rel="alternate" type="application/rss+xml"> tags and links whose address looks like a feed.
// Only addresses on `hosts` are returned. Nothing is requested here.
export function extractFeedLinks(html, baseUrl, hosts) {
  const found = new Map();
  const add = (raw, why) => {
    let u; try { u = new URL(decodeEntities(String(raw).trim()), baseUrl); } catch { return; }
    if (!/^https?:$/.test(u.protocol) || !hostAllowed(u.hostname.toLowerCase(), hosts)) return;
    u.hash = ''; if (!found.has(u.href)) found.set(u.href, why);
  };
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const t = m[0];
    if (/type\s*=\s*["']application\/(rss|atom)\+xml["']/i.test(t)) { const h = /href\s*=\s*["']([^"']+)["']/i.exec(t); if (h) add(h[1], 'declared by the page as a feed'); }
  }
  for (const m of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi)) if (/(\brss\b|rss\.xml|\.xml($|\?)|\/feed\b|\/rss\/)/i.test(m[1])) add(m[1], 'link on the page whose address looks like a feed');
  return [...found].map(([url, why]) => ({ url, why }));
}
