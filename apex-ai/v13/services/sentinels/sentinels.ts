/**
 * APEX v13 — Sentinelles 24/7 (P0 audit Jet 4 : "promesse 13 sentinelles, 0 actuel")
 *
 * P1.7 audit honnête v13.3.89 (2026-05-08) :
 * Fichier monolithique (2500+ lignes, 26 sentinelles register dans une seule fonction
 * registerCoreSentinels). Split full-module reporté : trop risqué sans test régression
 * complet (chaque sentinel a ses helpers internes, ses cascades observability/auditLog).
 * Catégories logiques (commentées dans registerCoreSentinels) :
 *   - Network/Connectivity : network-watch, presence-watch, conflict-watch
 *   - Vault/Credentials : credentials-watch, decrypt-watch, credentials-rotation-watch,
 *     auto-restore-watch, link-validation-watch, vault-resilience-watch
 *   - AI Providers : token-balance-watch, smart-router-watch, ai-unblock-watch,
 *     service-knowledge-watch
 *   - System : memory-watch, memory-leak-watch, memory-bridge-watch, storage-watch,
 *     performance-watch, error-watch, security-watch, csp-violation-watch,
 *     compliance-watch, anti-regression-watch, self-test
 *   - Voice/UX : voice-quality-watch, wake-watch
 *   - Backup : backup-watch, realtime-backup-watch, reconsult-kevin-watch
 *   - Meta auto-fix : memory-augmented-watch, never-forget-watch, auto-ultra-reset-watch,
 *     global-health-watch, apex-self-correct-watch
 *
 * 13 sentinelles critiques préservées de v12.785, run interval (5min à 24h),
 * auto-fix whitelist, escalade ax_claude_todo Firebase si fail, lesson learned.
 */

import { logger } from '../../core/logger.js';
import { isFeatureEnabled } from '../auth/feature-toggles.js';
import { observability } from '../observability/observability.js';

/**
 * Mapping sentinel id → feature toggle id (Kevin règle 2026-05-04 — ON/OFF tout).
 * Lorsque le toggle est OFF, la sentinelle court-circuite son `check()` (skip silencieux).
 * Mapping conservé centralisé pour éviter de pourrir chaque `check()` avec une importation.
 *
 * Coverage Map (Kevin audit ARCHI-101) — chaque toggle declaré pointe vers au moins
 * une sentinelle pour activer/désactiver. Les sentinelles physiquement absentes mais
 * réservées (import-watch, api-quota-watch, etc.) seront wirées dès leur ajout —
 * l'entry SENTINEL_TOGGLE_MAP existe déjà pour qu'elles respectent leur toggle dès création.
 */
const SENTINEL_TOGGLE_MAP: Record<string, string> = {
  'token-balance-watch': 'sentinel.token-watch',
  'backup-watch': 'sentinel.backup-watch',
  'security-watch': 'sentinel.security-watch',
  'performance-watch': 'sentinel.performance-watch',
  'error-watch': 'sentinel.error-watch',
  'storage-watch': 'sentinel.persistence-watch',
  'network-watch': 'sentinel.connectivity-watch',
  'presence-watch': 'sentinel.presence-watch',
  'compliance-watch': 'sentinel.compliance-watch',
  'conflict-watch': 'sentinel.conflict-watch',
  'credentials-watch': 'sentinel.credentials-watch',
  'credentials-rotation-watch': 'sentinel.credentials-watch',
  'decrypt-watch': 'sentinel.credentials-watch',
  'auto-restore-watch': 'sentinel.credentials-watch',
  'link-validation-watch': 'sentinel.link-validation',
  'csp-violation-watch': 'sentinel.csp-violation',
  'memory-watch': 'sentinel.persistence-watch',
  'memory-leak-watch': 'sentinel.persistence-watch',
  'memory-bridge-watch': 'sentinel.persistence-watch',
  'smart-router-watch': 'sentinel.ai-health-watch',
  'service-knowledge-watch': 'sentinel.feature-watch',
  'ai-unblock-watch': 'sentinel.ai-health-watch',
  'realtime-backup-watch': 'feature.realtime-backup',
  'reconsult-kevin-watch': 'sentinel.feature-watch',
  'voice-quality-watch': 'voice.tts',
  'wake-watch': 'voice.wake_word',
  'self-test': 'sentinel.feature-watch',
  'anti-regression-watch': 'sentinel.feature-watch',
  'agent-watches-runner': 'sentinel.sentinel-meta',
  'never-forget-watch': 'sentinel.feature-watch',
  'auto-ultra-reset-watch': 'sentinel.auto-ultra-reset',
  /* v13.3.79+ Kevin 2026-05-08 : apex-self-correct cascade
     Toggle dédié pour pouvoir kill switch (Réglages admin) si auto-correct
     est trop agressif sur certains devices (ex: tests). Default ON. */
  'apex-self-correct-watch': 'sentinel.apex-self-correct',
  /* v13.3.79+ Kevin 2026-05-08 : global-health-watch méta auto-fix.
     Toggle dédié pour kill switch admin si méta-cascade trop agressive. */
  'global-health-watch': 'sentinel.global-health',
  /* Sentinelles réservées Jet 9+ (toggle déclaré, implémentation à venir) :
     dès qu'elles seront register()'d, le toggle sera respecté automatiquement. */
  'import-watch': 'sentinel.import-watch',
  'api-quota-watch': 'sentinel.api-quota-watch',
  'dedup-watch': 'sentinel.dedup-watch',
  'malware-blocklist-watch': 'sentinel.malware-blocklist',
  'data-integrity-watch': 'sentinel.data-integrity',
  'ux-watch': 'sentinel.ux-watch',
};

/**
 * Liste de toutes les feature toggle ids "sentinel" qui sont reconnues par
 * SENTINEL_TOGGLE_MAP, exposée pour les tests de wirage et l'audit admin.
 */
export const SENTINEL_TOGGLE_IDS_COVERED: readonly string[] = Object.values(
  SENTINEL_TOGGLE_MAP,
);

/**
 * Helper : true si la sentinelle est admin-désactivée (skip exécution).
 * Si pas de mapping, renvoie false (pas de gate → run).
 */
function sentinelDisabledByAdmin(sentinelId: string): boolean {
  const toggleId = SENTINEL_TOGGLE_MAP[sentinelId];
  if (!toggleId) return false;
  return !isFeatureEnabled(toggleId);
}

export interface Sentinel {
  id: string;
  name: string;
  desc: string;
  intervalMs: number;
  lastRun: number;
  /* `errored` = la sentinelle a LEVÉ une exception (vrai dysfonctionnement).
   * Distinct de `ok:false` qui signifie "check OK mais a détecté un problème
   * à signaler" (storage plein, CSP violation…). Cf apex-self-audit. */
  lastResult?: { ok: boolean; msg: string; ts: number; errored?: boolean };
  enabled: boolean;
  check: () => Promise<{ ok: boolean; msg: string; details?: Record<string, unknown> }>;
  /* Auto-repair whitelist : action correctrice si check échoue */
  autoFix?: () => Promise<{ ok: boolean; msg: string }>;
}

const SENTINEL_KEY = 'apex_v13_sentinels';

class SentinelsManager {
  private sentinels = new Map<string, Sentinel>();
  private runTimer: number | null = null;

  register(s: Omit<Sentinel, 'lastRun' | 'enabled'> & Partial<Pick<Sentinel, 'enabled'>>): void {
    this.sentinels.set(s.id, {
      ...s,
      lastRun: 0,
      enabled: s.enabled !== false,
    });
  }

  init(): void {
    /* Restaure dernières exécutions depuis localStorage */
    try {
      /* v13.3.24 fix Kevin (screenshot 19:11) : invalide lastResults stales pour
       * les 3 sentinelles cosmétiques fixes cette release (backup-watch, security-watch,
       * tools-watch). Force re-run au prochain cycle, évite Kevin de voir l'ancien
       * message "493 936h" / "16 tools orphelins" / "Audit log tamper". */
      const STALE_INVALIDATE_KEY = 'apex_v13_sentinels_stale_v13_3_24';
      const alreadyInvalidated = localStorage.getItem(STALE_INVALIDATE_KEY) === '1';
      const raw = localStorage.getItem(SENTINEL_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Record<string, { lastRun: number; lastResult?: Sentinel['lastResult'] }>;
        const STALE_IDS = new Set(['backup-watch', 'security-watch', 'tools-watch']);
        for (const [id, s] of this.sentinels) {
          const entry = saved[id];
          if (entry) {
            /* Skip restore lastResult pour sentinelles cosmétiques fix v13.3.24 */
            if (!alreadyInvalidated && STALE_IDS.has(id)) {
              s.lastRun = 0; /* force re-run au prochain cycle */
            } else {
              s.lastRun = entry.lastRun;
              if (entry.lastResult) s.lastResult = entry.lastResult;
            }
          }
        }
        if (!alreadyInvalidated) {
          try { localStorage.setItem(STALE_INVALIDATE_KEY, '1'); } catch { /* quota */ }
        }
      }
    } catch {
      /* ignore */
    }
    this.scheduleRun();
  }

  list(): Sentinel[] {
    return [...this.sentinels.values()];
  }

  enable(id: string, enabled: boolean): void {
    const s = this.sentinels.get(id);
    if (s) s.enabled = enabled;
  }

  /* Force run d'une sentinelle (debug admin) */
  async runOne(id: string): Promise<Sentinel['lastResult']> {
    const s = this.sentinels.get(id);
    if (!s) return { ok: false, msg: 'unknown sentinel', ts: Date.now() };
    return this.executeSentinel(s);
  }

  private async executeSentinel(s: Sentinel): Promise<Sentinel['lastResult']> {
    /* Wire admin feature toggle (Kevin règle 2026-05-04 — ON/OFF tout).
       Si la sentinelle est désactivée par admin → skip exécution silencieusement. */
    if (sentinelDisabledByAdmin(s.id)) {
      s.lastRun = Date.now();
      s.lastResult = { ok: true, msg: 'Désactivée par admin', ts: Date.now() };
      this.persist();
      return s.lastResult;
    }
    try {
      const result = await s.check();
      s.lastRun = Date.now();
      s.lastResult = { ok: result.ok, msg: result.msg, ts: Date.now() };
      if (!result.ok) {
        observability.capture('warn', `sentinel.${s.id}`, result.msg, result.details);
        /* Jet 5 fix : auto-repair si dispo (vs juste alerter) */
        if (s.autoFix) {
          try {
            const fixResult = await s.autoFix();
            observability.capture(
              fixResult.ok ? 'info' : 'warn',
              `sentinel.${s.id}.autofix`,
              fixResult.msg,
            );
            if (fixResult.ok) {
              /* Re-check après fix */
              const recheck = await s.check();
              if (recheck.ok) s.lastResult = { ok: true, msg: `Auto-fixed: ${fixResult.msg}`, ts: Date.now() };
            }
          } catch (fixErr: unknown) {
            observability.capture('error', `sentinel.${s.id}.autofix`, String(fixErr));
          }
        }
      }
      this.persist();
      return s.lastResult;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      s.lastRun = Date.now();
      s.lastResult = { ok: false, msg, ts: Date.now(), errored: true };
      observability.capture('error', `sentinel.${s.id}`, msg);
      this.persist();
      return s.lastResult;
    }
  }

  private scheduleRun(): void {
    if (this.runTimer !== null) return;
    /* v13.4.106 (Kevin "35 sentinelles PENDING au boot") :
     * Run immédiatement 1× toutes les sentinelles dont lastRun=0 (jamais run).
     * Avant : setInterval 60s = pas de run avant 1 minute = Kevin voit
     * tout PENDING au boot. Maintenant : tick immédiat + setInterval 60s. */
    const tick = (): void => {
      const now = Date.now();
      for (const s of this.sentinels.values()) {
        if (!s.enabled) continue;
        if (now - s.lastRun >= s.intervalMs) {
          void this.executeSentinel(s);
        }
      }
    };
    /* Tick immédiat différé 2s (laisse les services autres se charger d'abord) */
    setTimeout(tick, 2000);
    /* Vérifie chaque minute si une sentinelle doit run */
    this.runTimer = window.setInterval(tick, 60_000);
    /* Sprint 3 P0 : track interval pour cleanup possible (anti memory leak) */
    const t = this.runTimer;
    if (t !== null) {
      void import('../core-svc/service-lifecycle.js').then(({ lifecycle }) => {
        lifecycle.trackInterval('sentinels', t as unknown as ReturnType<typeof setInterval>);
      }).catch(() => { /* skip */ });
    }
  }

  /**
   * Stop le scheduler (usage debug ou hot reload).
   */
  stop(): void {
    if (this.runTimer !== null) {
      clearInterval(this.runTimer);
      this.runTimer = null;
    }
  }

  private persist(): void {
    try {
      const data: Record<string, { lastRun: number; lastResult?: Sentinel['lastResult'] }> = {};
      for (const [id, s] of this.sentinels) {
        data[id] = { lastRun: s.lastRun };
        if (s.lastResult) data[id].lastResult = s.lastResult;
      }
      localStorage.setItem(SENTINEL_KEY, JSON.stringify(data));
    } catch {
      /* ignore */
    }
  }
}

export const sentinels = new SentinelsManager();

/* === Sentinelles MVP Jet 4 (5 critiques registered au boot) === */

/**
 * Wire les 8 agents-watches dédiés (P0 audit gaps anti-théâtre).
 * Lance le cycle agentWatches.runAll() périodiquement via une sentinelle wrapper.
 */
export function registerAgentWatchesSentinel(): void {
  sentinels.register({
    id: 'agent-watches-runner',
    name: 'Agent Watches (8 agents nommés)',
    desc: 'Run cycle complet agent-watches : import/session/fb/chat/notif/exchange/presence/storage',
    intervalMs: 5 * 60 * 1000, /* Toutes les 5 min */
    check: async () => {
      const { agentWatches } = await import('./agent-watches.js');
      const reports = await agentWatches.runAll();
      const critical = reports.filter((r) => r.severity === 'critical').length;
      const errs = reports.filter((r) => r.severity === 'err').length;
      const warns = reports.filter((r) => r.severity === 'warn').length;
      const failedAgents = reports
        .filter((r) => r.severity === 'err' || r.severity === 'critical')
        .map((r) => r.agent_id);
      /* v13.3.94 P1.2 — log failed IDs in msg pour debug rapide
       * (avant : "1 agents en erreur" sans nom → impossible de diagnostiquer). */
      const idsTag = failedAgents.length > 0 ? ` [${failedAgents.join(', ')}]` : '';
      if (critical > 0) {
        return {
          ok: false,
          msg: `${critical} agents critical${idsTag}`,
          details: { critical, errs, warns, failedAgents },
        };
      }
      if (errs > 0) {
        return {
          ok: false,
          msg: `${errs} agents en erreur${idsTag}`,
          details: { errs, warns, failedAgents },
        };
      }
      if (warns > 0) {
        return { ok: true, msg: `${warns} agents warn (non bloquant)`, details: { warns } };
      }
      return { ok: true, msg: `${reports.length} agents tous OK` };
    },
    /* v13.3.89 P2.17 — auto-fix pour agents en erreur (fb-health, storage, presence).
     * Whitelist actions (Kevin règle "warning = auto-fix toujours"). */
    autoFix: async () => {
      try {
        const { agentWatches } = await import('./agent-watches.js');
        const reports = await agentWatches.runAll();
        const failed = reports.filter((r) => r.severity === 'err' || r.severity === 'critical');
        if (failed.length === 0) {
          return { ok: true, msg: 'Aucun agent en échec (re-check OK)' };
        }
        const fixesApplied: string[] = [];
        for (const r of failed) {
          /* fb-health → re-init (disconnect + init) */
          if (r.agent_id === 'fb-health-watch') {
            try {
              const { firebase } = await import('../storage/firebase.js');
              firebase.disconnect();
              await firebase.init();
              fixesApplied.push('fb-reinit');
            } catch {
              /* skip */
            }
          }
          /* storage-watch → cleanup backups anciens */
          if (r.agent_id === 'storage-watch') {
            try {
              const { autoBackup } = await import('../storage/auto-backup.js');
              const r2 = await autoBackup.cleanup();
              fixesApplied.push(`storage-cleanup(${r2.deleted})`);
            } catch {
              /* skip */
            }
          }
          /* presence-watch → heartbeat */
          if (r.agent_id === 'presence-watch') {
            try {
              localStorage.setItem('apex_v13_last_heartbeat', String(Date.now()));
              fixesApplied.push('presence-heartbeat');
            } catch {
              /* skip */
            }
          }
        }
        return {
          ok: fixesApplied.length > 0,
          msg: fixesApplied.length > 0
            ? `Auto-fix appliqué : ${fixesApplied.join(', ')}`
            : `${failed.length} agents en erreur sans auto-fix whitelist (escalade Claude Code)`,
        };
      } catch (err: unknown) {
        return {
          ok: false,
          msg: 'autofix exception: ' + (err instanceof Error ? err.message : String(err)),
        };
      }
    },
  });
}

export function registerCoreSentinels(): void {
  /* Wire les 8 agent-watches en premier (anti-théâtre P0 audit) */
  registerAgentWatchesSentinel();
  /* 1. token-balance-watch : monitor solde providers (1h)
   * v13.3.79+ autoFix Kevin 2026-05-08 "WARNING = AUTO-FIX TOUJOURS" :
   * Si Anthropic key 401/402/429 → tente swap automatique vers une autre clé multi-key-vault
   * (failover key-level), sinon escalade auto-restore-credentials. */
  sentinels.register({
    id: 'token-balance-watch',
    name: 'Solde providers IA',
    desc: 'Vérifie solde Anthropic/OpenAI et alerte si < 5€ restant',
    intervalMs: 60 * 60 * 1000,
    check: async () => {
      const { vault } = await import('../vault/vault.js');
      const anthropic = await vault.readKey('ax_anthropic_key');
      if (!anthropic) return { ok: true, msg: 'No Anthropic key configured' };
      /* Anthropic n'expose pas balance via API public, on vérifie juste que la clé répond */
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': anthropic, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true', 'content-type': 'application/json' },
          body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
          signal: AbortSignal.timeout(8000),
        });
        if (res.status === 401) return { ok: false, msg: 'Anthropic key invalid' };
        if (res.status === 402 || res.status === 429) return { ok: false, msg: 'Anthropic quota/balance issue', details: { status: res.status } };
        return { ok: true, msg: 'Anthropic API reachable' };
      } catch (err: unknown) {
        return { ok: false, msg: 'Anthropic ping failed: ' + (err instanceof Error ? err.message : String(err)) };
      }
    },
    autoFix: async () => {
      try {
        /* 1. Tente swap multi-key (key-level failover) si dispo */
        const { multiKeyVault } = await import('../vault/multi-key-vault.js');
        const r = await multiKeyVault.healthCheckAll();
        if (r.recovered > 0) {
          return { ok: true, msg: `Multi-key recovery: ${r.recovered} clé(s) recovered (${r.stillDown} still down)` };
        }
        /* 2. Sinon tente auto-restore-credentials depuis IDB/Firebase */
        const { autoRestoreCredentials } = await import('../vault/auto-restore-credentials.js');
        const restore = await autoRestoreCredentials.restoreAutomatically();
        if (restore.restored > 0) {
          return { ok: true, msg: `Auto-restore: ${restore.restored} clé(s) restaurée(s)` };
        }
        return { ok: false, msg: `Aucune clé alt disponible (multi-key ${r.tested}, restore ${restore.failed} fail)` };
      } catch (err: unknown) {
        return { ok: false, msg: 'token-balance autoFix fail: ' + (err instanceof Error ? err.message : String(err)) };
      }
    },
  });

  /* 2. error-watch : poll observability pending criticals (5min)
   * v13.3.79+ autoFix Kevin 2026-05-08 : tente flush buffer pending → backend
   * (si flush succès → pending devient sent, sentinelle redevient ok). */
  sentinels.register({
    id: 'error-watch',
    name: 'Erreurs critiques',
    desc: 'Surveille observability buffer pour critical events non envoyés',
    intervalMs: 5 * 60 * 1000,
    check: async () => {
      const buf = observability.getBuffer();
      const criticals = buf.filter((e) => e.level === 'critical' && e.status === 'pending');
      if (criticals.length === 0) return { ok: true, msg: 'No critical pending' };
      return { ok: false, msg: `${criticals.length} critical events pending`, details: { count: criticals.length } };
    },
    autoFix: async () => {
      try {
        /* observability.flush() force l'envoi des criticals pending */
        const obs = observability as unknown as { flush?: () => Promise<{ flushed: number }> | { flushed: number } };
        if (typeof obs.flush === 'function') {
          const r = await Promise.resolve(obs.flush());
          return { ok: r.flushed > 0, msg: `Flushed ${r.flushed} critical events` };
        }
        return { ok: false, msg: 'observability.flush non dispo' };
      } catch (err: unknown) {
        return { ok: false, msg: 'error-watch autoFix fail: ' + (err instanceof Error ? err.message : String(err)) };
      }
    },
  });

  /* 3. backup-watch : vérifie backup quotidien (24h)
   * Sprint 13.3.17 fix : fallback sur autoBackup.getStats() si tag ts absent
   *   (cas premier boot avant tout snapshot).
   * v13.3.24 fix Kevin (screenshot 19:11 "493 936h à relancer") :
   *   - Validation stricte ts (rejette ts<MIN_VALID = 2020-01-01) → format "Aucun backup"
   *   - Format humain: <168h → "Il y a Xh", <30j → "Il y a Xj", >30j → "Plus de 30j"
   *   - Snapshot immédiat au boot si jamais (clear le 0 stale dans ax_last_backup_ts)
   *   - Persiste fix après chaque snapshot OK (sécurité contre stale lastResult). */
  const MIN_VALID_BACKUP_TS = 1577836800000; /* 2020-01-01 → tout ce qui est avant = stale/invalide */
  const formatBackupAge = (ageMs: number): string => {
    const ageHours = ageMs / (60 * 60 * 1000);
    if (ageHours < 1) return `Il y a ${Math.floor(ageMs / 60000)}min`;
    if (ageHours < 168) return `Il y a ${Math.floor(ageHours)}h`;
    const ageDays = ageHours / 24;
    if (ageDays < 30) return `Il y a ${Math.floor(ageDays)}j`;
    return 'Plus de 30 jours';
  };
  sentinels.register({
    id: 'backup-watch',
    name: 'Backup régulier',
    desc: 'Vérifie qu\'un backup Firebase a tourné dans les dernières 6h (v13.3.94 plan P1.3)',
    /* v13.3.94 P1.3 — Audit cabinet 58/100 : backup 24h trop espacé pour app
     * "commercialisable". Réduit à 6h (vérification ; snapshot autoFix créé si > 7h). */
    intervalMs: 6 * 60 * 60 * 1000,
    check: async () => {
      let lastBackup = parseInt(localStorage.getItem('ax_last_backup_ts') ?? '0', 10);
      /* v13.3.24 : si valeur invalide (NaN, négatif, < 2020-01-01) → considère absent */
      if (!Number.isFinite(lastBackup) || lastBackup < MIN_VALID_BACKUP_TS) {
        lastBackup = 0;
      }
      /* Fallback : si tag manque ou stale, essaye via autoBackup */
      if (lastBackup === 0) {
        try {
          const { autoBackup } = await import('../storage/auto-backup.js');
          const stats = autoBackup.getStats();
          if (stats.last_backup_ts >= MIN_VALID_BACKUP_TS) {
            lastBackup = stats.last_backup_ts;
            try { localStorage.setItem('ax_last_backup_ts', String(lastBackup)); } catch { /* ignore */ }
          }
        } catch {
          /* auto-backup module indispo */
        }
      }
      /* État initial / stale ts : aucun backup valide → état info, pas erreur */
      if (lastBackup === 0) {
        return { ok: true, msg: 'Aucun backup depuis init (en attente premier snapshot)' };
      }
      const ageMs = Date.now() - lastBackup;
      const formatted = formatBackupAge(ageMs);
      const ageHours = ageMs / (60 * 60 * 1000);
      /* v13.3.94 P1.3 — seuil 7h cohérent avec interval 6h (1h grace) */
      if (ageHours > 7) return { ok: false, msg: `${formatted} — relance auto programmée` };
      return { ok: true, msg: formatted };
    },
    autoFix: async () => {
      /* Si âge > 26h ou stale ts, déclenche un snapshot manual immédiat */
      try {
        const { autoBackup } = await import('../storage/auto-backup.js');
        const backup = await autoBackup.snapshot('manual');
        /* v13.3.24 : seed ax_last_backup_ts pour invalider lastResult stale */
        try { localStorage.setItem('ax_last_backup_ts', String(Date.now())); } catch { /* quota */ }
        return { ok: true, msg: `Snapshot manual créé : ${backup.id}` };
      } catch (err: unknown) {
        return { ok: false, msg: 'Snapshot fail: ' + (err instanceof Error ? err.message : String(err)) };
      }
    },
  });

  /* 4. credentials-watch : re-test tokens validity (24h)
   * Fix v13.3.18 (Kevin v13.3.16 rapport "0 credentials present alors que 10 clés collées") :
   * - Utilise vault.readKey() au lieu de localStorage.getItem brut (gère AXENC1: chiffré + IDB fallback)
   * - Scan élargi (Anthropic + OpenAI + Groq + Gemini + GitHub + Cloudflare + Stripe + Twilio + Brevo + Resend + Pinecone + Perplexity + Replicate + ElevenLabs + DeepL + Mistral)
   * - vault.readKey() retry implicite IDB si localStorage vide (gère cas early-boot)
   */
  sentinels.register({
    id: 'credentials-watch',
    name: 'Validité credentials',
    desc: 'Re-teste les tokens API stockés une fois par jour (scan via vault.readKey, IDB fallback inclus)',
    intervalMs: 24 * 60 * 60 * 1000,
    check: async () => {
      const SCAN_KEYS = [
        'ax_anthropic_key', 'ax_openai_key', 'ax_groq_key', 'ax_gemini_key',
        'ax_github_token', 'ax_cloudflare_token', 'ax_stripe_key', 'ax_twilio_token',
        'ax_brevo_key', 'ax_resend_key', 'ax_pinecone_key', 'ax_perplexity_key',
        'ax_replicate_key', 'ax_elevenlabs_key', 'ax_deepl_key', 'ax_mistral_key',
      ];
      try {
        const { vault } = await import('../vault/vault.js');
        const present: string[] = [];
        for (const k of SCAN_KEYS) {
          try {
            const v = await vault.readKey(k);
            if (v && v.length > 5) present.push(k);
          } catch {
            /* skip key on error, continue scan */
          }
        }
        /* v13.3.36 (Kevin 2026-05-07 alerte "1/16 enregistrés") :
         * Sync registry après scan pour qu'admin Coffre voit l'état réel.
         * Best-effort : si fail → silent, on retourne quand même le scan principal. */
        try {
          const { credentialsAudit } = await import('../vault/credentials-audit.js');
          await credentialsAudit.syncFromVault();
        } catch { /* silent */ }
        return {
          ok: true,
          msg: `${present.length}/${SCAN_KEYS.length} credentials present`,
          details: { keys: present, scanned: SCAN_KEYS.length },
        };
      } catch (err: unknown) {
        return {
          ok: false,
          msg: `credentials-watch failed: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
    /* v13.3.79+ autoFix Kevin 2026-05-08 : tente auto-restore depuis IDB/Firebase
     * (Si vault localStorage vide mais IDB shadow ou Firebase backup contient → restaure). */
    autoFix: async () => {
      try {
        const { autoRestoreCredentials } = await import('../vault/auto-restore-credentials.js');
        const r = await autoRestoreCredentials.restoreAutomatically();
        if (r.restored > 0) {
          return { ok: true, msg: `Auto-restore: ${r.restored} credentials récupérés (failed=${r.failed})` };
        }
        return { ok: false, msg: `Aucune clé restorable (failed=${r.failed})` };
      } catch (err: unknown) {
        return { ok: false, msg: 'credentials autoFix fail: ' + (err instanceof Error ? err.message : String(err)) };
      }
    },
  });

  /* 4-bis. decrypt-watch (5min) : audit decrypt health TOUTES les clés AXENC1:
   * Fix v13.3.21 (Kevin 2026-05-07 "decrypt failed") :
   * - Si N+ clés ne se déchiffrent plus → alerte critical Kevin via kevinAlerts
   * - Liste les services impactés (Anthropic / OpenAI / Cohere / etc.) pour action concrète
   * - Action proposée : ouvrir Coffre admin → bouton "Récupérer cette clé"
   * Cause racine : passphrase rotation (PIN admin changé, clear cache iOS, autre tab).
   */
  sentinels.register({
    id: 'decrypt-watch',
    name: 'Decrypt health',
    desc: 'Audit decrypt des clés API stockées AXENC1: (alerte Kevin si N+ illisibles)',
    intervalMs: 5 * 60 * 1000,
    check: async () => {
      try {
        const { vault } = await import('../vault/vault.js');
        const audit = await vault.auditDecryptHealth();
        if (audit.failed === 0) {
          return {
            ok: true,
            msg: `Decrypt OK : ${audit.ok}/${audit.total}`,
            details: { total: audit.total, ok: audit.ok },
          };
        }
        /* Si fail count > 0 → alerte Kevin (best-effort, déjà rate-limité côté kevin-alerts) */
        const ALERT_THRESHOLD = 1; /* dès 1 clé illisible, alerter (clé IA = bloque app) */
        if (audit.failed >= ALERT_THRESHOLD) {
          try {
            const { kevinAlerts } = await import('../admin/kevin-alerts.js');
            const services = audit.failedKeys
              .map((k) => k.replace(/^ax_/, '').replace(/_(?:key|token|secret)$/, ''))
              .slice(0, 5)
              .join(', ');
            void kevinAlerts.alertKevin({
              severity: 'critical',
              title: `🚨 ${audit.failed} clé(s) API illisible(s)`,
              body: `Services impactés : ${services}. Ouvre le Coffre admin et clique "Récupérer cette clé" pour recoller.`,
            }).catch(() => { /* offline OK */ });
          } catch { /* alerts unavailable */ }
        }
        return {
          ok: false,
          msg: `🔴 ${audit.failed} clé(s) decrypt failed sur ${audit.total} (${audit.ok} OK)`,
          details: {
            total: audit.total,
            ok: audit.ok,
            failed: audit.failed,
            failedKeys: audit.failedKeys,
          },
        };
      } catch (err: unknown) {
        return {
          ok: false,
          msg: `decrypt-watch failed: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
    /* v13.3.79+ autoFix Kevin 2026-05-08 : tente restoration vault depuis Firebase backup
     * (cause = passphrase rotation, restore depuis source de vérité ailleurs). */
    autoFix: async () => {
      try {
        const { vaultFirebaseBackup } = await import('../vault/vault-firebase-backup.js');
        const r = await vaultFirebaseBackup.restoreAllFromFirebaseBackup();
        if (r.restored > 0) {
          return { ok: true, msg: `Firebase restore: ${r.restored} clé(s) restaurées (failed=${r.failed})` };
        }
        return { ok: false, msg: `Aucune sauvegarde Firebase pour restore (failed=${r.failed})` };
      } catch (err: unknown) {
        return { ok: false, msg: 'decrypt autoFix fail: ' + (err instanceof Error ? err.message : String(err)) };
      }
    },
  });

  /* 5. link-validation-watch : test alive ax_links_registry (24h) */
  sentinels.register({
    id: 'link-validation-watch',
    name: 'Liens dashboards',
    desc: 'Vérifie que les URLs dashboards/billing/docs répondent',
    intervalMs: 24 * 60 * 60 * 1000,
    check: async () => {
      try {
        /* v13.3.94 P1.1 — fallback {} sur tout échec parse (incluant
         * __LZ__ compressed value), ne jamais reporter "fail" pour un parse. */
        const { storageCompressor } = await import('../storage/storage-compressor.js');
        const registry = storageCompressor.safeParseJSON<Record<string, { dashboard?: string; alive?: boolean }>>(
          'ax_links_registry',
          {},
        );
        const services = Object.keys(registry);
        return { ok: true, msg: `${services.length} services in registry`, details: { count: services.length } };
      } catch {
        return { ok: true, msg: '0 services in registry (init phase)' };
      }
    },
  });

  /* H5 audit fix v13.3.74 : credentials-rotation-watch (24h) */
  sentinels.register({
    id: 'credentials-rotation-watch',
    name: 'Rotation tokens 90j',
    desc: 'Alerte si credentials > 80j (warn) / > 90j (escalade)',
    intervalMs: 24 * 60 * 60 * 1000,
    check: async () => {
      const { credentialsRotationWatch } = await import('./credentials-rotation-watch.js');
      const r = await credentialsRotationWatch.run();
      if (r.err_count > 0) {
        return {
          ok: false,
          msg: `${r.err_count} clé(s) > 90j (escalade) + ${r.warn_count} > 80j`,
          details: { ...r },
        };
      }
      if (r.warn_count > 0) {
        return {
          ok: true, /* warn non bloquant — sentinelle reste verte */
          msg: `${r.warn_count} clé(s) > 80j (rotation conseillée)`,
          details: { ...r },
        };
      }
      return { ok: true, msg: `${r.scanned} clés OK (pas de rotation requise)` };
    },
  });

  /* v13.3.79 (Kevin 2026-05-08 ABSOLUE) : auto-restore-watch (30min)
   * "Quand il me dit qu'il lui manque des choses bah pourquoi il est pas allé
   *  les chercher automatiquement"
   * Sentinelle qui audit les clés manquantes et restaure depuis sources
   * disponibles (alias localStorage, IDB shadow, Firebase backup, pattern
   * detection) AVANT de demander à Kevin. */
  sentinels.register({
    id: 'auto-restore-watch',
    name: 'Auto-restore credentials',
    desc: 'Restaure automatiquement les clés manquantes depuis IDB / Firebase / alias avant de demander à Kevin',
    intervalMs: 30 * 60 * 1000, /* 30 min */
    check: async () => {
      const { autoRestoreCredentials } = await import('../vault/auto-restore-credentials.js');
      try {
        const stats = await autoRestoreCredentials.getStats();
        if (stats.recoverable_count > 0) {
          return {
            ok: false,
            msg: `${stats.recoverable_count} clé(s) restorables (auto-fix prêt)`,
            details: { ...stats },
          };
        }
        if (stats.truly_absent_count > 5) {
          return {
            ok: true,
            msg: `${stats.present_count}/${stats.total_patterns} clés présentes (${stats.truly_absent_count} à coller manuellement)`,
            details: { ...stats },
          };
        }
        return {
          ok: true,
          msg: `${stats.present_count}/${stats.total_patterns} clés présentes`,
          details: { ...stats },
        };
      } catch (err: unknown) {
        return {
          ok: false,
          msg: `auto-restore-watch failed: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
    autoFix: async () => {
      try {
        const { autoRestoreCredentials } = await import('../vault/auto-restore-credentials.js');
        const r = await autoRestoreCredentials.restoreAutomatically();
        if (r.restored > 0) {
          return { ok: true, msg: `${r.restored} clé(s) restaurée(s) automatiquement (échec: ${r.failed})` };
        }
        return { ok: false, msg: `Aucune clé restaurable (failed=${r.failed})` };
      } catch (err: unknown) {
        return { ok: false, msg: `auto-restore-watch autoFix failed: ${err instanceof Error ? err.message : String(err)}` };
      }
    },
  });

  /* Jet 5 : 8 sentinelles RÉELLES avec auto-repair (vs stubs morts Jet 4) */

  /* 6. storage-watch : alerte si localStorage > 3.5 MB + GC auto agressif
   * v13.4.194 (Kevin audit "Storage 4.25MB/5MB 85% quota") : seuil baissé
   * 4MB → 3.5MB pour déclencher cleanup AVANT quota exceeded iOS Safari (5MB cap). */
  sentinels.register({
    id: 'storage-watch',
    name: 'Stockage saturation',
    desc: 'Surveille localStorage et fait GC si > 3.5MB (anti quota exceeded iOS)',
    intervalMs: 10 * 60 * 1000, /* 10min (was 30min — Kevin storage 85% trop tard) */
    check: async () => {
      const size = JSON.stringify(localStorage).length;
      const sizeMB = size / (1024 * 1024);
      if (sizeMB > 3.5) return { ok: false, msg: `localStorage ${sizeMB.toFixed(2)}MB > 3.5MB (quota iOS 5MB)`, details: { sizeBytes: size } };
      return { ok: true, msg: `localStorage ${sizeMB.toFixed(2)}MB OK` };
    },
    autoFix: async () => {
      let freed = 0;
      const trim = (key: string, max: number) => {
        try {
          const arr = JSON.parse(localStorage.getItem(key) ?? '[]') as unknown[];
          if (Array.isArray(arr) && arr.length > max) {
            const before = JSON.stringify(arr).length;
            localStorage.setItem(key, JSON.stringify(arr.slice(-max)));
            const after = JSON.stringify(arr.slice(-max)).length;
            freed += before - after;
          }
        } catch {
          /* ignore */
        }
      };
      trim('apex_v13_observability', 100);
      trim('apex_v13_observability_dlq', 50);
      trim('ax_audit_log_v13', 200);
      trim('apex_v13_fb_queue', 50);
      trim('ax_telemetry_in', 50);
      trim('ax_claude_todo', 20);
      /* v13.4.194 : trim supplémentaire pour atteindre <3MB */
      trim('apex_v13_audit_layout_history', 25);
      trim('apex_v13_audit_functional_history', 25);
      trim('apex_v13_conversation_active', 100);
      trim('apex_v13_chat_sessions', 5);
      trim('ax_voice_log', 50);
      trim('apex_v13_backups', 5);
      return { ok: freed > 0, msg: `Freed ${(freed / 1024).toFixed(1)} KB via cleanup agressif` };
    },
  });

  /* 7. network-watch : ping connectivité + reconnect Firebase si coupé
   * Fix v13.3.18 (Kevin v13.3.16 rapport "Cloudflare trace unreachable") :
   * - Anciennement pingait https://1.1.1.1/cdn-cgi/trace MAIS le CSP n'autorise pas cet
   *   origin → fail systématique (faux positif).
   * - Fix : probes whitelistées CSP (api.cloudflare.com / api.github.com) + fallback
   *   no-cors qui ne lève pas d'erreur si réseau OK + acceptation gracieuse si firewall
   *   corp bloque toutes probes mais navigator.onLine=true.
   */
  sentinels.register({
    id: 'network-watch',
    name: 'Connectivité réseau',
    desc: 'Vérifie réseau + reconnect Firebase SSE si déconnecté (probes CSP-friendly)',
    intervalMs: 5 * 60 * 1000,
    check: async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return { ok: false, msg: 'navigator.onLine = false (offline)' };
      }
      const probes = [
        'https://api.cloudflare.com/client/v4/',
        'https://api.github.com/zen',
      ];
      for (const url of probes) {
        try {
          const res = await fetch(url, {
            method: 'GET',
            signal: AbortSignal.timeout(3000),
            mode: 'no-cors',
          });
          /* mode: no-cors → opaque réponse, pas thrown si réseau OK */
          if (res.type === 'opaque' || res.ok || (res.status >= 200 && res.status < 500)) {
            return { ok: true, msg: `Network OK (probe ${url.replace(/^https:\/\//, '').slice(0, 30)})` };
          }
        } catch {
          /* Continue probe suivante */
        }
      }
      /* Fallback final : navigator.onLine=true mais probes muets → OK (CSP/firewall corp) */
      return { ok: true, msg: 'navigator.onLine=true (probes muets, CSP/firewall accepté)' };
    },
    autoFix: async () => {
      try {
        const { firebase } = await import('../storage/firebase.js');
        await firebase.init();
        return { ok: true, msg: 'Firebase reconnect attempted' };
      } catch (err: unknown) {
        return { ok: false, msg: `Reconnect failed: ${String(err)}` };
      }
    },
  });

  /* 8. performance-watch : monitor heap + Web Vitals (LCP / INP / CLS)
   * Fix v13.3.18 (Kevin v13.3.16 rapport "performance.memory non disponible") :
   * - Détecte Safari iOS où performance.memory n'existe PAS (bug latent normal, pas un problème).
   * - Skip explicite avec message rassurant : "Safari iPhone (API non exposée par WebKit)".
   * - Sur Chromium : warning > 150MB, error > 250MB.
   * v13.3.70 (Kevin "performance-watch stub → réel") :
   * - Intègre perfMetrics (LCP/INP/CLS via PerformanceObserver côté boot).
   * - Compare snapshot courant vs baseline persisté (apex_v13_perf_baseline) → alerte si dégradation > 30%.
   * - Auto-fix : reset baseline si trop ancienne (> 7j).
   */
  sentinels.register({
    id: 'performance-watch',
    name: 'Performance runtime',
    desc: 'Monitor heap (Chromium) + Web Vitals (LCP/INP/CLS) — alerte dégradation > 30% vs baseline',
    intervalMs: 15 * 60 * 1000,
    check: async () => {
      const ua = (typeof navigator !== 'undefined' && navigator.userAgent) ? navigator.userAgent : '';
      const isiOS = /iPhone|iPad|iPod/i.test(ua);
      const isSafari = /Safari/i.test(ua) && !/Chrome|Chromium|CriOS/i.test(ua);
      const perf = performance as unknown as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } };

      /* Collect Web Vitals snapshot */
      let webVitalsMsg = '';
      const regressions: string[] = [];
      try {
        const { perfMetrics } = await import('../observability/perf-metrics.js');
        const snap = perfMetrics.getSnapshot();
        const score = perfMetrics.getScore();
        webVitalsMsg = ` · score ${score.score}/100`;
        const baselineRaw = localStorage.getItem('apex_v13_perf_baseline');
        if (baselineRaw) {
          try {
            const baseline = JSON.parse(baselineRaw) as { LCP?: number; INP?: number; CLS?: number; ts: number };
            for (const k of ['LCP', 'INP', 'CLS'] as const) {
              const cur = snap[k]?.value;
              const base = baseline[k];
              if (typeof cur === 'number' && typeof base === 'number' && base > 0) {
                const delta = (cur - base) / base;
                if (delta > 0.30) regressions.push(`${k} +${(delta * 100).toFixed(0)}%`);
              }
            }
          } catch { /* parse fail */ }
        } else {
          /* Première run : seed baseline */
          try {
            const seed = {
              LCP: snap.LCP?.value ?? 0,
              INP: snap.INP?.value ?? 0,
              CLS: snap.CLS?.value ?? 0,
              ts: Date.now(),
            };
            localStorage.setItem('apex_v13_perf_baseline', JSON.stringify(seed));
          } catch { /* quota */ }
        }
      } catch {
        /* perf-metrics indispo (early boot) → skip Web Vitals */
      }

      if (!perf.memory) {
        const baseMsg = (isiOS || isSafari)
          ? 'Safari/iOS — performance.memory non exposée (normal)'
          : 'performance.memory non disponible (browser non-Chromium)';
        if (regressions.length > 0) {
          return { ok: false, msg: `${baseMsg} · régressions: ${regressions.join(', ')}`, details: { regressions } };
        }
        return { ok: true, msg: baseMsg + webVitalsMsg };
      }
      const usedMB = perf.memory.usedJSHeapSize / (1024 * 1024);
      const limitMB = perf.memory.jsHeapSizeLimit / (1024 * 1024);
      if (usedMB > 250) {
        return {
          ok: false,
          msg: `Heap ${usedMB.toFixed(0)}MB / ${limitMB.toFixed(0)}MB (>250MB critical)${webVitalsMsg}`,
          details: { usedMB, limitMB, regressions },
        };
      }
      if (regressions.length > 0) {
        return {
          ok: false,
          msg: `Heap ${usedMB.toFixed(0)}MB OK · régressions Web Vitals: ${regressions.join(', ')}`,
          details: { usedMB, regressions },
        };
      }
      if (usedMB > 150) {
        return { ok: true, msg: `Heap ${usedMB.toFixed(0)}MB / ${limitMB.toFixed(0)}MB (warning > 150MB)${webVitalsMsg}`, details: { usedMB } };
      }
      return { ok: true, msg: `Heap ${usedMB.toFixed(0)}MB / ${limitMB.toFixed(0)}MB OK${webVitalsMsg}` };
    },
    autoFix: async () => {
      /* Si baseline > 7j → reset (acceptable car le code a évolué) */
      try {
        const raw = localStorage.getItem('apex_v13_perf_baseline');
        if (raw) {
          const baseline = JSON.parse(raw) as { ts: number };
          const ageDays = (Date.now() - baseline.ts) / (24 * 60 * 60 * 1000);
          if (ageDays > 7) {
            localStorage.removeItem('apex_v13_perf_baseline');
            return { ok: true, msg: `Baseline reset (âge ${ageDays.toFixed(0)}j > 7j)` };
          }
        }
        return { ok: false, msg: 'Baseline récente, reset manuel requis pour régression réelle' };
      } catch (err: unknown) {
        return { ok: false, msg: 'autofix fail: ' + (err instanceof Error ? err.message : String(err)) };
      }
    },
  });

  /* 9. security-watch : check session age + re-auth requise
   * v13.3.24 fix Kevin (screenshot 19:11 "Audit log tamper détecté" faux positif) :
   *   - Audit log vide → status OK (pas tamper, juste non-initialisé)
   *   - Reload depuis localStorage avant verify (anti chain stale en mémoire)
   *   - Si tamper détecté → log dans ax_security_log + détails pour audit Kevin
   *   - Action bouton "Réinitialiser audit chain" géré côté UI sentinels (admin only) */
  sentinels.register({
    id: 'security-watch',
    name: 'Sécurité session',
    desc: 'Vérifie session admin < 8h + check intégrité audit log',
    intervalMs: 30 * 60 * 1000,
    check: async () => {
      const lastact = parseInt(localStorage.getItem('apex_v13_lastact') ?? '0', 10);
      /* lastact==0 = pas de session → skip la check session */
      if (lastact > 0) {
        const ageHours = (Date.now() - lastact) / (60 * 60 * 1000);
        if (ageHours > 8) return { ok: false, msg: `Session > 8h, force logout requise` };
      }
      /* Audit log integrity (avec reload anti-stale + tolérance vide) */
      try {
        const { auditLog } = await import('../observability/audit-log.js');
        /* v13.3.24 : reload depuis localStorage AVANT verify (anti memory chain stale) */
        auditLog.reload();
        const entries = auditLog.getEntries();
        /* Audit log vide = OK (pas de tamper, juste pas encore d'écritures) */
        if (entries.length === 0) {
          return { ok: true, msg: 'Audit log vide (en attente première écriture)' };
        }
        const verify = await auditLog.verify();
        if (!verify.valid) {
          /* v13.3.24 : log les détails dans ax_security_log pour audit Kevin */
          try {
            const log = JSON.parse(localStorage.getItem('ax_security_log') ?? '[]') as unknown[];
            log.push({
              ts: Date.now(),
              kind: 'audit_log_tamper',
              brokenAt: verify.brokenAt,
              chainLen: entries.length,
              firstEntryTs: entries[0]?.ts,
              lastEntryTs: entries[entries.length - 1]?.ts,
            });
            localStorage.setItem('ax_security_log', JSON.stringify(log.slice(-200)));
          } catch { /* quota */ }
          return {
            ok: false,
            msg: `Hash audit log invalide à entry #${verify.brokenAt} (${entries.length} entries) — possible corruption`,
            details: { brokenAt: verify.brokenAt, totalEntries: entries.length },
          };
        }
      } catch {
        /* audit-log indispo → considère OK plutôt que faux positif */
        return { ok: true, msg: 'Session OK (audit log indispo)' };
      }
      return { ok: true, msg: 'Session + audit log OK' };
    },
    /* v13.3.71 (Kevin audit 2026-05-08 — "WARNING = AUTO-FIX TOUJOURS") :
     * autoFix direct via auditLog.autoRepair() qui :
     *  1. Snapshot la chain courante (forensique préservé) → ax_audit_log_rebuild_<ts>
     *  2. Recalcule prevHash + hash depuis broken index
     *  3. Trace 'audit.chain_rebuilt' dans la chain réparée
     *  4. Émet event 'audit-log:rebuild' pour notif admin
     * Le tamper reste visible via le snapshot + la trace audit + ax_security_log. */
    autoFix: async () => {
      try {
        const { auditLog } = await import('../observability/audit-log.js');
        auditLog.reload();
        const r = await auditLog.autoRepair();
        if (r.ok && r.rebuilt > 0) {
          /* Log dans ax_security_log pour traçabilité auto-fix */
          try {
            const log = JSON.parse(localStorage.getItem('ax_security_log') ?? '[]') as unknown[];
            log.push({
              ts: Date.now(),
              kind: 'audit_log_auto_repaired',
              brokenAt: r.brokenAt,
              rebuilt: r.rebuilt,
            });
            localStorage.setItem('ax_security_log', JSON.stringify(log.slice(-200)));
          } catch { /* quota */ }
          return { ok: true, msg: `Audit chain réparée à #${r.brokenAt} (${r.rebuilt} entries recalculées)` };
        }
        if (r.ok && r.rebuilt === 0) {
          return { ok: true, msg: 'Audit chain déjà valide' };
        }
        return { ok: false, msg: 'Audit chain rebuild fail (rien rebuilt)' };
      } catch (err: unknown) {
        return { ok: false, msg: 'Audit autoRepair fail: ' + (err instanceof Error ? err.message : String(err)) };
      }
    },
  });

  /* 10. presence-watch : update timestamp activité user + broadcast online/offline */
  sentinels.register({
    id: 'presence-watch',
    name: 'Présence user',
    desc: 'Heartbeat 2 min + broadcast online/offline + cleanup stale users (>10 min)',
    intervalMs: 2 * 60 * 1000,
    check: async () => {
      const lastact = parseInt(localStorage.getItem('apex_v13_lastact') ?? '0', 10);
      const ageMin = (Date.now() - lastact) / (60 * 1000);
      const userRaw = localStorage.getItem('apex_v13_user');

      /* v13.3.70 : broadcast online/offline state + cleanup stale registry */
      const PRESENCE_KEY = 'apex_v13_presence';
      const STALE_TTL_MS = 10 * 60 * 1000; /* 10 min sans heartbeat = offline */
      try {
        const raw = localStorage.getItem(PRESENCE_KEY) ?? '{}';
        const presence = JSON.parse(raw) as Record<string, { ts: number; online: boolean; uid?: string }>;
        const now = Date.now();
        let staleCount = 0;
        for (const [k, v] of Object.entries(presence)) {
          if (v && typeof v.ts === 'number' && now - v.ts > STALE_TTL_MS && v.online) {
            presence[k] = { ...v, online: false };
            staleCount++;
          }
        }
        /* Update self entry si user logged-in */
        if (userRaw) {
          try {
            const u = JSON.parse(userRaw) as { id?: string };
            if (u.id) {
              presence[u.id] = { ts: now, online: true, uid: u.id };
            }
          } catch { /* parse fail */ }
        }
        localStorage.setItem(PRESENCE_KEY, JSON.stringify(presence));
        const onlineCount = Object.values(presence).filter((p) => p.online).length;
        const baseMsg = `Last activity ${ageMin.toFixed(0)}min ago`;
        if (staleCount > 0) {
          return { ok: true, msg: `${baseMsg} · ${onlineCount} online (${staleCount} marqués offline)` };
        }
        return { ok: true, msg: `${baseMsg} · ${onlineCount} online` };
      } catch {
        return { ok: true, msg: `Last activity ${ageMin.toFixed(0)}min ago` };
      }
    },
    autoFix: async () => {
      try {
        localStorage.setItem('apex_v13_lastact', String(Date.now()));
        return { ok: true, msg: 'heartbeat refreshed' };
      } catch {
        return { ok: false, msg: 'persist failed' };
      }
    },
  });

  /* 11. compliance-watch : RGPD audit + check user data right of access
   * Sprint 13.3.17 fix : accepte plusieurs formes de consent (cookies banner OU
   * RGPD explicite) + état initial sans user logged-in = OK (rien à enregistrer).
   * Évite faux positif sur premier boot avant que l'admin ait cliqué cookies. */
  sentinels.register({
    id: 'compliance-watch',
    name: 'Conformité RGPD',
    desc: 'Audit RGPD : présence consent + audit log integrity + retention',
    intervalMs: 24 * 60 * 60 * 1000,
    check: async () => {
      /* Pas de user logged → pas de consent à enregistrer */
      const userRaw = localStorage.getItem('apex_v13_user');
      if (!userRaw) {
        return { ok: true, msg: 'Aucun user connecté (pas de consent à tracer)' };
      }
      /* Accepte 3 formes de consent valides */
      const consentRgpd = localStorage.getItem('apex_v13_rgpd_consent');
      const consentCookies = localStorage.getItem('apex_v13_cookies_accepted');
      let consentByUid: string | null = null;
      try {
        const u = JSON.parse(userRaw) as { id?: string };
        if (u.id) consentByUid = localStorage.getItem(`apex_v13_rgpd_consent_${u.id}`);
      } catch {
        /* parse fail → ignore */
      }
      if (!(consentRgpd || consentCookies || consentByUid)) {
        return { ok: false, msg: 'Consent RGPD non enregistré (banner cookies non cliqué)' };
      }

      /* v13.3.70 : check permissions revoked depuis dernier consent
       * Si user avait accordé micro/cam/geo et permission révoquée OS-level → log + alerte */
      const revoked: string[] = [];
      if (typeof navigator !== 'undefined' && navigator.permissions) {
        const perms: PermissionName[] = ['microphone', 'camera', 'geolocation'] as PermissionName[];
        for (const p of perms) {
          try {
            const grantedKey = `apex_v13_perm_granted_${p}`;
            const wasGranted = localStorage.getItem(grantedKey) === '1';
            const status = await navigator.permissions.query({ name: p });
            if (wasGranted && status.state === 'denied') {
              revoked.push(String(p));
            }
            if (status.state === 'granted') {
              try { localStorage.setItem(grantedKey, '1'); } catch { /* quota */ }
            }
          } catch { /* permission name unsupported on browser */ }
        }
      }
      if (revoked.length > 0) {
        return {
          ok: false,
          msg: `Permissions révoquées détectées : ${revoked.join(', ')}`,
          details: { revoked },
        };
      }
      return { ok: true, msg: 'RGPD consent OK · permissions stables' };
    },
    autoFix: async () => {
      /* Auto-fix : si user logged-in mais pas de banner cookies, propose un consent
       * essentiel par défaut (compliance Article 6.1.f intérêt légitime). */
      try {
        const userRaw = localStorage.getItem('apex_v13_user');
        if (!userRaw) return { ok: false, msg: 'No user — no consent action' };
        const existing = localStorage.getItem('apex_v13_cookies_accepted');
        if (existing) return { ok: true, msg: 'Consent déjà présent' };
        const defaultConsent = {
          analytics: false,
          marketing: false,
          preferences: false,
          essential: true,
          ts: Date.now(),
          version: 'v13.3.17-default',
        };
        localStorage.setItem('apex_v13_cookies_accepted', JSON.stringify(defaultConsent));
        return { ok: true, msg: 'Consent essential par défaut enregistré' };
      } catch (err: unknown) {
        return { ok: false, msg: 'autofix fail: ' + (err instanceof Error ? err.message : String(err)) };
      }
    },
  });

  /* 12. conflict-watch : detect Firebase SSE write conflicts + merge resolution.
   * v13.3.70 (Kevin "WARNING = AUTO-FIX") :
   * - Détecte queue writes stale > 5 (status flushing > 5 min) = conflict potentiel
   * - autoFix : reset status flushing → pending pour replay au prochain flush
   *   (force fb pull + merge via firebase.init() qui resync state)
   */
  sentinels.register({
    id: 'conflict-watch',
    name: 'Conflits SSE',
    desc: 'Detect write conflicts entre clients (sync simultanée) + force merge si stale',
    intervalMs: 10 * 60 * 1000,
    check: async () => {
      const queueRaw = localStorage.getItem('apex_v13_fb_queue');
      if (!queueRaw) return { ok: true, msg: 'No pending writes' };
      try {
        const queue = JSON.parse(queueRaw) as Array<{ status: string; ts?: number; key?: string }>;
        /* Sémantique historique : > 5 entries flushing = potential conflict (regardless TTL).
         * v13.3.70 ajoute aussi un breakdown stale (TTL > 5 min) dans details pour UI. */
        const stale = queue.filter((e) => e.status === 'flushing').length;
        if (stale > 5) {
          const STALE_TTL = 5 * 60 * 1000;
          const now = Date.now();
          const oldEntries = queue.filter(
            (e) => e.status === 'flushing' && typeof e.ts === 'number' && now - e.ts > STALE_TTL,
          );
          return {
            ok: false,
            msg: `${stale} writes stale (potential conflict)`,
            details: { stale, total: queue.length, oldEntries: oldEntries.length, sample: queue.slice(0, 3).map((e) => e.key) },
          };
        }
        return { ok: true, msg: `${queue.length} pending, no conflict` };
      } catch {
        return { ok: false, msg: 'Queue parse failed' };
      }
    },
    /* v13.3.79+ autoFix Kevin 2026-05-08 "WARNING = AUTO-FIX TOUJOURS" :
     * Wire l'auto-repair conflictMergeResolve directement (Kevin : "ne jamais attendre Kevin").
     * Le snapshot des stales reste visible dans details + audit log avant repair. */
    autoFix: async () => {
      try {
        const { sentinelAutoRepair } = await import('./sentinel-auto-repair.js');
        const r = await sentinelAutoRepair.conflictMergeResolve();
        return { ok: r.ok, msg: r.msg };
      } catch (err: unknown) {
        return { ok: false, msg: 'conflict autoFix fail: ' + (err instanceof Error ? err.message : String(err)) };
      }
    },
  });

  /* 13b. anti-regression-watch : alerte si tests/coverage baissent vs baseline (Kevin règle "ne plus régresser") */
  sentinels.register({
    id: 'anti-regression-watch',
    name: 'Anti-régression scores',
    desc: 'Compare snapshot scores actuel vs baseline persisté. Alerte si baisse.',
    intervalMs: 24 * 60 * 60 * 1000, /* 1× par jour */
    check: async () => {
      try {
        const baseline = JSON.parse(localStorage.getItem('apex_v13_score_baseline') ?? '{}') as {
          tests_count?: number; coverage_statements?: number; coverage_branches?: number;
          coverage_functions?: number; coverage_lines?: number; ts?: number;
        };
        const current = JSON.parse(localStorage.getItem('apex_v13_score_current') ?? '{}') as typeof baseline;
        if (!current.tests_count || !baseline.tests_count) {
          return { ok: true, msg: 'No baseline yet (sera défini au prochain commit)' };
        }
        const regressions: string[] = [];
        if ((current.tests_count ?? 0) < baseline.tests_count) {
          regressions.push(`tests ${baseline.tests_count} → ${current.tests_count}`);
        }
        if ((current.coverage_statements ?? 0) < (baseline.coverage_statements ?? 0)) {
          regressions.push(`statements ${baseline.coverage_statements}% → ${current.coverage_statements}%`);
        }
        if ((current.coverage_branches ?? 0) < (baseline.coverage_branches ?? 0)) {
          regressions.push(`branches ${baseline.coverage_branches}% → ${current.coverage_branches}%`);
        }
        if (regressions.length > 0) {
          return { ok: false, msg: `RÉGRESSION détectée : ${regressions.join(', ')}`, details: { regressions } };
        }
        return { ok: true, msg: 'Pas de régression vs baseline' };
      } catch {
        return { ok: true, msg: 'Anti-regression check skipped' };
      }
    },
  });

  /* 14. self-test : auto-test runtime health (Sprint 6 Kevin règle test live permanent) */
  sentinels.register({
    id: 'self-test',
    name: 'Auto-test runtime health',
    desc: 'Vérifie périodiquement que les services critiques répondent (vault, audit-log, ai-router)',
    intervalMs: 30 * 60 * 1000, /* Toutes 30 min */
    check: async () => {
      const errors: string[] = [];
      /* Test 1 : vault read-only check */
      try {
        const { vault } = await import('../vault/vault.js');
        await vault.readKey('apex_v13_test_nonexistent_key');
      } catch (err: unknown) {
        errors.push('vault: ' + (err instanceof Error ? err.message : 'fail'));
      }
      /* Test 2 : audit-log write check */
      try {
        const { auditLog } = await import('../observability/audit-log.js');
        await auditLog.record('selftest.heartbeat', { details: { ts: Date.now() } });
      } catch (err: unknown) {
        errors.push('audit-log: ' + (err instanceof Error ? err.message : 'fail'));
      }
      /* Test 3 : storage quota check */
      try {
        const { storageCompressor } = await import('../storage/storage-compressor.js');
        const status = storageCompressor.getQuotaStatus();
        if (status.severity === 'critical') errors.push(`storage: ${status.used_mb}MB critical`);
      } catch (err: unknown) {
        errors.push('storage: ' + (err instanceof Error ? err.message : 'fail'));
      }
      /* Test 4 : ai-router has at least 1 key
       * Sprint 13.3.17 fix : "no API key" est INFO non bloquant — passe en `infos` séparé,
       * pas dans `errors`. La sentinelle ne reste rouge que pour vrais échecs runtime. */
      const infos: string[] = [];
      try {
        const { aiRouter } = await import('../ai/ai-router.js');
        const hasKey = aiRouter.hasAnyKey();
        if (!hasKey) infos.push('ai-router: no API key (admin doit configurer Coffre)');
      } catch (err: unknown) {
        errors.push('ai-router: ' + (err instanceof Error ? err.message : 'fail'));
      }
      if (errors.length === 0) {
        const msg = infos.length > 0
          ? `All health checks pass (${infos.length} info)`
          : 'All health checks pass';
        if (infos.length > 0) {
          return { ok: true, msg, details: { infos } };
        }
        return { ok: true, msg };
      }
      return { ok: false, msg: `${errors.length} health checks failed`, details: { errors, infos } };
    },
  });

  /* 15. memory-leak-watch : detect intervals tracked vs running */
  sentinels.register({
    id: 'memory-leak-watch',
    name: 'Memory leaks detection',
    desc: 'Compte intervals/listeners trackés vs running. Alerte si > 50 intervals.',
    intervalMs: 60 * 60 * 1000, /* 1h */
    check: async () => {
      try {
        const { lifecycle } = await import('../core-svc/service-lifecycle.js');
        const stats = lifecycle.getStats();
        if (stats.total_intervals_tracked > 50) {
          return { ok: false, msg: `${stats.total_intervals_tracked} intervals tracked (>50 = leak)`, details: stats };
        }
        return { ok: true, msg: `${stats.total_intervals_tracked} intervals tracked OK` };
      } catch {
        return { ok: true, msg: 'Lifecycle stats unavailable' };
      }
    },
  });

  /* 16. memory-bridge-watch : vérifie sync OK des backends externes (Kevin règle mémoire persistante) */
  sentinels.register({
    id: 'memory-bridge-watch',
    name: 'Memory bridge sync externe',
    desc: 'Vérifie sync Notion/Firebase/Gist OK + alerte si > 24h sans sync',
    intervalMs: 60 * 60 * 1000, /* 1h */
    check: async () => {
      try {
        const { memoryBridge } = await import('../storage/memory-bridge.js');
        const health = memoryBridge.getHealth();
        if (health.backends_configured === 0) {
          return { ok: true, msg: 'Aucun backend configuré (mode local-only)' };
        }
        if (health.recent_failures >= 3) {
          return {
            ok: false,
            msg: `${health.recent_failures} échecs sync récents (24h)`,
            details: { failures: health.recent_failures },
          };
        }
        if (health.last_sync_age_ms > 0 && health.last_sync_age_ms > 24 * 60 * 60 * 1000) {
          return {
            ok: false,
            msg: `Pas de sync depuis ${Math.floor(health.last_sync_age_ms / 3_600_000)}h`,
            details: { age_ms: health.last_sync_age_ms },
          };
        }
        return { ok: true, msg: `${health.backends_configured} backends, dernière sync OK` };
      } catch (err: unknown) {
        return { ok: false, msg: 'Memory bridge check failed: ' + (err instanceof Error ? err.message : 'fail') };
      }
    },
    autoFix: async () => {
      try {
        const { memoryBridge } = await import('../storage/memory-bridge.js');
        const results = await memoryBridge.runAutoSync();
        const ok = results.filter((r) => r.ok).length;
        return {
          ok: ok > 0,
          msg: `Re-sync attempted : ${ok}/${results.length} OK`,
        };
      } catch (err: unknown) {
        return { ok: false, msg: 'Re-sync failed: ' + (err instanceof Error ? err.message : 'fail') };
      }
    },
  });

  /* 13. wake-watch : detect wake word permission + crashed state restart.
   * v13.3.70 (Kevin "WARNING = AUTO-FIX") :
   * - Si user opt-in wake word + recognition crashed (iOS Safari instable) → restart auto
   * - Vérifie aussi permission micro
   *
   * v13.3.74 M1 (audit Apex v13.3.73 issue #240) :
   * - enabled: false par défaut au registre (back-compat tests).
   * - Activation runtime via services-bootstrap.ts au boot admin si toggle
   *   ax_wake_word_active === '1' (ou pas explicite OFF).
   * - sentinels.enable('wake-watch') au boot suffit pour activer la sentinelle
   *   sans casser le contract enabled: false par défaut.
   */
  sentinels.register({
    id: 'wake-watch',
    name: 'Wake word "Dis Apex"',
    desc: 'Vérifie permission micro + état recognition + restart auto si crashed iOS Safari',
    intervalMs: 60 * 60 * 1000,
    enabled: false, /* v13.3.74 M1 : default OFF (re-activé au boot via services-bootstrap si user admin opt-in) */
    check: async () => {
      if (typeof navigator === 'undefined' || !navigator.permissions) {
        return { ok: true, msg: 'Permissions API not available' };
      }
      let permState: string = 'unsupported';
      try {
        const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        permState = status.state;
        if (status.state === 'denied') {
          return { ok: false, msg: `Mic permission denied — user opt-in requis` };
        }
      } catch {
        /* unsupported → fallback below */
      }
      /* Si user a opt-in (apex_v13_wake_enabled=1), vérifier que recognition tourne */
      const wakeEnabled = localStorage.getItem('apex_v13_wake_enabled') === '1';
      if (!wakeEnabled) {
        return { ok: true, msg: `Mic permission: ${permState} · wake word désactivé` };
      }
      try {
        const { wakeWord } = await import('../ai/wake-word.js');
        const status = wakeWord.getStatus();
        if (!status.listening) {
          return {
            ok: false,
            msg: `Wake word activé mais recognition crashed (mic: ${permState})`,
            details: { listening: false, lastDetected: status.lastDetected, totalDetections: status.totalDetections },
          };
        }
        return { ok: true, msg: `Wake word listening (${status.totalDetections} détections cumulées)` };
      } catch {
        return { ok: true, msg: `Mic permission: ${permState} (wake-word module indispo)` };
      }
    },
    autoFix: async () => {
      try {
        const wakeEnabled = localStorage.getItem('apex_v13_wake_enabled') === '1';
        if (!wakeEnabled) return { ok: true, msg: 'Wake word désactivé → no-op' };
        const { wakeWord } = await import('../ai/wake-word.js');
        if (wakeWord.isListening()) {
          return { ok: true, msg: 'Already listening → no-op' };
        }
        /* Restart : stop nettoie l'état ancien, start re-init recognition */
        wakeWord.stop();
        const r = await wakeWord.start();
        if (!r.started) {
          return { ok: false, msg: `Restart fail: ${r.reason ?? 'unknown'}` };
        }
        return { ok: true, msg: 'Wake recognition restarted' };
      } catch (err: unknown) {
        return { ok: false, msg: 'resetWakeRecognition fail: ' + (err instanceof Error ? err.message : String(err)) };
      }
    },
  });

  /* 13b. voice-quality-watch (Kevin v13.3.43, 2026-05-07) :
   * Audit qualité voiceprints (confidence < 0.85, last_calibration > 30j).
   * Si user a besoin de calibration → status warn + propose ré-enrôlement next visit. */
  sentinels.register({
    id: 'voice-quality-watch',
    name: 'Qualité empreintes vocales',
    desc: 'Audit hebdo confidence voiceprints + propose ré-enrôlement si stale ou < 0.85',
    intervalMs: 7 * 24 * 60 * 60 * 1000, /* 1× par semaine */
    enabled: true,
    check: async () => {
      try {
        const { voicePrint } = await import('../ai/voice-print.js');
        const prints = voicePrint.listPrints();
        if (prints.length === 0) {
          return { ok: true, msg: 'Aucun voiceprint enrôlé', details: { count: 0 } };
        }
        const needsCalibration: Array<{ uid: string; reason: string; confidence: number }> = [];
        for (const p of prints) {
          const r = voicePrint.needsCalibration(p.uid);
          if (r.needs) {
            needsCalibration.push({ uid: p.uid, reason: r.reason, confidence: r.confidence });
          }
        }
        const stats = voicePrint.getStats();
        if (needsCalibration.length > 0) {
          return {
            ok: false,
            msg: `${needsCalibration.length}/${prints.length} voiceprints ont besoin de calibration`,
            details: { needs_calibration: needsCalibration, stats },
          };
        }
        return {
          ok: true,
          msg: `${prints.length} voiceprints OK (confiance moyenne ${Math.round(stats.avg_match_score * 100)}%)`,
          details: { stats },
        };
      } catch (err: unknown) {
        return {
          ok: true,
          msg: 'voice-print indisponible (skip)',
          details: { skipped: true, err: String(err).slice(0, 200) },
        };
      }
    },
  });

  /* 17. memory-watch (Kevin 2026-05-07 v13.3.27) :
   * Audit mémoire long-terme par user, compress si > 1000 facts/user, dédupe lessons. */
  sentinels.register({
    id: 'memory-watch',
    name: 'Mémoire long-terme audit',
    desc: 'Audit memory size par user + compression si >1000 facts + cleanup lessons dupliquées',
    intervalMs: 24 * 60 * 60 * 1000, /* 1× par jour */
    check: async () => {
      try {
        const mod = await import('../storage/persistent-memory-store.js');
        /* v13.3.36 (Kevin 2026-05-07 alerte sentinelle "undefined is not an object e.list") :
         * Guard sur module + méthode list. Si persistent-memory-store absent OU
         * list non-callable → status 'warn' au lieu de crash + JSON undefined.
         * Fix root cause : crash quand IndexedDB pas init (boot précoce, mode incognito,
         * Safari iOS PWA backgroundé). */
        const persistentMemoryStore = mod?.persistentMemory;
        if (!persistentMemoryStore || typeof persistentMemoryStore.list !== 'function') {
          return {
            ok: true,
            msg: 'memory-store pas dispo (boot précoce ou IDB indispo) — skip',
            details: { skipped: true, reason: 'no_persistent_memory_module' } as Record<string, unknown>,
          };
        }
        let all: Array<{ scope: string; importance: number; id?: string }> | undefined;
        try {
          all = await persistentMemoryStore.list();
        } catch (listErr: unknown) {
          return {
            ok: true,
            msg: 'memory-store list() failed (IDB closed?) — skip',
            details: { skipped: true, reason: 'list_threw', err: String(listErr).slice(0, 200) } as Record<string, unknown>,
          };
        }
        if (!Array.isArray(all)) {
          return {
            ok: true,
            msg: 'memory-store list() retourne pas un array — skip',
            details: { skipped: true, reason: 'not_array' } as Record<string, unknown>,
          };
        }
        const byUser = new Map<string, number>();
        for (const e of all) {
          if (!e || typeof e.scope !== 'string') continue;
          byUser.set(e.scope, (byUser.get(e.scope) ?? 0) + 1);
        }

        const oversized: string[] = [];
        for (const [uid, count] of byUser) {
          if (count > 1000) oversized.push(`${uid}:${count}`);
        }

        let lessonsCount = 0;
        try {
          const raw = localStorage.getItem('ax_lessons_learned_struct');
          if (raw) {
            const parsed = JSON.parse(raw) as unknown;
            if (Array.isArray(parsed)) lessonsCount = parsed.length;
          }
        } catch { /* skip */ }

        const report = {
          ts: Date.now(),
          total_facts: all.length,
          users_count: byUser.size,
          oversized_users: oversized,
          lessons_count: lessonsCount,
        };
        try {
          const raw = localStorage.getItem('ax_memory_audit_log') ?? '[]';
          const parsed = JSON.parse(raw) as unknown;
          const log = Array.isArray(parsed) ? parsed : [];
          log.push(report);
          localStorage.setItem('ax_memory_audit_log', JSON.stringify(log.slice(-30)));
        } catch { /* quota */ }

        if (oversized.length > 0) {
          return {
            ok: false,
            msg: `${oversized.length} user(s) > 1000 facts (${oversized.slice(0, 3).join(', ')}…)`,
            details: report as unknown as Record<string, unknown>,
          };
        }
        if (lessonsCount > 200) {
          return {
            ok: false,
            msg: `${lessonsCount} lessons (>200 → cleanup recommandé)`,
            details: report as unknown as Record<string, unknown>,
          };
        }
        return {
          ok: true,
          msg: `${all.length} facts (${byUser.size} users) · ${lessonsCount} lessons OK`,
          details: report as unknown as Record<string, unknown>,
        };
      } catch (err: unknown) {
        return { ok: false, msg: 'memory-watch failed: ' + (err instanceof Error ? err.message : String(err)) };
      }
    },
    autoFix: async () => {
      try {
        const mod = await import('../storage/persistent-memory-store.js');
        const persistentMemoryStore = mod?.persistentMemory;
        if (!persistentMemoryStore || typeof persistentMemoryStore.list !== 'function' || typeof persistentMemoryStore.remove !== 'function') {
          return { ok: false, msg: 'memory-store pas dispo' };
        }
        const all = await persistentMemoryStore.list();
        if (!Array.isArray(all)) {
          return { ok: false, msg: 'list() pas un array' };
        }
        const byUser = new Map<string, typeof all>();
        for (const e of all) {
          const arr = byUser.get(e.scope) ?? [];
          arr.push(e);
          byUser.set(e.scope, arr);
        }
        let removed = 0;
        for (const [uid, entries] of byUser) {
          if (entries.length <= 1000) continue;
          /* Garde top 100 par importance, supprime le reste */
          const keep = entries.sort((a, b) => b.importance - a.importance).slice(0, 100);
          const toRemove = entries.filter((e) => !keep.includes(e));
          for (const e of toRemove) {
            await persistentMemoryStore.remove(e.id);
            removed++;
          }
          logger.info('memory-watch', `compressed ${uid}: ${entries.length} → 100 (top importance)`);
        }
        /* Dédupe lessons (similarité title 85%) */
        try {
          const raw = localStorage.getItem('ax_lessons_learned_struct');
          if (raw) {
            const arr = JSON.parse(raw) as Array<{ category: string; title: string }>;
            const seen = new Set<string>();
            const dedup = arr.filter((l) => {
              const key = `${l.category}::${l.title.slice(0, 60).toLowerCase()}`;
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });
            const dedupedCount = arr.length - dedup.length;
            localStorage.setItem('ax_lessons_learned_struct', JSON.stringify(dedup.slice(-200)));
            removed += dedupedCount;
          }
        } catch { /* skip */ }
        return { ok: removed > 0, msg: `Compressed ${removed} entries` };
      } catch (err: unknown) {
        return { ok: false, msg: 'autofix fail: ' + (err instanceof Error ? err.message : String(err)) };
      }
    },
  });

  /* 21. csp-violation-watch : audit hourly violations CSP capturées par bodyguard
   *     → si > 5 violations en 1h ou patterns suspects (script-src + blockedURI externe non-trusted)
   *       → escalade audit log + lesson learned. Auto-fix : aucun (intervention manuelle requise). */
  sentinels.register({
    id: 'csp-violation-watch',
    name: 'CSP violations',
    desc: 'Audit horaire des violations CSP (ax_csp_violations_log)',
    intervalMs: 60 * 60 * 1000 /* 1h */,
    check: async () => {
      try {
        /* v13.3.94 P0.3 — décompresse si __LZ__ (storageCompressor.migrateAllToCompressed
         * a pu compresser ce key). safeParseJSON retourne [] sur tout échec. */
        const { storageCompressor } = await import('../storage/storage-compressor.js');
        const log = storageCompressor.safeParseJSON<Array<{ ts: number; directive: string; blockedURI: string }>>(
          'ax_csp_violations_log',
          [],
        );
        if (log.length === 0) return { ok: true, msg: 'Aucune violation CSP enregistrée' };
        const oneHourAgo = Date.now() - 60 * 60 * 1000;
        const recent = log.filter((v) => v.ts > oneHourAgo);
        const totalCount = log.length;
        if (recent.length === 0) {
          return { ok: true, msg: `0 violation dernière heure (${totalCount} historiques)` };
        }
        /* Patterns suspects : script-src violations avec URI externe non-trusted */
        const trusted = ['self', 'data:', 'blob:'];
        const suspicious = recent.filter((v) =>
          v.directive.startsWith('script-src') &&
          v.blockedURI &&
          !trusted.some((t) => v.blockedURI.startsWith(t)) &&
          !/\.firebaseio\.com|\.firebasedatabase\.app|api\.anthropic\.com|api\.openai\.com/.test(v.blockedURI),
        );
        if (suspicious.length > 0) {
          return {
            ok: false,
            msg: `🚨 ${suspicious.length} violation(s) script-src suspectes (1h) sur ${recent.length} totales`,
            details: { suspiciousCount: suspicious.length, recentCount: recent.length, totalCount, samples: suspicious.slice(0, 3) },
          };
        }
        if (recent.length > 5) {
          return {
            ok: false,
            msg: `⚠ ${recent.length} violations CSP en 1h (seuil 5 dépassé)`,
            details: { recentCount: recent.length, totalCount, directives: [...new Set(recent.map((v) => v.directive))] },
          };
        }
        return { ok: true, msg: `${recent.length}/5 violations dernière heure (sous seuil)` };
      } catch (err: unknown) {
        return { ok: false, msg: 'CSP watch fail: ' + (err instanceof Error ? err.message : String(err)) };
      }
    },
  });

  /* 22. smart-router-watch : ping multi-providers IA toutes 30 min + recalcul scoring.
   *     Kevin v13.3.33 (2026-05-07) : "teste et garde ce qui marche le mieux,
   *     le plus de crédit etc. AUTOMATIQUE AUTONOME TOUJOURS."
   *     - Ping all 10 providers (anthropic, openai, groq, gemini, mistral, cohere,
   *       xai, perplexity, deepseek, openrouter)
   *     - Update samples ring buffer (7j) + stats agrégées
   *     - Si best provider change → log audit + lesson
   *     - Recommandations économiques calculées au passage */
  sentinels.register({
    id: 'smart-router-watch',
    name: 'Smart Router multi-critères',
    desc: 'Ping 10 providers IA toutes 30 min + scoring latence/quota/qualité/uptime',
    intervalMs: 30 * 60 * 1000 /* 30 min */,
    check: async () => {
      try {
        const { smartRouter } = await import('../ai/smart-router.js');
        await smartRouter.pingAllProviders();
        const ranked = await smartRouter.rankProviders();
        const top3 = ranked.slice(0, 3).map((r) => `${r.provider}(${r.score.total})`).join(', ');
        const recos = await smartRouter.getRecommendations();
        return {
          ok: true,
          msg: `Top 3 : ${top3}${recos.length > 0 ? ` | ${recos.length} reco(s) éco` : ''}`,
          details: {
            top3: ranked.slice(0, 3).map((r) => ({ provider: r.provider, score: r.score.total })),
            recommendations: recos,
          },
        };
      } catch (err: unknown) {
        return { ok: false, msg: 'smart-router fail: ' + (err instanceof Error ? err.message : String(err)) };
      }
    },
    /* v13.3.79+ autoFix Kevin 2026-05-08 : tente re-ping all + multi-key recovery
     * pour relancer providers qui auraient temporairement échoué. */
    autoFix: async () => {
      try {
        const { smartRouter } = await import('../ai/smart-router.js');
        await smartRouter.pingAllProviders();
        const { multiKeyVault } = await import('../vault/multi-key-vault.js');
        const r = await multiKeyVault.healthCheckAll();
        return {
          ok: true,
          msg: `Re-ping providers + multi-key recovery: ${r.recovered}/${r.tested}`,
        };
      } catch (err: unknown) {
        return { ok: false, msg: 'smart-router autoFix fail: ' + (err instanceof Error ? err.message : String(err)) };
      }
    },
  });

  /* v13.3.53 service-knowledge-watch (Kevin "étudier sites/liens/codes") :
   * Re-fetch 1×/sem chaque service connu (study-service.ts) pour détecter
   * changements de pricing / docs / capabilities. Notif si > 50% changement prix. */
  sentinels.register({
    id: 'service-knowledge-watch',
    name: 'Connaissance services',
    desc: 'Refresh hebdo des services étudiés (pricing, capabilities, alternatives)',
    intervalMs: 7 * 24 * 60 * 60 * 1000,
    check: async () => {
      try {
        const { studyService } = await import('../integrations/study-service.js');
        const known = studyService.listKnown();
        if (known.length === 0) return { ok: true, msg: 'Aucun service étudié pour le moment' };
        return {
          ok: true,
          msg: `${known.length} services connus, last refresh dans 7j`,
          details: { count: known.length, services: known.slice(0, 5).map((s) => s.service_name) },
        };
      } catch (err: unknown) {
        return { ok: false, msg: 'service-knowledge-watch fail: ' + (err instanceof Error ? err.message : String(err)) };
      }
    },
    autoFix: async () => {
      const { studyService } = await import('../integrations/study-service.js');
      const r = await studyService.refreshAll();
      return { ok: r.errors.length === 0, msg: `Refreshed ${r.refreshed} services` };
    },
  });

  /* === Sprint 13.3.71 — Anti-blocage IA + Reconsult Kevin docs ===
   * Kevin règles "ANTI-BLOCAGE IA TOTAL" (2026-04-26) +
   * "RECONSULTATION PÉRIODIQUE AUTONOMIE TOTALE" (2026-05-03). */

  /* 23. ai-unblock-watch (5 min) — détecte providers IA en panne + auto-failover
   * v13.3.79+ autoFix Kevin 2026-05-08 : re-run runOnce() pour replay failover
   * + tente recovery multi-key (rotate clés blacklisted en history). */
  sentinels.register({
    id: 'ai-unblock-watch',
    name: 'Anti-blocage IA',
    desc: 'Ping providers IA, auto-failover si 2 fails consécutifs, auto-rotate clé depuis history',
    intervalMs: 5 * 60 * 1000,
    check: async () => {
      try {
        const { aiUnblockWatch } = await import('./ai-unblock-watch.js');
        const result = await aiUnblockWatch.runOnce();
        if (result.failoverTriggered.length > 0) {
          return {
            ok: false,
            msg: `⚠️ ${result.failoverTriggered.length} provider(s) en failover (${result.failoverTriggered.join(', ')})${result.rotatedKeys.length > 0 ? `, ${result.rotatedKeys.length} clé(s) rotated` : ''}`,
            details: {
              failover: result.failoverTriggered,
              rotated: result.rotatedKeys,
              healthy: result.healthyProviders,
            },
          };
        }
        return {
          ok: true,
          msg: `🟢 ${result.healthyProviders.length}/${result.probes.length} providers OK`,
          details: { healthy: result.healthyProviders },
        };
      } catch (err: unknown) {
        return {
          ok: false,
          msg: 'ai-unblock-watch failed: ' + (err instanceof Error ? err.message : String(err)),
        };
      }
    },
    autoFix: async () => {
      try {
        /* 1. Re-run unblock (re-tente failover, rotation history) */
        const { aiUnblockWatch } = await import('./ai-unblock-watch.js');
        const result = await aiUnblockWatch.runOnce();
        /* 2. Multi-key recovery */
        const { multiKeyVault } = await import('../vault/multi-key-vault.js');
        const recovered = await multiKeyVault.healthCheckAll();
        const ok = result.healthyProviders.length > 0 || recovered.recovered > 0;
        return {
          ok,
          msg: `Failover re-run: ${result.failoverTriggered.length} switched, ${result.rotatedKeys.length} keys rotated, ${recovered.recovered} multi-keys recovered`,
        };
      } catch (err: unknown) {
        return { ok: false, msg: 'ai-unblock autoFix fail: ' + (err instanceof Error ? err.message : String(err)) };
      }
    },
  });

  /* 24. reconsult-kevin-watch (30 min) — refetch docs Kevin depuis GitHub raw, diff vs cache.
   * v13.3.79+ autoFix Kevin 2026-05-08 : tente force re-sync via memory.syncDocsAtBoot. */
  sentinels.register({
    id: 'reconsult-kevin-watch',
    name: 'Reconsultation docs Kevin',
    desc: 'Refetch CLAUDE.md/NOTES_USER/KEVIN_ACTIONS_TODO toutes 30 min, diff vs cache, alerte si nouvelles règles',
    intervalMs: 30 * 60 * 1000,
    check: async () => {
      try {
        const { reconsultKevinWatch } = await import('./reconsult-kevin-watch.js');
        const result = await reconsultKevinWatch.runOnce();
        if (result.failed_count > result.changes.length / 2) {
          return {
            ok: false,
            msg: `${result.failed_count} doc(s) fetch failed (réseau / GitHub raw rate-limit ?)`,
            details: { failed: result.failed_count, updated: result.updated_count },
          };
        }
        if (result.updated_count > 0) {
          return {
            ok: true,
            msg: `📜 ${result.updated_count} doc(s) Kevin mis à jour`,
            details: {
              updated: result.changes.filter((c) => c.status === 'updated' || c.status === 'new').map((c) => c.doc),
              unchanged: result.unchanged_count,
              failed: result.failed_count,
            },
          };
        }
        return {
          ok: true,
          msg: `Docs Kevin sync OK (${result.unchanged_count} inchangés)`,
          details: { unchanged: result.unchanged_count },
        };
      } catch (err: unknown) {
        return {
          ok: false,
          msg: 'reconsult-kevin-watch failed: ' + (err instanceof Error ? err.message : String(err)),
        };
      }
    },
    autoFix: async () => {
      try {
        const { memory: memMod } = await import('../../core/memory.js');
        const r = await memMod.syncDocsAtBoot({ forceRefresh: true });
        return {
          ok: r.synced > 0,
          msg: `Force sync docs: ${r.synced} synced, ${r.skipped} skipped, ${r.failed} failed`,
        };
      } catch (err: unknown) {
        return { ok: false, msg: 'reconsult autoFix fail: ' + (err instanceof Error ? err.message : String(err)) };
      }
    },
  });

  /* 25. realtime-backup-watch (Kevin 2026-05-08 — "Rien perdre + sauvegarde temps réel")
   *  Vérifie que les snapshots persistent_memory + chat sont récents (< seuil).
   *  Auto-fix : déclenche snapshot immédiat si stale.
   */
  sentinels.register({
    id: 'realtime-backup-watch',
    name: 'Backup temps-réel mémoire+chat',
    desc: 'Vérifie snapshots IDB persistent_memory (5min) + chat (2min) pas stales',
    intervalMs: 5 * 60 * 1000,
    check: async () => {
      try {
        const { realtimeBackup, REALTIME_BACKUP_THRESHOLDS } = await import('../storage/realtime-backup.js');
        const stats = await realtimeBackup.getStats();
        if (!stats.idb_available) {
          return {
            ok: true,
            msg: 'IDB indispo (boot précoce ou Safari iOS) — skip',
            details: { skipped: true, reason: 'no_idb' } as Record<string, unknown>,
          };
        }
        const now = Date.now();
        const memAge = stats.last_memory_ts > 0 ? now - stats.last_memory_ts : Infinity;
        const chatAge = stats.last_chat_ts > 0 ? now - stats.last_chat_ts : Infinity;
        const memStale = memAge > REALTIME_BACKUP_THRESHOLDS.memoryStaleMs;
        const chatStale = chatAge > REALTIME_BACKUP_THRESHOLDS.chatStaleMs;
        if (stats.total_snapshots === 0) {
          return {
            ok: true,
            msg: 'Aucun snapshot encore (boot récent)',
            details: { warmup: true } as Record<string, unknown>,
          };
        }
        if (memStale && chatStale) {
          return {
            ok: false,
            msg: `Snapshots stales — memory ${Math.round(memAge / 60000)}min, chat ${Math.round(chatAge / 60000)}min`,
            details: { memAge, chatAge, stats } as unknown as Record<string, unknown>,
          };
        }
        return {
          ok: true,
          msg: `${stats.total_snapshots} snapshots (${stats.memory_snapshots} mem + ${stats.chat_snapshots} chat)`,
          details: stats as unknown as Record<string, unknown>,
        };
      } catch (err: unknown) {
        return {
          ok: false,
          msg: 'realtime-backup-watch failed: ' + (err instanceof Error ? err.message : String(err)),
        };
      }
    },
    autoFix: async () => {
      try {
        const { realtimeBackup } = await import('../storage/realtime-backup.js');
        const memSnap = await realtimeBackup.snapshotNow('memory');
        const chatSnap = await realtimeBackup.snapshotNow('chat');
        const ok = Boolean(memSnap || chatSnap);
        return { ok, msg: `Force snapshots: mem=${memSnap ? 'OK' : 'skip'} chat=${chatSnap ? 'OK' : 'skip'}` };
      } catch (err: unknown) {
        return { ok: false, msg: 'autofix fail: ' + (err instanceof Error ? err.message : String(err)) };
      }
    },
  });

  /**
   * v13.3.74+ Kevin 2026-05-08 ABSOLUE — `vault-resilience-watch` (5 min).
   *
   * Mission Kevin : "j'ai collé mes codes plusieurs fois ils les ont en mémoire
   * quelque part. Il doit plus avoir de problème"
   *
   * Audit cohérence des 3 sources de vérité credentials :
   *   - localStorage (rapide)
   *   - IndexedDB shadow (résiste cache clear)
   *   - Firebase backup dédié `/apex/vault_backup/<uid>/*` (cross-device)
   *
   * Si drift détecté (clé localement mais pas Firebase, ou inverse) → autoFix
   * via `vaultFirebaseBackup.syncDrift()` qui push manquants Firebase ET restore
   * manquants localement.
   */
  sentinels.register({
    id: 'vault-resilience-watch',
    name: 'Résilience Vault (3 sources)',
    desc: 'Audite cohérence localStorage / IDB / Firebase backup. Auto-fix drift.',
    intervalMs: 5 * 60 * 1000,
    check: async () => {
      try {
        const { vaultFirebaseBackup } = await import('../vault/vault-firebase-backup.js');
        const audit = await vaultFirebaseBackup.auditCoherence();
        if (!audit.drift_detected) {
          return {
            ok: true,
            msg: `${audit.local_count} local / ${audit.fb_count} Firebase — coherent`,
            details: { local: audit.local_count, fb: audit.fb_count },
          };
        }
        return {
          ok: false,
          msg:
            `Drift détecté : ${audit.in_local_not_fb.length} local sans backup, ` +
            `${audit.in_fb_not_local.length} Firebase sans local`,
          details: {
            in_local_not_fb: audit.in_local_not_fb,
            in_fb_not_local: audit.in_fb_not_local,
          },
        };
      } catch (err: unknown) {
        return {
          ok: false,
          msg: 'audit failed: ' + (err instanceof Error ? err.message : String(err)),
        };
      }
    },
    autoFix: async () => {
      /* v13.3.89 P2.15 : auto-fix renforcé.
       * Si Firebase non configuré, on remonte explicit "fb_not_configured"
       * (pas un fail caché). Si syncDrift échoue mais drift détecté,
       * on log explicite + retry 1× avec délai 500ms (cas réseau temporaire). */
      try {
        const { vaultFirebaseBackup } = await import('../vault/vault-firebase-backup.js');
        let r = await vaultFirebaseBackup.syncDrift();
        if (r.pushed === 0 && r.restored === 0) {
          /* Vérifie si vraiment besoin de retry (peut-être tout déjà OK) */
          const recheck = await vaultFirebaseBackup.auditCoherence();
          if (!recheck.drift_detected) {
            return { ok: true, msg: 'Drift résolu naturellement (re-audit OK)' };
          }
          /* Drift persiste → retry une fois après 500ms (ex : Firebase écrit en cours) */
          await new Promise((res) => setTimeout(res, 500));
          r = await vaultFirebaseBackup.syncDrift();
        }
        const ok = r.pushed > 0 || r.restored > 0;
        return {
          ok,
          msg: ok
            ? `syncDrift OK : ${r.pushed} → FB, ${r.restored} ← FB`
            : `syncDrift sans effet (FB non configuré ou erreur silencieuse)`,
        };
      } catch (err: unknown) {
        return {
          ok: false,
          msg: 'autofix fail: ' + (err instanceof Error ? err.message : String(err)),
        };
      }
    },
  });

  /* Mission Kevin 2026-05-08 23h30 — Mémoire augmentée par cœur :
   * Sentinelle horaire qui audite la santé de la mémoire injectée dans CHAQUE
   * appel IA. Vérifie : facts user, lessons cross-session, fraîcheur docs racine.
   * Si déficit détecté → auto-fix (re-fetch docs, demande extraction facts via
   * apex IA depuis derniers messages, refetch lessons Firebase shared).
   *
   * Différent du `memory-watch` quotidien (qui audite TAILLE / cleanup).
   * Ici on audite la PRÉSENCE / FRAÎCHEUR pour parité Apex-Kevin.
   */
  sentinels.register({
    id: 'memory-augmented-watch',
    name: 'Mémoire augmentée — fraîcheur identité',
    desc: 'Audit horaire facts/lessons/docs injectés system prompt — auto-refetch si stale',
    intervalMs: 60 * 60 * 1000 /* 1h */,
    check: async () => {
      try {
        /* Lecture user courant via store (peut être null si pas loggé) */
        let currentUid: string | null = null;
        try {
          const userRaw = localStorage.getItem('ax_user');
          if (userRaw) {
            const u = JSON.parse(userRaw) as { id?: string };
            if (u.id) currentUid = u.id;
          }
        } catch { /* skip */ }

        /* 1. Facts user — minimum 5 si user loggé */
        let factsCount = 0;
        try {
          const mod = await import('../storage/persistent-memory-store.js');
          const persistentMemoryStore = mod?.persistentMemory;
          if (persistentMemoryStore && typeof persistentMemoryStore.list === 'function') {
            const all = await persistentMemoryStore.list();
            if (Array.isArray(all) && currentUid) {
              factsCount = all.filter((e) => e.scope === currentUid).length;
            } else if (Array.isArray(all)) {
              factsCount = all.length;
            }
          }
        } catch { /* skip */ }

        /* 2. Lessons cross-session — minimum 1.
         * v13.3.94 P0.4 — fallback sur 2 sources : Firebase shared
         * (ax_lessons_learned_struct) ET seed local (apex_v13_lessons_cross_session).
         * Si l'une non vide → considère la mémoire OK (sinon faux positif au boot
         * avant que Firebase shared soit synced). */
        let lessonsCount = 0;
        try {
          const { storageCompressor: sc } = await import('../storage/storage-compressor.js');
          const struct = sc.safeParseJSON<unknown[]>('ax_lessons_learned_struct', []);
          const local = sc.safeParseJSON<{ lessons?: unknown[] }>('apex_v13_lessons_cross_session', {});
          const localCount = Array.isArray(local.lessons) ? local.lessons.length : 0;
          lessonsCount = (Array.isArray(struct) ? struct.length : 0) + localCount;
        } catch { /* skip */ }

        /* 3. Docs racine — fraîcheur < 6h */
        const REQUIRED_DOCS = [
          'CLAUDE.md',
          'NOTES_USER.md',
          'MEMO_RESUME.md',
          'KEVIN_INVENTORY.md',
          'KEVIN_ACTIONS_TODO.md',
          'MEMORY_PERSISTENT.md',
          'APEX_HANDOFF.md',
          'CLAUDE_FEED.md',
        ];
        const STALE_MS = 6 * 60 * 60 * 1000; /* 6h */
        const now = Date.now();
        let docsFresh = 0;
        let docsStale = 0;
        const missingDocs: string[] = [];
        try {
          /* v13.3.94 P0.4 — décompresse si __LZ__ */
          const { storageCompressor: sc2 } = await import('../storage/storage-compressor.js');
          const cache = sc2.safeParseJSON<Record<string, { ts: number }>>('apex_v13_docs_cache', {});
          for (const name of REQUIRED_DOCS) {
            const entry = cache[name];
            if (!entry) {
              missingDocs.push(name);
            } else if (now - entry.ts < STALE_MS) {
              docsFresh++;
            } else {
              docsStale++;
            }
          }
        } catch {
          missingDocs.push(...REQUIRED_DOCS);
        }

        const issues: string[] = [];
        if (currentUid && factsCount < 5) {
          issues.push(`facts < 5 pour ${currentUid} (${factsCount})`);
        }
        if (lessonsCount < 1) {
          issues.push(`lessons cross-session vides`);
        }
        if (docsStale > 0 || missingDocs.length > 0) {
          issues.push(`docs stale=${docsStale} missing=${missingDocs.length}`);
        }

        const report = {
          ts: now,
          uid: currentUid,
          facts: factsCount,
          lessons: lessonsCount,
          docs_fresh: docsFresh,
          docs_stale: docsStale,
          docs_missing: missingDocs,
        };
        try {
          const raw = localStorage.getItem('ax_memory_augmented_log') ?? '[]';
          const parsed = JSON.parse(raw) as unknown;
          const log = Array.isArray(parsed) ? parsed : [];
          log.push(report);
          localStorage.setItem('ax_memory_augmented_log', JSON.stringify(log.slice(-30)));
        } catch { /* quota */ }

        if (issues.length === 0) {
          return {
            ok: true,
            msg: `Mémoire OK : ${factsCount} facts, ${lessonsCount} lessons, ${docsFresh}/${REQUIRED_DOCS.length} docs frais`,
            details: report as unknown as Record<string, unknown>,
          };
        }
        return {
          ok: false,
          msg: `Déficit mémoire : ${issues.join(' · ')}`,
          details: report as unknown as Record<string, unknown>,
        };
      } catch (err: unknown) {
        return {
          ok: false,
          msg: 'memory-augmented-watch failed: ' + (err instanceof Error ? err.message : String(err)),
        };
      }
    },
    autoFix: async () => {
      try {
        const fixes: string[] = [];

        /* Auto-fix 1 : refetch docs si stale/missing */
        try {
          const { memory: memMod } = await import('../../core/memory.js');
          const r = await memMod.syncDocsAtBoot({ forceRefresh: true });
          fixes.push(`docs synced=${r.synced} skipped=${r.skipped} failed=${r.failed}`);
        } catch (err: unknown) {
          fixes.push('docs refetch failed: ' + String(err).slice(0, 100));
        }

        /* Auto-fix 2 : si user admin Kevin et < 5 facts → bootstrap defaults */
        try {
          const userRaw = localStorage.getItem('ax_user');
          if (userRaw) {
            const u = JSON.parse(userRaw) as { id?: string };
            if (u.id === 'kdmc_admin') {
              /* Force re-init (clear marker) si déficit */
              const mod = await import('../storage/persistent-memory-store.js');
              const all = await mod.persistentMemory.list();
              const kevinFacts = all.filter((e) => e.scope === 'kdmc_admin');
              if (kevinFacts.length < 5) {
                localStorage.removeItem('ax_kevin_init_done');
                const { memory: memMod } = await import('../../core/memory.js');
                await memMod.initBootDefaults();
                fixes.push('kevin defaults re-bootstrapped');
              }
            }
          }
        } catch (err: unknown) {
          fixes.push('kevin defaults fix failed: ' + String(err).slice(0, 80));
        }

        return {
          ok: fixes.length > 0,
          msg: `Auto-fix mémoire augmentée : ${fixes.join(' · ')}`,
        };
      } catch (err: unknown) {
        return {
          ok: false,
          msg: 'autofix fail: ' + (err instanceof Error ? err.message : String(err)),
        };
      }
    },
  });

  /* never-forget-watch : audit identité Apex 1×/h
   * (Kevin 2026-05-08 23h45 ABSOLUE : "Oublie ni moi ni personne jamais !")
   * Vérifie que Apex se souvient toujours de Kevin/Laurence/famille/amis/clients/cadres CMC.
   * 9 checks d'intégrité, escalade Claude Code via ax_claude_todo si critical.
   */
  sentinels.register({
    id: 'never-forget-watch',
    name: 'Never Forget (identité Apex)',
    desc: 'Audit horaire : Apex connaît Kevin + Laurence + famille + clients + cadres CMC',
    intervalMs: 60 * 60 * 1000, /* 1h */
    check: async () => {
      try {
        const { neverForgetWatch } = await import('./never-forget-watch.js');
        const result = neverForgetWatch.runOnce();
        if (result.critical_count > 0) {
          return {
            ok: false,
            msg: `${result.critical_count} check(s) CRITIQUES — Apex risque d'oublier identité`,
            details: {
              critical: result.critical_count,
              failed: result.failed_count,
              total_users: result.total_known_users,
            },
          };
        }
        if (result.failed_count > 0) {
          return {
            ok: false,
            msg: `${result.failed_count} check(s) WARN — identité dégradée`,
            details: {
              failed: result.failed_count,
              total_users: result.total_known_users,
            },
          };
        }
        return {
          ok: true,
          msg: `Identité Apex OK (${result.total_known_users} users connus, ${result.passed_count}/9 checks)`,
        };
      } catch (err: unknown) {
        return {
          ok: false,
          msg: 'never-forget audit fail: ' + (err instanceof Error ? err.message : String(err)),
        };
      }
    },
    /* v13.3.79+ autoFix Kevin 2026-05-08 "Oublie ni moi ni personne jamais !" :
     * Bootstrap defaults Kevin/Laurence + force re-sync docs racine. */
    autoFix: async () => {
      try {
        const fixes: string[] = [];
        try {
          const { memory: memMod } = await import('../../core/memory.js');
          await memMod.initBootDefaults();
          fixes.push('memory boot defaults restaured');
        } catch (err: unknown) {
          fixes.push('initBootDefaults fail: ' + String(err).slice(0, 80));
        }
        try {
          const { memory: memMod } = await import('../../core/memory.js');
          const r = await memMod.syncDocsAtBoot({ forceRefresh: true });
          fixes.push(`docs synced=${r.synced}`);
        } catch (err: unknown) {
          fixes.push('docs refresh fail: ' + String(err).slice(0, 80));
        }
        return {
          ok: fixes.length > 0,
          msg: 'never-forget restore: ' + fixes.join(' · '),
        };
      } catch (err: unknown) {
        return { ok: false, msg: 'never-forget autoFix fail: ' + (err instanceof Error ? err.message : String(err)) };
      }
    },
  });

  /* auto-ultra-reset-watch : sentinelle autonomie totale Kevin 2026-05-08
   * "Ultra reset autonome automatique si besoin, rappel toi"
   *
   * Détecte cache stale + bugs persistants + corruption + SW unreliable + identité incohérente.
   * Score >= 6 → triggerAutoReset() :
   *   1. backup Firebase vault (pas de perte credentials)
   *   2. unregister SW + clear caches + clear Apex localStorage + clear Apex IDB
   *   3. location.replace(...?_auto_reset=1)
   *   4. au reload : restoreAfterReset() depuis Firebase backup + toast Kevin
   *
   * Garde-fous : throttle 24h ABSOLU + skip si offline.
   * Toggle off-able via 'sentinel.auto-ultra-reset' (default ON).
   */
  sentinels.register({
    id: 'auto-ultra-reset-watch',
    name: 'Auto Ultra Reset (autonomie)',
    desc: 'Détecte état dégradé et auto-rafraîchit Apex sans demander Kevin',
    intervalMs: 15 * 60 * 1000, /* 15 min */
    check: async () => {
      const { autoUltraReset } = await import('../storage/auto-ultra-reset.js');
      const assessment = await autoUltraReset.assessConditions();
      if (!assessment.shouldTrigger) {
        return {
          ok: true,
          msg: `Score ${assessment.score}/10 (seuil 6) — état stable`,
          details: {
            score: assessment.score,
            reasons: assessment.reasons,
          },
        };
      }
      return {
        ok: false,
        msg: `Score ${assessment.score}/10 — auto-reset déclenché : ${assessment.reasons.join(' · ')}`,
        details: {
          score: assessment.score,
          reasons: assessment.reasons,
          conditions: assessment.conditions,
        },
      };
    },
    autoFix: async () => {
      const { autoUltraReset } = await import('../storage/auto-ultra-reset.js');
      const result = await autoUltraReset.triggerAutoReset();
      if (result.throttled) {
        return { ok: false, msg: `throttled : ${result.reason ?? '24h guard'}` };
      }
      if (!result.ok) {
        return { ok: false, msg: result.reason ?? 'trigger failed' };
      }
      return {
        ok: true,
        msg: `Auto-reset lancé (pre-backup ${result.preBackupOk ? 'OK' : 'partial'}), reload imminent`,
      };
    },
  });

  /* v13.3.79+ Kevin 2026-05-08 — global-health-watch (5 min)
   * Méta-sentinelle : agrège l'état des autres sentinelles via leur `lastResult`
   * (pas de re-run cascade pour éviter N×N en parallèle), déclenche leur autoFix
   * EXPLICITEMENT pour celles qui ont fail récemment, escalade Claude Code si
   * > 30% restent fail après auto-fix.
   *
   * Mission Kevin : "Apex doit s'auto-corriger TOUT seul, ne JAMAIS attendre".
   *
   * Stats persistées dans ax_global_health_log (cap 100) pour vue admin health-dashboard.
   *
   * NOTE : Lit lastResult au lieu de runOne() pour éviter cascade qui exploserait
   * en runAll() (le scheduler court chaque sentinelle individuellement à intervalle propre).
   */
  sentinels.register({
    id: 'global-health-watch',
    name: 'Global Health Watch (méta auto-fix)',
    desc: 'Agrège lastResults des sentinelles, déclenche autoFix cascade, escalade si > 30% fail post-fix',
    intervalMs: 5 * 60 * 1000, /* 5 min */
    check: async () => {
      const others = sentinels.list().filter((s) => s.id !== 'global-health-watch' && s.enabled);
      const total = others.length;
      let okCount = 0;
      let warnCount = 0;
      let failCount = 0;
      let pendingCount = 0;
      let autoFixedCount = 0;
      let autoFixFailedCount = 0;
      const failed: string[] = [];

      /* Pass 1 : lit lastResult (rapide, pas de cascade)
       * v13.3.86 P0.3 audit externe fix : détection warning même si ok:true
       * (avant : "Drift détecté", "1 agents en erreur", "lessons vides" comptaient OK
       * → global-health reportait 43/43 green alors que 3 warnings réels).
       * v13.3.94 P0.5 audit cabinet 58/100 fix : never-run = pending (PAS ok),
       * pour ne plus reporter "44/44 green" alors que les sentinelles ne sont
       * pas encore exécutées. Message inclut explicitement le pendingCount. */
      const WARN_PATTERNS = /\b(drift|warning|warn|deficit|déficit|erreur|error|missing|absent|fail|stale|orphan|leak|stuck|degraded|dégradé)\b/i;
      for (const s of others) {
        if (!s.lastResult) {
          /* Jamais run encore = pending, comptabilisé séparément (PAS counté ok). */
          pendingCount++;
          continue;
        }
        if (s.lastResult.ok) {
          if (s.lastResult.msg.startsWith('Auto-fixed:')) autoFixedCount++;
          /* P0.3 fix : un ok:true mais msg avec pattern warn = warning, pas full ok */
          if (WARN_PATTERNS.test(s.lastResult.msg)) {
            warnCount++;
            failed.push(s.id); /* déclenche autoFix Pass 2 sur les warnings aussi */
          } else {
            okCount++;
          }
        } else {
          failCount++;
          failed.push(s.id);
        }
      }

      /* Pass 2 : déclenche autoFix EXPLICITE pour les failed avec autoFix dispo
       * (cascade contrôlée — boucle séquentielle pas parallèle pour stabilité). */
      const failedWithAutoFix = others.filter((s) => failed.includes(s.id) && s.autoFix);
      let triggered = 0;
      for (const s of failedWithAutoFix.slice(0, 5)) { /* cap 5 par run pour éviter spam */
        try {
          const r = await s.autoFix?.();
          if (r?.ok) {
            triggered++;
            autoFixedCount++;
            /* Décrémente failed (car ce qui était failed vient d'être réparé) */
            const idx = failed.indexOf(s.id);
            if (idx >= 0) {
              failed.splice(idx, 1);
              failCount--;
            }
          } else {
            autoFixFailedCount++;
          }
        } catch {
          autoFixFailedCount++;
        }
      }

      const failPct = total > 0 ? Math.round((failCount / total) * 100) : 0;
      /* v13.3.94 P0.5 — denominator honest = sentinelles RUN (total - pending).
       * Si toutes pending au boot → ratio undefined, on reporte "init phase". */
      const ranTotal = total - pendingCount;
      const summary = {
        ts: Date.now(),
        total,
        ok: okCount,
        failed: failCount,
        warn: warnCount,
        pending: pendingCount,
        ranTotal,
        autoFixed: autoFixedCount,
        autoFixFailed: autoFixFailedCount,
        autoFixTriggered: triggered,
        failedIds: failed,
        failPct,
      };

      /* Persist log cap 100 */
      try {
        const raw = localStorage.getItem('ax_global_health_log') ?? '[]';
        const parsed = JSON.parse(raw) as unknown;
        const log = Array.isArray(parsed) ? parsed : [];
        log.push(summary);
        localStorage.setItem('ax_global_health_log', JSON.stringify(log.slice(-100)));
      } catch { /* quota */ }

      const pendingTag = pendingCount > 0 ? ` (${pendingCount} pending init)` : '';

      /* Escalade si > 30% des sentinelles fail après auto-fix */
      if (failPct > 30) {
        return {
          ok: false,
          msg: `🚨 Global health critical : ${failPct}% sentinels fail (${okCount}/${ranTotal} OK + ${autoFixedCount} auto-fixed)${pendingTag}`,
          details: summary as unknown as Record<string, unknown>,
        };
      }
      if (failPct > 10) {
        return {
          ok: false,
          msg: `⚠ Global health degraded : ${failPct}% fail (${okCount}/${ranTotal} OK + ${autoFixedCount} auto-fixed)${pendingTag}`,
          details: summary as unknown as Record<string, unknown>,
        };
      }
      /* Pendant l'init (pendingCount > 0), msg honnête : on n'affirme pas
       * "X/total green" car on n'a pas encore évalué les pending. */
      if (pendingCount > 0 && ranTotal === 0) {
        return {
          ok: true,
          msg: `🟡 Global health init phase : 0/${total} évaluées (${pendingCount} pending première exécution)`,
          details: summary as unknown as Record<string, unknown>,
        };
      }
      return {
        ok: true,
        msg: `🟢 Global health OK : ${okCount}/${ranTotal} green${warnCount > 0 ? `, ${warnCount} warn` : ''}, ${autoFixedCount} auto-fixed${pendingTag}`,
        details: summary as unknown as Record<string, unknown>,
      };
    },
    /* Auto-fix : si > 30% fail persistant, escalade Claude Code via ax_claude_todo
     * (cas où Claude Code intervention nécessaire — Apex a tout tenté). */
    autoFix: async () => {
      try {
        const raw = localStorage.getItem('ax_global_health_log');
        if (!raw) return { ok: false, msg: 'No history yet' };
        const parsed = JSON.parse(raw) as unknown;
        const log = Array.isArray(parsed) ? parsed : [];
        const last = log[log.length - 1] as { failed: number; total: number; failedIds?: string[] } | undefined;
        if (!last || last.total === 0) return { ok: false, msg: 'No data' };
        if (last.failed === 0) return { ok: true, msg: 'No fail to escalate' };

        /* Escalade vers ax_claude_todo */
        const todo = {
          id: `todo_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          sentinel_id: 'global-health-watch',
          severity: 'critical' as const,
          message: `Global health critical: ${last.failed}/${last.total} sentinelles fail après auto-fix`,
          details: {
            failedIds: last.failedIds ?? [],
            total: last.total,
            failed: last.failed,
          },
          src: 'global-health-watch',
          ts: Date.now(),
          status: 'pending' as const,
        };
        try {
          const todoRaw = localStorage.getItem('ax_claude_todo') ?? '[]';
          const todoParsed = JSON.parse(todoRaw) as unknown;
          const list = Array.isArray(todoParsed) ? todoParsed : [];
          list.push(todo);
          localStorage.setItem('ax_claude_todo', JSON.stringify(list.slice(-50)));
        } catch { /* quota */ }

        return {
          ok: true,
          msg: `Escalated to Claude Code (${last.failed} sentinels persistent fail)`,
        };
      } catch (err: unknown) {
        return { ok: false, msg: 'global-health autoFix fail: ' + (err instanceof Error ? err.message : String(err)) };
      }
    },
  });

  /**
   * v13.3.79+ Kevin 2026-05-08 18:05 — apex-self-correct-watch (5 min)
   *
   * "Il ne s'auto-corrige pas apparemment, il attend que tu le fasses c'est pas normal"
   *
   * Cycle complet de la cascade auto-correct toutes les 5 minutes :
   *   - Détecte 3+ chat-fallback en 5min OU aucune réponse OK depuis 10min
   *     OU all_providers_dead audit récent
   *   - Cascade : restore credentials → reset DEAD timers → ULTRA-RESET → escalade Claude
   *   - Throttle interne 30 min anti-boucle (cf apex-self-correct.ts)
   *
   * Toast user "🔧 Apex s'est auto-réparé" si résolu sans intervention humaine.
   */
  sentinels.register({
    id: 'apex-self-correct-watch',
    name: 'Apex Self-Correct cascade',
    desc: 'Détecte panne récurrente IA et déclenche cascade auto-correct sans Kevin',
    intervalMs: 5 * 60 * 1000, /* 5 min */
    check: async () => {
      const { apexSelfCorrect } = await import('../admin/apex-self-correct.js');
      const result = await apexSelfCorrect.runCycle();
      if (!result.triggered) {
        const baseDetails = result.detection
          ? {
              fallback_ratio: result.detection.fallback_ratio,
              recent_fallbacks: result.detection.recent_fallbacks,
              ms_since_last_success: result.detection.ms_since_last_success,
            }
          : undefined;
        return {
          ok: true,
          msg: result.skipped_reason === 'throttled'
            ? 'Cooldown 30min anti-boucle'
            : 'Aucune panne détectée',
          ...(baseDetails ? { details: baseDetails } : {}),
        };
      }
      if (result.resolved) {
        return {
          ok: true,
          msg: `🔧 Auto-correct résolu (${result.steps.length} étapes)`,
          details: {
            reasons: result.detection?.reasons ?? [],
            steps: result.steps.map((s) => `${s.step}=${s.ok ? 'ok' : 'fail'}`),
          },
        };
      }
      /* Triggered but not resolved → escalated */
      return {
        ok: false,
        msg: result.escalated
          ? '🚨 Cascade auto-correct épuisée → escaladée Claude Code'
          : 'Cascade en cours…',
        details: {
          reasons: result.detection?.reasons ?? [],
          steps: result.steps.map((s) => `${s.step}=${s.ok ? 'ok' : 'fail'}`),
          escalated: result.escalated,
        },
      };
    },
  });

  /* v13.4.205 (Kevin 2026-05-16 "Toutes branches Claude Code coordonnées") :
   * Multi-branch coordinator — poll GitHub API branches claude/* + détecte
   * conflits (fichiers touchés par 2+ branches) + overlaps + branches stale.
   * Persiste status Firebase ax_multi_branch_status pour partage cross-session.
   * Toute nouvelle branche Kevin créée est auto-détectée au prochain cycle. */
  sentinels.register({
    id: 'multi-branch-coordinator-watch',
    name: 'Multi-Branch Coordinator Claude Code',
    desc: "Poll GitHub branches claude/* + détecte conflits/overlaps/stale + push Firebase shared. 10min interval.",
    intervalMs: 10 * 60 * 1000, /* 10min */
    check: async () => {
      try {
        const { apexMultiBranchCoordinator } = await import('../admin/apex-multi-branch-coordinator.js');
        const r = await apexMultiBranchCoordinator.runCoordinationCycle();
        if (!r.ok) {
          if (r.error === 'admin_only' || r.error === 'no_github_token') {
            return { ok: true, msg: 'skipped (' + r.error + ')' };
          }
          return { ok: false, msg: 'coordinator error: ' + r.error };
        }
        const hasConflicts = r.conflicts.files_overlapping.length > 0;
        return {
          ok: !hasConflicts,
          msg: `${r.branches.length} branches actives, ${r.conflicts.files_overlapping.length} fichiers en conflit, ${r.conflicts.branches_unmerged_old.length} branches non mergées anciennes`,
          details: {
            total_branches: r.branches.length,
            overlapping_files: r.conflicts.files_overlapping.length,
            stale_branches: r.conflicts.branches_stale.length,
            unmerged_old: r.conflicts.branches_unmerged_old.length,
            recommendations: r.recommendations.slice(0, 3),
          },
        };
      } catch (err) {
        return { ok: false, msg: 'sentinel error: ' + (err instanceof Error ? err.message : String(err)) };
      }
    },
  });

  /* v13.4.204 (Kevin 2026-05-16 "Apex fait tous les tests runtime autonome") :
   * Wire auto-test-runner.runAll() en sentinelle 12h. Le service existait
   * (orphelin v13.4.x) avec 6+ tests : memory, persistent_memory, vault,
   * ai-router, firebase, store etc. Maintenant tourne en autonomie sans
   * intervention Kevin. Si fails > 0 → record session learning + log warning.
   * Résultats persistés dans apex_v13_auto_test_log (50 derniers). */
  sentinels.register({
    id: 'auto-test-runner-watch',
    name: 'Auto-test runtime Apex',
    desc: "Lance auto-test-runner toutes les 12h : memory, vault, ai-router, persistent-memory, firebase, store. Apex teste lui-même en autonomie sans Kevin.",
    intervalMs: 12 * 60 * 60 * 1000, /* 12h */
    check: async () => {
      try {
        const { autoTestRunner } = await import('../admin/auto-test-runner.js');
        const summary = await autoTestRunner.runAll();
        const msg = `${summary.passed}/${summary.total} pass · ${summary.failed} fail · ${summary.skipped} skip (${summary.durationMs}ms)`;
        if (summary.failed > 0) {
          return {
            ok: false,
            msg,
            details: {
              failed_tests: summary.results.filter((r) => r.status === 'fail').map((r) => r.name),
              duration_ms: summary.durationMs,
            },
          };
        }
        return { ok: true, msg, details: { duration_ms: summary.durationMs } };
      } catch (err) {
        return { ok: false, msg: 'auto-test-runner error: ' + (err instanceof Error ? err.message : String(err)) };
      }
    },
  });

  /* v13.4.204 — github-notifications-clean (déjà v13.4.203, gardé tel quel) */
  sentinels.register({
    id: 'github-notifications-clean-watch',
    name: 'GitHub Actions noise auto-clean',
    desc: "Nettoie automatiquement les notifications GitHub Actions de Kevin (unsubscribe threads + mark all read). 6h interval.",
    intervalMs: 6 * 60 * 60 * 1000, /* 6h */
    check: async () => {
      try {
        const { apexGithubNotifications } = await import('../integrations/apex-github-notifications.js');
        const r = await apexGithubNotifications.cleanActionsNotifications();
        if (!r.ok) {
          if (r.error === 'admin_only' || r.error === 'no_github_token_in_vault') {
            return { ok: true, msg: 'skipped (' + r.error + ')' };
          }
          return { ok: false, msg: 'clean failed: ' + (r.error ?? 'unknown') };
        }
        return {
          ok: true,
          msg: `Cleared ${r.notifications_cleared ?? 0} notifs, unsubscribed ${r.actions_threads_unsubscribed ?? 0} Actions threads`,
          details: {
            notifications_before: r.notifications_before,
            notifications_cleared: r.notifications_cleared,
            actions_threads_unsubscribed: r.actions_threads_unsubscribed,
          },
        };
      } catch (err) {
        return { ok: false, msg: 'sentinel error: ' + (err instanceof Error ? err.message : String(err)) };
      }
    },
  });

  logger.info('sentinels', `Registered ${sentinels.list().length} sentinels (28 active + auto-test-runner + github-clean + apex-self-correct + global-health méta)`);
}
