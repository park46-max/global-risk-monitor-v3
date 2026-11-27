// Rule-based country briefs from the cached news. Pure functions: no network, no file access, no AI. Rules: data/brief-rules.mjs.
import { buildMatchers, safeUrl } from './rss-lib.mjs';
import { compileRules, refreshItems } from './relevance-lib.mjs';

const iso = ms => new Date(ms).toISOString();
const utc = s => s.slice(0, 16).replace('T', ' ') + ' UTC';
const when = i => { const t = i.published ? ['published', i.published] : i.seenByGdelt ? ['first seen by GDELT', i.seenByGdelt] : i.firstSeenAt ? ['first cached', i.firstSeenAt] : null; return t && !isNaN(Date.parse(t[1])) ? { basis: t[0], at: new Date(t[1]).toISOString() } : null; };
const OK_LEVEL = new Set(['country', 'institution']);   // a summary-only match is never used for a brief

// Checks one cache file's shape and age. status: 'ok' | 'missing' | 'invalid'.
export function describeInput(name, json, { now, staleAfterHours }) {
  if (json == null) return { status: 'missing', items: 0 };
  if (typeof json !== 'object' || json.schema !== 1 || !Array.isArray(json.items)) return { status: 'invalid', items: 0 };
  const feeds = Object.values(json.feeds || {}), failedFeeds = feeds.filter(f => f.status !== 'ok').length;
  const last = json.lastSuccessAt && !isNaN(Date.parse(json.lastSuccessAt)) ? json.lastSuccessAt : null;
  return { status: 'ok', items: json.items.length, lastSuccessAt: last, checkedAt: json.checkedAt || null, failedFeeds, feeds: feeds.length,
    stale: !last || (now - Date.parse(last)) / 36e5 > staleAfterHours };
}

// Turns the raw cached articles of all sources into one list of grouped, attributable reports inside the time window.
// An article is dropped (and counted) if it lacks a headline, a publisher, a usable link or any time. It is never cited without a source.
export function prepareReports(caches, { now, matchers, compiled, R }) {
  const stat = { read: 0, noSource: 0, noTime: 0, outsideWindow: 0, noCountry: 0, routineNotices: 0, offTopic: 0, incidentalMentions: 0, grouped: 0 }, items = [];
  const cutoff = now - R.windowHours * 36e5;
  for (const [via, json] of Object.entries(caches)) {
    if (!json || !Array.isArray(json.items)) continue;
    for (const raw of json.items) {
      stat.read++;
      const u = safeUrl(raw && raw.url);
      if (!raw || !raw.title || !String(raw.title).trim() || !raw.publisher || !u) { stat.noSource++; continue; }
      const it = JSON.parse(JSON.stringify(raw)); it.url = u.href; it.title = String(it.title).trim(); it._via = via;
      const t = when(it); if (!t) { stat.noTime++; continue; }
      if (Date.parse(t.at) < cutoff || Date.parse(t.at) > now + 36e5) { stat.outsideWindow++; continue; }
      it._time = t; items.push(it);
    }
  }
  // Same judgement as the page and the news pipelines: country match from the headline, topics, routine-notice filter, duplicate groups.
  const r = refreshItems(items, { matchers, compiled });
  stat.noCountry = r.stats.droppedNoMatch; stat.routineNotices = r.stats.filteredNotices; stat.offTopic = r.stats.filteredOffTopic; stat.incidentalMentions = r.stats.incidentalMentions; stat.grouped = r.stats.groupedDuplicates;
  return { reports: r.items.filter(i => !i.filtered), stat };
}

const tierOf = r => (r.source && r.source.tier) || 'unassessed';
const byRank = (a, b) => ((b.relevance && b.relevance.score) || 0) - ((a.relevance && a.relevance.score) || 0) || (tierOf(a) === 'established' ? 0 : 1) - (tierOf(b) === 'established' ? 0 : 1) || Date.parse(b._time.at) - Date.parse(a._time.at) || String(a.url).localeCompare(String(b.url));
const plural = (n, one, many) => n === 1 ? one : many;
const list = a => a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
const refs = ns => ns.map(n => `[${n}]`).join('');

// One country's brief. `reports` = prepared, grouped reports (all countries). Returns a plain JSON-able object.
export function buildCountryBrief(id, reports, ctx) {
  const { R, now, inputs } = ctx, name = R.names[id] || id;
  // Reports that name the country only in passing (role 'incidental', see data/relevance-rules.mjs rule 4) are counted but not used.
  const named = reports.filter(r => r.matches && r.matches[id] && OK_LEVEL.has(r.matches[id].level)), passing = named.filter(r => r.matches[id].role === 'incidental').length;
  const own = named.filter(r => r.matches[id].role !== 'incidental').sort(byRank);
  const listed = own.slice(0, R.maxReports);
  const limitations = [];
  for (const [k, inp] of Object.entries(inputs)) {
    if (inp.status === 'missing') limitations.push(`The ${k} cache file is not available${k === 'rss' ? ' (normal while no publisher RSS feed is enabled)' : ''}, so it contributed nothing.`);
    else if (inp.status === 'invalid') limitations.push(`The ${k} cache file could not be read, so it contributed nothing.`);
    else {
      if (inp.stale) limitations.push(`The ${k} cache was last updated successfully ${inp.lastSuccessAt ? utc(inp.lastSuccessAt) : 'never'}, which is older than ${R.staleAfterHours[k]} hours or unknown.`);
      if (inp.failedFeeds) limitations.push(`${inp.failedFeeds} of ${inp.feeds} ${k} feeds failed on their latest refresh; their reports are cached from earlier.`);
    }
  }
  const base = { generatedAt: iso(now), window: { hours: R.windowHours, from: iso(now - R.windowHours * 36e5), to: iso(now) }, notice: R.notice };
  if (!listed.length) {
    return { ...base, status: 'unavailable', reportsFound: 0, overview: null, developments: [], why: null, sources: [],
      limitations: [`No cached headline from the last ${R.windowHours} hours names ${name} (or its capital or government) in a way the matching rules accept. This describes the cached feeds only; it does not mean nothing happened.`,
        ...(passing ? [`${passing} ${plural(passing, 'report names', 'reports name')} ${name} only in passing (another country comes first and there is no security, diplomacy or sanctions wording), so ${plural(passing, 'it was', 'they were')} not used.`] : []), ...limitations] };
  }
  // Source list: every listed report, each followed by the other outlets that carried the same headline.
  const sources = []; const num = new Map();
  for (const r of listed) {
    const n = sources.length + 1; num.set(r, n);
    sources.push({ n, title: r.title, publisher: r.publisher, url: r.url, time: r._time.at, timeBasis: r._time.basis, via: r.via || null, sourceLabel: tierOf(r) });
    for (const v of (r.variants || [])) { const u = safeUrl(v.url); if (u && v.publisher) sources.push({ n: sources.length + 1, title: r.title, publisher: v.publisher, url: u.href, time: (v.published || v.seenByGdelt || null), timeBasis: v.published ? 'published' : v.seenByGdelt ? 'first seen by GDELT' : null, sourceLabel: v.tier || 'unassessed', duplicateOf: n }); }
  }
  const alsoNums = r => sources.filter(s => s.duplicateOf === num.get(r)).map(s => s.n);
  const topicCount = {}; for (const r of listed) for (const t of (r.relevance && r.relevance.topics) || []) (topicCount[t.label] = topicCount[t.label] || []).push(r);
  const pubs = new Set(sources.map(s => s.publisher));
  const from = listed.map(r => r._time.at).sort()[0], to = listed.map(r => r._time.at).sort().pop();
  const tp = Object.entries(topicCount).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])).map(([l, rs]) => `${l.toLowerCase()} ${rs.length}`);
  const overview = { kind: 'fact', text: `${own.length} distinct ${plural(own.length, 'report', 'reports')} naming ${name} (or its capital or government) ${plural(own.length, 'was', 'were')} found in the cached headlines for the last ${R.windowHours} hours` +
    (own.length > listed.length ? `; the ${listed.length} highest-ranked ${plural(listed.length, 'is', 'are')} used below` : '') +
    `. They span ${utc(from)} to ${utc(to)} and come from ${pubs.size} ${plural(pubs.size, 'outlet', 'outlets')}. Reports with topic keywords (a report can have several): ${tp.length ? tp.join(', ') : 'none'}.` +
    (passing ? ` A further ${passing} ${plural(passing, 'report names', 'reports name')} ${name} only in passing and ${plural(passing, 'is', 'are')} not used.` : ''), evidence: listed.map(r => num.get(r)) };

  const developments = listed.slice(0, R.maxDevelopments).map(r => ({ kind: 'reporting', n: num.get(r), headline: r.title, publisher: r.publisher, url: r.url, time: r._time.at, timeBasis: r._time.basis,
    matched: { level: r.matches[id].level, terms: r.matches[id].terms }, topics: ((r.relevance && r.relevance.topics) || []).map(t => t.label), alsoReportedBy: alsoNums(r) }));

  const unassessed = listed.filter(r => tierOf(r) === 'unassessed').length;
  if (unassessed * 2 > listed.length) limitations.push(`${unassessed} of the ${listed.length} listed ${plural(listed.length, 'report comes', 'reports come')} from outlets the source policy has not assessed. That is not a finding that they are unreliable. Source labels describe the outlet, not whether a headline was fact-checked.`);
  // "Why it matters": each sentence is produced by one named rule from the listed reports and cites them. Fewer than minReportsForWhy reports: none.
  let why = null;
  if (listed.length < R.minReportsForWhy) limitations.push(`Only ${listed.length} ${plural(listed.length, 'report was', 'reports were')} found; at least ${R.minReportsForWhy} are needed before any analytical sentence is written.`);
  else {
    const out = [];
    for (const [label, rs] of Object.entries(topicCount).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))) {
      if (rs.length < R.topicMinReports) continue;
      const words = [...new Set(rs.flatMap(r => r.relevance.topics.filter(t => t.label === label).flatMap(t => t.terms)))].slice(0, 4);
      out.push({ rule: 'topic:' + label.toLowerCase().replace(/\W+/g, '-'), kind: 'analysis', evidence: rs.map(r => num.get(r)),
        text: `${rs.length} of the ${listed.length} listed ${plural(listed.length, 'report', 'reports')} use ${label.toLowerCase()} wording (${words.join(', ')}) ${refs(rs.map(r => num.get(r)))}. This shows what the headlines are about, not what happened or what comes next.` });
    }
    const cross = listed.filter(r => Object.entries(r.matches).filter(([k, m]) => k !== id && OK_LEVEL.has(m.level)).length && (r.relevance && r.relevance.topics.length));
    if (cross.length) {
      const others = [...new Set(cross.flatMap(r => Object.keys(r.matches).filter(k => k !== id && OK_LEVEL.has(r.matches[k].level)).map(k => R.names[k] || k)))];
      out.push({ rule: 'two-countries', kind: 'analysis', evidence: cross.map(r => num.get(r)),
        text: `${cross.length} listed ${plural(cross.length, 'report', 'reports')} with topic keywords also ${plural(cross.length, 'names', 'name')} ${list(others)} ${refs(cross.map(r => num.get(r)))}. A headline that names two countries does not show how they are connected.` });
    }
    const multi = listed.filter(r => alsoNums(r).length);
    if (multi.length) out.push({ rule: 'several-outlets', kind: 'analysis', evidence: multi.flatMap(r => [num.get(r), ...alsoNums(r)]),
      text: `${multi.length} listed ${plural(multi.length, 'headline was', 'headlines were')} carried by more than one outlet ${refs(multi.map(r => num.get(r)))}. The same headline appearing in several places is not independent verification.` });
    if (out.length) why = out; else limitations.push('No analytical rule had enough supporting reports, so nothing is written under "Why it matters".');
  }
  return { ...base, status: listed.length < R.minReportsForWhy || !why ? 'limited' : 'ok', reportsFound: own.length, overview, developments, why, sources, limitations };
}

// All countries, plus rules for keeping an earlier brief. prev = the previous briefs.json (or null).
// Throws if NO input cache could be read: the caller then keeps the previous file and marks it stale.
export function buildAll({ caches, prev, now, R, countryTerms, rules }) {
  const inputs = {};
  for (const k of ['gdelt', 'rss']) inputs[k] = describeInput(k, caches[k], { now, staleAfterHours: R.staleAfterHours[k] });
  if (!Object.values(inputs).some(i => i.status === 'ok')) throw new Error('no readable news cache (' + Object.entries(inputs).map(([k, v]) => k + ': ' + v.status).join(', ') + ')');
  const matchers = buildMatchers(countryTerms), compiled = compileRules(rules);
  const { reports, stat } = prepareReports({ gdelt: caches.gdelt, rss: caches.rss }, { now, matchers, compiled, R });
  const countries = {};
  for (const id of Object.keys(countryTerms)) {
    let b = buildCountryBrief(id, reports, { R, now, inputs });
    const old = prev && prev.countries && prev.countries[id];
    if (b.status === 'unavailable' && old && (old.status === 'ok' || old.status === 'limited') && old.generatedAt && (now - Date.parse(old.generatedAt)) / 36e5 <= R.carryMaxHours) {
      b = { ...old, carriedForward: { reason: `The latest cache has no usable report for this country (${stat.read} cached items inspected), so the earlier brief is kept and marked stale.`, checkedAt: iso(now) } };
    }
    countries[id] = b;
  }
  return { schema: 1, status: 'ok', method: 'Fixed keyword rules on cached headlines. No AI, no paid service.', rulesVersion: R.rulesVersion, generatedAt: iso(now), lastSuccessAt: iso(now), checkedAt: iso(now), inputs, itemStats: stat, countries };
}

// The previous file, kept after a failed update: nothing is regenerated, it is only marked.
export function markFailed(prev, error, now) { return { ...prev, status: 'error', error: String(error), checkedAt: iso(now) }; }
