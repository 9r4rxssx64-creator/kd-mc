/**
 * E2E navigateur RÉEL — l'ENVOI chiffre vers la clé COURANTE du destinataire
 * (v1.1.274). Suite des captures Kevin/Laurence : « impossible à lire »
 * PERSISTAIT même après l'auto-réparation à la réception (v1.1.272), parce que
 * l'EXPÉDITEUR continuait de chiffrer vers l'ANCIENNE clé du destinataire
 * (session en cache jamais rafraîchie). Ici MA propre clé a tourné (réinstall).
 *
 * On prouve K._ensureFreshSession : avant d'envoyer, il re-télécharge la clé
 * ACTUELLE du destinataire → le message est déchiffrable par sa NOUVELLE
 * identité (et plus par l'ancienne). VRAI window.ApexCrypto.
 */
import { test, expect } from '@playwright/test';

test.describe('Envoi vers la clé courante du destinataire (v1.1.274)', () => {
  test('la clé du destinataire a tourné → l\'envoi chiffre vers la NOUVELLE', async ({ page }) => {
    // Bundle du pair = NOUVELLE clé publique de Kevin (injectée depuis la page).
    await page.route('**/api/keys/**/bundle', async (route) => {
      const pub = await page.evaluate(() => window.__KEVIN_NEW_PUB);
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ ok: true, bundle: { identity_key_pub: pub, crypto_caps: 'media' } }),
      });
    });

    await page.goto('./', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForFunction(
      () => window.K && window.K._ensureFreshSession && window.ApexCrypto,
      { timeout: 15000 },
    );

    const r = await page.evaluate(async () => {
      const C = window.ApexCrypto, K = window.K;
      // Laurence (cet appareil) ; Kevin a une ANCIENNE et une NOUVELLE identité.
      const L = await C.generateIdentityKeys();
      const Kold = await C.generateIdentityKeys();
      const Knew = await C.generateIdentityKeys();
      window.__KEVIN_NEW_PUB = await C.exportPublicKey(Knew.publicKey);

      K._cryptoKeys = L;
      K.token = 'test-token-not-local';
      K._sendRefreshAt = {}; // état neuf → 1ᵉʳ envoi force le rafraîchissement
      const conv = { id: 'cv-send', peer_id: 'kevin', peer_pubkey: await C.exportPublicKey(Kold.publicKey) };
      K.viewData = conv; K.conversations = [conv];

      // Session PÉRIMÉE : Laurence chiffrait vers l'ANCIENNE clé de Kevin.
      await C.establishSession('cv-send', L.privateKey, Kold.publicKey);

      // Avant d'envoyer : rafraîchit vers la clé COURANTE (mock → Knew).
      const ok = await K._ensureFreshSession(conv);
      const ct = await C.encryptForConv('cv-send', 'Coucou Kevin');

      // Kevin NOUVELLE identité déchiffre : ECDH(Knew_priv, L_pub).
      const lPub = await C.importPublicKey(await C.exportPublicKey(L.publicKey));
      await C.establishSession('kevin-new', Knew.privateKey, lPub);
      const readByNew = await C.decryptForConv('kevin-new', ct);

      // Kevin ANCIENNE identité NE PEUT PLUS lire (preuve que la clé a bien changé).
      await C.establishSession('kevin-old', Kold.privateKey, lPub);
      let oldFailed = false;
      try { await C.decryptForConv('kevin-old', ct); } catch (_e) { oldFailed = true; }

      return { ok, readByNew, oldFailed, peerUpdated: conv.peer_pubkey === window.__KEVIN_NEW_PUB };
    });

    expect(r.ok).toBe(true);
    expect(r.readByNew).toBe('Coucou Kevin'); // ← lisible par la NOUVELLE identité de Kevin
    expect(r.oldFailed).toBe(true);           // l'ancienne ne peut plus (clé bien rafraîchie)
    expect(r.peerUpdated).toBe(true);         // cache local mis à jour vers la nouvelle clé
  });

  test('clé inchangée + envoi récent → pas de re-fetch (throttle 90 s)', async ({ page }) => {
    let bundleCalls = 0;
    await page.route('**/api/keys/**/bundle', async (route) => {
      bundleCalls += 1;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, bundle: {} }) });
    });
    await page.goto('./', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForFunction(() => window.K && window.K._ensureFreshSession && window.ApexCrypto, { timeout: 15000 });

    const calls = await page.evaluate(async () => {
      const C = window.ApexCrypto, K = window.K;
      const L = await C.generateIdentityKeys(), P = await C.generateIdentityKeys();
      K._cryptoKeys = L; K.token = 'test-token-not-local'; K._sendRefreshAt = {};
      const conv = { id: 'cv-t', peer_id: 'p', peer_pubkey: await C.exportPublicKey(P.publicKey) };
      K.viewData = conv; K.conversations = [conv];
      await C.establishSession('cv-t', L.privateKey, P.publicKey);
      await K._ensureFreshSession(conv); // 1ᵉʳ → refresh (1 appel)
      await K._ensureFreshSession(conv); // dans les 90 s → PAS de nouvel appel
      await K._ensureFreshSession(conv);
    });
    expect(bundleCalls).toBe(1); // un seul re-fetch malgré 3 envois (throttle respecté)
  });
});
