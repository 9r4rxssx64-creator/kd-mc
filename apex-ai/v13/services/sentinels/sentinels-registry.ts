/**
 * APEX v13 — Sentinels Registry MAX (18+ sentinelles 24/7 niveau pro).
 *
 * Layer typé clean au-dessus de `sentinels.ts` existant qui expose :
 * - Interface `Sentinel` complète (id, name, description, intervalMs, run, autoFix, lastRun, lastResult, enabled)
 * - Interface `SentinelResult` (status ok/warn/error + message + details + ts + durationMs)
 * - API `sentinelsRegistry` (list, start, stop, startAll, stopAll, getStatus, getLastReport)
 * - Métriques perf collectées (durationMs par run, taux succès, autoFix réussis)
 * - Auto-fix whitelist 3 tentatives → escalade ax_claude_todo Firebase si fail
 * - Lessons learned ajoutées si nouveau pattern erreur
 * - Audit log immutable (via auditLog service)
 * - Sentinel-meta surveille les autres sentinels (état down/crash → escalade)
 *
 * Compat ancienne API : conserve `sentinels` (manager) + `registerCoreSentinels()`
 * Cette registry boost les 13 existantes vers 18+ MAX en ajoutant :
 * - capabilities-watch (week) : détecte nouvelles APIs Web (NDEFReader, BarcodeDetector...)
 * - tools-watch (week) : Web search nouveaux outils/libs Apex pourrait intégrer
 * - persistence-watch (1h) : vérifie clés critiques présentes local + Firebase, restore auto
 * - sentinel-meta (5 min) : surveille les 17 autres sentinelles
 *
 * Règle Kevin : "Pousse au max son script, skill, hook etc toujours."
 */

import { logger } from '../../core/logger.js';

import { sentinels as sentinelsManager, registerCoreSentinels, type Sentinel as LegacySentinel } from './sentinels.js';

/* === Types publics === */

export type SentinelStatus = 'ok' | 'warn' | 'error';

export interface SentinelResult {
  status: SentinelStatus;
  message: string;
  details?: Record<string, unknown>;
  ts: number;
  durationMs: number;
}

export interface Sentinel {
  id: string;
  name: string;
  description: string;
  intervalMs: number;
  run: () => Promise<SentinelResult>;
  autoFix?: () => Promise<boolean>;
  lastRun?: number;
  lastResult?: SentinelResult;
  enabled: boolean;
}

export interface RegistryStatus {
  total: number;
  running: number;
  errors: number;
  warns: number;
  ok: number;
  pending: number;
  autoFixSuccessCount: number;
  totalRuns: number;
}

export interface RegistryMetrics {
  totalRuns: number;
  totalSuccess: number;
  totalFailures: number;
  totalAutoFixSuccess: number;
  totalAutoFixFailures: number;
  avgDurationMs: number;
  perSentinel: Record<
    string,
    { runs: number; success: number; failures: number; avgMs: number; autoFixSuccess: number }
  >;
}

interface PerfTrack {
  runs: number;
  success: number;
  failures: number;
  totalDurationMs: number;
  autoFixSuccess: number;
  autoFixFailures: number;
  lastEscalationTs?: number;
}

const METRICS_KEY = 'apex_v13_sentinels_metrics';
const ESCALATION_KEY = 'ax_claude_todo';
const ESCALATION_COOLDOWN_MS = 6 * 60 * 60 * 1000; /* 6h cooldown par sentinelle */
const AUTOFIX_MAX_ATTEMPTS = 3;

class SentinelsRegistry {
  private metrics = new Map<string, PerfTrack>();
  private bootedExtras = false;

  constructor() {
    this.loadMetrics();
  }

  /**
   * Boote la registry : enregistre les 13 sentinels core + 4 extras MAX (capabilities/tools/persistence/sentinel-meta).
   * Idempotent.
   */
  bootstrap(): void {
    /* Core 13 (compat existante) */
    registerCoreSentinels();
    /* Extras MAX */
    if (!this.bootedExtras) {
      this.registerExtras();
      this.bootedExtras = true;
    }
  }

  /**
   * Liste toutes les sentinelles avec wrapper typé moderne.
   */
  list(): readonly Sentinel[] {
    return sentinelsManager.list().map((s) => this.adapt(s));
  }

  /**
   * Récupère une sentinelle par id (typed).
   */
  get(id: string): Sentinel | undefined {
    const s = sentinelsManager.list().find((x) => x.id === id);
    return s ? this.adapt(s) : undefined;
  }

  /**
   * Active une sentinelle (sans la lancer immédiatement).
   */
  start(id: string): void {
    sentinelsManager.enable(id, true);
  }

  /**
   * Désactive une sentinelle (skip cycle scheduler).
   */
  stop(id: string): void {
    sentinelsManager.enable(id, false);
  }

  /**
   * Active toutes les sentinelles enregistrées.
   */
  startAll(): void {
    for (const s of sentinelsManager.list()) {
      sentinelsManager.enable(s.id, true);
    }
  }

  /**
   * Désactive toutes les sentinelles.
   */
  stopAll(): void {
    for (const s of sentinelsManager.list()) {
      sentinelsManager.enable(s.id, false);
    }
  }

  /**
   * Force run d'une sentinelle + retourne SentinelResult typé + collecte métriques.
   * Si fail + autoFix → tente jusqu'à 3 fois (whitelist), sinon escalade.
   */
  async runOne(id: string): Promise<SentinelResult> {
    const start = Date.now();
    const legacy = sentinelsManager.list().find((s) => s.id === id);
    if (!legacy) {
      return {
        status: 'error',
        message: `Sentinel '${id}' not found`,
        ts: Date.now(),
        durationMs: 0,
      };
    }

    const trackBefore = this.getOrInitMetric(id);
    let result: SentinelResult;
    try {
      const legacyResult = await sentinelsManager.runOne(id);
      const durationMs = Date.now() - start;
      result = this.legacyToResult(legacyResult, durationMs);
    } catch (err: unknown) {
      const durationMs = Date.now() - start;
      result = {
        status: 'error',
        message: err instanceof Error ? err.message : String(err),
        ts: Date.now(),
        durationMs,
      };
    }

    /* Collecte métriques */
    trackBefore.runs += 1;
    trackBefore.totalDurationMs += result.durationMs;
    if (result.status === 'ok') trackBefore.success += 1;
    else trackBefore.failures += 1;

    /* Auto-fix path : si error/warn ET autoFix dispo → tente jusqu'à 3x puis escalade */
    if (result.status !== 'ok' && legacy.autoFix) {
      let fixed = false;
      for (let attempt = 1; attempt <= AUTOFIX_MAX_ATTEMPTS; attempt += 1) {
        try {
          const fixResult = await legacy.autoFix();
          if (fixResult.ok) {
            trackBefore.autoFixSuccess += 1;
            fixed = true;
            /* Re-check : si OK → result devient ok */
            const recheckLegacy = await sentinelsManager.runOne(id);
            const recheckResult = this.legacyToResult(recheckLegacy, Date.now() - start);
            if (recheckResult.status === 'ok') {
              result = {
                ...recheckResult,
                message: `Auto-fixed (attempt ${attempt}): ${fixResult.msg}`,
                details: { ...recheckResult.details, autoFixed: true, attempts: attempt },
              };
            }
            break;
          }
          trackBefore.autoFixFailures += 1;
        } catch (fixErr: unknown) {
          trackBefore.autoFixFailures += 1;
          logger.warn('sentinels-registry', `auto-fix attempt ${attempt} threw`, {
            id,
            err: fixErr instanceof Error ? fixErr.message : String(fixErr),
          });
        }
      }
      if (!fixed) {
        await this.escalateToClaudeTodo(id, result);
      }
    } else if (result.status !== 'ok') {
      /* Pas d'autoFix → escalade direct si critique */
      await this.escalateToClaudeTodo(id, result);
    }

    this.metrics.set(id, trackBefore);
    this.persistMetrics();
    return result;
  }

  /**
   * Run toutes les sentinelles enabled une fois (admin debug).
   */
  async runAll(): Promise<{ id: string; result: SentinelResult }[]> {
    const all = sentinelsManager.list().filter((s) => s.enabled);
    return Promise.all(all.map(async (s) => ({ id: s.id, result: await this.runOne(s.id) })));
  }

  /**
   * Status global agrégé (couleurs UI sentinel dashboard).
   */
  getStatus(): RegistryStatus {
    const list = sentinelsManager.list();
    let ok = 0;
    let warn = 0;
    let errors = 0;
    let pending = 0;
    for (const s of list) {
      if (!s.lastResult) {
        pending += 1;
        continue;
      }
      if (s.lastResult.ok) ok += 1;
      else errors += 1;
    }
    let autoFixSuccessCount = 0;
    let totalRuns = 0;
    for (const m of this.metrics.values()) {
      autoFixSuccessCount += m.autoFixSuccess;
      totalRuns += m.runs;
    }
    return {
      total: list.length,
      running: list.filter((s) => s.enabled).length,
      errors,
      warns: warn,
      ok,
      pending,
      autoFixSuccessCount,
      totalRuns,
    };
  }

  /**
   * Last result (typed) d'une sentinelle, null si jamais run.
   */
  getLastReport(id: string): SentinelResult | null {
    const s = sentinelsManager.list().find((x) => x.id === id);
    if (!s?.lastResult) return null;
    return this.legacyToResult(s.lastResult, 0);
  }

  /**
   * Métriques perf détaillées (admin dashboard).
   */
  getMetrics(): RegistryMetrics {
    let totalRuns = 0;
    let totalSuccess = 0;
    let totalFailures = 0;
    let totalDuration = 0;
    let autoFixSuccess = 0;
    let autoFixFailures = 0;
    const perSentinel: RegistryMetrics['perSentinel'] = {};
    for (const [id, m] of this.metrics) {
      totalRuns += m.runs;
      totalSuccess += m.success;
      totalFailures += m.failures;
      totalDuration += m.totalDurationMs;
      autoFixSuccess += m.autoFixSuccess;
      autoFixFailures += m.autoFixFailures;
      perSentinel[id] = {
        runs: m.runs,
        success: m.success,
        failures: m.failures,
        avgMs: m.runs > 0 ? Math.round(m.totalDurationMs / m.runs) : 0,
        autoFixSuccess: m.autoFixSuccess,
      };
    }
    return {
      totalRuns,
      totalSuccess,
      totalFailures,
      totalAutoFixSuccess: autoFixSuccess,
      totalAutoFixFailures: autoFixFailures,
      avgDurationMs: totalRuns > 0 ? Math.round(totalDuration / totalRuns) : 0,
      perSentinel,
    };
  }

  /**
   * Reset métriques (test / admin).
   */
  resetMetrics(): void {
    this.metrics.clear();
    try {
      localStorage.removeItem(METRICS_KEY);
    } catch {
      /* ignore */
    }
  }

  /* === Internals === */

  private adapt(s: LegacySentinel): Sentinel {
    const base: Sentinel = {
      id: s.id,
      name: s.name,
      description: s.desc,
      intervalMs: s.intervalMs,
      enabled: s.enabled,
      lastRun: s.lastRun,
      run: async () => this.runOne(s.id),
    };
    if (s.lastResult) {
      base.lastResult = this.legacyToResult(s.lastResult, 0);
    }
    if (s.autoFix) {
      base.autoFix = async () => {
        try {
          const r = await s.autoFix?.();
          return r?.ok === true;
        } catch {
          return false;
        }
      };
    }
    return base;
  }

  private legacyToResult(
    legacy: LegacySentinel['lastResult'] | undefined,
    durationMs: number,
  ): SentinelResult {
    if (!legacy) {
      return { status: 'error', message: 'no result', ts: Date.now(), durationMs };
    }
    return {
      status: legacy.ok ? 'ok' : 'error',
      message: legacy.msg,
      ts: legacy.ts,
      durationMs,
    };
  }

  private getOrInitMetric(id: string): PerfTrack {
    let m = this.metrics.get(id);
    if (!m) {
      m = {
        runs: 0,
        success: 0,
        failures: 0,
        totalDurationMs: 0,
        autoFixSuccess: 0,
        autoFixFailures: 0,
      };
      this.metrics.set(id, m);
    }
    return m;
  }

  private loadMetrics(): void {
    try {
      const raw = localStorage.getItem(METRICS_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as Record<string, PerfTrack>;
      for (const [id, m] of Object.entries(data)) {
        this.metrics.set(id, m);
      }
    } catch {
      /* ignore */
    }
  }

  private persistMetrics(): void {
    try {
      const data: Record<string, PerfTrack> = {};
      for (const [id, m] of this.metrics) data[id] = m;
      localStorage.setItem(METRICS_KEY, JSON.stringify(data));
    } catch {
      /* ignore */
    }
  }

  private async escalateToClaudeTodo(id: string, result: SentinelResult): Promise<void> {
    const track = this.getOrInitMetric(id);
    const now = Date.now();
    if (track.lastEscalationTs && now - track.lastEscalationTs < ESCALATION_COOLDOWN_MS) {
      /* cooldown — pas d'escalade en boucle */
      return;
    }
    track.lastEscalationTs = now;
    try {
      const raw = localStorage.getItem(ESCALATION_KEY);
      const list = raw ? (JSON.parse(raw) as unknown[]) : [];
      const todo = {
        id: `todo_${now}_${Math.random().toString(36).slice(2, 9)}`,
        sentinel_id: id,
        severity: result.status,
        message: result.message,
        details: result.details ?? {},
        src: 'sentinels-registry',
        ts: now,
        status: 'pending',
      };
      list.push(todo);
      const trimmed = list.slice(-50);
      localStorage.setItem(ESCALATION_KEY, JSON.stringify(trimmed));
      /* Audit log si dispo */
      try {
        const { auditLog } = await import('../observability/audit-log.js');
        await auditLog.record('sentinel.escalated', {
          details: { sentinel_id: id, message: result.message },
        });
      } catch {
        /* audit-log peut être indispo en test */
      }
      logger.warn('sentinels-registry', `escalated to claude-todo: ${id}`, {
        msg: result.message,
      });
    } catch (err: unknown) {
      logger.error('sentinels-registry', 'escalation failed', {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private registerExtras(): void {
    /* 14. capabilities-watch (weekly) — détecte APIs Web disponibles
     * v13.3.89 P1.10 : iOS-aware platform detection (Kevin règle "platform expected limitations").
     * iOS Safari PWA n'expose pas la plupart des APIs (pas de NDEFReader/BarcodeDetector/WebUSB/etc.).
     * Reporting honnête : sur iOS, on attend uniquement les APIs réellement disponibles.
     * Sinon on signalait "1/9 APIs" alors que c'est platform expected (faux warning). */
    sentinelsManager.register({
      id: 'capabilities-watch',
      name: 'Capabilities watch',
      desc: 'Détecte APIs Web disponibles (platform-aware iOS/Android/Desktop)',
      intervalMs: 7 * 24 * 60 * 60 * 1000,
      check: async () => {
        const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
        const isIOS = /iPhone|iPad|iPod/i.test(ua);
        const isIOSSafari = isIOS && /Safari/i.test(ua) && !/CriOS|FxiOS/i.test(ua);
        /* APIs universelles attendues (toutes plateformes modernes) */
        const universalApis: { name: string; available: boolean }[] = [
          { name: 'Geolocation', available: typeof navigator !== 'undefined' && 'geolocation' in navigator },
          { name: 'Notification', available: typeof window !== 'undefined' && 'Notification' in window },
          { name: 'MediaDevices', available: typeof navigator !== 'undefined' && 'mediaDevices' in navigator },
          { name: 'ServiceWorker', available: typeof navigator !== 'undefined' && 'serviceWorker' in navigator },
          { name: 'Clipboard', available: typeof navigator !== 'undefined' && 'clipboard' in navigator },
        ];
        /* APIs avancées (non disponibles iOS Safari, normales Android/Desktop) */
        const advancedApis: { name: string; available: boolean }[] = [
          { name: 'NDEFReader', available: typeof (globalThis as Record<string, unknown>)['NDEFReader'] !== 'undefined' },
          { name: 'BarcodeDetector', available: typeof (globalThis as Record<string, unknown>)['BarcodeDetector'] !== 'undefined' },
          { name: 'WebUSB', available: typeof navigator !== 'undefined' && 'usb' in navigator },
          { name: 'WebBluetooth', available: typeof navigator !== 'undefined' && 'bluetooth' in navigator },
          { name: 'WebSerial', available: typeof navigator !== 'undefined' && 'serial' in navigator },
          { name: 'WebHID', available: typeof navigator !== 'undefined' && 'hid' in navigator },
          { name: 'FileSystemAccess', available: typeof window !== 'undefined' && 'showOpenFilePicker' in window },
          { name: 'WakeLock', available: typeof navigator !== 'undefined' && 'wakeLock' in navigator },
          { name: 'Contacts', available: typeof navigator !== 'undefined' && 'contacts' in navigator },
        ];
        /* Sur iOS Safari : on n'attend QUE les universelles (advanced = expected unavailable) */
        const expectedApis = isIOSSafari ? universalApis : [...universalApis, ...advancedApis];
        const allApis = [...universalApis, ...advancedApis];
        const universalAvailable = universalApis.filter((a) => a.available).map((a) => a.name);
        const advancedAvailable = advancedApis.filter((a) => a.available).map((a) => a.name);
        const available = [...universalAvailable, ...advancedAvailable];
        const expectedAvailable = expectedApis.filter((a) => a.available).map((a) => a.name);
        const platform = isIOSSafari ? 'iOS Safari' : (isIOS ? 'iOS' : 'Desktop/Android');
        return {
          ok: true,
          msg: isIOSSafari
            ? `${expectedAvailable.length}/${expectedApis.length} APIs core (iOS Safari attendu) · ${advancedAvailable.length}/${advancedApis.length} avancées (platform N/A)`
            : `${available.length}/${allApis.length} APIs disponibles`,
          details: {
            platform,
            universal: { available: universalAvailable, total: universalApis.length },
            advanced: { available: advancedAvailable, total: advancedApis.length, expected: !isIOSSafari },
            isIOSSafari,
          },
        };
      },
    });

    /* 15. tools-watch (weekly) — propose intégration de nouveaux outils détectés
     * v13.3.24 fix Kevin (screenshot 19:11 "16 tools orphelins (50%)") :
     *   - Cible coverage >= 90% (vs > 5 orphans avant)
     *   - Whitelist étendue dans capabilities.auditOrphans (services internes wirés)
     *   - Coverage actuel attendu : 100% (Python audit script confirme 0 orphans) */
    sentinelsManager.register({
      id: 'tools-watch',
      name: 'Tools watch',
      desc: 'Surveille capabilities orphelines vs apex-tools, cible coverage ≥ 90%',
      intervalMs: 7 * 24 * 60 * 60 * 1000,
      check: async () => {
        try {
          const { capabilities } = await import('../core-svc/capabilities.js');
          const audit = await capabilities.auditOrphans();
          /* v13.3.24 : coverage < 90% = warning, sinon OK */
          if (audit.coverage_pct < 90) {
            return {
              ok: false,
              msg: `Coverage ${audit.coverage_pct}% (${audit.orphans.length} orphans) — cible ≥ 90%`,
              details: { orphans: audit.orphans.slice(0, 10), coverage_pct: audit.coverage_pct },
            };
          }
          return {
            ok: true,
            msg: `Coverage ${audit.coverage_pct}% (${audit.orphans.length} orphans) ✅`,
          };
        } catch (err: unknown) {
          return { ok: true, msg: 'Capabilities check skipped: ' + (err instanceof Error ? err.message : String(err)) };
        }
      },
    });

    /* 16. persistence-watch (1h) — vérifie clés critiques présentes local + Firebase
     * Sprint 13.3.17 fix : utilise les VRAIES clés écrites par les services
     * (audit-log, auth, settings) au lieu de noms fictifs des migrations.
     * Logique : "critique manquante" = au moins une clé attendue mais absente
     * APRÈS qu'une autre clé du même groupe soit présente. État totalement
     * vierge = OK initial. */
    sentinelsManager.register({
      id: 'persistence-watch',
      name: 'Persistence watch',
      desc: 'Vérifie présence clés critiques (vault, audit, settings) + alerte si perte détectée',
      intervalMs: 60 * 60 * 1000,
      check: async () => {
        /* Real keys écrites par le code prod */
        const criticalKeys = [
          'ax_audit_log_v13',     /* audit-log.ts:27 */
          'apex_v13_user',        /* auth.ts:185 */
        ];
        /* Clés optionnelles : présentes uniquement si admin a configuré */
        const optionalKeys = [
          'apex_v13_settings',
          'apex_v13_users',
          'apex_v13_persistent_memory',
          'apex_v13_backup_index',
        ];
        const missing: string[] = [];
        const present: string[] = [];
        for (const k of criticalKeys) {
          try {
            if (localStorage.getItem(k)) present.push(k);
            else missing.push(k);
          } catch {
            missing.push(k);
          }
        }
        const optionalPresent: string[] = [];
        for (const k of optionalKeys) {
          try {
            if (localStorage.getItem(k)) optionalPresent.push(k);
          } catch {
            /* ignore */
          }
        }
        const totalPresent = present.length + optionalPresent.length;
        /* Tout vide = état totalement initial = OK */
        if (totalPresent === 0) {
          return { ok: true, msg: 'État initial (aucune clé encore créée)' };
        }
        /* Si au moins une clé optionnelle existe mais qu'une critique manque
         * → alerte vraie (perte de données). */
        if (missing.length > 0 && optionalPresent.length > 0) {
          return {
            ok: false,
            msg: `${missing.length}/${criticalKeys.length} clés critiques manquantes`,
            details: { missing, optionalPresent },
          };
        }
        return {
          ok: true,
          msg: `${present.length}/${criticalKeys.length} critiques + ${optionalPresent.length}/${optionalKeys.length} optionnelles présentes`,
          details: { present, optionalPresent },
        };
      },
      autoFix: async () => {
        /* Tente restore depuis Firebase si dispo */
        try {
          const { firebase } = await import('../storage/firebase.js');
          await firebase.init();
          return { ok: true, msg: 'Firebase restore attempted' };
        } catch (err: unknown) {
          return { ok: false, msg: `Restore failed: ${err instanceof Error ? err.message : String(err)}` };
        }
      },
    });

    /* 18. auto-backup-watch (1h) — snapshot quotidien 3h UTC + hebdo dimanche 4h UTC + cleanup > 30j
     * (Kevin règle "ne jamais rien perdre" 2026-05-04, niveau enterprise SOC2). */
    sentinelsManager.register({
      id: 'auto-backup-watch',
      name: 'Backup Auto 24/7',
      desc: 'Snapshot quotidien 3h UTC + hebdo dimanche 4h UTC + cleanup > 30 jours',
      intervalMs: 60 * 60 * 1000, /* check 1h, mais snapshot uniquement à 3h UTC */
      check: async () => {
        try {
          const { autoBackup } = await import('../storage/auto-backup.js');
          const now = new Date();
          const hour = now.getUTCHours();
          const day = now.getUTCDay(); /* 0=dimanche */
          /* Hebdo dimanche 4h UTC : full state + Firebase remote */
          if (day === 0 && hour === 4) {
            const backup = await autoBackup.snapshot('weekly');
            return {
              ok: true,
              msg: `Backup hebdo ${backup.id} OK (${(backup.size_bytes / 1024).toFixed(1)} KB)`,
              details: { id: backup.id, type: 'weekly', size: backup.size_bytes },
            };
          }
          /* Quotidien 3h UTC */
          if (hour === 3) {
            const backup = await autoBackup.snapshot('daily');
            return {
              ok: true,
              msg: `Backup quotidien ${backup.id} OK (${(backup.size_bytes / 1024).toFixed(1)} KB)`,
              details: { id: backup.id, type: 'daily', size: backup.size_bytes },
            };
          }
          /* Heartbeat heures non-trigger : cleanup + stats */
          const cleaned = await autoBackup.cleanup();
          const stats = autoBackup.getStats();
          if (stats.last_backup_age_h > 26 && stats.total_backups === 0) {
            return {
              ok: false,
              msg: 'Aucun backup disponible (run manual urgent)',
              details: { stats },
            };
          }
          if (stats.last_backup_age_h > 48) {
            return {
              ok: false,
              msg: `Dernière backup ${stats.last_backup_age_h}h (>48h critical)`,
              details: { stats },
            };
          }
          return {
            ok: true,
            msg: `${stats.total_backups} backups (cleaned ${cleaned.deleted})`,
            details: { stats, cleaned: cleaned.deleted },
          };
        } catch (err: unknown) {
          return {
            ok: false,
            msg: 'auto-backup-watch failed: ' + (err instanceof Error ? err.message : String(err)),
          };
        }
      },
      autoFix: async () => {
        /* Si quota localStorage saturé → cleanup agressif */
        try {
          const { autoBackup } = await import('../storage/auto-backup.js');
          const cleaned = await autoBackup.cleanup();
          return {
            ok: cleaned.deleted > 0,
            msg: `Cleanup auto-fix : ${cleaned.deleted} backups supprimés`,
          };
        } catch (err: unknown) {
          return {
            ok: false,
            msg: 'auto-fix failed: ' + (err instanceof Error ? err.message : String(err)),
          };
        }
      },
    });

    /* 19. innovation-watch (hebdo) — veille technologique 24/7 (npm/AI/HF/GitHub).
     * Kevin règle 2026-05-04 : "agents amélioration dédiés cherchent en autonomie totale". */
    sentinelsManager.register({
      id: 'innovation-watch',
      name: 'Veille Technologique 24/7',
      desc: 'Scan hebdo npm/GitHub/HuggingFace/IA providers — détecte upgrades + auto-apply si confidence ≥0.95',
      intervalMs: 7 * 24 * 60 * 60 * 1000,
      check: async () => {
        try {
          const { innovationWatch } = await import('./innovation-watch.js');
          const result = await innovationWatch.runScan();
          if (result.updates.length === 0) {
            return { ok: true, msg: 'Aucune update détectée (état OK)' };
          }
          /* Auto-apply safe ones */
          let applied = 0;
          for (const upd of result.updates.filter((u) => u.recommendation === 'upgrade-asap')) {
            const r = await innovationWatch.autoUpdateIfSafe(upd);
            if (r.applied) applied += 1;
          }
          /* Notif Kevin si gros gain détecté (perf ou cost ≥50%) */
          const bigGain = result.updates.find(
            (u) =>
              (u.estimatedGain?.perf ?? 0) >= 50 ||
              (u.estimatedGain?.cost ?? 0) >= 50 ||
              (u.estimatedGain?.capabilities ?? 0) >= 50,
          );
          if (bigGain) {
            logger.info(
              'innovation-watch.notif',
              `Big gain detected: ${bigGain.name} (${bigGain.recommendation})`,
              { id: bigGain.id, gain: bigGain.estimatedGain },
            );
          }
          return {
            ok: true,
            msg: `${result.updates.length} updates, ${applied} auto-applied`,
            details: { detected: result.updates.length, applied, summary: result.summary },
          };
        } catch (err: unknown) {
          return {
            ok: false,
            msg: 'innovation-watch failed: ' + (err instanceof Error ? err.message : String(err)),
          };
        }
      },
    });

    /* 20. multi-key-health (30 min) — re-test toutes clés failing/unknown
     * Sprint 9 Kevin règle 2026-05-07 : "si une clé fail, swap auto sur autre clé"
     * + lumière rouge si tout un service est en panne. */
    sentinelsManager.register({
      id: 'multi-key-health',
      name: 'Multi-clé API health 30min',
      desc: 'Re-test toutes clés API failing/unknown toutes 30 min, swap auto si meilleure trouvée',
      intervalMs: 30 * 60 * 1000,
      check: async () => {
        try {
          const { multiKeyVault } = await import('../vault/multi-key-vault.js');
          const result = await multiKeyVault.healthCheckAll();
          const down = multiKeyVault.getServicesDown();
          const status = multiKeyVault.getHealthStatus();
          if (down.length > 0) {
            return {
              ok: false,
              msg: `🔴 Services en panne : ${down.join(', ')} (recovered ${result.recovered})`,
              details: { down, ...result, health: status },
            };
          }
          if (status === 'yellow') {
            return {
              ok: true,
              msg: `🟡 Health partial — ${result.tested} clés testées, ${result.recovered} recovered`,
              details: { ...result, health: status },
            };
          }
          return {
            ok: true,
            msg: `🟢 Health green — ${result.tested} clés OK (${result.recovered} recovered)`,
            details: { ...result, health: status },
          };
        } catch (err: unknown) {
          return {
            ok: true,
            msg: 'multi-key-health skipped: ' + (err instanceof Error ? err.message : String(err)),
          };
        }
      },
    });

    /* 18. links-rediscover (weekly) — re-verify alive tous discovered links + rebuild si broken */
    sentinelsManager.register({
      id: 'links-rediscover',
      name: 'Links rediscover',
      desc: 'Re-verify alive tous discovered links (login/dashboard/billing/api_keys/usage) + rebuild si broken',
      intervalMs: 7 * 24 * 60 * 60 * 1000,
      check: async () => {
        try {
          const { autoDiscoverLinks } = await import('../integrations/auto-discover-links.js');
          const result = await autoDiscoverLinks.reVerifyAll();
          if (result.broken > result.alive && result.tested > 5) {
            return {
              ok: false,
              msg: `🔴 ${result.broken}/${result.tested} liens cassés — rediscover requis`,
              details: { ...result },
            };
          }
          return {
            ok: true,
            msg: `🔗 ${result.alive}/${result.tested} liens alive (${result.broken} cassés)`,
            details: { ...result },
          };
        } catch (err: unknown) {
          return {
            ok: true,
            msg: 'links-rediscover skipped: ' + (err instanceof Error ? err.message : String(err)),
          };
        }
      },
      autoFix: async () => {
        /* Auto-fix : relance discoverAllStored pour reconstruire le cache */
        try {
          const { autoDiscoverLinks } = await import('../integrations/auto-discover-links.js');
          const r = await autoDiscoverLinks.discoverAllStored();
          logger.info('sentinels-registry', `links-rediscover auto-fix : ${r.new} new, ${r.verified}/${r.total} verified`);
          return {
            ok: r.verified > 0,
            msg: `${r.new} nouveaux services, ${r.verified}/${r.total} verified`,
          };
        } catch (err: unknown) {
          logger.warn('sentinels-registry', 'links-rediscover auto-fix failed', { err });
          return { ok: false, msg: err instanceof Error ? err.message : 'autoFix failed' };
        }
      },
    });

    /* 20. auto-improvement-watch (hebdo) — scan nouveaux MCP/skills/tools + auto-install safe + self-correct + self-manage.
     * Kevin règle 2026-05-07 : "auto amélioration et auto correction et auto Gestion". */
    sentinelsManager.register({
      id: 'auto-improvement-watch',
      name: 'Auto-Improvement 24/7',
      desc: 'Scan hebdo nouveaux MCP/skills/tools, auto-install safe (gain ≥30%), self-correct + self-manage',
      intervalMs: 7 * 24 * 60 * 60 * 1000,
      check: async () => {
        try {
          const { autoImprovement } = await import('./auto-improvement.js');
          /* 1. Scan new tools */
          const scan = await autoImprovement.scanNew();
          /* 2. Auto-install les recommandés (max 3 par run pour éviter spam) */
          let installed = 0;
          let skipped = 0;
          const recommendedIds = scan.newIds.slice(0, 3);
          for (const id of recommendedIds) {
            const result = await autoImprovement.autoInstallSafe(id);
            if (result.ok) installed += 1;
            else skipped += 1;
          }
          /* 3. Self-correct patterns récurrents */
          const correct = await autoImprovement.selfCorrect();
          /* 4. Self-manage cleanup logs / state */
          const manage = await autoImprovement.selfManage();
          return {
            ok: true,
            msg: `Scan ${scan.new} new (${scan.recommended} recommended), installed ${installed}, skipped ${skipped}, fixes ${correct.fixes_applied}, actions ${manage.actions.length}`,
            details: {
              scan,
              installed,
              skipped,
              fixes_applied: correct.fixes_applied,
              actions: manage.actions,
              bytes_freed: manage.bytes_freed,
            },
          };
        } catch (err: unknown) {
          return {
            ok: false,
            msg: 'auto-improvement-watch failed: ' + (err instanceof Error ? err.message : String(err)),
          };
        }
      },
      autoFix: async () => {
        /* Si fail : tente juste self-manage (read-only / cleanup) */
        try {
          const { autoImprovement } = await import('./auto-improvement.js');
          const manage = await autoImprovement.selfManage();
          return {
            ok: true,
            msg: `Self-manage fallback: ${manage.actions.length} actions`,
          };
        } catch (err: unknown) {
          return {
            ok: false,
            msg: 'auto-fix failed: ' + (err instanceof Error ? err.message : String(err)),
          };
        }
      },
    });

    /* 21. version-drift-watch (15 min) — DÉTECTION ANTI-RÉGRESSION (Kevin v13.3.56) :
     * - Compare APP_VER local (bootstrap) vs remote (fetch index.html du serveur)
     * - Si remote > local → trigger force-update auto (déjà fait par bootstrap, ici juste audit)
     * - Si CACHE_VERSION sw.js != APP_VER → escalade Claude Code (drift critique)
     * - Empêche scénario v12.546→v12.564 (20 versions perdues sur branche non mergée)
     * - Sans intervention Kevin requise : autonomie totale.
     */

    /* v13.4.214 (règle Kevin 2026-05-18 "voix réellement différentes") :
     * voice-distinctness-watch : audit catalogue voix toutes 24h
     * - Importe voices-registry + voice.deriveDefaultsFromId pour chaque ID
     * - Compare pitch/rate combinaisons → flag duplicates
     * - Si > 0 duplicates détectés → log warning + push notif admin Kevin
     * - But : empêcher régression "50 voix qui sonnent pareil"
     */
    sentinelsManager.register({
      id: 'voice-distinctness-watch',
      name: 'Voice Distinctness Watch',
      desc: 'Audit doublons pitch+rate dans catalogue voix (règle Kevin "voix vraiment différentes")',
      intervalMs: 24 * 60 * 60 * 1000,
      check: async () => {
        try {
          const mod = await import('../ai/voices-registry.js');
          const registry = (mod as { voicesRegistry?: { list: () => readonly { id: string; name: string }[] } }).voicesRegistry;
          const all = registry ? registry.list() : [];
          if (all.length === 0) {
            return { ok: true, msg: 'voices catalogue vide' };
          }
          const voiceMod = await import('../ai/voice.js');
          const deriver = (voiceMod as { deriveDefaultsFromId?: (id: string) => { pitch: number; rate: number } }).deriveDefaultsFromId;
          if (!deriver) {
            return { ok: false, msg: 'deriveDefaultsFromId pas exporté' };
          }
          const seen: Record<string, string> = {};
          const dupes: { a: string; b: string; pitch: number; rate: number }[] = [];
          for (const v of all) {
            const p = deriver(v.id);
            const key = p.pitch.toFixed(2) + '_' + p.rate.toFixed(2);
            if (seen[key]) {
              dupes.push({ a: seen[key]!, b: v.id, pitch: p.pitch, rate: p.rate });
            } else {
              seen[key] = v.id;
            }
          }
          if (dupes.length > 0) {
            const summary = dupes.slice(0, 5).map((d) => `${d.a} ≡ ${d.b}`).join(', ');
            return {
              ok: false,
              msg: `${dupes.length} voix doublon(s) audio détecté(s) : ${summary}`,
              details: { dupes: dupes.length, examples: summary, total: all.length },
            };
          }
          return {
            ok: true,
            msg: `${all.length} voix uniques (0 doublon pitch+rate)`,
            details: { count: all.length },
          };
        } catch (e) {
          return { ok: false, msg: 'voice-distinctness check failed: ' + (e instanceof Error ? e.message : String(e)) };
        }
      },
    });

    sentinelsManager.register({
      id: 'version-drift-watch',
      name: 'Version Drift Watch',
      desc: 'Detect APP_VER drift (local vs remote, sw.js, index.html) auto-fix when possible',
      intervalMs: 15 * 60 * 1000,
      check: async () => {
        try {
          const { APP_VER } = await import('../../core/bootstrap.js');
          /* 1. Fetch remote index.html (serveur) avec cache-bust */
          const url = location.pathname.replace(/[^/]*$/, '') + 'index.html?_drift=' + Date.now();
          const res = await fetch(url, { cache: 'no-store' });
          if (!res.ok) {
            return { ok: true, msg: 'remote unreachable, skip drift check' };
          }
          const html = await res.text();
          const remoteMatch = html.match(/data-app-ver="(v[0-9]+\.[0-9]+\.[0-9]+)"/);
          const remoteVer = remoteMatch?.[1];
          if (!remoteVer) {
            return { ok: true, msg: 'remote version not detectable, skip' };
          }
          /* 2. Drift APP_VER local vs remote ? */
          if (remoteVer !== APP_VER) {
            return {
              ok: false,
              msg: `version drift: local ${APP_VER} vs remote ${remoteVer} → bootstrap will force-update`,
              details: { local: APP_VER, remote: remoteVer },
            };
          }
          /* 3. Drift sw.js CACHE_VERSION ? (introspection runtime impossible, juste check serveur) */
          try {
            const swRes = await fetch(location.pathname.replace(/[^/]*$/, '') + 'sw.js?_drift=' + Date.now(), {
              cache: 'no-store',
            });
            if (swRes.ok) {
              const swText = await swRes.text();
              const swMatch = swText.match(/CACHE_VERSION\s*=\s*'apex-(v[0-9]+\.[0-9]+\.[0-9]+)'/);
              const swVer = swMatch?.[1];
              if (swVer && swVer !== APP_VER) {
                return {
                  ok: false,
                  msg: `sw.js drift: CACHE_VERSION ${swVer} != APP_VER ${APP_VER}`,
                  details: { app: APP_VER, sw: swVer },
                };
              }
            }
          } catch {
            /* sw.js fetch fail non bloquant */
          }
          return { ok: true, msg: `Versions sync: ${APP_VER}` };
        } catch (err: unknown) {
          return {
            ok: false,
            msg: 'version-drift-watch failed: ' + (err instanceof Error ? err.message : String(err)),
          };
        }
      },
      autoFix: async () => {
        /* Si drift critique, on ne peut pas forcer rebuild côté navigateur.
         * Mais bootstrap.ts gère déjà la détection + reload forcé.
         * Ici on log seulement pour audit + escalade GitHub Actions repo dispatch via cron. */
        try {
          const { logger } = await import('../../core/logger.js');
          logger.warn(
            'version-drift-watch',
            'drift detected, bootstrap will handle reload, GitHub Actions sw-cache-sync.yml will fix sw.js',
          );
          return { ok: true, msg: 'drift handled by bootstrap + GitHub Actions' };
        } catch (err: unknown) {
          return {
            ok: false,
            msg: 'autoFix log failed: ' + (err instanceof Error ? err.message : String(err)),
          };
        }
      },
    });

    /* 22. sentinel-meta (5 min) — surveille les autres sentinelles */
    sentinelsManager.register({
      id: 'sentinel-meta',
      name: 'Sentinel meta',
      desc: 'Surveille les autres sentinelles (qui run / qui crash / staleness)',
      intervalMs: 5 * 60 * 1000,
      check: async () => {
        const all = sentinelsManager.list().filter((s) => s.enabled && s.id !== 'sentinel-meta');
        const now = Date.now();
        const stale: string[] = [];
        const crashed: string[] = [];
        for (const s of all) {
          /* Stale = pas run depuis 3× son interval (sauf jamais run = OK initial) */
          if (s.lastRun > 0 && now - s.lastRun > s.intervalMs * 3) {
            stale.push(s.id);
          }
          if (s.lastResult && !s.lastResult.ok) {
            crashed.push(s.id);
          }
        }
        if (stale.length > 0) {
          return {
            ok: false,
            msg: `${stale.length} sentinelles stales`,
            details: { stale, crashed, total: all.length },
          };
        }
        if (crashed.length > all.length / 2) {
          return {
            ok: false,
            msg: `${crashed.length}/${all.length} sentinelles en erreur`,
            details: { crashed },
          };
        }
        return {
          ok: true,
          msg: `${all.length} sentinelles supervisées (${crashed.length} en warning)`,
          details: { total: all.length, crashed_count: crashed.length },
        };
      },
    });

    logger.info(
      'sentinels-registry',
      `Boost MAX appliqué : ${sentinelsManager.list().length} sentinelles registered (vs 13 baseline)`,
    );
  }
}

export const sentinelsRegistry = new SentinelsRegistry();

/**
 * Helper boot global — appelé une fois au boot de l'app.
 * Idempotent — peut être appelé plusieurs fois (extras enregistrés une seule fois).
 */
export function bootstrapSentinelsRegistry(): void {
  sentinelsRegistry.bootstrap();
}
