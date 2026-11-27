// Publisher exclusion list: matching and scrubbing. No network, no dependencies.
// The list itself is data/publisher-exclusions.js (shared with the browser). A publisher NOT on the list is NOT approved or licensed.
// Everything here fails CLOSED: if the list cannot be read or is invalid, loadExclusions() throws and the calling script stops, keeping the old cache.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_FILE = path.join(ROOT, 'data', 'publisher-exclusions.js');
const norm = s => String(s == null ? '' : s).toLowerCase().trim();
const normHost = s => norm(s).replace(/^www\./, '').replace(/^\.+|\.+$/g, '');
const normName = s => norm(s).replace(/[^a-z0-9.]+/g, ' ').trim();
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function parseExclusions(text) {
  const i = text.indexOf('window.PUBLISHER_EXCLUSIONS'); if (i < 0) throw new Error('publisher exclusion list: window.PUBLISHER_EXCLUSIONS not found');
  const a = text.indexOf('{', i), b = text.lastIndexOf('}'); if (a < 0 || b < a) throw new Error('publisher exclusion list: no object found');
  let cfg; try { cfg = JSON.parse(text.slice(a, b + 1)); } catch (e) { throw new Error('publisher exclusion list is not valid JSON: ' + e.message); }
  if (!cfg || cfg.version !== 1 || !Array.isArray(cfg.publishers)) throw new Error('publisher exclusion list: unexpected format');
  const pubs = cfg.publishers.map(p => {
    if (!p || typeof p.id !== 'string' || !Array.isArray(p.domains) || !p.domains.length) throw new Error('publisher exclusion list: every entry needs an id and at least one domain');
    const domains = p.domains.map(normHost).filter(Boolean), names = (p.names || []).map(normName).filter(Boolean), suffixes = (p.titleSuffixes || []).map(norm).filter(Boolean);
    return { id: p.id, name: p.name || p.id, domains, names: new Set(names), rssIds: (p.rssIds || []).map(norm),
      suffixRe: suffixes.length ? new RegExp('[|\\-\\u2013\\u2014:\\u2022\\u00b7]\\s*(?:' + suffixes.map(esc).join('|') + ')\\s*$', 'i') : null };
  });
  return { version: cfg.version, updated: cfg.updated || null, publishers: pubs };
}
export function loadExclusions(file = process.env.PUBLISHER_EXCLUSIONS_FILE || DEFAULT_FILE) { return parseExclusions(fs.readFileSync(file, 'utf8')); }

// every host name that appears in a string (the address itself, or an address inside a query parameter), lower-case, without "www."
export function hostsIn(s) {
  const out = []; let t = String(s == null ? '' : s);
  for (let k = 0; k < 3; k++) { const re = /(?:^|[^a-z0-9])(?:https?:)?\/\/([a-z0-9][a-z0-9.-]*)/gi; let m; while ((m = re.exec(t))) out.push(normHost(m[1])); let d; try { d = decodeURIComponent(t); } catch { break; } if (d === t) break; t = d; }
  return out;
}
const hostMatches = (h, domains) => domains.some(d => h === d || h.endsWith('.' + d));
// A bare publisher/domain field such as "aljazeera.com" or "news.aljazeera.com" or "Al Jazeera"
const fieldMatches = (v, p) => { const h = normHost(v); return !!h && (hostMatches(h, p.domains) || p.names.has(normName(v))); };

// Which listed publisher (id) does this record belong to? null = none matched. Checks the address (including addresses inside parameters),
// the publisher, domain, publisherId and via fields, a headline credit such as "... | Al Jazeera", and every entry in "variants".
export function matchRecord(rec, cfg) {
  if (!rec || typeof rec !== 'object') return null;
  for (const p of cfg.publishers) {
    if (hostsIn(rec.url).some(h => hostMatches(h, p.domains))) return p.id;
    for (const f of ['publisher', 'domain', 'publisherId', 'source', 'outlet']) if (typeof rec[f] === 'string' && fieldMatches(rec[f], p)) return p.id;
    if (typeof rec.feedId === 'string' && p.rssIds.some(r => norm(rec.feedId) === r || norm(rec.feedId).startsWith(r + '-'))) return p.id;
    if (p.suffixRe) for (const f of ['title', 'headline']) if (typeof rec[f] === 'string' && p.suffixRe.test(rec[f].trim())) return p.id;
  }
  if (Array.isArray(rec.variants)) for (const v of rec.variants) { const m = matchRecord(v, cfg); if (m) return m; }
  return null;
}
export function matchPublisherEntry(pub, cfg) {   // an entry of data/rss-sources.mjs
  const ids = [pub.id, ...(pub.hosts || []), ...(pub.feedHosts || [])];
  return cfg.publishers.find(p => p.rssIds.includes(norm(pub.id)) || (pub.hosts || []).concat(pub.feedHosts || []).some(h => hostMatches(normHost(h), p.domains))) || null;
}

// ---- scrubbing (each returns a NEW object and a count; inputs are not modified) ----
export function scrubItems(items, cfg) {
  let removed = 0, variants = 0; const out = [];
  for (const it of Array.isArray(items) ? items : []) {
    const own = matchRecord({ ...it, variants: undefined }, cfg); if (own) { removed++; continue; }
    if (Array.isArray(it.variants)) { const keep = it.variants.filter(v => !matchRecord(v, cfg)); variants += it.variants.length - keep.length; out.push(keep.length === it.variants.length ? it : { ...it, variants: keep }); }
    else out.push(it);
  }
  return { items: out, removed, variants };
}
export function scrubNewsDoc(doc, cfg) {                 // news.json: { countries: { ID: { articles: [...] } } }
  if (!doc || !doc.countries) return { doc, removed: 0 };
  let removed = 0; const countries = {};
  for (const [k, c] of Object.entries(doc.countries)) {
    if (c && Array.isArray(c.articles)) { const r = scrubItems(c.articles, cfg); removed += r.removed; countries[k] = r.removed || r.variants ? { ...c, articles: r.items } : c; } else countries[k] = c;
  }
  return { doc: removed ? { ...doc, countries } : doc, removed };
}
export function scrubItemsDoc(doc, cfg) {                // news-gdelt.json / news-rss.json: { items: [...] }
  if (!doc || !Array.isArray(doc.items)) return { doc, removed: 0, variants: 0 };
  const r = scrubItems(doc.items, cfg); return { doc: r.removed || r.variants ? { ...doc, items: r.items } : doc, removed: r.removed, variants: r.variants };
}
const briefRecords = b => [...(b.sources || []), ...(b.developments || [])];
export const briefHasExcluded = (b, cfg) => !!b && briefRecords(b).some(r => matchRecord(r, cfg));
export const NEUTRAL_NOTE = 'This brief is unavailable until it is regenerated, because the publisher exclusion list changed and an earlier version named an excluded publisher. It returns after the next update.';
export function neutralizeBrief(b) {                      // keeps the dates, drops every headline, number and sentence that came from them
  return { generatedAt: b.generatedAt || null, window: b.window || null, notice: b.notice || null, status: 'unavailable', reportsFound: 0, overview: null, developments: [], why: null, sources: [], limitations: [NEUTRAL_NOTE], neutralized: true };
}
export function scrubBriefsDoc(doc, cfg) {                // briefs.json: { countries: { ID: brief } }
  if (!doc || !doc.countries) return { doc, neutralized: [] };
  const countries = {}, neutralized = [];
  for (const [k, b] of Object.entries(doc.countries)) { if (briefHasExcluded(b, cfg)) { countries[k] = neutralizeBrief(b); neutralized.push(k); } else countries[k] = b; }
  return { doc: neutralized.length ? { ...doc, countries } : doc, neutralized };
}
export function dropExcludedDevelopments(doc, cfg) {      // briefs as INPUT to the risk build: context only ever reads developments
  if (!doc || !doc.countries) return { doc, removed: 0 };
  let removed = 0; const countries = {};
  for (const [k, b] of Object.entries(doc.countries)) {
    if (b && Array.isArray(b.developments)) { const keep = b.developments.filter(d => !matchRecord(d, cfg)); removed += b.developments.length - keep.length; countries[k] = keep.length === b.developments.length ? b : { ...b, developments: keep }; } else countries[k] = b;
  }
  return { doc: removed ? { ...doc, countries } : doc, removed };
}
export function scrubRiskDoc(doc, cfg) {                  // risk.json: security.context and diplomatic.context
  if (!doc || !doc.countries) return { doc, removed: 0 };
  let removed = 0; const countries = {};
  for (const [k, c] of Object.entries(doc.countries)) {
    const nc = { ...c };
    for (const cat of ['security', 'economic', 'diplomatic']) if (c && c[cat] && Array.isArray(c[cat].context)) { const keep = c[cat].context.filter(x => !matchRecord(x, cfg)); removed += c[cat].context.length - keep.length; if (keep.length !== c[cat].context.length) nc[cat] = { ...c[cat], context: keep }; }
    countries[k] = nc;
  }
  return { doc: removed ? { ...doc, countries } : doc, removed };
}
// Last line of defence: walk a whole output document and list anything that still belongs to a listed publisher.
export function findExcluded(node, cfg, where = '$', out = []) {
  if (Array.isArray(node)) node.forEach((v, i) => findExcluded(v, cfg, where + '[' + i + ']', out));
  else if (node && typeof node === 'object') { const m = matchRecord({ ...node, variants: undefined }, cfg); if (m) out.push({ where, publisher: m }); for (const [k, v] of Object.entries(node)) findExcluded(v, cfg, where + '.' + k, out); }
  else if (typeof node === 'string' && /\/\//.test(node)) { const h = hostsIn(node); for (const p of cfg.publishers) if (h.some(x => hostMatches(x, p.domains))) out.push({ where, publisher: p.id }); }
  return out;
}
export function assertClean(doc, cfg, label) { const f = findExcluded(doc, cfg); if (f.length) throw new Error(`${label}: ${f.length} item(s) from an excluded publisher (${[...new Set(f.map(x => x.publisher))].join(', ')}) were about to be written; refusing to write. First: ${f[0].where}`); }
