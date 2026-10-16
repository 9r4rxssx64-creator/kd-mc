// @vitest-environment node
/**
 * Charte (privacy.html) : « historique des connexions : 30 jours ». Avant, rien ne l'effaçait.
 * Prouvé sur le vrai schéma SQLite ; la panne d'une table n'arrête pas l'autre.
 */
import { describe, it, expect, vi } from 'vitest';
import { purgeHistoriqueConnexions } from '../../workers/api-worker.js';
import { d1Reel } from './_support/d1-sqlite.js';

const DAY = 86400000;
describe('purge des connexions et des codes SMS expirés', () => {
  it('efface les connexions de plus de 30 jours, garde les récentes', async () => {
    const DB = d1Reel(); const now = Date.now();
    const ins = DB.raw.prepare("INSERT INTO connections (id,user_id,sig,first_seen,last_seen) VALUES (?,?,?,?,?)");
    ins.run('vieille', 'u', 's1', now - 90 * DAY, now - 31 * DAY);
    ins.run('recente', 'u', 's2', now - 90 * DAY, now - 2 * DAY);
    const out = await purgeHistoriqueConnexions({ APEX_CHAT_DB: DB }, now);
    expect(out.connexions).toBe(1);
    expect(DB.raw.prepare('SELECT id FROM connections').all().map((r) => r.id)).toEqual(['recente']);
  });
  it('efface les codes SMS expirés, garde ceux encore valables', async () => {
    const DB = d1Reel(); const now = Date.now();
    const ins = DB.raw.prepare('INSERT INTO otp_pending (phone_hash,otp_hash,attempts,created_at,expires_at) VALUES (?,?,0,?,?)');
    ins.run('a', 'x', now - 10 * 60000, now - 5 * 60000);
    ins.run('b', 'x', now, now + 5 * 60000);
    const out = await purgeHistoriqueConnexions({ APEX_CHAT_DB: DB }, now);
    expect(out.codes_sms).toBe(1);
    expect(DB.raw.prepare('SELECT phone_hash FROM otp_pending').all().map((r) => r.phone_hash)).toEqual(['b']);
  });
  it('une table en panne est signalée sans arrêter l\'autre', async () => {
    const run = vi.fn(async () => { throw new Error('KO'); });
    const out = await purgeHistoriqueConnexions({ APEX_CHAT_DB: { prepare: () => ({ bind: () => ({ run }) }) } });
    expect(run).toHaveBeenCalledTimes(2);
    expect(out).toEqual({ connexions: 'erreur: KO', codes_sms: 'erreur: KO' });
  });
  it('le travail de 03:00 l\'appelle', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../../workers/api-worker.js', import.meta.url).pathname, 'utf8');
    expect(src).toMatch(/await purgeHistoriqueConnexions\(env\);/);
  });
});

describe('charte : ce qui est écrit correspond à ce que fait l\'app', () => {
  it('annonce Google (appels), Giphy et le journal d\'erreurs Firebase, et ne promet plus « 30 jours » pour les messages', async () => {
    const { readFileSync } = await import('node:fs');
    const t = readFileSync(new URL('../../privacy.html', import.meta.url).pathname, 'utf8');
    expect(t).toMatch(/Google<\/strong> \(appels audio\/vidéo\)/);
    expect(t).toMatch(/Giphy<\/strong>/);
    expect(t).toMatch(/journal d'erreurs techniques de l'app/);
    expect(t).not.toMatch(/Métadonnées messages \(qui→qui, quand, taille\)<\/td><td>Routage technique<\/td><td>30 jours/);
    expect(t).not.toMatch(/Tes données ne quittent jamais ton téléphone/);
  });
});
