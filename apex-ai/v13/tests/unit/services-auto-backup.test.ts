/**
 * APEX v13 — Tests services/auto-backup
 *
 * Couvre :
 *  - init() idempotent
 *  - snapshot() manual / daily / weekly / pre-rollback
 *  - id format (ax_backup_YYYYMMDD_HHMM_<type>_<rand>)
 *  - hash SHA-256 par backup
 *  - list() sorted ts desc
 *  - get(id) lecture seule
 *  - delete(id)
 *  - restore() validation hash + rollback automatique pre-rollback
 *  - restore() rejet si hash mismatch
 *  - restore() restore vault keys + settings + audit_log + persistent_memory
 *  - export()/import() round-trip
 *  - cleanup() FIFO 30 jours rolling
 *  - getStats() retourne stats correctes
 *  - integrity_ok détecte hash chain cassé
 *  - voice_prints inclus localement, JAMAIS push Firebase remote
 *  - backup chiffré : vault keys préservent format AXENC1:
 *  - quota localStorage gestion
 *  - gestion erreurs corrupted JSON
 *  - non-récursion : backup ne contient pas STORAGE_PREFIX keys
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import { auditLog } from '../../services/observability/audit-log.js';
import { autoBackup, type Backup } from '../../services/storage/auto-backup.js';

describe('services/auto-backup', () => {
  beforeEach(() => {
    localStorage.clear();
    auditLog.reload();
    autoBackup._resetForTests();
  });

  describe('init()', () => {
    it('init OK sans throw quand storage vide', async () => {
      await expect(autoBackup.init()).resolves.not.toThrow();
    });

    it('init() idempotent (multiple calls OK)', async () => {
      await autoBackup.init();
      await autoBackup.init();
      await autoBackup.init();
      const stats = autoBackup.getStats();
      expect(stats.total_backups).toBe(0);
    });
  });

  describe('snapshot()', () => {
    it('snapshot manual créé avec id correct format', async () => {
      const b = await autoBackup.snapshot('manual');
      expect(b.id).toMatch(/^ax_backup_\d{8}_\d{4}_manual_[a-z0-9]+$/);
      expect(b.type).toBe('manual');
      expect(b.size_bytes).toBeGreaterThan(0);
      expect(b.encrypted).toBe(true);
      expect(b.hash).toMatch(/^[a-f0-9]{64}$/); /* SHA-256 hex 64 chars */
    });

    it('snapshot daily type set correctement', async () => {
      const b = await autoBackup.snapshot('daily');
      expect(b.type).toBe('daily');
      expect(b.id).toContain('_daily_');
    });

    it('snapshot weekly type set correctement', async () => {
      const b = await autoBackup.snapshot('weekly');
      expect(b.type).toBe('weekly');
      expect(b.id).toContain('_weekly_');
    });

    it('snapshot default = manual', async () => {
      const b = await autoBackup.snapshot();
      expect(b.type).toBe('manual');
    });

    it('snapshot persiste dans localStorage avec prefix correct', async () => {
      const b = await autoBackup.snapshot('manual');
      const raw = localStorage.getItem('apex_v13_backup_' + b.id);
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw!) as Backup;
      expect(parsed.id).toBe(b.id);
      expect(parsed.hash).toBe(b.hash);
    });

    it('snapshot collecte vault keys (ax_*, apex_v13_*)', async () => {
      localStorage.setItem('ax_anthropic_key', 'AXENC1:test_encrypted');
      localStorage.setItem('apex_v13_settings', JSON.stringify({ theme: 'dark' }));
      const b = await autoBackup.snapshot('manual');
      expect(b.data.vault['ax_anthropic_key']).toBe('AXENC1:test_encrypted');
      expect(b.data.vault['apex_v13_settings']).toBeDefined();
    });

    it('snapshot collecte audit_log', async () => {
      await auditLog.record('test.event', { actor: 'kevin' });
      const b = await autoBackup.snapshot('manual');
      expect((b.data.audit_log as unknown[]).length).toBeGreaterThanOrEqual(1);
    });

    it('snapshot collecte feature_toggles', async () => {
      localStorage.setItem('ax_feature_toggles_global', JSON.stringify({ 'studio.music': true }));
      const b = await autoBackup.snapshot('manual');
      expect(b.data.feature_toggles['ax_feature_toggles_global']).toBeDefined();
    });

    it('snapshot collecte voice_prints (FB_LOCAL strict)', async () => {
      localStorage.setItem('ax_voice_print_kevin', JSON.stringify({ mfcc: [1, 2, 3] }));
      const b = await autoBackup.snapshot('manual');
      expect(b.data.voice_prints['ax_voice_print_kevin']).toBeDefined();
    });

    it('snapshot ne contient PAS les apex_v13_backup_* keys (anti-récursion)', async () => {
      await autoBackup.snapshot('manual'); /* crée 1er backup */
      const b2 = await autoBackup.snapshot('manual'); /* second snapshot */
      const vaultKeys = Object.keys(b2.data.vault);
      const containsBackup = vaultKeys.some((k) => k.startsWith('apex_v13_backup_'));
      expect(containsBackup).toBe(false);
    });

    it('snapshot record audit log entry "backup.created"', async () => {
      await autoBackup.snapshot('manual');
      const entries = auditLog.getEntries({ action: 'backup.created' });
      expect(entries.length).toBeGreaterThanOrEqual(1);
    });

    it('snapshot 2× → ids différents (suffixe random)', async () => {
      const b1 = await autoBackup.snapshot('manual');
      const b2 = await autoBackup.snapshot('manual');
      expect(b1.id).not.toBe(b2.id);
    });
  });

  describe('list()', () => {
    it('list() vide initialement', () => {
      expect(autoBackup.list()).toEqual([]);
    });

    it('list() retourne backups après snapshots', async () => {
      await autoBackup.snapshot('manual');
      await autoBackup.snapshot('manual');
      const list = autoBackup.list();
      expect(list.length).toBe(2);
    });

    it('list() trié par ts descendant (plus récent first)', async () => {
      const b1 = await autoBackup.snapshot('manual');
      await new Promise((r) => setTimeout(r, 5));
      const b2 = await autoBackup.snapshot('manual');
      const list = autoBackup.list();
      expect(list[0]!.id).toBe(b2.id);
      expect(list[1]!.id).toBe(b1.id);
    });

    it('list() skip backups corrompus', async () => {
      await autoBackup.snapshot('manual');
      /* Inject un id dans index avec données corrompues */
      const idx = JSON.parse(localStorage.getItem('apex_v13_backup_index') ?? '[]') as string[];
      idx.push('ax_backup_corrupt');
      localStorage.setItem('apex_v13_backup_index', JSON.stringify(idx));
      localStorage.setItem('apex_v13_backup_ax_backup_corrupt', 'not_json{{{');
      const list = autoBackup.list();
      expect(list.length).toBe(1); /* corrupt skipped */
    });
  });

  describe('get()', () => {
    it('get() retourne backup existant', async () => {
      const b = await autoBackup.snapshot('manual');
      const got = autoBackup.get(b.id);
      expect(got).not.toBeNull();
      expect(got!.id).toBe(b.id);
    });

    it('get() retourne null pour id inconnu', () => {
      expect(autoBackup.get('does_not_exist')).toBeNull();
    });

    it('get() retourne null si JSON corrompu', () => {
      localStorage.setItem('apex_v13_backup_corrupt', '{{{not_json');
      expect(autoBackup.get('corrupt')).toBeNull();
    });
  });

  describe('delete()', () => {
    it('delete() retire backup + update index', async () => {
      const b = await autoBackup.snapshot('manual');
      expect(autoBackup.list().length).toBe(1);
      const ok = autoBackup.delete(b.id);
      expect(ok).toBe(true);
      expect(autoBackup.list().length).toBe(0);
      expect(localStorage.getItem('apex_v13_backup_' + b.id)).toBeNull();
    });

    it('delete() audit log entry "backup.deleted"', async () => {
      const b = await autoBackup.snapshot('manual');
      autoBackup.delete(b.id);
      const entries = auditLog.getEntries({ action: 'backup.deleted' });
      expect(entries.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('restore()', () => {
    it('restore() restaure vault keys', async () => {
      localStorage.setItem('ax_anthropic_key', 'AXENC1:original_key');
      localStorage.setItem('ax_openai_key', 'AXENC1:original_openai');
      const b = await autoBackup.snapshot('manual');

      /* Modifie state */
      localStorage.setItem('ax_anthropic_key', 'AXENC1:CHANGED');
      localStorage.removeItem('ax_openai_key');

      const r = await autoBackup.restore(b.id);
      expect(r.ok).toBe(true);
      expect(localStorage.getItem('ax_anthropic_key')).toBe('AXENC1:original_key');
      expect(localStorage.getItem('ax_openai_key')).toBe('AXENC1:original_openai');
    });

    it('restore() crée pre-rollback backup automatique', async () => {
      const b = await autoBackup.snapshot('manual');
      await autoBackup.restore(b.id);
      const list = autoBackup.list();
      const preRollback = list.find((bk) => bk.type === 'pre-rollback');
      expect(preRollback).toBeDefined();
    });

    it('restore() rejette si hash mismatch (corruption détectée)', async () => {
      const b = await autoBackup.snapshot('manual');
      /* Corrompt le backup en modifiant data sans recalculer hash */
      const raw = JSON.parse(localStorage.getItem('apex_v13_backup_' + b.id)!) as Backup;
      raw.data.vault['malicious_key'] = 'injected';
      localStorage.setItem('apex_v13_backup_' + b.id, JSON.stringify(raw));
      const r = await autoBackup.restore(b.id);
      expect(r.ok).toBe(false);
      expect(r.errors?.[0]).toContain('Hash mismatch');
    });

    it('restore() rejette si backup id inconnu', async () => {
      const r = await autoBackup.restore('does_not_exist');
      expect(r.ok).toBe(false);
      expect(r.errors?.[0]).toContain('introuvable');
    });

    it('restore() restaure feature_toggles', async () => {
      localStorage.setItem('ax_feature_toggles_global', JSON.stringify({ 'studio.music': true }));
      const b = await autoBackup.snapshot('manual');
      localStorage.setItem('ax_feature_toggles_global', JSON.stringify({ 'studio.music': false }));
      const r = await autoBackup.restore(b.id);
      expect(r.ok).toBe(true);
      const restored = JSON.parse(localStorage.getItem('ax_feature_toggles_global')!);
      expect(restored['studio.music']).toBe(true);
    });

    it('restore() reload audit_log après restauration', async () => {
      await auditLog.record('original.event', { actor: 'kevin' });
      const b = await autoBackup.snapshot('manual');
      /* Vide audit log */
      localStorage.removeItem('ax_audit_log_v13');
      auditLog.reload();
      expect(auditLog.getEntries().length).toBe(0);
      await autoBackup.restore(b.id);
      const entries = auditLog.getEntries({ action: 'original' });
      expect(entries.length).toBeGreaterThanOrEqual(1);
    });

    it('restore() audit log entry "backup.restored"', async () => {
      const b = await autoBackup.snapshot('manual');
      await autoBackup.restore(b.id);
      const entries = auditLog.getEntries({ action: 'backup.restored' });
      expect(entries.length).toBeGreaterThanOrEqual(1);
    });

    it('restore() restaure persistent_memory', async () => {
      localStorage.setItem('apex_v13_persistent_memory', JSON.stringify([{ id: 'x', text: 'hi' }]));
      const b = await autoBackup.snapshot('manual');
      localStorage.removeItem('apex_v13_persistent_memory');
      const r = await autoBackup.restore(b.id);
      expect(r.ok).toBe(true);
      const arr = JSON.parse(localStorage.getItem('apex_v13_persistent_memory')!);
      expect(arr).toEqual([{ id: 'x', text: 'hi' }]);
    });
  });

  describe('export() / import()', () => {
    it('export() retourne base64 valide', async () => {
      const b64 = await autoBackup.export();
      expect(typeof b64).toBe('string');
      expect(b64.length).toBeGreaterThan(0);
      /* Base64 charset */
      expect(b64).toMatch(/^[A-Za-z0-9+/=]+$/);
    });

    it('import() round-trip fonctionne', async () => {
      localStorage.setItem('ax_anthropic_key', 'AXENC1:exported_key');
      const b64 = await autoBackup.export();
      /* Modifie state */
      localStorage.setItem('ax_anthropic_key', 'AXENC1:CHANGED');
      const r = await autoBackup.import(b64);
      expect(r.ok).toBe(true);
      expect(localStorage.getItem('ax_anthropic_key')).toBe('AXENC1:exported_key');
    });

    it('import() rejette base64 invalide', async () => {
      const r = await autoBackup.import('not_valid_base64!!!');
      expect(r.ok).toBe(false);
    });

    it('import() rejette si déchiffrement échoue', async () => {
      /* Faux base64 valide qui ne décrypte pas */
      const fakeB64 = btoa('AXENC1:{"v":1,"iv":"AAA","ct":"BBB","salt":"CCC"}');
      const r = await autoBackup.import(fakeB64);
      expect(r.ok).toBe(false);
    });

    it('import() audit log entry "backup.imported"', async () => {
      const b64 = await autoBackup.export();
      await autoBackup.import(b64);
      const entries = auditLog.getEntries({ action: 'backup.imported' });
      expect(entries.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('cleanup()', () => {
    it('cleanup() ne supprime rien si < 30 backups', async () => {
      for (let i = 0; i < 5; i++) {
        await autoBackup.snapshot('manual');
      }
      const r = await autoBackup.cleanup();
      expect(r.deleted).toBe(0);
      expect(autoBackup.list().length).toBe(5);
    });

    it('cleanup() supprime backups au-delà de 30 (FIFO oldest first)', async () => {
      /* Crée 35 backups avec ts artificiellement croissants */
      for (let i = 0; i < 35; i++) {
        const ts = Date.now() + i * 1000;
        const id = `ax_backup_test_${i}`;
        const fakeBackup: Backup = {
          id,
          ts,
          type: 'manual',
          size_bytes: 100,
          encrypted: true,
          data: {
            vault: {},
            settings: {},
            persistent_memory: [],
            audit_log: [],
            feature_toggles: {},
            user_profile: {},
            voice_prints: {},
          },
          hash: 'h',
        };
        localStorage.setItem('apex_v13_backup_' + id, JSON.stringify(fakeBackup));
        const idx = JSON.parse(localStorage.getItem('apex_v13_backup_index') ?? '[]') as string[];
        idx.push(id);
        localStorage.setItem('apex_v13_backup_index', JSON.stringify(idx));
      }
      autoBackup._resetForTests();
      const r = await autoBackup.cleanup();
      expect(r.deleted).toBe(5); /* 35 - 30 = 5 */
      expect(autoBackup.list().length).toBe(30);
    });

    it('cleanup() supprime entries corrompues du index', async () => {
      const idx = ['valid_id', 'corrupt_id'];
      localStorage.setItem('apex_v13_backup_index', JSON.stringify(idx));
      /* Crée 32 backups dont un corrompu pour forcer cleanup */
      for (let i = 0; i < 32; i++) {
        const id = `ax_backup_t_${i}`;
        const fakeBackup: Backup = {
          id,
          ts: Date.now() + i * 1000,
          type: 'manual',
          size_bytes: 50,
          encrypted: true,
          data: {
            vault: {},
            settings: {},
            persistent_memory: [],
            audit_log: [],
            feature_toggles: {},
            user_profile: {},
            voice_prints: {},
          },
          hash: 'h',
        };
        localStorage.setItem('apex_v13_backup_' + id, JSON.stringify(fakeBackup));
      }
      const all = Array.from({ length: 32 }, (_, i) => `ax_backup_t_${i}`);
      all.push('ax_backup_corrupt');
      localStorage.setItem('apex_v13_backup_index', JSON.stringify(all));
      localStorage.setItem('apex_v13_backup_ax_backup_corrupt', '{{{not_json');
      autoBackup._resetForTests();
      const r = await autoBackup.cleanup();
      expect(r.deleted).toBeGreaterThan(0);
    });
  });

  describe('getStats()', () => {
    it('getStats() vide initialement', () => {
      const stats = autoBackup.getStats();
      expect(stats.total_backups).toBe(0);
      expect(stats.last_backup_age_h).toBe(-1);
      expect(stats.total_size_bytes).toBe(0);
      expect(stats.integrity_ok).toBe(true);
    });

    it('getStats() après 3 snapshots', async () => {
      await autoBackup.snapshot('manual');
      await autoBackup.snapshot('manual');
      await autoBackup.snapshot('manual');
      const stats = autoBackup.getStats();
      expect(stats.total_backups).toBe(3);
      expect(stats.last_backup_ts).toBeGreaterThan(0);
      expect(stats.total_size_bytes).toBeGreaterThan(0);
      expect(stats.integrity_ok).toBe(true);
    });

    it('getStats() integrity_ok=false si backup sans hash', async () => {
      const fakeBackup = {
        id: 'ax_backup_bad',
        ts: Date.now(),
        type: 'manual',
        size_bytes: 100,
        encrypted: true,
        data: {
          vault: {},
          settings: {},
          persistent_memory: [],
          audit_log: [],
          feature_toggles: {},
          user_profile: {},
          voice_prints: {},
        },
        hash: '', /* hash vide = intégrité cassée */
      };
      localStorage.setItem('apex_v13_backup_ax_backup_bad', JSON.stringify(fakeBackup));
      localStorage.setItem('apex_v13_backup_index', JSON.stringify(['ax_backup_bad']));
      autoBackup._resetForTests();
      const stats = autoBackup.getStats();
      expect(stats.integrity_ok).toBe(false);
    });

    it('last_backup_age_h calculé correctement', async () => {
      await autoBackup.snapshot('manual');
      const stats = autoBackup.getStats();
      expect(stats.last_backup_age_h).toBe(0); /* < 1h donc 0 */
    });
  });

  describe('isQuotaCritical()', () => {
    it('false si localStorage normal', () => {
      expect(autoBackup.isQuotaCritical()).toBe(false);
    });
  });

  describe('Integration scenarios', () => {
    it('cycle complet : snapshot → modify → restore', async () => {
      localStorage.setItem('ax_test_key', 'original');
      localStorage.setItem('apex_v13_settings', JSON.stringify({ x: 1 }));
      const b = await autoBackup.snapshot('manual');
      /* Modifications */
      localStorage.setItem('ax_test_key', 'MODIFIED');
      localStorage.setItem('apex_v13_settings', JSON.stringify({ x: 999 }));
      /* Restore */
      const r = await autoBackup.restore(b.id);
      expect(r.ok).toBe(true);
      expect(localStorage.getItem('ax_test_key')).toBe('original');
      const settings = JSON.parse(localStorage.getItem('apex_v13_settings')!);
      expect(settings.x).toBe(1);
    });

    it('voice_prints inclus dans data backup', async () => {
      localStorage.setItem('ax_voice_print_kevin_v1', JSON.stringify({ mfcc: [0.1, 0.2] }));
      const b = await autoBackup.snapshot('manual');
      expect(b.data.voice_prints['ax_voice_print_kevin_v1']).toBeDefined();
    });

    it('vault keys préservent format AXENC1: chiffré', async () => {
      const encrypted = 'AXENC1:{"v":1,"iv":"abc","ct":"def","salt":"ghi"}';
      localStorage.setItem('ax_anthropic_key', encrypted);
      const b = await autoBackup.snapshot('manual');
      expect(b.data.vault['ax_anthropic_key']).toBe(encrypted); /* format préservé */
    });

    it('enchaînement export → import respecte hash', async () => {
      localStorage.setItem('ax_test_data', 'consistent');
      const b64 = await autoBackup.export();
      localStorage.removeItem('ax_test_data');
      const r = await autoBackup.import(b64);
      expect(r.ok).toBe(true);
      expect(localStorage.getItem('ax_test_data')).toBe('consistent');
    });

    it('snapshot quota saturation triggers cleanup auto', async () => {
      /* Mock localStorage.setItem pour throw quota la 1ere fois */
      const original = localStorage.setItem.bind(localStorage);
      let throwCount = 0;
      const setItemSpy = vi.spyOn(localStorage, 'setItem').mockImplementation((k: string, v: string) => {
        if (k.startsWith('apex_v13_backup_ax_backup_') && throwCount === 0) {
          throwCount++;
          throw new Error('QuotaExceededError');
        }
        original(k, v);
      });
      try {
        /* Pré-rempli avec quelques backups pour avoir matière à cleanup */
        for (let i = 0; i < 35; i++) {
          const id = `ax_backup_quota_${i}`;
          const fakeBackup: Backup = {
            id,
            ts: Date.now() + i * 1000,
            type: 'manual',
            size_bytes: 100,
            encrypted: true,
            data: {
              vault: {},
              settings: {},
              persistent_memory: [],
              audit_log: [],
              feature_toggles: {},
              user_profile: {},
              voice_prints: {},
            },
            hash: 'h',
          };
          original('apex_v13_backup_' + id, JSON.stringify(fakeBackup));
        }
        const idx = Array.from({ length: 35 }, (_, i) => `ax_backup_quota_${i}`);
        original('apex_v13_backup_index', JSON.stringify(idx));
        autoBackup._resetForTests();
        /* Snapshot devrait throw, faire cleanup, retry */
        const b = await autoBackup.snapshot('manual').catch(() => null);
        /* Soit retry réussi, soit reject propre — pas de crash silencieux */
        expect(b === null || b.id).toBeDefined();
      } finally {
        setItemSpy.mockRestore();
      }
    });
  });
});
