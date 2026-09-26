/**
 * APEX v13.4.3 — Plan Mode service (Kevin 2026-05-09 — TikTok IA IRL #2)
 *
 * Slash command `/plan <objectif>` → force IA à générer un plan structuré JSON
 * AVANT exécution. Modal preview avec bouton "Exécuter" qui passe le plan
 * comme system context au prochain message.
 *
 * Format plan : { steps: [{title, files, risk}], summary }
 *
 * Storage : `apex_v13_plan_active` (le dernier plan généré) + `apex_v13_plan_history` (max 20).
 *
 * Pas d'exécution auto : Kevin valide d'abord (modal). Kill switch via revoke().
 */

import { logger } from '../../core/logger.js';
import { aiRouter } from '../ai/ai-router.js';
import { auditLog } from '../observability/audit-log.js';

const ACTIVE_KEY = 'apex_v13_plan_active';
const HISTORY_KEY = 'apex_v13_plan_history';
const HISTORY_MAX = 20;

export interface PlanStep {
  title: string;
  files: string[];
  risk: 'low' | 'medium' | 'high';
}

export interface ExecutionPlan {
  id: string;
  objective: string;
  summary: string;
  steps: PlanStep[];
  createdAt: number;
  durationMs: number;
  rawText: string;
}

class PlanModeService {
  /**
   * Génère un plan structuré pour un objectif donné.
   */
  async generate(objective: string): Promise<ExecutionPlan> {
    const trimmed = (objective || '').trim();
    if (!trimmed) throw new Error('Objectif vide');
    const tStart = Date.now();
    const id = `plan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const systemPrompt = `Tu es Apex en MODE PLAN. L'utilisateur te donne un objectif. Tu DOIS retourner STRICTEMENT un JSON :
{
  "summary": "résumé 1-2 phrases du plan global",
  "steps": [
    { "title": "étape concise", "files": ["liste fichiers concernés"], "risk": "low|medium|high" },
    ...
  ]
}
Règles :
- 3 à 8 steps maximum, ordonnés
- Pas de texte hors JSON
- "files" est array de strings (peut être vide [])
- "risk" : low (lecture seule), medium (modif locale), high (suppression / breaking change)
- Pas d'exécution, juste le plan`;

    let collected = '';
    let lastErr: Error | undefined;
    try {
      await aiRouter.stream(
        [{ role: 'user', content: `Objectif : ${trimmed}\n\nRetourne STRICTEMENT le JSON du plan.` }],
        systemPrompt,
        (chunk) => { if (chunk.text) collected += chunk.text; },
        (err) => { lastErr = err; },
      );
    } catch (err: unknown) {
      lastErr = err instanceof Error ? err : new Error(String(err));
    }

    if (lastErr || !collected) {
      logger.warn('plan-mode', 'IA failed, fallback', { err: lastErr?.message });
      return this.fallbackPlan(id, trimmed, tStart, collected);
    }

    /* Parse JSON */
    let parsed: { summary: string; steps: PlanStep[] };
    try {
      const m = collected.match(/\{[\s\S]*"steps"[\s\S]*\}/);
      if (!m) throw new Error('JSON manquant');
      const obj = JSON.parse(m[0]) as { summary?: string; steps?: PlanStep[] };
      if (!obj || !Array.isArray(obj.steps)) throw new Error('format invalide');
      parsed = {
        summary: typeof obj.summary === 'string' ? obj.summary.slice(0, 500) : '',
        steps: obj.steps.slice(0, 8).map((s) => this.sanitizeStep(s)),
      };
    } catch (err: unknown) {
      logger.warn('plan-mode', 'parse failed, fallback', { err });
      return this.fallbackPlan(id, trimmed, tStart, collected);
    }

    const plan: ExecutionPlan = {
      id,
      objective: trimmed,
      summary: parsed.summary,
      steps: parsed.steps,
      createdAt: Date.now(),
      durationMs: Date.now() - tStart,
      rawText: collected.slice(0, 5000),
    };

    this.persist(plan);
    void auditLog.record('plan-mode.generate', {
      details: { id, objective: trimmed.slice(0, 100), steps: plan.steps.length },
    });
    logger.info('plan-mode', `Plan ${id} (${plan.steps.length} steps, ${plan.durationMs}ms)`);
    return plan;
  }

  /**
   * Récupère le plan actif (dernier généré non-revoké).
   */
  getActive(): ExecutionPlan | null {
    try {
      const raw = localStorage.getItem(ACTIVE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as ExecutionPlan;
    } catch { return null; }
  }

  /**
   * Revoke le plan actif (kill switch).
   */
  revoke(): void {
    localStorage.removeItem(ACTIVE_KEY);
    void auditLog.record('plan-mode.revoke');
    logger.info('plan-mode', 'Active plan revoked');
  }

  /**
   * Histoire des plans (max 20).
   */
  history(): ExecutionPlan[] {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw) as ExecutionPlan[];
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  }

  /**
   * Construit un system context à passer au prochain message après validation.
   */
  buildExecutionContext(plan: ExecutionPlan): string {
    const stepsTxt = plan.steps
      .map((s, i) => `${i + 1}. [${s.risk}] ${s.title}${s.files.length ? ` (${s.files.join(', ')})` : ''}`)
      .join('\n');
    return `[PLAN VALIDÉ — exécute en suivant ces étapes]\nObjectif : ${plan.objective}\nRésumé : ${plan.summary}\nÉtapes :\n${stepsTxt}\n\nApplique chaque étape dans l'ordre. Demande confirmation avant chaque step "high".`;
  }

  private sanitizeStep(s: unknown): PlanStep {
    const obj = (s ?? {}) as { title?: unknown; files?: unknown; risk?: unknown };
    const title = typeof obj.title === 'string' ? obj.title.slice(0, 200) : '(sans titre)';
    const files = Array.isArray(obj.files) ? obj.files.filter((f): f is string => typeof f === 'string').slice(0, 10) : [];
    const risk: 'low' | 'medium' | 'high' = obj.risk === 'high' ? 'high' : obj.risk === 'medium' ? 'medium' : 'low';
    return { title, files, risk };
  }

  private fallbackPlan(id: string, objective: string, tStart: number, raw: string): ExecutionPlan {
    const plan: ExecutionPlan = {
      id,
      objective,
      summary: 'Plan généré en fallback (IA indisponible ou parse échoué).',
      steps: [
        { title: 'Analyser le contexte', files: [], risk: 'low' },
        { title: 'Identifier les fichiers concernés', files: [], risk: 'low' },
        { title: 'Implémenter les changements', files: [], risk: 'medium' },
        { title: 'Tester et valider', files: [], risk: 'low' },
      ],
      createdAt: Date.now(),
      durationMs: Date.now() - tStart,
      rawText: raw.slice(0, 5000),
    };
    this.persist(plan);
    return plan;
  }

  private persist(plan: ExecutionPlan): void {
    try {
      localStorage.setItem(ACTIVE_KEY, JSON.stringify(plan));
      const hist = this.history();
      hist.unshift(plan);
      const capped = hist.slice(0, HISTORY_MAX);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(capped));
    } catch (err: unknown) {
      logger.warn('plan-mode', 'persist failed', { err });
    }
  }
}

export const planMode = new PlanModeService();
