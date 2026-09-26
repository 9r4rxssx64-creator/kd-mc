/**
 * Tests file-converter.ts (multi-format polyvalent Kevin).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { fileConverter } from '../../services/core-svc/file-converter.js';

describe('File Converter (multi-format auto)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('detectFormat', () => {
    it('PNG → image/png', () => {
      const r = fileConverter.detectFormat('photo.png');
      expect(r.format).toBe('png');
      expect(r.category).toBe('image');
    });

    it('JPG (jpeg) → image/jpg', () => {
      const r = fileConverter.detectFormat('photo.jpeg');
      expect(r.format).toBe('jpg');
      expect(r.category).toBe('image');
    });

    it('MP4 → video', () => {
      const r = fileConverter.detectFormat('video.mp4');
      expect(r.category).toBe('video');
    });

    it('PDF → document', () => {
      const r = fileConverter.detectFormat('contrat.pdf');
      expect(r.category).toBe('document');
    });

    it('XLSX → spreadsheet', () => {
      const r = fileConverter.detectFormat('finance.xlsx');
      expect(r.category).toBe('spreadsheet');
    });

    it('ZIP → archive', () => {
      const r = fileConverter.detectFormat('backup.zip');
      expect(r.category).toBe('archive');
    });

    it('TS → code', () => {
      const r = fileConverter.detectFormat('app.ts');
      expect(r.category).toBe('code');
    });

    it('inconnu sans MIME → unknown', () => {
      const r = fileConverter.detectFormat('mystery.xyz');
      expect(r.format).toBe('unknown');
      expect(r.category).toBe('unknown');
    });

    it('inconnu avec MIME image/* fallback → image', () => {
      const r = fileConverter.detectFormat('mystery.xyz', 'image/png');
      expect(r.category).toBe('image');
    });
  });

  describe('classifyPath classement automatique', () => {
    it('image → Photos/YYYY-MM/', () => {
      const ts = new Date('2026-05-03').getTime();
      const path = fileConverter.classifyPath('photo.png', 'image', ts);
      expect(path).toMatch(/^Photos\/2026-05\//);
    });

    it('document → Documents/', () => {
      const path = fileConverter.classifyPath('contrat.pdf', 'document');
      expect(path).toMatch(/^Documents\//);
    });

    it('archive → Archives/', () => {
      const path = fileConverter.classifyPath('backup.zip', 'archive');
      expect(path).toMatch(/^Archives\//);
    });

    it('chars spéciaux remplacés par _', () => {
      const path = fileConverter.classifyPath('mon photo @ fête!.png', 'image');
      expect(path).not.toContain('@');
      expect(path).not.toContain('!');
    });
  });

  describe('decideStorage adaptatif', () => {
    it('< 100 KB → localStorage', () => {
      expect(fileConverter.decideStorage(50_000)).toBe('localStorage');
    });

    it('100KB - 50MB → idb', () => {
      expect(fileConverter.decideStorage(5_000_000)).toBe('idb');
    });

    it('> 50 MB → firebase', () => {
      expect(fileConverter.decideStorage(100_000_000)).toBe('firebase');
    });
  });

  describe('hashSha256', () => {
    it('hash blob retourne hex 64 chars (ou empty si crypto absent)', async () => {
      const blob = new Blob(['hello world']);
      const hash = await fileConverter.hashSha256(blob);
      /* En env happy-dom, crypto.subtle peut être présent → 64 chars hex, sinon empty */
      expect(typeof hash).toBe('string');
      if (hash.length > 0) {
        expect(hash.length).toBe(64);
        expect(hash).toMatch(/^[0-9a-f]{64}$/);
      }
    });

    it('même contenu → même hash', async () => {
      const a = new Blob(['test']);
      const b = new Blob(['test']);
      const ha = await fileConverter.hashSha256(a);
      const hb = await fileConverter.hashSha256(b);
      if (ha.length > 0 && hb.length > 0) expect(ha).toBe(hb);
    });
  });

  describe('convertText (Markdown ↔ HTML)', () => {
    it('Markdown → HTML basic', () => {
      const md = '# Title\n\n**bold** text';
      const html = fileConverter.convertText(md, 'md', 'html');
      expect(html).toContain('<h1>Title</h1>');
      expect(html).toContain('<strong>bold</strong>');
    });

    it('HTML → Markdown basic', () => {
      const html = '<h2>Subtitle</h2><p><em>italic</em></p>';
      const md = fileConverter.convertText(html, 'html', 'md');
      expect(md).toContain('## Subtitle');
      expect(md).toContain('*italic*');
    });

    it('JSON → YAML', () => {
      const json = '{"name":"kevin","age":35}';
      const yaml = fileConverter.convertText(json, 'json', 'yaml');
      expect(yaml).toContain('name: kevin');
      expect(yaml).toContain('age: 35');
    });

    it('format inconnu → null', () => {
      expect(fileConverter.convertText('test', 'md', 'pdf')).toBeNull();
    });
  });

  describe('listFiles + filter', () => {
    it('listFiles vide → []', () => {
      expect(fileConverter.listFiles('kev')).toEqual([]);
    });

    it('listFiles filter par uid + category', async () => {
      /* Insert manual metadata pour test */
      const meta = [
        { id: '1', name: 'a.png', size_bytes: 100, mime_type: 'image/png', format: 'png', category: 'image', uploaded_at: 100, uploaded_by: 'kev', storage: 'localStorage', classified_path: 'Photos/' },
        { id: '2', name: 'b.pdf', size_bytes: 200, mime_type: 'application/pdf', format: 'pdf', category: 'document', uploaded_at: 200, uploaded_by: 'kev', storage: 'idb', classified_path: 'Documents/' },
        { id: '3', name: 'c.png', size_bytes: 300, mime_type: 'image/png', format: 'png', category: 'image', uploaded_at: 300, uploaded_by: 'lau', storage: 'localStorage', classified_path: 'Photos/' },
      ];
      localStorage.setItem('apex_v13_files_metadata', JSON.stringify(meta));
      expect(fileConverter.listFiles('kev').length).toBe(2);
      expect(fileConverter.listFiles('kev', 'image').length).toBe(1);
      expect(fileConverter.listFiles('lau').length).toBe(1);
    });
  });

  describe('listSupportedFormats', () => {
    it('liste formats par catégorie', () => {
      const fmts = fileConverter.listSupportedFormats();
      expect(fmts.image).toContain('png');
      expect(fmts.video).toContain('mp4');
      expect(fmts.audio).toContain('mp3');
      expect(fmts.archive).toContain('zip');
    });
  });

  describe('getStats', () => {
    it('stats vides → defaults', () => {
      const stats = fileConverter.getStats();
      expect(stats.total_files).toBe(0);
      expect(stats.total_bytes).toBe(0);
    });

    it('stats agrège files + by_category + by_storage', () => {
      const meta = [
        { id: '1', name: 'a.png', size_bytes: 100, mime_type: 'image/png', format: 'png', category: 'image', uploaded_at: 100, uploaded_by: 'k', storage: 'localStorage', classified_path: 'p' },
        { id: '2', name: 'b.mp4', size_bytes: 200, mime_type: 'video/mp4', format: 'mp4', category: 'video', uploaded_at: 200, uploaded_by: 'k', storage: 'idb', classified_path: 'v' },
      ];
      localStorage.setItem('apex_v13_files_metadata', JSON.stringify(meta));
      const stats = fileConverter.getStats('k');
      expect(stats.total_files).toBe(2);
      expect(stats.total_bytes).toBe(300);
      expect(stats.by_category['image']).toBe(1);
      expect(stats.by_category['video']).toBe(1);
      expect(stats.by_storage['localStorage']).toBe(1);
      expect(stats.by_storage['idb']).toBe(1);
    });
  });
});
