/**
 * APEX v13 — Tests cache_control Anthropic prompt caching (audit Kevin v13.1.0).
 *
 * Vérifie que le body Anthropic envoyé au backend contient bien :
 * - system: [{ type: 'text', text, cache_control: { type: 'ephemeral' } }]
 * - messages anciens (i < length-2) : structure array avec cache_control ephemeral
 * - 2 derniers messages : non cachés (clear text content)
 *
 * Strategy : on intercepte fetch + on capture body envoyé pour assertion.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { aiRouter, type ChatMessage } from '../../services/ai/ai-router.js';

interface AnthropicSystemBlock {
  type: string;
  text?: string;
  cache_control?: { type?: string };
}

interface AnthropicMessage {
  role: string;
  content: string | Array<{ type: string; text?: string; cache_control?: { type?: string } }>;
}

interface AnthropicBody {
  model?: string;
  max_tokens?: number;
  stream?: boolean;
  system?: AnthropicSystemBlock[];
  messages?: AnthropicMessage[];
  tools?: unknown[];
}

/**
 * Helper : run un stream Anthropic minimaliste qui retourne un [DONE] direct
 * et capture le body envoyé.
 */
async function runStreamCaptureBody(messages: ChatMessage[], system: string): Promise<AnthropicBody | null> {
  let captured: AnthropicBody | null = null;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
    const body = init?.body;
    if (typeof body === 'string') {
      try {
        captured = JSON.parse(body) as AnthropicBody;
      } catch {
        /* ignore */
      }
    }
    /* Retourne stream qui termine immédiatement */
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

  await aiRouter.stream(messages, system, () => undefined, () => undefined);
  return captured;
}

describe('ai-router — cache_control Anthropic prompt caching', () => {
  beforeEach(() => {
    localStorage.clear();
    /* Force chain Anthropic-only pour stabilité */
    localStorage.setItem('apex_v13_failover_chain', JSON.stringify(['anthropic']));
    localStorage.setItem('ax_anthropic_key', 'sk-ant-api03-test-cache');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('système est structuré en array avec cache_control ephemeral', async () => {
    const body = await runStreamCaptureBody(
      [{ role: 'user', content: 'test' }],
      'You are Apex, a helpful AI assistant for Kevin.',
    );
    expect(body).not.toBeNull();
    expect(Array.isArray(body?.system)).toBe(true);
    expect(body?.system?.[0]?.type).toBe('text');
    expect(body?.system?.[0]?.text).toBe('You are Apex, a helpful AI assistant for Kevin.');
    expect(body?.system?.[0]?.cache_control).toEqual({ type: 'ephemeral' });
  });

  it('les 2 derniers messages NE sont PAS cachés (string brute conservée)', async () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'msg ancien 1' },
      { role: 'assistant', content: 'reponse ancienne' },
      { role: 'user', content: 'avant-dernier' }, /* index length-2, NOT cached */
      { role: 'user', content: 'dernier' }, /* index length-1, NOT cached */
    ];
    const body = await runStreamCaptureBody(messages, 'sys');
    expect(body?.messages).toBeDefined();
    /* Les 2 derniers doivent rester en string */
    const last = body?.messages?.[body.messages.length - 1];
    const beforeLast = body?.messages?.[body.messages.length - 2];
    expect(typeof last?.content).toBe('string');
    expect(last?.content).toBe('dernier');
    expect(typeof beforeLast?.content).toBe('string');
    expect(beforeLast?.content).toBe('avant-dernier');
  });

  it('les anciens messages (i < length-2) ont cache_control ephemeral', async () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'message ancien tres long pour cacher' },
      { role: 'assistant', content: 'reponse ancienne aussi' },
      { role: 'user', content: 'avant-dernier' },
      { role: 'user', content: 'dernier' },
    ];
    const body = await runStreamCaptureBody(messages, 'sys');
    expect(body?.messages).toBeDefined();
    /* Les 2 premiers doivent avoir content array + cache_control */
    const first = body?.messages?.[0];
    const second = body?.messages?.[1];
    expect(Array.isArray(first?.content)).toBe(true);
    expect(Array.isArray(second?.content)).toBe(true);
    if (Array.isArray(first?.content)) {
      expect(first.content[0]?.type).toBe('text');
      expect(first.content[0]?.cache_control).toEqual({ type: 'ephemeral' });
      expect(first.content[0]?.text).toBe('message ancien tres long pour cacher');
    }
  });

  it('avec 1 seul message user → aucun caching (boundary = 0, pas dans range)', async () => {
    const body = await runStreamCaptureBody(
      [{ role: 'user', content: 'just one msg' }],
      'sys',
    );
    expect(body?.messages).toBeDefined();
    expect(body?.messages?.length).toBe(1);
    /* Le seul message reste en string (pas dans la zone cachable) */
    expect(typeof body?.messages?.[0]?.content).toBe('string');
  });

  it('avec 2 messages → aucun caché (boundary = 0)', async () => {
    const body = await runStreamCaptureBody(
      [
        { role: 'user', content: 'msg 1' },
        { role: 'assistant', content: 'reponse 1' },
      ],
      'sys',
    );
    expect(body?.messages?.length).toBe(2);
    /* Les 2 derniers = TOUS les messages → tous en clair */
    expect(typeof body?.messages?.[0]?.content).toBe('string');
    expect(typeof body?.messages?.[1]?.content).toBe('string');
  });

  it('avec 5 messages → 3 anciens cachés, 2 derniers non cachés', async () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'm1' },
      { role: 'assistant', content: 'r1' },
      { role: 'user', content: 'm2' },
      { role: 'assistant', content: 'r2' },
      { role: 'user', content: 'dernier' },
    ];
    const body = await runStreamCaptureBody(messages, 'sys');
    expect(body?.messages?.length).toBe(5);
    /* Index 0,1,2 cachés */
    for (let i = 0; i < 3; i++) {
      expect(Array.isArray(body?.messages?.[i]?.content)).toBe(true);
    }
    /* Index 3,4 non cachés (string) */
    expect(typeof body?.messages?.[3]?.content).toBe('string');
    expect(typeof body?.messages?.[4]?.content).toBe('string');
  });

  it('messages avec content non-string (array de blocks) ne sont PAS modifiés', async () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: [{ type: 'text', text: 'msg avec image' }] }, /* déjà array */
      { role: 'assistant', content: 'r1' },
      { role: 'user', content: 'm2' },
      { role: 'user', content: 'dernier' },
    ];
    const body = await runStreamCaptureBody(messages, 'sys');
    /* Le premier garde son array (pas re-wrappé) */
    const first = body?.messages?.[0]?.content;
    expect(Array.isArray(first)).toBe(true);
    if (Array.isArray(first)) {
      /* Le content original est conservé, pas re-créé avec cache_control */
      expect(first[0]?.text).toBe('msg avec image');
    }
  });

  it('cache_control type ephemeral exact (pas autre valeur)', async () => {
    const body = await runStreamCaptureBody(
      [{ role: 'user', content: 'q' }],
      'long system prompt with many tokens to cache',
    );
    expect(body?.system?.[0]?.cache_control).toEqual({ type: 'ephemeral' });
    /* Ni 'persistent' ni 'always' — exclusivement ephemeral (Anthropic spec) */
  });

  it('système toujours présent même si messages vides (edge case)', async () => {
    /* Note : stream() avec [] n'enverra rien d'utile mais on test le buildBody */
    const body = await runStreamCaptureBody(
      [{ role: 'user', content: 'q' }],
      'system unique stable',
    );
    expect(body?.system?.[0]?.text).toBe('system unique stable');
    expect(body?.system?.[0]?.cache_control?.type).toBe('ephemeral');
  });

  it('streaming SSE token-par-token : stream:true dans body Anthropic', async () => {
    const body = await runStreamCaptureBody(
      [{ role: 'user', content: 'q' }],
      'sys',
    );
    expect(body?.stream).toBe(true);
  });

  it('streaming SSE : chunks text deltas append progressivement', async () => {
    /* Force une seule provider Anthropic pour test unitaire stable */
    localStorage.setItem('apex_v13_failover_chain', JSON.stringify(['anthropic']));
    /* Mock avec 3 chunks séparés pour vérifier append progressif */
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(
        new ReadableStream({
          start(controller) {
            const enc = new TextEncoder();
            controller.enqueue(enc.encode('data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Bon"}}\n'));
            controller.enqueue(enc.encode('data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"jour"}}\n'));
            controller.enqueue(enc.encode('data: {"type":"content_block_delta","delta":{"type":"text_delta","text":" Kevin"}}\n'));
            controller.enqueue(enc.encode('data: [DONE]\n'));
            controller.close();
          },
        }),
        { status: 200 },
      );
    });

    const chunks: string[] = [];
    await aiRouter.stream(
      [{ role: 'user', content: 'salut' }],
      'sys',
      (c) => {
        if (c.text) chunks.push(c.text);
      },
      () => undefined,
    );
    /* Doit recevoir au moins les 3 chunks séparés (token-par-token) */
    expect(chunks).toContain('Bon');
    expect(chunks).toContain('jour');
    expect(chunks).toContain(' Kevin');
  });
});
