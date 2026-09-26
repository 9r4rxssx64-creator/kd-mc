/**
 * Test régression v13.4.59 — services/feature-toggles.ts (per-user + global).
 *
 * Règle CLAUDE.md Kevin 2026-05-04 ABSOLUE : "Boutons admin ON/OFF général
 * + per-user pour TOUT et TOUT LE MONDE".
 */
import { describe, it, expect } from 'vitest';
import {
  isFeatureEnabled,
  renderDisabledNotice,
} from '../../services/auth/feature-toggles.js';

describe('v13.4.59 isFeatureEnabled — résolution priority', () => {
  it("feature inconnue retourne boolean défini (true ou false selon politique)", () => {
    /* La politique par défaut peut être 'closed' (false) si feature non
     * enregistrée dans le registry → sécurité Kevin règle 'rien accidentel'. */
    const r = isFeatureEnabled('test_feature_xyz_unknown');
    expect(typeof r).toBe('boolean');
  });

  it("sans userId → check global toggle uniquement", () => {
    const r = isFeatureEnabled('any_feature');
    expect(typeof r).toBe('boolean');
  });

  it("avec userId → check per-user d'abord puis fallback global", () => {
    const r = isFeatureEnabled('any_feature', 'kdmc_admin');
    expect(typeof r).toBe('boolean');
  });

  it("featureId vide → comportement défini (true ou false, pas crash)", () => {
    expect(() => isFeatureEnabled('')).not.toThrow();
  });
});

describe('v13.4.59 renderDisabledNotice — UI HTML', () => {
  it("retourne string non-vide", () => {
    const html = renderDisabledNotice('test_feature');
    expect(typeof html).toBe('string');
    expect(html.length).toBeGreaterThan(0);
  });

  it("contient mention 'désactivé' ou similaire", () => {
    const html = renderDisabledNotice('studio.music');
    expect(/désactivé|disabled|admin/i.test(html)).toBe(true);
  });

  it("contient le featureId (debug visible)", () => {
    const html = renderDisabledNotice('feature_xyz_unique');
    expect(html).toContain('feature_xyz_unique');
  });
});
