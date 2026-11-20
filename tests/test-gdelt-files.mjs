// SIMULATED tests for the GDELT open-data-file pipeline and the safe HTTP client. A local mock server pretends to be data.gdeltproject.org.
// No real GDELT server is contacted. Run:  node tests/test-gdelt-files.mjs
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFirstZipEntry } from '../scripts/zip-lib.mjs';
import { extractFeedLinks } from '../scripts/rss-lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL: ' + m); } };

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
// zip reader unit tests
ok(readFirstZipEntry(zip('a.csv', 'hello\tworld\n')).toString() === 'hello\tworld\n', 'ZIP reader: deflate entry');
ok(readFirstZipEntry(zip('a.csv', 'stored', 0)).toString() === 'stored', 'ZIP reader: stored entry');
let err = ''; try { readFirstZipEntry(Buffer.from('this is not a zip file at all, just text')); } catch (e) { err = e.message; } ok(/not a ZIP/.test(err), 'ZIP reader rejects non-ZIP data');
err = ''; try { readFirstZipEntry(zip('a', 'x'.repeat(5000)), { maxOutput: 100 }); } catch (e) { err = e.message; } ok(/larger than/.test(err), 'ZIP reader refuses an over-large file before unpacking');
err = ''; try { const z = zip('a', 'hello'.repeat(200)); readFirstZipEntry(z.subarray(0, 60)); } catch (e) { err = e.message; } ok(err !== '', 'ZIP reader rejects a truncated archive');
// feed discovery unit tests
const html = `<html><head><link rel="alternate" type="application/rss+xml" href="/en/news/rss.xml"><link rel="stylesheet" href="/x.css"></head><body>
<a href="/en/rss/humanrights.xml">HR</a><a href="https://evil.example/rss.xml">other site</a><a href="/en/about">About</a><a href="https://www.ungeneva.org/en/feed">feed</a></body></html>`;
const found = extractFeedLinks(html, 'https://www.ungeneva.org/en/rss', ['ungeneva.org']).map(x => x.url);
ok(found.includes('https://www.ungeneva.org/en/news/rss.xml') && found.includes('https://www.ungeneva.org/en/rss/humanrights.xml') && found.includes('https://www.ungeneva.org/en/feed'), 'discovery finds declared and feed-looking links');
ok(!found.some(u => /evil|about|css/.test(u)), 'discovery ignores other sites and non-feed links');

// ---- mock GDELT server ----
let PORT = 0, hits = {}, mode = {};
const stampOf = ms => new Date(ms).toISOString().replace(/[-:T]/g, '').slice(0, 14);
const LATEST = '20261120074500';
const ms = s => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10), +s.slice(10, 12), 0);
const row = (src, url, title, precise, seen = '20261120073000') => { const c = Array(27).fill(''); c[0] = 'rec'; c[1] = seen; c[2] = '1'; c[3] = src; c[4] = url;
  c[26] = (title == null ? '' : `<PAGE_TITLE>${title}</PAGE_TITLE>`) + (precise ? `<PAGE_PRECISEPUBTIMESTAMP>${precise}</PAGE_PRECISEPUBTIMESTAMP>` : '') + '<PAGE_LINKS>http://x.example</PAGE_LINKS>'; return c.join('\t'); };
function fileBody(stamp) {
  const rows = [
    row('a.example', 'http://a.example/x1', 'China warns US over chip curbs', '20261120070000'),
    row('b.example', 'http://b.example/x1-copy', 'China warns US over chip curbs', '20261120070500'),             // same headline syndicated: shown once
    row('c.example', 'http://c.example/t1', 'Taiwan holds drills', '20301120000000'),                           // future precise time: shown without a date
    row('d.example', 'http://d.example/f1', 'Football results', '20261120070000'),                               // no country
    row('e.example', 'http://e.example/n1', null, '20261120070000'),                                              // no headline: never shown
    row('f.example', 'javascript:alert(1)', 'Ukraine javascript link', '20261120070000'),                         // unsafe link
    row('g.example', 'http://g.example/u1', 'Ukraine &amp; Russia hold talks', null),                           // entity decoded, no publication time
    row('h.example', 'http://h.example/k-' + stamp, 'Kyiv update ' + stamp, '20261120071000'),                    // unique per file
    'too\tshort\tline'
  ];
  if (mode.many) for (let i = 0; i < 60; i++) rows.push(row('m.example', `http://m.example/us-${stamp}-${i}`, `US budget story ${stamp} ${i}`, '20261120071000'));
  return rows.join('\n') + '\n';
}
const server = http.createServer((req, res) => {
  const p = req.url.split('?')[0]; hits[p] = (hits[p] || 0) + 1;
  const send = (c, b, h = {}) => { res.writeHead(c, h); res.end(b); };
  if (p === '/gdeltv2/lastupdate.txt') return mode.noLast ? send(500, 'down') : mode.badLast ? send(200, 'nothing useful here') : send(200, `100 aaa http://data.gdeltproject.org/gdeltv2/${LATEST}.export.CSV.zip\n100 bbb http://data.gdeltproject.org/gdeltv2/${LATEST}.mentions.CSV.zip\n100 ccc http://data.gdeltproject.org/gdeltv2/${LATEST}.gkg.csv.zip\n`);
  const m = /^\/gdeltv2\/(\d{14})\.gkg\.csv\.zip$/.exec(p);
  if (m) {
    const s = m[1];
    if (mode.allDown) return send(500, 'boom');
    if (mode.missing && mode.missing.includes(s)) return send(404, 'nope');
    if (mode.corrupt === s) return send(200, Buffer.from('not a zip'));
    if (mode.flaky === s && hits[p] === 1) return send(503, 'busy', { 'Retry-After': '0' });
    if (mode.notitles) return send(200, zip(s + '.gkg.csv', fileBody(s).replace(/<PAGE_TITLE>.*?<\/PAGE_TITLE>/g, '')));
    if (mode.wrongLayout) return send(200, zip(s + '.gkg.csv', 'a\tb\tc\nd\te\tf\n'));
    return send(200, zip(s + '.gkg.csv', fileBody(s)), { 'Content-Type': 'application/zip' });
  }
  if (p === '/redir') { res.writeHead(302, { Location: 'http://localhost:' + PORT + '/gdeltv2/lastupdate.txt' }); return res.end(); }
  send(404, 'unknown');
});
await new Promise(r => server.listen(0, '127.0.0.1', r)); PORT = server.address().port;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'gkg-test-')); let n = 0;
const run = (args, { out, env = {} } = {}) => new Promise(resolve => {
  const o = out || path.join(TMP, 'out' + (++n)); let log = '';
  const c = spawn('node', [path.join(ROOT, 'scripts', 'fetch-gdelt-files.mjs'), ...args, '--out=' + o], { env: { ...process.env, RSS_ALLOW_HTTP: '1', GDELT_FILES_BASE: `http://127.0.0.1:${PORT}/gdeltv2/`, GDELT_FILES_HOSTS: '127.0.0.1', RSS_NOW: '2026-11-20T08:00:00Z', GKG_GAP_MS: '0', RSS_RETRY_BASE_MS: '30', GKG_BACKFILL: '4', GITHUB_STEP_SUMMARY: '', ...env } });
  c.stdout.on('data', d => log += d); c.stderr.on('data', d => log += d);
  c.on('close', code => { let cache = null; try { cache = JSON.parse(fs.readFileSync(path.join(o, 'news-gdelt.json'), 'utf8')); } catch {} resolve({ code, log, cache, out: o }); });
});
const KEEP = process.env.KEEP_OUT;

// ---- verify ----
let r = await run(['--verify']);
ok(r.code === 0 && /RESULT: the GDELT file route works/.test(r.log), 'verify succeeds on a healthy source'); ok(r.cache === null, 'verify writes nothing');
ok(/headlines \(PAGE_TITLE\) present: 7/.test(r.log) && /1 with fewer than 27 columns|1 with fewer/.test(r.log), 'verify counts headlines and malformed lines');
ok(/sample: "China warns US over chip curbs"/.test(r.log), 'verify shows a real sample headline');
mode.notitles = true; r = await run(['--verify']); ok(r.code === 2 && /no <PAGE_TITLE> found/.test(r.log), 'verify fails honestly when the files carry no headlines'); mode.notitles = false;
mode.wrongLayout = true; r = await run(['--verify']); ok(r.code === 2 && /27-column/.test(r.log), 'verify fails honestly on an unexpected layout'); mode.wrongLayout = false;
mode.badLast = true; r = await run(['--verify']); ok(r.code === 2 && /no GKG file entry/.test(r.log), 'verify fails when lastupdate.txt has no GKG entry'); mode.badLast = false;
mode.noLast = true; r = await run(['--verify'], { env: { RSS_MAX_TRIES: '1' } }); ok(r.code === 2, 'verify fails when the server is down'); mode.noLast = false;

// ---- fetch ----
r = await run(['--fetch']); const c1 = r.cache;
ok(r.code === 0 && c1.feeds['gdelt-gkg'].status === 'ok', 'fetch succeeds'); ok(c1.feeds['gdelt-gkg'].latestFile === LATEST, 'newest file recorded');
ok(Object.values(c1.files).filter(v => v === 'ok').length === 4, 'the four newest files were read'); const T1 = c1.items.map(i => i.title);
ok(T1.includes('China warns US over chip curbs') && T1.filter(t => /China warns/.test(t)).length === 1, 'syndicated duplicate headline shown once');
ok(T1.includes('Ukraine & Russia hold talks'), 'HTML entities decoded in headlines'); ok(!T1.some(t => /Football|javascript/.test(t)), 'no-country and unsafe-link rows dropped');
ok(c1.items.filter(i => /Kyiv update/.test(i.title)).length === 4, 'unique headline from each file kept');
const dr = c1.items.find(i => /drills/.test(i.title)); ok(dr && dr.published === null, 'future publication time not shown as a date');
ok(c1.items.find(i => /Ukraine & Russia/.test(i.title)).published === null, 'missing publication time stays empty (nothing guessed)');
ok(c1.items.find(i => /China warns/.test(i.title)).published === '2026-11-20T07:00:00.000Z', 'precise publication time parsed as UTC');
ok(c1.items.every(i => i.via === 'GDELT' && i.publisher && i.url.startsWith('http://') && i.matches && !('summary' in i)), 'every item has publisher, link, via GDELT, matches');
ok(c1.items.every(i => i.matches && Object.values(i.matches).every(m => m.level === 'country' || m.level === 'institution')), 'GDELT matches are headline-only (country name or institution)');
ok(c1.attribution.url === 'https://www.gdeltproject.org/', 'attribution link stored in the cache');
ok(!hits['/gdeltv2/20261120074500.export.CSV.zip'], 'only lastupdate.txt and GKG files are requested');
if (KEEP) fs.cpSync(r.out, path.join(KEEP, 'gdelt-ok'), { recursive: true });
// second run: nothing new to read
const before = Object.keys(hits).filter(k => k.endsWith('.zip')).reduce((a, k) => a + hits[k], 0);
r = await run(['--fetch'], { out: r.out }); const after = Object.keys(hits).filter(k => k.endsWith('.zip')).reduce((a, k) => a + hits[k], 0);
ok(r.code === 0 && /already up to date/.test(r.log) && after === before, 'a repeat run downloads no file again (rate-friendly)'); ok(r.cache.items.length === c1.items.length, 'repeat run adds no duplicates');
// failures: server down -> cached articles kept, marked error, exit 2
mode.noLast = true; r = await run(['--fetch'], { out: r.out, env: { RSS_NOW: '2026-11-20T09:00:00Z', RSS_MAX_TRIES: '1' } });
ok(r.code === 2 && r.cache.feeds['gdelt-gkg'].status === 'error', 'server down: exit 2, status error'); ok(r.cache.items.length === c1.items.length, 'server down: cached articles kept');
ok(r.cache.feeds['gdelt-gkg'].lastSuccessAt === '2026-11-20T08:00:00.000Z' && r.cache.checkedAt === '2026-11-20T09:00:00.000Z', 'last success time preserved, last check updated'); mode.noLast = false;
if (KEEP) fs.cpSync(r.out, path.join(KEEP, 'gdelt-fail'), { recursive: true });
// partial failures
mode.missing = ['20261120073000']; mode.corrupt = '20261120071500'; mode.flaky = '20261120074500';
r = await run(['--fetch']); const f = r.cache.files;
ok(r.code === 0, 'some files missing or corrupt does not fail the run'); ok(f['20261120073000'] === 'missing' && f['20261120071500'] === undefined && f['20261120074500'] === 'ok', 'missing recorded; corrupt not marked read; a 503 is retried and then read');
ok(/could not read the ZIP/.test(r.log) && /not published \(404\)/.test(r.log), 'each file problem has its own reason'); ok(r.cache.feeds['gdelt-gkg'].warning && /2 of 4/.test(r.cache.feeds['gdelt-gkg'].warning), 'partial failure recorded as a warning'); mode = {};
// all files fail
mode.allDown = true; r = await run(['--fetch'], { env: { RSS_MAX_TRIES: '1' } }); ok(r.code === 2 && /none of the 4 files could be read/.test(r.cache.feeds['gdelt-gkg'].error), 'every file failing: exit 2 with a reason'); mode = {};
// per-country cap
mode.many = true; r = await run(['--fetch']); { const us = r.cache.items.filter(i => i.matches.USA).length; ok(us >= 40 && us <= 42, 'a very busy country keeps only its newest 40 (plus a few shared with other countries), not all 240 (got ' + us + ')'); } ok(r.cache.items.some(i => i.matches.UKR), 'other countries still present beside a very busy one'); mode = {};
// retention
r = await run(['--fetch'], { out: r.out, env: { RSS_NOW: '2026-11-26T08:00:00Z', GKG_BACKFILL: '1' } }); ok(!r.cache.items.some(i => Date.parse(i.published || i.firstSeenAt) < Date.parse('2026-11-23T08:00:00Z')), 'articles older than 3 days expire');
// safety: redirect to another host refused, never requested
const R = await run(['--verify'], { env: { GDELT_FILES_BASE: `http://127.0.0.1:${PORT}/redir/` } }); ok(R.code === 2, 'unreachable base fails verify');
hits['/gdeltv2/lastupdate.txt'] = 0; r = await run(['--verify'], { env: { GDELT_FILES_BASE: `http://127.0.0.1:${PORT}/redir` } });
ok(!/localhost/.test(r.log) || /refused/.test(r.log) || r.code === 2, 'redirect to another host does not succeed');
ok(r.code === 2 && hits['/gdeltv2/lastupdate.txt'] === 0, 'a redirect to another host was refused before it was requested');
// production setting: plain http and IP addresses refused
r = await run(['--verify'], { env: { RSS_ALLOW_HTTP: '0' } }); ok(r.code === 2 && /only https addresses are allowed/.test(r.log), 'production setting refuses plain http');

server.close(); fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n${pass} checks passed${fail ? ', ' + fail + ' FAILED' : ''}. Reminder: simulated only; no real GDELT server was contacted.`);
process.exit(fail ? 1 : 0);
