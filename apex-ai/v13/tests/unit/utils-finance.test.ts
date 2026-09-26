/**
 * Tests services/apex-tools-dispatch/utils-finance (Kevin v13.4.209).
 *
 * Couvre financeCalculate (4 types) + emailValidate + phoneValidate (FR/MC/INT)
 * + whatsappLink + vatValidateEu + compoundInterest + currencyConvert.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  compoundInterest,
  currencyConvert,
  emailValidate,
  financeCalculate,
  phoneValidate,
  vatValidateEu,
  whatsappLink,
} from '../../services/apex-tools-dispatch/utils-finance.js';

describe('financeCalculate', () => {
  describe('iban_check', () => {
    it('valide IBAN FR (norme ISO 13616 MOD 97)', () => {
      const r = financeCalculate('iban_check', { iban: 'FR1420041010050500013M02606' }) as { valid: boolean; country: string };
      expect(r.valid).toBe(true);
      expect(r.country).toBe('FR');
    });

    it('refuse IBAN trop court', () => {
      const r = financeCalculate('iban_check', { iban: 'FR14' }) as { valid: boolean; reason: string };
      expect(r.valid).toBe(false);
      expect(r.reason).toContain('Longueur');
    });

    it('refuse IBAN trop long (>34 chars)', () => {
      const r = financeCalculate('iban_check', { iban: 'F'.repeat(40) }) as { valid: boolean };
      expect(r.valid).toBe(false);
    });

    it('refuse IBAN MOD 97 incorrect', () => {
      const r = financeCalculate('iban_check', { iban: 'FR9999999999999999999999999' }) as { valid: boolean; country: string };
      expect(r.valid).toBe(false);
      expect(r.country).toBe('FR');
    });

    it('trim whitespace + uppercase', () => {
      const r = financeCalculate('iban_check', { iban: '  fr14 2004 1010 0505 0001 3M02 606  ' }) as { valid: boolean };
      expect(r.valid).toBe(true);
    });
  });

  describe('ir (impôt revenu FR 2026)', () => {
    it('revenu sous seuil 11497 → IR = 0', () => {
      const r = financeCalculate('ir', { revenu: 10000, parts: 1 }) as { ir_total: number; qf: number };
      expect(r.ir_total).toBe(0);
      expect(r.qf).toBe(10000);
    });

    it('revenu 25000 (tranche 11%) → IR calculé', () => {
      const r = financeCalculate('ir', { revenu: 25000, parts: 1 }) as { ir_total: number };
      /* (25000 - 11497) * 0.11 ≈ 1485 */
      expect(r.ir_total).toBeGreaterThan(1400);
      expect(r.ir_total).toBeLessThan(1600);
    });

    it('revenu élevé (200k+) atteint tranche 45%', () => {
      const r = financeCalculate('ir', { revenu: 250000, parts: 1 }) as { ir_total: number };
      expect(r.ir_total).toBeGreaterThan(60000);
    });

    it('couple 2 parts → IR divisé', () => {
      const single = financeCalculate('ir', { revenu: 60000, parts: 1 }) as { ir_total: number };
      const couple = financeCalculate('ir', { revenu: 60000, parts: 2 }) as { ir_total: number };
      expect(couple.ir_total).toBeLessThan(single.ir_total);
    });
  });

  describe('credit (mensualité immo)', () => {
    it('taux 0 → mensualité = capital / durée', () => {
      const r = financeCalculate('credit', { capital: 100000, taux: 0, duree_mois: 100 }) as { mensualite: number };
      expect(r.mensualite).toBe(1000);
    });

    it('taux normal 3% sur 240 mois → mensualité réaliste', () => {
      const r = financeCalculate('credit', { capital: 200000, taux: 3, duree_mois: 240 }) as { mensualite: number; total: number };
      /* ~1100€/mois pour 200k @ 3% 20 ans */
      expect(r.mensualite).toBeGreaterThan(1000);
      expect(r.mensualite).toBeLessThan(1300);
      /* Le total est arrondi à 2 décimales en passant par le calcul exact, pas via mensualité arrondie */
      expect(r.total).toBeGreaterThan(r.mensualite * 240 - 5);
      expect(r.total).toBeLessThan(r.mensualite * 240 + 5);
    });
  });

  describe('plus_value (immo)', () => {
    it('annees < 6 → pas d\'abattement', () => {
      const r = financeCalculate('plus_value', { annees: 3, gain: 100000 }) as { taxable: number; abattement_pct: number };
      expect(r.taxable).toBe(100000);
      expect(r.abattement_pct).toBe(0);
    });

    it('annees ≥ 22 → abattement 100% (taxable=0)', () => {
      const r = financeCalculate('plus_value', { annees: 22, gain: 100000 }) as { taxable: number; abattement_pct: number };
      expect(r.taxable).toBe(0);
      expect(r.abattement_pct).toBe(100);
    });

    it('annees 10 → abattement (10-5)*0.06 = 30%', () => {
      const r = financeCalculate('plus_value', { annees: 10, gain: 100000 }) as { taxable: number; abattement_pct: number };
      expect(r.abattement_pct).toBe(30);
      expect(r.taxable).toBe(70000);
    });
  });

  it('type inconnu → throw', () => {
    expect(() => financeCalculate('unknown_type', {})).toThrow(/Type calcul inconnu/);
  });
});

describe('emailValidate', () => {
  it('email vide → invalid', () => {
    expect(emailValidate('').valid).toBe(false);
  });

  it('email valide → valid + domain', () => {
    const r = emailValidate('kevin@apex.fr');
    expect(r.valid).toBe(true);
    expect(r.domain).toBe('apex.fr');
  });

  it('email sans @ → invalid', () => {
    expect(emailValidate('kevin.apex.fr').valid).toBe(false);
  });

  it('email > 254 chars → trop long', () => {
    const r = emailValidate('a'.repeat(250) + '@b.fr');
    expect(r.valid).toBe(false);
    expect(r.reason).toContain('Trop long');
  });

  it('trim + lowercase domain', () => {
    const r = emailValidate('  KEVIN@APEX.FR  ');
    expect(r.valid).toBe(true);
    expect(r.domain).toBe('apex.fr');
  });
});

describe('phoneValidate', () => {
  it('phone vide → invalid', () => {
    expect(phoneValidate('').valid).toBe(false);
  });

  it('FR 06 12 34 56 78 → +33612345678', () => {
    const r = phoneValidate('06 12 34 56 78');
    expect(r.valid).toBe(true);
    expect(r.normalized).toBe('+33612345678');
  });

  it('FR avec préfix 33 → +33612345678', () => {
    const r = phoneValidate('33612345678');
    expect(r.valid).toBe(true);
    expect(r.normalized).toBe('+33612345678');
  });

  it('FR invalide (8 digits) → false', () => {
    expect(phoneValidate('12345678').valid).toBe(false);
  });

  it('MC 8 digits → +377xxxxxxxx', () => {
    const r = phoneValidate('99777777', 'MC');
    expect(r.valid).toBe(true);
    expect(r.normalized).toBe('+37799777777');
  });

  it('MC préfix 377 → normalize avec +', () => {
    const r = phoneValidate('37799777777', 'MC');
    expect(r.valid).toBe(true);
    expect(r.normalized).toBe('+37799777777');
  });

  it('MC invalide → false', () => {
    expect(phoneValidate('123', 'MC').valid).toBe(false);
  });

  it('international (autre pays) digits 7-15 → +', () => {
    const r = phoneValidate('5551234567', 'US');
    expect(r.valid).toBe(true);
    expect(r.normalized).toBe('+5551234567');
  });

  it('international trop long → false', () => {
    expect(phoneValidate('1'.repeat(20), 'US').valid).toBe(false);
  });

  it('caractères invalides → false', () => {
    expect(phoneValidate('06AB12CD34').valid).toBe(false);
  });
});

describe('whatsappLink', () => {
  it('phone valide sans text', () => {
    const r = whatsappLink('+33612345678');
    expect(r.url).toBe('https://wa.me/33612345678');
    expect(r.phone_clean).toBe('33612345678');
  });

  it('phone avec text → URL encoded', () => {
    const r = whatsappLink('33612345678', 'Hello Apex');
    expect(r.url).toContain('?text=Hello%20Apex');
  });

  it('phone vide → throw', () => {
    expect(() => whatsappLink('')).toThrow(/phone required/);
  });

  it('phone trop court → throw', () => {
    expect(() => whatsappLink('123')).toThrow(/Phone digits invalid/);
  });
});

describe('vatValidateEu', () => {
  it('VAT FR valide', () => {
    const r = vatValidateEu('FR12345678901');
    expect(r.valid).toBe(true);
    expect(r.country).toBe('FR');
    expect(r.format_ok).toBe(true);
  });

  it('VAT format invalide (sans country prefix)', () => {
    expect(vatValidateEu('12345').format_ok).toBe(false);
  });

  it('VAT vide → invalid', () => {
    expect(vatValidateEu('').valid).toBe(false);
  });

  it('VAT pays non-EU (US) → format OK mais pas EU', () => {
    const r = vatValidateEu('US12345');
    expect(r.format_ok).toBe(true);
    expect(r.valid).toBe(false);
  });

  it('VAT XI (Northern Ireland post-Brexit) accepté', () => {
    expect(vatValidateEu('XI12345').valid).toBe(true);
  });

  it('strip whitespace + uppercase', () => {
    expect(vatValidateEu('fr 1234 5678').valid).toBe(true);
  });
});

describe('compoundInterest', () => {
  it('calcul correct avec capitalisation mensuelle (default)', () => {
    const r = compoundInterest(1000, 5, 10);
    /* 1000 * (1 + 0.05/12)^120 ≈ 1647 */
    expect(r.final_value).toBeGreaterThan(1640);
    expect(r.final_value).toBeLessThan(1660);
    expect(r.total_interest).toBe(Math.round((r.final_value - 1000) * 100) / 100);
  });

  it('frequency 1 (annuelle)', () => {
    const r = compoundInterest(1000, 10, 1, 1);
    /* 1000 * 1.10 = 1100 */
    expect(r.final_value).toBe(1100);
  });

  it('effective_rate calculé en %', () => {
    const r = compoundInterest(1000, 6, 1, 12);
    /* (1 + 0.06/12)^12 - 1 ≈ 6.17% */
    expect(r.effective_rate).toBeGreaterThan(6);
    expect(r.effective_rate).toBeLessThan(7);
  });

  it('throw si principal négatif', () => {
    expect(() => compoundInterest(-100, 5, 10)).toThrow(/principal and years must be positive/);
  });

  it('throw si years 0', () => {
    expect(() => compoundInterest(100, 5, 0)).toThrow(/principal and years must be positive/);
  });

  it('frequency min 1 (clamp)', () => {
    const r = compoundInterest(1000, 5, 1, 0); /* freq 0 → clamped to 1 */
    expect(r.final_value).toBe(1050);
  });
});

describe('currencyConvert', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('amount NaN → throw', async () => {
    await expect(currencyConvert(NaN, 'EUR', 'USD')).rejects.toThrow(/amount must be a number/);
  });

  it('codes ISO invalides → error', async () => {
    const r = await currencyConvert(100, 'EU', 'USD');
    expect(r.error).toContain('ISO 4217');
  });

  it('same currency → rate=1 identity', async () => {
    const r = await currencyConvert(100, 'EUR', 'EUR');
    expect(r.converted).toBe(100);
    expect(r.rate).toBe(1);
    expect(r.provider).toBe('identity');
    /* Pas de fetch */
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('conversion réussie via API', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ result: 108.5, info: { rate: 1.085 } }), { status: 200 }),
    );
    const r = await currencyConvert(100, 'EUR', 'USD');
    expect(r.converted).toBe(108.5);
    expect(r.rate).toBe(1.085);
    expect(r.provider).toBe('exchangerate.host');
  });

  it('API HTTP error → error message', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('err', { status: 500 }));
    const r = await currencyConvert(100, 'EUR', 'USD');
    expect(r.error).toContain('HTTP 500');
  });

  it('API sans result → "No rate found"', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const r = await currencyConvert(100, 'EUR', 'USD');
    expect(r.error).toContain('No rate found');
  });

  it('Network error → error from exception', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('connection refused'));
    const r = await currencyConvert(100, 'EUR', 'USD');
    expect(r.error).toBe('connection refused');
  });
});
