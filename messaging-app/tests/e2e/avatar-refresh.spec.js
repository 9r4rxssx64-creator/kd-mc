/**
 * E2E navigateur RÉEL — bug « Lolo a changé sa photo mais elle n'apparaît pas »
 * (Kevin, v1.1.267). Avant v1.1.268, _fetchPeerAvatar était dédupé À VIE
 * (`if(_fetchedPeerAvatars[id]) return`) → une photo de contact modifiée n'était
 * JAMAIS re-téléchargée. Fix : dédupe par TTL + force à l'ouverture de conv.
 *
 * On mocke /api/users/:id (route Playwright) pour renvoyer une photo V1 puis V2
 * et on prouve que le 2ᵉ fetch récupère bien la NOUVELLE photo (l'ancien code
 * renvoyait null), et que sans `force` le TTL évite les rafales réseau.
 */
import { test, expect } from '@playwright/test';

test.describe('Avatar contact — la photo modifiée réapparaît (fix v1.1.268)', () => {
  test('photo changée → re-téléchargée (fin du blocage à vie)', async ({ page }) => {
    let calls = 0;
    await page.route('**/api/users/**', async (route) => {
      calls += 1;
      const avatar = calls === 1
        ? 'data:image/png;base64,AAAAV1'
        : 'data:image/png;base64,BBBBV2'; // « Lolo a changé sa photo »
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ user: { id: 'lolo', pseudo: 'Lolo', avatar_url: avatar } }),
      });
    });

    await page.goto('./', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForFunction(
      () => window.K && window.K._fetchPeerAvatar && window.K._getAvatar,
      { timeout: 15000 },
    );

    const r = await page.evaluate(async () => {
      const K = window.K;
      K.user = { id: 'kevin', pseudo: 'Kevin' };
      K.token = 'test-token-not-local';   // non « local- » → le chemin réseau s'exécute
      K._fetchedPeerAvatars = {};          // état neuf

      const first = await K._fetchPeerAvatar('lolo', true);
      const cached1 = K._getAvatar('lolo');
      const second = await K._fetchPeerAvatar('lolo', true); // Lolo a changé sa photo
      const cached2 = K._getAvatar('lolo');
      return { first, cached1, second, cached2 };
    });

    expect(r.first).toContain('AAAAV1');
    expect(r.cached1).toContain('AAAAV1');
    expect(r.second).toContain('BBBBV2');   // ← re-téléchargé (avant : null → ancienne photo à vie)
    expect(r.cached2).toContain('BBBBV2');   // ← le cache reflète la NOUVELLE photo
    expect(calls).toBe(2);
  });

  test('sans force, le TTL évite les rafales réseau (anti-scintillement)', async ({ page }) => {
    let calls = 0;
    await page.route('**/api/users/**', async (route) => {
      calls += 1;
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ user: { id: 'lolo', avatar_url: 'data:image/png;base64,AAAA' } }),
      });
    });
    await page.goto('./', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForFunction(() => window.K && window.K._fetchPeerAvatar, { timeout: 15000 });

    await page.evaluate(async () => {
      const K = window.K;
      K.user = { id: 'kevin' }; K.token = 'test-token-not-local'; K._fetchedPeerAvatars = {};
      await K._fetchPeerAvatar('lolo');   // 1er → fetch réseau
      await K._fetchPeerAvatar('lolo');   // dans le TTL → PAS de fetch
      await K._fetchPeerAvatar('lolo');   // idem
    });
    expect(calls).toBe(1); // un seul appel réseau malgré 3 rendus (TTL respecté)
  });
});
