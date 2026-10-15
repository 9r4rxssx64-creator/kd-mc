// @vitest-environment node
/**
 * Lot E1 (sobriété, suite) — consommer un ticket WebSocket coûtait 3 requêtes D1 par connexion
 * (CREATE TABLE IF NOT EXISTS + INSERT + DELETE de ménage), sur le quota gratuit du compte entier.
 * Maintenant : la table vient de la migration 0022, l'INSERT suffit, le ménage passe 1 fois sur 20.
 * Vrai SQLite bâti avec toutes les migrations (d1Reel) : les contraintes s'appliquent comme en prod.
 */
import { describe, it, expect } from 'vitest';
import { consumeWsTicket } from '../../workers/api-worker.js';
import { d1Reel } from './_support/d1-sqlite.js';

/** Base réelle qui compte les requêtes envoyées (comme D1 les facture). */
function baseComptee(db = d1Reel()) {
  const sqls = [];
  return {
    sqls,
    raw: db.raw,
    prepare(sql) { sqls.push(sql); return db.prepare(sql); },
  };
}
const tk = (jti, exp = Math.floor(Date.now() / 1000) + 60) => ({ typ: 'wstkt', jti, exp });
const jamaisMenage = () => 0.99;
const toujoursMenage = () => 0;

describe('ticket WebSocket : 1 seule requête D1 par connexion ordinaire', () => {
  it('la migration 0022 crée la table ws_tickets', () => {
    const t = d1Reel().raw.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ws_tickets'").get();
    expect(t && t.name).toBe('ws_tickets');
  });

  it('connexion ordinaire : un INSERT, ni CREATE TABLE ni ménage', async () => {
    const DB = baseComptee();
    expect(await consumeWsTicket({ APEX_CHAT_DB: DB }, tk('j1'), jamaisMenage)).toBe(true);
    expect(DB.sqls).toHaveLength(1);
    expect(DB.sqls[0]).toMatch(/^INSERT OR IGNORE INTO ws_tickets/);
    expect(DB.sqls.some((s) => /CREATE TABLE/i.test(s))).toBe(false);
  });

  it('usage unique conservé : le même ticket une 2ᵉ fois est refusé', async () => {
    const DB = baseComptee();
    const E = { APEX_CHAT_DB: DB };
    expect(await consumeWsTicket(E, tk('rejeu'), jamaisMenage)).toBe(true);
    expect(await consumeWsTicket(E, tk('rejeu'), jamaisMenage)).toBe(false);
  });

  it('table absente (base pas encore migrée) : recréée puis le ticket passe, une seule fois', async () => {
    const DB = baseComptee();
    DB.raw.exec('DROP TABLE ws_tickets');
    const E = { APEX_CHAT_DB: DB };
    expect(await consumeWsTicket(E, tk('neuf'), jamaisMenage)).toBe(true);
    expect(DB.sqls.filter((s) => /CREATE TABLE/i.test(s))).toHaveLength(1);
    expect(await consumeWsTicket(E, tk('neuf'), jamaisMenage)).toBe(false);
  });

  it('autre panne de la base : refus (fail-closed), jamais de session offerte', async () => {
    const E = { APEX_CHAT_DB: { prepare() { return { bind() { return { async run() { throw new Error('D1_ERROR: network'); } }; } }; } } };
    expect(await consumeWsTicket(E, tk('x'), jamaisMenage)).toBe(false);
  });

  it('ménage tiré au sort : il efface bien les tickets expirés, pas les valides', async () => {
    const DB = baseComptee();
    DB.raw.prepare('INSERT INTO ws_tickets (jti, expires_at) VALUES (?, ?)').run('vieux', Date.now() - 3600000);
    expect(await consumeWsTicket({ APEX_CHAT_DB: DB }, tk('frais'), toujoursMenage)).toBe(true);
    const restants = DB.raw.prepare('SELECT jti FROM ws_tickets ORDER BY jti').all().map((r) => r.jti);
    expect(restants).toEqual(['frais']);
  });

  it('sur 1 000 connexions, le ménage passe environ 1 fois sur 20 (≤ 80, ≥ 20)', async () => {
    const DB = baseComptee();
    let graine = 7;
    const alea = () => { graine = (graine * 1103515245 + 12345) % 2147483648; return graine / 2147483648; };
    for (let i = 0; i < 1000; i++) await consumeWsTicket({ APEX_CHAT_DB: DB }, tk('t' + i), alea);
    const menages = DB.sqls.filter((s) => /^DELETE FROM ws_tickets/.test(s)).length;
    expect(menages).toBeGreaterThanOrEqual(20);
    expect(menages).toBeLessThanOrEqual(80);
    expect(DB.sqls.length).toBeLessThanOrEqual(1080);
  });

  it('trames invalides refusées sans toucher la base', async () => {
    const DB = baseComptee();
    for (const p of [null, { typ: 'session', jti: 'a' }, { typ: 'wstkt' }]) {
      expect(await consumeWsTicket({ APEX_CHAT_DB: DB }, p)).toBe(false);
    }
    expect(DB.sqls).toHaveLength(0);
  });
});
