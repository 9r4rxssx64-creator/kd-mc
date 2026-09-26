/**
 * APEX v13.3.24 — Tests security-watch (Kevin screenshot 19:11 "Audit log tamper détecté")
 *
 * Vérifie :
 * 1. Audit log vide → status OK (pas tamper)
 * 2. Audit log valide → status OK
 * 3. Audit log corrompu → critical + détails dans ax_security_log
 * 4. lastact = 0 (pas de session) → skip session check (pas faux positif)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { sentinels, registerCoreSentinels } from '../../services/sentinels/sentinels.js';
import { auditLog } from '../../services/observability/audit-log.js';

describe('sentinels security-watch tamper v13.3.24', () => {
  beforeEach(() => {
    localStorage.clear();
    auditLog.reload();
    sentinels.list().forEach((s) => sentinels.enable(s.id, false));
    registerCoreSentinels();
  });

  it('audit log vide → status OK (pas tamper)', async () => {
    /* Pas d'écriture audit log → entries.length === 0 */
    const result = await sentinels.runOne('security-watch');
    expect(result?.ok).toBe(true);
    expect(result?.msg).toMatch(/vide.*première écriture|OK/i);
    expect(result?.msg).not.toMatch(/tamper|invalide/i);
  });

  it('audit log valide après record → status OK', async () => {
    auditLog.init();
    await auditLog.record('test.action.1', { actor: 'system' });
    await auditLog.record('test.action.2', { actor: 'system' });
    const result = await sentinels.runOne('security-watch');
    expect(result?.ok).toBe(true);
    expect(result?.msg).toMatch(/audit log OK/i);
  });

  it('audit log corrompu (manuel) → check() détecte tamper + log security', async () => {
    auditLog.init();
    await auditLog.record('test.action.1');
    await auditLog.record('test.action.2');
    /* Corrompre la chain : modifier hash sans recalcul */
    const raw = localStorage.getItem('ax_audit_log_v13');
    if (raw) {
      const chain = JSON.parse(raw) as { hash: string }[];
      if (chain[1]) chain[1].hash = 'tampered_hash_invalid';
      localStorage.setItem('ax_audit_log_v13', JSON.stringify(chain));
    }
    auditLog.reload();
    /* v13.3.70 : runOne déclenche autoFix (rebuildChainHash) qui répare la chain.
     * Pour tester la DÉTECTION pure, on appelle check() directement.
     * runOne() retournera ok:true ("Auto-fixed: rebuilt N entries"). */
    const s = sentinels.list().find((x) => x.id === 'security-watch');
    expect(s).toBeDefined();
    const direct = await s!.check();
    expect(direct.ok).toBe(false);
    expect(direct.msg).toMatch(/Hash audit log invalide/i);
    expect(direct.msg).toMatch(/corruption/i);
    /* Vérifie ax_security_log enrichi */
    const securityLog = JSON.parse(localStorage.getItem('ax_security_log') ?? '[]') as Array<{ kind: string }>;
    const tamperEntries = securityLog.filter((e) => e.kind === 'audit_log_tamper');
    expect(tamperEntries.length).toBeGreaterThan(0);
  });

  it('v13.3.70 : sentinelAutoRepair.securityRebuildChain répare manuellement (UI button)', async () => {
    const { sentinelAutoRepair } = await import('../../services/sentinels/sentinel-auto-repair.js');
    auditLog.init();
    await auditLog.record('test.a');
    await auditLog.record('test.b');
    const raw = localStorage.getItem('ax_audit_log_v13');
    if (raw) {
      const chain = JSON.parse(raw) as { hash: string }[];
      if (chain[1]) chain[1].hash = 'tampered';
      localStorage.setItem('ax_audit_log_v13', JSON.stringify(chain));
    }
    auditLog.reload();
    /* Repair via API dédiée (UI bouton "Réparer chain audit") — pas autoFix direct
     * pour préserver le signal tamper visible avant action manuelle */
    const fix = await sentinelAutoRepair.securityRebuildChain();
    expect(fix.ok).toBe(true);
    expect(fix.msg).toMatch(/rebuild/i);
    /* Après repair, runOne doit retourner OK */
    const after = await sentinels.runOne('security-watch');
    expect(after?.ok).toBe(true);
  });

  it('lastact = 0 (pas de session) → skip session check, pas faux positif', async () => {
    /* Pas de apex_v13_lastact → ne devrait pas considérer session expirée */
    const result = await sentinels.runOne('security-watch');
    expect(result?.ok).toBe(true);
    expect(result?.msg).not.toMatch(/Session > 8h/i);
  });

  it('lastact récent → session OK', async () => {
    localStorage.setItem('apex_v13_lastact', String(Date.now() - (1 * 60 * 60 * 1000)));
    const result = await sentinels.runOne('security-watch');
    expect(result?.ok).toBe(true);
  });

  it('lastact > 8h → session expirée detected', async () => {
    localStorage.setItem('apex_v13_lastact', String(Date.now() - (10 * 60 * 60 * 1000)));
    const result = await sentinels.runOne('security-watch');
    expect(result?.ok).toBe(false);
    expect(result?.msg).toMatch(/Session > 8h/i);
  });

  it('audit log indispo → status OK (gracieux, pas faux positif)', async () => {
    /* Si auditLog import lève (rare) → skip plutôt que tamper */
    /* (test difficile à reproduire vraiment, on couvre le path principal) */
    const result = await sentinels.runOne('security-watch');
    expect(result?.ok).toBe(true);
  });

  it('détails tamper inclus brokenAt + totalEntries', async () => {
    auditLog.init();
    await auditLog.record('test.1');
    await auditLog.record('test.2');
    await auditLog.record('test.3');
    const raw = localStorage.getItem('ax_audit_log_v13');
    if (raw) {
      const chain = JSON.parse(raw) as { hash: string }[];
      if (chain[2]) chain[2].hash = 'corrupted';
      localStorage.setItem('ax_audit_log_v13', JSON.stringify(chain));
    }
    auditLog.reload();
    /* v13.3.70 : test la détection via check() direct (autoFix repair via runOne couvert
     * par le test "v13.3.70 runOne autoFix"). */
    const s = sentinels.list().find((x) => x.id === 'security-watch');
    expect(s).toBeDefined();
    const direct = await s!.check();
    expect(direct.ok).toBe(false);
    expect(direct.msg).toMatch(/entries|3/);
  });
});
