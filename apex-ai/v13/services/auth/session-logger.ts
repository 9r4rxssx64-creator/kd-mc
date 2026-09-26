/**
 * APEX v13 — Session Logger (logger de sessions cross-app).
 *
 * Demande Kevin 2026-05-04 : "Logger de sessions"
 *
 * Trace :
 * - Début session (login, device, location optionnelle)
 * - Actions admin (config, vault edit, sentinelles)
 * - Conversations IA (count messages, tokens, model)
 * - Erreurs runtime
 * - Fin session (logout, durée, summary auto)
 *
 * Stockage : localStorage `apex_v13_sessions` (max 100 sessions, FIFO)
 * Sync Firebase pour admin cross-device monitoring.
 */

import { logger } from '../../core/logger.js';

export interface SessionAction {
  ts: number;
  type: 'login' | 'logout' | 'navigate' | 'config' | 'vault' | 'chat' | 'error' | 'audit' | 'tool';
  details?: Record<string, unknown>;
}

export interface SessionRecord {
  id: string;
  uid: string;
  user_name: string;
  is_admin: boolean;
  device_id?: string;
  start_ts: number;
  end_ts?: number;
  duration_ms?: number;
  actions: SessionAction[];
  summary?: string;
  ip_country?: string;
}

const STORAGE_KEY = 'apex_v13_sessions';
const MAX_SESSIONS = 100;
const MAX_ACTIONS_PER_SESSION = 200;

class SessionLogger {
  private currentSession: SessionRecord | null = null;

  /**
   * Démarre une session (appelé par auth.login).
   */
  async startSession(uid: string, userName: string, isAdmin: boolean): Promise<string> {
    const id = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    let deviceId: string | undefined;
    try {
      const { deviceContext } = await import('../integrations/device-context.js');
      const fp = await deviceContext.getFingerprint();
      deviceId = fp.device_id;
    } catch { /* skip */ }
    this.currentSession = {
      id,
      uid,
      user_name: userName,
      is_admin: isAdmin,
      ...(deviceId && { device_id: deviceId }),
      start_ts: Date.now(),
      actions: [{ ts: Date.now(), type: 'login' }],
    };
    this.persist();
    this._pushAccess('connexion');
    logger.info('session-logger', `Session started ${id} (${userName})`);
    return id;
  }

  /* Journal unifié domaine « qui se connecte » (worker kdmc-access).
     Fail-open + PROD-ONLY (*.kd-mc.com) → totalement inerte en test/jsdom.
     Métadonnées seulement, throttlé 5 s/évènement. N'affecte jamais l'app. */
  private _accessSeen: Record<string, number> = {};
  private _pushAccess(event: string): void {
    try {
      if (typeof location === 'undefined' || !location.hostname || !/\.kd-mc\.com$/.test(location.hostname)) return;
      const s = this.currentSession;
      if (!s || !s.uid) return;
      const t = Date.now();
      if (this._accessSeen[event] && t - this._accessSeen[event] < 5000) return;
      this._accessSeen[event] = t;
      const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
      const dev = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Macintosh|Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'PC Windows' : /Linux/.test(ua) ? 'Linux' : 'Autre';
      void fetch('https://admin.kd-mc.com/log', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true, mode: 'cors',
        body: JSON.stringify({ app: 'apex', uid: s.uid, name: s.user_name, event, device: dev, tier: s.is_admin ? 'admin' : 'client' }),
      }).catch(() => { /* fail-open */ });
    } catch { /* fail-open */ }
  }

  /**
   * Log une action dans la session courante.
   */
  logAction(type: SessionAction['type'], details?: Record<string, unknown>): void {
    if (!this.currentSession) return;
    this.currentSession.actions.push({ ts: Date.now(), type, ...(details && { details }) });
    this._pushAccess(type);
    /* Cap actions par session */
    if (this.currentSession.actions.length > MAX_ACTIONS_PER_SESSION) {
      this.currentSession.actions = this.currentSession.actions.slice(-MAX_ACTIONS_PER_SESSION);
    }
    /* Persist async toutes les 5 actions */
    if (this.currentSession.actions.length % 5 === 0) {
      this.persist();
    }
  }

  /**
   * Termine la session courante (appelé par auth.logout).
   */
  endSession(): void {
    if (!this.currentSession) return;
    const end = Date.now();
    this.currentSession.end_ts = end;
    this.currentSession.duration_ms = end - this.currentSession.start_ts;
    this.currentSession.actions.push({ ts: end, type: 'logout' });
    this.currentSession.summary = this.buildSummary(this.currentSession);
    this.persist();
    logger.info('session-logger', `Session ended ${this.currentSession.id} (${Math.round((this.currentSession.duration_ms ?? 0) / 1000)}s)`);
    this.currentSession = null;
  }

  /**
   * List sessions (admin only via guard).
   */
  list(filters?: { uid?: string; sinceTs?: number; limit?: number }): SessionRecord[] {
    try {
      const all = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as SessionRecord[];
      let filtered = all;
      if (filters?.uid) filtered = filtered.filter((s) => s.uid === filters.uid);
      if (filters?.sinceTs) filtered = filtered.filter((s) => s.start_ts >= (filters.sinceTs ?? 0));
      filtered.sort((a, b) => b.start_ts - a.start_ts);
      if (filters?.limit) filtered = filtered.slice(0, filters.limit);
      return filtered;
    } catch {
      return [];
    }
  }

  /**
   * Stats aggregées (admin dashboard).
   */
  getStats(sinceTs?: number): {
    total_sessions: number;
    unique_users: number;
    avg_duration_min: number;
    total_actions: number;
    by_type: Record<string, number>;
  } {
    const sessions = this.list(sinceTs ? { sinceTs } : undefined);
    const uniqueUsers = new Set(sessions.map((s) => s.uid)).size;
    const totalDur = sessions.reduce((acc, s) => acc + (s.duration_ms ?? 0), 0);
    const totalActions = sessions.reduce((acc, s) => acc + s.actions.length, 0);
    const byType: Record<string, number> = {};
    for (const s of sessions) {
      for (const a of s.actions) byType[a.type] = (byType[a.type] ?? 0) + 1;
    }
    return {
      total_sessions: sessions.length,
      unique_users: uniqueUsers,
      avg_duration_min: sessions.length > 0 ? Math.round(totalDur / sessions.length / 60000) : 0,
      total_actions: totalActions,
      by_type: byType,
    };
  }

  /**
   * Format markdown human-readable d'une session.
   */
  formatSessionMarkdown(session: SessionRecord): string {
    const lines: string[] = [
      `# Session ${session.id}`,
      `**User**: ${session.user_name} (${session.is_admin ? 'admin' : 'user'})`,
      `**Started**: ${new Date(session.start_ts).toISOString()}`,
      `**Duration**: ${session.duration_ms ? Math.round(session.duration_ms / 1000) + 's' : 'in progress'}`,
      `**Actions**: ${session.actions.length}`,
      session.summary ? `\n${session.summary}` : '',
    ];
    return lines.filter(Boolean).join('\n');
  }

  /* === Helpers === */

  private buildSummary(session: SessionRecord): string {
    const byType: Record<string, number> = {};
    for (const a of session.actions) byType[a.type] = (byType[a.type] ?? 0) + 1;
    const parts: string[] = [];
    for (const [type, count] of Object.entries(byType)) {
      parts.push(`${count} ${type}`);
    }
    const dur = session.duration_ms ? Math.round(session.duration_ms / 60000) : 0;
    return `${dur}min, ${session.actions.length} actions (${parts.join(', ')})`;
  }

  private persist(): void {
    if (!this.currentSession) return;
    try {
      const all = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as SessionRecord[];
      const existing = all.findIndex((s) => s.id === this.currentSession?.id);
      if (existing >= 0) {
        all[existing] = this.currentSession;
      } else {
        all.push(this.currentSession);
      }
      /* Trim FIFO */
      if (all.length > MAX_SESSIONS) {
        all.sort((a, b) => b.start_ts - a.start_ts);
        all.length = MAX_SESSIONS;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch (err: unknown) {
      logger.warn('session-logger', 'persist failed', { err });
    }
  }
}

export const sessionLogger = new SessionLogger();
