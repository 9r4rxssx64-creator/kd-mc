import { describe, it, expect, beforeEach } from 'vitest';
import { auditLog } from '../../services/observability/audit-log.js';

describe('audit-log service (tests réels Jet 6)', () => {
  beforeEach(() => {
    localStorage.clear();
    auditLog.reload(); /* clear in-memory chain */
  });

  describe('record + persistence', () => {
    it('record stocke entry dans localStorage', async () => {
      await auditLog.record('test.event', { actor: 'kevin' });
      const raw = localStorage.getItem('ax_audit_log_v13');
      expect(raw).toBeTruthy();
      const chain = JSON.parse(raw!);
      expect(chain.length).toBe(1);
      expect(chain[0].action).toBe('test.event');
      expect(chain[0].actor).toBe('kevin');
    });

    it('chaque entry a hash + prevHash + ts', async () => {
      await auditLog.record('test.evt', { actor: 'u1' });
      const entries = auditLog.getEntries();
      const e = entries[0];
      expect(e?.hash).toBeTruthy();
      expect(e?.hash.length).toBe(64); /* SHA-256 hex */
      expect(e?.prevHash).toBe('0'); /* premier entry */
      expect(e?.ts).toBeGreaterThan(0);
    });

    it('actor "system" par défaut si non fourni', async () => {
      await auditLog.record('boot.start');
      const entries = auditLog.getEntries();
      expect(entries[0]?.actor).toBe('system');
    });

    it('details optionnels persistés', async () => {
      await auditLog.record('login', { actor: 'u1', details: { ip: '127.0.0.1', device: 'iphone' } });
      const e = auditLog.getEntries()[0];
      expect(e?.details).toEqual({ ip: '127.0.0.1', device: 'iphone' });
    });
  });

  describe('hash chain integrity', () => {
    it('verify chain valid après plusieurs records', async () => {
      for (let i = 0; i < 5; i++) {
        await auditLog.record(`event.${i}`, { actor: `u${i}` });
      }
      const r = await auditLog.verify();
      expect(r.valid).toBe(true);
      expect(r.brokenAt).toBeUndefined();
    });

    it('chaque hash dépend du prevHash (chain link)', async () => {
      await auditLog.record('a', { actor: 'u' });
      await auditLog.record('b', { actor: 'u' });
      const entries = auditLog.getEntries();
      expect(entries[1]?.prevHash).toBe(entries[0]?.hash);
    });

    it('detect tampering action field', async () => {
      await auditLog.record('original', { actor: 'u1' });
      await auditLog.record('next', { actor: 'u2' });
      const raw = JSON.parse(localStorage.getItem('ax_audit_log_v13') ?? '[]');
      raw[0].action = 'tampered'; /* modify action sans recalculer hash */
      localStorage.setItem('ax_audit_log_v13', JSON.stringify(raw));
      auditLog.reload();
      const r = await auditLog.verify();
      expect(r.valid).toBe(false);
      expect(r.brokenAt).toBe(0);
    });

    it('detect tampering prevHash break (insertion entry)', async () => {
      await auditLog.record('a', { actor: 'u' });
      await auditLog.record('b', { actor: 'u' });
      const raw = JSON.parse(localStorage.getItem('ax_audit_log_v13') ?? '[]');
      /* Insère entry avec prevHash invalide */
      raw.splice(1, 0, { ts: Date.now(), actor: 'attacker', action: 'inject', prevHash: 'fake', hash: 'fake' });
      localStorage.setItem('ax_audit_log_v13', JSON.stringify(raw));
      auditLog.reload();
      const r = await auditLog.verify();
      expect(r.valid).toBe(false);
    });

    it('verify chain vide = valid', async () => {
      const r = await auditLog.verify();
      expect(r.valid).toBe(true);
    });
  });

  describe('getEntries + filter', () => {
    it('filter par actor', async () => {
      await auditLog.record('a', { actor: 'kevin' });
      await auditLog.record('b', { actor: 'autre' });
      await auditLog.record('c', { actor: 'kevin' });
      const filtered = auditLog.getEntries({ actor: 'kevin' });
      expect(filtered.length).toBe(2);
      expect(filtered.every((e) => e.actor === 'kevin')).toBe(true);
    });

    it('filter par action prefix', async () => {
      await auditLog.record('rgpd.export', { actor: 'u' });
      await auditLog.record('rgpd.erase.start', { actor: 'u' });
      await auditLog.record('login', { actor: 'u' });
      const filtered = auditLog.getEntries({ action: 'rgpd' });
      expect(filtered.length).toBe(2);
    });

    it('getEntries sans filter retourne tout', async () => {
      await auditLog.record('a', { actor: 'u' });
      await auditLog.record('b', { actor: 'u' });
      expect(auditLog.getEntries().length).toBe(2);
    });
  });

  describe('rotation MAX 1000 entries', () => {
    it('cap après 1000 entries (FIFO)', async () => {
      /* Pré-rempli avec 1005 fake entries */
      const fake = Array.from({ length: 1005 }, (_, i) => ({
        ts: Date.now() + i,
        actor: 'system',
        action: `evt_${i}`,
        prevHash: '0',
        hash: '0'.repeat(64),
      }));
      localStorage.setItem('ax_audit_log_v13', JSON.stringify(fake));
      auditLog.reload();
      await auditLog.record('new', { actor: 'u' });
      expect(auditLog.getEntries().length).toBeLessThanOrEqual(1000);
    });
  });
});
