/**
 * suggestions — couverture branches restantes (campagne 100% réel, 2026-06-02).
 * Couvre les catch localStorage de isFollowUpsEnabled / setFollowUpsEnabled.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

import { isFollowUpsEnabled, setFollowUpsEnabled } from '../../services/ai/suggestions.js';

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

describe('suggestions — follow-ups toggle', () => {
  it('isFollowUpsEnabled : "1" → true', () => {
    localStorage.setItem('apex_v13_followups_enabled', '1');
    expect(isFollowUpsEnabled()).toBe(true);
  });

  it('isFollowUpsEnabled : absent → false (default OFF)', () => {
    expect(isFollowUpsEnabled()).toBe(false);
  });

  it('isFollowUpsEnabled : getItem throw → catch → false', () => {
    const spy = vi.spyOn(localStorage, 'getItem').mockImplementation(() => { throw new Error('ls'); });
    expect(isFollowUpsEnabled()).toBe(false);
    spy.mockRestore();
  });

  it('setFollowUpsEnabled : persiste "1"/"0"', () => {
    setFollowUpsEnabled(true);
    expect(localStorage.getItem('apex_v13_followups_enabled')).toBe('1');
    setFollowUpsEnabled(false);
    expect(localStorage.getItem('apex_v13_followups_enabled')).toBe('0');
  });

  it('setFollowUpsEnabled : setItem throw → catch (pas de crash)', () => {
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    expect(() => setFollowUpsEnabled(true)).not.toThrow();
    spy.mockRestore();
  });
});
