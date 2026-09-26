/**
 * Tests chat-sessions-history v13.4.175 (refactor minutieux extraction depuis chat/index.ts).
 *
 * Vérifie zéro régression :
 * - loadSessionsHistory : array vide si nada / JSON invalide / non-array
 * - saveSessionsHistory : write localStorage + silent quota errors
 * - pushSessionToHistory : append + cap 10 (FIFO drop oldest), immuable
 * - archiveSession : combine load+push+save
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type ChatSession,
  archiveSession,
  loadSessionsHistory,
  pushSessionToHistory,
  saveSessionsHistory,
} from '../../features/chat/chat-sessions-history.js';

const KEY = 'apex_v13_chat_sessions';

function makeSession(ts: number, count: number = 1): ChatSession {
  return {
    ts,
    messages: Array.from({ length: count }, (_, i) => ({
      id: `m${ts}_${i}`,
      role: 'user' as const,
      text: `msg-${i}`,
      ts: ts + i,
    })),
  };
}

describe('chat-sessions-history loadSessionsHistory (v13.4.175)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('localStorage vide → []', () => {
    expect(loadSessionsHistory()).toEqual([]);
  });

  it('JSON invalide → [] (silent recovery)', () => {
    localStorage.setItem(KEY, 'not-json{');
    expect(loadSessionsHistory()).toEqual([]);
  });

  it('non-array → []', () => {
    localStorage.setItem(KEY, JSON.stringify({ foo: 'bar' }));
    expect(loadSessionsHistory()).toEqual([]);
  });

  it('array valide → parsed', () => {
    const sessions: ChatSession[] = [makeSession(1000), makeSession(2000)];
    localStorage.setItem(KEY, JSON.stringify(sessions));
    expect(loadSessionsHistory()).toHaveLength(2);
  });
});

describe('chat-sessions-history saveSessionsHistory (v13.4.175)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('écrit dans localStorage', () => {
    const sessions: ChatSession[] = [makeSession(1000)];
    saveSessionsHistory(sessions);
    const raw = localStorage.getItem(KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)).toHaveLength(1);
  });

  it('silent recovery sur QuotaExceededError', () => {
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      const err = new Error('QuotaExceededError');
      err.name = 'QuotaExceededError';
      throw err;
    });
    try {
      expect(() => saveSessionsHistory([makeSession(1)])).not.toThrow();
    } finally {
      spy.mockRestore();
    }
  });
});

describe('chat-sessions-history pushSessionToHistory (v13.4.175)', () => {
  it('append à un array vide', () => {
    const result = pushSessionToHistory([], makeSession(1000));
    expect(result).toHaveLength(1);
    expect(result[0]?.ts).toBe(1000);
  });

  it('append à un array non vide', () => {
    const existing = [makeSession(1000)];
    const result = pushSessionToHistory(existing, makeSession(2000));
    expect(result).toHaveLength(2);
    expect(result[0]?.ts).toBe(1000);
    expect(result[1]?.ts).toBe(2000);
  });

  it('cap 10 par défaut (FIFO drop oldest)', () => {
    const existing: ChatSession[] = Array.from({ length: 10 }, (_, i) =>
      makeSession((i + 1) * 1000),
    );
    const result = pushSessionToHistory(existing, makeSession(99999));
    expect(result).toHaveLength(10);
    /* Plus ancienne (1000) drop, nouvelle (99999) ajoutée à la fin */
    expect(result[0]?.ts).toBe(2000);
    expect(result[9]?.ts).toBe(99999);
  });

  it('cap custom respecté', () => {
    const existing: ChatSession[] = Array.from({ length: 3 }, (_, i) =>
      makeSession((i + 1) * 1000),
    );
    const result = pushSessionToHistory(existing, makeSession(4000), 3);
    expect(result).toHaveLength(3);
    expect(result[0]?.ts).toBe(2000);
    expect(result[2]?.ts).toBe(4000);
  });

  it('immutable : n altère pas le tableau existant', () => {
    const existing = [makeSession(1000)];
    const before = existing.length;
    pushSessionToHistory(existing, makeSession(2000));
    expect(existing.length).toBe(before);
  });
});

describe('chat-sessions-history archiveSession (v13.4.175)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('combine load + push + save', () => {
    archiveSession(makeSession(1000).messages, 1000);
    const stored = JSON.parse(localStorage.getItem(KEY)!) as ChatSession[];
    expect(stored).toHaveLength(1);
    expect(stored[0]?.ts).toBe(1000);
  });

  it('append à un historique existant', () => {
    saveSessionsHistory([makeSession(1000)]);
    archiveSession(makeSession(2000).messages, 2000);
    const stored = JSON.parse(localStorage.getItem(KEY)!) as ChatSession[];
    expect(stored).toHaveLength(2);
  });

  it('silent sur exception de load (JSON corrompu)', () => {
    localStorage.setItem(KEY, '{{');
    expect(() => archiveSession(makeSession(1).messages)).not.toThrow();
    /* Après silent recovery, archive la nouvelle session */
    const stored = JSON.parse(localStorage.getItem(KEY)!) as ChatSession[];
    expect(stored).toHaveLength(1);
  });
});
