import { describe, it, expect, beforeEach } from 'vitest';
import { observability } from '../../services/observability/observability.js';

describe('observability.escalateToClaudeCode', () => {
  beforeEach(() => {
    localStorage.clear();
    observability.init();
  });
  it('escalade push réussit', async () => {
    const ok = await observability.escalateToClaudeCode('test reason', 'critical', { foo: 'bar' });
    expect(ok).toBe(true);
    const todos = JSON.parse(localStorage.getItem('ax_claude_todo') ?? '[]');
    expect(todos.length).toBe(1);
    expect(todos[0].reason).toBe('test reason');
  });
  it('rate-limit après 5 escalades en 10min', async () => {
    for (let i = 0; i < 5; i++) {
      await observability.escalateToClaudeCode(`reason ${i}`, 'warn', {});
    }
    const ok = await observability.escalateToClaudeCode('rate limited', 'critical', {});
    expect(ok).toBe(false);
  });
});
