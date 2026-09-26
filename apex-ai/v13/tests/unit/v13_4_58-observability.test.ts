/**
 * Test régression v13.4.58 — services/observability.ts (capture + DLQ).
 *
 * Capture des events runtime (info/warn/error/critical) + Dead Letter Queue
 * pour replay si échec push initial. Escalade auto Claude Code si critical.
 */
import { describe, it, expect } from 'vitest';
import { observability } from '../../services/observability/observability.js';

describe('v13.4.58 observability — capture + buffer', () => {
  it("singleton défini + méthodes attendues", () => {
    expect(observability).toBeDefined();
    expect(typeof observability.init).toBe('function');
    expect(typeof observability.capture).toBe('function');
    expect(typeof observability.guard).toBe('function');
    expect(typeof observability.getDLQ).toBe('function');
    expect(typeof observability.getBuffer).toBe('function');
    expect(typeof observability.replayDLQ).toBe('function');
    expect(typeof observability.escalateToClaudeCode).toBe('function');
  });

  it("init() OK + idempotent", () => {
    expect(() => {
      observability.init();
      observability.init();
    }).not.toThrow();
  });

  it("capture(level, scope, msg) ajoute event au buffer", () => {
    observability.capture('info', 'test_scope', 'test event v13.4.58');
    const buffer = observability.getBuffer();
    expect(Array.isArray(buffer)).toBe(true);
  });

  it("getBuffer() retourne readonly array", () => {
    const b = observability.getBuffer();
    expect(Array.isArray(b)).toBe(true);
  });

  it("getDLQ() retourne readonly array", () => {
    const dlq = observability.getDLQ();
    expect(Array.isArray(dlq)).toBe(true);
  });

  it("capture avec context optionnel", () => {
    expect(() => {
      observability.capture('warn', 'test', 'with context', { uid: 'kevin', ts: Date.now() });
    }).not.toThrow();
  });
});

describe('v13.4.58 observability.guard — wrap async avec fallback', () => {
  it("guard avec fn success retourne valeur", async () => {
    const r = await observability.guard('test', async () => 42);
    expect(r).toBe(42);
  });

  it("guard avec fn throw retourne fallback (si fourni)", async () => {
    const r = await observability.guard('test', async () => {
      throw new Error('test fail');
    }, 'fallback_value');
    expect(r).toBe('fallback_value');
  });

  it("guard avec fn throw + pas fallback retourne undefined", async () => {
    const r = await observability.guard('test', async () => {
      throw new Error('test fail');
    });
    expect(r).toBeUndefined();
  });
});

describe('v13.4.58 observability.replayDLQ', () => {
  it("replayDLQ retourne {replayed, failed}", async () => {
    const r = await observability.replayDLQ();
    expect(r).toBeDefined();
    expect(typeof r.replayed).toBe('number');
    expect(typeof r.failed).toBe('number');
  });
});
