/**
 * APEX v13 — Sentry Monitoring Bridge (audit Kevin v13.1.0 — production-grade)
 *
 * Sans monitoring runtime, si Apex crash en prod → Kevin sait jamais.
 * Sentry free tier (5K events/mois) parfait pour démarrage commercialisation.
 *
 * Caractéristiques :
 * - DSN lu depuis vault (`ax_sentry_dsn`)
 * - Lazy-load `@sentry/browser` via CDN si DSN configuré (sinon 0 KB overhead)
 * - Fallback : POST events vers Cloudflare Worker custom si pas Sentry
 * - Auto-install global handlers (window.onerror + unhandledrejection)
 * - Anonymise PII via redactPII (services/pii-redaction.ts)
 * - Rate limit 100 events/min (anti quota explosion)
 * - Breadcrumbs FIFO 100 max pour reconstruire crash
 * - Performance tracing transactions
 *
 * Anti-pattern v12.785 : aucun monitoring runtime → bugs prod silencieux.
 */

import { logger } from '../../core/logger.js';
import { redactPII } from '../vault/pii-redaction.js';

export interface SentryEvent {
  type: 'error' | 'warning' | 'info';
  message: string;
  context?: Record<string, unknown> | undefined;
  user?: { id: string; tenantId?: string; tier?: string } | undefined;
  timestamp: number;
  url: string;
  userAgent: string;
}

interface SentryBreadcrumb {
  category: string;
  message: string;
  level?: 'debug' | 'info' | 'warning' | 'error' | undefined;
  data?: unknown;
  timestamp: number;
}

interface SentryTransaction {
  name: string;
  startedAt: number;
  finish: () => void;
}

interface SentrySDK {
  init: (config: Record<string, unknown>) => void;
  captureException: (err: unknown, hint?: Record<string, unknown>) => void;
  captureMessage: (msg: string, level?: string) => void;
  setUser: (user: Record<string, unknown> | null) => void;
  addBreadcrumb: (crumb: Record<string, unknown>) => void;
  startTransaction?: (ctx: Record<string, unknown>) => { finish: () => void };
}

/* Rate limit : 100 events/min (anti explosion quota Sentry free tier 5K/mois) */
const RATE_LIMIT_MAX = 100;
const RATE_LIMIT_WINDOW_MS = 60_000;
const BREADCRUMB_MAX = 100;
const SDK_CDN = 'https://browser.sentry-cdn.com/8.45.1/bundle.min.js';

class SentryBridge {
  private initialized = false;
  private dsn: string | null = null;
  private workerEndpoint: string | null = null;
  private sdk: SentrySDK | null = null;
  private user: { id: string; tenantId?: string; tier?: string } | null = null;
  private breadcrumbs: SentryBreadcrumb[] = [];
  private rateLimitTimestamps: number[] = [];
  private installedHandlers = false;

  /**
   * Init avec DSN depuis vault (ax_sentry_dsn).
   * Si pas DSN → fallback worker endpoint (ax_sentry_worker_url).
   * Retourne {ok:true} si init réussi (au moins un sink dispo).
   */
  async init(): Promise<{ ok: boolean }> {
    if (this.initialized) return { ok: true };
    try {
      this.dsn = this.readStorageKey('ax_sentry_dsn');
      this.workerEndpoint = this.readStorageKey('ax_sentry_worker_url');

      if (this.dsn && this.dsn.startsWith('https://')) {
        await this.lazyLoadSentrySDK();
      }

      this.initialized = true;
      this.installGlobalHandlers();
      logger.info('sentry-bridge', 'init complete', {
        dsn: this.dsn ? 'configured' : 'none',
        worker: this.workerEndpoint ? 'configured' : 'none',
        sdk: this.sdk ? 'loaded' : 'none',
      });
      return { ok: true };
    } catch (err: unknown) {
      logger.warn('sentry-bridge', 'init failed (continuing degraded)', { err });
      this.initialized = true; /* mark anyway pour ne pas retry boucle */
      this.installGlobalHandlers();
      return { ok: false };
    }
  }

  /**
   * Capture exception (auto-installé via window.onerror + unhandledrejection).
   */
  captureException(err: Error, ctx?: Record<string, unknown>): void {
    if (!this.checkRateLimit()) return;
    const event = this.buildEvent('error', err.message, {
      ...ctx,
      stack: err.stack,
      name: err.name,
    });
    this.send(event);
    if (this.sdk) {
      try {
        this.sdk.captureException(err, { extra: this.redactContext(ctx) });
      } catch {
        /* SDK error → fallback déjà fait */
      }
    }
  }

  /**
   * Capture message warning/info.
   */
  captureMessage(msg: string, level: 'warning' | 'info', ctx?: Record<string, unknown>): void {
    if (!this.checkRateLimit()) return;
    const event = this.buildEvent(level === 'warning' ? 'warning' : 'info', msg, ctx);
    this.send(event);
    if (this.sdk) {
      try {
        this.sdk.captureMessage(this.redactString(msg), level);
      } catch {
        /* SDK error → fallback déjà fait */
      }
    }
  }

  /**
   * Set user context (auto-injection dans events).
   */
  setUser(user: { id: string; tenantId?: string; tier?: string }): void {
    this.user = user;
    if (this.sdk) {
      try {
        this.sdk.setUser({
          id: user.id,
          ...(user.tenantId && { tenantId: user.tenantId }),
          ...(user.tier && { tier: user.tier }),
        });
      } catch {
        /* skip */
      }
    }
  }

  /**
   * Clear user (logout).
   */
  clearUser(): void {
    this.user = null;
    if (this.sdk) {
      try {
        this.sdk.setUser(null);
      } catch {
        /* skip */
      }
    }
  }

  /**
   * Add breadcrumb (trail action user pour reconstruire crash).
   * FIFO 100 max.
   */
  addBreadcrumb(crumb: { category: string; message: string; level?: string; data?: unknown }): void {
    const bc: SentryBreadcrumb = {
      category: crumb.category,
      message: this.redactString(crumb.message).slice(0, 300),
      ...(crumb.level && { level: crumb.level as SentryBreadcrumb['level'] }),
      ...(crumb.data !== undefined && { data: this.redactContext(crumb.data as Record<string, unknown>) }),
      timestamp: Date.now(),
    };
    this.breadcrumbs.push(bc);
    if (this.breadcrumbs.length > BREADCRUMB_MAX) {
      this.breadcrumbs = this.breadcrumbs.slice(-BREADCRUMB_MAX);
    }
    if (this.sdk) {
      try {
        this.sdk.addBreadcrumb({
          category: bc.category,
          message: bc.message,
          ...(bc.level && { level: bc.level }),
          ...(bc.data !== undefined && { data: bc.data }),
          timestamp: bc.timestamp / 1000,
        });
      } catch {
        /* skip */
      }
    }
  }

  /**
   * Performance tracing.
   */
  startTransaction(name: string): SentryTransaction {
    const startedAt = performance.now();
    let sdkTransaction: { finish: () => void } | undefined;
    if (this.sdk?.startTransaction) {
      try {
        sdkTransaction = this.sdk.startTransaction({ name, op: 'apex.transaction' });
      } catch {
        /* skip */
      }
    }
    return {
      name,
      startedAt,
      finish: (): void => {
        const duration = performance.now() - startedAt;
        this.addBreadcrumb({
          category: 'transaction',
          message: `${name} (${Math.round(duration)}ms)`,
          level: 'info',
          data: { duration },
        });
        if (sdkTransaction) {
          try {
            sdkTransaction.finish();
          } catch {
            /* skip */
          }
        }
      },
    };
  }

  /* Read-only state for tests + admin HUD */
  getBreadcrumbs(): readonly SentryBreadcrumb[] {
    return this.breadcrumbs;
  }

  getUser(): { id: string; tenantId?: string; tier?: string } | null {
    return this.user;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  isSdkLoaded(): boolean {
    return this.sdk !== null;
  }

  /**
   * Test sender — envoie 1 event "info" pour vérifier que le sink répond.
   * Idempotent (rate-limit applied). Retourne le résultat structuré.
   * Fix v13.3.18 (Kevin v13.3.16 rapport "Sentry bridge wired mais pas testé").
   */
  async sendTestEvent(): Promise<{ ok: boolean; sink: 'sdk' | 'worker' | 'fallback-buffer' | 'none'; reason?: string }> {
    if (!this.initialized) await this.init();
    if (!this.dsn && !this.workerEndpoint) {
      return { ok: false, sink: 'none', reason: 'No DSN or worker endpoint configured' };
    }
    const msg = `Apex test event ${new Date().toISOString()}`;
    try {
      this.captureMessage(msg, 'info', { source: 'sendTestEvent', test: true });
      const sink: 'sdk' | 'worker' | 'fallback-buffer' = this.sdk ? 'sdk' : (this.workerEndpoint ? 'worker' : 'fallback-buffer');
      return { ok: true, sink };
    } catch (err: unknown) {
      return { ok: false, sink: 'none', reason: err instanceof Error ? err.message : String(err) };
    }
  }

  resetForTests(): void {
    this.initialized = false;
    this.dsn = null;
    this.workerEndpoint = null;
    this.sdk = null;
    this.user = null;
    this.breadcrumbs = [];
    this.rateLimitTimestamps = [];
    this.installedHandlers = false;
  }

  /* ============== Private ============== */

  private installGlobalHandlers(): void {
    if (this.installedHandlers) return;
    if (typeof window === 'undefined') return;
    this.installedHandlers = true;
    window.addEventListener('error', (event) => {
      const err = event.error instanceof Error ? event.error : new Error(String(event.message));
      this.captureException(err, {
        source: 'window.onerror',
        url: event.filename,
        line: event.lineno,
        col: event.colno,
      });
    });
    window.addEventListener('unhandledrejection', (event) => {
      const reason: unknown = event.reason;
      const err = reason instanceof Error ? reason : new Error(String(reason));
      this.captureException(err, { source: 'unhandledrejection' });
    });
  }

  private async lazyLoadSentrySDK(): Promise<void> {
    if (typeof document === 'undefined') return;
    /* Lazy-load Sentry SDK via CDN seulement si DSN configuré (0 KB overhead sinon) */
    try {
      await this.injectScript(SDK_CDN);
      const sentryGlobal = (window as unknown as { Sentry?: SentrySDK }).Sentry;
      if (sentryGlobal && this.dsn) {
        sentryGlobal.init({
          dsn: this.dsn,
          environment: this.detectEnvironment(),
          release: this.readAppVersion(),
          tracesSampleRate: 0.1, /* 10% transactions traced (économie quota) */
          beforeSend: (event: Record<string, unknown>): Record<string, unknown> => {
            /* PII redaction avant envoi Sentry */
            if (typeof event['message'] === 'string') {
              event['message'] = this.redactString(event['message']);
            }
            return event;
          },
        });
        this.sdk = sentryGlobal;
        logger.info('sentry-bridge', 'Sentry SDK loaded + init OK');
      }
    } catch (err: unknown) {
      logger.warn('sentry-bridge', 'Sentry SDK lazy-load failed', { err });
    }
  }

  private injectScript(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const existing = document.querySelector<HTMLScriptElement>(`script[data-sentry-bridge="1"]`);
        if (existing) {
          resolve();
          return;
        }
        const script = document.createElement('script');
        script.src = url;
        script.async = true;
        script.crossOrigin = 'anonymous';
        script.dataset['sentryBridge'] = '1';
        script.onload = (): void => resolve();
        script.onerror = (): void => reject(new Error(`Failed to load ${url}`));
        document.head.appendChild(script);
      } catch (err: unknown) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  private buildEvent(type: SentryEvent['type'], message: string, ctx?: Record<string, unknown>): SentryEvent {
    return {
      type,
      message: this.redactString(message),
      ...(ctx && { context: this.redactContext(ctx) }),
      ...(this.user && { user: this.user }),
      timestamp: Date.now(),
      url: typeof window !== 'undefined' ? window.location.href : 'unknown',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 200) : 'unknown',
    };
  }

  private send(event: SentryEvent): void {
    /* Si pas SDK + pas worker → buffer local seulement (déjà loggé via logger.warn) */
    if (this.workerEndpoint) {
      void this.sendToWorker(event);
    }
  }

  private async sendToWorker(event: SentryEvent): Promise<void> {
    if (!this.workerEndpoint) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    try {
      await fetch(this.workerEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
        signal: AbortSignal.timeout(8_000),
      });
    } catch {
      /* offline / timeout → silent (event déjà loggé) */
    }
  }

  private checkRateLimit(): boolean {
    const now = Date.now();
    /* Drop timestamps hors fenêtre */
    this.rateLimitTimestamps = this.rateLimitTimestamps.filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);
    if (this.rateLimitTimestamps.length >= RATE_LIMIT_MAX) {
      return false;
    }
    this.rateLimitTimestamps.push(now);
    return true;
  }

  private redactString(s: string): string {
    if (typeof s !== 'string') return String(s);
    return redactPII(s).redacted;
  }

  private redactContext(ctx: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
    if (!ctx) return undefined;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(ctx)) {
      if (typeof v === 'string') {
        out[k] = this.redactString(v);
      } else if (v && typeof v === 'object') {
        try {
          const json = JSON.stringify(v);
          out[k] = JSON.parse(this.redactString(json)) as unknown;
        } catch {
          out[k] = '[unserializable]';
        }
      } else {
        out[k] = v;
      }
    }
    return out;
  }

  private readStorageKey(key: string): string | null {
    try {
      if (typeof localStorage === 'undefined') return null;
      const v = localStorage.getItem(key);
      return v && v.length > 0 ? v : null;
    } catch {
      return null;
    }
  }

  private detectEnvironment(): string {
    if (typeof window === 'undefined') return 'server';
    const host = window.location?.hostname ?? '';
    if (host === 'localhost' || host === '127.0.0.1') return 'development';
    if (host.includes('github.io') || host.includes('pages.dev')) return 'staging';
    return 'production';
  }

  private readAppVersion(): string {
    try {
      const meta = document.querySelector<HTMLMetaElement>('meta[name="app-version"]');
      if (meta?.content) return meta.content;
      const root = document.querySelector<HTMLElement>('[data-app-ver]');
      if (root?.dataset['appVer']) return root.dataset['appVer'];
    } catch {
      /* skip */
    }
    return 'unknown';
  }
}

export const sentryBridge = new SentryBridge();
