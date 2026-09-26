/**
 * Test régression v13.4.62 — services/auto-restore-credentials.ts.
 *
 * Audit + restauration auto coffre (5 sources cascade) :
 *   localStorage → IDB shadow → Firebase backup → alias → pattern_match.
 *
 * Critique pour règle Kevin "Apex garde son coffre en mémoire c'est sûr ?"
 */
import { describe, it, expect } from 'vitest';
import {
  autoRestoreCredentials,
  ALIAS_GROUPS_EXPORT,
} from '../../services/vault/auto-restore-credentials.js';

describe('v13.4.62 auto-restore-credentials — API publique', () => {
  it("singleton défini avec 4 méthodes attendues", () => {
    expect(autoRestoreCredentials).toBeDefined();
    expect(typeof autoRestoreCredentials.boot).toBe('function');
    expect(typeof autoRestoreCredentials.auditMissing).toBe('function');
    expect(typeof autoRestoreCredentials.restoreAutomatically).toBe('function');
    expect(typeof autoRestoreCredentials.getStats).toBe('function');
  });

  it("boot() idempotent (multi-call)", async () => {
    await expect(autoRestoreCredentials.boot()).resolves.toBeUndefined();
    await expect(autoRestoreCredentials.boot()).resolves.toBeUndefined();
  });

  it("auditMissing() retourne AuditMissingResult structuré", async () => {
    const r = await autoRestoreCredentials.auditMissing();
    expect(r).toBeDefined();
    expect(Array.isArray(r.missing)).toBe(true);
    expect(Array.isArray(r.recoverable)).toBe(true);
    expect(Array.isArray(r.truly_absent)).toBe(true);
    expect(typeof r.ts).toBe('number');
  });

  it("auditMissing() classification cohérente : missing == recoverable + truly_absent", async () => {
    const r = await autoRestoreCredentials.auditMissing();
    /* Tout missing doit être soit recoverable soit truly_absent (sommation cohérente) */
    expect(r.missing.length).toBe(r.recoverable.length + r.truly_absent.length);
  });

  it("restoreAutomatically() retourne RestoreReport structuré", async () => {
    const r = await autoRestoreCredentials.restoreAutomatically();
    expect(r).toBeDefined();
    expect(typeof r.ts).toBe('number');
    expect(typeof r.restored).toBe('number');
    expect(typeof r.failed).toBe('number');
    expect(Array.isArray(r.details)).toBe(true);
  });

  it("getStats() retourne stats publique 5 champs", async () => {
    const s = await autoRestoreCredentials.getStats();
    expect(s).toBeDefined();
    expect(typeof s.total_patterns).toBe('number');
    expect(typeof s.present_count).toBe('number');
    expect(typeof s.recoverable_count).toBe('number');
    expect(typeof s.truly_absent_count).toBe('number');
    expect(s.by_source).toBeDefined();
    expect(typeof s.by_source.localStorage).toBe('number');
    expect(typeof s.by_source.idb_shadow).toBe('number');
    expect(typeof s.by_source.firebase_backup).toBe('number');
    expect(typeof s.by_source.alias).toBe('number');
    expect(typeof s.by_source.pattern_match).toBe('number');
  });

  it("getStats() total_patterns > 0 (patterns CREDENTIAL_PATTERNS chargés)", async () => {
    const s = await autoRestoreCredentials.getStats();
    expect(s.total_patterns).toBeGreaterThan(20); /* 24+ patterns coffre */
  });
});

describe('v13.4.62 auto-restore-credentials — ALIAS_GROUPS export', () => {
  it("ALIAS_GROUPS_EXPORT est un array non-vide", () => {
    expect(Array.isArray(ALIAS_GROUPS_EXPORT)).toBe(true);
    expect(ALIAS_GROUPS_EXPORT.length).toBeGreaterThan(0);
  });

  it("Chaque groupe alias est un array de strings", () => {
    for (const group of ALIAS_GROUPS_EXPORT) {
      expect(Array.isArray(group)).toBe(true);
      expect(group.length).toBeGreaterThanOrEqual(2); /* alias = ≥2 clés équivalentes */
      for (const key of group) {
        expect(typeof key).toBe('string');
        expect(key.length).toBeGreaterThan(0);
      }
    }
  });
});
