/**
 * docx-generator — branches restantes (campagne 100% réel, 2026-06-03).
 * Cibles : onload handler (jsZipLoaded=true), template inconnu (early return),
 * custom + customHtml (branche ternary true), String(err) non-Error.
 * vi.resetModules() avant chaque test pour réinitialiser le singleton `jsZipLoaded`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const JSZIP_CDN = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
const g = globalThis as Record<string, unknown>;

function makeJSZipStub(opts: { genThrows?: boolean | 'string' } = {}): new () => Record<string, unknown> {
  return function (this: Record<string, unknown>) {
    this['file'] = () => {};
    this['folder'] = () => {
      const f: Record<string, unknown> = {};
      f['file'] = () => {};
      f['folder'] = () => ({ file: () => {} });
      return f;
    };
    this['generateAsync'] = async () => {
      // eslint-disable-next-line no-throw-literal -- test du chemin String(err) (non-Error)
      if (opts.genThrows === 'string') throw 'str-zip';
      if (opts.genThrows) throw new Error('gen fail');
      return new Blob(['DOCX']);
    };
  } as unknown as new () => Record<string, unknown>;
}

beforeEach(() => {
  vi.resetModules();
  document.head.innerHTML = '';
  delete g['JSZip'];
  if (typeof URL.createObjectURL !== 'function') {
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();
  }
});
afterEach(() => { document.head.innerHTML = ''; delete g['JSZip']; });

describe('docx-generator — branches', () => {
  it('loadJSZip onload → jsZipLoaded=true, succès', async () => {
    g['JSZip'] = makeJSZipStub();
    const { docxGenerator } = await import('../../services/skills/docx-generator.js');
    /* Intercepte l'append du <script> : invoque onload synchroniquement (stmts 59-61)
     * sans réellement attacher → pas de fetch réseau happy-dom (qui ferait onerror→null). */
    const spy = vi.spyOn(document.head, 'appendChild').mockImplementation((node: unknown) => {
      const s = node as HTMLScriptElement;
      if (s.tagName === 'SCRIPT' && typeof s.onload === 'function') s.onload(new Event('load'));
      return node as Node;
    });
    const r = await docxGenerator.generate({ template: 'letter-formal', data: { body: 'b' } });
    spy.mockRestore();
    expect(r.success).toBe(true);
  });

  it('template inconnu → early return Unknown template', async () => {
    g['JSZip'] = makeJSZipStub();
    const { docxGenerator } = await import('../../services/skills/docx-generator.js');
    const r = await docxGenerator.generate({
      template: 'bidon' as unknown as 'custom',
      data: {},
    });
    expect(r.success).toBe(false);
    expect(r.error).toContain('Unknown template');
  });

  it('custom + customHtml → branche ternary true', async () => {
    const script = document.createElement('script'); script.src = JSZIP_CDN; document.head.appendChild(script);
    g['JSZip'] = makeJSZipStub();
    const { docxGenerator } = await import('../../services/skills/docx-generator.js');
    const r = await docxGenerator.generate({
      template: 'custom', data: {}, customHtml: 'Mon contenu perso\nLigne 2',
    });
    expect(r.success).toBe(true);
  });

  it('custom sans customHtml → branche else (templateFn)', async () => {
    const script = document.createElement('script'); script.src = JSZIP_CDN; document.head.appendChild(script);
    g['JSZip'] = makeJSZipStub();
    const { docxGenerator } = await import('../../services/skills/docx-generator.js');
    const r = await docxGenerator.generate({ template: 'custom', data: { custom_text: 'txt' } });
    expect(r.success).toBe(true);
  });

  it('generateAsync throw non-Error (string) → catch String(err)', async () => {
    const script = document.createElement('script'); script.src = JSZIP_CDN; document.head.appendChild(script);
    g['JSZip'] = makeJSZipStub({ genThrows: 'string' });
    const { docxGenerator } = await import('../../services/skills/docx-generator.js');
    const r = await docxGenerator.generate({ template: 'cv-modern', data: { full_name: 'X' } });
    expect(r.success).toBe(false);
    expect(r.error).toBe('str-zip');
  });
});
