// @vitest-environment node
/**
 * « Un seul compte possible par personne » (Kevin 21.10.2026). Vrai SQLite aux vraies migrations, vrai worker.
 *   1. la base refuse un 2e compte ACTIF pour le même uid du domaine (les comptes supprimés ne comptent pas) ;
 *   2. course à la première connexion (lecture périmée) : la base refuse le doublon, on reprend le compte existant — jamais un 500 ni un doublon ;
 *   3. un compte PRÉVU D'AVANCE (jamais ouvert) est REPRIS par la personne qui arrive avec le même nom complet, au lieu d'un 2e compte ;
 *   4. jamais de reprise : compte déjà utilisé, deux candidats de même nom (ambigu), nom d'un seul mot, compte admin.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from '../../workers/api-worker.js';
import { ENV, makeRequest } from './api-worker-helpers.js';
import { d1Reel } from './_support/d1-sqlite.js';

const CTX = { waitUntil() {} };
const domaine = (who) => { globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true, verified: false, code: true, admin: false, ...who }))); };
const sso = (env) => worker.fetch(makeRequest({ method: 'POST', path: '/api/auth/sso-from-kdmc', body: { kdmc_token: 'jeton' } }), env, CTX);
const nb = (DB, where = '1=1') => DB.raw.prepare(`SELECT COUNT(*) AS n FROM users WHERE ${where}`).get().n;
const prevu = (DB, id, nom, extra = '') => DB.raw.prepare(`INSERT INTO users (id, pseudo, real_name, phone, phone_hash, is_admin, identity_key_pub, pq_key_pub, prekey_signed, source, created_at, status ${extra ? ',' + extra.split('=')[0] : ''})
  VALUES (?, ?, ?, ?, ?, 0, 'PENDING', 'PENDING', 'PENDING', 'apex-sso', 1, 'active' ${extra ? ',' + extra.split('=')[1] : ''})`).run(id, id.slice(-8), nom, 'PENDING_' + id, 'PENDING_' + id);
beforeEach(() => { vi.restoreAllMocks(); });

describe('un seul compte par personne', () => {
  it('1. la base refuse un 2e compte actif pour le même uid du domaine ; un compte supprimé ne compte pas', () => {
    const DB = d1Reel();
    const ajouter = (id, statut) => DB.raw.prepare(`INSERT INTO users (id, pseudo, real_name, phone, phone_hash, identity_key_pub, pq_key_pub, prekey_signed, source, created_at, status, kdmc_uid)
      VALUES (?, ?, 'X', ?, ?, 'x', 'x', 'x', 'kdmc-sso', 1, ?, 'marie-dupont')`).run(id, id, 'P' + id, 'h' + id, statut);
    ajouter('a', 'active');
    expect(() => ajouter('b', 'active')).toThrow(/UNIQUE/);
    expect(() => ajouter('c', 'deleted')).not.toThrow();
  });

  it('2. course à la première connexion : la lecture rate le compte tout juste créé par l\'autre → la base refuse le doublon, on reprend le compte existant (pas de 500, pas de doublon)', async () => {
    const DB = d1Reel(); domaine({ uid: 'marie-dupont', name: 'Marie Dupont' });
    const env = ENV({ APEX_CHAT_DB: DB });
    const premiere = await (await sso(env)).json();                      // « l'autre » connexion a déjà créé le compte
    expect(nb(DB, "kdmc_uid='marie-dupont'")).toBe(1);
    // …mais la 2e connexion, elle, lit AVANT (lecture périmée) : la 1re recherche du compte ne le voit pas
    let rate = false; const prepare0 = DB.prepare.bind(DB);
    DB.prepare = (sql) => { if (!rate && /WHERE kdmc_uid=\? AND status != 'deleted'/.test(sql)) { rate = true; return { bind: () => ({ first: async () => null }) }; } return prepare0(sql); };
    const r = await sso(env);
    expect(r.status).toBe(200);
    expect((await r.json()).user.id).toBe(premiere.user.id);
    expect(nb(DB, "kdmc_uid='marie-dupont'")).toBe(1);
  });

  it('3. le VRAI compte prévu d\'avance (Sandrine Tardieu, posé par les migrations) est repris au lieu d\'un 2e compte', async () => {
    const DB = d1Reel();
    expect(DB.raw.prepare("SELECT last_seen, kdmc_uid FROM users WHERE id='user_tardieu_sandrine'").get()).toEqual({ last_seen: null, kdmc_uid: null });
    const avant = nb(DB);
    domaine({ uid: 'sandrine-tardieu', name: 'Sandrine Tardieu' });
    const r = await sso(ENV({ APEX_CHAT_DB: DB }));
    const j = await r.json();
    expect(r.status).toBe(200);
    expect(j.user.id).toBe('user_tardieu_sandrine');
    expect(nb(DB)).toBe(avant);                                         // aucun compte de plus
    expect(DB.raw.prepare("SELECT kdmc_uid FROM users WHERE id='user_tardieu_sandrine'").get().kdmc_uid).toBe('sandrine-tardieu');
    expect(j.user.is_admin).toBeFalsy();
    const j2 = await (await sso(ENV({ APEX_CHAT_DB: DB }))).json();      // 2e entrée : même compte
    expect(j2.user.id).toBe('user_tardieu_sandrine'); expect(nb(DB)).toBe(avant);
  });

  it('4. jamais de reprise : déjà utilisé, ambigu, un seul mot', async () => {
    for (const [prepare, nom] of [
      [(DB) => prevu(DB, 'user_a', 'Marcel FICTIF', 'last_seen=5'), 'Marcel Fictif'],                                         // déjà ouvert un jour
      [(DB) => { prevu(DB, 'user_a', 'Marcel FICTIF'); prevu(DB, 'user_b', 'Marcel Fictif'); }, 'Marcel Fictif'],           // deux candidats
      [(DB) => prevu(DB, 'user_a', 'Marcel'), 'Marcel'],                                                                     // un seul mot
    ]) {
      const DB = d1Reel(); prepare(DB);
      domaine({ uid: 'marcel-fictif', name: nom });
      const avant = nb(DB);
      const j = await (await sso(ENV({ APEX_CHAT_DB: DB }))).json();
      expect(j.user.id).toMatch(/^kdmc_marcel/);                         // compte neuf
      expect(nb(DB)).toBe(avant + 1);
      expect(DB.raw.prepare("SELECT COUNT(*) AS n FROM users WHERE id='user_a' AND kdmc_uid IS NOT NULL").get().n).toBe(0);
    }
  });
});
