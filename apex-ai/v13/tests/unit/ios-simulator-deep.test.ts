/**
 * APEX v13 — Tests deep ios-simulator (couvrir 100% L+B).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import { iosSimulator } from '../../services/integrations/ios-simulator.js';
import { logger } from '../../core/logger.js';

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  localStorage.clear();
});

describe('iosSimulator — previewURL', () => {
  it('URL valide → wrapper avec iframe src', () => {
    const html = iosSimulator.previewURL('https://example.com');
    expect(html).toContain('<iframe');
    expect(html).toContain('https://example.com');
    expect(html).toContain('ax-ios-sim');
  });

  it('refuse URL javascript:', () => {
    /* eslint-disable-next-line no-script-url -- test du blocage scheme dangereux */
    const dangerousUrl = 'javascript:alert(1)';
    expect(() => iosSimulator.previewURL(dangerousUrl)).toThrow(/URL/);
  });

  it('refuse URL vide', () => {
    expect(() => iosSimulator.previewURL('')).toThrow(/URL/);
  });

  it('refuse URL ftp://', () => {
    expect(() => iosSimulator.previewURL('ftp://x.com')).toThrow(/URL/);
  });

  it('iphone-15-pro par défaut (393×852)', () => {
    const html = iosSimulator.previewURL('https://x.com');
    expect(html).toContain('393×852');
  });

  it('option model iphone-se → 375×667', () => {
    const html = iosSimulator.previewURL('https://x.com', { model: 'iphone-se' });
    expect(html).toContain('375×667');
  });

  it('option model iphone-14 → 390×844', () => {
    const html = iosSimulator.previewURL('https://x.com', { model: 'iphone-14' });
    expect(html).toContain('390×844');
  });

  it('option scheme=light affecte couleur fond iframe', () => {
    const html = iosSimulator.previewURL('https://x.com', { scheme: 'light' });
    expect(html).toContain('background:#fff');
  });

  it('scheme=dark (default) → fond noir', () => {
    const html = iosSimulator.previewURL('https://x.com');
    expect(html).toContain('background:#000');
  });

  it('échappe " et < dans URL pour éviter injection HTML', () => {
    const html = iosSimulator.previewURL('https://x.com/?q="<script>');
    expect(html).toContain('&quot;');
    /* escAttr échappe seulement " et <, pas > */
    expect(html).toContain('&lt;script>');
  });
});

describe('iosSimulator — previewHTML', () => {
  it('HTML non vide → wrapper avec iframe srcdoc', () => {
    const html = iosSimulator.previewHTML('<h1>Hello</h1>');
    expect(html).toContain('srcdoc=');
    expect(html).toContain('ax-ios-sim');
  });

  it('HTML vide → throw', () => {
    expect(() => iosSimulator.previewHTML('')).toThrow(/HTML/);
  });

  it('échappe HTML dans srcdoc', () => {
    const html = iosSimulator.previewHTML('<a title="x">');
    /* escAttr échappe " et < seulement */
    expect(html).toMatch(/srcdoc="&lt;a title=&quot;x&quot;>/);
  });
});

describe('iosSimulator — history', () => {
  it('vide initialement', () => {
    expect(iosSimulator.history()).toEqual([]);
  });

  it('parsing JSON invalide → array vide', () => {
    localStorage.setItem('apex_v13_ios_simulator_history', 'not-json');
    expect(iosSimulator.history()).toEqual([]);
  });

  it('historique non-array → []', () => {
    localStorage.setItem('apex_v13_ios_simulator_history', JSON.stringify({ foo: 'bar' }));
    expect(iosSimulator.history()).toEqual([]);
  });

  it('historique array valide → retourne tel quel', () => {
    const entries = [{ html: 'h1', at: 1 }, { html: 'h2', at: 2 }];
    localStorage.setItem('apex_v13_ios_simulator_history', JSON.stringify(entries));
    expect(iosSimulator.history()).toEqual(entries);
  });
});

describe('iosSimulator — openPreview', () => {
  it('appelle modalSheet.open + persiste history', async () => {
    const open = vi.fn();
    const closeAll = vi.fn();
    vi.doMock('../../ui/modal-sheet.js', () => ({
      modalSheet: { open, closeAll },
    }));
    /* re-import après doMock */
    vi.resetModules();
    const { iosSimulator: fresh } = await import('../../services/integrations/ios-simulator.js');
    await fresh.openPreview('<h1>x</h1>');
    expect(open).toHaveBeenCalled();
    const passed = open.mock.calls[0]![0];
    expect(passed.title).toMatch(/iOS Simulator/);
    expect(passed.actions[0].label).toBe('Fermer');
    /* trigger onClick */
    passed.actions[0].onClick();
    expect(closeAll).toHaveBeenCalled();
    /* history persisté */
    const hist = fresh.history();
    expect(hist.length).toBeGreaterThan(0);
    expect(hist[0]?.html).toContain('<h1>x</h1>');
    vi.doUnmock('../../ui/modal-sheet.js');
  });

  it('modal indispo → throw + log warn', async () => {
    vi.doMock('../../ui/modal-sheet.js', () => {
      throw new Error('module not found');
    });
    vi.resetModules();
    const { iosSimulator: fresh } = await import('../../services/integrations/ios-simulator.js');
    await expect(fresh.openPreview('<h1>x</h1>')).rejects.toThrow(/Modal-sheet indispo/);
    vi.doUnmock('../../ui/modal-sheet.js');
  });

  it('persist cap 10 entries (FIFO)', async () => {
    /* Simuler 12 entries existantes */
    const arr = Array.from({ length: 12 }, (_, i) => ({ html: `h${i}`, at: i }));
    localStorage.setItem('apex_v13_ios_simulator_history', JSON.stringify(arr));
    const open = vi.fn();
    vi.doMock('../../ui/modal-sheet.js', () => ({
      modalSheet: { open, closeAll: vi.fn() },
    }));
    vi.resetModules();
    const { iosSimulator: fresh } = await import('../../services/integrations/ios-simulator.js');
    await fresh.openPreview('<h1>new</h1>');
    const hist = fresh.history();
    expect(hist.length).toBe(10);
    expect(hist[0]?.html).toContain('<h1>new</h1>');
    vi.doUnmock('../../ui/modal-sheet.js');
  });

  it('persist localStorage.setItem throw → catch silencieux (branche 116)', async () => {
    vi.doMock('../../ui/modal-sheet.js', () => ({
      modalSheet: { open: vi.fn(), closeAll: vi.fn() },
    }));
    vi.resetModules();
    const { iosSimulator: fresh } = await import('../../services/integrations/ios-simulator.js');
    /* happy-dom : `localStorage.setItem = fn` ne prend pas (non-writable) → stubGlobal
     * pour que setItem JETTE réellement et atteigne le catch persist. */
    vi.stubGlobal('localStorage', {
      getItem: () => '[]',
      setItem: () => { throw new Error('quota'); },
      removeItem: () => {}, clear: () => {},
    });
    await expect(fresh.openPreview('<h1>x</h1>')).resolves.toBeUndefined();
    vi.unstubAllGlobals();
    vi.doUnmock('../../ui/modal-sheet.js');
  });

  it('buildFrameHtml avec url → src="..." (branche src.url 87)', () => {
    const html = (
      iosSimulator as unknown as {
        buildFrameHtml(s: { url?: string; srcdoc?: string }, o: Record<string, unknown>): string;
      }
    ).buildFrameHtml({ url: 'https://example.com/app' }, {});
    expect(html).toContain('src="https://example.com/app"');
    expect(html).not.toContain('srcdoc=');
  });

  it('buildFrameHtml sans url ni srcdoc → `?? ""` (branche srcdoc nullish 87:31)', () => {
    const html = (
      iosSimulator as unknown as {
        buildFrameHtml(s: { url?: string; srcdoc?: string }, o: Record<string, unknown>): string;
      }
    ).buildFrameHtml({}, {});
    expect(html).toContain('srcdoc=""');
  });
});
