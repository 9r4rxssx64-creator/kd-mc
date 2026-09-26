/**
 * Tests SOC2 compliance + Secret Scanner (Sécurité 18→20).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { soc2 } from '../../services/auth/soc2-compliance.js';
import { secretScanner } from '../../services/vault/secret-scanner.js';

describe('SOC2 Compliance', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('record events', () => {
    it('record auth.login_success → category security', async () => {
      await soc2.record('auth.login_success', 'kdmc_admin', { method: 'pin' });
      const events = soc2.list();
      expect(events.length).toBe(1);
      expect(events[0]?.category).toBe('security');
    });

    it('record vault.token_stored → confidentiality', async () => {
      await soc2.record('vault.token_stored', 'kdmc_admin', { service: 'anthropic' });
      const events = soc2.list({ category: 'confidentiality' });
      expect(events.length).toBe(1);
    });

    it('record pii.export_requested → privacy', async () => {
      await soc2.record('pii.export_requested', 'user1', {});
      const events = soc2.list({ category: 'privacy' });
      expect(events.length).toBe(1);
    });

    it('events ont id + ts + hash + prev_hash', async () => {
      await soc2.record('auth.login_success', 'u1');
      const events = soc2.list();
      const e = events[0];
      expect(e?.id).toBeTruthy();
      expect(e?.ts).toBeGreaterThan(0);
      expect(e?.hash).toBeTruthy();
      expect(e?.prev_hash).toBe('0');
    });
  });

  describe('hash chain integrity', () => {
    it('verify integrity OK chaîne intacte', async () => {
      await soc2.record('auth.login_success', 'u1');
      await soc2.record('vault.token_accessed', 'u1');
      await soc2.record('pii.data_accessed', 'u1');
      const r = await soc2.verifyIntegrity();
      expect(r.ok).toBe(true);
      expect(r.total).toBe(3);
    });

    it('hash chain : chaque event prev_hash = hash event précédent', async () => {
      await soc2.record('auth.login_success', 'u1');
      await soc2.record('auth.login_failure', 'u1');
      const events = soc2.list();
      expect(events[1]?.prev_hash).toBe(events[0]?.hash);
    });

    it('tamper détecté si entry modifié', async () => {
      await soc2.record('auth.login_success', 'u1');
      await soc2.record('auth.login_success', 'u2');
      /* Tamper : modifier hash du 1er event */
      const log = JSON.parse(localStorage.getItem('apex_v13_soc2_log') ?? '[]');
      log[0].details = { tampered: true };
      localStorage.setItem('apex_v13_soc2_log', JSON.stringify(log));
      const r = await soc2.verifyIntegrity();
      expect(r.ok).toBe(false);
    });
  });

  describe('list filters', () => {
    it('filter par uid', async () => {
      await soc2.record('auth.login_success', 'kevin');
      await soc2.record('auth.login_success', 'laurence');
      const events = soc2.list({ uid: 'kevin' });
      expect(events.length).toBe(1);
    });

    it('filter par sinceMs', async () => {
      await soc2.record('auth.login_success', 'u1');
      const tomorrow = Date.now() + 86400000;
      const future = soc2.list({ sinceMs: tomorrow });
      expect(future.length).toBe(0);
    });
  });

  describe('getStats', () => {
    it('total + by_category + last_24h + retention_days', async () => {
      await soc2.record('auth.login_success', 'u1');
      await soc2.record('vault.token_stored', 'u1');
      const stats = soc2.getStats();
      expect(stats.total).toBe(2);
      expect(stats.by_category.security).toBe(1);
      expect(stats.by_category.confidentiality).toBe(1);
      expect(stats.last_24h).toBe(2);
      expect(stats.retention_days).toBe(365);
    });
  });

  describe('exportLog', () => {
    it('retourne JSON serialisable', async () => {
      await soc2.record('auth.login_success', 'u1');
      const json = soc2.exportLog();
      expect(typeof json).toBe('string');
      const parsed = JSON.parse(json);
      expect(Array.isArray(parsed)).toBe(true);
    });
  });
});

describe('Secret Scanner', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('scan', () => {
    it('scan vide → 0 leaks', async () => {
      const leaks = await secretScanner.scan();
      expect(leaks.length).toBe(0);
    });

    it('détecte clé Anthropic plaintext', async () => {
      const fakeAnthropic = 'sk-ant-api03-' + 'X'.repeat(95);
      localStorage.setItem('ax_anthropic_key', fakeAnthropic);
      const leaks = await secretScanner.scan();
      expect(leaks.length).toBeGreaterThan(0);
      const l = leaks.find((x) => x.pattern_name.includes('Anthropic'));
      expect(l).toBeDefined();
      expect(l?.is_encrypted).toBe(false);
    });

    it('AXENC1: chiffré → skip (pas leak)', async () => {
      localStorage.setItem('ax_anthropic_key', 'AXENC1:{"v":1,"iv":"abc","ct":"xyz","salt":"def"}');
      const leaks = await secretScanner.scan();
      const anthropicLeak = leaks.find((l) => l.pattern_name.includes('Anthropic'));
      expect(anthropicLeak).toBeUndefined();
    });

    it('preview masqué (pas full plaintext)', async () => {
      const fake = 'sk-' + 'A'.repeat(45);
      localStorage.setItem('ax_openai_key', fake);
      const leaks = await secretScanner.scan();
      const l = leaks[0];
      expect(l?.preview).toContain('***');
      expect(l?.preview).not.toBe(fake);
    });
  });

  describe('autoMigrate', () => {
    it('vide → 0 migrated', async () => {
      const r = await secretScanner.autoMigrate();
      expect(r.migrated).toBe(0);
    });

    it('migre plaintext → AXENC1 chiffré', async () => {
      const fakeAnthropic = 'sk-ant-api03-' + 'M'.repeat(95);
      localStorage.setItem('ax_anthropic_key', fakeAnthropic);
      const r = await secretScanner.autoMigrate();
      expect(r.migrated).toBeGreaterThanOrEqual(1);
      const after = localStorage.getItem('ax_anthropic_key');
      expect(after?.startsWith('AXENC1:')).toBe(true);
    });
  });

  describe('getStats', () => {
    it('structure attendue', async () => {
      const stats = await secretScanner.getStats();
      expect(stats).toHaveProperty('total_keys_scanned');
      expect(stats).toHaveProperty('leaks_count');
      expect(stats).toHaveProperty('by_severity');
      expect(stats.by_severity).toHaveProperty('critical');
      expect(stats.by_severity).toHaveProperty('high');
      expect(stats.by_severity).toHaveProperty('medium');
    });
  });
});
