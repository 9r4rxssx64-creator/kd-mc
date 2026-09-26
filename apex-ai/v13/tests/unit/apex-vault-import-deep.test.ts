/**
 * APEX v13 — Tests deep apex-vault-import (couvrir tous les paths)
 *
 * Cible : pousser services/apex-vault-import.ts vers 100% lines + branches.
 * Couvre : JSON parse error, format entries[], format vault{}, plain (no AXENC1:),
 * decrypt fail, setKey fail, throw, file picker cancel, FileReader error.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/vault/vault.js', () => ({
  vault: {
    setKey: vi.fn(async () => ({ ok: true })),
    decryptAuto: vi.fn(async (s: string) => (s.startsWith('AXENC1:') ? 'plain-' + s.slice(7) : s)),
  },
}));

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import { apexVaultImport } from '../../services/vault/apex-vault-import.js';
import { vault } from '../../services/vault/vault.js';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('apex-vault-import — importFromJson parse errors', () => {
  it('JSON invalide → ok=false avec error', async () => {
    const r = await apexVaultImport.importFromJson('not-json{');
    expect(r.ok).toBe(false);
    expect(r.restored).toBe(0);
    expect(r.error).toMatch(/JSON parse failed/);
  });

  it('JSON vide {} → ok=false (0 restored)', async () => {
    const r = await apexVaultImport.importFromJson('{}');
    expect(r.ok).toBe(false);
    expect(r.restored).toBe(0);
  });
});

describe('apex-vault-import — format entries[] snake_case', () => {
  it('restore une entry valide AXENC1:', async () => {
    const json = JSON.stringify({
      version: 1,
      entries: [{ storage_key: 'ax_test', value_encrypted: 'AXENC1:abc123' }],
    });
    const r = await apexVaultImport.importFromJson(json);
    expect(r.restored).toBe(1);
    expect(r.failed).toBe(0);
    expect(r.ok).toBe(true);
    expect(vault.setKey).toHaveBeenCalledWith('ax_test', 'plain-abc123');
  });

  it('restore une entry plain (no AXENC1: prefix)', async () => {
    const json = JSON.stringify({
      entries: [{ storage_key: 'ax_plain', value_encrypted: 'mySecret' }],
    });
    const r = await apexVaultImport.importFromJson(json);
    expect(r.restored).toBe(1);
    expect(vault.setKey).toHaveBeenCalledWith('ax_plain', 'mySecret');
  });

  it('skip entry sans storage_key', async () => {
    const json = JSON.stringify({
      entries: [{ value_encrypted: 'AXENC1:abc' }],
    });
    const r = await apexVaultImport.importFromJson(json);
    expect(r.restored).toBe(0);
    expect(r.failed).toBe(1);
  });

  it('skip entry sans value_encrypted', async () => {
    const json = JSON.stringify({
      entries: [{ storage_key: 'ax_x' }],
    });
    const r = await apexVaultImport.importFromJson(json);
    expect(r.failed).toBe(1);
  });
});

describe('apex-vault-import — format entries[] camelCase fallback', () => {
  it('accepte storageKey + encrypted (camelCase)', async () => {
    const json = JSON.stringify({
      entries: [{ storageKey: 'ax_camel', encrypted: 'AXENC1:zzz' }],
    });
    const r = await apexVaultImport.importFromJson(json);
    expect(r.restored).toBe(1);
  });

  it('accepte encryptedValue alias', async () => {
    const json = JSON.stringify({
      entries: [{ storage_key: 'ax_alias', encryptedValue: 'AXENC1:xxx' }],
    });
    const r = await apexVaultImport.importFromJson(json);
    expect(r.restored).toBe(1);
  });
});

describe('apex-vault-import — format multiKeys legacy', () => {
  it('lit multiKeys[] si entries[] absent', async () => {
    const json = JSON.stringify({
      multiKeys: [{ storage_key: 'ax_legacy', value_encrypted: 'AXENC1:legacy' }],
    });
    const r = await apexVaultImport.importFromJson(json);
    expect(r.restored).toBe(1);
  });
});

describe('apex-vault-import — format vault{} (legacy)', () => {
  it('restore entries depuis vault object', async () => {
    const json = JSON.stringify({
      vault: { ax_old1: 'AXENC1:foo', ax_old2: 'AXENC1:bar' },
    });
    const r = await apexVaultImport.importFromJson(json);
    expect(r.restored).toBe(2);
  });

  it('skip vault entry vide string', async () => {
    const json = JSON.stringify({
      vault: { ax_empty: '' },
    });
    const r = await apexVaultImport.importFromJson(json);
    expect(r.failed).toBe(1);
  });

  it('skip vault entry non-string', async () => {
    const json = JSON.stringify({
      vault: { ax_num: 42 },
    });
    const r = await apexVaultImport.importFromJson(json);
    expect(r.failed).toBe(1);
  });

  it('decrypt failed → decrypt_failed++', async () => {
    (vault.decryptAuto as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const json = JSON.stringify({
      vault: { ax_fail: 'AXENC1:badcipher' },
    });
    const r = await apexVaultImport.importFromJson(json);
    expect(r.decrypt_failed).toBe(1);
  });

  it('vault decryptAuto throw → failed++', async () => {
    (vault.decryptAuto as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('crypto'));
    const json = JSON.stringify({
      vault: { ax_throw: 'AXENC1:crash' },
    });
    const r = await apexVaultImport.importFromJson(json);
    expect(r.failed).toBe(1);
  });
});

describe('apex-vault-import — entries decrypt + setKey errors', () => {
  it('decryptAuto null → decrypt_failed++', async () => {
    (vault.decryptAuto as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const json = JSON.stringify({
      entries: [{ storage_key: 'ax_x', value_encrypted: 'AXENC1:bad' }],
    });
    const r = await apexVaultImport.importFromJson(json);
    expect(r.decrypt_failed).toBe(1);
    expect(r.restored).toBe(0);
  });

  it('decryptAuto throw → decrypt_failed++ (logged)', async () => {
    (vault.decryptAuto as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('crypto-fail'));
    const json = JSON.stringify({
      entries: [{ storage_key: 'ax_x', value_encrypted: 'AXENC1:bad' }],
    });
    const r = await apexVaultImport.importFromJson(json);
    expect(r.decrypt_failed).toBe(1);
  });

  it('setKey ok=false → failed++', async () => {
    (vault.setKey as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false });
    const json = JSON.stringify({
      entries: [{ storage_key: 'ax_setfail', value_encrypted: 'plain' }],
    });
    const r = await apexVaultImport.importFromJson(json);
    expect(r.failed).toBe(1);
  });

  it('setKey throw → failed++', async () => {
    (vault.setKey as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('setk'));
    const json = JSON.stringify({
      entries: [{ storage_key: 'ax_setth', value_encrypted: 'plain' }],
    });
    const r = await apexVaultImport.importFromJson(json);
    expect(r.failed).toBe(1);
  });

  it('mix succès + failures → totaux corrects', async () => {
    (vault.setKey as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false });
    const json = JSON.stringify({
      entries: [
        { storage_key: 'ax_a', value_encrypted: 'p1' },
        { storage_key: 'ax_b', value_encrypted: 'p2' },
      ],
    });
    const r = await apexVaultImport.importFromJson(json);
    expect(r.restored).toBe(1);
    expect(r.failed).toBe(1);
    expect(r.ok).toBe(true);
  });
});

describe('apex-vault-import — promptAndImport file picker', () => {
  it('cancellation (no file selected) → cancelled:true', async () => {
    const promise = apexVaultImport.promptAndImport();
    /* Simule événement change sans fichier */
    setTimeout(() => {
      const inp = document.body.querySelector<HTMLInputElement>('input[type="file"]');
      if (inp) {
        Object.defineProperty(inp, 'files', { value: null, configurable: true });
        inp.dispatchEvent(new Event('change'));
      }
    }, 10);
    const r = await promise;
    expect(r.cancelled).toBe(true);
    expect(r.restored).toBe(0);
  });

  it('avec fichier valide → import roundtrip', async () => {
    const blob = new Blob([JSON.stringify({ entries: [{ storage_key: 'ax_a', value_encrypted: 'AXENC1:test' }] })], { type: 'application/json' });
    const file = new File([blob], 'backup.json', { type: 'application/json' });

    const promise = apexVaultImport.promptAndImport();
    setTimeout(() => {
      const inp = document.body.querySelector<HTMLInputElement>('input[type="file"]');
      if (inp) {
        Object.defineProperty(inp, 'files', { value: [file], configurable: true });
        inp.dispatchEvent(new Event('change'));
      }
    }, 10);
    const r = await promise;
    expect(r.restored).toBe(1);
    expect(r.ok).toBe(true);
  });

  it('FileReader error → ok=false avec error msg', async () => {
    /* Mock File qui throw au readAsText */
    const file = new File(['unused'], 'bad.json', { type: 'application/json' });
    /* Override FileReader prototype temporarily */
    const origReadAsText = FileReader.prototype.readAsText;
    FileReader.prototype.readAsText = function () {
      setTimeout(() => {
        if (this.onerror) this.onerror(new ProgressEvent('error'));
      }, 5);
    };
    try {
      const promise = apexVaultImport.promptAndImport();
      setTimeout(() => {
        const inp = document.body.querySelector<HTMLInputElement>('input[type="file"]');
        if (inp) {
          Object.defineProperty(inp, 'files', { value: [file], configurable: true });
          inp.dispatchEvent(new Event('change'));
        }
      }, 10);
      const r = await promise;
      expect(r.ok).toBe(false);
      expect(r.error).toBeTruthy();
    } finally {
      FileReader.prototype.readAsText = origReadAsText;
    }
  });
});
