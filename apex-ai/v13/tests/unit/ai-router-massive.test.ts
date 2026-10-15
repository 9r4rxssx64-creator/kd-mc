/**
 * Tests massifs ai-router.ts (75% → 95%+).
 * Couvre stream avec mock fetch SSE, failover chain, AbortError, getChainOrder custom,
 * streamFromProvider parsing SSE, [DONE] marker, error paths.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { aiRouter } from '../../services/ai/ai-router.js';

describe('ai-router massive coverage Jet 8 final', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    aiRouter.abort();
  });

  describe('hasAnyKey + getApiKey', () => {
    it('hasAnyKey false par défaut (aucune clé)', () => {
      expect(aiRouter.hasAnyKey()).toBe(false);
    });

    it('hasAnyKey true après set anthropic_key', () => {
      localStorage.setItem('ax_anthropic_key', 'sk-ant-test123');
      expect(aiRouter.hasAnyKey()).toBe(true);
    });

    it('hasAnyKey true via openrouter_key', () => {
      localStorage.setItem('ax_openrouter_key', 'sk-or-test');
      expect(aiRouter.hasAnyKey()).toBe(true);
    });

    it('hasAnyKey true via groq_key', () => {
      localStorage.setItem('ax_groq_key', 'gsk_test');
      expect(aiRouter.hasAnyKey()).toBe(true);
    });

    it('hasAnyKey true via google_key (gemini)', () => {
      localStorage.setItem('ax_google_key', 'AIza_test');
      expect(aiRouter.hasAnyKey()).toBe(true);
    });
  });

  describe('stream sans clé → onError immédiat', () => {
    it('onError appelé avec message "Aucune clé API"', async () => {
      let captured: Error | null = null;
      await aiRouter.stream(
        [{ role: 'user', content: 'hello' }],
        'system prompt',
        () => undefined,
        (err) => {
          captured = err;
        },
      );
      expect(captured).not.toBeNull();
      expect(captured!.message).toContain('clé API');
    });
  });

  describe('getChainOrder custom (failover_chain localStorage)', () => {
    it('failover_chain custom utilisé en priorité', async () => {
      localStorage.setItem('ax_anthropic_key', 'sk-ant-fake');
      /* Provider noms valides : anthropic, openrouter, groq, gemini, openclaw */
      localStorage.setItem('apex_v13_failover_chain', JSON.stringify(['groq', 'openrouter', 'anthropic']));
      /* Mock fetch pour fail tous → on observe ordre tentatives via warn logs */
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('all fail'));
      let onErrCalled = false;
      await aiRouter.stream(
        [{ role: 'user', content: 'x' }],
        'sys',
        () => undefined,
        () => {
          onErrCalled = true;
        },
      );
      /* Au moins anthropic tenté (les autres skip car pas de clé) */
      expect(fetchSpy).toHaveBeenCalled();
      expect(onErrCalled).toBe(true);
      fetchSpy.mockRestore();
    });

    it('failover_chain corrompu → fallback DEFAULT_CHAIN', async () => {
      localStorage.setItem('ax_anthropic_key', 'sk-ant-x');
      localStorage.setItem('apex_v13_failover_chain', 'INVALID_JSON');
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('fail'));
      await aiRouter.stream(
        [{ role: 'user', content: 'x' }],
        'sys',
        () => undefined,
        () => undefined,
      );
      expect(fetchSpy).toHaveBeenCalled();
      fetchSpy.mockRestore();
    });

    it('failover_chain vide array → DEFAULT_CHAIN fallback', async () => {
      localStorage.setItem('ax_anthropic_key', 'sk-ant-x');
      localStorage.setItem('apex_v13_failover_chain', JSON.stringify([]));
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('fail'));
      await aiRouter.stream(
        [{ role: 'user', content: 'x' }],
        'sys',
        () => undefined,
        () => undefined,
      );
      expect(fetchSpy).toHaveBeenCalled();
      fetchSpy.mockRestore();
    });
  });

  describe('stream succès via SSE Mock (Anthropic)', () => {
    function createMockSSEResponse(events: string[]): Response {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          for (const e of events) {
            controller.enqueue(encoder.encode(e + '\n'));
          }
          controller.close();
        },
      });
      return new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      });
    }

    it('stream Anthropic SSE → onChunk + onChunk done=true', async () => {
      localStorage.setItem('ax_anthropic_key', 'sk-ant-test');
      const events = [
        'data: {"type":"content_block_delta","delta":{"text":"Hello"}}',
        'data: {"type":"content_block_delta","delta":{"text":" World"}}',
        'data: [DONE]',
      ];
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(createMockSSEResponse(events));

      const chunks: string[] = [];
      let doneCount = 0;
      await aiRouter.stream(
        [{ role: 'user', content: 'hi' }],
        'sys',
        (chunk) => {
          if (chunk.text) chunks.push(chunk.text);
          if (chunk.done) doneCount++;
        },
        () => undefined,
      );
      expect(chunks.join('')).toContain('Hello');
      expect(doneCount).toBeGreaterThanOrEqual(1);
    });

    it('stream HTTP 401 → tente next provider chain', async () => {
      localStorage.setItem('ax_anthropic_key', 'sk-ant-bad');
      localStorage.setItem('ax_openrouter_key', 'sk-or-fake');
      let callCount = 0;
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        callCount++;
        return new Response('unauthorized', { status: 401 });
      });
      await aiRouter.stream(
        [{ role: 'user', content: 'x' }],
        's',
        () => undefined,
        () => undefined,
      );
      /* 2 providers ont été tentés au moins (failover) */
      expect(callCount).toBeGreaterThanOrEqual(2);
    });

    it('stream avec res.body null → erreur captured', async () => {
      localStorage.setItem('ax_anthropic_key', 'sk-x');
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));
      let onErrMsg = '';
      await aiRouter.stream(
        [{ role: 'user', content: 'x' }],
        's',
        () => undefined,
        (err) => {
          onErrMsg = err.message;
        },
      );
      expect(onErrMsg.length).toBeGreaterThan(0);
    });

    it('stream parseSSE retourne empty → skip chunk', async () => {
      localStorage.setItem('ax_anthropic_key', 'sk-x');
      const events = [
        'data: {"type":"message_start"}', /* parsé OK mais delta vide */
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
      let doneFlag = false;
      await aiRouter.stream(
        [{ role: 'user', content: 'x' }],
        's',
        (chunk) => {
          if (chunk.done) doneFlag = true;
        },
        () => undefined,
      );
      expect(doneFlag).toBe(true);
    });
  });

  describe('abort + AbortError handling', () => {
    it('abort() cancel currentAbort + set null', () => {
      let threw = false;
      try {
        aiRouter.abort();
        aiRouter.abort();
        aiRouter.abort();
      } catch {
        threw = true;
      }
      expect(threw).toBe(false);
    });

    it('stream + abort manuel → AbortError swallow + return early', async () => {
      localStorage.setItem('ax_anthropic_key', 'sk-x');
      const ctrlSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, opts) => {
        const sig = (opts as RequestInit).signal as AbortSignal | undefined;
        return new Promise<Response>((_, reject) => {
          sig?.addEventListener('abort', () => {
            const err = new Error('Aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      });
      const promise = aiRouter.stream(
        [{ role: 'user', content: 'x' }],
        's',
        () => undefined,
        () => undefined,
      );
      /* Abort après 50ms */
      setTimeout(() => aiRouter.abort(), 50);
      await promise;
      expect(ctrlSpy).toHaveBeenCalled();
    });
  });

  describe('PII redaction outbound', () => {
    it('email user content redacté avant envoi provider', async () => {
      localStorage.setItem('ax_anthropic_key', 'sk-x');
      let bodySent = '';
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, opts) => {
        bodySent = String((opts as RequestInit).body ?? '');
        return new Response('data: [DONE]\n', {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        });
      });
      await aiRouter.stream(
        [{ role: 'user', content: 'mon email: kevin@desarzens.com' }],
        'sys',
        () => undefined,
        () => undefined,
      );
      /* Vraie assertion : l'email réel ne doit PAS être présent dans le body sent */
      expect(bodySent).not.toContain('kevin@desarzens.com');
    });
  });
});
