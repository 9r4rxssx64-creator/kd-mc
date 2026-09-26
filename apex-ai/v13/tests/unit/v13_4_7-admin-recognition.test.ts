import { describe, it, expect, beforeEach } from 'vitest';
import { memory } from '../../core/memory.js';

describe('v13.4.7 — Admin Kevin reconnaissance + wake word', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('buildSystemPromptContext inclut section ADMIN ABSOLU pour kdmc_admin', () => {
    const prompt = memory.buildSystemPromptContext({ id: 'kdmc_admin', name: 'Kevin (DK)' });
    expect(prompt).toContain('KEVIN DESARZENS');
    expect(prompt).toContain('ADMIN ABSOLU');
    expect(prompt).toContain('JAMAIS dire');
    expect(prompt).toContain('AUTONOMIE');
  });

  it('buildSystemPromptContext n\'inclut PAS section ADMIN ABSOLU pour non-admin', () => {
    const prompt = memory.buildSystemPromptContext({ id: 'laurence_sp', name: 'Laurence' });
    expect(prompt).not.toContain('ADMIN ABSOLU');
    expect(prompt).toContain('Laurence');
  });

  it('buildSystemPromptContext gère null user (boot précoce)', () => {
    const prompt = memory.buildSystemPromptContext(null);
    expect(prompt).toContain('APEX v13');
    expect(prompt).not.toContain('ADMIN ABSOLU');
  });

  it('section admin instruit l\'IA de ne pas redemander confirmation', () => {
    const prompt = memory.buildSystemPromptContext({ id: 'kdmc_admin', name: 'Kevin (DK)' });
    expect(prompt).toMatch(/JAMAIS dire.*action admin/i);
    expect(prompt).toMatch(/sans demander confirmation/i);
  });
});
