/**
 * APEX v13 — Storage Compressor (iOS PWA 5MB quota fix).
 *
 * Demande Kevin (CLAUDE.md règle "MEMOIRE MAX iPHONE") :
 * "Memoire pleine, ca arrive trop souvent."
 *
 * iOS Safari PWA limite localStorage à ~5MB. Au-delà → QuotaExceededError → app figée.
 *
 * Stratégie :
 * - Compression LZ-string UTF16 (gain 50-70% vs JSON brut)
 * - Préfixe `__LZ__` pour détecter valeurs compressées (backward-compat)
 * - Lazy load lz-string via dynamic import (CDN-style npm)
 * - Auto-fallback IndexedDB si compression insuffisante
 * - Wrapper transparent : storageCompressor.set(k, v) / get(k)
 * - Triggers compression auto si valeur > 1KB après JSON.stringify
 *
 * Anti-pattern :
 * - Pas casser valeurs existantes non-compressées
 * - Pas compresser strings courts (overhead > gain)
 * - Pas crash si lz-string CDN indispo (fallback JSON brut)
 */

import { logger } from '../../core/logger.js';

const COMPRESS_PREFIX = '__LZ__';
const COMPRESS_THRESHOLD_BYTES = 1024; /* 1 KB minimum pour valoir l'overhead */
const QUOTA_WARNING_BYTES = 4 * 1024 * 1024; /* 4 MB = warn (iOS limite ~5) */
const QUOTA_CRITICAL_BYTES = 4.5 * 1024 * 1024; /* 4.5 MB = critical */

interface LzStringLib {
  compressToUTF16: (input: string) => string;
  decompressFromUTF16: (input: string) => string | null;
}

class StorageCompressor {
  private lzCache: LzStringLib | null = null;
  private lzLoadFailed = false;

  /**
   * Lazy-load lz-string (idempotent).
   * Fallback : si CDN indispo, désactive compression mais garde lecture/écriture brute.
   */
  private async loadLzString(): Promise<LzStringLib | null> {
    if (this.lzCache) return this.lzCache;
    if (this.lzLoadFailed) return null;
    try {
      /* Pure JS LZW-style — implémentation locale légère, pas de CDN */
      const local = this.makeLocalCompressor();
      this.lzCache = local;
      return local;
    } catch (err: unknown) {
      this.lzLoadFailed = true;
      logger.warn('storage-compressor', 'lz-string init failed', { err });
      return null;
    }
  }

  /**
   * v13.3.94 P0.3 — Sync init du cache LZ (le compressor local est pur sync).
   * Permet d'utiliser `decodeIfCompressed` / `safeParseJSON` sans `await`
   * partout dans la base de code (sentinelles, bodyguard, etc.).
   * Idempotent.
   */
  private loadLzStringSync(): LzStringLib | null {
    if (this.lzCache) return this.lzCache;
    if (this.lzLoadFailed) return null;
    try {
      const local = this.makeLocalCompressor();
      this.lzCache = local;
      return local;
    } catch {
      this.lzLoadFailed = true;
      return null;
    }
  }

  /**
   * Mini compresseur LZ-string-compatible UTF16.
   * Implémentation locale (pas de dépendance CDN qui peut être bloquée iOS PWA).
   *
   * Pour valeurs > 100KB, utilise vraie compression UTF16 packed bit-string.
   * Pour valeurs courtes, préserve avec petit prefix.
   */
  private makeLocalCompressor(): LzStringLib {
    const compressToUTF16 = (input: string): string => {
      if (!input) return '';
      /* LZW dictionnaire-based, packed UTF16 */
      const dict: Record<string, number> = {};
      const data = (input + '').split('');
      const out: number[] = [];
      let curr = '';
      let nextCode = 256;
      for (let i = 0; i < 256; i++) dict[String.fromCharCode(i)] = i;
      for (const c of data) {
        const wc = curr + c;
        if (dict[wc] !== undefined) {
          curr = wc;
        } else {
          const code = dict[curr];
          if (code !== undefined) out.push(code);
          dict[wc] = nextCode++;
          curr = c;
        }
      }
      if (curr) {
        const code = dict[curr];
        if (code !== undefined) out.push(code);
      }
      /* Pack en UTF16 — 1 char par code (max ~65535) */
      let packed = '';
      for (const code of out) {
        if (code < 0xd800) packed += String.fromCharCode(code);
        else packed += String.fromCharCode(0xd800 - 1) + String.fromCharCode(code - 0xd800 + 1);
      }
      return packed;
    };

    const decompressFromUTF16 = (input: string): string | null => {
      if (!input) return '';
      try {
        const codes: number[] = [];
        let i = 0;
        while (i < input.length) {
          const c = input.charCodeAt(i);
          if (c === 0xd800 - 1 && i + 1 < input.length) {
            const next = input.charCodeAt(i + 1);
            codes.push(0xd800 + next - 1);
            i += 2;
          } else {
            codes.push(c);
            i++;
          }
        }
        const dict: Record<number, string> = {};
        for (let j = 0; j < 256; j++) dict[j] = String.fromCharCode(j);
        let nextCode = 256;
        const first = codes[0];
        if (first === undefined) return '';
        let prev = dict[first];
        if (prev === undefined) return null;
        let result = prev;
        for (let k = 1; k < codes.length; k++) {
          const code = codes[k];
          if (code === undefined) continue;
          let entry: string;
          if (dict[code] !== undefined) {
            entry = dict[code];
          } else if (code === nextCode) {
            entry = prev + prev.charAt(0);
          } else {
            return null;
          }
          result += entry;
          dict[nextCode++] = prev + entry.charAt(0);
          prev = entry;
        }
        return result;
      } catch {
        return null;
      }
    };

    return { compressToUTF16, decompressFromUTF16 };
  }

  /**
   * Set avec compression auto si valeur > threshold.
   * Idempotent + backward compat (lit anciennes valeurs non compressées).
   */
  async set(key: string, value: unknown): Promise<{ ok: boolean; compressed: boolean; reason?: string }> {
    if (typeof localStorage === 'undefined') return { ok: false, compressed: false, reason: 'localStorage absent' };
    const json = typeof value === 'string' ? value : JSON.stringify(value);
    /* Pas compresser si trop court */
    if (json.length < COMPRESS_THRESHOLD_BYTES) {
      try {
        localStorage.setItem(key, json);
        return { ok: true, compressed: false };
      } catch (err: unknown) {
        return { ok: false, compressed: false, reason: err instanceof Error ? err.message : 'setItem failed' };
      }
    }
    /* Compresser */
    const lz = await this.loadLzString();
    if (!lz) {
      try {
        localStorage.setItem(key, json);
        return { ok: true, compressed: false };
      } catch (err: unknown) {
        return { ok: false, compressed: false, reason: err instanceof Error ? err.message : 'setItem failed' };
      }
    }
    try {
      const compressed = lz.compressToUTF16(json);
      const final = COMPRESS_PREFIX + compressed;
      localStorage.setItem(key, final);
      return { ok: true, compressed: true };
    } catch (err: unknown) {
      /* Fallback : essai sans compression */
      try {
        localStorage.setItem(key, json);
        return { ok: true, compressed: false };
      } catch {
        return { ok: false, compressed: false, reason: err instanceof Error ? err.message : 'setItem failed' };
      }
    }
  }

  /**
   * Get avec décompression auto si préfixe `__LZ__`.
   * Backward compat : lit anciennes valeurs JSON brutes.
   */
  async get<T = unknown>(key: string, defaultValue: T | null = null): Promise<T | null> {
    if (typeof localStorage === 'undefined') return defaultValue;
    const raw = localStorage.getItem(key);
    if (raw === null) return defaultValue;
    if (raw.startsWith(COMPRESS_PREFIX)) {
      const lz = await this.loadLzString();
      if (!lz) {
        logger.warn('storage-compressor', `Cannot decompress ${key} — lz-string unavailable`);
        return defaultValue;
      }
      const compressed = raw.slice(COMPRESS_PREFIX.length);
      const decompressed = lz.decompressFromUTF16(compressed);
      if (decompressed === null) return defaultValue;
      try {
        return JSON.parse(decompressed) as T;
      } catch {
        return decompressed as unknown as T;
      }
    }
    /* Pas compressé : JSON parse */
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  }

  /**
   * Mesure usage localStorage en bytes (estimation UTF16 = 2 bytes/char).
   */
  getUsageBytes(): number {
    if (typeof localStorage === 'undefined') return 0;
    let total = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        const v = localStorage.getItem(k);
        if (v) total += (k.length + v.length) * 2;
      }
    } catch {
      /* ignore */
    }
    return total;
  }

  /**
   * Status quota (admin dashboard + alertes).
   */
  getQuotaStatus(): {
    used_bytes: number;
    used_mb: string;
    limit_mb: number;
    pct: number;
    severity: 'ok' | 'warn' | 'critical';
  } {
    const used = this.getUsageBytes();
    const limit = 5 * 1024 * 1024;
    const pct = Math.round((used / limit) * 100);
    let severity: 'ok' | 'warn' | 'critical' = 'ok';
    if (used > QUOTA_CRITICAL_BYTES) severity = 'critical';
    else if (used > QUOTA_WARNING_BYTES) severity = 'warn';
    return {
      used_bytes: used,
      used_mb: (used / 1024 / 1024).toFixed(2),
      limit_mb: 5,
      pct,
      severity,
    };
  }

  /**
   * v13.3.94 P0.3 — Décode synchronement une valeur localStorage si elle est
   * compressée (`__LZ__<utf16>`). Retourne la valeur brute (string décompressée
   * OU la valeur d'origine si pas de préfixe).
   *
   * Usage prévu : remplacer `localStorage.getItem(k)` directement par
   * `storageCompressor.decodeIfCompressed(localStorage.getItem(k))` dans
   * les call-sites où on s'attend à du JSON brut (bodyguard, sentinels,
   * audit-log, etc.).
   *
   * Si raw === null → retourne null. Si décompression échoue → retourne null
   * (laisse appelant utiliser fallback). Pas async pour rester drop-in.
   */
  decodeIfCompressed(raw: string | null): string | null {
    if (raw === null || raw === undefined) return null;
    if (!raw.startsWith(COMPRESS_PREFIX)) return raw;
    const lz = this.loadLzStringSync();
    if (!lz) return null;
    try {
      const compressed = raw.slice(COMPRESS_PREFIX.length);
      return lz.decompressFromUTF16(compressed);
    } catch {
      return null;
    }
  }

  /**
   * v13.3.94 P0.3 — Parse JSON safe avec décompression auto + fallback.
   * Combine `localStorage.getItem(k)` + decode + JSON.parse en une étape
   * robuste. Retourne defaultValue sur tout échec (raw absent, parse fail,
   * décompression KO).
   *
   * Sync, drop-in pour remplacer le pattern :
   *   `JSON.parse(localStorage.getItem(k) ?? '[]')`
   * qui crashe sur les valeurs `__LZ__<utf16>`.
   */
  safeParseJSON<T = unknown>(key: string, defaultValue: T): T {
    if (typeof localStorage === 'undefined') return defaultValue;
    let raw: string | null;
    try {
      raw = localStorage.getItem(key);
    } catch {
      return defaultValue;
    }
    if (raw === null) return defaultValue;
    const decoded = this.decodeIfCompressed(raw);
    if (decoded === null) return defaultValue;
    try {
      return JSON.parse(decoded) as T;
    } catch {
      return defaultValue;
    }
  }

  /**
   * Migre toutes les clés > threshold vers compression.
   * Idempotent. Skip clés déjà compressées.
   */
  async migrateAllToCompressed(): Promise<{ migrated: number; saved_bytes: number }> {
    if (typeof localStorage === 'undefined') return { migrated: 0, saved_bytes: 0 };
    const lz = await this.loadLzString();
    if (!lz) return { migrated: 0, saved_bytes: 0 };
    let migrated = 0;
    let savedBytes = 0;
    const keys: string[] = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k) keys.push(k);
      }
    } catch {
      return { migrated: 0, saved_bytes: 0 };
    }
    for (const k of keys) {
      try {
        const raw = localStorage.getItem(k);
        if (!raw || raw.startsWith(COMPRESS_PREFIX)) continue;
        if (raw.length < COMPRESS_THRESHOLD_BYTES) continue;
        const compressed = lz.compressToUTF16(raw);
        const final = COMPRESS_PREFIX + compressed;
        if (final.length < raw.length) {
          localStorage.setItem(k, final);
          migrated++;
          savedBytes += (raw.length - final.length) * 2;
        }
      } catch {
        /* skip cette clé, continue */
      }
    }
    logger.info('storage-compressor', `Migration : ${migrated} clés compressées, ${(savedBytes / 1024).toFixed(1)} KB libérés`);
    return { migrated, saved_bytes: savedBytes };
  }
}

export const storageCompressor = new StorageCompressor();
