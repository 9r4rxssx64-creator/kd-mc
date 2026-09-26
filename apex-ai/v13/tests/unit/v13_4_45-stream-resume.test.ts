/**
 * Test régression v13.4.45 — Stream Partial Resume (Kevin "toujours terminer son travail").
 *
 * Bug fixé : streamPartialSaver.getResumeCandidate() était défini mais JAMAIS wired
 * → Kevin perdait les streams partiels si app crash/background-kill iOS.
 *
 * Fix v13.4.45 : wire dans features/chat/index.ts render() — au mount du chat,
 * détecte partial incomplet récent + restaure dans conversation avec hint Kevin.
 *
 * Note : streamPartialSaver a throttle persist 1s. Pour tests on utilise
 * switchProvider() qui persist immédiatement ou start() qui resette + persist.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { streamPartialSaver } from '../../services/ai/stream-partial-saver.js';

describe('v13.4.45 streamPartialSaver.getResumeCandidate — anti-perte stream', () => {
  beforeEach(() => {
    localStorage.removeItem('apex_v13_stream_partial_active');
    streamPartialSaver.discard();
  });

  it("retourne null si aucun partial en cours", () => {
    const r = streamPartialSaver.getResumeCandidate();
    expect(r).toBeNull();
  });

  it("retourne partial après start() + appendChunk() (force persist via switchProvider)", () => {
    streamPartialSaver.start({
      provider: 'anthropic',
      messages: [{ role: 'user', content: 'test message' }],
      system: 'system prompt',
    });
    streamPartialSaver.appendChunk('Bonjour Kevin, je commence à répondre...');
    /* Force persist via switchProvider (bypass throttle 1s) */
    streamPartialSaver.switchProvider('anthropic');
    const r = streamPartialSaver.getResumeCandidate();
    expect(r).not.toBeNull();
    expect(r?.partial_text).toContain('Bonjour Kevin');
    expect(r?.provider).toBe('anthropic');
    expect(r?.completed).toBe(false);
  });

  it("retourne null après complete() (stream fini OK)", () => {
    streamPartialSaver.start({
      provider: 'anthropic',
      messages: [{ role: 'user', content: 'test' }],
      system: 'sys',
    });
    streamPartialSaver.appendChunk('Réponse complète');
    streamPartialSaver.complete();
    const r = streamPartialSaver.getResumeCandidate();
    expect(r).toBeNull();
  });

  it("retourne null si partial trop court (< 5 chars)", () => {
    streamPartialSaver.start({
      provider: 'anthropic',
      messages: [{ role: 'user', content: 'x' }],
      system: 's',
    });
    streamPartialSaver.appendChunk('ab');
    streamPartialSaver.switchProvider('anthropic'); /* force persist */
    const r = streamPartialSaver.getResumeCandidate();
    expect(r).toBeNull();
  });

  it("discard() efface partial", () => {
    streamPartialSaver.start({
      provider: 'anthropic',
      messages: [{ role: 'user', content: 'test' }],
      system: 'sys',
    });
    streamPartialSaver.appendChunk('contenu partiel à effacer');
    streamPartialSaver.switchProvider('anthropic');
    expect(streamPartialSaver.getResumeCandidate()).not.toBeNull();
    streamPartialSaver.discard();
    expect(streamPartialSaver.getResumeCandidate()).toBeNull();
  });

  it("switchProvider() préserve partial + change provider", () => {
    streamPartialSaver.start({
      provider: 'anthropic',
      messages: [{ role: 'user', content: 'test' }],
      system: 'sys',
    });
    streamPartialSaver.appendChunk('Anthropic répondait avec contexte');
    streamPartialSaver.switchProvider('openai');
    const r = streamPartialSaver.getResumeCandidate();
    expect(r?.provider).toBe('openai');
    expect(r?.partial_text).toContain('Anthropic répondait');
  });

  it("messages_sent + system préservés pour resume context", () => {
    const messages = [
      { role: 'user', content: 'question 1' },
      { role: 'assistant', content: 'réponse 1' },
      { role: 'user', content: 'question 2 qui interrompt' },
    ];
    streamPartialSaver.start({
      provider: 'anthropic',
      messages,
      system: 'context system',
    });
    streamPartialSaver.appendChunk('Début de réponse interrompue suffisamment longue');
    streamPartialSaver.switchProvider('anthropic'); /* persist */
    const r = streamPartialSaver.getResumeCandidate();
    expect(r?.messages_sent).toHaveLength(3);
    expect(r?.system).toBe('context system');
  });
});

describe('v13.4.45 anti-régression stream-partial-saver', () => {
  beforeEach(() => {
    streamPartialSaver.discard();
  });

  it("start() écrase partial précédent", () => {
    streamPartialSaver.start({ provider: 'a', messages: [], system: '' });
    streamPartialSaver.appendChunk('Premier stream');
    streamPartialSaver.switchProvider('a');
    streamPartialSaver.start({ provider: 'b', messages: [], system: '' });
    streamPartialSaver.appendChunk('Deuxième stream');
    streamPartialSaver.switchProvider('b');
    const r = streamPartialSaver.getResumeCandidate();
    expect(r?.partial_text).toBe('Deuxième stream');
    expect(r?.provider).toBe('b');
  });

  it("appendChunk sans start ne crash pas", () => {
    expect(() => streamPartialSaver.appendChunk('orphan')).not.toThrow();
  });

  it("complete sans start ne crash pas", () => {
    expect(() => streamPartialSaver.complete()).not.toThrow();
  });

  it("multiple appendChunk accumulent texte (mémoire interne)", () => {
    streamPartialSaver.start({ provider: 'x', messages: [], system: '' });
    for (let i = 0; i < 50; i++) {
      streamPartialSaver.appendChunk(`chunk ${i} `);
    }
    /* Force persist final via switchProvider */
    streamPartialSaver.switchProvider('x');
    const r = streamPartialSaver.getResumeCandidate();
    expect(r?.partial_text).toContain('chunk 0');
    expect(r?.partial_text).toContain('chunk 49');
  });
});
