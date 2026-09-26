/**
 * Test régression v13.4.15 — Classification FB_LOCAL vs FB_FIX (sécurité).
 *
 * Audit externe v13.4.12 P1 : commentaire trompeur ligne services/firebase.ts:145
 * disait "sync cross-device + survit clear cache PWA" pour apex_v13_pin_laurence_sp
 * mais la clé était dans FB_LOCAL (donc PAS synchronisée).
 *
 * Règle CLAUDE.md absolue (Erreur #40) :
 * - ax_user/uid/pin JAMAIS dans FB_FIX (vecteur d'exfiltration cross-device)
 * - Identité user + biométrique = FB_LOCAL strict
 *
 * Anti-régression : si quelqu'un déplace apex_v13_pin_laurence_sp dans FB_FIX
 * par accident, ce test fail et bloque commit.
 */
import { describe, it, expect } from 'vitest';
import { FB_FIX, FB_LOCAL } from '../../services/storage/firebase.js';

describe('v13.4.15 FB_LOCAL/FB_FIX classification (sécurité critique)', () => {
  it("apex_v13_pin (admin global) doit être dans FB_LOCAL", () => {
    expect(FB_LOCAL).toContain('apex_v13_pin');
    expect(FB_FIX).not.toContain('apex_v13_pin');
  });

  it("apex_v13_pin_laurence_sp doit être dans FB_LOCAL (anti-Erreur #40)", () => {
    expect(FB_LOCAL).toContain('apex_v13_pin_laurence_sp');
    expect(FB_FIX).not.toContain('apex_v13_pin_laurence_sp');
  });

  it("apex_v13_user (identité) doit être dans FB_LOCAL (Erreur #40 critique)", () => {
    expect(FB_LOCAL).toContain('apex_v13_user');
    expect(FB_FIX).not.toContain('apex_v13_user');
  });

  it("apex_v13_uid doit être dans FB_LOCAL (anti-cross-device pollution)", () => {
    expect(FB_LOCAL).toContain('apex_v13_uid');
    expect(FB_FIX).not.toContain('apex_v13_uid');
  });

  it("ax_voice_print_ (biométrique) doit être dans FB_LOCAL (RGPD + sécu)", () => {
    expect(FB_LOCAL).toContain('ax_voice_print_');
    expect(FB_FIX).not.toContain('ax_voice_print_');
  });

  it("apex_v13_session doit être dans FB_LOCAL", () => {
    expect(FB_LOCAL).toContain('apex_v13_session');
    expect(FB_FIX).not.toContain('apex_v13_session');
  });

  it("AUCUNE clé identité/auth/biométrique dans FB_FIX (audit complet)", () => {
    const dangerousPatterns = [/^apex_v13_user/, /^apex_v13_uid/, /^apex_v13_pin/, /^ax_voice_print/, /apex_v13_session/];
    for (const key of FB_FIX) {
      for (const pattern of dangerousPatterns) {
        expect(pattern.test(key)).toBe(false);
      }
    }
  });

  it("FB_LOCAL et FB_FIX n'ont AUCUN overlap (mutuellement exclusifs)", () => {
    const fbFixSet = new Set(FB_FIX);
    for (const localKey of FB_LOCAL) {
      expect(fbFixSet.has(localKey)).toBe(false);
    }
  });
});
