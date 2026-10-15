// @vitest-environment node
/**
 * Lot E2 (audit A5, F3) — la sauvegarde se RESTAURE, avec une clé que Kevin possède.
 *
 * Aller-retour complet sur une VRAIE base SQLite construite par TOUTES les migrations :
 *   base peuplée (toutes formes de valeurs : accents, apostrophes, NULL, BLOB, gros messages)
 *   → cron 03:00 → étapes « backup-step » consommées par le VRAI consommateur de file du worker
 *   → fichiers R2 → tools/backup-restore.mjs → nouvelle base → contenu IDENTIQUE, table par table.
 * Plus : clé dédiée (BACKUP_ENCRYPTION_KEY) et repli annoncé, pages bornées (CPU du plan
 * gratuit), page manquante / échangée / mauvaise clé refusées, ancien format v1 relu,
 * fichier SQL pour D1, rotation 14 jours, plafond par table, nouvel essai d'une étape ratée.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import worker from '../../workers/api-worker.js';
import {
  performDailyBackup, handleBackupStep, decryptBlob, encryptBackup, backupSecret, partKey, manifestKey,
  BACKUP_PAGE_ROWS, BACKUP_PAGE_BYTES, BACKUP_ROW_LIMIT, BACKUP_STEP_TRIES, encodeValue,
} from '../../workers/lib/backup.js';
import { restaurerSqlite, ecrireSql, lireManifeste, pagesAttendues, litteral, decodeValue } from '../../tools/backup-restore.mjs';
import { d1Reel } from './_support/d1-sqlite.js';

const BK = 'cle-de-sauvegarde-de-kevin';
const JWT = 'secret-jwt-du-worker';
const NOW = new Date('2026-10-15T03:00:00Z');
const DATE = '2026-10-15';

beforeEach(() => { vi.restoreAllMocks(); globalThis.fetch = vi.fn(async () => new Response('{}')); });

/** R2 en mémoire, avec `list` paginé par curseur comme le vrai (pageSize petit = on teste la pagination). */
function r2(pageSize = 1000) {
  const store = new Map();
  return {
    store,
    put: vi.fn(async (k, v) => { store.set(k, String(v)); return { key: k, size: String(v).length }; }),
    get: vi.fn(async (k) => (store.has(k) ? { text: async () => store.get(k) } : null)),
    list: vi.fn(async ({ prefix = '', cursor } = {}) => {
      const all = [...store.keys()].filter((k) => k.startsWith(prefix)).sort();
      const start = cursor ? Number(cursor) : 0;
      const next = start + pageSize;
      return { objects: all.slice(start, next).map((key) => ({ key })), truncated: next < all.length, cursor: next < all.length ? String(next) : undefined };
    }),
    delete: vi.fn(async (k) => { for (const x of [].concat(k)) store.delete(x); }),
  };
}
function file() {
  const sent = [];
  return { _sent: sent, send: vi.fn(async (msg, opts) => { sent.push(opts ? { ...msg, _opts: opts } : msg); }) };
}
const queueMsg = (body) => ({ body, ack: vi.fn(), retry: vi.fn() });

/** Une base réaliste : 12 comptes, 6 conversations, ~900 messages (dont de gros), BLOB, NULL, accents. */
function peupler(DB, { messages = 900, gros = 6 } = {}) {
  const db = DB.raw;
  const u = db.prepare(`INSERT INTO users (id,pseudo,real_name,phone,phone_hash,created_at,identity_key_pub,pq_key_pub,prekey_signed,status,bio)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
  for (let i = 0; i < 12; i++) {
    u.run('u' + i, 'pseudo_' + i, i % 3 === 0 ? "Zoé d'Arc « l'aînée » " + i : 'Nom ' + i, '+3360000' + String(1000 + i), 'h' + i, 1700000000000 + i,
      'ik' + i, 'pq' + i, 'pk' + i, 'active', i % 2 ? null : 'bio ☕ ' + '😀'.repeat(i));
  }
  const c = db.prepare(`INSERT INTO conversations (id,type,name,created_by,created_at,sharded_to_do,member_count,pinned_for) VALUES (?,?,?,?,?,?,?,?)`);
  const m = db.prepare(`INSERT INTO conversation_members (conv_id,user_id,role,joined_at) VALUES (?,?,?,?)`);
  for (let k = 0; k < 6; k++) {
    c.run('c' + k, k < 4 ? 'dm' : 'group', k < 4 ? null : 'Groupe "' + k + "\" l'été", 'u' + k, 1700000000000 + k, 'do_c' + k, 2, '[]');
    m.run('c' + k, 'u' + k, 'owner', 1); m.run('c' + k, 'u' + ((k + 1) % 12), 'member', 2);
  }
  const msg = db.prepare(`INSERT INTO messages (id,conv_id,sender_id,ciphertext,mime,ts,reply_to,reactions) VALUES (?,?,?,?,?,?,?,?)`);
  for (let i = 0; i < messages; i++) {
    const big = i < gros ? 'X'.repeat(90000 + i) : 'chiffré:' + i + ':' + "l'œuf « ' » \\ \n ;-- /* */".repeat(1 + (i % 5));
    msg.run('m' + String(i).padStart(5, '0'), 'c' + (i % 6), 'u' + (i % 12), big, i % 7 ? 'text/plain' : null, 1700000001000 + i, i % 11 ? null : 'm00000', '{}');
  }
  // un VRAI blob (octets, y compris 0x00 et 0xFF) dans une colonne BLOB
  db.prepare(`INSERT INTO voice_prints (user_id, mfcc_avg_enc, last_updated, enrollment_count) VALUES (?,?,?,?)`)
    .run('u1', new Uint8Array([0, 1, 2, 250, 255, 0, 39, 34]), 1700000000000, 3);
  // table à clé AUTOINCREMENT (les identifiants doivent revenir à l'identique)
  const a = db.prepare(`INSERT INTO user_activity (user_id, ts, action) VALUES (?,?,?)`);
  // horodatages RÉCENTS : le cron de 03:00 purge l'activité de plus de 30 jours avant de sauvegarder
  for (let i = 0; i < 40; i++) a.run('u' + (i % 12), NOW.getTime() - 3600000 + i, 'heartbeat');
  db.prepare('DELETE FROM user_activity WHERE id IN (3, 17)').run();   // des trous dans les identifiants
  // table WITHOUT ROWID (heal_locks, lot E1) sur plus d'une page : pagination par décalage
  const sansRowid = db.prepare("SELECT sql FROM sqlite_master WHERE name='heal_locks'").get();
  expect(sansRowid && /WITHOUT ROWID/i.test(sansRowid.sql)).toBe(true);
  const h = db.prepare('INSERT INTO heal_locks (key, ts) VALUES (?, ?)');
  for (let i = 0; i < 230; i++) h.run('verrou:' + String(1000 - i), i);
}

/** Toutes les tables, tout le contenu, dans l'ordre physique. */
function contenu(db) {
  const out = {};
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((r) => r.name);
  for (const t of tables) {
    try { out[t] = db.prepare(`SELECT * FROM "${t}" ORDER BY rowid`).all().map((r) => ({ ...r })); } catch (_) {
      // table WITHOUT ROWID : ordre de la clé primaire (= ordre de parcours)
      out[t] = db.prepare(`SELECT * FROM "${t}"`).all().map((r) => ({ ...r }));
    }
  }
  return out;
}

function versDossier(store, date = DATE) {
  const dir = mkdtempSync(join(tmpdir(), 'apex-bk-'));
  const pre = `backups/d1-${date}/`;
  for (const [k, v] of store) if (k.startsWith(pre)) writeFileSync(join(dir, k.slice(pre.length)), v);
  return dir;
}

/** Cron 03:00 du VRAI worker, puis on vide la file à la main en passant par le VRAI consommateur. */
async function sauvegarderParLaFile(env) {
  const w = [];
  await worker.scheduled({ cron: '0 3 * * *' }, env, { waitUntil: (p) => w.push(p) });
  await Promise.all(w);
  let tours = 0;
  while (env.LETTERS_QUEUE._sent.some((b) => b.queue_type === 'backup-step')) {
    const i = env.LETTERS_QUEUE._sent.findIndex((b) => b.queue_type === 'backup-step');
    const [body] = env.LETTERS_QUEUE._sent.splice(i, 1);
    const msg = queueMsg(body);
    await worker.queue({ messages: [msg] }, env);
    expect(msg.ack).toHaveBeenCalled();
    if (++tours > 5000) throw new Error('boucle');
  }
  return tours;
}

describe('aller-retour sauvegarde → restauration sur une vraie base (toutes les migrations)', () => {
  it('cron → file → R2 → restauration : contenu IDENTIQUE table par table, pages bornées', async () => {
    const DB = d1Reel();
    peupler(DB);
    const avant = contenu(DB.raw);
    const env = { APEX_CHAT_DB: DB, APEX_CHAT_MEDIA: r2(7), LETTERS_QUEUE: file(), TELEMETRY_QUEUE: file(),
      BACKUP_ENCRYPTION_KEY: BK, JWT_SIGN_KEY: JWT };
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    let tours;
    try { tours = await sauvegarderParLaFile(env); } finally { vi.useRealTimers(); }
    // une étape = une page = une invocation : plusieurs pages pour les messages
    expect(tours).toBeGreaterThan(5);
    const keys = [...env.APEX_CHAT_MEDIA.store.keys()];
    expect(keys).toContain(manifestKey(DATE));
    for (const k of keys) expect(env.APEX_CHAT_MEDIA.store.get(k)).not.toMatch(/Zoé|pseudo_|chiffré:/);   // rien en clair
    // pages bornées : ≤ BACKUP_PAGE_ROWS lignes, ≤ BACKUP_PAGE_BYTES octets (sauf une ligne seule plus grosse)
    const pages = keys.filter((k) => /\/p\d{5}\.enc$/.test(k));
    for (const k of pages) {
      const p = await decryptBlob(env.APEX_CHAT_MEDIA.store.get(k), { bk: BK });
      expect(p.rows.length).toBeLessThanOrEqual(BACKUP_PAGE_ROWS);
      if (p.rows.length > 1) expect(JSON.stringify(p.rows).length).toBeLessThanOrEqual(BACKUP_PAGE_BYTES + 2);
    }
    const note = DB.raw.prepare("SELECT value FROM system_config WHERE key='backup_last_ok'").get();
    const info = JSON.parse(note.value);
    expect(info).toMatchObject({ date: DATE, kid: 'bk', parts: pages.length });
    expect(info.key_warning).toBeUndefined();

    const dir = versDossier(env.APEX_CHAT_MEDIA.store);
    try {
      const m = await lireManifeste(dir, { bk: BK });
      expect(pagesAttendues(m).sort()).toEqual(readdirSync(dir).filter((f) => f !== 'manifest.enc').sort());
      // 1) schéma tiré de la sauvegarde elle-même
      const db1 = new DatabaseSync(':memory:');
      const r1 = await restaurerSqlite({ source: dir, secrets: { bk: BK }, db: db1 });
      expect(r1.ecarts).toEqual([]);
      expect(r1.ok).toBe(true);
      expect(r1.schema).toBe('sauvegarde');
      const apres = contenu(db1);
      // les tables sauvegardées (d1_migrations exclue comme avant ; _migrations incluse)
      for (const t of Object.keys(m.tables)) expect(apres[t], t).toEqual(avant[t]);
      expect(apres.messages.length).toBe(900);
      expect(apres.heal_locks.length).toBe(230);
      expect(m.tables.heal_locks.last - m.tables.heal_locks.first).toBe(2);   // 3 pages
      expect(m.failed).toEqual([]);
      expect(apres.voice_prints[0].mfcc_avg_enc).toEqual(new Uint8Array([0, 1, 2, 250, 255, 0, 39, 34]));
      expect(apres.user_activity.map((r) => r.id)).toEqual(avant.user_activity.map((r) => r.id));
      // index et schéma recréés
      const idx = (db) => db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((r) => r.name);
      expect(idx(db1)).toEqual(idx(DB.raw));
      // 2) schéma tiré des migrations du dépôt (graines effacées : la sauvegarde fait foi)
      const db2 = new DatabaseSync(':memory:');
      const r2b = await restaurerSqlite({ source: dir, secrets: { bk: BK }, db: db2, schemaDepuisMigrations: true });
      expect(r2b.ok).toBe(true);
      const apres2 = contenu(db2);
      for (const t of Object.keys(m.tables)) if (t !== '_migrations') expect(apres2[t], t).toEqual(avant[t]);
      // 3) fichier SQL pour `wrangler d1 execute --file` : rejoué dans une base vide → même contenu
      const sql = join(dir, 'restore.sql');
      await ecrireSql({ source: dir, secrets: { bk: BK }, sortie: sql });
      const txt = readFileSync(sql, 'utf8');
      expect(txt).toMatch(/^-- Restauration Apex Chat 2026-10-15/);
      expect(txt).toContain("X'000102faff002722'");
      const db3 = new DatabaseSync(':memory:');
      db3.exec(txt);
      const apres3 = contenu(db3);
      for (const t of Object.keys(m.tables)) expect(apres3[t], t).toEqual(avant[t]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('page manquante, page d\'un autre jour, manifeste absent, mauvaise clé → restauration REFUSÉE', async () => {
    const DB = d1Reel(); peupler(DB, { messages: 450, gros: 0 });
    const R = r2();
    const res = await performDailyBackup({ APEX_CHAT_DB: DB, APEX_CHAT_MEDIA: R, BACKUP_ENCRYPTION_KEY: BK }, NOW);
    expect(res.ok).toBe(true);
    expect(res.parts).toBeGreaterThan(3);
    const autre = r2();
    await performDailyBackup({ APEX_CHAT_DB: DB, APEX_CHAT_MEDIA: autre, BACKUP_ENCRYPTION_KEY: BK }, new Date('2026-10-14T03:00:00Z'));
    const dir = versDossier(R.store);
    try {
      await expect(restaurerSqlite({ source: dir, secrets: { bk: 'pas-la-bonne' }, db: new DatabaseSync(':memory:') })).rejects.toThrow(/mauvais secret ou fichier altéré/);
      await expect(restaurerSqlite({ source: dir, secrets: { jwt: JWT }, db: new DatabaseSync(':memory:') })).rejects.toThrow(/BACKUP_ENCRYPTION_KEY : secret absent/);
      // page du 14 glissée à la place de celle du 15 (même numéro) → refus
      writeFileSync(join(dir, 'p00002.enc'), autre.store.get(partKey('2026-10-14', 2)));
      await expect(restaurerSqlite({ source: dir, secrets: { bk: BK }, db: new DatabaseSync(':memory:') })).rejects.toThrow(/incohérente/);
      rmSync(join(dir, 'p00002.enc'));
      await expect(restaurerSqlite({ source: dir, secrets: { bk: BK }, db: new DatabaseSync(':memory:') })).rejects.toThrow(/page manquante : p00002/);
      rmSync(join(dir, 'manifest.enc'));
      await expect(restaurerSqlite({ source: dir, secrets: { bk: BK }, db: new DatabaseSync(':memory:') })).rejects.toThrow(/manifest\.enc absent/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('ancien format v1 (un fichier, clé JWT) : toujours relu, schéma depuis les migrations', async () => {
    const DB = d1Reel(); peupler(DB, { messages: 30, gros: 0 });
    const tables = {};
    for (const t of ['users', 'conversations', 'conversation_members', 'messages']) tables[t] = DB.raw.prepare(`SELECT * FROM ${t}`).all().map((r) => ({ ...r }));
    tables.voice_prints = [{ user_id: 'u1', mfcc_avg_enc: [0, 255, 7], last_updated: 1, enrollment_count: 1 }];   // BLOB tel que rendu par D1
    tables.stories = { error: 'D1 hoquet' };   // table illisible le jour de la sauvegarde (elle existe dans le schéma)
    const dir = mkdtempSync(join(tmpdir(), 'apex-v1-'));
    const f = join(dir, 'd1-2026-09-17.json.enc');
    writeFileSync(f, await encryptBackup(JSON.stringify({ ts: Date.parse('2026-09-17T03:00:00Z'), version: 2, tables }), JWT));
    try {
      await expect(restaurerSqlite({ source: f, secrets: { bk: BK }, db: new DatabaseSync(':memory:') })).rejects.toThrow(/il faut JWT_SIGN_KEY/);
      const db = new DatabaseSync(':memory:');
      const r = await restaurerSqlite({ source: f, secrets: { jwt: JWT }, db });
      expect(r.format).toBe(1);
      expect(r.schema).toBe('migrations');
      expect(r.tables.messages).toEqual({ attendu: 30, restaure: 30 });
      // les graines des migrations sont effacées : exactement les lignes de la sauvegarde, pas plus
      expect(r.tables.users).toEqual({ attendu: tables.users.length, restaure: tables.users.length });
      expect(r.failed).toEqual(['stories']);
      expect(r.ecarts).toEqual([]);   // les comptes sont justes…
      expect(r.ok).toBe(false);   // …mais une table illisible à la sauvegarde = restauration déclarée incomplète
      expect(db.prepare("SELECT mfcc_avg_enc AS b FROM voice_prints").get().b).toEqual(new Uint8Array([0, 255, 7]));
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('clé de sauvegarde : dédiée, et le repli est ANNONCÉ', () => {
  it('BACKUP_ENCRYPTION_KEY présent → kid « bk » ; illisible avec le seul secret JWT', async () => {
    const DB = d1Reel(); peupler(DB, { messages: 5, gros: 0 });
    const R = r2();
    const res = await performDailyBackup({ APEX_CHAT_DB: DB, APEX_CHAT_MEDIA: R, BACKUP_ENCRYPTION_KEY: BK, JWT_SIGN_KEY: JWT }, NOW);
    expect(res).toMatchObject({ ok: true, kid: 'bk' });
    const man = R.store.get(manifestKey(DATE));
    expect(JSON.parse(man)).toMatchObject({ v: 2, kid: 'bk' });
    await expect(decryptBlob(man, { jwt: JWT })).rejects.toThrow(/secret absent/);
    await expect(decryptBlob(man, { bk: JWT })).rejects.toThrow(/mauvais secret/);
    expect((await decryptBlob(man, { bk: BK })).kind).toBe('manifest');
  });

  it('sans BACKUP_ENCRYPTION_KEY → repli JWT, noté « jwt-fallback » et alerte typée pour le consommateur', async () => {
    const DB = d1Reel(); peupler(DB, { messages: 5, gros: 0 });
    const T = file();
    const res = await performDailyBackup({ APEX_CHAT_DB: DB, APEX_CHAT_MEDIA: r2(), JWT_SIGN_KEY: JWT, TELEMETRY_QUEUE: T }, NOW);
    expect(res).toMatchObject({ ok: true, kid: 'jwt' });
    expect(JSON.parse(DB.raw.prepare("SELECT value FROM system_config WHERE key='backup_last_ok'").get().value).key_warning).toBe('jwt-fallback');
    expect(T._sent).toEqual([expect.objectContaining({ queue_type: 'telemetry', sentinel: 'backup-key-fallback', severity: 'warn' })]);
  });

  it('ni l\'un ni l\'autre → REFUS d\'écrire en clair, backup_last_error + alerte', async () => {
    const DB = d1Reel();
    const R = r2(); const T = file();
    const res = await performDailyBackup({ APEX_CHAT_DB: DB, APEX_CHAT_MEDIA: R, TELEMETRY_QUEUE: T }, NOW);
    expect(res.ok).toBe(false);
    expect(R.put).not.toHaveBeenCalled();
    expect(DB.raw.prepare("SELECT value FROM system_config WHERE key='backup_last_error'").get().value).toMatch(/refus d'écrire une sauvegarde en clair/);
    expect(T._sent[0]).toMatchObject({ queue_type: 'telemetry', sentinel: 'backup-failed' });
    expect(backupSecret({})).toBeNull();
  });

  it('la clé change en cours de route → l\'étape s\'arrête au lieu de mélanger deux clés', async () => {
    const DB = d1Reel(); peupler(DB, { messages: 450, gros: 0 });
    const Q = file();
    const env = { APEX_CHAT_DB: DB, APEX_CHAT_MEDIA: r2(), LETTERS_QUEUE: Q, BACKUP_ENCRYPTION_KEY: BK };
    expect((await performDailyBackup(env, NOW)).queued).toBe(true);
    const body = Q._sent.shift();
    const r = await handleBackupStep(body, { ...env, BACKUP_ENCRYPTION_KEY: '', JWT_SIGN_KEY: JWT, LETTERS_QUEUE: null }, NOW);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/clé de sauvegarde changée/);
  });
});

describe('robustesse des étapes', () => {
  it('une page qui échoue est REJOUÉE à l\'identique (délai croissant), puis abandon noté après 3 essais', async () => {
    const DB = d1Reel(); peupler(DB, { messages: 450, gros: 0 });
    const Q = file(); const T = file();
    const R = r2();
    const env = { APEX_CHAT_DB: DB, APEX_CHAT_MEDIA: R, LETTERS_QUEUE: Q, TELEMETRY_QUEUE: T, BACKUP_ENCRYPTION_KEY: BK };
    await performDailyBackup(env, NOW);
    R.put.mockImplementationOnce(async () => { throw new Error('R2 indisponible'); });
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // on avance jusqu'à la 1re étape qui écrit une page (les tables vides n'écrivent rien)
    let body = Q._sent.shift(); let etat0; let r;
    for (let k = 0; k < 100; k++) {
      etat0 = JSON.stringify(body.state);
      r = await handleBackupStep(body, env, NOW);
      if (r.retry) break;
      body = Q._sent.shift();
    }
    expect(r).toEqual({ ok: false, retry: 1 });
    const rejoue = Q._sent.shift();
    expect(JSON.stringify(rejoue.state)).toBe(etat0);            // même page, même curseur
    expect(rejoue._opts).toEqual({ delaySeconds: 30 });
    // la reprise réussit et la chaîne continue
    expect((await handleBackupStep(rejoue, env, NOW)).ok).toBe(true);
    // échecs répétés → abandon au 3e essai, noté
    R.put.mockImplementation(async () => { throw new Error('R2 en panne'); });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    let msg = Q._sent.shift();
    let out; const essais = [];
    for (let k = 0; k < 100 && msg; k++) {
      out = await handleBackupStep(msg, env, NOW);
      if (out.retry) essais.push(out.retry);
      if (out.error) break;
      msg = Q._sent.shift();
    }
    spy.mockRestore(); err.mockRestore();
    expect(essais).toEqual([1, 2]);   // 3 essais au total, puis abandon
    expect(Q._sent).toEqual([]);
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/R2 en panne/);
    expect(T._sent.at(-1)).toMatchObject({ queue_type: 'telemetry', sentinel: 'backup-failed' });
    expect(DB.raw.prepare("SELECT value FROM system_config WHERE key='backup_last_error'").get().value).toMatch(/R2 en panne/);
  });

  it('message sans état → ignoré proprement', async () => {
    expect(await handleBackupStep({ queue_type: 'backup-step' }, {})).toEqual({ ok: false, error: 'message backup-step sans état' });
  });

  it('table au-delà du plafond → sauvegarde signalée tronquée, jamais « backup_last_ok »', async () => {
    const notes = {};
    const DB = {
      prepare: (sql) => ({
        _a: [],
        bind(...a) { this._a = a; return this; },
        async all() {
          if (sql.includes("type='table'")) return { results: [{ name: 'grosse' }, { name: 'petite' }] };
          if (sql.includes('sqlite_master')) return { results: [] };
          const after = Number(this._a[0]) || 0;
          if (sql.includes('FROM "grosse"')) return { results: Array.from({ length: BACKUP_PAGE_ROWS }, (_, i) => ({ __rk: after + i + 1, i })) };
          return { results: after ? [] : [{ __rk: 1, a: 1 }] };
        },
        async first() { return sql.includes('FROM "grosse"') ? { x: 1 } : null; },
        async run() { if (sql.includes('system_config')) notes[this._a[0]] = this._a[1]; return { success: true }; },
      }),
    };
    const T = file();
    const res = await performDailyBackup({ APEX_CHAT_DB: DB, APEX_CHAT_MEDIA: r2(), BACKUP_ENCRYPTION_KEY: BK, TELEMETRY_QUEUE: T }, NOW);
    expect(res.ok).toBe(false);
    expect(res.truncated).toEqual(['grosse']);
    expect(res.parts).toBe(BACKUP_ROW_LIMIT / BACKUP_PAGE_ROWS + 1);
    expect(notes.backup_last_ok).toBeUndefined();
    expect(JSON.parse(notes.backup_last_error)).toMatchObject({ truncated: ['grosse'], limit: BACKUP_ROW_LIMIT });
    expect(T._sent.at(-1)).toMatchObject({ queue_type: 'telemetry', sentinel: 'backup-truncated' });
  });

  it('table illisible → les autres sont sauvegardées, la table est listée en échec', async () => {
    const DB = d1Reel(); peupler(DB, { messages: 3, gros: 0 });
    const real = DB.prepare;
    DB.prepare = (sql, a) => (sql.includes('FROM "stories"') ? { bind() { return this; }, async all() { throw new Error('D1 hoquet'); } } : real(sql, a));
    const res = await performDailyBackup({ APEX_CHAT_DB: DB, APEX_CHAT_MEDIA: r2(), BACKUP_ENCRYPTION_KEY: BK }, NOW);
    expect(res.ok).toBe(true);
    const info = JSON.parse(DB.raw.prepare("SELECT value FROM system_config WHERE key='backup_last_ok'").get().value);
    expect(info.failed_tables).toEqual(['stories: D1 hoquet']);
  });

  it('rowid non croissant (moteur incohérent) → arrêt plutôt qu\'une sauvegarde fausse', async () => {
    const DB = {
      prepare: (sql) => ({
        bind() { return this; },
        async all() { return sql.includes('sqlite_master') ? { results: [{ name: 't' }] } : { results: [{ __rk: 0, a: 1 }] }; },
        async run() { return {}; },
      }),
    };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await performDailyBackup({ APEX_CHAT_DB: DB, APEX_CHAT_MEDIA: r2(), BACKUP_ENCRYPTION_KEY: BK }, NOW);
    spy.mockRestore();
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/curseur rowid non croissant/);
  });

  it('rotation : plus de 14 jours supprimés (ancien fichier v1 ET dossiers v2), pages en trop du même jour retirées', async () => {
    const DB = d1Reel(); peupler(DB, { messages: 5, gros: 0 });
    const R = r2(3);
    for (const k of ['backups/d1-2026-08-01.json', 'backups/d1-2026-09-20.json.enc', 'backups/d1-2026-09-20/p00000.enc',
      'backups/d1-2026-09-20/manifest.enc', 'backups/d1-2026-10-10/manifest.enc', 'backups/d1-2026-10-15/p00099.enc']) R.store.set(k, 'x');
    const res = await performDailyBackup({ APEX_CHAT_DB: DB, APEX_CHAT_MEDIA: R, BACKUP_ENCRYPTION_KEY: BK }, NOW);
    expect(res.ok).toBe(true);
    expect(res.purged.sort()).toEqual(['backups/d1-2026-08-01.json', 'backups/d1-2026-09-20.json.enc', 'backups/d1-2026-09-20/manifest.enc', 'backups/d1-2026-09-20/p00000.enc']);
    expect(R.store.has('backups/d1-2026-10-10/manifest.enc')).toBe(true);
    expect(R.store.has('backups/d1-2026-10-15/p00099.enc')).toBe(false);
  });

  it('manifeste relu incohérent → échec noté, la sauvegarde n\'est pas déclarée réussie', async () => {
    const DB = d1Reel(); peupler(DB, { messages: 5, gros: 0 });
    const R = r2();
    const get = R.get;
    R.get = vi.fn(async (k) => (k.endsWith('manifest.enc') ? { text: async () => 'tronqué' } : get(k)));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await performDailyBackup({ APEX_CHAT_DB: DB, APEX_CHAT_MEDIA: R, BACKUP_ENCRYPTION_KEY: BK }, NOW);
    spy.mockRestore();
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/relecture R2 incohérente/);
  });

  it('page disparue de R2 avant le manifeste → échec (jamais un manifeste qui ment)', async () => {
    const DB = d1Reel(); peupler(DB, { messages: 450, gros: 0 });
    const R = r2();
    const put = R.put;
    R.put = vi.fn(async (k, v) => { if (k.endsWith('p00001.enc')) return { key: k }; return put(k, v); });   // écriture « perdue »
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await performDailyBackup({ APEX_CHAT_DB: DB, APEX_CHAT_MEDIA: R, BACKUP_ENCRYPTION_KEY: BK }, NOW);
    spy.mockRestore();
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/pages en R2 incohérentes/);
    expect(R.store.has(manifestKey(DATE))).toBe(false);
  });

  it('R2 absent → échec propre', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await performDailyBackup({ APEX_CHAT_DB: d1Reel(), BACKUP_ENCRYPTION_KEY: BK }, NOW);
    spy.mockRestore();
    expect(res).toMatchObject({ ok: false, error: expect.stringMatching(/bucket R2 absent/) });
  });
});

describe('cas limites', () => {
  it('table WITHOUT ROWID à clé composée, au-delà du plafond → tronquée et signalée', async () => {
    const DB = d1Reel();
    DB.raw.exec('CREATE TABLE verrous (a TEXT, b INTEGER, v TEXT, PRIMARY KEY (b, a)) WITHOUT ROWID');
    const ins = DB.raw.prepare('INSERT INTO verrous VALUES (?,?,?)');
    for (let i = 0; i < 250; i++) ins.run('k' + (i % 3), i, 'v' + i);
    const real = DB.prepare;
    // seule la table « verrous » est sauvegardée dans ce test
    DB.prepare = (sql, a) => (sql.includes("type='table'") ? { all: async () => ({ results: [{ name: 'verrous' }] }) } : real(sql, a));
    const R = r2();
    const res = await performDailyBackup({ APEX_CHAT_DB: DB, APEX_CHAT_MEDIA: R, BACKUP_ENCRYPTION_KEY: BK }, NOW);
    expect(res.ok).toBe(true);
    const pages = [];
    for (const [k, v] of R.store) if (/\/p\d{5}\.enc$/.test(k)) pages.push(await decryptBlob(v, { bk: BK }));
    const lignes = pages.flatMap((p) => p.rows);
    expect(lignes.length).toBe(250);
    expect(lignes.map((r) => r[1])).toEqual(Array.from({ length: 250 }, (_, i) => i));   // ordre de la clé (b, a)
    // même table, état « plafond atteint » forcé : reste-t-il des lignes après le décalage ? oui → tronquée
    const { backupStep } = await import('../../workers/lib/backup.js');
    const st = { date: DATE, ts: 0, kid: 'bk', tables: ['verrous'], ti: 0, after: 10, part: 0, bytes: 0,
      stats: { verrous: [BACKUP_ROW_LIMIT, 0, 0] }, failed: [], truncated: [], sansRowid: ['verrous'] };
    const r = await backupStep({ APEX_CHAT_DB: DB, APEX_CHAT_MEDIA: R, BACKUP_ENCRYPTION_KEY: BK }, st);
    expect(r.done).toBe(true);
    expect(st.truncated).toEqual(['verrous']);
  });

  it('format de sauvegarde inconnu → refus clair', async () => {
    await expect(decryptBlob(JSON.stringify({ v: 9, iv: 'a', ct: 'b' }), { bk: BK })).rejects.toThrow(/version de sauvegarde inconnue/);
    await expect(decryptBlob('pas du json', { bk: BK })).rejects.toThrow(/illisible/);
    await expect(decryptBlob('{}', { bk: BK })).rejects.toThrow(/format inconnu/);
  });

  it('note system_config ou rotation en panne → la sauvegarde aboutit quand même (avec un avertissement)', async () => {
    const DB = d1Reel(); peupler(DB, { messages: 3, gros: 0 });
    const real = DB.prepare;
    DB.prepare = (sql, a) => (sql.startsWith('INSERT OR REPLACE INTO system_config') ? { bind() { return this; }, async run() { throw new Error('D1 plein'); } } : real(sql, a));
    const R = r2();
    const list = R.list;
    R.list = vi.fn(async (o) => { if (o.prefix === 'backups/d1-') throw new Error('R2 list KO'); return list(o); });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await performDailyBackup({ APEX_CHAT_DB: DB, APEX_CHAT_MEDIA: R, BACKUP_ENCRYPTION_KEY: BK }, NOW);
    expect(res.ok).toBe(true);
    expect(warn).toHaveBeenCalledWith('[backup] rotation partielle :', 'R2 list KO');
    expect(warn).toHaveBeenCalledWith('[backup] system_config non écrit :', 'D1 plein');
  });
});

describe('valeurs : encodage et littéraux SQL', () => {
  it('BLOB (tableau D1, ArrayBuffer, Uint8Array), grands entiers, NULL', () => {
    expect(encodeValue([1, 2])).toEqual({ $b64: 'AQI=' });
    expect(encodeValue(new Uint8Array([1, 2]).buffer)).toEqual({ $b64: 'AQI=' });
    expect(encodeValue(2n ** 70n)).toEqual({ $int: '1180591620717411303424' });
    expect(encodeValue(undefined)).toBeNull();
    expect(decodeValue({ $int: '5' })).toBe(5n);
    expect(() => decodeValue({ autre: 1 })).toThrow(/valeur inattendue/);
    expect(litteral(null)).toBe('NULL');
    expect(litteral(3n)).toBe('3');
    expect(litteral(true)).toBe('1');
    expect(litteral("l'été")).toBe("'l''été'");
    expect(() => litteral(Infinity)).toThrow(/non fini/);
  });
});

// 15.10.2026 : ce workflow est PRIVÉ (tools/depot-public/regles.json) → absent du dépôt public kd-mc, où ce test
// tourne aussi (porte qualité du déploiement). Là-bas : on vérifie qu'il est absent PARCE QU'il est privé, puis on saute.
const RACINE_DEPOT = join(import.meta.dirname, '..', '..', '..');
const WF_EXERCICE = '.github/workflows/apex-chat-exercice-restauration.yml';
const EXERCICE_PRESENT = existsSync(join(RACINE_DEPOT, WF_EXERCICE));

describe('exercice de restauration : absent seulement du dépôt public, parce qu\'il est privé', () => {
  it.skipIf(EXERCICE_PRESENT)('copie publique : le workflow manque car il est listé privé (jamais par oubli)', () => {
    const regles = readFileSync(join(RACINE_DEPOT, 'tools/depot-public/regles.json'), 'utf8');
    expect(regles).toContain(WF_EXERCICE);
  });
});

describe.skipIf(!EXERCICE_PRESENT)('exercice de restauration : les étapes shell du workflow, jouées avec un faux wrangler', () => {
  const RACINE = RACINE_DEPOT;
  function etape(nom) {
    const lignes = readFileSync(join(RACINE, '.github/workflows/apex-chat-exercice-restauration.yml'), 'utf8').split('\n');
    const i = lignes.findIndex((l) => l.includes('- name: ' + nom));
    expect(i, nom).toBeGreaterThan(-1);
    const r = lignes.findIndex((l, k) => k > i && /^\s+run: /.test(l));
    const une = /^\s+run: (?!\|)(.+)$/.exec(lignes[r]);
    if (une) return une[1];
    const marge = lignes[r].length - lignes[r].trimStart().length;
    const corps = [];
    for (let k = r + 1; k < lignes.length; k++) { const l = lignes[k]; if (l.trim() && l.length - l.trimStart().length <= marge) break; corps.push(l); }
    const min = Math.min(...corps.filter((l) => l.trim()).map((l) => l.length - l.trimStart().length));
    return corps.map((l) => l.slice(min)).join('\n');
  }

  it('télécharger (jour le plus récent) → reconstruire → rapport : OK ; clé absente ou sauvegarde incomplète → échec', async () => {
    const { spawnSync } = await import('node:child_process');
    const { chmodSync, mkdirSync } = await import('node:fs');
    const DB = d1Reel(); peupler(DB, { messages: 450, gros: 1 });
    const R = r2();
    const today = new Date();
    expect((await performDailyBackup({ APEX_CHAT_DB: DB, APEX_CHAT_MEDIA: R, BACKUP_ENCRYPTION_KEY: BK }, today)).ok).toBe(true);
    const tmp = mkdtempSync(join(tmpdir(), 'exercice-'));
    const r2dir = join(tmp, 'r2', 'apex-chat-media');
    for (const [k, v] of R.store) { mkdirSync(join(r2dir, k, '..'), { recursive: true }); writeFileSync(join(r2dir, k), v); }
    const bin = join(tmp, 'bin'); mkdirSync(bin);
    writeFileSync(join(bin, 'wrangler'), `#!/bin/sh\nexec "${process.execPath}" --no-warnings "${join(import.meta.dirname, '_support', 'faux-wrangler.mjs')}" "$@"\n`);
    chmodSync(join(bin, 'wrangler'), 0o755);
    const runner = join(tmp, 'runner'); mkdirSync(runner);
    const genv = join(tmp, 'github_env'); const resume = join(tmp, 'summary.md');
    const env = { ...process.env, PATH: bin + ':' + process.env.PATH, FAUX_R2_DIR: join(tmp, 'r2'), RUNNER_TEMP: runner,
      GITHUB_ENV: genv, GITHUB_STEP_SUMMARY: resume, BACKUP_ENCRYPTION_KEY: BK, JOUR: '', NODE_NO_WARNINGS: '1' };
    const jouer = (nom, extra = {}) => spawnSync('bash', ['-eo', 'pipefail', '-c', etape(nom)], { cwd: RACINE, env: { ...env, ...extra }, encoding: 'utf8' });
    try {
      let r = jouer('Télécharger la sauvegarde chiffrée depuis R2');
      expect(r.status, r.stdout + r.stderr).toBe(0);
      const jour = today.toISOString().slice(0, 10);
      expect(readFileSync(genv, 'utf8')).toContain('SAUVEGARDE_JOUR=' + jour);
      r = jouer('Reconstruire une base et vérifier table par table', { SAUVEGARDE_JOUR: jour });
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(r.stdout).toMatch(/RESTAURATION OK/);
      expect(r.stdout).toMatch(/ok  messages\s+450 \/ 450/);
      expect(r.stdout + readFileSync(resume, 'utf8')).not.toMatch(/Zoé|pseudo_|chiffré:/);   // jamais une donnée dans le journal
      // l'étape de ménage efface les fichiers déchiffrés
      expect(spawnSync('bash', ['-e', '-c', etape('Effacer les données déchiffrées (toujours)')], { env, encoding: 'utf8' }).status).toBe(0);
      expect(readdirSync(runner).filter((f) => f !== 'rapport.txt')).toEqual([]);
      // sans la clé → échec net, avant tout téléchargement
      r = jouer('Télécharger la sauvegarde chiffrée depuis R2', { BACKUP_ENCRYPTION_KEY: '' });
      expect(r.status).not.toBe(0);
      expect(r.stdout).toMatch(/::error::Secret BACKUP_ENCRYPTION_KEY absent/);
      // jour mal formé (entrée de l'utilisateur) → refus, rien n'est exécuté avec
      r = jouer('Télécharger la sauvegarde chiffrée depuis R2', { JOUR: '2026-10-15; rm -rf /' });
      expect(r.status).not.toBe(0);
      expect(r.stdout).toMatch(/jour invalide/);
      // page disparue de R2 → la reconstruction échoue (jamais un « OK » sur une sauvegarde incomplète)
      rmSync(join(r2dir, 'backups', 'd1-' + jour, 'p00001.enc'));
      r = jouer('Télécharger la sauvegarde chiffrée depuis R2', { JOUR: jour });
      expect(r.status).not.toBe(0);
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  }, 60000);
});
