#!/usr/bin/env node
// Reads publisher RSS feeds and writes data/cache/news-rss.json for the website. No dependencies, no API keys. Node 18+.
//
//   node scripts/fetch-rss.mjs --verify              check EVERY feed (enabled or not): reachable? valid? how many items and dates? Writes nothing.
//   node scripts/fetch-rss.mjs --fetch               update the cache from publishers that are enabled AND have a termsChecked date (default mode)
//   node scripts/fetch-rss.mjs --verify --only=bbc   limit to one publisher id (also works with --fetch)
//   node scripts/fetch-rss.mjs --out=some/dir        write the cache somewhere else
//
// Exit codes: 0 = at least one feed worked, 2 = every feed that was tried failed, 3 = fetch mode but no publisher is enabled.
//
// Rules: never invent anything. Only headline, link, publisher, date and country matches are stored (never summaries or article text).
// A failed feed keeps its previously cached articles and records the error. One feed failing never stops the others.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseFeed, buildItems, mergeItems, buildMatchers, extractFeedLinks, ParseError } from './rss-lib.mjs';
import { compileRules, refreshItems, capItems, termSummary } from './relevance-lib.mjs';
import { createClient } from './http-lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = n => (process.argv.find(a => a.startsWith('--' + n + '=')) || '').split('=')[1];
const flag = n => process.argv.includes('--' + n);
const VERIFY = flag('verify'), ONLY = arg('only');
const OUT = path.resolve(arg('out') || path.join(ROOT, 'data', 'cache'));
const FILE = path.join(OUT, 'news-rss.json');
const CONFIG = process.env.RSS_CONFIG ? path.resolve(process.env.RSS_CONFIG) : path.join(ROOT, 'data', 'rss-sources.mjs');
const NOW = process.env.RSS_NOW ? Date.parse(process.env.RSS_NOW) : Date.now();   // RSS_NOW exists only so tests can fix the clock
const { PUBLISHERS, COUNTRY_TERMS, SETTINGS: S0 } = await import(pathToFileURL(CONFIG).href);
const num = (v, d) => (v === undefined || v === '' ? d : Number(v));
const S = { ...S0,
  timeoutMs: num(process.env.RSS_TIMEOUT_MS, S0.timeoutMs), maxTries: num(process.env.RSS_MAX_TRIES, S0.maxTries),
  retryBaseMs: num(process.env.RSS_RETRY_BASE_MS, S0.retryBaseMs), gapMs: num(process.env.RSS_GAP_MS, S0.gapMs) };
const UA = `GlobalRiskMonitor/3 (personal non-commercial dashboard; ${process.env.GITHUB_REPOSITORY ? 'https://github.com/' + process.env.GITHUB_REPOSITORY : 'contact via the project repository'})`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const iso = t => new Date(t).toISOString();
const matchers = buildMatchers(COUNTRY_TERMS);
const { RULES } = await import(pathToFileURL(process.env.RELEVANCE_RULES ? path.resolve(process.env.RELEVANCE_RULES) : path.join(ROOT, 'data', 'relevance-rules.mjs')).href);
const compiled = compileRules(RULES);
const hasDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

const client = createClient({ ua: UA, timeoutMs: S.timeoutMs, maxTries: S.maxTries, retryBaseMs: S.retryBaseMs, maxBytes: S0.maxBytes, allowHttp: process.env.RSS_ALLOW_HTTP === '1' });
const RSS_ACCEPT = 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.1';
// All addresses go through scripts/http-lib.mjs: https only, publisher feed hosts only, every redirect checked before it is requested.
const request = (feed, pub, cond, log) => client.request(feed.url, { hosts: pub.feedHosts, who: pub.name, cond, accept: RSS_ACCEPT }, log);

const summaryLines = [];
const say = l => { console.log(l); };
const publishers = PUBLISHERS.filter(p => !ONLY || p.id === ONLY);
if (ONLY && !publishers.length) { say('Unknown publisher id: ' + ONLY); process.exit(1); }
const writeSummary = () => { if (process.env.GITHUB_STEP_SUMMARY) { try { fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryLines.join('\n') + '\n'); } catch {} } };

// ======================= VERIFY =======================
if (VERIFY) {
  say('VERIFY MODE: nothing is written. Each feed is requested once. This checks that a feed is reachable and readable. It does NOT check the publisher\'s usage terms.\n');
  summaryLines.push('## RSS feed verification', '', '| Feed | Result | Items | Newest item | Undated | Off-site links | Entries matching a country |', '|---|---|---|---|---|---|---|');
  let ok = 0, total = 0, first = true;
  for (const pub of publishers) {
    if (pub.discoverUrl) {   // the publisher has no known feed addresses yet: look for them on its feeds page (one request, nothing is enabled by this)
      try {
        const r = await client.request(pub.discoverUrl, { hosts: pub.feedHosts, who: pub.name, accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1' }, say);
        const links = extractFeedLinks(r.text, pub.discoverUrl, pub.feedHosts);
        say(`${pub.name}: feed discovery on ${pub.discoverUrl}: ${links.length} candidate address(es)`);
        links.slice(0, 40).forEach(l => say('    candidate: ' + l.url + '   (' + l.why + ')'));
        summaryLines.push(`### ${pub.name}: feed discovery`, links.length ? links.slice(0, 40).map(l => `- ${l.url} (${l.why})`).join('\n') : 'No candidate feed address was found on the page.', '');
        say('    These are only candidates. Add the ones that verify to data/rss-sources.mjs, then run verify again.');
      } catch (e) { say(`${pub.name}: feed discovery failed: ${e.message}`); summaryLines.push(`### ${pub.name}: feed discovery failed`, String(e.message), ''); }
      first = false;
    }
    const termsOk = pub.enabled && hasDate(pub.termsChecked);
    say(`${pub.name}  [${termsOk ? 'enabled, terms checked ' + pub.termsChecked : pub.enabled ? 'enabled but NO termsChecked date: will be refused' : 'switched off'}]`);
    for (const feed of pub.feeds) {
      total++;
      if (!first) await sleep(S.gapMs + Math.random() * 1000); first = false;
      let line, row;
      try {
        const r = await request(feed, pub, null, say);
        const entries = parseFeed(r.text);
        const { items, stat } = buildItems(entries, { publisher: pub, feedId: feed.id, now: NOW, matchers });
        const valid = entries.length - stat.noTitle - stat.badLink - stat.offHost;
        if (valid < 1) throw new ParseError(entries.length ? 'the feed parsed but no entry had a usable title and link on the publisher\'s own website' : 'the feed parsed but contains no entries');
        const dates = entries.map(e => Date.parse(e.dateRaw)).filter(t => !isNaN(t) && t <= NOW + 3600e3);
        const newest = dates.length ? iso(Math.max(...dates)) : 'none';
        const per = Object.keys(COUNTRY_TERMS).map(id => id + ' ' + items.filter(i => i.matches[id]).length).join(', ');
        ok++;
        line = `  OK   ${feed.id.padEnd(13)} HTTP ${r.status}${r.hops ? ' (' + r.hops + ' redirect' + (r.hops > 1 ? 's' : '') + ')' : ''}  entries=${entries.length} usable=${valid} newest=${newest} undated=${stat.undated} off-site=${stat.offHost}  matches: ${per}`;
        row = `| ${feed.id} | OK (HTTP ${r.status}) | ${valid} | ${newest} | ${stat.undated} | ${stat.offHost} | ${per} |`;
        const sample = items.slice(0, 2).map(i => `        sample: "${i.title}" (${Object.keys(i.matches).join('/')})`);
        say(line); sample.forEach(say); summaryLines.push(row);
        continue;
      } catch (e) {
        line = `  FAIL ${feed.id.padEnd(13)} ${e.message}`;
        row = `| ${feed.id} | FAIL: ${String(e.message).replace(/\|/g, '/')} | | | | | |`;
      }
      say(line); summaryLines.push(row);
    }
  }
  say(`\nRESULT: ${ok} of ${total} feeds verified as reachable and readable.`);
  summaryLines.push('', `**${ok} of ${total} feeds verified as reachable and readable.** Verification does not check usage terms. Read each publisher's terms before setting \`enabled: true\` and \`termsChecked\` in \`data/rss-sources.mjs\`.`);
  if (!ok) say('NONE of the feeds could be verified. The RSS news system is NOT operational. See the errors above.');
  writeSummary();
  process.exit(ok ? 0 : 2);
}

// ======================= FETCH =======================
let prev = null;
try { const j = JSON.parse(fs.readFileSync(FILE, 'utf8')); if (j && j.schema === 1) prev = j; } catch {}
const active = publishers.filter(p => p.enabled && hasDate(p.termsChecked));
for (const p of publishers.filter(p => p.enabled && !hasDate(p.termsChecked))) say(`REFUSED: ${p.name} is enabled but has no termsChecked date, so it was not fetched.`);
if (!active.length) {
  say('No publisher is enabled with a termsChecked date, so nothing was fetched and the cache was not changed.\nRun this workflow with mode = verify first, read each publisher\'s terms, then edit data/rss-sources.mjs (see the README).');
  summaryLines.push('## RSS fetch', 'No publisher is enabled with a termsChecked date. Nothing was fetched.'); writeSummary();
  process.exit(3);
}
if (!active.some(p => p.feeds.some(f => !f.skip))) {
  say('A publisher is enabled but has no feed addresses configured (or all are skipped), so nothing was fetched. Run verify to discover feed addresses, add them to data/rss-sources.mjs, then fetch again.');
  summaryLines.push('## RSS fetch', 'No feed addresses are configured for the enabled publishers. Nothing was fetched.'); writeSummary();
  process.exit(3);
}
const activeIds = new Set(active.map(p => p.id));
const prevFeeds = (prev && prev.feeds) || {};
let items = ((prev && prev.items) || []).filter(i => activeIds.has(i.publisherId));   // articles of a publisher that is now switched off are removed
// ...and so are their links inside "also reported by" lists of other articles (a switched-off publisher must not be shown at all)
for (const i of items) if (i.variants) { i.variants = i.variants.filter(v => activeIds.has(v.publisherId)); i.variantsTotal = i.variants.length; if (!i.variants.length) { delete i.variants; delete i.variantsTotal; } }
const feeds = {};
let tried = 0, worked = 0, dupes = 0, added = 0, first = true;
summaryLines.push('## RSS fetch', '', '| Feed | Result | New articles |', '|---|---|---|');
for (const pub of active) for (const feed of pub.feeds) {
  if (feed.skip) { say(`${feed.id}: skipped (${feed.skip})`); continue; }
  tried++;
  if (!first) await sleep(S.gapMs + Math.random() * 1000); first = false;
  const old = prevFeeds[feed.id] || {};
  const rec = { id: feed.id, publisherId: pub.id, publisher: pub.name, label: feed.label, url: feed.url, status: 'error', checkedAt: iso(NOW),
    lastSuccessAt: old.lastSuccessAt || null, httpStatus: null, entries: old.entries ?? null, error: null, etag: old.etag || null, lastModified: old.lastModified || null };
  say(`${feed.id}: requesting`);
  try {
    const r = await request(feed, pub, old.lastSuccessAt ? old : null, say);
    rec.httpStatus = r.status;
    if (r.status === 304) { rec.status = 'ok'; rec.lastSuccessAt = iso(NOW); rec.notModified = true; say('  not modified (HTTP 304): cached articles are current'); summaryLines.push(`| ${feed.id} | not modified | 0 |`); worked++; feeds[feed.id] = rec; continue; }
    const entries = parseFeed(r.text);
    const b = buildItems(entries, { publisher: pub, feedId: feed.id, now: NOW, matchers });
    if (entries.length - b.stat.noTitle - b.stat.badLink - b.stat.offHost < 1) throw new ParseError('no entry had a usable title and a link on the publisher\'s own website');
    const m = mergeItems(items, b.items, { now: NOW, retentionDays: S.retentionDays, maxItems: S.maxItems });
    items = m.items; dupes += m.dupes; added += m.added;
    Object.assign(rec, { status: 'ok', lastSuccessAt: iso(NOW), entries: entries.length, etag: r.headers.get('etag') || null, lastModified: r.headers.get('last-modified') || null, rejected: { noTitle: b.stat.noTitle, badLink: b.stat.badLink, offSite: b.stat.offHost, undated: b.stat.undated } });
    say(`  OK: ${entries.length} entries, ${b.items.length} matched a country, ${m.added} new, ${m.dupes} already cached`);
    summaryLines.push(`| ${feed.id} | OK | ${m.added} |`); worked++;
  } catch (e) {
    rec.error = e.message;
    say(`  FAILED: ${e.message}. Previously cached articles from this feed are kept.`);
    summaryLines.push(`| ${feed.id} | FAILED: ${String(e.message).replace(/\|/g, '/')} | 0 |`);
  }
  feeds[feed.id] = rec;
}
// Re-apply retention to articles kept from earlier runs (a run where every feed failed must not keep articles past the limit).
items = mergeItems(items, [], { now: NOW, retentionDays: S.retentionDays, maxItems: S.maxItems }).items;
const refreshed = refreshItems(items, { matchers, compiled });
items = capItems(refreshed.items, Object.keys(COUNTRY_TERMS), 60, 30);
const relevance = refreshed.stats;
const lastSuccessAt = Object.values(feeds).map(f => f.lastSuccessAt).filter(Boolean).sort().pop() || null;
const out = { schema: 1, generatedAt: iso(NOW), checkedAt: iso(NOW), lastSuccessAt, retentionDays: S.retentionDays, publishers: active.map(p => ({ id: p.id, name: p.name, termsChecked: p.termsChecked })),
  terms: termSummary(COUNTRY_TERMS), relevance, feeds, items };
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(FILE + '.tmp', JSON.stringify(out, null, 1)); fs.renameSync(FILE + '.tmp', FILE);
say(`\nSummary: ${worked} of ${tried} feeds updated, ${added} new articles, ${dupes} duplicates ignored, ${items.length} articles in the cache.`);
if (!worked) say('Every feed failed. Cached articles were kept and marked with the errors.');
summaryLines.push('', `**${worked} of ${tried} feeds updated.** ${added} new articles, ${dupes} duplicates ignored, ${items.length} in the cache.`); writeSummary();
process.exit(worked ? 0 : 2);
