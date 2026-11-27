(() => {
'use strict';
const C = window.COUNTRIES, IDS = Object.keys(C), CFG = window.CONFIG;
const $ = s => document.querySelector(s);
const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.append(...[].concat(x)); return e; };
const safe = u => /^https?:\/\//i.test(u || '') ? u : null;
const link = (u, t) => { const a = el('a', null, t); a.href = safe(u) || '#'; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; };
const PILL = { live: 'Updated', stale: 'Stale', hist: 'Historical', bad: 'Unavailable', load: 'Loading', ana: 'Analysis', rep: 'Reported event', ed: 'Editorial note' };
const KIND = { fact: ['hist', 'Factual data'], reporting: ['rep', 'Reported event'], analysis: ['ana', 'Analysis'] };
const pill = (k, t) => el('span', 'pill ' + k, [el('i'), t || PILL[k]]);
const seg = (opts, val, fn) => {
  const g = el('div', 'seg'); g.setAttribute('role', 'group');
  opts.forEach(([v, l]) => { const b = el('button', null, l); b.type = 'button'; b.dataset.v = v; b.setAttribute('aria-pressed', v === val);
    b.onclick = () => { g.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); fn(v); }; g.append(b); });
  return g;
};
const skel = () => el('div', null, [el('div', 'skel'), el('div', 'skel w80'), el('div', 'skel w60')]);
const fmtUTC = iso => { const d = new Date(iso); return isNaN(d) ? 'unknown time' : d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC'; };
const ago = iso => { const m = Math.round((Date.now() - new Date(iso)) / 60000); if (isNaN(m)) return ''; if (m < 1) return 'just now'; if (m < 90) return m + ' min ago'; const h = Math.round(m / 60); return h < 48 ? h + ' h ago' : Math.round(h / 24) + ' days ago'; };
function stamp(iso, maxH, label, failed) {   // freshness pill built from the real timestamp inside the cached file
  const pre = label === 'Updated' ? '' : label + ': ';
  if (!iso || isNaN(new Date(iso))) return pill('bad', pre ? pre + 'no successful update yet' : 'No successful update yet');
  const old = (Date.now() - new Date(iso)) / 36e5 > maxH;
  const p = failed ? pill('stale', pre ? pre + 'cached, last success ' + ago(iso) : 'Cached, last success ' + ago(iso)) : pill(old ? 'stale' : 'live', (old ? 'Stale: ' : '') + label + ' ' + ago(iso));   // green only when the latest fetch really succeeded
  p.title = fmtUTC(iso); return p;
}

// ---------- state ----------
let cur = IDS.includes(location.hash.slice(1).toUpperCase()) ? location.hash.slice(1).toUpperCase() : 'USA';
let GEO = null, globeOn = false, rotSeg = null;
const store = { news: null, ind: null, rss: null, gk: null, br: null, rk: null };

// ---------- cached data (written by the GitHub Action, Stage 2) ----------
async function loadJson(path) {
  try { const r = await fetch(path, { cache: 'no-cache' }); if (!r.ok) throw new Error(r.status === 404 ? 'file not found' : 'HTTP ' + r.status); return { ok: true, json: await r.json() }; }
  catch (e) { return { ok: false, error: e.message === 'Failed to fetch' ? 'network error' : e.message }; }
}
async function loadAll() {
  $('#meta').replaceChildren(pill('load'));
  [store.news, store.ind, store.rss, store.gk, store.br, store.rk] = await Promise.all([loadJson(CFG.newsFile), loadJson(CFG.indicatorsFile), loadJson(CFG.rssFile), loadJson(CFG.gdeltFilesFile), loadJson(CFG.briefsFile || 'data/cache/briefs.json'), loadJson(CFG.riskFile || 'data/cache/risk.json')]);
  const n = store.news, d = store.ind;
  const head = (r, what, hrs, bad) => {
    if (!r.ok) return [pill('bad', what + ': unavailable')];
    const cs = Object.values(r.json.countries || {}), nBad = cs.filter(bad).length, last = r.json.lastSuccessAt || null, tip = r.json.checkedAt ? ' Last checked ' + fmtUTC(r.json.checkedAt) : '';
    let p;
    if (nBad === 0 || !last) p = stamp(last, hrs, what, false);                                  // green only when nothing failed
    else if (nBad === cs.length) p = stamp(last, hrs, what, true);
    else { p = pill('stale', `${what}: ${cs.length - nBad} of ${cs.length} updated, ${nBad} not refreshed (latest success ${ago(last)})`); p.title = fmtUTC(last); }
    p.title = (p.title ? p.title + ' (latest success).' : '') + tip;
    return [p];
  };
  $('#meta').replaceChildren(...headSrc(store.rss, 'Official feeds', CFG.staleAfterHours.rss), ...headSrc(store.gk, 'GDELT files', CFG.staleAfterHours.gdeltFiles), ...head(n, 'GDELT search', CFG.staleAfterHours.news, c => c.status === 'error'), ...head(d, 'Indicators', CFG.staleAfterHours.indicators, c => c.status === 'error' || c.status === 'partial'));
  paintNews(); paintData(); brief(); risk();
}
function headSrc(r, label, h) {   // header pill for a feed-style cache (publisher RSS, GDELT files)
  if (!r.ok) return [pill('bad', label + (r.error === 'file not found' ? ': not enabled yet' : ': unavailable'))];
  const fs = Object.values(r.json.feeds || {}), nBad = fs.filter(f => f.status !== 'ok').length, last = r.json.lastSuccessAt || null;
  let p;
  if (!last) p = pill('bad', label + ': no successful update yet');
  else if (nBad === 0) p = stamp(last, h, label, false);
  else if (nBad === fs.length) p = stamp(last, h, label, true);
  else p = pill('stale', `${label}: ${fs.length - nBad} of ${fs.length} updated, ${nBad} failed (latest success ${ago(last)})`);
  p.title = (last ? fmtUTC(last) + ' (latest success).' : '') + (r.json.checkedAt ? ' Last checked ' + fmtUTC(r.json.checkedAt) : '');
  return [p];
}
const missing = (what, file, err) => el('div', 'state err', [el('b', null, what + ' unavailable. '), `The cache file ${file} could not be read (${err}). It is created by the GitHub Action described in the README. No substitute content is shown.`]);

const secHead = (title, pills) => { const d = el('div'); d.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:14px 0 8px'; const h = el('h3', null, title); h.style.cssText = 'margin:0;font-size:14px'; d.append(h, ...pills); return d; };
const when = a => a.published ? 'Published ' + fmtUTC(a.published) : a.seenByGdelt ? 'Publication time not provided; first seen by GDELT ' + fmtUTC(a.seenByGdelt) : 'Publication date not provided by the feed';

// ----- feed-style sources: official/publisher RSS (scripts/fetch-rss.mjs) and GDELT open data files (scripts/fetch-gdelt-files.mjs) -----
// Old cache files list terms as an array; new ones as { names, institutions }.
const termText = t => !t ? '' : Array.isArray(t) ? t.join(', ') : [...(t.names || []), ...(t.institutions || []).map(x => x + ' (capital/government body)')].join(', ');
function articleBlock(s, kind) {
  const gk = kind === 'gdelt', hrsKey = gk ? 'gdeltFiles' : 'rss';
  if (!s) return { pills: [pill('load')], nodes: [skel()] };
  if (!s.ok) {
    if (s.error === 'file not found' && gk) return { pills: [pill('bad', 'Not enabled yet')], nodes: [el('div', 'state', [el('b', null, 'GDELT open data files have not been fetched yet. '), 'The workflow that reads them has not been verified and run, so there is no cache file. Nothing is shown here in place of articles. See the README.'])] };
    if (s.error === 'file not found') return { pills: [pill('bad', 'Not enabled yet')], nodes: [el('div', 'state', [el('b', null, 'Publisher RSS feeds are not enabled yet. '), 'No publisher has been verified and switched on, so there is no cache file. Nothing is shown here in place of publisher headlines. See the README.'])] };
    return { pills: [pill('bad')], nodes: [missing('Publisher feeds', CFG.rssFile, s.error)] };
  }
  const j = s.json, feeds = Object.values(j.feeds || {}), nBad = feeds.filter(f => f.status !== 'ok').length, last = j.lastSuccessAt || null, hrs = CFG.staleAfterHours[hrsKey], pills = [], nodes = [];
  if (!last) pills.push(pill('bad', 'No successful update yet'));
  else if (nBad === 0) pills.push(stamp(last, hrs, 'Updated', false));
  else if (nBad === feeds.length) pills.push(stamp(last, hrs, 'Updated', true), pill('bad', 'Latest refresh failed'));
  else pills.push(stamp(last, hrs, 'Updated', true), pill('stale', `${feeds.length - nBad} of ${feeds.length} feeds updated`));
  const failed = feeds.filter(f => f.status !== 'ok');
  if (failed.length) nodes.push(el('div', 'state err', [el('b', null, `${failed.length} of ${feeds.length} feeds failed on the latest refresh. `), failed.map(f => `${f.publisher} / ${f.label}: ${f.error || 'unknown error'}`).join('; ') + '. Articles from these feeds below are cached from the last successful update and may be out of date.']));
  const all = (Array.isArray(j.items) ? j.items : []).filter(a => a.matches && a.matches[cur]);
  // Why this article is listed for the country. Old cache files used level 'headline'; new ones use 'country' / 'institution'.
  const why = m => m.level === 'institution' ? 'Capital or government body named in headline: ' : m.level === 'summary' ? 'Mentioned in feed summary only: ' : 'Country named in headline: ';
  const row = a => {
    const f = (j.feeds || {})[a.feedId], bad = !f || f.status !== 'ok', old = f && f.lastSuccessAt && (Date.now() - new Date(f.lastSuccessAt)) / 36e5 > hrs;
    const m = a.matches[cur], kids = [el('b', null, a.publisher || 'Unknown publisher'), (a.via ? 'via ' + a.via + ' · ' : '') + when(a)];
    if (bad) kids.push(pill('stale', f ? 'Cached: feed refresh failed' : 'Cached: feed not part of the latest refresh')); else if (old) kids.push(pill('stale', 'Stale'));
    const rowKids = [link(a.url, a.title), el('div', 'nm', kids), el('div', 'meta', why(m) + m.terms.join(', '))];
    if (m.role === 'incidental') rowKids.push(el('div', 'meta', C[cur].name + ' is named only in passing here (another country comes first and there is no security, diplomacy or sanctions wording).'));
    else if (m.role === 'shared') rowKids.push(el('div', 'meta', 'Involves more than one country (bilateral or multilateral story).'));
    const tier = a.source && a.source.tier;
    if (tier) { const lab = ((j.sourcePolicy || {}).labels || {})[tier], d = el('div', 'meta', 'Outlet: ' + ({ established: 'established outlet', state: 'state-owned or government-run outlet', unassessed: 'not assessed' })[tier] + ' (a label for the outlet, not a fact-check of this headline)'); if (lab) d.title = lab; rowKids.push(d); }
    if (a.relevance && a.relevance.style) rowKids.push(el('div', 'meta', 'Sensational wording flagged (' + a.relevance.style.terms.join(', ') + '); its relevance score is lowered by 1.'));
    const tp = a.relevance && a.relevance.topics || [];
    if (tp.length) rowKids.push(el('div', 'meta', 'Topics: ' + tp.map(t => t.label).join(' · ') + ' (' + tp.map(t => t.terms.join(', ')).join('; ') + ')'));
    if (a.filtered) rowKids.push(el('div', 'meta', (a.filtered.kind === 'off-topic' ? 'Filtered as off-topic (' + (a.filtered.group || 'sport, entertainment or local news') + ' wording, no security, diplomacy or sanctions topic) because of: ' : 'Filtered as a routine financial notice because of: ') + a.filtered.terms.join(', ')));
    const vs = a.variants || [];
    if (vs.length) { const d = el('div', 'meta', 'Also reported by: '); vs.forEach((v, i) => { if (i) d.append(', '); d.append(link(v.url, v.publisher || 'source')); }); if ((a.variantsTotal || vs.length) > vs.length) d.append(' (+' + (a.variantsTotal - vs.length) + ' more)'); rowKids.push(d); }
    return el('li', null, rowKids);
  };
  const byDate = (x, y) => (Date.parse(y.published || y.seenByGdelt || y.firstSeenAt) || 0) - (Date.parse(x.published || x.seenByGdelt || x.firstSeenAt) || 0);
  const score = a => (a.relevance && a.relevance.score) || 0;
  const byRel = (x, y) => score(y) - score(x) || byDate(x, y);
  const shown = all.filter(a => !a.filtered), flt = all.filter(a => a.filtered).sort(byDate);
  const passing = shown.filter(a => a.matches[cur].level !== 'summary' && a.matches[cur].role === 'incidental').sort(byDate).slice(0, 20);
  const main = shown.filter(a => a.matches[cur].role !== 'incidental');
  const strong = main.filter(a => a.matches[cur].level !== 'summary' && (!a.relevance || a.relevance.tier !== 'other')).sort(byRel).slice(0, 20);
  const plain = main.filter(a => a.matches[cur].level !== 'summary' && a.relevance && a.relevance.tier === 'other').sort(byDate).slice(0, 20);
  const sm = shown.filter(a => a.matches[cur].level === 'summary').sort(byDate).slice(0, 20);
  const fold = (text, list) => { const d = el('details'); d.append(el('summary', null, text)); const ul = el('ul', 'news'); list.forEach(a => ul.append(row(a))); d.append(ul); nodes.push(d); };
  if (strong.length) { const ul = el('ul', 'news'); strong.forEach(a => ul.append(row(a))); nodes.push(ul); }
  else if (last) nodes.push(el('div', 'state', 'No cached headline with a security, diplomacy, sanctions/trade or economic-policy signal names ' + C[cur].name + ' (last ' + (j.retentionDays || 7) + ' days). This does not mean nothing happened: it only reflects these sources.'));
  if (plain.length) fold(`Other headlines naming ${C[cur].name} without a geopolitical keyword (${plain.length})`, plain);
  if (passing.length) fold(`Mentioned in passing (${passing.length}): ${C[cur].name} is named, but the story appears to be mainly about another country`, passing);
  if (sm.length) fold(`Mentioned in the feed summary only (${sm.length}): weaker match, the headline does not name ${C[cur].name}`, sm);
  if (flt.length) fold(`Filtered out (${flt.length}): routine financial notices and sport, entertainment or local news with no geopolitical topic. Shown here so nothing is hidden silently`, flt);
  const pubs = (j.publishers || []).map(p => p.name + ' (terms checked ' + p.termsChecked + ')').join(', ') || 'none';
  const attr = j.attribution ? [' Data: ', link(j.attribution.url, j.attribution.name), ' (open dataset, used under its terms).'] : [];
  nodes.push(el('p', 'meta', ['Reported events. Sources: ' + pubs + '.', ...attr, ' Matching words for ' + C[cur].name + ': ', el('code', null, termText((j.terms || {})[cur])), '. Each headline links to the original report. Last successful update: ' + (last ? fmtUTC(last) : 'none yet') + (j.checkedAt ? '. Last checked: ' + fmtUTC(j.checkedAt) : '') + '.']));
  nodes.push(el('p', 'note', (gk ? 'Headlines are written by the publishers named and link straight to their pages; GDELT only indexes them. ' : '') + 'Only the headline, publisher, date and link are copied; read the article at the publisher. Articles are matched to a country by its name, or its capital or a government body, in the headline (the names of people are never used), and ordered by simple keyword rules (security, diplomacy, sanctions and trade, economic policy). Routine fund and stock notices, and sport, entertainment or local news without a geopolitical topic, are filtered into a labelled list; near-identical headlines are grouped with links to every source; and a country that is only named in passing is listed separately. Outlet labels describe the publisher (by fixed lists in data/source-quality.mjs) and are not a fact-check; an outlet without a label is simply not assessed. A country named in a headline does not prove the article is mainly about it, and these keyword rules can be wrong. Headlines belong to the publishers and are neither checked nor endorsed here.'));
  return { pills, nodes };
}

// ----- GDELT (optional second source; its failures never affect the publisher feeds above) -----
function gdeltBlock() {
  const s = store.news;
  if (!s) return { pills: [pill('load')], nodes: [skel()] };
  if (!s.ok) return { pills: [pill('bad')], nodes: [missing('GDELT news', CFG.newsFile, s.error)] };
  const j = s.json, e = j.countries && j.countries[cur];
  if (!e) return { pills: [pill('bad')], nodes: [el('div', 'state err', 'The GDELT cache has no entry for ' + C[cur].name + '.')] };
  const arts = Array.isArray(e.articles) ? e.articles : [], ts = e.fetchedAt || null;
  const pills = [stamp(ts, CFG.staleAfterHours.news, 'Updated', e.status === 'error'), ...(e.status === 'error' ? [pill('bad', e.attempted === false ? 'Refresh skipped' : 'Latest refresh failed')] : [])];
  const out = [];
  if (e.status === 'error') out.push(el('div', 'state err', [el('b', null, e.attempted === false ? 'The latest GDELT refresh was not attempted. ' : 'The latest GDELT refresh failed. '), e.error || 'No reason was recorded.', arts.length ? ' The articles below are cached from the last successful update and may be out of date.' : ' Nothing has been fetched successfully yet, so no articles are shown.']));
  if (arts.length) {
    const ul = el('ul', 'news');
    arts.forEach(a => ul.append(el('li', null, [link(a.url, a.title || '(untitled)'), el('div', 'nm', [el('b', null, a.domain || 'Unknown publisher'), 'First seen by GDELT ' + (/^\d{8}T\d{4}/.test(a.seendate || '') ? a.seendate.replace(/^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d).*/, '$1-$2-$3 $4:$5 UTC') : 'at an unknown time')])])));
    out.push(ul);
  } else if (e.status !== 'error') out.push(el('div', 'state', 'GDELT returned no articles for this search in the cached window (' + (j.timespan || 'unknown') + ').'));
  out.push(el('p', 'meta', ['Reported events. Search: ', el('code', null, e.query || C[cur].gdelt), '. Last successful update: ' + (ts ? fmtUTC(ts) : 'none yet') + (e.checkedAt ? '. Last checked: ' + fmtUTC(e.checkedAt) : '') + '.']));
  out.push(el('p', 'note', 'Headlines belong to the publishers shown and are neither checked nor endorsed here. GDELT reports when it first saw an article, which can be later than its publication date. Fetched by a scheduled GitHub Action, not live in your browser.'));
  return { pills, nodes: out };
}

function paintNews() {
  const r = articleBlock(store.rss, 'rss'), k = articleBlock(store.gk, 'gdelt'), g = gdeltBlock();
  $('#nst').replaceChildren();
  $('#news').replaceChildren(secHead('Official and publisher feeds (RSS)', r.pills), ...r.nodes, secHead('GDELT open data files', k.pills), ...k.nodes, secHead('GDELT search API (secondary)', g.pills), ...g.nodes);
}

const fmt = { usd: v => 'US$ ' + new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 2 }).format(v), pct: v => Number(v).toFixed(1) + '%', num: v => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 2 }).format(v) };
function paintData() {
  const box = $('#data'), st = $('#dst'), s = store.ind;
  if (!s) { st.replaceChildren(pill('load')); box.replaceChildren(skel()); return; }
  if (!s.ok) { st.replaceChildren(pill('hist'), pill('bad')); box.replaceChildren(missing('Indicators', CFG.indicatorsFile, s.error)); return; }
  const j = s.json, e = j.countries && j.countries[cur];
  if (!e) { st.replaceChildren(pill('hist'), pill('bad')); box.replaceChildren(el('div', 'state err', 'The indicator cache has no entry for ' + C[cur].name + '.')); return; }
  const ts = e.fetchedAt || null, ind = e.indicators || {}, shown = INDICATORS.filter(i => ind[i.code] && ind[i.code].value != null);
  st.replaceChildren(pill('hist'), e.status === 'unsupported' ? pill('bad', 'Not published by the World Bank') : stamp(ts, CFG.staleAfterHours.indicators, 'Updated', e.status === 'error' || e.status === 'partial'),
    ...(e.status === 'partial' || e.status === 'error' ? [pill('bad', 'Latest refresh failed')] : []));
  const tb = el('tbody');
  INDICATORS.forEach(i => {
    const x = ind[i.code]; let val, yr = 'n/a', src = [link('https://data.worldbank.org/indicator/' + i.code, 'World Bank ' + i.code)];
    if (!x) val = el('span', 'dim', 'Not in cache');
    else if (x.status === 'unsupported') val = el('span', 'dim', 'Not available: the World Bank API has no data for this code');
    else if (x.status === 'error' && x.value != null) { val = el('span', null, [fmt[i.f](x.value), ' ', pill('stale', 'Refresh failed, older value')]); yr = x.year || 'n/a'; }
    else if (x.status === 'error') val = el('span', 'dim', 'Unavailable: ' + (x.error || 'request failed'));
    else if (x.value == null) val = el('span', 'dim', 'No value published');
    else { val = fmt[i.f](x.value); yr = x.year || 'n/a'; }
    if (x && x.sourceUpdated) src.push(el('div', 'meta', 'Dataset updated ' + x.sourceUpdated));
    tb.append(el('tr', null, [el('td', null, i.label), el('td', null, val), el('td', null, yr), el('td', null, src)]));
  });
  const th = el('thead', null, el('tr', null, ['Indicator', 'Latest value', 'Reference year', 'Source'].map(x => el('th', null, x))));
  const warn = e.status === 'unsupported' ? 'The World Bank API does not publish data for this area. ' + (e.error || '') + ' Nothing from any other country is substituted. Check national statistical sources instead.'
    : shown.length ? null : 'No indicators are available for this area. ' + (e.error || 'The World Bank may not publish series for it.');
  box.replaceChildren(...(warn ? [el('div', 'state err', warn)] : e.status === 'partial' || e.status === 'error' ? [el('div', 'state err', [el('b', null, 'The latest World Bank refresh failed for some indicators. '), (e.error || '') + ' Rows marked "older value" come from the last successful update.'])] : []),
    el('div', 'wrap', el('table', null, [th, tb])),
    el('p', 'note', 'Factual data. Each row is the most recent value the World Bank had published at the last successful update' + (ts ? ' (' + fmtUTC(ts) + ')' : '') + (e.checkedAt ? '; last checked ' + fmtUTC(e.checkedAt) : '') + '. Reference years differ and some lag by a year or more. Not real time.'));
}

// ---------- static panels ----------
function head() {
  const c = C[cur];
  $('#head').replaceChildren(el('div', 'card chead', [el('div', 'chl', [el('h2', null, c.name), el('span', null, cur)]), ...(c.note ? [el('p', 'callout', [pill('ed'), c.note])] : [])]));
}
// ----- risk assessment cards: built by scripts/build-risk.mjs from public datasets with documented rules (README "Risk assessments"). Hand-written entries in data/countries.js still win. -----
function risk() {
  const s = store.rk, g = el('div', 'grid3'), top = [], hand = C[cur].risk || {}, hrs = CFG.staleAfterHours.risk || 72;
  const file = s && s.ok && s.json && s.json.countries ? s.json : null, auto = file && file.countries[cur];
  if (!s) { $('#risk').replaceChildren(skel()); return; }
  if (file) {
    const failed = file.status === 'error';
    top.push(stamp(file.lastSuccessAt, hrs, 'Assessments built', failed));
    if (failed) top.push(pill('stale', 'Latest rebuild failed: earlier assessments kept'));
    const ri = file.inputs && file.inputs.riskInputs, days = CFG.riskInputsStaleDays || 14;
    if (ri && ri.status === 'ok' && ri.lastSuccessAt && (Date.now() - new Date(ri.lastSuccessAt)) / 864e5 > days) top.push(pill('stale', 'Risk datasets not refreshed for over ' + days + ' days'));
    if (failed) top.push(el('div', 'state err', [el('b', null, 'The latest rebuild failed: '), file.error || 'no reason recorded', '. The assessments below are the last successful ones (' + fmtUTC(file.lastSuccessAt) + ').']));
  }
  const LABEL = { security: 'Security', economic: 'Economic', diplomatic: 'Diplomatic' };
  ['security', 'economic', 'diplomatic'].forEach(k => {
    const r = hand[k], a = auto && auto[k], b = el('div', 'tile', el('h3', null, LABEL[k]));
    if (r) { b.append(pill('ana'), el('p', 'big', r.rating), el('p', 'meta', r.assessor + ', as of ' + r.asOf)); if (r.note) b.append(el('p', 'meta', 'Analyst note: ' + r.note)); if (safe(r.url)) b.append(link(r.url, 'Source')); g.append(b); return; }
    if (!file) { b.append(pill('bad'), el('p', 'big dim', 'Unavailable'), el('p', 'meta', s.error === 'file not found' ? 'The risk assessments have not been generated yet (the workflow has not run). Nothing is shown rather than guessing.' : 'The cache file ' + CFG.riskFile + ' could not be read (' + s.error + ').')); g.append(b); return; }
    if (!a) { b.append(pill('bad'), el('p', 'big dim', 'Unavailable'), el('p', 'meta', 'The cache has no entry for ' + C[cur].name + '.')); g.append(b); return; }
    const ok = a.status === 'assessed';
    b.append(ok ? pill('ana', 'Rule-based assessment') : pill('bad', 'Insufficient data'), ...(a.stale ? [pill('stale', 'Stale inputs')] : []), el('p', ok ? 'big' : 'big dim', ok ? a.level : 'Insufficient data'), el('p', 'meta', a.summary));
    const fold = (title, kids) => { if (kids.length) { const d = el('details'); d.append(el('summary', null, title), ...kids); b.append(d); } };
    const obs = (a.facts || []).filter(f => f.kind === 'observed'), itp = (a.facts || []).filter(f => f.kind === 'interpretation');
    fold('Observed facts (' + obs.length + ')', obs.length ? [(() => { const ul = el('ul'); obs.forEach(f => ul.append(el('li', null, [el('b', null, f.label + ': '), f.value, ' (' + (f.year || 'year n/a') + ', ', link(f.url, f.source), ')']))); return ul; })()] : []);
    fold('Rule-based interpretation', ok ? [el('p', 'meta', a.rule || ''), ...(itp.length ? [(() => { const ul = el('ul'); itp.forEach(f => ul.append(el('li', null, f.label.replace(': band', '') + ': ' + f.value))); return ul; })()] : []), el('p', 'meta', 'An interpretation by fixed rules, not an observed fact, forecast or verdict.')] : [el('p', 'meta', 'No level is derived. ' + (a.insufficientReason === 'method' ? 'No defensible automated method exists for this category.' : 'The evidence is missing or too thin; missing data is never treated as low risk.'))]);
    fold('Sources and dates', [(() => { const ul = el('ul'); (a.sources || []).forEach(x => ul.append(el('li', null, [link(x.url, x.name), ' (' + x.publisher + (x.licence ? ', ' + x.licence : '') + ')']))); if (!(a.sources || []).length) ul.append(el('li', 'dim', 'No data source was used.')); return ul; })(),
      el('p', 'meta', 'Reference year' + ((a.referenceDates || []).length === 1 ? '' : 's') + ': ' + ((a.referenceDates || []).join(', ') || 'n/a') + '. Last successful input update: ' + (a.lastSuccessAt ? fmtUTC(a.lastSuccessAt) : 'n/a') + '.')]);
    fold('Limitations (' + (a.limitations || []).length + ')', [(() => { const ul = el('ul'); (a.limitations || []).forEach(t => ul.append(el('li', null, t))); return ul; })()]);
    const ctx = a.context || [];
    if (ctx.length) fold('Reported context, not used for the level (' + ctx.length + ')', [el('p', 'meta', 'Headlines are reports by publishers, not verified facts.'), (() => { const ul = el('ul'); ctx.forEach(c => ul.append(el('li', null, [link(c.url, c.headline), el('div', 'meta', c.publisher + (c.time ? ' · ' + (c.timeBasis || 'time') + ' ' + fmtUTC(c.time) : ' · time not provided'))]))); return ul; })()]);
    g.append(b);
  });
  $('#risk').replaceChildren(...top, g, el('p', 'note', file ? 'Levels come only from the public datasets named in each card, by fixed rules documented in the README. Headlines and article counts never set a level. "Insufficient data" means the evidence is missing or too thin; it is not a finding of low risk. Observed facts and rule-based interpretation are listed separately.' : 'No assessment is shown until it has been generated from sourced data.'));
}
// ----- country intelligence brief: built by scripts/build-briefs.mjs from the cached news (fixed rules, no AI). Hand-written entries in data/countries.js still win. -----
function brief() {
  const hand = C[cur].brief, root = $('#brief'), s = store.br, hrs = CFG.staleAfterHours.briefs || 12, g = el('div', 'bgrid'), top = [];
  const auto = s && s.ok && s.json && s.json.countries ? s.json.countries[cur] : null;
  const handAny = hand.overview || hand.developments || hand.why || (hand.sources || []).length;
  if (!s) { root.replaceChildren(skel()); return; }
  if (!s.ok && !handAny) {
    root.replaceChildren(el('div', 'state', s.error === 'file not found'
      ? [el('b', null, 'Briefs have not been generated yet. '), 'The workflow that builds them has not run, so there is no cache file. Nothing is shown in place of a brief. See the README.']
      : [el('b', null, 'Briefs unavailable. '), 'The cache file ' + CFG.briefsFile + ' could not be read (' + s.error + '). Nothing is shown in place of a brief.'])); return;
  }
  if (auto) {
    const j = s.json, failed = j.status === 'error' || !!auto.carriedForward;
    top.push(stamp(auto.generatedAt, hrs, 'Brief generated', failed));
    if (j.status === 'error') top.push(pill('stale', 'Latest regeneration failed: earlier brief kept'));
    if (auto.carriedForward) top.push(pill('stale', 'No usable reports in the latest cache: earlier brief kept'));
    const inp = j.inputs || {}; const old = Object.entries(inp).filter(([, v]) => v && v.status === 'ok' && v.stale).map(([k]) => k);
    if (old.length) top.push(pill('stale', 'News input stale: ' + old.join(', ')));
    top.push(el('span', 'meta', ' Window: reports from ' + fmtUTC(auto.window.from) + ' to ' + fmtUTC(auto.window.to) + '. Rule-based, no AI.'));
    if (j.status === 'error') top.push(el('div', 'state err', [el('b', null, 'The latest update failed: '), j.error || 'no reason recorded', '. The brief below is the last successful one (generated ' + fmtUTC(auto.generatedAt) + ').']));
    if (auto.carriedForward) top.push(el('div', 'state err', [el('b', null, 'Earlier brief kept. '), auto.carriedForward.reason]));
  }
  const ref = n => el('span', 'meta', ' [' + n + ']');
  const unavailable = (why) => [pill('bad'), el('p', 'dim', why)];
  const sec = (h, k, fill) => {
    const d = el('section', 'bsec', el('h3', null, h)), x = hand[k];
    if (x) d.append(pill(...KIND[x.kind] || KIND.analysis), el('span', 'meta', ' As of ' + x.asOf), el('p', null, x.text));
    else if (!auto) d.append(...unavailable('No sourced entry yet.'));
    else fill(d);
    g.append(d);
  };
  const lim = auto && auto.limitations || [];
  sec('Overview', 'overview', d => {
    if (auto.overview) d.append(pill(...KIND.fact), el('p', null, auto.overview.text));
    else d.append(...unavailable('Unavailable: not enough cached reports to summarise ' + C[cur].name + '.'));
  });
  sec('Key developments', 'developments', d => {
    if (!auto.developments.length) { d.append(...unavailable('Unavailable: no cached report names ' + C[cur].name + ' in the window.')); return; }
    d.append(pill(...KIND.reporting), el('span', 'meta', ' Reported by the outlets named; not verified here'));
    const ul = el('ul');
    auto.developments.forEach(x => {
      const li = el('li', null, [link(x.url, x.headline), ref(x.n)]);
      li.append(el('div', 'meta', `${x.publisher} · ${x.timeBasis === 'published' ? 'Published' : x.timeBasis === 'first seen by GDELT' ? 'Publication time not provided; first seen by GDELT' : 'Publication time not provided; first cached'} ${fmtUTC(x.time)}`));
      li.append(el('div', 'meta', (x.matched.level === 'institution' ? 'Capital or government body named in headline: ' : 'Country named in headline: ') + x.matched.terms.join(', ') + (x.topics.length ? ' · Topics: ' + x.topics.join(', ') : '')));
      if (x.alsoReportedBy.length) li.append(el('div', 'meta', 'Also reported by: ' + x.alsoReportedBy.map(n => { const o = auto.sources.find(q => q.n === n); return o ? o.publisher + ' [' + n + ']' : '[' + n + ']'; }).join(', ')));
      ul.append(li);
    });
    d.append(ul);
  });
  sec('Why it matters', 'why', d => {
    if (!auto.why) { d.append(...unavailable('Unavailable: ' + (auto.status === 'unavailable' ? 'there are no reports to apply the rules to.' : (lim.find(t => /analytical|No analytical rule/.test(t)) || 'not enough supporting reports.')))); return; }
    d.append(pill('ana'), el('span', 'meta', ' Keyword rules applied to the listed headlines; not a finding'));
    const ul = el('ul'); auto.why.forEach(x => ul.append(el('li', null, [x.text, el('div', 'meta', 'Rule: ' + x.rule)]))); d.append(ul);
  });
  const sd = el('section', 'bsec', el('h3', null, 'Sources')), asrc = auto ? auto.sources : [];
  if (asrc.length) {
    const ul = el('ul');
    asrc.forEach(x => ul.append(el('li', null, [el('span', 'meta', '[' + x.n + '] '), link(x.url, x.title), ` (${x.publisher}${x.time ? ', ' + (x.timeBasis || 'time') + ' ' + fmtUTC(x.time) : ', time not provided'}${x.via ? ', via ' + x.via : ''}${x.sourceLabel ? ', outlet: ' + ({ established: 'established', state: 'state-owned or government-run', unassessed: 'not assessed' })[x.sourceLabel] : ''}${x.duplicateOf ? ', same headline as [' + x.duplicateOf + ']' : ''})`])));
    sd.append(ul);
  }
  if ((hand.sources || []).length) { const ul = el('ul'); hand.sources.forEach(x => ul.append(el('li', null, [link(x.url, x.title), ` (${x.publisher}, accessed ${x.accessed})`]))); sd.append(ul); }
  if (!asrc.length && !(hand.sources || []).length) sd.append(pill('bad'), el('p', 'dim', 'No sources listed. Every statement needs one.'));
  g.append(sd);
  const foot = [];
  if (lim.length) { const ul = el('ul'); lim.forEach(t => ul.append(el('li', null, t))); foot.push(el('div', 'state', [el('b', null, 'Limitations. '), ul])); }
  if (auto) foot.push(el('p', 'note', auto.notice || 'Headlines are reports, not verified facts.'));
  root.replaceChildren(...top, g, ...foot);
}

// ---------- globe ----------
const loadScript = src => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('could not load ' + src)); document.head.append(s); });
async function firstOf(list, fn) { let err; for (const x of list) { try { return await fn(x); } catch (e) { err = e; } } throw err; }
function webglOK() { try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch (e) { return false; } }
function toGeo(t) {   // TopoJSON to GeoJSON, so no map library is needed
  const tr = t.transform, arcs = t.arcs.map(a => { let x = 0, y = 0; return a.map(p => { if (!tr) return p; x += p[0]; y += p[1]; return [x * tr.scale[0] + tr.translate[0], y * tr.scale[1] + tr.translate[1]]; }); });
  const pts = i => i < 0 ? arcs[~i].slice().reverse() : arcs[i];
  const ring = idx => idx.reduce((r, i) => r.concat(r.length ? pts(i).slice(1) : pts(i)), []);
  return t.objects.countries.geometries.filter(g => String(g.id) !== '010').map(g => ({ type: 'Feature', id: String(g.id), properties: { name: (g.properties && g.properties.name) || 'ID ' + g.id },
    geometry: { type: g.type === 'Polygon' ? 'Polygon' : 'MultiPolygon', coordinates: g.type === 'Polygon' ? g.arcs.map(ring) : g.arcs.map(p => p.map(ring)) } }));
}
async function loadAtlas() {
  return firstOf(CFG.atlas, async u => { const r = await fetch(u, AbortSignal.timeout ? { signal: AbortSignal.timeout(20000) } : {}); if (!r.ok) throw new Error('HTTP ' + r.status); return toGeo(await r.json()); });
}
function viewFor(f) {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  const big = polys.reduce((a, p) => p[0].length > a[0].length ? p : a, polys[0])[0];
  let x0 = 180, x1 = -180, y0 = 90, y1 = -90; big.forEach(([x, y]) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); });
  return { lat: (y0 + y1) / 2, lng: (x0 + x1) / 2, alt: Math.min(2.2, Math.max(.35, .3 + Math.max(x1 - x0, y1 - y0) / 70)) };
}
function other(f) {   // a country that is not monitored: fly there, but there are no data panels for it
  GRM_GLOBE.flyTo(viewFor(f), f);
  $('#qmsg').textContent = f.properties.name + ' is not monitored, so it has no data panels. Choose one of the five highlighted areas for details.';
}
function go(text) {
  const q = text.trim().toLowerCase(), msg = $('#qmsg'); if (!q) return;
  const key = IDS.find(k => k.toLowerCase() === q || C[k].name.toLowerCase() === q) || IDS.find(k => C[k].name.toLowerCase().startsWith(q));
  if (key) { msg.textContent = ''; return select(key); }
  const list = GEO || [], f = list.find(x => x.properties.name.toLowerCase() === q) || list.find(x => x.properties.name.toLowerCase().startsWith(q)) || list.find(x => x.properties.name.toLowerCase().includes(q));
  if (!f) { msg.textContent = 'No match for "' + text + '". ' + (GEO ? 'Very small territories are missing from the 110m boundary data. See the README for a more detailed option.' : 'The boundary list is not loaded.'); return; }
  const k = IDS.find(x => C[x].map === f.id);
  if (k) { msg.textContent = ''; select(k); } else if (globeOn) other(f); else msg.textContent = f.properties.name + ' is not monitored, and the globe is unavailable.';
}
function fillSearch() {
  const names = IDS.map(k => C[k].name).concat((GEO || []).map(f => f.properties.name)); const seen = new Set();
  $('#clist').replaceChildren(...names.filter(n => !seen.has(n) && seen.add(n)).sort().map(n => { const o = el('option'); o.value = n; return o; }));
}
function setRot(on) { GRM_GLOBE.rotate(on); if (rotSeg) rotSeg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', (b.dataset.v === 'on') === on)); }
async function initGlobe() {
  const fb = $('#gfb');
  try {
    if (!webglOK()) throw new Error('WebGL is not available in this browser');
    const [feats] = await Promise.all([loadAtlas(), window.Globe ? 0 : firstOf(CFG.globeLib, loadScript)]);
    if (typeof Globe !== 'function') throw new Error('the globe library did not load');
    GEO = feats; fillSearch();
    GRM_GLOBE.init($('#globe'), feats, { C, onSelect: k => select(k), onOther: other, onUserRotate: () => setRot(false) });
    globeOn = true; GRM_GLOBE.select(cur, true);
    rotSeg = seg([['on', 'Rotate'], ['off', 'Still']], 'on', v => setRot(v === 'on'));
    const rb = el('button', 'btn sm', 'Reset view'); rb.type = 'button'; rb.style.margin = '0'; rb.onclick = () => GRM_GLOBE.reset();
    $('#gctl').replaceChildren(rb, rotSeg);
  } catch (e) {
    $('#globe').hidden = true; fb.hidden = false;
    fb.replaceChildren(el('b', null, 'The 3D globe could not start. '), e.message + '. The country buttons, the search box and all data panels still work.');
    $('#mapnote').hidden = true;
    if (!GEO) loadAtlas().then(f => { GEO = f; fillSearch(); }).catch(() => {});
  }
}

// ---------- selection ----------
function select(id, fly = true) {
  cur = id; try { history.replaceState(null, '', '#' + id); } catch (e) {}
  document.documentElement.style.setProperty('--ac', C[id].color);
  document.querySelectorAll('#chips button').forEach(b => b.setAttribute('aria-pressed', b.dataset.id === id));
  document.querySelectorAll('.swap').forEach(s => { s.classList.remove('sw'); void s.offsetWidth; s.classList.add('sw'); });
  if (globeOn) GRM_GLOBE.select(id, fly);
  $('#qmsg').textContent = ''; head(); risk(); brief(); paintNews(); paintData();
}
IDS.forEach(k => { const b = el('button', 'chip', [el('i'), el('span', null, [el('b', null, C[k].name), el('small', null, k)])]); b.type = 'button'; b.dataset.id = k; b.style.setProperty('--c', C[k].color); b.onclick = () => select(k); $('#chips').append(b); });
$('#q').addEventListener('change', e => go(e.target.value));
$('#q').addEventListener('keydown', e => { if (e.key === 'Enter') go(e.target.value); });
$('#refresh').onclick = async () => { const b = $('#refresh'); b.disabled = true; b.textContent = 'Reloading...'; await loadAll(); b.disabled = false; b.textContent = 'Reload data'; };
window.addEventListener('hashchange', () => { const h = location.hash.slice(1).toUpperCase(); if (C[h] && h !== cur) select(h); });
fillSearch(); select(cur); loadAll(); initGlobe();
})();
