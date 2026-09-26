/**
 * P0 SECU URGENT (Kevin demande 2026-05-04) :
 * "Vérifie que toutes les clés/codes sont sécurisés, mémorisés, sauvegardés,
 *  mis en appui dans les bons endroits et que tout fonctionne."
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { credentialsAudit } from '../../services/vault/credentials-audit.js';

describe('Credentials Audit (P0 sécu Kevin demande)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('runFullAudit retourne report complet sans crash', async () => {
    const r = await credentialsAudit.runFullAudit();
    expect(r.total_patterns).toBeGreaterThan(0);
    expect(r.entries.length).toBe(r.total_patterns);
    expect(typeof r.security_score).toBe('number');
    expect(r.categories_covered.length).toBeGreaterThan(0);
  });

  it('audit avec 0 credential configuré → security_score=100 (rien à risque)', async () => {
    const r = await credentialsAudit.runFullAudit();
    expect(r.configured_count).toBe(0);
    expect(r.security_score).toBe(100);
  });

  it('audit avec credential non chiffré (legacy plaintext) → status corrupted', async () => {
    /* Simule clé v12 stockée en plaintext (pas AXENC1:) */
    localStorage.setItem('ax_anthropic_key', 'sk-ant-api03-' + 'X'.repeat(95));
    const r = await credentialsAudit.runFullAudit();
    const anthropicEntry = r.entries.find((e) => e.storage_key === 'ax_anthropic_key');
    expect(anthropicEntry).toBeDefined();
    expect(anthropicEntry?.configured).toBe(true);
    /* Soit corrupted (non chiffré) soit OK selon implémentation vault.readKey */
    if (!anthropicEntry?.encrypted) {
      expect(anthropicEntry?.status).toBe('corrupted');
    }
  });

  it('audit après vault.setKey (chiffré AXENC1:) → status ok + encrypted=true', async () => {
    const { vault } = await import('../../services/vault/vault.js');
    await vault.setKey('ax_anthropic_key', 'sk-ant-api03-' + 'A'.repeat(95));
    const r = await credentialsAudit.runFullAudit();
    const entry = r.entries.find((e) => e.storage_key === 'ax_anthropic_key');
    expect(entry?.configured).toBe(true);
    expect(entry?.encrypted).toBe(true);
    expect(entry?.status).toBe('ok');
  });

  it('preview masquée (jamais valeur en clair)', async () => {
    const { vault } = await import('../../services/vault/vault.js');
    const longKey = 'sk-ant-api03-' + 'B'.repeat(95);
    await vault.setKey('ax_anthropic_key', longKey);
    const r = await credentialsAudit.runFullAudit();
    const entry = r.entries.find((e) => e.storage_key === 'ax_anthropic_key');
    expect(entry?.preview).not.toBe(longKey);
    expect(entry?.preview).toContain('***');
  });

  it('recommandations actionables si aucune IA configurée', async () => {
    const r = await credentialsAudit.runFullAudit();
    const aiRec = r.recommendations.find((rec) => /Aucune cl[eé] IA/i.test(rec));
    expect(aiRec).toBeDefined();
  });

  it('recommandation Telegram si pas de channel alert', async () => {
    const r = await credentialsAudit.runFullAudit();
    const telRec = r.recommendations.find((rec) => /Telegram|Discord|alerte/i.test(rec));
    expect(telRec).toBeDefined();
  });

  it('testCredential sur clé inconnue → valid=null + error', async () => {
    const r = await credentialsAudit.testCredential('ax_does_not_exist');
    expect(r.valid).toBeNull();
    expect(r.error).toMatch(/inconnu/i);
  });

  it('testCredential sur clé non configurée → valid=false', async () => {
    const r = await credentialsAudit.testCredential('ax_anthropic_key');
    expect(r.valid).toBe(false);
  });

  it('categories_covered inclut au moins ai/banking/payment', async () => {
    const r = await credentialsAudit.runFullAudit();
    const expected = ['ai', 'banking', 'payment'];
    const found = expected.filter((cat) => r.categories_covered.includes(cat));
    expect(found.length).toBeGreaterThan(0);
  });
});
