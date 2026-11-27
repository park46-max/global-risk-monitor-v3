// SIMULATED tests for Stage 7C Task 1: robots.txt is checked before EVERY address of a redirect chain, Crawl-delay is honoured between requests,
// and the script stops on restricted access, unsafe redirects, loops and unresolved robots.txt checks, without trying anything else.
// A local mock server answers as two hosts (127.0.0.1 and localhost) so same-host and cross-host redirects can be tested. No real website is contacted.
// Run:  node tests/test-redirect-safeguards.mjs
import http from 'node:http'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { spawn } from 'node:child_process'; import { fileURLToPath, pathToFileURL } from 'node:url';
import { createClient, FetchError } from '../scripts/http-lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL: ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`);
const sec = t => console.log('\n' + t);

let PORT = 0, log = [], R = {};   // log = every request the mock saw; R = robots.txt answer per host name
const feed = () => `<?xml version="1.0"?><rss version="2.0"><channel><title>Mock</title><item><title>Taiwan Strait statement</title><link>http://127.0.0.1:${PORT}/p/1</link><pubDate>Fri, 20 Nov 2026 06:00:00 GMT</pubDate></item></channel></rss>`;
const server = http.createServer((req, res) => {
  const host = (req.headers.host || '').split(':')[0], p = req.url.split('?')[0]; log.push({ host, p, t: Date.now(), headers: { ...req.headers } });
  const send = (c, b, h = {}) => { res.writeHead(c, { 'Content-Type': 'application/xml', ...h }); res.end(b); };
  const go = loc => { res.writeHead(302, { Location: loc }); res.end(); };
  const other = host === 'localhost' ? '127.0.0.1' : 'localhost';
  if (p === '/robots.txt') { const r = R[host]; if (r === undefined) return send(404, 'none'); if (typeof r === 'number') return send(r, 'x', { 'Content-Type': 'text/plain' }); return send(200, r, { 'Content-Type': 'text/plain' }); }
  if (p === '/feed.xml') return send(200, feed());
  if (p === '/forbidden.xml') return send(403, 'no');
  if (p === '/r-same') return go('/blocked.xml');
  if (p === '/r-same-ok') return go('/feed.xml');
  if (p === '/r-cross') return go(`http://${other}:${PORT}/feed.xml`);
  if (p === '/r-cross-403') return go(`http://${other}:${PORT}/forbidden.xml`);
  if (p === '/r-two') return go('/r-cross');
  if (p === '/r-evil') return go('http://evil.example/feed.xml');
  if (p === '/r-a') return go('/r-b'); if (p === '/r-b') return go('/r-a'); if (p === '/r-self') return go('/r-self');
  if (p === '/r-xloop') return go(`http://${other}:${PORT}/r-xloop`);
  if (p === '/blocked.xml') return send(200, feed());
  if (p === '/disc') return go('/blocked-home');
  if (p === '/blocked-home') return send(200, '<html><link rel="alternate" type="application/rss+xml" href="/f.xml"></html>', { 'Content-Type': 'text/html' });
  send(404, 'unknown');
});
await new Promise(r => server.listen(0, '127.0.0.1', r)); PORT = server.address().port;
const hits = (host, p) => log.filter(x => x.host === host && x.p === p).length;

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'redir-test-')); let n = 0;
const realCfg = pathToFileURL(path.join(ROOT, 'data', 'rss-sources.mjs')).href;
const settings = { retentionDays: 7, maxItems: 400, timeoutMs: 15000, maxTries: 3, retryBaseMs: 30, gapMs: 0, maxBytes: 5242880 };
const B = h => `http://${h}:${PORT}`;
const pub = (feeds, extra = {}) => ({ id: 'st', name: 'Test Dept', sourceType: 'government', hosts: ['127.0.0.1', 'localhost'], feedHosts: ['127.0.0.1', 'localhost'], enabled: false, termsChecked: null, termsNote: 't', feeds: feeds.map(([id, p]) => ({ id, label: id, url: B('127.0.0.1') + p })), ...extra });
function run(pubs, args, { out = null, env = {} } = {}) {
  const cfg = path.join(TMP, `cfg${++n}.mjs`), o = out || path.join(TMP, `out${n}`);
  fs.writeFileSync(cfg, `export { COUNTRY_TERMS } from '${realCfg}';\nexport const SETTINGS = ${JSON.stringify(settings)};\nexport const PUBLISHERS = ${JSON.stringify(pubs)};\n`);
  return new Promise(resolve => {
    let out1 = ''; const c = spawn('node', [path.join(ROOT, 'scripts', 'fetch-rss.mjs'), ...args, '--out=' + o], { env: { ...process.env, RSS_CONFIG: cfg, RSS_ALLOW_HTTP: '1', RSS_NOW: '2026-11-20T08:00:00Z', RSS_GAP_MS: '0', RSS_RETRY_BASE_MS: '30', GITHUB_STEP_SUMMARY: '', ...env } });
    c.stdout.on('data', d => out1 += d); c.stderr.on('data', d => out1 += d);
    c.on('close', code => { let cache = null; try { cache = JSON.parse(fs.readFileSync(path.join(o, 'news-rss.json'), 'utf8')); } catch {} resolve({ code, log: out1, cache, out: o }); });
  });
}
const reset = () => { log = []; R = {}; };
const verify = (feeds, extra, env) => run([pub(feeds, extra)], ['--verify'], { env });

sec('A. robots.txt is checked for every address in a redirect chain');
reset(); R['127.0.0.1'] = 'User-agent: *\nDisallow: /blocked.xml\n';
let r = await verify([['s', '/r-same']]);
ok(r.code === 2 && /FAIL\s+s\s+.*redirect destination http:\/\/127\.0\.0\.1:\d+\/blocked\.xml: .*DISALLOWS/.test(r.log), 'same-host redirect into a robots.txt-disallowed path stops');
eq([hits('127.0.0.1', '/r-same'), hits('127.0.0.1', '/blocked.xml')], [1, 0], 'the disallowed destination was never requested (the allowed first address was requested once)');
ok(/ACCESS RESTRICTED/.test(r.log) && r.cache === null, 'it is reported as an access restriction; nothing is written');
reset(); r = await verify([['s', '/r-same-ok']]);
ok(r.code === 0 && /\(1 redirect\)/.test(r.log) && /redirect chain: http:\/\/127\.0\.0\.1:\d+\/r-same-ok -> http:\/\/127\.0\.0\.1:\d+\/feed\.xml/.test(r.log), 'an allowed same-host redirect is followed and the chain is reported');
eq(hits('127.0.0.1', '/robots.txt'), 1, 'robots.txt of one host is read once per run, not once per hop');
reset(); r = await verify([['c', '/r-cross']]);
ok(r.code === 0 && /redirect chain: .*127\.0\.0\.1.*-> http:\/\/localhost:\d+\/feed\.xml/.test(r.log), 'an allowed cross-host redirect (to another host the publisher lists) is followed');
eq([hits('127.0.0.1', '/robots.txt'), hits('localhost', '/robots.txt')], [1, 1], 'the destination host\'s OWN robots.txt was read before it was requested');
reset(); R['localhost'] = 'User-agent: *\nDisallow: /feed.xml\n'; r = await verify([['c', '/r-cross']]);
ok(r.code === 2 && /redirect destination http:\/\/localhost:\d+\/feed\.xml: .*DISALLOWS/.test(r.log) && hits('localhost', '/feed.xml') === 0, 'cross-host destination disallowed by ITS robots.txt: stops, destination never requested');
reset(); R['localhost'] = 403; r = await verify([['c', '/r-cross']]);
ok(r.code === 2 && /redirect destination .*robots\.txt answered HTTP 403/.test(r.log) && hits('localhost', '/feed.xml') === 0, 'destination host whose robots.txt answers 403: stops');
reset(); R['localhost'] = 500; r = await verify([['c', '/r-cross']], {}, { RSS_MAX_TRIES: '1' });
ok(r.code === 2 && /redirect destination .*robots\.txt could not be read/.test(r.log) && hits('localhost', '/feed.xml') === 0, 'destination host whose robots.txt cannot be read (unresolved): stops');
reset(); R['127.0.0.1'] = 'User-agent: *\nDisallow: /r-cross\n'; r = await verify([['c', '/r-two']]);
ok(r.code === 2 && /redirect destination http:\/\/127\.0\.0\.1:\d+\/r-cross: .*DISALLOWS/.test(r.log) && hits('127.0.0.1', '/r-cross') === 0 && hits('localhost', '/feed.xml') === 0, 'a middle hop of a longer chain is checked too, and nothing after it is requested');
reset(); r = await verify([['e', '/r-evil']]);
ok(r.code === 2 && /address on evil\.example refused: it is not one of Test Dept's feed hosts/.test(r.log) && !/evil\.example.*robots/.test(r.log), 'redirect to a host the publisher does not list is refused before anything is requested (no robots.txt lookup on it either)');
reset(); R['127.0.0.1'] = 'User-agent: *\nDisallow: /feed.xml\n'; r = await verify([['s', '/r-same-ok']]);
ok(r.code === 2 && hits('127.0.0.1', '/feed.xml') === 0, 'a Disallow rule written for the final address is honoured even though the first address was allowed');

sec('B. Crawl-delay');
reset(); R['127.0.0.1'] = 'User-agent: *\nCrawl-delay: 1\n'; r = await verify([['s', '/r-same-ok']]);
{ const a = log.filter(x => x.host === '127.0.0.1'); const t = x => a.filter(y => y.p === x).map(y => y.t); const gap = Math.min(...t('/feed.xml')) - Math.min(...t('/r-same-ok'));
  ok(r.code === 0 && /Crawl-delay 1 s honoured/.test(r.log) && gap >= 990, `the redirect hop waits for the host's Crawl-delay (waited ${gap} ms for a 1 s delay)`); }
reset(); R['localhost'] = 'User-agent: *\nCrawl-delay: 1\n'; r = await verify([['c', '/r-cross']]);
{ const robotsT = log.find(x => x.host === 'localhost' && x.p === '/robots.txt').t, feedT = log.find(x => x.host === 'localhost' && x.p === '/feed.xml').t;
  ok(r.code === 0 && feedT - robotsT >= 990, `a cross-host destination's own Crawl-delay is honoured (waited ${feedT - robotsT} ms)`); }
reset(); R['127.0.0.1'] = 'User-agent: *\nCrawl-delay: 120\n'; r = await verify([['s', '/feed.xml']]);
ok(r.code === 2 && /Crawl-delay of 120 s, longer than the 30 s/.test(r.log) && hits('127.0.0.1', '/feed.xml') === 0, 'a Crawl-delay longer than 30 s means the feed is not requested (it is never shortened)');

sec('C. Loops and limits');
reset(); r = await verify([['a', '/r-a']]);
ok(r.code === 2 && /redirect loop: .*\/r-a was already requested/.test(r.log), 'a two-address redirect loop is named and stops'); eq([hits('127.0.0.1', '/r-a'), hits('127.0.0.1', '/r-b')], [1, 1], 'each address of the loop was requested once');
reset(); r = await verify([['a', '/r-self']]); ok(/redirect loop/.test(r.log) && hits('127.0.0.1', '/r-self') === 1, 'an address that redirects to itself stops after one request');
reset(); r = await verify([['a', '/r-xloop']]); ok(/redirect loop|more than 3 redirects/.test(r.log) && log.filter(x => x.p === '/r-xloop').length <= 2, 'a loop across two hosts stops');

sec('D. 403 and nothing else: no bypass');
reset(); r = await verify([['f', '/forbidden.xml']]);
ok(r.code === 2 && /FAIL\s+f\s+HTTP 403/.test(r.log) && /ACCESS RESTRICTED/.test(r.log) && /not bypassed/.test(r.log), 'HTTP 403 is reported as an access restriction');
eq(hits('127.0.0.1', '/forbidden.xml'), 1, 'a 403 is requested exactly once: no retry, no second attempt');
reset(); r = await verify([['f', '/r-cross-403']]); eq(hits('localhost', '/forbidden.xml'), 1, 'a 403 at the end of a redirect chain is also requested once');
{ // every request the script made carries the same, plain set of headers: no cookies, referer, authorization, proxy or spoofed browser headers
  reset(); await verify([['s', '/r-same-ok'], ['c', '/r-cross'], ['f', '/forbidden.xml']]);
  const names = new Set(log.flatMap(x => Object.keys(x.headers))); const uas = new Set(log.map(x => x.headers['user-agent']));
  ok(![...names].some(h => /^(cookie|referer|authorization|proxy-authorization|x-forwarded-for|via|origin)$/i.test(h)), 'no cookie, referer, authorization, proxy or forwarding header is ever sent');
  ok(uas.size === 1 && /^GlobalRiskMonitor\/3 \(personal non-commercial dashboard/.test([...uas][0]), 'one honest User-Agent on every request, robots.txt and redirects included');
  const src = fs.readFileSync(path.join(ROOT, 'scripts/http-lib.mjs'), 'utf8') + fs.readFileSync(path.join(ROOT, 'scripts/fetch-rss.mjs'), 'utf8');
  ok(!/ProxyAgent|setGlobalDispatcher|HTTP_PROXY|Mozilla\/|Googlebot|X-Forwarded/i.test(src), 'the code has no proxy, browser-impersonation or forwarding logic');
}

sec('E. Fetch mode and discovery obey the same rules');
{
  reset(); const keep = path.join(TMP, 'keep'); const P = pub([['s', '/r-same-ok']], { enabled: true, termsChecked: '2026-11-27', blockers: [] });
  let f = await run([P], ['--fetch'], { out: keep }); ok(f.code === 0 && f.cache.items.length === 1, 'baseline: a cleared mock source is fetched through an allowed redirect');
  reset(); R['127.0.0.1'] = 'User-agent: *\nDisallow: /feed.xml\n'; f = await run([P], ['--fetch'], { out: keep });
  ok(f.code === 2 && /redirect destination .*DISALLOWS/.test(f.cache.feeds.s.error) && f.cache.items.length === 1 && hits('127.0.0.1', '/feed.xml') === 0, 'fetch: a redirect into a disallowed path stops, the cached article is kept, the reason is recorded, the destination is never requested');
  reset(); R['localhost'] = 403; const P2 = pub([['c', '/r-cross']], { enabled: true, termsChecked: '2026-11-27', blockers: [] }); f = await run([P2], ['--fetch']);
  ok(f.code === 2 && /robots\.txt answered HTTP 403/.test(f.cache.feeds.c.error) && hits('localhost', '/feed.xml') === 0, 'fetch: a cross-host destination with restricted robots.txt stops');
  reset(); R['127.0.0.1'] = 'User-agent: *\nDisallow: /blocked-home\n'; r = await run([pub([], { discoverUrl: B('127.0.0.1') + '/disc' })], ['--verify']);
  ok(/feed discovery failed: redirect destination .*\/blocked-home: .*DISALLOWS/.test(r.log) && hits('127.0.0.1', '/blocked-home') === 0, 'discovery pages are gated on redirects too');
}

sec('F. The HTTP client hook itself (scripts/http-lib.mjs)');
{
  reset(); const calls = []; const c = createClient({ ua: 'T', allowHttp: true, maxTries: 3, retryBaseMs: 10 });
  const res = await c.request(B('127.0.0.1') + '/r-cross', { hosts: ['127.0.0.1', 'localhost'], who: 'T', before: async (u, hop) => { calls.push([hop, new URL(u).host.split(':')[0]]); } });
  eq(calls, [[0, '127.0.0.1'], [1, 'localhost']], 'before() is called for the first address and then each redirect destination, in order'); eq(res.chain.length, 2, 'the chain of requested addresses is returned');
  reset(); let k = 0; let err = null; try { await c.request(B('127.0.0.1') + '/r-same-ok', { hosts: ['127.0.0.1'], who: 'T', before: async (u, hop) => { k++; if (hop === 1) throw new Error('stop here'); } }); } catch (e) { err = e; }
  ok(err && err.message === 'stop here' && k === 2, 'an error from before() ends the request and is passed on unchanged'); eq(hits('127.0.0.1', '/feed.xml'), 0, '...and the address it refused was not requested');
  reset(); try { await c.request(B('127.0.0.1') + '/r-a', { hosts: ['127.0.0.1'], who: 'T' }); } catch (e) { err = e; } ok(err instanceof FetchError && /redirect loop/.test(err.message), 'loop detection works in the client for every caller');
  reset(); R['127.0.0.1'] = 'x'; await c.request(B('127.0.0.1') + '/feed.xml', { hosts: ['127.0.0.1'], who: 'T' }); ok(true, 'a call without a hook behaves as before (GDELT and risk fetchers pass none)');
}
{
  const g = fs.readFileSync(path.join(ROOT, 'scripts/fetch-gdelt-files.mjs'), 'utf8') + fs.readFileSync(path.join(ROOT, 'scripts/fetch-risk-inputs.mjs'), 'utf8');
  ok(!/before:/.test(g), 'the GDELT and risk fetchers pass no hook: their requests are unchanged by this stage');
}

server.close(); fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n${pass} checks passed${fail ? ', ' + fail + ' FAILED' : ''}. Reminder: simulated only (local mock server); no real website was contacted.`);
process.exit(fail ? 1 : 0);
