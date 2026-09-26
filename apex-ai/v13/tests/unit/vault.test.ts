import { describe, it, expect } from 'vitest';
import { vault } from '../../services/vault/vault.js';

describe('vault.detectPattern', () => {
  it('détecte clé Anthropic', () => {
    const r = vault.detectPattern('sk-ant-api03-' + 'A'.repeat(50));
    expect(r?.name).toBe('Anthropic');
    expect(r?.key).toBe('ax_anthropic_key');
  });

  it('détecte clé OpenAI', () => {
    const r = vault.detectPattern('sk-' + 'B'.repeat(48));
    expect(r?.name).toBe('OpenAI');
  });

  it('détecte GitHub PAT', () => {
    const r = vault.detectPattern('ghp_' + 'C'.repeat(36));
    expect(r?.name).toMatch(/GitHub PAT/);
    expect(r?.key).toBe('ax_github_pat_classic');
  });

  it('retourne null sur valeur inconnue', () => {
    expect(vault.detectPattern('hello world')).toBeNull();
  });
});

describe('vault.encrypt/decrypt', () => {
  it('round-trip OK avec bonne passphrase', async () => {
    const enc = await vault.encrypt('mon-secret-123', 'pass1234');
    const dec = await vault.decrypt(enc, 'pass1234');
    expect(dec).toBe('mon-secret-123');
  });

  it('CRITIQUE: retourne null sur mauvaise passphrase (jamais le payload)', async () => {
    const enc = await vault.encrypt('mon-secret', 'good-pass');
    const dec = await vault.decrypt(enc, 'wrong-pass');
    expect(dec).toBeNull();
  });

  it('retourne null sur format invalide', async () => {
    const dec = await vault.decrypt('not-an-encrypted-payload', 'any');
    expect(dec).toBeNull();
  });
});
