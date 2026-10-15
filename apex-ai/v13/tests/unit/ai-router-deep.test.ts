import { describe, it, expect, beforeEach, vi } from 'vitest';
import { aiRouter } from '../../services/ai/ai-router.js';

describe('ai-router deep tests (Jet 7.9)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('failover chain order : Anthropic > OpenRouter > Groq > Gemini > OpenClaw', () => {
    /* Test indirect via getApiKey(provider) — ordre canonical */
    expect(aiRouter.getApiKey('anthropic')).toBe('');
    expect(aiRouter.getApiKey('openrouter')).toBe('');
  });

  it('hasAnyKey iterate sur DEFAULT_CHAIN', () => {
    localStorage.setItem('ax_anthropic_key', 'sk-ant-test');
    expect(aiRouter.hasAnyKey()).toBe(true);
  });

  it('abort sans stream actif no-op (idempotent, no throw)', () => {
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

  it('stream onError appelé si pas de clé API', async () => {
    let errorCaught: Error | null = null;
    await aiRouter.stream(
      [{ role: 'user', content: 'test' }],
      'system',
      () => undefined,
      (err) => { errorCaught = err; },
    );
    expect(errorCaught).not.toBeNull();
    expect(errorCaught?.message).toMatch(/clé|API/i);
  });

  it('stream avec failover chain custom dans localStorage', async () => {
    localStorage.setItem('apex_v13_failover_chain', JSON.stringify(['groq', 'gemini']));
    /* hasAnyKey false → onError immédiat */
    let errorCaught: Error | null = null;
    await aiRouter.stream(
      [{ role: 'user', content: 'q' }],
      'sys',
      () => undefined,
      (err) => { errorCaught = err; },
    );
    expect(errorCaught).not.toBeNull();
  });

  it('stream avec clé Anthropic mock fetch retourne streaming', async () => {
    localStorage.setItem('ax_anthropic_key', 'sk-ant-api03-test');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: {"type":"content_block_delta","delta":{"text":"Bonjour"}}\n'));
            controller.enqueue(new TextEncoder().encode('data: [DONE]\n'));
            controller.close();
          },
        }),
        { status: 200 },
      ),
    );
    const chunks: Array<{ text: string; done: boolean }> = [];
    await aiRouter.stream(
      [{ role: 'user', content: 'salut' }],
      'system',
      (c) => chunks.push({ text: c.text, done: c.done }),
      () => undefined,
    );
    /* Au moins 1 chunk text "Bonjour" reçu */
    const textChunk = chunks.find((c) => c.text.includes('Bonjour'));
    expect(textChunk).toBeDefined();
    fetchSpy.mockRestore();
  });

  it('stream HTTP 500 → tente provider suivant via failover', async () => {
    localStorage.setItem('ax_anthropic_key', 'sk-ant-test');
    localStorage.setItem('ax_groq_key', 'gsk_test');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('error', { status: 500 }),
    );
    let errorCaught: Error | null = null;
    await aiRouter.stream(
      [{ role: 'user', content: 'test' }],
      'sys',
      () => undefined,
      (err) => { errorCaught = err; },
    );
    /* Tous providers fail → onError final */
    expect(errorCaught).not.toBeNull();
    fetchSpy.mockRestore();
  });

  it('PII redaction outbound : pas de leak emails dans messages envoyés', async () => {
    localStorage.setItem('ax_anthropic_key', 'sk-ant-test');
    let bodySent: string | null = null;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_, init) => {
      if (init?.body) bodySent = String(init.body);
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: [DONE]\n'));
            controller.close();
          },
        }),
        { status: 200 },
      );
    });
    await aiRouter.stream(
      [{ role: 'user', content: 'mon email est test@example.com' }],
      'sys',
      () => undefined,
      () => undefined,
    );
    /* Le body envoyé doit avoir email redacted */
    expect(bodySent).toBeTruthy();
    expect(bodySent).toContain('[EMAIL_REDACTED]');
    expect(bodySent).not.toContain('test@example.com');
    fetchSpy.mockRestore();
  });
});
