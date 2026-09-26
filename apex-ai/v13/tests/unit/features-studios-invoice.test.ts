/**
 * Tests features/studios/invoice (port v12 vInvoiceStudio).
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import {
  MAX_LINES,
  STORAGE_PREFIX,
  TVA_RATES,
  calcLineTotalHT,
  calcLineTotalTTC,
  calcLineTVA,
  calcTotals,
  createInvoice,
  createLine,
  escapeHtml,
  generateInvoiceNumber,
  invoiceStudioStore,
  isValidSiret,
  isValidTVARate,
  type InvoiceLine,
} from '../../features/studios/invoice/index.js';

const TEST_UID = 'test_inv_uid';

describe('features/studios/invoice — escapeHtml', () => {
  it('échappe HTML', () => {
    expect(escapeHtml('<x>')).toBe('&lt;x&gt;');
  });
});

describe('features/studios/invoice — TVA_RATES', () => {
  it('contient 0, 5.5, 10, 20', () => {
    expect(TVA_RATES).toContain(0);
    expect(TVA_RATES).toContain(5.5);
    expect(TVA_RATES).toContain(10);
    expect(TVA_RATES).toContain(20);
  });

  it('isValidTVARate accepte rates standards', () => {
    expect(isValidTVARate(20)).toBe(true);
    expect(isValidTVARate(5.5)).toBe(true);
    expect(isValidTVARate(10)).toBe(true);
    expect(isValidTVARate(0)).toBe(true);
  });

  it('isValidTVARate refuse rates non standards', () => {
    expect(isValidTVARate(15)).toBe(false);
    expect(isValidTVARate(25)).toBe(false);
    expect(isValidTVARate(-1)).toBe(false);
  });
});

describe('features/studios/invoice — line calculations', () => {
  it('calcLineTotalHT = qty × pu', () => {
    const line: InvoiceLine = { id: 'l1', description: 'X', quantity: 3, unitPriceHT: 100, tvaRate: 20 };
    expect(calcLineTotalHT(line)).toBe(300);
  });

  it('calcLineTotalHT = 0 si NaN', () => {
    const line: InvoiceLine = { id: 'l1', description: '', quantity: NaN, unitPriceHT: 100, tvaRate: 20 };
    expect(calcLineTotalHT(line)).toBe(0);
  });

  it('calcLineTotalHT clamp à 0 minimum', () => {
    const line: InvoiceLine = { id: 'l1', description: '', quantity: -5, unitPriceHT: 100, tvaRate: 20 };
    expect(calcLineTotalHT(line)).toBe(0);
  });

  it('calcLineTVA applique taux', () => {
    const line: InvoiceLine = { id: 'l1', description: '', quantity: 1, unitPriceHT: 100, tvaRate: 20 };
    expect(calcLineTVA(line)).toBe(20);
  });

  it('calcLineTVA TVA réduite 5.5%', () => {
    const line: InvoiceLine = { id: 'l1', description: '', quantity: 2, unitPriceHT: 50, tvaRate: 5.5 };
    expect(calcLineTVA(line)).toBe(5.5);
  });

  it('calcLineTotalTTC = HT + TVA', () => {
    const line: InvoiceLine = { id: 'l1', description: '', quantity: 1, unitPriceHT: 100, tvaRate: 20 };
    expect(calcLineTotalTTC(line)).toBe(120);
  });
});

describe('features/studios/invoice — calcTotals', () => {
  it('somme HT + TVA + TTC', () => {
    const lines: InvoiceLine[] = [
      { id: '1', description: 'A', quantity: 1, unitPriceHT: 100, tvaRate: 20 },
      { id: '2', description: 'B', quantity: 2, unitPriceHT: 50, tvaRate: 10 },
    ];
    const tot = calcTotals(lines);
    expect(tot.ht).toBe(200);
    expect(tot.tva).toBe(30); /* 20 + 10 */
    expect(tot.ttc).toBe(230);
  });

  it('groupe TVA par taux', () => {
    const lines: InvoiceLine[] = [
      { id: '1', description: 'A', quantity: 1, unitPriceHT: 100, tvaRate: 20 },
      { id: '2', description: 'B', quantity: 1, unitPriceHT: 100, tvaRate: 20 },
    ];
    const tot = calcTotals(lines);
    expect(tot.tvaByRate['20']).toBe(40);
  });

  it('arrondit à 2 décimales', () => {
    const lines: InvoiceLine[] = [
      { id: '1', description: 'A', quantity: 3, unitPriceHT: 33.33, tvaRate: 20 },
    ];
    const tot = calcTotals(lines);
    expect(Math.round(tot.ht * 100) / 100).toBeCloseTo(99.99, 2);
  });

  it('liste vide → 0', () => {
    const tot = calcTotals([]);
    expect(tot.ht).toBe(0);
    expect(tot.ttc).toBe(0);
  });
});

describe('features/studios/invoice — generateInvoiceNumber', () => {
  it('génère format DEV/FACT/REL-YYYY-MM-XXX', () => {
    const num = generateInvoiceNumber('facture', 0);
    expect(num).toMatch(/^FACT-\d{4}-\d{2}-001$/);
  });

  it('devis utilise prefix DEV', () => {
    expect(generateInvoiceNumber('devis', 0)).toMatch(/^DEV-/);
  });

  it('relance utilise prefix REL', () => {
    expect(generateInvoiceNumber('relance', 0)).toMatch(/^REL-/);
  });

  it('incrémente seq', () => {
    expect(generateInvoiceNumber('facture', 99)).toMatch(/-100$/);
  });
});

describe('features/studios/invoice — isValidSiret (Luhn)', () => {
  it('refuse moins de 14 chiffres', () => {
    expect(isValidSiret('123')).toBe(false);
    expect(isValidSiret('')).toBe(false);
  });

  it('refuse non numérique', () => {
    expect(isValidSiret('AAAA1234567890')).toBe(false);
  });

  it('valide SIRET valide', () => {
    /* Carrefour SA SIRET valide */
    expect(isValidSiret('65201405200029')).toBe(true);
  });

  it('refuse SIRET avec checksum invalide', () => {
    expect(isValidSiret('12345678900001')).toBe(false);
  });
});

describe('features/studios/invoice — STORAGE_PREFIX', () => {
  it('utilise prefix ax_invoices_', () => {
    expect(STORAGE_PREFIX).toBe('ax_invoices_');
  });

  it('MAX_LINES = 50', () => {
    expect(MAX_LINES).toBe(50);
  });
});

describe('features/studios/invoice — createLine + createInvoice', () => {
  it('createLine retourne ligne avec defaults', () => {
    const l = createLine();
    expect(l.id).toMatch(/^line_/);
    expect(l.quantity).toBe(1);
    expect(l.tvaRate).toBe(20);
  });

  it('createInvoice initialise type + lines', () => {
    const inv = createInvoice('devis');
    expect(inv.type).toBe('devis');
    expect(inv.lines.length).toBe(1);
    expect(inv.client.nom).toBe('');
    expect(inv.number).toMatch(/^DEV-/);
  });
});

describe('features/studios/invoice — invoiceStudioStore CRUD', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it('load vide retourne []', () => {
    expect(invoiceStudioStore.load(TEST_UID)).toEqual([]);
  });

  it('create ajoute facture', () => {
    const inv = invoiceStudioStore.create(TEST_UID, 'facture');
    expect(inv).not.toBeNull();
    expect(invoiceStudioStore.count(TEST_UID)).toBe(1);
  });

  it('remove supprime facture', () => {
    const inv = invoiceStudioStore.create(TEST_UID, 'facture');
    if (!inv) throw new Error('create failed');
    expect(invoiceStudioStore.remove(TEST_UID, inv.id)).toBe(true);
    expect(invoiceStudioStore.count(TEST_UID)).toBe(0);
  });

  it('update modifie notes', () => {
    const inv = invoiceStudioStore.create(TEST_UID, 'facture');
    if (!inv) throw new Error('create failed');
    expect(invoiceStudioStore.update(TEST_UID, inv.id, { notes: 'Test note' })).toBe(true);
    const after = invoiceStudioStore.load(TEST_UID).find((i) => i.id === inv.id);
    expect(after?.notes).toBe('Test note');
  });

  it('addLine ajoute ligne sous MAX_LINES', () => {
    const inv = invoiceStudioStore.create(TEST_UID, 'facture');
    if (!inv) throw new Error('create failed');
    expect(invoiceStudioStore.addLine(TEST_UID, inv.id)).toBe(true);
    const after = invoiceStudioStore.load(TEST_UID).find((i) => i.id === inv.id);
    expect(after?.lines.length).toBe(2);
  });

  it('per-user isolation', () => {
    invoiceStudioStore.create('uid_a', 'facture');
    invoiceStudioStore.create('uid_b', 'devis');
    expect(invoiceStudioStore.count('uid_a')).toBe(1);
    expect(invoiceStudioStore.count('uid_b')).toBe(1);
    expect(invoiceStudioStore.load('uid_a')[0]?.type).toBe('facture');
    expect(invoiceStudioStore.load('uid_b')[0]?.type).toBe('devis');
  });

  it('refuse uid vide', () => {
    expect(invoiceStudioStore.create('', 'facture')).toBeNull();
    expect(invoiceStudioStore.load('')).toEqual([]);
  });

  it('load gère localStorage corrompu', () => {
    localStorage.setItem('ax_invoices_corrupt', '{nope}');
    expect(invoiceStudioStore.load('corrupt')).toEqual([]);
  });
});
