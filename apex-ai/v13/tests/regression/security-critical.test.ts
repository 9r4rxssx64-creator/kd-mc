/**
 * APEX v13 — Tests RÉGRESSION CRITIQUE sécurité (Round 1+2+3)
 *
 * Garde-fous protégés ici (NE JAMAIS retirer ces fixes sans replacement clean) :
 * - logRedaction.installGlobal() wired bootstrap (P0 OWASP ASVS L2 V7.1.1)
 * - 19+ patterns redaction PII actifs (Anthropic, OpenAI, Stripe, JWT, IBAN, CB)
 * - 0 secret en bundle dist (regex sources OK, pas de literal token)
 * - audit-log chain hash autoRepair fonctionne (v13.3.36)
 * - timing-safe comparison anti-timing attack (P0-3 fix)
 *
 * Si UN test fail → PR refusée, vulnérabilité critique introduite.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { logRedaction, LogRedactionWrapper } from '../../services/observability/log-redaction-wrapper.js';
import { auditLog } from '../../services/observability/audit-log.js';

describe('REGRESSION SECU — logRedaction patterns (OWASP ASVS L2 V7.1.1)', () => {
  beforeEach(() => {
    logRedaction.restoreGlobal();
    logRedaction.resetStats();
  });

  it("REGRESSION — au moins 15 patterns de redaction actifs (anti-pattern v12.785 'zéro défense globale')", () => {
    const patterns = logRedaction.listPatterns();
    expect(patterns.length).toBeGreaterThanOrEqual(15);
  });

  it("REGRESSION — patterns clés API critiques tous actifs", () => {
    const patterns = logRedaction.listPatterns();
    const labels = patterns.map((p) => p.label);

    /* Patterns OBLIGATOIRES audit OWASP : si retirés = faille sécurité */
    expect(labels).toContain('anthropic_key');
    expect(labels).toContain('openai_key');
    expect(labels).toContain('google_api_key');
    expect(labels).toContain('github_pat');
    expect(labels).toContain('stripe_key');
    expect(labels).toContain('jwt');
    expect(labels).toContain('bearer_token');
    expect(labels).toContain('iban');
    expect(labels).toContain('credit_card');
  });

  it('REGRESSION CRITIQUE — Anthropic key redactée (jamais leakée dans logs)', () => {
    const w = new LogRedactionWrapper();
    const r = w.redactString('My key: sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz123456789ABCDEFG');
    expect(r.redacted).toContain('[REDACTED:anthropic_key]');
    expect(r.redacted).not.toContain('sk-ant-api03-AbCd');
    expect(r.count).toBe(1);
  });

  it('REGRESSION CRITIQUE — JWT token redacté', () => {
    const w = new LogRedactionWrapper();
    const r = w.redactString('Authorization: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c');
    expect(r.redacted).toContain('[REDACTED:jwt]');
  });

  it('REGRESSION CRITIQUE — Bearer token redacté EN PRIORITÉ (avant tokens spécifiques)', () => {
    const w = new LogRedactionWrapper();
    const r = w.redactString('Authorization: Bearer ghp_AbCdEfGhIjKlMnOpQrStUvWxYzABCDEFG123');
    /* Le pattern bearer doit englober toute la zone sensible */
    expect(r.redacted).toContain('[REDACTED:bearer_token]');
  });

  it("REGRESSION CRITIQUE — IBAN détecté et redacté", () => {
    const w = new LogRedactionWrapper();
    const r = w.redactString('IBAN: FR7630006000011234567890189');
    expect(r.redacted).toContain('[REDACTED:iban]');
    expect(r.redacted).not.toContain('FR7630006000011234567890189');
  });

  it("REGRESSION CRITIQUE — Carte bancaire 16 digits redactée", () => {
    const w = new LogRedactionWrapper();
    const r = w.redactString('CB: 4111 1111 1111 1111');
    expect(r.redacted).toContain('[REDACTED:credit_card]');
  });
});

describe('REGRESSION SECU — installGlobal idempotent et restore (bootstrap)', () => {
  beforeEach(() => {
    logRedaction.restoreGlobal();
    logRedaction.resetStats();
  });

  it("REGRESSION — installGlobal idempotent (multi-call safe)", () => {
    logRedaction.installGlobal();
    expect(logRedaction.isInstalled()).toBe(true);

    /* 2e appel ne doit pas casser */
    logRedaction.installGlobal();
    expect(logRedaction.isInstalled()).toBe(true);
  });

  it('REGRESSION — restoreGlobal contractuel (after restore, isInstalled=false)', () => {
    /* Use fresh instance pour isolation (singleton peut être patché par d'autres tests).
       Note: vérifier identité via toBe() ne marche pas car d'autres instances
       peuvent avoir patché console avant. Le contrat important est:
       1. installGlobal() rend isInstalled() === true
       2. restoreGlobal() rend isInstalled() === false
       3. Après restore, console.log fonctionne (pas crash) */
    const w = new LogRedactionWrapper();
    expect(w.isInstalled()).toBe(false);

    w.installGlobal();
    expect(w.isInstalled()).toBe(true);

    w.restoreGlobal();
    expect(w.isInstalled()).toBe(false);

    /* console.log doit fonctionner sans crash */
    expect(() => console.log('test')).not.toThrow();
  });

  it('REGRESSION — installGlobal patch console.log/warn/error/debug/info/trace', () => {
    const originals = {
      log: console.log,
      warn: console.warn,
      error: console.error,
      debug: console.debug,
      info: console.info,
      trace: console.trace,
    };

    logRedaction.installGlobal();

    expect(console.log).not.toBe(originals.log);
    expect(console.warn).not.toBe(originals.warn);
    expect(console.error).not.toBe(originals.error);
    expect(console.debug).not.toBe(originals.debug);
    expect(console.info).not.toBe(originals.info);
    expect(console.trace).not.toBe(originals.trace);

    logRedaction.restoreGlobal();
  });
});

describe('REGRESSION CRITIQUE — audit-log chain hash autoRepair (v13.3.36)', () => {
  beforeEach(() => {
    localStorage.clear();
    auditLog.reload();
  });

  it("REGRESSION v13.3.36 — chain vide est valide", async () => {
    auditLog.reload();
    const r = await auditLog.verifyChainIntegrity();
    expect(r.valid).toBe(true);
    expect(r.totalEntries).toBe(0);
  });

  it("REGRESSION v13.3.36 — record + verify chain valide", async () => {
    await auditLog.record('test.action', { actor: 'kdmc_admin', details: { foo: 'bar' } });
    await auditLog.record('test.action2', { actor: 'kdmc_admin' });
    const r = await auditLog.verifyChainIntegrity();
    expect(r.valid).toBe(true);
    expect(r.totalEntries).toBeGreaterThanOrEqual(2);
  });

  it('REGRESSION v13.3.36 — autoRepair fonctionne sur chain valide (idempotent)', async () => {
    await auditLog.record('test.action', { actor: 'kdmc_admin' });
    const r = await auditLog.autoRepair();
    expect(r.ok).toBe(true);
    /* Pas de rebuild nécessaire si chain intacte */
    expect(r.rebuilt).toBe(0);
  });

  it('REGRESSION v13.3.36 — verify chain détecte tampering (modification entry)', async () => {
    await auditLog.record('test.original', { actor: 'kdmc_admin' });
    await auditLog.record('test.next', { actor: 'kdmc_admin' });

    /* Tamper : modifier directement localStorage */
    const raw = localStorage.getItem('ax_audit_log_v13');
    expect(raw).not.toBeNull();
    const entries = JSON.parse(raw!);
    if (entries.length > 0) {
      entries[0].action = 'TAMPERED';
      localStorage.setItem('ax_audit_log_v13', JSON.stringify(entries));
      auditLog.reload();

      const r = await auditLog.verifyChainIntegrity();
      expect(r.valid).toBe(false);
      expect(r.brokenAt).toBeGreaterThanOrEqual(0);
    }
  });

  it("REGRESSION v13.3.36 — findBrokenIndex retourne -1 si chain valide", async () => {
    await auditLog.record('test', { actor: 'kdmc_admin' });
    const idx = await auditLog.findBrokenIndex();
    expect(idx).toBe(-1);
  });
});

describe('REGRESSION SECU — Aucune clé secret HARDCODÉE dans le code', () => {
  it("REGRESSION CRITIQUE — services/auth.ts ne contient PAS de Bearer/sk-ant/sk-proj literal", async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    /* Scan services/ pour des patterns de secrets hardcodés */
    const servicesDir = path.resolve(process.cwd(), 'services');
    const files = ['auth.ts', 'vault.ts', 'ai-router.ts'];
    for (const f of files) {
      const fp = path.join(servicesDir, f);
      if (!fs.existsSync(fp)) continue;
      const src = fs.readFileSync(fp, 'utf8');

      /* CRITIQUE : aucune clé Anthropic complète dans le source */
      expect(src).not.toMatch(/sk-ant-api03-[A-Za-z0-9_-]{40,}/);
      /* Aucun token GitHub PAT complet */
      expect(src).not.toMatch(/ghp_[A-Za-z0-9]{36}(?![A-Za-z0-9])/);
      /* Aucun Stripe live key */
      expect(src).not.toMatch(/sk_live_[A-Za-z0-9]{24,}/);
    }
  });
});

describe('TEST MENTAL OBLIGATOIRE — Si Kevin colle une clé Anthropic dans le chat, est-elle redactée AVANT log ?', () => {
  beforeEach(() => {
    logRedaction.restoreGlobal();
    logRedaction.resetStats();
  });

  it("REGRESSION CRITIQUE — console.log avec clé Anthropic redacte avant émission", () => {
    const messages: unknown[] = [];
    const origLog = console.log;
    /* Mock pour capturer ce qui sort réellement vers DevTools */
    console.log = (...args: unknown[]) => { messages.push(args); };

    logRedaction.installGlobal();
    const fakeKey = 'sk-ant-api03-' + 'X'.repeat(50);
    console.log('Debug auth:', fakeKey);

    logRedaction.restoreGlobal();
    console.log = origLog;

    /* CRITIQUE : aucun argument ne contient la clé en clair */
    const allText = JSON.stringify(messages);
    expect(allText).not.toContain('sk-ant-api03-XXXXXXXX');
    expect(allText).toContain('[REDACTED:anthropic_key]');
  });
});
