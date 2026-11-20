#!/usr/bin/env node
// Fetches news (GDELT DOC 2.0) and indicators (World Bank) and writes JSON cache files for the website.
// No dependencies and no API keys. Needs Node 18+ (built-in fetch). Run it by hand or from GitHub Actions.
//
//   node scripts/fetch-data.mjs                 fetch news and indicators
//   node scripts/fetch-data.mjs --only=news     news only        (--only=indicators: indicators only)
//   node scripts/fetch-data.mjs --verify        check which World Bank country codes exist (writes nothing)
//   node scripts/fetch-data.mjs --out=some/dir  write somewhere other than data/cache
//
// Rules this script follows:
//  * It never invents data. A failed fetch keeps the previous successful data (if any) and records the error.
//  * "fetchedAt" always means "last SUCCESSFUL fetch". "checkedAt" means "last attempt".
//  * Exit code 2 means every request of a dataset failed, so the Action run is marked as failed and you notice.

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = n => (process.argv.find(a => a.startsWith('--' + n + '=')) || '').split('=')[1];
const flag = n => process.argv.includes('--' + n);
const ONLY = arg('only') || 'all';
const OUT = path.resolve(arg('out') || path.join(ROOT, 'data', 'cache'));
const GDELT = process.env.GDELT_BASE || 'https://api.gdeltproject.org/api/v2/doc/doc';
const WB = process.env.WB_BASE || 'https://api.worldbank.org/v2';
const TIMESPAN = process.env.GDELT_TIMESPAN || '7d';
const GDELT_GAP_MS = Number(process.env.GDELT_DELAY_MS ?? 6000);   // GDELT asks for at most one request per 5 seconds
const RETRY_WAIT_MS = Number(process.env.RETRY_WAIT_MS ?? 20000);
const WB_GAP_MS = Number(process.env.WB_DELAY_MS ?? 250);
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS ?? 30000);
const MAX_TRIES = 3, MAX_ARTICLES = 20;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const nowIso = () => new Date().toISOString();
const log = (...a) => console.log(...a);

// ---- country list: read from data/countries.js so there is one place to edit ----
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'data', 'countries.js'), 'utf8'), sandbox);
const COUNTRIES = sandbox.window.COUNTRIES, INDICATORS = sandbox.window.INDICATORS;
const IDS = Object.keys(COUNTRIES);

// ---- helpers ----
class FetchError extends Error { constructor(msg, retryable = false) { super(msg); this.retryable = retryable; } }
async function getText(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { 'User-Agent': 'global-risk-monitor/3 (static-site data cache)', Accept: 'application/json' } });
    return { status: r.status, text: await r.text() };
  } catch (e) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') throw new FetchError('The request timed out after ' + TIMEOUT_MS / 1000 + ' s.', true);
    throw new FetchError('Network error: ' + (e.cause && e.cause.code ? e.cause.code : e.message), true);
  }
}
async function withRetry(fn, what) {
  let last;
  for (let i = 1; i <= MAX_TRIES; i++) {
    try { return await fn(); }
    catch (e) { last = e; if (!e.retryable || i === MAX_TRIES) break; log(`  ${what}: ${e.message} Retrying in ${RETRY_WAIT_MS / 1000}s (attempt ${i + 1} of ${MAX_TRIES}).`); await sleep(RETRY_WAIT_MS * i); }
  }
  throw last;
}
function readPrev(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return null; } }
function writeAtomic(file, obj) { fs.mkdirSync(path.dirname(file), { recursive: true }); const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n'); fs.renameSync(tmp, file); }
const short = s => String(s).replace(/\s+/g, ' ').trim().slice(0, 200);
const latest = list => list.filter(Boolean).sort().pop() || null;

// ================= NEWS (GDELT DOC 2.0) =================
function cleanArticles(raw) {
  const seenUrl = new Set(), seenTitle = new Set(), out = [];
  for (const a of raw) {
    if (!a || typeof a.url !== 'string' || !/^https?:\/\//i.test(a.url) || typeof a.title !== 'string') continue;
    const title = a.title.replace(/\s+/g, ' ').trim(), key = title.toLowerCase();
    if (!title || seenUrl.has(a.url) || seenTitle.has(key)) continue;
    seenUrl.add(a.url); seenTitle.add(key);
    out.push({ title, url: a.url, domain: a.domain || null, seendate: a.seendate || null, language: a.language || null, sourcecountry: a.sourcecountry || null });
    if (out.length >= MAX_ARTICLES) break;
  }
  return out;
}
async function gdeltArticles(query) {
  const url = GDELT + '?' + new URLSearchParams({ query: query + ' sourcelang:english', mode: 'artlist', maxrecords: '75', format: 'json', sort: 'datedesc', timespan: TIMESPAN });
  return withRetry(async () => {
    const r = await getText(url), body = r.text.trim();
    if (r.status === 429 || /limit requests/i.test(body)) throw new FetchError('GDELT is rate limiting requests.', true);
    if (r.status >= 500) throw new FetchError('GDELT returned HTTP ' + r.status + '.', true);
    if (r.status < 200 || r.status >= 300) throw new FetchError('GDELT returned HTTP ' + r.status + '.');
    if (!body) return [];                                   // GDELT sends an empty body when nothing matches: a valid "no results"
    let j; try { j = JSON.parse(body); } catch (e) { throw new FetchError('GDELT sent a reply that is not valid JSON: ' + short(body).slice(0, 120)); }
    return cleanArticles(Array.isArray(j.articles) ? j.articles : []);
  }, 'GDELT');
}
async function runNews() {
  const file = path.join(OUT, 'news.json'), prev = readPrev(file), t = nowIso(), countries = {};
  let ok = 0;
  for (let i = 0; i < IDS.length; i++) {
    const k = IDS[i], q = COUNTRIES[k].gdelt, p = prev && prev.countries && prev.countries[k];
    if (i) await sleep(GDELT_GAP_MS);
    try {
      const articles = await gdeltArticles(q);
      countries[k] = { query: q, status: 'ok', error: null, fetchedAt: nowIso(), checkedAt: nowIso(), articles }; ok++;
      log(`news ${k}: OK, ${articles.length} articles`);
    } catch (e) {
      const keep = p && Array.isArray(p.articles) && p.articles.length;
      countries[k] = { query: keep ? p.query : q, status: 'error', error: short(e.message), fetchedAt: p ? p.fetchedAt || null : null, checkedAt: nowIso(), articles: keep ? p.articles : [] };
      log(`news ${k}: FAILED (${short(e.message)}); ${keep ? 'kept ' + p.articles.length + ' earlier articles' : 'no earlier articles to keep'}`);
    }
  }
  writeAtomic(file, { schema: 2, source: 'GDELT DOC 2.0 API', sourceUrl: 'https://www.gdeltproject.org/', timespan: TIMESPAN, checkedAt: t,
    lastSuccessAt: latest(Object.values(countries).map(c => c.fetchedAt)), countries });
  return { name: 'news', ok, total: IDS.length, rows: IDS.map(k => `${k}: ${countries[k].status}${countries[k].status === 'ok' ? ' (' + countries[k].articles.length + ' articles)' : ' - ' + countries[k].error}`) };
}

// ================= INDICATORS (World Bank) =================
const wbErr = j => Array.isArray(j) && j[0] && Array.isArray(j[0].message) ? short((j[0].message[0] || {}).value || 'The World Bank reported an error.') : null;
async function wbJson(url) {
  return withRetry(async () => {
    const r = await getText(url);
    if (r.status === 429 || r.status >= 500) throw new FetchError('World Bank returned HTTP ' + r.status + '.', true);
    let j; try { j = JSON.parse(r.text); } catch (e) { throw new FetchError(r.status >= 400 ? 'World Bank returned HTTP ' + r.status + '.' : 'World Bank sent an unreadable reply.'); }
    return { status: r.status, j };
  }, 'World Bank');
}
async function countryKnown(code) {            // does the World Bank API recognise this country code at all?
  const { j } = await wbJson(`${WB}/country/${code}?format=json`);
  const m = wbErr(j); if (m) return { known: false, message: m };
  const row = Array.isArray(j) && j[1] && j[1][0];
  return row ? { known: true, name: row.name, region: row.region && row.region.value } : { known: false, message: 'No country record returned.' };
}
async function wbIndicator(code, ind) {
  const { j } = await wbJson(`${WB}/country/${code}/indicator/${ind}?format=json&mrnev=1`);   // mrnev=1: most recent non-empty value
  const m = wbErr(j);
  if (m) { const c = await countryKnown(code); return c.known ? { status: 'error', error: 'World Bank error: ' + m } : { status: 'unsupported', error: `The World Bank API has no country with code ${code} (${c.message}).` }; }
  const rows = Array.isArray(j) && Array.isArray(j[1]) ? j[1] : [];
  if (!rows.length || rows[0].value == null) return { status: 'none', error: null, sourceUpdated: j[0] && j[0].lastupdated || null };
  const row = rows[0], id = row.countryiso3code || (row.country && row.country.id);
  if (id && id !== code) return { status: 'error', error: `Refused: the reply was for country ${id}, not ${code}.` };   // never substitute another country
  const value = Number(row.value);
  if (!Number.isFinite(value)) return { status: 'error', error: 'The reply contained a non-numeric value.' };
  return { status: 'ok', error: null, value, year: String(row.date), sourceUpdated: j[0] && j[0].lastupdated || null };
}
async function runIndicators() {
  const file = path.join(OUT, 'indicators.json'), prev = readPrev(file), t = nowIso(), countries = {};
  let okCountries = 0, first = true;
  for (const k of IDS) {
    const code = COUNTRIES[k].wb, pc = prev && prev.countries && prev.countries[k], ind = {};
    for (const i of INDICATORS) {
      const pi = pc && pc.indicators && pc.indicators[i.code];
      if (!first) await sleep(WB_GAP_MS); first = false;
      try {
        const r = await wbIndicator(code, i.code), n = nowIso();
        if (r.status === 'error') throw new FetchError(r.error);
        ind[i.code] = { status: r.status, error: r.error, value: r.value ?? null, year: r.year ?? null, fetchedAt: n, checkedAt: n, sourceUpdated: r.sourceUpdated || null };
      } catch (e) {   // keep the previous good value, labelled as a failed refresh
        ind[i.code] = { status: 'error', error: short(e.message), value: pi ? pi.value ?? null : null, year: pi ? pi.year ?? null : null, fetchedAt: pi ? pi.fetchedAt || null : null, checkedAt: nowIso(), sourceUpdated: pi ? pi.sourceUpdated || null : null };
      }
    }
    const list = Object.values(ind), bad = list.filter(x => x.status === 'error'), uns = list.filter(x => x.status === 'unsupported');
    const status = uns.length === list.length ? 'unsupported' : bad.length === list.length ? 'error' : bad.length ? 'partial' : 'ok';
    if (status === 'ok') okCountries++;
    const err = status === 'unsupported' ? uns[0].error : bad.length ? bad[0].error : null;
    countries[k] = { wbCode: code, status, error: err, fetchedAt: latest(list.map(x => x.fetchedAt)), checkedAt: nowIso(), indicators: ind };
    log(`indicators ${k} (${code}): ${status}${err ? ' - ' + err : ''}`);
  }
  writeAtomic(file, { schema: 2, source: 'World Bank Open Data API', sourceUrl: 'https://data.worldbank.org/', checkedAt: t,
    lastSuccessAt: latest(Object.values(countries).map(c => c.fetchedAt)), countries });
  const usable = Object.values(countries).filter(c => c.status === 'ok' || c.status === 'partial' || c.status === 'unsupported').length;
  return { name: 'indicators', ok: usable, total: IDS.length, rows: IDS.map(k => `${k} (${COUNTRIES[k].wb}): ${countries[k].status}${countries[k].error ? ' - ' + countries[k].error : ''}`) };
}

// ================= verify country codes =================
async function verify() {
  const rows = [];
  for (const k of IDS) {
    const code = COUNTRIES[k].wb;
    try { const c = await countryKnown(code); rows.push(c.known ? `${k} (${code}): recognised as "${c.name}" (${c.region || 'no region'})` : `${k} (${code}): NOT recognised by the World Bank API - ${c.message}`); }
    catch (e) { rows.push(`${k} (${code}): could not check - ${short(e.message)}`); }
    await sleep(WB_GAP_MS);
  }
  return { name: 'World Bank country-code check', rows };
}

// ================= main =================
const results = [];
try {
  if (flag('verify')) results.push(await verify());
  else {
    if (ONLY === 'all' || ONLY === 'news') results.push(await runNews());
    if (ONLY === 'all' || ONLY === 'indicators') results.push(await runIndicators());
  }
} catch (e) { console.error('Unexpected error:', e); process.exit(1); }

const lines = ['## Global Risk Monitor data refresh', `Run time (UTC): ${nowIso()}`];
for (const r of results) { lines.push('', `### ${r.name}`, ...(r.total != null ? [`${r.ok} of ${r.total} succeeded`] : []), ...r.rows.map(x => '- ' + x)); }
log('\n' + lines.join('\n'));
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
const allFailed = results.some(r => r.total != null && r.ok === 0);
if (allFailed) { console.error('\nEvery request for at least one dataset failed. Marking this run as failed. Existing cached data was kept.'); process.exit(2); }
