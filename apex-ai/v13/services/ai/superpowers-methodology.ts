/**
 * APEX v13.4.2 — Superpowers Methodology Service (Yury Plugin équivalent #4)
 *
 * 7-step state machine pour structurer une tâche dev complexe :
 *   1. brainstorm — explorer 3-5 options
 *   2. plan       — design doc + ADR
 *   3. dev        — implémentation
 *   4. test       — écriture tests + run
 *   5. review     — peer-review (peut chaîner code-review-multi-agent)
 *   6. ship       — bump version + commit
 *   7. reflect    — lesson learned + escalade si pattern récurrent
 *
 * Chaque step appelle l'IA avec un prompt spécialisé pour produire output dédié.
 * Sessions persistées (cap 20). Reprise possible (sessionId).
 */

import { logger } from '../../core/logger.js';
import { auditLog } from '../observability/audit-log.js';

import { aiRouter } from './ai-router.js';

export type SuperpowerStep = 'brainstorm' | 'plan' | 'dev' | 'test' | 'review' | 'ship' | 'reflect';

export interface StepOutput {
  step: SuperpowerStep;
  output: string;
  ts: number;
  durationMs: number;
}

export interface SuperpowerSession {
  sessionId: string;
  taskName: string;
  createdAt: number;
  updatedAt: number;
  currentStep: SuperpowerStep;
  completedSteps: SuperpowerStep[];
  outputs: Record<SuperpowerStep, StepOutput | null>;
  status: 'active' | 'completed' | 'cancelled';
}

const SESSIONS_KEY = 'apex_v13_superpowers_sessions';
const SESSIONS_MAX = 20;

const STEPS_ORDER: SuperpowerStep[] = ['brainstorm', 'plan', 'dev', 'test', 'review', 'ship', 'reflect'];

const STEP_PROMPTS: Record<SuperpowerStep, { system: string; userTpl: (task: string, prevOutputs: string) => string }> = {
  brainstorm: {
    system: `Tu es un dev senior. Explore 3-5 approches DIFFÉRENTES pour résoudre la tâche.
Pour chacune : 1 phrase pitch, pros/cons, complexité (S/M/L), risques.
Format Markdown structuré.`,
    userTpl: (task) => `Tâche : ${task}\n\nGénère 3-5 options possibles.`,
  },
  plan: {
    system: `Tu es architecte logiciel. Produis un design doc + ADR (Architecture Decision Record).
Sections : Contexte · Décision · Conséquences · Alternatives rejetées.
Format Markdown.`,
    userTpl: (task, prev) => `Tâche : ${task}\n\nBrainstorm précédent :\n${prev}\n\nChoisis la meilleure option et écris le design doc.`,
  },
  dev: {
    system: `Tu es dev senior. Implémente la solution.
Donne le code complet (TypeScript strict, pas any), prêt à coller.
Inclus les imports.`,
    userTpl: (task, prev) => `Tâche : ${task}\n\nPlan :\n${prev}\n\nÉcris le code de la solution.`,
  },
  test: {
    system: `Tu es QA expert. Écris les tests vitest qui couvrent : happy path, edge cases, erreurs.
Min 5 cas. Format TypeScript prêt à coller.`,
    userTpl: (task, prev) => `Tâche : ${task}\n\nCode :\n${prev}\n\nÉcris les tests vitest associés.`,
  },
  review: {
    system: `Tu es reviewer expert. Audit le code + tests : sécurité, perf, lisibilité, conformité.
Format : ✅ OK / ⚠️ Suggestion / ❌ Problème + ligne.`,
    userTpl: (task, prev) => `Tâche : ${task}\n\nCode + tests :\n${prev}\n\nFais une review honnête.`,
  },
  ship: {
    system: `Tu es release manager. Génère :
- Numéro de version (semver)
- Message commit (titre court + bullets)
- Checklist deploy (build, tests, sync apex-ai-v13/)`,
    userTpl: (task, prev) => `Tâche : ${task}\n\nCode finalisé :\n${prev}\n\nPrépare la release.`,
  },
  reflect: {
    system: `Tu es coach senior. Tire les leçons :
- Qu'a-t-on appris ?
- Patterns réutilisables ?
- Pièges à éviter ?
- Améliorations futures ?
Format Markdown bullets.`,
    userTpl: (task, prev) => `Tâche : ${task}\n\nDéroulé :\n${prev}\n\nQuelles leçons retient-on ?`,
  },
};

class SuperpowersMethodologyService {
  /**
   * Crée une nouvelle session pour la tâche donnée.
   */
  start(taskName: string): string {
    const sessionId = `sp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const session: SuperpowerSession = {
      sessionId,
      taskName,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      currentStep: 'brainstorm',
      completedSteps: [],
      outputs: {
        brainstorm: null, plan: null, dev: null, test: null, review: null, ship: null, reflect: null,
      },
      status: 'active',
    };
    this.persistSession(session);
    void auditLog.record('superpowers.start', { details: { sessionId, taskName: taskName.slice(0, 100) } });
    logger.info('superpowers', `New session ${sessionId} : ${taskName}`);
    return sessionId;
  }

  /**
   * Avance la session au step suivant en appelant l'IA.
   * Retourne l'output IA pour ce step.
   */
  async advance(sessionId: string): Promise<StepOutput | null> {
    const session = this.getState(sessionId);
    if (!session) {
      logger.warn('superpowers', `Session ${sessionId} introuvable`);
      return null;
    }
    if (session.status !== 'active') {
      logger.warn('superpowers', `Session ${sessionId} status=${session.status} → skip`);
      return null;
    }

    const tStart = Date.now();
    const step = session.currentStep;
    const promptDef = STEP_PROMPTS[step];
    const prevOutputs = this.buildPrevOutputsContext(session);

    let collectedText = '';
    let lastErr: Error | undefined;
    try {
      await aiRouter.stream(
        [{ role: 'user', content: promptDef.userTpl(session.taskName, prevOutputs) }],
        promptDef.system,
        (chunk) => {
          if (chunk.text) collectedText += chunk.text;
        },
        (err) => { lastErr = err; },
      );
    } catch (err: unknown) {
      lastErr = err instanceof Error ? err : new Error(String(err));
    }

    if (lastErr || !collectedText) {
      logger.warn('superpowers', `Step ${step} failed`, { err: lastErr?.message });
      collectedText = `[Step ${step} failed: ${lastErr?.message ?? 'no response'}]`;
    }

    const stepOutput: StepOutput = {
      step,
      output: collectedText,
      ts: Date.now(),
      durationMs: Date.now() - tStart,
    };

    /* Update session */
    session.outputs[step] = stepOutput;
    session.completedSteps.push(step);
    session.updatedAt = Date.now();
    const nextIdx = STEPS_ORDER.indexOf(step) + 1;
    if (nextIdx >= STEPS_ORDER.length) {
      session.status = 'completed';
    } else {
      const nextStep = STEPS_ORDER[nextIdx];
      if (nextStep) session.currentStep = nextStep;
    }
    this.persistSession(session);
    void auditLog.record('superpowers.advance', {
      details: { sessionId, step, durationMs: stepOutput.durationMs },
    });
    logger.info('superpowers', `Session ${sessionId} : step ${step} done (${stepOutput.durationMs}ms)`);
    return stepOutput;
  }

  /**
   * Lecture rapide d'une session.
   */
  getState(sessionId: string): SuperpowerSession | null {
    const sessions = this.listSessions();
    return sessions.find((s) => s.sessionId === sessionId) ?? null;
  }

  /**
   * Liste toutes les sessions (récentes d'abord).
   */
  listSessions(): SuperpowerSession[] {
    try {
      const raw = localStorage.getItem(SESSIONS_KEY) ?? '[]';
      const arr = JSON.parse(raw) as SuperpowerSession[];
      return Array.isArray(arr) ? arr.slice().sort((a, b) => b.updatedAt - a.updatedAt) : [];
    } catch {
      return [];
    }
  }

  /**
   * Annule une session active.
   */
  cancel(sessionId: string): boolean {
    const session = this.getState(sessionId);
    if (!session || session.status !== 'active') return false;
    session.status = 'cancelled';
    session.updatedAt = Date.now();
    this.persistSession(session);
    void auditLog.record('superpowers.cancel', { details: { sessionId } });
    return true;
  }

  private buildPrevOutputsContext(session: SuperpowerSession): string {
    const parts: string[] = [];
    for (const step of session.completedSteps.slice(-3)) {
      const out = session.outputs[step];
      if (out) parts.push(`### ${step}\n${out.output.slice(0, 1500)}`);
    }
    return parts.join('\n\n');
  }

  private persistSession(session: SuperpowerSession): void {
    try {
      const sessions = this.listSessions();
      const idx = sessions.findIndex((s) => s.sessionId === session.sessionId);
      if (idx >= 0) sessions[idx] = session;
      else sessions.push(session);
      const trimmed = sessions.slice(0, SESSIONS_MAX);
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(trimmed));
    } catch (err: unknown) {
      logger.warn('superpowers', 'persist failed', { err });
    }
  }
}

export const superpowersMethodology = new SuperpowersMethodologyService();
