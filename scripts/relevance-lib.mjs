// Relevance scoring, routine-notice filtering and duplicate grouping. Pure functions, no network, no AI. Rules live in data/relevance-rules.mjs.
// Everything here works on the headline text only, so every decision can be reproduced by hand (see scripts/explain-headline.mjs).
import { matchCountries } from './rss-lib.mjs';
import { SOURCE_POLICY } from '../data/source-quality.mjs';

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
  // Rules added later are optional, so older custom rule files (used by some tests) keep working: a missing section simply switches that rule off.
  const role = R.role || {}, off = R.offTopic || {}, sp = R.sourcePolicy || SOURCE_POLICY;
  return { topics, all, strong: compileTerms(R.noise.strong), weak: compileTerms(R.noise.weak), dedupe: R.dedupe, tiers: R.tiers,
    foreign: compileTerms(role.foreign || []), earlyWords: role.earlyWords ?? 3, descriptors: role.descriptors || [],
    offTopic: Object.entries(off).flatMap(([group, list]) => compileTerms(list).map(x => ({ ...x, group }))), source: compilePolicy(sp) };
}

// ---------- source labels and headline style (policy: data/source-quality.mjs) ----------
function compilePolicy(sp) {
  const host = h => String(h).toLowerCase().replace(/^www\./, '');
  return { policy: sp, established: (sp.established || []).map(host), state: (sp.state || []).map(host),
    phrases: compileTerms((sp.sensational && sp.sensational.phrases) || []) };
}
const DEFAULT_SOURCE = compilePolicy(SOURCE_POLICY);
const hostMatch = (h, list) => list.some(d => h === d || h.endsWith('.' + d));
// Label of the OUTLET from the link's domain: 'established' | 'state' | 'unassessed'. 'unassessed' is the default and is not a judgement of reliability.
export function classifySource(url, S = DEFAULT_SOURCE) {
  let h; try { h = new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return { tier: 'unassessed' }; }
  return { tier: hostMatch(h, S.established) ? 'established' : hostMatch(h, S.state) ? 'state' : 'unassessed' };
}
// Wording-style flag for one headline (not about the outlet). Returns null or { terms:[...] }.
export function styleFlag(title, S = DEFAULT_SOURCE) {
  const cfg = S.policy.sensational || {}, terms = S.phrases.filter(x => x.re.test(title)).map(x => x.term);
  if (cfg.exclamation && title.includes('!')) terms.push('!');
  const letters = title.replace(/[^\p{L}]/gu, '');
  if (cfg.capsShare && letters.length >= (cfg.capsMinLetters || 15) && letters.replace(/[^\p{Lu}]/gu, '').length / letters.length >= cfg.capsShare) terms.push('mostly capital letters');
  return terms.length ? { terms: terms.slice(0, 4) } : null;
}
export const policySummary = (S = DEFAULT_SOURCE) => ({ version: S.policy.version, labels: S.policy.labels });

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
  const style = C.source ? styleFlag(title, C.source) : null;
  if (style) score = Math.max(0, score - ((C.source.policy.sensational || {}).scorePenalty || 1));   // sensational wording: lower score, shown on the page
  const maxW = topics.reduce((a, t) => Math.max(a, t.weight), 0);
  const strong = C.strong.filter(x => x.re.test(title)).map(x => x.term), weak = C.weak.filter(x => x.re.test(title)).map(x => x.term);
  let filtered = null;
  if (strong.length && maxW < 3) filtered = { kind: 'financial-product', terms: strong.slice(0, 4) };
  else if (weak.length && !topics.length) filtered = { kind: 'financial-product', terms: weak.slice(0, 4) };
  if (!filtered && maxW < 3 && C.offTopic && C.offTopic.length) {   // sport, entertainment or local-crime wording and no security/diplomacy/sanctions signal
    const hit = C.offTopic.filter(x => x.re.test(title));
    if (hit.length) filtered = { kind: 'off-topic', group: hit[0].group, terms: hit.map(x => x.term).slice(0, 4) };
  }
  const tier = score >= C.tiers.high ? 'high' : score >= C.tiers.medium ? 'medium' : 'other';
  return { score, tier, maxWeight: maxW, style, topics: topics.map(({ id, label, terms }) => ({ id, label, terms: terms.slice(0, 4) })), filtered };
}


// ---------- country role: primary, shared or incidental (rule 4 in data/relevance-rules.mjs) ----------
const firstIndex = (re, text) => { const m = re.exec(text); return m ? m.index : -1; };
// id = monitored country; named = ids of all monitored countries named in the headline (name or institution level); maxW = heaviest topic weight.
export function roleFor(title, id, matcherList, named, maxW, C) {
  if (named.length >= 2) return 'shared';                                  // bilateral or multilateral: never treated as incidental
  const mine = (matcherList || []).filter(m => m.re.test(title));
  const idx = Math.min(...mine.map(m => firstIndex(m.re, title)).filter(i => i >= 0), Infinity);
  if (!isFinite(idx)) return 'primary';
  if (maxW < 3 && C.descriptors && C.descriptors.length) {                  // "US-based", "China-born": the name only describes a company or person
    const d = new RegExp('(?<![\\p{L}\\p{N}])(?:' + mine.map(m => esc(m.term)).join('|') + ')[\\-\u2010-\u2012](?:' + C.descriptors.join('|') + ')(?![\\p{L}\\p{N}])', 'iu');
    if (d.test(title)) return 'incidental';
  }
  const fIdx = Math.min(...(C.foreign || []).map(x => firstIndex(x.re, title)).filter(i => i >= 0), Infinity);
  if (!isFinite(fIdx) || fIdx >= idx) return 'primary';                    // no other country named before this one
  if (maxW >= 3) return 'shared';                                          // another country first, but a security/diplomacy/sanctions story between countries
  const pos = title.slice(0, idx).split(/\s+/).filter(Boolean).length;
  return pos >= C.earlyWords ? 'incidental' : 'primary';
}

// ---------- duplicates ----------
const STOP = new Set('the a an of to in on for and as at by with from after over amid is are was were says say said new will its it this that has have be been into than about against'.split(' '));
// Removes a trailing " - Publisher" / " | Publisher" (a short last segment) so the same story from two sites compares equal.
export function normTitle(t) {
  const s = String(t).trim(), m = /^(.{12,}?)\s+[-–—|]\s+([^-–—|]{2,40})$/.exec(s);
  return m && m[2].trim().split(/\s+/).length <= 4 ? m[1] : s;
}
// Demonyms are mapped to the country word and a plural "s" is dropped, so "Russian strikes" and "Russia strike" compare equal.
const CANON = { russian: 'russia', russians: 'russia', chinese: 'china', ukrainian: 'ukraine', ukrainians: 'ukraine', taiwanese: 'taiwan', kiev: 'kyiv' };
const stem = w => CANON[w] || (w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);
export const tokens = t => new Set(normTitle(t).normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').split(' ').filter(w => w.length >= 3 && !STOP.has(w)).map(stem));
// Numbers written in the headline ("5", "1,200"). Two headlines with different numbers are different reports (for example different casualty counts).
const numbers = t => new Set((String(t).match(/\d[\d,.]*/g) || []).map(x => x.replace(/[,.]+$/, '').replace(/,/g, '')));
const sameSet = (a, b) => a.size === b.size && [...a].every(x => b.has(x));
// Named monitored countries of an item. Two headlines that each name a country the other lacks (China vs Russia) are never merged.
const namedIds = it => Object.entries(it.matches || {}).filter(([, m]) => m.level !== 'summary').map(([k]) => k);
const disjointNames = (a, b) => { const A = namedIds(a), B = namedIds(b); return A.some(x => !B.includes(x)) && B.some(x => !A.includes(x)); };
const tierRank = it => ((it.source && it.source.tier) || classifySource(it.url).tier) === 'established' ? 0 : 1;
export function similarity(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0; for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}
const when = i => Date.parse(i.published || i.seenByGdelt || i.firstSeenAt);

// Groups near-identical headlines about the same country within the time window. The representative is the highest-scoring (then earliest) article;
// the others are kept as `variants` (publisher + link of each), so no source is hidden. Deterministic: the same input gives the same output.
export function clusterItems(items, D) {
  const order = [...items].sort((a, b) => ((b.relevance && b.relevance.score) || 0) - ((a.relevance && a.relevance.score) || 0) || tierRank(a) - tierRank(b) || (when(a) || Infinity) - (when(b) || Infinity) || String(a.url).localeCompare(String(b.url)));
  const reps = [], tk = new Map(), winMs = D.windowHours * 36e5;
  const variantOf = it => ({ publisher: it.publisher, publisherId: it.publisherId, tier: ((it.source && it.source.tier) || classifySource(it.url).tier), url: it.url, published: it.published || null, ...(it.seenByGdelt ? { seenByGdelt: it.seenByGdelt } : {}) });
  for (const it of order) {
    const t = tokens(it.title); tk.set(it, t);
    const rep = reps.find(r => {
      const rt = tk.get(r), shared = Object.keys(it.matches || {}).some(k => r.matches && r.matches[k]);
      if (!shared) return false;
      const a = when(it), b = when(r); if (!isNaN(a) && !isNaN(b) && Math.abs(a - b) > winMs) return false;
      if (disjointNames(it, r)) return false;
      const na = numbers(normTitle(it.title)), nb = numbers(normTitle(r.title)); if (na.size && nb.size && !sameSet(na, nb)) return false;
      const same = normTitle(it.title).toLowerCase() === normTitle(r.title).toLowerCase();
      if (same) return true;
      const small = Math.min(t.size, rt.size); if (small < D.minWords) return false;
      let inter = 0; for (const x of t) if (rt.has(x)) inter++;
      return similarity(t, rt) >= D.similarity || (D.containment && small >= (D.containmentMinWords || 5) && inter / small >= D.containment);   // containment: one headline is the other plus a few words
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
    const namedIdsNow = Object.entries(m).filter(([, x]) => x.level !== 'summary').map(([k]) => k), c = classify(it.title, compiled, namedIdsNow.length);
    for (const k of namedIdsNow) m[k].role = roleFor(it.title, k, matchers[k], namedIdsNow, c.maxWeight, compiled);   // primary | shared | incidental
    it.matches = m; it.relevance = { score: c.score, tier: c.tier, topics: c.topics, ...(c.style ? { style: c.style } : {}) };
    it.source = classifySource(it.url, compiled.source);
    if (c.filtered) { it.filtered = c.filtered; delete it.variants; delete it.variantsTotal; filtered.push(it); } else { delete it.filtered; kept.push(it); }
  }
  const reps = clusterItems(kept, compiled.dedupe);
  const roles = kept.flatMap(i => Object.values(i.matches)).filter(x => x.role);
  return { items: [...reps, ...filtered], stats: { droppedNoMatch: dropped, filteredNotices: filtered.length, filteredOffTopic: filtered.filter(i => i.filtered.kind === 'off-topic').length,
    groupedDuplicates: kept.length - reps.length, incidentalMentions: roles.filter(x => x.role === 'incidental').length, sensationalStyle: kept.filter(i => i.relevance.style).length } };
}

// Keeps, for each country, its best articles (score first, then newest), plus a short audit list of filtered notices.
export function capItems(items, ids, perCountry, filteredMax) {
  const t = i => when(i) || 0, keep = new Set();
  const inc = (i, id) => i.matches[id].role === 'incidental' ? 1 : 0;   // incidental mentions are kept last, so they never crowd out primary stories
  for (const id of ids) items.filter(i => !i.filtered && i.matches && i.matches[id]).sort((a, b) => inc(a, id) - inc(b, id) || ((b.relevance && b.relevance.score) || 0) - ((a.relevance && a.relevance.score) || 0) || t(b) - t(a)).slice(0, perCountry).forEach(i => keep.add(i));
  items.filter(i => i.filtered).sort((a, b) => t(b) - t(a)).slice(0, filteredMax).forEach(i => keep.add(i));
  return items.filter(i => keep.has(i));
}

// Term lists for the cache file, so the page can show exactly what is matched.
export const termSummary = terms => Object.fromEntries(Object.entries(terms).map(([id, list]) => [id, {
  names: list.filter(x => typeof x === 'string' || !x.kind || x.kind === 'name').map(x => typeof x === 'string' ? x : x.t),
  institutions: list.filter(x => typeof x === 'object' && x.kind === 'institution').map(x => x.t) }]));
