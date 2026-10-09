// @vitest-environment node
/**
 * Revue 08.10.2026 — A1 (P0) : n'importe quel utilisateur connecté pouvait
 * pré-créer un compte pour n'importe quel numéro, recevoir le lien magique,
 * l'ouvrir LUI-MÊME (session 30 j sans code) et devenir l'invité ; quand le vrai
 * propriétaire s'inscrivait ensuite par SMS, la session de l'inviteur restait.
 *
 * Correctif prouvé ici, sur le VRAI schéma (node:sqlite + migrations) :
 *   1. l'inviteur ne reçoit plus le lien magique ; le code court ne le donne pas ;
 *      un jeton magique signé pour une invitation d'utilisateur n'ouvre pas de session ;
 *   2. à la première connexion SMS du propriétaire, toute session antérieure du
 *      compte invité est refusée (last_force_logout_at), la nouvelle vaut ;
 *   3. la réclamation ne se fait qu'une fois (claimed_at).
 * Sabotage : retirer _claimInvitedAccount (2) ou remettre magic_url (1) → rouge.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker, { sha256, _claimInvitedAccount } from '../../workers/api-worker.js';
import { ENV, makeJWT, makeRequest } from './api-worker-helpers.js';
import { d1Reel } from './_support/d1-sqlite.js';

beforeEach(() => { vi.restoreAllMocks(); globalThis.fetch = vi.fn(async () => new Response('{}')); });

const CTX = { waitUntil() {} };
const INVITEUR = 'u_dupont';
const TEL_INVITE = '+33611112222';   // fixture synthétique listée (no-admin-phone-in-page)

function seed(db, id, pseudo, phone) {
  db.raw.prepare(`INSERT INTO users (id,pseudo,real_name,phone,phone_hash,created_at,last_seen,identity_key_pub,pq_key_pub,prekey_signed,status)
    VALUES (?,?,?,?,?,1,1,'k','k','k','active')`).run(id, pseudo, 'Nom ' + pseudo, phone, 'h_' + id);
}

async function monde() {
  const DB = d1Reel();
  seed(DB, INVITEUR, 'dupontj', '+33633333333');
  const env = ENV({ APEX_CHAT_DB: DB, APEX_CHAT_BASE_URL: 'https://chat.exemple/' });
  const tokInviteur = await makeJWT({ sub: INVITEUR, pseudo: 'dupontj', iat: Math.floor(Date.now() / 1000) - 5 });
  const r = await worker.fetch(makeRequest({ method: 'POST', path: '/api/invitations', body: { phone: TEL_INVITE, name: 'MARTIN P', sent_via: 'test' }, token: tokInviteur }), env, CTX);
  const inv = await r.json();
  expect(r.status, JSON.stringify(inv)).toBe(200);
  return { DB, env, inv, tokInviteur };
}

const me = (env, tok) => worker.fetch(makeRequest({ path: '/api/users/me', token: tok }), env, CTX);

describe('A1 — invitation d\'utilisateur : plus de session sans code pour l\'inviteur', () => {
  it('1. pas de magic_url ; code court sans jeton magique ; jeton magique utilisateur → 403', async () => {
    const { DB, env, inv } = await monde();
    expect(inv.magic_url).toBeUndefined();
    expect(inv.sms_template).not.toMatch(/invite=|magic=/);
    expect(inv.invite_url).toBe('https://chat.exemple/?i=' + inv.code);
    const invite = DB.raw.prepare('SELECT source, status FROM users WHERE id=?').get(inv.invited_user_id);
    expect(invite.source).toBe('user-invitation');

    // Le code court (public) ne remet pas le jeton magique pour une invitation d'utilisateur.
    const res = await (await worker.fetch(makeRequest({ path: '/api/invitations/' + inv.code }), env, CTX)).json();
    expect(res.ok).toBe(true);
    expect(res.invitation.magic_token).toBeNull();
    expect(res.invitation.requires_otp).toBe(true);

    // Même avec le jeton magique en main (stocké en base), aucune session.
    const magic = DB.raw.prepare('SELECT magic_token FROM invitations WHERE code=?').get(inv.code).magic_token;
    expect(typeof magic).toBe('string');
    const r = await worker.fetch(makeRequest({ method: 'POST', path: '/api/auth/magic-login', body: { magic_token: magic } }), env, CTX);
    const j = await r.json();
    expect(r.status).toBe(403);
    expect(j.error).toBe('magic_requires_otp');
    expect(j.jwt).toBeUndefined();
  });

  it('2. première connexion SMS du propriétaire → la session antérieure tombe, la nouvelle vaut', async () => {
    const { DB, env, inv } = await monde();
    const invite = inv.invited_user_id;
    // Session « d'avant » sur le compte invité (ce qu'une ouverture du lien magique donnait).
    const ancienne = await makeJWT({ sub: invite, iat: Math.floor(Date.now() / 1000) - 5 });
    expect((await me(env, ancienne)).status).toBe(200);

    // Le vrai propriétaire prouve son numéro (code SMS en attente, comme send-otp l'écrit).
    const now = Date.now();
    DB.raw.prepare('INSERT INTO otp_pending (phone_hash, otp_hash, attempts, created_at, expires_at) VALUES (?,?,0,?,?)')
      .run(await sha256(TEL_INVITE), await sha256('123456:' + TEL_INVITE), now, now + 300000);
    const r = await worker.fetch(makeRequest({ method: 'POST', path: '/api/auth/verify-otp',
      body: { phone: TEL_INVITE, name: 'MARTIN Pierre', pseudo: 'martinp', otp: '123456' } }), env, CTX);
    const j = await r.json();
    expect(r.status, JSON.stringify(j)).toBe(200);
    expect(j.user.id).toBe(invite);

    // L'ancienne session est refusée, la nouvelle est acceptée.
    expect((await me(env, ancienne)).status).toBe(401);
    expect((await me(env, j.token)).status).toBe(200);
    const u = DB.raw.prepare('SELECT claimed_at, last_force_logout_at FROM users WHERE id=?').get(invite);
    expect(u.claimed_at).toBeGreaterThan(0);
    expect(u.last_force_logout_at).toBe(u.claimed_at);
  });

  it('3. réclamation une seule fois : une 2e connexion SMS ne coupe pas la session obtenue à la 1re', async () => {
    const { DB, env, inv } = await monde();
    const otp = async () => {
      const now = Date.now();
      DB.raw.prepare('INSERT OR REPLACE INTO otp_pending (phone_hash, otp_hash, attempts, created_at, expires_at) VALUES (?,?,0,?,?)')
        .run(await sha256(TEL_INVITE), await sha256('123456:' + TEL_INVITE), now, now + 300000);
      const r = await worker.fetch(makeRequest({ method: 'POST', path: '/api/auth/verify-otp',
        body: { phone: TEL_INVITE, name: 'MARTIN Pierre', pseudo: 'martinp', otp: '123456' } }), env, CTX);
      const j = await r.json();
      expect(r.status, JSON.stringify(j)).toBe(200);
      return j.token;
    };
    const t1 = await otp();
    const claim1 = DB.raw.prepare('SELECT claimed_at FROM users WHERE id=?').get(inv.invited_user_id).claimed_at;
    const t2 = await otp();
    const claim2 = DB.raw.prepare('SELECT claimed_at FROM users WHERE id=?').get(inv.invited_user_id).claimed_at;
    expect(claim2).toBe(claim1);
    expect((await me(env, t1)).status).toBe(200);
    expect((await me(env, t2)).status).toBe(200);
  });

  it('4. colonne claimed_at absente (migration 0013 pas encore passée) → les anciennes sessions sont quand même coupées ; compte non invité → rien', async () => {
    const ecrits = [];
    const DB = { prepare(sql) { return { bind(...a) { this._a = a; return this; }, async run() {
      if (sql.includes('claimed_at')) throw new Error('no such column: claimed_at');
      if (sql.startsWith('UPDATE users')) ecrits.push([sql, this._a]);   // (le journal d'audit écrit aussi, hors sujet)
      return { success: true, meta: { changes: 1 } };
    } }; } };
    const env = ENV({ APEX_CHAT_DB: DB });
    const u = { id: 'u_inv', source: 'user-invitation' };
    const iat = await _claimInvitedAccount(env, u);
    expect(ecrits.map(([sql]) => sql)).toEqual(['UPDATE users SET last_force_logout_at=? WHERE id=?']);
    expect(ecrits[0][1]).toEqual([iat * 1000, 'u_inv']);
    expect(u.last_force_logout_at).toBe(iat * 1000);
    // Compte inscrit directement (jamais pré-créé par invitation) : aucune écriture.
    ecrits.length = 0;
    await _claimInvitedAccount(env, { id: 'u_direct', source: 'apex-chat-direct' });
    expect(ecrits).toEqual([]);
  });
});
