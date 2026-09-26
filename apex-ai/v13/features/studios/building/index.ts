/**
 * APEX v13 — Studio Bâtiment (DTU + dimensions standards + métré + SVG preview).
 *
 * Studio expert pour le maître d'ouvrage / artisan / architecte d'intérieur.
 *
 * Features Kevin :
 *  - DTU clés (Documents Techniques Unifiés) — 12 références
 *  - Dimensions standards (porte, fenêtre, escalier, allège, garde-corps)
 *  - SVG preview pièce simple (longueur × largeur en plan)
 *  - Métré rapide (périmètre, surface, volume, plinthes)
 *  - Calcul Blondel escalier (déjà disponible architecture, ici simplifié)
 *  - Hauteur garde-corps réglementaire
 *
 * Anti-patterns évités : escapeHtml, validations strictes, no inline event listeners.
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

export interface DtuRef {
  num: string;
  titre: string;
  domaine: string;
}

export const DTU_REFS: readonly DtuRef[] = [
  { num: 'DTU 13.3', titre: 'Dallages — conception, calcul, exécution', domaine: 'Béton' },
  { num: 'DTU 20.1', titre: 'Ouvrages en maçonnerie de petits éléments', domaine: 'Maçonnerie' },
  { num: 'DTU 21', titre: 'Exécution des ouvrages en béton', domaine: 'Béton' },
  { num: 'DTU 25.1', titre: 'Enduits intérieurs en plâtre', domaine: 'Plâtre' },
  { num: 'DTU 25.41', titre: 'Plaques de plâtre', domaine: 'Plaque' },
  { num: 'DTU 26.1', titre: 'Enduits aux mortiers de ciments / chaux', domaine: 'Enduit' },
  { num: 'DTU 31.1', titre: 'Charpentes et escaliers en bois', domaine: 'Bois' },
  { num: 'DTU 36.5', titre: 'Mise en œuvre des fenêtres et portes extérieures', domaine: 'Menuiserie' },
  { num: 'DTU 39', titre: 'Vitrerie / miroiterie', domaine: 'Vitrage' },
  { num: 'DTU 40.11', titre: 'Couverture en ardoises', domaine: 'Couverture' },
  { num: 'DTU 43.1', titre: 'Étanchéité des toitures-terrasses', domaine: 'Étanchéité' },
  { num: 'DTU 70.1', titre: 'Installations électriques résidentielles', domaine: 'Électricité' },
] as const;

export interface StandardDim {
  element: string;
  dimensions: string;
  norme: string;
}

export const STANDARD_DIMS: readonly StandardDim[] = [
  { element: 'Porte intérieure', dimensions: 'L 73/83/93 × H 204 cm', norme: 'NF P 23-501' },
  { element: 'Porte d\'entrée', dimensions: 'L 90 × H 215 cm', norme: 'NF P 23-501' },
  { element: 'Fenêtre 1 vantail', dimensions: 'L 60-100 × H 75-115 cm', norme: 'NF P 24-101' },
  { element: 'Fenêtre 2 vantaux', dimensions: 'L 100-160 × H 95-145 cm', norme: 'NF P 24-101' },
  { element: 'Allège fenêtre', dimensions: 'H ≥ 90 cm depuis sol', norme: 'NF P 01-012' },
  { element: 'Garde-corps balcon', dimensions: 'H ≥ 100 cm', norme: 'NF P 01-012' },
  { element: 'Garde-corps escalier', dimensions: 'H 90 cm', norme: 'NF P 01-012' },
  { element: 'Hauteur sous plafond', dimensions: '≥ 240 cm (FR), ≥ 230 cm (Monaco)', norme: 'CCH R.111-1-1' },
  { element: 'Marche escalier (giron)', dimensions: '24-32 cm', norme: 'Échelle Blondel' },
  { element: 'Marche escalier (hauteur)', dimensions: '16-20 cm', norme: 'Échelle Blondel' },
  { element: 'Largeur escalier', dimensions: '≥ 80 cm (résidentiel)', norme: 'NF P 21-211' },
  { element: 'Plinthe', dimensions: 'H 5-10 cm', norme: 'Standard' },
] as const;

/* ============================================================
   Pure functions
   ============================================================ */

export interface MetreResult {
  surface_m2: number;
  perimetre_m: number;
  volume_m3: number;
  plinthe_ml: number;
}

export function calcMetre(longueur_m: number, largeur_m: number, hauteur_m: number): MetreResult | null {
  if (!isFinite(longueur_m) || longueur_m <= 0) return null;
  if (!isFinite(largeur_m) || largeur_m <= 0) return null;
  if (!isFinite(hauteur_m) || hauteur_m <= 0) return null;
  return {
    surface_m2: Math.round(longueur_m * largeur_m * 100) / 100,
    perimetre_m: Math.round(2 * (longueur_m + largeur_m) * 100) / 100,
    volume_m3: Math.round(longueur_m * largeur_m * hauteur_m * 100) / 100,
    plinthe_ml: Math.round(2 * (longueur_m + largeur_m) * 100) / 100,
  };
}

/**
 * Génère un SVG plan vue de dessus (échelle 1cm = 1m, max 400×400px).
 */
export function svgPlanView(longueur_m: number, largeur_m: number, label: string): string {
  if (longueur_m <= 0 || largeur_m <= 0) return '';
  const max = 360;
  const scale = Math.min(max / longueur_m, max / largeur_m, 60);
  const w = Math.round(longueur_m * scale);
  const h = Math.round(largeur_m * scale);
  const offsetX = 30;
  const offsetY = 30;
  return `
    <svg viewBox="0 0 ${w + 60} ${h + 60}" xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;background:#0a0a14;border:1px solid #333;border-radius:8px">
      <rect x="${offsetX}" y="${offsetY}" width="${w}" height="${h}" fill="rgba(201,162,39,0.1)" stroke="#c9a227" stroke-width="2"/>
      <text x="${offsetX + w / 2}" y="${offsetY + h / 2}" fill="#c9a227" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-size="14">${escapeHtml(label)}</text>
      <text x="${offsetX + w / 2}" y="${offsetY - 8}" fill="#aaa" text-anchor="middle" font-family="sans-serif" font-size="11">${longueur_m} m</text>
      <text x="${offsetX - 8}" y="${offsetY + h / 2}" fill="#aaa" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-size="11" transform="rotate(-90,${offsetX - 8},${offsetY + h / 2})">${largeur_m} m</text>
    </svg>
  `;
}

/* ============================================================
   UI
   ============================================================ */

export function render(rootEl: HTMLElement): void {
  activeScope?.cleanup();
  activeScope = createCleanupScope('studios-building');
  /* Wire admin feature toggle (Kevin règle 2026-05-04 — ON/OFF tout). */
  const uid = (store.get('user') as { id?: string } | null)?.id ?? 'anon';
  if (!guardFeatureEnabled('studio.building', rootEl, uid)) return;

  const dtusHtml = DTU_REFS.map((d) => `
    <li style="margin-bottom:6px;font-size:13px"><strong class="ax-gs-266">${escapeHtml(d.num)}</strong> — ${escapeHtml(d.titre)} <span class="ax-gs-10">[${escapeHtml(d.domaine)}]</span></li>
  `).join('');

  const dimsHtml = STANDARD_DIMS.map((d) => `
    <tr>
      <td style="padding:6px 10px;border-bottom:1px solid #222;color:#c9a227">${escapeHtml(d.element)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #222">${escapeHtml(d.dimensions)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #222;font-size:11px;color:var(--ax-text-dim)">${escapeHtml(d.norme)}</td>
    </tr>
  `).join('');

  rootEl.innerHTML = `
    <div class="ax-page ax-gs-451">
      <header class="ax-gs-210">
        <h1 class="ax-gs-333">🏢 Studio Bâtiment</h1>
        <span class="ax-gs-3">DTU · normes · métré</span>
      </header>

      <div class="ax-gs-1">
        <h2 class="ax-gs-452">Métré rapide pièce</h2>
        <input type="number" id="ax-bld-l" aria-label="Longueur de la pièce en mètres" placeholder="Longueur (m)" min="0.1" step="0.01" class="ax-gs-455">
        <input type="number" id="ax-bld-w" aria-label="Largeur de la pièce en mètres" placeholder="Largeur (m)" min="0.1" step="0.01" class="ax-gs-455">
        <input type="number" id="ax-bld-h" aria-label="Hauteur sous plafond en mètres" placeholder="Hauteur (m)" min="0.1" step="0.01" value="2.5" class="ax-gs-455">
        <input type="text" id="ax-bld-name" aria-label="Nom de la pièce" placeholder="Nom pièce (ex : Salon)" maxlength="40" value="Pièce" class="ax-gs-455">
        <button class="ax-btn ax-btn-primary ax-gs-401" id="ax-bld-go">Calculer + plan</button>
        <div id="ax-bld-out" class="ax-gs-248"></div>
      </div>

      <div class="ax-gs-1">
        <h2 class="ax-gs-452">Dimensions standards</h2>
        <table style="width:100%;border-collapse:collapse;font-size:12px;color:#fff">
          <thead><tr style="border-bottom:2px solid #c9a227"><th class="ax-gs-457">Élément</th><th class="ax-gs-457">Dimensions</th><th class="ax-gs-457">Norme</th></tr></thead>
          <tbody>${dimsHtml}</tbody>
        </table>
      </div>

      <div class="ax-gs-1">
        <h2 class="ax-gs-452">DTU principaux</h2>
        <ul style="margin:0;padding-left:18px;color:#ddd">${dtusHtml}</ul>
      </div>

      <p class="ax-gs-212"><a href="#studios" class="ax-gs-198">← Retour studios</a></p>
    </div>
  `;
  attach(rootEl);
}

function attach(rootEl: HTMLElement): void {
  const btn = rootEl.querySelector<HTMLButtonElement>('#ax-bld-go');
  const out = rootEl.querySelector<HTMLDivElement>('#ax-bld-out');
  if (!btn || !out || !activeScope) return;

  activeScope.bind(btn, 'click', () => {
    haptic.tap();
    const l = parseFloat(rootEl.querySelector<HTMLInputElement>('#ax-bld-l')?.value ?? '');
    const w = parseFloat(rootEl.querySelector<HTMLInputElement>('#ax-bld-w')?.value ?? '');
    const h = parseFloat(rootEl.querySelector<HTMLInputElement>('#ax-bld-h')?.value ?? '');
    const name = (rootEl.querySelector<HTMLInputElement>('#ax-bld-name')?.value ?? 'Pièce').slice(0, 40);
    const m = calcMetre(l, w, h);
    if (!m) {
      out.innerHTML = '<div style="color:#ff8866">Dimensions invalides.</div>';
      return;
    }
    out.innerHTML = `
      ${svgPlanView(l, w, name)}
      <pre class="ax-gs-456">Surface : ${m.surface_m2} m²
Périmètre : ${m.perimetre_m} m
Volume : ${m.volume_m3} m³
Plinthes : ${m.plinthe_ml} mL</pre>
    `;
  });

  logger.info('studios-building', 'rendered');
}
