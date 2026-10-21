// @vitest-environment node
/**
 * Le battement d'Apex Chat renvoie « du nouveau pour toi » (Kevin 21.10.2026 : « je ne reçois rien… vérifie le temps réel »). Vrai SQLite aux vraies migrations, vrai worker.
 *   1. il rend la dernière activité de MES conversations et leur nombre ; une conversation neuve ou un message récent change le signal ;
 *   2. seul un admin reçoit le nombre de comptes (une inscription se voit sans recharger) ;
 */
import { describe, it, expect } from 'vitest';
import worker from '../../workers/api-worker.js';
import { ENV, makeRequest, makeJWT } from './api-worker-helpers.js';
import { d1Reel } from './_support/d1-sqlite.js';

const CTX = { waitUntil() {} };
function base() {
  const DB = d1Reel(); const r = DB.raw;
  for (const [id, ps] of [['u_a', 'alice'], ['u_b', 'bob']]) {
    r.prepare(`INSERT INTO users (id, pseudo, real_name, phone, phone_hash, is_admin, identity_key_pub, pq_key_pub, prekey_signed, source, created_at, status)
               VALUES (?, ?, ?, ?, ?, 0, 'x', 'x', 'x', 'test', 1, 'active')`).run(id, ps, ps, '+3360000' + ps.length + id, 'h' + id);
  }
  return DB;
}
const conv = (DB, id, membres, ts) => {
  DB.raw.prepare("INSERT INTO conversations (id, type, created_by, created_at, sharded_to_do, member_count, last_msg_ts, e2e_version) VALUES (?, 'dm', ?, ?, 'do_x', 2, ?, 1)").run(id, membres[0], ts, ts);
  for (const m of membres) DB.raw.prepare("INSERT INTO conversation_members (conv_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)").run(id, m, ts);
};
const battement = async (env, sub, admin = false) => {
  const token = await makeJWT({ sub, is_admin: admin });
  const r = await worker.fetch(makeRequest({ method: 'POST', path: '/api/users/heartbeat', body: {}, token }), env, CTX);
  return { st: r.status, j: await r.json() };
};

describe('battement : signal « du nouveau pour toi »', () => {
  it('1. rend la dernière activité de mes conversations ; une conversation neuve / un message récent le change', async () => {
    const DB = base(); const env = ENV({ APEX_CHAT_DB: DB });
    expect((await battement(env, 'u_b')).j).toMatchObject({ ok: true, convs_ts: 0, convs_n: 0 });
    conv(DB, 'c1', ['u_a', 'u_b'], 5000);
    expect((await battement(env, 'u_b')).j).toMatchObject({ convs_ts: 5000, convs_n: 1 });
    DB.raw.prepare("UPDATE conversations SET last_msg_ts=9000 WHERE id='c1'").run();
    expect((await battement(env, 'u_b')).j).toMatchObject({ convs_ts: 9000, convs_n: 1 });
    conv(DB, 'c2', ['u_a', 'u_b'], 12000);
    expect((await battement(env, 'u_b')).j).toMatchObject({ convs_ts: 12000, convs_n: 2 });
    expect((await battement(env, 'u_a')).j.convs_n).toBe(2);
  });
  it('1b. une conversation archivée ou d\'un autre ne compte pas', async () => {
    const DB = base(); const env = ENV({ APEX_CHAT_DB: DB });
    conv(DB, 'c1', ['u_a'], 5000); DB.raw.prepare("UPDATE conversations SET archived_at=1 WHERE id='c1'").run();
    expect((await battement(env, 'u_b')).j.convs_n).toBe(0);
    expect((await battement(env, 'u_a')).j.convs_n).toBe(0);
  });
  it('2. seul un admin reçoit le nombre de comptes', async () => {
    const DB = base(); const env = ENV({ APEX_CHAT_DB: DB });
    const ordinaire = (await battement(env, 'u_a')).j;
    expect(ordinaire.users_n).toBeUndefined();
    DB.raw.prepare("UPDATE users SET is_admin=1 WHERE id='u_b'").run();
    const avant = (await battement(env, 'u_b', true)).j.users_n;
    expect(avant).toBeGreaterThanOrEqual(3);
    DB.raw.prepare(`INSERT INTO users (id, pseudo, real_name, phone, phone_hash, is_admin, identity_key_pub, pq_key_pub, prekey_signed, source, created_at, status)
      VALUES ('u_c','carl','carl','+33600099','hc',0,'x','x','x','test',1,'active')`).run();
    expect((await battement(env, 'u_b', true)).j.users_n).toBe(avant + 1);
  });
});
