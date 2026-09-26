// E2E navigateur RÉEL — sélecteur de GIF (v1.1.266).
// Prouve le câblage COMPLET côté client : ouverture du panneau, appel du
// worker /api/gif (mocké → pas de réseau externe), rendu de la grille,
// et envoi via le pipeline média existant (_uploadMedia reçoit un File .gif).
// Le fail-open (clé absente → panneau désactivé) est aussi vérifié.

import { test, expect } from '@playwright/test';

test.describe('Apex Chat — sélecteur de GIF (navigateur réel)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForFunction(
      () => window.K && window.K._toggleGifPicker && window.ApexGif,
      { timeout: 15000 },
    );
    // Le panneau #gif-picker vit dans la vue chat (conv ouverte). En test unitaire
    // DOM, on l'injecte comme le fait le rendu réel.
    await page.evaluate(() => {
      if (!document.getElementById('gif-picker')) {
        const d = document.createElement('div');
        d.id = 'gif-picker'; d.style.display = 'none';
        document.body.appendChild(d);
      }
    });
  });

  test('recherche → grille → clic → envoi via _uploadMedia (File .gif)', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const K = window.K;
      K.token = 'tok'; K.viewData = { id: 'cvG' };
      let uploaded = null;
      K._uploadMedia = async (file) => { uploaded = { name: file.name, type: file.type, size: file.size }; };
      const of = window.fetch;
      window.fetch = async (u, o) => {
        const url = String(u);
        if (url.includes('/api/gif')) {
          return new Response(JSON.stringify({ disabled: false, results: [
            { id: 'g1', title: 'Bonjour', preview: 'data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=', full: 'https://giphy/full.gif' },
          ] }), { status: 200 });
        }
        if (url === 'https://giphy/full.gif') {
          return new Response(new Blob([new Uint8Array([71, 73, 70, 56, 57, 97])], { type: 'image/gif' }), { status: 200 });
        }
        return of(u, o);
      };

      K._toggleGifPicker();
      const q = document.getElementById('gif-q');
      q.value = 'bonjour';
      K._loadGifs('bonjour');
      await new Promise(res => setTimeout(res, 120));
      const cells = document.querySelectorAll('#gif-grid .gif-cell').length;
      document.querySelector('#gif-grid .gif-cell').click();
      await new Promise(res => setTimeout(res, 120));
      const pickerHidden = document.getElementById('gif-picker').style.display === 'none';
      return { cells, uploaded, pickerHidden };
    });
    expect(r.cells).toBe(1);
    expect(r.uploaded).toBeTruthy();
    expect(r.uploaded.type).toBe('image/gif');
    expect(r.uploaded.name).toMatch(/\.gif$/);
    expect(r.uploaded.size).toBeGreaterThan(0);
    expect(r.pickerHidden).toBe(true);
  });

  test('clé absente → panneau désactivé (fail-open, message clair)', async ({ page }) => {
    const txt = await page.evaluate(async () => {
      const K = window.K;
      K.token = 'tok'; K.viewData = { id: 'cvG' };
      const of = window.fetch;
      window.fetch = async (u, o) =>
        String(u).includes('/api/gif') ? new Response(JSON.stringify({ disabled: true, reason: 'no_key' }), { status: 200 }) : of(u, o);
      K._toggleGifPicker();
      await new Promise(res => setTimeout(res, 120));
      return document.getElementById('gif-grid').textContent;
    });
    expect(txt).toMatch(/pas encore activés|clé Giphy/i);
  });
});
