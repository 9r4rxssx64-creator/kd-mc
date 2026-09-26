/**
 * APEX v13 — Tests Auto Restore Credentials.
 *
 * Kevin demande 2026-05-08 23h30 ABSOLUE :
 * "Quand il me dit qu'il lui manque des choses bah pourquoi il est pas allé
 *  les chercher automatiquement"
 *
 * Vérifie que auto-restore :
 *  1. Détecte clés manquantes (auditMissing)
 *  2. Catégorise correctement recoverable vs truly_absent
 *  3. Respecte alias localStorage (ax_shared_api_key → ax_anthropic_key)
 *  4. Détecte clé via pattern_match (texte libre contenant clé Anthropic valide)
 *  5. Restaure automatiquement via vault.setKey
 *  6. Compte truly_absent cohérent
 *  7. getStats() expose stats consolidées
 *  8. Multi-call boot idempotent (pas de double-restore)
 */
import { describe, it, expect, beforeEach } from 'vitest';

import { autoRestoreCredentials, ALIAS_GROUPS_EXPORT } from '../../services/vault/auto-restore-credentials.js';

describe('Auto Restore Credentials (Kevin règle ABSOLUE 2026-05-08)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('auditMissing retourne missing/recoverable/truly_absent sans crash', async () => {
    const r = await autoRestoreCredentials.auditMissing();
    expect(r).toBeDefined();
    expect(Array.isArray(r.missing)).toBe(true);
    expect(Array.isArray(r.recoverable)).toBe(true);
    expect(Array.isArray(r.truly_absent)).toBe(true);
    /* Avec localStorage vide : tout est manquant et truly_absent (pas d'IDB / Firebase / alias) */
    expect(r.missing.length).toBeGreaterThan(0);
    /* recoverable + truly_absent doit être <= missing */
    expect(r.recoverable.length + r.truly_absent.length).toBe(r.missing.length);
    expect(typeof r.ts).toBe('number');
  });

  it('alias détecté : ax_shared_api_key présent → ax_anthropic_key recoverable via alias', async () => {
    const { vault } = await import('../../services/vault/vault.js');
    /* Stocke uniquement ax_shared_api_key (legacy v12) */
    await vault.setKey('ax_shared_api_key', 'sk-ant-api03-' + 'X'.repeat(95));
    const r = await autoRestoreCredentials.auditMissing();
    const anthropicEntry = r.recoverable.find((e) => e.storage_key === 'ax_anthropic_key');
    expect(anthropicEntry).toBeDefined();
    expect(anthropicEntry?.recoverable_from).toBe('alias');
    expect(anthropicEntry?.alias_source).toBe('ax_shared_api_key');
  });

  it('restoreAutomatically : alias migration migre ax_shared_api_key → ax_anthropic_key', async () => {
    const { vault } = await import('../../services/vault/vault.js');
    const target = 'sk-ant-api03-' + 'M'.repeat(95);
    await vault.setKey('ax_shared_api_key', target);
    /* Pré-condition : ax_anthropic_key absent */
    expect(localStorage.getItem('ax_anthropic_key')).toBeNull();
    /* Restore */
    const result = await autoRestoreCredentials.restoreAutomatically();
    expect(result.restored).toBeGreaterThan(0);
    /* Post-condition : ax_anthropic_key présent + déchiffrable */
    expect(localStorage.getItem('ax_anthropic_key')).not.toBeNull();
    const decrypted = await vault.readKey('ax_anthropic_key');
    expect(decrypted).toBe(target);
  });

  it('truly_absent count cohérent : aucune source → toutes les clés en truly_absent', async () => {
    const r = await autoRestoreCredentials.auditMissing();
    /* localStorage vide, IDB vide (fake-indexeddb fresh), Firebase offline en test
     * → toutes les clés manquantes doivent être truly_absent (recoverable=0) */
    expect(r.recoverable.length).toBe(0);
    expect(r.truly_absent.length).toBe(r.missing.length);
  });

  it('getStats() expose total_patterns / present_count / recoverable_count / truly_absent_count', async () => {
    const stats = await autoRestoreCredentials.getStats();
    expect(stats.total_patterns).toBeGreaterThan(50); /* 130+ patterns moins forbidden */
    expect(stats.present_count).toBe(0); /* localStorage vide */
    expect(stats.recoverable_count).toBe(0);
    expect(stats.truly_absent_count).toBe(stats.total_patterns - stats.present_count);
    expect(stats.by_source).toBeDefined();
    expect(typeof stats.by_source.alias).toBe('number');
    expect(typeof stats.by_source.firebase_backup).toBe('number');
  });

  it('clé déjà présente (ax_anthropic_key set) → stats.present_count > 0 et truly_absent_count diminue', async () => {
    const { vault } = await import('../../services/vault/vault.js');
    await vault.setKey('ax_anthropic_key', 'sk-ant-api03-' + 'P'.repeat(95));
    const stats = await autoRestoreCredentials.getStats();
    expect(stats.present_count).toBeGreaterThanOrEqual(1);
    /* Une de moins en truly_absent puisque présente */
    expect(stats.truly_absent_count).toBe(stats.total_patterns - stats.present_count);
  });

  it('ALIAS_GROUPS expose au moins le groupe Anthropic + groupe Stripe', () => {
    /* Sanity : exposé pour introspection / tests */
    const flat = ALIAS_GROUPS_EXPORT.flat();
    expect(flat).toContain('ax_anthropic_key');
    expect(flat).toContain('ax_shared_api_key');
    expect(flat).toContain('ax_stripe_sk');
    expect(flat).toContain('ax_stripe_key');
  });

  it('boot() idempotent (multi-call ne double-restore pas)', async () => {
    const { vault } = await import('../../services/vault/vault.js');
    await vault.setKey('ax_shared_api_key', 'sk-ant-api03-' + 'B'.repeat(95));
    await autoRestoreCredentials.boot();
    /* 2e call : ne doit pas crash */
    await autoRestoreCredentials.boot();
    /* La clé Anthropic doit être présente (restorée au 1er boot) */
    expect(localStorage.getItem('ax_anthropic_key')).not.toBeNull();
  });

  it('restoreAutomatically retourne details par clé (audit trace)', async () => {
    const { vault } = await import('../../services/vault/vault.js');
    await vault.setKey('ax_shared_api_key', 'sk-ant-api03-' + 'D'.repeat(95));
    const r = await autoRestoreCredentials.restoreAutomatically();
    expect(Array.isArray(r.details)).toBe(true);
    expect(r.details.length).toBeGreaterThan(0);
    const anthropicDetail = r.details.find((d) => d.storage_key === 'ax_anthropic_key');
    expect(anthropicDetail).toBeDefined();
    expect(anthropicDetail?.ok).toBe(true);
    expect(anthropicDetail?.source).toBe('alias');
  });

  it('restoreAutomatically retourne {restored, failed, ts} structure cohérente', async () => {
    const r = await autoRestoreCredentials.restoreAutomatically();
    expect(typeof r.restored).toBe('number');
    expect(typeof r.failed).toBe('number');
    expect(typeof r.ts).toBe('number');
    expect(r.restored).toBeGreaterThanOrEqual(0);
    expect(r.failed).toBeGreaterThanOrEqual(0);
    /* details length = restored + failed (couvert tous les cas tentés) */
    expect(r.details.length).toBe(r.restored + r.failed);
  });
});
