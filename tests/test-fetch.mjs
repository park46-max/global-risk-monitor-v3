#!/usr/bin/env node
// SIMULATED tests for scripts/fetch-data.mjs. They use a local mock server, NOT the real GDELT or World Bank.
// They prove the parsing, retry, stale-preservation and error-handling logic. They do not prove the real APIs behave this way.
// Run:  node tests/test-fetch.mjs

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let phase = 1, hits429 = 0;
const send = (res, status, body, type = 'application/json') => { res.writeHead(status, { 'Content-Type': type }); res.end(typeof body === 'string' ? body : JSON.stringify(body)); };
const meta = { page: 1, pages: 1, per_page: 50, total: 1, lastupdated: '2026-10-07' };
const wbRow = (code, ind, value, date) => [meta, [{ indicator: { id: ind }, country: { id: code.slice(0, 2) }, countryiso3code: code, date, value }]];
const art = (n, extra = {}) => ({ url: 'https://news.example/' + n, title: 'Mock headline ' + n, domain: 'news.example', seendate: '20261120T0' + n + '1500Z', language: 'English', sourcecountry: 'Testland', ...extra });

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), p = u.pathname;
  if (p === '/gdelt') {
    const q = u.searchParams.get('query') || '';
    if (phase === 4) return send(res, 503, 'down', 'text/plain');                         // everything fails
    if (q.includes('White House')) {                                                       // USA
      if (phase === 2) return send(res, 500, 'boom', 'text/plain');
      return send(res, 200, { articles: [art(1), art(2), art(3, { title: 'mock headline 1' }), art(1, { title: 'Same url different title' }), art(5, { url: 'javascript:alert(1)' }), { title: 'no url' }] });
    }
    if (q.includes('Beijing')) {                                                           // CHN: rate limit once, then fine
      if (phase === 1 && hits429++ < 1) return send(res, 429, 'Please limit requests to one every 5 seconds.', 'text/plain');
      return send(res, 200, { articles: [art(4)] });
    }
    if (q.includes('Kremlin')) { if (phase === 2) return setTimeout(() => send(res, 200, { articles: [art(6)] }), 2000); return send(res, 200, ''); }   // RUS: empty, then timeout
    if (q.includes('Kyiv')) { if (phase === 1) return send(res, 200, 'The specified phrase is too short.', 'text/plain'); return send(res, 200, { articles: [art(7)] }); }   // UKR
    if (q.includes('Taipei')) return send(res, 503, 'down', 'text/plain');                // TWN: always down
  }
  const m = p.match(/^\/wb\/country\/([A-Z]+)(?:\/indicator\/([A-Z.]+))?$/);
  if (m) {
    const [, code, ind] = m;
    if (phase === 4) return send(res, 500, 'down', 'text/plain');
    const invalid = [{ message: [{ id: '120', key: 'Invalid value', value: 'The provided parameter value is not valid' }] }];
    if (code === 'TWN') return send(res, 200, invalid);
    if (!ind) return send(res, 200, [meta, [{ id: code, name: 'Mockland ' + code, region: { value: 'Test region' } }]]);
    if (code === 'USA') {
      if (ind === 'FP.CPI.TOTL.ZG') return send(res, 200, [{ page: 0, total: 0 }, null]);                // no data published
      if (ind === 'MS.MIL.XPND.GD.ZS') return send(res, 200, wbRow(code, ind, null, '2024'));           // null value
      return send(res, 200, wbRow(code, ind, ind === 'SP.POP.TOTL' ? 340000000 : 1.5, '2023'));
    }
    if (code === 'CHN') { if (ind === 'NY.GDP.MKTP.CD') return phase >= 2 ? send(res, 500, 'boom', 'text/plain') : send(res, 200, wbRow(code, ind, 1.8e13, '2023')); return send(res, 200, wbRow(code, ind, 2.2, '2023')); }
    if (code === 'RUS') return send(res, 200, wbRow('UKR', ind, 99, '2023'));                           // wrong country: must be refused
    return send(res, 200, wbRow(code, ind, 5.5, '2022'));
  }
  send(res, 404, 'not found', 'text/plain');
});

const run = (args, out) => new Promise(resolve => {
  const env = { ...process.env, GDELT_BASE: base + '/gdelt', WB_BASE: base + '/wb', GDELT_DELAY_MS: '0', WB_DELAY_MS: '0', RETRY_WAIT_MS: '10', TIMEOUT_MS: '700' };
  const c = spawn(process.execPath, [path.join(ROOT, 'scripts/fetch-data.mjs'), ...args, '--out=' + out], { env }); let log = '';
  c.stdout.on('data', d => log += d); c.stderr.on('data', d => log += d); c.on('close', code => resolve({ code, log }));
});
const J = f => JSON.parse(fs.readFileSync(f, 'utf8'));

await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port;
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'grm-test-'));
let passed = 0; const ok = (name, fn) => { try { fn(); passed++; console.log('  PASS', name); } catch (e) { console.log('  FAIL', name, '\n      ', e.message); process.exitCode = 1; } };
console.log('SIMULATED tests (local mock server, not the real APIs)\n');

console.log('Run 1: first fetch, no earlier cache');
let r = await run([], out); const n1 = J(out + '/news.json'), i1 = J(out + '/indicators.json');
ok('exits 0 when some requests succeed', () => assert.equal(r.code, 0));
ok('USA: ok, duplicates / unsafe URLs / untitled items removed (2 articles left)', () => { assert.equal(n1.countries.USA.status, 'ok'); assert.deepEqual(n1.countries.USA.articles.map(a => a.title), ['Mock headline 1', 'Mock headline 2']); });
ok('CHN: rate limit (429) retried, then ok', () => { assert.equal(n1.countries.CHN.status, 'ok'); assert.equal(n1.countries.CHN.articles.length, 1); });
ok('RUS: empty body = ok with 0 articles (not an error)', () => { assert.equal(n1.countries.RUS.status, 'ok'); assert.equal(n1.countries.RUS.articles.length, 0); });
ok('UKR: plain-text GDELT error = error with message, no articles', () => { assert.equal(n1.countries.UKR.status, 'error'); assert.match(n1.countries.UKR.error, /not valid JSON.*too short/); assert.equal(n1.countries.UKR.fetchedAt, null); });
ok('TWN: persistent 503 = error after retries', () => { assert.equal(n1.countries.TWN.status, 'error'); assert.match(n1.countries.TWN.error, /HTTP 503/); });
ok('top level: lastSuccessAt set, checkedAt set', () => { assert.ok(n1.lastSuccessAt); assert.ok(n1.checkedAt); });
ok('indicators USA: value+year kept; no-data and null value become "none", never a number', () => {
  const x = i1.countries.USA.indicators; assert.equal(x['NY.GDP.MKTP.CD'].year, '2023'); assert.equal(x['NY.GDP.MKTP.CD'].value, 1.5);
  assert.equal(x['FP.CPI.TOTL.ZG'].status, 'none'); assert.equal(x['FP.CPI.TOTL.ZG'].value, null); assert.equal(x['MS.MIL.XPND.GD.ZS'].status, 'none'); assert.equal(x['MS.MIL.XPND.GD.ZS'].value, null); });
ok('indicators UKR: reference year preserved as published (2022)', () => assert.equal(i1.countries.UKR.indicators['SP.POP.TOTL'].year, '2022'));
ok('indicators RUS: reply for another country is REFUSED, no value stored', () => { const x = i1.countries.RUS.indicators['NY.GDP.MKTP.CD']; assert.equal(x.status, 'error'); assert.match(x.error, /Refused/); assert.equal(x.value, null); assert.equal(i1.countries.RUS.status, 'error'); });
ok('indicators TWN: marked "unsupported" with an explicit message, no values, nothing substituted', () => { const t = i1.countries.TWN; assert.equal(t.status, 'unsupported'); assert.match(t.error, /no country with code TWN/); assert.ok(Object.values(t.indicators).every(x => x.value === null && x.status === 'unsupported')); });

console.log('\nRun 2: refresh while some sources fail (earlier data must be kept and labelled)');
phase = 2; r = await run([], out); const n2 = J(out + '/news.json'), i2 = J(out + '/indicators.json');
ok('USA: refresh failed -> status error, earlier 2 articles kept, fetchedAt unchanged', () => { const u = n2.countries.USA; assert.equal(u.status, 'error'); assert.equal(u.articles.length, 2); assert.equal(u.fetchedAt, n1.countries.USA.fetchedAt); assert.ok(u.checkedAt > u.fetchedAt); });
ok('RUS: timeout is reported as an error', () => { assert.equal(n2.countries.RUS.status, 'error'); assert.match(n2.countries.RUS.error, /timed out/); });
ok('UKR: recovers on a later run (ok, 1 article)', () => { assert.equal(n2.countries.UKR.status, 'ok'); assert.equal(n2.countries.UKR.articles.length, 1); });
ok('CHN indicators: failed GDP refresh keeps old value+year, marked error', () => { const g = i2.countries.CHN.indicators['NY.GDP.MKTP.CD']; assert.equal(g.status, 'error'); assert.equal(g.value, 1.8e13); assert.equal(g.year, '2023'); assert.equal(g.fetchedAt, i1.countries.CHN.indicators['NY.GDP.MKTP.CD'].fetchedAt); assert.equal(i2.countries.CHN.status, 'partial'); });

const keep = tag => { if (process.env.KEEP_OUT) { fs.mkdirSync(path.join(process.env.KEEP_OUT, tag, 'data/cache'), { recursive: true }); for (const f of ['news.json', 'indicators.json']) fs.copyFileSync(path.join(out, f), path.join(process.env.KEEP_OUT, tag, 'data/cache', f)); } };
keep('mixed');
console.log('\nRun 3: country-code verification');
r = await run(['--verify'], out);
ok('--verify reports TWN as NOT recognised and USA as recognised', () => { assert.match(r.log, /TWN \(TWN\): NOT recognised/); assert.match(r.log, /USA \(USA\): recognised/); });

console.log('\nRun 4: everything fails');
phase = 4; const before = fs.readFileSync(out + '/news.json', 'utf8'); r = await run(['--only=news'], out); const n4 = J(out + '/news.json');
ok('exit code 2 so the GitHub Action run is marked failed', () => assert.equal(r.code, 2));
ok('earlier successful data still present and labelled error', () => { assert.equal(n4.countries.CHN.articles.length, 1); assert.equal(n4.countries.CHN.status, 'error'); assert.equal(n4.countries.CHN.fetchedAt, n2.countries.CHN.fetchedAt); });
ok('lastSuccessAt never advances on failure', () => assert.equal(n4.lastSuccessAt, n2.lastSuccessAt));

keep('allfail');
server.close(); fs.rmSync(out, { recursive: true, force: true });
console.log(`\n${passed} checks passed${process.exitCode ? ', SOME FAILED' : ''}. Reminder: simulated only; no real GDELT or World Bank request was made.`);
