/**
 * v13.3.79+ Kevin 2026-05-08 ABSOLUE — Auto-fix everything coverage tests.
 *
 * Mission Kevin : "Apex doit s'auto-corriger TOUT seul, ne JAMAIS attendre Kevin
 * ou Claude Code pour des bugs réparables auto."
 *
 * Tests de non-régression sur les autoFix wired :
 *   - Sentinelles avec autoFix wired ≥ 16
 *   - Auto-fix s'exécute si check() fail (vs juste alerter)
 *   - Escalade Claude Code si fail persistant après 3× tentatives
 *   - global-health-watch méta-sentinelle aggrege state + escalade
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { sentinels, registerCoreSentinels } from '../../services/sentinels/sentinels.js';

describe('auto-fix everywhere (Kevin v13.3.79+)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('sentinelles avec autoFix wired ≥ 16 (audit Kevin)', () => {
    registerCoreSentinels();
    const list = sentinels.list();
    const withAutoFix = list.filter((s) => s.autoFix !== undefined);
    /* Liste exhaustive Kevin v13.3.79+ : backup, auto-restore, storage, network,
     * performance, security, presence, compliance, wake, memory-bridge, memory,
     * service-knowledge, realtime-backup, vault-resilience, memory-augmented,
     * auto-ultra-reset + AJOUTÉS v13.3.79+ : token-balance, error-watch, credentials,
     * decrypt, conflict, smart-router, ai-unblock, reconsult-kevin, never-forget,
     * global-health = 26 total */
    expect(withAutoFix.length).toBeGreaterThanOrEqual(16);
  });

  it('token-balance-watch a un autoFix (multi-key recovery + auto-restore)', () => {
    registerCoreSentinels();
    const s = sentinels.list().find((x) => x.id === 'token-balance-watch');
    expect(s).toBeDefined();
    expect(s?.autoFix).toBeDefined();
  });

  it('error-watch a un autoFix (flush observability buffer)', () => {
    registerCoreSentinels();
    const s = sentinels.list().find((x) => x.id === 'error-watch');
    expect(s).toBeDefined();
    expect(s?.autoFix).toBeDefined();
  });

  it('credentials-watch a un autoFix (auto-restore depuis IDB/Firebase)', () => {
    registerCoreSentinels();
    const s = sentinels.list().find((x) => x.id === 'credentials-watch');
    expect(s).toBeDefined();
    expect(s?.autoFix).toBeDefined();
  });

  it('decrypt-watch a un autoFix (Firebase backup restore)', () => {
    registerCoreSentinels();
    const s = sentinels.list().find((x) => x.id === 'decrypt-watch');
    expect(s).toBeDefined();
    expect(s?.autoFix).toBeDefined();
  });

  it('conflict-watch a un autoFix wired (sentinelAutoRepair)', () => {
    registerCoreSentinels();
    const s = sentinels.list().find((x) => x.id === 'conflict-watch');
    expect(s).toBeDefined();
    expect(s?.autoFix).toBeDefined();
  });

  it('smart-router-watch a un autoFix (re-ping + multi-key recovery)', () => {
    registerCoreSentinels();
    const s = sentinels.list().find((x) => x.id === 'smart-router-watch');
    expect(s).toBeDefined();
    expect(s?.autoFix).toBeDefined();
  });

  it('ai-unblock-watch a un autoFix (re-run failover + multi-key recovery)', () => {
    registerCoreSentinels();
    const s = sentinels.list().find((x) => x.id === 'ai-unblock-watch');
    expect(s).toBeDefined();
    expect(s?.autoFix).toBeDefined();
  });

  it('reconsult-kevin-watch a un autoFix (force memory.syncDocsAtBoot)', () => {
    registerCoreSentinels();
    const s = sentinels.list().find((x) => x.id === 'reconsult-kevin-watch');
    expect(s).toBeDefined();
    expect(s?.autoFix).toBeDefined();
  });

  it('never-forget-watch a un autoFix (memory.initBootDefaults + sync docs)', () => {
    registerCoreSentinels();
    const s = sentinels.list().find((x) => x.id === 'never-forget-watch');
    expect(s).toBeDefined();
    expect(s?.autoFix).toBeDefined();
  });

  it('global-health-watch est registered (méta-sentinelle)', () => {
    registerCoreSentinels();
    const s = sentinels.list().find((x) => x.id === 'global-health-watch');
    expect(s).toBeDefined();
    expect(s?.autoFix).toBeDefined();
    expect(s?.intervalMs).toBe(5 * 60 * 1000); /* 5 min */
  });

  it('global-health-watch run agrège stats sentinelles + persist log', async () => {
    registerCoreSentinels();
    /* v13.3.79+ : global-health-watch lit lastResult de chaque sentinelle (pas de cascade)
     * donc rapide même avec 30+ sentinelles. */
    const r = await sentinels.runOne('global-health-watch');
    expect(r?.ts).toBeGreaterThan(0);
    expect(typeof r?.msg).toBe('string');

    /* Log doit avoir été persisté */
    const log = JSON.parse(localStorage.getItem('ax_global_health_log') ?? '[]') as Array<{
      total: number;
      ok: number;
      failed: number;
    }>;
    expect(log.length).toBeGreaterThanOrEqual(1);
    expect(log[0]?.total).toBeGreaterThan(0);
  });

  it('global-health-watch escalate vers ax_claude_todo si fail persistant', async () => {
    registerCoreSentinels();
    /* Inject fake history avec failed > 0 pour que l'autoFix escalade */
    const fakeLog = [{
      ts: Date.now(),
      total: 10,
      ok: 5,
      failed: 5,
      autoFixed: 0,
      autoFixFailed: 5,
      failedIds: ['error-watch', 'security-watch', 'fake-1', 'fake-2', 'fake-3'],
      failPct: 50,
    }];
    localStorage.setItem('ax_global_health_log', JSON.stringify(fakeLog));

    const s = sentinels.list().find((x) => x.id === 'global-health-watch');
    const r = await s?.autoFix?.();
    expect(r?.ok).toBe(true);
    expect(r?.msg).toMatch(/escalat/i);

    const todos = JSON.parse(localStorage.getItem('ax_claude_todo') ?? '[]') as Array<{
      sentinel_id: string;
      severity: string;
    }>;
    expect(todos.length).toBeGreaterThanOrEqual(1);
    const last = todos[todos.length - 1];
    expect(last?.sentinel_id).toBe('global-health-watch');
    expect(last?.severity).toBe('critical');
  });

  it('global-health-watch autoFix retourne ok=false si pas de history', async () => {
    registerCoreSentinels();
    /* Pas de log existant */
    const s = sentinels.list().find((x) => x.id === 'global-health-watch');
    const r = await s?.autoFix?.();
    expect(r?.ok).toBe(false);
    expect(r?.msg).toMatch(/no history|no data/i);
  });

  it('compliance-watch autoFix wire (test régression existant)', async () => {
    registerCoreSentinels();
    localStorage.setItem('apex_v13_user', JSON.stringify({ id: 'kevin' }));
    /* User logged-in sans consent → check fail → autoFix crée consent essential */
    const r = await sentinels.runOne('compliance-watch');
    expect(r?.ok).toBe(true);
    expect(localStorage.getItem('apex_v13_cookies_accepted')).toBeTruthy();
  });

  it('storage-watch autoFix trim oversized arrays + frees bytes', async () => {
    registerCoreSentinels();
    /* Inject grosses arrays > caps */
    const bigArr = Array.from({ length: 500 }, (_, i) => ({ id: i, data: 'x'.repeat(100) }));
    localStorage.setItem('apex_v13_observability', JSON.stringify(bigArr));
    localStorage.setItem('ax_audit_log_v13', JSON.stringify(bigArr));

    const s = sentinels.list().find((x) => x.id === 'storage-watch');
    const r = await s?.autoFix?.();
    expect(r?.ts === undefined || typeof r?.ts === 'undefined').toBeTruthy(); /* autoFix ne retourne pas ts */
    /* Après autoFix : observability ≤ 100, audit-log ≤ 200 */
    const obs = JSON.parse(localStorage.getItem('apex_v13_observability') ?? '[]') as unknown[];
    const audit = JSON.parse(localStorage.getItem('ax_audit_log_v13') ?? '[]') as unknown[];
    expect(obs.length).toBeLessThanOrEqual(100);
    expect(audit.length).toBeLessThanOrEqual(200);
  });

  it('audit count : autoFix wired sentinelles bien définies (Kevin "TOUS auto-fixés")', () => {
    registerCoreSentinels();
    const list = sentinels.list();
    /* Whitelist sentinelles SANS autoFix légitimes (read-only / informative) */
    const noAutoFixOk = new Set([
      'agent-watches-runner', /* runner d'autres watches, no direct fix */
      'link-validation-watch', /* informationnel — pas de fix possible côté client */
      'credentials-rotation-watch', /* alerte rotation, action requires admin */
      'anti-regression-watch', /* compare scores, action devs */
      'self-test', /* health check transversal */
      'memory-leak-watch', /* trackers info, pas de fix auto safe */
      'voice-quality-watch', /* propose calibration, pas de force */
      'csp-violation-watch', /* requires manual intervention */
      'service-knowledge-watch', /* a déjà autoFix wired */
      'apex-self-correct-watch', /* IS la cascade self-correct, runCycle interne */
      'multi-branch-coordinator-watch', /* escalade GitHub issue, pas de fix client */
      'auto-test-runner-watch', /* runner tests → escalade ax_claude_todo, fix DANS le runner */
      'github-notifications-clean-watch', /* nettoyage notifs = l'action elle-même, pas de fix séparé */
    ]);
    const noAutoFixFound = list.filter((s) => !s.autoFix && !noAutoFixOk.has(s.id));
    /* Aucune sentinelle critique ne devrait être sans autoFix maintenant */
    if (noAutoFixFound.length > 0) {
       
      console.warn('Sentinelles sans autoFix détectées :', noAutoFixFound.map((s) => s.id));
    }
    expect(noAutoFixFound.length).toBeLessThanOrEqual(0);
  });
});
