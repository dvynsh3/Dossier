'use strict';
// One place for outgoing web requests. The desktop app swaps in Electron's own network stack (Chromium: Windows proxy
// settings, IPv6/IPv4 fallback), which succeeds on networks where Node's built-in fetch times out.
const dns = require('dns').promises;
const net = require('net');

let f = (...a) => globalThis.fetch(...a);

// True for addresses that point at this computer or the local network: loopback, private, link-local, carrier-grade NAT,
// multicast, unspecified and the IPv6 equivalents (including IPv4-mapped ones).
function isPrivateAddress(ip) {
  ip = String(ip || '').toLowerCase();
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (net.isIPv6(ip)) return ip === '::' || ip === '::1' || /^f[cd]/.test(ip) || /^fe[89ab]/.test(ip) || ip.startsWith('ff');
  return true;   // not an address at all: refuse
}

// Throws when the URL is not a public http(s) address. DNS is resolved here so a name that points inward is caught too.
async function assertPublicUrl(raw) {
  let u;
  try { u = new URL(raw); } catch (e) { throw new Error('That is not a valid web link.'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('Only http and https links are allowed.');
  if (u.username || u.password) throw new Error('Links with a user name or password are not allowed.');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) throw new Error('Links to this computer or the local network are not allowed.');
  let addrs;
  if (net.isIP(host)) addrs = [{ address: host }];
  else { try { addrs = await dns.lookup(host, { all: true }); } catch (e) { throw new Error('Could not find that website.'); } }
  if (!addrs.length || addrs.some(a => isPrivateAddress(a.address))) throw new Error('Links to this computer or the local network are not allowed.');
  return u;
}

// fetch with: public addresses only (re-checked on every redirect, at most 5), a time limit, and no cookies.
async function safeFetch(url, opts) {
  opts = Object.assign({}, opts);
  const timeout = opts.timeout || 15000; delete opts.timeout;
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), timeout);
  const outer = opts.signal; if (outer) outer.addEventListener('abort', () => ctl.abort(), { once: true });
  try {
    let cur = url;
    for (let hop = 0; hop < 6; hop++) {
      await assertPublicUrl(cur);
      const r = await f(cur, Object.assign({}, opts, { redirect: 'manual', signal: ctl.signal, credentials: 'omit' }));
      if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { cur = new URL(r.headers.get('location'), cur).href; continue; }
      return r;
    }
    throw new Error('The link redirects too many times.');
  } finally { clearTimeout(timer); }
}

// Reads at most maxBytes of a response body as text (so a huge page cannot exhaust memory).
async function readText(res, maxBytes) {
  maxBytes = maxBytes || 2000000;
  if (!res.body || !res.body.getReader) return (await res.text()).slice(0, maxBytes);
  const reader = res.body.getReader(), dec = new TextDecoder(); let out = '', n = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    n += value.length; out += dec.decode(value, { stream: true });
    if (n >= maxBytes) { try { await reader.cancel(); } catch (e) { /* already closed */ } break; }
  }
  return out;
}

module.exports = { fetch: (...a) => f(...a), safeFetch, readText, assertPublicUrl, isPrivateAddress, use(fn) { if (typeof fn === 'function') f = fn; } };
