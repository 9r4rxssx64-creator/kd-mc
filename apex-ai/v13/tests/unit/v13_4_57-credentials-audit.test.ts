/**
 * Test régression v13.4.57 — services/credentials-audit.ts (sync vault → registry).
 *
 * Audit complet des credentials : ok/missing/corrupted/expired/decrypt_failed.
 * syncFromVault rapproche vault chiffré et registry visible Kevin admin.
 */
import { describe, it, expect } from 'vitest';
import { credentialsAudit } from '../../services/vault/credentials-audit.js';

describe('v13.4.57 credentials-audit — types + API', () => {
  it("singleton défini avec méthodes attendues", () => {
    expect(credentialsAudit).toBeDefined();
    expect(typeof credentialsAudit.runFullAudit).toBe('function');
    expect(typeof credentialsAudit.syncFromVault).toBe('function');
    expect(typeof credentialsAudit.readRegistry).toBe('function');
    expect(typeof credentialsAudit.testCredential).toBe('function');
  });

  it("readRegistry retourne objet", () => {
    const r = credentialsAudit.readRegistry();
    expect(r).toBeDefined();
    expect(typeof r).toBe('object');
  });

  it("runFullAudit retourne CredentialsAuditReport structure", async () => {
    const r = await credentialsAudit.runFullAudit();
    expect(r).toBeDefined();
    expect(typeof r).toBe('object');
  });

  it("syncFromVault retourne {ok, total, configured, ts}", async () => {
    const r = await credentialsAudit.syncFromVault();
    expect(r).toBeDefined();
    expect(typeof r.ok).toBe('boolean');
    expect(typeof r.total).toBe('number');
    expect(typeof r.configured).toBe('number');
    expect(typeof r.ts).toBe('number');
  });

  it("testCredential signature présente (async)", () => {
    expect(typeof credentialsAudit.testCredential).toBe('function');
  });
});
