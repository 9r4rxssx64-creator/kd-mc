// @vitest-environment node
/*
 * 10/09/2026 — crypto-core.js expose `window.ApexCrypto` pour le code legacy, derrière
 * `if (typeof window !== 'undefined')`. Sous happy-dom, `window` existe toujours : la
 * branche « pas de window » (Worker Cloudflare, Node) n'était jamais exécutée — vu par la
 * mesure de couverture AST (vitest 5). Ce test charge le module en environnement Node :
 * il doit s'importer sans erreur et sans rien accrocher à un `window` inexistant.
 */
import { describe, it, expect } from 'vitest';

describe('crypto-core hors navigateur (Worker / Node)', () => {
  it("s'importe sans window et n'en crée pas", async () => {
    expect(typeof globalThis.window).toBe('undefined');
    const api = await import('../../lib/crypto-core.js');
    expect(typeof api.generateIdentityKeys).toBe('function');
    expect(typeof api.ratchetInit).toBe('function');
    expect(typeof globalThis.window).toBe('undefined');
    expect(globalThis.ApexCrypto).toBeUndefined();
  });
});
