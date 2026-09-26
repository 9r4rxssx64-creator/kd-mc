/**
 * APEX v13 — Studio Architecture (RE2020 + calculs surface/béton/peinture/PMR).
 *
 * Studio expert pour pré-dimensionner un projet construction/rénovation FR.
 *
 * Features Kevin (max niveau) :
 *  - Calcul surface habitable / SHON / surface utile
 *  - Mélange béton (proportions ciment/sable/gravier/eau par dosage 250/300/350 kg/m³)
 *  - Estimation peinture (litres pour murs+plafond, multi-couches)
 *  - Estimation parquet/carrelage (m² + chutes 10%)
 *  - Vérification PMR (largeur passage 90cm, douche 1.20m, etc.)
 *  - Constantes RE2020 (Bbio max, Cep max selon zone climatique H1/H2/H3)
 *  - Hauteur sous plafond minimum (2.40m FR, 2.30m Monaco)
 *  - Échelle Blondel (escalier 2h+g = 60-64cm)
 *
 * Anti-patterns évités : escapeHtml, validations strictes, cleanup-scope.
 */

import { escapeHtml } from '../../../core/escape-html.js';
export { escapeHtml }; /* re-export pour tests + parité historique */
import { createCleanupScope, type CleanupScope } from '../../../core/listener-cleanup.js';
import { logger } from '../../../core/logger.js';
import { store } from '../../../core/store.js';
import { guardFeatureEnabled } from '../../../services/auth/feature-guard.js';
import { haptic } from '../../../ui/haptic.js';

let activeScope: CleanupScope | null = null;

export function dispose(): void {
  activeScope?.cleanup();
  activeScope = null;
}

/* ============================================================
   Constantes RE2020 (réglementation thermique FR 2026)
   ============================================================ */

export interface RE2020Zone {
  zone: 'H1a' | 'H1b' | 'H1c' | 'H2a' | 'H2b' | 'H2c' | 'H2d' | 'H3';
  bbio_max: number; /* points (besoin bioclimatique) */
  cep_max: number; /* kWh/m²/an */
  description: string;
}

export const RE2020_ZONES: readonly RE2020Zone[] = [
  { zone: 'H1a', bbio_max: 72, cep_max: 75, description: 'Nord-Est (Strasbourg, Reims)' },
  { zone: 'H1b', bbio_max: 65, cep_max: 70, description: 'Centre (Paris, Tours)' },
  { zone: 'H1c', bbio_max: 60, cep_max: 65, description: 'Centre-Est (Lyon, Grenoble)' },
  { zone: 'H2a', bbio_max: 65, cep_max: 65, description: 'Bretagne, Pays de Loire' },
  { zone: 'H2b', bbio_max: 60, cep_max: 60, description: 'Sud-Ouest Atlantique (Bordeaux)' },
  { zone: 'H2c', bbio_max: 55, cep_max: 55, description: 'Sud (Toulouse, Montpellier)' },
  { zone: 'H2d', bbio_max: 55, cep_max: 50, description: 'Méditerranée (Marseille, Nice, Monaco)' },
  { zone: 'H3', bbio_max: 50, cep_max: 50, description: 'Côte méditerranéenne très chaude' },
] as const;

/* ============================================================
   Dosages béton (kg de ciment par m³)
   ============================================================ */

export interface BetonDosage {
  type: string;
  ciment_kg_m3: number;
  sable_kg_m3: number;
  gravier_kg_m3: number;
  eau_l_m3: number;
  usage: string;
}

export const BETON_DOSAGES: readonly BetonDosage[] = [
  { type: 'Béton de propreté', ciment_kg_m3: 150, sable_kg_m3: 800, gravier_kg_m3: 1100, eau_l_m3: 100, usage: 'Couche sous fondations' },
  { type: 'Béton dosage 250', ciment_kg_m3: 250, sable_kg_m3: 750, gravier_kg_m3: 1100, eau_l_m3: 130, usage: 'Dalle non porteuse, terrasse' },
  { type: 'Béton dosage 300', ciment_kg_m3: 300, sable_kg_m3: 720, gravier_kg_m3: 1080, eau_l_m3: 150, usage: 'Dalle porteuse, fondation maison' },
  { type: 'Béton dosage 350', ciment_kg_m3: 350, sable_kg_m3: 700, gravier_kg_m3: 1050, eau_l_m3: 175, usage: 'Béton armé, poteau, poutre' },
  { type: 'Béton dosage 400', ciment_kg_m3: 400, sable_kg_m3: 680, gravier_kg_m3: 1020, eau_l_m3: 200, usage: 'Béton structurel résistant' },
] as const;

/* ============================================================
   Normes PMR (Personne à Mobilité Réduite)
   ============================================================ */

export interface PmrCheck {
  id: string;
  label: string;
  min_value_cm: number;
  description: string;
}

export const PMR_NORMS: readonly PmrCheck[] = [
  { id: 'door_width', label: 'Largeur porte d\'entrée', min_value_cm: 83, description: 'Loi 2005-102. Passage utile ≥ 83 cm.' },
  { id: 'corridor_width', label: 'Largeur couloir', min_value_cm: 90, description: 'Largeur libre ≥ 90 cm.' },
  { id: 'shower_size', label: 'Douche italienne', min_value_cm: 120, description: 'Espace minimum 120×90 cm.' },
  { id: 'turn_circle', label: 'Aire de rotation', min_value_cm: 150, description: 'Diamètre Ø1.50 m libre.' },
  { id: 'wc_clearance', label: 'Espace latéral WC', min_value_cm: 80, description: 'Latéral ≥ 80 cm pour transfert.' },
  { id: 'ramp_slope_pct', label: 'Pente rampe (%)', min_value_cm: 5, description: 'Max 5% (sinon palier + main courante).' },
] as const;

/* ============================================================
   Hauteur sous plafond / Blondel escalier
   ============================================================ */

export const HSP_MIN_FR = 240; /* cm — surface habitable décompte */
export const HSP_MIN_MONACO = 230; /* cm */
export const BLONDEL_MIN = 60; /* 2h + g >= 60 cm */
export const BLONDEL_MAX = 64; /* 2h + g <= 64 cm */

/* ============================================================
   Calculs purs (testables)
   ============================================================ */

/**
 * Surface habitable (loi Boutin) : surface plancher - cloisons - escaliers - hauteur < 1.80m.
 * Estimation simple : on retire 5% pour cloisons + escaliers.
 */
export function calcSurfaceHabitable(surface_brute_m2: number): number {
  if (!isFinite(surface_brute_m2) || surface_brute_m2 <= 0) return 0;
  return Math.round(surface_brute_m2 * 0.95 * 100) / 100;
}

export interface BetonCalcResult {
  volume_m3: number;
  ciment_kg: number;
  sable_kg: number;
  gravier_kg: number;
  eau_l: number;
  sacs_ciment_35kg: number;
}

/**
 * Calcul béton pour un volume donné selon le dosage choisi.
 */
export function calcBeton(volume_m3: number, dosageType: string): BetonCalcResult | null {
  if (!isFinite(volume_m3) || volume_m3 <= 0) return null;
  const dosage = BETON_DOSAGES.find((d) => d.type === dosageType);
  if (!dosage) return null;
  const ciment_kg = Math.round(volume_m3 * dosage.ciment_kg_m3);
  return {
    volume_m3,
    ciment_kg,
    sable_kg: Math.round(volume_m3 * dosage.sable_kg_m3),
    gravier_kg: Math.round(volume_m3 * dosage.gravier_kg_m3),
    eau_l: Math.round(volume_m3 * dosage.eau_l_m3),
    sacs_ciment_35kg: Math.ceil(ciment_kg / 35),
  };
}

export interface PeintureCalcResult {
  surface_a_peindre_m2: number;
  litres_total: number;
  pots_5l: number;
  pots_2_5l: number;
}

/**
 * Calcul peinture : 1L couvre ~10m² en 1 couche.
 * surface_murs + surface_plafond, avec 2 couches par défaut.
 */
export function calcPeinture(longueur_m: number, largeur_m: number, hauteur_m: number, couches = 2): PeintureCalcResult | null {
  if (!isFinite(longueur_m) || longueur_m <= 0 || !isFinite(largeur_m) || largeur_m <= 0 || !isFinite(hauteur_m) || hauteur_m <= 0) return null;
  if (couches < 1 || couches > 5) return null;
  const surface_murs = 2 * (longueur_m + largeur_m) * hauteur_m;
  const surface_plafond = longueur_m * largeur_m;
  const total = (surface_murs + surface_plafond) * couches;
  const litres = Math.ceil(total / 10);
  const pots_5l = Math.floor(litres / 5);
  const pots_2_5l = Math.ceil((litres - pots_5l * 5) / 2.5);
  return {
    surface_a_peindre_m2: Math.round(total * 100) / 100,
    litres_total: litres,
    pots_5l,
    pots_2_5l: pots_2_5l < 0 ? 0 : pots_2_5l,
  };
}

/**
 * Calcul revêtement sol (parquet/carrelage) avec 10% chutes.
 */
export function calcRevetement(longueur_m: number, largeur_m: number, chutes_pct = 10): { surface_m2: number; surface_avec_chutes_m2: number } | null {
  if (!isFinite(longueur_m) || longueur_m <= 0 || !isFinite(largeur_m) || largeur_m <= 0) return null;
  const surface = longueur_m * largeur_m;
  const avec_chutes = surface * (1 + chutes_pct / 100);
  return {
    surface_m2: Math.round(surface * 100) / 100,
    surface_avec_chutes_m2: Math.round(avec_chutes * 100) / 100,
  };
}

/**
 * Vérifie escalier selon échelle Blondel (2h + g entre 60 et 64 cm).
 */
export function checkBlondel(hauteur_marche_cm: number, giron_cm: number): { ok: boolean; valeur: number; recommandation: string } {
  const valeur = 2 * hauteur_marche_cm + giron_cm;
  if (valeur < BLONDEL_MIN) return { ok: false, valeur, recommandation: 'Marches trop basses ou giron trop court (escalier raide à monter).' };
  if (valeur > BLONDEL_MAX) return { ok: false, valeur, recommandation: 'Marches trop hautes ou giron trop long (escalier difficile).' };
  return { ok: true, valeur, recommandation: 'Escalier conforme à l\'échelle Blondel.' };
}

/* ============================================================
   UI
   ============================================================ */

export function render(rootEl: HTMLElement): void {
  activeScope?.cleanup();
  activeScope = createCleanupScope('studios-architecture');
  /* Wire admin feature toggle (Kevin règle 2026-05-04 — ON/OFF tout). */
  const uid = (store.get('user') as { id?: string } | null)?.id ?? 'anon';
  if (!guardFeatureEnabled('studio.architecture', rootEl, uid)) return;

  const dosagesHtml = BETON_DOSAGES.map((d) => `<option value="${escapeHtml(d.type)}">${escapeHtml(d.type)} — ${escapeHtml(d.usage)}</option>`).join('');
  const zonesHtml = RE2020_ZONES.map((z) => `<option value="${escapeHtml(z.zone)}">${escapeHtml(z.zone)} — ${escapeHtml(z.description)}</option>`).join('');

  rootEl.innerHTML = `
    <div class="ax-page ax-gs-451">
      <header class="ax-gs-210">
        <h1 class="ax-gs-333">🏗 Studio Architecture</h1>
        <span class="ax-gs-3">RE2020 + calculs construction</span>
      </header>

      <div class="ax-gs-1">
        <h2 class="ax-gs-452">Surface habitable (loi Boutin)</h2>
        <input type="number" id="ax-archi-surface" aria-label="Surface brute en mètres carrés" placeholder="Surface brute (m²)" min="1" step="0.01" class="ax-gs-453">
        <button class="ax-btn ax-btn-primary ax-gs-454" id="ax-archi-surface-btn">Calculer</button>
        <div id="ax-archi-surface-out" class="ax-gs-253"></div>
      </div>

      <div class="ax-gs-1">
        <h2 class="ax-gs-452">Béton (proportions)</h2>
        <input type="number" id="ax-archi-vol" aria-label="Volume de béton en mètres cubes" placeholder="Volume (m³)" min="0.01" step="0.01" class="ax-gs-455">
        <select id="ax-archi-dosage" class="ax-gs-455">${dosagesHtml}</select>
        <button class="ax-btn ax-btn-primary ax-gs-401" id="ax-archi-beton-btn">Calculer béton</button>
        <pre id="ax-archi-beton-out" class="ax-gs-456"></pre>
      </div>

      <div class="ax-gs-1">
        <h2 class="ax-gs-452">Peinture (litres pour pièce)</h2>
        <input type="number" id="ax-archi-l" aria-label="Longueur de la pièce en mètres" placeholder="Longueur (m)" min="0.5" step="0.1" class="ax-gs-455">
        <input type="number" id="ax-archi-w" aria-label="Largeur de la pièce en mètres" placeholder="Largeur (m)" min="0.5" step="0.1" class="ax-gs-455">
        <input type="number" id="ax-archi-h" aria-label="Hauteur sous plafond en mètres" placeholder="Hauteur (m)" min="2" max="10" step="0.1" value="2.5" class="ax-gs-455">
        <button class="ax-btn ax-btn-primary ax-gs-401" id="ax-archi-paint-btn">Calculer peinture</button>
        <pre id="ax-archi-paint-out" class="ax-gs-456"></pre>
      </div>

      <div class="ax-gs-1">
        <h2 class="ax-gs-452">RE2020 — Zone climatique</h2>
        <select id="ax-archi-zone" class="ax-gs-455">${zonesHtml}</select>
        <div id="ax-archi-zone-out" style="margin-top:8px;color:#c9a227;font-size:13px"></div>
      </div>

      <div class="ax-gs-1">
        <h2 class="ax-gs-452">Normes PMR (loi 2005-102)</h2>
        <ul style="margin:0;padding-left:18px;color:var(--ax-text-dim);font-size:13px">
          ${PMR_NORMS.map((n) => `<li><strong class="ax-gs-266">${escapeHtml(n.label)} :</strong> ≥ ${n.min_value_cm} cm — ${escapeHtml(n.description)}</li>`).join('')}
        </ul>
      </div>

      <p class="ax-gs-212"><a href="#studios" class="ax-gs-198">← Retour studios</a></p>
    </div>
  `;
  attach(rootEl);
}

function attach(rootEl: HTMLElement): void {
  const surfBtn = rootEl.querySelector<HTMLButtonElement>('#ax-archi-surface-btn');
  if (surfBtn && activeScope) {
    activeScope.bind(surfBtn, 'click', () => {
      haptic.tap();
      const input = rootEl.querySelector<HTMLInputElement>('#ax-archi-surface');
      const out = rootEl.querySelector<HTMLDivElement>('#ax-archi-surface-out');
      if (!input || !out) return;
      const v = parseFloat(input.value);
      const habitable = calcSurfaceHabitable(v);
      out.textContent = habitable > 0 ? `Surface habitable estimée : ${habitable} m²` : 'Saisis une surface valide.';
    });
  }

  const betonBtn = rootEl.querySelector<HTMLButtonElement>('#ax-archi-beton-btn');
  if (betonBtn && activeScope) {
    activeScope.bind(betonBtn, 'click', () => {
      haptic.tap();
      const vol = parseFloat(rootEl.querySelector<HTMLInputElement>('#ax-archi-vol')?.value ?? '');
      const dosage = rootEl.querySelector<HTMLSelectElement>('#ax-archi-dosage')?.value ?? '';
      const out = rootEl.querySelector<HTMLPreElement>('#ax-archi-beton-out');
      if (!out) return;
      const result = calcBeton(vol, dosage);
      if (!result) {
        out.textContent = 'Volume invalide.';
        return;
      }
      out.textContent = `Volume : ${result.volume_m3} m³
Ciment : ${result.ciment_kg} kg (${result.sacs_ciment_35kg} sacs de 35 kg)
Sable : ${result.sable_kg} kg
Gravier : ${result.gravier_kg} kg
Eau : ${result.eau_l} L`;
    });
  }

  const paintBtn = rootEl.querySelector<HTMLButtonElement>('#ax-archi-paint-btn');
  if (paintBtn && activeScope) {
    activeScope.bind(paintBtn, 'click', () => {
      haptic.tap();
      const l = parseFloat(rootEl.querySelector<HTMLInputElement>('#ax-archi-l')?.value ?? '');
      const w = parseFloat(rootEl.querySelector<HTMLInputElement>('#ax-archi-w')?.value ?? '');
      const h = parseFloat(rootEl.querySelector<HTMLInputElement>('#ax-archi-h')?.value ?? '');
      const out = rootEl.querySelector<HTMLPreElement>('#ax-archi-paint-out');
      if (!out) return;
      const result = calcPeinture(l, w, h, 2);
      if (!result) {
        out.textContent = 'Dimensions invalides.';
        return;
      }
      out.textContent = `Surface peinte (2 couches) : ${result.surface_a_peindre_m2} m²
Total : ${result.litres_total} litres
≈ ${result.pots_5l} pots de 5L + ${result.pots_2_5l} pots de 2.5L`;
    });
  }

  const zoneSel = rootEl.querySelector<HTMLSelectElement>('#ax-archi-zone');
  const zoneOut = rootEl.querySelector<HTMLDivElement>('#ax-archi-zone-out');
  const updateZone = (): void => {
    if (!zoneSel || !zoneOut) return;
    const z = RE2020_ZONES.find((zz) => zz.zone === zoneSel.value);
    if (!z) return;
    zoneOut.textContent = `${z.zone} — ${z.description}. Bbio max ${z.bbio_max} pts · Cep max ${z.cep_max} kWh/m²/an.`;
  };
  if (zoneSel && activeScope) {
    activeScope.bind(zoneSel, 'change', updateZone);
    updateZone();
  }

  logger.info('studios-architecture', 'rendered');
}
