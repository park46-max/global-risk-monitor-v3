#!/usr/bin/env node
// Builds data/cache/risk.json (the Risk Assessment cards) from cached data. No network, no AI, no paid service.
//   node scripts/build-risk.mjs --fetch     write the cache (default)
//   node scripts/build-risk.mjs --verify    show the result, write nothing
// Reads: data/cache/risk-inputs.json (scripts/fetch-risk-inputs.mjs), data/cache/indicators.json (existing World Bank cache), data/cache/briefs.json (context only).
// If neither risk-inputs.json nor indicators.json can be read, the previous risk.json is kept and only marked status "error" (the page shows it as stale).
// Exit codes: 0 ok, 2 failed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildRisk, markFailed } from './risk-lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = n => { const a = process.argv.find(x => x.startsWith('--' + n + '=')); return a ? a.slice(n.length + 3) : null; };
const VERIFY = process.argv.includes('--verify');
const DIR = path.resolve(arg('dir') || path.join(ROOT, 'data', 'cache')), FILE = path.join(DIR, 'risk.json');
const NOW = process.env.RISK_NOW ? Date.parse(process.env.RISK_NOW) : Date.now();
const lines = [], say = m => { console.log(m); lines.push(m); };
const writeSummary = md => { if (process.env.GITHUB_STEP_SUMMARY) { try { fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n'); } catch {} } };
const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const atomic = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + '.tmp', s); fs.renameSync(f + '.tmp', f); };
const prevRaw = readJson(FILE), prev = prevRaw && prevRaw.schema === 1 && prevRaw.countries ? prevRaw : null;
try {
  const { RISK } = await import(pathToFileURL(path.join(ROOT, 'data', 'risk-methodology.mjs')).href);
  const out = buildRisk({ riskInputs: readJson(path.join(DIR, 'risk-inputs.json')), indicators: readJson(path.join(DIR, 'indicators.json')), briefs: readJson(path.join(DIR, 'briefs.json')), now: NOW, R: RISK });
  const md = ['## Risk assessments', '', '| Country | Security | Economic | Diplomatic |', '|---|---|---|---|'];
  for (const [id, c] of Object.entries(out.countries)) {
    const cell = a => (a.level || 'Insufficient data') + (a.stale ? ' (stale inputs)' : '');
    say(`  ${id}: security ${cell(c.security)}; economic ${cell(c.economic)}; diplomatic ${cell(c.diplomatic)}`);
    md.push(`| ${id} | ${cell(c.security)} | ${cell(c.economic)} | ${cell(c.diplomatic)} |`);
  }
  say(`Inputs: risk-inputs ${out.inputs.riskInputs.status}, indicators ${out.inputs.indicators.status}, briefs ${out.inputs.briefs.status || 'ok'} (context only).`);
  if (VERIFY) { say('VERIFY MODE: nothing was written.'); writeSummary(md.join('\n') + '\n\nVerify mode: nothing written.'); process.exit(0); }
  atomic(FILE, JSON.stringify(out, null, 1)); say('Wrote ' + path.relative(ROOT, FILE) + '.'); writeSummary(md.join('\n')); process.exit(0);
} catch (e) {
  say('FAILED: ' + e.message);
  if (VERIFY) { writeSummary('## Risk assessments\n\n**Failed (verify):** ' + e.message); process.exit(2); }
  if (prev) { atomic(FILE, JSON.stringify(markFailed(prev, e.message, NOW), null, 1)); say('The previous assessments were kept and marked stale (status "error").'); }
  else say('There is no earlier risk file, so nothing was written.');
  writeSummary('## Risk assessments\n\n**Update failed:** ' + e.message + (prev ? ' The previous assessments are kept and shown as stale.' : ' No earlier file exists.'));
  process.exit(2);
}
