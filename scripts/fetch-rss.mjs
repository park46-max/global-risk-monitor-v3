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
import { parseFeed, buildItems, mergeItems, buildMatchers, hostAllowed, safeUrl, ParseError } from './rss-lib.mjs';

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
const hasDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

class FetchError extends Error { constructor(msg, retryable = false, retryAfterMs = 0) { super(msg); this.retryable = retryable; this.retryAfterMs = retryAfterMs; } }

function decode(buf, contentType) {
  let label = (/charset=["']?([\w-]+)/i.exec(contentType || '') || [])[1];
  if (!label) label = (/<\?xml[^>]*encoding=["']([\w-]+)["']/i.exec(Buffer.from(buf.subarray(0, 200)).toString('latin1')) || [])[1];
  try { return new TextDecoder(label || 'utf-8').decode(buf); } catch { return new TextDecoder('utf-8').decode(buf); }
}

// One request, no retries. Throws FetchError.
async function requestOnce(feed, pub, cond) {
  const headers = { 'User-Agent': UA, Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.1' };
  if (cond && cond.etag) headers['If-None-Match'] = cond.etag;
  if (cond && cond.lastModified) headers['If-Modified-Since'] = cond.lastModified;
  let res;
  try { res = await fetch(feed.url, { headers, redirect: 'follow', signal: AbortSignal.timeout(S.timeoutMs) }); }
  catch (e) { throw new FetchError(e && e.name === 'TimeoutError' ? `timed out after ${S.timeoutMs / 1000} s` : 'network error: ' + (e.cause && e.cause.code || e.message), true); }
  const finalUrl = safeUrl(res.url);
  if (finalUrl && !hostAllowed(finalUrl.hostname.toLowerCase(), pub.hosts)) throw new FetchError('the address redirected to a different website (' + finalUrl.hostname + '), so it was not used');
  if (res.status === 304) return { status: 304, headers: res.headers };
  if (res.status === 429 || res.status >= 500) {
    const ra = Number(res.headers.get('retry-after'));
    throw new FetchError('HTTP ' + res.status, true, ra > 0 ? Math.min(ra * 1000, 60000) : 0);
  }
  if (!res.ok) throw new FetchError('HTTP ' + res.status);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.length > S0.maxBytes) throw new FetchError('response larger than ' + S0.maxBytes / 1048576 + ' MB, ignored');
  return { status: res.status, headers: res.headers, text: decode(buf, res.headers.get('content-type')) };
}

async function request(feed, pub, cond, log) {
  for (let attempt = 1; ; attempt++) {
    try { return await requestOnce(feed, pub, cond); }
    catch (e) {
      if (!(e instanceof FetchError) || !e.retryable || attempt >= S.maxTries) throw e;
      const d = Math.min(60000, S.retryBaseMs * 2 ** (attempt - 1)), wait = Math.min(60000, Math.max(d / 2 + Math.random() * d / 2, e.retryAfterMs));
      log(`    ${e.message}. Retrying in ${(wait / 1000).toFixed(1)} s (attempt ${attempt + 1} of ${S.maxTries})`);
      await sleep(wait);
    }
  }
}

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
        line = `  OK   ${feed.id.padEnd(13)} HTTP ${r.status}  entries=${entries.length} usable=${valid} newest=${newest} undated=${stat.undated} off-site=${stat.offHost}  matches: ${per}`;
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
const activeIds = new Set(active.map(p => p.id));
const prevFeeds = (prev && prev.feeds) || {};
let items = ((prev && prev.items) || []).filter(i => activeIds.has(i.publisherId));   // articles of a publisher that is now switched off are removed
const feeds = {};
let tried = 0, worked = 0, dupes = 0, added = 0, first = true;
summaryLines.push('## RSS fetch', '', '| Feed | Result | New articles |', '|---|---|---|');
for (const pub of active) for (const feed of pub.feeds) {
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
const lastSuccessAt = Object.values(feeds).map(f => f.lastSuccessAt).filter(Boolean).sort().pop() || null;
const out = { schema: 1, generatedAt: iso(NOW), checkedAt: iso(NOW), lastSuccessAt, retentionDays: S.retentionDays, publishers: active.map(p => ({ id: p.id, name: p.name, termsChecked: p.termsChecked })),
  terms: Object.fromEntries(Object.entries(COUNTRY_TERMS).map(([k, v]) => [k, v.map(x => typeof x === 'string' ? x : x.t)])), feeds, items };
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(FILE + '.tmp', JSON.stringify(out, null, 1)); fs.renameSync(FILE + '.tmp', FILE);
say(`\nSummary: ${worked} of ${tried} feeds updated, ${added} new articles, ${dupes} duplicates ignored, ${items.length} articles in the cache.`);
if (!worked) say('Every feed failed. Cached articles were kept and marked with the errors.');
summaryLines.push('', `**${worked} of ${tried} feeds updated.** ${added} new articles, ${dupes} duplicates ignored, ${items.length} in the cache.`); writeSummary();
process.exit(worked ? 0 : 2);
