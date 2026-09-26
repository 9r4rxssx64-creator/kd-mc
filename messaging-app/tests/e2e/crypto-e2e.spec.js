// E2E navigateur RÉEL (Chromium/WebKit) — prouve le chiffrement de bout en bout
// dans le vrai moteur (WebCrypto), ce qui remplace la « validation iPhone » :
//   1. decideWire (politique anti repli texte-clair, leçon #90) — 3 modes.
//   2. Round-trip des OCTETS média E2E entre 2 « appareils » (encryptBytes/
//      decryptBytes sur clé de session ECDH partagée).
//   3. Chemin de rendu COMPLET d'un média chiffré : placeholder → hydrate
//      (fetch ciphertext → decryptBytes → blob) → <img blob:> déchiffré.
// Sert index.html en local (webServer :4173) → aucun réseau externe requis.

import { test, expect } from '@playwright/test';

test.describe('Apex Chat — chiffrement E2E (navigateur réel)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForFunction(
      () => window.ApexCrypto && window.ApexCrypto.encryptBytes && window.K && window.K._hydrateEncMedia,
      { timeout: 15000 },
    );
  });

  test('decideWire : cipher / clear / pending (jamais de clair silencieux)', async ({ page }) => {
    const r = await page.evaluate(() => {
      const A = window.ApexCrypto;
      return {
        cipher: A.decideWire({ ciphertextPayload: 'E2E1:z', plaintext: 'x', e2eOn: true }).mode,
        clear: A.decideWire({ ciphertextPayload: null, plaintext: 'x', e2eOn: false }).mode,
        pending: A.decideWire({ ciphertextPayload: null, plaintext: 'x', e2eOn: true }).mode,
        pendingWire: A.decideWire({ ciphertextPayload: null, plaintext: 'x', e2eOn: true }).wire,
      };
    });
    expect(r.cipher).toBe('cipher');
    expect(r.clear).toBe('clear');
    expect(r.pending).toBe('pending');
    expect(r.pendingWire).toBeNull(); // E2E ON sans clé → RIEN sur le fil
  });

  test('round-trip octets média E2E entre 2 appareils', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const A = window.ApexCrypto;
      const alice = await A.generateIdentityKeys();
      const bob = await A.generateIdentityKeys();
      await A.establishSession('cv', alice.privateKey, bob.publicKey);
      await A.establishSession('cv2', bob.privateKey, alice.publicKey);
      const original = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 250, 42]);
      const enc = await A.encryptBytes('cv', original.buffer);
      const dec = new Uint8Array(await A.decryptBytes('cv2', enc));
      const encTail = Array.from(new Uint8Array(enc)).slice(12); // hors IV
      return {
        roundtrip: JSON.stringify(Array.from(dec)) === JSON.stringify(Array.from(original)),
        differs: JSON.stringify(encTail) !== JSON.stringify(Array.from(original)),
        overhead: enc.byteLength - original.byteLength, // 12 IV + 16 tag GCM
      };
    });
    expect(r.roundtrip).toBe(true);
    expect(r.differs).toBe(true);
    expect(r.overhead).toBe(28);
  });

  test('forward secrecy (ratchet) : 3 messages + clé détruite après usage', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const A = window.ApexCrypto;
      const alice = await A.generateIdentityKeys();
      const bob = await A.generateIdentityKeys();
      await A.ratchetInit('c', alice.privateKey, bob.publicKey);
      await A.ratchetInit('cb', bob.privateKey, alice.publicKey);
      const w0 = await A.ratchetEncrypt('c', 'm0');
      const w1 = await A.ratchetEncrypt('c', 'm1');
      const d0 = await A.ratchetDecrypt('cb', w0.n, w0.ct);
      const d1 = await A.ratchetDecrypt('cb', w1.n, w1.ct);
      let destroyed = false;
      try { await A.ratchetDecrypt('cb', w0.n, w0.ct); } catch { destroyed = true; }
      return { d0, d1, destroyed, distinct: w0.ct !== w1.ct };
    });
    expect(r.d0).toBe('m0');
    expect(r.d1).toBe('m1');
    expect(r.distinct).toBe(true);   // chaque message a sa clé
    expect(r.destroyed).toBe(true);  // clé de m0 détruite → forward secrecy
  });

  test('rendu média chiffré : placeholder → hydrate → <img blob:> déchiffré', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const A = window.ApexCrypto, K = window.K;
      const me = await A.generateIdentityKeys();
      const peer = await A.generateIdentityKeys();
      await A.establishSession('cvX', me.privateKey, peer.publicKey);
      K.token = 'tok'; K.user = { id: 'me' }; K.viewData = { id: 'cvX' };
      const original = new Uint8Array([255, 216, 255, 224, 10, 20, 30, 40, 50]);
      const encBuf = await A.encryptBytes('cvX', original.buffer);
      const encBytes = new Uint8Array(encBuf);
      const of = window.fetch;
      window.fetch = async (u, o) =>
        String(u).includes('/media/enc-test') ? new Response(encBytes.buffer, { status: 200 }) : of(u, o);
      const msg = { id: 'mm1', from: 'me', media_url: '/api/media/enc-test', media_type: 'image/jpeg', media_name: 'p.jpg', media_enc: true };
      const html = K._renderMediaEl(msg);
      const isPlaceholder = /enc-media/.test(html) && /déchiffrement/.test(html);
      const host = document.createElement('div');
      host.innerHTML = html;
      document.body.appendChild(host);
      await K._hydrateEncMedia();
      const img = host.querySelector('img');
      return {
        isPlaceholder,
        decryptedImg: !!(img && img.src.startsWith('blob:')),
        errText: host.textContent.includes('indéchiffrable'),
      };
    });
    expect(r.isPlaceholder).toBe(true);   // rendu ciphertext impossible en <img src>
    expect(r.decryptedImg).toBe(true);    // hydrate a produit un blob déchiffré
    expect(r.errText).toBe(false);        // aucun échec de déchiffrement
  });
});
