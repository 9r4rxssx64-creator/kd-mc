// @vitest-environment node
/**
 * Une clé par appareil (22.10.2026) — registre des appareils côté serveur, sur le VRAI schéma (node:sqlite + migrations).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker, { DEVICES_MAX, _adoptKevinRow } from '../../workers/api-worker.js';
import { ENV, makeJWT, makeRequest, makeKV } from './api-worker-helpers.js';
import { d1Reel } from './_support/d1-sqlite.js';

const CTX = { waitUntil() {} };
beforeEach(() => { vi.restoreAllMocks(); globalThis.fetch = vi.fn(async () => new Response('{}', { status: 500 })); });
let n = 0;
function seedUser(db, id, extra = {}) {
  n++;
  db.raw.prepare(`INSERT INTO users (id,pseudo,real_name,phone,phone_hash,created_at,identity_key_pub,pq_key_pub,prekey_signed,status,is_admin,is_kevin_alias,source,merged_into)
    VALUES (?,?,?,?,?,1,'k','k','k',?,?,?,?,?)`).run(id, 'p_' + id, 'Nom ' + id, '+3366' + String(1000000 + n), 'h_' + id,
    extra.status || 'active', extra.is_admin || 0, extra.alias || 0, extra.source || 'apex-chat-direct', extra.merged_into || null);
}
const tok = (sub) => makeJWT({ sub, iat: Math.floor(Date.now() / 1000) - 5 });
const appel = async (env, sub, method, path, body) => {
  const r = await worker.fetch(makeRequest({ method, path, token: await tok(sub), body }), env, CTX);
  return { status: r.status, j: await r.json() };
};
const base = () => { const DB = d1Reel(); seedUser(DB, 'kevin'); seedUser(DB, 'remy'); return { DB, env: ENV({ APEX_CHAT_DB: DB, APEX_CHAT_KV: makeKV() }) }; };
const CLE = 'eyJrdHkiOiJFQyIsImNydiI6IlAtMjU2In0';

describe('registre des appareils', () => {
  it('Kevin publie son iPhone puis son PC : Rémy voit les DEUX clés (sans leurs noms), Kevin voit aussi les noms', async () => {
    const { env } = base();
    expect((await appel(env, 'kevin', 'POST', '/api/keys/device', { device_id: 'kevin-iphone-01', identity_key_pub: CLE + 'A', crypto_caps: 'media,grp1,mdev1', label: 'iPhone' })).j.ok).toBe(true);
    expect((await appel(env, 'kevin', 'POST', '/api/keys/device', { device_id: 'kevin-pc-000002', identity_key_pub: CLE + 'B', label: 'PC <Windows>' })).j.ok).toBe(true);
    const vu = await appel(env, 'remy', 'GET', '/api/keys/kevin/devices');
    expect(vu.j.devices.map((d) => d.device_id).sort()).toEqual(['kevin-iphone-01', 'kevin-pc-000002']);
    expect(vu.j.devices.every((d) => d.label === undefined)).toBe(true);
    const moi = await appel(env, 'kevin', 'GET', '/api/keys/kevin/devices');
    expect(moi.j.devices.map((d) => d.label).sort()).toEqual(['PC Windows', 'iPhone']);   // nettoyé : ni < ni >
  });
  it('republier le même appareil met sa clé à jour (pas de doublon)', async () => {
    const { env } = base();
    await appel(env, 'kevin', 'POST', '/api/keys/device', { device_id: 'kevin-iphone-01', identity_key_pub: CLE + 'A' });
    await appel(env, 'kevin', 'POST', '/api/keys/device', { device_id: 'kevin-iphone-01', identity_key_pub: CLE + 'Z' });
    const vu = await appel(env, 'remy', 'GET', '/api/keys/kevin/devices');
    expect(vu.j.devices).toHaveLength(1);
    expect(vu.j.devices[0].identity_key_pub).toBe(CLE + 'Z');
  });
  it('retirer un appareil : il disparaît de la liste et ne peut plus se republier sous le même identifiant', async () => {
    const { env } = base();
    await appel(env, 'kevin', 'POST', '/api/keys/device', { device_id: 'kevin-vole-0001', identity_key_pub: CLE + 'A' });
    expect((await appel(env, 'kevin', 'DELETE', '/api/keys/device/kevin-vole-0001')).j.ok).toBe(true);
    expect((await appel(env, 'remy', 'GET', '/api/keys/kevin/devices')).j.devices).toHaveLength(0);
    const re = await appel(env, 'kevin', 'POST', '/api/keys/device', { device_id: 'kevin-vole-0001', identity_key_pub: CLE + 'A' });
    expect([re.status, re.j.error]).toEqual([403, 'device_revoked']);
    expect((await appel(env, 'kevin', 'DELETE', '/api/keys/device/kevin-vole-0001')).status).toBe(404);
  });
  it('personne ne retire l\'appareil d\'un autre', async () => {
    const { env } = base();
    await appel(env, 'kevin', 'POST', '/api/keys/device', { device_id: 'kevin-iphone-01', identity_key_pub: CLE });
    expect((await appel(env, 'remy', 'DELETE', '/api/keys/device/kevin-iphone-01')).status).toBe(404);
    expect((await appel(env, 'remy', 'GET', '/api/keys/kevin/devices')).j.devices).toHaveLength(1);
  });
  it('entrées refusées : identifiant, clé, sans jeton', async () => {
    const { env } = base();
    expect((await appel(env, 'kevin', 'POST', '/api/keys/device', { device_id: 'x', identity_key_pub: CLE })).j.error).toBe('bad_device_id');
    expect((await appel(env, 'kevin', 'POST', '/api/keys/device', { device_id: 'kevin-iphone-01', identity_key_pub: 'PENDING_X' })).j.error).toBe('bad_pubkey');
    expect((await appel(env, 'kevin', 'DELETE', '/api/keys/device/x')).j.error).toBe('bad_device_id');
    const r = await worker.fetch(makeRequest({ method: 'GET', path: '/api/keys/kevin/devices' }), env, CTX);
    expect(r.status).toBe(401);
    const r2 = await worker.fetch(makeRequest({ method: 'POST', path: '/api/keys/device', body: {} }), env, CTX);
    expect(r2.status).toBe(401);
    const r3 = await worker.fetch(makeRequest({ method: 'DELETE', path: '/api/keys/device/kevin-iphone-01' }), env, CTX);
    expect(r3.status).toBe(401);
    // corps illisible (pas du JSON) : refus propre, jamais une erreur 500
    const brut = new Request('https://api.apex/api/keys/device', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await tok('kevin') }, body: '{pas du json' });
    const r4 = await worker.fetch(brut, env, CTX);
    expect(r4.status).toBe(400);
    expect((await r4.json()).error).toBe('bad_device_id');
  });
  it(`plafond : au-delà de ${DEVICES_MAX} appareils, le moins récemment vu est retiré`, async () => {
    const { env, DB } = base();
    for (let i = 0; i <= DEVICES_MAX; i++) {
      await appel(env, 'kevin', 'POST', '/api/keys/device', { device_id: 'appareil-' + String(i).padStart(4, '0'), identity_key_pub: CLE });
      DB.raw.prepare('UPDATE user_devices SET last_seen=? WHERE device_id=?').run(Date.now() - 100000 + i, 'appareil-' + String(i).padStart(4, '0'));
    }
    await appel(env, 'kevin', 'POST', '/api/keys/device', { device_id: 'appareil-0012', identity_key_pub: CLE });
    const ids = (await appel(env, 'kevin', 'GET', '/api/keys/kevin/devices')).j.devices.map((d) => d.device_id);
    expect(ids).toHaveLength(DEVICES_MAX);
    expect(ids).not.toContain('appareil-0000');
  });
  it('un compte fusionné : la liste demandée sur l\'ancien identifiant rend les appareils du compte gardé', async () => {
    const { env, DB } = base();
    seedUser(DB, 'kevin_doublon', { status: 'deleted', merged_into: 'kevin' });
    await appel(env, 'kevin', 'POST', '/api/keys/device', { device_id: 'kevin-iphone-01', identity_key_pub: CLE });
    const vu = await appel(env, 'remy', 'GET', '/api/keys/kevin_doublon/devices');
    expect(vu.j.user_id).toBe('kevin');
    expect(vu.j.devices).toHaveLength(1);
  });
  it('la fusion des comptes de Kevin emporte ses appareils vers kdmc_admin', async () => {
    const DB = d1Reel();
    if (!DB.raw.prepare("SELECT 1 FROM users WHERE id='kdmc_admin'").get()) seedUser(DB, 'kdmc_admin', { is_admin: 1, alias: 1, source: 'apex-sso' });
    DB.raw.prepare("UPDATE users SET status='active' WHERE id='kdmc_admin'").run();
    seedUser(DB, 'kdmc_kdmc_admin', { is_admin: 1, alias: 1, source: 'kdmc-sso' });
    DB.raw.prepare("UPDATE users SET identity_key_pub=? WHERE id='kdmc_kdmc_admin'").run('X'.repeat(60));
    DB.raw.prepare("INSERT INTO user_devices (user_id, device_id, identity_key_pub, created_at, last_seen) VALUES ('kdmc_kdmc_admin','kevin-iphone-01','k',1,?)").run(Date.now());
    const env = ENV({ APEX_CHAT_DB: DB, APEX_CHAT_KV: makeKV() });
    await _adoptKevinRow(env, 'kdmc_admin');
    const rows = DB.raw.prepare('SELECT user_id FROM user_devices').all().map((r) => r.user_id);
    expect(rows).toEqual(['kdmc_admin']);
  });
});

describe('v1.1.345 — clé de signature par appareil (groupes)', () => {
  const SIG = 'GSIG1:' + 'B'.repeat(88);
  it("chaque appareil publie SA clé de signature ; tout membre la lit dans la liste ; une forme invalide est refusée", async () => {
    const { env } = base();
    expect((await appel(env, 'kevin', 'POST', '/api/keys/device', { device_id: 'kevin-iphone-01', identity_key_pub: CLE + 'A', signing_key_pub: SIG + 'A' })).j.ok).toBe(true);
    expect((await appel(env, 'kevin', 'POST', '/api/keys/device', { device_id: 'kevin-pc-0000002', identity_key_pub: CLE + 'B', signing_key_pub: SIG + 'C' })).j.ok).toBe(true);
    const vu = (await appel(env, 'remy', 'GET', '/api/keys/kevin/devices')).j.devices;
    expect(vu.map((d) => d.signing_key_pub).sort()).toEqual([SIG + 'A', SIG + 'C']);
    expect((await appel(env, 'kevin', 'POST', '/api/keys/device', { device_id: 'kevin-iphone-01', identity_key_pub: CLE + 'A', signing_key_pub: 'pas-une-cle' })).j.error).toBe('bad_signing_key');
    expect((await appel(env, 'kevin', 'POST', '/api/keys/device', { device_id: 'kevin-iphone-01', identity_key_pub: CLE + 'A', signing_key_pub: 'GSIG1:' + 'x'.repeat(400) })).j.error).toBe('bad_signing_key');
  });
  it('republier sans clé de signature garde celle déjà connue', async () => {
    const { env } = base();
    await appel(env, 'kevin', 'POST', '/api/keys/device', { device_id: 'kevin-iphone-01', identity_key_pub: CLE + 'A', signing_key_pub: SIG + 'A' });
    await appel(env, 'kevin', 'POST', '/api/keys/device', { device_id: 'kevin-iphone-01', identity_key_pub: CLE + 'A' });
    expect((await appel(env, 'remy', 'GET', '/api/keys/kevin/devices')).j.devices[0].signing_key_pub).toBe(SIG + 'A');
  });
});

describe('v1.1.345 — un compte effacé emporte ses appareils (aucune clé orpheline)', () => {
  const nb = (DB, uid) => DB.raw.prepare('SELECT COUNT(*) c FROM user_devices WHERE user_id=?').get(uid).c;
  it('« supprimer mon compte » efface ses appareils, et l\'export RGPD les liste avant', async () => {
    const { DB, env } = base();
    await appel(env, 'remy', 'POST', '/api/keys/device', { device_id: 'remy-iphone-0001', identity_key_pub: CLE + 'R', label: 'iPhone' });
    expect(nb(DB, 'remy')).toBe(1);
    const exp = await worker.fetch(makeRequest({ method: 'GET', path: '/api/users/me/export', token: await tok('remy') }), env, CTX);
    expect((await exp.json()).devices.map((d) => d.device_id)).toEqual(['remy-iphone-0001']);
    const r = await worker.fetch(makeRequest({ method: 'DELETE', path: '/api/users/me', token: await tok('remy'), body: { confirm: 'SUPPRIMER' } }), env, CTX);
    expect(r.status).toBe(200);
    expect(nb(DB, 'remy')).toBe(0);
  });
  it('le nettoyage des comptes du robot de tests efface aussi leurs appareils', async () => {
    const { DB, env } = base();
    seedUser(DB, 'robot-e2e', { source: 'e2e-test' });
    await appel(env, 'robot-e2e', 'POST', '/api/keys/device', { device_id: 'robot-iphone-001', identity_key_pub: CLE + 'X' });
    expect(nb(DB, 'robot-e2e')).toBe(1);
    const r = await worker.fetch(makeRequest({ method: 'POST', path: '/api/test/cleanup', extraHeaders: { 'X-Test-Auth': 'admin-secret' } }), env, CTX);
    expect(r.status).toBe(200);
    expect(nb(DB, 'robot-e2e')).toBe(0);
  });
});
