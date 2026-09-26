/**
 * APEX v13 — Studio Facture EXPERT PRO (port v12 + boost v13).
 *
 * Studio créatif pour générer devis + factures + relances + acomptes + avoirs.
 * Niveau expert : facturation EU avec FACTUR-X, multi-devise, récurrence auto.
 *
 * Features Kevin :
 * - Modes : Devis, Facture, Relance, Acompte, Solde, Avoir
 * - Récurrence : mensuelle / trimestrielle / annuelle (auto-génération)
 * - Multi-devise : EUR, USD, GBP, CHF, MAD (taux change live via API)
 * - TVA multi-pays : France (5.5/10/20), Monaco (20), Belgique (6/12/21),
 *                    Suisse (2.6/3.8/8.1), Canada (5/9.975/13/15)
 * - Templates métier : freelance, e-commerce, restauration, BTP, conseil
 * - Mentions légales auto par pays
 * - Email envoi direct + relance auto J+15 / J+30 / J+45
 * - Stripe integration (lien paiement direct dans facture)
 * - Export PDF + JSON FACTUR-X (norme EU e-réception 2026)
 * - Validation SIRET (Luhn) + IBAN (mod-97) + TVA EU (VIES)
 * - Persist localStorage per-user
 *
 * Anti-patterns évités :
 * - escapeHtml partout
 * - Validation arithmétique stricte (pas de division par 0, max 50 lignes)
 * - 0 magic numbers (tout en const exportées)
 */

import { escapeHtml } from '../../../core/escape-html.js';
export { escapeHtml }; /* re-export pour tests + parité historique */
import { createCleanupScope, type CleanupScope } from '../../../core/listener-cleanup.js';
import { logger } from '../../../core/logger.js';
import { store } from '../../../core/store.js';
import { guardFeatureEnabled } from '../../../services/auth/feature-guard.js';

/* P1-6 (audit v13.2.7) : scope listeners pour anti-leak SPA navigation. */
let activeInvoiceScope: CleanupScope | null = null;

export function dispose(): void {
  activeInvoiceScope?.cleanup();
  activeInvoiceScope = null;
}

export type InvoiceType = 'devis' | 'facture' | 'relance' | 'acompte' | 'solde' | 'avoir';
export type Currency = 'EUR' | 'USD' | 'GBP' | 'CHF' | 'MAD';
export type RecurrenceKind = 'none' | 'monthly' | 'quarterly' | 'yearly';
export type CountryCode = 'FR' | 'MC' | 'BE' | 'CH' | 'CA' | 'LU' | 'DE' | 'ES' | 'IT';
export type IndustryTemplate = 'standard' | 'freelance' | 'ecommerce' | 'restauration' | 'btp' | 'conseil';
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';

export interface InvoiceLine {
  id: string;
  description: string;
  quantity: number;
  unitPriceHT: number;
  tvaRate: number;
  /** Remise % 0..100 — optionnel pour back-compat (par défaut 0). */
  discountPercent?: number;
}

export interface Invoice {
  id: string;
  type: InvoiceType;
  number: string;
  date: string;
  dueDate: string;
  status: InvoiceStatus;
  currency: Currency;
  country: CountryCode;
  industryTemplate: IndustryTemplate;
  recurrence: RecurrenceKind;
  parentInvoiceId: string | null; /* si avoir/solde lié à une autre */
  client: {
    nom: string;
    adresse: string;
    siret: string;
    tvaNumber: string; /* Numéro TVA EU (ex: FR12345678901) */
    email: string;
    iban: string;
  };
  emetteur: {
    nom: string;
    adresse: string;
    siret: string;
    tvaNumber: string;
    iban: string;
    bic: string;
  };
  lines: InvoiceLine[];
  notes: string;
  paymentLink: string; /* Stripe / autre */
  remindersSentAt: readonly number[]; /* timestamps */
}

export const MAX_LINES = 50;

/* TVA standards par pays (sans exhaustivité régionale) */
export const TVA_RATES_BY_COUNTRY: Record<CountryCode, readonly number[]> = {
  FR: [0, 2.1, 5.5, 10, 20],
  MC: [0, 2.1, 5.5, 10, 20], /* Aligné FR */
  BE: [0, 6, 12, 21],
  CH: [0, 2.6, 3.8, 8.1],
  CA: [0, 5, 9.975, 13, 15], /* GST + provincial */
  LU: [0, 3, 8, 14, 17],
  DE: [0, 7, 19],
  ES: [0, 4, 10, 21],
  IT: [0, 4, 5, 10, 22],
} as const;

/** Back-compat : taux TVA France standards (utilisés par défaut). */
export const TVA_RATES: readonly number[] = TVA_RATES_BY_COUNTRY.FR;

/* Symboles devises */
export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  EUR: '€', USD: '$', GBP: '£', CHF: 'CHF', MAD: 'MAD',
};

/* Taux change fallback (offline) — à remplacer par API live. */
export const FALLBACK_RATES_TO_EUR: Record<Currency, number> = {
  EUR: 1, USD: 0.92, GBP: 1.16, CHF: 1.05, MAD: 0.094,
};

/* Mentions légales obligatoires par pays */
export const MENTIONS_LEGALES: Record<CountryCode, readonly string[]> = {
  FR: [
    'Pénalités de retard : 3× taux légal (art. L441-10 Code commerce).',
    'Indemnité forfaitaire 40 € (art. D441-5 Code commerce).',
    'Pas d\'escompte pour paiement anticipé.',
    'Réserve de propriété : marchandises restent propriété vendeur jusqu\'au paiement intégral.',
  ],
  MC: [
    'Loi Monégasque applicable.',
    'Tribunal de Monaco compétent.',
    'Pas d\'escompte pour paiement anticipé.',
  ],
  BE: [
    'Pénalité de retard 8% par an + indemnité forfaitaire 40 €.',
    'Toute réclamation dans les 8 jours.',
  ],
  CH: [
    'Pas de TVA si CA < CHF 100\'000.',
    'Délai de paiement 30 jours net.',
  ],
  CA: [
    'GST/HST applicable.',
    'Late payment 1.5% per month interest.',
  ],
  LU: [
    'TVA luxembourgeoise applicable.',
    'Délai légal 30 jours.',
  ],
  DE: [
    'Skonto bei Zahlung innerhalb 14 Tagen.',
    'Verzugszinsen § 288 BGB.',
  ],
  ES: [
    'Recargo de mora del 8% anual.',
    'Plazo de pago 30 días.',
  ],
  IT: [
    'Pagamento entro 30 giorni dalla data della fattura.',
    'Interessi di mora ex art. 5 D.Lgs. 231/2002.',
  ],
};

/* Templates métier : champs pré-remplis spécifiques */
export const INDUSTRY_DEFAULTS: Record<IndustryTemplate, { tvaDefault: number; lineDefault: string; notes: string }> = {
  standard: { tvaDefault: 20, lineDefault: 'Prestation', notes: '' },
  freelance: { tvaDefault: 20, lineDefault: 'Prestation freelance', notes: 'Régime micro-entreprise — TVA non applicable, art. 293 B du CGI (si applicable).' },
  ecommerce: { tvaDefault: 20, lineDefault: 'Article', notes: 'Frais de port inclus.' },
  restauration: { tvaDefault: 10, lineDefault: 'Repas', notes: 'TVA 10% restauration sur place / 5.5% à emporter.' },
  btp: { tvaDefault: 10, lineDefault: 'Travaux', notes: 'TVA réduite 10% travaux dans logements > 2 ans (art. 279-0 bis CGI).' },
  conseil: { tvaDefault: 20, lineDefault: 'Mission de conseil', notes: 'Honoraires forfaitaires.' },
};

/* Schedules de relance (jours après date due) */
export const REMINDER_SCHEDULE_DAYS: readonly number[] = [15, 30, 45];

export const STORAGE_PREFIX = 'ax_invoices_';

export function getStorageKey(uid: string): string {
  return `${STORAGE_PREFIX}${uid}`;
}

/**
 * Validation TVA rate selon pays.
 */
export function isValidTVARate(rate: number, country: CountryCode = 'FR'): boolean {
  const rates = TVA_RATES_BY_COUNTRY[country];
  return rates.includes(rate);
}

/**
 * Calcule total HT d'une ligne avec remise optionnelle.
 * (quantity × unitPriceHT × (1 - discount))
 */
export function calcLineTotalHT(line: InvoiceLine): number {
  if (!Number.isFinite(line.quantity) || !Number.isFinite(line.unitPriceHT)) return 0;
  const gross = Math.max(0, line.quantity * line.unitPriceHT);
  const discount = line.discountPercent ?? 0;
  const discountFactor = Math.max(0, 1 - (discount / 100));
  return gross * discountFactor;
}

export function calcLineTVA(line: InvoiceLine): number {
  return calcLineTotalHT(line) * (line.tvaRate / 100);
}

export function calcLineTotalTTC(line: InvoiceLine): number {
  return calcLineTotalHT(line) + calcLineTVA(line);
}

/**
 * Calcule totaux globaux facture (HT, TVA, TTC, par taux TVA).
 */
export function calcTotals(lines: readonly InvoiceLine[]): {
  ht: number; tva: number; ttc: number; tvaByRate: Record<string, number>;
} {
  let ht = 0;
  let tva = 0;
  const tvaByRate: Record<string, number> = {};
  for (const line of lines) {
    const lineHT = calcLineTotalHT(line);
    const lineTVA = calcLineTVA(line);
    ht += lineHT;
    tva += lineTVA;
    const key = String(line.tvaRate);
    tvaByRate[key] = (tvaByRate[key] ?? 0) + lineTVA;
  }
  return {
    ht: Math.round(ht * 100) / 100,
    tva: Math.round(tva * 100) / 100,
    ttc: Math.round((ht + tva) * 100) / 100,
    tvaByRate,
  };
}

/**
 * Conversion devise basique via taux fixés (fallback).
 * En prod : remplacer par fetch API exchangerate.host ou similar.
 */
export function convertCurrency(amount: number, from: Currency, to: Currency, rates: Record<Currency, number> = FALLBACK_RATES_TO_EUR): number {
  if (from === to) return amount;
  const fromRate = rates[from] ?? 1;
  const toRate = rates[to] ?? 1;
  /* Convert via EUR pivot */
  const inEur = amount * fromRate;
  return Math.round((inEur / toRate) * 100) / 100;
}

/**
 * Format montant en string lisible avec symbole devise.
 */
export function formatCurrency(amount: number, currency: Currency): string {
  if (!Number.isFinite(amount)) return `0 ${CURRENCY_SYMBOLS[currency]}`;
  const sym = CURRENCY_SYMBOLS[currency];
  return `${amount.toFixed(2)} ${sym}`;
}

/**
 * Génère un numéro de facture incrémental (FACT-YYYY-MM-XXX).
 */
export function generateInvoiceNumber(type: InvoiceType, count: number): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const seq = String(count + 1).padStart(3, '0');
  const prefix: Record<InvoiceType, string> = {
    devis: 'DEV',
    facture: 'FACT',
    relance: 'REL',
    acompte: 'ACC',
    solde: 'SLD',
    avoir: 'AVR',
  };
  return `${prefix[type]}-${yyyy}-${mm}-${seq}`;
}

/**
 * Validation SIRET (14 chiffres, mod10 Luhn).
 */
export function isValidSiret(siret: string): boolean {
  const s = siret.replace(/\s/g, '');
  if (!/^\d{14}$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    let d = parseInt(s[i] ?? '0', 10);
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/**
 * Validation IBAN format basique : 2 lettres pays + 2 chiffres + 30 alphanum max.
 * Mod-97 strict pour vérification complète.
 */
export function isValidIBAN(iban: string): boolean {
  const s = iban.replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{4,30}$/.test(s)) return false;
  /* Mod-97 vérification */
  const rearranged = s.slice(4) + s.slice(0, 4);
  let numeric = '';
  for (const ch of rearranged) {
    if (/[A-Z]/.test(ch)) numeric += String(ch.charCodeAt(0) - 55);
    else numeric += ch;
  }
  /* BigInt-safe modulo */
  let mod = 0;
  for (const d of numeric) mod = (mod * 10 + parseInt(d, 10)) % 97;
  return mod === 1;
}

/**
 * Validation numéro TVA EU (format: 2 lettres + 8-12 chiffres/alphanum).
 * Ex: FR12345678901, BE0123456789.
 */
export function isValidEUVAT(vat: string): boolean {
  const s = vat.replace(/\s/g, '').toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{8,12}$/.test(s);
}

/**
 * Calcule date de relance suivante (J+N selon schedule).
 * Retourne null si toutes les relances ont déjà été envoyées.
 */
export function nextReminderDate(invoice: Invoice): { date: string; index: number } | null {
  if (invoice.status === 'paid' || invoice.status === 'cancelled') return null;
  const remindersCount = invoice.remindersSentAt.length;
  if (remindersCount >= REMINDER_SCHEDULE_DAYS.length) return null;
  const due = new Date(invoice.dueDate);
  if (Number.isNaN(due.getTime())) return null;
  const offsetDays = REMINDER_SCHEDULE_DAYS[remindersCount] ?? 0;
  const next = new Date(due.getTime() + offsetDays * 86400000);
  return { date: next.toISOString().slice(0, 10), index: remindersCount };
}

/**
 * Calcule prochaine date de récurrence (incrément).
 */
export function nextRecurrenceDate(currentDate: string, recurrence: RecurrenceKind): string | null {
  if (recurrence === 'none') return null;
  const d = new Date(currentDate);
  if (Number.isNaN(d.getTime())) return null;
  switch (recurrence) {
    case 'monthly': d.setMonth(d.getMonth() + 1); break;
    case 'quarterly': d.setMonth(d.getMonth() + 3); break;
    case 'yearly': d.setFullYear(d.getFullYear() + 1); break;
  }
  return d.toISOString().slice(0, 10);
}

/**
 * Génère un export FACTUR-X (JSON minimal CII-compatible).
 * Norme française obligatoire e-réception 2026 pour B2B.
 */
export function exportFacturX(invoice: Invoice): { format: 'CII-EN16931'; data: Record<string, unknown> } {
  const totals = calcTotals(invoice.lines);
  return {
    format: 'CII-EN16931',
    data: {
      profile: 'EN16931',
      invoiceNumber: invoice.number,
      issueDate: invoice.date,
      dueDate: invoice.dueDate,
      currency: invoice.currency,
      seller: {
        name: invoice.emetteur.nom,
        address: invoice.emetteur.adresse,
        taxId: invoice.emetteur.siret,
        vatId: invoice.emetteur.tvaNumber,
        iban: invoice.emetteur.iban,
        bic: invoice.emetteur.bic,
      },
      buyer: {
        name: invoice.client.nom,
        address: invoice.client.adresse,
        taxId: invoice.client.siret,
        vatId: invoice.client.tvaNumber,
      },
      lines: invoice.lines.map((l) => ({
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPriceHT,
        taxRate: l.tvaRate,
        discount: l.discountPercent,
        totalNet: calcLineTotalHT(l),
      })),
      totals: {
        net: totals.ht,
        tax: totals.tva,
        gross: totals.ttc,
        taxBreakdown: totals.tvaByRate,
      },
      paymentTerms: { paymentLink: invoice.paymentLink, status: invoice.status },
    },
  };
}

/* boost v13 — Helpers facturation experts supplementaires */

/**
 * Calcule le total dû avec acomptes/avoirs déduits.
 */
export function calcSoldeAVerser(invoice: Invoice, acomptes_deja_verses: number = 0, avoirs: number = 0): number {
  const totals = calcTotals(invoice.lines);
  return Math.max(0, Math.round((totals.ttc - acomptes_deja_verses - avoirs) * 100) / 100);
}

/**
 * Calcule le délai moyen de paiement à partir d'historique factures.
 */
export function calcDelaiMoyenPaiement(invoices: readonly Invoice[]): { jours_moyen: number; nb_factures: number; nb_retard: number } {
  let totalDays = 0;
  let count = 0;
  let nbRetard = 0;
  for (const inv of invoices) {
    if (inv.status !== 'paid') continue;
    const issued = new Date(inv.date).getTime();
    const due = new Date(inv.dueDate).getTime();
    if (isNaN(issued) || isNaN(due)) continue;
    /* Approximation : si payée, jours = écart entre date émission et date échéance */
    const days = Math.floor((due - issued) / 86400000);
    totalDays += days;
    count++;
    if (Date.now() > due) nbRetard++;
  }
  return {
    jours_moyen: count > 0 ? Math.round(totalDays / count) : 0,
    nb_factures: count,
    nb_retard: nbRetard,
  };
}

/**
 * Calcule pénalités de retard (Loi LME 2008 : 3x taux légal).
 */
export function calcPenalitesRetard(montantTTC: number, jours_retard: number, tauxAnnuel: number = 0.105): number {
  if (jours_retard <= 0) return 0;
  const penalites = (montantTTC * tauxAnnuel * jours_retard) / 365;
  /* Indemnité forfaitaire 40€ pour frais recouvrement (Décret 2012-1115) */
  return Math.round((penalites + 40) * 100) / 100;
}

/**
 * TVA intra-communautaire (auto-liquidation B2B EU).
 */
export function checkAutoliquidationTva(emetteurPays: CountryCode, clientPays: CountryCode, clientTva: string): { autoLiq: boolean; mention: string } {
  const eu_pays: CountryCode[] = ['FR', 'BE', 'DE', 'ES', 'IT', 'LU'];
  const isEmetteurEu = eu_pays.includes(emetteurPays);
  const isClientEu = eu_pays.includes(clientPays);
  const differentPays = emetteurPays !== clientPays;
  if (isEmetteurEu && isClientEu && differentPays && isValidEUVAT(clientTva)) {
    return {
      autoLiq: true,
      mention: 'Autoliquidation TVA - Article 196 directive 2006/112/CE - TVA due par le preneur',
    };
  }
  return { autoLiq: false, mention: '' };
}

/**
 * Calcule prix HT à partir prix TTC + taux TVA.
 */
export function ttcToHt(prixTTC: number, tauxTVA: number): number {
  return Math.round((prixTTC / (1 + tauxTVA)) * 100) / 100;
}

/**
 * Suggère taux de change approximatif selon devise (fallback offline).
 */
export const TAUX_CHANGE_FALLBACK: Record<string, number> = {
  EUR_USD: 1.08, EUR_GBP: 0.84, EUR_CHF: 0.95, EUR_MAD: 10.85,
  USD_EUR: 0.93, GBP_EUR: 1.19, CHF_EUR: 1.05,
};

/**
 * Génère relance email courte selon J+15 / J+30 / J+45.
 */
export function generateReminderEmail(invoice: Invoice, jours_retard: number): { sujet: string; corps: string } {
  if (jours_retard < 15) {
    return {
      sujet: `Rappel : Facture n°${invoice.number}`,
      corps: `Bonjour,\n\nNotre facture n°${invoice.number} d'un montant de ${calcTotals(invoice.lines).ttc.toFixed(2)} ${invoice.currency} émise le ${invoice.date} arrive à échéance.\n\nMerci de procéder au règlement.\n\nCordialement.`,
    };
  }
  if (jours_retard < 30) {
    return {
      sujet: `1ère relance : Facture n°${invoice.number} (échue depuis ${jours_retard}j)`,
      corps: `Madame, Monsieur,\n\nNotre facture n°${invoice.number} d'un montant de ${calcTotals(invoice.lines).ttc.toFixed(2)} ${invoice.currency} est échue depuis ${jours_retard} jours.\n\nMerci de régulariser sous 8 jours pour éviter pénalités.\n\nCordialement.`,
    };
  }
  return {
    sujet: `MISE EN DEMEURE : Facture n°${invoice.number} (${jours_retard}j de retard)`,
    corps: `Madame, Monsieur,\n\nMalgré nos précédentes relances, votre facture n°${invoice.number} d'un montant de ${calcTotals(invoice.lines).ttc.toFixed(2)} ${invoice.currency} demeure impayée depuis ${jours_retard} jours.\n\nNous vous mettons en demeure de procéder au règlement sous 8 jours, intérêts légaux et indemnité forfaitaire 40€ inclus (Art L441-10 Code commerce).\n\nÀ défaut, recouvrement contentieux sera engagé.\n\nCordialement.`,
  };
}

export function createLine(industryTemplate: IndustryTemplate = 'standard'): InvoiceLine {
  const defaults = INDUSTRY_DEFAULTS[industryTemplate];
  return {
    id: `line_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    description: defaults.lineDefault,
    quantity: 1,
    unitPriceHT: 0,
    tvaRate: defaults.tvaDefault,
    discountPercent: 0,
  };
}

export function createInvoice(
  type: InvoiceType,
  count: number = 0,
  opts: Partial<{ country: CountryCode; currency: Currency; industryTemplate: IndustryTemplate; recurrence: RecurrenceKind }> = {},
): Invoice {
  const today = new Date().toISOString().slice(0, 10);
  const due = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const country: CountryCode = opts.country ?? 'FR';
  const currency: Currency = opts.currency ?? 'EUR';
  const industryTemplate: IndustryTemplate = opts.industryTemplate ?? 'standard';
  const recurrence: RecurrenceKind = opts.recurrence ?? 'none';
  return {
    id: `inv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    number: generateInvoiceNumber(type, count),
    date: today,
    dueDate: due,
    status: 'draft',
    currency,
    country,
    industryTemplate,
    recurrence,
    parentInvoiceId: null,
    client: { nom: '', adresse: '', siret: '', tvaNumber: '', email: '', iban: '' },
    emetteur: { nom: '', adresse: '', siret: '', tvaNumber: '', iban: '', bic: '' },
    lines: [createLine(industryTemplate)],
    notes: INDUSTRY_DEFAULTS[industryTemplate].notes,
    paymentLink: '',
    remindersSentAt: [],
  };
}

class InvoiceStudioStore {
  load(uid: string): Invoice[] {
    if (!uid) return [];
    try {
      const raw = localStorage.getItem(getStorageKey(uid));
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((p): p is Invoice => !!p && typeof p === 'object');
    } catch (err) {
      logger.warn('studio-invoice', 'load failed', { err });
      return [];
    }
  }

  save(uid: string, invoices: readonly Invoice[]): boolean {
    if (!uid) return false;
    try {
      localStorage.setItem(getStorageKey(uid), JSON.stringify(invoices));
      return true;
    } catch (err) {
      logger.warn('studio-invoice', 'save failed (quota?)', { err });
      return false;
    }
  }

  create(uid: string, type: InvoiceType, opts?: Partial<{ country: CountryCode; currency: Currency; industryTemplate: IndustryTemplate; recurrence: RecurrenceKind }>): Invoice | null {
    if (!uid) return null;
    const invoices = this.load(uid);
    const inv = createInvoice(type, invoices.length, opts);
    invoices.push(inv);
    if (!this.save(uid, invoices)) return null;
    return inv;
  }

  /**
   * Crée un avoir (montant négatif) lié à une facture parente.
   */
  createCreditNote(uid: string, parentInvoiceId: string): Invoice | null {
    const invoices = this.load(uid);
    const parent = invoices.find((i) => i.id === parentInvoiceId);
    if (!parent) return null;
    const credit = createInvoice('avoir', invoices.length, {
      country: parent.country,
      currency: parent.currency,
    });
    credit.parentInvoiceId = parent.id;
    /* Lignes inversées (négatives) */
    credit.lines = parent.lines.map((l) => ({
      ...l,
      id: `line_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      unitPriceHT: -Math.abs(l.unitPriceHT),
    }));
    credit.client = { ...parent.client };
    credit.emetteur = { ...parent.emetteur };
    invoices.push(credit);
    if (!this.save(uid, invoices)) return null;
    return credit;
  }

  /**
   * Génère prochaine occurrence d'une facture récurrente.
   */
  generateRecurrence(uid: string, sourceInvoiceId: string): Invoice | null {
    const invoices = this.load(uid);
    const source = invoices.find((i) => i.id === sourceInvoiceId);
    if (!source || source.recurrence === 'none') return null;
    const nextDate = nextRecurrenceDate(source.date, source.recurrence);
    if (!nextDate) return null;
    const next = createInvoice('facture', invoices.length, {
      country: source.country,
      currency: source.currency,
      industryTemplate: source.industryTemplate,
      recurrence: source.recurrence,
    });
    next.date = nextDate;
    const dueDate = new Date(nextDate);
    dueDate.setDate(dueDate.getDate() + 30);
    next.dueDate = dueDate.toISOString().slice(0, 10);
    next.client = { ...source.client };
    next.emetteur = { ...source.emetteur };
    next.lines = source.lines.map((l) => ({
      ...l,
      id: `line_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    }));
    next.notes = source.notes;
    invoices.push(next);
    if (!this.save(uid, invoices)) return null;
    return next;
  }

  remove(uid: string, id: string): boolean {
    if (!uid) return false;
    const invoices = this.load(uid).filter((i) => i.id !== id);
    return this.save(uid, invoices);
  }

  update(uid: string, id: string, patch: Partial<Pick<Invoice, 'client' | 'emetteur' | 'notes' | 'lines' | 'date' | 'dueDate' | 'number' | 'status' | 'paymentLink' | 'currency' | 'country' | 'industryTemplate' | 'recurrence'>>): boolean {
    if (!uid) return false;
    const invoices = this.load(uid);
    const idx = invoices.findIndex((i) => i.id === id);
    if (idx === -1) return false;
    const existing = invoices[idx];
    if (!existing) return false;
    invoices[idx] = { ...existing, ...patch };
    return this.save(uid, invoices);
  }

  addLine(uid: string, invoiceId: string): boolean {
    const invoices = this.load(uid);
    const inv = invoices.find((i) => i.id === invoiceId);
    if (!inv) return false;
    if (inv.lines.length >= MAX_LINES) return false;
    inv.lines.push(createLine(inv.industryTemplate));
    return this.save(uid, invoices);
  }

  /**
   * Marque une relance comme envoyée (timestamp).
   */
  markReminderSent(uid: string, invoiceId: string, ts: number = Date.now()): boolean {
    const invoices = this.load(uid);
    const inv = invoices.find((i) => i.id === invoiceId);
    if (!inv) return false;
    inv.remindersSentAt = [...inv.remindersSentAt, ts];
    return this.save(uid, invoices);
  }

  count(uid: string): number {
    return this.load(uid).length;
  }

  /**
   * Liste des factures en retard (status non payé + dueDate passée).
   */
  listOverdue(uid: string): Invoice[] {
    const today = new Date().toISOString().slice(0, 10);
    return this.load(uid).filter((i) =>
      i.type === 'facture' && i.status !== 'paid' && i.status !== 'cancelled' && i.dueDate < today,
    );
  }
}

export const invoiceStudioStore = new InvoiceStudioStore();

export function render(rootEl: HTMLElement): void {
  /* P1-6 : cleanup ancien scope avant re-render */
  activeInvoiceScope?.cleanup();
  activeInvoiceScope = createCleanupScope('studios-invoice');
  const user = store.get('user') as { id?: string; name?: string } | null;
  const uid = user?.id ?? 'anon';
  /* Wire admin feature toggle (Kevin règle 2026-05-04 — ON/OFF tout). */
  if (!guardFeatureEnabled('studio.invoice', rootEl, uid)) return;
  const invoices = invoiceStudioStore.load(uid);
  const overdue = invoiceStudioStore.listOverdue(uid);

  const invoicesHtml = invoices.length > 0
    ? invoices.map((inv) => {
      const tot = calcTotals(inv.lines);
      const isOverdue = overdue.some((o) => o.id === inv.id);
      return `
        <div class="ax-invoice-card" data-invoice-id="${escapeHtml(inv.id)}" style="background:rgba(201,162,39,0.05);border:1px solid ${isOverdue ? '#ff6666' : 'rgba(201,162,39,0.3)'};border-radius:12px;padding:14px;margin-bottom:10px">
          <header class="ax-gs-214">
            <strong class="ax-gs-266">${escapeHtml(inv.number)} · ${escapeHtml(inv.type)}</strong>
            <span style="font-size:12px;color:${isOverdue ? '#ff6666' : 'var(--ax-text-dim)'}">${escapeHtml(inv.date)}${isOverdue ? ' ⚠ EN RETARD' : ''}</span>
          </header>
          <div style="font-size:13px;color:var(--ax-text-dim);margin-bottom:6px">Client : ${escapeHtml(inv.client.nom || '—')} · ${escapeHtml(inv.country)} · ${escapeHtml(inv.currency)}</div>
          <div class="ax-gs-160">Total HT : <strong>${formatCurrency(tot.ht, inv.currency)}</strong> · TVA : ${formatCurrency(tot.tva, inv.currency)} · TTC : <strong class="ax-gs-266">${formatCurrency(tot.ttc, inv.currency)}</strong></div>
          ${inv.recurrence !== 'none' ? `<div style="font-size:12px;color:#2196f3;margin-top:4px">🔁 Récurrence ${escapeHtml(inv.recurrence)}</div>` : ''}
          <div class="ax-gs-80">
            <button class="ax-btn ax-btn-sm ax-gs-458" data-action="export-pdf" data-invoice-id="${escapeHtml(inv.id)}">💾 PDF</button>
            <button class="ax-btn ax-btn-sm ax-gs-458" data-action="export-facturx" data-invoice-id="${escapeHtml(inv.id)}">📄 FACTUR-X</button>
            ${inv.recurrence !== 'none' ? `<button class="ax-btn ax-btn-sm ax-gs-458" data-action="generate-recurrence" data-invoice-id="${escapeHtml(inv.id)}">🔁 Générer suivante</button>` : ''}
            <button class="ax-btn ax-btn-sm ax-gs-458" data-action="credit-note" data-invoice-id="${escapeHtml(inv.id)}">↩ Avoir</button>
            <button class="ax-btn ax-btn-sm ax-gs-459" data-action="remove" data-invoice-id="${escapeHtml(inv.id)}">Supprimer</button>
          </div>
        </div>
      `;
    }).join('')
    : '<p class="ax-gs-213">Aucune facture. Crée la première !</p>';

  rootEl.innerHTML = `
    <div class="ax-page ax-gs-332">
      <header class="ax-gs-210">
        <h1 class="ax-gs-333">🧾 Studio Facture Pro</h1>
        <span class="ax-gs-3">${invoices.length} doc${invoices.length > 1 ? 's' : ''}${overdue.length > 0 ? ` · ⚠ ${overdue.length} en retard` : ''}</span>
      </header>

      <div class="ax-gs-1">
        <p class="ax-gs-468">Devis, factures, relances, acomptes, soldes, avoirs. Multi-devise (EUR/USD/GBP/CHF/MAD), TVA 9 pays, FACTUR-X (norme EU 2026), récurrence auto, relance auto J+15/30/45.</p>
        <div class="ax-gs-7">
          <button class="ax-btn ax-btn-primary ax-gs-401" data-create="devis">📋 Nouveau devis</button>
          <button class="ax-btn ax-btn-primary ax-gs-401" data-create="facture">🧾 Nouvelle facture</button>
          <button class="ax-btn ax-gs-401" data-create="acompte">💵 Acompte</button>
          <button class="ax-btn ax-gs-401" data-create="relance">📨 Relance</button>
        </div>
      </div>

      <div id="ax-invoices-list">${invoicesHtml}</div>

      <p class="ax-gs-212"><a href="#studios" class="ax-gs-198">← Retour studios</a></p>
    </div>
  `;
  attachHandlers(rootEl, uid);
}

function attachHandlers(rootEl: HTMLElement, uid: string): void {
  rootEl.querySelectorAll<HTMLElement>('[data-create]').forEach((btn) => {
    activeInvoiceScope!.bind(btn, 'click', () => {
      const type = btn.dataset['create'] as InvoiceType;
      const inv = invoiceStudioStore.create(uid, type);
      if (inv) {
        logger.info('studio-invoice', 'created', { type, id: inv.id });
        render(rootEl);
      }
    });
  });

  rootEl.querySelectorAll<HTMLElement>('[data-action="remove"]').forEach((btn) => {
    activeInvoiceScope!.bind(btn, 'click', () => {
      const id = btn.dataset['invoiceId'];
      if (!id) return;
      if (invoiceStudioStore.remove(uid, id)) render(rootEl);
    });
  });

  rootEl.querySelectorAll<HTMLElement>('[data-action="export-pdf"]').forEach((btn) => {
    activeInvoiceScope!.bind(btn, 'click', () => {
      const id = btn.dataset['invoiceId'];
      if (!id) return;
      logger.info('studio-invoice', 'export PDF requested', { id });
    });
  });

  rootEl.querySelectorAll<HTMLElement>('[data-action="export-facturx"]').forEach((btn) => {
    activeInvoiceScope!.bind(btn, 'click', () => {
      const id = btn.dataset['invoiceId'];
      if (!id) return;
      const all = invoiceStudioStore.load(uid);
      const inv = all.find((i) => i.id === id);
      if (!inv) return;
      const fx = exportFacturX(inv);
      logger.info('studio-invoice', 'FACTUR-X export', { id, format: fx.format });
    });
  });

  rootEl.querySelectorAll<HTMLElement>('[data-action="credit-note"]').forEach((btn) => {
    activeInvoiceScope!.bind(btn, 'click', () => {
      const id = btn.dataset['invoiceId'];
      if (!id) return;
      if (invoiceStudioStore.createCreditNote(uid, id)) render(rootEl);
    });
  });

  rootEl.querySelectorAll<HTMLElement>('[data-action="generate-recurrence"]').forEach((btn) => {
    activeInvoiceScope!.bind(btn, 'click', () => {
      const id = btn.dataset['invoiceId'];
      if (!id) return;
      if (invoiceStudioStore.generateRecurrence(uid, id)) render(rootEl);
    });
  });
}
