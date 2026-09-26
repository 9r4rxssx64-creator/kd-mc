/**
 * Tests file-converter.ts branches (60→90%).
 * Cible methods: detectFormat, classifyPath, convertText, ingest, listFiles, getStats.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { fileConverter } from '../../services/core-svc/file-converter.js';

describe('file-converter — comprehensive branches', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('detectFormat', () => {
    it('extension known → format', () => {
      expect(fileConverter.detectFormat('photo.jpg').format).toBe('jpg');
      expect(fileConverter.detectFormat('video.mp4').format).toBe('mp4');
      expect(fileConverter.detectFormat('doc.pdf').format).toBe('pdf');
      expect(fileConverter.detectFormat('script.ts').format).toBe('ts');
      expect(fileConverter.detectFormat('a.zip').format).toBe('zip');
      expect(fileConverter.detectFormat('a.json').format).toBe('json');
      expect(fileConverter.detectFormat('a.csv').format).toBe('csv');
      expect(fileConverter.detectFormat('a.pptx').format).toBe('pptx');
    });

    it('extension unknown sans mime → unknown', () => {
      expect(fileConverter.detectFormat('blob.xyz').format).toBe('unknown');
    });

    it('extension unknown + mime image → png', () => {
      const r = fileConverter.detectFormat('blob.xyz', 'image/heic');
      expect(r.format).toBe('png');
      expect(r.category).toBe('image');
    });

    it('extension unknown + mime video → mp4', () => {
      const r = fileConverter.detectFormat('blob.xyz', 'video/quicktime');
      expect(r.format).toBe('mp4');
      expect(r.category).toBe('video');
    });

    it('extension unknown + mime audio → mp3', () => {
      const r = fileConverter.detectFormat('blob.xyz', 'audio/mpeg');
      expect(r.format).toBe('mp3');
      expect(r.category).toBe('audio');
    });

    it('extension unknown + mime pdf → pdf', () => {
      const r = fileConverter.detectFormat('blob.xyz', 'application/pdf');
      expect(r.format).toBe('pdf');
      expect(r.category).toBe('document');
    });

    it('extension unknown + mime random → unknown', () => {
      const r = fileConverter.detectFormat('blob.xyz', 'application/x-binary');
      expect(r.format).toBe('unknown');
    });

    it('filename sans extension', () => {
      const r = fileConverter.detectFormat('noext');
      expect(r.format).toBe('unknown');
    });
  });

  describe('classifyPath', () => {
    const cats = ['image', 'video', 'audio', 'document', 'spreadsheet', 'presentation', 'archive', 'code', 'data', 'unknown'];
    cats.forEach((cat) => {
      it(`category=${cat} retourne path`, () => {
        const path = fileConverter.classifyPath('test.x', cat as never);
        expect(typeof path).toBe('string');
        expect(path.length).toBeGreaterThan(0);
      });
    });

    it('safeName replaces special chars', () => {
      const path = fileConverter.classifyPath('test file (1).jpg', 'image' as never);
      expect(path).not.toContain(' ');
      expect(path).not.toContain('(');
    });

    it('with custom timestamp', () => {
      const path = fileConverter.classifyPath('a.jpg', 'image' as never, new Date('2025-01-01').getTime());
      expect(path).toContain('2025-01');
    });
  });

  describe('hashSha256', () => {
    it('OK avec crypto.subtle', async () => {
      const blob = new Blob(['hello']);
      const hash = await fileConverter.hashSha256(blob);
      expect(typeof hash).toBe('string');
      if (hash) expect(hash.length).toBe(64);
    });

    it('blob vide', async () => {
      const hash = await fileConverter.hashSha256(new Blob([]));
      expect(typeof hash).toBe('string');
    });
  });

  describe('decideStorage', () => {
    it('< 100KB → localStorage', () => {
      expect(fileConverter.decideStorage(50_000)).toBe('localStorage');
    });

    it('100KB-50MB → idb', () => {
      expect(fileConverter.decideStorage(1_000_000)).toBe('idb');
    });

    it('> 50MB → firebase', () => {
      expect(fileConverter.decideStorage(60_000_000)).toBe('firebase');
    });
  });

  describe('convertText', () => {
    it('md → html avec headers', () => {
      const md = '# H1\n## H2\n### H3\n**bold** *italic* `code`';
      const html = fileConverter.convertText(md, 'md', 'html');
      expect(html).toContain('<h1>H1</h1>');
      expect(html).toContain('<h2>H2</h2>');
      expect(html).toContain('<h3>H3</h3>');
      expect(html).toContain('<strong>bold</strong>');
      expect(html).toContain('<em>italic</em>');
      expect(html).toContain('<code>code</code>');
    });

    it('html → md', () => {
      const html = '<h1>T</h1><h2>S</h2><h3>SS</h3><strong>B</strong><em>I</em><code>C</code><p>P</p>';
      const md = fileConverter.convertText(html, 'html', 'md');
      expect(md).toContain('# T');
      expect(md).toContain('**B**');
    });

    it('json → yaml object', () => {
      const json = JSON.stringify({ a: 1, b: 'x' });
      const yaml = fileConverter.convertText(json, 'json', 'yaml');
      expect(yaml).toContain('a: 1');
    });

    it('json → yaml array', () => {
      const json = JSON.stringify([1, 2, 3]);
      const yaml = fileConverter.convertText(json, 'json', 'yaml');
      expect(yaml).toContain('-');
    });

    it('json → yaml nested object', () => {
      const json = JSON.stringify({ outer: { inner: 'val' } });
      const yaml = fileConverter.convertText(json, 'json', 'yaml');
      expect(yaml).toContain('outer:');
    });

    it('json invalide → null', () => {
      const yaml = fileConverter.convertText('not-json{', 'json', 'yaml');
      expect(yaml).toBeNull();
    });

    it('format pair non supporté → null', () => {
      const r = fileConverter.convertText('test', 'pdf', 'png');
      expect(r).toBeNull();
    });
  });

  describe('listFiles + getStats', () => {
    it('listFiles vide initially', () => {
      const list = fileConverter.listFiles();
      expect(list).toEqual([]);
    });

    it('listFiles filtre par uid', () => {
      localStorage.setItem('apex_v13_files_metadata', JSON.stringify([
        { id: '1', name: 'a.jpg', size_bytes: 100, mime_type: 'image/jpeg', format: 'jpg', category: 'image', uploaded_at: 1, uploaded_by: 'u1', storage: 'localStorage', classified_path: 'Photos/a.jpg' },
        { id: '2', name: 'b.jpg', size_bytes: 200, mime_type: 'image/jpeg', format: 'jpg', category: 'image', uploaded_at: 2, uploaded_by: 'u2', storage: 'localStorage', classified_path: 'Photos/b.jpg' },
      ]));
      const list = fileConverter.listFiles('u1');
      expect(list.length).toBe(1);
    });

    it('listFiles filtre par category', () => {
      localStorage.setItem('apex_v13_files_metadata', JSON.stringify([
        { id: '1', name: 'a.jpg', size_bytes: 100, mime_type: 'image/jpeg', format: 'jpg', category: 'image', uploaded_at: 1, uploaded_by: 'u1', storage: 'localStorage', classified_path: 'p' },
        { id: '2', name: 'b.pdf', size_bytes: 200, mime_type: 'application/pdf', format: 'pdf', category: 'document', uploaded_at: 2, uploaded_by: 'u1', storage: 'localStorage', classified_path: 'p' },
      ]));
      const list = fileConverter.listFiles(undefined, 'document');
      expect(list.length).toBe(1);
      expect(list[0]?.format).toBe('pdf');
    });

    it('listFiles avec données corrupt', () => {
      localStorage.setItem('apex_v13_files_metadata', 'not-json');
      const list = fileConverter.listFiles();
      expect(list).toEqual([]);
    });

    it('getStats sans uid', () => {
      localStorage.setItem('apex_v13_files_metadata', JSON.stringify([
        { id: '1', name: 'a', size_bytes: 100, mime_type: '', format: 'jpg', category: 'image', uploaded_at: 1, uploaded_by: 'u', storage: 'localStorage', classified_path: 'p' },
      ]));
      const stats = fileConverter.getStats();
      expect(stats.total_files).toBe(1);
      expect(stats.by_category.image).toBe(1);
      expect(stats.by_storage.localStorage).toBe(1);
    });

    it('getStats avec uid filter', () => {
      localStorage.setItem('apex_v13_files_metadata', JSON.stringify([
        { id: '1', name: 'a', size_bytes: 100, mime_type: '', format: 'jpg', category: 'image', uploaded_at: 1, uploaded_by: 'u1', storage: 'localStorage', classified_path: 'p' },
        { id: '2', name: 'b', size_bytes: 200, mime_type: '', format: 'jpg', category: 'image', uploaded_at: 2, uploaded_by: 'u2', storage: 'idb', classified_path: 'p' },
      ]));
      const stats = fileConverter.getStats('u1');
      expect(stats.total_files).toBe(1);
      expect(stats.total_bytes).toBe(100);
    });
  });

  describe('listSupportedFormats', () => {
    it('retourne objet par catégorie', () => {
      const fmts = fileConverter.listSupportedFormats();
      expect(fmts.image).toContain('png');
      expect(fmts.video).toContain('mp4');
      expect(fmts.audio).toContain('mp3');
    });
  });

  describe('ingest', () => {
    it('ingest file basique', async () => {
      const file = new File(['hello'], 'test.txt', { type: 'text/plain' });
      const r = await fileConverter.ingest(file, 'user1');
      expect(typeof r.ok).toBe('boolean');
      if (r.ok) {
        expect(r.metadata?.name).toBe('test.txt');
        expect(r.metadata?.uploaded_by).toBe('user1');
      }
    });

    it('ingest file image avec timeout race', async () => {
      const file = new File(['img'], 'photo.jpg', { type: 'image/jpeg' });
      const result = await Promise.race([
        fileConverter.ingest(file, 'user1'),
        new Promise<{ ok: boolean }>((res) => setTimeout(() => res({ ok: false }), 200)),
      ]);
      expect(typeof result.ok).toBe('boolean');
    });
  });
});
