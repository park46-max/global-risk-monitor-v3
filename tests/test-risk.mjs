// SIMULATED tests for the automated risk assessments (Stage 8B-1 additions are in tests/test-risk-8b1.mjs) (rules, missing/stale data, failed requests, attribution, no fabricated scores).
// A local mock server pretends to be api.worldbank.org and ucdp.uu.se. No real service is contacted and nothing was run on GitHub. Run: node tests/test-risk.mjs
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { RISK as R } from '../data/risk-methodology.mjs';
import { parseCsv, parseUcdp, summariseUcdp, classifySecurity, classifyEconomic, classifyDiplomatic, buildRisk } from '../scripts/risk-lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let n = 0, bad = 0; const ok = (c, m) => { n++; if (!c) { bad++; console.log('  FAIL: ' + m); } };
const NOW = Date.parse('2026-11-20T12:00:00Z'), dAgo = d => new Date(NOW - d * 864e5).toISOString();
const IDS = ['USA', 'CHN', 'RUS', 'UKR', 'TWN'];
const csv = `conflict_id,location,side_a,side_a_id,side_a_2nd,side_b,side_b_id,side_b_2nd,incompatibility,territory_name,year,intensity_level,cumulative_intensity,type_of_conflict,start_date,start_prec,start_date2,start_prec2,ep_end,ep_end_date,ep_end_prec,gwno_a,gwno_a_2nd,gwno_b,gwno_b_2nd,gwno_loc,region,version
11,Ukraine,"Government of Russia (Soviet Union)",365,,"Government of Ukraine",369,"Government of North Korea, Test",1,Donetsk,2025,2,1,2,2014-02-20,1,,,0,,,365,,369,"",369,3,26.1
11,Ukraine,"Government of Russia (Soviet Union)",365,,"Government of Ukraine",369,,1,Donetsk,2024,2,1,2,2014-02-20,1,,,0,,,365,,369,,369,3,26.1
900,Testland,"Government of Testland",999,,"Rebels, in ""Testland""",1999,,2,,2025,1,0,3,2000-01-01,1,,,0,,,999,"",1000,,"999",1,26.1
901,Elsewhere,"Government of Elsewhere",998,,"Rebels",1998,,2,,2025,1,0,4,2000-01-01,1,,,0,,,998,"365",1000,,998,1,26.1
`;
const parsed = parseUcdp(csv), conf = summariseUcdp(parsed, R.countries);
const cache = (o = {}) => ({ schema: 1, checkedAt: dAgo(0), lastSuccessAt: dAgo(1), ucdp: { status: 'ok', version: '26.1', latestYear: 2025, fetchedAt: dAgo(3), conflicts: conf, ...o.ucdp },
  wgi: Object.fromEntries(IDS.map(i => [i, { status: 'ok', indicator: R.sources.wgi.code, value: 0.3, year: '2024', fetchedAt: dAgo(2) }])), unemployment: Object.fromEntries(IDS.map(i => [i, { status: 'ok', value: 4, year: '2025', fetchedAt: dAgo(2) }])), ...o.top });
const ind = (v = {}) => ({ schema: 2, checkedAt: dAgo(0), lastSuccessAt: dAgo(1), countries: Object.fromEntries(IDS.map(i => [i, { status: 'ok', indicators: { 'NY.GDP.MKTP.KD.ZG': { status: 'ok', value: 2.5, year: '2025', fetchedAt: dAgo(1), ...(v.growth || {}) }, 'FP.CPI.TOTL.ZG': { status: 'ok', value: 3, year: '2025', fetchedAt: dAgo(1), ...(v.inflation || {}) } } }])) });
const sec = (id, ri = cache(), briefs = null) => classifySecurity(id, { ucdp: ri && ri.ucdp, wgi: ri && ri.wgi }, R, NOW, briefs);
const eco = (id, indicators = ind(), ri = cache()) => classifyEconomic(id, { indicators, riskInputs: ri }, R, NOW);

console.log('\nA. UCDP file reading');
ok(parseCsv('a,"b,c","d ""e"""\n1,2,3\n').flat().join('|') === 'a|b,c|d "e"|1|2|3', 'CSV reader handles quotes, commas and doubled quotes');
ok(parsed.latestYear === 2025 && parsed.rows.length === 4, 'newest year found (2025) and all four fixture rows read');
ok(conf.UKR.length === 1 && conf.UKR[0].role === 'location or primary party' && conf.UKR[0].intensity === 2, 'Ukraine: location/primary party in an intensity-2 conflict');
ok(conf.RUS.length === 2 && conf.RUS.some(c => c.conflictId === '11') && conf.RUS.some(c => c.role === 'supporting party'), 'Russia: primary party in 11 and supporting party in 901 (second-party list "2, 365")');
ok(conf.USA.length === 0 && conf.CHN.length === 0 && conf.TWN.length === 0, 'no conflict recorded for USA, CHN, TWN: empty lists');
let t = ''; try { parseUcdp('a,b\n1,2\n'); } catch (e) { t = e.message; } ok(/unexpected UCDP file layout/.test(t), 'a file with unexpected columns is refused, never guessed');
t = ''; try { parseUcdp('<html>not csv</html>'); } catch (e) { t = e.message; } ok(!!t, 'an HTML page instead of a CSV is refused');

console.log('\nB. Security rules (documented levels)');
ok(sec('UKR').level === 'Critical' && /S1/.test(sec('UKR').rule), 'S1: intensity 2 as location/primary party -> Critical');
ok(sec('RUS').level === 'Critical', 'S1 also applies to Russia as primary party in the intensity-2 conflict');
const hi = cache({ ucdp: { conflicts: { ...conf, USA: [{ conflictId: '5', location: 'X', sideA: 'A', sideB: 'B', intensity: 1, type: 'internal', incompatibility: 'government', role: 'location or primary party' }] } } });
ok(sec('USA', hi).level === 'High' && /S2/.test(sec('USA', hi).rule), 'S2: intensity 1 as primary party -> High');
const mo = cache({ ucdp: { conflicts: { ...conf, CHN: [{ conflictId: '6', location: 'X', sideA: 'A', sideB: 'B', intensity: 2, type: 'internal', incompatibility: 'government', role: 'supporting party' }] } } });
ok(sec('CHN', mo).level === 'Moderate' && /S3/.test(sec('CHN', mo).rule), 'S3: supporting party only (even in a war) -> Moderate, not Critical');
ok(sec('USA').level === 'Low' && /S4/.test(sec('USA').rule), 'S4: no conflict and WGI 0.3 -> Low');
const w = v => cache({ top: { wgi: Object.fromEntries(IDS.map(i => [i, { status: 'ok', indicator: R.sources.wgi.code, value: v, year: '2024', fetchedAt: dAgo(1) }])) } });
ok(sec('USA', w(0)).level === 'Low' && sec('USA', w(-0.01)).level === 'Moderate' && sec('USA', w(-1)).level === 'Moderate' && sec('USA', w(-1.01)).level === 'High', 'WGI boundaries: 0 -> Low, -0.01 and -1.0 -> Moderate, -1.01 -> High');
ok(sec('UKR', w(1.5)).level === 'Critical', 'a good WGI value cannot lower a level set by UCDP involvement');
const tw = sec('TWN', cache({ top: { wgi: { ...cache().wgi, TWN: { status: 'unsupported', error: 'The World Bank API has no country with code TWN (not published)' } } } }));
ok(tw.status === 'insufficient' && tw.level === null && /not evidence of low risk/.test(tw.summary), 'hypothetical: no conflict recorded + the World Bank has no WGI value -> Insufficient data, explicitly not "low risk"');
ok(tw.facts.some(f => /none recorded/.test(f.value)) && !/sovereign|province|part of/i.test(tw.summary + JSON.stringify(tw.facts)), 'Taiwan card states the observed absence and makes no sovereignty statement');
ok(tw.limitations.some(l => /No sovereignty or status position/.test(l)), 'Taiwan limitation names the neutral handling');

console.log('\nC. Economic rules');
ok(eco('USA').level === 'Low', 'growth 2.5, inflation 3, unemployment 4 -> Low');
ok(eco('USA', ind({ inflation: { value: 5 } })).level === 'Moderate' && eco('USA', ind({ inflation: { value: 4.99 } })).level === 'Low', 'inflation boundary at 5');
ok(eco('USA', ind({ inflation: { value: 10 } })).level === 'High' && eco('USA', ind({ inflation: { value: 20 } })).level === 'Critical', 'inflation 10 -> High, 20 -> Critical');
ok(eco('USA', ind({ inflation: { value: -0.5 } })).level === 'Moderate', 'falling prices -> Moderate');
ok(eco('USA', ind({ growth: { value: 2 } })).level === 'Low' && eco('USA', ind({ growth: { value: 1.99 } })).level === 'Moderate' && eco('USA', ind({ growth: { value: -0.1 } })).level === 'High' && eco('USA', ind({ growth: { value: -5 } })).level === 'High' && eco('USA', ind({ growth: { value: -5.1 } })).level === 'Critical', 'growth boundaries');
ok(eco('USA', ind(), cache({ top: { unemployment: { USA: { status: 'ok', value: 16, year: '2025', fetchedAt: dAgo(1) } } } })).level === 'Critical', 'the overall level is the WORST dimension (unemployment 16 -> Critical)');
const e1 = eco('USA'); ok(e1.facts.filter(f => f.kind === 'observed').length === 3 && e1.facts.filter(f => f.kind === 'interpretation').length === 3, 'observed facts and interpretations are separate entries');
ok(e1.limitations.some(l => /Debt, reserves, sanctions/.test(l)), 'the economic limitation states what is not measured');

console.log('\nD. Missing and incomplete data');
const noInd = { schema: 2, countries: { ...ind().countries, TWN: { status: 'unsupported', indicators: { 'NY.GDP.MKTP.KD.ZG': { status: 'unsupported', error: 'no data for code TWN' }, 'FP.CPI.TOTL.ZG': { status: 'unsupported', error: 'no data for code TWN' } } } } };
const twE = eco('TWN', noInd, cache({ top: { unemployment: { ...cache().unemployment, TWN: { status: 'unsupported' } } } }));
ok(twE.status === 'insufficient' && twE.level === null && /does not publish data/.test(twE.summary) && /not treated as low risk/.test(twE.summary), 'Taiwan economic: World Bank has nothing -> Insufficient data, nothing substituted');
ok(eco('USA', ind({ growth: { value: null } }), cache({ top: { unemployment: {} } })).status === 'insufficient', 'only one usable indicator (needs 2) -> Insufficient data');
ok(eco('USA', ind({ inflation: { value: null } })).status === 'assessed', 'two of three indicators are enough');
ok(eco('USA', ind({ growth: { year: '2021' }, inflation: { year: '2021' } }), cache({ top: { unemployment: {} } })).status === 'insufficient', 'values older than 3 years are not used');
ok(eco('USA', null, null).status === 'insufficient' && eco('USA', null, null).insufficientReason === 'inputs-unavailable', 'no caches at all -> Insufficient data (inputs unavailable)');
ok(sec('USA', null).status === 'insufficient' && sec('USA', { ...cache(), ucdp: { status: 'error', error: 'x', latestYear: null, conflicts: null } }).status === 'insufficient', 'no UCDP data -> Insufficient data, never Low');
ok(sec('USA', cache({ ucdp: { latestYear: 2021 } })).status === 'insufficient' && /too old/.test(sec('USA', cache({ ucdp: { latestYear: 2021 } })).summary), 'a UCDP file whose newest year is too old gives no level');
ok(sec('USA', cache({ top: { wgi: { ...cache().wgi, USA: { status: 'ok', indicator: R.sources.wgi.code, value: 0.5, year: '2019', fetchedAt: dAgo(1) } } } })).status === 'insufficient', 'a WGI value older than 3 years is not used');
ok(sec('USA', cache({ top: { wgi: { ...cache().wgi, USA: { status: 'ok', value: 0.9, year: '2024', fetchedAt: dAgo(1) } } } })).status === 'insufficient' && sec('USA', cache({ top: { wgi: { ...cache().wgi, USA: { status: 'ok', indicator: 'PV.EST', value: 0.9, year: '2024', fetchedAt: dAgo(1) } } } })).status === 'insufficient', 'a WGI value without the current indicator code, or from the retired legacy code PV.EST, is never used');
ok(R.sources.wgi.code === 'GOV_WGI_PV.EST' && R.sources.wgi.url.endsWith('GOV_WGI_PV.EST') && !JSON.stringify(R.sources.wgi).includes('"PV.EST"'), 'the methodology names the current WGI code GOV_WGI_PV.EST, not the retired PV.EST');
ok(IDS.every(i => classifyDiplomatic(i, null, R).status === 'insufficient' && classifyDiplomatic(i, null, R).level === null), 'diplomatic: never a level, for all five countries');

console.log('\nE. Stale data');
ok(sec('UKR', cache({ ucdp: { fetchedAt: dAgo(40) } })).stale === true && sec('UKR', cache({ ucdp: { fetchedAt: dAgo(40) } })).limitations.some(l => /more than 14 days ago/.test(l)), 'UCDP data fetched 40 days ago is flagged stale');
ok(sec('UKR').stale === false, 'recent data is not flagged');
const fe = sec('UKR', cache({ ucdp: { status: 'error', error: 'HTTP 503' } })); ok(fe.stale && fe.level === 'Critical' && fe.limitations.some(l => /last successfully fetched/.test(l)), 'failed refresh: earlier value still used, marked stale with the error');
ok(eco('USA', ind({ inflation: { status: 'error', fetchedAt: dAgo(2) } })).stale === true, 'economic: an indicator whose latest refresh failed marks the assessment stale');
ok(eco('USA', ind({ growth: { fetchedAt: dAgo(30) }, inflation: { fetchedAt: dAgo(30) } })).stale === true, 'economic: inputs older than 14 days are stale');

console.log('\nF. Attribution, no fabrication, headlines never decide');
const briefs = (k) => ({ generatedAt: dAgo(0), countries: Object.fromEntries(IDS.map(i => [i, { developments: Array.from({ length: k }, (_, j) => ({ headline: 'Report ' + j, publisher: 'Pub', url: 'https://pub.test/' + j, time: dAgo(1), timeBasis: 'published', topics: ['Security', 'Diplomacy', 'Sanctions and trade'] })).concat([{ headline: 'Unsafe', publisher: 'P', url: 'javascript:alert(1)', topics: ['Security'] }, { headline: 'No publisher', publisher: '', url: 'https://x.test/', topics: ['Security'] }]) }])) });
for (const i of IDS) {
  const a = [sec(i), sec(i, cache(), briefs(0)), sec(i, cache(), briefs(50))];
  ok(a[0].level === a[1].level && a[1].level === a[2].level && a[0].status === a[2].status, i + ': 0 or 50 security headlines leave the level unchanged');
  const d = [eco(i).level, eco(i, ind(), cache()).level]; ok(d[0] === d[1], i + ': economic level does not read headlines');
}
const withCtx = sec('UKR', cache(), briefs(5)); ok(withCtx.context.length === R.contextMax && withCtx.context.every(c => /^https:/.test(c.url) && c.publisher), 'context is capped, and entries with an unsafe link or no publisher are excluded');
ok(withCtx.limitations.some(l => /played no part in the level/.test(l)), 'the card says headlines played no part in the level');
const all = buildRisk({ riskInputs: cache(), indicators: ind(), briefs: briefs(3), now: NOW, R });
ok(all.countries.UKR.economic.limitations.some(l => /particular caution/.test(l)) && !all.countries.USA.economic.limitations.some(l => /particular caution/.test(l)), 'a country at war per UCDP gets an explicit caution on its economic card; others do not');
ok(Object.keys(all.countries).join() === IDS.join(), 'all five monitored countries are present');
const cards = IDS.flatMap(i => ['security', 'economic', 'diplomatic'].map(k => all.countries[i][k]));
ok(cards.every(c => (c.status === 'assessed' && R.levels.includes(c.level)) || (c.status === 'insufficient' && c.level === null)), 'every card is either an assessed level from the allowed list or an Insufficient-data state with no level');
ok(cards.filter(c => c.status === 'assessed').every(c => c.rule && c.facts.some(f => f.kind === 'observed') && c.sources.length && c.referenceDates.length && c.lastSuccessAt), 'every assessed card has a rule, observed facts, sources, reference dates and a last-update time');
const allowedUrl = new Set([...Object.values(R.sources).map(s => s.url)]);
ok(cards.every(c => c.sources.every(s => allowedUrl.has(s.url) && s.name && s.publisher) && c.facts.every(f => f.kind === 'interpretation' || (allowedUrl.has(f.url) && f.source && f.year))), 'every source and fact cites one of the documented sources, with name, URL and year');
ok(cards.every(c => c.facts.filter(f => f.kind === 'observed').every(f => c.sources.some(s => s.url === f.url))), 'every fact links to a source listed on the same card');
const texts = cards.flatMap(c => [c.summary, c.rule || '', ...c.limitations]).join(' | ').toLowerCase();
const hitW = R.bannedInText.filter(b => texts.includes(b)); if (hitW.length) console.log('    banned words found:', hitW);
ok(!hitW.length, 'no summary, rule or limitation contains causal, forecast or verdict wording');
const kw = JSON.stringify(cards.filter(c => c.category !== 'diplomatic').map(c => [c.level, c.summary, c.rule])); if (/keyword|articles|headlines/.test(kw)) console.log('    found:', kw.match(/.{40}(keyword|articles|headlines).{20}/)); ok(!/keyword|articles|headlines/.test(kw), 'no level or explanation is based on article or keyword counts');
const none = IDS.map(i => buildRisk({ riskInputs: { schema: 1, ucdp: null }, indicators: { countries: {} }, briefs: null, now: NOW, R }).countries[i]);
ok(none.every(c => c.security.level === null && c.economic.level === null && c.diplomatic.level === null), 'with no data at all, no country receives any level');
let thr = ''; try { buildRisk({ riskInputs: null, indicators: null, briefs: null, now: NOW, R }); } catch (e) { thr = e.message; } ok(/neither/.test(thr), 'no readable cache at all: building fails (so the previous file is kept) rather than inventing results');
ok(Object.values(R.sources).every(s => /^https:\/\//.test(s.url)) && !/api[_-]?key|token|secret/i.test(JSON.stringify(R)), 'sources are https links and the methodology holds no key or token');

console.log('\nG. Scripts against a mock server (simulated network)');
function zip(name, data) {
  const T = new Uint32Array(256).map((_, k) => { let c = k; for (let j = 0; j < 8; j++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = b => { let c = 0xFFFFFFFF; for (const x of b) c = T[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const raw = Buffer.from(data), body = zlib.deflateRawSync(raw), nm = Buffer.from(name), cr = crc(raw);
  const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(cr, 14); lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nm.length, 26);
  const local = Buffer.concat([lh, nm, body]), ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(cr, 16); ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(0, 42);
  const cd = Buffer.concat([ch, nm]), e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(1, 8); e.writeUInt16LE(1, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(local.length, 16);
  return Buffer.concat([local, cd, e]);
}
const mode = { fail: false, wrongCountry: false, wgiGone: false, wrongIndicator: false }, hits = []; const WBV = { 'GOV_WGI_PV.EST': { USA: 0.12, CHN: -0.35, RUS: -0.9, UKR: -1.6, TWN: 0.8 }, 'SL.UEM.TOTL.ZS': { USA: 4.1, CHN: 4.9, RUS: 3.0, UKR: 9.5 } };
const server = http.createServer((q, s) => {
  hits.push(q.url); const u = new URL(q.url, 'http://x'), send = (code, body, type = 'application/json') => { s.writeHead(code, { 'content-type': type }); s.end(body); };
  if (u.pathname.endsWith('.zip')) { if (u.pathname.includes('-271-')) return send(404, 'nope', 'text/plain'); if (mode.fail) return send(503, 'down', 'text/plain'); return send(200, zip('ucdp-prio-acd-261.csv', csv), 'application/zip'); }
  if (mode.fail) return send(503, 'down', 'text/plain');
  const meta = /\/v2\/indicator\/([\w.]+)$/.exec(u.pathname);
  if (meta) return send(200, JSON.stringify(meta[1] === 'GOV_WGI_PV.EST' && !mode.wgiGone ? [{ page: 1 }, [{ id: 'GOV_WGI_PV.EST', name: 'Political Stability - Governance estimate (approx. -2.5 to +2.5)', source: { id: '2', value: 'World Development Indicators' } }]] : [{ message: [{ id: '175', key: 'Invalid format', value: 'The indicator was not found. It may have been deleted or archived.' }] }]));
  const m = /\/v2\/country\/([A-Z]{3})(?:\/indicator\/([\w.]+))?$/.exec(u.pathname); if (!m) return send(404, 'x', 'text/plain');
  const [, code, indc] = m;
  if (!indc) return send(200, JSON.stringify([{ page: 1 }, [{ id: code }]]));
  // SIMULATED Taiwan, modelled on the production answer seen on 2026-11-27: the WGI series has a value, the World Development Indicators series come back empty ("none").
  if (code === 'TWN' && indc !== 'GOV_WGI_PV.EST') return send(200, JSON.stringify([{ page: 1, lastupdated: '2026-07-01' }, [{ indicator: { id: indc, value: 'name' }, countryiso3code: 'TWN', date: '2025', value: null }]]));
  if (!WBV[indc] || (indc === 'GOV_WGI_PV.EST' && mode.wgiGone)) return send(200, JSON.stringify([{ message: [{ id: '175', key: 'Invalid format', value: 'The indicator was not found. It may have been deleted or archived.' }] }]));
  const v = WBV[indc][code]; return send(200, JSON.stringify([{ page: 1, lastupdated: '2026-07-01' }, [{ indicator: { id: mode.wrongIndicator ? 'PV.EST' : indc, value: 'name' }, countryiso3code: mode.wrongCountry ? 'CHN' : code, date: indc === 'GOV_WGI_PV.EST' ? '2025' : '2025', value: v }]]));
});
await new Promise(r => server.listen(0, '127.0.0.1', r)); const PORT = server.address().port;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'risk-')), runS = (script, args = [], env = {}) => new Promise(res => { const p = spawn('node', [path.join(ROOT, 'scripts', script), '--dir=' + dir, ...args], { env: { ...process.env, RISK_NOW: new Date(NOW).toISOString(), RSS_ALLOW_HTTP: '1', RISK_HOSTS: '127.0.0.1', RISK_WB_BASE: `http://127.0.0.1:${PORT}/v2`, RISK_UCDP_TEMPLATE: `http://127.0.0.1:${PORT}/downloads/ucdpprio/ucdp-prio-acd-{yy}1-csv.zip`, RISK_GAP_MS: '1', RSS_MAX_TRIES: '1', RSS_RETRY_BASE_MS: '1', ...env } }); let o = ''; p.stdout.on('data', d => o += d); p.stderr.on('data', d => o += d); p.on('close', code => res({ code, out: o })); });
const rd = f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
let r = await runS('fetch-risk-inputs.mjs', ['--verify']); ok(r.code === 0 && !fs.existsSync(path.join(dir, 'risk-inputs.json')) && /nothing was written/.test(r.out), 'fetch verify mode writes nothing');
hits.length = 0; r = await runS('fetch-risk-inputs.mjs'); const ri = rd('risk-inputs.json');
ok(r.code === 0 && ri.ucdp.status === 'ok' && ri.ucdp.version === '26.1' && ri.ucdp.latestYear === 2025 && ri.ucdp.parserVersion === R.sources.ucdp.parserVersion, 'fetch: UCDP read (parserVersion stored); the not-yet-published 27.1 (HTTP 404) was skipped and 26.1 used');
ok(ri.ucdp.conflicts.UKR.length === 1 && ri.ucdp.conflicts.TWN.length === 0, 'fetch: per-country UCDP summary stored');
ok(ri.wgi.USA.value === 0.12 && ri.wgi.USA.year === '2025' && ri.wgi.USA.indicator === 'GOV_WGI_PV.EST' && ri.unemployment.UKR.value === 9.5, 'fetch: World Bank values stored with years');
ok(ri.wgi.TWN.status === 'ok' && ri.wgi.TWN.value === 0.8 && ri.unemployment.TWN.status === 'none' && ri.unemployment.TWN.value === undefined, 'fetch (simulated): Taiwan WGI value stored; Taiwan unemployment reported as none, nothing substituted from another country');
ok(!/ucdpapi|x-ucdp-access-token|api_key/i.test(hits.join(' ')), 'fetch: no UCDP API or key is used');
ok(hits.some(h => h.includes('/indicator/GOV_WGI_PV.EST')) && !hits.some(h => /\/indicator\/PV\.EST/.test(h)), 'fetch: the current WGI code GOV_WGI_PV.EST is requested and the retired code PV.EST never is');
const before = hits.length; r = await runS('fetch-risk-inputs.mjs'); ok(r.code === 0 && hits.length === before && /not requested again/.test(r.out), 'a second run right away makes ZERO requests (recent data is not requested again)');
mode.fail = true; r = await runS('fetch-risk-inputs.mjs', ['--force']); const ri2 = rd('risk-inputs.json');
ok(r.code === 2 && ri2.ucdp.status === 'error' && ri2.ucdp.latestYear === 2025 && ri2.ucdp.conflicts.UKR.length === 1 && ri2.ucdp.fetchedAt === ri.ucdp.fetchedAt, 'every request fails: exit 2, earlier UCDP data kept with its ORIGINAL fetch time and an error recorded');
ok(ri2.wgi.USA.status === 'error' && ri2.wgi.USA.value === 0.12 && ri2.wgi.USA.fetchedAt === ri.wgi.USA.fetchedAt && ri2.lastSuccessAt === ri.lastSuccessAt, 'failed requests keep the earlier World Bank value and lastSuccessAt does not advance');
mode.fail = false; mode.wrongCountry = true; r = await runS('fetch-risk-inputs.mjs', ['--force']); const ri3 = rd('risk-inputs.json');
ok(ri3.wgi.USA.status === 'error' && /Refused/.test(ri3.wgi.USA.error) && ri3.wgi.USA.value === 0.12, 'a reply for a different country is refused (never substituted); earlier value kept');
mode.wrongCountry = false;
mode.wrongIndicator = true; r = await runS('fetch-risk-inputs.mjs', ['--force']); const riW = rd('risk-inputs.json');
ok(riW.wgi.USA.status === 'error' && /Refused: the reply was for indicator PV\.EST/.test(riW.wgi.USA.error) && riW.wgi.USA.value === 0.12, 'a reply for a different indicator (such as the legacy PV.EST) is refused, earlier value kept');
mode.wrongIndicator = false; mode.wgiGone = true; r = await runS('fetch-risk-inputs.mjs', ['--force']); const riG = rd('risk-inputs.json');
ok(riG.wgi.USA.status === 'error' && /indicator was not found/.test(riG.wgi.USA.error) && /metadata lookup/.test(riG.wgi.USA.error), 'simulated "indicator not found": the error is recorded with a metadata-lookup diagnostic, nothing is invented');
ok(riG.wgi.USA.value === 0.12 && riG.wgi.TWN.status === 'error' && riG.unemployment.USA.status === 'ok' && riG.unemployment.TWN.status === 'none', 'while WGI fails: earlier value kept, Taiwan WGI is an error with no invented value, the other series are unaffected');
const bg = await runS('build-risk.mjs'); const fG = rd('risk.json'); ok(fG.countries.USA.security.stale === true && fG.countries.TWN.security.stale === true && fG.countries.TWN.security.facts.some(f => f.value === '0.80'), 'build after a WGI failure: earlier values kept and marked stale (Taiwan too), nothing invented');
mode.wgiGone = false;
{ const old = rd('risk-inputs.json'); for (const k of IDS) old.wgi[k] = { status: 'error', error: 'World Bank error: The indicator was not found. It may have been deleted or archived.', fetchedAt: new Date(NOW).toISOString(), checkedAt: new Date(NOW).toISOString() }; fs.writeFileSync(path.join(dir, 'risk-inputs.json'), JSON.stringify(old)); }
hits.length = 0; r = await runS('fetch-risk-inputs.mjs'); const riM = rd('risk-inputs.json');
ok(hits.filter(h => h.includes('/indicator/GOV_WGI_PV.EST')).length >= 4 && riM.wgi.USA.status === 'ok' && riM.wgi.USA.indicator === 'GOV_WGI_PV.EST', 'cache entries written for the old code are not trusted: they are requested again and replaced, even if recent');
const vr = await runS('fetch-risk-inputs.mjs', ['--verify', '--force']); ok(/metadata lookup: GOV_WGI_PV\.EST = "Political Stability/.test(vr.out), 'verify mode prints what the World Bank metadata says about the indicator');
const rb = await runS('build-risk.mjs'); ok(rb.code === 0 && fs.existsSync(path.join(dir, 'risk.json')), 'build: runs from risk-inputs.json alone (no indicators.json, no briefs) and writes risk.json');
const f1 = rd('risk.json'); ok(f1.status === 'ok' && f1.countries.TWN.security.level === 'Low' && f1.countries.USA.security.stale === false && f1.countries.USA.security.level === 'Low' && f1.countries.USA.security.facts.some(f => f.url.endsWith('GOV_WGI_PV.EST')), 'build: after the refetch USA gets Low from GOV_WGI_PV.EST (fresh); Taiwan gets Low from its own (simulated) WGI value');
fs.writeFileSync(path.join(dir, 'risk-inputs.json'), '{ broken'); r = await runS('build-risk.mjs', [], { RISK_NOW: new Date(NOW + 36e5).toISOString() }); const f2 = rd('risk.json');
ok(r.code === 2 && f2.status === 'error' && /neither/.test(f2.error) && JSON.stringify(f2.countries) === JSON.stringify(f1.countries) && f2.lastSuccessAt === f1.lastSuccessAt, 'build: nothing readable -> exit 2, last successful assessments preserved unchanged and marked status "error"');
fs.writeFileSync(path.join(dir, 'risk-inputs.json'), JSON.stringify(ri)); fs.writeFileSync(path.join(dir, 'indicators.json'), JSON.stringify(ind()));
r = await runS('build-risk.mjs', [], { RISK_NOW: new Date(NOW + 2 * 36e5).toISOString() }); const f3 = rd('risk.json'); ok(r.code === 0 && f3.status === 'ok' && !f3.error && f3.countries.USA.economic.level === 'Low', 'build: recovers on the next good run (error cleared) and uses the existing indicators.json');
const fresh = fs.mkdtempSync(path.join(os.tmpdir(), 'risk-')); const pr = spawn('node', [path.join(ROOT, 'scripts', 'build-risk.mjs'), '--dir=' + fresh]); const code0 = await new Promise(res => pr.on('close', res)); ok(code0 === 2 && !fs.existsSync(path.join(fresh, 'risk.json')), 'build: no inputs and no earlier file: exit 2, nothing written');
server.close();

console.log('\nH. Existing functionality intact');
const md5 = f => crypto.createHash('md5').update(fs.readFileSync(path.join(ROOT, f))).digest('hex');
ok(md5('js/globe.js') === 'c8c9ebaff9c79cd3a2a09d1f0aea9f8b' && md5('css/style.css') === '40e667d30ab897118de04ff89fd785ca', 'the approved globe and style files are byte-for-byte unchanged');
const wf = f => fs.readFileSync(path.join(ROOT, '.github', 'workflows', f), 'utf8');
ok(!/risk/i.test(wf('update-rss.yml')) && !/risk/i.test(wf('update-data.yml')), 'the news and indicator workflows were not changed to include risk steps');
ok(/group: update-data/.test(wf('update-risk.yml')) && /^\s+- cron: '41 5 \* \* \*'/m.test(wf('update-risk.yml')) && /pages: write/.test(wf('update-risk.yml')) && /mode:[\s\S]*default: verify/.test(wf('update-risk.yml')), 'the risk workflow shares the concurrency group, has the owner-enabled schedule (05:41 UTC) and pages: write, and defaults to verify (production workflow)');
const app = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8'); ok(['function paintData', 'function paintNews', 'function brief', 'function articleBlock', 'initGlobe'].every(x => app.includes(x)), 'existing page functions (indicators, news, briefs, globe) are still present');

console.log(`\n${n - bad} of ${n} checks passed${bad ? `, ${bad} FAILED` : ''}. Simulated only: no real UCDP or World Bank request was made and nothing was run on GitHub.`);
process.exit(bad ? 1 : 0);
