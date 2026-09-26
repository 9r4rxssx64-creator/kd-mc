/**
 * E2E navigateur RÉEL — média AGRANDI (façon WhatsApp) + GIF/photo chiffrés
 * AUTO-RÉPARÉS (v1.1.275). Captures Kevin : « agrandis l'image au max, trop de
 * place perdue » + « Laurence ne voit pas les GIF » (les GIF passent par le
 * pipeline média chiffré → même racine que « impossible à lire » quand une clé
 * a tourné). VRAI window.ApexCrypto.
 */
import { test, expect } from '@playwright/test';

test.describe('Média plus grand + GIF/photo auto-réparés (v1.1.275)', () => {
  test('les médias sont nettement plus grands qu\'avant (≥ ~290px sur 390px)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('./', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForFunction(() => window.K && window.K._renderMediaEl && window.K._MEDIA_STYLE, { timeout: 15000 });

    const maxW = await page.evaluate(() => {
      const K = window.K;
      K.viewData = { id: 'cv' };
      const html = K._renderMediaEl({ media_url: 'https://x/y.gif', media_type: 'image/gif', media_name: 'g' });
      const box = document.createElement('div'); box.style.width = '327px'; // ~bulle 84% de 390
      document.body.appendChild(box); box.innerHTML = html;
      const img = box.querySelector('img');
      return parseFloat(getComputedStyle(img).maxWidth); // min(76vw,340px) → 76% de 390 = 296px
    });
    expect(maxW).toBeGreaterThan(280); // avant : 260px → maintenant ~296px, moins de place perdue
  });

  test('GIF/photo chiffré : clé du pair tournée → déchiffré après re-fetch (heal)', async ({ page }) => {
    await page.route('**/api/keys/**/bundle', async (route) => {
      const pub = await page.evaluate(() => window.__PEER_NEW_PUB);
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ ok: true, bundle: { identity_key_pub: pub, crypto_caps: 'media' } }),
      });
    });
    await page.goto('./', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForFunction(
      () => window.K && window.K._decryptBytesHeal && window.ApexCrypto && window.ApexCrypto.encryptBytes,
      { timeout: 15000 },
    );

    const r = await page.evaluate(async () => {
      const C = window.ApexCrypto, K = window.K;
      const me = await C.generateIdentityKeys();
      const peerOld = await C.generateIdentityKeys();
      const peerNew = await C.generateIdentityKeys();
      window.__PEER_NEW_PUB = await C.exportPublicKey(peerNew.publicKey);
      K._cryptoKeys = me; K.token = 'test-token-not-local'; K._healFetchAt = {};
      const conv = { id: 'cvm', peer_id: 'p', peer_pubkey: await C.exportPublicKey(peerOld.publicKey) };
      K.viewData = conv; K.conversations = [conv];

      // Ma session est PÉRIMÉE (ancienne clé du pair).
      await C.establishSession('cvm', me.privateKey, peerOld.publicKey);

      // Le pair (NOUVELLE identité) a chiffré un GIF pour moi : octets chiffrés
      // avec ECDH(peerNew_priv, my_pub).
      const myPub = await C.importPublicKey(await C.exportPublicKey(me.publicKey));
      await C.establishSession('peer-side', peerNew.privateKey, myPub);
      const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 42]).buffer;
      const enc = await C.encryptBytes('peer-side', bytes);

      // 1ᵉʳ essai direct → échoue (session périmée).
      let directFail = false;
      try { await C.decryptBytes('cvm', enc); } catch (_e) { directFail = true; }

      // Auto-réparation média : re-fetch clé du pair + retry.
      const healed = new Uint8Array(await K._decryptBytesHeal('cvm', enc));
      return { directFail, healed: Array.from(healed) };
    });
    expect(r.directFail).toBe(true);                               // session périmée
    expect(r.healed).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 42]);     // ← GIF déchiffré après heal
  });
});
