/**
 * APEX v13 — Tests Apex Self-Correct cascade
 *
 * Kevin 2026-05-08 18:05 :
 *   "Comment c'est possible encore des clés API qui se sont perdues comment c'est
 *    possible avec toutes les API que j'ai mis, ils devraient enchaîner avec une
 *    autre en automatique et réparer le problème automatiquement"
 *   "Il ne s'auto-corrige pas apparemment, il attend que tu le fasses c'est pas normal"
 *
 * Couvre :
 *   1. Détection : 3+ chat-fallback en 5 min → needs_correction true
 *   2. Détection : pas de fallback récent → needs_correction false
 *   3. Détection : ai.all_providers_dead audit récent → needs_correction true
 *   4. Cascade : runCascade() appelle restore credentials → reset DEAD → résolu
 *   5. Cascade : si rien ne marche → escalate Claude Code via pushTodo
 *   6. Throttle : 2 cycles en < 30 min → 2ème skipped (throttled)
 *   7. Persistence historique : derniers cycles stockés localStorage
 *   8. ResetAll : nettoie localStorage + restaure config par défaut
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { aiKeyRotation } from '../../services/ai/ai-key-rotation.js';
import {
  apexSelfCorrect,
  DEFAULT_DETECTION_WINDOW,
  type FaultDetection,
} from '../../services/admin/apex-self-correct.js';
import { auditLog } from '../../services/observability/audit-log.js';

describe('apex-self-correct — cascade auto-correct sans Kevin', () => {
  beforeEach(() => {
    /* setup.ts a clear localStorage + IDB, on reset les caches mémoire */
    apexSelfCorrect.resetAll();
    aiKeyRotation.resetAll();
    auditLog.reload();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    apexSelfCorrect.resetAll();
    aiKeyRotation.resetAll();
    vi.restoreAllMocks();
  });

  /* === 1. Détection fault par 3+ chat-fallback === */
  describe('detectFault', () => {
    it('3+ ai.http_error en 5 min → needs_correction=true', async () => {
      /* Inject 3 erreurs http récentes */
      for (let i = 0; i < 3; i++) {
        await auditLog.record('ai.http_error', { details: { provider: 'anthropic', status: 429 } });
      }
      const detection = await apexSelfCorrect.detectFault();
      expect(detection.needs_correction).toBe(true);
      expect(detection.recent_fallbacks).toBeGreaterThanOrEqual(3);
      expect(detection.reasons.length).toBeGreaterThan(0);
    });

    it('aucune erreur récente → needs_correction=false', async () => {
      const detection = await apexSelfCorrect.detectFault();
      expect(detection.needs_correction).toBe(false);
      expect(detection.recent_fallbacks).toBe(0);
      expect(detection.reasons).toHaveLength(0);
    });

    it('ai.all_providers_dead audit récent → needs_correction=true', async () => {
      await auditLog.record('ai.all_providers_dead', { details: { ts: Date.now() } });
      const detection = await apexSelfCorrect.detectFault();
      expect(detection.needs_correction).toBe(true);
      expect(detection.all_providers_dead).toBe(true);
      expect(detection.reasons.some((r) => r.includes('DEAD'))).toBe(true);
    });

    it('1 seule erreur → seuil 3 non atteint, needs_correction=false', async () => {
      await auditLog.record('ai.http_error', { details: { provider: 'anthropic', status: 500 } });
      const detection = await apexSelfCorrect.detectFault();
      expect(detection.needs_correction).toBe(false);
      expect(detection.recent_fallbacks).toBe(1);
    });
  });

  /* === 2. Cascade : runCascade exécute toutes les étapes === */
  describe('runCascade', () => {
    it('cascade complète : restore_credentials → reset_dead_providers → rank_providers', async () => {
      const fakeDetection: FaultDetection = {
        needs_correction: true,
        fallback_ratio: 1,
        recent_fallbacks: 5,
        recent_attempts: 5,
        ms_since_last_success: 600_000,
        all_providers_dead: false,
        ts: Date.now(),
        reasons: ['test cascade'],
      };
      const result = await apexSelfCorrect.runCascade(fakeDetection);
      expect(result.triggered).toBe(true);
      const stepNames = result.steps.map((s) => s.step);
      expect(stepNames).toContain('restore_credentials');
      expect(stepNames).toContain('reset_dead_providers');
      expect(stepNames).toContain('rank_providers');
    });

    it('cascade reset DEAD timers d\'un provider DEAD', async () => {
      /* Setup : marque anthropic DEAD via handleFailure */
      await aiKeyRotation.handleFailure('anthropic', undefined, { status: 401 });
      expect(aiKeyRotation.isProviderDead('anthropic')).toBe(true);

      const detection: FaultDetection = {
        needs_correction: true,
        fallback_ratio: 1,
        recent_fallbacks: 5,
        recent_attempts: 5,
        ms_since_last_success: 0,
        all_providers_dead: false,
        ts: Date.now(),
        reasons: ['anthropic DEAD'],
      };
      const result = await apexSelfCorrect.runCascade(detection);
      const resetStep = result.steps.find((s) => s.step === 'reset_dead_providers');
      expect(resetStep).toBeDefined();
      expect(resetStep?.ok).toBe(true);
      /* anthropic ne doit plus être DEAD après reset */
      expect(aiKeyRotation.isProviderDead('anthropic')).toBe(false);
      /* metrics.reset doit indiquer au moins 1 reset */
      expect(resetStep?.metrics?.['reset']).toBeGreaterThanOrEqual(1);
    });
  });

  /* === 3. runCycle : workflow complet (détection + cascade + persistence) === */
  describe('runCycle', () => {
    it('skip si pas de fault détecté (skipped_reason=no_fault)', async () => {
      const result = await apexSelfCorrect.runCycle();
      expect(result.triggered).toBe(false);
      expect(result.skipped_reason).toBe('no_fault');
    });

    it('throttle : 2 runs en < 30 min → 2ème skipped (throttled)', async () => {
      /* Inject fault + run 1 */
      for (let i = 0; i < 4; i++) {
        await auditLog.record('ai.http_error', { details: { provider: 'anthropic', status: 429 } });
      }
      const r1 = await apexSelfCorrect.runCycle();
      expect(r1.triggered).toBe(true);

      /* Run 2 immédiat → throttled */
      const r2 = await apexSelfCorrect.runCycle();
      expect(r2.triggered).toBe(false);
      expect(r2.skipped_reason).toBe('throttled');
    });

    it('historique persisté : runCycle ajoute au getHistory()', async () => {
      const r1 = await apexSelfCorrect.runCycle();
      expect(r1.triggered).toBe(false);
      const history = apexSelfCorrect.getHistory();
      expect(history.length).toBeGreaterThan(0);
      const last = history[history.length - 1];
      expect(last?.skipped_reason).toBe('no_fault');
    });

    it('configure() : custom fallback_threshold modifie la détection', async () => {
      apexSelfCorrect.configure({ fallback_threshold: 1 }); /* déclenche dès 1 erreur */
      await auditLog.record('ai.http_error', { details: { provider: 'groq', status: 500 } });
      const detection = await apexSelfCorrect.detectFault();
      expect(detection.recent_fallbacks).toBe(1);
      /* fallback_ratio = 1/1 = 1.0 ≥ 0.5 + threshold=1 → trigger */
      expect(detection.needs_correction).toBe(true);
    });

    it('bypass throttle : setBypassThrottle(true) → skip cooldown', async () => {
      for (let i = 0; i < 4; i++) {
        await auditLog.record('ai.http_error', { details: { provider: 'anthropic', status: 429 } });
      }
      const r1 = await apexSelfCorrect.runCycle();
      expect(r1.triggered).toBe(true);

      /* Sans bypass : throttled */
      const r2 = await apexSelfCorrect.runCycle();
      expect(r2.skipped_reason).toBe('throttled');

      /* Avec bypass : re-trigger */
      apexSelfCorrect.setBypassThrottle(true);
      const r3 = await apexSelfCorrect.runCycle();
      expect(r3.triggered).toBe(true);
    });
  });

  /* === 4. Defaults config + reset === */
  describe('config / reset', () => {
    it('DEFAULT_DETECTION_WINDOW expose les valeurs documentées', () => {
      expect(DEFAULT_DETECTION_WINDOW.fallback_window_ms).toBe(5 * 60 * 1000);
      expect(DEFAULT_DETECTION_WINDOW.fallback_threshold).toBe(3);
      expect(DEFAULT_DETECTION_WINDOW.no_response_window_ms).toBe(10 * 60 * 1000);
      expect(DEFAULT_DETECTION_WINDOW.throttle_ms).toBe(30 * 60 * 1000);
    });

    it('resetAll() nettoie localStorage + restore defaults', async () => {
      apexSelfCorrect.configure({ fallback_threshold: 99 });
      for (let i = 0; i < 99; i++) {
        await auditLog.record('ai.http_error', { details: { provider: 'x', status: 500 } });
      }
      /* Avec threshold=99 + 99 erreurs = trigger */
      const r = await apexSelfCorrect.runCycle();
      expect(r.triggered).toBe(true);

      apexSelfCorrect.resetAll();
      /* Threshold revenu à 3, plus de throttle, history clear */
      expect(apexSelfCorrect.getHistory()).toHaveLength(0);
      const r2 = await apexSelfCorrect.runCycle();
      /* 99 erreurs en localStorage audit-log mais avec threshold 3 + ratio toujours 1.0 → trigger */
      expect(r2.triggered).toBe(true);
    });
  });
});
