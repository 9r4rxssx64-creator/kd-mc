import { describe, it, expect } from 'vitest';
import { detectCredential } from '../../services/vault/credential-patterns.js';

describe('PATs Kevin réels — anti-confusion', () => {
  it('ghp_ + 36 chars → classic (pas fine-grained)', () => {
    /* Test PAT classic format (ghp_ + 36 chars = 40 total).
     * Le vrai PAT Kevin est jamais committé (secret scanning protection). */
    const fakeClassic = 'ghp_' + 'A'.repeat(36);
    const r = detectCredential(fakeClassic);
    expect(r?.name).toBe('GitHub PAT classic');
    expect(r?.storageKey).toBe('ax_github_pat_classic');
  });
  it('github_pat_11...92chars → fine-grained', () => {
    const fg = 'github_pat_11' + 'A'.repeat(82);
    const r = detectCredential(fg);
    expect(r?.name).toBe('GitHub Fine-grained');
    expect(r?.storageKey).toBe('ax_github_pat_finegrained');
  });
});
