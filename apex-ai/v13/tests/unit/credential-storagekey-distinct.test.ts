import { describe, it, expect } from 'vitest';
import { CREDENTIAL_PATTERNS, detectAllCredentials } from '../../services/vault/credential-patterns.js';

describe('credential-patterns storageKey distinct (v13.4.6)', () => {
  it('aucun storageKey dupliqué (sauf __FORBIDDEN_SEED__)', () => {
    const counts: Record<string, number> = {};
    for (const p of CREDENTIAL_PATTERNS) counts[p.storageKey] = (counts[p.storageKey] ?? 0) + 1;
    const dups = Object.entries(counts).filter(([k, n]) => n > 1 && k !== '__FORBIDDEN_SEED__');
    expect(dups).toEqual([]);
  });
  it('GitHub Fine vs Classic distincts', () => {
    const c = CREDENTIAL_PATTERNS.find((p) => p.name === 'GitHub PAT classic');
    const f = CREDENTIAL_PATTERNS.find((p) => p.name === 'GitHub Fine-grained');
    expect(c?.storageKey).toBe('ax_github_pat_classic');
    expect(f?.storageKey).toBe('ax_github_pat_finegrained');
  });
  it('OpenAI legacy vs Project distincts', () => {
    const l = CREDENTIAL_PATTERNS.find((p) => p.name === 'OpenAI');
    const p = CREDENTIAL_PATTERNS.find((p) => p.name === 'OpenAI Project');
    expect(l?.storageKey).toBe('ax_openai_key');
    expect(p?.storageKey).toBe('ax_openai_key_proj');
  });
  it('ghp_<36> → classic', () => {
    const d = detectAllCredentials('ghp_' + 'A'.repeat(36));
    const g = d.find((x) => x.pattern.name.startsWith('GitHub'));
    expect(g?.pattern.storageKey).toBe('ax_github_pat_classic');
  });
  it('github_pat_<82> → fine', () => {
    const d = detectAllCredentials('github_pat_' + 'A'.repeat(82));
    const g = d.find((x) => x.pattern.name.startsWith('GitHub'));
    expect(g?.pattern.storageKey).toBe('ax_github_pat_finegrained');
  });
  it('sk-proj-<40> → OpenAI Project', () => {
    const d = detectAllCredentials('sk-proj-' + 'A'.repeat(40));
    const o = d.find((x) => x.pattern.name.startsWith('OpenAI'));
    expect(o?.pattern.storageKey).toBe('ax_openai_key_proj');
  });
  it('sk-<45> non-proj → OpenAI legacy', () => {
    const d = detectAllCredentials('sk-' + 'A'.repeat(45));
    const o = d.find((x) => x.pattern.name.startsWith('OpenAI'));
    expect(o?.pattern.storageKey).toBe('ax_openai_key');
  });
});
