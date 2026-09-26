/**
 * E2E navigateur RÉEL — « impossible à lire sur cet appareil » AUTO-RÉPARÉ
 * (v1.1.272, captures Kevin & Laurence : chacun voit ses propres messages mais
 * pas ceux de l'autre). CAUSE : la clé d'un contact avait tourné (réinstallation)
 * et _ensureSession ne re-téléchargeait la clé du pair QUE si le cache était
 * vide → ses messages restaient « impossibles à lire » pour toujours.
 *
 * On prouve K._decryptE2EHeal sur le VRAI moteur crypto (window.ApexCrypto) :
 *   - A a une session avec l'ANCIENNE clé de B ;
 *   - B a tourné sa clé et chiffre avec la NOUVELLE → A échoue au 1ᵉʳ essai ;
 *   - l'endpoint bundle du pair (mocké) renvoie la NOUVELLE clé → l'auto-
 *     réparation ré-établit la session et DÉCHIFFRE au 2ᵉ essai.
 * + garde anti-régression : un message normal (clé courante) passe direct.
 */
import { test, expect } from '@playwright/test';

async function boot(page) {
  await page.goto('./', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(
    () => window.K && window.K._decryptE2EHeal && window.K._ensureSession
       && window.ApexCrypto && window.ApexCrypto.establishSession,
    { timeout: 15000 },
  );
}

test.describe('E2E auto-réparant — la clé du contact a tourné (v1.1.272)', () => {
  test('message chiffré avec la NOUVELLE clé du pair → déchiffré après re-fetch', async ({ page }) => {
    // Le bundle du pair renverra la NOUVELLE clé publique de B (injectée depuis la page).
    await page.route('**/api/keys/**/bundle', async (route) => {
      const pub = await page.evaluate(() => window.__B_NEW_PUB);
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ ok: true, bundle: { identity_key_pub: pub, crypto_caps: 'media' } }),
      });
    });

    await boot(page);

    const r = await page.evaluate(async () => {
      const C = window.ApexCrypto, K = window.K;
      // A = cet appareil ; B = le contact (ancienne + nouvelle identité).
      const A = await C.generateIdentityKeys();
      const Bold = await C.generateIdentityKeys();
      const Bnew = await C.generateIdentityKeys();
      const aPubB64 = await C.exportPublicKey(A.publicKey);
      const bNewPubB64 = await C.exportPublicKey(Bnew.publicKey);
      window.__B_NEW_PUB = bNewPubB64;

      K._cryptoKeys = A;
      K.token = 'test-token-not-local';
      const conv = { id: 'cv-heal', peer_id: 'B', peer_pubkey: await C.exportPublicKey(Bold.publicKey) };
      K.viewData = conv;
      K.conversations = [conv];

      // A établit sa session avec l'ANCIENNE clé de B (état « périmé »).
      await C.establishSession('cv-heal', A.privateKey, Bold.publicKey);

      // B (NOUVELLE identité) chiffre un message pour A : clé partagée =
      // ECDH(Bnew_priv, A_pub). On la fabrique via une session jetable.
      const aPub = await C.importPublicKey(aPubB64);
      await C.establishSession('cv-B-side', Bnew.privateKey, aPub);
      const ct = await C.encryptForConv('cv-B-side', 'Coucou, c\'est moi (nouvelle clé)');

      // 1ᵉʳ essai direct avec la session périmée → DOIT échouer.
      let directFailed = false;
      try { await C.decryptForConv('cv-heal', ct); } catch (_e) { directFailed = true; }

      // Auto-réparation : re-fetch (mock → Bnew) + retry.
      const healed = await K._decryptE2EHeal('cv-heal', ct);

      return { directFailed, healed, peerUpdated: conv.peer_pubkey === bNewPubB64 };
    });

    expect(r.directFailed).toBe(true);                       // session périmée : échec attendu
    expect(r.healed).toBe('Coucou, c\'est moi (nouvelle clé)'); // ← réparé + déchiffré
    expect(r.peerUpdated).toBe(true);                        // cache mis à jour vers la nouvelle clé
  });

  test('clé courante (pas de rotation) → déchiffre direct, sans re-fetch', async ({ page }) => {
    let bundleCalls = 0;
    await page.route('**/api/keys/**/bundle', async (route) => {
      bundleCalls += 1;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, bundle: {} }) });
    });
    await boot(page);

    const healed = await page.evaluate(async () => {
      const C = window.ApexCrypto, K = window.K;
      const A = await C.generateIdentityKeys();
      const B = await C.generateIdentityKeys();
      K._cryptoKeys = A; K.token = 'test-token-not-local';
      const conv = { id: 'cv-ok', peer_id: 'B', peer_pubkey: await C.exportPublicKey(B.publicKey) };
      K.viewData = conv; K.conversations = [conv];
      // Session courante correcte des deux côtés.
      await C.establishSession('cv-ok', A.privateKey, B.publicKey);
      await C.establishSession('cv-B', B.privateKey, A.publicKey);
      const ct = await C.encryptForConv('cv-B', 'Salut ça marche');
      return await K._decryptE2EHeal('cv-ok', ct);
    });

    expect(healed).toBe('Salut ça marche');
    expect(bundleCalls).toBe(0); // aucun re-fetch quand la session courante suffit
  });
});
