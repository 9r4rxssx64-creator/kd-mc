/**
 * APEX v13 — Studio Géo (géocodage + distances + lieux remarquables).
 *
 * Studio expert pour le voyageur ou pro qui veut localiser, mesurer, naviguer.
 *
 * Features Kevin :
 *  - Géocodage adresse → lat/lon (via Nominatim OpenStreetMap, gratuit, attribution OSM)
 *  - Distance haversine entre 2 points (km + miles)
 *  - Distance vers Monaco (point de référence Kevin)
 *  - Conversion DMS / DD (degrés minutes secondes / décimal)
 *  - Lieux remarquables Monaco (8 POI préchargés)
 *  - Open in Apple Maps / Google Maps
 *
 * Anti-patterns évités : escapeHtml, fetch timeout 8s, fallback offline si réseau KO.
 */

import { escapeHtml } from '../../../core/escape-html.js';
export { escapeHtml }; /* re-export pour tests + parité historique */
import { createCleanupScope, type CleanupScope } from '../../../core/listener-cleanup.js';
import { logger } from '../../../core/logger.js';
import { store } from '../../../core/store.js';
import { guardFeatureEnabled } from '../../../services/auth/feature-guard.js';
import { haptic } from '../../../ui/haptic.js';
import { toast } from '../../../ui/toast.js';

let activeScope: CleanupScope | null = null;

export function dispose(): void {
  activeScope?.cleanup();
  activeScope = null;
}

export interface LatLon {
  lat: number;
  lon: number;
}

export interface POI extends LatLon {
  id: string;
  name: string;
  category: string;
  emoji: string;
  description: string;
}

/** Référence Kevin (Casino Monaco coordinates). */
export const MONACO_REF: LatLon = { lat: 43.7384, lon: 7.4246 };

export const POIS_MONACO: readonly POI[] = [
  { id: 'casino', name: 'Casino de Monte-Carlo', category: 'Casino', emoji: '🎰', description: 'Casino historique 1863', lat: 43.7396, lon: 7.4286 },
  { id: 'palais', name: 'Palais Princier', category: 'Monument', emoji: '🏰', description: 'Résidence des Grimaldi', lat: 43.7311, lon: 7.4197 },
  { id: 'oceano', name: 'Musée océanographique', category: 'Musée', emoji: '🐠', description: 'Fondé par Albert Ier', lat: 43.7301, lon: 7.4254 },
  { id: 'larvotto', name: 'Plage du Larvotto', category: 'Plage', emoji: '🏖', description: 'Plage publique aménagée', lat: 43.7466, lon: 7.4356 },
  { id: 'jardin', name: 'Jardin Exotique', category: 'Jardin', emoji: '🌵', description: 'Cactus et grotte', lat: 43.7298, lon: 7.4109 },
  { id: 'fontvieille', name: 'Port de Fontvieille', category: 'Port', emoji: '⛵', description: 'Marina et héliport', lat: 43.7305, lon: 7.4195 },
  { id: 'cathedrale', name: 'Cathédrale de Monaco', category: 'Monument', emoji: '⛪', description: 'Tombeau de Grace Kelly', lat: 43.7302, lon: 7.4234 },
  { id: 'gpx', name: 'Circuit Grand Prix F1', category: 'Sport', emoji: '🏎', description: 'Tracé urbain F1', lat: 43.7347, lon: 7.4197 },
] as const;

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const FETCH_TIMEOUT_MS = 8000;
const EARTH_RADIUS_KM = 6371;

/* ============================================================
   Pure helpers
   ============================================================ */

/**
 * Distance haversine entre 2 points (km).
 */
export function haversineKm(a: LatLon, b: LatLon): number {
  const toRad = (deg: number): number => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return Math.round(2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h)) * 100) / 100;
}

/**
 * Conversion DD (décimal) → DMS (degrés minutes secondes).
 */
export function ddToDms(deg: number, isLat: boolean): string {
  const abs = Math.abs(deg);
  const d = Math.floor(abs);
  const minF = (abs - d) * 60;
  const m = Math.floor(minF);
  const s = Math.round((minF - m) * 60 * 100) / 100;
  const dir = isLat ? (deg >= 0 ? 'N' : 'S') : (deg >= 0 ? 'E' : 'O');
  return `${d}°${m}'${s}"${dir}`;
}

/**
 * Validation lat/lon plausible.
 */
export function isValidLatLon(p: LatLon): boolean {
  return isFinite(p.lat) && isFinite(p.lon) &&
    p.lat >= -90 && p.lat <= 90 &&
    p.lon >= -180 && p.lon <= 180;
}

/**
 * Géocodage via Nominatim OSM (lazy, fetch avec timeout).
 */
export async function geocodeAddress(address: string): Promise<LatLon | null> {
  if (!address || address.trim().length < 3) return null;
  if (typeof fetch === 'undefined') return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const url = `${NOMINATIM_URL}?format=json&limit=1&q=${encodeURIComponent(address)}`;
    const resp = await fetch(url, { signal: controller.signal, headers: { 'Accept': 'application/json' } });
    if (!resp.ok) return null;
    const data = (await resp.json()) as Array<{ lat: string; lon: string }>;
    if (!Array.isArray(data) || data.length === 0) return null;
    const first = data[0];
    if (!first) return null;
    const result: LatLon = { lat: parseFloat(first.lat), lon: parseFloat(first.lon) };
    return isValidLatLon(result) ? result : null;
  } catch (err) {
    logger.warn('studios-geo', 'geocode failed', { err });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function appleMapsUrl(p: LatLon, label?: string): string {
  return `https://maps.apple.com/?ll=${p.lat},${p.lon}${label ? `&q=${encodeURIComponent(label)}` : ''}`;
}

export function googleMapsUrl(p: LatLon): string {
  return `https://www.google.com/maps?q=${p.lat},${p.lon}`;
}

/* ============================================================
   UI
   ============================================================ */

export function render(rootEl: HTMLElement): void {
  activeScope?.cleanup();
  activeScope = createCleanupScope('studios-geo');
  /* Wire admin feature toggle (Kevin règle 2026-05-04 — ON/OFF tout). */
  const uid = (store.get('user') as { id?: string } | null)?.id ?? 'anon';
  if (!guardFeatureEnabled('studio.geo', rootEl, uid)) return;

  const poisHtml = POIS_MONACO.map((p) => {
    const dist = haversineKm(MONACO_REF, p);
    return `
      <div style="background:rgba(255,255,255,0.03);border:1px solid #333;border-radius:8px;padding:10px">
        <div class="ax-gs-103">
          <span class="ax-gs-170">${p.emoji}</span>
          <div class="ax-gs-26">
            <div class="ax-gs-79">${escapeHtml(p.name)}</div>
            <div class="ax-gs-2">${escapeHtml(p.category)} · ${dist} km du centre</div>
          </div>
          <a href="${escapeHtml(appleMapsUrl(p, p.name))}" target="_blank" rel="noopener" style="color:#c9a227;text-decoration:none;font-size:18px" title="Apple Maps">🗺</a>
        </div>
      </div>
    `;
  }).join('');

  rootEl.innerHTML = `
    <div class="ax-page ax-gs-451">
      <header class="ax-gs-210">
        <h1 class="ax-gs-333">🗺 Studio Géo</h1>
        <span class="ax-gs-3">Géocodage + distances</span>
      </header>

      <div class="ax-gs-1">
        <h2 class="ax-gs-452">Adresse → coordonnées</h2>
        <input type="text" id="ax-geo-addr" aria-label="Adresse à géocoder" placeholder="ex : Place du Casino, Monaco" autocomplete="off" class="ax-gs-453">
        <button class="ax-btn ax-btn-primary ax-gs-454" id="ax-geo-go">Géocoder</button>
        <div id="ax-geo-out" style="margin-top:12px;color:#c9a227;font-size:13px"></div>
      </div>

      <div class="ax-gs-1">
        <h2 class="ax-gs-452">Lieux remarquables Monaco</h2>
        <div style="display:grid;grid-template-columns:1fr;gap:6px">${poisHtml}</div>
      </div>

      <p style="font-size:11px;color:#666;text-align:center;margin-top:12px">© OpenStreetMap contributors</p>
      <p class="ax-gs-212"><a href="#studios" class="ax-gs-198">← Retour studios</a></p>
    </div>
  `;
  attach(rootEl);
}

function attach(rootEl: HTMLElement): void {
  const btn = rootEl.querySelector<HTMLButtonElement>('#ax-geo-go');
  const input = rootEl.querySelector<HTMLInputElement>('#ax-geo-addr');
  const out = rootEl.querySelector<HTMLDivElement>('#ax-geo-out');
  if (!btn || !input || !out || !activeScope) return;

  activeScope.bind(btn, 'click', () => {
    const addr = input.value.trim();
    if (!addr) {
      out.textContent = 'Saisis une adresse.';
      return;
    }
    haptic.tap();
    out.textContent = '⏳ Recherche…';
    void geocodeAddress(addr).then((res) => {
      if (!res) {
        out.textContent = 'Adresse introuvable. Vérifie l\'orthographe ou ta connexion.';
        toast.warn('Géocodage KO');
        return;
      }
      const dist = haversineKm(MONACO_REF, res);
      out.innerHTML = `
        <div style="line-height:1.6">
          <strong>Coordonnées trouvées :</strong><br>
          DD : <code>${res.lat.toFixed(6)}, ${res.lon.toFixed(6)}</code><br>
          DMS : <code>${escapeHtml(ddToDms(res.lat, true))} · ${escapeHtml(ddToDms(res.lon, false))}</code><br>
          Distance Monaco : <strong>${dist} km</strong> (${(dist / 1.609).toFixed(1)} mi)<br>
          <a href="${escapeHtml(appleMapsUrl(res, addr))}" target="_blank" rel="noopener" style="color:#c9a227;margin-right:12px">🗺 Apple Maps</a>
          <a href="${escapeHtml(googleMapsUrl(res))}" target="_blank" rel="noopener" class="ax-gs-198">🗺 Google Maps</a>
        </div>
      `;
      haptic.success();
    });
  });

  logger.info('studios-geo', 'rendered');
}
