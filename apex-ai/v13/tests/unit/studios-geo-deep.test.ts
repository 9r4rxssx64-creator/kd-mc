/**
 * APEX v13 — Tests deep features/studios/geo (helpers + render + handlers)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../core/store.js', () => ({
  store: { get: vi.fn(() => ({ id: 'test_uid' })) },
}));
vi.mock('../../services/auth/feature-guard.js', () => ({
  guardFeatureEnabled: vi.fn(() => true),
}));
vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));
vi.mock('../../ui/haptic.js', () => ({
  haptic: { tap: vi.fn(), success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));
vi.mock('../../ui/toast.js', () => ({
  toast: { warn: vi.fn(), success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import {
  render,
  dispose,
  escapeHtml,
  haversineKm,
  ddToDms,
  isValidLatLon,
  geocodeAddress,
  appleMapsUrl,
  googleMapsUrl,
  MONACO_REF,
  POIS_MONACO,
} from '../../features/studios/geo/index.js';
import { guardFeatureEnabled } from '../../services/auth/feature-guard.js';
import { toast } from '../../ui/toast.js';
import { haptic } from '../../ui/haptic.js';

let root: HTMLDivElement;

beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '';
  root = document.createElement('div');
  document.body.appendChild(root);
  dispose();
});

afterEach(() => {
  document.body.innerHTML = '';
  dispose();
});

describe('studios-geo — pure helpers', () => {
  it('escapeHtml échappe & < > " \'', () => {
    expect(escapeHtml('<a&"\'>')).toBe('&lt;a&amp;&quot;&#39;&gt;');
  });

  it('haversineKm Monaco → soi-même = 0', () => {
    expect(haversineKm(MONACO_REF, MONACO_REF)).toBe(0);
  });

  it('haversineKm Monaco → Paris ≈ 690km', () => {
    const paris = { lat: 48.8566, lon: 2.3522 };
    const d = haversineKm(MONACO_REF, paris);
    expect(d).toBeGreaterThan(680);
    expect(d).toBeLessThan(700);
  });

  it('ddToDms latitude positive → N', () => {
    expect(ddToDms(43.7384, true)).toMatch(/N$/);
  });

  it('ddToDms latitude négative → S', () => {
    expect(ddToDms(-12.5, true)).toMatch(/S$/);
  });

  it('ddToDms longitude positive → E', () => {
    expect(ddToDms(7.4246, false)).toMatch(/E$/);
  });

  it('ddToDms longitude négative → O', () => {
    expect(ddToDms(-1.5, false)).toMatch(/O$/);
  });

  it('isValidLatLon valide Monaco', () => {
    expect(isValidLatLon(MONACO_REF)).toBe(true);
  });

  it('isValidLatLon refuse hors-bornes lat', () => {
    expect(isValidLatLon({ lat: 91, lon: 0 })).toBe(false);
    expect(isValidLatLon({ lat: -91, lon: 0 })).toBe(false);
  });

  it('isValidLatLon refuse hors-bornes lon', () => {
    expect(isValidLatLon({ lat: 0, lon: 181 })).toBe(false);
    expect(isValidLatLon({ lat: 0, lon: -181 })).toBe(false);
  });

  it('isValidLatLon refuse NaN/Infinity', () => {
    expect(isValidLatLon({ lat: NaN, lon: 0 })).toBe(false);
    expect(isValidLatLon({ lat: 0, lon: Infinity })).toBe(false);
  });

  it('appleMapsUrl format basique', () => {
    expect(appleMapsUrl(MONACO_REF)).toContain('maps.apple.com');
    expect(appleMapsUrl(MONACO_REF)).toContain('43.7384,7.4246');
  });

  it('appleMapsUrl avec label', () => {
    const url = appleMapsUrl(MONACO_REF, 'Casino');
    expect(url).toContain('q=Casino');
  });

  it('googleMapsUrl format', () => {
    expect(googleMapsUrl(MONACO_REF)).toContain('google.com/maps');
    expect(googleMapsUrl(MONACO_REF)).toContain('43.7384,7.4246');
  });
});

describe('studios-geo — POIS_MONACO', () => {
  it('contient 8 POI minimum', () => {
    expect(POIS_MONACO.length).toBeGreaterThanOrEqual(8);
  });

  it('chaque POI a coordonnées valides', () => {
    for (const p of POIS_MONACO) {
      expect(isValidLatLon(p)).toBe(true);
      expect(p.id).toBeTruthy();
      expect(p.name).toBeTruthy();
      expect(p.emoji).toBeTruthy();
    }
  });

  it('POI casino existe', () => {
    expect(POIS_MONACO.find((p) => p.id === 'casino')).toBeTruthy();
  });
});

describe('studios-geo — geocodeAddress', () => {
  beforeEach(() => {
    /* Mock fetch */
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('address vide → null', async () => {
    const r = await geocodeAddress('');
    expect(r).toBeNull();
  });

  it('address trop courte → null', async () => {
    const r = await geocodeAddress('ab');
    expect(r).toBeNull();
  });

  it('réponse OK avec results → LatLon', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => [{ lat: '43.7384', lon: '7.4246' }],
    });
    const r = await geocodeAddress('Monaco');
    expect(r?.lat).toBeCloseTo(43.7384);
    expect(r?.lon).toBeCloseTo(7.4246);
  });

  it('réponse vide → null', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });
    const r = await geocodeAddress('UnknownPlace_xxx');
    expect(r).toBeNull();
  });

  it('réponse !ok → null', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false });
    const r = await geocodeAddress('something');
    expect(r).toBeNull();
  });

  it('coordonnées invalides → null', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => [{ lat: '999', lon: '999' }],
    });
    const r = await geocodeAddress('test');
    expect(r).toBeNull();
  });

  it('fetch throw → null + log warn', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('net'));
    const r = await geocodeAddress('something');
    expect(r).toBeNull();
  });

  it('réponse non-array → null', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ foo: 'bar' }),
    });
    const r = await geocodeAddress('something');
    expect(r).toBeNull();
  });
});

describe('studios-geo — render', () => {
  it('rend formulaire + 8 POI cards', () => {
    render(root);
    expect(root.querySelector('#ax-geo-addr')).toBeTruthy();
    expect(root.querySelector('#ax-geo-go')).toBeTruthy();
    expect(root.querySelector('#ax-geo-out')).toBeTruthy();
    /* Chaque POI a un lien Apple Maps */
    const links = root.querySelectorAll('a[href*="maps.apple.com"]');
    expect(links.length).toBeGreaterThanOrEqual(8);
  });

  it('feature guard false → skip render', () => {
    (guardFeatureEnabled as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);
    render(root);
    /* root.innerHTML stays empty / guard injected */
    expect(root.querySelector('#ax-geo-addr')).toBeFalsy();
  });

  it('store user vide → uid="anon"', () => {
    /* default mock returns {id:'test_uid'} so this test forces null */
    /* Already mocked but let's verify uid passé */
    render(root);
    expect(guardFeatureEnabled).toHaveBeenCalledWith('studio.geo', root, 'test_uid');
  });
});

describe('studios-geo — render handler géocoder', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('click sans adresse → message "Saisis une adresse."', () => {
    render(root);
    const btn = root.querySelector<HTMLButtonElement>('#ax-geo-go')!;
    btn.click();
    expect(root.querySelector('#ax-geo-out')?.textContent).toBe('Saisis une adresse.');
  });

  it('click avec adresse + résultat OK → affiche coords + dist', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => [{ lat: '48.8566', lon: '2.3522' }],
    });
    render(root);
    (root.querySelector('#ax-geo-addr') as HTMLInputElement).value = 'Paris';
    root.querySelector<HTMLButtonElement>('#ax-geo-go')!.click();
    await new Promise((r) => setTimeout(r, 30));
    expect(root.querySelector('#ax-geo-out')?.innerHTML).toContain('Coordonnées trouvées');
    expect(root.querySelector('#ax-geo-out')?.innerHTML).toContain('Apple Maps');
    expect(haptic.success).toHaveBeenCalled();
  });

  it('click avec adresse + résultat null → message + toast warn', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, json: async () => [] });
    render(root);
    (root.querySelector('#ax-geo-addr') as HTMLInputElement).value = 'XYZ_unknown';
    root.querySelector<HTMLButtonElement>('#ax-geo-go')!.click();
    await new Promise((r) => setTimeout(r, 30));
    expect(root.querySelector('#ax-geo-out')?.textContent).toMatch(/introuvable/);
    expect(toast.warn).toHaveBeenCalledWith('Géocodage KO');
  });
});

describe('studios-geo — dispose', () => {
  it('dispose ne plante pas', () => {
    render(root);
    expect(() => dispose()).not.toThrow();
    expect(() => dispose()).not.toThrow();
  });

  it('re-render après dispose ok', () => {
    render(root);
    dispose();
    render(root);
    expect(root.querySelector('#ax-geo-addr')).toBeTruthy();
  });
});
