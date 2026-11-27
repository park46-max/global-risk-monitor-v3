// Stage 8B-1 tests (wording, role separation, reference-year disclosure, WGI display, safe cache migration, unchanged classifications).
// SIMULATED unless stated: a local mock server stands in for ucdp.uu.se and api.worldbank.org. No real request is made and nothing runs on GitHub. Run: node tests/test-risk-8b1.mjs
// The "PRODUCTION SNAPSHOT" below holds VALUES copied by hand from the production cache files the project owner supplied on 2026-11-27 (risk-inputs.json, indicators.json, risk.json).
// It is not a copy of those files. To also test against the real files, run:  RISK_PROD_DIR=/path/to/folder node tests/test-risk-8b1.mjs  (a folder holding the three production caches).
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { RISK as R } from '../data/risk-methodology.mjs';
import { PUBLISHERS } from '../data/rss-sources.mjs';
import { parseUcdp, summariseUcdp, roleBucket, fmt2, classifySecurity, classifyEconomic, buildRisk } from '../scripts/risk-lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let n = 0, bad = 0; const ok = (c, m) => { n++; if (!c) { bad++; console.log('  FAIL: ' + m); } };
const clone = o => JSON.parse(JSON.stringify(o));
const IDS = ['USA', 'CHN', 'RUS', 'UKR', 'TWN'];
// ---- PRODUCTION SNAPSHOT (values observed in production on 2026-11-27; see the header) ----
const SNAP = {"generatedAt":"2026-11-27T06:38:44.901Z","ucdp":{"status":"ok","version":"26.1","latestYear":2025,"conflicts":{"USA":[{"conflictId":"337","location":"Somalia","sideA":"Government of Somalia","sideB":"Al-Shabaab","intensity":2,"type":"internationalised internal","incompatibility":"government","role":"supporting party"},{"conflictId":"13641","location":"Nigeria","sideA":"Government of Nigeria","sideB":"IS","intensity":2,"type":"internationalised internal","incompatibility":"territory","role":"supporting party"},{"conflictId":"14609","location":"Iran, Israel","sideA":"Government of Iran","sideB":"Government of Israel","intensity":2,"type":"interstate","incompatibility":"government","role":"supporting party"},{"conflictId":"259","location":"Iraq","sideA":"Government of Iraq","sideB":"IS","intensity":1,"type":"internationalised internal","incompatibility":"government","role":"supporting party"},{"conflictId":"13604","location":"Syria","sideA":"Government of Syria","sideB":"IS","intensity":1,"type":"internationalised internal","incompatibility":"territory","role":"supporting party"},{"conflictId":"14197","location":"Somalia","sideA":"Government of Somalia","sideB":"IS","intensity":1,"type":"internationalised internal","incompatibility":"territory","role":"supporting party"},{"conflictId":"16099","location":"United Kingdom, United States of America, Yemen (North Yemen)","sideA":"Government of United Kingdom, Government of United States of America","sideB":"Government of Yemen (North Yemen)","intensity":1,"type":"interstate","incompatibility":"territory","role":"location or primary party"}],"CHN":[{"conflictId":"416","location":"Central African Republic","sideA":"Government of Central African Republic","sideB":"CMSPR, CPC, CPC-F","intensity":1,"type":"internationalised internal","incompatibility":"government","role":"supporting party"}],"RUS":[{"conflictId":"11347","location":"Mali","sideA":"Government of Mali","sideB":"JNIM","intensity":2,"type":"internationalised internal","incompatibility":"government","role":"supporting party"},{"conflictId":"13243","location":"Russia (Soviet Union), Ukraine","sideA":"Government of Russia (Soviet Union)","sideB":"Government of Ukraine","intensity":2,"type":"interstate","incompatibility":"government and territory","role":"location or primary party"},{"conflictId":"416","location":"Central African Republic","sideA":"Government of Central African Republic","sideB":"CMSPR, CPC, CPC-F","intensity":1,"type":"internationalised internal","incompatibility":"government","role":"supporting party"},{"conflictId":"14113","location":"Mali","sideA":"Government of Mali","sideB":"IS","intensity":1,"type":"internationalised internal","incompatibility":"territory","role":"supporting party"},{"conflictId":"16038","location":"Mali","sideA":"Government of Mali","sideB":"FLA","intensity":1,"type":"internationalised internal","incompatibility":"government and territory","role":"supporting party"}],"UKR":[{"conflictId":"13243","location":"Russia (Soviet Union), Ukraine","sideA":"Government of Russia (Soviet Union)","sideB":"Government of Ukraine","intensity":2,"type":"interstate","incompatibility":"government and territory","role":"location or primary party"}],"TWN":[]},"fetchedAt":"2026-11-21T03:15:43.287Z"},"wgi":{"USA":{"indicator":"GOV_WGI_PV.EST","status":"ok","value":-0.3020818,"year":"2025","fetchedAt":"2026-11-21T03:15:43.287Z"},"CHN":{"indicator":"GOV_WGI_PV.EST","status":"ok","value":0.022475,"year":"2025","fetchedAt":"2026-11-21T03:15:43.287Z"},"RUS":{"indicator":"GOV_WGI_PV.EST","status":"ok","value":-0.9449586,"year":"2025","fetchedAt":"2026-11-21T03:15:43.287Z"},"UKR":{"indicator":"GOV_WGI_PV.EST","status":"ok","value":-0.3337994,"year":"2025","fetchedAt":"2026-11-21T03:15:43.287Z"},"TWN":{"indicator":"GOV_WGI_PV.EST","status":"ok","value":0.9986707,"year":"2025","fetchedAt":"2026-11-21T03:15:43.287Z"}},"unemployment":{"USA":{"indicator":"SL.UEM.TOTL.ZS","status":"ok","value":4.198,"year":"2025","fetchedAt":"2026-11-21T03:15:43.287Z"},"CHN":{"indicator":"SL.UEM.TOTL.ZS","status":"ok","value":4.615,"year":"2025","fetchedAt":"2026-11-21T03:15:43.287Z"},"RUS":{"indicator":"SL.UEM.TOTL.ZS","status":"ok","value":2.133,"year":"2025","fetchedAt":"2026-11-21T03:15:43.287Z"},"UKR":{"indicator":"SL.UEM.TOTL.ZS","status":"ok","value":9.834,"year":"2021","fetchedAt":"2026-11-21T03:15:43.287Z"},"TWN":{"indicator":"SL.UEM.TOTL.ZS","status":"none","fetchedAt":"2026-11-21T03:15:43.287Z"}},"indicators":{"USA":{"status":"ok","indicators":{"NY.GDP.MKTP.KD.ZG":{"status":"ok","value":2.16138195623856,"year":"2025","fetchedAt":"2026-11-27T08:47:47.108Z"},"FP.CPI.TOTL.ZG":{"status":"ok","value":2.94952520485207,"year":"2024","fetchedAt":"2026-11-27T08:47:47.381Z"}}},"CHN":{"status":"ok","indicators":{"NY.GDP.MKTP.KD.ZG":{"status":"ok","value":4.95994886240992,"year":"2025","fetchedAt":"2026-11-27T08:47:48.610Z"},"FP.CPI.TOTL.ZG":{"status":"ok","value":0.0595646916565402,"year":"2025","fetchedAt":"2026-11-27T08:47:48.885Z"}}},"RUS":{"status":"ok","indicators":{"NY.GDP.MKTP.KD.ZG":{"status":"ok","value":1.00117656925738,"year":"2025","fetchedAt":"2026-11-27T08:47:50.003Z"},"FP.CPI.TOTL.ZG":{"status":"ok","value":8.71986939402666,"year":"2025","fetchedAt":"2026-11-27T08:47:50.277Z"}}},"UKR":{"status":"ok","indicators":{"NY.GDP.MKTP.KD.ZG":{"status":"ok","value":1.82152376756284,"year":"2025","fetchedAt":"2026-11-27T08:47:55.511Z"},"FP.CPI.TOTL.ZG":{"status":"ok","value":12.7303341026902,"year":"2025","fetchedAt":"2026-11-27T08:47:55.779Z"}}},"TWN":{"status":"ok","indicators":{"NY.GDP.MKTP.KD.ZG":{"status":"none","value":null,"year":null,"fetchedAt":"2026-11-27T08:47:58.581Z"},"FP.CPI.TOTL.ZG":{"status":"none","value":null,"year":null,"fetchedAt":"2026-11-27T08:47:58.852Z"}}}},"expected":{"USA":{"security":{"status":"assessed","level":"High","referenceDates":["2025"]},"economic":{"status":"assessed","level":"Low","referenceDates":["2024","2025","2025"]},"diplomatic":{"status":"insufficient","level":null,"referenceDates":[]}},"CHN":{"security":{"status":"assessed","level":"Moderate","referenceDates":["2025"]},"economic":{"status":"assessed","level":"Low","referenceDates":["2025","2025","2025"]},"diplomatic":{"status":"insufficient","level":null,"referenceDates":[]}},"RUS":{"security":{"status":"assessed","level":"Critical","referenceDates":["2025"]},"economic":{"status":"assessed","level":"Moderate","referenceDates":["2025","2025","2025"]},"diplomatic":{"status":"insufficient","level":null,"referenceDates":[]}},"UKR":{"security":{"status":"assessed","level":"Critical","referenceDates":["2025"]},"economic":{"status":"assessed","level":"High","referenceDates":["2025","2025"]},"diplomatic":{"status":"insufficient","level":null,"referenceDates":[]}},"TWN":{"security":{"status":"assessed","level":"Low","referenceDates":["2025","2025"]},"economic":{"status":"insufficient","level":null,"referenceDates":[]},"diplomatic":{"status":"insufficient","level":null,"referenceDates":[]}}},"cardKeys":{"assessed":["category","context","contextAsOf","facts","lastSuccessAt","level","limitations","referenceDates","rule","sources","stale","status","summary"],"insufficient":["category","context","contextAsOf","facts","insufficientReason","lastSuccessAt","level","limitations","referenceDates","rule","sources","stale","status","summary"],"top":["checkedAt","countries","generatedAt","inputs","lastSuccessAt","method","methodologyVersion","schema","status"]}};
const PROTECTED_MD5 = {
 ".github/workflows/update-data.yml": "881ec1134f3a1619305817c05efa6a29",
 ".github/workflows/update-risk.yml": "e223da77124f96890777f57be392bf5c",
 ".github/workflows/update-rss.yml": "e3e18101cef4c7775ddbada20c1a67b3",
 "js/app.js": "0daf9b450c4085e45eb5ca5556998378",
 "js/globe.js": "c8c9ebaff9c79cd3a2a09d1f0aea9f8b",
 "css/style.css": "12f56d7b5e47d5558c7990ce3f9fc319",
 "index.html": "b8a6b822be6a4d046c51f1ad3a6c6240",
 "scripts/build-risk.mjs": "f778556aa2645f372d8ad29b82cf956b",
 "scripts/fetch-data.mjs": "e149936bf523152dfbc20188ab2dd899",
 "scripts/fetch-gdelt-files.mjs": "e104a8b08daae814cb4f28576d016559",
 "scripts/fetch-rss.mjs": "4b71492740396506ffa1b9ed7f7f2a04",
 "scripts/http-lib.mjs": "3a98000ab966157de414f8440e33a5b5",
 "scripts/robots-lib.mjs": "40256961e299e294af0845ff215da9c2",
 "scripts/rss-lib.mjs": "9932def6574a43e7dd88016e0ecdcd1d",
 "scripts/secondary-lib.mjs": "cdce2d0d2187a9d63d89e73e5f14cae2",
 "scripts/brief-lib.mjs": "351f804d31cbaad8b975cbc991161b6a",
 "scripts/build-briefs.mjs": "6a2c1faafbb0b3aadd7aee29b66035ae",
 "scripts/relevance-lib.mjs": "8db0f8f4070264082589ce22bfc84109",
 "scripts/zip-lib.mjs": "65680c4dc0906e4ba1578b527b76b569",
 "data/rss-sources.mjs": "074d062a1c2df547c05785d6f516f590",
 "data/source-types.mjs": "db0533f9f6d4192cb1a030a08cf065c9",
 "data/countries.js": "ee84554063af7e1ffcc3ebab76730f46",
 "data/brief-rules.mjs": "24593fd8816dab57914fad8bfa752135",
 "data/country-terms.mjs": "e61f36a8444f8e218ea1b8b25d695567",
 "data/relevance-rules.mjs": "bfc85f42f0e053f9376a46f953a8ada4",
 "data/source-quality.mjs": "447b799a07ed3b6b00c206f2dd37ef71"
};
const NOW = Date.parse(SNAP.generatedAt);
const prodInputs = () => ({ riskInputs: { schema: 1, checkedAt: SNAP.generatedAt, lastSuccessAt: SNAP.ucdp.fetchedAt, ucdp: clone(SNAP.ucdp), wgi: clone(SNAP.wgi), unemployment: clone(SNAP.unemployment) }, indicators: { schema: 2, checkedAt: '2026-11-23T05:42:44.222Z', lastSuccessAt: '2026-11-23T05:42:52.179Z', countries: clone(SNAP.indicators) }, briefs: null });
const build = (inp = prodInputs(), now = NOW) => buildRisk({ ...inp, now, R });

console.log('\nA. Production regression: every classification is unchanged (snapshot of production values)');
{
  const out = build();
  for (const id of IDS) for (const k of ['security', 'economic', 'diplomatic']) {
    const e = SNAP.expected[id][k], g = out.countries[id][k];
    ok(g.status === e.status && g.level === e.level && JSON.stringify(g.referenceDates) === JSON.stringify(e.referenceDates), `${id} ${k}: ${e.level || 'Insufficient data'} (${e.status}), reference dates ${e.referenceDates.join(',') || 'none'} unchanged`);
  }
  ok(out.schema === 1 && out.methodologyVersion === 3 && JSON.stringify(Object.keys(out).sort()) === JSON.stringify(SNAP.cardKeys.top), 'risk.json: schema stays 1, methodologyVersion is 3 (Stage 8B-2), same top-level fields as production');
  ok(IDS.every(id => ['security', 'economic', 'diplomatic'].every(k => { const c = out.countries[id][k], want = [...(c.status === 'assessed' ? SNAP.cardKeys.assessed : SNAP.cardKeys.insufficient), ...(k === 'diplomatic' ? [] : ['profile'])].sort(); return JSON.stringify(Object.keys(JSON.parse(JSON.stringify(c))).sort()) === JSON.stringify(want); })), 'every card has the same fields as the production cards; Stage 8B-2 adds only `profile` (security and economic cards)');
  const sec = id => out.countries[id].security, eco = id => out.countries[id].economic;
  ok(/^S2/.test(sec('USA').rule) && /conflict 16099/.test(sec('USA').rule) && /^S3/.test(sec('CHN').rule) && /^S1/.test(sec('RUS').rule) && /conflict 13243/.test(sec('RUS').rule) && /^S1/.test(sec('UKR').rule) && /^S4/.test(sec('TWN').rule), 'rules triggered: USA S2 (conflict 16099), CHN S3, RUS S1 (13243), UKR S1, TWN S4');
  ok(/Government of Yemen \(North Yemen\)/.test(sec('USA').facts.find(f => /16099/.test(f.label)).value), 'dataset names are shown exactly as UCDP gives them');
  const v = (id, re) => eco(id).facts.filter(f => f.kind === 'observed').map(f => f.value + '/' + f.year).join(' ');
  ok(v('USA') === '2.95/2024 2.16/2025 4.20/2025' && v('UKR') === '12.73/2025 1.82/2025' && v('RUS') === '8.72/2025 1.00/2025 2.13/2025' && v('CHN') === '0.06/2025 4.96/2025 4.62/2025', 'economic values and years: USA 2024/2025/2025, UKR 2 indicators, RUS, CHN (two decimals)');
  ok(eco('UKR').limitations.some(l => /Unemployment.*2021.*older than 3 years/.test(l)), 'Ukraine: the 2021 unemployment value is disclosed as excluded');
  ok(eco('TWN').status === 'insufficient' && /returned no value for any of the 3 indicators/.test(eco('TWN').summary) && /not treated as low risk/.test(eco('TWN').summary), 'Taiwan economic: Insufficient, because the World Bank returned no value (not "low risk")');
  const prod = process.env.RISK_PROD_DIR;
  if (prod && fs.existsSync(path.join(prod, 'risk.json'))) {
    const rd = f => JSON.parse(fs.readFileSync(path.join(prod, f), 'utf8')), old = rd('risk.json');
    const o2 = buildRisk({ riskInputs: rd('risk-inputs.json'), indicators: rd('indicators.json'), briefs: null, now: Date.parse(old.generatedAt), R });
    ok(IDS.every(id => ['security', 'economic', 'diplomatic'].every(k => old.countries[id][k].level === o2.countries[id][k].level && old.countries[id][k].status === o2.countries[id][k].status && old.countries[id][k].stale === o2.countries[id][k].stale)), 'REAL production files (RISK_PROD_DIR): all 15 levels, statuses and stale flags unchanged');
  } else console.log('  (RISK_PROD_DIR not set: the real production files were not used in this run)');
}

console.log('\nB. Old cache (merged role only): no role details are invented');
{
  const out = build(), s = id => out.countries[id].security, all = IDS.map(id => s(id).summary + ' ' + s(id).facts.map(f => f.value).join(' '));
  ok(/1 as location or primary party \(this cache does not separate the two roles\); 6 as supporting party/.test(s('USA').summary), 'USA: "1 location or primary party (not separated), 6 supporting" from the old cache');
  ok(/1 as location or primary party \(this cache does not separate the two roles\); 4 as supporting party/.test(s('RUS').summary) && /1 as supporting party/.test(s('CHN').summary), 'Russia 1 + 4 and China 1 supporting; counts are of unique conflict records');
  ok(!all.some(t => /as (location and primary party|primary party|location)[;.]/.test(t) || /coded as (location and primary party|primary party|location)(;|$| \()/.test(t.replace(/location or primary party/g, ''))), 'no summary or fact claims "primary party" or "location" separately for an old-cache entry');
  ok(['USA', 'RUS', 'UKR'].every(id => s(id).limitations.some(l => /stores one merged role/.test(l))) && !s('CHN').limitations.some(l => /stores one merged role/.test(l)), 'the merged-role limitation is shown exactly where an entry is merged');
  ok(!/the location of or a primary party in/.test(JSON.stringify(out)), 'the old wording "the location of or a primary party in N conflicts" no longer appears anywhere');
}

console.log('\nC. Separate roles from the raw UCDP fields (mock CSV)');
const HEAD = 'conflict_id,location,side_a,side_a_id,side_a_2nd,side_b,side_b_id,side_b_2nd,incompatibility,territory_name,year,intensity_level,cumulative_intensity,type_of_conflict,start_date,start_prec,start_date2,start_prec2,ep_end,ep_end_date,ep_end_prec,gwno_a,gwno_a_2nd,gwno_b,gwno_b_2nd,gwno_loc,region,version';
const row = (id, loc, a, b, year, inten, type, ga, ga2, gb, gb2, gl) => `${id},${loc},"${a}",1,,"${b}",2,,1,,${year},${inten},0,${type},2000-01-01,1,,,0,,,${ga},"${ga2}",${gb},"${gb2}","${gl}",1,26.1`;
const CSV = [HEAD,
  row(101, 'Locland', 'Government of Locland', 'Rebels A', 2025, 2, 3, 998, '', 1000, '', '710, 998'),            // CHN = location ONLY (gwno_loc), not a party
  row(102, 'Primland', 'Government of China', 'Rebels B', 2025, 1, 3, 710, '', 1001, '', '997'),                  // CHN = primary party ONLY (gwno_a), location elsewhere
  row(103, 'Overland', 'Government of United States of America', 'Government of Overland', 2025, 1, 2, 2, '', 996, '', '2, 996'), // USA = location AND primary party (overlap)
  row(104, 'Suppland', 'Government of Suppland', 'Rebels C', 2025, 2, 4, 995, '369', 1002, '', '995'),            // UKR = supporting ONLY (gwno_a_2nd)
  row(105, 'Bothland', 'Government of Russia', 'Rebels D', 2025, 1, 4, 365, '365', 1003, '', '365'),              // RUS = primary + location + also listed as supporting
  row(106, 'Dupland', 'Government of Dupland', 'Rebels E', 2025, 1, 3, 994, '', 1004, '', '994'),                // first record of conflict 106 (nobody monitored)
  row(107, 'Twoparts', 'Government of China', 'Rebels F', 2025, 1, 3, 710, '', 1005, '', '710'),                  // conflict 107, first dyad record, intensity 1
  row(107, 'Twoparts', 'Government of China', 'Rebels G', 2025, 2, 3, 710, '', 1006, '', '710'),                  // conflict 107 AGAIN (second record): must count once
  row(108, 'Oldland', 'Government of Oldland', 'Rebels H', 2024, 2, 3, 993, '', 1007, '', '713')                   // older year: ignored (TWN appears only in 2024)
].join('\n') + '\n';
const parsed = parseUcdp(CSV), conf = summariseUcdp(parsed, R.countries), byId = (c, id) => (conf[c] || []).find(x => x.conflictId === id);
ok(parsed.latestYear === 2025, 'newest year 2025; the 2024-only row is ignored');
ok(byId('CHN', '101') && JSON.stringify(byId('CHN', '101').roles) === '{"location":true,"primary":false,"supporting":false}' && byId('CHN', '101').role === 'location or primary party', 'location-only: roles {location} and the old merged role field is kept');
ok(JSON.stringify(byId('CHN', '102').roles) === '{"location":false,"primary":true,"supporting":false}', 'primary-only: roles {primary}');
ok(JSON.stringify(byId('USA', '103').roles) === '{"location":true,"primary":true,"supporting":false}' && conf.USA.length === 1, 'overlap: location AND primary in one entry, counted once');
ok(JSON.stringify(byId('UKR', '104').roles) === '{"location":false,"primary":false,"supporting":true}' && byId('UKR', '104').role === 'supporting party', 'supporting-only: roles {supporting}, merged role "supporting party"');
ok(JSON.stringify(byId('RUS', '105').roles) === '{"location":true,"primary":true,"supporting":true}' && byId('RUS', '105').role === 'location or primary party', 'all three flags can be true; the merged role stays "location or primary party"');
ok(conf.CHN.filter(c => c.conflictId === '107').length === 1 && byId('CHN', '107').intensity === 2 && conf.CHN.length === 3, 'unique counting: two records of conflict 107 give ONE entry (highest intensity kept)');
ok(conf.TWN.length === 0, 'Taiwan: nothing recorded in 2025 (the 2024 row is not used)');
ok(Object.values(conf).flat().every(c => ['location', 'primary', 'supporting'].every(k => typeof c.roles[k] === 'boolean') && 'role' in c), 'every entry carries roles and the legacy role');
const cache = (u = conf) => ({ schema: 1, checkedAt: SNAP.generatedAt, lastSuccessAt: SNAP.generatedAt, ucdp: { status: 'ok', version: '26.1', latestYear: 2025, fetchedAt: SNAP.generatedAt, conflicts: u }, wgi: clone(SNAP.wgi), unemployment: clone(SNAP.unemployment) });
const secOf = (id, u = conf) => classifySecurity(id, { ucdp: cache(u).ucdp, wgi: cache(u).wgi }, R, NOW, null);
{
  const chn = secOf('CHN'), usa = secOf('USA'), ukr = secOf('UKR'), rus = secOf('RUS');
  ok(chn.level === 'Critical' && /3 state-based armed conflicts: 1 as location and primary party; 1 as primary party; 1 as location\./.test(chn.summary), 'CHN summary counts location-only, primary-only and overlapping entries separately (3 unique conflicts)');
  ok(/Set by conflict (101, 107|107, 101)/.test(chn.rule), 'the rule names every conflict that sets the level');
  ok(/1 as location and primary party\./.test(usa.summary) && usa.level === 'High' && /S2/.test(usa.rule), 'USA: overlapping location and primary role is one "location and primary party" entry; High (S2)');
  ok(ukr.level === 'Moderate' && /1 as supporting party\./.test(ukr.summary) && !/primary party in|location of/.test(ukr.summary) && /No entry as location or primary party/.test(ukr.rule), 'UKR: supporting only -> Moderate, never described as primary');
  ok(rus.level === 'High' && /1 as location and primary party/.test(rus.summary) && rus.facts[0].value.includes('also coded as a supporting party in the same conflict'), 'a country that is both primary and supporting in one conflict is counted once and the overlap is stated');
  ok(!/supports (side|the government|rebels)|on the side of|backs/i.test(JSON.stringify(ukr)), 'no side is inferred for a supporting party');
  ok(ukr.limitations.some(l => /does not state which side/.test(l)) && usa.limitations.some(l => /does not state where the fighting took place/.test(l)) && usa.limitations.some(l => /not a measure of this country's own military contribution or casualties/.test(l)), 'limitations: no side, "location" is not where fighting took place, intensity is not the country\'s own contribution');
  ok(usa.facts.every(f => /UCDP "location" field/.test(f.value) && /all parties together/.test(f.value)), 'facts call it the UCDP "location" field and say the death counts are for all parties together');
  ok(usa.limitations.some(l => R.notes.conventions === l) && usa.limitations.some(l => /Annual data: this describes calendar year 2025/.test(l)), 'conventions and annual-data limitations present');
  // levels from the same data with and without the separate roles are identical (rules unchanged)
  const stripped = Object.fromEntries(Object.entries(conf).map(([k, v]) => [k, v.map(({ roles, ...rest }) => rest)]));
  ok(IDS.every(id => secOf(id).level === secOf(id, stripped).level), 'the level is the same with and without the separate roles for every country');
  ok(secOf('USA', stripped).summary.includes('does not separate the two roles'), 'without roles the text says the roles are not separated');
  // inconsistent roles are ignored, not trusted
  const bogus = { ...conf, USA: [{ ...conf.USA[0], role: 'supporting party', roles: { location: true, primary: true, supporting: false } }] };
  ok(roleBucket(bogus.USA[0]) === 'supporting' && roleBucket({ ...conf.USA[0], roles: { location: false, primary: false, supporting: false } }) === 'merged' && roleBucket({ ...conf.USA[0], roles: { location: 'yes' } }) === 'merged', 'malformed or contradictory roles fall back to the merged role, never to a guess');
}

console.log('\nD. WGI display, rounding and boundaries');
{
  ok(fmt2(0.9986707) === '1.00' && fmt2(-0.3020818) === '-0.30' && fmt2(-0.0001) === '0.00' && fmt2(4.198) === '4.20' && fmt2(1.00117656925738) === '1.00', 'two decimals: 0.9986707 -> 1.00, -0.3020818 -> -0.30, -0.0001 -> 0.00 (never "-0.00"), 4.198 -> 4.20');
  const wg = v => { const i = prodInputs().riskInputs; i.ucdp.conflicts.TWN = []; i.wgi.TWN = { indicator: R.sources.wgi.code, status: 'ok', value: v, year: '2025', fetchedAt: i.ucdp.fetchedAt }; return classifySecurity('TWN', { ucdp: i.ucdp, wgi: i.wgi }, R, NOW, null); };
  const t = wg(0.9986707); ok(t.level === 'Low' && t.facts.find(f => /WGI/.test(f.label)).value === '1.00' && /0\.9986707/.test(t.rule) && /1\.00/.test(t.summary), 'Taiwan: full precision 0.9986707 in the rule, 1.00 on display');
  ok(wg(0).level === 'Low' && wg(-0.0001).level === 'Moderate' && wg(-0.0001).facts.find(f => /WGI/.test(f.label)).value === '0.00' && /-0\.0001/.test(wg(-0.0001).rule), 'boundary 0.0: -0.0001 is Moderate, displayed 0.00, and the rule line shows the full value');
  ok(wg(-1).level === 'Moderate' && wg(-1.0001).level === 'High' && /-1\.0001/.test(wg(-1.0001).rule), 'boundary -1.0: -1 Moderate, -1.0001 High');
  const inp = prodInputs(), before = JSON.stringify(inp); build(inp); ok(JSON.stringify(inp) === before && inp.riskInputs.wgi.TWN.value === 0.9986707, 'the full-precision value in the cache input is never altered by display formatting');
  const tw = build().countries.TWN.security;
  ok(tw.limitations.some(l => /does not measure cross-strait tension/.test(l)) && tw.limitations.some(l => /politically motivated violence, including civil unrest and terrorism/.test(l)) && tw.limitations.some(l => /90 percent confidence intervals/.test(l)), 'Taiwan Low: states it does not measure cross-strait tension; WGI definition and confidence-interval note present');
  ok(!/absence of violence\/terrorism/.test(JSON.stringify(build())), 'the old WGI label "absence of violence/terrorism" is gone');
}

console.log('\nE. Economic wording, reference years and missing data');
{
  const e = id => build().countries[id].economic;
  ok(/Reference years differ: inflation 2024, GDP growth 2025, unemployment 2025\. Annual data, not current events\./.test(e('USA').summary) && e('USA').limitations.some(l => /Reference years differ between indicators/.test(l)), 'USA: differing reference years are stated in the summary and limitations');
  ok(/Reference year: 2025\./.test(e('CHN').summary) && !e('CHN').limitations.some(l => /Reference years differ/.test(l)), 'China: one reference year stated, no "differ" note');
  ok(IDS.every(id => !/"Low" means only/.test(JSON.stringify(e(id)))), 'the old "Low means only" sentence is gone from every card (it appeared on Moderate and High cards)');
  ok(['USA', 'CHN', 'RUS', 'UKR'].every(id => e(id).limitations.includes(R.notes.conventions) && e(id).limitations.includes(R.notes.inflationCrisis) && e(id).limitations.includes(R.notes.economicScope)), 'assessed economic cards carry: project conventions, the Reinhart-Rogoff note and what is not measured');
  ok(/corresponds to the inflation-crisis convention/.test(R.notes.inflationCrisis) && /does not validate the project/.test(R.notes.inflationCrisis) && !/validat(es|ed) the Critical/.test(R.notes.inflationCrisis.replace('does not validate', '')), 'the Reinhart-Rogoff 20% limit is described as a crisis convention, not a validation of the Critical level');
  ok(e('TWN').limitations.some(l => /do not list "Taiwan, China" as a separate country/.test(l) && /not evidence of low risk/.test(l)) && e('TWN').limitations.some(l => /WGI political stability series is published for Taiwan/.test(l)) && !e('TWN').limitations.includes(R.notes.inflationCrisis), 'Taiwan economic: the World Bank coverage statement is quoted, says WGI is published for Taiwan, and carries no threshold notes');
  const t = (mut) => { const i = prodInputs(); mut(i); return classifyEconomic('USA', i, R, NOW); };
  ok(t(i => { i.riskInputs.unemployment.USA.year = '2022'; }).limitations.some(l => /2022.*older than 3 years/.test(l)) && t(i => { i.riskInputs.unemployment.USA.year = '2022'; }).status === 'assessed', 'a 2022 value (older than 3 years in 2026) is excluded and disclosed, two indicators still suffice');
  ok(t(i => { i.riskInputs.unemployment.USA.year = '2022'; i.indicators.countries.USA.indicators['FP.CPI.TOTL.ZG'].value = null; }).status === 'insufficient', 'one remaining indicator -> Insufficient data');
  ok(t(i => { i.riskInputs.unemployment.USA.year = '2023'; }).facts.filter(f => f.kind === 'observed').length === 3, 'a 2023 value is exactly three years old and is still used (rule unchanged)');
  const odd = classifyEconomic('USA', (() => { const i = prodInputs(); i.indicators.countries.USA.indicators['FP.CPI.TOTL.ZG'].status = 'none'; i.indicators.countries.USA.indicators['FP.CPI.TOTL.ZG'].value = null; return i; })(), R, NOW);
  ok(odd.status === 'assessed' && /2 World Bank macro indicators/.test(odd.summary) && /not an assessment of overall economic risk/.test(odd.limitations.join(' ')), 'a missing indicator: two used, stated, with the scope limitation');
}

console.log('\nF. Generated text safety');
{
  const out = build(), outRoles = (() => { const i = prodInputs(); i.riskInputs.ucdp.conflicts = conf; return build(i); })();
  for (const [label, o] of [['production snapshot', out], ['separate-roles fixture', outRoles]]) {
    const texts = IDS.flatMap(id => ['security', 'economic', 'diplomatic'].flatMap(k => { const c = o.countries[id][k]; return [c.summary, c.rule || '', ...c.limitations, ...c.facts.map(f => f.value + ' ' + f.label + ' ' + (f.rule || ''))]; })).join(' | ').toLowerCase();
    const hit = R.bannedInText.filter(b => texts.includes(b)); if (hit.length) console.log('    banned:', hit);
    ok(!hit.length, label + ': no causal, forecast or verdict wording in any summary, rule, limitation or fact');
    ok(!/real[- ]time|predict|forecast|early warning|internationally validated/.test(texts.replace(/not a forecast/g, '')), label + ': nothing calls the assessment predictive, real-time or validated');
  }
}

console.log('\nG. Cache migration with a mock UCDP server (SIMULATED network)');
function zip(name, data) {
  const T = new Uint32Array(256).map((_, k) => { let c = k; for (let j = 0; j < 8; j++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = b => { let c = 0xFFFFFFFF; for (const x of b) c = T[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const raw = Buffer.from(data), body = zlib.deflateRawSync(raw), nm = Buffer.from(name), cr = crc(raw);
  const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(cr, 14); lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nm.length, 26);
  const local = Buffer.concat([lh, nm, body]), ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(cr, 16); ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(0, 42);
  const cd = Buffer.concat([ch, nm]), e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(1, 8); e.writeUInt16LE(1, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(local.length, 16);
  return Buffer.concat([local, cd, e]);
}
let body = CSV, status = 200; const hits = [];
const server = http.createServer((q, s) => { hits.push(q.url); if (q.url.includes('-271-')) { s.writeHead(404); return s.end('nope'); } if (status !== 200) { s.writeHead(status); return s.end('down'); } s.writeHead(200, { 'content-type': 'application/zip' }); s.end(zip('ucdp-prio-acd-261.csv', body)); });
await new Promise(r => server.listen(0, '127.0.0.1', r)); const PORT = server.address().port;
const real = () => hits.filter(h => h.includes('.zip') && !h.includes('-271-')), dayAgo = d => new Date(NOW - d * 864e5).toISOString();
const mkDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mig-'));
const runS = (dir, script, args = [], env = {}) => new Promise(res => { const p = spawn('node', [path.join(ROOT, 'scripts', script), '--dir=' + dir, ...args], { env: { ...process.env, RISK_NOW: new Date(NOW).toISOString(), RSS_ALLOW_HTTP: '1', RISK_HOSTS: '127.0.0.1', RISK_WB_BASE: `http://127.0.0.1:${PORT}/v2`, RISK_UCDP_TEMPLATE: `http://127.0.0.1:${PORT}/downloads/ucdpprio/ucdp-prio-acd-{yy}1-csv.zip`, RISK_GAP_MS: '1', RSS_MAX_TRIES: '1', RSS_RETRY_BASE_MS: '1', ...env } }); let o = ''; p.stdout.on('data', d => o += d); p.stderr.on('data', d => o += d); p.on('close', code => res({ code, out: o })); });
// An OLD-format cache: the same conflicts, merged role only, no parserVersion. World Bank entries are recent so they are not requested again.
const oldCache = () => { const u = clone(cache().ucdp); u.fetchedAt = dayAgo(3); u.checkedAt = dayAgo(3); for (const l of Object.values(u.conflicts)) for (const c of l) delete c.roles; delete u.parserVersion;
  const wgi = Object.fromEntries(IDS.map(i => [i, { indicator: R.sources.wgi.code, status: 'ok', value: 0.5, year: '2025', fetchedAt: dayAgo(1), checkedAt: dayAgo(1) }])), unemployment = Object.fromEntries(IDS.map(i => [i, { indicator: R.sources.unemployment.code, status: 'ok', value: 4, year: '2025', fetchedAt: dayAgo(1), checkedAt: dayAgo(1) }]));
  return { schema: 1, generatedAt: dayAgo(3), checkedAt: dayAgo(3), lastSuccessAt: dayAgo(1), sources: {}, ucdp: u, wgi, unemployment }; };
const put = (dir, o) => fs.writeFileSync(path.join(dir, 'risk-inputs.json'), JSON.stringify(o, null, 1)), rd = (dir, f = 'risk-inputs.json') => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')), raw = dir => fs.readFileSync(path.join(dir, 'risk-inputs.json'), 'utf8');
{
  // 1. verify mode on an old cache: requests UCDP, writes NOTHING
  let d = mkDir(); put(d, oldCache()); const b0 = raw(d); hits.length = 0; let r = await runS(d, 'fetch-risk-inputs.mjs', ['--verify']);
  ok(r.code === 0 && real().length === 1 && raw(d) === b0 && /one-time re-read/i.test(r.out) && /nothing was written/.test(r.out), 'verify mode: reports the one-time re-read, makes one request, leaves the cache file byte-for-byte unchanged');
  // 2. real migration
  hits.length = 0; r = await runS(d, 'fetch-risk-inputs.mjs'); let c = rd(d);
  ok(r.code === 0 && real().length === 1 && hits.every(h => h.includes('/downloads/')) && c.ucdp.status === 'ok' && c.ucdp.parserVersion === R.sources.ucdp.parserVersion && Object.values(c.ucdp.conflicts).flat().every(x => x.roles), 'migration: one download, roles stored for every entry, parserVersion written, only UCDP requested (World Bank entries were recent)');
  ok(JSON.stringify(Object.fromEntries(Object.entries(c.ucdp.conflicts).map(([k, v]) => [k, v.map(x => x.conflictId + '|' + x.intensity + '|' + x.role).sort()]))) === JSON.stringify(Object.fromEntries(Object.entries(oldCache().ucdp.conflicts).map(([k, v]) => [k, v.map(x => x.conflictId + '|' + x.intensity + '|' + x.role).sort()]))), 'migration: same conflicts, intensities and merged roles as the old cache (only the roles were added)');
  // 3. no repeated download after success
  const b1 = raw(d); hits.length = 0; r = await runS(d, 'fetch-risk-inputs.mjs'); ok(r.code === 0 && hits.length === 0 && /not requested again/.test(r.out) && raw(d) === b1, 'after a successful migration the next run makes ZERO requests and changes nothing');
  // 4. a cache already at the current parser version but older than 30 days is refreshed as before
  const c30 = clone(c); c30.ucdp.fetchedAt = dayAgo(31); put(d, c30); hits.length = 0; r = await runS(d, 'fetch-risk-inputs.mjs'); ok(real().length === 1 && !/one-time re-read/i.test(r.out), 'a current-format cache older than 30 days is refreshed by the normal 30-day rule (no migration message)');
}
const failCase = async (label, setup, errRe) => {
  const d = mkDir(), oc = oldCache(); put(d, oc); const before = clone(oc.ucdp); setup(); hits.length = 0;
  const r = await runS(d, 'fetch-risk-inputs.mjs'), c = rd(d); status = 200; body = CSV;
  ok(c.ucdp.status === 'error' && errRe.test(c.ucdp.error) && JSON.stringify(c.ucdp.conflicts) === JSON.stringify(before.conflicts) && c.ucdp.fetchedAt === before.fetchedAt && c.ucdp.latestYear === 2025 && !c.ucdp.parserVersion, label + ': the earlier conflicts and fetch time are kept unchanged, the error is recorded, no parserVersion is claimed');
  const rb = await runS(d, 'build-risk.mjs'), f = rd(d, 'risk.json'); ok(rb.code === 0 && f.countries.USA.security.level === 'High' && f.countries.USA.security.stale === true && f.countries.USA.security.limitations.some(l => /latest refresh of the UCDP file failed/.test(l)), label + ': the assessment still uses the kept data (USA High), marked stale with the failure');
  return r;
};
await failCase('server down (HTTP 503)', () => { status = 503; }, /503|HTTP/i);
await failCase('unexpected file layout', () => { body = 'a,b\n1,2\n'; }, /unexpected UCDP file layout/);
await failCase('HTML instead of a CSV', () => { body = '<html>maintenance</html>'; }, /UCDP|layout|rows/i);
await failCase('no usable rows', () => { body = HEAD + '\n'; }, /no data rows|no usable rows/);
await failCase('result is older than the cached year', () => { body = [HEAD, row(900, 'Elsewhere', 'Government of X', 'Rebels', 2024, 2, 3, 990, '', 1000, '', '990')].join('\n') + '\n'; }, /older than the cached year/);
await failCase('same version, different conflicts', () => { body = CSV.replace(/^103,.*$/m, '103,Overland,"Government of United States of America",1,,"Government of Overland",2,,1,,2025,2,0,2,2000-01-01,1,,,0,,,2,"",996,"","2, 996",1,26.1'); }, /differs from the cached conflicts/);
{
  // a first-ever fetch (no earlier cache) that fails writes an explicit error, never an empty "ok" result
  const d = mkDir(); status = 503; const r = await runS(d, 'fetch-risk-inputs.mjs'); status = 200; const c = rd(d);
  ok(c.ucdp.status === 'error' && c.ucdp.conflicts === null && c.ucdp.fetchedAt === null, 'no earlier cache and a failed download: status error with no conflicts (never an empty "ok" result)');
}
server.close();

console.log('\nH. Protected functionality');
{
  const md5 = f => crypto.createHash('md5').update(fs.readFileSync(path.join(ROOT, f))).digest('hex');
  const changed = Object.entries(PROTECTED_MD5).filter(([f, h]) => md5(f) !== h).map(([f]) => f);
  if (changed.length) console.log('    changed:', changed.join(', '));
  ok(changed.length === 0, `${Object.keys(PROTECTED_MD5).length} protected files (workflows, js/app.js, globe, CSS, index.html, GDELT, World Bank and RSS scripts, RSS and country data, briefs) are byte-for-byte unchanged since Stage 7C (js/app.js, css/style.css and index.html are pinned to their Stage 9 versions; except js/app.js, changed on purpose in Stage 8B-2, and the production update-risk.yml)`);
  ok(PUBLISHERS.length > 0 && PUBLISHERS.every(p => p.enabled === false && p.termsChecked === null), 'every publisher RSS source is still disabled with termsChecked null');
  const wf = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'update-risk.yml'), 'utf8'); ok(/^\s+- cron: '41 5 \* \* \*'/m.test(wf) && /pages: write/.test(wf) && /contents: write/.test(wf) && /default: verify/.test(wf), 'the risk workflow is the production copy (schedule 05:41 UTC, contents and pages write) and defaults to verify');
  ok(R.diplomatic.levelsComputed === false && IDS.every(id => build().countries[id].diplomatic.level === null && build().countries[id].diplomatic.status === 'insufficient'), 'diplomatic stays Insufficient data for all five countries');
  const lib = fs.readFileSync(path.join(ROOT, 'scripts', 'risk-lib.mjs'), 'utf8') + fs.readFileSync(path.join(ROOT, 'scripts', 'fetch-risk-inputs.mjs'), 'utf8');
  ok(!/api[_-]?key|access[_-]?token|openai|anthropic|\bfetch\(/i.test(lib.replace(/UCDP API needs[^\n]*/g, '').replace(/The UCDP API is NOT used[^\n]*/g, '')) && !/\b(weights?|composite|scores?)\b/i.test(fs.readFileSync(path.join(ROOT, 'data', 'risk-methodology.mjs'), 'utf8').replace(/composite of perception-based surveys/g, '')), 'no key, token, AI call, weight, composite or score appears in the risk code or methodology');
}

console.log(`\n${n - bad} of ${n} checks passed${bad ? `, ${bad} FAILED` : ''}. Simulated only: no real UCDP or World Bank request was made and nothing was run on GitHub.`);
process.exit(bad ? 1 : 0);
