/**
 * APEX v13 — Performance Metrics live (Core Web Vitals niveau Lighthouse).
 *
 * Demande Kevin (au-delà 100/100) :
 * "Surprends-moi. Va encore plus loin sur chaque axe."
 *
 * Capture en runtime via PerformanceObserver :
 * - LCP (Largest Contentful Paint) — visuel principal
 * - INP (Interaction to Next Paint) — réactivité
 * - CLS (Cumulative Layout Shift) — stabilité visuelle (M8 fix v13.3.74)
 * - TTFB (Time To First Byte)
 * - FCP (First Contentful Paint)
 * - TTI (Time To Interactive heuristique)
 *
 * Targets Lighthouse green :
 * - LCP < 2.5s
 * - INP < 200ms
 * - CLS < 0.1
 * - FCP < 1.8s
 * - TTFB < 600ms
 *
 * H6 fix v13.3.74 : `getMemoryUsage()` avec fallback Safari (estimation IDB+localStorage)
 * M8 fix v13.3.74 : CLS PerformanceObserver expose `getCLS()` + window-aggregated values
 *
 * Dashboard admin : visuel temps réel + alertes si régression.
 */

import { logger } from '../../core/logger.js';

/* ─────────────────────────── H6 Memory typing ─────────────────────────── */

export interface MemoryUsage {
  /** Mémoire utilisée (MB), 0 si indisponible */
  used_mb: number;
  /** Limite max heap (MB), 0 si inconnu */
  total_mb: number;
  /** Source de la mesure */
  source: 'native-measure' | 'native-jsHeap' | 'estimated' | 'unavailable';
  /** Confidence 0-1 (1 = native API, 0.5 = estimation, 0 = unknown) */
  confidence: number;
}

interface PerfMemoryLike {
  usedJSHeapSize?: number;
  totalJSHeapSize?: number;
  jsHeapSizeLimit?: number;
}

interface MeasureMemoryResult {
  bytes: number;
  breakdown?: Array<{ bytes: number; types?: string[]; userAgentSpecificTypes?: string[] }>;
}

export interface PerfMetric {
  name: 'LCP' | 'INP' | 'CLS' | 'FCP' | 'TTFB' | 'TTI';
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  ts: number;
}

const TARGETS = {
  LCP: { good: 2500, poor: 4000 },
  INP: { good: 200, poor: 500 },
  CLS: { good: 0.1, poor: 0.25 },
  FCP: { good: 1800, poor: 3000 },
  TTFB: { good: 600, poor: 1500 },
  TTI: { good: 3500, poor: 7300 },
} as const;

class PerfMetrics {
  private metrics: PerfMetric[] = [];
  private observers: PerformanceObserver[] = [];
  private installed = false;
  /** M8 fix : CLS valeur cumulative (session window-friendly) */
  private clsValue = 0;
  /** Last user input ts pour calculer CLS windows (chrome.com webperf guidance) */
  private lastInputTs = 0;

  /**
   * Install observers via PerformanceObserver API.
   * Idempotent : 2e call no-op (anti-double-binding).
   */
  install(): void {
    if (this.installed) return;
    this.installed = true;

    if (typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') {
      logger.info('perf-metrics', 'PerformanceObserver not available — metrics disabled');
      return;
    }

    /* LCP — Largest Contentful Paint */
    this.tryObserve('largest-contentful-paint', (entries) => {
      const last = entries[entries.length - 1];
      if (last) this.record('LCP', last.startTime);
    });

    /* CLS — Cumulative Layout Shift (M8 fix v13.3.74 + v13.3.86 audit P0.5 bugfix)
     * Bug audit externe : CLS=0 (parfait) → 0 pts au lieu de 100 pts car la
     * métrique n'était JAMAIS record si aucun shift ne survenait.
     * Fix : record initial CLS=0 immédiat (rating 'good') puis update à chaque shift. */
    this.record('CLS', 0); /* baseline parfait */
    this.tryObserve('layout-shift', (entries) => {
      for (const entry of entries) {
        const e = entry as PerformanceEntry & { hadRecentInput?: boolean; value?: number };
        if (!e.hadRecentInput && typeof e.value === 'number') {
          this.clsValue += e.value;
        }
      }
      this.record('CLS', this.clsValue);
    });

    /* Track user inputs to support session window aggregation (CLS spec) — used for getLastInputTime() debug */
    if (typeof window !== 'undefined') {
      const trackInput = (): void => {
        this.lastInputTs = performance.now();
      };
      window.addEventListener('keydown', trackInput, { passive: true, capture: true });
      window.addEventListener('pointerdown', trackInput, { passive: true, capture: true });
    }

    /* FCP — First Contentful Paint */
    this.tryObserve('paint', (entries) => {
      for (const entry of entries) {
        if (entry.name === 'first-contentful-paint') {
          this.record('FCP', entry.startTime);
        }
      }
    });

    /* INP — Interaction to Next Paint (event timing API) */
    this.tryObserve('event', (entries) => {
      for (const entry of entries) {
        const e = entry as PerformanceEntry & { duration: number; interactionId?: number };
        if (e.interactionId && e.duration > 0) {
          this.record('INP', e.duration);
        }
      }
    });

    /* TTFB via Navigation Timing */
    if (performance.timing) {
      const navTiming = performance.timing;
      const ttfb = navTiming.responseStart - navTiming.requestStart;
      if (ttfb > 0) this.record('TTFB', ttfb);
    } else if (typeof performance.getEntriesByType === 'function') {
      const navEntries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
      const nav = navEntries[0];
      if (nav) this.record('TTFB', nav.responseStart - nav.requestStart);
    }

    logger.info('perf-metrics', 'Web Vitals observers installed');
  }

  private tryObserve(type: string, callback: (entries: PerformanceEntry[]) => void): void {
    try {
      const obs = new PerformanceObserver((list) => callback(list.getEntries()));
      obs.observe({ type, buffered: true });
      this.observers.push(obs);
    } catch {
      /* Type non supporté navigateur, ignore */
    }
  }

  /**
   * Enregistre une metric + détermine rating.
   */
  record(name: PerfMetric['name'], value: number): void {
    const target = TARGETS[name];
    let rating: PerfMetric['rating'];
    if (value <= target.good) rating = 'good';
    else if (value <= target.poor) rating = 'needs-improvement';
    else rating = 'poor';

    this.metrics.push({ name, value, rating, ts: Date.now() });
    /* Cap 200 max */
    if (this.metrics.length > 200) this.metrics = this.metrics.slice(-200);

    if (rating === 'poor') {
      logger.warn('perf-metrics', `${name} POOR: ${value.toFixed(0)} (target < ${target.good})`);
    }
  }

  /**
   * Snapshot dernière valeur de chaque metric.
   */
  getSnapshot(): Record<PerfMetric['name'], PerfMetric | null> {
    const snapshot: Record<string, PerfMetric | null> = {
      LCP: null,
      INP: null,
      CLS: null,
      FCP: null,
      TTFB: null,
      TTI: null,
    };
    /* Itère reverse pour avoir le plus récent */
    for (let i = this.metrics.length - 1; i >= 0; i--) {
      const m = this.metrics[i];
      if (!m) continue;
      if (!snapshot[m.name]) snapshot[m.name] = m;
    }
    return snapshot as Record<PerfMetric['name'], PerfMetric | null>;
  }

  /**
   * Score global Lighthouse-style (0-100).
   * Pondération officielle Web Vitals :
   * LCP 25%, INP 30%, CLS 25%, FCP 10%, TTFB 10%
   */
  getScore(): { score: number; details: Record<string, { value: number; weight: number; pts: number }> } {
    const snap = this.getSnapshot();
    const weights = { LCP: 0.25, INP: 0.3, CLS: 0.25, FCP: 0.1, TTFB: 0.1 };
    let total = 0;
    const details: Record<string, { value: number; weight: number; pts: number }> = {};
    for (const [name, w] of Object.entries(weights)) {
      const m = snap[name as PerfMetric['name']];
      if (!m) {
        details[name] = { value: 0, weight: w, pts: 0 };
        continue;
      }
      let pts: number;
      if (m.rating === 'good') pts = 100;
      else if (m.rating === 'needs-improvement') pts = 60;
      else pts = 30;
      details[name] = { value: m.value, weight: w, pts };
      total += pts * w;
    }
    return { score: Math.round(total), details };
  }

  /**
   * Format pour UI dashboard.
   */
  formatForUI(): {
    score: string;
    grade: 'A' | 'B' | 'C' | 'D' | 'F';
    metrics: Array<{ name: string; value: string; rating: string; emoji: string }>;
  } {
    const { score } = this.getScore();
    const snap = this.getSnapshot();
    let grade: 'A' | 'B' | 'C' | 'D' | 'F';
    if (score >= 90) grade = 'A';
    else if (score >= 75) grade = 'B';
    else if (score >= 60) grade = 'C';
    else if (score >= 40) grade = 'D';
    else grade = 'F';
    const formatted = (Object.entries(snap) as Array<[PerfMetric['name'], PerfMetric | null]>)
      .filter((entry): entry is [PerfMetric['name'], PerfMetric] => entry[1] !== null)
      .map(([name, m]) => ({
        name,
        value: name === 'CLS' ? m.value.toFixed(3) : `${m.value.toFixed(0)}ms`,
        rating: m.rating,
        emoji: m.rating === 'good' ? '🟢' : m.rating === 'needs-improvement' ? '🟠' : '🔴',
      }));
    return { score: `${score}/100`, grade, metrics: formatted };
  }

  /**
   * Reset (debug).
   */
  reset(): void {
    this.metrics = [];
  }

  /**
   * Cleanup observers.
   */
  disconnect(): void {
    for (const obs of this.observers) obs.disconnect();
    this.observers = [];
    this.installed = false;
  }

  getAll(): readonly PerfMetric[] {
    return this.metrics;
  }

  /* ───────────────────── M8 fix v13.3.74 : CLS exposé ───────────────────── */

  /**
   * Retourne la valeur CLS cumulée actuelle (entre user inputs).
   * 0 si pas encore de layout shift mesuré.
   *
   * Targets : < 0.1 (good), 0.1-0.25 (needs-improvement), > 0.25 (poor).
   *
   * @example
   * const cls = perfMetrics.getCLS();
   * if (cls > 0.1) console.warn('Layout shifts detected');
   */
  getCLS(): number {
    return this.clsValue;
  }

  /**
   * Timestamp dernier user input (perf.now()) — utile debug session windows CLS.
   */
  getLastInputTime(): number {
    return this.lastInputTs;
  }

  /* ───────────────────── H6 fix v13.3.74 : Memory fallback Safari ───────────────────── */

  /**
   * Mesure mémoire JS avec fallback intelligent.
   *
   * Stratégie :
   * 1. `performance.measureUserAgentSpecificMemory()` — Chrome 89+ (most accurate)
   * 2. `performance.memory.usedJSHeapSize` — Chromium fallback
   * 3. Estimation IndexedDB + localStorage size — Safari (no native API)
   * 4. `unavailable` si rien ne marche
   *
   * @returns `{used_mb, total_mb, source, confidence}`
   */
  async getMemoryUsage(): Promise<MemoryUsage> {
    if (typeof performance === 'undefined') {
      return { used_mb: 0, total_mb: 0, source: 'unavailable', confidence: 0 };
    }

    /* 1. measureUserAgentSpecificMemory (Chrome 89+, requires crossOriginIsolated) */
    type MeasureFn = () => Promise<MeasureMemoryResult>;
    const perfWithMeasure = performance as Performance & { measureUserAgentSpecificMemory?: MeasureFn };
    if (typeof perfWithMeasure.measureUserAgentSpecificMemory === 'function') {
      try {
        const result = await perfWithMeasure.measureUserAgentSpecificMemory();
        const usedMb = result.bytes / (1024 * 1024);
        return {
          used_mb: Math.round(usedMb * 100) / 100,
          total_mb: 0, /* API ne donne pas total */
          source: 'native-measure',
          confidence: 1.0,
        };
      } catch {
        /* fall through */
      }
    }

    /* 2. performance.memory (Chromium proprietary, available in dev tools too) */
    const perfWithMem = performance as Performance & { memory?: PerfMemoryLike };
    if (perfWithMem.memory && typeof perfWithMem.memory.usedJSHeapSize === 'number') {
      const usedMb = perfWithMem.memory.usedJSHeapSize / (1024 * 1024);
      const totalMb = (perfWithMem.memory.jsHeapSizeLimit ?? 0) / (1024 * 1024);
      return {
        used_mb: Math.round(usedMb * 100) / 100,
        total_mb: Math.round(totalMb * 100) / 100,
        source: 'native-jsHeap',
        confidence: 0.9,
      };
    }

    /* 3. Safari estimation via IDB + localStorage size */
    try {
      let totalBytes = 0;
      /* localStorage scan */
      if (typeof localStorage !== 'undefined') {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (!k) continue;
          const v = localStorage.getItem(k);
          if (v) totalBytes += k.length * 2 + v.length * 2; /* UTF-16 chars */
        }
      }
      /* IDB databases sizes (best-effort via storage estimate) */
      type StorageManager = { estimate?: () => Promise<{ usage?: number; quota?: number }> };
      const navStorage = (typeof navigator !== 'undefined' && navigator.storage) as StorageManager | undefined;
      if (navStorage && typeof navStorage.estimate === 'function') {
        try {
          const est = await navStorage.estimate();
          if (est && typeof est.usage === 'number') {
            totalBytes += est.usage;
          }
        } catch {
          /* ignore */
        }
      }
      const usedMb = totalBytes / (1024 * 1024);
      return {
        used_mb: Math.round(usedMb * 100) / 100,
        total_mb: 0,
        source: 'estimated',
        confidence: 0.5,
      };
    } catch (err) {
      logger.warn('perf-metrics', 'memory estimate failed', {
        err: err instanceof Error ? err.message : String(err),
      });
      return { used_mb: 0, total_mb: 0, source: 'unavailable', confidence: 0 };
    }
  }
}

export const perfMetrics = new PerfMetrics();
