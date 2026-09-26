import { describe, it, expect, beforeEach } from 'vitest';
import { firebaseQueue } from '../../services/storage/firebase-queue.js';

describe('firebase-queue', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  it('add() incrémente size', () => {
    firebaseQueue.add('test_key', { val: 1 });
    expect(firebaseQueue.size()).toBeGreaterThanOrEqual(1);
  });
  it('persiste queue dans localStorage', () => {
    firebaseQueue.add('persist_test', { v: 'x' });
    const raw = localStorage.getItem('apex_v13_fb_queue');
    expect(raw).toBeTruthy();
  });
  it('cap MAX_QUEUE 200 entries', () => {
    for (let i = 0; i < 250; i++) firebaseQueue.add(`k${i}`, i);
    expect(firebaseQueue.size()).toBeLessThanOrEqual(200);
  });
});
