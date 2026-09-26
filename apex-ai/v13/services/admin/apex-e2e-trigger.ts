/**
 * v13.4.87 — Apex E2E iOS Simulator (Playwright WebKit iPhone 14 Pro) trigger.
 *
 * Permet à Apex IA de déclencher des tests E2E réels iPhone Safari WebKit
 * via GitHub Actions cloud (event_type 'apex_e2e_request' → workflow
 * apex-v13-e2e.yml). Résultat reporté via Firebase + audit log.
 *
 * Use case Kevin "Apex utilise iOS Simulator pour vérif réelle" :
 * - Apex IA peut auto-tester après chaque release
 * - Smoke + cold boot + admin reconnu + coffre + dashboard
 * - Tests tournent sur ubuntu-latest + WebKit (moteur Safari iOS)
 * - Permission admin only (Kevin règle "scrupuleusement identique" v13.4.83)
 */
import { logger } from '../../core/logger.js';
import { auth } from '../auth/auth.js';
import { firebase } from '../storage/firebase.js';
import { vault } from '../vault/vault.js';

const REPO = '9r4rxssx64-creator/CMCteams';
const EVENT_TYPE = 'apex_e2e_request';

export type E2EProject = 'mobile-safari' | 'mobile-chrome' | 'all';

export interface TriggerResult {
  ok: boolean;
  runId?: string;
  error?: string;
  project: E2EProject;
  ts: number;
  /** Loggué dans Firebase pour suivi. */
  trace_id?: string;
}

/**
 * Déclenche un test E2E Playwright WebKit (iPhone 14 Pro device descriptor).
 *
 * Permission tier-aware : admin Kevin uniquement.
 *
 * @param opts.project mobile-safari (défaut, iOS) | mobile-chrome (Android) | all
 */
export async function triggerE2EWebkit(
  opts: { project?: E2EProject } = {},
): Promise<TriggerResult> {
  const project = opts.project ?? 'mobile-safari';
  const ts = Date.now();
  /* Permission guard tier-aware (CLAUDE.md règle ABSOLUE intelligent par tier) */
  if (!auth.isAdminSync()) {
    logger.warn('apex-e2e-trigger', 'refusé : non-admin');
    return { ok: false, error: 'admin_only_e2e_trigger', project, ts };
  }
  /* Récupère GitHub PAT du coffre (v13.4.93 fix: vault.readKey API correcte) */
  let token = '';
  try {
    token = await vault.readKey('ax_github_token');
  } catch {
    token = '';
  }
  if (!token || token.length < 10) {
    return {
      ok: false,
      error: 'github_token_missing_in_vault',
      project,
      ts,
    };
  }
  const tokenResult = { ok: true as const, value: token };
  const traceId = `e2e_${ts}_${Math.random().toString(36).slice(2, 8)}`;
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/dispatches`, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `token ${tokenResult.value}`,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        event_type: EVENT_TYPE,
        client_payload: {
          project,
          requested_by: 'apex_ia',
          trace_id: traceId,
          ts,
        },
      }),
    });
    if (r.status === 204) {
      logger.info('apex-e2e-trigger', `dispatched ${project}`, { trace_id: traceId });
      /* Log dans Firebase pour suivi */
      void firebase
        .write(`ax_apex_e2e_requests/${traceId}`, {
          project,
          ts,
          status: 'dispatched',
          trace_id: traceId,
          requested_by: 'apex_ia',
        })
        .catch(() => false);
      return { ok: true, project, ts, trace_id: traceId };
    }
    return {
      ok: false,
      error: `dispatch_failed_http_${r.status}`,
      project,
      ts,
      trace_id: traceId,
    };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.warn('apex-e2e-trigger', 'fetch failed', { error: errMsg });
    return { ok: false, error: errMsg, project, ts, trace_id: traceId };
  }
}

/**
 * Lit l'historique des requêtes E2E récentes (admin only via Firebase).
 */
export async function listE2ERequests(): Promise<readonly unknown[]> {
  if (!auth.isAdminSync()) return [];
  try {
    const data = await firebase.read<Record<string, unknown> | null>('ax_apex_e2e_requests');
    if (!data || typeof data !== 'object') return [];
    return Object.values(data);
  } catch {
    return [];
  }
}

/**
 * Lit le dernier résultat E2E (publié par workflow GitHub Actions
 * via `firebase write ax_apex_e2e_results/<trace_id>`).
 */
export async function getLastE2EResult(): Promise<{
  found: boolean;
  result?: unknown;
}> {
  try {
    const data = await firebase.read<Record<string, { ts?: number }> | null>('ax_apex_e2e_results');
    if (!data || typeof data !== 'object') return { found: false };
    const sorted = Object.values(data).sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0));
    if (sorted.length === 0) return { found: false };
    return { found: true, result: sorted[0] };
  } catch {
    return { found: false };
  }
}

/* Constantes exportées pour tests régression. */
export const _internals = {
  REPO,
  EVENT_TYPE,
};
