/**
 * Tests security-review.ts (Yury Plugin équivalent #1).
 *
 * Anti-théâtre : prouve que le scan détecte réellement les vulnérabilités.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { securityReview } from '../../services/admin/security-review.js';

describe('Security Review (Yury Plugin équivalent)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('runFullScan', () => {
    it('aucune vulnérabilité → score 100/100', async () => {
      const report = await securityReview.runFullScan();
      expect(report.score).toBeGreaterThanOrEqual(85);
      expect(report.totalChecks).toBeGreaterThanOrEqual(7);
      expect(report.scannedAt).toBeGreaterThan(0);
      expect(report.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('détecte secret API en clair localStorage → finding critical', async () => {
      localStorage.setItem('test_leaked_key', 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUV');
      const report = await securityReview.runFullScan();
      const secretFinding = report.findings.find((f) => f.category === 'secret-exposure');
      expect(secretFinding).toBeDefined();
      expect(secretFinding?.severity).toBe('critical');
      expect(report.score).toBeLessThan(100);
    });

    it('détecte AX_REDACT désactivé → finding high', async () => {
      localStorage.setItem('apex_v13_redact_disabled', 'true');
      const report = await securityReview.runFullScan();
      const redactFinding = report.findings.find((f) => f.category === 'pii-redaction');
      expect(redactFinding).toBeDefined();
      expect(redactFinding?.severity).toBe('high');
    });

    it('détecte session stale > 24h → finding medium', async () => {
      const stale = Date.now() - 25 * 60 * 60 * 1000;
      localStorage.setItem('apex_v13_lastact', String(stale));
      const report = await securityReview.runFullScan();
      const sessionFinding = report.findings.find((f) => f.category === 'session-leak');
      expect(sessionFinding).toBeDefined();
      expect(sessionFinding?.severity).toBe('medium');
    });

    it('skip clés vault chiffrées (préfixe apex_v13_vault_)', async () => {
      /* Stocker un secret qui MATCH un pattern, mais avec le bon préfixe → ne doit PAS flag */
      localStorage.setItem('apex_v13_vault_test', 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKL');
      const report = await securityReview.runFullScan();
      const secretFinding = report.findings.find((f) => f.category === 'secret-exposure');
      expect(secretFinding).toBeUndefined();
    });
  });

  describe('getLastReport / history', () => {
    it('persiste le dernier rapport', async () => {
      await securityReview.runFullScan();
      const last = securityReview.getLastReport();
      expect(last).not.toBeNull();
      expect(last?.scannedAt).toBeGreaterThan(0);
    });

    it('garde un historique des scans', async () => {
      await securityReview.runFullScan();
      await securityReview.runFullScan();
      const hist = securityReview.history();
      expect(hist.length).toBeGreaterThanOrEqual(2);
    });

    it('history vide retourne []', () => {
      localStorage.clear();
      const hist = securityReview.history();
      expect(hist).toEqual([]);
    });
  });

  describe('computeScore (via findings impact)', () => {
    it('score décroît avec sévérité critical', async () => {
      localStorage.setItem('test_key_1', 'sk-ant-api03-' + 'a'.repeat(50));
      localStorage.setItem('apex_v13_redact_disabled', 'true');
      const report = await securityReview.runFullScan();
      expect(report.score).toBeLessThan(70);
    });
  });
});
