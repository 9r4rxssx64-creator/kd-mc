/**
 * APEX v13 — Approval Broker (Kevin 2026-07-10 « faire l'impossible à ma place,
 * seulement avec mon autorisation »).
 *
 * Apex NE FAIT JAMAIS un acte sensible (connexion OAuth, paiement, signature,
 * KYC) sans le feu vert de Kevin. `requestApproval()` dépose une demande dans le
 * node PARTAGÉ `apex_approvals/<uid>/pending/<id>` (même DB que la PWA Coffre
 * d'autorisations `tools/approvals/`), notifie Kevin, puis attend sa décision
 * (Face ID côté PWA → `resolved/<id>`). Aucun contournement : le geste
 * d'autorisation reste celui de Kevin (SCA/PSD2, liveness KYC, consentement
 * eIDAS, consent OAuth) — l'outil rend ça 1-tap.
 *
 * Logique PURE + injection de dépendances (testable sans réseau). La DB partagée
 * est CMCteams (`cmcteams-c16ab`, la même que la PWA) — pas la DB Apex — donc les
 * deps par défaut font un appel REST direct (fail-open : si CSP/réseau bloque, la
 * demande n'est pas synchronisée et Apex retombe sur un refus prudent).
 */

export type ApprovalType = 'oauth' | 'cb' | 'signature' | 'kyc' | 'custom';

export interface ApprovalRequest {
  type: ApprovalType;
  title: string;
  detail?: string;
  payload?: unknown;
  requested_by?: string;
}

export interface ApprovalNode extends ApprovalRequest {
  ts: number;
}

export type ApprovalStatus = 'approved' | 'rejected' | 'timeout' | 'error';

export interface ApprovalOutcome {
  id: string;
  status: ApprovalStatus;
  proof?: string;
}

export interface ApprovalDeps {
  /** PUT une valeur (val=null → suppression) sur le node partagé. Retourne true si OK. */
  put(path: string, val: unknown): Promise<boolean>;
  /** GET le node résolu (ou null). */
  get(path: string): Promise<unknown>;
  /** Notifie Kevin (push iPhone) — best-effort. */
  notify(title: string, body: string): Promise<void>;
  now(): number;
  genId(): string;
  /** Attente entre deux sondages (ms). Injectable pour les tests. */
  sleep(ms: number): Promise<void>;
}

const VALID_TYPES: ReadonlySet<ApprovalType> = new Set(['oauth', 'cb', 'signature', 'kyc', 'custom']);
const UID = 'kdmc_admin';
const SHARED_DB = 'https://cmcteams-c16ab-default-rtdb.europe-west1.firebasedatabase.app';

/** Construit le node de demande (forme exacte attendue par la PWA). */
export function buildRequestNode(req: ApprovalRequest, now: number): ApprovalNode {
  return {
    type: VALID_TYPES.has(req.type) ? req.type : 'custom',
    title: String(req.title || 'Autorisation requise').slice(0, 160),
    ...(req.detail ? { detail: String(req.detail).slice(0, 500) } : {}),
    ...(req.payload !== undefined ? { payload: req.payload } : {}),
    requested_by: String(req.requested_by || 'apex').slice(0, 40),
    ts: now,
  };
}

/** Interprète le node `resolved/<id>` renvoyé par la PWA. null = pas encore décidé. */
export function interpretResolved(raw: unknown): { status: ApprovalStatus; proof?: string } | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { status?: unknown; proof?: unknown };
  if (r.status === 'approved' || r.status === 'rejected') {
    return { status: r.status, ...(typeof r.proof === 'string' ? { proof: r.proof } : {}) };
  }
  return null;
}

export interface RequestApprovalOptions {
  /** Délai max d'attente de la décision (ms). Défaut 5 min. */
  timeoutMs?: number;
  /** Intervalle de sondage (ms). Défaut 3 s. */
  pollMs?: number;
}

/**
 * Dépose une demande d'autorisation et attend la décision de Kevin.
 * Retourne `approved` (avec preuve WebAuthn) / `rejected` / `timeout` / `error`.
 * JAMAIS `approved` sans une décision explicite de Kevin côté PWA.
 */
export async function requestApproval(
  req: ApprovalRequest,
  deps: ApprovalDeps,
  opts: RequestApprovalOptions = {},
): Promise<ApprovalOutcome> {
  const timeoutMs = opts.timeoutMs ?? 5 * 60 * 1000;
  const pollMs = Math.max(500, opts.pollMs ?? 3000);
  const id = deps.genId();
  const base = `apex_approvals/${UID}`;
  const node = buildRequestNode(req, deps.now());

  const written = await deps.put(`${base}/pending/${id}`, node).catch(() => false);
  if (!written) return { id, status: 'error' };

  await deps.notify('🔐 Autorisation requise', `${node.title} — ouvre le Coffre pour valider (Face ID)`).catch(() => undefined);

  const deadline = deps.now() + timeoutMs;
  while (deps.now() < deadline) {
    await deps.sleep(pollMs);
    const raw = await deps.get(`${base}/resolved/${id}`).catch(() => null);
    const decided = interpretResolved(raw);
    if (decided) {
      /* nettoie le node résolu (best-effort) */
      await deps.put(`${base}/resolved/${id}`, null).catch(() => undefined);
      return { id, status: decided.status, ...(decided.proof ? { proof: decided.proof } : {}) };
    }
  }
  /* timeout : retire la demande en attente (Kevin n'a pas répondu à temps) */
  await deps.put(`${base}/pending/${id}`, null).catch(() => undefined);
  return { id, status: 'timeout' };
}

/** URL REST du node partagé (DB CMCteams, la même que la PWA). */
function sharedUrl(path: string): string {
  return `${SHARED_DB}/${path}.json`;
}

/**
 * Deps par défaut : REST direct sur la DB partagée + push Apex. Fail-open.
 * (La DB est CMCteams, pas Apex → appel REST dédié. Nécessite `connect-src`
 * cmcteams-c16ab côté CSP pour être effectif en prod ; sinon fail-open silencieux.)
 */
export function defaultApprovalDeps(): ApprovalDeps {
  return {
    async put(path, val) {
      try {
        const r = await fetch(sharedUrl(path), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(val),
        });
        return r.ok;
      } catch {
        return false;
      }
    },
    async get(path) {
      try {
        const r = await fetch(sharedUrl(path));
        return r.ok ? await r.json() : null;
      } catch {
        return null;
      }
    },
    async notify(title, body) {
      try {
        const mod = await import('../integrations/push-notifications.js');
        const push = (mod as {
          pushNotifications?: {
            sendServerPush?: (
              uids: readonly string[],
              p: { title: string; body: string; url?: string; tag?: string; urgent?: boolean },
            ) => Promise<unknown>;
          };
        }).pushNotifications;
        if (push?.sendServerPush) {
          await push.sendServerPush([UID], { title, body, url: APPROVALS_PWA_URL, tag: 'approval', urgent: true });
        }
      } catch {
        /* push best-effort */
      }
    },
    now: () => Date.now(),
    genId: () => `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    sleep: (ms) => new Promise((res) => setTimeout(res, ms)),
  };
}

/** URL publique de la PWA Coffre d'autorisations (où Kevin valide). */
export const APPROVALS_PWA_URL = 'https://cmcteams.kd-mc.com/tools/approvals/';
