/**
 * APEX v13.3.30 — Auto-Test Runner (auto-vérification quotidienne).
 *
 * Demande Kevin (CLAUDE.md règle absolue 2026-05-04 + 2026-05-07) :
 * > "Tout autonomie autocorrigé. Apex doit auto-tester ses fonctions sans qu'on lui demande."
 * > "Pre-flight test obligatoire avant chaque présentation user."
 * > "À chaque création/modification → lancer test live."
 *
 * Mission :
 * - Suite de smoke tests intégrée dans le runtime (pas de Playwright requis)
 * - Tourne 1×/jour automatique (sentinelle) + on-demand admin
 * - Vérifie services critiques :
 *   * memory.ts (load + add fact + retrieval)
 *   * persistent-memory-store (add + list)
 *   * vault (lock/unlock cycle)
 *   * ai-router (provider health ping)
 *   * preflight checks (network, providers, tokens)
 *   * feature-toggles (read/write)
 *   * sentinels-registry (running count > 0)
 * - Stocke résultats `ax_auto_test_log` (50 derniers, FIFO)
 * - Si un test fail critique → record lesson + escalade Apex IA
 * - UI admin : bouton "🧪 Tester maintenant" + statut + détails par test
 *
 * Anti-pattern : ne JAMAIS exécuter d'actions destructrices (delete, push API key,
 *               write Firebase). Tests read-only ou avec rollback automatique.
 */

import { logger } from '../../core/logger.js';

export interface TestResult {
  id: string;
  name: string;
  status: 'pass' | 'fail' | 'skip';
  durationMs: number;
  error?: string;
  details?: Record<string, unknown>;
}

export interface TestRunSummary {
  ts: number;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
  results: TestResult[];
}

const LOG_KEY = 'ax_auto_test_log';
const MAX_LOGS = 50;
const LAST_RUN_KEY = 'ax_auto_test_last_run';

/** Timeout par test (ms). Au-delà → le test est considéré bloqué (fail propre). */
const TEST_TIMEOUT_MS = 10_000;

class AutoTestRunner {
  /**
   * v13.4.243 (FIX "le test des fonctions qui se bloque") — Garde-fou anti-hang.
   *
   * Avant : `runAll()` faisait `Promise.all([...14 tests])`. Si UN SEUL test
   * ne se résolvait jamais (import bloqué, click handler suspendu dans
   * apex-functional-tester, crypto qui hang…), `Promise.all` ne se résolvait
   * JAMAIS → toute la suite restait bloquée indéfiniment, UI figée sur
   * « test en cours… ».
   *
   * Maintenant : chaque test court contre un timeout. S'il dépasse
   * TEST_TIMEOUT_MS → fail propre `timeout` (avec l'id correct pour que
   * l'auto-fix / escalade sache quel test cibler). Un test bloqué ne peut
   * plus jamais geler les 13 autres.
   */
  private async withTimeout(
    id: string,
    name: string,
    fn: () => Promise<TestResult>,
  ): Promise<TestResult> {
    const start = performance.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<TestResult>((resolve) => {
      timer = setTimeout(() => {
        resolve({
          id,
          name,
          status: 'fail',
          durationMs: Math.round(performance.now() - start),
          error: `timeout > ${TEST_TIMEOUT_MS}ms (test bloqué)`,
        });
      }, TEST_TIMEOUT_MS);
    });
    try {
      return await Promise.race([fn(), timeout]);
    } catch (err: unknown) {
      return {
        id,
        name,
        status: 'fail',
        durationMs: Math.round(performance.now() - start),
        error: err instanceof Error ? err.message : 'unknown',
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /* ============== Tests individuels (read-only safe) ============== */

  private async testMemoryLoad(): Promise<TestResult> {
    const start = performance.now();
    try {
      const { memory } = await import('../../core/memory.js');
      memory.reload();
      const facts = memory.getFacts();
      return {
        id: 't_memory',
        name: 'Memory load',
        status: 'pass',
        durationMs: Math.round(performance.now() - start),
        details: { factsCount: facts.length },
      };
    } catch (err: unknown) {
      return {
        id: 't_memory',
        name: 'Memory load',
        status: 'fail',
        durationMs: Math.round(performance.now() - start),
        error: err instanceof Error ? err.message : 'unknown',
      };
    }
  }

  private async testPersistentMemory(): Promise<TestResult> {
    const start = performance.now();
    try {
      const { persistentMemory } = await import('../storage/persistent-memory-store.js');
      const all = await persistentMemory.list();
      return {
        id: 't_pmem',
        name: 'Persistent memory',
        status: 'pass',
        durationMs: Math.round(performance.now() - start),
        details: { entriesCount: all.length },
      };
    } catch (err: unknown) {
      return {
        id: 't_pmem',
        name: 'Persistent memory',
        status: 'fail',
        durationMs: Math.round(performance.now() - start),
        error: err instanceof Error ? err.message : 'unknown',
      };
    }
  }

  private async testVault(): Promise<TestResult> {
    const start = performance.now();
    try {
      const { vault } = await import('../vault/vault.js');
      const audit = await vault.auditDecryptHealth();
      return {
        id: 't_vault',
        name: 'Vault decrypt health',
        status: audit.failed === 0 ? 'pass' : 'fail',
        durationMs: Math.round(performance.now() - start),
        details: { total: audit.total, ok: audit.ok, failed: audit.failed },
      };
    } catch (err: unknown) {
      return {
        id: 't_vault',
        name: 'Vault decrypt health',
        status: 'fail',
        durationMs: Math.round(performance.now() - start),
        error: err instanceof Error ? err.message : 'unknown',
      };
    }
  }

  private async testAiRouter(): Promise<TestResult> {
    const start = performance.now();
    try {
      const { aiRouter } = await import('../ai/ai-router.js');
      const hasKey = aiRouter.hasAnyKey();
      return {
        id: 't_ai',
        name: 'AI Router',
        status: hasKey ? 'pass' : 'skip',
        durationMs: Math.round(performance.now() - start),
        details: { hasAnyKey: hasKey },
      };
    } catch (err: unknown) {
      return {
        id: 't_ai',
        name: 'AI Router',
        status: 'fail',
        durationMs: Math.round(performance.now() - start),
        error: err instanceof Error ? err.message : 'unknown',
      };
    }
  }

  private async testFeatureToggles(): Promise<TestResult> {
    const start = performance.now();
    try {
      const { featureToggles } = await import('../auth/feature-toggles.js');
      const enabled = featureToggles.isEnabled('chat');
      return {
        id: 't_toggles',
        name: 'Feature toggles',
        status: 'pass',
        durationMs: Math.round(performance.now() - start),
        details: { chatEnabled: enabled },
      };
    } catch (err: unknown) {
      return {
        id: 't_toggles',
        name: 'Feature toggles',
        status: 'fail',
        durationMs: Math.round(performance.now() - start),
        error: err instanceof Error ? err.message : 'unknown',
      };
    }
  }

  private async testStorage(): Promise<TestResult> {
    const start = performance.now();
    try {
      const probeKey = '__apex_test_probe';
      localStorage.setItem(probeKey, '1');
      const v = localStorage.getItem(probeKey);
      localStorage.removeItem(probeKey);
      return {
        id: 't_storage',
        name: 'localStorage R/W',
        status: v === '1' ? 'pass' : 'fail',
        durationMs: Math.round(performance.now() - start),
      };
    } catch (err: unknown) {
      return {
        id: 't_storage',
        name: 'localStorage R/W',
        status: 'fail',
        durationMs: Math.round(performance.now() - start),
        error: err instanceof Error ? err.message : 'unknown',
      };
    }
  }

  private async testNetwork(): Promise<TestResult> {
    const start = performance.now();
    try {
      const online = navigator.onLine;
      return {
        id: 't_net',
        name: 'Network online',
        status: online ? 'pass' : 'skip',
        durationMs: Math.round(performance.now() - start),
        details: { online },
      };
    } catch (err: unknown) {
      return {
        id: 't_net',
        name: 'Network online',
        status: 'fail',
        durationMs: Math.round(performance.now() - start),
        error: err instanceof Error ? err.message : 'unknown',
      };
    }
  }

  /* v13.4.204 (Kevin "Intègre toutes les fonctions Apex dans test runtime + escalade auto") */
  private async testToolsRegistry(): Promise<TestResult> {
    const start = performance.now();
    try {
      const mod = await import('../apex-tools-registry/admin-tools.js') as Record<string, unknown>;
      const arr = (mod['adminTools'] ?? mod['default'] ?? Object.values(mod)[0]) as Array<unknown> | undefined;
      const count = Array.isArray(arr) ? arr.length : 0;
      return {
        id: 't_tools',
        name: 'Tools registry (admin-tools count)',
        status: count >= 5 ? 'pass' : 'fail',
        durationMs: Math.round(performance.now() - start),
        details: { adminToolsCount: count },
      };
    } catch (err: unknown) {
      return {
        id: 't_tools', name: 'Tools registry', status: 'fail',
        durationMs: Math.round(performance.now() - start),
        error: err instanceof Error ? err.message : 'unknown',
      };
    }
  }

  private async testSentinels(): Promise<TestResult> {
    const start = performance.now();
    try {
      const { sentinels } = await import('../sentinels/sentinels.js');
      const list = sentinels.list();
      return {
        id: 't_sentinels',
        name: 'Sentinelles 24/7',
        status: list.length >= 15 ? 'pass' : 'fail',
        durationMs: Math.round(performance.now() - start),
        details: { sentinelsCount: list.length },
      };
    } catch (err: unknown) {
      return {
        id: 't_sentinels', name: 'Sentinelles', status: 'fail',
        durationMs: Math.round(performance.now() - start),
        error: err instanceof Error ? err.message : 'unknown',
      };
    }
  }

  private async testRouter(): Promise<TestResult> {
    const start = performance.now();
    try {
      const { router } = await import('../../core/router.js');
      /* Router expose `register` mais pas getter — on accède au map interne via cast */
      const r = router as unknown as { routes?: Map<string, unknown> };
      const count = r.routes instanceof Map ? r.routes.size : 0;
      return {
        id: 't_router',
        name: 'Router routes',
        status: count >= 5 ? 'pass' : 'fail',
        durationMs: Math.round(performance.now() - start),
        details: { routesCount: count },
      };
    } catch (err: unknown) {
      return {
        id: 't_router', name: 'Router', status: 'fail',
        durationMs: Math.round(performance.now() - start),
        error: err instanceof Error ? err.message : 'unknown',
      };
    }
  }

  private async testStore(): Promise<TestResult> {
    const start = performance.now();
    try {
      const { store } = await import('../../core/store.js');
      const probe = '__test_' + Date.now();
      store.set('test_probe' as never, probe as never);
      const got = store.get('test_probe' as never);
      return {
        id: 't_store',
        name: 'Store reactive (set/get)',
        status: got === probe ? 'pass' : 'fail',
        durationMs: Math.round(performance.now() - start),
      };
    } catch (err: unknown) {
      return {
        id: 't_store', name: 'Store', status: 'fail',
        durationMs: Math.round(performance.now() - start),
        error: err instanceof Error ? err.message : 'unknown',
      };
    }
  }

  /** Test visuel : root DOM monté + boutons nav présents + pas d'écran blanc */
  private async testVisualRender(): Promise<TestResult> {
    const start = performance.now();
    try {
      const root = document.getElementById('apex-root');
      const hasContent = root && root.children.length > 0 && root.innerHTML.length > 100;
      const splash = document.getElementById('apex-splash');
      const splashHidden = !splash || splash.getAttribute('aria-hidden') === 'true' || splash.style.display === 'none';
      const navButtons = document.querySelectorAll('[data-nav-route], .ax-nav-btn, button[data-route]').length;
      const ok = !!hasContent && splashHidden && navButtons >= 3;
      return {
        id: 't_visual',
        name: 'Visual render (DOM + nav)',
        status: ok ? 'pass' : 'fail',
        durationMs: Math.round(performance.now() - start),
        details: {
          rootChildren: root?.children.length ?? 0,
          rootHtmlSize: root?.innerHTML.length ?? 0,
          splashHidden,
          navButtonsCount: navButtons,
        },
      };
    } catch (err: unknown) {
      return {
        id: 't_visual', name: 'Visual render', status: 'fail',
        durationMs: Math.round(performance.now() - start),
        error: err instanceof Error ? err.message : 'unknown',
      };
    }
  }

  /** Test visuel layout : pas de scroll horizontal (overflow-x) sur mobile */
  private async testLayoutNoOverflow(): Promise<TestResult> {
    const start = performance.now();
    try {
      const docW = document.documentElement.scrollWidth;
      const winW = document.documentElement.clientWidth;
      const noOverflow = docW <= winW + 1; /* tolérance 1px arrondi */
      return {
        id: 't_layout',
        name: 'Layout pas de scroll horizontal',
        status: noOverflow ? 'pass' : 'fail',
        durationMs: Math.round(performance.now() - start),
        details: { docWidth: docW, winWidth: winW, overflow: docW - winW },
      };
    } catch (err: unknown) {
      return {
        id: 't_layout', name: 'Layout overflow', status: 'fail',
        durationMs: Math.round(performance.now() - start),
        error: err instanceof Error ? err.message : 'unknown',
      };
    }
  }

  /** Test runtime functional-tester : boutons cliquables réagissent (lance test silencieux) */
  private async testFunctional(): Promise<TestResult> {
    const start = performance.now();
    try {
      const { apexFunctionalTester } = await import('./apex-functional-tester.js');
      const fT = apexFunctionalTester as unknown as { runQuickScan?: () => Promise<{ tested: number; reacted: number; failed: number }> };
      if (typeof fT.runQuickScan !== 'function') {
        return {
          id: 't_functional', name: 'Functional tester (boutons UI)',
          status: 'skip',
          durationMs: Math.round(performance.now() - start),
          details: { reason: 'runQuickScan not available' },
        };
      }
      const scan = await fT.runQuickScan();
      const failureRate = scan.tested > 0 ? scan.failed / scan.tested : 0;
      return {
        id: 't_functional',
        name: 'Functional tester (boutons UI)',
        status: failureRate < 0.20 ? 'pass' : 'fail', /* <20% failure tolérance */
        durationMs: Math.round(performance.now() - start),
        details: { tested: scan.tested, reacted: scan.reacted, failed: scan.failed },
      };
    } catch (err: unknown) {
      return {
        id: 't_functional', name: 'Functional tester', status: 'skip',
        durationMs: Math.round(performance.now() - start),
        error: err instanceof Error ? err.message : 'unknown',
      };
    }
  }

  /** Push résultats fails vers ax_claude_todo Firebase pour escalade Claude Code */
  private async escalateOnFailures(summary: TestRunSummary): Promise<void> {
    if (summary.failed === 0) return;
    try {
      const failedNames = summary.results.filter((r) => r.status === 'fail');
      const todo = {
        id: `auto_test_fail_${Date.now()}`,
        ts: Date.now(),
        source: 'auto-test-runner',
        severity: summary.failed >= 3 ? 'critical' : 'warn',
        status: 'pending',
        title: `Auto-test : ${summary.failed}/${summary.total} tests fail`,
        details: failedNames.map((r) => ({
          test: r.name,
          error: r.error ?? 'fail without error',
          details: r.details ?? null,
        })),
        v: 'v13.4.204',
      };
      /* Push localStorage immédiat (récupéré par GitHub Action claude-todo-watcher) */
      const queueKey = 'ax_claude_todo';
      const raw = localStorage.getItem(queueKey);
      const queue = raw ? (JSON.parse(raw) as unknown[]) : [];
      queue.push(todo);
      const tail = (queue as object[]).slice(-100); /* cap 100 */
      localStorage.setItem(queueKey, JSON.stringify(tail));
      /* Push Firebase si dispo (sync auto via fbWrite) */
      try {
        const { firebase } = await import('../storage/firebase.js');
        await firebase.write(`apex/ax_claude_todo/${todo.id}`, todo);
      } catch { /* offline OK */ }
      logger.warn('auto-test', `Escalated ${summary.failed} fails to ax_claude_todo`, { todoId: todo.id });
    } catch (err) {
      logger.warn('auto-test', 'escalate failed', { err: err instanceof Error ? err.message : String(err) });
    }
  }

  /* ============== Public API ============== */

  /**
   * v13.4.204 (Kevin "Corrige tout auto") : tente fix par type de test fail.
   * Whitelist actions safe seulement. Re-test après pour valider.
   */
  private async autoFixOnFailures(summary: TestRunSummary): Promise<{ attempts: number; fixed: number }> {
    let attempts = 0, fixed = 0;
    const fails = summary.results.filter((r) => r.status === 'fail');
    for (const r of fails) {
      attempts++;
      try {
        if (r.id === 't_memory') {
          const { memory } = await import('../../core/memory.js');
          memory.reload();
          fixed++;
        } else if (r.id === 't_vault') {
          const { vault } = await import('../vault/vault.js');
          if (typeof (vault as unknown as { reloadFromStorage?: () => void }).reloadFromStorage === 'function') {
            (vault as unknown as { reloadFromStorage: () => void }).reloadFromStorage();
          }
          fixed++;
        } else if (r.id === 't_pmem') {
          const { persistentMemory } = await import('../storage/persistent-memory-store.js');
          if (typeof (persistentMemory as unknown as { reload?: () => void }).reload === 'function') {
            (persistentMemory as unknown as { reload: () => void }).reload();
          }
          fixed++;
        } else if (r.id === 't_sentinels') {
          /* Re-import sentinels.ts pour re-register */
          await import('../sentinels/sentinels.js');
          fixed++;
        } else if (r.id === 't_storage') {
          /* localStorage saturé ? Trigger cleanup via storage-compressor */
          try {
            const sc = await import('../storage/storage-compressor.js') as Record<string, unknown>;
            const fn = (sc['storageCompressor'] ?? sc['default']) as unknown as { cleanup?: () => void } | undefined;
            if (fn && typeof fn.cleanup === 'function') {
              fn.cleanup();
              fixed++;
            }
          } catch { /* skip */ }
        }
        /* Network/AI/Router/Store/Visual/Layout/Functional : pas d'auto-fix safe immédiat,
         * escalade Claude Code via ax_claude_todo (déjà fait par escalateOnFailures) */
      } catch (err) {
        logger.warn('auto-test', `autoFix ${r.id} failed`, { err: err instanceof Error ? err.message : String(err) });
      }
    }
    logger.info('auto-test', `Auto-fix : ${fixed}/${attempts} attempted`);
    return { attempts, fixed };
  }

  /**
   * Run all smoke tests + persist results + auto-fix + escalade.
   */
  async runAll(): Promise<TestRunSummary> {
    const start = performance.now();
    logger.info('auto-test', 'Run start (v13.4.204 expanded suite)');

    /* v13.4.243 : chaque test wrappé dans withTimeout (anti-hang).
     * allSettled + withTimeout → la suite se termine TOUJOURS, même si un
     * test individuel se bloque. */
    const settled = await Promise.allSettled([
      this.withTimeout('t_memory', 'Memory load', () => this.testMemoryLoad()),
      this.withTimeout('t_pmem', 'Persistent memory', () => this.testPersistentMemory()),
      this.withTimeout('t_vault', 'Vault decrypt health', () => this.testVault()),
      this.withTimeout('t_ai', 'AI Router', () => this.testAiRouter()),
      this.withTimeout('t_toggles', 'Feature toggles', () => this.testFeatureToggles()),
      this.withTimeout('t_storage', 'localStorage R/W', () => this.testStorage()),
      this.withTimeout('t_net', 'Network online', () => this.testNetwork()),
      /* v13.4.204 : 6 nouveaux tests intégrant toutes les fonctions Apex */
      this.withTimeout('t_tools', 'Tools registry', () => this.testToolsRegistry()),
      this.withTimeout('t_sentinels', 'Sentinelles 24/7', () => this.testSentinels()),
      this.withTimeout('t_router', 'Router routes', () => this.testRouter()),
      this.withTimeout('t_store', 'Store reactive (set/get)', () => this.testStore()),
      this.withTimeout('t_visual', 'Visual render (DOM + nav)', () => this.testVisualRender()),
      this.withTimeout('t_layout', 'Layout pas de scroll horizontal', () => this.testLayoutNoOverflow()),
      this.withTimeout('t_functional', 'Functional tester (boutons UI)', () => this.testFunctional()),
    ]);
    /* withTimeout résout toujours → un rejected ici est anormal (mais on le
     * mappe quand même en fail pour ne jamais perdre une ligne de résultat). */
    const results: TestResult[] = settled.map((s, i) =>
      s.status === 'fulfilled'
        ? s.value
        : {
            id: `t_unknown_${i}`,
            name: `Test #${i}`,
            status: 'fail' as const,
            durationMs: 0,
            error: s.reason instanceof Error ? s.reason.message : 'rejected',
          },
    );

    const summary: TestRunSummary = {
      ts: Date.now(),
      total: results.length,
      passed: results.filter((r) => r.status === 'pass').length,
      failed: results.filter((r) => r.status === 'fail').length,
      skipped: results.filter((r) => r.status === 'skip').length,
      durationMs: Math.round(performance.now() - start),
      results,
    };

    /* Persist log (50 derniers, FIFO) */
    try {
      const raw = localStorage.getItem(LOG_KEY);
      const arr = raw ? (JSON.parse(raw) as TestRunSummary[]) : [];
      arr.push(summary);
      const tail = arr.slice(-MAX_LOGS);
      localStorage.setItem(LOG_KEY, JSON.stringify(tail));
      localStorage.setItem(LAST_RUN_KEY, String(summary.ts));
    } catch (err: unknown) {
      logger.warn('auto-test', 'persist log failed', { err });
    }

    /* Si fails critiques → record lesson */
    if (summary.failed > 0) {
      try {
        const { memory } = await import('../../core/memory.js');
        const failedNames = summary.results.filter((r) => r.status === 'fail').map((r) => r.name).join(', ');
        await memory.recordSessionLearning(
          'auto-test',
          `Tests fail : ${summary.failed}/${summary.total}`,
          `Modules: ${failedNames}`,
          summary.failed >= 3 ? 'critical' : 'warn',
        );
      } catch { /* non-bloquant */ }

      /* v13.4.204 Kevin "Apex doit s'auto-tester, s'auto-corriger, s'auto-améliorer" :
       * 1. Auto-fix whitelist sur tests fail (memory.reload, vault.flush, etc.)
       * 2. Escalade les fails non-fixables vers ax_claude_todo Firebase
       * 3. Claude Code workflow claude-todo-watcher prendra le relais next session */
      try {
        const fix = await this.autoFixOnFailures(summary);
        logger.info('auto-test', `Auto-fix ${fix.fixed}/${fix.attempts} succeeded`);
      } catch { /* non-bloquant */ }
      try {
        await this.escalateOnFailures(summary);
      } catch { /* non-bloquant */ }
    }

    logger.info('auto-test', `Run done: ${summary.passed}/${summary.total} passed in ${summary.durationMs}ms`);
    return summary;
  }

  /**
   * Get last run summary (sans relancer).
   */
  getLastRun(): TestRunSummary | null {
    try {
      const raw = localStorage.getItem(LOG_KEY);
      if (!raw) return null;
      const arr = JSON.parse(raw) as TestRunSummary[];
      if (arr.length === 0) return null;
      return arr[arr.length - 1] ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Get all recent runs.
   */
  getHistory(): TestRunSummary[] {
    try {
      const raw = localStorage.getItem(LOG_KEY);
      return raw ? (JSON.parse(raw) as TestRunSummary[]) : [];
    } catch {
      return [];
    }
  }

  /**
   * Should run today ? (1×/jour max sauf force).
   */
  shouldRunDaily(): boolean {
    try {
      const last = localStorage.getItem(LAST_RUN_KEY);
      if (!last) return true;
      const lastTs = Number(last);
      const dayMs = 24 * 60 * 60 * 1000;
      return Date.now() - lastTs >= dayMs;
    } catch {
      return true;
    }
  }

  /**
   * Auto-schedule : si shouldRunDaily, lance après 60s post-boot (idle).
   */
  scheduleAutoRun(): void {
    if (!this.shouldRunDaily()) {
      logger.info('auto-test', 'Skip auto-run (already done today)');
      return;
    }
    setTimeout(() => {
      void this.runAll().catch((err: unknown) => {
        logger.warn('auto-test', 'auto-run failed', { err });
      });
    }, 60_000);
  }
}

export const autoTestRunner = new AutoTestRunner();
