#!/usr/bin/env node
// STAGE 9.2 TESTS (presentation only): two independent desktop columns, collapsed source list with working [n] references, "Media Coverage Patterns".
//   node tests/test-ui-stage92.mjs
// Static checks, a recount of the displayed numbers from the brief generator's own output, and js/app.js run in Node against a minimal DOM stub.
// It is NOT a browser: real layout, scrolling and focus were checked separately in headless Chrome (see README). Nothing here contacts any server.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { BRIEF_RULES as R } from '../data/brief-rules.mjs';
import { COUNTRY_TERMS } from '../data/country-terms.mjs';
import { RULES } from '../data/relevance-rules.mjs';
import { buildAll } from '../scripts/brief-lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let n = 0, bad = 0; const ok = (c, m) => { n++; if (!c) { bad++; console.log('  FAIL: ' + m); } };
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8'), clone = o => JSON.parse(JSON.stringify(o));
const CSS = rd('css/style.css'), HTML = rd('index.html'), APP = rd('js/app.js');
const IDS = ['USA', 'CHN', 'RUS', 'UKR', 'TWN'];

// ---- fixture: the real generator, simulated headlines (not production data)
const NOW = Date.parse('2026-11-27T12:00:00Z'), hAgo = h => new Date(NOW - h * 36e5).toISOString();
const item = (title, publisher, url, h) => ({ title, publisher, publisherId: publisher, url, published: hAgo(h), firstSeenAt: hAgo(h), matches: {} });
const T = { UKR: ['Russia launches missile strikes on Kyiv as Ukraine requests air defence', 'Ukraine sanctions talks with EU envoy in Brussels', 'Ukraine military drills near border, army says', 'Kyiv government approves budget', 'Ukraine war: ceasefire talks resume', 'Ukraine tariffs and trade deal discussed', 'Zelensky meets envoy to discuss security', 'Ukraine military aid package announced', 'Ukraine peace talks stall, diplomats say', 'Kyiv strikes: air defence responds'],
  USA: ['US sanctions Russia over missile strikes', 'Trump announces tariffs on China', 'Washington envoy meets Beijing officials', 'US military drills in Pacific', 'White House budget talks', 'US trade deal with Japan'],
  CHN: ['China military drills near Taiwan', 'Beijing sanctions US firms', 'China tariffs retaliation', 'China envoy meets Moscow officials', 'Beijing trade talks'], RUS: ['Russia missile strikes on Kyiv', 'Moscow sanctions response', 'Putin meets envoy in Beijing', 'Russia military exercises', 'Kremlin trade talks'],
  TWN: ['Taiwan holds military drills as US envoy visits', 'Taipei trade talks with US', 'Taiwan defence budget', 'Taiwan strait tension, China drills'] };
const items = []; let i = 0; for (const k of Object.keys(T)) for (const t of T[k]) { i++; items.push(item(t, 'Pub' + (i % 5), 'https://p' + (i % 5) + '.test/a/' + i, (i % 40) + 1)); if (i % 3 === 0) items.push(item(t, 'Dup' + (i % 3), 'https://d' + (i % 3) + '.test/a/' + i, (i % 40) + 2)); }
const cache = { schema: 1, generatedAt: hAgo(1), checkedAt: hAgo(1), lastSuccessAt: hAgo(1), feeds: { f: { status: 'ok' } }, items };
const BR = buildAll({ caches: { gdelt: cache, rss: null }, prev: null, now: NOW, R, countryTerms: COUNTRY_TERMS, rules: RULES });

console.log('A. Audit: every displayed count recomputed from the brief data (simulated headlines through the real generator)');
const parse = x => { let m = /^(\d+) of the (\d+) listed reports? use (.+?) wording \(/.exec(x.text); if (m && /^topic:/.test(x.rule)) return { t: 'topic', N: +m[1], M: +m[2], label: m[3] }; m = /^(\d+) listed reports? with topic keywords also names? (.+?) \[/.exec(x.text); if (m && x.rule === 'two-countries') return { t: 'two', N: +m[1] }; m = /^(\d+) listed headlines? (?:was|were) carried by more than one outlet/.exec(x.text); if (m && x.rule === 'several-outlets') return { t: 'multi', N: +m[1] }; return null; };
let ruleCount = 0, parsed = 0;
for (const id of IDS) {
  const b = BR.countries[id]; ok(b.status === 'ok' && b.why && b.why.length, `${id}: the fixture produces a populated brief`);
  const uniq = b.sources.filter(s => !s.duplicateOf), dups = b.sources.filter(s => s.duplicateOf), withDup = new Set(dups.map(s => s.duplicateOf));
  for (const w of b.why) {
    const p = parse(w); ruleCount++; if (p) parsed++; ok(!!p, `${id}: rule "${w.rule}" is recognised by the page's parser (otherwise its sentence is shown as written)`); if (!p) continue;
    if (p.t === 'topic') {
      ok(p.M === uniq.length, `${id} ${w.rule}: denominator ${p.M} = unique headlines in the source list (${uniq.length})`);
      ok(p.N === w.evidence.length && w.evidence.every(e => uniq.some(s => s.n === e)), `${id} ${w.rule}: ${p.N} equals the number of cited unique headlines (${w.evidence.length}) and every cited number is a unique headline`);
      ok(p.N <= p.M, `${id} ${w.rule}: ${p.N} does not exceed ${p.M}`);
    }
    if (p.t === 'two') ok(p.N <= uniq.length && w.evidence.length === p.N, `${id} two-countries: ${p.N} of ${uniq.length}, matches the cited headlines`);
    if (p.t === 'multi') ok(p.N === withDup.size && p.N <= uniq.length, `${id} several-outlets: ${p.N} equals the unique headlines that have a repeat entry (${withDup.size})`);
  }
  const sumTopics = b.why.map(parse).filter(p => p && p.t === 'topic').reduce((a, p) => a + p.N, 0); if (sumTopics > uniq.length) ok(true, `${id}: topic counts sum to ${sumTopics} > ${uniq.length} unique headlines, which is why the page says the counts overlap`);
  ok(b.reportsFound >= uniq.length && b.developments.length <= R.maxDevelopments && uniq.length >= b.developments.length, `${id}: ${b.developments.length} developments shown, ${uniq.length} unique headlines counted (the page states this when they differ), ${b.reportsFound} found in the window`);
}
ok(parsed === ruleCount, `all ${ruleCount} generated sentences parse into figures`);

console.log('\nB. Static: layout, markup, CSS');
{
  ok(/<div class="col colL">[\s\S]*class="card mapc swap"[\s\S]*class="card newsc swap"[\s\S]*<div class="col colR">[\s\S]*class="side swap" id="country"[\s\S]*class="card datac swap"[\s\S]*class="card briefc swap"/.test(HTML), 'index.html: left stack = globe then news; right stack = country panel then indicators; brief full width after both');
  ok(/\.colL\{grid-column:span 7\}\.colR\{grid-column:span 5\}\.briefc\{grid-column:1\/-1\}/.test(CSS) && /\.col\{display:flex;flex-direction:column;gap:16px;min-width:0;align-self:start\}/.test(CSS), 'desktop: 7/5 columns, each its own vertical stack that does not stretch to the other');
  ok(/@media\(max-width:1100px\)\{[\s\S]*\.col\{display:contents\}[\s\S]*\.mapc\{order:1\}\.side\{order:2\}\.datac\{order:3\}\.briefc\{order:4\}\.newsc\{order:5\}/.test(CSS), 'narrow: columns dissolve into one stack in the approved order');
  ok(!/position:\s*(sticky|fixed)/.test(CSS.replace(/\.skip\{[^}]*\}/, '')) && !/\.globe\{[^}]*height:clamp\(360px,60vh,680px\)/.test(CSS) === false, 'no sticky or fixed positioning; globe height rule unchanged');
  ok(/\.refbtn\{[^}]*color:var\(--accent\)[^}]*cursor:pointer/.test(CSS) && /\.src-hl\{/.test(CSS) && /:focus-visible\{outline:2px solid var\(--accent\)/.test(CSS), 'reference buttons are styled as links, the target entry is highlighted, focus ring intact');
  ok(!/<h2>Why it matters/.test(HTML), 'index.html has no "Why it matters" heading');
}

console.log('\nC. Brief rendering with a minimal DOM stub (SIMULATED browser)');
{
  const T = t => ({ nodeType: 3, text: String(t) });
  class N {
    constructor(tag) { this.tag = tag; this.children = []; this.className = ''; this.attrs = {}; this.dataset = {}; this.handlers = {}; this.style = { setProperty() {} }; this.hidden = false; this.open = false; this.id = ''; }
    append(...xs) { for (const x of xs) { if (x == null) continue; if (Array.isArray(x)) this.append(...x); else this.children.push(typeof x === 'object' ? x : T(x)); } }
    replaceChildren(...xs) { this.children = []; this.append(...xs); }
    setAttribute(k, v) { this.attrs[k] = String(v); } getAttribute(k) { return this.attrs[k]; } addEventListener(e, f) { (this.handlers[e] = this.handlers[e] || []).push(f); } remove() {} getContext() { return null; }
    scrollIntoView() { this.scrolled = true; } focus() { this.focused = true; }
    get firstChild() { return this.children[0]; }
    get classList() { const s = this; return { add: c => { s.className = (s.className + ' ' + c).trim(); }, remove: c => { s.className = s.className.split(/\s+/).filter(x => x !== c).join(' '); } }; }
    get textContent() { return this.children.map(c => c.nodeType === 3 ? c.text : c.textContent).join(''); } set textContent(v) { this.children = [T(v)]; }
    walk(f) { for (const c of this.children) if (c.nodeType !== 3) { f(c); c.walk(f); } }
    all(pred) { const o = []; this.walk(e => { if (pred(e)) o.push(e); }); return o; }
    querySelectorAll(sel) { const last = sel.trim().split(/\s+/).pop(), c = [...last.matchAll(/\.([\w-]+)/g)].map(x => x[1]); return this.all(e => c.length && c.every(k => e.className.split(/\s+/).includes(k))); }
  }
  const vis = (node, skip) => node.nodeType === 3 ? node.text : (skip && node.tag === 'details') ? '' : node.children.map(c => vis(c, skip)).join('');
  const run = async (hash, briefs, hand) => {
    const ids = {}, body = new N('body'); for (const i of ['meta', 'risk', 'head', 'news', 'data', 'brief', 'nst', 'dst', 'chips', 'q', 'qmsg', 'clist', 'gctl', 'globe', 'gfb', 'mapnote', 'refresh', 'country']) { ids[i] = new N('div'); ids[i].id = i; body.append(ids[i]); }
    const document = { createElement: t => new N(t), getElementById: i => { let f = null; body.walk(e => { if (e.id === i) f = e; }); return f; }, querySelector: s => /^#[\w-]+$/.test(s) ? ids[s.slice(1)] || null : (body.querySelectorAll(s)[0] || null), querySelectorAll: s => body.querySelectorAll(s.replace(/^#brief\s+/, '')), documentElement: new N('html'), head: new N('head') };
    const ctx = { document, location: { hash }, history: { replaceState() {} }, AbortSignal: {}, console, setTimeout, URL, fetch: async p => p.includes('briefs.json') && briefs ? { ok: true, status: 200, json: async () => clone(briefs) } : { ok: false, status: 404, json: async () => ({}) } };
    ctx.window = ctx; ctx.window.addEventListener = () => {}; vm.createContext(ctx);
    for (const f of ['data/countries.js', 'js/config.js']) vm.runInContext(rd(f), ctx);
    if (hand) vm.runInContext(`window.COUNTRIES[${JSON.stringify(hash.slice(1))}].brief.why = ${JSON.stringify(hand)};`, ctx);
    let err = null; try { vm.runInContext(APP, ctx); await new Promise(r => setTimeout(r, 80)); } catch (e) { err = e; }
    return { ids, err, document };
  };
  for (const id of IDS) {
    const { ids, err, document } = await run('#' + id, BR), b = BR.countries[id], root = ids.brief; ok(!err, `${id}: the page script runs without an error${err ? ' (' + err.message + ')' : ''}`); if (err) continue;
    const all = vis(root), shown = vis(root, true), uniq = b.sources.filter(s => !s.duplicateOf).length, dups = b.sources.length - uniq;
    ok(root.all(e => e.tag === 'h3').some(h => h.textContent === 'Media Coverage Patterns') && !root.all(e => e.tag === 'h3').some(h => /Why it matters/.test(h.textContent)), `${id}: the section is headed "Media Coverage Patterns"`);
    ok(!/Why it matters/.test(all) && /"Media Coverage Patterns" come from fixed keyword rules/.test(all), `${id}: the generated notice and limitations no longer name a section that does not exist ("Why it matters" is replaced by the new heading only in that phrase)`);
    ok(/Counts come from keyword matching on headline wording; the articles were not read/.test(shown) && /not what happened, why, or what comes next/.test(shown) && /Not verified events, a forecast, a risk score or causal analysis/.test(shown), `${id}: the keyword-based limitation is visible without opening anything`);
    ok(/A headline can match several topics, so these counts overlap and do not add up to the total/.test(shown) || !b.why.some(w => /^topic:/.test(w.rule)), `${id}: overlap of topics is stated next to the topic counts`);
    ok(new RegExp(`${uniq} unique headlines? (are|is) counted`).test(shown) && (dups ? new RegExp(`${dups} further source-list entr(y is|ies are) the same headline carried by another outlet; repeats are listed but not counted again, and they are not independent verification`).test(shown) : true), `${id}: unique headlines (${uniq}) are distinguished from repeat entries (${dups}) and repeats are not presented as verification`);
    const rows = root.all(e => e.className === 'cov').map(r => r.textContent); const expect = b.why.map(parse).filter(Boolean).length;
    ok(rows.length === expect && rows.every(t => new RegExp(`\\d+ of ${uniq} unique headlines$`).test(t)), `${id}: ${rows.length} figure rows, each "N of ${uniq} unique headlines": ${rows.join(' / ').slice(0, 150)}`);
    ok(root.all(e => e.className === 'cb').every(c => c.attrs['aria-hidden'] === 'true' && /^\d+%$/.test(c.firstChild.style.width)), `${id}: bars are decorative (aria-hidden), width = count / denominator, the numbers carry the meaning`);
    const folds = root.all(e => e.tag === 'details'), rf = folds.find(d => /Rules, matched words and references/.test(d.children[0].textContent)), sf = folds.find(d => d.className === 'srcfold');
    ok(rf && rf.open === false && sf && sf.open === false, `${id}: "Rules, matched words and references" and the source list are both closed by default`);
    ok(b.why.every(w => rf.textContent.includes(w.text) && rf.textContent.includes('Rule: ' + w.rule)), `${id}: every generated sentence and rule id is kept verbatim inside the rules fold`);
    ok(sf.children[0].textContent === `Sources and references (${b.sources.length})`, `${id}: the fold is labelled "Sources and references (${b.sources.length})"`);
    const lis = sf.all(e => e.tag === 'li'), links = sf.all(e => e.tag === 'a');
    ok(lis.length === b.sources.length && links.length === b.sources.length && b.sources.every((s, k) => links[k].href === s.url && lis[k].id === 'src-' + s.n && lis[k].textContent.startsWith('[' + s.n + '] ') && lis[k].textContent.includes(s.publisher)), `${id}: all ${b.sources.length} sources keep their number, link, publisher and metadata`);
    ok(b.sources.filter(s => s.duplicateOf).every(s => lis[s.n - 1].textContent.includes('same headline as [' + s.duplicateOf + ']')), `${id}: repeat entries still say which headline they repeat`);
    const btns = root.all(e => e.className === 'refbtn'), wrong = btns.filter(x => !document.getElementById('src-' + x.textContent.replace(/\D/g, '')));
    if (wrong.length) console.log('    wrong:', wrong.slice(0,2).map(x => x.textContent + ' ' + JSON.stringify(x.attrs)).join(' ; ')); ok(btns.length >= 5 && wrong.length === 0 && btns.every(x => x.tag === 'button' && x.type === 'button' && /^Source \d+: show in the source list$/.test(x.attrs['aria-label'])), `${id}: ${btns.length} reference buttons (keyboard operable, labelled), each pointing at an existing source entry`);
    const first = btns[0], target = document.getElementById('src-' + first.textContent.replace(/\D/g, '')); first.handlers.click[0]();
    ok(sf.open === true && target.scrolled && target.focused && /src-hl/.test(target.className), `${id}: activating [${first.textContent.replace(/\D/g, '')}] opens the source list, scrolls to the entry, focuses and highlights it`);
    ok(!/location|hash/.test(APP.slice(APP.indexOf('const showSrc'), APP.indexOf('const refBtn'))), `${id}: the reference handler does not change the URL hash (the hash holds the selected country)`);
    const bw = ['because', 'therefore', 'due to', 'caused', 'proves', ' will ', ' would ', 'likely', 'forecast', 'predict', 'imminent'].filter(w => shown.toLowerCase().replace(/not a forecast|, a forecast,/g, '').includes(w)); ok(bw.length === 0, `${id}: the new visible wording contains none of the banned words${bw.length ? ': ' + bw : ''}`);
  }
  // fallbacks
  { const odd = clone(BR); odd.countries.UKR.why.push({ rule: 'new-rule', kind: 'analysis', evidence: [1], text: 'An unfamiliar sentence [1] from a future rule.' }); const { ids, err } = await run('#UKR', odd); ok(!err && vis(ids.brief, true).includes('An unfamiliar sentence [1] from a future rule.'), 'a rule the page does not recognise is shown as written, never dropped'); }
  { const none = clone(BR); none.countries.UKR.sources = []; none.countries.UKR.why = null; none.countries.UKR.status = 'limited'; const { ids, err } = await run('#UKR', none); ok(!err && /No sources listed/.test(vis(ids.brief)) && !ids.brief.all(e => e.className === 'srcfold').length, 'no sources: the plain "No sources listed" message, no empty fold'); }
  { const { ids, err } = await run('#UKR', null); ok(!err && /Briefs have not been generated yet/.test(vis(ids.brief)), 'no briefs.json: the original "not generated yet" message'); }
  { const un = clone(BR); un.countries.TWN = { generatedAt: un.generatedAt, window: un.countries.TWN.window, notice: un.countries.TWN.notice, status: 'unavailable', reportsFound: 0, overview: null, developments: [], why: null, sources: [], limitations: ['No cached headline names Taiwan.'] }; const { ids, err } = await run('#TWN', un); const t = vis(ids.brief); ok(!err && /Unavailable/.test(t) && !/0 unique/.test(t), 'an unavailable brief: "Unavailable", no invented counts'); }
  { const { ids, err } = await run('#UKR', BR, { kind: 'analysis', asOf: '2026-11-01', text: 'Hand-written note.' }); ok(!err && ids.brief.all(e => e.tag === 'h3').some(h => h.textContent === 'Why it matters') && /Hand-written note/.test(vis(ids.brief)), 'a hand-written analysis entry keeps the heading "Why it matters" (it is analysis, not keyword counts)'); }
}
console.log(`\n${n - bad} of ${n} checks passed${bad ? ', ' + bad + ' FAILED' : ''}. Static and simulated only: no real browser, no real server, no GitHub Action and no production brief cache was involved.`);
process.exit(bad ? 1 : 0);
