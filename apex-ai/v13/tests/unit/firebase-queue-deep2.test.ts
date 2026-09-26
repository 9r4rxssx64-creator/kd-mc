import { describe, it, expect, beforeEach, vi } from 'vitest';
import { firebaseQueue } from '../../services/storage/firebase-queue.js';

describe('firebase-queue deep tests Jet 7.9', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('size compte uniquement non-failed entries', () => {
    /* Pré-rempli avec mix pending/failed */
    const queue = [
      { id: 'q1', key: 'k1', value: 1, ts: Date.now(), attempts: 0, status: 'pending' },
      { id: 'q2', key: 'k2', value: 2, ts: Date.now(), attempts: 5, status: 'failed' },
      { id: 'q3', key: 'k3', value: 3, ts: Date.now(), attempts: 0, status: 'pending' },
    ];
    localStorage.setItem('apex_v13_fb_queue', JSON.stringify(queue));
    firebaseQueue.init();
    expect(firebaseQueue.size()).toBe(2); /* failed exclu */
  });

  it('add génère id unique q_*', () => {
    firebaseQueue.add('test_key', 'value1');
    const queue = JSON.parse(localStorage.getItem('apex_v13_fb_queue') ?? '[]');
    expect(queue[queue.length - 1].id).toMatch(/^q_/);
  });

  it('rotation queue persiste seulement -200', () => {
    for (let i = 0; i < 220; i++) firebaseQueue.add(`k${i}`, i);
    const queue = JSON.parse(localStorage.getItem('apex_v13_fb_queue') ?? '[]');
    expect(queue.length).toBeLessThanOrEqual(200);
  });

  it('add chain key/value/ts/attempts/status pending', () => {
    firebaseQueue.add('chain_test', { foo: 'bar' });
    const queue = JSON.parse(localStorage.getItem('apex_v13_fb_queue') ?? '[]');
    const last = queue[queue.length - 1];
    expect(last.key).toBe('chain_test');
    expect(last.value).toEqual({ foo: 'bar' });
    expect(last.attempts).toBe(0);
    expect(last.status).toBe('pending');
    expect(last.ts).toBeGreaterThan(0);
  });
});
