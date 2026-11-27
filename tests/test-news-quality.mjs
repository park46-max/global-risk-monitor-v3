// Regression tests for the news-quality rules: primary vs incidental country, geopolitical relevance (off-topic filtering), duplicate detection,
// the source-label policy, and the country briefs built from the improved set. No network, no AI. Simulated data only.
// Run: node tests/test-news-quality.mjs
import { COUNTRY_TERMS } from '../data/country-terms.mjs';
import { RULES } from '../data/relevance-rules.mjs';
import { SOURCE_POLICY } from '../data/source-quality.mjs';
import { BRIEF_RULES as R } from '../data/brief-rules.mjs';
import { buildMatchers, matchCountries } from '../scripts/rss-lib.mjs';
import { compileRules, classify, roleFor, clusterItems, refreshItems, capItems, classifySource, styleFlag } from '../scripts/relevance-lib.mjs';
import { buildAll } from '../scripts/brief-lib.mjs';

let n = 0, bad = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.log('  FAIL: ' + m); } };
const M = buildMatchers(COUNTRY_TERMS), C = compileRules(RULES);
const NOW = Date.parse('2026-11-20T12:00:00Z'), hAgo = h => new Date(NOW - h * 36e5).toISOString();
// Judge one headline exactly as the pipeline does: roles per country, score, filter.
const judge = t => {
  const m = matchCountries(M, t, ''), ids = Object.keys(m), c = classify(t, C, ids.length), roles = {};
  for (const id of ids) roles[id] = roleFor(t, id, M[id], ids, c.maxWeight, C);
  return { ids, roles, c };
};
const mkItem = (title, url, h = 2, extra = {}) => ({ title, publisher: new URL(url).hostname.replace(/^www\./, ''), publisherId: 'gdelt', url, published: hAgo(h), firstSeenAt: hAgo(h), matches: {}, ...extra });
const refresh = items => refreshItems(items, { matchers: M, compiled: C });

console.log('\nA. Primary country vs incidental mention (all five countries)');
const role = (t, id) => judge(t).roles[id];
// USA
ok(role('US Senate passes defense spending bill', 'USA') === 'primary', 'USA: a story about the US itself is primary');
ok(role('Indian student killed in US', 'USA') === 'incidental', 'USA: another country first, no geopolitical wording: incidental');
ok(role('US-based startup raises funds', 'USA') === 'incidental', 'USA: "US-based" only describes a company: incidental');
ok(role('Japan PM visits US for summit', 'USA') === 'shared', 'USA: another country first but a diplomacy story: shared, not excluded');
ok(role('Iran warns US over naval blockade', 'USA') === 'shared', 'USA: interstate security story with an outside country: shared');
// China
ok(role('China unveils new export controls on rare earths', 'CHN') === 'primary', 'China: primary');
ok(role('Brazil coffee exports rise as demand grows in China', 'CHN') === 'incidental', 'China: demand story led by another country: incidental');
ok(role("India's army chief says China border clashes ease", 'CHN') === 'shared', 'China: border security story: shared');
// Russia
ok(role('Russia launches drone attacks on Ukrainian cities', 'RUS') === 'shared' && role('Russia launches drone attacks on Ukrainian cities', 'UKR') === 'shared', 'Russia-Ukraine: both countries shared, neither excluded');
ok(role('Kenyan runner wins marathon in Russia', 'RUS') === 'incidental', 'Russia: incidental');
ok(role('Moscow expels diplomats as Kremlin protests', 'RUS') === 'primary', 'Russia: capital and Kremlin only, own story: primary');
// Ukraine
ok(role('Poland and Ukraine sign grain accord', 'UKR') === 'shared', 'Ukraine: a diplomacy story with a non-monitored country first: shared, not excluded');
ok(role('Ukraine grain exports rise despite Polish protests', 'UKR') === 'primary', 'Ukraine: named first: primary');
ok(role('Spanish chef opens restaurant for refugees from Ukraine', 'UKR') === 'incidental', 'Ukraine: incidental');
// Taiwan
ok(role('Taiwan reports Chinese warships near strait', 'TWN') === 'shared' && role('Taiwan reports Chinese warships near strait', 'CHN') === 'shared', 'Taiwan Strait: Taiwan and China both shared');
ok(role('Japan firm opens chip plant in Taiwan', 'TWN') === 'incidental', 'Taiwan: incidental');
ok(role('US destroyer sails Taiwan Strait as China holds drills', 'TWN') === 'shared', 'US-China-Taiwan: shared');
// Bilateral stories are never incidental, even without topic words or with a non-monitored country first
ok(['Chinese tourists visit US cities', 'Trade talks: US and China meet', 'Ukraine, Russia exchange prisoners'].every(t => !Object.values(judge(t).roles).includes('incidental')), 'headlines naming two monitored countries are never incidental');
// The role is also visible through the pipeline, and incidental items are kept (not deleted)
let r = refresh([mkItem('Indian student killed in US', 'https://www.example-news.test/a'), mkItem('US sanctions Russian banks over Ukraine war', 'https://www.example-news.test/b')]);
const inc = r.items.find(i => /Indian student/.test(i.title));
ok(inc && inc.matches.USA.role === 'incidental' && !inc.filtered, 'incidental article is kept, labelled, and not filtered');
ok(r.stats.incidentalMentions === 1, 'statistics count incidental mentions');
// capItems: incidental mentions never crowd out primary stories when the per-country limit is small
const many = refresh([mkItem('Indian student killed in US', 'https://x.test/1', 1), mkItem('US sanctions Chinese banks', 'https://x.test/2', 5)]).items;
ok(capItems(many, ['USA'], 1, 0).every(i => /sanctions/.test(i.title)), 'with room for one article, the primary story is kept over a newer incidental mention');
ok(role('Washington state flood warning', 'USA') === undefined && judge('Trump says golf course sold').ids.length === 0, 'person names and ambiguous words still match no country');

console.log('\nB. Geopolitical relevance');
const filtered = t => judge(t).c.filtered;
const offTopic = [['Chinese singer tops charts after Grammy nod', 'CHN'], ['Taiwan baseball team wins playoffs', 'TWN'], ['Ukraine soccer star signs new deal', 'UKR'],
  ['Russian actress marries in lavish wedding', 'RUS'], ['Mass shooting at US high school leaves two hurt', 'USA'], ['US celebrity couple wins box office night', 'USA']];
for (const [h] of offTopic) ok(filtered(h) && filtered(h).kind === 'off-topic' && filtered(h).terms.length > 0, 'filtered as off-topic, with reason: ' + h);
const keepers = ['Russia sanctions hit Premier League club owners', 'Taiwan chip export controls tighten as China drills continue', 'US and China hold trade talks over rare earths',
  'Ukraine peace talks resume as Russia launches missile strikes', 'China central bank cuts interest rates', 'Taiwan holds military drills as US envoy visits'];
for (const h of keepers) ok(!filtered(h), 'geopolitical headline is kept: ' + h);
ok(judge('Russia sanctions hit Premier League club owners').c.score >= 3, 'a sports word does not lower a sanctions headline');
ok(judge('Russia launches missile strikes on Kyiv').c.score > judge('Chinese tourists flock to new theme park').c.score, 'security headline outranks a no-topic headline');
r = refresh(offTopic.map(([h], i) => mkItem(h, 'https://x.test/o' + i)).concat([mkItem('Russia launches missile strikes on Kyiv', 'https://x.test/k')]));
ok(r.items.filter(i => i.filtered && i.filtered.kind === 'off-topic').length === offTopic.length && r.stats.filteredOffTopic === offTopic.length, 'off-topic items are listed as filtered (counted), not deleted');
ok(r.items.some(i => /missile/.test(i.title) && !i.filtered), 'the geopolitical headline stays visible');

console.log('\nC. Duplicate detection');
const clu = items => clusterItems(refresh(items).items.filter(i => !i.filtered), RULES.dedupe);
let g = clu([mkItem('Russian strikes damage Kyiv power plants overnight', 'https://a.test/1', 5), mkItem('Russia strike damages Kyiv power plant overnight', 'https://b.test/1', 4)]);
ok(g.length === 1 && g[0].variants.length === 1, 'demonym and plural differences ("Russian strikes" / "Russia strike") are grouped');
g = clu([mkItem('Taiwan holds military drills near strait', 'https://a.test/2', 5), mkItem('Taiwan holds military drills near strait, defence ministry says in statement', 'https://b.test/2', 4)]);
ok(g.length === 1, 'a headline that is another one plus a few extra words is grouped (containment)');
g = clu([mkItem('Russian strike on Kyiv kills 5', 'https://a.test/3', 5), mkItem('Russian strike on Kyiv kills 12', 'https://b.test/3', 4)]);
ok(g.length === 2, 'different casualty numbers are different reports: not merged');
g = clu([mkItem('US sanctions Chinese firms over Iran oil export shipment', 'https://a.test/4', 5), mkItem('US sanctions Russian firms over Iran oil export shipment', 'https://b.test/4', 4)]);
ok(g.length === 2, 'same wording but a different country (China vs Russia) is not merged');
g = clu([mkItem('Russia launches missile strikes on Kyiv', 'https://a.test/5', 5), mkItem('Russia launches missile strikes on Lviv', 'https://b.test/5', 4)]);
ok(g.length === 2, 'same countries and keywords but a different city is not merged');
g = clu([mkItem('Russia launches missile strikes on Kyiv overnight', 'https://a.test/6', 5), mkItem('China holds military drills near Taiwan overnight', 'https://b.test/6', 4)]);
ok(g.length === 2, 'different events sharing a word are not merged');
// representative: highest score, then established outlet, then earliest
g = clu([mkItem('China warns US over chip curbs', 'https://blog.example.test/x', 6), mkItem('China warns US over chip curbs', 'https://www.reuters.com/y', 3), mkItem('China warns US over chip curbs', 'https://other.example.test/z', 4)]);
ok(g.length === 1 && /reuters\.com/.test(g[0].url), 'an established outlet is preferred as the representative over an earlier unassessed one');
ok(g[0].variants.length === 2 && g[0].variants.every(v => v.url && v.publisher && v.tier), 'every other source is kept with its link, publisher and label (nothing hidden)');
ok(g[0].variantsTotal === 2, 'the number of syndicated copies is recorded');
g = clu([mkItem('Taiwan holds military drills', 'https://a.test/7', 8), mkItem('Taiwan holds military drills', 'https://b.test/7', 9)]);
ok(g.length === 1 && g[0].publisher === 'b.test', 'with equal score and equal label, the earlier article is the representative');
const base = () => [mkItem('Taiwan holds military drills', 'https://a.test/8', 8), mkItem('Taiwan holds military drills', 'https://b.test/8', 9), mkItem('Russian strikes damage Kyiv power plants overnight', 'https://c.test/8', 5)];
ok(JSON.stringify(clu(base())) === JSON.stringify(clu(base().reverse())), 'grouping does not depend on input order');

console.log('\nD. Source-label policy');
ok(classifySource('https://www.reuters.com/world/x').tier === 'established' && classifySource('https://news.bbc.co.uk/a').tier === 'established', 'established outlet and its subdomains are labelled');
ok(classifySource('https://tass.com/a').tier === 'state' && classifySource('https://www.globaltimes.cn/a').tier === 'state', 'state-owned outlets are labelled by ownership');
ok(classifySource('https://random-blog.example/a').tier === 'unassessed', 'an unlisted outlet is "unassessed", not "unreliable"');
ok(classifySource('https://notreuters.com/a').tier === 'unassessed' && classifySource('https://reuters.com.evil.test/a').tier === 'unassessed', 'look-alike domains do not inherit a label');
ok(classifySource('not a url').tier === 'unassessed', 'an unreadable link is "unassessed"');
const labels = Object.values(SOURCE_POLICY.labels).join(' ').toLowerCase();
ok(!/(verified|trustworthy|fake|propaganda|misinformation|biased|left-wing|right-wing)/.test(labels) && (labels.match(/unreliable/g) || []).length === (labels.match(/does not mean it is unreliable/g) || []).length, 'label wording makes no verification, reliability or ideology claim ("unreliable" appears only in a negation)');
ok(/not a fact-check/i.test(SOURCE_POLICY.labels.established), 'the established label says it is not a fact-check');
const hostsOf = SOURCE_POLICY.state.join(' ');
ok(/\.cn\b/.test(hostsOf) && /\.ru\b/.test(hostsOf) && /\.ua\b/.test(hostsOf) && /\.gov\b/.test(hostsOf), 'the state-owned list covers outlets of several of the monitored countries, not one side');
ok(SOURCE_POLICY.state.every(d => !SOURCE_POLICY.established.includes(d)), 'no domain is on both lists');
// labels never hide an article and never change its score
const same = refresh([mkItem('China warns US over chip curbs', 'https://www.reuters.com/a'), mkItem('China warns US over chip curbs and tariffs', 'https://random-blog.example/b'), mkItem('China warns US over chip curbs', 'https://tass.com/c')]);
ok(same.items.length + same.stats.groupedDuplicates === 3, 'articles from established, unassessed and state outlets are all kept');
const sc = ['https://www.reuters.com/a', 'https://tass.com/c', 'https://random-blog.example/z'].map(u => refresh([mkItem('China warns US over chip curbs', u)]).items[0].relevance.score);
ok(sc[0] === sc[1] && sc[1] === sc[2], 'the outlet label does not change the relevance score');
ok(refresh([mkItem('China warns US over chip curbs', 'https://www.reuters.com/a')]).items[0].source.tier === 'established', 'the label is stored on the article');
// headline style flag
const calm = 'China warns US over chip curbs', loud = 'SHOCKING! China destroys US chip curbs';
ok(styleFlag(calm) === null && styleFlag(loud) && styleFlag(loud).terms.includes('shocking'), 'sensational wording is flagged, calm wording is not');
ok(styleFlag('CHINA WARNS US OVER CHIP CURBS AND TARIFFS NOW').terms.includes('mostly capital letters'), 'all-capitals headlines are flagged');
ok(styleFlag('NATO and the EU discuss Russia sanctions') === null, 'normal acronyms are not flagged');
const sa = judge(calm).c.score, sb = judge(loud).c.score;
ok(sb >= 0 && judge(loud).c.style && judge(loud).c.style.terms.length > 0, 'a flagged headline records the reason');
const plainScore = judge('China warns US over export controls and sanctions').c.score, loudScore = judge('SHOCKING! China warns US over export controls and sanctions').c.score;
ok(loudScore === plainScore - 1, 'sensational wording lowers the score by exactly 1');
ok(refresh([mkItem(loud, 'https://x.test/s')]).items.length === 1, 'a sensational headline is still shown, not removed');
ok(sa >= 0, 'score never negative');

console.log('\nE. Country briefs use the improved set');
const cache = items => ({ schema: 1, generatedAt: hAgo(1), checkedAt: hAgo(1), lastSuccessAt: hAgo(1), feeds: { f: { status: 'ok' } }, items });
const gen = items => buildAll({ caches: { gdelt: cache(items), rss: null }, prev: null, now: NOW, R, countryTerms: COUNTRY_TERMS, rules: RULES });
let out = gen([
  mkItem('China warns US over chip curbs', 'https://www.reuters.com/a', 3), mkItem('China warns US over chip curbs - Reuters', 'https://syndicate.example.test/a', 2), mkItem('China warns US over chip curbs', 'https://other.example.test/a', 2),
  mkItem('Indian student killed in US', 'https://x.test/b', 3), mkItem('Mass shooting at US high school leaves two hurt', 'https://x.test/c', 3),
  mkItem('Russia launches missile strikes on Kyiv', 'https://x.test/d', 4), mkItem('Russian strike on Kyiv kills 5 - report', 'https://y.test/d', 4), mkItem('Russian strike on Kyiv kills 12', 'https://z.test/d', 4),
  mkItem('Taiwan reports Chinese warships near strait', 'https://x.test/e', 5), mkItem('Japan firm opens chip plant in Taiwan', 'https://x.test/f', 5), mkItem('Spanish chef opens restaurant for refugees from Ukraine', 'https://x.test/g', 5)]);
const srcs = id => out.countries[id].sources.map(s => s.title);
ok(out.countries.USA.reportsFound === 1 && srcs('USA').every(t => /chip curbs/.test(t) || /Reuters/.test(t)), 'USA brief: three copies of one story count as one report; the incidental mention and the local shooting are not used');
ok(out.countries.USA.sources.filter(s => s.duplicateOf).length === 2, 'the two syndicated copies are listed as copies of source [1], not as separate developments');
ok(out.countries.USA.overview.text.includes('1 distinct report') && /only in passing/.test(out.countries.USA.overview.text), 'USA overview: counts distinct reports and states that one report names the US only in passing');
ok(!srcs('USA').some(t => /Indian student|shooting/.test(t)), 'USA brief: neither the incidental headline nor the off-topic one appears');
ok(out.countries.UKR.sources.filter(s => !s.duplicateOf).length >= 2 && out.countries.UKR.sources.some(s => /kills 12/.test(s.title)) && out.countries.UKR.sources.some(s => /kills 5/.test(s.title)), 'Ukraine brief: reports with different numbers stay separate');
ok(!srcs('UKR').some(t => /Spanish chef/.test(t)), 'Ukraine brief: the incidental mention is not used');
ok(srcs('TWN').some(t => /Chinese warships/.test(t)) && !srcs('TWN').some(t => /chip plant/.test(t)), 'Taiwan brief: Taiwan Strait story used, incidental mention left out');
ok(srcs('CHN').some(t => /Chinese warships/.test(t)) && srcs('CHN').some(t => /chip curbs/.test(t)), 'China brief: bilateral stories are kept');
ok(srcs('RUS').some(t => /missile strikes on Kyiv/.test(t)), 'Russia brief: Russia-Ukraine story kept');
ok(out.countries.USA.sources[0].sourceLabel === 'established' && out.countries.USA.sources.every(s => ['established', 'state', 'unassessed'].includes(s.sourceLabel)), 'sources carry an outlet label (established outlet listed first)');
ok(out.countries.USA.sources[0].publisher === 'reuters.com', 'the established outlet is the representative of the duplicate group');
ok(out.itemStats.incidentalMentions >= 3 && out.itemStats.offTopic === 1, 'statistics report incidental and off-topic counts');
const texts = Object.values(out.countries).flatMap(b => [b.overview && b.overview.text, ...(b.why || []).map(w => w.text)]).filter(Boolean);
ok(texts.length > 0 && !texts.some(t => R.bannedInAnalysis.some(b => t.toLowerCase().includes(b))), 'no generated sentence contains causal, proof or prediction wording');
ok(JSON.stringify(gen([mkItem('China warns US over chip curbs', 'https://a.test/1')]).countries) === JSON.stringify(gen([mkItem('China warns US over chip curbs', 'https://a.test/1')]).countries), 'briefs are deterministic');
// a country with only an incidental mention: Unavailable, with an honest explanation
out = gen([mkItem('Indian student killed in US', 'https://x.test/b', 3)]);
ok(out.countries.USA.status === 'unavailable' && out.countries.USA.limitations.some(l => /only in passing/.test(l)), 'only an incidental mention: brief is Unavailable and says why');
ok(out.countries.TWN.status === 'unavailable' && out.countries.TWN.overview === null && out.countries.TWN.why === null, 'a country with no reports has no generated text');
// all-unassessed outlets: limitation, not a reliability claim
out = gen([mkItem('Russia launches missile strikes on Kyiv', 'https://a.test/1'), mkItem('Russia sanctions hit energy exports', 'https://b.test/2')]);
ok(out.countries.RUS.limitations.some(l => /not assessed/.test(l) && /not a finding that they are unreliable/.test(l)), 'mostly unassessed sources: a limitation says so without calling them unreliable');

console.log('\nF. Compatibility with earlier caches');
const old = { title: 'Russia launches missile strikes on Kyiv', url: 'https://a.test/old', publisher: 'a.test', publisherId: 'gdelt', published: hAgo(3), firstSeenAt: hAgo(3), matches: { RUS: { level: 'headline', terms: ['Russia'] } }, relevance: { score: 1, tier: 'medium', topics: [] } };
r = refresh([old]);
ok(r.items.length === 1 && r.items[0].matches.RUS.role && r.items[0].source && r.items[0].relevance.score >= 3, 'an article cached by the older version is re-judged and gains role and label');
const rulesOld = { topics: RULES.topics, noise: RULES.noise, dedupe: { similarity: 0.7, minWords: 4, windowHours: 48, maxVariants: 8 }, tiers: RULES.tiers };
const Co = compileRules(rulesOld);
ok(refreshItems([mkItem('Chinese singer tops charts after Grammy nod', 'https://x.test/1')], { matchers: M, compiled: Co }).items.every(i => !i.filtered), 'a custom rules file without the new sections still works (new rules simply off)');
ok(Object.keys(RULES).includes('role') && Object.keys(RULES).includes('offTopic'), 'the shipped rules include the new sections');

console.log(`\n${n - bad} of ${n} checks passed. ${bad ? bad + ' FAILED.' : ''} Simulated data only; nothing was run on GitHub.`);
process.exit(bad ? 1 : 0);
