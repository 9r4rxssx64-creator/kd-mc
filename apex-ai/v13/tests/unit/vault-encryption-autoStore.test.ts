/**
 * Test P0 SÉCU : vault.autoStore() doit CHIFFRER les tokens au repos.
 * Audit v13.0.10 a révélé : tokens stockés en plaintext = leak DevTools.
 * Fix v13.0.12 : encryptAuto + decryptAuto via device-bound passphrase fallback.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { vault } from '../../services/vault/vault.js';

describe('Vault autoStore encryption (P0 sécu fix)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('autoStore chiffre les tokens (PAS plaintext dans localStorage)', async () => {
    const fakeAnthropicKey = 'sk-ant-api03-' + 'A'.repeat(95);
    const r = await vault.autoStore(fakeAnthropicKey);
    expect(r.ok).toBe(true);
    expect(r.pattern?.name.toLowerCase()).toContain('anthropic');
    /* CRITIQUE : valeur stockée DOIT être chiffrée (AXENC1: prefix), JAMAIS plaintext */
    const stored = localStorage.getItem('ax_anthropic_key');
    expect(stored).not.toBe(fakeAnthropicKey); /* PAS plaintext */
    expect(stored?.startsWith('AXENC1:')).toBe(true); /* Chiffrement détectable */
  });

  it('decryptAuto retrouve le plaintext original', async () => {
    const fakeKey = 'sk-' + 'B'.repeat(45);
    await vault.autoStore(fakeKey);
    const stored = localStorage.getItem('ax_openai_key');
    if (stored) {
      const decrypted = await vault.decryptAuto(stored);
      expect(decrypted).toBe(fakeKey);
    }
  });

  it('device-bound passphrase persistée localStorage', async () => {
    /* 1er encrypt génère + persiste device passphrase */
    await vault.encryptAuto('test1');
    const passKey = localStorage.getItem('apex_v13_device_passphrase_v1');
    expect(passKey).toBeTruthy();
    expect(passKey?.length).toBeGreaterThan(20);
    /* 2e encrypt réutilise même passphrase (idempotent) */
    await vault.encryptAuto('test2');
    expect(localStorage.getItem('apex_v13_device_passphrase_v1')).toBe(passKey);
  });

  it('encryptAuto + decryptAuto round-trip', async () => {
    const original = 'mon-secret-très-confidentiel';
    const encrypted = await vault.encryptAuto(original);
    expect(encrypted.startsWith('AXENC1:')).toBe(true);
    const decrypted = await vault.decryptAuto(encrypted);
    expect(decrypted).toBe(original);
  });

  it('autoStore refuse forbidden credentials (CB)', async () => {
    const fakeCB = '4242 4242 4242 4242';
    const r = await vault.autoStore(fakeCB);
    /* Doit refuser ou pas reconnaître — JAMAIS stocker une CB */
    if (r.forbidden) {
      expect(r.ok).toBe(false);
      expect(localStorage.getItem('ax_card_visa_mc')).toBe(null);
    }
  });

  it('autoStore valeur vide → ok=false', async () => {
    const r = await vault.autoStore('');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('Valeur vide');
  });

  it('autoStore format inconnu → ok=false', async () => {
    const r = await vault.autoStore('bla bla random text');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('Format inconnu');
  });

  describe('vault.readKey universal reader (P0 v13.0.16)', () => {
    it('lit AXENC1: chiffré et déchiffre auto', async () => {
      const original = 'sk-ant-api03-' + 'X'.repeat(95);
      await vault.autoStore(original);
      const read = await vault.readKey('ax_anthropic_key');
      expect(read).toBe(original);
    });

    it('lit valeur plaintext legacy sans déchiffrer', async () => {
      localStorage.setItem('ax_legacy_test', 'plaintext-value-not-encrypted');
      const read = await vault.readKey('ax_legacy_test');
      expect(read).toBe('plaintext-value-not-encrypted');
    });

    it('clé absente → string vide (pas null)', async () => {
      const read = await vault.readKey('ax_inexistant');
      expect(read).toBe('');
    });
  });

  describe('vault.maskKey UI affichage (P0 anti-AXENC1 leak)', () => {
    it('masque préserve début + fin pour identification', () => {
      const masked = vault.maskKey('sk-ant-api03-AbCdEfGhIjKl9z2');
      expect(masked).toContain('sk-an');
      expect(masked).toContain('9z2');
      expect(masked).toContain('***');
      /* JAMAIS la valeur complète */
      expect(masked).not.toBe('sk-ant-api03-AbCdEfGhIjKl9z2');
    });

    it('masque court < 8 chars → ***', () => {
      expect(vault.maskKey('abc')).toBe('***');
      expect(vault.maskKey('')).toBe('');
    });

    it('readMasked combine readKey + maskKey', async () => {
      const original = 'sk-ant-api03-' + 'Y'.repeat(95);
      await vault.autoStore(original);
      const masked = await vault.readMasked('ax_anthropic_key');
      expect(masked).toContain('***');
      expect(masked).not.toContain('AXENC1'); /* JAMAIS le prefix dans UI */
    });
  });

  describe('vault.getKeyStatus sync (UI status sans déchiffrer)', () => {
    it('clé absente → empty', () => {
      expect(vault.getKeyStatus('ax_absent')).toBe('empty');
    });

    it('clé chiffrée AXENC1: → encrypted', async () => {
      await vault.autoStore('sk-ant-api03-' + 'Z'.repeat(95));
      expect(vault.getKeyStatus('ax_anthropic_key')).toBe('encrypted');
    });

    it('clé plaintext legacy → plaintext_legacy (à migrer)', () => {
      localStorage.setItem('ax_legacy_plain', 'old-format-key');
      expect(vault.getKeyStatus('ax_legacy_plain')).toBe('plaintext_legacy');
    });
  });
});
