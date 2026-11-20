// SIMULATED tests for the RSS pipeline. They use fake feeds served by a local mock server. No real publisher is contacted.
// Run:  node tests/test-rss.mjs
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as L from '../scripts/rss-lib.mjs';
import { COUNTRY_TERMS } from '../data/rss-sources.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL: ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`);

// ---------------- unit tests ----------------
const NOW = Date.parse('2026-11-20T08:00:00Z');
// dates
eq(L.parseDate('Fri, 20 Nov 2026 06:00:00 GMT', NOW), '2026-11-20T06:00:00.000Z', 'RFC 822 date');
eq(L.parseDate('Fri, 20 Nov 2026 13:00:00 +0700', NOW), '2026-11-20T06:00:00.000Z', 'RFC 822 date with offset');
eq(L.parseDate('2026-11-20T05:00:00Z', NOW), '2026-11-20T05:00:00.000Z', 'ISO date');
eq(L.parseDate('5', NOW), null, 'junk "5" is not a date');
eq(L.parseDate('', NOW), null, 'empty date');
eq(L.parseDate('Wed, 20 Nov 2030 06:00:00 GMT', NOW), null, 'future date rejected');
eq(L.parseDate('Mon, 01 Jan 1999 00:00:00 GMT', NOW), null, 'date before 2000 rejected');
eq(L.parseDate('Mon, 32 Nov 2026 00:00:00 GMT', NOW), null, 'impossible date rejected');
ok(L.parseDate('Fri, 20 Nov 2026 08:30:00 GMT', NOW) !== null, 'up to 1 h ahead tolerated (clock skew)');
// links and duplicates
eq(L.urlKey('https://www.example.com/a/b/?utm_source=x&at_medium=y#top'), L.urlKey('http://example.com/a/b'), 'tracking parameters, www, fragment, slash ignored');
ok(L.urlKey('https://example.com/a?id=1') !== L.urlKey('https://example.com/a?id=2'), 'meaningful query parameters kept');
eq(L.urlKey('javascript:alert(1)'), null, 'javascript: link rejected');
eq(L.safeUrl('ftp://example.com/x'), null, 'non-http link rejected');
eq(L.titleKey('bbc', 'Russia launches "new" strikes!'), L.titleKey('bbc', ' russia launches new   strikes'), 'headline key ignores case and punctuation');
ok(L.titleKey('bbc', 'X') !== L.titleKey('dw', 'X'), 'same headline at two publishers is not merged');
eq(L.hostAllowed('feeds.bbci.co.uk', ['bbci.co.uk']), true, 'sub-domain of an allowed host');
eq(L.hostAllowed('evilbbci.co.uk', ['bbci.co.uk']), false, 'look-alike host rejected');
// text decoding
eq(L.clean('<![CDATA[Tom &amp; Jerry <b>x</b>]]>'), 'Tom &amp; Jerry x', 'CDATA is literal, markup removed');
eq(L.clean('Taiwan&#8217;s &amp; Kyiv &#x41;'), 'Taiwan’s & Kyiv A', 'entities decoded once');
// country matching
const M = L.buildMatchers(COUNTRY_TERMS), mt = (t, s) => L.matchCountries(M, t, s);
const ids = o => Object.keys(o).sort().join(',');
eq(ids(mt('China warns US over chip curbs')), 'CHN,USA', 'China + US in one headline');
eq(ids(mt("Taiwan's president meets envoy")), 'TWN', 'possessive matches');
eq(ids(mt('Washington state wildfire spreads')), '', '"Washington" alone is not a match');
eq(ids(mt('Chinatown festival returns')), '', 'whole words only (Chinatown)');
eq(ids(mt('Let us talk about it')), '', 'lowercase "us" is not the US');
eq(ids(mt('US-China trade talks resume')), 'CHN,USA', 'hyphenated US-China matches both');
eq(ids(mt('Putin visits Beijing')), 'CHN,RUS', 'two countries');
eq(ids(mt('Kyiv and Kiev spellings')), 'UKR', 'both spellings of the capital');
eq(ids(mt('Cyprus talks')), '', 'no false match');
eq(mt('Markets rally', 'Investors watch the US Federal Reserve.').USA, { level: 'summary', terms: ['US'] }, 'summary-only match labelled summary');
eq(mt('Taiwan holds drills', 'China responds').CHN.level, 'summary', 'headline country is headline, other is summary');
eq(mt('Taiwan holds drills', 'China responds').TWN.level, 'headline', 'headline level');

// ---------------- fixtures ----------------
let PORT = 0, hits = {}, mode = {};
const rss = items => `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:media="http://search.yahoo.com/mrss/"><channel><title>Fake</title>${items}</channel></rss>`;
const it = (title, link, date, desc = '') => `<item><title>${title}</title>${link === null ? '' : `<link>${link}</link>`}${date === null ? '' : `<pubDate>${date}</pubDate>`}${desc ? `<description>${desc}</description>` : ''}<media:title>IGNORED</media:title></item>`;
const B = () => `http://127.0.0.1:${PORT}`;
const goodFeed = () => rss([
  it('China warns US over chip curbs', `${B()}/news/a1?utm_source=x`, 'Fri, 20 Nov 2026 06:00:00 GMT'),
  it('<![CDATA[Taiwan\'s president & Kyiv talks]]>', `${B()}/news/a2`, 'Fri, 20 Nov 2026 05:00:00 GMT'),
  it('Ukraine &amp; Russia hold talks', `${B()}/news/a3`, 'Fri, 20 Nov 2026 04:00:00 GMT'),
  it('Local football results', `${B()}/news/a4`, 'Fri, 20 Nov 2026 04:00:00 GMT'),
  it('China warns US over chip curbs (updated)', `${B()}/news/a1/?utm_medium=y#c`, 'Fri, 20 Nov 2026 06:30:00 GMT'),   // same link: duplicate
  it('Russia launches new strikes', `${B()}/news/b1`, 'Fri, 20 Nov 2026 03:00:00 GMT'),
  it('Russia launches new strikes!', `${B()}/news/b2`, 'Fri, 20 Nov 2026 03:10:00 GMT'),                               // same headline, other link: duplicate
  it('Taiwan story on another site', 'http://evil.example.net/x', 'Fri, 20 Nov 2026 03:00:00 GMT'),                      // off-site link: rejected
  it('Taiwan holds drills', `${B()}/news/c1`, 'Wed, 20 Nov 2030 06:00:00 GMT'),                                           // future date: shown without a date
  it('Putin visits Beijing', `${B()}/news/c2`, '5'),                                                                       // junk date
  it('Link missing but Ukraine named', null, 'Fri, 20 Nov 2026 03:00:00 GMT'),
  it('Ukraine old story', `${B()}/news/old`, 'Sun, 01 Nov 2026 03:00:00 GMT'),                                            // older than 7 days: dropped
  it('Markets rally on rate hopes', `${B()}/news/s1`, 'Fri, 20 Nov 2026 02:00:00 GMT', 'Investors watch the US Federal Reserve.'),
  it('Washington state wildfire spreads', `${B()}/news/w1`, 'Fri, 20 Nov 2026 02:00:00 GMT', 'Fire crews in Washington state.')
].join(''));
const dwFeed = () => `<?xml version="1.0"?><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel rdf:about="x"><title>DW</title></channel><item rdf:about="${B()}/dw/1"><title>Taipei responds to Beijing</title><link>${B()}/dw/1</link><dc:date>2026-11-20T05:00:00Z</dc:date></item></rdf:RDF>`;
const atomFeed = () => `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>A</title><entry><title>Kremlin statement on talks</title><link rel="self" href="${B()}/self"/><link rel="alternate" href="${B()}/atom/1"/><published>2026-11-20T01:00:00Z</published></entry></feed>`;
const samePub2 = () => rss(it('Russia launches new strikes', `${B()}/other/1`, 'Fri, 20 Nov 2026 03:00:00 GMT'));

const server = http.createServer((req, res) => {
  const p = req.url.split('?')[0]; hits[p] = (hits[p] || 0) + 1;
  const send = (code, body, h = {}) => { res.writeHead(code, { 'Content-Type': 'application/xml', ...h }); res.end(body); };
  if (p === '/good.xml') return mode.good === 'dead' ? send(500, 'boom') : send(200, goodFeed());
  if (p === '/dw.rdf') return send(200, dwFeed());
  if (p === '/atom.xml') return send(200, atomFeed());
  if (p === '/pub2.xml') return send(200, samePub2());
  if (p === '/html') return send(200, '<!doctype html><html><body>Sorry</body></html>', { 'Content-Type': 'text/html' });
  if (p === '/err500') return send(500, 'down');
  if (p === '/err404') return send(404, 'nope');
  if (p === '/empty.xml') return send(200, rss(''));
  if (p === '/slow') return setTimeout(() => send(200, goodFeed()), 2000);
  if (p === '/flaky') return hits[p] === 1 ? send(503, 'busy', { 'Retry-After': '0' }) : send(200, goodFeed());
  if (p === '/etag') return req.headers['if-none-match'] === 'W/"v1"' ? (res.writeHead(304), res.end()) : send(200, goodFeed(), { ETag: 'W/"v1"' });
  if (p === '/redirect') { res.writeHead(302, { Location: 'http://localhost:' + PORT + '/good.xml' }); return res.end(); }
  send(404, 'unknown');
});
await new Promise(r => server.listen(0, '127.0.0.1', r)); PORT = server.address().port;

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'rss-test-')); let n = 0;
const realCfg = pathToFileURL(path.join(ROOT, 'data', 'rss-sources.mjs')).href;
const settings = { retentionDays: 7, maxItems: 400, timeoutMs: 15000, maxTries: 3, retryBaseMs: 5000, gapMs: 0, maxBytes: 5242880 };
const pub = (id, name, feeds, extra = {}) => ({ id, name, hosts: ['127.0.0.1'], enabled: true, termsChecked: '2026-11-20', termsNote: 'test', feeds: feeds.map(([fid, p]) => ({ id: fid, label: fid, url: `http://127.0.0.1:${PORT}${p}` })), ...extra });
function run(pubs, args, { out = null, env = {}, set = {} } = {}) {
  const cfg = path.join(TMP, `cfg${++n}.mjs`), o = out || path.join(TMP, `out${n}`);
  fs.writeFileSync(cfg, `export { COUNTRY_TERMS } from '${realCfg}';\nexport const SETTINGS = ${JSON.stringify({ ...settings, ...set })};\nexport const PUBLISHERS = ${JSON.stringify(pubs)};\n`);
  return new Promise(resolve => {
    let log = ''; const c = spawn('node', [path.join(ROOT, 'scripts', 'fetch-rss.mjs'), ...args, '--out=' + o], { env: { ...process.env, RSS_CONFIG: cfg, RSS_NOW: '2026-11-20T08:00:00Z', RSS_GAP_MS: '0', RSS_RETRY_BASE_MS: '30', GITHUB_STEP_SUMMARY: '', ...env } });
    c.stdout.on('data', d => log += d); c.stderr.on('data', d => log += d);
    c.on('close', code => { let cache = null; try { cache = JSON.parse(fs.readFileSync(path.join(o, 'news-rss.json'), 'utf8')); } catch {} resolve({ code, log, cache, out: o }); });
  });
}
const KEEP = process.env.KEEP_OUT;

// parser on fixtures
eq(L.parseFeed(dwFeed()).length, 1, 'RDF (DW style) parsed');
eq(L.parseFeed(atomFeed())[0].link, `${B()}/atom/1`, 'Atom: alternate link chosen, not rel=self');
eq(L.parseFeed(goodFeed())[0].title, 'China warns US over chip curbs', 'RSS 2.0 parsed; namespaced <media:title> ignored');
let threw = ''; try { L.parseFeed('<!doctype html><html></html>'); } catch (e) { threw = e.message; } ok(/HTML/.test(threw), 'HTML page rejected as a feed');
threw = ''; try { L.parseFeed('{"a":1}'); } catch (e) { threw = e.message; } ok(/not an RSS/.test(threw), 'non-feed rejected');

// ---------- Run 1: verify mode ----------
const A = pub('a', 'Pub A', [['a-good', '/good.xml'], ['a-dw', '/dw.rdf'], ['a-atom', '/atom.xml']], { enabled: false, termsChecked: null });
const Bd = pub('b', 'Pub B', [['b-down', '/err500']], { enabled: false, termsChecked: null });
let r = await run([A, Bd], ['--verify']);
ok(r.code === 0, 'verify exits 0 when at least one feed works'); ok(/OK\s+a-good/.test(r.log) && /OK\s+a-dw/.test(r.log) && /OK\s+a-atom/.test(r.log), 'verify reports the three good feeds OK');
ok(/FAIL\s+b-down\s+HTTP 500/.test(r.log), 'verify reports the broken feed as FAIL'); ok(/RESULT: 3 of 4 feeds verified/.test(r.log), 'verify counts 3 of 4');
ok(/switched off/.test(r.log), 'verify mentions the publisher is switched off'); ok(r.cache === null, 'verify writes nothing');
ok(/off-site=1/.test(r.log), 'verify counts the off-site link'); ok(/sample: "China warns US over chip curbs"/.test(r.log), 'verify shows a real sample headline');
// ---------- Run 2: verify with nothing working ----------
r = await run([pub('b', 'Pub B', [['b-down', '/err500'], ['b-html', '/html'], ['b-404', '/err404'], ['b-empty', '/empty.xml']])], ['--verify'], { env: { RSS_MAX_TRIES: '1' } });
ok(r.code === 2, 'verify exits 2 when no feed can be verified'); ok(/NONE of the feeds could be verified/.test(r.log), 'says plainly that the system is not operational');
ok(/b-html\s+received an HTML page/.test(r.log) && /b-404\s+HTTP 404/.test(r.log) && /b-empty\s+the feed parsed but contains no entries/.test(r.log), 'each failure has its own reason');
// ---------- Run 3: fetch with nothing enabled / terms missing ----------
r = await run([A], ['--fetch']); ok(r.code === 3 && r.cache === null, 'fetch with nothing enabled: exit 3, nothing written');
r = await run([pub('a', 'Pub A', [['a-good', '/good.xml']], { termsChecked: null })], ['--fetch']); ok(r.code === 3 && /REFUSED: Pub A/.test(r.log) && r.cache === null, 'enabled without termsChecked is refused');
// ---------- Run 4: fetch with one good publisher and one broken one ----------
const PA = pub('a', 'Pub A', [['a-good', '/good.xml'], ['a-dw', '/dw.rdf'], ['a-atom', '/atom.xml']]), PB = pub('b', 'Pub B', [['b-down', '/err500']]);
r = await run([PA, PB], ['--fetch']); const c1 = r.cache;
ok(r.code === 0, 'one broken feed does not fail the run'); ok(c1 && c1.feeds['a-good'].status === 'ok' && c1.feeds['b-down'].status === 'error', 'per-feed status recorded');
ok(c1.feeds['b-down'].error === 'HTTP 500', 'error text recorded'); ok(hits['/err500'] >= 3, 'transient 500 retried (3 tries; plus earlier verify runs)');
const T = x => c1.items.map(i => i.title);
ok(T().includes('China warns US over chip curbs') && T().includes("Taiwan's president & Kyiv talks") && T().includes('Ukraine & Russia hold talks'), 'real headlines kept, CDATA and entities decoded');
eq(c1.items.filter(i => /China warns/.test(i.title)).length, 1, 'duplicate link (tracking params) merged'); eq(c1.items.filter(i => /Russia launches/.test(i.title)).length, 1, 'duplicate headline from the same publisher merged');
ok(!T().some(t => /another site/.test(t)), 'off-site link rejected'); ok(!T().some(t => /Link missing/.test(t)), 'entry without a link rejected'); ok(!T().some(t => /football/.test(t)), 'non-country article not stored');
ok(!T().some(t => /old story/.test(t)), 'article older than 7 days dropped'); ok(!T().some(t => /Washington state/.test(t)), 'ambiguous "Washington state" not matched');
const drills = c1.items.find(i => /drills/.test(i.title)), putin = c1.items.find(i => /Putin/.test(i.title));
ok(drills && drills.published === null, 'future date is not shown as a date'); ok(putin && putin.published === null, 'junk date is not shown as a date');
ok(c1.items.find(i => /Markets rally/.test(i.title)).matches.USA.level === 'summary', 'summary-only match flagged');
ok(c1.items.find(i => /China warns/.test(i.title)).matches.CHN.level === 'headline', 'headline match flagged');
ok(c1.items.every(i => i.publisher && i.url.startsWith('http://127.0.0.1') && i.title && !('summary' in i) && !('description' in i)), 'every article has publisher, link, title; no summary text stored');
ok(!JSON.stringify(c1).includes('Investors watch'), 'summary text is not in the cache file');
ok(c1.items.some(i => i.publisherId === 'a' && /Taipei/.test(i.title)) && c1.items.some(i => /Kremlin/.test(i.title) && i.url.endsWith('/atom/1')), 'RDF and Atom feeds both contribute');
ok(c1.lastSuccessAt === '2026-11-20T08:00:00.000Z', 'lastSuccessAt set'); ok(c1.terms.TWN.includes('Taiwan'), 'match terms are published in the cache');
if (KEEP) fs.cpSync(r.out, path.join(KEEP, 'mixed'), { recursive: true });
// ---------- Run 5: next run, everything fails: old articles kept and marked ----------
mode.good = 'dead';
const PA2 = pub('a', 'Pub A', [['a-good', '/good.xml']]);
r = await run([PA2], ['--fetch'], { out: r.out, env: { RSS_NOW: '2026-11-20T14:00:00Z', RSS_MAX_TRIES: '1' } });
ok(r.code === 2, 'all feeds failed: exit 2 so the run turns red'); ok(r.cache.feeds['a-good'].status === 'error', 'feed marked error');
ok(r.cache.feeds['a-good'].lastSuccessAt === '2026-11-20T08:00:00.000Z', 'last success time preserved, not overwritten by the failed attempt');
ok(r.cache.checkedAt === '2026-11-20T14:00:00.000Z', 'checkedAt moves to the failed attempt');
ok(r.cache.items.some(i => /China warns/.test(i.title)), 'previously fetched articles preserved'); ok(r.cache.items.some(i => /Taipei/.test(i.title)), 'articles from other feeds of the same publisher are kept too');
mode.good = 'ok';
if (KEEP) fs.cpSync(r.out, path.join(KEEP, 'allfail'), { recursive: true });
// ---------- Run 6: retention applies even when nothing new arrives ----------
r = await run([PA2], ['--fetch'], { out: r.out, env: { RSS_NOW: '2026-12-10T08:00:00Z' } });
ok(r.cache.items.length === 0 || r.cache.items.every(i => Date.parse(i.published || i.firstSeenAt) >= Date.parse('2026-12-03T08:00:00Z')), 'old articles expire after 7 days');
// ---------- Run 7: a publisher switched off loses its articles; other publisher untouched ----------
const PC = pub('c', 'Pub C', [['c-1', '/pub2.xml']]);
r = await run([PA, PC], ['--fetch']); const both = r.cache;
eq(both.items.filter(i => /Russia launches new strikes/.test(i.title)).map(i => i.publisherId).sort(), ['a', 'c'], 'same headline at two publishers kept as two articles');
r = await run([PA, { ...PC, enabled: false }], ['--fetch'], { out: r.out });
ok(!r.cache.items.some(i => i.publisherId === 'c'), 'articles of a switched-off publisher are removed'); ok(r.cache.items.some(i => i.publisherId === 'a'), 'other publisher unaffected');
// ---------- Run 8: second fetch does not duplicate; ETag 304 ----------
const PE = pub('e', 'Pub E', [['e-1', '/etag']]);
r = await run([PE], ['--fetch']); const e1 = r.cache.items.length; ok(e1 > 0, 'ETag feed fetched first time'); ok(r.cache.feeds['e-1'].etag === 'W/"v1"', 'ETag stored');
r = await run([PE], ['--fetch'], { out: r.out }); ok(r.cache.feeds['e-1'].notModified === true && r.cache.feeds['e-1'].status === 'ok', '304 treated as success'); eq(r.cache.items.length, e1, '304 keeps cached articles');
r = await run([PE], ['--fetch'], { out: r.out, env: { RSS_NOW: '2026-11-20T09:00:00Z' } }); eq(r.cache.items.length, e1, 'repeat run adds no duplicates');
// ---------- Run 9: retry, timeout, redirect ----------
r = await run([pub('f', 'Pub F', [['f-1', '/flaky']])], ['--fetch']); ok(r.code === 0 && r.cache.feeds['f-1'].status === 'ok' && hits['/flaky'] === 2 && /Retrying in/.test(r.log), 'a 503 is retried and then succeeds');
r = await run([pub('g', 'Pub G', [['g-1', '/slow']])], ['--fetch'], { env: { RSS_TIMEOUT_MS: '300', RSS_MAX_TRIES: '2' } }); ok(r.code === 2 && /timed out/.test(r.cache.feeds['g-1'].error), 'a slow feed times out and is reported');
r = await run([pub('h', 'Pub H', [['h-1', '/redirect']], { hosts: ['127.0.0.1'] })], ['--fetch']); ok(r.code === 2 && /redirected to a different website/.test(r.cache.feeds['h-1'].error), 'redirect to another host refused');
hits['/err404'] = 0; r = await run([pub('i', 'Pub I', [['i-1', '/err404']])], ['--fetch']); ok(hits['/err404'] === 1, 'a 404 is not retried');
// ---------- Run 10: --only ----------
r = await run([PA, PC], ['--verify', '--only=c']); ok(/c-1/.test(r.log) && !/a-good/.test(r.log), '--only limits verify to one publisher');

server.close(); fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n${pass} checks passed${fail ? ', ' + fail + ' FAILED' : ''}. Reminder: simulated only; no real publisher was contacted.`);
process.exit(fail ? 1 : 0);
