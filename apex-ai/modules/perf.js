/**
 * apex-modules/perf.js
 *
 * Module ES6 — Performance helpers (TimerPool, listener tracker, lazy loader).
 * Pure functions + pool state opaque.
 *
 * Tests : tests/apex-modules-perf.test.js
 */

"use strict";

/* ============================================================
   TIMER POOL — Tracked setInterval/setTimeout with tags
   ============================================================ */

class TimerPool {
  constructor() {
    this.intervals = []; // {id, tag, ts}
    this.timeouts = [];  // {id, tag, ts}
  }

  setInterval(fn, ms, tag = "untagged") {
    const id = globalThis.setInterval(fn, ms);
    this.intervals.push({ id, tag, ts: Date.now() });
    if (this.intervals.length > 200) this.intervals = this.intervals.slice(-200);
    return id;
  }

  setTimeout(fn, ms, tag = "untagged") {
    const id = globalThis.setTimeout(fn, ms);
    this.timeouts.push({ id, tag, ts: Date.now() });
    if (this.timeouts.length > 500) this.timeouts = this.timeouts.slice(-500);
    return id;
  }

  clearTag(tag) {
    let killed = 0;
    this.intervals = this.intervals.filter((t) => {
      if (t.tag === tag) {
        try { globalThis.clearInterval(t.id); killed++; } catch (_e) {}
        return false;
      }
      return true;
    });
    this.timeouts = this.timeouts.filter((t) => {
      if (t.tag === tag) {
        try { globalThis.clearTimeout(t.id); killed++; } catch (_e) {}
        return false;
      }
      return true;
    });
    return killed;
  }

  stats() {
    const tags = {};
    for (const t of this.intervals) tags[t.tag] = (tags[t.tag] || 0) + 1;
    for (const t of this.timeouts) tags[t.tag] = (tags[t.tag] || 0) + 1;
    return { intervals: this.intervals.length, timeouts: this.timeouts.length, by_tag: tags };
  }

  clearAll() {
    let killed = 0;
    for (const t of this.intervals) {
      try { globalThis.clearInterval(t.id); killed++; } catch (_e) {}
    }
    for (const t of this.timeouts) {
      try { globalThis.clearTimeout(t.id); killed++; } catch (_e) {}
    }
    this.intervals = [];
    this.timeouts = [];
    return killed;
  }
}

export const pool = new TimerPool();

/* ============================================================
   LISTENER TRACKER — WeakMap auto-GC
   ============================================================ */

const listenerRegistry = typeof WeakMap !== "undefined" ? new WeakMap() : null;

export function addListener(target, type, handler, opts, tag = "untagged") {
  if (!target || !type || !handler) return;
  try {
    target.addEventListener(type, handler, opts);
    if (listenerRegistry) {
      const entry = listenerRegistry.get(target) || [];
      entry.push({ type, handler, opts, tag });
      listenerRegistry.set(target, entry);
    }
  } catch (_e) {}
}

export function removeListenersOnElement(target) {
  if (!target || !listenerRegistry) return 0;
  const entry = listenerRegistry.get(target);
  if (!entry) return 0;
  let removed = 0;
  for (const e of entry) {
    try { target.removeEventListener(e.type, e.handler, e.opts); removed++; } catch (_) {}
  }
  listenerRegistry.delete(target);
  return removed;
}

/* ============================================================
   LAZY LOADER — Promise + cache (script tags)
   ============================================================ */

const lazyCache = new Map();

export function lazyLoad(url, opts = {}) {
  if (!url) return Promise.reject(new Error("url required"));
  if (lazyCache.has(url)) return lazyCache.get(url);
  const p = new Promise((resolve, reject) => {
    try {
      const s = document.createElement("script");
      s.src = url;
      s.async = true;
      if (opts.nonce) s.nonce = opts.nonce;
      if (opts.integrity) s.integrity = opts.integrity;
      if (opts.crossorigin) s.crossOrigin = opts.crossorigin;
      s.onload = () => resolve(true);
      s.onerror = () => { lazyCache.delete(url); reject(new Error("lazy_load_failed:" + url)); };
      document.head.appendChild(s);
    } catch (e) {
      reject(e);
    }
  });
  lazyCache.set(url, p);
  return p;
}

export function lazyCacheStats() {
  return { count: lazyCache.size, urls: Array.from(lazyCache.keys()) };
}

/* ============================================================
   DEBOUNCE / THROTTLE
   ============================================================ */

export function debounce(fn, wait = 200) {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

export function throttle(fn, limit = 200) {
  let inThrottle = false;
  return function (...args) {
    if (inThrottle) return;
    fn.apply(this, args);
    inThrottle = true;
    setTimeout(() => { inThrottle = false; }, limit);
  };
}

export const VERSION = "1.0.0";
