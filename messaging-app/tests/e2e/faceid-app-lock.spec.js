// E2E navigateur RÉEL — Face ID / Touch ID (WebAuthn) de verrouillage d'app.
// Prouve la biométrie SANS appareil physique via l'authentificateur VIRTUEL
// CDP (transport 'internal' = plateforme, user-verification simulée) — la même
// technique que le SSO passkey kd-mc.com (leçon #98). Round-trip complet sur le
// VRAI code app : supporté → enrôle → enrôlé → vérifie → déverrouille.

import { test, expect } from '@playwright/test';

test.describe('Apex Chat — Face ID / verrou app (navigateur réel + authentificateur virtuel)', () => {
  // L'authentificateur VIRTUEL passe par le protocole CDP → Chromium uniquement
  // (WebKit/Firefox n'exposent pas newCDPSession). Sur les autres moteurs, la
  // biométrie réelle n'est pas simulable en CI → on saute ce test spécifique.
  test.skip(({ browserName }) => browserName !== 'chromium',
    'Authentificateur virtuel WebAuthn = CDP (Chromium only)');

  test('supporté → enrôle → vérifie (round-trip WebAuthn plateforme)', async ({ page }) => {
    // Authentificateur biométrique VIRTUEL (Face ID/Touch ID simulé).
    const client = await page.context().newCDPSession(page);
    await client.send('WebAuthn.enable');
    await client.send('WebAuthn.addVirtualAuthenticator', {
      options: {
        protocol: 'ctap2',
        transport: 'internal',            // = plateforme (Face ID/Touch ID)
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,             // biométrie « réussie »
        automaticPresenceSimulation: true,
      },
    });

    await page.goto('./', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForFunction(
      () => window.K && window.K._biometricRegister && window.K._biometricVerify && window.K._biometricSupported,
      { timeout: 15000 },
    );

    const r = await page.evaluate(async () => {
      const K = window.K;
      K.user = { id: 'kevin', pseudo: 'Kevin', real_name: 'Kevin Desarzens' };
      try { localStorage.removeItem('apex_chat_user_biometric_kevin'); } catch (_) {}

      const supported = await K._biometricSupported();
      const enrolledBefore = K._biometricEnrolled('kevin');
      const registered = await K._biometricRegister();     // Face ID « scan » (enrôlement)
      const enrolledAfter = K._biometricEnrolled('kevin');
      const verified = await K._biometricVerify();          // Face ID « scan » (déverrouillage)
      return { supported, enrolledBefore, registered, enrolledAfter, verified };
    });

    expect(r.supported).toBe(true);        // plateforme biométrique disponible
    expect(r.enrolledBefore).toBe(false);  // pas encore enrôlé
    expect(r.registered).toBe(true);       // enrôlement réussi
    expect(r.enrolledAfter).toBe(true);    // credential stocké (device-local)
    expect(r.verified).toBe(true);         // déverrouillage biométrique OK
  });

  test('sans biométrie enrôlée → verify = false (repli PIN, jamais de blocage)', async ({ page }) => {
    // Pas d'authentificateur virtuel : la biométrie n'est pas disponible.
    await page.goto('./', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForFunction(() => window.K && window.K._biometricVerify, { timeout: 15000 });
    const r = await page.evaluate(async () => {
      const K = window.K;
      K.user = { id: 'noBio', pseudo: 'X' };
      return { verified: await K._biometricVerify() }; // pas de credential → false (→ PIN)
    });
    expect(r.verified).toBe(false); // repli PIN garanti, aucun lockout
  });
});
