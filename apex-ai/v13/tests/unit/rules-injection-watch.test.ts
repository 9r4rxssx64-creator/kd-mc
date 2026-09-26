/**
 * APEX v13.4.4 — Tests rules-injection-watch (sentinelle 1×/h).
 *
 * Mock memory.buildSystemPromptDeep pour vérifier détection sections.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('rules-injection-watch v13.4.4', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('audit OK quand toutes sections présentes', async () => {
    const fakePrompt =
      'IDENTITY ...\n## 📜 Top règles permanentes Kevin\n…\n## 🛡️ Top 10 erreurs documentées\n…\n## 🎓 Méthode de travail\n…\n## 🛠️ Skills disponibles\n…\n## ⚡ Tes capacités récentes (v13.4.0)\n…';
    vi.doMock('../../core/memory.js', () => ({
      memory: {
        buildSystemPromptDeep: vi.fn().mockResolvedValue(fakePrompt),
        syncDocsAtBoot: vi.fn().mockResolvedValue({}),
        syncMetaFilesAtBoot: vi.fn().mockResolvedValue({}),
      },
    }));
    const { rulesInjectionWatch } = await import('../../services/sentinels/rules-injection-watch.js');
    const r = await rulesInjectionWatch.audit();
    expect(r.ok).toBe(true);
    expect(r.missing).toHaveLength(0);
    expect(r.promptSize).toBe(fakePrompt.length);
  });

  it('audit FAIL quand sections manquantes + tente refresh', async () => {
    const partial = 'IDENTITY only';
    const refreshSpy = vi.fn().mockResolvedValue({});
    vi.doMock('../../core/memory.js', () => ({
      memory: {
        buildSystemPromptDeep: vi.fn().mockResolvedValue(partial),
        syncDocsAtBoot: refreshSpy,
        syncMetaFilesAtBoot: refreshSpy,
      },
    }));
    const { rulesInjectionWatch } = await import('../../services/sentinels/rules-injection-watch.js');
    const r = await rulesInjectionWatch.audit();
    expect(r.ok).toBe(false);
    expect(r.missing.length).toBeGreaterThan(0);
    expect(refreshSpy).toHaveBeenCalled();
  });

  it('persiste audits + getRecentAudits + getStats', async () => {
    vi.doMock('../../core/memory.js', () => ({
      memory: {
        buildSystemPromptDeep: vi.fn().mockResolvedValue('## Top règles permanentes\n## Top 10 erreurs\n## Méthode de travail\n## Skills disponibles\n## capacités récentes v13.4.0'),
        syncDocsAtBoot: vi.fn().mockResolvedValue({}),
        syncMetaFilesAtBoot: vi.fn().mockResolvedValue({}),
      },
    }));
    const { rulesInjectionWatch } = await import('../../services/sentinels/rules-injection-watch.js');
    await rulesInjectionWatch.audit();
    const audits = rulesInjectionWatch.getRecentAudits(5);
    expect(audits.length).toBeGreaterThanOrEqual(1);
    const stats = rulesInjectionWatch.getStats();
    expect(stats.auditsLast24h).toBeGreaterThanOrEqual(1);
    expect(stats.passRate).toBeGreaterThanOrEqual(0);
  });
});
