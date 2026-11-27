// OPTIONAL browser test for the secondary GDELT search-API section. Renders the real page in headless Chrome with fake cache files, in the
// collapsed and expanded states, for: successful, stale, partly failed, failed (with and without cached articles), empty, reused, unreadable, missing, and
// "rules cannot be loaded". Needs puppeteer and a Chrome binary:   PUPPETEER=/path/to/node_modules/puppeteer CHROME=/path/to/chrome node tests/render-secondary.cjs
// Without them it prints "skipped" and exits 0. Simulated data only; the browser never contacts GDELT (the page has no such code).
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const ROOT = path.resolve(__dirname, '..');
let puppeteer; try { puppeteer = require(process.env.PUPPETEER || 'puppeteer'); } catch (e) { console.log('skipped: puppeteer not found (set PUPPETEER=/path/to/puppeteer)'); process.exit(0); }
const CHROME = process.env.CHROME || ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(p => fs.existsSync(p));
if (!CHROME) { console.log('skipped: no Chrome binary (set CHROME=...)'); process.exit(0); }
const now = Date.now(), iso = h => new Date(now - h * 36e5).toISOString(), sd = h => iso(h).replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const A = (title, url, h) => ({ title, url, domain: new URL(url).hostname.replace(/^www\./, ''), seendate: sd(h), language: 'English', sourcecountry: 'US' });
const arts = { USA: [A('US imposes sanctions on Chinese chip firms', 'https://www.reuters.com/a', 2), A('US imposes sanctions on Chinese chip firms - Reuters', 'https://syn.example.test/a', 2), A('Indian student killed in US', 'https://x.test/b', 3),
    A('Mass shooting at US high school leaves two hurt', 'https://x.test/c', 3), A('Local bakery wins regional award', 'https://x.test/bak', 3), A('US Senate passes defense bill', 'https://www.apnews.com/e', 5)],
  CHN: [A('China central bank cuts interest rates', 'https://x.test/c1', 6), A('iShares China ETF net asset value update', 'https://x.test/etf', 6)], RUS: [A('Russia launches missile strikes on Kyiv', 'https://x.test/r1', 3)],
  UKR: [A('Russia launches missile strikes on Kyiv', 'https://x.test/r1', 3)], TWN: [A('Taiwan holds military drills as US envoy visits', 'https://x.test/t1', 4)] };
const ids = ['USA', 'CHN', 'RUS', 'UKR', 'TWN'];
const mkc = (k, o = {}) => ({ query: k, status: 'ok', attempted: true, error: null, fetchedAt: iso(1), checkedAt: iso(0.9), articles: arts[k], ...o });
const wrap = (f, o = {}) => ({ schema: 2, source: 'GDELT DOC 2.0 API', timespan: '3d', checkedAt: iso(0.9), lastSuccessAt: iso(1), countries: Object.fromEntries(ids.map(k => [k, f(k)])), ...o });
const S = {
  ok: () => wrap(k => mkc(k)),
  stale: () => wrap(k => mkc(k, { fetchedAt: iso(40), checkedAt: iso(39.9) }), { checkedAt: iso(39.9), lastSuccessAt: iso(40) }),
  partial: () => wrap(k => ['USA', 'CHN', 'RUS'].includes(k) ? mkc(k, { status: 'error', error: 'GDELT is rate limiting requests.', fetchedAt: iso(30) }) : k === 'UKR' ? mkc(k, { status: 'error', attempted: false, error: 'Not attempted this run: time budget.', fetchedAt: iso(30) }) : mkc(k)),
  failedall: () => wrap(k => mkc(k, { status: 'error', error: 'GDELT returned HTTP 503.', fetchedAt: null, articles: [] }), { lastSuccessAt: null }),
  failedcached: () => wrap(k => mkc(k, { status: 'error', error: 'GDELT returned HTTP 503.', fetchedAt: iso(20) }), { lastSuccessAt: iso(20) }),
  empty: () => wrap(k => mkc(k, { articles: [] })),
  reused: () => wrap(k => ['USA', 'CHN'].includes(k) ? mkc(k, { fetchedAt: iso(4), checkedAt: iso(4) }) : mkc(k)),
  invalid: () => ({ schema: 2, checkedAt: iso(1) }), missing: null, norules: () => wrap(k => mkc(k))
};
// what each state must show: [text expected in the header line, text expected in the always-visible warning (null = no warning), text expected after expanding]
const EXPECT = {
  ok: [/Last success: \d+ min ago.*all 5 OK.*No cached data in use/, null, /sanctions on Chinese chip firms[\s\S]*Mentioned in passing[\s\S]*Filtered out/],
  stale: [/Last success: 40 h ago/, /Data is stale: last successful update 40 h ago/, /Stale/],
  partial: [/4 of 5 not refreshed.*Cached data in use: 4 of 5/, /3 of 5 countries failed, 1 not attempted\. Showing cached articles/, /Cached: latest refresh failed/],
  failedall: [/No successful update yet.*5 of 5 not refreshed/, /5 of 5 countries failed\. No cached articles to show/, /No cached articles for this country/],
  failedcached: [/5 of 5 not refreshed.*Cached data in use: 5 of 5/, /Showing cached articles/, /Cached: latest refresh failed/],
  empty: [/all 5 OK/, null, /GDELT returned no articles for this search in the cached window \(3d\)/],
  reused: [/all 5 OK.*Cached data in use: 2 of 5/, null, /sanctions/],
  invalid: [/Unreadable cache/, /no country entries/, ''], missing: [/Unavailable/, /could not be read \(file not found\)/, /never calls GDELT/],
  norules: [/all 5 OK/, null, /could not be loaded in this browser[\s\S]*WITHOUT relevance/]
};
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  let n = 0, bad = 0; const ok = (c, m) => { n++; if (!c) { bad++; console.log('  FAIL: ' + m); } };
  for (const sc of Object.keys(S)) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grm-')); fs.cpSync(ROOT, dir, { recursive: true, filter: s => !/node_modules|\.git(\/|$)/.test(s) });
    fs.rmSync(path.join(dir, 'data/cache'), { recursive: true, force: true }); fs.mkdirSync(path.join(dir, 'data/cache'));
    if (S[sc]) fs.writeFileSync(path.join(dir, 'data/cache/news.json'), JSON.stringify(S[sc]()));
    if (sc === 'norules') fs.rmSync(path.join(dir, 'scripts/secondary-lib.mjs'));
    const srv = http.createServer((q, r) => { const f = path.join(dir, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html')); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(d); } }); });
    await new Promise(r => srv.listen(0, r)); const port = srv.address().port;
    const p = await b.newPage(), errs = []; p.on('pageerror', e => errs.push(String(e))); await p.setViewport({ width: 1300, height: 1000 });
    await p.goto(`http://localhost:${port}/index.html#USA`, { waitUntil: 'networkidle2', timeout: 60000 }).catch(e => errs.push(String(e))); await new Promise(r => setTimeout(r, 2500));
    const grab = () => p.evaluate(() => { const w = document.querySelector('.sec2'), bd = w.querySelector('.sec2b'), wl = w.querySelector(':scope > .warnline'); return { exp: w.querySelector('.sec2h').getAttribute('aria-expanded'), hidden: bd.hidden, head: w.querySelector('.sec2h').innerText.replace(/\s*\n\s*/g, ' '), warn: wl ? wl.innerText.replace(/\s*\n\s*/g, ' ') : null, body: bd.hidden ? '' : bd.innerText, primary: /Official and publisher feeds/.test(document.querySelector('#news').innerText) && /GDELT open data files/.test(document.querySelector('#news').innerText) && !!document.querySelector('#news > h3, #news > div > h3') }; });
    const c = await grab(), [eh, ew, eb] = EXPECT[sc];
    ok(c.exp === 'false' && c.hidden === true, `${sc}: collapsed by default`);
    ok(eh.test(c.head), `${sc}: header shows ${eh}  (got: ${c.head})`);
    ok(ew ? ew.test(c.warn || '') : !c.warn, `${sc}: compact warning ${ew ? 'shown while collapsed: ' + ew : 'absent'}  (got: ${c.warn})`);
    ok(c.primary, `${sc}: the primary open-data/RSS sections are still on the page`);
    await p.click('.sec2h'); await new Promise(r => setTimeout(r, 300)); await p.evaluate(() => document.querySelectorAll('.sec2b details').forEach(d => d.open = true));
    const x = await grab(); ok(x.exp === 'true' && x.hidden === false, `${sc}: expands on click`); ok(typeof eb === 'string' ? x.body.length >= 0 && (eb === '' || eb.test(x.body)) : eb.test(x.body), `${sc}: expanded content ${eb}`);
    await p.evaluate(() => { location.hash = '#CHN'; }); await new Promise(r => setTimeout(r, 800)); const s2 = await grab(); ok(s2.exp === 'true', `${sc}: stays open when another country is selected`);
    if (sc === 'ok') { await p.click('.sec2h'); const y = await grab(); ok(y.exp === 'false' && y.hidden, 'ok: collapses again on click'); }
    ok(errs.length === 0, `${sc}: no page errors ${errs.join(' ')}`);
    await p.close(); srv.close(); fs.rmSync(dir, { recursive: true, force: true });
  }
  await b.close(); console.log(`\n${n - bad} of ${n} render checks passed. ${bad ? bad + ' FAILED.' : ''} Fake cache files only; no real GDELT request, nothing on GitHub.`); process.exit(bad ? 1 : 0);
})();
