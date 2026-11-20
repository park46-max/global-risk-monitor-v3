// Tests for country matching, routine-notice filtering, duplicate grouping and relevance scoring. No network.   Run: node tests/test-relevance.mjs
import { COUNTRY_TERMS } from '../data/country-terms.mjs';
import { RULES } from '../data/relevance-rules.mjs';
import { buildMatchers, matchCountries } from '../scripts/rss-lib.mjs';
import { compileRules, classify, clusterItems, refreshItems, capItems, normTitle } from '../scripts/relevance-lib.mjs';

let n = 0, bad = 0;
const ok = (c, m) => { n++; if (c) console.log('  PASS ' + m); else { bad++; console.log('  FAIL: ' + m); } };
const M = buildMatchers(COUNTRY_TERMS), C = compileRules(RULES);
const ids = t => Object.keys(matchCountries(M, t, '')).sort().join(',');
const judge = t => { const m = matchCountries(M, t, ''); return classify(t, C, Object.values(m).filter(x => x.level !== 'summary').length); };

console.log('\nA. Incorrect country matching');
const allTerms = Object.values(COUNTRY_TERMS).flat().map(x => (typeof x === 'string' ? x : x.t).toLowerCase());
const PEOPLE = ['trump', 'biden', 'harris', 'putin', 'xi', 'xi jinping', 'zelensky', 'zelenskyy', 'lai', 'lai ching-te', 'tsai', 'medvedev', 'lavrov', 'blinken', 'rubio', 'obama'];
ok(!PEOPLE.some(p => allTerms.includes(p)), 'no person name is a country term');
ok(Object.values(COUNTRY_TERMS).every(l => l.some(x => typeof x === 'string' || !x.kind || x.kind === 'name')), 'every country has at least one country-name term');
ok(ids('Trump says golf course sold') === '' && ids('Putin says nothing') === '' && ids('Xi Jinping and Zelensky speak by phone') === '', 'a leader name alone matches no country');
ok(ids('Trump announces tariffs on China') === 'CHN', 'Trump + China matches China only, never the US through "Trump"');
const t1 = matchCountries(M, 'Trump announces tariffs on China', '');
ok(t1.CHN.level === 'country' && t1.CHN.terms.join() === 'China', 'label basis is the real country name: "China"');
ok(matchCountries(M, 'Putin visits Beijing', '').CHN.level === 'institution', 'capital-only match is flagged "institution", not "country"');
ok(ids('Washington state flood warning') === '' && ids('Georgia election results') === '', 'ambiguous words (Washington state, Georgia) do not match');
ok(ids('Chinese and US negotiators meet') === 'CHN,USA', 'demonyms and US abbreviation match');
ok(ids('Who let us go there') === '', 'lowercase "us" the pronoun is not the United States');

console.log('\nB. Routine financial notices');
const noise = ['iShares MSCI China ETF Net Asset Value Update', 'Vanguard Total Stock Market ETF boosts position in Chinese firm', 'Chinese EV maker beats earnings estimates',
  'US dividend fund declares quarterly dividend', 'Analyst sets price target on Russian gas stock shares of Gazprom'];
for (const h of noise) ok(!!judge(h).filtered, 'filtered: ' + h);
const keep = ['Sanctions on Russia hit energy ETF', 'China ETF inflows jump after Beijing unveils stimulus', 'US raises tariffs on Chinese steel', 'China central bank cuts interest rates',
  'Russia launches missile strikes on Kyiv', 'Ukraine peace talks resume in Geneva', 'US and China hold trade talks over rare earths'];
for (const h of keep) ok(!judge(h).filtered, 'kept: ' + h);
ok(judge('Sanctions on Russia hit energy ETF').score >= 3, 'an ETF headline with a sanctions signal still scores high');

console.log('\nC. Duplicates');
const mk = (title, pub, url, hrs, extra = {}) => { const m = matchCountries(M, title, ''); const c = classify(title, C, Object.keys(m).length);
  return { title, publisher: pub, publisherId: pub, url, published: new Date(Date.UTC(2026, 10, 20, hrs)).toISOString(), matches: m, relevance: { score: c.score, tier: c.tier, topics: c.topics }, ...extra }; };
ok(normTitle('China warns US over chip curbs - Reuters') === 'China warns US over chip curbs', 'trailing " - Publisher" is ignored');
let g = clusterItems([mk('China warns US over chip curbs - Reuters', 'A', 'https://a.test/1', 8), mk('China warns US over chip curbs', 'B', 'https://b.test/1', 9), mk('US over chip curbs, China warns', 'C', 'https://c.test/1', 10)], RULES.dedupe);
ok(g.length === 1 && g[0].variants.length === 2, 'suffix and word-order variants are grouped (1 shown, 2 variants)');
ok(g[0].variants.every(v => v.url && v.publisher), 'each variant keeps its publisher and original link');
ok(g[0].publisher === 'A', 'the earliest article is the representative');
g = clusterItems([mk('Russia launches missile strikes on Kyiv', 'A', 'https://a.test/1', 8), mk('Russia and Ukraine hold prisoner exchange talks', 'B', 'https://b.test/1', 9)], RULES.dedupe);
ok(g.length === 2, 'different stories are not grouped');
g = clusterItems([mk('Russia launches missile strikes on Kyiv overnight', 'A', 'https://a.test/1', 8), mk('Russia launches missile strikes on Kyiv overnight', 'B', 'https://b.test/1', 8 + 72)].map((x, i) => (i ? { ...x, published: '2026-11-23T08:00:00.000Z' } : x)), RULES.dedupe);
ok(g.length === 2, 'the same headline more than 48 hours apart is not grouped');
const sameInput = () => [mk('Taiwan holds military drills', 'A', 'https://a.test/1', 8), mk('Taiwan holds military drills', 'B', 'https://b.test/1', 9)];
ok(JSON.stringify(clusterItems(sameInput(), RULES.dedupe)) === JSON.stringify(clusterItems(sameInput().reverse(), RULES.dedupe)), 'grouping does not depend on input order');

console.log('\nD. Relevant geopolitical news is prioritised');
const sc = h => judge(h).score;
ok(sc('Russia launches missile strikes on Kyiv') >= 3 && judge('Russia launches missile strikes on Kyiv').tier === 'high', 'security story is high');
ok(sc('Taiwan holds military drills as US envoy visits') > sc('China central bank cuts interest rates'), 'security + diplomacy outranks a single economic-policy story');
ok(judge('China central bank cuts interest rates').tier === 'medium', 'economic policy alone is medium');
ok(judge('Chinese tourists flock to new theme park').tier === 'other', 'no geopolitical word: "other"');
ok(sc('US and China hold trade talks over rare earths') > sc('US holds trade talks'), 'two monitored countries add to the score');
const withTopics = judge('Wall Street falls as US-China trade war fears grow'); ok(withTopics.topics.length === 1 && withTopics.topics[0].terms.join() === 'trade war', '"trade war" is not also counted as "war"');
const ranked = [mk('Chinese tourists flock to new theme park', 'A', 'https://a.test/9', 12), mk('Russia launches missile strikes on Kyiv', 'B', 'https://b.test/9', 6)];
ok(capItems(ranked, ['CHN', 'RUS'], 5, 5).length === 2 && refreshItems(ranked.map(x => ({ ...x })), { matchers: M, compiled: C }).items[0].title.startsWith('Russia'), 'higher-scoring story is listed before a newer low-scoring one');

console.log('\nE. Old cached items are re-evaluated with the new rules');
const old = [{ title: 'Trump says golf course sold', publisher: 'X', publisherId: 'gdelt', url: 'https://x.test/1', published: '2026-11-20T08:00:00.000Z', matches: { USA: { level: 'headline', terms: ['Trump'] } } },
  { title: 'Trump announces tariffs on China', publisher: 'X', publisherId: 'gdelt', url: 'https://x.test/2', published: '2026-11-20T08:00:00.000Z', matches: { USA: { level: 'headline', terms: ['Trump'] }, CHN: { level: 'headline', terms: ['China'] } } },
  { title: 'iShares MSCI China ETF Net Asset Value Update', publisher: 'Y', publisherId: 'gdelt', url: 'https://y.test/1', published: '2026-11-20T08:00:00.000Z', matches: { CHN: { level: 'headline', terms: ['China'] } } }];
const r = refreshItems(old, { matchers: M, compiled: C });
ok(!r.items.some(i => /golf/.test(i.title)) && r.stats.droppedNoMatch === 1, 'a cached item that matched only through "Trump" is dropped');
const tar = r.items.find(i => /tariffs/.test(i.title)); ok(tar && Object.keys(tar.matches).join() === 'CHN' && tar.matches.CHN.level === 'country', 'a cached item loses its wrong "USA / Trump" match and keeps China');
const etf = r.items.find(i => /Net Asset/.test(i.title)); ok(etf && etf.filtered && r.items.indexOf(etf) === r.items.length - 1, 'a cached ETF notice is flagged "filtered" (kept for audit, listed last)');
ok(JSON.stringify(r.items).indexOf('"headline"') < 0, 'no legacy "headline" level remains after refresh');

console.log(`\n${n - bad} of ${n} checks passed${bad ? `, ${bad} FAILED` : ''}.`);
process.exit(bad ? 1 : 0);
