import { describe, it, expect, vi } from 'vitest';
import { bodyguard } from '../../services/observability/bodyguard.js';

describe('bodyguard service (tests Jet 6.5 + audit fixes)', () => {
  it('install() ne throw pas', () => {
    expect(() => bodyguard.install()).not.toThrow();
  });

  it('install() idempotent (2e appel sans erreur)', () => {
    bodyguard.install();
    expect(() => bodyguard.install()).not.toThrow();
  });

  it('CSP violation event TRIGGER auditLog.record (vrai handler attaché)', async () => {
    const { auditLog } = await import('../../services/observability/audit-log.js');
    const recordSpy = vi.spyOn(auditLog, 'record').mockResolvedValue(undefined);
    bodyguard.install();
    /* Trigger event CSP réel avec violatedDirective + blockedURI */
    const event = new Event('securitypolicyviolation');
    Object.defineProperty(event, 'violatedDirective', { value: 'script-src' });
    Object.defineProperty(event, 'blockedURI', { value: 'https://evil.com/script.js' });
    Object.defineProperty(event, 'sourceFile', { value: 'inline' });
    Object.defineProperty(event, 'lineNumber', { value: 42 });
    document.dispatchEvent(event);
    /* Vraie assertion P3 audit : auditLog.record appelé avec event "security.csp_violation" */
    const cspCall = recordSpy.mock.calls.find((c) => c[0] === 'security.csp_violation');
    expect(cspCall).toBeDefined();
    if (cspCall) {
      const meta = cspCall[1] as { details?: { directive?: string; blockedURI?: string } };
      expect(meta.details?.directive).toBe('script-src');
      expect(meta.details?.blockedURI).toContain('evil.com');
    }
    recordSpy.mockRestore();
  });

  it('postMessage externe TRIGGER auditLog.record security.postmessage_external', async () => {
    const { auditLog } = await import('../../services/observability/audit-log.js');
    const recordSpy = vi.spyOn(auditLog, 'record').mockResolvedValue(undefined);
    bodyguard.install();
    /* Postmessage origin externe (pas dans trusted list) */
    const event = new MessageEvent('message', {
      data: { type: 'unknown', payload: { evil: true } },
      origin: 'https://attacker.example.com',
    });
    window.dispatchEvent(event);
    /* Vraie assertion : auditLog.record appelé avec event "security.postmessage_external" */
    const pmCall = recordSpy.mock.calls.find((c) => c[0] === 'security.postmessage_external');
    expect(pmCall).toBeDefined();
    if (pmCall) {
      const meta = pmCall[1] as { details?: { origin?: string } };
      expect(meta.details?.origin).toBe('https://attacker.example.com');
    }
    recordSpy.mockRestore();
  });
});
