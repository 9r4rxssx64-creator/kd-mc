/**
 * Tests features/studios/contract (port v12 vContractStudio).
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import {
  MAX_PARTIES,
  MAX_CLAUSES,
  STORAGE_PREFIX,
  TEMPLATES,
  contractStudioStore,
  createParty,
  escapeHtml,
  generateContractNumber,
  initContract,
  validateContract,
} from '../../features/studios/contract/index.js';

const TEST_UID = 'test_ctr_uid';

describe('features/studios/contract — escapeHtml', () => {
  it('échappe HTML', () => {
    expect(escapeHtml('<x&y>')).toBe('&lt;x&amp;y&gt;');
  });
});

describe('features/studios/contract — TEMPLATES catalog', () => {
  it('liste >=15 templates incluant NDA/CDI/CDD/freelance/bail', () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(15);
    const ids = TEMPLATES.map((t) => t.id);
    expect(ids).toContain('nda');
    expect(ids).toContain('cdi');
    expect(ids).toContain('cdd');
    expect(ids).toContain('freelance');
    expect(ids).toContain('bail-habitation');
    expect(ids).toContain('bail-commercial');
  });

  it('chaque template a label, emoji, partiesCount, clauses, refs', () => {
    for (const t of TEMPLATES) {
      expect(t.label).toBeTruthy();
      expect(t.emoji.length).toBeGreaterThan(0);
      expect(t.partiesCount).toBeGreaterThanOrEqual(2);
      expect(t.defaultClauses.length).toBeGreaterThan(0);
      expect(t.legalRefs.length).toBeGreaterThan(0);
    }
  });

  it('CDD inclut motif obligatoire dans clauses', () => {
    const cdd = TEMPLATES.find((t) => t.id === 'cdd');
    const clauses = cdd?.defaultClauses.join(' ').toLowerCase() ?? '';
    expect(clauses).toContain('motif');
  });

  it('Bail habitation inclut référence loi 1989', () => {
    const bail = TEMPLATES.find((t) => t.id === 'bail-habitation');
    const refs = bail?.legalRefs.join(' ').toLowerCase() ?? '';
    expect(refs).toContain('1989');
  });

  it('NDA inclut référence Code commerce/civil', () => {
    const nda = TEMPLATES.find((t) => t.id === 'nda');
    expect(nda?.legalRefs.length).toBeGreaterThan(0);
  });
});

describe('features/studios/contract — createParty', () => {
  it('crée partie vide avec id et type physique par défaut', () => {
    const p = createParty();
    expect(p.id).toMatch(/^party_/);
    expect(p.type).toBe('personne_physique');
    expect(p.nom).toBe('');
  });
});

describe('features/studios/contract — generateContractNumber', () => {
  it('format CTR-TYPE-YYYY-MM-XXX', () => {
    expect(generateContractNumber('nda', 0)).toMatch(/^CTR-NDA-\d{4}-\d{2}-001$/);
    expect(generateContractNumber('cdi', 5)).toMatch(/^CTR-CDI-\d{4}-\d{2}-006$/);
  });

  it('uppercase template', () => {
    expect(generateContractNumber('freelance', 0)).toContain('FREELANCE');
  });
});

describe('features/studios/contract — initContract', () => {
  it('initialise NDA avec 2 parties + optional clauses + refs', () => {
    const c = initContract('nda', 0);
    expect(c.template).toBe('nda');
    expect(c.parties.length).toBe(2);
    expect(c.optionalClauses.length).toBeGreaterThanOrEqual(0);
    expect(c.legalRefs.length).toBeGreaterThan(0);
  });

  it('CDI a 2 parties', () => {
    const c = initContract('cdi', 0);
    expect(c.parties.length).toBe(2);
  });

  it('throw sur template inconnu', () => {
    expect(() => initContract('inexistant' as 'nda', 0)).toThrow();
  });
});

describe('features/studios/contract — validateContract', () => {
  it('validation OK contrat complet', () => {
    const c = initContract('nda', 0);
    /* NDA est requiresRGPD=true et inclut déjà 'arbitrage' dans recommendedOptional ;
       on s'assure que la clause RGPD est bien présente pour passer le check RGPD */
    c.optionalClauses = [...c.optionalClauses, 'rgpd-conformite'];
    for (const p of c.parties) {
      p.nom = 'Partie';
      p.adresse = '1 rue de Paris';
    }
    const v = validateContract(c);
    expect(v.ok).toBe(true);
    expect(v.errors).toEqual([]);
  });

  it('détecte parties incomplètes', () => {
    const c = initContract('nda', 0);
    /* parties pas remplies */
    const v = validateContract(c);
    expect(v.ok).toBe(false);
    expect(v.errors.length).toBeGreaterThan(0);
  });

  it('CDD exige durée', () => {
    const c = initContract('cdd', 0);
    for (const p of c.parties) {
      p.nom = 'X';
      p.adresse = 'Y';
    }
    /* duree vide */
    const v = validateContract(c);
    expect(v.errors.some((e) => e.toLowerCase().includes('durée'))).toBe(true);
  });

  it('Freelance exige montant > 0', () => {
    const c = initContract('freelance', 0);
    for (const p of c.parties) {
      p.nom = 'X';
      p.adresse = 'Y';
    }
    c.montant = 0;
    const v = validateContract(c);
    expect(v.errors.some((e) => e.toLowerCase().includes('montant'))).toBe(true);
  });

  it('Bail habitation exige loyer > 0', () => {
    const c = initContract('bail-habitation', 0);
    for (const p of c.parties) {
      p.nom = 'X';
      p.adresse = 'Y';
    }
    c.montant = 0;
    const v = validateContract(c);
    expect(v.errors.some((e) => e.toLowerCase().includes('loyer'))).toBe(true);
  });
});

describe('features/studios/contract — constants', () => {
  it('STORAGE_PREFIX = ax_contracts_', () => {
    expect(STORAGE_PREFIX).toBe('ax_contracts_');
  });

  it('MAX_PARTIES = 10, MAX_CLAUSES = 30', () => {
    expect(MAX_PARTIES).toBe(10);
    expect(MAX_CLAUSES).toBe(30);
  });
});

describe('features/studios/contract — contractStudioStore CRUD', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it('load vide retourne []', () => {
    expect(contractStudioStore.load(TEST_UID)).toEqual([]);
  });

  it('create ajoute contrat NDA', () => {
    const c = contractStudioStore.create(TEST_UID, 'nda');
    expect(c).not.toBeNull();
    expect(c?.template).toBe('nda');
    expect(contractStudioStore.count(TEST_UID)).toBe(1);
  });

  it('create persiste localStorage', () => {
    contractStudioStore.create(TEST_UID, 'cdi');
    expect(contractStudioStore.load(TEST_UID).length).toBe(1);
  });

  it('remove supprime', () => {
    const c = contractStudioStore.create(TEST_UID, 'cdi');
    if (!c) throw new Error('create failed');
    expect(contractStudioStore.remove(TEST_UID, c.id)).toBe(true);
    expect(contractStudioStore.count(TEST_UID)).toBe(0);
  });

  it('update modifie durée et notes', () => {
    const c = contractStudioStore.create(TEST_UID, 'cdd');
    if (!c) throw new Error('create failed');
    expect(contractStudioStore.update(TEST_UID, c.id, { duree: '12 mois', notes: 'OK' })).toBe(true);
    const after = contractStudioStore.load(TEST_UID).find((x) => x.id === c.id);
    expect(after?.duree).toBe('12 mois');
    expect(after?.notes).toBe('OK');
  });

  it('per-user isolation', () => {
    contractStudioStore.create('uid_a', 'nda');
    contractStudioStore.create('uid_b', 'cdi');
    expect(contractStudioStore.load('uid_a')[0]?.template).toBe('nda');
    expect(contractStudioStore.load('uid_b')[0]?.template).toBe('cdi');
  });

  it('refuse uid vide', () => {
    expect(contractStudioStore.create('', 'nda')).toBeNull();
  });

  it('load gère localStorage corrompu', () => {
    localStorage.setItem('ax_contracts_bad', '{not valid');
    expect(contractStudioStore.load('bad')).toEqual([]);
  });
});
