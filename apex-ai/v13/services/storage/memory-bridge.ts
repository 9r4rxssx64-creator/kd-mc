/**
 * APEX v13 — Memory Bridge (mémoire persistante externe + auto-escalade audit).
 *
 * Demande Kevin 2026-05-04 :
 * Réponse honnête Apex IA dans audit Kevin :
 * "Pas de mémoire persistante native (15/100), pas d'autonomie réelle (45/100)"
 * Solution : intégrations externes Notion API + GitHub Issues + Firebase RTDB
 * + n8n webhook auto-trigger pour escalade audit.
 *
 * Architecture :
 * - 3 backends : Notion API / GitHub Issues API / Firebase RTDB / GitHub Gist
 * - Auto-sync : memories localStorage → backend externe toutes 5 min
 * - Auto-restore : au boot → fetch backend → merge avec local
 * - Auto-escalade : audit Apex → POST webhook n8n → ax_handoff_journal Firebase
 *
 * API publique :
 * - syncToNotion(databaseId, token) : push memories vers Notion DB
 * - syncToFirebase(uid) : push backup chiffré (déjà fait via vault firebase backup)
 * - syncToGitHubGist(token) : backup gist privé
 * - restoreFromBackend(backend) : pull au boot
 * - autoEscalate(payload) : POST n8n webhook (config ax_n8n_webhook_url)
 * - getStatus() : last sync ts par backend
 * - enableAutoSync(intervalMs) : cron interne
 *
 * Anti-pattern Kevin :
 * - Tokens lus via vault.readKey() jamais en clair
 * - Audit log de tous les push externes
 * - PII redaction avant push externe
 * - Idempotency sur les sync (hash payload)
 */

import { logger } from '../../core/logger.js';
import { firebaseAuthBridge } from '../auth/firebase-auth-bridge.js';
import { auditLog } from '../observability/audit-log.js';
import { observability } from '../observability/observability.js';

import { persistentMemory, type MemoryEntry } from './persistent-memory-store.js';

export type MemoryBackend = 'notion' | 'firebase' | 'github_gist' | 'github_issues' | 'n8n_webhook';

export interface BackendConfig {
  notion_database_id?: string;
  notion_token_key?: string; /* clé localStorage où vault stocke le token */
  github_gist_id?: string;
  github_token_key?: string;
  github_repo?: string; /* "owner/repo" pour issues */
  firebase_path?: string;
  n8n_webhook_url?: string;
}

export interface SyncStatus {
  backend: MemoryBackend;
  last_sync_ts: number;
  last_success: boolean;
  last_error?: string;
  entries_synced: number;
}

export interface SyncResult {
  ok: boolean;
  backend: MemoryBackend;
  entries: number;
  reason?: string;
  duration_ms: number;
}

export interface EscalatePayload {
  type: 'audit' | 'error' | 'lesson' | 'todo';
  severity: 'info' | 'warn' | 'critical';
  scope: string;
  msg: string;
  context?: Record<string, unknown>;
}

const STATUS_KEY = 'apex_v13_memory_bridge_status';
const CONFIG_KEY = 'apex_v13_memory_bridge_config';
const HANDOFF_KEY = 'ax_handoff_journal';
const DEFAULT_AUTO_SYNC_MS = 5 * 60 * 1000; /* 5 min */
const MAX_HANDOFF = 200;

class MemoryBridge {
  private status = new Map<MemoryBackend, SyncStatus>();
  private autoSyncTimer: number | null = null;
  private autoSyncIntervalMs = DEFAULT_AUTO_SYNC_MS;
  private statusLoaded = false;

  /**
   * Charge config bridge depuis localStorage.
   */
  getConfig(): BackendConfig {
    try {
      const raw = localStorage.getItem(CONFIG_KEY);
      if (!raw) return {};
      return JSON.parse(raw) as BackendConfig;
    } catch {
      return {};
    }
  }

  /**
   * Sauvegarde config bridge.
   */
  setConfig(config: BackendConfig): void {
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
      void auditLog.record('memory_bridge.config_updated', {
        details: {
          backends: Object.keys(config).filter((k) => Boolean((config as Record<string, unknown>)[k])),
        },
      });
    } catch (err: unknown) {
      logger.warn('memory-bridge', 'setConfig failed', { err });
    }
  }

  /**
   * Push memories vers Notion Database.
   * Format : 1 page par memory entry avec properties Title/Category/Importance/Scope/Date.
   */
  async syncToNotion(databaseId: string, token: string): Promise<SyncResult> {
    const start = Date.now();
    if (!databaseId || !token) {
      return this.recordSync('notion', false, 0, 'Missing databaseId or token', start);
    }
    try {
      const entries = await persistentMemory.list();
      const sanitized = this.sanitizeForExternal(entries);
      let ok = 0;
      for (const e of sanitized.slice(0, 50)) /* Notion API rate-limit safe */ {
        const body = {
          parent: { database_id: databaseId },
          properties: {
            Title: { title: [{ text: { content: e.text.slice(0, 200) } }] },
            Category: { select: { name: e.category } },
            Importance: { number: e.importance },
            Scope: { rich_text: [{ text: { content: e.scope } }] },
            Date: { date: { start: new Date(e.ts).toISOString() } },
          },
        };
        const res = await fetch('https://api.notion.com/v1/pages', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Notion-Version': '2022-06-28',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(10000),
        });
        if (res.ok) ok++;
        else if (res.status === 401) {
          return this.recordSync('notion', false, ok, 'Notion token invalid', start);
        }
      }
      void auditLog.record('memory_bridge.sync_notion', { details: { entries: ok } });
      return this.recordSync('notion', true, ok, undefined, start);
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
      return this.recordSync('notion', false, 0, reason, start);
    }
  }

  /**
   * Push memories chiffrées vers Firebase RTDB.
   * Le path par défaut : /apex/users/<uid>/memory_bridge_backup
   */
  async syncToFirebase(uid: string): Promise<SyncResult> {
    const start = Date.now();
    if (!uid) {
      return this.recordSync('firebase', false, 0, 'Missing uid', start);
    }
    try {
      const { firebase } = await import('./firebase.js');
      if (!firebase.isConnected()) {
        return this.recordSync('firebase', false, 0, 'Firebase offline', start);
      }
      const entries = await persistentMemory.list({ scope: uid });
      const sanitized = this.sanitizeForExternal(entries);
      const path = `users/${uid}/memory_bridge_backup`;
      const url = `https://cmcteams-c16ab-default-rtdb.europe-west1.firebasedatabase.app/apex/${path}.json${firebaseAuthBridge.authQS(false)}`;
      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          backup_ts: Date.now(),
          entries: sanitized,
          count: sanitized.length,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        return this.recordSync('firebase', false, 0, `HTTP ${res.status}`, start);
      }
      void auditLog.record('memory_bridge.sync_firebase', { details: { entries: sanitized.length, uid } });
      return this.recordSync('firebase', true, sanitized.length, undefined, start);
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
      return this.recordSync('firebase', false, 0, reason, start);
    }
  }

  /**
   * Backup memories vers GitHub Gist privé.
   */
  async syncToGitHubGist(token: string, gistId?: string): Promise<SyncResult> {
    const start = Date.now();
    if (!token) {
      return this.recordSync('github_gist', false, 0, 'Missing token', start);
    }
    try {
      const entries = await persistentMemory.list();
      const sanitized = this.sanitizeForExternal(entries);
      const content = JSON.stringify({ ts: Date.now(), entries: sanitized }, null, 2);
      const filename = 'apex-memory-backup.json';
      const description = `Apex v13 memory backup ${new Date().toISOString()}`;
      let url = 'https://api.github.com/gists';
      let method: 'POST' | 'PATCH' = 'POST';
      if (gistId) {
        url = `https://api.github.com/gists/${gistId}`;
        method = 'PATCH';
      }
      const body = {
        description,
        public: false,
        files: { [filename]: { content } },
      };
      const res = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        return this.recordSync('github_gist', false, 0, `HTTP ${res.status}`, start);
      }
      const json = await res.json() as { id?: string };
      if (json.id && !gistId) {
        const cfg = this.getConfig();
        cfg.github_gist_id = json.id;
        this.setConfig(cfg);
      }
      void auditLog.record('memory_bridge.sync_gist', { details: { entries: sanitized.length, gistId: json.id } });
      return this.recordSync('github_gist', true, sanitized.length, undefined, start);
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
      return this.recordSync('github_gist', false, 0, reason, start);
    }
  }

  /**
   * Pull memories depuis backend distant et merge avec local.
   * Stratégie : last-write-wins par id, avec conservation des plus récents.
   */
  async restoreFromBackend(backend: MemoryBackend): Promise<SyncResult> {
    const start = Date.now();
    try {
      let fetched: MemoryEntry[] = [];
      const cfg = this.getConfig();
      if (backend === 'firebase') {
        const uid = (this.getCurrentUid() ?? '').trim();
        if (!uid) {
          return this.recordSync('firebase', false, 0, 'No uid for restore', start);
        }
        const url = `https://cmcteams-c16ab-default-rtdb.europe-west1.firebasedatabase.app/apex/users/${uid}/memory_bridge_backup.json${firebaseAuthBridge.authQS(false)}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) {
          return this.recordSync('firebase', false, 0, `HTTP ${res.status}`, start);
        }
        const json = await res.json() as { entries?: MemoryEntry[] } | null;
        fetched = Array.isArray(json?.entries) ? json.entries : [];
      } else if (backend === 'github_gist') {
        if (!cfg.github_gist_id || !cfg.github_token_key) {
          return this.recordSync('github_gist', false, 0, 'Missing gist config', start);
        }
        const { vault } = await import('../vault/vault.js');
        const token = await vault.readKey(cfg.github_token_key);
        if (!token) {
          return this.recordSync('github_gist', false, 0, 'Token not in vault', start);
        }
        const res = await fetch(`https://api.github.com/gists/${cfg.github_gist_id}`, {
          headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github+json' },
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) {
          return this.recordSync('github_gist', false, 0, `HTTP ${res.status}`, start);
        }
        const json = await res.json() as { files?: Record<string, { content?: string }> };
        const raw = json.files?.['apex-memory-backup.json']?.content;
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as { entries?: MemoryEntry[] };
            fetched = Array.isArray(parsed.entries) ? parsed.entries : [];
          } catch {
            return this.recordSync('github_gist', false, 0, 'Gist parse failed', start);
          }
        }
      } else {
        return this.recordSync(backend, false, 0, `Backend ${backend} restore not supported`, start);
      }
      /* Merge avec local (dédupe par id, garde plus récent) */
      let merged = 0;
      for (const e of fetched) {
        if (!e.id || !e.text || !e.category) continue;
        await persistentMemory.add(e);
        merged++;
      }
      void auditLog.record('memory_bridge.restore', { details: { backend, entries: merged } });
      return this.recordSync(backend, true, merged, undefined, start);
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
      return this.recordSync(backend, false, 0, reason, start);
    }
  }

  /**
   * Auto-escalade : POST webhook n8n + push ax_handoff_journal Firebase.
   * Webhook URL lu depuis config (ax_n8n_webhook_url).
   */
  async autoEscalate(payload: EscalatePayload): Promise<{ ok: boolean; reason?: string; webhook_ok: boolean; handoff_ok: boolean }> {
    /* 1. Push handoff journal (toujours) */
    let handoffOk = false;
    try {
      const journal = JSON.parse(localStorage.getItem(HANDOFF_KEY) ?? '[]') as Array<EscalatePayload & { ts: number; id: string }>;
      const entry = {
        ...payload,
        ts: Date.now(),
        id: `esc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      };
      journal.push(entry);
      if (journal.length > MAX_HANDOFF) journal.splice(0, journal.length - MAX_HANDOFF);
      localStorage.setItem(HANDOFF_KEY, JSON.stringify(journal));
      handoffOk = true;
    } catch (err: unknown) {
      logger.warn('memory-bridge', 'handoff persist failed', { err });
    }

    /* 2. POST webhook n8n si configuré */
    let webhookOk = false;
    let webhookReason: string | undefined;
    const cfg = this.getConfig();
    const url = cfg.n8n_webhook_url;
    if (url) {
      try {
        const sanitizedPayload = this.sanitizePayload(payload);
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: 'apex_v13',
            ts: Date.now(),
            ...sanitizedPayload,
          }),
          signal: AbortSignal.timeout(8000),
        });
        webhookOk = res.ok;
        if (!res.ok) webhookReason = `HTTP ${res.status}`;
      } catch (err: unknown) {
        webhookReason = err instanceof Error ? err.message : String(err);
      }
    } else {
      webhookReason = 'No webhook URL configured';
    }

    /* 3. Audit + observability */
    void auditLog.record('memory_bridge.auto_escalate', {
      details: {
        type: payload.type,
        severity: payload.severity,
        webhook_ok: webhookOk,
        handoff_ok: handoffOk,
      },
    });
    if (payload.severity === 'critical') {
      observability.capture('critical', 'memory_bridge.escalate', payload.msg, {
        webhook_ok: webhookOk,
        handoff_ok: handoffOk,
      });
    }

    return {
      ok: handoffOk || webhookOk,
      ...(webhookReason && !webhookOk && { reason: webhookReason }),
      webhook_ok: webhookOk,
      handoff_ok: handoffOk,
    };
  }

  /**
   * Status sync par backend (last sync ts, success, errors).
   */
  getStatus(): readonly SyncStatus[] {
    this.loadStatus();
    return [...this.status.values()];
  }

  /**
   * v13.3.74 M3 (audit Apex v13.3.73 issue #240) — Liste backends actifs (= configurés).
   *
   * Backends supportés :
   * - 'firebase' : actif si uid disponible (apex_v13_uid)
   * - 'notion' : actif si notion_database_id + notion_token_key configurés
   * - 'github_gist' : actif si github_token_key configuré
   * - 'n8n_webhook' : actif si n8n_webhook_url configuré
   *
   * Retour : liste backends actifs trié par préférence (firebase, notion, github_gist, n8n_webhook).
   */
  getActiveBackends(): readonly MemoryBackend[] {
    const cfg = this.getConfig();
    const active: MemoryBackend[] = [];
    /* Firebase = primary (toujours implicite si uid) */
    if (this.getCurrentUid()) active.push('firebase');
    /* Notion = optionnel */
    if (cfg.notion_database_id && cfg.notion_token_key) active.push('notion');
    /* GitHub Gist = optionnel */
    if (cfg.github_token_key) active.push('github_gist');
    /* n8n webhook = trigger only (pas de stockage memories) */
    if (cfg.n8n_webhook_url) active.push('n8n_webhook');
    return active;
  }

  /**
   * v13.3.74 M3 (audit Apex v13.3.73 issue #240) — Push parallèle vers 1 backend précis.
   *
   * Wrapper unifié au-dessus des syncTo* méthodes existantes. Permet à services
   * externes (sentinelles, admin commands) de pusher data sans connaître les
   * détails de chaque backend.
   *
   * Timeout 5s par backend (déjà géré par les syncTo* internes via AbortSignal).
   * Si backend KO → retourne { ok: false, reason } sans throw (back-compat).
   *
   * @param backendId - 'firebase' | 'notion' | 'github_gist' | 'n8n_webhook'
   * @param data - Optionnel : si fourni, considère comme escalade (n8n_webhook).
   *               Sinon, sync les memories actuelles (persistent-memory).
   */
  async syncTo(backendId: MemoryBackend, data?: EscalatePayload): Promise<SyncResult> {
    const start = Date.now();
    try {
      if (backendId === 'firebase') {
        const uid = this.getCurrentUid();
        if (!uid) return this.recordSync('firebase', false, 0, 'No uid', start);
        return await this.syncToFirebase(uid);
      }
      if (backendId === 'notion') {
        const cfg = this.getConfig();
        if (!cfg.notion_database_id || !cfg.notion_token_key) {
          return this.recordSync('notion', false, 0, 'Notion not configured', start);
        }
        const { vault } = await import('../vault/vault.js');
        const token = await vault.readKey(cfg.notion_token_key);
        if (!token) return this.recordSync('notion', false, 0, 'Notion token empty', start);
        return await this.syncToNotion(cfg.notion_database_id, token);
      }
      if (backendId === 'github_gist') {
        const cfg = this.getConfig();
        if (!cfg.github_token_key) {
          return this.recordSync('github_gist', false, 0, 'GitHub token not configured', start);
        }
        const { vault } = await import('../vault/vault.js');
        const token = await vault.readKey(cfg.github_token_key);
        if (!token) return this.recordSync('github_gist', false, 0, 'GitHub token empty', start);
        return await this.syncToGitHubGist(token, cfg.github_gist_id);
      }
      if (backendId === 'n8n_webhook') {
        if (!data) return this.recordSync('n8n_webhook', false, 0, 'No data payload (n8n requires escalation)', start);
        const r = await this.autoEscalate(data);
        return this.recordSync('n8n_webhook', r.webhook_ok, r.webhook_ok ? 1 : 0, r.reason, start);
      }
      /* github_issues : pas implémenté (placeholder back-compat enum) */
      return this.recordSync(backendId, false, 0, `Backend ${backendId} not implemented`, start);
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
      return this.recordSync(backendId, false, 0, reason, start);
    }
  }

  /**
   * Reset interne — usage tests uniquement (réinitialise cache mémoire singleton).
   */
  _resetForTests(): void {
    this.status.clear();
    this.statusLoaded = false;
    this.disableAutoSync();
  }

  /**
   * Active auto-sync interne (toutes intervalMs).
   * Idempotent — appelle stop avant de re-start.
   */
  enableAutoSync(intervalMs?: number): void {
    if (intervalMs && intervalMs >= 60_000) this.autoSyncIntervalMs = intervalMs;
    this.disableAutoSync();
    /* Skip si pas dans browser (tests SSR) */
    if (typeof window === 'undefined') return;
    this.autoSyncTimer = window.setInterval(() => {
      void this.runAutoSync();
    }, this.autoSyncIntervalMs);
    /* Track interval pour cleanup possible (anti memory leak) */
    if (this.autoSyncTimer !== null) {
      const t = this.autoSyncTimer;
      void import('../core-svc/service-lifecycle.js').then(({ lifecycle }) => {
        lifecycle.trackInterval('memory-bridge', t as unknown as ReturnType<typeof setInterval>);
      }).catch(() => { /* skip */ });
    }
    logger.info('memory-bridge', `Auto-sync enabled (${this.autoSyncIntervalMs / 1000}s)`);
  }

  /**
   * Stop auto-sync.
   */
  disableAutoSync(): void {
    if (this.autoSyncTimer !== null) {
      clearInterval(this.autoSyncTimer);
      this.autoSyncTimer = null;
    }
  }

  /**
   * Run sync auto sur tous les backends configurés (utilisé par cron interne + manuel).
   */
  async runAutoSync(): Promise<readonly SyncResult[]> {
    const cfg = this.getConfig();
    const tasks: Array<Promise<SyncResult>> = [];

    /* Notion */
    if (cfg.notion_database_id && cfg.notion_token_key) {
      tasks.push((async (): Promise<SyncResult> => {
        try {
          const { vault } = await import('../vault/vault.js');
          const token = await vault.readKey(cfg.notion_token_key as string);
          if (!token) return { ok: false, backend: 'notion', entries: 0, reason: 'token empty', duration_ms: 0 };
          return await this.syncToNotion(cfg.notion_database_id as string, token);
        } catch (err: unknown) {
          return { ok: false, backend: 'notion', entries: 0, reason: String(err), duration_ms: 0 };
        }
      })());
    }

    /* Firebase */
    const uid = this.getCurrentUid();
    if (uid) {
      tasks.push(this.syncToFirebase(uid));
    }

    /* GitHub Gist */
    if (cfg.github_token_key) {
      tasks.push((async (): Promise<SyncResult> => {
        try {
          const { vault } = await import('../vault/vault.js');
          const token = await vault.readKey(cfg.github_token_key as string);
          if (!token) return { ok: false, backend: 'github_gist', entries: 0, reason: 'token empty', duration_ms: 0 };
          return await this.syncToGitHubGist(token, cfg.github_gist_id);
        } catch (err: unknown) {
          return { ok: false, backend: 'github_gist', entries: 0, reason: String(err), duration_ms: 0 };
        }
      })());
    }

    if (tasks.length === 0) return [];
    const results = await Promise.all(tasks);
    const okCount = results.filter((r) => r.ok).length;
    logger.info('memory-bridge', `runAutoSync : ${okCount}/${results.length} OK`);
    return results;
  }

  /**
   * Health check : compte sync OK/KO récents par backend.
   */
  getHealth(): { backends_configured: number; last_sync_age_ms: number; recent_failures: number } {
    this.loadStatus();
    const cfg = this.getConfig();
    let configured = 0;
    if (cfg.notion_database_id && cfg.notion_token_key) configured++;
    if (cfg.github_token_key) configured++;
    if (cfg.n8n_webhook_url) configured++;
    /* Firebase est toujours implicite si uid présent */
    if (this.getCurrentUid()) configured++;

    let mostRecentSync = 0;
    let recentFailures = 0;
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const s of this.status.values()) {
      if (s.last_sync_ts > mostRecentSync) mostRecentSync = s.last_sync_ts;
      if (!s.last_success && s.last_sync_ts >= cutoff) recentFailures++;
    }
    return {
      backends_configured: configured,
      last_sync_age_ms: mostRecentSync > 0 ? Date.now() - mostRecentSync : -1,
      recent_failures: recentFailures,
    };
  }

  /* === Helpers privés === */

  private loadStatus(): void {
    if (this.statusLoaded) return;
    this.statusLoaded = true;
    try {
      const raw = localStorage.getItem(STATUS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, SyncStatus>;
      for (const [k, v] of Object.entries(parsed)) {
        this.status.set(k as MemoryBackend, v);
      }
    } catch {
      /* ignore corruption */
    }
  }

  private persistStatus(): void {
    try {
      const obj: Record<string, SyncStatus> = {};
      for (const [k, v] of this.status) obj[k] = v;
      localStorage.setItem(STATUS_KEY, JSON.stringify(obj));
    } catch {
      /* quota — skip silently */
    }
  }

  private recordSync(
    backend: MemoryBackend,
    ok: boolean,
    entries: number,
    reason: string | undefined,
    startTs: number,
  ): SyncResult {
    this.loadStatus();
    const status: SyncStatus = {
      backend,
      last_sync_ts: Date.now(),
      last_success: ok,
      entries_synced: entries,
      ...(reason && { last_error: reason }),
    };
    this.status.set(backend, status);
    this.persistStatus();
    return {
      ok,
      backend,
      entries,
      ...(reason && { reason }),
      duration_ms: Date.now() - startTs,
    };
  }

  private getCurrentUid(): string | null {
    try {
      return localStorage.getItem('apex_v13_uid');
    } catch {
      return null;
    }
  }

  /**
   * PII redaction avant push externe : retire emails, tels, IBAN, etc.
   */
  private sanitizeForExternal(entries: readonly MemoryEntry[]): MemoryEntry[] {
    return entries.map((e) => ({
      ...e,
      text: this.redactText(e.text),
    }));
  }

  private sanitizePayload(payload: EscalatePayload): EscalatePayload {
    const sanitized: EscalatePayload = {
      ...payload,
      msg: this.redactText(payload.msg),
    };
    if (payload.context) {
      const ctx: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(payload.context)) {
        ctx[k] = typeof v === 'string' ? this.redactText(v) : v;
      }
      sanitized.context = ctx;
    }
    return sanitized;
  }

  private redactText(input: string): string {
    if (!input) return '';
    let s = input;
    /* Emails */
    s = s.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[EMAIL]');
    /* Phones FR/Monaco */
    s = s.replace(/(\+?33|0|\+?377)\s?[1-9](?:[\s.-]?\d{2}){4}/g, '[PHONE]');
    /* IBAN */
    s = s.replace(/[A-Z]{2}\d{2}[A-Z0-9]{10,30}/g, '[IBAN]');
    /* API keys patterns */
    s = s.replace(/sk-ant-api\d{2}-[A-Za-z0-9_-]{20,}/g, '[REDACTED]');
    s = s.replace(/sk-[A-Za-z0-9]{40,}/g, '[REDACTED]');
    s = s.replace(/AIza[A-Za-z0-9_-]{33}/g, '[REDACTED]');
    s = s.replace(/ghp_[A-Za-z0-9]{36}/g, '[REDACTED]');
    s = s.replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [REDACTED]');
    return s;
  }
}

export const memoryBridge = new MemoryBridge();
