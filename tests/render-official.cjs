// OPTIONAL browser test for Stage 7B: how official communications look on the page. Fake cache file with one government item, one UN item and one publisher
// report; a second scenario is an OLD cache without any sourceType. Needs puppeteer and Chrome:  PUPPETEER=/path/to/puppeteer node tests/render-official.cjs
// Without them it prints "skipped". Simulated data only: no real feed, no real website.
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const ROOT = path.resolve(__dirname, '..');
let puppeteer; try { puppeteer = require(process.env.PUPPETEER || 'puppeteer'); } catch (e) { console.log('skipped: puppeteer not found (set PUPPETEER=/path/to/puppeteer)'); process.exit(0); }
const CHROME = process.env.CHROME || ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(p => fs.existsSync(p));
if (!CHROME) { console.log('skipped: no Chrome binary (set CHROME=...)'); process.exit(0); }
const now = Date.now(), iso = h => new Date(now - h * 36e5).toISOString();
const item = (title, url, publisher, publisherId, sourceType, h, extra = {}) => ({ title, url, publisher, publisherId, ...(sourceType ? { sourceType } : {}), feedId: 'f-' + publisherId, published: iso(h), firstSeenAt: iso(h),
  matches: { USA: { level: 'country', terms: ['US'], role: 'primary' } }, relevance: { score: 3, tier: 'high', topics: [{ label: 'Diplomacy', terms: ['talks'] }] }, source: { tier: 'unassessed' }, ...extra });
const TYPES = { journalism: { label: 'Publisher reporting', official: false, note: 'Reporting by a news publisher.' },
  government: { label: 'Government communications', official: true, note: 'An official statement by a government. It is not independently verified and it is not independent corroboration of other reports.' },
  'international-organisation': { label: 'International organization communications', official: true, note: 'A communication by an international organization. It is not independently verified here and it is not independent corroboration of other reports.' } };
const feeds = { 'f-a': { id: 'f-a', publisherId: 'a', publisher: 'Outlet A', label: 'World', status: 'ok', lastSuccessAt: iso(1), checkedAt: iso(1) }, 'f-state': { id: 'f-state', publisherId: 'state', publisher: 'Test Department', label: 'Press', status: 'ok', lastSuccessAt: iso(1), checkedAt: iso(1) }, 'f-un': { id: 'f-un', publisherId: 'un', publisher: 'Test UN News', label: 'All', status: 'ok', lastSuccessAt: iso(1), checkedAt: iso(1) } };
const NEW = () => ({ schema: 1, generatedAt: iso(1), checkedAt: iso(1), lastSuccessAt: iso(1), retentionDays: 7, sourceTypes: TYPES,
  publishers: [{ id: 'a', name: 'Outlet A', termsChecked: '2026-11-20', sourceType: 'journalism' }, { id: 'state', name: 'Test Department', termsChecked: '2026-11-27', sourceType: 'government' }, { id: 'un', name: 'Test UN News', termsChecked: '2026-11-27', sourceType: 'international-organisation' }],
  terms: {}, feeds,
  items: [item('US and China hold talks on sanctions', 'https://outlet-a.test/1', 'Outlet A', 'a', 'journalism', 2), item('Secretary of State statement on US talks with China', 'https://dept.test/p/1', 'Test Department', 'state', 'government', 2),
    item('UN Security Council meets on US sanctions talks', 'https://un.test/s/1', 'Test UN News', 'un', 'international-organisation', 3)] });
const OLD = () => { const j = NEW(); delete j.sourceTypes; j.publishers.forEach(p => delete p.sourceType); j.items.forEach(i => delete i.sourceType); j.items = j.items.slice(0, 1); return j; };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  let n = 0, bad = 0; const ok = (c, m) => { n++; if (!c) { bad++; console.log('  FAIL: ' + m); } };
  for (const sc of ['new', 'old']) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grm-off-')); fs.cpSync(ROOT, dir, { recursive: true, filter: s => !/node_modules|\.git(\/|$)/.test(s) });
    fs.rmSync(path.join(dir, 'data/cache'), { recursive: true, force: true }); fs.mkdirSync(path.join(dir, 'data/cache'));
    fs.writeFileSync(path.join(dir, 'data/cache/news-rss.json'), JSON.stringify(sc === 'new' ? NEW() : OLD()));
    const srv = http.createServer((q, r) => { const f = path.join(dir, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html')); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(d); } }); });
    await new Promise(r => srv.listen(0, r)); const port = srv.address().port;
    for (const vp of [[1300, 1000], [390, 900]]) {
      const p = await b.newPage(), errs = []; p.on('pageerror', e => errs.push(String(e))); await p.setViewport({ width: vp[0], height: vp[1] });
      await p.goto(`http://localhost:${port}/index.html#USA`, { waitUntil: 'networkidle2', timeout: 60000 }).catch(e => errs.push(String(e))); await new Promise(r => setTimeout(r, 2500));
      const g = await p.evaluate(() => { const news = document.querySelector('#news'), h = [...news.querySelectorAll('h4')].find(x => /^Official communications/.test(x.innerText)); const lis = [...news.querySelectorAll('li')];
        const li = t => lis.find(l => l.innerText.includes(t)); const A = li('US and China hold talks'), S = li('Secretary of State statement'), U = li('UN Security Council');
        return { heading: h ? h.innerText : null, txt: news.innerText, imgs: news.querySelectorAll('img').length, aInOfficialSection: h ? !!(h.compareDocumentPosition(A) & Node.DOCUMENT_POSITION_PRECEDING) : null,
          sPos: S && h ? !!(h.compareDocumentPosition(S) & Node.DOCUMENT_POSITION_FOLLOWING) : null, sPill: S ? [...S.querySelectorAll('.pill')].map(x => x.innerText.trim()) : [], sHref: S ? S.querySelector('a').href : null, uHref: U ? U.querySelector('a').href : null,
          sText: S ? S.innerText : '', aText: A ? A.innerText : '', uPill: U ? [...U.querySelectorAll('.pill')].map(x => x.innerText.trim()) : [], scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth }; });
      const tag = `${sc}/${vp[0]}`;
      ok(errs.length === 0, `${tag}: no page errors ${errs.join(' ')}`);
      ok(g.imgs === 0, `${tag}: no image in the news area`);
      if (sc === 'new') {
        ok(g.heading === 'Official communications (2)', `${tag}: separate "Official communications" list with its count (got ${g.heading})`);
        ok(g.aInOfficialSection === true && g.sPos === true, `${tag}: publisher reporting comes before the official list; official item sits inside it`);
        ok(g.sPill.includes('Government communications') && g.uPill.includes('International organization communications'), `${tag}: each official item carries its classification label (${g.sPill} / ${g.uPill})`);
        ok(/Official communication: .*not independently verified.*not independent corroboration/.test(g.sText), `${tag}: the item says it is not independently verified or corroboration`);
        ok(!/Government communications|Official communication:/.test(g.aText), `${tag}: the publisher report is not labelled as official`);
        ok(g.sHref === 'https://dept.test/p/1' && g.uHref === 'https://un.test/s/1', `${tag}: direct links to the original publications`);
        ok(/Test Department/.test(g.sText) && /Published \d{4}-\d\d-\d\d/.test(g.sText), `${tag}: source name and publication date shown`);
        ok(!/Also reported by/.test(g.sText + g.aText), `${tag}: no "Also reported by" involving an official item`);
        ok(/Government communications; terms checked 2026-11-27/.test(g.txt), `${tag}: the sources line states each publisher's type`);
        if (vp[0] === 390) console.log('  note ' + tag + ': page width ' + g.scrollW + ' vs viewport ' + g.clientW + ' (informational)');
      } else {
        ok(g.heading === null && !/Official communication/.test(g.txt), `${tag}: an old cache without sourceType shows no official section and no new labels`);
        ok(/US and China hold talks/.test(g.txt) && !/Publisher reporting; terms checked/.test(g.txt) && /Outlet A \(terms checked 2026-11-20\)/.test(g.txt), `${tag}: old cache is displayed exactly as before`);
      }
      await p.close();
    }
    srv.close(); fs.rmSync(dir, { recursive: true, force: true });
  }
  await b.close(); console.log(`\n${n - bad} of ${n} render checks passed. ${bad ? bad + ' FAILED.' : ''} Fake cache file only; no real feed, nothing on GitHub.`); process.exit(bad ? 1 : 0);
})();
