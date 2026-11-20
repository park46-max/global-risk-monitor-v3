// Safe HTTP client shared by the RSS and GDELT-file scripts. No dependencies.
//
// Address safety (SSRF protection): every address is checked BEFORE it is requested, both the address you pass in and every redirect target.
// Allowed: https only, no user name or password, standard port, not an IP address, and a host on the list you pass in (`hosts`).
// Redirects are followed by hand, at most `maxRedirects`. A call without a host list is refused. allowHttp relaxes the https/port/IP
// rules and exists only so the tests can talk to a local server (the scripts read it from RSS_ALLOW_HTTP=1).
import { safeUrl, hostAllowed } from './rss-lib.mjs';

export class FetchError extends Error {
  constructor(msg, retryable = false, retryAfterMs = 0) { super(msg); this.retryable = retryable; this.retryAfterMs = retryAfterMs; }
}

export function decodeBody(buf, contentType) {
  let label = (/charset=["']?([\w-]+)/i.exec(contentType || '') || [])[1];
  if (!label) label = (/<\?xml[^>]*encoding=["']([\w-]+)["']/i.exec(Buffer.from(buf.subarray(0, 200)).toString('latin1')) || [])[1];
  try { return new TextDecoder(label || 'utf-8').decode(buf); } catch { return new TextDecoder('utf-8').decode(buf); }
}

export function checkUrl(raw, hosts, who, allowHttp = false) {
  const u = safeUrl(raw);
  if (!u) throw new FetchError('not a valid web address');
  if (u.protocol !== 'https:' && !allowHttp) throw new FetchError('only https addresses are allowed, refused ' + u.protocol + '//' + u.hostname);
  if (u.username || u.password) throw new FetchError('addresses containing a user name or password are refused');
  const host = u.hostname.toLowerCase();
  if (!allowHttp && (u.port || /^[\d.]+$/.test(host) || host.includes(':'))) throw new FetchError('addresses with a non-standard port or an IP address are refused (' + u.host + ')');
  const allowed = hosts || [];
  if (!hostAllowed(host, allowed)) throw new FetchError(`address on ${host} refused: it is not one of ${who}'s feed hosts (${allowed.join(', ') || 'none configured'})`);
  return u;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

export function createClient({ ua, timeoutMs = 15000, maxTries = 3, retryBaseMs = 5000, maxRedirects = 3, maxBytes = 5 * 1048576, allowHttp = false }) {
  async function once(url0, o) {
    const headers = { 'User-Agent': ua, Accept: o.accept || '*/*' };
    if (o.cond && o.cond.etag) headers['If-None-Match'] = o.cond.etag;
    if (o.cond && o.cond.lastModified) headers['If-Modified-Since'] = o.cond.lastModified;
    const tmo = o.timeoutMs || timeoutMs, cap = o.maxBytes || maxBytes, signal = AbortSignal.timeout(tmo);
    let url = checkUrl(url0, o.hosts, o.who, allowHttp).href, res, hops = 0;
    for (;; hops++) {
      try { res = await fetch(url, { headers, redirect: 'manual', signal }); }
      catch (e) { throw new FetchError(e && e.name === 'TimeoutError' ? `timed out after ${tmo / 1000} s` : 'network error: ' + (e.cause && e.cause.code || e.message), true); }
      if (res.status >= 300 && res.status < 400 && res.status !== 304) {
        const loc = res.headers.get('location');
        try { await res.body?.cancel(); } catch {}
        if (!loc) throw new FetchError('HTTP ' + res.status + ' redirect without a Location');
        if (hops >= maxRedirects) throw new FetchError('more than ' + maxRedirects + ' redirects');
        let next; try { next = new URL(loc, url).href; } catch { throw new FetchError('redirect to an unreadable address'); }
        url = checkUrl(next, o.hosts, o.who, allowHttp).href;   // refused here, before anything is requested from it
        continue;
      }
      break;
    }
    if (res.status === 304) return { status: 304, headers: res.headers, hops };
    if (res.status === 429 || res.status >= 500) {
      const ra = Number(res.headers.get('retry-after'));
      throw new FetchError('HTTP ' + res.status, true, ra > 0 ? Math.min(ra * 1000, 60000) : 0);
    }
    if (!res.ok) { const e = new FetchError('HTTP ' + res.status); e.httpStatus = res.status; throw e; }
    const len = Number(res.headers.get('content-length'));
    if (len > cap) { try { await res.body?.cancel(); } catch {} throw new FetchError('response larger than ' + Math.round(cap / 1048576) + ' MB, ignored'); }
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length > cap) throw new FetchError('response larger than ' + Math.round(cap / 1048576) + ' MB, ignored');
    return { status: res.status, headers: res.headers, hops, buf, text: o.binary ? null : decodeBody(buf, res.headers.get('content-type')), finalUrl: url };
  }
  // Retries only network errors, timeouts, 429 and 5xx, with exponential backoff and jitter, never less than Retry-After.
  async function request(url, o, log = () => {}) {
    for (let attempt = 1; ; attempt++) {
      try { return await once(url, o); }
      catch (e) {
        if (!(e instanceof FetchError) || !e.retryable || attempt >= maxTries) throw e;
        const d = Math.min(60000, retryBaseMs * 2 ** (attempt - 1)), wait = Math.min(60000, Math.max(d / 2 + Math.random() * d / 2, e.retryAfterMs));
        log(`    ${e.message}. Retrying in ${(wait / 1000).toFixed(1)} s (attempt ${attempt + 1} of ${maxTries})`);
        await sleep(wait);
      }
    }
  }
  return { request };
}
