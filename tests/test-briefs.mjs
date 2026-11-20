// Tests for the country briefs: country attribution, duplicates, unsupported claims, missing sources, stale data, empty feeds. No network.
// Run: node tests/test-briefs.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { BRIEF_RULES as R } from '../data/brief-rules.mjs';
import { COUNTRY_TERMS } from '../data/country-terms.mjs';
import { RULES } from '../data/relevance-rules.mjs';
import { buildAll } from '../scripts/brief-lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let n = 0, bad = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.log('  FAIL: ' + m); } };
const NOW = Date.parse('2026-11-20T12:00:00Z'), hAgo = h => new Date(NOW - h * 36e5).toISOString();
const item = (title, publisher, url, h, extra = {}) => ({ title, publisher, publisherId: publisher, url, published: hAgo(h), firstSeenAt: hAgo(h), matches: {}, ...extra });
const cache = (items, over = {}) => ({ schema: 1, generatedAt: hAgo(1), checkedAt: hAgo(1), lastSuccessAt: hAgo(1), feeds: { f: { status: 'ok' } }, items, ...over });
const gen = (gdelt, rss = null, prev = null, now = NOW) => buildAll({ caches: { gdelt, rss }, prev, now, R, countryTerms: COUNTRY_TERMS, rules: RULES });
const texts = b => [b.overview && b.overview.text, ...(b.why || []).map(w => w.text)].filter(Boolean);

console.log('\nA. Country attribution');
let out = gen(cache([
  item('Trump announces tariffs on China', 'Pub1', 'https://p1.test/a', 2),
  item('Putin says nothing new', 'Pub1', 'https://p1.test/b', 2),
  item('Russia launches missile strikes on Kyiv', 'Pub2', 'https://p2.test/c', 3),
  item('Putin visits Beijing for sanctions talks', 'Pub3', 'https://p3.test/d', 4),
  item('Taiwan holds military drills as US envoy visits', 'Pub4', 'https://p4.test/e', 5),
  item('Football final ends in a draw', 'Pub4', 'https://p4.test/f', 5)]));
const has = (id, re) => out.countries[id].sources.some(s => re.test(s.title));
ok(has('CHN', /tariffs on China/) && !has('USA', /tariffs on China/), '"Trump announces tariffs on China" is in China only, never the US through "Trump"');
ok(!Object.values(out.countries).some(b => b.sources.some(s => /Putin says nothing/.test(s.title))), 'a headline naming only a leader is attributed to no country');
ok(has('RUS', /missile strikes on Kyiv/) && has('UKR', /missile strikes on Kyiv/), 'a headline naming Russia and Kyiv appears in both briefs');
const beijing = out.countries.CHN.developments.find(d => /Putin visits Beijing/.test(d.headline));
ok(beijing && beijing.matched.level === 'institution' && beijing.matched.terms.includes('Beijing'), 'capital-only match is labelled institution, with the matched word');
ok(!Object.values(out.countries).some(b => b.sources.some(s => /Football/.test(s.title))), 'a headline naming none of the countries is not used');
ok(has('USA', /US envoy/) && has('TWN', /US envoy/), 'US + Taiwan headline appears in both');
// summary-only (RSS legacy) match is never used
out = gen(cache([item('Markets rally on Friday', 'Pub1', 'https://p1.test/g', 2, { matches: { USA: { level: 'summary', terms: ['White House'] } } })]));
ok(out.countries.USA.status === 'unavailable', 'a summary-only match does not create a brief');

console.log('\nB. Duplicate handling');
out = gen(cache([item('China warns US over chip export controls', 'GDELT-site-A', 'https://a.test/1', 6)]), cache([item('China warns US over chip export controls - Reuters', 'Pub R', 'https://r.test/1', 5), item('China warns US over chip export controls', 'Pub S', 'https://s.test/1', 4)]));
let c = out.countries.CHN;
ok(c.developments.length === 1, 'the same headline from three outlets, two caches: one development');
ok(c.developments[0].alsoReportedBy.length === 2, 'the other two outlets are listed as also reported by');
ok(c.sources.length === 3 && new Set(c.sources.map(s => s.url)).size === 3, 'all three original links remain in Sources');
ok(c.sources.filter(s => s.duplicateOf).length === 2 && c.sources.every(s => s.publisher), 'duplicates point to the main report and keep their publisher');
ok(c.reportsFound === 1, 'the brief counts one distinct report, not three');
out = gen(cache([item('Russia launches missile strikes on Kyiv', 'A', 'https://a.test/2', 6), item('Russia and Ukraine hold prisoner exchange talks', 'B', 'https://b.test/2', 5)]));
ok(out.countries.RUS.developments.length === 2, 'different stories are not merged');
const w1 = JSON.stringify(gen(cache([item('Taiwan holds military drills', 'A', 'https://a.test/3', 6), item('Taiwan holds military drills', 'B', 'https://b.test/3', 5)])).countries.TWN.sources);
const w2 = JSON.stringify(gen(cache([item('Taiwan holds military drills', 'B', 'https://b.test/3', 5), item('Taiwan holds military drills', 'A', 'https://a.test/3', 6)])).countries.TWN.sources);
ok(w1 === w2, 'result does not depend on input order');

console.log('\nC. Unsupported claims');
const many = [item('Russia launches missile strikes on Kyiv', 'A', 'https://a.test/10', 2), item('Russia faces new sanctions over Ukraine war', 'B', 'https://b.test/10', 3), item('Ukraine and Russia hold peace talks in Geneva', 'C', 'https://c.test/10', 4),
  item('Russia central bank holds interest rate', 'D', 'https://d.test/10', 5), item('Russia theme park opens', 'E', 'https://e.test/10', 6)];
out = gen(cache(many)); c = out.countries.RUS;
ok(c.status === 'ok' && c.why && c.why.length >= 2, 'enough reports: analytical sentences are produced');
const banned = R.bannedInAnalysis; const all = Object.values(out.countries).flatMap(texts);
ok(all.length > 0 && !all.some(t => banned.some(b => t.toLowerCase().includes(b))), 'no overview or "why it matters" sentence contains causal, proof or prediction wording');
ok(c.why.every(w => w.evidence.length && w.evidence.every(k => c.sources.some(s => s.n === k))), 'every analytical sentence cites sources that exist');
ok(c.why.every(w => (w.text.match(/\[(\d+)\]/g) || []).length >= 1), 'every analytical sentence shows its numbered evidence');
const sec = c.why.find(w => w.rule === 'topic:security'); const secReal = c.sources.filter(s => !s.duplicateOf && /missile|war/.test(s.title)).length;
ok(sec && sec.evidence.length === secReal && new RegExp('^' + secReal + ' of the ').test(sec.text), 'the count in a sentence equals the number of cited reports (recounted independently)');
ok(c.developments.every(d => c.sources.some(s => s.title === d.headline && s.url === d.url)), 'every development is a headline copied word for word from a listed source');
ok(c.developments.every(d => d.kind === 'reporting') && c.why.every(w => w.kind === 'analysis') && c.overview.kind === 'fact', 'reported developments, analysis and counts are labelled differently');
ok(!JSON.stringify(out).match(/risk score|rating/i), 'no risk score or rating is generated');
out = gen(cache([item('Russia launches missile strikes on Kyiv', 'A', 'https://a.test/11', 2)])); c = out.countries.RUS;
ok(c.status === 'limited' && c.why === null && c.limitations.some(t => /at least 2/.test(t)), 'a single report: no analysis, explicit limitation');
out = gen(cache([item('Russia theme park opens', 'A', 'https://a.test/12', 2), item('Russia zoo welcomes new panda', 'B', 'https://b.test/12', 2)])); c = out.countries.RUS;
ok(c.status === 'limited' && c.why === null && c.limitations.some(t => /No analytical rule/.test(t)), 'reports without topic keywords: no analysis, explicit limitation');

console.log('\nD. Missing or unsafe sources');
out = gen(cache([item('Russia launches missile strikes on Kyiv', 'A', 'javascript:alert(1)', 2), item('Russia launches missile attack', 'A', '', 2), item('Russia sanctions list grows', '', 'https://x.test/1', 2),
  item('', 'A', 'https://x.test/2', 2), item('Russia talks resume', 'A', 'https://x.test/3', 2, { published: null, seenByGdelt: null, firstSeenAt: null }), item('Russia sanctions news', 'Good', 'https://good.test/1', 2)]));
c = out.countries.RUS;
ok(c.sources.length === 1 && c.sources[0].publisher === 'Good', 'only the article with title, publisher, safe link and a time is used');
ok(out.itemStats.noSource === 4 && out.itemStats.noTime === 1, 'dropped articles are counted, not silently lost');
ok(Object.values(out.countries).every(b => b.sources.every(s => /^https?:\/\//.test(s.url) && s.publisher && s.title)), 'every source has an http(s) link, publisher and title');
out = gen(cache([item('Russia sanctions news', 'Good', 'https://good.test/1', 2, { published: null, seenByGdelt: hAgo(2) })])); c = out.countries.RUS;
ok(c.sources[0].timeBasis === 'first seen by GDELT', 'a missing publication time is shown as such (basis: first seen by GDELT), not as a publication time');
out = gen(cache([item('Russia sanctions news', 'Old', 'https://old.test/1', 100)]));
ok(out.countries.RUS.status === 'unavailable' && out.itemStats.outsideWindow === 1, 'reports older than the 72-hour window are not used');

console.log('\nE. Empty feeds');
out = gen(cache([]));
ok(Object.values(out.countries).every(b => b.status === 'unavailable' && b.overview === null && b.why === null && b.developments.length === 0 && b.sources.length === 0), 'empty news cache: every brief is Unavailable, with no generated text');
ok(Object.values(out.countries).every(b => b.limitations.length && /does not mean nothing happened/.test(b.limitations[0])), 'empty news cache: an explicit limitation is given');
out = gen(null, cache([item('China sanctions news', 'A', 'https://a.test/20', 2)])); ok(out.countries.CHN.status === 'limited' && out.inputs.gdelt.status === 'missing' && out.countries.CHN.limitations.some(t => /gdelt cache file is not available/.test(t)), 'one cache missing: the brief is built from the other and says so');
let threw = ''; try { gen(null, null); } catch (e) { threw = e.message; } ok(/no readable news cache/.test(threw), 'both caches missing: generation fails (so the previous brief is kept) instead of inventing one');
threw = ''; try { gen({ schema: 9, items: 'x' }, { oops: true }); } catch (e) { threw = e.message; } ok(/invalid/.test(threw), 'both caches invalid: generation fails');

console.log('\nF. Stale data and keeping the last good brief');
out = gen(cache([item('Russia sanctions news', 'A', 'https://a.test/30', 2)], { lastSuccessAt: hAgo(30) }));
ok(out.inputs.gdelt.stale === true && out.countries.RUS.limitations.some(t => /older than 12 hours/.test(t)), 'an input cache older than 12 h is flagged in the brief');
out = gen(cache([item('Russia sanctions news', 'A', 'https://a.test/31', 2)]));
ok(out.inputs.gdelt.stale === false && !out.countries.RUS.limitations.some(t => /older than/.test(t)), 'a fresh input is not flagged');
const good = gen(cache([item('Russia launches missile strikes on Kyiv', 'A', 'https://a.test/40', 2), item('Russia faces sanctions over war', 'B', 'https://b.test/40', 3)]));
const later = gen(cache([]), null, good, NOW + 6 * 36e5);
ok(later.countries.RUS.carriedForward && later.countries.RUS.generatedAt === good.countries.RUS.generatedAt && later.countries.RUS.sources.length === good.countries.RUS.sources.length, 'nothing usable now: the earlier brief is kept unchanged and marked carriedForward');
ok(later.countries.CHN.status === 'unavailable' && !later.countries.CHN.carriedForward, 'a country that never had a brief stays Unavailable');
const much = gen(cache([]), null, good, NOW + (R.carryMaxHours + 1) * 36e5);
ok(much.countries.RUS.status === 'unavailable' && !much.countries.RUS.carriedForward, 'an earlier brief is not kept longer than 168 hours');

// Script level: files on disk, exit codes, preserved file on failure
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brief-')), run = (extra = [], env = {}) => spawnSync('node', [path.join(ROOT, 'scripts', 'build-briefs.mjs'), '--dir=' + dir, ...extra], { encoding: 'utf8', env: { ...process.env, BRIEF_NOW: new Date(NOW).toISOString(), ...env } });
const w = (f, o) => fs.writeFileSync(path.join(dir, f), typeof o === 'string' ? o : JSON.stringify(o));
let r = run(); ok(r.status === 2 && !fs.existsSync(path.join(dir, 'briefs.json')), 'script: no news caches and no earlier file: exit 2, nothing written');
w('news-gdelt.json', cache(many)); r = run(['--verify']); ok(r.status === 0 && !fs.existsSync(path.join(dir, 'briefs.json')) && /nothing was written/.test(r.stdout), 'script: verify mode writes nothing');
r = run(); const f1 = JSON.parse(fs.readFileSync(path.join(dir, 'briefs.json'), 'utf8'));
ok(r.status === 0 && f1.schema === 1 && f1.status === 'ok' && f1.lastSuccessAt && Object.keys(f1.countries).join() === 'USA,CHN,RUS,UKR,TWN', 'script: briefs.json written for the five countries with lastSuccessAt');
ok(!fs.readdirSync(dir).some(x => x.endsWith('.tmp')), 'script: no temporary file left behind');
w('news-gdelt.json', '{ this is not json'); r = run(['--fetch'], { BRIEF_NOW: new Date(NOW + 36e5).toISOString() });
const f2 = JSON.parse(fs.readFileSync(path.join(dir, 'briefs.json'), 'utf8'));
ok(r.status === 2 && f2.status === 'error' && /no readable news cache/.test(f2.error), 'script: broken cache: exit 2 and the file is marked status "error"');
ok(f2.lastSuccessAt === f1.lastSuccessAt && JSON.stringify(f2.countries) === JSON.stringify(f1.countries), 'script: the last successful briefs are preserved unchanged after the failure');
w('news-gdelt.json', cache(many, { lastSuccessAt: new Date(NOW + 2 * 36e5).toISOString() })); r = run([], { BRIEF_NOW: new Date(NOW + 2 * 36e5).toISOString() });
const f3 = JSON.parse(fs.readFileSync(path.join(dir, 'briefs.json'), 'utf8')); ok(r.status === 0 && f3.status === 'ok' && !f3.error && f3.lastSuccessAt > f1.lastSuccessAt, 'script: recovery: a later good run clears the error and advances lastSuccessAt');
const src = fs.readFileSync(path.join(ROOT, 'scripts', 'build-briefs.mjs'), 'utf8') + fs.readFileSync(path.join(ROOT, 'scripts', 'brief-lib.mjs'), 'utf8');
ok(!/fetch\(|https?\.request|http-lib|process\.env\.[A-Z_]*KEY/i.test(src), 'the brief code makes no network request and uses no API key');

console.log(`\n${n - bad} of ${n} checks passed${bad ? `, ${bad} FAILED` : ''}. Simulated data only; nothing was run on GitHub.`);
process.exit(bad ? 1 : 0);
