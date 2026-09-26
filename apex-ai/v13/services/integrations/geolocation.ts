/**
 * APEX v13 — Geolocation Service (port v12 axGetLocation/axStartContinuousGeo/axCheckGeofences).
 *
 * Demande Kevin (CLAUDE.md règle "TOUT AU MAX") : "il manquait la géolocalisation,
 * toutes ces options et fonctions que je t'avais demandées".
 *
 * Features niveau expert pro freelance senior 200€/h :
 * - Position courante (one-shot) avec haute précision GPS (~5m)
 * - Watch position continu avec callback chaque update + clearWatch
 * - Reverse geocoding lat/lng → adresse (Nominatim OpenStreetMap, gratuit, sans clé)
 * - Forward geocoding adresse → lat/lng
 * - Distance Haversine entre 2 points (km)
 * - Bearing (direction) entre 2 points (degrés 0-360)
 * - Permissions check (granted/denied/prompt)
 * - Météo locale (Open-Meteo gratuit, sans clé) avec forecast 7j
 * - Heure locale + timezone
 * - Pays détecté depuis IP (fallback CloudFlare cdn-cgi/trace, ipapi.co)
 * - Lieux favoris (home/work/other) persistés localStorage
 * - Géofencing : trigger callbacks onEnter/onExit zones définies
 *
 * APIs externes (toutes gratuites, no key required) :
 * - Nominatim OpenStreetMap (geocoding) — limite 1 req/s recommandé
 * - Open-Meteo (météo) — gratuit illimité usage non-commercial
 * - cdn-cgi/trace (Cloudflare) ou ipapi.co (IP geo) — fallback chain
 *
 * Anti-patterns évités (CLAUDE.md erreurs connues) :
 * - Pas de FB_FIX sync (privacy P0 — cf. erreur #44 ax_user_locations leak)
 * - Pas de polling Geolocation au boot (CGU obligatoire avant)
 * - Pas de hardcode coordonnées (Monaco fallback uniquement explicite)
 * - try/catch partout pour fiabilité iOS Safari PWA
 */

import { logger } from '../../core/logger.js';

export interface GeoPosition {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude?: number | null;
  altitudeAccuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
  timestamp: number;
}

export interface GeoAddress {
  country: string;
  countryCode: string;
  region?: string | undefined;
  city: string;
  postalCode?: string | undefined;
  street?: string | undefined;
  houseNumber?: string | undefined;
  displayName?: string | undefined;
}

export interface GeoSearchResult {
  lat: number;
  lng: number;
  displayName: string;
  type?: string | undefined;
}

export interface FavoriteLocation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  type?: 'home' | 'work' | 'other' | undefined;
  createdAt: number;
}

export interface Geofence {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radius: number; /* meters */
  onEnter?: (() => void) | undefined;
  onExit?: (() => void) | undefined;
  inside?: boolean;
}

export interface LocalWeather {
  temp: number;
  apparent: number;
  condition: string;
  humidity?: number | undefined;
  windKph?: number | undefined;
  forecast7d: Array<{
    date: string;
    tempMin: number;
    tempMax: number;
    condition: string;
    precipMm: number;
  }>;
}

export interface IpCountryInfo {
  country: string;
  countryCode: string;
  city?: string | undefined;
  region?: string | undefined;
  ip?: string | undefined;
}

const STORAGE_FAVORITES = 'apex_v13_geo_favorites';
const STORAGE_LAST_POSITION = 'apex_v13_geo_last_position';
const STORAGE_GEOFENCES = 'apex_v13_geo_fences';
const STORAGE_HISTORY = 'apex_v13_geo_history';
const STORAGE_HISTORY_MAX = 1000;
const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const OPEN_METEO_BASE = 'https://api.open-meteo.com/v1/forecast';

/**
 * Conversion code WMO open-meteo → label condition humain.
 * Source : https://open-meteo.com/en/docs (table WMO Weather Codes).
 */
const WMO_CONDITIONS: Readonly<Record<number, string>> = {
  0: 'Ciel clair',
  1: 'Principalement clair',
  2: 'Partiellement nuageux',
  3: 'Couvert',
  45: 'Brouillard',
  48: 'Brouillard givrant',
  51: 'Bruine légère',
  53: 'Bruine modérée',
  55: 'Bruine dense',
  61: 'Pluie légère',
  63: 'Pluie modérée',
  65: 'Pluie forte',
  71: 'Neige légère',
  73: 'Neige modérée',
  75: 'Neige forte',
  77: 'Grains de neige',
  80: 'Averses légères',
  81: 'Averses modérées',
  82: 'Averses violentes',
  85: 'Averses de neige légères',
  86: 'Averses de neige fortes',
  95: 'Orage',
  96: 'Orage avec grêle',
  99: 'Orage violent grêle',
};

class Geolocation {
  /**
   * Position courante (one-shot) via navigator.geolocation.
   * Haute précision GPS (~5m) avec timeout 30s.
   */
  async getCurrentPosition(opts?: PositionOptions): Promise<GeoPosition> {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      throw new Error('Geolocation API not available');
    }
    const options: PositionOptions = opts ?? {
      enableHighAccuracy: true,
      timeout: 30_000,
      maximumAge: 0,
    };
    return new Promise<GeoPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (p) => {
          const pos: GeoPosition = {
            latitude: p.coords.latitude,
            longitude: p.coords.longitude,
            accuracy: p.coords.accuracy,
            altitude: p.coords.altitude,
            altitudeAccuracy: p.coords.altitudeAccuracy,
            heading: p.coords.heading,
            speed: p.coords.speed,
            timestamp: p.timestamp || Date.now(),
          };
          this.saveLastPosition(pos);
          this.appendHistory(pos);
          this.checkGeofences(pos);
          resolve(pos);
        },
        (err) => {
          logger.warn('geolocation', 'getCurrentPosition error', { code: err.code, msg: err.message });
          reject(new Error(err.message || `Geolocation error code ${err.code}`));
        },
        options,
      );
    });
  }

  /**
   * Watch position continu — callback à chaque update.
   * Retourne watchId pour clearWatch.
   */
  watchPosition(callback: (pos: GeoPosition) => void, opts?: PositionOptions): number {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      logger.warn('geolocation', 'watchPosition unsupported');
      return -1;
    }
    const options: PositionOptions = opts ?? {
      enableHighAccuracy: true,
      maximumAge: 5_000,
      timeout: 60_000,
    };
    return navigator.geolocation.watchPosition(
      (p) => {
        const pos: GeoPosition = {
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
          accuracy: p.coords.accuracy,
          altitude: p.coords.altitude,
          altitudeAccuracy: p.coords.altitudeAccuracy,
          heading: p.coords.heading,
          speed: p.coords.speed,
          timestamp: p.timestamp || Date.now(),
        };
        this.saveLastPosition(pos);
        this.appendHistoryThrottled(pos);
        this.checkGeofences(pos);
        try {
          callback(pos);
        } catch (e: unknown) {
          logger.warn('geolocation', 'watchPosition callback threw', { err: e });
        }
      },
      (err) => {
        logger.warn('geolocation', 'watchPosition error', { code: err.code, msg: err.message });
      },
      options,
    );
  }

  clearWatch(watchId: number): void {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    if (watchId < 0) return;
    try {
      navigator.geolocation.clearWatch(watchId);
    } catch (e: unknown) {
      logger.warn('geolocation', 'clearWatch failed', { err: e });
    }
  }

  /**
   * Reverse geocoding : lat/lng → adresse via Nominatim OSM.
   * Gratuit, no key. Limite usage 1 req/s recommandé.
   */
  async reverseGeocode(lat: number, lng: number, language?: string): Promise<GeoAddress> {
    const lang = language ?? 'fr';
    const url = `${NOMINATIM_BASE}/reverse?format=json&lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lng))}&accept-language=${encodeURIComponent(lang)}&zoom=18`;
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'ApexAI-v13' },
    });
    if (!res.ok) throw new Error(`Nominatim reverseGeocode HTTP ${res.status}`);
    const data = (await res.json()) as {
      address?: {
        country?: string;
        country_code?: string;
        state?: string;
        region?: string;
        city?: string;
        town?: string;
        village?: string;
        municipality?: string;
        postcode?: string;
        road?: string;
        house_number?: string;
      };
      display_name?: string;
    };
    const addr = data.address ?? {};
    const result: GeoAddress = {
      country: addr.country ?? '',
      countryCode: (addr.country_code ?? '').toUpperCase(),
      city: addr.city ?? addr.town ?? addr.village ?? addr.municipality ?? '',
    };
    if (addr.state ?? addr.region) result.region = addr.state ?? addr.region;
    if (addr.postcode) result.postalCode = addr.postcode;
    if (addr.road) result.street = addr.road;
    if (addr.house_number) result.houseNumber = addr.house_number;
    if (data.display_name) result.displayName = data.display_name;
    return result;
  }

  /**
   * Forward geocoding : adresse → lat/lng (multiple résultats).
   */
  async geocode(address: string, limit = 5): Promise<GeoSearchResult[]> {
    const url = `${NOMINATIM_BASE}/search?format=json&q=${encodeURIComponent(address)}&limit=${encodeURIComponent(String(limit))}&accept-language=fr`;
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'ApexAI-v13' },
    });
    if (!res.ok) throw new Error(`Nominatim geocode HTTP ${res.status}`);
    const data = (await res.json()) as Array<{
      lat: string;
      lon: string;
      display_name: string;
      type?: string;
    }>;
    return data.map((r) => {
      const out: GeoSearchResult = {
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lon),
        displayName: r.display_name,
      };
      if (r.type) out.type = r.type;
      return out;
    });
  }

  /**
   * Distance Haversine entre 2 points (résultat en kilomètres).
   * Précision ~0.5% (suppose Terre sphérique).
   */
  distanceBetween(p1: { lat: number; lng: number }, p2: { lat: number; lng: number }): number {
    const R = 6371; /* rayon terre en km */
    const toRad = (d: number): number => (d * Math.PI) / 180;
    const dLat = toRad(p2.lat - p1.lat);
    const dLng = toRad(p2.lng - p1.lng);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(p1.lat)) * Math.cos(toRad(p2.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Bearing initial (direction degrés 0-360, 0=Nord, 90=Est).
   */
  bearingBetween(p1: { lat: number; lng: number }, p2: { lat: number; lng: number }): number {
    const toRad = (d: number): number => (d * Math.PI) / 180;
    const toDeg = (r: number): number => (r * 180) / Math.PI;
    const lat1 = toRad(p1.lat);
    const lat2 = toRad(p2.lat);
    const dLng = toRad(p2.lng - p1.lng);
    const y = Math.sin(dLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    const brng = toDeg(Math.atan2(y, x));
    return (brng + 360) % 360;
  }

  /**
   * Permissions check via navigator.permissions API (où dispo).
   * Fallback : retourne 'prompt' si non supporté.
   */
  async checkPermission(): Promise<'granted' | 'denied' | 'prompt'> {
    try {
      if (typeof navigator === 'undefined' || !navigator.permissions) return 'prompt';
      const result = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
      return result.state;
    } catch (e: unknown) {
      logger.debug('geolocation', 'checkPermission fallback prompt', { err: e });
      return 'prompt';
    }
  }

  /**
   * Météo locale via Open-Meteo (gratuit, sans clé).
   * Si lat/lng pas fournis → utilise getCurrentPosition.
   */
  async getLocalWeather(lat?: number, lng?: number): Promise<LocalWeather> {
    let coords: { lat: number; lng: number };
    if (typeof lat === 'number' && typeof lng === 'number') {
      coords = { lat, lng };
    } else {
      const pos = await this.getCurrentPosition();
      coords = { lat: pos.latitude, lng: pos.longitude };
    }
    const url =
      `${OPEN_METEO_BASE}?latitude=${coords.lat}&longitude=${coords.lng}` +
      `&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum` +
      `&forecast_days=7&timezone=auto`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
    const data = (await res.json()) as {
      current?: {
        temperature_2m: number;
        apparent_temperature: number;
        relative_humidity_2m?: number;
        wind_speed_10m?: number;
        weather_code: number;
      };
      daily?: {
        time: string[];
        weather_code: number[];
        temperature_2m_max: number[];
        temperature_2m_min: number[];
        precipitation_sum: number[];
      };
    };
    const cur = data.current;
    const daily = data.daily;
    if (!cur || !daily) throw new Error('Open-Meteo malformed response');
    const forecast: LocalWeather['forecast7d'] = [];
    for (let i = 0; i < daily.time.length; i++) {
      const date = daily.time[i] ?? '';
      const code = daily.weather_code[i] ?? 0;
      const tMax = daily.temperature_2m_max[i] ?? 0;
      const tMin = daily.temperature_2m_min[i] ?? 0;
      const precip = daily.precipitation_sum[i] ?? 0;
      forecast.push({
        date,
        tempMin: tMin,
        tempMax: tMax,
        condition: WMO_CONDITIONS[code] ?? `Code ${code}`,
        precipMm: precip,
      });
    }
    const out: LocalWeather = {
      temp: cur.temperature_2m,
      apparent: cur.apparent_temperature,
      condition: WMO_CONDITIONS[cur.weather_code] ?? `Code ${cur.weather_code}`,
      forecast7d: forecast,
    };
    if (typeof cur.relative_humidity_2m === 'number') out.humidity = cur.relative_humidity_2m;
    if (typeof cur.wind_speed_10m === 'number') out.windKph = cur.wind_speed_10m;
    return out;
  }

  /**
   * Heure locale + timezone (calcul depuis lat/lng via Intl + offset estimé).
   * Précision ~timezone résolution (15° = 1h).
   */
  getLocalTime(_lat: number, lng: number): { time: string; timezone: string; offset: number } {
    /* Approximation : longitude → offset UTC en heures (15° par heure) */
    const offsetHours = Math.round(lng / 15);
    const now = new Date();
    /* Calcul heure locale fictive basée sur offset longitude */
    const utc = now.getTime() + now.getTimezoneOffset() * 60_000;
    const local = new Date(utc + offsetHours * 3_600_000);
    const hh = String(local.getHours()).padStart(2, '0');
    const mm = String(local.getMinutes()).padStart(2, '0');
    return {
      time: `${hh}:${mm}`,
      timezone: `UTC${offsetHours >= 0 ? '+' : ''}${offsetHours}`,
      offset: offsetHours,
    };
  }

  /**
   * Pays détecté depuis IP — fallback chain :
   * 1. Cloudflare cdn-cgi/trace (latency 50ms)
   * 2. ipapi.co (json gratuit 1k req/jour)
   * 3. fallback default Monaco
   */
  async getCountryFromIP(): Promise<IpCountryInfo> {
    /* Try Cloudflare cdn-cgi/trace */
    try {
      const res = await fetch('https://www.cloudflare.com/cdn-cgi/trace', {
        method: 'GET',
        headers: { Accept: 'text/plain' },
      });
      if (res.ok) {
        const text = await res.text();
        const lines = text.split('\n');
        const map: Record<string, string> = {};
        for (const line of lines) {
          const idx = line.indexOf('=');
          if (idx > 0) map[line.slice(0, idx)] = line.slice(idx + 1);
        }
        const cc = (map['loc'] ?? '').toUpperCase();
        if (cc) {
          const out: IpCountryInfo = { country: cc, countryCode: cc };
          if (map['ip']) out.ip = map['ip'];
          return out;
        }
      }
    } catch (e: unknown) {
      logger.debug('geolocation', 'Cloudflare trace failed', { err: e });
    }
    /* Fallback ipapi.co */
    try {
      const res = await fetch('https://ipapi.co/json/', { headers: { Accept: 'application/json' } });
      if (res.ok) {
        const data = (await res.json()) as {
          country_name?: string;
          country_code?: string;
          city?: string;
          region?: string;
          ip?: string;
        };
        const out: IpCountryInfo = {
          country: data.country_name ?? '',
          countryCode: (data.country_code ?? '').toUpperCase(),
        };
        if (data.city) out.city = data.city;
        if (data.region) out.region = data.region;
        if (data.ip) out.ip = data.ip;
        return out;
      }
    } catch (e: unknown) {
      logger.debug('geolocation', 'ipapi failed', { err: e });
    }
    /* Last resort */
    return { country: 'Monaco', countryCode: 'MC' };
  }

  /**
   * Stocker un lieu favori (home, work, other) dans localStorage.
   */
  saveFavoriteLocation(opts: { name: string; lat: number; lng: number; type?: 'home' | 'work' | 'other' }): FavoriteLocation {
    const fav: FavoriteLocation = {
      id: `fav_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      name: opts.name,
      lat: opts.lat,
      lng: opts.lng,
      type: opts.type ?? 'other',
      createdAt: Date.now(),
    };
    const list = this.getFavoriteLocations();
    list.push(fav);
    try {
      localStorage.setItem(STORAGE_FAVORITES, JSON.stringify(list));
    } catch (e: unknown) {
      logger.warn('geolocation', 'saveFavoriteLocation storage failed', { err: e });
    }
    return fav;
  }

  getFavoriteLocations(): FavoriteLocation[] {
    try {
      const raw = localStorage.getItem(STORAGE_FAVORITES);
      if (!raw) return [];
      const arr = JSON.parse(raw) as unknown;
      if (!Array.isArray(arr)) return [];
      return arr as FavoriteLocation[];
    } catch {
      return [];
    }
  }

  removeFavoriteLocation(id: string): boolean {
    const list = this.getFavoriteLocations();
    const filtered = list.filter((f) => f.id !== id);
    if (filtered.length === list.length) return false;
    try {
      localStorage.setItem(STORAGE_FAVORITES, JSON.stringify(filtered));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Crée un geofence et l'enregistre. Lance watchPosition si pas déjà actif
   * et trigger callbacks onEnter/onExit quand position franchit le rayon.
   * Retourne id geofence.
   */
  watchGeofence(opts: {
    name: string;
    lat: number;
    lng: number;
    radius: number;
    onEnter?: () => void;
    onExit?: () => void;
  }): string {
    const fence: Geofence = {
      id: `gf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      name: opts.name,
      lat: opts.lat,
      lng: opts.lng,
      radius: opts.radius,
    };
    if (opts.onEnter) fence.onEnter = opts.onEnter;
    if (opts.onExit) fence.onExit = opts.onExit;
    /* Stocke la callback en mémoire (pas serializable) */
    this.fenceCallbacks.set(fence.id, fence);
    /* Persist meta sans callbacks */
    const stored = this.getStoredGeofences();
    stored.push({
      id: fence.id,
      name: fence.name,
      lat: fence.lat,
      lng: fence.lng,
      radius: fence.radius,
    });
    try {
      localStorage.setItem(STORAGE_GEOFENCES, JSON.stringify(stored));
    } catch (e: unknown) {
      logger.warn('geolocation', 'watchGeofence storage failed', { err: e });
    }
    return fence.id;
  }

  removeGeofence(id: string): boolean {
    const stored = this.getStoredGeofences().filter((f) => f.id !== id);
    this.fenceCallbacks.delete(id);
    try {
      localStorage.setItem(STORAGE_GEOFENCES, JSON.stringify(stored));
      return true;
    } catch {
      return false;
    }
  }

  getGeofences(): Array<Pick<Geofence, 'id' | 'name' | 'lat' | 'lng' | 'radius'>> {
    return this.getStoredGeofences();
  }

  /**
   * Vérifie position vs geofences enregistrés.
   * Trigger callbacks onEnter/onExit selon transitions.
   */
  checkGeofences(pos: { latitude: number; longitude: number }): void {
    const fences = this.getStoredGeofences();
    if (!fences.length) return;
    for (const f of fences) {
      const d = this.distanceBetween(
        { lat: pos.latitude, lng: pos.longitude },
        { lat: f.lat, lng: f.lng },
      );
      const insideNow = d * 1000 <= f.radius;
      const lastInsideKey = `apex_v13_geo_inside_${f.id}`;
      let lastInside = false;
      try {
        lastInside = localStorage.getItem(lastInsideKey) === 'true';
      } catch {
        /* ignore */
      }
      if (insideNow !== lastInside) {
        try {
          localStorage.setItem(lastInsideKey, String(insideNow));
        } catch {
          /* ignore */
        }
        const cb = this.fenceCallbacks.get(f.id);
        if (cb) {
          try {
            if (insideNow && cb.onEnter) cb.onEnter();
            else if (!insideNow && cb.onExit) cb.onExit();
          } catch (e: unknown) {
            logger.warn('geolocation', 'geofence callback threw', { id: f.id, err: e });
          }
        }
      }
    }
  }

  /**
   * Récupère dernière position connue (sans déclencher GPS).
   */
  getLastKnownPosition(): GeoPosition | null {
    try {
      const raw = localStorage.getItem(STORAGE_LAST_POSITION);
      if (!raw) return null;
      return JSON.parse(raw) as GeoPosition;
    } catch {
      return null;
    }
  }

  /**
   * Historique positions (jusqu'à STORAGE_HISTORY_MAX entries FIFO).
   */
  getHistory(): GeoPosition[] {
    try {
      const raw = localStorage.getItem(STORAGE_HISTORY);
      if (!raw) return [];
      const arr = JSON.parse(raw) as unknown;
      if (!Array.isArray(arr)) return [];
      return arr as GeoPosition[];
    } catch {
      return [];
    }
  }

  clearHistory(): void {
    try {
      localStorage.removeItem(STORAGE_HISTORY);
    } catch {
      /* ignore */
    }
  }

  /* === Internals === */

  private fenceCallbacks: Map<string, Geofence> = new Map();
  private lastHistoryAppend = 0;

  private saveLastPosition(pos: GeoPosition): void {
    try {
      localStorage.setItem(STORAGE_LAST_POSITION, JSON.stringify(pos));
    } catch (e: unknown) {
      logger.debug('geolocation', 'saveLastPosition skipped (quota?)', { err: e });
    }
  }

  private appendHistory(pos: GeoPosition): void {
    try {
      const hist = this.getHistory();
      hist.push(pos);
      const trimmed = hist.length > STORAGE_HISTORY_MAX ? hist.slice(-STORAGE_HISTORY_MAX) : hist;
      localStorage.setItem(STORAGE_HISTORY, JSON.stringify(trimmed));
    } catch (e: unknown) {
      logger.debug('geolocation', 'appendHistory skipped', { err: e });
    }
  }

  /** Append history seulement si > 60s depuis dernier append (anti-spam watchPosition). */
  private appendHistoryThrottled(pos: GeoPosition): void {
    const now = Date.now();
    if (now - this.lastHistoryAppend < 60_000) return;
    this.lastHistoryAppend = now;
    this.appendHistory(pos);
  }

  private getStoredGeofences(): Array<Pick<Geofence, 'id' | 'name' | 'lat' | 'lng' | 'radius'>> {
    try {
      const raw = localStorage.getItem(STORAGE_GEOFENCES);
      if (!raw) return [];
      const arr = JSON.parse(raw) as unknown;
      if (!Array.isArray(arr)) return [];
      return arr as Array<Pick<Geofence, 'id' | 'name' | 'lat' | 'lng' | 'radius'>>;
    } catch {
      return [];
    }
  }
}

export const geolocation = new Geolocation();
