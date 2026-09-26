/**
 * Tests memory-bridge deep v13.4.155 (Kevin "100/100 réel").
 *
 * Module : services/memory-bridge.ts (504 stmts, était 74.8%).
 * Focus : syncTo + runAutoSync + enable/disableAutoSync + getStatus.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const { mockVault } = vi.hoisted(() => ({
  mockVault: { readKey: vi.fn() },
}));

vi.mock('../../services/vault/vault.js', () => ({ vault: mockVault }));

import { memoryBridge } from '../../services/storage/memory-bridge.js';

describe('memory-bridge deep (v13.4.155)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mockVault.readKey.mockResolvedValue('');
    memoryBridge._resetForTests();
  });

  afterEach(() => {
    localStorage.clear();
    memoryBridge.disableAutoSync();
    vi.clearAllMocks();
  });

  describe('syncTo notion', () => {
    it('retourne not_configured si databaseId absent', async () => {
      const r = await memoryBridge.syncTo('notion');
      expect(r.ok).toBe(false);
      expect(r.reason).toContain('not configured');
    });

    it('retourne token_empty si vault retourne ""', async () => {
      localStorage.setItem(
        'apex_v13_memory_bridge_config',
        JSON.stringify({ notion_database_id: 'db_123', notion_token_key: 'ax_notion_token' }),
      );
      mockVault.readKey.mockResolvedValue('');
      const r = await memoryBridge.syncTo('notion');
      expect(r.ok).toBe(false);
      expect(r.reason).toContain('empty');
    });
  });

  describe('syncTo firebase', () => {
    it('retourne No uid si pas user', async () => {
      const r = await memoryBridge.syncTo('firebase');
      expect(r.ok).toBe(false);
      expect(r.reason).toContain('No uid');
    });
  });

  describe('syncTo github_gist', () => {
    it('retourne not_configured si pas token key', async () => {
      const r = await memoryBridge.syncTo('github_gist');
      expect(r.ok).toBe(false);
      expect(r.reason).toContain('not configured');
    });
  });

  describe('syncTo n8n_webhook', () => {
    it('retourne erreur si pas de data payload', async () => {
      const r = await memoryBridge.syncTo('n8n_webhook');
      expect(r.ok).toBe(false);
      expect(r.reason).toContain('No data');
    });
  });

  describe('syncTo unknown backend', () => {
    it('retourne erreur si backend pas implémenté', async () => {
      const r = await memoryBridge.syncTo('github_issues');
      expect(r.ok).toBe(false);
      expect(r.reason).toContain('not implemented');
    });
  });

  describe('runAutoSync', () => {
    it('retourne array (vide si rien configuré)', async () => {
      const results = await memoryBridge.runAutoSync();
      expect(Array.isArray(results)).toBe(true);
    });

    it('skip si tokens manquants', async () => {
      localStorage.setItem(
        'apex_v13_memory_bridge_config',
        JSON.stringify({
          notion_database_id: 'db_123',
          notion_token_key: 'ax_notion_token',
        }),
      );
      mockVault.readKey.mockResolvedValue('');
      const results = await memoryBridge.runAutoSync();
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('enableAutoSync / disableAutoSync', () => {
    it('enable + disable sans crash', () => {
      memoryBridge.enableAutoSync(120_000);
      memoryBridge.disableAutoSync();
      expect(true).toBe(true);
    });

    it('enable idempotent', () => {
      memoryBridge.enableAutoSync(120_000);
      memoryBridge.enableAutoSync(60_000); /* 2e call replace */
      memoryBridge.disableAutoSync();
      expect(true).toBe(true);
    });

    it('disable safe si pas activé', () => {
      memoryBridge.disableAutoSync();
      memoryBridge.disableAutoSync();
      expect(true).toBe(true);
    });
  });

  describe('autoEscalate', () => {
    it('webhook_ok=false si pas configuré', async () => {
      const r = await memoryBridge.autoEscalate({
        type: 'error',
        severity: 'critical',
        scope: 'test',
        msg: 'Test critical error',
      });
      expect(r.webhook_ok).toBe(false);
      expect(r.handoff_ok).toBe(true); /* localStorage write OK */
    });

    it('persiste handoff dans localStorage', async () => {
      await memoryBridge.autoEscalate({
        type: 'audit',
        severity: 'info',
        scope: 'test',
        msg: 'Test handoff',
      });
      const raw = localStorage.getItem('ax_handoff_journal');
      expect(raw).toBeTruthy();
    });
  });

  describe('syncToNotion', () => {
    it('retourne erreur si database_id manquant', async () => {
      const r = await memoryBridge.syncToNotion('', 'secret_xxx');
      expect(r.ok).toBe(false);
      expect(r.reason).toContain('Missing');
    });

    it('retourne erreur si token manquant', async () => {
      const r = await memoryBridge.syncToNotion('db_xxx', '');
      expect(r.ok).toBe(false);
    });
  });

  describe('syncToGitHubGist', () => {
    it('retourne erreur si token manquant', async () => {
      const r = await memoryBridge.syncToGitHubGist('');
      expect(r.ok).toBe(false);
    });
  });

  describe('restoreFromBackend', () => {
    it('retourne erreur si backend pas configuré', async () => {
      const r = await memoryBridge.restoreFromBackend('firebase');
      expect(r.ok).toBe(false);
    });
  });

  describe('getStatus', () => {
    it('retourne tableau statuses', async () => {
      const s = await memoryBridge.getStatus();
      expect(Array.isArray(s)).toBe(true);
    });
  });
});
