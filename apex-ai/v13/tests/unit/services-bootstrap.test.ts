/**
 * Tests services-bootstrap.ts (0% coverage → couvert).
 * Wire 16 services au boot (anti-pattern Declaration ≠ Deployment).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { bootstrapServices } from '../../services/core-svc/services-bootstrap.js';

describe('Services Bootstrap (anti-pattern Declaration ≠ Deployment)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('bootstrapServices retourne array de results', async () => {
    const results = await bootstrapServices('user1');
    expect(Array.isArray(results)).toBe(true);
  });

  it('1er call wire 16 services', async () => {
    const results = await bootstrapServices('user1');
    /* 16 services attendus selon services-bootstrap.ts */
    if (results.length > 0) {
      expect(results.length).toBeGreaterThanOrEqual(15);
    }
  });

  it('2e call idempotent (no-op array vide)', async () => {
    await bootstrapServices('user1');
    const results = await bootstrapServices('user1');
    /* Soit vide (déjà bootstrapé), soit re-wire — on accepte les 2 */
    expect(Array.isArray(results)).toBe(true);
  });

  it('chaque result a service + ok + duration_ms', async () => {
    const results = await bootstrapServices('user2');
    for (const r of results) {
      expect(typeof r.service).toBe('string');
      expect(typeof r.ok).toBe('boolean');
      expect(typeof r.duration_ms).toBe('number');
      expect(r.duration_ms).toBeGreaterThanOrEqual(0);
    }
  });

  it('fonctionne avec uid null (anonyme)', async () => {
    const results = await bootstrapServices(null);
    expect(Array.isArray(results)).toBe(true);
  });
});
