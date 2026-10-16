// @vitest-environment node
/**
 * Audit 16.10.2026 — code SMS : plafond PAR NUMÉRO (3/heure, 10/jour) en plus du plafond par adresse,
 * et renvoyer un code ne remet plus à zéro les essais du code encore valable.
 * Prouvé sur le vrai schéma SQLite. Le numéro SSO vient du jeton signé, pas du corps de la requête.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ctEq, autoHealPerson, handleSendOtp, handleSsoFromApex, signJWT, OTP_PAR_NUMERO_HEURE, OTP_PAR_NUMERO_JOUR } from '../../workers/api-worker.js';
import { ENV } from './api-worker-helpers.js';
import { d1Reel } from './_support/d1-sqlite.js';

const PHONE = '+33612345678';
const req = (phone, ip) => new Request('https://x/api/auth/send-otp', {
  method: 'POST', headers: { 'content-type': 'application/json', 'CF-Connecting-IP': ip },
  body: JSON.stringify({ phone, name: 'Marie Dupont' }),
});
beforeEach(() => { globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ messages: [{ status: '0' }] }))); });

describe('code SMS : plafond par numéro', () => {
  it('le 4e envoi dans l\'heure vers le même numéro est refusé, même depuis une AUTRE adresse', async () => {
    const DB = d1Reel();
    const env = ENV({ APEX_CHAT_DB: DB, VONAGE_API_KEY: 'k', VONAGE_API_SECRET: 's' });
    for (let i = 0; i < OTP_PAR_NUMERO_HEURE; i++) expect((await handleSendOtp(req(PHONE, '1.1.1.' + i), env)).status).toBe(200);
    const r = await handleSendOtp(req(PHONE, '9.9.9.9'), env);
    expect(r.status).toBe(429);
    expect((await r.json()).error).toBe('rate_limit_phone');
  });
  it('un autre numéro n\'est pas touché', async () => {
    const DB = d1Reel();
    const env = ENV({ APEX_CHAT_DB: DB, VONAGE_API_KEY: 'k', VONAGE_API_SECRET: 's' });
    for (let i = 0; i < OTP_PAR_NUMERO_HEURE; i++) await handleSendOtp(req(PHONE, '1.1.1.' + i), env);
    expect((await handleSendOtp(req('+33699999999', '2.2.2.2'), env)).status).toBe(200);
  });
  it('plafond du jour : 10', () => { expect(OTP_PAR_NUMERO_JOUR).toBe(10); });
  it('renvoyer un code garde les essais d\'un code encore valable, et les remet à zéro s\'il a expiré', async () => {
    const DB = d1Reel();
    const env = ENV({ APEX_CHAT_DB: DB, VONAGE_API_KEY: 'k', VONAGE_API_SECRET: 's' });
    await handleSendOtp(req(PHONE, '1.1.1.1'), env);
    DB.raw.prepare('UPDATE otp_pending SET attempts=4').run();
    await handleSendOtp(req(PHONE, '1.1.1.2'), env);
    expect(DB.raw.prepare('SELECT attempts FROM otp_pending').get().attempts).toBe(4);
    DB.raw.prepare('UPDATE otp_pending SET expires_at=1').run();
    await handleSendOtp(req(PHONE, '1.1.1.3'), env);
    expect(DB.raw.prepare('SELECT attempts FROM otp_pending').get().attempts).toBe(0);
  });
});

describe('SSO Apex : le numéro vient du jeton signé', () => {
  async function sso(body, tokenExtra) {
    const DB = d1Reel();
    const env = ENV({ APEX_CHAT_DB: DB, APEX_SSO_SIGN_KEY: 'cle-de-test-sso-0123456789abcdef' });
    const now = Math.floor(Date.now() / 1000);
    const apex_token = await signJWT({ sub: 'apex_1', iat: now, exp: now + 120, ...tokenExtra }, env.APEX_SSO_SIGN_KEY);
    const r = await handleSsoFromApex(new Request('https://x/api/auth/sso-apex', { method: 'POST', body: JSON.stringify({ apex_token, apex_uid: 'apex_1', name: 'Marie', ...body }) }), env);
    return { r, DB };
  }
  it('un numéro glissé dans le corps de la requête est ignoré', async () => {
    const { r, DB } = await sso({ phone: '+33611112222' }, {});
    expect(r.status).toBe(200);
    expect(DB.raw.prepare("SELECT phone FROM users WHERE apex_uid='apex_1'").get().phone).toBe('PENDING_SSO');
  });
  it('un numéro présent dans le jeton signé est gardé', async () => {
    const { DB } = await sso({}, { phone: '+33611112222' });
    expect(DB.raw.prepare("SELECT phone FROM users WHERE apex_uid='apex_1'").get().phone).toBe('+33611112222');
  });
});


describe('fusion par nom : seuls les brouillons de circuits internes sont absorbés', () => {
  function add(DB, id, name, phone, source, last_seen) {
    DB.raw.prepare(`INSERT INTO users (id,pseudo,real_name,phone,phone_hash,created_at,identity_key_pub,pq_key_pub,prekey_signed,status,source,last_seen,is_admin)
      VALUES (?,?,?,?,?,1,'k','k','k','active',?,?,0)`).run(id, id, name, phone, 'h_' + id, source, last_seen);
  }
  async function essai(sourceBrouillon) {
    const DB = d1Reel();
    add(DB, 'vrai', 'Paul Martin', '+33622222222', 'apex-chat-direct', Date.now());
    add(DB, 'brouillon', 'Paul Martin', 'PENDING_X', sourceBrouillon, 0);
    DB.raw.prepare(`INSERT INTO messages (id,conv_id,sender_id,ciphertext,ts) VALUES ('m1','c1','vrai','x',1)`).run();
    const caller = DB.raw.prepare("SELECT * FROM users WHERE id='vrai'").get();
    const r = await autoHealPerson(ENV({ APEX_CHAT_DB: DB }), { ...caller });
    return { merged: r.merged, statut: DB.raw.prepare("SELECT status FROM users WHERE id='brouillon'").get().status };
  }
  it('un brouillon créé par une INVITATION (nom saisi par un tiers) n\'est pas absorbé', async () => {
    expect((await essai('user-invitation')).merged).toBe(0);
  });
  it('un compte vide sans numéro d\'une autre origine n\'est pas absorbé non plus', async () => {
    expect((await essai('apex-chat-direct')).merged).toBe(0);
  });
  it('un brouillon d\'appairage ou de SSO Apex rejoint toujours le vrai compte', async () => {
    expect((await essai('core_pair')).merged).toBe(1);
    expect((await essai('apex-sso')).merged).toBe(1);
  });
});


describe('comparaison de secrets à temps constant', () => {
  it('égalité exacte seulement', () => {
    expect(ctEq('abc', 'abc')).toBe(true);
    expect(ctEq('abc', 'abd')).toBe(false);
    expect(ctEq('abc', 'abcd')).toBe(false);
    expect(ctEq('', 'a')).toBe(false);
  });
  it('les routes de test CI l\'utilisent (plus de comparaison directe)', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../../workers/api-worker.js', import.meta.url).pathname, 'utf8');
    expect(src).not.toMatch(/hdr !== secret/);
    expect((src.match(/!ctEq\(hdr, secret\)/g) || []).length).toBe(2);
  });
});
