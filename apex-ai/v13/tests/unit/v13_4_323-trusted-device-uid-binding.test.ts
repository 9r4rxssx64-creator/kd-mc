/**
 * v13.4.323 — Régression sécurité (audit) :
 *  1) loginTrusted lie le trust device à l'UID qui l'a établi → empêche
 *     l'auto-login SANS PIN en tant qu'un AUTRE utilisateur sur un device de
 *     confiance (impersonation, ex: devenir admin sur le device de Laurence).
 *  2) generateSSOToken ne pousse PLUS les bearer tokens vers Firebase
 *     (exposition cross-user sur le chemin /apex ouvert).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

/* device-context : empreinte fixe pour que le check fingerprint matche. */
vi.mock('../../services/integrations/device-context.js', () => ({
  deviceContext: { getFingerprint: vi.fn(async () => ({ device_id: 'fp1' })) },
}));

/* firebase : spy pour PROUVER qu'aucune écriture SSO globale n'a lieu. */
const fbWrite = vi.fn();
vi.mock('../../services/storage/firebase.js', () => ({
  firebase: { write: fbWrite, read: vi.fn(), onChange: vi.fn() },
}));

import { auth } from '../../services/auth/auth.js';
import { authGate } from '../../services/auth/auth-gate.js';
import { store } from '../../core/store.js';

describe('v13.4.323 — trust device lié à l\'UID (anti-impersonation)', () => {
  beforeEach(() => {
    localStorage.clear();
    store.init({ appVer: 'v13.4.323' });
    fbWrite.mockClear();
  });

  it('device trusté par laurence_sp → loginTrusted("laurence_sp") OK', async () => {
    localStorage.setItem('apex_v13_device_trusted_v1', 'fp1');
    localStorage.setItem('apex_v13_device_trusted_uid_v1', 'laurence_sp');
    const r = await auth.loginTrusted('laurence_sp', 'Laurence');
    expect(r.ok).toBe(true);
  });

  it('device trusté par laurence_sp → loginTrusted("kdmc_admin") REFUSÉ', async () => {
    localStorage.setItem('apex_v13_device_trusted_v1', 'fp1');
    localStorage.setItem('apex_v13_device_trusted_uid_v1', 'laurence_sp');
    const r = await auth.loginTrusted('kdmc_admin', 'Kevin');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/autre utilisateur/i);
    /* Ne s'est PAS logué admin */
    expect(store.get('isAdmin')).not.toBe(true);
  });

  it('legacy (pas de binding UID) : seul le dernier user connu passe, puis migration', async () => {
    localStorage.setItem('apex_v13_device_trusted_v1', 'fp1');
    localStorage.setItem('apex_v13_last_known_uid', 'laurence_sp');
    const r = await auth.loginTrusted('laurence_sp', 'Laurence');
    expect(r.ok).toBe(true);
    /* Le binding a été migré */
    expect(localStorage.getItem('apex_v13_device_trusted_uid_v1')).toBe('laurence_sp');
  });

  it('legacy : un UID différent du dernier connu est REFUSÉ', async () => {
    localStorage.setItem('apex_v13_device_trusted_v1', 'fp1');
    localStorage.setItem('apex_v13_last_known_uid', 'laurence_sp');
    const r = await auth.loginTrusted('kdmc_admin', 'Kevin');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/autre utilisateur/i);
  });

  it('untrustCurrentDevice efface aussi le binding UID', () => {
    localStorage.setItem('apex_v13_device_trusted_v1', 'fp1');
    localStorage.setItem('apex_v13_device_trusted_uid_v1', 'laurence_sp');
    auth.untrustCurrentDevice();
    expect(localStorage.getItem('apex_v13_device_trusted_v1')).toBeNull();
    expect(localStorage.getItem('apex_v13_device_trusted_uid_v1')).toBeNull();
  });
});

describe('v13.4.323 — SSO token jamais poussé vers Firebase', () => {
  beforeEach(() => {
    localStorage.clear();
    store.init({ appVer: 'v13.4.323' });
    fbWrite.mockClear();
  });

  it('generateSSOToken stocke localement SANS écrire Firebase', () => {
    const t = authGate.generateSSOToken('laurence_sp');
    expect(t.token).toMatch(/^sso_/);
    /* Aucune écriture Firebase du chemin global apex_v13_sso_tokens */
    const wroteSso = fbWrite.mock.calls.some((c) => String(c[0]).includes('sso_tokens'));
    expect(wroteSso).toBe(false);
    /* Toujours fonctionnel localement */
    expect(authGate.verifySSOToken(t.token, 'laurence_sp')).toBe(true);
  });
});
