/**
 * Tests features/vault (port v12 vVault).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  autoDetectAndStore,
  escapeHtml,
  exportVaultJson,
  filterVaultEntries,
  listVaultEntries,
  removeCredential,
} from '../../features/vault/index.js';

describe('features/vault — escapeHtml', () => {
  it('échappe < > & " \'', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
    expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
    expect(escapeHtml("L'apostrophe")).toBe('L&#39;apostrophe');
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });
});

describe('features/vault — listVaultEntries', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it('retourne au moins 20 entrées (130+ patterns réels)', () => {
    const entries = listVaultEntries();
    expect(entries.length).toBeGreaterThanOrEqual(20);
  });

  it('chaque entrée a pattern.name + pattern.storageKey + status', () => {
    const entries = listVaultEntries();
    for (const e of entries) {
      expect(e.pattern.name).toBeTruthy();
      expect(e.pattern.storageKey).toMatch(/^(ax_|apex_)/);
      expect(['empty', 'configured', 'encrypted', 'plaintext_legacy']).toContain(e.status);
    }
  });

  it('exclut les patterns "forbidden" (cartes/seed)', () => {
    const entries = listVaultEntries();
    for (const e of entries) {
      expect(e.pattern.category).not.toBe('forbidden');
    }
  });

  it('marque empty si rien dans localStorage', () => {
    const entries = listVaultEntries();
    /* Au reset, tous empty */
    expect(entries.every((e) => e.status === 'empty')).toBe(true);
  });

  it('marque plaintext_legacy si valeur sans préfixe AXENC1:', () => {
    localStorage.setItem('ax_anthropic_key', 'sk-ant-api03-xxx');
    const entries = listVaultEntries();
    const ant = entries.find((e) => e.pattern.storageKey === 'ax_anthropic_key');
    expect(ant?.status).toBe('plaintext_legacy');
  });

  it('marque encrypted si AXENC1: présent', () => {
    localStorage.setItem('ax_openai_key', 'AXENC1:{"v":1,"iv":"...","ct":"...","salt":"..."}');
    const entries = listVaultEntries();
    const oai = entries.find((e) => e.pattern.storageKey === 'ax_openai_key');
    expect(oai?.status).toBe('encrypted');
  });
});

describe('features/vault — filterVaultEntries', () => {
  it('filtre par catégorie', () => {
    const all = listVaultEntries();
    const ai = filterVaultEntries(all, { category: 'ai' });
    expect(ai.length).toBeGreaterThan(0);
    expect(ai.every((e) => e.pattern.category === 'ai')).toBe(true);
  });

  it('filtre configuredOnly exclut les empty', () => {
    localStorage.clear();
    localStorage.setItem('ax_anthropic_key', 'sk-ant-api03-xxx');
    const all = listVaultEntries();
    const conf = filterVaultEntries(all, { configuredOnly: true });
    expect(conf.every((e) => e.status !== 'empty')).toBe(true);
  });

  it('filtre par query (case insensitive sur name + storageKey)', () => {
    const all = listVaultEntries();
    const filtered = filterVaultEntries(all, { query: 'anthropic' });
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered[0]?.pattern.name.toLowerCase()).toContain('anthropic');
  });

  it('combine filtres (catégorie + query)', () => {
    const all = listVaultEntries();
    const filtered = filterVaultEntries(all, { category: 'ai', query: 'open' });
    for (const e of filtered) {
      expect(e.pattern.category).toBe('ai');
      const matches = e.pattern.name.toLowerCase().includes('open') || e.pattern.storageKey.toLowerCase().includes('open');
      expect(matches).toBe(true);
    }
  });

  it('retourne [] sur query qui ne match rien', () => {
    const all = listVaultEntries();
    expect(filterVaultEntries(all, { query: 'zzz_no_match_xyz' })).toEqual([]);
  });
});

describe('features/vault — autoDetectAndStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it('rejette entrée vide', async () => {
    const r = await autoDetectAndStore('   ');
    expect(r.ok).toBe(false);
  });

  it('rejette pattern non reconnu', async () => {
    const r = await autoDetectAndStore('random-text-xyz');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('reconnu');
  });

  it('détecte et stocke clé Anthropic', async () => {
    const fakeKey = 'sk-ant-api03-' + 'a'.repeat(60);
    const r = await autoDetectAndStore(fakeKey);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.pattern_name).toBe('Anthropic');
      expect(r.storage_key).toBe('ax_anthropic_key');
    }
    /* Doit être chiffré */
    const stored = localStorage.getItem('ax_anthropic_key');
    expect(stored).toMatch(/^AXENC1:/);
  });

  it('refuse les patterns forbidden (cartes)', async () => {
    /* Pattern carte Visa : 16 chiffres (peut matcher un pattern forbidden) */
    const r = await autoDetectAndStore('4111 1111 1111 1111');
    /* Soit non reconnu, soit catégorie forbidden : dans les 2 cas ok=false */
    expect(r.ok).toBe(false);
  });
});

describe('features/vault — removeCredential', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('supprime une clé existante', () => {
    localStorage.setItem('ax_anthropic_key', 'value');
    expect(removeCredential('ax_anthropic_key')).toBe(true);
    expect(localStorage.getItem('ax_anthropic_key')).toBeNull();
  });

  it('return true même sur clé inexistante (idempotent)', () => {
    expect(removeCredential('ax_does_not_exist_yet')).toBe(true);
  });
});

describe('features/vault — exportVaultJson', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('exporte JSON valide avec metadata', () => {
    localStorage.setItem('ax_anthropic_key', 'AXENC1:{"v":1}');
    const entries = listVaultEntries();
    const json = exportVaultJson(entries);
    const parsed = JSON.parse(json) as { exported_at: string; version: number; entries: unknown[] };
    expect(parsed.version).toBe(1);
    expect(parsed.exported_at).toBeTruthy();
    expect(Array.isArray(parsed.entries)).toBe(true);
  });

  it('exclut les entrées empty (économise espace)', () => {
    const entries = listVaultEntries();
    const json = exportVaultJson(entries);
    const parsed = JSON.parse(json) as { entries: unknown[] };
    /* Toutes empty (localStorage vide) → entries[] court */
    expect(parsed.entries.length).toBe(0);
  });

  it('inclut les entrées configurées', () => {
    localStorage.setItem('ax_anthropic_key', 'AXENC1:fake');
    const entries = listVaultEntries();
    const json = exportVaultJson(entries);
    const parsed = JSON.parse(json) as { entries: Array<{ name: string }> };
    expect(parsed.entries.length).toBeGreaterThanOrEqual(1);
    expect(parsed.entries.find((e) => e.name === 'Anthropic')).toBeTruthy();
  });
});
