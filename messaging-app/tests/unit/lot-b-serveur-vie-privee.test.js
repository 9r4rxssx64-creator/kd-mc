// @vitest-environment node
/**
 * Lot B vie privée — non-régression SERVEUR sur le VRAI schéma (toutes les migrations, SQLite réel).
 *  A6-06 : cache des résumés IA lié à un compte (jamais partagé), purgé à 7 jours, effacé avec le compte,
 *          anciennes lignes sans propriétaire supprimées.
 *  A6-01 : position — purge réelle à 30 jours (cron 03:00), position dans l'export RGPD, interrupteur admin
 *          « Géoloc users » appliqué par le serveur (coupé → aucune coordonnée enregistrée).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker, { purgeLocationHistory, _geolocTrackingOn } from '../../workers/api-worker.js';
import { ENV, makeJWT, makeRequest } from './api-worker-helpers.js';
import { d1Reel } from './_support/d1-sqlite.js';

const DAY = 86400000;
const now = () => Math.floor(Date.now() / 1000) - 5;
let groqCalls;
beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  groqCalls = 0;
  globalThis.fetch = vi.fn(async (u) => {
    if (String(u).includes('api.groq.com')) { groqCalls++; return new Response(JSON.stringify({ choices: [{ message: { content: 'Résumé : RDV jeudi' } }] })); }
    return new Response('{}');
  });
});

function seed(DB, id, pseudo, phone, extra = {}) {
  DB.raw.prepare(`INSERT INTO users (id,pseudo,real_name,phone,phone_hash,created_at,identity_key_pub,pq_key_pub,prekey_signed,status,is_admin)
    VALUES (?,?,?,?,?,1,'k','k','k','active',?)`).run(id, pseudo, 'Nom ' + pseudo, phone, 'h_' + id, extra.is_admin ? 1 : 0);
}
function setup() {
  const DB = d1Reel();
  seed(DB, 'alice', 'alice', '+33611111111');
  seed(DB, 'mallory', 'mallory', '+33622222222');
  // kdmc_admin (is_admin=1) est déjà créé par les migrations.
  const env = ENV({ APEX_CHAT_DB: DB, APEX_CHAT_MEDIA: { delete: vi.fn(async () => {}) } });
  return { DB, env };
}
const tok = (sub, extra = {}) => makeJWT({ sub, iat: now(), ...extra });
const ctx = { waitUntil(p) { if (p && p.catch) p.catch(() => {}); } };
const PROMPT = 'Résume : [10:02] Bob: on se voit jeudi chez moi, code porte 4512';

async function summarize(env, sub) {
  const r = await worker.fetch(makeRequest({ method: 'POST', path: '/api/ai/summarize', token: await tok(sub), body: { prompt: PROMPT } }), env, ctx);
  return r.json();
}

describe('Lot B — A6-06 : résumés IA propres à chaque compte, purgés, effacés avec le compte', () => {
  it('chaque ligne a un propriétaire ; un AUTRE compte avec le même texte ne reçoit PAS le résumé du premier', async () => {
    const { DB, env } = setup();
    const a = await summarize(env, 'alice');
    expect(a).toMatchObject({ ok: true, cached: false });
    const rows = DB.raw.prepare('SELECT user_id FROM ai_summary_cache').all();
    expect(rows.map((r) => r.user_id)).toEqual(['alice']);
    const m = await summarize(env, 'mallory');
    expect(m.cached).toBe(false);
    expect(groqCalls).toBe(2);
    // le propriétaire, lui, profite toujours de son cache
    const a2 = await summarize(env, 'alice');
    expect(a2.cached).toBe(true);
    expect(groqCalls).toBe(2);
  });

  it('suppression du compte → ses résumés disparaissent, ceux des autres restent', async () => {
    const { DB, env } = setup();
    await summarize(env, 'alice');
    await summarize(env, 'mallory');
    const r = await worker.fetch(makeRequest({ method: 'DELETE', path: '/api/users/me', body: { confirm: 'SUPPRIMER' }, token: await tok('alice') }), env, ctx);
    expect(r.status).toBe(200);
    expect(DB.raw.prepare("SELECT COUNT(*) n FROM ai_summary_cache WHERE user_id='alice'").get().n).toBe(0);
    expect(DB.raw.prepare("SELECT COUNT(*) n FROM ai_summary_cache WHERE user_id='mallory'").get().n).toBe(1);
  });

  it('cron 03:00 → résumés de plus de 7 jours et anciennes lignes SANS propriétaire supprimés', async () => {
    const { DB, env } = setup();
    const ins = DB.raw.prepare('INSERT INTO ai_summary_cache (cache_key, text, ts, provider, user_id) VALUES (?,?,?,?,?)');
    ins.run('vieux', 'v', Date.now() - 8 * DAY, 'groq', 'alice');
    ins.run('frais', 'f', Date.now() - 1 * DAY, 'groq', 'alice');
    ins.run('orphelin', 'o', Date.now(), 'groq', null);
    await worker.scheduled({ cron: '0 3 * * *' }, env, ctx);
    expect(DB.raw.prepare('SELECT cache_key FROM ai_summary_cache ORDER BY cache_key').all().map((r) => r.cache_key)).toEqual(['frais']);
  });

  it('l\'export RGPD contient les résumés IA du compte (et pas ceux des autres)', async () => {
    const { env } = setup();
    await summarize(env, 'alice');
    await summarize(env, 'mallory');
    const r = await worker.fetch(makeRequest({ path: '/api/users/me/export', token: await tok('alice') }), env, ctx);
    const j = JSON.parse(await r.text());
    expect(j.ai_summaries).toHaveLength(1);
    expect(j.ai_summaries[0].text).toContain('RDV jeudi');
  });
});

async function heartbeat(env, sub, body = { lat: 43.7384, lng: 7.4246 }) {
  const r = await worker.fetch(makeRequest({ method: 'POST', path: '/api/users/heartbeat', token: await tok(sub), body }), env, ctx);
  expect(r.status).toBe(200);
}
const lastActivity = (DB, uid) => DB.raw.prepare('SELECT lat, lng FROM user_activity WHERE user_id=? ORDER BY id DESC LIMIT 1').get(uid);
const setCfg = (DB, key, value) => DB.raw.prepare('INSERT OR REPLACE INTO system_config (key, value, updated_at, updated_by) VALUES (?,?,1,?)').run(key, value, 'test');

describe('Lot B — A6-01 : interrupteur admin « Géoloc users » appliqué par le serveur', () => {
  it('jamais réglé → coordonnées enregistrées (comportement affiché par l\'écran admin : ON)', async () => {
    const { DB, env } = setup();
    await heartbeat(env, 'alice');
    expect(lastActivity(DB, 'alice')).toEqual({ lat: 43.7384, lng: 7.4246 });
    expect(DB.raw.prepare("SELECT last_lat FROM users WHERE id='alice'").get().last_lat).toBe(43.7384);
  });

  it('l\'admin coupe « Géoloc users » par SA route → plus AUCUNE coordonnée enregistrée (historique ni dernière position)', async () => {
    const { DB, env } = setup();
    const r = await worker.fetch(makeRequest({ method: 'POST', path: '/api/admin/toggles', token: await tok('kdmc_admin', { is_admin: true }), body: { feature: 'track_geoloc', enabled: false } }), env, ctx);
    expect(r.status).toBe(200);
    await heartbeat(env, 'alice');
    expect(lastActivity(DB, 'alice')).toEqual({ lat: null, lng: null });
    expect(DB.raw.prepare("SELECT last_lat, last_lng FROM users WHERE id='alice'").get()).toEqual({ last_lat: null, last_lng: null });
  });

  it('réglage par compte : coupé pour Alice seulement ; forcé ON pour un compte quand le global est coupé', async () => {
    const { DB, env } = setup();
    setCfg(DB, 'user_toggle:alice:track_geoloc', 'false');
    await heartbeat(env, 'alice');
    await heartbeat(env, 'mallory');
    expect(lastActivity(DB, 'alice').lat).toBeNull();
    expect(lastActivity(DB, 'mallory').lat).toBe(43.7384);
    setCfg(DB, 'FEATURE_TRACK_GEOLOC', 'false');
    setCfg(DB, 'user_toggle:mallory:track_geoloc', 'true');
    await heartbeat(env, 'mallory', { lat: 1.5, lng: 2.5 });
    expect(lastActivity(DB, 'mallory')).toEqual({ lat: 1.5, lng: 2.5 });
  });

  it('base illisible → dans le doute, pas de coordonnées', async () => {
    const env = { APEX_CHAT_DB: { prepare() { throw new Error('D1 KO'); } } };
    expect(await _geolocTrackingOn(env, 'alice')).toBe(false);
  });
});

describe('Lot B — A6-01 : purge réelle à 30 jours et export de la position', () => {
  it('cron 03:00 → historique de position > 30 j effacé ; dernière position d\'un compte inactif > 30 j effacée', async () => {
    const { DB, env } = setup();
    const ins = DB.raw.prepare("INSERT INTO user_activity (user_id, ts, lat, lng, action) VALUES (?,?,?,?, 'heartbeat')");
    ins.run('alice', Date.now() - 31 * DAY, 43.1, 7.1);
    ins.run('alice', Date.now() - 1 * DAY, 43.2, 7.2);
    DB.raw.prepare('UPDATE users SET last_lat=43.3, last_lng=7.3, last_seen=? WHERE id=?').run(Date.now() - 40 * DAY, 'mallory');
    DB.raw.prepare('UPDATE users SET last_lat=43.4, last_lng=7.4, last_seen=? WHERE id=?').run(Date.now() - 2 * DAY, 'alice');
    await worker.scheduled({ cron: '0 3 * * *' }, env, ctx);
    expect(DB.raw.prepare("SELECT lat FROM user_activity WHERE user_id='alice'").all().map((r) => r.lat)).toEqual([43.2]);
    expect(DB.raw.prepare("SELECT last_lat FROM users WHERE id='mallory'").get().last_lat).toBeNull();
    expect(DB.raw.prepare("SELECT last_lat FROM users WHERE id='alice'").get().last_lat).toBe(43.4);
  });

  it('purge : une table en panne n\'empêche pas les autres (rapport d\'erreur par table)', async () => {
    const run = vi.fn(async () => { throw new Error('KO'); });
    const env = { APEX_CHAT_DB: { prepare: () => ({ bind: () => ({ run }) }) } };
    const out = await purgeLocationHistory(env, Date.now());
    expect(run).toHaveBeenCalledTimes(3);
    expect(out).toEqual({ activity: 'erreur: KO', last_position: 'erreur: KO', ai_summary_cache: 'erreur: KO' });
  });

  it('export RGPD : historique de position (activity) + dernière position dans le profil', async () => {
    const { env } = setup();
    await heartbeat(env, 'alice');
    const r = await worker.fetch(makeRequest({ path: '/api/users/me/export', token: await tok('alice') }), env, ctx);
    expect(r.status).toBe(200);
    const j = JSON.parse(await r.text());
    expect(Array.isArray(j.activity)).toBe(true);
    expect(j.activity[0]).toMatchObject({ lat: 43.7384, lng: 7.4246, action: 'heartbeat' });
    expect(j.profile).toMatchObject({ last_lat: 43.7384, last_lng: 7.4246 });
  });
});
