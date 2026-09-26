/**
 * Tests features/onboarding/index.ts (premier login flow 5 steps).
 * v13.3.41 (mission INNOVATION-COMM).
 */
import { describe, it, expect, beforeEach } from 'vitest';

import { isOnboardingNeeded, markOnboardingDone } from '../../features/onboarding/index.js';

describe('features/onboarding — premier login flow', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('retourne false si uid null (pas de session)', () => {
    expect(isOnboardingNeeded(null)).toBe(false);
  });

  it("admin Kevin (kdmc_admin) skip auto onboarding", () => {
    expect(isOnboardingNeeded('kdmc_admin')).toBe(false);
  });

  it('user normal sans done flag → needed', () => {
    expect(isOnboardingNeeded('user_laurence')).toBe(true);
  });

  it('user avec done=true → skip', () => {
    localStorage.setItem('apex_v13_onboarding_done_user_x', 'true');
    expect(isOnboardingNeeded('user_x')).toBe(false);
  });

  it('markOnboardingDone persiste flag localStorage', () => {
    markOnboardingDone('user_test');
    const flag = localStorage.getItem('apex_v13_onboarding_done_user_test');
    expect(flag).toBe('true');
  });

  it('après markOnboardingDone, isOnboardingNeeded retourne false', () => {
    expect(isOnboardingNeeded('user_y')).toBe(true);
    markOnboardingDone('user_y');
    expect(isOnboardingNeeded('user_y')).toBe(false);
  });
});
