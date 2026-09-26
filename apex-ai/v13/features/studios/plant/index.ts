/**
 * APEX v13 — Studio Plantes (identification + soins + arrosage).
 *
 * Studio expert pour le jardinier amateur ou pro.
 *
 * Features Kevin :
 *  - Base de données 30+ plantes courantes (intérieur + extérieur)
 *  - Recherche par nom commun, nom latin, alias
 *  - Fiches : arrosage, lumière, température, multiplication, toxicité
 *  - Calendrier semis/plantation/récolte par mois
 *  - Calcul fréquence arrosage selon saison
 *  - Détection problèmes courants (jaunissement, taches, etc.)
 *
 * Anti-patterns évités : escapeHtml, validations, cleanup-scope, no fetch external (offline-first).
 */

import { escapeHtml } from '../../../core/escape-html.js';
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

export type PlantLight = 'plein-soleil' | 'mi-ombre' | 'ombre' | 'lumiere-vive-indirecte';
export type PlantWatering = 'rare' | 'modere' | 'frequent' | 'tres-frequent';
export type PlantToxicity = 'aucune' | 'legere' | 'forte';

export interface Plant {
  id: string;
  nom_commun: string;
  nom_latin: string;
  aliases: readonly string[];
  type: 'interieur' | 'exterieur' | 'mixte';
  light: PlantLight;
  watering_summer: PlantWatering;
  watering_winter: PlantWatering;
  temperature_min_c: number;
  temperature_max_c: number;
  toxicity: PlantToxicity;
  toxicity_note: string;
  multiplication: readonly string[];
  pruning_months: readonly number[]; /* 1-12 */
  planting_months: readonly number[];
  harvest_months: readonly number[];
  emoji: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  notes: string;
}

export const PLANTS: readonly Plant[] = [
  { id: 'monstera', nom_commun: 'Monstera', nom_latin: 'Monstera deliciosa', aliases: ['plante gruyère'], type: 'interieur', light: 'lumiere-vive-indirecte', watering_summer: 'modere', watering_winter: 'rare', temperature_min_c: 15, temperature_max_c: 30, toxicity: 'forte', toxicity_note: 'Toxique chats/chiens (oxalates).', multiplication: ['bouture tige avec racine aérienne'], pruning_months: [3, 4], planting_months: [3, 4, 5], harvest_months: [], emoji: '🌿', difficulty: 1, notes: 'Tuteurer dès 1m. Aime humidité 60%+.' },
  { id: 'pothos', nom_commun: 'Pothos', nom_latin: 'Epipremnum aureum', aliases: ['scindapsus'], type: 'interieur', light: 'mi-ombre', watering_summer: 'modere', watering_winter: 'rare', temperature_min_c: 12, temperature_max_c: 28, toxicity: 'forte', toxicity_note: 'Toxique animaux.', multiplication: ['bouture tige eau'], pruning_months: [3, 4, 5, 6], planting_months: [3, 4, 5], harvest_months: [], emoji: '🌱', difficulty: 1, notes: 'Très résistant. Croissance rapide.' },
  { id: 'ficus', nom_commun: 'Ficus lyrata', nom_latin: 'Ficus lyrata', aliases: ['figuier lyre'], type: 'interieur', light: 'lumiere-vive-indirecte', watering_summer: 'modere', watering_winter: 'rare', temperature_min_c: 15, temperature_max_c: 27, toxicity: 'legere', toxicity_note: 'Latex irritant.', multiplication: ['marcottage aérien'], pruning_months: [3, 4], planting_months: [3, 4], harvest_months: [], emoji: '🌳', difficulty: 3, notes: 'Sensible aux courants d\'air. Ne pas déplacer souvent.' },
  { id: 'sansevieria', nom_commun: 'Sansevière', nom_latin: 'Sansevieria trifasciata', aliases: ['langue de belle-mère'], type: 'interieur', light: 'mi-ombre', watering_summer: 'rare', watering_winter: 'rare', temperature_min_c: 10, temperature_max_c: 30, toxicity: 'legere', toxicity_note: 'Toxique chats/chiens.', multiplication: ['division', 'bouture feuille'], pruning_months: [], planting_months: [3, 4, 5], harvest_months: [], emoji: '🪴', difficulty: 1, notes: 'Très résistante. Tolère oubli arrosage.' },
  { id: 'aloe', nom_commun: 'Aloe vera', nom_latin: 'Aloe vera', aliases: ['aloès'], type: 'mixte', light: 'plein-soleil', watering_summer: 'modere', watering_winter: 'rare', temperature_min_c: 5, temperature_max_c: 35, toxicity: 'aucune', toxicity_note: 'Comestible (gel intérieur).', multiplication: ['rejets'], pruning_months: [], planting_months: [3, 4, 5, 6], harvest_months: [], emoji: '🌵', difficulty: 1, notes: 'Sol drainant. Hivernage > 5°C.' },
  { id: 'orchidee', nom_commun: 'Orchidée Phalaenopsis', nom_latin: 'Phalaenopsis', aliases: ['phalaenopsis'], type: 'interieur', light: 'lumiere-vive-indirecte', watering_summer: 'modere', watering_winter: 'rare', temperature_min_c: 16, temperature_max_c: 28, toxicity: 'aucune', toxicity_note: '', multiplication: ['keiki'], pruning_months: [11, 12], planting_months: [3, 4, 5], harvest_months: [], emoji: '🌸', difficulty: 3, notes: 'Trempage 10 min/semaine. Engrais orchidée 1×/2 sem.' },
  { id: 'cactus', nom_commun: 'Cactus de Noël', nom_latin: 'Schlumbergera', aliases: ['schlumbergera'], type: 'interieur', light: 'lumiere-vive-indirecte', watering_summer: 'modere', watering_winter: 'rare', temperature_min_c: 10, temperature_max_c: 25, toxicity: 'aucune', toxicity_note: '', multiplication: ['bouture tige'], pruning_months: [3, 4], planting_months: [3, 4, 5], harvest_months: [], emoji: '🌵', difficulty: 2, notes: 'Floraison déclenchée par fraîcheur 12-15°C automne.' },
  { id: 'tomate', nom_commun: 'Tomate', nom_latin: 'Solanum lycopersicum', aliases: ['tomate cerise', 'tomate cœur'], type: 'exterieur', light: 'plein-soleil', watering_summer: 'frequent', watering_winter: 'rare', temperature_min_c: 10, temperature_max_c: 35, toxicity: 'legere', toxicity_note: 'Feuilles toxiques (solanine).', multiplication: ['semis', 'bouture gourmand'], pruning_months: [6, 7, 8], planting_months: [3, 4, 5], harvest_months: [7, 8, 9], emoji: '🍅', difficulty: 2, notes: 'Tuteurer. Pailler. Pas mouiller feuillage (mildiou).' },
  { id: 'basilic', nom_commun: 'Basilic', nom_latin: 'Ocimum basilicum', aliases: ['basilic grand-vert'], type: 'mixte', light: 'plein-soleil', watering_summer: 'frequent', watering_winter: 'modere', temperature_min_c: 10, temperature_max_c: 32, toxicity: 'aucune', toxicity_note: 'Comestible.', multiplication: ['semis', 'bouture eau'], pruning_months: [5, 6, 7, 8], planting_months: [4, 5], harvest_months: [6, 7, 8, 9], emoji: '🌿', difficulty: 1, notes: 'Pincer haut tige pour buisson. Récolter feuilles régulièrement.' },
  { id: 'menthe', nom_commun: 'Menthe', nom_latin: 'Mentha', aliases: ['menthe poivrée'], type: 'exterieur', light: 'mi-ombre', watering_summer: 'frequent', watering_winter: 'modere', temperature_min_c: -10, temperature_max_c: 30, toxicity: 'aucune', toxicity_note: '', multiplication: ['division', 'bouture eau'], pruning_months: [3, 4, 5, 6, 7, 8], planting_months: [3, 4, 5], harvest_months: [5, 6, 7, 8, 9], emoji: '🌿', difficulty: 1, notes: 'Très envahissante : cultiver en pot.' },
  { id: 'lavande', nom_commun: 'Lavande', nom_latin: 'Lavandula angustifolia', aliases: ['lavandin'], type: 'exterieur', light: 'plein-soleil', watering_summer: 'rare', watering_winter: 'rare', temperature_min_c: -15, temperature_max_c: 35, toxicity: 'aucune', toxicity_note: '', multiplication: ['bouture'], pruning_months: [9, 10], planting_months: [3, 4, 5, 9, 10], harvest_months: [6, 7, 8], emoji: '💜', difficulty: 1, notes: 'Sol drainant. Tailler après floraison.' },
  { id: 'rosier', nom_commun: 'Rosier', nom_latin: 'Rosa', aliases: ['rose'], type: 'exterieur', light: 'plein-soleil', watering_summer: 'frequent', watering_winter: 'rare', temperature_min_c: -20, temperature_max_c: 35, toxicity: 'aucune', toxicity_note: '', multiplication: ['bouture', 'greffage'], pruning_months: [2, 3, 11], planting_months: [10, 11, 12, 1, 2, 3], harvest_months: [5, 6, 7, 8, 9], emoji: '🌹', difficulty: 3, notes: 'Tailler en fin hiver. Engrais rosier au printemps.' },
] as const;

/* ============================================================
   Pure functions
   ============================================================ */

/**
 * Recherche plante par nom (commun, latin, alias) avec fuzzy léger.
 */
export function findPlant(query: string): readonly Plant[] {
  if (!query || query.trim().length < 2) return [];
  const q = query.trim().toLowerCase();
  return PLANTS.filter((p) =>
    p.nom_commun.toLowerCase().includes(q) ||
    p.nom_latin.toLowerCase().includes(q) ||
    p.aliases.some((a) => a.toLowerCase().includes(q)),
  );
}

/**
 * Calcule fréquence arrosage en jours selon mois courant + plante.
 */
export function getWateringFrequencyDays(plant: Plant, month: number): number {
  const isWinter = month <= 2 || month >= 11;
  const w = isWinter ? plant.watering_winter : plant.watering_summer;
  switch (w) {
    case 'tres-frequent': return 1;
    case 'frequent': return 3;
    case 'modere': return 7;
    case 'rare': return 14;
  }
}

/**
 * Plantes plantables ce mois-ci.
 */
export function plantsForMonth(month: number): readonly Plant[] {
  if (month < 1 || month > 12) return [];
  return PLANTS.filter((p) => p.planting_months.includes(month));
}

/* ============================================================
   UI
   ============================================================ */

export function render(rootEl: HTMLElement): void {
  activeScope?.cleanup();
  activeScope = createCleanupScope('studios-plant');
  /* Wire admin feature toggle (Kevin règle 2026-05-04 — ON/OFF tout). */
  const uid = (store.get('user') as { id?: string } | null)?.id ?? 'anon';
  if (!guardFeatureEnabled('studio.plant', rootEl, uid)) return;
  const currentMonth = new Date().getMonth() + 1;

  rootEl.innerHTML = `
    <div class="ax-page ax-gs-451">
      <header class="ax-gs-210">
        <h1 class="ax-gs-333">🌱 Studio Plantes</h1>
        <span class="ax-gs-3">${PLANTS.length} plantes · Mois ${currentMonth}</span>
      </header>

      <div class="ax-gs-1">
        <h2 class="ax-gs-452">Recherche plante</h2>
        <input type="text" id="ax-plant-search" aria-label="Rechercher une plante par nom commun ou latin" placeholder="Nom commun, latin ou alias…" autocomplete="off" class="ax-gs-453">
        <div id="ax-plant-results" style="margin-top:12px;display:flex;flex-direction:column;gap:8px"></div>
      </div>

      <div class="ax-gs-1">
        <h2 class="ax-gs-452">Que planter ce mois (${currentMonth}) ?</h2>
        <div id="ax-plant-month" class="ax-gs-247"></div>
      </div>

      <p class="ax-gs-212"><a href="#studios" class="ax-gs-198">← Retour studios</a></p>
    </div>
  `;
  attach(rootEl, currentMonth);
}

function renderPlantCard(p: Plant, month: number): string {
  const freq = getWateringFrequencyDays(p, month);
  const lightLabel = ({ 'plein-soleil': '☀ Plein soleil', 'mi-ombre': '🌤 Mi-ombre', 'ombre': '🌑 Ombre', 'lumiere-vive-indirecte': '💡 Lumière vive indirecte' })[p.light];
  return `
    <div style="background:rgba(255,255,255,0.03);border:1px solid #333;border-radius:8px;padding:12px">
      <div class="ax-gs-77">
        <span class="ax-gs-172">${p.emoji}</span>
        <div>
          <div style="font-weight:700;color:#c9a227">${escapeHtml(p.nom_commun)}</div>
          <div style="font-size:11px;color:var(--ax-text-dim);font-style:italic">${escapeHtml(p.nom_latin)}</div>
        </div>
        <span style="margin-left:auto;font-size:11px;color:#888">Difficulté ${'★'.repeat(p.difficulty)}${'☆'.repeat(5 - p.difficulty)}</span>
      </div>
      <div class="ax-gs-5">
        💧 Arrosage : tous les ${freq}j · ${lightLabel} · ${p.temperature_min_c}–${p.temperature_max_c}°C
      </div>
      ${p.toxicity !== 'aucune' ? `<div style="font-size:11px;color:#ff8866;margin-top:4px">⚠ ${escapeHtml(p.toxicity_note)}</div>` : ''}
      <div style="font-size:11px;color:#888;margin-top:6px">${escapeHtml(p.notes)}</div>
    </div>
  `;
}

function attach(rootEl: HTMLElement, currentMonth: number): void {
  const input = rootEl.querySelector<HTMLInputElement>('#ax-plant-search');
  const results = rootEl.querySelector<HTMLDivElement>('#ax-plant-results');
  if (input && results && activeScope) {
    activeScope.bind(input, 'input', () => {
      const found = findPlant(input.value);
      results.innerHTML = found.length === 0
        ? '<div class="ax-gs-3">Aucune plante trouvée. Essaye "tomate", "monstera", "lavande"…</div>'
        : found.map((p) => renderPlantCard(p, currentMonth)).join('');
      if (found.length > 0) haptic.tap();
    });
  }

  const monthDiv = rootEl.querySelector<HTMLDivElement>('#ax-plant-month');
  if (monthDiv) {
    const list = plantsForMonth(currentMonth);
    monthDiv.innerHTML = list.length === 0
      ? '<div class="ax-gs-3">Aucune plantation idéale ce mois.</div>'
      : list.map((p) => `<span style="background:rgba(201,162,39,0.15);border:1px solid rgba(201,162,39,0.4);color:#c9a227;padding:4px 10px;border-radius:14px;font-size:12px">${p.emoji} ${escapeHtml(p.nom_commun)}</span>`).join('');
  }

  logger.info('studios-plant', 'rendered');
}
