// @vitest-environment node
/**
 * Lot E1 (audit A5 F9 + F11) — quotas gratuits D1 / KV, sur le VRAI schéma (node:sqlite, toutes les migrations).
 *
 * 1) Verrou des « soins » de la liste de conversations : D1 (heal_locks) au lieu de KV. KV gratuit = 1 000
 *    écritures/jour pour TOUT le compte kd-mc ; avant, 2 écritures toutes les 10 min par personne active, et
 *    une panne KV relançait les soins (≥ 18 requêtes D1) à CHAQUE appel.
 * 2) Index : doublons supprimés (chaque index = 1 ligne écrite de plus par INSERT), parcours complets de
 *    `messages` par expéditeur / expiration couverts.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker, { _healDue, HEAL_EVERY_MS } from '../../workers/api-worker.js';
import { ENV, makeJWT, makeRequest, makeKV } from './api-worker-helpers.js';
import { d1Reel } from './_support/d1-sqlite.js';

const MIG = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'd1-migrations');
const CTX = { waitUntil() {} };
beforeEach(() => { vi.restoreAllMocks(); globalThis.fetch = vi.fn(async () => new Response('{}')); });

const lockRow = (db, key) => db.raw.prepare('SELECT ts FROM heal_locks WHERE key=?').get(key);

describe('Lot E1 — verrou des soins en D1 (heal_locks)', () => {
  it('pris une fois par fenêtre de 10 min ; un verrou encore valide ne coûte AUCUNE écriture', async () => {
    const db = d1Reel();
    const env = { APEX_CHAT_DB: db };
    const t0 = 1_800_000_000_000;
    expect(await _healDue(env, 'k1', t0)).toBe(true);
    expect(lockRow(db, 'k1')).toEqual({ ts: t0 });
    // même isolate : le mémo répond sans même lire D1
    const spy = vi.spyOn(db, 'prepare');
    expect(await _healDue(env, 'k1', t0 + 1000)).toBe(false);
    expect(spy).not.toHaveBeenCalled();
    // autre isolate (autre objet base, même données) : D1 refuse, la ligne n'est pas réécrite
    const other = { APEX_CHAT_DB: { ...db, prepare: db.prepare } };
    const before = db.raw.prepare('SELECT total_changes() c').get().c;
    expect(await _healDue(other, 'k1', t0 + 5 * 60000)).toBe(false);
    expect(db.raw.prepare('SELECT total_changes() c').get().c).toBe(before);
    expect(lockRow(db, 'k1')).toEqual({ ts: t0 });
    // après 10 min : de nouveau dû, une seule fois
    expect(await _healDue(other, 'k1', t0 + HEAL_EVERY_MS)).toBe(true);
    expect(await _healDue(env, 'k1', t0 + HEAL_EVERY_MS + 1)).toBe(false);
    expect(lockRow(db, 'k1')).toEqual({ ts: t0 + HEAL_EVERY_MS });
  });

  it('pas dû : redemandé à D1 seulement après 1 min (mémo court), clés indépendantes', async () => {
    const db = d1Reel();
    const a = { APEX_CHAT_DB: db };
    const b = { APEX_CHAT_DB: { ...db, prepare: db.prepare } };
    const t0 = 1_800_000_100_000;
    expect(await _healDue(a, 'g', t0)).toBe(true);
    expect(await _healDue(a, 'u:alice', t0)).toBe(true);
    expect(await _healDue(b, 'g', t0 + 1000)).toBe(false);
    const spy = vi.spyOn(b.APEX_CHAT_DB, 'prepare');
    expect(await _healDue(b, 'g', t0 + 30000)).toBe(false);
    expect(spy).not.toHaveBeenCalled();
    expect(await _healDue(b, 'g', t0 + 62000)).toBe(false);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('D1 en panne ou table absente : PAS de soins, et pas de nouvel essai avant 10 min (jamais à chaque appel)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const db = { prepare: vi.fn(() => { throw new Error('D1 indisponible'); }) };
    const env = { APEX_CHAT_DB: db };
    const t0 = 1_800_000_200_000;
    expect(await _healDue(env, 'k', t0)).toBe(false);
    for (let i = 1; i <= 20; i++) expect(await _healDue(env, 'k', t0 + i * 20000)).toBe(false);
    expect(db.prepare).toHaveBeenCalledTimes(1);
    expect(await _healDue(env, 'k', t0 + HEAL_EVERY_MS + 1)).toBe(false);
    expect(db.prepare).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalled();
    // base sans la migration 0020 (fenêtre de déploiement) : même règle
    const bare = { APEX_CHAT_DB: { prepare: () => ({ bind: () => ({ run: async () => { throw new Error('no such table: heal_locks'); } }) }) } };
    expect(await _healDue(bare, 'k', t0)).toBe(false);
    expect(await _healDue({}, 'k', t0)).toBe(false);
  });

  it('faux D1 sans compteur de lignes (anciens tests) : comportement d\'avant (soins dus)', async () => {
    const env = { APEX_CHAT_DB: { prepare: () => ({ bind: () => ({ run: async () => ({ success: true }) }) }) } };
    expect(await _healDue(env, 'k', 1)).toBe(true);
    expect(await _healDue(env, 'k', 2)).toBe(true);
  });

  it('GET /api/conversations : soins faits, verrous en D1, ZÉRO lecture/écriture KV ; KV en panne sans effet', async () => {
    const DB = d1Reel();
    DB.raw.prepare(`INSERT INTO users (id,pseudo,real_name,phone,phone_hash,created_at,identity_key_pub,pq_key_pub,prekey_signed,status,is_admin,last_seen,source)
      VALUES ('marie','marie_d','Marie Dupont','+33612000000','h1',1,'k','k','k','active',0,?,NULL),
             ('marie_brouillon','mariedupont','Marie Dupont','PENDING_X','h2',1,'k','k','k','active',0,NULL,'core_pair')`).run(Date.now());
    const KV = makeKV();
    KV.get.mockRejectedValue(new Error('KV en panne'));
    KV.put.mockRejectedValue(new Error('KV quota'));
    const env = ENV({ APEX_CHAT_DB: DB, APEX_CHAT_KV: KV });
    const call = async () => worker.fetch(makeRequest({ method: 'GET', path: '/api/conversations', token: await makeJWT({ sub: 'marie' }) }), env, CTX);
    expect((await call()).status).toBe(200);
    expect(DB.raw.prepare("SELECT status, merged_into FROM users WHERE id='marie_brouillon'").get()).toEqual({ status: 'deleted', merged_into: 'marie' });
    expect(lockRow(DB, 'heal:convlist:u:marie')).toBeTruthy();
    expect(lockRow(DB, 'heal:convlist')).toBeTruthy();
    // 2e appel juste après : pas de soins (verrou), toujours aucun accès KV pour les verrous
    DB.raw.prepare("UPDATE users SET status='active', merged_into=NULL WHERE id='marie_brouillon'").run();
    expect((await call()).status).toBe(200);
    expect(DB.raw.prepare("SELECT status FROM users WHERE id='marie_brouillon'").get().status).toBe('active');
    const healKv = [...KV.get.mock.calls, ...KV.put.mock.calls].filter(([k]) => String(k).startsWith('heal:'));
    expect(healKv).toEqual([]);
  });
});

describe('Lot E1 — index (migration 0020, idempotente)', () => {
  const indexes = (db) => db.raw.prepare("SELECT name, tbl_name, sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL").all();
  /** Signature d'un index : table + colonnes + clause partielle (deux index de même signature = doublon). */
  const sig = (sql) => sql.replace(/^CREATE\s+(UNIQUE\s+)?INDEX\s+(IF NOT EXISTS\s+)?\w+\s+/i, '').replace(/\s+/g, ' ').trim().toLowerCase();

  it('plus aucun index en double dans le schéma final', () => {
    const db = d1Reel();
    const seen = new Map();
    for (const ix of indexes(db)) {
      const s = sig(ix.sql);
      expect(seen.has(s), `doublon : ${ix.name} = ${seen.get(s)} (${s})`).toBe(false);
      seen.set(s, ix.name);
    }
    const names = indexes(db).map((i) => i.name);
    expect(names).toContain('idx_activity_user_ts');
    expect(names).toContain('idx_audit_actor_ts');
    expect(names).not.toContain('idx_activity_user_ts2');
    expect(names).not.toContain('idx_audit_actor_ts2');
  });

  it('base de PRODUCTION (doublons déjà créés par l\'ancienne 0003) : 0020 les supprime', () => {
    const db = d1Reel();
    db.raw.exec('CREATE INDEX IF NOT EXISTS idx_activity_user_ts2 ON user_activity(user_id, ts DESC);');
    db.raw.exec('CREATE INDEX IF NOT EXISTS idx_audit_actor_ts2 ON audit_log(actor_id, ts DESC);');
    db.raw.exec(readFileSync(join(MIG, '0020_lot_e1_index.sql'), 'utf8'));
    const names = indexes(db).map((i) => i.name);
    expect(names).not.toContain('idx_activity_user_ts2');
    expect(names).not.toContain('idx_audit_actor_ts2');
    expect(names).toEqual(expect.arrayContaining(['idx_activity_user_ts', 'idx_audit_actor_ts']));
  });

  it('les requêtes par expéditeur et la purge des éphémères utilisent un index (plus de parcours complet)', () => {
    const db = d1Reel();
    const plan = (sql, ...a) => db.raw.prepare('EXPLAIN QUERY PLAN ' + sql).all(...a).map((r) => r.detail).join(' | ');
    for (const sql of [
      'SELECT COUNT(*) c FROM messages WHERE sender_id=?',
      'SELECT id, conv_id, ciphertext, mime, ts, edited_at, deleted_at FROM messages WHERE sender_id=? ORDER BY ts LIMIT 100000',
      "UPDATE messages SET ciphertext='', deleted_at=? WHERE sender_id=? AND deleted_at IS NULL",
      'SELECT id FROM messages WHERE sender_id=? AND ts BETWEEN ? AND ? ORDER BY ts ASC LIMIT 50',
    ]) {
      const p = plan(sql, ...Array((sql.match(/\?/g) || []).length).fill(1));
      expect(p, sql).toMatch(/idx_msgs_sender_ts/);
      expect(p, sql).not.toMatch(/SCAN messages(?! USING)/);
    }
    const purge = plan('DELETE FROM messages WHERE expires_at IS NOT NULL AND expires_at < ?', 1);
    expect(purge).toMatch(/idx_msgs_expires/);
  });

  it('0020 est rejouable (déploiement : tous les fichiers à chaque fois) et ne contient aucun ALTER', () => {
    const sql = readFileSync(join(MIG, '0020_lot_e1_index.sql'), 'utf8');
    expect(sql.replace(/--.*$/gm, '')).not.toMatch(/\bALTER\b/i);
    const db = d1Reel();
    expect(() => { db.raw.exec(sql); db.raw.exec(sql); }).not.toThrow();
    // et 0003, rejouée à chaque déploiement, ne recrée plus les doublons
    expect(readFileSync(join(MIG, '0003_finalize.sql'), 'utf8')).not.toMatch(/CREATE INDEX[^;]*_ts2/);
  });
});
