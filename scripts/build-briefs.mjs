#!/usr/bin/env node
// Builds data/cache/briefs.json (Country intelligence briefs) from the cached news files. No network, no AI, no paid service.
//   node scripts/build-briefs.mjs --fetch     write the brief cache (default)
//   node scripts/build-briefs.mjs --verify    show what would be written, write nothing
// Reads:  data/cache/news-gdelt.json, data/cache/news-rss.json (each optional).   Rules: data/brief-rules.mjs, data/country-terms.mjs, data/relevance-rules.mjs.
// If the update fails (no readable news cache, or an unexpected error) the previous briefs.json is kept and only marked status "error", so the page
// shows it as stale. If there is no previous file nothing is written. Exit codes: 0 ok, 2 failed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildAll, markFailed } from './brief-lib.mjs';
import { loadExclusions, scrubItemsDoc, scrubBriefsDoc, assertClean } from './exclusion-lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = n => { const a = process.argv.find(x => x.startsWith('--' + n + '=')); return a ? a.slice(n.length + 3) : null; };
const VERIFY = process.argv.includes('--verify');
const DIR = path.resolve(arg('dir') || path.join(ROOT, 'data', 'cache'));
const FILE = path.join(DIR, 'briefs.json');
const NOW = process.env.BRIEF_NOW ? Date.parse(process.env.BRIEF_NOW) : Date.now();
const lines = [], say = m => { console.log(m); lines.push(m); };
const writeSummary = md => { if (process.env.GITHUB_STEP_SUMMARY) { try { fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n'); } catch {} } };
const readJson = f => { try { return { json: JSON.parse(fs.readFileSync(f, 'utf8')) }; } catch (e) { return { json: e.code === 'ENOENT' ? null : undefined, error: e.code === 'ENOENT' ? 'file not found' : e.message }; } };
const atomic = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + '.tmp', s); fs.renameSync(f + '.tmp', f); };

let prev = null; { const p = readJson(FILE); if (p.json && p.json.schema === 1 && p.json.countries) prev = p.json; }
// Publisher exclusion list (data/publisher-exclusions.js). Fails closed: if it cannot be read the script stops and writes nothing.
const EXC = loadExclusions();
let neutralizedPrev = [];
if (prev) { const sc = scrubBriefsDoc(prev, EXC); prev = sc.doc; neutralizedPrev = sc.neutralized; }   // an earlier brief that names an excluded publisher is never carried forward or re-written
try {
  const { BRIEF_RULES } = await import(pathToFileURL(path.join(ROOT, 'data', 'brief-rules.mjs')).href);
  const { COUNTRY_TERMS } = await import(pathToFileURL(path.join(ROOT, 'data', 'country-terms.mjs')).href);
  const { RULES } = await import(pathToFileURL(path.join(ROOT, 'data', 'relevance-rules.mjs')).href);
  const g = readJson(path.join(DIR, 'news-gdelt.json')), r = readJson(path.join(DIR, 'news-rss.json'));
  // json null = file absent (normal when RSS is switched off); undefined = present but unreadable
  const gs = g.json ? scrubItemsDoc(g.json, EXC) : { doc: g.json, removed: 0 }, rs = r.json ? scrubItemsDoc(r.json, EXC) : { doc: r.json, removed: 0 };   // excluded articles never reach the brief rules
  const out = buildAll({ caches: { gdelt: g.json === undefined ? 0 : gs.doc, rss: r.json === undefined ? 0 : rs.doc }, prev, now: NOW, R: BRIEF_RULES, countryTerms: COUNTRY_TERMS, rules: RULES });
  say(`Inputs: GDELT files ${out.inputs.gdelt.status}${out.inputs.gdelt.items != null ? ' (' + out.inputs.gdelt.items + ' items' + (out.inputs.gdelt.stale ? ', STALE' : '') + ')' : ''}; RSS ${out.inputs.rss.status}${out.inputs.rss.status === 'ok' ? ' (' + out.inputs.rss.items + ' items' + (out.inputs.rss.stale ? ', STALE' : '') + ')' : ''}.`);
  say(`Articles read ${out.itemStats.read}: dropped ${out.itemStats.noSource} without headline/publisher/link, ${out.itemStats.noTime} without any time, ${out.itemStats.outsideWindow} outside the window, ${out.itemStats.noCountry} naming none of the five countries, ${out.itemStats.routineNotices} routine financial notices; ${out.itemStats.grouped} grouped as duplicates.`);
  assertClean(out, EXC, 'briefs.json');
  say(`Publisher exclusions: ${gs.removed + rs.removed} cached article(s) ignored; ${neutralizedPrev.length} earlier brief(s) discarded (${neutralizedPrev.join(', ') || 'none'}). Counts only.`);
  const md = ['## Country briefs', '', '| Country | Status | Reports found | Listed | Sentences under "Why it matters" |', '|---|---|---|---|---|'];
  for (const [id, b] of Object.entries(out.countries)) {
    const st = b.carriedForward ? b.status + ' (earlier brief kept, stale)' : b.status;
    say(`  ${id}: ${st}; ${b.reportsFound || 0} reports found, ${(b.sources || []).filter(s => !s.duplicateOf).length} listed, ${b.why ? b.why.length : 0} analytical sentences${b.limitations && b.limitations.length ? '; limitations: ' + b.limitations.length : ''}`);
    md.push(`| ${id} | ${st} | ${b.reportsFound || 0} | ${(b.sources || []).filter(s => !s.duplicateOf).length} | ${b.why ? b.why.length : 0} |`);
  }
  if (VERIFY) { say('\nVERIFY MODE: nothing was written.'); writeSummary(md.join('\n') + '\n\nVerify mode: nothing written.'); process.exit(0); }
  atomic(FILE, JSON.stringify(out, null, 1));
  say(`\nWrote ${path.relative(ROOT, FILE)}.`); writeSummary(md.join('\n')); process.exit(0);
} catch (e) {
  say('FAILED: ' + e.message);
  if (VERIFY) { writeSummary('## Country briefs\n\n**Failed (verify, nothing written):** ' + e.message); process.exit(2); }
  if (prev) { atomic(FILE, JSON.stringify(markFailed(prev, e.message, NOW), null, 1)); say('The previous briefs were kept and marked stale (status "error").'); }
  else say('There is no earlier brief file, so nothing was written.');
  writeSummary('## Country briefs\n\n**Update failed:** ' + e.message + (prev ? ' The previous briefs were kept and are shown as stale.' : ' No earlier file exists.'));
  process.exit(2);
}
