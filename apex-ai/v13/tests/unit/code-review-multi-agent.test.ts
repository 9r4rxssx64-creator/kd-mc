/**
 * Tests code-review-multi-agent.ts (Yury Plugin équivalent #2).
 *
 * Mocks crewExperts pour ne pas appeler de vraies IA (test offline).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { codeReviewMultiAgent } from '../../services/ai/code-review-multi-agent.js';

vi.mock('../../services/ai/crew-experts.js', () => ({
  crewExperts: {
    run: vi.fn().mockImplementation((opts: unknown) => {
      const o = opts as { members: unknown[]; task: string };
      const responses = o.members.map((m) => {
        const member = m as { provider: string };
        return {
          provider: member.provider,
          expertise: 'test',
          ok: true,
          text: JSON.stringify({
            findings: [
              { severity: 'medium', msg: 'Test finding par ' + member.provider, line: 1 },
            ],
            confidence: 85,
            summary: 'Mock summary',
          }),
          latencyMs: 100,
        };
      });
      return Promise.resolve({
        task: o.task.slice(0, 500),
        mode: 'specialized',
        responses,
        synthesis: 'Mock synthesis',
        conflicts: [],
        consensus: true,
        totalLatencyMs: 100,
        ts: Date.now(),
      });
    }),
  },
}));

vi.mock('../../core/memory.js', () => ({
  memory: {
    getDocsContext: vi.fn().mockReturnValue({
      'CLAUDE.md': { content: 'Règle test : pas de any TypeScript', ts: Date.now(), size: 100 },
    }),
  },
}));

describe('Code Review Multi-Agent (Yury Plugin équivalent)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('review', () => {
    it('lance les 5 agents en parallèle et retourne un rapport agrégé', async () => {
      const report = await codeReviewMultiAgent.review({
        diff: 'diff --git a/test.ts b/test.ts\n+const x: any = 1;',
      });
      expect(report.agents).toHaveLength(5);
      expect(report.totalFindings).toBeGreaterThan(0);
      expect(report.reviewedAt).toBeGreaterThan(0);
    });

    it('le rapport contient un consensus', async () => {
      const report = await codeReviewMultiAgent.review({
        diff: '+const foo = bar;',
      });
      expect(report.consensus).toContain('agents');
      expect(report.consensus.length).toBeGreaterThan(10);
    });

    it('finalScore <= 100 et >= 0', async () => {
      const report = await codeReviewMultiAgent.review({
        diff: '+let test = 1;',
      });
      expect(report.finalScore).toBeGreaterThanOrEqual(0);
      expect(report.finalScore).toBeLessThanOrEqual(100);
    });

    it('respecte confidenceThreshold (filtre agents bas)', async () => {
      const report = await codeReviewMultiAgent.review({
        diff: '+test',
        confidenceThreshold: 99, /* aucun ne passe */
      });
      /* Avec threshold à 99, aucun agent valide → consensus message dédié */
      expect(report.consensus).toContain('Aucun agent valide');
    });
  });

  describe('parseAgentFindings', () => {
    it('parse JSON valide depuis IA response', () => {
      const text = `Voici l'audit :
\`\`\`json
{"findings": [{"severity": "high", "msg": "Bug détecté"}], "confidence": 80}
\`\`\``;
      const findings = codeReviewMultiAgent.parseAgentFindings(text);
      expect(findings).toHaveLength(1);
      expect(findings[0]?.severity).toBe('high');
    });

    it('retourne [] si JSON invalide', () => {
      const findings = codeReviewMultiAgent.parseAgentFindings('texte sans JSON');
      expect(findings).toEqual([]);
    });

    it('filtre severity invalide → fallback info', () => {
      const text = '{"findings": [{"severity": "WUT", "msg": "test"}], "confidence": 50}';
      const findings = codeReviewMultiAgent.parseAgentFindings(text);
      expect(findings[0]?.severity).toBe('info');
    });
  });

  describe('history', () => {
    it('persiste les reviews', async () => {
      await codeReviewMultiAgent.review({ diff: '+test' });
      const hist = codeReviewMultiAgent.history();
      expect(hist.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('buildRolePrompt', () => {
    it('chaque rôle a un prompt distinct', () => {
      const a = codeReviewMultiAgent.buildRolePrompt('claude-md-compliance', 'règle X');
      const b = codeReviewMultiAgent.buildRolePrompt('bug-detection', 'règle X');
      expect(a).not.toBe(b);
      expect(a).toContain('CLAUDE.md');
      expect(b).toContain('bug');
    });
  });
});
