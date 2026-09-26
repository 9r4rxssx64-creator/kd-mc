/**
 * Test régression v13.4.110 — Auto Service Finder (Kevin "cherche bon
 * emplacement autonome jusqu'à trouver sans s'arrêter").
 *
 * Vérifie l'API surface SANS faire d'appels réseau (mocks tests réels via
 * Playwright iOS Simulator workflow).
 */
import { describe, it, expect } from 'vitest';
import { apexAutoServiceFinder } from '../../services/integrations/apex-auto-service-finder.js';

describe('v13.4.110 apexAutoServiceFinder', () => {
  it("findServiceForToken refuse token trop court", async () => {
    const r = await apexAutoServiceFinder.findServiceForToken('abc');
    expect(r.ok).toBe(false);
    expect(r.matches.length).toBe(0);
    expect(r.tested_count).toBe(0);
  });

  it("findServiceForToken signature retourne FindServiceResult", async () => {
    /* Test sans réseau réel : token random qui ne match aucun service.
     * Tous services retournent KO/timeout → ok=false mais structure correcte. */
    const r = await apexAutoServiceFinder.findServiceForToken('definitelynotavalidkey1234567890');
    expect(typeof r.ok).toBe('boolean');
    expect(Array.isArray(r.matches)).toBe(true);
    expect(typeof r.tested_count).toBe('number');
    expect(typeof r.duration_ms).toBe('number');
    expect(r.tested_count).toBeGreaterThan(15); /* 23+ services configurés */
  }, 30_000);
});
