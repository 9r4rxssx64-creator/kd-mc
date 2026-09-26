/**
 * E2E navigateur RÉEL — abonnement push auto-réparé sur clé VAPID (v1.1.278).
 * Diag Kevin (v1.1.276) : Apple accepte (201) mais l'iPhone ne reçoit RIEN.
 * Racine : l'app s'abonnait avec une clé VAPID hardcodée ≠ clé de SIGNATURE du
 * worker → Apple DROP en silence. Fix : l'app lit la vraie clé du worker
 * (/health) et recrée l'abonnement avec elle.
 *
 * On prouve, dans le vrai bundle chargé : (1) le module push-key est câblé et
 * décide correctement ; (2) les helpers _subscribePush/_recreatePush/
 * _serverVapidKey existent (l'app boote avec les modifs) ; (3) _serverVapidKey
 * lit bien le champ vapidPublic renvoyé par /health (mocké).
 */
import { test, expect } from '@playwright/test';

test.describe('Abonnement push — cohérence clé VAPID (v1.1.278)', () => {
  test('module push-key câblé + helpers présents (l\'app boote)', async ({ page }) => {
    await page.goto('./', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForFunction(
      () => window.K && window.K._subscribePush && window.K._recreatePush
        && window.K._serverVapidKey && window.ApexPushKey,
      { timeout: 15000 },
    );
    const decide = await page.evaluate(() => {
      const P = window.ApexPushKey;
      const REAL = 'BJ5XN-ZzchRPPDVO4aEkFkhUOQC8E0tScaTKFXFBDq3o8MATBdRW879hSTLCTfH5mo3S_i5JOf1E4pTDALETBsY';
      const OTHER = 'BOtherKeyOtherKeyOtherKeyOtherKeyOtherKeyOtherKeyOtherKeyOtherKeyOtherKeyOtherKeyXYZ12';
      return {
        mismatchResub: P.needsResubscribe(OTHER, REAL, true), // clé différente → recréer
        matchKeep: P.needsResubscribe(REAL, REAL, true),       // identique → garder
        noSub: P.needsResubscribe('', REAL, false),            // pas d'abo → s'abonner
        failOpen: P.needsResubscribe(REAL, '', true),          // serveur muet → garder
        effServer: P.effectiveVapidKey(OTHER, REAL) === OTHER, // clé serveur = vérité
      };
    });
    expect(decide.mismatchResub).toBe(true);
    expect(decide.matchKeep).toBe(false);
    expect(decide.noSub).toBe(true);
    expect(decide.failOpen).toBe(false);
    expect(decide.effServer).toBe(true);
  });

  test('_serverVapidKey lit le champ vapidPublic renvoyé par /health', async ({ page }) => {
    const WORKER_KEY = 'BServerSigningKeyServerSigningKeyServerSigningKeyServerSigningKeyServerSigningKeyAB12';
    await page.route('**/apex-push-worker.*/health', async (route) => {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ ok: true, configured: true, vapidPublic: WORKER_KEY }),
      });
    });
    await page.goto('./', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForFunction(() => window.K && window.K._serverVapidKey, { timeout: 15000 });
    const key = await page.evaluate(() => window.K._serverVapidKey());
    expect(key).toBe(WORKER_KEY);
  });

  test('_serverVapidKey fail-open : /health en erreur → \'\' (jamais de blocage)', async ({ page }) => {
    await page.route('**/apex-push-worker.*/health', (route) => route.abort());
    await page.goto('./', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForFunction(() => window.K && window.K._serverVapidKey, { timeout: 15000 });
    const key = await page.evaluate(() => window.K._serverVapidKey());
    expect(key).toBe(''); // repli → l'appelant utilisera la clé embarquée
  });
});
