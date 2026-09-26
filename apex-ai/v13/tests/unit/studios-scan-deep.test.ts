/**
 * APEX v13 — Tests deep features/studios/scan
 *
 * Couvre :
 *  - render() (auparavant 49.1% L coverage) : DOM + status messages + history
 *  - extractDetections() / detectKind() / scanBarcode() (helpers exportés)
 *  - history persistence (localStorage)
 *  - file picker handler + text analyze handler
 *  - copy buttons + clear history
 *
 * Méthode : DOM happy-dom + vi.mock (toast, haptic, store, feature-guard, logger)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../core/store.js', () => ({
  store: { get: vi.fn(() => ({ id: 'kdmc_admin' })), set: vi.fn(), subscribe: vi.fn(() => () => {}) },
}));

vi.mock('../../services/auth/feature-guard.js', () => ({
  guardFeatureEnabled: vi.fn(() => true),
}));

vi.mock('../../ui/toast.js', () => ({
  toast: {
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    show: vi.fn(),
  },
}));

vi.mock('../../ui/haptic.js', () => ({
  haptic: {
    tap: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../core/logger.js', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  render,
  dispose,
  detectKind,
  extractDetections,
  loadHistory,
  appendHistory,
  clearHistory,
  scanBarcode,
  escapeHtml,
} from '../../features/studios/scan/index.js';
import { toast } from '../../ui/toast.js';
import { haptic } from '../../ui/haptic.js';
import { guardFeatureEnabled } from '../../services/auth/feature-guard.js';

let root: HTMLDivElement;

beforeEach(() => {
  document.body.innerHTML = '';
  root = document.createElement('div');
  document.body.appendChild(root);
  vi.clearAllMocks();
  localStorage.clear();
  /* Reset guard to true by default */
  (guardFeatureEnabled as ReturnType<typeof vi.fn>).mockReturnValue(true);
});

afterEach(() => {
  dispose();
  document.body.innerHTML = '';
});

describe('studios/scan — escapeHtml', () => {
  it('escape les chars HTML risqués', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
    expect(escapeHtml('a & b')).toBe('a &amp; b');
    expect(escapeHtml('"hi"')).toBe('&quot;hi&quot;');
    expect(escapeHtml("'k'")).toBe('&#39;k&#39;');
  });
});

describe('studios/scan — detectKind', () => {
  it('détecte email', () => {
    expect(detectKind('test@example.com')).toBe('email');
  });

  it('détecte api_key Anthropic (sk-ant-api…)', () => {
    expect(detectKind('sk-ant-api03-' + 'A'.repeat(45))).toBe('api_key');
  });

  it('détecte api_key OpenAI', () => {
    expect(detectKind('sk-' + 'A'.repeat(45))).toBe('api_key');
  });

  it('détecte api_key GitHub PAT', () => {
    expect(detectKind('ghp_' + 'A'.repeat(36))).toBe('api_key');
  });

  it('détecte IBAN', () => {
    expect(detectKind('FR7630001007941234567890185')).toBe('iban');
  });

  it('détecte URL', () => {
    expect(detectKind('https://apex.test/path')).toBe('url');
  });

  it('détecte BTC address', () => {
    expect(detectKind('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')).toBe('btc_addr');
  });

  it('détecte ETH address', () => {
    expect(detectKind('0x' + 'a'.repeat(40))).toBe('eth_addr');
  });

  it('détecte téléphone (10+ chiffres)', () => {
    expect(detectKind('+33 6 12 34 56 78')).toBe('phone');
  });

  it('plain pour texte normal', () => {
    expect(detectKind('bonjour')).toBe('plain');
  });
});

describe('studios/scan — extractDetections', () => {
  it('retourne [] pour texte vide', () => {
    expect(extractDetections('')).toEqual([]);
  });

  it('extrait email + url depuis texte multiligne', () => {
    const txt = 'Contact: contact@apex.test\nWeb: https://apex.test';
    const out = extractDetections(txt);
    const kinds = out.map((d) => d.kind);
    expect(kinds).toContain('email');
    expect(kinds).toContain('url');
  });

  it('dédupe les doublons', () => {
    const txt = 'a@b.com\na@b.com\na@b.com';
    const out = extractDetections(txt);
    expect(out.length).toBe(1);
  });

  it('découpe par tokens si ligne mixte', () => {
    const txt = 'Mon mail est test@x.com merci';
    const out = extractDetections(txt);
    expect(out.some((d) => d.kind === 'email' && d.value === 'test@x.com')).toBe(true);
  });

  it('skip tokens trop courts (<5 chars)', () => {
    const txt = 'a b c';
    const out = extractDetections(txt);
    expect(out.length).toBe(0);
  });
});

describe('studios/scan — history', () => {
  it('loadHistory retourne [] si vide', () => {
    expect(loadHistory()).toEqual([]);
  });

  it('appendHistory persiste entry', () => {
    appendHistory({ ts: 100, type: 'ocr', raw: 'hello', detected: [] });
    const list = loadHistory();
    expect(list.length).toBe(1);
    expect(list[0]?.raw).toBe('hello');
  });

  it('appendHistory trim au-delà de HISTORY_MAX (20)', () => {
    for (let i = 0; i < 25; i++) {
      appendHistory({ ts: i, type: 'ocr', raw: `e${i}`, detected: [] });
    }
    const list = loadHistory();
    expect(list.length).toBe(20);
    /* Plus récents conservés */
    expect(list[list.length - 1]?.raw).toBe('e24');
  });

  it('clearHistory vide tout', () => {
    appendHistory({ ts: 1, type: 'qr', raw: 'a', detected: [] });
    clearHistory();
    expect(loadHistory()).toEqual([]);
  });

  it('loadHistory tolère JSON corrompu', () => {
    localStorage.setItem('ax_scan_history', 'not-json{{');
    expect(loadHistory()).toEqual([]);
  });

  it('loadHistory tolère JSON non-array', () => {
    localStorage.setItem('ax_scan_history', '{"x":1}');
    expect(loadHistory()).toEqual([]);
  });
});

describe('studios/scan — scanBarcode', () => {
  it('retourne null si BarcodeDetector absent', async () => {
    /* Par défaut en happy-dom, BarcodeDetector n'existe pas */
    delete (window as { BarcodeDetector?: unknown }).BarcodeDetector;
    const blob = new Blob(['x'], { type: 'image/png' });
    const r = await scanBarcode(blob);
    expect(r).toBeNull();
  });

  it('utilise BarcodeDetector si disponible (mock)', async () => {
    /* Stub global */
    const detectMock = vi.fn(async () => [
      { rawValue: 'https://apex.test', format: 'qr_code' },
    ]);
    (window as unknown as { BarcodeDetector: unknown }).BarcodeDetector = vi.fn(() => ({
      detect: detectMock,
    })) as unknown;
    /* Stub createImageBitmap */
    (globalThis as unknown as { createImageBitmap: unknown }).createImageBitmap = vi.fn(
      async () => ({ width: 1, height: 1 }),
    );
    const blob = new Blob(['x'], { type: 'image/png' });
    const r = await scanBarcode(blob);
    expect(r).not.toBeNull();
    expect(r?.[0]?.value).toBe('https://apex.test');
    expect(r?.[0]?.format).toBe('qr_code');
    /* Cleanup */
    delete (window as { BarcodeDetector?: unknown }).BarcodeDetector;
  });

  it('catch erreur BarcodeDetector et retourne null', async () => {
    (window as unknown as { BarcodeDetector: unknown }).BarcodeDetector = vi.fn(() => ({
      detect: vi.fn(async () => {
        throw new Error('boom');
      }),
    })) as unknown;
    (globalThis as unknown as { createImageBitmap: unknown }).createImageBitmap = vi.fn(
      async () => ({ width: 1, height: 1 }),
    );
    const blob = new Blob(['x'], { type: 'image/png' });
    const r = await scanBarcode(blob);
    expect(r).toBeNull();
    delete (window as { BarcodeDetector?: unknown }).BarcodeDetector;
  });
});

describe('studios/scan — render UI', () => {
  it('render le formulaire scan avec inputs et boutons', () => {
    render(root);
    expect(root.querySelector('#ax-scan-file')).toBeTruthy();
    expect(root.querySelector('#ax-scan-pick')).toBeTruthy();
    expect(root.querySelector('#ax-scan-text')).toBeTruthy();
    expect(root.querySelector('#ax-scan-text-btn')).toBeTruthy();
    expect(root.querySelector('#ax-scan-clear-history')).toBeTruthy();
    expect(root.querySelector('#ax-scan-results')).toBeTruthy();
    expect(root.querySelector('#ax-scan-history')).toBeTruthy();
  });

  it('feature-guard false → render rien (early return)', () => {
    (guardFeatureEnabled as ReturnType<typeof vi.fn>).mockReturnValue(false);
    render(root);
    /* Pas d'éléments scan rendus */
    expect(root.querySelector('#ax-scan-pick')).toBeNull();
  });

  it('history vide → message "Aucun scan"', () => {
    render(root);
    expect(root.querySelector('#ax-scan-history')?.innerHTML).toContain('Aucun scan');
  });

  it('history non-vide → liste les entrées', () => {
    appendHistory({ ts: Date.now(), type: 'qr', raw: 'data1', detected: [] });
    appendHistory({ ts: Date.now(), type: 'ocr', raw: 'data2', detected: [] });
    render(root);
    const histDiv = root.querySelector('#ax-scan-history');
    expect(histDiv?.innerHTML).toContain('data1');
    expect(histDiv?.innerHTML).toContain('data2');
  });

  it('text-btn click sans texte → toast.warn', () => {
    render(root);
    root.querySelector<HTMLButtonElement>('#ax-scan-text-btn')!.click();
    expect(toast.warn).toHaveBeenCalledWith('Colle du texte');
    expect(haptic.tap).toHaveBeenCalled();
  });

  it('text-btn click avec texte → renderDetections affiche résultats', () => {
    render(root);
    const ta = root.querySelector<HTMLTextAreaElement>('#ax-scan-text')!;
    ta.value = 'hello@apex.test';
    root.querySelector<HTMLButtonElement>('#ax-scan-text-btn')!.click();
    /* Détections affichées */
    const wrapper = root.querySelector<HTMLDivElement>('#ax-scan-results');
    expect(wrapper?.style.display).toBe('block');
    expect(root.querySelector('#ax-scan-detections')?.innerHTML).toContain('hello@apex.test');
    expect(root.querySelector('#ax-scan-detections')?.innerHTML).toContain('EMAIL');
  });

  it('text-btn avec texte sans détection → affiche texte brut + bouton copier', () => {
    render(root);
    const ta = root.querySelector<HTMLTextAreaElement>('#ax-scan-text')!;
    ta.value = 'juste un texte normal sans rien';
    root.querySelector<HTMLButtonElement>('#ax-scan-text-btn')!.click();
    const det = root.querySelector('#ax-scan-detections');
    expect(det?.innerHTML).toContain('Texte brut');
    expect(det?.innerHTML).toContain('Copier');
  });

  it('clear-history bouton vide la liste + toast.success', () => {
    appendHistory({ ts: 1, type: 'qr', raw: 'x', detected: [] });
    render(root);
    expect(loadHistory().length).toBe(1);
    root.querySelector<HTMLButtonElement>('#ax-scan-clear-history')!.click();
    expect(loadHistory().length).toBe(0);
    expect(toast.success).toHaveBeenCalledWith('Historique vidé');
  });

  it('pick-btn click → fileInput.click()', () => {
    render(root);
    const fileInput = root.querySelector<HTMLInputElement>('#ax-scan-file')!;
    const clickSpy = vi.spyOn(fileInput, 'click');
    root.querySelector<HTMLButtonElement>('#ax-scan-pick')!.click();
    expect(clickSpy).toHaveBeenCalled();
    expect(haptic.tap).toHaveBeenCalled();
  });

  it('file change avec non-image → toast.warn', () => {
    render(root);
    const fileInput = root.querySelector<HTMLInputElement>('#ax-scan-file')!;
    /* Simule fichier non-image */
    const txtFile = new File(['hello'], 'hello.txt', { type: 'text/plain' });
    Object.defineProperty(fileInput, 'files', { value: [txtFile], configurable: true });
    fileInput.dispatchEvent(new Event('change'));
    expect(toast.warn).toHaveBeenCalledWith('Choisis une image');
  });

  it('file change avec image valide → status "Analyse en cours" puis appel scanBarcode', async () => {
    /* Stub URL.createObjectURL */
    const origCreate = URL.createObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:fake-url');
    render(root);
    const fileInput = root.querySelector<HTMLInputElement>('#ax-scan-file')!;
    const imgFile = new File(['fake'], 'photo.png', { type: 'image/png' });
    Object.defineProperty(fileInput, 'files', { value: [imgFile], configurable: true });
    fileInput.dispatchEvent(new Event('change'));
    /* Status set sync avant promise */
    const status = root.querySelector('#ax-scan-status');
    expect(status?.textContent).toContain('Analyse');
    /* Wait pour que la promise se résolve (BarcodeDetector absent → null) */
    await new Promise((r) => setTimeout(r, 30));
    /* Status met à jour message "Aucun QR/barcode détecté" */
    expect(root.querySelector('#ax-scan-status')?.textContent).toMatch(/Aucun|texte/i);
    URL.createObjectURL = origCreate;
  });
});

describe('studios/scan — copy button (clipboard)', () => {
  it('click copy button → navigator.clipboard.writeText + toast.success', async () => {
    /* Stub clipboard */
    const writeMock = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeMock },
      configurable: true,
    });
    render(root);
    const ta = root.querySelector<HTMLTextAreaElement>('#ax-scan-text')!;
    ta.value = 'value@x.com';
    root.querySelector<HTMLButtonElement>('#ax-scan-text-btn')!.click();
    /* Boutons copy générés */
    const copyBtn = root.querySelector<HTMLButtonElement>('.ax-scan-copy');
    expect(copyBtn).toBeTruthy();
    copyBtn!.click();
    await new Promise((r) => setTimeout(r, 10));
    expect(writeMock).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith('Copié');
  });

  it('clipboard refusé → toast.warn', async () => {
    const writeMock = vi.fn(() => Promise.reject(new Error('denied')));
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeMock },
      configurable: true,
    });
    render(root);
    const ta = root.querySelector<HTMLTextAreaElement>('#ax-scan-text')!;
    ta.value = 'value@x.com';
    root.querySelector<HTMLButtonElement>('#ax-scan-text-btn')!.click();
    const copyBtn = root.querySelector<HTMLButtonElement>('.ax-scan-copy')!;
    copyBtn.click();
    await new Promise((r) => setTimeout(r, 10));
    expect(toast.warn).toHaveBeenCalledWith('Copie KO');
  });
});

describe('studios/scan — dispose', () => {
  it('dispose() safe sans render préalable', () => {
    expect(() => dispose()).not.toThrow();
  });

  it('dispose() cleanup post-render', () => {
    render(root);
    expect(() => dispose()).not.toThrow();
  });
});
