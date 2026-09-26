/**
 * Tests chat-album v13.4.171 (refactor minutieux extraction depuis chat/index.ts).
 *
 * Vérifie zéro régression : génération HTML album image grid.
 */
import { describe, expect, it } from 'vitest';
import { renderImageAlbum, type AlbumImage } from '../../features/chat/chat-album.js';

describe('chat-album renderImageAlbum (v13.4.171)', () => {
  describe('empty/invalid cases', () => {
    it('array vide → chaîne vide', () => {
      expect(renderImageAlbum([])).toBe('');
    });

    it('non-array → chaîne vide', () => {
      /* @ts-expect-error tester null safety runtime */
      expect(renderImageAlbum(null)).toBe('');
      /* @ts-expect-error idem */
      expect(renderImageAlbum(undefined)).toBe('');
    });
  });

  describe('grid layout adaptatif', () => {
    it('1 image → 1 colonne', () => {
      const r = renderImageAlbum([{ url: 'a.png', filename: 'a.png' }]);
      expect(r).toContain('grid-template-columns:repeat(1,1fr)');
    });

    it('2 images → 2 colonnes', () => {
      const r = renderImageAlbum([
        { url: 'a.png', filename: 'a.png' },
        { url: 'b.png', filename: 'b.png' },
      ]);
      expect(r).toContain('grid-template-columns:repeat(2,1fr)');
    });

    it('4 images → 2 colonnes', () => {
      const imgs: AlbumImage[] = Array.from({ length: 4 }, (_, i) => ({
        url: `${i}.png`,
        filename: `${i}.png`,
      }));
      expect(renderImageAlbum(imgs)).toContain('grid-template-columns:repeat(2,1fr)');
    });

    it('5 images → 3 colonnes', () => {
      const imgs: AlbumImage[] = Array.from({ length: 5 }, (_, i) => ({
        url: `${i}.png`,
        filename: `${i}.png`,
      }));
      expect(renderImageAlbum(imgs)).toContain('grid-template-columns:repeat(3,1fr)');
    });

    it('10 images → 3 colonnes', () => {
      const imgs: AlbumImage[] = Array.from({ length: 10 }, (_, i) => ({
        url: `${i}.png`,
        filename: `${i}.png`,
      }));
      expect(renderImageAlbum(imgs)).toContain('grid-template-columns:repeat(3,1fr)');
    });
  });

  describe('HTML structure', () => {
    it('container .ax-image-album présent', () => {
      const r = renderImageAlbum([{ url: 'a.png', filename: 'a.png' }]);
      expect(r).toContain('class="ax-image-album"');
    });

    it('chaque image a son .ax-album-item avec data-img-idx', () => {
      const r = renderImageAlbum([
        { url: 'a.png', filename: 'a.png' },
        { url: 'b.png', filename: 'b.png' },
      ]);
      expect(r).toContain('data-img-idx="0"');
      expect(r).toContain('data-img-idx="1"');
    });

    it('img tag avec src + alt + lazy loading', () => {
      const r = renderImageAlbum([
        { url: 'https://example.com/cat.png', filename: 'cat.png' },
      ]);
      expect(r).toContain('src="https://example.com/cat.png"');
      expect(r).toContain('alt="cat.png"');
      expect(r).toContain('loading="lazy"');
    });

    it('overlay filename en bas de chaque image', () => {
      const r = renderImageAlbum([{ url: 'a.png', filename: 'cat.png' }]);
      expect(r).toContain('class="ax-album-overlay"');
      expect(r).toContain('>cat.png</div>');
    });
  });

  describe('XSS-safe escape', () => {
    it('escape url avec quotes', () => {
      const r = renderImageAlbum([{ url: 'a.png"><script>x</script>', filename: 'a' }]);
      expect(r).not.toContain('<script>x</script>');
      expect(r).toContain('&quot;');
    });

    it('escape filename avec HTML', () => {
      const r = renderImageAlbum([{ url: 'a.png', filename: '<script>alert(1)</script>' }]);
      expect(r).not.toContain('<script>alert(1)</script>');
      expect(r).toContain('&lt;script&gt;');
    });

    it('escape entités HTML basiques', () => {
      const r = renderImageAlbum([{ url: 'a.png', filename: 'name & co' }]);
      expect(r).toContain('name &amp; co');
    });
  });

  describe('compat re-export depuis chat/index.ts', () => {
    it('chat/index.ts re-exporte renderImageAlbum', async () => {
      const chatModule = await import('../../features/chat/index.js');
      expect(typeof chatModule.renderImageAlbum).toBe('function');
    });
  });
});
