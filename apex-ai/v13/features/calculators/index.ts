/**
 * APEX v13 — Feature Calculators Hub (convertisseurs & calculatrices)
 *
 * Port v12 vCalculatorsHub : grille de calculatrices/convertisseurs pro.
 * - Convertisseur unités (longueur, poids, volume, surface, température)
 * - Calculatrice IBAN, BIC validation
 * - Calculatrice IMC, métabolisme
 * - Calculatrice IR France 2026 (simplifié)
 * - Calculatrice plus-value immobilière (abattement 22/30 ans)
 * - Calculatrice intérêts crédit immo
 *
 * Anti-patterns évités :
 * - Tous les calculs vérifiables côté tests (functions pures)
 * - Pas d'API externe (tout local)
 * - escapeHtml partout
 */

import { escapeHtml } from '../../core/escape-html.js';
import { logger } from '../../core/logger.js';
import { store } from '../../core/store.js';
import { guardFeatureEnabled } from '../../services/auth/feature-guard.js';

/* Re-export escapeHtml for backward compatibility (tests import from this module). */
export { escapeHtml };

/**
 * Validate IBAN via mod 97 (ISO 13616).
 * Returns true if checksum valid + length matches country.
 */
export function isValidIban(input: string): boolean {
  const iban = input.replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban)) return false;
  if (iban.length < 15 || iban.length > 34) return false;
  /* Move 4 first chars to end */
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  /* Replace letters by numbers (A=10, B=11, ..., Z=35) */
  const numeric = rearranged.replace(/[A-Z]/g, (c) => (c.charCodeAt(0) - 55).toString());
  /* Mod 97 in pieces (avoid overflow) */
  let remainder = 0;
  for (let i = 0; i < numeric.length; i += 7) {
    const chunk = remainder.toString() + numeric.slice(i, i + 7);
    remainder = parseInt(chunk, 10) % 97;
  }
  return remainder === 1;
}

/**
 * Validate BIC (SWIFT) format : 8 or 11 chars, AAAA-CC-LL-XXX.
 */
export function isValidBic(input: string): boolean {
  const bic = input.replace(/\s/g, '').toUpperCase();
  return /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bic);
}

/**
 * Calcul IMC (kg / m²).
 */
export function calcIMC(weightKg: number, heightCm: number): { imc: number; category: string } {
  if (weightKg <= 0 || heightCm <= 0) return { imc: 0, category: 'invalide' };
  const heightM = heightCm / 100;
  const imc = weightKg / (heightM * heightM);
  let category: string;
  if (imc < 18.5) category = 'maigreur';
  else if (imc < 25) category = 'normal';
  else if (imc < 30) category = 'surpoids';
  else if (imc < 35) category = 'obésité modérée';
  else if (imc < 40) category = 'obésité sévère';
  else category = 'obésité massive';
  return { imc: Math.round(imc * 10) / 10, category };
}

/**
 * Calcul Impôt Revenu France 2026 (barème célibataire, simplifié).
 * Tranches 2026 : 0% jusqu'à 11 497€ ; 11% de 11 498 à 29 315€ ;
 *                 30% de 29 316 à 83 823€ ; 41% de 83 824 à 180 294€ ; 45% au-dessus.
 */
export function calcIR2026(revenu: number): { ir: number; tmi: number; tmm: number } {
  if (revenu <= 0) return { ir: 0, tmi: 0, tmm: 0 };
  const tranches = [
    { max: 11_497, taux: 0 },
    { max: 29_315, taux: 0.11 },
    { max: 83_823, taux: 0.30 },
    { max: 180_294, taux: 0.41 },
    { max: Infinity, taux: 0.45 },
  ];
  let ir = 0;
  let prev = 0;
  let tmi = 0;
  for (const t of tranches) {
    if (revenu > prev) {
      const slice = Math.min(revenu, t.max) - prev;
      ir += slice * t.taux;
      if (revenu > prev) tmi = t.taux;
    }
    prev = t.max;
    if (revenu <= t.max) break;
  }
  const tmm = revenu > 0 ? ir / revenu : 0;
  return { ir: Math.round(ir), tmi: Math.round(tmi * 100), tmm: Math.round(tmm * 1000) / 10 };
}

/**
 * Calcul abattement plus-value immobilière (résidence secondaire).
 * IR : exonération totale après 22 ans. PS : 30 ans.
 */
export function calcPlusValueImmo(
  prixVente: number,
  prixAchat: number,
  anneesDetention: number,
): { pv_brute: number; abat_ir: number; abat_ps: number; ir_du: number; ps_du: number; total_taxe: number; net: number } {
  const pvBrute = Math.max(0, prixVente - prixAchat);
  if (pvBrute === 0 || anneesDetention < 0) {
    return { pv_brute: 0, abat_ir: 0, abat_ps: 0, ir_du: 0, ps_du: 0, total_taxe: 0, net: prixVente };
  }
  /* Abattement IR : 6%/an de 6 à 21 ans, +4% à 22 ans = 100% */
  let abatIr = 0;
  if (anneesDetention >= 22) abatIr = 1;
  else if (anneesDetention > 5) abatIr = (anneesDetention - 5) * 0.06;
  /* Abattement PS : 1.65%/an de 6 à 21 ans, 1.60%/an à 22-29, 9%/an à 30 ans */
  let abatPs = 0;
  if (anneesDetention >= 30) abatPs = 1;
  else if (anneesDetention >= 22) abatPs = 16 * 0.0165 + (anneesDetention - 21) * 0.016;
  else if (anneesDetention > 5) abatPs = (anneesDetention - 5) * 0.0165;
  abatIr = Math.min(1, abatIr);
  abatPs = Math.min(1, abatPs);
  const baseIr = pvBrute * (1 - abatIr);
  const basePs = pvBrute * (1 - abatPs);
  const irDu = baseIr * 0.19;
  const psDu = basePs * 0.172;
  const totalTaxe = irDu + psDu;
  return {
    pv_brute: Math.round(pvBrute),
    abat_ir: Math.round(abatIr * 1000) / 10,
    abat_ps: Math.round(abatPs * 1000) / 10,
    ir_du: Math.round(irDu),
    ps_du: Math.round(psDu),
    total_taxe: Math.round(totalTaxe),
    net: Math.round(prixVente - prixAchat - totalTaxe),
  };
}

/**
 * Calcul mensualité crédit immo (formule classique).
 */
export function calcCreditMensualite(
  capital: number,
  tauxAnnuelPct: number,
  dureeMois: number,
): { mensualite: number; coutTotal: number; interets: number } {
  if (capital <= 0 || dureeMois <= 0) return { mensualite: 0, coutTotal: 0, interets: 0 };
  if (tauxAnnuelPct === 0) {
    const mens = capital / dureeMois;
    return { mensualite: Math.round(mens * 100) / 100, coutTotal: capital, interets: 0 };
  }
  const tauxMensuel = tauxAnnuelPct / 100 / 12;
  const factor = Math.pow(1 + tauxMensuel, dureeMois);
  const mensualite = (capital * tauxMensuel * factor) / (factor - 1);
  const coutTotal = mensualite * dureeMois;
  return {
    mensualite: Math.round(mensualite * 100) / 100,
    coutTotal: Math.round(coutTotal * 100) / 100,
    interets: Math.round((coutTotal - capital) * 100) / 100,
  };
}

/**
 * Conversion unités (longueur, poids, volume, surface).
 */
export const UNIT_CONVERSIONS = {
  /* Longueur en mètres */
  length: { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344 },
  /* Poids en grammes */
  weight: { mg: 0.001, g: 1, kg: 1000, t: 1_000_000, oz: 28.349523125, lb: 453.59237 },
  /* Volume en litres */
  volume: { ml: 0.001, cl: 0.01, dl: 0.1, l: 1, m3: 1000, gal: 3.785411784, fl_oz: 0.0295735296 },
  /* Surface en m² */
  area: { mm2: 0.000001, cm2: 0.0001, m2: 1, km2: 1_000_000, ha: 10_000, sq_ft: 0.09290304 },
} as const;

export type UnitCategory = keyof typeof UNIT_CONVERSIONS;

export function convertUnit<C extends UnitCategory>(
  category: C,
  value: number,
  from: keyof typeof UNIT_CONVERSIONS[C],
  to: keyof typeof UNIT_CONVERSIONS[C],
): number {
  const cat = UNIT_CONVERSIONS[category] as Record<string, number>;
  const fromFactor = cat[from as string];
  const toFactor = cat[to as string];
  if (fromFactor === undefined || toFactor === undefined) return Number.NaN;
  return (value * fromFactor) / toFactor;
}

/**
 * Conversion température (cas spécial : pas linéaire).
 */
export function convertTemperature(value: number, from: 'C' | 'F' | 'K', to: 'C' | 'F' | 'K'): number {
  let celsius: number;
  if (from === 'C') celsius = value;
  else if (from === 'F') celsius = (value - 32) * (5 / 9);
  else celsius = value - 273.15;
  if (to === 'C') return Math.round(celsius * 100) / 100;
  if (to === 'F') return Math.round((celsius * (9 / 5) + 32) * 100) / 100;
  return Math.round((celsius + 273.15) * 100) / 100;
}

export interface CalculatorDef {
  id: string;
  emoji: string;
  label: string;
  description: string;
  category: 'unit' | 'finance' | 'health' | 'validation';
}

export const CALCULATORS: readonly CalculatorDef[] = [
  { id: 'units_length', emoji: '📏', label: 'Longueur', description: 'mm, cm, m, km, in, ft, yd, mi', category: 'unit' },
  { id: 'units_weight', emoji: '⚖️', label: 'Poids', description: 'mg, g, kg, t, oz, lb', category: 'unit' },
  { id: 'units_volume', emoji: '🥤', label: 'Volume', description: 'ml, l, m³, gal, fl_oz', category: 'unit' },
  { id: 'units_area', emoji: '🟦', label: 'Surface', description: 'cm², m², km², ha, sq_ft', category: 'unit' },
  { id: 'units_temp', emoji: '🌡️', label: 'Température', description: '°C, °F, K', category: 'unit' },
  { id: 'imc', emoji: '🏃', label: 'IMC', description: 'Indice masse corporelle', category: 'health' },
  { id: 'ir_2026', emoji: '🇫🇷', label: 'Impôt Revenu 2026', description: 'Barème France célibataire', category: 'finance' },
  { id: 'pv_immo', emoji: '🏠', label: 'Plus-value immo', description: 'Abattement 22/30 ans', category: 'finance' },
  { id: 'credit_immo', emoji: '🏦', label: 'Crédit immobilier', description: 'Mensualité + intérêts', category: 'finance' },
  { id: 'iban', emoji: '🏧', label: 'Vérif IBAN', description: 'Validation mod 97', category: 'validation' },
  { id: 'bic', emoji: '🌍', label: 'Vérif BIC/SWIFT', description: 'Format 8 ou 11 chars', category: 'validation' },
] as const;

export function render(rootEl: HTMLElement): void {
  /* Wire admin feature toggle (Kevin règle 2026-05-04 — ON/OFF tout). */
  const uid = (store.get('user') as { id?: string } | null)?.id ?? 'anon';
  if (!guardFeatureEnabled('module.calculators', rootEl, uid)) return;
  const cards = CALCULATORS.map((c) => `
    <div class="ax-calc-card" data-calc-id="${escapeHtml(c.id)}" style="cursor:pointer;background:rgba(201,162,39,0.05);border:1px solid rgba(201,162,39,0.3);border-radius:12px;padding:14px;text-align:center">
      <div class="ax-gs-28">${c.emoji}</div>
      <div style="font-weight:700;color:#c9a227;margin-top:6px;font-size:14px">${escapeHtml(c.label)}</div>
      <div style="font-size:11px;color:var(--ax-text-dim);margin-top:4px">${escapeHtml(c.description)}</div>
    </div>
  `).join('');

  rootEl.innerHTML = `
    <div class="ax-page ax-gs-332">
      <header class="ax-gs-217">
        <h1 class="ax-gs-333">🧮 Calculatrices & Convertisseurs</h1>
        <p style="color:var(--ax-text-dim);font-size:13px;margin:4px 0 0">${CALCULATORS.length} outils ${[...new Set(CALCULATORS.map((c) => c.category))].length} catégories</p>
      </header>

      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px">${cards}</div>

      <div id="ax-calc-detail" class="ax-gs-218"></div>

      <p class="ax-gs-212"><a href="#chat" class="ax-gs-198">← Retour chat</a></p>
    </div>
  `;
  attachHandlers(rootEl);
}

function attachHandlers(rootEl: HTMLElement): void {
  rootEl.querySelectorAll<HTMLElement>('.ax-calc-card').forEach((card) => {
    card.addEventListener('click', () => {
      const id = card.dataset['calcId'];
      if (!id) return;
      const detailEl = rootEl.querySelector<HTMLElement>('#ax-calc-detail');
      if (!detailEl) return;
      detailEl.innerHTML = renderCalcDetail(id);
      logger.info('calculators', 'opened', { id });
    });
  });
}

function renderCalcDetail(id: string): string {
  const calc = CALCULATORS.find((c) => c.id === id);
  if (!calc) return '';
  return `
    <div style="background:rgba(201,162,39,0.05);border:1px solid rgba(201,162,39,0.3);border-radius:12px;padding:20px">
      <h2 style="color:#c9a227;margin:0 0 8px">${calc.emoji} ${escapeHtml(calc.label)}</h2>
      <p style="color:var(--ax-text-dim);font-size:13px;margin:0 0 12px">${escapeHtml(calc.description)}</p>
      <p style="color:var(--ax-text-dim);font-size:12px">UI interactive disponible Sprint 5 — fonctions calcul exposées via API <code>calcIR2026()</code>, <code>calcIMC()</code>, etc.</p>
    </div>
  `;
}
