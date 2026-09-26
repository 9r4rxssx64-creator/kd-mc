/**
 * APEX v13 — Tests RÉGRESSION CRITIQUE auth (Round 1+2+3)
 *
 * Règle Kevin CLAUDE.md "🛡 RÈGLE ABSOLUE — JAMAIS RÉGRESSER" :
 * > "Tout fix livré = test de non-régression OBLIGATOIRE"
 *
 * Garde-fous protégés ici (NE JAMAIS retirer ces fixes sans replacement clean) :
 * - v12.240 : PIN per-user dans `apex_v13_pin_<uid>` ≠ `apex_v13_pin` admin global
 * - v12.241 : login exige nom + prénom + pin tous 3, JAMAIS substring sur 1 token
 * - v12.331 : SESSION_KEYS whitelist stricte (jamais effacer XP/streak/profil)
 * - v13.3.65 : strict matching MIN 2 tokens pour TOUS users (pas seulement prénom)
 * - v13.3.62 : Laurence "Saint-Polit" multi-formats reconnu
 *
 * Si UN test fail → PR refusée, régression critique détectée.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { auth } from '../../services/auth/auth.js';
import { store } from '../../core/store.js';

describe('REGRESSION auth — Kevin admin aliases (v13.3.65)', () => {
  it('REGRESSION #45/#46 — Kevin reconnu via alias canonique "Kevin DESARZENS"', () => {
    expect(auth.isKevinAdmin('Kevin DESARZENS')).toBe(true);
  });

  it('REGRESSION — Kevin reconnu en ordre inversé "DESARZENS Kevin"', () => {
    expect(auth.isKevinAdmin('DESARZENS Kevin')).toBe(true);
  });

  it('REGRESSION — Kevin reconnu lowercase "kevin desarzens"', () => {
    expect(auth.isKevinAdmin('kevin desarzens')).toBe(true);
  });

  it('REGRESSION — Kevin reconnu via email gmail', () => {
    expect(auth.isKevinAdmin('kevin.desarzens@gmail.com')).toBe(true);
  });

  it('REGRESSION — Kevin reconnu avec 3 tokens (KDMC ajouté)', () => {
    expect(auth.isKevinAdmin('Kevin Desarzens KDMC')).toBe(true);
  });

  it('REGRESSION SECU v13.3.65 — prénom seul "Kevin" REFUSÉ (tokens < 2)', () => {
    /* Sécurité Kevin "tout le monde pareil — pas seulement prénom" */
    expect(auth.isKevinAdmin('Kevin')).toBe(false);
  });

  it('REGRESSION SECU v13.3.65 — nom seul "Desarzens" REFUSÉ', () => {
    expect(auth.isKevinAdmin('Desarzens')).toBe(false);
  });

  it('REGRESSION SECU v13.3.65 — alias court "KDMC" seul REFUSÉ', () => {
    expect(auth.isKevinAdmin('KDMC')).toBe(false);
  });

  it('REGRESSION SECU #38 — substring partiel "Kev" REFUSÉ (token < 4 chars)', () => {
    expect(auth.isKevinAdmin('Kev')).toBe(false);
  });

  it("REGRESSION SECU #38 — Laurence ne match jamais Kevin (pas d'impersonation)", () => {
    expect(auth.isKevinAdmin('Laurence SAINT-POLIT')).toBe(false);
    expect(auth.isKevinAdmin('Laurent')).toBe(false);
    expect(auth.isKevinAdmin('Laurent DESARZENS')).toBe(false);
  });
});

describe('REGRESSION auth — login critique (v12.241)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('REGRESSION v12.241 — login refuse nom vide', async () => {
    const r = await auth.login('', '123456');
    expect(r.ok).toBe(false);
  });

  it('REGRESSION v12.241 — login refuse pin vide', async () => {
    const r = await auth.login('Kevin DESARZENS', '');
    expect(r.ok).toBe(false);
  });

  it('REGRESSION v12.241 — login refuse pin < 4 chars', async () => {
    const r = await auth.login('Kevin DESARZENS', '12');
    expect(r.ok).toBe(false);
  });

  it('REGRESSION v13.3.70 — login refuse single-token avec message actionnable', async () => {
    const r = await auth.login('Laurence', '123456');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/prénom|nom/i);
  });

  it('REGRESSION v13.3.62 — Laurence "Laurence Saint-Polit" reconnue', async () => {
    /* Premier login ne doit pas être rejeté pour user inconnu */
    const r = await auth.login('Laurence Saint-Polit', '123456');
    /* OK car premier login enregistre PIN, pas de "Nom non reconnu" */
    expect(r.ok).toBe(true);
  });

  it('REGRESSION v13.3.62 — Laurence ordre inversé "Saint-Polit Laurence" reconnue', async () => {
    const r = await auth.login('Saint-Polit Laurence', '123456');
    expect(r.ok).toBe(true);
  });
});

describe('REGRESSION SECU CRITIQUE — PIN per-user ≠ PIN admin (v12.240)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('REGRESSION #37 CRITIQUE — login user écrit dans apex_v13_pin_<uid> (PAS apex_v13_pin admin)', async () => {
    /* Premier login Laurence (preconfigured) avec PIN custom */
    const r = await auth.login('Laurence Saint-Polit', '999888');
    expect(r.ok).toBe(true);

    /* CRITIQUE : la clé admin globale `apex_v13_pin` ne doit JAMAIS être touchée */
    expect(localStorage.getItem('apex_v13_pin')).toBeNull();

    /* Le PIN user DOIT être dans clé scopée */
    expect(localStorage.getItem('apex_v13_pin_laurence_sp')).not.toBeNull();
  });

  it("REGRESSION #37 CRITIQUE — login admin écrit dans apex_v13_pin global (réservé admin)", async () => {
    const r = await auth.login('Kevin DESARZENS', '777777');
    expect(r.ok).toBe(true);

    /* PIN admin DOIT être dans clé globale */
    expect(localStorage.getItem('apex_v13_pin')).not.toBeNull();
    /* Et NE doit PAS être dans clé scopée admin */
    expect(localStorage.getItem('apex_v13_pin_kdmc_admin')).toBeNull();
  });

  it('REGRESSION #37 CRITIQUE — Laurence ne peut JAMAIS écraser le PIN admin', async () => {
    /* 1. Admin set son PIN */
    await auth.login('Kevin DESARZENS', '111111');
    const adminPinBefore = localStorage.getItem('apex_v13_pin');
    expect(adminPinBefore).not.toBeNull();

    /* 2. Laurence se logue avec son propre PIN */
    auth.logout();
    await auth.login('Laurence Saint-Polit', '222222');

    /* 3. CRITIQUE : PIN admin globale INCHANGÉ */
    const adminPinAfter = localStorage.getItem('apex_v13_pin');
    expect(adminPinAfter).toBe(adminPinBefore);
  });
});

describe('REGRESSION CRITIQUE — SESSION_KEYS whitelist (v12.331)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('REGRESSION #44 COMMERCIAL — logout NE doit PAS effacer XP/streak/profil', async () => {
    /* Setup : user connecté avec données critiques business */
    await auth.login('Kevin DESARZENS', '123456');

    /* Données qui ne doivent JAMAIS être effacées (anti-pattern v12.297→330) */
    localStorage.setItem('ax_xp_kdmc_admin', '5500');
    localStorage.setItem('ax_streak_kdmc_admin', '42');
    localStorage.setItem('ax_streak_last_day', '2026-05-08');
    localStorage.setItem('ax_login_streak', '14');
    localStorage.setItem('ax_persistent_memory_kdmc_admin', JSON.stringify([{ fact: 'Allergie crustacés' }]));
    localStorage.setItem('ax_kb_kdmc_admin', JSON.stringify({ instructions: 'Mode professionnel' }));
    localStorage.setItem('ax_anthropic_key', 'AXENC1:fake-encrypted-payload');
    localStorage.setItem('ax_lessons_learned_struct', JSON.stringify([{ category: 'auto-fix' }]));

    /* Action : logout */
    auth.logout();

    /* CRITIQUE — Test mental Kevin v12.331 :
       "Si je commercialise demain, est-ce qu'un client garde sa progression entre 2 connexions ?"
       Toutes ces clés DOIVENT survivre au logout. */
    expect(localStorage.getItem('ax_xp_kdmc_admin')).toBe('5500');
    expect(localStorage.getItem('ax_streak_kdmc_admin')).toBe('42');
    expect(localStorage.getItem('ax_streak_last_day')).toBe('2026-05-08');
    expect(localStorage.getItem('ax_login_streak')).toBe('14');
    expect(localStorage.getItem('ax_persistent_memory_kdmc_admin')).not.toBeNull();
    expect(localStorage.getItem('ax_kb_kdmc_admin')).not.toBeNull();
    expect(localStorage.getItem('ax_anthropic_key')).toBe('AXENC1:fake-encrypted-payload');
    expect(localStorage.getItem('ax_lessons_learned_struct')).not.toBeNull();
  });

  it('REGRESSION v12.331 — logout efface uniquement les SESSION_KEYS strict', async () => {
    await auth.login('Kevin DESARZENS', '123456');

    /* Avant logout : session keys présentes */
    expect(localStorage.getItem('apex_v13_user')).not.toBeNull();
    expect(localStorage.getItem('apex_v13_uid')).not.toBeNull();

    auth.logout();

    /* Session keys effacées */
    expect(localStorage.getItem('apex_v13_user')).toBeNull();
    expect(localStorage.getItem('apex_v13_uid')).toBeNull();
    expect(store.get('user')).toBeNull();
    expect(store.get('isAdmin')).toBe(false);
  });

  it('REGRESSION v12.331 — login → logout → re-login préserve PIN admin global', async () => {
    /* Cycle complet login/logout/relogin (scénario commercial) */
    await auth.login('Kevin DESARZENS', '123456');
    const pinBefore = localStorage.getItem('apex_v13_pin');

    auth.logout();
    /* PIN admin DOIT survivre */
    expect(localStorage.getItem('apex_v13_pin')).toBe(pinBefore);

    /* Re-login DOIT marcher avec même PIN */
    const r = await auth.login('Kevin DESARZENS', '123456');
    expect(r.ok).toBe(true);
  });
});

describe('TEST MENTAL OBLIGATOIRE Kevin (CLAUDE.md règle "JAMAIS RÉGRESSER")', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('Test mental: Si Kevin force-reset Apex maintenant, garde-t-il (1) clés API, (2) XP/streak/profil ?', async () => {
    /* Setup état Kevin admin */
    await auth.login('Kevin DESARZENS', '200807');
    localStorage.setItem('ax_xp_kdmc_admin', '12000');
    localStorage.setItem('ax_streak_kdmc_admin', '99');
    localStorage.setItem('ax_anthropic_key', 'AXENC1:encrypted-anthropic');
    localStorage.setItem('ax_openai_key', 'AXENC1:encrypted-openai');
    localStorage.setItem('ax_persistent_memory_kdmc_admin', JSON.stringify([
      { fact: 'Casino Monaco', importance: 90 },
      { fact: 'Marié à Laurence', importance: 95 },
    ]));

    /* Force-reset = logout (scénario "réinstallation PWA") */
    auth.logout();

    /* (1) Clés API préservées */
    expect(localStorage.getItem('ax_anthropic_key')).toBe('AXENC1:encrypted-anthropic');
    expect(localStorage.getItem('ax_openai_key')).toBe('AXENC1:encrypted-openai');

    /* (2) XP/streak/profil préservés */
    expect(localStorage.getItem('ax_xp_kdmc_admin')).toBe('12000');
    expect(localStorage.getItem('ax_streak_kdmc_admin')).toBe('99');
    expect(localStorage.getItem('ax_persistent_memory_kdmc_admin')).not.toBeNull();
  });
});
