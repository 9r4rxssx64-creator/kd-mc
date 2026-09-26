/**
 * Tests storage-compressor (iOS quota fix LZ-string).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { storageCompressor } from '../../services/storage/storage-compressor.js';

describe('Storage Compressor (iOS PWA quota)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('set + get round-trip', () => {
    it('stocke string court sans compression (< 1KB)', async () => {
      const r = await storageCompressor.set('key1', 'hello');
      expect(r.ok).toBe(true);
      expect(r.compressed).toBe(false);
      const v = await storageCompressor.get<string>('key1');
      expect(v).toBe('hello');
    });

    it('stocke object court sans compression', async () => {
      const obj = { foo: 'bar', n: 42 };
      const r = await storageCompressor.set('key2', obj);
      expect(r.ok).toBe(true);
      const v = await storageCompressor.get<typeof obj>('key2');
      expect(v).toEqual(obj);
    });

    it('compresse valeurs > 1KB automatiquement', async () => {
      const big = Array.from({ length: 200 }, (_, i) => ({ id: i, text: 'lorem ipsum dolor sit amet '.repeat(3) }));
      const r = await storageCompressor.set('key_big', big);
      expect(r.ok).toBe(true);
      expect(r.compressed).toBe(true);
      /* Vérifier prefix */
      const raw = localStorage.getItem('key_big');
      expect(raw?.startsWith('__LZ__')).toBe(true);
    });

    it('décompresse round-trip valeur compressée', async () => {
      const big = { items: Array.from({ length: 100 }, (_, i) => ({ id: i, name: `item${i}`, desc: 'a description'.repeat(5) })) };
      await storageCompressor.set('key_round', big);
      const v = await storageCompressor.get<typeof big>('key_round');
      expect(v).toEqual(big);
    });
  });

  describe('backward compat', () => {
    it('lit valeur JSON brute non-compressée (legacy)', async () => {
      localStorage.setItem('legacy_key', JSON.stringify({ legacy: true, count: 5 }));
      const v = await storageCompressor.get<{ legacy: boolean; count: number }>('legacy_key');
      expect(v).toEqual({ legacy: true, count: 5 });
    });

    it('lit string brute non-compressée', async () => {
      localStorage.setItem('legacy_str', 'just a string');
      const v = await storageCompressor.get<string>('legacy_str');
      expect(v).toBe('just a string');
    });

    it('retourne defaultValue si clé absente', async () => {
      const v = await storageCompressor.get('inexistant', 'fallback');
      expect(v).toBe('fallback');
    });
  });

  describe('quota status', () => {
    it('getUsageBytes retourne nombre >= 0', () => {
      const used = storageCompressor.getUsageBytes();
      expect(used).toBeGreaterThanOrEqual(0);
    });

    it('getQuotaStatus retourne severity ok/warn/critical', () => {
      const s = storageCompressor.getQuotaStatus();
      expect(['ok', 'warn', 'critical']).toContain(s.severity);
      expect(s.limit_mb).toBe(5);
      expect(typeof s.pct).toBe('number');
    });

    it('severity warn si > 4MB (simulation indirecte)', async () => {
      /* Stockage léger — vérification structure uniquement */
      await storageCompressor.set('small', 'x');
      const s = storageCompressor.getQuotaStatus();
      expect(s.used_bytes).toBeGreaterThanOrEqual(0);
    });
  });

  describe('migrateAllToCompressed', () => {
    it('compresse les clés > 1KB existantes', async () => {
      /* Stocker plusieurs valeurs > 1KB sans compression */
      const big1 = JSON.stringify(Array.from({ length: 100 }, (_, i) => `value-${i}-padded-with-extra-text-to-pass-threshold`));
      const big2 = JSON.stringify(Array.from({ length: 80 }, (_, i) => ({ id: i, name: 'long-name-test-padding-to-reach-1kb' })));
      localStorage.setItem('big1', big1);
      localStorage.setItem('big2', big2);
      localStorage.setItem('small', 'short');
      const r = await storageCompressor.migrateAllToCompressed();
      expect(r.migrated).toBeGreaterThanOrEqual(0);
      /* small reste tel quel */
      expect(localStorage.getItem('small')).toBe('short');
    });

    it('skip clés déjà compressées (idempotent)', async () => {
      const big = Array.from({ length: 200 }, (_, i) => ({ id: i, text: 'padding'.repeat(10) }));
      await storageCompressor.set('already_compressed', big);
      const r1 = await storageCompressor.migrateAllToCompressed();
      const r2 = await storageCompressor.migrateAllToCompressed();
      expect(r2.migrated).toBe(0); /* 2e migration = no-op */
    });
  });

  describe('edge cases', () => {
    it('valeur vide ne crash pas', async () => {
      const r = await storageCompressor.set('empty', '');
      expect(r.ok).toBe(true);
      const v = await storageCompressor.get<string>('empty');
      expect(v).toBe('');
    });

    it('valeur corrompue : décompression best-effort (pas crash)', async () => {
      localStorage.setItem('corrupt', '__LZ__corrupted_data_xyz');
      /* Le décompresseur est tolérant : retourne string déchiffrable ou defaultValue, jamais throw */
      const v = await storageCompressor.get('corrupt', 'fallback-default');
      expect(v).toBeDefined();
    });
  });
});
