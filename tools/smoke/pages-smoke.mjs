/**
 * Smoke test PROD des pages kd-mc.com (World Monitor + OSINT).
 * Tourne dans GitHub Actions (le runner a un réseau ouvert, contrairement au
 * sandbox Claude Code) → vérifie le rendu RÉEL : carte Leaflet montée, tuiles
 * chargées, compteurs live peuplés, aucune erreur JS console.
 *
 * Usage : node tools/smoke/pages-smoke.mjs [baseURL]
 * Exit 1 si un échec bloquant (page KO, carte absente, erreur JS).
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'https://kd-mc.com';
const TARGETS = [
  {
    path: '/osint/',
    title: /OSINT/i,
    mustHave: ['#map', '.leaflet-container', '#kFlights', '#kQuakes'],
    kpis: ['#kFlights', '#kQuakes', '#kFires', '#kCve'],
  },
  {
    path: '/worldmonitor/',
    title: /WORLD MONITOR/i,
    mustHave: ['#map', '.leaflet-container'],
    kpis: [],
  },
  {
    // App Finances de Kevin (coffre chiffré privé) — servie sur le sous-domaine cmcteams.
    // Smoke = la page est bien déployée et BOOTE proprement : l'écran de coffre (gate)
    // s'affiche, 0 exception JS. On ne déverrouille pas (aucun code en clair en CI).
    url: 'https://cmcteams.kd-mc.com/tools/finances/',
    title: /Finances/i,
    mustHave: ['.gate', '#g-go'],
    kpis: [],
    map: false,
  },
];

const browser = await chromium.launch();
let hardFail = 0;
const report = [];

for (const t of TARGETS) {
  const page = await browser.newPage();
  const errs = [];   // erreurs JS bloquantes (exceptions non catchées)
  const warns = [];  // bruit console toléré (CORS de sources de repli optionnelles, etc.)
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') warns.push(m.text()); });
  const url = t.url || (BASE + t.path);
  const res = { url, ok: true, notes: [] };
  try {
    const resp = await page.goto(url, { waitUntil: 'load', timeout: 45000 });
    if (!resp || resp.status() >= 400) { res.ok = false; res.notes.push('HTTP ' + (resp ? resp.status() : 'no-response')); }
    await page.waitForTimeout(6000); // laisse le live + la carte se peupler

    const title = await page.title().catch(() => '');
    if (!t.title.test(title)) res.notes.push('titre inattendu: "' + title + '"');

    for (const sel of t.mustHave) {
      const found = await page.$(sel);
      if (!found) { res.ok = false; res.notes.push('MANQUE ' + sel); }
    }

    if (t.map !== false) {
      // tuiles de carte réellement chargées (network réel sur le runner)
      const tiles = await page.$$eval('.leaflet-tile-loaded, img.leaflet-tile', (els) => els.length).catch(() => 0);
      res.notes.push('tuiles carte: ' + tiles);
      if (tiles === 0) res.notes.push('⚠ aucune tuile chargée');

      // marqueurs (circleMarkers = paths svg)
      const markers = await page.$$eval('.leaflet-overlay-pane svg path', (els) => els.length).catch(() => 0);
      res.notes.push('marqueurs: ' + markers);
    }

    // compteurs live peuplés (pas tous "—")
    const kvals = [];
    for (const sel of t.kpis) {
      const v = await page.$eval(sel, (el) => el.textContent).catch(() => '—');
      kvals.push(sel + '=' + v);
    }
    if (t.kpis.length) {
      res.notes.push('KPIs: ' + kvals.join(' '));
      const anyLive = kvals.some((s) => !s.endsWith('—'));
      if (!anyLive) res.notes.push('⚠ aucun compteur live peuplé (flake réseau possible)');
    }

    // Seules les EXCEPTIONS JS non catchées font échouer (pas le bruit console CORS
    // des sources de repli optionnelles, ex Shodan CVEDB → l'app bascule sur CIRCL).
    if (errs.length) { res.ok = false; res.notes.push('EXCEPTIONS JS: ' + errs.slice(0, 3).join(' | ')); }
    if (warns.length) res.notes.push('bruit console toléré: ' + warns.length + ' (ex ' + warns[0].slice(0, 80) + ')');
  } catch (e) {
    res.ok = false;
    res.notes.push('EXCEPTION: ' + (e && e.message ? e.message : String(e)));
  }
  await page.close();
  if (!res.ok) hardFail++;
  report.push(res);
}

await browser.close();

/* Sondes DIRECTES des sources live v2.17 (réseau ouvert du runner — ce que le sandbox
   Claude Code ne peut pas atteindre, leçon #126). SOFT : la page est fail-open par
   design, donc une source down = ⚠ rapportée, pas un échec du smoke. Mais le log
   PROUVE que chaque identifiant de couche GIBS / endpoint est correct. */
const PROBES = [
  ['GIBS GOES-East GeoColor (géo LIVE)', 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/GOES-East_ABI_GeoColor/default/default/GoogleMapsCompatible_Level7/1/0/0.png'],
  ['GIBS GOES-West GeoColor', 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/GOES-West_ABI_GeoColor/default/default/GoogleMapsCompatible_Level7/1/0/0.png'],
  /* WMTS 3857 n'a NI Himawari NI Thermal (matrice v2.17 : 400 sur tous les candidats).
     → la page v2.18 passe par le WMS 3857 : sondes GetMap directes ci-dessous. */
  /* ⚠ Un GetMap WMS peut renvoyer 200 + ExceptionReport XML (faux vert, leçon #103) →
     la boucle ci-dessous exige content-type image/* pour les sondes d'images. */
  ['GIBS WMS Himawari Band13 IR (géo LIVE Asie)', 'https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=Himawari_AHI_Band13_Clean_Infrared&STYLES=&FORMAT=image%2Fpng&TRANSPARENT=true&CRS=EPSG%3A3857&BBOX=-20037508,-20037508,20037508,20037508&WIDTH=256&HEIGHT=256'],
  ['GIBS WMS VIIRS Thermal (feux sat.)', 'https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=VIIRS_SNPP_Thermal_Anomalies_375m_All&STYLES=&FORMAT=image%2Fpng&TRANSPARENT=true&CRS=EPSG%3A3857&BBOX=-20037508,-20037508,20037508,20037508&WIDTH=256&HEIGHT=256'],
  ['GIBS WMS OMPS Aerosol Index (fumées sat.)', 'https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=OMPS_Aerosol_Index&STYLES=&FORMAT=image%2Fpng&TRANSPARENT=true&CRS=EPSG%3A3857&BBOX=-20037508,-20037508,20037508,20037508&WIDTH=256&HEIGHT=256'],
  ['RainViewer (radar pluie)', 'https://api.rainviewer.com/public/weather-maps.json'],
  /* v2.20 — nouvelles sources live : la sonde envoie Origin et exige l'en-tête CORS
     access-control-allow-origin (sinon le NAVIGATEUR bloquera même si le runner voit 200). */
  ['GDACS alertes catastrophes (CORS)', 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/MAP', 'cors'],
  ['NOAA OVATION aurores (CORS)', 'https://services.swpc.noaa.gov/json/ovation_aurora_latest.json', 'cors'],
  ['Open-Meteo qualité air (CORS)', 'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=43.73&longitude=7.42&current=european_aqi', 'cors'],
  ['Open-Meteo Marine vagues (CORS)', 'https://marine-api.open-meteo.com/v1/marine?latitude=43.5&longitude=7.6&current=wave_height', 'cors'],
  /* Exploration cycle suivant : cyclones NHC (trajectoires) — le navigateur a besoin du CORS. */
  ['NOAA NHC cyclones actifs (CORS)', 'https://www.nhc.noaa.gov/CurrentStorms.json', 'cors'],
  /* v2.24 — actus live (points chauds carte + images d'articles guerres/crises) */
  /* GDELT GEO 2.0 : endpoint MORT (404 Apache sur toutes les variantes, sondes 2026-07-05)
     → couche carte retirée (v2.26). Le DOC (ci-dessous) reste la source actus/images. */
  ['GDELT DOC images d\'articles (CORS)', 'https://api.gdeltproject.org/api/v2/doc/doc?query=breaking%20sourcelang:eng&mode=artlist&maxrecords=3&format=json&timespan=3h', 'cors'],
  /* v2.27 — météo au tap + recherche lieu */
  ['Open-Meteo prévisions (météo au tap) (CORS)', 'https://api.open-meteo.com/v1/forecast?latitude=43.73&longitude=7.42&current=temperature_2m,weather_code&daily=temperature_2m_max&forecast_days=3&timezone=auto', 'cors'],
  ['Nominatim recherche lieu (CORS)', 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=Monaco', 'cors'],
  /* v2.28 — météo spatiale */
  ['NOAA SWPC indice Kp (météo spatiale) (CORS)', 'https://services.swpc.noaa.gov/json/planetary_k_index_1m.json', 'cors'],
  /* v2.30 — worker kdmc-live câblé (foudre + cyclones + feux) */
  ['kdmc-live /health (CORS)', 'https://kdmc-live.9r4rxssx64.workers.dev/health', 'cors'],
  ['kdmc-live /cyclones NHC (CORS)', 'https://kdmc-live.9r4rxssx64.workers.dev/cyclones', 'cors'],
  ['kdmc-live /lightning Blitzortung (CORS)', 'https://kdmc-live.9r4rxssx64.workers.dev/lightning?secs=3', 'cors'],
  ['Celestrak TLE (satellites live)', 'https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=tle'],
  ['satellite.js UMD (unpkg)', 'https://unpkg.com/satellite.js@5.0.0/dist/satellite.min.js'],
];
console.log('\n--- Sondes sources live (soft) ---');
for (const [label, url, mode] of PROBES) {
  try {
    const r = await fetch(url, { redirect: 'follow', headers: mode === 'cors' ? { Origin: 'https://kd-mc.com' } : {} });
    const ct = r.headers.get('content-type') || '';
    if (mode === 'cors') {
      const acao = r.headers.get('access-control-allow-origin') || '';
      const corsOk = acao === '*' || acao.includes('kd-mc.com');
      let cext = '';
      if (!r.ok) cext = ' — ' + (await r.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 160);
      console.log((r.ok && corsOk ? '✅' : '⚠️ HTTP ' + r.status + (r.ok && !corsOk ? ' SANS CORS (le navigateur bloquera)' : '')) + ' ' + label + ' (ACAO: ' + (acao || 'absent') + ')' + cext);
      continue;
    }
    // FAUX VERT (leçon #103) : une sonde d'IMAGE (GetMap/GetTile/.png) qui répond 200 mais
    // en text/xml = ExceptionReport déguisé → à traiter comme un échec, avec la cause exacte.
    const wantsImage = /GetMap|\.png|\.jpg/i.test(url);
    const imageOk = !wantsImage || /^image\//i.test(ct);
    let extra = '';
    if (!r.ok || !imageOk) { // cause EXACTE : le corps dit quoi corriger (règle CLAUDE.md)
      const body = (await r.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 220);
      extra = ' — ' + body;
    }
    console.log(((r.ok && imageOk) ? '✅' : '⚠️ HTTP ' + r.status + (r.ok ? ' FAUX VERT (pas une image)' : '')) + ' ' + label + ' (' + ct.split(';')[0] + ')' + extra);
  } catch (e) {
    console.log('⚠️ ' + label + ' : ' + (e && e.message ? e.message : e));
  }
}

/* Sonde DÉFINITIVE : le GetCapabilities WMTS 3857 liste les couches RÉELLEMENT dispo —
   on affiche celles qui matchent Himawari/Thermal/GeoColor (fin des devinettes d'IDs). */
try {
  const cap = await (await fetch('https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml')).text();
  const ids = [...cap.matchAll(/<ows:Identifier>([^<]*(?:Himawari|Thermal_Anomalies|GeoColor|GLM|Lightning|Aerosol|AOD|SO2|Dust|Smoke)[^<]*)<\/ows:Identifier>/g)].map(m => m[1]);
  const uniq = [...new Set(ids)].slice(0, 40);
  console.log('\n--- Couches WMTS 3857 réelles (Himawari|Thermal|GeoColor|GLM|Aerosol|SO2…) : ' + uniq.length + ' ---');
  for (const id of uniq) console.log('   · ' + id);
} catch (e) { console.log('⚠️ GetCapabilities WMTS : ' + (e && e.message ? e.message : e)); }

for (const r of report) {
  console.log((r.ok ? '✅' : '❌') + ' ' + r.url);
  for (const n of r.notes) console.log('   · ' + n);
}
console.log(hardFail === 0 ? '\nSMOKE OK' : '\nSMOKE ÉCHEC (' + hardFail + ')');
process.exit(hardFail === 0 ? 0 : 1);
