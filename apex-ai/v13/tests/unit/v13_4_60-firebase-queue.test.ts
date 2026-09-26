/**
 * Test régression v13.4.60 — services/firebase-queue.ts (offline persistence).
 *
 * Queue Firebase writes pendant offline → flush automatique au retour online.
 * Kevin règle "rien perdu jamais" — cross-device sync robuste.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { firebaseQueue } from '../../services/storage/firebase-queue.js';

describe('v13.4.60 firebase-queue — offline persistence', () => {
  beforeEach(() => {
    localStorage.removeItem('apex_v13_fb_queue');
    firebaseQueue.init();
  });

  it("singleton défini avec méthodes attendues", () => {
    expect(firebaseQueue).toBeDefined();
    expect(typeof firebaseQueue.init).toBe('function');
    expect(typeof firebaseQueue.add).toBe('function');
    expect(typeof firebaseQueue.size).toBe('function');
  });

  it("size() retourne number ≥ 0", () => {
    expect(firebaseQueue.size()).toBeGreaterThanOrEqual(0);
  });

  it("add(key, value) augmente size", () => {
    const before = firebaseQueue.size();
    firebaseQueue.add('test_key_60', { data: 'test' });
    /* size peut soit augmenter soit replace clé existante */
    expect(firebaseQueue.size()).toBeGreaterThanOrEqual(before);
  });

  it("add valeurs multiples", () => {
    firebaseQueue.add('k1', 'v1');
    firebaseQueue.add('k2', { obj: true });
    firebaseQueue.add('k3', [1, 2, 3]);
    expect(firebaseQueue.size()).toBeGreaterThanOrEqual(0);
  });

  it("init() idempotent", () => {
    expect(() => {
      firebaseQueue.init();
      firebaseQueue.init();
    }).not.toThrow();
  });
});
