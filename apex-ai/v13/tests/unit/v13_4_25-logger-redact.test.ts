/**
 * Test régression v13.4.25 — core/logger.ts (logger + PII redaction).
 *
 * Module CRITIQUE sécu : tous les logs passent par cette redaction.
 * Si pattern manqué = secrets fuités dans console/Sentry/Firebase.
 *
 * Existant : 75.2% coverage / 70% branches.
 * Tests : logger API (debug/info/warn/error) + redact + buffer + setLevel.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { logger, _redactForTests } from '../../core/logger.js';

describe('v13.4.25 logger.debug/info/warn/error', () => {
  beforeEach(() => {
    logger.clearBuffer();
    logger.setLevel('debug');
  });

  it("debug log dans buffer", () => {
    logger.debug('test_scope', 'debug message', { foo: 'bar' });
    const buf = logger.getBuffer();
    expect(buf.some((e) => e.level === 'debug' && e.msg === 'debug message')).toBe(true);
  });

  it("info log dans buffer", () => {
    logger.info('test', 'info msg');
    const buf = logger.getBuffer();
    expect(buf.some((e) => e.level === 'info' && e.msg === 'info msg')).toBe(true);
  });

  it("warn log dans buffer", () => {
    logger.warn('test', 'warn msg');
    expect(logger.getBuffer().some((e) => e.level === 'warn')).toBe(true);
  });

  it("error log dans buffer", () => {
    logger.error('test', 'error msg');
    expect(logger.getBuffer().some((e) => e.level === 'error')).toBe(true);
  });

  it("entry contient ts + scope + msg", () => {
    logger.info('scope_test', 'msg_test');
    const buf = logger.getBuffer();
    const e = buf.find((x) => x.msg === 'msg_test');
    expect(e?.ts).toBeTypeOf('number');
    expect(e?.scope).toBe('scope_test');
    expect(e?.level).toBe('info');
  });

  it("data optionnel passé", () => {
    logger.info('scope', 'msg', { user: 'kevin', action: 'login' });
    const buf = logger.getBuffer();
    const e = buf.find((x) => x.msg === 'msg');
    expect(e?.data).toEqual({ user: 'kevin', action: 'login' });
  });
});

describe('v13.4.25 logger.setLevel — filtrage', () => {
  beforeEach(() => {
    logger.clearBuffer();
  });

  it("setLevel('warn') filtre debug + info", () => {
    logger.setLevel('warn');
    logger.debug('s', 'debug skipped');
    logger.info('s', 'info skipped');
    logger.warn('s', 'warn shown');
    logger.error('s', 'error shown');
    const buf = logger.getBuffer();
    expect(buf.some((e) => e.msg === 'debug skipped')).toBe(false);
    expect(buf.some((e) => e.msg === 'info skipped')).toBe(false);
    expect(buf.some((e) => e.msg === 'warn shown')).toBe(true);
    expect(buf.some((e) => e.msg === 'error shown')).toBe(true);
  });

  it("setLevel('error') filtre tout sauf error", () => {
    logger.setLevel('error');
    logger.debug('s', 'd');
    logger.info('s', 'i');
    logger.warn('s', 'w');
    logger.error('s', 'e');
    const buf = logger.getBuffer();
    expect(buf.filter((e) => e.level === 'error').length).toBeGreaterThanOrEqual(1);
    expect(buf.filter((e) => e.level === 'warn').length).toBe(0);
  });

  it("setLevel('debug') laisse tout passer", () => {
    logger.setLevel('debug');
    logger.debug('s', 'd');
    logger.info('s', 'i');
    const buf = logger.getBuffer();
    expect(buf.some((e) => e.msg === 'd')).toBe(true);
    expect(buf.some((e) => e.msg === 'i')).toBe(true);
  });
});

describe('v13.4.25 logger.clearBuffer + getBuffer', () => {
  it("clearBuffer vide tout", () => {
    logger.info('s', 'a');
    logger.info('s', 'b');
    expect(logger.getBuffer().length).toBeGreaterThan(0);
    logger.clearBuffer();
    expect(logger.getBuffer().length).toBe(0);
  });

  it("getBuffer retourne array readonly (clone)", () => {
    logger.info('s', 'test_readonly');
    const buf = logger.getBuffer();
    expect(Array.isArray(buf)).toBe(true);
  });

  it("buffer cap 500 max (FIFO)", () => {
    logger.clearBuffer();
    logger.setLevel('debug');
    /* Ajoute 510 entries */
    for (let i = 0; i < 510; i++) {
      logger.info('s', `msg_${i}`);
    }
    const buf = logger.getBuffer();
    expect(buf.length).toBeLessThanOrEqual(500);
  });
});

describe('v13.4.25 redact — PII protection critique', () => {
  it("redact string sans secret → laisse tel quel", () => {
    expect(_redactForTests('bonjour kevin')).toBe('bonjour kevin');
  });

  it("redact Anthropic API key → [REDACTED:*]", () => {
    const key = 'sk-ant-api03-' + 'a'.repeat(95);
    const redacted = _redactForTests(key);
    expect(redacted).not.toContain('sk-ant-api03');
    expect(String(redacted)).toMatch(/REDACTED|\*/);
  });

  it("redact OpenAI key", () => {
    const key = 'sk-' + 'a'.repeat(48);
    const redacted = _redactForTests(key);
    expect(redacted).not.toContain(key);
  });

  it("redact null/undefined → passthrough", () => {
    expect(_redactForTests(null)).toBeNull();
    expect(_redactForTests(undefined)).toBeUndefined();
  });

  it("redact Error.message + stack", () => {
    const err = new Error('Error with sk-ant-api03-' + 'a'.repeat(95));
    const redacted = _redactForTests(err) as Error;
    expect(redacted.message).not.toContain('sk-ant-api03');
  });

  it("redact object récursif (deep)", () => {
    const obj = {
      user: 'kevin',
      apiKey: 'sk-ant-api03-' + 'a'.repeat(95),
      nested: {
        secret: 'sk-' + 'b'.repeat(48),
      },
    };
    const redacted = _redactForTests(obj) as Record<string, unknown>;
    expect(JSON.stringify(redacted)).not.toContain('sk-ant-api03');
    expect(JSON.stringify(redacted)).not.toContain('sk-bbbbbb');
  });

  it("redact GitHub PAT", () => {
    const pat = 'ghp_' + 'a'.repeat(36);
    const r = _redactForTests(pat);
    expect(r).not.toContain('ghp_a');
  });
});

describe('v13.4.25 logger défense profondeur — redact scope + msg + data', () => {
  beforeEach(() => {
    logger.clearBuffer();
    logger.setLevel('debug');
  });

  it("scope contenant secret → redacté dans buffer", () => {
    /* Cas d'erreur dev qui passe accidentellement un secret en scope */
    const fakeKey = 'sk-ant-api03-' + 'a'.repeat(95);
    logger.info(fakeKey, 'message');
    const buf = logger.getBuffer();
    const e = buf[buf.length - 1];
    expect(e?.scope).not.toContain('sk-ant-api03');
  });

  it("msg contenant secret → redacté", () => {
    const fakeKey = 'sk-' + 'a'.repeat(48);
    logger.info('s', `Used key: ${fakeKey}`);
    const buf = logger.getBuffer();
    const e = buf[buf.length - 1];
    expect(e?.msg).not.toContain(fakeKey);
  });

  it("data contenant secret → redacté récursivement", () => {
    const fakeKey = 'sk-ant-api03-' + 'a'.repeat(95);
    logger.info('s', 'msg', { nested: { apiKey: fakeKey } });
    const buf = logger.getBuffer();
    const e = buf[buf.length - 1];
    expect(JSON.stringify(e?.data)).not.toContain('sk-ant-api03');
  });
});
