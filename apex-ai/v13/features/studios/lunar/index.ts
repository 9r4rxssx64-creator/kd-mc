/**
 * APEX v13 — Studio Jardin Lunaire (calendrier biodynamique).
 *
 * Studio expert pour le jardinier qui suit les phases de la Lune.
 *
 * Features Kevin :
 *  - Phase Lune calculée pour date donnée (algo Conway/Méton — précision ±1 jour)
 *  - Recommandations biodynamie selon phase (semer, planter, tailler, récolter)
 *  - Lune montante / descendante (constellation zodiacale simplifiée)
 *  - 7 jours à venir pré-calculés
 *  - Prochaine pleine lune / nouvelle lune
 *
 * Anti-patterns évités : pas de fetch externe (algo offline), TS strict.
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

export type LunarPhase = 'new' | 'waxing-crescent' | 'first-quarter' | 'waxing-gibbous' | 'full' | 'waning-gibbous' | 'last-quarter' | 'waning-crescent';

export interface LunarInfo {
  phase: LunarPhase;
  phase_label: string;
  emoji: string;
  age_days: number; /* 0–29.5 jours depuis nouvelle lune */
  illumination_pct: number; /* 0–100 */
  rising: boolean; /* lune montante = ascension dans le ciel jour après jour */
}

const SYNODIC_MONTH = 29.530588853;
/** Référence : nouvelle lune du 6 janvier 2000 18:14 UTC. */
const NEW_MOON_REF = Date.UTC(2000, 0, 6, 18, 14);

/* ============================================================
   Pure calculations
   ============================================================ */

/**
 * Phase lunaire à une date donnée (algo synodique simple).
 * Précision ±1 jour suffisante pour conseils jardinage.
 */
export function getLunarInfo(date: Date): LunarInfo {
  const ms = date.getTime() - NEW_MOON_REF;
  const days = ms / 86_400_000;
  let age = days % SYNODIC_MONTH;
  if (age < 0) age += SYNODIC_MONTH;
  const ratio = age / SYNODIC_MONTH;
  /* Illumination ~ (1 - cos(2π * ratio)) / 2 */
  const ill = Math.round(((1 - Math.cos(2 * Math.PI * ratio)) / 2) * 100);

  let phase: LunarPhase;
  let label: string;
  let emoji: string;
  if (age < 1.84) { phase = 'new'; label = 'Nouvelle lune'; emoji = '🌑'; }
  else if (age < 5.53) { phase = 'waxing-crescent'; label = 'Premier croissant'; emoji = '🌒'; }
  else if (age < 9.22) { phase = 'first-quarter'; label = 'Premier quartier'; emoji = '🌓'; }
  else if (age < 12.91) { phase = 'waxing-gibbous'; label = 'Lune gibbeuse croissante'; emoji = '🌔'; }
  else if (age < 16.61) { phase = 'full'; label = 'Pleine lune'; emoji = '🌕'; }
  else if (age < 20.30) { phase = 'waning-gibbous'; label = 'Lune gibbeuse décroissante'; emoji = '🌖'; }
  else if (age < 23.99) { phase = 'last-quarter'; label = 'Dernier quartier'; emoji = '🌗'; }
  else { phase = 'waning-crescent'; label = 'Dernier croissant'; emoji = '🌘'; }

  /* Lune montante / descendante : approximation par déclinaison.
   * Cycle ~27.3 jours (mois sidéral). Ici simplification : alterne tous les ~13 jours. */
  const sidereal = 27.32166;
  const sidAge = ((date.getTime() - NEW_MOON_REF) / 86_400_000) % sidereal;
  const rising = ((sidAge + sidereal) % sidereal) < (sidereal / 2);

  return {
    phase,
    phase_label: label,
    emoji,
    age_days: Math.round(age * 10) / 10,
    illumination_pct: ill,
    rising,
  };
}

/**
 * Conseils biodynamie selon phase + montante/descendante.
 */
export function getBiodynamicAdvice(info: LunarInfo): readonly string[] {
  const advice: string[] = [];
  /* Phase */
  switch (info.phase) {
    case 'new':
      advice.push('🌑 Nouvelle lune : repos. Préparer le sol, désherber, composter.');
      break;
    case 'waxing-crescent':
    case 'first-quarter':
    case 'waxing-gibbous':
      advice.push('🌱 Lune croissante : semer, greffer, planter (sève monte).');
      break;
    case 'full':
      advice.push('🌕 Pleine lune : récolter herbes aromatiques (parfum max), éviter tailles importantes.');
      break;
    case 'waning-gibbous':
    case 'last-quarter':
    case 'waning-crescent':
      advice.push('✂ Lune décroissante : tailler, élaguer, récolter racines, conserves.');
      break;
  }
  /* Ascension */
  if (info.rising) {
    advice.push('⬆ Lune montante : récolter fruits/légumes-feuilles. Gain de saveur.');
  } else {
    advice.push('⬇ Lune descendante : planter, repiquer, tailler. Sève descend = enracinement.');
  }
  return advice;
}

/**
 * Cherche la prochaine date d'une phase donnée (pleine ou nouvelle).
 */
export function nextPhaseDate(from: Date, target: 'new' | 'full'): Date {
  const targetAge = target === 'new' ? 0 : 14.77;
  for (let d = 0; d < 35; d++) {
    const test = new Date(from.getTime() + d * 86_400_000);
    const info = getLunarInfo(test);
    if (target === 'new' && info.phase === 'new') return test;
    if (target === 'full' && info.phase === 'full') return test;
    /* Fallback : minimise distance à target age */
    if (Math.abs(info.age_days - targetAge) < 0.5) return test;
  }
  return new Date(from.getTime() + 14 * 86_400_000);
}

/**
 * 7 jours à venir avec phase + recommandation principale.
 */
export function nextSevenDays(from: Date): readonly { date: Date; info: LunarInfo; advice: string }[] {
  const out: { date: Date; info: LunarInfo; advice: string }[] = [];
  for (let d = 0; d < 7; d++) {
    const date = new Date(from.getTime() + d * 86_400_000);
    const info = getLunarInfo(date);
    const advice = getBiodynamicAdvice(info)[0] ?? '';
    out.push({ date, info, advice });
  }
  return out;
}

/* ============================================================
   UI
   ============================================================ */

export function render(rootEl: HTMLElement): void {
  activeScope?.cleanup();
  activeScope = createCleanupScope('studios-lunar');
  /* Wire admin feature toggle (Kevin règle 2026-05-04 — ON/OFF tout). */
  const uid = (store.get('user') as { id?: string } | null)?.id ?? 'anon';
  if (!guardFeatureEnabled('studio.lunar', rootEl, uid)) return;
  const today = new Date();
  const info = getLunarInfo(today);
  const advice = getBiodynamicAdvice(info);
  const nextFull = nextPhaseDate(today, 'full');
  const nextNew = nextPhaseDate(today, 'new');
  const week = nextSevenDays(today);

  const fmt = (d: Date): string => d.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' });

  rootEl.innerHTML = `
    <div class="ax-page ax-gs-451">
      <header class="ax-gs-210">
        <h1 class="ax-gs-333">🌙 Studio Jardin Lunaire</h1>
        <span class="ax-gs-3">Biodynamie</span>
      </header>

      <div style="background:rgba(201,162,39,0.05);border:1px solid rgba(201,162,39,0.3);border-radius:12px;padding:14px;margin-bottom:16px;text-align:center">
        <div class="ax-gs-171">${info.emoji}</div>
        <h2 style="margin:6px 0;color:#c9a227">${escapeHtml(info.phase_label)}</h2>
        <div class="ax-gs-3">
          Âge ${info.age_days} jours · Illumination ${info.illumination_pct}% · ${info.rising ? '⬆ Montante' : '⬇ Descendante'}
        </div>
      </div>

      <div class="ax-gs-1">
        <h2 class="ax-gs-452">Conseils du jour</h2>
        <ul style="margin:0;padding-left:18px;color:#ddd;font-size:14px;line-height:1.8">
          ${advice.map((a) => `<li>${escapeHtml(a)}</li>`).join('')}
        </ul>
      </div>

      <div class="ax-gs-1">
        <h2 class="ax-gs-452">Prochaines phases</h2>
        <div style="font-size:13px;color:#ddd;line-height:1.7">
          🌕 Prochaine pleine lune : <strong class="ax-gs-266">${fmt(nextFull)}</strong><br>
          🌑 Prochaine nouvelle lune : <strong class="ax-gs-266">${fmt(nextNew)}</strong>
        </div>
      </div>

      <div class="ax-gs-1">
        <h2 class="ax-gs-452">7 jours à venir</h2>
        <div class="ax-gs-29">
          ${week.map((w) => `
            <div style="display:flex;align-items:center;gap:10px;padding:6px 10px;background:rgba(255,255,255,0.02);border-radius:6px">
              <span class="ax-gs-170">${w.info.emoji}</span>
              <div class="ax-gs-26">
                <div style="color:#c9a227;font-weight:700;font-size:13px">${fmt(w.date)}</div>
                <div class="ax-gs-136">${escapeHtml(w.advice)}</div>
              </div>
              <span class="ax-gs-124">${w.info.illumination_pct}%</span>
            </div>
          `).join('')}
        </div>
      </div>

      <p class="ax-gs-469">Précision algo ±1 jour. Pour usage agricole strict consulter calendrier biodynamique officiel.</p>
      <p class="ax-gs-212"><a href="#studios" class="ax-gs-198">← Retour studios</a></p>
    </div>
  `;

  /* Touche tactile sur la grosse lune pour rafraîchir */
  const moonEl = rootEl.querySelector<HTMLDivElement>('.ax-page > div:nth-child(2)');
  if (moonEl && activeScope) {
    activeScope.bind(moonEl, 'click', () => {
      haptic.tap();
      render(rootEl);
    });
  }

  logger.info('studios-lunar', 'rendered', { phase: info.phase, illumination: info.illumination_pct });
}
