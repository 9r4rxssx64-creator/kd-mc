// @vitest-environment node
/**
 * Lot 2 — C (votes de sondage) et F (audience des stories), sur le vrai schéma.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker from '../../workers/api-worker.js';
import { ENV, makeJWT, makeRequest } from './api-worker-helpers.js';
import { d1Reel } from './_support/d1-sqlite.js';

const CTX = { waitUntil() {} };
beforeEach(() => { vi.restoreAllMocks(); globalThis.fetch = vi.fn(async () => new Response('{}')); });

let n = 0;
function seedUser(db, id) {
  n++;
  db.raw.prepare(`INSERT INTO users (id,pseudo,real_name,phone,phone_hash,created_at,identity_key_pub,pq_key_pub,prekey_signed,status)
    VALUES (?,?,?,?,?,1,'k','k','k','active')`).run(id, 'p_' + id, 'Nom ' + id, '+3365' + String(1000000 + n), 'h_' + id);
}
const tok = (sub) => makeJWT({ sub, iat: Math.floor(Date.now() / 1000) - 5 });
const call = async (env, method, path, sub, body) =>
  worker.fetch(makeRequest({ method, path, body, token: await tok(sub) }), env, CTX);

function pollSetup({ multi = 0 } = {}) {
  const DB = d1Reel();
  for (const u of ['u1', 'u2']) seedUser(DB, u);
  DB.raw.prepare(`INSERT INTO conversations (id,type,created_by,created_at,sharded_to_do) VALUES ('c1','group','u1',1,'do_c1')`).run();
  for (const u of ['u1', 'u2']) DB.raw.prepare(`INSERT INTO conversation_members (conv_id,user_id,role,joined_at) VALUES ('c1',?,'member',1)`).run(u);
  DB.raw.prepare(`INSERT INTO polls (id,conv_id,msg_id,question,options,multi_choice,votes,created_at) VALUES ('p1','c1','m1','Q ?',?,?,'{}',1)`)
    .run(JSON.stringify(['A', 'B', 'C']), multi);
  return { DB, env: ENV({ APEX_CHAT_DB: DB }) };
}
const votesOf = (DB) => JSON.parse(DB.raw.prepare("SELECT votes FROM polls WHERE id='p1'").get().votes);

describe('C — votes de sondage', () => {
  it('index hors bornes / non entier → 400, rien n\'est écrit', async () => {
    const { DB, env } = pollSetup({ multi: 1 });
    for (const bad of [[99], [-1], [1.5], ['1'], [3]]) {
      const r = await call(env, 'POST', '/api/polls/p1/vote', 'u1', { option_indexes: bad });
      expect(r.status, JSON.stringify(bad)).toBe(400);
    }
    expect(votesOf(DB)).toEqual({});
  });

  it('« __proto__ » / « constructor » → 400 (jamais 500, aucune pollution)', async () => {
    const { DB, env } = pollSetup({ multi: 1 });
    for (const bad of [['__proto__'], ['constructor'], ['toString']]) {
      const r = await call(env, 'POST', '/api/polls/p1/vote', 'u1', { option_indexes: bad });
      expect(r.status, JSON.stringify(bad)).toBe(400);
    }
    expect(votesOf(DB)).toEqual({});
    expect(({}).polluted).toBeUndefined();
  });

  it('choix unique : exactement un index accepté', async () => {
    const { DB, env } = pollSetup({ multi: 0 });
    const r = await call(env, 'POST', '/api/polls/p1/vote', 'u1', { option_indexes: [0, 1] });
    expect(r.status).toBe(400);
    expect(votesOf(DB)).toEqual({});
    const ok = await call(env, 'POST', '/api/polls/p1/vote', 'u1', { option_indexes: [2] });
    expect(ok.status).toBe(200);
    expect(votesOf(DB)).toEqual({ 2: ['u1'] });
  });

  it('vote concurrent : aucun vote perdu (écriture conditionnelle + nouvel essai)', async () => {
    const { DB, env } = pollSetup({ multi: 1 });
    // Simule un AUTRE vote qui arrive entre la lecture et l'écriture de u1.
    const prepare = DB.prepare;
    let injected = false;
    DB.prepare = (sql) => {
      const st = prepare(sql);
      if (!injected && /^UPDATE polls SET votes=/.test(sql)) {
        const run = st.run;
        st.run = async () => {
          injected = true;
          DB.raw.prepare("UPDATE polls SET votes=? WHERE id='p1'").run(JSON.stringify({ 1: ['u2'] }));
          return run();
        };
      }
      return st;
    };
    const r = await call(env, 'POST', '/api/polls/p1/vote', 'u1', { option_indexes: [0] });
    expect(r.status).toBe(200);
    expect(injected).toBe(true);
    expect(votesOf(DB)).toEqual({ 0: ['u1'], 1: ['u2'] });
  });
});

describe('F — audience des stories', () => {
  function storySetup() {
    const DB = d1Reel();
    for (const u of ['auteur', 'ami', 'inconnu', 'curieux']) seedUser(DB, u);
    // « ami » est contact MUTUEL de l'auteur (ligne vue depuis ami → auteur)
    DB.raw.prepare(`INSERT INTO contacts (user_id,contact_id,mutual_at,created_at) VALUES ('ami','auteur',1,1)`).run();
    DB.raw.prepare(`INSERT INTO stories (id,author_id,ciphertext,mime,ts,expires_at,views) VALUES ('s1','auteur','chiffre','text/plain',?,?,?)`)
      .run(Date.now(), Date.now() + 3600000, JSON.stringify([{ user_id: 'curieux', viewed_at: 1 }]));
    return { DB, env: ENV({ APEX_CHAT_DB: DB }) };
  }

  it('GET /api/stories : seul l\'auteur reçoit la liste des vues', async () => {
    const { env } = storySetup();
    const asFriend = await (await call(env, 'GET', '/api/stories', 'ami')).json();
    const s = asFriend.stories.find((x) => x.id === 's1');
    expect(s).toBeTruthy();
    expect(s.views).toBeUndefined();
    const asAuthor = await (await call(env, 'GET', '/api/stories', 'auteur')).json();
    expect(JSON.parse(asAuthor.stories.find((x) => x.id === 's1').views)).toEqual([{ user_id: 'curieux', viewed_at: 1 }]);
  });

  it('GET /api/stories/:id : même audience que la liste (non-contact → 404, rien enregistré)', async () => {
    const { DB, env } = storySetup();
    const r = await call(env, 'GET', '/api/stories/s1', 'inconnu');
    expect(r.status).toBe(404);
    const views = JSON.parse(DB.raw.prepare("SELECT views FROM stories WHERE id='s1'").get().views);
    expect(views.some((v) => v.user_id === 'inconnu')).toBe(false);
    const ok = await call(env, 'GET', '/api/stories/s1', 'ami');
    expect(ok.status).toBe(200);
    const j = await ok.json();
    expect(j.story.ciphertext).toBe('chiffre');
    expect(j.story.views_count).toBeUndefined();   // compteur réservé à l'auteur
  });
});
