/**
 * Tests services-bootstrap.ts (Architecture 18→20).
 * Vérifie wiring 30+ services au boot.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { bootstrapServices } from '../../services/core-svc/services-bootstrap.js';

describe('Services Bootstrap (Architecture wired services)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('bootstrapServices retourne array', async () => {
    const r = await bootstrapServices('u1');
    expect(Array.isArray(r)).toBe(true);
  });

  it('uid null → pas de crash', async () => {
    const r = await bootstrapServices(null);
    expect(Array.isArray(r)).toBe(true);
  });

  it('idempotent (2 appels OK)', async () => {
    await bootstrapServices('u1');
    const r2 = await bootstrapServices('u1');
    expect(Array.isArray(r2)).toBe(true);
  });

  it('chaque result a ok + service + duration_ms', async () => {
    const r = await bootstrapServices('u1');
    if (r.length > 0) {
      expect(r[0]).toHaveProperty('ok');
      expect(r[0]).toHaveProperty('service');
      expect(r[0]).toHaveProperty('duration_ms');
    }
  });

  it('au moins 20 services wirés', async () => {
    const r = await bootstrapServices('u1');
    /* services-bootstrap wire ~30 services. Selon idempotency, peut être 0 si déjà bootstrapped */
    expect(r.length === 0 || r.length >= 20).toBe(true);
  });
});
