/**
 * Test log-redaction-wrapper (P0 sécu fix audit OWASP ASVS L2 V7.1.1).
 *
 * Vérifie que :
 * - Les patterns sensibles sont redactés correctement
 * - installGlobal() patche console.* sans casser l'API
 * - L'idempotence est respectée (multiples appels safe)
 * - restoreGlobal() restore exactement
 * - Stats remontées sont fiables (audit / HUD admin)
 * - Les valeurs non-string (objets, errors, primitives) sont gérées
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LogRedactionWrapper, logRedaction } from '../../services/observability/log-redaction-wrapper.js';

describe('LogRedactionWrapper — P0 sécu OWASP ASVS L2 V7.1.1', () => {
  beforeEach(() => {
    /* Reset state global entre tests */
    logRedaction.restoreGlobal();
    logRedaction.resetStats();
  });

  afterEach(() => {
    logRedaction.restoreGlobal();
    logRedaction.resetStats();
  });

  describe('redactString — patterns API keys', () => {
    it('redacte sk-ant-apiXX (Anthropic)', () => {
      const w = new LogRedactionWrapper();
      const r = w.redactString('My key: sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz123456789');
      expect(r.redacted).toContain('[REDACTED:anthropic_key]');
      expect(r.redacted).not.toContain('sk-ant-api03-AbCd');
      expect(r.count).toBe(1);
    });

    it('redacte sk-proj- (OpenAI projects)', () => {
      const w = new LogRedactionWrapper();
      const r = w.redactString('OPENAI=sk-proj-AbCdEfGhIjKlMnOpQrStUvWxYz1234567890ABCDEFG');
      expect(r.redacted).toContain('[REDACTED:openai_proj_key]');
      expect(r.redacted).not.toContain('sk-proj-AbCd');
    });

    it('redacte AIzaXXX (Google)', () => {
      const w = new LogRedactionWrapper();
      const r = w.redactString('Google: AIzaSyBcDeFgHiJkLmNoPqRsTuVwXyZ012345678');
      expect(r.redacted).toContain('[REDACTED:google_api_key]');
      expect(r.redacted).not.toContain('AIzaSy');
    });

    it('redacte ghp_XXX (GitHub PAT classic)', () => {
      const w = new LogRedactionWrapper();
      const r = w.redactString('GH=ghp_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789');
      expect(r.redacted).toContain('[REDACTED:github_pat]');
      expect(r.redacted).not.toContain('ghp_AbCd');
    });

    it('redacte github_pat_XXX (GitHub PAT fine-grained)', () => {
      const w = new LogRedactionWrapper();
      const longPat = 'github_pat_' + 'A'.repeat(82);
      const r = w.redactString(`PAT=${longPat}`);
      expect(r.redacted).toContain('[REDACTED:github_pat]');
      expect(r.redacted).not.toContain('github_pat_AAAA');
    });

    it('redacte ghs_/gho_/ghu_ (GitHub OAuth)', () => {
      const w = new LogRedactionWrapper();
      const r = w.redactString(
        'ghs_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789 gho_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789 ghu_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789',
      );
      const matches = r.redacted.match(/\[REDACTED:github_oauth\]/g) ?? [];
      expect(matches.length).toBe(3);
    });

    it('redacte sk_live_/sk_test_ (Stripe)', () => {
      const w = new LogRedactionWrapper();
      /* split anti secret-scanner GitHub */
      const r = w.redactString('sk_' + 'live_' + 'abcdefghijklmnopqrstuvwxyz1234567890');
      expect(r.redacted).toContain('[REDACTED:stripe_key]');
    });

    it('redacte JWT', () => {
      const w = new LogRedactionWrapper();
      const jwt =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4ifQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      const r = w.redactString(`Bearer token: ${jwt}`);
      expect(r.redacted).toContain('[REDACTED:jwt]');
    });

    it('redacte Bearer tokens', () => {
      const w = new LogRedactionWrapper();
      const r = w.redactString('Authorization: Bearer abc123def456ghi789jkl012mno345pqr678stu');
      expect(r.redacted).toContain('[REDACTED:bearer_token]');
    });

    it('redacte IBAN', () => {
      const w = new LogRedactionWrapper();
      const r = w.redactString('IBAN: FR1420041010050500013M02606');
      expect(r.redacted).toContain('[REDACTED:iban]');
    });

    it('redacte cartes bancaires', () => {
      const w = new LogRedactionWrapper();
      const r = w.redactString('CB: 4532 1234 5678 9010');
      expect(r.redacted).toContain('[REDACTED:credit_card]');
    });

    it('redacte plusieurs secrets dans la même string', () => {
      const w = new LogRedactionWrapper();
      const r = w.redactString(
        'API1: sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz123456789 et API2: AIzaSyBcDeFgHiJkLmNoPqRsTuVwXyZ012345678',
      );
      expect(r.redacted).toContain('[REDACTED:anthropic_key]');
      expect(r.redacted).toContain('[REDACTED:google_api_key]');
      expect(r.count).toBe(2);
    });

    it('ne touche pas une string sans secret', () => {
      const w = new LogRedactionWrapper();
      const r = w.redactString('Hello world, normal log message');
      expect(r.redacted).toBe('Hello world, normal log message');
      expect(r.count).toBe(0);
    });
  });

  describe('redactValue — types non-string', () => {
    it('redacte une Error (message + stack)', () => {
      const w = new LogRedactionWrapper();
      const err = new Error('Failed with key sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz123456789');
      const result = w.redactValue(err);
      expect(result).toBeInstanceOf(Error);
      expect((result as Error).message).toContain('[REDACTED:anthropic_key]');
      expect((result as Error).message).not.toContain('sk-ant-api03-AbCd');
    });

    it('redacte un objet (JSON round-trip)', () => {
      const w = new LogRedactionWrapper();
      const obj = { user: 'kevin', token: 'sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz123456789' };
      const result = w.redactValue(obj) as { user: string; token: string };
      expect(result.user).toBe('kevin');
      expect(result.token).toContain('[REDACTED:anthropic_key]');
    });

    it('retourne null/undefined/number/boolean tels quels', () => {
      const w = new LogRedactionWrapper();
      expect(w.redactValue(null)).toBeNull();
      expect(w.redactValue(undefined)).toBeUndefined();
      expect(w.redactValue(42)).toBe(42);
      expect(w.redactValue(true)).toBe(true);
    });

    it('gère les objects circulaires (placeholder safe)', () => {
      const w = new LogRedactionWrapper();
      const a: Record<string, unknown> = { name: 'a' };
      a['self'] = a;
      const result = w.redactValue(a);
      expect(result).toBe('[unserializable_object]');
    });
  });

  describe('installGlobal / restoreGlobal — patch console', () => {
    it('patche console.log et redacte les arguments', () => {
      const w = new LogRedactionWrapper();
      const captured: unknown[] = [];
      const origLog = console.log;
      console.log = (...args: unknown[]) => {
        captured.push(args);
        origLog(...args);
      };
      w.installGlobal();
      console.log('Token: sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz123456789');
      w.restoreGlobal();
      console.log = origLog;
      expect(captured.length).toBeGreaterThan(0);
      const firstCall = captured[0] as unknown[];
      expect(JSON.stringify(firstCall)).toContain('[REDACTED:anthropic_key]');
      expect(JSON.stringify(firstCall)).not.toContain('sk-ant-api03-AbCd');
    });

    it('idempotent : 2 installGlobal() = 1 patch (pas de double-wrap)', () => {
      const w = new LogRedactionWrapper();
      w.installGlobal();
      const wrapped1 = console.log;
      w.installGlobal();
      const wrapped2 = console.log;
      expect(wrapped1).toBe(wrapped2);
      w.restoreGlobal();
    });

    it('restoreGlobal remet le console original (référence-équivalente)', () => {
      const w = new LogRedactionWrapper();
      /* Capture une référence "neutre" : la valeur courante avant patch */
      const before = console.log;
      w.installGlobal();
      expect(console.log).not.toBe(before);
      w.restoreGlobal();
      /* Note : restoreGlobal restore la version BIND qu'on a sauvegardée
       * (originalConsole.log = console.log.bind(console)) — pas la
       * référence brute identique. On vérifie donc le comportement, pas
       * l'identité object : log fonctionne et n'est plus le wrap. */
      expect(typeof console.log).toBe('function');
      /* Plus important : la fonction n'est plus la wrappée */
      expect(w.isInstalled()).toBe(false);
      /* Et un nouveau call n'incrémente plus les stats redaction */
      const before2 = w.getStats().totalRedactions;
      console.log('Test sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz123456789');
      expect(w.getStats().totalRedactions).toBe(before2);
    });

    it('restoreGlobal sans installGlobal préalable = no-op', () => {
      const w = new LogRedactionWrapper();
      const origLog = console.log;
      w.restoreGlobal();
      expect(console.log).toBe(origLog);
    });

    it('isInstalled() reflète l\'état correctement', () => {
      const w = new LogRedactionWrapper();
      expect(w.isInstalled()).toBe(false);
      w.installGlobal();
      expect(w.isInstalled()).toBe(true);
      w.restoreGlobal();
      expect(w.isInstalled()).toBe(false);
    });
  });

  describe('stats / audit', () => {
    it('compte les redactions par type', () => {
      const w = new LogRedactionWrapper();
      w.redactString('sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz123456789');
      w.redactString('AIzaSyBcDeFgHiJkLmNoPqRsTuVwXyZ012345678');
      w.redactString('AIzaSyOtherKeyBcDeFgHiJkLmNoPqRsTuVwXyZ');
      const stats = w.getStats();
      expect(stats.totalRedactions).toBe(3);
      expect(stats.byType['anthropic_key']).toBe(1);
      expect(stats.byType['google_api_key']).toBe(2);
      expect(stats.lastRedactionAt).not.toBeNull();
    });

    it('resetStats() remet les compteurs à zéro', () => {
      const w = new LogRedactionWrapper();
      w.redactString('sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz123456789');
      expect(w.getStats().totalRedactions).toBe(1);
      w.resetStats();
      expect(w.getStats().totalRedactions).toBe(0);
      expect(w.getStats().byType).toEqual({});
      expect(w.getStats().lastRedactionAt).toBeNull();
    });

    it('listPatterns() expose metadata sans regex (fuite implementation)', () => {
      const w = new LogRedactionWrapper();
      const patterns = w.listPatterns();
      expect(patterns.length).toBeGreaterThan(10);
      patterns.forEach((p) => {
        expect(p).toHaveProperty('name');
        expect(p).toHaveProperty('label');
        expect(p).not.toHaveProperty('regex');
      });
    });
  });

  describe('Singleton logRedaction (production)', () => {
    it('singleton exporté est une instance prête à l\'emploi', () => {
      expect(logRedaction).toBeDefined();
      expect(typeof logRedaction.redactString).toBe('function');
      expect(typeof logRedaction.installGlobal).toBe('function');
    });

    it('redaction effective via singleton', () => {
      const r = logRedaction.redactString('Token: sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz123456789');
      expect(r.redacted).toContain('[REDACTED:anthropic_key]');
    });
  });

  describe('Cas réels (regression scénarios)', () => {
    it('défense en profondeur : log apex-tools-dispatch ligne 149', () => {
      const w = new LogRedactionWrapper();
      /* Simule le log à risque ligne 149 services/apex-tools-dispatch.ts */
      const toolName = 'admin_change_pin';
      const token = 'tok_' + Math.random().toString(36).slice(2, 10);
      const message = `Tool ${toolName} pending validation: ${token}`;
      /* token court ne match aucun pattern → pas de redaction nécessaire (UUID validation) */
      const r = w.redactString(message);
      expect(r.redacted).toBe(message);
    });

    it('défense en profondeur : log avec stack trace API', () => {
      const w = new LogRedactionWrapper();
      const err = new Error(
        'Fetch failed: Bearer ghp_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789 returned 401',
      );
      const result = w.redactValue(err) as Error;
      expect(result.message).toContain('[REDACTED:bearer_token]');
      expect(result.message).not.toContain('ghp_AbCd');
    });

    it('défense en profondeur : objet logger { err, key }', () => {
      const w = new LogRedactionWrapper();
      const data = {
        err: 'Auth failed',
        key: 'sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz123456789',
        retries: 3,
      };
      const result = w.redactValue(data) as Record<string, unknown>;
      expect(result['err']).toBe('Auth failed');
      expect(result['retries']).toBe(3);
      expect(String(result['key'])).toContain('[REDACTED:anthropic_key]');
    });
  });

  describe('Vitest mock support (pour intégration HUD)', () => {
    it('peut être spy via vi.spyOn pour tester audit appel', () => {
      const w = new LogRedactionWrapper();
      const spy = vi.spyOn(w, 'redactString');
      w.redactValue('hello world');
      expect(spy).toHaveBeenCalledWith('hello world');
      spy.mockRestore();
    });
  });

  describe('branches restantes (campagne 100%)', () => {
    it('redactValue(Error sans stack) → stack undefined (branche 167)', () => {
      const w = new LogRedactionWrapper();
      const e = new Error('boom');
      delete (e as { stack?: string }).stack;
      /* stack source absent → branche `: undefined` (l.167) ; le nouvel Error a son
       * propre stack auto-généré, donc on vérifie le message, pas l'absence de stack. */
      const r = w.redactValue(e) as Error;
      expect(r).toBeInstanceOf(Error);
      expect(r.message).toBe('boom');
    });

    it('installGlobal : console undefined → early return (branche 205)', () => {
      const w = new LogRedactionWrapper();
      vi.stubGlobal('console', undefined);
      expect(() => w.installGlobal()).not.toThrow();
      vi.unstubAllGlobals();
      expect(w.isInstalled()).toBe(false);
    });

    it('restoreGlobal : console undefined → early return (branche 250)', () => {
      const w = new LogRedactionWrapper();
      w.installGlobal(); // installed=true + originalConsole set
      vi.stubGlobal('console', undefined);
      expect(() => w.restoreGlobal()).not.toThrow(); // early return à 250
      vi.unstubAllGlobals();
      w.restoreGlobal(); // nettoyage : restaure le console réel patché par installGlobal
    });
  });
});
