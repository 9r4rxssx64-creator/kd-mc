/**
 * v13.4.321 — Activation IA en 1 tap (Kevin « tout auto » / « mets mon code »).
 * v13.4.322 (Kevin « code incorrect » alors que le code est bon) : on NE valide
 * plus localement (apex_v13_pin absent/instable au login trusted). Le code est
 * stocké chiffré dans ax_pin_kdmc_admin et le PROXY est la source de vérité
 * (sha256(code) == APEX_ADMIN_PIN_SHA256 côté serveur). Câblé dans test:ci.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { activateWithCode, needsProxyPinActivation, promptProxyPinActivation } from '../../services/auth/proxy-pin-activation.js';

describe('v13.4.321 — activation IA 1-tap', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('apex_v13_uid', 'kdmc_admin');
  });
  afterEach(() => localStorage.clear());

  it('needs = true : admin + proxy activé + code absent + aucune clé locale', () => {
    localStorage.setItem('apex_v13_use_secrets_proxy', 'true');
    expect(needsProxyPinActivation()).toBe(true);
  });

  it('needs = false si le code est déjà en mémoire', () => {
    localStorage.setItem('apex_v13_use_secrets_proxy', 'true');
    localStorage.setItem('ax_pin_kdmc_admin', 'déjà-là');
    expect(needsProxyPinActivation()).toBe(false);
  });

  it('needs = false si une clé locale existe', () => {
    localStorage.setItem('apex_v13_use_secrets_proxy', 'true');
    localStorage.setItem('ax_anthropic_key', 'sk-ant-xxx');
    expect(needsProxyPinActivation()).toBe(false);
  });

  it('needs = false si proxy off', () => {
    expect(needsProxyPinActivation()).toBe(false);
  });

  it('activateWithCode : stocke le code chiffré (validation déléguée au proxy)', async () => {
    /* v322 : plus de validation locale — le code est stocké, le proxy valide. */
    const good = await activateWithCode('200807');
    expect(good.ok).toBe(true);
    const { vault } = await import('../../services/vault/vault.js');
    expect(await vault.readKey('ax_pin_kdmc_admin')).toBe('200807'); /* stocké pour le proxy */
  });

  it('activateWithCode : refuse un code trop court (<4)', async () => {
    expect((await activateWithCode('12')).ok).toBe(false);
    expect(localStorage.getItem('ax_pin_kdmc_admin')).toBeNull();
  });

  it('overlay : ne s’affiche PAS si non nécessaire (proxy off)', () => {
    promptProxyPinActivation();
    expect(document.getElementById('apex-pin-activate')).toBeNull();
  });

  it('overlay : s’affiche quand nécessaire, code saisi → stocke + se ferme', async () => {
    localStorage.setItem('apex_v13_use_secrets_proxy', 'true');
    promptProxyPinActivation();
    const input = document.getElementById('apex-pin-activate-input') as HTMLInputElement | null;
    expect(input).toBeTruthy();
    input!.value = '200807';
    (document.getElementById('apex-pin-activate-ok') as HTMLButtonElement).click();
    /* PBKDF2 200k est lent → poll jusqu'à fermeture de l'overlay (max ~3 s). */
    for (let i = 0; i < 60 && document.getElementById('apex-pin-activate'); i++) {
      await new Promise((r) => setTimeout(r, 50));
    }
    const { vault } = await import('../../services/vault/vault.js');
    expect(await vault.readKey('ax_pin_kdmc_admin')).toBe('200807');
    expect(document.getElementById('apex-pin-activate')).toBeNull(); /* fermé après succès */
  });
});
