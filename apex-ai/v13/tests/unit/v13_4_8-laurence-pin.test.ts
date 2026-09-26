/**
 * Tests v13.4.8 — Kevin "compte Laurence ne fonctionne pas correctement"
 * Vérifie flux complet PIN per-user Laurence (Erreur #37 anti-régression).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { auth } from '../../services/auth/auth.js';

describe('v13.4.8 — Laurence login flow + PIN per-user (anti-régression Erreur #37)', () => {
  beforeEach(() => {
    localStorage.clear();
    /* Reset auth in-memory state (rate-limits, etc) si besoin */
  });

  it('login Laurence accepte "Laurence Saint-Polit" + PIN', async () => {
    const r = await auth.login('Laurence Saint-Polit', '1234');
    expect(r.ok).toBe(true);
  });

  it('login Laurence accepte ordre inversé "Saint-Polit Laurence"', async () => {
    /* Premier login crée le PIN */
    await auth.login('Laurence Saint-Polit', '5678');
    /* 2nd device tente avec ordre inversé */
    const r = await auth.login('Saint-Polit Laurence', '5678');
    expect(r.ok).toBe(true);
  });

  it('login Laurence avec PIN avec tirets normalisés', async () => {
    /* Tirets dans le nom OK (normalize remplace par espaces) */
    const r = await auth.login('Laurence Saint-Polit', '9999');
    expect(r.ok).toBe(true);
  });

  it('PIN Laurence stocké dans apex_v13_pin_laurence_sp (PAS apex_v13_pin admin)', async () => {
    await auth.login('Laurence Saint-Polit', '1111');
    expect(localStorage.getItem('apex_v13_pin_laurence_sp')).toBeTruthy();
    expect(localStorage.getItem('apex_v13_pin')).toBeNull();
  });

  it('Erreur #37 anti-régression : Laurence PIN n\'écrase PAS apex_v13_pin admin Kevin', async () => {
    /* Kevin admin set son PIN d'abord */
    await auth.login('Kevin DESARZENS', '2008');
    const adminHash = localStorage.getItem('apex_v13_pin');
    expect(adminHash).toBeTruthy();

    /* Laurence se connecte ensuite */
    await auth.login('Laurence Saint-Polit', '1234');

    /* apex_v13_pin (admin Kevin) DOIT être préservé */
    expect(localStorage.getItem('apex_v13_pin')).toBe(adminHash);
    /* apex_v13_pin_laurence_sp distinct */
    expect(localStorage.getItem('apex_v13_pin_laurence_sp')).toBeTruthy();
    expect(localStorage.getItem('apex_v13_pin_laurence_sp')).not.toBe(adminHash);
  });

  it('Laurence non-admin (isAdmin=false)', async () => {
    const r = await auth.login('Laurence Saint-Polit', '1234');
    expect(r.ok).toBe(true);
    /* Read store.isAdmin */
    const { store } = await import('../../core/store.js');
    expect(store.get('isAdmin')).toBe(false);
  });

  it('Login Laurence avec prénom seul ECHOUE (sécurité min 2 tokens)', async () => {
    const r = await auth.login('Laurence', '1234');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/prénom.*nom/i);
  });

  it('Login Laurence avec mauvais PIN ECHOUE (timing-safe)', async () => {
    await auth.login('Laurence Saint-Polit', '1111'); /* setup PIN */
    const r = await auth.login('Laurence Saint-Polit', '2222'); /* mauvais PIN */
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/incorrect/i);
  });
});
