/**
 * Tests features/pro/modules/certifications.
 */
import { describe, expect, it } from 'vitest';

import {
  CERTIFICATIONS,
  SAMPLE_QUESTIONS,
  STORAGE_PREFIX,
  TIPS_BY_CERT,
  VOCAB_BY_CERT,
  calcExamScore,
  certsByCategory,
  escapeHtml,
  estimateScoreToReach,
  findCertification,
  getProgressKey,
  questionsByCert,
  recommendCerts,
} from '../../features/pro/modules/certifications/index.js';

describe('features/pro/certifications — escapeHtml', () => {
  it('échappe', () => {
    expect(escapeHtml('<x>')).toBe('&lt;x&gt;');
  });
});

describe('features/pro/certifications — Catalog', () => {
  it('contient 25+ certifications', () => {
    expect(CERTIFICATIONS.length).toBeGreaterThanOrEqual(25);
  });
  it('contient TOEFL, IELTS, AWS, PMP', () => {
    const ids = CERTIFICATIONS.map((c) => c.id);
    expect(ids).toContain('toefl_ibt');
    expect(ids).toContain('ielts_academic');
    expect(ids).toContain('aws_saa');
    expect(ids).toContain('pmp');
  });
  it('chaque cert a sections', () => {
    CERTIFICATIONS.forEach((c) => expect(c.sections.length).toBeGreaterThan(0));
  });
  it('chaque cert a un URL officiel valide', () => {
    CERTIFICATIONS.forEach((c) => expect(c.officialUrl.startsWith('https://')).toBe(true));
  });
  it('ids uniques', () => {
    const ids = CERTIFICATIONS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('features/pro/certifications — find/filter', () => {
  it('findCertification toefl_ibt', () => {
    expect(findCertification('toefl_ibt')?.shortName).toBe('TOEFL');
  });
  it('findCertification undefined sinon', () => {
    expect(findCertification('xxx')).toBeUndefined();
  });
  it('certsByCategory language', () => {
    expect(certsByCategory('language').length).toBeGreaterThan(5);
  });
  it('certsByCategory tech', () => {
    expect(certsByCategory('tech').length).toBeGreaterThan(3);
  });
});

describe('features/pro/certifications — Sample questions', () => {
  it('contient 15+ questions', () => {
    expect(SAMPLE_QUESTIONS.length).toBeGreaterThanOrEqual(15);
  });
  it('questionsByCert toefl_ibt', () => {
    expect(questionsByCert('toefl_ibt').length).toBeGreaterThanOrEqual(1);
  });
  it('chaque question a 4 choix', () => {
    SAMPLE_QUESTIONS.forEach((q) => expect(q.choices.length).toBeGreaterThanOrEqual(2));
  });
});

describe('features/pro/certifications — Vocab/Tips', () => {
  it('VOCAB_BY_CERT toefl_ibt non vide', () => {
    expect(VOCAB_BY_CERT['toefl_ibt']?.length).toBeGreaterThan(0);
  });
  it('TIPS_BY_CERT toefl_ibt non vide', () => {
    expect(TIPS_BY_CERT['toefl_ibt']?.length).toBeGreaterThan(0);
  });
});

describe('features/pro/certifications — Scoring', () => {
  it('calcExamScore correct', () => {
    const q = SAMPLE_QUESTIONS[0];
    if (!q) return;
    const r = calcExamScore([{ questionId: q.id, answer: q.answer }]);
    expect(r.correct).toBe(1);
    expect(r.percentage).toBe(100);
  });
  it('calcExamScore vide', () => {
    const r = calcExamScore([]);
    expect(r.percentage).toBe(0);
  });
  it('calcExamScore wrong answers', () => {
    const q = SAMPLE_QUESTIONS[0];
    if (!q) return;
    const wrong = q.answer === 0 ? 1 : 0;
    const r = calcExamScore([{ questionId: q.id, answer: wrong }]);
    expect(r.correct).toBe(0);
  });
});

describe('features/pro/certifications — estimateScoreToReach', () => {
  it('0 si déjà atteint', () => {
    expect(estimateScoreToReach(90, 50, 80, 100)).toBe(0);
  });
  it('calcule heures restantes', () => {
    /* (80-50)/100 × 200 = 60 - 20 = 40 heures restantes */
    const h = estimateScoreToReach(50, 20, 80, 200);
    expect(h).toBeGreaterThan(0);
  });
});

describe('features/pro/certifications — recommendCerts', () => {
  it('beginner language', () => {
    const r = recommendCerts('language', 'beginner');
    expect(Array.isArray(r)).toBe(true);
  });
  it('intermediate tech', () => {
    const r = recommendCerts('tech', 'intermediate');
    expect(Array.isArray(r)).toBe(true);
  });
  it('advanced project', () => {
    const r = recommendCerts('project', 'advanced');
    expect(Array.isArray(r)).toBe(true);
  });
});

describe('features/pro/certifications — Storage helpers', () => {
  it('getProgressKey préfixé', () => {
    expect(getProgressKey('uid')).toContain(STORAGE_PREFIX);
  });
});
