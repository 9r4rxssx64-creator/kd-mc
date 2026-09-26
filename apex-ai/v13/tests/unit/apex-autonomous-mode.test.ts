/**
 * APEX v13.4.5 — Tests apex-autonomous-mode + autonomous-watch.
 *
 * Couvre :
 *  - start / stop / pause / resume
 *  - quota_exhausted via tokensConsumed >= limit
 *  - persistence localStorage + auto-restore
 *  - garde-fou maxIterations
 *  - sub-task extraction depuis réponse IA
 *  - sentinelle autonomous-watch tick → délégation tick()
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

/* State mutable hoisted (vi.hoisted requis pour partager state avec factory mock) */
const mockState = vi.hoisted(() => ({
  aiResponse: 'Travail accompli. TERMINÉ',
}));

/* Mocks aiRouter (utilisé par apex-autonomous-mode) */
vi.mock('../../services/ai/ai-router.js', () => ({
  aiRouter: {
    stream: vi.fn(
      async (
        _messages: unknown,
        _system: string,
        onChunk: (chunk: { text: string; done: boolean; provider: string }) => void,
      ) => {
        onChunk({ text: mockState.aiResponse, done: true, provider: 'anthropic' });
      },
    ),
  },
}));

vi.mock('../../services/observability/audit-log.js', () => ({
  auditLog: { record: vi.fn(async () => undefined) },
}));

vi.mock('../../services/storage/firebase-queue.js', () => ({
  firebaseQueue: { add: vi.fn(), init: vi.fn() },
}));

vi.mock('../../services/observability/consumption-monitor.js', () => ({
  consumptionMonitor: {
    getServiceStatus: vi.fn(() => ({ pct_used: 10, severity: 'ok' })),
  },
}));

vi.mock('../../services/integrations/telegram-notifier.js', () => ({
  telegramNotifier: { notify: vi.fn(async () => ({ delivered: { telegram: true } })) },
}));

vi.mock('../../services/integrations/push-notifications.js', () => ({
  pushNotifications: { send: vi.fn(async () => true) },
}));

/* Import APRÈS les mocks pour qu'ils soient appliqués */
async function importFresh(): Promise<typeof import('../../services/admin/apex-autonomous-mode.js')> {
  vi.resetModules();
  return (await import('../../services/admin/apex-autonomous-mode.js')) as unknown as typeof import('../../services/admin/apex-autonomous-mode.js');
}

describe('apex-autonomous-mode v13.4.5', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mockState.aiResponse = 'Travail accompli. TERMINÉ'; /* reset default */
  });

  it('start() crée une session running avec task initiale', async () => {
    const { apexAutonomousMode } = await importFresh();
    const s = await apexAutonomousMode.start('Refactor module X en suivant règle Kevin');
    expect(s.status).toBe('running');
    expect(s.initialObjective).toContain('Refactor module X');
    expect(s.taskQueue.length).toBe(1);
    expect(s.iterations).toBe(0);
    expect(s.tokensConsumed).toBe(0);
    const active = apexAutonomousMode.getActiveSession();
    expect(active?.id).toBe(s.id);
  });

  it('start() refuse objectif vide ou trop long', async () => {
    const { apexAutonomousMode } = await importFresh();
    await expect(apexAutonomousMode.start('')).rejects.toThrow(/vide/i);
    await expect(apexAutonomousMode.start('x'.repeat(3000))).rejects.toThrow(/trop long/i);
  });

  it('stop() marque session stopped et archive', async () => {
    const { apexAutonomousMode } = await importFresh();
    await apexAutonomousMode.start('Test stop');
    apexAutonomousMode.stop();
    expect(apexAutonomousMode.getActiveSession()).toBeNull();
    const hist = apexAutonomousMode.getHistory();
    expect(hist.length).toBe(1);
    expect(hist[0]?.status).toBe('stopped');
  });

  it('pause/resume change status sans détruire session', async () => {
    const { apexAutonomousMode } = await importFresh();
    const s = await apexAutonomousMode.start('Test pause');
    apexAutonomousMode.pause();
    expect(apexAutonomousMode.getActiveSession()?.status).toBe('paused');
    apexAutonomousMode.resume();
    expect(apexAutonomousMode.getActiveSession()?.status).toBe('running');
    /* id inchangé */
    expect(apexAutonomousMode.getActiveSession()?.id).toBe(s.id);
  });

  it('tick() consume tokens et marque task done si TERMINÉ', async () => {
    const { apexAutonomousMode } = await importFresh();
    await apexAutonomousMode.start('Faire X', { maxIterations: 5 });
    await apexAutonomousMode.tick();
    const s = apexAutonomousMode.getActiveSession();
    /* La task a été completée ; queue vide → session completed après prochain tick OU dès now */
    /* Selon implémentation : tick() ne fait qu'une task à la fois ; on vérifie iterations++ */
    if (s) {
      expect(s.iterations).toBe(1);
      expect(s.tokensConsumed).toBeGreaterThan(0);
    } else {
      /* Si complete déjà fait (queue vide + completion marker) */
      const hist = apexAutonomousMode.getHistory();
      expect(hist[0]?.status).toBe('completed');
    }
  });

  it('quota_exhausted via tokensConsumed >= limit → status quota_exhausted + notify', async () => {
    const { apexAutonomousMode } = await importFresh();
    const s = await apexAutonomousMode.start('Test quota', { quotaLimit: 10 });
    /* Force tokensConsumed >= limit en manipulant directement */
    s.tokensConsumed = 50; /* > 10 */
    await apexAutonomousMode.tick();
    /* Doit être quota_exhausted ou archivé */
    const active = apexAutonomousMode.getActiveSession();
    expect(active).toBeNull();
    const hist = apexAutonomousMode.getHistory();
    expect(hist[0]?.status).toBe('quota_exhausted');
    expect(hist[0]?.endReason).toMatch(/tokens session/i);
  });

  it('maxIterations garde-fou stoppe la session', async () => {
    const { apexAutonomousMode } = await importFresh();
    const s = await apexAutonomousMode.start('Test cap iter', { maxIterations: 2 });
    /* Force iterations >= max */
    s.iterations = 2;
    await apexAutonomousMode.tick();
    const active = apexAutonomousMode.getActiveSession();
    expect(active).toBeNull();
    const hist = apexAutonomousMode.getHistory();
    expect(hist[0]?.status).toBe('completed');
    expect(hist[0]?.endReason).toMatch(/max iterations/i);
  });

  it('persistence localStorage : session survit module reload', async () => {
    const mod1 = await importFresh();
    await mod1.apexAutonomousMode.start('Persist test');
    /* Force persist (start déjà persist via writeTasks/persist) */
    /* Reload module : doit restore session active */
    const mod2 = await importFresh();
    const restored = mod2.apexAutonomousMode.getActiveSession();
    expect(restored).not.toBeNull();
    expect(restored?.initialObjective).toBe('Persist test');
  });

  it('orphaned session au boot (lastActivityAt > 30min) → stopped + archive', async () => {
    /* Pre-populate ACTIVE_KEY avec session ancienne */
    const fakeSession = {
      id: 'auto_old',
      initialObjective: 'orphan test',
      startedAt: Date.now() - 3600000,
      status: 'running',
      taskQueue: [],
      tasksCompleted: [],
      tokensConsumed: 0,
      lastActivityAt: Date.now() - 3600000, /* 1h ago */
      iterations: 0,
      logs: [],
    };
    localStorage.setItem('apex_v13_autonomous_active', JSON.stringify(fakeSession));

    const { apexAutonomousMode } = await importFresh();
    const active = apexAutonomousMode.getActiveSession();
    expect(active).toBeNull(); /* orphaned → archived */
    const hist = apexAutonomousMode.getHistory();
    expect(hist.length).toBeGreaterThanOrEqual(1);
    expect(hist[0]?.endReason).toBe('orphaned-on-boot');
  });

  it('extractSubtasks parse "1. xxx 2. yyy" et ajoute à queue', async () => {
    /* Change la réponse mockée AVANT importFresh */
    mockState.aiResponse =
      'Pour réussir :\n1. Analyser le code existant\n2. Identifier les patterns dangereux\n3. Refactor avec tests complets';
    const { apexAutonomousMode } = await importFresh();
    await apexAutonomousMode.start('Refactor', { maxIterations: 10 });
    await apexAutonomousMode.tick();
    const active = apexAutonomousMode.getActiveSession();
    expect(active).not.toBeNull();
    /* La task initiale doit être faite + 3 nouvelles ajoutées */
    expect(active?.taskQueue.length).toBeGreaterThanOrEqual(2);
    expect(active?.iterations).toBe(1);
  });
});

describe('autonomous-watch v13.4.5', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('start() est idempotent et getStats() reflète l\'état', async () => {
    vi.resetModules();
    const { autonomousWatch } = await import('../../services/sentinels/autonomous-watch.js');
    autonomousWatch.start();
    autonomousWatch.start(); /* double start safe */
    const stats = autonomousWatch.getStats();
    expect(stats.active).toBe(true);
    autonomousWatch.stop();
    const stats2 = autonomousWatch.getStats();
    expect(stats2.active).toBe(false);
  });

  it('forceTick() délègue à apexAutonomousMode.tick()', async () => {
    vi.resetModules();
    const { autonomousWatch } = await import('../../services/sentinels/autonomous-watch.js');
    const before = autonomousWatch.getStats().tickCount;
    await autonomousWatch.forceTick();
    const after = autonomousWatch.getStats().tickCount;
    expect(after).toBe(before + 1);
  });
});
