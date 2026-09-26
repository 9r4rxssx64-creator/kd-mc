/* eslint-disable no-script-url -- tests vérifient explicitement le blocage de ce schéma */
/**
 * Tests ios-simulator.ts (Kevin v13.4.3 — Shubham Skill #5).
 */
import { describe, it, expect, beforeEach } from 'vitest';

import { iosSimulator } from '../../services/integrations/ios-simulator.js';

describe('iOS Simulator (Shubham Skill)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('previewURL retourne wrapper iPhone avec iframe src', () => {
    const wrapper = iosSimulator.previewURL('https://example.com');
    expect(wrapper).toContain('<iframe');
    expect(wrapper).toContain('https://example.com');
    expect(wrapper).toContain('ax-ios-sim');
  });

  it('refuse URL non-http', () => {
    expect(() => iosSimulator.previewURL('javascript:alert(1)')).toThrow(/URL/);
  });
});
