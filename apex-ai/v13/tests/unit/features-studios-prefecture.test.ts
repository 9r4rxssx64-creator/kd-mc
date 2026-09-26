/**
 * Tests features/studios/prefecture.
 */
import { describe, expect, it, beforeEach } from 'vitest';

import {
  DEMARCHES,
  LETTER_TEMPLATES,
  STORAGE_PREFIX,
  calcCompleteness,
  checkDocument,
  createDossier,
  demarchesByCategory,
  demarchesByCountry,
  escapeHtml,
  findDemarche,
  findLetter,
  generateLetter,
  getDossierKey,
  prefectureStudioStore,
} from '../../features/studios/prefecture/index.js';

const TEST_UID = 'pref_test_uid';

describe('features/studios/prefecture — escapeHtml', () => {
  it('échappe HTML', () => {
    expect(escapeHtml('<x>')).toBe('&lt;x&gt;');
  });
});

describe('features/studios/prefecture — DEMARCHES catalog', () => {
  it('contient 25+ démarches', () => {
    expect(DEMARCHES.length).toBeGreaterThanOrEqual(25);
  });
  it('contient au moins 15 FR', () => {
    expect(DEMARCHES.filter((d) => d.country === 'fr').length).toBeGreaterThanOrEqual(15);
  });
  it('contient au moins 8 MC', () => {
    expect(DEMARCHES.filter((d) => d.country === 'mc').length).toBeGreaterThanOrEqual(8);
  });
  it('chaque démarche a documents non vide', () => {
    DEMARCHES.forEach((d) => {
      expect(d.documents.length).toBeGreaterThan(0);
    });
  });
  it('chaque démarche a au moins 1 référence légale', () => {
    DEMARCHES.forEach((d) => {
      expect(d.references.length).toBeGreaterThanOrEqual(1);
    });
  });
  it('chaque démarche a au moins 1 lien officiel', () => {
    DEMARCHES.forEach((d) => {
      expect(d.liens.length).toBeGreaterThanOrEqual(1);
    });
  });
  it('démarches ids uniques', () => {
    const ids = DEMARCHES.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('features/studios/prefecture — find helpers', () => {
  it('findDemarche trouve cni_fr', () => {
    expect(findDemarche('cni_fr')?.label).toContain('Carte Nationale');
  });
  it('findDemarche retourne undefined sinon', () => {
    expect(findDemarche('xxx')).toBeUndefined();
  });
  it('demarchesByCountry FR', () => {
    expect(demarchesByCountry('fr').length).toBeGreaterThan(10);
  });
  it('demarchesByCategory etranger FR', () => {
    expect(demarchesByCategory('fr', 'etranger').length).toBeGreaterThan(5);
  });
});

describe('features/studios/prefecture — Letters', () => {
  it('LETTER_TEMPLATES contient au moins 5 templates', () => {
    expect(LETTER_TEMPLATES.length).toBeGreaterThanOrEqual(5);
  });
  it('findLetter trouve recours_prefecture', () => {
    expect(findLetter('recours_prefecture')?.label).toContain('Recours');
  });
  it('generateLetter remplace les variables', () => {
    const tpl = findLetter('attestation_hebergement')!;
    const out = generateLetter(tpl, { 'NOM PRÉNOM': 'Kevin DESARZENS', 'DATE': '2026-05-04' });
    expect(out).toContain('Kevin DESARZENS');
  });
});

describe('features/studios/prefecture — Dossier', () => {
  it('createDossier renvoie un draft', () => {
    const d = createDossier(TEST_UID, 'cni_fr');
    expect(d.status).toBe('draft');
    expect(d.demarcheId).toBe('cni_fr');
    expect(d.documentsCheckes.length).toBe(0);
  });
  it('checkDocument toggle', () => {
    let d = createDossier(TEST_UID, 'cni_fr');
    d = checkDocument(d, 'Acte naissance < 3 mois');
    expect(d.documentsCheckes.length).toBe(1);
    d = checkDocument(d, 'Acte naissance < 3 mois');
    expect(d.documentsCheckes.length).toBe(0);
  });
  it('calcCompleteness 0 sur dossier vide', () => {
    const d = createDossier(TEST_UID, 'cni_fr');
    expect(calcCompleteness(d)).toBe(0);
  });
  it('calcCompleteness 20% si 1/5 docs', () => {
    let d = createDossier(TEST_UID, 'cni_fr');
    d = checkDocument(d, 'Acte naissance < 3 mois');
    const dem = findDemarche('cni_fr')!;
    const expected = Math.round((1 / dem.documents.length) * 100);
    expect(calcCompleteness(d)).toBe(expected);
  });
});

describe('features/studios/prefecture — Storage', () => {
  beforeEach(() => localStorage.clear());
  it('save + load', () => {
    const d = createDossier(TEST_UID, 'cni_fr');
    expect(prefectureStudioStore.save(TEST_UID, d)).toBe(true);
    expect(prefectureStudioStore.load(TEST_UID, d.id)?.id).toBe(d.id);
  });
  it('list retourne dossiers', () => {
    const d = createDossier(TEST_UID, 'passeport_fr');
    prefectureStudioStore.save(TEST_UID, d);
    expect(prefectureStudioStore.list(TEST_UID).length).toBeGreaterThanOrEqual(1);
  });
  it('remove', () => {
    const d = createDossier(TEST_UID, 'cni_fr');
    prefectureStudioStore.save(TEST_UID, d);
    expect(prefectureStudioStore.remove(TEST_UID, d.id)).toBe(true);
  });
  it('getDossierKey', () => {
    expect(getDossierKey('u', 'd')).toContain(STORAGE_PREFIX);
  });
});
