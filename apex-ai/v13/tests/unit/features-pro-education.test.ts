/**
 * Tests features/pro/modules/education.
 */
import { describe, expect, it } from 'vitest';

import {
  CONJUGATIONS_EN,
  CONJUGATIONS_ES,
  CONJUGATIONS_FR,
  QUESTIONS_BANK,
  SUBJECTS,
  circleArea,
  circleCircumference,
  createFlashcard,
  cubeVolume,
  cylinderVolume,
  dueCards,
  escapeHtml,
  findSubject,
  matrixDeterminant2x2,
  matrixMultiply,
  numericIntegrate,
  pythagore,
  questionsByDifficulty,
  questionsBySubject,
  randomQuiz,
  rectangleArea,
  reviewFlashcard,
  spheresVolume,
  statMean,
  statMedian,
  statStdDev,
  symbolicDerivative,
  triangleArea,
} from '../../features/pro/modules/education/index.js';

describe('features/pro/education — escapeHtml', () => {
  it('échappe', () => {
    expect(escapeHtml('<x>')).toBe('&lt;x&gt;');
  });
});

describe('features/pro/education — Subjects', () => {
  it('SUBJECTS contient 14 matières', () => {
    expect(SUBJECTS.length).toBe(14);
  });
  it('SUBJECTS chaque a emoji', () => {
    SUBJECTS.forEach((s) => expect(s.emoji.length).toBeGreaterThan(0));
  });
  it('findSubject trouve math', () => {
    expect(findSubject('math')?.label).toBe('Mathématiques');
  });
});

describe('features/pro/education — Questions bank', () => {
  it('contient 50+ questions', () => {
    expect(QUESTIONS_BANK.length).toBeGreaterThanOrEqual(50);
  });
  it('questionsBySubject math', () => {
    const qs = questionsBySubject('math');
    expect(qs.length).toBeGreaterThan(5);
    qs.forEach((q) => expect(q.subject).toBe('math'));
  });
  it('questionsByDifficulty easy', () => {
    expect(questionsByDifficulty('easy').length).toBeGreaterThan(0);
  });
  it('randomQuiz retourne un sous-ensemble', () => {
    const q = randomQuiz('math', 5);
    expect(q.length).toBeLessThanOrEqual(5);
  });
});

describe('features/pro/education — Conjugaisons', () => {
  it('CONJUGATIONS_FR être présent', () => {
    expect(CONJUGATIONS_FR.etre?.tenses['present']?.[0]).toBe('je suis');
  });
  it('CONJUGATIONS_EN to_be', () => {
    expect(CONJUGATIONS_EN.to_be?.tenses['present']?.[0]).toBe('I am');
  });
  it('CONJUGATIONS_ES ser', () => {
    expect(CONJUGATIONS_ES.ser?.tenses['presente']?.[0]).toBe('yo soy');
  });
});

describe('features/pro/education — Flashcards SR', () => {
  it('createFlashcard initial', () => {
    const c = createFlashcard('Q', 'R', ['math']);
    expect(c.front).toBe('Q');
    expect(c.repetition).toBe(0);
    expect(c.easiness).toBe(2.5);
  });
  it('reviewFlashcard grade 5 augmente intervalle', () => {
    const c = createFlashcard('Q', 'R');
    const r1 = reviewFlashcard(c, 5);
    expect(r1.repetition).toBe(1);
    expect(r1.interval).toBeGreaterThan(0);
    const r2 = reviewFlashcard(r1, 5);
    expect(r2.interval).toBe(6);
  });
  it('reviewFlashcard grade < 3 reset', () => {
    let c = createFlashcard('Q', 'R');
    c = reviewFlashcard(c, 5);
    c = reviewFlashcard(c, 5);
    const fail = reviewFlashcard(c, 1);
    expect(fail.repetition).toBe(0);
    expect(fail.interval).toBe(1);
  });
  it('dueCards filtre', () => {
    const c = createFlashcard('Q', 'R');
    const due = dueCards([c], Date.now() + 100);
    expect(due.length).toBe(1);
  });
});

describe('features/pro/education — Math derivatives / integrals', () => {
  it('symbolicDerivative x → 1', () => {
    expect(symbolicDerivative('x')).toBe('1');
  });
  it('symbolicDerivative x^2 → 2x', () => {
    expect(symbolicDerivative('x^2')).toBe('2x');
  });
  it('symbolicDerivative sin(x) → cos(x)', () => {
    expect(symbolicDerivative('sin(x)')).toBe('cos(x)');
  });
  it('numericIntegrate identité 0..1 = 0.5', () => {
    const result = numericIntegrate((x) => x, 0, 1);
    expect(result).toBeCloseTo(0.5, 3);
  });
});

describe('features/pro/education — Matrix', () => {
  it('matrixMultiply 2x2', () => {
    const a = [[1, 2], [3, 4]];
    const b = [[5, 6], [7, 8]];
    const r = matrixMultiply(a, b);
    expect(r[0]?.[0]).toBe(19);
    expect(r[1]?.[1]).toBe(50);
  });
  it('matrixDeterminant2x2', () => {
    expect(matrixDeterminant2x2(1, 2, 3, 4)).toBe(-2);
  });
});

describe('features/pro/education — Statistics', () => {
  it('statMean', () => {
    expect(statMean([1, 2, 3, 4, 5])).toBe(3);
  });
  it('statMedian impair', () => {
    expect(statMedian([1, 3, 5])).toBe(3);
  });
  it('statMedian pair', () => {
    expect(statMedian([1, 2, 3, 4])).toBe(2.5);
  });
  it('statStdDev', () => {
    expect(statStdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2, 0);
  });
});

describe('features/pro/education — Geometry', () => {
  it('circleArea', () => {
    expect(circleArea(1)).toBeCloseTo(Math.PI, 5);
  });
  it('circleCircumference', () => {
    expect(circleCircumference(1)).toBeCloseTo(2 * Math.PI, 5);
  });
  it('rectangleArea', () => {
    expect(rectangleArea(3, 4)).toBe(12);
  });
  it('triangleArea', () => {
    expect(triangleArea(4, 5)).toBe(10);
  });
  it('cubeVolume', () => {
    expect(cubeVolume(3)).toBe(27);
  });
  it('cylinderVolume', () => {
    expect(cylinderVolume(1, 1)).toBeCloseTo(Math.PI, 5);
  });
  it('spheresVolume', () => {
    expect(spheresVolume(1)).toBeCloseTo((4 / 3) * Math.PI, 5);
  });
  it('pythagore 3-4-5', () => {
    expect(pythagore(3, 4)).toBe(5);
  });
});
