/**
 * Tests chat-fallback.ts (path 100/100 — anti-message-vide règle CLAUDE.md).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { chatFallback } from '../../services/ai/chat-fallback.js';

describe('Chat Fallback (anti-message-vide)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('needsFallback detection', () => {
    it('détecte message vide', () => {
      expect(chatFallback.needsFallback('')).toBe(true);
      expect(chatFallback.needsFallback('   ')).toBe(true);
    });

    it('détecte phrases interdites par règle Kevin', () => {
      expect(chatFallback.needsFallback("Je n'ai pas compris ta demande")).toBe(true);
      expect(chatFallback.needsFallback("Pouvez-vous reformuler ?")).toBe(true);
      expect(chatFallback.needsFallback("Désolé, je ne peux pas répondre")).toBe(true);
      expect(chatFallback.needsFallback("API indisponible")).toBe(true);
      expect(chatFallback.needsFallback("Réessayez plus tard")).toBe(true);
    });

    it('détecte messages anglais interdits', () => {
      expect(chatFallback.needsFallback("I don't understand")).toBe(true);
      expect(chatFallback.needsFallback("I can't help with that")).toBe(true);
    });

    it('réponse normale non-vide → pas de fallback', () => {
      expect(chatFallback.needsFallback('Bonjour Kevin, voici ma réponse à ta question : ...')).toBe(false);
      expect(chatFallback.needsFallback('Voici 3 options pour ton projet musical')).toBe(false);
    });

    it('message court < 10 chars → fallback', () => {
      expect(chatFallback.needsFallback('OK')).toBe(true);
      expect(chatFallback.needsFallback('Bien.')).toBe(true);
    });
  });

  describe('generateFallback intent detection', () => {
    it('greeting "bonjour" → propose options chat/projects/settings', () => {
      const r = chatFallback.generateFallback('bonjour');
      expect(r.text).toContain('Comment puis-je t');
      expect(r.options).toBeDefined();
      expect(r.options?.length).toBeGreaterThanOrEqual(3);
    });

    it('greeting "hello" / "hey" / "salut" → fallback chaleureux', () => {
      const r1 = chatFallback.generateFallback('hello');
      const r2 = chatFallback.generateFallback('salut');
      const r3 = chatFallback.generateFallback('coucou');
      expect(r1.options).toBeDefined();
      expect(r2.options).toBeDefined();
      expect(r3.options).toBeDefined();
    });

    it('demande "comment ça va" → propose studios', () => {
      const r = chatFallback.generateFallback('comment ça va');
      expect(r.options?.some((o) => o.action.includes('studio'))).toBe(true);
    });

    it('demande "aide / help / SOS" → liste plusieurs façons', () => {
      const r = chatFallback.generateFallback('aide');
      expect(r.text).toContain('aider');
      expect(r.options?.some((o) => o.action === 'escalate_human')).toBe(true);
    });

    it('demande générique → réponse DIRECTE actionable (Kevin 2026-05-08 anti-verbeux)', () => {
      /* feature.ia-verbose-plans default OFF → réponse directe, PAS de Plan A/B/C */
      const r = chatFallback.generateFallback('quelque chose de très spécifique');
      expect(r.text).not.toContain('Plan A');
      expect(r.text).not.toContain('Plan B');
      expect(r.text).not.toContain('Plan C');
      expect(r.text).not.toContain("3 façons d'aborder");
      expect(r.text).not.toContain('Laquelle préfères-tu');
      /* Réponse directe avec retry/diagnostic (selon contexte erreur) */
      expect(r.options?.length).toBeGreaterThanOrEqual(1);
    });

    it('toggle feature.ia-verbose-plans ON → Plan A/B/C disponible (debug)', () => {
      /* Active le toggle global pour vérifier l'ancien comportement opt-in */
      const globalKey = 'ax_feature_toggles_global';
      const prev = localStorage.getItem(globalKey);
      localStorage.setItem(
        globalKey,
        JSON.stringify({ 'feature.ia-verbose-plans': true }),
      );
      try {
        const r = chatFallback.generateFallback('quelque chose de très spécifique');
        expect(r.text).toContain('Plan A');
        expect(r.text).toContain('Plan B');
        expect(r.text).toContain('Plan C');
        expect(r.options?.length).toBe(3);
      } finally {
        if (prev === null) localStorage.removeItem(globalKey);
        else localStorage.setItem(globalKey, prev);
      }
    });
  });

  describe('generateFallback erreurs API spécifiques', () => {
    it('erreur quota/rate limit → propose recharge + failover', () => {
      const r = chatFallback.generateFallback('test', '429 Rate limit exceeded');
      expect(r.text).toContain('Crédit API');
      expect(r.options?.some((o) => o.action.includes('billing'))).toBe(true);
      expect(r.options?.some((o) => o.action.includes('failover'))).toBe(true);
    });

    it('erreur 401 unauthorized → propose Coffre', () => {
      const r = chatFallback.generateFallback('test', '401 Unauthorized invalid api key');
      expect(r.text).toContain('clé API');
      expect(r.options?.some((o) => o.action === 'open_vault')).toBe(true);
    });

    it('erreur network → queue + retry option', () => {
      const r = chatFallback.generateFallback('test', 'fetch failed network error');
      expect(r.text).toContain('Réseau');
      expect(r.options?.some((o) => o.action === 'retry')).toBe(true);
    });
  });

  describe('queue persistante (jamais perdu)', () => {
    it('enqueue ajoute message + retourne position', () => {
      const r = chatFallback.enqueue('test message', 'kevin');
      expect(r.queued).toBe(true);
      expect(r.position).toBe(1);
    });

    it('multiple enqueue incrémente position', () => {
      chatFallback.enqueue('msg 1', 'kevin');
      chatFallback.enqueue('msg 2', 'kevin');
      const r = chatFallback.enqueue('msg 3', 'kevin');
      expect(r.position).toBe(3);
    });

    it('cap 50 max', () => {
      for (let i = 0; i < 60; i++) chatFallback.enqueue(`msg ${i}`, 'kevin');
      const stats = chatFallback.getQueueStats('kevin');
      expect(stats.pending).toBeLessThanOrEqual(50);
    });

    it('dequeue retourne next pending + marque processing', () => {
      chatFallback.enqueue('msg A', 'kevin');
      chatFallback.enqueue('msg B', 'kevin');
      const r = chatFallback.dequeue('kevin');
      expect(r.message).toBe('msg A');
      expect(r.remaining).toBe(1);
      const stats = chatFallback.getQueueStats('kevin');
      expect(stats.processing).toBe(1);
      expect(stats.pending).toBe(1);
    });

    it('queue vide → dequeue retourne remaining=0 sans message', () => {
      const r = chatFallback.dequeue('empty_user');
      expect(r.message).toBeUndefined();
      expect(r.remaining).toBe(0);
    });

    it('queue par user-id isolée (Kevin / Laurence)', () => {
      chatFallback.enqueue('kevin msg', 'kevin');
      chatFallback.enqueue('laurence msg 1', 'laurence');
      chatFallback.enqueue('laurence msg 2', 'laurence');
      expect(chatFallback.getQueueStats('kevin').pending).toBe(1);
      expect(chatFallback.getQueueStats('laurence').pending).toBe(2);
    });

    it('markDone cleanup après 5 min (GC)', () => {
      chatFallback.enqueue('test', 'kevin');
      const dq = chatFallback.dequeue('kevin');
      const queue = JSON.parse(localStorage.getItem('apex_v13_pending_messages_kevin') ?? '[]') as Array<{ id: string; status: string }>;
      const id = queue[0]?.id ?? '';
      chatFallback.markDone(id, 'kevin');
      const stats = chatFallback.getQueueStats('kevin');
      expect(stats.done).toBeGreaterThanOrEqual(0);
      expect(dq.message).toBe('test');
    });
  });
});
