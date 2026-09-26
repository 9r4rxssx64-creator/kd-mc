// Verrou « fermeture porte admin » v1.1.283 — audit 2026-09-05, faille P0.
//
// Le bypass admin (numéro de Kevin + otp '000000') délivrait un JWT admin sans
// aucune preuve de possession. Le drapeau ADMIN_BYPASS_REQUIRE_MFA impose en
// plus le jeton secret X-Apex-Admin-Token (== APEX_CHAT_ADMIN_TOKEN), absent de
// la page publique.
//
// On vérifie les 3 comportements :
//   - drapeau OFF  → accès admin comme avant (aucun lockout à l'activation).
//   - drapeau ON + jeton correct   → accès admin accordé.
//   - drapeau ON + jeton absent/faux → 401 admin_mfa_required (porte fermée).
//
// Prouvé discriminant : retirer la garde `ADMIN_BYPASS_REQUIRE_MFA` du worker
// → le 3e test échoue (l'inconnu redeviendrait admin).

import { describe, it, expect } from 'vitest';
import { handleVerifyOtp } from '../../workers/api-worker.js';

const KEVIN = '+33600000001';

function makeDB() {
  const stmt = () => ({
    bind: () => ({
      first: async () => null,          // kdmc_admin n'existe pas encore → insert
      run: async () => ({ success: true }),
      all: async () => ({ results: [] }),
    }),
    first: async () => null,
    run: async () => ({}),
    all: async () => ({ results: [] }),
  });
  return { prepare: stmt };
}

function baseEnv(extra) {
  return {
    KEVIN_PHONE_E164: KEVIN,
    JWT_SIGN_KEY: 'a'.repeat(64),
    ALLOW_TEST_OTP: 'false',
    APEX_CHAT_ADMIN_TOKEN: 'SECRET-ADMIN-XYZ',
    APEX_CHAT_DB: makeDB(),
    ...extra,
  };
}

function req(headers = {}) {
  return new Request('https://x/api/auth/verify-otp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ phone: KEVIN, pseudo: 'kevin', name: 'Kevin Desarzens', otp: '000000' }),
  });
}

describe('Fermeture porte admin — ADMIN_BYPASS_REQUIRE_MFA', () => {
  it('OFF (défaut) : le bypass admin fonctionne comme avant (pas de lockout)', async () => {
    const res = await handleVerifyOtp(req(), baseEnv({ ADMIN_BYPASS_REQUIRE_MFA: 'false' }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.user?.is_admin).toBe(true);
    expect(body.token).toBeTruthy();
  });

  it('ON + jeton correct : accès admin accordé', async () => {
    const env = baseEnv({ ADMIN_BYPASS_REQUIRE_MFA: 'true' });
    const res = await handleVerifyOtp(req({ 'X-Apex-Admin-Token': 'SECRET-ADMIN-XYZ' }), env);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.user?.is_admin).toBe(true);
  });

  it('ON + jeton absent : porte fermée (401, pas de JWT admin)', async () => {
    const env = baseEnv({ ADMIN_BYPASS_REQUIRE_MFA: 'true' });
    const res = await handleVerifyOtp(req(), env); // aucun header admin
    const body = await res.json();
    expect(res.status).toBe(401);
    expect(body.code || body.error).toBe('admin_mfa_required');
    expect(body.token).toBeFalsy();
  });

  it('ON + jeton faux : porte fermée (401)', async () => {
    const env = baseEnv({ ADMIN_BYPASS_REQUIRE_MFA: 'true' });
    const res = await handleVerifyOtp(req({ 'X-Apex-Admin-Token': 'MAUVAIS' }), env);
    const body = await res.json();
    expect(res.status).toBe(401);
    expect(body.token).toBeFalsy();
  });
});
