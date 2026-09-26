/**
 * Tests Geo Feature View v13.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, escapeHtml } from '../../features/geo/index.js';
import { geolocation } from '../../services/integrations/geolocation.js';

describe('features/geo — escapeHtml', () => {
  it('échappe caractères dangereux', () => {
    expect(escapeHtml('<script>x</script>')).toBe('&lt;script&gt;x&lt;/script&gt;');
    expect(escapeHtml('"&\'<>')).toBe('&quot;&amp;&#39;&lt;&gt;');
  });
});

describe('features/geo — render', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('rend la page sans position connue', () => {
    const root = document.createElement('div');
    render(root);
    expect(root.innerHTML).toContain('Géolocalisation');
    expect(root.innerHTML).toContain('Aucune position');
    expect(root.innerHTML).toContain('Obtenir ma position');
  });

  it('rend la page avec position connue + lien Google Maps', () => {
    /* Seed */
    geolocation.saveFavoriteLocation({ name: 'Casino', lat: 43.7384, lng: 7.4246, type: 'work' });
    localStorage.setItem(
      'apex_v13_geo_last_position',
      JSON.stringify({ latitude: 43.7384, longitude: 7.4246, accuracy: 8, timestamp: Date.now() }),
    );
    const root = document.createElement('div');
    render(root);
    expect(root.innerHTML).toContain('Casino');
    expect(root.innerHTML).toContain('google.com/maps');
    expect(root.innerHTML).toContain('Excellente');
  });

  it('escape HTML sur nom favori malveillant', () => {
    geolocation.saveFavoriteLocation({ name: '<img src=x onerror=alert(1)>', lat: 0, lng: 0 });
    const root = document.createElement('div');
    render(root);
    expect(root.innerHTML).not.toContain('<img src=x');
    expect(root.innerHTML).toContain('&lt;img');
  });

  it('rend les zones (geofences)', () => {
    geolocation.watchGeofence({ name: 'Maison', lat: 1, lng: 2, radius: 50 });
    const root = document.createElement('div');
    render(root);
    expect(root.innerHTML).toContain('Maison');
    expect(root.innerHTML).toContain('50');
  });
});

describe('features/geo — interactions handlers', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('click "remove-fav" supprime le favori et re-render', () => {
    const fav = geolocation.saveFavoriteLocation({ name: 'X', lat: 1, lng: 2 });
    const root = document.createElement('div');
    document.body.appendChild(root);
    render(root);
    const btn = root.querySelector<HTMLElement>(`[data-action="remove-fav"][data-fav-id="${fav.id}"]`);
    expect(btn).not.toBeNull();
    btn?.click();
    expect(geolocation.getFavoriteLocations()).toHaveLength(0);
    document.body.removeChild(root);
  });

  it('click "remove-fence" supprime la zone et re-render', () => {
    const id = geolocation.watchGeofence({ name: 'Z', lat: 1, lng: 2, radius: 100 });
    const root = document.createElement('div');
    document.body.appendChild(root);
    render(root);
    const btn = root.querySelector<HTMLElement>(`[data-action="remove-fence"][data-fence-id="${id}"]`);
    expect(btn).not.toBeNull();
    btn?.click();
    expect(geolocation.getGeofences()).toHaveLength(0);
    document.body.removeChild(root);
  });

  it('click "load-weather" insère du HTML chargement puis météo (mock fetch)', async () => {
    /* Pre-position pour ne pas appeler GPS */
    localStorage.setItem(
      'apex_v13_geo_last_position',
      JSON.stringify({ latitude: 43.7, longitude: 7.4, accuracy: 8, timestamp: Date.now() }),
    );
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          current: { temperature_2m: 20, apparent_temperature: 19, weather_code: 0 },
          daily: {
            time: ['2026-05-07'],
            weather_code: [0],
            temperature_2m_max: [25],
            temperature_2m_min: [15],
            precipitation_sum: [0],
          },
        }),
    } as Response);
    const root = document.createElement('div');
    document.body.appendChild(root);
    render(root);
    const btn = root.querySelector<HTMLElement>('[data-action="load-weather"]');
    btn?.click();
    /* Wait microtasks */
    await new Promise((r) => setTimeout(r, 50));
    expect(root.querySelector('#ax-geo-weather')?.innerHTML).toContain('20');
    document.body.removeChild(root);
  });

  it('click "share-position" sans navigator.share copy clipboard', () => {
    localStorage.setItem(
      'apex_v13_geo_last_position',
      JSON.stringify({ latitude: 43.7, longitude: 7.4, accuracy: 8, timestamp: Date.now() }),
    );
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    /* Force navigator.share absent */
    const navAny = navigator as Navigator & { share?: unknown };
    delete navAny.share;
    const root = document.createElement('div');
    document.body.appendChild(root);
    render(root);
    const btn = root.querySelector<HTMLElement>('[data-action="share-position"]');
    btn?.click();
    expect(writeText).toHaveBeenCalled();
    document.body.removeChild(root);
  });

  it('toggle-tracking active puis désactive watchPosition', () => {
    const navMock = {
      watchPosition: vi.fn(() => 99),
      clearWatch: vi.fn(),
      getCurrentPosition: vi.fn(),
    };
    Object.defineProperty(navigator, 'geolocation', { value: navMock, configurable: true });
    const root = document.createElement('div');
    document.body.appendChild(root);
    render(root);
    const btn = root.querySelector<HTMLElement>('[data-action="toggle-tracking"]');
    btn?.click();
    expect(navMock.watchPosition).toHaveBeenCalled();
    /* Re-render now shows "Arrêter le suivi" — click again */
    const btn2 = root.querySelector<HTMLElement>('[data-action="toggle-tracking"]');
    btn2?.click();
    expect(navMock.clearWatch).toHaveBeenCalledWith(99);
    document.body.removeChild(root);
  });
});
