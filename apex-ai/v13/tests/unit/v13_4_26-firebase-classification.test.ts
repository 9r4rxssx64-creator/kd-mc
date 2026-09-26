/**
 * Test régression v13.4.26 — services/firebase.ts (shouldSync + isLocalOnly).
 *
 * Module CRITIQUE sécu : décide quels keys sync vers Firebase RTDB et lesquels
 * restent localStorage strict (cf. règle CLAUDE.md Erreur #40 anti-régression
 * "ax_user JAMAIS dans FB_FIX").
 *
 * Complète v13.4.15 (qui testait juste membership FB_LOCAL/FB_FIX) en testant
 * les helpers shouldSync + isLocalOnly avec préfixes longs.
 */
import { describe, it, expect } from 'vitest';
import { firebase, FB_FIX, FB_LOCAL } from '../../services/storage/firebase.js';

describe('v13.4.26 firebase.shouldSync — whitelist FB_FIX strict', () => {
  it("key dans FB_FIX → shouldSync true", () => {
    /* Prendre la 1ère key de FB_FIX comme cas réaliste */
    if (FB_FIX.length > 0) {
      expect(firebase.shouldSync(FB_FIX[0] ?? '')).toBe(true);
    }
  });

  it("key NON dans FB_FIX → shouldSync false", () => {
    expect(firebase.shouldSync('random_unknown_key_xyz')).toBe(false);
    expect(firebase.shouldSync('')).toBe(false);
  });

  it("key qui RESSEMBLE à FB_FIX mais pas exact → false (pas de prefix match)", () => {
    /* shouldSync est exact match, pas startsWith */
    if (FB_FIX.length > 0) {
      const fbFixKey = FB_FIX[0] ?? '';
      expect(firebase.shouldSync(fbFixKey + '_suffix')).toBe(false);
    }
  });

  it("apex_v13_user (identité) → shouldSync false (anti-régression #40 CRITIQUE)", () => {
    expect(firebase.shouldSync('apex_v13_user')).toBe(false);
  });

  it("apex_v13_uid → shouldSync false (anti-régression #40)", () => {
    expect(firebase.shouldSync('apex_v13_uid')).toBe(false);
  });

  it("apex_v13_pin (admin) → shouldSync false (PIN local strict)", () => {
    expect(firebase.shouldSync('apex_v13_pin')).toBe(false);
  });

  it("apex_v13_pin_laurence_sp → shouldSync false (PIN per-user local v13.4.15)", () => {
    expect(firebase.shouldSync('apex_v13_pin_laurence_sp')).toBe(false);
  });

  it("ax_voice_print_<uid> → shouldSync false (RGPD biométrique strict)", () => {
    expect(firebase.shouldSync('ax_voice_print_kdmc_admin')).toBe(false);
  });
});

describe('v13.4.26 firebase.isLocalOnly — préfix match FB_LOCAL', () => {
  it("apex_v13_user EXACT → isLocalOnly true", () => {
    expect(firebase.isLocalOnly('apex_v13_user')).toBe(true);
  });

  it("apex_v13_uid EXACT → isLocalOnly true", () => {
    expect(firebase.isLocalOnly('apex_v13_uid')).toBe(true);
  });

  it("apex_v13_pin EXACT → isLocalOnly true (PIN admin)", () => {
    expect(firebase.isLocalOnly('apex_v13_pin')).toBe(true);
  });

  it("apex_v13_pin_laurence_sp EXACT → isLocalOnly true (v13.4.15)", () => {
    expect(firebase.isLocalOnly('apex_v13_pin_laurence_sp')).toBe(true);
  });

  it("ax_voice_print_<uid> via PREFIX match → isLocalOnly true (RGPD biométrique)", () => {
    /* ax_voice_print_ est un préfixe ; toute clé qui commence par doit matcher */
    expect(firebase.isLocalOnly('ax_voice_print_kdmc_admin')).toBe(true);
    expect(firebase.isLocalOnly('ax_voice_print_laurence_sp')).toBe(true);
    expect(firebase.isLocalOnly('ax_voice_print_anyone')).toBe(true);
  });

  it("apex_v13_lastact EXACT → isLocalOnly true", () => {
    expect(firebase.isLocalOnly('apex_v13_lastact')).toBe(true);
  });

  it("apex_v13_session EXACT → isLocalOnly true", () => {
    expect(firebase.isLocalOnly('apex_v13_session')).toBe(true);
  });

  it("clé inconnue → isLocalOnly false", () => {
    expect(firebase.isLocalOnly('apex_v13_unknown_key')).toBe(false);
    expect(firebase.isLocalOnly('random')).toBe(false);
    expect(firebase.isLocalOnly('')).toBe(false);
  });

  it("clé qui contient mais pas commence par préfixe → false", () => {
    /* 'apex_v13_user' commence bien — testons un cas qui contient mais pas commence */
    expect(firebase.isLocalOnly('prefix_apex_v13_user')).toBe(false);
    expect(firebase.isLocalOnly('xxx_ax_voice_print_uid')).toBe(false);
  });
});

describe('v13.4.26 FB_FIX et FB_LOCAL intégrité (anti-régression CLAUDE.md)', () => {
  it("FB_FIX et FB_LOCAL mutuellement exclusifs (zéro overlap)", () => {
    const fbFixSet = new Set(FB_FIX);
    for (const localKey of FB_LOCAL) {
      expect(fbFixSet.has(localKey)).toBe(false);
    }
  });

  it("AUCUNE clé identité/auth/biométrique dans FB_FIX (audit profond)", () => {
    /* Patterns dangereux qui NE DOIVENT JAMAIS être dans FB_FIX */
    const dangerous = [
      /^apex_v13_user($|_)/,
      /^apex_v13_uid$/,
      /^apex_v13_pin/,
      /^ax_voice_print/,
      /^apex_v13_session/,
      /^apex_v13_lastact$/,
    ];
    for (const key of FB_FIX) {
      for (const pattern of dangerous) {
        expect(pattern.test(key)).toBe(false);
      }
    }
  });

  it("FB_FIX ≥ 30 entrées (couverture credentials suffisante)", () => {
    expect(FB_FIX.length).toBeGreaterThanOrEqual(30);
  });

  it("FB_LOCAL contient les 7 clés sécurité critique", () => {
    expect(FB_LOCAL).toContain('apex_v13_user');
    expect(FB_LOCAL).toContain('apex_v13_uid');
    expect(FB_LOCAL).toContain('apex_v13_pin');
    expect(FB_LOCAL).toContain('apex_v13_pin_laurence_sp');
    expect(FB_LOCAL).toContain('apex_v13_session');
    expect(FB_LOCAL).toContain('apex_v13_lastact');
    expect(FB_LOCAL).toContain('ax_voice_print_');
  });
});

describe('v13.4.26 firebase singleton intégrité', () => {
  it("firebase exporte un singleton avec méthodes attendues", () => {
    expect(typeof firebase.shouldSync).toBe('function');
    expect(typeof firebase.isLocalOnly).toBe('function');
  });
});
