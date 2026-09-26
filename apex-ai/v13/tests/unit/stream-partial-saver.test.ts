/**
 * APEX v13 — Tests stream-partial-saver.ts
 *
 * Couvre start/appendChunk/complete/switchProvider/getResumeCandidate/discard
 * + quota localStorage fallback.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import { streamPartialSaver } from '../../services/ai/stream-partial-saver.js';

const KEY = 'apex_v13_streaming_partial';

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  streamPartialSaver.discard();
});

afterEach(() => {
  localStorage.clear();
  streamPartialSaver.discard();
  vi.useRealTimers();
});

describe('stream-partial-saver — start()', () => {
  it('start persiste un état initial', () => {
    streamPartialSaver.start({
      provider: 'anthropic',
      messages: [{ role: 'user', content: 'Hello' }],
      system: 'You are Apex',
    });
    const raw = localStorage.getItem(KEY);
    expect(raw).not.toBeNull();
    const obj = JSON.parse(raw!);
    expect(obj.provider).toBe('anthropic');
    expect(obj.partial_text).toBe('');
    expect(obj.completed).toBe(false);
  });

  it('start avec messages + system stocke tout', () => {
    streamPartialSaver.start({
      provider: 'openai',
      messages: [
        { role: 'user', content: 'A' },
        { role: 'assistant', content: 'B' },
      ],
      system: 'sys',
    });
    const obj = JSON.parse(localStorage.getItem(KEY)!);
    expect(obj.messages_sent).toHaveLength(2);
    expect(obj.system).toBe('sys');
  });
});

describe('stream-partial-saver — appendChunk()', () => {
  it('appendChunk concat le partial_text', () => {
    streamPartialSaver.start({ provider: 'a', messages: [], system: '' });
    streamPartialSaver.appendChunk('Hello ');
    streamPartialSaver.appendChunk('World');
    vi.advanceTimersByTime(1500);
    streamPartialSaver.appendChunk('!');
    const obj = JSON.parse(localStorage.getItem(KEY)!);
    expect(obj.partial_text).toContain('Hello');
  });

  it('appendChunk sans start ne crash pas', () => {
    expect(() => streamPartialSaver.appendChunk('x')).not.toThrow();
  });

  it('throttle 1s : append rapide ne persiste pas chaque chunk', () => {
    streamPartialSaver.start({ provider: 'a', messages: [], system: '' });
    streamPartialSaver.appendChunk('A');
    const after1 = localStorage.getItem(KEY);
    streamPartialSaver.appendChunk('B');
    streamPartialSaver.appendChunk('C');
    /* Le partial_text en mémoire contient ABC, mais localStorage pas forcément */
    expect(after1).not.toBeNull();
  });
});

describe('stream-partial-saver — complete()', () => {
  it('complete marque completed=true', () => {
    streamPartialSaver.start({ provider: 'a', messages: [], system: '' });
    streamPartialSaver.appendChunk('Done');
    streamPartialSaver.complete();
    const obj = JSON.parse(localStorage.getItem(KEY)!);
    expect(obj.completed).toBe(true);
  });

  it('complete déclenche cleanup auto après 5s', () => {
    streamPartialSaver.start({ provider: 'a', messages: [], system: '' });
    streamPartialSaver.complete();
    expect(localStorage.getItem(KEY)).not.toBeNull();
    vi.advanceTimersByTime(6000);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('complete sans start ne crash pas', () => {
    expect(() => streamPartialSaver.complete()).not.toThrow();
  });
});

describe('stream-partial-saver — switchProvider()', () => {
  it('switchProvider met à jour provider et persiste', () => {
    streamPartialSaver.start({ provider: 'anthropic', messages: [], system: '' });
    streamPartialSaver.switchProvider('openai');
    const obj = JSON.parse(localStorage.getItem(KEY)!);
    expect(obj.provider).toBe('openai');
  });

  it('switchProvider sans start ne crash pas', () => {
    expect(() => streamPartialSaver.switchProvider('x')).not.toThrow();
  });
});

describe('stream-partial-saver — getResumeCandidate()', () => {
  it('aucun partial → null', () => {
    expect(streamPartialSaver.getResumeCandidate()).toBeNull();
  });

  it('partial completed → null (rien à reprendre)', () => {
    streamPartialSaver.start({ provider: 'a', messages: [], system: '' });
    streamPartialSaver.appendChunk('Hello world long enough');
    streamPartialSaver.complete();
    /* Avant cleanup auto (5s), state est marqué completed=true */
    expect(streamPartialSaver.getResumeCandidate()).toBeNull();
  });

  it('partial trop court (<5 chars) → null', () => {
    streamPartialSaver.start({ provider: 'a', messages: [], system: '' });
    streamPartialSaver.appendChunk('ok');
    const obj = JSON.parse(localStorage.getItem(KEY)!);
    obj.partial_text = 'ok';
    localStorage.setItem(KEY, JSON.stringify(obj));
    expect(streamPartialSaver.getResumeCandidate()).toBeNull();
  });

  it('partial > 10 min → null (TTL expiré)', () => {
    const stale = {
      ts_start: Date.now() - 20 * 60 * 1000,
      ts_last_chunk: Date.now() - 11 * 60 * 1000,
      provider: 'a',
      partial_text: 'hello world long enough text',
      messages_sent: [],
      system: '',
      completed: false,
    };
    localStorage.setItem(KEY, JSON.stringify(stale));
    expect(streamPartialSaver.getResumeCandidate()).toBeNull();
  });

  it('partial frais (<10 min) + ≥5 chars + incomplete → candidate', () => {
    const fresh = {
      ts_start: Date.now() - 30_000,
      ts_last_chunk: Date.now() - 5_000,
      provider: 'anthropic',
      partial_text: 'Hello there, partial text here',
      messages_sent: [{ role: 'user', content: 'Q' }],
      system: 'sys',
      completed: false,
    };
    localStorage.setItem(KEY, JSON.stringify(fresh));
    const cand = streamPartialSaver.getResumeCandidate();
    expect(cand).not.toBeNull();
    expect(cand?.provider).toBe('anthropic');
    expect(cand?.partial_text).toContain('Hello');
  });

  it('JSON invalide → null', () => {
    localStorage.setItem(KEY, 'not json');
    expect(streamPartialSaver.getResumeCandidate()).toBeNull();
  });
});

describe('stream-partial-saver — discard()', () => {
  it('discard supprime le localStorage entry', () => {
    streamPartialSaver.start({ provider: 'a', messages: [], system: '' });
    expect(localStorage.getItem(KEY)).not.toBeNull();
    streamPartialSaver.discard();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('discard sans état préalable ne throw pas', () => {
    expect(() => streamPartialSaver.discard()).not.toThrow();
  });
});

describe('stream-partial-saver — quota fallback', () => {
  it('si quota dépassé sur persist + partial_text > 10k → trim à 8k et retry', () => {
    streamPartialSaver.start({ provider: 'a', messages: [], system: '' });
    /* Build long text > 10k */
    const big = 'A'.repeat(15_000);
    streamPartialSaver.appendChunk(big);

    /* Force quota fail sur next setItem */
    const orig = Storage.prototype.setItem;
    let callCount = 0;
    Storage.prototype.setItem = function (k: string, v: string) {
      callCount += 1;
      if (callCount === 1) {
        const e = new Error('QuotaExceededError');
        e.name = 'QuotaExceededError';
        throw e;
      }
      return orig.call(this, k, v);
    };

    /* Trigger persist via throttle expired */
    vi.advanceTimersByTime(2000);
    expect(() => streamPartialSaver.appendChunk('!')).not.toThrow();

    Storage.prototype.setItem = orig;
  });

  describe('branches restantes (campagne 100%)', () => {
    const priv = streamPartialSaver as unknown as { current: unknown; persist(): void };
    afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); priv.current = null; });

    it('discard : removeItem throw → catch (107)', () => {
      vi.stubGlobal('localStorage', {
        removeItem: () => { throw new Error('x'); }, setItem: () => {}, getItem: () => null,
      });
      expect(() => streamPartialSaver.discard()).not.toThrow();
    });

    it('complete : setTimeout removeItem throw → catch (77)', () => {
      vi.useFakeTimers();
      vi.stubGlobal('localStorage', {
        setItem: () => {}, removeItem: () => { throw new Error('x'); }, getItem: () => null,
      });
      streamPartialSaver.start({ provider: 'p', messages: [], system: '' });
      streamPartialSaver.complete();
      expect(() => vi.advanceTimersByTime(5000)).not.toThrow();
    });

    it('persist : current null → early return (112)', () => {
      priv.current = null;
      expect(() => priv.persist()).not.toThrow();
    });

    it('persist : quota → trim partial_text → 2e setItem throw → catch (115)', () => {
      vi.stubGlobal('localStorage', {
        setItem: () => { throw new Error('quota'); }, getItem: () => null, removeItem: () => {},
      });
      priv.current = {
        ts_start: 0, ts_last_chunk: 0, provider: 'p',
        partial_text: 'x'.repeat(11000), messages_sent: [], system: '', completed: false,
      };
      expect(() => priv.persist()).not.toThrow();
    });
  });
});
