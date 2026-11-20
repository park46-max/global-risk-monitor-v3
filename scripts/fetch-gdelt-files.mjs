#!/usr/bin/env node
// Reads GDELT's open 15-minute data files (GKG 2.0) and writes data/cache/news-gdelt.json: articles whose HEADLINE names one of the five countries.
// This is a different route to GDELT than the DOC search API used by fetch-data.mjs. It downloads a few static files instead of sending search queries.
// No dependencies, no API keys. Node 18+.
//
//   node scripts/fetch-gdelt-files.mjs --verify     download the latest file, check its structure, show the numbers, write nothing
//   node scripts/fetch-gdelt-files.mjs --fetch      update the cache (default mode)
//   node scripts/fetch-gdelt-files.mjs --out=dir    write the cache somewhere else
//
// Exit codes: 0 = worked, 2 = failed (verify: the files could not be read or contain no headlines).
//
// Terms (read 2026-11-20 at https://www.gdeltproject.org/about.html): GDELT datasets are "available for unlimited and unrestricted use ... without fee",
// may be redistributed, and "any use or redistribution of the data must include a citation to the GDELT Project and a link to this website".
// The dashboard shows that citation and link. GDELT's terms cover GDELT's datasets; the headlines inside them were written by the publishers, so each
// article is shown with its publisher's domain and links straight to the publisher's page. Only headline, domain, link and dates are stored.
//
// What is assumed and NOT yet verified against the real files (verify mode checks it): the file location (lastupdate.txt and
// <timestamp>.gkg.csv.zip under /gdeltv2/), the 27-column GKG 2.1 layout, and a <PAGE_TITLE> tag in the last ("extras") column.
// Nothing is invented if a title is missing: the article is simply not shown.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildMatchers, matchCountries, mergeItems, safeUrl, clean } from './rss-lib.mjs';
import { createClient } from './http-lib.mjs';
import { readFirstZipEntry } from './zip-lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = n => (process.argv.find(a => a.startsWith('--' + n + '=')) || '').split('=')[1];
const flag = n => process.argv.includes('--' + n);
const VERIFY = flag('verify');
const OUT = path.resolve(arg('out') || path.join(ROOT, 'data', 'cache'));
const FILE = path.join(OUT, 'news-gdelt.json');
const num = (v, d) => (v === undefined || v === '' ? d : Number(v));
const NOW = process.env.RSS_NOW ? Date.parse(process.env.RSS_NOW) : Date.now();
const BASE = (process.env.GDELT_FILES_BASE || 'https://data.gdeltproject.org/gdeltv2/').replace(/\/?$/, '/');
const HOSTS = (process.env.GDELT_FILES_HOSTS || 'data.gdeltproject.org').split(',');
const BACKFILL = num(process.env.GKG_BACKFILL, 12);              // newest N 15-minute files considered per run (12 = 3 hours, matches a 3-hour schedule)
const GAP_MS = num(process.env.GKG_GAP_MS, 1500);               // pause between file downloads
const BUDGET_MS = num(process.env.GKG_BUDGET_MS, 7 * 60 * 1000);
const RETENTION_DAYS = 3, PER_COUNTRY = 40;
const { COUNTRY_TERMS } = await import(pathToFileURL(process.env.RSS_CONFIG ? path.resolve(process.env.RSS_CONFIG) : path.join(ROOT, 'data', 'rss-sources.mjs')).href);
const matchers = buildMatchers(COUNTRY_TERMS);
const UA = `GlobalRiskMonitor/3 (personal non-commercial dashboard; ${process.env.GITHUB_REPOSITORY ? 'https://github.com/' + process.env.GITHUB_REPOSITORY : 'contact via the project repository'})`;
const client = createClient({ ua: UA, timeoutMs: num(process.env.GKG_TIMEOUT_MS, 60000), maxTries: num(process.env.RSS_MAX_TRIES, 3), retryBaseMs: num(process.env.RSS_RETRY_BASE_MS, 5000), allowHttp: process.env.RSS_ALLOW_HTTP === '1' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const iso = t => new Date(t).toISOString();
const say = l => console.log(l);
const lines = [];
const writeSummary = () => { if (process.env.GITHUB_STEP_SUMMARY) { try { fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n'); } catch {} } };

// ---- timestamps: GDELT names files YYYYMMDDHHMMSS (UTC), one every 15 minutes ----
const stampToMs = s => /^\d{14}$/.test(s) ? Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10), +s.slice(10, 12), +s.slice(12, 14)) : NaN;
const msToStamp = ms => new Date(ms).toISOString().replace(/[-:T]/g, '').slice(0, 14);
// A date from the file is accepted only if it is a real time, after 2000 and not more than 1 hour in the future.
const stampToIso = s => { const t = stampToMs(String(s || '').trim()); return isNaN(t) || t > NOW + 3600e3 || t < Date.UTC(2000, 0, 1) || msToStamp(t) !== String(s).trim() ? null : iso(t); };

// ---- GKG 2.1 parsing. Columns (0-based): 1 DATE, 3 source name, 4 document URL, 26 extras XML ----
function parseGkg(text) {
  const rows = [], st = { lines: 0, shortLines: 0, titled: 0, undatedPrecise: 0 };
  for (const line of text.split('\n')) {
    if (!line) continue;
    st.lines++;
    const c = line.split('\t');
    if (c.length < 27) { st.shortLines++; continue; }
    const tm = /<PAGE_TITLE>([\s\S]*?)<\/PAGE_TITLE>/.exec(c[26]);
    const title = tm ? clean(tm[1]) : '';
    if (title) st.titled++;
    const pm = /<PAGE_PRECISEPUBTIMESTAMP>(\d{14})<\/PAGE_PRECISEPUBTIMESTAMP>/.exec(c[26]);
    rows.push({ title, url: c[4], source: c[3], seen: c[1], precise: pm ? pm[1] : null });
  }
  return { rows, st };
}
function gkgToItems(rows, matchers, feedId) {
  const items = [];
  for (const r of rows) {
    if (!r.title) continue;
    const u = safeUrl(r.url); if (!u) continue;
    const matches = matchCountries(matchers, r.title, '');
    if (!Object.keys(matches).length) continue;
    const domain = /^[a-z0-9][a-z0-9.-]*$/i.test(r.source || '') ? r.source.toLowerCase() : u.hostname.toLowerCase();
    items.push({ title: r.title, url: u.href, publisher: domain, publisherId: 'gdelt', via: 'GDELT', feedId, published: stampToIso(r.precise), seenByGdelt: stampToIso(r.seen), matches });
  }
  return items;
}

async function getLatestStamp(log) {
  const r = await client.request(BASE + 'lastupdate.txt', { hosts: HOSTS, who: 'GDELT', accept: 'text/plain,*/*;q=0.5', maxBytes: 65536 }, log);
  const m = /(\d{14})\.gkg\.csv\.zip/i.exec(r.text || '');
  if (!m) throw new Error('lastupdate.txt has no GKG file entry (the file layout may have changed)');
  return m[1];
}
async function getGkg(stamp, log) {
  const r = await client.request(`${BASE}${stamp}.gkg.csv.zip`, { hosts: HOSTS, who: 'GDELT', binary: true, accept: 'application/zip,*/*;q=0.5', maxBytes: 80 * 1048576 }, log);
  let raw; try { raw = readFirstZipEntry(r.buf); } catch (e) { throw new Error('could not read the ZIP: ' + e.message); }
  return { bytes: r.buf.length, ...parseGkg(raw.toString('utf8')), unzipped: raw.length };
}

// ======================= VERIFY =======================
if (VERIFY) {
  say('VERIFY MODE: nothing is written. It downloads the newest GKG file and checks its structure. It does not decide whether using GDELT data is permitted for you.\n');
  lines.push('## GDELT file verification', '');
  try {
    const stamp = await getLatestStamp(say), age = Math.round((NOW - stampToMs(stamp)) / 60000);
    say(`lastupdate.txt: newest GKG file ${stamp} (${age} minutes old)`);
    const g = await getGkg(stamp, say), items = gkgToItems(g.rows, matchers, 'gdelt-gkg');
    const pct = x => g.st.lines ? (100 * x / g.st.lines).toFixed(1) + '%' : 'n/a';
    const per = Object.keys(COUNTRY_TERMS).map(id => id + ' ' + items.filter(i => i.matches[id]).length).join(', ');
    say(`file: ${(g.bytes / 1048576).toFixed(1)} MB zipped, ${(g.unzipped / 1048576).toFixed(1)} MB unzipped, ${g.st.lines} lines, ${g.st.shortLines} with fewer than 27 columns`);
    say(`headlines (PAGE_TITLE) present: ${g.st.titled} (${pct(g.st.titled)}); precise publication time present: ${g.rows.filter(r => r.precise).length}`);
    say(`articles whose headline names a monitored country: ${items.length}  (${per})`);
    items.slice(0, 3).forEach(i => say(`    sample: "${i.title}" | ${i.publisher} | ${i.published || 'no publication time'} | ${Object.keys(i.matches).join('/')}`));
    lines.push(`Newest file ${stamp} (${age} min old). ${g.st.lines} lines, headlines present ${g.st.titled} (${pct(g.st.titled)}), matches: ${per}.`);
    if (g.st.lines === 0 || g.st.shortLines === g.st.lines) throw new Error('the file does not have the expected 27-column layout');
    if (!g.st.titled) throw new Error('no <PAGE_TITLE> found in any record: this pipeline cannot show headlines from these files');
    say('\nRESULT: the GDELT file route works and contains headlines.'); lines.push('', '**The GDELT file route works and contains headlines.**'); writeSummary(); process.exit(0);
  } catch (e) { say('RESULT: NOT verified: ' + e.message); lines.push('**NOT verified:** ' + e.message); writeSummary(); process.exit(2); }
}

// ======================= FETCH =======================
let prev = null;
try { const j = JSON.parse(fs.readFileSync(FILE, 'utf8')); if (j && j.schema === 1) prev = j; } catch {}
const rec = { id: 'gdelt-gkg', publisherId: 'gdelt', publisher: 'GDELT Project (open data files)', label: 'GKG 2.0 files, every 15 minutes', url: BASE, status: 'error', checkedAt: iso(NOW),
  lastSuccessAt: (prev && prev.feeds && prev.feeds['gdelt-gkg'] && prev.feeds['gdelt-gkg'].lastSuccessAt) || null, error: null, latestFile: (prev && prev.feeds && prev.feeds['gdelt-gkg'] && prev.feeds['gdelt-gkg'].latestFile) || null };
let items = ((prev && prev.items) || []), files = { ...((prev && prev.files) || {}) };
let ok = 0, tried = 0, failed = 0, added = 0, dupes = 0, lastErr = '';
lines.push('## GDELT file fetch', '', '| File | Result |', '|---|---|');
try {
  const latest = await getLatestStamp(say), latestMs = stampToMs(latest);
  rec.latestFile = latest;
  const cands = [];
  for (let k = BACKFILL - 1; k >= 0; k--) { const s = msToStamp(latestMs - k * 15 * 60000); if (files[s] !== 'ok' && !(files[s] === 'missing' && NOW - stampToMs(s) > 3600e3)) cands.push(s); }
  say(`newest file ${latest}; ${cands.length} of the last ${BACKFILL} files still to read`);
  const t0 = Date.now();
  for (const s of cands) {
    if (Date.now() - t0 > BUDGET_MS) { say(`time budget reached, ${cands.length - tried} file(s) left for the next run`); break; }
    if (tried) await sleep(GAP_MS + Math.random() * 500);
    tried++;
    try {
      const g = await getGkg(s, say);
      if (g.st.lines && g.st.shortLines === g.st.lines) throw new Error('unexpected column layout');
      const found = gkgToItems(g.rows, matchers, 'gdelt-gkg'), m = mergeItems(items, found, { now: NOW, retentionDays: RETENTION_DAYS, maxItems: 5000 });
      items = m.items; added += m.added; dupes += m.dupes; files[s] = 'ok'; ok++;
      say(`  ${s}: OK, ${g.st.lines} lines, ${g.st.titled} with headline, ${found.length} named a country, ${m.added} new`); lines.push(`| ${s} | OK, ${m.added} new |`);
    } catch (e) {
      failed++; const miss = e.httpStatus === 404; lastErr = miss ? 'not published (404)' : e.message;
      if (miss) files[s] = 'missing';
      say(`  ${s}: ${miss ? 'not published (404)' : 'FAILED: ' + e.message}`); lines.push(`| ${s} | ${miss ? 'not published (404)' : 'FAILED: ' + String(e.message).replace(/\|/g, '/')} |`);
    }
  }
  // "ok" means the source answered and every file we tried was read or confirmed absent, or nothing new was needed.
  if (!tried) { rec.status = 'ok'; rec.lastSuccessAt = iso(NOW); say('already up to date'); }
  else if (ok) { rec.status = 'ok'; rec.lastSuccessAt = iso(NOW); if (failed) rec.warning = failed + ' of ' + tried + ' files could not be read this run'; }
  else rec.error = `none of the ${tried} files could be read (last problem: ${lastErr})`;
} catch (e) { rec.error = e.message; say('FAILED: ' + e.message + '. Cached articles are kept.'); lines.push(`| lastupdate.txt | FAILED: ${String(e.message).replace(/\|/g, '/')} |`); }
// retention applies on every run, even when no new file was read
items = mergeItems(items, [], { now: NOW, retentionDays: RETENTION_DAYS, maxItems: 5000 }).items;
// per-country cap so one very busy country cannot push the others out, then expire old stamps
const keep = new Set();
for (const id of Object.keys(COUNTRY_TERMS)) items.filter(i => i.matches && i.matches[id]).sort((a, b) => Date.parse(b.published || b.seenByGdelt || b.firstSeenAt) - Date.parse(a.published || a.seenByGdelt || a.firstSeenAt)).slice(0, PER_COUNTRY).forEach(i => keep.add(i));
items = items.filter(i => keep.has(i));
const stampCut = msToStamp(NOW - RETENTION_DAYS * 864e5 - 864e5);
for (const k of Object.keys(files)) if (k < stampCut) delete files[k];
const out = { schema: 1, generatedAt: iso(NOW), checkedAt: iso(NOW), lastSuccessAt: rec.lastSuccessAt, retentionDays: RETENTION_DAYS,
  attribution: { name: 'The GDELT Project', url: 'https://www.gdeltproject.org/', text: 'Data: The GDELT Project (open dataset, used under its terms)' },
  publishers: [{ id: 'gdelt', name: 'GDELT Project open data files', termsChecked: '2026-11-20' }],
  terms: Object.fromEntries(Object.entries(COUNTRY_TERMS).map(([k, v]) => [k, v.map(x => typeof x === 'string' ? x : x.t)])), feeds: { 'gdelt-gkg': rec }, files, items };
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(FILE + '.tmp', JSON.stringify(out, null, 1)); fs.renameSync(FILE + '.tmp', FILE);
say(`\nSummary: status ${rec.status}; ${ok} of ${tried} files read, ${added} new articles, ${dupes} duplicates ignored, ${items.length} in the cache.${rec.status === 'error' ? ' Cached articles were kept and marked with the error.' : ''}`);
lines.push('', `**Status ${rec.status}.** ${ok} of ${tried} files read, ${added} new articles, ${items.length} in the cache.`); writeSummary();
process.exit(rec.status === 'ok' ? 0 : 2);
