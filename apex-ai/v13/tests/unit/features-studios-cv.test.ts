/**
 * Tests features/studios/cv (port v12 vCVStudio).
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import {
  MAX_EXPERIENCES,
  MAX_FORMATIONS,
  MAX_COMPETENCES,
  STORAGE_PREFIX,
  TEMPLATES,
  calcCompleteness,
  createExperience,
  createFormation,
  cvStudioStore,
  escapeHtml,
  getStorageKey,
  initCV,
  isValidEmail,
} from '../../features/studios/cv/index.js';

const TEST_UID = 'test_cv_uid';

describe('features/studios/cv — escapeHtml', () => {
  it('échappe HTML', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
  });
});

describe('features/studios/cv — TEMPLATES catalog', () => {
  it('liste >=15 templates', () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(15);
  });

  it('chaque template a id, label, emoji', () => {
    for (const t of TEMPLATES) {
      expect(t.id).toBeTruthy();
      expect(t.label).toBeTruthy();
      expect(t.emoji.length).toBeGreaterThan(0);
    }
  });

  it('contient classique + moderne', () => {
    const ids = TEMPLATES.map((t) => t.id);
    expect(ids).toContain('classique');
    expect(ids).toContain('moderne');
  });

  it('tous ids uniques', () => {
    const ids = TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('features/studios/cv — initCV', () => {
  it('crée CV vide avec template choisi', () => {
    const cv = initCV('moderne');
    expect(cv.template).toBe('moderne');
    expect(cv.identite.prenom).toBe('');
    expect(cv.experiences).toEqual([]);
    expect(cv.formations).toEqual([]);
    expect(cv.langues.length).toBeGreaterThanOrEqual(1);
  });

  it('pré-remplit prénom/nom si fourni', () => {
    const cv = initCV('classique', { prenom: 'Kevin', nom: 'DESARZENS' });
    expect(cv.identite.prenom).toBe('Kevin');
    expect(cv.identite.nom).toBe('DESARZENS');
  });
});

describe('features/studios/cv — isValidEmail', () => {
  it('accepte emails valides', () => {
    expect(isValidEmail('a@b.fr')).toBe(true);
    expect(isValidEmail('kevin.desarzens@gmail.com')).toBe(true);
  });

  it('refuse emails invalides', () => {
    expect(isValidEmail('not-an-email')).toBe(false);
    expect(isValidEmail('a@')).toBe(false);
    expect(isValidEmail('@b.fr')).toBe(false);
    expect(isValidEmail('')).toBe(false);
  });
});

describe('features/studios/cv — calcCompleteness', () => {
  it('CV vide = score bas', () => {
    expect(calcCompleteness(initCV('classique'))).toBeLessThan(20);
  });

  it('CV identité partielle augmente score', () => {
    const cv = initCV('classique');
    cv.identite.prenom = 'Kevin';
    cv.identite.nom = 'DESARZENS';
    cv.identite.email = 'k@d.fr';
    cv.identite.titre = 'Dev';
    expect(calcCompleteness(cv)).toBeGreaterThan(20);
  });

  it('CV bien rempli ≥ 80', () => {
    const cv = initCV('moderne');
    cv.identite.prenom = 'Kevin';
    cv.identite.nom = 'D';
    cv.identite.email = 'k@d.fr';
    cv.identite.telephone = '06';
    cv.identite.titre = 'Dev';
    cv.experiences = [createExperience(), createExperience(), createExperience()];
    cv.formations = [createFormation()];
    cv.competences = ['JS', 'TS', 'CSS'];
    cv.langues = ['FR', 'EN'];
    expect(calcCompleteness(cv)).toBeGreaterThanOrEqual(80);
  });

  it('score capped à 100', () => {
    const cv = initCV('moderne');
    cv.identite.prenom = 'A';
    cv.identite.nom = 'B';
    cv.identite.email = 'a@b.fr';
    cv.identite.telephone = '06';
    cv.identite.titre = 'X';
    cv.experiences = Array.from({ length: 10 }, () => createExperience());
    cv.formations = [createFormation(), createFormation()];
    cv.competences = ['a', 'b', 'c', 'd'];
    cv.langues = ['fr', 'en', 'es'];
    expect(calcCompleteness(cv)).toBeLessThanOrEqual(100);
  });
});

describe('features/studios/cv — getStorageKey', () => {
  it('utilise prefix ax_cv_', () => {
    expect(STORAGE_PREFIX).toBe('ax_cv_');
    expect(getStorageKey('uid')).toBe('ax_cv_uid');
  });
});

describe('features/studios/cv — constants', () => {
  it('MAX_EXPERIENCES = 20', () => {
    expect(MAX_EXPERIENCES).toBe(20);
  });

  it('MAX_FORMATIONS = 10', () => {
    expect(MAX_FORMATIONS).toBe(10);
  });

  it('MAX_COMPETENCES = 30', () => {
    expect(MAX_COMPETENCES).toBe(30);
  });
});

describe('features/studios/cv — cvStudioStore CRUD', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it('load retourne null si pas de CV', () => {
    expect(cvStudioStore.load(TEST_UID)).toBeNull();
  });

  it('save + load roundtrip', () => {
    const cv = initCV('moderne');
    cv.identite.prenom = 'Kevin';
    expect(cvStudioStore.save(TEST_UID, cv)).toBe(true);
    const loaded = cvStudioStore.load(TEST_UID);
    expect(loaded?.identite.prenom).toBe('Kevin');
    expect(loaded?.template).toBe('moderne');
  });

  it('save refuse uid vide', () => {
    expect(cvStudioStore.save('', initCV('classique'))).toBe(false);
  });

  it('setTemplate change template', () => {
    cvStudioStore.save(TEST_UID, initCV('classique'));
    const updated = cvStudioStore.setTemplate(TEST_UID, 'creatif');
    expect(updated.template).toBe('creatif');
  });

  it('addExperience ajoute si < MAX', () => {
    cvStudioStore.save(TEST_UID, initCV('classique'));
    const cv = cvStudioStore.addExperience(TEST_UID);
    expect(cv?.experiences.length).toBe(1);
  });

  it('addExperience refuse si MAX atteint', () => {
    const cv = initCV('classique');
    for (let i = 0; i < MAX_EXPERIENCES; i++) cv.experiences.push(createExperience());
    cvStudioStore.save(TEST_UID, cv);
    const after = cvStudioStore.addExperience(TEST_UID);
    expect(after?.experiences.length).toBe(MAX_EXPERIENCES);
  });

  it('removeExperience supprime', () => {
    const cv = initCV('classique');
    const exp = createExperience();
    cv.experiences.push(exp);
    cvStudioStore.save(TEST_UID, cv);
    expect(cvStudioStore.removeExperience(TEST_UID, exp.id)).toBe(true);
    expect(cvStudioStore.load(TEST_UID)?.experiences.length).toBe(0);
  });

  it('setIdentite met à jour partial', () => {
    cvStudioStore.save(TEST_UID, initCV('classique'));
    cvStudioStore.setIdentite(TEST_UID, { prenom: 'Kevin', titre: 'Dev' });
    const cv = cvStudioStore.load(TEST_UID);
    expect(cv?.identite.prenom).toBe('Kevin');
    expect(cv?.identite.titre).toBe('Dev');
  });

  it('clear supprime CV', () => {
    cvStudioStore.save(TEST_UID, initCV('classique'));
    expect(cvStudioStore.clear(TEST_UID)).toBe(true);
    expect(cvStudioStore.load(TEST_UID)).toBeNull();
  });

  it('per-user isolation', () => {
    cvStudioStore.save('uid_a', initCV('classique', { prenom: 'A' }));
    cvStudioStore.save('uid_b', initCV('moderne', { prenom: 'B' }));
    expect(cvStudioStore.load('uid_a')?.identite.prenom).toBe('A');
    expect(cvStudioStore.load('uid_b')?.identite.prenom).toBe('B');
  });

  it('load gère localStorage corrompu', () => {
    localStorage.setItem('ax_cv_corrupt', '{not json}');
    expect(cvStudioStore.load('corrupt')).toBeNull();
  });
});
