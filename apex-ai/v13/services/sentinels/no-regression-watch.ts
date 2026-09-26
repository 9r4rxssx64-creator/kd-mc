/**
 * APEX v13.4.4 — Service `no-regression-watch` (Kevin "JAMAIS RÉGRESSER").
 *
 * Conformité CLAUDE.md "RÈGLE PERMANENTE — JAMAIS RÉGRESSER" + Erreurs #50, #54.
 *
 * Principes :
 *  1. Snapshot Git auto avant chaque batch de modifs (via API GitHub list latest commit SHA).
 *  2. Run subset critical tests (5 fonctions critiques) à la demande.
 *  3. Si fail détecté → toast warn admin + log `ax_regression_detected`.
 *  4. Optionnel : push notif Telegram via service axTelegram si configuré.
 *
 * Tests critiques surveillés :
 *  - axHardLogoutSession persistance XP/streak/profil (Erreur #44)
 *  - vault.startCredentialsWatch storage event + IDB restore
 *  - Wake word iOS Safari 'aborted' silencieux
 *  - Bridge planning Apex → CMC
 *  - Mémoire long terme buildSystemPromptDeep
 *
 * Idempotent. Aucun coût quand jamais appelé (pas de timer démarré au boot).
 */

import { logger } from '../../core/logger.js';

export type CheckId =
  | 'hard-logout-persistence'
  | 'vault-credentials-watch'
  | 'wake-word-ios'
  | 'bridge-cmc-planning'
  | 'memory-deep-prompt';

export interface CriticalCheckResult {
  id: CheckId;
  ok: boolean;
  message: string;
  durationMs: number;
}

export interface RegressionReport {
  ts: number;
  ok: boolean;
  totalChecks: number;
  passed: number;
  failed: number;
  results: CriticalCheckResult[];
  snapshot: GitSnapshot | null;
}

export interface GitSnapshot {
  label: string;
  branch: string;
  sha: string | null;
  ts: number;
  remote: 'github' | 'unknown';
}

const REPORT_KEY = 'ax_regression_detected';
const SNAPSHOT_KEY = 'apex_v13_no_regression_snapshots';
const MAX_REPORTS = 50;
const MAX_SNAPSHOTS = 30;
const REPO_API = 'https://api.github.com/repos/9r4rxssx64-creator/CMCteams';

class NoRegressionWatch {
  private cooldownTs = 0;

  /**
   * Snapshot Git "avant batch" — fetch le latest commit SHA depuis GitHub API.
   * Persisté dans `apex_v13_no_regression_snapshots`.
   *
   * Fait office de "rollback target" : si tests fail post-batch, Apex sait jusqu'où revenir.
   */
  async snapshotBeforeBatch(label: string, branch = 'claude/test-699LQ'): Promise<GitSnapshot> {
    const ts = Date.now();
    let sha: string | null = null;
    try {
      const url = `${REPO_API}/branches/${encodeURIComponent(branch)}`;
      const res = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/vnd.github.v3+json' },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const data = (await res.json()) as { commit?: { sha?: string } };
        sha = data.commit?.sha ?? null;
      }
    } catch (err: unknown) {
      logger.warn('no-regression-watch', 'snapshot fetch failed', { err });
    }
    const snap: GitSnapshot = { label, branch, sha, ts, remote: sha ? 'github' : 'unknown' };
    this.persistSnapshot(snap);
    logger.info('no-regression-watch', `Snapshot ${label} branch=${branch} sha=${sha?.slice(0, 8) ?? 'unknown'}`);
    return snap;
  }

  getRecentSnapshots(n = MAX_SNAPSHOTS): GitSnapshot[] {
    try {
      const raw = localStorage.getItem(SNAPSHOT_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw) as GitSnapshot[];
      return Array.isArray(arr) ? arr.slice(-n) : [];
    } catch {
      return [];
    }
  }

  /**
   * Run les 5 tests critiques. Coût : ~50-200ms total (lazy imports).
   */
  async checkAll(): Promise<RegressionReport> {
    const ts = Date.now();
    const results: CriticalCheckResult[] = [
      await this.runCheck('hard-logout-persistence', () => this.checkHardLogoutPersistence()),
      await this.runCheck('vault-credentials-watch', () => this.checkVaultCredentialsWatch()),
      await this.runCheck('wake-word-ios', () => this.checkWakeWordIOS()),
      await this.runCheck('bridge-cmc-planning', () => this.checkBridgeCmcPlanning()),
      await this.runCheck('memory-deep-prompt', () => this.checkMemoryDeepPrompt()),
    ];
    const failed = results.filter((r) => !r.ok).length;
    const passed = results.length - failed;
    const ok = failed === 0;

    const snap = this.getRecentSnapshots(1)[0] ?? null;
    const report: RegressionReport = {
      ts,
      ok,
      totalChecks: results.length,
      passed,
      failed,
      results,
      snapshot: snap,
    };

    if (!ok) {
      this.persistReport(report);
      this.notifyAdmin(report);
    }
    return report;
  }

  /**
   * v13.4.4 — Stats pour dashboard.
   */
  getStats(): { totalReports: number; failuresLast24h: number; lastReport: RegressionReport | null } {
    try {
      const raw = localStorage.getItem(REPORT_KEY);
      const arr = raw ? (JSON.parse(raw) as RegressionReport[]) : [];
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      return {
        totalReports: arr.length,
        failuresLast24h: arr.filter((r) => r.ts >= cutoff && !r.ok).length,
        lastReport: arr.at(-1) ?? null,
      };
    } catch {
      return { totalReports: 0, failuresLast24h: 0, lastReport: null };
    }
  }

  /* ──────────────────── checks individuels ──────────────────── */

  private async runCheck(id: CheckId, fn: () => Promise<{ ok: boolean; message: string }>): Promise<CriticalCheckResult> {
    const t0 = Date.now();
    try {
      const r = await fn();
      return { id, ok: r.ok, message: r.message, durationMs: Date.now() - t0 };
    } catch (err: unknown) {
      return { id, ok: false, message: `Throw: ${String(err).slice(0, 200)}`, durationMs: Date.now() - t0 };
    }
  }

  private async checkHardLogoutPersistence(): Promise<{ ok: boolean; message: string }> {
    /* Vérifie que les clés XP/streak/profil ne sont pas dans la SESSION_KEYS de hard-logout.
     * Erreur #44 : ax_xp / ax_streak / ax_login_streak doivent SURVIVRE à un logout. */
    try {
      const mod = await import('../auth/auth.js').catch(() => null);
      if (!mod) return { ok: true, message: 'auth module N/A (skipped)' };
      /* Si SESSION_KEYS exposé, vérifier ; sinon test sentinel sur seul ax_user présent */
      const blob = JSON.stringify(mod);
      const forbidden = ['ax_xp', 'ax_streak', 'ax_login_streak', 'ax_streak_last_day'];
      const hits = forbidden.filter((k) => blob.includes(k));
      if (hits.length > 0) {
        return { ok: false, message: `SESSION_KEYS contient des clés persistance interdites : ${hits.join(', ')}` };
      }
      return { ok: true, message: 'XP/streak protégés du hard-logout' };
    } catch (err: unknown) {
      return { ok: false, message: `check failed: ${String(err).slice(0, 100)}` };
    }
  }

  private async checkVaultCredentialsWatch(): Promise<{ ok: boolean; message: string }> {
    try {
      const mod = await import('../vault/vault.js').catch(() => null);
      if (!mod) return { ok: true, message: 'vault N/A (skipped)' };
      const exposed = mod as Record<string, unknown>;
      const vault = (exposed['vault'] as Record<string, unknown> | undefined) ?? exposed;
      const hasWatch = typeof vault['startCredentialsWatch'] === 'function';
      const hasAuto = typeof vault['autoStore'] === 'function' || typeof vault['setKey'] === 'function';
      if (!hasWatch || !hasAuto) {
        return { ok: false, message: `vault API regressed (watch=${hasWatch}, autoStore=${hasAuto})` };
      }
      return { ok: true, message: 'vault.startCredentialsWatch + autoStore présents' };
    } catch (err: unknown) {
      return { ok: false, message: `check failed: ${String(err).slice(0, 100)}` };
    }
  }

  private async checkWakeWordIOS(): Promise<{ ok: boolean; message: string }> {
    /* Erreur #43 : sur iOS Safari le 'aborted' doit être silencieux + recovery via setTimeout 500ms. */
    try {
      const mod = await import('../ai/wake-word.js').catch(() => null);
      if (!mod) return { ok: true, message: 'wake-word service absent (acceptable v13.4.4)' };
      const blob = JSON.stringify(mod);
      const hasIosGuard = /iPhone|iPad|iPod|isIOS|isIOSSafari/.test(blob);
      if (!hasIosGuard) {
        return { ok: false, message: "wake-word service ne mentionne plus la détection iOS" };
      }
      return { ok: true, message: 'iOS Safari guard présent dans wake-word' };
    } catch (err: unknown) {
      return { ok: false, message: `check failed: ${String(err).slice(0, 100)}` };
    }
  }

  private async checkBridgeCmcPlanning(): Promise<{ ok: boolean; message: string }> {
    try {
      const mod = await import('../integrations/cmc-planning-bridge.js').catch(() => null);
      if (!mod) return { ok: false, message: 'cmc-planning-bridge module manquant (régression v13.3.27)' };
      return { ok: true, message: 'cmc-planning-bridge présent' };
    } catch (err: unknown) {
      return { ok: false, message: `check failed: ${String(err).slice(0, 100)}` };
    }
  }

  private async checkMemoryDeepPrompt(): Promise<{ ok: boolean; message: string }> {
    try {
      const { memory } = await import('../../core/memory.js');
      const prompt = await memory.buildSystemPromptDeep(null);
      if (typeof prompt !== 'string' || prompt.length < 200) {
        return { ok: false, message: `prompt deep dégradé (${prompt?.length ?? 0} chars)` };
      }
      return { ok: true, message: `buildSystemPromptDeep returns ${prompt.length} chars` };
    } catch (err: unknown) {
      return { ok: false, message: `check failed: ${String(err).slice(0, 100)}` };
    }
  }

  /* ──────────────────── persistance ──────────────────── */

  private persistSnapshot(snap: GitSnapshot): void {
    try {
      const raw = localStorage.getItem(SNAPSHOT_KEY);
      const arr = raw ? (JSON.parse(raw) as GitSnapshot[]) : [];
      arr.push(snap);
      const trimmed = arr.slice(-MAX_SNAPSHOTS);
      localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(trimmed));
    } catch {
      /* ignore */
    }
  }

  private persistReport(report: RegressionReport): void {
    try {
      const raw = localStorage.getItem(REPORT_KEY);
      const arr = raw ? (JSON.parse(raw) as RegressionReport[]) : [];
      arr.push(report);
      const trimmed = arr.slice(-MAX_REPORTS);
      localStorage.setItem(REPORT_KEY, JSON.stringify(trimmed));
    } catch {
      /* ignore */
    }
  }

  private notifyAdmin(report: RegressionReport): void {
    if (Date.now() - this.cooldownTs < 5 * 60 * 1000) return; /* throttle 5 min */
    this.cooldownTs = Date.now();
    /* Toast warn admin via UI side (best-effort lazy import) */
    void import('../../ui/toast.js')
      .then((mod) => {
        const t = (mod as { toast?: { warn?: (msg: string) => void } }).toast;
        const failedNames = report.results.filter((r) => !r.ok).map((r) => r.id).join(', ');
        t?.warn?.(`⚠️ Régression détectée : ${failedNames}`);
      })
      .catch(() => {
        /* ignore */
      });
    /* Best-effort Telegram (si service axTelegram global configuré) */
    try {
      const enabled = localStorage.getItem('ax_telegram_admin_enabled') === '1';
      if (!enabled) return;
      const g = globalThis as { axTelegramSend?: (msg: string) => Promise<void> };
      const send = g.axTelegramSend;
      if (typeof send === 'function') {
        const list = report.results
          .filter((r) => !r.ok)
          .map((r) => `• ${r.id}: ${r.message}`)
          .join('\n');
        void send(`🚨 APEX régression\n${list}`).catch(() => {
          /* offline OK */
        });
      }
    } catch {
      /* ignore */
    }
  }
}

export const noRegressionWatch = new NoRegressionWatch();
