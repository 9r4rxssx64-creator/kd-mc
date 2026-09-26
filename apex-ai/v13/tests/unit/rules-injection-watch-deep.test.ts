/**
 * APEX v13 — Tests deep rules-injection-watch.ts (push 63% → 95%+).
 *
 * Couvre audit complet + auto-fix + escalation + persistence audits +
 * compteur fail + registerSentinel.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const buildSystemPromptDeepMock = vi.fn();
const syncDocsAtBootMock = vi.fn().mockResolvedValue(undefined);
const syncMetaFilesAtBootMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../../core/memory.js', () => ({
  memory: {
    buildSystemPromptDeep: (...args: unknown[]) => buildSystemPromptDeepMock(...args),
    syncDocsAtBoot: (...args: unknown[]) => syncDocsAtBootMock(...args),
    syncMetaFilesAtBoot: (...args: unknown[]) => syncMetaFilesAtBootMock(...args),
  },
}));

const rulesListMock = vi.fn();
vi.mock('../../services/core-svc/rules-engine.js', () => ({
  rulesEngine: { list: () => rulesListMock() },
}));

import { rulesInjectionWatch } from '../../services/sentinels/rules-injection-watch.js';

const AUDIT_KEY = 'apex_v13_rules_injection_audit';
const FAIL_KEY = 'apex_v13_rules_injection_fail_count';
const TODO_KEY = 'ax_claude_todo';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe('rules-injection-watch — audit() succès', () => {
  it('prompt complet (5 sections présentes) → ok=true, missing=[]', async () => {
    buildSystemPromptDeepMock.mockResolvedValue(
      `Top règles permanentes ... Top 10 erreurs ... Méthode de travail expert ... Skills disponibles 🛠️ ... capacités récentes v13.4.0 ...`,
    );
    const r = await rulesInjectionWatch.audit();
    expect(r.ok).toBe(true);
    expect(r.missing).toHaveLength(0);
    expect(r.details.hasRulesSection).toBe(true);
    expect(r.details.hasErrorsSection).toBe(true);
    expect(r.details.hasMethodSection).toBe(true);
    expect(r.details.hasSkillsSection).toBe(true);
    expect(r.details.hasCapabilitiesSection).toBe(true);
  });

  it('détecte variantes wording "Règles permanentes"', async () => {
    buildSystemPromptDeepMock.mockResolvedValue(
      `Règles permanentes... erreurs documentées... workflow expert... Skills disponibles... capacités récentes...`,
    );
    const r = await rulesInjectionWatch.audit();
    expect(r.details.hasRulesSection).toBe(true);
    expect(r.details.hasErrorsSection).toBe(true);
    expect(r.details.hasMethodSection).toBe(true);
  });

  it('détecte capabilities via v13.4.0 alternative', async () => {
    buildSystemPromptDeepMock.mockResolvedValue(
      `Top règles permanentes...erreurs documentées...workflow expert...🛠️...v13.4.0`,
    );
    const r = await rulesInjectionWatch.audit();
    expect(r.details.hasCapabilitiesSection).toBe(true);
  });

  it('succès reset fail counter', async () => {
    localStorage.setItem(FAIL_KEY, '5');
    buildSystemPromptDeepMock.mockResolvedValue(
      `Top règles permanentes ... Top 10 erreurs ... Méthode de travail expert ... Skills 🛠️ ... v13.4.0 ...`,
    );
    await rulesInjectionWatch.audit();
    expect(localStorage.getItem(FAIL_KEY)).toBeNull();
  });
});

describe('rules-injection-watch — audit() fail + auto-fix', () => {
  it('prompt vide → missing toutes sections, ok=false', async () => {
    buildSystemPromptDeepMock.mockResolvedValue('');
    const r = await rulesInjectionWatch.audit();
    expect(r.ok).toBe(false);
    expect(r.missing).toContain('rules');
    expect(r.missing).toContain('errors');
    expect(r.missing).toContain('method');
    expect(r.missing).toContain('skills');
    expect(r.missing).toContain('capabilities');
    expect(r.promptSize).toBe(0);
  });

  it('fail → auto-fix appelle syncDocsAtBoot + syncMetaFilesAtBoot', async () => {
    buildSystemPromptDeepMock.mockResolvedValue('');
    await rulesInjectionWatch.audit();
    expect(syncDocsAtBootMock).toHaveBeenCalledWith({ forceRefresh: true });
    expect(syncMetaFilesAtBootMock).toHaveBeenCalledWith({ forceRefresh: true });
  });

  it('buildSystemPromptDeep throw → prompt vide gracieusement', async () => {
    buildSystemPromptDeepMock.mockRejectedValue(new Error('Memory failure'));
    const r = await rulesInjectionWatch.audit();
    expect(r.ok).toBe(false);
    expect(r.promptSize).toBe(0);
  });

  it('auto-fix throw → audit retourne quand même', async () => {
    buildSystemPromptDeepMock.mockResolvedValue('');
    syncDocsAtBootMock.mockRejectedValueOnce(new Error('Network down'));
    const r = await rulesInjectionWatch.audit();
    expect(r.ok).toBe(false);
  });

  it('fail bump compteur', async () => {
    buildSystemPromptDeepMock.mockResolvedValue('');
    await rulesInjectionWatch.audit();
    expect(localStorage.getItem(FAIL_KEY)).toBe('1');
    await rulesInjectionWatch.audit();
    expect(localStorage.getItem(FAIL_KEY)).toBe('2');
  });
});

describe('rules-injection-watch — escalation', () => {
  it('3 fails consécutifs → escalade dans ax_claude_todo', async () => {
    buildSystemPromptDeepMock.mockResolvedValue('');
    await rulesInjectionWatch.audit();
    await rulesInjectionWatch.audit();
    await rulesInjectionWatch.audit();
    const todo = JSON.parse(localStorage.getItem(TODO_KEY) ?? '[]') as Array<Record<string, unknown>>;
    expect(todo.length).toBeGreaterThan(0);
    expect(todo[todo.length - 1]?.kind).toBe('critical');
    expect(String(todo[todo.length - 1]?.id ?? '')).toContain('rules_injection_fail');
  });

  it('escalation préserve les anciens todos', async () => {
    localStorage.setItem(TODO_KEY, JSON.stringify([{ id: 'old', kind: 'warn', title: 'X' }]));
    buildSystemPromptDeepMock.mockResolvedValue('');
    await rulesInjectionWatch.audit();
    await rulesInjectionWatch.audit();
    await rulesInjectionWatch.audit();
    const todo = JSON.parse(localStorage.getItem(TODO_KEY) ?? '[]');
    expect(todo[0]?.id).toBe('old');
    expect(todo.length).toBe(2);
  });

  it('todo array cap 100 entries', async () => {
    const big = Array.from({ length: 105 }, (_, i) => ({ id: `t${i}`, kind: 'info' }));
    localStorage.setItem(TODO_KEY, JSON.stringify(big));
    buildSystemPromptDeepMock.mockResolvedValue('');
    await rulesInjectionWatch.audit();
    await rulesInjectionWatch.audit();
    await rulesInjectionWatch.audit();
    const todo = JSON.parse(localStorage.getItem(TODO_KEY) ?? '[]');
    expect(todo.length).toBeLessThanOrEqual(100);
  });
});

describe('rules-injection-watch — persistence audits', () => {
  it('audits persistés dans localStorage', async () => {
    buildSystemPromptDeepMock.mockResolvedValue('all sections ok... Top règles permanentes ... Top 10 erreurs ... Méthode de travail ... 🛠️ ... v13.4.0 ...');
    await rulesInjectionWatch.audit();
    const raw = localStorage.getItem(AUDIT_KEY);
    expect(raw).not.toBeNull();
    const arr = JSON.parse(raw!);
    expect(arr.length).toBe(1);
  });

  it('audits cap 30 entries (MAX_AUDIT_ENTRIES)', async () => {
    /* Pre-fill avec 35 audits */
    const fakeAudits = Array.from({ length: 35 }, (_, i) => ({
      ts: i,
      ok: true,
      missing: [],
      promptSize: 100,
      details: {
        hasRulesSection: true,
        hasErrorsSection: true,
        hasMethodSection: true,
        hasSkillsSection: true,
        hasCapabilitiesSection: true,
      },
    }));
    localStorage.setItem(AUDIT_KEY, JSON.stringify(fakeAudits));

    buildSystemPromptDeepMock.mockResolvedValue(
      'Top règles permanentes ... Top 10 erreurs ... Méthode de travail expert ... Skills 🛠️ ... v13.4.0 ...',
    );
    await rulesInjectionWatch.audit();
    const arr = JSON.parse(localStorage.getItem(AUDIT_KEY) ?? '[]');
    expect(arr.length).toBeLessThanOrEqual(30);
  });
});

describe('rules-injection-watch — getRecentAudits / getStats', () => {
  it('getRecentAudits vide → []', () => {
    expect(rulesInjectionWatch.getRecentAudits()).toHaveLength(0);
  });

  it('getRecentAudits returns last n', () => {
    const fakes = Array.from({ length: 15 }, (_, i) => ({
      ts: i,
      ok: i % 2 === 0,
      missing: [],
      promptSize: 100,
      details: {
        hasRulesSection: true,
        hasErrorsSection: true,
        hasMethodSection: true,
        hasSkillsSection: true,
        hasCapabilitiesSection: true,
      },
    }));
    localStorage.setItem(AUDIT_KEY, JSON.stringify(fakes));
    expect(rulesInjectionWatch.getRecentAudits(5)).toHaveLength(5);
  });

  it('getRecentAudits JSON corrupt → []', () => {
    localStorage.setItem(AUDIT_KEY, 'not json');
    expect(rulesInjectionWatch.getRecentAudits()).toHaveLength(0);
  });

  it('getRecentAudits non array → []', () => {
    localStorage.setItem(AUDIT_KEY, '{"not":"array"}');
    expect(rulesInjectionWatch.getRecentAudits()).toHaveLength(0);
  });

  it('getStats audits24h + passRate corrects', () => {
    const now = Date.now();
    const fakes = [
      { ts: now - 1000, ok: true, missing: [], promptSize: 100, details: { hasRulesSection: true, hasErrorsSection: true, hasMethodSection: true, hasSkillsSection: true, hasCapabilitiesSection: true } },
      { ts: now - 2000, ok: false, missing: ['rules'], promptSize: 50, details: { hasRulesSection: false, hasErrorsSection: true, hasMethodSection: true, hasSkillsSection: true, hasCapabilitiesSection: true } },
      { ts: now - 25 * 60 * 60 * 1000, ok: true, missing: [], promptSize: 100, details: { hasRulesSection: true, hasErrorsSection: true, hasMethodSection: true, hasSkillsSection: true, hasCapabilitiesSection: true } },
    ];
    localStorage.setItem(AUDIT_KEY, JSON.stringify(fakes));
    const s = rulesInjectionWatch.getStats();
    expect(s.auditsLast24h).toBe(2);
    expect(s.passRate).toBe(0.5);
    expect(s.lastAudit).not.toBeNull();
  });

  it('getStats aucun audit → passRate=0, lastAudit=null', () => {
    const s = rulesInjectionWatch.getStats();
    expect(s.auditsLast24h).toBe(0);
    expect(s.passRate).toBe(0);
    expect(s.lastAudit).toBeNull();
  });
});

describe('rules-injection-watch — registerSentinel', () => {
  it('registerSentinel sync retourne true', () => {
    const r = rulesInjectionWatch.registerSentinel();
    expect(r).toBe(true);
  });
});

describe('rules-injection-watch — bumpFailCount edge cases', () => {
  it('FAIL_KEY corrupt non-int → fallback 0', async () => {
    localStorage.setItem(FAIL_KEY, 'not a number');
    buildSystemPromptDeepMock.mockResolvedValue('');
    await rulesInjectionWatch.audit();
    /* parseInt("not a number") = NaN → || 0 → 0 → next = 1 */
    expect(localStorage.getItem(FAIL_KEY)).toBe('1');
  });
});
