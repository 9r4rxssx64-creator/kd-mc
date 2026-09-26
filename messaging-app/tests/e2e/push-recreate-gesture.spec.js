/**
 * E2E navigateur RÉEL — recréation d'abonnement GESTURE-SAFE (v1.1.279).
 * Diag device Kevin (v1.1.278) : « ⚠️ Recréation impossible (permission/refus) ».
 * Cause : iOS EXIGE un geste utilisateur pour pushManager.subscribe() ; le faire
 * dans la branche 📭 (après le setTimeout 4,8 s) perd l'activation → throw.
 * Fix : subscribe IMMÉDIATEMENT, AUCUN fetch réseau avant (les awaits réseau
 * — purge + register — viennent APRÈS subscribe).
 *
 * On prouve l'INVARIANT clé : dans _recreatePushInGesture, subscribe() est
 * appelé AVANT tout fetch, avec la clé embarquée (VAPID_PUBLIC), et l'ancien
 * abonnement est désabonné (recréation). pushManager mocké + ordre enregistré.
 */
import { test, expect } from '@playwright/test';

async function bootWithPushMock(page) {
  // Installe un pushManager factice + journalise l'ORDRE des opérations AVANT
  // le chargement de l'app (les modules lisent navigator.serviceWorker au boot).
  await page.addInitScript(() => {
    window.__ops = [];
    const fakeOld = {
      endpoint: 'https://old.push.example/ep-STALE',
      unsubscribe: async () => { window.__ops.push('unsubscribe'); return true; },
    };
    const fakeNew = {
      endpoint: 'https://new.push.example/ep-FRESH',
      toJSON: () => ({ endpoint: 'https://new.push.example/ep-FRESH', keys: { p256dh: 'p', auth: 'a' } }),
    };
    const pushManager = {
      getSubscription: async () => { window.__ops.push('getSubscription'); return fakeOld; },
      subscribe: async (opts) => {
        // enregistre la clé reçue (Uint8Array) pour vérifier qu'on utilise VAPID_PUBLIC
        const k = opts && opts.applicationServerKey;
        window.__subKeyLen = k ? k.byteLength || k.length : 0;
        window.__ops.push('subscribe');
        return fakeNew;
      },
    };
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { ready: Promise.resolve({ pushManager }), addEventListener() {}, controller: null,
               getRegistration: async () => ({ pushManager }), register: async () => ({ pushManager }) },
    });
    // permission déjà accordée (pas de prompt)
    try { Object.defineProperty(Notification, 'permission', { configurable: true, get: () => 'granted' }); } catch (_e) {}
    Notification.requestPermission = async () => { window.__ops.push('permission'); return 'granted'; };
    // journalise tout fetch pour prouver l'ORDRE (subscribe AVANT tout réseau)
    const realFetch = window.fetch;
    window.fetch = function (url, opts) {
      window.__ops.push('fetch:' + String(url).replace(/^https?:\/\/[^/]+/, ''));
      return realFetch.apply(this, arguments);
    };
  });
  await page.goto('./', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(() => window.K && window.K._recreatePushInGesture, { timeout: 15000 });
  await page.evaluate(() => { window.K.token = 'test-token-not-local'; });
}

test.describe('Recréation abonnement gesture-safe (v1.1.279)', () => {
  // WebKit headless interdit de redéfinir `navigator.serviceWorker` (propriété
  // non configurable) → le mock du pushManager ne peut pas s'installer. L'INVARIANT
  // testé (subscribe() appelé AVANT tout fetch = ordre du flux JS) est
  // engine-independent → sa preuve sur Chromium suffit. Le boot réel de l'app sur
  // WebKit reste couvert par push-key-heal.spec.js (qui, lui, ne mocke pas le SW).
  test.skip(({ browserName }) => browserName === 'webkit',
    'navigator.serviceWorker non redéfinissable sur WebKit headless ; invariant d\'ordre prouvé sur Chromium');

  test('subscribe() est appelé AVANT tout fetch réseau (geste iOS préservé)', async ({ page }) => {
    await bootWithPushMock(page);
    const r = await page.evaluate(async () => {
      window.__ops = []; // ne garder QUE les ops de la recréation (pas le boot)
      const ok = await window.K._recreatePushInGesture();
      return { ok, ops: window.__ops.slice(), subKeyLen: window.__subKeyLen };
    });
    expect(r.ok).toBe(true);
    // l'ancien abonnement est bien désabonné (recréation) :
    expect(r.ops).toContain('unsubscribe');
    expect(r.ops).toContain('subscribe');
    // INVARIANT : AUCUN fetch avant subscribe (sinon iOS perd le geste → throw)
    const iSub = r.ops.indexOf('subscribe');
    const firstFetch = r.ops.findIndex((o) => o.startsWith('fetch:'));
    expect(iSub).toBeGreaterThanOrEqual(0);
    if (firstFetch !== -1) expect(firstFetch).toBeGreaterThan(iSub); // fetch APRÈS subscribe
    // la clé d'abonnement est bien une clé VAPID P-256 (65 octets décodés)
    expect(r.subKeyLen).toBe(65);
    // purge de l'ancien + enregistrement du neuf se font APRÈS subscribe
    expect(r.ops.some((o) => o.includes('/api/push/unsubscribe'))).toBe(true);
    expect(r.ops.some((o) => o.includes('/api/push/subscribe'))).toBe(true);
  });

  test('permission refusée → recréation renvoie false (jamais de crash)', async ({ page }) => {
    await bootWithPushMock(page);
    const ok = await page.evaluate(async () => {
      Notification.requestPermission = async () => 'denied'; // refus explicite
      return window.K._recreatePushInGesture();
    });
    expect(ok).toBe(false);
  });
});
