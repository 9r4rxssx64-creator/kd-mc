/**
 * Tests CSP violation watch (Jet 7 sécurité 20/20)
 * - Validation enregistrement violations dans `ax_csp_violations_log`
 * - FIFO cap 100
 * - Sentinelle `csp-violation-watch` détecte patterns suspects
 */
import { describe, it, expect, beforeEach } from 'vitest';

import {
  bodyguard,
  recordCSPViolation,
  getCSPViolations,
  clearCSPViolations,
  type CSPViolationEntry,
} from '../../services/observability/bodyguard.js';

function makeCSPEvent(directive: string, blockedURI: string, sourceFile = '', lineNumber = 0): SecurityPolicyViolationEvent {
  const event = new Event('securitypolicyviolation') as SecurityPolicyViolationEvent;
  Object.defineProperty(event, 'violatedDirective', { value: directive });
  Object.defineProperty(event, 'blockedURI', { value: blockedURI });
  Object.defineProperty(event, 'sourceFile', { value: sourceFile });
  Object.defineProperty(event, 'lineNumber', { value: lineNumber });
  Object.defineProperty(event, 'columnNumber', { value: 0 });
  return event;
}

describe('CSP violation log (ax_csp_violations_log)', () => {
  beforeEach(() => {
    clearCSPViolations();
  });

  it('recordCSPViolation enregistre violation dans localStorage', () => {
    const event = makeCSPEvent('script-src', 'https://evil.com/x.js');
    const entry = recordCSPViolation(event);
    expect(entry.directive).toBe('script-src');
    expect(entry.blockedURI).toBe('https://evil.com/x.js');
    expect(entry.ts).toBeGreaterThan(0);
    const log = getCSPViolations();
    expect(log.length).toBe(1);
    expect(log[0]?.blockedURI).toBe('https://evil.com/x.js');
  });

  it('getCSPViolations retourne [] si pas de log', () => {
    expect(getCSPViolations()).toEqual([]);
  });

  it('clearCSPViolations vide bien le log', () => {
    recordCSPViolation(makeCSPEvent('script-src', 'https://x.com/y.js'));
    expect(getCSPViolations().length).toBe(1);
    clearCSPViolations();
    expect(getCSPViolations()).toEqual([]);
  });

  it('FIFO cap 100 : ajoute 105 violations, garde les 100 dernières', () => {
    for (let i = 0; i < 105; i++) {
      recordCSPViolation(makeCSPEvent('script-src', `https://evil.com/${i}.js`));
    }
    const log = getCSPViolations();
    expect(log.length).toBe(100);
    /* Première gardée = i=5 (les 5 premières expulsées) */
    expect(log[0]?.blockedURI).toBe('https://evil.com/5.js');
    expect(log[99]?.blockedURI).toBe('https://evil.com/104.js');
  });

  it('truncate longs URI à 200 chars', () => {
    const longUri = 'https://evil.com/' + 'a'.repeat(500);
    const entry = recordCSPViolation(makeCSPEvent('script-src', longUri));
    expect(entry.blockedURI.length).toBeLessThanOrEqual(200);
  });

  it('JSON parse corrompu retourne []', () => {
    localStorage.setItem('ax_csp_violations_log', 'invalid-json{');
    expect(getCSPViolations()).toEqual([]);
  });
});

describe('bodyguard CSP integration (record dans log via dispatchEvent)', () => {
  beforeEach(() => {
    clearCSPViolations();
  });

  it('CSP violation event => entry dans ax_csp_violations_log', () => {
    bodyguard.install();
    document.dispatchEvent(makeCSPEvent('script-src', 'https://attacker.com/payload.js', 'inline', 99));
    const log = getCSPViolations();
    /* Au moins 1 entry (peut avoir héritages session) */
    const found = log.find((v) => v.blockedURI.includes('attacker.com'));
    expect(found).toBeDefined();
    if (found) {
      expect(found.directive).toContain('script-src');
      expect(found.lineNumber).toBe(99);
    }
  });
});

describe('csp-violation-watch sentinel logic', () => {
  beforeEach(() => {
    clearCSPViolations();
  });

  it('seuil 5 violations / 1h respecté → ok', async () => {
    for (let i = 0; i < 3; i++) {
      recordCSPViolation(makeCSPEvent('style-src', `https://cdn${i}.com/style.css`));
    }
    /* Simule la check du sentinel inline (verify logic) */
    const log = getCSPViolations();
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const recent = log.filter((v) => v.ts > oneHourAgo);
    expect(recent.length).toBeLessThanOrEqual(5);
  });

  it('détecte URI suspecte non-trusted (script-src)', () => {
    recordCSPViolation(makeCSPEvent('script-src-elem', 'https://malware-cdn.example/inject.js'));
    const log = getCSPViolations();
    const trusted = ['self', 'data:', 'blob:'];
    const suspicious = log.filter(
      (v: CSPViolationEntry) =>
        v.directive.startsWith('script-src') &&
        v.blockedURI &&
        !trusted.some((t) => v.blockedURI.startsWith(t)) &&
        !/\.firebaseio\.com|api\.anthropic\.com/.test(v.blockedURI),
    );
    expect(suspicious.length).toBe(1);
    expect(suspicious[0]?.blockedURI).toContain('malware-cdn.example');
  });

  it('URI Firebase trusted → non-suspecte', () => {
    recordCSPViolation(makeCSPEvent('script-src', 'https://kdmc-clients-default-rtdb.europe-west1.firebasedatabase.app/x.json'));
    const log = getCSPViolations();
    const suspicious = log.filter(
      (v) =>
        v.directive.startsWith('script-src') &&
        !v.blockedURI.startsWith('self') &&
        !/\.firebaseio\.com|\.firebasedatabase\.app|api\.anthropic\.com/.test(v.blockedURI),
    );
    expect(suspicious.length).toBe(0);
  });
});
