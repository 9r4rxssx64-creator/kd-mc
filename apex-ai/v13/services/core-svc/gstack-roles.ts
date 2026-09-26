/**
 * APEX v13.4.2 — GStack Roles Service (Yury Plugin équivalent #5)
 *
 * 7 rôles spécialisés (pragmatique vs 23 originaux Yury) qu'on peut
 * déclencher individuellement OU en pipeline complet :
 *
 *   - CEO              : décision business, priorités, ROI
 *   - Designer         : UX/UI, anti-slop, brand
 *   - Engineer         : implémentation TypeScript strict
 *   - QA               : tests vitest exhaustifs
 *   - Release Manager  : versioning, changelog, deploy checklist
 *   - Reviewer         : code review honnête (sécu/perf/lisibilité)
 *   - Reflector        : lessons learned, pattern detection
 *
 * Chaque rôle = system prompt spécialisé via aiRouter.stream.
 * Pipeline = enchaînement séquentiel des 7 rôles avec contexte enrichi.
 */

import { logger } from '../../core/logger.js';
import { aiRouter } from '../ai/ai-router.js';
import { auditLog } from '../observability/audit-log.js';

export type GStackRole =
  | 'CEO'
  | 'Designer'
  | 'Engineer'
  | 'QA'
  | 'ReleaseManager'
  | 'Reviewer'
  | 'Reflector';

export interface RoleOutput {
  role: GStackRole;
  task: string;
  output: string;
  durationMs: number;
  ts: number;
  ok: boolean;
  error?: string;
}

export interface PipelineResult {
  task: string;
  roles: RoleOutput[];
  finalSynthesis: string;
  totalDurationMs: number;
  ts: number;
}

const HISTORY_KEY = 'apex_v13_gstack_roles_history';
const HISTORY_MAX = 25;

const ROLE_PROMPTS: Record<GStackRole, string> = {
  CEO: `Tu es CEO. Décide vite, priorise, justifie en 3 bullets max :
- Impact business
- Priorité (P0/P1/P2)
- ROI estimé
Pas de blabla, factuel.`,

  Designer: `Tu es designer senior (niveau Apple/Linear).
Anti-slop strict : pas Inter/Roboto, pas couleurs Bootstrap.
Format : sketch ASCII + palette couleurs + interactions clés.
Mobile-first 375px obligatoire.`,

  Engineer: `Tu es senior engineer TypeScript strict.
Pas de any, pas de @ts-ignore, pas de eval.
Code prêt à coller, imports explicites, typage exhaustif.
Si plusieurs fichiers : nomme chacun en commentaire.`,

  QA: `Tu es QA expert vitest.
Min 5 tests : happy path, edge cases, errors, async, mocks.
Format prêt à coller. describe/it/expect cohérent.`,

  ReleaseManager: `Tu es release manager.
Output strict :
- Version semver
- Commit message (titre + bullets)
- Checklist deploy : build, tests, sync apex-ai-v13/, push, vérif data-app-ver
- Risques/rollback`,

  Reviewer: `Tu es reviewer honnête sans complaisance.
Format : ✅ OK / ⚠️ Suggestion / ❌ Problème + ligne précise.
Sécu / perf / lisibilité / TypeScript / accessibilité.
Score honnête /100.`,

  Reflector: `Tu es coach senior. Tire les leçons :
- 3 patterns réutilisables ?
- 2 pièges évités ?
- 1 amélioration future ?
- Score qualité du process /10.
Format Markdown bullets.`,
};

class GStackRolesService {
  /**
   * Spawn un seul rôle sur une tâche spécifique.
   */
  async spawnRole(role: GStackRole, task: string): Promise<RoleOutput> {
    const tStart = Date.now();
    const systemPrompt = ROLE_PROMPTS[role];

    let collectedText = '';
    let lastErr: Error | undefined;
    try {
      await aiRouter.stream(
        [{ role: 'user', content: task }],
        systemPrompt,
        (chunk) => {
          if (chunk.text) collectedText += chunk.text;
        },
        (err) => { lastErr = err; },
      );
    } catch (err: unknown) {
      lastErr = err instanceof Error ? err : new Error(String(err));
    }

    const output: RoleOutput = {
      role,
      task: task.slice(0, 500),
      output: collectedText,
      durationMs: Date.now() - tStart,
      ts: Date.now(),
      ok: !lastErr && collectedText.length > 0,
      ...(lastErr && { error: lastErr.message.slice(0, 200) }),
    };

    void auditLog.record('gstack.role', {
      details: { role, durationMs: output.durationMs, ok: output.ok },
    });
    logger.info('gstack-roles', `Role ${role} done (${output.durationMs}ms · ok=${output.ok})`);
    return output;
  }

  /**
   * Enchaîne les 7 rôles en séquence avec contexte enrichi.
   * Chaque rôle reçoit le résultat des rôles précédents pour cohérence.
   */
  async runFullPipeline(task: string): Promise<PipelineResult> {
    const tStart = Date.now();
    const roles: GStackRole[] = ['CEO', 'Designer', 'Engineer', 'QA', 'ReleaseManager', 'Reviewer', 'Reflector'];
    const outputs: RoleOutput[] = [];

    for (const role of roles) {
      const enrichedTask = this.enrichTaskWithContext(task, outputs);
      const output = await this.spawnRole(role, enrichedTask);
      outputs.push(output);
    }

    const finalSynthesis = this.buildSynthesis(outputs);
    const result: PipelineResult = {
      task: task.slice(0, 500),
      roles: outputs,
      finalSynthesis,
      totalDurationMs: Date.now() - tStart,
      ts: Date.now(),
    };

    this.persistResult(result);
    void auditLog.record('gstack.pipeline', {
      details: {
        task: task.slice(0, 100),
        rolesCount: roles.length,
        successful: outputs.filter((o) => o.ok).length,
        durationMs: result.totalDurationMs,
      },
    });
    logger.info('gstack-roles', `Pipeline done: ${outputs.filter((o) => o.ok).length}/${roles.length} OK · ${result.totalDurationMs}ms`);
    return result;
  }

  /**
   * Liste pipelines récents.
   */
  history(): PipelineResult[] {
    try {
      const raw = localStorage.getItem(HISTORY_KEY) ?? '[]';
      const arr = JSON.parse(raw) as PipelineResult[];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  /**
   * Liste des rôles disponibles + leurs descriptions courtes.
   */
  listRoles(): Array<{ role: GStackRole; description: string }> {
    return [
      { role: 'CEO', description: 'Décision business, priorités, ROI' },
      { role: 'Designer', description: 'UX/UI, anti-slop, brand' },
      { role: 'Engineer', description: 'Implémentation TypeScript strict' },
      { role: 'QA', description: 'Tests vitest exhaustifs' },
      { role: 'ReleaseManager', description: 'Versioning, changelog, deploy' },
      { role: 'Reviewer', description: 'Code review honnête' },
      { role: 'Reflector', description: 'Lessons learned' },
    ];
  }

  private enrichTaskWithContext(task: string, prevOutputs: readonly RoleOutput[]): string {
    if (prevOutputs.length === 0) return task;
    const context = prevOutputs
      .slice(-3) /* max 3 derniers pour ne pas exploser tokens */
      .map((o) => `### ${o.role}\n${o.output.slice(0, 1200)}`)
      .join('\n\n');
    return `Tâche : ${task}\n\nContexte (rôles précédents) :\n${context}`;
  }

  private buildSynthesis(outputs: readonly RoleOutput[]): string {
    const successful = outputs.filter((o) => o.ok);
    if (successful.length === 0) return 'Pipeline a échoué : aucun rôle n\'a produit de résultat.';
    const lines: string[] = [];
    lines.push(`## Synthèse pipeline (${successful.length}/${outputs.length} rôles OK)\n`);
    for (const o of successful) {
      const preview = o.output.slice(0, 200).replace(/\n/g, ' ');
      lines.push(`**${o.role}** (${o.durationMs}ms) : ${preview}...`);
    }
    return lines.join('\n');
  }

  private persistResult(result: PipelineResult): void {
    try {
      const raw = localStorage.getItem(HISTORY_KEY) ?? '[]';
      const arr = JSON.parse(raw) as PipelineResult[];
      const list = Array.isArray(arr) ? arr : [];
      list.push(result);
      const trimmed = list.slice(-HISTORY_MAX);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
    } catch (err: unknown) {
      logger.warn('gstack-roles', 'persist failed', { err });
    }
  }
}

export const gstackRoles = new GStackRolesService();
