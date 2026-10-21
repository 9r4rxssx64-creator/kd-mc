// @vitest-environment node
/**
 * « Rémi s'est inscrit, il m'a envoyé un message, je ne reçois rien » (Kevin 21.10.2026). MESURÉ en base : Kevin avait DEUX comptes Apex Chat — l'ancien `kdmc_admin` (23 messages,
 * la conversation avec Laurence, l'adresse que tout le monde vise) et un NOUVEAU `kdmc_kdmc_admin` créé par la connexion du domaine (0 conversation). Rémi a écrit à l'ancien ;
 * Kevin, connecté sur le nouveau, ne voyait rien. Vrai SQLite aux vraies migrations, vrai worker, domaine simulé.
 *   1. Kevin (domaine admin + Face ID) est rattaché à `kdmc_admin` : jeton `sub=kdmc_admin`, le doublon est fondu (conversations, messages, push, clé de l'appareil vivant) ;
 *   2. la conversation de Rémi (adressée à `kdmc_admin`) devient la sienne : elle apparaît dans SES conversations ;
 *   3. la 2e connexion ne recrée rien (idempotent) ;
 *   4. SANS la double preuve (domaine non admin, ou pas de Face ID) : rien n'est fondu, aucun pouvoir donné (garde audit2-p0) ;
 *   5. une personne qui s'inscrit : journal + notification à Kevin (une seule, pas deux).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from '../../workers/api-worker.js';
import { ENV, makeRequest } from './api-worker-helpers.js';
import { d1Reel } from './_support/d1-sqlite.js';

const CTX = { waitUntil() {} };
const CLE_VIVANTE = 'eyJjcnYiOiJQLTI1NiIsImV4dCI6dHJ1ZSwia2V5X29wcyI6W10sImt0eSI6IkVDIiwieCI6IjZGWVFLNTJEZ2IweXFQNU9Cc25vOERyNEx4LW5PdzltRFBzT2tidGhfQzgiLCJ5IjoiSmtQUmpnUlU5QnFMNGJNYmE0LU5HX2pleGdoSFhMMDY3dXpTZnFsaGNOMCJ9';
const domaine = (who) => { globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true, ...who }))); };
const sso = (env) => worker.fetch(makeRequest({ method: 'POST', path: '/api/auth/sso-from-kdmc', body: { kdmc_token: 'jeton' } }), env, CTX);
const KEVIN = { uid: 'kdmc_admin', name: 'kevin Desarzens', verified: true, code: false, admin: true };

/** La base de production du 21.10 : ancien Kevin + doublon du domaine + Rémi qui lui a écrit. */
function baseDuMatin() {
  const DB = d1Reel(); const r = DB.raw;
  r.prepare("UPDATE users SET kdmc_uid=NULL, identity_key_pub='CLE_ANCIENNE_PERDUE' WHERE id='kdmc_admin'").run();
  r.prepare(`INSERT INTO users (id, pseudo, real_name, phone, phone_hash, is_admin, is_kevin_alias, identity_key_pub, pq_key_pub, prekey_signed, apex_uid, source, created_at, status, kdmc_uid, last_seen, crypto_caps)
             VALUES ('kdmc_kdmc_admin','kevindesarzen_iznxii','kevin Desarzens','PENDING_SSO_kdmc_kdmc_admin','PENDING_SSO_kdmc_kdmc_admin',1,1,?,'PENDING_PQXDH','PENDING_PQXDH','kdmc_kdmc_admin','kdmc-sso',1,'active','kdmc_admin',5,'media,grp1')`).run(CLE_VIVANTE);
  r.prepare(`INSERT INTO users (id, pseudo, real_name, phone, phone_hash, is_admin, is_kevin_alias, identity_key_pub, pq_key_pub, prekey_signed, apex_uid, source, created_at, status, kdmc_uid)
             VALUES ('kdmc_remy-ledren','remy','Remy Ledren','PENDING_SSO_kdmc_remy-ledren','PENDING_SSO_kdmc_remy-ledren',0,0,'x','PENDING_PQXDH','PENDING_PQXDH','kdmc_remy-ledren','kdmc-sso',2,'active','remy-ledren')`).run();
  r.prepare("INSERT INTO conversations (id, type, created_by, created_at, sharded_to_do, member_count, last_msg_ts, e2e_version) VALUES ('conv-remy','dm','kdmc_remy-ledren',3,'do_x',2,3,1)").run();
  r.prepare("INSERT INTO conversation_members (conv_id, user_id, role, joined_at) VALUES ('conv-remy','kdmc_remy-ledren','owner',3)").run();
  r.prepare("INSERT INTO conversation_members (conv_id, user_id, role, joined_at) VALUES ('conv-remy','kdmc_admin','member',3)").run();
  r.prepare("INSERT INTO conversations (id, type, created_by, created_at, sharded_to_do, member_count, last_msg_ts, e2e_version) VALUES ('conv-defaut','group','kdmc_kdmc_admin',4,'do_y',1,4,1)").run();
  r.prepare("INSERT INTO conversation_members (conv_id, user_id, role, joined_at) VALUES ('conv-defaut','kdmc_kdmc_admin','owner',4)").run();
  r.prepare("INSERT INTO push_subscriptions (user_id, device_id, endpoint, vapid_p256dh, vapid_auth, last_seen, created_at) VALUES ('kdmc_kdmc_admin','iphone','https://push.exemple/kevin','p','a',?,?)").run(Date.now(), Date.now());
  return DB;
}
const ligne = (DB, id) => DB.raw.prepare('SELECT * FROM users WHERE id=?').get(id);
const membres = (DB, conv) => DB.raw.prepare('SELECT user_id FROM conversation_members WHERE conv_id=? ORDER BY user_id').all(conv).map((x) => x.user_id);
beforeEach(() => { vi.restoreAllMocks(); });

describe('Kevin n\'a qu\'UN compte Apex Chat', () => {
  it('1+2. domaine admin + Face ID : rattaché à kdmc_admin, doublon fondu, la conversation de Rémi devient la sienne', async () => {
    const DB = baseDuMatin(); domaine(KEVIN);
    const r = await sso(ENV({ APEX_CHAT_DB: DB }));
    const j = await r.json();
    expect(r.status).toBe(200);
    expect(j.user.id).toBe('kdmc_admin');
    expect(JSON.parse(atob(j.token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub).toBe('kdmc_admin');
    const dup = ligne(DB, 'kdmc_kdmc_admin');
    expect(dup.status).toBe('deleted'); expect(dup.merged_into).toBe('kdmc_admin'); expect(dup.kdmc_uid).toBeNull();
    expect(ligne(DB, 'kdmc_admin').kdmc_uid).toBe('kdmc_admin');
    expect(ligne(DB, 'kdmc_admin').identity_key_pub).toBe(CLE_VIVANTE);               // la clé de l'appareil de Kevin, pas l'ancienne perdue
    expect(membres(DB, 'conv-remy')).toEqual(['kdmc_admin', 'kdmc_remy-ledren']);       // Rémi écrit toujours à Kevin
    expect(membres(DB, 'conv-defaut')).toEqual(['kdmc_admin']);                         // ce que le doublon avait est revenu
    expect(DB.raw.prepare("SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id='kdmc_admin'").get().n).toBe(1);   // son iPhone reçoit les notifications
    const conv = await worker.fetch(makeRequest({ path: '/api/conversations', token: j.token }), ENV({ APEX_CHAT_DB: DB }), CTX);
    expect(JSON.stringify(await conv.json())).toContain('conv-remy');
  });

  it('3. la 2e connexion ne recrée aucun compte', async () => {
    const DB = baseDuMatin(); domaine(KEVIN); const env = ENV({ APEX_CHAT_DB: DB });
    await sso(env);
    const avant = DB.raw.prepare('SELECT COUNT(*) AS n FROM users').get().n;
    const r2 = await sso(env);
    expect((await r2.json()).user.id).toBe('kdmc_admin');
    expect(DB.raw.prepare('SELECT COUNT(*) AS n FROM users').get().n).toBe(avant);
  });

  it('4. sans la double preuve, rien n\'est fondu et aucun pouvoir n\'est donné', async () => {
    for (const who of [{ ...KEVIN, admin: false }, { ...KEVIN, verified: false, code: true, admin: false }, { ...KEVIN, verified: false, code: true }]) {   // dernier cas : « admin » sans Face ID → refusé plus haut
      const DB = baseDuMatin(); domaine(who);
      const r = await sso(ENV({ APEX_CHAT_DB: DB }));
      expect((await r.json()).user?.id).not.toBe('kdmc_admin');   // (401 sans utilisateur, ou compte neuf non admin)
      expect(ligne(DB, 'kdmc_kdmc_admin').status).toBe('active');
      expect(ligne(DB, 'kdmc_admin').identity_key_pub).toBe('CLE_ANCIENNE_PERDUE');
    }
  });
});

describe('une inscription prévient Kevin', () => {
  it('5. une personne neuve du domaine : journal + UNE notification à Kevin (pas deux)', async () => {
    const DB = baseDuMatin();
    DB.raw.prepare("INSERT INTO push_subscriptions (user_id, device_id, endpoint, vapid_p256dh, vapid_auth, last_seen, created_at) VALUES ('kdmc_admin','tel','https://push.exemple/k2','p','a',?,?)").run(Date.now(), Date.now());
    const pushs = []; const PUSH_WORKER = { fetch: vi.fn(async (_u, init) => { pushs.push(JSON.parse(init.body).payload); return new Response('{}', { status: 200 }); }) };
    domaine({ uid: 'yann-neuf', name: 'Yann Neuf', verified: false, code: true, admin: false });
    const r = await sso(ENV({ APEX_CHAT_DB: DB, PUSH_WORKER }));
    expect(r.status).toBe(200);
    expect(pushs.map((p) => p.title)).toEqual(['🆕 Nouvelle inscription Apex Chat']);
    expect(pushs[0].body).toContain('Yann Neuf');
    expect(DB.raw.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action='inscription_apex_kdmc'").get().n).toBe(1);
    // 2e entrée de la même personne : plus de « nouvelle inscription »
    pushs.length = 0; await sso(ENV({ APEX_CHAT_DB: DB, PUSH_WORKER }));
    expect(pushs.filter((p) => /inscription/i.test(p.title))).toEqual([]);
  });

  it('5b. un compte de TEST de nos robots : au journal, mais Kevin n\'est pas dérangé', async () => {
    const DB = baseDuMatin();
    DB.raw.prepare("INSERT INTO push_subscriptions (user_id, device_id, endpoint, vapid_p256dh, vapid_auth, last_seen, created_at) VALUES ('kdmc_admin','tel','https://push.exemple/k2','p','a',?,?)").run(Date.now(), Date.now());
    const PUSH_WORKER = { fetch: vi.fn(async () => new Response('{}', { status: 200 })) };
    domaine({ uid: 'temps-reela-abc', name: 'Temps ReelA abc', verified: false, code: true, admin: false });
    await sso(ENV({ APEX_CHAT_DB: DB, PUSH_WORKER }));
    expect(PUSH_WORKER.fetch).not.toHaveBeenCalled();
    expect(DB.raw.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action='inscription_apex_kdmc'").get().n).toBe(1);
  });
});
