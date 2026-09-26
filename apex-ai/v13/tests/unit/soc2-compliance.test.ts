/**
 * Tests services/soc2-compliance (Kevin v13.4.209 "Continu toujours pareil").
 *
 * Couvre SOC2Compliance class :
 * - record (hash chain + retention 365j + quota fallback)
 * - list avec filter (category, type, uid, sinceMs)
 * - verifyIntegrity (tamper detection)
 * - getStats (by_category + last_24h)
 * - exportLog (JSON)
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { soc2, type SOC2Event } from '../../services/auth/soc2-compliance.js';

const STORAGE_KEY = 'apex_v13_soc2_log';

describe('services/soc2-compliance', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('record', () => {
    it('enregistre 1 événement avec hash + prev_hash="0"', async () => {
      await soc2.record('auth.login_success', 'kdmc_admin', { ip: '192.0.2.1' });
      const log = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as SOC2Event[];
      expect(log).toHaveLength(1);
      expect(log[0]?.type).toBe('auth.login_success');
      expect(log[0]?.category).toBe('security');
      expect(log[0]?.uid).toBe('kdmc_admin');
      expect(log[0]?.prev_hash).toBe('0');
      expect(log[0]?.hash.length).toBeGreaterThan(0);
    });

    it('catégorie auto-détectée depuis EVENT_CATEGORY', async () => {
      await soc2.record('vault.token_stored', 'u1');
      await soc2.record('pii.export_requested', 'u1');
      await soc2.record('system.backup_completed', 'u1');
      await soc2.record('integrity.audit_chain_verified', 'u1');
      const log = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as SOC2Event[];
      expect(log[0]?.category).toBe('confidentiality');
      expect(log[1]?.category).toBe('privacy');
      expect(log[2]?.category).toBe('availability');
      expect(log[3]?.category).toBe('integrity');
    });

    it('chain link : prev_hash de event N === hash de event N-1', async () => {
      await soc2.record('auth.login_success', 'u1');
      await soc2.record('auth.login_failure', 'u1');
      const log = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as SOC2Event[];
      expect(log[1]?.prev_hash).toBe(log[0]?.hash);
    });

    it('hash unique par event (différent pour 2 events identiques de type)', async () => {
      await soc2.record('auth.login_success', 'u1');
      await soc2.record('auth.login_success', 'u1');
      const log = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as SOC2Event[];
      expect(log[0]?.hash).not.toBe(log[1]?.hash);
    });

    it('retention 365j : events > 365j retirés', async () => {
      /* Pré-injecte un event très ancien */
      const oldEvent: SOC2Event = {
        id: 'old',
        ts: Date.now() - 400 * 86400000, /* 400 jours */
        type: 'auth.login_success',
        category: 'security',
        uid: 'u1',
        details: {},
        prev_hash: '0',
        hash: 'abcdef0123',
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify([oldEvent]));
      await soc2.record('auth.login_success', 'u1');
      const log = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as SOC2Event[];
      expect(log).toHaveLength(1);
      expect(log[0]?.id).not.toBe('old');
    });

    it('silent recovery si localStorage corrompu', async () => {
      localStorage.setItem(STORAGE_KEY, '{invalid json');
      /* record() lit log via readLog() qui catch et retourne [] */
      await expect(soc2.record('auth.login_success', 'u1')).resolves.toBeUndefined();
    });
  });

  describe('list', () => {
    beforeEach(async () => {
      await soc2.record('auth.login_success', 'admin', { ip: '1.1.1.1' });
      await soc2.record('auth.login_failure', 'admin');
      await soc2.record('vault.token_stored', 'laurence');
      await soc2.record('pii.export_requested', 'laurence');
    });

    it('sans filter → tous les events', () => {
      expect(soc2.list()).toHaveLength(4);
    });

    it('filter category security → 2 events auth', () => {
      const r = soc2.list({ category: 'security' });
      expect(r).toHaveLength(2);
      expect(r.every((e) => e.category === 'security')).toBe(true);
    });

    it('filter type vault.token_stored → 1 event', () => {
      const r = soc2.list({ type: 'vault.token_stored' });
      expect(r).toHaveLength(1);
      expect(r[0]?.uid).toBe('laurence');
    });

    it('filter uid laurence → 2 events', () => {
      const r = soc2.list({ uid: 'laurence' });
      expect(r).toHaveLength(2);
    });

    it('filter sinceMs futur → 0 events', () => {
      expect(soc2.list({ sinceMs: Date.now() + 10000 })).toHaveLength(0);
    });

    it('filter combiné (uid + category)', () => {
      const r = soc2.list({ uid: 'laurence', category: 'privacy' });
      expect(r).toHaveLength(1);
      expect(r[0]?.type).toBe('pii.export_requested');
    });
  });

  describe('verifyIntegrity', () => {
    it('log vide → ok=true total=0', async () => {
      const r = await soc2.verifyIntegrity();
      expect(r.ok).toBe(true);
      expect(r.total).toBe(0);
    });

    it('chain valide → ok=true', async () => {
      await soc2.record('auth.login_success', 'u1');
      await soc2.record('auth.login_success', 'u2');
      await soc2.record('vault.token_stored', 'u1');
      const r = await soc2.verifyIntegrity();
      expect(r.ok).toBe(true);
      expect(r.total).toBe(3);
    });

    it('tamper détecté → ok=false + broken_at', async () => {
      await soc2.record('auth.login_success', 'u1');
      await soc2.record('auth.login_failure', 'u2');
      /* Tamper : modifie le hash d'un event existant */
      const log = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as SOC2Event[];
      if (log[1]) {
        log[1].hash = 'tampered';
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(log));
      const r = await soc2.verifyIntegrity();
      expect(r.ok).toBe(false);
      expect(r.broken_at).toBe(1);
    });

    it('prev_hash tampered → ok=false', async () => {
      await soc2.record('auth.login_success', 'u1');
      await soc2.record('auth.login_success', 'u2');
      const log = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as SOC2Event[];
      if (log[1]) {
        log[1].prev_hash = 'fake_prev';
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(log));
      const r = await soc2.verifyIntegrity();
      expect(r.ok).toBe(false);
    });
  });

  describe('getStats', () => {
    beforeEach(async () => {
      await soc2.record('auth.login_success', 'u1');
      await soc2.record('auth.login_failure', 'u1');
      await soc2.record('vault.token_stored', 'u1');
      await soc2.record('pii.data_accessed', 'u2');
      await soc2.record('system.backup_completed', 'system');
      await soc2.record('integrity.audit_chain_verified', 'system');
    });

    it('total = 6 events', () => {
      const s = soc2.getStats();
      expect(s.total).toBe(6);
    });

    it('by_category compte correct', () => {
      const s = soc2.getStats();
      expect(s.by_category.security).toBe(2);
      expect(s.by_category.confidentiality).toBe(1);
      expect(s.by_category.privacy).toBe(1);
      expect(s.by_category.availability).toBe(1);
      expect(s.by_category.integrity).toBe(1);
    });

    it('last_24h = total si tout vient d\'être créé', () => {
      const s = soc2.getStats();
      expect(s.last_24h).toBe(6);
    });

    it('retention_days = 365', () => {
      const s = soc2.getStats();
      expect(s.retention_days).toBe(365);
    });

    it('log vide → tout à 0', () => {
      localStorage.clear();
      const s = soc2.getStats();
      expect(s.total).toBe(0);
      expect(s.last_24h).toBe(0);
      expect(s.by_category.security).toBe(0);
    });
  });

  describe('exportLog', () => {
    it('retourne JSON valide', async () => {
      await soc2.record('auth.login_success', 'u1');
      const json = soc2.exportLog();
      const parsed = JSON.parse(json);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0].type).toBe('auth.login_success');
    });

    it('retourne "[]" si log vide', () => {
      const json = soc2.exportLog();
      expect(JSON.parse(json)).toEqual([]);
    });
  });
});
