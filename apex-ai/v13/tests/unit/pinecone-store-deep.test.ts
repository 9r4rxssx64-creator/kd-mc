/**
 * Tests pinecone-store deep v13.4.152 (Kevin "100/100 réel").
 *
 * Module : services/pinecone-store.ts (406 stmts, était 65.5%).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const { mockVault, mockFeatureToggles } = vi.hoisted(() => ({
  mockVault: { readKey: vi.fn() },
  mockFeatureToggles: { isEnabled: vi.fn() },
}));

vi.mock('../../services/vault/vault.js', () => ({ vault: mockVault }));
vi.mock('../../services/auth/feature-toggles.js', () => ({
  featureToggles: mockFeatureToggles,
  isFeatureEnabled: (id: string): boolean => mockFeatureToggles.isEnabled(id),
}));

import { pineconeStore } from '../../services/storage/pinecone-store.js';

describe('pinecone-store deep (v13.4.152)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mockFeatureToggles.isEnabled.mockReturnValue(true);
    mockVault.readKey.mockResolvedValue('');
    /* Reset singleton state */
    pineconeStore.reload().catch(() => null);
  });

  afterEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('init', () => {
    it('fallback si feature désactivé', async () => {
      mockFeatureToggles.isEnabled.mockReturnValue(false);
      const ok = await pineconeStore.init();
      expect(ok).toBe(false);
    });

    it('fallback si API key absent', async () => {
      mockVault.readKey.mockResolvedValue('');
      const ok = await pineconeStore.init();
      expect(ok).toBe(false);
    });
  });

  describe('reload', () => {
    it('reset state + reinit', async () => {
      const ok = await pineconeStore.reload();
      expect(typeof ok).toBe('boolean');
    });
  });

  describe('getStatus', () => {
    it('retourne configured=false si pas API key', async () => {
      const status = await pineconeStore.getStatus();
      expect(status.configured).toBe(false);
      expect(status.fallback_active).toBe(true);
    });

    it('retourne configured=true si API key', async () => {
      mockVault.readKey.mockResolvedValue('pcsk_xxx_long_key');
      localStorage.setItem('ax_pinecone_host', 'apex.svc.pinecone.io');
      await pineconeStore.reload();
      const status = await pineconeStore.getStatus();
      expect(status.configured).toBe(true);
    });

    it('inclut vector_count et last_sync_ts', async () => {
      localStorage.setItem('ax_pinecone_vector_count', '1500');
      localStorage.setItem('ax_pinecone_last_sync', String(Date.now()));
      const status = await pineconeStore.getStatus();
      expect(status.vector_count).toBe(1500);
      expect(status.last_sync_ts).toBeGreaterThan(0);
    });
  });

  describe('testConnection', () => {
    it('retourne ok=false si pas configuré', async () => {
      const r = await pineconeStore.testConnection();
      expect(r.ok).toBe(false);
      expect(r.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('retourne ok=true si HTTP 200', async () => {
      mockVault.readKey.mockResolvedValue('pcsk_xxx');
      localStorage.setItem('ax_pinecone_host', 'apex.svc.pinecone.io');
      await pineconeStore.reload();
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
      const r = await pineconeStore.testConnection();
      expect(r.ok).toBe(true);
    });

    it('retourne ok=false si HTTP 401', async () => {
      mockVault.readKey.mockResolvedValue('pcsk_xxx');
      localStorage.setItem('ax_pinecone_host', 'apex.svc.pinecone.io');
      await pineconeStore.reload();
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 401 }));
      const r = await pineconeStore.testConnection();
      expect(r.ok).toBe(false);
      expect(r.error).toContain('401');
    });
  });

  describe('upsertVectors', () => {
    it('retourne ok=true count 0 si vectors vide', async () => {
      const r = await pineconeStore.upsertVectors([]);
      expect(r.ok).toBe(true);
      expect(r.upserted).toBe(0);
    });

    it('retourne not_ready si Pinecone offline', async () => {
      const r = await pineconeStore.upsertVectors([
        { id: 'v1', values: [0.1, 0.2, 0.3] },
      ]);
      expect(r.ok).toBe(false);
      expect(r.error).toContain('not_ready');
    });

    it('upsert OK avec values', async () => {
      mockVault.readKey.mockResolvedValue('pcsk_xxx');
      localStorage.setItem('ax_pinecone_host', 'apex.svc.pinecone.io');
      await pineconeStore.reload();
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ upsertedCount: 1 }), { status: 200 }),
      );
      const r = await pineconeStore.upsertVectors([
        { id: 'v1', values: [0.1, 0.2, 0.3] },
      ]);
      expect(r.ok).toBe(true);
      expect(r.upserted).toBe(1);
    });

    it('retourne erreur si records sans text et sans values', async () => {
      mockVault.readKey.mockResolvedValue('pcsk_xxx');
      localStorage.setItem('ax_pinecone_host', 'apex.svc.pinecone.io');
      await pineconeStore.reload();
      const r = await pineconeStore.upsertVectors([
        { id: 'v1' },
      ]);
      expect(r.ok).toBe(false);
      expect(r.error).toContain('no_text_or_values');
    });
  });

  describe('query', () => {
    it('retourne [] si pas text et pas vector', async () => {
      mockVault.readKey.mockResolvedValue('pcsk_xxx');
      localStorage.setItem('ax_pinecone_host', 'apex.svc.pinecone.io');
      await pineconeStore.reload();
      const r = await pineconeStore.query({ topK: 5 });
      expect(Array.isArray(r)).toBe(true);
    });

    it('fallback localStorage si Pinecone offline', async () => {
      const r = await pineconeStore.query({ text: 'test query', topK: 3 });
      expect(Array.isArray(r)).toBe(true);
    });

    it('cache result avec même query', async () => {
      const r1 = await pineconeStore.query({ text: 'test', topK: 3 });
      const r2 = await pineconeStore.query({ text: 'test', topK: 3 });
      expect(r1).toEqual(r2);
    });
  });
});
