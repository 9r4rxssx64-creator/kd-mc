/**
 * Tests P1.2 (audit cascade v13.3.81) — Hallucination cross-check.
 *
 * 4 cas couverts :
 * 1. Convergence (responses similaires) → confidence haute, pas warning
 * 2. Divergence forte → warning + divergence array peuplé
 * 3. Tous providers fail → confidence neutre 0.5, divergence note
 * 4. Cache hit (2e appel même question = pas de stream)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { hallucinationCrossCheck } from '../../services/ai/hallucination-cross-check.js';
import type { Provider, StreamChunk, ChatMessage } from '../../services/ai/ai-router.js';

type StreamFn = (
  messages: ChatMessage[],
  system: string,
  onChunk: (chunk: StreamChunk) => void,
  onError?: (err: Error) => void,
) => Promise<void>;

vi.mock('../../services/ai/ai-router.js', async () => {
  const actual = await vi.importActual<typeof import('../../services/ai/ai-router.js')>(
    '../../services/ai/ai-router.js',
  );
  return {
    ...actual,
    aiRouter: {
      stream: vi.fn() as unknown as StreamFn,
    },
  };
});

import { aiRouter } from '../../services/ai/ai-router.js';

describe('hallucination-cross-check', () => {
  beforeEach(() => {
    hallucinationCrossCheck.clearCache();
    vi.clearAllMocks();
  });

  it('convergence : confidence haute, pas warning', async () => {
    const mockedStream = aiRouter.stream as unknown as ReturnType<typeof vi.fn>;
    mockedStream.mockImplementation(
      ((_msgs, _sys, onChunk: (c: StreamChunk) => void) => {
        onChunk({ text: 'Paris est la capitale de la France.', done: false, provider: 'openai' });
        onChunk({ text: '', done: true, provider: 'openai' });
        return Promise.resolve();
      }) as unknown as StreamFn,
    );

    const result = await hallucinationCrossCheck.crossCheck(
      'Quelle est la capitale de la France ?',
      'Paris est la capitale de la France',
      ['openai', 'groq'],
    );
    expect(result.confidence).toBeGreaterThan(0.6);
    expect(result.warning).toBeUndefined();
  });

  it('divergence forte : warning + divergence peuplé', async () => {
    const mockedStream = aiRouter.stream as unknown as ReturnType<typeof vi.fn>;
    mockedStream.mockImplementation(
      ((_msgs, _sys, onChunk: (c: StreamChunk) => void) => {
        onChunk({
          text: 'Berlin est la capitale dauphine du chocolat sushi pendant cinq mille ans.',
          done: false,
          provider: 'openai',
        });
        onChunk({ text: '', done: true, provider: 'openai' });
        return Promise.resolve();
      }) as unknown as StreamFn,
    );

    const result = await hallucinationCrossCheck.crossCheck(
      'Quelle est la capitale de la France ?',
      'Paris est la capitale de la France',
      ['openai'],
    );
    expect(result.divergence.length).toBeGreaterThan(0);
    expect(result.warning).toBeDefined();
    expect(result.warning).toContain('divergentes');
  });

  it('tous providers fail : confidence 0.5 neutre', async () => {
    const mockedStream = aiRouter.stream as unknown as ReturnType<typeof vi.fn>;
    mockedStream.mockImplementation(
      ((_msgs, _sys, _onChunk: (c: StreamChunk) => void, onError?: (err: Error) => void) => {
        if (onError) onError(new Error('HTTP 500'));
        return Promise.reject(new Error('HTTP 500'));
      }) as unknown as StreamFn,
    );

    const result = await hallucinationCrossCheck.crossCheck(
      'Test fail',
      'Réponse primaire',
      ['openai', 'groq'],
    );
    expect(result.confidence).toBe(0.5);
    expect(result.divergence[0]).toContain('Aucun provider');
  });

  it('cache hit : 2e appel ne re-stream pas', async () => {
    const mockedStream = aiRouter.stream as unknown as ReturnType<typeof vi.fn>;
    let callCount = 0;
    mockedStream.mockImplementation(
      ((_msgs, _sys, onChunk: (c: StreamChunk) => void) => {
        callCount += 1;
        onChunk({ text: 'Paris.', done: false, provider: 'openai' });
        onChunk({ text: '', done: true, provider: 'openai' });
        return Promise.resolve();
      }) as unknown as StreamFn,
    );

    const q = 'Capitale FR ?';
    const primary = 'Paris';
    await hallucinationCrossCheck.crossCheck(q, primary, ['openai']);
    const callsAfterFirst = callCount;
    await hallucinationCrossCheck.crossCheck(q, primary, ['openai']);
    expect(callCount).toBe(callsAfterFirst); /* cache hit, pas de re-call */
  });
});
