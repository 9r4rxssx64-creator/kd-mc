/**
 * APEX v13 — Tests feature-guard.ts
 *
 * Coverage: guardFeatureEnabled, guardSentinelEnabled, guardFeatureBoot, guardToolEnabled.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const isFeatureEnabledMock = vi.fn();
const renderDisabledNoticeMock = vi.fn(
  (id: string) => `<div data-disabled-feature="${id}">disabled</div>`,
);

vi.mock('../../services/auth/feature-toggles.js', () => ({
  isFeatureEnabled: (...args: unknown[]) => isFeatureEnabledMock(...args),
  renderDisabledNotice: (...args: unknown[]) => renderDisabledNoticeMock(...args),
}));

import {
  guardFeatureBoot,
  guardFeatureEnabled,
  guardSentinelEnabled,
  guardToolEnabled,
} from '../../services/auth/feature-guard.js';

beforeEach(() => {
  isFeatureEnabledMock.mockReset();
  renderDisabledNoticeMock.mockClear();
});

describe('feature-guard — guardFeatureEnabled', () => {
  it('feature ON → true, rootEl pas touché', () => {
    isFeatureEnabledMock.mockReturnValue(true);
    const root = document.createElement('div');
    root.innerHTML = 'normal content';
    const r = guardFeatureEnabled('studio.music', root, 'user-1');
    expect(r).toBe(true);
    expect(root.innerHTML).toBe('normal content');
  });

  it('feature OFF → false + notice rendue', () => {
    isFeatureEnabledMock.mockReturnValue(false);
    const root = document.createElement('div');
    const r = guardFeatureEnabled('studio.music', root, 'user-1');
    expect(r).toBe(false);
    expect(root.innerHTML).toContain('disabled-feature');
    expect(root.innerHTML).toContain('studio.music');
  });

  it('feature OFF + customFallback → fallback custom utilisé', () => {
    isFeatureEnabledMock.mockReturnValue(false);
    const root = document.createElement('div');
    const r = guardFeatureEnabled('x.y', root, undefined, '<p>Custom OFF</p>');
    expect(r).toBe(false);
    expect(root.innerHTML).toBe('<p>Custom OFF</p>');
    expect(renderDisabledNoticeMock).not.toHaveBeenCalled();
  });

  it('userId optionnel propagé à isFeatureEnabled', () => {
    isFeatureEnabledMock.mockReturnValue(true);
    const root = document.createElement('div');
    guardFeatureEnabled('feat.x', root, 'kdmc_admin');
    expect(isFeatureEnabledMock).toHaveBeenCalledWith('feat.x', 'kdmc_admin');
  });

  it('erreur innerHTML capturée (sans throw)', () => {
    isFeatureEnabledMock.mockReturnValue(false);
    const root = {
      get innerHTML() {
        return '';
      },
      set innerHTML(_v: string) {
        throw new Error('DOM error');
      },
    } as unknown as HTMLElement;
    expect(() => guardFeatureEnabled('x', root)).not.toThrow();
  });
});

describe('feature-guard — guardSentinelEnabled', () => {
  it('sentinelle activée → true', () => {
    isFeatureEnabledMock.mockReturnValue(true);
    expect(guardSentinelEnabled('sentinel.token-watch')).toBe(true);
  });

  it('sentinelle désactivée → false', () => {
    isFeatureEnabledMock.mockReturnValue(false);
    expect(guardSentinelEnabled('sentinel.dead')).toBe(false);
  });

  it('appelle isFeatureEnabled SANS userId', () => {
    isFeatureEnabledMock.mockReturnValue(true);
    guardSentinelEnabled('sentinel.x');
    expect(isFeatureEnabledMock).toHaveBeenCalledWith('sentinel.x');
  });
});

describe('feature-guard — guardFeatureBoot', () => {
  it('feature ON → true', () => {
    isFeatureEnabledMock.mockReturnValue(true);
    expect(guardFeatureBoot('feature.realtime-backup')).toBe(true);
  });

  it('feature OFF → false', () => {
    isFeatureEnabledMock.mockReturnValue(false);
    expect(guardFeatureBoot('feature.x')).toBe(false);
  });
});

describe('feature-guard — guardToolEnabled', () => {
  it('tool ON → null (pas d\'erreur)', () => {
    isFeatureEnabledMock.mockReturnValue(true);
    expect(guardToolEnabled('tool.web_search')).toBeNull();
  });

  it('tool OFF → object avec message d\'erreur', () => {
    isFeatureEnabledMock.mockReturnValue(false);
    const r = guardToolEnabled('tool.web_search', 'user-1');
    expect(r).not.toBeNull();
    expect(r?.error).toContain('tool.web_search');
    expect(r?.error).toContain('désactivé');
  });

  it('userId propagé', () => {
    isFeatureEnabledMock.mockReturnValue(true);
    guardToolEnabled('tool.x', 'kdmc_admin');
    expect(isFeatureEnabledMock).toHaveBeenCalledWith('tool.x', 'kdmc_admin');
  });

  it('sans userId → appelé avec undefined', () => {
    isFeatureEnabledMock.mockReturnValue(true);
    guardToolEnabled('tool.x');
    expect(isFeatureEnabledMock).toHaveBeenCalledWith('tool.x', undefined);
  });
});
