/**
 * Tests profonds vault.ts (Jet 7.5 — coverage 59% → 90%+).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { vault } from '../../services/vault/vault.js';

describe('vault deep tests', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('setPassphrase + encrypt/decrypt round-trip', async () => {
    vault.setPassphrase('test-pass-1234');
    const enc = await vault.encrypt('mon secret');
    const dec = await vault.decrypt(enc);
    expect(dec).toBe('mon secret');
  });

  it('decrypt mauvaise passphrase → null', async () => {
    const enc = await vault.encrypt('secret', 'good');
    const dec = await vault.decrypt(enc, 'bad');
    expect(dec).toBeNull();
  });

  it('decrypt format invalide → null', async () => {
    const dec = await vault.decrypt('not-encrypted-at-all', 'any');
    expect(dec).toBeNull();
  });

  it('detectPattern Anthropic', () => {
    const r = vault.detectPattern('sk-ant-api03-' + 'A'.repeat(50));
    expect(r?.name).toMatch(/Anthropic/);
  });

  it('detectFull retourne pattern complet avec dashboard', () => {
    const r = vault.detectFull('sk-ant-api03-' + 'A'.repeat(50));
    expect(r?.dashboard).toContain('anthropic');
  });

  it('detectFull forbidden CB → category forbidden', () => {
    const r = vault.detectFull('4532 1234 5678 9010');
    expect(r?.category).toBe('forbidden');
  });

  it('autoStore valide stocke clé', async () => {
    const r = await vault.autoStore('sk-ant-api03-' + 'B'.repeat(50));
    expect(r.ok).toBe(true);
    expect(localStorage.getItem('ax_anthropic_key')).toBeTruthy();
  });

  it('autoStore forbidden refuse + flag', async () => {
    const r = await vault.autoStore('4532 1234 5678 9010');
    expect(r.ok).toBe(false);
    expect(r.forbidden).toBe(true);
  });

  it('autoStore valeur vide refuse', async () => {
    const r = await vault.autoStore('   ');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('vide');
  });

  it('autoStore format inconnu refuse', async () => {
    const r = await vault.autoStore('hello world random');
    expect(r.ok).toBe(false);
  });

  it('autoStore enrichit ax_links_registry avec dashboard', async () => {
    await vault.autoStore('gsk_' + 'X'.repeat(45));
    const registry = JSON.parse(localStorage.getItem('ax_links_registry') ?? '{}');
    expect(registry.ax_groq_key).toBeDefined();
    expect(registry.ax_groq_key.dashboard).toContain('groq');
  });
});
