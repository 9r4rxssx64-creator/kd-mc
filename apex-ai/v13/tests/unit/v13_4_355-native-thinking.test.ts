/**
 * APEX v13.4.355 — Raisonnement NATIF Anthropic (extended thinking), OPT-IN.
 *
 * Vérifie, via l'API publique aiRouter.stream() (intercept fetch — même pattern que
 * ai-router-cache-control.test.ts) :
 *  - buildBody : le param `thinking` n'apparaît QUE si flag `apex_v13_native_thinking`
 *    ON ET effort='high' ; sinon body INCHANGÉ (zéro régression par défaut).
 *  - buildBody : garantit max_tokens > budget_tokens (contrainte Anthropic).
 *  - parseSSE : `thinking_delta` → chunk type 'thinking' (séparé du texte, PAS concaténé) ;
 *    `signature_delta` ignoré ; `text_delta` inchangé.
 *  - flag getter isNativeThinkingEnabled / setNativeThinkingEnabled.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { aiRouter, type ChatMessage, type StreamChunk } from '../../services/ai/ai-router.js';
import {
  isNativeThinkingEnabled,
  setNativeThinkingEnabled,
  setReasoningEffort,
  NATIVE_THINKING_BUDGET_TOKENS,
} from '../../services/ai/reasoning-mode.js';

interface AnthropicBody {
  model?: string;
  max_tokens?: number;
  thinking?: { type?: string; budget_tokens?: number };
}

/** Intercepte fetch, capture le body Anthropic, joue un flux SSE optionnel. */
async function runStream(
  messages: ChatMessage[],
  system: string,
  sse: string[] = ['data: [DONE]\n'],
): Promise<{ body: AnthropicBody | null; chunks: StreamChunk[] }> {
  let body: AnthropicBody | null = null;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
    const b = init?.body;
    if (typeof b === 'string') {
      try { body = JSON.parse(b) as AnthropicBody; } catch { /* ignore */ }
    }
    return new Response(
      new ReadableStream({
        start(controller) {
          const enc = new TextEncoder();
          for (const line of sse) controller.enqueue(enc.encode(line));
          controller.close();
        },
      }),
      { status: 200 },
    );
  });
  const chunks: StreamChunk[] = [];
  await aiRouter.stream(messages, system, (c) => chunks.push(c), () => undefined);
  return { body, chunks };
}

describe('v13.4.355 — raisonnement natif Anthropic (opt-in)', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('apex_v13_failover_chain', JSON.stringify(['anthropic']));
    localStorage.setItem('ax_anthropic_key', 'sk-ant-api03-test-thinking');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  /* ---- flag getter ---- */
  it('isNativeThinkingEnabled : OFF par défaut, ON après set', () => {
    expect(isNativeThinkingEnabled()).toBe(false);
    setNativeThinkingEnabled(true);
    expect(isNativeThinkingEnabled()).toBe(true);
    setNativeThinkingEnabled(false);
    expect(isNativeThinkingEnabled()).toBe(false);
  });

  /* ---- buildBody : thinking gated ---- */
  it('body SANS thinking par défaut (flag OFF)', async () => {
    setReasoningEffort('high'); /* effort high mais flag off → PAS de thinking */
    const { body } = await runStream([{ role: 'user', content: 'q' }], 'sys');
    expect(body).not.toBeNull();
    expect(body?.thinking).toBeUndefined();
  });

  it('body SANS thinking si flag ON mais effort ≠ high', async () => {
    setNativeThinkingEnabled(true);
    setReasoningEffort('medium');
    const { body } = await runStream([{ role: 'user', content: 'q' }], 'sys');
    expect(body?.thinking).toBeUndefined();
  });

  it('body AVEC thinking si flag ON + effort high', async () => {
    setNativeThinkingEnabled(true);
    setReasoningEffort('high');
    const { body } = await runStream([{ role: 'user', content: 'q' }], 'sys');
    expect(body?.thinking).toEqual({ type: 'enabled', budget_tokens: NATIVE_THINKING_BUDGET_TOKENS });
    /* Contrainte Anthropic : max_tokens DOIT rester > budget_tokens */
    expect(typeof body?.max_tokens).toBe('number');
    expect(body!.max_tokens!).toBeGreaterThan(NATIVE_THINKING_BUDGET_TOKENS);
  });

  it('thinking ON n\'altère PAS model ni stream (additif)', async () => {
    setNativeThinkingEnabled(true);
    setReasoningEffort('high');
    const { body } = await runStream([{ role: 'user', content: 'q' }], 'sys');
    expect(body?.model).toBe('claude-sonnet-4-6');
  });

  /* ---- parseSSE : thinking_delta ---- */
  it('thinking_delta → chunk type:"thinking" (séparé du texte, non concaténé)', async () => {
    setNativeThinkingEnabled(true);
    setReasoningEffort('high');
    const { chunks } = await runStream(
      [{ role: 'user', content: 'q' }],
      'sys',
      [
        'data: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":""}}\n',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"Je réfléchis"}}\n',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"signature_delta","signature":"abc"}}\n',
        'data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"Réponse"}}\n',
        'data: [DONE]\n',
      ],
    );
    const thinking = chunks.filter((c) => c.type === 'thinking').map((c) => c.text).join('');
    const text = chunks.filter((c) => c.type === 'text').map((c) => c.text).join('');
    expect(thinking).toContain('Je réfléchis');
    expect(text).toBe('Réponse');
    /* La réflexion ne fuit PAS dans le texte de réponse. */
    expect(text).not.toContain('Je réfléchis');
    /* signature_delta n'émet aucun chunk. */
    expect(chunks.some((c) => c.text === 'abc')).toBe(false);
  });

  it('text_delta seul (flux normal) : aucun chunk thinking (parseSSE inchangé)', async () => {
    const { chunks } = await runStream(
      [{ role: 'user', content: 'q' }],
      'sys',
      [
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Bonjour"}}\n',
        'data: [DONE]\n',
      ],
    );
    expect(chunks.some((c) => c.type === 'thinking')).toBe(false);
    expect(chunks.filter((c) => c.type === 'text').map((c) => c.text).join('')).toBe('Bonjour');
  });
});
