// @vitest-environment node
/**
 * « Nouveau groupe » (formulaire de l'app) envoie `members: []` : le serveur répondait « Membres requis » et
 * le groupe restait LOCAL (group_local_…), invisible des autres, sans lien d'invitation valable.
 * Trouvé par le robot « toutes les fonctions » (21.10.2026). Vrai SQLite aux vraies migrations, vrai worker.
 */
import { describe, it, expect } from 'vitest';
import worker from '../../workers/api-worker.js';
import { ENV, makeRequest, makeJWT } from './api-worker-helpers.js';
import { d1Reel } from './_support/d1-sqlite.js';

const CTX = { waitUntil() {} };
const nouveau = (DB, id) => DB.raw.prepare(`INSERT INTO users (id, pseudo, real_name, phone, phone_hash, identity_key_pub, pq_key_pub, prekey_signed, source, created_at, status)
  VALUES (?, ?, 'X', ?, ?, 'x', 'x', 'x', 'kdmc-sso', 1, 'active')`).run(id, id, 'P' + id, 'h' + id);
const creer = async (env, sub, body) => worker.fetch(makeRequest({ method: 'POST', path: '/api/conversations', body, token: await makeJWT({ sub }) }), env, CTX);

describe('groupe créé sans membre (formulaire « Nouveau groupe »)', () => {
  it('un groupe sans membre est créé au serveur, avec son créateur comme propriétaire', async () => {
    const DB = d1Reel(); nouveau(DB, 'u1'); const env = ENV({ APEX_CHAT_DB: DB });
    const r = await creer(env, 'u1', { type: 'group', name: 'Les amis', members: [] });
    const j = await r.json();
    expect(r.status).toBe(200); expect(j.ok).toBe(true); expect(j.conversation.id).toBeTruthy();
    const m = DB.raw.prepare('SELECT user_id, role FROM conversation_members WHERE conv_id=?').all(j.conversation.id);
    expect(m).toEqual([{ user_id: 'u1', role: 'owner' }]);
  });
  it('un message direct sans correspondant reste refusé', async () => {
    const DB = d1Reel(); nouveau(DB, 'u1'); const env = ENV({ APEX_CHAT_DB: DB });
    const r = await creer(env, 'u1', { type: 'dm', members: [] });
    expect(r.status).toBe(400);
  });
  it('« members » absent ou mal typé reste refusé', async () => {
    const DB = d1Reel(); nouveau(DB, 'u1'); const env = ENV({ APEX_CHAT_DB: DB });
    expect((await creer(env, 'u1', { type: 'group', name: 'x' })).status).toBe(400);
    expect((await creer(env, 'u1', { type: 'group', name: 'x', members: 'u2' })).status).toBe(400);
  });
});

describe('inviter dans un groupe par lien', () => {
  const api = (env, sub, chemin, body) => makeJWT({ sub }).then((t) => worker.fetch(makeRequest({ method: 'POST', path: chemin, body, token: t }), env, CTX));
  const groupe = async (env, DB) => { nouveau(DB, 'u1'); nouveau(DB, 'u2'); nouveau(DB, 'u3'); const j = await (await creer(env, 'u1', { type: 'group', name: 'G', members: [] })).json(); return j.conversation.id; };
  const membres = (DB, g) => DB.raw.prepare('SELECT user_id FROM conversation_members WHERE conv_id=? ORDER BY user_id').all(g).map((x) => x.user_id);

  it('le propriétaire invite, un inconnu rejoint avec le lien, le nombre de membres suit, et rejoindre deux fois ne duplique pas', async () => {
    const DB = d1Reel(); const env = ENV({ APEX_CHAT_DB: DB }); const g = await groupe(env, DB);
    const inv = await (await api(env, 'u1', `/api/conversations/${g}/invite`, {})).json();
    expect(inv.ok).toBe(true); expect(inv.token).toBeTruthy();
    const r1 = await (await api(env, 'u2', `/api/conversations/${g}/join`, { token: inv.token })).json();
    expect(r1.ok).toBe(true); expect(r1.already_member).toBe(false); expect(r1.conversation.member_count).toBe(2);
    const r2 = await (await api(env, 'u2', `/api/conversations/${g}/join`, { token: inv.token })).json();
    expect(r2.already_member).toBe(true); expect(membres(DB, g)).toEqual(['u1', 'u2']);
  });
  it('seul le propriétaire ou un administrateur invite : un simple membre et un étranger sont refusés', async () => {
    const DB = d1Reel(); const env = ENV({ APEX_CHAT_DB: DB }); const g = await groupe(env, DB);
    const inv = await (await api(env, 'u1', `/api/conversations/${g}/invite`, {})).json();
    await api(env, 'u2', `/api/conversations/${g}/join`, { token: inv.token });
    expect((await api(env, 'u2', `/api/conversations/${g}/invite`, {})).status).toBe(403);   // membre simple
    expect((await api(env, 'u3', `/api/conversations/${g}/invite`, {})).status).toBe(403);   // étranger
  });
  it('un jeton qui n\'est pas une invitation de CE groupe est refusé (autre groupe, jeton de session, jeton falsifié, expiré, absent)', async () => {
    const DB = d1Reel(); const env = ENV({ APEX_CHAT_DB: DB }); const g = await groupe(env, DB);
    const g2 = (await (await creer(env, 'u1', { type: 'group', name: 'H', members: [] })).json()).conversation.id;
    const inv2 = await (await api(env, 'u1', `/api/conversations/${g2}/invite`, {})).json();
    const session = await makeJWT({ sub: 'u2' });
    const expire = await makeJWT({ typ: 'ginv', cid: g, by: 'u1', exp: Math.floor(Date.now() / 1000) - 10 });
    const faux = await makeJWT({ typ: 'ginv', cid: g, by: 'u1' }, 'autre-secret');
    for (const token of [inv2.token, session, expire, faux, '', undefined]) {
      const r = await api(env, 'u2', `/api/conversations/${g}/join`, { token });
      expect(r.status).toBe(403);
    }
    expect(membres(DB, g)).toEqual(['u1']);
  });
  it('un jeton d\'invitation ne sert jamais de session', async () => {
    const DB = d1Reel(); const env = ENV({ APEX_CHAT_DB: DB }); const g = await groupe(env, DB);
    const inv = await (await api(env, 'u1', `/api/conversations/${g}/invite`, {})).json();
    const r = await worker.fetch(makeRequest({ method: 'GET', path: '/api/conversations', token: inv.token }), env, CTX);
    expect(r.status).toBe(401);
  });
  it('pas d\'invitation ni d\'adhésion pour un message direct ; groupe plein refusé', async () => {
    const DB = d1Reel(); const env = ENV({ APEX_CHAT_DB: DB }); const g = await groupe(env, DB);
    const dm = (await (await creer(env, 'u1', { type: 'dm', members: ['u2'] })).json()).conversation.id;
    expect((await api(env, 'u1', `/api/conversations/${dm}/invite`, {})).status).toBe(400);
    const forge = await makeJWT({ typ: 'ginv', cid: dm, by: 'u1' });
    expect((await api(env, 'u3', `/api/conversations/${dm}/join`, { token: forge })).status).toBe(400);
    const inv = await (await api(env, 'u1', `/api/conversations/${g}/invite`, {})).json();
    DB.raw.prepare('UPDATE conversations SET member_count=1024 WHERE id=?').run(g);
    expect((await api(env, 'u3', `/api/conversations/${g}/join`, { token: inv.token })).status).toBe(403);
  });
});
