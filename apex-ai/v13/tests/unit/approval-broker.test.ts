/**
 * APEX v13.4.357 — Approval Broker : Apex ne fait JAMAIS un acte sensible sans le
 * feu vert de Kevin. Tests PURS (DI, aucun réseau) : forme du node, interprétation
 * de la décision, cycle demande→sonde→résolution (approved/rejected/timeout/error),
 * et surtout : JAMAIS `approved` sans décision explicite.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  buildRequestNode,
  interpretResolved,
  requestApproval,
  type ApprovalDeps,
  type ApprovalRequest,
} from '../../services/approvals/approval-broker.js';

/** Deps de test : horloge + DB en mémoire pilotées, sleep instantané. */
function makeDeps(overrides: Partial<ApprovalDeps> = {}): { deps: ApprovalDeps; db: Record<string, unknown>; puts: string[]; notifs: string[] } {
  const db: Record<string, unknown> = {};
  const puts: string[] = [];
  const notifs: string[] = [];
  let t = 1_000_000;
  const deps: ApprovalDeps = {
    put: async (path, val) => { puts.push(path); if (val === null) delete db[path]; else db[path] = val; return true; },
    get: async (path) => db[path] ?? null,
    notify: async (title) => { notifs.push(title); },
    now: () => t,
    genId: () => 'req_fixed',
    sleep: async (ms) => { t += ms; }, /* avance l'horloge au lieu d'attendre */
    ...overrides,
  };
  return { deps, db, puts, notifs };
}

describe('approval-broker — buildRequestNode', () => {
  it('normalise le type inconnu en custom + borne les champs', () => {
    const n = buildRequestNode({ type: 'weird' as never, title: 'x'.repeat(300), detail: 'd', requested_by: 'apex' }, 42);
    expect(n.type).toBe('custom');
    expect(n.title.length).toBe(160);
    expect(n.ts).toBe(42);
    expect(n.requested_by).toBe('apex');
  });
  it('conserve un type valide + payload', () => {
    const n = buildRequestNode({ type: 'cb', title: 'Payer', payload: { amount: '12.90' } }, 7);
    expect(n.type).toBe('cb');
    expect(n.payload).toEqual({ amount: '12.90' });
    expect(n.requested_by).toBe('apex'); /* défaut */
  });
});

describe('approval-broker — interpretResolved', () => {
  it('null tant que pas décidé', () => {
    expect(interpretResolved(null)).toBeNull();
    expect(interpretResolved({})).toBeNull();
    expect(interpretResolved({ status: 'pending' })).toBeNull();
  });
  it('approved/rejected + preuve', () => {
    expect(interpretResolved({ status: 'approved', proof: 'wa:abc' })).toEqual({ status: 'approved', proof: 'wa:abc' });
    expect(interpretResolved({ status: 'rejected' })).toEqual({ status: 'rejected' });
  });
});

describe('approval-broker — requestApproval (cycle complet, DI)', () => {
  it('dépose la demande + notifie Kevin', async () => {
    const { deps, db, notifs } = makeDeps();
    /* Kevin approuve immédiatement (résolu présent au 1er sondage) */
    db['apex_approvals/kdmc_admin/resolved/req_fixed'] = { status: 'approved', proof: 'wa:xyz' };
    const req: ApprovalRequest = { type: 'oauth', title: 'Connexion Google' };
    const out = await requestApproval(req, deps, { pollMs: 500, timeoutMs: 10_000 });
    expect(out.status).toBe('approved');
    expect(out.proof).toBe('wa:xyz');
    expect(notifs.length).toBe(1); /* Kevin notifié */
  });

  it('JAMAIS approved sans décision : timeout si Kevin ne répond pas', async () => {
    const { deps } = makeDeps();
    const out = await requestApproval({ type: 'cb', title: 'Payer' }, deps, { pollMs: 1000, timeoutMs: 3000 });
    expect(out.status).toBe('timeout');
    expect(out.proof).toBeUndefined();
  });

  it('refus explicite → rejected', async () => {
    const { deps, db } = makeDeps();
    db['apex_approvals/kdmc_admin/resolved/req_fixed'] = { status: 'rejected' };
    const out = await requestApproval({ type: 'signature', title: 'Signer NDA' }, deps, { pollMs: 500, timeoutMs: 5000 });
    expect(out.status).toBe('rejected');
  });

  it('échec d\'écriture (réseau/CSP) → error, pas de fausse approbation', async () => {
    const { deps } = makeDeps({ put: async () => false });
    const out = await requestApproval({ type: 'kyc', title: 'Vérif' }, deps);
    expect(out.status).toBe('error');
  });

  it('retire la demande en attente au timeout', async () => {
    const { deps, puts } = makeDeps();
    await requestApproval({ type: 'custom', title: 'x' }, deps, { pollMs: 1000, timeoutMs: 2000 });
    /* un PUT null sur pending/<id> a été émis pour nettoyer */
    expect(puts).toContain('apex_approvals/kdmc_admin/pending/req_fixed');
    expect(puts.filter((p) => p === 'apex_approvals/kdmc_admin/pending/req_fixed').length).toBe(2); /* create + cleanup */
  });

  it('décision arrivant après quelques sondages', async () => {
    const { deps, db } = makeDeps();
    let polls = 0;
    const base = deps.get.bind(deps);
    deps.get = async (path) => {
      if (path.includes('/resolved/')) {
        polls++;
        if (polls >= 3) db['apex_approvals/kdmc_admin/resolved/req_fixed'] = { status: 'approved', proof: 'wa:late' };
      }
      return base(path);
    };
    const out = await requestApproval({ type: 'oauth', title: 'X' }, deps, { pollMs: 1000, timeoutMs: 60_000 });
    expect(out.status).toBe('approved');
    expect(out.proof).toBe('wa:late');
  });
});
