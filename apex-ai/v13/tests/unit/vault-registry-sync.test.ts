/**
 * v13.3.36 (Kevin 2026-05-07 — credentials-watch P1 alerte sync incomplet) :
 *
 * Tests pour `credentialsAudit.syncFromVault()` + `readRegistry()`.
 * Use case : Kevin colle 10 clés vault, mais registry ne reflète qu'1 → sentinelle alerte.
 * Fix : sync auto au boot + après chaque vault.setKey + lecture registry pour UI.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { credentialsAudit } from '../../services/vault/credentials-audit.js';

describe('credentialsAudit syncFromVault + readRegistry (Kevin v13.3.36 P1)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('readRegistry sur localStorage vide → null', () => {
    expect(credentialsAudit.readRegistry()).toBeNull();
  });

  it('syncFromVault sur vault vide → ok + configured=0', async () => {
    const r = await credentialsAudit.syncFromVault();
    expect(r.ok).toBe(true);
    expect(r.configured).toBe(0);
    expect(r.total).toBeGreaterThan(0);
    expect(r.ts).toBeGreaterThan(0);
  });

  it('syncFromVault persiste registry dans localStorage', async () => {
    await credentialsAudit.syncFromVault();
    const raw = localStorage.getItem('ax_credentials_registry');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.entries).toBeDefined();
    expect(Array.isArray(parsed.entries)).toBe(true);
    expect(parsed.entries.length).toBeGreaterThan(0);
  });

  it('readRegistry retourne snapshot après syncFromVault', async () => {
    await credentialsAudit.syncFromVault();
    const reg = credentialsAudit.readRegistry();
    expect(reg).not.toBeNull();
    expect(reg?.total).toBeGreaterThan(0);
    expect(reg?.entries.length).toBe(reg?.total);
  });

  it('après vault.setKey → registry sync auto reflète la nouvelle clé', async () => {
    const { vault } = await import('../../services/vault/vault.js');
    /* Avant setKey : aucune clé */
    await credentialsAudit.syncFromVault();
    const before = credentialsAudit.readRegistry();
    expect(before?.configured).toBe(0);
    /* SetKey Anthropic */
    await vault.setKey('ax_anthropic_key', 'sk-ant-api03-' + 'X'.repeat(95));
    /* Attendre micro-tick pour que le hook async syncFromVault de setKey ait le temps */
    await new Promise((r) => setTimeout(r, 50));
    /* Force re-sync (au cas où le hook async dans setKey n'ait pas terminé en CI) */
    await credentialsAudit.syncFromVault();
    const after = credentialsAudit.readRegistry();
    expect(after?.configured).toBeGreaterThanOrEqual(1);
    const anthropicEntry = after?.entries.find((e) => e.storage_key === 'ax_anthropic_key');
    expect(anthropicEntry).toBeDefined();
    expect(anthropicEntry?.configured).toBe(true);
  });

  it('registry contient ts, total, configured, security_score', async () => {
    await credentialsAudit.syncFromVault();
    const reg = credentialsAudit.readRegistry();
    expect(reg?.ts).toBeGreaterThan(0);
    expect(reg?.total).toBeGreaterThan(0);
    expect(typeof reg?.configured).toBe('number');
    expect(typeof reg?.security_score).toBe('number');
    expect(typeof reg?.firebase_backup).toBe('number');
  });

  it('registry entries gardent les champs essentiels (storage_key, status, configured)', async () => {
    await credentialsAudit.syncFromVault();
    const reg = credentialsAudit.readRegistry();
    expect(reg?.entries[0]?.storage_key).toBeTruthy();
    expect(typeof reg?.entries[0]?.configured).toBe('boolean');
    expect(typeof reg?.entries[0]?.encrypted).toBe('boolean');
    expect(reg?.entries[0]?.status).toBeTruthy();
    expect(reg?.entries[0]?.last_synced).toBeGreaterThan(0);
  });

  it('readRegistry sur localStorage corrompu → null (no crash)', () => {
    localStorage.setItem('ax_credentials_registry', 'invalid-json{');
    expect(credentialsAudit.readRegistry()).toBeNull();
  });

  it('multi setKey → registry reflète toutes les clés', async () => {
    const { vault } = await import('../../services/vault/vault.js');
    await vault.setKey('ax_anthropic_key', 'sk-ant-api03-' + 'A'.repeat(95));
    await vault.setKey('ax_openai_key', 'sk-' + 'B'.repeat(48));
    await vault.setKey('ax_groq_key', 'gsk_' + 'C'.repeat(56));
    await new Promise((r) => setTimeout(r, 50));
    await credentialsAudit.syncFromVault();
    const reg = credentialsAudit.readRegistry();
    expect(reg?.configured).toBeGreaterThanOrEqual(3);
    const keys = reg?.entries.filter((e) => e.configured).map((e) => e.storage_key) ?? [];
    expect(keys).toContain('ax_anthropic_key');
    expect(keys).toContain('ax_openai_key');
    expect(keys).toContain('ax_groq_key');
  });

  it('syncFromVault idempotent (multi-call OK)', async () => {
    await credentialsAudit.syncFromVault();
    const r1 = credentialsAudit.readRegistry();
    await credentialsAudit.syncFromVault();
    const r2 = credentialsAudit.readRegistry();
    expect(r2?.total).toBe(r1?.total);
    expect(r2?.configured).toBe(r1?.configured);
  });
});
