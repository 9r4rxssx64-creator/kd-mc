// @vitest-environment node
/**
 * 19.11 (cloud-installer 2813, quotas gratuits D1) : deux requêtes d'Apex Chat lisaient TOUTE la table des comptes à chaque appel
 * (494 lignes × 936 appels, 522 lignes × 856 appels en 7 jours). Sur le VRAI schéma (node:sqlite, toutes les migrations), le plan de chaque
 * requête doit passer par un index (jamais « SCAN users »), et le résultat doit rester le même qu'avant.
 */
import { describe, it, expect } from 'vitest';
import { SQL_COMPTES_E2E, SQL_PUBLIC_USER_PAR_ID, SQL_PUBLIC_USER_PAR_PSEUDO } from '../../workers/api-worker.js';
import { d1Reel } from './_support/d1-sqlite.js';

const plan = (db, sql) => db.raw.prepare('EXPLAIN QUERY PLAN ' + sql.replace(/\?/g, "'x'")).all().map((r) => r.detail).join(' | ');

describe('plans de requête : jamais de balayage de la table des comptes', () => {
  const db = d1Reel();
  it('nettoyage des comptes de test : trois recherches par index', () => {
    const p = plan(db, SQL_COMPTES_E2E);
    expect(p).not.toMatch(/SCAN users/);
    expect(p).toMatch(/idx_users_source/);
  });
  it('profil public par identifiant : clé primaire', () => {
    expect(plan(db, SQL_PUBLIC_USER_PAR_ID)).toMatch(/SEARCH users USING INDEX/);
  });
  it('profil public par pseudo : index du pseudo', () => {
    const p = plan(db, SQL_PUBLIC_USER_PAR_PSEUDO);
    expect(p).toMatch(/SEARCH users USING INDEX/);
    expect(p).not.toMatch(/SCAN users/);
  });
});

describe('mêmes résultats qu\'avant', () => {
  const ligne = (db, id, pseudo, phone, source, status = 'active') => db.raw.prepare(
    "INSERT INTO users (id, pseudo, real_name, phone, phone_hash, created_at, identity_key_pub, pq_key_pub, prekey_signed, source, status) VALUES (?,?,?,?,?,?,?,?,?,?,?)"
  ).run(id, pseudo, pseudo, phone, 'h' + id, 1, 'a', 'b', 'c', source, status);
  it('le nettoyage retrouve exactement les comptes de test, aucun autre', () => {
    const db = d1Reel();
    ligne(db, 'a', 'alice', '+33600000091', 'e2e-test');
    ligne(db, 'b', 'bob', '+33600000092', null);
    ligne(db, 'c', 'ghost', 'deleted_123_e2e_x', null, 'deleted');
    ligne(db, 'd', 'robot', 'tel-robot', 'e2e-test');
    ligne(db, 'e', 'vraie', 'tel-vraie', 'apex-chat-direct');
    ligne(db, 'f', 'supprimee', 'deleted_999_vraie', null, 'deleted');
    const ids = db.raw.prepare(SQL_COMPTES_E2E).all().map((r) => r.id).sort();
    expect(ids).toEqual(['a', 'b', 'c', 'd']);
  });
  it('le profil public se trouve par identifiant ou par pseudo (majuscules ignorées), pas si supprimé', () => {
    const db = d1Reel();
    ligne(db, 'u1', 'Marie', 'tel-marie', 'apex-chat-direct');
    ligne(db, 'u2', 'Suppr', 'tel-suppr', 'apex-chat-direct', 'deleted');
    expect(db.raw.prepare(SQL_PUBLIC_USER_PAR_ID).get('u1', 'active').pseudo).toBe('Marie');
    expect(db.raw.prepare(SQL_PUBLIC_USER_PAR_PSEUDO).get('marie', 'active').id).toBe('u1');
    expect(db.raw.prepare(SQL_PUBLIC_USER_PAR_PSEUDO).get('suppr', 'active')).toBeUndefined();
  });
});
