/**
 * Test régression Erreur #58 CLAUDE.md (Kevin 2026-05-15 — pattern Erreur #28 reproduit).
 *
 * Bug v13.4.117 : exportVaultJson écrit snake_case (storage_key, value_encrypted)
 * mais apex-vault-import.ts cherchait camelCase → "Aucune clé restaurée".
 *
 * Hotfix v13.4.121 : importer support snake_case ET camelCase fallback.
 *
 * Ce test verrouille le roundtrip : export → import → vérif équivalence.
 * Si ce test fail un jour, c'est que le format de sérialisation a drifté
 * sans migration importer.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { exportVaultJson } from '../../features/vault/index.js';
import { apexVaultImport } from '../../services/vault/apex-vault-import.js';
import type { VaultEntry } from '../../features/vault/index.js';

/* Mock vault.setKey + vault.decryptAuto pour ne pas dépendre du flow PIN admin */
vi.mock('../../services/vault/vault.js', () => ({
  vault: {
    setKey: vi.fn().mockResolvedValue({ ok: true }),
    decryptAuto: vi.fn().mockImplementation(async (encrypted: string) => {
      /* Retourne le texte après "AXENC1:" ou la valeur directement (plain) */
      if (encrypted.startsWith('AXENC1:')) {
        return 'mock-decrypted-plain-' + encrypted.slice(7, 17);
      }
      return encrypted;
    }),
  },
}));

vi.mock('../../core/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Vault Export/Import Roundtrip (Erreur #58 regression guard)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('exportVaultJson produit snake_case (storage_key, value_encrypted)', () => {
    const entries: VaultEntry[] = [
      {
        pattern: {
          storageKey: 'ax_anthropic_key',
          name: 'Anthropic',
          service: 'anthropic',
          regex: /sk-ant-/,
          icon: '🤖',
          color: '#000',
        },
        status: 'ok',
        preview: 'sk-ant-xxxx',
      } as unknown as VaultEntry,
    ];
    localStorage.setItem('ax_anthropic_key', 'AXENC1:abcdef123456');
    const json = exportVaultJson(entries);
    const parsed = JSON.parse(json) as {
      version: number;
      exported_at: string;
      entries: Array<{ storage_key: string; name: string; value_encrypted: string }>;
    };
    expect(parsed.version).toBe(1);
    expect(parsed.entries).toHaveLength(1);
    /* CRITIQUE : c'est snake_case, pas camelCase (Erreur #58 root cause) */
    expect(parsed.entries[0]).toHaveProperty('storage_key', 'ax_anthropic_key');
    expect(parsed.entries[0]).toHaveProperty('value_encrypted', 'AXENC1:abcdef123456');
    expect(parsed.entries[0]).not.toHaveProperty('storageKey');
    expect(parsed.entries[0]).not.toHaveProperty('encrypted');
    expect(parsed.entries[0]).not.toHaveProperty('encryptedValue');
  });

  it('importFromJson lit format snake_case (export actuel v13.4.121+)', async () => {
    const json = JSON.stringify({
      version: 1,
      exported_at: new Date().toISOString(),
      entries: [
        {
          storage_key: 'ax_anthropic_key',
          name: 'Anthropic',
          value_encrypted: 'AXENC1:abcdef123456',
        },
        {
          storage_key: 'ax_openai_key',
          name: 'OpenAI',
          value_encrypted: 'AXENC1:fedcba654321',
        },
      ],
    });
    const r = await apexVaultImport.importFromJson(json);
    expect(r.ok).toBe(true);
    expect(r.restored).toBe(2);
    expect(r.failed).toBe(0);
    expect(r.decrypt_failed).toBe(0);
  });

  it('importFromJson lit format camelCase legacy (rétrocompat)', async () => {
    const json = JSON.stringify({
      version: 1,
      exported_at: new Date().toISOString(),
      entries: [
        {
          storageKey: 'ax_legacy_key',
          name: 'Legacy',
          encrypted: 'AXENC1:legacy123',
        },
        {
          storageKey: 'ax_legacy2',
          name: 'Legacy2',
          encryptedValue: 'AXENC1:legacy456',
        },
      ],
    });
    const r = await apexVaultImport.importFromJson(json);
    expect(r.ok).toBe(true);
    expect(r.restored).toBe(2);
  });

  it('importFromJson ROUNDTRIP : export → re-import = même nombre de clés', async () => {
    /* 1. Setup vault avec 3 clés */
    localStorage.setItem('ax_anthropic_key', 'AXENC1:anthropic-payload-x');
    localStorage.setItem('ax_openai_key', 'AXENC1:openai-payload-y');
    localStorage.setItem('ax_github_token', 'AXENC1:github-payload-z');

    const entries: VaultEntry[] = [
      {
        pattern: { storageKey: 'ax_anthropic_key', name: 'Anthropic' },
        status: 'ok',
      },
      {
        pattern: { storageKey: 'ax_openai_key', name: 'OpenAI' },
        status: 'ok',
      },
      {
        pattern: { storageKey: 'ax_github_token', name: 'GitHub' },
        status: 'ok',
      },
    ] as unknown as VaultEntry[];

    /* 2. Export */
    const exported = exportVaultJson(entries);
    expect(JSON.parse(exported).entries).toHaveLength(3);

    /* 3. Clear vault */
    localStorage.clear();

    /* 4. Re-import depuis export */
    const r = await apexVaultImport.importFromJson(exported);

    /* 5. Vérification : les 3 clés ont été restaurées */
    expect(r.ok).toBe(true);
    expect(r.restored).toBe(3);
    expect(r.failed).toBe(0);
  });

  it('importFromJson : entries[] vide → ok=false (zéro restored)', async () => {
    const json = JSON.stringify({
      version: 1,
      exported_at: new Date().toISOString(),
      entries: [],
    });
    const r = await apexVaultImport.importFromJson(json);
    expect(r.ok).toBe(false);
    expect(r.restored).toBe(0);
  });

  it('importFromJson : JSON invalide → ok=false + error', async () => {
    const r = await apexVaultImport.importFromJson('{not valid json');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/JSON parse failed/i);
  });

  it('importFromJson : entry sans storage_key ET sans storageKey → skip + failed++', async () => {
    const json = JSON.stringify({
      entries: [
        {
          /* MAUVAIS : pas de storage_key ni storageKey */
          value_encrypted: 'AXENC1:orphan',
        },
      ],
    });
    const r = await apexVaultImport.importFromJson(json);
    expect(r.failed).toBe(1);
    expect(r.restored).toBe(0);
  });

  it('importFromJson : valeur PLAIN (sans AXENC1:) → setKey direct sans decrypt', async () => {
    /* Cas legacy : vault export sans chiffrement (rare mais supporté) */
    const json = JSON.stringify({
      entries: [
        {
          storage_key: 'ax_plain_key',
          value_encrypted: 'plain-text-value-no-encrypt-prefix',
        },
      ],
    });
    const r = await apexVaultImport.importFromJson(json);
    expect(r.ok).toBe(true);
    expect(r.restored).toBe(1);
    expect(r.decrypt_failed).toBe(0);
  });
});
