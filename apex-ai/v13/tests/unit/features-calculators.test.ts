/**
 * Tests features/calculators (port v12 vCalculatorsHub).
 */
import { describe, expect, it } from 'vitest';

import {
  CALCULATORS,
  calcCreditMensualite,
  calcIMC,
  calcIR2026,
  calcPlusValueImmo,
  convertTemperature,
  convertUnit,
  escapeHtml,
  isValidBic,
  isValidIban,
} from '../../features/calculators/index.js';

describe('features/calculators — IBAN', () => {
  it('valide IBAN français correct (test vector ECBS)', () => {
    /* IBAN test FR officiel ECBS */
    expect(isValidIban('FR1420041010050500013M02606')).toBe(true);
  });

  it('valide IBAN avec espaces (GB)', () => {
    expect(isValidIban('GB82 WEST 1234 5698 7654 32')).toBe(true);
  });

  it('valide IBAN allemand (test vector)', () => {
    expect(isValidIban('DE89370400440532013000')).toBe(true);
  });

  it('refuse IBAN trop court', () => {
    expect(isValidIban('FR12')).toBe(false);
  });

  it('refuse format invalide', () => {
    expect(isValidIban('not_an_iban')).toBe(false);
    expect(isValidIban('')).toBe(false);
  });

  it('refuse checksum invalide', () => {
    expect(isValidIban('FR99 9999 9999 9999 9999 9999 999')).toBe(false);
  });
});

describe('features/calculators — BIC', () => {
  it('valide BIC 8 chars', () => {
    expect(isValidBic('BNPAFRPP')).toBe(true);
  });

  it('valide BIC 11 chars', () => {
    expect(isValidBic('BNPAFRPPXXX')).toBe(true);
  });

  it('refuse longueur invalide', () => {
    expect(isValidBic('BNPA')).toBe(false);
    expect(isValidBic('BNPAFRPPXXXY')).toBe(false);
  });

  it('refuse caractères invalides', () => {
    expect(isValidBic('123456FRPP')).toBe(false);
  });
});

describe('features/calculators — IMC', () => {
  it('calcule IMC normal', () => {
    const r = calcIMC(70, 175);
    expect(r.imc).toBeCloseTo(22.9, 0);
    expect(r.category).toBe('normal');
  });

  it('détecte maigreur', () => {
    expect(calcIMC(50, 175).category).toBe('maigreur');
  });

  it('détecte surpoids', () => {
    expect(calcIMC(85, 175).category).toBe('surpoids');
  });

  it('détecte obésité', () => {
    expect(calcIMC(120, 175).category).toContain('obésité');
  });

  it('refuse valeurs invalides', () => {
    expect(calcIMC(0, 175).category).toBe('invalide');
    expect(calcIMC(70, 0).category).toBe('invalide');
  });
});

describe('features/calculators — IR 2026', () => {
  it('zéro impôt si revenu < seuil', () => {
    expect(calcIR2026(10_000).ir).toBe(0);
    expect(calcIR2026(11_000).ir).toBe(0);
  });

  it('calcule IR pour 30 000€', () => {
    const r = calcIR2026(30_000);
    expect(r.ir).toBeGreaterThan(1900);
    expect(r.ir).toBeLessThan(2200);
    expect(r.tmi).toBe(30);
  });

  it('calcule IR pour 100 000€ (tranche 41%)', () => {
    const r = calcIR2026(100_000);
    expect(r.tmi).toBe(41);
    expect(r.ir).toBeGreaterThan(20_000);
  });

  it('TMM < TMI (taux moyen plus bas que marginal)', () => {
    const r = calcIR2026(50_000);
    expect(r.tmm).toBeLessThan(r.tmi);
  });

  it('refuse revenu négatif/zéro', () => {
    expect(calcIR2026(0).ir).toBe(0);
    expect(calcIR2026(-1000).ir).toBe(0);
  });
});

describe('features/calculators — Plus-value immo', () => {
  it('exonération totale après 30 ans', () => {
    const r = calcPlusValueImmo(300_000, 200_000, 30);
    expect(r.abat_ir).toBe(100);
    expect(r.abat_ps).toBe(100);
    expect(r.total_taxe).toBe(0);
  });

  it('exonération IR seulement à 22 ans', () => {
    const r = calcPlusValueImmo(300_000, 200_000, 22);
    expect(r.abat_ir).toBe(100);
    expect(r.abat_ps).toBeLessThan(100);
    expect(r.ir_du).toBe(0);
    expect(r.ps_du).toBeGreaterThan(0);
  });

  it('aucune abattement avant 6 ans', () => {
    const r = calcPlusValueImmo(300_000, 200_000, 5);
    expect(r.abat_ir).toBe(0);
    expect(r.abat_ps).toBe(0);
  });

  it('pas de plus-value si vente <= achat', () => {
    expect(calcPlusValueImmo(200_000, 200_000, 10).pv_brute).toBe(0);
    expect(calcPlusValueImmo(150_000, 200_000, 10).pv_brute).toBe(0);
  });
});

describe('features/calculators — Crédit immo', () => {
  it('calcule mensualité 200k 25 ans 3%', () => {
    const r = calcCreditMensualite(200_000, 3.0, 25 * 12);
    expect(r.mensualite).toBeGreaterThan(940);
    expect(r.mensualite).toBeLessThan(960);
    expect(r.interets).toBeGreaterThan(80_000);
  });

  it('taux 0% : mensualité = capital / mois', () => {
    const r = calcCreditMensualite(120_000, 0, 120);
    expect(r.mensualite).toBe(1000);
    expect(r.interets).toBe(0);
  });

  it('refuse capital ou durée invalide', () => {
    expect(calcCreditMensualite(0, 3, 240).mensualite).toBe(0);
    expect(calcCreditMensualite(100_000, 3, 0).mensualite).toBe(0);
  });
});

describe('features/calculators — convertUnit', () => {
  it('convertit km → m', () => {
    expect(convertUnit('length', 1, 'km', 'm')).toBe(1000);
  });

  it('convertit kg → g', () => {
    expect(convertUnit('weight', 1, 'kg', 'g')).toBe(1000);
  });

  it('convertit l → ml', () => {
    expect(convertUnit('volume', 1, 'l', 'ml')).toBe(1000);
  });

  it('convertit m² → cm²', () => {
    expect(convertUnit('area', 1, 'm2', 'cm2')).toBe(10000);
  });

  it('retourne NaN si unité invalide', () => {
    expect(Number.isNaN(convertUnit('length', 1, 'XX' as never, 'm'))).toBe(true);
  });
});

describe('features/calculators — convertTemperature', () => {
  it('0°C = 32°F = 273.15K', () => {
    expect(convertTemperature(0, 'C', 'F')).toBe(32);
    expect(convertTemperature(0, 'C', 'K')).toBe(273.15);
  });

  it('100°C = 212°F = 373.15K', () => {
    expect(convertTemperature(100, 'C', 'F')).toBe(212);
    expect(convertTemperature(100, 'C', 'K')).toBe(373.15);
  });

  it('roundtrip C→F→C', () => {
    const f = convertTemperature(25, 'C', 'F');
    const c = convertTemperature(f, 'F', 'C');
    expect(c).toBe(25);
  });

  it('roundtrip C→K→C', () => {
    const k = convertTemperature(25, 'C', 'K');
    const c = convertTemperature(k, 'K', 'C');
    expect(c).toBe(25);
  });
});

describe('features/calculators — registry', () => {
  it('liste 11+ calculatrices', () => {
    expect(CALCULATORS.length).toBeGreaterThanOrEqual(11);
  });

  it('chaque calc a id, emoji, label', () => {
    for (const c of CALCULATORS) {
      expect(c.id).toBeTruthy();
      expect(c.emoji.length).toBeGreaterThan(0);
      expect(c.label).toBeTruthy();
    }
  });

  it('catégories valides', () => {
    const valid = new Set(['unit', 'finance', 'health', 'validation']);
    for (const c of CALCULATORS) {
      expect(valid.has(c.category)).toBe(true);
    }
  });
});

describe('features/calculators — escapeHtml', () => {
  it('échappe HTML', () => {
    expect(escapeHtml('<x>')).toBe('&lt;x&gt;');
  });
});
