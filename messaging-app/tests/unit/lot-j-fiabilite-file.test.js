// @vitest-environment node
/**
 * Audit 16.10.2026 — fiabilité de la file : une capsule dont plus aucun appareil ne répond n'est plus
 * réessayée à l'infini ; « Il y a 1 an » lit par plage de temps (index) et non par fonction de date ;
 * la vérification de mise à jour forcée n'envoie plus un en-tête refusé par le serveur.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../../workers/api-worker.js';
import { ENV } from './api-worker-helpers.js';
import { d1Reel } from './_support/d1-sqlite.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
beforeEach(() => { vi.restoreAllMocks(); globalThis.fetch = vi.fn(async () => new Response('{}')); });
const msg = (body) => ({ body, ack: vi.fn(), retry: vi.fn() });
const pushWorker = (status) => ({ fetch: vi.fn(async () => new Response('x', { status })) });
function seed(DB, openAt) {
  const u = (id, n) => DB.raw.prepare(`INSERT INTO users (id,pseudo,real_name,phone,phone_hash,created_at,identity_key_pub,pq_key_pub,prekey_signed,status) VALUES (?,?,?,?,?,1,'k','k','k','active')`).run(id, 'p_' + id, id, '+3360000000' + n, 'h_' + id);
  u('exp', '01'); u('dest', '02');
  DB.raw.prepare(`INSERT INTO push_subscriptions (user_id, device_id, endpoint, vapid_p256dh, vapid_auth, last_seen, created_at) VALUES ('dest','d1','https://fcm.googleapis.com/fcm/send/z','p','a',?,1)`).run(Date.now());
  DB.raw.prepare(`INSERT INTO time_capsules (id,sender_id,recipient_id,ciphertext,open_at,created_at) VALUES ('tc','exp','dest','x',?,1)`).run(openAt);
}

describe('capsule temporelle : fin des essais sans fin', () => {
  it('échue depuis moins de 24 h et envoi en échec → nouvel essai (comme avant)', async () => {
    const DB = d1Reel(); seed(DB, Date.now() - 3600000);
    const m = msg({ queue_type: 'timecapsule-open', capsule_id: 'tc' });
    await worker.queue({ messages: [m] }, ENV({ APEX_CHAT_DB: DB, PUSH_WORKER: pushWorker(502) }));
    expect(m.retry).toHaveBeenCalled();
    expect(DB.raw.prepare("SELECT opened_at FROM time_capsules WHERE id='tc'").get().opened_at).toBeNull();
  });
  it('échue depuis plus de 24 h et envoi toujours en échec → close, plus jamais réessayée', async () => {
    const DB = d1Reel(); seed(DB, Date.now() - 2 * 86400000);
    const m = msg({ queue_type: 'timecapsule-open', capsule_id: 'tc' });
    await worker.queue({ messages: [m] }, ENV({ APEX_CHAT_DB: DB, PUSH_WORKER: pushWorker(502) }));
    expect(m.retry).not.toHaveBeenCalled();
    expect(m.ack).toHaveBeenCalled();
    expect(DB.raw.prepare("SELECT opened_at FROM time_capsules WHERE id='tc'").get().opened_at).toBeGreaterThan(0);
  });
});

describe('« Il y a 1 an » : lecture par plage de temps', () => {
  it('compte bien les messages du jour d\'il y a un an, pas ceux de la veille', async () => {
    const DB = d1Reel();
    DB.raw.prepare(`INSERT INTO users (id,pseudo,real_name,phone,phone_hash,created_at,identity_key_pub,pq_key_pub,prekey_signed,status) VALUES ('u','p','n','+33600000009','h',1,'k','k','k','active')`).run();
    const day = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
    const t0 = Date.parse(day + 'T00:00:00Z');
    const ins = DB.raw.prepare("INSERT INTO messages (id,conv_id,sender_id,ciphertext,ts) VALUES (?,?,?,?,?)");
    ins.run('dedans', 'c', 'u', 'x', t0 + 3600000);
    ins.run('veille', 'c', 'u', 'x', t0 - 1000);
    const seen = [];
    const spy = { prepare: (sql) => { const st = DB.prepare(sql); if (/FROM messages m/.test(sql)) seen.push(sql); return st; } };
    await worker.queue({ messages: [msg({ queue_type: 'memory-lane', user_id: 'u' })] }, ENV({ APEX_CHAT_DB: spy }));
    expect(seen[0]).toContain('m.ts >= ? AND m.ts < ?');
    expect(seen[0]).not.toMatch(/date\(m\.ts/);
    const plan = DB.raw.prepare('EXPLAIN QUERY PLAN ' + seen[0].replace(/\?/g, '0')).all().map((r) => r.detail).join(' | ');
    expect(plan).toContain('idx_msgs_sender_ts');
  });
});

describe('mise à jour forcée de l\'admin', () => {
  it('le client n\'envoie plus l\'en-tête « Cache-Control » que le serveur refuse (CORS)', () => {
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
    const i = html.indexOf("fetch(apiBase + '/api/admin/force-update-ts");
    expect(i).toBeGreaterThan(0);
    expect(html.slice(i, i + 200)).not.toContain("'Cache-Control'");
  });
});
