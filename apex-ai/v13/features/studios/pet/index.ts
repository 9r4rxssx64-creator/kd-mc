/**
 * APEX v13 — Studio Animaux (santé + nutrition + soins).
 *
 * Studio expert pour propriétaire d'animal de compagnie.
 *
 * Features Kevin :
 *  - Catalogue 6 espèces (chien, chat, lapin, hamster, oiseau, poisson)
 *  - Calcul ration alimentaire selon poids + niveau activité
 *  - Vaccinations recommandées par espèce
 *  - Signaux d'alerte vétérinaire
 *  - Calculateur âge humain ↔ animal
 *
 * Anti-patterns évités : escapeHtml, validations strictes, no fetch external.
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

export type PetSpecies = 'chien' | 'chat' | 'lapin' | 'hamster' | 'oiseau' | 'poisson';
export type ActivityLevel = 'sedentaire' | 'normal' | 'actif' | 'tres-actif';

export interface PetSpeciesInfo {
  id: PetSpecies;
  name: string;
  emoji: string;
  weight_range_kg: { min: number; max: number };
  /** Calories par kg de poids corporel, niveau activité normal. */
  kcal_per_kg_normal: number;
  vaccinations: readonly string[];
  red_flags: readonly string[];
  /** Coefficient âge humain → âge animal (approximation). */
  age_coefficient: number;
  base_year_offset: number;
}

export const PET_SPECIES: readonly PetSpeciesInfo[] = [
  {
    id: 'chien',
    name: 'Chien',
    emoji: '🐕',
    weight_range_kg: { min: 1, max: 80 },
    kcal_per_kg_normal: 70,
    vaccinations: ['CHPPiL (carré, hépatite, parvo, parainfluenza, leptospirose)', 'Rage', 'Toux du chenil', 'Maladie de Lyme (zone à risque)'],
    red_flags: ['Vomissements répétés > 24h', 'Diarrhée sanglante', 'Léthargie soudaine', 'Refus de manger > 24h', 'Difficulté à respirer', 'Convulsions'],
    age_coefficient: 5,
    base_year_offset: 16,
  },
  {
    id: 'chat',
    name: 'Chat',
    emoji: '🐈',
    weight_range_kg: { min: 2, max: 12 },
    kcal_per_kg_normal: 60,
    vaccinations: ['Typhus, coryza, leucose', 'Rage', 'Chlamydiose'],
    red_flags: ['Léthargie', 'Refus de boire/manger > 24h', 'Vomissements répétés', 'Mictions difficiles ou absentes', 'Boiterie soudaine', 'Respiration rapide au repos'],
    age_coefficient: 4,
    base_year_offset: 15,
  },
  {
    id: 'lapin',
    name: 'Lapin',
    emoji: '🐇',
    weight_range_kg: { min: 1, max: 6 },
    kcal_per_kg_normal: 55,
    vaccinations: ['Myxomatose', 'VHD (maladie hémorragique virale)'],
    red_flags: ['Arrêt total alimentation > 12h (URGENT)', 'Pas de selles > 12h', 'Tête inclinée', 'Boiterie', 'Difficulté respiratoire'],
    age_coefficient: 7,
    base_year_offset: 0,
  },
  {
    id: 'hamster',
    name: 'Hamster',
    emoji: '🐹',
    weight_range_kg: { min: 0.05, max: 0.2 },
    kcal_per_kg_normal: 100,
    vaccinations: [],
    red_flags: ['Léthargie inhabituelle', 'Diarrhée (mortelle rapide)', 'Boiterie', 'Croûtes / perte poils', 'Difficulté respiratoire'],
    age_coefficient: 25,
    base_year_offset: 0,
  },
  {
    id: 'oiseau',
    name: 'Oiseau (perroquet, canari)',
    emoji: '🦜',
    weight_range_kg: { min: 0.01, max: 1.5 },
    kcal_per_kg_normal: 120,
    vaccinations: ['Polyomavirus (perroquets élevage)', 'Maladie de Pacheco'],
    red_flags: ['Plumes ébouriffées au repos', 'Fientes anormales', 'Respiration bouche ouverte', 'Repli au fond cage', 'Refus chant'],
    age_coefficient: 6,
    base_year_offset: 0,
  },
  {
    id: 'poisson',
    name: 'Poisson (aquarium)',
    emoji: '🐟',
    weight_range_kg: { min: 0.001, max: 0.5 },
    kcal_per_kg_normal: 30,
    vaccinations: [],
    red_flags: ['Nage de travers', 'Plaies / champignons visibles', 'Ouïes pâles ou rouges', 'Refus alimentation', 'Reste isolé en surface'],
    age_coefficient: 3,
    base_year_offset: 0,
  },
] as const;

const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  'sedentaire': 0.85,
  'normal': 1.0,
  'actif': 1.2,
  'tres-actif': 1.5,
};

/* ============================================================
   Pure calculations
   ============================================================ */

/**
 * Calcul ration calorique journalière (RER × facteur activité).
 * Formule standard vétérinaire : RER = 70 × poids_kg^0.75
 */
export function calcDailyCalories(species: PetSpecies, weight_kg: number, activity: ActivityLevel): number | null {
  const info = PET_SPECIES.find((s) => s.id === species);
  if (!info) return null;
  if (!isFinite(weight_kg) || weight_kg <= 0) return null;
  if (weight_kg < info.weight_range_kg.min || weight_kg > info.weight_range_kg.max) return null;
  const rer = 70 * Math.pow(weight_kg, 0.75);
  const factor = ACTIVITY_FACTORS[activity];
  return Math.round(rer * factor);
}

/**
 * Conversion âge animal → âge humain équivalent (approximation grand public).
 */
export function animalToHumanAge(species: PetSpecies, age_years: number): number | null {
  const info = PET_SPECIES.find((s) => s.id === species);
  if (!info) return null;
  if (!isFinite(age_years) || age_years < 0) return null;
  return Math.round(info.base_year_offset + age_years * info.age_coefficient);
}

/* ============================================================
   UI
   ============================================================ */

export function render(rootEl: HTMLElement): void {
  activeScope?.cleanup();
  activeScope = createCleanupScope('studios-pet');
  /* Wire admin feature toggle (Kevin règle 2026-05-04 — ON/OFF tout). */
  const uid = (store.get('user') as { id?: string } | null)?.id ?? 'anon';
  if (!guardFeatureEnabled('studio.pet', rootEl, uid)) return;

  const speciesOpts = PET_SPECIES.map((s) => `<option value="${s.id}">${s.emoji} ${escapeHtml(s.name)}</option>`).join('');
  const speciesCardsHtml = PET_SPECIES.map((s) => `
    <div style="background:rgba(255,255,255,0.03);border:1px solid #333;border-radius:8px;padding:10px;margin-bottom:8px">
      <div class="ax-gs-77">
        <span class="ax-gs-172">${s.emoji}</span>
        <strong class="ax-gs-266">${escapeHtml(s.name)}</strong>
      </div>
      ${s.vaccinations.length > 0 ? `<div style="font-size:12px;color:#ddd;margin-bottom:4px"><strong>💉 Vaccins :</strong> ${s.vaccinations.map((v) => escapeHtml(v)).join(', ')}</div>` : ''}
      <div style="font-size:11px;color:#ff8866"><strong>⚠ Urgence véto si :</strong> ${s.red_flags.slice(0, 3).map((r) => escapeHtml(r)).join(' · ')}</div>
    </div>
  `).join('');

  rootEl.innerHTML = `
    <div class="ax-page ax-gs-451">
      <header class="ax-gs-210">
        <h1 class="ax-gs-333">🐾 Studio Animaux</h1>
        <span class="ax-gs-3">${PET_SPECIES.length} espèces</span>
      </header>

      <div class="ax-gs-1">
        <h2 class="ax-gs-452">Ration alimentaire</h2>
        <select id="ax-pet-species" class="ax-gs-455">${speciesOpts}</select>
        <input type="number" id="ax-pet-weight" aria-label="Poids de l'animal en kilogrammes" placeholder="Poids (kg)" min="0.001" step="0.01" class="ax-gs-455">
        <select id="ax-pet-activity" class="ax-gs-455">
          <option value="sedentaire">Sédentaire</option>
          <option value="normal" selected>Normal</option>
          <option value="actif">Actif</option>
          <option value="tres-actif">Très actif</option>
        </select>
        <button class="ax-btn ax-btn-primary ax-gs-401" id="ax-pet-calc">Calculer ration</button>
        <div id="ax-pet-out" style="margin-top:12px;color:#c9a227;font-size:14px"></div>
      </div>

      <div class="ax-gs-1">
        <h2 class="ax-gs-452">Âge humain équivalent</h2>
        <input type="number" id="ax-pet-age" aria-label="Âge de l'animal en années" placeholder="Âge animal (années)" min="0" step="0.1" class="ax-gs-455">
        <button class="ax-btn ax-btn-primary ax-gs-401" id="ax-pet-age-btn">Convertir</button>
        <div id="ax-pet-age-out" class="ax-gs-253"></div>
      </div>

      <div class="ax-gs-1">
        <h2 class="ax-gs-452">Espèces — vaccins & alertes</h2>
        ${speciesCardsHtml}
      </div>

      <p class="ax-gs-469">Conseils indicatifs. Pour décision médicale, consulter un vétérinaire.</p>
      <p class="ax-gs-212"><a href="#studios" class="ax-gs-198">← Retour studios</a></p>
    </div>
  `;
  attach(rootEl);
}

function attach(rootEl: HTMLElement): void {
  const calcBtn = rootEl.querySelector<HTMLButtonElement>('#ax-pet-calc');
  const out = rootEl.querySelector<HTMLDivElement>('#ax-pet-out');
  if (calcBtn && out && activeScope) {
    activeScope.bind(calcBtn, 'click', () => {
      haptic.tap();
      const sp = (rootEl.querySelector<HTMLSelectElement>('#ax-pet-species')?.value ?? '') as PetSpecies;
      const w = parseFloat(rootEl.querySelector<HTMLInputElement>('#ax-pet-weight')?.value ?? '');
      const a = (rootEl.querySelector<HTMLSelectElement>('#ax-pet-activity')?.value ?? 'normal') as ActivityLevel;
      const cal = calcDailyCalories(sp, w, a);
      if (cal === null) {
        out.textContent = 'Poids hors plage pour cette espèce.';
        return;
      }
      const info = PET_SPECIES.find((s) => s.id === sp);
      out.innerHTML = `Ration journalière estimée : <strong>${cal} kcal</strong> ${info ? `(${info.emoji} ${escapeHtml(info.name)} · ${w} kg · ${escapeHtml(a)})` : ''}<br><span class="ax-gs-5">Diviser en 2-3 repas. Adapter selon avis véto.</span>`;
    });
  }

  const ageBtn = rootEl.querySelector<HTMLButtonElement>('#ax-pet-age-btn');
  const ageOut = rootEl.querySelector<HTMLDivElement>('#ax-pet-age-out');
  if (ageBtn && ageOut && activeScope) {
    activeScope.bind(ageBtn, 'click', () => {
      haptic.tap();
      const sp = (rootEl.querySelector<HTMLSelectElement>('#ax-pet-species')?.value ?? '') as PetSpecies;
      const age = parseFloat(rootEl.querySelector<HTMLInputElement>('#ax-pet-age')?.value ?? '');
      const human = animalToHumanAge(sp, age);
      if (human === null) {
        ageOut.textContent = 'Âge invalide.';
        return;
      }
      /* v13.4.133 audit-grade : DOM API au lieu d'innerHTML */
      ageOut.textContent = '';
      ageOut.append('Équivalent humain : ');
      const strongHuman = document.createElement('strong');
      strongHuman.textContent = `≈ ${human} ans`;
      ageOut.append(strongHuman);
    });
  }

  logger.info('studios-pet', 'rendered');
}
