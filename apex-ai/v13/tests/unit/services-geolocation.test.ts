/**
 * Tests Geolocation Service v13 — port v12 axGetLocation/axGeofence/axGeoDistance.
 *
 * Coverage cible ≥85% : getCurrentPosition + watch/clear, geocoding mocks,
 * distance/bearing math, favorites/geofences persistence, weather mock,
 * IP geo fallback chain, history throttle.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { geolocation } from '../../services/integrations/geolocation.js';

interface MockGeolocation {
  getCurrentPosition: (success: PositionCallback, error?: PositionErrorCallback, opts?: PositionOptions) => void;
  watchPosition: (success: PositionCallback, error?: PositionErrorCallback, opts?: PositionOptions) => number;
  clearWatch: (id: number) => void;
}

function makePosition(latitude = 43.7384, longitude = 7.4246, accuracy = 10): GeolocationPosition {
  return {
    coords: {
      latitude,
      longitude,
      accuracy,
      altitude: 50,
      altitudeAccuracy: 5,
      heading: 90,
      speed: 1.5,
      toJSON: () => ({}),
    },
    timestamp: Date.now(),
    toJSON: () => ({}),
  } as GeolocationPosition;
}

function installMockGeolocation(impl: Partial<MockGeolocation>): MockGeolocation {
  const mock: MockGeolocation = {
    getCurrentPosition: (success) => success(makePosition()),
    watchPosition: () => 1,
    clearWatch: () => undefined,
    ...impl,
  };
  Object.defineProperty(navigator, 'geolocation', { value: mock, configurable: true });
  return mock;
}

describe('geolocation — getCurrentPosition', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('résout avec coords GPS du browser', async () => {
    installMockGeolocation({
      getCurrentPosition: (success) => success(makePosition(43.5, 7.0, 8)),
    });
    const pos = await geolocation.getCurrentPosition();
    expect(pos.latitude).toBe(43.5);
    expect(pos.longitude).toBe(7.0);
    expect(pos.accuracy).toBe(8);
    expect(pos.timestamp).toBeGreaterThan(0);
  });

  it('rejette si navigator.geolocation absent', async () => {
    Object.defineProperty(navigator, 'geolocation', { value: undefined, configurable: true });
    await expect(geolocation.getCurrentPosition()).rejects.toThrow(/not available/i);
  });

  it('rejette si erreur browser', async () => {
    installMockGeolocation({
      getCurrentPosition: (_s, error) => {
        if (error) error({ code: 1, message: 'Permission denied' } as GeolocationPositionError);
      },
    });
    await expect(geolocation.getCurrentPosition()).rejects.toThrow(/Permission denied/);
  });

  it('persiste dernière position dans localStorage', async () => {
    installMockGeolocation({
      getCurrentPosition: (success) => success(makePosition(48.8, 2.35)),
    });
    await geolocation.getCurrentPosition();
    const last = geolocation.getLastKnownPosition();
    expect(last).not.toBeNull();
    expect(last!.latitude).toBe(48.8);
  });

  it('append history après getCurrentPosition', async () => {
    installMockGeolocation({
      getCurrentPosition: (success) => success(makePosition(40.0, 3.0)),
    });
    await geolocation.getCurrentPosition();
    const hist = geolocation.getHistory();
    expect(hist.length).toBeGreaterThanOrEqual(1);
    expect(hist[hist.length - 1]?.latitude).toBe(40.0);
  });
});

describe('geolocation — watchPosition / clearWatch', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('appelle callback à chaque update', () => {
    const cb = vi.fn();
    installMockGeolocation({
      watchPosition: (success) => {
        success(makePosition(10, 20));
        return 42;
      },
    });
    const id = geolocation.watchPosition(cb);
    expect(id).toBe(42);
    expect(cb).toHaveBeenCalledOnce();
    expect(cb.mock.calls[0]?.[0].latitude).toBe(10);
  });

  it('retourne -1 si geolocation API absente', () => {
    Object.defineProperty(navigator, 'geolocation', { value: undefined, configurable: true });
    const id = geolocation.watchPosition(() => undefined);
    expect(id).toBe(-1);
  });

  it('clearWatch ne crash pas avec id négatif', () => {
    installMockGeolocation({});
    expect(() => geolocation.clearWatch(-1)).not.toThrow();
  });

  it('clearWatch appelle navigator.geolocation.clearWatch', () => {
    const clearSpy = vi.fn();
    installMockGeolocation({ clearWatch: clearSpy });
    geolocation.clearWatch(7);
    expect(clearSpy).toHaveBeenCalledWith(7);
  });
});

describe('geolocation — distance + bearing math', () => {
  it('distance Monaco → Nice ≈ 13.3 km', () => {
    const monaco = { lat: 43.7384, lng: 7.4246 };
    const nice = { lat: 43.7102, lng: 7.262 };
    const km = geolocation.distanceBetween(monaco, nice);
    expect(km).toBeGreaterThan(12);
    expect(km).toBeLessThan(15);
  });

  it('distance même point = 0', () => {
    const km = geolocation.distanceBetween({ lat: 43.7, lng: 7.4 }, { lat: 43.7, lng: 7.4 });
    expect(km).toBe(0);
  });

  it('distance Paris → New York ≈ 5837 km', () => {
    const paris = { lat: 48.8566, lng: 2.3522 };
    const nyc = { lat: 40.7128, lng: -74.006 };
    const km = geolocation.distanceBetween(paris, nyc);
    expect(km).toBeGreaterThan(5800);
    expect(km).toBeLessThan(5900);
  });

  it('bearing nord ≈ 0° (ou ≈ 360°)', () => {
    const b = geolocation.bearingBetween({ lat: 43.5, lng: 7.0 }, { lat: 44.0, lng: 7.0 });
    /* Acceptable : très proche de 0 ou de 360 */
    expect(b < 5 || b > 355).toBe(true);
  });

  it('bearing est ≈ 90°', () => {
    const b = geolocation.bearingBetween({ lat: 43.5, lng: 7.0 }, { lat: 43.5, lng: 7.5 });
    expect(b).toBeGreaterThan(85);
    expect(b).toBeLessThan(95);
  });

  it('bearing sud ≈ 180°', () => {
    const b = geolocation.bearingBetween({ lat: 44.0, lng: 7.0 }, { lat: 43.0, lng: 7.0 });
    expect(b).toBeGreaterThan(175);
    expect(b).toBeLessThan(185);
  });
});

describe('geolocation — reverseGeocode (mock fetch)', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('parse Nominatim response complète', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          address: {
            country: 'Monaco',
            country_code: 'mc',
            city: 'Monaco-Ville',
            postcode: '98000',
            road: 'Place du Palais',
            house_number: '1',
            state: 'Monaco',
          },
          display_name: '1 Place du Palais, Monaco',
        }),
    } as Response);
    const addr = await geolocation.reverseGeocode(43.7314, 7.42);
    expect(addr.country).toBe('Monaco');
    expect(addr.countryCode).toBe('MC');
    expect(addr.city).toBe('Monaco-Ville');
    expect(addr.postalCode).toBe('98000');
    expect(addr.street).toBe('Place du Palais');
    expect(addr.houseNumber).toBe('1');
    expect(fetchSpy).toHaveBeenCalled();
  });

  it('fallback village si pas city', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ address: { village: 'Eze', country: 'France', country_code: 'fr' } }),
    } as Response);
    const addr = await geolocation.reverseGeocode(43.72, 7.36);
    expect(addr.city).toBe('Eze');
  });

  it('throw si HTTP non-OK', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({ ok: false, status: 500 } as Response);
    await expect(geolocation.reverseGeocode(0, 0)).rejects.toThrow(/HTTP 500/);
  });
});

describe('geolocation — geocode (forward)', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('parse multiple results', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve([
          { lat: '48.8566', lon: '2.3522', display_name: 'Paris, France', type: 'city' },
          { lat: '33.6938', lon: '-118.0', display_name: 'Paris, Texas, USA', type: 'city' },
        ]),
    } as Response);
    const results = await geolocation.geocode('Paris');
    expect(results).toHaveLength(2);
    expect(results[0]?.lat).toBeCloseTo(48.8566);
    expect(results[0]?.lng).toBeCloseTo(2.3522);
    expect(results[0]?.type).toBe('city');
  });

  it('retourne tableau vide si Nominatim retourne []', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    } as Response);
    const results = await geolocation.geocode('AAAA-Inexistant');
    expect(results).toEqual([]);
  });
});

describe('geolocation — favoriteLocations persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('saveFavoriteLocation persiste + retourne id', () => {
    const fav = geolocation.saveFavoriteLocation({ name: 'Casino', lat: 43.7, lng: 7.4, type: 'work' });
    expect(fav.id).toMatch(/^fav_/);
    expect(fav.name).toBe('Casino');
    const list = geolocation.getFavoriteLocations();
    expect(list).toHaveLength(1);
    expect(list[0]?.type).toBe('work');
  });

  it('removeFavoriteLocation retire entrée', () => {
    const fav = geolocation.saveFavoriteLocation({ name: 'Maison', lat: 43.7, lng: 7.4 });
    expect(geolocation.removeFavoriteLocation(fav.id)).toBe(true);
    expect(geolocation.getFavoriteLocations()).toHaveLength(0);
  });

  it('removeFavoriteLocation retourne false si id inconnu', () => {
    expect(geolocation.removeFavoriteLocation('nope')).toBe(false);
  });

  it('default type = "other" si non spécifié', () => {
    const fav = geolocation.saveFavoriteLocation({ name: 'X', lat: 1, lng: 2 });
    expect(fav.type).toBe('other');
  });
});

describe('geolocation — geofences', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('watchGeofence persiste + retourne id', () => {
    const id = geolocation.watchGeofence({ name: 'Casino', lat: 43.7, lng: 7.4, radius: 100 });
    expect(id).toMatch(/^gf_/);
    const fences = geolocation.getGeofences();
    expect(fences).toHaveLength(1);
    expect(fences[0]?.name).toBe('Casino');
    expect(fences[0]?.radius).toBe(100);
  });

  it('checkGeofences trigger onEnter quand position dans le rayon', () => {
    const onEnter = vi.fn();
    geolocation.watchGeofence({ name: 'TestZone', lat: 43.7, lng: 7.4, radius: 1000, onEnter });
    /* Position dans rayon 1km */
    geolocation.checkGeofences({ latitude: 43.701, longitude: 7.401 });
    expect(onEnter).toHaveBeenCalled();
  });

  it('checkGeofences trigger onExit après onEnter quand sort', () => {
    const onEnter = vi.fn();
    const onExit = vi.fn();
    geolocation.watchGeofence({ name: 'Z', lat: 43.7, lng: 7.4, radius: 100, onEnter, onExit });
    /* In */
    geolocation.checkGeofences({ latitude: 43.7, longitude: 7.4 });
    /* Out (50km away) */
    geolocation.checkGeofences({ latitude: 44.2, longitude: 7.4 });
    expect(onEnter).toHaveBeenCalledTimes(1);
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('removeGeofence supprime + clear callbacks', () => {
    const id = geolocation.watchGeofence({ name: 'X', lat: 1, lng: 2, radius: 50 });
    expect(geolocation.removeGeofence(id)).toBe(true);
    expect(geolocation.getGeofences()).toHaveLength(0);
  });

  it('checkGeofences no-op si pas de fences', () => {
    expect(() => geolocation.checkGeofences({ latitude: 0, longitude: 0 })).not.toThrow();
  });
});

describe('geolocation — getLocalWeather (mock fetch)', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('parse Open-Meteo response 7j', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          current: {
            temperature_2m: 22,
            apparent_temperature: 21,
            relative_humidity_2m: 65,
            wind_speed_10m: 12,
            weather_code: 1,
          },
          daily: {
            time: ['2026-05-07', '2026-05-08', '2026-05-09', '2026-05-10', '2026-05-11', '2026-05-12', '2026-05-13'],
            weather_code: [0, 1, 2, 3, 61, 80, 95],
            temperature_2m_max: [25, 26, 24, 23, 20, 22, 28],
            temperature_2m_min: [15, 16, 14, 13, 12, 14, 18],
            precipitation_sum: [0, 0, 0.5, 1, 5, 3, 8],
          },
        }),
    } as Response);
    const w = await geolocation.getLocalWeather(43.7, 7.4);
    expect(w.temp).toBe(22);
    expect(w.condition).toBe('Principalement clair');
    expect(w.humidity).toBe(65);
    expect(w.forecast7d).toHaveLength(7);
    expect(w.forecast7d[0]?.condition).toBe('Ciel clair');
    expect(w.forecast7d[6]?.condition).toContain('Orage');
  });

  it('throw si Open-Meteo retourne malformed', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    } as Response);
    await expect(geolocation.getLocalWeather(43.7, 7.4)).rejects.toThrow(/malformed/);
  });

  it('throw si HTTP fail', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({ ok: false, status: 503 } as Response);
    await expect(geolocation.getLocalWeather(43.7, 7.4)).rejects.toThrow(/HTTP 503/);
  });
});

describe('geolocation — getLocalTime', () => {
  it('retourne timezone offset basé longitude', () => {
    const t = geolocation.getLocalTime(43.7, 7.4);
    expect(t.timezone).toMatch(/^UTC[+-]?\d+$/);
    expect(typeof t.offset).toBe('number');
    expect(t.time).toMatch(/^\d{2}:\d{2}$/);
  });

  it('Tokyo (lng 139) ≈ UTC+9', () => {
    const t = geolocation.getLocalTime(35, 139);
    expect(t.offset).toBe(9);
  });

  it('Los Angeles (lng -118) ≈ UTC-8', () => {
    const t = geolocation.getLocalTime(34, -118);
    expect(t.offset).toBe(-8);
  });
});

describe('geolocation — getCountryFromIP fallback chain', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('parse Cloudflare cdn-cgi/trace response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve('fl=12abcd\nh=cloudflare.com\nip=1.2.3.4\nloc=MC\nuag=Mozilla\n'),
    } as Response);
    const info = await geolocation.getCountryFromIP();
    expect(info.countryCode).toBe('MC');
    expect(info.ip).toBe('1.2.3.4');
  });

  it('fallback ipapi si Cloudflare fail', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('CF blocked'))
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            country_name: 'France',
            country_code: 'FR',
            city: 'Paris',
            region: 'Île-de-France',
            ip: '5.6.7.8',
          }),
      } as Response);
    const info = await geolocation.getCountryFromIP();
    expect(info.country).toBe('France');
    expect(info.countryCode).toBe('FR');
    expect(info.city).toBe('Paris');
  });

  it('fallback Monaco si tout échoue', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('CF down'))
      .mockRejectedValueOnce(new Error('ipapi down'));
    const info = await geolocation.getCountryFromIP();
    expect(info.countryCode).toBe('MC');
  });
});

describe('geolocation — checkPermission', () => {
  it('retourne prompt si Permissions API absente', async () => {
    Object.defineProperty(navigator, 'permissions', { value: undefined, configurable: true });
    const state = await geolocation.checkPermission();
    expect(state).toBe('prompt');
  });

  it('retourne state Permissions API quand dispo', async () => {
    Object.defineProperty(navigator, 'permissions', {
      value: {
        query: () => Promise.resolve({ state: 'granted' }),
      },
      configurable: true,
    });
    const state = await geolocation.checkPermission();
    expect(state).toBe('granted');
  });

  it('retourne prompt si query throw', async () => {
    Object.defineProperty(navigator, 'permissions', {
      value: {
        query: () => Promise.reject(new Error('fail')),
      },
      configurable: true,
    });
    const state = await geolocation.checkPermission();
    expect(state).toBe('prompt');
  });
});

describe('geolocation — history management', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('clearHistory vide localStorage', () => {
    /* Seed manually */
    localStorage.setItem('apex_v13_geo_history', JSON.stringify([{ latitude: 1, longitude: 2 }]));
    geolocation.clearHistory();
    expect(geolocation.getHistory()).toEqual([]);
  });

  it('getHistory retourne [] si JSON corrompu', () => {
    localStorage.setItem('apex_v13_geo_history', '{not json');
    expect(geolocation.getHistory()).toEqual([]);
  });

  it('getLastKnownPosition retourne null si rien stocké', () => {
    expect(geolocation.getLastKnownPosition()).toBeNull();
  });
});
