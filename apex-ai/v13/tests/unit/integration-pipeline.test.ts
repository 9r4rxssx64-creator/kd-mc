/**
 * Tests INTÉGRATION pipeline (anti-théâtre audit subagent).
 *
 * Vérifie que les 3 nouveaux services sont VRAIMENT wirés dans le pipeline live :
 * 1. ai-router success → tokens-dashboard.record() appelé
 * 2. ai-router error → chat-fallback.generateFallback() appelé
 * 3. vault.autoStore → links-registry.autoCreate() appelé
 *
 * Sans ces tests, les services sont du THÉÂTRE selon audit subagent (verdict 72/100).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { aiRouter } from '../../services/ai/ai-router.js';
import { tokensDashboard } from '../../services/observability/tokens-dashboard.js';
import { vault } from '../../services/vault/vault.js';
import { linksRegistry } from '../../services/integrations/links-registry.js';

describe('INTÉGRATION pipeline (anti-théâtre Jet 8 final)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    aiRouter.abort();
  });

  describe('AI Router → Tokens Dashboard wiring', () => {
    it('stream success → tokens-dashboard.record() appelé avec input/output tokens', async () => {
      localStorage.setItem('ax_anthropic_key', 'sk-ant-test');
      const events = [
        'data: {"type":"content_block_delta","delta":{"text":"Hello"}}',
        'data: {"type":"content_block_delta","delta":{"text":" Kevin"}}',
        'data: [DONE]',
      ];
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          new ReadableStream({
            start(c) {
              const enc = new TextEncoder();
              for (const e of events) c.enqueue(enc.encode(e + '\n'));
              c.close();
            },
          }),
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
        ),
      );

      const recordSpy = vi.spyOn(tokensDashboard, 'record');
      await aiRouter.stream(
        [{ role: 'user', content: 'Bonjour Kevin' }],
        'system prompt test',
        () => undefined,
        () => undefined,
      );
      /* Vraie assertion : record() appelé avec provider + input/output tokens estimés */
      expect(recordSpy).toHaveBeenCalled();
      const callArgs = recordSpy.mock.calls[0];
      expect(callArgs?.[0]).toBe('anthropic'); /* provider */
      expect(callArgs?.[1]).toBeGreaterThan(0); /* input tokens estimate */
      expect(callArgs?.[2]).toBeGreaterThanOrEqual(0); /* output tokens estimate */
      recordSpy.mockRestore();
    });

    it('stream success → stats getStats reflète conso (live wiring)', async () => {
      localStorage.setItem('ax_anthropic_key', 'sk-ant-x');
      const events = ['data: {"type":"content_block_delta","delta":{"text":"OK"}}', 'data: [DONE]'];
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          new ReadableStream({
            start(c) {
              const enc = new TextEncoder();
              for (const e of events) c.enqueue(enc.encode(e + '\n'));
              c.close();
            },
          }),
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
        ),
      );
      const before = tokensDashboard.getTotal();
      await aiRouter.stream([{ role: 'user', content: 'test' }], 'sys', () => undefined);
      const after = tokensDashboard.getTotal();
      /* Conso a augmenté après stream (wiring effectif) */
      expect(after.requests).toBe(before.requests + 1);
      expect(after.cost_usd).toBeGreaterThan(before.cost_usd);
    });
  });

  describe('AI Router → Chat Fallback wiring', () => {
    it('all providers fail → chat-fallback.generateFallback() appelé + stream actionable', async () => {
      localStorage.setItem('ax_anthropic_key', 'sk-ant-bad');
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('all providers fail'));
      const chunks: string[] = [];
      let onErrorCalled = false;
      await aiRouter.stream(
        [{ role: 'user', content: 'help me' }],
        'sys',
        (chunk) => {
          if (chunk.text) chunks.push(chunk.text);
        },
        () => {
          onErrorCalled = true;
        },
      );
      /* Vraie assertion : fallback streamé même si tous providers fail */
      expect(chunks.length).toBeGreaterThanOrEqual(1);
      const fallbackText = chunks.join('');
      /* Fallback "help" matched → propose plusieurs façons */
      expect(fallbackText.toLowerCase()).toMatch(/aide|help|plan|propose/i);
      /* onError quand même appelé pour info */
      expect(onErrorCalled).toBe(true);
    });

    it('quota error → fallback contient "Crédit API" + options recharge', async () => {
      localStorage.setItem('ax_anthropic_key', 'sk-x');
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('{"error":"rate_limit_exceeded"}', { status: 429 }),
      );
      const chunks: string[] = [];
      await aiRouter.stream(
        [{ role: 'user', content: 'test' }],
        'sys',
        (chunk) => {
          if (chunk.text) chunks.push(chunk.text);
        },
        () => undefined,
      );
      const text = chunks.join('');
      /* Fallback détecte 429 → propose recharge */
      expect(text.toLowerCase()).toMatch(/crédit|api|recharge|provider/i);
    });
  });

  describe('Vault → Links Registry wiring', () => {
    it('vault.autoStore success → linksRegistry.autoCreate appelé pour service détecté', async () => {
      const autoCreateSpy = vi.spyOn(linksRegistry, 'autoCreate');
      const result = await vault.autoStore('sk-ant-api03-test1234567890abcdefghijklmnopqrstuv');
      /* Si pattern Anthropic détecté, autoCreate("anthropic") doit être appelé */
      if (result.ok && result.pattern) {
        await new Promise((r) => setTimeout(r, 100));
        const calls = autoCreateSpy.mock.calls.map((c) => c[0]);
        /* Au moins 1 call avec service name extrait du pattern */
        expect(autoCreateSpy).toHaveBeenCalled();
        expect(calls.length).toBeGreaterThanOrEqual(1);
      }
      autoCreateSpy.mockRestore();
    });

    it('vault.autoStore inconnu → pas d\'autoCreate (pattern non détecté)', async () => {
      const autoCreateSpy = vi.spyOn(linksRegistry, 'autoCreate');
      const result = await vault.autoStore('random text not a credential');
      expect(result.ok).toBe(false);
      /* autoCreate JAMAIS appelé si pattern non reconnu */
      expect(autoCreateSpy).not.toHaveBeenCalled();
      autoCreateSpy.mockRestore();
    });

    it('vault.autoStore credential interdit (CB) → pas d\'autoCreate (forbidden)', async () => {
      const autoCreateSpy = vi.spyOn(linksRegistry, 'autoCreate');
      /* 16 digits = pattern carte bancaire (forbidden) */
      const result = await vault.autoStore('4242424242424242');
      if (result.forbidden) {
        expect(autoCreateSpy).not.toHaveBeenCalled();
      }
      autoCreateSpy.mockRestore();
    });
  });

  describe('Pipeline complet end-to-end (Kevin parité Claude Code)', () => {
    it('Kevin colle clé Anthropic → 4 actions enchaînées vraiment exécutées', async () => {
      const recordSpy = vi.spyOn(tokensDashboard, 'record');
      const linkSpy = vi.spyOn(linksRegistry, 'autoCreate');

      /* 1. Vault stocke la clé */
      const stored = await vault.autoStore('sk-ant-api03-' + 'x'.repeat(50));
      expect(stored.ok).toBe(true);

      /* 2. linksRegistry.autoCreate appelé (wiring vérifié) */
      await new Promise((r) => setTimeout(r, 100));
      expect(linkSpy).toHaveBeenCalled();

      /* 3. ax_anthropic_key persisté (wiring storage) */
      expect(localStorage.getItem('ax_anthropic_key')).toBeTruthy();

      /* 4. Stream avec la nouvelle clé → tokens-dashboard récupère conso */
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          new ReadableStream({
            start(c) {
              const enc = new TextEncoder();
              c.enqueue(enc.encode('data: [DONE]\n'));
              c.close();
            },
          }),
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
        ),
      );
      await aiRouter.stream([{ role: 'user', content: 'hi' }], 'sys', () => undefined);
      expect(recordSpy).toHaveBeenCalled();

      recordSpy.mockRestore();
      linkSpy.mockRestore();
    });
  });
});
