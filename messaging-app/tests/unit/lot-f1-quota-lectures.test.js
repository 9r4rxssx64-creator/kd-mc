// @vitest-environment node
/**
 * Audit quota 16.10.2026 — trois requêtes relisaient des conversations ENTIÈRES (D1 gratuit :
 * 5 millions de lignes lues par jour pour tout le compte) :
 *  1. le nettoyage des DM vides faisait COUNT(*) sur les messages de chaque DM, toutes les 10 min ;
 *  2. chaque connexion cherchait les « clés de groupe » sans index (un DM n'en a aucune) ;
 *  3. le rattrapage des éditions/suppressions utilisait un OR qui force la relecture.
 * Mesuré ici sur un vrai SQLite : les plans utilisent les index fins.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanupEmptyConversations } from '../../workers/api-worker.js';
import { d1Reel } from './_support/d1-sqlite.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DO_SRC = readFileSync(join(ROOT, 'workers/durable-objects/ConversationDO.js'), 'utf8');
const plan = (db, sql, ...a) => db.prepare('EXPLAIN QUERY PLAN ' + sql).all(...a).map((r) => r.detail).join(' | ');

describe('lectures D1 : jamais une conversation entière', () => {
  it('le nettoyage des DM vides ne compte plus les messages (EXISTS s\'arrête au premier)', async () => {
    const DB = d1Reel();
    const vus = [];
    const espion = { prepare: (sql) => { vus.push(sql); return DB.prepare(sql); } };
    await cleanupEmptyConversations(espion);
    const sql = vus.join('\n');
    expect(sql).toMatch(/EXISTS\(SELECT 1 FROM messages/);
    expect(sql).not.toMatch(/COUNT\(\*\) FROM messages/);
  });

  it('le nettoyage garde toujours un DM qui porte un message', async () => {
    const DB = d1Reel();
    DB.raw.exec(`INSERT INTO conversations (id,type,created_by,created_at,sharded_to_do) VALUES ('d1','dm','u',1,0),('d2','dm','u',1,0)`);
    DB.raw.exec(`INSERT INTO messages (id,conv_id,sender_id,ciphertext,ts) VALUES ('m','d1','u','x',1)`);
    const n = await cleanupEmptyConversations(DB);
    expect(n).toBe(1);
    expect(DB.raw.prepare("SELECT id FROM conversations WHERE id IN ('d1','d2')").all().map((r) => r.id)).toEqual(['d1']);
  });

  it('« clés de groupe » : index partiel, la valeur est écrite en dur dans la requête', () => {
    const DB = d1Reel();
    expect(DO_SRC).toMatch(/"mime='" \+ m \+ "'"/);
    const p = plan(DB.raw, "SELECT id FROM messages WHERE conv_id=? AND ts >= ? AND (mime='application/x-apex-grpkey') ORDER BY ts DESC LIMIT 50", 'c', 0);
    expect(p).toContain('idx_msgs_grpkey');
  });

  it('rattrapage : deux requêtes, chacune sur son index fin (plus de OR)', () => {
    const DB = d1Reel();
    expect(DO_SRC).not.toMatch(/edited_at > \? OR deleted_at > \?/);
    expect(DO_SRC).toContain('INDEXED BY idx_msgs_conv_edited');
    expect(DO_SRC).toContain('INDEXED BY idx_msgs_conv_deleted');
    expect(plan(DB.raw, 'SELECT id FROM messages INDEXED BY idx_msgs_conv_edited WHERE conv_id=? AND ts >= ? AND edited_at > ? ORDER BY ts ASC LIMIT 5', 'c', 0, 0)).toContain('idx_msgs_conv_edited (conv_id=? AND edited_at>?)');
    expect(plan(DB.raw, 'SELECT id FROM messages INDEXED BY idx_msgs_conv_deleted WHERE conv_id=? AND ts >= ? AND deleted_at > ? ORDER BY ts ASC LIMIT 5', 'c', 0, 0)).toContain('idx_msgs_conv_deleted (conv_id=? AND deleted_at>?)');
  });
});
