// @vitest-environment node
/**
 * Annuaire (audit 16.10.2026, décision de Kevin « oui ») : sans conversation en commun, un profil ne montre ni nom réel,
 * ni bio, ni dernière connexion ; et un compte ne peut pas ouvrir plus de 30 nouvelles conversations par jour.
 * Prouvé sur le vrai schéma SQLite.
 */
import { describe, it, expect } from 'vitest';
import worker, { CONV_PAR_JOUR } from '../../workers/api-worker.js';
import { ENV, makeJWT, makeRequest } from './api-worker-helpers.js';
import { d1Reel } from './_support/d1-sqlite.js';

const CTX = { waitUntil() {} };
let n = 0;
function user(DB, id, o = {}) {
  n++;
  DB.raw.prepare(`INSERT INTO users (id,pseudo,real_name,first_name,last_name,bio,last_seen,phone,phone_hash,created_at,identity_key_pub,pq_key_pub,prekey_signed,status,is_admin)
    VALUES (?,?,?,?,?,?,?,?,?,1,'k','k','k','active',?)`).run(id, 'p_' + id, o.real || 'Nom Réel ' + id, 'Prénom', 'Nom', 'ma bio', 123456, '+3360000' + String(1000 + n), 'h_' + id, o.admin ? 1 : 0);
}
const tok = (sub) => makeJWT({ sub, iat: Math.floor(Date.now() / 1000) - 5 });
const profil = async (env, sub, cible) => worker.fetch(makeRequest({ path: '/api/users/' + cible, token: await tok(sub) }), env, CTX);
const creer = async (env, sub, body) => worker.fetch(makeRequest({ method: 'POST', path: '/api/conversations', body, token: await tok(sub) }), env, CTX);

describe('profil public : le minimum pour entrer en contact', () => {
  it('un inconnu ne voit ni le nom réel, ni la bio, ni la dernière connexion', async () => {
    const DB = d1Reel(); user(DB, 'alice'); user(DB, 'bob');
    const r = await (await profil(ENV({ APEX_CHAT_DB: DB }), 'alice', 'p_bob')).json();
    expect(r.limited).toBe(true);
    expect(r.user).toMatchObject({ id: 'bob', pseudo: 'p_bob', real_name: null, first_name: null, last_name: null, bio: null, last_seen: null });
  });
  it('avec une conversation en commun : profil complet', async () => {
    const DB = d1Reel(); user(DB, 'alice'); user(DB, 'bob');
    DB.raw.exec(`INSERT INTO conversations (id,type,created_by,created_at,sharded_to_do) VALUES ('c1','dm','alice',1,0);
      INSERT INTO conversation_members (conv_id,user_id,role,joined_at) VALUES ('c1','alice','owner',1),('c1','bob','member',1)`);
    const r = await (await profil(ENV({ APEX_CHAT_DB: DB }), 'alice', 'p_bob')).json();
    expect(r.limited).toBeUndefined();
    expect(r.user.real_name).toBe('Nom Réel bob');
    expect(r.user.bio).toBe('ma bio');
  });
  it('soi-même et l\'admin voient tout', async () => {
    const DB = d1Reel(); user(DB, 'alice'); user(DB, 'root', { admin: true });
    const env = ENV({ APEX_CHAT_DB: DB });
    expect((await (await profil(env, 'alice', 'p_alice')).json()).user.real_name).toBe('Nom Réel alice');
    expect((await (await profil(env, 'root', 'p_alice')).json()).user.real_name).toBe('Nom Réel alice');
  });
});

describe('plafond de nouvelles conversations', () => {
  it(`le ${CONV_PAR_JOUR + 1}e nouveau correspondant du jour est refusé (429), un compte admin non`, async () => {
    const DB = d1Reel(); user(DB, 'alice'); user(DB, 'root', { admin: true });
    for (let i = 0; i < CONV_PAR_JOUR + 3; i++) user(DB, 'u' + i);
    const env = ENV({ APEX_CHAT_DB: DB });
    for (let i = 0; i < CONV_PAR_JOUR; i++) expect((await creer(env, 'alice', { type: 'dm', members: ['u' + i] })).status, 'conv ' + i).toBe(200);
    const r = await creer(env, 'alice', { type: 'dm', members: ['u' + CONV_PAR_JOUR] });
    expect(r.status).toBe(429);
    expect((await r.json()).error).toBe('conv_quota');
    expect((await creer(env, 'root', { type: 'dm', members: ['u' + CONV_PAR_JOUR] })).status).toBe(200);
  });
  it('une conversation DÉJÀ existante (dédoublonnée) ne compte pas dans le plafond', async () => {
    const DB = d1Reel(); user(DB, 'alice'); user(DB, 'bob');
    const env = ENV({ APEX_CHAT_DB: DB });
    await creer(env, 'alice', { type: 'dm', members: ['bob'] });
    for (let i = 0; i < 5; i++) expect((await (await creer(env, 'alice', { type: 'dm', members: ['bob'] })).json()).deduped).toBe(true);
  });
  it('un index sert la lecture du plafond', () => {
    const DB = d1Reel();
    const plan = DB.raw.prepare("EXPLAIN QUERY PLAN SELECT COUNT(*) FROM conversations WHERE created_by=? AND created_at>?").all('x', 0).map((r) => r.detail).join('|');
    expect(plan).toContain('idx_conv_createur_ts');
  });
});
