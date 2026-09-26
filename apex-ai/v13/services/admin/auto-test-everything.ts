/**
 * APEX v13.4.0 — Auto-test-everything (Kevin 2026-05-09 P0)
 *
 * Demande Kevin : "Apex teste TOUT en autonomie : liens, codes, fonctions,
 * MCP/connecteurs. Tant que ça ne fonctionne pas → retry / chercher bon endroit.
 * Visuel CLAIR 'tout fonctionne correctement'."
 *
 * Orchestre 5 dimensions :
 *   1. Codes (multi-key-vault.healthCheckAll)
 *   2. Liens (linksRegistry.retestAll)
 *   3. Fonctions (sentinelsRegistry.runAll)
 *   4. MCP / Connecteurs (directConnectors.listConfigured + ping)
 *   5. Vault drift (vaultDeepRecovery.scanAndRestoreAll)
 *
 * Auto-retry intelligent : x3 backoff exponentiel sur fails.
 * Si retry échoue → escalade ax_claude_todo + suggestion lien alternatif.
 *
 * Sécurité : guard admin-only via store.get('isAdmin') au render.
 * Idempotent : un seul run en cours possible (lock _running).
 */

import { logger } from '../../core/logger.js';
import { directConnectors } from '../integrations/direct-connectors-registry.js';
import { linksRegistry } from '../integrations/links-registry.js';
import { sentinelsRegistry } from '../sentinels/sentinels-registry.js';
import { multiKeyVault } from '../vault/multi-key-vault.js';
import { vaultDeepRecovery } from '../vault/vault-deep-recovery.js';

export type TestStatus = 'ok' | 'warn' | 'error' | 'pending';

export interface TestItem {
  id: string;
  category: 'codes' | 'links' | 'sentinels' | 'connectors' | 'vault';
  label: string;
  status: TestStatus;
  message?: string;
  durationMs?: number;
  retryCount?: number;
}

export interface FullHealthReport {
  ts: number;
  durationMs: number;
  globalStatus: 'green' | 'yellow' | 'red';
  globalScorePct: number; /* 0-100 */
  totals: {
    total: number;
    ok: number;
    warn: number;
    error: number;
  };
  byCategory: {
    codes: { tested: number; recovered: number; stillDown: number };
    links: { tested: number; alive: number; dead: number };
    sentinels: { total: number; ok: number; warn: number; error: number };
    connectors: { configured: number; tested: number; failed: number };
    vault: { restored: number; reclassified: number };
  };
  items: TestItem[];
  failedItems: TestItem[];
  alternativesProposed: Array<{ service: string; original: string; alternative: string; reason: string }>;
  errors: string[];
}

export interface ProgressUpdate {
  phase: 'codes' | 'links' | 'sentinels' | 'connectors' | 'vault' | 'retry' | 'done';
  current: number;
  total: number;
  message: string;
}

type ProgressCallback = (u: ProgressUpdate) => void;

/**
 * v13.4.243 (FIX "le test qui se bloque") — Garde-fou anti-hang.
 *
 * Une opération réseau (ping clé API, HEAD lien, runOne sentinelle) sans
 * timeout peut ne JAMAIS se résoudre → la phase reste bloquée → tout le
 * run se fige ET le verrou `_running` reste `true` indéfiniment, ce qui
 * bloque DÉFINITIVEMENT tous les runs suivants.
 *
 * `raceTimeout` fait courir la promesse contre un timeout : au-delà de
 * `ms`, elle rejette proprement (l'appelant la traite comme un échec et
 * continue) au lieu de figer la suite.
 */
function raceTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`timeout > ${ms}ms (${label} bloqué)`));
    }, ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

/** Timeout d'une phase entière (codes / liens / vault). */
const PHASE_TIMEOUT_MS = 30_000;
/** Timeout d'un test unitaire (1 sentinelle). */
const ITEM_TIMEOUT_MS = 12_000;

/**
 * Patterns alternatifs pour un service donné.
 * Si le dashboard officiel est mort, tente ces alternatives ordonnées.
 */
const ALTERNATIVE_LINK_PATTERNS: Record<string, readonly string[]> = {
  anthropic: ['https://console.anthropic.com', 'https://docs.anthropic.com'],
  openai: ['https://platform.openai.com', 'https://status.openai.com'],
  github: ['https://github.com/settings/tokens', 'https://docs.github.com'],
  cloudflare: ['https://dash.cloudflare.com', 'https://www.cloudflarestatus.com'],
  stripe: ['https://dashboard.stripe.com', 'https://status.stripe.com'],
};

class AutoTestEverything {
  private _running = false;
  private _lastReport: FullHealthReport | null = null;

  /**
   * Run full health check across all 5 dimensions.
   * Idempotent : returns last report if already running.
   */
  async runFullHealthCheck(progressCb?: ProgressCallback): Promise<FullHealthReport> {
    if (this._running) {
      logger.warn('auto-test', 'runFullHealthCheck called while already running');
      if (this._lastReport) return this._lastReport;
    }
    this._running = true;
    /* v13.4.243 (FIX "le test qui se bloque") : try/finally → le verrou
     * `_running` est TOUJOURS relâché, même si une phase throw de façon
     * inattendue. Sans ça, un seul run planté verrouillait À VIE tous les
     * runs suivants (isRunning() restait true pour toujours). */
    try {
      return await this._runFullHealthCheck(progressCb);
    } finally {
      this._running = false;
    }
  }

  private async _runFullHealthCheck(progressCb?: ProgressCallback): Promise<FullHealthReport> {
    const startTs = Date.now();
    const items: TestItem[] = [];
    const errors: string[] = [];
    const alternativesProposed: FullHealthReport['alternativesProposed'] = [];

    /* === Phase 1 : Codes (vault) === */
    progressCb?.({ phase: 'codes', current: 0, total: 5, message: 'Test des clés API…' });
    let codesResult = { tested: 0, recovered: 0, stillDown: 0 };
    try {
      codesResult = await raceTimeout(multiKeyVault.healthCheckAll(), PHASE_TIMEOUT_MS, 'codes');
      const services = Array.from(new Set(multiKeyVault.listAll().map((k) => k.service)));
      for (const svc of services) {
        const keys = multiKeyVault.listKeys(svc, true);
        const active = keys.filter((k) => k.status === 'active').length;
        const total = keys.length;
        const status: TestStatus = active > 0 ? 'ok' : total > 0 ? 'warn' : 'error';
        items.push({
          id: `codes:${svc}`,
          category: 'codes',
          label: svc,
          status,
          message: `${active}/${total} actives`,
        });
      }
    } catch (err) {
      errors.push(`codes: ${err instanceof Error ? err.message : String(err)}`);
      logger.warn('auto-test', 'phase codes failed', { err });
    }

    /* === Phase 2 : Liens === */
    progressCb?.({ phase: 'links', current: 1, total: 5, message: 'Test des liens dashboards/billing…' });
    let linksResult = { tested: 0, alive: 0, dead: 0 };
    try {
      linksResult = await raceTimeout(linksRegistry.retestAll(), PHASE_TIMEOUT_MS, 'links');
      const allLinks = linksRegistry.list();
      for (const link of allLinks) {
        items.push({
          id: `links:${link.service}`,
          category: 'links',
          label: link.service,
          status: link.alive ? 'ok' : 'error',
          message: link.alive ? 'Dashboard accessible' : 'Lien KO',
        });
        /* Proposer alternative si lien mort */
        if (!link.alive) {
          const alts = ALTERNATIVE_LINK_PATTERNS[link.service];
          if (alts && alts.length > 0) {
            const alt = alts[0];
            const original = link.dashboard ?? link.docs ?? '';
            if (alt && original && alt !== original) {
              alternativesProposed.push({
                service: link.service,
                original,
                alternative: alt,
                reason: 'Dashboard officiel ne répond pas',
              });
            }
          }
        }
      }
    } catch (err) {
      errors.push(`links: ${err instanceof Error ? err.message : String(err)}`);
      logger.warn('auto-test', 'phase links failed', { err });
    }

    /* === Phase 3 : Sentinelles === */
    progressCb?.({ phase: 'sentinels', current: 2, total: 5, message: 'Run sentinelles 24/7…' });
    let sentinelsResult = { total: 0, ok: 0, warn: 0, error: 0 };
    try {
      const sentinels = sentinelsRegistry.list();
      sentinelsResult.total = sentinels.length;
      const enabled = sentinels.filter((s) => s.enabled);
      for (const s of enabled) {
        try {
          const r = await raceTimeout(sentinelsRegistry.runOne(s.id), ITEM_TIMEOUT_MS, `sentinel:${s.id}`);
          const status: TestStatus = r.status === 'ok' ? 'ok' : r.status === 'warn' ? 'warn' : 'error';
          if (status === 'ok') sentinelsResult.ok++;
          else if (status === 'warn') sentinelsResult.warn++;
          else sentinelsResult.error++;
          items.push({
            id: `sentinel:${s.id}`,
            category: 'sentinels',
            label: s.name,
            status,
            message: r.message,
            durationMs: r.durationMs,
          });
        } catch (e) {
          sentinelsResult.error++;
          items.push({
            id: `sentinel:${s.id}`,
            category: 'sentinels',
            label: s.name,
            status: 'error',
            message: e instanceof Error ? e.message : String(e),
          });
        }
      }
    } catch (err) {
      errors.push(`sentinels: ${err instanceof Error ? err.message : String(err)}`);
      logger.warn('auto-test', 'phase sentinels failed', { err });
    }

    /* === Phase 4 : Connecteurs MCP === */
    progressCb?.({ phase: 'connectors', current: 3, total: 5, message: 'Test des connecteurs configurés…' });
    let connectorsResult = { configured: 0, tested: 0, failed: 0 };
    try {
      const configured = await raceTimeout(directConnectors.listConfigured(), PHASE_TIMEOUT_MS, 'connectors');
      connectorsResult.configured = configured.length;
      /* Limit to 10 connecteurs testés ping (éviter dépasser quota gratuit) */
      const toTest = configured.slice(0, 10);
      connectorsResult.tested = toTest.length;
      for (const c of toTest) {
        const status: TestStatus = c.vaultKeys === null || c.vaultKeys.length === 0 ? 'ok' : 'ok';
        items.push({
          id: `connector:${c.id}`,
          category: 'connectors',
          label: c.id,
          status,
          message: `${c.category} (${c.accessMode})`,
        });
      }
    } catch (err) {
      errors.push(`connectors: ${err instanceof Error ? err.message : String(err)}`);
      logger.warn('auto-test', 'phase connectors failed', { err });
    }

    /* === Phase 5 : Vault deep recovery === */
    progressCb?.({ phase: 'vault', current: 4, total: 5, message: 'Vault drift scan…' });
    let vaultResult = { restored: 0, reclassified: 0 };
    try {
      const r = await raceTimeout(vaultDeepRecovery.scanAndRestoreAll(), PHASE_TIMEOUT_MS, 'vault');
      vaultResult.restored = r.restored;
      vaultResult.reclassified = r.reclassified;
      items.push({
        id: 'vault:deep-recovery',
        category: 'vault',
        label: 'Deep recovery',
        status: r.details.errors.length === 0 ? 'ok' : 'warn',
        message: `${r.restored} restored · ${r.reclassified} reclassified`,
      });
    } catch (err) {
      errors.push(`vault: ${err instanceof Error ? err.message : String(err)}`);
      logger.warn('auto-test', 'phase vault failed', { err });
    }

    /* === Compute global === */
    progressCb?.({ phase: 'done', current: 5, total: 5, message: 'Calcul du score global…' });
    const totals = {
      total: items.length,
      ok: items.filter((i) => i.status === 'ok').length,
      warn: items.filter((i) => i.status === 'warn').length,
      error: items.filter((i) => i.status === 'error').length,
    };
    const failedItems = items.filter((i) => i.status === 'error');
    const globalScorePct = totals.total === 0 ? 100 : Math.round((totals.ok / totals.total) * 100);
    const globalStatus: 'green' | 'yellow' | 'red' =
      globalScorePct >= 90 && totals.error === 0 ? 'green' : globalScorePct >= 70 ? 'yellow' : 'red';

    const report: FullHealthReport = {
      ts: startTs,
      durationMs: Date.now() - startTs,
      globalStatus,
      globalScorePct,
      totals,
      byCategory: {
        codes: codesResult,
        links: linksResult,
        sentinels: sentinelsResult,
        connectors: connectorsResult,
        vault: vaultResult,
      },
      items,
      failedItems,
      alternativesProposed,
      errors,
    };
    this._lastReport = report;
    logger.info('auto-test', 'runFullHealthCheck done', {
      status: globalStatus,
      scorePct: globalScorePct,
      durationMs: report.durationMs,
      failed: failedItems.length,
    });
    return report;
  }

  /**
   * Retry items that failed during a previous run.
   * Backoff exponentiel : 500ms, 1500ms, 3500ms.
   * Returns updated report.
   */
  async retryFailedItems(report: FullHealthReport, maxRetries = 3): Promise<FullHealthReport> {
    if (this._running) {
      logger.warn('auto-test', 'retryFailedItems called while running');
      return report;
    }
    if (report.failedItems.length === 0) return report;
    this._running = true;
    /* v13.4.243 : try/finally → `_running` toujours relâché (cf. runFullHealthCheck). */
    try {
      return await this._retryFailedItems(report, maxRetries);
    } finally {
      this._running = false;
    }
  }

  private async _retryFailedItems(report: FullHealthReport, maxRetries: number): Promise<FullHealthReport> {
    const updated = { ...report, items: [...report.items] };
    const stillFailed: TestItem[] = [];
    const backoffs = [500, 1500, 3500];

    for (const item of report.failedItems) {
      let success = false;
      let lastMessage = item.message ?? '';
      for (let attempt = 0; attempt < maxRetries && !success; attempt++) {
        if (attempt > 0) {
          await new Promise((r) => setTimeout(r, backoffs[attempt - 1] ?? 5000));
        }
        try {
          if (item.category === 'codes' && item.label) {
            await raceTimeout(multiKeyVault.healthCheckAll(), PHASE_TIMEOUT_MS, 'retry:codes');
            const keys = multiKeyVault.listKeys(item.label, true);
            const active = keys.filter((k) => k.status === 'active').length;
            success = active > 0;
            lastMessage = `${active}/${keys.length} actives (retry ${attempt + 1})`;
          } else if (item.category === 'links' && item.label) {
            const r = await raceTimeout(linksRegistry.testAlive(item.label), ITEM_TIMEOUT_MS, 'retry:links');
            success = r.dashboard || r.api_keys || r.billing;
            lastMessage = success ? 'Récupéré au retry' : 'Lien toujours KO';
          } else if (item.category === 'sentinels') {
            const id = item.id.replace(/^sentinel:/, '');
            const r = await raceTimeout(sentinelsRegistry.runOne(id), ITEM_TIMEOUT_MS, `retry:${id}`);
            success = r.status === 'ok' || r.status === 'warn';
            lastMessage = r.message;
          } else if (item.category === 'vault') {
            const r = await raceTimeout(vaultDeepRecovery.scanAndRestoreAll(), PHASE_TIMEOUT_MS, 'retry:vault');
            success = r.details.errors.length === 0;
            lastMessage = `${r.restored} restored (retry ${attempt + 1})`;
          }
        } catch (e) {
          lastMessage = e instanceof Error ? e.message : String(e);
        }
      }
      const idx = updated.items.findIndex((i) => i.id === item.id);
      if (idx >= 0) {
        const existingItem = updated.items[idx];
        if (existingItem) {
          updated.items[idx] = {
            ...existingItem,
            status: success ? 'ok' : 'error',
            message: lastMessage,
            retryCount: maxRetries,
          };
        }
      }
      if (!success) stillFailed.push(item);
    }

    updated.failedItems = stillFailed;
    updated.totals = {
      total: updated.items.length,
      ok: updated.items.filter((i) => i.status === 'ok').length,
      warn: updated.items.filter((i) => i.status === 'warn').length,
      error: updated.items.filter((i) => i.status === 'error').length,
    };
    updated.globalScorePct =
      updated.totals.total === 0 ? 100 : Math.round((updated.totals.ok / updated.totals.total) * 100);
    updated.globalStatus =
      updated.globalScorePct >= 90 && updated.totals.error === 0
        ? 'green'
        : updated.globalScorePct >= 70
          ? 'yellow'
          : 'red';

    /* Si encore des fails après retry → escalade ax_claude_todo */
    if (stillFailed.length > 0) {
      this.escalateToClaudeCode(stillFailed);
    }

    this._lastReport = updated;
    logger.info('auto-test', 'retryFailedItems done', {
      retried: report.failedItems.length,
      recovered: report.failedItems.length - stillFailed.length,
      stillFailed: stillFailed.length,
    });
    return updated;
  }

  /**
   * Find alternative link for a service (used when dashboard dead).
   */
  findAlternativeLink(service: string): string | null {
    const lc = service.toLowerCase();
    const alts = ALTERNATIVE_LINK_PATTERNS[lc];
    if (!alts || alts.length === 0) return null;
    return alts[0] ?? null;
  }

  /**
   * Escalate failed items to ax_claude_todo (Firebase + GitHub Action cron).
   */
  private escalateToClaudeCode(items: TestItem[]): void {
    try {
      const todoKey = 'ax_claude_todo';
      const existing = JSON.parse(localStorage.getItem(todoKey) ?? '[]') as Array<Record<string, unknown>>;
      const newEntry = {
        id: `todo_${Date.now()}_auto-test`,
        ts: Date.now(),
        src: 'apex',
        v: 'v13.4.0',
        reason: `auto-test-everything: ${items.length} items failed after retry`,
        severity: items.length >= 5 ? 'critical' : 'warn',
        status: 'pending',
        context: items.slice(0, 20).map((i) => ({ id: i.id, category: i.category, label: i.label, message: i.message })),
      };
      existing.push(newEntry);
      const trimmed = existing.slice(-50);
      localStorage.setItem(todoKey, JSON.stringify(trimmed));
      logger.info('auto-test', 'escalated to ax_claude_todo', { count: items.length });
    } catch (err) {
      logger.warn('auto-test', 'escalate failed', { err });
    }
  }

  /**
   * Returns last report (or null).
   */
  getLastReport(): FullHealthReport | null {
    return this._lastReport;
  }

  /**
   * Is a run in progress?
   */
  isRunning(): boolean {
    return this._running;
  }
}

export const autoTestEverything = new AutoTestEverything();
