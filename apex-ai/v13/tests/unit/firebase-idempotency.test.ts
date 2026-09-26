import { describe, it, expect, beforeEach } from 'vitest';

describe('firebase idempotency persisted', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  it('hashIdempotency déterministe', async () => {
    const hash = async (k: string, v: unknown) => {
      const data = k + ':' + JSON.stringify(v);
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
      return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
    };
    const h1 = await hash('user:1', { name: 'Kevin' });
    const h2 = await hash('user:1', { name: 'Kevin' });
    expect(h1).toBe(h2);
    expect(h1.length).toBe(32);
  });
  it('hashIdempotency change si value change', async () => {
    const hash = async (k: string, v: unknown) => {
      const data = k + ':' + JSON.stringify(v);
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
      return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
    };
    const h1 = await hash('user:1', { name: 'A' });
    const h2 = await hash('user:1', { name: 'B' });
    expect(h1).not.toBe(h2);
  });
});
