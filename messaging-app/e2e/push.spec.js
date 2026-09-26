// ════════════════════════════════════════════════════════════════════════
//  E2E PUSH/NOTIF — chaîne d'affichage réelle (Chromium uniquement)
//  Kevin (2026-06-09) : « Tu as testé aussi les notifs ? »
//  Couvre la partie automatisable : permission accordée → Service Worker →
//  showNotification → notif réellement créée (getNotifications). Sur la PROD.
//
//  Limite assumée : APNs (Apple) / FCM (Google) RÉELS = vrai device requis
//  → couvert par diag.html in-app (« Tester ma notif / micro / caméra »).
//  WebKit-iPhone (CI Linux) ne supporte pas la permission notifications de façon
//  fiable → tout ce fichier ne tourne que sur Chromium.
// ════════════════════════════════════════════════════════════════════════
import { test, expect } from '@playwright/test';

const APEX = process.env.APEX_CHAT_URL || 'https://9r4rxssx64-creator.github.io/CMCteams/messaging-app/';
const ORIGIN = new URL(APEX).origin;

test.describe('Notifications — chaîne SW → showNotification (Chromium)', () => {
  // Skip propre (pas un échec) sur tout navigateur non-Chromium.
  test.skip(({ browserName }) => browserName !== 'chromium', 'permission notifications fiable uniquement sur Chromium CI');

  test('permission accordée + le Service Worker affiche une notification', async ({ browser }) => {
    const ctx = await browser.newContext({ baseURL: APEX });
    // grantPermissions AVEC origin explicite : sinon Notification.permission reste
    // « default » et showNotification jette « No notification permission ».
    await ctx.grantPermissions(['notifications'], { origin: ORIGIN });
    const page = await ctx.newPage();
    try {
      await page.goto('./', { waitUntil: 'domcontentloaded', timeout: 45000 });

      const perm = await page.evaluate(() => (('Notification' in window) ? Notification.permission : 'unsupported'));
      // En CI headless, la permission n'est pas toujours accordable malgré
      // grantPermissions → on SKIP proprement (≠ bug app). La vraie preuve sur
      // device passe par diag.html (« Tester ma notif »). La logique d'affichage
      // est déjà couverte à 100% par sw-handlers.test.js.
      test.skip(perm !== 'granted', 'permission notifications non accordable en CI headless (' + perm + ') — testé sur device via diag.html');

      const result = await page.evaluate(async () => {
        if (!('serviceWorker' in navigator)) return { ok: false, why: 'no-serviceWorker' };
        const reg = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise((r) => setTimeout(() => r(null), 12000)),
        ]).catch(() => null) || await navigator.serviceWorker.getRegistration();
        if (!reg) return { ok: false, why: 'no-registration' };
        if (typeof reg.showNotification !== 'function') return { ok: false, why: 'no-showNotification' };
        try {
          await reg.showNotification('E2E test', { body: 'hello', tag: 'apex-e2e' });
          const notifs = await reg.getNotifications({ tag: 'apex-e2e' });
          const n = notifs.length;
          notifs.forEach((x) => x.close());
          return { ok: true, count: n };
        } catch (e) {
          return { ok: false, why: (e && e.name) + ': ' + (e && e.message) };
        }
      });

      expect(result.ok, 'showNotification a échoué : ' + (result.why || '')).toBe(true);
      expect(result.count, 'aucune notification affichée').toBeGreaterThanOrEqual(1);
    } finally {
      await ctx.close();
    }
  });
});
