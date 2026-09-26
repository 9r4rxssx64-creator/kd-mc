/**
 * Tests credentials-rotation-watch (H5 audit fix v13.3.73).
 *
 * Vérifie politique 80j/90j :
 * 1. < 80j → severity ok
 * 2. 80-90j → warn (toast + push notif)
 * 3. > 90j → err (escalade ax_claude_todo)
 * 4. Scan multi-key-vault complet
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { credentialsRotationWatch } from '../../services/sentinels/credentials-rotation-watch.js';
import { multiKeyVault } from '../../services/vault/multi-key-vault.js';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('credentials-rotation-watch — H5 audit fix v13.3.73', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('classifyAge() — politique 80j/90j', () => {
    it('âge < 80j → severity ok', () => {
      const recent = Date.now() - 50 * DAY_MS;
      const r = credentialsRotationWatch.classifyAge(recent);
      expect(r.severity).toBe('ok');
      expect(r.ageDays).toBe(50);
    });

    it('âge 80-89j → severity warn', () => {
      const old85 = Date.now() - 85 * DAY_MS;
      const r = credentialsRotationWatch.classifyAge(old85);
      expect(r.severity).toBe('warn');
      expect(r.ageDays).toBe(85);
    });

    it('âge >= 90j → severity err', () => {
      const old95 = Date.now() - 95 * DAY_MS;
      const r = credentialsRotationWatch.classifyAge(old95);
      expect(r.severity).toBe('err');
      expect(r.ageDays).toBe(95);
    });

    it('addedAt=0 (legacy) → ageDays=0, ok', () => {
      const r = credentialsRotationWatch.classifyAge(0);
      expect(r.ageDays).toBe(0);
      expect(r.severity).toBe('ok');
    });
  });

  describe('run() — scan + escalade', () => {
    it('aucune clé ancienne → scanned > 0, warn=0, err=0', async () => {
      vi.spyOn(multiKeyVault, 'listKeys').mockReturnValue([
        {
          id: 'k_recent',
          service: 'anthropic',
          encrypted: 'AXENC1:...',
          addedAt: Date.now() - 5 * DAY_MS, /* 5j */
          status: 'active',
          failCount: 0,
          successCount: 0,
        },
      ]);
      const r = await credentialsRotationWatch.run();
      expect(r.warn_count).toBe(0);
      expect(r.err_count).toBe(0);
      expect(r.escalated).toBe(0);
    });

    it('clé > 90j → escalade ax_claude_todo + err_count=1', async () => {
      vi.spyOn(multiKeyVault, 'listKeys').mockImplementation((service: string) => {
        if (service === 'anthropic') {
          return [
            {
              id: 'k_old',
              service: 'anthropic',
              encrypted: 'AXENC1:...',
              addedAt: Date.now() - 100 * DAY_MS, /* 100j */
              status: 'active',
              failCount: 0,
              successCount: 0,
            },
          ];
        }
        return [];
      });

      const r = await credentialsRotationWatch.run();
      expect(r.err_count).toBeGreaterThanOrEqual(1);
      expect(r.escalated).toBeGreaterThanOrEqual(1);

      /* Verify ax_claude_todo populated */
      const todos = JSON.parse(localStorage.getItem('ax_claude_todo') ?? '[]');
      expect(Array.isArray(todos)).toBe(true);
      expect(todos.length).toBeGreaterThan(0);
      const ours = todos.find((t: { kind: string }) => t.kind === 'credential_rotation_required');
      expect(ours).toBeDefined();
      expect(ours.details.service).toBe('anthropic');
      expect(ours.details.age_days).toBeGreaterThanOrEqual(90);
    });

    it('clé 80-89j → warn_count=1, no escalade', async () => {
      vi.spyOn(multiKeyVault, 'listKeys').mockImplementation((service: string) => {
        if (service === 'github') {
          return [
            {
              id: 'k_warn',
              service: 'github',
              encrypted: 'AXENC1:...',
              addedAt: Date.now() - 85 * DAY_MS,
              status: 'active',
              failCount: 0,
              successCount: 0,
            },
          ];
        }
        return [];
      });
      const r = await credentialsRotationWatch.run();
      expect(r.warn_count).toBeGreaterThanOrEqual(1);
      expect(r.err_count).toBe(0);
      expect(r.escalated).toBe(0);
    });
  });
});
