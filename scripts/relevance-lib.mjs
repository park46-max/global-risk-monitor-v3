// Relevance scoring, routine-notice filtering and duplicate grouping. Pure functions, no network, no AI. Rules live in data/relevance-rules.mjs.
// Everything here works on the headline text only, so every decision can be reproduced by hand (see scripts/explain-headline.mjs).
import { matchCountries } from './rss-lib.mjs';

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const compileTerms = list => list.map(x => {
  const t = typeof x === 'string' ? x : x.t, cs = typeof x === 'object' && x.cs;
  return { term: t, re: new RegExp(`(?<![\\p{L}\\p{N}])${esc(t)}(?![\\p{L}\\p{N}])`, cs ? 'u' : 'iu') };
});
const withG = re => new RegExp(re.source, re.flags + 'g');
export function compileRules(R) {
  const topics = Object.entries(R.topics).map(([id, t]) => ({ id, label: t.label, weight: t.weight, terms: compileTerms(t.terms) }));
  // Longest words are tried first and blanked out once found, so a short word inside a longer one is not counted twice
  // (for example "war" inside "trade war", or "military" inside "military drills").
  const all = [];
  for (const t of topics) for (const x of t.terms) all.push({ topic: t, term: x.term, re: withG(x.re) });
  all.sort((a, b) => b.term.length - a.term.length);
  return { topics, all, strong: compileTerms(R.noise.strong), weak: compileTerms(R.noise.weak), dedupe: R.dedupe, tiers: R.tiers };
}

// Score one headline. nCountries = how many monitored countries the headline names (name or institution level).
// Returns { score, tier, topics:[{id,label,terms}], filtered: null | { kind, terms } }.
export function classify(title, C, nCountries = 0) {
  const found = new Map(); let work = title;
  for (const x of C.all) {
    x.re.lastIndex = 0;
    if (!x.re.test(work)) continue;
    x.re.lastIndex = 0; work = work.replace(x.re, m => ' '.repeat(m.length));
    if (!found.has(x.topic.id)) found.set(x.topic.id, { id: x.topic.id, label: x.topic.label, weight: x.topic.weight, terms: [] });
    found.get(x.topic.id).terms.push(x.term);
  }
  const topics = C.topics.filter(t => found.has(t.id)).map(t => found.get(t.id));
  let score = topics.reduce((a, t) => a + t.weight, 0);
  if (topics.length >= 2) score += 1;
  if (topics.length && nCountries >= 2) score += 1;   // two monitored countries in one geopolitical headline (for example US-China)
  const maxW = topics.reduce((a, t) => Math.max(a, t.weight), 0);
  const strong = C.strong.filter(x => x.re.test(title)).map(x => x.term), weak = C.weak.filter(x => x.re.test(title)).map(x => x.term);
  let filtered = null;
  if (strong.length && maxW < 3) filtered = { kind: 'financial-product', terms: strong.slice(0, 4) };
  else if (weak.length && !topics.length) filtered = { kind: 'financial-product', terms: weak.slice(0, 4) };
  const tier = score >= C.tiers.high ? 'high' : score >= C.tiers.medium ? 'medium' : 'other';
  return { score, tier, topics: topics.map(({ id, label, terms }) => ({ id, label, terms: terms.slice(0, 4) })), filtered };
}

// ---------- duplicates ----------
const STOP = new Set('the a an of to in on for and as at by with from after over amid is are was were says say said new will its it this that has have be been into than about against'.split(' '));
// Removes a trailing " - Publisher" / " | Publisher" (a short last segment) so the same story from two sites compares equal.
export function normTitle(t) {
  const s = String(t).trim(), m = /^(.{12,}?)\s+[-–—|]\s+([^-–—|]{2,40})$/.exec(s);
  return m && m[2].trim().split(/\s+/).length <= 4 ? m[1] : s;
}
export const tokens = t => new Set(normTitle(t).normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').split(' ').filter(w => w.length >= 3 && !STOP.has(w)));
export function similarity(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0; for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}
const when = i => Date.parse(i.published || i.seenByGdelt || i.firstSeenAt);

// Groups near-identical headlines about the same country within the time window. The representative is the highest-scoring (then earliest) article;
// the others are kept as `variants` (publisher + link of each), so no source is hidden. Deterministic: the same input gives the same output.
export function clusterItems(items, D) {
  const order = [...items].sort((a, b) => ((b.relevance && b.relevance.score) || 0) - ((a.relevance && a.relevance.score) || 0) || (when(a) || Infinity) - (when(b) || Infinity) || String(a.url).localeCompare(String(b.url)));
  const reps = [], tk = new Map(), winMs = D.windowHours * 36e5;
  const variantOf = it => ({ publisher: it.publisher, publisherId: it.publisherId, url: it.url, published: it.published || null, ...(it.seenByGdelt ? { seenByGdelt: it.seenByGdelt } : {}) });
  for (const it of order) {
    const t = tokens(it.title); tk.set(it, t);
    const rep = reps.find(r => {
      const rt = tk.get(r), shared = Object.keys(it.matches || {}).some(k => r.matches && r.matches[k]);
      if (!shared) return false;
      const a = when(it), b = when(r); if (!isNaN(a) && !isNaN(b) && Math.abs(a - b) > winMs) return false;
      const same = normTitle(it.title).toLowerCase() === normTitle(r.title).toLowerCase();
      return same || (Math.min(t.size, rt.size) >= D.minWords && similarity(t, rt) >= D.similarity);
    });
    if (!rep) { reps.push(it); continue; }
    const seen = new Set([rep.url, ...(rep.variants || []).map(v => v.url)]), add = [variantOf(it), ...(it.variants || [])].filter(v => v.url && !seen.has(v.url) && (seen.add(v.url), true));
    rep.variants = [...(rep.variants || []), ...add].slice(0, D.maxVariants); rep.variantsTotal = (rep.variantsTotal || (rep.variants.length - add.length)) + add.length;
  }
  for (const r of reps) if (r.variants && !r.variants.length) { delete r.variants; delete r.variantsTotal; }
  return reps;
}

// Re-evaluates EVERY cached article with the current rules (country match, topics, routine-notice filter, duplicate groups), so a rule change
// also fixes articles cached earlier. A summary-level match (RSS only; the summary is not stored) is kept only if its terms are still valid terms.
export function refreshItems(items, { matchers, compiled }) {
  const valid = (id, term) => (matchers[id] || []).some(m => m.term === term);
  const kept = [], filtered = []; let dropped = 0;
  for (const it of items) {
    const m = matchCountries(matchers, it.title, '');
    for (const [id, old] of Object.entries(it.matches || {})) if (!m[id] && old.level === 'summary' && old.terms.length && old.terms.every(t => valid(id, t))) m[id] = old;
    if (!Object.keys(m).length) { dropped++; continue; }
    const named = Object.values(m).filter(x => x.level !== 'summary').length, c = classify(it.title, compiled, named);
    it.matches = m; it.relevance = { score: c.score, tier: c.tier, topics: c.topics };
    if (c.filtered) { it.filtered = c.filtered; delete it.variants; delete it.variantsTotal; filtered.push(it); } else { delete it.filtered; kept.push(it); }
  }
  const reps = clusterItems(kept, compiled.dedupe);
  return { items: [...reps, ...filtered], stats: { droppedNoMatch: dropped, filteredNotices: filtered.length, groupedDuplicates: kept.length - reps.length } };
}

// Keeps, for each country, its best articles (score first, then newest), plus a short audit list of filtered notices.
export function capItems(items, ids, perCountry, filteredMax) {
  const t = i => when(i) || 0, keep = new Set();
  for (const id of ids) items.filter(i => !i.filtered && i.matches && i.matches[id]).sort((a, b) => ((b.relevance && b.relevance.score) || 0) - ((a.relevance && a.relevance.score) || 0) || t(b) - t(a)).slice(0, perCountry).forEach(i => keep.add(i));
  items.filter(i => i.filtered).sort((a, b) => t(b) - t(a)).slice(0, filteredMax).forEach(i => keep.add(i));
  return items.filter(i => keep.has(i));
}

// Term lists for the cache file, so the page can show exactly what is matched.
export const termSummary = terms => Object.fromEntries(Object.entries(terms).map(([id, list]) => [id, {
  names: list.filter(x => typeof x === 'string' || !x.kind || x.kind === 'name').map(x => typeof x === 'string' ? x : x.t),
  institutions: list.filter(x => typeof x === 'object' && x.kind === 'institution').map(x => x.t) }]));
