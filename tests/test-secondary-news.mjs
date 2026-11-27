// Tests for the secondary GDELT search-API section: the shared news rules applied to its headlines (all five countries), nothing hidden, links and times kept,
// parity with the open-data pipeline, and static checks that the page keeps the section collapsed and requests nothing. No network.
// Run: node tests/test-secondary-news.mjs        (the browser rendering checks are in tests/render-secondary.cjs, optional)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { COUNTRY_TERMS } from '../data/country-terms.mjs';
import { RULES } from '../data/relevance-rules.mjs';
import { buildMatchers } from '../scripts/rss-lib.mjs';
import { compileRules, refreshItems } from '../scripts/relevance-lib.mjs';
import { seenIso, collect, analyse } from '../scripts/secondary-lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let n = 0, bad = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.log('  FAIL: ' + m); } };
const rules = { countryTerms: COUNTRY_TERMS, relevanceRules: RULES };
const sd = (h, base = Date.parse('2026-11-27T08:00:00Z')) => new Date(base - h * 36e5).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const A = (title, url, h, extra = {}) => ({ title, url, domain: new URL(url).hostname.replace(/^www\./, ''), seendate: sd(h), language: 'English', sourcecountry: 'US', ...extra });
const entry = (articles, o = {}) => ({ query: 'q', status: 'ok', attempted: true, error: null, fetchedAt: '2026-11-27T07:00:00.000Z', checkedAt: '2026-11-27T07:01:00.000Z', articles, ...o });
const find = (r, re) => r.items.find(i => re.test(i.title));
const all = r => [...r.items, ...r.items.flatMap(i => i.variants || []), ...r.unmatched];

console.log('\nA. Dates and collection');
ok(seenIso('20261127T083000Z') === '2026-11-27T08:30:00.000Z', 'GDELT date is converted to ISO');
ok(seenIso('garbage') === null && seenIso(null) === null && seenIso('20261127') === null, 'unreadable dates give null, never a guessed time');
const dup = A('China central bank cuts interest rates', 'https://x.test/c1', 6);
let c = collect({ USA: entry([dup]), CHN: entry([dup, { title: 'No link here', url: 'javascript:alert(1)' }, { title: '', url: 'https://x.test/e' }, null]) });
ok(c.length === 1 && c[0]._from.join() === 'USA,CHN', 'the same link under two searches is one item that remembers both; unsafe or empty entries are dropped');
ok(collect({}).length === 0 && collect(null).length === 0 && collect({ USA: { articles: 'x' } }).length === 0, 'missing or malformed cache parts give an empty list, not an error');

console.log('\nB. Shared rules applied to search-API headlines (all five countries)');
const cache = {
  USA: entry([A('US imposes sanctions on Chinese chip firms', 'https://www.reuters.com/a', 2), A('US imposes sanctions on Chinese chip firms - Reuters', 'https://syn.example.test/a', 2),
    A('Indian student killed in US', 'https://x.test/b', 3), A('Mass shooting at US high school leaves two hurt', 'https://x.test/c', 3), A('Local bakery wins regional award', 'https://x.test/bak', 3),
    A('SHOCKING! US warship destroys rivals in drill', 'https://x.test/d', 4), A('US Senate passes defense bill', 'https://www.apnews.com/e', 5, { seendate: null })]),
  CHN: entry([A('iShares China ETF net asset value update', 'https://x.test/etf', 6), A('China central bank cuts interest rates', 'https://x.test/c1', 6), A('Chinese singer tops charts after Grammy nod', 'https://x.test/g', 6)]),
  RUS: entry([A('Russia launches missile strikes on Kyiv', 'https://x.test/r1', 3), A('Kenyan runner wins marathon in Russia', 'https://x.test/r2', 3)]),
  UKR: entry([A('Russian strikes damage Kyiv power plants overnight', 'https://x.test/u1', 5), A('Russia strike damages Kyiv power plant overnight', 'https://tass.com/u2', 4)]),
  TWN: entry([A('Taiwan holds military drills as US envoy visits', 'https://x.test/t1', 4), A('Japan firm opens chip plant in Taiwan', 'https://x.test/t2', 4)])
};
const before = JSON.stringify(cache);
const r = analyse(cache, rules);
ok(JSON.stringify(cache) === before, 'the cache object is not modified');
const named = id => r.items.filter(i => i.matches[id]);
ok(['USA', 'CHN', 'RUS', 'UKR', 'TWN'].every(id => named(id).length > 0), 'all five countries receive matched headlines');
ok(find(r, /sanctions on Chinese chip/).matches.USA.role === 'shared' && find(r, /sanctions on Chinese chip/).matches.CHN.role === 'shared', 'US-China headline is shared by both countries, never excluded');
ok(find(r, /Russia launches missile/).matches.RUS && find(r, /Russia launches missile/).matches.UKR, 'Russia-Ukraine headline matches both');
ok(find(r, /Taiwan holds military drills/).matches.TWN && find(r, /Taiwan holds military drills/).matches.USA, 'Taiwan/US headline matches both');
ok(find(r, /Indian student/).matches.USA.role === 'incidental' && find(r, /Kenyan runner/).matches.RUS.role === 'incidental' && find(r, /Japan firm/).matches.TWN.role === 'incidental', 'incidental mentions are labelled for the US, Russia and Taiwan');
ok(['Mass shooting', 'Grammy'].every(w => { const i = find(r, new RegExp(w)); return i && i.filtered && i.filtered.kind === 'off-topic'; }), 'off-topic headlines are filtered with a reason, and still present in the result');
const etf = find(r, /iShares/); ok(etf && etf.filtered && etf.filtered.kind === 'financial-product', 'routine financial notice is filtered with a reason');
ok(!find(r, /central bank cuts/).filtered && find(r, /central bank cuts/).relevance.topics.length > 0, 'geopolitical economic headline is kept with its topic');
const rep = find(r, /sanctions on Chinese chip/);
ok(rep.url === 'https://www.reuters.com/a' && rep.source.tier === 'established' && rep.variants.length === 1 && rep.variants[0].url === 'https://syn.example.test/a', 'duplicates grouped; the established outlet is the representative; the other source keeps its original link');
const ukr = find(r, /Kyiv power plant/); ok(ukr.variants && ukr.variants.length === 1 && ukr.variants[0].tier, 'demonym/plural variants are grouped across searches, with an outlet label on the variant');
ok(find(r, /SHOCKING/).relevance.style && find(r, /SHOCKING/).relevance.style.terms.length > 0, 'sensational wording is flagged');
// nothing hidden silently: every unique article is either an item, a variant of an item, or in the unmatched list
const uniq = collect(cache).length;
ok(all(r).length === uniq, `every unique article is accounted for (${uniq} in the cache, ${all(r).length} shown as item, variant or unmatched)`);
ok(r.unmatched.length === 1 && /bakery/.test(r.unmatched[0].title) && r.unmatched[0]._from.join() === 'USA', 'a headline naming no monitored country is kept in the "unmatched" list with the search that returned it');
// original links and times
ok(find(r, /Senate passes/).seenByGdelt === null, 'an article with no date has no invented time');
ok(find(r, /Russia launches/).seenByGdelt === '2026-11-27T05:00:00.000Z', 'the GDELT first-seen time is kept');
ok(r.items.every(i => /^https?:\/\//.test(i.url) && i.publisher), 'every shown article keeps its original link and publisher');

console.log('\nC. Parity with the open-data pipeline (one rule set, not a second copy)');
const titles = ['US imposes sanctions on Chinese chip firms', 'Indian student killed in US', 'Mass shooting at US high school leaves two hurt', 'Russia launches missile strikes on Kyiv', 'Taiwan holds military drills as US envoy visits'];
const M = buildMatchers(COUNTRY_TERMS), C = compileRules(RULES);
const direct = refreshItems(titles.map((t, i) => ({ title: t, url: 'https://p.test/' + i, publisher: 'p.test', publisherId: 'gdelt', published: '2026-11-27T05:00:00.000Z', matches: {} })), { matchers: M, compiled: C }).items;
const viaSecondary = analyse({ USA: entry(titles.map((t, i) => A(t, 'https://p.test/' + i, 3))) }, rules).items;
const sig = i => JSON.stringify([i.title, i.filtered ? i.filtered.kind : null, i.relevance.score, i.relevance.tier, Object.entries(i.matches).map(([k, m]) => k + ':' + m.level + ':' + m.role).sort()]);
ok(direct.map(sig).sort().join('|') === viaSecondary.map(sig).sort().join('|'), 'same headlines get identical matches, roles, scores and filter results in both pipelines');

console.log('\nD. Empty and failed caches');
let e = analyse({ USA: entry([]), CHN: entry([]), RUS: entry([]), UKR: entry([]), TWN: entry([]) }, rules);
ok(e.items.length === 0 && e.unmatched.length === 0, 'empty cache: nothing is produced and nothing is invented');
e = analyse({ USA: entry([], { status: 'error', error: 'GDELT returned HTTP 503.', fetchedAt: null }) }, rules);
ok(e.items.length === 0, 'failed country with no cached articles: empty result, no exception');
e = analyse({ USA: entry([A('US imposes sanctions on Chinese chip firms', 'https://www.reuters.com/a', 30)], { status: 'error', error: 'x' }) }, rules);
ok(e.items.length === 1 && e.items[0].matches.USA, 'articles kept from an earlier run (status error) are still judged and shown');
ok(analyse({}, rules).items.length === 0, 'no countries at all: empty result');

console.log('\nE. Page and compatibility checks (static)');
const app = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
ok(/let secOpen = false/.test(app), 'the secondary section is collapsed by default');
ok(/aria-expanded/.test(app) && /aria-controls/.test(app), 'the toggle is an accessible button');
ok(!/gdeltproject\.org\/api/.test(app) && !/fetch\(\s*['"`]https?:/.test(app), 'the page makes no request to the GDELT API');
ok(/import\('\.\.\/scripts\/secondary-lib\.mjs'\)/.test(app) && /import\('\.\.\/data\/relevance-rules\.mjs'\)/.test(app) && /import\('\.\.\/data\/country-terms\.mjs'\)/.test(app), 'the page loads the shared rule files instead of copying rules');
ok(!/Grammy|Powerball|mass shooting/i.test(app), 'no second copy of the off-topic word lists in the page');
ok(/could not be loaded in this browser/.test(app) && /WITHOUT relevance/.test(app), 'if the rules cannot be loaded the page says so and shows the articles unfiltered');
ok(/Error details/.test(app) && /Latest refresh/.test(app) && /Cached data in use/.test(app) && /Last success/.test(app), 'status chips and error details are present');
ok(!/The latest GDELT refresh failed\. /.test(app) && /warnline/.test(app), 'the large red GDELT warning banner is replaced by a compact warning line');
const md5 = f => crypto.createHash('md5').update(fs.readFileSync(path.join(ROOT, f))).digest('hex');
ok(md5('js/globe.js') === 'c8c9ebaff9c79cd3a2a09d1f0aea9f8b' && md5('css/style.css') === '32e647502e6ded7fa6554f9f274fad4a', 'globe and stylesheet are unchanged');
const fd = fs.readFileSync(path.join(ROOT, 'scripts/fetch-data.mjs'), 'utf8');
ok(/MIN_AGE_H/.test(fd) && !/secondary-lib|relevance-lib/.test(fd), 'the GDELT search fetcher is untouched and does not use the new module (request frequency and retries unchanged)');

console.log(`\n${n - bad} of ${n} checks passed. ${bad ? bad + ' FAILED.' : ''} Simulated data only; nothing was run on GitHub or against the real GDELT API.`);
process.exit(bad ? 1 : 0);
