// fetch avec retry, timeout, circuit-breaker par hôte
const log = require('./logger').child('http');

let _fetch;
function getFetch() {
  if (_fetch) return _fetch;
  if (typeof fetch === 'function') _fetch = fetch;
  else _fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
  return _fetch;
}

const breakers = new Map();
function isOpen(host) { const b = breakers.get(host); return b && b.openUntil > Date.now(); }
function recordFail(host) {
  const b = breakers.get(host) || { fails: 0, openUntil: 0 };
  b.fails++;
  if (b.fails >= 5) { b.openUntil = Date.now() + 60000; log.warn('circuit breaker ouvert pour ' + host + ' (60s)'); }
  breakers.set(host, b);
}
function recordOk(host) { if (breakers.has(host)) breakers.delete(host); }

async function fetchWithRetry(url, opts = {}, { retries = 3, baseDelayMs = 200, timeoutMs = 5000 } = {}) {
  const host = (() => { try { return new URL(url).host; } catch { return url; } })();
  if (isOpen(host)) throw new Error('circuit ouvert pour ' + host);
  const fetcher = getFetch();
  let lastErr;
  for (let i = 0; i < retries; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const r = await fetcher(url, { ...opts, signal: controller.signal });
      clearTimeout(timer);
      recordOk(host);
      return r;
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
      if (i < retries - 1) {
        const delay = baseDelayMs * Math.pow(2, i);
        log.debug('retry ' + (i + 1) + '/' + retries + ' ' + url + ' dans ' + delay + 'ms : ' + e.message);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  recordFail(host);
  throw lastErr || new Error('fetchWithRetry failed');
}

module.exports = { fetchWithRetry, getFetch };
