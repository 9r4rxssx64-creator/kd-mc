// @vitest-environment node
/**
 * v1.1.298 (09.10.2026) — la clé publique de signature de groupe (« GSIG1:… ») a SA colonne
 * (users.signing_key_pub, migration 0013) au lieu d'occuper prekey_signed, réservé au futur PQXDH.
 * Vrai SQLite aux vraies migrations.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker from '../../workers/api-worker.js';
import { ENV, makeJWT, makeRequest } from './api-worker-helpers.js';
import { d1Reel } from './_support/d1-sqlite.js';
import { readFileSync } from 'node:fs';

const CTX = { waitUntil() {} };
beforeEach(() => { vi.restoreAllMocks(); globalThis.fetch = vi.fn(async () => new Response('{}')); });

let n = 0;
function setup() {
  const DB = d1Reel();
  for (const id of ['alice', 'bob']) {
    n++;
    DB.raw.prepare(`INSERT INTO users (id,pseudo,real_name,phone,phone_hash,created_at,identity_key_pub,pq_key_pub,prekey_signed,status)
      VALUES (?,?,?,?,?,1,'k','k','k','active')`).run(id, 'p_' + id, 'Nom ' + id, '+3366' + String(1000000 + n), 'h_' + id);
  }
  return { DB, env: ENV({ APEX_CHAT_DB: DB }) };
}
const call = async (env, method, path, sub, body) =>
  worker.fetch(makeRequest({ method, path, body, token: await makeJWT({ sub, iat: Math.floor(Date.now() / 1000) - 5 }) }), env, CTX);
const colonne = (DB, id) => DB.raw.prepare('SELECT signing_key_pub, prekey_signed FROM users WHERE id=?').get(id);
const IDK = 'idk-publique-assez-longue';
const SIG = 'GSIG1:BEx9fQ1pR2s3T4u5V6w7X8y9Z0aBcDeF+/=';

describe('clé de signature de groupe : sa propre colonne', () => {
  it('publiée → rangée dans signing_key_pub, et relue dans le bundle du contact', async () => {
    const { DB, env } = setup();
    const r = await call(env, 'POST', '/api/keys/prekeys', 'alice', { identity_key_pub: IDK, signing_key_pub: SIG });
    expect(r.status).toBe(200);
    expect(colonne(DB, 'alice').signing_key_pub).toBe(SIG);
    expect(colonne(DB, 'alice').prekey_signed).toBe('k');   // pas touché quand on ne l'envoie pas
    const b = await (await call(env, 'GET', '/api/keys/alice/bundle', 'bob')).json();
    expect(b.bundle.signing_key_pub).toBe(SIG);
  });

  it('format refusé (pas « GSIG1: », trop long, caractères interdits) → rien n\'est stocké', async () => {
    const { DB, env } = setup();
    for (const bad of ['PQXDH:abc', 'GSIG1:' + 'A'.repeat(400), 'GSIG1:<script>', 42]) {
      const r = await call(env, 'POST', '/api/keys/prekeys', 'alice', { identity_key_pub: IDK, signing_key_pub: bad });
      expect(r.status).toBe(200);   // la clé d'identité reste publiée
      expect(colonne(DB, 'alice').signing_key_pub, String(bad).slice(0, 20)).toBeNull();
    }
    const b = await (await call(env, 'GET', '/api/keys/alice/bundle', 'bob')).json();
    expect(b.bundle.signing_key_pub).toBeNull();
  });

  it('colonne absente (base pas encore migrée) → la publication et le bundle marchent quand même', async () => {
    const { DB, env } = setup();
    DB.raw.exec('ALTER TABLE users DROP COLUMN signing_key_pub');
    const r = await call(env, 'POST', '/api/keys/prekeys', 'alice', { identity_key_pub: IDK, signing_key_pub: SIG });
    expect(r.status).toBe(200);
    const b = await (await call(env, 'GET', '/api/keys/alice/bundle', 'bob'));
    expect(b.status).toBe(200);
    expect((await b.json()).bundle.signing_key_pub).toBeNull();
  });

  it('v1.1.299 : une clé « GSIG1: » envoyée dans prekey_signed est ignorée (champ réservé à PQXDH)', async () => {
    const { DB, env } = setup();
    const r = await call(env, 'POST', '/api/keys/prekeys', 'alice', { identity_key_pub: IDK, prekey_signed: SIG });
    expect(r.status).toBe(200);
    expect(colonne(DB, 'alice').prekey_signed).toBe('k');
  });

  it('migration 0014 : une ancienne clé rangée dans prekey_signed passe dans signing_key_pub ; prekey_signed est libéré', async () => {
    const { DB } = setup();
    DB.raw.prepare("UPDATE users SET prekey_signed=?, signing_key_pub=NULL WHERE id='alice'").run(SIG);
    DB.raw.prepare("UPDATE users SET prekey_signed=?, signing_key_pub=? WHERE id='bob'").run('GSIG1:ancienne', 'GSIG1:nouvelle');
    const sql = readFileSync(new URL('../../d1-migrations/0014_prekey_signed_libere.sql', import.meta.url), 'utf8');
    DB.raw.exec(sql);
    DB.raw.exec(sql);   // rejouable sans effet
    expect(colonne(DB, 'alice')).toEqual({ signing_key_pub: SIG, prekey_signed: 'PENDING_PQXDH' });
    expect(colonne(DB, 'bob')).toEqual({ signing_key_pub: 'GSIG1:nouvelle', prekey_signed: 'PENDING_PQXDH' });   // la colonne déjà remplie gagne
  });
});
