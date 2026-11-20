#!/usr/bin/env node
// Fetches the extra public datasets the risk assessments need and writes data/cache/risk-inputs.json. Free, key-free sources only:
//   - UCDP/PRIO Armed Conflict Dataset (one static CSV zip from ucdp.uu.se, CC BY 4.0). The UCDP API is NOT used (it needs an emailed access token).
//   - World Bank API (api.worldbank.org): WGI "Political Stability and Absence of Violence/Terrorism" (PV.EST) and unemployment (SL.UEM.TOTL.ZS), per country.
// Growth and inflation come from the existing indicators.json (fetched by the existing workflow), so they are not requested again.
//   node scripts/fetch-risk-inputs.mjs --fetch      update the cache (default)
//   node scripts/fetch-risk-inputs.mjs --verify     request everything once, show what was found, write nothing
//   --force                                          ignore the "recently fetched" shortcuts
// To avoid pointless requests: World Bank series are re-requested only when older than 7 days; the UCDP file only when older than 30 days (or never fetched).
// A failed request keeps the earlier value (with its original fetch time) and records the error, so the assessment can show it as stale.
// Exit codes: 0 ok (or nothing needed), 2 everything attempted failed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createClient, FetchError } from './http-lib.mjs';
import { readFirstZipEntry } from './zip-lib.mjs';
import { parseUcdp, summariseUcdp } from './risk-lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = n => { const a = process.argv.find(x => x.startsWith('--' + n + '=')); return a ? a.slice(n.length + 3) : null; };
const VERIFY = process.argv.includes('--verify'), FORCE = process.argv.includes('--force');
const DIR = path.resolve(arg('dir') || path.join(ROOT, 'data', 'cache')), FILE = path.join(DIR, 'risk-inputs.json');
const NOW = process.env.RISK_NOW ? Date.parse(process.env.RISK_NOW) : Date.now();
const num = (v, d) => (Number.isFinite(Number(v)) && v !== undefined && v !== '' ? Number(v) : d);
const { RISK: R } = await import(pathToFileURL(path.join(ROOT, 'data', 'risk-methodology.mjs')).href);
const WB = (process.env.RISK_WB_BASE || 'https://api.worldbank.org/v2').replace(/\/$/, '');
const HOSTS = (process.env.RISK_HOSTS || 'api.worldbank.org,ucdp.uu.se').split(',');
const UA = `GlobalRiskMonitor/3 (personal non-commercial dashboard; ${process.env.GITHUB_REPOSITORY ? 'https://github.com/' + process.env.GITHUB_REPOSITORY : 'contact via the project repository'})`;
const client = createClient({ ua: UA, timeoutMs: num(process.env.RISK_TIMEOUT_MS, 60000), maxTries: num(process.env.RSS_MAX_TRIES, 3), retryBaseMs: num(process.env.RSS_RETRY_BASE_MS, 5000), allowHttp: process.env.RSS_ALLOW_HTTP === '1' });
const sleep = ms => new Promise(r => setTimeout(r, ms)), iso = t => new Date(t).toISOString(), GAP = num(process.env.RISK_GAP_MS, 700);
const lines = [], say = m => { console.log(m); lines.push(m); };
const writeSummary = md => { if (process.env.GITHUB_STEP_SUMMARY) { try { fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n'); } catch {} } };
const short = m => String(m).replace(/\s+/g, ' ').slice(0, 200);
const ageDays = s => s && !isNaN(Date.parse(s)) ? (NOW - Date.parse(s)) / 864e5 : Infinity;

let prev = {}; try { const j = JSON.parse(fs.readFileSync(FILE, 'utf8')); if (j && j.schema === 1) prev = j; } catch {}

// ---------- World Bank (same approach as scripts/fetch-data.mjs: one country at a time, never substitute another country) ----------
const wbErr = j => Array.isArray(j) && j[0] && Array.isArray(j[0].message) ? short((j[0].message[0] || {}).value || 'The World Bank reported an error.') : null;
async function wbJson(url) {
  const r = await client.request(url, { hosts: HOSTS, who: 'World Bank', accept: 'application/json', maxBytes: 2 * 1048576 }, m => say(m));
  try { return JSON.parse(r.text); } catch { throw new FetchError('World Bank sent an unreadable reply'); }
}
async function wbIndicator(code, ind) {
  const j = await wbJson(`${WB}/country/${code}/indicator/${ind}?format=json&mrnev=1`), m = wbErr(j);
  if (m) {
    const c = await wbJson(`${WB}/country/${code}?format=json`);
    if (wbErr(c)) return { status: 'unsupported', error: `The World Bank API has no country with code ${code} (${wbErr(c)}).` };
    throw new FetchError('World Bank error: ' + m);
  }
  const rows = Array.isArray(j) && Array.isArray(j[1]) ? j[1] : [];
  if (!rows.length || rows[0].value == null) return { status: 'none', error: null, sourceUpdated: j[0] && j[0].lastupdated || null };
  const row = rows[0], id = row.countryiso3code || (row.country && row.country.id), value = Number(row.value);
  if (id && id !== code) throw new FetchError(`Refused: the reply was for country ${id}, not ${code}.`);
  if (!Number.isFinite(value)) throw new FetchError('the reply contained a non-numeric value');
  return { status: 'ok', error: null, value, year: String(row.date), sourceUpdated: j[0] && j[0].lastupdated || null };
}
async function runWb(series, key, code, label, results) {
  const out = {}, old = prev[key] || {};
  for (const [id, c] of Object.entries(R.countries)) {
    const p = old[id];
    if (!FORCE && p && (p.status === 'ok' || p.status === 'unsupported' || p.status === 'none') && ageDays(p.fetchedAt) < 7) { out[id] = p; results.push({ label: `${label} ${id}`, state: 'skipped' }); continue; }
    try { const x = await wbIndicator(c.wb, code), t = iso(NOW); out[id] = { ...x, fetchedAt: t, checkedAt: t }; say(`  ${label} ${id}: ${x.status}${x.status === 'ok' ? ` ${x.value} (${x.year})` : x.error ? ' - ' + x.error : ''}`); results.push({ label: `${label} ${id}`, state: 'ok' }); }
    catch (e) { out[id] = { status: 'error', error: short(e.message), value: p ? p.value ?? null : null, year: p ? p.year ?? null : null, fetchedAt: p ? p.fetchedAt || null : null, checkedAt: iso(NOW) }; say(`  ${label} ${id}: FAILED - ${short(e.message)}${p && p.value != null ? ' (earlier value kept)' : ''}`); results.push({ label: `${label} ${id}`, state: 'failed' }); }
    await sleep(GAP);
  }
  return out;
}

// ---------- UCDP ----------
function ucdpCandidates() {
  const top = Math.max(R.sources.ucdp.latestKnownVersionYear, new Date(NOW).getUTCFullYear() - 2000 + 1), list = [];
  for (let y = top; y >= R.sources.ucdp.latestKnownVersionYear; y--) list.push({ version: y + '.1', url: (process.env.RISK_UCDP_TEMPLATE || R.sources.ucdp.urlTemplate).replace('{yy}', String(y)) });
  return list;
}
async function runUcdp(results) {
  const p = prev.ucdp;
  if (!FORCE && p && p.status === 'ok' && ageDays(p.fetchedAt) < 30) { say('  UCDP: fetched ' + Math.round(ageDays(p.fetchedAt)) + ' days ago, not requested again'); results.push({ label: 'UCDP', state: 'skipped' }); return p; }
  let lastErr = 'no candidate address worked';
  for (const c of ucdpCandidates()) {
    try {
      const r = await client.request(c.url, { hosts: HOSTS, who: 'UCDP', binary: true, accept: 'application/zip,*/*;q=0.5', maxBytes: 20 * 1048576 }, m => say(m));
      const parsed = parseUcdp(readFirstZipEntry(r.buf).toString('utf8')), conflicts = summariseUcdp(parsed, R.countries), t = iso(NOW);
      say(`  UCDP ${c.version}: newest year ${parsed.latestYear}, ${parsed.rows.filter(x => x.year === parsed.latestYear).length} conflicts that year; per country: ` + Object.entries(conflicts).map(([k, v]) => k + ' ' + v.length).join(', '));
      results.push({ label: 'UCDP', state: 'ok' });
      return { status: 'ok', error: null, version: c.version, sourceUrl: c.url, latestYear: parsed.latestYear, conflicts, fetchedAt: t, checkedAt: t };
    } catch (e) {
      if (e.httpStatus === 404) { say(`  UCDP ${c.version}: not published yet (HTTP 404)`); continue; }   // a newer version that does not exist yet is normal
      lastErr = short(e.message); say(`  UCDP ${c.version}: FAILED - ${lastErr}`); break;
    }
  }
  results.push({ label: 'UCDP', state: 'failed' });
  return { ...(p || {}), status: 'error', error: lastErr, checkedAt: iso(NOW), ...(p ? {} : { latestYear: null, conflicts: null, fetchedAt: null }) };
}

const results = [];
say(VERIFY ? 'VERIFY MODE: every source is requested once; nothing is written.\n' : 'Fetching risk inputs (recent data is not requested again).\n');
const ucdp = await runUcdp(results);
say('World Bank WGI (political stability):'); const wgi = await runWb('wgi', 'wgi', R.sources.wgi.code, 'WGI', results);
say('World Bank unemployment:'); const unemployment = await runWb('unemployment', 'unemployment', R.sources.unemployment.code, 'Unemployment', results);
const asked = results.filter(r => r.state !== 'skipped'), failed = results.filter(r => r.state === 'failed'), okN = results.filter(r => r.state === 'ok').length;
const lastSuccessAt = [ucdp.fetchedAt, ...Object.values(wgi).map(x => x.fetchedAt), ...Object.values(unemployment).map(x => x.fetchedAt)].filter(Boolean).sort().pop() || null;
const out = { schema: 1, generatedAt: iso(NOW), checkedAt: iso(NOW), lastSuccessAt, sources: { ucdp: R.sources.ucdp.url, worldBank: 'https://data.worldbank.org/' }, ucdp, wgi, unemployment };
const md = ['## Risk inputs', '', `Requests made: ${asked.length}; skipped as recent: ${results.length - asked.length}; failed: ${failed.length}.`, ...failed.map(f => `- FAILED: ${f.label}`)];
say(`\nSummary: ${okN} fetched, ${results.length - asked.length} skipped as recent, ${failed.length} failed.`);
if (VERIFY) { say('VERIFY MODE: nothing was written.'); writeSummary(md.join('\n') + '\n\nVerify mode: nothing written.'); process.exit(asked.length && failed.length === asked.length ? 2 : 0); }
fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(FILE + '.tmp', JSON.stringify(out, null, 1)); fs.renameSync(FILE + '.tmp', FILE);
say('Wrote ' + path.relative(ROOT, FILE) + '.'); writeSummary(md.join('\n'));
process.exit(asked.length && failed.length === asked.length ? 2 : 0);
