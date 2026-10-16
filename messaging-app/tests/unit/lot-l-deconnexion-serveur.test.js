// @vitest-environment node
/**
 * « Te déconnecter » coupe CE jeton côté serveur (audit 16.10.2026) : un jeton copié ailleurs ne marche plus,
 * les autres appareils du même compte continuent. Prouvé sur le vrai schéma SQLite.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker, { handleLogout, signJWT } from '../../workers/api-worker.js';
import { ENV, makeJWT, makeRequest } from './api-worker-helpers.js';
import { d1Reel } from './_support/d1-sqlite.js';

const CTX = { waitUntil() {} };
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
function setup() {
  const DB = d1Reel();
  DB.raw.prepare(`INSERT INTO users (id,pseudo,real_name,phone,phone_hash,created_at,identity_key_pub,pq_key_pub,prekey_signed,status) VALUES ('u1','p','n','+33600000001','h',1,'k','k','k','active')`).run();
  return { DB, env: ENV({ APEX_CHAT_DB: DB }) };
}
const me = (env, token) => worker.fetch(makeRequest({ path: '/api/users/me', token }), env, CTX);
const logout = (env, token) => worker.fetch(new Request('https://api.apex/api/auth/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + token } }), env, CTX);

describe('déconnexion côté serveur', () => {
  it('le jeton déconnecté est refusé, un autre jeton du même compte reste valable', async () => {
    const { env } = setup();
    const t1 = await makeJWT({ sub: 'u1', iat: Math.floor(Date.now() / 1000) - 20 });
    const t2 = await makeJWT({ sub: 'u1', iat: Math.floor(Date.now() / 1000) - 10 });
    expect((await me(env, t1)).status).toBe(200);
    expect((await logout(env, t1)).status).toBe(200);
    expect((await me(env, t1)).status).toBe(401);
    expect((await me(env, t2)).status).toBe(200);
  });
  it('idempotent, et sans jeton ou avec un jeton invalide : répond ok sans rien écrire', async () => {
    const { DB, env } = setup();
    const t = await makeJWT({ sub: 'u1', iat: Math.floor(Date.now() / 1000) - 5 });
    await logout(env, t); await logout(env, t);
    expect(DB.raw.prepare('SELECT COUNT(*) AS n FROM revoked_tokens').get().n).toBe(1);
    expect((await handleLogout(new Request('https://x/api/auth/logout', { method: 'POST' }), env)).status).toBe(200);
    expect((await logout(env, 'pas.un.jeton')).status).toBe(200);
    expect(DB.raw.prepare('SELECT COUNT(*) AS n FROM revoked_tokens').get().n).toBe(1);
  });
  it('un jeton TYPÉ (ticket) ne s\'enregistre pas comme session', async () => {
    const { DB, env } = setup();
    const tk = await makeJWT({ sub: 'u1', typ: 'wsticket', iat: Math.floor(Date.now() / 1000) - 5 });
    await logout(env, tk);
    expect(DB.raw.prepare('SELECT COUNT(*) AS n FROM revoked_tokens').get().n).toBe(0);
  });
  it('base d\'écriture en panne : 503 honnête (le client se déconnecte quand même)', async () => {
    const { DB, env } = setup();
    const prep = DB.prepare;
    DB.prepare = (sql) => (sql.includes('INSERT OR IGNORE INTO revoked_tokens') ? { bind: () => ({ run: async () => { throw new Error('D1'); } }) } : prep(sql));
    const t = await makeJWT({ sub: 'u1', iat: Math.floor(Date.now() / 1000) - 5 });
    expect((await logout(env, t)).status).toBe(503);
  });
  it('table pas encore migrée : on ne coupe personne (fenêtre de déploiement)', async () => {
    const { DB, env } = setup();
    DB.raw.exec('DROP TABLE revoked_tokens');
    const t = await makeJWT({ sub: 'u1', iat: Math.floor(Date.now() / 1000) - 5 });
    expect((await me(env, t)).status).toBe(200);
  });
  it('le cron de 03:00 purge les lignes expirées seulement', async () => {
    const { DB, env } = setup();
    DB.raw.prepare('INSERT INTO revoked_tokens (token_hash, exp) VALUES (?, ?)').run('vieux', Date.now() - 1000);
    DB.raw.prepare('INSERT INTO revoked_tokens (token_hash, exp) VALUES (?, ?)').run('frais', Date.now() + 86400000);
    await worker.scheduled({ cron: '0 3 * * *' }, ENV({ APEX_CHAT_DB: DB, BACKUP_ENCRYPTION_KEY: undefined }), CTX);
    expect(DB.raw.prepare('SELECT token_hash FROM revoked_tokens').all().map((r) => r.token_hash)).toEqual(['frais']);
  });
  it('le bouton « Te déconnecter » prévient le serveur', () => {
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
    const i = html.indexOf('K.logout = function(){');
    expect(html.slice(i, i + 900)).toContain("'/api/auth/logout'");
  });

  it('deux connexions du MÊME compte dans la MÊME seconde donnent deux jetons différents ; en déconnecter un laisse l\'autre', async () => {
    const { env } = setup();
    const iat = Math.floor(Date.now() / 1000) - 5;
    const a = await signJWT({ sub: 'u1', iat, exp: iat + 3600 }, env.JWT_SIGN_KEY);
    const b = await signJWT({ sub: 'u1', iat, exp: iat + 3600 }, env.JWT_SIGN_KEY);
    expect(a).not.toBe(b);
    expect((await logout(env, a)).status).toBe(200);
    expect((await me(env, a)).status).toBe(401);
    expect((await me(env, b)).status).toBe(200);
  });
  it('les jetons TYPÉS (ticket, média, invitation) n\'ont pas d\'identifiant : ils restent identiques et courts', async () => {
    const { env } = setup();
    const iat = Math.floor(Date.now() / 1000);
    const x = await signJWT({ sub: 'u1', typ: 'mtkt', iat, exp: iat + 300 }, env.JWT_SIGN_KEY);
    const y = await signJWT({ sub: 'u1', typ: 'mtkt', iat, exp: iat + 300 }, env.JWT_SIGN_KEY);
    expect(x).toBe(y);
  });
});
