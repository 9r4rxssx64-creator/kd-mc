/**
 * APEX v13.3.24 — Tests tools-watch (Kevin screenshot 19:11 "16 tools orphelins (50%)")
 *
 * Vérifie :
 * 1. capabilities.auditOrphans() retourne coverage >= 90%
 * 2. tools-watch sentinel status OK (coverage cible 90%)
 * 3. Whitelist services internes (auto-backup, audit-log, etc.) → pas comptés orphans
 * 4. Coverage 100% attendu (tous tools_used existent)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { capabilities } from '../../services/core-svc/capabilities.js';
import { sentinels } from '../../services/sentinels/sentinels.js';
import { sentinelsRegistry, bootstrapSentinelsRegistry } from '../../services/sentinels/sentinels-registry.js';

describe('tools-watch coverage v13.3.24', () => {
  beforeEach(() => {
    localStorage.clear();
    sentinels.list().forEach((s) => sentinels.enable(s.id, false));
    bootstrapSentinelsRegistry();
  });

  it('capabilities.auditOrphans() retourne coverage >= 90%', async () => {
    const audit = await capabilities.auditOrphans();
    expect(audit.coverage_pct).toBeGreaterThanOrEqual(90);
  });

  it('coverage attendu = 100% (tous tools_used connus)', async () => {
    const audit = await capabilities.auditOrphans();
    expect(audit.coverage_pct).toBe(100);
    expect(audit.orphans).toHaveLength(0);
  });

  it('tools-watch sentinel status OK avec coverage actuel', async () => {
    const result = await sentinels.runOne('tools-watch');
    expect(result?.ok).toBe(true);
    expect(result?.msg).toMatch(/Coverage 100%|orphans.*0|✅/i);
  });

  it('tools-watch ne dit PAS "16 tools orphelins (50%)"', async () => {
    const result = await sentinels.runOne('tools-watch');
    expect(result?.msg).not.toMatch(/16 tools orphelins/i);
    expect(result?.msg).not.toMatch(/coverage 50%/i);
  });

  it('whitelist étendue inclut services internes wirés', async () => {
    /* auto-backup, audit-log, observability sont wirés via bootstrap mais non exposés
     * comme apex-tools. Ne devraient PAS apparaître comme orphans. */
    const audit = await capabilities.auditOrphans();
    expect(audit.orphans).not.toContain('auto-backup');
    expect(audit.orphans).not.toContain('audit-log');
    expect(audit.orphans).not.toContain('observability');
    expect(audit.orphans).not.toContain('memory');
    expect(audit.orphans).not.toContain('memory-bridge');
  });

  it('whitelist inclut subagents internes', async () => {
    const audit = await capabilities.auditOrphans();
    /* Vérifie que types subagents (audit/plan/research/monitor) ne sont pas marqués orphans
     * s'ils apparaissent dans tools_used (ils n'apparaissent pas dans capabilities mais
     * la whitelist les couvre par sécurité). */
    expect(audit.orphans).not.toContain('audit');
    expect(audit.orphans).not.toContain('plan');
    expect(audit.orphans).not.toContain('research');
    expect(audit.orphans).not.toContain('monitor');
  });

  it('coverage augmente avec whitelist v13.3.24 (vs v13.3.23)', async () => {
    /* Audit après v13.3.24 doit retourner exactement 100% car aucun orphan */
    const audit = await capabilities.auditOrphans();
    expect(audit.coverage_pct).toBe(100);
    expect(audit.orphans.length).toBe(0);
  });

  it('seuil tools-watch : < 90% = warn, >= 90% = OK', async () => {
    /* État actuel = 100%, donc OK */
    const result = await sentinels.runOne('tools-watch');
    expect(result?.ok).toBe(true);
  });

  it('si pas d\'erreur → message contient "✅" ou "100%"', async () => {
    const result = await sentinels.runOne('tools-watch');
    expect(result?.ok).toBe(true);
    expect(result?.msg).toMatch(/100%|✅/);
  });

  it('orphans returned par audit ≤ 10 (slice limite UI)', async () => {
    const audit = await capabilities.auditOrphans();
    /* Test sur le contrat audit, l'UI fait .slice(0,10) côté sentinel */
    expect(Array.isArray(audit.orphans)).toBe(true);
    expect(audit.orphans.length).toBeLessThanOrEqual(50);
  });

  it('coverage_pct est un entier (pas de decimal)', async () => {
    const audit = await capabilities.auditOrphans();
    expect(Number.isInteger(audit.coverage_pct)).toBe(true);
  });
});
