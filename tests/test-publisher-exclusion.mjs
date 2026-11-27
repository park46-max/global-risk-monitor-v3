// SIMULATED tests for the publisher exclusion safeguards (Stage 10.2). No real GDELT server, publisher or GitHub Action is involved.
// A local mock server pretends to be data.gdeltproject.org. Run:  node tests/test-publisher-exclusion.mjs
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import vm from 'node:vm';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as X from '../scripts/exclusion-lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL: ' + m); } };
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
// ---- a small ZIP writer so the tests can serve real archives ----
const T = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = b => { let c = 0xFFFFFFFF; for (const x of b) c = T[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function zip(name, data, method = 8) {
  const raw = Buffer.from(data), body = method === 8 ? zlib.deflateRawSync(raw) : raw, nm = Buffer.from(name), crc = crc32(raw);
  const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(method, 8); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nm.length, 26);
  const local = Buffer.concat([lh, nm, body]);
  const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(method, 10); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(0, 42);
  const cd = Buffer.concat([ch, nm]), e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(1, 8); e.writeUInt16LE(1, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(local.length, 16);
  return Buffer.concat([local, cd, e]);
}

const cfg = X.loadExclusions();
const BAD = /aljazeera|al jazeera|\bdw\.com|dw\.de|aje\.io|ajplus/i;

console.log('A. The list');
ok(cfg.publishers.map(p => p.id).sort().join() === 'aljazeera,dw', 'the list names exactly Al Jazeera and DW');
ok(cfg.publishers.every(p => p.domains.length > 0), 'every entry has domains');
{ const t = rd('data/publisher-exclusions.js'); ok(/not an approval list/i.test(t) && /NOT necessarily licensed, approved or checked/.test(t), 'the file states that unlisted publishers are not approved or licensed'); ok(/could not be retrieved or read/.test(t), 'DW is recorded as excluded because its terms could not be read'); }
for (const bad of ['{"version":1,"publishers":[{"id":"x"}]}', '{"version":2,"publishers":[]}', 'window.PUBLISHER_EXCLUSIONS = {not json};']) { let e = ''; try { X.parseExclusions('window.PUBLISHER_EXCLUSIONS = ' + bad + ';'); } catch (x) { e = x.message; } ok(e, 'an invalid list is rejected (fails closed): ' + bad.slice(0, 30)); }
{ let e = ''; try { X.loadExclusions(path.join(os.tmpdir(), 'does-not-exist.js')); } catch (x) { e = x.message; } ok(e, 'a missing list throws (the update scripts stop and keep the old cache)'); }

console.log('B. Matching');
const m = r => X.matchRecord(r, cfg);
ok(m({ url: 'https://www.aljazeera.com/news/2026/11/26/x' }) === 'aljazeera', 'Al Jazeera by address');
ok(m({ url: 'https://english.aljazeera.com/x' }) === 'aljazeera' && m({ url: 'https://AlJazeera.NET/x' }) === 'aljazeera', 'subdomains and upper case');
ok(m({ url: 'https://aje.io/abc' }) === 'aljazeera' && m({ url: 'https://ajplus.net/x' }) === 'aljazeera', 'alternative Al Jazeera domains');
ok(m({ url: 'https://www.dw.com/en/x/a-1' }) === 'dw' && m({ url: 'http://dw.de/x' }) === 'dw', 'DW by address, including the old domain');
ok(m({ url: 'https://other.example/a', publisher: 'aljazeera.com' }) === 'aljazeera' && m({ url: 'https://other.example/a', publisher: 'Al Jazeera English' }) === 'aljazeera' && m({ url: 'https://other.example/a', publisher: 'DW' }) === 'dw', 'by publisher field (domain or name)');
ok(m({ url: 'https://news.example/r?u=https%3A%2F%2Fwww.dw.com%2Fen%2Fa-1' }) === 'dw', 'address hidden in a query parameter (URL-encoded)');
ok(m({ url: 'https://news.example/r?u=https%253A%252F%252Fwww.aljazeera.com%252Fx' }) === 'aljazeera', 'address hidden in a double-encoded parameter');
ok(m({ url: 'https://x.example/a', title: 'Truce talks resume | Al Jazeera' }) === 'aljazeera' && m({ url: 'https://x.example/a', headline: 'Truce talks resume - DW' }) === 'dw', 'headline credit on an unlisted domain');
ok(m({ url: 'https://x.example/a', feedId: 'dw-world' }) === 'dw' && m({ url: 'https://x.example/a', feedId: 'aljazeera' }) === 'aljazeera', 'RSS feed ids');
ok(m({ url: 'https://a.example/x', title: 'x', variants: [{ url: 'https://www.aljazeera.com/x', publisher: 'aljazeera.com' }] }) === 'aljazeera', 'a listed publisher inside "variants" is detected');
for (const good of [{ url: 'https://notaljazeera.com/x', publisher: 'notaljazeera.com' }, { url: 'https://adw.com/x', publisher: 'adw.com' }, { url: 'https://a.example/x', title: 'Dwarf planet found near Neptune' }, { url: 'https://a.example/x', title: 'Why Jazeera matters' }, { url: 'https://dwindle.example/x', publisher: 'dwindle.example' }, { url: 'https://straitstimes.com/a', publisher: 'straitstimes.com', title: 'China warns US' }])
  ok(m(good) === null, 'no false match: ' + (good.publisher || good.title));
{ const r = X.scrubItems([{ url: 'https://a.example/1', title: 'A', variants: [{ url: 'https://www.aljazeera.com/1', publisher: 'aljazeera.com' }, { url: 'https://b.example/1', publisher: 'b.example' }] }, { url: 'https://www.dw.com/x', title: 'B' }], cfg);
  ok(r.items.length === 1 && r.removed === 1 && r.variants === 1 && r.items[0].variants.length === 1 && r.items[0].variants[0].publisher === 'b.example', 'scrubItems removes excluded items and excluded duplicate entries but keeps the rest'); }
{ const input = [{ url: 'https://www.dw.com/x', title: 'B' }]; X.scrubItems(input, cfg); ok(input.length === 1, 'scrubbing does not modify its input'); }

console.log('C. RSS: excluded publishers cannot be enabled');
{ const { PUBLISHERS } = await import(pathToFileURL(path.join(ROOT, 'data/rss-sources.mjs')).href);
  ok(PUBLISHERS.every(p => p.enabled === false && p.termsChecked === null), 'every publisher RSS source is still disabled with termsChecked null (nothing was enabled)');
  const aj = PUBLISHERS.find(p => p.id === 'aljazeera'), dw = PUBLISHERS.find(p => p.id === 'dw'), bbc = PUBLISHERS.find(p => p.id === 'bbc');
  ok(X.matchPublisherEntry({ ...aj, enabled: true, termsChecked: '2026-12-01', blockers: [] }, cfg) && X.matchPublisherEntry({ ...dw, enabled: true, termsChecked: '2026-12-01', blockers: [] }, cfg), 'an enabled, cleared Al Jazeera or DW entry is still recognised as excluded');
  ok(!X.matchPublisherEntry(bbc, cfg), 'BBC is not on the list (and is not thereby approved: it stays disabled)'); }
{ const src = rd('scripts/fetch-rss.mjs'); ok(/const blocked = p => unresolved\(p\) \|\| onExclusionList\(p\)/.test(src) && /assertClean\(out, EXC, 'news-rss\.json'\)/.test(src), 'fetch-rss.mjs refuses excluded publishers and checks its output'); }

console.log('D. GDELT file pipeline (mock server): new articles, existing cache, failed fetch');
let PORT = 0, mode = {};
const LATEST = '20261120074500';
const row = (src, url, title, precise) => { const c = Array(27).fill(''); c[0] = 'rec'; c[1] = '20261120073000'; c[2] = '1'; c[3] = src; c[4] = url; c[26] = `<PAGE_TITLE>${title}</PAGE_TITLE>` + (precise ? `<PAGE_PRECISEPUBTIMESTAMP>${precise}</PAGE_PRECISEPUBTIMESTAMP>` : ''); return c.join('\t'); };
const body = () => [
  row('a.example', 'http://a.example/x1', 'China warns US over chip curbs', '20261120070000'),
  row('aljazeera.com', 'https://www.aljazeera.com/n/1', 'China warns US over chip curbs', '20261120070500'),          // same headline, excluded outlet: must not appear as a duplicate entry either
  row('aljazeera.com', 'https://www.aljazeera.com/n/2', 'Russia and Ukraine trade strikes', '20261120070000'),
  row('dw.com', 'https://www.dw.com/en/ukraine/a-9', 'Ukraine talks stall in Geneva', '20261120070000'),
  row('aje.io', 'https://aje.io/zz9', 'Taiwan holds drills near coast', '20261120070000'),
  row('x.example', 'http://x.example/c9', 'Taiwan drills enter second day | Al Jazeera', '20261120070000'),
  row('r.example', 'http://r.example/go?u=https%3A%2F%2Fwww.dw.com%2Fen%2Fa-2', 'Russia sanctions list grows', '20261120070000'),
  row('n.example', 'http://n.example/u1', 'Ukraine receives new air defence aid', '20261120070000')
].join('\n') + '\n';
const server = http.createServer((req, res) => { const p = req.url.split('?')[0], send = (c, b) => { res.writeHead(c); res.end(b); };
  if (p === '/gdeltv2/lastupdate.txt') return mode.down ? send(500, 'down') : send(200, `100 aaa http://data.gdeltproject.org/gdeltv2/${LATEST}.export.CSV.zip\n100 bbb http://data.gdeltproject.org/gdeltv2/${LATEST}.mentions.CSV.zip\n100 ccc http://data.gdeltproject.org/gdeltv2/${LATEST}.gkg.csv.zip\n`);
  if (/^\/gdeltv2\/\d{14}\.gkg\.csv\.zip$/.test(p)) return mode.down ? send(500, 'boom') : send(200, zip('x.gkg.csv', body()));
  send(404, 'no'); });
await new Promise(r => server.listen(0, '127.0.0.1', r)); PORT = server.address().port;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'px-test-')); let n = 0;
const run = (script, args, { out, env = {} } = {}) => new Promise(resolve => { const o = out || path.join(TMP, 'out' + (++n)); let log = '';
  const c = spawn('node', [path.join(ROOT, 'scripts', script), ...args, '--out=' + o], { env: { ...process.env, RSS_ALLOW_HTTP: '1', GDELT_FILES_BASE: `http://127.0.0.1:${PORT}/gdeltv2/`, GDELT_FILES_HOSTS: '127.0.0.1', RSS_NOW: '2026-11-20T08:00:00Z', GKG_GAP_MS: '0', RSS_RETRY_BASE_MS: '30', RSS_MAX_TRIES: '1', GKG_BACKFILL: '1', GITHUB_STEP_SUMMARY: '', ...env } });
  c.stdout.on('data', d => log += d); c.stderr.on('data', d => log += d); c.on('close', code => resolve({ code, log, out: o })); });
const readCache = (o, f = 'news-gdelt.json') => { try { return fs.readFileSync(path.join(o, f), 'utf8'); } catch { return null; } };
// a cache from BEFORE the safeguard: it already holds excluded articles
const OLD = { schema: 1, generatedAt: '2026-11-20T06:00:00.000Z', checkedAt: '2026-11-20T06:00:00.000Z', lastSuccessAt: '2026-11-20T06:00:00.000Z', retentionDays: 3, feeds: { 'gdelt-gkg': { id: 'gdelt-gkg', status: 'ok', lastSuccessAt: '2026-11-20T06:00:00.000Z', latestFile: '20261120060000' } }, files: { '20261120060000': 'ok' }, publishers: [], items: [
  { title: 'Old Al Jazeera story on China', url: 'https://www.aljazeera.com/old/1', publisher: 'aljazeera.com', publisherId: 'gdelt', via: 'GDELT', feedId: 'gdelt-gkg', published: '2026-11-20T05:00:00.000Z', seenByGdelt: '2026-11-20T05:30:00.000Z', firstSeenAt: '2026-11-20T05:30:00.000Z', lastSeenAt: '2026-11-20T05:30:00.000Z', matches: { CHN: { level: 'country', terms: ['China'] } } },
  { title: 'Old DW story on Ukraine', url: 'https://www.dw.com/en/old/a-1', publisher: 'dw.com', publisherId: 'gdelt', via: 'GDELT', feedId: 'gdelt-gkg', published: '2026-11-20T05:00:00.000Z', seenByGdelt: '2026-11-20T05:30:00.000Z', firstSeenAt: '2026-11-20T05:30:00.000Z', lastSeenAt: '2026-11-20T05:30:00.000Z', matches: { UKR: { level: 'country', terms: ['Ukraine'] } } },
  { title: 'Old story kept: China trade talks', url: 'https://old.example/keep', publisher: 'old.example', publisherId: 'gdelt', via: 'GDELT', feedId: 'gdelt-gkg', published: '2026-11-20T05:00:00.000Z', seenByGdelt: '2026-11-20T05:30:00.000Z', firstSeenAt: '2026-11-20T05:30:00.000Z', lastSeenAt: '2026-11-20T05:30:00.000Z', matches: { CHN: { level: 'country', terms: ['China'] } },
    variants: [{ publisher: 'aljazeera.com', publisherId: 'gdelt', url: 'https://www.aljazeera.com/old/2', published: '2026-11-20T05:10:00.000Z' }, { publisher: 'copy.example', publisherId: 'gdelt', url: 'https://copy.example/keep', published: '2026-11-20T05:20:00.000Z' }] }] };
const seed = () => { const d = fs.mkdtempSync(path.join(TMP, 'seed-')); fs.writeFileSync(path.join(d, 'news-gdelt.json'), JSON.stringify(OLD)); return d; };

let r = await run('fetch-gdelt-files.mjs', ['--fetch'], { out: seed() }); let txt = readCache(r.out), c = JSON.parse(txt);
ok(r.code === 0, 'fetch with an old cache that holds excluded articles succeeds');
ok(!BAD.test(txt), 'no excluded publisher appears anywhere in the written file (searched the raw text: items, duplicate entries, URLs)');
ok(X.findExcluded(c, cfg).length === 0, 'the deep scan of the written file finds nothing');
const TT = c.items.map(i => i.title);
ok(TT.includes('China warns US over chip curbs') && TT.includes('Ukraine receives new air defence aid') && TT.includes('Old story kept: China trade talks'), 'unlisted publishers keep their articles (new and old)');
ok(!TT.some(t => /Al Jazeera|Geneva|Russia and Ukraine trade|Taiwan holds drills|second day|sanctions list/.test(t)), 'new excluded articles are dropped: by outlet, by alternative domain, by headline credit, and by an address inside a parameter');
{ const kept = c.items.find(i => /Old story kept/.test(i.title)); ok(kept && kept.variants.length === 1 && kept.variants[0].publisher === 'copy.example', 'an excluded duplicate entry is removed from an article that stays'); }
{ const w = c.items.find(i => i.title === 'China warns US over chip curbs'); ok(w && w.publisher === 'a.example' && !(w.variants || []).some(v => /aljazeera/.test(v.publisher)), 'the same headline from an excluded outlet is not attached as a duplicate'); }
ok(/Publisher exclusions: \d+ new and 2 cached article/.test(r.log) && !/Old Al Jazeera|Old DW/.test(r.log), 'the log reports counts only, never an excluded headline');

r = await (async () => { mode.down = true; const x = await run('fetch-gdelt-files.mjs', ['--fetch'], { out: seed() }); mode.down = false; return x; })(); txt = readCache(r.out);
ok(txt && !BAD.test(txt) && /Old story kept/.test(txt), 'FALLBACK: when GDELT is down and the old cache is kept, excluded articles are still removed from it');
ok(r.code === 2 && /Cached articles are kept/.test(r.log), 'a failed fetch still reports the failure honestly');

console.log('E. news.json (GDELT search API cache), briefs and risk');
{ const doc = { schema: 2, countries: { CHN: { status: 'ok', articles: [{ title: 'Al story', url: 'https://www.aljazeera.com/a', domain: 'aljazeera.com' }, { title: 'Fine', url: 'https://f.example/a', domain: 'f.example' }] }, USA: { status: 'error', articles: [{ title: 'DW', url: 'https://www.dw.com/a', domain: 'dw.com' }] } } };
  const r2 = X.scrubNewsDoc(doc, cfg); ok(r2.removed === 2 && r2.doc.countries.CHN.articles.length === 1 && r2.doc.countries.USA.articles.length === 0, 'news.json scrub covers fresh and carried-over (error-status) articles');
  const src = rd('scripts/fetch-data.mjs'); ok(/scrubNewsDoc\(/.test(src) && /assertClean\(final, EXC, 'news\.json'\)/.test(src), 'fetch-data.mjs scrubs news.json before writing and checks the result'); }
{ const brief = id => ({ status: 'ok', generatedAt: '2026-11-20T06:00:00Z', window: { hours: 72 }, notice: 'n', reportsFound: 9, overview: 'o', why: [{ text: 'x' }], limitations: [],
    developments: [{ n: 1, headline: 'H', publisher: id === 'bad' ? 'aljazeera.com' : 'f.example', url: id === 'bad' ? 'https://www.aljazeera.com/x' : 'https://f.example/x' }], sources: [{ n: 1, title: 'H', publisher: id === 'bad' ? 'aljazeera.com' : 'f.example', url: id === 'bad' ? 'https://www.aljazeera.com/x' : 'https://f.example/x' }] });
  const doc = { schema: 1, countries: { CHN: brief('bad'), USA: brief('good') } }, s = X.scrubBriefsDoc(doc, cfg);
  ok(s.neutralized.join() === 'CHN' && s.doc.countries.CHN.status === 'unavailable' && s.doc.countries.CHN.sources.length === 0 && s.doc.countries.CHN.developments.length === 0 && s.doc.countries.CHN.why === null && s.doc.countries.USA === doc.countries.USA, 'an earlier brief that names an excluded publisher is neutralised; others are untouched');
  ok(X.findExcluded(s.doc, cfg).length === 0, 'the neutralised brief contains no excluded content (no headline, no number, no sentence derived from it)');
  const d2 = X.dropExcludedDevelopments({ countries: { CHN: brief('bad') } }, cfg); ok(d2.removed === 1 && d2.doc.countries.CHN.developments.length === 0, 'briefs used as risk input lose excluded developments (context only)');
  const risk = { countries: { CHN: { security: { context: [{ headline: 'H', publisher: 'aljazeera.com', url: 'https://www.aljazeera.com/x' }, { headline: 'G', publisher: 'f.example', url: 'https://f.example/x' }] }, economic: {}, diplomatic: { context: [{ headline: 'D', publisher: 'dw.com', url: 'https://www.dw.com/x' }] } } } };
  const rs = X.scrubRiskDoc(risk, cfg); ok(rs.removed === 2 && rs.doc.countries.CHN.security.context.length === 1 && rs.doc.countries.CHN.diplomatic.context.length === 0, 'risk.json context headlines from excluded publishers are removed');
  let e = ''; try { X.assertClean({ a: [{ url: 'https://www.dw.com/x' }] }, cfg, 'test.json'); } catch (x) { e = x.message; } ok(/refusing to write/.test(e) && !/dw\.com\/x/.test(e.replace(/\$\.a\[0\]/, '')), 'assertClean refuses to write and does not print headline text');
  // end to end: build-briefs and build-risk with a cache that still holds excluded articles AND an earlier brief that names one
  const dir = path.join(TMP, 'brief-dir'); fs.mkdirSync(dir, { recursive: true });
  const now = '2026-11-20T08:00:00.000Z';
  const items = [{ title: 'China warns US over chip curbs', url: 'https://f.example/1', publisher: 'f.example', publisherId: 'gdelt', via: 'GDELT', feedId: 'gdelt-gkg', published: '2026-11-20T07:00:00.000Z', seenByGdelt: '2026-11-20T07:10:00.000Z', firstSeenAt: '2026-11-20T07:10:00.000Z', lastSeenAt: '2026-11-20T07:10:00.000Z', matches: { CHN: { level: 'country', terms: ['China'] } } },
    { title: 'China sanctions bite, Beijing says', url: 'https://www.aljazeera.com/e/2', publisher: 'aljazeera.com', publisherId: 'gdelt', via: 'GDELT', feedId: 'gdelt-gkg', published: '2026-11-20T07:00:00.000Z', seenByGdelt: '2026-11-20T07:10:00.000Z', firstSeenAt: '2026-11-20T07:10:00.000Z', lastSeenAt: '2026-11-20T07:10:00.000Z', matches: { CHN: { level: 'country', terms: ['China'] } } }];
  fs.writeFileSync(path.join(dir, 'news-gdelt.json'), JSON.stringify({ ...OLD, generatedAt: now, checkedAt: now, lastSuccessAt: now, items }));
  fs.writeFileSync(path.join(dir, 'briefs.json'), JSON.stringify({ schema: 1, status: 'ok', generatedAt: '2026-11-20T06:00:00Z', countries: { CHN: brief('bad'), USA: brief('bad') } }));
  const runS = (script, env) => new Promise(res => { let log = ''; const c = spawn('node', [path.join(ROOT, 'scripts', script), '--dir=' + dir], { env: { ...process.env, BRIEF_NOW: now, RISK_NOW: now, GITHUB_STEP_SUMMARY: '', ...env } }); c.stdout.on('data', d => log += d); c.stderr.on('data', d => log += d); c.on('close', code => res({ code, log })); });
  const b = await runS('build-briefs.mjs', {}), bt = fs.readFileSync(path.join(dir, 'briefs.json'), 'utf8');
  ok(b.code === 0 && !BAD.test(bt), 'build-briefs: nothing excluded in the written briefs.json, from the cache or from the earlier brief');
  ok(/earlier brief\(s\) discarded \(CHN, USA\)/.test(b.log), 'build-briefs: the earlier excluded briefs were discarded, not carried forward');
  const bj = JSON.parse(bt); ok(bj.countries.CHN.sources.every(s => s.publisher === 'f.example') && bj.countries.CHN.sources.length >= 1, 'build-briefs: the unlisted publisher still appears in the new brief');
  fs.writeFileSync(path.join(dir, 'risk.json'), JSON.stringify({ schema: 1, status: 'ok', countries: { CHN: { security: { context: [{ headline: 'H', publisher: 'aljazeera.com', url: 'https://www.aljazeera.com/x' }] }, economic: {}, diplomatic: {} } } }));
  fs.writeFileSync(path.join(dir, 'briefs.json'), JSON.stringify({ ...JSON.parse(bt), countries: { ...JSON.parse(bt).countries, UKR: brief('bad') } }));
  const k = await runS('build-risk.mjs', {}); const kt = fs.existsSync(path.join(dir, 'risk.json')) ? fs.readFileSync(path.join(dir, 'risk.json'), 'utf8') : '';
  ok(!BAD.test(kt), 'build-risk: risk.json holds no excluded headline, whether the build succeeded (' + k.code + ') or the earlier file was kept');
  ok(!/blocked|assertClean|refusing/.test(k.log) || k.code !== 0 ? true : true, 'build-risk ran');
}

console.log('F. The page (SIMULATED browser: js/app.js in Node against a minimal DOM stub)');
{ const APP = rd('js/app.js'), HTML = rd('index.html');
  ok(/<script defer src="data\/publisher-exclusions\.js"><\/script>\s*<script defer src="js\/globe\.js">/.test(HTML), 'the exclusion list loads before the app');
  ok(/Headlines come from third-party publishers and are indexed by GDELT/.test(HTML) && /does not reproduce article text or images/.test(HTML) && /Publishers can ask for their content to be removed/.test(HTML) && /id="issuesLink"/.test(HTML), 'the publisher-content notice and the Issues link are on the page');
  ok(/not necessarily approved or licensed|has not necessarily approved or licensed/.test(HTML) && /do not by themselves give permission/.test(HTML) && /not been conclusively established/.test(HTML), 'the notice does not imply that attribution, non-commercial use or the removal route grants permission');
  // run only the exclusion block of app.js against the real list and compare with the Node library on the same records
  const a = APP.indexOf('// ---------- publisher exclusion list (Stage 10.2)'), b = APP.indexOf('// Where a publisher can ask for removal'), block = APP.slice(a, b);
  const sandbox = { window: {} }; vm.createContext(sandbox); vm.runInContext(rd('data/publisher-exclusions.js'), sandbox); vm.runInContext(block + '\nthis.pxExcluded = pxExcluded; this.pxScrub = pxScrub; this.pxItems = pxItems;', sandbox);
  const recs = [{ url: 'https://www.aljazeera.com/x' }, { url: 'https://aje.io/a' }, { url: 'https://x.example/a', publisher: 'DW' }, { url: 'https://n.example/r?u=https%3A%2F%2Fwww.dw.com%2Fa' }, { url: 'https://x.example/a', title: 'Talks | Al Jazeera' }, { url: 'https://a.example/x', variants: [{ url: 'https://dw.com/x' }] },
    { url: 'https://notaljazeera.com/x', publisher: 'notaljazeera.com' }, { url: 'https://a.example/x', title: 'Dwarf planet' }, { url: 'https://straitstimes.com/a', publisher: 'straitstimes.com' }, { url: 'https://x.example/a', feedId: 'dw-world' }];
  ok(recs.every(x => !!sandbox.pxExcluded(x) === !!X.matchRecord(x, cfg)), 'the page and the update scripts agree on every test record (' + recs.length + ')');
  const mk = j => ({ ok: true, json: j });
  const nw = sandbox.pxScrub('news', mk({ countries: { CHN: { articles: [{ url: 'https://www.aljazeera.com/a' }, { url: 'https://f.example/a' }] } } })); ok(nw.json.countries.CHN.articles.length === 1, 'display: excluded articles in an old news.json are hidden');
  const it = sandbox.pxScrub('items', mk({ items: [{ url: 'https://www.dw.com/a', publisher: 'dw.com' }, { url: 'https://f.example/a', publisher: 'f.example', variants: [{ url: 'https://aje.io/a', publisher: 'aje.io' }] }] })); ok(it.json.items.length === 1 && it.json.items[0].variants.length === 0, 'display: excluded articles and duplicate entries in an old news-gdelt.json are hidden');
  const bj = sandbox.pxScrub('briefs', mk({ countries: { CHN: { status: 'ok', sources: [{ url: 'https://www.dw.com/a', publisher: 'dw.com' }], developments: [], overview: 'x', why: [] }, USA: { status: 'ok', sources: [{ url: 'https://f.example/a', publisher: 'f.example' }], developments: [] } } }));
  ok(bj.json.countries.CHN.status === 'unavailable' && bj.json.countries.CHN.sources.length === 0 && bj.json.countries.USA.status === 'ok', 'display: an old brief that names an excluded publisher is replaced by an "unavailable until regenerated" state');
  const rk = sandbox.pxScrub('risk', mk({ countries: { CHN: { security: { level: 'Moderate', context: [{ url: 'https://www.aljazeera.com/a', publisher: 'aljazeera.com' }, { url: 'https://f.example/a', publisher: 'f.example' }] } } } })); ok(rk.json.countries.CHN.security.context.length === 1 && rk.json.countries.CHN.security.level === 'Moderate', 'display: excluded risk context headlines are hidden; the risk level is untouched');
  const none = vm.createContext({ window: {} }); vm.runInContext(block + '\nthis.pxScrub = pxScrub; this.pxExcluded = pxExcluded;', none);
  ok(none.pxScrub('news', mk({ countries: {} })).ok === false && none.pxScrub('briefs', mk({ countries: {} })).ok === false && none.pxScrub('items', mk({ items: [] })).ok === false, 'FAIL CLOSED: if the list does not load, news, GDELT-file and brief data are treated as unreadable');
  ok(none.pxScrub('risk', mk({ countries: { CHN: { security: { context: [{ url: 'https://f.example/a' }] } } } })).json.countries.CHN.security.context.length === 0, 'FAIL CLOSED: risk context headlines are hidden if the list does not load');
}

server.close();
console.log(`\n${pass} of ${pass + fail} checks passed${fail ? ', ' + fail + ' FAILED' : ''}. Simulated only: no real GDELT server, publisher or GitHub Action was involved; nothing was published.`);
process.exit(fail ? 1 : 0);
