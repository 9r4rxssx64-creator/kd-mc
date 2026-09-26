/**
 * Tests features/self-diag (port v12 vSelfDiag).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  escapeHtml,
  filterFindingsBySeverity,
  loadLessons,
  scoreColor,
  scoreGrade,
  type LessonLearned,
} from '../../features/self-diag/index.js';
import type { Finding } from '../../services/admin/apex-self-audit.js';

const FAKE_FINDINGS: ReadonlyArray<Finding> = [
  { id: 'f1', axis: 'security', severity: 'p0_critical', title: 'Crit', description: 'd1', ts: 1 },
  { id: 'f2', axis: 'performance', severity: 'p1_high', title: 'High', description: 'd2', ts: 2 },
  { id: 'f3', axis: 'ux', severity: 'p2_medium', title: 'Med', description: 'd3', ts: 3 },
  { id: 'f4', axis: 'tests', severity: 'p3_low', title: 'Low', description: 'd4', ts: 4 },
  { id: 'f5', axis: 'architecture', severity: 'info', title: 'Info', description: 'd5', ts: 5 },
];

describe('features/self-diag — escapeHtml', () => {
  it('échappe < > & " \'', () => {
    expect(escapeHtml('<a>')).toBe('&lt;a&gt;');
    expect(escapeHtml("'q'")).toBe('&#39;q&#39;');
    expect(escapeHtml('a&b')).toBe('a&amp;b');
  });
});

describe('features/self-diag — scoreColor', () => {
  it('vert si >= 90', () => {
    expect(scoreColor(95)).toBe('#22cc77');
    expect(scoreColor(90)).toBe('#22cc77');
  });

  it('vert clair si 75-89', () => {
    expect(scoreColor(85)).toBe('#a0c878');
    expect(scoreColor(75)).toBe('#a0c878');
  });

  it('jaune si 60-74', () => {
    expect(scoreColor(70)).toBe('#ffaa00');
  });

  it('orange si 40-59', () => {
    expect(scoreColor(45)).toBe('#ff8c42');
  });

  it('rouge si < 40', () => {
    expect(scoreColor(20)).toBe('#ff5858');
    expect(scoreColor(0)).toBe('#ff5858');
  });
});

describe('features/self-diag — scoreGrade', () => {
  it('A+ si >= 95', () => {
    expect(scoreGrade(100)).toBe('A+');
    expect(scoreGrade(95)).toBe('A+');
  });

  it('A si 85-94', () => {
    expect(scoreGrade(90)).toBe('A');
    expect(scoreGrade(85)).toBe('A');
  });

  it('B si 70-84', () => {
    expect(scoreGrade(75)).toBe('B');
    expect(scoreGrade(80)).toBe('B');
  });

  it('C si 55-69', () => {
    expect(scoreGrade(60)).toBe('C');
  });

  it('D si 40-54', () => {
    expect(scoreGrade(45)).toBe('D');
  });

  it('F si < 40', () => {
    expect(scoreGrade(30)).toBe('F');
    expect(scoreGrade(0)).toBe('F');
  });
});

describe('features/self-diag — filterFindingsBySeverity', () => {
  it('retourne tout si min = info (le plus bas)', () => {
    const r = filterFindingsBySeverity(FAKE_FINDINGS, 'info');
    expect(r).toHaveLength(FAKE_FINDINGS.length);
  });

  it('filtre p2_medium et plus haut', () => {
    const r = filterFindingsBySeverity(FAKE_FINDINGS, 'p2_medium');
    expect(r).toHaveLength(3); /* p0+p1+p2 */
    expect(r.every((f) => ['p0_critical', 'p1_high', 'p2_medium'].includes(f.severity))).toBe(true);
  });

  it('filtre p0_critical seul', () => {
    const r = filterFindingsBySeverity(FAKE_FINDINGS, 'p0_critical');
    expect(r).toHaveLength(1);
    expect(r[0]?.severity).toBe('p0_critical');
  });

  it('filtre p1_high et plus haut', () => {
    const r = filterFindingsBySeverity(FAKE_FINDINGS, 'p1_high');
    expect(r).toHaveLength(2);
  });

  it('retourne [] si findings vides', () => {
    expect(filterFindingsBySeverity([], 'p2_medium')).toEqual([]);
  });
});

describe('features/self-diag — loadLessons', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it('retourne [] si pas de lessons', () => {
    expect(loadLessons()).toEqual([]);
  });

  it('charge des lessons valides', () => {
    const fakeLessons: LessonLearned[] = [
      { id: 'L1', category: 'auth', title: 'Bug X', text: 'Description X', severity: 'critical', ts: 1234 },
      { id: 'L2', category: 'perf', title: 'Slow Y', text: 'Description Y', severity: 'warn', ts: 5678 },
    ];
    localStorage.setItem('ax_lessons_learned_struct', JSON.stringify(fakeLessons));
    const r = loadLessons();
    expect(r).toHaveLength(2);
  });

  it('filtre les entries invalides', () => {
    const mixed = [
      { id: 'L1', category: 'a', title: 'Valid', text: 't', severity: 'info', ts: 100 },
      { invalidField: 'bad' }, /* will be filtered */
      null, /* will be filtered */
      'string', /* will be filtered */
      { id: 'L2', category: 'b', title: 'Valid2', text: 't', severity: 'warn', ts: 200 },
    ];
    localStorage.setItem('ax_lessons_learned_struct', JSON.stringify(mixed));
    const r = loadLessons();
    expect(r).toHaveLength(2);
  });

  it('retourne [] si JSON malformé', () => {
    localStorage.setItem('ax_lessons_learned_struct', '{invalid');
    expect(loadLessons()).toEqual([]);
  });

  it('retourne [] si pas array', () => {
    localStorage.setItem('ax_lessons_learned_struct', '"string-not-array"');
    expect(loadLessons()).toEqual([]);
  });

  it('charge avec resolved flag', () => {
    const lessons: LessonLearned[] = [
      { id: 'L1', category: 'x', title: 'T', text: 't', severity: 'info', ts: 1, resolved: true },
    ];
    localStorage.setItem('ax_lessons_learned_struct', JSON.stringify(lessons));
    const r = loadLessons();
    expect(r[0]?.resolved).toBe(true);
  });
});

describe('features/self-diag — apex-self-audit service intégration', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it('service apex-self-audit se charge', async () => {
    const { apexSelfAudit } = await import('../../services/admin/apex-self-audit.js');
    expect(apexSelfAudit).toBeTruthy();
    expect(typeof apexSelfAudit.runFullAudit).toBe('function');
    expect(typeof apexSelfAudit.getLastReport).toBe('function');
  });

  it('getLastReport retourne null si jamais audité', async () => {
    const { apexSelfAudit } = await import('../../services/admin/apex-self-audit.js');
    expect(apexSelfAudit.getLastReport()).toBeNull();
  });
});
