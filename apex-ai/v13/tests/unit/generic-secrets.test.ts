/**
 * Tests régression Generic Secrets (Kevin 2026-05-09 v13.3.98 P0.3)
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { genericSecrets, __test_helpers } from '../../services/vault/generic-secrets.js';
import { vault } from '../../services/vault/vault.js';

const { STORAGE_KEY, TRASH_KEY } = __test_helpers;

describe('Generic Secrets — catch-all P0.3', () => {
  beforeEach(async () => {
    localStorage.clear();
    await vault.setPassphrase('test-pass-12345');
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('add() chiffre + retourne id', async () => {
    const r = await genericSecrets.add('xyz-secret-token-1234567890', 'My token');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.id).toMatch(/^[a-f0-9-]+$|^gs_/);
    const all = genericSecrets.list();
    expect(all).toHaveLength(1);
    expect(all[0]?.label).toBe('My token');
    expect(all[0]?.cipher).toContain('AXENC');
  });

  it('add() refuse valeur < 8 chars', async () => {
    const r = await genericSecrets.add('abc');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain('Trop court');
  });

  it('add() refuse valeur vide', async () => {
    const r = await genericSecrets.add('   ');
    expect(r.ok).toBe(false);
  });

  it('add() label par défaut "Secret générique #N"', async () => {
    await genericSecrets.add('abcdefghij1234567890');
    await genericSecrets.add('zzzzzzzzzz1234567890');
    const all = genericSecrets.list();
    expect(all[0]?.label).toBe('Secret générique #1');
    expect(all[1]?.label).toBe('Secret générique #2');
  });

  it('reveal() decrypt + update lastUsed', async () => {
    const a = await genericSecrets.add('plain-text-secret-12345', 'Test');
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    const r = await genericSecrets.reveal(a.id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plaintext).toBe('plain-text-secret-12345');
    const updated = genericSecrets.list().find((g) => g.id === a.id);
    expect(updated?.lastUsed).toBeGreaterThan(0);
  });

  it('rename() change le label', async () => {
    const a = await genericSecrets.add('abc-token-1234567890', 'Old');
    if (!a.ok) return;
    expect(genericSecrets.rename(a.id, 'New name')).toBe(true);
    expect(genericSecrets.list()[0]?.label).toBe('New name');
  });

  it('remove() backup vers trash + remove main list', async () => {
    const a = await genericSecrets.add('abc-token-1234567890', 'ToDel');
    if (!a.ok) return;
    expect(genericSecrets.remove(a.id)).toBe(true);
    expect(genericSecrets.list()).toHaveLength(0);
    const trash = JSON.parse(localStorage.getItem(TRASH_KEY) ?? '[]') as Array<{ id: string }>;
    expect(trash.find((t) => t.id === a.id)).toBeDefined();
  });

  it('restore() depuis trash remet dans main list', async () => {
    const a = await genericSecrets.add('abc-token-1234567890', 'Resurrected');
    if (!a.ok) return;
    genericSecrets.remove(a.id);
    expect(genericSecrets.restore(a.id)).toBe(true);
    expect(genericSecrets.list().find((g) => g.id === a.id)).toBeDefined();
  });

  it('count() retourne le total', async () => {
    expect(genericSecrets.count()).toBe(0);
    await genericSecrets.add('aaaaaaaa1234567890');
    await genericSecrets.add('bbbbbbbb1234567890');
    expect(genericSecrets.count()).toBe(2);
  });

  it('storage_key constant = apex_v13_generic_secrets', () => {
    expect(STORAGE_KEY).toBe('apex_v13_generic_secrets');
  });
});

describe('Generic Secrets — fallback dans autoDetectAndStore', () => {
  beforeEach(async () => {
    localStorage.clear();
    await vault.setPassphrase('test-pass-12345');
  });

  it('autoDetectAndStore avec valeur >= 20 chars sans pattern → generic', async () => {
    const { autoDetectAndStore } = await import('../../features/vault/index.js');
    /* String 25 chars qui ne matche aucun pattern (pas de prefix sk-/AIza/etc.) */
    const value = 'random-blob-no-pattern-xyz';
    const r = await autoDetectAndStore(value);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect('generic' in r ? r.generic : false).toBe(true);
    expect(genericSecrets.count()).toBe(1);
  });

  it('autoDetectAndStore < 20 chars → reject', async () => {
    const { autoDetectAndStore } = await import('../../features/vault/index.js');
    const r = await autoDetectAndStore('short-token');
    expect(r.ok).toBe(false);
  });
});
