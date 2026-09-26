/**
 * Tests features/chat — Album visuel + Lightbox + Transform.
 * Kevin règle 2026-05-07 : "visuel pas une liste d'écriture, transformation polyvalente créative".
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  renderImageAlbum,
  openImageLightbox,
  pushTransformResult,
  handleLightboxAction,
  type AlbumImage,
} from '../../features/chat/index.js';

describe('features/chat — Album & Lightbox', () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '<div id="apex-root"><div class="ax-chat-scroll"></div></div>';
    root = document.getElementById('apex-root')!;
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  describe('renderImageAlbum', () => {
    it('vide si tableau vide', () => {
      expect(renderImageAlbum([])).toBe('');
    });

    it('vide si non-array', () => {
      expect(renderImageAlbum(null as unknown as AlbumImage[])).toBe('');
    });

    it('1 image → 1 colonne', () => {
      const html = renderImageAlbum([{ url: 'https://x.com/a.jpg', filename: 'a.jpg' }]);
      expect(html).toContain('grid-template-columns:repeat(1,1fr)');
      expect(html).toContain('a.jpg');
    });

    it('4 images → 2 colonnes', () => {
      const imgs: AlbumImage[] = Array.from({ length: 4 }, (_, i) => ({
        url: `https://x.com/${i}.jpg`,
        filename: `img${i}.jpg`,
      }));
      const html = renderImageAlbum(imgs);
      expect(html).toContain('grid-template-columns:repeat(2,1fr)');
    });

    it('9 images → 3 colonnes', () => {
      const imgs: AlbumImage[] = Array.from({ length: 9 }, (_, i) => ({
        url: `https://x.com/${i}.jpg`,
        filename: `img${i}.jpg`,
      }));
      const html = renderImageAlbum(imgs);
      expect(html).toContain('grid-template-columns:repeat(3,1fr)');
    });

    it('échappe XSS dans URL', () => {
      const html = renderImageAlbum([
        { url: '"><script>alert(1)</script>', filename: 'evil.jpg' },
      ]);
      expect(html).not.toContain('<script>alert(1)</script>');
      expect(html).toContain('&quot;');
    });

    it('échappe XSS dans filename', () => {
      const html = renderImageAlbum([
        { url: 'https://x.com/a.jpg', filename: '<img onerror=alert(1)>' },
      ]);
      expect(html).not.toContain('<img onerror=alert(1)>');
      expect(html).toContain('&lt;img');
    });

    it('inclut data-img-idx pour wiring click', () => {
      const html = renderImageAlbum([
        { url: 'https://x.com/0.jpg', filename: '0.jpg' },
        { url: 'https://x.com/1.jpg', filename: '1.jpg' },
      ]);
      expect(html).toContain('data-img-idx="0"');
      expect(html).toContain('data-img-idx="1"');
    });

    it('img loading=lazy pour perf album large', () => {
      const html = renderImageAlbum([{ url: 'https://x.com/a.jpg', filename: 'a.jpg' }]);
      expect(html).toContain('loading="lazy"');
    });
  });

  describe('openImageLightbox', () => {
    it('ouvre modal plein écran avec image', () => {
      const modal = openImageLightbox(root, { url: 'https://x.com/a.jpg', filename: 'a.jpg' });
      expect(modal).toBeTruthy();
      /* v13.4.232 finding P1.10 — ajout .ax-modal-glass pour glassmorphism backdrop-filter */
      expect(modal.classList.contains('ax-lightbox')).toBe(true);
      expect(modal.classList.contains('ax-modal-glass')).toBe(true);
      expect(modal.getAttribute('role')).toBe('dialog');
      expect(modal.querySelector('img')?.getAttribute('src')).toBe('https://x.com/a.jpg');
    });

    it('contient les 7 boutons d\'action', () => {
      const modal = openImageLightbox(root, { url: 'https://x.com/a.jpg', filename: 'a.jpg' });
      const actions = modal.querySelectorAll('[data-action]');
      const actionIds = Array.from(actions).map((b) => (b as HTMLElement).dataset['action']);
      expect(actionIds).toContain('cartoon');
      expect(actionIds).toContain('anime');
      expect(actionIds).toContain('video');
      expect(actionIds).toContain('remove-bg');
      expect(actionIds).toContain('stylize');
      expect(actionIds).toContain('share');
      expect(actionIds).toContain('download');
    });

    it('bouton fermer retire le modal', () => {
      const modal = openImageLightbox(root, { url: 'https://x.com/a.jpg', filename: 'a.jpg' });
      expect(document.body.contains(modal)).toBe(true);
      const closeBtn = modal.querySelector<HTMLButtonElement>('.ax-lb-close');
      closeBtn?.click();
      expect(document.body.contains(modal)).toBe(false);
    });

    it('click outside (sur backdrop) ferme', () => {
      const modal = openImageLightbox(root, { url: 'https://x.com/a.jpg', filename: 'a.jpg' });
      modal.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(document.body.contains(modal)).toBe(false);
    });

    it('Escape ferme modal', () => {
      const modal = openImageLightbox(root, { url: 'https://x.com/a.jpg', filename: 'a.jpg' });
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(document.body.contains(modal)).toBe(false);
    });

    it('échappe XSS dans filename (pas d\'exécution script)', () => {
      const modal = openImageLightbox(root, {
        url: 'https://x.com/a.jpg',
        filename: '<script>alert(1)</script>',
      });
      /* Aucun élément <script> exécutable ne doit être créé dans le DOM */
      expect(modal.querySelector('script')).toBeNull();
      /* Le filename apparaît bien comme texte échappé dans le filename div */
      const filenameDiv = modal.querySelector('.ax-lb-filename');
      expect(filenameDiv?.textContent).toBe('<script>alert(1)</script>');
      expect(filenameDiv?.querySelector('script')).toBeNull();
    });

    it('zone status présente pour feedback', () => {
      const modal = openImageLightbox(root, { url: 'https://x.com/a.jpg', filename: 'a.jpg' });
      expect(modal.querySelector('[data-status]')).toBeTruthy();
    });
  });

  describe('handleLightboxAction', () => {
    it('action download crée lien download', async () => {
      const closeFn = vi.fn();
      const img: AlbumImage = { url: 'https://x.com/a.jpg', filename: 'a.jpg' };
      const clickSpy = vi.fn();
      const origCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        const el = origCreateElement(tag);
        if (tag === 'a') {
          (el as HTMLAnchorElement).click = clickSpy;
        }
        return el;
      });
      await handleLightboxAction(root, img, 'download', null, closeFn);
      expect(clickSpy).toHaveBeenCalled();
    });

    it('action share fallback clipboard quand pas de navigator.share', async () => {
      const closeFn = vi.fn();
      const img: AlbumImage = { url: 'https://x.com/a.jpg', filename: 'a.jpg' };
      /* Remove share */
      delete (navigator as Navigator & { share?: unknown }).share;
      const writeTextSpy = vi.fn(() => Promise.resolve());
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: writeTextSpy },
      });
      await handleLightboxAction(root, img, 'share', null, closeFn);
      expect(writeTextSpy).toHaveBeenCalledWith('https://x.com/a.jpg');
    });

    it('action transform met à jour status pendant l\'opération', async () => {
      const closeFn = vi.fn();
      const img: AlbumImage = { url: 'https://x.com/a.jpg', filename: 'a.jpg' };
      const statusEl = document.createElement('div') as HTMLDivElement;
      /* Mock dispatch retournant échec rapide */
      vi.doMock('../../services/apex-tools-dispatch.js', () => ({
        apexToolsDispatch: {
          execute: vi.fn(() => Promise.resolve({ ok: false, error: 'mock fail' })),
        },
      }));
      await handleLightboxAction(root, img, 'cartoon', statusEl, closeFn);
      expect(statusEl.textContent).toMatch(/cartoon|fail|❌/i);
      vi.doUnmock('../../services/apex-tools-dispatch.js');
    });

    it('action inconnue → no-op silent', async () => {
      const closeFn = vi.fn();
      const img: AlbumImage = { url: 'https://x.com/a.jpg', filename: 'a.jpg' };
      /* Should not throw */
      await expect(handleLightboxAction(root, img, 'unknown_xyz', null, closeFn)).resolves.toBeUndefined();
    });
  });

  describe('pushTransformResult', () => {
    it('ajoute bulle Apex avec image dans scroll', () => {
      pushTransformResult(root, 'https://out.com/cartoon.png', 'cartoon', 'photo.jpg');
      const scroll = root.querySelector('.ax-chat-scroll');
      const card = scroll?.querySelector('.ax-transform-result');
      expect(card).toBeTruthy();
      expect(card?.querySelector('img')?.getAttribute('src')).toBe('https://out.com/cartoon.png');
    });

    it('utilise <video> pour transform_type=video', () => {
      pushTransformResult(root, 'https://out.com/a.mp4', 'video', 'photo.jpg');
      const card = root.querySelector('.ax-transform-result');
      expect(card?.querySelector('video')).toBeTruthy();
      expect(card?.querySelector('img')).toBeFalsy();
    });

    it('utilise <video> pour URL .mp4', () => {
      pushTransformResult(root, 'https://out.com/result.mp4', 'cartoon', 'p.jpg');
      const card = root.querySelector('.ax-transform-result');
      expect(card?.querySelector('video')).toBeTruthy();
    });

    it('boutons Télécharger + Partager présents', () => {
      pushTransformResult(root, 'https://out.com/a.png', 'cartoon', 'p.jpg');
      const card = root.querySelector('.ax-transform-result');
      const actions = card?.querySelectorAll('[data-tr-action]');
      expect(actions?.length).toBe(2);
    });

    it('échappe XSS dans outputUrl (pas d\'exécution script)', () => {
      pushTransformResult(root, '"><script>alert(1)</script>', 'cartoon', 'p.jpg');
      const card = root.querySelector('.ax-transform-result');
      /* Aucun élément <script> exécutable ne doit être créé */
      expect(card?.querySelector('script')).toBeNull();
      /* L'URL malveillante n'a pas pu casser l'attribut src (toujours dans une string) */
      const img = card?.querySelector('img');
      expect(img).toBeTruthy();
    });

    it('data-transform-type bien set', () => {
      pushTransformResult(root, 'https://out.com/a.png', 'anime', 'p.jpg');
      const card = root.querySelector('.ax-transform-result') as HTMLElement | null;
      expect(card?.dataset['transformType']).toBe('anime');
    });

    it('aucune erreur si scroll manquant', () => {
      const newRoot = document.createElement('div');
      expect(() => pushTransformResult(newRoot, 'https://x', 'cartoon', 'a')).not.toThrow();
    });
  });
});
