import { describe, it, expect, beforeEach } from 'vitest';
import { sentinels, registerCoreSentinels } from '../../services/sentinels/sentinels.js';

describe('sentinels', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  it('register core 13 sentinels', () => {
    registerCoreSentinels();
    const list = sentinels.list();
    expect(list.length).toBeGreaterThanOrEqual(13);
    const ids = list.map((s) => s.id);
    expect(ids).toContain('token-balance-watch');
    expect(ids).toContain('error-watch');
    expect(ids).toContain('backup-watch');
    expect(ids).toContain('credentials-watch');
    expect(ids).toContain('link-validation-watch');
  });
  it('Jet 8.1 : 13 sentinels actives + 1 disabled wake-watch (incluant agent-watches-runner)', () => {
    registerCoreSentinels();
    const list = sentinels.list();
    const active = list.filter((s) => s.enabled);
    const disabled = list.filter((s) => !s.enabled);
    expect(active.length).toBeGreaterThanOrEqual(13);
    expect(disabled.length).toBeGreaterThanOrEqual(1);
    expect(disabled[0]?.id).toBe('wake-watch');
  });
  it('Jet 5 : sentinelles avec auto-fix ≥ 3', () => {
    registerCoreSentinels();
    const list = sentinels.list();
    const withAutoFix = list.filter((s) => s.autoFix !== undefined);
    expect(withAutoFix.length).toBeGreaterThanOrEqual(3);
  });
  it('runOne sentinel executes check', async () => {
    registerCoreSentinels();
    const result = await sentinels.runOne('credentials-watch');
    expect(result?.ts).toBeGreaterThan(0);
    expect(typeof result?.msg).toBe('string');
  });
  it('enable/disable toggle', () => {
    registerCoreSentinels();
    sentinels.enable('error-watch', false);
    const s = sentinels.list().find((x) => x.id === 'error-watch');
    expect(s?.enabled).toBe(false);
  });
});
