/**
 * Tests features/studios/cv — boost v13 (15 templates, ATS score, match offre,
 * cover letter, multi-langue, LinkedIn extract).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  ATS_REQUIRED_KEYWORDS_FR,
  ATS_REQUIRED_SECTIONS,
  INTERVIEW_QUESTIONS_FR,
  MAX_CERTIFICATIONS,
  MAX_PROJECTS,
  MAX_REFERENCES,
  TEMPLATES,
  calcATSScore,
  cvStudioStore,
  extractGitHubUsername,
  extractLinkedInSlug,
  generateCoverLetterTemplate,
  initCV,
  matchOffer,
} from '../../features/studios/cv/index.js';

const TEST_UID = 'test_cv_boost_uid';

describe('features/studios/cv boost — 15 templates catalog', () => {
  it('liste >=15 templates', () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(15);
  });

  it('contient tous les nouveaux templates métier', () => {
    const ids = TEMPLATES.map((t) => t.id);
    expect(ids).toContain('tech');
    expect(ids).toContain('startup');
    expect(ids).toContain('medical');
    expect(ids).toContain('juridique');
    expect(ids).toContain('finance');
    expect(ids).toContain('academique');
    expect(ids).toContain('etudiant');
    expect(ids).toContain('reconversion');
    expect(ids).toContain('international');
  });

  it('chaque template a atsScore [0..100]', () => {
    for (const t of TEMPLATES) {
      expect(t.atsScore).toBeGreaterThanOrEqual(0);
      expect(t.atsScore).toBeLessThanOrEqual(100);
    }
  });

  it('chaque template a recommendedFor avec >=1 métier', () => {
    for (const t of TEMPLATES) {
      expect(t.recommendedFor.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('classique a ATS score 100 (universel)', () => {
    const c = TEMPLATES.find((t) => t.id === 'classique');
    expect(c?.atsScore).toBe(100);
  });

  it('etudiant a ATS score élevé', () => {
    const e = TEMPLATES.find((t) => t.id === 'etudiant');
    expect(e?.atsScore).toBeGreaterThanOrEqual(95);
  });
});

describe('features/studios/cv boost — calcATSScore', () => {
  it('CV vide → score faible + issues nombreuses', () => {
    const cv = initCV('classique');
    const r = calcATSScore(cv);
    expect(r.score).toBeLessThan(60);
    expect(r.issues.length).toBeGreaterThan(0);
  });

  it('CV complet classique → score >=80', () => {
    const cv = initCV('classique');
    cv.identite.email = 'test@test.com';
    cv.identite.telephone = '0612345678';
    cv.experiences.push({
      id: 'e1', poste: 'Dev', entreprise: 'X', ville: 'Paris',
      date_debut: '2020', date_fin: '2024',
      description: 'CA augmenté de 30% sur 5 projets', achievements: ['200K€ budget géré'],
    });
    cv.formations.push({ id: 'f1', diplome: 'Master', ecole: 'Y', ville: 'Paris', annee: '2020', mention: '' });
    cv.competences = ['JS', 'TS', 'React', 'Node', 'SQL'];
    const r = calcATSScore(cv);
    expect(r.score).toBeGreaterThanOrEqual(80);
  });

  it('email invalide → issue "Email manquant ou invalide"', () => {
    const cv = initCV('classique');
    cv.identite.email = 'pas-un-email';
    const r = calcATSScore(cv);
    expect(r.issues.some((i) => i.toLowerCase().includes('email'))).toBe(true);
  });

  it('template "creatif" → atsScore < 80 → suggestion', () => {
    const cv = initCV('creatif');
    cv.identite.email = 'a@b.com';
    cv.identite.telephone = '0123456789';
    cv.experiences.push({
      id: 'e', poste: 'X', entreprise: 'Y', ville: '',
      date_debut: '', date_fin: '', description: '', achievements: [],
    });
    cv.formations.push({ id: 'f', diplome: 'D', ecole: 'E', ville: '', annee: '', mention: '' });
    cv.competences = ['A', 'B', 'C'];
    const r = calcATSScore(cv);
    expect(r.suggestions.some((s) => s.toLowerCase().includes('ats'))).toBe(true);
  });

  it('expériences non quantifiées → suggestion quantification', () => {
    const cv = initCV('classique');
    cv.identite.email = 'a@b.com';
    cv.identite.telephone = '0123';
    cv.experiences.push({
      id: 'e', poste: 'Dev', entreprise: 'X', ville: '',
      date_debut: '', date_fin: '',
      description: 'Travail sur projet', /* aucun chiffre */
      achievements: [],
    });
    cv.formations.push({ id: 'f', diplome: 'D', ecole: 'E', ville: '', annee: '', mention: '' });
    cv.competences = ['A', 'B', 'C'];
    const r = calcATSScore(cv);
    expect(r.suggestions.some((s) => s.toLowerCase().includes('quantif'))).toBe(true);
  });

  it('compétences < 3 → issue + suggestion', () => {
    const cv = initCV('classique');
    cv.identite.email = 'a@b.com';
    cv.identite.telephone = '0123';
    cv.experiences.push({
      id: 'e', poste: '', entreprise: '', ville: '',
      date_debut: '', date_fin: '', description: '', achievements: [],
    });
    cv.competences = ['JS'];
    const r = calcATSScore(cv);
    expect(r.issues.some((i) => i.toLowerCase().includes('compétence'))).toBe(true);
  });

  it('ATS_REQUIRED_KEYWORDS_FR bien défini', () => {
    expect(ATS_REQUIRED_KEYWORDS_FR.length).toBeGreaterThanOrEqual(5);
    expect(ATS_REQUIRED_KEYWORDS_FR).toContain('expérience');
    expect(ATS_REQUIRED_KEYWORDS_FR).toContain('compétences');
  });

  it('ATS_REQUIRED_SECTIONS contient email + experiences + formations', () => {
    expect(ATS_REQUIRED_SECTIONS).toContain('identite.email');
    expect(ATS_REQUIRED_SECTIONS).toContain('experiences');
    expect(ATS_REQUIRED_SECTIONS).toContain('formations');
  });
});

describe('features/studios/cv boost — matchOffer', () => {
  it('offre vide → score=0, listes vides', () => {
    const cv = initCV('classique');
    const r = matchOffer(cv, '');
    expect(r.score).toBe(0);
    expect(r.keywordsFound).toEqual([]);
    expect(r.keywordsMissing).toEqual([]);
  });

  it('CV avec keywords offre → score positif', () => {
    const cv = initCV('classique');
    cv.competences = ['javascript', 'typescript', 'react', 'node'];
    cv.identite.titre = 'Développeur fullstack';
    const r = matchOffer(cv, 'Nous cherchons un développeur fullstack expert en javascript typescript react node maîtrisant agile.');
    expect(r.score).toBeGreaterThan(40);
    expect(r.keywordsFound.length).toBeGreaterThan(0);
  });

  it('matchOffer retourne keywordsMissing si pas tout matché', () => {
    const cv = initCV('classique');
    cv.competences = ['javascript'];
    const r = matchOffer(cv, 'Développeur fullstack avec scala kafka rust experts compétences');
    /* Aucun de scala/kafka/rust dans le CV → missing */
    expect(r.keywordsMissing.length).toBeGreaterThan(0);
  });
});

describe('features/studios/cv boost — generateCoverLetterTemplate', () => {
  it('génère un template avec prénom/nom/poste', () => {
    const cv = initCV('classique');
    cv.identite.prenom = 'Jean';
    cv.identite.nom = 'Dupont';
    cv.identite.email = 'jean@dup.com';
    cv.competences = ['Vente', 'Négo', 'CRM'];
    const lettre = generateCoverLetterTemplate(cv, 'Commercial', 'ACME');
    expect(lettre).toContain('Jean');
    expect(lettre).toContain('Dupont');
    expect(lettre).toContain('Commercial');
    expect(lettre).toContain('ACME');
  });

  it('utilise placeholders si CV vide', () => {
    const cv = initCV('classique');
    const lettre = generateCoverLetterTemplate(cv, '', '');
    expect(lettre).toContain('[Prénom]');
    expect(lettre).toContain('[Poste visé]');
  });

  it('inclut top 3 compétences si présentes', () => {
    const cv = initCV('classique');
    cv.competences = ['Python', 'Django', 'PostgreSQL', 'Docker', 'AWS'];
    const lettre = generateCoverLetterTemplate(cv, 'Dev', 'Co');
    expect(lettre).toContain('Python');
    expect(lettre).toContain('Django');
    expect(lettre).toContain('PostgreSQL');
  });
});

describe('features/studios/cv boost — extracteurs LinkedIn / GitHub', () => {
  it('extractLinkedInSlug: profile public', () => {
    expect(extractLinkedInSlug('https://www.linkedin.com/in/john-doe')).toBe('john-doe');
    expect(extractLinkedInSlug('https://linkedin.com/in/jane_doe-2/')).toBe('jane_doe-2');
  });

  it('extractLinkedInSlug: URL invalide → vide', () => {
    expect(extractLinkedInSlug('')).toBe('');
    expect(extractLinkedInSlug('https://twitter.com/x')).toBe('');
  });

  it('extractGitHubUsername: profile correct', () => {
    expect(extractGitHubUsername('https://github.com/torvalds')).toBe('torvalds');
    expect(extractGitHubUsername('https://github.com/9r4rxssx64-creator/repo')).toBe('9r4rxssx64-creator');
  });

  it('extractGitHubUsername: URL invalide → vide', () => {
    expect(extractGitHubUsername('https://gitlab.com/x')).toBe('');
  });
});

describe('features/studios/cv boost — interview simulator', () => {
  it('INTERVIEW_QUESTIONS_FR a >=5 questions', () => {
    expect(INTERVIEW_QUESTIONS_FR.length).toBeGreaterThanOrEqual(5);
  });

  it('chaque question a un tip non vide', () => {
    for (const q of INTERVIEW_QUESTIONS_FR) {
      expect(q.q.length).toBeGreaterThan(5);
      expect(q.tip.length).toBeGreaterThan(10);
    }
  });
});

describe('features/studios/cv boost — multi-langue + sections étendues', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it('initCV: lang="en" stocké', () => {
    const cv = initCV('international', undefined, 'en');
    expect(cv.lang).toBe('en');
  });

  it('cvStudioStore.setLang persistant', () => {
    cvStudioStore.save(TEST_UID, initCV('classique'));
    expect(cvStudioStore.setLang(TEST_UID, 'es')).toBe(true);
    expect(cvStudioStore.load(TEST_UID)?.lang).toBe('es');
  });

  it('addCertification respecte MAX', () => {
    cvStudioStore.save(TEST_UID, initCV('classique'));
    for (let i = 0; i < MAX_CERTIFICATIONS + 5; i++) cvStudioStore.addCertification(TEST_UID);
    expect(cvStudioStore.load(TEST_UID)?.certifications.length).toBeLessThanOrEqual(MAX_CERTIFICATIONS);
  });

  it('addProject respecte MAX', () => {
    cvStudioStore.save(TEST_UID, initCV('classique'));
    for (let i = 0; i < MAX_PROJECTS + 3; i++) cvStudioStore.addProject(TEST_UID);
    expect(cvStudioStore.load(TEST_UID)?.projets.length).toBeLessThanOrEqual(MAX_PROJECTS);
  });

  it('addReference respecte MAX', () => {
    cvStudioStore.save(TEST_UID, initCV('classique'));
    for (let i = 0; i < MAX_REFERENCES + 3; i++) cvStudioStore.addReference(TEST_UID);
    expect(cvStudioStore.load(TEST_UID)?.references.length).toBeLessThanOrEqual(MAX_REFERENCES);
  });

  it('setResume cap à 600 caractères', () => {
    cvStudioStore.save(TEST_UID, initCV('classique'));
    const long = 'a'.repeat(1000);
    cvStudioStore.setResume(TEST_UID, long);
    const cv = cvStudioStore.load(TEST_UID);
    expect(cv?.resume.length).toBe(600);
  });
});
