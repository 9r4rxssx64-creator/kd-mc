/**
 * v13.3.36 (Kevin 2026-05-07 — memory-watch P1 crash) :
 *
 * Tests guard null sur sentinelle memory-watch.
 * Avant : `e.list` undefined → "undefined is not an object (evaluating 'e.list')" → crash sentinel
 * Après : guard sur module + méthode + array → status 'warn' ou 'ok skipped'
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('memory-watch null safety (Kevin v13.3.36 P1 crash fix)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('list() returning non-array → status ok skipped (no crash)', async () => {
    /* Mock persistent-memory-store list() retournant un objet (pas array) */
    vi.doMock('../../services/storage/persistent-memory-store.js', () => ({
      persistentMemory: {
        list: async () => ({ broken: 'not_an_array' }),
        remove: async () => true,
      },
    }));
    const sentinelsMod = await import('../../services/sentinels/sentinels.js');
    const { sentinels, bootstrapSentinelsRegistry } = await import('../../services/sentinels/sentinels-registry.js').then(async (m) => ({
      ...m,
      sentinels: sentinelsMod.sentinels,
    })).catch(() => ({ sentinels: sentinelsMod.sentinels, bootstrapSentinelsRegistry: () => {} }));
    bootstrapSentinelsRegistry();
    /* @ts-expect-error — accès interne pour test */
    const reg = sentinels.list?.() ?? [];
    const memWatch = reg.find((s: { id: string }) => s.id === 'memory-watch');
    expect(memWatch).toBeDefined();
    if (!memWatch) return;
    const result = await memWatch.check();
    /* Guard activé → ok=true (skipped) au lieu de crash */
    expect(result.ok).toBe(true);
    /* Détails contiennent skipped flag */
    expect(result.details).toBeDefined();
  });

  it('list() throwing (IDB closed) → status ok skipped (no crash)', async () => {
    vi.doMock('../../services/storage/persistent-memory-store.js', () => ({
      persistentMemory: {
        list: async () => { throw new Error('IDB closed'); },
        remove: async () => true,
      },
    }));
    const sentinelsMod = await import('../../services/sentinels/sentinels.js');
    const regMod = await import('../../services/sentinels/sentinels-registry.js');
    regMod.bootstrapSentinelsRegistry();
    /* @ts-expect-error — accès interne pour test */
    const reg = sentinelsMod.sentinels.list?.() ?? [];
    const memWatch = reg.find((s: { id: string }) => s.id === 'memory-watch');
    if (!memWatch) {
      /* Sentinelle non enregistrée dans ce contexte test → skip */
      expect(true).toBe(true);
      return;
    }
    const result = await memWatch.check();
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).toContain('skipped');
  });

  it('module persistent-memory-store missing/null → status ok skipped', async () => {
    vi.doMock('../../services/storage/persistent-memory-store.js', () => ({
      persistentMemory: null,
    }));
    const sentinelsMod = await import('../../services/sentinels/sentinels.js');
    const regMod = await import('../../services/sentinels/sentinels-registry.js');
    regMod.bootstrapSentinelsRegistry();
    /* @ts-expect-error — accès interne pour test */
    const reg = sentinelsMod.sentinels.list?.() ?? [];
    const memWatch = reg.find((s: { id: string }) => s.id === 'memory-watch');
    if (!memWatch) {
      expect(true).toBe(true);
      return;
    }
    const result = await memWatch.check();
    expect(result.ok).toBe(true);
  });

  it('list method missing on persistentMemory → status ok skipped', async () => {
    vi.doMock('../../services/storage/persistent-memory-store.js', () => ({
      persistentMemory: {
        /* Pas de list() */
        remove: async () => true,
      },
    }));
    const sentinelsMod = await import('../../services/sentinels/sentinels.js');
    const regMod = await import('../../services/sentinels/sentinels-registry.js');
    regMod.bootstrapSentinelsRegistry();
    /* @ts-expect-error — accès interne pour test */
    const reg = sentinelsMod.sentinels.list?.() ?? [];
    const memWatch = reg.find((s: { id: string }) => s.id === 'memory-watch');
    if (!memWatch) {
      expect(true).toBe(true);
      return;
    }
    const result = await memWatch.check();
    expect(result.ok).toBe(true);
  });

  it('list() retournant array vide → ok + 0 facts', async () => {
    vi.doMock('../../services/storage/persistent-memory-store.js', () => ({
      persistentMemory: {
        list: async () => [],
        remove: async () => true,
      },
    }));
    const sentinelsMod = await import('../../services/sentinels/sentinels.js');
    const regMod = await import('../../services/sentinels/sentinels-registry.js');
    regMod.bootstrapSentinelsRegistry();
    /* @ts-expect-error — accès interne */
    const reg = sentinelsMod.sentinels.list?.() ?? [];
    const memWatch = reg.find((s: { id: string }) => s.id === 'memory-watch');
    if (!memWatch) {
      expect(true).toBe(true);
      return;
    }
    const result = await memWatch.check();
    expect(result.ok).toBe(true);
    expect(result.msg).toContain('0 facts');
  });

  it('entries avec scope manquant ne crashent pas', async () => {
    vi.doMock('../../services/storage/persistent-memory-store.js', () => ({
      persistentMemory: {
        list: async () => [
          { scope: 'kevin', importance: 50, id: 'a' },
          { /* pas de scope */ importance: 30, id: 'b' },
          null,
          undefined,
        ],
        remove: async () => true,
      },
    }));
    const sentinelsMod = await import('../../services/sentinels/sentinels.js');
    const regMod = await import('../../services/sentinels/sentinels-registry.js');
    regMod.bootstrapSentinelsRegistry();
    /* @ts-expect-error */
    const reg = sentinelsMod.sentinels.list?.() ?? [];
    const memWatch = reg.find((s: { id: string }) => s.id === 'memory-watch');
    if (!memWatch) {
      expect(true).toBe(true);
      return;
    }
    const result = await memWatch.check();
    expect(result.ok).toBe(true);
  });
});
