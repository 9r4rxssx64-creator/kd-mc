// E2E navigateur RÉEL — galerie « Médias, liens & docs » (v1.1.264).
// Prouve le câblage COMPLET : module ApexGallery + K._openMediaGallery /
// _renderGallery / _setGalleryTab sur un vrai DOM de modale, comptes par
// onglet, rendu des tuiles image inline, et saut au message.

import { test, expect } from '@playwright/test';

test.describe('Apex Chat — galerie médias (navigateur réel)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForFunction(
      () => window.ApexGallery && window.ApexGallery.collectConversationMedia && window.K && window.K._openMediaGallery,
      { timeout: 15000 },
    );
  });

  test('4 onglets comptés, tuiles média, navigation, saut au message', async ({ page }) => {
    const r = await page.evaluate(() => {
      const K = window.K;
      K.conversations = [{ id: 'cvM', name: 'Test', peer_id: 'p' }];
      K.messages = { cvM: [
        { id: 'i1', ts: 1, image_data: 'data:image/png;base64,iVBORw0KGgo=', media_name: 'a.png' },
        { id: 'v1', ts: 2, media_url: '/m/v', media_type: 'video/mp4', media_name: 'c.mp4', media_enc: true },
        { id: 'f1', ts: 3, media_url: '/m/f', media_type: 'application/pdf', media_name: 'doc.pdf' },
        { id: 'a1', ts: 4, voice_data: 'x', voice_text: 'coucou' },
        { id: 'l1', ts: 5, text: 'voir https://exemple.io/page' },
      ]};
      let jumped = null;
      K._scrollToMsg = (id) => { jumped = id; };

      K._openMediaGallery('cvM');
      const body = document.getElementById('gallery-body');
      const badges = [...body.querySelectorAll('.gallery-badge')].map(b => b.textContent.trim());
      const tiles = body.querySelectorAll('.gallery-tile').length;
      const imgTiles = body.querySelectorAll('.gallery-tile img').length;

      // Onglet Liens
      K._setGalleryTab('links');
      const link = document.querySelector('#gallery-body a');
      const linkHref = link ? link.getAttribute('href') : null;
      const linkRel = link ? link.getAttribute('rel') : null;

      // Onglet Fichiers → saut
      K._setGalleryTab('files');
      document.querySelector('#gallery-body .gallery-row').click();

      return { badges, tiles, imgTiles, linkHref, linkRel, jumped };
    });

    expect(r.badges).toEqual(['2', '1', '1', '1']); // médias=2, fichiers=1, vocaux=1, liens=1
    expect(r.tiles).toBe(2);
    expect(r.imgTiles).toBe(1);                     // 1 image inline rendue en <img>
    expect(r.linkHref).toBe('https://exemple.io/page');
    expect(r.linkRel).toContain('noopener');        // anti-tabnabbing
    expect(r.jumped).toBe('f1');                    // clic fichier → saut au message
  });

  test('conversation vide → onglets à 0, état vide', async ({ page }) => {
    const r = await page.evaluate(() => {
      const K = window.K;
      K.conversations = [{ id: 'cvE', name: 'Vide' }];
      K.messages = { cvE: [{ id: 'x', ts: 1, text: 'juste du texte' }] };
      K._openMediaGallery('cvE');
      const body = document.getElementById('gallery-body');
      return {
        badges: [...body.querySelectorAll('.gallery-badge')].map(b => b.textContent.trim()),
        emptyShown: /Aucun média/.test(body.textContent),
      };
    });
    expect(r.badges).toEqual(['0', '0', '0', '0']);
    expect(r.emptyShown).toBe(true);
  });
});
