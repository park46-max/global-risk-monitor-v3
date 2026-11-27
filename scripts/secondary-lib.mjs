// Prepares the cached GDELT search-API articles (data/cache/news.json) for display, using the SAME rules as the open-data pipeline.
// Pure functions, no network, no AI. Used by the browser (js/app.js loads it) and by tests/test-secondary-news.mjs, so what is tested is what the page runs.
// It does not request anything from GDELT and does not change any cache file.
import { buildMatchers, matchCountries } from './rss-lib.mjs';
import { compileRules, refreshItems } from './relevance-lib.mjs';

// GDELT writes dates as 20261127T083000Z. Returns an ISO string or null (never a guessed time).
export const seenIso = d => { const m = /^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)Z?$/.exec(d || ''); return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.000Z` : null; };
const httpUrl = u => /^https?:\/\//i.test(u || '');

// Turns every country's cached articles into one list of unique items (the same link under two countries is one item, remembering which searches returned it).
export function collect(countries) {
  const byUrl = new Map();
  for (const [k, e] of Object.entries(countries || {})) for (const a of (e && Array.isArray(e.articles) ? e.articles : [])) {
    if (!a || !a.title || !httpUrl(a.url)) continue;
    let it = byUrl.get(a.url);
    if (!it) {
      const iso = seenIso(a.seendate); let host = ''; try { host = new URL(a.url).hostname.replace(/^www\./, ''); } catch {}
      it = { title: String(a.title), url: a.url, publisher: a.domain || host || null, publisherId: 'gdelt-search', via: 'GDELT search API', feedId: k, seenByGdelt: iso, firstSeenAt: iso, matches: {}, _from: [] };
      byUrl.set(a.url, it);
    }
    it._from.push(k);
  }
  return [...byUrl.values()];
}

// rules = { countryTerms, relevanceRules }. Returns { items, unmatched, stats }:
//   items      articles whose headline names a monitored country, judged by the shared rules (country match and role, topics, off-topic / financial filter,
//              duplicate groups with variants, outlet label). Filtered ones are included, flagged `filtered`, never dropped.
//   unmatched  articles returned by the search whose headline names none of the five countries (kept and listed, but no relevance rule can apply).
export function analyse(countries, rules) {
  const matchers = buildMatchers(rules.countryTerms), compiled = compileRules(rules.relevanceRules), all = collect(countries);
  const none = new Set(all.filter(it => !Object.keys(matchCountries(matchers, it.title, '')).length));
  const r = refreshItems(all.filter(it => !none.has(it)), { matchers, compiled });
  return { items: r.items, unmatched: all.filter(it => none.has(it)), stats: r.stats };
}
