/**
 * Tests crew-experts v13.4.142 (Kevin "100/100 réel").
 *
 * Module : services/crew-experts.ts (250 stmts, était 10.8% coverage).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const { mockAiRouter, mockAuditLog } = vi.hoisted(() => ({
  mockAiRouter: { stream: vi.fn() },
  mockAuditLog: { record: vi.fn() },
}));

vi.mock('../../services/ai/ai-router.js', () => ({ aiRouter: mockAiRouter }));
vi.mock('../../services/observability/audit-log.js', () => ({ auditLog: mockAuditLog }));

import { crewExperts, type CrewMember } from '../../services/ai/crew-experts.js';

describe('crew-experts (v13.4.142 coverage)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mockAuditLog.record.mockResolvedValue(undefined);
  });

  afterEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('run', () => {
    it('throw si < 2 members', async () => {
      await expect(
        crewExperts.run({ task: 'test', members: [{ provider: 'anthropic' }] }),
      ).rejects.toThrow(/at least 2/);
    });

    it('exécute multi-provider en parallèle + retourne result', async () => {
      mockAiRouter.stream.mockImplementation((_msgs, _sp, onChunk) => {
        onChunk({ text: 'Response provider X', done: true });
        return Promise.resolve();
      });
      const r = await crewExperts.run({
        task: 'Audit security',
        members: [{ provider: 'anthropic' }, { provider: 'openai' }],
      });
      expect(r.task).toContain('Audit security');
      expect(r.responses.length).toBe(2);
      expect(r.synthesis).toBeTypeOf('string');
      expect(r.mode).toBe('consensus');
      expect(r.consensus).toBeTypeOf('boolean');
    });

    it('utilise mode specialized si spécifié', async () => {
      mockAiRouter.stream.mockImplementation((_msgs, _sp, onChunk) => {
        onChunk({ text: 'Specialized response', done: true });
        return Promise.resolve();
      });
      const r = await crewExperts.run({
        task: 'task',
        members: [{ provider: 'anthropic' }, { provider: 'gemini' }],
        mode: 'specialized',
      });
      expect(r.mode).toBe('specialized');
    });

    it('utilise mode debate', async () => {
      mockAiRouter.stream.mockImplementation((_msgs, _sp, onChunk) => {
        onChunk({ text: 'Debate point of view', done: true });
        return Promise.resolve();
      });
      const r = await crewExperts.run({
        task: 'task',
        members: [{ provider: 'anthropic' }, { provider: 'openai' }],
        mode: 'debate',
      });
      expect(r.mode).toBe('debate');
    });

    it('gère provider qui throw → ok=false dans response', async () => {
      mockAiRouter.stream
        .mockResolvedValueOnce(undefined) /* first OK but no chunk */
        .mockRejectedValueOnce(new Error('provider boom'));
      const r = await crewExperts.run({
        task: 'task',
        members: [{ provider: 'anthropic' }, { provider: 'openai' }],
      });
      expect(r.responses.length).toBe(2);
      expect(r.responses.some((rr) => !rr.ok)).toBe(true);
    });

    it('persiste history dans localStorage', async () => {
      mockAiRouter.stream.mockImplementation((_msgs, _sp, onChunk) => {
        onChunk({ text: 'X', done: true });
        return Promise.resolve();
      });
      await crewExperts.run({
        task: 'task',
        members: [{ provider: 'anthropic' }, { provider: 'gemini' }],
      });
      const hist = crewExperts.history();
      expect(hist.length).toBeGreaterThan(0);
    });

    it('audit.record appelé', async () => {
      mockAiRouter.stream.mockImplementation((_msgs, _sp, onChunk) => {
        onChunk({ text: 'Y', done: true });
        return Promise.resolve();
      });
      await crewExperts.run({
        task: 'task',
        members: [{ provider: 'anthropic' }, { provider: 'gemini' }],
      });
      expect(mockAuditLog.record).toHaveBeenCalled();
    });
  });

  describe('synthesize', () => {
    it('retourne placeholder si aucune réponse OK', () => {
      const s = crewExperts.synthesize([], 'consensus');
      expect(s).toContain('Aucun expert');
    });

    it('retourne texte direct si 1 seule réponse OK', () => {
      const s = crewExperts.synthesize(
        [{ provider: 'anthropic', expertise: 'sec', text: 'unique reply', latencyMs: 10, ok: true }],
        'consensus',
      );
      expect(s).toBe('unique reply');
    });

    it('mode specialized affiche tous experts', () => {
      const s = crewExperts.synthesize(
        [
          { provider: 'anthropic', expertise: 'security', text: 'A', latencyMs: 10, ok: true },
          { provider: 'openai', expertise: 'code', text: 'B', latencyMs: 11, ok: true },
        ],
        'specialized',
      );
      expect(s).toContain('Synthèse');
      expect(s).toContain('Claude');
      expect(s).toContain('GPT');
    });

    it('mode consensus prend la réponse la plus longue', () => {
      const s = crewExperts.synthesize(
        [
          { provider: 'anthropic', expertise: 's', text: 'short', latencyMs: 10, ok: true },
          { provider: 'openai', expertise: 'c', text: 'longer response with more content', latencyMs: 11, ok: true },
        ],
        'consensus',
      );
      expect(s).toContain('longer response');
    });
  });

  describe('detectConflicts', () => {
    it('retourne [] si moins de 2 succès', () => {
      const c = crewExperts.detectConflicts([
        { provider: 'anthropic', expertise: 's', text: 'A', latencyMs: 10, ok: true },
      ]);
      expect(c).toEqual([]);
    });

    it('détecte longueurs très différentes >3x', () => {
      const c = crewExperts.detectConflicts([
        { provider: 'anthropic', expertise: 's', text: 'x', latencyMs: 10, ok: true },
        { provider: 'openai', expertise: 'c', text: 'x'.repeat(100), latencyMs: 11, ok: true },
      ]);
      expect(c.some((s) => s.includes('Divergence longueur'))).toBe(true);
    });

    it('détecte avis opposés (oui/non)', () => {
      const c = crewExperts.detectConflicts([
        { provider: 'anthropic', expertise: 's', text: 'oui c\'est safe', latencyMs: 10, ok: true },
        { provider: 'openai', expertise: 'c', text: 'non c\'est dangereux', latencyMs: 11, ok: true },
      ]);
      expect(c.some((s) => s.includes('avis opposés'))).toBe(true);
    });
  });

  describe('history', () => {
    it('retourne [] si vide', () => {
      expect(crewExperts.history()).toEqual([]);
    });

    it('retourne [] si localStorage corrompu', () => {
      localStorage.setItem('apex_v13_crew_history', '{invalid');
      expect(crewExperts.history()).toEqual([]);
    });
  });

  describe('shouldUseCrew', () => {
    it('détecte mot "audit"', () => {
      expect(crewExperts.shouldUseCrew('Fais un audit complet')).toBe(true);
    });

    it('détecte mot "expert"', () => {
      expect(crewExperts.shouldUseCrew('Demande à un expert pour ce point')).toBe(true);
    });

    it('détecte texte > 600 chars', () => {
      const long = 'a'.repeat(700);
      expect(crewExperts.shouldUseCrew(long)).toBe(true);
    });

    it('détecte décision critique + > 100 chars', () => {
      const t = 'Cette feature est-elle valide pour la production avant déploiement final critique général en zone sécurisée ? '.repeat(2);
      expect(crewExperts.shouldUseCrew(t)).toBe(true);
    });

    it('retourne false sur texte court banal', () => {
      expect(crewExperts.shouldUseCrew('Salut')).toBe(false);
    });
  });

  describe('defaultMembers (v13.4.364 : TOUTES les IA dispo, Kevin « Utilise toutes les ia dispo »)', () => {
    it('mode specialized = tous les providers dispo, anthropic en tête, rôles assignés', () => {
      const m: CrewMember[] = crewExperts.defaultMembers('specialized');
      expect(m.length).toBeGreaterThanOrEqual(2);
      expect(m[0]?.provider).toBe('anthropic');
      expect(m[0]?.expertise).toBe('security');
      /* providers tous DISTINCTS (le crew n'appelle jamais 2× la même IA) */
      expect(new Set(m.map((x) => x.provider)).size).toBe(m.length);
    });

    it('mode consensus = tous les providers dispo (sans rôle)', () => {
      const m = crewExperts.defaultMembers('consensus');
      expect(m.length).toBeGreaterThanOrEqual(2);
      expect(m.every((x) => x.expertise === undefined)).toBe(true);
    });

    it('mode par défaut = specialized (rôles présents)', () => {
      const m = crewExperts.defaultMembers();
      expect(m.length).toBeGreaterThanOrEqual(2);
      expect(m.every((x) => typeof x.expertise === 'string')).toBe(true);
    });
  });
});
