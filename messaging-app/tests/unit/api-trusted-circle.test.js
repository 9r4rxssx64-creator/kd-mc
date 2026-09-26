/**
 * Tests api-worker.js — cercle de confiance (v1.1.216)
 * Kevin « trouve une solution pour faire à ma place » : Laurence + famille/amis
 * configurés se connectent SANS SMS. SEULS les numéros explicitement configurés
 * par Kevin passent (pas un backdoor universel). Kevin = bypass admin séparé.
 */
import { describe, it, expect } from 'vitest';
import worker, { _trustedCircleSet, _isTrustedCircle, _dbTrustedCircleList, _isTrustedCircleAsync, handleVerifyOtp } from '../../workers/api-worker.js';
import { ENV, makeRequest } from './api-worker-helpers.js';

function dbWith(value) {
  return { APEX_CHAT_DB: { prepare: () => ({ bind() { return this; }, async first() { return value === undefined ? null : { value }; } }) } };
}

describe('cercle de confiance (v1.1.216)', () => {
  it('inclut LAURENCE_PHONE_E164 + TRUSTED_CIRCLE_PHONES, exclut Kevin', () => {
    const env = {
      KEVIN_PHONE_E164: '+33600000001',
      LAURENCE_PHONE_E164: '+33611111111',
      TRUSTED_CIRCLE_PHONES: '+33622222222, +33633333333',
    };
    const set = _trustedCircleSet(env);
    expect(set.has('+33611111111')).toBe(true);
    expect(set.has('+33622222222')).toBe(true);
    expect(set.has('+33633333333')).toBe(true);
    expect(set.has('+33600000001')).toBe(false); // Kevin = admin séparé
  });

  it('_isTrustedCircle matche le format national (0X) ↔ international (+33X)', () => {
    const env = { LAURENCE_PHONE_E164: '+33611111111' };
    expect(_isTrustedCircle('+33611111111', env)).toBe(true);
    expect(_isTrustedCircle('0611111111', env)).toBe(true);   // normPhone 0X→+33X
    expect(_isTrustedCircle('+33699999999', env)).toBe(false);
  });

  it('env vide → AUCUN numéro de confiance (pas de backdoor universel)', () => {
    expect(_trustedCircleSet({}).size).toBe(0);
    expect(_isTrustedCircle('+33611111111', {})).toBe(false);
    expect(_isTrustedCircle('+33611111111', undefined)).toBe(false);
  });

  it('Kevin seul configuré → cercle vide (il a son propre bypass admin)', () => {
    const set = _trustedCircleSet({ KEVIN_PHONE_E164: '+33600000001' });
    expect(set.size).toBe(0);
  });
});

describe('cercle de confiance — géré en base / self-service (v1.1.218)', () => {
  it('_dbTrustedCircleList lit + normalise le JSON array de system_config', async () => {
    const list = await _dbTrustedCircleList(dbWith(JSON.stringify(['+33600000010', '0612000000'])));
    expect(list).toContain('+33600000010');
    expect(list).toContain('+33612000000'); // 0X → +33X normalisé
  });

  it('_dbTrustedCircleList : vide / JSON invalide / non-array → []', async () => {
    expect(await _dbTrustedCircleList(dbWith(undefined))).toEqual([]);
    expect(await _dbTrustedCircleList(dbWith('pas du json'))).toEqual([]);
    expect(await _dbTrustedCircleList(dbWith(JSON.stringify({ a: 1 })))).toEqual([]);
  });

  it('_isTrustedCircleAsync : vrai si numéro en ENV OU en base', async () => {
    const env = {
      LAURENCE_PHONE_E164: '+33611111111',
      APEX_CHAT_DB: { prepare: () => ({ bind() { return this; }, async first() { return { value: JSON.stringify(['+33600000010']) }; } }) },
    };
    expect(await _isTrustedCircleAsync(env, '+33611111111')).toBe(true);  // env
    expect(await _isTrustedCircleAsync(env, '0600000010')).toBe(true);    // base (format national)
    expect(await _isTrustedCircleAsync(env, '+33699999999')).toBe(false); // ni l'un ni l'autre
  });

  // v1.x — SÉCU P1-1 (Kevin « annule cercle confiance ») : le bypass sans OTP est SUPPRIMÉ.
  it('BYPASS SUPPRIMÉ : un numéro de confiance SANS OTP est refusé (preuve de possession exigée)', async () => {
    const env = ENV({ LAURENCE_PHONE_E164: '+33611111111' });
    // verify-otp avec le numéro de confiance mais NI otp NI firebase_id_token
    const res = await handleVerifyOtp(makeRequest({
      method: 'POST', path: '/api/auth/verify-otp',
      body: { phone: '+33611111111', pseudo: 'laurence', name: 'Laurence Martin' },
    }), env);
    expect(res.status).toBe(400);
    const d = await res.json();
    expect(d.error).toBe('no_auth_method'); // plus AUCune session émise sur le numéro seul
    expect(d.token).toBeUndefined();
  });
});
