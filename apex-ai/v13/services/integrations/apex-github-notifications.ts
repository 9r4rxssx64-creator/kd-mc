/**
 * v13.4.203 — Apex GitHub Notifications cleaner (Kevin 2026-05-16 absolu).
 *
 * Kevin : "Apex doit avoir accès à GitHub et le faire pour moi"
 *
 * GitHub n'expose PAS d'API pour modifier la préférence "Email pour Actions"
 * au niveau user (c'est un toggle Settings UI non accessible via REST).
 *
 * Stratégie alternative : Apex auto-clear l'inbox notifications GitHub
 * régulièrement → Kevin ne voit plus les notifs Actions dans sa boîte.
 *
 * APIs utilisées (avec scope notifications/repo du PAT ax_github_token) :
 *  - GET  /notifications?all=false → liste notifs unread
 *  - PUT  /notifications → mark all as read (last_read_at=now)
 *  - PUT  /notifications/threads/{id} → mark 1 thread as read
 *  - DELETE /notifications/threads/{id}/subscription → unsubscribe thread
 *  - PUT  /repos/{owner}/{repo}/subscription {ignored:true} → mute repo
 *
 * Sécurité :
 *  - Admin only (Kevin uniquement)
 *  - Read token from vault (jamais en clair logs)
 *  - Logs sans token, juste compteurs
 */
import { logger } from '../../core/logger.js';
import { auth } from '../auth/auth.js';
import { vault } from '../vault/vault.js';

const GITHUB_API = 'https://api.github.com';
const REPO_OWNER = '9r4rxssx64-creator';
const REPO_NAME = 'cmcteams';

export interface CleanResult {
  ok: boolean;
  notifications_before?: number;
  notifications_cleared?: number;
  actions_threads_unsubscribed?: number;
  error?: string;
}

class ApexGithubNotifications {
  private async getToken(): Promise<string | null> {
    try {
      const t = await vault.readKey('ax_github_token');
      return t || null;
    } catch {
      return null;
    }
  }

  private async fetchJson(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data?: unknown; error?: string }> {
    const token = await this.getToken();
    if (!token) return { ok: false, status: 0, error: 'no_github_token_in_vault' };
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (init?.body) headers['Content-Type'] = 'application/json';
    try {
      const res = await fetch(`${GITHUB_API}${path}`, { ...init, headers });
      const ct = res.headers.get('content-type') ?? '';
      let data: unknown = null;
      if (ct.includes('application/json')) {
        try { data = await res.json(); } catch { /* ignore */ }
      }
      return { ok: res.ok, status: res.status, data: data ?? undefined };
    } catch (err) {
      return { ok: false, status: 0, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Liste les notifications GitHub non lues (max 50).
   * Retourne compteur + thread_ids des Actions workflows pour cleanup ciblé.
   */
  async listUnread(): Promise<{ ok: boolean; total: number; actions_thread_ids: string[]; error?: string }> {
    if (!auth.isAdminSync()) return { ok: false, total: 0, actions_thread_ids: [], error: 'admin_only' };
    const r = await this.fetchJson('/notifications?all=false&per_page=50');
    if (!r.ok) return { ok: false, total: 0, actions_thread_ids: [], error: `http_${r.status}` };
    const items = Array.isArray(r.data) ? (r.data as Array<{ id: string; subject?: { title?: string; type?: string } }>) : [];
    const actionsIds = items
      .filter((n) => {
        const title = String(n.subject?.title ?? '').toLowerCase();
        const type = String(n.subject?.type ?? '').toLowerCase();
        return type === 'checksuite' || type === 'workflowrun' || title.includes('workflow') || title.includes('ci');
      })
      .map((n) => String(n.id));
    return { ok: true, total: items.length, actions_thread_ids: actionsIds };
  }

  /**
   * Mark all notifications as read (clear inbox).
   * Endpoint : PUT /notifications avec last_read_at=now.
   */
  async markAllRead(): Promise<{ ok: boolean; status: number; error?: string }> {
    if (!auth.isAdminSync()) return { ok: false, status: 0, error: 'admin_only' };
    const r = await this.fetchJson('/notifications', {
      method: 'PUT',
      body: JSON.stringify({ last_read_at: new Date().toISOString(), read: true }),
    });
    const out: { ok: boolean; status: number; error?: string } = { ok: r.ok, status: r.status };
    if (r.error) out.error = r.error;
    return out;
  }

  /**
   * Unsubscribe d'un thread spécifique (workflow_run par exemple).
   * Endpoint : DELETE /notifications/threads/{id}/subscription.
   */
  async unsubscribeThread(threadId: string): Promise<{ ok: boolean; status: number }> {
    if (!auth.isAdminSync()) return { ok: false, status: 0 };
    const r = await this.fetchJson(`/notifications/threads/${threadId}/subscription`, { method: 'DELETE' });
    return { ok: r.ok, status: r.status };
  }

  /**
   * Mute complètement le repo cmcteams (subscribed:false, ignored:true).
   * Endpoint : PUT /repos/{owner}/{repo}/subscription.
   * ATTENTION : ça mute TOUTES les notifs (Actions, issues, PRs, releases).
   */
  async muteRepo(): Promise<{ ok: boolean; status: number; error?: string }> {
    if (!auth.isAdminSync()) return { ok: false, status: 0, error: 'admin_only' };
    const r = await this.fetchJson(`/repos/${REPO_OWNER}/${REPO_NAME}/subscription`, {
      method: 'PUT',
      body: JSON.stringify({ subscribed: false, ignored: true }),
    });
    const out: { ok: boolean; status: number; error?: string } = { ok: r.ok, status: r.status };
    if (r.error) out.error = r.error;
    return out;
  }

  /**
   * v13.4.203 fonction principale Kevin "Apex fais-le pour moi" :
   * 1. Liste les notifs unread
   * 2. Unsubscribe chaque thread Actions/workflow (pour ne plus en recevoir)
   * 3. Mark all as read (clear inbox)
   * 4. Retourne compteurs propres pour toast user
   */
  async cleanActionsNotifications(): Promise<CleanResult> {
    if (!auth.isAdminSync()) return { ok: false, error: 'admin_only' };
    const list = await this.listUnread();
    if (!list.ok) return { ok: false, error: list.error ?? 'list_failed' };

    let unsubCount = 0;
    for (const threadId of list.actions_thread_ids) {
      const u = await this.unsubscribeThread(threadId);
      if (u.ok) unsubCount++;
    }

    const mark = await this.markAllRead();
    logger.info('apex-github-notifications', 'clean done', {
      total_before: list.total,
      actions_unsubscribed: unsubCount,
      mark_all_status: mark.status,
    });

    const out: CleanResult = {
      ok: mark.ok,
      notifications_before: list.total,
      notifications_cleared: mark.ok ? list.total : 0,
      actions_threads_unsubscribed: unsubCount,
    };
    if (!mark.ok) out.error = `mark_all_http_${mark.status}`;
    return out;
  }
}

export const apexGithubNotifications = new ApexGithubNotifications();
