import { describe, it, expect, beforeEach } from 'vitest';
import { aiRouter } from '../../services/ai/ai-router.js';

describe('ai-router service (tests réels Jet 6.5)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('getApiKey + hasAnyKey', () => {
    it('hasAnyKey false sans clé configurée', () => {
      expect(aiRouter.hasAnyKey()).toBe(false);
    });

    it('hasAnyKey true si clé Anthropic configurée', () => {
      localStorage.setItem('ax_anthropic_key', 'sk-ant-api03-test');
      expect(aiRouter.hasAnyKey()).toBe(true);
    });

    it('hasAnyKey true si clé OpenRouter configurée', () => {
      localStorage.setItem('ax_openrouter_key', 'sk-or-v1-test');
      expect(aiRouter.hasAnyKey()).toBe(true);
    });

    it('hasAnyKey true si clé Groq', () => {
      localStorage.setItem('ax_groq_key', 'gsk_test');
      expect(aiRouter.hasAnyKey()).toBe(true);
    });

    it('hasAnyKey true si clé Gemini (Google AI)', () => {
      localStorage.setItem('ax_google_key', 'AIzaTest');
      expect(aiRouter.hasAnyKey()).toBe(true);
    });

    it('getApiKey retourne string vide si non configuré', () => {
      expect(aiRouter.getApiKey('anthropic')).toBe('');
    });

    it('getApiKey retourne valeur stockée', () => {
      localStorage.setItem('ax_anthropic_key', 'sk-ant-test');
      expect(aiRouter.getApiKey('anthropic')).toBe('sk-ant-test');
    });
  });

  describe('abort', () => {
    it('abort sans stream actif ne throw pas', () => {
      expect(() => aiRouter.abort()).not.toThrow();
    });
  });

  describe('stream sans clé API', () => {
    it('appelle onError si aucune clé configurée', async () => {
      const errors: Error[] = [];
      await aiRouter.stream(
        [{ role: 'user', content: 'test' }],
        'system prompt',
        () => { /* noop */ },
        (err) => errors.push(err),
      );
      expect(errors.length).toBe(1);
      expect(errors[0]?.message).toContain('clé');
    });
  });
});
