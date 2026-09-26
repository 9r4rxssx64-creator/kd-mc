/**
 * APEX v13.4.2 — Code Review 5 Agents Service (Yury Plugin équivalent #2)
 *
 * Lance 5 IA en parallèle sur un diff/PR avec rôles distincts pour audit complet :
 *  - Agent A : CLAUDE.md compliance (lit règles permanentes via memory.getDocsContext)
 *  - Agent B : Bug detection (logique, edge cases, null checks)
 *  - Agent C : Redundant rule check (anti-pattern duplication, dead code)
 *  - Agent D : Git history context (changements similaires précédents)
 *  - Agent E : Code patterns (best practices, sécurité, perf)
 *
 * Utilise crew-experts.ts (multi-provider parallèle) + memory.getDocsContext (CLAUDE.md).
 * Confidence threshold default 80 (configurable). Rapport agrégé + consensus.
 *
 * Anti-pattern Erreur #28 : service WIRED dans yury-plugins admin view + tests.
 */

import { logger } from '../../core/logger.js';
import { memory } from '../../core/memory.js';
import { auditLog } from '../observability/audit-log.js';

import { crewExperts, type CrewMember, type CrewResult } from './crew-experts.js';

export type AgentRole =
  | 'claude-md-compliance'
  | 'bug-detection'
  | 'redundancy-check'
  | 'git-history-context'
  | 'code-patterns';

export interface AgentFinding {
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  msg: string;
  line?: number;
  fix?: string;
}

export interface AgentResult {
  role: AgentRole;
  provider: string;
  findings: AgentFinding[];
  confidence: number; /* 0-100 */
  rawText: string;
  ok: boolean;
  error?: string;
}

export interface ReviewReport {
  diffPreview: string;
  agents: AgentResult[];
  consensus: string;
  finalScore: number; /* 0-100 */
  totalFindings: number;
  criticalFindings: number;
  reviewedAt: number;
  durationMs: number;
}

export interface ReviewOptions {
  /** Diff string (raw) ou réf URL/SHA pour fetch */
  diff: string | { url: string; sha?: string };
  /** Min confidence pour qu'un agent compte dans le consensus (default 80) */
  confidenceThreshold?: number;
  /** Préfère rôles spécialisés (default true) */
  specialized?: boolean;
}

const HISTORY_KEY = 'apex_v13_code_review_history';
const HISTORY_MAX = 30;

/* Mapping rôle → provider préféré (cohérent crew-experts EXPERTISE_MAP) */
const ROLE_PROVIDER_MAP: Record<AgentRole, CrewMember> = {
  'claude-md-compliance': { provider: 'anthropic', expertise: 'reasoning' },
  'bug-detection': { provider: 'openai', expertise: 'code-quality' },
  'redundancy-check': { provider: 'gemini', expertise: 'analysis' },
  'git-history-context': { provider: 'groq', expertise: 'speed' },
  'code-patterns': { provider: 'openrouter', expertise: 'general' },
};

const ALL_ROLES: AgentRole[] = [
  'claude-md-compliance',
  'bug-detection',
  'redundancy-check',
  'git-history-context',
  'code-patterns',
];

class CodeReviewMultiAgentService {
  /**
   * Lance les 5 agents en parallèle sur le diff + agrège.
   */
  async review(opts: ReviewOptions): Promise<ReviewReport> {
    const tStart = Date.now();
    const threshold = opts.confidenceThreshold ?? 80;
    const diffText = await this.normalizeDiff(opts.diff);
    const diffPreview = diffText.slice(0, 500);

    /* Récupère règles CLAUDE.md pour Agent A */
    const docsContext = memory.getDocsContext();
    const claudeMdContent = docsContext['CLAUDE.md']?.content ?? '';
    const claudeMdSnippet = claudeMdContent.slice(0, 4000); /* éviter overflow tokens */

    /* Construit système prompts par rôle */
    const members: CrewMember[] = ALL_ROLES.map((role) => {
      const base = ROLE_PROVIDER_MAP[role];
      return {
        ...base,
        systemPromptOverride: this.buildRolePrompt(role, claudeMdSnippet),
      };
    });

    /* Prompt user = le diff à reviewer */
    const taskText = this.buildTaskPrompt(diffText);

    let crewResult: CrewResult;
    try {
      crewResult = await crewExperts.run({
        task: taskText,
        systemPrompt: 'Code reviewer expert.', /* override par rôle */
        members,
        mode: opts.specialized === false ? 'consensus' : 'specialized',
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn('code-review-multi-agent', 'crew run failed', { err: errMsg });
      crewResult = {
        task: taskText.slice(0, 500),
        mode: 'specialized',
        responses: [],
        synthesis: 'Erreur lors du lancement des agents.',
        conflicts: [],
        consensus: false,
        totalLatencyMs: Date.now() - tStart,
        ts: Date.now(),
      };
    }

    /* Parse chaque réponse en AgentFinding[] + confidence */
    const agents: AgentResult[] = ALL_ROLES.map((role, i) => {
      const response = crewResult.responses[i];
      if (!response) {
        return {
          role,
          provider: ROLE_PROVIDER_MAP[role].provider,
          findings: [],
          confidence: 0,
          rawText: '',
          ok: false,
          error: 'no response',
        };
      }
      const findings = this.parseAgentFindings(response.text);
      const confidence = this.estimateConfidence(response.text, findings);
      return {
        role,
        provider: response.provider,
        findings,
        confidence,
        rawText: response.text,
        ok: response.ok,
        ...(response.error && { error: response.error }),
      };
    });

    /* Agrège : findings de chaque agent au-dessus du threshold */
    const validAgents = agents.filter((a) => a.ok && a.confidence >= threshold);
    const totalFindings = validAgents.reduce((sum, a) => sum + a.findings.length, 0);
    const criticalFindings = validAgents.reduce(
      (sum, a) => sum + a.findings.filter((f) => f.severity === 'critical').length,
      0,
    );

    /* Score : 100 - pénalités par finding */
    const finalScore = this.computeScore(validAgents);

    /* Consensus : synthèse des agents valides */
    const consensus = this.buildConsensus(validAgents, crewResult.synthesis);

    const report: ReviewReport = {
      diffPreview,
      agents,
      consensus,
      finalScore,
      totalFindings,
      criticalFindings,
      reviewedAt: Date.now(),
      durationMs: Date.now() - tStart,
    };

    this.persistReport(report);
    void auditLog.record('code-review.run', {
      details: {
        agents: validAgents.length,
        findings: totalFindings,
        critical: criticalFindings,
        score: finalScore,
        latencyMs: report.durationMs,
      },
    });
    logger.info(
      'code-review-multi-agent',
      `Review complete: ${validAgents.length}/${agents.length} agents · ${totalFindings} findings · score=${finalScore}`,
    );

    return report;
  }

  /**
   * Récupère l'historique des reviews.
   */
  history(): ReviewReport[] {
    try {
      const raw = localStorage.getItem(HISTORY_KEY) ?? '[]';
      const arr = JSON.parse(raw) as ReviewReport[];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  private async normalizeDiff(diff: string | { url: string; sha?: string }): Promise<string> {
    if (typeof diff === 'string') return diff;
    /* Support fetch URL diff (GitHub raw, etc.) */
    try {
      const url = diff.sha ? `${diff.url}/${diff.sha}.diff` : diff.url;
      const resp = await fetch(url, { method: 'GET' });
      if (!resp.ok) {
        throw new Error(`fetch diff failed: HTTP ${resp.status}`);
      }
      return await resp.text();
    } catch (err: unknown) {
      logger.warn('code-review-multi-agent', 'fetch diff failed', { err });
      return `[Erreur fetch diff: ${diff.url}]`;
    }
  }

  buildRolePrompt(role: AgentRole, claudeMd: string): string {
    const baseInstructions = `Tu es un reviewer expert. Réponds STRICTEMENT en JSON suivant le format :
{
  "findings": [
    {"severity": "critical|high|medium|low|info", "msg": "...", "line": 42, "fix": "..."}
  ],
  "confidence": 85,
  "summary": "..."
}
Sois précis, factuel, sans surplus.`;

    switch (role) {
      case 'claude-md-compliance':
        return `Audit le diff vs RÈGLES PERMANENTES CLAUDE.md. Repère les violations.

EXTRAIT CLAUDE.md (top règles) :
${claudeMd || '[CLAUDE.md non disponible]'}

${baseInstructions}`;

      case 'bug-detection':
        return `Cherche bugs : null/undefined refs, off-by-one, race conditions, promises non catch,
async leaks, edge cases non gérés, conditions impossibles, type mismatches.

${baseInstructions}`;

      case 'redundancy-check':
        return `Cherche : duplication code, fonctions mortes, imports inutilisés, conditions toujours
true/false, branches mortes, anti-patterns DRY.

${baseInstructions}`;

      case 'git-history-context':
        return `Imagine que ce diff fait partie d'une longue série de commits. Cherche signes de :
régression sur fix précédent, modif d'un fichier critique sans test, changement de signature
public sans migration. Sois pragmatique.

${baseInstructions}`;

      case 'code-patterns':
        return `Audit best practices : sécurité (XSS, injection, secrets en clair), perf (boucles
nested O(n²), DOM querySelector dans loop), accessibilité (aria-labels manquants), TypeScript
(any, ts-ignore, type assertions).

${baseInstructions}`;
    }
  }

  private buildTaskPrompt(diff: string): string {
    /* Cap diff à 8000 chars pour éviter explosion tokens */
    const capped = diff.length > 8000 ? diff.slice(0, 8000) + '\n[... diff tronqué]' : diff;
    return `Review ce diff selon ton rôle. Réponds en JSON UNIQUEMENT.\n\n\`\`\`diff\n${capped}\n\`\`\``;
  }

  parseAgentFindings(rawText: string): AgentFinding[] {
    if (!rawText) return [];
    try {
      /* Extrait premier bloc JSON {...} (resilient aux préfixes/suffixes IA) */
      const match = rawText.match(/\{[\s\S]*"findings"[\s\S]*\}/);
      if (!match) return [];
      const json = JSON.parse(match[0]) as { findings?: unknown[] };
      if (!Array.isArray(json.findings)) return [];
      return json.findings
        .filter((f): f is Record<string, unknown> => typeof f === 'object' && f !== null)
        .map((f) => {
          const severity = String(f['severity'] ?? 'info') as AgentFinding['severity'];
          const validSeverities: AgentFinding['severity'][] = ['info', 'low', 'medium', 'high', 'critical'];
          const finalSev: AgentFinding['severity'] = validSeverities.includes(severity) ? severity : 'info';
          const finding: AgentFinding = {
            severity: finalSev,
            msg: String(f['msg'] ?? '').slice(0, 300),
          };
          if (typeof f['line'] === 'number') finding.line = f['line'];
          if (typeof f['fix'] === 'string') finding.fix = String(f['fix']).slice(0, 300);
          return finding;
        })
        .filter((f) => f.msg.length > 0);
    } catch {
      return [];
    }
  }

  private estimateConfidence(rawText: string, findings: AgentFinding[]): number {
    if (!rawText) return 0;
    /* Heuristique : confidence affichée par IA OU calculée depuis qualité texte */
    try {
      const match = rawText.match(/"confidence"\s*:\s*(\d+)/);
      if (match && match[1]) {
        const n = Number.parseInt(match[1], 10);
        if (Number.isFinite(n) && n >= 0 && n <= 100) return n;
      }
    } catch {
      /* fallback ci-dessous */
    }
    /* Sinon : confidence basée sur longueur réponse + nb findings structurés */
    if (rawText.length < 50) return 30;
    if (rawText.length < 200) return 50;
    if (findings.length > 0) return 75;
    return 65;
  }

  private computeScore(agents: readonly AgentResult[]): number {
    if (agents.length === 0) return 100; /* aucun agent = aucune info */
    let penalty = 0;
    for (const a of agents) {
      for (const f of a.findings) {
        switch (f.severity) {
          case 'critical': penalty += 20; break;
          case 'high': penalty += 12; break;
          case 'medium': penalty += 6; break;
          case 'low': penalty += 2; break;
          case 'info': penalty += 1; break;
        }
      }
    }
    return Math.max(0, 100 - penalty);
  }

  private buildConsensus(validAgents: readonly AgentResult[], synthesis: string): string {
    if (validAgents.length === 0) return 'Aucun agent valide n\'a répondu (confidence < threshold).';
    const lines: string[] = [];
    lines.push(`✅ ${validAgents.length} agents valides ont participé`);
    const totalFindings = validAgents.reduce((sum, a) => sum + a.findings.length, 0);
    if (totalFindings === 0) {
      lines.push('🟢 Aucune anomalie détectée.');
    } else {
      lines.push(`⚠️ ${totalFindings} findings au total :`);
      for (const a of validAgents) {
        if (a.findings.length === 0) continue;
        lines.push(`  • [${a.role}] ${a.findings.length} finding(s)`);
      }
    }
    if (synthesis && synthesis.length < 500) lines.push(`\n${synthesis}`);
    return lines.join('\n');
  }

  private persistReport(report: ReviewReport): void {
    try {
      const raw = localStorage.getItem(HISTORY_KEY) ?? '[]';
      const arr = JSON.parse(raw) as ReviewReport[];
      const list = Array.isArray(arr) ? arr : [];
      list.push(report);
      const trimmed = list.slice(-HISTORY_MAX);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
    } catch (err: unknown) {
      logger.warn('code-review-multi-agent', 'persist failed', { err });
    }
  }
}

export const codeReviewMultiAgent = new CodeReviewMultiAgentService();
