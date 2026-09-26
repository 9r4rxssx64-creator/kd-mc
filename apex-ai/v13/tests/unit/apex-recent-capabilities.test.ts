/**
 * APEX v13.4.4 — Tests apex-recent-capabilities registry.
 */

import { describe, it, expect } from 'vitest';

import {
  APEX_RECENT_CAPABILITIES,
  renderRecentCapabilitiesForPrompt,
  listServicesByVersion,
  getRegisteredServiceIds,
} from '../../data/apex-recent-capabilities.js';

describe('apex-recent-capabilities v13.4.4', () => {
  it('contient au moins 15 entries (v13.4.0 → v13.4.4)', () => {
    expect(APEX_RECENT_CAPABILITIES.length).toBeGreaterThanOrEqual(15);
  });

  it('toutes les versions v13.4.x présentes', () => {
    const versions = new Set(APEX_RECENT_CAPABILITIES.map((c) => c.version));
    expect(versions.has('v13.4.0')).toBe(true);
    expect(versions.has('v13.4.1')).toBe(true);
    expect(versions.has('v13.4.2')).toBe(true);
    expect(versions.has('v13.4.3')).toBe(true);
    expect(versions.has('v13.4.4')).toBe(true);
    expect(versions.has('v13.4.5')).toBe(true);
  });

  it('renderRecentCapabilitiesForPrompt renvoie string concise', () => {
    const txt = renderRecentCapabilitiesForPrompt(2000);
    expect(txt).toMatch(/capacités récentes/i);
    expect(txt.length).toBeLessThanOrEqual(2000);
  });

  it('listServicesByVersion filtre correctement', () => {
    const v13_4_4 = listServicesByVersion('v13.4.4');
    expect(v13_4_4.length).toBeGreaterThanOrEqual(5);
    v13_4_4.forEach((c) => expect(c.version).toBe('v13.4.4'));
  });

  it('getRegisteredServiceIds renvoie unique-ish', () => {
    const ids = getRegisteredServiceIds();
    expect(ids.length).toBeGreaterThanOrEqual(15);
    expect(ids).toContain('rules-engine');
    expect(ids).toContain('no-regression-watch');
  });
});
