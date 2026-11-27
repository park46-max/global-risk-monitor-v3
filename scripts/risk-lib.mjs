// Risk assessment rules as pure functions (no network, no file access, no AI). Rules and thresholds live in data/risk-methodology.mjs.
// An assessment is either { status:'assessed', level } with the facts and rule that justify it, or { status:'insufficient', level:null } with the reason.
// A level is never produced from news headlines or article counts, and missing data never becomes "Low".
import { safeUrl } from './rss-lib.mjs';

const iso = ms => new Date(ms).toISOString();
const fin = v => typeof v === 'number' && Number.isFinite(v);
const dayMs = 864e5;

// ---------- UCDP/PRIO Armed Conflict Dataset (CSV) ----------
export function parseCsv(text) {
  const rows = []; let row = [], f = '', q = false;
  const s = String(text).replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(f); f = ''; if (row.length > 1 || row[0] !== '') rows.push(row); row = []; }
    else f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows;
}
const NEEDED = ['conflict_id', 'location', 'side_a', 'side_b', 'year', 'intensity_level', 'type_of_conflict', 'gwno_a', 'gwno_b', 'gwno_loc'];
const TYPE = { 1: 'extra-systemic', 2: 'interstate', 3: 'internal', 4: 'internationalised internal' }, INCOMP = { 1: 'territory', 2: 'government', 3: 'government and territory' };
const gws = v => String(v == null ? '' : v).split(/[,;\s]+/).filter(Boolean).map(Number).filter(Number.isFinite);

// Throws if the file does not have the expected columns: the layout is never guessed.
export function parseUcdp(text) {
  const t = parseCsv(text); if (t.length < 2) throw new Error('the UCDP file has no data rows');
  const head = t[0].map(h => h.trim().toLowerCase()), miss = NEEDED.filter(c => !head.includes(c));
  if (miss.length) throw new Error('unexpected UCDP file layout: missing column(s) ' + miss.join(', '));
  const ix = Object.fromEntries(head.map((h, i) => [h, i])), rows = [];
  for (const r of t.slice(1)) {
    const year = Number(r[ix.year]), inten = Number(r[ix.intensity_level]);
    if (!Number.isInteger(year) || ![1, 2].includes(inten)) continue;
    const g = k => (ix[k] == null ? '' : r[ix[k]]);
    rows.push({ id: String(r[ix.conflict_id]).trim(), year, intensity: inten, location: String(g('location')).trim(), sideA: String(g('side_a')).trim(), sideB: String(g('side_b')).trim(), type: Number(g('type_of_conflict')), incompatibility: Number(g('incompatibility')),
      loc: gws(g('gwno_loc')), prim: [...gws(g('gwno_a')), ...gws(g('gwno_b'))], supp: [...gws(g('gwno_a_2nd')), ...gws(g('gwno_b_2nd'))] });
  }
  if (!rows.length) throw new Error('the UCDP file has no usable rows (intensity level 1 or 2 with a year)');
  return { latestYear: Math.max(...rows.map(r => r.year)), rows };
}
// Conflicts of the newest year in which a country takes part, per monitored country: { USA: [...], ... } (an empty list = none recorded).
// Each conflict appears ONCE per country (UCDP conflict_id), however many of the roles apply. "roles" keeps the three UCDP roles apart:
//   location   = the country is named in gwno_loc (UCDP: the government with a primary claim to the incompatibility; NOT where the fighting took place)
//   primary    = the country is in gwno_a or gwno_b (a primary party)
//   supporting = the country is in gwno_a_2nd or gwno_b_2nd (a secondary warring party). Which side it supports is deliberately not recorded or shown.
// "role" is the older merged field, kept for compatibility: 'location or primary party' if location or primary is true, otherwise 'supporting party'.
export function summariseUcdp(parsed, countries) {
  const out = {};
  for (const [id, c] of Object.entries(countries)) {
    const byId = new Map();
    for (const r of parsed.rows.filter(r => r.year === parsed.latestYear)) {
      const roles = { location: r.loc.includes(c.gw), primary: r.prim.includes(c.gw), supporting: r.supp.includes(c.gw) };
      if (!roles.location && !roles.primary && !roles.supporting) continue;
      const e = byId.get(r.id);
      if (e) { for (const k of Object.keys(roles)) e.roles[k] = e.roles[k] || roles[k]; e.intensity = Math.max(e.intensity, r.intensity); continue; }   // never count one conflict twice
      byId.set(r.id, { conflictId: r.id, location: r.location, sideA: r.sideA, sideB: r.sideB, intensity: r.intensity, type: TYPE[r.type] || null, incompatibility: INCOMP[r.incompatibility] || null, roles });
    }
    out[id] = [...byId.values()].map(e => ({ ...e, role: e.roles.location || e.roles.primary ? 'location or primary party' : 'supporting party' }))
      .sort((a, b) => b.intensity - a.intensity || a.conflictId.localeCompare(b.conflictId, 'en', { numeric: true }));
  }
  return out;
}
// How one cached conflict entry is described. Separate roles are used ONLY when the entry carries a consistent "roles" object. An entry from an older cache
// (merged role only) is never split by guessing: it stays 'merged'. Result: both | primary | location | merged | supporting.
const hasRoles = c => !!(c && c.roles && typeof c.roles === 'object' && ['location', 'primary', 'supporting'].every(k => typeof c.roles[k] === 'boolean'));
export function roleBucket(c) {
  const lp = hasRoles(c) ? c.roles.location || c.roles.primary : null;
  if (hasRoles(c) && lp === (c.role !== 'supporting party')) return !lp ? 'supporting' : c.roles.location && c.roles.primary ? 'both' : c.roles.primary ? 'primary' : 'location';   // roles must agree with the merged role, else they are ignored
  return c.role === 'supporting party' ? 'supporting' : 'merged';
}
// Two decimals for display only; the cache and the rules keep the full-precision value. "-0.00" is shown as "0.00".
export const fmt2 = v => { const t = Number(v).toFixed(2); return t === '-0.00' ? '0.00' : t; };

// ---------- shared helpers ----------
const mk = o => ({ category: o.category, status: o.status, level: o.level || null, summary: o.summary, rule: o.rule || null, facts: o.facts || [], sources: o.sources || [], referenceDates: o.referenceDates || [],
  lastSuccessAt: o.lastSuccessAt || null, stale: !!o.stale, limitations: o.limitations || [], insufficientReason: o.status === 'insufficient' ? o.reason || 'no-evidence' : undefined, context: o.context || [], contextAsOf: o.contextAsOf || null });
const src = s => ({ name: s.name, publisher: s.publisher, url: s.url, licence: s.licence || null });
const latest = a => a.filter(Boolean).sort().pop() || null;
const isOld = (iso0, now, R) => !iso0 || isNaN(Date.parse(iso0)) || (now - Date.parse(iso0)) / dayMs > R.staleAfterDays;
const LEVEL_FOR = (v, bands) => bands.find(b => v < b.lt);

// Reported context (never used for a level): headlines from the country briefs that carry a matching topic.
export function contextFor(id, briefs, topics, R) {
  const b = briefs && briefs.countries && briefs.countries[id]; if (!b || !Array.isArray(b.developments)) return { items: [], asOf: null };
  const items = b.developments.filter(d => d && d.headline && d.publisher && safeUrl(d.url) && (d.topics || []).some(t => topics.includes(t))).slice(0, R.contextMax)
    .map(d => ({ headline: d.headline, publisher: d.publisher, url: safeUrl(d.url).href, time: d.time || null, timeBasis: d.timeBasis || null }));
  return { items, asOf: b.generatedAt || null };
}

// ---------- SECURITY ----------
export function classifySecurity(id, inputs, R, now, briefs) {
  const S = R.security, U = R.sources.ucdp, W = R.sources.wgi, name = R.countries[id].name, nowYear = new Date(now).getUTCFullYear();
  const ctx = contextFor(id, briefs, ['Security'], R), base = { category: 'security', context: ctx.items, contextAsOf: ctx.asOf };
  const u = inputs && inputs.ucdp, w = inputs && inputs.wgi && inputs.wgi[id];
  const uOk = u && (u.status === 'ok' || u.status === 'error') && fin(u.latestYear) && u.conflicts && Array.isArray(u.conflicts[id]);
  const lim = ['The UCDP file records state-based armed conflicts only; it does not measure interstate tension, crises short of armed conflict, or terrorism and unrest.', 'Headlines are shown as reported context only and played no part in the level.'];
  if (!uOk) return mk({ ...base, status: 'insufficient', reason: 'inputs-unavailable', summary: `No level: the armed-conflict dataset (UCDP/PRIO) is not available in the cache, so no assessment can be made for ${name}. This is not a finding of low risk.`, sources: [src(U)], limitations: [...lim, 'Run the "Update risk assessments" workflow to fetch the dataset.'] });
  if (u.latestYear < nowYear - U.maxDatasetAgeYears) return mk({ ...base, status: 'insufficient', reason: 'dataset-too-old', summary: `No level: the newest year in the cached UCDP file is ${u.latestYear}, too old to describe the current situation.`, sources: [src(U)], referenceDates: [String(u.latestYear)], lastSuccessAt: u.fetchedAt || null, stale: true, limitations: lim });
  const list = u.conflicts[id], ver = u.version ? 'v' + u.version : 'the cached version', facts = [], sources = [src(U)], dates = [String(u.latestYear)], yr = u.latestYear;
  const stale = u.status === 'error' || isOld(u.fetchedAt, now, R), limits = [...lim];
  if (stale) limits.push(u.status === 'error' ? `The latest refresh of the UCDP file failed (${u.error || 'no reason recorded'}); the last successfully fetched data (${u.fetchedAt || 'time unknown'}) is used and marked stale.` : `The UCDP data was last fetched successfully on ${u.fetchedAt || 'an unknown date'}, more than ${R.staleAfterDays} days ago.`);
  // Level-setting entries first, then supporting entries; each conflict is listed once.
  const shown = [...list].sort((a, b) => (roleBucket(a) === 'supporting') - (roleBucket(b) === 'supporting') || b.intensity - a.intensity || String(a.conflictId).localeCompare(String(b.conflictId), 'en', { numeric: true }));
  const ROLE_TEXT = { both: 'location and primary party', primary: 'primary party', location: 'location', supporting: 'supporting party', merged: 'location or primary party (this cache does not separate the two roles)' };
  for (const c of shown) facts.push({ kind: 'observed', label: `UCDP armed conflict ${c.conflictId}, ${yr}`, value: `${c.sideA} vs ${c.sideB}; UCDP "location" field: ${c.location}; ${c.intensity === 2 ? 'war (at least 1,000 battle-related deaths in the year, all parties together)' : 'minor conflict (25 to 999 battle-related deaths in the year, all parties together)'}${c.type ? '; type: ' + c.type : ''}${c.incompatibility ? '; about ' + c.incompatibility : ''}; this country is coded as ${ROLE_TEXT[roleBucket(c)]}${hasRoles(c) && c.roles.supporting && roleBucket(c) !== 'supporting' ? ' (also coded as a supporting party in the same conflict)' : ''}`, year: String(yr), source: U.name, url: U.url });
  if (!list.length) facts.push({ kind: 'observed', label: `UCDP/PRIO armed conflicts involving ${name}, ${yr}`, value: `none recorded in ${ver}`, year: String(yr), source: U.name, url: U.url });
  const top = list.find(c => c.role !== 'supporting party' && c.intensity === 2) ? 'Critical' : list.find(c => c.role !== 'supporting party' && c.intensity === 1) ? 'High' : list.length ? 'Moderate' : null;
  const out = { ...base, facts, sources, referenceDates: dates, lastSuccessAt: u.fetchedAt || null, stale, limitations: limits };
  limits.push(R.notes.conventions, `Annual data: this describes calendar year ${yr}, not events since then.`);
  if (list.length) {
    limits.push(`UCDP intensity describes the conflict as a whole in ${yr} (battle-related deaths of all parties together). It is not a measure of this country's own military contribution or casualties.`,
      'In UCDP, "location" lists the country or countries whose government has a primary claim to the incompatibility; it does not state where the fighting took place.',
      'Each entry is one UCDP conflict record for the year, listed once; several records can concern the same location.');
    if (list.some(c => roleBucket(c) === 'supporting')) limits.push('A supporting party is a state that entered the conflict with troops to actively support a primary party. This dashboard does not state which side.');
    if (list.some(c => roleBucket(c) === 'merged')) limits.push('This cache stores one merged role (location or primary party) for some entries and it is not split here; the separate roles are stored after the next successful refresh of the UCDP file.');
  }
  if (top) {
    const n = {}; for (const c of list) n[roleBucket(c)] = (n[roleBucket(c)] || 0) + 1;
    const PART = { both: 'as location and primary party', primary: 'as primary party', location: 'as location', merged: 'as location or primary party (this cache does not separate the two roles)', supporting: 'as supporting party' };
    const parts = ['both', 'primary', 'location', 'merged', 'supporting'].filter(k => n[k]).map(k => `${n[k]} ${PART[k]}`);
    const lv = top === 'Critical' ? 2 : 1, setBy = list.filter(c => c.role !== 'supporting party' && c.intensity === lv).map(c => c.conflictId);
    return mk({ ...out, status: 'assessed', level: top,
      rule: (top === 'Critical' ? 'S1: location or primary party in a UCDP conflict of intensity 2 (war) in the newest dataset year -> Critical' : top === 'High' ? 'S2: location or primary party in a UCDP conflict of intensity 1 (minor) in the newest dataset year -> High' : 'S3: appears only as a supporting party in a UCDP conflict in the newest dataset year -> Moderate')
        + (setBy.length ? `. Set by conflict ${setBy.join(', ')} (intensity ${lv}, a property of the whole conflict).` : '. No entry as location or primary party.'),
      summary: `${name} is recorded in UCDP/PRIO ${ver} for ${yr} in ${list.length} state-based armed ${list.length === 1 ? 'conflict' : 'conflicts'}: ${parts.join('; ')}.` });
  }
  // no involvement recorded: the World Bank governance indicator decides, if there is a recent value
  const wOk = w && (w.status === 'ok' || w.status === 'error') && w.indicator === W.code && fin(w.value) && /^\d{4}$/.test(String(w.year)) && Number(w.year) >= nowYear - S.wgiMaxAgeYears;
  if (!wOk) {
    const why = w && w.status === 'unsupported' ? `the World Bank does not publish this indicator for ${name} (${w.error || 'no data for this country code'}), and nothing from another country is substituted` : w && w.value != null ? `the World Bank value for ${w.year} is older than ${S.wgiMaxAgeYears} years` : 'no World Bank governance value is available';
    return mk({ ...out, status: 'insufficient', reason: w && w.status === 'unsupported' ? 'no-evidence' : w ? 'no-evidence' : 'inputs-unavailable',
      summary: `No level: UCDP records no state-based armed conflict involving ${name} in ${u.latestYear}, but ${why}. The absence of a recorded conflict is not evidence of low risk.`,
      limitations: [...limits, 'No sovereignty or status position is taken: names and country codes are used exactly as the sources give them.'] });
  }
  facts.push({ kind: 'observed', label: 'Political stability, governance estimate (WGI 2025 revision, about -2.5 to +2.5)', value: fmt2(w.value), year: String(w.year), source: W.name, url: W.url });
  sources.push(src(W)); dates.push(String(w.year));
  const level = w.value >= S.wgiLowFrom ? 'Low' : w.value >= S.wgiModerateFrom ? 'Moderate' : 'High', wStale = w.status === 'error' || isOld(w.fetchedAt, now, R);
  return mk({ ...out, status: 'assessed', level, stale: stale || wStale, lastSuccessAt: latest([u.fetchedAt, w.fetchedAt]), limitations: [...limits, W.note, ...(R.countries[id].securityNote ? [R.countries[id].securityNote] : []), ...(wStale ? [`The World Bank WGI value could not be refreshed recently (${w.error || 'older than ' + R.staleAfterDays + ' days'}); the last successfully fetched value is shown.`] : []), 'The level reflects measured violence and instability perceptions only, not interstate tension.'],
    rule: `S4: no UCDP conflict recorded; WGI estimate ${w.value} (shown as ${fmt2(w.value)}) ${w.value >= S.wgiLowFrom ? '>= ' + S.wgiLowFrom + ' -> Low' : w.value >= S.wgiModerateFrom ? '>= ' + S.wgiModerateFrom + ' and < ' + S.wgiLowFrom + ' -> Moderate' : '< ' + S.wgiModerateFrom + ' -> High'}`,
    summary: `UCDP records no state-based armed conflict involving ${name} in ${u.latestYear}; the World Bank governance estimate for ${w.year} is ${fmt2(w.value)}.` });
}

// ---------- ECONOMIC ----------
export function classifyEconomic(id, inputs, R, now) {
  const E = R.economic, name = R.countries[id].name, nowYear = new Date(now).getUTCFullYear();
  const wbInd = inputs && inputs.indicators && inputs.indicators.countries && inputs.indicators.countries[id], ri = inputs && inputs.riskInputs;
  const pick = { inflation: wbInd && wbInd.indicators && wbInd.indicators[R.sources.inflation.code], growth: wbInd && wbInd.indicators && wbInd.indicators[R.sources.growth.code], unemployment: ri && ri.unemployment && ri.unemployment[id] };
  const facts = [], sources = [], dates = [], limits = [], used = [], fetched = [], usedYears = []; let stale = false, unsupported = false, anyInput = !!(wbInd || (ri && ri.unemployment && ri.unemployment[id]));
  for (const [k, D] of Object.entries(E.dimensions)) {
    const x = pick[k], S = R.sources[k];
    if (x && x.status === 'unsupported') { unsupported = true; continue; }
    if (!x || !fin(x.value) || !/^\d{4}$/.test(String(x.year))) continue;
    if (Number(x.year) < nowYear - E.maxAgeYears) { limits.push(`${D.label}: the newest value is from ${x.year}, older than ${E.maxAgeYears} years, so it was not used.`); continue; }
    const band = LEVEL_FOR(x.value, D.bands), st = x.status === 'error' || isOld(x.fetchedAt, now, R);
    if (st) { stale = true; limits.push(`${D.label}: the latest refresh failed or is old; the last successfully fetched value is shown.`); }
    facts.push({ kind: 'observed', label: D.label, value: fmt2(x.value), year: String(x.year), source: S.name, url: S.url });
    facts.push({ kind: 'interpretation', label: D.label + ': band', value: band.level + (band.why ? ' (' + band.why + ')' : ''), rule: `E: ${D.label} ${x.value} falls in the "${band.level}" band` });
    if (!sources.some(s => s.url === S.url)) sources.push(src(S)); dates.push(String(x.year)); used.push(band.level); fetched.push(x.fetchedAt); usedYears.push([D.label.split(' (')[0].replace(/^GDP/i, 'GDP'), String(x.year)]);
  }
  const lim = [...limits, R.notes.economicScope, R.notes.conventions, R.notes.inflationCrisis, ...(usedYears.length ? ['Annual figures for the reference years shown (the newest value the World Bank had published for each indicator at the last update); they do not describe events since then.'] : []), 'Headlines played no part in the level.'];
  const yrs = [...new Set(usedYears.map(y => y[1]))].sort();
  if (yrs.length > 1) lim.push('Reference years differ between indicators: ' + usedYears.map(y => `${y[0].toLowerCase().replace(/^gdp/, 'GDP')} ${y[1]}`).join(', ') + '.');
  if (used.length < E.minDimensions) {
    const dims = Object.keys(E.dimensions), noValue = dims.every(k => pick[k] && (pick[k].status === 'none' || pick[k].status === 'unsupported'));
    const why = unsupported ? `the World Bank API does not publish data for ${name}'s code, and nothing from another country is substituted` : !anyInput ? 'the indicator cache has no entry for it'
      : noValue && !used.length ? `the World Bank returned no value for any of the ${dims.length} indicators for ${name}'s code (at least ${E.minDimensions} recent values are required), and nothing from another country is substituted` : `only ${used.length} of the ${dims.length} indicators have a recent value (at least ${E.minDimensions} are required)`;
    const note = R.countries[id].economicNote && noValue ? [R.countries[id].economicNote] : [];
    return mk({ category: 'economic', status: 'insufficient', reason: !anyInput ? 'inputs-unavailable' : 'no-evidence', summary: `No level: ${why}. Missing data is not treated as low risk.`, facts, sources, referenceDates: dates, lastSuccessAt: latest(fetched), stale, limitations: [...lim.filter(l => l !== R.notes.inflationCrisis && l !== R.notes.conventions), ...note] });
  }
  const level = R.levels[Math.max(...used.map(l => R.levels.indexOf(l)))];
  return mk({ category: 'economic', status: 'assessed', level, rule: `E: the overall level is the worst band among the ${used.length} available indicators (bands in data/risk-methodology.mjs)`,
    summary: `Based on ${used.length} World Bank macro indicators (${facts.filter(f => f.kind === 'observed').map(f => f.label.split(' (')[0].toLowerCase().replace(/^gdp/, 'GDP')).join(', ')}); the highest band reached is ${level}. ${yrs.length === 1 ? 'Reference year: ' + yrs[0] : 'Reference years differ: ' + usedYears.map(y => `${y[0].toLowerCase().replace(/^gdp/, 'GDP')} ${y[1]}`).join(', ')}. Annual data, not current events.`, facts, sources, referenceDates: dates, lastSuccessAt: latest(fetched), stale, limitations: lim });
}

// ---------- DIPLOMATIC ----------
export function classifyDiplomatic(id, briefs, R) {
  const name = R.countries[id].name, ctx = contextFor(id, briefs, ['Diplomacy', 'Sanctions and trade'], R);
  return mk({ category: 'diplomatic', status: 'insufficient', reason: 'method', context: ctx.items, contextAsOf: ctx.asOf,
    summary: `No level for ${name}: no free, verifiable, machine-readable dataset of diplomatic tension that can be reused legally was found, and counting articles, sanctions headlines or keywords does not measure diplomatic risk.`,
    limitations: ['Headlines below are reports by publishers, shown only as context. They are not verified here and no level is derived from them.', 'A manually sourced assessment can be added in data/countries.js and is shown there instead.'] });
}

// ---------- the whole file ----------
const validIndicators = j => j && typeof j === 'object' && j.countries && typeof j.countries === 'object';
const validRiskInputs = j => j && typeof j === 'object' && j.schema === 1 && j.ucdp !== undefined;
export function buildRisk({ riskInputs, indicators, briefs, now, R }) {
  const ri = validRiskInputs(riskInputs) ? riskInputs : null, ind = validIndicators(indicators) ? indicators : null;
  if (!ri && !ind) throw new Error('neither the risk-input cache nor the indicator cache could be read');
  const inputs = { riskInputs: ri, indicators: ind }, countries = {};
  for (const id of Object.keys(R.countries)) countries[id] = { name: R.countries[id].name, security: classifySecurity(id, { ucdp: ri && ri.ucdp, wgi: ri && ri.wgi }, R, now, briefs), economic: classifyEconomic(id, inputs, R, now), diplomatic: classifyDiplomatic(id, briefs, R) };
  // A level of Critical means UCDP records a war in this country or involving it as a primary party. The economic card then says plainly that its few indicators do not capture that.
  for (const c of Object.values(countries)) if (c.security.level === 'Critical' && c.economic.status === 'assessed') c.economic.limitations.push('UCDP records this country as a location of or primary party in a war in the newest dataset year. The macro indicators above may be incomplete or may not capture war damage, so read this level with particular caution.');
  return { schema: 1, status: 'ok', method: 'Fixed, documented rules on public datasets. No AI, no paid service. Headlines are context only.', methodologyVersion: R.methodologyVersion, generatedAt: iso(now), lastSuccessAt: iso(now), checkedAt: iso(now),
    inputs: { riskInputs: ri ? { status: 'ok', checkedAt: ri.checkedAt || null, lastSuccessAt: ri.lastSuccessAt || null } : { status: 'missing' }, indicators: ind ? { status: 'ok', checkedAt: ind.checkedAt || null, lastSuccessAt: ind.lastSuccessAt || null } : { status: 'missing' }, briefs: briefs && briefs.generatedAt ? { generatedAt: briefs.generatedAt } : { status: 'missing' } }, countries };
}
export const markFailed = (prev, error, now) => ({ ...prev, status: 'error', error: String(error), checkedAt: iso(now) });
