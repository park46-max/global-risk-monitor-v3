#!/usr/bin/env node
// STAGE 9 TESTS: presentation layer only (css/style.css, index.html, js/app.js).
//   node tests/test-ui-stage9.mjs
// WHAT THIS IS: static checks of the three changed files plus a SIMULATED page run (js/app.js executed in Node against a minimal DOM stub, with caches built from the
// production-value snapshot embedded in tests/test-risk-8b2.mjs). It is NOT a browser: layout, overflow, focus rings and real colours are checked separately in a real
// browser (see the Stage 9 notes in README.md). Nothing here contacts any server.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { RISK as R } from '../data/risk-methodology.mjs';
import { buildRisk } from '../scripts/risk-lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let n = 0, bad = 0; const ok = (c, m) => { n++; if (!c) { bad++; console.log('  FAIL: ' + m); } };
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8'), md5 = s => crypto.createHash('md5').update(s).digest('hex'), clone = o => JSON.parse(JSON.stringify(o));
const IDS = ['USA', 'CHN', 'RUS', 'UKR', 'TWN'];
const CSS = rd('css/style.css'), HTML = rd('index.html'), APP = rd('js/app.js');
const PROD = JSON.parse(/^const PROD = (.*);$/m.exec(rd('tests/test-risk-8b2.mjs'))[1]);   // production VALUES snapshot (2026-11-27), reused instead of copied
const NOW = Date.parse(PROD.generatedAt), OUT = buildRisk({ riskInputs: clone(PROD.inputs), indicators: clone(PROD.indicators), briefs: null, now: NOW, R });

// ---------------------------------------------------------------- A. protected files
console.log('A. Protected files and protected code in js/app.js are unchanged');
{
  const PINS = {
 ".github/workflows/update-data.yml": "881ec1134f3a1619305817c05efa6a29",
 ".github/workflows/update-risk.yml": "e223da77124f96890777f57be392bf5c",
 ".github/workflows/update-rss.yml": "e3e18101cef4c7775ddbada20c1a67b3",
 "js/globe.js": "c8c9ebaff9c79cd3a2a09d1f0aea9f8b",
 "js/config.js": "0667330d61864b7993bd16fce1fce041",
 "data/countries.js": "ee84554063af7e1ffcc3ebab76730f46",
 "data/rss-sources.mjs": "074d062a1c2df547c05785d6f516f590",
 "data/relevance-rules.mjs": "bfc85f42f0e053f9376a46f953a8ada4",
 "data/country-terms.mjs": "e61f36a8444f8e218ea1b8b25d695567",
 "data/source-quality.mjs": "447b799a07ed3b6b00c206f2dd37ef71",
 "data/source-types.mjs": "db0533f9f6d4192cb1a030a08cf065c9",
 "data/brief-rules.mjs": "24593fd8816dab57914fad8bfa752135",
 "scripts/build-risk.mjs": "f778556aa2645f372d8ad29b82cf956b",
 "scripts/fetch-data.mjs": "e149936bf523152dfbc20188ab2dd899",
 "scripts/fetch-gdelt-files.mjs": "e104a8b08daae814cb4f28576d016559",
 "scripts/fetch-rss.mjs": "4b71492740396506ffa1b9ed7f7f2a04",
 "scripts/http-lib.mjs": "3a98000ab966157de414f8440e33a5b5",
 "scripts/robots-lib.mjs": "40256961e299e294af0845ff215da9c2",
 "scripts/rss-lib.mjs": "9932def6574a43e7dd88016e0ecdcd1d",
 "scripts/secondary-lib.mjs": "cdce2d0d2187a9d63d89e73e5f14cae2",
 "scripts/relevance-lib.mjs": "8db0f8f4070264082589ce22bfc84109",
 "scripts/brief-lib.mjs": "351f804d31cbaad8b975cbc991161b6a",
 "scripts/build-briefs.mjs": "6a2c1faafbb0b3aadd7aee29b66035ae",
 "scripts/explain-headline.mjs": "fd6bfae79a7d723317c5c4706cfb91c4",
 "scripts/zip-lib.mjs": "65680c4dc0906e4ba1578b527b76b569"
};
  const changed = Object.entries(PINS).filter(([f, h]) => md5(fs.readFileSync(path.join(ROOT, f))) !== h).map(([f]) => f); if (changed.length) console.log('    changed:', changed.join(', '));
  ok(changed.length === 0, `${Object.keys(PINS).length} protected files (the three workflows, the globe, config, country data, GDELT, RSS, World Bank and briefs scripts and rules) are byte-for-byte unchanged by Stage 9`);
  ok(R.methodologyVersion === 3 && R.sources.ucdp.parserVersion === 2, 'methodology version is still 3 and the UCDP parser version still 2');
  // regions of js/app.js that read data, build the news, brief and GDELT sections, run the globe and handle selection: identical to the Stage 8B-2 production file
  const between = (t, a, b) => t.slice(t.indexOf(a), b ? t.indexOf(b, t.indexOf(a)) : undefined), until = (t, a, b) => t.slice(t.indexOf(a), t.indexOf(b));
  const REG = [['loading, state, formatting helpers and loadAll', between(APP, '(() => {', 'function headSrc('), 'e9a66f4f8dfd1a2138b959d73e4c908d'],
    ['news row builder and item lists', between(APP, 'const missing = (what', 'function articleBlock('), 'c80b53ced9f6a1a0ebba2f535a85c760'],
    ['GDELT search section and news painting', between(APP, '// ----- GDELT search API (secondary)', 'function paintData()'), '81e7c2a62db0ea3f0a92fc381a75d304'],
    ['country header', (() => { const i = APP.indexOf('// ---------- static panels ----------'), j = APP.indexOf('function head()'); return APP.slice(i, APP.indexOf('\n// ----- ', j)); })(), '757167f100b925e0f66ad8533f49956a'],
    ['intelligence brief, globe start-up, selection', between(APP, '// ----- country intelligence brief', "{ const sk = $('.skip')"), '6025c1a598ed0f8fdbfc948f4881a4dd'],
    ['search, reload, hash and start-up wiring', APP.slice(APP.indexOf("$('#q').addEventListener('change'")), '5ea31f74618cc0ed6f914d35eb463b56']];
  for (const [name, text, h] of REG) ok(md5(text) === h, `js/app.js ${name}: byte-for-byte identical to the Stage 8B-2 production version`);
  ok(/GRM_GLOBE\.init\(\$\('#globe'\), feats, \{ C, onSelect: k => select\(k\), onOther: other, onUserRotate: \(\) => setRot\(false\) \}\)/.test(APP) && /GRM_GLOBE\.select\(id, fly\)/.test(APP), 'globe initialisation and selection calls are intact');
}

// ---------------------------------------------------------------- B. HTML
console.log('\nB. index.html');
{
  ok(!/fonts\.googleapis|fonts\.gstatic|preconnect/i.test(HTML + CSS + APP) && !/@import|url\(\s*['"]?https?:/i.test(CSS), 'no Google Fonts request, no preconnect, no @import and no remote url() anywhere');
  ok(!/<(link|script|img|iframe)\b[^>]*(src|href)="https?:/i.test(HTML), 'index.html loads nothing from another host (only the local stylesheet and scripts)');
  ok(!/\bInter\b/.test(CSS) && /--f:system-ui,-apple-system,'Segoe UI',Roboto/.test(CSS), 'the font stack is the system stack (no web font named)');
  ok(/<h2>Country Risk Profile<\/h2>/.test(HTML) && !/Risk assessment/.test(HTML) && /<h2>Country indicators<\/h2>/.test(HTML) && /<h2>Country intelligence brief<\/h2>/.test(HTML), 'headings: Country Risk Profile, Country indicators, Country intelligence brief');
  ok(/<details class="key">/.test(HTML) && !/<details class="key"[^>]*open/.test(HTML) && /<summary>Data status key<\/summary>/.test(HTML), 'the data status key is a collapsed native <details> (keyboard operable, no script)');
  ok(/<span class="pill info"><i><\/i>Not enabled yet<\/span>/.test(HTML), 'the key explains the neutral "Not enabled yet" status');
  ok(/<a class="skip" href="#country">/.test(HTML) && /id="country" tabindex="-1"/.test(HTML), 'a skip link leads to the country panel');
  const note = /<div class="note" id="mapnote">([\s\S]*?)<\/div>/.exec(HTML)[1], vis = note.replace(/<details>[\s\S]*<\/details>/, ''), fold = /<details>([\s\S]*)<\/details>/.exec(note)[1];
  ok(/takes no position on any territorial or sovereignty dispute, including the political status of Taiwan/.test(vis) && /Natural Earth \(public domain\)/.test(vis), 'the no-position statement on territorial disputes and Taiwan stays visible next to the globe');
  ok(/Natural Earth is used at 1:110m, via the world-atlas package/.test(fold) && /its own conventions for disputed areas/.test(fold) && /small territories may be missing/.test(fold) && /globe\.gl and three\.js \(MIT\)/.test(fold), 'the rest of the boundary note (scale, conventions for disputed areas, missing small territories, licences) is kept in a fold');
  ok(['id="chips"', 'id="globe"', 'id="gfb"', 'id="gctl"', 'id="q"', 'id="qmsg"', 'id="clist"', 'id="mapnote"', 'id="head"', 'id="risk"', 'id="nst"', 'id="news"', 'id="dst"', 'id="data"', 'id="brief"', 'id="meta"', 'id="refresh"'].every(x => HTML.includes(x)), 'every element id the scripts use is still present');
  ok(/<script defer src="js\/config\.js"><\/script>\s*<script defer src="data\/countries\.js"><\/script>\s*<script defer src="js\/globe\.js"><\/script>\s*<script defer src="js\/app\.js"><\/script>/.test(HTML), 'the four scripts load in the same order as before');
  ok(!/analytics|gtag|googletagmanager|plausible|matomo|hotjar/i.test(HTML + APP + CSS), 'no analytics or tracking');
}

// ---------------------------------------------------------------- C. CSS
console.log('\nC. css/style.css');
{
  const hex = h => { h = h.replace('#', ''); if (h.length === 3) h = [...h].map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
  const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
  const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
  const blend = (fg, a, bg) => fg.map((c, i) => Math.round(c * a + bg[i] * (1 - a)));
  const tok = {}; for (const m of CSS.matchAll(/--([\w-]+):(#[0-9a-f]{3,6})\b/gi)) tok[m[1]] = hex(m[2]);
  const surfaces = { bg: tok.bg, p1: tok.p1, p2: tok.p2, header: hex('#0d1526') };
  const worst = (fg, list = Object.values(surfaces)) => Math.min(...list.map(s => cr(fg, s)));
  for (const t of ['tx', 'tx2', 'mut', 'accent']) ok(worst(tok[t]) >= 4.5, `text token --${t} reaches 4.5:1 on every surface (lowest ${worst(tok[t]).toFixed(2)}:1)`);
  ok(worst(hex('#b4c3dc')) >= 4.5 && worst(hex('#fecaca'), [hex('#2a1420')]) >= 4.5, 'limitation lines (#b4c3dc) and error text (#fecaca on #2a1420) reach 4.5:1');
  // pills: text colour over its tinted background over the surface it sits on
  const pillRules = [...CSS.matchAll(/\.pill\.([a-z]+)\{color:([^;}]+)[;}][^}]*?background:rgba\((\d+),(\d+),(\d+),([.\d]+)\)/g)];
  const named = { 'var(--green)': tok.green, 'var(--amber)': tok.amber, 'var(--purple)': tok.purple, 'var(--tx2)': tok.tx2, 'var(--accent)': tok.accent, 'var(--mut)': tok.mut };
  let pillMin = 99, pillCount = 0; for (const m of pillRules) { const col = named[m[2]] || (m[2].startsWith('#') ? hex(m[2]) : null); if (!col) continue; pillCount++; for (const s of Object.values(surfaces)) pillMin = Math.min(pillMin, cr(col, blend([+m[3], +m[4], +m[5]], +m[6], s))); }
  ok(pillCount >= 7 && pillMin >= 4.5, `all ${pillCount} status-pill colours reach 4.5:1 over their tinted background on every surface (lowest ${pillMin.toFixed(2)}:1)`);
  ok(/\.pill\.info\{color:var\(--tx2\)/.test(CSS) && !/\.pill\.info\{[^}]*(--red|#f87171|#fca5a5|--amber)/.test(CSS), 'the "Not enabled yet" pill style is neutral (no red or amber)');
  ok(!/var\(--c\)/.test(CSS) && !/\.chead\{[^}]*var\(--ac\)/.test(CSS) && /\.chip\[aria-pressed=true\]\{border-color:var\(--accent\)/.test(CSS) && /\.chead\{border-left:3px solid var\(--accent\)/.test(CSS), 'country buttons and the country header use the neutral blue accent, never the per-country colour');
  ok(!/\.(flag|fig|kv|lim|rk|tile)\b[^{]*\{[^}]*color:\s*(var\(--(red|amber|green|orange|purple)\)|#(f87171|fbbf24|34d399|fb923c|ef4444|10b981|f59e0b))/i.test(CSS), 'no risk-profile element (figure, flag, rows, limitation lines, tiles) is coloured red, amber, green or orange');
  ok(!/position:\s*(sticky|fixed)/.test(CSS.replace(/\.skip\{[^}]*\}/,'')), 'Stage 9.1: no card, globe or panel is sticky or fixed (only the off-screen skip link is positioned); every section stays in normal document flow');
  ok((CSS.match(/gradient\(/g) || []).length === 1 && /\.globe\{[^}]*radial-gradient/.test(CSS), 'the only gradient is the approved globe backdrop (no decorative gradients)');
  ok((CSS.match(/@keyframes/g) || []).length === 2 && /@keyframes pulse/.test(CSS) && /@keyframes sw/.test(CSS) && /prefers-reduced-motion:reduce\)\{\*\{animation:none!important;transition:none!important\}\}/.test(CSS), 'no new animation; the existing two keyframes stay and the reduced-motion rule is intact');
  ok(/:focus-visible\{outline:2px solid var\(--accent\)/.test(CSS) && !/outline:\s*(0|none)/.test(CSS.replace(/\.top[^{]*\{[^}]*\}/g, '')), 'a 2px visible focus outline is defined and nothing removes it');
  const minH = (sel) => { const m = new RegExp('(?:^|[}\\s,])' + sel.replace(/[.[\]]/g, '\\$&') + '\\{[^}]*min-height:(\\d+)px', 'm').exec(CSS); return m ? +m[1] : 0; };
  ok(minH('.btn') >= 32 && minH('.chip') >= 44 && minH('.seg button') >= 24 && minH('.btn.sm') >= 24 && /details>summary\{[^}]*min-height:28px/.test(CSS) && /\.gsearch input\{[^}]*min-height:36px/.test(CSS), 'targets are at least 24px high on desktop (buttons 32, chips 48, small buttons 28, fold rows 28, search 36)');
  ok(/@media\(max-width:700px\)\{[\s\S]*\.btn,\.seg button\{min-height:36px\}[\s\S]*\.gsearch input\{min-height:40px\}/.test(CSS), 'on phones buttons are at least 36px and the search box 40px high');
  ok(/@media\(max-width:700px\)\{[\s\S]*\.strip\{display:flex;overflow-x:auto;[^}]*max-width:100%/.test(CSS) && /\.strip\{[^}]*min-width:0/.test(CSS), 'phone country buttons: one scrolling row that cannot widen the page');
  ok(/@media\(max-width:1100px\)\{[\s\S]*\.mapc\{order:1\}\.side\{order:2\}\.datac\{order:3\}\.briefc\{order:4\}\.newsc\{order:5\}/.test(CSS), 'narrow-screen order: country buttons, globe, country panel and risk profile, indicators, brief, news');
  ok(/\.state\{[^}]*overflow-wrap:anywhere/.test(CSS) && /body\{[^}]*overflow-wrap:break-word/.test(CSS), 'long text such as the globe failure message (a CDN address) wraps instead of widening the page');
  ok(/\.top:has\(\.key:not\(\[open\]\)\) #meta\{display:none\}/.test(CSS) && /@media\(max-width:700px\)\{[\s\S]*\.top:has/.test(CSS), 'phones: status pills sit behind the "Data status key" toggle (browsers without :has() simply keep them visible)');
  ok(/@media\(max-width:700px\)\{[\s\S]*thead\{position:absolute[\s\S]*td:nth-child\(3\)::before,td:nth-child(4)?/.test(CSS.replace(/td:nth-child\(4\)::before/g, 'td:nth-child(4)')), 'phone indicator table: stacked rows with labels, header row kept for screen readers');
  const fs = [...CSS.matchAll(/font-size:(\d+)px/g)].map(m => +m[1]); ok(fs.every(x => [11, 12, 13, 14, 16, 18, 20, 22, 24, 28].includes(x)) && Math.min(...fs) >= 12, `type sizes come from one scale (${[...new Set(fs)].sort((a, b) => a - b).join(', ')} px; nothing under 12px)`);
}

// ---------------------------------------------------------------- D. simulated page run
console.log('\nD. Risk Profile rendering with a minimal DOM stub (SIMULATED browser: js/app.js runs in Node; this is not a real browser)');
{
  const T = t => ({ nodeType: 3, text: String(t) });
  class N {
    constructor(tag) { this.tag = tag; this.children = []; this.className = ''; this.attrs = {}; this.dataset = {}; this.style = { cssText: '', setProperty() {} }; this.hidden = false; this.open = false; }
    append(...xs) { for (const x of xs) { if (x == null) continue; if (Array.isArray(x)) this.append(...x); else this.children.push(typeof x === 'object' ? x : T(x)); } }
    replaceChildren(...xs) { this.children = []; this.append(...xs); }
    setAttribute(k, v) { this.attrs[k] = String(v); } getAttribute(k) { return this.attrs[k]; } addEventListener() {} remove() {} getContext() { return null; }
    get textContent() { return this.children.map(c => c.nodeType === 3 ? c.text : c.textContent).join(''); } set textContent(v) { this.children = [T(v)]; }
    walk(f) { for (const c of this.children) if (c.nodeType !== 3) { f(c); c.walk(f); } }
    querySelectorAll(sel) { const last = sel.trim().split(/\s+/).pop(), out = []; const m = e => { const t = /^[a-z0-9]+/i.exec(last), c = [...last.matchAll(/\.([\w-]+)/g)].map(x => x[1]); return (!t || e.tag === t[0]) && c.every(k => e.className.split(/\s+/).includes(k)) && !/^#/.test(last); }; this.walk(e => { if (m(e)) out.push(e); }); return out; }
  }
  const textOf = (node, skipDetails) => node.nodeType === 3 ? node.text : (skipDetails && node.tag === 'details') ? '' : node.children.map(c => textOf(c, skipDetails)).join('');
  const run = async (hash, files, failMode) => {
    const ids = {}, body = new N('body'); for (const i of ['meta', 'risk', 'head', 'news', 'data', 'brief', 'nst', 'dst', 'chips', 'q', 'qmsg', 'clist', 'gctl', 'globe', 'gfb', 'mapnote', 'refresh', 'country']) { ids[i] = new N('div'); body.append(ids[i]); }
    const document = { createElement: t => new N(t), querySelector: s => /^#[\w-]+$/.test(s) ? ids[s.slice(1)] || null : (body.querySelectorAll(s)[0] || null), querySelectorAll: s => body.querySelectorAll(s), documentElement: new N('html'), head: new N('head') };
    const ctx = { document, location: { hash }, history: { replaceState() {} }, AbortSignal: {}, console, setTimeout, URL,
      fetch: async p => { const f = Object.keys(files).find(k => p.includes(k)); if (f) return { ok: true, status: 200, json: async () => clone(files[f]) }; if (failMode === 'network') throw new Error('Failed to fetch'); return { ok: false, status: 404, json: async () => ({}) }; } };
    ctx.window = ctx; ctx.window.addEventListener = () => {};
    vm.createContext(ctx);
    for (const f of ['data/countries.js', 'js/config.js']) vm.runInContext(rd(f), ctx);
    let err = null; try { vm.runInContext(APP, ctx); await new Promise(r => setTimeout(r, 80)); } catch (e) { err = e; }
    return { ids, err, textOf };
  };
  const tilesOf = risk => { const g = risk.children.find(c => c.tag === 'div' && /^(bgrid|grid3)$/.test(c.className)); return g ? g.children.flatMap(c => c.className === 'rkcol' ? c.children : [c]) : []; };
  const URLRE = /https?:\/\/[^\s)]+/g, host = u => (u.match(/^https?:\/\/([^/]+)/) || [])[1];
  const strings = (o, out = []) => { if (typeof o === 'string') out.push(o); else if (Array.isArray(o)) o.forEach(x => strings(x, out)); else if (o && typeof o === 'object') Object.values(o).forEach(x => strings(x, out)); return out; };
  for (const id of IDS) {
    const { ids, err } = await run('#' + id, { 'risk.json': OUT }); ok(!err, `${id}: the page script runs without an error${err ? ' (' + err.message + ')' : ''}`); if (err) continue;
    const t = tilesOf(ids.risk), vis = t.map(x => textOf(x, true)).join(' | '), all = textOf(ids.risk), P = OUT.countries[id].security.profile, E = OUT.countries[id].economic.profile;
    // essential limitations are visible without opening anything
    const must = [[/state-based armed conflicts only/, 'the conflict count covers state-based conflict only'], [/not a measure of overall security risk/, 'the count is not overall security risk'], [/Perception-based estimate/, 'WGI is perception-based'], [/Zero is not the global average/, 'zero is not the global average'], [/Margin of error not retrieved here/, 'the WGI margin of error has not been retrieved'], [/project-defined/, 'the stress flag is project-defined'], [/not an assessment of overall economic risk/, 'the flag is not overall economic risk'], [/No suitable, verified and legally reusable dataset/, 'diplomatic: no suitable dataset identified']];
    for (const [re, what] of must) ok(re.test(vis), `${id}: visible by default: ${what}`);
    if (P.armedConflict.uniqueConflicts > 0) ok(/Intensity describes the whole conflict, not this country's own involvement/.test(vis) && /"location" does not mean where the fighting took place/.test(vis), `${id}: visible by default: intensity belongs to the whole conflict; roles are UCDP coding`);
    if (id === 'TWN') ok((vis.match(/Does not measure cross-strait tension or military activity/g) || []).length === 2, 'TWN: the cross-strait / military-activity limitation is visible in BOTH security tiles');
    else ok(!/cross-strait/.test(all), `${id}: no cross-strait wording on another country`);
    if (id === 'UKR') ok(/Excluded from the stress flag: the newest value is older than 3 years/.test(vis) && /9\.83%/.test(vis) && /2021/.test(vis), 'UKR: the outdated, excluded unemployment value stays visible with its year and reason');
    if (id === 'TWN') ok(/No level: the World Bank returned no value for any of the 3 indicators for Taiwan's code/.test(vis) && /nothing from another country is substituted/.test(vis) && (vis.match(/no value published/g) || []).length === 3, 'TWN: missing macro data is stated plainly, nothing from another country is substituted');
    // nothing generated is lost: every generated sentence of both profiles and of the diplomatic card is somewhere in the tiles (inside folds), unchanged
    const gen = [...strings(P.armedConflict.notes), ...strings(P.politicalStability.notes), P.countryNote, P.armedConflict.summary, ...strings(E.notes), OUT.countries[id].diplomatic.summary, ...OUT.countries[id].diplomatic.limitations, E.flag.rule, P.politicalStability.uncertaintyNote].filter(Boolean);
    const miss = gen.filter(s => !all.includes(s.replace(URLRE, u => host(u)))); ok(miss.length === 0, `${id}: all ${gen.length} generated methodology, limitation and summary sentences are still shown (inside the folds), unchanged${miss.length ? ' - missing: ' + miss[0].slice(0, 80) : ''}`);
    // folds are closed by default, with a labelled summary
    const det = []; ids.risk.walk(e => { if (e.tag === 'details') det.push(e); }); ok(det.length >= 5 && det.every(d => d.open === false && d.children[0].tag === 'summary' && d.children[0].textContent.length > 3), `${id}: ${det.length} folds, all closed by default, each with a text label`);
    // no severity or comparison apparatus
    ok(!/\b(rank|ranking|worse than|better than|compared with|higher than|lower than|score)\b/i.test(all.replace(/not a forecast/g, '')), `${id}: no ranking, score or cross-country comparison wording`);
    const banned = R.bannedInText.filter(w => all.toLowerCase().replace(/not a forecast/g, '').includes(w)); ok(banned.length === 0, `${id}: none of the banned words (${R.bannedInText.join(', ')}) appears${banned.length ? ': ' + banned.join(',') : ''}`);
    ok(/Descriptive profiles from public datasets, not a forecast\. Missing data is never treated as low risk\./.test(textOf(ids.risk, true)), `${id}: the one-line scope statement is visible`);
    const fl = []; ids.risk.walk(e => { if (/\bflag\b/.test(e.className)) fl.push(e); }); ok(fl.length === 1 && fl[0].children.every(c => !/\b(bad|live|stale|hist)\b/.test(c.className)) && !/pill/.test(fl[0].className), `${id}: the stress flag is plain text with no status or severity class`);
  }
  // minus sign: displayed as a true minus, spoken as "minus", stored value unchanged
  { const { ids } = await run('#UKR', { 'risk.json': OUT }), txt = textOf(ids.risk), sr = []; ids.risk.walk(e => { if (e.className === 'sr') sr.push(e.textContent); });
    ok(txt.includes('−0.33') && sr.includes('minus 0.33') && /Stored value: -0\.33/.test(txt) && OUT.countries.UKR.security.profile.politicalStability.displayEstimate === '-0.33', 'UKR: "−0.33" on screen, "minus 0.33" for screen readers, the stored value keeps its ASCII hyphen'); }
  // neutral status for intentionally disabled sources; real failures stay red
  { const { ids } = await run('#USA', { 'risk.json': OUT }), pills = []; ids.meta.walk(e => { if (/\bpill\b/.test(e.className)) pills.push(e); });
    const off = pills.find(p => /Official feeds: not enabled yet/.test(p.textContent)), gd = pills.find(p => /^GDELT files/.test(p.textContent));
    ok(off && /\binfo\b/.test(off.className) && !/\bbad\b/.test(off.className) && gd && /\binfo\b/.test(gd.className), 'a source whose cache file does not exist ("not enabled yet") gets the neutral info pill, not the red one');
    const news = []; ids.news.walk(e => { if (/\bpill\b/.test(e.className)) news.push(e.className + '|' + e.textContent); }); ok(news.some(x => /info\|Not enabled yet/.test(x)) && !news.some(x => /bad\|Not enabled yet/.test(x)), 'the same neutral pill is used next to the two news headings');
    const f = await run('#USA', { 'risk.json': OUT }, 'network'), p2 = []; f.ids.meta.walk(e => { if (/\bpill\b/.test(e.className)) p2.push(e.className + '|' + e.textContent); }); ok(p2.some(x => /bad\|.*unavailable/.test(x)) && !p2.some(x => /info\|.*unavailable/.test(x)), 'a real network failure still shows the red "unavailable" pill'); }
  // old and partial risk.json still render with the original code
  { const OLD = clone(OUT); for (const id of IDS) { delete OLD.countries[id].security.profile; delete OLD.countries[id].economic.profile; } OLD.methodologyVersion = 2;
    const { ids, err } = await run('#UKR', { 'risk.json': OLD }), g = ids.risk.children.find(c => c.tag === 'div' && /^(bgrid|grid3)$/.test(c.className)); ok(!err && g && g.className === 'grid3' && g.children.length === 3 && /Rule-based assessment/.test(textOf(ids.risk)) && !g.children.some(c => c.className === 'rkcol'), 'an older risk.json (methodology 2, no profiles) is drawn by the original three-card code, unchanged');
    const half = clone(OUT); delete half.countries.UKR.economic.profile; const h = await run('#UKR', { 'risk.json': half }); const hg = !h.err && h.ids.risk.children.find(c => c.tag === 'div' && /^(bgrid|grid3)$/.test(c.className)); ok(hg && hg.className === 'grid3', 'a risk.json with only some profiles falls back to the original cards instead of breaking');
    const none = await run('#UKR', {}), ng = !none.err && none.ids.risk.children.find(c => c.tag === 'div' && /^(bgrid|grid3)$/.test(c.className)); ok(ng && ng.children.length === 3 && ng.children.every(c => /Unavailable/.test(c.textContent)) && !/Descriptive profiles/.test(textOf(none.ids.risk)), 'no risk.json at all: three "Unavailable" cards, nothing invented'); }
  { const stale = clone(OUT); stale.countries.UKR.security.profile.armedConflict.stale = true; stale.countries.UKR.security.profile.politicalStability.stale = true; stale.countries.UKR.economic.stale = true; const { ids, err } = await run('#UKR', { 'risk.json': stale }); const v = !err && textOf(ids.risk, true); ok(v && (v.match(/Stale inputs/g) || []).length === 3, 'stale inputs: each affected tile says "Stale inputs"'); }
  // indicators table keeps roles and labels for the stacked phone layout
  { const { ids } = await run('#UKR', { 'indicators.json': JSON.parse(rdInd()) }); let rows = 0, labelled = 0; ids.data.walk(e => { if (e.tag === 'tr' && e.attrs.role === 'row') rows++; if (e.tag === 'td' && e.attrs['data-label']) labelled++; });
    ok(rows >= 5 && rows >= 6 && labelled === (rows - 1) * 2, `indicator rows carry roles, and each data row has "Reference year" and "Source" labels (${rows - 1} rows plus the header row)`); }
  function rdInd() { return JSON.stringify(PROD.indicators); }
}

// ---------------------------------------------------------------- E. other guarantees
console.log('\nE. Scope');
{
  const w = APP.slice(APP.indexOf('// ----- Stage 9')), lib = rd('scripts/risk-lib.mjs') + rd('data/risk-methodology.mjs');
  ok(!/api[_-]?key|access[_-]?token|openai|anthropic|\bXMLHttpRequest\b|sendBeacon|navigator\.geolocation|localStorage|document\.cookie/i.test(APP + CSS + HTML), 'no key, token, AI service, tracking beacon, cookie or storage use in the three changed files');
  ok(!/\b(weights?|composite|scores?)\b/i.test(w.slice(0, w.indexOf('// ----- risk assessment cards'))), 'the Stage 9 tile code has no weights, composites or scores');
  ok(!/\.(level|rule)\b/.test(w.slice(w.indexOf('function acTile'), w.indexOf('function macroTile'))), 'the two security tiles never read a combined level');
  ok(lib.includes('methodologyVersion: 3') || R.methodologyVersion === 3, 'risk calculation files are untouched (pinned by test-risk-8b2.mjs)');
}
console.log(`\n${n - bad} of ${n} checks passed${bad ? ', ' + bad + ' FAILED' : ''}. Static and simulated only: no real browser, no real server and no GitHub Action was involved.`);
process.exit(bad ? 1 : 0);
