/**
 * Tests features/studios/invoice — boost v13 (multi-devise, multi-pays TVA,
 * récurrence, FACTUR-X, IBAN mod-97, EU VAT, dunning, credit note).
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import {
  CURRENCY_SYMBOLS,
  FALLBACK_RATES_TO_EUR,
  INDUSTRY_DEFAULTS,
  MENTIONS_LEGALES,
  REMINDER_SCHEDULE_DAYS,
  TVA_RATES_BY_COUNTRY,
  calcLineTotalHT,
  calcTotals,
  convertCurrency,
  createInvoice,
  exportFacturX,
  formatCurrency,
  generateInvoiceNumber,
  invoiceStudioStore,
  isValidEUVAT,
  isValidIBAN,
  isValidTVARate,
  nextRecurrenceDate,
  nextReminderDate,
  type Invoice,
  type InvoiceLine,
} from '../../features/studios/invoice/index.js';

const TEST_UID = 'test_inv_boost_uid';

describe('features/studios/invoice boost — TVA multi-pays', () => {
  it('FR, MC, BE, CH, CA, LU, DE, ES, IT couverts', () => {
    expect(TVA_RATES_BY_COUNTRY.FR).toContain(20);
    expect(TVA_RATES_BY_COUNTRY.MC).toContain(20); /* aligné FR */
    expect(TVA_RATES_BY_COUNTRY.BE).toContain(21);
    expect(TVA_RATES_BY_COUNTRY.CH).toContain(8.1);
    expect(TVA_RATES_BY_COUNTRY.CA).toContain(15);
    expect(TVA_RATES_BY_COUNTRY.DE).toContain(19);
    expect(TVA_RATES_BY_COUNTRY.ES).toContain(21);
    expect(TVA_RATES_BY_COUNTRY.IT).toContain(22);
    expect(TVA_RATES_BY_COUNTRY.LU).toContain(17);
  });

  it('isValidTVARate(rate, country) accepte taux pays', () => {
    expect(isValidTVARate(21, 'BE')).toBe(true);
    expect(isValidTVARate(20, 'BE')).toBe(false); /* pas en BE */
    expect(isValidTVARate(8.1, 'CH')).toBe(true);
    expect(isValidTVARate(20, 'CH')).toBe(false); /* pas en CH */
  });

  it('MENTIONS_LEGALES définies pour les 9 pays', () => {
    expect(MENTIONS_LEGALES.FR.length).toBeGreaterThan(0);
    expect(MENTIONS_LEGALES.MC.length).toBeGreaterThan(0);
    expect(MENTIONS_LEGALES.BE.length).toBeGreaterThan(0);
  });

  it('FR mentions légales contiennent pénalités L441-10', () => {
    const m = MENTIONS_LEGALES.FR.join(' ').toLowerCase();
    expect(m).toContain('pénalit');
    expect(m).toContain('l441');
  });
});

describe('features/studios/invoice boost — multi-devise', () => {
  it('CURRENCY_SYMBOLS: EUR=€, USD=$, GBP=£, CHF=CHF, MAD=MAD', () => {
    expect(CURRENCY_SYMBOLS.EUR).toBe('€');
    expect(CURRENCY_SYMBOLS.USD).toBe('$');
    expect(CURRENCY_SYMBOLS.GBP).toBe('£');
    expect(CURRENCY_SYMBOLS.CHF).toBe('CHF');
    expect(CURRENCY_SYMBOLS.MAD).toBe('MAD');
  });

  it('convertCurrency: same currency = pas de change', () => {
    expect(convertCurrency(100, 'EUR', 'EUR')).toBe(100);
  });

  it('convertCurrency: USD → EUR via taux fallback', () => {
    /* 100 USD * 0.92 = 92 EUR */
    const r = convertCurrency(100, 'USD', 'EUR');
    expect(r).toBeCloseTo(92, 0);
  });

  it('convertCurrency: arrondi 2 décimales', () => {
    const r = convertCurrency(33.33, 'USD', 'EUR');
    expect(r * 100).toBe(Math.round(r * 100));
  });

  it('formatCurrency: format avec symbole', () => {
    expect(formatCurrency(99.5, 'EUR')).toContain('€');
    expect(formatCurrency(100, 'USD')).toContain('$');
  });

  it('formatCurrency: 0 si NaN', () => {
    expect(formatCurrency(NaN, 'EUR')).toContain('0');
  });

  it('FALLBACK_RATES_TO_EUR contient toutes devises', () => {
    expect(FALLBACK_RATES_TO_EUR.EUR).toBe(1);
    expect(FALLBACK_RATES_TO_EUR.USD).toBeGreaterThan(0);
    expect(FALLBACK_RATES_TO_EUR.GBP).toBeGreaterThan(0);
  });
});

describe('features/studios/invoice boost — IBAN + VAT EU validation', () => {
  it('isValidIBAN: FR IBAN valide (mod-97)', () => {
    /* FR76 1234 5678 9012 3456 7890 189 → exemple modulé */
    expect(isValidIBAN('FR1420041010050500013M02606')).toBe(true);
  });

  it('isValidIBAN: format incorrect refusé', () => {
    expect(isValidIBAN('123')).toBe(false);
    expect(isValidIBAN('XX0099999999')).toBe(false);
  });

  it('isValidIBAN: vide refusé', () => {
    expect(isValidIBAN('')).toBe(false);
  });

  it('isValidEUVAT: format FR12345678901', () => {
    expect(isValidEUVAT('FR12345678901')).toBe(true);
    expect(isValidEUVAT('BE0123456789')).toBe(true);
  });

  it('isValidEUVAT: format incorrect refusé', () => {
    expect(isValidEUVAT('123')).toBe(false);
    expect(isValidEUVAT('FR123')).toBe(false);
  });
});

describe('features/studios/invoice boost — récurrence', () => {
  it('nextRecurrenceDate: monthly +1 mois', () => {
    const next = nextRecurrenceDate('2026-01-15', 'monthly');
    expect(next).toBe('2026-02-15');
  });

  it('nextRecurrenceDate: quarterly +3 mois', () => {
    const next = nextRecurrenceDate('2026-01-15', 'quarterly');
    expect(next).toBe('2026-04-15');
  });

  it('nextRecurrenceDate: yearly +1 an', () => {
    const next = nextRecurrenceDate('2026-01-15', 'yearly');
    expect(next).toBe('2027-01-15');
  });

  it('nextRecurrenceDate: none → null', () => {
    expect(nextRecurrenceDate('2026-01-15', 'none')).toBeNull();
  });

  it('nextRecurrenceDate: date invalide → null', () => {
    expect(nextRecurrenceDate('not-a-date', 'monthly')).toBeNull();
  });
});

describe('features/studios/invoice boost — relances (dunning)', () => {
  it('REMINDER_SCHEDULE_DAYS: 15, 30, 45 jours', () => {
    expect(REMINDER_SCHEDULE_DAYS).toEqual([15, 30, 45]);
  });

  it('nextReminderDate: facture overdue → première relance J+15 après dueDate', () => {
    const inv: Invoice = {
      id: '1', type: 'facture', number: 'F1',
      date: '2025-01-01', dueDate: '2025-02-01',
      status: 'overdue', currency: 'EUR', country: 'FR',
      industryTemplate: 'standard', recurrence: 'none', parentInvoiceId: null,
      client: { nom: '', adresse: '', siret: '', tvaNumber: '', email: '', iban: '' },
      emetteur: { nom: '', adresse: '', siret: '', tvaNumber: '', iban: '', bic: '' },
      lines: [], notes: '', paymentLink: '', remindersSentAt: [],
    };
    const r = nextReminderDate(inv);
    expect(r).not.toBeNull();
    expect(r?.date).toBe('2025-02-16');
    expect(r?.index).toBe(0);
  });

  it('nextReminderDate: facture payée → null', () => {
    const inv: Invoice = {
      id: '1', type: 'facture', number: 'F1',
      date: '2025-01-01', dueDate: '2025-02-01',
      status: 'paid', currency: 'EUR', country: 'FR',
      industryTemplate: 'standard', recurrence: 'none', parentInvoiceId: null,
      client: { nom: '', adresse: '', siret: '', tvaNumber: '', email: '', iban: '' },
      emetteur: { nom: '', adresse: '', siret: '', tvaNumber: '', iban: '', bic: '' },
      lines: [], notes: '', paymentLink: '', remindersSentAt: [],
    };
    expect(nextReminderDate(inv)).toBeNull();
  });

  it('nextReminderDate: 3 relances déjà envoyées → null', () => {
    const inv: Invoice = {
      id: '1', type: 'facture', number: 'F1',
      date: '2025-01-01', dueDate: '2025-02-01',
      status: 'overdue', currency: 'EUR', country: 'FR',
      industryTemplate: 'standard', recurrence: 'none', parentInvoiceId: null,
      client: { nom: '', adresse: '', siret: '', tvaNumber: '', email: '', iban: '' },
      emetteur: { nom: '', adresse: '', siret: '', tvaNumber: '', iban: '', bic: '' },
      lines: [], notes: '', paymentLink: '', remindersSentAt: [1, 2, 3],
    };
    expect(nextReminderDate(inv)).toBeNull();
  });
});

describe('features/studios/invoice boost — FACTUR-X export', () => {
  it('exportFacturX: format CII-EN16931', () => {
    const inv = createInvoice('facture', 0);
    const r = exportFacturX(inv);
    expect(r.format).toBe('CII-EN16931');
    expect(r.data['profile']).toBe('EN16931');
  });

  it('exportFacturX: contient seller, buyer, lines, totals', () => {
    const inv = createInvoice('facture', 0);
    const r = exportFacturX(inv);
    expect(r.data['seller']).toBeDefined();
    expect(r.data['buyer']).toBeDefined();
    expect(r.data['lines']).toBeDefined();
    expect(r.data['totals']).toBeDefined();
  });

  it('exportFacturX: lines mappées (description, quantity, unitPrice)', () => {
    const inv = createInvoice('facture', 0);
    inv.lines[0] = {
      id: 'l1', description: 'Test', quantity: 2, unitPriceHT: 50, tvaRate: 20, discountPercent: 0,
    };
    const r = exportFacturX(inv);
    const lines = r.data['lines'] as Array<{ description: string; quantity: number; unitPrice: number }>;
    expect(lines[0]?.description).toBe('Test');
    expect(lines[0]?.quantity).toBe(2);
  });
});

describe('features/studios/invoice boost — industry templates', () => {
  it('INDUSTRY_DEFAULTS: 6 métiers définis', () => {
    expect(Object.keys(INDUSTRY_DEFAULTS).length).toBeGreaterThanOrEqual(6);
    expect(INDUSTRY_DEFAULTS.standard).toBeDefined();
    expect(INDUSTRY_DEFAULTS.freelance).toBeDefined();
    expect(INDUSTRY_DEFAULTS.ecommerce).toBeDefined();
    expect(INDUSTRY_DEFAULTS.restauration).toBeDefined();
    expect(INDUSTRY_DEFAULTS.btp).toBeDefined();
    expect(INDUSTRY_DEFAULTS.conseil).toBeDefined();
  });

  it('btp utilise TVA 10% par défaut (travaux)', () => {
    expect(INDUSTRY_DEFAULTS.btp.tvaDefault).toBe(10);
  });

  it('restauration utilise TVA 10% par défaut', () => {
    expect(INDUSTRY_DEFAULTS.restauration.tvaDefault).toBe(10);
  });

  it('createInvoice avec industryTemplate "btp" → ligne TVA 10', () => {
    const inv = createInvoice('facture', 0, { industryTemplate: 'btp' });
    expect(inv.lines[0]?.tvaRate).toBe(10);
  });

  it('createInvoice avec country "MC" → currency EUR par défaut', () => {
    const inv = createInvoice('facture', 0, { country: 'MC' });
    expect(inv.country).toBe('MC');
    expect(inv.currency).toBe('EUR');
  });
});

describe('features/studios/invoice boost — line discount + credit note', () => {
  it('calcLineTotalHT applique remise', () => {
    const line: InvoiceLine = {
      id: 'l', description: '', quantity: 10, unitPriceHT: 100, tvaRate: 20, discountPercent: 10,
    };
    /* 10 * 100 * 0.9 = 900 */
    expect(calcLineTotalHT(line)).toBe(900);
  });

  it('calcLineTotalHT: discount=0 → identique à sans remise', () => {
    const line: InvoiceLine = {
      id: 'l', description: '', quantity: 1, unitPriceHT: 100, tvaRate: 20, discountPercent: 0,
    };
    expect(calcLineTotalHT(line)).toBe(100);
  });

  it('calcLineTotalHT: discount sans champ (back-compat) → 0% appliqué', () => {
    const line: InvoiceLine = {
      id: 'l', description: '', quantity: 1, unitPriceHT: 100, tvaRate: 20,
    };
    expect(calcLineTotalHT(line)).toBe(100);
  });

  it('calcTotals avec remises mixtes', () => {
    const lines: InvoiceLine[] = [
      { id: '1', description: '', quantity: 10, unitPriceHT: 100, tvaRate: 20, discountPercent: 10 },
      { id: '2', description: '', quantity: 1, unitPriceHT: 100, tvaRate: 20, discountPercent: 0 },
    ];
    const tot = calcTotals(lines);
    /* 900 + 100 = 1000 HT */
    expect(tot.ht).toBe(1000);
    expect(tot.tva).toBe(200);
  });
});

describe('features/studios/invoice boost — store CRUD avancé', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it('createCreditNote: avoir lié à parent + lignes négatives', () => {
    const parent = invoiceStudioStore.create(TEST_UID, 'facture');
    if (!parent) throw new Error('create failed');
    parent.lines = [{ id: 'l', description: 'X', quantity: 1, unitPriceHT: 100, tvaRate: 20 }];
    invoiceStudioStore.update(TEST_UID, parent.id, { lines: parent.lines });
    const credit = invoiceStudioStore.createCreditNote(TEST_UID, parent.id);
    expect(credit?.type).toBe('avoir');
    expect(credit?.parentInvoiceId).toBe(parent.id);
    expect(credit?.lines[0]?.unitPriceHT).toBe(-100);
  });

  it('generateRecurrence: facture mensuelle → suivante +1 mois', () => {
    const source = invoiceStudioStore.create(TEST_UID, 'facture', { recurrence: 'monthly' });
    if (!source) throw new Error('create failed');
    const next = invoiceStudioStore.generateRecurrence(TEST_UID, source.id);
    expect(next).not.toBeNull();
    expect(next?.recurrence).toBe('monthly');
  });

  it('generateRecurrence: source non récurrente → null', () => {
    const source = invoiceStudioStore.create(TEST_UID, 'facture', { recurrence: 'none' });
    if (!source) throw new Error('create failed');
    expect(invoiceStudioStore.generateRecurrence(TEST_UID, source.id)).toBeNull();
  });

  it('markReminderSent: ajoute timestamp', () => {
    const inv = invoiceStudioStore.create(TEST_UID, 'facture');
    if (!inv) throw new Error('create failed');
    expect(invoiceStudioStore.markReminderSent(TEST_UID, inv.id, 12345)).toBe(true);
    const after = invoiceStudioStore.load(TEST_UID).find((i) => i.id === inv.id);
    expect(after?.remindersSentAt).toContain(12345);
  });

  it('listOverdue: vide si pas de factures', () => {
    expect(invoiceStudioStore.listOverdue(TEST_UID)).toEqual([]);
  });

  it('generateInvoiceNumber: prefix correct par type', () => {
    expect(generateInvoiceNumber('avoir', 0)).toMatch(/^AVR-/);
    expect(generateInvoiceNumber('acompte', 0)).toMatch(/^ACC-/);
    expect(generateInvoiceNumber('solde', 0)).toMatch(/^SLD-/);
  });
});
