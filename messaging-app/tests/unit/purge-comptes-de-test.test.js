// @vitest-environment node
/**
 * Pont 1033 (25.10.2026) : 25 lignes « temps-reel… » restaient en prod. La purge de nuit ne touche QUE les comptes de test
 * des robots venus du domaine, vieux de plus d'une heure, jamais un admin ni une vraie personne.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { purgeComptesDeTest } from '../../workers/api-worker.js';
import { d1Reel } from './_support/d1-sqlite.js';

const H = 3600000;
function ligne(DB, uid, extra = {}) {
  const now = extra.now;
  DB.raw.prepare("INSERT INTO users (id,phone,phone_hash,pseudo,real_name,identity_key_pub,pq_key_pub,prekey_signed,kdmc_uid,source,status,is_admin,created_at) VALUES (?,?,?,?,?,'k','q','s',?,?,?,?,?)")
    .run(extra.id || 'kdmc_' + uid, 'p_' + uid, 'h_' + uid, uid, uid, uid, extra.source || 'kdmc-sso', 'active', extra.admin ? 1 : 0, now - (extra.age ?? 5 * H));
}
describe('purge des comptes de test des robots', () => {
  it('supprime les robots anciens, garde les vrais, les admins, les récents', async () => {
    const DB = d1Reel(); const now = Date.now();
    ligne(DB, 'temps-reelabcde', { now });
    ligne(DB, 'parcours-robotxyz', { now });
    ligne(DB, 'temps-reelrecent', { now, age: 60000 });
    ligne(DB, 'laurence-saint-polit', { now });
    ligne(DB, 'temps-reeladmin', { now, admin: true });
    const out = await purgeComptesDeTest({ APEX_CHAT_DB: DB }, now);
    expect(out.comptes_de_test).toBe(2);
    const reste = Object.fromEntries(DB.raw.prepare('SELECT pseudo,status FROM users').all().map((r) => [r.pseudo, r.status]));
    expect(reste['temps-reelabcde']).toBe('deleted');
    expect(reste['parcours-robotxyz']).toBe('deleted');
    expect(reste['temps-reelrecent']).toBe('active');
    expect(reste['laurence-saint-polit']).toBe('active');
    expect(reste['temps-reeladmin']).toBe('active');
  });
  it('le travail de 03:00 l\'appelle', () => {
    const src = readFileSync(new URL('../../workers/api-worker.js', import.meta.url).pathname, 'utf8');
    expect(src).toMatch(/await purgeComptesDeTest\(env\);/);
  });
});
