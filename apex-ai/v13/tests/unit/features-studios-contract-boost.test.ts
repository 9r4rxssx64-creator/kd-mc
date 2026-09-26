/**
 * Tests features/studios/contract — boost v13 (15 templates, clauses optionnelles,
 * RGPD compliance, signature électronique, multi-langue, génération texte).
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import {
  OPTIONAL_CLAUSES,
  TEMPLATES,
  checkRGPDCompliance,
  contractStudioStore,
  generateContractText,
  getOptionalClause,
  hashSignature,
  initContract,
} from '../../features/studios/contract/index.js';

const TEST_UID = 'test_ctr_boost_uid';

describe('features/studios/contract boost — 15 templates catalog', () => {
  it('liste >=15 templates', () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(15);
  });

  it('contient nouveaux templates (vente, prêt, mandat, distribution, partenariat, prestation, location-vehicule, cession-parts, donation)', () => {
    const ids = TEMPLATES.map((t) => t.id);
    expect(ids).toContain('vente');
    expect(ids).toContain('pret');
    expect(ids).toContain('mandat');
    expect(ids).toContain('distribution');
    expect(ids).toContain('partenariat');
    expect(ids).toContain('prestation');
    expect(ids).toContain('location-vehicule');
    expect(ids).toContain('cession-parts');
    expect(ids).toContain('donation');
  });

  it('bail séparé en bail-commercial + bail-habitation', () => {
    const ids = TEMPLATES.map((t) => t.id);
    expect(ids).toContain('bail-commercial');
    expect(ids).toContain('bail-habitation');
    expect(ids).not.toContain('bail');
  });

  it('chaque template a recommendedOptional + requiresRGPD défini', () => {
    for (const t of TEMPLATES) {
      expect(Array.isArray(t.recommendedOptional)).toBe(true);
      expect(typeof t.requiresRGPD).toBe('boolean');
    }
  });

  it('NDA, CDI, CDD, freelance requirent RGPD', () => {
    for (const id of ['nda', 'cdi', 'cdd', 'freelance', 'prestation', 'partenariat'] as const) {
      const t = TEMPLATES.find((x) => x.id === id);
      expect(t?.requiresRGPD).toBe(true);
    }
  });

  it('Bail habitation NE requiert PAS RGPD', () => {
    const t = TEMPLATES.find((x) => x.id === 'bail-habitation');
    expect(t?.requiresRGPD).toBe(false);
  });
});

describe('features/studios/contract boost — clauses optionnelles', () => {
  it('OPTIONAL_CLAUSES: >=12 clauses définies', () => {
    expect(OPTIONAL_CLAUSES.length).toBeGreaterThanOrEqual(12);
  });

  it('contient non-concurrence, IP, RGPD, force majeure', () => {
    const ids = OPTIONAL_CLAUSES.map((c) => c.id);
    expect(ids).toContain('non-concurrence');
    expect(ids).toContain('propriete-intellectuelle');
    expect(ids).toContain('rgpd-conformite');
    expect(ids).toContain('force-majeure');
    expect(ids).toContain('confidentialite');
    expect(ids).toContain('arbitrage');
  });

  it('chaque clause optionnelle a label, text, legalRef', () => {
    for (const c of OPTIONAL_CLAUSES) {
      expect(c.label.length).toBeGreaterThan(0);
      expect(c.text.length).toBeGreaterThan(20);
      expect(c.legalRef.length).toBeGreaterThan(0);
    }
  });

  it('getOptionalClause: récupère par ID', () => {
    const c = getOptionalClause('rgpd-conformite');
    expect(c?.label).toContain('RGPD');
    expect(c?.legalRef).toContain('2016/679');
  });

  it('getOptionalClause: ID inconnu → undefined', () => {
    expect(getOptionalClause('xxx' as 'rgpd-conformite')).toBeUndefined();
  });

  it('clause non-concurrence référence Cass. soc.', () => {
    const nc = getOptionalClause('non-concurrence');
    expect(nc?.legalRef).toContain('Cass');
  });

  it('clause IP référence Code propriété intellectuelle', () => {
    const ip = getOptionalClause('propriete-intellectuelle');
    expect(ip?.legalRef).toContain('propriété intellectuelle');
  });

  it('clause RGPD référence règlement UE 2016/679', () => {
    const rgpd = getOptionalClause('rgpd-conformite');
    expect(rgpd?.legalRef).toContain('2016/679');
  });
});

describe('features/studios/contract boost — RGPD compliance', () => {
  it('checkRGPDCompliance: bail-habitation → compliant true (pas requis)', () => {
    const c = initContract('bail-habitation', 0);
    const r = checkRGPDCompliance(c);
    expect(r.compliant).toBe(true);
    expect(r.missingRequirements).toEqual([]);
  });

  it('checkRGPDCompliance: NDA sans rgpd-conformite → non compliant', () => {
    const c = initContract('nda', 0);
    /* Override : retire toutes clauses optionnelles */
    c.optionalClauses = [];
    const r = checkRGPDCompliance(c);
    expect(r.compliant).toBe(false);
    expect(r.missingRequirements.length).toBeGreaterThan(0);
  });

  it('checkRGPDCompliance: CDI avec rgpd-conformite → compliant', () => {
    const c = initContract('cdi', 0);
    c.optionalClauses = ['rgpd-conformite', 'confidentialite'];
    const r = checkRGPDCompliance(c);
    expect(r.compliant).toBe(true);
  });

  it('checkRGPDCompliance: identifie clauses manquantes spécifiques', () => {
    const c = initContract('nda', 0);
    c.optionalClauses = []; /* aucune clause */
    const r = checkRGPDCompliance(c);
    expect(r.missingRequirements.some((m) => m.toLowerCase().includes('rgpd'))).toBe(true);
  });
});

describe('features/studios/contract boost — signature électronique', () => {
  it('hashSignature: retourne string non vide', async () => {
    const h = await hashSignature('test-data');
    expect(typeof h).toBe('string');
    expect(h.length).toBeGreaterThan(0);
  });

  it('hashSignature: même input → même hash (déterministe)', async () => {
    const h1 = await hashSignature('foo');
    const h2 = await hashSignature('foo');
    expect(h1).toBe(h2);
  });

  it('hashSignature: inputs différents → hash différents', async () => {
    const h1 = await hashSignature('a');
    const h2 = await hashSignature('b');
    expect(h1).not.toBe(h2);
  });

  it('signParty + isFullySigned: contrat 2 parties signées', async () => {
    localStorage.clear();
    const c = contractStudioStore.create(TEST_UID, 'nda');
    if (!c) throw new Error('create failed');
    expect(contractStudioStore.isFullySigned(TEST_UID, c.id)).toBe(false);
    if (!c.parties[0] || !c.parties[1]) throw new Error('parties missing');
    await contractStudioStore.signParty(TEST_UID, c.id, c.parties[0].id, 'data:image/png;base64,sig1');
    expect(contractStudioStore.isFullySigned(TEST_UID, c.id)).toBe(false);
    await contractStudioStore.signParty(TEST_UID, c.id, c.parties[1].id, 'data:image/png;base64,sig2');
    expect(contractStudioStore.isFullySigned(TEST_UID, c.id)).toBe(true);
    localStorage.clear();
  });
});

describe('features/studios/contract boost — generateContractText', () => {
  it('génère texte avec sections principales', () => {
    const c = initContract('nda', 0);
    if (c.parties[0]) c.parties[0].nom = 'ACME SAS';
    if (c.parties[1]) c.parties[1].nom = 'Jean Dupont';
    const txt = generateContractText(c);
    expect(txt).toContain('NDA');
    expect(txt).toContain('ACME SAS');
    expect(txt).toContain('Jean Dupont');
    expect(txt).toContain('Clauses standards');
    expect(txt).toContain('Références légales');
  });

  it('inclut clauses optionnelles si présentes', () => {
    const c = initContract('cdi', 0);
    c.optionalClauses = ['rgpd-conformite', 'non-concurrence'];
    const txt = generateContractText(c);
    expect(txt.toLowerCase()).toContain('rgpd');
    expect(txt.toLowerCase()).toContain('non-concurrence');
  });

  it('inclut clauses sur mesure si présentes', () => {
    const c = initContract('cdi', 0);
    c.customClauses = ['Clause sur mesure XYZ'];
    const txt = generateContractText(c);
    expect(txt).toContain('Clause sur mesure XYZ');
  });

  it('placeholders si parties non remplies', () => {
    const c = initContract('nda', 0);
    const txt = generateContractText(c);
    expect(txt).toContain('[à remplir]');
  });

  it('template inconnu → string vide', () => {
    const c = initContract('nda', 0);
    c.template = 'inconnu' as 'nda';
    expect(generateContractText(c)).toBe('');
  });
});

describe('features/studios/contract boost — multi-langue + nouvelles validations', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it('initContract: lang="en" stockée', () => {
    const c = initContract('nda', 0, 'en');
    expect(c.lang).toBe('en');
  });

  it('initContract: par défaut lang="fr"', () => {
    const c = initContract('nda', 0);
    expect(c.lang).toBe('fr');
  });

  it('initContract: rgpdCompliant true si requiresRGPD + rgpd-conformite dans recommendedOptional', () => {
    const tpl = TEMPLATES.find((t) => t.id === 'cdi');
    if (!tpl) throw new Error('CDI template missing');
    const c = initContract('cdi', 0);
    /* CDI a 'rgpd-conformite' dans recommendedOptional → rgpdCompliant=true */
    expect(c.rgpdCompliant).toBe(true);
  });

  it('store update: rgpdCompliant recalculé sur optionalClauses change', () => {
    const c = contractStudioStore.create(TEST_UID, 'nda');
    if (!c) throw new Error('create failed');
    contractStudioStore.update(TEST_UID, c.id, { optionalClauses: [] });
    const after = contractStudioStore.load(TEST_UID).find((x) => x.id === c.id);
    expect(after?.rgpdCompliant).toBe(false);
    contractStudioStore.update(TEST_UID, c.id, { optionalClauses: ['rgpd-conformite'] });
    const after2 = contractStudioStore.load(TEST_UID).find((x) => x.id === c.id);
    expect(after2?.rgpdCompliant).toBe(true);
  });

  it('vente template a 2 parties, ref Code civil 1582', () => {
    const t = TEMPLATES.find((x) => x.id === 'vente');
    expect(t?.partiesCount).toBe(2);
    const refs = t?.legalRefs.join(' ') ?? '';
    expect(refs).toContain('1582');
  });

  it('cession-parts ref Code commerce L223-14 ou L227-13', () => {
    const t = TEMPLATES.find((x) => x.id === 'cession-parts');
    const refs = t?.legalRefs.join(' ') ?? '';
    expect(refs).toMatch(/L22[37]/);
  });

  it('donation ref Code civil 893 et 931', () => {
    const t = TEMPLATES.find((x) => x.id === 'donation');
    const refs = t?.legalRefs.join(' ') ?? '';
    expect(refs).toContain('893');
    expect(refs).toContain('931');
  });
});
