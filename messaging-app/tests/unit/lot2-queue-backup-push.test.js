// @vitest-environment node
/**
 * Lot 2 — D (envois push attendus, capsule close seulement après succès),
 * G (lettres réclamées + expéditeur encore membre), H (télémétrie typée),
 * J (abonnement push : pas de détournement, vrais services), K (sauvegarde
 * tronquée signalée), L (notifications admin plafonnées par utilisateur).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker, { sendPushToUser, performDailyBackup, BACKUP_ROW_LIMIT } from '../../workers/api-worker.js';
import { ENV, makeJWT, makeRequest, makeKV, makeR2, makeQueue } from './api-worker-helpers.js';
import { d1Reel } from './_support/d1-sqlite.js';

const CTX = { waitUntil() {} };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
beforeEach(() => { vi.restoreAllMocks(); globalThis.fetch = vi.fn(async () => new Response('{}')); });

let n = 0;
function seedUser(db, id) {
  n++;
  db.raw.prepare(`INSERT INTO users (id,pseudo,real_name,phone,phone_hash,created_at,identity_key_pub,pq_key_pub,prekey_signed,status)
    VALUES (?,?,?,?,?,1,'k','k','k','active')`).run(id, 'p_' + id, 'Nom ' + id, '+3367' + String(1000000 + n), 'h_' + id);
}
function seedSub(db, uid, endpoint) {
  db.raw.prepare(`INSERT INTO push_subscriptions (user_id, device_id, endpoint, vapid_p256dh, vapid_auth, last_seen, created_at)
    VALUES (?, ?, ?, 'p256', 'auth', ?, 1)`).run(uid, 'dev_' + uid + '_' + Math.random().toString(36).slice(2, 8), endpoint, Date.now());
}
const tok = (sub) => makeJWT({ sub, iat: Math.floor(Date.now() / 1000) - 5 });
const call = async (env, method, path, sub, body) =>
  worker.fetch(makeRequest({ method, path, body, token: await tok(sub) }), env, CTX);
const pushWorker = (impl) => ({ calls: 0, fetch: vi.fn(async function (...a) { this.calls++; return impl(...a); }) });
const queueMsg = (body) => ({ body, ack: vi.fn(), retry: vi.fn() });

describe('D — envois push attendus', () => {
  it('sendPushToUser ne rend la main qu\'une fois l\'envoi terminé, avec le bilan', async () => {
    const DB = d1Reel();
    seedUser(DB, 'u1');
    seedSub(DB, 'u1', 'https://fcm.googleapis.com/fcm/send/abc');
    let done = false;
    const PUSH_WORKER = pushWorker(async () => { await sleep(30); done = true; return new Response('{}', { status: 201 }); });
    const res = await sendPushToUser('u1', { title: 't' }, ENV({ APEX_CHAT_DB: DB, PUSH_WORKER }));
    expect(done).toBe(true);
    expect(res).toEqual({ total: 1, ok: 1, failed: 0 });
  });

  it('capsule temporelle : opened_at posé SEULEMENT si la notification part ; sinon nouvel essai', async () => {
    const DB = d1Reel();
    seedUser(DB, 'exp'); seedUser(DB, 'dest');
    seedSub(DB, 'dest', 'https://fcm.googleapis.com/fcm/send/dest');
    DB.raw.prepare(`INSERT INTO time_capsules (id,sender_id,recipient_id,ciphertext,open_at,created_at) VALUES ('tc1','exp','dest','x',?,1)`).run(Date.now() - 1000);
    const failing = ENV({ APEX_CHAT_DB: DB, PUSH_WORKER: pushWorker(async () => new Response('err', { status: 502 })) });
    const m1 = queueMsg({ queue_type: 'timecapsule-open', capsule_id: 'tc1' });
    await worker.queue({ messages: [m1] }, failing);
    expect(DB.raw.prepare("SELECT opened_at FROM time_capsules WHERE id='tc1'").get().opened_at).toBeNull();
    expect(m1.retry).toHaveBeenCalled();
    expect(m1.ack).not.toHaveBeenCalled();

    let delivered = false;
    const ok = ENV({ APEX_CHAT_DB: DB, PUSH_WORKER: pushWorker(async () => { await sleep(20); delivered = true; return new Response('{}', { status: 201 }); }) });
    const m2 = queueMsg({ queue_type: 'timecapsule-open', capsule_id: 'tc1' });
    await worker.queue({ messages: [m2] }, ok);
    expect(delivered).toBe(true);
    expect(DB.raw.prepare("SELECT opened_at FROM time_capsules WHERE id='tc1'").get().opened_at).toBeGreaterThan(0);
    expect(m2.ack).toHaveBeenCalled();
  });
});

describe('G — lettres différées', () => {
  function setup() {
    const DB = d1Reel();
    seedUser(DB, 'exp'); seedUser(DB, 'dest');
    DB.raw.prepare(`INSERT INTO conversations (id,type,created_by,created_at,sharded_to_do) VALUES ('c1','dm','exp',1,'do_c1')`).run();
    for (const u of ['exp', 'dest']) DB.raw.prepare(`INSERT INTO conversation_members (conv_id,user_id,role,joined_at) VALUES ('c1',?,'member',1)`).run(u);
    DB.raw.prepare(`INSERT INTO letters_queue (id,sender_id,conv_id,ciphertext,deliver_at,created_at) VALUES ('l1','exp','c1','lettre',?,1)`).run(Date.now() - 1000);
    let injections = 0;
    const CONVERSATION_DO = {
      idFromName: (x) => x,
      get: () => ({ fetch: async () => { injections++; await sleep(20); return new Response('{"ok":true}', { status: 200 }); } }),
    };
    return { DB, env: ENV({ APEX_CHAT_DB: DB, CONVERSATION_DO }), injections: () => injections };
  }

  it('deux consommateurs simultanés → la lettre n\'est injectée qu\'UNE fois', async () => {
    const { DB, env, injections } = setup();
    const a = queueMsg({ queue_type: 'letters-deliver', letter_id: 'l1' });
    const b = queueMsg({ queue_type: 'letters-deliver', letter_id: 'l1' });
    await Promise.all([worker.queue({ messages: [a] }, env), worker.queue({ messages: [b] }, env)]);
    expect(injections()).toBe(1);
    expect(DB.raw.prepare("SELECT delivered FROM letters_queue WHERE id='l1'").get().delivered).toBe(1);
  });

  it('expéditeur sorti de la conversation pendant le délai → lettre NON livrée', async () => {
    const { DB, env, injections } = setup();
    DB.raw.prepare("DELETE FROM conversation_members WHERE conv_id='c1' AND user_id='exp'").run();
    const m = queueMsg({ queue_type: 'letters-deliver', letter_id: 'l1' });
    await worker.queue({ messages: [m] }, env);
    expect(injections()).toBe(0);
    expect(DB.raw.prepare("SELECT cancelled FROM letters_queue WHERE id='l1'").get().cancelled).toBe(1);
  });

  it('injection en échec → la lettre est relâchée pour un nouvel essai (jamais perdue)', async () => {
    const { DB } = setup();
    const env = ENV({ APEX_CHAT_DB: DB, CONVERSATION_DO: { idFromName: (x) => x, get: () => ({ fetch: async () => new Response('x', { status: 500 }) }) } });
    await worker.queue({ messages: [queueMsg({ queue_type: 'letters-deliver', letter_id: 'l1' })] }, env);
    expect(DB.raw.prepare("SELECT delivered, cancelled FROM letters_queue WHERE id='l1'").get()).toEqual({ delivered: 0, cancelled: 0 });
  });
});

describe('H — télémétrie typée pour le consommateur', () => {
  it('erreur interne et sauvegarde ratée → queue_type « telemetry », relayée par le consommateur', async () => {
    const DB = d1Reel();
    seedUser(DB, 'u1');
    DB.raw.exec('DROP TABLE stories');   // provoque une vraie erreur interne
    const TELEMETRY_QUEUE = makeQueue();
    const env = ENV({ APEX_CHAT_DB: DB, TELEMETRY_QUEUE, APEX_HANDOFF_FIREBASE_URL: 'https://fb.example', APEX_HANDOFF_TOKEN: 't' });
    const r = await call(env, 'GET', '/api/stories', 'u1');
    expect(r.status).toBe(500);
    await performDailyBackup({ ...env, JWT_SIGN_KEY: '' });
    expect(TELEMETRY_QUEUE._sent.length).toBe(2);
    for (const m of TELEMETRY_QUEUE._sent) expect(m.queue_type).toBe('telemetry');
    globalThis.fetch = vi.fn(async () => new Response('{}'));
    await worker.queue({ messages: TELEMETRY_QUEUE._sent.map((b) => queueMsg(b)) }, env);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(String(globalThis.fetch.mock.calls[0][0])).toContain('fb.example');
  });
});

describe('J — abonnement push', () => {
  const SUB = (endpoint) => ({ subscription: { endpoint, keys: { p256dh: 'p256', auth: 'auth' } } });

  it('l\'endpoint d\'un autre compte ne peut pas être détourné', async () => {
    const DB = d1Reel();
    seedUser(DB, 'victime'); seedUser(DB, 'pirate');
    const ep = 'https://fcm.googleapis.com/fcm/send/victime-device';
    seedSub(DB, 'victime', ep);
    const r = await call(ENV({ APEX_CHAT_DB: DB }), 'POST', '/api/push/subscribe', 'pirate', SUB(ep));
    expect(r.status).toBe(409);
    const rows = DB.raw.prepare('SELECT user_id FROM push_subscriptions WHERE endpoint=?').all(ep).map((x) => x.user_id);
    expect(rows).toEqual(['victime']);
    // le propriétaire peut ré-enregistrer son propre appareil
    expect((await call(ENV({ APEX_CHAT_DB: DB }), 'POST', '/api/push/subscribe', 'victime', SUB(ep))).status).toBe(200);
  });

  it('seulement HTTPS vers un vrai service de notification', async () => {
    const DB = d1Reel();
    seedUser(DB, 'u1');
    const env = ENV({ APEX_CHAT_DB: DB });
    for (const bad of ['http://fcm.googleapis.com/x', 'https://evil.example/push', 'https://169.254.169.254/latest',
      'https://fcm.googleapis.com.evil.example/x', 'https://push.apple.com/x', 'javascript:alert(1)']) {
      const r = await call(env, 'POST', '/api/push/subscribe', 'u1', SUB(bad));
      expect(r.status, bad).toBe(400);
    }
    expect(DB.raw.prepare("SELECT COUNT(*) c FROM push_subscriptions WHERE user_id='u1'").get().c).toBe(0);
    for (const good of ['https://fcm.googleapis.com/fcm/send/a', 'https://updates.push.services.mozilla.com/wpush/v2/b',
      'https://web.push.apple.com/c', 'https://api.push.apple.com/d', 'https://db5p.notify.windows.com/w/?token=e']) {
      expect((await call(env, 'POST', '/api/push/subscribe', 'u1', SUB(good))).status, good).toBe(200);
    }
  });
});

describe('K — sauvegarde tronquée', () => {
  it('une table qui dépasse la limite → sauvegarde signalée tronquée, jamais « backup_last_ok »', async () => {
    const notes = {};
    const DB = {
      prepare: (sql) => ({
        _a: [],
        bind(...a) { this._a = a; return this; },
        async all() {
          if (sql.includes('sqlite_master')) return { results: [{ name: 'grosse' }, { name: 'petite' }] };
          const lim = Number((/LIMIT (\d+)/.exec(sql) || [])[1] || 0);
          if (sql.includes('FROM grosse')) return { results: Array.from({ length: lim }, (_, i) => ({ i })) };   // table plus grande que la limite
          return { results: [{ a: 1 }] };
        },
        async run() { if (sql.includes('system_config')) notes[this._a[0]] = this._a[1]; return { success: true, meta: { changes: 1 } }; },
        async first() { return null; },
      }),
    };
    const res = await performDailyBackup({ APEX_CHAT_DB: DB, APEX_CHAT_MEDIA: makeR2(), JWT_SIGN_KEY: 'k', TELEMETRY_QUEUE: makeQueue() }, new Date('2026-10-08T03:00:00Z'));
    expect(res.ok).toBe(false);
    expect(res.truncated).toEqual(['grosse']);
    expect(notes.backup_last_ok).toBeUndefined();
    expect(JSON.parse(notes.backup_last_error).truncated).toEqual(['grosse']);
    expect(BACKUP_ROW_LIMIT).toBe(100000);
  });
});

describe('L — notifications admin plafonnées par utilisateur', () => {
  it('10 signalements et 10 demandes premium d\'un même compte → au plus 5 notifications chacun, tout est enregistré', async () => {
    const DB = d1Reel();
    seedUser(DB, 'spam');
    if (!DB.raw.prepare("SELECT 1 FROM users WHERE id='kdmc_admin'").get()) seedUser(DB, 'kdmc_admin');
    seedSub(DB, 'kdmc_admin', 'https://fcm.googleapis.com/fcm/send/admin');
    const PUSH_WORKER = pushWorker(async () => new Response('{}', { status: 201 }));
    const env = ENV({ APEX_CHAT_DB: DB, PUSH_WORKER, APEX_CHAT_KV: makeKV() });
    for (let i = 0; i < 10; i++) {
      expect((await call(env, 'POST', '/api/signalements', 'spam', { target_user_id: 'cible' + i, reason: 'spam' })).status).toBe(200);
    }
    expect(PUSH_WORKER.fetch.mock.calls.length).toBeLessThanOrEqual(5);
    expect(PUSH_WORKER.fetch.mock.calls.length).toBeGreaterThan(0);
    expect(DB.raw.prepare("SELECT COUNT(*) c FROM signalements WHERE reporter_id='spam'").get().c).toBe(10);
    const before = PUSH_WORKER.fetch.mock.calls.length;
    for (let i = 0; i < 10; i++) {
      expect((await call(env, 'POST', '/api/premium/request', 'spam', { plan: 'monthly' })).status).toBe(200);
    }
    expect(PUSH_WORKER.fetch.mock.calls.length - before).toBeLessThanOrEqual(5);
  });
});
