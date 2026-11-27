// SIMULATED tests for Stage 7B (official sources: State Department, UN News, EEAS). Fake feeds on a local mock server; no real website is contacted.
// Run:  node tests/test-official-sources.mjs
// Checks: the three candidates are configured and switched off; source types; official items are never "corroboration"; robots.txt, 403 and redirects are
// respected in verify and fetch mode; the verify report; nothing is written or enabled by verify; the briefs, risk and other protected files are untouched.
import http from 'node:http'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import crypto from 'node:crypto';
import { spawn } from 'node:child_process'; import { fileURLToPath, pathToFileURL } from 'node:url';
import { PUBLISHERS } from '../data/rss-sources.mjs';
import { SOURCE_TYPES, isOfficial, isKnownType } from '../data/source-types.mjs';
import { parseRobots, robotsDecision } from '../scripts/robots-lib.mjs';
import { feedFormat, auditEntries, parseFeed, buildMatchers } from '../scripts/rss-lib.mjs';
import { compileRules, refreshItems } from '../scripts/relevance-lib.mjs';
import { RULES } from '../data/relevance-rules.mjs'; import { COUNTRY_TERMS } from '../data/country-terms.mjs';
import { buildAll } from '../scripts/brief-lib.mjs'; import { BRIEF_RULES } from '../data/brief-rules.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL: ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`);
const md5 = f => crypto.createHash('md5').update(fs.readFileSync(path.join(ROOT, f))).digest('hex');
const sec = t => console.log('\n' + t);

// ============ A. configuration ============
sec('A. Configuration: three candidates, all switched off');
const by = Object.fromEntries(PUBLISHERS.map(p => [p.id, p]));
ok(PUBLISHERS.every(p => p.enabled === false), 'every publisher is switched off');
ok(PUBLISHERS.every(p => p.termsChecked === null), 'no termsChecked date was filled in for any publisher');
ok(PUBLISHERS.every(p => isKnownType(p.sourceType)), 'every publisher has an explicit, valid sourceType');
eq([by.state.sourceType, by.unnews.sourceType, by.eeas.sourceType], ['government', 'international-organisation', 'eu-institution'], 'the three candidates have the three official types');
ok(['bbc', 'dw', 'france24', 'aljazeera'].every(k => by[k] && by[k].enabled === false && by[k].sourceType === 'journalism'), 'BBC, DW, France 24 and Al Jazeera stay disabled and are publisher reporting');
ok(!PUBLISHERS.some(p => /reuters/i.test(p.id + p.name)), 'Reuters has no entry (no official feed exists)');
eq(by.state.feeds.map(f => f.url), ['https://www.state.gov/rss-feed/press-releases/feed/'], 'State Department feed address is exactly the approved candidate');
eq(by.unnews.feeds.map(f => f.url), ['all/rss.xml', 'topic/peace-and-security/feed/rss.xml', 'region/europe/feed/rss.xml', 'region/asia-pacific/feed/rss.xml', 'region/americas/feed/rss.xml', 'region/middle-east/feed/rss.xml'].map(x => 'https://news.un.org/feed/subscribe/en/news/' + x), 'UN News candidates are the six addresses from the audit');
eq(by.eeas.feeds, [], 'EEAS has no feed address (none is invented)'); eq(by.eeas.discoverUrl, 'https://www.eeas.europa.eu/', 'EEAS uses feed discovery on its home page');
for (const k of ['state', 'unnews', 'eeas']) {
  const p = by[k];
  ok(Array.isArray(p.blockers) && p.blockers.length >= 2, `${k}: unresolved items are listed in blockers`);
  ok(/^2026-11-27$/.test(p.readOn) && p.reuse && /UNRESOLVED/.test(p.automatedFetching) && p.feedAddressSource && p.attribution, `${k}: reuse conditions, attribution, automated-fetching status and feed provenance are documented`);
  ok(p.evidence.length >= 1 && p.evidence.every(e => /^https:\/\//.test(e.url) && e.what), `${k}: evidence links present`);
  ok(/NOT CLEARED/.test(p.termsNote), `${k}: termsNote says not cleared`);
  ok(p.hosts.every(h => !h.includes('/')) && p.feeds.every(f => new URL(f.url).hostname.endsWith(p.feedHosts[0])), `${k}: feeds are on the publisher's own host`);
}
ok(['state', 'unnews', 'eeas'].every(k => /Not independently|not independently/.test(by[k].termsNote) || /labelled/.test(by[k].termsNote)), 'termsNotes say the content is labelled/not independently verified');
const docs = fs.readFileSync(path.join(ROOT, 'docs/rss-source-permissions.md'), 'utf8');
ok(['state', 'unnews', 'eeas'].every(k => docs.includes(by[k].evidence[0].url)), 'docs/rss-source-permissions.md carries each candidate\'s evidence URL');
ok(/2026-11-27/.test(docs) && /technical verification is not legal permission/i.test(docs), 'the doc has the verification date and the technical-vs-legal warning');

// ============ B. source types ============
sec('B. Source types');
ok(isOfficial('government') && isOfficial('international-organisation') && isOfficial('eu-institution') && !isOfficial('journalism') && !isOfficial(undefined) && !isOfficial('nonsense'), 'only the three official types count as official');
ok(Object.values(SOURCE_TYPES).every(t => t.label && t.note), 'every type has a label and a note');
eq(Object.values(SOURCE_TYPES).map(t => t.label), ['Publisher reporting', 'Government communications', 'International organization communications', 'EU institutional communications'], 'labels as requested');
ok(Object.values(SOURCE_TYPES).filter(t => t.official).every(t => /not independently verified/.test(t.note) && /not independent corroboration/.test(t.note)), 'every official note says: not independently verified, not independent corroboration');

// ============ C. robots.txt parser ============
sec('C. robots.txt parser');
const dec = (txt, p, tok = 'GlobalRiskMonitor') => robotsDecision(parseRobots(txt), tok, p);
ok(dec('User-agent: *\nDisallow: /private', '/rss.xml').allowed && !dec('User-agent: *\nDisallow: /private', '/private/x').allowed, 'basic Disallow');
ok(dec('User-agent: *\nDisallow: /\nAllow: /rss', '/rss/feed.xml').allowed && !dec('User-agent: *\nDisallow: /\nAllow: /rss', '/other').allowed, 'longest match wins (Allow beats a shorter Disallow)');
ok(dec('User-agent: *\nDisallow: /a\nAllow: /a', '/a').allowed, 'equal length: Allow wins');
ok(dec('User-agent: *\nDisallow:', '/x').allowed, 'an empty Disallow allows everything');
ok(!dec('User-agent: *\nDisallow: /*.xml$', '/feed.xml').allowed && dec('User-agent: *\nDisallow: /*.xml$', '/feed.xml?x=1').allowed, 'wildcard and end anchor');
ok(!dec('User-agent: globalriskmonitor\nDisallow: /\nUser-agent: *\nAllow: /', '/x').allowed, 'a group for our own name beats "*"');
ok(dec('User-agent: otherbot\nDisallow: /\n', '/x').allowed, 'a group for another bot does not apply to us');
eq(dec('User-agent: *\nCrawl-delay: 7\nDisallow: /z', '/x').crawlDelay, 7, 'Crawl-delay is read');
ok(!dec('# c\nUser-agent: a\nUser-agent: *\nDisallow: /x # trailing', '/x').allowed, 'several User-agent lines share one group; comments ignored');
ok(dec('', '/x').allowed && dec('garbage <html>', '/x').allowed, 'an empty or junk file restricts nothing');

// ============ D. feed helpers ============
sec('D. Feed format and field audit');
eq(feedFormat('<?xml version="1.0"?><rss version="2.0"><channel><title>T &amp; U</title></channel></rss>'), { format: 'RSS 2.0', title: 'T & U' }, 'RSS 2.0 detected with its title');
eq(feedFormat('<rdf:RDF xmlns:rdf="x"><channel><title>D</title></channel></rdf:RDF>').format, 'RSS 1.0 (RDF)', 'RDF detected');
eq(feedFormat('<feed xmlns="http://www.w3.org/2005/Atom"><title>A</title></feed>').format, 'Atom', 'Atom detected');
{
  const pub = { hosts: ['example.test'] }, es = [{ title: 'a', link: 'https://example.test/1', dateRaw: 'Fri, 20 Nov 2026 06:00:00 GMT' }, { title: '', link: 'https://example.test/2', dateRaw: '' }, { title: 'c', link: 'https://elsewhere.test/3', dateRaw: '2026-11-19T01:00:00Z' }, { title: 'd', link: 'nope', dateRaw: '5' }];
  const a = auditEntries(es, { publisher: pub, now: Date.parse('2026-11-20T08:00:00Z') });
  eq([a.entries, a.valid, a.headline, a.link, a.ownLink, a.date, a.newest, a.oldest], [4, 1, 3, 3, 2, 2, '2026-11-20T06:00:00.000Z', '2026-11-19T01:00:00.000Z'], 'entry audit counts headline, address, own-site address, date, newest and oldest');
}

// ============ E. mock server ============
sec('E. Verify and fetch against a local mock server (simulated)');
let PORT = 0, hits = {}, M = {};
const rss = (items, title = 'Fake official feed') => `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${title}</title>${items}</channel></rss>`;
const it = (t, l, d, desc = '') => `<item><title>${t}</title><link>${l}</link>${d ? `<pubDate>${d}</pubDate>` : ''}${desc ? `<description>${desc}</description>` : ''}</item>`;
const B = () => `http://127.0.0.1:${PORT}`;
const official = () => rss([it('Secretary meets Chinese counterpart on sanctions', `${B()}/p/1`, 'Fri, 20 Nov 2026 06:00:00 GMT', 'FULL BODY TEXT MUST NEVER BE STORED <img src="x">'), it('Statement on Taiwan Strait', `${B()}/p/2`, 'Fri, 20 Nov 2026 05:00:00 GMT'), it('Statement on Ukraine and Russia talks', `${B()}/p/3`, 'Fri, 20 Nov 2026 04:00:00 GMT')].join(''));
const server = http.createServer((req, res) => {
  const p = req.url.split('?')[0]; hits[p] = (hits[p] || 0) + 1;
  const send = (c, b, h = {}) => { res.writeHead(c, { 'Content-Type': 'application/xml', ...h }); res.end(b); };
  if (p === '/robots.txt') { const r = M.robots; if (r === undefined) return send(404, 'none'); if (typeof r === 'number') return send(r, 'x', { 'Content-Type': 'text/plain' }); return send(200, r, { 'Content-Type': 'text/plain' }); }
  if (p === '/feed.xml') return send(200, official(), { 'X-Robots-Tag': 'noarchive' });
  if (p === '/forbidden.xml') return send(403, 'blocked');
  if (p === '/redir.xml') { res.writeHead(301, { Location: '/feed.xml' }); return res.end(); }
  if (p === '/home') return send(200, '<html><head><link rel="alternate" type="application/rss+xml" href="/feeds/eeas.xml"></head></html>', { 'Content-Type': 'text/html' });
  send(404, 'unknown');
});
await new Promise(r => server.listen(0, '127.0.0.1', r)); PORT = server.address().port;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'off-test-')); let n = 0;
const realCfg = pathToFileURL(path.join(ROOT, 'data', 'rss-sources.mjs')).href;
const settings = { retentionDays: 7, maxItems: 400, timeoutMs: 15000, maxTries: 3, retryBaseMs: 30, gapMs: 0, maxBytes: 5242880 };
const pub = (id, name, feeds, extra = {}) => ({ id, name, hosts: ['127.0.0.1'], feedHosts: ['127.0.0.1'], sourceType: 'government', enabled: false, termsChecked: null, termsNote: 't', feeds: feeds.map(([f, p]) => ({ id: f, label: f, url: B() + p })), ...extra });
function run(pubs, args, { out = null, env = {} } = {}) {
  const cfg = path.join(TMP, `cfg${++n}.mjs`), o = out || path.join(TMP, `out${n}`);
  fs.writeFileSync(cfg, `export { COUNTRY_TERMS } from '${realCfg}';\nexport const SETTINGS = ${JSON.stringify(settings)};\nexport const PUBLISHERS = ${JSON.stringify(pubs)};\n`);
  return new Promise(resolve => {
    let log = ''; const c = spawn('node', [path.join(ROOT, 'scripts', 'fetch-rss.mjs'), ...args, '--out=' + o], { env: { ...process.env, RSS_CONFIG: cfg, RSS_ALLOW_HTTP: '1', RSS_NOW: '2026-11-20T08:00:00Z', RSS_GAP_MS: '0', RSS_RETRY_BASE_MS: '30', GITHUB_STEP_SUMMARY: path.join(TMP, 'summary' + n + '.md'), ...env } });
    c.stdout.on('data', d => log += d); c.stderr.on('data', d => log += d);
    c.on('close', code => { let cache = null; try { cache = JSON.parse(fs.readFileSync(path.join(o, 'news-rss.json'), 'utf8')); } catch {} let summary = ''; try { summary = fs.readFileSync(path.join(TMP, 'summary' + n + '.md'), 'utf8'); } catch {} resolve({ code, log, cache, summary, out: o, cfg }); });
  });
}
const BL = ['Unresolved test item'];
const reset = () => { hits = {}; M = {}; };

// ---- verify: the report ----
reset();
let r = await run([pub('st', 'Test Department', [['st-1', '/feed.xml']], { blockers: BL })], ['--verify']);
ok(r.code === 0 && /OK\s+st-1\s+HTTP 200/.test(r.log), 'verify: working feed reported OK with HTTP status');
ok(/final address: http:\/\/127\.0\.0\.1:\d+\/feed\.xml \(no redirect\)/.test(r.log), 'verify: final address printed');
ok(/format: RSS 2\.0, feed title: "Fake official feed"/.test(r.log), 'verify: RSS version and feed title printed');
ok(/fields in 3 entries: headline 3, original article address 3 \(3 on the publisher's own site\), publication date 3/.test(r.log), 'verify: headline / own-site link / date availability printed');
ok(/publisher name is not given per entry: taken from the configuration \("Test Department"\)/.test(r.log), 'verify: says where the publisher name comes from');
ok(/newest 2026-11-20T06:00:00\.000Z, oldest 2026-11-20T04:00:00\.000Z/.test(r.log), 'verify: newest and oldest publication date printed');
ok(/X-Robots-Tag: noarchive/.test(r.log), 'verify: X-Robots-Tag header is reported');
ok(/robots\.txt: .*no robots\.txt \(HTTP 404\)/.test(r.log), 'verify: robots.txt result printed (none published)');
ok(/type: Government communications/.test(r.log) && /permission review: NOT CLEARED/.test(r.log) && /Unresolved test item/.test(r.log), 'verify: source type and unresolved items printed');
ok(!/sample:/.test(r.log) && !/Secretary meets/.test(r.log), 'verify: NO headline text is printed for a source whose permission is unresolved');
ok(/NOT legal permission/.test(r.log), 'verify: says technical verification is not legal permission');
ok(r.cache === null, 'verify: writes no cache'); ok(/### Detail per feed/.test(r.summary) && /Government communications/.test(r.summary) && !/Secretary meets/.test(r.summary), 'verify: step summary has the detail table and no headline text');
ok(!fs.existsSync(path.join(r.out, 'news-rss.json')), 'verify: public RSS cache file not created');
{ const src = fs.readFileSync(path.join(ROOT, 'scripts/fetch-rss.mjs'), 'utf8'); ok((src.match(/writeFileSync|appendFileSync|renameSync/g) || []).length === 3 && /writeFileSync\(FILE \+ '\.tmp'/.test(src) && /appendFileSync\(process\.env\.GITHUB_STEP_SUMMARY/.test(src) && (src.match(/\bCONFIG\b/g) || []).length === 2, 'the script only ever writes the cache file and the run summary, and only reads the config: it cannot edit enabled or termsChecked'); }
// ---- verify: redirect ----
reset(); r = await run([pub('st', 'Test Department', [['st-r', '/redir.xml']])], ['--verify']);
ok(/\(1 redirect\)/.test(r.log) && /final address: http:\/\/127\.0\.0\.1:\d+\/feed\.xml \(redirect followed/.test(r.log), 'verify: final address after a permitted redirect is shown');
ok(/sample:/.test(r.log), 'verify: a publisher WITHOUT unresolved items still shows samples (earlier behaviour kept)');
// ---- verify: 403 is not bypassed ----
reset(); r = await run([pub('st', 'Test Department', [['st-403', '/forbidden.xml']], { blockers: BL })], ['--verify']);
ok(r.code === 2 && /FAIL\s+st-403\s+HTTP 403/.test(r.log) && /ACCESS RESTRICTED/.test(r.log) && /not bypassed/.test(r.log), 'verify: HTTP 403 reported as an access restriction');
eq(hits['/forbidden.xml'], 1, 'verify: a 403 is requested exactly once (no retry, no other attempt)');
// ---- robots.txt: disallow, 403, unreadable, allow, crawl-delay ----
reset(); M.robots = 'User-agent: *\nDisallow: /feed.xml\n'; r = await run([pub('st', 'Test Department', [['st-1', '/feed.xml']])], ['--verify']);
ok(r.code === 2 && /FAIL\s+st-1\s+.*DISALLOWS/.test(r.log) && !hits['/feed.xml'], 'verify: robots.txt Disallow stops the request (feed never requested)');
reset(); M.robots = 403; r = await run([pub('st', 'Test Department', [['st-1', '/feed.xml']])], ['--verify']);
ok(r.code === 2 && /HTTP 403: access is restricted/.test(r.log) && !hits['/feed.xml'], 'verify: robots.txt answering 403 is treated as restricted, feed not requested');
reset(); M.robots = 500; r = await run([pub('st', 'Test Department', [['st-1', '/feed.xml']])], ['--verify'], { env: { RSS_MAX_TRIES: '1' } });
ok(r.code === 2 && /robots\.txt could not be read/.test(r.log) && !hits['/feed.xml'], 'verify: unreadable robots.txt (HTTP 500) means the feed is not requested');
reset(); M.robots = 'User-agent: *\nDisallow: /private\nAllow: /feed.xml\nCrawl-delay: 1\n'; { const t0 = Date.now(); r = await run([pub('st', 'Test Department', [['st-1', '/feed.xml'], ['st-2', '/redir.xml']])], ['--verify']); ok(r.code === 0 && /Crawl-delay 1 s honoured/.test(r.log) && Date.now() - t0 >= 1000, 'verify: an explicit Allow is honoured and Crawl-delay slows the requests'); }
eq(hits['/robots.txt'], 1, 'robots.txt is requested once per host per run');
// ---- discovery goes through robots.txt too ----
reset(); r = await run([pub('ee', 'Test EEAS', [], { sourceType: 'eu-institution', discoverUrl: B() + '/home', blockers: BL })], ['--verify']);
ok(/feed discovery on .*: 1 candidate/.test(r.log) && /candidate: http:\/\/127\.0\.0\.1:\d+\/feeds\/eeas\.xml/.test(r.log) && r.cache === null, 'verify: EEAS-style discovery prints candidates only and writes nothing');
reset(); M.robots = 'User-agent: *\nDisallow: /home\n'; r = await run([pub('ee', 'Test EEAS', [], { discoverUrl: B() + '/home' })], ['--verify']);
ok(/feed discovery failed: .*DISALLOWS/.test(r.log) && !hits['/home'], 'verify: robots.txt also protects the discovery page');

// ---- fetch: unresolved items block even an enabled publisher ----
reset(); r = await run([pub('st', 'Test Department', [['st-1', '/feed.xml']], { enabled: true, termsChecked: '2026-11-27', blockers: BL })], ['--fetch']);
ok(r.code === 3 && /REFUSED: Test Department .* unresolved permission item/.test(r.log) && r.cache === null && !hits['/feed.xml'] && !hits['/robots.txt'], 'fetch: enabled + termsChecked + unresolved blockers = refused, no request at all, nothing written');
// ---- fetch: cleared official source ----
reset(); const C0 = pub('st', 'Test Department', [['st-1', '/feed.xml']], { enabled: true, termsChecked: '2026-11-27', blockers: [] });
r = await run([C0], ['--fetch']); const c = r.cache;
ok(r.code === 0 && c && c.items.length === 3, 'fetch: a source with no blockers, enabled and dated is fetched');
ok(c.items.every(i => i.sourceType === 'government'), 'fetch: every item is stored with its sourceType');
ok(c.publishers[0].sourceType === 'government' && c.sourceTypes.government.label === 'Government communications' && c.sourceTypes.journalism.label === 'Publisher reporting', 'fetch: the cache carries publisher type and the label wording');
const ALLOWED = new Set(['title', 'url', 'publisher', 'publisherId', 'sourceType', 'feedId', 'published', 'matches', 'firstSeenAt', 'lastSeenAt', 'relevance', 'source', 'variants', 'variantsTotal', 'filtered']);
ok(c.items.every(i => Object.keys(i).every(k => ALLOWED.has(k))), 'fetch: stored fields are only headline, address, publisher, type, date, matches and rule results');
ok(!JSON.stringify(c).includes('FULL BODY TEXT') && !/<img|logo|seal|\.png|\.jpg/i.test(JSON.stringify(c.items)), 'fetch: no article body, image, logo or seal is stored');
eq(hits['/robots.txt'], 1, 'fetch: robots.txt read once');
// ---- fetch: robots.txt disallow keeps cached articles ----
const keep = path.join(TMP, 'keep'); await run([C0], ['--fetch'], { out: keep });
reset(); M.robots = 'User-agent: *\nDisallow: /feed.xml\n'; r = await run([C0], ['--fetch'], { out: keep });
ok(r.code === 2 && /DISALLOWS/.test(r.cache.feeds['st-1'].error) && r.cache.items.length === 3 && !hits['/feed.xml'], 'fetch: robots.txt Disallow keeps the cached articles, records the reason, makes no feed request');
reset(); r = await run([pub('st', 'Test Department', [['st-403', '/forbidden.xml']], { enabled: true, termsChecked: '2026-11-27', blockers: [] })], ['--fetch']);
ok(r.code === 2 && /HTTP 403 \(access restricted: not bypassed\)/.test(r.cache.feeds['st-403'].error) && hits['/forbidden.xml'] === 1, 'fetch: a 403 is recorded as restricted and requested once');
// ---- unknown sourceType is refused ----
reset(); r = await run([pub('x', 'X', [['x-1', '/feed.xml']], { sourceType: 'ministry' })], ['--verify']);
ok(r.code === 1 && /unknown sourceType "ministry"/.test(r.log) && !hits['/feed.xml'], 'an unknown sourceType stops the script before any request');

// ============ F. official items are not corroboration; not in briefs; not in risk ============
sec('F. Duplicates, briefs and risk');
const matchers = buildMatchers(COUNTRY_TERMS), compiled = compileRules(RULES), NOW = Date.parse('2026-11-20T08:00:00Z');
const mk = (title, publisher, publisherId, sourceType, url, extra = {}) => ({ title, url, publisher, publisherId, sourceType, feedId: 'f', published: '2026-11-20T06:00:00.000Z', firstSeenAt: '2026-11-20T06:30:00.000Z', matches: {}, ...extra });
const H = 'China imposes new sanctions on US defense firms';
let out = refreshItems([mk(H, 'Outlet A', 'a', 'journalism', 'https://a.test/1'), mk(H, 'U.S. Department of State', 'state', 'government', 'https://www.state.gov/x'), mk(H, 'UN News', 'unnews', 'international-organisation', 'https://news.un.org/y')], { matchers, compiled });
eq(out.items.length, 3, 'same headline from a news outlet, a government and the UN stays three separate items (not merged)');
ok(out.items.every(i => !i.variants), 'no official item appears as "also reported by", and no outlet lists an official body as a variant');
out = refreshItems([mk(H, 'Outlet A', 'a', 'journalism', 'https://a.test/1'), mk(H, 'Outlet B', 'b', 'journalism', 'https://b.test/1'), mk(H, 'Outlet C', 'c', undefined, 'https://c.test/1')], { matchers, compiled });
eq(out.items.length, 1, 'publisher reporting (and old items without a type) is still grouped exactly as before');
out = refreshItems([mk(H, 'UN News', 'unnews', 'international-organisation', 'https://news.un.org/1'), mk(H, 'UN News', 'unnews', 'international-organisation', 'https://news.un.org/2')], { matchers, compiled });
eq(out.items.length, 1, 'two items of the SAME official publisher can still be grouped');
// briefs
const reps = [mk('China warns US over new chip curbs and sanctions', 'Outlet A', 'a', 'journalism', 'https://a.test/10'), mk('Russia and Ukraine hold talks on sanctions', 'Outlet B', 'b', 'journalism', 'https://b.test/11'), mk('China warns US over new chip curbs and sanctions', 'U.S. Department of State', 'state', 'government', 'https://www.state.gov/z')];
const cacheOf = items => ({ schema: 1, lastSuccessAt: '2026-11-20T07:00:00Z', checkedAt: '2026-11-20T07:00:00Z', feeds: { f: { status: 'ok' } }, items });
const withOff = buildAll({ caches: { gdelt: 0, rss: cacheOf(reps) }, prev: null, now: NOW, R: BRIEF_RULES, countryTerms: COUNTRY_TERMS, rules: RULES });
const without = buildAll({ caches: { gdelt: 0, rss: cacheOf(reps.slice(0, 2)) }, prev: null, now: NOW, R: BRIEF_RULES, countryTerms: COUNTRY_TERMS, rules: RULES });
ok(withOff.countries.CHN.sources.every(s => !/State/.test(s.publisher)), 'briefs: the official item is not listed as a source');
eq(withOff.countries.CHN.reportsFound, without.countries.CHN.reportsFound, 'briefs: the official item does not change the report count');
ok(withOff.countries.CHN.limitations.some(l => /1 official communication/.test(l) && /not independent reporting/.test(l)), 'briefs: the exclusion is stated in the limitations');
ok(withOff.itemStats.officialExcluded === 1 && !('officialExcluded' in without.itemStats), 'briefs: the counter exists only when something was excluded (briefs.json unchanged otherwise)');
eq(JSON.stringify(withOff.countries.CHN.developments), JSON.stringify(without.countries.CHN.developments), 'briefs: developments are identical with and without the official item');
// risk
for (const f of ['scripts/risk-lib.mjs', 'scripts/build-risk.mjs', 'scripts/fetch-risk-inputs.mjs']) { const t = fs.readFileSync(path.join(ROOT, f), 'utf8'); ok(!/news-rss|rss-sources|sourceType|source-types|news-gdelt/.test(t), `risk: ${f} does not read the RSS cache, the RSS config or source types (its only news context is briefs.json, which excludes official items)`); }

// ============ G. protected files and page code ============
sec('G. Protected files and page code');
// Stage 8B-2: risk-lib and fetch-risk-inputs were changed again on purpose (profiles, optional verify-only probe); update-risk.yml is pinned to the PRODUCTION copy (schedule enabled at 05:41 UTC and pages: write, both added by the owner after Stage 8B-1; it is not part of any ZIP).
// Stage 8B-1: scripts/risk-lib.mjs and scripts/fetch-risk-inputs.mjs were changed on purpose (see README, Stage 8B-1); their pinned hashes below were updated accordingly. Everything else is still pinned to Stage 7C.
const PROTECT = { 'js/globe.js': 'c8c9ebaff9c79cd3a2a09d1f0aea9f8b', 'css/style.css': '32e647502e6ded7fa6554f9f274fad4a', 'scripts/fetch-data.mjs': '32bad48326c2c8f625829c889968022e', 'scripts/risk-lib.mjs': '142d47abe44af19e86ebde4b112419ee',
  'scripts/build-risk.mjs': '81f99390ba35805ed6e923de4fca8d78', 'scripts/fetch-risk-inputs.mjs': '6fab07996cf7db368084e58e862b08d5', 'scripts/fetch-gdelt-files.mjs': '9a41f9bab9ba565a8676ea868184bd26',
  '.github/workflows/update-data.yml': '881ec1134f3a1619305817c05efa6a29', '.github/workflows/update-risk.yml': 'e223da77124f96890777f57be392bf5c', '.github/workflows/update-rss.yml': 'e3e18101cef4c7775ddbada20c1a67b3' };
for (const [f, h] of Object.entries(PROTECT)) ok(md5(f) === h, `unchanged: ${f}`);
ok(/cron: '23 \*\/3 \* \* \*'/.test(fs.readFileSync(path.join(ROOT, '.github/workflows/update-rss.yml'), 'utf8')), 'schedule unchanged (every 3 hours)');
const app = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
ok(/const isOff = a =>/.test(app) && /Official communications \(/.test(app) && /not independently verified/.test(app), 'page: official items are labelled and listed apart');
ok(!/el\('img'|createElement\('img'|<img/.test(app + fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')), 'page: no image element anywhere (no logos, seals or pictures from feeds)');
ok(!/\.description|\.summary\b|\.content\b/.test(fs.readFileSync(path.join(ROOT, 'scripts/rss-lib.mjs'), 'utf8').split('export function buildItems')[1].split('export function mergeItems')[0].replace(/e\.summary/g, '')), 'buildItems never copies a description or content field');

// ============ H. Stage 7C: UN Geneva candidates, live results, nothing published ============
sec('H. UN Geneva candidates and live results (configuration checks)');
const ug = by.ungeneva;
eq(ug.feeds.map(f => f.url), ['press-releases-list', 'meeting-summaries-list', 'press-conferences-list', 'briefings-list', 'press-items-list'].map(x => `https://www.ungeneva.org/news-media/${x}/rss.xml`), 'UN Geneva has exactly the five supplied candidate addresses');
ok(ug.enabled === false && ug.termsChecked === null && ug.blockers.length >= 4, 'UN Geneva: disabled, termsChecked null, unresolved items listed');
ok(ug.sourceType === 'international-organisation' && ug.discoverUrl === 'https://www.ungeneva.org/en/rss', 'UN Geneva: type and discovery page');
ok(ug.evidence.some(e => e.url === 'https://www.ungeneva.org/en/news-media/rss' && /display the latest news from UN Geneva/.test(e.what)), 'UN Geneva: the official statement is quoted with its page');
ok(/UNRESOLVED/.test(ug.automatedFetching) && /not assumed|NOT assumed|does not transfer/.test(ug.termsNote + ug.reuse + ug.automatedFetching), 'UN Geneva: automated fetching unresolved and UN News permission explicitly not assumed');
ok(ug.evidence.filter(e => /DIFFERENT SITE/.test(e.what)).length === 2, 'UN Geneva: the two other UN Geneva sites are recorded as different sites, not as its terms');
ok(ug.feeds.every(f => new URL(f.url).hostname === 'www.ungeneva.org'), 'UN Geneva: every feed is on its own host');
for (const k of ['state', 'unnews', 'eeas']) ok(by[k].liveVerification && by[k].liveVerification.date === '2026-11-27' && /GitHub Actions/.test(by[k].liveVerification.source) && by[k].blockers[0].startsWith('LIVE RESULT 2026-11-27'), `${k}: the live Stage 7B result is recorded as the first blocker`);
ok(/403/.test(by.state.liveVerification.result) && /all 6/.test(by.unnews.liveVerification.result) && /zero candidate/.test(by.eeas.liveVerification.result), 'live results recorded as reported: State 403, UN News 6 disallowed, EEAS zero candidates');
ok(/UN Geneva/.test(docs) && /11 candidate/.test(docs) && /12 of 19/.test(docs) && /not assumed to have the same permissions as UN News/i.test(docs), 'docs record the live results and the UN Geneva findings');
{ const o = path.join(TMP, 'real-fetch'); const rr = await new Promise(res => { let l = ''; const c = spawn('node', [path.join(ROOT, 'scripts/fetch-rss.mjs'), '--fetch', '--out=' + o], { env: { ...process.env, GITHUB_STEP_SUMMARY: '' } }); c.stdout.on('data', d => l += d); c.on('close', code => res({ code, l })); });
  ok(rr.code === 3 && /No publisher is enabled/.test(rr.l) && !fs.existsSync(o), 'the REAL configuration in fetch mode requests nothing, publishes nothing and writes no cache (exit 3)'); }
ok(!fs.existsSync(path.join(ROOT, 'data/cache/news-rss.json')), 'no news-rss.json cache exists in the project');

server.close(); fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n${pass} checks passed${fail ? ', ' + fail + ' FAILED' : ''}. Reminder: simulated only; no real publisher, no real feed and no GitHub Action was involved.`);
process.exit(fail ? 1 : 0);
