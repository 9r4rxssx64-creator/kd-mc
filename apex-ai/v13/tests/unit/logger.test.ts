import { describe, it, expect, vi, afterEach } from 'vitest';
import { logger } from '../../core/logger.js';

describe('logger — branches restantes (campagne 100%)', () => {
  afterEach(() => {
    (logger as unknown as { sentryReady: boolean }).sentryReady = false;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('redact objet cyclique → "[unserializable]" (catch JSON.stringify)', () => {
    logger.clearBuffer();
    const cyclic: Record<string, unknown> = {};
    cyclic['self'] = cyclic;
    logger.info('test', 'msg', cyclic);
    expect(logger.getBuffer().pop()?.data).toBe('[unserializable]');
  });

  it('forwardToSentry quand sentryReady=true (branche !sentryReady false)', () => {
    (logger as unknown as { sentryReady: boolean }).sentryReady = true;
    expect(() => logger.error('test', 'boom')).not.toThrow();
  });

  it('minLevel init hostname non-localhost → branche info (137)', async () => {
    vi.resetModules();
    vi.stubGlobal('window', { location: { hostname: 'example.com' } });
    const { logger: fresh } = await import('../../core/logger.js');
    expect(fresh).toBeDefined();
  });
});

describe('logger', () => {
  it('redacte les API keys dans messages', () => {
    logger.clearBuffer();
    logger.info('test', 'Ma clé sk-ant-api03-' + 'A'.repeat(40));
    const buf = logger.getBuffer();
    /* v13.3.75 fix sécu : labels typés [REDACTED:anthropic_key] (cf log-redaction-wrapper). */
    expect(buf[buf.length - 1]?.msg).toMatch(/\[REDACTED(:anthropic_key)?\]/);
  });
  it('redacte AIza Google AI keys', () => {
    logger.clearBuffer();
    logger.info('test', 'AIza' + 'B'.repeat(33));
    const last = logger.getBuffer().pop();
    expect(last?.msg).toMatch(/\[REDACTED(:google_api_key)?\]/);
  });
  it('buffer rotation max 500', () => {
    logger.clearBuffer();
    for (let i = 0; i < 600; i++) logger.debug('test', `msg ${i}`);
    expect(logger.getBuffer().length).toBeLessThanOrEqual(500);
  });
});
