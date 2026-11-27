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
const store = { sec: undefined, news: null, ind: null, rss: null, gk: null, br: null, rk: null };

// ---------- publisher exclusion list (Stage 10.2) ----------
// data/publisher-exclusions.js is the same file the update scripts read. The scripts remove listed publishers before anything is written;
// this repeats the check when the page reads the cached files, so an older cache cannot show an excluded publisher. A publisher that is NOT listed
// is NOT approved or licensed. If the list did not load, the news and brief files are treated as unreadable (fails closed).
const PX = (() => {
  const c = window.PUBLISHER_EXCLUSIONS; if (!c || c.version !== 1 || !Array.isArray(c.publishers)) return null;
  const nh = v => String(v == null ? '' : v).toLowerCase().trim().replace(/^www\./, '').replace(/^\.+|\.+$/g, ''), nn = v => String(v == null ? '' : v).toLowerCase().replace(/[^a-z0-9.]+/g, ' ').trim(), esc = v => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return c.publishers.map(p => { const suf = (p.titleSuffixes || []).map(x => String(x).toLowerCase().trim()).filter(Boolean);
    return { domains: (p.domains || []).map(nh).filter(Boolean), names: new Set((p.names || []).map(nn).filter(Boolean)), rss: (p.rssIds || []).map(x => String(x).toLowerCase()), nh, nn,
      suf: suf.length ? new RegExp('[|\\-\\u2013\\u2014:\\u2022\\u00b7]\\s*(?:' + suf.map(esc).join('|') + ')\\s*$', 'i') : null }; });
})();
const pxHosts = v => { const out = []; let t = String(v == null ? '' : v); for (let k = 0; k < 3; k++) { const re = /(?:^|[^a-z0-9])(?:https?:)?\/\/([a-z0-9][a-z0-9.-]*)/gi; let m; while ((m = re.exec(t))) out.push(m[1].toLowerCase().replace(/^www\./, '')); let d; try { d = decodeURIComponent(t); } catch (e) { break; } if (d === t) break; t = d; } return out; };
const pxHit = (h, p) => p.domains.some(d => h === d || h.endsWith('.' + d));
function pxExcluded(r) {
  if (!PX) return true;
  if (!r || typeof r !== 'object') return false;
  for (const p of PX) {
    if (pxHosts(r.url).some(h => pxHit(h, p))) return true;
    for (const f of ['publisher', 'domain', 'publisherId', 'source', 'outlet']) if (typeof r[f] === 'string') { const h = p.nh(r[f]); if (h && (pxHit(h, p) || p.names.has(p.nn(r[f])))) return true; }
    if (typeof r.feedId === 'string' && p.rss.some(x => r.feedId.toLowerCase() === x || r.feedId.toLowerCase().startsWith(x + '-'))) return true;
    if (p.suf) for (const f of ['title', 'headline']) if (typeof r[f] === 'string' && p.suf.test(r[f].trim())) return true;
  }
  return Array.isArray(r.variants) ? r.variants.some(pxExcluded) : false;
}
const pxItems = a => (Array.isArray(a) ? a : []).filter(i => !pxExcluded({ ...i, variants: undefined })).map(i => Array.isArray(i.variants) && i.variants.some(pxExcluded) ? { ...i, variants: i.variants.filter(v => !pxExcluded(v)) } : i);
function pxScrub(kind, res) {
  if (!res || !res.ok) return res;
  const j = res.json || {};
  if (kind === 'risk') { if (!j.countries) return res; const countries = {}; for (const [k, c] of Object.entries(j.countries)) { const nc = { ...c }; for (const cat of ['security', 'economic', 'diplomatic']) if (c && c[cat] && Array.isArray(c[cat].context)) nc[cat] = { ...c[cat], context: c[cat].context.filter(x => !pxExcluded(x)) }; countries[k] = nc; } return { ok: true, json: { ...j, countries } }; }
  if (!PX) return { ok: false, error: 'the publisher exclusion list could not be loaded, so headlines are hidden' };
  if (kind === 'news') { if (!j.countries) return res; const countries = {}; for (const [k, c] of Object.entries(j.countries)) countries[k] = c && Array.isArray(c.articles) ? { ...c, articles: pxItems(c.articles) } : c; return { ok: true, json: { ...j, countries } }; }
  if (kind === 'items') return Array.isArray(j.items) ? { ok: true, json: { ...j, items: pxItems(j.items) } } : res;
  if (kind === 'briefs') { if (!j.countries) return res; const countries = {}; for (const [k, b] of Object.entries(j.countries)) countries[k] = b && [...(b.sources || []), ...(b.developments || [])].some(pxExcluded)
    ? { generatedAt: b.generatedAt || null, window: b.window || null, notice: b.notice || null, status: 'unavailable', reportsFound: 0, overview: null, developments: [], why: null, sources: [], limitations: ['This brief is unavailable until it is regenerated, because the publisher exclusion list changed and an earlier version named an excluded publisher. It returns after the next update.'], neutralized: true } : b; return { ok: true, json: { ...j, countries } }; }
  return res;
}
// Where a publisher can ask for removal: the repository's Issues page, worked out from the Pages address (user.github.io/repo/). On a custom domain there is no link.
(function () { try {
  const a = $('#issuesLink'); if (!a || !a.setAttribute) return;
  const h = (typeof location !== 'undefined' && location.hostname) || '', m = /^([a-z0-9-]+)\.github\.io$/i.exec(h), seg = ((typeof location !== 'undefined' && location.pathname) || '').split('/').filter(Boolean)[0];
  if (m) a.setAttribute('href', 'https://github.com/' + m[1] + '/' + (seg && !/\.html?$/i.test(seg) ? seg : m[1] + '.github.io') + '/issues/new'); else a.removeAttribute('href');
} catch (e) { /* the link is optional */ } })();

// ---------- cached data (written by the GitHub Action, Stage 2) ----------
async function loadJson(path) {
  try { const r = await fetch(path, { cache: 'no-cache' }); if (!r.ok) throw new Error(r.status === 404 ? 'file not found' : 'HTTP ' + r.status); return { ok: true, json: await r.json() }; }
  catch (e) { return { ok: false, error: e.message === 'Failed to fetch' ? 'network error' : e.message }; }
}
async function loadAll() {
  $('#meta').replaceChildren(pill('load'));
  [store.news, store.ind, store.rss, store.gk, store.br, store.rk] = await Promise.all([loadJson(CFG.newsFile), loadJson(CFG.indicatorsFile), loadJson(CFG.rssFile), loadJson(CFG.gdeltFilesFile), loadJson(CFG.briefsFile || 'data/cache/briefs.json'), loadJson(CFG.riskFile || 'data/cache/risk.json')]);
  store.news = pxScrub('news', store.news); store.rss = pxScrub('items', store.rss); store.gk = pxScrub('items', store.gk); store.br = pxScrub('briefs', store.br); store.rk = pxScrub('risk', store.rk);   // Stage 10.2: publisher exclusion list
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
  document.querySelectorAll('#meta .pill').forEach(x => { x.style.whiteSpace = 'normal'; });   // long failure texts wrap instead of widening the page on phones
  paintNews(); paintData(); brief(); risk();
  prepareSecondary().then(paintNews);   // the secondary section is repainted once the shared relevance rules have been applied to its articles
}
function headSrc(r, label, h) {   // header pill for a feed-style cache (publisher RSS, GDELT files)
  if (!r.ok) return [pill(r.error === 'file not found' ? 'info' : 'bad', label + (r.error === 'file not found' ? ': not enabled yet' : ': unavailable'))];   // not enabled yet is neutral information, not a fault
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
// Shared by the open-data section and the secondary search-API section, so both use exactly the same display rules.
const OUTLET = { established: 'established outlet', state: 'state-owned or government-run outlet', unassessed: 'not assessed' };
const matchWhy = m => m.level === 'institution' ? 'Capital or government body named in headline: ' : m.level === 'summary' ? 'Mentioned in feed summary only: ' : 'Country named in headline: ';
const byDate = (x, y) => (Date.parse(y.published || y.seenByGdelt || y.firstSeenAt) || 0) - (Date.parse(x.published || x.seenByGdelt || x.firstSeenAt) || 0);
// Source type (set per publisher in data/rss-sources.mjs, words in data/source-types.mjs, copied into the cache file as `sourceTypes`).
// Anything other than 'journalism' is an official communication: it is labelled, listed apart, and never shown as confirmation of other reports.
let TYPES = null;
const isOff = a => !!a.sourceType && a.sourceType !== 'journalism';
const typeInfo = a => ((TYPES || {})[a.sourceType]) || { label: 'Official communications', note: 'An official communication (' + a.sourceType + '). It states that body\'s own position or account and is not independently verified here.' };
function itemRow(a, extra, policy) {
  const m = a.matches[cur], off = isOff(a), ti = off ? typeInfo(a) : null;
  const kids = [el('b', null, a.publisher || 'Unknown publisher'), ...(off ? [(() => { const p = el('span', 'pill', [el('i'), ti.label]); p.title = ti.note; return p; })()] : []), (a.via ? 'via ' + a.via + ' · ' : '') + when(a), ...extra];
  const rowKids = [link(a.url, a.title), el('div', 'nm', kids), el('div', 'meta', matchWhy(m) + m.terms.join(', '))];
  if (m.role === 'incidental') rowKids.push(el('div', 'meta', C[cur].name + ' is named only in passing here (another country comes first and there is no security, diplomacy or sanctions wording).'));
  else if (m.role === 'shared') rowKids.push(el('div', 'meta', 'Involves more than one country (bilateral or multilateral story).'));
  if (off) rowKids.push(el('div', 'meta', 'Official communication: ' + ti.note));
  const tier = !off && a.source && a.source.tier;
  if (tier) { const lab = ((policy || {}).labels || {})[tier], d = el('div', 'meta', 'Outlet: ' + OUTLET[tier] + ' (a label for the outlet, not a fact-check of this headline)'); if (lab) d.title = lab; rowKids.push(d); }
  if (a.relevance && a.relevance.style) rowKids.push(el('div', 'meta', 'Sensational wording flagged (' + a.relevance.style.terms.join(', ') + '); its relevance score is lowered by 1.'));
  const tp = a.relevance && a.relevance.topics || [];
  if (tp.length) rowKids.push(el('div', 'meta', 'Topics: ' + tp.map(t => t.label).join(' · ') + ' (' + tp.map(t => t.terms.join(', ')).join('; ') + ')'));
  if (a.filtered) rowKids.push(el('div', 'meta', (a.filtered.kind === 'off-topic' ? 'Filtered as off-topic (' + (a.filtered.group || 'sport, entertainment or local news') + ' wording, no security, diplomacy or sanctions topic) because of: ' : 'Filtered as a routine financial notice because of: ') + a.filtered.terms.join(', ')));
  const vs = a.variants || [];
  if (vs.length) { const d = el('div', 'meta', 'Also reported by: '); vs.forEach((v, i) => { if (i) d.append(', '); d.append(link(v.url, v.publisher || 'source')); }); if ((a.variantsTotal || vs.length) > vs.length) d.append(' (+' + (a.variantsTotal - vs.length) + ' more)'); rowKids.push(d); }
  return el('li', null, rowKids);
}
// Ranked list plus the labelled folds (other, in passing, summary-only, filtered). `all` = items that name the current country.
function itemLists(all, row, nodes, o) {
  // Official communications get their own labelled list, apart from publisher reporting, so the two are never read as one stream.
  const offAll = all.filter(isOff);
  if (offAll.length && !o.official) {
    itemLists(all.filter(a => !isOff(a)), row, nodes, { ...o, reportingOnly: true });
    const sub = []; itemLists(offAll, row, sub, { ...o, last: false, official: true });
    const h = el('h4', null, `Official communications (${offAll.length})`); h.style.cssText = 'margin:16px 0 4px;font-size:13px';
    nodes.push(h, el('p', 'meta', 'Statements by governments, international organizations or EU institutions. They give those bodies\' own positions or accounts, are not independently verified here, and are not counted as independent confirmation of the reports above. Only the headline, source, date and link are shown.'), ...sub);
    return;
  }
  const { last, windowText } = o;
  const score = a => (a.relevance && a.relevance.score) || 0, byRel = (x, y) => score(y) - score(x) || byDate(x, y);
  const shown = all.filter(a => !a.filtered), flt = all.filter(a => a.filtered).sort(byDate);
  const passing = shown.filter(a => a.matches[cur].level !== 'summary' && a.matches[cur].role === 'incidental').sort(byDate).slice(0, 20);
  const main = shown.filter(a => a.matches[cur].role !== 'incidental');
  const strong = main.filter(a => a.matches[cur].level !== 'summary' && (!a.relevance || a.relevance.tier !== 'other')).sort(byRel).slice(0, 20);
  const plain = main.filter(a => a.matches[cur].level !== 'summary' && a.relevance && a.relevance.tier === 'other').sort(byDate).slice(0, 20);
  const sm = shown.filter(a => a.matches[cur].level === 'summary').sort(byDate).slice(0, 20);
  const fold = (text, list) => { const d = el('details'); d.append(el('summary', null, text)); const ul = el('ul', 'news'); list.forEach(a => ul.append(row(a))); d.append(ul); nodes.push(d); };
  if (strong.length) { const ul = el('ul', 'news'); strong.forEach(a => ul.append(row(a))); nodes.push(ul); }
  else if (last) nodes.push(el('div', 'state', 'No cached ' + (o.reportingOnly ? 'publisher-reporting ' : '') + 'headline with a security, diplomacy, sanctions/trade or economic-policy signal names ' + C[cur].name + ' (' + windowText + '). This does not mean nothing happened: it only reflects these sources.'));
  if (plain.length) fold(`Other headlines naming ${C[cur].name} without a geopolitical keyword (${plain.length})`, plain);
  if (passing.length) fold(`Mentioned in passing (${passing.length}): ${C[cur].name} is named, but the story appears to be mainly about another country`, passing);
  if (sm.length) fold(`Mentioned in the feed summary only (${sm.length}): weaker match, the headline does not name ${C[cur].name}`, sm);
  if (flt.length) fold(`Filtered out (${flt.length}): routine financial notices and sport, entertainment or local news with no geopolitical topic. Shown here so nothing is hidden silently`, flt);
}
function articleBlock(s, kind) {
  const gk = kind === 'gdelt', hrsKey = gk ? 'gdeltFiles' : 'rss';
  if (!s) return { pills: [pill('load')], nodes: [skel()] };
  if (!s.ok) {
    if (s.error === 'file not found' && gk) return { pills: [pill('info', 'Not enabled yet')], nodes: [el('div', 'state', [el('b', null, 'GDELT open data files have not been fetched yet. '), 'The workflow that reads them has not been verified and run, so there is no cache file. Nothing is shown here in place of articles. See the README.'])] };
    if (s.error === 'file not found') return { pills: [pill('info', 'Not enabled yet')], nodes: [el('div', 'state', [el('b', null, 'Publisher RSS feeds are not enabled yet. '), 'No publisher has been verified and switched on, so there is no cache file. Nothing is shown here in place of publisher headlines. See the README.'])] };
    return { pills: [pill('bad')], nodes: [missing('Publisher feeds', CFG.rssFile, s.error)] };
  }
  const j = s.json; TYPES = j.sourceTypes || null;
  const feeds = Object.values(j.feeds || {}), nBad = feeds.filter(f => f.status !== 'ok').length, last = j.lastSuccessAt || null, hrs = CFG.staleAfterHours[hrsKey], pills = [], nodes = [];
  if (!last) pills.push(pill('bad', 'No successful update yet'));
  else if (nBad === 0) pills.push(stamp(last, hrs, 'Updated', false));
  else if (nBad === feeds.length) pills.push(stamp(last, hrs, 'Updated', true), pill('bad', 'Latest refresh failed'));
  else pills.push(stamp(last, hrs, 'Updated', true), pill('stale', `${feeds.length - nBad} of ${feeds.length} feeds updated`));
  const failed = feeds.filter(f => f.status !== 'ok');
  if (failed.length) nodes.push(el('div', 'state err', [el('b', null, `${failed.length} of ${feeds.length} feeds failed on the latest refresh. `), failed.map(f => `${f.publisher} / ${f.label}: ${f.error || 'unknown error'}`).join('; ') + '. Articles from these feeds below are cached from the last successful update and may be out of date.']));
  const all = (Array.isArray(j.items) ? j.items : []).filter(a => a.matches && a.matches[cur]);
  // Why this article is listed for the country. Old cache files used level 'headline'; new ones use 'country' / 'institution'.
  const bad = a => { const f = (j.feeds || {})[a.feedId]; return !f || f.status !== 'ok'; };
  const row = a => { const f = (j.feeds || {})[a.feedId], old = f && f.lastSuccessAt && (Date.now() - new Date(f.lastSuccessAt)) / 36e5 > hrs, extra = [];
    if (bad(a)) extra.push(pill('stale', f ? 'Cached: feed refresh failed' : 'Cached: feed not part of the latest refresh')); else if (old) extra.push(pill('stale', 'Stale'));
    return itemRow(a, extra, j.sourcePolicy); };
  itemLists(all, row, nodes, { last, windowText: 'last ' + (j.retentionDays || 7) + ' days' });
  const pubs = (j.publishers || []).map(p => p.name + ' (' + (p.sourceType ? (((TYPES || {})[p.sourceType] || {}).label || (p.sourceType === 'journalism' ? 'Publisher reporting' : 'Official communications')) + '; ' : '') + 'terms checked ' + p.termsChecked + ')').join(', ') || 'none';
  const attr = j.attribution ? [' Data: ', link(j.attribution.url, j.attribution.name), ' (open dataset, used under its terms).'] : [];
  const tt = termText((j.terms || {})[cur]);   // an empty word list is not shown as a blank gap
  nodes.push(el('p', 'meta', ['Reported events. Sources: ' + pubs + '.', ...attr, ...(tt ? [' Matching words for ' + C[cur].name + ': ', el('code', null, tt), '.'] : []), ' Each headline links to the original report. Last successful update: ' + (last ? fmtUTC(last) : 'none yet') + (j.checkedAt ? '. Last checked: ' + fmtUTC(j.checkedAt) : '') + '.']));
  nodes.push(el('p', 'note', (gk ? 'Headlines are written by the publishers named and link straight to their pages; GDELT only indexes them. ' : '') + 'Only the headline, publisher, date and link are copied; read the article at the publisher. Articles are matched to a country by its name, or its capital or a government body, in the headline (the names of people are never used), and ordered by simple keyword rules (security, diplomacy, sanctions and trade, economic policy). Routine fund and stock notices, and sport, entertainment or local news without a geopolitical topic, are filtered into a labelled list; near-identical headlines are grouped with links to every source; and a country that is only named in passing is listed separately. Outlet labels describe the publisher (by fixed lists in data/source-quality.mjs) and are not a fact-check; an outlet without a label is simply not assessed. A country named in a headline does not prove the article is mainly about it, and these keyword rules can be wrong. Headlines belong to the publishers and are neither checked nor endorsed here.'));
  return { pills, nodes };
}

// ----- GDELT search API (secondary). Collapsed by default; the status is always visible in its header line. -----
// Its articles get the SAME judgement as the open-data section: this page loads the project's own rule files (data/country-terms.mjs, data/relevance-rules.mjs,
// data/source-quality.mjs, scripts/relevance-lib.mjs, scripts/rss-lib.mjs) instead of keeping a second copy of the rules. If they cannot be loaded, the articles are
// shown unfiltered and the page says so. Nothing here changes what the GitHub Action requests from GDELT.
let secOpen = false, RULES_P = null, cssDone = false;
const seenIso = d => { const m = /^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)Z?$/.exec(d || ''); return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.000Z` : null; };   // only used by the unfiltered fallback below
function loadRules() {
  if (!RULES_P) RULES_P = Promise.all([import('../scripts/secondary-lib.mjs'), import('../scripts/relevance-lib.mjs'), import('../data/relevance-rules.mjs'), import('../data/country-terms.mjs')])
    .then(([S, L, RR, CT]) => ({ S, rules: { countryTerms: CT.COUNTRY_TERMS, relevanceRules: RR.RULES }, terms: L.termSummary(CT.COUNTRY_TERMS) }));
  return RULES_P;
}
async function prepareSecondary() {
  const s = store.news; if (!s || !s.ok || !s.json.countries) { store.sec = null; return; }
  try { const X = await loadRules(); store.sec = { ok: true, ...X.S.analyse(s.json.countries, X.rules), terms: X.terms }; }
  catch (e) { store.sec = { ok: false, error: String((e && e.message) || e) }; }
}
function secCss() {
  if (cssDone) return; cssDone = true;
  const st = document.createElement('style');
  st.textContent = '.sec2h{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;width:100%;background:var(--p2);border:1px solid var(--line2);border-radius:8px;padding:8px 10px;color:var(--tx);font:inherit;text-align:left;cursor:pointer}' +
    '.sec2h:hover{border-color:var(--cyan)}.sec2h:focus-visible{outline:2px solid var(--cyan);outline-offset:2px}.sec2h .car{display:inline-block;color:var(--mut);transition:transform .15s}.sec2h[aria-expanded=true] .car{transform:rotate(90deg)}' +
    '.sec2h b{font-size:14px}.sec2h .pill{font-size:11.5px}.sec2b{margin-top:8px}' +
    '.warnline{margin-top:6px;border-left:3px solid var(--amber);background:rgba(245,158,11,.08);color:#fcd9a0;border-radius:6px;padding:6px 10px;font-size:12.5px;line-height:1.45}' +
    '.warnline.err{border-left-color:var(--red);background:rgba(239,68,68,.08);color:#fca5a5}.warnline details{margin-top:4px}.warnline summary{cursor:pointer;text-decoration:underline}.warnline ul{margin:4px 0 0;padding-left:18px}';
  document.head.append(st);
}
function secShell(chips, warn, bodyNodes) {
  secCss();
  const wrap = el('div', 'sec2'), btn = el('button', 'sec2h'), body = el('div', 'sec2b');
  body.id = 'sec2-body'; body.hidden = !secOpen; btn.type = 'button'; btn.setAttribute('aria-expanded', String(secOpen)); btn.setAttribute('aria-controls', 'sec2-body');
  btn.append(el('span', 'car', '▸'), el('b', null, 'GDELT search API (secondary)'), ...chips);
  btn.onclick = () => { secOpen = !secOpen; body.hidden = !secOpen; btn.setAttribute('aria-expanded', String(secOpen)); };
  body.append(...bodyNodes); wrap.append(btn); if (warn) wrap.append(warn); wrap.append(body);
  return wrap;
}
function gdeltBlock() {
  const s = store.news;
  if (!s) return secShell([pill('load')], null, [skel()]);
  if (!s.ok) return secShell([pill('bad', 'Unavailable')], el('div', 'warnline err', '⚠ The cache file ' + CFG.newsFile + ' could not be read (' + s.error + '). No substitute content is shown.'), [el('p', 'meta', 'This section reads only the cache written by the scheduled GitHub Action; the browser never calls GDELT.')]);
  const j = s.json, cs = Object.entries(j.countries || {}), n = cs.length, hrs = CFG.staleAfterHours.news;
  if (!n) return secShell([pill('bad', 'Unreadable cache')], el('div', 'warnline err', '⚠ The cache file has no country entries, so nothing can be shown.'), []);
  const errs = cs.filter(([, c]) => c && c.status === 'error'), notTried = errs.filter(([, c]) => c.attempted === false).length, failed = errs.length - notTried;
  const cached = cs.filter(([, c]) => c && (c.status === 'error' ? (c.articles || []).length : j.checkedAt && c.checkedAt && Date.parse(c.checkedAt) < Date.parse(j.checkedAt) - 1000));
  const last = j.lastSuccessAt || null, old = !last || (Date.now() - Date.parse(last)) / 36e5 > hrs;
  // status chips: last success, latest refresh, cache in use. Green only when nothing failed and the data is not old.
  const c1 = !last ? pill('bad', 'No successful update yet') : pill(errs.length || old ? 'stale' : 'live', 'Last success: ' + ago(last)); if (last) c1.title = fmtUTC(last) + ' (UTC)';
  const c2 = !errs.length ? pill('live', `Latest refresh: all ${n} OK`) : pill(errs.length === n ? 'bad' : 'stale', `Latest refresh: ${errs.length} of ${n} not refreshed`);
  const c3 = pill('hist', cached.length ? `Cached data in use: ${cached.length} of ${n}` : 'No cached data in use'); c3.title = 'Counts countries whose articles come from an earlier run: either the latest request failed or was not attempted, or the country was not re-requested because its cache was recent.';
  let warn = null;
  if (errs.length || old) {
    const parts = [];
    if (errs.length) parts.push(`Latest refresh problem: ${[failed ? failed + ' of ' + n + ' countries failed' : '', notTried ? notTried + ' not attempted' : ''].filter(Boolean).join(', ')}.`);
    if (old && last) parts.push(`Data is stale: last successful update ${ago(last)} (${fmtUTC(last)}), older than ${hrs} h.`);
    if (errs.length) parts.push((cached.length ? 'Showing cached articles' : 'No cached articles to show') + (last && !old ? '; last success ' + fmtUTC(last) : '') + '.');
    if (!last) parts.push('There has been no successful update yet.');
    warn = el('div', 'warnline' + (errs.length === n || !last ? ' err' : ''), '⚠ ' + parts.join(' '));
    if (errs.length) { const d = el('details'), ul = el('ul'); d.append(el('summary', null, 'Error details')); errs.forEach(([k, c]) => ul.append(el('li', null, `${(C[k] || {}).name || k}: ${c.error || 'no reason recorded'}${c.attempted === false ? ' (not attempted)' : ''}`))); d.append(ul); warn.append(d); }
  }
  const e = (j.countries || {})[cur], chips = [c1, c2, c3];
  if (!e) return secShell(chips, warn, [el('div', 'state err', 'The GDELT cache has no entry for ' + C[cur].name + '.')]);
  const body = [], arts = Array.isArray(e.articles) ? e.articles : [], ts = e.fetchedAt || null, sec = store.sec;
  body.push(el('div', 'meta', `${C[cur].name}: search ${e.status === 'error' ? (e.attempted === false ? 'not attempted in the latest run' : 'failed in the latest run') : 'succeeded'}; this country's articles were fetched ${ts ? fmtUTC(ts) + ' (' + ago(ts) + ')' : 'never successfully'}${e.checkedAt ? '; last checked ' + fmtUTC(e.checkedAt) : ''}.`));
  const extra = a => { const ents = (a._from || [a.feedId]).map(k => (j.countries || {})[k]).filter(Boolean); if (!ents.length) return [];
    if (!ents.some(x => x.status === 'ok')) return [pill('stale', 'Cached: latest refresh failed')];
    return ents.some(x => x.status === 'ok' && x.fetchedAt && (Date.now() - Date.parse(x.fetchedAt)) / 36e5 <= hrs) ? [] : [pill('stale', 'Stale')]; };
  if (sec === undefined) body.push(skel());
  else if (sec && sec.ok) {
    const mine = sec.items.filter(a => a.matches && a.matches[cur]), nodes = [];
    itemLists(mine, a => itemRow(a, extra(a), null), nodes, { last: arts.length > 0, windowText: 'cached window ' + (j.timespan || 'unknown') });
    const um = sec.unmatched.filter(a => a._from.includes(cur));
    if (um.length) { const d = el('details'); d.append(el('summary', null, `Returned by the search, but the headline names none of the five countries (${um.length}): not matched, shown here so nothing is hidden`)); const ul = el('ul', 'news');
      um.sort(byDate).forEach(a => ul.append(el('li', null, [link(a.url, a.title), el('div', 'nm', [el('b', null, a.publisher || 'Unknown publisher'), when(a), ...extra(a)]), el('div', 'meta', 'GDELT matched the search words somewhere in the article; the headline itself names no monitored country, so no relevance rule can be applied.')]))); d.append(ul); nodes.push(d); }
    if (!arts.length && e.status !== 'error') body.push(el('div', 'state', 'GDELT returned no articles for this search in the cached window (' + (j.timespan || 'unknown') + ').'));
    else if (!mine.length && !um.length && arts.length) body.push(el('div', 'state', 'None of the cached articles names ' + C[cur].name + ' in its headline after the matching rules.'));
    if (arts.length === 0 && e.status === 'error') body.push(el('div', 'state', 'No cached articles for this country, so nothing is shown. The refresh problem is described above.'));
    body.push(...nodes);
    body.push(el('p', 'meta', ['Reported events. Search: ', el('code', null, e.query || C[cur].gdelt), '. Matching words for ' + C[cur].name + ': ', el('code', null, termText(sec.terms[cur])), '. Last successful update (any country): ' + (last ? fmtUTC(last) : 'none yet') + (j.checkedAt ? '. Last checked: ' + fmtUTC(j.checkedAt) : '') + '.']));
    body.push(el('p', 'note', 'The same relevance, off-topic, country-matching, duplicate-grouping and outlet-label rules as the open-data section are applied to these headlines (rule files in data/ and scripts/relevance-lib.mjs, read by this page). The search itself matches words anywhere in the article, not only the headline, so some results do not name the country in the headline and are listed separately. Outlet labels describe the publisher, not a fact-check of the headline. Headlines belong to the publishers shown and are neither checked nor endorsed here. GDELT reports when it first saw an article, which can be later than its publication date. Fetched by a scheduled GitHub Action, not live in your browser.'));
  } else {
    body.push(el('div', 'warnline', '⚠ The shared relevance rules could not be loaded in this browser' + (sec && sec.error ? ' (' + sec.error + ')' : '') + ', so these headlines are shown WITHOUT relevance, off-topic, duplicate or outlet-label processing, in the order GDELT returned them.'));
    if (arts.length) { const ul = el('ul', 'news'); arts.forEach(a => ul.append(el('li', null, [link(a.url, a.title || '(untitled)'), el('div', 'nm', [el('b', null, a.domain || 'Unknown publisher'), 'First seen by GDELT ' + (seenIso(a.seendate) ? fmtUTC(seenIso(a.seendate)) : 'at an unknown time')])]))); body.push(ul); }
    else if (e.status !== 'error') body.push(el('div', 'state', 'GDELT returned no articles for this search in the cached window (' + (j.timespan || 'unknown') + ').'));
    body.push(el('p', 'meta', ['Reported events. Search: ', el('code', null, e.query || C[cur].gdelt), '.']));
    body.push(el('p', 'note', 'Headlines belong to the publishers shown and are neither checked nor endorsed here. GDELT reports when it first saw an article, which can be later than its publication date. Fetched by a scheduled GitHub Action, not live in your browser.'));
  }
  return secShell(chips, warn, body);
}

function paintNews() {
  const r = articleBlock(store.rss, 'rss'), k = articleBlock(store.gk, 'gdelt');
  $('#nst').replaceChildren();
  $('#news').replaceChildren(secHead('Official and publisher feeds (RSS)', r.pills), ...r.nodes, secHead('GDELT open data files', k.pills), ...k.nodes, gdeltBlock());
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
    const td = (x, lab) => { const c = el('td', null, x); c.setAttribute('role', 'cell'); if (lab) c.setAttribute('data-label', lab); return c; }, tr = el('tr', null, [td(i.label), td(val), td(yr, 'Reference year'), td(src, 'Source')]); tr.setAttribute('role', 'row'); tb.append(tr);
  });
  const hr = el('tr', null, ['Indicator', 'Latest value', 'Reference year', 'Source'].map(x => { const h = el('th', null, x); h.setAttribute('role', 'columnheader'); return h; })), th = el('thead', null, hr); hr.setAttribute('role', 'row'); tb.setAttribute('role', 'rowgroup'); th.setAttribute('role', 'rowgroup');
  const warn = e.status === 'unsupported' ? 'The World Bank API does not publish data for this area. ' + (e.error || '') + ' Nothing from any other country is substituted. Check national statistical sources instead.'
    : shown.length ? null : 'No indicators are available for this area. ' + (e.error || 'The World Bank may not publish series for it.');
  box.replaceChildren(...(warn ? [el('div', 'state err', warn)] : e.status === 'partial' || e.status === 'error' ? [el('div', 'state err', [el('b', null, 'The latest World Bank refresh failed for some indicators. '), (e.error || '') + ' Rows marked "older value" come from the last successful update.'])] : []),
    el('div', 'wrap', (() => { const t = el('table', null, [th, tb]); t.setAttribute('role', 'table'); return t; })()),
    el('p', 'note', 'Factual data. Each row is the most recent value the World Bank had published at the last successful update' + (ts ? ' (' + fmtUTC(ts) + ')' : '') + (e.checkedAt ? '; last checked ' + fmtUTC(e.checkedAt) : '') + '. Reference years differ and some lag by a year or more. Not real time.'));
}

// ---------- static panels ----------
function head() {
  const c = C[cur];
  $('#head').replaceChildren(el('div', 'card chead', [el('div', 'chl', [el('h2', null, c.name), el('span', null, cur)]), ...(c.note ? [el('p', 'callout', [pill('ed'), c.note])] : [])]));
}
// ----- Stage 9: Country Risk Profile tiles (risk.json methodologyVersion 3 adds `profile` to the security and economic cards).
// A short, presentation-only summary stays visible in each tile; every sentence generated into risk.json is kept, unchanged, inside the folds.
// The macroeconomic stress flag is plain text with no severity colour. A risk.json without `profile` (older file) is drawn by the original code in risk() below. -----
const rkFold = (title, kids) => { const k = kids.filter(Boolean); if (!k.length) return null; const d = el('details'); d.append(el('summary', null, title), ...k); return d; };
// Long URLs inside note text cannot wrap and would widen the page on phones: each is shown as a short link labelled with its host name.
const rkTxt = t => String(t).split(/(https?:\/\/[^\s)]+)/).map(x => /^https?:\/\//.test(x) ? link(x, (x.match(/^https?:\/\/([^/]+)/) || [])[1] || 'link') : x);
const rkList = items => { const ul = el('ul'); items.forEach(t => ul.append(el('li', null, rkTxt(t)))); return ul; };
const rkSrc = s => el('p', 'meta', ['Source: ', link(s.url, s.name), ' (' + s.publisher + (s.licence ? ', ' : ''), ...(s.licence ? rkTxt(s.licence) : []), ').']);
const rkP = (t, c) => el('p', c || 'meta', rkTxt(t));
const rkLim = items => { const ul = el('ul', 'lim'); items.filter(Boolean).forEach(t => ul.append(el('li', null, t))); return ul; };   // the short limitations that stay visible
const rkTile = t => el('div', 'tile rk', el('h3', null, t));
const rkAdd = (t, ...kids) => { kids.filter(Boolean).forEach(x => t.append(x)); return t; };
const MINUS = '−';
// A true minus sign for display only (the stored value keeps its ASCII hyphen); screen readers get the word "minus".
const rkNum = s => { const t = String(s); if (t[0] !== '-') return [t]; const v = el('span', null, MINUS + t.slice(1)); v.setAttribute('aria-hidden', 'true'); return [v, el('span', 'sr', 'minus ' + t.slice(1))]; };
// The Taiwan note is shortened for the tile; any other country note would be shown in full. The full generated text is always in the fold.
const rkCountry = note => !note ? null : /cross-strait/i.test(note) ? 'Does not measure cross-strait tension or military activity.' : note;
function acTile(P) {
  const ac = P.armedConflict, n = ac.uniqueConflicts, A = rkTile('Armed Conflict Involvement');
  if (ac.status !== 'ok') rkAdd(A, el('p', 'fig none', 'Not shown'), el('p', 'sub', ac.summary));
  else rkAdd(A, ac.stale ? pill('stale', 'Stale inputs') : null, el('p', 'src', 'UCDP/PRIO' + (ac.datasetVersion ? ' v' + ac.datasetVersion : '') + ' · calendar year ' + ac.referenceYear),
    el('p', n ? 'fig' : 'fig none', n ? [String(n), ' ', el('span', 'unit', n === 1 ? 'conflict' : 'conflicts')] : 'None recorded'),
    n && ac.roleSummary ? el('p', 'sub', ac.roleSummary) : null);
  rkAdd(A, rkLim([rkCountry(P.countryNote), 'Counts state-based armed conflicts only. It is not a measure of overall security risk, and a count of zero does not mean there is no threat.',
    n ? 'Intensity describes the whole conflict, not this country\'s own involvement. Roles follow UCDP coding; "location" does not mean where the fighting took place.' : null]));
  if (ac.status === 'ok' && ac.conflicts.length) rkAdd(A, rkFold('Conflicts (' + ac.conflicts.length + ')', [(() => { const ul = el('ul'); ac.conflicts.forEach(c => ul.append(el('li', null, [el('b', null, c.conflictId + ' '), c.sideA + ' vs ' + c.sideB,
    el('div', 'meta', c.roleLabel + (c.intensityLabel ? '. Intensity of the whole conflict: ' + c.intensityLabel : '') + (c.type ? '; ' + c.type : '') + (c.incompatibility ? '; about ' + c.incompatibility : '') + '. UCDP "location" field: ' + c.location + '.')]))); return ul; })()]));
  return rkAdd(A, rkFold('Method, sources and limitations', [rkP(ac.summary), ...ac.notes.visible.map(t => rkP(t)), P.countryNote ? rkP(P.countryNote) : null, rkList(ac.notes.more), rkSrc(ac.source)]));
}
function psTile(P) {
  const ps = P.politicalStability, W = rkTile('Political Stability'), has = ps.status === 'ok' || ps.status === 'outdated';
  if (has) rkAdd(W, ps.stale ? pill('stale', 'Stale inputs') : null, el('p', 'src', 'World Bank WGI · 2025 revision · reference year ' + ps.referenceYear), el('p', 'fig', [...rkNum(ps.displayEstimate), ' ', el('span', 'unit', 'estimate')]));
  else rkAdd(W, el('p', 'fig none', 'No value'), el('p', 'sub', ps.summary));
  rkAdd(W, rkLim(has ? [rkCountry(P.countryNote), 'Perception-based estimate on a scale of about ' + MINUS + '2.5 to +2.5.', 'Zero is not the global average.',
    ps.uncertainty == null ? 'Margin of error not retrieved here; small differences between countries or years should not be over-interpreted.' : ps.uncertaintyNote] : [rkCountry(P.countryNote)]));
  return rkAdd(W, rkFold('Method, sources and limitations', [...ps.notes.visible.map(t => rkP(t)), ps.estimate != null ? el('p', 'meta', 'Stored value: ' + ps.estimate + ' (shown to two decimals). ' + (ps.sourceUpdated ? 'World Bank dataset updated ' + ps.sourceUpdated + '.' : '')) : null, rkList(ps.notes.more), rkSrc(ps.source)]));
}
function macroTile(P, a) {
  const M = rkTile('Macroeconomic Profile'), NAME = { inflation: 'Inflation', growth: 'GDP growth', unemployment: 'Unemployment' }, fl = P.flag, ok = fl.status === 'assessed', ul = el('ul', 'kv');
  P.indicators.forEach(r => { const li = el('li'), none = !r.displayValue;
    li.append(el('span', 'k', NAME[r.key]), el('span', none ? 'v dim' : 'v', none ? (r.status === 'unsupported' ? 'not published for this country' : r.status === 'unavailable' ? 'unavailable' : r.status === 'not-in-cache' ? 'not in the cache' : 'no value published') : r.displayValue), ...(none ? [] : [el('span', 'y', String(r.year))]));
    if (r.note && (r.status === 'outdated' || r.status === 'unavailable' || r.stale)) li.append(el('p', 'n', r.note));
    ul.append(li); });
  rkAdd(M, a.stale ? pill('stale', 'Stale inputs') : null, ul, el('div', 'flag', [el('span', 'k', fl.name), el('span', 'v', ok ? fl.level : 'Insufficient data')]), rkLim([...(ok ? [] : [a.summary]), ...P.notes.visible]));
  return rkAdd(M, ok ? rkFold('How the flag is set', [el('p', 'meta', fl.rule), rkList(P.indicators.filter(r => r.status === 'used').map(r => NAME[r.key] + ': ' + r.band + ' band'))]) : null,
    rkFold('Method, sources and limitations', [rkList(P.notes.more), el('p', 'fold-h', 'Sources and dates'), (() => { const u = el('ul'); P.indicators.forEach(r => u.append(el('li', null, [link(r.source.url, r.source.name), ' (' + r.source.publisher + (r.source.licence ? ', ' : ''), ...(r.source.licence ? rkTxt(r.source.licence) : []), ')' + (r.year ? ', reference year ' + r.year : '')]))); return u; })(),
      el('p', 'meta', 'Last successful input update: ' + (a.lastSuccessAt ? fmtUTC(a.lastSuccessAt) : 'n/a') + '.')]));
}
function dipTile(a) {
  const D = rkTile('Diplomatic Assessment'), ok = a.status === 'assessed', ctx = a.context || [];
  rkAdd(D, a.stale ? pill('stale', 'Stale inputs') : null, el('p', ok ? 'fig' : 'fig none', ok ? a.level : 'Insufficient data'),
    rkLim([ok ? a.summary : a.insufficientReason === 'method' ? 'No suitable, verified and legally reusable dataset of diplomatic relations has been identified.' : a.summary]));
  rkAdd(D, rkFold('Method, sources and limitations', [rkP(a.summary), ...(ok ? [el('p', 'meta', a.rule || '')] : [el('p', 'meta', 'No level is derived. ' + (a.insufficientReason === 'method' ? 'No defensible automated method exists for this category.' : 'The evidence is missing or too thin; missing data is never treated as low risk.'))]),
    el('p', 'fold-h', 'Sources and dates'), (() => { const ul = el('ul'); (a.sources || []).forEach(x => ul.append(el('li', null, [link(x.url, x.name), ' (' + x.publisher + (x.licence ? ', ' + x.licence : '') + ')']))); if (!(a.sources || []).length) ul.append(el('li', 'dim', 'No data source was used.')); return ul; })(),
    el('p', 'meta', 'Reference year' + ((a.referenceDates || []).length === 1 ? '' : 's') + ': ' + ((a.referenceDates || []).join(', ') || 'n/a') + '. Last successful input update: ' + (a.lastSuccessAt ? fmtUTC(a.lastSuccessAt) : 'n/a') + '.'),
    el('p', 'fold-h', 'Limitations (' + (a.limitations || []).length + ')'), (() => { const ul = el('ul'); (a.limitations || []).forEach(t => ul.append(el('li', null, t))); return ul; })()]));
  if (ctx.length) rkAdd(D, rkFold('Reported context, not used for the level (' + ctx.length + ')', [el('p', 'meta', 'Headlines are reports by publishers, not verified facts.'), (() => { const ul = el('ul'); ctx.forEach(c => ul.append(el('li', null, [link(c.url, c.headline), el('div', 'meta', c.publisher + (c.time ? ' · ' + (c.timeBasis || 'time') + ' ' + fmtUTC(c.time) : ' · time not provided'))]))); return ul; })()]));
  return D;
}
const profileTiles = (k, a) => k === 'security' ? [acTile(a.profile), psTile(a.profile)] : [macroTile(a.profile, a)];
function legacySection(auto) {
  const d = el('details'), ul = el('ul');
  d.append(el('summary', null, 'Methodology and legacy classifications'),
    el('p', 'meta', 'Profiles show values from the public datasets named in each tile. The macroeconomic stress flag and the legacy classifications are fixed, project-defined rules, not validated international risk standards. Headlines and article counts never set a value. "Insufficient data" means the evidence is missing or too thin; it is not a finding of low risk.'),
    el('p', 'meta', auto.security.profile.legacyNote));
  [['Security', auto.security], ['Economic', auto.economic], ['Diplomatic', auto.diplomatic]].forEach(([n, x]) => ul.append(el('li', null, [el('b', null, n + ': '), x.status === 'assessed' ? x.level : 'Insufficient data', ...(x.rule ? [el('div', 'meta', x.rule)] : [])])));
  d.append(ul); return el('div', 'note', d);
}
// ----- risk assessment cards: built by scripts/build-risk.mjs from public datasets with documented rules (README "Risk assessments"). Hand-written entries in data/countries.js still win. -----
function risk() {
  const s = store.rk, g = el('div', 'grid3'), top = [], hand = C[cur].risk || {}, hrs = CFG.staleAfterHours.risk || 72;
  const file = s && s.ok && s.json && s.json.countries ? s.json : null, auto = file && file.countries[cur];
  if (!s) { $('#risk').replaceChildren(skel()); return; }
  const prof = !!(auto && auto.security && auto.security.profile && auto.economic && auto.economic.profile);   // methodology 3 file: profiles; an older file is drawn as before
  const colA = el('div', 'rkcol'), colB = el('div', 'rkcol');   // profile mode: security tiles in the first column, economic and diplomatic in the second
  if (prof) { g.className = 'bgrid'; g.append(colA, colB); }
  if (file) {
    const failed = file.status === 'error';
    top.push(stamp(file.lastSuccessAt, hrs, 'Assessments built', failed));
    if (failed) top.push(pill('stale', 'Latest rebuild failed: earlier assessments kept'));
    const ri = file.inputs && file.inputs.riskInputs, days = CFG.riskInputsStaleDays || 14;
    if (ri && ri.status === 'ok' && ri.lastSuccessAt && (Date.now() - new Date(ri.lastSuccessAt)) / 864e5 > days) top.push(pill('stale', 'Risk datasets not refreshed for over ' + days + ' days'));
    if (failed) top.push(el('div', 'state err', [el('b', null, 'The latest rebuild failed: '), file.error || 'no reason recorded', '. The assessments below are the last successful ones (' + fmtUTC(file.lastSuccessAt) + ').']));
    if (prof) top.push(el('p', 'note', 'Descriptive profiles from public datasets, not a forecast. Missing data is never treated as low risk.'));
  }
  const LABEL = { security: 'Security', economic: 'Economic', diplomatic: 'Diplomatic' };
  ['security', 'economic', 'diplomatic'].forEach(k => {
    const r = hand[k], a = auto && auto[k], b = el('div', 'tile', el('h3', null, LABEL[k]));
    if (r) { b.append(pill('ana'), el('p', 'big', r.rating), el('p', 'meta', r.assessor + ', as of ' + r.asOf)); if (r.note) b.append(el('p', 'meta', 'Analyst note: ' + r.note)); if (safe(r.url)) b.append(link(r.url, 'Source')); g.append(b); return; }
    if (!file) { b.append(pill('bad'), el('p', 'big dim', 'Unavailable'), el('p', 'meta', s.error === 'file not found' ? 'The risk assessments have not been generated yet (the workflow has not run). Nothing is shown rather than guessing.' : 'The cache file ' + CFG.riskFile + ' could not be read (' + s.error + ').')); g.append(b); return; }
    if (!a) { b.append(pill('bad'), el('p', 'big dim', 'Unavailable'), el('p', 'meta', 'The cache has no entry for ' + C[cur].name + '.')); g.append(b); return; }
    if (prof && (k === 'security' || k === 'economic')) { profileTiles(k, a).forEach(t => (k === 'security' ? colA : colB).append(t)); return; }
    if (prof && k === 'diplomatic') { colB.append(dipTile(a)); return; }
    const ok = a.status === 'assessed';
    b.append(...(prof ? [] : [ok ? pill('ana', 'Rule-based assessment') : pill('bad', 'Insufficient data')]), ...(a.stale ? [pill('stale', 'Stale inputs')] : []), el('p', ok ? 'big' : 'big dim', ok ? a.level : 'Insufficient data'), el('p', 'meta', a.summary));
    const fold = (title, kids) => { if (kids.length) { const d = el('details'); d.append(el('summary', null, title), ...kids); b.append(d); } };
    const obs = (a.facts || []).filter(f => f.kind === 'observed'), itp = (a.facts || []).filter(f => f.kind === 'interpretation');
    fold('Observed facts (' + obs.length + ')', obs.length ? [(() => { const ul = el('ul'); obs.forEach(f => ul.append(el('li', null, [el('b', null, f.label + ': '), f.value, ' (' + (f.year || 'year n/a') + ', ', link(f.url, f.source), ')']))); return ul; })()] : []);
    if (!(prof && !ok)) fold('Rule-based interpretation', ok ? [el('p', 'meta', a.rule || ''), ...(itp.length ? [(() => { const ul = el('ul'); itp.forEach(f => ul.append(el('li', null, f.label.replace(': band', '') + ': ' + f.value))); return ul; })()] : []), el('p', 'meta', 'An interpretation by fixed rules, not an observed fact, forecast or verdict.')] : [el('p', 'meta', 'No level is derived. ' + (a.insufficientReason === 'method' ? 'No defensible automated method exists for this category.' : 'The evidence is missing or too thin; missing data is never treated as low risk.'))]);
    fold('Sources and dates', [(() => { const ul = el('ul'); (a.sources || []).forEach(x => ul.append(el('li', null, [link(x.url, x.name), ' (' + x.publisher + (x.licence ? ', ' + x.licence : '') + ')']))); if (!(a.sources || []).length) ul.append(el('li', 'dim', 'No data source was used.')); return ul; })(),
      el('p', 'meta', 'Reference year' + ((a.referenceDates || []).length === 1 ? '' : 's') + ': ' + ((a.referenceDates || []).join(', ') || 'n/a') + '. Last successful input update: ' + (a.lastSuccessAt ? fmtUTC(a.lastSuccessAt) : 'n/a') + '.')]);
    fold('Limitations (' + (a.limitations || []).length + ')', [(() => { const ul = el('ul'); (a.limitations || []).forEach(t => ul.append(el('li', null, t))); return ul; })()]);
    const ctx = a.context || [];
    if (ctx.length) fold('Reported context, not used for the level (' + ctx.length + ')', [el('p', 'meta', 'Headlines are reports by publishers, not verified facts.'), (() => { const ul = el('ul'); ctx.forEach(c => ul.append(el('li', null, [link(c.url, c.headline), el('div', 'meta', c.publisher + (c.time ? ' · ' + (c.timeBasis || 'time') + ' ' + fmtUTC(c.time) : ' · time not provided'))]))); return ul; })()]);
    g.append(b);
  });
  $('#risk').replaceChildren(...top, g, ...(prof ? [legacySection(auto)] : [el('p', 'note', file ? 'Levels come only from the public datasets named in each card, by fixed rules documented in the README. Headlines and article counts never set a level. "Insufficient data" means the evidence is missing or too thin; it is not a finding of low risk. Observed facts and rule-based interpretation are listed separately.' : 'No assessment is shown until it has been generated from sourced data.')]));
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
  // Stage 9.2: every [n] is a button that opens the collapsed source list and moves to that entry (no URL change: the hash holds the selected country).
  const srcFold = { el: null };
  const showSrc = n => { const d = srcFold.el, li = d && document.getElementById('src-' + n); if (!d || !li) return; d.open = true; document.querySelectorAll('#brief .src-hl').forEach(x => x.classList.remove('src-hl')); li.classList.add('src-hl'); li.scrollIntoView({ block: 'center' }); li.focus({ preventScroll: true }); };
  const refBtn = n => { const b = el('button', 'refbtn', '[' + n + ']'); b.type = 'button'; b.setAttribute('aria-label', 'Source ' + n + ': show in the source list'); b.addEventListener('click', () => showSrc(n)); return b; };
  const withRefs = t => String(t).split(/(\[\d+\])/).map(p => /^\[\d+\]$/.test(p) ? refBtn(+p.slice(1, -1)) : p).filter(p => p !== '');
  const ref = n => el('span', 'meta', [' ', refBtn(n)]);
  const unavailable = (why) => [pill('bad'), el('p', 'dim', why)];
  const sec = (h, k, fill) => {
    const d = el('section', 'bsec', el('h3', null, h)), x = hand[k];
    if (x) d.append(pill(...KIND[x.kind] || KIND.analysis), el('span', 'meta', ' As of ' + x.asOf), el('p', null, x.text));
    else if (!auto) d.append(...unavailable('No sourced entry yet.'));
    else fill(d);
    g.append(d);
  };
  const rn = t => hand.why ? t : String(t).replace(/"Why it matters"/g, '"Media Coverage Patterns"');   // the generated notice and limitations name the section; the heading was renamed
  const lim = (auto && auto.limitations || []).map(rn);
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
      if (x.alsoReportedBy.length) { const al = el('div', 'meta', 'Also reported by: '); x.alsoReportedBy.forEach((n, i) => { const o = auto.sources.find(q => q.n === n); if (i) al.append(', '); if (o) al.append(o.publisher + ' '); al.append(refBtn(n)); }); li.append(al); }
      ul.append(li);
    });
    d.append(ul);
  });
  sec(hand.why ? 'Why it matters' : 'Media Coverage Patterns', 'why', d => {
    if (!auto.why) { d.append(...unavailable('Unavailable: ' + (auto.status === 'unavailable' ? 'there are no reports to apply the rules to.' : (lim.find(t => /analytical|No analytical rule/.test(t)) || 'not enough supporting reports.')))); return; }
    d.append(pill('ana'), el('span', 'meta', ' Keyword counts on headlines. Not verified events, a forecast, a risk score or causal analysis.'));
    const all = auto.sources || [], uniq = all.filter(x => !x.duplicateOf).length, rep = all.length - uniq;
    d.append(el('p', 'lim1', 'Counts come from keyword matching on headline wording; the articles were not read. This shows what the headlines are about, not what happened, why, or what comes next.'));
    d.append(el('p', 'lim1', 'Selection bias: the ' + uniq + ' headlines counted are the highest-ranked unique headlines, and the ranking adds points for these same topic keywords. That pushes the proportions up. They are not representative of all matching reports or of overall media coverage, and a keyword match is not confirmed substantive coverage (for example, "truce" or "war" in a trade headline counts as security wording).'));
    d.append(el('p', 'lim1', uniq + ' highest-ranked unique ' + (uniq === 1 ? 'headline' : 'headlines') + ' are counted' + ((auto.developments || []).length < uniq ? ' (Key developments shows the first ' + auto.developments.length + '; all ' + uniq + ' are in the source list)' : '') + (rep ? '. ' + rep + ' further source-list ' + (rep === 1 ? 'entry is' : 'entries are') + ' the same headline carried by another outlet; repeats are listed but not counted again, and they are not independent verification.' : '.')));
    const row = (label, n, den, what) => { const r = el('div', 'cov'), p = den ? Math.max(0, Math.min(100, Math.round(100 * n / den))) : 0, bar = el('span', 'cb', el('i')); bar.setAttribute('aria-hidden', 'true'); bar.firstChild.style.width = p + '%'; r.append(el('span', 'cl', label), el('span', 'cn', [el('b', null, String(n)), ' of ' + den + ' ' + what]), bar); return r; };
    const topics = [], more = [], rest = [];
    auto.why.forEach(x => {
      let m = /^(\d+) of the (\d+) listed reports? use (.+?) wording \(/.exec(x.text);
      if (m && /^topic:/.test(x.rule)) { topics.push(row(m[3].charAt(0).toUpperCase() + m[3].slice(1) + ' keywords', +m[1], +m[2], 'highest-ranked unique headlines')); return; }
      m = /^(\d+) listed reports? with topic keywords also names? (.+?) \[/.exec(x.text);
      if (m && x.rule === 'two-countries') { more.push(row('Also name ' + m[2], +m[1], uniq, 'highest-ranked unique headlines'), el('p', 'meta', 'A headline that names two countries does not show how they are connected.')); return; }
      m = /^(\d+) listed headlines? (?:was|were) carried by more than one outlet/.exec(x.text);
      if (m && x.rule === 'several-outlets') { more.push(row('Carried by several outlets', +m[1], uniq, 'highest-ranked unique headlines'), el('p', 'meta', 'The same headline appearing in several places is not independent verification.')); return; }
      rest.push(el('p', null, withRefs(x.text)));
    });
    if (topics.length) d.append(el('h4', 'cov-h', 'Topic keyword matches in the highest-ranked headlines'), el('p', 'meta', 'A headline can match several topics, so these counts overlap and do not add up to the total.'), ...topics);
    if (more.length) d.append(el('h4', 'cov-h', 'Other patterns'), ...more);
    if (rest.length) d.append(...rest);
    const fold = el('details', 'fold', el('summary', null, 'Rules, matched words and references'));
    const ul = el('ul'); auto.why.forEach(x => ul.append(el('li', null, [withRefs(x.text), el('div', 'meta', 'Rule: ' + x.rule)]))); fold.append(ul); d.append(fold);
  });
  const sd = el('section', 'bsec'), asrc = auto ? auto.sources : [], hsrc = hand.sources || [], nsrc = asrc.length + hsrc.length;
  if (nsrc) {
    const f = el('details', 'srcfold', el('summary', null, el('h3', null, 'Sources and references (' + nsrc + ')'))); srcFold.el = f;
    const dup = asrc.filter(x => x.duplicateOf).length;
    if (dup) f.append(el('p', 'meta', (asrc.length - dup) + ' unique headlines; ' + dup + ' entries are the same headline carried by another outlet. Numbers in square brackets elsewhere in the brief open the matching entry here.'));
    if (asrc.length) {
      const ul = el('ul');
      asrc.forEach(x => ul.append(Object.assign(el('li', null, [el('span', 'meta', '[' + x.n + '] '), link(x.url, x.title), ` (${x.publisher}${x.time ? ', ' + (x.timeBasis || 'time') + ' ' + fmtUTC(x.time) : ', time not provided'}${x.via ? ', via ' + x.via : ''}${x.sourceLabel ? ', outlet: ' + ({ established: 'established', state: 'state-owned or government-run', unassessed: 'not assessed' })[x.sourceLabel] : ''}${x.duplicateOf ? ', same headline as [' + x.duplicateOf + ']' : ''})`]), { id: 'src-' + x.n, tabIndex: -1 })));
      f.append(ul);
    }
    if (hsrc.length) { const ul = el('ul'); hsrc.forEach(x => ul.append(el('li', null, [link(x.url, x.title), ` (${x.publisher}, accessed ${x.accessed})`]))); f.append(ul); }
    sd.append(f);
  } else sd.append(el('h3', null, 'Sources'), pill('bad'), el('p', 'dim', 'No sources listed. Every statement needs one.'));
  g.append(sd);
  const foot = [];
  if (lim.length) { const ul = el('ul'); lim.forEach(t => ul.append(el('li', null, t))); foot.push(el('div', 'state', [el('b', null, 'Limitations. '), ul])); }
  if (auto) foot.push(el('p', 'note', rn(auto.notice || 'Headlines are reports, not verified facts.')));
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
{ const sk = $('.skip'); if (sk) sk.addEventListener('click', e => { e.preventDefault(); const t = $('#country'); if (t) t.focus(); }); }   // skip link: moves focus to the country panel without touching the URL hash (the hash holds the selected country)
$('#q').addEventListener('change', e => go(e.target.value));
$('#q').addEventListener('keydown', e => { if (e.key === 'Enter') go(e.target.value); });
$('#refresh').onclick = async () => { const b = $('#refresh'); b.disabled = true; b.textContent = 'Reloading...'; await loadAll(); b.disabled = false; b.textContent = 'Reload data'; };
window.addEventListener('hashchange', () => { const h = location.hash.slice(1).toUpperCase(); if (C[h] && h !== cur) select(h); });
fillSearch(); select(cur); loadAll(); initGlobe();
})();
